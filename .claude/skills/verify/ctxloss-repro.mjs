#!/usr/bin/env node
// backlog §29 — deterministic test of the WebGL-context-loss hypothesis.
//
// Claim: on a lost GL context every WebGL getter returns null, so pixi's
// generateProgram() sees getProgramParameter(...,LINK_STATUS) === null, decides
// the program failed, and calls logProgramError → logPrettyShaderError, whose
// FIRST statement is `gl.getShaderSource(shader).split("\n")` — on a lost
// context getShaderSource() is also null. Result: the exact observed error
// (`Cannot read properties of null (reading 'split')`), thrown out of the
// renderer, one per program the boot path still had to compile → several
// identical page errors + nothing ever rendered (black world), while the DOM
// HUD and the websocket stay perfectly healthy.
//
// Experiment: lose the context DELAY ms after pixi creates it (i.e. mid-boot,
// while programs are still being compiled) and observe.
import { createRequire } from 'node:module';
import { join } from 'node:path';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');
import { joinAsNewCharacter } from './lib/join.mjs';

const url = process.argv[2] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const delay = Number(process.argv[3] ?? 1500);   // ms after context creation
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();

const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push({ message: e.message, stack: e.stack || null }));
const consoleMsgs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleMsgs.push(`${m.type()}: ${m.text()}`.slice(0, 200)); });

await page.addInitScript((cfg) => {
  const delayMs = cfg.delayMs;
  window.__expRestore = cfg.restore;
  window.__exp = { events: [], errors: [], lost: false };
  window.addEventListener('error', (ev) => window.__exp.errors.push({
    message: ev.message, file: ev.filename, line: ev.lineno, col: ev.colno,
    stack: ev.error?.stack || null,
  }));
  // NOTE: the FIRST webgl context pixi creates is a throwaway capability probe
  // (isWebGLSupported()), which pixi deliberately loses — so "a context was
  // lost" is normal at boot and is NOT by itself a signal. Collect them all and
  // kill every live one on the timer instead.
  const contexts = [];
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const ctx = orig.call(this, type, ...rest);
    if (/webgl/.test(type) && ctx) {
      const idx = contexts.push({ ctx, canvas: this }) - 1;
      window.__exp.events.push(`ctx#${idx} created (${type}, connected=${this.isConnected})`);
      this.addEventListener('webglcontextlost', () => window.__exp.events.push(`ctx#${idx} webglcontextlost`));
      this.addEventListener('webglcontextrestored', () => window.__exp.events.push(`ctx#${idx} webglcontextrestored`));
      // HUNT_PERCTX: kill each context delayMs after ITS OWN creation, so the
      // renderer's context dies mid-boot (while programs are still compiling)
      // rather than in steady state where every program is already cached.
      if (cfg.perCtx) {
        const ext0 = ctx.getExtension('WEBGL_lose_context');
        setTimeout(() => {
          if (!ext0 || (ctx.isContextLost && ctx.isContextLost())) return;
          window.__exp.events.push(`ctx#${idx} loseContext() mid-boot`);
          window.__exp.lost = true;
          ext0.loseContext();
        }, delayMs);
      }
    }
    return ctx;
  };
  setTimeout(() => {
    contexts.forEach(({ ctx, canvas }, idx) => {
      if (ctx.isContextLost && ctx.isContextLost()) { window.__exp.events.push(`ctx#${idx} already lost`); return; }
      const ext = ctx.getExtension('WEBGL_lose_context');
      if (!ext) { window.__exp.events.push(`ctx#${idx} no extension`); return; }
      window.__exp.events.push(`ctx#${idx} loseContext() (connected=${canvas.isConnected})`);
      window.__exp.lost = true;
      ext.loseContext();
      // Can the app come back? pixi preventDefaults the loss (so restoration is
      // permitted) but only calls restoreContext() when IT forced the loss —
      // a real driver loss is never restored. Test whether doing it ourselves
      // would work, i.e. whether a ~20-line fix in our code is viable.
      if (window.__expRestore) {
        setTimeout(() => {
          window.__exp.events.push(`ctx#${idx} restoreContext()`);
          ext.restoreContext();
        }, 1500);
      }
    });
  }, delayMs);
}, { delayMs: delay, restore: process.env.HUNT_RESTORE === "1", perCtx: process.env.HUNT_PERCTX === "1" });

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await joinAsNewCharacter(page, 'ctx');
await page.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 }).catch(() => {});
await page.waitForTimeout(delay + 8_000);

const exp = await page.evaluate(() => window.__exp);
const probe = await page.evaluate(() => {
  const plate = window.game?.character?.plate;
  if (!plate) return { reachedStage: false };
  let node = plate;
  while (node.parent) node = node.parent;
  const kids = (node.children || []).map((c) => ({ n: c.label ?? c.constructor?.name, k: (c.children || []).length }));
  return { reachedStage: true, rootChildren: kids.length, grandchildren: kids.reduce((n, k) => n + k.k, 0) };
});
await page.screenshot({ path: '/tmp/hunt29-ctxloss.png' });

const splitErrs = [...pageErrors.map((e) => e.message), ...exp.errors.map((e) => e.message)]
  .filter((m) => /reading 'split'/.test(m || ''));
console.log('gl events      :', exp.events.join(', ') || '(none)');
console.log('page errors    :', pageErrors.length, '| null.split among them:', splitErrs.length);
for (const e of pageErrors.slice(0, 6)) {
  console.log('  ⚑', e.message);
  if (e.stack) console.log(e.stack.split('\n').slice(0, 8).map((l) => '     ' + l.trim()).join('\n'));
}
for (const e of exp.errors.slice(0, 6)) console.log('  in-page:', e.message, '@', `${e.file}:${e.line}:${e.col}`);
console.log('scene probe    :', JSON.stringify(probe));
console.log('console noise  :', consoleMsgs.slice(0, 6).join(' | ') || '(none)');
await browser.close();
