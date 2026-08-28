#!/usr/bin/env node
// Re-derive the vendored skill-icon set (UI pass C4).
//
// A ONE-TIME TOOL, never a build step. It reads the `icon` values authored in
// api/skills/*.json (plus the small EXTRAS list below), downloads each glyph
// from game-icons.net once, strips it so `currentColor` can tint it, and writes
// three committed artifacts:
//
//   frontend/src/client-data/icons/vendor/<author>/<name>.svg   the assets
//   frontend/src/client-data/icons/SkillIcons.generated.ts      what ships
//   frontend/src/client-data/icons/NOTICE.md                    CC BY credits
//
// The generated TS module is what the client imports: inlining viewBox + path
// data means no runtime HTTP per icon, no webpack rule to add, and a glyph set
// vitest can read under jsdom. The .svg files are the human-inspectable source
// the module is derived from, and the unit the attribution is written against.
//
// Usage (from the repo root):
//   node scripts/fetch-skill-icons.mjs            # fetch what is missing, regenerate
//   node scripts/fetch-skill-icons.mjs --force    # re-download everything
//   node scripts/fetch-skill-icons.mjs --offline  # regenerate from vendored files only
//
// ⚑ game-icons.net art is CC BY 3.0, per author. The NOTICE file it writes is
// the attribution; keep it beside the assets.

import {readdir, readFile, writeFile, mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skillsDir = join(repoRoot, 'api/skills');
const iconsDir = join(repoRoot, 'frontend/src/client-data/icons');
const vendorDir = join(iconsDir, 'vendor');

// The two glyphs that are NOT derivable from api/skills: baseline utilities are
// deliberately not catalog content (plan-downtime.md D1), so their icons live in
// a table in Utilities.ts instead. Keep this list and UTILITY_ICONS there in
// step - Utilities.test.ts pins the table against the bundled set, so a glyph
// dropped here goes red in vitest rather than silently vanishing from the bar.
const EXTRAS = ['lorc/return-arrow', 'lorc/campfire'];

const args = new Set(process.argv.slice(2));
const force = args.has('--force');
const offline = args.has('--offline');

// game-icons.net serves per-icon SVGs at a colour-parameterised path; white on
// black is the variant whose background rect strips cleanly.
const iconUrl = (path) => `https://game-icons.net/icons/ffffff/000000/1x1/${path}.svg`;

// The background square every game-icons.net export carries. It is the ONLY
// thing that may be dropped silently; anything else surprising hard-fails below.
const BACKGROUND_PATH = /<path\s+d="M0 0h512v512H0z"\s*\/>/g;

function strip(path, raw) {
    const viewBox = raw.match(/viewBox="([^"]+)"/)?.[1];
    if (!viewBox) {
        throw new Error(`${path}: no viewBox`);
    }
    let body = raw.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>[\s\S]*$/, '');
    body = body.replace(BACKGROUND_PATH, '');
    body = body.replace(/\s*fill="#f{3,6}"/gi, '');
    body = body.trim();

    // A differently-structured icon must not ship half-stripped: a leftover
    // fill paints over currentColor and a leftover rect is a black tile, and
    // both look like a CSS bug at the token rather than a sourcing one.
    if (/fill=/.test(body)) {
        throw new Error(`${path}: hardcoded fill survived the strip`);
    }
    if (/<rect|<style|<image/.test(body)) {
        throw new Error(`${path}: unexpected element survived the strip`);
    }
    if (!body) {
        throw new Error(`${path}: nothing left after stripping`);
    }
    return {viewBox, body};
}

async function authoredIcons() {
    // Top level only: api/skills/mobs holds the mob-embedded skills, which
    // author no icon by ruling D1.
    const files = (await readdir(skillsDir, {withFileTypes: true}))
        .filter(e => e.isFile() && e.name.endsWith('.json'))
        .map(e => e.name);
    const icons = new Set(EXTRAS);
    for (const file of files) {
        const def = JSON.parse(await readFile(join(skillsDir, file), 'utf8'));
        if (!def.icon) {
            throw new Error(`${file}: authors no icon (the Go content test pins this too)`);
        }
        icons.add(def.icon);
    }
    return [...icons].sort();
}

async function vendorOne(path) {
    const file = join(vendorDir, `${path}.svg`);
    if (existsSync(file) && !force) {
        return strip(path, await readFile(file, 'utf8'));
    }
    if (offline) {
        throw new Error(`${path}: missing from vendor/ and --offline was given`);
    }
    const response = await fetch(iconUrl(path));
    if (!response.ok) {
        throw new Error(`${path}: GET ${iconUrl(path)} returned ${response.status}`);
    }
    const stripped = strip(path, await response.text());
    await mkdir(dirname(file), {recursive: true});
    await writeFile(file,
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${stripped.viewBox}" fill="currentColor">` +
        `${stripped.body}</svg>\n`);
    console.log(`fetched ${path}`);
    return stripped;
}

const paths = await authoredIcons();
const glyphs = new Map();
for (const path of paths) {
    glyphs.set(path, await vendorOne(path));
}

const module = [
    '// GENERATED by scripts/fetch-skill-icons.mjs - do not edit by hand.',
    '//',
    '// The vendored game-icons.net glyph set (UI pass C4), inlined as viewBox +',
    '// path data so a token renders with no runtime request and tints through',
    '// `currentColor`. Keys are the `icon` values authored in api/skills, which is',
    '// what the /skills catalog serves; the assets themselves live beside this file',
    '// in vendor/, and NOTICE.md carries their CC BY 3.0 attribution.',
    '//',
    '// To change the set: edit the icon values in api/skills (or the utility table',
    '// in Utilities.ts), then re-run the script. Both completeness pins - the Go',
    '// content test and SkillIcons.test.ts - fail on a value with no glyph here.',
    '',
    'export interface Glyph {',
    '    viewBox: string;',
    '    /** The SVG inner markup, already stripped of its background and fills. */',
    '    body: string;',
    '}',
    '',
    'export const SKILL_GLYPHS: { [path: string]: Glyph } = {',
    ...[...glyphs.entries()].map(([path, {viewBox, body}]) =>
        `    ${JSON.stringify(path)}: {viewBox: ${JSON.stringify(viewBox)}, body: ${JSON.stringify(body)}},`),
    '};',
    '',
].join('\n');
await writeFile(join(iconsDir, 'SkillIcons.generated.ts'), module);

const authors = [...new Set(paths.map(p => p.split('/')[0]))].sort();
const notice = [
    '# Vendored icon assets - attribution',
    '',
    'The glyphs in `vendor/` and the data inlined in `SkillIcons.generated.ts`',
    'come from [game-icons.net](https://game-icons.net) and are licensed',
    '**CC BY 3.0** (<https://creativecommons.org/licenses/by/3.0/>).',
    '',
    'They were downloaded once by `scripts/fetch-skill-icons.mjs` and stripped of',
    'their background rectangle and hardcoded fills so the UI can tint them; no',
    'other modification was made. The file name under `vendor/<author>/` is the',
    'icon name on game-icons.net, so every asset stays traceable to its original.',
    '',
    '## Authors used',
    '',
    ...authors.map(author => {
        const used = paths.filter(p => p.startsWith(`${author}/`)).map(p => p.split('/')[1]);
        return `- **${author}** (${used.length}): ${used.join(', ')}`;
    }),
    '',
    `Total: ${paths.length} glyphs.`,
    '',
    'These are FUNCTIONAL PLACEHOLDERS (UI pass C4, ruling D3) - a small shared',
    'vocabulary keyed to what a skill does, expected to be replaced by original',
    'art later.',
    '',
].join('\n');
await writeFile(join(iconsDir, 'NOTICE.md'), notice);

console.log(`${glyphs.size} glyphs from ${authors.length} authors -> SkillIcons.generated.ts`);
