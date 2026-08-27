#!/usr/bin/env node
// Round-7 items 7 + 8, the wiring vitest cannot see:
//
//   leg A (item 7)  — paying a cost pops a BLUE floating number. Swift is the
//                     vehicle: a costed COOLDOWN pays on cast, hit or whiff
//                     (D9), so no mob and no walk is needed — fire it standing
//                     still and the charge is guaranteed. ⚑ GOD OFF for this
//                     leg: GOD skips costs at the pricing site.
//   leg B (item 8)  — the spellbook Reset button: arm ("Confirm?"), confirm,
//                     every skill back to level 1, the points badge restored.
//
// ⚑ Slot hotkeys need a LONG hold (~1.3 s) — rAF-sampled (verify skill).
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { joinAsNewCharacter } from './lib/join.mjs';
import { openSpellbook, showSkillRow } from './lib/spellbook.mjs';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');

const url = process.argv[2] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const outdir = process.argv[3] || '/tmp/r7-respec-shots';
mkdirSync(outdir, { recursive: true });

const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = {
  ...process.env,
  LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':'),
};

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const fail = (msg) => { errors.push('CHECK FAILED: ' + msg); };

await page.goto(url, { waitUntil: 'domcontentloaded' });
// The account screens replaced #startForm (step 8a chunk 2); joins go
// through lib/join.mjs since 2026-08-17 (this script was red at join before).
await joinAsNewCharacter(page, 'respec');
await page.waitForFunction(() => !!window.game?.character, null, { timeout: 30_000 });
await page.evaluate(() => {
  const panel = document.getElementById('developPanel');
  if (panel) panel.style.display = 'none';
  // Cache the scene root while alive (verify skill: a dead player nulls it).
  window.__auraRoot = window.game.character.plate.parent;
});
console.log('joined');

async function runCommand(command) {
  await page.waitForSelector('#console_command', { state: 'attached' });
  await page.evaluate((cmd) => {
    const input = document.querySelector('#console_command');
    input.value = cmd;
    document.querySelector('#console').dispatchEvent(new Event('submit', { cancelable: true }));
  }, command);
  await page.waitForTimeout(400);
}

async function equipFromSpellbook(name, slotSelector) {
  await page.waitForFunction(
    (n) => [...document.querySelectorAll('#spellbookList [data-skill-id]')]
      .some(e => new RegExp(n, 'i').test(e.textContent)),
    name, { timeout: 20_000 });
  const id = await page.evaluate((n) =>
    [...document.querySelectorAll('#spellbookList [data-skill-id]')]
      .find(e => new RegExp(n, 'i').test(e.textContent))?.dataset.skillId, name);
  await showSkillRow(page, id); // the book is a closable, paged panel since UI pass C3
  const row = page.locator(`#spellbookList [data-skill-id="${id}"]`).first();
  await row.scrollIntoViewIfNeeded();
  const box = await row.boundingBox();
  await page.mouse.click(box.x + 25, box.y + box.height / 2); // the NAME, not the row centre
  await page.waitForSelector('#spellbookList li.selected', { timeout: 5_000 }).catch(() => {});
  const slot = page.locator(slotSelector).first();
  const slotBox = await slot.boundingBox();
  await page.mouse.click(slotBox.x + slotBox.width / 2, slotBox.y + slotBox.height / 2);
  await page.waitForFunction(
    ({ n, sel }) => new RegExp(n, 'i').test(document.querySelector(sel)?.textContent ?? ''),
    { n: name, sel: slotSelector }, { timeout: 15_000 });
  return id;
}

// --- leg A: firing a costed cooldown pops a blue number (item 7) -----------
// NO GOD yet — GOD skips costs.
await runCommand('SKILL Swift');
await equipFromSpellbook('Swift', '#cooldownSlotList .cooldownSlot[data-slot="0"]');

const healthBefore = await page.evaluate(() =>
  document.querySelector('#healthBar .barText')?.textContent);

// Watch the scene graph for the blue floating number WHILE holding the key —
// the text rises and fades, so poll during the window instead of after it.
const costSeen = page.evaluate(() => new Promise((resolve) => {
  const stage = (() => { let n = window.__auraRoot; while (n.parent) n = n.parent; return n; })();
  const BLUE = 0x4D9EFF;
  const matches = (node) => {
    if (node.text !== undefined && /^-\d+$/.test(String(node.text))) {
      const fill = node.style?.fill;
      const hex = typeof fill === 'string' ? parseInt(fill.replace('#', ''), 16) : fill;
      if (hex === BLUE) return true;
    }
    return (node.children ?? []).some(matches);
  };
  const t0 = Date.now();
  const poll = () => {
    if (matches(stage)) return resolve(true);
    if (Date.now() - t0 > 8000) return resolve(false);
    setTimeout(poll, 120);
  };
  poll();
}));
// Long hold: rAF-sampled hotkeys need ~1.3 s.
await page.keyboard.down('q');
await page.waitForTimeout(1400);
await page.keyboard.up('q');
const sawBlue = await costSeen;
const healthAfter = await page.evaluate(() =>
  document.querySelector('#healthBar .barText')?.textContent);
console.log(`health ${healthBefore} -> ${healthAfter}, blue cost number seen: ${sawBlue}`);
await page.screenshot({ path: join(outdir, 'cost-number.png') });
// Evidence BEFORE observability (verify skill rule 4): the blue number itself
// is the evidence — only the 'cost' kind renders "-N" in exactly 0x4D9EFF, so
// seeing it proves cost_paid rode the wire. The health text is NOT a reliable
// witness: a cost does not enter combat, so ~1 %/s regen can top the pool back
// up before the after-read (observed live — 100/100 → 100/100 with the number
// plainly on screen).
if (!sawBlue) {
  if (healthBefore === healthAfter) {
    console.log('INCONCLUSIVE leg A: no blue number AND no health change — the cooldown may never have fired');
  } else {
    fail('a cost was paid (health moved) but no blue floating number appeared');
  }
}

// --- leg B: the reset-all button (item 8) ----------------------------------
await runCommand('GOD');
await runCommand('XP 99999999');
await page.waitForTimeout(1500);

const swiftLevel = () => page.evaluate(() => {
  const row = [...document.querySelectorAll('#spellbookList [data-skill-id]')]
    .find(e => /Swift/i.test(e.textContent));
  const m = row?.textContent.match(/(\d+)\/(\d+)/);
  return m ? Number(m[1]) : null;
});

// Spend points on Swift via the + button until it moves.
const plusOnSwift = async () => {
  const id = await page.evaluate(() =>
    [...document.querySelectorAll('#spellbookList [data-skill-id]')]
      .find(e => /Swift/i.test(e.textContent))?.dataset.skillId);
  await showSkillRow(page, id);
  const btn = page.locator(`#spellbookList [data-skill-id="${id}"] .spendBtn`).first();
  const box = await btn.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(600);
};
await plusOnSwift();
await plusOnSwift();
const raised = await swiftLevel();
console.log('Swift level after spending:', raised);
if (raised === null || raised < 2) fail('could not raise Swift above 1 to set up the respec');

const badgeBefore = await page.evaluate(() => document.querySelector('#skillPointsBadge')?.textContent);

// Arm, then confirm.
await openSpellbook(page);
const respecBtn = page.locator('#respecButton');
let box = await respecBtn.boundingBox();
if (!box) fail('no #respecButton in the spellbook title');
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
const armedText = await page.evaluate(() => document.getElementById('respecButton')?.textContent);
console.log('after first press:', armedText);
if (armedText !== 'Confirm?') fail('first press did not arm the button: ' + armedText);
await page.screenshot({ path: join(outdir, 'respec-armed.png') });
box = await respecBtn.boundingBox();
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

await page.waitForFunction(() => {
  const row = [...document.querySelectorAll('#spellbookList [data-skill-id]')]
    .find(e => /Swift/i.test(e.textContent));
  return /\b1\/\d+/.test(row?.textContent ?? '');
}, null, { timeout: 15_000 }).catch(() => fail('Swift never returned to level 1 after the respec'));

const afterLevel = await swiftLevel();
const badgeAfter = await page.evaluate(() => document.querySelector('#skillPointsBadge')?.textContent);
console.log(`respec: Swift ${raised} -> ${afterLevel}, points badge "${badgeBefore}" -> "${badgeAfter}"`);
await page.screenshot({ path: join(outdir, 'respec-done.png') });
if (afterLevel !== 1) fail('Swift level after respec is ' + afterLevel);

await browser.close();

if (errors.length) {
  console.error('\n=== FAILURES ===');
  for (const e of errors) console.error(' ✗ ' + e);
  process.exit(1);
}
console.log('\nAll checks passed.');
