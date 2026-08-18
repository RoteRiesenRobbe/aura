#!/usr/bin/env node
// plan-portal-spells.md C1 (Open Portal) verification - the whole loop at the
// only surface that can show it: a real client, a real portal, real E presses.
//
// What this owns, and what it deliberately does NOT:
//   · the CAST at the player's surface (bar appears, labelled, cost charged only
//     on completion) - the interrupt matrix itself is castTicks' shipped
//     machinery and is pinned in Go;
//   · the portal ARRIVING as a rendered entity next to the caster and dying at
//     its TTL - the countdown is Go's, the streaming/despawn is not;
//   · the conversation ROW: named, takeable, and its LOCKED twin when the far
//     end is gone (§10 item 9) - the wording is [PLACEHOLDER], so it asserts the
//     shape (`- locked:` + a "far end" phrase), never the sentence;
//   · ⭐ the TWO-WINDOW claim (§10 item 5), which is the point of the spell and
//     which one client cannot prove at all: B is bound to a DIFFERENT fire from
//     A, so B landing at A's fire is the only reading of the result. A run where
//     both characters shared an anchor would go green proving nothing.
//   · the unbound refusal (§10 item 6), TRI-STATE by construction - see below.
//
// ⚑ A IS BOUND AT spawnpoint-5, NOT the fire it spawned on. Every fresh
// character spawns jittered inside spawnpoint-1's dwell radius (state.go
// defaultSpawnPosition → JitterAround(pos, DwellRadius)) and binds there within
// ~1.7 s, so a harness that let A keep its default anchor would deliver B to the
// fire B is already bound to.
//
// ⚑ THE CAST VENUE IS 7.9 UNITS FROM THE FIRE, and that distance is the D8
// landmine, not scenery: the client synthesises a campfire interact offer that
// OVERRIDES the server's (Backend.ts `flightOrigin || offered`), so a portal
// standing inside the 0.75-unit dwell circle loses every E press to the flight
// map. Both venues below are derived from api/zones/world.json - the venue is
// the whole-unit point 4-11 units from the fire with the most clearance from any
// spawn (8.33 u) and ≥2 u from every blocking prop, so a re-placement moves it
// rather than rotting it.
//
// ⚑ GOD IS OFF FOR THE COST LEG ONLY. IsGod short-circuits the pricing site, so
// a run under it scores a broken cost as green (the r7-respec-cost lesson). It
// goes on immediately afterwards - every later leg stands still for 30 s at a
// time, and a dead player nulls the way into the scene graph.
//
// ⚑ THE UNBOUND LEG IS A RACE, and where it is run from decides whether it is
// winnable at all. A fresh character spawns INSIDE a fire's bind radius
// (defaultSpawnPosition jitters within the DWELL radius, not the heal radius)
// and binds 1.7 s later, and there is no unbind - so the only unbound state
// reachable in a browser is the one you warp out of first. A WARP driven from
// the harness loses EVERY time (measured: bound to spawnpoint-1 before the first
// command landed); the same WARP fired from an interval installed with
// addInitScript, which runs in-page the instant window.game.character exists,
// won 3/3. It stays TRI-STATE anyway: if the bind ever wins it says
// INCONCLUSIVE and names the Go pins that own the property outright
// (TestSpawn_RequiresAnchorRejectsThePress / …AtCompletionWhenTheAnchorIsLost).
//
// Boundary: `r4-recall-utility` owns the utility bar's cast and its own recall;
// `chunk3b-ii-conversation` owns panel navigation in general; `r4-camp` owns
// dwell refill. This asserts none of them - only the portal.
//
// Usage: node c1-open-portal.mjs [url] [outdir]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');
import { joinAsNewCharacter } from './lib/join.mjs';

const url = process.argv[2] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const outdir = process.argv[3] || '/tmp/c1-open-portal-shots';
mkdirSync(outdir, { recursive: true });

const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = {
  ...process.env,
  LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':'),
};

// --- venue, derived from api/zones/world.json (see header) --------------------
const FIRE = { id: 'spawnpoint-5', x: 34.19, y: -20.68 };
const FIRE_TILE = { x: 34, y: -21 };   // 0.37 u from the fire, inside the 0.75 bind radius
const VENUE = { x: 27, y: -24 };       // 7.92 u out, 8.33 u from the nearest spawn
const DWELL_RADIUS = 0.75;             // campfire-aura radius 1.5 × CampfireDwellRadiusFactor 0.5
const JITTER = 1.0;                    // sys.respawnJitterRadius
const B_HOME = 'spawnpoint-1';         // the only startingSpawn fire - every fresh join binds here

const results = [];
const errors = [];
const pass = (leg, note) => { results.push(['PASS', leg, note]); console.log(`  ✔ ${leg} - ${note}`); };
const fail = (leg, note) => { results.push(['FAIL', leg, note]); errors.push(`${leg}: ${note}`); console.log(`  ✘ ${leg} - ${note}`); };
const inconclusive = (leg, note) => { results.push(['INCONCLUSIVE', leg, note]); console.log(`  ? ${leg} - ${note}`); };

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

  // ⚑ Focus is read off the HUD text, not the character: Character.setHealth only
  // pushes into the overhead bar and exposes no getter.
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

  // Portals ride the `totem` layer (FireTotem art, D2 placeholder reuse). World
  // units, never screen space - Cam Boundaries clamps the camera at map edges.
  const portalsNear = (radius = 6) => page.evaluate((r) => {
    let layer = null;
    const find = (c) => { if (c?.name === 'totem') { layer = c; return; } (c?.children || []).forEach(find); };
    find(window.__auraRoot);
    if (!layer) return null;
    const ch = window.game.character;
    return (layer.children || [])
      .filter(c => c.visible && c.position)
      .map(c => ({
        x: +(c.position.x / 120).toFixed(2),
        y: +(c.position.y / 120).toFixed(2),
        d: +(Math.hypot(c.position.x - ch.getX(), c.position.y - ch.getY()) / 120).toFixed(2),
      }))
      .filter(o => o.d <= r)
      .sort((a, b) => a.d - b.d);
  }, radius);

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

  // ⚑ A ~1.4 s HOLD, never keyboard.press: the interact key is edge-triggered off
  // Controls.update's rAF-driven clock, and a headless page's rAF is throttled
  // far below the nominal input tick - a short pair falls between two samples and
  // reads exactly like a broken feature.
  const pressInteract = async () => {
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.down('e');
    await page.waitForTimeout(1400);
    await page.keyboard.up('e');
    await page.waitForTimeout(1400);
  };

  const pressCooldownQ = async () => {
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.down('q');
    await page.waitForTimeout(1400);
    await page.keyboard.up('q');
  };

  // Rows are rebuilt wholesale on every changed render and bind pointerdown, so
  // handles go stale and a synthetic dispatch proves nothing. Scroll into view,
  // confirm with elementFromPoint, then a real mouse click.
  const clickRow = async (needle) => {
    const ok = await page.evaluate((n) => {
      const rows = [...document.querySelectorAll('#conversation .conversationRows li')];
      const row = rows.find(li => li.textContent.includes(n));
      if (!row) return false;
      row.scrollIntoView({ block: 'center' });
      return true;
    }, needle);
    if (!ok) return false;
    await page.waitForTimeout(250);
    const el = await page.evaluateHandle((n) => {
      const rows = [...document.querySelectorAll('#conversation .conversationRows li')];
      return rows.find(li => li.textContent.includes(n)) ?? null;
    }, needle);
    const node = el.asElement();
    if (!node) return false;
    const b = await node.boundingBox();
    if (!b) return false;
    const cx = b.x + Math.min(60, b.width / 2), cy = b.y + b.height / 2;
    const onTop = await page.evaluate(([x, y]) =>
      !!document.elementFromPoint(x, y)?.closest('#conversation .conversationRows li'), [cx, cy]);
    if (!onTop) return false;
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(1100);
    return true;
  };

  // The refusal is a 900 ms floating PIXI.Text over the own character - there is
  // no DOM surface and no snapshot field on the four-method window.game façade,
  // so it has to be caught in a tight poll on the floatingNumbers layer.
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

  const warpTo = async (x, y, tol = 1.6) => {
    await cmd(`WARP ${Math.round(x) * 120} ${Math.round(y) * 120}`);
    for (let i = 0; i < 60; i++) {
      const p = await pos();
      if (Math.hypot(p.x - Math.round(x), p.y - Math.round(y)) <= tol) return p;
      await page.waitForTimeout(500);
    }
    return await pos();
  };

  return { page, tag, cmd, pos, focus, castBar, portalsNear, panel, pressInteract,
           pressCooldownQ, clickRow, floatingSeen, homeFire, primeRoot, warpTo, consoleErrors };
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
// centre: each row is "<name> [−] <lvl>/<max> [+]" and the spend button sits
// mid-row with explicit precedence, so a centre click spends a skill point and
// the equip then silently never happens.
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
  const rows = await page.$$('#spellbookList li');
  const box = await rows[idx].boundingBox();
  await page.mouse.click(box.x + 25, box.y + box.height / 2);
  await page.waitForTimeout(700);
  const selected = await page.evaluate(() => !!document.querySelector('#spellbookList li.selected'));
  if (!selected) return { ok: false, why: 'the spellbook row never went .selected' };
  const slot = await page.$('#cooldownSlotList li:first-child');
  const sb = await slot.boundingBox();
  await page.mouse.click(sb.x + sb.width / 2, sb.y + sb.height / 2);
  await page.waitForTimeout(900);
  const label = await page.evaluate(() =>
    document.querySelector('#cooldownSlotList li[data-slot="0"] .slotLabel')?.textContent?.trim() ?? '');
  return { ok: nameRe.test(label), label };
}

// ============================================================================
try {
  // ------------------------------------------------------------------ LEG A
  console.log('\n== LEG A: bind A at a fire that is NOT the default spawn ==');
  const A = await newClient('portal');
  await A.warpTo(FIRE_TILE.x, FIRE_TILE.y);
  await A.page.waitForTimeout(9_000);               // dwell binds after ~1.7 s; margin for the settle
  const aHome = await A.homeFire();
  const aFirePos = await A.pos();
  if (aHome === FIRE.id) {
    pass('A · bind', `A is bound to ${aHome} (standing at ${aFirePos.x},${aFirePos.y}); B will keep ${B_HOME}, so the two anchors differ`);
  } else {
    fail('A · bind', `expected home ${FIRE.id}, got ${aHome}`);
  }

  // A level or two of headroom: the venue is the most isolated point near the
  // fire but mobs wander, and a level-1 character standing still for 30 s at a
  // time in zone 2 is a dead one - a dead player also nulls the scene-graph root.
  await A.cmd('XP 20000');
  await A.page.waitForTimeout(4_000);

  await A.cmd('SKILL OpenPortal');
  await A.page.waitForTimeout(1_500);
  const equipped = await equipCooldown(A, /Open Portal/i);
  if (equipped.ok) pass('A · equip', `Open Portal sits in cooldown slot Q (label "${equipped.label}")`);
  else fail('A · equip', `equip did not land: ${JSON.stringify(equipped)}`);

  // ------------------------------------------------------------------ LEG B
  console.log('\n== LEG B: walk out past the dwell circle before casting (D8) ==');
  const venuePos = await A.warpTo(VENUE.x, VENUE.y);
  const dFire = Math.hypot(venuePos.x - FIRE.x, venuePos.y - FIRE.y);
  if (dFire > DWELL_RADIUS * 2) {
    pass('B · out of the dwell circle', `A stands ${dFire.toFixed(2)} u from ${FIRE.id} (dwell radius ${DWELL_RADIUS}); E cannot be stolen by the flight offer`);
  } else {
    fail('B · out of the dwell circle', `A is only ${dFire.toFixed(2)} u from the fire - the client's campfire offer would override the portal's`);
  }

  // ------------------------------------------------------------------ LEG C
  console.log('\n== LEG C: cast - bar, and the cost charged ONLY on completion ==');
  let castResult = null;
  for (let attempt = 1; attempt <= 3 && !castResult; attempt++) {
    const before = await A.focus();
    if (!before || before.cur !== before.max) {
      console.log(`  (attempt ${attempt}: waiting for a full pool, at ${JSON.stringify(before)})`);
      await A.page.waitForTimeout(6_000);
      continue;
    }
    await A.pressCooldownQ();
    let barSeen = null;
    for (let i = 0; i < 30; i++) {           // ~6 s: the cast is 75 t = 2.5 s
      const b = await A.castBar();
      if (b.casting) { barSeen = b; break; }
      await A.page.waitForTimeout(200);
    }
    if (!barSeen) { console.log(`  (attempt ${attempt}: no cast bar)`); await A.page.waitForTimeout(3_000); continue; }
    const midFocus = await A.focus();
    const midCasting = (await A.castBar()).casting;
    // wait out the cast + the portal's arrival
    let portals = [];
    for (let i = 0; i < 40; i++) {
      portals = (await A.portalsNear(4)) || [];
      if (portals.length) break;
      await A.page.waitForTimeout(300);
    }
    const after = await A.focus();
    if (!portals.length) { console.log(`  (attempt ${attempt}: cast produced no portal - interrupted?)`); await A.page.waitForTimeout(5_000); continue; }
    castResult = { before, barSeen, midFocus, midCasting, after, portals };
  }

  let castT0 = Date.now();
  if (!castResult) {
    fail('C · cast', 'no cast completed in 3 attempts (mob interrupt at the venue?)');
  } else {
    const { before, barSeen, midFocus, midCasting, after, portals } = castResult;
    if (/Open Portal/i.test(barSeen.text)) pass('C1 · cast bar', `#castBar went .casting labelled "${barSeen.text.trim()}"`);
    else fail('C1 · cast bar', `cast bar text was "${barSeen.text}" - expected it to name Open Portal`);

    if (midCasting && midFocus.cur === before.cur) {
      pass('C2 · no cost mid-cast', `Focus held at ${midFocus.cur}/${midFocus.max} while the bar was still casting`);
    } else if (!midCasting) {
      inconclusive('C2 · no cost mid-cast', `the mid-cast sample landed after the bar closed (Focus ${midFocus.cur}/${midFocus.max}) - 2.5 s is short against a throttled rAF`);
    } else {
      fail('C2 · no cost mid-cast', `Focus moved ${before.cur} → ${midFocus.cur} DURING the cast - the cost is not completion-only`);
    }

    const drop = (before.cur - after.cur) / before.max;
    // Band, not an equality: the pool regenerates ~1 %/s and the sample lands a
    // beat after completion, so an exact 0.10 would be a knife edge.
    if (drop >= 0.05 && drop <= 0.13) {
      pass('C3 · cost on completion', `Focus ${before.cur}/${before.max} → ${after.cur}/${after.max}, a drop of ${(drop * 100).toFixed(1)} % against the authored costFractionOfMax 0.10`);
    } else {
      fail('C3 · cost on completion', `Focus ${before.cur} → ${after.cur} of ${before.max} = ${(drop * 100).toFixed(1)} %, outside the 5–13 % band around the authored 0.10`);
    }

    const p0 = portals[0];
    if (p0.d <= 2.5) pass('C4 · portal placed', `a portal stands ${p0.d} u from the caster at (${p0.x}, ${p0.y}) - inside its own 2.0 u interaction range`);
    else fail('C4 · portal placed', `nearest portal is ${p0.d} u away - too far to press E on`);
    await A.page.screenshot({ path: join(outdir, 'a-portal-cast.png') });
  }

  // GOD from here on: every remaining leg stands still for tens of seconds.
  await A.cmd('GOD');

  // ------------------------------------------------------------------ LEG D
  console.log('\n== LEG D: "Leave." declines, and nothing moves ==');
  const beforeDecline = await A.pos();
  await A.pressInteract();
  let pnl = await A.panel();
  if (!pnl) {
    fail('D · decline', 'E near the portal opened no conversation panel');
  } else if (!/portal/i.test(pnl.actor)) {
    // ⚑ The precondition that makes the subject the subject: E goes to the
    // NEAREST interactable, and a run that measured another conversant would go
    // green proving nothing.
    fail('D · decline', `the panel belongs to "${pnl.actor}", not the portal`);
  } else {
    const step = pnl.rows.find(r => /Step through/i.test(r.text));
    if (!step) fail('D1 · row', `no "Step through." row - rows were ${JSON.stringify(pnl.rows)}`);
    else if (step.locked) fail('D1 · row', `the "Step through." row rendered LOCKED with a live owner: "${step.text}"`);
    else pass('D1 · row', `actor "${pnl.actor}" offers "${step.text}" unlocked, lines: "${pnl.lines}"`);
    if (pnl.hasLeave) pass('D2 · decline row', 'the automatic "Leave." row is present (no decline is authored)');
    else fail('D2 · decline row', 'no "Leave." row on the portal panel');
    await A.page.screenshot({ path: join(outdir, 'b-portal-panel.png') });

    const clicked = await A.clickRow('Leave.');
    const afterDecline = await A.pos();
    const stillOpen = await A.panel();
    const moved = Math.hypot(afterDecline.x - beforeDecline.x, afterDecline.y - beforeDecline.y);
    if (!clicked) fail('D3 · decline', 'the "Leave." row could not be clicked');
    else if (stillOpen) fail('D3 · decline', 'the panel stayed open after "Leave."');
    else if (moved > 0.3) fail('D3 · decline', `declining MOVED the player ${moved.toFixed(2)} u (${JSON.stringify(beforeDecline)} → ${JSON.stringify(afterDecline)})`);
    else pass('D3 · decline', `panel closed and the player stayed put at (${afterDecline.x}, ${afterDecline.y}), drift ${moved.toFixed(2)} u`);
  }

  // ------------------------------------------------------------------ LEG E
  console.log('\n== LEG E: "Step through." delivers A to A\'s own bound fire ==');
  const beforeStep = await A.pos();
  await A.pressInteract();
  const pnl2 = await A.panel();
  if (!pnl2 || !/portal/i.test(pnl2.actor)) {
    fail('E · accept', `no portal panel on the second press (got ${JSON.stringify(pnl2)})`);
  } else {
    const clicked = await A.clickRow('Step through');
    await A.page.waitForTimeout(1_500);
    const afterStep = await A.pos();
    const stillOpen = await A.panel();
    const dHome = Math.hypot(afterStep.x - FIRE.x, afterStep.y - FIRE.y);
    const travelled = Math.hypot(afterStep.x - beforeStep.x, afterStep.y - beforeStep.y);
    if (!clicked) fail('E · accept', 'the "Step through." row could not be clicked');
    else if (dHome <= JITTER + 0.6) {
      pass('E1 · travel', `A jumped ${travelled.toFixed(2)} u from (${beforeStep.x}, ${beforeStep.y}) to (${afterStep.x}, ${afterStep.y}) - ${dHome.toFixed(2)} u from ${FIRE.id} at (${FIRE.x}, ${FIRE.y}), inside the ${JITTER} u respawn jitter`);
    } else {
      fail('E1 · travel', `A ended ${dHome.toFixed(2)} u from ${FIRE.id} at (${afterStep.x}, ${afterStep.y}) - not the bound fire`);
    }
    if (stillOpen) fail('E2 · panel closes', `the conversation survived the teleport: ${JSON.stringify(stillOpen)}`);
    else pass('E2 · panel closes', 'the panel closed with the move (§5\'s "step-through closes the conversation" pin)');
    await A.page.screenshot({ path: join(outdir, 'c-arrived-at-fire.png') });
  }

  // ------------------------------------------------------------------ LEG F
  console.log('\n== LEG F: the tooltip names the summon (D11) ==');
  const tip = await A.page.evaluate(async () => {
    const entry = document.querySelector('#spellbookList [data-skill-id="147"]');
    if (!entry) return { err: 'no spellbook entry for skill 147' };
    entry.scrollIntoView({ block: 'center' });
    return { id: entry.dataset.skillId, text: entry.textContent.trim().replace(/\s+/g, ' ') };
  });
  if (tip.err) {
    fail('F · tooltip', tip.err);
  } else {
    const loc = A.page.locator('#spellbookList [data-skill-id="147"]').first();
    await loc.hover();
    await A.page.waitForTimeout(500);
    const tipText = await A.page.evaluate(() => {
      const t = document.querySelector('#skillTooltip');
      if (!t || t.classList.contains('hidden')) return null;
      return [...t.children].map(c => c.textContent).join(' | ');
    });
    await A.page.mouse.move(10, 10);
    console.log('  tooltip:', tipText);
    if (!tipText) fail('F · tooltip', 'no #skillTooltip rendered on hover');
    else if (/\(spawn\)/.test(tipText)) fail('F · tooltip', `fell through to the unknown-type fallback: ${tipText}`);
    // Shape, not wording: every number here is [PLACEHOLDER].
    else if (!/Summons/i.test(tipText) || !/30\s*s/.test(tipText)) fail('F · tooltip', `no "Summons … 30s" spawn line: ${tipText}`);
    else pass('F · tooltip', `renders "${tipText}"`);
  }

  // ------------------------------------------------------------------ LEG G
  console.log('\n== LEG G: a SECOND player steps through - the point of the spell ==');
  const B = await newClient('portalb');
  const bHomeBefore = await B.homeFire();
  await B.cmd('GOD');
  await B.warpTo(VENUE.x, VENUE.y);
  await A.warpTo(VENUE.x, VENUE.y);

  // wait out the 1200 t (40 s) cooldown from cast #1
  const waitMs = Math.max(0, 42_000 - (Date.now() - castT0));
  console.log(`  waiting ${(waitMs / 1000).toFixed(0)} s for the 1200 t cooldown`);
  await A.page.waitForTimeout(waitMs);

  let p2 = [];
  for (let attempt = 1; attempt <= 3 && !p2.length; attempt++) {
    await A.pressCooldownQ();
    for (let i = 0; i < 40; i++) {
      p2 = (await A.portalsNear(4)) || [];
      if (p2.length) break;
      await A.page.waitForTimeout(300);
    }
    if (!p2.length) { console.log(`  (cast #2 attempt ${attempt} produced nothing)`); await A.page.waitForTimeout(8_000); }
  }
  const cast2T0 = Date.now();

  if (!p2.length) {
    fail('G · second window', 'A could not raise a second portal');
  } else if (bHomeBefore === FIRE.id) {
    inconclusive('G · second window', `B is bound to ${bHomeBefore}, the same fire as A - the leg cannot discriminate`);
  } else {
    const bBefore = await B.pos();
    await B.pressInteract();
    const bPanel = await B.panel();
    if (!bPanel || !/portal/i.test(bPanel.actor)) {
      fail('G · second window', `B's E press opened ${bPanel ? `"${bPanel.actor}"` : 'nothing'}, not the portal`);
    } else {
      const bStep = bPanel.rows.find(r => /Step through/i.test(r.text));
      if (!bStep || bStep.locked) {
        fail('G · second window', `B sees no takeable "Step through." row: ${JSON.stringify(bPanel.rows)}`);
      } else {
        await B.clickRow('Step through');
        await B.page.waitForTimeout(1_500);
        const bAfter = await B.pos();
        const dA = Math.hypot(bAfter.x - FIRE.x, bAfter.y - FIRE.y);
        if (dA <= JITTER + 0.6) {
          pass('G · second window', `B (bound to ${bHomeBefore}) walked into A's portal at (${bBefore.x}, ${bBefore.y}) and landed at (${bAfter.x}, ${bAfter.y}) - ${dA.toFixed(2)} u from A's fire ${FIRE.id}, NOT B's own`);
        } else {
          fail('G · second window', `B ended at (${bAfter.x}, ${bAfter.y}), ${dA.toFixed(2)} u from A's fire ${FIRE.id}`);
        }
        await B.page.screenshot({ path: join(outdir, 'd-b-arrived.png') });
      }
    }
  }

  // ------------------------------------------------------------------ LEG H
  console.log('\n== LEG H: the portal expires at its 900 t TTL ==');
  if (!p2.length) {
    inconclusive('H · TTL', 'no second portal to watch');
  } else {
    let gone = false, sawAt = null;
    for (let i = 0; i < 90; i++) {                 // up to 45 s past the cast
      const now = (await A.portalsNear(4)) || [];
      if (!now.length) { gone = true; sawAt = (Date.now() - cast2T0) / 1000; break; }
      await A.page.waitForTimeout(500);
    }
    if (!gone) fail('H · TTL', 'the portal was still standing 45 s after the cast (authored ttlTicks 900 = 30 s)');
    else if (sawAt < 20) fail('H · TTL', `the portal vanished after only ${sawAt.toFixed(1)} s - well short of the authored 30 s`);
    else pass('H · TTL', `the portal disappeared ${sawAt.toFixed(1)} s after the cast completed (authored ttlTicks 900 = 30 s; the sample includes the cast's own 2.5 s and the poll's 0.5 s granularity)`);
  }

  // ------------------------------------------------------------------ LEG I
  console.log('\n== LEG I: the caster logs out - the row locks (§10 item 9) ==');
  await B.warpTo(VENUE.x, VENUE.y);
  await A.warpTo(VENUE.x, VENUE.y);
  const wait3 = Math.max(0, 42_000 - (Date.now() - cast2T0));
  console.log(`  waiting ${(wait3 / 1000).toFixed(0)} s for the cooldown`);
  await A.page.waitForTimeout(wait3);
  let p3 = [];
  for (let attempt = 1; attempt <= 3 && !p3.length; attempt++) {
    await A.pressCooldownQ();
    for (let i = 0; i < 40; i++) {
      p3 = (await A.portalsNear(4)) || [];
      if (p3.length) break;
      await A.page.waitForTimeout(300);
    }
    if (!p3.length) await A.page.waitForTimeout(8_000);
  }
  if (!p3.length) {
    inconclusive('I · owner gone', 'A could not raise a third portal to orphan');
  } else {
    await B.pressInteract();
    const live = await B.panel();
    const liveRow = live?.rows?.find(r => /Step through/i.test(r.text));
    if (!liveRow || liveRow.locked) {
      fail('I · owner gone', `the control reading failed - B should see an UNLOCKED row while A is connected, got ${JSON.stringify(live?.rows)}`);
    } else {
      pass('I1 · control', `with A connected B sees "${liveRow.text}" unlocked`);
      await B.page.keyboard.press('Escape');
      await B.page.waitForTimeout(600);
      console.log('  closing A\'s window…');
      await A.ctx.close();
      await B.page.waitForTimeout(6_000);
      await B.pressInteract();
      const orphan = await B.panel();
      const row = orphan?.rows?.find(r => /Step through/i.test(r.text));
      if (!orphan || !/portal/i.test(orphan.actor)) {
        fail('I2 · owner gone', `B's press opened ${orphan ? `"${orphan.actor}"` : 'nothing'}`);
      } else if (!row) {
        fail('I2 · owner gone', `no travel row at all after the owner left: ${JSON.stringify(orphan.rows)}`);
      } else if (!row.locked) {
        fail('I2 · owner gone', `the row is still takeable after the caster disconnected: "${row.text}"`);
      } else if (!/locked/i.test(row.text) || !/far end/i.test(row.text)) {
        fail('I2 · owner gone', `the row locked but does not name the wall: "${row.text}"`);
      } else {
        pass('I2 · owner gone', `after A's window closed the row reads "${row.text}" and is inert`);
        await B.page.screenshot({ path: join(outdir, 'e-locked-row.png') });
      }
    }
  }

  // ------------------------------------------------------------------ LEG J
  console.log('\n== LEG J: an unbound caster is refused, and no cast starts ==');
  // ⚑ The race described in the header, and it is won IN THE PAGE, not from the
  // driver: a Playwright round trip per WARP loses every time (measured - the
  // character was already bound to spawnpoint-1 before the first one landed),
  // while an interval installed BEFORE navigation fires the moment
  // window.game.character exists and wins reliably (3/3 on a standalone probe).
  const ctxC = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctxC.addInitScript((target) => {
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
      if (window.__warps < 12) setTimeout(tick, 40);
    };
    setTimeout(tick, 40);
  }, `WARP ${VENUE.x * 120} ${VENUE.y * 120}`);
  const pageC = await ctxC.newPage();
  const C = rig(pageC, 'unbnd');
  C.ctx = ctxC;
  await pageC.goto(url, { waitUntil: 'domcontentloaded' });
  await joinAsNewCharacter(pageC, 'unbnd', { timeout: 90_000 });
  await pageC.waitForFunction(() => !!window.game?.character, null, { timeout: 60_000 });
  await pageC.waitForFunction(() => window.__warps >= 1, null, { timeout: 30_000 });
  await pageC.evaluate(() => { const p = document.getElementById('developPanel'); if (p) p.style.display = 'none'; });
  await C.primeRoot();
  await C.warpTo(VENUE.x, VENUE.y);
  const cHome = await C.homeFire();
  const cPos = await C.pos();
  console.log(`  fresh character home=${cHome} at (${cPos.x}, ${cPos.y})`);
  if (cHome) {
    inconclusive('J · unbound refusal', `the fresh character bound to ${cHome} before the WARP landed - the ~1.7 s dwell window beat the harness. The property is owned by the Go pins TestSpawn_RequiresAnchorRejectsThePress and TestSpawn_RequiresAnchorRejectsAtCompletionWhenTheAnchorIsLost`);
  } else {
    await C.cmd('GOD');
    await C.cmd('SKILL OpenPortal');
    await pageC.waitForTimeout(1_500);
    const eq = await equipCooldown(C, /Open Portal/i);
    if (!eq.ok) {
      fail('J · unbound refusal', `could not equip on the unbound character: ${JSON.stringify(eq)}`);
    } else {
      const stillUnbound = await C.homeFire();
      if (stillUnbound) {
        inconclusive('J · unbound refusal', `the character bound to ${stillUnbound} while the loadout was being set up`);
      } else {
        await C.pressCooldownQ();
        const refused = await C.floatingSeen('No campfire bound', 6_000);
        let barEver = false;
        for (let i = 0; i < 20; i++) {
          if ((await C.castBar()).casting) { barEver = true; break; }
          await pageC.waitForTimeout(200);
        }
        const portalsC = (await C.portalsNear(5)) || [];
        if (refused && !barEver && !portalsC.length) {
          pass('J · unbound refusal', `an unbound caster floats "No campfire bound", #castBar never goes .casting, and no portal appears`);
        } else {
          fail('J · unbound refusal', `refusal=${refused} castBarSeen=${barEver} portals=${portalsC.length} - expected the no-anchor refusal with no cast`);
        }
        await pageC.screenshot({ path: join(outdir, 'f-unbound-refusal.png') });
      }
    }
  }
  await ctxC.close();

  // -------------------------------------------------------------- console log
  const allConsole = [...(A.consoleErrors || []), ...(B?.consoleErrors || [])]
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
