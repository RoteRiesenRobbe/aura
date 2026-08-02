#!/usr/bin/env node
// backlog §29 hunt: intermittent triple `Cannot read properties of null
// (reading 'split')` + (sometimes) a black world on a cold client boot.
//
// Four sightings, ~1 in 6 cold loads, no usable stack — the prod bundle is
// minified. This harness exists so the fifth sighting is not wasted:
//
//   * point it at the DEV server (port 2001, `eval-source-map`) so the stack
//     names real files;
//   * hard CPU throttling (CDP Emulation.setCPUThrottlingRate) to widen the
//     suspected first-frame starvation window;
//   * a fresh browser context per run = cold HTTP cache each time;
//   * capture BOTH `pageerror` (Error object → .stack) and an in-page
//     window 'error' listener (gives error.stack plus filename/lineno even
//     when Playwright's copy is stack-less);
//   * a scene-graph probe, because sighting 2 proved the errors and the black
//     world are separable — recording which symptoms co-occur is the point.
//
// Usage:
//   node .claude/skills/verify/hunt-null-split.mjs [runs] [url] [throttle]
//   node .claude/skills/verify/hunt-null-split.mjs 10 \
//     'http://localhost:2001/?token=plz&wsUrl=ws://localhost:2000/game&develop' 20
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { botName } from './botname.mjs';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');

const runs = Number(process.argv[2] || 6);
const url = process.argv[3] || 'http://localhost:2001/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const throttle = Number(process.argv[4] ?? 20);
const outdir = process.env.HUNT_OUT || '/tmp/hunt29';
mkdirSync(outdir, { recursive: true });

const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = {
  ...process.env,
  LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':'),
};

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const results = [];

// Both early sightings shared "first cold load after a fresh aurad restart"
// (weakened but not disproven by the round-3 retries), so HUNT_RESTART=1
// recreates that condition for every run. `pkill -x` per the verify skill —
// `pkill -f aurad` matches this harness's own shell and kills it.
const restartServer = () => {
  execSync('pkill -x aurad || true');
  execSync('sleep 1; cd backend && setsid nohup ./aurad -dev -content ../api > /tmp/bh.log 2>&1 < /dev/null &',
    { shell: '/bin/bash', cwd: process.env.AURA_REPO || process.cwd() });
  execSync('for i in $(seq 1 60); do curl -sf -o /dev/null http://localhost:2000/ && break; sleep 0.5; done',
    { shell: '/bin/bash' });
};

for (let run = 1; run <= runs; run++) {
  const label = `run${String(run).padStart(2, '0')}`;
  if (process.env.HUNT_RESTART === '1') restartServer();
  // Fresh context => fresh HTTP cache, fresh sessionStorage (no auto-rejoin).
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push({ message: e.message, stack: e.stack || null }));
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  // In-page capture: window 'error' carries filename/lineno/colno even when the
  // Error itself has no stack, and it fires for handler-thrown errors that
  // Playwright sometimes only surfaces as a bare message.
  await page.addInitScript(() => {
    // Starvation metric: both sightings reported client frame times up to
    // ~40 000 ms, so a run that never starves was never in the suspect regime.
    // Recording it means a clean batch still says something.
    window.__hunt29rAF = { max: 0, frames: 0 };
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      const gap = now - last;
      last = now;
      if (gap > window.__hunt29rAF.max) window.__hunt29rAF.max = gap;
      window.__hunt29rAF.frames++;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    window.__hunt29 = [];
    window.addEventListener('error', (ev) => {
      window.__hunt29.push({
        kind: 'error',
        message: ev.message,
        file: ev.filename,
        line: ev.lineno,
        col: ev.colno,
        stack: ev.error && ev.error.stack ? ev.error.stack : null,
        t: performance.now(),
      });
    });
    window.addEventListener('unhandledrejection', (ev) => {
      const r = ev.reason;
      window.__hunt29.push({
        kind: 'rejection',
        message: r && r.message ? r.message : String(r),
        stack: r && r.stack ? r.stack : null,
        t: performance.now(),
      });
    });
  });

  const cdp = await context.newCDPSession(page);
  if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  // HUNT_NET=1 widens every "used before its async load finished" window: a
  // 5.5 MiB bundle + 7 MiB of mp3 + ~90 SVGs + the /skills and /mobs catalog
  // fetches all arrive far later relative to first paint. A different shape of
  // starvation from CPU throttling, and arguably the likelier one.
  if (process.env.HUNT_NET === '1') {
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false, latency: 200, downloadThroughput: 500 * 1024 / 8, uploadThroughput: 500 * 1024 / 8,
    });
  }

  let joined = false;
  let frameProbe = null;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForSelector('#startForm .playerNameSubmit:not([disabled])', { timeout: 180_000 });
    await page.fill('#startForm .playerNameInput', botName('hunt'));
    await page.click('#startForm .playerNameSubmit');
    await page.waitForFunction(() => !!window.game?.character, null, { timeout: 180_000 });
    joined = true;
    // Let the first frames land under throttling before probing / shooting.
    await page.waitForTimeout(6_000);

    // Black-world probe: walk up from the local player's nameplate to the stage
    // root (window.game is a narrow console facade — no .layers, no .state) and
    // report the child counts of every root-level container.
    frameProbe = await page.evaluate(() => {
      const plate = window.game?.character?.plate;
      if (!plate) return { reachedStage: false };
      let node = plate;
      while (node.parent) node = node.parent;
      const kids = (node.children || []).map((c) => ({
        name: c.label ?? c.name ?? c.constructor?.name ?? '?',
        visible: c.visible,
        children: (c.children || []).length,
      }));
      return {
        reachedStage: true,
        rootChildren: kids.length,
        totalGrandchildren: kids.reduce((n, k) => n + k.children, 0),
        kids,
      };
    });
  } catch (e) {
    frameProbe = { error: String(e).slice(0, 300) };
  }

  const inPage = await page.evaluate(() => window.__hunt29 || []).catch(() => []);
  const raf = await page.evaluate(() => window.__hunt29rAF || null).catch(() => null);
  const splitHits = [...pageErrors.map((e) => e.message), ...inPage.map((e) => e.message)]
    .filter((m) => /reading 'split'/.test(m || '')).length;
  const dark = frameProbe?.reachedStage && frameProbe.totalGrandchildren === 0;

  if (splitHits || dark || pageErrors.length) {
    await page.screenshot({ path: join(outdir, `${label}-FAIL.png`) }).catch(() => {});
    writeFileSync(join(outdir, `${label}-errors.json`),
      JSON.stringify({ pageErrors, inPage, consoleErrors, frameProbe, raf }, null, 2));
  }

  results.push({ label, joined, splitHits, pageErrors: pageErrors.length, dark: !!dark, maxFrame: raf?.max ?? 0 });
  console.log(`${label}: joined=${joined} split-hits=${splitHits} pageErrors=${pageErrors.length} ` +
    `rootKids=${frameProbe?.rootChildren ?? '-'} grandKids=${frameProbe?.totalGrandchildren ?? '-'} ` +
    `maxFrame=${Math.round(raf?.max ?? 0)}ms frames=${raf?.frames ?? '-'}`);
  for (const e of pageErrors) {
    console.log(`   ⚑ ${e.message}`);
    if (e.stack) console.log(e.stack.split('\n').slice(0, 12).map((l) => '      ' + l.trim()).join('\n'));
  }
  for (const e of inPage) {
    if (!/reading 'split'/.test(e.message || '')) continue;
    console.log(`   ⚑ in-page ${e.message} @ ${e.file}:${e.line}:${e.col} t=${Math.round(e.t)}ms`);
    if (e.stack) console.log(e.stack.split('\n').slice(0, 12).map((l) => '      ' + l.trim()).join('\n'));
  }

  await context.close();
}

await browser.close();
const hit = results.filter((r) => r.splitHits > 0).length;
const darkRuns = results.filter((r) => r.dark).length;
const worstFrame = Math.round(Math.max(0, ...results.map((r) => r.maxFrame)));
console.log(`\n=== ${runs} runs · throttle ${throttle}× · net ${process.env.HUNT_NET === '1' ? 'throttled' : 'full'} ` +
  `· null.split in ${hit} · black world in ${darkRuns} · worst frame gap ${worstFrame}ms ===`);
console.log(`artifacts: ${outdir}`);
