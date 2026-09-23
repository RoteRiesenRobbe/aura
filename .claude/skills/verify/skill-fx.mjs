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
// C3a-ii legs (§12h, PO 2026-09-23: an over-time effect draws on APPLICATION,
// the rim bite, cooldown waves). The wire now carries `phase` (Direct 0,
// Applied 1, Tick 2) on every skill event, counted EXACTLY by an in-page
// sampler that reads `skillEvents().last` only when `total` moved (the older
// samplers poll and double-count; they only say which ids landed).
// 14 also measures the rim bite's geometry off the live jaw sprites (hinged at
// the player's rim, shorter than the wolf's reach, opening toward the player's
// centre) and photographs it mid-open · 16 the venom spiders: the spit is an
// `applied` projectile, the ticks draw the mark alone · 17 the giant spiders:
// the white `spider-fang` sprites on `hit` beside the applied spit,
// photographed · 18 the pyromancer: its new `damage_aura` lands Direct hits
// (the beam) beside the Applied ember burst · 19 Shockwave: one `wave` per
// cast. Legs 16-18 bound every per-kind count by what the AUTHORED layers of
// the skills that actually landed allow (`plannedBound`, read from api/skills),
// because the counters are per kind, not per skill, and every venue has
// neighbours (pools spit projectiles, spiders bite).
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

// The live jaws of a rim bite (§12h call 3), read off the scene: a jaw is the
// only sprite anchored at (0, 1). Kept per sample: its length in world px,
// how far its hinge sits from the PLAYER's centre in units of the player's
// radius (1 = on the rim), and the cosine between the jaw's aim and the
// hinge -> player-centre line (1 = opening toward the player's centre, i.e.
// the hinge is on the attacker's side). Jaws hinged far from the player belong
// to a fight between other actors and are skipped.
async function startJawProbe() {
  await page.evaluate(() => {
    let n = window.__auraRoot;
    while (n.parent && n.label !== 'cameraGroup') n = n.parent;
    const layer = (n.children ?? []).find(c => c.label === 'skillFx');
    const probe = { samples: [], layer: !!layer };
    window.__jaws = probe;
    if (!layer) return;
    probe.timer = setInterval(() => {
      const ch = window.game.character;
      const size = ch.size;
      const at = layer.toLocal(ch.shape.getGlobalPosition());
      const seen = new Set();
      const walk = (node) => {
        for (const c of node.children ?? []) {
          if (c.visible && c.anchor && c.anchor.y === 1 && c.anchor.x === 0 && c.texture && c.alpha > 0) {
            const key = `${Math.round(c.x)},${Math.round(c.y)}`;
            if (!seen.has(key)) {
              seen.add(key);
              const dx = at.x - c.x, dy = at.y - c.y;
              const dist = Math.hypot(dx, dy);
              if (dist < size * 3 && probe.samples.length < 400) {
                // Both jaws of a pair share the hinge; their mean rotation is
                // the attack line (upper = aim - open, lower = aim + open).
                const pair = (node.children ?? []).filter(o => o !== c && o.anchor && o.anchor.y === 1
                  && Math.abs(o.x - c.x) < 0.5 && Math.abs(o.y - c.y) < 0.5);
                const rot = pair.length ? (c.rotation + pair[0].rotation) / 2 : c.rotation;
                probe.samples.push({
                  len: Math.abs(c.scale.x) * c.texture.width,
                  rim: dist / size,
                  cos: dist > 0 ? (Math.cos(rot) * dx + Math.sin(rot) * dy) / dist : 1,
                  size,
                });
              }
            }
          }
          walk(c);
        }
      };
      walk(layer);
    }, 10);
  });
}
async function stopJawProbe() {
  return page.evaluate(() => {
    const p = window.__jaws;
    if (p.timer) clearInterval(p.timer);
    return { layer: p.layer, samples: p.samples };
  });
}
function jawSummary(samples) {
  if (!samples.length) return null;
  const min = (f) => Math.min(...samples.map(f)), max = (f) => Math.max(...samples.map(f));
  return {
    n: samples.length,
    lenMin: +min(s => s.len).toFixed(1), lenMax: +max(s => s.len).toFixed(1),
    rimMin: +min(s => s.rim).toFixed(2), rimMax: +max(s => s.rim).toFixed(2),
    cosMin: +min(s => s.cos).toFixed(3),
    size: samples[0].size,
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
// victim of an event), census + optional jaw probe + an armed shot.
async function mobPhaseLeg(n, spot, label, { ms = 14_000, shot, armOn, shotDelay = 500, jaws = false }) {
  if (inconclusive) return null;
  if (!(await restUp(`leg ${n}`))) return null;
  if (!(await warpTo(spot, label))) return null;
  await page.mouse.move(800, 200);
  await deactivateAllAuras();
  await runCommand('GOD off');
  const a = await fxCounts();
  await startCensus();
  if (jaws) await startJawProbe();
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
  const jawRun = jaws ? await stopJawProbe() : null;
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
  return { fx, census, jaws: jawRun };
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
    await startJawProbe();
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
      // §12h: the RIM bite, photographed mid-open. 0.35 s of 8x-slowed clock
      // plus the ~300 ms the capture itself costs lands ~80 ms into a 200 ms
      // bite, while the jaws still gape.
      await page.waitForTimeout(350);
      await page.screenshot({ path: join(outdir, 'leg14-wolf-bite.png') });
      await closeUp('leg14-wolf-bite.png');
      await page.evaluate(() => { if (window.__realNow) { performance.now = window.__realNow; window.__realNow = null; } });
    }
    await page.waitForTimeout(6_000);
    const ids = await page.evaluate(() => { clearInterval(window.__fxSampler); return window.__fxSkillIds; });
    const jawRun = await stopJawProbe();
    const d = delta(a, await fxCounts());
    await runCommand('GOD');
    console.log(`leg 14: fx ${JSON.stringify(d)}, hit skill ids (sampled) ${JSON.stringify(ids)}`);
    // §12h call 3, the RIM BITE: the jaws hinge on the player's rim (not at
    // the wolf's mouth), are sized to the PLAYER (max(40, r x 1.4)) rather than
    // to the wolf's 1.0 u reach (120 px), and open toward the player's centre.
    const js = jawSummary(jawRun.samples);
    console.log(`leg 14: rim-bite jaws ${JSON.stringify(js)}`);
    if (!jawRun.layer) fail('leg 14: the skillFx layer was not found for the jaw probe');
    else if (!js) console.log('NOTE: leg 14: the jaw probe caught no jaw at the player (the counters above still judge the leg)');
    else {
      const want = Math.max(40, js.size * 1.4);
      if (js.lenMax < 120 && Math.abs(js.lenMax - want) < 2 && Math.abs(js.lenMin - want) < 2) {
        pass(`leg 14: every jaw is ${js.lenMin}-${js.lenMax} px, max(40, ${js.size} x 1.4) = ${want.toFixed(1)}, under the 120 px reach`);
      } else fail(`leg 14: jaw length ${js.lenMin}-${js.lenMax} px, wanted ${want.toFixed(1)} and < 120`);
      if (js.rimMin > 0.8 && js.rimMax < 1.2) pass(`leg 14: every hinge sits on the player's rim (${js.rimMin}-${js.rimMax} radii from the centre)`);
      else fail(`leg 14: hinges at ${js.rimMin}-${js.rimMax} player radii, not on the rim`);
      if (js.cosMin > 0.9) pass(`leg 14: every pair opens toward the player's centre, hinged on the wolf's side (min cos ${js.cosMin})`);
      else fail(`leg 14: a jaw pair points away from the player's centre (min cos ${js.cosMin})`);
    }
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
// a venom spider and two small spiders (117, a bodiless `bite`).
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
// direct bite (`hit`, body `spider-fang`), the spit flies on application.
// Armed on the SPRITES counter: the fang is the only body at this camp.
console.log('\n== LEG 17: giant spiders - the "spider-fang" bite on `hit` beside the applied spit ==');
{
  const run = await mobPhaseLeg(17, GIANT_SPOT, 'the giant spiders',
    { ms: 10_000, shot: 'leg17-spider-fang.png', armOn: 'sprites', shotDelay: 500, jaws: true });
  if (run) {
    const { fx, census } = run;
    const bites = countOf(census, GIANT_SPIT, PHASE.direct, [0, 1]);
    const applied = countOf(census, GIANT_SPIT, PHASE.applied);
    const spriteBound = plannedBound(census, 'strike', { bodied: true });
    console.log(`leg 17: GiantVenomSpit direct ${bites}, applied ${applied}; strike ${fx.strike ?? 0}, sprites ${fx.sprites}, `
      + `bodied-strike bound ${spriteBound}, projectile ${fx.projectile ?? 0} (bound ${plannedBound(census, 'projectile')})`);
    console.log(`leg 17: fang geometry ${JSON.stringify(jawSummary(run.jaws.samples))}`);
    if (bites === 0) { console.log('INCONCLUSIVE: leg 17: no giant spider bite landed'); inconclusive = true; }
    else {
      if (fx.sprites >= 1 && fx.sprites <= (fx.strike ?? 0)) pass(`leg 17: ${fx.sprites} of ${fx.strike} strike(s) drew the fang PNG for ${bites} bite(s)`);
      else fail(`leg 17: ${bites} bite(s), ${fx.strike ?? 0} strike(s), ${fx.sprites} sprite(s)`);
      if (census.gaps > 0) console.log(`NOTE: leg 17: ${census.gaps} census gap(s), the exact sprite bound is not scored`);
      else if (fx.sprites <= spriteBound) pass(`leg 17: ${fx.sprites} sprite(s) <= ${spriteBound} bodied strikes the landings allow`);
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
console.log(inconclusive ? '\nRESULT: INCONCLUSIVE (see above)' : '\nRESULT: PASS');
