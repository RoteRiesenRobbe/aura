#!/usr/bin/env node
// backlog §29 option A — acceptance harness for the context-loss warning.
//
// Two runs, and BOTH matter:
//
//   forced : lose the world context mid-boot (same mechanism as
//            ctxloss-repro.mjs with HUNT_PERCTX=1) → expect exactly one
//            `[webgl] world context lost` console error, and the red alert
//            banner up if the HUD got set up in time.
//   clean  : no forced loss at all → expect ZERO warnings. This is the load-
//            bearing half: pixi makes 5 GL contexts at boot and deliberately
//            loses 2 of them as capability probes (§29.1). If scoping the
//            listener to application.canvas were wrong, every clean boot would
//            cry wolf — worse than no banner at all.
//
// Usage: node .claude/skills/verify/ctxloss-warning.mjs [clean|forced] [url]
import { createRequire } from 'node:module';
import { join } from 'node:path';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');
import { joinAsNewCharacter } from './lib/join.mjs';

const mode = process.argv[2] === 'forced' ? 'forced' : 'clean';
const url = process.argv[3] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const delay = 1500; // ms after context creation — mid-boot, programs still compiling
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();

const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

await page.addInitScript((cfg) => {
  window.__ctx = { created: 0, lostEvents: 0 };
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const ctx = orig.call(this, type, ...rest);
    if (/webgl/.test(type) && ctx) {
      const idx = window.__ctx.created++;
      this.addEventListener('webglcontextlost', () => { window.__ctx.lostEvents++; });
      if (cfg.forced) {
        const ext = ctx.getExtension('WEBGL_lose_context');
        setTimeout(() => {
          if (!ext || (ctx.isContextLost && ctx.isContextLost())) return;
          ext.loseContext();
        }, cfg.delayMs + idx);
      }
    }
    return ctx;
  };
}, { delayMs: delay, forced: mode === 'forced' });

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await joinAsNewCharacter(page, 'ctw');
await page.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 }).catch(() => {});
if (mode === 'forced') {
  // The banner auto-hides after 4.5 s, so catch it while it is still up.
  await page.waitForTimeout(delay + 2_000);
  await page.screenshot({ path: '/tmp/ctxwarn-banner.png' });
  await page.waitForTimeout(6_000);
} else {
  await page.waitForTimeout(delay + 8_000);
}

const banner = await page.evaluate(() => {
  const el = document.getElementById('alertBanner');
  return el ? { className: el.className, text: el.textContent } : null;
});
const ctx = await page.evaluate(() => window.__ctx);
await page.screenshot({ path: `/tmp/ctxwarn-${mode}.png` });

const warnings = consoleErrors.filter((t) => t.includes('[webgl] world context lost'));
const expected = mode === 'forced' ? 1 : 0;
console.log('mode           :', mode);
console.log('gl contexts    :', ctx.created, '| webglcontextlost events seen:', ctx.lostEvents);
console.log('our warnings   :', warnings.length, `(expected ${expected})`);
for (const w of warnings) console.log('  ⚑', w);
console.log('banner         :', JSON.stringify(banner));
console.log('other console errors:', consoleErrors.filter((t) => !t.includes('[webgl] world context lost')).length);
console.log(warnings.length === expected ? 'PASS' : 'FAIL');
await browser.close();
process.exitCode = warnings.length === expected ? 0 : 1;
