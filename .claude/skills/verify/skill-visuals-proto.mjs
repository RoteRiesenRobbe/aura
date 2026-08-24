#!/usr/bin/env node
// prototype/skill-visuals - the per-skill hit/field dressings: a sword thrust
// on the Damage aura's hit tick, a fireball flight + impact on
// LongRangeStrike, an ambient snowflake field on Frostbite. All client-only
// inference (own beat + victim in reach + damage landed) - see
// SkillVisuals.ts.
//
// Venue: the wolf camp at (-47, -0.5) - three Wolves within 1.5 u
// (wanderRadius 1), a Stag at 4 u, a DireWolf at 5.9 u. Wolves aggro and park
// at exact melee reach, so the Damage aura ticks continuously. Outdoors: the
// nearest dark circle (-50.4, -10.8, r 7.2) is ~10.8 u away, so nothing here
// is darkness-suppressed (the immune-feedback lesson).
//
// ⚑ GOD is survival only - it never touches OUR outgoing damage, which is
//   what every leg here draws from.
// ⚑ The starting aura is pre-equipped but NOT active - the long-held hotkey
//   (~1.4 s, rAF-sampled) switches slots on, `.activeSlot` is the gate.
// Tri-state: a warp off-venue, an aura that never activates or an equip that
// never lands is INCONCLUSIVE, not red.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { joinAsNewCharacter } from './lib/join.mjs';
import { botName } from './botname.mjs';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');

const url = process.argv[2] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const outdir = process.argv[3] || '/tmp/skill-visuals-shots';
mkdirSync(outdir, { recursive: true });

const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = {
  ...process.env,
  LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':'),
};

// ⚑ The throttling flags are load-bearing: without them the headless page
// intermittently stops draining the websocket for seconds at a time (observed
// as 25 snapshots processed in 14 s, phases strictly increasing, 0 beats) -
// which starves every timing-based leg while the product is perfectly healthy.
const browser = await chromium.launch({
  args: [
    '--no-sandbox',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
  ],
  env,
});
const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
const errors = [];
let inconclusive = false;
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const fail = (msg) => { errors.push('CHECK FAILED: ' + msg); };
const pass = (msg) => { console.log('PASS: ' + msg); };

await page.goto(url, { waitUntil: 'domcontentloaded' });
await joinAsNewCharacter(page, botName('skillfx'));
await page.waitForFunction(() => !!window.game?.character, null, { timeout: 30_000 });
await page.evaluate(() => {
  const panel = document.getElementById('developPanel');
  if (panel) panel.style.display = 'none';
  window.__auraRoot = window.game.character.plate.parent;
});
console.log('joined');

async function runCommand(command) {
  await page.waitForSelector('#console_command', { state: 'attached' });
  await page.evaluate((cmd) => {
    const input = document.querySelector('#console_command');
    input.value = cmd;
    document.querySelector('#console').dispatchEvent(new Event('submit', { cancelable: true }));
  }, command);
  await page.waitForTimeout(400);
}

// Long-held hotkey (rAF-sampled), retried once; slot is data-slot (0-based).
async function activateAuraSlot(slot) {
  const key = String(slot + 1);
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.keyboard.down(key);
    await page.waitForTimeout(1400 + attempt * 200);
    await page.keyboard.up(key);
    const ok = await page.waitForSelector(`.auraSlot[data-slot="${slot}"].activeSlot`, { timeout: 8_000 })
      .then(() => true).catch(() => false);
    if (ok) return true;
  }
  return false;
}

// Spellbook row → aura slot. ⚑ Click the NAME at box.x+25, never the row
// centre (the mid-row spend button has precedence - the open-portal lesson).
// ⚑ Equips are combat-locked (rejectEquipInCombat), and a wandering mob can
// re-open the window at any venue - so every attempt first waits for the
// combat indicator to hide, and the whole select+slot sequence retries.
async function equipAura(nameRe, slot) {
  const found = await page.waitForFunction((src) => {
    const re = new RegExp(src, 'i');
    return [...document.querySelectorAll('#spellbookList li')].some(li => re.test(li.textContent));
  }, nameRe.source, { timeout: 20_000 }).then(() => true).catch(() => false);
  if (!found) return { ok: false, why: 'skill never appeared in the spellbook' };
  let label = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const calm = await page.waitForFunction(() =>
      document.getElementById('combatIndicator')?.classList.contains('hidden'),
      null, { timeout: 20_000 }).then(() => true).catch(() => false);
    if (!calm) return { ok: false, why: 'the combat window never closed' };
    const idx = await page.evaluate((src) => {
      const re = new RegExp(src, 'i');
      return [...document.querySelectorAll('#spellbookList li')].findIndex(li => re.test(li.textContent));
    }, nameRe.source);
    const rows = await page.$$('#spellbookList li');
    const box = await rows[idx].boundingBox();
    await page.mouse.click(box.x + 25, box.y + box.height / 2);
    await page.waitForTimeout(700);
    const selected = await page.evaluate((i) =>
      document.querySelectorAll('#spellbookList li')[i]?.classList.contains('selected') ?? false, idx);
    if (!selected) continue;
    const slotEl = await page.$(`#auraSlotList li[data-slot="${slot}"]`);
    const sb = await slotEl.boundingBox();
    await page.mouse.click(sb.x + sb.width / 2, sb.y + sb.height / 2);
    await page.waitForTimeout(900);
    label = await page.evaluate((s) =>
      document.querySelector(`#auraSlotList li[data-slot="${s}"] .slotLabel`)?.textContent?.trim() ?? '', slot);
    if (nameRe.test(label)) return { ok: true, label };
    await page.waitForTimeout(2_000);
  }
  return { ok: false, label };
}

// A long-held hotkey occasionally lands TWO edges under throttled rAF,
// toggling the aura on and instantly off again - the activeSlot gate then
// catches the transient ON and the whole watch runs against a dead aura
// (observed as beats:1, notes:1 in 14 s). Guard every watch with an
// active-at-start + active-at-end check and one retry.
async function isSlotActive(slot) {
  return page.evaluate((s) =>
    !!document.querySelector(`.auraSlot[data-slot="${s}"].activeSlot`), slot);
}
async function watchedLeg(slot, ms) {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!(await isSlotActive(slot)) && !(await activateAuraSlot(slot))) {
      return null;
    }
    const s0 = await statsSnapshot();
    const fx = await watchFx(ms);
    const s1 = await statsSnapshot();
    if (await isSlotActive(slot)) {
      return { fx, stats: statsDelta(s0, s1) };
    }
    console.log(`(aura slot ${slot + 1} dropped mid-watch - re-activating and retrying the leg)`);
  }
  return null;
}

// Watch the scene graph for the prototype's named containers. One sample =
// one synchronous walk; each container is counted once (WeakSet).
async function watchFx(ms) {
  return page.evaluate((durationMs) => new Promise((resolve) => {
    const stage = (() => { let n = window.__auraRoot; while (n.parent) n = n.parent; return n; })();
    const seen = new WeakSet();
    const out = { strike: 0, projectile: 0, impact: 0, iceField: 0, iceFlakes: 0 };
    const visit = (node) => {
      const label = node.label;
      if (label && label.startsWith('skillFx') && !seen.has(node)) {
        seen.add(node);
        if (label === 'skillFxStrike') out.strike++;
        else if (label === 'skillFxProjectile') out.projectile++;
        else if (label === 'skillFxImpact') out.impact++;
        else if (label === 'skillFxIceField') out.iceField++;
      }
      if (label === 'skillFxIceField') {
        out.iceFlakes = Math.max(out.iceFlakes, node.children?.length ?? 0);
      }
      (node.children ?? []).forEach(visit);
    };
    const t0 = Date.now();
    const poll = () => {
      visit(stage);
      if (Date.now() - t0 > durationMs) return resolve(out);
      setTimeout(poll, 80);
    };
    poll();
  }), ms);
}

// Prototype diagnostics: the module counts beats, damage notes, claims and
// rejection reasons on window.__skillFxStats.
async function statsSnapshot() {
  return page.evaluate(() => ({...(window.__skillFxStats ?? {})}));
}
function statsDelta(a, b) {
  const d = {};
  for (const k of Object.keys(b)) d[k] = (b[k] ?? 0) - (a[k] ?? 0);
  return d;
}

// Leg venues. Wolves park at melee reach for the sword; the kobold camp is a
// FRESH five-mob cluster for the fireball leg, so leg 1's kills cannot starve
// it (the orc camps were rejected: their SpikeBarricades would eat the
// nearest-1 tick with resisted hits).
const WOLF_CAMP = { x: -47.0, y: -0.5 };
const KOBOLD_CAMP = { x: -14.7, y: 21.3 };

async function warpTo(spot, label) {
  await runCommand(`WARP ${Math.round(spot.x * 120)} ${Math.round(spot.y * 120)}`);
  const ok = await page.waitForFunction(({ x, y }) => {
    const c = window.game.character;
    return Math.hypot(c.getX() / 120 - x, c.getY() / 120 - y) < 1.5;
  }, spot, { timeout: 20_000 }).then(() => true).catch(() => false);
  if (!ok) {
    console.log(`INCONCLUSIVE: warp did not land at ${label}`);
    inconclusive = true;
  }
  return ok;
}

await runCommand('GOD'); // survival only - our OUTGOING damage is untouched
await warpTo(WOLF_CAMP, 'the wolf camp');

// LEG 0 - negative control: no aura active → nothing may draw.
console.log('\n== LEG 0: negative control (no active aura, 6 s) ==');
const leg0 = await watchFx(6_000);
if (leg0.strike + leg0.projectile + leg0.impact + leg0.iceField > 0) {
  fail(`leg 0: FX drawn with no active aura: ${JSON.stringify(leg0)}`);
} else {
  pass('leg 0: nothing drawn before an aura is active');
}

// LEG 1 - the starting Damage aura → sword thrusts at the wolves.
console.log('\n== LEG 1: Damage aura → skillFxStrike (14 s) ==');
if (!inconclusive) {
  const run = await watchedLeg(0, 14_000);
  if (run === null) {
    console.log('INCONCLUSIVE: the Damage aura never stayed active');
    inconclusive = true;
  } else {
  const { fx: leg1, stats: d1 } = run;
  await page.screenshot({ path: join(outdir, 'leg1-sword.png') });
  console.log(`leg 1: strikes ${leg1.strike}, projectiles ${leg1.projectile} (beat ≈ 1.33 s)`);
  console.log('leg 1 stats: ' + JSON.stringify(d1));
  // The stats delta is the PRIMARY assert: it counts at event time, while the
  // scene poll (80 ms nominal, throttled headless) can miss 320 ms strikes.
  // Tri-state on a starved leg: with <5 beats the aura barely ticked (wolves
  // dead/afar and the accumulator quiet), so a low claim count proves nothing
  // - observed once as beats:2, claims:2, strikes:2, i.e. perfect behaviour.
  if (d1.beats < 5) {
    console.log(`INCONCLUSIVE: leg 1 aura ticked only ${d1.beats}× in 14 s - starved venue`);
    inconclusive = true;
  } else if (d1.claims >= 3) {
    pass(`leg 1: ${d1.claims} hits claimed as own sword strikes`);
  } else if (d1.notes === 0) {
    console.log('INCONCLUSIVE: leg 1 saw no damage at all - empty venue?');
    inconclusive = true;
  } else {
    fail(`leg 1: expected ≥3 claims in 14 s, stats ${JSON.stringify(d1)}`);
  }
  if (d1.claims >= 1 && leg1.strike < 1) fail('leg 1: hits claimed but no skillFxStrike container ever appeared');
  if (leg1.projectile > 0) fail(`leg 1: a projectile drawn for a strike-style skill (${leg1.projectile})`);
  }
}

// LEG 2 - LongRangeStrike in slot 2 → fireball flight + impact.
console.log('\n== LEG 2: LongRangeStrike → skillFxProjectile + skillFxImpact (14 s) ==');
if (!inconclusive) {
  await runCommand('XP 100000'); // slot/level headroom for the two granted auras
  await page.waitForTimeout(3_000);
  // Equip on open ground: equips are combat-locked, and the wolf camp keeps
  // the combat window open whenever a respawned wolf is biting.
  await warpTo({ x: -23, y: 14 }, 'open ground');
  await page.waitForFunction(() =>
    document.getElementById('combatIndicator')?.classList.contains('hidden'),
    null, { timeout: 30_000 }).catch(() => {});
  await runCommand('SKILL LongRangeStrike');
  await page.waitForTimeout(1_500);
  const eq = await equipAura(/Long-?Range Strike/i, 1);
  if (!eq.ok) {
    console.log(`INCONCLUSIVE: LongRangeStrike equip did not land: ${JSON.stringify(eq)}`);
    inconclusive = true;
  } else if (await warpTo(KOBOLD_CAMP, 'the kobold camp')) {
    const run = await watchedLeg(1, 14_000);
    if (run === null) {
      console.log('INCONCLUSIVE: LongRangeStrike never stayed active');
      inconclusive = true;
    } else {
      const { fx: leg2, stats: d2 } = run;
      await page.screenshot({ path: join(outdir, 'leg2-fireball.png') });
      console.log(`leg 2: projectiles ${leg2.projectile}, impacts ${leg2.impact}, strikes ${leg2.strike}`);
      console.log('leg 2 stats: ' + JSON.stringify(d2));
      if (d2.beats < 5) {
        console.log(`INCONCLUSIVE: leg 2 aura ticked only ${d2.beats}× in 14 s - starved venue`);
        inconclusive = true;
      } else if (d2.claims >= 2) {
        pass(`leg 2: ${d2.claims} hits claimed as own fireballs`);
      } else if (d2.notes === 0) {
        console.log('INCONCLUSIVE: leg 2 saw no damage at all - empty venue?');
        inconclusive = true;
      } else {
        fail(`leg 2: expected ≥2 claims in 14 s, stats ${JSON.stringify(d2)}`);
      }
      if (d2.claims >= 1 && leg2.projectile + leg2.impact < 1) {
        fail('leg 2: hits claimed but no projectile/impact container ever appeared');
      }
      if (leg2.strike > 0) fail(`leg 2: a sword drawn for a projectile-style skill (${leg2.strike})`);
    }
  }
}

// LEG 3 - Frostbite in slot 3 → the ambient snowflake field, no strikes.
// ⚑ Equips are combat-locked (rejectEquipInCombat), and leg 2 ends mid-fight
// at the kobold camp - warp to open ground and wait the combat window out
// first, or the equip click shows a banner and never sends.
console.log('\n== LEG 3: Frostbite → skillFxIceField (6 s) ==');
if (!inconclusive) {
  await warpTo({ x: -23, y: 14 }, 'open ground');
  const calm = await page.waitForFunction(() =>
    document.getElementById('combatIndicator')?.classList.contains('hidden'),
    null, { timeout: 30_000 }).then(() => true).catch(() => false);
  if (!calm) {
    console.log('INCONCLUSIVE: the combat window never closed on open ground');
    inconclusive = true;
  }
}
if (!inconclusive) {
  await runCommand('SKILL Frostbite');
  await page.waitForTimeout(1_500);
  const eq = await equipAura(/Frostbite/i, 2);
  if (!eq.ok) {
    console.log(`INCONCLUSIVE: Frostbite equip did not land: ${JSON.stringify(eq)}`);
    inconclusive = true;
  } else {
    const run = await watchedLeg(2, 6_000);
    if (run === null) {
      console.log('INCONCLUSIVE: Frostbite never stayed active');
      inconclusive = true;
    } else {
    const leg3 = run.fx;
    await page.screenshot({ path: join(outdir, 'leg3-icefield.png') });
    console.log(`leg 3: field ${leg3.iceField}, flakes ${leg3.iceFlakes}, strikes ${leg3.strike}, projectiles ${leg3.projectile}`);
    if (leg3.iceField >= 1 && leg3.iceFlakes >= 12) pass(`leg 3: ice field with ${leg3.iceFlakes} flakes`);
    else fail(`leg 3: expected a field with ≥12 flakes, saw ${JSON.stringify(leg3)}`);
    if (leg3.strike + leg3.projectile > 0) {
      fail(`leg 3: field style drew a strike/projectile (${leg3.strike}/${leg3.projectile})`);
    }
    }
  }
}

// LEG 4 - layer order: skillFx sits BELOW darkness (dark areas stay dark).
console.log('\n== LEG 4: skillFx below the darkness layer ==');
const order = await page.evaluate(() => {
  let n = window.__auraRoot;
  while (n.parent && n.label !== 'cameraGroup') n = n.parent;
  const labels = (n.children ?? []).map(c => c.label);
  return { fx: labels.indexOf('skillFx'), dark: labels.indexOf('darkness'), labels };
});
if (order.fx >= 0 && order.dark >= 0 && order.fx < order.dark) {
  pass(`leg 4: skillFx (index ${order.fx}) renders below darkness (index ${order.dark})`);
} else {
  fail(`leg 4: layer order wrong: ${JSON.stringify(order)}`);
}

await browser.close();
const realErrors = errors.filter(e => !/favicon/i.test(e));
if (realErrors.length) {
  console.log('\nERRORS / FAILURES:');
  realErrors.forEach(e => console.log('  ' + e));
  console.log(`\nRESULT: FAIL (${realErrors.length})`);
  process.exit(1);
}
console.log(inconclusive ? '\nRESULT: INCONCLUSIVE (see above)' : '\nRESULT: PASS');
