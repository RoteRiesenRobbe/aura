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
// bite draws its `wolf-jaw` PNG (a `maul` on the bitten since natural weapons
// C2), photographed, which needs GOD off like legs 5+6 · 15 (inside leg 11,
// Heal still on) `DAMAGE 90` at the quiet campfire, and the heal landings that
// follow draw no mark.
//
// C3a-ii legs (§12h, PO 2026-09-23: an over-time effect draws on APPLICATION,
// the rim bite, cooldown waves). The wire now carries `phase` (Direct 0,
// Applied 1, Tick 2) on every skill event, counted EXACTLY by an in-page
// sampler that reads `skillEvents().last` only when `total` moved (the older
// samplers poll and double-count; they only say which ids landed).
// (14 measured the rim bite's geometry here until natural weapons C2 retired
// it; it measures the maul's now) · 16 the venom spiders: the spit is an
// `applied` projectile, the ticks draw the mark alone · 17 the giant spiders:
// the white `spider-fang` sprites on `hit` beside the applied spit,
// photographed · 18 the pyromancer: its new `damage_aura` lands Direct hits
// (the beam) beside the Applied ember burst · 19 Shockwave: one `wave` per
// cast. Legs 16-18 bound every per-kind count by what the AUTHORED layers of
// the skills that actually landed allow (`plannedBound`, read from api/skills),
// because the counters are per kind, not per skill, and every venue has
// neighbours (pools spit projectiles, spiders bite).
//
// Natural weapons C1 (docs/archive/plan-natural-weapons.md §3.1, §7 "New skill-fx.mjs
// legs", PO ruling D9): the `lunge`, the eighth kind, draws NOTHING and moves
// the attacker's token (portrait, tier frame, species border) toward the
// victim and back. It is read through three surfaces: `spawnedByKind.lunge`,
// `lungeNudges` (non-zero body offsets the manager wrote, monotonic) and the
// dev console's `bodyOffsets()` (every held token NOT at exactly (0, 0), read
// off the real node). 20 sits right after leg 14 at the wolf camp, levelled,
// GOD off: 20a a real fight at density `full` jabs (the counters rose, a real
// token moved, and a jab of a standing wolf left its group's position
// bit-identical) · 20b the fight over, every body is home at EXACT zero ·
// 20c density `off`: the jab still plays, nothing else spawns, `live` stays 0.
// A probe inside every window holds the L2 invariant: whenever
// `skillFx().lunges === 0`, `bodyOffsets()` is empty, read in ONE task.
// ⚑ L8: since C1 the boar, alpha boar, bear, stag and companion draw no
// `strike` at all (their borrowed spear and blade are gone, a `lunge` alone),
// so the boars at the wolf camp no longer thin legs 13a and 14's sprite share.
// Wolves, rats and spiders drew their `strike` bite beside the lunge until C2.
// 17 also asserts the giant spider's lunge beside its spit and fangs.
// ⚑ L6: a 220 ms jab is never sampled from outside the page; every lunge
// assertion reads counters that count at WRITE time, or an in-page probe.
//
// Natural weapons C2 (docs/archive/plan-natural-weapons.md §3.3, PO rulings D10 +
// D11): the `maul`, the ninth kind, the natural weapon's mark drawn ON the
// victim, screen-aligned. It took `bite` and `pincer` from the `strike`, so no
// mob at the wolf camp draws a strike any more: wolves maul `bite` (the
// `wolf-jaw` PNG, now the front-view upper row of teeth), boars maul `gore`
// (code-drawn), and the giant spider mauls `pincer` (`spider-fang`). The
// rim-bite jaw probe is replaced by a MAUL probe that reads the live rows and
// fangs at the own player in the player's own size units: 14 (rewritten) a
// wolf bite spawns one `maul` and one engine mark per landing, the rows sit
// centred on the player, never turned, the upper row above and the mirrored
// lower one below · 17 the fangs hinge on the player's rim at screen left and
// right and gape toward the top. ⚑ L8: legs 13a, 13b, 14 and 17 bound their
// sprite shares by strikes PLUS mauls now, re-derived from api/skills. The
// "at the contact moment" half is the planner's (SkillFxPlan.test.ts); a
// headless frame (~300 ms) is too coarse to time a 77 ms delay from here.
//
// ⛔ Needs the DEBUG zone set (`./scripts/dev-restart.sh server debug`): every
// venue below is a position in api/zones/.debug/world_debug.json. The rebuilt
// 500x500 main world (06e5c476) has no camp at any of them, and a run against
// it lands on empty grass: leg 1 reads 0 skill events and goes INCONCLUSIVE,
// which gates every leg after it.
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
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
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
// An inconclusive that must NOT gate the legs after it (leg 20b's settle): it
// only colours the final RESULT line.
let lateInconclusive = false;
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
// ⚑ `lunges` (live jabs) and `lungeNudges` (non-zero body offsets written,
// monotonic) are natural weapons C1's; a lunge is NOT in `live`.
async function fxCounts() {
  return page.evaluate(() => {
    const s = window.game.skillFx();
    return {
      ...s.spawnedByKind, evicted: s.evicted, live: s.live,
      ambient: s.ambient, glows: s.glows, sprites: s.sprites,
      lunges: s.lunges, lungeNudges: s.lungeNudges,
    };
  });
}
function delta(a, b) {
  const d = {};
  for (const k of Object.keys(b)) d[k] = (b[k] ?? 0) - (a[k] ?? 0);
  return d;
}
// Every field of fxCounts() that is NOT a per-kind spawn count.
const NOT_KINDS = new Set(['evicted', 'live', 'ambient', 'glows', 'sprites', 'lunges', 'lungeNudges']);
// The spawns of every kind in a delta, `except` the kinds named. Derived from
// the counters, not a hand list, so a kind added later is counted too.
function spawnsIn(d, except = []) {
  return Object.entries(d)
    .filter(([k]) => !NOT_KINDS.has(k) && !except.includes(k))
    .reduce((n, [, v]) => n + (v ?? 0), 0);
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
  // + `lunge` and `maul` (natural weapons C1, C2): event-driven like the
  // four. Not every kind: an AMBIENT spawn increments its kind too, and needs
  // no event.
  const n = (d.strike ?? 0) + (d.impact ?? 0) + (d.projectile ?? 0) + (d.beam ?? 0) + (d.lunge ?? 0) + (d.maul ?? 0);
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

// --- C3a-ii helpers (§12h) ----------------------------------------------------

// The authored layers of every skill, straight off disk: the harness's copy of
// WHAT a skill may draw, so a per-kind counter can be bounded by the skills
// that actually landed in the window. ⚑ It reads the repo's api/, which is what
// the server runs under `-content ../api` (the verify skill's boot line).
const API_SKILLS = join(dirname(fileURLToPath(import.meta.url)), '../../../api/skills');
const layersById = {};
for (const dir of [API_SKILLS, join(API_SKILLS, 'mobs')]) {
  for (const f of readdirSync(dir).filter(f => f.endsWith('.json'))) {
    const d = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    layersById[d.id] = d.visual?.layers ?? [];
  }
}

// HitKind: Damage 0, Crit 1, Heal 2, Absorb 3, Immune 4 · HitPhase: Direct 0,
// Applied 1, Tick 2 (server.fbs).
const PHASE = { direct: 0, applied: 1, tick: 2 };

// An EXACT event census, in-page: `last` is processed only when `total`
// moved, and a snapshot that slipped between two polls shows up as a gap
// (total advanced by more than `last` holds). Keyed `skillId|phase|kind|fired`.
async function startCensus() {
  await page.evaluate(() => {
    const c = { counts: {}, sources: {}, gaps: 0, prev: window.game.skillEvents().total ?? 0 };
    window.__census = c;
    c.timer = setInterval(() => {
      const ev = window.game.skillEvents();
      const total = ev.total ?? 0;
      if (total === c.prev) return;
      const last = ev.last ?? [];
      if (total - c.prev > last.length) c.gaps++;
      for (const e of last) {
        const k = `${e.skillId}|${e.phase ?? 0}|${e.kind}|${e.fired ? 1 : 0}`;
        c.counts[k] = (c.counts[k] ?? 0) + 1;
        const sk = `${e.skillId}|${e.phase ?? 0}`;
        (c.sources[sk] ??= {})[e.source] = true;
      }
      c.prev = total;
    }, 4);
  });
}
async function stopCensus() {
  return page.evaluate(() => {
    clearInterval(window.__census.timer);
    const c = window.__census;
    const sources = {};
    for (const [k, set] of Object.entries(c.sources)) sources[k] = Object.keys(set).length;
    return { counts: c.counts, sources, gaps: c.gaps };
  });
}
function censusRows(census) {
  return Object.entries(census.counts).map(([k, n]) => {
    const [skillId, phase, kind, fired] = k.split('|').map(Number);
    return { skillId, phase, kind, fired: fired === 1, n };
  });
}
// How many events of one skill in one phase (fired events excluded).
function countOf(census, skillId, phase, kinds) {
  return censusRows(census)
    .filter(r => r.skillId === skillId && r.phase === phase && !r.fired && (!kinds || kinds.includes(r.kind)))
    .reduce((n, r) => n + r.n, 0);
}
// The most Fx of one kind the AUTHORED layers allow for the events counted:
// a fired event plays `fired` layers, a Direct landing `hit` layers, an
// Applied one `applied` layers, and a Tick NONE (§12h, the planner rule). With
// `ticksDraw` it is the bound a planner that still drew on ticks would have,
// which is what makes a projectile count discriminating. `bodied` counts only
// layers that name a body (the `sprites` counter's share).
function plannedBound(census, kind, { ticksDraw = false, bodied = false } = {}) {
  let n = 0;
  for (const r of censusRows(census)) {
    const trigger = r.fired ? 'fired'
      : r.phase === PHASE.applied ? 'applied'
        : r.phase === PHASE.tick ? (ticksDraw ? 'hit' : null) : 'hit';
    if (!trigger) continue;
    const layers = (layersById[r.skillId] ?? []).filter(l => l.kind === kind && l.on === trigger && (!bodied || l.body));
    n += layers.length * r.n;
  }
  return n;
}

// A bound that survives census GAPS (the headless page can stall past several
// snapshots, and a slipped snapshot's events are lost to the census): every
// distinct caster seen applying `skillId` can refresh it at most once per
// aura beat, so applications <= casters x (window / beat) + casters. Casters
// are counted from the events that WERE seen, so a caster whose every event
// slipped is missed; that is why this is printed beside the exact bound, not
// instead of it.
function cadenceBound(census, skillId, phase, windowMs, beatTicks) {
  const casters = census.sources[`${skillId}|${phase}`] ?? 0;
  // +2 per caster, not +1: the counter window opens a little before the
  // census and closes a little after it (a runCommand and two page reads),
  // and run 5 measured 9 spits against a +1 bound of exactly 9. A per-TICK
  // spit would roughly double the count, so the slack costs no discrimination.
  return { casters, bound: casters * (Math.floor(windowMs / (beatTicks * 1000 / 30)) + 2) };
}

// The live maul bodies at the own player (plan-natural-weapons.md §3.3, D10),
// read off the scene: a row of teeth (`bite`) is the only sprite anchored at
// (0.5, 1), a fang (`pincer`) the only one at (0, 1). Kept per sample in units
// of the PLAYER's size, which is the maul's size rule at scale 1: where the
// anchor sits relative to the player's centre, the body's rotation, whether it
// is drawn mirrored, and its drawn width. Bodies far from the player belong to
// a fight between other actors and are skipped. Code-drawn marks (the gore,
// the rat's teeth) are Graphics, not sprites, and are not read here.
async function startMaulProbe() {
  await page.evaluate(() => {
    let n = window.__auraRoot;
    while (n.parent && n.label !== 'cameraGroup') n = n.parent;
    const layer = (n.children ?? []).find(c => c.label === 'skillFx');
    const probe = { rows: [], fangs: [], layer: !!layer };
    window.__mauls = probe;
    if (!layer) return;
    probe.timer = setInterval(() => {
      const ch = window.game.character;
      const size = ch.size;
      const at = layer.toLocal(ch.shape.getGlobalPosition());
      const walk = (node) => {
        for (const c of node.children ?? []) {
          walk(c);
          if (!c.visible || !c.anchor || !c.texture || !(c.alpha > 0) || c.anchor.y !== 1) continue;
          const list = c.anchor.x === 0.5 ? probe.rows : c.anchor.x === 0 ? probe.fangs : null;
          const dx = (c.x - at.x) / size, dy = (c.y - at.y) / size;
          if (!list || Math.hypot(dx, dy) > 3 || list.length >= 400) continue;
          list.push({ dx, dy, rot: c.rotation, mirrored: c.scale.y < 0, width: Math.abs(c.scale.x) * c.texture.width / size });
        }
      };
      walk(layer);
    }, 10);
  });
}
async function stopMaulProbe() {
  return page.evaluate(() => {
    const p = window.__mauls;
    if (p.timer) clearInterval(p.timer);
    return { layer: p.layer, rows: p.rows, fangs: p.fangs };
  });
}
function range(samples, f) {
  if (!samples.length) return null;
  const v = samples.map(f);
  return [+Math.min(...v).toFixed(3), +Math.max(...v).toFixed(3)];
}
function maulSummary(samples) {
  const upper = samples.filter(s => !s.mirrored), lower = samples.filter(s => s.mirrored);
  return {
    n: samples.length, upper: upper.length, lower: lower.length,
    dx: range(samples, s => s.dx), rot: range(samples, s => s.rot), width: range(samples, s => s.width),
    upperDy: range(upper, s => s.dy), lowerDy: range(lower, s => s.dy),
    upperDx: range(upper, s => s.dx), lowerDx: range(lower, s => s.dx),
    upperRot: range(upper, s => s.rot), lowerRot: range(lower, s => s.rot),
  };
}

// Arm a screenshot on a counter (`spawnedByKind[key]`, or `sprites`) and slow
// the page clock 8x from that instant (the C2a recipe). Returns the promise.
function armShot(key, timeout) {
  return page.evaluate(({ key, timeout }) => new Promise((resolve) => {
    const read = () => {
      const s = window.game.skillFx();
      return key === 'sprites' ? s.sprites : (s.spawnedByKind[key] ?? 0);
    };
    const base0 = read();
    const started = Date.now();
    const poll = setInterval(() => {
      if (read() > base0) {
        clearInterval(poll);
        const real = performance.now.bind(performance);
        const base = real();
        window.__realNow = real;
        performance.now = () => base + (real() - base) / 8;
        resolve(true);
      } else if (Date.now() - started > timeout) { clearInterval(poll); resolve(false); }
    }, 5);
  }), { key, timeout });
}
// The same frame, cropped around the own player: the bite and the fangs are
// ~40 px things on a 1600 px frame. Taken under the slowed clock, right after
// the full shot.
async function closeUp(shot) {
  const at = await page.evaluate(() => {
    const g = window.game.character.shape.getGlobalPosition();
    return { x: g.x, y: g.y };
  });
  const w = 280, h = 220;
  const x = Math.max(0, Math.min(1600 - w, Math.round(at.x - w / 2)));
  const y = Math.max(0, Math.min(900 - h, Math.round(at.y - h / 2)));
  await page.screenshot({ path: join(outdir, shot.replace('.png', '-closeup.png')), clip: { x, y, width: w, height: h } });
}
async function playerAlive() {
  return page.evaluate(() => {
    const s = window.game.character?.shape;
    return !!s && !s.destroyed && s.parent !== null;
  });
}
// There is no heal cheat, and every GOD-off leg drains the pool (a level-30
// player died to the trolls after three spider/bandit windows, run 3, and at
// the bandit camp after the trolls, run 4). So before each GOD-off mob leg the
// player rests at the quiet campfire, GOD on, until the HUD's Focus bar reads
// >= 95 % (or 45 s pass: a partial pool is still better than none).
async function restUp(label) {
  if (!(await warpTo({ x: 44, y: 10.5 }, `the quiet campfire (rest before ${label})`))) return false;
  const read = () => page.evaluate(() => {
    const m = /(\d+)\/(\d+)/.exec(document.querySelector('#healthBar .barText')?.textContent ?? '');
    return m ? { hp: +m[1], max: +m[2] } : null;
  });
  const before = await read();
  const t0 = Date.now();
  let now = before;
  while (Date.now() - t0 < 45_000) {
    now = await read();
    if (now && now.hp >= now.max * 0.95) break;
    await page.waitForTimeout(1_000);
  }
  console.log(`(rest before ${label}: Focus ${before ? `${before.hp}/${before.max}` : '?'} -> ${now ? `${now.hp}/${now.max}` : '?'} in ${Math.round((Date.now() - t0) / 1000)} s)`);
  return true;
}
async function restoreClock() {
  await page.evaluate(() => { if (window.__realNow) { performance.now = window.__realNow; window.__realNow = null; } });
}

// One C3a-ii mob leg: warp, own auras off, GOD off for the armed window only
// (GOD short-circuits the player's takeDamage AND a god player is never the
// victim of an event), census + optional maul probe + an armed shot.
async function mobPhaseLeg(n, spot, label, { ms = 14_000, shot, armOn, shotDelay = 500, mauls = false }) {
  if (inconclusive) return null;
  if (!(await restUp(`leg ${n}`))) return null;
  if (!(await warpTo(spot, label))) return null;
  await page.mouse.move(800, 200);
  await deactivateAllAuras();
  await runCommand('GOD off');
  const a = await fxCounts();
  await startCensus();
  if (mauls) await startMaulProbe();
  const t0 = Date.now();
  if (shot) {
    const armed = await armShot(armOn, Math.min(12_000, ms - 2_000));
    if (armed) {
      await page.waitForTimeout(shotDelay);
      await page.screenshot({ path: join(outdir, shot) });
      await closeUp(shot);
      await restoreClock();
    } else {
      console.log(`NOTE: leg ${n}: nothing armed the shot (${armOn}) within 12 s`);
    }
  }
  await page.waitForTimeout(Math.max(0, ms - (Date.now() - t0)));
  const census = await stopCensus();
  const maulRun = mauls ? await stopMaulProbe() : null;
  const fx = delta(a, await fxCounts());
  await runCommand('GOD');
  console.log(`leg ${n}: fx ${JSON.stringify(fx)}`);
  // ⚑ A dead client never re-points `window.game.character`, so every later
  // warp check would read a corpse: stop the mob legs here, loudly.
  if (!(await playerAlive())) {
    console.log(`INCONCLUSIVE: leg ${n}: the player DIED in the window (${label}); the legs after it cannot run`);
    inconclusive = true;
  }
  console.log(`leg ${n}: census (skillId|phase|kind|fired) ${JSON.stringify(census.counts)}, gaps ${census.gaps}`);
  return { fx, census, mauls: maulRun };
}

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
    // Leg 1: the sword's strikes carry a body, and so do the wolves' bites
    // (a `maul` on the bitten since natural weapons C2, `wolf-jaw`); the
    // boars' gore is a bodiless `maul`, so the maul half is only partly
    // sprites. The lower bound is on the strikes alone (every strike in this
    // window is the sword's, unless a wandering weapon-wielder joins), and the
    // upper bound is the sharp half: strikes plus mauls are the only bodied
    // spawns, and the marks (`impact`) are code-drawn and must add nothing.
    const bodiedA = (sword.fx.strike ?? 0) + (sword.fx.maul ?? 0);
    console.log(`leg 13a: leg 1 sprites ${sword.fx.sprites}, strike ${sword.fx.strike ?? 0}, maul ${sword.fx.maul ?? 0}, marks ${sword.fx.impact ?? 0}, wolf bites sampled ${(sword.ids[110] ?? 0) + (sword.ids[114] ?? 0)}, boar gores sampled ${sword.ids[112] ?? 0}`);
    if (sword.fx.sprites >= 1 && sword.fx.sprites * 2 >= (sword.fx.strike ?? 0)) {
      pass(`leg 13a: ${sword.fx.sprites} sprite spawn(s) for ${sword.fx.strike ?? 0} strike(s) and ${sword.fx.maul ?? 0} maul(s) - the bodies resolved`);
    } else {
      fail(`leg 13a: ${sword.fx.strike ?? 0} strike(s) but only ${sword.fx.sprites} sprite spawn(s) - a body never resolved`);
    }
    if (sword.fx.sprites <= bodiedA) {
      pass('leg 13a: no kind beyond the strikes and the mauls took the sprite branch - the marks stayed Graphics');
    } else {
      fail(`leg 13a: ${sword.fx.sprites} sprite spawns for ${bodiedA} strikes and mauls`);
    }
    // Leg 2: the arrow. ⚑ The tight claim - "the cast-pose beside it stayed
    // Graphics" - is NOT asserted here as an equality: the kobold camp has a
    // Dire Wolf in it, so the wolves' own body-carrying bite (a `maul` since
    // natural weapons C2) lands in this window too (measured: ids 110
    // present), and the id sampler polls rather than counting, so the two
    // cannot be told apart to the unit. The bound below is what this venue
    // can honestly say; leg 13c owns the bare case.
    const bareLayers = (arrow.fx['cast-pose'] ?? 0) + (arrow.fx.impact ?? 0);
    const ceiling = arrow.fx.projectile + (arrow.fx.strike ?? 0) + (arrow.fx.maul ?? 0);
    console.log(`leg 13b: leg 2 sprites ${arrow.fx.sprites}, projectile ${arrow.fx.projectile}, strike ${arrow.fx.strike ?? 0}, maul ${arrow.fx.maul ?? 0}, `
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
  const pilots = bodyWarnings.filter(w => /sword|arrow|wolf-jaw|spider-fang/.test(w));
  if (pilots.length === 0) pass('leg 13: no body warning for sword, arrow, wolf-jaw or spider-fang');
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
      // ⚑ Every kind EXCEPT `lunge` (natural weapons C1, D4): a lunge draws
      // nothing and plays at `off` by ruling, and this camp holds a Dire Wolf
      // (leg 13b) whose bite jabs in a mob-vs-mob fight. Derived from the
      // counters, so `wave` (missing from the old hand list) counts too.
      const drawn = spawnsIn(d, ['lunge']);
      console.log(`leg 10: fx ${JSON.stringify(d)}, skill events ${events}, ambient ${b.ambient}, glows ${b.glows}, lunges spawned ${d.lunge ?? 0} (exempt)`);
      if (events < 3) { console.log(`INCONCLUSIVE: leg 10 saw only ${events} skill events, starved venue`); inconclusive = true; }
      else {
        if (drawn === 0) pass(`leg 10: 0 Fx spawned across ${events} skill events at off (${d.lunge ?? 0} lunge(s) aside, exempt by D4)`);
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

// LEG 19 - Shockwave (§12h call 4): a `wave` on `fired`, `count` 2, ONE Fx per
// cast (the Fx draws its rings itself). Fired twice at open ground, a
// cooldown apart; no placed mob authors `wave` and there is no other player,
// so every wave in the window is ours and the count is an equality with the
// census's FIRED events for skill 54.
console.log('\n== LEG 19: Shockwave -> one wave per cast ==');
if (!inconclusive) {
  const SHOCKWAVE = 54;
  await runCommand('SKILL Shockwave');
  await page.waitForTimeout(1_500);
  const eq = await equipById(SHOCKWAVE, 1, 'cooldownSlotList');
  if (!eq.ok) { console.log(`INCONCLUSIVE: Shockwave equip did not land: ${JSON.stringify(eq)}`); inconclusive = true; }
  else {
    await closeSpellbook(page);
    // Open ground with every own aura off, so the photograph shows the wave's
    // rings and not the Heal ring and the campfire's beside them.
    await aurasOff('leg 19');
    await warpTo(OPEN_GROUND, 'open ground');
    await page.waitForTimeout(2_000);
    await page.mouse.move(800, 200);
    const a = await fxCounts();
    await startCensus();
    const slot = await page.$('#cooldownSlotList li[data-slot="1"]');
    const sb = await slot.boundingBox();
    // ⚑ The clock is slowed BEFORE the click, not on the spawn: run 4's
    // counter-armed shot showed no ring at all, because a stalled headless
    // page polls the counter hundreds of ms late and a 500 ms wave was over
    // before the slowdown began. Slowed first, the wave is born on the slow
    // clock and lives ~4 s of real time.
    await page.evaluate(() => {
      const real = performance.now.bind(performance);
      const base = real();
      window.__realNow = real;
      performance.now = () => base + (real() - base) / 8;
    });
    const w0 = (await fxCounts()).wave ?? 0;
    await page.mouse.click(sb.x + sb.width / 2, sb.y + sb.height / 2);
    await page.mouse.move(800, 200);
    const born = await page.waitForFunction((w0) => (window.game.skillFx().spawnedByKind.wave ?? 0) > w0,
      w0, { timeout: 5_000, polling: 20 }).then(() => true).catch(() => false);
    if (born) {
      await page.waitForTimeout(1_200);
      await page.screenshot({ path: join(outdir, 'leg19-shockwave.png') });
    }
    await restoreClock();
    // The cooldown is 240 ticks (8 s): wait it out, cast again.
    await page.waitForTimeout(8_500);
    await page.mouse.click(sb.x + sb.width / 2, sb.y + sb.height / 2);
    await page.mouse.move(800, 200);
    await page.waitForTimeout(2_000);
    const census = await stopCensus();
    const d = delta(a, await fxCounts());
    const casts = censusRows(census).filter(r => r.skillId === SHOCKWAVE && r.fired).reduce((n, r) => n + r.n, 0);
    console.log(`leg 19: fx ${JSON.stringify(d)}, Shockwave casts on the wire ${casts}, census gaps ${census.gaps}`);
    if (casts === 0) { console.log('INCONCLUSIVE: leg 19: no Shockwave cast reached the wire'); inconclusive = true; }
    else if (census.gaps > 0) {
      if ((d.wave ?? 0) >= 1) pass(`leg 19: ${d.wave} wave(s) spawned (census had ${census.gaps} gap(s), so no equality)`);
      else fail('leg 19: a Shockwave cast and no wave');
    } else if ((d.wave ?? 0) === casts) pass(`leg 19: ${d.wave} wave Fx for ${casts} cast(s) - one per cast`);
    else fail(`leg 19: ${d.wave ?? 0} wave Fx for ${casts} cast(s)`);
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
  if (!(await playerAlive())) {
    console.log(`INCONCLUSIVE: leg ${n}: the player DIED in the window (${label}); the legs after it cannot run`);
    inconclusive = true;
  }
}
// ⚑ GOD short-circuits the player's takeDamage, so a god-mode player is never
// the victim of a HIT event and no mob strike can draw on them. These two legs
// therefore drop GOD and buy survival with levels instead (legs 1-3 are over,
// so a levelled player no longer starves anything).
if (!inconclusive) {
  await runCommand('XP 100000000');
  await page.waitForTimeout(3_000);
}
// LEG 14 - C3a + §12g, rewritten for natural weapons C2 (§3.3, §7 "New
// skill-fx.mjs legs", D10, D11): the wolves' bite is a `lunge` plus a `maul`
// `bite` drawn ON the bitten player, the `wolf-jaw` PNG as the front-view
// upper row of teeth and its mirror below. It reaches the own player only with
// GOD off (the same reason legs 5+6 drop it). With the own aura off nothing at
// this camp authors a `strike` any more (wolves and boars both maul, L8), so
// every maul here is a wolf's (bodied) or a boar's gore (code-drawn), and the
// census says how many of each landed.
// Asserted: one maul and one engine mark per landing (the counts, exact on a
// gap-free census), the wolves' mauls on the sprite path, and the maul probe's
// geometry: the rows sit centred on the player's x, never turned, the upper
// row at or above the centre and the mirrored lower one at or below it, each
// 1.6 x the player's size wide (times the 1.3 pop while open).
// ⚑ Also the bite's PHOTOGRAPH: armed on the maul counter with the page clock
// slowed 8x, because a 180 ms maul is over before a fixed-time capture lands.
console.log('\n== LEG 14: the wolves\' bite, a maul of "wolf-jaw" teeth ON the bitten player ==');
if (!inconclusive) {
  if (await warpTo(WOLF_CAMP, 'the wolf camp')) {
    await page.mouse.move(800, 200);
    await deactivateAllAuras();
    await runCommand('GOD off');
    const a = await fxCounts();
    await startCensus();
    await startMaulProbe();
    if (await armShot('maul', 12_000)) {
      // 0.35 s of 8x-slowed clock plus the ~300 ms the capture itself costs
      // lands ~80 ms into the maul's life, as the rows close (the maul waits
      // for the lunge's 77 ms contact before its first frame).
      await page.waitForTimeout(350);
      await page.screenshot({ path: join(outdir, 'leg14-wolf-bite.png') });
      await closeUp('leg14-wolf-bite.png');
      await restoreClock();
    } else {
      console.log('NOTE: leg 14: no maul armed the shot within 12 s');
    }
    await page.waitForTimeout(6_000);
    const census = await stopCensus();
    const maulRun = await stopMaulProbe();
    const d = delta(a, await fxCounts());
    await runCommand('GOD');
    const wolfBites = countOf(census, 110, PHASE.direct) + countOf(census, 114, PHASE.direct);
    const landings = censusRows(census)
      .filter(r => !r.fired && r.phase === PHASE.direct && (r.kind === 0 || r.kind === 1))
      .reduce((n, r) => n + r.n, 0);
    const maulBound = plannedBound(census, 'maul');
    const bodiedBound = plannedBound(census, 'maul', { bodied: true });
    const strikeBound = plannedBound(census, 'strike');
    console.log(`leg 14: fx ${JSON.stringify(d)}, census (skillId|phase|kind|fired) ${JSON.stringify(census.counts)}, gaps ${census.gaps}`);
    console.log(`leg 14: wolf bites ${wolfBites}, damage landings ${landings}; maul ${d.maul ?? 0} (bound ${maulBound}), sprites ${d.sprites} (bodied-maul bound ${bodiedBound}), marks ${d.impact ?? 0}, strike ${d.strike ?? 0} (bound ${strikeBound})`);
    if (wolfBites === 0) {
      console.log('INCONCLUSIVE: leg 14: no wolf bite landed in the window');
      inconclusive = true;
    } else {
      if ((d.maul ?? 0) >= 1) pass(`leg 14: ${d.maul} maul(s) for ${wolfBites} wolf bite(s)`);
      else fail(`leg 14: ${wolfBites} wolf bite(s) and no maul`);
      if (census.gaps > 0) {
        console.log(`NOTE: leg 14: ${census.gaps} census gap(s), the one-per-landing equalities are not scored`);
      } else {
        // One maul per landing: every attacker at this camp authors exactly one.
        if ((d.maul ?? 0) === maulBound) pass(`leg 14: ${d.maul} maul(s) == ${maulBound}, one per landing the census saw`);
        else fail(`leg 14: ${d.maul ?? 0} maul(s) where the landings author ${maulBound}`);
        // ...and one engine mark beside each (D6: the ring keeps drawing).
        if ((d.impact ?? 0) === landings) pass(`leg 14: ${d.impact} hit mark(s) == ${landings} damage landing(s), one ring beside each maul`);
        else fail(`leg 14: ${d.impact ?? 0} hit mark(s) for ${landings} damage landing(s)`);
        // The wolves' mauls are the only bodied layer here, so the sprite
        // share is exact too.
        if (d.sprites === bodiedBound && bodiedBound >= 1) pass(`leg 14: ${d.sprites} sprite spawn(s) == ${bodiedBound} wolf maul(s) on "wolf-jaw"`);
        else fail(`leg 14: ${d.sprites} sprite spawn(s) where the wolf bites author ${bodiedBound} bodied maul(s)`);
      }
      if ((d.strike ?? 0) <= strikeBound) pass(`leg 14: ${d.strike ?? 0} strike(s) at the wolf camp - the bite is a strike no more`);
      else fail(`leg 14: ${d.strike} strike(s) where the landed skills author ${strikeBound}`);
      // D10 + D11: the rows, read off the live sprites.
      const m = maulSummary(maulRun.rows);
      console.log(`leg 14: maul rows at the player ${JSON.stringify(m)}`);
      if (!maulRun.layer) fail('leg 14: the skillFx layer was not found for the maul probe');
      else if (m.n === 0 || m.upper === 0 || m.lower === 0) console.log('NOTE: leg 14: the maul probe caught no pair of rows at the player (the counters above still judge the leg)');
      else {
        if (Math.max(Math.abs(m.dx[0]), Math.abs(m.dx[1])) < 0.02) pass(`leg 14: every row is centred on the player's x (dx ${m.dx[0]}..${m.dx[1]} sizes)`);
        else fail(`leg 14: a row sits off the player's centre (dx ${m.dx[0]}..${m.dx[1]} sizes)`);
        if (m.rot[0] === 0 && m.rot[1] === 0) pass('leg 14: no row is ever turned - screen-aligned (D10)');
        else fail(`leg 14: a row turned (rotation ${m.rot[0]}..${m.rot[1]}), the mark must not follow the attack line`);
        if (m.upperDy[1] <= 0.001 && m.lowerDy[0] >= -0.001) pass(`leg 14: the upper row at or above the centre (dy ${m.upperDy[0]}..${m.upperDy[1]}), the mirrored lower one at or below it (dy ${m.lowerDy[0]}..${m.lowerDy[1]})`);
        else fail(`leg 14: the rows are on the wrong sides (upper dy ${m.upperDy}, lower dy ${m.lowerDy})`);
        if (m.width[0] > 1.55 && m.width[1] < 2.1) pass(`leg 14: every row is ${m.width[0]}..${m.width[1]} player sizes wide (1.6, x1.3 while open)`);
        else fail(`leg 14: row width ${m.width[0]}..${m.width[1]} player sizes, wanted 1.6..2.08`);
      }
    }
  }
}

// LEG 20 - natural weapons C1 (docs/archive/plan-natural-weapons.md §3.1, §3.2, §7
// "New skill-fx.mjs legs", §10 L2 + L6): the `lunge`. Same venue and setup as
// leg 14 (levelled, own auras off, GOD off for each armed window only, since
// a god-mode player is never the victim of a HIT event and no wolf bite would
// land on it). Three windows: 20a a fight at `full`, 20b the fight over,
// 20c a fight at `off`, then 20b's check once more.
//
// ⚑ What 20a can and cannot say about the LOGICAL position. The plan asks
// that a lunging wolf's `shape.position` equal what the snapshot set. The
// snapshot's position lives in the GameObject's interpolation buffer, and
// `window.game` hands the harness no entity map (only `bodyOffsets()`'s ids),
// so that equality is NOT asserted here. What the probe CAN read is the scene
// graph: the token (label `token`) is a child of the entity's group, which IS
// `shape`. For a wolf standing still in contact its group's position does not
// change at all, so a jab whose token moved while the group's position stayed
// bit-identical over every sample is a correctly named positive: the jab
// moved the token and left `shape.position` untouched. A jab of a wolf that
// walked meanwhile proves nothing either way and is only counted.
//
// ⚑ L6: nothing here samples the 220 ms motion from Node. `lunge`,
// `lungeNudges` and `lunges` count at write time; the probe runs in-page every
// 10 ms and reads `skillFx()` and `bodyOffsets()` in ONE task, which is atomic
// against the manager's update (a lunge's dispose zeroes its body in the same
// task that drops it from the map), so "lunges === 0 and a body is off zero"
// is a stuck offset (L2), never a race.
async function startLungeProbe() {
  await page.evaluate(() => {
    let root = window.__auraRoot;
    while (root.parent && root.label !== 'cameraGroup') root = root.parent;
    const p = {
      samples: 0, withOffset: 0, maxOffset: 0, liveMax: 0, stuck: [],
      tokens: new Set(), jabs: new Map(), frozen: 0, walked: 0, frozenPeak: 0,
    };
    window.__lungeProbe = p;
    // The token nodes, re-collected every 500 ms: a full scene walk every
    // 10 ms would stall the page it is measuring.
    const collect = () => {
      const walk = (node) => {
        for (const c of node.children ?? []) {
          if (c.label === 'token') p.tokens.add(c);
          else walk(c);
        }
      };
      walk(root);
    };
    collect();
    p.collector = setInterval(collect, 500);
    // A jab ends when its token is back at exactly (0, 0) or gone.
    const settle = (node, rec) => {
      if (rec.peak >= 5 && rec.n >= 2) {
        if (rec.moved) p.walked++;
        else { p.frozen++; p.frozenPeak = Math.max(p.frozenPeak, rec.peak); }
      }
      p.jabs.delete(node);
    };
    p.timer = setInterval(() => {
      const s = window.game.skillFx();
      const offs = window.game.bodyOffsets();
      p.samples++;
      p.liveMax = Math.max(p.liveMax, s.live);
      if (offs.length) p.withOffset++;
      for (const o of offs) p.maxOffset = Math.max(p.maxOffset, Math.hypot(o.x, o.y));
      if (s.lunges === 0 && offs.length && p.stuck.length < 10) p.stuck.push(offs);
      for (const node of p.tokens) {
        if (node.destroyed || !node.parent) {
          const rec = p.jabs.get(node);
          if (rec) settle(node, rec);
          p.tokens.delete(node);
          continue;
        }
        const off = Math.hypot(node.position.x, node.position.y);
        let rec = p.jabs.get(node);
        if (off === 0) { if (rec) settle(node, rec); continue; }
        const gx = node.parent.position.x, gy = node.parent.position.y;
        if (!rec) { rec = { gx, gy, peak: 0, n: 0, moved: false }; p.jabs.set(node, rec); }
        rec.n++;
        rec.peak = Math.max(rec.peak, off);
        if (gx !== rec.gx || gy !== rec.gy) rec.moved = true;
      }
    }, 10);
  });
}
async function stopLungeProbe() {
  return page.evaluate(() => {
    const p = window.__lungeProbe;
    clearInterval(p.timer);
    clearInterval(p.collector);
    return {
      samples: p.samples, withOffset: p.withOffset, maxOffset: +p.maxOffset.toFixed(1),
      liveMax: p.liveMax, stuck: p.stuck, frozen: p.frozen, walked: p.walked,
      frozenPeak: +p.frozenPeak.toFixed(1), tokens: p.tokens.size,
    };
  });
}
// 20b: every body home. Polls in-page for a moment with no running lunge and
// reads `bodyOffsets()` in that SAME task: it must be empty, exact zero.
async function bodiesHome(label) {
  return page.evaluate((timeout) => new Promise((resolve) => {
    const started = Date.now();
    const poll = setInterval(() => {
      const s = window.game.skillFx();
      if (s.lunges === 0) {
        clearInterval(poll);
        resolve({ quiet: true, lunges: 0, offsets: window.game.bodyOffsets(), waited: Date.now() - started });
      } else if (Date.now() - started > timeout) {
        clearInterval(poll);
        resolve({ quiet: false, lunges: s.lunges, offsets: window.game.bodyOffsets(), waited: Date.now() - started });
      }
    }, 10);
  }), 10_000).then((r) => {
    console.log(`${label}: ${JSON.stringify(r)}`);
    // ⚑ Not the global flag: a jab between two other actors in view is no
    // reason to cost legs 6, 5 and 16-18 their run. It still colours RESULT.
    if (!r.quiet) { console.log(`INCONCLUSIVE: ${label}: a lunge was still running after 10 s (mob-vs-mob in view?)`); lateInconclusive = true; }
    else if (r.offsets.length === 0) pass(`${label}: no lunge running and every held body at exactly (0, 0)`);
    else fail(`${label}: no lunge running and ${r.offsets.length} body(ies) parked off zero: ${JSON.stringify(r.offsets)}`);
    return r;
  });
}
// One GOD-off fight window at the wolf camp: census + lunge probe, optional
// mid-jab screenshot. Returns null (and marks the run) when nothing usable ran.
async function lungeWindow(label, ms, shot) {
  await runCommand('GOD off');
  const a = await fxCounts();
  await startCensus();
  await startLungeProbe();
  const t0 = Date.now();
  let shotOffsets = null;
  if (shot) {
    // ⚑ The clock is slowed BEFORE arming (the leg 19 lesson): a stalled
    // headless page polls late, and the jab's 77 ms out phase would be over
    // before a spawn-armed slowdown began. Armed on a real token 10 px or
    // more off zero (about a third of a wolf's jab), not on the first nudge,
    // which can be a pixel.
    await page.evaluate(() => {
      const real = performance.now.bind(performance);
      const base = real();
      window.__realNow = real;
      performance.now = () => base + (real() - base) / 8;
    });
    const armed = await page.waitForFunction(() =>
      window.game.bodyOffsets().some(o => Math.hypot(o.x, o.y) >= 10),
    null, { timeout: 12_000, polling: 5 }).then(() => true).catch(() => false);
    if (armed) {
      shotOffsets = await page.evaluate(() => window.game.bodyOffsets());
      await page.screenshot({ path: join(outdir, shot) });
      // Cropped around the jabbing token and the player it jabs at.
      const at = await page.evaluate(() => {
        let root = window.__auraRoot;
        while (root.parent && root.label !== 'cameraGroup') root = root.parent;
        let best = null;
        const walk = (node) => {
          for (const c of node.children ?? []) {
            if (c.label === 'token') {
              const off = Math.hypot(c.position.x, c.position.y);
              if (!best || off > best.off) best = { off, g: c.getGlobalPosition() };
            } else walk(c);
          }
        };
        walk(root);
        const me = window.game.character.shape.getGlobalPosition();
        return best && best.off > 0 ? { x: (best.g.x + me.x) / 2, y: (best.g.y + me.y) / 2 } : { x: me.x, y: me.y };
      });
      const w = 360, h = 280;
      const x = Math.max(0, Math.min(1600 - w, Math.round(at.x - w / 2)));
      const y = Math.max(0, Math.min(900 - h, Math.round(at.y - h / 2)));
      await page.screenshot({ path: join(outdir, shot.replace('.png', '-closeup.png')), clip: { x, y, width: w, height: h } });
      console.log(`${label}: shot taken with body offsets ${JSON.stringify(shotOffsets)}`);
    } else {
      console.log(`NOTE: ${label}: no token went 10 px off zero within 12 s, no mid-jab shot`);
    }
    await restoreClock();
  }
  await page.waitForTimeout(Math.max(0, ms - (Date.now() - t0)));
  const probe = await stopLungeProbe();
  const census = await stopCensus();
  const b = await fxCounts();
  const fx = delta(a, b);
  await runCommand('GOD');
  const bites = countOf(census, 110, PHASE.direct) + countOf(census, 114, PHASE.direct);
  console.log(`${label}: fx ${JSON.stringify(fx)}, ambient ${b.ambient}, live ${b.live}`);
  console.log(`${label}: wolf bites on the wire ${bites}, census gaps ${census.gaps}, lunge bound ${plannedBound(census, 'lunge')}; probe ${JSON.stringify(probe)}`);
  if (!(await playerAlive())) {
    console.log(`INCONCLUSIVE: ${label}: the player DIED in the window; the legs after it cannot run`);
    inconclusive = true;
    return null;
  }
  if (bites === 0) {
    console.log(`INCONCLUSIVE: ${label}: no wolf bite landed in the window`);
    inconclusive = true;
    return null;
  }
  // L2 in every window: a stuck offset is red wherever it is seen.
  if (probe.stuck.length === 0) pass(`${label}: across ${probe.samples} probe samples, never a body off zero with no lunge running`);
  else fail(`${label}: ${probe.stuck.length} sample(s) with no lunge running and a body off zero: ${JSON.stringify(probe.stuck)}`);
  return { fx, b, census, probe, bites };
}

console.log('\n== LEG 20: natural weapons C1, the wolves\' lunge ==');
if (!inconclusive) {
  if (await warpTo(WOLF_CAMP, 'the wolf camp')) {
    await page.mouse.move(800, 200);
    await deactivateAllAuras();
    if ((await setDensity('full')) !== 'full') { console.log('INCONCLUSIVE: leg 20 the density was not full'); inconclusive = true; }
  }
}
// 20a - a real fight at `full`: the jab spawned, a body really moved, and a
// standing wolf's jab left its logical position alone.
if (!inconclusive) {
  console.log('\n-- 20a: a fight at density full --');
  const run = await lungeWindow('leg 20a', 12_000, 'leg20-wolf-lunge.png');
  if (run) {
    const { fx, census, probe } = run;
    if ((fx.lunge ?? 0) >= 1) pass(`leg 20a: ${fx.lunge} lunge(s) spawned for ${run.bites} wolf bite(s)`);
    else fail(`leg 20a: ${run.bites} wolf bite(s) and no lunge spawned`);
    if ((fx.lungeNudges ?? 0) >= 1) pass(`leg 20a: the manager wrote ${fx.lungeNudges} non-zero body offset(s)`);
    else fail('leg 20a: lunges spawned and not one non-zero body offset was written');
    if (probe.withOffset >= 1) pass(`leg 20a: a real token node sat off zero in ${probe.withOffset} of ${probe.samples} samples (peak ${probe.maxOffset} px)`);
    else fail(`leg 20a: bodyOffsets() never listed a body in ${probe.samples} samples`);
    // One per landing at most (one per attacker per snapshot can only lower
    // it); exact only on a gap-free census.
    const bound = plannedBound(census, 'lunge');
    if (census.gaps > 0) console.log(`NOTE: leg 20a: ${census.gaps} census gap(s), the lunge bound ${bound} is not scored`);
    else if ((fx.lunge ?? 0) <= bound) pass(`leg 20a: ${fx.lunge ?? 0} lunge(s) <= ${bound}, what the landed skills author`);
    else fail(`leg 20a: ${fx.lunge} lunge(s) > the authored bound ${bound}`);
    if (probe.frozen >= 1) pass(`leg 20a: ${probe.frozen} jab(s) moved the token (up to ${probe.frozenPeak} px) with the group's position, i.e. shape.position, bit-identical throughout`);
    else console.log(`NOTE: leg 20a: no jab of a standing attacker was caught (${probe.walked} jab(s) of a walking one), so the logical-position half judged nothing`);
  }
}
// 20b - the fight over (GOD back on, so no bite lands on the player and no
// new jab starts at it): every body home at EXACT zero, then the at-rest shot.
if (!inconclusive) {
  console.log('\n-- 20b: the fight over, every body home --');
  await page.waitForTimeout(1_500);
  const r = await bodiesHome('leg 20b');
  await page.screenshot({ path: join(outdir, 'leg20-at-rest.png') });
  const after = await page.evaluate(() => ({ lunges: window.game.skillFx().lunges, offsets: window.game.bodyOffsets() }));
  console.log(`leg 20b: at the at-rest shot ${JSON.stringify(after)}`);
}
// 20c - density `off`: the jab still plays (D4), nothing else spawns.
if (!inconclusive) {
  console.log('\n-- 20c: a fight at density off --');
  if ((await setDensity('off')) !== 'off') { console.log('INCONCLUSIVE: leg 20c the manager never saw the density write'); inconclusive = true; }
  else {
    const run = await lungeWindow('leg 20c', 10_000, null);
    if (run) {
      const { fx, b, probe } = run;
      if ((fx.lunge ?? 0) >= 1) pass(`leg 20c: ${fx.lunge} lunge(s) spawned at off`);
      else fail(`leg 20c: ${run.bites} wolf bite(s) at off and no lunge`);
      if ((fx.lungeNudges ?? 0) >= 1) pass(`leg 20c: ${fx.lungeNudges} non-zero body offset(s) written at off`);
      else fail('leg 20c: no body moved at off');
      const others = spawnsIn(fx, ['lunge']);
      if (others === 0) pass('leg 20c: no other kind spawned at off (no strike, no maul, no mark)');
      else fail(`leg 20c: ${others} non-lunge Fx spawned at off: ${JSON.stringify(fx)}`);
      if (b.live === 0 && probe.liveMax === 0) pass(`leg 20c: live stayed 0 in all ${probe.samples} samples`);
      else fail(`leg 20c: live reached ${probe.liveMax} (end ${b.live}) at off`);
      if (b.ambient === 0) pass('leg 20c: ambient held 0 at off');
      else fail(`leg 20c: ${b.ambient} ambient layer(s) at off`);
    }
    await page.waitForTimeout(1_500);
    await bodiesHome('leg 20c (after)');
  }
  if ((await setDensity('full')) !== 'full') { console.log('INCONCLUSIVE: density never went back to full'); inconclusive = true; }
}

if (!inconclusive) await restUp('leg 6');
await mobStrikeLeg(6, { x: 20.5, y: 33.5 }, 'the trolls (overhead)', 'leg6-mob-overhead.png', 1_700);
if (!inconclusive) await restUp('leg 5');
await mobStrikeLeg(5, { x: 26.5, y: 22.5 }, 'the bandit camp (swing)', 'leg5-mob-swing.png', 700);

// === C3a-ii (§12h): an over-time effect draws on APPLICATION ================
// Levelled (the XP cheat above), own auras off, GOD off for each armed window.
// ⚑ AFTER legs 6 and 5 on purpose: there is no heal cheat, and a player these
// three camps have drained walked into the trolls and died (run 3,
// 2026-09-23), which cost leg 5 its warp. Every GOD-off leg from 6 on rests
// at the quiet campfire first (`restUp`).
// ⚑ Every bound below is scoped to the skills the census saw land: the venom
// venue has poison pools (119, an `on: hit` projectile) and the giant camp has
// a venom spider and two small spiders (117, a bodiless `maul` `bite`).
const VENOM_SPIT = 118, POOL = 119, GIANT_SPIT = 137, EMBER = 133;
// The venom spider at (6, -25.8), 2.6 u from the nearest pool (radius 1.1),
// so a player standing here is spat at but not pooled.
const VENOM_SPOT = { x: 5.2, y: -25.3 };
// The camp's LIT western edge, 1.1 u from the giant at (31.33, -31.81): the
// middle of the camp is in darkness (skillFx draws below it, so the shot shows
// nothing but the player's own light), and five level-14 giants at once killed
// a level-30 player in 14 s (run 2, 2026-09-23).
const GIANT_SPOT = { x: 30.3, y: -31.3 };
// 1.8 u south of the southern camp's pyromancer (EmberAura radius 3).
const PYRO_SPOT = { x: 27, y: 17.2 };

// LEG 16 - the venom spiders: the spit is drawn on APPLICATION (and on every
// refresh), the DoT's ticks draw the engine's mark alone.
console.log('\n== LEG 16: venom spiders - the spit on `applied`, the ticks draw the mark alone ==');
{
  const run = await mobPhaseLeg(16, VENOM_SPOT, 'the venom spiders', { ms: 14_000 });
  if (run) {
    const { fx, census } = run;
    const applied = countOf(census, VENOM_SPIT, PHASE.applied);
    const ticks = countOf(census, VENOM_SPIT, PHASE.tick, [0, 1]);
    const direct = countOf(census, VENOM_SPIT, PHASE.direct);
    const bound = plannedBound(census, 'projectile');
    const tickBound = plannedBound(census, 'projectile', { ticksDraw: true });
    console.log(`leg 16: VenomSpit applied ${applied}, damage ticks ${ticks}, direct ${direct}; `
      + `projectiles ${fx.projectile ?? 0} against an authored bound of ${bound} (${tickBound} if ticks drew), pool hits ${countOf(census, POOL, PHASE.direct)}`);
    if (applied === 0) { console.log('INCONCLUSIVE: leg 16: no VenomSpit application reached the wire'); inconclusive = true; }
    else {
      pass(`leg 16: ${applied} Applied event(s) for VenomSpit on the wire`);
      if (direct === 0) pass('leg 16: VenomSpit (a dot_aura alone) sent no Direct landing');
      else fail(`leg 16: ${direct} Direct landing(s) from a DoT-only skill`);
      if ((fx.projectile ?? 0) >= 1) pass(`leg 16: ${fx.projectile} projectile(s) drew for ${applied} application(s)`);
      else fail(`leg 16: ${applied} application(s) and no projectile`);
      // Exact when the census saw every snapshot; otherwise the cadence bound
      // (VenomSpit refreshes every 50 ticks per spider) plus whatever pools spat.
      const cad = cadenceBound(census, VENOM_SPIT, PHASE.applied, 14_000, 50);
      const poolCad = cadenceBound(census, POOL, PHASE.direct, 14_000, 20);
      if (census.gaps === 0) {
        if ((fx.projectile ?? 0) <= bound) pass(`leg 16: ${fx.projectile ?? 0} projectile(s) <= ${bound}, what the applications (and pool hits) allow`);
        else fail(`leg 16: ${fx.projectile} projectile(s) > the authored bound ${bound} - a tick drew one?`);
      } else if ((fx.projectile ?? 0) <= cad.bound + poolCad.bound) {
        pass(`leg 16: ${fx.projectile ?? 0} projectile(s) <= the cadence bound ${cad.bound + poolCad.bound} (${cad.casters} spitting spider(s) at one spit per 50 ticks, ${poolCad.casters} pool(s)); census had ${census.gaps} gap(s)`);
      } else fail(`leg 16: ${fx.projectile} projectile(s) > the cadence bound ${cad.bound + poolCad.bound} - a tick drew one?`);
      if (ticks === 0) console.log('NOTE: leg 16: no damage tick landed in the window, the mark half judges nothing');
      else if ((fx.impact ?? 0) >= 1) pass(`leg 16: ${ticks} DoT tick(s), ${fx.impact} hit mark(s)`);
      else fail(`leg 16: ${ticks} DoT tick(s) and no hit mark`);
      // VenomSpit authors no strike; a strike here is a neighbour's (a
      // wandering wolf was seen). Scored only on a gap-free census.
      const strikeBound = plannedBound(census, 'strike');
      if (census.gaps > 0) console.log(`NOTE: leg 16: ${fx.strike ?? 0} strike(s) in the window, not attributable with ${census.gaps} census gap(s) (VenomSpit authors none)`);
      else if ((fx.strike ?? 0) <= strikeBound) pass(`leg 16: ${fx.strike ?? 0} strike(s), within the ${strikeBound} other skills allow - none from VenomSpit`);
      else fail(`leg 16: ${fx.strike} strike(s) where the landed skills author ${strikeBound}`);
    }
  }
}

// LEG 17 - the giant spiders: two white fangs clamp the victim on every
// direct bite (a `maul` `pincer` on `hit`, body `spider-fang`), the spit flies
// on application. Armed on the SPRITES counter: the fang is the only body at
// this camp. Since natural weapons C2 the fangs are SCREEN-ALIGNED (D10, the
// lead's reading in §8 Q6): hinged on the player's rim at screen left and
// right, gaping toward the top, swinging down to meet on the centre.
console.log('\n== LEG 17: giant spiders - the "spider-fang" maul on `hit` beside the applied spit ==');
{
  const run = await mobPhaseLeg(17, GIANT_SPOT, 'the giant spiders',
    { ms: 10_000, shot: 'leg17-spider-fang.png', armOn: 'sprites', shotDelay: 500, mauls: true });
  if (run) {
    const { fx, census } = run;
    const bites = countOf(census, GIANT_SPIT, PHASE.direct, [0, 1]);
    const applied = countOf(census, GIANT_SPIT, PHASE.applied);
    const spriteBound = plannedBound(census, 'maul', { bodied: true });
    const f = maulSummary(run.mauls.fangs);
    console.log(`leg 17: GiantVenomSpit direct ${bites}, applied ${applied}; maul ${fx.maul ?? 0}, sprites ${fx.sprites}, `
      + `bodied-maul bound ${spriteBound}, projectile ${fx.projectile ?? 0} (bound ${plannedBound(census, 'projectile')})`);
    console.log(`leg 17: fang geometry (player sizes; upper = unmirrored = the left fang) ${JSON.stringify(f)}`);
    if (bites === 0) { console.log('INCONCLUSIVE: leg 17: no giant spider bite landed'); inconclusive = true; }
    else {
      if (fx.sprites >= 1 && fx.sprites <= (fx.maul ?? 0)) pass(`leg 17: ${fx.sprites} of ${fx.maul} maul(s) drew the fang PNG for ${bites} bite(s)`);
      else fail(`leg 17: ${bites} bite(s), ${fx.maul ?? 0} maul(s), ${fx.sprites} sprite(s)`);
      // The fixed frame. The left fang is drawn as the PNG is, the right one
      // mirrored; rotation 0 points a fang right and −y is up on screen.
      if (f.n === 0 || f.upper === 0 || f.lower === 0) console.log('NOTE: leg 17: the maul probe caught no pair of fangs at the player (the counters still judge the leg)');
      else {
        const onRim = (r, x) => r && Math.abs(r[0] - x) < 0.02 && Math.abs(r[1] - x) < 0.02;
        if (onRim(f.upperDx, -1) && onRim(f.lowerDx, 1) && Math.max(...f.upperDy.map(Math.abs), ...f.lowerDy.map(Math.abs)) < 0.02) {
          pass(`leg 17: the fangs hinge on the player's rim at screen left (dx ${f.upperDx}) and right (dx ${f.lowerDx}), level with the centre`);
        } else fail(`leg 17: fang hinges off the screen-left/right rim: left dx ${f.upperDx} dy ${f.upperDy}, right dx ${f.lowerDx} dy ${f.lowerDy}`);
        const open = (35 * Math.PI) / 180 + 0.01;
        if (f.upperRot[0] >= -open && f.upperRot[1] <= 0.01 && f.lowerRot[0] >= Math.PI - 0.01 && f.lowerRot[1] <= Math.PI + open) {
          pass(`leg 17: both fangs gape toward the top and close to level (left ${f.upperRot}, right ${f.lowerRot} rad), whichever side the spider stands`);
        } else fail(`leg 17: a fang turned outside the fixed frame: left ${f.upperRot}, right ${f.lowerRot}`);
        if (f.width[0] > 0.98 && f.width[1] < 1.02) pass(`leg 17: every fang is one player size long (${f.width}), so the points meet on the centre`);
        else fail(`leg 17: fang length ${f.width} player sizes, wanted 1`);
      }
      // Natural weapons C1: the giant spider jabs AND still spits (§7 C1
      // checklist). Its bite authors a `lunge` on `hit` beside the fangs.
      if ((fx.lunge ?? 0) >= 1 && (fx.lungeNudges ?? 0) >= 1) pass(`leg 17: ${fx.lunge} lunge(s), ${fx.lungeNudges} body nudge(s) for ${bites} bite(s)`);
      else fail(`leg 17: ${bites} giant spider bite(s) and lunge ${fx.lunge ?? 0}, nudges ${fx.lungeNudges ?? 0}`);
      if (census.gaps > 0) console.log(`NOTE: leg 17: ${census.gaps} census gap(s), the exact sprite bound is not scored`);
      else if (fx.sprites <= spriteBound) pass(`leg 17: ${fx.sprites} sprite(s) <= ${spriteBound} bodied mauls the landings allow`);
      else fail(`leg 17: ${fx.sprites} sprite(s) > ${spriteBound}`);
      if (applied === 0) console.log('NOTE: leg 17: no giant spit application in the window');
      else if ((fx.projectile ?? 0) >= 1) pass(`leg 17: ${applied} application(s), ${fx.projectile} projectile(s) beside the fangs`);
      else fail(`leg 17: ${applied} application(s) and no projectile`);
      // ⭐ The gap-proof discriminator: the bite and the dot share ONE aura beat
      // (tickInterval 40, nearest, 1 target), so every beat is one fang pair
      // AND one spit. Drawn per application the spit tracks the fangs 1:1;
      // drawn per tick as well it would roughly double (5 dot ticks per 45).
      // Bounded, not equal: the camp's venom spider spits too (118).
      const spit118 = countOf(census, VENOM_SPIT, PHASE.applied);
      if ((fx.projectile ?? 0) <= fx.sprites + spit118 + 2 && (fx.projectile ?? 0) * 2 >= fx.sprites) {
        pass(`leg 17: ${fx.projectile} spit(s) track ${fx.sprites} fang pair(s) beat for beat (+${spit118} VenomSpit seen) - no spit per tick`);
      } else fail(`leg 17: ${fx.projectile} spit(s) against ${fx.sprites} fang sprite(s) - not one spit per bite beat`);
    }
  }
}

// LEG 18 - the pyromancer (§12h call 2): damage per tick beside its DoT. The
// new damage_aura lands Direct hits (its beam, on `hit`), the dot_aura sends
// Applied events (the ember burst, on `applied`).
console.log('\n== LEG 18: the pyromancer - Direct beam hits beside the Applied ember ==');
{
  const run = await mobPhaseLeg(18, PYRO_SPOT, 'the pyromancer', { ms: 12_000 });
  if (run) {
    const { fx, census } = run;
    const direct = countOf(census, EMBER, PHASE.direct, [0, 1]);
    const applied = countOf(census, EMBER, PHASE.applied);
    const ticks = countOf(census, EMBER, PHASE.tick);
    console.log(`leg 18: EmberAura direct ${direct}, applied ${applied}, ticks ${ticks}; beam ${fx.beam ?? 0}, emitter ${fx.emitter ?? 0}`);
    if (direct === 0 && applied === 0) { console.log('INCONCLUSIVE: leg 18: the pyromancer never reached the player'); inconclusive = true; }
    else {
      if (direct >= 1) pass(`leg 18: ${direct} Direct EmberAura hit(s) - the damage_aura lands`);
      else fail(`leg 18: ${applied} application(s) but no Direct hit - the new damage_aura never landed`);
      if (direct === 0) { /* scored above */ }
      else if ((fx.beam ?? 0) >= 1) pass(`leg 18: ${fx.beam} beam(s) for ${direct} direct hit(s)`);
      else fail(`leg 18: ${direct} direct hit(s) and no beam`);
      if (applied === 0) console.log('NOTE: leg 18: no Applied EmberAura in the window');
      else if ((fx.emitter ?? 0) >= 1) pass(`leg 18: ${applied} application(s), ${fx.emitter} emitter burst(s)`);
      else fail(`leg 18: ${applied} application(s) and no emitter burst`);
    }
  }
}


await browser.close();
const realErrors = errors.filter(e => !/favicon/i.test(e));
if (realErrors.length) {
  console.log('\nERRORS / FAILURES:');
  realErrors.forEach(e => console.log('  ' + e));
  console.log(`\nRESULT: FAIL (${realErrors.length})`);
  process.exit(1);
}
console.log(inconclusive || lateInconclusive ? '\nRESULT: INCONCLUSIVE (see above)' : '\nRESULT: PASS');
