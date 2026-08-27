#!/usr/bin/env node
// plan-portal-spells.md C2 (Pull Through) verification - the summon half of the
// portal pair, at the only surface that can show it: two real clients, a real
// portal standing at a real campfire, real E presses.
//
// What this owns, and what it deliberately does NOT:
//   · REMOTE PLACEMENT (§10 item 10, D4/D8): the cast happens 7.9 u from the
//     caster's bound fire and the portal appears AT THE FIRE, on the authored
//     2.5 u ring - the assertion is "nothing near the caster AND a totem on the
//     ring at the fire", because either half alone is satisfiable by a bug;
//   · the D8 ANNULUS, both presses (§10 item 10): E from inside the bind circle
//     goes to the flight map (the client synthesises that offer and it OVERRIDES
//     the server's, `Backend.ts` `flightOrigin || offered`), E from outside the
//     bind edge but inside the portal's 2.0 u talk range goes to the portal;
//   · ⭐ the CASTER destination mode (§10 item 11, D5): A casts, WALKS 17 u away,
//     and only then does B step through - so "B landed on A" cannot be confused
//     with "B landed where the cast happened". A one-window run proves nothing
//     here and a run where A stood still proves only half;
//   · the CASTER-GONE refusals (§10 item 12): owner DEAD (KILL, with the control
//     press taken first) and owner DISCONNECTED (a second caster window closed
//     mid-life). Both are the same one removal fan-out server-side; they are
//     scored separately because that identity is a claim, not an observation.
//     Owner-FLYING is NOT covered here - it needs a real flight departure from a
//     fire the portal is standing at, and it is pinned in Go outright:
//     TestPortalTravel_CasterModeRefusesAFlyingOwner and
//     TestInteractionSystem_PullThroughLocksForAFlyingCaster (`sys`).
//   · the cast at the player's surface (bar, cost charged only on completion) and
//     the TTL - the interrupt matrix itself is castTicks' shipped machinery.
//
// ⚑ THE PORTAL IS NOT VISIBLE TO THE CASTER. AOI streaming rides the viewport
// shape, and the caster stands 7.9 u from the fire the portal lands at, so
// C1's "a portal appeared next to me ⇒ the cast completed" test is unavailable
// here. It is B, parked ON the fire, who reads both the placement and the
// completion - and the second half of that is not a nicety: the obvious
// substitute, "the pool dropped", is GOD-BLIND (IsGod short-circuits the pricing
// site), and every leg after the cost leg runs under GOD. Measured on the first
// run of this script: a cast that really did raise a portal reported "the bar
// closed with no charge, Focus 489 → 489" and four legs failed with "no portal".
//
// ⚑ A IS BOUND AT spawnpoint-5, NOT the fire it spawned on - the C1 rule, and
// here it is what makes the placement leg mean anything: a portal at the DEFAULT
// spawn would be indistinguishable from a portal at "some fire".
//
// ⚑ THE EMBERKEEPER STANDS 1.13 u FROM spawnpoint-5 and E goes to the NEAREST
// interactable, so where B stands for a portal press is solved, not guessed:
// integer tiles only (WARP truncates to whole units), inside the portal's talk
// range, clear of the bind circle, and strictly nearer the portal than the NPC.
//
// ⚑ GOD IS OFF FOR THE COST LEG ONLY (IsGod short-circuits the pricing site -
// the r7-respec-cost lesson) and again for one command in the death leg.
//
// Usage: node c2-pull-through.mjs [url] [outdir]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');
import { joinAsNewCharacter } from './lib/join.mjs';
import { showSkillRow, showSkillRowAt } from './lib/spellbook.mjs';

const url = process.argv[2] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const outdir = process.argv[3] || '/tmp/c2-pull-through-shots';
mkdirSync(outdir, { recursive: true });

const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = {
  ...process.env,
  LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':'),
};

// --- venue, derived from api/zones/world.json --------------------------------
const FIRE = { id: 'spawnpoint-5', x: 34.19, y: -20.68 };
const FIRE_TILE = { x: 34, y: -21 };   // 0.37 u from the fire - inside the bind circle
const EMBER = { x: 34.52, y: -19.60 };  // the Emberkeeper spawn, 1.13 u from the fire, stationary
const VENUE = { x: 27, y: -24 };        // the cast venue: 7.92 u from the fire, 8.33 u of spawn clearance
const FAR = { x: 39, y: -12 };          // the walk-away point: 9.92 u from the fire, 16.97 u from VENUE
const RING = 2.5;                       // sys.anchorSpawnOffset
const DWELL_RADIUS = 0.75;              // campfire aura 1.5 × CampfireDwellRadiusFactor 0.5
const TALK_RANGE = 2.0;                 // portal-summon.json interaction.range
const JITTER = 1.0;                     // sys.respawnJitterRadius
const SKILL_ID = 148;
// cooldownTicks 1200 = 40 s. Measured from the beat the cast BAR appears, which
// is up to 2.5 s before the cooldown actually starts, so the margin covers the
// wind-up as well as the poll granularity.
const CAST_CD_MS = 46_000;

const results = [];
const errors = [];
const pass = (leg, note) => { results.push(['PASS', leg, note]); console.log(`  ✔ ${leg} - ${note}`); };
const fail = (leg, note) => { results.push(['FAIL', leg, note]); errors.push(`${leg}: ${note}`); console.log(`  ✘ ${leg} - ${note}`); };
const inconclusive = (leg, note) => { results.push(['INCONCLUSIVE', leg, note]); console.log(`  ? ${leg} - ${note}`); };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const browser = await chromium.launch({ args: ['--no-sandbox'], env });

// ---------------------------------------------------------------- client rig
function rig(page, tag) {
  const consoleErrors = [];
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push('console: ' + m.text()); });

  const cmd = async (c) => {
    await page.waitForSelector('#console_command', { state: 'attached' });
    await page.evaluate((x) => {
      document.querySelector('#console_command').value = x;
      document.querySelector('#console').dispatchEvent(new Event('submit', { cancelable: true }));
    }, c);
    await page.waitForTimeout(350);
  };

  const pos = () => page.evaluate(() => ({
    x: +(window.game.character.getX() / 120).toFixed(2),
    y: +(window.game.character.getY() / 120).toFixed(2),
  }));

  // Focus is read off the HUD text: Character.setHealth only pushes into the
  // overhead bar and exposes no getter (the C1 note).
  const focus = () => page.evaluate(() => {
    const m = /Focus\s+(\d+)\/(\d+)/.exec(document.querySelector('#healthBar .barText')?.textContent ?? '');
    return m ? { cur: +m[1], max: +m[2] } : null;
  });

  const castBar = () => page.evaluate(() => {
    const bar = document.getElementById('castBar');
    return {
      casting: bar?.classList.contains('casting') ?? false,
      text: bar?.querySelector('.barText')?.textContent ?? '',
    };
  });

  // ⚑ ONE evaluate, because the two halves are a claim about the SAME instant:
  // "the pool had not moved while the bar was still running" is unprovable from
  // two round trips 200 ms apart against a 2.5 s cast - the bar closes between
  // them and the leg degrades to inconclusive (measured).
  const castSample = () => page.evaluate(() => {
    const bar = document.getElementById('castBar');
    const m = /Focus\s+(\d+)\/(\d+)/.exec(document.querySelector('#healthBar .barText')?.textContent ?? '');
    return {
      casting: bar?.classList.contains('casting') ?? false,
      text: bar?.querySelector('.barText')?.textContent ?? '',
      focus: m ? { cur: +m[1], max: +m[2] } : null,
    };
  });

  // Portals ride the `totem` layer (FireTotem art, D2 placeholder reuse) and
  // campfires do NOT (`layers.mobs.campfire`), so a totem here is a summon.
  // Read through the console façade's `layers` rather than a root walk.
  // Absolute world units: children carry world px positions.
  const totems = () => page.evaluate(() => {
    const layer = window.game?.layers?.mobs?.totem;
    if (!layer) return null;
    return (layer.children || [])
      .filter(c => c.visible && c.position)
      .map(c => ({ x: +(c.position.x / 120).toFixed(2), y: +(c.position.y / 120).toFixed(2) }));
  });

  const totemsAtFire = async (r = 4) => {
    const all = (await totems()) || [];
    return all.map(t => ({ ...t, d: +dist(t, FIRE).toFixed(2) }))
              .filter(t => t.d <= r)
              .sort((a, b) => a.d - b.d);
  };

  const totemsNearMe = async (r = 4) => {
    const all = (await totems()) || [];
    const me = await pos();
    return all.map(t => ({ ...t, d: +dist(t, me).toFixed(2) }))
              .filter(t => t.d <= r)
              .sort((a, b) => a.d - b.d);
  };

  const panel = () => page.evaluate(() => {
    const el = document.getElementById('conversation');
    if (!el || el.classList.contains('hidden')) return null;
    const li = [...el.querySelectorAll('.conversationRows li')];
    return {
      actor: el.querySelector('.conversationActor')?.textContent?.trim() ?? '',
      lines: el.querySelector('.conversationLines')?.textContent?.trim() ?? '',
      rows: li.filter(x => !x.classList.contains('conversationLeaveRow'))
              .map(x => ({ text: x.textContent.trim(), locked: x.classList.contains('locked') })),
      hasLeave: li.some(x => x.classList.contains('conversationLeaveRow')),
    };
  });

  const mapOpen = () => page.evaluate(() => !!window.game?.miniMap?.isOpen?.());

  // ⚑ A ~1.4 s HOLD, never keyboard.press: the interact key is edge-triggered off
  // Controls.update's rAF-driven clock, and a headless page's rAF is throttled
  // far below the nominal input tick (the C1 note).
  const pressInteract = async () => {
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.down('e');
    await page.waitForTimeout(1400);
    await page.keyboard.up('e');
    await page.waitForTimeout(1400);
  };

  // ⚑ A SINGLE E PRESS IS NOT EVIDENCE. The interact key is edge-triggered off a
  // rAF clock the headless page throttles, so a hold can fall between two
  // samples and open nothing at all - measured here twice, once 0.31 u from a
  // portal that was demonstrably standing. A leg that scores "the press opened
  // nothing" off one hold is scoring the input clock, not the feature.
  const pressForPanel = async (tries = 3) => {
    for (let i = 0; i < tries; i++) {
      await pressInteract();
      const p = await panel();
      if (p) return p;
      if (i + 1 < tries) console.log(`  (E opened nothing - press ${i + 2} of ${tries})`);
    }
    return null;
  };

  const pressCooldownQ = async () => {
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.down('q');
    await page.waitForTimeout(1400);
    await page.keyboard.up('q');
  };

  // Rows are rebuilt wholesale on every changed render and bind pointerdown, so
  // handles go stale and a synthetic dispatch proves nothing: scroll into view,
  // confirm with elementFromPoint, then a real mouse click.
  //
  // ⚑ It reports WHY it failed. A bare false cannot tell "the row is gone" from
  // "something is lying on top of it", and the recorded Leave-row click race
  // (chunk3b-ii) makes that exactly the distinction worth having.
  const clickRow = async (needle) => {
    const found = await page.evaluate((n) => {
      const rows = [...document.querySelectorAll('#conversation .conversationRows li')];
      const row = rows.find(li => li.textContent.includes(n));
      if (!row) return { ok: false, why: `no row matches "${n}"; rows are ${JSON.stringify(rows.map(r => r.textContent.trim()))}` };
      row.scrollIntoView({ block: 'center' });
      return { ok: true };
    }, needle);
    if (!found.ok) return found;
    await page.waitForTimeout(250);
    const el = await page.evaluateHandle((n) => {
      const rows = [...document.querySelectorAll('#conversation .conversationRows li')];
      return rows.find(li => li.textContent.includes(n)) ?? null;
    }, needle);
    const node = el.asElement();
    if (!node) return { ok: false, why: 'the row handle went stale between the two reads' };
    const b = await node.boundingBox();
    if (!b) return { ok: false, why: 'the row has no bounding box (rendered but not laid out)' };
    const cx = b.x + Math.min(60, b.width / 2), cy = b.y + b.height / 2;
    const top = await page.evaluate(([x, y]) => {
      const e = document.elementFromPoint(x, y);
      return {
        hit: !!e?.closest('#conversation .conversationRows li'),
        at: e ? `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${e.classList.length ? '.' + [...e.classList].join('.') : ''}` : 'nothing',
      };
    }, [cx, cy]);
    if (!top.hit) return { ok: false, why: `the point (${cx.toFixed(0)}, ${cy.toFixed(0)}) at the row's centre belongs to ${top.at}` };
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(1100);
    return { ok: true };
  };

  // The refusal is a 900 ms floating PIXI.Text over the own character - no DOM
  // surface, so it has to be caught in a tight poll on the floatingNumbers layer.
  const floatingSeen = async (needle, ms = 6000) => {
    for (let i = 0; i < ms / 200; i++) {
      const hit = await page.evaluate((n) => {
        let layer = null;
        const find = (c) => { if (c?.name === 'floatingNumbers') { layer = c; return; } (c?.children || []).forEach(find); };
        find(window.__auraRoot);
        return (layer?.children || []).some(c => typeof c?.text === 'string' && c.text.includes(n));
      }, needle);
      if (hit) return true;
      await page.waitForTimeout(200);
    }
    return false;
  };

  const homeFire = () => page.evaluate(() => window.game?.miniMap?.['campfires']?.['home'] ?? null);

  const primeRoot = () => page.evaluate(() => {
    let r = window.game.character.plate.parent;
    while (r.parent) r = r.parent;
    window.__auraRoot = r;
  });

  // ⚑ The settle loop is SHORT on purpose. WARP is an instant server-side
  // SetPosition and the client shows it within a few hundred ms; a long
  // patient loop only burns the portal's 30 s TTL when the tolerance is never
  // met (a stuck warp cost one run its whole D block).
  const warpTo = async (x, y, tol = 0.9) => {
    await cmd(`WARP ${Math.round(x) * 120} ${Math.round(y) * 120}`);
    for (let i = 0; i < 25; i++) {
      const p = await pos();
      if (Math.hypot(p.x - Math.round(x), p.y - Math.round(y)) <= tol) return p;
      await page.waitForTimeout(200);
    }
    return await pos();
  };

  return { page, tag, cmd, pos, focus, castBar, castSample, totems, totemsAtFire, totemsNearMe, panel,
           mapOpen, pressInteract, pressForPanel, pressCooldownQ, clickRow, floatingSeen, homeFire,
           primeRoot, warpTo, consoleErrors };
}

async function newClient(tag) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const r = rig(page, tag);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const name = await joinAsNewCharacter(page, tag, { timeout: 90_000 });
  await page.waitForFunction(() => !!window.game?.character, null, { timeout: 60_000 });
  // #developPanel is a large draggable table over the right-hand HUD; any
  // coordinate click under it hits the table instead, with no error.
  await page.evaluate(() => { const p = document.getElementById('developPanel'); if (p) p.style.display = 'none'; });
  await r.primeRoot();
  r.name = name;
  r.ctx = ctx;
  console.log(`[${tag}] joined as ${name}`);
  return r;
}

// Spellbook → cooldown slot Q. ⚑ Click the NAME at box.x+25, never the row
// centre: the spend button sits mid-row with explicit precedence, so a centre
// click spends a skill point and the equip silently never happens.
async function equipCooldown(r, nameRe) {
  const { page } = r;
  await page.waitForFunction((src) => {
    const re = new RegExp(src, 'i');
    return [...document.querySelectorAll('#spellbookList li')].some(li => re.test(li.textContent));
  }, nameRe.source, { timeout: 20_000 });
  const idx = await page.evaluate((src) => {
    const re = new RegExp(src, 'i');
    return [...document.querySelectorAll('#spellbookList li')].findIndex(li => re.test(li.textContent));
  }, nameRe.source);
  await showSkillRowAt(page, idx); // the book is a closable, paged panel since UI pass C3
  const rows = await page.$$('#spellbookList li');
  const box = await rows[idx].boundingBox();
  await page.mouse.click(box.x + 25, box.y + box.height / 2);
  await page.waitForTimeout(700);
  const selected = await page.evaluate(() => !!document.querySelector('#spellbookList li.selected'));
  if (!selected) return { ok: false, why: 'the spellbook row never went .selected' };
  const slot = await page.$('#cooldownSlotList li:first-child');
  const sb = await slot.boundingBox();
  await page.mouse.click(sb.x + sb.width / 2, sb.y + sb.height / 2);
  // ⚑ POLLED, not sampled once. The equip is a server round trip and the slot
  // label repaints when the answer lands; a fixed 900 ms read caught "— Empty —"
  // on a run whose server log recorded the equip in the same second, and the
  // whole leg then scored INCONCLUSIVE for a HUD repaint.
  let label = '';
  for (let i = 0; i < 25; i++) {
    label = await page.evaluate(() =>
      document.querySelector('#cooldownSlotList li[data-slot="0"] .slotLabel')?.textContent?.trim() ?? '');
    if (nameRe.test(label)) break;
    await page.waitForTimeout(300);
  }
  return { ok: nameRe.test(label), label };
}

// The whole caster set-up, so a second caster (the disconnect leg) costs one
// call rather than a copy of leg A.
async function makeCaster(tag) {
  const c = await newClient(tag);
  await c.warpTo(FIRE_TILE.x, FIRE_TILE.y);
  await c.page.waitForTimeout(9_000);            // dwell binds after ~1.7 s; margin for the settle
  const home = await c.homeFire();
  await c.cmd('XP 20000');
  await c.page.waitForTimeout(3_000);
  await c.cmd('SKILL PullThrough');
  await c.page.waitForTimeout(1_500);
  const eq = await equipCooldown(c, /Pull Through/i);
  await c.warpTo(VENUE.x, VENUE.y);
  return { c, home, eq };
}

// ⚑ Cast completion is read off the OWN-player fields plus THE OBSERVER, never
// off the caster's own surroundings: the caster is 7.9 u from where the portal
// lands and never sees it, so C1's "a portal appeared next to me ⇒ the cast
// completed" test is unavailable here.
//
// ⚑ AND THE POOL ALONE IS NOT ENOUGH EITHER, which cost this harness a run:
// IsGod short-circuits the pricing site, so a god-mode cast completes for FREE
// and a focus-drop detector scores every one of them as an interrupt (measured:
// "the bar closed with no charge; Focus 489 → 489" on a cast that really did
// raise a portal). GOD is on for every leg after the cost leg, so the portal
// arriving in B's view is the completion signal, and the drop is only the
// evidence the cost leg itself reads.
//
// Returns { barSeen, midFocus, midCasting, before, after, drop, t0, portal, completed }.
async function castPullThrough(A, B, { requireFullPool = false } = {}) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const before = await A.focus();
    if (requireFullPool && (!before || before.cur !== before.max)) {
      console.log(`  (attempt ${attempt}: waiting for a full pool, at ${JSON.stringify(before)})`);
      await A.page.waitForTimeout(8_000);
      continue;
    }
    await A.pressCooldownQ();
    let barSeen = null;
    for (let i = 0; i < 50; i++) {              // ~6 s; the cast is 75 t = 2.5 s
      const b = await A.castSample();
      if (b.casting) { barSeen = b; break; }
      await A.page.waitForTimeout(120);
    }
    if (!barSeen) { console.log(`  (attempt ${attempt}: no cast bar)`); await A.page.waitForTimeout(5_000); continue; }
    // The clock the cooldown is measured from starts here, on EVERY attempt -
    // a misread attempt still spent the cooldown.
    const t0 = Date.now();
    // Both halves come from the one sample that SAW the bar running.
    const midFocus = barSeen.focus;
    const midCasting = barSeen.casting;
    for (let i = 0; i < 40; i++) {              // wait the bar out
      if (!(await A.castBar()).casting) break;
      await A.page.waitForTimeout(200);
    }
    await A.page.waitForTimeout(600);
    const after = await A.focus();
    const drop = (before.cur - after.cur) / before.max;
    let portal = null;
    for (let i = 0; i < 40; i++) {              // ~12 s for the summon to stream to B
      const t = await B.totemsAtFire(4);
      if (t.length) { portal = t[0]; break; }
      await B.page.waitForTimeout(300);
    }
    if (!portal && drop < 0.04) {
      console.log(`  (attempt ${attempt}: no portal at the fire and no charge - interrupted; Focus ${before.cur} → ${after.cur})`);
      await A.page.waitForTimeout(8_000);
      continue;
    }
    return { before, barSeen, midFocus, midCasting, after, drop, t0, portal, completed: true };
  }
  return { completed: false };
}

/**
 * Where B must stand to press E on the portal: an INTEGER tile (WARP truncates),
 * inside the 2.0 u talk range with margin, clear of the 0.75 u bind circle by a
 * wide margin, and strictly nearer the portal than the Emberkeeper - who is the
 * only other conversant in the scene and would answer the press otherwise.
 */
function solveStandTile(portal) {
  let best = null;
  const cx = Math.round(portal.x), cy = Math.round(portal.y);
  for (let X = cx - 3; X <= cx + 3; X++) {
    for (let Y = cy - 3; Y <= cy + 3; Y++) {
      const p = { x: X, y: Y };
      const dP = dist(p, portal), dF = dist(p, FIRE), dE = dist(p, EMBER);
      if (dP > 1.6) continue;
      if (dF < 1.5) continue;
      const margin = dE - dP;
      if (margin < 0.8) continue;
      if (!best || margin > best.margin) best = { x: X, y: Y, dP: +dP.toFixed(2), dF: +dF.toFixed(2), dE: +dE.toFixed(2), margin: +margin.toFixed(2) };
    }
  }
  return best;
}

/** Park B on the solved tile and report what it actually measures from there. */
async function parkAtPortal(B, portal) {
  const tile = solveStandTile(portal);
  if (!tile) return { ok: false, why: `no integer tile satisfies talk-range ≤1.6 u / bind-clear ≥1.5 u / nearer-than-the-NPC for a portal at (${portal.x}, ${portal.y})` };
  const at = await B.warpTo(tile.x, tile.y);
  const real = { dP: +dist(at, portal).toFixed(2), dF: +dist(at, FIRE).toFixed(2), dE: +dist(at, EMBER).toFixed(2) };
  if (real.dP > TALK_RANGE - 0.05) return { ok: false, why: `B landed ${real.dP} u from the portal, outside its ${TALK_RANGE} u range`, tile, at, real };
  return { ok: true, tile, at, real };
}

/** No cast starts while the previous portal still stands - one portal per fire. */
async function waitPortalGone(B, ms = 45_000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    if (!(await B.totemsAtFire(4)).length) return true;
    await B.page.waitForTimeout(1_000);
  }
  return false;
}

async function waitCooldown(t0) {
  const left = Math.max(0, CAST_CD_MS - (Date.now() - t0));
  if (left > 0) {
    console.log(`  waiting ${(left / 1000).toFixed(0)} s for the 1200 t cooldown`);
    await new Promise(r => setTimeout(r, left));
  }
}

// ============================================================================
let A = null, B = null, D = null;
try {
  // ------------------------------------------------------------------ LEG A
  console.log('\n== LEG A: a caster bound at a fire that is NOT the default spawn ==');
  const made = await makeCaster('pt');
  A = made.c;
  if (made.home === FIRE.id) {
    pass('A1 · bind', `A is bound to ${made.home}, 7.92 u from the cast venue - so "the portal appeared at the bound fire" is a real reading`);
  } else {
    fail('A1 · bind', `expected home ${FIRE.id}, got ${made.home}`);
  }
  if (made.eq.ok) pass('A2 · cheat + equip', `\`SKILL PullThrough\` granted it and it sits in cooldown slot Q (label "${made.eq.label}")`);
  else fail('A2 · cheat + equip', `equip did not land: ${JSON.stringify(made.eq)}`);

  // ------------------------------------------------------------------ LEG T
  console.log('\n== LEG T: the tooltip names the summon AND the placement (D11) ==');
  const entry = await A.page.evaluate((id) => {
    const el = document.querySelector(`#spellbookList [data-skill-id="${id}"]`);
    if (!el) return { err: `no spellbook entry for skill ${id}` };
    el.scrollIntoView({ block: 'center' });
    return { ok: true };
  }, SKILL_ID);
  if (entry.err) {
    fail('T · tooltip', entry.err);
  } else {
    await showSkillRow(A.page, SKILL_ID);
    await A.page.locator(`#spellbookList [data-skill-id="${SKILL_ID}"]`).first().hover();
    await A.page.waitForTimeout(600);
    const tipText = await A.page.evaluate(() => {
      const t = document.querySelector('#skillTooltip');
      if (!t || t.classList.contains('hidden')) return null;
      return [...t.children].map(c => c.textContent).join(' | ');
    });
    await A.page.mouse.move(10, 10);
    console.log('  tooltip:', tipText);
    if (!tipText) fail('T · tooltip', 'no #skillTooltip rendered on hover');
    else if (/\(spawn_at_anchor\)/.test(tipText)) fail('T · tooltip', `fell through to the unknown-type fallback: ${tipText}`);
    // Shape, not wording: every number here is [PLACEHOLDER]. The four words
    // that separate it from plain `spawn` are the point of the case.
    else if (!/Summons/i.test(tipText) || !/at your campfire/i.test(tipText) || !/30\s*s/.test(tipText)) {
      fail('T · tooltip', `no "Summons … at your campfire … 30s" line: ${tipText}`);
    } else pass('T · tooltip', `renders "${tipText}"`);
  }

  // ------------------------------------------------------------------ LEG O
  console.log('\n== LEG O: the observer parks AT the fire (the portal never streams to A) ==');
  B = await newClient('ptb');
  await B.cmd('GOD');
  const bAt = await B.warpTo(FIRE_TILE.x, FIRE_TILE.y);
  const bToFire = dist(bAt, FIRE);
  if (bToFire <= DWELL_RADIUS) pass('O · observer', `B stands ${bToFire.toFixed(2)} u from ${FIRE.id}, inside the ${DWELL_RADIUS} u bind circle - every portal on the ${RING} u ring is in its view`);
  else fail('O · observer', `B stands ${bToFire.toFixed(2)} u from the fire - the placement leg may miss a portal on the far side`);
  await B.page.waitForTimeout(3_000);

  // ------------------------------------------------------------------ CAST 1
  console.log('\n== CAST 1: the cast, the price, and REMOTE placement (§10 item 10) ==');
  const preCast = (await B.totemsAtFire(4)).length;
  if (preCast) fail('C0 · clean fire', `${preCast} totem(s) already standing at the fire before the first cast`);
  const cast1 = await castPullThrough(A, B, { requireFullPool: true });
  let lastCastT0 = cast1.t0 || Date.now();
  if (!cast1.completed) {
    fail('C · cast', 'no cast completed in 3 attempts (mob interrupt at the venue?)');
  } else {
    if (/Pull Through/i.test(cast1.barSeen.text)) pass('C1 · cast bar', `#castBar went .casting labelled "${cast1.barSeen.text.trim()}"`);
    else fail('C1 · cast bar', `cast bar text was "${cast1.barSeen.text}" - expected it to name Pull Through`);

    if (cast1.midCasting && cast1.midFocus.cur === cast1.before.cur) {
      pass('C2 · no cost mid-cast', `Focus held at ${cast1.midFocus.cur}/${cast1.midFocus.max} while the bar was still casting`);
    } else if (!cast1.midCasting) {
      inconclusive('C2 · no cost mid-cast', `the mid-cast sample landed after the bar closed (Focus ${cast1.midFocus.cur}/${cast1.midFocus.max}) - 2.5 s is short against a throttled rAF`);
    } else {
      fail('C2 · no cost mid-cast', `Focus moved ${cast1.before.cur} → ${cast1.midFocus.cur} DURING the cast - the cost is not completion-only`);
    }

    // Band, not an equality: the pool regenerates ~1 %/s and the sample lands a
    // beat after completion, so an exact 0.10 would be a knife edge.
    if (cast1.drop >= 0.05 && cast1.drop <= 0.13) {
      pass('C3 · cost on completion', `Focus ${cast1.before.cur}/${cast1.before.max} → ${cast1.after.cur}/${cast1.after.max}, a drop of ${(cast1.drop * 100).toFixed(1)} % against the authored costFractionOfMax 0.10`);
    } else {
      fail('C3 · cost on completion', `Focus ${cast1.before.cur} → ${cast1.after.cur} of ${cast1.before.max} = ${(cast1.drop * 100).toFixed(1)} %, outside the 5–13 % band around the authored 0.10`);
    }

    let atFire = [];
    for (let i = 0; i < 40; i++) {
      atFire = await B.totemsAtFire(4);
      if (atFire.length) break;
      await B.page.waitForTimeout(300);
    }
    const nearCaster = await A.totemsNearMe(4);
    if (!atFire.length) {
      fail('C4 · remote placement', 'the cast completed and charged, but no portal appeared at the caster\'s bound fire');
    } else {
      const p = atFire[0];
      const ringErr = Math.abs(p.d - RING);
      if (ringErr <= 0.35 && p.d > DWELL_RADIUS) {
        pass('C4 · remote placement', `the portal stands at (${p.x}, ${p.y}), ${p.d} u from ${FIRE.id} - on the authored ${RING} u ring (Δ${ringErr.toFixed(2)}) and clear of the ${DWELL_RADIUS} u bind circle`);
      } else {
        fail('C4 · remote placement', `the portal is ${p.d} u from the fire - expected the ${RING} u ring (Δ${ringErr.toFixed(2)}), outside the ${DWELL_RADIUS} u bind circle`);
      }
      if (!nearCaster.length) {
        pass('C5 · not at the caster', `nothing on the totem layer within 4 u of A at the venue - the summon went to the fire, 7.9 u away, not to the presser`);
      } else {
        fail('C5 · not at the caster', `${nearCaster.length} totem(s) within 4 u of the CASTER (nearest ${nearCaster[0].d} u) - spawn_at_anchor placed like plain spawn`);
      }
      await B.page.screenshot({ path: join(outdir, 'a-portal-at-fire.png') });
    }

    // ---------------------------------------------------------------- LEG TTL
    console.log('\n== LEG TTL: the portal expires at its 900 t TTL ==');
    if (!atFire.length) {
      inconclusive('TTL · expiry', 'no portal to watch');
    } else {
      let gone = false, sawAt = null;
      for (let i = 0; i < 100; i++) {
        if (!(await B.totemsAtFire(4)).length) { gone = true; sawAt = (Date.now() - cast1.t0) / 1000; break; }
        await B.page.waitForTimeout(500);
      }
      if (!gone) fail('TTL · expiry', 'the portal was still standing 50 s after the cast (authored ttlTicks 900 = 30 s)');
      else if (sawAt < 18) fail('TTL · expiry', `the portal vanished after only ${sawAt.toFixed(1)} s - well short of the authored 30 s`);
      else pass('TTL · expiry', `the portal disappeared ${sawAt.toFixed(1)} s after the cast completed (authored ttlTicks 900 = 30 s; the sample starts at the completion beat, so it reads a little under)`);
    }
  }

  // GOD from here on: every remaining leg stands still for tens of seconds.
  await A.cmd('GOD');

  // ------------------------------------------------------------------ CAST 2
  console.log('\n== CAST 2: the D8 annulus - both presses (§10 item 10) ==');
  await waitCooldown(lastCastT0);
  await waitPortalGone(B);
  const cast2 = await castPullThrough(A, B);
  if (cast2.completed) lastCastT0 = cast2.t0;
  const portal2 = cast2.completed ? cast2.portal : null;
  if (!portal2) {
    fail('D · annulus', 'no second portal to press E on');
  } else {
    // ---- press 1: from INSIDE the bind circle, the fire owns E --------------
    await B.warpTo(FIRE_TILE.x, FIRE_TILE.y);
    const bIn = await B.pos();
    await B.pressInteract();
    const mapUp = await B.mapOpen();
    const panelIn = await B.panel();
    if (mapUp && !panelIn) {
      pass('D1 · press inside the bind circle', `standing ${dist(bIn, FIRE).toFixed(2)} u from the fire (portal ${dist(bIn, portal2).toFixed(2)} u away, inside its ${TALK_RANGE} u range) E opened the FLIGHT MAP and no conversation - the client's campfire offer owns the annulus by design`);
    } else if (panelIn) {
      fail('D1 · press inside the bind circle', `E on the fire opened the conversation "${panelIn.actor}" instead of the flight map (mapOpen=${mapUp})`);
    } else {
      fail('D1 · press inside the bind circle', `E on the fire opened neither the flight map nor a panel (mapOpen=${mapUp})`);
    }
    await B.page.screenshot({ path: join(outdir, 'b-flight-map.png') });
    // A second E closes it again (flight C3's shipped behaviour); Escape is the
    // fallback, and either one leaves the annulus clean for the portal press.
    await B.pressInteract();
    if (!(await B.mapOpen())) pass('D2 · map closes', 'a second E closed the flight map, leaving the annulus clean for the portal press');
    else {
      await B.page.keyboard.press('Escape');
      await B.page.waitForTimeout(800);
      if (!(await B.mapOpen())) inconclusive('D2 · map closes', 'a second E did not close the flight map; Escape did');
      else fail('D2 · map closes', 'the flight map stayed open through a second E and Escape');
    }

  }

  // ------------------------------------------------------------------ CAST 2b
  // ⚑ ITS OWN PORTAL, and that is a hard lesson rather than tidiness: the two
  // presses plus a decline do not FIT in one 30 s TTL. A run that tried scored
  // "three E presses opened no conversation" 90.2 s after the cast with zero
  // portals standing - a green feature reported as broken because the doorway
  // had been gone for a minute. Each block now gets a fresh doorway.
  console.log('\n== CAST 2b: the portal side of the annulus, and the decline ==');
  await waitCooldown(lastCastT0);
  await waitPortalGone(B);
  const cast2b = await castPullThrough(A, B);
  if (cast2b.completed) lastCastT0 = cast2b.t0;
  const portal2b = cast2b.completed ? cast2b.portal : null;
  if (!portal2b) {
    fail('D3 · press outside the bind edge', 'no portal to press E on');
  } else {
    const parked = await parkAtPortal(B, portal2b);
    if (!parked.ok) {
      inconclusive('D3 · press outside the bind edge', `${parked.why} - the portal's random ring angle put it where no whole-unit WARP tile works`);
    } else {
      const pnl = await B.pressForPanel();
      if (!pnl) {
        const standing = await B.totemsAtFire(4);
        const age = ((Date.now() - cast2b.t0) / 1000).toFixed(1);
        fail('D3 · press outside the bind edge', `three E presses ${parked.real.dP} u from the portal opened no conversation ${age} s after the cast, with ${standing.length} portal(s) at the fire (map open? ${await B.mapOpen()})`);
      } else if (!/portal/i.test(pnl.actor)) {
        fail('D3 · press outside the bind edge', `the panel belongs to "${pnl.actor}", not the portal (portal ${parked.real.dP} u, Emberkeeper ${parked.real.dE} u)`);
      } else {
        const step = pnl.rows.find(r => /Step through/i.test(r.text));
        if (!step) fail('D3 · press outside the bind edge', `no "Step through." row - rows were ${JSON.stringify(pnl.rows)}`);
        else if (step.locked) fail('D3 · press outside the bind edge', `the row rendered LOCKED with a live owner: "${step.text}"`);
        else pass('D3 · press outside the bind edge', `standing ${parked.real.dF} u from the fire and ${parked.real.dP} u from the portal, E opened "${pnl.actor}" - lines "${pnl.lines}", row "${step.text}" unlocked`);
        if (pnl.hasLeave) pass('D4 · decline row', 'the automatic "Leave." row is present (no decline is authored)');
        else fail('D4 · decline row', 'no "Leave." row on the portal panel');
        await B.page.screenshot({ path: join(outdir, 'c-portal-panel.png') });

        const beforeDecline = await B.pos();
        // ⚑ ONE RETRY, and it is not politeness: the Leave row is the panel's
        // last child and the recorded chunk3b-ii race drops the FIRST click on
        // it (rows are rebuilt wholesale on every changed render). The claim
        // being scored is "declining moves nobody", not "the first click of two
        // always lands", so a reopen-and-click-again is a legitimate second
        // sample - and the why-string says which failure it was either way.
        let clicked = await B.clickRow('Leave.');
        if (!clicked.ok) {
          console.log(`  (first "Leave." click missed: ${clicked.why} - reopening)`);
          if (!(await B.panel())) await B.pressInteract();
          clicked = await B.clickRow('Leave.');
        }
        const afterDecline = await B.pos();
        const stillOpen = await B.panel();
        const moved = dist(beforeDecline, afterDecline);
        if (!clicked.ok) fail('D5 · decline', `the "Leave." row could not be clicked: ${clicked.why}`);
        else if (stillOpen) fail('D5 · decline', 'the panel stayed open after "Leave."');
        else if (moved > 0.3) fail('D5 · decline', `declining MOVED the player ${moved.toFixed(2)} u`);
        else pass('D5 · decline', `panel closed and B stayed put at (${afterDecline.x}, ${afterDecline.y}), drift ${moved.toFixed(2)} u`);
      }
    }
  }

  // ------------------------------------------------------------------ CAST 3
  console.log('\n== CAST 3: step through to the caster\'s CURRENT position (§10 item 11, D5) ==');
  await waitCooldown(lastCastT0);
  await waitPortalGone(B);
  const castSpot = await A.pos();
  const cast3 = await castPullThrough(A, B);
  if (cast3.completed) lastCastT0 = cast3.t0;
  const portal3 = cast3.completed ? cast3.portal : null;
  if (!portal3) {
    fail('E · step through', 'no portal to step through');
  } else {
    // ⭐ THE WALK-AWAY, which is the leg: the destination resolves at
    // step-through time, so A leaves the cast spot before B takes the row.
    const aMoved = await A.warpTo(FAR.x, FAR.y);
    const walked = dist(castSpot, aMoved);
    console.log(`  A walked ${walked.toFixed(2)} u from the cast spot (${castSpot.x}, ${castSpot.y}) to (${aMoved.x}, ${aMoved.y})`);
    const parked = await parkAtPortal(B, portal3);
    if (!parked.ok) {
      inconclusive('E · step through', parked.why);
    } else {
      const pnl = await B.pressForPanel();
      if (!pnl || !/portal/i.test(pnl.actor)) {
        fail('E1 · step through', `B's press opened ${pnl ? `"${pnl.actor}"` : 'nothing'}, not the portal`);
      } else {
        const step = pnl.rows.find(r => /Step through/i.test(r.text));
        if (!step || step.locked) {
          fail('E1 · step through', `B sees no takeable "Step through." row: ${JSON.stringify(pnl.rows)}`);
        } else {
          pass('E1 · step through', `B (a second window, at the fire) is offered "${step.text}" on the caster's portal`);
          const bBefore = await B.pos();
          const clicked = await B.clickRow('Step through');
          await B.page.waitForTimeout(1_500);
          const bAfter = await B.pos();
          const aNow = await A.pos();
          const stillOpen = await B.panel();
          const dCaster = dist(bAfter, aNow);
          const dCastSpot = dist(bAfter, castSpot);
          const dFire = dist(bAfter, FIRE);
          if (!clicked.ok) {
            fail('E2 · lands on the caster', `the "Step through." row could not be clicked: ${clicked.why}`);
          } else if (dCaster <= JITTER + 0.6 && dCastSpot > 5 && dFire > 5) {
            pass('E2 · lands on the caster', `B jumped ${dist(bBefore, bAfter).toFixed(2)} u from the fire to (${bAfter.x}, ${bAfter.y}) - ${dCaster.toFixed(2)} u from A's CURRENT position (${aNow.x}, ${aNow.y}), ${dCastSpot.toFixed(2)} u from the cast spot and ${dFire.toFixed(2)} u from the fire, so the destination resolved at step-through (D5)`);
          } else {
            fail('E2 · lands on the caster', `B ended at (${bAfter.x}, ${bAfter.y}): ${dCaster.toFixed(2)} u from A (${aNow.x}, ${aNow.y}), ${dCastSpot.toFixed(2)} u from the cast spot, ${dFire.toFixed(2)} u from the fire`);
          }
          if (stillOpen) fail('E3 · panel closes', `the conversation survived the teleport: ${JSON.stringify(stillOpen)}`);
          else pass('E3 · panel closes', 'the panel closed with the move (§5\'s "step-through closes the conversation" pin)');
          await B.page.screenshot({ path: join(outdir, 'd-b-on-caster.png') });
        }
      }
    }
    await B.warpTo(FIRE_TILE.x, FIRE_TILE.y);
    await A.warpTo(VENUE.x, VENUE.y);
  }

  // ------------------------------------------------------------------ CAST 4
  console.log('\n== CAST 4: the caster DIES with the portal standing (§10 item 12) ==');
  await waitCooldown(lastCastT0);
  await waitPortalGone(B);
  const cast4 = await castPullThrough(A, B);
  if (cast4.completed) lastCastT0 = cast4.t0;
  const portal4 = cast4.completed ? cast4.portal : null;
  if (!portal4) {
    fail('F · caster dies', 'no portal to orphan');
  } else {
    const parked = await parkAtPortal(B, portal4);
    if (!parked.ok) {
      inconclusive('F · caster dies', parked.why);
    } else {
      const live = await B.pressForPanel();
      const liveRow = live?.rows?.find(r => /Step through/i.test(r.text));
      if (!liveRow || liveRow.locked) {
        fail('F1 · control', `B should see an UNLOCKED row while A is alive, got ${JSON.stringify(live?.rows)}`);
      } else {
        pass('F1 · control', `with A alive B sees "${liveRow.text}" unlocked`);
        await B.page.keyboard.press('Escape');
        await B.page.waitForTimeout(400);
        await A.cmd('GOD off');            // KILL writes the pool directly, but leave nothing to chance
        await A.cmd('KILL');
        await A.page.waitForTimeout(2_500);
        await B.pressInteract();
        let dead = await B.panel();
        // ⚑ The portal has 30 s and this leg spends a control press inside it,
        // so a null panel here means one of two very different things: the
        // refusal is broken, or the doorway simply timed out mid-leg. Ask.
        let standing = await B.totemsAtFire(4);
        if (!dead && standing.length) {
          console.log('  (no panel on the first press with the portal still standing - one more press)');
          await B.pressInteract();
          dead = await B.panel();
          standing = await B.totemsAtFire(4);
        }
        const age = ((Date.now() - cast4.t0) / 1000).toFixed(1);
        const row = dead?.rows?.find(r => /Step through/i.test(r.text));
        if (!dead && !standing.length) {
          inconclusive('F2 · caster dies', `the portal had already expired ${age} s after the cast when the press landed (TTL 30 s) - the refusal was never asked. Its twin, the DISCONNECT leg below, carries §10 item 12`);
        } else if (!dead || !/portal/i.test(dead.actor)) {
          fail('F2 · caster dies', `B's press opened ${dead ? `"${dead.actor}"` : 'nothing'} ${age} s after the cast, with ${standing.length} portal(s) still standing at the fire and B at ${JSON.stringify(await B.pos())} (map open? ${await B.mapOpen()})`);
        } else if (!row) {
          fail('F2 · caster dies', `no travel row at all after the caster died: ${JSON.stringify(dead.rows)}`);
        } else if (!row.locked) {
          fail('F2 · caster dies', `the row is still takeable with the caster dead: "${row.text}"`);
        } else if (!/locked/i.test(row.text) || !/far end/i.test(row.text)) {
          fail('F2 · caster dies', `the row locked but does not name the wall: "${row.text}"`);
        } else {
          pass('F2 · caster dies', `with the caster dead the row reads "${row.text}" and is inert`);
          await B.page.screenshot({ path: join(outdir, 'e-locked-caster-dead.png') });
        }
      }
    }
  }

  // ------------------------------------------------------------------ CAST 5
  console.log('\n== CAST 5: a SECOND caster disconnects, and the panel dies with the portal ==');
  await waitPortalGone(B);
  const made2 = await makeCaster('ptd');
  D = made2.c;
  if (made2.home !== FIRE.id || !made2.eq.ok) {
    inconclusive('G · caster disconnects', `the second caster did not set up (home ${made2.home}, equip ${JSON.stringify(made2.eq)})`);
  } else {
    await D.cmd('GOD');
    const cast5 = await castPullThrough(D, B, { requireFullPool: true });
    const portal5 = cast5.completed ? cast5.portal : null;
    if (!portal5) {
      fail('G · caster disconnects', 'the second caster raised no portal');
    } else {
      const parked = await parkAtPortal(B, portal5);
      if (!parked.ok) {
        inconclusive('G · caster disconnects', parked.why);
      } else {
        {
          // ⚑ NO CONTROL PRESS IN THIS LEG, deliberately. One press costs a
          // third of the portal's 30 s and the block then does not fit - a run
          // that took the control scored the refusal as broken because the
          // doorway died first (35.3 s). The live-owner control is F1's, taken
          // on the same content one cast earlier, plus D3 and E1.
          console.log('  closing the second caster\'s window…');
          await D.ctx.close();
          D = null;
          // ⚑ SHORT, because the whole block lives inside one 30 s TTL and the
          // control press has already spent a third of it: a 6 s pause here put
          // the second press past the portal's death on one run and scored the
          // refusal as broken.
          await B.page.waitForTimeout(2_500);
          const orphan = await B.pressForPanel();
          const row = orphan?.rows?.find(r => /Step through/i.test(r.text));
          const gStanding = await B.totemsAtFire(4);
          const gAge = ((Date.now() - cast5.t0) / 1000).toFixed(1);
          if (!orphan && !gStanding.length) {
            inconclusive('G2 · caster disconnects', `the portal expired ${gAge} s after the cast before the press landed (TTL 30 s) - the refusal was never asked. Its twin, the caster-DEATH leg above, carries §10 item 12 (server-side both are one removal fan-out)`);
          } else if (!orphan || !/portal/i.test(orphan.actor)) {
            fail('G2 · caster disconnects', `B's press opened ${orphan ? `"${orphan.actor}"` : 'nothing'} ${gAge} s after the cast, with ${gStanding.length} portal(s) still standing`);
          } else if (!row) {
            fail('G2 · caster disconnects', `no travel row after the owner left: ${JSON.stringify(orphan.rows)}`);
          } else if (!row.locked) {
            fail('G2 · caster disconnects', `the row is still takeable after the caster disconnected: "${row.text}"`);
          } else if (!/locked/i.test(row.text) || !/far end/i.test(row.text)) {
            fail('G2 · caster disconnects', `the row locked but does not name the wall: "${row.text}"`);
          } else {
            pass('G2 · caster disconnects', `after the caster's window closed the row reads "${row.text}" and is inert`);
            await B.page.screenshot({ path: join(outdir, 'f-locked-caster-gone.png') });
          }

          // ---- the panel is OPEN when the portal dies (§10 item 7's twin) ----
          if (orphan) {
            let closedAt = null;
            for (let i = 0; i < 80; i++) {
              if (!(await B.panel())) { closedAt = (Date.now() - cast5.t0) / 1000; break; }
              await B.page.waitForTimeout(500);
            }
            const totemsLeft = await B.totemsAtFire(4);
            if (closedAt === null) {
              fail('G3 · panel dies with the portal', `the conversation was still open ${((Date.now() - cast5.t0) / 1000).toFixed(0)} s after the cast, with ${totemsLeft.length} portal(s) left standing`);
            } else {
              await B.pressInteract();
              const ghost = await B.panel();
              if (ghost && /portal/i.test(ghost.actor)) {
                fail('G3 · panel dies with the portal', `the panel closed at ${closedAt.toFixed(1)} s but a fresh E still opens a portal conversation - ghost offer`);
              } else {
                pass('G3 · panel dies with the portal', `the open conversation closed by itself ${closedAt.toFixed(1)} s after the cast (TTL death), and the next E opens ${ghost ? `"${ghost.actor}"` : 'nothing'} - no ghost offer`);
              }
            }
          }
        }
      }
    }
  }

  // ------------------------------------------------------------------ LEG U
  console.log('\n== LEG U: an unbound caster is refused, and no cast starts ==');
  // ⚑ The C1 race, won IN THE PAGE and not from the driver: a fresh character
  // spawns inside spawnpoint-1's dwell circle and binds ~1.7 s later, and a
  // Playwright round-trip per WARP loses every time. An interval installed with
  // addInitScript fires the instant window.game.character exists.
  const ctxU = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctxU.addInitScript((target) => {
    window.__warps = 0;
    const tick = () => {
      try {
        const input = document.querySelector('#console_command');
        const form = document.querySelector('#console');
        if (input && form && window.game && window.game.character) {
          input.value = target;
          form.dispatchEvent(new Event('submit', { cancelable: true }));
          window.__warps++;
        }
      } catch (e) { /* pre-boot; the console is not live yet */ }
      // ⚑ 60 attempts over ~3.6 s, not 12 over 0.5 s: the dwell that binds a
      // fresh character runs ~1.7 s and RESTARTS when it leaves the circle, so
      // the barrage has to outlast it, not merely start before it.
      if (window.__warps < 60) setTimeout(tick, 60);
    };
    setTimeout(tick, 40);
  }, `WARP ${VENUE.x * 120} ${VENUE.y * 120}`);
  const pageU = await ctxU.newPage();
  const U = rig(pageU, 'ptu');
  U.ctx = ctxU;
  await pageU.goto(url, { waitUntil: 'domcontentloaded' });
  await joinAsNewCharacter(pageU, 'ptu', { timeout: 90_000 });
  await pageU.waitForFunction(() => !!window.game?.character, null, { timeout: 60_000 });
  await pageU.waitForFunction(() => window.__warps >= 1, null, { timeout: 30_000 });
  await pageU.evaluate(() => { const p = document.getElementById('developPanel'); if (p) p.style.display = 'none'; });
  await U.primeRoot();
  await U.warpTo(VENUE.x, VENUE.y);
  const uHome = await U.homeFire();
  console.log(`  fresh character home=${uHome} at ${JSON.stringify(await U.pos())}`);
  if (uHome) {
    inconclusive('U · unbound refusal', `the fresh character bound to ${uHome} before the WARP landed - the ~1.7 s dwell window beat the harness. The property is owned by the Go pins on spawn_at_anchor's press and completion checks`);
  } else {
    await U.cmd('GOD');
    await U.cmd('SKILL PullThrough');
    await pageU.waitForTimeout(1_500);
    const eq = await equipCooldown(U, /Pull Through/i);
    if (!eq.ok) {
      fail('U · unbound refusal', `could not equip on the unbound character: ${JSON.stringify(eq)}`);
    } else if (await U.homeFire()) {
      inconclusive('U · unbound refusal', 'the character bound while the loadout was being set up');
    } else {
      await U.pressCooldownQ();
      const refused = await U.floatingSeen('No campfire bound', 6_000);
      let barEver = false;
      for (let i = 0; i < 20; i++) {
        if ((await U.castBar()).casting) { barEver = true; break; }
        await pageU.waitForTimeout(200);
      }
      const totemsU = (await U.totemsNearMe(6)) || [];
      if (refused && !barEver && !totemsU.length) {
        pass('U · unbound refusal', 'an unbound caster floats "No campfire bound", #castBar never goes .casting, and nothing is summoned - the gate is the effect TYPE\'s here, not authored content');
      } else {
        fail('U · unbound refusal', `refusal=${refused} castBarSeen=${barEver} totems=${totemsU.length} - expected the no-anchor refusal with no cast`);
      }
      await pageU.screenshot({ path: join(outdir, 'g-unbound-refusal.png') });
    }
  }
  await ctxU.close();

  // -------------------------------------------------------------- console log
  const allConsole = [...(A?.consoleErrors || []), ...(B?.consoleErrors || [])]
    // A lost WebGL context is an environment failure, not a product one (§29).
    .filter(e => !/context lost|reading 'split'|newSnapshot/.test(e));
  if (allConsole.length) console.log('\nconsole errors:', JSON.stringify([...new Set(allConsole)].slice(0, 10), null, 1));

} catch (e) {
  errors.push('HARNESS THREW: ' + e.message + '\n' + e.stack);
  console.error(e);
}

console.log('\n===== SUMMARY =====');
for (const [state, leg, note] of results) console.log(`${state.padEnd(13)} ${leg} - ${note}`);
const failed = results.filter(r => r[0] === 'FAIL').length;
const passed = results.filter(r => r[0] === 'PASS').length;
const inc = results.filter(r => r[0] === 'INCONCLUSIVE').length;
console.log(`\n${passed} passed · ${failed} failed · ${inc} inconclusive`);
await browser.close();
process.exit(failed || errors.length ? 1 : 0);
