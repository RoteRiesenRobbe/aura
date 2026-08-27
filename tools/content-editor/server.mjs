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
 * Scope reminder: NPC dialogue trees, quest stage graphs, full mob/NPC stat
 * fields (tier/factors/body/skills/unlocks/faction/entityType), faction
 * definitions, recipes (api/recipes/*.json) and the milestone-unlock table
 * (api/milestones/milestone-unlocks.json — ONE shared file, not one per
 * entry). Zone spawn placement, new-EntityType/art wiring and Go
 * registry-count pins stay out of scope — this tool never touches them and
 * flags what it can (see validate.mjs) rather than pretending to.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAll, buildIndex, validateInteraction, validateQuest, validateMob, validateFaction, validateRecipe, validateMilestones } from './validate.mjs';
import { prettyJson } from './format.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const MOBS_DIR = path.join(ROOT, 'api', 'mobs');
const QUESTS_DIR = path.join(ROOT, 'api', 'quests');
const SKILLS_DIR = path.join(ROOT, 'api', 'skills');
const FACTIONS_DIR = path.join(ROOT, 'api', 'factions');
const RECIPES_DIR = path.join(ROOT, 'api', 'recipes');
const MILESTONES_FILE = path.join(ROOT, 'api', 'milestones', 'milestone-unlocks.json');
const ENTITY_TYPE_TS = path.join(ROOT, 'api', 'schema', 'js', 'aura-api', 'entity-type.ts');
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

function readSkillDefs() {
  return listJsonFiles(SKILLS_DIR).map((abs) => JSON.parse(readFileSync(abs, 'utf8')));
}
function readSkillNames() {
  return readSkillDefs().map((d) => d.name).filter(Boolean);
}
// Recipe ingredient levels are checked against the skill's OWN maxLevel
// (recipe.go), so recipe validation needs this in addition to the bare name
// set readSkillNames() gives everyone else.
function readSkillMaxLevels() {
  const out = {};
  for (const d of readSkillDefs()) if (d.name) out[d.name] = d.maxLevel;
  return out;
}

function readFactions() {
  return listJsonFiles(FACTIONS_DIR).map((abs) => ({
    file: path.relative(ROOT, abs).split(path.sep).join('/'),
    abs,
    raw: JSON.parse(readFileSync(abs, 'utf8')),
  }));
}

function readRecipes() {
  return listJsonFiles(RECIPES_DIR).map((abs) => ({
    file: path.relative(ROOT, abs).split(path.sep).join('/'),
    abs,
    raw: JSON.parse(readFileSync(abs, 'utf8')),
  }));
}

// Unlike every other content kind, this is ONE file holding a JSON array
// rather than one-file-per-entry — saveMilestones() below rewrites the whole
// array rather than routing through saveOne()'s per-file KIND_DIRS machinery.
function readMilestonesEntry() {
  return {
    file: path.relative(ROOT, MILESTONES_FILE).split(path.sep).join('/'),
    abs: MILESTONES_FILE,
    raw: JSON.parse(readFileSync(MILESTONES_FILE, 'utf8')),
  };
}

// api/schema/js/aura-api/entity-type.ts is FlatBuffers-generated (`do not
// modify`) — read straight off it rather than hand-duplicating the enum, so
// this list can never drift from what ResolveEntityType actually accepts.
function readEntityTypes() {
  const src = readFileSync(ENTITY_TYPE_TS, 'utf8');
  return [...src.matchAll(/^\s{2}(\w+)\s*=\s*\d+,?$/gm)].map((m) => m[1]);
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

const KIND_DIRS = { mob: MOBS_DIR, quest: QUESTS_DIR, faction: FACTIONS_DIR, recipe: RECIPES_DIR };
// Faction filenames use the same snake_case as their `name` field
// (wildlife_predator.json), unlike mobs/quests/recipes' kebab-case slugs. A
// recipe's filename has no fixed relationship to its `result` field at all
// (e.g. `barrier-home.json` results in "Barrier") — it's just a slug.
const KIND_PATTERNS = {
  mob: /^api\/mobs\/[a-z0-9-]+\.json$/,
  quest: /^api\/quests\/[a-z0-9-]+\.json$/,
  faction: /^api\/factions\/[a-z0-9_]+\.json$/,
  recipe: /^api\/recipes\/[a-z0-9-]+\.json$/,
};

// Saves one mob/quest/faction file: re-validates against the CURRENT state
// of the rest of the content (with this one file's would-be content
// substituted in), refuses to write on a structural error, writes and
// returns any warnings otherwise. The full raw object round-trips through
// the client so `_comment` and unrelated fields are preserved (JS object key
// order survives JSON.parse -> mutate -> JSON.stringify for non-numeric
// keys).
//
// `isNew` (client sets this for a file created via a sidebar "+ New" button)
// permits creating `file` from scratch instead of requiring it to already
// exist on disk — and, as a race guard, refuses if it turns out to already
// exist (two tabs picking the same name). `file` is constrained to a flat
// `api/<kind-dir>/<slug>.json` shape so it can never walk outside its
// directory.
function saveOne({ kind, file, raw, isNew }) {
  const mobs = readMobs();
  const quests = readQuests();
  const skillNames = readSkillNames();
  const skillMaxLevels = readSkillMaxLevels();
  const factions = readFactions();
  const recipes = readRecipes();
  const factionNames = factions.map((f) => f.raw.name);
  const entityTypes = readEntityTypes();

  const dir = KIND_DIRS[kind];
  if (!dir || !KIND_PATTERNS[kind].test(file)) throw new Error(`invalid ${kind} file path ${file}`);
  const abs = path.join(ROOT, ...file.split('/'));
  if (path.dirname(abs) !== dir) throw new Error(`invalid ${kind} file path ${file}`);

  const list = kind === 'mob' ? mobs : kind === 'quest' ? quests : kind === 'faction' ? factions : recipes;
  let target = list.find((e) => e.file === file);
  if (target) {
    if (isNew) return { ok: false, errors: [`${file} already exists — reload and edit it directly instead of creating a duplicate.`] };
    target.raw = raw;
  } else {
    target = { file, abs, raw };
    list.push(target);
  }

  const idx = buildIndex(mobs, quests, skillNames, { factionNames, entityTypes, skillMaxLevels, recipes });
  // A mob is validated at the mob level ALWAYS (tier/factors/body/skills/
  // unlocks), plus at the interaction level whenever it carries one — an NPC
  // is just a mob with an interaction block, never a separate schema.
  let errors;
  if (kind === 'mob') errors = [...validateMob(raw, idx), ...(raw.interaction ? validateInteraction(raw, idx) : [])];
  else if (kind === 'quest') errors = validateQuest(raw, idx);
  else if (kind === 'faction') errors = validateFaction(raw, idx);
  else errors = validateRecipe(raw, idx);
  if (errors.length > 0) return { ok: false, errors: errors.map((e) => e.message) };

  writeJson(target.abs, raw);
  // Re-run the full pass post-write for warnings (e.g. "offered by nobody"),
  // informational only — never blocks a save.
  const milestones = readMilestonesEntry();
  const full = validateAll(mobs, quests, skillNames, { factionNames, entityTypes, factions, recipes, milestones, skillMaxLevels });
  return { ok: true, warnings: full.warnings.map((w) => w.message) };
}

// Milestones is one shared file holding a JSON array, not one-file-per-entry
// — the whole array round-trips through the client and gets rewritten
// wholesale on save, same preserve-unrelated-fields posture as saveOne but
// with no per-entry file identity to race-guard.
function saveMilestones(raw) {
  const mobs = readMobs();
  const quests = readQuests();
  const skillNames = readSkillNames();
  const skillMaxLevels = readSkillMaxLevels();
  const factions = readFactions();
  const recipes = readRecipes();
  const factionNames = factions.map((f) => f.raw.name);
  const entityTypes = readEntityTypes();

  const idx = buildIndex(mobs, quests, skillNames, { factionNames, entityTypes, skillMaxLevels, recipes });
  const errors = validateMilestones(raw, idx);
  if (errors.length > 0) return { ok: false, errors: errors.map((e) => e.message) };

  writeJson(MILESTONES_FILE, raw);
  const milestones = { file: path.relative(ROOT, MILESTONES_FILE).split(path.sep).join('/'), raw };
  const full = validateAll(mobs, quests, skillNames, { factionNames, entityTypes, factions, recipes, milestones, skillMaxLevels });
  return { ok: true, warnings: full.warnings.map((w) => w.message) };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (req.method === 'GET' && url.pathname === '/api/data') {
      const mobs = readMobs().map(({ file, raw }) => ({ file, raw }));
      const quests = readQuests().map(({ file, raw }) => ({ file, raw }));
      const skillNames = readSkillNames();
      const skillMaxLevels = readSkillMaxLevels();
      const factions = readFactions().map(({ file, raw }) => ({ file, raw }));
      const recipes = readRecipes().map(({ file, raw }) => ({ file, raw }));
      const milestones = readMilestonesEntry();
      const entityTypes = readEntityTypes();
      return sendJson(res, 200, {
        mobs, quests, skillNames, skillMaxLevels, factions, recipes,
        milestones: { file: milestones.file, raw: milestones.raw }, entityTypes,
      });
    }
    if (req.method === 'GET' && url.pathname === '/api/validate') {
      const mobs = readMobs().map(({ file, raw }) => ({ file, raw }));
      const quests = readQuests().map(({ file, raw }) => ({ file, raw }));
      const skillNames = readSkillNames();
      const skillMaxLevels = readSkillMaxLevels();
      const factions = readFactions().map(({ file, raw }) => ({ file, raw }));
      const recipes = readRecipes().map(({ file, raw }) => ({ file, raw }));
      const factionNames = factions.map((f) => f.raw.name);
      const entityTypes = readEntityTypes();
      const milestones = readMilestonesEntry();
      const { errors, warnings } = validateAll(mobs, quests, skillNames, { factionNames, entityTypes, factions, recipes, milestones, skillMaxLevels });
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
    if (req.method === 'POST' && url.pathname === '/api/save/faction') {
      const body = await readBody(req);
      return sendJson(res, 200, saveOne({ kind: 'faction', file: body.file, raw: body.raw, isNew: !!body.isNew }));
    }
    if (req.method === 'POST' && url.pathname === '/api/save/recipe') {
      const body = await readBody(req);
      return sendJson(res, 200, saveOne({ kind: 'recipe', file: body.file, raw: body.raw, isNew: !!body.isNew }));
    }
    if (req.method === 'POST' && url.pathname === '/api/save/milestones') {
      const body = await readBody(req);
      return sendJson(res, 200, saveMilestones(body.raw));
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
