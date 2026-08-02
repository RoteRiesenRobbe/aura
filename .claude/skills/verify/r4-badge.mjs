#!/usr/bin/env node
// plan-entity-model.md R4 — in-game smoke for the two interact-badge defects
// the 2026-07-28 code review found.
//
//   1. ANCHOR. The cap's vertical offset was measured once, from `Mob.shape` —
//      the whole group, which also carries the aura ring stack, the dwell ring,
//      the tick indicator and the health bar. Correct today only by accident:
//      all 14 conversants author `"skills": []`, so the ring never exists.
//      R4 measures the art (`actualShape`) instead.
//   2. CORPSE. `EntityManager.newSnapshot` hands a removed mob to
//      `fadeOutAndHide` and drops it from `objects` BEFORE Backend retargets the
//      badge (Backend.ts:294 then :373), so `setInteractable(false)` can never
//      land and the cap rides the fading sprite for the whole 1.5 s fade.
//
// ⚑ Neither defect is reachable with shipped content — that is what "latent"
// means here — so this script is run TWICE against the same build. The `aura`
// leg needs a THROWAWAY edit to `api/mobs/hermit.json`, reverted afterwards
// (boot with `-content ../api`, no rebuild):
//
//     "role": "structure",                                 // aura-always-on:
//     "skills": [{"skillName": "TotemAura", "level": 1}]   // no aggro needed
//
//     node r4-badge.mjs aura       # hermit.json carrying the throwaway aura
//     node r4-badge.mjs vanilla    # hermit.json as shipped
//
// ⚑ The Hermit, not the Farmer: `role: structure` is what makes the ring exist
// without the mob ever aggroing (mob.go:217 activates slot 0 at spawn for
// structures; a creature only activates its aura in modeEngage/modeSupport,
// and a townsfolk NPC never engages a player).
//
// The claim is that the two runs report the SAME badgeY. Each run also
// recomputes, from its own frame, what the pre-R4 code would have produced off
// the same containers — that is the discriminating control, so a passing run
// cannot be passing vacuously.
//
// Usage: node .claude/skills/verify/r4-badge.mjs [label] [url]
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { botName } from './botname.mjs';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');

const label = process.argv[2] || 'run';
const url = process.argv[3] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

// WARP takes 1/120 units and wants whole units.
const w = (x, y) => `${Math.round(x) * 120} ${Math.round(y) * 120}`;
// ⚑ Stand next to the HERMIT (-54.9, 25.6), the actor the throwaway aura is
// authored on. Run 1 of this script warped to (-57, 26) intending the Farmer
// and the server offered the Hermit instead — 0.6 units away vs the Farmer's
// 2.6, i.e. the only one inside the 2.0 talk range. The geometry came back
// clean and meant NOTHING, because the badged actor had no aura. Assert the
// precondition, never assume the intended actor was the one reached.
const NEAR_HERMIT = w(-55, 25);  // 0.6 units off the Hermit — badge lights without walking
const FAR_AWAY = w(-23, 14);     // the most open tile in the zone, ~37 units off

// The badge's own layout constants (InteractBadge.ts), needed to reconstruct
// what the pre-R4 anchor would have been from the same frame.
const GAP_ABOVE_SPRITE = 10;

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();

const consoleErrors = [];
const webglLosses = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
  if (/webgl.*context lost/i.test(m.text())) webglLosses.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await page.waitForSelector('#startForm .playerNameSubmit:not([disabled])', { timeout: 120_000 });
await page.fill('#startForm .playerNameInput', botName('badge'));
await page.click('#startForm .playerNameSubmit');
await page.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });

const submit = (t) => page.evaluate((text) => {
  const input = document.getElementById('console_command');
  input.value = text;
  document.getElementById('console').dispatchEvent(new Event('submit', { cancelable: true }));
}, t);
const cmd = async (t) => { await submit(t); await page.waitForTimeout(600); };

const primeRoot = () => page.evaluate(() => {
  if (!window.__auraRoot) {
    let r = window.game.character.plate.parent;
    while (r.parent) r = r.parent;
    window.__auraRoot = r;
  }
  document.getElementById('developPanel').style.display = 'none';
  return true;
});

// Effectively-visible interact badges: a Text reading exactly "E" whose whole
// ancestor chain is visible (the badge hides by flipping its own container).
const badgeCount = () => page.evaluate(() => {
  let n = 0;
  const walk = (c) => {
    if (c?.visible === false) return;
    if (typeof c?.text === 'string' && c.text.trim() === 'E') n++;
    (c?.children || []).forEach(walk);
  };
  walk(window.__auraRoot);
  return n;
});

// Everything the anchor question needs, read off the live scene graph: the cap
// container, the shape group it hangs in, and the shape group's bounds — which
// is exactly what the pre-R4 code measured.
const badgeGeometry = () => page.evaluate((gap) => {
  let text = null;
  const walk = (c) => {
    if (text || c?.visible === false) return;
    if (typeof c?.text === 'string' && c.text.trim() === 'E') { text = c; return; }
    (c?.children || []).forEach(walk);
  };
  walk(window.__auraRoot);
  if (text === null) return null;

  const badge = text.parent;
  const shape = badge.parent;
  const shapeBounds = shape.getLocalBounds();
  const capHeight = badge.getLocalBounds().height;

  // What InteractBadge.build() measured BEFORE R4: the shape group — but as it
  // stood at build time, i.e. WITHOUT the cap itself, which build() adds only
  // after computing the offset. Including it would overstate the old code by
  // the badge's own height and turn a no-op into a fake delta.
  let groupTop = 0;
  for (const c of shape.children) {
    if (c === badge) continue;
    groupTop = Math.min(groupTop, (c.y || 0) + c.getLocalBounds().y);
  }
  return {
    badgeY: +badge.y.toFixed(1),
    capHeight: +capHeight.toFixed(1),
    shapeTop: +shapeBounds.y.toFixed(1),
    shapeHeight: +shapeBounds.height.toFixed(1),
    groupTopAtBuild: +groupTop.toFixed(1),
    preR4BadgeY: +(-(Math.max(0, -groupTop) + capHeight / 2 + gap)).toFixed(1),
    // Every overlay hung on the group, with the top edge each one contributes —
    // this is what says WHICH child was inflating the old measurement.
    children: shape.children.map((c) => {
      let top = null;
      try { top = +c.getLocalBounds().y.toFixed(1); } catch (e) { top = 'err'; }
      return `${c.constructor?.name || '?'}${c.label ? '(' + c.label + ')' : ''}` +
        `@y${+(c.y ?? 0).toFixed(1)} top${top} vis${c.visible ? 1 : 0}`;
    }),
  };
}, GAP_ABOVE_SPRITE);



const walkUntilBadge = async (key, want, maxSeconds = 14) => {
  await page.evaluate(() => document.activeElement?.blur());
  for (let elapsed = 0; elapsed < maxSeconds; elapsed += 0.5) {
    if ((await badgeCount() > 0) === want) return true;
    await page.keyboard.down(key);
    await page.waitForTimeout(500);
    await page.keyboard.up(key);
  }
  return (await badgeCount() > 0) === want;
};

const results = [];
const check = (name, pass, detail) => results.push({ check: name, pass, detail });

await cmd('PING'); // the first command after joining is dropped (harness note)
await cmd('GOD');
await primeRoot();

// --- 1. the anchor ---
const withAura = label === 'aura';
await cmd(`WARP ${NEAR_HERMIT}`);
await page.waitForTimeout(20_000); // camera + position settle across the warp (§20)
await walkUntilBadge('s', true);   // usually a no-op: the warp lands inside talk range
await page.waitForTimeout(1200);

const geo = await badgeGeometry();
await page.screenshot({ path: `/tmp/r4-${label}-1-badge.png` });

check('The E badge is lit over the Hermit', geo !== null, JSON.stringify(geo));
if (geo !== null) {
  // The precondition, asserted rather than assumed (run 1's lesson): in the
  // `aura` run the badged actor must really carry a ring, which is what pushes
  // the group's top far above its art (~-42 px for these NPC sprites).
  check(withAura
      ? 'PRECONDITION: the badged actor really carries an aura ring'
      : 'PRECONDITION: the badged actor carries no aura (shipped content)',
    withAura ? geo.groupTopAtBuild < -100 : geo.groupTopAtBuild > -100,
    `group top at build time ${geo.groupTopAtBuild}; children ${JSON.stringify(geo.children)}`);

  // The claim itself. With an aura the old measurement would have parked the
  // cap a whole ring radius above the head; without one it was already right,
  // which is exactly why the defect was latent.
  const delta = Math.abs(geo.preR4BadgeY - geo.badgeY);
  check(withAura
      ? 'The cap is anchored to the ART — pre-R4 would have parked it above the ring'
      : 'On shipped content the fix is a no-op — same anchor as pre-R4',
    withAura ? delta > 50 : delta <= 2,
    `badgeY ${geo.badgeY}, pre-R4 would be ${geo.preR4BadgeY} (delta ${delta.toFixed(1)} px), ` +
    `group bounds top ${geo.shapeTop} h ${geo.shapeHeight}`);
}

// --- 2. the corpse ---
// Warp far enough that the Farmer leaves the viewport and is removed from the
// snapshot. Sample fast: the fade is 1.5 s and the badge would ride all of it.
//
// ⚑ Count badges only from the sample where the player has actually LEFT. The
// first sample or two still show the live, legitimately-badged Hermit, and
// scoring those reads exactly like the defect — it failed both earlier runs of
// this script for two different reasons. The latch must be the PLAYER'S
// POSITION: "a corpse is fading somewhere" is not the same event, because mobs
// drop out of the viewport all the time and sample 0 already showed two.
await submit(`WARP ${FAR_AWAY}`);
let maxBadges = 0;
let sawCorpse = 0;
let left = false;
const samples = [];
//
// ⚑ ONE evaluate per sample, not three. Reading badge, corpses and position as
// separate round trips let the warp land BETWEEN them: sample 0 then reported
// the old frame's badge against the new frame's position, and the latch scored
// a legitimately-lit badge as a defect (run 3, 2026-07-29).
for (let i = 0; i < 22; i++) {
  const s = await page.evaluate(() => {
    let badges = 0, corpses = 0;
    const walk = (c) => {
      if (c?.visible === false) return;
      if (typeof c?.text === 'string' && c.text.trim() === 'E') badges++;
      if (typeof c?.alpha === 'number' && c.alpha > 0 && c.alpha < 1 && (c.children || []).length > 0) corpses++;
      (c?.children || []).forEach(walk);
    };
    walk(window.__auraRoot);
    return {badges, corpses, x: window.game.character.getX() / 120, y: window.game.character.getY() / 120};
  });
  if (Math.hypot(s.x + 23, s.y - 14) < 2) left = true; // arrived at FAR_AWAY
  if (left) maxBadges = Math.max(maxBadges, s.badges);
  sawCorpse = Math.max(sawCorpse, s.corpses);
  samples.push(`${s.badges}/${s.corpses}${left ? '*' : ''}`);
  await page.waitForTimeout(120);
}
await page.screenshot({ path: `/tmp/r4-${label}-2-after-warp.png` });

check('CONTROL: a fading corpse really was on screen while we sampled',
  sawCorpse > 0,
  `max fading containers ${sawCorpse}; badge/corpse samples ${samples.join(' ')}`);
check('No badge rides the removed actor',
  maxBadges === 0,
  `max visible "E" badges from the removal onward: ${maxBadges}; samples badge/corpse ${samples.join(" ")}`);

check('No console errors', consoleErrors.length === 0, JSON.stringify(consoleErrors.slice(0, 5)));
check('No WebGL context loss', webglLosses.length === 0, JSON.stringify(webglLosses));

console.log(`\n=== R4 badge smoke [${label}] ===`);
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.check}\n        ${r.detail}`);
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
console.log(`GEOMETRY ${label}: ${JSON.stringify(geo)}`);

await browser.close();
process.exit(failed === 0 ? 0 : 1);
