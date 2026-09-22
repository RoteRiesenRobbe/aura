#!/usr/bin/env node
// Skill VFX §12g: the `wave` kind draws (plan-skill-vfx.md §12g.2, the mammoth
// stomp). No placed mob authors it yet and the C4 scale JSON reduces the
// counters to a row, so this is the ONE place the kind is seen to execute:
// the dev-only stress driver is pointed at the stomp alone (`skillIds: [105]`,
// a `fired` layer, `count` 2), which feeds `WaveFx` through the REAL
// `onSnapshot`, and the leg reads `spawnedByKind.wave` plus the page's error
// collector. Then one screenshot with the page clock slowed 8x, armed on the
// wave counter (the C2a recipe), so a 500 ms ring is on the frame.
//
// A counters-only leg would repeat C2b's lesson (four-pixel emitters passed 13
// legs), which is why the shot is not optional: look at it.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { joinAsNewCharacter } from './lib/join.mjs';
import { botName } from './botname.mjs';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');

const url = process.argv[2] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const outdir = process.argv[3] || '/tmp/skill-fx-wave';
mkdirSync(outdir, { recursive: true });
const STOMP = 105;

async function runCommand(page, command) {
  await page.waitForSelector('#console_command', { state: 'attached' });
  await page.evaluate((cmd) => {
    const input = document.querySelector('#console_command');
    input.value = cmd;
    document.querySelector('#console').dispatchEvent(new Event('submit', { cancelable: true }));
  }, command);
  await page.waitForTimeout(400);
}

const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };
const browser = await chromium.launch({
  args: ['--no-sandbox', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
  env,
});
const errors = [];
let failed = 0;
const pass = (m) => console.log('PASS: ' + m);
const fail = (m) => { failed++; console.log('FAIL: ' + m); };

try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await joinAsNewCharacter(page, botName('wave'));
  await page.waitForFunction(() => !!window.game?.character, null, { timeout: 60_000 });
  await page.evaluate(() => { const p = document.getElementById('developPanel'); if (p) p.style.display = 'none'; });
  await page.mouse.move(800, 200);
  await page.waitForFunction(() => window.game.skillFxStress && (window.game.skillFx().density !== undefined), null, { timeout: 30_000 });
  // Open ground (the scale harness's venue, no spawn within ~8 u): the
  // negative claim below is only worth anything with no real fight in view.
  // A first draft measured at the spawn fire and read 144 wolf strikes.
  await runCommand(page, 'GOD');
  let landed = false;
  for (let attempt = 0; attempt < 2 && !landed; attempt++) {
    // ⚑ A WARP issued while the console is busy is simply lost (the scale
    // harness's lesson), so the position is checked and the warp retried.
    await runCommand(page, `WARP ${-23 * 120} ${14 * 120}`);
    landed = await page.waitForFunction(() => {
      const c = window.game.character;
      return Math.hypot(c.getX() / 120 + 23, c.getY() / 120 - 14) < 1.5;
    }, null, { timeout: attempt === 0 ? 12_000 : 20_000 }).then(() => true).catch(() => false);
  }
  if (!landed) { console.log('INCONCLUSIVE: the warp to open ground never landed'); process.exit(2); }
  // Let whatever the spawn fire's fight streamed drain out of the window,
  // then a CONTROL window of the same length as the measured one: even open
  // ground has mob-vs-mob fights at the viewport's edge (measured 22 to 42
  // strikes + marks in 12 s), so "the stomps spawned nothing else" is only
  // scorable when the control window was quiet.
  await page.waitForTimeout(4_000);
  const c0 = await page.evaluate(() => ({ ...window.game.skillFx().spawnedByKind }));
  await page.waitForTimeout(12_000);
  const c1 = await page.evaluate(() => ({ ...window.game.skillFx().spawnedByKind }));
  const control = Object.keys(c1).reduce((n, k) => n + ((c1[k] ?? 0) - (c0[k] ?? 0)), 0);
  console.log(`control: ${control} Fx in 12 s with no driver`);

  // Arm the shot BEFORE the driver starts: the first wave is the one caught.
  const armed = page.evaluate(() => new Promise((resolve) => {
    const base0 = window.game.skillFx().spawnedByKind.wave ?? 0;
    const started = Date.now();
    const poll = setInterval(() => {
      if ((window.game.skillFx().spawnedByKind.wave ?? 0) > base0) {
        clearInterval(poll);
        const real = performance.now.bind(performance);
        const base = real();
        window.__realNow = real;
        performance.now = () => base + (real() - base) / 8;
        resolve(true);
      } else if (Date.now() - started > 8_000) { clearInterval(poll); resolve(false); }
    }, 5);
  }));
  const before = await page.evaluate(() => ({ ...window.game.skillFx().spawnedByKind }));
  const started = await page.evaluate((id) => window.game.skillFxStress({ eventsPerSec: 6, seconds: 5, skillIds: [id] }), STOMP);
  console.log(`driver: ${JSON.stringify(started)}`);
  if (started && started.ok === false) fail(`the driver refused: ${started.why}`);
  if (await armed) {
    // 1.6 s of slowed clock = 200 ms into a 500 ms two-ring wave.
    await page.waitForTimeout(1_600);
    await page.screenshot({ path: join(outdir, 'wave-stomp.png') });
    await page.evaluate(() => { if (window.__realNow) { performance.now = window.__realNow; window.__realNow = null; } });
    pass('a wave was photographed (wave-stomp.png)');
  } else {
    fail('no wave spawned within 8 s of starting the driver');
  }
  await page.waitForTimeout(6_000);
  const after = await page.evaluate(() => ({ ...window.game.skillFx().spawnedByKind }));
  const waves = (after.wave ?? 0) - (before.wave ?? 0);
  const others = Object.keys(after).filter(k => k !== 'wave').reduce((n, k) => n + ((after[k] ?? 0) - (before[k] ?? 0)), 0);
  console.log(`spawned: ${JSON.stringify(after)} (delta wave ${waves}, other kinds ${others})`);
  if (waves >= 5) pass(`${waves} wave layer(s) spawned through the real onSnapshot`);
  else fail(`expected >= 5 waves from 6 casts/s over 5 s, saw ${waves}`);
  // A `fired` event plans no hit mark (§12g.2), and the stomp authors no other layer.
  if (control > 0) console.log(`NOTE: ${others} non-wave Fx in the window against ${control} in the control: a live fight is in view, the negative claim is not scorable here`);
  else if (others === 0) pass('a fired stomp spawned nothing but its wave: no mark, no other kind');
  else fail(`${others} non-wave Fx spawned from fired-only stomps`);
} finally {
  await browser.close();
}
const real = errors.filter(e => !/favicon/i.test(e));
if (real.length) { console.log('PAGE ERRORS:'); real.forEach(e => console.log('  ' + e)); failed++; }
else pass('no page error while waves drew');
console.log(failed ? `\nRESULT: FAIL (${failed})` : '\nRESULT: PASS');
process.exit(failed ? 1 : 0);
