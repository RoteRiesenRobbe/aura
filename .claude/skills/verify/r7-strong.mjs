#!/usr/bin/env node
// Round-7 item 5 (plan-playtest-feedback §Intake round 7): Strong is visible.
//
// The passive always worked server-side (casterDamageFactor at the damage
// base-composition sites); the defect was that no UI surface folded the
// multiplier in — the same worked-but-invisible class as Discipline before R1.
// The fix is GameState.damage_factor + the tooltip multiplying its damage
// lines through it.
//
// ⚑ Boundary: everything INSIDE the tooltip's number formatting belongs to
// SkillTooltip.test.ts (vitest, exhaustive — including that heals and shields
// do NOT ride the factor). This script only proves the wiring the unit tests
// cannot see — that the live damage factor reaches the formatter at all. A
// HUD that never pushed it would leave all vitest green with the feature dead
// on screen, which is exactly how the r1-focus-cost leg earned its keep.
//
// Legs:
//   1. baseline — the seeded Damage aura's tooltip line, no passive equipped,
//   2. equip Strong (SKILL cheat + the Discipline click choreography),
//   3. the same line must GROW — both preview endpoints, not just the first
//      (the 66646743 lesson: a text assert reading one endpoint scores a
//      working passive as invisible).
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { botName } from './botname.mjs';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');

const url = process.argv[2] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const outdir = process.argv[3] || '/tmp/r7-strong-shots';
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
await page.fill('#startForm .playerNameInput', botName('strong'));
await page.click('#startForm .playerNameSubmit');
await page.waitForFunction(() => !!window.game?.character, null, { timeout: 30_000 });
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
// Damage is the creation-seeded milestone — wait for its spellbook row rather
// than sleeping (GameState rides the throttled rAF loop).
await page.waitForFunction(
  () => [...document.querySelectorAll('#spellbookList [data-skill-id]')]
    .some(e => /Damage/i.test(e.textContent)),
  null, { timeout: 20_000 });

const spellbook = await page.evaluate(() =>
  [...document.querySelectorAll('#spellbookList [data-skill-id]')]
    .map(e => ({ id: e.dataset.skillId, name: e.querySelector('.skillName')?.textContent?.trim() ?? e.textContent.trim() })));
const damageId = (spellbook.find(e => /^Damage/i.test(e.name)) || {}).id;
if (!damageId) fail('the seeded Damage aura is not in the spellbook');

async function tooltipText(skillId, shot) {
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
  await page.mouse.move(10, 10);
  return text;
}

// Both preview endpoints are real numbers; compare them all.
const damageOf = (text) => {
  const m = (text || '').match(/Damage: (\d+)(?: → (\d+))?/);
  if (!m) return null;
  return m[2] === undefined ? [Number(m[1])] : [Number(m[1]), Number(m[2])];
};
const grew = (a, b) => a.length === b.length && a.some((v, i) => b[i] > v) && a.every((v, i) => b[i] >= v);

// --- leg 1: baseline, no passive ------------------------------------------
const baseline = damageId ? await tooltipText(damageId, 'damage-baseline.png') : null;
console.log('Damage tooltip, no passive:', baseline);
const baseDamage = damageOf(baseline);
if (baseDamage === null) fail('no Damage line in the baseline tooltip: ' + (baseline || '(no tooltip)'));

// --- leg 2: equip Strong ----------------------------------------------------
await runCommand('SKILL Strong');
await page.waitForFunction(
  () => [...document.querySelectorAll('#spellbookList [data-skill-id]')]
    .some(e => /Strong/i.test(e.textContent)),
  null, { timeout: 20_000 });
const strongId = await page.evaluate(() =>
  [...document.querySelectorAll('#spellbookList [data-skill-id]')]
    .find(e => /Strong/i.test(e.textContent))?.dataset.skillId);
if (!strongId) fail('Strong not in the spellbook after the cheat');

if (strongId) {
  const row = page.locator(`#spellbookList [data-skill-id="${strongId}"]`).first();
  await row.scrollIntoViewIfNeeded();
  const box = await row.boundingBox();
  await page.mouse.click(box.x + 25, box.y + box.height / 2);
  await page.waitForSelector('#spellbookList li.selected', { timeout: 5_000 }).catch(() => {});
  const slot = page.locator('#passiveSlotList .passiveSlot[data-slot="0"]').first();
  const slotBox = await slot.boundingBox();
  await page.mouse.click(slotBox.x + slotBox.width / 2, slotBox.y + slotBox.height / 2);
  await page.waitForFunction(
    () => /Strong/i.test(document.querySelector('#passiveSlotList .passiveSlot[data-slot="0"]')?.textContent ?? ''),
    null, { timeout: 15_000 }).catch(() => fail('Strong never landed in the passive slot'));
}

// --- leg 3: the damage line moved -------------------------------------------
const withStrong = damageId ? await tooltipText(damageId, 'damage-strong.png') : null;
console.log('Damage tooltip with Strong:', withStrong);
const strongDamage = damageOf(withStrong);
if (strongDamage === null) {
  fail('Damage line unreadable with Strong equipped');
} else if (baseDamage !== null && !grew(baseDamage, strongDamage)) {
  fail(`the damage passive is STILL invisible: ${baseDamage} → ${strongDamage}`);
} else {
  console.log(`damage bonus visible: ${baseDamage} → ${strongDamage}`);
}

await browser.close();

if (errors.length) {
  console.error('\n=== FAILURES ===');
  for (const e of errors) console.error(' ✗ ' + e);
  process.exit(1);
}
console.log('\nAll checks passed.');
