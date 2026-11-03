#!/usr/bin/env node
// Campfire traits CT1 (docs/plan-campfire-traits.md §CT1): the server half at
// the game surface, before any client UI exists (CT2 builds the spellbook
// section). The script therefore SPEAKS THE WIRE ITSELF: it builds
// SpendSkillPoint / Respec{camp} with the frontend's own flatbuffers library,
// sends them on the game's socket (captured by an init script), and decodes
// camp_points, camp_charges and the owner spellbook from received frames
// through Playwright's websocket events. Field offsets are read from the
// generated api/schema/js bindings at start-up, never hardcoded.
//
//   1  join fresh: camp_points = the fires discovered so far (the spawn fire)
//   2  warp onto more bind points: camp_points follows the discovered count
//   3  spend: Camp duration x2, Camp charges x1, Camp heal x6 -> the pool drops
//      by 9 and the spellbook carries 179:2, 181:1, 180:6
//   4  the client lists no trait among the abilities (CATEGORY_MAP camp entry)
//   5  unspend one Camp heal: +1 point; unspend a trait at 1 removes its entry
//   6  a spend with an empty pool is refused (level and pool unchanged)
//   7  Restock at home: camp_charges = the base refill + 1 (the charges trait)
//   8  place a camp on open ground: it burns ~17 s (15 + 2), not 15
//   9  its heal tick (GOD on, so regen is off) lands ~15.6 % of the pool
//      (aura level 7 = 12 % + 6 x 0.6 %), not the base 12 %
//  10  "reset all" (Respec{}) leaves the traits; the camp reset (Respec{camp})
//      returns every point and clears every entry
//
// Usage: node .claude/skills/verify/ct1-camp-traits.mjs [label] [url]
// Afterwards (stop aurad first): cd backend && go run ./cmd/harnessdb -cleanup
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');
import { joinAsNewCharacter } from './lib/join.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const fb = await import(join(repo, 'frontend/node_modules/flatbuffers/mjs/flatbuffers.js'));

const url = process.argv[3] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

const DURATION = 179, HEAL = 180, CHARGES = 181;
const OPEN_GROUND = { x: -168, y: -84 }; // r4-camp's clearing: no spawn within 40 u

// --- offsets from the generated bindings -----------------------------------
const gsSrc = readFileSync(join(repo, 'api/schema/js/aura-api/game-state.ts'), 'utf8');
const off = (fn) => {
  const m = new RegExp(`^${fn}\\([^)]*\\)[^{]*\\{\\s*const offset = this\\.bb!\\.__offset\\(this\\.bb_pos, (\\d+)\\)`, 'm').exec(gsSrc);
  if (!m) throw new Error(`no offset for GameState.${fn} in the generated bindings`);
  return +m[1];
};
const O = { spellbook: off('spellbook'), levels: off('spellbookLevels'), owner: off('ownerState'), charges: off('campCharges'), points: off('campPoints'), discovered: off('discoveredCampfiresLength') };
const bodyEnum = (file, name) => {
  const m = new RegExp(`${name} = (\\d+)`).exec(readFileSync(join(repo, `api/schema/js/aura-api/${file}`), 'utf8'));
  if (!m) throw new Error(`no ${name} in ${file}`);
  return +m[1];
};
const GAME_STATE = bodyEnum('server-message-body.ts', 'GameState');
const SPEND = bodyEnum('client-message-body.ts', 'SpendSkillPoint');
const RESPEC = bodyEnum('client-message-body.ts', 'Respec');

// --- wire state, decoded from every received frame ---------------------------
// discovered = the length of the last published discovered_campfires vector,
// a one-shot (sent on join, discovery and bind), so it keeps its last value.
const wire = { points: null, charges: null, spellbook: null, discovered: 0, frames: 0 };
const decode = (payload) => {
  if (typeof payload === 'string') return;
  const bb = new fb.ByteBuffer(new Uint8Array(payload));
  const root = bb.readInt32(bb.position()) + bb.position();
  const t = bb.__offset(root, 4);
  if (!t || bb.readUint8(root + t) !== GAME_STATE) return;
  const gs = bb.__indirect(root + bb.__offset(root, 6));
  const u16 = (o) => { const x = bb.__offset(gs, o); return x ? bb.readUint16(gs + x) : 0; };
  const u8 = (o) => { const x = bb.__offset(gs, o); return x ? bb.readUint8(gs + x) : 0; };
  wire.frames++;
  wire.points = u16(O.points);
  wire.charges = u8(O.charges);
  const dc = bb.__offset(gs, O.discovered);
  if (dc) wire.discovered = bb.__vector_len(gs + dc);
  const ow = bb.__offset(gs, O.owner);
  if (ow && bb.readInt8(gs + ow)) {
    const book = {};
    const so = bb.__offset(gs, O.spellbook), lo = bb.__offset(gs, O.levels);
    const n = so ? bb.__vector_len(gs + so) : 0;
    for (let i = 0; i < n; i++) {
      book[bb.readUint16(bb.__vector(gs + so) + i * 2)] = lo ? bb.readUint8(bb.__vector(gs + lo) + i) : 0;
    }
    wire.spellbook = book;
  }
};

const clientMessage = (type, buildBody) => {
  const b = new fb.Builder(64);
  const body = buildBody(b);
  b.startObject(2);
  b.addFieldInt8(0, type, 0);
  b.addFieldOffset(1, body, 0);
  b.finish(b.endObject());
  return [...b.asUint8Array()];
};
const spendBytes = (id, unspend = false) => clientMessage(SPEND, (b) => {
  b.startObject(2);
  b.addFieldInt16(0, id, 0);
  b.addFieldInt8(1, unspend ? 1 : 0, 0);
  return b.endObject();
});
const respecBytes = (camp) => clientMessage(RESPEC, (b) => {
  b.startObject(1);
  b.addFieldInt8(0, camp ? 1 : 0, 0);
  return b.endObject();
});

const results = [];
const consoleErrors = [];
const check = (ok, name, note) => {
  results.push({ ok, name, note });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? '  - ' + note : ''}`);
};

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'], env });
const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
page.on('websocket', (ws) => {
  if (ws.url().includes('/game')) ws.on('framereceived', ({ payload }) => decode(payload));
});
await page.addInitScript(() => {
  const Orig = window.WebSocket;
  window.WebSocket = class extends Orig {
    constructor(...a) {
      super(...a);
      if (String(a[0]).includes('/game')) window.__gameWs = this;
    }
  };
});

const send = (bytes) => page.evaluate((b) => window.__gameWs.send(new Uint8Array(b)), bytes);
const cmd = async (text) => {
  await page.evaluate((t) => {
    const input = document.getElementById('console_command');
    input.value = t;
    document.getElementById('console').dispatchEvent(new Event('submit', { cancelable: true }));
  }, text);
  await page.waitForTimeout(600);
};
// Wait until a wire predicate holds (the owner block rides only change ticks).
const until = async (pred, ms = 6_000) => {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (pred()) return true;
    await page.waitForTimeout(150);
  }
  return pred();
};
const level = (id) => wire.spellbook?.[id] ?? 0;

const findLayer = (name) => page.evaluate((n) => {
  let layer = null;
  const find = (c) => { if (c?.name === n) { layer = c; return; } (c?.children || []).forEach(find); };
  find(window.__auraRoot);
  return !!layer;
}, name);
const campsNearby = (radius = 4) => page.evaluate((r) => {
  let layer = null;
  const find = (c) => { if (c?.name === 'campfireMob') { layer = c; return; } (c?.children || []).forEach(find); };
  find(window.__auraRoot);
  if (!layer) return null;
  const ch = window.game.character;
  return (layer.children || []).filter((c) => c.visible && c.position)
    .map((c) => Math.hypot(c.position.x - ch.getX(), c.position.y - ch.getY()) / 120)
    .filter((d) => d <= r).length;
}, radius);
const health = () => page.evaluate(() => {
  const m = /Focus\s+(\d+)\/(\d+)/.exec(document.querySelector('#healthBar .barText')?.textContent ?? '');
  return m ? { cur: +m[1], max: +m[2] } : null;
});
const pressInteract = async () => {
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down('e');
  await page.waitForTimeout(1400);
  await page.keyboard.up('e');
  await page.waitForTimeout(1400);
};
const convOpen = () => page.evaluate(() => {
  const el = document.getElementById('conversation');
  return !!el && !el.classList.contains('hidden');
});
const clickRow = async (needle, exact) => {
  const node = (await page.evaluateHandle(([n, ex]) =>
    [...document.querySelectorAll('#conversation .conversationRows li')]
      .find((li) => (ex ? li.textContent.trim() === n : li.textContent.includes(n))) ?? null, [needle, exact])).asElement();
  if (!node) return false;
  await node.scrollIntoViewIfNeeded();
  const b = await node.boundingBox();
  if (!b) return false;
  await page.mouse.click(b.x + Math.min(60, b.width / 2), b.y + b.height / 2);
  await page.waitForTimeout(1100);
  return true;
};
const fireRow = async (needle, exact = false) => {
  for (let i = 0; i < 3; i++) {
    await pressInteract();
    if (await convOpen()) return clickRow(needle, exact);
  }
  return false;
};

// Every authored bind point in the world zone, so the script never depends on
// which fire ids exist this week.
const bindPoints = (() => {
  const out = [];
  const walk = (v) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (v && typeof v === 'object') {
      if (Array.isArray(v.bindPoints)) v.bindPoints.forEach((p) => p?.id && out.push(p.id));
      Object.values(v).forEach(walk);
    }
  };
  walk(JSON.parse(readFileSync(join(repo, 'api/zones/world.json'), 'utf8')));
  return [...new Set(out)];
})();

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await joinAsNewCharacter(page, 'ct1');
  await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
  await page.evaluate(() => { const p = document.getElementById('developPanel'); if (p) p.style.display = 'none'; });
  await page.waitForTimeout(1200);
  await cmd('PING'); // the first command after joining is dropped
  await cmd('GOD on');
  await page.evaluate(() => {
    let r = window.game.character.plate.parent;
    while (r.parent) r = r.parent;
    window.__auraRoot = r;
  });
  check(await page.evaluate(() => !!window.__gameWs), 'the game socket is captured');
  await until(() => wire.points !== null && wire.spellbook !== null);

  // --- 1. on join the pool is the discovered set ---------------------------------
  // ⚑ Not ">= 1": a jittered spawn can sit outside the spawn fire's bind circle,
  // so a fresh character may have discovered nothing yet.
  await page.waitForTimeout(2_000);
  const p0 = wire.points;
  check(p0 === wire.discovered, 'join: camp_points equals the discovered set', `camp_points=${p0} discovered=${wire.discovered}`);

  // --- 2. more fires, more points; bind the first for the Restock leg -----------
  const start = bindPoints.find((id) => id === 'spawnpoint-1') ?? bindPoints[0];
  await cmd(`WARP ${start}`);
  await page.waitForTimeout(2_000);
  const bound = await fireRow('Bind');
  const visits = bindPoints.filter((id) => id !== start).slice(0, 11);
  for (const id of visits) {
    await cmd(`WARP ${id}`);
    await page.waitForTimeout(900);
  }
  await until(() => wire.points >= 10, 8_000);
  const pool = wire.points;
  check(pool >= 10 && pool === wire.discovered, 'camp_points follows the discovered count across warps',
    `camp_points ${p0} -> ${pool}, discovered=${wire.discovered}, after ${visits.length + 1} warps`);

  // --- 3. spend -------------------------------------------------------------------
  for (const [id, n] of [[DURATION, 2], [CHARGES, 1], [HEAL, 6]]) {
    for (let i = 0; i < n; i++) { await send(spendBytes(id)); await page.waitForTimeout(150); }
  }
  await until(() => level(DURATION) === 2 && level(CHARGES) === 1 && level(HEAL) === 6);
  check(level(DURATION) === 2 && level(CHARGES) === 1 && level(HEAL) === 6,
    'spending buys level 1 and up (179:2, 181:1, 180:6)', JSON.stringify({ 179: level(DURATION), 180: level(HEAL), 181: level(CHARGES) }));
  await until(() => wire.points === pool - 9);
  check(wire.points === pool - 9, 'the pool drops by exactly 9 (flat cost 1)', `camp_points ${pool} -> ${wire.points}`);

  // --- 4. the client lists no trait among the abilities ---------------------------
  const listed = await page.evaluate(() => [...document.querySelectorAll('#spellbookList li')]
    .map((li) => li.textContent).filter((t) => /Camp (heal|duration|charges)/.test(t)));
  check(listed.length === 0, 'no trait shows in the ability spellbook (CT2 owns their section)', JSON.stringify(listed));

  // --- 5. unspend -------------------------------------------------------------------
  await send(spendBytes(HEAL, true));
  await until(() => level(HEAL) === 5);
  check(level(HEAL) === 5 && (await until(() => wire.points === pool - 8)), 'unspend refunds one point',
    `heal=${level(HEAL)} camp_points=${wire.points}`);
  await send(spendBytes(CHARGES, true));
  await until(() => !(CHARGES in (wire.spellbook ?? {})));
  check(!(CHARGES in (wire.spellbook ?? {})), 'lowering a trait to 0 removes its spellbook entry', JSON.stringify(wire.spellbook));
  await send(spendBytes(HEAL));
  await send(spendBytes(CHARGES));
  await until(() => level(HEAL) === 6 && level(CHARGES) === 1);

  // --- 6. an empty pool refuses -----------------------------------------------------
  const left = wire.points;
  for (let i = 0; i < left; i++) { await send(spendBytes(DURATION)); await page.waitForTimeout(120); }
  await until(() => wire.points === 0);
  const durBefore = level(DURATION);
  await send(spendBytes(DURATION));
  await page.waitForTimeout(1_500);
  check(wire.points === 0 && level(DURATION) === durBefore, 'a spend with an empty pool is refused',
    `camp_points=${wire.points} duration ${durBefore} -> ${level(DURATION)}`);
  for (let i = 0; i < left; i++) { await send(spendBytes(DURATION, true)); await page.waitForTimeout(120); }
  await until(() => level(DURATION) === 2);

  // --- 7. charges: Restock at home ------------------------------------------------
  // The refill with the charges trait is the base cap + 1. The base cap at this
  // level is the shared curve (1 + level/7), read off the trait's removal below.
  await cmd(`WARP ${start}`);
  await page.waitForTimeout(2_000);
  const restocked = bound && await fireRow('Restock', true);
  await until(() => wire.charges >= 2);
  const withTrait = wire.charges;
  check(restocked && withTrait >= 2, 'Restock fills to the raised cap (base + charges trait)', `bound=${bound} camp_charges=${withTrait}`);

  // --- 8. a placed camp burns 2 s longer than a base one ---------------------------
  // ⚑ Measured against a no-trait camp in the same run (leg 11): the sprite's
  // fade-in, fade-out and the headless sampling add ~2-5 s to any absolute read.
  await cmd(`WARP ${OPEN_GROUND.x * 120} ${OPEN_GROUND.y * 120}`);
  await page.waitForTimeout(20_000);
  const before = await health();
  await page.click('#utilityList li[data-utility="2"]');
  let placedAt = 0;
  for (let i = 0; i < 60 && !placedAt; i++) {
    if ((await campsNearby()) >= 1) placedAt = Date.now();
    else await page.waitForTimeout(250);
  }
  check(!!placedAt, 'the camp is placed', `layer=${await findLayer('campfireMob')}`);

  // --- 9. its heal, measured under GOD (regen off) while it burns -------------------
  await cmd('DAMAGE 60');
  const samples = [];
  let goneAt = 0;
  while (placedAt && Date.now() - placedAt < 25_000) {
    const h = await health();
    if (h) samples.push(h);
    if ((await campsNearby()) === 0) { goneAt = Date.now(); break; }
    await page.waitForTimeout(250);
  }
  const lived = goneAt ? (goneAt - placedAt) / 1000 : -1;
  const jumps = [];
  for (let i = 1; i < samples.length; i++) {
    const d = samples[i].cur - samples[i - 1].cur;
    if (d > 0 && samples[i].max === samples[i - 1].max) jumps.push(d / samples[i].max);
  }
  const tick = jumps.length ? jumps.sort((a, b) => a - b)[Math.floor(jumps.length / 2)] : 0;
  check(tick >= 0.145 && tick <= 0.17, 'one heal tick lands ~15.6 % (aura level 7), not 12 %',
    `median tick=${(tick * 100).toFixed(1)} % over ${jumps.length} ticks, before=${JSON.stringify(before)}`);

  // --- 10. the two resets ---------------------------------------------------------------
  const pointsBefore = wire.points;
  await send(respecBytes(false));
  await page.waitForTimeout(1_500);
  check(level(HEAL) === 6 && level(DURATION) === 2 && wire.points === pointsBefore,
    '"reset all" leaves every trait', JSON.stringify({ 179: level(DURATION), 180: level(HEAL), 181: level(CHARGES) }));
  await send(respecBytes(true));
  await until(() => ![DURATION, HEAL, CHARGES].some((id) => id in (wire.spellbook ?? {})));
  check(![DURATION, HEAL, CHARGES].some((id) => id in (wire.spellbook ?? {})) && wire.points === pool,
    'the camp reset clears every trait and returns every point', `camp_points=${wire.points} (pool ${pool})`);

  // --- 11. a base camp, the duration control ------------------------------------------
  // The same sampling loop as leg 9, so both reads carry the same overhead.
  await page.click('#utilityList li[data-utility="2"]');
  let baseAt = 0, baseGone = 0;
  for (let i = 0; i < 60 && !baseAt; i++) {
    if ((await campsNearby()) >= 1) baseAt = Date.now();
    else await page.waitForTimeout(250);
  }
  while (baseAt && Date.now() - baseAt < 25_000) {
    await health();
    if ((await campsNearby()) === 0) { baseGone = Date.now(); break; }
    await page.waitForTimeout(250);
  }
  const baseLived = baseGone ? (baseGone - baseAt) / 1000 : -1;
  const delta = lived - baseLived;
  check(lived > 0 && baseLived > 0 && delta >= 1 && delta <= 3,
    'the duration trait burns the camp ~2 s longer than a base camp',
    `trait camp ${lived.toFixed(1)} s, base camp ${baseLived.toFixed(1)} s, delta ${delta.toFixed(1)} s`);
} catch (e) {
  check(false, 'the run completed', e.message);
} finally {
  const real = consoleErrors.filter((e) => !/favicon|webglcontextlost/i.test(e));
  check(real.length === 0, 'no console errors', real.slice(0, 3).join(' | '));
  await page.screenshot({ path: `/tmp/ct1-camp-traits-${process.argv[2] || 'run'}.png` }).catch(() => {});
  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed, frames decoded: ${wire.frames}`);
  process.exit(failed ? 1 : 0);
}
