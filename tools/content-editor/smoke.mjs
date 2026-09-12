#!/usr/bin/env node
/**
 * The editor's standalone check that the shipped skill content and the
 * generated vocabulary still describe the same thing, plus the save path's own
 * unit legs. No server and no dependencies; leg (f) DOES need a built
 * `backend/aurad` (spell builder C2) and says so loudly when it is missing:
 *
 *     node tools/content-editor/smoke.mjs      # or: npm run smoke
 *
 * Ten findings classes (plan-content-editor.md §B5 C0, §B8):
 *
 *   (a) every effect's keys are inside effectKeys[type] plus the cost keys
 *       plus "type", and its TYPE is one effectCategories allows on the file's
 *       own category. This is the fixture kept honest from the JS side: if the
 *       generated vocabulary were narrower than what the loader accepts, the
 *       Skills tab would render a form that cannot express real content - and
 *       if the category table disagreed with the content, the picker would
 *       hide a type the game actually ships (C3 rider, PO 2026-09-12).
 *   (b) every top-level key is one of the 15 the loader reads, or starts with
 *       an underscore. ⚑ This is the FIRST check of that class anywhere:
 *       skill JSON is parsed WITHOUT DisallowUnknownFields, so a typo'd
 *       top-level key vanishes in silence and the field it meant to set stays
 *       at its zero value.
 *   (c) the fixture's effect types are exactly shared-constants' effectTypes,
 *       the complement rule's other half, restated here so the check survives
 *       even when nobody runs the Go suite. effectCategories must cover the
 *       same set BOTH ways: a type missing from it would be offered on every
 *       category, which is the flat picker the rider replaced.
 *   (d) the Skills tab's presentation table (skill-presentation.mjs) and the
 *       fixture describe the same key set, BOTH ways: every fixture key has a
 *       conscious presentation entry (a new Go key reaches the form with a
 *       unit and a control, not a guess), and every entry names a live key
 *       (a Go rename cannot leave a stale row). Type notes must name live
 *       types too, and each EFFECT_TYPE_DEFAULTS entry must be a type its own
 *       category may legally author. C1, §B4.2.
 *   (e) every `*PerLevel` key's base is in the same type's list - the pairing
 *       the per-level preview (D5) relies on.
 *   (f) the SAVE SEAM end to end (C2, §B4.9): `aurad -validate` over the real
 *       tree reports nothing, and a candidate carrying an effect key no type
 *       allows is REFUSED with the finding naming that file. A missing or stale
 *       binary is a finding here, never a quiet skip - a seam that cannot run
 *       must not read as a seam that passed.
 *   (g) the seam's unit checks (aurad-validate.test.mjs): the stale-binary
 *       guard and the candidate path guard, both against temp fixtures so no
 *       repo file's mtime is ever touched.
 *   (h) the skill save path's unit checks (save-skill.test.mjs, C3+C4): the
 *       path / id / rename guards, the isNew existence guards both ways, a seam
 *       finding refusing the write, a clean candidate written with its
 *       unrendered keys intact, the post-save checklist and its computed
 *       registry-pin count, and a throwing seam propagating - every case over a
 *       temp copy of api/, none over the repo.
 *   (i) every `icon` authored in api/skills/**.json is a key of the VENDORED
 *       glyph set, parsed out of the generated client artifact by
 *       skill-icons.mjs (C4, §B4.4). This is the editor-side twin of
 *       SkillIcons.test.ts: the picker offers exactly this set, so a value
 *       outside it could only arrive by hand, and it renders in game as a
 *       letter fallback nobody notices.
 *   (j) every name in TEST_RIG_SKILLS is a player skill on disk - the badge is
 *       a name list (nothing in the files marks a cheat rig), so a rename must
 *       not leave it pointing at nothing.
 *
 * ⚑ No underscore exemption at EFFECT level, on purpose: no shipped effect
 * carries a _comment (measured) and Go's validateEffectKeys would refuse one,
 * so an effect-level _comment is a real finding, not noise. Skill-level
 * _comment is the one underscore key the content does ship.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listJsonFiles } from './files.mjs';
import { readSkillVocabulary } from './vocabulary.mjs';
import { SKILL_PRESENTATION, COST_PRESENTATION, EFFECT_PRESENTATION, EFFECT_TYPE_NOTES, EFFECT_TYPE_DEFAULTS, TEST_RIG_SKILLS, orphanPerLevelKeys } from './skill-presentation.mjs';
import { readSkillIcons, SKILL_ICONS_FILE, REGEN_ICONS } from './skill-icons.mjs';
import { validateCandidate } from './aurad-validate.mjs';
import { selfTestFindings as seamSelfTestFindings } from './aurad-validate.test.mjs';
import { selfTestFindings as saveSkillSelfTestFindings } from './save-skill.test.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SKILLS_DIR = path.join(ROOT, 'api', 'skills');
const SHARED_CONSTANTS = path.join(ROOT, 'api', 'shared-constants.json');

const findings = [];
function finding(where, message) {
  findings.push(`${where}: ${message}`);
}

const vocabulary = readSkillVocabulary(ROOT);
const topLevelKeys = new Set(vocabulary.topLevelKeys);
const costKeys = vocabulary.costKeys;

// (c) the two fixtures must describe the same universe of effect types.
const sharedEffectTypes = JSON.parse(readFileSync(SHARED_CONSTANTS, 'utf8')).effectTypes;
const fixtureTypes = Object.keys(vocabulary.effectKeys);
for (const name of sharedEffectTypes) {
  if (!(name in vocabulary.effectKeys)) {
    finding('api/skill-vocabulary.json', `effectKeys has no entry for effect type "${name}", which api/shared-constants.json lists`);
  }
}
for (const name of fixtureTypes) {
  if (!sharedEffectTypes.includes(name)) {
    finding('api/skill-vocabulary.json', `effectKeys names "${name}", which api/shared-constants.json's effectTypes does not`);
  }
}
// (c) the category table describes the same universe, both ways.
const effectCategories = vocabulary.effectCategories || {};
for (const name of fixtureTypes) {
  const legal = effectCategories[name];
  if (!legal || legal.length === 0) {
    finding('api/skill-vocabulary.json', `effectCategories has no entry for effect type "${name}" - the picker would offer it on every skill category, and the loader would refuse whatever the author picked`);
  } else {
    for (const category of legal) {
      if (!vocabulary.categories.includes(category)) finding('api/skill-vocabulary.json', `effectCategories.${name} names category "${category}", which the vocabulary does not carry`);
    }
  }
}
for (const name of Object.keys(effectCategories)) {
  if (!(name in vocabulary.effectKeys)) finding('api/skill-vocabulary.json', `effectCategories names "${name}", which effectKeys does not - regenerate the fixture`);
}

// (d) presentation completeness, both directions, per table.
const PRESENTATION_FILE = 'tools/content-editor/skill-presentation.mjs';
function presentationCheck(tableName, table, liveKeys) {
  const live = new Set(liveKeys);
  for (const key of liveKeys) {
    if (!(key in table)) finding(PRESENTATION_FILE, `${tableName} has no entry for "${key}" - the fixture knows the key, so the form renders it as a plain input until it gets a unit and a control`);
    else if (!table[key].control) finding(PRESENTATION_FILE, `${tableName}.${key} has no "control"`);
  }
  for (const key of Object.keys(table)) {
    if (!live.has(key)) finding(PRESENTATION_FILE, `${tableName} names "${key}", which the vocabulary no longer carries - stale after a Go rename?`);
  }
}
const allEffectKeys = [...new Set(Object.values(vocabulary.effectKeys).flat())];
presentationCheck('SKILL_PRESENTATION', SKILL_PRESENTATION, vocabulary.topLevelKeys);
presentationCheck('COST_PRESENTATION', COST_PRESENTATION, costKeys);
presentationCheck('EFFECT_PRESENTATION', EFFECT_PRESENTATION, allEffectKeys);
for (const type of Object.keys(EFFECT_TYPE_NOTES)) {
  if (!(type in vocabulary.effectKeys)) finding(PRESENTATION_FILE, `EFFECT_TYPE_NOTES names "${type}", which is not an effect type in the vocabulary`);
}
const SECTIONS = ['identity', 'category'];
for (const [key, entry] of Object.entries(SKILL_PRESENTATION)) {
  if (entry.section !== undefined && !SECTIONS.includes(entry.section)) {
    finding(PRESENTATION_FILE, `SKILL_PRESENTATION.${key} has section "${entry.section}", which no block of the skill form draws (expected one of ${SECTIONS.join(', ')}, or none for Identity)`);
  }
}
for (const [category, type] of Object.entries(EFFECT_TYPE_DEFAULTS)) {
  if (!vocabulary.categories.includes(category)) finding(PRESENTATION_FILE, `EFFECT_TYPE_DEFAULTS names category "${category}", which the vocabulary does not carry`);
  if (!(type in vocabulary.effectKeys)) finding(PRESENTATION_FILE, `EFFECT_TYPE_DEFAULTS maps "${category}" to effect type "${type}", which the vocabulary does not carry - a new effect card would open on a type the loader refuses`);
  else if (!(effectCategories[type] || []).includes(category)) {
    finding(PRESENTATION_FILE, `EFFECT_TYPE_DEFAULTS opens a new ${category} card on "${type}", which effectCategories allows only on ${(effectCategories[type] || []).join(', ') || '(nothing)'} - the card would be born illegal and the picker would not even offer the type`);
  }
}

// (e) every per-level key pairs with a base in the same list.
for (const [type, keys] of Object.entries(vocabulary.effectKeys)) {
  for (const key of orphanPerLevelKeys(keys)) finding('api/skill-vocabulary.json', `effectKeys.${type} carries "${key}" without its base key - the per-level preview cannot pair it`);
}
for (const key of orphanPerLevelKeys([...vocabulary.topLevelKeys, ...costKeys])) finding('api/skill-vocabulary.json', `"${key}" has no base key among topLevelKeys/costKeys`);

// (i) the vendored glyph set, parsed off the generated client artifact. A
// broken parse THROWS out of readSkillIcons and that is deliberate: an empty
// icon picker is a worse failure than a loud one.
const glyphs = readSkillIcons(ROOT);
const glyphCount = Object.keys(glyphs).length;

// The Skills tab's own scope (D2), restated here because the icon pin is about
// the rows a player sees: the mob-embedded skills under api/skills/mobs/ author
// no icon by ruling and render no spellbook row.
const PLAYER_SKILL_FILE = /^api\/skills\/[^/]+\.json$/;
const playerSkillNames = [];

let fileCount = 0;
let effectCount = 0;

for (const abs of listJsonFiles(SKILLS_DIR)) {
  const rel = path.relative(ROOT, abs).split(path.sep).join('/');
  let raw;
  try {
    raw = JSON.parse(readFileSync(abs, 'utf8'));
  } catch (err) {
    finding(rel, `is not valid JSON (${err.message})`);
    continue;
  }
  fileCount += 1;

  // (i) the icon, on player skills only. Both halves of the frontend twin
  // (SkillIcons.test.ts): an unauthored icon and one outside the vendored set
  // both ship as a letter fallback nobody notices, and no Go rule sees either.
  if (PLAYER_SKILL_FILE.test(rel)) {
    if (raw.name) playerSkillNames.push(raw.name);
    if (typeof raw.icon !== 'string' || raw.icon === '') {
      finding(rel, `authors no "icon" - every spellbook row needs a glyph, and SkillIcons.test.ts (the frontend twin of this check) reddens on it. Pick one in the Skills tab's icon picker`);
    } else if (!(raw.icon in glyphs)) {
      finding(rel, `icon "${raw.icon}" is not one of the ${glyphCount} vendored glyphs in ${SKILL_ICONS_FILE} - it renders as a letter fallback. Pick a vendored glyph in the Skills tab, or add this one with: ${REGEN_ICONS}`);
    }
  }

  // (b) top-level keys.
  for (const key of Object.keys(raw)) {
    if (key.startsWith('_')) continue;
    if (!topLevelKeys.has(key)) {
      finding(rel, `unknown top-level key "${key}" - the loader parses skill JSON without DisallowUnknownFields, so this key is read by nothing and fails silently`);
    }
  }

  // (a) effect keys.
  const effects = Array.isArray(raw.effects) ? raw.effects : [];
  for (const [i, effect] of effects.entries()) {
    effectCount += 1;
    if (effect === null || typeof effect !== 'object') {
      finding(rel, `effects[${i}] is not an object`);
      continue;
    }
    const type = effect.type;
    const allowed = vocabulary.effectKeys[type];
    if (!allowed) {
      finding(rel, `effects[${i}] has type "${type}", which the vocabulary does not know`);
      continue;
    }
    // The category rule from the JS side: shipped content is the evidence the
    // table is right, the same way (a) uses it for the key lists.
    const legalCategories = effectCategories[type];
    if (legalCategories && vocabulary.categories.includes(raw.category) && !legalCategories.includes(raw.category)) {
      const article = /^[aeiou]/.test(raw.category) ? 'an' : 'a';
      finding(rel, `effects[${i}] has type "${type}" on ${article} ${raw.category} skill, and effectCategories allows it only on ${legalCategories.join(', ')} - either the file never runs that effect or the table is wrong`);
    }
    for (const key of Object.keys(effect)) {
      if (key === 'type' || allowed.includes(key) || costKeys.includes(key)) continue;
      const hint = vocabulary.renamedKeys[key];
      finding(rel, hint
        ? `effects[${i}] (${type}) authors the retired key "${key}" - use ${hint}`
        : `effects[${i}] (${type}) authors "${key}", which effectKeys.${type} does not allow`);
    }
  }
}

// (f) the save seam, both directions. The candidate is a REAL shipped skill
// plus one key no effect type allows - the exact mistake a hand-typed effect
// field makes, and the one the browser's fixture checks can only hint at.
//
// ⚑ The throw is recorded as a finding rather than left to propagate: an
// uncaught "build aurad first" would exit 1 with a stack trace and no summary
// line, which reads like a crash rather than like the one-line instruction it is.
const SEAM_CANDIDATE = 'api/skills/aegis.json';
try {
  const clean = validateCandidate();
  if (!clean.ok) {
    for (const f of clean.findings) finding('aurad -validate', f);
  }

  const raw = JSON.parse(readFileSync(path.join(ROOT, ...SEAM_CANDIDATE.split('/')), 'utf8'));
  raw.effects[0].noSuchKeyAtAll = true;
  const refused = validateCandidate({ file: SEAM_CANDIDATE, raw });
  // BOTH halves matter: a seam that ignored the exit status would still produce
  // findings-looking text, so the refusal itself is asserted first.
  if (refused.ok) finding('save seam', `a candidate with an unknown effect key was ACCEPTED - the seam is not reading aurad's exit status`);
  else if (!refused.findings.some((f) => f.includes('aegis.json'))) {
    finding('save seam', `the refusal did not name ${SEAM_CANDIDATE}: ${refused.findings.join(' | ') || '(no findings)'}`);
  }

  // ⭐ C4: a NEW file reusing a shipped id. save-skill.mjs deliberately grew no
  // duplicate-id or duplicate-name guard of its own (D9: no JS twin of a Go
  // rule), so this asserts the rule it delegates to is really there - through
  // the seam, over the real tree, which a unit case with its own temp root
  // cannot do. The candidate is never written anywhere: validateCandidate
  // substitutes it into a temp copy.
  const duplicate = JSON.parse(readFileSync(path.join(ROOT, ...SEAM_CANDIDATE.split('/')), 'utf8'));
  duplicate.id = 1;
  duplicate.name = 'SmokeDuplicateId';
  const dup = validateCandidate({ file: 'api/skills/smoke-duplicate-id.json', raw: duplicate });
  if (dup.ok) finding('save seam', 'a NEW skill file reusing id 1 was ACCEPTED - the loader is expected to refuse a duplicate skill ID, and save-skill.mjs has no JS twin of that rule');
  else if (!dup.findings.some((f) => /duplicate skill ID/i.test(f))) {
    finding('save seam', `a new file reusing id 1 was refused, but not as a duplicate id: ${dup.findings.join(' | ') || '(no findings)'}`);
  }
} catch (err) {
  finding('save seam', String(err?.message || err));
}

// (j) the test-rig badge's name list. Nothing in the content marks a cheat
// rig, so this is a hand list by necessity - and therefore one that must be
// pinned against the files, or a rename leaves a badge on nothing.
for (const name of TEST_RIG_SKILLS) {
  if (!playerSkillNames.includes(name)) {
    finding(PRESENTATION_FILE, `TEST_RIG_SKILLS names "${name}", which is not a player skill in api/skills/ - the sidebar badge would mark nothing (renamed, moved or deleted?)`);
  }
}

// (g) the seam's own unit checks.
for (const line of seamSelfTestFindings()) finding('aurad-validate.test.mjs', line);

// (h) the skill save path's unit checks (C3).
for (const line of saveSkillSelfTestFindings()) finding('save-skill.test.mjs', line);

for (const line of findings) console.log(line);
console.log(`${findings.length} finding(s) across ${fileCount} skill file(s) / ${effectCount} effect(s), ${fixtureTypes.length} effect type(s) in the vocabulary, ${glyphCount} vendored glyph(s)`);
process.exit(findings.length > 0 ? 1 : 0);
