#!/usr/bin/env node
// plan-appearance.md C6: a player's corpse is a medallion wearing the dead
// player's look, greyed, with the red skull at 6 o'clock
// (plan-entity-presentation.md D9, R2), read off the live scene graph.
//
// Two clients at the starting fire (fresh characters spawn together, no warp):
//   DIER wears a non-default look (LOOK green-hood + ring-forest), then DAMAGE
//   100 kills it; WATCHER stands beside it, GOD on.
// Legs:
//   1. the watcher sees a corpse token: token slots in order, a ring the
//      player's size (D44), the worn ring family's texture (not the grey
//      default), ring and disc tinted grey, the portrait's grey filter on
//      actualShape only (L1), exactly one indicator, `dead`, at 180° on the
//      circle outside the ring, drawn as a glyph sprite (the placeholder skull,
//      no pack on a clone) rather than the disc fallback;
//   2. the dier sees its own corpse the same way;
//   3. the dier reloads while dead (the reconnect door, state.go): the watcher
//      sees a NEW corpse with the same look. INCONCLUSIVE if the reload does
//      not come back dead (no reconnect stash).
// Plus 0 console errors on both pages. Screenshots: corpse-watcher.png.
//
// The geometry is restated from TokenState.ts so a retune is loud.
// Report-style, PASS / FAIL / INCONCLUSIVE per leg.
//
// Usage: node .claude/skills/verify/corpse-medallion.mjs [label] [url]
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { joinAsNewCharacter } from './lib/join.mjs';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');

const label = process.argv[2] || 'run';
const url = process.argv[3] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const shotDir = process.env.CORPSE_SHOT_DIR || dirname(fileURLToPath(import.meta.url));
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

// TokenState.ts / Medallions.ts [PLACEHOLDER]s, restated.
const GAP = 3;
const diameterOf = (size) => Math.max(6, Math.min(12, (size + GAP) * Math.PI / 8 * 0.85));
const radiusOf = (size) => size + GAP + diameterOf(size) / 2;
const GREY_RING = 0x8a8a8a;
const GREY_DISC = 0x4a4a4a;
const PLAYER_SIZE = 30; // meter2px(0.25)

let pass = 0, fail = 0, inconclusive = 0;
const report = [];
const check = (name, ok, detail) => {
  if (ok === null) { inconclusive++; report.push(`INCONCLUSIVE ${name}: ${detail}`); return; }
  if (ok) pass++; else fail++;
  report.push(`${ok ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
};

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const errors = [];
const open = async (tag) => {
  const page = await (await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 800 } })).newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${tag}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`${tag} pageerror: ${e.message}`));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await joinAsNewCharacter(page, tag);
  await page.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
  await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
  await page.evaluate(() => { const p = document.getElementById('developPanel'); if (p) p.style.display = 'none'; });
  return page;
};
const cmd = async (page, text, wait = 700) => {
  await page.evaluate((t) => {
    const input = document.getElementById('console_command');
    input.value = t;
    document.getElementById('console').dispatchEvent(new Event('submit', { cancelable: true }));
  }, text);
  if (wait) await page.waitForTimeout(wait);
};
const waitFor = async (page, pred, ms, step = 300) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const v = await pred();
    if (v) return v;
    await page.waitForTimeout(step);
  }
  return null;
};

// Every corpse in view, read atomically. A Corpse is the only medallion token
// with a refresh subscription and no plate (property names survive the prod
// build; class names do not).
const readCorpses = (page) => page.evaluate(() => {
  const all = window.game.objectsInView().filter((o) => o && o.medallion && 'refreshSubToken' in o && o.shape?.parent);
  return all.map((o) => {
    const token = o.shape.children.find((c) => c.label === 'token');
    const frame = token?.children.find((c) => c.label === 'frame');
    const actualShape = token?.children.find((c) => c.label === 'actualShape');
    const discSlot = token?.children.find((c) => c.label === 'disc');
    const ring = frame?.children?.[0];
    const box = o.shape.getChildByLabel('stateIndicators', true);
    const filters = Array.isArray(actualShape?.filters) ? actualShape.filters : [];
    return {
      id: o.id,
      order: token?.children.map((c) => c.label).join(',') ?? null,
      size: ring ? ring.width / 2 : null,
      ringTint: ring?.tint ?? null,
      ringTexUid: ring?.texture?.uid ?? null,
      discTint: discSlot?.children?.[0]?.tint ?? null,
      greyFilters: filters.filter((f) => f.enabled).length,
      tokenFilters: Array.isArray(token?.filters) ? token.filters.length : 0,
      look: [o.medallion.portraitWire, o.medallion.ringWire],
      ringDrawn: o.medallion.ringDrawn,
      indicators: (box?.children ?? []).map((c) => ({
        label: c.label,
        angle: ((Math.atan2(c.x, -c.y) * 180 / Math.PI) + 360) % 360,
        r: Math.hypot(c.x, c.y),
        sprite: !!c.texture,
      })),
      visible: !!box?.visible,
    };
  });
});

const judge = (leg, c, wantLook) => {
  if (!c) { check(leg, false, 'no corpse in view'); return; }
  const problems = [];
  if (c.order !== 'disc,actualShape,frame,indicators') problems.push(`slots ${c.order}`);
  if (c.size === null || Math.abs(c.size - PLAYER_SIZE) > 0.5) problems.push(`ring ${c.size} px (want ${PLAYER_SIZE}, D44)`);
  if (wantLook && (c.look[0] !== wantLook[0] || c.look[1] !== wantLook[1])) problems.push(`look ${c.look} (want ${wantLook})`);
  if (c.ringDrawn !== 'forest') problems.push(`ring family ${c.ringDrawn} (want forest)`);
  if (c.ringTint !== GREY_RING) problems.push(`ring tint ${c.ringTint?.toString(16)}`);
  if (c.discTint !== GREY_DISC) problems.push(`disc tint ${c.discTint?.toString(16)}`);
  if (c.greyFilters !== 1) problems.push(`${c.greyFilters} live portrait filters`);
  if (c.tokenFilters !== 0) problems.push(`filter on the token (L1)`);
  const dead = c.indicators.find((i) => i.label === 'dead');
  if (c.indicators.length !== 1 || !dead) problems.push(`indicators ${c.indicators.map((i) => i.label).join(',') || 'none'}`);
  else {
    if (Math.abs(dead.angle - 180) > 0.5) problems.push(`dead at ${dead.angle.toFixed(1)}°`);
    if (Math.abs(dead.r - radiusOf(c.size)) > 0.5) problems.push(`dead r ${dead.r.toFixed(1)} (want ${radiusOf(c.size).toFixed(1)})`);
    if (!dead.sprite) problems.push('skull drew as the disc fallback');
  }
  check(leg, problems.length === 0, problems.length ? problems.join('; ') : `look ${c.look}, ring forest ${c.size} px, grey, skull sprite at 180° r ${dead.r.toFixed(1)}`);
};

const watcher = await open('corpsewatch');
await cmd(watcher, 'GOD on');
const dier = await open('corpsedie');
await cmd(dier, 'GOD off');
await cmd(dier, 'LOOK green-hood');
await cmd(dier, 'LOOK ring-forest');
// Read the worn look only once the wire carries both picks: a read right
// after the cheat can still see the starter ring (a false "want" value).
const worn = await waitFor(dier, () => dier.evaluate(() => {
  const m = window.game.character.medallion;
  return m.ringDrawn === 'forest' && m.portraitWire !== 0 ? [m.portraitWire, m.ringWire] : null;
}), 15_000);
if (!worn) throw new Error('the dier never wore the forest ring: LOOK did not land');
console.log(`dier wears ${worn}`);
// Let the watcher see the dier alive first, so the corpse spawns in view.
await watcher.waitForTimeout(3000);
const before = new Set((await readCorpses(watcher)).map((c) => c.id));

await cmd(dier, 'DAMAGE 100', 0);
const fresh = await waitFor(watcher, async () => (await readCorpses(watcher)).find((c) => !before.has(c.id) && c.ringDrawn === 'forest' && c.indicators.length), 20_000);
const corpse = fresh || (await readCorpses(watcher)).find((c) => !before.has(c.id));
judge('1 watcher sees the corpse medallion', corpse, worn);
await watcher.screenshot({ path: join(shotDir, 'corpse-watcher.png') });

const own = await waitFor(dier, async () => (await readCorpses(dier)).find((c) => c.id === corpse?.id && c.ringDrawn === 'forest'), 15_000);
judge('2 dier sees its own corpse', own || (await readCorpses(dier)).find((c) => c.id === corpse?.id), worn);

// 3. reload while dead: the reconnect door rebuilds the corpse.
// The reload resumes the session on its own and lands on the death overlay;
// no character screen is shown, so the join helper is not called.
await dier.reload({ waitUntil: 'domcontentloaded' });
const gone = await waitFor(watcher, async () => !(await readCorpses(watcher)).some((c) => c.id === corpse?.id), 15_000);
const rebuilt = await waitFor(watcher, async () => (await readCorpses(watcher)).find((c) => c.id !== corpse?.id && !before.has(c.id) && c.ringDrawn === 'forest' && c.indicators.length), 30_000);
if (!rebuilt) {
  check('3 reload while dead rebuilds the corpse', null, `old corpse gone ${!!gone}, no new corpse: the reload may not have come back dead`);
} else {
  judge('3 reload while dead rebuilds the corpse', rebuilt, worn);
}

check('0 console errors', errors.length === 0, errors.length ? errors.slice(0, 5).join(' | ') : 'none');

console.log(`\n[corpse-medallion ${label}] ${pass} pass / ${fail} fail / ${inconclusive} inconclusive`);
for (const line of report) console.log('  ' + line);
await browser.close();
process.exit(fail ? 1 : 0);
