#!/usr/bin/env node
/**
 * The content editor: a local, standalone tool for hand-authored NPC
 * dialogue trees (api/mobs/*.json's `interaction` block) and quest stage
 * graphs (api/quests/*.json). Run from the repo root:
 *
 *     node tools/content-editor/server.mjs
 *
 * then open http://localhost:4610. Reads api/mobs, api/quests and api/skills
 * straight off disk on every request (no build step, no running aurad, no
 * dependencies) and writes edits straight back — same posture as
 * tools/tiled/generate-palette.mjs: an adjacent authoring tool, never
 * shipped to players, deriving its pick-lists from api/ instead of
 * duplicating them.
 *
 * See docs/plan-content-editor.md for the design (D1: custom, not an
 * adapted external tool; scope; what this deliberately does not cover).
 *
 * Scope reminder (v1): NPC dialogue trees + quest stage graphs only. Plain
 * mob stat fields, zone spawn placement, new-EntityType wiring and Go
 * registry-count pins are out of scope — this tool never touches them and
 * flags what it can (see validate.mjs) rather than pretending to.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAll, buildIndex, validateInteraction, validateQuest } from './validate.mjs';
import { prettyJson } from './format.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const MOBS_DIR = path.join(ROOT, 'api', 'mobs');
const QUESTS_DIR = path.join(ROOT, 'api', 'quests');
const SKILLS_DIR = path.join(ROOT, 'api', 'skills');
const PUBLIC_DIR = path.join(HERE, 'public');
const PORT = Number(process.env.PORT) || 4610;

function listJsonFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const abs = path.join(dir, name);
    if (statSync(abs).isDirectory()) { out.push(...listJsonFiles(abs)); continue; }
    if (name.endsWith('.json')) out.push(abs);
  }
  return out;
}

function readMobs() {
  return listJsonFiles(MOBS_DIR).map((abs) => ({
    file: path.relative(ROOT, abs).split(path.sep).join('/'),
    abs,
    raw: JSON.parse(readFileSync(abs, 'utf8')),
  }));
}

function readQuests() {
  return listJsonFiles(QUESTS_DIR).map((abs) => ({
    file: path.relative(ROOT, abs).split(path.sep).join('/'),
    abs,
    raw: JSON.parse(readFileSync(abs, 'utf8')),
  }));
}

function readSkillNames() {
  return listJsonFiles(SKILLS_DIR).map((abs) => JSON.parse(readFileSync(abs, 'utf8')).name).filter(Boolean);
}

function writeJson(abs, obj) {
  writeFileSync(abs, prettyJson(obj) + '\n', 'utf8');
}

function sendJson(res, status, body) {
  const buf = Buffer.from(JSON.stringify(body), 'utf8');
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': buf.length });
  res.end(buf);
}

const STATIC_TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };

function serveStatic(res, abs) {
  try {
    const buf = readFileSync(abs);
    const type = STATIC_TYPES[path.extname(abs)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'Content-Length': buf.length });
    res.end(buf);
  } catch {
    res.writeHead(404); res.end('not found');
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 10_000_000) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

// Saves one mob/quest file: re-validates against the CURRENT state of the
// rest of the content (with this one file's would-be content substituted
// in), refuses to write on a structural error, writes and returns any
// warnings otherwise. The full raw object round-trips through the client so
// `_comment` and unrelated fields are preserved (JS object key order
// survives JSON.parse -> mutate -> JSON.stringify for non-numeric keys).
//
// `isNew` (client sets this for a file created via a sidebar "+ New" button)
// permits creating `file` from scratch instead of requiring it to already
// exist on disk — and, as a race guard, refuses if it turns out to already
// exist (two tabs picking the same name). `file` is constrained to a flat
// `api/mobs/<slug>.json` / `api/quests/<slug>.json` shape so it can never
// walk outside its directory.
function saveOne({ kind, file, raw, isNew }) {
  const mobs = readMobs();
  const quests = readQuests();
  const skillNames = readSkillNames();

  const dir = kind === 'mob' ? MOBS_DIR : QUESTS_DIR;
  const relPattern = kind === 'mob' ? /^api\/mobs\/[a-z0-9-]+\.json$/ : /^api\/quests\/[a-z0-9-]+\.json$/;
  if (!relPattern.test(file)) throw new Error(`invalid ${kind} file path ${file}`);
  const abs = path.join(ROOT, ...file.split('/'));
  if (path.dirname(abs) !== dir) throw new Error(`invalid ${kind} file path ${file}`);

  const list = kind === 'mob' ? mobs : quests;
  let target = list.find((e) => e.file === file);
  if (target) {
    if (isNew) return { ok: false, errors: [`${file} already exists — reload and edit it directly instead of creating a duplicate.`] };
    target.raw = raw;
  } else {
    target = { file, abs, raw };
    list.push(target);
  }

  const idx = buildIndex(mobs, quests, skillNames);
  const errors = kind === 'mob' ? validateInteraction(raw, idx) : validateQuest(raw, idx);
  if (errors.length > 0) return { ok: false, errors: errors.map((e) => e.message) };

  writeJson(target.abs, raw);
  // Re-run the full pass post-write for warnings (e.g. "offered by nobody"),
  // informational only — never blocks a save.
  const full = validateAll(mobs, quests, skillNames);
  return { ok: true, warnings: full.warnings.map((w) => w.message) };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (req.method === 'GET' && url.pathname === '/api/data') {
      const mobs = readMobs().map(({ file, raw }) => ({ file, raw }));
      const quests = readQuests().map(({ file, raw }) => ({ file, raw }));
      const skillNames = readSkillNames();
      return sendJson(res, 200, { mobs, quests, skillNames });
    }
    if (req.method === 'GET' && url.pathname === '/api/validate') {
      const mobs = readMobs().map(({ file, raw }) => ({ file, raw }));
      const quests = readQuests().map(({ file, raw }) => ({ file, raw }));
      const skillNames = readSkillNames();
      const { errors, warnings } = validateAll(mobs, quests, skillNames);
      return sendJson(res, 200, {
        errors: errors.map((e) => ({ file: e.file, message: e.message })),
        warnings: warnings.map((w) => ({ file: w.file, message: w.message })),
      });
    }
    if (req.method === 'POST' && url.pathname === '/api/save/mob') {
      const body = await readBody(req);
      return sendJson(res, 200, saveOne({ kind: 'mob', file: body.file, raw: body.raw, isNew: !!body.isNew }));
    }
    if (req.method === 'POST' && url.pathname === '/api/save/quest') {
      const body = await readBody(req);
      return sendJson(res, 200, saveOne({ kind: 'quest', file: body.file, raw: body.raw, isNew: !!body.isNew }));
    }
    if (req.method === 'GET' && url.pathname === '/validate.mjs') {
      return serveStatic(res, path.join(HERE, 'validate.mjs'));
    }
    if (req.method === 'GET') {
      const rel = url.pathname === '/' ? '/index.html' : url.pathname;
      const abs = path.join(PUBLIC_DIR, rel);
      if (!abs.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('forbidden'); }
      return serveStatic(res, abs);
    }
    res.writeHead(405); res.end('method not allowed');
  } catch (err) {
    sendJson(res, 500, { ok: false, errors: [String(err?.message || err)] });
  }
});

server.listen(PORT, () => {
  console.log(`content-editor: http://localhost:${PORT}`);
  console.log(`  reading  ${path.relative(ROOT, MOBS_DIR)}, ${path.relative(ROOT, QUESTS_DIR)}, ${path.relative(ROOT, SKILLS_DIR)}`);
});
