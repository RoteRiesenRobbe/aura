/**
 * The editor's text layer (plan-localization.md C5a, D25, D27, L23).
 *
 * The content JSON keeps structure and ids; its English lives in
 * api/lang/en/<domain>.arb. The editor still works on ONE object with its text
 * in it:
 *
 *   - hydrate(): on read, each text field is filled in from the English ARB,
 *     a tracker in the {n}/{m} form an author types, and every renameable id
 *     is remembered in a `_was` marker (the quest, its stages, an NPC's
 *     dialogue items);
 *   - planSave(): on save, a new dialogue line, option or grant line gets its
 *     slug (or names the shared phrase whose English it matches, D28), every
 *     text goes into the English ARB (a note when the key is new), a renamed id
 *     moves its keys in EVERY locale and the translated-from records (L23), the
 *     keys of deleted content are removed everywhere, and the JSON is stripped
 *     of text and markers. It returns the files to write; writeSave() writes
 *     them.
 *
 * ⚑ NODE ONLY: the browser reaches this through the server.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  formatArb, keys, newMeta, notes, npcSlugs, numberPlaceholders, parseArb, plainPlaceholders, slugify, spaced, STOCK_PREFIX, textFields,
} from '../lang/content-text.mjs';

/** The ARB a domain's English lives in. */
export const ARB_OF = { quest: 'quests', mob: 'mobs', skill: 'skills', regions: 'regions' };

/** Every locale's ARBs, translated-from records and allowlist, read fresh from api/lang. */
export function loadLang(root) {
  const dir = path.join(root, 'api', 'lang');
  const lang = { dir, locales: {} };
  for (const locale of readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)) {
    const ldir = path.join(dir, locale);
    const arbs = {};
    const records = {};
    for (const f of readdirSync(ldir)) {
      if (f.endsWith('.arb')) arbs[f.slice(0, -4)] = parseArb(readFileSync(path.join(ldir, f), 'utf8'));
      else if (f.endsWith('.translated-from.json')) records[f.slice(0, -'.translated-from.json'.length)] = JSON.parse(readFileSync(path.join(ldir, f), 'utf8'));
    }
    const allowPath = path.join(ldir, 'allowlist.json');
    const allow = existsSync(allowPath) ? JSON.parse(readFileSync(allowPath, 'utf8')) : undefined;
    lang.locales[locale] = { arbs, records, allow };
  }
  return lang;
}

/** The English for a key, from any English ARB. */
export function english(lang, key) {
  for (const arb of Object.values(lang.locales.en.arbs)) {
    const e = arb.entries.get(key);
    if (e) return e.text;
  }
  return undefined;
}

/** The shared phrases (D28): name → English. */
export function sharedPhrases(lang) {
  const out = {};
  for (const [k, v] of lang.locales.en.arbs.mobs.entries) {
    if (k.startsWith(STOCK_PREFIX)) out[k.slice(STOCK_PREFIX.length)] = v.text;
  }
  return out;
}

const clone = (v) => JSON.parse(JSON.stringify(v));

function at(raw, p) {
  return p.reduce((o, k) => (o == null ? o : o[k]), raw);
}

/** The objects whose id a `_was` marker remembers: the root, quest stages, dialogue items. */
function renameables(domain, raw) {
  const out = [];
  if (domain === 'quest') {
    out.push({ obj: raw, idKey: 'id' });
    for (const s of raw.stages || []) out.push({ obj: s, idKey: 'id' });
  } else if (domain === 'mob' || domain === 'skill') {
    out.push({ obj: raw, idKey: 'name' });
  }
  return out;
}

/**
 * The editor's view of one content file: its text filled in from the English
 * ARB, `_was` markers on every renameable id. Lines become objects
 * ({id, text} or {stock, text}).
 */
export function hydrate(domain, diskRaw, lang) {
  const raw = clone(diskRaw);
  for (const f of textFields(domain, raw)) {
    const obj = at(raw, f.path);
    const isLine = f.dialogue && f.dialogue.kind === 'line';
    if (isLine && typeof obj !== 'object') continue; // an inline draft: leave it
    if (f.text !== undefined) continue; // inline text (a draft): the save extracts it
    const text = f.key ? english(lang, f.key) : undefined;
    if (f.dialogue && (f.dialogue.id || f.dialogue.stock)) obj._was = f.dialogue.id || undefined;
    if (text === undefined) continue;
    obj[f.field] = f.tracker ? plainPlaceholders(text) : text;
  }
  for (const { obj, idKey } of renameables(domain, raw)) obj._was = obj[idKey];
  // Only a hydrated object says what its text IS: an absent field means
  // deleted there, and unchanged on a stored object handed in as it is.
  raw._hydrated = true;
  return raw;
}

/** Strips text fields and markers: the JSON as it is stored (D27). */
function dehydrate(domain, raw) {
  const out = clone(raw);
  for (const f of textFields(domain, out)) {
    const obj = at(out, f.path);
    if (!obj || typeof obj !== 'object') continue;
    delete obj[f.field];
  }
  const strip = (v) => {
    if (Array.isArray(v)) v.forEach(strip);
    else if (v && typeof v === 'object') {
      delete v._was;
      delete v._hydrated;
      Object.values(v).forEach(strip);
    }
  };
  strip(out);
  return out;
}

/** The view with every remembered id put back, so its keys are the keys before the edit. */
function previousView(domain, raw) {
  const prev = clone(raw);
  for (const { obj, idKey } of renameables(domain, prev)) if (obj._was !== undefined) obj[idKey] = obj._was;
  for (const f of textFields(domain, prev)) {
    const obj = at(prev, f.path);
    if (f.dialogue && obj && typeof obj === 'object' && obj._was !== undefined && obj.id !== undefined) obj.id = obj._was;
  }
  return prev;
}

/**
 * Gives every dialogue item with text but no reference one: the shared phrase
 * its English matches exactly (D28), else a fresh slug unique within the NPC
 * (D27). An option or grant line whose text was emptied loses its id. Mutates
 * raw; returns the slugs it minted.
 */
export function mintIds(domain, raw, lang) {
  if (domain !== 'mob' || !raw.interaction) return [];
  const shared = new Map(Object.entries(sharedPhrases(lang)).map(([name, text]) => [text, name]));
  const taken = npcSlugs(raw);
  const minted = [];
  for (const f of textFields('mob', raw)) {
    if (!f.dialogue) continue;
    const obj = at(raw, f.path);
    if (!obj || typeof obj !== 'object') continue;
    const text = obj[f.field];
    if (!text) {
      if (f.dialogue.kind !== 'line') { delete obj.id; delete obj.stock; }
      continue;
    }
    if (obj.id || obj.stock) continue;
    const name = shared.get(text);
    if (name) {
      obj.stock = name;
    } else {
      obj.id = slugify(text, taken);
      taken.add(obj.id);
      minted.push(obj.id);
    }
  }
  return minted;
}

/**
 * Plans one save. `raw` is the editor's hydrated object (ids minted, see
 * mintIds), `diskRaw` the stored JSON it replaces (undefined for a new file).
 * Returns {raw, files, moved, removed}: the stripped JSON to store, the ARB and
 * record files to write ({absPath: content}), and the keys it moved or removed
 * in every locale. Nothing is written.
 */
export function planSave(domain, raw, diskRaw, lang) {
  const arbName = ARB_OF[domain];
  const en = lang.locales.en.arbs[arbName].entries;
  const touched = new Set(); // locale/arb or locale/record names to rewrite
  const moved = [];
  const removed = [];

  // 1. Renames (L23): a key built from an id moves with it, in every locale.
  const now = textFields(domain, raw);
  const before = textFields(domain, previousView(domain, raw));
  const renames = new Map();
  now.forEach((f, i) => {
    const prev = before[i] && before[i].key;
    if (prev && f.key && prev !== f.key && !prev.startsWith(STOCK_PREFIX)) renames.set(prev, f.key);
  });
  for (const [from, to] of renames) {
    if (!english(lang, from)) continue;
    moveKey(lang, from, to, touched);
    moved.push(`${from} → ${to}`);
  }

  // 2. The English, field by field.
  const kept = new Set();
  for (const f of now) {
    const obj = at(raw, f.path);
    if (!obj || typeof obj !== 'object' || !f.key) continue;
    const text = obj[f.field];
    if (text === undefined || text === '') continue;
    kept.add(f.key);
    if (f.dialogue && f.dialogue.stock) {
      const shared = lang.locales.en.arbs.mobs.entries;
      const have = shared.get(f.key);
      if (have && have.text !== text) { shared.set(f.key, { ...have, text }); touched.add('en/arb/mobs'); }
      continue;
    }
    const englishText = f.tracker ? numberPlaceholders(text) : text;
    const have = en.get(f.key);
    if (!have) {
      const meta = newMeta(f, englishText);
      en.set(f.key, { text: englishText, meta });
      touched.add(`en/arb/${arbName}`);
    } else if (have.text !== englishText) {
      const fresh = newMeta(f, englishText);
      const meta = { ...(have.meta || fresh) };
      if (fresh.placeholders) meta.placeholders = fresh.placeholders; else delete meta.placeholders;
      en.set(f.key, { text: englishText, meta });
      touched.add(`en/arb/${arbName}`);
    }
  }

  // 3. Deleted content: a key the file had and no longer has goes everywhere.
  if (diskRaw && raw._hydrated) {
    for (const f of textFields(domain, diskRaw)) {
      const key = renames.get(f.key) || f.key;
      if (!key || kept.has(key) || key.startsWith(STOCK_PREFIX) || !english(lang, key)) continue;
      if (domain === 'mob' && f.key === keys.mobName(diskRaw.name)) continue;
      removeKey(lang, key, touched);
      removed.push(key);
    }
  }

  const files = {};
  for (const t of touched) {
    const [locale, kind, name] = t.split('/');
    const ldir = path.join(lang.dir, locale);
    const loc = lang.locales[locale];
    if (kind === 'arb') files[path.join(ldir, `${name}.arb`)] = formatArb(locale, loc.arbs[name].entries);
    else if (kind === 'record') files[path.join(ldir, `${name}.translated-from.json`)] = sortedJson(loc.records[name]);
    else if (kind === 'allow') files[path.join(ldir, 'allowlist.json')] = JSON.stringify(loc.allow, null, 2) + '\n';
  }
  return { raw: dehydrate(domain, raw), files, moved, removed };
}

function sortedJson(obj) {
  return JSON.stringify(Object.fromEntries(Object.keys(obj).sort().map((k) => [k, obj[k]])), null, 2) + '\n';
}

function moveKey(lang, from, to, touched) {
  for (const [locale, loc] of Object.entries(lang.locales)) {
    for (const [name, arb] of Object.entries(loc.arbs)) {
      if (!arb.entries.has(from)) continue;
      if (arb.entries.has(to)) throw new Error(`cannot rename ${from} to ${to}: ${locale}/${name}.arb already has ${to}`);
      arb.entries.set(to, arb.entries.get(from));
      arb.entries.delete(from);
      touched.add(`${locale}/arb/${name}`);
    }
    for (const [name, rec] of Object.entries(loc.records)) {
      if (!(from in rec)) continue;
      rec[to] = rec[from];
      delete rec[from];
      touched.add(`${locale}/record/${name}`);
    }
    if (loc.allow && loc.allow.includes(from)) {
      loc.allow = loc.allow.map((k) => (k === from ? to : k));
      touched.add(`${locale}/allow/`);
    }
  }
}

function removeKey(lang, key, touched) {
  for (const [locale, loc] of Object.entries(lang.locales)) {
    for (const [name, arb] of Object.entries(loc.arbs)) {
      if (arb.entries.delete(key)) touched.add(`${locale}/arb/${name}`);
    }
    for (const [name, rec] of Object.entries(loc.records)) {
      if (key in rec) { delete rec[key]; touched.add(`${locale}/record/${name}`); }
    }
    if (loc.allow && loc.allow.includes(key)) {
      loc.allow = loc.allow.filter((k) => k !== key);
      touched.add(`${locale}/allow/`);
    }
  }
}

/** Writes a planned save's language files. */
export function writeSave(files) {
  for (const [abs, content] of Object.entries(files)) writeFileSync(abs, content, 'utf8');
}

/** The derived English name of a new mob or skill, when its ARB has none (D24). */
export function ensureName(domain, raw, lang) {
  if (domain === 'mob' && raw.name && !raw.displayName) raw.displayName = english(lang, keys.mobName(raw.name)) || spaced(raw.name);
  if (domain === 'skill' && raw.name && !raw.displayName) raw.displayName = english(lang, keys.skillName(raw.name)) || spaced(raw.name);
}

export { notes };
