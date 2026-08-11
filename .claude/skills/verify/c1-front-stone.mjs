// The SECOND ascension site, and the price that belongs to it
// (docs/plan-ascension-sites.md C1, D1).
//
// What this owns that no Go test can:
//
//   - ⭐ A CHARACTER BELOW THE OLD CAP SPENDS ITS LIFE. Until D1 the server
//     refused anybody under `levelCurve.maxLevel` whatever the content said, so
//     "a stone priced at 25 actually ascends a level-25 character" is the one
//     assertion that proves the rule moved out of Go and into the world. The Go
//     tests pin the pieces; only a real ceremony proves the whole chain.
//   - ⭐ THE TWO-CLAUSE PRICE IS REAL. This stone asks for level 25 AND a
//     finished "Thin the Orc Line" — the first gate in the game where meeting
//     one half is not enough — and the half that is missing is invisible from
//     the Go side, where both are just conditions in a list.
//   - ⭐ ONE PLAYER, TWO SITES. The same qualifying character walks to the
//     VILLAGE stone and is still turned away, because that stone asks for 30.
//     A global rule dressed up as content would pass every other leg here.
//
// ⛑ BOUNDARY. `c2a-ascension-site.mjs` owns the VILLAGE stone: its greeting,
// its eight rows, its ceremony. This script asserts nothing about that stone's
// content beyond "it did not open for the front stone's price", which is the
// negative half of C1's own story and belongs to nobody else.
// `c3-memorial-catalog.mjs` owns the monument. No assertion is shared.
//
// ⛑ THE ACTOR NAMES OVERLAP: "Front Ascension Stone" CONTAINS "Ascension
// Stone", so every identity check here is an EQUALITY. A `includes()` would
// happily measure the wrong stone and go green, which is the exact trap C3
// recorded when the monument stood 3 units from the village stone.
//
// ⛑ THE QUEST LEG IS EXPECTED-INCONCLUSIVE TODAY, and the number is measured
// rather than guessed: standing in the pack with the aura on and four skill
// points spent, the journal still read **0/5 orcs killed** after 30 s. An elite
// Orc carries ~3,617 HP (420 base × 1.12^19) against a Dire Wolf's ~222 — 16×
// what `c3-memorial-catalog` grinds through in 25 s — so five of them is minutes
// of standing for a starting build, whatever this script waits.
//
// What that costs: legs 3-5 below (the two-clause price PAID, the village stone
// refusing the same character, and the ceremony completing below the old cap)
// are the POSITIVE half of C1, and they are carried by Go instead —
// `TestAscension_OnePlayerTwoSites_ThePriceThatCountsIsTheSitesOwn` and
// `TestRequestAscensionDoesNotPriceTheAscensionItself`. What only this script
// can show, and does, is the NEGATIVE half against real authored content: the
// stone answers, it is the right stone, and level 25 alone does not open it.
//
// The legs stay in the file rather than being deleted, because the moment
// anything makes the price payable — a cheaper gate, a kill cheat, a stronger
// starting build — they run green with no new work. Tri-state throughout: "no
// orc died" is INCONCLUSIVE, never red, and the evidence is checked BEFORE
// observability or a genuine pass reports as inconclusive.

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

// The front stone stands at (55.2, 20.2), measured rather than eyeballed: 7.65
// units from the FrontCaptain, so `E` cannot reach past it to him. WARP takes
// whole units (×120), so (54, 20) lands 1.22 units away — inside the 2.0 talk
// range and outside the body.
const WARP_FRONT = 'WARP 6480 2400';
// The village stone, from c3's own measurement: (-59, 17) is 1.4 units from it
// and 4.4 from the monument beside it.
const WARP_VILLAGE = 'WARP -7080 2040';
// Five "Orc" spawns stand along y ≈ 32-34; (57, 33) has three inside 3 units
// and two more inside 7, so the pack closes on a standing player.
const WARP_ORCS = 'WARP 6840 3960';
// ...and the western pair of the same line, (61, 33), for the second stop.
const WARP_ORCS_WEST = 'WARP 7320 3960';

const FRONT_ACTOR = 'Front Ascension Stone';
const VILLAGE_ACTOR = 'Ascension Stone';
const FRONT_PREVIEW = 'Front stone.';
const FRONT_READY = 'You held the line';
const CATALOG_ROW = 'Show me the rewards';
const UNGATED_ROW = 'Rime-Burst';
const QUEST = 'thin-the-orc-line';
// L25 needs 117,745 XP cumulative and L26 needs 141,594, so one shot lands
// inside level 25 with room on both sides — and the orc kills below (~3.8k each
// at this level) cannot carry the character to 30, which is what leg 5 needs.
const XP_TO_25 = 'XP 120000';

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
const name = await joinAsNewCharacter(page, 'front');
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

const panel = () => page.evaluate(() => {
  const el = document.getElementById('conversation');
  if (!el || el.classList.contains('hidden')) return null;
  const rows = [...el.querySelectorAll('.conversationRows li')]
    .filter((li) => !li.classList.contains('conversationLeaveRow'));
  return {
    actor: el.querySelector('.conversationActor')?.textContent?.trim() ?? '',
    lines: el.querySelector('.conversationLines')?.textContent?.trim() ?? '',
    rows: rows.map((li) => li.textContent.trim()),
    // The greyed rows, by text (C2). Same view the c2a script keeps: a locked
    // row is on screen like any other, and only the class tells them apart.
    locked: rows.filter((li) => li.classList.contains('locked')).map((li) => li.textContent.trim()),
  };
});

// The level renders as a Text on the character's own plate, which is the only
// place the client shows it as a number.
const plateLevel = () => page.evaluate(() => {
  const plate = window.game?.character?.plate;
  if (!plate) return null;
  const seen = [];
  const walk = (c) => {
    if (typeof c?.text === 'string' && /^\d+$/.test(c.text.trim())) seen.push(Number(c.text.trim()));
    (c?.children || []).forEach(walk);
  };
  walk(plate);
  return seen.length ? Math.max(...seen) : null;
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
  await page.keyboard.press('Escape');
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
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(900);
  return true;
};

// ⛑ THE KILL LEG NEEDS DAMAGE THE STARTING BUILD DOES NOT HAVE. The quest wants
// five ELITE orcs, and a level-25 character carries ~24 UNSPENT skill points: the
// aura sits at level 1 unless somebody spends them, which a real player at this
// point in the game obviously would have. Without this the run stands in the pack
// for a minute and kills nothing, and the leg reports a broken gate against a
// working one.
//
// ⚑ pointerdown, never click: MouseManager preventDefaults mousedown on the
// document, which suppresses the synthetic click on every HUD panel (CLAUDE.md).
const spendInto = async (skillName, times) => {
  let spent = 0;
  for (let i = 0; i < times; i++) {
    const ok = await page.evaluate((n) => {
      const li = [...document.querySelectorAll('#spellbookList li')]
        .find((x) => x.textContent.includes(n));
      const btn = li?.querySelector('.spendBtn');
      if (!btn || btn.classList.contains('inactive')) return false;
      btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      return true;
    }, skillName);
    await page.waitForTimeout(500);
    if (!ok) break;
    spent++;
  }
  return spent;
};

const clickConfirm = async () => {
  const el = await page.$('#confirmRow .confirmRowConfirm');
  if (!el) { missedClicks.push('no confirm button'); return false; }
  const box = await el.boundingBox();
  if (!box) { missedClicks.push('confirm button detached'); return false; }
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(900);
  return true;
};

// openAt warps, waits for the camera, and opens whatever answers there.
// ⚑ The settle is not politeness: the client interpolates the camera slowly
// across a big jump (backlog §20), and interacting before it lands measures the
// PREVIOUS position.
const openAt = async (warp) => {
  await cmd(warp);
  await page.waitForTimeout(4500);
  await primeRoot();
  await pressInteract();
  return panel();
};

// GOD because the run stands still at the orc line, and a dead player nulls
// character.plate — every scene-graph read then throws mid-assertion and reads
// exactly like a crash in the feature.
await cmd('GOD');

// ===========================================================================
// Leg 1 — the second stone stands at the front, and it is IT that answers.
// ===========================================================================
const fresh = await openAt(WARP_FRONT);
check('the front stone answers where it was placed',
  fresh !== null, fresh ? `actor "${fresh.actor}"` : 'no panel');
check('⛑ ...and it is the FRONT stone, not the village one 100 units away',
  fresh?.actor === FRONT_ACTOR, `actor "${fresh?.actor ?? '(none)'}"`);
check('a fresh character gets the preview, which names the price',
  !!fresh && fresh.lines.includes(FRONT_PREVIEW) && !fresh.lines.includes(FRONT_READY),
  fresh ? fresh.lines.replace(/\s+/g, ' ').slice(0, 90) : 'no panel');
// ⭐ FLIPPED BY C2 (was: "the preview offers no rows"). The row vanishing is
// exactly what made the price illegible: the fallback line had to name it by
// hand, and did. The row is now on screen, greyed, naming both halves of a
// price this character has paid neither of.
check('⭐ the preview offers ONE locked row, and it names the price itself (C2)',
  !!fresh && fresh.locked.length === 1 && fresh.locked[0].includes('level 25')
    && fresh.locked[0].includes('Thin the Orc Line'),
  fresh ? `locked: ${fresh.locked.join(' | ') || '(none)'}` : 'no panel');
check('...and the price is NOT hand-typed in the lines beside it',
  !!fresh && !fresh.lines.includes('25'),
  fresh ? fresh.lines.replace(/\s+/g, ' ').slice(0, 90) : 'no panel');
await leave();

// ===========================================================================
// Leg 2 — level 25 alone is NOT the price. The quest half is real.
// ===========================================================================
await cmd(XP_TO_25);
await page.waitForTimeout(1500);
const level = await plateLevel();
check('the character is level 25 (the premise of every leg below)',
  level !== null && level >= 25 && level < 30, `level ${level ?? '(unreadable)'}`);

const levelledOnly = await openAt(WARP_FRONT);
check('⭐ level 25 alone does not open the stone: the quest half of the price is real',
  levelledOnly?.actor === FRONT_ACTOR
    && levelledOnly.lines.includes(FRONT_PREVIEW)
    && !levelledOnly.lines.includes(FRONT_READY),
  levelledOnly ? levelledOnly.lines.replace(/\s+/g, ' ').slice(0, 90) : 'no panel');
// ⭐ C2's headline, and it is scored HERE rather than in leg 4 on purpose: one
// character, two stones, two prices, both readable, and this version of it
// needs only the level cheat, so it runs green instead of skipping behind the
// orc gate no harness can pay (leg 4 keeps the stronger, unpayable form).
// ⛑ The two counters must DISAGREE. Both stones say "level N (25/N)" here, so a
// row that somehow rendered the node it is standing ON rather than the node it
// leads to would still look plausible at a glance; only the numbers differ.
const villageAt25 = await openAt(WARP_VILLAGE);
check('⛑ ...and it is the VILLAGE stone that answered there',
  villageAt25?.actor === VILLAGE_ACTOR, `actor "${villageAt25?.actor ?? '(none)'}"`);
check('⭐ the same character reads a DIFFERENT price at the other stone (C2)',
  !!villageAt25 && villageAt25.locked.length === 1
    && villageAt25.locked[0].includes('level 30 (25/30)'),
  villageAt25 ? `locked: ${villageAt25.locked.join(' | ') || '(none)'}` : 'no panel');
check('...and it names neither the front stone\'s level nor its quest',
  !!villageAt25 && !(villageAt25.locked[0] ?? '').includes('25/25')
    && !(villageAt25.locked[0] ?? '').includes('Orc Line'),
  villageAt25 ? `locked: ${villageAt25.locked.join(' | ') || '(none)'}` : 'no panel');
await leave();
await page.screenshot({ path: `.claude/skills/verify/c1-front-preview-${label}.png` });

// ===========================================================================
// Leg 3 — pay the other half: accept the quest, kill orcs, walk the turn-in.
// ===========================================================================
// ⛑ THE SEEDED AURA IS PRE-EQUIPPED AND DELIBERATELY *NOT* ACTIVE (player.go,
// PO 2026-08-02): without this press the player stands in a pack of orcs
// dealing nothing, and the quest leg reports a broken gate against a working one.
await page.evaluate(() => document.activeElement?.blur());
await page.keyboard.down('1');
await page.waitForTimeout(1400);
await page.keyboard.up('1');
await page.waitForTimeout(1200);
const auraOn = await page.evaluate(() =>
  !!document.querySelector('#actionBars .auraSlot.activeSlot'));
check('the starting aura is switched ON (the kill leg\'s premise)', auraOn,
  auraOn ? 'slot 1 active' : 'no active aura slot — nothing can die');

const spent = await spendInto('Damage', 4);
check('the aura is levelled with the character\'s own skill points (the kill leg\'s premise)',
  spent > 0, `${spent} level(s) bought`);

await cmd(`QUEST ACCEPT ${QUEST}`);
// Two stops, because five orcs stand along a 12-unit line and only three are
// within aura range of any one of them.
// ⚑ 25 s per stop, c3's window, and deliberately NOT longer: the header's
// measurement says no window this script can afford finishes five elite orcs,
// so a 90 s wait would buy the same inconclusive answer three times slower.
await cmd(WARP_ORCS);
await page.waitForTimeout(25_000);
await cmd(WARP_ORCS_WEST);
await page.waitForTimeout(25_000);
// The kill objective is what advances `cull` → `report`; the turn-in edge is a
// dialogue one, and the cheat is its only driver until a row exists for it.
await cmd(`QUEST ADVANCE ${QUEST} report done`);

const qualified = await openAt(WARP_FRONT);
const isReady = qualified?.actor === FRONT_ACTOR && qualified.lines.includes(FRONT_READY);
if (isReady) {
  check('⭐ the two-clause price is PAID, and the stone greets differently', true,
    qualified.lines.replace(/\s+/g, ' ').slice(0, 90));
} else if (!auraOn) {
  check('⭐ the two-clause price is PAID, and the stone greets differently', null,
    'SKIP: no active aura, so no orc could have died');
} else {
  check('⭐ the two-clause price is PAID, and the stone greets differently', null,
    `INCONCLUSIVE (expected, see the header): five elite orcs at ~3.6k HP do not die in 50 s — ${qualified?.lines.replace(/\s+/g, ' ').slice(0, 60) ?? 'no panel'}`);
}

let rows = null;
if (isReady) {
  await clickRow(CATALOG_ROW);
  rows = await panel();
  check('...and the reward list opens at a stone the old rule would have refused',
    !!rows && rows.rows.length > 0, rows ? `${rows.rows.length} row(s)` : 'no panel');
}
await page.screenshot({ path: `.claude/skills/verify/c1-front-ready-${label}.png` });
await leave();

// ===========================================================================
// Leg 4 — ⭐ one player, two sites: the village stone still says no.
// ===========================================================================
if (isReady) {
  const atVillage = await openAt(WARP_VILLAGE);
  check('⛑ ...and it is the VILLAGE stone that answered there',
    atVillage?.actor === VILLAGE_ACTOR, `actor "${atVillage?.actor ?? '(none)'}"`);
  // ⭐ THE BEST PROOF C2 HAS, and it is this leg rather than leg 1: ONE
  // character, TWO stones, and the second one says WHY it refuses: a number
  // this player can act on, composed from that stone's own gate. Before C2 the
  // same player got a panel that simply offered nothing.
  check('⭐ the same qualifying character is turned away by the stone priced at 30',
    !!atVillage && atVillage.locked.length === 1 && atVillage.locked[0].includes('level 30'),
    atVillage ? `locked: ${atVillage.locked.join(' | ') || '(none)'}` : 'no panel');
  check('...and its counter reads the character it is refusing',
    !!atVillage && /\(2[5-9]\/30\)/.test(atVillage.locked[0] ?? ''),
    atVillage ? `locked: ${atVillage.locked.join(' | ') || '(none)'}` : 'no panel');
  await leave();
} else {
  check('⭐ the same qualifying character is turned away by the stone priced at 30', null,
    'SKIP: the character never qualified at the front stone');
}

// ===========================================================================
// Leg 5 — ⭐ the ceremony completes BELOW the old cap.
// ===========================================================================
if (isReady) {
  const back = await openAt(WARP_FRONT);
  let spent = false;
  if (back?.actor === FRONT_ACTOR) {
    await clickRow(CATALOG_ROW);
    if (await clickRow(UNGATED_ROW)) {
      await page.waitForTimeout(6200);  // D21's 5 s countdown
      await clickConfirm();
      await page.waitForTimeout(14_000); // the 10 s channel
      spent = await page.evaluate(() =>
        !document.getElementById('characterSelect')?.classList.contains('hidden'));
    }
  }
  check('⭐ a level-25 character spends its life at a stone priced for it (D1 end to end)',
    spent, spent ? `${name} was spent below the old cap` : 'the character is still standing there');
  check('...and never shows the "Connection lost" banner',
    !(await page.evaluate(() => document.body.textContent.includes('Connection lost'))), '(none)');
} else {
  check('⭐ a level-25 character spends its life at a stone priced for it (D1 end to end)', null,
    'SKIP: the character never qualified at the front stone');
}

check('no console errors', consoleErrors.length === 0,
  consoleErrors.length ? consoleErrors.slice(0, 3).join(' | ') : 'clean');
if (missedClicks.length) console.log(`  ! undelivered clicks: ${missedClicks.join(' | ')}`);
console.log(`character: ${name}`);

const passed = results.filter((r) => r.pass === true).length;
const failed = results.filter((r) => r.pass === false).length;
const skipped = results.filter((r) => r.pass === null).length;
console.log(`\n${passed}/${results.length} checks passed${failed ? `, ${failed} FAILED` : ''}${skipped ? `, ${skipped} inconclusive` : ''}`);
await browser.close();
process.exit(failed ? 1 : 0);
