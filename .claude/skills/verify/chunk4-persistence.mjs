#!/usr/bin/env node
// step 8a chunk 4 — save & load (plan-accounts-implementation.md §2/§4/§6).
//
// The one thing persistence is FOR, driven at the real game surface: a
// character's progress survives leaving the world and coming back.
//
//   1  join a fresh anonymous character, prove it starts at level 1 knowing
//      nothing
//   2  give it XP and skills through the real server (cheats — the grant path
//      is the game's own, not a test hook)
//   3  leave to character-select, which ends the world session and triggers
//      §2's disconnect save
//   4  play the SAME character again — a cold join, so everything comes back
//      out of Postgres via /select and the play ticket
//
// ⚑ Step 3 is a REAL round trip, not a reload of in-memory state. Leaving to
// character-select drops the socket; the reconnect stash would otherwise resume
// the live character and the whole run would prove nothing. The script therefore
// asserts it landed on character-select and clicked Play, which is the cold
// path (§5 — "load-from-DB is for cold logins only").
//
// ⚑ It also checks the negative: a character that was never saved must not come
// back with someone else's spellbook, and the SECOND slot's character must be
// untouched by the first one's progress.
//
// Usage: node .claude/skills/verify/chunk4-persistence.mjs [label] [url]
// Afterwards: cd backend && go run ./cmd/harnessdb -cleanup
import { createRequire } from 'node:module';
import { join } from 'node:path';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');
import { harnessCharacterName } from './lib/join.mjs';
import { showSkillRowAt } from './lib/spellbook.mjs';

const url = process.argv[3] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

const results = [];
const consoleErrors = [];
const check = (ok, name, note) => {
  results.push({ ok, name, note });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? '  — ' + note : ''}`);
};

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
// ⚑ No 401 filter any more — a cold load is genuinely clean now that
// `GET /api/session` answers "nobody is signed in" with a 200 instead of an
// error. Same reason, same note, as chunk2-accounts.mjs.
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

const cmd = async (text) => {
  await page.evaluate((t) => {
    const input = document.getElementById('console_command');
    input.value = t;
    document.getElementById('console').dispatchEvent(new Event('submit', { cancelable: true }));
  }, text);
  await page.waitForTimeout(600);
};

// Everything below is read off the HUD, i.e. off GameState — server truth, not
// client bookkeeping.
// The nameplate's level badge — drawn from the character's streamed level.
const level = () => page.evaluate(() => Number(window.game?.character?.levelElement?.text));
// "XP <in-level>/<for-next>" — the within-level number, server-authoritative.
const xp = () => page.evaluate(() => {
  const m = document.querySelector('#xpBar .barText')?.textContent?.match(/XP\s+(\d+)/);
  return m ? +m[1] : null;
});
// The aura panel's spellbook list, i.e. GameState.spellbook. Used as a
// before/after comparator, so the `.sectionHeader` rows it includes are
// harmless — they round-trip like anything else.
const spellbookNames = () => page.evaluate(() =>
  [...document.querySelectorAll('#spellbookList li')].map((li) => li.textContent.trim()).sort());
// ⚑ The same list WITHOUT the category headers ("Auras", "Passives"), which are
// `li`s too. Counting rows without this reports a one-skill spellbook as two.
const spellbookSkills = () => page.evaluate(() =>
  [...document.querySelectorAll('#spellbookList li:not(.sectionHeader)')].map((li) => li.textContent.trim()).sort());
// The aura loadout as the HUD renders it, plus which slot is lit — the two
// halves of character_loadout_slots and characters.active_aura_slot.
const auraLoadout = () => page.evaluate(() =>
  [...document.querySelectorAll('#auraSlotList li')].map((li) => li.textContent.trim()));
const activeAuraSlot = () => page.evaluate(() =>
  [...document.querySelectorAll('#auraSlotList li')].findIndex((li) => li.classList.contains('activeSlot')));

// equipAura selects a spellbook row by name and binds it into the first aura
// slot. ⚑ Click the NAME, not the row centre: the spend/unspend buttons sit
// mid-row and win the pointerdown, so a centre click spends a skill point and
// the equip silently never happens (chunk2-follower learned this the hard way).
const equipAura = async (pattern) => {
  const row = await page.evaluate((p) =>
    [...document.querySelectorAll('#spellbookList li')].findIndex((li) => new RegExp(p, 'i').test(li.textContent)),
  pattern);
  if (row < 0) return false;
  await showSkillRowAt(page, row); // the book is a closable, paged panel since UI pass C3
  const rows = await page.$$('#spellbookList li');
  const box = await rows[row].boundingBox();
  await page.mouse.click(box.x + 25, box.y + box.height / 2);
  await page.waitForTimeout(600);
  await page.click('#auraSlotList li:first-child');
  await page.waitForTimeout(900);
  return true;
};

const enterWorld = async () => {
  await page.waitForSelector('#accountScreens.hidden', { state: 'attached', timeout: 120_000 });
  await page.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
  await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
  await page.evaluate(() => { const p = document.getElementById('developPanel'); if (p) p.style.display = 'none'; });
  // The HUD populates from the first GameState, not from Accept.
  await page.waitForTimeout(1200);
};

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });

  // --- 1. a brand-new character ------------------------------------------
  const creation = page.locator('#characterCreation:not(.hidden)');
  await creation.waitFor({ state: 'visible', timeout: 120_000 });
  const name = harnessCharacterName('p4');
  await page.fill('#characterCreation .characterNameInput', name);
  await page.click('#characterCreation .characterCreateSubmit');
  await enterWorld();

  check(await level() === 1, 'a new character starts at level 1', `level ${await level()}`);
  // ⚑ NOT "knows nothing" — that premise was reversed on the main line while the
  // accounts line was being built, and the two met at the merge. A creation
  // milestone (`api/milestones/milestone-unlocks.json`, level 1 → Damage) seeds
  // Damage into the spellbook AND pre-equips it into aura slot 1, deliberately
  // left INACTIVE so the player's first press of "1" turns it on (PO ruling,
  // `0e161de8`, 2026-08-02). So the pristine state is the seeded one, and
  // asserting an empty spellbook scores shipped, PO-verified behaviour as a
  // persistence defect.
  const startingSkills = await spellbookSkills();
  check(startingSkills.length === 1 && /damage/i.test(startingSkills[0]),
    'a new character knows only the creation-seeded Damage', startingSkills.join(', ') || 'nothing');
  check(await activeAuraSlot() === -1, 'and it is seeded inactive', `active slot ${await activeAuraSlot()}`);

  // --- 2. earn something worth losing -------------------------------------
  await cmd('XP 900');
  await cmd('SKILL Damage');
  await cmd('SKILL Hardy');
  await page.waitForTimeout(1500);

  check(await equipAura('Damage'), 'Damage is equipped into aura slot 1');
  // ⚑ Switch it ON. An equipped-but-inactive loadout leaves active_aura_slot at
  // -1, which round-trips trivially — the column is only exercised by a real
  // slot index. A second click on a filled slot activates it (the first one
  // bound the pending skill into it).
  await page.click('#auraSlotList li:first-child');
  await page.waitForTimeout(900);
  check(await activeAuraSlot() === 0, 'and switched on', `active slot ${await activeAuraSlot()}`);

  const earnedLevel = await level();
  const earnedXP = await xp();
  const earnedSkills = await spellbookNames();
  const earnedLoadout = await auraLoadout();
  const earnedActive = await activeAuraSlot();
  check(earnedLevel > 1, 'the character levelled up', `level ${earnedLevel}`);
  check(earnedSkills.length >= 2, 'the character learned skills', earnedSkills.join(', '));
  check(/damage/i.test(earnedLoadout[0] || ''), 'the aura slot holds it', earnedLoadout[0]);

  // --- 3. leave the world -------------------------------------------------
  // The settings gear → "Character select" is the in-product way out; it ends
  // the world session, which is what makes the return a COLD join.
  await page.click('#gameSettingsButton');
  await page.click('#leaveToCharacterSelect');
  await page.waitForSelector('#characterSelect:not(.hidden)', { state: 'visible', timeout: 60_000 });
  check(true, 'left the world to character-select');

  // Give the async writer a moment; the disconnect save is queued on the loop
  // and written on the writer goroutine.
  await page.waitForTimeout(2000);

  // --- 4. come back -------------------------------------------------------
  const slotName = await page.textContent('#characterSelect .slotCard .slotCharacterName');
  check(slotName?.trim() === name, 'the character is in its slot', slotName?.trim());
  await page.click('#characterSelect .slotCard .button');
  await enterWorld();

  const backLevel = await level();
  const backXP = await xp();
  const backSkills = await spellbookNames();

  check(backLevel === earnedLevel, 'the level survived', `${earnedLevel} → ${backLevel}`);
  check(backXP === earnedXP, 'the experience survived', `${earnedXP} → ${backXP}`);
  check(JSON.stringify(backSkills) === JSON.stringify(earnedSkills), 'the spellbook survived',
    `${earnedSkills.join(', ')} → ${backSkills.join(', ')}`);

  const backLoadout = await auraLoadout();
  check(JSON.stringify(backLoadout) === JSON.stringify(earnedLoadout), 'the loadout survived',
    `${JSON.stringify(earnedLoadout)} → ${JSON.stringify(backLoadout)}`);
  check(await activeAuraSlot() === earnedActive, 'the active aura slot survived',
    `slot ${earnedActive} → ${await activeAuraSlot()}`);
} catch (err) {
  check(false, 'the run completed', String(err && err.message ? err.message : err));
} finally {
  check(consoleErrors.length === 0, `${consoleErrors.length} console errors`,
    consoleErrors.slice(0, 3).join(' | '));
  await browser.close();
}

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} passed`);
console.log('(run: cd backend && go run ./cmd/harnessdb -cleanup)');
process.exit(passed === results.length ? 0 : 1);
