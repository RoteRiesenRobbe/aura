// The ascension site in the world (docs/archive/plan-ascension.md §12.4, C2a step 1).
//
// What this owns that no Go test can: the site is a mob definition plus a zone
// spawn plus a gated dialogue tree, and every one of those layers is pinned in
// Go (the census, the placement, the minLevel-equals-the-cap coupling) while
// nothing pins that a PLAYER standing in the world is offered the stone and
// gets the right greeting from it. The gate in particular only ever runs on the
// present() path, per tick, for a real conversing player.
//
// ⚑ THE SHAPE IS BEFORE/AFTER ON ONE CHARACTER, and the before-leg is the
// design. "The stone says you may ascend" proves nothing on its own - it is the
// first node in the file, and a broken condition engine that passed everything
// would show it too. So the run first proves a LEVEL-1 character gets the
// preview, then raises only the level, then proves the greeting swapped. The
// only thing that changed is the number the gate reads.
//
// ⚑ IT MUST BE THE STONE THAT ANSWERS. The interact offer goes to the NEAREST
// eligible conversant and zone 1 stands them in clusters - the verify skill's
// own worked example is a warp aimed at the Farmer being answered by the
// Hermit. The stone's nearest neighbour is the TownCrier at 5.2 units, well
// outside the 2.0 talk range, and the actor name is asserted anyway: a run that
// measured the crier would go green and prove nothing.
//
// ⚑ THE REWARD LIST IS GENERATED, so the panel is the only place it can be seen
// at all: those rows exist in no file, and every Go test on the path feeds the
// source a fake catalog. This is therefore the only thing that proves the REAL
// catalog is wired (core/game.go's SetRowSource), because forgetting that call
// shows an empty stone and fails no Go test.
//
// ⭐ THE PROBE IS RETIRED (C3 step 4, 2026-08-10). api/ascension/ used to ship
// README-only, so this script installed a throwaway entry and every reward leg
// was conditional on it. The seed catalog now ships eight real entries, so the
// legs run unconditionally against the content players actually meet, and BOTH
// halves run in one pass instead of needing two runs with the probe's
// `conditions` swapped:
//
//   - FrostShield is authored GATED (bloodline_ascensions >= 3), which is the
//     locked-row / tier-B leg.
//   - RimeBurst is authored UNGATED, which is the pick-and-ceremony leg. It also
//     carries a `displayName` override ("Rime-Burst"), so matching it proves the
//     client renders the catalog's display name rather than the authored key.
//
// ⚑ c2a-probe-reward.json was DELETED rather than left lying about: it authored
// FrostShield with the same gate the real entry now carries, so copying it into
// api/ascension/ as the old header instructed would hard-fail the boot on a
// duplicate unlock key. A stale setup step that panics the server is worse than
// no setup step.
//
// Boundary: this owns whether the SITE stands in the world and greets
// correctly. What its rows do belongs to later steps of C2a; whether a
// bloodline unlock reaches a joining character is `c1-bloodline-seed.mjs`.

import { createRequire } from 'module';
import { join } from 'path';
import { joinAsNewCharacter } from './lib/join.mjs';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');

const label = process.argv[2] || 'run';
const url = process.argv[3] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

// The stone stands at (-57.6, 17.1); WARP takes whole units (×120), so the
// player lands 1.4 units west of it - inside the 2.0 talk range and outside
// the two bodies' radii, which a warp onto the spawn itself would not be.
const WARP_TO = 'WARP -7080 2040';
const ACTOR = 'Ascension Stone';
// ⚑ RE-WORDED BY C2 (was 'Needs a max-level character'): the preview's lines
// stopped naming the price, because the locked row below them composes it live
// and prose beside a gate goes stale the moment the gate moves.
const PREVIEW_LINE = 'A life can be laid down here';
const READY_LINE = 'you can spend this character here';
const CATALOG_ROW = 'Show me the rewards';
const CATALOG_LINE = 'unlocks permanently for this character slot';
const EMPTY_PICK = 'take no reward';
// FrostShield is the probe reward on purpose: it is a Troll DROP, so it is also
// the finding-4 case, a skill the spellbook can know without the bloodline ever
// having bought it. The client renders DISPLAY names, so it arrives spaced.
// The two authored rows this script drives, one per state (C3 step 4).
const GATED_ROW = 'Frost Shield';   // gated: bloodline_ascensions >= 3
const UNGATED_ROW = 'Rime-Burst';   // ungated, and a displayName override

const results = [];
const check = (name, pass, detail) => {
  results.push({ check: name, pass, detail });
  console.log(`${pass === null ? '~' : pass ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
// ⚑ A bare "Failed to load resource" console line does not say WHICH resource,
// which is useless when one appears. Record the URL alongside it.
page.on('response', (r) => {
  if (r.status() >= 400) consoleErrors.push(`HTTP ${r.status()} ${r.url()}`);
});

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await joinAsNewCharacter(page, 'stone');
await page.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });

// The develop panel is a large draggable table over the right-hand side; a real
// mouse click under it hits the table instead of the element, silently.
await page.evaluate(() => {
  const p = document.getElementById('developPanel');
  if (p) p.style.display = 'none';
});

const cmd = async (text) => {
  await page.evaluate((t) => {
    const input = document.getElementById('console_command');
    input.value = t;
    document.getElementById('console').dispatchEvent(new Event('submit', { cancelable: true }));
  }, text);
  await page.waitForTimeout(600);
};

const primeRoot = () => page.evaluate(() => {
  if (!window.__auraRoot) {
    let r = window.game.character.plate.parent;
    while (r.parent) r = r.parent;
    window.__auraRoot = r;
  }
  return true;
});

// The badge is read off the rendered scene graph: window.game is a four-method
// façade and every "is something offered" getter on it reads undefined.
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

const panel = () => page.evaluate(() => {
  const el = document.getElementById('conversation');
  if (!el || el.classList.contains('hidden')) return null;
  return {
    actor: el.querySelector('.conversationActor')?.textContent?.trim() ?? '',
    lines: el.querySelector('.conversationLines')?.textContent?.trim() ?? '',
    // ⚑ The synthetic "Leave." row is EXCLUDED. Back and Leave are automatic
    // and never authored (D15), so a panel with nothing to offer still renders
    // one <li> - counting it scored the correct empty preview as a failure on
    // this script's first green run.
    rows: [...el.querySelectorAll('.conversationRows li')]
      .filter((li) => !li.classList.contains('conversationLeaveRow'))
      .map((li) => li.textContent.trim()),
    locked: [...el.querySelectorAll('.conversationRows li')]
      .filter((li) => !li.classList.contains('conversationLeaveRow'))
      .filter((li) => li.classList.contains('locked'))
      .map((li) => li.textContent.trim()),
  };
});

// ⚑ ~1.4 s HOLD, never keyboard.press(). The interact key is edge-triggered
// from Controls.update, whose clock is rAF-driven, and a headless page throttles
// rAF hard - a short down/up pair can fall entirely between two samples, so the
// key registers in the KeyboardManager and no action ever fires. The first run
// of this script used press() and reported "no panel" four times against a
// perfectly working stone.
const pressInteract = async () => {
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down('e');
  await page.waitForTimeout(1400);
  await page.keyboard.up('e');
  await page.waitForTimeout(1200);
};

// A real mouse click on a panel row, located by visible text. Synthetic
// dispatch is unreliable inside the SimpleBar-wrapped panel, and the row list is
// rebuilt as the tree refreshes, so a handle can go stale between locating and
// clicking.
const missedClicks = [];

// ⛑ SCROLLS FIRST, AND NAMES WHAT IT ACTUALLY HIT. Both halves were forced by
// C3 step 4: the seed catalog put EIGHT rows in a panel that used to hold one,
// so the list overflows its SimpleBar scroll area and a row's bounding box can
// sit outside the visible region entirely. A mouse click at those coordinates
// then lands on whatever is painted there, silently, and the run reports "the
// pick opened no modal" against a perfectly healthy game.
//
// ⚑ This is C2b's lesson applied one file over: "the click was delivered" and
// "the click reached the row" are different facts, and only the second one
// matters. elementFromPoint is what tells them apart.
const clickRow = async (needle) => {
  const handle = await page.evaluateHandle((n) => {
    const rows = [...document.querySelectorAll('#conversation .conversationRows li')];
    const row = rows.find((li) => li.textContent.includes(n)) ?? null;
    row?.scrollIntoView({ block: 'center' });
    return row;
  }, needle);
  const el = handle.asElement();
  if (!el) { missedClicks.push(`row not found: ${needle}`); return false; }
  await page.waitForTimeout(150);
  const box = await el.boundingBox();
  if (!box) { missedClicks.push(`row detached before the click: ${needle}`); return false; }
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const hit = await page.evaluate(([px, py, n]) => {
    const el = document.elementFromPoint(px, py);
    const li = el?.closest('#conversation .conversationRows li');
    return { onRow: !!li && li.textContent.includes(n), what: (el?.textContent ?? '(nothing)').slice(0, 60) };
  }, [x, y, needle]);
  if (!hit.onRow) {
    missedClicks.push(`click for "${needle}" would land on: ${hit.what}`);
    return false;
  }
  await page.mouse.click(x, y);
  await page.waitForTimeout(900);
  return true;
};

// hoverRow parks the pointer on a catalog row and reads the shared skill
// tooltip (plan-ascension.md §13.7 item 3).
//
// ⚑ A REAL pointer move, never a synthetic PointerEvent: the hover is delegated
// off `pointerover` on the rows container, and a dispatched event would prove
// the listener exists while saying nothing about whether the row is reachable
// under the panel's own layout, which is the half a tooltip can lose to a
// z-index or an overflow container.
//
// ⚑ It parks the pointer OFF the panel afterwards. attachTooltips ignores a
// pointerover for the element it is already anchored to, so two hovers in a row
// without leaving in between would read the FIRST row's tooltip twice.
const hoverRow = async (needle, shot) => {
  const handle = await page.evaluateHandle((n) => {
    const rows = [...document.querySelectorAll('#conversation .conversationRows li')];
    const row = rows.find((li) => li.textContent.includes(n)) ?? null;
    row?.scrollIntoView({ block: 'center' });
    return row;
  }, needle);
  const el = handle.asElement();
  if (!el) return null;
  await page.waitForTimeout(150);
  const box = await el.boundingBox();
  if (!box) return null;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(400);
  const tip = await page.evaluate(() => {
    const el = document.getElementById('skillTooltip');
    if (!el || el.classList.contains('hidden')) return null;
    return {
      title: el.querySelector('.tooltipTitle')?.textContent?.trim() ?? '',
      subtitle: el.querySelector('.tooltipSubtitle')?.textContent?.trim() ?? '',
      body: el.textContent.replace(/\s+/g, ' ').trim().slice(0, 140),
    };
  });
  // ⚑ The screenshot is taken WHILE the pointer is still on the row: parking
  // first hides the very thing the image is for.
  if (shot) {
    await page.screenshot({ path: shot });
  }
  await page.mouse.move(4, 4);
  await page.waitForTimeout(200);
  return tip;
};

// The cast bar is the ceremony's only client surface until step 6: the utility
// label plus a running countdown.
// ⚑ #castBar hides with `visibility` and NOT with `.hidden`, so it always keeps
// its slot in the column (the conversation panel must not jump when a cast
// starts, L25). The `casting` class HUD.updateCastBar toggles is the signal.
const castBar = () => page.evaluate(() => {
  const el = document.getElementById('castBar');
  if (!el || !el.classList.contains('casting')) return null;
  return el.querySelector('.barText')?.textContent?.trim() ?? '';
});

const confirmModal = () => page.evaluate(() => {
  const el = document.getElementById('confirmRow');
  if (!el || el.classList.contains('hidden')) return null;
  const btn = el.querySelector('.confirmRowConfirm');
  return {
    body: el.querySelector('.confirmRowBody')?.textContent?.trim() ?? '',
    confirm: btn?.textContent?.trim() ?? '',
    disabled: !!btn?.classList.contains('disabled'),
  };
});

const clickConfirm = async () => {
  const el = await page.$('#confirmRow .confirmRowConfirm');
  if (!el) { missedClicks.push('confirm button not found'); return false; }
  const b = await el.boundingBox();
  if (!b) { missedClicks.push('confirm button not laid out'); return false; }
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForTimeout(900);
  return true;
};

const xpText = () => page.evaluate(() =>
  document.querySelector('#xpBar .barText')?.textContent?.trim()
  ?? document.getElementById('xpBar')?.textContent?.trim() ?? '');

// GOD because the run stands still for a while beside a village full of aggro
// radii, and a dead player nulls character.plate - every scene-graph read then
// throws mid-assertion and reads exactly like a crash in the feature.
await cmd('GOD');
await cmd(WARP_TO);
// The camera interpolates slowly across a large jump; the badge is server
// state and arrives sooner, but settle anyway so a screenshot is honest.
await page.waitForTimeout(6000);
await primeRoot();

// --- leg 1: the site is offered -------------------------------------------
await page.waitForFunction(() => true, null, { timeout: 5_000 });
const badge = await badgeCount();
check('the site offers an interaction', badge > 0, `${badge} badge(s) lit`);

// --- leg 2: a level-1 character gets the PREVIEW ---------------------------
await pressInteract();
const low = await panel();
check('the panel opens', low !== null, low ? `actor "${low.actor}"` : 'no panel');
check('and it is the STONE that answered',
  !!low && low.actor.includes(ACTOR),
  low ? `actor "${low.actor}"` : 'no panel');
check('below the cap the greeting is the preview',
  !!low && low.lines.includes(PREVIEW_LINE) && !low.lines.includes(READY_LINE),
  low ? low.lines.replace(/\s+/g, ' ').slice(0, 90) : 'no panel');
// ⭐ FLIPPED BY plan-ascension-sites.md C2 (was: "the preview offers no rows").
// Below the cap there is still nothing to DO here (the row is inert and clicking
// it does nothing), but there is now something to READ: the price, composed live
// from the catalog node's own gate instead of hand-typed into the lines beside it.
check('⭐ the preview offers ONE locked row, and it names the cap (C2)',
  !!low && low.locked.length === 1 && low.locked[0].includes('level 30'),
  low ? `locked: ${low.locked.join(' | ') || '(none)'}` : 'no panel');
check('...and the lines beside it no longer hand-type that number',
  !!low && !low.lines.includes('30'),
  low ? low.lines.replace(/\s+/g, ' ').slice(0, 90) : 'no panel');

await page.screenshot({ path: `.claude/skills/verify/c2a-site-preview-${label}.png` });

// --- leg 3: raise ONLY the level -------------------------------------------
// Leave first: the client owns POSITION in the tree, so a panel left open would
// keep rendering the node it is standing on even after the entry node moves.
// Closing and reopening is what asks the server the question again.
await page.keyboard.press('Escape');
await page.waitForTimeout(600);

const xpBefore = await xpText();
await cmd('XP 100000000');
await page.waitForTimeout(1500);
const xpAfter = await xpText();
check('the XP cheat landed (the premise of leg 4)',
  xpBefore !== xpAfter,
  `"${xpBefore}" → "${xpAfter}"`);

// --- leg 4: at the cap the gated greeting replaces it ----------------------
await pressInteract();
const high = await panel();
check('at the cap the stone greets differently',
  !!high && high.lines.includes(READY_LINE) && !high.lines.includes(PREVIEW_LINE),
  high ? high.lines.replace(/\s+/g, ' ').slice(0, 90) : 'no panel');
check('and it is still the stone',
  !!high && high.actor.includes(ACTOR),
  high ? `actor "${high.actor}"` : 'no panel');

check('...and offers the way to the reward list',
  !!high && high.rows.some((r) => r.includes(CATALOG_ROW)),
  high ? `rows: ${high.rows.join(' | ') || '(none)'}` : 'no panel');

await page.screenshot({ path: `.claude/skills/verify/c2a-site-ready-${label}.png` });

// --- leg 5: the GENERATED rows ---------------------------------------------
// Everything above this line is authored content. This row leads to a node
// whose rows exist in no file at all, so reaching it is the only proof the
// catalog is wired to the panel: forgetting core/game.go's SetRowSource shows an
// empty stone and fails no Go test.
await clickRow(CATALOG_ROW);
const catalog = await panel();
check('the catalog node opens', !!catalog && catalog.lines.includes(CATALOG_LINE),
  catalog ? catalog.lines.replace(/\s+/g, ' ').slice(0, 80) : 'no panel');

const rows = catalog ? catalog.rows : [];
const ungatedRow = rows.find((r) => r.includes(UNGATED_ROW));
const emptyRow = rows.find((r) => r.includes(EMPTY_PICK));

const lockedRows = catalog ? catalog.locked : [];
const gatedLocked = lockedRows.find((r) => r.includes(GATED_ROW));

// ⭐ THE REAL SEED CATALOG, which is what changed at C3 step 4: a first life at
// the cap meets five pickable rows and three locked ones, so the gated leg and
// the ceremony leg both have a real subject in the same pass.
check('a gated entry is SHOWN locked, never hidden (D18)', !!gatedLocked,
  gatedLocked ?? `locked rows: ${lockedRows.join(' | ') || '(none)'}`);
check('...with the gate named and its progress composed for this player',
  !!gatedLocked && /0\s*\/\s*3/.test(gatedLocked) && /ascension/i.test(gatedLocked),
  gatedLocked ?? '(no gated row)');
check('...and no bogus "level 0" wall is drawn beside it',
  !!gatedLocked && !/level\s*0/i.test(gatedLocked), gatedLocked ?? '(no gated row)');

// ⭐ INVERTED AT C3 STEP 4, and the inversion is the D14 rule rather than a
// tweak: the ascend-anyway row is offered ONLY when nothing is pickable, so
// beside five real choices it must be ABSENT. Against the old one-entry probe
// catalog nothing was pickable and this asserted the opposite: the same rule,
// read against the content that now exists.
check('the ascend-anyway row is NOT offered while real picks are on screen (D14)',
  emptyRow === undefined, `rows: ${rows.join(' | ')}`);

// --- leg 5b: the row says what the ability DOES (§13.7 item 3) --------------
// The wire carries the row's `skill_id` and the client feeds the spellbook's own
// by-id tooltip, so this leg is the whole feature end to end: a Go pin proves
// the id rides the row, and nothing but a browser proves the id becomes words a
// player can read beside the panel.
const pickTip = await hoverRow(UNGATED_ROW);
check('hovering a pickable reward shows the ability tooltip',
  pickTip?.title === UNGATED_ROW,
  pickTip ? `"${pickTip.title}" / ${pickTip.subtitle}` : 'no tooltip appeared');
check('...as the LEVEL 1 preview, which is what a pick actually hands over',
  !!pickTip && /Lv\s*1\s*\//.test(pickTip.subtitle),
  pickTip?.subtitle ?? '(no tooltip)');

// ⭐ THE LOCKED ROW IS THE POINT OF THE FEATURE. A gate is only worth showing
// instead of hiding if the player can find out what is behind it: an
// unreadable named wall is indistinguishable from one that is merely hard. It
// is also the row most likely to lose the tooltip by accident: the locked
// branch rewrites the text, empties the reply and binds no click handler.
const lockedTip = await hoverRow(GATED_ROW, `.claude/skills/verify/c2a-catalog-tooltip-${label}.png`);
check('⭐ ...and a LOCKED row carries its tooltip too',
  lockedTip?.title === GATED_ROW,
  lockedTip ? `"${lockedTip.title}" / ${lockedTip.subtitle}` : 'no tooltip appeared');
check('...with real effect text, not just a name',
  !!lockedTip && lockedTip.body.length > lockedTip.title.length + lockedTip.subtitle.length + 4,
  lockedTip?.body ?? '(no tooltip)');

if (ungatedRow) {
  // ⚑ Matching the DISPLAY name proves the client rendered what /skills served:
  // this row is authored `RimeBurst` and must reach the panel as `Rime-Burst`.
  check('an ungated entry renders under its authored displayName', true, ungatedRow);

  // ⭐ Taking a pick STARTS the ceremony rather than spending the character.
  // The ten-second channel is the last escape, and the cast bar is its only
  // client surface until step 6 adds the confirm modal.
  // ⭐ D21: the pick opens a COUNTDOWN and sends nothing until it is confirmed.
  await clickRow(UNGATED_ROW);
  const modal = await confirmModal();
  check('an irreversible pick opens the countdown confirm (D21)',
    modal !== null && /rime-burst/i.test(modal.body), modal ? modal.body.slice(0, 70) : 'no modal');
  check('...with the confirm button counting down and disabled',
    !!modal && modal.disabled && /\(\d\)/.test(modal.confirm), modal ? modal.confirm : 'no modal');
  check('...and nothing has started yet', (await castBar()) === null, 'no cast bar while it waits');

  // The countdown is 5 s; wait it out and confirm.
  await page.waitForTimeout(6200);
  const armed = await confirmModal();
  check('...the button arms when the countdown runs out',
    !!armed && !armed.disabled, armed ? `"${armed.confirm}" disabled=${armed.disabled}` : 'no modal');

  await clickConfirm();
  const bar = await castBar();
  check('confirming starts the ceremony channel',
    bar !== null && /ascend/i.test(bar), bar ?? 'no cast bar');

  // ⭐ FOLLOW-UP ②: the ceremony gets the stage to itself. The server ends the
  // session the tick the channel starts (refreshConversations), so the panel is
  // gone from the very next snapshot and the motes have the screen. ⚑ Asserted
  // against the SERVER's close, not a client hide: a client that merely hid the
  // panel would still be in a session the server believed was open.
  const duringChannel = await panel();
  check('...and the ceremony closes the panel that started it',
    duringChannel === null, duringChannel ? `panel still open: ${duringChannel.rows.join(' | ')}` : 'closed');

  // Mid-channel: the motes are collapsing, which is the only moment the effect
  // can be seen at all. The E press costs 2.6 s of the ten and proves the
  // second half of the rule — refreshConversations clears a session stamped by
  // handleInteracts in the same Update, so a player cannot talk their way out
  // of a ceremony they started.
  await pressInteract();
  check('...and E during the ceremony reopens nothing', (await panel()) === null,
    'no panel mid-channel');
  // ⚑ Shot at ~6 s of the 10, deliberately: the swarm's collapse is eased, so a
  // frame grabbed at 1 s shows motes still parked three character-widths out
  // and reads as "the effect barely exists". This is the frame to judge it on.
  await page.waitForTimeout(3_000);
  await page.screenshot({ path: `.claude/skills/verify/c2a-channelling-${label}.png` });

  // ⭐ THE WHOLE LOOP, and the only place it can be seen: stand still for the
  // channel and the character is spent. The server ends the session and closes
  // the socket with NO message, so a client that did not ask whose rows the
  // truth lives in would show "Connection lost" after ten seconds of pageantry
  // (P13). Landing on character-select is what says the ceremony worked.
  await page.waitForTimeout(14_000);
  const ended = await page.evaluate(() => {
    const sel = document.getElementById('characterSelect');
    const banner = document.getElementById('alertBanner');
    return {
      onSelect: !!sel && !sel.classList.contains('hidden'),
      banner: banner && !banner.classList.contains('hidden') ? banner.textContent.trim() : '',
    };
  });
  check('the completed ceremony lands on character select (P13)', ended.onSelect,
    `banner: ${ended.banner || '(none)'}`);
  check('...and never shows the "Connection lost" banner',
    !/connection lost/i.test(ended.banner), ended.banner || '(none)');
  await page.screenshot({ path: `.claude/skills/verify/c2a-ascended-${label}.png` });
} else {
  // ⚑ RED, not SKIP. Before C3 step 4 an absent reward row was the correct
  // answer to an empty catalog; now the seed ships and this row is authored, so
  // its absence means the bloodline already spent it, the catalog stopped
  // loading, or the row source came unwired. All three are failures.
  const why = `no ungated ${UNGATED_ROW} row. rows: ${rows.join(' | ') || '(none)'}`;
  check('an ungated entry renders under its authored displayName', false, why);
  check('an irreversible pick opens the countdown confirm (D21)', false, why);
  check('...with the confirm button counting down and disabled', false, why);
  check('...and nothing has started yet', false, why);
  check('...the button arms when the countdown runs out', false, why);
  check('confirming starts the ceremony channel', false, why);
  check('...and the ceremony closes the panel that started it', false, why);
  check('...and E during the ceremony reopens nothing', false, why);
  check('the completed ceremony lands on character select (P13)', false, why);
  check('...and never shows the "Connection lost" banner', false, why);
}

await page.screenshot({ path: `.claude/skills/verify/c2a-catalog-${label}.png` });

check('no console errors', consoleErrors.length === 0,
  consoleErrors.slice(0, 3).join(' | ') || 'clean');
if (missedClicks.length) {
  console.log(`  ! undelivered clicks: ${missedClicks.join(' | ')}`);
}

const passed = results.filter((r) => r.pass === true).length;
const skipped = results.filter((r) => r.pass === null).length;
console.log(`\n${passed}/${results.length - skipped} checks passed${skipped ? `, ${skipped} skipped` : ''}`);
await browser.close();
process.exit(passed + skipped === results.length ? 0 : 1);
