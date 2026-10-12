// node --test tools/content-editor/content-lang.test.mjs
// (plan-localization.md C5a, §4 "Tests first: Node": an editor save writes a new
// key with its note, a changed text, removes the keys of deleted content, and
// moves a renamed stage's keys in every locale, L23).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { formatArb } from '../lang/content-text.mjs';
import { hydrate, loadLang, mintIds, planSave, writeSave } from './content-lang.mjs';

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'aura-content-lang-'));
  const write = (rel, text) => {
    const abs = path.join(root, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, text);
  };
  const arb = (locale, obj) => formatArb(locale, new Map(Object.entries(obj).map(([k, v]) => [k, typeof v === 'string' ? { text: v, meta: locale === 'en' ? { description: 'note' } : undefined } : v])));
  write('api/lang/en/quests.arb', arb('en', {
    quest_wolves_title: 'Wolves',
    quest_wolves_cull_journal: 'Kill them.',
    quest_wolves_cull_tracker: { text: '{n, number}/{m, number} wolves', meta: { description: 'note', placeholders: { n: { type: 'int', description: 'd', example: '3' }, m: { type: 'int', description: 'd', example: '8' } } } },
    quest_wolves_done_journal: 'Done.',
  }));
  write('api/lang/de/quests.arb', arb('de', { quest_wolves_title: 'Wölfe', quest_wolves_cull_journal: 'Töte sie.', quest_wolves_done_journal: 'Fertig.' }));
  write('api/lang/de/quests.translated-from.json', JSON.stringify({ quest_wolves_title: 'Wolves', quest_wolves_cull_journal: 'Kill them.', quest_wolves_done_journal: 'Done.' }, null, 2));
  write('api/lang/de/allowlist.json', JSON.stringify(['quest_wolves_cull_journal']));
  write('api/lang/en/mobs.arb', arb('en', {
    mob_Farmer_name: 'Farmer',
    conv_Farmer_hello: 'Hello.',
    stock_good: 'Good.',
  }));
  write('api/lang/de/mobs.arb', arb('de', { mob_Farmer_name: 'Bauer', conv_Farmer_hello: 'Hallo.', stock_good: 'Gut.' }));
  write('api/lang/en/skills.arb', arb('en', {}));
  write('api/lang/en/regions.arb', arb('en', {}));
  return root;
}

const quest = () => ({
  id: 'wolves', level: 2,
  stages: [
    { id: 'cull', objectives: [{ kind: 'kill', species: 'Wolf', count: 8 }], next: 'done' },
    { id: 'done' },
  ],
});

test('hydrate fills the text in the form an author types, and remembers every renameable id', () => {
  const lang = loadLang(fixture());
  const h = hydrate('quest', quest(), lang);
  assert.equal(h.title, 'Wolves');
  assert.equal(h._was, 'wolves');
  assert.equal(h.stages[0].journal, 'Kill them.');
  assert.equal(h.stages[0].tracker, '{n}/{m} wolves', 'the editor shows {n}/{m}');
  assert.equal(h.stages[1]._was, 'done');
});

test('a save writes a changed text and a new key with its note, and strips the JSON', () => {
  const root = fixture();
  const lang = loadLang(root);
  const h = hydrate('quest', quest(), lang);
  h.title = 'Wolves on the Road';
  h.stages[1].tracker = 'Go home';
  const plan = planSave('quest', h, quest(), lang);
  assert.deepEqual(plan.raw, quest(), 'no text and no markers reach the JSON');
  writeSave(plan.files);
  const en = JSON.parse(readFileSync(path.join(root, 'api/lang/en/quests.arb'), 'utf8'));
  assert.equal(en.quest_wolves_title, 'Wolves on the Road');
  assert.equal(en['@quest_wolves_title'].description, 'note', 'a changed text keeps its note');
  assert.equal(en.quest_wolves_done_tracker, 'Go home');
  assert.match(en['@quest_wolves_done_tracker'].description, /Tracker line of quest "wolves", stage "done"/);
});

test('a renamed stage moves its keys in every locale, the record and the allowlist (L23)', () => {
  const root = fixture();
  const lang = loadLang(root);
  const h = hydrate('quest', quest(), lang);
  h.stages[0].id = 'hunt';
  h.stages[1].next = undefined;
  const plan = planSave('quest', h, quest(), lang);
  writeSave(plan.files);
  const en = JSON.parse(readFileSync(path.join(root, 'api/lang/en/quests.arb'), 'utf8'));
  const de = JSON.parse(readFileSync(path.join(root, 'api/lang/de/quests.arb'), 'utf8'));
  const rec = JSON.parse(readFileSync(path.join(root, 'api/lang/de/quests.translated-from.json'), 'utf8'));
  const allow = JSON.parse(readFileSync(path.join(root, 'api/lang/de/allowlist.json'), 'utf8'));
  assert.equal(en.quest_wolves_hunt_journal, 'Kill them.');
  assert.equal(en.quest_wolves_cull_journal, undefined);
  assert.equal(en.quest_wolves_hunt_tracker, '{n, number}/{m, number} wolves');
  assert.equal(de.quest_wolves_hunt_journal, 'Töte sie.', 'the German follows its key');
  assert.equal(rec.quest_wolves_hunt_journal, 'Kill them.');
  assert.deepEqual(allow, ['quest_wolves_hunt_journal']);
  assert.ok(plan.moved.includes('quest_wolves_cull_journal → quest_wolves_hunt_journal'));
});

test('deleted content takes its keys with it, everywhere', () => {
  const root = fixture();
  const lang = loadLang(root);
  const h = hydrate('quest', quest(), lang);
  h.stages = [h.stages[0]];
  h.stages[0].next = undefined;
  delete h.stages[0].tracker;
  const plan = planSave('quest', h, quest(), lang);
  writeSave(plan.files);
  const en = JSON.parse(readFileSync(path.join(root, 'api/lang/en/quests.arb'), 'utf8'));
  const de = JSON.parse(readFileSync(path.join(root, 'api/lang/de/quests.arb'), 'utf8'));
  assert.equal(en.quest_wolves_done_journal, undefined);
  assert.equal(de.quest_wolves_done_journal, undefined);
  assert.equal(en.quest_wolves_cull_tracker, undefined, 'an emptied optional field is deleted content');
  assert.deepEqual(plan.removed.sort(), ['quest_wolves_cull_tracker', 'quest_wolves_done_journal']);
});

const farmer = () => ({
  name: 'Farmer',
  interaction: { range: 2, nodes: [{ id: 'root', lines: [{ id: 'hello' }], options: [{ stock: 'good', next: 'root' }] }] },
});

test('dialogue: a new line gets a slug, a shared-phrase match names the phrase, a re-slug moves the key', () => {
  const root = fixture();
  const lang = loadLang(root);
  const h = hydrate('mob', farmer(), lang);
  assert.equal(h.displayName, 'Farmer');
  assert.deepEqual(h.interaction.nodes[0].lines, [{ id: 'hello', text: 'Hello.', _was: 'hello' }]);
  assert.equal(h.interaction.nodes[0].options[0].text, 'Good.');
  h.interaction.nodes[0].lines.push({ text: 'The fields need work.' }, { text: 'Good.' });
  h.interaction.nodes[0].lines[0].id = 'greeting'; // a re-slug
  assert.deepEqual(mintIds('mob', h, lang), ['the_fields_need_work']);
  const plan = planSave('mob', h, farmer(), lang);
  assert.deepEqual(plan.raw.interaction.nodes[0].lines, [{ id: 'greeting' }, { id: 'the_fields_need_work' }, { stock: 'good' }]);
  writeSave(plan.files);
  const en = JSON.parse(readFileSync(path.join(root, 'api/lang/en/mobs.arb'), 'utf8'));
  const de = JSON.parse(readFileSync(path.join(root, 'api/lang/de/mobs.arb'), 'utf8'));
  assert.equal(en.conv_Farmer_greeting, 'Hello.');
  assert.equal(de.conv_Farmer_greeting, 'Hallo.');
  assert.equal(en.conv_Farmer_hello, undefined);
  assert.equal(en.conv_Farmer_the_fields_need_work, 'The fields need work.');
  assert.match(en['@conv_Farmer_the_fields_need_work'].description, /Farmer speaks this in the conversation, node "root", line 2/);
  assert.equal(en.stock_good, 'Good.', 'a shared phrase is never removed by one file');
});

test('editing a shared phrase edits it for every line that names it', () => {
  const root = fixture();
  const lang = loadLang(root);
  const h = hydrate('mob', farmer(), lang);
  h.interaction.nodes[0].options[0].text = 'Very good.';
  writeSave(planSave('mob', h, farmer(), lang).files);
  const en = JSON.parse(readFileSync(path.join(root, 'api/lang/en/mobs.arb'), 'utf8'));
  assert.equal(en.stock_good, 'Very good.');
});
