#!/usr/bin/env node
// plan-playtest-versions.md PV3 (D7): the solo leg of the A -> B -> A rehearsal.
// One run per boot; a PERSISTENT browser profile keeps the anonymous account, so
// every run plays the same character (the swap must not touch it).
//
// Boot aurad with a SCRATCH conf per version, never a repo conf (L4):
//   AURAD_CONF=<conf-A.json | conf-B.json> ./aurad -dev -content ../api
// B = A + game.mob damageFactor 1.1, healthFactor 1.1, crowdPerAttacker 0.1,
// crowdCap 0.5 [PLACEHOLDER]. The three-player leg is pv2-crowd.mjs, on B.
//
// The fight: two Young Wolves (aggressive, level 4), Damage aura
// on, GOD OFF (L8: GOD skips takeDamage) for WINDOW ms. Read off the wire:
// every mob's max pool (setHealth's second argument) and every drop of the
// player's own pool. B should read both x1.1 against A, give or take rounding
// and crits. Then aura off, GOD on, away from the wolves.
//
// Usage: node .claude/skills/verify/pv3-rehearsal.mjs <label> <profileDir> <stateFile> [url]
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { joinAsNewCharacter } from './lib/join.mjs';
import { showSkillRowAt } from './lib/spellbook.mjs';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');

const [label = 'run', profileDir, stateFile] = process.argv.slice(2);
const url = process.argv[5] || 'http://localhost:2100/?token=plz&wsUrl=ws://localhost:2100/game&develop';
if (!profileDir || !stateFile) { console.error('usage: <label> <profileDir> <stateFile> [url]'); process.exit(2); }
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

// Two level-4 Young Wolves (world.json, farmlands): they aggro first, so the
// player takes hits inside the window. (Prey boars barely fight back in 15 s.)
const VENUE = { x: -190.4, y: -20.6 };
const AWAY = { x: -195.8, y: -45 };
const WINDOW = 15_000;
const wire = (p) => `${Math.round(p.x * 120)} ${Math.round(p.y * 120)}`;

const ctx = await chromium.launchPersistentContext(profileDir, {
  args: ['--no-sandbox'], env, locale: 'en-US', viewport: { width: 1280, height: 800 },
});
const page = ctx.pages()[0] || await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

const cmd = async (text, wait = 700) => {
  await page.evaluate((t) => {
    const input = document.getElementById('console_command');
    input.value = t;
    document.getElementById('console').dispatchEvent(new Event('submit', { cancelable: true }));
  }, text);
  if (wait) await page.waitForTimeout(wait);
};

const AURA_SLOT = '#auraSlotList li[data-slot="0"]';
const auraOn = () => page.evaluate((s) => !!document.querySelector(s)?.classList.contains('activeSlot'), AURA_SLOT);
const setAura = async (on) => {
  const box = await (await page.$(AURA_SLOT)).boundingBox();
  for (let i = 0; i < 5 && (await auraOn()) !== on; i++) {
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(1000);
  }
  return (await auraOn()) === on;
};
const equipDamage = async () => {
  if (/Damage/i.test(await page.evaluate(() => document.querySelector('#auraSlotList')?.textContent || ''))
    || await page.evaluate((s) => !!document.querySelector(s)?.dataset.skillId, AURA_SLOT)) return true;
  const i = await page.waitForFunction(
    () => [...document.querySelectorAll('#spellbookList li')].findIndex((li) => /Damage/i.test(li.textContent)),
    null, { timeout: 20_000, polling: 500 }).then((h) => h.jsonValue()).catch(() => -1);
  if (i < 0) return false;
  await showSkillRowAt(page, i);
  const row = (await page.$$('#spellbookList li'))[i];
  const rb = await row.boundingBox();
  await page.mouse.click(rb.x + 25, rb.y + rb.height / 2);
  await page.waitForTimeout(700);
  const box = await (await page.$(AURA_SLOT)).boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(1000);
  return page.evaluate((s) => !!document.querySelector(s)?.dataset.skillId, AURA_SLOT);
};

// --- join: the same character every run ---------------------------------------
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
const name = await joinAsNewCharacter(page, 'pvrh');
await page.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
await page.evaluate(() => { const p = document.getElementById('developPanel'); if (p) p.style.display = 'none'; });
const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : { runs: [] };
const first = state.runs[0]?.name;

await cmd('GOD on');
// First run only: lift the fresh character to the wolves' band (the same
// level on every later run, since the character persists).
if (!first) await cmd('XP 1700', 1500);
await cmd('SKILL Damage');
const equipped = await equipDamage();
await setAura(false);
await cmd('WARP ' + wire(VENUE), 3000);
// A far jump takes a while to settle (verify skill): wait for the wolves.
await page.waitForFunction(() => window.game.objectsInView()
  .some((o) => /Wolf/.test(o?.nameElement?.text ?? '')), null, { timeout: 60_000, polling: 500 }).catch(() => null);

// Wrap every mob's setHealth once to see its max pool, and the player's own
// setHealth (Player.ts feeds it every snapshot) to see every hit taken.
const hook = () => page.evaluate(() => {
  const me = window.game.character;
  if (!me.__pv3) {
    me.__pv3 = true; me.__log = [];
    const own = me.setHealth.bind(me);
    me.setHealth = (h, max) => { me.__log.push([h, max]); return own(h, max); };
  }
  for (const o of window.game.objectsInView()) {
    if (!o || o === me || typeof o.setHealth !== 'function' || o.__pv3) continue;
    o.__pv3 = true;
    const hp = o.setHealth.bind(o);
    o.setHealth = (h, max) => { if (max) { o.__max = max; o.__min = Math.min(o.__min ?? max, h); } return hp(h, max); };
  }
});
const selfLog = () => page.evaluate(() => window.game.character.__log || []);

await hook();
await page.waitForTimeout(1000);
// The snapshot carries health only when it changes, so the start comes off the HUD.
const start = (await selfLog()).at(-1) || await page.evaluate(() => {
  const t = document.querySelector('#healthBar .barText')?.textContent || '';
  return t.replace(/[^\d/]/g, '').split('/').map(Number);
});
await cmd('GOD off', 300);
const auraLit = await setAura(true);
const t0 = Date.now();
while (Date.now() - t0 < WINDOW) {
  await hook();
  const last = (await selfLog()).at(-1);
  if (last && last[0] <= last[1] * 0.3) break; // keep the character alive across the swap
  await page.waitForTimeout(200);
}
await cmd('GOD on', 300);
await setAura(false);
const mobs = await page.evaluate(() => window.game.objectsInView()
  .filter((o) => o && o.__max).map((o) => ({ name: o.nameElement?.text ?? '', max: o.__max, hurt: o.__min < o.__max })));
await cmd('WARP ' + wire(AWAY), 2000);

const log = [start, ...await selfLog()];
const drops = [];
let low = start[0];
for (let i = 1; i < log.length; i++) {
  if (log[i][0] < log[i - 1][0]) drops.push(log[i - 1][0] - log[i][0]);
  low = Math.min(low, log[i][0]);
}
const sorted = [...drops].sort((a, b) => a - b);
const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
const byName = {};
for (const m of mobs) (byName[m.name] ||= new Set()).add(m.max);
const run = {
  label, name, sameCharacter: first ? first === name : null,
  playerMax: start[1], equipped, auraLit,
  hitsTaken: drops.length, drops: sorted, medianHit: median, lowestHp: low,
  mobMax: Object.fromEntries(Object.entries(byName).map(([k, v]) => [k, [...v].sort((a, b) => a - b)])),
  mobsHurt: mobs.filter((m) => m.hurt).length,
  errors,
};
state.runs.push(run);
writeFileSync(stateFile, JSON.stringify(state, null, 2));
console.log(JSON.stringify(run, null, 2));
await ctx.close();
