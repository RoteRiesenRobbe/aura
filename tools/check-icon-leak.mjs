#!/usr/bin/env node
/**
 * Refuses a commit (or a tree) that carries a PONETI icon-pack file or a
 * generated atlas. The raw pack is licensed per seat and may ship only inside
 * the game build, never in the repo or its history (THIRD_PARTY.md).
 *
 *   node tools/check-icon-leak.mjs --staged     # what .githooks/pre-commit runs
 *   node tools/check-icon-leak.mjs --tree       # every tracked file (CI)
 *   node tools/check-icon-leak.mjs --self-test  # fake pack in a temp dir, no licence needed
 *
 * Three rules, each independent so a missing pack still leaves two standing:
 *   1. PATH: anything under frontend/dist/, an atlas-<hash>.png, or icons/icons.json,
 *      the packer's local build in frontend/icons-prebuilt/ included (public repo,
 *      THIRD_PARTY.md).
 *   2. NAME: a raster whose basename equals a pack-manifest.json entry's basename.
 *   3. CONTENT: a raster whose SHA-256 matches a file in $AURA_ICON_PACK_DIR.
 *      Needs the pack: an index of its hashes is built once and cached under
 *      frontend/node_modules/.cache/ (gitignored), revalidated by size + mtime.
 *      Without the variable this rule is skipped WITH A WARNING, not silently.
 *
 * Exit 1 lists every violation. `git commit --no-verify` bypasses the hook;
 * the --tree run in CI is the backstop for that.
 */
import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {ENV_PACK_DIR, MANIFEST_PATH, ROOT, isAtlasPath, readManifest, resolvePackDir, sha256} from './icon-pack-common.mjs';

const RASTER = /\.(png|jpe?g|webp|gif|bmp|tga|psd)$/i;
const CACHE_FILE = path.join(ROOT, 'frontend/node_modules/.cache/aura-icon-pack-hashes.json');

function git(args, opts = {}) {
    return execFileSync('git', args, {cwd: ROOT, encoding: 'buffer', maxBuffer: 256 * 1024 * 1024, ...opts});
}

function listStaged() {
    const out = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']).toString('utf8');
    return out.split('\0').filter(Boolean).map((p) => ({path: p, read: () => git(['show', `:${p}`])}));
}

function listTree() {
    const out = git(['ls-files', '-z']).toString('utf8');
    return out.split('\0').filter(Boolean).map((p) => ({path: p, read: () => readFileSync(path.join(ROOT, p))}));
}

function walkPngs(dir, base = dir, acc = []) {
    for (const entry of readdirSync(dir, {withFileTypes: true})) {
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) walkPngs(abs, base, acc);
        else if (RASTER.test(entry.name)) acc.push(path.relative(base, abs).replace(/\\/g, '/'));
    }
    return acc;
}

/** relpath -> {size, mtimeMs, sha256} for every raster in the pack, cached. */
export function packHashIndex(packDir, cacheFile = CACHE_FILE) {
    let cached = {};
    try {
        const parsed = JSON.parse(readFileSync(cacheFile, 'utf8'));
        if (parsed.packDir === packDir) cached = parsed.files;
    } catch { /* no cache yet */ }
    const files = {};
    let hashed = 0;
    for (const relPath of walkPngs(packDir)) {
        const abs = path.join(packDir, relPath);
        const {size, mtimeMs} = statSync(abs);
        const prev = cached[relPath];
        if (prev && prev.size === size && prev.mtimeMs === mtimeMs) {
            files[relPath] = prev;
        } else {
            files[relPath] = {size, mtimeMs, sha256: sha256(readFileSync(abs))};
            hashed++;
        }
    }
    if (hashed > 0 || Object.keys(cached).length !== Object.keys(files).length) {
        mkdirSync(path.dirname(cacheFile), {recursive: true});
        writeFileSync(cacheFile, JSON.stringify({packDir, files}));
    }
    const byHash = new Map();
    for (const [relPath, info] of Object.entries(files)) byHash.set(info.sha256, relPath);
    return byHash;
}

/**
 * Classifies a list of {path, read} candidates. Pure apart from reading file
 * bytes. `packDir` null means rule 3 is off.
 */
export function findLeaks(files, {manifestEntries, packDir, cacheFile = CACHE_FILE}) {
    const manifestNames = new Set(manifestEntries.map(({file}) => path.posix.basename(file).toLowerCase()));
    const packIndex = packDir ? packHashIndex(packDir, cacheFile) : null;
    const packInsideRepo = packDir && !path.relative(ROOT, packDir).startsWith('..') && !path.isAbsolute(path.relative(ROOT, packDir))
        ? path.relative(ROOT, packDir).replace(/\\/g, '/') + '/'
        : null;
    const violations = [];
    for (const file of files) {
        const p = file.path.replace(/\\/g, '/');
        if (isAtlasPath(p)) {
            violations.push({path: p, rule: 'generated icon atlas / build output'});
            continue;
        }
        if (packInsideRepo && p.startsWith(packInsideRepo)) {
            violations.push({path: p, rule: `inside ${ENV_PACK_DIR}`});
            continue;
        }
        if (!RASTER.test(p)) continue;
        if (manifestNames.has(path.posix.basename(p).toLowerCase())) {
            violations.push({path: p, rule: 'basename is a pack-manifest.json entry'});
            continue;
        }
        if (packIndex) {
            const hit = packIndex.get(sha256(file.read()));
            if (hit) violations.push({path: p, rule: `identical to pack file ${hit}`});
        }
    }
    return violations;
}

function run(mode) {
    const files = mode === '--tree' ? listTree() : listStaged();
    const manifestEntries = existsSync(MANIFEST_PATH) ? readManifest() : [];
    let packDir = null;
    try {
        packDir = resolvePackDir(undefined, process.env);
    } catch (error) {
        console.warn(`⚠️  check-icon-leak: content rule skipped (${error.message.split('.')[0]}). Path and name rules still apply.`);
    }
    const violations = findLeaks(files, {manifestEntries, packDir});
    if (violations.length === 0) {
        console.log(`✓ check-icon-leak: ${files.length} file(s) clean`);
        return 0;
    }
    console.error(`✖ check-icon-leak: ${violations.length} file(s) must not enter the repo (THIRD_PARTY.md):`);
    for (const {path: p, rule} of violations) console.error(`  ${p}  [${rule}]`);
    console.error(`Unstage them (git restore --staged <path>) and keep the pack under ${ENV_PACK_DIR}.`);
    return 1;
}

// ---------------------------------------------------------------------------
async function selfTest() {
    const sharp = (await import('node:module')).createRequire(path.join(ROOT, 'frontend/package.json'))('sharp');
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'aura-icon-leak-'));
    const packDir = path.join(tmp, 'pack');
    const stray = path.join(tmp, 'stray');
    const cacheFile = path.join(tmp, 'cache.json');
    let passed = 0;
    const ok = (label) => { passed++; console.log(`  PASS ${label}`); };
    const solid = (r, g, b) => sharp({create: {width: 256, height: 256, channels: 4, background: {r, g, b, alpha: 255}}}).png().toBuffer();
    const fileOf = (repoPath, abs) => ({path: repoPath, read: () => readFileSync(abs)});
    try {
        mkdirSync(path.join(packDir, 'Icons'), {recursive: true});
        mkdirSync(stray, {recursive: true});
        writeFileSync(path.join(packDir, 'Icons/Icon_Sword_01.png'), await solid(200, 10, 10));
        writeFileSync(path.join(packDir, 'Icons/Icon_Shield_01.png'), await solid(10, 200, 10));
        writeFileSync(path.join(stray, 'renamed.png'), await solid(10, 200, 10));   // a pack file under a new name
        writeFileSync(path.join(stray, 'original.png'), await solid(10, 10, 200));  // our own art, not in the pack
        writeFileSync(path.join(stray, 'notes.txt'), 'text');
        const manifestEntries = [{name: 'sword', file: 'Icons/Icon_Sword_01.png'}];

        const files = [
            fileOf('frontend/src/features/ui/assets/renamed.png', path.join(stray, 'renamed.png')),
            fileOf('frontend/src/features/ui/assets/original.png', path.join(stray, 'original.png')),
            fileOf('docs/art/Icon_Sword_01.png', path.join(stray, 'original.png')),
            fileOf('frontend/dist/icons/icons.json', path.join(stray, 'notes.txt')),
            fileOf('tools/icons/atlas-0123456789ab.png', path.join(stray, 'original.png')),
            fileOf('docs/notes.txt', path.join(stray, 'notes.txt')),
            fileOf('frontend/icons-prebuilt/atlas-0123456789ab.png', path.join(stray, 'original.png')),
            fileOf('frontend/icons-prebuilt/icons.json', path.join(stray, 'notes.txt')),
        ];
        const v = findLeaks(files, {manifestEntries, packDir, cacheFile});
        const byPath = Object.fromEntries(v.map((x) => [x.path, x.rule]));
        if (!/identical to pack file Icons\/Icon_Shield_01.png/.test(byPath['frontend/src/features/ui/assets/renamed.png'])) throw new Error(`renamed pack file not caught: ${JSON.stringify(v)}`);
        ok('a pack file under a new name is caught by content hash');
        if (byPath['frontend/src/features/ui/assets/original.png']) throw new Error('own art was flagged');
        if (byPath['docs/notes.txt']) throw new Error('text file was flagged');
        ok('own art and text pass');
        if (!/basename/.test(byPath['docs/art/Icon_Sword_01.png'])) throw new Error('manifest basename not caught');
        ok('a manifest basename is caught even with different bytes');
        if (!byPath['frontend/dist/icons/icons.json'] || !byPath['tools/icons/atlas-0123456789ab.png']) throw new Error('atlas outputs not caught');
        ok('build output and atlas names are caught');
        if (!byPath['frontend/icons-prebuilt/atlas-0123456789ab.png'] || !byPath['frontend/icons-prebuilt/icons.json']) throw new Error('the local prebuilt build was not flagged');
        ok('the local build in frontend/icons-prebuilt/ is refused too');
        if (v.length !== 6) throw new Error(`expected 6 violations, got ${v.length}`);

        const noPack = findLeaks(files, {manifestEntries, packDir: null, cacheFile});
        if (noPack.some((x) => x.path.endsWith('renamed.png'))) throw new Error('content rule ran without a pack');
        if (noPack.length !== 5) throw new Error(`expected 5 violations without the pack, got ${noPack.length}`);
        ok('without the pack dir the path and name rules still stand');

        const cache = JSON.parse(readFileSync(cacheFile, 'utf8'));
        if (Object.keys(cache.files).length !== 2) throw new Error('hash cache not written');
        const before = statSync(cacheFile).mtimeMs;
        findLeaks(files, {manifestEntries, packDir, cacheFile});
        if (statSync(cacheFile).mtimeMs !== before) throw new Error('cache rewritten although nothing changed');
        ok('pack hash index is cached and reused');

        console.log(`check-icon-leak self-test: ${passed} PASS / 0 FAIL`);
    } finally {
        rmSync(tmp, {recursive: true, force: true});
    }
}

// Always dispatches: nothing imports this file, and a "main module" guard that
// mis-compares paths would let the hook pass having checked nothing.
const mode = process.argv[2] || '--staged';
if (mode === '--self-test') {
    selfTest().catch((error) => { console.error(`✖ check-icon-leak self-test: ${error.message}`); process.exit(1); });
} else if (mode === '--staged' || mode === '--tree') {
    try {
        process.exit(run(mode));
    } catch (error) {
        console.error(`✖ check-icon-leak: ${error.message}`);
        process.exit(1);
    }
} else {
    console.error(`usage: check-icon-leak.mjs [--staged | --tree | --self-test]`);
    process.exit(2);
}
