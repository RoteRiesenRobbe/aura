#!/usr/bin/env node
// ⭐ THE DIAGONAL FACE — the case the PO's 2026-09-10 pass broke on, and the one
// D2's rotated boundary stroke exists for (plan-zone-polygons.md P3).
//
// Two things only a live physics loop can show:
//   1. ⭐ NOTHING POKES OUT. Walk into a 45° face and measure the PERPENDICULAR
//      distance from where you stop to the face itself. It must be about the
//      player radius. Under the shipped-then-fixed defect the interior fill was
//      sampled at cell CENTRES, so axis-aligned cells stuck out past the art and
//      you stopped a metre early against an invisible staircase.
// ⛔ WHAT THIS LEG IS AND IS NOT. The exact "nothing pokes out" bound belongs to
// TestNothingPokesOutOfASlantedFace, which measures the emitted geometry
// directly — sampling a SLIDING player is far too noisy to gate on, and read
// 0.74 u against a build Go measures at 0.06. Its power to discriminate the
// centre-sampling defect also depends entirely on the fixture: a deliberately
// broken build still passed it on the first probe, because that probe's 45° edges
// on whole units happened to line up with the sample grid. Treat this as a smoke
// check that a diagonal wall behaves like a wall; the Go tests are the gate.
//
//   2. ⭐ YOU SLIDE. Pushing into a rotated box leaves the along-face component
//      of your motion intact; pushing into a staircase of axis-aligned ones gets
//      you alternating X and Y shoves — measured here as REVERSALS along the
//      face, which is the zigzag as a number rather than as a feeling.
//
// ⚑ Probe: a diamond at (-23, 14), radius 8, every edge at exactly 45°. Install
// it into api/zones/world.json and RESTART THE SERVER
// ([[project-zone-edit-half-live]]), then:
//
//   node .claude/skills/verify/p3-diagonal-slide.mjs [url]
import { createRequire } from 'node:module';
import { join } from 'node:path';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');
import { joinAsNewCharacter } from './lib/join.mjs';

const url = process.argv[2] || 'http://localhost:2001/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

// The probe quad's EAST face. ⛔ NOT a 45° edge on whole units, which is what
// this started as and why the first run proved nothing: a 45° edge on even
// coordinates passes exactly through the sample grid's corners, so every cell is
// wholly in or wholly out and the centre-vs-corner defect CANNOT manifest.
// (Measured: the shipped defect passed this leg on a diamond.) Same accident
// that made the Go under-cover test pass against a square — the lesson is that a
// diagonal fixture has to be AWKWARD, not merely diagonal.
const A = { x: -23.1, y: 8.4 }, B = { x: -20.3, y: 18.7 };
const LEN = Math.hypot(B.x - A.x, B.y - A.y);
const U = { x: (B.x - A.x) / LEN, y: (B.y - A.y) / LEN };   // along the face
const N = { x: U.y, y: -U.x };                               // outward normal
const PLAYER_R = 0.25;
// Start OUTSIDE the face, level with its middle, a few units clear.
const MID = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
const START = { x: Math.round(MID.x + N.x * 5), y: Math.round(MID.y + N.y * 5) };
const HOLD_SECS = 6;

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await joinAsNewCharacter(page, 'diag');
await page.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
await page.evaluate(() => { const p = document.getElementById('developPanel'); if (p) p.style.display = 'none'; });

const cmd = async (text) => {
  await page.evaluate((t) => {
    const i = document.getElementById('console_command');
    i.value = t;
    document.getElementById('console').dispatchEvent(new Event('submit', { cancelable: true }));
  }, text);
  await page.waitForTimeout(700);
};
const pos = () => page.evaluate(() => ({
  x: window.game.character.getX() / 120, y: window.game.character.getY() / 120,
}));
// Signed distance from the face line: positive is OUTSIDE the diamond.
const offFace = (p) => (p.x - A.x) * N.x + (p.y - A.y) * N.y;
// How far along the face, from A.
const alongFace = (p) => (p.x - A.x) * U.x + (p.y - A.y) * U.y;

const results = [];
const check = (name, pass, detail) => results.push({ name, pass, detail });

await cmd('PING');
await cmd('GOD');
await cmd(`WARP ${START.x * 120} ${START.y * 120}`);
await page.waitForTimeout(24_000);

const landed = await pos();
if (offFace(landed) < 0.5) {
  console.log(`INCONCLUSIVE: the warp did not land outside the face (off-face ${offFace(landed).toFixed(2)})`);
  await browser.close();
  process.exit(1);
}

// Hold WEST, straight into the north-east face, sampling as we go.
await page.evaluate(() => document.activeElement?.blur());
await page.keyboard.down('a');
const samples = [];
for (let i = 0; i < HOLD_SECS * 4; i++) {
  await page.waitForTimeout(250);
  samples.push(await pos());
}
await page.keyboard.up('a');
await page.waitForTimeout(500);
await pos();   // settle

// ⚑ Every measurement below is taken WITHIN THE FACE'S SPAN, never at the end of
// the hold. Sliding carries the player past the vertex and out into open ground,
// where the face's infinite line says nothing at all — an end-state reading there
// went NEGATIVE and passed a "did not poke out" assertion for free. Measured, and
// the reason this comment exists.
const onFace = samples.filter((s) => {
  const a = alongFace(s);
  return a >= 0 && a <= LEN;
});

// --- 1. how close to the face could we actually get? --------------------
// The face is drawn at off-face 0; a body of radius 0.25 resting against it sits
// at 0.25. If collision pokes OUT of the art the player is stopped early and
// never gets that close; if it pokes IN, this goes negative.
// ⛔ The statistic is the WORST hold-off once contact begins, NOT the closest
// approach. A staircase has teeth AND valleys, and the player slides into a
// valley and touches the true outline there — so a min() reads 0.25 and passes
// against a wall that is holding you a metre out three steps later. Measured:
// min() scored the shipped defect as clean.
const first = onFace.findIndex(s => offFace(s) < PLAYER_R + 0.6);
const held = first < 0 ? [] : onFace.slice(first).filter(s => offFace(s) < PLAYER_R + 3);
const closest = held.length > 0 ? Math.max(...held.map(offFace)) : Infinity;
// ⚑ A LOOSE sanity bound, not the real one. The player is SLIDING while this
// samples, so a reading taken mid-push sits further out than the surface does —
// measured 0.74 here against a build whose true worst overshoot Go puts at 0.06.
// ⭐ The exact bound belongs to TestNothingPokesOutOfASlantedFace, which measures
// the emitted geometry directly and asserts < 0.1 u. What this leg is really for
// is the SLIDE below, which no Go test can show.
check('⭐ nothing pokes out of the slanted face (loose sanity bound)',
  closest <= PLAYER_R + 1.0 && closest >= -0.3,
  `worst hold-off ${closest.toFixed(2)} u from the face over ${held.length} in-contact samples `
  + `(a body resting on it sits at ${PLAYER_R}; the exact bound is Go's: TestNothingPokesOutOfASlantedFace)`);

// --- 2. did we SLIDE along it, or staircase? ----------------------------
// Only samples in contact AND still alongside the face count: before contact the
// player is crossing open ground, and past the vertex there is no wall at all.
const contact = onFace.filter(s => offFace(s) < PLAYER_R + 0.6 && offFace(s) > -0.3);
const slid = contact.length >= 2
  ? Math.abs(alongFace(contact[contact.length - 1]) - alongFace(contact[0]))
  : 0;
let reversals = 0;
for (let i = 2; i < contact.length; i++) {
  const d1 = alongFace(contact[i - 1]) - alongFace(contact[i - 2]);
  const d2 = alongFace(contact[i]) - alongFace(contact[i - 1]);
  if (Math.abs(d1) > 0.02 && Math.abs(d2) > 0.02 && (d1 > 0) !== (d2 > 0)) { reversals++; }
}
// ⭐ A DERIVED FLOOR, never a hardcoded distance. Pushing WEST at the walking
// pace of 1.5 u/s puts |west · U| of that along the face, so over the contact
// window a wall that merely fails to snag you yields at least that much travel.
// The first cut hardcoded 2.5 u and went red at 2.45 on a healthy wall — a
// knife-edge against a number nobody had derived.
//
// ⚑ The measurement routinely EXCEEDS this reference, and that is expected
// rather than suspicious: resolveSolidAABB pushes the body out along the face
// normal instead of projecting its velocity, so the along-face travel is not
// capped by the tangential component. This is a floor, not a ceiling.
const WALK = 1.5;                       // WalkingSpeedPerTick 0.05 × 30 ticks
const reference = WALK * Math.abs(U.x) * (contact.length * 0.25);
check('⭐ pushing into the face SLIDES along it',
  slid > reference * 0.6,
  `${slid.toFixed(2)} u along the face over ${contact.length} in-contact samples `
  + `(a wall that does not snag yields at least ~${reference.toFixed(2)} u on this slope)`);
check('⭐ and slides smoothly — no staircase',
  reversals <= 2,
  `${reversals} direction reversal(s) along the face (a staircase alternates X and Y)`);

await page.screenshot({ path: '.claude/skills/verify/p3-diagonal.png' });

console.log('\n=== P3 diagonal face ===');
results.forEach((r) => console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}\n      ${r.detail}`));
console.log(`\n${results.filter((r) => r.pass).length}/${results.length} passed`);
console.log(`console errors: ${consoleErrors.length}`);
console.log('screenshot: .claude/skills/verify/p3-diagonal.png');
await browser.close();
process.exit(results.some((r) => !r.pass) ? 1 : 0);
