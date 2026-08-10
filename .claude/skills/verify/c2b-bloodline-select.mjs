// The bloodline on the character-select screen (docs/plan-ascension.md §12.12,
// C2b), and the only place the D15 bug is visible at all.
//
// ⭐ THE WHOLE POINT IS THAT SLOT 0 IS NOT INVOLVED IN THE ASCENSION. Until C2b
// the create card went to the FIRST empty slot: spend the character in slot 1
// while slot 0 sits empty and the single card on offer aimed at slot 0, so the
// heir landed in a slot with no history, permanently cut off from the unlocks
// its predecessor had just bought. It was invisible in every playtest and in
// every other harness script because they all put their character in slot 0 —
// which is why this run deliberately builds an account whose LIVING character is
// in slot 1 and whose slot 0 is empty. On slot 0 there is nothing to see.
//
// The run is one account, driven end to end:
//
//   create A (slot 0) → create B aimed at SLOT 1 → play B, cap it, ascend it at
//   the stone → delete A → read the select screen → create the heir ON SLOT 1 →
//   prove the heir boots holding the gift → read the occupied card
//
// ⚑ Deleting A is load-bearing, not tidying. With A alive the bug hides: slot 1
// is then the first empty slot anyway, so the old render would have aimed at it
// by accident and every assertion here would pass against broken code.
//
// ⛑ It happens AFTER the ascension for a reason the first run found the hard
// way: the delete endpoint refuses a character the account is currently
// playing, and leaving the world does not release the registry slot the moment
// the screen changes. Deleting A seven seconds after leaving it was answered
// `character_playing`; the dialog closed, the list re-read, and A was still
// there while every later assertion measured the wrong shape.
//
// ⚑ THE PROBE, AND IT MUST BE UNGATED. api/ascension/ ships README-only until
// C3, so with stock content the only row is D14's ascend-anyway one — which
// spends the life and grants NOTHING, leaving the slot with a predecessor and no
// gifts. That would still exercise most of this script, but never the gift list
// or the seed. Install an ungated probe first:
//
//     jq 'del(.conditions)' .claude/skills/verify/c2a-probe-reward.json \
//       > api/ascension/c2b-probe-reward.json
//     # restart aurad, run this script, then:
//     rm api/ascension/c2b-probe-reward.json
//
// Remove it afterwards, or `cp-defs` bakes it into the embedded copy. Without a
// probe the gift legs report SKIP rather than red.
//
// ⚑ It writes to the DURABLE dev database: three characters and a
// bloodline_unlocks row. Clear them with `backend/cmd/harnessdb -cleanup`, and
// stop aurad first.
//
// Boundary: `c2a-ascension-site.mjs` owns the stone and its rows — this script
// drives the ceremony only to GET a spent slot, and asserts nothing about the
// panel. `c1-bloodline-seed.mjs` owns the seed arriving on slot 0 from a
// hand-written row; this owns the same thing on a NON-ZERO slot, through the
// product, plus everything the select screen says about it.

import { createRequire } from 'module';
import { join } from 'path';
import { harnessCharacterName, joinAsNewCharacter } from './lib/join.mjs';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');

const label = process.argv[2] || 'run';
const url = process.argv[3] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

// The stone stands at (-57.6, 17.1); WARP takes whole units (×120).
const WARP_TO = 'WARP -7080 2040';
const CATALOG_ROW = 'may still learn';
// The probe reward. The client renders DISPLAY names, so `FrostShield` arrives
// spaced — matching the authored key verbatim scores a working seed as a
// failure, which is exactly what c1-bloodline-seed's first run did.
const GIFT = 'Frost Shield';
const GIFT_KEY = 'FrostShield';

const results = [];
const check = (name, pass, detail) => {
  results.push({ check: name, pass, detail });
  console.log(`${pass === null ? '~' : pass ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const missed = [];

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
page.on('response', (r) => { if (r.status() >= 400) consoleErrors.push(`HTTP ${r.status()} ${r.url()}`); });
// ⚑ Whether the CLIENT even asked. "Play does nothing" has two very different
// causes — a refusal the screen swallowed, and a click that never became a
// request — and only this tells them apart.
const selectCalls = [];
page.on('request', (r) => { if (r.url().includes('/select')) selectCalls.push(r.url().split('/api/')[1]); });
page.on('response', (r) => { if (r.url().includes('/select')) selectCalls.push(`→ ${r.status()}`); });

// --- helpers ---------------------------------------------------------------

const cmd = async (text) => {
  await page.evaluate((t) => {
    const input = document.getElementById('console_command');
    input.value = t;
    document.getElementById('console').dispatchEvent(new Event('submit', { cancelable: true }));
  }, text);
  await page.waitForTimeout(600);
};

/**
 * The slot cards, read in order.
 *
 * ⚑ BY POSITION, not by a data attribute. Cards are rendered in slot order for
 * every slot the account has — that is the screen's own documented invariant and
 * it is pinned in CharacterSelect.test.ts — so children[n] IS slot n. Reading a
 * `data-` hook instead would mean adding one to the product for the harness's
 * convenience.
 */
const slotCards = () => page.evaluate(() =>
  [...document.querySelectorAll('#characterSelect .slotCards > *')].map((card) => ({
    className: card.className,
    text: card.textContent.replace(/\s+/g, ' ').trim(),
    slotIndex: card.dataset.slotIndex ?? null,
  })));

const panelError = () => page.evaluate(() => {
  const e = document.querySelector('#characterSelect .formError');
  return e && !e.classList.contains('hidden') ? e.textContent.trim() : '(no error shown)';
});

const onSelectScreen = () =>
  page.waitForSelector('#characterSelect:not(.hidden)', { state: 'visible', timeout: 60_000 });

// ⚑ It reports WHAT IT ACTUALLY HIT. A real mouse click goes to whatever owns
// the pixel, so an element that is scrolled out of view or covered swallows the
// click silently — the verify skill's develop-panel gotcha, and the reason this
// helper scrolls first and then names the element at the coordinates.
const clickIn = async (selector, what) => {
  const el = await page.$(selector);
  if (!el) { missed.push(`${what}: not found (${selector})`); return false; }
  await el.scrollIntoViewIfNeeded().catch(() => {});
  const box = await el.boundingBox();
  if (!box) { missed.push(`${what}: not laid out (${selector})`); return false; }
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const hit = await page.evaluate(([px, py, sel]) => {
    const top = document.elementFromPoint(px, py);
    const want = document.querySelector(sel);
    if (!top) return `nothing at (${Math.round(px)},${Math.round(py)}) — outside the viewport?`;
    if (top === want || want?.contains(top) || top.contains(want)) return null;
    return `(${Math.round(px)},${Math.round(py)}) is owned by <${top.tagName.toLowerCase()} class="${top.className}">`;
  }, [x, y, selector]);
  if (hit) { missed.push(`${what}: ${hit}`); }
  await page.mouse.click(x, y);
  await page.waitForTimeout(700);
  return true;
};

/** Click the create card sitting in one particular slot. */
const createInSlot = async (slot, tag) => {
  const name = harnessCharacterName(tag);
  const ok = await clickIn(`#characterSelect .slotCard[data-slot-index="${slot}"]`, `create card slot ${slot}`);
  if (!ok) return null;
  await page.waitForSelector('#characterCreation:not(.hidden)', { state: 'visible', timeout: 30_000 });
  await page.fill('#characterCreation .characterNameInput', name);
  await page.click('#characterCreation .characterCreateSubmit');
  return name;
};

// ⛑ PLAY IS RETRIED, and that is not flake-papering. Leaving the world does not
// release the account's session the instant the screen changes — the registry
// holds it through the reconnect stash — so a Play click landing seconds later
// is answered `already_logged_in`, which is a stale-view refusal the product
// handles by re-reading the list. The harness clicks faster than any human and
// hits that window every time.
const enterWorldFrom = async (slot) => {
  for (let attempt = 0; ; attempt++) {
    await clickIn(`#characterSelect .slotCards > *:nth-child(${slot + 1}) .button`, `Play on slot ${slot}`);
    try {
      await page.waitForSelector('#accountScreens.hidden', { state: 'attached', timeout: 15_000 });
      break;
    } catch {
      if (attempt >= 5) {
        console.log(`  ! Play on slot ${slot} never entered the world — error: ${await panelError()}`);
        console.log(`  ! clicks: ${missed.join(' | ') || '(all delivered)'}`);
        console.log(`  ! cards: ${JSON.stringify(await slotCards())}`);
        console.log(`  ! /select traffic: ${selectCalls.join(' | ') || '(the client never asked)'}`);
        console.log(`  ! console: ${consoleErrors.slice(-5).join(' | ') || 'clean'}`);
        throw new Error(`Play on slot ${slot} never entered the world`);
      }
      await page.waitForTimeout(5000);
    }
  }
  await page.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
  await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
  await page.evaluate(() => {
    const p = document.getElementById('developPanel');
    if (p) p.style.display = 'none';
  });
};

// ⚑ Leaving through the PRODUCT, never a page reload: a reload inside the stash
// window resumes the live character, so the return would not be a cold join and
// the seed would never run (c1-bloodline-seed's leg 3 carries the same note).
const leaveToSelect = async () => {
  await page.click('#gameSettingsButton');
  await clickIn('#leaveToCharacterSelect', 'leave to character select');
  await onSelectScreen();
};

const spellbook = () => page.evaluate(() =>
  [...document.querySelectorAll('#spellbookList [data-skill-id]')].map((e) => e.textContent.trim()));

const mentions = (text, skill) =>
  text.replace(/[^a-z0-9]/gi, '').toLowerCase().includes(skill.replace(/[^a-z0-9]/gi, '').toLowerCase());

const pressInteract = async () => {
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down('e');
  await page.waitForTimeout(1400);
  await page.keyboard.up('e');
  await page.waitForTimeout(1200);
};

const clickRow = async (needle) => {
  const handle = await page.evaluateHandle((n) => {
    const rows = [...document.querySelectorAll('#conversation .conversationRows li')];
    return rows.find((li) => li.textContent.includes(n)) ?? null;
  }, needle);
  const el = handle.asElement();
  if (!el) { missed.push(`row not found: ${needle}`); return false; }
  const box = await el.boundingBox();
  if (!box) { missed.push(`row detached: ${needle}`); return false; }
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(900);
  return true;
};

// ===========================================================================
// Build the account: A in slot 0, B in slot 1, then A deleted.
// ===========================================================================

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
const nameA = await joinAsNewCharacter(page, 'heirA');
await page.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
await leaveToSelect();

// --- leg 1: every empty slot offers creation, each aimed at its own slot ----
// ⭐ THE D15 CLIENT HALF, and the assertion the old render fails outright: with
// one character in slot 0 it drew ONE create card, on slot 1, and slot 2 was an
// inert placeholder.
const afterA = await slotCards();
const createCards = afterA.filter((c) => c.slotIndex !== null);
check('every empty slot offers creation, each aimed at its own slot (D15)',
  createCards.length === 2 && createCards.map((c) => c.slotIndex).join(',') === '1,2',
  `create cards on slots: ${createCards.map((c) => c.slotIndex).join(',') || '(none)'}`);

const nameB = await createInSlot(1, 'heirB');
check('a character can be created in a chosen slot', nameB !== null, nameB ?? 'the card was not clickable');
await onSelectScreen();

const withB = await slotCards();
check('...and the server put it there rather than in the lowest free slot',
  withB[1]?.text.includes(nameB) && !withB[0]?.text.includes(nameB),
  `slot 0: "${withB[0]?.text.slice(0, 40)}" | slot 1: "${withB[1]?.text.slice(0, 40)}"`);

// ===========================================================================
// Spend B at the stone.
// ===========================================================================

await enterWorldFrom(1);
await cmd('GOD');
await cmd('XP 100000000');
await cmd(WARP_TO);
await page.waitForTimeout(6000);

await pressInteract();
const reachedCatalog = await clickRow(CATALOG_ROW);
const rows = await page.evaluate(() =>
  [...document.querySelectorAll('#conversation .conversationRows li')]
    .filter((li) => !li.classList.contains('conversationLeaveRow'))
    .map((li) => ({ text: li.textContent.trim(), locked: li.classList.contains('locked') })));
const giftRow = rows.find((r) => r.text.includes(GIFT) && !r.locked);

let ascended = false;
if (!reachedCatalog) {
  check('the ceremony ran (the premise of every leg below)', false,
    'the stone did not offer its catalog — see c2a-ascension-site.mjs');
} else if (!giftRow) {
  check('the ceremony ran (the premise of every leg below)', null,
    `SKIP: no ungated ${GIFT_KEY} row — install the UNGATED probe (see this file's header). rows: ${rows.map((r) => r.text).join(' | ') || '(none)'}`);
} else {
  await clickRow(GIFT);
  await page.waitForTimeout(6200);           // D21's 5 s confirm countdown
  await clickIn('#confirmRow .confirmRowConfirm', 'confirm ascension');
  await page.waitForTimeout(14_000);         // the 10 s channel, plus slack
  await onSelectScreen();
  ascended = true;
  check('the ceremony ran (the premise of every leg below)', true, `${nameB} was spent`);
}

// ===========================================================================
// Empty slot 0, so the D15 case is the sharp one.
// ===========================================================================

// ⛑ THE DELETE HAPPENS HERE, NOT EARLIER, AND THE REASON IS THE SESSION. Its
// endpoint refuses a character the account is currently playing, and leaving the
// world does not release the registry slot the moment the screen changes — an
// earlier attempt was answered `character_playing`, the dialog closed, the list
// re-read, and A was still there while every later assertion quietly measured
// the wrong shape. By this point A's session is many minutes old.
//
// ⚑ And it is what makes the run's subject the subject: with A still alive, slot
// 1 is the first empty slot anyway, so the OLD render would have aimed at it by
// accident and every assertion below would pass against the bug.
if (ascended) {
  await clickIn('#characterSelect .slotCards > *:nth-child(1) .slotDelete', 'Delete on slot 0');
  await page.waitForSelector('#deleteDialog:not(.hidden)', { state: 'visible', timeout: 30_000 });
  await page.waitForTimeout(6000); // the dialog's own 5 s countdown
  await clickIn('#deleteConfirmButton', 'confirm delete');
  await onSelectScreen();
  const afterDelete = await slotCards();
  const gone = !afterDelete[0]?.text.includes(nameA);
  check('slot 0 can be emptied, leaving a slot with no history beside one with a past',
    gone, gone ? `${nameA} deleted` : `still there — ${await panelError()}`);
  if (!gone) ascended = false; // the sharp case is unreachable; do not score a soft pass
}

// ===========================================================================
// What the select screen now says.
// ===========================================================================

const skipRest = (why) => {
  ['the spent slot names the life it continues (D22)',
    '...and lists what the heir would inherit, by display name',
    '...while the untouched slot claims no bloodline',
    'the heir can be aimed at the spent slot (D15)',
    'the heir boots holding its bloodline\'s gift (D16, on a NON-ZERO slot)',
    'the occupied card counts the life it is (D23)',
  ].forEach((name) => check(name, null, why));
};

if (!ascended) {
  skipRest('SKIP: nothing was ascended');
} else {
  const spent = await slotCards();

  // --- leg 2: the empty slot with a past --------------------------------
  check('the spent slot names the life it continues (D22)',
    !!spent[1] && spent[1].text.includes(`Continue the bloodline of ${nameB}`)
      && spent[1].text.includes('1 life spent'),
    `slot 1: "${spent[1]?.text.slice(0, 90)}"`);

  check('...and lists what the heir would inherit, by display name',
    !!spent[1] && spent[1].text.includes(GIFT) && !spent[1].text.includes(GIFT_KEY),
    `slot 1: "${spent[1]?.text.slice(0, 90)}"`);

  // ⭐ The negative control, and it is what proves the card is reading a SLOT
  // rather than the account: slot 0 held a character until moments ago and has
  // never been to the stone, so it must offer a plain create.
  check('...while the untouched slot claims no bloodline',
    !!spent[0] && spent[0].text.includes('Create character')
      && !/bloodline|life spent/i.test(spent[0].text),
    `slot 0: "${spent[0]?.text.slice(0, 90)}"`);

  await page.screenshot({ path: `.claude/skills/verify/c2b-select-${label}.png` });

  // --- leg 3: the heir goes to ITS slot ---------------------------------
  const nameHeir = await createInSlot(1, 'heir');
  await onSelectScreen();
  const withHeir = await slotCards();
  check('the heir can be aimed at the spent slot (D15)',
    nameHeir !== null && withHeir[1]?.text.includes(nameHeir) && !withHeir[0]?.text.includes(nameHeir),
    `slot 0: "${withHeir[0]?.text.slice(0, 40)}" | slot 1: "${withHeir[1]?.text.slice(0, 40)}"`);

  // --- leg 4: and it inherits ------------------------------------------
  // ⚑ THE ASSERTION THAT WOULD HAVE CAUGHT THE BUG. An heir misfiled into slot 0
  // boots with an empty spellbook: the unlock rows are keyed (account, slot), so
  // the gift stays behind in slot 1 forever with nothing able to reach it.
  await enterWorldFrom(1);
  await page.waitForSelector('#spellbookList [data-skill-id]', { state: 'attached', timeout: 60_000 });
  await page.waitForFunction(
    (skill) => [...document.querySelectorAll('#spellbookList [data-skill-id]')]
      .some((e) => e.textContent.replace(/[^a-z0-9]/gi, '').toLowerCase().includes(skill)),
    GIFT_KEY.toLowerCase(), { timeout: 20_000 }).catch(() => {});
  const known = await spellbook();
  check('the heir boots holding its bloodline\'s gift (D16, on a NON-ZERO slot)',
    known.some((r) => mentions(r, GIFT_KEY)),
    `spellbook: ${known.join(' | ') || '(empty)'}`);

  // --- leg 5: the occupied card says what it continues (D23) -------------
  await leaveToSelect();
  const finalCards = await slotCards();
  // ⚑ NO `\b` AFTER "gift". A card's textContent glues its children together —
  // this one reads "…2nd life · 1 giftPlayDelete" — so there is no word
  // boundary there and the obvious regex matches nothing while the HUD is
  // perfectly correct. Same trap the verify skill records for `.slotLabel`.
  check('the occupied card counts the life it is (D23)',
    !!finalCards[1] && finalCards[1].text.includes('2nd life · 1 gift'),
    `slot 1: "${finalCards[1]?.text.slice(0, 90)}"`);

  await page.screenshot({ path: `.claude/skills/verify/c2b-heir-${label}.png` });
  console.log(`characters: A=${nameA} B=${nameB} heir=${nameHeir}`);
}

check('no console errors', consoleErrors.length === 0,
  consoleErrors.slice(0, 3).join(' | ') || 'clean');
if (missed.length) console.log(`  ! undelivered clicks: ${missed.join(' | ')}`);

const passed = results.filter((r) => r.pass === true).length;
const skipped = results.filter((r) => r.pass === null).length;
console.log(`\n${passed}/${results.length - skipped} checks passed${skipped ? `, ${skipped} skipped` : ''}`);
await browser.close();
process.exit(passed + skipped === results.length ? 0 : 1);
