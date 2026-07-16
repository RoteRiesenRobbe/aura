#!/usr/bin/env node
// Headless-Chromium driver for the simharness web explorer.
//
//   node driver.mjs [url] [outdir]
//     url     default http://localhost:8099
//     outdir  default ./simharness-shots
//
// Drives the page end-to-end: waits for the 1v1 auto-run, fires the
// level-curve battery, the pack-matrix battery and the kills/hour chain
// battery, screenshots all four states, exits non-zero on any console/page
// error. Requires setup-browser.sh to have run once.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js')); // resolve playwright from the harness dir
const { chromium } = require('playwright');

const url = process.argv[2] || 'http://localhost:8099';
const outdir = process.argv[3] || 'simharness-shots';
mkdirSync(outdir, { recursive: true });

// The extracted-deb libs must be visible to the chromium subprocess.
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = {
  ...process.env,
  LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':'),
};

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 2600 } })).newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForSelector('#results .scenario'); // the 1v1 battery auto-runs on load
await page.screenshot({ path: join(outdir, '1v1.png'), fullPage: true });

// Shrink the level span so the curve battery stays quick, then run it.
await page.fill('#curveKnobs fieldset[data-group="Curve"] label:nth-of-type(2) input', '12');
await page.click('#curveRunBtn');
await page.waitForSelector('#curveStatus:has-text("done")', { timeout: 120_000 });
await page.screenshot({ path: join(outdir, 'level-curve.png'), fullPage: true });

// The pack matrix (chunk 3), at its default 8-pack / 4-candidate grid.
await page.click('#matrixRunBtn');
await page.waitForSelector('#matrixStatus:has-text("done")', { timeout: 120_000 });
await page.screenshot({ path: join(outdir, 'matrix.png'), fullPage: true });

// The kills/hour chain (chunk 4), with level brackets on. Recovery ticks
// make chains slower than fights — give it a longer leash.
await page.fill('#chainLevelsInp', '1,10');
await page.click('#chainRunBtn');
await page.waitForSelector('#chainStatus:has-text("done")', { timeout: 180_000 });
await page.screenshot({ path: join(outdir, 'chain.png'), fullPage: true });

await browser.close();
if (errors.length > 0) {
  console.error('console errors:', errors);
  process.exit(1);
}
console.log(`ok — screenshots in ${outdir}/ (1v1.png, level-curve.png, matrix.png, chain.png)`);
