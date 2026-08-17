#!/usr/bin/env node
// backlog §33 — hot_aura can pre-hot (PO ruling 2026-07-31, option 1).
//
// The gate `HealthRatio() < 1` was dropped from applyHotAura and KEPT on
// applyHealAura. The Go pins cover the applier in isolation; this covers the
// thing no unit test can see — that a healer standing next to an UNHURT ally
// actually puts the buff on them in a live world, and that the direct-heal
// aura still refuses the same target.
//
//   1. Rejuvenation equips as an active aura and lights
//   2. an ally at FULL health receives the HoT — the pip lights (the ruling)
//   3. the control (no healer in range) shows no pip — proves the pip is the
//      healer's doing and not an artefact of standing there
//   4. Heal (heal_aura) on the same full-health ally lights NO pip — the
//      wounded-only gate survives where it is load-bearing (§33's split)
//
// ⚑ Why the pip and not the HP bar: a HoT on a full-HP ally is INERT by design
// (tickHotEvents drops any tick healing <= 0 before XP, threat and combat
// entry), so there is no HP movement to measure. The applied-effect pip is the
// only observable, which is exactly the point of the ruling — the buff is
// PLACED, ready for the damage that has not arrived yet.
//
// ⚑ The pip signal is DRAWN INSTRUCTIONS, not `visible`: EffectPips
// early-returns when the mask is unchanged, so a never-pipped Graphics keeps
// its constructed visible=true with nothing in it (2026-07-29, chunk3-charm).
//
// ⚑ Both players run GOD so nothing wanders in and wounds the ally mid-run —
// a wounded ally would pass leg 2 under the OLD behaviour too, which would
// make this harness prove nothing. Leg 2 asserts the ally is at ratio 1.0 at
// the moment the pip is read, and reports INCONCLUSIVE if it is not.
//
// Usage: node .claude/skills/verify/backlog33-prehot.mjs [label] [url]
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { joinAsNewCharacter } from './lib/join.mjs';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');

const label = process.argv[2] || 'run';
const url = process.argv[3] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

// The most open whole-unit tile in world.json (swift-cooldown's venue): 7.23
// units of clearance, so nothing blocks and nothing wanders in. Rejuvenation's
// radius is 2.5 at L1, so the ally stands 1 unit away — comfortably inside —
// and the control sits 12 units off, outside every aura in play.
const HEALER = { x: -23, y: 14 };
const ALLY = { x: -22, y: 14 };
const CONTROL = { x: -23, y: 26 };
const wire = (p) => `${Math.round(p.x * 120)} ${Math.round(p.y * 120)}`;

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const consoleErrors = [];
const ctxLosses = [];
const results = [];
const check = (name, pass, detail) => results.push({ check: name, pass, detail });

const newPlayer = async (name) => {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(`[${name}] ` + m.text());
    if (/webgl.*context lost/i.test(m.text())) ctxLosses.push(name);
  });
  page.on('pageerror', (e) => consoleErrors.push(`[${name}] pageerror: ` + e.message));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  // The account screens replaced #startForm (step 8a chunk 2); joins go
  // through lib/join.mjs since 2026-08-17 (this script was red at join before).
  // `name` is a tag here; join.mjs mints the actual hrnss_ character name.
  await joinAsNewCharacter(page, name, { timeout: 120_000 });
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

// The pip strip on the player's own plate: a container at x=0, y>0 holding
// exactly one Graphics, parked below the overhead bar (swift-cooldown).
const pipOn = (page) => page.evaluate(`
  (() => {
    let found = null;
    const walk = (c) => {
      if (found !== null || !c) return;
      const kids = c.children || [];
      if (kids.length === 1 && kids[0] && kids[0].context && c.x === 0 && c.y > 0) {
        found = !!kids[0].visible && (kids[0].context.instructions || []).length > 0;
        return;
      }
      kids.forEach(walk);
    };
    walk(window.game.character.plate);
    return found;
  })()
`);

const healthRatio = (page) => page.evaluate(() => {
  const t = document.querySelector('#healthBar .barText')?.textContent || '';
  const m = t.match(/(\d+)\s*\/\s*(\d+)/);
  return m ? +m[1] / +m[2] : null;
});

// Equip a spellbook skill into an aura slot and toggle it on (chunkP-presence).
//
// ⚑ Use a FRESH slot for each aura. Clicking a slot that is already equipped
// AND active does not replace it — tryEquipPending runs first, but the active
// slot keeps its skill, so the second aura silently never lands and the run
// reads as "equip did not land". There are 3 slots from level 1 (MaxAuraSlots),
// so switching the active aura between two of them is also the shape real play
// uses: several equipped, one active.
// ⚑ bringToFront + interval polling are BOTH load-bearing in a multi-client
// script. Playwright's waitForFunction polls on rAF by default, and reading
// state on another page backgrounds this one — a backgrounded page's rAF is
// throttled to almost nothing, so the wait expires even though the equip
// landed. The failure reads exactly like "the equip did not work": the slot
// really is empty as far as this page ever gets to observe. Same family as the
// hold-the-key-1.3s gotcha in the verify skill, and it cost a debugging round
// here (a single-client probe running the identical clicks passed every time).
const equipAndActivateAura = async (page, skillRe, slotIndex = 0) => {
  await page.bringToFront();
  const rowAppeared = await page.waitForFunction(
    (re) => [...document.querySelectorAll('#spellbookList li')].some((li) => new RegExp(re, 'i').test(li.textContent)),
    skillRe.source, { timeout: 20_000, polling: 500 }).catch(() => null);
  if (!rowAppeared) return { ok: false, why: `no spellbook row matches ${skillRe}` };
  const rowIndex = await page.evaluate((re) =>
    [...document.querySelectorAll('#spellbookList li')].findIndex((li) => new RegExp(re, 'i').test(li.textContent)),
    skillRe.source);
  const rows = await page.$$('#spellbookList li');
  const box = await rows[rowIndex].boundingBox();
  await page.mouse.click(box.x + 25, box.y + box.height / 2);
  await page.waitForTimeout(700);
  if (!await page.evaluate(() => !!document.querySelector('#spellbookList li.selected')))
    return { ok: false, why: 'clicking the name did not select it' };

  // ⚑ Match the .slotLabel span, NOT the li: the li's textContent glues the
  // hotkey digit onto the name ("2Heal"), so a /\bHeal\b/ finds no word
  // boundary between "2" and "H" and silently never matches — while the equip
  // itself landed perfectly. That read as "equip did not land" for three runs.
  const sel = `#auraSlotList li[data-slot="${slotIndex}"]`;
  const labelSel = `${sel} .slotLabel`;
  const slot = await page.$(sel);
  const sbox = await slot.boundingBox();
  await page.mouse.click(sbox.x + sbox.width / 2, sbox.y + sbox.height / 2); // equip

  const equipped = await page.waitForFunction(
    ({ re, s }) => new RegExp(re, 'i').test(document.querySelector(s)?.textContent || ''),
    { re: skillRe.source, s: labelSel }, { timeout: 20_000, polling: 500 }).catch(() => null);
  if (!equipped) {
    const dump = await page.evaluate(() => ({
      slots: document.querySelector('#auraSlotList')?.textContent?.trim().replace(/\s+/g, ' '),
      selected: document.querySelector('#spellbookList li.selected')?.textContent?.trim().replace(/\s+/g, ' '),
      rows: [...document.querySelectorAll('#spellbookList li')].map((li) => li.textContent.trim().replace(/\s+/g, ' ')).join(' | '),
    }));
    return { ok: false, why: `slot ${slotIndex} never showed the skill — slots=${JSON.stringify(dump.slots)} selected=${JSON.stringify(dump.selected)} rows=${JSON.stringify(dump.rows)}` };
  }

  for (let i = 0; i < 5; i++) {
    await page.mouse.click(sbox.x + sbox.width / 2, sbox.y + sbox.height / 2); // activate
    await page.waitForTimeout(1200);
    if (await page.evaluate((s) => !!document.querySelector(s)?.classList.contains('activeSlot'), sel))
      return { ok: true, why: `slot ${slotIndex} active (attempt ${i + 1})` };
  }
  return { ok: false, why: `slot ${slotIndex} never lit as active after 5 attempts` };
};

const healer = await newPlayer('healer');
const ally = await newPlayer('patient');
const control = await newPlayer('control');

for (const p of [healer, ally, control]) await cmd(p, 'GOD');
await cmd(healer, 'WARP ' + wire(HEALER));
await cmd(ally, 'WARP ' + wire(ALLY));
await cmd(control, 'WARP ' + wire(CONTROL));
await cmd(healer, 'SKILL Rejuvenation');
await cmd(healer, 'SKILL Heal');
const wait = (ms) => healer.waitForTimeout(ms);
await wait(8_000);

// --- 1. Rejuvenation is on ---
const rej = await equipAndActivateAura(healer, /Rejuvenation/);
check('Rejuvenation equips and lights as the active aura', rej.ok, rej.why);

// The aura re-applies every 60 ticks (2 s) and the buff lasts 6×60 = 12 s.
await wait(9_000);

const allyRatio = await healthRatio(ally);
const allyPip = await pipOn(ally);
const controlPip = await pipOn(control);

// --- 2. the ruling: a FULL-health ally gets the HoT ---
if (allyRatio !== 1) {
  check('An ally at FULL health receives the HoT (the §33 ruling)', false,
    `INCONCLUSIVE — the ally was not at full health when the pip was read (ratio ${allyRatio}); ` +
    `a wounded ally would have been pipped under the OLD behaviour too, so this proves nothing. Re-run.`);
} else {
  check('An ally at FULL health receives the HoT (the §33 ruling)', allyPip === true,
    `ally at ratio 1.0, pip: ${allyPip} — pre-hotting works`);
}

// --- 3. the control: the pip is the healer's doing ---
check('An out-of-range player shows no pip (control)', controlPip === false,
  `control 12 units away, pip: ${controlPip}`);

// --- 4. the other half of the split: heal_aura still refuses a full-HP ally ---
// Swap the active aura to Heal and let it tick. The direct heal must NOT touch
// a full-health ally — that gate is load-bearing (selfDamageHP + maxTargets 1)
// and the ruling deliberately left it alone.
const heal = await equipAndActivateAura(healer, /\bHeal\b/, 1);
// ⚑ Wait out the RESIDUAL Rejuvenation HoT before reading the pip. The buff
// lives hotTicks 6 × hotTickInterval 60 = 360 ticks = 12 s, and the aura was
// topping it up until the moment the loadout switched — so a 9 s wait reads
// the leftover HoT and blames heal_aura for it.
await wait(16_000);
const allyRatioAfter = await healthRatio(ally);
const allyPipUnderHeal = await pipOn(ally);
check('Direct heal (heal_aura) still ignores a full-health ally',
  heal.ok && allyRatioAfter === 1 && allyPipUnderHeal === false,
  `heal active: ${heal.why}; ally ratio ${allyRatioAfter}, pip ${allyPipUnderHeal} ` +
  `(a heal_aura draws no pip and must not fire at full HP)`);

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
