#!/usr/bin/env node
// step 8a chunk 2 — the account screens (plan-accounts-frontend.md §10b).
//
// A NEW HARNESS CATEGORY: every other script here opens `?token=plz&…` and is
// already in the world, then asserts against the PixiJS scene graph. These
// screens are all PRE-GAME and ordinary DOM, so this is the first script that
// drives markup rather than sprites.
//
// What it proves, in the order a player meets it:
//   1. a cold browser lands on character creation, home mount
//   2. creating the first character auto-selects into the world — no extra click
//   3. the registration nag appears for an anonymous player
//   4. registering from settings keeps you in the world and retires the nag
//   5. a returning browser lands on character-select, now offering Logout
//   6. logout returns to creation; logging back in returns to character-select
//   7. the delete dialog opens with its confirm disabled
//
// ⚑ EVERY RUN MUST START FROM A CLEAN PROFILE. A leftover anonymous secret
// routes to character-select instead of creation, which is a different flow and
// would read as a failure in the feature under test.
//
// ⚑ Run `go run ./cmd/harnessdb -cleanup` afterwards. This script leaves an
// account behind by design; the prefix is what makes it removable.
//
// Usage: node .claude/skills/verify/chunk2-accounts.mjs [url]
import { createRequire } from 'node:module';
import { join } from 'node:path';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');
import { harnessCharacterName } from './lib/join.mjs';

const url = process.argv[2] || 'http://localhost:2000/?wsUrl=ws://localhost:2000/game';

const results = [];
const pass = (n, d = '') => results.push(['PASS', n, d]);
const fail = (n, d = '') => results.push(['FAIL', n, d]);

const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = {
  ...process.env,
  LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':'),
};

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

const consoleErrors = [];
// ⚑ A 401 on a COLD load is expected, not a defect: the client always asks the
// server "who am I" (identity can be the httpOnly cookie, which script cannot
// see), and `no_identity` is the honest answer when nobody is signed in. The
// browser logs every 401 as a console error regardless. The assertion that this
// is handled correctly is "cold load shows character creation", below.
page.on('console', (m) => {
  if (m.type() === 'error' && !/\b401\b/.test(m.text())) consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

// ⚑ `.hidden` is display:none here, and waitForSelector defaults to waiting for
// VISIBLE — so waiting on a hidden element MUST pass state:'attached' or the
// happy path times out while the product behaves perfectly.
const waitHidden = (sel, timeout = 60_000) =>
  page.waitForSelector(`${sel}.hidden`, { state: 'attached', timeout });
const waitShown = (sel, timeout = 120_000) =>
  page.waitForSelector(`${sel}:not(.hidden)`, { state: 'visible', timeout });

const charName = harnessCharacterName('acct');
// Registration takes the reserved prefix too, under -dev — otherwise the
// account it creates is indistinguishable from a real player's and `harnessdb
// -cleanup` could not remove it.
const username = `hrnss_a${Date.now().toString(36).slice(-6)}`;
// ⚑ Generated per run, never a literal. The account is a throwaway that
// `harnessdb -cleanup` deletes, but §11's rule is that credentials do not live
// in the repo — and a password constant in a script is the kind of thing that
// gets copy-pasted somewhere it matters. Nothing needs to know this value twice,
// so nothing stores it.
const password = `Hrnss!${Math.random().toString(36).slice(2, 10)}`;

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });

// --- 1. cold load ------------------------------------------------------------
try {
  await waitShown('#characterCreation');
  pass('cold load shows character creation');
} catch (e) { fail('cold load shows character creation', String(e).slice(0, 160)); }

const loginOffered = await page.isVisible('#characterCreation .creationHomeMount');
const backOffered = await page.isVisible('#creationBackButton');
loginOffered && !backOffered
  ? pass('home mount offers Log in and no Back')
  : fail('home mount offers Log in and no Back', `login=${loginOffered} back=${backOffered}`);

// The suggestion is a placeholder, never a prefilled value: prefilling the
// last-used name guarantees a rejected submit under global uniqueness (§4c).
const prefilled = await page.inputValue('#characterCreation .characterNameInput');
const suggested = await page.getAttribute('#characterCreation .characterNameInput', 'placeholder');
prefilled === '' && suggested
  ? pass('name is suggested, not prefilled', `placeholder "${suggested}"`)
  : fail('name is suggested, not prefilled', `value="${prefilled}"`);

// --- 2. create → auto-select → world ----------------------------------------
await page.fill('#characterCreation .characterNameInput', charName);
await page.click('#characterCreation .characterCreateSubmit');
try {
  await waitHidden('#accountScreens');
  pass('first character auto-selects into the world', 'no extra click for a new player');
} catch (e) {
  const err = (await page.textContent('#characterCreation .formError').catch(() => '')) || '';
  fail('first character auto-selects into the world', `error="${err.trim()}"`);
}

const inWorld = await page.locator('#gameUI').evaluate((el) => !el.classList.contains('hidden')).catch(() => false);
inWorld ? pass('HUD is up') : fail('HUD is up');

const secret = await page.evaluate(() => localStorage.getItem('anonymousSecret'));
secret ? pass('anonymous secret stored', `${secret.length} chars`) : fail('anonymous secret stored');

// --- 3. the nag --------------------------------------------------------------
try {
  await waitShown('#registrationNag', 20_000);
  pass('registration nag shown to an anonymous player');
} catch (e) { fail('registration nag shown to an anonymous player', String(e).slice(0, 160)); }

// --- 4. register from the settings panel ------------------------------------
await page.click('#gameSettingsButton');
await waitShown('#gameSettingsPanel', 20_000);

const registerOffered = await page.isVisible('#settingsRegisterButton');
registerOffered ? pass('settings offers Register while anonymous') : fail('settings offers Register while anonymous');

// ⚑ Login must NOT be reachable in-game (ruling 3): §6's discard would
// otherwise be able to soft-delete the character currently being played.
const loginInSettings = await page.locator('#gameSettingsPanel a,#gameSettingsPanel button')
  .evaluateAll((els) => els.some((e) => /log ?in/i.test(e.textContent || '')));
!loginInSettings ? pass('settings does NOT offer Log in') : fail('settings does NOT offer Log in');

await page.click('#settingsRegisterButton');
await waitShown('#registerPanel', 20_000);
await page.fill('#registerUsername', username);
await page.fill('#registerPassword', password);
// ⚑ The confirm field is not optional: leaving it empty fails with "Passwords
// do not match", and because registration gates everything after it, that one
// omission turns into five cascading failures that look like a product break.
await page.fill('#registerPasswordRepeat', password);
await page.click('#registerPanel input[type="submit"]');

try {
  await waitHidden('#accountScreens', 30_000);
  pass('registering from settings returns to the world', 'progress is kept, not re-selected');
} catch (e) {
  const err = (await page.textContent('#registerPanel .formError').catch(() => '')) || '';
  fail('registering from settings returns to the world', `error="${err.trim()}"`);
}

const nagGone = await page.locator('#registrationNag').evaluate((el) => el.classList.contains('hidden'));
nagGone ? pass('the nag retires once registered') : fail('the nag retires once registered');

// --- 5. return as a registered player ---------------------------------------
await page.evaluate(() => sessionStorage.clear());  // drop reconnectToken: force the cold path
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
try {
  await waitShown('#characterSelect');
  pass('a returning player lands on character-select');
} catch (e) { fail('a returning player lands on character-select', String(e).slice(0, 160)); }

const names = await page.$$eval('#characterSelect .slotCharacterName', (els) => els.map((e) => e.textContent));
names.includes(charName)
  ? pass('the character appears in its slot', names.join(' | '))
  : fail('the character appears in its slot', names.join(' | '));

const cards = await page.$$eval('#characterSelect .slotCard', (els) => els.length);
cards === 3 ? pass('three slot cards render') : fail('three slot cards render', `got ${cards}`);

// Logout is registered-only (§5.3) — and this account now is.
const logoutOffered = await page.isVisible('#logoutButton');
logoutOffered ? pass('Logout offered once registered') : fail('Logout offered once registered');

// --- 6. logout, then log back in --------------------------------------------
// ⚑ Wrapped: a thrown click would otherwise abandon the run before ANY result
// is printed, turning one failed step into "the whole script is broken".
try {
  await page.click('#logoutButton');
  await waitShown('#characterCreation', 30_000);
  pass('logout returns to character creation');

  await page.click('#creationLoginButton');
  await waitShown('#loginPanel', 20_000);
  await page.fill('#loginUsername', username);
  await page.fill('#loginPassword', password);
  await page.click('#loginPanel input[type="submit"]');
  await waitShown('#characterSelect', 30_000);
  pass('logging back in returns to character-select');
} catch (e) {
  const err = (await page.textContent('#loginPanel .formError').catch(() => '')) || '';
  fail('logout / log back in', `${String(e).slice(0, 120)} error="${err.trim()}"`);
}

// --- 7. the delete dialog ----------------------------------------------------
try {
  await page.click('#characterSelect .slotCard .slotDelete');
  await waitShown('#deleteDialog', 20_000);
  pass('delete opens a confirmation dialog');

  const confirmLocked = await page.locator('#deleteConfirmButton').evaluate((el) => el.classList.contains('disabled'));
  const confirmLabel = (await page.textContent('#deleteConfirmButton')) || '';
  confirmLocked && /\d/.test(confirmLabel)
    ? pass('confirm is disabled and counting down', `label "${confirmLabel.trim()}"`)
    : fail('confirm is disabled and counting down', `locked=${confirmLocked} label="${confirmLabel.trim()}"`);

  await page.click('#deleteCancelButton');
  const closed = await page.locator('#deleteDialog').evaluate((el) => el.classList.contains('hidden'));
  closed ? pass('cancel closes the dialog') : fail('cancel closes the dialog');
} catch (e) {
  fail('the delete dialog', String(e).slice(0, 160));
}

consoleErrors.length === 0
  ? pass('0 console errors')
  : fail('0 console errors', consoleErrors.slice(0, 3).join(' // '));

await browser.close();

let failed = 0;
for (const [state, name, detail] of results) {
  if (state === 'FAIL') failed++;
  console.log(`${state}  ${name}${detail ? `  — ${detail}` : ''}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
console.log(`(leaves account ${username}; run: go run ./cmd/harnessdb -cleanup)`);
process.exit(failed ? 1 : 0);
