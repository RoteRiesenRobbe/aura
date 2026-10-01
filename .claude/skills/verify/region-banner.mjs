// The region title banner (2026-09-28), at the real game surface.
//
// Owns: entering a titled region shows its title (and subtitle) at the top
// centre after the settle time and not before; the banner fades out after its
// hold; walking out and straight back in says nothing (the per-place cooldown);
// a title-only region hides the subtitle line; a region only skimmed says
// nothing; and a WARP into a titled region announces it (entry by movement).
// Does NOT own the settle/cooldown arithmetic (vitest, RegionNames.test.ts) or
// the zone-format plumbing (AuraTiledConvert.test.ts, zone_test.go, verify.sh).
//
// ⚑ NO ZONE EDIT: titled regions are pushed into the LIVE region array
// (`game.regions.loaded()`, BrowserConsole) around the player, so entering and
// leaving are mostly done by moving the REGION, not the player. The lookup,
// the frame loop and the DOM are the real ones. ⚑ It restates SETTLE_MS (1 s)
// and the fade + hold (0.6 + 3 s + 1.2 s): update them with a retune.
//
//   node .claude/skills/verify/region-banner.mjs [label] [url]

import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { joinAsNewCharacter } from './lib/join.mjs';

const label = process.argv[2] || 'banner';
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
const shotDir = process.env.BANNER_SHOT_DIR || dirname(fileURLToPath(import.meta.url));

const results = [];
const consoleErrors = [];
const report = (state, name, note = '') => {
  results.push({ state, name, note });
  console.log(`${state}  ${name}${note ? '  — ' + note : ''}`);
};
const check = (ok, name, note) => report(ok ? 'PASS' : 'FAIL', name, note);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
page.on('console', (m) => {
  if (m.type() === 'error' && !/\b401\b/.test(m.text())) consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

const cmd = async (text) => {
  await page.evaluate((t) => {
    const input = document.getElementById('console_command');
    input.value = t;
    document.getElementById('console').dispatchEvent(new Event('submit', { cancelable: true }));
  }, text);
  await sleep(600);
};

const banner = () => page.evaluate(() => {
  const el = document.getElementById('regionBanner');
  if (!el) return null;
  const sub = el.querySelector('.regionSubtitle');
  return {
    visible: el.classList.contains('visible'),
    title: el.querySelector('.regionTitle').textContent,
    subtitle: sub.textContent,
    subtitleShown: !sub.classList.contains('hidden'),
  };
});

/** Pushes a titled square (world px, half-size `half` metres) centred on
 *  (cx, cy) metres, or on the player when no centre is given. */
const pushRegion = (title, subtitle, half, cx, cy) => page.evaluate(({ title, subtitle, half, cx, cy }) => {
  const ch = window.game.character;
  const x = cx === undefined ? ch.getX() : cx * 120;
  const y = cy === undefined ? ch.getY() : cy * 120;
  const h = half * 120;
  const r = { profile: 'Fields', title, points: [
    { x: x - h, y: y - h }, { x: x + h, y: y - h }, { x: x + h, y: y + h }, { x: x - h, y: y + h }] };
  if (subtitle) r.subtitle = subtitle;
  window.game.regions.loaded().push(r);
}, { title, subtitle, half, cx, cy });

const dropRegion = (title) => page.evaluate((title) => {
  const list = window.game.regions.loaded();
  const i = list.findIndex((r) => r.title === title);
  if (i >= 0) list.splice(i, 1);
}, title);

try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 }).catch(() => {});
  console.log(`\njoined as ${await joinAsNewCharacter(page, 'banner')}\n`);
  await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
  await page.evaluate(() => {
    const p = document.getElementById('developPanel');
    if (p) p.style.display = 'none';
  });
  await cmd('GOD');
  await sleep(1500);

  let b = await banner();
  if (!b) throw new Error('#regionBanner is not in the HUD');
  check(!b.visible, '0 nothing shows where no region is titled (the shipped world)',
    `visible ${b.visible}, title "${b.title}"`);

  // --- 1. entering: after the settle, not before ----------------------------
  await pushRegion('Testmarch', 'Where harnesses roam', 15);
  await sleep(400);
  b = await banner();
  check(!b.visible, '1a nothing in the first 0.4 s (the 1 s settle)', `visible ${b.visible}`);
  await sleep(1400);
  b = await banner();
  check(b.visible && b.title === 'Testmarch' && b.subtitle === 'Where harnesses roam' && b.subtitleShown,
    '1b the title and subtitle show once settled', JSON.stringify(b));
  await page.screenshot({ path: join(shotDir, `region-banner-${label}.png`), clip: { x: 240, y: 60, width: 800, height: 260 } })
    .catch(() => {});

  // --- 2. it fades out after the hold ---------------------------------------
  await sleep(4200); // 0.6 fade-in + 3 s hold, from the show at ~1 s; plus margin
  b = await banner();
  check(!b.visible, '2 the banner has faded out after its hold', `visible ${b.visible}`);

  // --- 3. out and straight back in: the cooldown -----------------------------
  await dropRegion('Testmarch');
  await sleep(300);
  await pushRegion('Testmarch', 'Where harnesses roam', 15);
  await sleep(2500);
  b = await banner();
  check(!b.visible, '3 re-entering the same place at once says nothing', `visible ${b.visible}`);
  await dropRegion('Testmarch');

  // --- 4. a title-only region hides the subtitle line -----------------------
  await pushRegion('Barewold', undefined, 15);
  await sleep(1800);
  b = await banner();
  check(b.visible && b.title === 'Barewold' && !b.subtitleShown,
    '4 a title-only region shows no subtitle line', JSON.stringify(b));
  await dropRegion('Barewold');
  await sleep(4500);

  // --- 5. skimming a region says nothing ------------------------------------
  await pushRegion('Brushby', undefined, 15);
  await sleep(400);
  await dropRegion('Brushby');
  await sleep(2000);
  b = await banner();
  check(!(b.visible && b.title === 'Brushby'), '5 a region left inside the settle says nothing',
    JSON.stringify(b));

  // --- 6. entering by MOVING: a warp into a titled region --------------------
  const me = await page.evaluate(() => ({ x: window.game.character.getX() / 120,
    y: window.game.character.getY() / 120 }));
  const target = { x: me.x + 40, y: me.y };
  await pushRegion('Farreach', 'Forty metres east', 20, target.x, target.y);
  await sleep(1500);
  b = await banner();
  check(!(b.visible && b.title === 'Farreach'), '6a nothing while you stand outside it', JSON.stringify(b));
  await cmd(`WARP ${Math.round(target.x * 120)} ${Math.round(target.y * 120)}`);
  let shown = null;
  for (let i = 0; i < 12 && !shown; i++) {
    await sleep(400);
    const s = await banner();
    if (s.visible && s.title === 'Farreach') shown = s;
  }
  const at = await page.evaluate(() => ({ x: window.game.character.getX() / 120,
    y: window.game.character.getY() / 120 }));
  if (!shown && Math.hypot(at.x - target.x, at.y - target.y) > 18) {
    report('INCONCLUSIVE', '6b a warp into it announces it',
      `the warp landed at (${at.x.toFixed(1)}, ${at.y.toFixed(1)}), outside the region`);
  } else {
    check(!!shown, '6b a warp into it announces it', JSON.stringify(shown || await banner()));
  }

  check(consoleErrors.length === 0, `${consoleErrors.length} console errors`,
    consoleErrors.slice(0, 3).join(' | '));
} catch (e) {
  check(false, 'run completed', e.message);
} finally {
  await browser.close();
  const fails = results.filter(r => r.state === 'FAIL').length;
  const inc = results.filter(r => r.state === 'INCONCLUSIVE').length;
  console.log(`\n${label}: ${results.length - fails - inc} pass / ${fails} fail / ${inc} inconclusive`);
  process.exit(fails ? 1 : 0);
}
