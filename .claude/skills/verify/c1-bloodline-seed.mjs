// The bloodline seed at a real join (docs/archive/plan-ascension.md C1, D16).
//
// What this owns that no Go test can: the seed's ONLY runtime surface is a
// player logging in and finding a skill they never learned. Every layer under
// it is pinned in Go — the store query, the ticket carriage, the discover call
// — but the layers are wired through /select and the WebSocket Join, and a
// break anywhere along that wire leaves every one of those pins green while a
// successor boots with nothing.
//
// ⚑ Its shape is BEFORE/AFTER on ONE character, and the before-leg is the
// whole design. "The skill is in the spellbook" proves nothing on its own —
// half a dozen paths put skills there — so the run first proves the same
// character does NOT know it, then adds one row to game.bloodline_unlocks, then
// rejoins. The only thing that changed is the row.
//
// ⚑ It rejoins the SAME character rather than creating a new one, and asserts
// the name matched. A run that quietly created a second character would score
// a fresh spellbook as "the seed did not arrive".
//
// ⚑ It writes to the DURABLE dev database, like every harness script. The row
// it inserts is removed by `backend/cmd/harnessdb -cleanup` along with the
// character (stop aurad first).
//
// Boundary: this owns whether a bloodline unlock REACHES a joining character.
// What a player then does with it is ordinary spellbook behaviour, owned
// elsewhere; the ascension dialog that grants one is C2's.

import { createRequire } from 'module';
import { execFileSync } from 'child_process';
import { join } from 'path';
import { joinAsNewCharacter } from './lib/join.mjs';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');

const label = process.argv[2] || 'run';
const url = process.argv[3] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

// A real shipped skill no fresh character has: FrostShield is a Troll drop, so
// nothing about a level-1 spawn can produce it by accident. Damage would be
// useless here — every character starts with it.
const UNLOCK = 'FrostShield';
const DB_CONTAINER = 'aura-dev-db';

const results = [];
const check = (name, pass, detail) => {
  results.push({ check: name, pass, detail });
  console.log(`${pass === null ? '~' : pass ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const psql = (sql) =>
  execFileSync('docker', ['exec', DB_CONTAINER, 'psql', '-U', 'aura', '-d', 'aura', '-tAc', sql], {
    encoding: 'utf8',
  }).trim();

// ⚑ The client renders DISPLAY names — the catalog's CamelCase `FrostShield`
// reaches the spellbook as "Frost Shield". Matching the authored key verbatim
// scores a working seed as a failure, which is exactly what the first run of
// this script did. Compare with the separators squeezed out of both sides.
const mentions = (text, skill) =>
  text.replace(/[^a-z0-9]/gi, '').toLowerCase().includes(skill.replace(/[^a-z0-9]/gi, '').toLowerCase());

const spellbook = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('#spellbookList [data-skill-id]')].map((e) => e.textContent.trim()));

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
const name = await joinAsNewCharacter(page, 'blood');
await page.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
await page.waitForSelector('#spellbookList [data-skill-id]', { state: 'attached', timeout: 60_000 });

// --- leg 1: the control -----------------------------------------------------
const before = await spellbook(page);
check(`a fresh character does not know ${UNLOCK}`,
  before.length > 0 && !before.some((r) => mentions(r, UNLOCK)),
  `spellbook: ${before.join(' | ') || '(empty — suspicious)'}`);

// --- leg 2: the bloodline gains one unlock ----------------------------------
// Straight into the table, because C1 has no in-game way to put it there — the
// ascension stone is C2. This is exactly the row the sacrifice transaction
// writes, and the PK is (account_id, slot_index, unlock_key).
let row = '';
try {
  row = psql(
    `INSERT INTO game.bloodline_unlocks (account_id, slot_index, unlock_key)
     SELECT account_id, slot_index, '${UNLOCK}' FROM game.characters WHERE name = '${name}'
     RETURNING account_id || '/' || slot_index`);
} catch (e) {
  row = '';
  console.log(`  ! ${e.message.split('\n')[0]}`);
}
check('the bloodline row is written', row !== '', `account/slot ${row || 'FAILED'}`);

// --- leg 3: come back on a COLD join ----------------------------------------
// ⚑ Settings → "Character select", NOT a page reload, and the difference is the
// whole leg. A reload inside the stash window resumes the LIVE character —
// which discards the ticket by design ("load-from-DB is for cold logins only")
// — so the seed would never run and the leg would read as a broken feature.
// Leaving through the product ends the world session, which makes the return a
// cold join with a freshly minted ticket.
//
// ⚑ This is also why it cannot happen to a real player: bloodline unlocks only
// change AT an ascension, and ascending ends the session by construction.
await page.click('#gameSettingsButton');
await page.click('#leaveToCharacterSelect');
await page.waitForSelector('#characterSelect:not(.hidden)', { state: 'visible', timeout: 60_000 });
const slotName = (await page.textContent('#characterSelect .slotCard .slotCharacterName'))?.trim();
check('the same character came back', slotName === name, `${name} → ${slotName}`);
await page.click('#characterSelect .slotCard .button');
await page.waitForSelector('#accountScreens.hidden', { state: 'attached', timeout: 120_000 });
await page.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
await page.waitForSelector('#spellbookList [data-skill-id]', { state: 'attached', timeout: 60_000 });

// --- leg 4: the seed arrived ------------------------------------------------
await page.waitForFunction(
  (skill) => [...document.querySelectorAll('#spellbookList [data-skill-id]')]
    .some((e) => e.textContent.replace(/[^a-z0-9]/gi, '').toLowerCase().includes(skill)),
  UNLOCK.toLowerCase(), { timeout: 20_000 }).catch(() => {});
const after = await spellbook(page);
check(`${UNLOCK} is in the spellbook after the rejoin`,
  after.some((r) => mentions(r, UNLOCK)),
  `spellbook: ${after.join(' | ')}`);

// --- leg 5: it was DISCOVERED, not equipped ---------------------------------
// D16's seed hands over knowledge, never a loadout: a gift that equipped itself
// would put back, on every login, a skill the player had deliberately removed.
const passives = await page.evaluate(() =>
  [...document.querySelectorAll('.passiveSlot .slotLabel')].map((e) => e.textContent.trim()));
check('the seeded skill is not force-equipped',
  !passives.some((s) => mentions(s, UNLOCK)),
  `passive slots: ${passives.join(' | ') || '(none)'}`);

await page.screenshot({ path: `.claude/skills/verify/c1-bloodline-${label}.png` });

const failed = results.filter((r) => r.pass === false).length;
console.log(`\n${results.filter((r) => r.pass === true).length} PASS, ${failed} FAIL, ${results.filter((r) => r.pass === null).length} INCONCLUSIVE`);
console.log(`console errors: ${consoleErrors.length}`);
consoleErrors.slice(0, 5).forEach((e) => console.log(`  ! ${e}`));
console.log(`character: ${name}`);
await browser.close();
process.exit(failed > 0 ? 1 : 0);
