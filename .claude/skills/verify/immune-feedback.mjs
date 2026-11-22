#!/usr/bin/env node
// "Never targets what it can never hurt" (plan-vertical-slice.md R23, F40) and
// what is left of the "Immune" label (plan-immune-feedback.md): a TEMPORARY
// immunity is still targeted and still says so (plan-immune-targets.md D2).
//
// DEBUG world. Three legs:
//   1. alone at the Bramble wall ({"*": 0}, gateKeys chop) with Damage on:
//      empty ground. No strike, no "Immune", no number, no combat.
//   2. the CONTROL at the same spot with Hatchet: strike, number, combat. Leg 1
//      only counts when this passes: absence passes on a dead venue too.
//   3. OmniStrike's 3 s self-immunity inside a Poison Pool: grey "Immune" on
//      the own character (GOD off, which is what makes the label possible).
//
// ⚑ The wall (-68.7..-65.1, -4.8) is approached from its SOUTH side: a wolf
//   spawns 3.9 u north of it, and its fight would fail leg 1's oracles.
// ⚑ Loadout first: combat locks it.
// ⚑ Slot keys are rAF-sampled: long holds (verify skill).
// Tri-state: venue and input failures are INCONCLUSIVE, not red.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { joinAsNewCharacter } from './lib/join.mjs';
import { closeSpellbook, showSkillRowAt } from './lib/spellbook.mjs';
import { botName } from './botname.mjs';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');

const url = process.argv[2] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const outdir = process.argv[3] || '/tmp/immune-feedback-shots';
mkdirSync(outdir, { recursive: true });

const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = {
  ...process.env,
  LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':'),
};

const WALL = [[-68.7, -4.8], [-67.5, -4.8], [-66.3, -4.8], [-65.1, -4.8]];
const STAND = { x: -67.5, y: -6.1 };
const SAFE = { x: 7.8, y: -22.5 };
const POOL = { x: 7.8, y: -26.4 }; // PoisonPool, ticks every 20

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const page = await (await browser.newContext({ locale: 'en-US', viewport: { width: 1600, height: 900 } })).newPage();
const errors = [];
const results = [];
// pass: true, false, or null = INCONCLUSIVE
const check = (name, pass, detail) => results.push({ name, pass, detail });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !/favicon/i.test(m.text())) errors.push('console: ' + m.text()); });

await page.goto(url, { waitUntil: 'domcontentloaded' });
await joinAsNewCharacter(page, botName('immune'));
await page.waitForFunction(() => !!window.game?.character, null, { timeout: 60_000 });
await page.waitForSelector('#console_command', { state: 'attached' });
await page.evaluate(() => {
  const panel = document.getElementById('developPanel');
  if (panel) panel.style.display = 'none';
  // Cache the scene root while alive (verify skill: a dead player nulls it).
  let root = window.game.character.plate.parent;
  while (root.parent) root = root.parent;
  window.__auraRoot = root;
});

async function cmd(command, wait = 500) {
  await page.evaluate((c) => {
    document.querySelector('#console_command').value = c;
    document.querySelector('#console').dispatchEvent(new Event('submit', { cancelable: true }));
  }, command);
  if (wait) await page.waitForTimeout(wait);
}
const warp = (p, wait) => cmd(`WARP ${Math.round(p.x * 120)} ${Math.round(p.y * 120)}`, wait);
const at = (p) => page.waitForFunction(({ x, y }) => {
  const c = window.game.character;
  return c && Math.hypot(c.getX() / 120 - x, c.getY() / 120 - y) < 0.8;
}, p, { timeout: 20_000 }).then(() => true).catch(() => false);

async function equip(name, list, slot) {
  const row = await page.waitForFunction((n) => {
    const i = [...document.querySelectorAll('#spellbookList li')].findIndex((li) => li.textContent.includes(n));
    return i >= 0 ? { i } : null;
  }, name, { timeout: 20_000, polling: 500 }).then((h) => h.jsonValue()).catch(() => null);
  if (!row || !(await showSkillRowAt(page, row.i))) return false;
  const box = await (await page.$$('#spellbookList li'))[row.i].boundingBox();
  await page.mouse.click(box.x + 25, box.y + box.height / 2);
  await page.waitForTimeout(700);
  const target = `#${list} li[data-slot="${slot}"]`;
  const slotBox = await page.locator(target).first().boundingBox().catch(() => null);
  if (!slotBox) return false;
  await page.mouse.click(slotBox.x + slotBox.width / 2, slotBox.y + slotBox.height / 2);
  await closeSpellbook(page);
  return page.waitForFunction(({ target, name }) =>
    document.querySelector(`${target} .slotLabel`)?.textContent?.includes(name), { target, name }, { timeout: 15_000 })
    .then(() => true).catch(() => false);
}

async function auraOn(key, slot) {
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.down(key);
    await page.waitForTimeout(1400);
    await page.keyboard.up(key);
    const on = await page.waitForSelector(`#auraSlotList li[data-slot="${slot}"].activeSlot`, { timeout: 6_000 })
      .then(() => true).catch(() => false);
    if (on) return true;
  }
  return false;
}

// One synchronous walk per sample: label, fill, number, position, combat.
const watch = (ms) => page.evaluate(({ ms, wall }) => new Promise((resolve) => {
  const hex = (f) => (typeof f === 'string' ? parseInt(f.replace('#', ''), 16) : f);
  const strikes = () => window.game.skillFx().spawnedByKind.strike ?? 0;
  const before = strikes();
  const seen = new WeakSet();
  const out = { immune: 0, grey: 0, numbers: 0, combat: false, strikes: 0 };
  const visit = (node) => {
    if (node.text !== undefined && !seen.has(node)) {
      const t = String(node.text);
      const x = node.position.x / 120, y = node.position.y / 120;
      if (t === 'Immune') {
        seen.add(node);
        out.immune++;
        if (hex(node.style?.fill) === 0xB0B0B0) out.grey++;
      } else if (/^-\d+$/.test(t) && wall.some(([bx, by]) => Math.abs(x - bx) < 0.3 && by - y > 0 && by - y < 1.5)) {
        // Scoped OVER a bramble: mobs fight each other elsewhere in view.
        seen.add(node);
        out.numbers++;
      }
    }
    (node.children ?? []).forEach(visit);
  };
  const t0 = Date.now();
  const poll = () => {
    visit(window.__auraRoot);
    out.combat ||= document.getElementById('combatIndicator')?.classList.contains('hidden') === false;
    if (Date.now() - t0 > ms) {
      out.strikes = strikes() - before;
      return resolve(out);
    }
    setTimeout(poll, 120);
  };
  poll();
}), { ms, wall: WALL });

await cmd('PING'); // the first command after joining is dropped
await cmd('GOD on');
await cmd('SKILL Hatchet', 1000);
await cmd('SKILL OmniStrike', 1000);
const hatchet = await equip('Hatchet', 'auraSlotList', 1);
const omni = await equip('Omni', 'cooldownSlotList', 0);

await warp(STAND);
const atWall = await at(STAND);
const damageOn = atWall && await auraOn('1', 0);
const alone = damageOn ? await watch(8_000) : null;
await page.screenshot({ path: join(outdir, 'immune-wall.png') });

const hatchetOn = damageOn && hatchet && await auraOn('2', 1);
const control = hatchetOn ? await watch(6_000) : null;
await page.screenshot({ path: join(outdir, 'immune-control.png') });

const controlled = !!control && control.numbers > 0 && control.strikes > 0 && control.combat;
check('2 the control: Hatchet strikes the same wall, with a number and combat', control ? controlled : null, JSON.stringify(control));
const LEG1 = '1 alone at the wall is empty ground: no strike, label, number or combat';
check(LEG1, controlled ? (alone.strikes === 0 && alone.immune === 0 && alone.numbers === 0 && !alone.combat) : null,
  `${JSON.stringify(alone)}${controlled ? '' : ' (INCONCLUSIVE without the control)'}`);

const LEG3 = '3 a temporary immunity is still targeted and says "Immune", in grey';
let temporary = null;
if (omni) {
  await cmd('XP 5000'); // a level-1 pool dies in the pool
  await warp(SAFE, 1500);
  await cmd('GOD off');
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down('q');
  const fired = await page.waitForFunction(() =>
    /\d+(\.\d+)?s/.test(document.querySelector('#cooldownSlotList li[data-slot="0"]')?.textContent || ''),
  null, { timeout: 8_000, polling: 100 }).then(() => true).catch(() => false);
  await page.keyboard.up('q');
  if (fired) {
    await warp(POOL, 0);
    temporary = await watch(4_000);
    await page.screenshot({ path: join(outdir, 'immune-label.png') });
  }
  await cmd('GOD on');
}
check(LEG3, temporary ? (temporary.immune > 0 && temporary.grey > 0) : null, JSON.stringify(temporary));

await browser.close();
check('0 no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
for (const r of results) console.log(`${r.pass === true ? 'PASS' : r.pass === null ? 'INCONCLUSIVE' : 'FAIL'}  ${r.name}: ${r.detail}`);
const failed = results.some(r => r.pass === false);
console.log(`\nRESULT: ${failed ? 'FAIL' : results.some(r => r.pass === null) ? 'INCONCLUSIVE' : 'PASS'}`);
process.exitCode = failed ? 1 : 0;
