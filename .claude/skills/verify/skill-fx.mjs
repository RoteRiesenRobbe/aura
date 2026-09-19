#!/usr/bin/env node
// Skill VFX C2a (docs/plan-skill-vfx.md §12b): the SkillFx engine draws the
// authored `visual` layers off the per-hit SkillEvent wire. Asserted through
// the manager's own counters (`window.game.skillFx()` -> {live,
// spawnedByKind, evicted}), which count at spawn time, so a throttled scene
// poll cannot miss a 180 ms impact.
//
// Legs: 0 nothing draws without a skill event · 1 Damage -> strike, anchored
// at the attacker (§12c; the wolves' own wolf-bite impacts land here too,
// which is the mob half) ·
// 2 LongRangeStrike -> projectile + impact · 3 LightningStrike -> chained
// beam · 4 skillFx sits below darkness · 5 a bandit's swing lands on the own
// player · 6 a troll's overhead lands on the own player.
//
// ⚑ GOD is survival only, it never touches OUR outgoing damage - but it DOES
//   short-circuit the player's own takeDamage, so a god-mode player is never
//   the victim of a HIT event and no mob strike draws on them. Legs 5 and 6
//   therefore drop GOD for their armed window only.
// ⚑ The starting aura is pre-equipped but NOT active: the long-held hotkey
//   switches slots on, `.activeSlot` is the gate.
// Tri-state: a warp off-venue, an aura that never activates or an equip that
// never lands is INCONCLUSIVE, not red.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { joinAsNewCharacter } from './lib/join.mjs';
import { botName } from './botname.mjs';
import { showSkillRowAt, closeSpellbook } from './lib/spellbook.mjs';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');

const url = process.argv[2] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const outdir = process.argv[3] || '/tmp/skill-fx-shots';
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
    await showSkillRowAt(page, idx);
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

async function isSlotActive(slot) {
  return page.evaluate((s) =>
    !!document.querySelector(`.auraSlot[data-slot="${s}"].activeSlot`), slot);
}

// The manager's counters, flattened: {impact, projectile, beam, ..., evicted}.
async function fxCounts() {
  return page.evaluate(() => {
    const s = window.game.skillFx();
    return { ...s.spawnedByKind, evicted: s.evicted, live: s.live };
  });
}
function delta(a, b) {
  const d = {};
  for (const k of Object.keys(b)) d[k] = (b[k] ?? 0) - (a[k] ?? 0);
  return d;
}
// Watch a leg with the slot active at start AND end (a long hold can land two
// edges under throttled rAF and toggle the aura straight off again).
async function watchedLeg(slot, ms, shot, shotKind) {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!(await isSlotActive(slot)) && !(await activateAuraSlot(slot))) return null;
    const a = await fxCounts();
    const e0 = (await page.evaluate(() => window.game.skillEvents().total)) ?? 0;
    // Which skills landed, sampled in-page: a leg that asserts a kind must be
    // able to say whether the skill it equipped ever hit anything.
    await page.evaluate(() => {
      window.__fxSkillIds = {};
      window.__fxSampler = setInterval(() => {
        for (const e of window.game.skillEvents().last ?? []) {
          if (!e.fired) window.__fxSkillIds[e.skillId] = (window.__fxSkillIds[e.skillId] ?? 0) + 1;
        }
      }, 30);
    });
    // ⚑ A 200 ms layer is over before a headless frame is captured (~300 ms
    // a frame here), so the shot arms on the kind's spawn counter and slows
    // the page clock 8x from that instant (the verify skill's floating-text
    // trick); the manager times everything off performance.now().
    const t0 = Date.now();
    if (shot) {
      const armed = await page.evaluate(({ kind, timeout }) => new Promise((resolve) => {
        const base0 = window.game.skillFx().spawnedByKind[kind] ?? 0;
        const started = Date.now();
        const poll = setInterval(() => {
          if ((window.game.skillFx().spawnedByKind[kind] ?? 0) > base0) {
            clearInterval(poll);
            const real = performance.now.bind(performance);
            const base = real();
            window.__realNow = real;
            performance.now = () => base + (real() - base) / 8;
            resolve(true);
          } else if (Date.now() - started > timeout) {
            clearInterval(poll);
            resolve(false);
          }
        }, 5);
      }), { kind: shotKind, timeout: ms - 2_000 });
      if (armed) {
        // Real ms under the 8x clock, aimed at the layer's visible middle: a
        // thrust mid-extend, a bolt mid-flight, a chain with its later hops lit
        // (the capture itself costs ~300 ms real on top).
        await page.waitForTimeout({ strike: 200, impact: 350, projectile: 1_100, beam: 900 }[shotKind] ?? 350);
        await page.screenshot({ path: join(outdir, shot) });
        await page.evaluate(() => { performance.now = window.__realNow; });
      }
    }
    await page.waitForTimeout(Math.max(0, ms - (Date.now() - t0)));
    const ids = await page.evaluate(() => { clearInterval(window.__fxSampler); return window.__fxSkillIds; });
    console.log('  hit skill ids (sampled): ' + JSON.stringify(ids));
    const b = await fxCounts();
    const e1 = (await page.evaluate(() => window.game.skillEvents().total)) ?? 0;
    if (await isSlotActive(slot)) return { fx: delta(a, b), events: e1 - e0, ids };
    console.log(`(aura slot ${slot + 1} dropped mid-watch, retrying the leg)`);
  }
  return null;
}
async function calm() {
  return page.waitForFunction(() =>
    document.getElementById('combatIndicator')?.classList.contains('hidden'),
    null, { timeout: 30_000 }).then(() => true).catch(() => false);
}

const WOLF_CAMP = { x: -47.0, y: -0.5 };
// Four level-3 Wolves within 2.2 u, outdoors (nearest dark circle 14.6 u
// away): the chain venue. ⚑ No XP cheat anywhere in this script: a levelled
// player one-shots the pack and the chain has nothing to jump to.
const WOLF_CAMP_WEST = { x: -56.9, y: 3.8 };
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

const OPEN_GROUND = { x: -23, y: 14 };

await runCommand('GOD');

// LEG 0 - negative control: open ground, no aura on, nothing may spawn.
console.log('\n== LEG 0: negative control (open ground, 5 s) ==');
await warpTo(OPEN_GROUND, 'open ground');
{
  // D1 + D10: a mob-vs-mob fight in view legitimately draws, so the control
  // is "no spawn without a skill event", not "no spawn at all".
  const a = await fxCounts();
  const e0 = await page.evaluate(() => window.game.skillEvents().total ?? 0);
  await page.waitForTimeout(5_000);
  const d = delta(a, await fxCounts());
  const events = (await page.evaluate(() => window.game.skillEvents().total ?? 0)) - e0;
  const n = (d.strike ?? 0) + (d.impact ?? 0) + (d.projectile ?? 0) + (d.beam ?? 0);
  if (events === 0 && n > 0) fail(`leg 0: ${n} FX spawned with no skill event: ${JSON.stringify(d)}`);
  else pass(`leg 0: ${n} FX for ${events} skill events in view`);
}

// One aura leg: equip (when named), warp to the camp, watch, judge one kind.
async function auraLeg(n, { skill, skillId, nameRe, slot, camp, campLabel, kind, shot, forbid, wantImpact = true }) {
  console.log(`\n== LEG ${n}: ${skill ?? 'Damage'} -> ${kind} (14 s) ==`);
  if (inconclusive) return;
  if (!(await warpTo(camp, campLabel))) return;
  await closeSpellbook(page);
  await page.mouse.move(800, 200); // off the slot bar, or its tooltip sits in every shot
  const run = await watchedLeg(slot, 14_000, shot, kind);
  if (run === null) { console.log(`INCONCLUSIVE: leg ${n} aura never stayed active`); inconclusive = true; return; }
  console.log(`leg ${n}: fx ${JSON.stringify(run.fx)}, skill events ${run.events}`);
  if (run.events < 3) { console.log(`INCONCLUSIVE: leg ${n} saw only ${run.events} skill events, starved venue`); inconclusive = true; return; }
  if (!run.ids[skillId]) { console.log(`INCONCLUSIVE: leg ${n}: skill ${skillId} never landed a hit in the window`); inconclusive = true; return; }
  if ((run.fx[kind] ?? 0) >= 2) pass(`leg ${n}: ${run.fx[kind]} ${kind} layers spawned`);
  else fail(`leg ${n}: expected >=2 ${kind}, saw ${JSON.stringify(run.fx)}`);
  if (wantImpact && (run.fx.impact ?? 0) < 1) fail(`leg ${n}: no impact spawned`);
  for (const k of forbid ?? []) if ((run.fx[k] ?? 0) > 0) fail(`leg ${n}: a ${k} spawned where none is authored (${run.fx[k]})`);
}

// ⚑ Every equip happens HERE, before the first fight: equips are
// combat-locked, and without an XP cheat the player cannot kill a camp fast
// enough to close the combat window between legs (kobolds chase).
for (const [skill, nameRe, slot] of [['LongRangeStrike', /Long-?Range Strike/i, 1], ['LightningStrike', /Lightning Strike/i, 2]]) {
  if (inconclusive) break;
  if (!(await calm())) { console.log('INCONCLUSIVE: combat never closed'); inconclusive = true; break; }
  await runCommand(`SKILL ${skill}`);
  await page.waitForTimeout(1_500);
  const eq = await equipAura(nameRe, slot);
  if (!eq.ok) { console.log(`INCONCLUSIVE: ${skill} equip did not land: ${JSON.stringify(eq)}`); inconclusive = true; }
}

await auraLeg(1, { skillId: 1, slot: 0, camp: WOLF_CAMP, campLabel: 'the wolf camp', kind: 'strike',
  shot: 'leg1-strike.png', forbid: ['projectile', 'beam'], wantImpact: false });
await auraLeg(2, { skill: 'LongRangeStrike', skillId: 45, nameRe: /Long-?Range Strike/i, slot: 1, camp: KOBOLD_CAMP,
  campLabel: 'the kobold camp', kind: 'projectile', shot: 'leg2-projectile.png', forbid: ['beam'] });
await auraLeg(3, { skill: 'LightningStrike', skillId: 76, nameRe: /Lightning Strike/i, slot: 2, camp: WOLF_CAMP_WEST,
  campLabel: 'the western wolf camp', kind: 'beam', shot: 'leg3-chain-beam.png' });

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

// LEGS 5+6 - a MOB's strike on the own player (D3: mobs author through the
// same vocabulary). The count proves a strike spawned; WHICH style is the
// screenshot's to show: a Bandit swings a blade, a Troll brings a hammer down.
async function mobStrikeLeg(n, spot, label, shot, waitMs) {
  console.log(`\n== LEG ${n}: ${label} -> strike on the own player ==`);
  if (inconclusive) return;
  if (!(await warpTo(spot, label))) return;
  await page.mouse.move(800, 200);
  // Own aura OFF (its beams would bury the mob's weapon), then let the camera
  // finish its slow glide across the map before anything is photographed.
  for (let slot = 0; slot < 3; slot++) {
    if (await isSlotActive(slot)) {
      await page.keyboard.down(String(slot + 1));
      await page.waitForTimeout(1400);
      await page.keyboard.up(String(slot + 1));
      await page.waitForTimeout(600);
    }
  }
  await page.waitForFunction(() => {
    const c = window.game.character;
    const g = c.shape.getGlobalPosition();
    const ok = g.x > 500 && g.x < 1100 && g.y > 250 && g.y < 650;
    const same = window.__lastG && Math.hypot(window.__lastG.x - g.x, window.__lastG.y - g.y) < 1;
    window.__lastG = { x: g.x, y: g.y };
    return ok && same;
  }, null, { timeout: 60_000, polling: 1_000 }).catch(() => {});
  // ⚑ GOD only for the trip and the camera settle: a camp empties a pool in
  // seconds (leg 5 once ended at 179 / 2675 and the next warp never landed,
  // the player being dead).
  await runCommand('GOD off');
  const a = await fxCounts();
  const armed = await page.evaluate(({ timeout }) => new Promise((resolve) => {
    const base0 = window.game.skillFx().spawnedByKind.strike ?? 0;
    const started = Date.now();
    const poll = setInterval(() => {
      if ((window.game.skillFx().spawnedByKind.strike ?? 0) > base0) {
        clearInterval(poll);
        const real = performance.now.bind(performance);
        const base = real();
        window.__realNow = real;
        performance.now = () => base + (real() - base) / 8;
        resolve(true);
      } else if (Date.now() - started > timeout) { clearInterval(poll); resolve(false); }
    }, 5);
  }), { timeout: 25_000 });
  if (!armed) { await page.screenshot({ path: join(outdir, `leg${n}-nothing.png`) }); console.log(`INCONCLUSIVE: leg ${n}: nothing struck within 25 s`); await runCommand('GOD'); inconclusive = true; return; }
  await page.waitForTimeout(waitMs);
  await page.screenshot({ path: join(outdir, shot) });
  await page.evaluate(() => { performance.now = window.__realNow; });
  await runCommand('GOD');
  const d = delta(a, await fxCounts());
  pass(`leg ${n}: ${d.strike} strike(s) spawned by ${label}`);
}
// ⚑ GOD short-circuits the player's takeDamage, so a god-mode player is never
// the victim of a HIT event and no mob strike can draw on them. These two legs
// therefore drop GOD and buy survival with levels instead (legs 1-3 are over,
// so a levelled player no longer starves anything).
if (!inconclusive) {
  await runCommand('XP 100000000');
  await page.waitForTimeout(3_000);
}
await mobStrikeLeg(6, { x: 20.5, y: 33.5 }, 'the trolls (overhead)', 'leg6-mob-overhead.png', 1_700);
await mobStrikeLeg(5, { x: 26.5, y: 22.5 }, 'the bandit camp (swing)', 'leg5-mob-swing.png', 700);

await browser.close();
const realErrors = errors.filter(e => !/favicon/i.test(e));
if (realErrors.length) {
  console.log('\nERRORS / FAILURES:');
  realErrors.forEach(e => console.log('  ' + e));
  console.log(`\nRESULT: FAIL (${realErrors.length})`);
  process.exit(1);
}
console.log(inconclusive ? '\nRESULT: INCONCLUSIVE (see above)' : '\nRESULT: PASS');
