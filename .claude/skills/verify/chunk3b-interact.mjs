#!/usr/bin/env node
// plan-entity-model.md chunk 3b-i — in-game smoke for the interact verb.
//
// What it proves: talking stopped being something that happens TO a player who
// walked too close and became something a player DOES.
//
//   1. Farmer, approach  → the E badge lights and NOTHING is said. This is the
//                          L18 check and the one most worth having: a missing
//                          guard does NOT present as an empty conversation
//                          (every conversant authors lore lines, so the bubble
//                          would look fine) — it presents as the pre-3b ambush.
//                          Assert on the SPELLBOOK, not on the bubble.
//   2. Farmer, press E   → the panel OPENS on the Farmer and teaches nothing by
//                          itself; pressing E again closes it
//   3. walk away         → the badge goes out
//   4. return, press E   → the badge re-lights and the verb still opens
//   5. Emberkeeper       → a second, different conversant is offered and opens
//   6. the D9 rebind     → R fires cooldown slot 2; E, with no badge lit, does
//                          not — the key really moved
//
// ⚑ SCOPE (rewritten 2026-07-29). This script owns the VERB — who is offered,
// what the key does, and the badge lifecycle. Everything INSIDE the panel —
// grants, level walls, refusal lines, Back/Leave, the unlock banner — belongs to
// chunk3b-ii-conversation.mjs. It used to assert those too, from the 3b-i world
// where `E` taught directly, and 3b-ii's move of the grant onto a row click left
// it permanently red at 9/15 across two chunks, reading as a regression to
// everyone who ran it. Duplicating that coverage here would also mean every
// content edit to a teaching NPC breaks two harnesses instead of one — which is
// exactly what `3b1b3ef6` did.
//
// ⚑ Harness traps carried from chunks 2/3a, all still live:
//   · the dev console input stopPropagation()s keydown — blur() before walking
//   · screen-up is DECREASING world y, so walking toward a LARGER y is 's'
//   · slot/interact hotkeys are edge-triggered off an rAF-throttled clock, so
//     a keypress needs a ~1.4 s HOLD or it falls between two samples and reads
//     exactly like a broken feature
//   · cache the scene-graph root while the character is alive (GOD too)
//
// Usage: node .claude/skills/verify/chunk3b-interact.mjs [label] [url]
import { createRequire } from 'node:module';
import { join } from 'node:path';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');
import { joinAsNewCharacter } from './lib/join.mjs';

const label = process.argv[2] || 'run';
const url = process.argv[3] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

// WARP takes 1/120 units and wants whole units.
const w = (x, y) => `${Math.round(x) * 120} ${Math.round(y) * 120}`;
// ⚑ The badge lifecycle runs on the EMBERKEEPER because it is ISOLATED — 30.5
// units from the nearest other conversant. The town cluster cannot host these
// checks: Farmer (-57, 28.6), Hermit (-54.9, 25.6) and TownCrier (-55.7, 22.0)
// stand within ~3 units of each other, so the server offers whichever is
// nearest (the Hermit, from the old warp point) and "walk away until the badge
// goes out" just walks into the next one's range. That cost 3 of 14 checks on
// the 2026-07-29 rewrite, all reading as feature failures.
const NEAR_EMBERKEEPER = w(35, -22);   // Emberkeeper (34.52, -19.6), approached from a smaller y
const TOWN_CLUSTER = w(-57, 26);       // three conversants inside ~3 units
const EMPTY_GROUND = w(-57, 16);       // far from every conversant, for the E/R check

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();

const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await joinAsNewCharacter(page, 'talk');
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

// How many interact badges are EFFECTIVELY visible: a Text reading exactly "E"
// whose whole ancestor chain is visible. The badge hides by flipping its own
// container's `visible`, so checking the Text alone would report a hidden badge
// as lit — hence the walk back up.
const badgeCount = () => page.evaluate(() => {
  let n = 0;
  const walk = (c) => {
    if (c?.visible === false) return; // an invisible subtree hides its badge too
    if (typeof c?.text === 'string' && c.text.trim() === 'E') n++;
    (c?.children || []).forEach(walk);
  };
  walk(window.__auraRoot);
  return n;
});

// The conversation panel (3b-ii). This script cares only about WHETHER the verb
// opens it and on whom — everything inside it (grants, walls, Back, Leave, the
// unlock banner) belongs to chunk3b-ii-conversation.mjs.
const panel = () => page.evaluate(() => {
  const el = document.getElementById('conversation');
  if (!el || el.classList.contains('hidden')) return null;
  return { actor: el.querySelector('.conversationActor')?.textContent?.trim() ?? '' };
});

const spellbook = () => page.evaluate(() =>
  [...document.querySelectorAll('#spellbookList li')].map((li) => li.textContent.trim()));

const bannerText = () => page.evaluate(() => document.getElementById('alertBanner')?.textContent?.trim() || '');

const walkTo = async (key, seconds) => {
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down(key);
  await page.waitForTimeout(seconds * 1000);
  await page.keyboard.up(key);
};

// Walk in short bursts until the badge state becomes `want`, then STOP.
//
// ⚑ A fixed walk duration cannot hit these actors: the talk sensor is ~1 unit
// wide, and headless walking speed swings with rAF throttling — measured at
// ~0.5 units/s near the Farmer and ~1.5 units/s near the Emberkeeper in the
// same session. A 5 s walk that lands on one overshoots straight past the
// other, and the badge blinking on and back off inside one burst reads exactly
// like "the badge never lit" (observed on runs 1 and 2 of this script).
const walkUntilBadge = async (key, want, maxSeconds = 14) => {
  await page.evaluate(() => document.activeElement?.blur());
  for (let elapsed = 0; elapsed < maxSeconds; elapsed += 0.5) {
    if ((await badgeCount() > 0) === want) return true;
    await page.keyboard.down(key);
    await page.waitForTimeout(500);
    await page.keyboard.up(key);
  }
  return (await badgeCount() > 0) === want;
};

// ⚑ ~1.4 s hold, the chunk-2 finding: the interact key rides the same
// edge-triggered path as the slot hotkeys, sampled from an rAF-driven clock
// that a headless page throttles hard.
const press = async (key) => {
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down(key);
  await page.waitForTimeout(1400);
  await page.keyboard.up(key);
  await page.waitForTimeout(1500);
};

await cmd('PING'); // the first command after joining is dropped (harness note)
await cmd('GOD');  // survivability only — nothing asserted here depends on it
await primeRoot();

const results = [];
const check = (name, pass, detail) => results.push({ check: name, pass, detail });

// --- 1. approach must no longer teach (L18) ---
await cmd(`WARP ${NEAR_EMBERKEEPER}`);
await page.waitForTimeout(20_000); // camera + position settle across the warp (§20)

const beforeApproach = await spellbook();
await walkUntilBadge('s', true); // toward the larger y the Emberkeeper stands at
await page.waitForTimeout(1200);

const approachSpellbook = await spellbook();
const approachBubbles = await worldText();
const approachBanner = await bannerText();
const approachBadges = await badgeCount();
await page.screenshot({ path: `/tmp/chunk3b-${label}-1-approach.png` });

check('Approaching the Emberkeeper teaches NOTHING (L18)',
  !approachSpellbook.some((s) => /Torch/i.test(s)),
  `spellbook ${JSON.stringify(beforeApproach)} → ${JSON.stringify(approachSpellbook)} at ${JSON.stringify(await pos())}`);
check('...and says nothing',
  !approachBubbles.some((t) => t.includes("I'll teach you Torch")) && !/Taught by/.test(approachBanner),
  `bubbles: ${JSON.stringify(approachBubbles.slice(-3))}; banner: ${JSON.stringify(approachBanner)}`);
check('The E badge is lit over the actor in range',
  approachBadges > 0,
  `visible "E" badges: ${approachBadges}`);

// --- 2. the verb: pressing E opens the conversation ---
await press('e');
const taughtPanel = await panel();
const taughtSpellbook = await spellbook();
await page.screenshot({ path: `/tmp/chunk3b-${label}-2-pressed.png` });

check('Pressing E opens the conversation panel on the Emberkeeper',
  taughtPanel !== null && /Emberkeeper/i.test(taughtPanel.actor),
  `panel actor ${JSON.stringify(taughtPanel?.actor)}`);
// ⚑ THE 3b-i/3b-ii BOUNDARY, and the reason this check replaced "E teaches
// Harvest". In 3b-i the key taught directly; 3b-ii made the key OPEN a tree and
// moved the grant onto a row click. Asserting the old behaviour left this
// script permanently red at 9/15 across two chunks, reading as a regression to
// everyone who ran it (found by the full-harness sweep, 2026-07-29).
check('...and by itself teaches NOTHING — the grant needs a row click (D17)',
  !taughtSpellbook.some((t) => /Torch/i.test(t)),
  `spellbook after the keypress: ${JSON.stringify(taughtSpellbook)}`);

// Close it again with the same key: the verb toggles, which is also what puts
// the world back in a known state for the badge checks below.
await press('e');
check('Pressing E again closes the panel',
  (await panel()) === null, `panel after the second press: ${JSON.stringify(await panel())}`);

// --- 3. leaving range puts the badge out ---
await walkUntilBadge('w', false); // back toward the smaller y, out of the sensor
await page.waitForTimeout(1200);
const awayBadges = await badgeCount();
await page.screenshot({ path: `/tmp/chunk3b-${label}-3-away.png` });
check('Walking away puts the badge out',
  awayBadges === 0,
  `visible "E" badges after leaving: ${awayBadges} at ${JSON.stringify(await pos())}`);

// --- 4. returning re-triggers, and a known grant is skipped ---
await walkUntilBadge('s', true);
await page.waitForTimeout(1200);
const returnBadges = await badgeCount();
await press('e');
const returnPanel = await panel();
await page.screenshot({ path: `/tmp/chunk3b-${label}-4-return.png` });

check('Returning re-lights the badge',
  returnBadges > 0,
  `visible "E" badges after returning: ${returnBadges}`);
check('...and the verb still works on the way back',
  returnPanel !== null && /Emberkeeper/i.test(returnPanel.actor),
  `panel actor ${JSON.stringify(returnPanel?.actor)}`);
await press('e'); // close again

// --- 5. a SECOND, different conversant is offered the same way ---
// ⚑ Only the OFFER and the open are checked here. The teaching content — grants,
// level walls, refusal lines — is chunk3b-ii-conversation.mjs's job; this script
// used to assert it too, which meant every content edit to a teaching NPC broke
// two harnesses instead of one (`3b1b3ef6` did exactly that).
//
// ⚑ And the actor is NOT named. Three conversants stand within ~3 units here and
// the server offers whichever is nearest, so naming one asserts a positional
// accident rather than a behaviour. Assert that SOME town conversant answered.
await cmd(`WARP ${TOWN_CLUSTER}`);
await page.waitForTimeout(20_000);
await walkUntilBadge('s', true);
await page.waitForTimeout(1200);
const townBadges = await badgeCount();
await press('e');
const townPanel = await panel();
await page.screenshot({ path: `/tmp/chunk3b-${label}-5-town.png` });

check('A second, different conversant is offered and opens on the key',
  townBadges > 0 && townPanel !== null
    && /Farmer|Hermit|Town ?Crier/i.test(townPanel.actor)
    && !/Emberkeeper/i.test(townPanel.actor),
  `badges ${townBadges}; panel actor ${JSON.stringify(townPanel?.actor)}`);
await press('e'); // close before the rebind section

// --- 6. the D9 rebind: cooldown slot 2 is R, and E is not a cooldown key ---
// Done on empty ground so E has no badge to act on: what is under test is that
// the key no longer fires a cooldown, and a conversation would muddy that.
await cmd(`WARP ${EMPTY_GROUND}`);
await page.waitForTimeout(20_000);
await cmd('SKILL SummonCompanion');
await page.waitForTimeout(800);

const slot2Text = () => page.evaluate(() =>
  document.querySelector('#cooldownSlotList li:nth-child(2)')?.textContent?.trim() || '');
// A running cooldown renders as a seconds timer in the slot — the readable
// "this key fired" signal.
const slot2Busy = async () => /\d+(\.\d+)?s/.test(await slot2Text());

const row = await page.evaluate(() =>
  [...document.querySelectorAll('#spellbookList li')].findIndex((li) => /Companion/i.test(li.textContent)));
if (row >= 0) {
  const rows = await page.$$('#spellbookList li');
  const box = await rows[row].boundingBox();
  // ⚑ Click the NAME, not the row centre — mid-row is the spend button.
  await page.mouse.click(box.x + 25, box.y + box.height / 2);
  await page.waitForTimeout(700);
  const slot = await page.$('#cooldownSlotList li:nth-child(2)');
  const sbox = await slot.boundingBox();
  await page.mouse.click(sbox.x + sbox.width / 2, sbox.y + sbox.height / 2);
  await page.waitForTimeout(900);
}
const equipped = await slot2Text();
check('SummonCompanion is equipped into cooldown slot 2',
  /Companion/i.test(equipped),
  `slot 2 reads: ${JSON.stringify(equipped.slice(0, 60))}`);

const badgesOnEmptyGround = await badgeCount();
await press('e');
// ⚑ Capture the TEXT, not just the boolean, before firing R. Reading it later
// reports the post-R state for both checks, which makes a correct PASS read as
// a contradiction ("E did not fire" next to a running timer) — observed on the
// first run of this script.
const busyAfterE = await slot2Busy();
const textAfterE = await slot2Text();
await press('r');
const busyAfterR = await slot2Busy();
const textAfterR = await slot2Text();
await page.screenshot({ path: `/tmp/chunk3b-${label}-6-rebind.png` });

check('E no longer fires cooldown slot 2',
  !busyAfterE,
  `no badge lit here (${badgesOnEmptyGround}); slot 2 after E: ${JSON.stringify(textAfterE)}`);
check('R fires cooldown slot 2',
  busyAfterR,
  `slot 2 after R: ${JSON.stringify(textAfterR)}`);
check('The slot 2 key hint reads R, not the old E',
  /(^|[^a-zA-Z])R/.test(textAfterR) && !/^E/.test(textAfterR),
  `slot 2 label: ${JSON.stringify(textAfterR)}`);

const ctxLoss = consoleErrors.filter((t) => t.includes('[webgl] world context lost'));
console.log('\nlabel            :', label);
for (const r of results) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.check}\n        ${r.detail}`);
}
console.log('webgl ctx losses :', ctxLoss.length, '(any > 0 ⇒ blank world, §29, not this chunk)');
console.log('console errors   :', consoleErrors.length);
for (const e of consoleErrors.slice(0, 5)) console.log('   ·', e);

await browser.close();
process.exitCode = results.every((r) => r.pass) && consoleErrors.length === 0 ? 0 : 1;
