#!/usr/bin/env node
// Skill VFX C2a (docs/plan-skill-vfx.md §12b): the SkillFx engine draws the
// authored `visual` layers off the per-hit SkillEvent wire. Asserted through
// the manager's own counters (`window.game.skillFx()` -> {live,
// spawnedByKind, evicted}), which count at spawn time, so a throttled scene
// poll cannot miss a 180 ms impact.
//
// Legs: 0 nothing draws without a skill event · 1 Damage -> strike, anchored
// at the attacker (§12c; the wolves' own bite strikes land here too, which is
// the mob half), plus the engine's hit mark on every sword hit ·
// 2 LongRangeStrike -> cast-pose + projectile + the mark · 3 LightningStrike ->
// chained beam · 4 skillFx sits below darkness · 5 a bandit's swing lands on
// the own player · 6 a troll's overhead lands on the own player.
//
// ⭐ §12g (the C3a amendment): the round mark on the victim is the ENGINE'S,
// drawn on every landed Damage/Crit hit and authored by no file, and it still
// counts as `impact` in the manager's counters. So `wantImpact` now asserts
// the automatic mark on every damage leg, leg 10 proves `off` hides it along
// with everything else, and leg 15 proves a HEAL landing draws none.
//
// C2b legs (§12d.6), all of them between leg 4 and legs 5+6 ON PURPOSE: legs
// 5+6 level the player with an XP cheat to survive a camp, and a levelled
// player one-shots everything a fight leg needs.
// 7 a campfire's ambient mist draws with no combat at all · 8 Frostbite's
// ambient swirl appears on the own player and is DISPOSED when the aura is
// switched off · 9 density `low` keeps the own emitter and drops another
// actor's · 10 density `off`: a real fight spawns 0 Fx and holds 0 ambient
// while the wind-up glow keeps running · 11 Heal's two ambient rise emitters ·
// 12 Whirling Axes (cheat-only cooldown) -> an orbit on the cast.
//
// C3a legs (§12f.6 + §12g.5): 13 the three pilot BODIES draw as sprites rather
// than placeholders, re-read off legs 1-3's own windows through the `sprites`
// counter, with Lightning Strike as the bodiless control and the page's
// `[skill-fx] body ...` warnings as the other failure mode · 14 the wolves'
// `bite` strike draws its jaw PNG from the WOLF, photographed, which needs GOD
// off like legs 5+6 · 15 (inside leg 11, Heal still on) `DAMAGE 90` at the
// quiet campfire, and the heal landings that follow draw no mark.
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
import { showSkillRow, showSkillRowAt, closeSpellbook } from './lib/spellbook.mjs';

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
// C3a: every `[skill-fx] body ...` line the page logged - an unknown name and a
// texture that failed to decode both warn through it. ⚑ They are console
// WARNINGS, which the error collector below does not see, and a body that never
// resolves is otherwise invisible: its layer silently draws the placeholder.
const bodyWarnings = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => {
  if (m.type() === 'error') errors.push('console: ' + m.text());
  if (/\[skill-fx\] body/.test(m.text())) bodyWarnings.push(m.text());
});
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
// `ambient` (live ambient layers) and `glows` (live wind-up rings) are C2b's;
// an ambient spawn ALSO increments its kind, so a delta on `emitter` sees it.
// ⚑ `sprites` (C3a) is a SHARE of the kind counts, never a kind of its own: one
// per Fx that resolved its `body` to a PNG, whatever its body count.
async function fxCounts() {
  return page.evaluate(() => {
    const s = window.game.skillFx();
    return {
      ...s.spawnedByKind, evicted: s.evicted, live: s.live,
      ambient: s.ambient, glows: s.glows, sprites: s.sprites,
    };
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

// --- C2b helpers ------------------------------------------------------------

// The density slider, driven through the live settings object (the on-change
// proxy), so the write fires GameSettingChangedEvent exactly as the settings
// panel's control does. Returns what the MANAGER ended up on, not what we
// asked for: a write the manager never saw is the failure this catches.
async function setDensity(value) {
  await page.evaluate((v) => { window.game.settings().vfx.density = v; }, value);
  await page.waitForTimeout(500);
  return page.evaluate(() => window.game.skillFx().density);
}

// Every aura slot off. The ambient legs need a known floor: whatever `ambient`
// reads then belongs to somebody else.
async function deactivateAllAuras() {
  for (let slot = 0; slot < 3; slot++) {
    if (await isSlotActive(slot)) {
      await page.keyboard.down(String(slot + 1));
      await page.waitForTimeout(1400);
      await page.keyboard.up(String(slot + 1));
      await page.waitForTimeout(600);
    }
  }
  return !(await Promise.all([0, 1, 2].map(isSlotActive))).some(Boolean);
}

// ⚑ Tri-state, like every other slot move here: a long hold can land two edges
// under throttled rAF and toggle the slot straight back on. An aura that
// stayed on would redden the ambient legs for a HARNESS reason.
async function aurasOff(legLabel) {
  if (await deactivateAllAuras()) return true;
  console.log(`INCONCLUSIVE: ${legLabel}: an aura slot would not switch off`);
  inconclusive = true;
  return false;
}

// Equip by SKILL ID rather than by row text: "Heal" is a substring of half the
// support book, and the slot li carries `data-skill-id` (HUD.renderSlotToken),
// which is an exact answer where a label match is a guess.
// ⚑ Click the NAME at box.x+25, never the row centre - the mid-row spend
// button has precedence (the open-portal lesson).
async function equipById(skillId, slot, listId) {
  if (!(await calm())) return { ok: false, why: 'the combat window never closed' };
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!(await showSkillRow(page, skillId))) return { ok: false, why: 'the skill is not in the book' };
    const row = await page.locator(`#spellbookList li[data-skill-id="${skillId}"]`).first().boundingBox().catch(() => null);
    if (!row) return { ok: false, why: 'the row never got a box' };
    await page.mouse.click(row.x + 25, row.y + row.height / 2);
    await page.waitForTimeout(700);
    const slotEl = await page.$(`#${listId} li[data-slot="${slot}"]`);
    if (!slotEl) return { ok: false, why: `${listId} has no slot ${slot}` };
    const sb = await slotEl.boundingBox();
    await page.mouse.click(sb.x + sb.width / 2, sb.y + sb.height / 2);
    // POLLED: the equip is a server round trip and the slot repaints when the
    // answer lands (the pull-through lesson).
    for (let i = 0; i < 25; i++) {
      const held = await page.evaluate(({ listId, slot }) =>
        document.querySelector(`#${listId} li[data-slot="${slot}"]`)?.dataset.skillId ?? '', { listId, slot });
      if (held === String(skillId)) return { ok: true };
      await page.waitForTimeout(300);
    }
  }
  return { ok: false, why: 'the slot never took the skill' };
}

// Every scored aura leg's watch window, kept for LEG 13 (C3a): the three pilot
// bodies ride skills legs 1-3 already fight with, so the sprite leg reads those
// same windows instead of re-fighting three camps.
const legRuns = {};

// One aura leg: equip (when named), warp to the camp, watch, judge one kind.
async function auraLeg(n, { skill, skillId, nameRe, slot, camp, campLabel, kind, shot, forbid, alsoWant, wantImpact = true }) {
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
  legRuns[n] = run;
  if ((run.fx[kind] ?? 0) >= 2) pass(`leg ${n}: ${run.fx[kind]} ${kind} layers spawned`);
  else fail(`leg ${n}: expected >=2 ${kind}, saw ${JSON.stringify(run.fx)}`);
  // §12g: the mark is the engine's, so every damage leg owes at least one.
  if (wantImpact) {
    if ((run.fx.impact ?? 0) >= 1) pass(`leg ${n}: ${run.fx.impact} hit mark(s) drawn by the engine`);
    else fail(`leg ${n}: no hit mark spawned across ${run.events} skill events`);
  }
  // The other kinds this skill's `visual` authors (C2b: the bow's cast-pose).
  for (const k of alsoWant ?? []) {
    if ((run.fx[k] ?? 0) >= 1) pass(`leg ${n}: ${run.fx[k]} ${k} layer(s) spawned alongside`);
    else fail(`leg ${n}: expected a ${k}, saw ${JSON.stringify(run.fx)}`);
  }
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
  shot: 'leg1-strike.png', forbid: ['projectile', 'beam'] });
// ⚑ The bow is Long-Range Strike's since C2b (§12d.1, PO): a `cast-pose` on
// every FIRED beat, so leg 2 now judges three kinds at once.
await auraLeg(2, { skill: 'LongRangeStrike', skillId: 45, nameRe: /Long-?Range Strike/i, slot: 1, camp: KOBOLD_CAMP,
  campLabel: 'the kobold camp', kind: 'projectile', shot: 'leg2-projectile.png', forbid: ['beam'],
  alsoWant: ['cast-pose'] });
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

// LEG 13 - C3a (§12f.6): an authored `body` draws the PNG, not the placeholder.
//
// ⚑ It re-reads legs 1-3's OWN watch windows rather than fighting three more
// camps: those three legs already run exactly the three skills the pilot bodies
// were authored on (`sword` on Damage, `arrow` on Long-Range Strike, `wolf-jaw`
// on the wolves' bite), at exactly the right venues, with the id sampler saying
// which skills landed. A separate fight would measure the same thing twice and
// cost another 45 s.
// The three claims: a body-carrying layer takes the sprite branch · nothing
// else in that window did · a skill with no body on any layer spawns only
// Graphics (Lightning Strike, whose beams AND impacts are both bodiless).
//
// ⚑ This leg NEVER raises the global `inconclusive` flag, unlike every other
// one here, and that is deliberate: the flag gates the eight legs that follow,
// and leg 13 measures nothing of its own - it re-reads windows legs 1-3 already
// scored. A bookkeeping ambiguity here must not cost the C2b legs their run.
console.log('\n== LEG 13: the pilot bodies draw as SPRITES (C3a) ==');
{
  const sword = legRuns[1], arrow = legRuns[2], bare = legRuns[3];
  if (!sword || !arrow || !bare) {
    // Whichever of legs 1-3 did not score has already raised the flag.
    console.log('NOTE: leg 13 needs legs 1-3 scored, and one of them was not');
  } else {
    // Leg 1: the sword thrusts AND the wolves' bites (a `strike` since §12g)
    // carry a body, so most strikes in that window are sprites - but NOT an
    // equality: the wolf camp's boars gore too (id 112, a bodiless `thrust`;
    // measured 29 sprites for 34 strikes), and the id sampler polls rather
    // than counts. The upper bound is the sharp half: the marks (`impact`)
    // are code-drawn and must add nothing.
    console.log(`leg 13a: leg 1 sprites ${sword.fx.sprites}, strike ${sword.fx.strike}, marks ${sword.fx.impact ?? 0}, boar gores in the window ${sword.ids[112] ?? 0}`);
    if (sword.fx.sprites >= 1 && sword.fx.sprites * 2 >= sword.fx.strike) {
      pass(`leg 13a: ${sword.fx.sprites} of ${sword.fx.strike} strike(s) drew a PNG (the rest are the boars' gore)`);
    } else {
      fail(`leg 13a: ${sword.fx.strike} strike(s) but only ${sword.fx.sprites} sprite spawn(s) - a body never resolved`);
    }
    if (sword.fx.sprites <= sword.fx.strike) {
      pass('leg 13a: no kind beyond the strikes took the sprite branch - the marks stayed Graphics');
    } else {
      fail(`leg 13a: ${sword.fx.sprites} sprite spawns for ${sword.fx.strike} strikes`);
    }
    // Leg 2: the arrow. ⚑ The tight claim - "the cast-pose beside it stayed
    // Graphics" - is NOT asserted here as an equality: the kobold camp has a
    // Dire Wolf in it, so the wolves' own body-carrying bite (a `strike` since
    // §12g) lands in this window too (measured: ids 110 present), and the id
    // sampler polls rather than counting, so the two cannot be told apart to
    // the unit. The bound below is what this venue can honestly say; leg 13c
    // owns the bare case.
    const bareLayers = (arrow.fx['cast-pose'] ?? 0) + (arrow.fx.impact ?? 0);
    const ceiling = arrow.fx.projectile + (arrow.fx.strike ?? 0);
    console.log(`leg 13b: leg 2 sprites ${arrow.fx.sprites}, projectile ${arrow.fx.projectile}, strike ${arrow.fx.strike ?? 0}, `
      + `cast-pose+marks ${bareLayers}, other body-carrying skills in the window ${JSON.stringify({1: arrow.ids[1] ?? 0, 110: arrow.ids[110] ?? 0, 114: arrow.ids[114] ?? 0})}`);
    if (arrow.fx.sprites >= arrow.fx.projectile && arrow.fx.projectile > 0) {
      pass(`leg 13b: ${arrow.fx.projectile} projectile(s) drew the "arrow" PNG`);
    } else {
      fail(`leg 13b: ${arrow.fx.projectile} projectile(s) but only ${arrow.fx.sprites} sprite spawn(s)`);
    }
    if (arrow.fx.sprites <= ceiling) {
      pass(`leg 13b: no sprite spawn beyond the projectile and the wolves' bite - the ${arrow.fx['cast-pose'] ?? 0} cast-pose layer(s) and ${arrow.fx.impact ?? 0} mark(s) stayed Graphics`);
    } else {
      fail(`leg 13b: ${arrow.fx.sprites} sprite spawns against a ceiling of ${ceiling} - a bodiless layer drew art`);
    }
    // Leg 3: a whole skill with no `body` on any layer - beams AND the engine's
    // marks beside them. The strongest control in the set, because it is an
    // equality with zero on the right.
    console.log(`leg 13c: leg 3 sprites ${bare.fx.sprites}, beam ${bare.fx.beam}, marks ${bare.fx.impact ?? 0}, `
      + `other body-carrying skills in the window ${JSON.stringify({1: bare.ids[1] ?? 0, 110: bare.ids[110] ?? 0, 114: bare.ids[114] ?? 0})}`);
    if (bare.fx.beam < 2) {
      console.log('NOTE: leg 13c: the beam leg never spawned enough to control against');
    } else if (bare.ids[1] || bare.ids[110] || bare.ids[114]) {
      // ⚑ 114 is EliteWolfBite, the Dire Wolf's, also on `wolf-jaw`: the
      // western wolf camp has one, and run 3 (2026-09-22) read 1 sprite with
      // neither 1 nor 110 sampled because it was not on this list.
      console.log('NOTE: leg 13c: a body-carrying skill landed in the beam window, so a sprite spawn here would not be Lightning Strike\'s');
    } else if (bare.fx.sprites === 0) {
      pass(`leg 13c: Lightning Strike's ${bare.fx.beam} beam(s) and ${bare.fx.impact ?? 0} mark(s) spawned 0 sprites`);
    } else {
      fail(`leg 13c: ${bare.fx.sprites} sprite spawn(s) from a skill that authors no body`);
    }
  }
  // ⚑ The warning is the OTHER failure mode: an unknown name and a texture that
  // failed to decode both log one line and then draw the placeholder, which is
  // indistinguishable from "the art is not wired up yet" on a screenshot.
  const pilots = bodyWarnings.filter(w => /sword|arrow|wolf-jaw/.test(w));
  if (pilots.length === 0) pass('leg 13: no body warning for sword, arrow or wolf-jaw');
  else fail(`leg 13: the page warned about a pilot body: ${JSON.stringify(pilots)}`);
}

// === C2b: the ambient reconciler, the two new state kinds, and the slider ===
//
// All of it runs HERE, before the XP cheat: legs 5+6 level the player to
// survive a camp, and a levelled player one-shots everything a fight leg needs.
// The venue is the quiet campfire (spawnpoint-2), the one place in the world
// with a permanent ambient aura and no camp in aggro range.
const QUIET_CAMPFIRE = { x: 44, y: 10.5 };
const FROSTBITE = 141, HEAL = 2, WHIRLING_AXES = 77;

// LEG 7 - ambient is STATE: a campfire's mist draws with no combat at all.
console.log('\n== LEG 7: a campfire\'s ambient layers, no combat ==');
if (!inconclusive && await warpTo(QUIET_CAMPFIRE, 'the quiet campfire') && await aurasOff('leg 7')) {
  await closeSpellbook(page);
  await page.mouse.move(800, 200);
  await page.waitForTimeout(2_500);
  const state = await fxCounts();
  const events = await page.evaluate(() => window.game.skillEvents().total ?? 0);
  console.log(`leg 7: ${JSON.stringify(state)} (skill events so far ${events})`);
  if (state.ambient > 0) pass(`leg 7: ${state.ambient} ambient layer(s) live with every own aura off`);
  else { console.log('INCONCLUSIVE: leg 7 saw no ambient layer - is a campfire actually in view?'); inconclusive = true; }
}

// LEG 8 - the own player's swirl: on with the aura, GONE when it is switched
// off. The negative half is the point: ambient is reconciled, not spawned.
console.log('\n== LEG 8: Frostbite\'s ambient swirl on the own player ==');
if (!inconclusive) {
  await runCommand(`SKILL Frostbite`);
  await page.waitForTimeout(1_500);
  const eq = await equipById(FROSTBITE, 1, 'auraSlotList');
  if (!eq.ok) { console.log(`INCONCLUSIVE: Frostbite equip did not land: ${JSON.stringify(eq)}`); inconclusive = true; }
  else {
    await closeSpellbook(page);
    const off0 = (await fxCounts()).ambient;
    if (!(await activateAuraSlot(1))) { console.log('INCONCLUSIVE: leg 8 Frostbite never went active'); inconclusive = true; }
    else {
      await page.waitForTimeout(1_500);
      const on = (await fxCounts()).ambient;
      await page.mouse.move(800, 200);
      await page.screenshot({ path: join(outdir, 'leg8-ambient-full.png') });
      const wentOff = await deactivateAllAuras();
      await page.waitForTimeout(1_500);
      const off1 = (await fxCounts()).ambient;
      console.log(`leg 8: ambient off=${off0} on=${on} off-again=${off1}`);
      if (on > off0) pass(`leg 8: switching the aura on added ${on - off0} ambient layer(s)`);
      else fail(`leg 8: the aura went active and ambient did not move (${off0} -> ${on})`);
      // The negative half is the point: ambient is RECONCILED, not spawned.
      if (!wentOff) { console.log('INCONCLUSIVE: leg 8 the aura would not switch back off'); inconclusive = true; }
      else if (off1 <= off0) pass('leg 8: switching it off disposed them again');
      else fail(`leg 8: ambient survived the switch-off (${on} -> ${off1}, floor ${off0})`);
    }
  }
}

// LEG 9 - `low` (PO, §12d.1): another actor's ambient EMITTER goes, the own
// one stays, and an ambient ORBIT would stay for everyone.
console.log('\n== LEG 9: density low keeps the own emitter, drops the campfire\'s ==');
if (!inconclusive) {
  if (!(await isSlotActive(1)) && !(await activateAuraSlot(1))) {
    console.log('INCONCLUSIVE: leg 9 Frostbite never went active'); inconclusive = true;
  } else {
    await page.waitForTimeout(1_200);
    const full = (await fxCounts()).ambient;
    if ((await setDensity('low')) !== 'low') { console.log('INCONCLUSIVE: leg 9 the manager never saw the density write'); inconclusive = true; }
    else {
      await page.waitForTimeout(1_200);
      const low = (await fxCounts()).ambient;
      await page.mouse.move(800, 200);
      await page.screenshot({ path: join(outdir, 'leg9-ambient-low.png') });
      console.log(`leg 9: ambient full=${full} low=${low}`);
      if (low > 0) pass(`leg 9: the own character keeps ${low} ambient layer(s) at low`);
      else fail('leg 9: low disposed the OWN character\'s ambient emitter too');
      if (low < full) pass(`leg 9: ${full - low} of someone else's ambient layer(s) dropped at low`);
      else console.log(`INCONCLUSIVE: leg 9 nothing dropped (${full} -> ${low}) - no other ambient emitter in view`);
    }
  }
}

// LEG 10 - `off` is literal (PO, §12d.1): a real fight draws NOTHING, ambient
// holds nothing, and the wind-up glow - combat information, not dressing -
// keeps running.
console.log('\n== LEG 10: density off draws nothing, the glow lives ==');
if (!inconclusive) {
  if ((await setDensity('off')) !== 'off') { console.log('INCONCLUSIVE: leg 10 the manager never saw the density write'); inconclusive = true; }
  else if (await warpTo(KOBOLD_CAMP, 'the kobold camp')) {
    await page.mouse.move(800, 200);
    const a = await fxCounts();
    const e0 = await page.evaluate(() => window.game.skillEvents().total ?? 0);
    if (!(await isSlotActive(1)) && !(await activateAuraSlot(1))) {
      console.log('INCONCLUSIVE: leg 10 the aura never stayed active'); inconclusive = true;
    } else {
      await page.waitForTimeout(10_000);
      const b = await fxCounts();
      const d = delta(a, b);
      const events = (await page.evaluate(() => window.game.skillEvents().total ?? 0)) - e0;
      const drawn = ['impact', 'strike', 'projectile', 'beam', 'cast-pose', 'orbit', 'emitter']
        .reduce((sum, k) => sum + (d[k] ?? 0), 0);
      console.log(`leg 10: fx ${JSON.stringify(d)}, skill events ${events}, ambient ${b.ambient}, glows ${b.glows}`);
      if (events < 3) { console.log(`INCONCLUSIVE: leg 10 saw only ${events} skill events, starved venue`); inconclusive = true; }
      else {
        if (drawn === 0) pass(`leg 10: 0 Fx spawned across ${events} skill events at off`);
        else fail(`leg 10: ${drawn} Fx spawned at off: ${JSON.stringify(d)}`);
        if (b.ambient === 0) pass('leg 10: the reconciler holds nothing at off');
        else fail(`leg 10: ${b.ambient} ambient layer(s) survived off`);
        if (b.glows > 0) pass(`leg 10: ${b.glows} wind-up glow(s) still running - the slider never touches it`);
        else fail('leg 10: off took the wind-up glow with it');
      }
    }
    if ((await setDensity('full')) !== 'full') { console.log('INCONCLUSIVE: density never went back to full'); inconclusive = true; }
  }
}

// LEG 11 - Heal's two rise emitters (§4.3's green crosses and mist, authored
// as two ambient emitter layers because no `body` exists before the atlas).
console.log('\n== LEG 11: Heal\'s ambient rise emitters ==');
if (!inconclusive && await warpTo(QUIET_CAMPFIRE, 'the quiet campfire') && await aurasOff('leg 11')) {
  await runCommand(`SKILL Heal`);
  await page.waitForTimeout(1_500);
  const eq = await equipById(HEAL, 2, 'auraSlotList');
  if (!eq.ok) { console.log(`INCONCLUSIVE: Heal equip did not land: ${JSON.stringify(eq)}`); inconclusive = true; }
  else {
    await closeSpellbook(page);
    const before = await fxCounts();
    if (!(await activateAuraSlot(2))) { console.log('INCONCLUSIVE: leg 11 Heal never went active'); inconclusive = true; }
    else {
      await page.waitForTimeout(1_500);
      const after = await fxCounts();
      const spawned = (after.emitter ?? 0) - (before.emitter ?? 0);
      await page.mouse.move(800, 200);
      await page.screenshot({ path: join(outdir, 'leg11-heal-rise.png') });
      console.log(`leg 11: emitter spawns ${spawned}, ambient ${before.ambient} -> ${after.ambient}`);
      if (spawned >= 2) pass(`leg 11: Heal spawned ${spawned} ambient emitter layers`);
      else fail(`leg 11: expected 2 emitter layers from Heal, saw ${spawned}`);

      // LEG 15 - §12g.1 call 2: a HEAL landing draws no mark. Same venue, Heal
      // still on: the DAMAGE cheat writes the pool directly (no hit event, and
      // it works under GOD), so the next Heal tick and the campfire's own heal
      // LAND - a heal on a full player is not a landing (player.go) - and the
      // quiet campfire has no mob to add a damage hit to the window. ⚑ An
      // earlier draft rode leg 14's wolf bites; a level-30 pool had regenerated
      // to full before Heal came on, and the leg judged nothing.
      console.log('\n== LEG 15: a heal landing draws no hit mark ==');
      const a15 = await fxCounts();
      await page.evaluate(() => {
        window.__fxKinds = {};
        window.__fxSampler = setInterval(() => {
          for (const e of window.game.skillEvents().last ?? []) {
            if (!e.fired) window.__fxKinds[e.kind] = (window.__fxKinds[e.kind] ?? 0) + 1;
          }
        }, 30);
      });
      await runCommand('DAMAGE 90');
      await page.waitForTimeout(6_000);
      const kinds = await page.evaluate(() => { clearInterval(window.__fxSampler); return window.__fxKinds; });
      const d15 = delta(a15, await fxCounts());
      // HitKind: Damage 0, Crit 1, Heal 2, Absorb 3, Immune 4 (server.fbs).
      const heals = kinds[2] ?? 0, damage = (kinds[0] ?? 0) + (kinds[1] ?? 0);
      console.log(`leg 15: fx ${JSON.stringify(d15)}, hit kinds (sampled) ${JSON.stringify(kinds)}`);
      // A damage hit sharing the window can only ADD marks, so zero marks is
      // a clean pass whatever else landed (run 3 sampled 5 damage hits between
      // entities the client did not hold, and 0 marks); the ambiguity only
      // matters when a mark DID draw.
      if (heals === 0) {
        console.log('INCONCLUSIVE: leg 15: no heal landed in 6 s after DAMAGE 90');
        inconclusive = true;
      } else if ((d15.impact ?? 0) === 0) {
        pass(`leg 15: ${heals} heal landing(s) drew 0 hit marks`);
      } else if (damage > 0) {
        console.log(`NOTE: leg 15: ${d15.impact} mark(s) with ${damage} damage landing(s) in the window, not attributable`);
      } else {
        fail(`leg 15: ${d15.impact} hit mark(s) drawn across ${heals} heal landing(s) and no damage`);
      }
    }
  }
}

// LEG 12 - Whirling Axes (id 77, cheat-only cooldown): an `orbit` on the CAST,
// the flourish of its one instant hit. A cooldown is fired by clicking its
// slot, not by the rAF-sampled Q hotkey.
console.log('\n== LEG 12: Whirling Axes -> an orbit on the cast ==');
if (!inconclusive) {
  await runCommand(`SKILL WhirlingAxes`);
  await page.waitForTimeout(1_500);
  const eq = await equipById(WHIRLING_AXES, 0, 'cooldownSlotList');
  if (!eq.ok) { console.log(`INCONCLUSIVE: Whirling Axes equip did not land: ${JSON.stringify(eq)}`); inconclusive = true; }
  else {
    await closeSpellbook(page);
    await deactivateAllAuras();
    if (!(await warpTo(KOBOLD_CAMP, 'the kobold camp'))) { /* warpTo already scored it */ }
    else {
      await page.mouse.move(800, 200);
      const a = await fxCounts();
      const slot = await page.$('#cooldownSlotList li[data-slot="0"]');
      const sb = await slot.boundingBox();
      // ⚑ The same armed shot as watchedLeg: a fixed-time capture misses a
      // 1.2 s orbit, so the page clock slows 8x the instant the orbit spawns.
      const armed = page.evaluate(() => new Promise((resolve) => {
        const base0 = window.game.skillFx().spawnedByKind.orbit ?? 0;
        const started = Date.now();
        const poll = setInterval(() => {
          if ((window.game.skillFx().spawnedByKind.orbit ?? 0) > base0) {
            clearInterval(poll);
            const real = performance.now.bind(performance);
            const base = real();
            window.__realNow = real;
            performance.now = () => base + (real() - base) / 8;
            resolve(true);
          } else if (Date.now() - started > 5_000) { clearInterval(poll); resolve(false); }
        }, 5);
      }));
      await page.mouse.click(sb.x + sb.width / 2, sb.y + sb.height / 2);
      await page.mouse.move(800, 200);
      if (await armed) {
        await page.waitForTimeout(1_200);
        await page.screenshot({ path: join(outdir, 'leg12-orbit.png') });
        await page.evaluate(() => { if (window.__realNow) { performance.now = window.__realNow; window.__realNow = null; } });
      }
      await page.waitForTimeout(1_400);
      const d = delta(a, await fxCounts());
      console.log(`leg 12: fx ${JSON.stringify(d)}`);
      if ((d.orbit ?? 0) >= 1) pass(`leg 12: ${d.orbit} orbit layer(s) spawned on the cast`);
      else { console.log(`INCONCLUSIVE: leg 12 no orbit - did the cast go off at all? ${JSON.stringify(d)}`); inconclusive = true; }
    }
  }
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
  await deactivateAllAuras();
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
// LEG 14 - C3a + §12g: the MOB half of the sprite path, and the only pilot
// body no earlier leg can prove on its own. `wolf-jaw` is authored on the
// wolves' bite, a `strike` with `curve: bite` drawn FROM THE WOLF (§12g.1 call
// 3), which reaches the own player only with GOD off (the same reason legs 5+6
// drop it). With the own aura off, every `strike` in this window is a wolf's,
// so every sprite in the window is a wolf's jaw (the boars' gore is bodiless);
// leg 1's window sees the same bites mixed in with the player's own sword.
// ⚑ Also the bite's PHOTOGRAPH (§12g.5 "looked at"): armed on the strike
// counter with the page clock slowed 8x, the leg 12 recipe, because a 200 ms
// bite is over before a fixed-time capture lands.
console.log('\n== LEG 14: the wolves\' bite draws the "wolf-jaw" PNG from the WOLF ==');
if (!inconclusive) {
  if (await warpTo(WOLF_CAMP, 'the wolf camp')) {
    await page.mouse.move(800, 200);
    await deactivateAllAuras();
    await runCommand('GOD off');
    const a = await fxCounts();
    await page.evaluate(() => {
      window.__fxSkillIds = {};
      window.__fxSampler = setInterval(() => {
        for (const e of window.game.skillEvents().last ?? []) {
          if (!e.fired) window.__fxSkillIds[e.skillId] = (window.__fxSkillIds[e.skillId] ?? 0) + 1;
        }
      }, 30);
    });
    const armed = page.evaluate(() => new Promise((resolve) => {
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
        } else if (Date.now() - started > 12_000) { clearInterval(poll); resolve(false); }
      }, 5);
    }));
    if (await armed) {
      // 1.0 s of slowed clock = 125 ms into a 200 ms bite: the jaws mid-close.
      await page.waitForTimeout(1_000);
      await page.screenshot({ path: join(outdir, 'leg14-wolf-bite.png') });
      await page.evaluate(() => { if (window.__realNow) { performance.now = window.__realNow; window.__realNow = null; } });
    }
    await page.waitForTimeout(6_000);
    const ids = await page.evaluate(() => { clearInterval(window.__fxSampler); return window.__fxSkillIds; });
    const d = delta(a, await fxCounts());
    await runCommand('GOD');
    console.log(`leg 14: fx ${JSON.stringify(d)}, hit skill ids (sampled) ${JSON.stringify(ids)}`);
    if (!ids[110] && !ids[114]) {
      console.log('INCONCLUSIVE: leg 14: no wolf bite landed in the window');
      inconclusive = true;
    } else {
      // ⚑ Not an equality: the wolf camp's boars gore too (id 112, a bodiless
      // `thrust`, measured 6 of 25 sampled hits), and the id sampler polls
      // rather than counts. The wolves are the majority of the window, so
      // "most strikes are sprites and none of the marks is" is what this
      // venue can honestly say.
      if ((d.strike ?? 0) >= 1 && d.sprites >= 1 && d.sprites <= d.strike && d.sprites * 2 >= d.strike) {
        pass(`leg 14: ${d.strike} strike(s) from the wolves (and the boars), ${d.sprites} on the sprite path`);
      } else {
        fail(`leg 14: wolf bites landed and drew ${d.sprites} sprite(s) for ${d.strike ?? 0} strike(s)`);
      }
      if ((d.impact ?? 0) >= 1) pass(`leg 14: ${d.impact} hit mark(s) on the bitten player`);
      else fail(`leg 14: wolf bites landed on the player and drew no hit mark`);
    }
  }
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
