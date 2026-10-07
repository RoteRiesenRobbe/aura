// c2-thorns.mjs: thorns on others at the game surface
// (docs/plan-effect-types-round-2.md C2), with the example skill Thorns
// (retaliate_burst, the caster and every ally in 4 u) and Retribution
// (the shipped self-only form) as the regression leg:
//
//   1  Thorns fired beside a second client puts a BENEFICIAL Thorns circle with
//      the Reflect kind on the ALLY's tray (the burst reached somebody else)
//   2  the caster's own tray gets a Thorns circle too (targetsSelf)
//   3  the caster's client draws the ally's Reflect pip (other players keep pips)
//   4  Retribution (targetsSelf, now authored) still puts its Reflect circle on
//      the caster's own tray
//
// ⛔ Needs the DEBUG zone set (`./scripts/dev-restart.sh server debug`); the
// venue is c1-stat-buffs.mjs's idle spot, away from every mob. GOD on: the
// legs read the buff, not a hit (the bounce itself is Go's, sys/thorns_test.go
// and model/mob/thorns_test.go). A press that never fires is INCONCLUSIVE.
//
// The pip leg hooks EffectPips.setMask through the OWN plate's instance: the
// prototype is shared with every mob and other-player strip, so the hook sees
// every mask the client is handed, which is what the wire carries.
//
// Usage: node .claude/skills/verify/c2-thorns.mjs [label] [url]

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
const KIND_REFLECT = 16;
const PIP_REFLECT = 1024;
const IDLE = { x: 33, y: -27 };

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
// Puts the spellbook row matching skillRe into cooldown slot 0.
const slotCooldown = async (page, skillRe) => {
  const rowIndex = await page.waitForFunction(
    (re) => [...document.querySelectorAll('#spellbookList li')].findIndex((li) => new RegExp(re, 'i').test(li.textContent)),
    skillRe.source, { timeout: 20_000, polling: 500 }).then((h) => h.jsonValue()).catch(() => -1);
  if (rowIndex < 0) return false;
  await showSkillRowAt(page, rowIndex);
  const box = await (await page.$$('#spellbookList li'))[rowIndex].boundingBox();
  await page.mouse.click(box.x + 25, box.y + box.height / 2);
  await page.waitForTimeout(700);
  const sbox = await (await page.$('#cooldownSlotList li[data-slot="0"]')).boundingBox();
  await page.mouse.click(sbox.x + sbox.width / 2, sbox.y + sbox.height / 2);
  await page.waitForTimeout(700);
  return true;
};
// Presses the slot-0 key until pred() holds, at most three times.
const pressUntil = async (page, pred) => {
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.down('q');
    await page.waitForTimeout(400);
    await page.keyboard.up('q');
    const v = await waitFor(page, pred, 4000);
    if (v) return v;
  }
  return null;
};

const a = await openClient('thorncaster');
const b = await openClient('thornally');
await a.cmd('WARP ' + (IDLE.x * 120) + ' ' + (IDLE.y * 120), 1500);
await b.cmd('WARP ' + (IDLE.x * 120 + 120) + ' ' + (IDLE.y * 120), 1500);
await a.cmd('SKILL Thorns');
await a.cmd('SKILL Retribution');

// --- legs 1-3: Thorns on the ally ------------------------------------------------
const slotted = await slotCooldown(a.page, /Thorns/);
const ally = slotted ? await pressUntil(a.page, () => trayCircle(b.page, 'Thorns')) : null;
check('Thorns puts a beneficial Reflect circle on the ALLY\'s tray',
  ally ? (ally.kinds & KIND_REFLECT) !== 0 && !ally.harmful : null,
  ally ? `ally circle ${JSON.stringify(ally)}` : 'INCONCLUSIVE: no Thorns circle on the ally after three presses (slot or press lost)');
const own = ally ? await trayCircle(a.page, 'Thorns') : undefined;
check('The caster\'s own tray gets a Thorns circle too (targetsSelf)',
  ally ? !!own && (own.kinds & KIND_REFLECT) !== 0 && !own.harmful : null,
  ally ? `caster circle ${JSON.stringify(own)}` : 'INCONCLUSIVE: Thorns never landed');
const pip = ally ? await waitFor(a.page, () => sawMask(a.page, PIP_REFLECT), 4000) : null;
check('The caster\'s client draws the ally\'s Reflect pip',
  ally ? !!pip : null,
  ally ? `Reflect bit seen in a pip mask: ${!!pip}` : 'INCONCLUSIVE: Thorns never landed');
await a.page.screenshot({ path: join(process.env.THORNS_SHOT_DIR || '/tmp', `c2-thorns-${label}-ally.png`) });

// --- leg 4: Retribution, the self-only form ----------------------------------------
const reSlotted = await slotCooldown(a.page, /Retribution/);
const self = reSlotted ? await pressUntil(a.page, () => trayCircle(a.page, 'Retribution')) : null;
check('Retribution (targetsSelf) still puts its Reflect circle on the caster\'s own tray',
  self ? (self.kinds & KIND_REFLECT) !== 0 && !self.harmful : null,
  self ? `caster circle ${JSON.stringify(self)}` : 'INCONCLUSIVE: no Retribution circle after three presses (slot or press lost)');

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
