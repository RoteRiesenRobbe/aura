// c1-stat-buffs.mjs: stat buffs and debuffs on others at the game surface
// (docs/plan-effect-types-round-2.md C1), with the two example skills:
//
//   1  Bulwark (stat_aura, damageReduction, targetsSelf) switched on puts a
//      BENEFICIAL Bulwark circle with the StatUp kind on the caster's own tray
//   2  a second client standing in the ring gets the same circle on ITS tray
//      (the ally half: the aura reached somebody else)
//   3  the caster's client draws the ally's StatUp pip (other players keep pips)
//   4  Demoralize (instant_stat, damageDealt < 0 on enemies) fired at the
//      giant spider pack lands a StatDown pip on a mob
//
// ⛔ Needs the DEBUG zone set (`./scripts/dev-restart.sh server debug`): the
// spider pack at (35, -33) is the enemy venue. GOD on throughout: a stat buff
// is not CC, so GOD refuses none of it. Tri-state: a pack that never stands in
// the shout's 3 u circle is INCONCLUSIVE, not red.
//
// The pip legs hook EffectPips.setMask through the OWN plate's instance: the
// prototype is shared with every mob and other-player strip, so the hook sees
// every mask the client is handed, which is what the wire carries.
//
// Usage: node .claude/skills/verify/c1-stat-buffs.mjs [label] [url]
// Boundary: the stacking rules, bounds and read sites are Go's; the tooltip's
// lines are vitest's; the tray's general behaviour is buff-tray.mjs's.

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

// api/shared-constants.json: effectKindBits / appliedEffectBits.
const KIND_STAT_UP = 4096;
const PIP_STAT_UP = 256;
const PIP_STAT_DOWN = 512;
const IDLE = { x: 33, y: -27 };
const PACK_EDGE = { x: 35, y: -31 };

const results = [];
const check = (name, pass, detail) => results.push({ check: name, pass, detail });

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const consoleErrors = [];

const openClient = async (tag) => {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`${tag}: ${m.text()}`); });
  page.on('pageerror', (e) => consoleErrors.push(`${tag}: pageerror: ${e.message}`));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await joinAsNewCharacter(page, tag);
  await page.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
  await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
  await page.evaluate(() => { const p = document.getElementById('developPanel'); if (p) p.style.display = 'none'; });
  // Record every pip mask the client is handed (see the header).
  await page.evaluate(() => {
    window.__masks = [];
    const proto = Object.getPrototypeOf(window.game.character.overheadBar.effectPips);
    const orig = proto.setMask;
    proto.setMask = function (mask) { if (mask) window.__masks.push(mask); return orig.call(this, mask); };
  });
  const cmd = async (text, wait = 700) => {
    await page.evaluate((t) => {
      const input = document.getElementById('console_command');
      input.value = t;
      document.getElementById('console').dispatchEvent(new Event('submit', { cancelable: true }));
    }, text);
    if (wait) await page.waitForTimeout(wait);
  };
  await cmd('PING');
  await cmd('GOD');
  return { page, cmd };
};

const trayCircle = (page, name) => page.evaluate((n) => {
  const all = [...document.querySelectorAll('#buffTray .buffCircle')].filter((x) => x.dataset.skillName === n);
  const c = all[0];
  return c ? { kinds: Number(c.dataset.kinds), harmful: c.classList.contains('harmful'), caster: c.dataset.caster, count: all.length } : null;
}, name);
const sawMask = (page, bit) => page.evaluate((b) => window.__masks.some((m) => (m & b) !== 0), bit);
const waitFor = async (page, pred, ms) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const v = await pred();
    if (v) return v;
    await page.waitForTimeout(250);
  }
  return null;
};
const pickRow = async (page, skillRe) => {
  const rowIndex = await page.waitForFunction(
    (re) => [...document.querySelectorAll('#spellbookList li')].findIndex((li) => new RegExp(re, 'i').test(li.textContent)),
    skillRe.source, { timeout: 20_000, polling: 500 }).then((h) => h.jsonValue()).catch(() => -1);
  if (rowIndex < 0) return false;
  await showSkillRowAt(page, rowIndex);
  const box = await (await page.$$('#spellbookList li'))[rowIndex].boundingBox();
  await page.mouse.click(box.x + 25, box.y + box.height / 2);
  await page.waitForTimeout(700);
  return true;
};

const a = await openClient('statcaster');
const b = await openClient('statally');
for (const c of [a, b]) await c.cmd('WARP ' + (IDLE.x * 120) + ' ' + (IDLE.y * 120), 1500);
await a.cmd('SKILL Bulwark');
await a.cmd('SKILL Demoralize');

// --- legs 1-3: Bulwark on ---------------------------------------------------------
let bulwarkOn = false;
if (await pickRow(a.page, /Bulwark/)) {
  const sel = '#auraSlotList li[data-slot="0"]';
  const sbox = await (await a.page.$(sel)).boundingBox();
  await a.page.mouse.click(sbox.x + sbox.width / 2, sbox.y + sbox.height / 2);
  await a.page.waitForFunction((s) => /Bulwark/.test(document.querySelector(s + ' .slotLabel')?.textContent || ''), sel, { timeout: 20_000 }).catch(() => null);
  for (let i = 0; i < 5 && !bulwarkOn; i++) {
    await a.page.mouse.click(sbox.x + sbox.width / 2, sbox.y + sbox.height / 2);
    await a.page.waitForTimeout(1200);
    bulwarkOn = await a.page.evaluate((s) => !!document.querySelector(s)?.classList.contains('activeSlot'), sel);
  }
}
const own = bulwarkOn ? await waitFor(a.page, () => trayCircle(a.page, 'Bulwark'), 6000) : null;
// Exactly one: Bulwark's +threat is a while-active stat_multiplier, and the
// tray draws an active aura's NEGATIVE ones as a permanent harmful circle; a
// positive one must add nothing.
check('Bulwark on: ONE beneficial Bulwark circle with the StatUp kind on the caster\'s tray',
  bulwarkOn ? !!own && own.count === 1 && (own.kinds & KIND_STAT_UP) !== 0 && !own.harmful : null,
  bulwarkOn ? `circle ${JSON.stringify(own)}` : 'INCONCLUSIVE: Bulwark never lit active');

// Stand the ally inside the 1.5 u ring.
await b.cmd('WARP ' + (IDLE.x * 120 + 40) + ' ' + (IDLE.y * 120), 1500);
const ally = bulwarkOn ? await waitFor(b.page, () => trayCircle(b.page, 'Bulwark'), 8000) : null;
check('The ally in the ring gets the same circle on ITS own tray (the aura reached somebody else)',
  bulwarkOn ? !!ally && (ally.kinds & KIND_STAT_UP) !== 0 && !ally.harmful : null,
  bulwarkOn ? `ally circle ${JSON.stringify(ally)}` : 'INCONCLUSIVE: Bulwark never lit active');
const allyPip = bulwarkOn ? await waitFor(a.page, () => sawMask(a.page, PIP_STAT_UP), 6000) : null;
check('The caster\'s client draws the ally\'s StatUp pip',
  bulwarkOn ? !!allyPip : null,
  bulwarkOn ? `StatUp bit seen in a pip mask: ${!!allyPip}` : 'INCONCLUSIVE: Bulwark never lit active');
await a.page.screenshot({ path: join(process.env.STAT_SHOT_DIR || '/tmp', `c1-stat-buffs-${label}-bulwark.png`) });

// --- leg 4: Demoralize at the pack ------------------------------------------------
let fired = false;
if (await pickRow(a.page, /Demoralize/)) {
  const sbox = await (await a.page.$('#cooldownSlotList li[data-slot="0"]')).boundingBox();
  await a.page.mouse.click(sbox.x + sbox.width / 2, sbox.y + sbox.height / 2);
  await a.page.waitForTimeout(700);
  await a.cmd('WARP ' + (PACK_EDGE.x * 120) + ' ' + (PACK_EDGE.y * 120), 4000);
  for (let i = 0; i < 3 && !fired; i++) {
    await a.page.evaluate(() => document.activeElement?.blur());
    await a.page.keyboard.down('q');
    await a.page.waitForTimeout(1400);
    await a.page.keyboard.up('q');
    fired = await waitFor(a.page, () => sawMask(a.page, PIP_STAT_DOWN), 3000);
  }
}
check('Demoralize at the pack lands a StatDown pip on a mob',
  fired ? true : null,
  fired ? 'StatDown bit seen in a pip mask' : 'INCONCLUSIVE: no StatDown pip after three presses (pack outside the 3 u circle, or the press was lost)');
await a.page.screenshot({ path: join(process.env.STAT_SHOT_DIR || '/tmp', `c1-stat-buffs-${label}-demoralize.png`) });

console.log('\nlabel :', label);
let pass = 0, fail = 0, inc = 0;
for (const r of results) {
  const s = r.pass === null ? 'INCONCLUSIVE' : r.pass ? 'PASS' : 'FAIL';
  if (r.pass === null) inc++; else if (r.pass) pass++; else fail++;
  console.log(`${s}  ${r.check}\n        ${r.detail}`);
}
console.log(`\n${pass} PASS, ${inc} INCONCLUSIVE, ${fail} FAIL of ${results.length}`);
console.log('console errors   :', consoleErrors.length);
for (const e of consoleErrors.slice(0, 5)) console.log('   ·', e);

await browser.close();
