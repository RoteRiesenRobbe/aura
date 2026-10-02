#!/usr/bin/env node
// plan-prop-draw-order.md P1 + P3: props stack in SPAWN order, every time —
// prop layer bottom to top, then zone-file order inside a layer.
//
// Venue: Eliza's farmhouse (Farmlands), the PO's original report. Since P3 the
// OakTree beside her Cottage sits in props.canopy and the Cottage in
// props.buildings, so the oak draws OVER the cottage by its LAYER, with no
// hand-ordering — and keeps doing so.
//
// Legs, each read in ONE page.evaluate (one sample = one evaluate):
//   1. Every child of `props.standing` maps to a world.json prop by position,
//      and the children are in ascending SPAWN index: the four `props` arrays
//      flattened underfoot, default, buildings, canopy (world.PropLayers),
//      each in file order. That is the whole claim of D5/D6: id order = spawn
//      order = draw order.
//   2. The oak is above the cottage.
//   3. Walk away and come back (a WARP far enough that both leave the
//      snapshot, then back): legs 1 and 2 again. ⭐ This is the case that used
//      to reshuffle: a returning prop was rebuilt and APPENDED on top.
//   4. Container order: npcs < characters < props.standing, and Eliza's own
//      sprite is on `mobs.npcs` (D9: NPCs under the player).
//
// ⚑ Expectations are DERIVED from api/zones/world.json, never typed in. The
// webpack dev server bundles the same file, and the server reads it too under
// `-content ../api`; after a zone edit restart the server first.
//
//   node .claude/skills/verify/p1-prop-order.mjs [url]
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');
import { joinAsNewCharacter } from './lib/join.mjs';

const url = process.argv[2] || 'http://localhost:2001/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const repo = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const world = JSON.parse(readFileSync(join(repo, 'api/zones/world.json'), 'utf8'));
// Position in wire pixels -> spawn index. World's origin is (0, 0).
// ⚑ The rank is zone.go's PropLayers field order; `where` is the file path.
const RANK = ['underfoot', 'default', 'buildings', 'canopy'];
const props = RANK.flatMap((layer) => (world.props[layer] || []).map((p, n) => ({ layer, n, p })))
  .map(({ layer, n, p }, i) => ({ i, where: `${layer}[${n}]`, type: p.type, x: p.x * 120, y: p.y * 120 }));
const eliza = world.spawns.find((s) => s.mob === 'Eliza');
const nearEliza = (type) => props
  .filter((p) => p.type === type)
  .sort((a, b) => Math.hypot(a.x / 120 - eliza.x, a.y / 120 - eliza.y) - Math.hypot(b.x / 120 - eliza.x, b.y / 120 - eliza.y))[0];
const cottage = nearEliza('Cottage');
const oak = nearEliza('OakTree');
const HOME = { x: Math.round(eliza.x), y: Math.round(eliza.y) + 2 };
const AWAY = { x: HOME.x + 60, y: HOME.y };

const results = [];
const check = (ok, name, note) => {
  results.push({ ok, name });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? '  — ' + note : ''}`);
};

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' && !/\b401\b/.test(m.text())) errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

const cmd = async (text) => {
  await page.evaluate((t) => {
    const input = document.getElementById('console_command');
    input.value = t;
    document.getElementById('console').dispatchEvent(new Event('submit', { cancelable: true }));
  }, text);
  await page.waitForTimeout(700);
};
const warp = (p) => cmd(`WARP ${p.x * 120} ${p.y * 120}`);

// Is a prop at (x, y) px currently drawn on props.standing?
const standingHas = (p) => page.evaluate(({ x, y }) => window.game.layers.props.standing.children
  .some((c) => Math.abs(c.position.x - x) < 2 && Math.abs(c.position.y - y) < 2), p);
const waitFor = async (pred, ms = 30_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await pred()) return true; await page.waitForTimeout(500); }
  return false;
};

const sample = () => page.evaluate(() => {
  const L = window.game.layers;
  const parent = L.props.standing.parent;
  const idx = (c) => parent.children.indexOf(c);
  const npcs = L.mobs.npcs;
  return {
    standing: L.props.standing.children.map((c) => ({ x: c.position.x, y: c.position.y })),
    npcIdx: npcs ? idx(npcs) : -1,
    charIdx: idx(L.characters),
    standingIdx: idx(L.props.standing),
    npcChildren: npcs ? npcs.children.map((c) => ({ x: c.position.x, y: c.position.y })) : [],
  };
});

// Legs 1 + 2 against one sample.
function judgeOrder(s, when) {
  const mapped = s.standing.map((c) => props.find((p) => Math.abs(p.x - c.x) < 2 && Math.abs(p.y - c.y) < 2));
  const unmapped = mapped.filter((m) => !m).length;
  const order = mapped.filter(Boolean).map((m) => m.i);
  const inversions = order.filter((v, k) => k > 0 && v < order[k - 1]).length;
  check(unmapped === 0 && order.length > 0, `${when}: every standing prop is a world.json placement`,
    `${order.length} mapped, ${unmapped} unmapped`);
  check(inversions === 0, `${when}: standing children are in spawn order (layer, then file)`,
    inversions ? `${inversions} inversion(s): ${order.join(',')}` : `${order.length} props, ascending`);
  const ci = order.indexOf(cottage.i), oi = order.indexOf(oak.i);
  check(ci >= 0 && oi >= 0 && oi > ci, `${when}: the oak (${oak.where}) draws over the cottage (${cottage.where})`,
    `cottage at child ${ci}, oak at child ${oi}`);
}

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await joinAsNewCharacter(page, 'propord');
await page.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
await page.evaluate(() => { const p = document.getElementById('developPanel'); if (p) p.style.display = 'none'; });
await cmd('GOD');

console.log(`venue: Eliza (${eliza.x}, ${eliza.y}); cottage ${cottage.where}, oak ${oak.where}`);
await warp(HOME);
const arrived = await waitFor(async () => (await standingHas(cottage)) && (await standingHas(oak)));
if (!arrived) {
  console.log('INCONCLUSIVE  the cottage and the oak never streamed in at the venue');
  await browser.close();
  process.exit(2);
}
await page.waitForTimeout(1500);
const first = await sample();
judgeOrder(first, 'arrival');

const e = { x: eliza.x * 120, y: eliza.y * 120 };
const elizaOnNpcs = first.npcChildren.some((c) => Math.hypot(c.x - e.x, c.y - e.y) < 6 * 120);
check(first.npcIdx >= 0 && first.npcIdx < first.charIdx && first.charIdx < first.standingIdx,
  'npcs < characters < props.standing', `npcs ${first.npcIdx}, characters ${first.charIdx}, standing ${first.standingIdx}`);
check(elizaOnNpcs, 'an NPC near Eliza draws on mobs.npcs', `${first.npcChildren.length} child(ren) on npcs`);

// Leg 3: walk away until both leave the snapshot, then come back.
await warp(AWAY);
const gone = await waitFor(async () => !(await standingHas(cottage)) && !(await standingHas(oak)));
check(gone, 'away: the cottage and the oak left the view (else the return proves nothing)');
await warp(HOME);
await waitFor(async () => (await standingHas(cottage)) && (await standingHas(oak)));
await page.waitForTimeout(1500);
judgeOrder(await sample(), 'return');

check(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '));
await page.screenshot({ path: join(process.env.P1_SHOT_DIR || '/tmp', 'p1-prop-order.png') });

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
await browser.close();
process.exit(failed ? 1 : 0);
