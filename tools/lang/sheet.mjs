#!/usr/bin/env node
// sheet.mjs - translations to a spreadsheet and back (plan-localization.md C9).
// The ARB files stay the source of truth; a CSV is a bridge to Google Sheets
// (or Weblate, Crowdin: both import CSV). No Google API: import and download
// the CSV by hand.
//
//   node tools/lang/sheet.mjs export [--locale <code>] [--out <dir>]
//   node tools/lang/sheet.mjs import <file.csv>
//
// Run with --help for the columns, the rules and the spreadsheet traps.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatArb, parseArb } from './content-text.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// The ICU parser intl-messageformat itself uses, from the client's dependencies.
const { parse: parseIcu } = createRequire(join(ROOT, 'frontend', 'package.json'))('@formatjs/icu-messageformat-parser');

const SOURCE = 'en';
/** The two ARB trees, each `<tree>/<locale>/<file>.arb`: content, then the UI. */
const TREES = ['api/lang', 'frontend/src/lang'];
const COLUMNS = ['file', 'key', 'en', 'note', 'maxLength', 'status'];
const LOCALE_PATTERN = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

const HELP = `Translations to a spreadsheet and back (plan-localization.md C9).

  node tools/lang/sheet.mjs export [--locale <code>] [--out <dir>]
      One CSV per language besides English found under api/lang/ and
      frontend/src/lang/ (today de.csv), or just --locale's (a new code gives
      every row "missing"). Written to --out, default the current directory.

  node tools/lang/sheet.mjs import <file.csv>
      Writes every language column of the sheet into its ARB files.

Columns: file, key, en, <locale> (the header IS the language code), note,
maxLength, status (missing / outdated / ok, computed from the files: the same
rule as aurad -lang-status and catalogs.test.ts). Every key of the content and
the UI, sorted like the ARB.

Import rules:
  - Rows match by key, never by position: sorting and filtering are safe.
  - An unknown key, a duplicate key, a file that is not the key's home, a
    message that does not parse, uses other arguments than English, or has
    plural forms the language does not have (or lacks one it needs) refuses
    the whole import, naming the rows. Nothing is written.
  - An empty cell is "no translation": nothing is written for it, never "",
    and an existing translation is kept.
  - Only language columns are written. An edited English cell is reported and
    ignored: English is authored in the ARBs or the content editor.
  - The language comes from the column header, never the file name.
  - A new language gets its ARB files, but is not playable until it is added
    to the game (lang.Served, CatalogLoaders.js): a deliberate step.
  - Import never touches *.translated-from.json. After reviewing the
    translations, record them as current:
      UPDATE_LANG=1 go test -count=1 -run TestLang ./cmd/aurad/   (content)
      UPDATE_LANG_SOURCE=1 npx vitest run src/lang/catalogs.test.ts (UI)
  - A stale sheet overwrites: import writes what its cells hold, so a sheet
    exported before newer repo edits reverts them. Export fresh, and read the
    git diff after an import.

Spreadsheet traps:
  - Google Sheets: on File > Import, UNTICK "Convert text to numbers, dates,
    and formulas", or "3/8" becomes a date and a leading = or + a formula.
  - Sheets swallows a leading ' as a "this is text" marker: a translation
    starting with an apostrophe loses it.
  - The CSV is RFC 4180, UTF-8 with a byte-order mark (so Excel reads the
    umlauts): quoted cells, doubled quotes, line breaks inside cells.
`;

// ------------------------------------------------------------------ CSV

/** RFC 4180: quoted cells, doubled quotes, line breaks inside quotes; a BOM and CRLF or LF rows. */
export function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += c;
    }
  }
  if (quoted) throw new Error('the CSV ends inside a quoted cell');
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** The inverse of parseCsv: a BOM, CRLF rows, a cell quoted when it must be. */
export function formatCsv(rows) {
  const quote = (v) => (/[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
  return '﻿' + rows.map((r) => r.map((v) => quote(String(v))).join(',') + '\r\n').join('');
}

// ------------------------------------------------------------------ the trees

/** Every ARB file by name, and the English of every key with its home file. */
export function readEnglish(root) {
  const files = [];
  for (const tree of TREES) {
    const dir = join(root, tree, SOURCE);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).filter((n) => n.endsWith('.arb')).sort()) {
      const file = name.slice(0, -'.arb'.length);
      if (files.some((f) => f.name === file)) throw new Error(`${file}.arb exists in two trees`);
      files.push({ name: file, tree: join(root, tree) });
    }
  }
  const english = new Map();
  for (const file of files) {
    const { entries } = parseArb(readFileSync(arbPath(file, SOURCE), 'utf8'));
    for (const [key, { text, meta }] of entries) {
      if (english.has(key)) throw new Error(`${key} is in both ${english.get(key).file}.arb and ${file.name}.arb`);
      english.set(key, { file: file.name, text, meta });
    }
  }
  return { files, english };
}

function arbPath(file, locale) {
  return join(file.tree, locale, file.name + '.arb');
}

/** Every language besides English with a folder in either tree. */
export function locales(root) {
  const out = new Set();
  for (const tree of TREES) {
    const dir = join(root, tree);
    if (!existsSync(dir)) continue;
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      if (d.isDirectory() && d.name !== SOURCE) out.add(d.name);
    }
  }
  return [...out].sort();
}

/** One language's ARB per file: its entries, its translated-from record and its current bytes. */
function readLocale(files, locale) {
  const out = new Map();
  for (const file of files) {
    const path = arbPath(file, locale);
    const source = existsSync(path) ? readFileSync(path, 'utf8') : null;
    const recordPath = join(file.tree, locale, file.name + '.translated-from.json');
    out.set(file.name, {
      path,
      source,
      entries: source === null ? new Map() : parseArb(source).entries,
      record: existsSync(recordPath) ? JSON.parse(readFileSync(recordPath, 'utf8')) : {},
    });
  }
  return out;
}

/**
 * missing: no translation (or an empty one); outdated: its English changed
 * since it was made (the translated-from record, D20); ok otherwise. The rule
 * of aurad -lang-status (content) and catalogs.test.ts (UI).
 */
function status(english, arb, key) {
  const own = arb.entries.get(key);
  if (!own || own.text === '') return 'missing';
  return arb.record[key] === english.text ? 'ok' : 'outdated';
}

// ------------------------------------------------------------------ export

/** The sheet of one language, as rows (the header first). */
export function exportRows(root, locale) {
  const { files, english } = readEnglish(root);
  const arbs = readLocale(files, locale);
  const rows = [['file', 'key', 'en', locale, 'note', 'maxLength', 'status']];
  for (const file of files) {
    const keys = [...english.keys()].filter((k) => english.get(k).file === file.name).sort(compareKeys);
    const arb = arbs.get(file.name);
    for (const key of keys) {
      const en = english.get(key);
      const own = arb.entries.get(key);
      rows.push([
        file.name,
        key,
        en.text,
        own ? own.text : '',
        (en.meta && en.meta.description) || '',
        en.meta && en.meta['x-maxLength'] !== undefined ? String(en.meta['x-maxLength']) : '',
        status(en, arb, key),
      ]);
    }
  }
  return rows;
}

/** formatArb's key order (Go's sort.Strings). */
function compareKeys(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

// ------------------------------------------------------------------ import

/**
 * Reads a sheet and works out every ARB it would write, writing nothing:
 * {errors, warnings, writes: [{path, content}], summary}. Any error refuses
 * the whole import.
 */
export function planImport(root, csvText) {
  const errors = [];
  const warnings = [];
  const rows = parseCsv(csvText);
  if (!rows.length) return { errors: ['the sheet is empty'], warnings, writes: [], summary: [] };
  const header = rows[0].map((h) => h.trim());
  const col = (name) => header.indexOf(name);
  for (const name of ['file', 'key']) {
    if (col(name) < 0) errors.push(`no "${name}" column`);
  }
  const localeColumns = [];
  header.forEach((name, i) => {
    if (COLUMNS.includes(name)) return;
    if (LOCALE_PATTERN.test(name) && name !== SOURCE) localeColumns.push({ locale: name, index: i });
    else errors.push(`column "${name}" is neither a sheet column nor a language code`);
  });
  if (!localeColumns.length) errors.push('no language column');
  if (errors.length) return { errors, warnings, writes: [], summary: [] };

  const { files, english } = readEnglish(root);
  const targets = localeColumns.map(({ locale, index }) => ({
    locale, index, arbs: readLocale(files, locale), changed: new Map(), kept: 0,
  }));
  const seen = new Map();
  const cell = (row, index) => (index >= 0 && index < row.length ? row[index].replace(/\r\n?/g, '\n') : '');

  rows.slice(1).forEach((row, i) => {
    const line = i + 2; // the spreadsheet's row number: the header is row 1
    if (row.every((v) => v.trim() === '')) return;
    const key = cell(row, col('key')).trim();
    const en = english.get(key);
    if (!key) {
      errors.push(`row ${line}: no key`);
      return;
    }
    if (!en) {
      errors.push(`row ${line}: unknown key ${key}`);
      return;
    }
    if (seen.has(key)) {
      errors.push(`row ${line}: duplicate key ${key} (also row ${seen.get(key)})`);
      return;
    }
    seen.set(key, line);
    const file = cell(row, col('file')).trim();
    if (file !== en.file) {
      errors.push(`row ${line}: ${key} lives in ${en.file}, the sheet says "${file}"`);
      return;
    }
    if (col('en') >= 0 && cell(row, col('en')) !== en.text) {
      warnings.push(`row ${line}: the English of ${key} was edited in the sheet; ignored (English is authored in the ARBs)`);
    }
    for (const target of targets) {
      const text = cell(row, target.index);
      const own = target.arbs.get(en.file).entries.get(key);
      if (text.trim() === '') {
        if (own && own.text !== '') target.kept++;
        continue;
      }
      const problem = icuProblem(en.text, text, target.locale);
      if (problem) {
        errors.push(`row ${line}: ${target.locale} ${key} ${problem}`);
        continue;
      }
      if (!own || own.text !== text) target.changed.set(key, text);
    }
  });
  if (errors.length) return { errors, warnings, writes: [], summary: [] };

  const writes = [];
  const summary = [];
  for (const target of targets) {
    const touched = [];
    for (const file of files) {
      const arb = target.arbs.get(file.name);
      const keys = [...target.changed.keys()].filter((k) => english.get(k).file === file.name);
      if (!keys.length) continue;
      const entries = new Map(arb.entries);
      for (const key of keys) {
        const own = entries.get(key);
        entries.set(key, { text: target.changed.get(key), meta: own && own.meta });
      }
      const content = formatArb(target.locale, entries);
      if (content !== arb.source) {
        writes.push({ path: arb.path, content });
        touched.push(`${file.name}.arb`);
      }
    }
    let line = `${target.locale}: ${target.changed.size} translation(s) changed`;
    if (touched.length) line += ` in ${touched.join(', ')}`;
    if (target.kept) line += `; ${target.kept} kept whose cell is empty`;
    summary.push(line);
  }
  return { errors, warnings, writes, summary };
}

// ------------------------------------------------------------------ ICU (L14)

/** Why a translation cannot stand for its English, or null. */
export function icuProblem(english, text, locale) {
  let ast;
  try {
    ast = parseIcu(text);
  } catch (e) {
    return `does not parse as ICU (${e.message})`;
  }
  const enAst = parseIcu(english);
  const want = args(enAst);
  const got = args(ast);
  const a = [...want.all].sort().join(', ');
  const b = [...got.all].sort().join(', ');
  if (a !== b) return `uses {${b}}, the English uses {${a}}`;
  for (const name of got.bare) {
    if (want.numeric.has(name)) return `prints the number {${name}} bare; write {${name}, number}`;
  }
  // A plural's forms are the language's own (Polish: one, few, many, other).
  // When the English gives every English form, the translation gives every
  // form its language has; an English that picks exact values (=0) only
  // asks for forms the language knows.
  const complete = new Set();
  for (const el of plurals(enAst)) {
    const cats = categories(SOURCE, el.pluralType);
    if (cats.every((c) => c in el.options)) complete.add(el.value);
  }
  for (const el of plurals(ast)) {
    const cats = categories(locale, el.pluralType);
    const forms = Object.keys(el.options).filter((o) => !o.startsWith('='));
    const foreign = forms.filter((o) => !cats.includes(o));
    if (foreign.length) return `has the plural form(s) ${foreign.join(', ')} for {${el.value}}; ${locale} has ${cats.join(', ')}`;
    const lacking = cats.filter((c) => !forms.includes(c));
    if (complete.has(el.value) && lacking.length) return `lacks the plural form(s) ${lacking.join(', ')} for {${el.value}} that ${locale} needs`;
  }
  return null;
}

function categories(locale, type) {
  return new Intl.PluralRules(locale, { type: type === 'ordinal' ? 'ordinal' : 'cardinal' }).resolvedOptions().pluralCategories;
}

/** Element types of @formatjs/icu-messageformat-parser. */
const T = { argument: 1, number: 2, date: 3, time: 4, select: 5, plural: 6, tag: 8 };

/** The arguments a message uses (as catalogs.test.ts reads them). */
function args(ast) {
  const out = { all: new Set(), bare: new Set(), numeric: new Set() };
  walk(ast, (el) => {
    if (el.type === T.argument) out.bare.add(el.value);
    if (el.type === T.number || el.type === T.plural) out.numeric.add(el.value);
    if ([T.argument, T.number, T.date, T.time, T.select, T.plural].includes(el.type)) out.all.add(el.value);
  });
  return out;
}

function plurals(ast) {
  const out = [];
  walk(ast, (el) => {
    if (el.type === T.plural) out.push(el);
  });
  return out;
}

function walk(elements, visit) {
  for (const el of elements) {
    visit(el);
    if (el.type === T.select || el.type === T.plural) Object.values(el.options).forEach((o) => walk(o.value, visit));
    if (el.type === T.tag) walk(el.children, visit);
  }
}

// ------------------------------------------------------------------ CLI

function main(argv) {
  const [command, ...rest] = argv;
  const flag = (name) => {
    const i = rest.indexOf(name);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  if (!command || command === '--help' || command === '-h' || rest.includes('--help')) {
    process.stdout.write(HELP);
    return 0;
  }
  if (command === 'export') {
    const chosen = flag('--locale');
    if (chosen !== undefined && (!LOCALE_PATTERN.test(chosen) || chosen === SOURCE)) {
      console.error(`--locale ${chosen}: not a language code besides en`);
      return 1;
    }
    const out = flag('--out') || '.';
    mkdirSync(out, { recursive: true });
    for (const locale of chosen ? [chosen] : locales(ROOT)) {
      const rows = exportRows(ROOT, locale);
      const path = join(out, locale + '.csv');
      writeFileSync(path, formatCsv(rows));
      const counts = { missing: 0, outdated: 0, ok: 0 };
      rows.slice(1).forEach((r) => counts[r[6]]++);
      console.log(`wrote ${path}: ${rows.length - 1} keys (${counts.missing} missing, ${counts.outdated} outdated)`);
    }
    return 0;
  }
  if (command === 'import') {
    const csv = rest.find((a) => !a.startsWith('--'));
    if (!csv) {
      console.error('import needs a CSV file; see --help');
      return 1;
    }
    const plan = planImport(ROOT, readFileSync(csv, 'utf8'));
    plan.warnings.forEach((w) => console.warn('⚑ ' + w));
    if (plan.errors.length) {
      plan.errors.forEach((e) => console.error('✖ ' + e));
      console.error(`refused: ${plan.errors.length} problem(s), nothing written`);
      return 1;
    }
    for (const w of plan.writes) {
      mkdirSync(dirname(w.path), { recursive: true });
      writeFileSync(w.path, w.content);
      console.log('wrote ' + relative(ROOT, w.path).replace(/\\/g, '/'));
    }
    plan.summary.forEach((s) => console.log(s));
    if (plan.writes.length) console.log('Review the git diff; once the translations are checked, record them as current (see --help).');
    return 0;
  }
  console.error(`unknown command ${command}; see --help`);
  return 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(main(process.argv.slice(2)));
}
