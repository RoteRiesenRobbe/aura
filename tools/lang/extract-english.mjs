#!/usr/bin/env node
// extract-english.mjs - move inline English out of the content JSON into
// api/lang/en/*.arb (plan-localization.md D27). The content JSON keeps
// structure and ids; its English lives in the ARB, with a translator note
// (D18). Replaces tag-dialogue.mjs.
//
//   node tools/lang/extract-english.mjs          # extract in place
//   node tools/lang/extract-english.mjs --check  # exit 1 if any inline text is left
//
// Write English inline as a draft (a quest title, a journal, a dialogue line,
// a skill description, ...), then run this. It:
//   - mints a readable slug for every dialogue line, option and grant line
//     without one (D27), or names the shared phrase when the English matches
//     one exactly (D28);
//   - writes each text into its domain's English ARB, adding the note when the
//     key is new, replacing the text when it changed;
//   - strips the text from the JSON, editing the file at its token positions
//     so it differs by the edit alone;
//   - adds the English name a new mob or skill derives ("AlphaWolf" → "Alpha
//     Wolf") when the ARB has none yet.
// An existing id is never changed: renaming one is the content editor's
// re-slug, which moves the key in every locale (L23).
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { arbOf, formatArb, JsonEdits, keys, newMeta, notes, npcSlugs, numberPlaceholders, parseArb, parseWithSpans, slugify, spaced, STOCK_PREFIX, textFields } from './content-text.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function jsonFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...jsonFiles(full));
    else if (name.endsWith('.json')) out.push(full);
  }
  return out.sort();
}

/** The content files per domain, with the ARB each one's English lives in. */
export function contentFiles(root) {
  return [
    ...jsonFiles(join(root, 'api', 'quests')).map((f) => ({ f, domain: 'quest', arb: 'quests' })),
    ...jsonFiles(join(root, 'api', 'mobs')).map((f) => ({ f, domain: 'mob', arb: 'mobs' })),
    ...jsonFiles(join(root, 'api', 'skills')).map((f) => ({ f, domain: 'skill', arb: 'skills' })),
    { f: join(root, 'api', 'regions', 'regions.json'), domain: 'regions', arb: 'regions' },
    ...jsonFiles(join(root, 'api', 'appearance')).map((f) => ({ f, domain: 'appearance', arb: 'appearance' })),
  ];
}

/** The shared phrases (D28): their English → name, from en/conversations.arb's `stock.*` keys. */
export function stockByText(conversationsArb) {
  const out = new Map();
  for (const [k, v] of conversationsArb.entries) {
    if (k.startsWith(STOCK_PREFIX)) out.set(v.text, k.slice(STOCK_PREFIX.length));
  }
  return out;
}

/**
 * Extracts one file's inline English. `arbs` maps a domain file name to its
 * parsed ARB, mutated in place; each key goes to the file its kind lives in
 * (arbOf: a mob's dialogue is not in mobs.arb). Returns {text, changes,
 * problems}: the new file text (unchanged when nothing was inline) and what
 * happened.
 */
export function extractFile(source, domain, arbs, arbName) {
  const parsed = parseWithSpans(source);
  const raw = parsed.v;
  const arb = arbs[arbName].entries;
  const stock = stockByText(arbs.conversations);
  const edits = new JsonEdits(source);
  const changes = [];
  const problems = [];
  const taken = domain === 'mob' ? npcSlugs(raw) : new Set();

  // A new key gets its whole metadata (note, placeholders, limit); a changed
  // text keeps its (maybe hand-reworded) note and limit, its placeholders follow the text.
  const write = (key, english, field) => {
    const target = arbs[arbOf(key)].entries;
    const have = target.get(key);
    const fresh = newMeta(field, english);
    if (!have) {
      target.set(key, { text: english, meta: fresh });
      changes.push(`+ ${key}`);
    } else if (have.text !== english) {
      const meta = { ...(have.meta || fresh) };
      if (fresh.placeholders) meta.placeholders = fresh.placeholders; else delete meta.placeholders;
      target.set(key, { text: english, meta });
      changes.push(`~ ${key}`);
    }
  };

  // Names a new mob or skill derives, when the ARB has none yet (D24, D27).
  if (domain === 'mob' && raw.name && !arb.has(keys.mobName(raw.name))) {
    write(keys.mobName(raw.name), spaced(raw.name), { note: notes.mobName(raw.name), limit: 'mobName', mobName: true });
  }
  if (domain === 'skill' && raw.name && raw.displayName === undefined && !arb.has(keys.skillName(raw.name))) {
    write(keys.skillName(raw.name), spaced(raw.name), { note: notes.skillName(raw.name), limit: 'skillName' });
  }

  for (const field of textFields(domain, raw)) {
    if (field.text === undefined) continue;
    const span = parsed.at(field.path);
    if (field.text === '' && field.dialogue?.kind !== 'line') {
      edits.removeProperty(span, field.field); // an empty text is no text
      continue;
    }
    if (field.dialogue) {
      const d = field.dialogue;
      // Which reference the item ends up carrying: its own id, or a shared phrase.
      let ref;
      if (d.stock) {
        if (field.text !== (arbs.conversations.entries.get(field.key) || {}).text) {
          problems.push(`${field.path.join('.')}: names the shared phrase "${d.stock}" but says ${JSON.stringify(field.text)}; drop the text, or give the line its own id`);
          continue;
        }
        ref = { stock: d.stock };
      } else if (d.id) {
        ref = { id: d.id };
      } else if (stock.has(field.text)) {
        ref = { stock: stock.get(field.text), added: true };
        changes.push(`= ${field.path.join('.')} → shared phrase ${ref.stock}`);
      } else {
        const slug = slugify(field.text, taken);
        taken.add(slug);
        ref = { id: slug, added: true };
      }
      if (ref.id) write(keys.conversation(d.npc, ref.id), field.text, field);
      const [refKey, refValue] = ref.id ? ['id', ref.id] : ['stock', ref.stock];
      if (d.kind === 'line' && !span.props?.some((p) => p.key !== 'text')) {
        // A bare string or {text}: the whole line becomes its reference.
        edits.replaceValue(span, `{${JSON.stringify(refKey)}: ${JSON.stringify(refValue)}}`);
      } else { // anything else the item carries (a line's conditions) stays
        if (ref.added) edits.insertFirst(span, refKey, JSON.stringify(refValue));
        edits.removeProperty(span, field.field);
      }
      continue;
    }
    const key = field.key;
    const english = field.tracker ? numberPlaceholders(field.text) : field.text;
    write(key, english, field);
    edits.removeProperty(span, field.field);
  }
  return { text: edits.count ? edits.apply() : source, changes, problems };
}

function main() {
  const check = process.argv.includes('--check');
  const arbNames = ['mobs', 'conversations', 'quests', 'skills', 'regions', 'appearance'];
  const arbPath = (n) => join(ROOT, 'api', 'lang', 'en', `${n}.arb`);
  const arbs = Object.fromEntries(arbNames.map((n) => [n, parseArb(readFileSync(arbPath(n), 'utf8'))]));
  const before = Object.fromEntries(arbNames.map((n) => [n, formatArb('en', arbs[n].entries)]));

  let inline = 0;
  let failed = false;
  for (const { f, domain, arb } of contentFiles(ROOT)) {
    const source = readFileSync(f, 'utf8');
    const { text, changes, problems } = extractFile(source, domain, arbs, arb);
    const rel = relative(ROOT, f).split('\\').join('/');
    for (const p of problems) { console.error(`${rel}: ${p}`); failed = true; }
    if (text === source) continue;
    inline++;
    if (check) { console.error(`${rel}: inline English left (run node tools/lang/extract-english.mjs)`); continue; }
    writeFileSync(f, text);
    console.log(`${rel}: ${changes.length ? changes.join(', ') : 'text stripped'}`);
  }
  if (!check) {
    for (const n of arbNames) {
      const after = formatArb('en', arbs[n].entries);
      if (after !== before[n]) writeFileSync(arbPath(n), after);
    }
  }
  if (check && inline) failed = true;
  if (failed) process.exit(1);
  console.log(check ? 'no inline English left' : `${inline} file(s) extracted`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
