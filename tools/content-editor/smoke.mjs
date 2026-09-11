#!/usr/bin/env node
/**
 * The editor's standalone check that the shipped skill content and the
 * generated vocabulary still describe the same thing, plus the save seam's own
 * two legs. No server and no dependencies; legs (f) and (g) DO need a built
 * `backend/aurad` (spell builder C2) and say so loudly when it is missing:
 *
 *     node tools/content-editor/smoke.mjs      # or: npm run smoke
 *
 * Three findings classes (plan-content-editor.md §B5 C0, §B8):
 *
 *   (a) every effect's keys are inside effectKeys[type] plus the cost keys
 *       plus "type". This is the fixture kept honest from the JS side: if the
 *       generated vocabulary were narrower than what the loader accepts, the
 *       Skills tab would render a form that cannot express real content.
 *   (b) every top-level key is one of the 15 the loader reads, or starts with
 *       an underscore. ⚑ This is the FIRST check of that class anywhere:
 *       skill JSON is parsed WITHOUT DisallowUnknownFields, so a typo'd
 *       top-level key vanishes in silence and the field it meant to set stays
 *       at its zero value.
 *   (c) the fixture's effect types are exactly shared-constants' effectTypes,
 *       the complement rule's other half, restated here so the check survives
 *       even when nobody runs the Go suite.
 *   (d) the Skills tab's presentation table (skill-presentation.mjs) and the
 *       fixture describe the same key set, BOTH ways: every fixture key has a
 *       conscious presentation entry (a new Go key reaches the form with a
 *       unit and a control, not a guess), and every entry names a live key
 *       (a Go rename cannot leave a stale row). Type notes must name live
 *       types too. C1, §B4.2.
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
import { SKILL_PRESENTATION, COST_PRESENTATION, EFFECT_PRESENTATION, EFFECT_TYPE_NOTES, orphanPerLevelKeys } from './skill-presentation.mjs';
import { validateCandidate } from './aurad-validate.mjs';
import { selfTestFindings } from './aurad-validate.test.mjs';

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

// (e) every per-level key pairs with a base in the same list.
for (const [type, keys] of Object.entries(vocabulary.effectKeys)) {
  for (const key of orphanPerLevelKeys(keys)) finding('api/skill-vocabulary.json', `effectKeys.${type} carries "${key}" without its base key - the per-level preview cannot pair it`);
}
for (const key of orphanPerLevelKeys([...vocabulary.topLevelKeys, ...costKeys])) finding('api/skill-vocabulary.json', `"${key}" has no base key among topLevelKeys/costKeys`);

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
} catch (err) {
  finding('save seam', String(err?.message || err));
}

// (g) the seam's own unit checks.
for (const line of selfTestFindings()) finding('aurad-validate.test.mjs', line);

for (const line of findings) console.log(line);
console.log(`${findings.length} finding(s) across ${fileCount} skill file(s) / ${effectCount} effect(s), ${fixtureTypes.length} effect type(s) in the vocabulary`);
process.exit(findings.length > 0 ? 1 : 0);
