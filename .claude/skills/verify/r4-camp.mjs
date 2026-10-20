#!/usr/bin/env node
// R4 C2 — the mini-campfire as a baseline utility (plan-downtime.md D2–D5, D9).
//
// What this owns: the Camp BUTTON, its charge store and the placed fire at the
// game surface — the wiring vitest cannot see and Go tests cannot reach.
//
//   1  join fresh, stand in the spawn fire: the counter stays EMPTY (standing
//      restocks nothing now), then E + "Bind & Restock" fills it to the
//      level-1 cap, which is ONE; level up and take the fire's "Restock" row
//      to watch the cap itself grow (D9's whole claim, and the only axis that
//      visibly does)
//   2  warp to open ground, far from every real fire
//   3  press Camp: the cast bar winds up labelled "Camp" and the counter does
//      NOT move (D4 — the charge is spent at completion, never at the press)
//   4  move mid-channel: the bar goes out, no camp appears, the counter is
//      still untouched (D4's other half — an interrupt costs nothing)
//   5  press and stand still: a camp appears beside us and the counter drops
//      by exactly one
//   6  A/B the heal, under GOD — which is what makes it an ISOLATION rather
//      than a comparison: godmode skips updateVitalSigns entirely, so passive
//      regen is OFF and the control window must recover exactly nothing. Any
//      recovery in the camp window is the camp and nothing else. (DAMAGE
//      writes the pool directly, so it works through godmode; the SECOND-
//      player half is pinned in Go —
//      TestApplyHealAura_APlacedCampHealsASecondPlayer — a harness runs one
//      client.)
//   7  place again: still exactly ONE camp near us (D5 — placing replaces)
//   8  stand in the placed camp: the counter does NOT refill (L3, the half
//      that would make the loop a perpetual motion machine)
//   9  spend the last charge: the button greys and a press starts no channel
//  10  wait out the TTL: the camp is gone
//  11  Recall home: the counter is still empty (standing restocks nothing), then
//      E + "Restock" fills it to cap, and a second Restock after spending a
//      charge fills it again (every press refills, no once-per-visit rule)
//
// ⚑ HOME is recorded, not hardcoded (the C1 lesson). The fire's rows are taken
// standing on the ROUNDED fire tile: a rounded WARP is at most 0.71 u off, which
// is inside the 0.75 u bind circle, but a jittered spawn point can be outside it.
// ⚑ GOD is on for the whole run, and it is not just convenience: open ground
// is prop-free, NOT mob-free (the nearest spawn to the best whole-unit tile is
// ~5 units), and a level-1 character standing there through the warp settle
// dies — the first run of this script died before the first press.
// ⚑ Camps are counted on the `campfireMob` scene layer, in WORLD space, near
// the player: the world ships 5 real fires, and open ground is nowhere near
// any of them, so a sprite within a few units out there is the placed camp.
// Screen-space distance would be wrong — Cam Boundaries clamps the camera at
// map edges, so the player is not drawn at screen centre (the chunk-2 trap).
//
// Usage: node .claude/skills/verify/r4-camp.mjs [label] [url]
// Afterwards: cd backend && go run ./cmd/harnessdb -cleanup
import { createRequire } from 'node:module';
import { join } from 'node:path';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');
import { harnessCharacterName } from './lib/join.mjs';

const url = process.argv[3] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

const w = (x, y) => `${Math.round(x) * 120} ${Math.round(y) * 120}`;
const OPEN_GROUND = { x: -168, y: -84 }; // spawnpoint-5's clearing: no spawn within 40 u, 120+ u from the spawn fire

// 150 ticks at 30/s = 5 s; the TTL is 450 = 15 s.
const CHANNEL_MS = 5_000;
const TTL_MS = 15_000;
const HEAL_WINDOW_MS = 8_000;

const results = [];
const consoleErrors = [];
const check = (ok, name, note) => {
  results.push({ ok, name, note });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? '  — ' + note : ''}`);
};

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'], env });
const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

const cmd = async (text) => {
  await page.evaluate((t) => {
    const input = document.getElementById('console_command');
    input.value = t;
    document.getElementById('console').dispatchEvent(new Event('submit', { cancelable: true }));
  }, text);
  await page.waitForTimeout(600);
};

const pos = () => page.evaluate(() => ({
  x: +(window.game.character.getX() / 120).toFixed(2),
  y: +(window.game.character.getY() / 120).toFixed(2),
}));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const castBar = () => page.evaluate(() => {
  const bar = document.getElementById('castBar');
  return { casting: bar?.classList.contains('casting') ?? false, text: bar?.querySelector('.barText')?.textContent ?? '' };
});

// The Camp button's own rendered state: the counter text the player reads and
// the out-of-charges class. Read off the DOM on purpose — a counter the server
// updates but the HUD never pushes is exactly the class of bug this harness
// exists for (the round-4 lesson).
const campButton = () => page.evaluate(() => {
  const li = document.querySelector('#utilityList li[data-utility="2"]');
  if (!li) return null;
  return {
    label: li.querySelector('.slotLabel')?.textContent ?? '',
    charges: li.querySelector('.utilityCharges')?.textContent ?? '',
    greyed: li.classList.contains('outOfCharges'),
  };
});

// The in-game tooltip's text after hovering a utility button. ⚑ Asserted
// through a HOVER, not through a title= attribute: the buttons used to carry a
// native browser tooltip and it was replaced (PO 2026-08-03) precisely because
// it did not look like the rest of the HUD. Reading the rendered panel is what
// notices if they ever fall back to it.
const hoverTooltip = async (kind) => {
  await page.hover(`#utilityList li[data-utility="${kind}"]`);
  await page.waitForTimeout(700);
  return page.evaluate(() => {
    // ⚑ #skillTooltip, the element itself — a [class*=ooltip] selector matches
    // the inner .tooltipTitle first and reads back only the title.
    const el = document.getElementById('skillTooltip');
    return el && !el.classList.contains('hidden') ? el.textContent ?? '' : '';
  });
};

// Park the pointer somewhere harmless: an anchored tooltip left open sits over
// the panels beside the bar, and a later click has to reach the button itself.
const unhover = () => page.mouse.move(640, 400);
const chargeText = async () => (await campButton())?.charges ?? '';
// The counter parsed into numbers. Every charge assertion below is RELATIVE to
// what the button reports rather than against a hardcoded "2/3": the cap curve
// is [PLACEHOLDER] and was already retuned once, and a harness that has to be
// edited for a tuning change stops being evidence about the feature.
const charges = async () => {
  const m = /^(\d+)\/(\d+)$/.exec(await chargeText());
  return m ? { have: +m[1], cap: +m[2] } : { have: -1, cap: -1 };
};

// Health as a fraction of the pool, read off the HUD's own "Focus cur/max"
// text — the number a player looks at, and the one place both halves are
// rendered from the same snapshot.
const healthFraction = () => page.evaluate(() => {
  const m = /Focus\s+(\d+)\/(\d+)/.exec(document.querySelector('#healthBar .barText')?.textContent ?? '');
  return m && +m[2] > 0 ? +m[1] / +m[2] : 0;
});

// Camps within `radius` world units of the player, on the campfireMob layer.
const campsNearby = (radius = 4) => page.evaluate((r) => {
  let layer = null;
  const find = (c) => {
    if (c?.name === 'campfireMob') { layer = c; return; }
    (c?.children || []).forEach(find);
  };
  find(window.__auraRoot);
  if (!layer) return null;
  const ch = window.game.character;
  return (layer.children || [])
    .filter((c) => c.visible && c.position)
    .map((c) => Math.hypot(c.position.x - ch.getX(), c.position.y - ch.getY()) / 120)
    .filter((d) => d <= r).length;
}, radius);

// The world position of the nearest campfire-layer sprite, in world units.
//
// ⚑ Used to warp back onto the home fire, and the reason is a real trap: HOME
// is where the character SPAWNED, which is a jittered point up to the respawn
// jitter radius from the fire. Rounding that to a whole-unit WARP target can
// land outside the 0.75-unit bind radius, and then the refill silently never
// fires — which reads exactly like a broken refill. The authored fires sit
// within ~0.2 units of a whole tile, so rounding the FIRE is safe.
const nearestFire = () => page.evaluate(() => {
  let layer = null;
  const find = (c) => {
    if (c?.name === 'campfireMob') { layer = c; return; }
    (c?.children || []).forEach(find);
  };
  find(window.__auraRoot);
  const ch = window.game.character;
  let best = null;
  for (const c of layer?.children || []) {
    if (!c.visible || !c.position) continue;
    const d = Math.hypot(c.position.x - ch.getX(), c.position.y - ch.getY());
    if (!best || d < best.d) best = { d, x: c.position.x / 120, y: c.position.y / 120 };
  }
  return best;
});

// Poll for the expected camp count instead of sampling once after a fixed
// sleep. ⚑ A single sample flaked: the sprite is created, made visible and
// faded in over a frame or two on a headless ~10 FPS client, so "0 camps" was
// read 7 s after a press whose camp the very next legs then healed from. The
// standing rule (verify skill) is to WAIT for the UI to show the state.
const waitForCamps = async (expected, timeoutMs = 8_000) => {
  const deadline = Date.now() + timeoutMs;
  let n = await campsNearby();
  while (n !== expected && Date.now() < deadline) {
    await page.waitForTimeout(400);
    n = await campsNearby();
  }
  return n;
};


// --- the campfire conversation (E at a fire opens a panel; standing binds nothing) ---
// Copied from c2-pull-through.mjs (harnesses are self-contained). ⚑ E is a ~1.4 s
// HOLD, never keyboard.press: the interact key is edge-triggered off Controls.update's
// rAF-driven clock, which a headless page throttles far below the nominal input tick.
const pressInteract = async () => {
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down('e');
  await page.waitForTimeout(1400);
  await page.keyboard.up('e');
  await page.waitForTimeout(1400);
};
const convPanel = () => page.evaluate(() => {
  const el = document.getElementById('conversation');
  if (!el || el.classList.contains('hidden')) return null;
  const li = [...el.querySelectorAll('.conversationRows li')];
  return {
    actor: el.querySelector('.conversationActor')?.textContent?.trim() ?? '',
    rows: li.filter((x) => !x.classList.contains('conversationLeaveRow')).map((x) => x.textContent.trim()),
    hasLeave: li.some((x) => x.classList.contains('conversationLeaveRow')),
  };
});
// A single E press is not evidence (the hold can fall between two rAF samples): retry.
const pressForPanel = async (tries = 3) => {
  for (let i = 0; i < tries; i++) {
    await pressInteract();
    const p = await convPanel();
    if (p) return p;
  }
  return null;
};
// Rows are rebuilt on every render: scroll, elementFromPoint check, real mouse click.
const clickRow = async (needle, exact = false) => {
  const found = await page.evaluate(([n, ex]) => {
    const row = [...document.querySelectorAll('#conversation .conversationRows li')].find((li) => (ex ? li.textContent.trim() === n : li.textContent.includes(n)));
    if (!row) return false;
    row.scrollIntoView({ block: 'center' });
    return true;
  }, [needle, exact]);
  if (!found) return { ok: false, why: `no row matches "${needle}"` };
  await page.waitForTimeout(250);
  const node = (await page.evaluateHandle(([n, ex]) =>
    [...document.querySelectorAll('#conversation .conversationRows li')].find((li) => (ex ? li.textContent.trim() === n : li.textContent.includes(n))) ?? null, [needle, exact])).asElement();
  const b = node && await node.boundingBox();
  if (!b) return { ok: false, why: 'the row has no box' };
  const cx = b.x + Math.min(60, b.width / 2), cy = b.y + b.height / 2;
  const hit = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('#conversation .conversationRows li'), [cx, cy]);
  if (!hit) return { ok: false, why: 'something lies on top of the row' };
  await page.mouse.click(cx, cy);
  await page.waitForTimeout(1100);
  return { ok: true };
};
const homeFire = () => page.evaluate(() => window.game?.miniMap?.['campfires']?.['home'] ?? null);
// Stand inside the fire's bind circle first. E opens the Campfire panel, "Bind & Restock"
// is clicked, and the home marker is awaited.
const bindAtFire = async () => {
  const pnl = await pressForPanel();
  if (!pnl || !/campfire/i.test(pnl.actor)) return { ok: false, why: `E opened ${pnl ? `"${pnl.actor}"` : 'nothing'}, not the Campfire panel` };
  const c = await clickRow('Bind');
  if (!c.ok) return c;
  for (let i = 0; i < 25; i++) {
    const h = await homeFire();
    if (h) return { ok: true, home: h };
    await page.waitForTimeout(300);
  }
  return { ok: false, why: 'the home marker never appeared after the Bind & Restock click' };
};

// "Restock" is an EXACT match: "Bind & Restock" contains it. Every press refills to
// cap (there is no once-per-visit rule), so this is callable repeatedly.
const restockAtFire = async () => {
  const pnl = await pressForPanel();
  if (!pnl || !/campfire/i.test(pnl.actor)) return { ok: false, why: `E opened ${pnl ? `"${pnl.actor}"` : 'nothing'}, not the Campfire panel` };
  const c = await clickRow('Restock', true);
  if (!c.ok) return c;
  await page.waitForTimeout(600);
  return { ok: true, panelClosed: !(await convPanel()) };
};

const pressCamp = () => page.click('#utilityList li[data-utility="2"]');
const pressRecall = () => page.click('#utilityList li[data-utility="1"]');

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });

  // --- 1. join fresh, dwell at the spawn fire -------------------------------
  const creation = page.locator('#characterCreation:not(.hidden)');
  await creation.waitFor({ state: 'visible', timeout: 120_000 });
  await page.fill('#characterCreation .characterNameInput', harnessCharacterName('cmp'));
  await page.click('#characterCreation .characterCreateSubmit');
  await page.waitForSelector('#accountScreens.hidden', { state: 'attached', timeout: 120_000 });
  await page.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
  await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
  await page.evaluate(() => { const p = document.getElementById('developPanel'); if (p) p.style.display = 'none'; });
  await page.waitForTimeout(1200);
  await cmd('PING'); // the first command after joining is dropped
  await cmd('GOD on');  // survival on open ground, AND it switches passive regen off
  await page.evaluate(() => {
    let r = window.game.character.plate.parent;
    while (r.parent) r = r.parent;
    window.__auraRoot = r;
  });

  // Stand ON the spawn fire (a jittered spawn point may be outside its circle).
  const FIRE = await nearestFire();
  await cmd(`WARP ${w(FIRE.x, FIRE.y)}`);
  await page.waitForTimeout(3_000);
  const button = await campButton();
  check(!!button && button.label === 'Camp',
    'the Camp button is present, nothing discovered or slotted', JSON.stringify(button));
  const tip = await hoverTooltip(2);
  check(/^Camp/.test(tip) && /Utility/.test(tip) && /Charges:/.test(tip) && /Cast time:/.test(tip),
    'hovering it renders the GAME tooltip, not the browser one', JSON.stringify(tip.slice(0, 90)));
  await unhover();
  const fresh = await charges();
  check(fresh.have === 0, 'standing in a real fire restocked NOTHING (a fresh character holds no charges)',
    `counter reads "${button?.charges}"`);
  const bind = await bindAtFire();
  check(bind.ok, 'E at the fire + "Bind & Restock" binds', bind.ok ? `home=${bind.home}` : bind.why);
  const HOME = await pos();
  await page.waitForTimeout(600);
  const start = await charges();
  check(start.cap === 1 && start.have === 1,
    'Bind & Restock filled the store to the level-1 cap of ONE',
    `counter reads "${await chargeText()}"`);
  check((await campButton())?.greyed === false, 'and the button is not greyed while charges are held');

  // The cap grows with the character, and it is the ONLY axis of the camp that
  // visibly does (D9 — the heal is %-of-max, so it scales invisibly with the
  // pool). Levelled to the ceiling so the assertion needs no knowledge of where
  // the curve's rungs sit; what is pinned is that the cap MOVED.
  await cmd('XP 100000000');
  await page.waitForTimeout(1_500);
  const raised = await charges();
  check(raised.cap > start.cap && raised.have === start.have,
    'levelling up raised the CAP — and did NOT quietly top the store up with it',
    `${start.have}/${start.cap} at level 1 → ${raised.have}/${raised.cap} at the ceiling`);

  // The fire's "Restock" row refills to the NEW cap (no re-entry needed).
  const rs = await restockAtFire();
  check(rs.ok && rs.panelClosed, 'the Restock row closes the panel', rs.ok ? '' : rs.why);
  await page.waitForTimeout(600);
  const grown = await charges();
  check(grown.have === grown.cap, 'and Restock fills to the new cap',
    `${grown.have}/${grown.cap}`);
  const CAP = grown.cap;

  // --- 2. warp to open ground ----------------------------------------------
  await cmd(`WARP ${w(OPEN_GROUND.x, OPEN_GROUND.y)}`);
  await page.waitForTimeout(20_000); // camera + position settle across a long warp (§20)
  const out = await pos();
  check(dist(out, HOME) > 20 && (await campsNearby()) === 0,
    'warped to open ground, no fire of any kind nearby',
    `${dist(out, HOME).toFixed(1)} units from home`);

  // --- 3. press: the channel starts and costs nothing yet --------------------
  await pressCamp();
  await page.waitForFunction(() => {
    const bar = document.getElementById('castBar');
    return bar?.classList.contains('casting') && /Camp/.test(bar.querySelector('.barText')?.textContent ?? '');
  }, null, { timeout: 5_000 });
  const bar = await castBar();
  check(bar.casting && /Camp/.test(bar.text), 'the cast bar winds up labelled "Camp"', bar.text);
  check((await charges()).have === CAP, 'and the press has spent NOTHING (D4)', await chargeText());

  // --- 4. moving cancels it, and the interrupt is free -----------------------
  await page.keyboard.down('w');
  await page.waitForTimeout(1_500); // a long hold — headless rAF sampling (verify skill)
  await page.keyboard.up('w');
  await page.waitForFunction(() => !document.getElementById('castBar')?.classList.contains('casting'),
    null, { timeout: 5_000 });
  await page.waitForTimeout(CHANNEL_MS + 1_500); // past where completion would have landed
  check((await campsNearby()) === 0, 'the interrupted channel placed no camp');
  check((await charges()).have === CAP, 'and cost no charge — an interrupt is not work (D4)', await chargeText());

  // --- 6a. the heal CONTROL: recovery here, with no camp ---------------------
  // Taken before the camp exists, so both windows share a position, a level and
  // a pool. ⚑ DAMAGE takes a whole PERCENT and writes the pool directly, so it
  // bites through godmode; godmode in turn skips updateVitalSigns, so this
  // window has no regen to confound the camp window with.
  await cmd('DAMAGE 50');
  await page.waitForTimeout(1_500);
  const hurtA = await healthFraction();
  check(hurtA > 0.3 && hurtA < 0.7, 'the control window starts wounded', `at ${(hurtA * 100).toFixed(0)}% health`);
  await page.waitForTimeout(HEAL_WINDOW_MS);
  const controlGain = (await healthFraction()) - hurtA;
  check(controlGain < 0.02, 'and recovers nothing without a fire — regen is off under GOD',
    `+${(controlGain * 100).toFixed(0)}% over ${HEAL_WINDOW_MS / 1000}s`);

  // --- 5. place: the camp appears and one charge is taken --------------------
  await pressCamp();
  await page.waitForTimeout(CHANNEL_MS + 1_000);
  check((await waitForCamps(1)) === 1, 'the completed channel placed exactly one camp',
    `${await campsNearby()} camp sprite(s) within 4 units`);
  check((await charges()).have === CAP - 1, 'and the charge was spent AT COMPLETION', await chargeText());

  // --- 6b. the heal, inside the camp ----------------------------------------
  await cmd('DAMAGE 50');
  await page.waitForTimeout(1_500);
  const hurtB = await healthFraction();
  await page.waitForTimeout(HEAL_WINDOW_MS);
  const campGain = (await healthFraction()) - hurtB;
  check(campGain > 0.1 && campGain > controlGain + 0.1,
    'standing in the camp heals — and it is the ONLY thing that can be healing',
    `+${(campGain * 100).toFixed(0)}% in camp vs +${(controlGain * 100).toFixed(0)}% control, same ${HEAL_WINDOW_MS / 1000}s window`);

  // --- 7. placing again replaces, it does not stack --------------------------
  await pressCamp();
  await page.waitForTimeout(CHANNEL_MS + 2_500); // the old one expires on its next tick
  check((await waitForCamps(1)) === 1, 'a second placement REPLACES the first — still one camp (D5)',
    `${await campsNearby()} camp sprite(s) within 4 units`);
  check((await charges()).have === CAP - 2, 'and it cost a second charge', await chargeText());

  // --- 8. a placed camp refills nothing (L3) ---------------------------------
  await page.waitForTimeout(4_000); // standing restocks nothing anywhere; a placed camp is no fire either
  check((await charges()).have === CAP - 2,
    'standing INSIDE the placed camp refills nothing — it is not a real fire (L3)',
    await chargeText());

  // --- 9. down to the last charge, then the greyed button --------------------
  // Loop rather than press a fixed number of times: the cap is a tuning value.
  for (let left = (await charges()).have; left > 0; left--) {
    await pressCamp();
    await page.waitForTimeout(CHANNEL_MS + 2_500);
  }
  const empty = await campButton();
  check(empty?.charges === `0/${CAP}` && empty?.greyed === true,
    'spending the last charge greys the button', JSON.stringify(empty));

  await pressCamp();
  await page.waitForTimeout(2_000);
  const refused = await castBar();
  // ⚑ Assert on the `casting` CLASS, not the bar text: the text is left in
  // place when a cast ends, so a stale "Camp 0.0s" is what a working refusal
  // looks like.
  check(!refused.casting, 'and pressing it with an empty store starts no channel',
    `castBar.casting=${refused.casting}`);

  // --- 10. the camp burns out on its TTL -------------------------------------
  await page.waitForTimeout(TTL_MS + 2_000);
  check((await waitForCamps(0)) === 0, 'the camp burned out on its own lifetime',
    `${await campsNearby()} camp sprite(s) left`);

  // --- 11. back to a real fire: Restock refills on EVERY press ---------------
  await pressRecall();
  await page.waitForTimeout(14_000); // 300 ticks = 10 s, plus margin
  const backHome = await pos();
  check(dist(backHome, HOME) <= 2.5, 'Recall took us back to the bound fire',
    `${dist(backHome, HOME).toFixed(2)} units from home`);
  const idle = await charges();
  check(idle.have === 0, 'and standing at the real fire restocked NOTHING', await chargeText());
  await cmd(`WARP ${w(FIRE.x, FIRE.y)}`);
  await page.waitForTimeout(3_000);
  const rs1 = await restockAtFire();
  await page.waitForTimeout(600);
  const refilled = await charges();
  check(rs1.ok && refilled.have === CAP && refilled.cap === CAP,
    'E + Restock at a REAL fire refilled the store to cap', rs1.ok ? await chargeText() : rs1.why);
  // Spend one charge beside the fire, then press Restock again: no once-per-visit rule.
  await pressCamp();
  await page.waitForTimeout(CHANNEL_MS + 2_500);
  const spent = await charges();
  check(spent.have === CAP - 1, 'a charge was spent beside the fire', await chargeText());
  const rs2 = await restockAtFire();
  await page.waitForTimeout(600);
  const again = await charges();
  check(rs2.ok && again.have === CAP, 'a SECOND Restock in the same visit refills again (every press)',
    rs2.ok ? await chargeText() : rs2.why);
} catch (err) {
  check(false, 'the run completed', String(err && err.message ? err.message : err));
  try { await page.screenshot({ path: '/tmp/r4-camp-fail.png' }); } catch { /* best effort */ }
} finally {
  check(consoleErrors.length === 0, `${consoleErrors.length} console errors`,
    consoleErrors.slice(0, 3).join(' | '));
  await browser.close();
}

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} passed`);
console.log('(run: cd backend && go run ./cmd/harnessdb -cleanup)');
process.exit(passed === results.length ? 0 : 1);
