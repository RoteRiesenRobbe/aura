// PROTOTYPE harness — attack-attribution lines (backlog §57).
//
// ⚑ THIS SCRIPT IS PART OF A THROWAWAY PROTOTYPE, on the branch
// `prototype/attack-lines`. It exists to answer one question a screenshot alone
// cannot: does a line actually get drawn from an attacking mob to the player at
// the moment damage lands, and does it go away again? Delete it with the
// prototype.
//
// ⚑ It does NOT use GOD, for the same reason c2-frost-shield.mjs does not:
// IsGod() short-circuits inside takeDamage, so a cheat-mode player never takes
// a damage tick and the overlay would have nothing to draw. It buys survival
// with XP instead.
//
// ⚑ Tri-state: mobs wander, so "nothing came close enough to hit me" is
// INCONCLUSIVE, never red. A red here means the player took damage from a mob
// standing in melee range and no line was drawn.

import { createRequire } from 'module';
import { join } from 'path';
import { joinAsNewCharacter } from './lib/join.mjs';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');

const label = process.argv[2] || 'run';
const url = process.argv[3] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

// The wolf pack the CC harnesses use — dense, normal tier, reliably closes.
const PACK = `${-40 * 120} ${10 * 120}`;

const results = [];
const check = (name, pass, detail) => {
  results.push({ check: name, pass, detail });
  console.log(`${pass === null ? '~' : pass ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await joinAsNewCharacter(page, 'lines');
await page.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
await page.evaluate(() => {
  const p = document.getElementById('developPanel');
  if (p) p.style.display = 'none';
});

const cmd = async (text) => {
  await page.evaluate((t) => {
    const input = document.getElementById('console_command');
    input.value = t;
    document.getElementById('console').dispatchEvent(new Event('submit', { cancelable: true }));
  }, text);
  await page.waitForTimeout(700);
};

// Cache the scene root while the character is alive — a dead player nulls
// `character.plate`, and every scene-graph read after that throws.
await page.evaluate(() => {
  let r = window.game.character.plate.parent;
  while (r.parent) r = r.parent;
  window.__auraRoot = r;
});

// --- leg 1: the overlay layer exists, in the right place --------------------
// Above the entities it connects, BELOW the darkness — a line drawn over the
// darkness overlay would be the first thing to light up a dark area.
const layerOrder = await page.evaluate(() => {
  let cam = null;
  const find = (c) => {
    if (cam) return;
    if ((c?.label || c?.name) === 'cameraGroup') { cam = c; return; }
    (c?.children || []).forEach(find);
  };
  find(window.__auraRoot);
  if (!cam) return null;
  const names = (cam.children || []).map((c) => c.label || c.name || '?');
  return { names, lines: names.indexOf('attackLines'), darkness: names.indexOf('darkness') };
});
check('The attackLines layer is on the camera group, below the darkness',
  layerOrder !== null && layerOrder.lines >= 0 && layerOrder.darkness > layerOrder.lines,
  layerOrder ? `index ${layerOrder.lines} of ${layerOrder.names.length}, darkness at ${layerOrder.darkness}` : 'no cameraGroup found');

// --- leg 2: it draws NOTHING before anything hits us ------------------------
// The negative control. Without it, an overlay that draws a line permanently
// (or on every frame regardless of damage) would pass leg 3 trivially.
const readLines = () => page.evaluate(`
  (() => {
    let layer = null;
    const find = (c) => { if (layer) return;
      if ((c?.label || c?.name) === 'attackLines') { layer = c; return; }
      (c?.children || []).forEach(find); };
    find(window.__auraRoot);
    if (!layer) return null;
    const g = (layer.children || [])[0];
    if (!g) return null;
    // A pixi v8 Graphics holds its draw calls in context.instructions; an
    // empty (cleared) one has none. Each surviving line contributes a
    // moveTo/lineTo/stroke group, so the count tracks the drawn lines.
    const instr = (g.context && g.context.instructions) || [];
    return { visible: !!g.visible, instructions: instr.length };
  })()
`);

const beforeAny = await readLines();
check('Nothing is drawn before anything attacks',
  beforeAny !== null && (!beforeAny.visible || beforeAny.instructions === 0),
  JSON.stringify(beforeAny));

// --- leg 3: a mob that hits us draws a line ---------------------------------
// Survive without GOD, then stand in the pack and sample.
await cmd('XP 200000');
const level = await page.evaluate(() => Number(window.game?.character?.levelElement?.text ?? NaN));
check('Precondition: levelled up enough to take hits without GOD',
  Number.isFinite(level) && level >= 10, `level ${level}`);

await cmd(`WARP ${PACK}`);
await page.waitForTimeout(8_000);

// Health is read alongside the overlay in the SAME evaluate — reading them as
// two round trips lets the world move between them, and the whole assertion is
// "these two facts were true at the same moment".
const sample = () => page.evaluate(`
  (() => {
    let layer = null;
    const find = (c) => { if (layer) return;
      if ((c?.label || c?.name) === 'attackLines') { layer = c; return; }
      (c?.children || []).forEach(find); };
    find(window.__auraRoot);
    const g = layer ? (layer.children || [])[0] : null;
    const instr = (g && g.context && g.context.instructions) || [];
    // "Focus <cur>/<max>" — the resource bar. A drop is a mob damage tick;
    // nothing else here costs it (the base damage aura is free by ruling, and
    // this run casts nothing).
    const bar = document.querySelector('#healthBar .barText');
    return {
      visible: !!(g && g.visible),
      instructions: instr.length,
      health: bar ? bar.textContent.trim() : null,
    };
  })()
`);

let sawLine = false;
let maxInstructions = 0;
let sawDamage = false;
let lastHealth = null;
const trace = [];
for (let i = 0; i < 20; i++) {
  const s = await sample();
  trace.push(s.instructions);
  if (s.visible && s.instructions > 0) {
    sawLine = true;
    maxInstructions = Math.max(maxInstructions, s.instructions);
  }
  // Any health drop is a mob damage tick — nothing else costs health here (the
  // base damage aura is free, and we cast nothing).
  const cur = s.health ? Number(String(s.health).split('/')[0].replace(/[^\d]/g, '')) || null : null;
  if (cur !== null && lastHealth !== null && cur < lastHealth) sawDamage = true;
  if (cur !== null) lastHealth = cur;
  if (sawLine && sawDamage) {
    await page.screenshot({ path: `.claude/skills/verify/p57-lines-${label}.png` });
    break;
  }
  await page.waitForTimeout(700);
}

if (!sawDamage) {
  check('Something got close enough to hit us (mobs wander — INCONCLUSIVE, not red)', null,
    `no health drop observed; instruction trace ${JSON.stringify(trace)}`);
} else {
  check('A mob hitting the player draws an attack line', sawLine,
    `max instructions in one frame: ${maxInstructions}; trace ${JSON.stringify(trace)}`);
}

// --- leg 4: the line CLEARS again -------------------------------------------
// The fade is the other half of "lingers a moment"; an overlay that never
// clears would smear across the screen within a minute of play.
//
// ⚑ GOD, not a warp, is what stops the damage. A first draft warped to the
// far open tile and still read a live line: warping moves only the player,
// straight into whatever stands at the destination. GOD short-circuits
// takeDamage, so no further damage tick can fire noteHit and the lines already
// on screen have to age out on their own.
if (sawLine) {
  await cmd('GOD');
  await page.waitForTimeout(6_000);
  const after = await readLines();
  check('The lines age out again once nothing is hitting you',
    after !== null && (!after.visible || after.instructions === 0), JSON.stringify(after));
}

check('No console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

await browser.close();
const failed = results.filter((r) => r.pass === false).length;
const inconclusive = results.filter((r) => r.pass === null).length;
console.log(`\n${results.length - failed - inconclusive} PASS, ${failed} FAIL, ${inconclusive} INCONCLUSIVE`);
process.exit(failed > 0 ? 1 : 0);
