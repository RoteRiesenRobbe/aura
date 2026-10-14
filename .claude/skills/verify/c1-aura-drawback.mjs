#!/usr/bin/env node
// Aura drawbacks C1 (plan-aura-drawbacks.md §7 C1): the while-active fold at
// the game surface, on the rig aura OverchargeAura (cheat-only).
//
// Five legs, each one thing the Go pins cannot see:
//
//   1  the tooltip names every drawback, as a drawback, "while active",
//   2  switching the aura ON shrinks the pool and clamps current Focus to it,
//   3  the cost line gets dearer while it is on,
//   4  the walk slows while it is on, and is back to normal when it is off,
//   5  switching it OFF restores the pool at once and leaves Focus where it was.
//
// ⚑ Every expectation is a DIRECTION or a regex, never an authored number: the
// rig's values are placeholders and the PO re-prices them in the editor.
// ⚑ GOD is on, and it is load-bearing for legs 2 and 5 rather than a
// convenience: godmode skips updateVitalSigns, so passive regen is off and
// "Focus stays where it was" is an isolation, not a race against the regen. The
// clamp itself sits above the GOD gate, so it still runs.
// ⚑ The level is raised FIRST: at a level-1 pool of 100 the rig's cost rounds
// to 1 Focus with or without the drawback, so leg 3 would read nothing.
// ⚑ Boundary: the tooltip's number formatting is SkillTooltip.test.ts's
// (vitest), the fold's arithmetic is Go's. swift-cooldown owns the speed BUFF;
// this owns only the derived-stat axis an active aura now folds into.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { joinAsNewCharacter } from './lib/join.mjs';
import { showSkillRow } from './lib/spellbook.mjs';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');

const label = process.argv[2] || 'run';
const url = process.argv[3] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

// The most open whole-unit tile in the zone (see the verify skill, "Measuring a PACE").
const OPEN = `${-23 * 120} ${14 * 120}`;
const WALK_SECS = 2.5;
const OPEN_GROUND_MIN = 1.2;

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const page = await (await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 800 } })).newPage();

const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await joinAsNewCharacter(page, 'drawback');
await page.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
await page.evaluate(() => {
  const p = document.getElementById('developPanel');
  if (p) p.style.display = 'none';
});

const cmd = async (text) => {
  await page.evaluate((t) => {
    const input = document.getElementById('console_command');
    input.value = t;
    document.getElementById('console').dispatchEvent(new Event('submit', { cancelable: true }));
  }, text);
  await page.waitForTimeout(700);
};

const results = [];
// pass: true | false | null (INCONCLUSIVE)
const check = (name, pass, detail) => results.push({ check: name, pass, detail });

const pos = () => page.evaluate(() => ({
  x: window.game.character.getX() / 120,
  y: window.game.character.getY() / 120,
}));

const focus = async () => {
  const text = await page.evaluate(() => document.querySelector('#healthBar .barText')?.textContent ?? '');
  const m = text.match(/^Focus (\d+)\/(\d+)$/);
  return m ? { cur: Number(m[1]), max: Number(m[2]), text } : { cur: NaN, max: NaN, text };
};

await cmd('GOD');
await cmd('SKILL OverchargeAura');
await cmd('XP 99999999');
await cmd('WARP ' + OPEN);
await page.waitForFunction(
  () => [...document.querySelectorAll('#spellbookList [data-skill-id]')].some((e) => /Overcharge/i.test(e.textContent)),
  null, { timeout: 20_000 }).catch(() => {});
await page.waitForTimeout(22_000);   // the camera interpolates slowly after a warp (backlog §20)

const skillId = await page.evaluate(() =>
  [...document.querySelectorAll('#spellbookList [data-skill-id]')]
    .find((e) => /Overcharge/i.test(e.textContent))?.dataset.skillId ?? null);
check('OverchargeAura is in the spellbook', skillId !== null, `skill id ${skillId}`);
if (skillId === null) {
  report();
  process.exit(1);
}

const tooltip = async (shot) => {
  await showSkillRow(page, skillId);
  const entry = page.locator(`#spellbookList [data-skill-id="${skillId}"]`).first();
  await entry.scrollIntoViewIfNeeded();
  await entry.hover();
  await page.waitForTimeout(500);
  const lines = await page.evaluate(() => {
    const tip = document.querySelector('#skillTooltip');
    if (!tip || tip.classList.contains('hidden')) return [];
    return [...tip.children].map((c) => c.textContent);
  });
  if (shot) await page.screenshot({ path: `/tmp/c1-drawback-${label}-${shot}.png` });
  await page.mouse.move(10, 10);   // drop the tooltip so the next hover re-renders
  return lines;
};

const costOf = (lines) => {
  const m = lines.join(' | ').match(/Costs you: (\d+)(?: → (\d+))? Focus/);
  if (!m) return null;
  return m[2] === undefined ? [Number(m[1])] : [Number(m[1]), Number(m[2])];
};

// --- leg 1: the tooltip says what it costs you to run ------------------------
const offLines = await tooltip('tooltip-off');
const wanted = [
  ['slower walk', /^Movement speed: −\d+(\.\d+)?%.* while active$/],
  ['smaller pool', /^Max Focus: −\d+(\.\d+)?%.* while active$/],
  ['more damage taken', /^Damage taken: \+\d+(\.\d+)?%.* while active$/],
  ['dearer costs', /^All costs: \+\d+(\.\d+)?%.* while active$/],
];
for (const [what, re] of wanted) {
  const line = offLines.find((l) => re.test(l));
  check(`The tooltip names the drawback: ${what}`, line !== undefined,
    line !== undefined ? JSON.stringify(line) : `no line matches ${re} in ${JSON.stringify(offLines)}`);
}
check('No doubled sign anywhere in the tooltip', !offLines.some((l) => /[+−-]\s*[+−-]\d/.test(l)),
  JSON.stringify(offLines));
const costOff = costOf(offLines);

// --- equip into the first aura slot (it replaces the starting Damage aura) ---
await showSkillRow(page, skillId);
const row = page.locator(`#spellbookList [data-skill-id="${skillId}"]`).first();
const rowBox = await row.boundingBox();
await page.mouse.click(rowBox.x + 25, rowBox.y + rowBox.height / 2);   // the NAME, never the row centre
await page.waitForSelector('#spellbookList li.selected', { timeout: 5_000 }).catch(() => {});
const slot = await page.$('#auraSlotList li');
const slotBox = await slot.boundingBox();
const clickSlot = () => page.mouse.click(slotBox.x + slotBox.width / 2, slotBox.y + slotBox.height / 2);
await clickSlot();
const equipped = await page.waitForFunction(
  () => /Overcharge/i.test(document.querySelector('#auraSlotList li .slotLabel')?.textContent ?? ''),
  null, { timeout: 20_000 }).then(() => true).catch(() => false);
check('It equips into an aura slot', equipped,
  await page.evaluate(() => JSON.stringify(document.querySelector('#auraSlotList')?.textContent?.trim().slice(0, 80))));

const isActive = () => page.evaluate(() => !!document.querySelector('#auraSlotList .auraSlot.activeSlot'));
// The activation click is refused until the client's slot state has synced
// (GameState-driven on the throttled rAF loop), so retry until the state shows.
const setActive = async (want) => {
  for (let i = 0; i < 6; i++) {
    if (await isActive() === want) return true;
    await clickSlot();
    await page.waitForTimeout(1500);
  }
  return await isActive() === want;
};

const walk = async (key, seconds) => {
  await page.evaluate(() => document.activeElement?.blur());
  const from = await pos();
  await page.keyboard.down(key);
  await page.waitForTimeout(seconds * 1000);
  await page.keyboard.up(key);
  await page.waitForTimeout(400);
  const to = await pos();
  return Math.hypot(to.x - from.x, to.y - from.y) / seconds;
};
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
// Alternating directions keeps every leg inside the open tile.
const keys = ['d', 'a'];
let legIdx = 0;
const legs = async (n) => {
  const paces = [];
  for (let i = 0; i < n; i++) paces.push(await walk(keys[legIdx++ % 2], WALK_SECS));
  return paces;
};

// --- baseline, aura OFF -------------------------------------------------------
await setActive(false);
await page.mouse.move(10, 10);
await legs(1);                       // warm-up, discarded (the first walk after a warp is short)
const before = await focus();
const paceOff = await legs(2);

// --- leg 2: switching ON shrinks the pool and clamps Focus --------------------
const wentOn = await setActive(true);
check('The aura switches on', wentOn, `activeSlot lit: ${wentOn}`);
await page.waitForTimeout(1500);
const during = await focus();
await page.screenshot({ path: `/tmp/c1-drawback-${label}-on.png` });
check('Switching on shrinks the pool',
  during.max < before.max,
  `${before.text} → ${during.text}`);
check('Current Focus is clamped to the smaller pool',
  during.cur <= during.max && during.cur < before.cur,
  `${before.text} → ${during.text}`);

// --- leg 3: the cost line is dearer while it is on ----------------------------
const onLines = await tooltip('tooltip-on');
const costOn = costOf(onLines);
const dearer = (a, b) => a.some((v, i) => b[i] > v) && a.every((v, i) => b[i] >= v);
check('The cost is dearer while the aura is on',
  costOff !== null && costOn !== null && dearer(costOff, costOn),
  `Costs you: ${costOff} → ${costOn} Focus (both preview endpoints)`);

// --- leg 4: the walk slows ----------------------------------------------------
const paceOn = await legs(2);

// --- leg 5: switching OFF restores the pool, Focus stays ----------------------
const wentOff = await setActive(false);
check('The aura switches off', wentOff, `activeSlot lit: ${!wentOff}`);
await page.waitForTimeout(1500);
const after = await focus();
check('Switching off restores the pool at once',
  after.max === before.max,
  `${during.text} → ${after.text} (was ${before.text})`);
check('Focus stays where it was (no free refill on switch-off)',
  Math.abs(after.cur - during.cur) <= 1 && after.cur < after.max,
  `${during.text} → ${after.text}`);
const paceBack = await legs(2);

const off = median(paceOff);
const on = median(paceOn);
const back = median(paceBack);
const fmt = (xs) => xs.map((p) => p.toFixed(2)).join(', ');
const openGround = off >= OPEN_GROUND_MIN;
check('The walk is slower while the aura is on',
  openGround ? on < off * 0.9 : null,
  openGround
    ? `off [${fmt(paceOff)}] median ${off.toFixed(2)} u/s; on [${fmt(paceOn)}] median ${on.toFixed(2)} u/s → ${(on / off).toFixed(2)}×`
    : `INCONCLUSIVE: the baseline is only ${off.toFixed(2)} u/s against a nominal 1.5, the walks were obstructed`);
check('The walk is back to normal after switch-off',
  openGround ? back > on * 1.1 && back > off * 0.85 : null,
  `after [${fmt(paceBack)}] median ${back.toFixed(2)} u/s (off ${off.toFixed(2)}, on ${on.toFixed(2)})`);

function report() {
  console.log('\nlabel :', label);
  for (const r of results) {
    const tag = r.pass === null ? 'INCONCLUSIVE' : r.pass ? 'PASS' : 'FAIL';
    console.log(`${tag}  ${r.check}\n        ${r.detail}`);
  }
  console.log('\nwebgl ctx losses :', consoleErrors.filter((t) => t.includes('[webgl] world context lost')).length);
  console.log('console errors   :', consoleErrors.length);
  for (const e of consoleErrors.slice(0, 5)) console.log('   ·', e);
}

report();
await browser.close();
const failed = results.some((r) => r.pass === false) || consoleErrors.length > 0;
process.exit(failed ? 1 : 0);
