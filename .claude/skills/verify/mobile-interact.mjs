#!/usr/bin/env node
// The mobile interact button (2026-08-02): on a phone the offer is presented
// as a HUD button instead of the E badge over the actor's head.
//
//   node mobile-interact.mjs [url] [outdir]
//
// ⚑ Boundary: `r4-badge.mjs` owns the badge's ANCHOR geometry on desktop.
// This script owns the mobile surface — that the badge is gone, that the
// button appears and disappears with the offer, and that tapping it opens the
// conversation. The one desktop assertion here is the control that makes the
// mobile ones mean something (badge present / button absent), not a re-test of
// r4-badge's measurements.
//
// ⚑ The mobile/desktop split is forced with ?mobile / ?desktop: headless
// Chromium's `hasTouch` does not flip `pointer: coarse`, so an emulated-only
// run would measure the desktop layout and pass every assertion about it.
//
// Legs, per flavour:
//   1. out of range — no badge, no button
//   2. warped beside a conversant — mobile: button shown AND badge absent;
//      desktop: badge shown AND button absent
//   3. mobile only — tapping the button opens the conversation panel
//   4. mobile only — leaving the conversation puts the button back
//   5. mobile only — walking out of range hides it again
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { botName } from './botname.mjs';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');

const base = process.argv[2] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const outdir = process.argv[3] || '/tmp/mobile-interact-shots';
mkdirSync(outdir, { recursive: true });

const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = {
  ...process.env,
  LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':'),
};

// WARP takes 1/120 units and wants whole units.
const w = (x, y) => `${Math.round(x) * 120} ${Math.round(y) * 120}`;
// The town cluster: Farmer (-57, 28.6), Hermit (-54.9, 25.6), TownCrier
// (-55.7, 22.0) stand within ~3 units, and the server offers the NEAREST. This
// script therefore asserts that SOME conversant answered, never which one —
// naming one would pin a positional accident (the r4-badge lesson).
const BESIDE_CONVERSANT = w(-55, 25);
const FAR_AWAY = w(-30, 40);

const errors = [];
const fail = (m) => { errors.push('CHECK FAILED: ' + m); console.log('  ✗ ' + m); };
const pass = (m) => console.log('  ✓ ' + m);

const browser = await chromium.launch({ args: ['--no-sandbox'], env });

async function run(flavour) {
  const mobile = flavour === 'mobile';
  const ctx = await browser.newContext({
    viewport: mobile ? { width: 844, height: 390 } : { width: 1280, height: 800 },
    hasTouch: mobile,
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`${flavour} pageerror: ` + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(`${flavour} console: ` + m.text()); });

  await page.goto(`${base}&${flavour}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForSelector('#startForm .playerNameSubmit:not([disabled])', { timeout: 60_000 });
  await page.fill('#startForm .playerNameInput', botName(flavour === 'mobile' ? 'tap' : 'key'));
  await page.click('#startForm .playerNameSubmit');
  await page.waitForFunction(() => !!window.game?.character, null, { timeout: 60_000 });
  await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });

  const cmd = async (text) => {
    await page.evaluate((t) => {
      const input = document.getElementById('console_command');
      input.value = t;
      document.getElementById('console').dispatchEvent(new Event('submit', { cancelable: true }));
    }, text);
    await page.waitForTimeout(700);
  };

  // GOD: this run stands still beside NPCs for a while, and a dead player nulls
  // character.plate — the documented way into the scene graph — which reads as
  // a crash in the feature under test.
  await cmd('GOD');
  await page.evaluate(() => {
    const p = document.getElementById('developPanel');
    if (p) p.style.display = 'none';
    let r = window.game.character.plate.parent;
    while (r.parent) r = r.parent;
    window.__auraRoot = r;
  });

  // One sample, read atomically — the badge and the button describe the same
  // moment, and a split read lets the world move between them.
  const sample = () => page.evaluate(() => {
    let badges = 0;
    const walk = (c) => {
      if (c?.visible === false) return;
      if (typeof c?.text === 'string' && c.text.trim() === 'E') badges++;
      (c?.children || []).forEach(walk);
    };
    walk(window.__auraRoot);
    const btn = document.getElementById('interactButton');
    const b = btn.getBoundingClientRect();
    const conv = document.getElementById('conversation');
    return {
      badges,
      buttonShown: getComputedStyle(btn).display !== 'none',
      buttonRect: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) },
      offered: window.game.character ? undefined : undefined,
      conversationOpen: !conv.classList.contains('hidden'),
      actor: conv.querySelector('.conversationActor')?.textContent?.trim() || '',
      vw: window.innerWidth, vh: window.innerHeight,
    };
  });

  console.log(`\n=== ${flavour} ===`);

  // --- Leg 1: out of range --------------------------------------------------
  await cmd(`WARP ${FAR_AWAY}`);
  await page.waitForTimeout(1500);
  let s = await sample();
  if (s.badges !== 0) fail(`${flavour}: a badge is lit with nobody in range (${s.badges})`);
  else pass('out of range: no badge');
  if (s.buttonShown) fail(`${flavour}: the interact button is shown with nobody in range`);
  else pass('out of range: no button');

  // --- Leg 2: beside a conversant -------------------------------------------
  await cmd(`WARP ${BESIDE_CONVERSANT}`);
  // The offer rides GameState on the throttled rAF loop — wait for the state,
  // never a fixed sleep.
  await page.waitForFunction((isMobile) => {
    const btn = document.getElementById('interactButton');
    if (isMobile) return getComputedStyle(btn).display !== 'none';
    let n = 0;
    const walk = (c) => {
      if (c?.visible === false) return;
      if (typeof c?.text === 'string' && c.text.trim() === 'E') n++;
      (c?.children || []).forEach(walk);
    };
    walk(window.__auraRoot);
    return n > 0;
  }, mobile, { timeout: 25_000 }).catch(() => {});
  s = await sample();

  if (mobile) {
    if (s.badges !== 0) fail(`the E badge is still drawn on mobile (${s.badges} lit) — it should be replaced, not accompanied`);
    else pass('beside a conversant: the E badge is NOT drawn');
    if (!s.buttonShown) fail('beside a conversant: the interact button did not appear');
    else pass(`beside a conversant: the button is shown at ${s.buttonRect.x},${s.buttonRect.y} (${s.buttonRect.w}×${s.buttonRect.h})`);
    if (s.buttonRect.w < 44 || s.buttonRect.h < 44) fail(`the button is below the 44px tap floor (${s.buttonRect.w}×${s.buttonRect.h})`);
    else pass('the button meets the 44px tap floor');
    // Bottom right, and clear of the action tiles.
    const tiles = await page.evaluate(() => {
      const t = [...document.querySelectorAll('#auraSlotList>li,#cooldownSlotList>li')].map(e => e.getBoundingClientRect());
      return { top: Math.min(...t.map(b => b.top)), right: Math.max(...t.map(b => b.right)) };
    });
    if (s.buttonRect.x + s.buttonRect.w > s.vw + 1 || s.buttonRect.y + s.buttonRect.h > s.vh + 1) {
      fail('the button falls outside the viewport');
    } else if (s.buttonRect.x < s.vw / 2) {
      fail(`the button is not on the right half (x=${s.buttonRect.x} of ${s.vw})`);
    } else if (s.buttonRect.y + s.buttonRect.h > tiles.top + 1) {
      fail(`the button overlaps the action tiles (button bottom ${s.buttonRect.y + s.buttonRect.h}, tiles top ${Math.round(tiles.top)})`);
    } else {
      pass('the button sits bottom-right, clear of the action tiles');
    }
  } else {
    if (s.badges < 1) fail('desktop: the E badge did not light beside a conversant');
    else pass(`desktop control: the E badge is drawn (${s.badges} lit)`);
    if (s.buttonShown) fail('desktop: the mobile interact button is visible');
    else pass('desktop control: no interact button');
  }
  await page.screenshot({ path: join(outdir, `${flavour}-offered.png`) });

  if (mobile) {
    // --- Leg 3: tapping it opens the conversation ---------------------------
    const box = await page.locator('#interactButton').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForFunction(
      () => !document.getElementById('conversation').classList.contains('hidden'),
      null, { timeout: 15_000 }).catch(() => {});
    s = await sample();
    if (!s.conversationOpen) fail('tapping the interact button did not open the conversation');
    else pass(`tapping the button opened the conversation with "${s.actor}"`);
    if (s.conversationOpen && s.buttonShown) fail('the button stays on screen over the open conversation');
    else if (s.conversationOpen) pass('the button steps aside while the panel is open');
    await page.screenshot({ path: join(outdir, 'mobile-conversation.png') });

    // --- Leg 4: leaving puts it back ----------------------------------------
    const leave = await page.locator('#conversation .conversationLeave').boundingBox();
    if (leave) {
      await page.mouse.click(leave.x + leave.width / 2, leave.y + leave.height / 2);
      await page.waitForTimeout(1200);
      s = await sample();
      if (s.conversationOpen) fail('the conversation did not close');
      else if (!s.buttonShown) fail('the interact button did not come back after leaving');
      else pass('leaving the conversation brings the button back');
    }

    // --- Leg 5: walking out of range hides it -------------------------------
    await cmd(`WARP ${FAR_AWAY}`);
    await page.waitForFunction(
      () => getComputedStyle(document.getElementById('interactButton')).display === 'none',
      null, { timeout: 20_000 }).catch(() => {});
    s = await sample();
    if (s.buttonShown) fail('the button is still shown after leaving the area');
    else pass('walking away hides the button again');
  }

  await ctx.close();
}

await run('mobile');
await run('desktop');
await browser.close();

console.log(`\nscreenshots → ${outdir}`);
if (errors.length) {
  console.log(`\n${errors.length} problem(s):`);
  errors.forEach(e => console.log('  - ' + e));
  process.exit(1);
}
console.log('\nALL CHECKS PASSED');
