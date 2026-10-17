// herd-h1.mjs - herding H1 at the game surface (plan-herding.md H1).
//
// Main world, GOD on. Legs:
//   1. the ten sheep spawns near Hans's pen draw as Sheep sprites (the
//      placeholder texture, D11), identified by their texture source
//   2. a sheep runs from the player: stand 1.2 u from one, it moves away
//   3. a sheep driven into the pen leaves (fades) within ~2 s plus slack
//
// Sheep are found by their TEXTURE (the sheep.svg data URI carries the word
// "sheep" in its comment), never by position: boars and stags graze the same
// pasture. World units off .position, never screen space.
//
// Usage: node .claude/skills/verify/herd-h1.mjs [label] [url]
// Boundary: the herder list, credit and the dwell arithmetic are Go's
// (model/mob/herd_test.go, sys/mob_herd_test.go).

import { createRequire } from 'node:module';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { joinAsNewCharacter } from './lib/join.mjs';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');

const label = process.argv[2] || 'run';
const url = process.argv[3] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const shotDir = process.env.HERD_SHOT_DIR || '/tmp';

// The pen's inside (world.json region hans-pen) and its gate gap on the north
// fence (y -21.76, x -226.95 .. -225.39).
const PEN = { minX: -228.35, maxX: -224.25, minY: -25.85, maxY: -22 };
const GATE = { x: -226.17, y: -21.76 };

// The named strays wear the same art but stand still (no herd block): their
// spawns are DERIVED from world.json, and a sprite on one is not a subject.
const zone = JSON.parse(readFileSync(new URL('../../../api/zones/world.json', import.meta.url), 'utf8'));
const NAMED = zone.areas.flatMap((a) => a.spawns || []).filter((p) => ['Baabara', 'Woolliam', 'Lambert'].includes(p.mob));
const named = (s) => NAMED.some((p) => Math.hypot(p.x - s.x, p.y - s.y) < 0.6);

const results = [];
const check = (name, pass, detail) => results.push({ check: name, pass, detail });

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const errors = [];
const page = await (await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 800 } })).newPage();
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await joinAsNewCharacter(page, 'herd');
await page.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
await page.evaluate(() => {
  const p = document.getElementById('developPanel'); if (p) p.style.display = 'none';
  let r = window.game.character.plate.parent;
  while (r.parent) r = r.parent;
  window.__auraRoot = r;
});

const cmd = async (text, wait = 700) => {
  await page.evaluate((t) => {
    document.getElementById('console_command').value = t;
    document.getElementById('console').dispatchEvent(new Event('submit', { cancelable: true }));
  }, text);
  if (wait) await page.waitForTimeout(wait);
};
const warp = (p) => cmd(`WARP ${Math.round(p.x * 120)} ${Math.round(p.y * 120)}`, 3000);

// Every visible sheep sprite in the wildlife layer, in world units. A sprite
// is a sheep when some texture in its subtree comes from sheep.svg.
const sheep = () => page.evaluate(() => {
  let layer = null;
  const find = (c) => { if (layer) return; if (c?.name === 'wildlife') { layer = c; return; } (c?.children || []).forEach(find); };
  find(window.__auraRoot);
  if (!layer) return [];
  const isSheep = (c) => {
    const src = c?.texture?.source;
    const id = String(src?.label || src?.resource?.src || src?.resource?.currentSrc || '');
    if (/sheep/i.test(decodeURIComponent(id))) return true;
    return (c?.children || []).some(isSheep);
  };
  return (layer.children || [])
    .filter((c) => c.visible && c.position && isSheep(c))
    .map((c) => ({ x: c.position.x / 120, y: c.position.y / 120, alpha: c.alpha, id: c.uid ?? c.__id }));
}).then((all) => all.filter((s) => !named(s)));
const me = () => page.evaluate(() => ({ x: window.game.character.getX() / 120, y: window.game.character.getY() / 120 }));

await cmd('GOD on');

// --- Leg 1: the herd draws as sheep near the pen ---
await warp({ x: -226, y: -14 });
await page.waitForTimeout(4000);
let flock = await sheep();
check('1 sheep sprites in view near the pen', flock.length >= 3,
  `${flock.length} sheep sprite(s): ${flock.map((s) => `(${s.x.toFixed(1)},${s.y.toFixed(1)})`).join(' ')}`);
await page.screenshot({ path: join(shotDir, `herd-${label}-flock.png`) });

// --- Leg 2: a sheep runs from the player ---
if (flock.length) {
  const pos = await me();
  flock.sort((a, b) => Math.hypot(a.x - pos.x, a.y - pos.y) - Math.hypot(b.x - pos.x, b.y - pos.y));
  const target = flock[0];
  // Stand 1.2 u west of it. The warp wait (3 s) already outlasts the run, so
  // judge where THAT sheep went against where it stood, not a later gap.
  await warp({ x: target.x - 1.2, y: target.y });
  const at = await me();
  const moved = (await sheep()).find((q) => q.id === target.id);
  const gap = moved ? Math.hypot(moved.x - at.x, moved.y - at.y) : null;
  const shift = moved ? Math.hypot(moved.x - target.x, moved.y - target.y) : null;
  check('2 a sheep runs from a near player', moved ? (gap > 1.7 && moved.x > target.x) : null,
    moved ? `stood at (${at.x.toFixed(1)},${at.y.toFixed(1)}); the sheep went (${target.x.toFixed(1)},${target.y.toFixed(1)}) -> (${moved.x.toFixed(1)},${moved.y.toFixed(1)}), ${shift.toFixed(2)} u, gap now ${gap.toFixed(2)} u`
      : 'INCONCLUSIVE: lost sight of the sheep');
} else {
  check('2 a sheep runs from a near player', null, 'INCONCLUSIVE: no sheep in view');
}

// --- Leg 3: drive the nearest sheep into the pen ---
// Push from the far side of the sheep, toward the gate, and re-aim each step.
const inPen = (s) => s.x > PEN.minX && s.x < PEN.maxX && s.y > PEN.minY && s.y < PEN.maxY;
await warp({ x: GATE.x, y: GATE.y + 3 });
await page.waitForTimeout(2000);
let tracked = null; let penned = false; let enteredAt = null; const trail = [];
for (let step = 0; step < 60 && !penned; step++) {
  const s = await sheep();
  if (!tracked) {
    s.sort((a, b) => Math.hypot(a.x - GATE.x, a.y - GATE.y) - Math.hypot(b.x - GATE.x, b.y - GATE.y));
    tracked = s[0];
    if (!tracked) break;
  } else {
    const next = s.find((q) => q.id === tracked.id);
    if (!next) { penned = enteredAt !== null; if (!penned) trail.push('lost sight'); break; }
    tracked = next;
  }
  trail.push(`(${tracked.x.toFixed(1)},${tracked.y.toFixed(1)})`);
  if (inPen(tracked) && enteredAt === null) enteredAt = Date.now();
  // Target: the gate while outside, the pen's middle once through.
  const goal = tracked.y > GATE.y + 0.3 ? GATE : { x: (PEN.minX + PEN.maxX) / 2, y: (PEN.minY + PEN.maxY) / 2 };
  const dx = goal.x - tracked.x, dy = goal.y - tracked.y; const d = Math.hypot(dx, dy) || 1;
  // Stand 1.3 u behind the sheep, opposite the goal.
  await cmd(`WARP ${Math.round((tracked.x - dx / d * 1.3) * 120)} ${Math.round((tracked.y - dy / d * 1.3) * 120)}`, 900);
}
check('3 a sheep driven into the pen leaves', penned,
  `${penned ? `gone ${((Date.now() - enteredAt) / 1000).toFixed(1)} s after first seen inside` : 'INCONCLUSIVE/RED: not penned'}; trail ${trail.slice(-12).join(' ')}`);
await page.screenshot({ path: join(shotDir, `herd-${label}-pen.png`) });

check('0 no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));

for (const r of results) console.log(`${r.pass === true ? 'PASS' : r.pass === null ? 'INCONCLUSIVE' : 'FAIL'}  ${r.check}: ${r.detail}`);
await browser.close();
