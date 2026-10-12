// node --test tools/content-editor/validate-lang.test.mjs
// (plan-localization.md C5b, §4 "Tests first: Editor"): validate.mjs checks
// the mob name shape and D24's plural rule, and refuses a missing dialogue id
// or a slug used twice within one NPC.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIndex, dialogueIdProblems, validateMob, validateQuest } from './validate.mjs';

const mob = (name, displayName, extra = {}) => ({ raw: { name, displayName, body: { aggroRadius: 1 }, factors: {}, ...extra } });
const messages = (errors) => errors.map((e) => e.message).join(' | ');

test('a mob name is plain text or exactly the one/other plural on count (D24)', () => {
  const idx = buildIndex([], [], [], { entityTypes: ['Farmer', 'Wolf'] });
  assert.doesNotMatch(messages(validateMob(mob('Farmer', 'Farmer').raw, idx)), /English name|plain text/);
  assert.doesNotMatch(messages(validateMob(mob('Wolf', '{count, plural, one {Wolf} other {Wolves}}').raw, idx)), /English name|plain text/);
  assert.match(messages(validateMob(mob('Wolf', '{count, plural, one {Wolf} few {Wolfs} other {Wolves}}').raw, idx)), /plain text or exactly/);
  assert.match(messages(validateMob(mob('Wolf', '').raw, idx)), /needs an English name/);
});

test('a kill or harvest objective counts a mob whose name has its plural (D24)', () => {
  const quest = (species) => ({
    id: 'q', title: 'Q', level: 1,
    stages: [{ id: 's', journal: 'j', tracker: 'go', objectives: [{ kind: 'kill', species, count: 3 }], next: 't' }, { id: 't', journal: 'j' }],
  });
  const idx = buildIndex([mob('Wolf', '{count, plural, one {Wolf} other {Wolves}}'), mob('Farmer', 'Farmer')], [], []);
  assert.doesNotMatch(messages(validateQuest(quest('Wolf'), idx)), /plural/);
  assert.match(messages(validateQuest(quest('Farmer'), idx)), /counts Farmer, whose name has no plural/);
});

test('every dialogue string names its own slug or a shared phrase, its slug unique within the NPC (D27, D28)', () => {
  const npc = (lines, options = []) => ({ name: 'Farmer', interaction: { nodes: [{ id: 'root', lines, options }] } });
  assert.deepEqual(dialogueIdProblems(npc([{ id: 'hello', text: 'Hi' }, { stock: 'good', text: 'Good.' }])), []);
  assert.match(dialogueIdProblems(npc([{ text: 'Hi' }])).join(), /line 0 has no id/);
  assert.match(dialogueIdProblems(npc([{ id: 'hello', text: 'Hi' }], [{ id: 'hello', text: 'Hello?' }])).join(), /reuses the id "hello"/);
  assert.match(dialogueIdProblems(npc([{ id: 'Hello There', text: 'Hi' }])).join(), /lowercase ASCII/);
  assert.match(dialogueIdProblems(npc([{ stock: 'nope', text: 'x' }]), { sharedPhrases: { good: 'Good.' } }).join(), /unknown shared phrase "nope"/);
  assert.deepEqual(dialogueIdProblems(npc([], [{ next: 'root' }])), [], 'a row with no text needs no id (a teach row)');
});
