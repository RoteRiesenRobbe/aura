// The skill-authoring vocabulary, read off disk from the two fixtures that
// hold it (plan-content-editor.md §B3/§B4.2).
//
// ⚑ The point of this module is that the tool NEVER types a per-type field
// list by hand. api/skill-vocabulary.json is generated from the Go tables that
// actually parse a skill file, so a new effect key reaches the form with no
// hand work, and a stale copy is impossible: the Go golden test refuses to
// pass until the fixture is regenerated.
//
// The two files are complements, never overlapping: api/shared-constants.json
// carries the four vocabularies the CLIENT also restates (effect types,
// selectors, gate keys, stat names), because those are a cross-language wire
// contract with its own twin pins. Everything else lives in the generated
// fixture. This function merges them into the one object the editor consumes.
import { readFileSync } from 'node:fs';
import path from 'node:path';

const REGEN = 'UPDATE_SKILL_VOCABULARY=1 go test -count=1 ./pkg/aura/skills/  (run from backend/)';

// The keys taken from shared-constants: the complement half. Listed rather
// than merged wholesale because shared-constants also holds a pile of values
// that have nothing to do with authoring a skill.
const SHARED_KEYS = ['effectTypes', 'selectors', 'gateKeys', 'statNames'];

export function readSkillVocabulary(root) {
  const fixturePath = path.join(root, 'api', 'skill-vocabulary.json');
  const sharedPath = path.join(root, 'api', 'shared-constants.json');

  let fixture;
  try {
    fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
  } catch (err) {
    throw new Error(`cannot read ${fixturePath} (${err.message}) - it is a GENERATED file, regenerate it with: ${REGEN}`);
  }
  const shared = JSON.parse(readFileSync(sharedPath, 'utf8'));

  // Underscore keys are the fixtures' own prose comments, not vocabulary.
  const merged = {};
  for (const [key, value] of Object.entries(fixture)) {
    if (key.startsWith('_')) continue;
    merged[key] = value;
  }
  for (const key of SHARED_KEYS) {
    if (shared[key] === undefined) {
      throw new Error(`${sharedPath} is missing "${key}" - the skill vocabulary is split across both files and this half is authored there`);
    }
    merged[key] = shared[key];
  }
  return merged;
}
