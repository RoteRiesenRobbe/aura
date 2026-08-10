// The ascension site in the world (docs/plan-ascension.md §12.4, C2a step 1).
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
// ⚑ THE PROBE. api/ascension/ ships README-only until C3, so with stock content
// the catalog is empty and the only row is the D14 ascend-anyway one. To see a
// real reward row, install the probe entry and restart (the chunkC3-probe-quest
// precedent):
//
//     cp .claude/skills/verify/c2a-probe-reward.json api/ascension/
//     # restart aurad, run this script, then:
//     rm api/ascension/c2a-probe-reward.json
//
// Without it the reward legs report SKIP rather than red, because "no reward
// row" is the correct answer to an empty catalog.
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
const PREVIEW_LINE = 'A standing stone';
const READY_LINE = 'Lay this life down';
const CATALOG_ROW = 'may still learn';
const CATALOG_LINE = 'has not yet been given';
const EMPTY_PICK = 'take nothing with you';
// FrostShield is the probe reward on purpose: it is a Troll DROP, so it is also
// the finding-4 case, a skill the spellbook can know without the bloodline ever
// having bought it. The client renders DISPLAY names, so it arrives spaced.
const PROBE_ROW = 'Frost Shield';

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
const clickRow = async (needle) => {
  const handle = await page.evaluateHandle((n) => {
    const rows = [...document.querySelectorAll('#conversation .conversationRows li')];
    return rows.find((li) => li.textContent.includes(n)) ?? null;
  }, needle);
  const el = handle.asElement();
  if (!el) { missedClicks.push(`row not found: ${needle}`); return false; }
  const box = await el.boundingBox();
  if (!box) { missedClicks.push(`row detached before the click: ${needle}`); return false; }
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(900);
  return true;
};

const missedClicks = [];

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
check('the preview offers no rows (below the cap there is nothing to do here)',
  !!low && low.rows.length === 0,
  low ? `rows: ${low.rows.join(' | ') || '(none)'}` : 'no panel');

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
const probeRow = rows.find((r) => r.includes(PROBE_ROW));
const emptyRow = rows.find((r) => r.includes(EMPTY_PICK));

const lockedRows = catalog ? catalog.locked : [];
const probeLocked = lockedRows.find((r) => r.includes(PROBE_ROW));

// ⚑ THREE probe states, and each proves something the others cannot. GATED (the
// shipped probe) proves D18's locked row and the tier-B carriage; UNGATED proves
// the pick is takeable and starts the ceremony; ABSENT proves D14's
// ascend-anyway row. Swap the probe's `conditions` to move between the first two.
if (probeLocked) {
  check('a gated entry is SHOWN locked, never hidden (D18)', true, probeLocked);
  check('...with the gate named and its progress composed for this player',
    /0\s*\/\s*3/.test(probeLocked) && /ascension/i.test(probeLocked), probeLocked);
  check('...and no bogus "level 0" wall is drawn beside it',
    !/level\s*0/i.test(probeLocked), probeLocked);
  check('...and the ascend-anyway row is offered beside it (P1: max level is the whole price)',
    emptyRow !== undefined, `rows: ${rows.join(' | ')}`);
  check('an UNGATED pick starts the ceremony channel', null,
    'SKIP: the installed probe is gated (drop its `conditions` to run this leg)');
} else if (probeRow) {
  check('a gated entry is SHOWN locked, never hidden (D18)', null,
    'SKIP: the installed probe is ungated (add a `conditions` block to run this leg)');
  check('...with the gate named and its progress composed for this player', null, 'SKIP: needs a gated probe');
  check('...and no bogus "level 0" wall is drawn beside it', null, 'SKIP: needs a gated probe');
  check('...and the ascend-anyway row is offered beside it (P1: max level is the whole price)', null,
    'SKIP: needs a gated probe');
  // ⭐ Taking a pick STARTS the ceremony rather than spending the character.
  // The ten-second channel is the last escape, and the cast bar is its only
  // client surface until step 6 adds the confirm modal.
  // ⭐ D21: the pick opens a COUNTDOWN and sends nothing until it is confirmed.
  await clickRow(PROBE_ROW);
  const modal = await confirmModal();
  check('an irreversible pick opens the countdown confirm (D21)',
    modal !== null && /frost shield/i.test(modal.body), modal ? modal.body.slice(0, 70) : 'no modal');
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
  const why = 'SKIP: no probe (cp .claude/skills/verify/c2a-probe-reward.json api/ascension/ and restart)';
  check('a gated entry is SHOWN locked, never hidden (D18)', null, why);
  check('...with the gate named and its progress composed for this player', null, why);
  check('...and no bogus "level 0" wall is drawn beside it', null, why);
  check('...and the ascend-anyway row is offered beside it (P1: max level is the whole price)', null, why);
  check('an UNGATED pick starts the ceremony channel', null, why);
  check('an empty catalog still offers the ascend-anyway row (D14)',
    emptyRow !== undefined, `rows: ${rows.join(' | ') || '(none)'}`);
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
