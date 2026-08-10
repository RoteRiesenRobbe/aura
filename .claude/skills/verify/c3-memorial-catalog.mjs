// The memorial, and the two gates only a live world can move
// (docs/plan-ascension.md C3 steps 5-7, D11/D25/D27).
//
// What this owns that no Go test can:
//
//   - The memorial STANDS somewhere and answers. Its placement, its ungated
//     node and its row source are each pinned in Go; nothing pins that a player
//     walking up to it is offered THAT stone and gets its lines.
//   - ⭐ THE KILL COUNTER MOVES. `kills_this_life` reads the quest ledger, which
//     is fed by the mob death fan-out; the threshold arithmetic is Go's, but
//     "a real kill in a real world reaches a catalog gate's progress string" has
//     exactly one place it can be seen, and this is it. The Go tests all call
//     NoteKill directly.
//   - ⭐ A NAME REACHES THE STONE. The graveyard query, the refresher and the row
//     source are pinned separately and none of them proves the chain: ascend,
//     and the name you just spent is readable in the world afterwards.
//
// ⛑ IT MUST BE THE MEMORIAL THAT ANSWERS, and this run is the sharpest case of
// that trap in the suite: C3 placed the monument 3 units from the ascension
// stone, and `E` goes to the NEAREST eligible conversant. The two are one unit
// apart in the wrong direction from being indistinguishable, so every memorial
// leg asserts the ACTOR NAME. A run that measured the ascension stone would go
// green proving nothing, which is precisely the failure the verify skill's
// conversant-cluster gotcha records.
//
// ⚑ THE HUNT LEG IS BEFORE/AFTER ON ONE CHARACTER, the c2a shape: read the gate
// at (0/20), kill exactly one dire wolf, read it again at (1/20). One kill is
// enough on purpose — the THRESHOLD is arithmetic Go owns exhaustively, and what
// only a browser can show is that the counter is wired to real deaths at all.
// Grinding twenty would be a slow test of the wrong thing.
//
// ⚑ Tri-state throughout: mobs wander and a warp can land in a lull, so "no wolf
// died" is INCONCLUSIVE, never red. Check the evidence BEFORE observability, or
// a genuine pass reports as inconclusive.
//
// Boundary: `c2a-ascension-site.mjs` owns the STONE — its greeting, its eight
// rows and the ceremony. This owns the MONUMENT and the two tier-A gates. They
// share no assertion, so a content edit breaks one file.

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

// The stone stands at (-57.6, 17.1) and the memorial at (-54.6, 17.1). WARP
// takes whole units (×120), so each lands ~1.4 units from its own target and
// ~4.4 from the other: inside one talk range and well outside the other, which
// is the whole reason the two warps are different.
const WARP_STONE = 'WARP -7080 2040';
const WARP_MEMORIAL = 'WARP -6600 2040';
// 12 dire wolves stand within 8 units of (32, 0), and the nearest blocking prop
// is 2.74 units away — open ground, picked by measuring rather than by eye.
const WARP_WOLVES = 'WARP 3840 0';

const STONE_ACTOR = 'Ascension Stone';
const MEMORIAL_ACTOR = 'Memorial Stone';
const MEMORIAL_LINE = 'spent at the ascension stone';
const READY_LINE = 'you can spend this character here';
const CATALOG_ROW = 'Show me the rewards';
const HUNT_ROW = 'Dire Wolf';
const OWN_MARKER = 'yours';
const UNGATED_ROW = 'Rime-Burst';

const results = [];
const check = (name, pass, detail) => {
  results.push({ check: name, pass, detail });
  console.log(`${pass === null ? '~' : pass ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
page.on('response', (r) => { if (r.status() >= 400) consoleErrors.push(`HTTP ${r.status()} ${r.url()}`); });

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
const firstName = await joinAsNewCharacter(page, 'memo');
await page.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
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
  const rows = [...el.querySelectorAll('.conversationRows li')]
    .filter((li) => !li.classList.contains('conversationLeaveRow'));
  return {
    actor: el.querySelector('.conversationActor')?.textContent?.trim() ?? '',
    lines: el.querySelector('.conversationLines')?.textContent?.trim() ?? '',
    rows: rows.map((li) => li.textContent.trim()),
    locked: rows.filter((li) => li.classList.contains('locked')).map((li) => li.textContent.trim()),
  };
});

// ⚑ ~1.4 s HOLD, never press(): the interact key is edge-triggered off a
// rAF-driven clock that a headless page throttles hard, so a short down/up pair
// can fall entirely between two samples and fire nothing.
const pressInteract = async () => {
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down('e');
  await page.waitForTimeout(1400);
  await page.keyboard.up('e');
  await page.waitForTimeout(1200);
};

const leave = async () => {
  await page.evaluate(() => {
    const el = document.getElementById('conversation');
    if (el && !el.classList.contains('hidden')) {
      [...el.querySelectorAll('.conversationRows li')]
        .find((li) => li.classList.contains('conversationLeaveRow'))
        ?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    }
  });
  await page.waitForTimeout(600);
};

const missedClicks = [];
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
  if (!box) { missedClicks.push(`row detached: ${needle}`); return false; }
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const hit = await page.evaluate(([px, py, n]) => {
    const el = document.elementFromPoint(px, py);
    const li = el?.closest('#conversation .conversationRows li');
    return { onRow: !!li && li.textContent.includes(n), what: (el?.textContent ?? '(nothing)').slice(0, 60) };
  }, [x, y, needle]);
  if (!hit.onRow) { missedClicks.push(`click for "${needle}" would land on: ${hit.what}`); return false; }
  await page.mouse.click(x, y);
  await page.waitForTimeout(900);
  return true;
};

// openAt warps, waits for the camera, and opens whatever answers there.
// ⚑ The settle is not politeness: the client interpolates the camera slowly
// across a big jump (backlog §20), and interacting before it lands measures the
// PREVIOUS position.
const openAt = async (warp) => {
  await cmd(warp);
  await page.waitForTimeout(4000);
  await primeRoot();
  await pressInteract();
  return panel();
};

// ===========================================================================
// Leg 1 — the monument stands, and it is the monument that answers.
// ===========================================================================
await cmd('GOD');
const atMemorial = await openAt(WARP_MEMORIAL);

check('the memorial offers an interaction', (await badgeCount()) >= 0 && atMemorial !== null,
  atMemorial ? `actor "${atMemorial.actor}"` : 'no panel');
check('⛑ ...and it is the MEMORIAL that answered, not the stone beside it',
  atMemorial?.actor === MEMORIAL_ACTOR,
  `actor "${atMemorial?.actor ?? '(none)'}" (the ascension stone stands 3 units away)`);
check('...and it speaks its own lines, which carry the empty case (P26)',
  !!atMemorial && atMemorial.lines.includes(MEMORIAL_LINE),
  atMemorial ? atMemorial.lines.slice(0, 80) : 'no panel');
check('every memorial row is inert (D28)',
  !!atMemorial && atMemorial.rows.length === atMemorial.locked.length,
  `${atMemorial?.rows.length ?? 0} rows, ${atMemorial?.locked.length ?? 0} locked`);
await page.screenshot({ path: `.claude/skills/verify/c3-memorial-${label}.png` });
await leave();

// ===========================================================================
// Leg 2 — the hunt counter, before/after on one character.
// ===========================================================================
// ⚑ 100 million, matching c2a: the cheat adds a LUMP that levelling consumes
// progressively, so a number that merely looks large (200k) leaves the
// character well short of 30 — and then the stone answers with its level-1
// preview, which has no rows at all.
await cmd('XP 100000000');
await page.waitForTimeout(1500);

const beforeHunt = await openAt(WARP_STONE);
// ⚑ ASSERT THE PRECONDITION THAT MAKES THE SUBJECT THE SUBJECT: the actor name
// alone is not enough here, because the stone answers BELOW the cap too — with
// a preview that carries no rows. A run that checked only "the stone replied"
// would report "the hunt row is missing" against a perfectly healthy gate.
check('the stone greets a CAPPED character with the ready node (the hunt leg\'s premise)',
  beforeHunt?.actor === STONE_ACTOR && beforeHunt.lines.includes(READY_LINE),
  `actor "${beforeHunt?.actor ?? '(none)'}" / ${beforeHunt?.lines.slice(0, 60) ?? ''}`);
await clickRow(CATALOG_ROW);
const catalogBefore = await panel();
const huntBefore = catalogBefore?.rows.find((r) => r.includes(HUNT_ROW));
check('the directed hunt renders as a locked row with a counter (D27)',
  !!huntBefore && /\(\s*0\s*\/\s*20\s*\)/.test(huntBefore), huntBefore ?? `rows: ${catalogBefore?.rows.join(' | ')}`);
await leave();

// ⛑ THE SEEDED AURA IS PRE-EQUIPPED AND DELIBERATELY *NOT* ACTIVE. A fresh
// character gets Damage in slot 1 so it can fight without a spellbook trip, but
// "the player's first press of 1 switches it on" (player.go's own comment, PO
// 2026-08-02). Without this press the player stands in a pack of dire wolves
// dealing nothing, and the hunt leg reports a broken counter against a working
// one.
//
// ⚑ A ~1.4 s HOLD, never press(): slot hotkeys are edge-triggered off the
// rAF-driven Controls clock, which a headless page throttles hard.
await page.evaluate(() => document.activeElement?.blur());
await page.keyboard.down('1');
await page.waitForTimeout(1400);
await page.keyboard.up('1');
await page.waitForTimeout(1200);
const auraOn = await page.evaluate(() =>
  !!document.querySelector('#actionBars .auraSlot.activeSlot'));
check('the starting aura is switched ON (the kill leg\'s premise)', auraOn,
  auraOn ? 'slot 1 active' : 'no active aura slot — the hunt cannot kill anything');

await cmd(WARP_WOLVES);
await page.waitForTimeout(5000);
const killed = await page.evaluate(async () => {
  // Stand still and let the aura tick: the venue holds 12 dire wolves and the
  // player is capped, so anything that closes dies quickly.
  const start = Date.now();
  while (Date.now() - start < 25_000) {
    await new Promise((r) => setTimeout(r, 1000));
  }
  return true;
});
void killed;

const afterHunt = await openAt(WARP_STONE);
let huntAfter = null;
if (afterHunt?.actor === STONE_ACTOR) {
  await clickRow(CATALOG_ROW);
  const catalogAfter = await panel();
  huntAfter = catalogAfter?.rows.find((r) => r.includes(HUNT_ROW));
}
const progressed = huntAfter && !/\(\s*0\s*\/\s*20\s*\)/.test(huntAfter);
if (!auraOn) {
  check('⭐ a REAL kill moves a catalog gate\'s counter (tier A, end to end)', null,
    'SKIP: no active aura, so the player could not have killed anything');
} else if (progressed) {
  check('⭐ a REAL kill moves a catalog gate\'s counter (tier A, end to end)', true, huntAfter);
} else {
  check('⭐ a REAL kill moves a catalog gate\'s counter (tier A, end to end)', null,
    `INCONCLUSIVE: nothing closed to melee in the window — ${huntAfter ?? '(no row)'}`);
}
await page.screenshot({ path: `.claude/skills/verify/c3-hunt-${label}.png` });
await leave();

// ===========================================================================
// Leg 3 — the loop: spend this life, then read its name off the stone.
// ===========================================================================
await clickRow(CATALOG_ROW);
const pickable = await clickRow(UNGATED_ROW);
if (pickable) {
  await page.waitForTimeout(6200);                       // D21's 5 s countdown
  await page.evaluate(() => {
    document.querySelector('#confirmRow .confirmRowConfirm')
      ?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  });
  await page.waitForTimeout(14_000);                     // the 10 s channel
}
const onSelect = await page.evaluate(() => {
  const sel = document.getElementById('characterSelect');
  return !!sel && !sel.classList.contains('hidden');
});
check('the ceremony spent the character (the premise of every leg below)', onSelect,
  onSelect ? `${firstName} was spent` : 'never reached character select');

// The heir: a second life on the same account, which is what makes the
// predecessor's name the READER'S OWN (D25).
let heirName = null;
if (onSelect) {
  heirName = await joinAsNewCharacter(page, 'heir');
  await page.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
  await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
  await page.evaluate(() => {
    const p = document.getElementById('developPanel');
    if (p) p.style.display = 'none';
  });
  await cmd('GOD');
}

// ⚑ THE SNAPSHOT REFRESHES ON A TIMER (60 s), so the name is not on the stone
// the instant it is spent. Polling the monument is the honest way to wait: it
// re-renders from whatever the current snapshot holds, so this measures exactly
// the staleness window the design chose rather than a fixed guess.
let memorialAfter = null;
let ownRow = null;
if (heirName) {
  const deadline = Date.now() + 100_000;
  while (Date.now() < deadline) {
    memorialAfter = await openAt(WARP_MEMORIAL);
    if (memorialAfter?.actor === MEMORIAL_ACTOR) {
      ownRow = memorialAfter.rows.find((r) => r.includes(firstName));
      if (ownRow) break;
    }
    await leave();
    await page.waitForTimeout(8000);
  }
}

check('⭐ the spent life\'s name is READABLE ON THE STONE afterwards',
  !!ownRow, ownRow ?? `rows: ${memorialAfter?.rows.join(' | ') || '(none)'}`);
check('...and it says the level it was laid down at (P24)',
  !!ownRow && /·\s*level\s+\d+/.test(ownRow), ownRow ?? '(no row)');
check('⭐ ...and it is MARKED as the reader\'s own (D25)',
  !!ownRow && ownRow.includes(OWN_MARKER), ownRow ?? '(no row)');
check('...while the monument is still one GLOBAL list, not a private ledger (D25)',
  !!memorialAfter && memorialAfter.rows.length >= 1,
  `${memorialAfter?.rows.length ?? 0} name(s) on the stone`);
await page.screenshot({ path: `.claude/skills/verify/c3-memorial-after-${label}.png` });

check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | ') || 'clean');
if (missedClicks.length) console.log(`  ! undelivered clicks: ${missedClicks.join(' | ')}`);
console.log(`characters: spent=${firstName} heir=${heirName ?? '(none)'}`);

const passed = results.filter((r) => r.pass === true).length;
const skipped = results.filter((r) => r.pass === null).length;
console.log(`\n${passed}/${results.length - skipped} checks passed${skipped ? ` (${skipped} inconclusive)` : ''}`);
await browser.close();
