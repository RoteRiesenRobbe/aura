#!/usr/bin/env node
/**
 * Unit checks for the skill save path (spell builder C3): the three guards
 * that run BEFORE the seam, the seam's two answers, and the shared reference
 * scan both the guard and the tab's panel read.
 *
 * ⚑ NOT ONE REPO FILE IS WRITTEN. Every case copies api/ into a temp tree and
 * points saveSkill's injected root at it, so "a clean candidate is written in
 * place" can be asserted for real without touching content.
 *
 * ⚑ The seam is INJECTED here, never run: these cases are about what saveSkill
 * does around it (refuse before it, write after it, let a throw out). The seam
 * itself is smoke.mjs leg (f), against the real binary.
 *
 *     node tools/content-editor/save-skill.test.mjs   # standalone
 *
 * smoke.mjs calls selfTestFindings() as leg (h) instead of spawning this.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listJsonFiles } from './files.mjs';
import { collectSkillReferences } from './skill-references.mjs';
import { saveSkill } from './save-skill.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

const OMNI = 'api/skills/omni-aura.json';   // cheat-only (no reference anywhere) AND authors hitStyle + _comment
const DAMAGE = 'api/skills/damage.json';    // the level-1 milestone unlock

const trees = [];
function tempTree() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'aura-save-skill-'));
  cpSync(path.join(ROOT, 'api'), path.join(root, 'api'), { recursive: true });
  trees.push(root);
  return root;
}

// The three content readers saveSkill needs, over a tree root - the same
// shape server.mjs's readMobs/readRecipes/readMilestonesEntry return.
function readersFor(root) {
  const readDir = (dir) => listJsonFiles(path.join(root, 'api', dir)).map((abs) => ({
    file: path.relative(root, abs).split(path.sep).join('/'),
    raw: JSON.parse(readFileSync(abs, 'utf8')),
  }));
  return {
    root,
    readMobs: () => readDir('mobs'),
    readRecipes: () => readDir('recipes'),
    readMilestonesEntry: () => ({
      file: 'api/milestones/milestone-unlocks.json',
      raw: JSON.parse(readFileSync(path.join(root, 'api', 'milestones', 'milestone-unlocks.json'), 'utf8')),
    }),
  };
}

// A stand-in for validateCandidate that records its calls. `answer` is either
// the object to return or a function (to throw from).
function fakeSeam(answer) {
  const fn = (arg) => {
    fn.calls.push(arg);
    if (typeof answer === 'function') return answer(arg);
    return answer;
  };
  fn.calls = [];
  return fn;
}

function readRaw(root, file) {
  return JSON.parse(readFileSync(path.join(root, ...file.split('/')), 'utf8'));
}

export function selfTestFindings() {
  const findings = [];
  const fail = (label, message) => findings.push(`${label}: ${message}`);

  const expectRefusal = (label, result, stage, substring) => {
    if (result.ok !== false) { fail(label, `expected ok:false, got ${JSON.stringify(result)}`); return; }
    if (result.stage !== stage) fail(label, `expected stage ${JSON.stringify(stage)}, got ${JSON.stringify(result.stage)}`);
    const text = (result.errors || []).join(' | ');
    if (substring && !text.includes(substring)) fail(label, `refusal did not mention ${JSON.stringify(substring)} (got ${JSON.stringify(text)})`);
  };

  // --- the path guard: player skills only, one level, must already exist ---
  {
    const root = tempTree();
    const deps = { ...readersFor(root), validateCandidate: fakeSeam({ ok: true, findings: [] }) };
    const raw = readRaw(root, OMNI);

    expectRefusal('path guard(api/mobs/wolf.json)', saveSkill({ file: 'api/mobs/wolf.json', raw }, deps), 'guard', 'api/skills/');
    expectRefusal('path guard(api/skills/mobs/...)', saveSkill({ file: 'api/skills/mobs/wolf-bite.json', raw }, deps), 'guard', 'api/skills/');
    expectRefusal('path guard(../ escape)', saveSkill({ file: '../backend/conf.json', raw }, deps), 'guard');
    expectRefusal('path guard(missing file)', saveSkill({ file: 'api/skills/no-such-skill.json', raw }, deps), 'guard', 'does not exist');
    if (deps.validateCandidate.calls.length !== 0) fail('path guard', 'the seam ran despite a refused path');
  }

  // --- the id guard: ids are persisted in character_spellbook ---
  {
    const root = tempTree();
    const deps = { ...readersFor(root), validateCandidate: fakeSeam({ ok: true, findings: [] }) };
    const raw = readRaw(root, OMNI);
    const before = raw.id;
    raw.id = before + 1000;
    expectRefusal('id guard', saveSkill({ file: OMNI, raw }, deps), 'guard', 'id');
    if (readRaw(root, OMNI).id !== before) fail('id guard', 'the file was written anyway');
    if (deps.validateCandidate.calls.length !== 0) fail('id guard', 'the seam ran despite a refused id change');
  }

  // --- the rename guard (L5): refuse while any content still names it ---
  {
    const root = tempTree();
    const deps = { ...readersFor(root), validateCandidate: fakeSeam({ ok: true, findings: [] }) };
    const raw = readRaw(root, DAMAGE);
    raw.name = 'DamageRenamed';
    const result = saveSkill({ file: DAMAGE, raw }, deps);
    expectRefusal('rename guard(Damage)', result, 'guard', 'Milestone');
    const text = (result.errors || []).join(' | ');
    if (!text.includes('SKILL ')) fail('rename guard(Damage)', 'the refusal does not name the SKILL cheat, which is invisible to this scan');
    if (readRaw(root, DAMAGE).name !== 'Damage') fail('rename guard(Damage)', 'the file was written anyway');
    if (deps.validateCandidate.calls.length !== 0) fail('rename guard(Damage)', 'the seam ran despite a refused rename');
  }

  // A rename with NO reference is allowed through to the seam (the seam's own
  // duplicate-name check is then the gate).
  {
    const root = tempTree();
    const deps = { ...readersFor(root), validateCandidate: fakeSeam({ ok: true, findings: [] }) };
    const raw = readRaw(root, OMNI);
    raw.name = 'OmniAuraRenamed';
    const result = saveSkill({ file: OMNI, raw }, deps);
    if (result.ok !== true) fail('rename guard(unreferenced)', `expected ok:true, got ${JSON.stringify(result)}`);
    if (deps.validateCandidate.calls.length !== 1) fail('rename guard(unreferenced)', `the seam ran ${deps.validateCandidate.calls.length} time(s), expected 1`);
    if (readRaw(root, OMNI).name !== 'OmniAuraRenamed') fail('rename guard(unreferenced)', 'the rename was not written');
  }

  // --- the seam refusing: findings come back verbatim, nothing is written ---
  {
    const root = tempTree();
    const finding = 'skills: cannot map "omni-aura.json": effect 0: unknown key "noSuchKey"';
    const deps = { ...readersFor(root), validateCandidate: fakeSeam({ ok: false, findings: [finding] }) };
    const raw = readRaw(root, OMNI);
    raw.effects[0].damageHP = 99;
    const result = saveSkill({ file: OMNI, raw }, deps);
    expectRefusal('seam refusal', result, 'validate', finding);
    if (readRaw(root, OMNI).effects[0].damageHP === 99) fail('seam refusal', 'the file was written despite a finding');
  }

  // --- a clean candidate is written IN PLACE: _comment and the keys the form
  // never renders (hitStyle, §B4.8 / L8) survive the round trip ---
  {
    const root = tempTree();
    const deps = { ...readersFor(root), validateCandidate: fakeSeam({ ok: true, findings: [] }) };
    const before = readRaw(root, OMNI);
    const raw = readRaw(root, OMNI);
    raw.effects[0].damageHP = 7;
    const result = saveSkill({ file: OMNI, raw }, deps);
    if (result.ok !== true) fail('clean write', `expected ok:true, got ${JSON.stringify(result)}`);
    const after = readRaw(root, OMNI);
    if (after.effects[0].damageHP !== 7) fail('clean write', 'the edit was not written');
    if (after._comment !== before._comment) fail('clean write', '_comment did not survive the round trip');
    if (after.effects[0].hitStyle !== before.effects[0].hitStyle) fail('clean write', 'hitStyle (never rendered, §B4.8) did not survive the round trip');
    if (JSON.stringify(after.effects[1]) !== JSON.stringify(before.effects[1])) fail('clean write', 'an untouched effect changed');
  }

  // --- a THROWING seam propagates: a missing or stale binary must never look
  // like a pass or like a finding (L12) ---
  {
    const root = tempTree();
    const deps = {
      ...readersFor(root),
      validateCandidate: fakeSeam(() => { throw new Error('build aurad first: make -C backend build'); }),
    };
    const raw = readRaw(root, OMNI);
    raw.effects[0].damageHP = 42;
    let threw = null;
    try { saveSkill({ file: OMNI, raw }, deps); } catch (err) { threw = err; }
    if (!threw) fail('throwing seam', 'the throw was swallowed - a seam that could not answer would read as a pass');
    else if (!String(threw.message).includes('build aurad first')) fail('throwing seam', `the throw lost its message (${JSON.stringify(threw.message)})`);
    if (readRaw(root, OMNI).effects[0].damageHP === 42) fail('throwing seam', 'the file was written despite the seam not answering');
  }

  // --- C4: a NEW skill. The path guard still applies, the file must NOT
  // already exist, and the id and rename guards are skipped: there is no
  // on-disk twin to compare against, and duplicate ids / names are the
  // loader's refusal (registry.go), never a JS twin of it (D9) ---
  {
    const root = tempTree();
    const deps = { ...readersFor(root), validateCandidate: fakeSeam({ ok: true, findings: [] }) };
    const raw = readRaw(root, OMNI);
    expectRefusal('new skill(file exists)', saveSkill({ file: OMNI, raw, isNew: true }, deps), 'guard', 'already exists');
    if (deps.validateCandidate.calls.length !== 0) fail('new skill(file exists)', 'the seam ran despite a refused create');
  }

  // An EDIT of a file that is not there is still refused - "+ New" is the only
  // way to create one, and a typo'd path must not silently write a new file.
  {
    const root = tempTree();
    const deps = { ...readersFor(root), validateCandidate: fakeSeam({ ok: true, findings: [] }) };
    const raw = readRaw(root, OMNI);
    expectRefusal('edit(missing file)', saveSkill({ file: 'api/skills/no-such-skill.json', raw }, deps), 'guard', 'does not exist');
  }

  {
    const root = tempTree();
    const deps = { ...readersFor(root), validateCandidate: fakeSeam({ ok: true, findings: [] }) };
    const before = listJsonFiles(path.join(root, 'api', 'skills')).length;
    // Deliberately a DUPLICATE id and a DUPLICATE name: both are the loader's
    // refusal through the seam, and this case proves the JS guards do not
    // pre-empt it (the fake seam answers clean, so the write goes through).
    const raw = { id: 1, name: 'Damage', icon: 'lorc/broadsword', category: 'active_aura', maxLevel: 5, effects: [{ type: 'damage_aura', radius: 1, damageHP: 5, targetsEnemies: true }] };
    const file = 'api/skills/unit-new-skill.json';
    const result = saveSkill({ file, raw, isNew: true }, deps);
    if (result.ok !== true) { fail('new skill(clean)', `expected ok:true, got ${JSON.stringify(result)}`); }
    if (deps.validateCandidate.calls.length !== 1) fail('new skill(clean)', `the seam ran ${deps.validateCandidate.calls.length} time(s), expected 1`);
    const after = listJsonFiles(path.join(root, 'api', 'skills'));
    if (after.length !== before + 1) fail('new skill(clean)', `${before} skill file(s) became ${after.length}, expected ${before + 1}`);
    try {
      if (JSON.stringify(readRaw(root, file)) !== JSON.stringify(raw)) fail('new skill(clean)', 'the written file is not the candidate');
    } catch (err) {
      fail('new skill(clean)', `${file} was not written (${err.code || err.message})`);
    }

    // The checklist is part of the RESPONSE (so it is testable here, not only
    // in the browser): four items for a new skill, and the registry-pin line
    // carries the count computed from the files on disk after the write.
    const checklist = result.checklist || [];
    if (checklist.length !== 4) fail('new skill(checklist)', `${checklist.length} item(s), expected 4: ${JSON.stringify(checklist)}`);
    if (result.skillCount !== after.length) fail('new skill(checklist)', `skillCount ${result.skillCount}, expected ${after.length} (the files on disk across both folders)`);
    const text = checklist.join(' | ');
    for (const needle of ['dev-restart-windows.sh', 'Loaded skill definitions count=', 'registry_test.go', `r.All(), ${after.length}`, 'content-skill-inventory.md', 'cheat-only']) {
      if (!text.includes(needle)) fail('new skill(checklist)', `no item mentions ${JSON.stringify(needle)}: ${JSON.stringify(checklist)}`);
    }
  }

  // An edit gets the restart line ONLY: the pin, the inventory row and the
  // placement reminder are things a NEW skill owes, and a checklist that
  // repeats them on every tuning save is a checklist nobody reads.
  {
    const root = tempTree();
    const deps = { ...readersFor(root), validateCandidate: fakeSeam({ ok: true, findings: [] }) };
    const raw = readRaw(root, OMNI);
    raw.effects[0].damageHP = 8;
    const result = saveSkill({ file: OMNI, raw }, deps);
    if (result.ok !== true) fail('edit(checklist)', `expected ok:true, got ${JSON.stringify(result)}`);
    const checklist = result.checklist || [];
    if (checklist.length !== 1) fail('edit(checklist)', `${checklist.length} item(s), expected 1: ${JSON.stringify(checklist)}`);
    if (!(checklist[0] || '').includes('dev-restart-windows.sh')) fail('edit(checklist)', `the one item is not the restart line: ${JSON.stringify(checklist[0])}`);
  }

  // --- the shared reference scan, against the REAL content ---
  {
    const content = readersFor(ROOT);
    const deps = { mobs: content.readMobs(), recipes: content.readRecipes(), milestones: content.readMilestonesEntry() };
    const has = (rows, substring) => rows.some((r) => r.label.includes(substring));

    const damage = collectSkillReferences('Damage', deps);
    if (!has(damage.sources, 'Milestone · level 1')) fail('collectSkillReferences(Damage)', `no level-1 milestone source (got ${JSON.stringify(damage.sources.map((s) => s.label))})`);

    const taunt = collectSkillReferences('Taunt', deps);
    if (!has(taunt.sources, 'RallyDrummer')) fail('collectSkillReferences(Taunt)', `RallyDrummer does not carry it (got ${JSON.stringify(taunt.sources.map((s) => s.label))})`);
    if (!has(taunt.sources, 'CityGuard')) fail('collectSkillReferences(Taunt)', 'the CityGuard teaching grant is missing');
    const teachRow = taunt.sources.find((s) => s.label.includes('CityGuard'));
    if (teachRow && !teachRow.jump.nodeId) fail('collectSkillReferences(Taunt)', 'the teaching row carries no nodeId to jump to');

    const barrier = collectSkillReferences('Barrier', deps);
    if (!has(barrier.sources, 'Recipe #')) fail('collectSkillReferences(Barrier)', `no recipe source (got ${JSON.stringify(barrier.sources.map((s) => s.label))})`);

    const omni = collectSkillReferences('OmniAura', deps);
    if (omni.sources.length !== 0 || omni.refs.length !== 0) fail('collectSkillReferences(OmniAura)', `expected cheat-only, got ${JSON.stringify([...omni.sources, ...omni.refs].map((s) => s.label))}`);

    const nothing = collectSkillReferences('', deps);
    if (nothing.sources.length !== 0 || nothing.refs.length !== 0) fail('collectSkillReferences("")', 'an unnamed skill matched something');
  }

  for (const root of trees.splice(0)) rmSync(root, { recursive: true, force: true });
  return findings;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const findings = selfTestFindings();
  for (const line of findings) console.log(line);
  console.log(`${findings.length} finding(s) in the skill save path's unit checks`);
  process.exit(findings.length > 0 ? 1 : 0);
}
