#!/usr/bin/env node
// N1 (plan-feel-pass-2.md §5) — the Focus bar tells the truth about shields.
//
// The bar's denominator is now total effective HP (shieldBarSegments:
// max(maxHealth, health + shield)), so a shield LARGER than the pool no
// longer paints the whole bar shield-colored. The vitest pins cover the split
// maths; this covers the wiring no unit test can see — a level-30 Warbanner
// shield (~214 = shieldHP 8 × powerScale 26.75) actually landing on a
// level-1 target's 100-point pool in a live world, and both of that target's
// bars (HUD + overhead) rendering ~1/3 Focus / ~2/3 shield.
//
//   1. the caster reaches CL30 and Warbanner lights as the active aura
//   2. the reported case: the level-1 ally's HUD bar splits — shield width
//      < 100% (old code clamped to exactly 100%), health segment visible
//      (old code: left = 0), segments sum to the full bar (full health +
//      overflow makes the sum exactly 1 by construction)
//   3. the ally's OVERHEAD bar agrees (the Character path of the same shared
//      maths): fills sum <= 1, shield anchored at the end of the health fill
//   4. the caster's own bar stays sane under its smaller relative shield
//
// ⚑ Leg 2 guards its own premise: it reads the ally's Focus text and derives
// the implied shield from the segment ratio — if the shield did not exceed
// the pool, the run proves nothing about the overflow case and says
// INCONCLUSIVE instead of green.
// ⚑ Boundary: this harness owns the health/shield bar SPLIT. Shield gameplay
// (who gets shielded, sustain cost) belongs to no harness yet; the tooltip's
// cost lines belong to r1-focus-cost.
//
// Usage: node .claude/skills/verify/n1-shield-bar.mjs [label] [url]
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { joinAsNewCharacter } from './lib/join.mjs';
import { showSkillRowAt } from './lib/spellbook.mjs';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');

const label = process.argv[2] || 'run';
const url = process.argv[3] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

// The most open whole-unit tile in world.json (swift-cooldown's venue), 7.23
// units of clearance. Warbanner's radius is 1.2, so the ally stands 1 unit off.
const CASTER = { x: -23, y: 14 };
const ALLY = { x: -22, y: 14 };
const wire = (p) => `${Math.round(p.x * 120)} ${Math.round(p.y * 120)}`;

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const consoleErrors = [];
const ctxLosses = [];
const results = [];
const check = (name, pass, detail) => results.push({ check: name, pass, detail });

// Joins through the account screens (lib/join.mjs) — the old #startForm name
// field died with step 8a chunk 2, and this script rotted at the join until
// the code-health C5 re-run caught it.
const newPlayer = async (tag) => {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(`[${tag}] ` + m.text());
    if (/webgl.*context lost/i.test(m.text())) ctxLosses.push(tag);
  });
  page.on('pageerror', (e) => consoleErrors.push(`[${tag}] pageerror: ` + e.message));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await joinAsNewCharacter(page, tag);
  await page.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
  await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
  await page.evaluate(() => { const p = document.getElementById('developPanel'); if (p) p.style.display = 'none'; });
  return page;
};

const cmd = async (page, text) => {
  await page.evaluate((t) => {
    const input = document.getElementById('console_command');
    input.value = t;
    document.getElementById('console').dispatchEvent(new Event('submit', { cancelable: true }));
  }, text);
  await page.waitForTimeout(700);
};

// Equip a spellbook skill into an aura slot and toggle it on — the
// backlog33-prehot worked example, all its landmine notes apply (fresh slot,
// .slotLabel not the li, bringToFront + interval polling on a multi-client run).
const equipAndActivateAura = async (page, skillRe, slotIndex = 0) => {
  await page.bringToFront();
  const rowAppeared = await page.waitForFunction(
    (re) => [...document.querySelectorAll('#spellbookList li')].some((li) => new RegExp(re, 'i').test(li.textContent)),
    skillRe.source, { timeout: 20_000, polling: 500 }).catch(() => null);
  if (!rowAppeared) return { ok: false, why: `no spellbook row matches ${skillRe}` };
  const rowIndex = await page.evaluate((re) =>
    [...document.querySelectorAll('#spellbookList li')].findIndex((li) => new RegExp(re, 'i').test(li.textContent)),
    skillRe.source);
  await showSkillRowAt(page, rowIndex); // the book is a closable, paged panel since UI pass C3
  const rows = await page.$$('#spellbookList li');
  const box = await rows[rowIndex].boundingBox();
  await page.mouse.click(box.x + 25, box.y + box.height / 2);
  await page.waitForTimeout(700);
  if (!await page.evaluate(() => !!document.querySelector('#spellbookList li.selected')))
    return { ok: false, why: 'clicking the name did not select it' };

  const sel = `#auraSlotList li[data-slot="${slotIndex}"]`;
  const labelSel = `${sel} .slotLabel`;
  const slot = await page.$(sel);
  const sbox = await slot.boundingBox();
  await page.mouse.click(sbox.x + sbox.width / 2, sbox.y + sbox.height / 2); // equip

  const equipped = await page.waitForFunction(
    ({ re, s }) => new RegExp(re, 'i').test(document.querySelector(s)?.textContent || ''),
    { re: skillRe.source, s: labelSel }, { timeout: 20_000, polling: 500 }).catch(() => null);
  if (!equipped) {
    const dump = await page.evaluate(() =>
      document.querySelector('#auraSlotList')?.textContent?.trim().replace(/\s+/g, ' '));
    return { ok: false, why: `slot ${slotIndex} never showed the skill — slots=${JSON.stringify(dump)}` };
  }

  for (let i = 0; i < 5; i++) {
    await page.mouse.click(sbox.x + sbox.width / 2, sbox.y + sbox.height / 2); // activate
    await page.waitForTimeout(1200);
    if (await page.evaluate((s) => !!document.querySelector(s)?.classList.contains('activeSlot'), sel))
      return { ok: true, why: `slot ${slotIndex} active (attempt ${i + 1})` };
  }
  return { ok: false, why: `slot ${slotIndex} never lit as active after 5 attempts` };
};

// One atomic sample of both bars on a page (one page.evaluate — the world
// moves between round trips). TS `private` is compile-time only, so the
// overhead bar's fill groups are readable off window.game.character — since
// code-health C5 they live on the extracted `overheadBar` component.
const sampleBars = (page) => page.evaluate(() => {
  const el = document.querySelector('#healthBar .shieldIndicator');
  const t = document.querySelector('#healthBar .barText')?.textContent || '';
  const m = t.match(/(\d+)\s*\/\s*(\d+)/);
  const ch = window.game.character;
  const ob = ch?.overheadBar;
  return {
    display: el?.style.display ?? 'missing',
    left: parseFloat(el?.style.left) || 0,
    width: parseFloat(el?.style.width) || 0,
    cur: m ? +m[1] : null,
    max: m ? +m[2] : null,
    level: ch?.levelElement?.text ?? null,
    overhead: ob ? {
      healthScale: ob.healthFillGroup?.scale.x,
      shieldScale: ob.shieldFillGroup?.scale.x,
      shieldVisible: ob.shieldFillGroup?.visible,
      shieldX: ob.shieldFillGroup?.position.x,
      barInnerX: ob.barInnerX,
      barInnerWidth: ob.barInnerWidth,
    } : null,
  };
});

const caster = await newPlayer('caster');
const ally = await newPlayer('ally');

for (const p of [caster, ally]) await cmd(p, 'GOD');
await cmd(caster, 'XP 99999999');
await cmd(caster, 'WARP ' + wire(CASTER));
await cmd(ally, 'WARP ' + wire(ALLY));
await cmd(caster, 'SKILL Warbanner');

// --- 1. the caster is level 30 and Warbanner is on ---
const wb = await equipAndActivateAura(caster, /Warbanner/);
const casterLevel = await caster.evaluate(() => window.game.character?.levelElement?.text ?? null);
check('CL30 caster with Warbanner as the active aura', wb.ok && casterLevel === '30',
  `${wb.why}; caster level ${casterLevel}`);

// Shield ticks land every 40 ticks (~1.33 s); give it a few beats.
await caster.waitForTimeout(6_000);

// --- 2. the reported case: the ally's HUD bar splits ---
await ally.bringToFront();
await ally.waitForFunction(
  () => document.querySelector('#healthBar .shieldIndicator')?.style.display === 'block',
  null, { timeout: 20_000, polling: 500 }).catch(() => null);
const a = await sampleBars(ally);
const impliedShield = a.left > 0 && a.cur ? (a.width / a.left) * a.cur : 0;

if (a.display !== 'block') {
  check('Oversized shield splits the HUD bar (the reported case)', false,
    `INCONCLUSIVE — no shield ever landed on the ally (indicator ${a.display}); setup failure, not a split failure. Re-run.`);
} else if (a.cur !== a.max || impliedShield <= a.max) {
  check('Oversized shield splits the HUD bar (the reported case)', false,
    `INCONCLUSIVE — premise not met: Focus ${a.cur}/${a.max}, implied shield ${impliedShield.toFixed(0)} ` +
    `(needs full health and shield > pool to discriminate; old code only misrendered the overflow case). Re-run.`);
} else {
  const pass = a.width < 99.5 && a.left > 0.5 && Math.abs(a.left + a.width - 100) <= 1;
  check('Oversized shield splits the HUD bar (the reported case)', pass,
    `Focus ${a.cur}/${a.max} + implied shield ${impliedShield.toFixed(0)}: health ${a.left.toFixed(1)}% ` +
    `+ shield ${a.width.toFixed(1)}% (old code: 0% + 100%)`);
}

// --- 3. the overhead bar agrees (Character path of the shared maths) ---
const o = a.overhead;
if (!o || !(o.shieldScale > 0)) {
  check('Overhead bar splits with the same maths', false,
    `INCONCLUSIVE — overhead shield fill not readable/visible: ${JSON.stringify(o)}`);
} else {
  const sum = o.healthScale + o.shieldScale;
  const anchor = o.barInnerX + o.healthScale * o.barInnerWidth;
  const pass = o.shieldVisible === true && sum <= 1.001
    && Math.abs(o.healthScale - a.left / 100) <= 0.02
    && Math.abs(o.shieldScale - a.width / 100) <= 0.02
    && Math.abs(o.shieldX - anchor) <= 1;
  check('Overhead bar splits with the same maths', pass,
    `health ${o.healthScale?.toFixed(3)} + shield ${o.shieldScale?.toFixed(3)} (sum ${sum.toFixed(3)}), ` +
    `shield anchored at ${o.shieldX?.toFixed(1)} vs expected ${anchor.toFixed(1)}`);
}

// --- 4. the caster's own bar stays sane ---
await caster.bringToFront();
await caster.waitForTimeout(1_500);
const c = await sampleBars(caster);
if (c.display !== 'block') {
  check("Caster's own bar stays sane under its self-shield", false,
    `INCONCLUSIVE — caster shows no shield indicator (${c.display})`);
} else {
  const pass = c.width < 99.5 && c.left > 0.5 && c.left + c.width <= 101;
  check("Caster's own bar stays sane under its self-shield", pass,
    `Focus ${c.cur}/${c.max}: health ${c.left.toFixed(1)}% + shield ${c.width.toFixed(1)}%`);
}

const passed = results.filter((r) => r.pass).length;
console.log(`label : ${label}`);
for (const r of results) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.check}\n        ${r.detail}`);
}
console.log(`\npassed : ${passed}/${results.length}`);
console.log(`webgl ctx losses : ${ctxLosses.length}`);
console.log(`console errors   : ${consoleErrors.length}`);
for (const e of consoleErrors.slice(0, 6)) console.log('   · ' + e);

await browser.close();
process.exit(passed === results.length && ctxLosses.length === 0 ? 0 : 1);
