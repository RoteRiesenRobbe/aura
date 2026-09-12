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
import { listJsonFiles } from './files.mjs';
import { prettyJson } from './format.mjs';

// The scope (D2): api/skills/<slug>.json only. candidateSegments already
// rejects everything outside the content directories and any second nesting
// level beyond one; this narrows it to the player-skill folder, so the tab can
// never write a mob-embedded skill it does not show.
const SKILLS_DIR = 'skills';

function refuse(stage, ...errors) {
  return { ok: false, stage, errors };
}

// The bookkeeping a save leaves behind (§B4.7, C4). It rides the RESPONSE
// rather than living in the browser, for two reasons: the registry pin's count
// is a fact about the disk the server just wrote, and a checklist in the
// response is a checklist the unit tests can read.
//
// ⚑ The count is computed, never a line number: registry_test.go's pin moves
// every time the file above it does, and a checklist that names a line goes
// stale the first time someone adds a test.
//
// ⚑ Item 1 is on EVERY save, new or not: a saved file is half-live (L9), and
// that has already cost a debugging session on zones. Items 2 to 4 are what a
// NEW skill owes on top; repeating them after every tuning edit would be a
// checklist nobody reads.
function checklistFor(isNew, skillCount) {
  const out = [
    'Restart aurad: ./scripts/dev-restart-windows.sh server (it boots with -content ../api, so the JSON is read straight from the repo). '
    + 'A plain ./aurad -dev reads the EMBEDDED copy under backend/pkg/api/ instead and needs make -C backend build first. '
    + 'Confirm the boot log\'s "Loaded skill definitions count=" rose.',
  ];
  if (!isNew) return out;
  out.push(`Bump the registry pin in backend/pkg/aura/skills/registry_test.go to assert.Len(t, r.All(), ${skillCount}) - that is the skill files now on disk across api/skills/ and api/skills/mobs/. Until it is bumped, go test is red at HEAD.`);
  out.push('Add a row to docs/content-skill-inventory.md by hand: it was generated once and has been hand-maintained since (it carries its own stale marker). There is no generator script.');
  out.push('Place it in the other tabs (a milestone row, a mob unlocks[], an NPC teach_skill grant, a recipe result, an ascension stone reward) or it stays cheat-only, reachable only through the SKILL cheat.');
  return out;
}

/**
 * Validates and writes one player skill.
 *
 * `isNew` (the tab's "+ New skill" flow, C4) permits creating `file` instead of
 * requiring it to exist, and skips the id and rename guards: there is no
 * on-disk twin to compare against. A duplicate id or name is then the LOADER's
 * refusal through the seam (registry.go says `duplicate skill ID` /
 * `duplicate skill name`), never a JS twin of that rule (D9).
 *
 * `deps`: { root, readMobs, readRecipes, readMilestonesEntry, validateCandidate }.
 * Returns { ok: true, warnings: [], checklist, skillCount } or
 * { ok: false, stage, errors }.
 */
export function saveSkill({ file, raw, isNew }, deps) {
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
  const exists = existsSync(abs);

  // 2. existence, both ways round. A NEW skill must not land on a file that is
  // already there (two tabs, or a name that only looks free), and an EDIT of a
  // file that is not there must not silently create one.
  if (isNew && exists) {
    return refuse('guard', `${file} already exists: reload the editor and edit that skill instead of creating a second file with the same name.`);
  }
  if (!isNew && !exists) {
    return refuse('guard', `${file} does not exist - an edit saves over a shipped file; use "+ New" in the Skills sidebar to create one.`);
  }

  if (!isNew) {
    let onDisk;
    try {
      onDisk = JSON.parse(readFileSync(abs, 'utf8'));
    } catch (err) {
      return refuse('guard', `${file} is not readable as JSON (${err.message}) - fix it by hand before saving over it.`);
    }

    // 3. the id guard: every spellbook row on every character stores this
    // number (game.character_spellbook.skill_id), so it is not editable
    // content. A new skill has no twin to compare against, and its id is the
    // loader's business (a collision is `duplicate skill ID`).
    if (raw.id !== onDisk.id) {
      return refuse('guard', `skill id ${JSON.stringify(onDisk.id)} cannot become ${JSON.stringify(raw.id)}: ids are persisted in every character's spellbook and are never reused (C5 makes this a loader refusal).`);
    }

    // 4. the rename guard (§B10 L5): `name` is the reference key in five other
    // content kinds, and in places this tool cannot see at all. A new skill has
    // no old name, so nothing can reference it yet.
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
  }

  // 5. the seam: the real loader, over a temp copy of the content with this
  // candidate substituted in. A throw here is the validator failing to answer
  // and must reach the caller as such. For a new skill this is also where a
  // duplicate id or name is caught - by Go, not here.
  const { ok, findings } = validateCandidate({ file, raw });
  if (!ok) return { ok: false, stage: 'validate', errors: findings };

  // 6. write. The client round-trips the whole raw object and edits it in
  // place, so _comment and every key the form never renders (hitStyle, legacy,
  // forwardUnits, armTicks - §B4.8, L8) are written back untouched.
  writeFileSync(abs, prettyJson(raw) + '\n', 'utf8');

  // 7. the post-save bookkeeping, counted AFTER the write so a new file is in
  // the number the registry pin needs (§B4.7).
  const skillCount = listJsonFiles(path.join(root, 'api', SKILLS_DIR)).length;
  return { ok: true, warnings: [], checklist: checklistFor(!!isNew, skillCount), skillCount };
}
