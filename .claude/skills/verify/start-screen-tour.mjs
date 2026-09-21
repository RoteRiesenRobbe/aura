// The start screen's live backdrop: the PRE-JOIN spectator tours the map
// (backend model/spectator/tour.go, frontend player/logic/SpectateFade.ts).
//
// The only script that stays ON the start screen: it never joins, so it leaves
// no character behind. It samples the camera (read back off the world
// container's transform) and #spectateFade's opacity for ~50 s and asserts:
//   1. the view is zoomed OUT (scale well under the in-game default),
//   2. it sweeps: the camera moves, slowly, between cuts,
//   3. at least one cut happens, and the screen is BLACK across it: no sample
//      may show the camera far from its last position while the fade is open,
//   4. the black lifts again,
//   5. the world is populated at the places it shows.
// Screenshots (start-tour-*.png) are for the eye: is it epic?
//
// ⚑ Headless renders at a few fps, so opacity samples are coarse; leg 3 is
// phrased as "never lit across a jump" rather than "saw opacity 1" for that
// reason. Usage: node start-screen-tour.mjs [label] [url]
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const label = process.argv[2] || 'start-tour';
const url = process.argv[3]
  || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = {
  ...process.env,
  LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':'),
};
const outDir = dirname(fileURLToPath(import.meta.url));
const results = [];
const pass = (n, d = '') => { results.push('PASS'); console.log(`  ✅ ${n}${d ? ' — ' + d : ''}`); };
const fail = (n, d = '') => { results.push('FAIL'); console.log(`  ❌ ${n}${d ? ' — ' + d : ''}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const sample = (page) => page.evaluate(() => {
  const group = window.spectatorTour?.cameraGroup;
  if (!group) return null;
  const count = (n, d) => !n.children || d > 3 ? 0
    : n.children.reduce((s, c) => s + (c.visible ? 1 + count(c, d + 1) : 0), 0);
  const fade = document.getElementById('spectateFade');
  return {
    t: performance.now(),
    scale: group.scale.x,
    x: (window.innerWidth / 2 - group.position.x) / group.scale.x / 120,
    y: (window.innerHeight / 2 - group.position.y) / group.scale.x / 120,
    opacity: fade ? Number(fade.style.opacity) : 0,
    objects: count(group, 0),
  };
});

const browser = await chromium.launch({ env, args: ['--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(url);
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
try {
  await page.waitForSelector('#characterCreation:not(.hidden), #characterSelect:not(.hidden), #loginPanel:not(.hidden)',
    { timeout: 60000 });
} catch (e) {
  console.log('never reached the account screens:', errors.slice(0, 5));
  await page.screenshot({ path: join(outDir, `${label}-stuck.png`) });
  await browser.close();
  process.exit(2);
}

const samples = [];
const started = Date.now();
let shots = 0;
while (Date.now() - started < 50000) {
  const s = await sample(page);
  if (s) {
    samples.push(s);
    if (s.opacity === 0 && shots < 3 && samples.length % 40 === 5) {
      await page.screenshot({ path: join(outDir, `${label}-${++shots}.png`) });
    }
  }
  await sleep(100);
}

console.log(`\n${samples.length} samples`);
if (samples.length < 50) {
  fail('sampling', 'the world container was never readable');
} else {
  const s0 = samples[0];
  // In-game default at 800 px high: 800 / (7.6 * 120) = 0.877. Twice as far out is half.
  (s0.scale < 0.6 ? pass : fail)('zoomed out', `scale ${s0.scale.toFixed(3)} (in-game default would be ~0.88)`);

  let moved = 0, cuts = 0, litJumps = 0, maxStep = 0;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (d > 2) {
      cuts++;
      // b is the first look at the NEW place; a may still be mid-cover.
      if (b.opacity < 0.9) litJumps++;
      console.log(`  cut #${cuts}: (${a.x.toFixed(1)}, ${a.y.toFixed(1)}) -> (${b.x.toFixed(1)}, ${b.y.toFixed(1)}), opacity ${a.opacity.toFixed(2)} -> ${b.opacity.toFixed(2)}`);
    } else {
      moved += d;
      maxStep = Math.max(maxStep, d / ((b.t - a.t) / 1000));
    }
  }
  (moved > 10 ? pass : fail)('the view sweeps', `${moved.toFixed(1)} u travelled between cuts, peak ${maxStep.toFixed(2)} u/s`);
  (cuts >= 1 ? pass : fail)('at least one cut', `${cuts} in 50 s`);
  (litJumps === 0 ? pass : fail)('black across every cut', `${litJumps} cut(s) showed the new place with the fade open`);
  const peak = Math.max(...samples.map(s => s.opacity));
  const last = samples[samples.length - 1].opacity;
  (peak >= 0.9 ? pass : fail)('the fade reaches black', `peak opacity ${peak.toFixed(2)}`);
  const lifted = samples.some((s, i) => i > 0 && samples[i - 1].opacity > 0.5 && s.opacity === 0)
    || samples.slice(samples.findIndex(s => s.opacity >= 0.9)).some(s => s.opacity === 0);
  (lifted ? pass : fail)('the black lifts again', `final opacity ${last.toFixed(2)}`);
  const objs = samples.map(s => s.objects);
  (Math.min(...objs) > 20 ? pass : fail)('the world is populated wherever it looks',
    `display objects min ${Math.min(...objs)} / max ${Math.max(...objs)}`);
}
(errors.length === 0 ? pass : fail)('no page errors', errors.slice(0, 3).join(' | '));
await browser.close();
process.exit(results.includes('FAIL') ? 1 : 0);
