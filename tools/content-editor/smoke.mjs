#!/usr/bin/env node
/**
 * The editor's standalone check that the shipped skill content and the
 * generated vocabulary still describe the same thing. No server, no aurad, no
 * dependencies:
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

for (const line of findings) console.log(line);
console.log(`${findings.length} finding(s) across ${fileCount} skill file(s) / ${effectCount} effect(s), ${fixtureTypes.length} effect type(s) in the vocabulary`);
process.exit(findings.length > 0 ? 1 : 0);
