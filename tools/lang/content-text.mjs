// content-text.mjs - the one JS home of the content-text rules
// (plan-localization.md C5a, D27-D29), shared by the extract tool
// (tools/lang/extract-english.mjs) and the content editor (server and browser),
// so the two can never word a note, spell a key, mint a slug or lay out an ARB
// differently. Go has its own copy of the key builders
// (backend/pkg/aura/lang/lang.go); tools/lang/testdata/keys.json pins that the
// two agree. Only JS writes ARB files (Go only reads them, D27).
//
// Pure: no filesystem, no Node built-ins, so a browser can import it.

// ------------------------------------------------------------------ keys (D29)

/** A shared phrase's key is this prefix plus its name (D28). */
export const STOCK_PREFIX = 'stock.';

/** Every content key: dotted parts, each id exactly as authored (D29, revised 2026-10-12). */
export const keys = {
  questTitle: (q) => `quest.${q}.title`,
  questJournal: (q, s) => `quest.${q}.${s}.journal`,
  questStageTracker: (q, s) => `quest.${q}.${s}.tracker`,
  questObjectiveTracker: (q, s, kind, target) => `quest.${q}.${s}.${kind}.${target}.tracker`,
  mobName: (mob) => `mob.${mob}.name`,
  skillName: (skill) => `skill.${skill}.name`,
  skillDescription: (skill) => `skill.${skill}.description`,
  regionTitle: (r) => `region.${r}.title`,
  regionSubtitle: (r) => `region.${r}.subtitle`,
  zoneName: (stem) => `zone.${stem}.name`,
  appearanceName: (item) => `appearance.${item}.name`,
  conversation: (npc, slug) => `conv.${npc}.${slug}`,
  stock: (name) => `${STOCK_PREFIX}${name}`,
};

/**
 * The English ARB (api/lang/en/<name>.arb) a content key lives in, by its first
 * part: Go's langDomains. The dialogue and the shared phrases have their own
 * file since 2026-10-15 (PO); a mob's name stays in mobs.
 */
export function arbOf(key) {
  const root = String(key).split('.')[0];
  return { quest: 'quests', mob: 'mobs', conv: 'conversations', stock: 'conversations', skill: 'skills', region: 'regions', zone: 'regions', appearance: 'appearance' }[root];
}

/** A content key: dot-separated parts of letters, digits, `-` and `_`, a letter first (D29). */
export const KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*(\.[A-Za-z0-9_-]+)*$/;

// ------------------------------------------------------------------ slugs (D27)

const SLUG_MAX_WORDS = 5;
const SLUG_MAX_LENGTH = 32;
const TRAILING_FILLER = new Set(['a', 'an', 'the', 'of', 'in', 'on', 'at', 'to', 'for', 'from', 'with', 'and', 'or', 'but', 'by']);
/** A slug, or a stock phrase name: lowercase ASCII words and digits joined by `-`. */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * A readable slug from a line's English (D27): its first words, lowercase
 * ASCII, punctuation dropped ("I'll" reads "ill"), at most five words and 32
 * characters, `-2`, `-3`, ... on a clash with `taken` (the NPC's ids in use).
 */
export function slugify(text, taken = new Set()) {
  const words = String(text)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  const picked = [];
  for (const w of words.slice(0, SLUG_MAX_WORDS)) {
    if ([...picked, w].join('-').length > SLUG_MAX_LENGTH) {
      if (!picked.length) picked.push(w.slice(0, SLUG_MAX_LENGTH));
      break;
    }
    picked.push(w);
  }
  // "about-the-rats-in-the" reads as cut off: a slug never ends on a filler word.
  while (picked.length > 1 && TRAILING_FILLER.has(picked[picked.length - 1])) picked.pop();
  let base = picked.join('-');
  if (!base) base = 'line';
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

// ------------------------------------------------------------ placeholders (D16)

const COUNTS = ['n', 'm'];

/** Authored `{n}`/`{m}` → the served `{n, number}` (D16). */
export function numberPlaceholders(text) {
  let out = text;
  for (const n of COUNTS) out = out.split(`{${n}}`).join(`{${n}, number}`);
  return out;
}

/** The reverse: what the content editor shows an author ("supports {n}/{m}"). */
export function plainPlaceholders(text) {
  let out = text;
  for (const n of COUNTS) out = out.split(`{${n}, number}`).join(`{${n}}`);
  return out;
}

/** A mob name's plural argument (D24), noted for translators (D18). */
export const MOB_NAME_COUNT = { type: 'int', description: 'How many: 1 on a nameplate or in a banner, the required count on a tracker line', example: '8' };

/**
 * A new key's ARB metadata: its note, the counts a tracker uses, a mob name's
 * plural argument, its length limit (D18, D24, D30).
 */
export function newMeta(field, english) {
  const meta = { description: field.note };
  if (field.limit && LENGTH_LIMITS[field.limit]) meta['x-maxLength'] = LENGTH_LIMITS[field.limit].max;
  const ph = field.tracker ? countPlaceholders(english) : field.mobName && mobNameForms(english) ? { count: MOB_NAME_COUNT } : undefined;
  if (ph) meta.placeholders = ph;
  return meta;
}

/** The plural forms of an English mob name (D24), or null for plain text. */
export function mobNameForms(text) {
  const m = /^\{count, plural, one \{([^{}]*)\} other \{([^{}]*)\}\}$/.exec(String(text));
  return m ? { one: m[1], other: m[2] } : null;
}

/** A mob name from its two inputs: plain when there is no plural (D24, D25). */
export function mobNameText(one, other) {
  return other ? `{count, plural, one {${one}} other {${other}}}` : one;
}

/** A tracker's placeholder notes (D18), only for the counts it uses. */
export function countPlaceholders(text) {
  const out = {};
  if (/\{n(, number)?\}/.test(text)) out.n = { type: 'int', description: 'Count done so far', example: '3' };
  if (/\{m(, number)?\}/.test(text)) out.m = { type: 'int', description: 'Count required', example: '8' };
  return Object.keys(out).length ? out : undefined;
}

// ------------------------------------------------------------------ notes (D18)

/**
 * Length limits per field kind (D30), in characters (a proxy: the face is
 * proportional). [PLACEHOLDER]s, measured from the longest current English and
 * German text (2026-10-11); the PO sets them. Each goes into the key's ARB
 * metadata as `x-maxLength` AND into its note, because platforms show the note.
 */
export const LENGTH_LIMITS = {
  mobName: { max: 26, where: 'it sits on the nameplate' },
  skillName: { max: 30, where: 'it sits on the ability bar and in the spellbook' },
  questTitle: { max: 30, where: 'it heads the quest tracker' },
  regionTitle: { max: 24, where: 'it is the region banner' },
};

/** The note's sentence for a limit. */
export function limitSentence(kind) {
  const l = LENGTH_LIMITS[kind];
  return l ? ` At most ${l.max} characters: ${l.where}.` : '';
}


/** "AlphaWolf" → "Alpha Wolf", for the notes' prose. */
export function spaced(name) {
  return String(name).replace(/(?!^)([A-Z])/g, ' $1');
}

/** The translator note for each field kind. A hand author may reword one. */
export const notes = {
  questTitle: (q) => `Quest title of "${q}", shown in the journal list and the tracker.` + limitSentence('questTitle'),
  questJournal: (q, s) => `Journal (diary) entry of quest "${q}", stage "${s}": written in the player's voice, first person.`,
  questStageTracker: (q, s) => `Tracker line of quest "${q}", stage "${s}": the one objective line shown under the quest title.`,
  questObjectiveTracker: (q, s, kind, target) => `Tracker line of one ${kind} objective (${spaced(target)}) in quest "${q}", stage "${s}". Write the whole line: articles, case and prepositions belong here (L8).`,
  mobName: (mob) => `Name of the ${mob} (nameplate, conversation header, quest lines). Nominative; never inflected by a template (D9/L8). Plain text, or with its plural forms as {count, plural, one {…} other {…}} (D24): a mob a kill or harvest quest counts needs them, and a translation may use every plural category its language has.` + limitSentence('mobName'),
  skillName: (skill) => `Name of the skill ${skill}: spellbook, ability bar, tooltip title, unlock banner.` + limitSentence('skillName'),
  skillDescription: (skill) => `Tooltip prose block of the skill ${skill}.`,
  regionTitle: (r) => `Region banner title of the place "${r}". Descriptive names translate, coined ones stay (style guide §4).` + limitSentence('regionTitle'),
  regionSubtitle: (title) => `Region banner subtitle under "${title}".`,
  zoneName: (stem) => `Name of the zone "${stem}", shown on the crossing curtain when no region names the arrival point.`,
  appearanceName: (item) => `Name of the look "${item}" (a portrait or a ring of the player's medallion), shown in the appearance picker.`,
  ambient: (npc) => `${spaced(npc)} calls this out to a player walking past (speech bubble).`,
  line: (npc, node, i) => `${spaced(npc)} speaks this in the conversation, node "${node}", line ${i + 1}.`,
  option: (npc, node) => `A row the player picks when talking to ${spaced(npc)} (node "${node}"), written as the player's own words.`,
  grant: (npc, optionText, node) => `${spaced(npc)} answers this when the player picks "${optionText}" (node "${node}").`,
  stock: (name) => `Shared phrase "${name}": every dialogue line that names it says this, so one edit changes all of them (D28).`,
};

// ------------------------------------------------------------- ARB files (D17)

/**
 * Parses an ARB file into {locale, entries}: entries maps each key to
 * {text, meta} (meta = its `@key` object, or undefined).
 */
export function parseArb(source) {
  const raw = JSON.parse(source);
  const entries = new Map();
  for (const [k, v] of Object.entries(raw)) {
    if (k.startsWith('@')) continue;
    entries.set(k, { text: v, meta: raw['@' + k] });
  }
  return { locale: raw['@@locale'], entries };
}

const META_ORDER = ['description', 'x-maxLength', 'placeholders'];
const PLACEHOLDER_ORDER = ['type', 'description', 'example'];

function ordered(obj, first) {
  const rest = Object.keys(obj).filter((k) => !first.includes(k)).sort();
  return [...first.filter((k) => k in obj), ...rest];
}

/**
 * The canonical ARB layout (pinned by tools/lang/testdata/canonical.arb, and
 * the one the Go generator wrote before C5a): `@@locale` first, then every key in
 * sorted order, each followed by its `@key` block when it has one; inside a
 * block `description`, `x-maxLength`, `placeholders` (one line per
 * placeholder), then any other attribute; LF, two-space indent, no HTML
 * escaping, a trailing newline.
 */
export function formatArb(locale, entries) {
  const lines = [`{\n  "@@locale": ${JSON.stringify(locale)}`];
  const sorted = [...entries.keys()].sort(compareKeys);
  for (const key of sorted) {
    const { text, meta } = entries.get(key);
    lines.push(`,\n  ${JSON.stringify(key)}: ${JSON.stringify(text)}`);
    if (!meta || Object.keys(meta).length === 0) continue;
    const parts = ordered(meta, META_ORDER).map((attr) => {
      if (attr === 'placeholders') {
        const ph = meta.placeholders;
        const items = Object.keys(ph).map((name) => {
          const p = ph[name];
          const fields = ordered(p, PLACEHOLDER_ORDER).map((f) => `${JSON.stringify(f)}: ${JSON.stringify(p[f])}`);
          return `\n      ${JSON.stringify(name)}: {${fields.join(', ')}}`;
        });
        return `\n    "placeholders": {${items.join(',')}\n    }`;
      }
      return `\n    ${JSON.stringify(attr)}: ${JSON.stringify(meta[attr])}`;
    });
    lines.push(`,\n  ${JSON.stringify('@' + key)}: {${parts.join(',')}\n  }`);
  }
  lines.push('\n}\n');
  return lines.join('');
}

/** Go's sort.Strings order: by UTF-16 code unit, which equals byte order for ASCII keys. */
function compareKeys(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

// --------------------------------------------- format-preserving JSON edits

/**
 * Parses JSON recording every value's span, so a file can be edited at token
 * positions and differ from the original by the edit alone (never
 * re-serialized). Each span: {path, start, end, kind, v, props?}; an object's
 * props are [{key, keyStart, valueStart, valueEnd}] in file order.
 */
export function parseWithSpans(text) {
  let i = 0;
  const spans = [];
  const ws = () => { while (i < text.length && /\s/.test(text[i])) i++; };
  const string = () => {
    const start = i;
    i++;
    while (text[i] !== '"') { if (text[i] === '\\') i++; i++; }
    i++;
    return JSON.parse(text.slice(start, i));
  };
  const value = (path) => {
    ws();
    const start = i;
    const c = text[i];
    if (c === '{') {
      i++;
      const v = {};
      const props = [];
      ws();
      if (text[i] === '}') { i++; } else {
        for (;;) {
          ws();
          const keyStart = i;
          const key = string();
          ws();
          i++; // :
          ws();
          const valueStart = i;
          v[key] = value(path.concat(key));
          props.push({ key, keyStart, valueStart, valueEnd: i });
          ws();
          if (text[i] === ',') { i++; continue; }
          i++; // }
          break;
        }
      }
      const span = { path, start, end: i, kind: 'object', v, props };
      spans.push(span);
      return v;
    }
    if (c === '[') {
      i++;
      const v = [];
      ws();
      if (text[i] === ']') { i++; } else {
        for (let k = 0; ; k++) {
          v.push(value(path.concat(k)));
          ws();
          if (text[i] === ',') { i++; continue; }
          i++; // ]
          break;
        }
      }
      spans.push({ path, start, end: i, kind: 'array', v });
      return v;
    }
    if (c === '"') {
      const v = string();
      spans.push({ path, start, end: i, kind: 'string', v });
      return v;
    }
    const m = /^(-?\d+(\.\d+)?([eE][+-]?\d+)?|true|false|null)/.exec(text.slice(i));
    if (!m) throw new Error(`unexpected ${JSON.stringify(text.slice(i, i + 20))} at ${i}`);
    i += m[0].length;
    const v = JSON.parse(m[0]);
    spans.push({ path, start, end: i, kind: 'literal', v });
    return v;
  };
  const v = value([]);
  const byPath = new Map(spans.map((s) => [s.path.join('\u0000'), s]));
  return { v, spans, at: (path) => byPath.get(path.join('\u0000')) };
}

/** Collects edits against one source text and applies them back to front. */
export class JsonEdits {
  constructor(text) {
    this.text = text;
    this.edits = [];
    this.removals = new Map(); // object span → keys to remove
  }

  /** Replaces a value's whole span with raw JSON text. */
  replaceValue(span, raw) {
    this.edits.push({ start: span.start, end: span.end, text: raw });
  }

  /** Removes one property of an object span, with its comma and the whitespace that led to the next key. */
  removeProperty(span, key) {
    if (!span.props.some((p) => p.key === key)) return;
    if (!this.removals.has(span)) this.removals.set(span, new Set());
    this.removals.get(span).add(key);
  }

  /** Turns one object's removals into text edits: a property before a kept one
   *  goes up to the next key; the trailing run goes back to the last kept value. */
  removalEdits(span, gone) {
    const props = span.props;
    const kept = props.filter((p) => !gone.has(p.key));
    if (kept.length === 0) return [{ start: span.start + 1, end: span.end - 1, text: '' }];
    const lastKept = props.indexOf(kept[kept.length - 1]);
    const out = [];
    props.forEach((p, i) => {
      if (gone.has(p.key) && i < lastKept) out.push({ start: p.keyStart, end: props[i + 1].keyStart, text: '' });
    });
    if (lastKept < props.length - 1) {
      out.push({ start: props[lastKept].valueEnd, end: props[props.length - 1].valueEnd, text: '' });
    }
    return out;
  }

  /** Renames one property and replaces its value. */
  replaceProperty(span, key, newKey, raw) {
    const p = span.props.find((x) => x.key === key);
    if (!p) throw new Error(`no property ${key}`);
    this.edits.push({ start: p.keyStart, end: p.valueEnd, text: `${JSON.stringify(newKey)}: ${raw}` });
  }

  /** Inserts a property first in an object span, matching its spacing style. */
  insertFirst(span, key, raw) {
    const after = this.text.slice(span.start + 1, span.end);
    const nl = /^\s*\n(\s*)/.exec(after);
    const empty = span.props.length === 0;
    const text = nl
      ? `\n${nl[1]}${JSON.stringify(key)}: ${raw}${empty ? '' : ','}`
      : ` ${JSON.stringify(key)}: ${raw}${empty ? ' ' : ','}`;
    this.edits.push({ start: span.start + 1, end: span.start + 1, text });
  }

  get count() { return this.edits.length + this.removals.size; }

  apply() {
    const all = [...this.edits];
    for (const [span, gone] of this.removals) all.push(...this.removalEdits(span, gone));
    // Back to front; at one position the removal goes before the insertion, so
    // the insertion lands where the removed text began.
    const sorted = all.sort((a, b) => b.start - a.start || b.end - a.end);
    for (let k = 1; k < sorted.length; k++) {
      if (sorted[k].end > sorted[k - 1].start) throw new Error('overlapping JSON edits');
    }
    let out = this.text;
    for (const e of sorted) out = out.slice(0, e.start) + e.text + out.slice(e.end);
    JSON.parse(out); // never hand back a file that does not parse
    return out;
  }
}

// ------------------------------------------------- the text fields (D27)

const QUEST_KINDS = new Set(['offer_quest', 'advance_quest']);

/** The objective's target, as the tracker key names it (Go's ObjectiveTargetKey). */
export function objectiveTarget(o) {
  return o.region || o.species || o.npc || '';
}

/**
 * Every translatable text field of one content file, as
 * {key, path, field, text, note, placeholders?, dialogue?}: `path` is the JSON
 * path of the object holding `field`, `text` its inline English if any (a
 * draft) or undefined. For dialogue, `dialogue` is {kind: 'line'|'option'|
 * 'grant', id, stock} and the key is undefined until the item has an id or
 * names a stock phrase.
 *
 * domain: 'quest' | 'mob' | 'skill' | 'regions' | 'appearance'.
 */
export function textFields(domain, raw) {
  const out = [];
  if (domain === 'quest') {
    const q = raw.id;
    out.push({ key: keys.questTitle(q), path: [], field: 'title', text: raw.title, note: notes.questTitle(q), limit: 'questTitle' });
    (raw.stages || []).forEach((s, si) => {
      out.push({ key: keys.questJournal(q, s.id), path: ['stages', si], field: 'journal', text: s.journal, note: notes.questJournal(q, s.id) });
      out.push({ key: keys.questStageTracker(q, s.id), path: ['stages', si], field: 'tracker', text: s.tracker, note: notes.questStageTracker(q, s.id), tracker: true, optional: true });
      (s.objectives || []).forEach((o, oi) => {
        const target = objectiveTarget(o);
        out.push({
          key: keys.questObjectiveTracker(q, s.id, o.kind, target), path: ['stages', si, 'objectives', oi], field: 'tracker',
          text: o.tracker, note: notes.questObjectiveTracker(q, s.id, o.kind, target), tracker: true, optional: true,
        });
      });
    });
  } else if (domain === 'skill') {
    out.push({ key: keys.skillName(raw.name), path: [], field: 'displayName', text: raw.displayName, note: notes.skillName(raw.name), limit: 'skillName' });
    out.push({ key: keys.skillDescription(raw.name), path: [], field: 'description', text: raw.description, note: notes.skillDescription(raw.name), optional: true });
  } else if (domain === 'appearance') {
    out.push({ key: keys.appearanceName(raw.id), path: [], field: 'name', text: raw.name, note: notes.appearanceName(raw.id) });
  } else if (domain === 'regions') {
    (raw.regions || []).forEach((r, ri) => {
      out.push({ key: keys.regionTitle(r.id), path: ['regions', ri], field: 'title', text: r.title, note: notes.regionTitle(r.id), limit: 'regionTitle' });
      out.push({ key: keys.regionSubtitle(r.id), path: ['regions', ri], field: 'subtitle', text: r.subtitle, note: notes.regionSubtitle(r.title || r.id), optional: true });
    });
  } else if (domain === 'mob') {
    const npc = raw.name;
    out.push({ key: keys.mobName(npc), path: [], field: 'displayName', text: raw.displayName, note: notes.mobName(npc), mobName: true, limit: 'mobName' });
    const inter = raw.interaction;
    if (inter) {
      const item = (kind, path, field, obj, note) => {
        const id = typeof obj === 'object' && obj ? obj.id : undefined;
        const stock = typeof obj === 'object' && obj ? obj.stock : undefined;
        const text = typeof obj === 'string' ? obj : obj ? obj[field] : undefined;
        out.push({
          key: stock ? keys.stock(stock) : id ? keys.conversation(npc, id) : undefined,
          path, field, text, note, dialogue: { kind, id, stock, npc },
        });
      };
      (inter.ambient || []).forEach((l, i) => item('line', ['interaction', 'ambient', i], 'text', l, notes.ambient(npc)));
      (inter.nodes || []).forEach((n, ni) => {
        (n.lines || []).forEach((l, i) => item('line', ['interaction', 'nodes', ni, 'lines', i], 'text', l, notes.line(npc, n.id, i)));
        (n.options || []).forEach((o, oi) => {
          const optPath = ['interaction', 'nodes', ni, 'options', oi];
          if (o.text !== undefined || o.id || o.stock) item('option', optPath, 'text', o, notes.option(npc, n.id));
          const bundle = o.grants && o.grants[0] && QUEST_KINDS.has(o.grants[0].kind);
          (o.grants || []).forEach((g, gi) => {
            if (bundle && gi > 0) return; // never spoken (C3): carries no line
            item('grant', [...optPath, 'grants', gi], 'line', g, notes.grant(npc, o.text || o.id || '', n.id));
          });
        });
      });
    }
  }
  return out;
}

/** The ids (slugs) one NPC already uses, across every dialogue item. */
export function npcSlugs(raw) {
  const taken = new Set();
  for (const f of textFields('mob', raw)) {
    if (f.dialogue && f.dialogue.id) taken.add(f.dialogue.id);
  }
  return taken;
}
