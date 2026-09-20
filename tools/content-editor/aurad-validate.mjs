/**
 * The save seam: ask the REAL loader whether a candidate file would load.
 *
 * `aurad -validate -content <dir>` builds every registry the game builds,
 * runs every cross-validation, prints one finding per line and exits 1 if
 * there are any. This module copies the content tree to a temp directory,
 * writes the candidate over its file there, and runs that (plan-content-editor.md
 * §B4.9, D9). Nothing is written to api/ - the caller decides what to do with
 * the answer.
 *
 * ⭐ WHY A SUBPROCESS AND NOT MORE JS: validate.mjs's rules are hand ports of
 * Go's, and one of them (the `anchor` travel mode) went stale once already.
 * The loader is the only thing that knows what the game accepts, so the seam
 * asks it rather than growing a second opinion. §B11 Q7 is the open question of
 * retiring the ports for the other tabs; this chunk does not touch them.
 *
 * ⚑ NODE ONLY. The browser never imports this - it reaches the seam through
 * the server's POST /api/validate/candidate.
 *
 * ⚑ THE SEAM IS EXACTLY AS CURRENT AS THE LAST `make -C backend build`. The
 * binary carries the loader, so a Go change that is compiled nowhere is a
 * change this seam does not know about. assertAuradFresh below refuses loudly
 * rather than answering from a stale binary.
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prettyJson } from './format.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..', '..');
const BACKEND = path.join(ROOT, 'backend');
const API = path.join(ROOT, 'api');

// The api/ layout diskContent(dir) insists on, and the ONLY thing the temp
// tree gets. api/schema/ (FlatBuffers sources) and the loose fixture jsons
// beside it (shared-constants.json, skill-vocabulary.json) are not content and
// the loader never reads them.
export const CONTENT_SUBDIRS = ['mobs', 'skills', 'recipes', 'zones', 'props', 'factions', 'milestones', 'quests', 'ascension'];

export const MISSING_BINARY_MESSAGE = 'build aurad first: make -C backend build';

// `api/<dir>/<slug>.json`, with at most ONE extra folder level - skills are the
// reason: the player skills sit at api/skills/ and the mob-embedded ones at
// api/skills/mobs/. Deliberately not KIND_PATTERNS from server.mjs, which is
// flat and per-kind; this guard is kind-agnostic on purpose, so the seam works
// for any content file without a table to keep in sync.
const CANDIDATE_PATH = /^api\/([a-z]+)\/(?:([a-z0-9_-]+)\/)?([a-z0-9_-]+\.json)$/;

/**
 * Checks a candidate's repo-relative path and returns the segments under api/.
 * Throws on anything that could write outside the nine content directories.
 */
export function candidateSegments(file) {
  if (typeof file !== 'string' || file.includes('..') || file.includes('\\') || path.isAbsolute(file)) {
    throw new Error(`invalid candidate path ${JSON.stringify(file)}`);
  }
  const m = CANDIDATE_PATH.exec(file);
  if (!m) throw new Error(`invalid candidate path ${JSON.stringify(file)} - expected api/<dir>/[<sub>/]<slug>.json`);
  const [, dir, sub, base] = m;
  if (!CONTENT_SUBDIRS.includes(dir)) throw new Error(`candidate path ${JSON.stringify(file)} is not in a content directory`);
  return sub ? [dir, sub, base] : [dir, base];
}

/**
 * Where the aurad binary is: AURAD_BIN if set, else backend/aurad, else
 * backend/aurad.exe (the Windows dev-restart script builds that one).
 */
export function findAuradBinary() {
  const override = process.env.AURAD_BIN;
  if (override) {
    const abs = path.resolve(ROOT, override);
    if (!existsSync(abs)) throw new Error(`AURAD_BIN=${override} does not exist: ${MISSING_BINARY_MESSAGE}`);
    return abs;
  }
  for (const name of ['aurad', 'aurad.exe']) {
    const abs = path.join(BACKEND, name);
    if (existsSync(abs)) return abs;
  }
  throw new Error(MISSING_BINARY_MESSAGE);
}

/**
 * Refuses to answer from a binary older than the Go sources that built it.
 *
 * ⚑ THIS IS AN mtime COMPARISON, and it is the cheap half of a choice (PO
 * ruling 2026-09-11: mtime guard, build-on-demand offered and declined). A
 * fresh checkout or a clock jump - and this host's wall clock is known to be
 * non-monotonic - can call a current binary stale, which costs one rebuild, or
 * much more rarely let a stale one through. It never silently answers from a
 * binary it can see is old, which is the failure that mattered.
 *
 * ⚑ backend/pkg/api/ is skipped: that is the embedded CONTENT copy, and the
 * seam always passes -content, so an un-cp-defs'd tree cannot affect the answer.
 * Generated FlatBuffers .go files are not skipped - they are real code.
 */
export function assertAuradFresh(bin, backendDir = BACKEND) {
  const binTime = statSync(bin).mtimeMs;
  let newest = { time: 0, file: null };
  const embedded = path.join(backendDir, 'pkg', 'api');

  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (abs === embedded) continue;
        walk(abs);
        continue;
      }
      const isSource = (entry.name.endsWith('.go') && !entry.name.endsWith('_test.go'))
        || entry.name === 'go.mod' || entry.name === 'go.sum';
      if (!isSource) continue;
      const time = statSync(abs).mtimeMs;
      if (time > newest.time) newest = { time, file: abs };
    }
  };
  walk(backendDir);

  if (newest.file && newest.time > binTime) {
    const rel = path.relative(path.dirname(backendDir), newest.file).split(path.sep).join('/');
    throw new Error(`${bin} is older than its Go sources (newest: ${rel}): make -C backend build`);
  }
}

/**
 * Runs the loader over the content tree with `raw` substituted in at `file`.
 * Call with no arguments to validate the tree exactly as it sits on disk.
 *
 * Returns `{ ok, findings, status, stderr }`. A THROW means the validator
 * itself could not answer (missing or stale binary, a crash, a timeout) - never
 * confuse that with `ok: false`, which is the loader refusing the content.
 */
export function validateCandidate({ file, raw } = {}) {
  const bin = findAuradBinary();
  assertAuradFresh(bin);

  const tmp = mkdtempSync(path.join(os.tmpdir(), 'aura-validate-'));
  try {
    for (const name of CONTENT_SUBDIRS) {
      cpSync(path.join(API, name), path.join(tmp, name), { recursive: true });
    }
    if (file !== undefined) {
      const segments = candidateSegments(file);
      const target = path.join(tmp, ...segments);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, prettyJson(raw) + '\n', 'utf8');
    }

    // cwd is backend/ so the run resolves ./conf.json the way a dev boot does
    // (the zone SET is a conf question, and validating a different set from the
    // one that boots would be the wrong answer, quietly).
    const result = spawnSync(bin, ['-validate', '-content', tmp], { cwd: BACKEND, timeout: 30_000, encoding: 'utf8' });
    if (result.error) throw new Error(`could not run ${bin}: ${result.error.message}`);
    if (result.status === null) throw new Error(`${bin} did not exit normally (signal ${result.signal}): ${(result.stderr || '').trim()}`);
    if (result.status === 0) return { ok: true, findings: [], status: 0, stderr: result.stderr };
    if (result.status === 1) return { ok: false, findings: parseFindings(result.stdout), status: 1, stderr: result.stderr };
    throw new Error(`${bin} -validate exited ${result.status}: ${(result.stderr || result.stdout || '').trim()}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// stdout is one finding per line plus a trailing count. The count is not a
// finding and must not be shown as one.
export function parseFindings(stdout) {
  return String(stdout || '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0 && !/^\d+ finding\(s\)$/.test(line));
}
