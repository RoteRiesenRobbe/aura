#!/usr/bin/env node
// plan-entity-model.md chunk 3b-ii — in-game smoke for the conversation panel.
//
// What it proves: talking stopped being a bubble that fires at you and became a
// TREE you browse. Everything is an option (D15), the server owns availability
// and the client owns position (D16).
//
//   1. Emberkeeper, E     → the panel opens on the greeting; its named branch
//                           rows are all present, plus the synthetic "Leave."
//                           row LAST and only at root (Q1 §4.3)
//   2. "Teach me…"        → the teaching list: Torch available, Ignite locked
//                           reading "level 7", Immolate locked "level 12" (D20)
//   3. click Ignite       → INERT (Q1/R1): the panel text does not change and
//                           nothing is taught — the greying is the message
//   4. click Torch        → teaches Torch AND ONLY Torch, the row vanishes on
//                           the next snapshot, the unlock banner fires
//   5. Back               → returns to the greeting
//   6. hint branch        → "Anything new around here?" is a leaf reply
//   7. Leave              → the ✕ closes; the "Leave." row closes; walking out
//                           of range closes; E toggles
//   8. Wanderer           → stops while talked to, walks on afterwards (D22)
//   9. TownCrier          → calls out its ambient line as you pass WITHOUT
//                           opening anything (D18 — the NPC that does both)
//
// ⚑ The old leg 10 ("being hit closes the panel", a permanent SKIP) is GONE
// with the gates themselves: Q1 §4.2 deleted every combat gate, so combat ends
// neither the offer nor the session. The inverted coverage lives in Go
// (TestSession_SurvivesCombat / TestInteractionSystem_CombatDoesNotWithdrawTheOffer),
// which remains the only place player combat can be stamped at all.
//
// ⚑ Harness traps carried from chunks 2/3a/3b-i, all still live:
//   · the dev console input stopPropagation()s keydown — blur() before walking
//   · screen-up is DECREASING world y, so walking toward a LARGER y is 's'
//   · E is edge-triggered off an rAF-throttled clock: it needs a ~1.4 s HOLD
//   · a fixed walk duration cannot reach these actors — step in 0.5 s bursts and
//     stop on the badge (and the Wanderer now MOVES, so doubly so)
//   · cache the scene-graph root while the character is alive; run GOD
//   · HUD panels listen on pointerdown, never click
//
// Usage: node .claude/skills/verify/chunk3b-ii-conversation.mjs [label] [url]
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { botName } from './botname.mjs';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');

const label = process.argv[2] || 'run';
const url = process.argv[3] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

// WARP takes 1/120 units and wants whole units.
const w = (x, y) => `${Math.round(x) * 120} ${Math.round(y) * 120}`;
const NEAR_EMBERKEEPER = w(35, -22);   // Emberkeeper (34.52, -19.6)
// ⚑ The Wanderer SPAWNS at (-15.53, 30.68) but now wanders within radius 4, so
// it is never where the zone file says. Warp onto the spawn point itself and
// sweep outward — a fixed approach vector aimed at the spawn can miss by up to
// two radii.
const WANDERER_SPAWN = w(-16, 31);
// ⚑ TownCrier (-55.74, 21.96). Warp just OUTSIDE the 2.0 talk range, not far
// away: the ambient line fires on the sensor's rising edge and then fades, so
// the approach has to be short enough that the bubble is still up when it is
// read. A long walk through town also runs into buildings and roaming wolves.
const NEAR_TOWNCRIER = w(-56, 20);

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();

const consoleErrors = [];
const ctxLosses = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
  if (m.text().includes('[webgl] world context lost')) ctxLosses.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await page.waitForSelector('#startForm .playerNameSubmit:not([disabled])', { timeout: 120_000 });
await page.fill('#startForm .playerNameInput', botName('chatter'));
await page.click('#startForm .playerNameSubmit');
await page.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });

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

const primeRoot = () => page.evaluate(() => {
  if (!window.__auraRoot) {
    let r = window.game.character.plate.parent;
    while (r.parent) r = r.parent;
    window.__auraRoot = r;
  }
  return true;
});

const worldText = () => page.evaluate(() => {
  const out = [];
  const walk = (c) => {
    if (typeof c?.text === 'string' && c.text) out.push(c.text);
    (c?.children || []).forEach(walk);
  };
  walk(window.__auraRoot);
  return out;
});

const badgeCount = () => page.evaluate(() => {
  let n = 0;
  const walk = (c) => {
    if (c?.visible === false) return;
    if (typeof c?.text === 'string' && c.text.trim() === 'E') n++;
    (c?.children || []).forEach(walk);
  };
  walk(window.__auraRoot);
  return n;
});

// Whether the server is currently offering this player somebody to talk to.
//
// ⚑ It has to be read off the BADGE, not off the client's own state. `window.game`
// is a four-method façade — {run, character, pause, play} — NOT the Game
// instance, so window.game.getInteractableEntityId and window.game.map.objects
// do not exist. Reading them silently yields 0/undefined, which presented as
// "the Wanderer never moved" and "the TownCrier was never reached" for two
// entire runs. Verified live: `hasGetter: "undefined"`.
//
// Consequence to respect: the badge is SUPPRESSED while its own panel is open,
// so this reports false during a conversation. Use panelOpen() there instead.
const offered = async () => (await badgeCount()) > 0;

// --- the panel: plain DOM, which is a great deal easier to read than 3b-i's
//     scene-graph walking ---

const panel = () => page.evaluate(() => {
  const el = document.getElementById('conversation');
  if (!el || el.classList.contains('hidden')) return null;
  return {
    actor: el.querySelector('.conversationActor')?.textContent?.trim() ?? '',
    lines: el.querySelector('.conversationLines')?.textContent?.trim() ?? '',
    rows: [...el.querySelectorAll('.conversationRows li')].map((li) => ({
      text: li.textContent.trim(),
      locked: li.classList.contains('locked'),
    })),
    canGoBack: !el.querySelector('.conversationBack')?.classList.contains('hidden'),
  };
});

const panelOpen = async () => (await panel()) !== null;

// Records any click that could not be delivered, so a missed one is reported as
// itself rather than as a puzzling downstream failure.
//
// ⚑ This is how the panel's re-render churn was found: before Conversation.ts
// skipped unchanged renders, the row list was rebuilt ~30×/s, so an <li> located
// by evaluateHandle was often detached by the time boundingBox() ran — the click
// silently never happened and the panel just "did nothing".
const missedClicks = [];

// Click a panel row by visible-text match, with a REAL mouse click at its
// centre (the verify skill's rule — synthetic dispatch is unreliable).
const clickRow = async (needle) => {
  const box = await page.evaluateHandle((n) => {
    const rows = [...document.querySelectorAll('#conversation .conversationRows li')];
    return rows.find((li) => li.textContent.includes(n)) ?? null;
  }, needle);
  const el = box.asElement();
  if (!el) { missedClicks.push(`row not found: ${needle}`); return false; }
  const b = await el.boundingBox();
  if (!b) { missedClicks.push(`row detached before the click: ${needle}`); return false; }
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForTimeout(900);
  return true;
};

const clickPanelControl = async (selector) => {
  const el = await page.$(`#conversation ${selector}`);
  if (!el) { missedClicks.push(`control not found: ${selector}`); return false; }
  const b = await el.boundingBox();
  if (!b) { missedClicks.push(`control detached before the click: ${selector}`); return false; }
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForTimeout(900);
  return true;
};

const spellbook = () => page.evaluate(() =>
  [...document.querySelectorAll('#spellbookList li')].map((li) => li.textContent.trim()));

const bannerText = () => page.evaluate(() => document.getElementById('alertBanner')?.textContent?.trim() || '');

// Walk in short bursts until the badge state becomes `want`, then STOP.
const walkUntilBadge = async (key, want, maxSeconds = 16) => {
  await page.evaluate(() => document.activeElement?.blur());
  for (let elapsed = 0; elapsed < maxSeconds; elapsed += 0.5) {
    if ((await badgeCount() > 0) === want) return true;
    await page.keyboard.down(key);
    await page.waitForTimeout(500);
    await page.keyboard.up(key);
  }
  return (await badgeCount() > 0) === want;
};

// ⚑ ~1.4 s hold: the interact key rides the edge-triggered hotkey path, sampled
// from an rAF-driven clock that a headless page throttles hard.
const press = async (key) => {
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down(key);
  await page.waitForTimeout(1400);
  await page.keyboard.up(key);
  await page.waitForTimeout(1200);
};

// ⚑ Hide the dev panel before touching the HUD. `&develop` is required for the
// console (WARP/GOD/SKILL), but #developPanel is a large DRAGGABLE TABLE parked
// over the right-hand side of the screen — and it sits above the HUD, so a
// coordinate click anywhere under it hits the table instead. That is what made
// the conversation panel's ✕ unclickable for three runs of this script: the
// probe reported `elementAtCentre: TABLE.` and zero websocket frames sent. The
// console itself is a separate element and is unaffected.
await page.evaluate(() => {
  const dev = document.getElementById('developPanel');
  if (dev) dev.style.display = 'none';
});

await cmd('PING'); // the first command after joining is dropped (harness note)
await cmd('GOD');
await primeRoot();

const results = [];
const check = (name, pass, detail) => results.push({ check: name, pass, detail });
const skip = (name, detail) => results.push({ check: name, pass: null, detail });

// ================= 1. the Emberkeeper's tree =================
await cmd(`WARP ${NEAR_EMBERKEEPER}`);
await page.waitForTimeout(20_000); // camera + position settle across the warp (§20)

await walkUntilBadge('s', true);
await page.waitForTimeout(1000);

check('Approaching opens NOTHING (D18: nothing speaks unprompted)',
  !(await panelOpen()), `panel: ${JSON.stringify(await panel())}`);

await press('e');
const greeting = await panel();
await page.screenshot({ path: `/tmp/chunk3bii-${label}-1-greeting.png` });

// ⚑ By NAME, never by count (verify rule 1 — and Q1's Leave row is exactly the
// kind of change a count assertion would misreport as "the greeting broke").
check('E opens the panel on the greeting node',
  greeting !== null && /Emberkeeper/i.test(greeting.actor)
    && greeting.rows.some((r) => /teach me something/i.test(r.text))
    && greeting.rows.some((r) => /anything new around here/i.test(r.text)),
  `actor ${JSON.stringify(greeting?.actor)}, ${greeting?.rows.length} rows: ${JSON.stringify(greeting?.rows.map((r) => r.text))}`);
check('The greeting has no Back (it is the root)',
  greeting?.canGoBack === false, `canGoBack ${greeting?.canGoBack}`);
check('The synthetic "Leave." row renders LAST at the root (Q1 §4.3)',
  greeting !== null && greeting.rows.length > 0 && /^Leave\.$/.test(greeting.rows[greeting.rows.length - 1].text),
  `last row: ${JSON.stringify(greeting?.rows[greeting?.rows.length - 1]?.text)}`);
check('The badge goes out while its own conversation is open',
  (await badgeCount()) === 0, `visible "E" badges: ${await badgeCount()}`);

// ================= 2. the teaching list, with its walls =================
await clickRow('Teach me something');
const list = await panel();
await page.screenshot({ path: `/tmp/chunk3bii-${label}-2-teachings.png` });

// Rows NAME the skill directly since the 2026-08-02 plain-text pass.
const torchRow = list?.rows.find((r) => /Torch/i.test(r.text));
const igniteRow = list?.rows.find((r) => /Ignite/i.test(r.text));
const immolateRow = list?.rows.find((r) => /Immolate/i.test(r.text));

// ⚑ No exact row COUNT. This asserted `=== 3` and went red the day `3b1b3ef6`
// authored a fourth teaching on this NPC (BindElemental, the charm teacher) —
// a harness reporting "the teaching list broke" because the teaching list grew.
// The rows that matter are each asserted by name below, which is what the check
// was actually for; the count only encoded how much content existed that week.
check('Following a branch reaches the teaching list',
  list !== null && list.rows.length >= 3 && list.canGoBack === true,
  `${list?.rows.length} rows, canGoBack ${list?.canGoBack}: ${JSON.stringify(list?.rows.map((r) => r.text))}`);
check('Torch is available at level 1',
  torchRow !== undefined && torchRow.locked === false, `${JSON.stringify(torchRow)}`);
check('Ignite is LOCKED and names its wall — level 7 (D20)',
  igniteRow?.locked === true && /level 7/.test(igniteRow.text), `${JSON.stringify(igniteRow)}`);
check('Immolate is LOCKED and names level 12',
  immolateRow?.locked === true && /level 12/.test(immolateRow.text), `${JSON.stringify(immolateRow)}`);
// The fourth teaching, authored in `3b1b3ef6` — cover it rather than merely
// tolerate it, so this NPC's whole authored wall set is under test.
const bindRow = list?.rows.find((r) => /Bind Elemental/i.test(r.text));
check('BindElemental is LOCKED and names level 15',
  bindRow?.locked === true && /level 15/.test(bindRow.text), `${JSON.stringify(bindRow)}`);

// ================= 3. a locked row is INERT (Q1/R1) =================
// blockedLine is deleted: the greying and the named wall are the whole answer,
// so clicking a locked row changes nothing — no reply, no navigation, no grant.
const beforeLocked = await panel();
const beforeLockedBook = await spellbook();
await clickRow('Ignite');
const afterLockedPanel = await panel();
const afterLockedBook = await spellbook();
await page.screenshot({ path: `/tmp/chunk3bii-${label}-3-inert.png` });

check('Clicking a locked row says NOTHING — the panel text is unchanged (Q1/R1)',
  afterLockedPanel !== null && afterLockedPanel.lines === beforeLocked?.lines,
  `lines before ${JSON.stringify(beforeLocked?.lines)} → after ${JSON.stringify(afterLockedPanel?.lines)}`);
check('...and teaches NOTHING',
  !afterLockedBook.some((s) => /Ignite/i.test(s)),
  `spellbook ${JSON.stringify(beforeLockedBook)} → ${JSON.stringify(afterLockedBook)}`);

// ================= 4. taking a row teaches exactly that row (D17) =============
await clickRow('Torch');
const taught = await panel();
const afterTorch = await spellbook();
const banner = await bannerText();
await page.screenshot({ path: `/tmp/chunk3bii-${label}-4-taught.png` });

check('Clicking Torch speaks its grant line',
  /I'll teach you Torch/i.test(taught?.lines ?? ''), `lines: ${JSON.stringify(taught?.lines)}`);
check('...teaches Torch AND ONLY Torch (D17 retires the ordered walk)',
  afterTorch.some((s) => /Torch/i.test(s))
    && !afterTorch.some((s) => /Ignite|Immolate/i.test(s)),
  `spellbook → ${JSON.stringify(afterTorch)}`);
check('...fires the attribution banner',
  /Taught by: Emberkeeper/.test(banner), `banner: ${JSON.stringify(banner)}`);
check('...and the taught row vanishes from the next snapshot',
  (await panel())?.rows.every((r) => !/Torch/i.test(r.text)) === true,
  `rows now: ${JSON.stringify((await panel())?.rows.map((r) => r.text))}`);

// ================= 5. Back, and the hint branch =================
await clickPanelControl('.conversationBack');
const backAtRoot = await panel();
check('Back returns to the greeting',
  backAtRoot !== null && backAtRoot.canGoBack === false
    && backAtRoot.rows.some((r) => /anything new around here/i.test(r.text)),
  `canGoBack ${backAtRoot?.canGoBack}, rows ${JSON.stringify(backAtRoot?.rows.map((r) => r.text))}`);

await clickRow('Anything new around here');
const hint = await panel();
await page.screenshot({ path: `/tmp/chunk3bii-${label}-5-hint.png` });
check('The hint branch is a leaf reply: lines, no rows, Back available',
  hint !== null && hint.rows.length === 0 && hint.canGoBack === true
    && /Bandits hide in the dark forest/i.test(hint.lines),
  `rows ${hint?.rows.length}, canGoBack ${hint?.canGoBack}, lines ${JSON.stringify(hint?.lines)}`);

// ================= 6. Leave, re-open, E toggles, range =================

// ⚑ Instrumented, because a failure here is ambiguous three ways: the click may
// not reach the handler, the handler may not send, or the server may not honour
// it. Counting outbound frames splits the first two from the third.
await page.evaluate(() => {
  if (window.__wsSends !== undefined) return;
  window.__wsSends = 0;
  const proto = WebSocket.prototype;
  const original = proto.send;
  proto.send = function (...args) { window.__wsSends++; return original.apply(this, args); };
});
const leaveProbe = await page.evaluate(() => {
  const el = document.querySelector('#conversation .conversationLeave');
  const r = el.getBoundingClientRect();
  const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
  return {
    rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
    elementAtCentre: hit ? `${hit.tagName}.${hit.className}` : null,
    sendsBefore: window.__wsSends,
  };
});
const leaveClicked = await clickPanelControl('.conversationLeave');
const sendsAfter = await page.evaluate(() => window.__wsSends);
const closedByButton = !(await panelOpen());

// Escape is the same code path with no coordinates involved, so it separates
// "the handler is wrong" from "the click did not land".
if (!closedByButton) {
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1200);
}
const closedAtAll = !(await panelOpen());
check('Leave (the ✕) closes the panel', closedByButton,
  `clicked ${leaveClicked}, probe ${JSON.stringify(leaveProbe)}, ws sends ${leaveProbe.sendsBefore}→${sendsAfter}`);
check('...and Escape closes it too (D21)', closedAtAll,
  `panel: ${JSON.stringify(await panel())}`);
check('...and the badge comes back', (await badgeCount()) > 0, `badges: ${await badgeCount()}`);

await press('e');
const reopened = await panelOpen();
await press('e');
check('E re-opens, and a second E closes it again',
  reopened === true && !(await panelOpen()), `reopened ${reopened}, still open ${await panelOpen()}`);

// The synthetic "Leave." row does exactly what ✕ does (Q1 §4.3): its handler
// calls leave(), which sends close and waits for the server to drop the tree.
await press('e');
const openBeforeLeaveRow = await panelOpen();
await clickRow('Leave.');
check('Clicking the "Leave." row closes the panel (Q1 §4.3)',
  openBeforeLeaveRow === true && !(await panelOpen()),
  `open before ${openBeforeLeaveRow}, after ${await panelOpen()}`);

await press('e');
const openBeforeWalk = await panelOpen();

// ⚑ Walk until the PANEL closes, not until the badge goes out. The badge is
// deliberately suppressed while its own conversation is open, so a
// walkUntilBadge(…, false) here is satisfied before the first step and the
// player never moves — which reads exactly like "leaving range does nothing".
await page.evaluate(() => document.activeElement?.blur());
for (let elapsed = 0; elapsed < 16 && (await panelOpen()); elapsed += 0.5) {
  await page.keyboard.down('w');
  await page.waitForTimeout(500);
  await page.keyboard.up('w');
}
await page.waitForTimeout(1200);
await page.screenshot({ path: `/tmp/chunk3bii-${label}-6-outofrange.png` });
check('Walking out of talk range closes the panel (D21/L26)',
  openBeforeWalk === true && !(await panelOpen()),
  `open before ${openBeforeWalk}, after ${await panelOpen()} at ${JSON.stringify(await pos())}`);

// ================= 7. the Wanderer holds position (D22) =================
// ⚑ REPAIRED 2026-07-30 (quest C3), after two chunks of intermittent red. The
// product was always right — the D22 hold+release is pinned server-side in Go
// (TestMob_ConversingHoldsThenReleasesWander, model/mob) — and the rot was in
// the PIN: pinBadgedActor() was called after the panel opened, but the badge is
// suppressed for the actor the panel belongs to, so it never matched and the
// measurement silently fell back to findMover's "largest mover" (the camera, or
// a boar that later left the viewport and froze — drift 0 during AND after,
// which reads exactly like "it never walks on"). The pin now happens with the
// badge still lit, and the leg goes INCONCLUSIVE rather than red if it fails.
await cmd(`WARP ${WANDERER_SPAWN}`);
await page.waitForTimeout(20_000);

// ⚑ Finding a MOVING target needs steering, not sweeping. Two things conspire
// here: `wanderRadius` also randomises the SPAWN point (MobSystem.spawnAt
// offsets by randomInDisc), so the Wanderer starts up to 4 units off the
// authored spot and wanders 4 more — up to ~8 units from the warp. A blind
// sweep missed it on every run, reported as "the Wanderer never moves".
//
// So: identify it by being the thing that MOVES while the player stands still,
// then walk at it. Camera-level containers are excluded by skipping the
// player's own ancestor chain — including them is what made an earlier drift
// metric report 5.25 units/4 s for an NPC that ambles at 0.29 (it was measuring
// the pan).
const findMover = async (ms = 4000) => {
  await page.evaluate(() => {
    window.__skip = new Set();
    let n = window.game.character.shape || window.game.character.plate;
    while (n) { window.__skip.add(n); n = n.parent; }
    window.__tag = 0;
    const walk = (c) => {
      if (c?.position && typeof c.position.x === 'number' && !window.__skip.has(c) && c.__eTag === undefined) {
        c.__eTag = ++window.__tag;
        window.__byTag = window.__byTag || {};
        window.__byTag[c.__eTag] = c;
      }
      (c?.children || []).forEach(walk);
    };
    walk(window.__auraRoot);
  });
  const snap = () => page.evaluate(() => {
    const out = {};
    for (const [tag, c] of Object.entries(window.__byTag || {})) {
      if (c?.position) out[tag] = { x: c.position.x, y: c.position.y };
    }
    return out;
  });
  const before = await snap();
  await page.waitForTimeout(ms);
  const after = await snap();
  let bestTag = null;
  let bestD = 0;
  for (const tag of Object.keys(before)) {
    if (!after[tag]) continue;
    const d = Math.hypot(after[tag].x - before[tag].x, after[tag].y - before[tag].y) / 120;
    if (d > bestD) { bestD = d; bestTag = tag; }
  }
  if (bestTag !== null) {
    await page.evaluate((t) => { window.__pinnedActor = window.__byTag[t]; }, bestTag);
  }
  return { tag: bestTag, drift: +bestD.toFixed(3) };
};

// Walk at the pinned actor until it is in talking range.
const steerToPinned = async (maxSeconds = 40) => {
  for (let elapsed = 0; elapsed < maxSeconds; elapsed += 0.5) {
    if (await offered()) return true;
    const d = await page.evaluate(() => {
      const a = window.__pinnedActor;
      if (!a?.position) return null;
      return {
        dx: a.position.x / 120 - window.game.character.getX() / 120,
        dy: a.position.y / 120 - window.game.character.getY() / 120,
      };
    });
    if (!d) return false;
    // Screen-up is DECREASING world y, so +dy is 's'.
    const key = Math.abs(d.dx) > Math.abs(d.dy) ? (d.dx > 0 ? 'd' : 'a') : (d.dy > 0 ? 's' : 'w');
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.down(key);
    await page.waitForTimeout(500);
    await page.keyboard.up(key);
  }
  return await offered();
};

// Pin the actor currently wearing the interact badge, so its movement can be
// measured before, during and after a conversation.
//
// ⚑ Identify it by the BADGE, not by "whatever moved". A first cut took the
// largest mover among all containers and reported 5.25 units in 4 s for an NPC
// that ambles at 0.29 — it was measuring the CAMERA, because the world
// container has a position too and every pan looks like motion. The badge is
// parented to the actor's own sprite (the AuraTickIndicator precedent), so the
// container holding a visible "E" Text IS the actor.
//
// The tag is an expando on the live PixiJS object, so it survives the badge
// being hidden when the panel opens — which is exactly when it is needed.
const pinBadgedActor = () => page.evaluate(() => {
  let found = null;
  const walk = (c) => {
    if (c?.visible === false) return;
    const hasBadge = (c?.children || []).some((k) =>
      k?.visible !== false && (
        (typeof k.text === 'string' && k.text.trim() === 'E') ||
        (k.children || []).some((g) => typeof g?.text === 'string' && g.text.trim() === 'E')));
    if (hasBadge && !found) found = c;
    (c?.children || []).forEach(walk);
  };
  walk(window.__auraRoot);
  if (found) window.__pinnedActor = found;
  return !!window.__pinnedActor;
});

const pinnedPos = () => page.evaluate(() => {
  const a = window.__pinnedActor;
  return a?.position ? { x: a.position.x, y: a.position.y } : null;
});

// World units. ⚑ Never screen space: `Cam Boundaries: On` clamps the camera at
// map edges, so a screen-space metric lies near a boundary (the chunk-2 finding
// that nearly shipped a false regression). A sprite's .position and
// character.getX()/getY() share a space; divide by 120.
const pinnedDrift = async (ms) => {
  const before = await pinnedPos();
  if (!before) return -1;
  await page.waitForTimeout(ms);
  const after = await pinnedPos();
  if (!after) return -1;
  return +(Math.hypot(after.x - before.x, after.y - before.y) / 120).toFixed(3);
};

// ⚑ It dwells 1–3 s between legs, so a single window can legitimately catch it
// standing. Take the best of three, which is what "does it move at all" means.
const bestDrift = async (n, ms) => {
  let best = 0;
  for (let i = 0; i < n; i++) best = Math.max(best, await pinnedDrift(ms));
  return +best.toFixed(3);
};


const mover = await findMover();

// ⚑ Steering stops the instant the badge lights, i.e. at the very EDGE of the
// 2.0 talk range — and this actor keeps walking. Over E's ~1.4 s hold plus the
// settle it covers ~0.8 units, which is enough to leave range before the
// keypress is sampled: the badge lit, the key fired, and no panel appeared.
// So close in past the edge, then press, and retry the pair.
let pinnedByBadge = false;
const openOnPinned = async (attempts = 4) => {
  for (let i = 0; i < attempts; i++) {
    if (!(await steerToPinned(20))) continue;
    // Two extra bursts toward it: well inside range, not on the boundary.
    for (let k = 0; k < 2; k++) {
      const d = await page.evaluate(() => {
        const a = window.__pinnedActor;
        if (!a?.position) return null;
        return {
          dx: a.position.x / 120 - window.game.character.getX() / 120,
          dy: a.position.y / 120 - window.game.character.getY() / 120,
        };
      });
      if (!d || Math.hypot(d.dx, d.dy) < 0.8) break;
      const key = Math.abs(d.dx) > Math.abs(d.dy) ? (d.dx > 0 ? 'd' : 'a') : (d.dy > 0 ? 's' : 'w');
      await page.evaluate(() => document.activeElement?.blur());
      await page.keyboard.down(key);
      await page.waitForTimeout(400);
      await page.keyboard.up(key);
    }
    // ⚑ Pin the actor HERE, with the badge still lit — this is the repair of the
    // long-flaky "walks on afterwards" leg (quest C3). pinBadgedActor() only
    // matches a VISIBLE badge, and the badge is suppressed for whoever the panel
    // belongs to, so calling it after the panel opened always missed and fell
    // back to "whatever moved most" — the camera, or a passing boar that later
    // left the viewport and froze at its last position, reading as drift 0
    // during AND after. The tag is an expando on the live object, so pinning
    // before the press survives the badge going dark.
    if (await pinBadgedActor()) pinnedByBadge = true;
    await press('e');
    if (await panelOpen()) return true;
  }
  return false;
};
// ⚑ Approach and PIN first, then baseline, then open — in that order, and each
// step depends on the one before it. The pin has to happen while the badge is
// lit (see the repair note above), and the baseline has to be measured on the
// pinned actor while no panel is open, or "does it move" is either somebody
// else's number or a reading of an actor already being held (which looks like a
// broken fixture rather than a working hold).
if (await steerToPinned(20)) {
  if (await pinBadgedActor()) pinnedByBadge = true;
}
const driftBefore = await bestDrift(2, 4000);

// It has been ambling throughout the baseline, so this re-steers before pressing.
const steered = await openOnPinned();
const pinned = pinnedByBadge || (await pinBadgedActor()) || mover.tag !== null;
await page.waitForTimeout(500);


if (!(await panelOpen())) await openOnPinned(2);
const wandererPanel = await panel();
const driftDuring = await bestDrift(3, 4000);
await clickPanelControl('.conversationLeave');
const driftAfter = await bestDrift(3, 4000);
await page.screenshot({ path: `/tmp/chunk3bii-${label}-7-wanderer.png` });

check('The Wanderer opens a panel',
  wandererPanel !== null && /Wanderer/i.test(wandererPanel.actor),
  `mover ${JSON.stringify(mover)}, steered ${steered}, pinned ${pinned}; ` +
  `actor ${JSON.stringify(wandererPanel?.actor)}, ` +
  `rows ${JSON.stringify(wandererPanel?.rows.map((r) => r.text))}`);
if (!pinnedByBadge) {
  // The precondition that makes this leg mean anything (verify rule 5): without
  // a badge-pinned actor the three drift numbers describe SOME container, and a
  // measurement of the wrong actor is worth nothing in either direction.
  skip('It holds position while talked to, and walks on afterwards (D22)', 'INCONCLUSIVE — the badge never lit long enough to pin the actor, so the drift ' +
      `numbers (before ${driftBefore}, during ${driftDuring}, after ${driftAfter}) are not this actor's. ` +
      'Restart the server and re-run this script alone.');
} else {
  check('It moves before the conversation', driftBefore > 0.05,
    `best drift ${driftBefore} units / 4 s`);
  check('It HOLDS POSITION while talked to (D22)', driftDuring >= 0 && driftDuring < 0.05,
    `during ${driftDuring} vs before ${driftBefore} (−1 = the actor was never pinned)`);
  check('...and walks on afterwards', driftAfter > 0.05, `after ${driftAfter}`);
}

// ================= 8. the TownCrier's ambient line (D18) =================
await cmd(`WARP ${NEAR_TOWNCRIER}`);
await page.waitForTimeout(20_000);

// ⚑ Sample world text WHILE closing on the actor, not once afterwards: an
// ambient bubble fires on the sensor's rising edge and then fades, so a single
// read 1.5 s later can easily land after it is gone.
let ambientBubbles = [];
const collectBubbles = async () => {
  for (const t of await worldText()) if (!ambientBubbles.includes(t)) ambientBubbles.push(t);
};
await page.evaluate(() => document.activeElement?.blur());
// ⚑ Short and one-directional. An earlier version swept four headings for 3 s
// each and walked the player 14 units past the target — "reached false at
// (-58.62, 35.75)" — which reads exactly like the NPC being broken.
let crierReached = false;
for (let elapsed = 0; elapsed < 8; elapsed += 0.5) {
  await collectBubbles();
  if (await offered()) { crierReached = true; break; }
  await page.keyboard.down('s');
  await page.waitForTimeout(500);
  await page.keyboard.up('s');
}
await collectBubbles();
await page.waitForTimeout(800);
await collectBubbles();
const ambientPanel = await panelOpen();
await page.screenshot({ path: `/tmp/chunk3bii-${label}-8-ambient.png` });

check('The TownCrier CALLS OUT as you pass (D18: ambient is its own field)',
  ambientBubbles.some((t) => /Hail Adventurer/i.test(t)),
  `reached ${crierReached} at ${JSON.stringify(await pos())}; matched: ` +
  JSON.stringify(ambientBubbles.filter((t) => /Hail Adventurer/i.test(t))));
check('...WITHOUT opening a panel — the two are independent',
  ambientPanel === false, `panel open: ${ambientPanel}`);

await press('e');
const crierPanel = await panel();
// ⚑ Asserted BY NAME, not by count (verify rule 1). This read `rows.length === 2`
// until quest chunk C4 gave the crier a quest-conditional greeting node — which
// sits above root by L3, so the row set a fresh player sees is now the offer
// node's, and the count moved. What this leg is actually about is that ambient
// speech and the conversation are independent (D18), so the check is that a tree
// opens with the crier's own navigation in it.
check('...and the same NPC still opens a tree on the key',
  crierPanel !== null && crierPanel.rows.some((r) => /teach me something/i.test(r.text)),
  `rows: ${JSON.stringify(crierPanel?.rows.map((r) => r.text))}`);

// (The old leg 9 — "being hit closes the panel", a permanent SKIP — was deleted
// with the combat gates themselves, Q1 §4.2. The inverted coverage is Go-only:
// TestSession_SurvivesCombat / TestInteractionSystem_CombatDoesNotWithdrawTheOffer.)

// ================= report =================
await browser.close();

const passed = results.filter((r) => r.pass === true).length;
const failed = results.filter((r) => r.pass === false).length;
const skipped = results.filter((r) => r.pass === null).length;

for (const r of results) {
  const mark = r.pass === true ? 'PASS' : r.pass === false ? 'FAIL' : 'SKIP';
  console.log(`${mark}  ${r.check}\n      ${r.detail}`);
}
console.log(`\n${passed}/${passed + failed} passed, ${skipped} skipped`);
console.log(`console errors: ${consoleErrors.length}`);
consoleErrors.slice(0, 8).forEach((e) => console.log('  ! ' + e));
console.log(`webgl context losses: ${ctxLosses.length}`);
if (missedClicks.length > 0) {
  console.log(`undelivered clicks: ${missedClicks.length}`);
  missedClicks.forEach((m) => console.log('  ! ' + m));
}

// ⚑ A lost WebGL context INVALIDATES the run — it does not fail it (backlog
// §29, ~1 smoke run in 6). The render loop dies inside rAF, which takes the
// scene graph AND Controls.update (Tock is rAF-driven) with it, so every
// badge/drift/bubble/hotkey check after that point reports a plausible-looking
// failure that has nothing to do with the feature. Observed exactly once while
// writing this script: it produced 8 "failures" downstream of the loss.
// Re-run rather than debug.
if (ctxLosses.length > 0) {
  console.log('\n⚑ INVALID RUN — the world WebGL context was lost mid-run (backlog §29).');
  console.log('   Rendering stopped, so every scene-graph and hotkey check after that');
  console.log('   point is meaningless. This is a known harness flake, not a regression.');
  console.log('   Re-run before drawing any conclusion from the failures above.');
  process.exit(2);
}

process.exit(failed === 0 && consoleErrors.length === 0 ? 0 : 1);
