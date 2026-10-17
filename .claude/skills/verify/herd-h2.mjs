// herd-h2.mjs - the herding QUEST at the game surface (plan-herding.md H2).
//
// Main world, GOD on, one fresh character. Legs:
//   1. QUEST ACCEPT back-to-the-pen: the tracker reads "0/6 sheep brought back"
//   2. driving flock sheep into the pen moves it to 1/6 ... 6/6, and the stage
//      turns to the strays: three lines naming Baabara, Woolliam and Lambert
//   3. the stubborn stray (Woolliam) lets a player stand 1.8 u off and holds
//      still (his run radius is 1.5), then runs from one at 1.0 u (D12)
//
// Sheep are found by TEXTURE (sheep.svg), strays told apart from the flock by
// their spawns, derived from world.json; quest text is read off the tracker DOM.
//
// Usage: node .claude/skills/verify/herd-h2.mjs [label] [url]
// Boundary: credit arithmetic, the stage graph and the rows are Go's
// (quests/herd_test.go, model/mob/herd_test.go); herd-h1.mjs owns running and
// the pen itself.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { joinAsNewCharacter } from './lib/join.mjs';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');

const label = process.argv[2] || 'run';
const url = process.argv[3] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const shotDir = process.env.HERD_SHOT_DIR || '/tmp';

const zone = JSON.parse(readFileSync(new URL('../../../api/zones/world.json', import.meta.url), 'utf8'));
const spawns = zone.areas.flatMap((a) => a.spawns || []);
const STRAYS = Object.fromEntries(['Baabara', 'Woolliam', 'Lambert'].map((n) => [n, spawns.find((s) => s.mob === n)]));
const region = zone.areas.flatMap((a) => a.regions || []).find((r) => r.id === 'hans-pen');
const PEN = {
  minX: Math.min(...region.points.map((p) => p.x)), maxX: Math.max(...region.points.map((p) => p.x)),
  minY: Math.min(...region.points.map((p) => p.y)), maxY: Math.max(...region.points.map((p) => p.y)),
};
// The gate gap on the north fence, from herd-h1.mjs's survey.
const GATE = { x: -226.17, y: -21.76 };

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
const warp = (p, wait = 3000) => cmd(`WARP ${Math.round(p.x * 120)} ${Math.round(p.y * 120)}`, wait);
const me = () => page.evaluate(() => ({ x: window.game.character.getX() / 120, y: window.game.character.getY() / 120 }));
const trackerLines = () => page.evaluate(() =>
  [...document.querySelectorAll('#questTrackerList .questTrackerLine')].map((e) => e.textContent.trim()));

const allSheep = () => page.evaluate(() => {
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
  return (layer.children || []).filter((c) => c.visible && c.position && isSheep(c))
    .map((c) => ({ x: c.position.x / 120, y: c.position.y / 120, id: c.uid ?? c.__id }));
});
const nearSpawn = (s, p, r = 3) => Math.hypot(p.x - s.x, p.y - s.y) < r;
const flock = async () => (await allSheep()).filter((s) => !Object.values(STRAYS).some((p) => nearSpawn(s, p)));
const inPen = (s) => s.x > PEN.minX && s.x < PEN.maxX && s.y > PEN.minY && s.y < PEN.maxY;

// Drive the flock sheep nearest the gate into the pen; true when it left.
async function penOne() {
  await warp({ x: GATE.x, y: GATE.y + 4 }, 2500);
  let tracked = null; let entered = false;
  for (let step = 0; step < 50; step++) {
    const s = await flock();
    if (!tracked) {
      s.sort((a, b) => Math.hypot(a.x - GATE.x, a.y - GATE.y) - Math.hypot(b.x - GATE.x, b.y - GATE.y));
      tracked = s[0];
      if (!tracked) return false;
    } else {
      const next = s.find((q) => q.id === tracked.id);
      if (!next) return entered;
      tracked = next;
    }
    entered = entered || inPen(tracked);
    const goal = tracked.y > GATE.y + 0.3 ? GATE : { x: (PEN.minX + PEN.maxX) / 2, y: (PEN.minY + PEN.maxY) / 2 };
    const dx = goal.x - tracked.x, dy = goal.y - tracked.y; const d = Math.hypot(dx, dy) || 1;
    await warp({ x: tracked.x - dx / d * 1.3, y: tracked.y - dy / d * 1.3 }, 900);
  }
  return false;
}

await cmd('GOD on');

// --- Leg 1: accept ---
await cmd('QUEST ACCEPT back-to-the-pen', 2500);
let lines = await trackerLines();
check('1 the flock line', lines.includes('0/6 sheep brought back'), JSON.stringify(lines));

// --- Leg 2: six pennings, then the strays ---
const seen = [];
for (let tries = 0; tries < 14 && !(await trackerLines()).some((l) => /Bring Baabara home/.test(l)); tries++) {
  const ok = await penOne();
  await page.waitForTimeout(1500);
  seen.push(`${ok ? 'penned' : 'missed'} -> ${JSON.stringify(await trackerLines())}`);
}
lines = await trackerLines();
const strayLines = ['Bring Baabara home', 'Bring Woolliam home', 'Bring Lambert home'].every((t) => lines.includes(t));
check('2 six penned moves the quest to the three strays', strayLines,
  `${JSON.stringify(lines)}; ${seen.slice(-7).join(' | ')}`);
await page.screenshot({ path: join(shotDir, `herd2-${label}-strays.png`) });

// --- Leg 3: the stubborn stray ---
const W = STRAYS.Woolliam;
await warp({ x: W.x - 4, y: W.y }, 4000);
const woolliam = async () => {
  const p = await me();
  return (await allSheep()).filter((s) => nearSpawn(s, W, 6)).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
};
let w0 = await woolliam();
if (w0) {
  await warp({ x: w0.x - 1.8, y: w0.y }, 3000);
  const w1 = await woolliam();
  const held = w1 && Math.hypot(w1.x - w0.x, w1.y - w0.y) < 0.4;
  await warp({ x: w1.x - 1.0, y: w1.y }, 3000);
  const w2 = await woolliam();
  const ran = w2 && w2.x - w1.x > 0.4;
  check('3 Woolliam lets you close, then runs', held && ran,
    `at 1.8 u moved ${w1 ? Math.hypot(w1.x - w0.x, w1.y - w0.y).toFixed(2) : '?'} u; at 1.0 u moved ${w2 ? (w2.x - w1.x).toFixed(2) : '?'} u east`);
  await page.screenshot({ path: join(shotDir, `herd2-${label}-woolliam.png`) });
} else {
  check('3 Woolliam lets you close, then runs', null, 'INCONCLUSIVE: no sheep sprite near his spawn');
}

check('0 no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
for (const r of results) console.log(`${r.pass === true ? 'PASS' : r.pass === null ? 'INCONCLUSIVE' : 'FAIL'}  ${r.check}: ${r.detail}`);
await browser.close();
