// node --test tools/lang/   (plan-localization.md C5a, §4 "Tests first: Node")
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatArb, JsonEdits, KEY_PATTERN, keys, parseArb, parseWithSpans, slugify, SLUG_PATTERN, textFields } from './content-text.mjs';
import { extractFile } from './extract-english.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');

test('the key builders spell every key as Go does (the shared fixture)', () => {
  const fixture = JSON.parse(readFileSync(join(HERE, 'testdata', 'keys.json'), 'utf8'));
  for (const { builder, args, key } of fixture) {
    assert.equal(keys[builder](...args), key, builder);
    assert.match(key, KEY_PATTERN);
  }
});

test('slugify: first words, lowercase ASCII, punctuation dropped, capped', () => {
  assert.equal(slugify("I'll do it."), 'ill_do_it');
  assert.equal(slugify('Harvest 5 turnips from the row north of here'), 'harvest_5_turnips');
  assert.equal(slugify('About the rats in the barn...'), 'about_the_rats', 'never ends on a filler word');
  assert.equal(slugify('Wölfe überall — schnell!'), 'wolfe_uberall_schnell');
  assert.equal(slugify('...'), 'line');
  const long = slugify('Supercalifragilisticexpialidocious incomprehensibilities everywhere');
  assert.ok(long.length <= 32, long);
  for (const s of ['ill_do_it', 'harvest_5_turnips', long]) assert.match(s, SLUG_PATTERN);
});

test('slugify: _2 on a clash within the NPC, never an id in use', () => {
  assert.equal(slugify('Woof!', new Set(['woof'])), 'woof_2');
  assert.equal(slugify('Woof!', new Set(['woof', 'woof_2'])), 'woof_3');
});

test('the ARB writer: canonical layout, the fixture Go reads too, and every shipped English ARB round-trips', () => {
  const canonical = readFileSync(join(HERE, 'testdata', 'canonical.arb'), 'utf8').replace(/\r\n/g, '\n');
  const { locale, entries } = parseArb(canonical);
  assert.equal(formatArb(locale, entries), canonical);
  for (const file of readdirSync(join(ROOT, 'api', 'lang', 'en'))) {
    const source = readFileSync(join(ROOT, 'api', 'lang', 'en', file), 'utf8').replace(/\r\n/g, '\n');
    const arb = parseArb(source);
    assert.equal(formatArb(arb.locale, arb.entries), source, `api/lang/en/${file} is not in the canonical layout`);
  }
});

test('JSON edits change only what they touch', () => {
  const text = '{\n  "id": "q",\n  "title": "Q",\n  "level": 2,\n  "stages": [\n    { "id": "s", "journal": "J", "tracker": "T" }\n  ]\n}\n';
  const parsed = parseWithSpans(text);
  const e = new JsonEdits(text);
  e.removeProperty(parsed.at([]), 'title');
  const stage = parsed.at(['stages', 0]);
  e.removeProperty(stage, 'journal');
  e.removeProperty(stage, 'tracker');
  assert.equal(e.apply(), '{\n  "id": "q",\n  "level": 2,\n  "stages": [\n    { "id": "s" }\n  ]\n}\n');

  const opt = '{ "text": "Hi", "next": "root" }';
  const p2 = parseWithSpans(opt);
  const e2 = new JsonEdits(opt);
  e2.insertFirst(p2.at([]), 'id', '"hi"');
  e2.removeProperty(p2.at([]), 'text');
  assert.equal(e2.apply(), '{ "id": "hi", "next": "root" }');
});

const arbsWith = (stock = {}) => ({
  mobs: { entries: new Map(Object.entries(stock).map(([k, v]) => [`stock_${k}`, { text: v, meta: { description: 'shared' } }])) },
  quests: { entries: new Map() },
  skills: { entries: new Map() },
  regions: { entries: new Map() },
});

test('extract: a quest moves its English into the ARB with notes and placeholders', () => {
  const source = '{\n  "id": "wolves",\n  "title": "Wolves",\n  "level": 3,\n  "stages": [\n    {\n      "id": "cull",\n      "journal": "Kill them.",\n      "tracker": "{n}/{m} wolves slain",\n      "objectives": [{ "kind": "kill", "species": "Wolf", "count": 8 }],\n      "next": "done"\n    },\n    { "id": "done", "journal": "Done." }\n  ]\n}\n';
  const arbs = arbsWith();
  const { text, problems } = extractFile(source, 'quest', arbs, 'quests');
  assert.deepEqual(problems, []);
  assert.equal(text, '{\n  "id": "wolves",\n  "level": 3,\n  "stages": [\n    {\n      "id": "cull",\n      "objectives": [{ "kind": "kill", "species": "Wolf", "count": 8 }],\n      "next": "done"\n    },\n    { "id": "done" }\n  ]\n}\n');
  const q = arbs.quests.entries;
  assert.equal(q.get('quest_wolves_title').text, 'Wolves');
  assert.match(q.get('quest_wolves_title').meta.description, /Quest title/);
  assert.equal(q.get('quest_wolves_cull_tracker').text, '{n, number}/{m, number} wolves slain');
  assert.deepEqual(Object.keys(q.get('quest_wolves_cull_tracker').meta.placeholders), ['n', 'm']);
  assert.equal(q.get('quest_wolves_done_journal').text, 'Done.');
  // Idempotent: nothing inline is left.
  assert.equal(extractFile(text, 'quest', arbs, 'quests').text, text);
});

test('extract: dialogue mints slugs, names shared phrases, and never changes an existing id', () => {
  const source = JSON.stringify({
    name: 'Farmer',
    interaction: {
      ambient: ['Shoo!'],
      nodes: [{
        id: 'root',
        lines: [{ id: 'kept', text: 'Old words, new text.' }, 'Good.', 'Fields need work.'],
        options: [
          { text: 'Do you have a task for me?', next: 'root' },
          { text: 'Fields?', grants: [{ kind: 'offer_quest', quest: 'q', line: 'Fields need work.' }, { kind: 'grant_xp', xp: 5 }] },
        ],
      }],
    },
  }, null, 2);
  const arbs = arbsWith({ good: 'Good.', ask_task: 'Do you have a task for me?' });
  arbs.mobs.entries.set('mob_Farmer_name', { text: 'Farmer', meta: { description: 'n' } });
  const { text, problems } = extractFile(source, 'mob', arbs, 'mobs');
  assert.deepEqual(problems, []);
  const out = JSON.parse(text);
  const node = out.interaction.nodes[0];
  assert.deepEqual(out.interaction.ambient, [{ id: 'shoo' }]);
  assert.deepEqual(node.lines, [{ id: 'kept' }, { stock: 'good' }, { id: 'fields_need_work' }]);
  assert.deepEqual(node.options[0], { stock: 'ask_task', next: 'root' });
  assert.equal(node.options[1].id, 'fields');
  assert.equal(node.options[1].text, undefined);
  assert.equal(node.options[1].grants[0].id, 'fields_need_work_2', 'unique within the NPC');
  assert.equal(node.options[1].grants[0].line, undefined);
  assert.deepEqual(node.options[1].grants[1], { kind: 'grant_xp', xp: 5 }, 'a follower grant carries nothing');
  const m = arbs.mobs.entries;
  assert.equal(m.get('conv_Farmer_kept').text, 'Old words, new text.');
  assert.equal(m.get('conv_Farmer_fields_need_work_2').text, 'Fields need work.');
  assert.match(m.get('conv_Farmer_shoo').meta.description, /walking past/);
  assert.equal(m.has('conv_Farmer_good'), false, 'a shared phrase is not copied per line');
});

test('extract: a changed English replaces the text and keeps the note', () => {
  const arbs = arbsWith();
  arbs.quests.entries.set('quest_q_title', { text: 'Old', meta: { description: 'hand-written note' } });
  const { text } = extractFile('{"id": "q", "title": "New", "stages": []}', 'quest', arbs, 'quests');
  assert.equal(text, '{"id": "q", "stages": []}');
  assert.deepEqual(arbs.quests.entries.get('quest_q_title'), { text: 'New', meta: { description: 'hand-written note' } });
});

test('extract: a new mob or skill gets its derived English name', () => {
  const arbs = arbsWith();
  extractFile('{"name": "AlphaWolf"}', 'mob', arbs, 'mobs');
  assert.equal(arbs.mobs.entries.get('mob_AlphaWolf_name').text, 'Alpha Wolf');
  extractFile('{"name": "SummonTotem"}', 'skill', arbs, 'skills');
  assert.equal(arbs.skills.entries.get('skill_SummonTotem_name').text, 'Summon Totem');
});

test('every shipped content file is extracted: no inline English is left', () => {
  // The same as `node tools/lang/extract-english.mjs --check`.
  const fields = [];
  const walk = (dir, domain) => readdirSync(dir, { withFileTypes: true }).forEach((d) => {
    const full = join(dir, d.name);
    if (d.isDirectory()) return walk(full, domain);
    if (!d.name.endsWith('.json')) return;
    for (const f of textFields(domain, JSON.parse(readFileSync(full, 'utf8')))) {
      if (f.text !== undefined) fields.push(`${full}: ${f.path.join('.')}.${f.field}`);
    }
  });
  walk(join(ROOT, 'api', 'quests'), 'quest');
  walk(join(ROOT, 'api', 'mobs'), 'mob');
  walk(join(ROOT, 'api', 'skills'), 'skill');
  for (const f of textFields('regions', JSON.parse(readFileSync(join(ROOT, 'api', 'regions', 'regions.json'), 'utf8')))) {
    if (f.text !== undefined) fields.push(`regions.json: ${f.path.join('.')}.${f.field}`);
  }
  assert.deepEqual(fields, []);
});
