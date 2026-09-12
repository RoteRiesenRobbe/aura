/**
 * Saving one player skill (spell builder C3, plan-content-editor.md §B5).
 *
 * ⭐ THIS IS NOT saveOne. The four older kinds run validate.mjs's hand port of
 * the Go rules before writing; a skill runs NO JS port (D9). Its gate is the
 * real loader, through the C2 seam, so the only rules typed here are the three
 * the loader cannot see: the path, the persisted id, and a rename's blast
 * radius in other content.
 *
 * ⚑ GUARDS RETURN, THE SEAM MAY THROW. A refused path, a changed id or a live
 * rename come back as {ok:false, stage:'guard'} and the route answers 200 with
 * them, the same shape every other save uses. Only validateCandidate throwing
 * (a missing or stale aurad) escapes, so the route turns it into a 500 - the
 * L12 contract, and the reason the client branches on the HTTP status: "the
 * validator could not run" must never read like "the loader refused this".
 *
 * ⚑ NODE ONLY: the browser reaches this through POST /api/save/skill.
 *
 * Every dependency is injected (root, the three content readers, the seam) so
 * the whole path is testable against a temp copy of api/ - server.mjs listens
 * at import, so nothing testable may live there.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { candidateSegments } from './aurad-validate.mjs';
import { collectSkillReferences } from './skill-references.mjs';
import { prettyJson } from './format.mjs';

// The scope (D2): api/skills/<slug>.json only. candidateSegments already
// rejects everything outside the content directories and any second nesting
// level beyond one; this narrows it to the player-skill folder, so the tab can
// never write a mob-embedded skill it does not show.
const SKILLS_DIR = 'skills';

function refuse(stage, ...errors) {
  return { ok: false, stage, errors };
}

/**
 * Validates and writes one player skill.
 *
 * `deps`: { root, readMobs, readRecipes, readMilestonesEntry, validateCandidate }.
 * Returns { ok: true, warnings: [] } or { ok: false, stage, errors }.
 */
export function saveSkill({ file, raw }, deps) {
  const { root, readMobs, readRecipes, readMilestonesEntry, validateCandidate } = deps;

  // 1. the path guard.
  let segments;
  try {
    segments = candidateSegments(file);
  } catch (err) {
    return refuse('guard', err.message);
  }
  if (segments.length !== 2 || segments[0] !== SKILLS_DIR) {
    return refuse('guard', `${file} is not a player skill: this tab writes api/skills/<slug>.json only (mob-embedded skills under api/skills/mobs/ are out of scope, D2).`);
  }
  const abs = path.join(root, ...file.split('/'));
  if (!existsSync(abs)) {
    return refuse('guard', `${file} does not exist - C3 edits shipped skills only; the "+ New skill" flow arrives with C4.`);
  }

  let onDisk;
  try {
    onDisk = JSON.parse(readFileSync(abs, 'utf8'));
  } catch (err) {
    return refuse('guard', `${file} is not readable as JSON (${err.message}) - fix it by hand before saving over it.`);
  }

  // 2. the id guard: every spellbook row on every character stores this
  // number (game.character_spellbook.skill_id), so it is not editable content.
  if (raw.id !== onDisk.id) {
    return refuse('guard', `skill id ${JSON.stringify(onDisk.id)} cannot become ${JSON.stringify(raw.id)}: ids are persisted in every character's spellbook and are never reused (C5 makes this a loader refusal).`);
  }

  // 3. the rename guard (§B10 L5): `name` is the reference key in five other
  // content kinds, and in places this tool cannot see at all.
  if (raw.name !== onDisk.name) {
    const { sources, refs } = collectSkillReferences(onDisk.name, {
      mobs: readMobs(),
      recipes: readRecipes(),
      milestones: readMilestonesEntry(),
    });
    const rows = [...sources, ...refs];
    if (rows.length > 0) {
      return refuse('guard',
        `cannot rename ${JSON.stringify(onDisk.name)} to ${JSON.stringify(raw.name)}: ${rows.length} piece(s) of content still name it, and a rename is refused rather than cascaded.`,
        ...rows.map((r) => `  referenced by ${r.jump.file}: ${r.label}`),
        `Repoint each of those first. Also invisible to this scan and to the tab: the SKILL ${onDisk.name} cheat, the harness scripts, and the sim-harness presets, which all reference a skill by name.`);
    }
  }

  // 4. the seam: the real loader, over a temp copy of the content with this
  // candidate substituted in. A throw here is the validator failing to answer
  // and must reach the caller as such.
  const { ok, findings } = validateCandidate({ file, raw });
  if (!ok) return { ok: false, stage: 'validate', errors: findings };

  // 5. write. The client round-trips the whole raw object and edits it in
  // place, so _comment and every key the form never renders (hitStyle, legacy,
  // forwardUnits, armTicks - §B4.8, L8) are written back untouched.
  writeFileSync(abs, prettyJson(raw) + '\n', 'utf8');
  return { ok: true, warnings: [] };
}
