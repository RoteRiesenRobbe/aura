#!/usr/bin/env node
// R1 (plan-resource-costs-feedback §6): what a cost SAYS.
//
// The chunk is presentation, so the acceptance test is a real tooltip in a real
// client. Five legs, each pinning one of the PO's feel-pass items:
//
//   F6  a cost renders in ABSOLUTE Focus, not a percentage,
//   F6  and that number is computed from the LIVE pool (it moves with level),
//   F2  the cost-reduction passive is visible — equipping Discipline lowers it,
//   F7  the resource is named on the bar it drains,
//   F3  the spellbook row keeps the +/− buttons out from under the scrollbar.
//
// ⚑ Boundary: everything INSIDE the tooltip's number formatting belongs to
// SkillTooltip.test.ts (vitest, exhaustive). This script only proves the wiring
// the unit tests cannot see — that the live pool and the live cost factor reach
// the formatter at all.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');

const url = process.argv[2] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const outdir = process.argv[3] || '/tmp/r1-shots';
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
await page.waitForSelector('#startForm .playerNameSubmit:not([disabled])', { timeout: 30_000 });
await page.fill('#startForm .playerNameInput', 'R1FocusProbe');
await page.click('#startForm .playerNameSubmit');
await page.waitForFunction(() => !!window.game?.character, null, { timeout: 30_000 });
// The dev panel covers the right-hand HUD, which is where the spellbook lives.
await page.evaluate(() => {
  const panel = document.getElementById('developPanel');
  if (panel) panel.style.display = 'none';
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

await runCommand('GOD');
await runCommand('SKILL Immolate');
await runCommand('SKILL Discipline');
// The spellbook row for a just-cheated skill renders seconds late (GameState on
// the throttled rAF loop) — wait for it rather than sleeping.
await page.waitForFunction(
  () => [...document.querySelectorAll('#spellbookList [data-skill-id]')]
    .some(e => /Immolate/i.test(e.textContent)),
  null, { timeout: 20_000 });

const spellbook = await page.evaluate(() =>
  [...document.querySelectorAll('#spellbookList [data-skill-id]')]
    .map(e => ({ id: e.dataset.skillId, name: e.querySelector('.skillName')?.textContent?.trim() ?? e.textContent.trim() })));
console.log('spellbook:', JSON.stringify(spellbook));
const immolateId = (spellbook.find(e => /Immolate/i.test(e.name)) || {}).id;
const disciplineId = (spellbook.find(e => /Discipline/i.test(e.name)) || {}).id;
if (!immolateId) fail('Immolate not in the spellbook');
if (!disciplineId) fail('Discipline not in the spellbook');

// ⚑ The screenshot is taken WHILE hovering, before the tooltip is dropped —
// the point of a presentation chunk's shot is the tooltip, and moving the mouse
// away first yields a perfectly plausible frame with nothing in it.
async function costLine(skillId, shot) {
  const entry = page.locator(`#spellbookList [data-skill-id="${skillId}"]`).first();
  await entry.scrollIntoViewIfNeeded();
  await entry.hover();
  await page.waitForTimeout(400);
  const text = await page.evaluate(() => {
    const tip = document.querySelector('#skillTooltip');
    if (!tip || tip.classList.contains('hidden')) return null;
    return [...tip.children].map(c => c.textContent).join(' | ');
  });
  if (shot) await page.screenshot({ path: join(outdir, shot) });
  await page.mouse.move(10, 10);   // drop the tooltip so the next hover re-renders
  return text;
}

// --- leg 1: the cost is absolute Focus, not a percentage --------------------
const atLevel1 = immolateId ? await costLine(immolateId, 'tooltip-cl1.png') : null;
console.log('Immolate @ CL1:', atLevel1);
if (!atLevel1) fail('no tooltip rendered on hover');

// The line carries a next-level preview ("7 → 9"), and BOTH endpoints are real
// prices — reading only the first would have scored a working cost reduction as
// invisible, because at this pool the floor rounds the level-1 price back up.
const costOf = (text) => {
  const m = (text || '').match(/Costs you: (\d+)(?: → (\d+))? Focus/);
  if (!m) return null;
  return m[2] === undefined ? [Number(m[1])] : [Number(m[1]), Number(m[2])];
};
const cheaper = (a, b) => a.some((v, i) => b[i] < v) && a.every((v, i) => b[i] <= v);
const dearer = (a, b) => a.some((v, i) => b[i] > v) && a.every((v, i) => b[i] >= v);
const cl1Cost = costOf(atLevel1);
if (cl1Cost === null) {
  fail('cost line is not absolute Focus: ' + (atLevel1 || '(no tooltip)'));
}
if (/Costs you:[^|]*%/.test(atLevel1 || '')) {
  fail('cost line still renders a percentage: ' + atLevel1);
}
// The floor: Immolate authors 0.26 % and a level-1 pool is ~100, so what is
// actually taken is 1 point — the number the percentage could never say.
if (cl1Cost !== null && Math.min(...cl1Cost) < 1) {
  fail('a priced effect printed a free cost: ' + cl1Cost);
}

// --- leg 2: the resource is named on the bar it drains (F7) -----------------
const barText = await page.evaluate(() => document.querySelector('#healthBar .barText')?.textContent);
console.log('health bar text:', JSON.stringify(barText));
if (!/^Focus \d+\/\d+$/.test(barText || '')) {
  fail('health bar does not name the resource: ' + JSON.stringify(barText));
}

// --- leg 3: the spellbook row clears the scrollbar (F3) ---------------------
const rowGeometry = await page.evaluate(() => {
  // Skip the section headers — only skill rows carry the spend buttons.
  const li = document.querySelector('#spellbookList > li[data-skill-id]');
  const btn = li?.querySelector('.spendBtn');
  if (!li || !btn) return null;
  return {
    paddingRight: getComputedStyle(li).paddingRight,
    gap: li.getBoundingClientRect().right - btn.getBoundingClientRect().right,
  };
});
console.log('spellbook row:', JSON.stringify(rowGeometry));
if (!rowGeometry) {
  fail('no spellbook row/spend button to measure');
} else if (parseFloat(rowGeometry.paddingRight) <= 0 || rowGeometry.gap < 8) {
  // SimpleBar's overlay track is ~11 px wide; the +/− buttons must sit clear of
  // it. Measured flush at 0 before R1.
  fail('the spend button still sits under the scrollbar: ' + JSON.stringify(rowGeometry));
}

// --- leg 4: the cost is computed from the LIVE pool (F6) --------------------
await runCommand('XP 99999999');
await page.waitForTimeout(1500);
const level = await page.evaluate(() => Number(window.game?.character?.levelElement?.text));
console.log('character level now:', level);
if (level !== 30) fail('XP cheat did not reach the level cap, got ' + level);

const atLevel30 = immolateId ? await costLine(immolateId, 'tooltip-cl30.png') : null;
console.log('Immolate @ CL30:', atLevel30);
const cl30Cost = costOf(atLevel30);
if (cl30Cost === null) {
  fail('cost line unreadable at level 30: ' + (atLevel30 || '(no tooltip)'));
} else if (cl1Cost !== null && !dearer(cl1Cost, cl30Cost)) {
  // Same authored fraction, a ~26× larger pool: an absolute cost MUST grow.
  // Equal numbers would mean the pool never reached the formatter.
  fail(`cost did not follow the pool: ${cl1Cost} → ${cl30Cost}`);
}

// --- leg 5: Discipline is visible in the price (F2) -------------------------
// Equip it into a passive slot: click the skill NAME (a centre click hits the
// spend buttons), assert the selection, then click the slot.
if (disciplineId) {
  const row = page.locator(`#spellbookList [data-skill-id="${disciplineId}"]`).first();
  await row.scrollIntoViewIfNeeded();
  const box = await row.boundingBox();
  await page.mouse.click(box.x + 25, box.y + box.height / 2);
  await page.waitForSelector('#spellbookList li.selected', { timeout: 5_000 }).catch(() => {});
  const slot = page.locator('#passiveSlotList .passiveSlot[data-slot="0"]').first();
  const slotBox = await slot.boundingBox();
  await page.mouse.click(slotBox.x + slotBox.width / 2, slotBox.y + slotBox.height / 2);
  // A passive slot renders its skill name as bare textContent (no .slotLabel).
  await page.waitForFunction(
    () => /Discipline/i.test(document.querySelector('#passiveSlotList .passiveSlot[data-slot="0"]')?.textContent ?? ''),
    null, { timeout: 15_000 }).catch(() => fail('Discipline never landed in the passive slot'));
}

const withDiscipline = immolateId ? await costLine(immolateId, 'tooltip-discipline.png') : null;
console.log('Immolate @ CL30 with Discipline:', withDiscipline);
const reducedCost = costOf(withDiscipline);
if (reducedCost === null) {
  fail('cost line unreadable with Discipline equipped');
} else if (cl30Cost !== null && !cheaper(cl30Cost, reducedCost)) {
  fail(`the cost-reduction passive is STILL invisible: ${cl30Cost} → ${reducedCost}`);
} else {
  console.log(`cost reduction visible: ${cl30Cost} → ${reducedCost} Focus`);
}

await browser.close();

if (errors.length) {
  console.error('\n=== FAILURES ===');
  for (const e of errors) console.error(' ✗ ' + e);
  process.exit(1);
}
console.log('\nAll checks passed.');
