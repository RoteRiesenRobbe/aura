/**
 * Shared pieces of the PONETI icon-pack pipeline (see THIRD_PARTY.md and the
 * README section "Icons (PONETI pack)").
 *
 * Two scripts import this: tools/pack-icons.mjs (builds the atlases into the
 * frontend build output) and tools/check-icon-leak.mjs (the pre-commit guard).
 * Everything that both must agree on lives here: where the manifest is, where
 * the atlases go, what an atlas file is called, and how the pack directory is
 * found.
 *
 * ⛔ The raw pack never enters the repo. The manifest names files INSIDE the
 * pack by relative path; the pack itself sits wherever AURA_ICON_PACK_DIR
 * points (backend/.env.local or a machine-scope export, like AURA_DB_URL).
 * Only the seat holder sets it.
 *
 * The ATLASES the packer builds from it land in frontend/icons-prebuilt/, the
 * seat holder's local build, and are copied into frontend/dist/icons/ on every
 * run. ⛔ They do not enter git while the repository is public (PO 2026-09-24):
 * a public clone of the atlases would be a download of licensed art, and git
 * history cannot be un-published. Seat holder only for now (THIRD_PARTY.md);
 * every other build draws the glyphs and the committed portraits.
 */
import {createHash} from 'node:crypto';
import {readFileSync, statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The only icon-related data that is committed: name -> path inside the pack. */
export const MANIFEST_PATH = path.join(ROOT, 'frontend/src/client-data/icons/pack-manifest.json');

/** Where the packer BUILDS: the atlases plus the lookup, kept across
 *  `npm run build` (which wipes dist/) so a repack is not needed per build.
 *  Gitignored while the repo is public (see the header). */
export const PREBUILT_DIR = path.join(ROOT, 'frontend/icons-prebuilt');

/** Where the packer PUBLISHES a copy of the prebuilt set on every run. Under
 *  frontend/dist so the dev server, aurad -dev and the deploy bundle all serve
 *  it at /icons/ with no webpack rule. */
export const OUT_DIR = path.join(ROOT, 'frontend/dist/icons');

export const ENV_PACK_DIR = 'AURA_ICON_PACK_DIR';

export const LOOKUP_NAME = 'icons.json';
export const ATLAS_FILE = /^atlas-[0-9a-f]{12}\.png$/;

/** Every source icon in the pack is this size; the packer refuses anything else. */
export const ICON_SIZE = 256;

/** [PLACEHOLDER] 2048 is the safe phone-GPU texture ceiling; the phone check is
 *  still owed (plan-skill-vfx.md), so 4096 is not assumed. 2 px gutter keeps
 *  linear filtering from bleeding a neighbour in at the cell edge. */
export const ATLAS_SIZE = 2048;
export const GUTTER = 2;

const NAME_RE = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Reads and validates a manifest. Returns entries sorted by name so every
 * consumer (and the atlas layout) is deterministic.
 * Shape: { "icons": { "<name>": "<path relative to the pack root>.png" } }
 */
export function readManifest(file = MANIFEST_PATH) {
    let parsed;
    try {
        parsed = JSON.parse(readFileSync(file, 'utf8'));
    } catch (error) {
        throw new Error(`icon manifest ${rel(file)}: ${error.message}`);
    }
    if (!parsed || typeof parsed.icons !== 'object' || Array.isArray(parsed.icons)) {
        throw new Error(`icon manifest ${rel(file)}: expected {"icons": {name: "path.png"}}`);
    }
    const entries = [];
    for (const [name, packPath] of Object.entries(parsed.icons)) {
        if (!NAME_RE.test(name)) {
            throw new Error(`icon manifest: name "${name}" must match ${NAME_RE} (lowercase, digits, hyphens)`);
        }
        if (typeof packPath !== 'string' || !packPath.toLowerCase().endsWith('.png')) {
            throw new Error(`icon manifest: "${name}" must point at a .png path inside the pack, got ${JSON.stringify(packPath)}`);
        }
        const normalised = packPath.replace(/\\/g, '/');
        if (path.posix.isAbsolute(normalised) || normalised.split('/').includes('..')) {
            throw new Error(`icon manifest: "${name}" must be a relative path inside the pack, got "${packPath}"`);
        }
        entries.push({name, file: normalised});
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    return entries;
}

/**
 * Resolves the pack directory from the environment (or an explicit override).
 * Throws with the fix spelled out when it is unset or not a directory.
 */
export function resolvePackDir(override, env = process.env) {
    const raw = override || env[ENV_PACK_DIR];
    if (!raw) {
        throw new Error(
            `${ENV_PACK_DIR} is not set. Point it at the folder holding the PONETI ` +
            `"6000 Fantasy Icons" PNGs (your own Asset Store seat; see README "Icons (PONETI pack)"). ` +
            `Either export it or add it to backend/.env.local.`);
    }
    const dir = path.resolve(raw);
    let stats;
    try {
        stats = statSync(dir);
    } catch {
        throw new Error(`${ENV_PACK_DIR}=${raw} does not exist (resolved to ${dir}).`);
    }
    if (!stats.isDirectory()) {
        throw new Error(`${ENV_PACK_DIR}=${raw} is not a directory.`);
    }
    return dir;
}

/**
 * Pure grid layout: icon ordinal -> which atlas, and where in it. All icons
 * are ICON_SIZE square, so a fixed grid is exact and needs no bin packer.
 */
export function layoutGrid(count, {atlasSize = ATLAS_SIZE, iconSize = ICON_SIZE, gutter = GUTTER} = {}) {
    const perRow = Math.floor((atlasSize + gutter) / (iconSize + gutter));
    if (perRow < 1) {
        throw new Error(`atlas ${atlasSize} px cannot hold a single ${iconSize} px icon`);
    }
    const perAtlas = perRow * perRow;
    const cells = [];
    for (let i = 0; i < count; i++) {
        const atlas = Math.floor(i / perAtlas);
        const slot = i % perAtlas;
        cells.push({
            atlas,
            x: (slot % perRow) * (iconSize + gutter),
            y: Math.floor(slot / perRow) * (iconSize + gutter),
            w: iconSize,
            h: iconSize,
        });
    }
    return {cells, perRow, perAtlas, atlasCount: count === 0 ? 0 : Math.floor((count - 1) / perAtlas) + 1};
}

/** True when a repo-relative path is a packer output or lives in the build
 *  output: frontend/dist/, the local build in frontend/icons-prebuilt/, an
 *  atlas file by name, or a lookup beside atlases. */
export function isAtlasPath(repoRelPath) {
    const p = repoRelPath.replace(/\\/g, '/');
    if (p.startsWith('frontend/dist/') || p.startsWith('frontend/icons-prebuilt/')) {
        return true;
    }
    const base = path.posix.basename(p);
    const parent = path.posix.basename(path.posix.dirname(p));
    return ATLAS_FILE.test(base) || (parent === 'icons' && base === LOOKUP_NAME);
}

export function sha256(buffer) {
    return createHash('sha256').update(buffer).digest('hex');
}

export function rel(file) {
    return path.relative(ROOT, file).replace(/\\/g, '/') || file;
}
