/**
 * The vendored skill glyphs, read off the generated client artifact (spell
 * builder C4, plan-content-editor.md §B4.4).
 *
 * `frontend/src/client-data/icons/SkillIcons.generated.ts` is written only by
 * `node scripts/fetch-skill-icons.mjs`, which downloads from game-icons.net and
 * regenerates the committed artifacts with their CC BY attribution. It is the
 * set a skill's `icon` value must name: the Go content test asserts every skill
 * AUTHORS an icon, and `SkillIcons.test.ts` asserts every authored value is
 * BUNDLED there. The icon picker offers exactly this set so nobody walks into
 * that second pin by hand.
 *
 * ⚑ Parsed, not imported: the artifact is TypeScript and this tool has no build
 * step. The shape it emits is one glyph per line, so a line regex plus JSON's
 * own string decoding is the whole parser - and a zero-glyph parse THROWS
 * rather than serving an empty picker, the same posture readSkillVocabulary has
 * for a broken fixture (C0): a silently empty vocabulary is worse than a loud
 * failure.
 *
 * ⚑ NODE ONLY (it reads a file). The browser gets the parsed set as
 * `skillIcons` on /api/data.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

export const SKILL_ICONS_FILE = path.join('frontend', 'src', 'client-data', 'icons', 'SkillIcons.generated.ts');

export const REGEN_ICONS = 'node scripts/fetch-skill-icons.mjs';

// One entry of SKILL_GLYPHS, as the generator writes it:
//     "lorc/broadsword": {viewBox: "0 0 512 512", body: "<path d=\"…\"/>"},
const GLYPH_LINE = /^\s*"([^"]+)":\s*\{viewBox:\s*"([^"]*)",\s*body:\s*"((?:[^"\\]|\\.)*)"\s*\}/;

/**
 * The vendored glyph set as `{ [key]: { viewBox, body } }`, keyed by the value
 * a skill's `icon` field carries. Throws when the artifact cannot be read or
 * yields no glyph at all.
 */
export function readSkillIcons(root) {
  const abs = path.join(root, SKILL_ICONS_FILE);
  let src;
  try {
    src = readFileSync(abs, 'utf8');
  } catch (err) {
    throw new Error(`cannot read ${abs} (${err.message}) - it is a GENERATED file, regenerate it with: ${REGEN_ICONS}`);
  }
  const glyphs = {};
  for (const line of src.split('\n')) {
    const m = GLYPH_LINE.exec(line);
    if (!m) continue;
    const [, key, viewBox, body] = m;
    // The body is a JS string literal; let JSON decode its escapes rather than
    // hand-rolling a replace that would turn a \n into an "n".
    glyphs[key] = { viewBox, body: JSON.parse(`"${body}"`) };
  }
  if (Object.keys(glyphs).length === 0) {
    throw new Error(`${abs} yielded no glyphs - the generated shape changed and this parser needs updating (regenerate with: ${REGEN_ICONS})`);
  }
  return glyphs;
}
