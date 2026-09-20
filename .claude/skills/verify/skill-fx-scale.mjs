#!/usr/bin/env node
// Skill VFX C4, world scale (docs/plan-skill-vfx.md §12e): what the SkillFx
// layer COSTS when the world is ten times as busy, with the density slider at
// each level, and what that says about the 96-Fx cap.
//
// ⚑ This is a MEASUREMENT script, not a smoke test. Almost nothing here is
// pass/fail: the deliverable is the table it prints (and the JSON beside it).
// The only hard guard is §12e.5's last line - `full` at 10x must keep the
// manager's own update() p95 under a 16.7 ms frame, reported PASS / OVER.
//
// ⚑ The 10x load is a CLIENT-SIDE driver (§12e.1), never a 10x server: the
// measured server density ceiling is ~5.8x, so a real boot at 10x is
// tick-starved and would emit FEWER events per wall second than a healthy busy
// world. `window.game.skillFxStress()` feeds the manager's REAL entry points
// (onSnapshot, setAmbient) with wire-shaped events between stub actors.
//
// ⚑ HEADLESS ABSOLUTES DO NOT TRANSFER (project_mobile_layout,
// project_input_jitter). Read the ratios, the counts and the manager's own
// update() milliseconds; the rAF delta of a headless page is an environment
// number, reported only as full/off and low/off.
//
// Legs (§12e.5), each a 10 s window after a 2 s warm-up:
//   1 real 1x: a busy camp, own aura on, the REAL event rate and the REAL
//     ambient owner count. This defines 1x. Inconclusive when the venue is
//     empty - never red.
//   2 synthetic 1x vs real 1x at `full`: the driver at leg 1's rate must land
//     in the same order on updateMs p50, or the driver is not honest and the
//     RUN STOPS HERE.
//   3 10x at `off` / `low` / `full`, with screenshots at full and low.
//   4 ambient alone: 10x owners, zero events, `full`.
//   5 the cap: 10x `full` at budget 48 / 96 / 192.
//   6 phone shape: 390x844 at DPR 3, touch, its OWN page, 10x at `low` and
//     `full`, reported only against that same page's `off`.
//   7 THE CEILING (added after C4's first pass, because leg 5 was a null
//     result): ramp the driver x2 a step from 10x until BOTH the first
//     eviction and the first update p95 over the frame have been found, or the
//     driver stops reaching its requested rate; then rerun the first evicting
//     step and the one above it at budget 48 / 96 / 192, which is the
//     comparison leg 5 could not make. 2 s warm-up + 6 s window per step.
//
// ⚑ LEG 7's CAVEAT, and it decides how `live max` may be read: at ~3 fps a
// second of events arrives as ONE batch and then nothing draws for 300 ms, so
// a measured `live max` is shaped by this environment. The transferable number
// is Little's law - the event rate times the mean Fx lifetime ONE event spawns
// (`eventLifetimeMs`, pinned in SkillFxStress.test.ts) - and the ramp prints it
// beside the measurement as `est. live`.
// ⚑ `update p95` is the FRAME cost. Spawning and eviction happen inside
// onSnapshot, on the socket's thread of control, which is why the instrument
// times that separately and leg 7 prints a `snapshot` column: a rate high
// enough to evict would otherwise look free.
//
// ⚑ Leg 1 runs LEVELLED and with GOD OFF, and both halves are load-bearing.
// GOD short-circuits the player's own takeDamage (skill-fx.mjs legs 5+6), so a
// god-mode player is never the victim of a HIT event - and in a camp the
// mob->player stream IS most of the traffic. Measured on this venue:
// GOD on / level 1 = 1.0 events/s, GOD on / level 30 = 0.1 (the player clears
// its own melee ring), GOD OFF / level 30 = 3.7. The levelling is what buys
// the 12 s of survival that reading needs.
// ⚑ No screenshot clock trick here either (skill-fx.mjs slows performance.now
// 8x to catch a 200 ms layer): the instrument, the driver's frame delta and
// every Fx clock all read performance.now, so it would corrupt the window. At
// 10x something is always on screen.
// ⚑ AURA_FXSCALE_RAMP_ONLY=1 runs legs 1, 2 and 7 only (leg 1 defines the 1x,
// leg 2 is the honesty gate), for a ceiling re-run without legs 3-6.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { joinAsNewCharacter } from './lib/join.mjs';
import { botName } from './botname.mjs';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');

const url = process.argv[2] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const outdir = process.argv[3] || '/tmp/skill-fx-scale';
mkdirSync(outdir, { recursive: true });

const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = {
  ...process.env,
  LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':'),
};

// ⚑ The throttling flags are load-bearing (skill-fx.mjs): without them the
// headless page intermittently stops draining the websocket for seconds, which
// starves every timing leg while the product is perfectly healthy.
const browser = await chromium.launch({
  args: [
    '--no-sandbox',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
  ],
  env,
});

const errors = [];
let inconclusive = false;
const rows = [];
const fail = (msg) => { errors.push('CHECK FAILED: ' + msg); };
const pass = (msg) => { console.log('PASS: ' + msg); };
const note = (msg) => { console.log('INCONCLUSIVE: ' + msg); inconclusive = true; };

const WARMUP_MS = 2_000;
const WINDOW_MS = 10_000;
const FRAME_BUDGET_MS = 16.7;

// The venue: the western bandit camp, 13 spawns within 8 u (8 Bandits, 2
// BanditRanged, a BanditPyromancer, an OrcGrunt, a DireWolf) around BOTH of
// the world's ambient-aura species, a RallyDrummer and a BanditHealer.
// ⚑ Derived from api/zones/world.json rather than guessed (the c2-world-walk
// precedent), then chosen by MEASUREMENT over the two busier camps:
//   east camp (50, -21.5), 18 hostiles: 4.3 events/s, and the player DIES at
//     10.1 s - inside the 12 s window. A death is not merely a lost leg: the
//     client never re-points `window.game.character` at the respawned entity
//     (campfire-bind-persistence.mjs's lesson), so every later warp check
//     reads the pre-death position forever and four legs measure the wrong
//     venue. Both pilot runs lost leg 2's warp exactly that way.
//   this camp: 1.5-2.0 events/s and the player survives the whole window.
// §12e.5 says "a camp with a campfire in view"; this is the one departure, and
// the reason is the same measurement: all five campfires sit in quiet corners
// (the busiest has 4 spawns near it, two of them prey), so a fire in view
// would have bought one ambient owner at the price of the fight.
const BUSY_CAMP = { x: 26.0, y: 20.7 };
// Open field, no spawn within ~8 u: the synthetic legs must measure the driver
// and not whatever wandered into frame.
const OPEN_GROUND = { x: -23, y: 14 };

async function preparePage(context, tag, { mobile = false } = {}) {
  const page = await context.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(mobile ? url + '&mobile' : url, { waitUntil: 'domcontentloaded' });
  await joinAsNewCharacter(page, botName(tag));
  await page.waitForFunction(() => !!window.game?.character, null, { timeout: 60_000 });
  await page.evaluate(() => {
    const panel = document.getElementById('developPanel');
    if (panel) panel.style.display = 'none';
  });
  // Off the slot bar, or its tooltip sits in every screenshot.
  await page.mouse.move(mobile ? 200 : 800, 200);
  await runCommand(page, 'GOD');
  return page;
}

async function runCommand(page, command) {
  await page.waitForSelector('#console_command', { state: 'attached' });
  await page.evaluate((cmd) => {
    const input = document.querySelector('#console_command');
    input.value = cmd;
    document.querySelector('#console').dispatchEvent(new Event('submit', { cancelable: true }));
  }, command);
  await page.waitForTimeout(400);
}

// ⚑ Retried once before it is scored: a WARP issued while the console is
// busy is simply lost, and a leg measured at the wrong venue is worse than a
// leg that waited another ten seconds.
async function warpTo(page, spot, label) {
  for (let attempt = 0; attempt < 2; attempt++) {
    await runCommand(page, `WARP ${Math.round(spot.x * 120)} ${Math.round(spot.y * 120)}`);
    const ok = await page.waitForFunction(({ x, y }) => {
      const c = window.game.character;
      return Math.hypot(c.getX() / 120 - x, c.getY() / 120 - y) < 1.5;
    }, spot, { timeout: attempt === 0 ? 12_000 : 20_000 }).then(() => true).catch(() => false);
    if (ok) return true;
  }
  note(`warp did not land at ${label}`);
  return false;
}

/** The death screen, which is the only honest death signal here. */
async function died(page) {
  return page.evaluate(() => {
    const screen = document.getElementById('endScreen');
    return !!screen && !screen.classList.contains('hidden')
      && getComputedStyle(screen).display !== 'none';
  });
}

async function respawn(page) {
  await page.evaluate(() => {
    const button = document.querySelector('#endScreen .playerNameSubmit');
    if (button) button.click();
  });
  await page.waitForTimeout(4_000);
}

// Long-held hotkey (rAF-sampled, ~1.4 s), retried once - the slot bar is
// edge-triggered off a throttled clock.
async function activateAuraSlot(page, slot) {
  const key = String(slot + 1);
  for (let attempt = 0; attempt < 2; attempt++) {
    if (await page.evaluate((s) => !!document.querySelector(`.auraSlot[data-slot="${s}"].activeSlot`), slot)) {
      return true;
    }
    await page.keyboard.down(key);
    await page.waitForTimeout(1400 + attempt * 200);
    await page.keyboard.up(key);
    const ok = await page.waitForSelector(`.auraSlot[data-slot="${slot}"].activeSlot`, { timeout: 8_000 })
      .then(() => true).catch(() => false);
    if (ok) return true;
  }
  return false;
}

// The density slider through the live settings object (the on-change proxy),
// exactly as the settings panel writes it. Returns what the MANAGER ended up
// on, never what we asked for: a write it never saw is the failure to catch.
async function setDensity(page, value) {
  await page.evaluate((v) => { window.game.settings().vfx.density = v; }, value);
  await page.waitForTimeout(500);
  return page.evaluate(() => window.game.skillFx().density);
}

/**
 * One measurement window: warm up, measure for 10 s, hand back the manager's
 * own numbers plus a harness-side rAF-delta sample.
 *
 * ⚑ The rAF sampler lives in the PAGE, because a Playwright-side timer would
 * measure the CDP round trip. It is reported as a ratio only.
 */
async function measure(page, { warmupMs = WARMUP_MS, windowMs = WINDOW_MS, shot } = {}) {
  await page.waitForTimeout(warmupMs);
  const evicted0 = await page.evaluate(() => window.game.skillFx().evicted);
  await page.evaluate(() => {
    window.game.skillFxMeasure(true);
    window.__raf = [];
    let last = performance.now();
    const step = () => {
      const now = performance.now();
      window.__raf.push(now - last);
      last = now;
      window.__rafId = requestAnimationFrame(step);
    };
    window.__rafId = requestAnimationFrame(step);
  });
  await page.waitForTimeout(windowMs);
  const out = await page.evaluate(() => {
    cancelAnimationFrame(window.__rafId);
    const stats = window.game.skillFxStats();
    window.game.skillFxMeasure(false);
    const raf = window.__raf.slice().sort((a, b) => a - b);
    const at = (q) => raf.length === 0 ? 0 : raf[Math.min(raf.length - 1, Math.max(0, Math.ceil(q * raf.length) - 1))];
    return {
      stats,
      counters: window.game.skillFx(),
      stress: window.game.skillFxStress(),
      raf: { frames: raf.length, p50: at(0.5), p95: at(0.95) },
    };
  });
  out.evictedInWindow = out.counters.evicted - evicted0;
  if (shot) {
    await page.screenshot({ path: join(outdir, shot) });
  }
  return out;
}

/** Start the driver, measure, stop it. `seconds` must cover warm-up + window. */
async function stressed(page, { eventsPerSec, ambientOwners, shot, warmupMs = WARMUP_MS, windowMs = WINDOW_MS }) {
  const started = await page.evaluate(
    (opts) => window.game.skillFxStress(opts),
    { eventsPerSec, ambientOwners, seconds: (warmupMs + windowMs) / 1000 + 4 });
  if (started.ok === false) {
    note(`the stress driver refused to start: ${started.why}`);
    return null;
  }
  const out = await measure(page, { shot, warmupMs, windowMs });
  await page.evaluate(() => window.game.skillFxStress(null));
  await page.waitForTimeout(1_200);
  return out;
}

function round(n, digits = 2) {
  return Number.isFinite(n) ? +n.toFixed(digits) : 0;
}

/** One table row, from a measurement. */
function record(leg, label, out, extra = {}, windowMs = WINDOW_MS, into = rows) {
  const row = {
    leg,
    label,
    density: out.counters.density,
    budget: out.stats.budget,
    frames: out.stats.frames,
    eventsInPerSec: round(out.stats.eventsIn / (windowMs / 1000)),
    fxPerSec: round(out.stats.fxSpawned / (windowMs / 1000)),
    updateP50: round(out.stats.updateMs.p50, 3),
    updateP95: round(out.stats.updateMs.p95, 3),
    updateMax: round(out.stats.updateMs.max, 3),
    rafP50: round(out.raf.p50, 1),
    rafP95: round(out.raf.p95, 1),
    liveMax: out.stats.liveMax,
    ambientMax: out.stats.ambientMax,
    ambientOwners: out.stats.ambientOwnersMax,
    displayObjects: out.stats.displayObjects,
    snapP50: round(out.stats.snapshotMs.p50, 3),
    snapP95: round(out.stats.snapshotMs.p95, 3),
    evictedPerSec: round(out.evictedInWindow / (windowMs / 1000)),
    ...extra,
  };
  into.push(row);
  console.log('  ' + JSON.stringify(row));
  return row;
}

// --- the desktop page -------------------------------------------------------

const desktopContext = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const desktopPage = await preparePage(desktopContext, 'fxscale');
console.log('joined (desktop 1600x900)');

// === LEG 1 - real 1x ========================================================
console.log('\n== LEG 1: the real rate at a busy camp (1x) ==');
let baseline = null;
await runCommand(desktopPage, 'XP 100000000');
await desktopPage.waitForTimeout(3_000);
if (await warpTo(desktopPage, BUSY_CAMP, 'the eastern bandit camp')) {
  await setDensity(desktopPage, 'full');
  if (!(await activateAuraSlot(desktopPage, 0))) {
    note('leg 1: the starting aura never switched on');
  } else {
    // GOD off for this window only: see the header. Everything after leg 1 is
    // synthetic on open ground, where GOD is free survival.
    await runCommand(desktopPage, 'GOD off');
    const out = await measure(desktopPage, { shot: 'leg1-real-1x.png' });
    await runCommand(desktopPage, 'GOD');
    const row = record(1, 'real 1x, busy camp, full', out);
    // ⚑ Death is read off #endScreen, never off the character's position: the
    // client does not re-point `window.game.character` at the respawned
    // entity, so a dead player's coordinates never move again and a
    // position-based check reports a corpse as perfectly healthy.
    if (await died(desktopPage)) {
      note('leg 1: the player died inside the window - the rate is a fight plus a corpse, not a camp rate');
      await respawn(desktopPage);
    }
    if (row.eventsInPerSec < 1) {
      note(`leg 1: only ${row.eventsInPerSec} events/s at the camp - starved venue, 1x is not defined`);
    } else {
      baseline = row;
      pass(`leg 1: 1x is ${row.eventsInPerSec} events/s, ${row.ambientOwners} ambient owner(s), live max ${row.liveMax}`);
    }
  }
}

// === LEG 2 - the driver's honesty ===========================================
// ⚑ If this fails the run STOPS (§12e.5): every later number is scaled from a
// driver that does not resemble the thing it is standing in for.
console.log('\n== LEG 2: synthetic 1x against real 1x (full) ==');
// ⚑ The ONLY thing that stops the run: an unrelated page console error must
// not silently skip four legs.
let driverHonest = false;
if (baseline !== null) {
  await warpTo(desktopPage, OPEN_GROUND, 'open ground');
  await setDensity(desktopPage, 'full');
  const out = await stressed(desktopPage, {
    eventsPerSec: baseline.eventsInPerSec,
    ambientOwners: Math.max(1, Math.round(baseline.ambientOwners)),
  });
  if (out !== null) {
    const row = record(2, 'synthetic 1x, open ground, full', out,
      { requestedPerSec: baseline.eventsInPerSec, deliveredPerSec: out.stress.deliveredPerSec });
    const real = baseline.updateP50, synth = row.updateP50;
    // ⚑ Chromium coarsens performance.now to ~0.1 ms, so two sub-floor p50s
    // are the same measurement and their RATIO is pure noise.
    const floor = 0.2;
    const ok = (real <= floor && synth <= floor)
      || (real > 0 && synth / real >= 0.1 && synth / real <= 10);
    if (ok) {
      driverHonest = true;
      pass(`leg 2: synthetic p50 ${synth} ms against real ${real} ms - same order, the driver is honest`);
    } else {
      fail(`leg 2: synthetic p50 ${synth} ms vs real ${real} ms is not the same order - the driver is NOT honest, stopping`);
    }
    const delivered = row.deliveredPerSec;
    if (Math.abs(delivered - baseline.eventsInPerSec) > 0.15 * baseline.eventsInPerSec + 1) {
      note(`leg 2: the driver delivered ${delivered}/s for a requested ${baseline.eventsInPerSec}/s`);
    }
  }
} else {
  note('leg 2: skipped, leg 1 never defined a 1x');
}

const honest = driverHonest;
// ⚑ The event rate is MEASURED and multiplied (§12e.1: "10x is grounded in a
// measured 1x"). The ambient owner count is PINNED instead, and that is a
// deliberate departure: the live count is every actor in view with a running
// aura, and at a camp it swings between 0 and 6 within one window as mobs die,
// walk out of the viewport and respawn - so multiplying whatever this run
// happened to see would make two runs of the same script incomparable on the
// one column C4 exists to read. 50 is ten times the five owners a busy camp
// view holds (§12e.3's census; leg 1's own measured count is in the table
// beside it, as a finding).
const AMBIENT_OWNERS_10X = 50;
const TEN = baseline === null ? null : {
  eventsPerSec: round(baseline.eventsInPerSec * 10, 1),
  ambientOwners: AMBIENT_OWNERS_10X,
};

// === LEG 3 - 10x at three densities =========================================
// ⚑ AURA_FXSCALE_RAMP_ONLY=1 runs legs 1, 2 and 7 only, for a ceiling re-run
// without the 6 minutes legs 3-6 cost. Leg 1 defines the 1x the ramp scales
// from and leg 2 is the gate that says the driver is worth believing, so
// neither can be skipped.
const rampOnly = process.env.AURA_FXSCALE_RAMP_ONLY === '1';
console.log('\n== LEG 3: 10x at off / low / full ==');
if (rampOnly) {
  console.log('(skipped: AURA_FXSCALE_RAMP_ONLY)');
} else if (honest && TEN !== null) {
  for (const density of ['off', 'low', 'full']) {
    if ((await setDensity(desktopPage, density)) !== density) {
      note(`leg 3: the manager never saw the density write for ${density}`);
      continue;
    }
    const shot = density === 'full' ? 'leg3-10x-full.png' : density === 'low' ? 'leg3-10x-low.png' : undefined;
    const out = await stressed(desktopPage, { ...TEN, shot });
    if (out === null) continue;
    record(3, `10x ${density}`, out, { requestedPerSec: TEN.eventsPerSec, deliveredPerSec: out.stress.deliveredPerSec });
  }
} else if (honest) {
  note('leg 3: skipped, no 1x baseline');
}

// === LEG 4 - the unbudgeted ambient population, alone =======================
console.log('\n== LEG 4: 10x ambient owners, zero events, full ==');
if (!rampOnly && honest && TEN !== null) {
  await setDensity(desktopPage, 'full');
  const out = await stressed(desktopPage, { eventsPerSec: 0, ambientOwners: TEN.ambientOwners });
  if (out !== null) record(4, `ambient alone, ${TEN.ambientOwners} owners, full`, out);
}

// === LEG 5 - the cap ========================================================
console.log('\n== LEG 5: 10x full at budget 48 / 96 / 192 ==');
if (!rampOnly && honest && TEN !== null) {
  await setDensity(desktopPage, 'full');
  for (const budget of [48, 96, 192]) {
    const live = await desktopPage.evaluate((n) => window.game.skillFxBudget(n), budget);
    if (live !== budget) { note(`leg 5: the budget override did not take (${live})`); continue; }
    const out = await stressed(desktopPage, TEN);
    if (out !== null) record(5, `10x full, budget ${budget}`, out);
  }
  await desktopPage.evaluate(() => window.game.skillFxBudget(0));
}

await setDensity(desktopPage, 'full');

// === LEG 6 - the phone shape ================================================
// ⚑ Its own context AND its own join: a phone is a different viewport, a
// different DPR and a different default (mobile starts on `low`). ⚑ Detection
// is FORCED with `&mobile` - headless Chromium's hasTouch does not flip the
// `pointer: coarse` query, so an emulation-only run measures the desktop
// layout and passes every assertion about it (mobile-layout.mjs).
console.log('\n== LEG 6: phone shape, 390x844 @ DPR 3 ==');
let phonePage = null;
let phoneContext = null;
if (!rampOnly && honest && TEN !== null) {
  phoneContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
  });
  phonePage = await preparePage(phoneContext, 'fxphone', { mobile: true });
  console.log('joined (phone 390x844 @3)');
  if (await warpTo(phonePage, OPEN_GROUND, 'open ground')) {
    for (const density of ['off', 'low', 'full']) {
      if ((await setDensity(phonePage, density)) !== density) {
        note(`leg 6: the manager never saw the density write for ${density}`);
        continue;
      }
      const shot = density === 'full' ? 'leg6-phone-10x-full.png' : density === 'low' ? 'leg6-phone-10x-low.png' : undefined;
      const out = await stressed(phonePage, { ...TEN, shot });
      if (out === null) continue;
      record(6, `phone 10x ${density}`, out, { requestedPerSec: TEN.eventsPerSec, deliveredPerSec: out.stress.deliveredPerSec });
    }
    await setDensity(phonePage, 'full');
  }
  // ⚑ Closed before leg 7, and it is load-bearing: a second GL page left
  // rendering halves this one's frame rate (measured 8 frames per 6 s window
  // with it open against 17-19 with it closed), and every `live max` in the
  // ramp is read per FRAME. A ramp measured beside an open phone measures the
  // harness.
  await phoneContext.close();
  phonePage = null;
  await desktopPage.waitForTimeout(2_000);
}


// === LEG 7 - the ceiling ====================================================
// ⚑ Why this leg exists: leg 5 is a NULL RESULT. At 10x of the measured world
// the layer holds 6-8 Fx alive against a cap of 96 and evicts nothing, so
// 48 / 96 / 192 produce the same table three times. A cap can only be judged
// where it BINDS, so the driver is ramped until it binds.
//
// ⚑ THE HEADLESS CAVEAT, and it governs how `live max` is read: the page runs
// at ~3 fps, so a second's events arrive as ONE batch and then nothing draws
// for 300 ms. That makes a measured `live max` an environment-shaped number.
// The transferable one is Little's law - rate x the mean Fx lifetime one event
// spawns - printed beside it as `est. live` and pinned in
// SkillFxStress.test.ts. Where the two disagree, believe the estimate for
// sizing and the measurement for "did this machine evict".
const RAMP_WARMUP_MS = 2_000;
const RAMP_WINDOW_MS = 6_000;
/** A sane stop: past this the driver is measuring its own batching. */
const RAMP_MAX_EVENTS_PER_SEC = 2_000;
/** Below this share of the requested rate the DRIVER is the ceiling, not the layer. */
const RAMP_DELIVERY_FLOOR = 0.85;

const rampRows = [];
const capRows = [];
let firstEvicting = null;
let firstOverFrame = null;
/**
 * The third crossover, and on this evidence the one that binds: once the cap
 * holds `live` at the budget, the FRAME cost plateaus and the work moves into
 * onSnapshot, where a cap does not bound it - the manager still plans, spawns
 * and disposes everything the rate hands it.
 */
let firstOverSnapshot = null;
let driverCeiling = null;

console.log('\n== LEG 7: the ceiling (ramp x2 per step, full, 50 ambient owners) ==');
if (honest && TEN !== null) {
  await setDensity(desktopPage, 'full');
  await desktopPage.evaluate(() => window.game.skillFxBudget(0));
  for (let step = 0; step < 12; step++) {
    const multiple = 10 * Math.pow(2, step);
    const rate = round(baseline.eventsInPerSec * multiple, 1);
    if (rate > RAMP_MAX_EVENTS_PER_SEC) {
      console.log(`  stopping: ${rate}/s is past the ${RAMP_MAX_EVENTS_PER_SEC}/s sane stop`);
      break;
    }
    const out = await stressed(desktopPage, {
      eventsPerSec: rate, ambientOwners: AMBIENT_OWNERS_10X,
      warmupMs: RAMP_WARMUP_MS, windowMs: RAMP_WINDOW_MS,
    });
    if (out === null) break;
    const row = record(7, `${multiple}x`, out, {
      multiple,
      requestedPerSec: rate,
      deliveredPerSec: out.stress.deliveredPerSec,
      estLive: out.stress.estimatedLive,
      meanEventMs: out.stress.meanEventMs,
      layersPerEvent: out.stress.layersPerEvent,
    }, RAMP_WINDOW_MS, rampRows);
    if (firstEvicting === null && row.evictedPerSec > 0) {
      firstEvicting = { multiple, rate, row };
      console.log(`  ⚑ first eviction at ${multiple}x (${rate}/s)`);
    }
    if (firstOverFrame === null && row.updateP95 >= FRAME_BUDGET_MS) {
      firstOverFrame = { multiple, rate, row };
      console.log(`  ⚑ first update p95 over the frame at ${multiple}x (${rate}/s)`);
    }
    if (firstOverSnapshot === null && row.snapP95 >= FRAME_BUDGET_MS) {
      firstOverSnapshot = { multiple, rate, row };
      console.log(`  ⚑ first SNAPSHOT p95 over the frame at ${multiple}x (${rate}/s)`);
    }
    // The driver's own ceiling is a finding, not a failure: past it the page
    // cannot hand the manager the rate it was asked for, so the step measures
    // the harness rather than the layer.
    if (row.deliveredPerSec < RAMP_DELIVERY_FLOOR * rate) {
      driverCeiling = { multiple, rate, delivered: row.deliveredPerSec };
      console.log(`  ⚑ the DRIVER ceiling: asked ${rate}/s, delivered ${row.deliveredPerSec}/s`);
      break;
    }
    if (firstEvicting !== null && firstOverFrame !== null) break;
  }

  // The comparison leg 5 could not make: the three caps where one of them
  // actually binds, at the first evicting step and at the step above it.
  if (firstEvicting !== null) {
    for (const multiple of [firstEvicting.multiple, firstEvicting.multiple * 2]) {
      const rate = round(baseline.eventsInPerSec * multiple, 1);
      for (const budget of [48, 96, 192]) {
        const live = await desktopPage.evaluate((n) => window.game.skillFxBudget(n), budget);
        if (live !== budget) { note(`leg 7: the budget override did not take (${live})`); continue; }
        const out = await stressed(desktopPage, {
          eventsPerSec: rate, ambientOwners: AMBIENT_OWNERS_10X,
          warmupMs: RAMP_WARMUP_MS, windowMs: RAMP_WINDOW_MS,
        });
        if (out === null) continue;
        record(7, `${multiple}x @ budget ${budget}`, out, {
          multiple, requestedPerSec: rate,
          deliveredPerSec: out.stress.deliveredPerSec,
          estLive: out.stress.estimatedLive,
          meanEventMs: out.stress.meanEventMs,
          layersPerEvent: out.stress.layersPerEvent,
        }, RAMP_WINDOW_MS, capRows);
      }
    }
  } else {
    note('leg 7: nothing ever evicted, so the three caps still have no row where they differ');
  }
  await desktopPage.evaluate(() => window.game.skillFxBudget(0));
  if (firstEvicting) {
    pass(`leg 7: eviction begins at ${firstEvicting.multiple}x (${firstEvicting.rate} events/s)`);
  }
  if (firstOverFrame) {
    pass(`leg 7: update p95 reaches the frame at ${firstOverFrame.multiple}x (${firstOverFrame.rate} events/s)`);
  } else {
    console.log(`  update p95 never reached ${FRAME_BUDGET_MS} ms inside the ramp - see the snapshot column`);
  }
}

// --- the guard, the ratios and the table ------------------------------------

const rowOf = (leg, density) => rows.find(r => r.leg === leg && r.density === density);
// ⚑ `off` is a real control, and at these sample counts its update p50 is
// 0.0 ms - the clock's own resolution. A ratio against zero is not a small
// number, it is no number, and it says so rather than printing a blank.
const ratio = (a, b) => (b > 0 ? round(a / b, 2) : 'n/a');

const full10 = rowOf(3, 'full');
let guard = 'NOT RUN';
if (full10) {
  guard = full10.updateP95 < FRAME_BUDGET_MS ? 'PASS' : 'OVER';
  const verdict = `10x full updateMs p95 = ${full10.updateP95} ms against the ${FRAME_BUDGET_MS} ms frame: ${guard}`;
  if (guard === 'PASS') pass('the frame guard: ' + verdict); else fail('the frame guard: ' + verdict);
}

const ratios = [];
for (const [leg, label] of [[3, 'desktop 10x'], [6, 'phone 10x']]) {
  const off = rowOf(leg, 'off'), low = rowOf(leg, 'low'), full = rowOf(leg, 'full');
  if (!off || !low || !full) continue;
  ratios.push({
    label,
    'updateMs p50 full/off': ratio(full.updateP50, off.updateP50),
    'updateMs p50 low/off': ratio(low.updateP50, off.updateP50),
    'updateMs p95 full/off': ratio(full.updateP95, off.updateP95),
    'updateMs p95 low/off': ratio(low.updateP95, off.updateP95),
    'rAF p50 full/off': ratio(full.rafP50, off.rafP50),
    'rAF p50 low/off': ratio(low.rafP50, off.rafP50),
    'displayObjects full/off': ratio(full.displayObjects, off.displayObjects),
    'displayObjects low/off': ratio(low.displayObjects, off.displayObjects),
  });
}

const COLUMNS = [
  ['leg', 'leg'], ['label', 'what'], ['density', 'density'], ['budget', 'budget'],
  ['frames', 'frames'], ['eventsInPerSec', 'events/s in'], ['fxPerSec', 'Fx/s'],
  ['updateP50', 'update p50'], ['updateP95', 'update p95'], ['updateMax', 'update max'],
  ['rafP50', 'rAF p50'], ['rafP95', 'rAF p95'],
  ['liveMax', 'live max'], ['ambientMax', 'ambient max'], ['ambientOwners', 'ambient owners'],
  ['displayObjects', 'display objs'],
  ['evictedPerSec', 'evicted/s'],
];

// Leg 7's own columns: the ramp is about the cap and the spawn path, so it
// carries `est. live`, the eviction rate and the onSnapshot cost, and drops
// the ambient columns that are constant across every one of its rows.
const RAMP_COLUMNS = [
  ['label', 'step'], ['requestedPerSec', 'events/s asked'], ['deliveredPerSec', 'events/s fed'],
  ['eventsInPerSec', 'events/s in'], ['fxPerSec', 'Fx/s'], ['budget', 'budget'],
  ['liveMax', 'live max'], ['estLive', 'est. live'], ['evictedPerSec', 'evicted/s'],
  ['updateP50', 'update p50'], ['updateP95', 'update p95'], ['updateMax', 'update max'],
  ['snapP50', 'snapshot p50'], ['snapP95', 'snapshot p95'],
  ['displayObjects', 'display objs'], ['rafP50', 'rAF p50'], ['frames', 'frames'],
];

function markdownTable(tableRows, columns) {
  const head = '| ' + columns.map(c => c[1]).join(' | ') + ' |';
  const rule = '|' + columns.map(() => '---').join('|') + '|';
  const body = tableRows.map(r => '| ' + columns.map(c => r[c[0]] ?? '').join(' | ') + ' |');
  return [head, rule, ...body].join('\n');
}

// The driver's own description of its authored mix, read off the last step.
const rampMix = rampRows.length
  ? { meanEventMs: rampRows[0].meanEventMs, layersPerEvent: rampRows[0].layersPerEvent }
  : { meanEventMs: 0, layersPerEvent: 0 };
// What the layer held alive at the last step that did NOT evict: the honest
// "how many Fx does this rate keep in the air" reading a cap is sized from.
const belowEviction = firstEvicting
  ? rampRows[Math.max(0, rampRows.findIndex(r => r.multiple === firstEvicting.multiple) - 1)]
  : rampRows[rampRows.length - 1];

const report = {
  when: new Date().toISOString(),
  baseline,
  ten: TEN,
  frameGuard: { budgetMs: FRAME_BUDGET_MS, p95: full10?.updateP95 ?? null, verdict: guard },
  rows,
  ratios,
  ramp: {
    warmupMs: RAMP_WARMUP_MS,
    windowMs: RAMP_WINDOW_MS,
    budget: 96,
    ambientOwners: AMBIENT_OWNERS_10X,
    mix: rampMix,
    steps: rampRows,
    caps: capRows,
    firstEvicting,
    firstOverFrame,
    firstOverSnapshot,
    driverCeiling,
    belowEviction: belowEviction ?? null,
  },
  inconclusive,
  errors,
};
const jsonPath = join(outdir, 'skill-fx-scale.json');
writeFileSync(jsonPath, JSON.stringify(report, null, 2));

console.log('\n### C4 scale table\n');
console.log(markdownTable(rows, COLUMNS));
if (ratios.length) {
  console.log('\n### Ratios (headless absolutes do not transfer; these do)\n');
  const keys = Object.keys(ratios[0]);
  console.log('| ' + keys.join(' | ') + ' |');
  console.log('|' + keys.map(() => '---').join('|') + '|');
  for (const r of ratios) console.log('| ' + keys.map(k => r[k]).join(' | ') + ' |');
}
if (rampRows.length) {
  console.log('\n### Leg 7, the ceiling ramp (full, 50 ambient owners, budget 96, 2 s warm-up + 6 s window)\n');
  console.log(markdownTable(rampRows, RAMP_COLUMNS));
  console.log('\n⚑ At ~3 fps headless a second of events lands as ONE batch, so `live max` is');
  console.log('environment-shaped; `est. live` is rate x mean Fx lifetime per event');
  console.log(`(${rampMix.meanEventMs} ms, ${rampMix.layersPerEvent} layers per event) and is the transferable number.`);
  console.log('⚑ `update p95` is the FRAME cost only. Spawning and eviction happen in');
  console.log('onSnapshot, on the socket\'s thread - that is the `snapshot` column.');
}
if (capRows.length) {
  console.log('\n### Leg 7, the three caps where one of them binds\n');
  console.log(markdownTable(capRows, RAMP_COLUMNS));
}
if (firstEvicting || firstOverFrame || firstOverSnapshot || driverCeiling) {
  console.log('\ncrossovers:');
  console.log(`  eviction begins: ${firstEvicting ? `${firstEvicting.multiple}x = ${firstEvicting.rate} events/s (live max just below: ${belowEviction ? belowEviction.liveMax : 'n/a'}, est. live ${belowEviction ? belowEviction.estLive : 'n/a'})` : 'never inside the ramp'}`);
  console.log(`  update p95 >= ${FRAME_BUDGET_MS} ms: ${firstOverFrame ? `${firstOverFrame.multiple}x = ${firstOverFrame.rate} events/s` : 'never inside the ramp (the cap bounds the frame; see the snapshot line)'}`);
  console.log(`  snapshot p95 >= ${FRAME_BUDGET_MS} ms: ${firstOverSnapshot ? `${firstOverSnapshot.multiple}x = ${firstOverSnapshot.rate} events/s` : 'never inside the ramp'}`);
  console.log(`  driver ceiling: ${driverCeiling ? `${driverCeiling.multiple}x = ${driverCeiling.rate} events/s asked, ${driverCeiling.delivered}/s fed` : 'not reached'}`);
}
console.log(`\nframe guard (10x full, update p95 < ${FRAME_BUDGET_MS} ms): ${guard}`);
console.log(`JSON: ${jsonPath}`);

await browser.close();
const realErrors = errors.filter(e => !/favicon/i.test(e));
if (realErrors.length) {
  console.log('\nERRORS / FAILURES:');
  realErrors.forEach(e => console.log('  ' + e));
  console.log(`\nRESULT: FAIL (${realErrors.length})`);
  process.exit(1);
}
console.log(inconclusive ? '\nRESULT: INCONCLUSIVE (see above)' : '\nRESULT: PASS');
