// node --test tools/lang/*.test.mjs   (plan-localization.md C9: the spreadsheet round-trip)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatArb, parseArb } from './content-text.mjs';
import { exportRows, formatCsv, icuProblem, parseCsv, planImport } from './sheet.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');

/** A throwaway root holding a copy of both real ARB trees. */
function realRoot() {
  const root = mkdtempSync(join(tmpdir(), 'aura-sheet-'));
  cpSync(join(ROOT, 'api', 'lang'), join(root, 'api', 'lang'), { recursive: true });
  cpSync(join(ROOT, 'frontend', 'src', 'lang'), join(root, 'frontend', 'src', 'lang'), { recursive: true });
  return root;
}

/** A small root: arbs = {locale: {file: {key: text}}}; mobs + quests are content, frontend is the UI. */
function fixtureRoot(arbs, records = {}) {
  const root = mkdtempSync(join(tmpdir(), 'aura-sheet-'));
  for (const [locale, files] of Object.entries(arbs)) {
    for (const [file, texts] of Object.entries(files)) {
      const tree = file === 'frontend' ? join(root, 'frontend', 'src', 'lang') : join(root, 'api', 'lang');
      mkdirSync(join(tree, locale), { recursive: true });
      const entries = new Map(Object.entries(texts).map(([k, text]) => [k, { text, meta: locale === 'en' ? { description: 'Note for ' + k } : undefined }]));
      writeFileSync(join(tree, locale, file + '.arb'), formatArb(locale, entries));
      if (records[locale] && records[locale][file]) {
        writeFileSync(join(tree, locale, file + '.translated-from.json'), JSON.stringify(records[locale][file]));
      }
    }
  }
  return root;
}

const FIXTURE = {
  en: {
    mobs: { 'mob.Wolf.name': '{count, plural, one {Wolf} other {Wolves}}', 'mob.Boar.name': '{count, plural, one {Boar} other {Boars}}' },
    quests: { 'quest.a.title': 'Wolves at the Road', 'quest.a.tracker': '{n, number}/{m, number} wolves slain' },
    frontend: { 'hud.close': 'Close', 'hud.level': 'Level {level, number}' },
  },
  de: {
    mobs: { 'mob.Wolf.name': '{count, plural, one {Wolf} other {Wölfe}}' },
    quests: { 'quest.a.title': 'Wölfe an der Straße', 'quest.a.tracker': '{n, number}/{m, number} Wölfe getötet' },
    frontend: { 'hud.close': 'Schließen' },
  },
};
const RECORDS = {
  de: {
    mobs: { 'mob.Wolf.name': '{count, plural, one {Wolf} other {Wolves}}' },
    quests: { 'quest.a.title': 'Wolves on the Road', 'quest.a.tracker': '{n, number}/{m, number} wolves slain' },
    frontend: { 'hud.close': 'Close' },
  },
};

const sheet = (rows) => formatCsv(rows);
const byKey = (rows) => new Map(rows.slice(1).map((r) => [r[1], r]));

test('the CSV parser: quotes, commas, doubled quotes, line breaks in cells, a BOM, CRLF and LF', () => {
  const rows = [['a', 'b,c', 'say "hi"'], ['line\nbreak', '', 'ü€'], ['x', ' lead', 'trail ']];
  assert.deepEqual(parseCsv(formatCsv(rows)), rows);
  assert.deepEqual(parseCsv('a,"b\r\nc"\nd,e\n'), [['a', 'b\r\nc'], ['d', 'e']]);
  assert.deepEqual(parseCsv('﻿k,v\r\n1,2'), [['k', 'v'], ['1', '2']]);
  assert.throws(() => parseCsv('a,"open'), /quoted cell/);
});

test('export: one row per English key, sorted like the ARB, with note, limit and status', () => {
  const root = fixtureRoot(FIXTURE, RECORDS);
  const rows = exportRows(root, 'de');
  assert.deepEqual(rows[0], ['file', 'key', 'en', 'de', 'note', 'maxLength', 'status']);
  assert.deepEqual(rows.slice(1).map((r) => r[0] + ' ' + r[1]), [
    'mobs mob.Boar.name', 'mobs mob.Wolf.name',
    'quests quest.a.title', 'quests quest.a.tracker',
    'frontend hud.close', 'frontend hud.level',
  ]);
  const k = byKey(rows);
  assert.equal(k.get('mob.Boar.name')[6], 'missing');
  assert.equal(k.get('hud.level')[6], 'missing');
  assert.equal(k.get('quest.a.title')[6], 'outdated', 'its record holds other English');
  assert.equal(k.get('mob.Wolf.name')[6], 'ok');
  assert.equal(k.get('mob.Wolf.name')[4], 'Note for mob.Wolf.name');
});

test('export for a language with no folder: every row missing, its header the code', () => {
  const rows = exportRows(fixtureRoot(FIXTURE), 'pl');
  assert.equal(rows[0][3], 'pl');
  assert.ok(rows.slice(1).every((r) => r[3] === '' && r[6] === 'missing'));
});

test('the real trees round-trip: export, import, no file byte changes', () => {
  const root = realRoot();
  // An import rewrites a touched file whole, so its diff is only its edits
  // when every translation ARB is already in formatArb's layout.
  for (const tree of [join(root, 'api', 'lang'), join(root, 'frontend', 'src', 'lang')]) {
    for (const locale of readdirSync(tree, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== 'en')) {
      for (const name of readdirSync(join(tree, locale.name)).filter((n) => n.endsWith('.arb'))) {
        const source = readFileSync(join(tree, locale.name, name), 'utf8');
        const { entries } = parseArb(source);
        assert.ok(formatArb(locale.name, entries) === source, `${locale.name}/${name} is not in formatArb's layout`);
      }
    }
  }
  for (const locale of ['de']) {
    const plan = planImport(root, sheet(exportRows(root, locale)));
    assert.deepEqual(plan.errors, []);
    assert.deepEqual(plan.warnings, []);
    assert.deepEqual(plan.writes.map((w) => w.path), [], 'an ARB not in formatArb\'s canonical layout? rewrite it with formatArb');
  }
});

test('three edits import as exactly three changes; a sorted and filtered sheet imports the same', () => {
  const root = fixtureRoot(FIXTURE, RECORDS);
  const rows = exportRows(root, 'de');
  const k = byKey(rows);
  k.get('mob.Boar.name')[3] = '{count, plural, one {Keiler} other {Keiler}}';
  k.get('quest.a.title')[3] = 'Wölfe, an der Straße';
  k.get('hud.level')[3] = 'Stufe\n{level, number}';
  const plan = planImport(root, sheet(rows));
  assert.deepEqual(plan.errors, []);
  assert.deepEqual(plan.summary, ['de: 3 translation(s) changed in mobs.arb, quests.arb, frontend.arb']);

  const shuffled = [rows[0], ...rows.slice(1).reverse().filter((r) => r[1] !== 'hud.close')];
  const again = planImport(root, sheet(shuffled));
  assert.deepEqual(again.writes, plan.writes);

  const written = new Map(plan.writes.map((w) => [w.path, parseArb(w.content).entries]));
  const mobs = written.get(join(root, 'api', 'lang', 'de', 'mobs.arb'));
  assert.equal(mobs.get('mob.Boar.name').text, '{count, plural, one {Keiler} other {Keiler}}');
  assert.equal(mobs.get('mob.Wolf.name').text, FIXTURE.de.mobs['mob.Wolf.name'], 'the untouched key stays');
  const ui = written.get(join(root, 'frontend', 'src', 'lang', 'de', 'frontend.arb'));
  assert.equal(ui.get('hud.level').text, 'Stufe\n{level, number}');
});

test('an unknown key, a duplicate key, a wrong file and a broken plural each refuse, naming the row', () => {
  const root = fixtureRoot(FIXTURE, RECORDS);
  const rows = exportRows(root, 'de');
  const base = rows.slice(1);
  // The bad row goes last, after the other five keys: the header is row 1, so it is row 7.
  const cases = [
    [['quests', 'quest.nope.title', 'X', 'Y', '', '', ''], 'row 7: unknown key quest.nope.title'],
    [base[1].slice(), 'row 7: duplicate key mob.Wolf.name (also row 3)'],
    [['quests', 'hud.close', 'Close', 'Zu', '', '', ''], 'row 7: hud.close lives in frontend, the sheet says "quests"'],
    [['mobs', 'mob.Boar.name', '', '{count, plural, one {Keiler}', '', '', ''], 'row 7: de mob.Boar.name does not parse'],
  ];
  for (const [bad, message] of cases) {
    const others = bad === cases[1][0] ? base.slice(0, 5) : base.filter((r) => r[1] !== bad[1]).slice(0, 5);
    const plan = planImport(root, sheet([rows[0], ...others, bad]));
    assert.equal(plan.writes.length, 0);
    assert.ok(plan.errors.some((e) => e.startsWith(message)), message + ' in:\n' + plan.errors.join('\n'));
  }
});

test('an empty cell writes nothing: never "", and an existing translation is kept', () => {
  const root = fixtureRoot(FIXTURE, RECORDS);
  const rows = exportRows(root, 'de');
  byKey(rows).get('quest.a.title')[3] = '';
  byKey(rows).get('hud.close')[3] = '   ';
  const plan = planImport(root, sheet(rows));
  assert.deepEqual(plan.errors, []);
  assert.deepEqual(plan.writes, []);
  assert.deepEqual(plan.summary, ['de: 0 translation(s) changed; 2 kept whose cell is empty']);
});

test('an edited English cell is reported and ignored', () => {
  const root = fixtureRoot(FIXTURE, RECORDS);
  const rows = exportRows(root, 'de');
  byKey(rows).get('hud.close')[2] = 'Shut';
  const plan = planImport(root, sheet(rows));
  assert.deepEqual(plan.errors, []);
  assert.deepEqual(plan.writes, []);
  assert.match(plan.warnings.join('\n'), /row \d+: the English of hud\.close was edited/);
});

test('a two-language sheet writes both; a new language gets its ARBs with the header', () => {
  const root = fixtureRoot(FIXTURE, RECORDS);
  const rows = exportRows(root, 'de').map((r) => [...r.slice(0, 4), '', ...r.slice(4)]);
  rows[0][4] = 'fr';
  byKey(rows).get('hud.close')[4] = 'Fermer';
  byKey(rows).get('hud.close')[3] = 'Zumachen';
  const plan = planImport(root, sheet(rows));
  assert.deepEqual(plan.errors, []);
  const paths = plan.writes.map((w) => w.path);
  assert.deepEqual(paths, [join(root, 'frontend', 'src', 'lang', 'de', 'frontend.arb'), join(root, 'frontend', 'src', 'lang', 'fr', 'frontend.arb')]);
  const fr = plan.writes[1].content;
  assert.equal(fr, formatArb('fr', new Map([['hud.close', { text: 'Fermer', meta: undefined }]])));
  assert.match(fr, /"@@locale": "fr"/);
});

test('ICU at import: arguments as the English, numbers formatted, the language\'s plural forms', () => {
  const wolf = '{count, plural, one {Wolf} other {Wolves}}';
  assert.equal(icuProblem(wolf, '{count, plural, one {Wolf} other {Wölfe}}', 'de'), null);
  assert.match(icuProblem(wolf, '{count, plural, one {Wolf} few {Wölfe} other {Wölfe}}', 'de'), /plural form\(s\) few .* de has one, other/);
  assert.match(icuProblem(wolf, '{count, plural, one {wilk} other {wilki}}', 'pl'), /lacks the plural form\(s\) few, many .* pl needs/);
  assert.equal(icuProblem(wolf, '{count, plural, one {wilk} few {wilki} many {wilków} other {wilka}}', 'pl'), null);
  assert.equal(icuProblem('{n, plural, =0 {none} other {# left}}', '{n, plural, =0 {keine} other {# übrig}}', 'de'), null, 'an exact-value English asks only for known forms');
  assert.match(icuProblem('Level {level, number}', 'Stufe {lvl, number}', 'de'), /uses \{lvl\}, the English uses \{level\}/);
  assert.match(icuProblem('Level {level, number}', 'Stufe {level}', 'de'), /prints the number \{level\} bare/);
  assert.equal(icuProblem('Signed in as <user>{name}</user>.', 'Angemeldet als <user>{name}</user>.', 'de'), null);
});

test('status agrees with aurad -lang-status for the content keys', (t) => {
  const backend = join(ROOT, 'backend');
  const binary = ['aurad.exe', 'aurad'].map((b) => join(backend, b)).find((b) => existsSync(b));
  if (!binary) {
    t.skip('no built aurad in backend/');
    return;
  }
  const root = mkdtempSync(join(tmpdir(), 'aura-sheet-'));
  cpSync(join(ROOT, 'api'), join(root, 'api'), { recursive: true });
  cpSync(join(ROOT, 'frontend', 'src', 'lang'), join(root, 'frontend', 'src', 'lang'), { recursive: true });
  // One translation removed, one English changed under its translation.
  const dePath = join(root, 'api', 'lang', 'de', 'mobs.arb');
  const de = parseArb(readFileSync(dePath, 'utf8'));
  const gone = [...de.entries.keys()][0];
  de.entries.delete(gone);
  writeFileSync(dePath, formatArb('de', de.entries));
  const enPath = join(root, 'api', 'lang', 'en', 'quests.arb');
  const en = parseArb(readFileSync(enPath, 'utf8'));
  const changed = [...en.entries.keys()].find((k) => k.endsWith('.title'));
  en.entries.get(changed).text += ' Again';
  writeFileSync(enPath, formatArb('en', en.entries));

  const run = spawnSync(binary, ['-lang-status', '-content', join(root, 'api')], { cwd: backend, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  const go = JSON.parse(run.stdout).de;
  const rows = exportRows(root, 'de').slice(1).filter((r) => r[0] !== 'frontend');
  const of = (s) => rows.filter((r) => r[6] === s).map((r) => r[1]).sort();
  assert.deepEqual(of('missing'), [...go.missing].sort(), `a stale ${binary}? rebuild it`);
  assert.deepEqual(of('outdated'), go.outdated.map((line) => line.split(': ')[0]).sort());
  assert.deepEqual(of('missing'), [gone]);
  assert.deepEqual(of('outdated'), [changed]);
});
