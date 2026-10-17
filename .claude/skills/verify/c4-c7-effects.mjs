// c4-c7-effects.mjs: effect types round 2 C4-C7 at the game surface
// (docs/archive/plan-effect-types-round-2.md §6 C4-C7), written after the PO's
// combined in-game pass (2026-10-12), with the example skills:
//
//   C4 empower (NaturesSwiftness), C6 stealth (Vanish), on client A:
//   1  NaturesSwiftness puts a beneficial Empower circle on A's tray
//   2  the empower survives its own cast (still there 1.5 s later, L1)
//   3  Vanish puts a beneficial Stealth circle on A's tray
//   4  Vanish spent the empower: the NaturesSwiftness circle is gone
//   5  A's own token is translucent (own applied_effects, L12)
//   6  client B draws A's token translucent (the Stealth pip as alpha)
//   C7 death triggers + C5 fear, client A at a boar:
//   7  BurstingTotem's totem expires and its TotemBurst draws a `wave`
//      (the dead totem lingers one snapshot so the client finds the caster)
//   8  Terrify puts the Fear pip on a mob
//   C5 fear on a player, client B beside the BroodMother, GOD OFF (L10):
//   9  the BroodScreech lands a harmful Fear circle on B's tray
//   10 a press while feared floats "Feared", not "Stunned"
//
// ⛔ Needs the DEBUG zone set (`./scripts/dev-restart.sh server debug`): the
// boar venue is c3-charge.mjs's, the idle spot c1-stat-buffs.mjs's, and the
// BroodMother stands only in api/zones/.debug/. A press that never fires, a
// boar that wandered off, or a mother that never screeched is INCONCLUSIVE.
// Not covered here, Go's: the BroodMother's split (sys/on_death_test.go,
// killing a level-9 mob from a fresh character is no harness venue), stealth
// against mob aggro (model/mob), the hard-CC ladder (skills/buffs).
//
// Usage: node .claude/skills/verify/c4-c7-effects.mjs [label] [url]

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
const shotDir = process.env.EFFECTS_SHOT_DIR || '/tmp';

// api/shared-constants.json: effectKindBits / appliedEffectBits.
const KIND_EMPOWER = 16384;
const KIND_FEAR = 32768;
const KIND_STEALTH = 65536;
const PIP_FEAR = 2048;
const STEALTH_ALPHA = 0.4; // EffectPips.ts
const IDLE = { x: 33, y: -27 };
const BOAR_STAND = { x: 40, y: 15 }; // c3-charge.mjs: the boar at (36.35, 15.55)
// 1 u south of the BroodMother's spawn (38.5, -31.5) in world_debug.json; 1 u
// east lands B elsewhere and the mother never screeched in 3 runs of 3.
const BROOD = { x: 38.5, y: -30.5 };

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
  // Every pip mask the client is handed (the EffectPips prototype is shared
  // with every mob and other-player strip), every token alpha set on ANOTHER
  // character (Character.prototype is shared too), every own floating text.
  await page.evaluate(() => {
    const p = document.getElementById('developPanel'); if (p) p.style.display = 'none';
    const ch = window.game.character;
    window.__masks = [];
    const pips = Object.getPrototypeOf(ch.overheadBar.effectPips);
    const setMask = pips.setMask;
    pips.setMask = function (mask) { if (mask) window.__masks.push(mask); return setMask.call(this, mask); };
    window.__otherAlphas = [];
    const proto = Object.getPrototypeOf(ch);
    const setAlpha = proto.setTokenAlpha;
    proto.setTokenAlpha = function (mask) {
      const r = setAlpha.call(this, mask);
      if (this !== window.game.character) window.__otherAlphas.push(this.shape.alpha);
      return r;
    };
    window.__floats = [];
    const show = ch.showFloatingText;
    ch.showFloatingText = function (text, ...rest) { window.__floats.push(String(text)); return show.call(this, text, ...rest); };
  });
  const cmd = async (text, wait = 700) => {
    await page.evaluate((t) => {
      const input = document.getElementById('console_command');
      input.value = t;
      document.getElementById('console').dispatchEvent(new Event('submit', { cancelable: true }));
    }, text);
    if (wait) await page.waitForTimeout(wait);
  };
  const warp = (p, dx = 0) => cmd(`WARP ${Math.round(p.x * 120 + dx * 120)} ${Math.round(p.y * 120)}`, 2500);
  await cmd('PING');
  await cmd('GOD on');
  return { page, cmd, warp };
};

const trayCircle = (page, name) => page.evaluate((n) => {
  const c = [...document.querySelectorAll('#buffTray .buffCircle')].find((x) => x.dataset.skillName === n);
  return c ? { kinds: Number(c.dataset.kinds), harmful: c.classList.contains('harmful') } : null;
}, name);
const trayWithKind = (page, bit) => page.evaluate((b) => {
  const c = [...document.querySelectorAll('#buffTray .buffCircle')].find((x) => (Number(x.dataset.kinds) & b) !== 0);
  return c ? { name: c.dataset.skillName, kinds: Number(c.dataset.kinds), harmful: c.classList.contains('harmful') } : null;
}, bit);
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
  const ok = !!(await page.waitForFunction(
    (re) => new RegExp(re, 'i').test(document.querySelector('#cooldownSlotList li[data-slot="0"] .slotLabel')?.textContent || ''),
    skillRe.source, { timeout: 10_000 }).catch(() => null));
  await page.keyboard.press('b').catch(() => {}); // close the spellbook again
  await page.waitForTimeout(400);
  return ok;
};
const pressQ = async (page) => {
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down('q');
  await page.waitForTimeout(400);
  await page.keyboard.up('q');
};
// Presses the slot-0 key until pred() holds, at most three times.
const pressUntil = async (page, pred, ms = 4000) => {
  for (let i = 0; i < 3; i++) {
    await pressQ(page);
    const v = await waitFor(page, pred, ms);
    if (v) return v;
  }
  return null;
};

const a = await openClient('fxcaster');
const b = await openClient('fxwatcher');
await a.warp(IDLE);
await b.warp(IDLE, 1);
for (const s of ['NaturesSwiftness', 'Vanish', 'Terrify', 'BurstingTotem']) await a.cmd(`SKILL ${s}`);
await b.cmd('SKILL Vanish');

// --- legs 1-2: empower ---------------------------------------------------------------
const nsSlotted = await slotCooldown(a.page, /Nature's Swiftness|NaturesSwiftness/);
const ns = nsSlotted ? await pressUntil(a.page, () => trayCircle(a.page, "Nature's Swiftness")) : null;
check('NaturesSwiftness puts a beneficial Empower circle on the tray',
  ns ? (ns.kinds & KIND_EMPOWER) !== 0 && !ns.harmful : null,
  ns ? `circle ${JSON.stringify(ns)}` : `INCONCLUSIVE: slotted ${nsSlotted}, no circle after three presses`);
let nsHeld = null;
if (ns) { await a.page.waitForTimeout(1500); nsHeld = await trayCircle(a.page, "Nature's Swiftness"); }
check('The empower survives its own cast (still on the tray 1.5 s later)',
  ns ? !!nsHeld : null, ns ? `circle ${JSON.stringify(nsHeld)}` : 'INCONCLUSIVE: no empower');

// --- legs 3-6: stealth, and the empower it spends --------------------------------------
await b.page.evaluate(() => { window.__otherAlphas = []; });
const vSlotted = await slotCooldown(a.page, /Vanish/);
const vanish = vSlotted ? await pressUntil(a.page, () => trayCircle(a.page, 'Vanish')) : null;
check('Vanish puts a beneficial Stealth circle on the tray',
  vanish ? (vanish.kinds & KIND_STEALTH) !== 0 && !vanish.harmful : null,
  vanish ? `circle ${JSON.stringify(vanish)}` : `INCONCLUSIVE: slotted ${vSlotted}, no circle after three presses`);
const nsGone = vanish && ns ? await waitFor(a.page, async () => !(await trayCircle(a.page, "Nature's Swiftness")), 3000) : null;
check('Vanish spent the empower (the NaturesSwiftness circle is gone)',
  vanish && ns ? !!nsGone : null,
  vanish && ns ? `empower circle gone: ${!!nsGone}` : 'INCONCLUSIVE: empower or Vanish never landed');
const ownAlpha = vanish ? await waitFor(a.page, () => a.page.evaluate((s) => {
  const al = window.game.character.shape.alpha; return Math.abs(al - s) < 0.01 ? al : null;
}, STEALTH_ALPHA), 3000) : null;
check('The own token is translucent',
  vanish ? ownAlpha !== null : null,
  vanish ? `own shape alpha ${await a.page.evaluate(() => window.game.character.shape.alpha)}` : 'INCONCLUSIVE: Vanish never landed');
const seen = vanish ? await waitFor(b.page, () => b.page.evaluate((s) =>
  window.__otherAlphas.some((al) => Math.abs(al - s) < 0.01) || null, STEALTH_ALPHA), 4000) : null;
check('The second client draws the stealthed token translucent',
  vanish ? !!seen : null,
  vanish ? `other-character alphas on B: ${JSON.stringify([...new Set(await b.page.evaluate(() => window.__otherAlphas))])}` : 'INCONCLUSIVE: Vanish never landed');
await b.page.screenshot({ path: join(shotDir, `c4-c7-effects-${label}-stealth.png`) });

await a.warp(BOAR_STAND);
// --- leg 7: the totem's death burst (before Terrify sends the boar running) ---------
const bSlotted = await slotCooldown(a.page, /BurstingTotem|Bursting Totem/);
const waves = async () => (await a.page.evaluate(() => window.game.skillFx())).spawnedByKind.wave ?? 0;
const wavesBefore = await waves();
let burst = null;
if (bSlotted) {
  const slotTimer = () => a.page.evaluate(() =>
    /\d+(\.\d+)?s/.test(document.querySelector('#cooldownSlotList li[data-slot="0"]')?.textContent || ''));
  await waitFor(a.page, async () => !(await slotTimer()), 5000);
  const placed = await pressUntil(a.page, slotTimer, 2000);
  // 3 s of totem, then one snapshot of linger.
  burst = placed ? await waitFor(a.page, async () => (await waves()) > wavesBefore, 7000) : null;
  check('The BurstingTotem expires and its TotemBurst draws a wave',
    placed ? !!burst : null,
    placed ? `waves spawned ${wavesBefore} -> ${await waves()}` : 'INCONCLUSIVE: the totem press never fired');
} else {
  check('The BurstingTotem expires and its TotemBurst draws a wave', null, 'INCONCLUSIVE: not slotted');
}
await a.page.screenshot({ path: join(shotDir, `c4-c7-effects-${label}-burst.png`) });

// --- leg 8: fear on a mob ---------------------------------------------------------------
await a.page.evaluate(() => { window.__masks = []; window.__floats = []; });
const tSlotted = await slotCooldown(a.page, /Terrify/);
let feared = null, refusal = [];
if (tSlotted) {
  feared = await pressUntil(a.page, async () => (await sawMask(a.page, PIP_FEAR))
    || (await a.page.evaluate(() => window.__floats.some((f) => /No valid target/.test(f)))));
  refusal = await a.page.evaluate(() => window.__floats.slice());
}
const mobFear = feared ? await sawMask(a.page, PIP_FEAR) : false;
check('Terrify puts the Fear pip on a mob',
  mobFear ? true : null,
  mobFear ? 'Fear bit seen in a pip mask' : `INCONCLUSIVE: slotted ${tSlotted}, floats ${JSON.stringify(refusal)} (the boar wandered past 4 u, or the press was lost)`);

// --- legs 9-10: fear on a player (GOD OFF) ----------------------------------------------
const bvSlotted = await slotCooldown(b.page, /Vanish/);
// The mother stands in a pack of level-14/15 giant spiders and marauders that
// kill a fresh character in ~2 s once GOD is off: max out B's level first.
await b.cmd('XP 100000000', 1500);
await b.warp(BROOD);
await b.page.evaluate(() => { window.__floats = []; });
await b.cmd('GOD off', 300); // GOD refuses CC (L10); a bare GOD only ever turns it ON
const playerFear = await waitFor(b.page, () => trayWithKind(b.page, KIND_FEAR), 22_000);
let fearFloat = null;
if (playerFear && bvSlotted) {
  await pressQ(b.page);
  fearFloat = await waitFor(b.page, () => b.page.evaluate(() => window.__floats.find((f) => /Feared|Stunned/.test(f)) || null), 2500);
}
await b.cmd('GOD on', 300);
check('The BroodScreech lands a harmful Fear circle on the player',
  playerFear ? playerFear.harmful : null,
  playerFear ? `circle ${JSON.stringify(playerFear)}` : 'INCONCLUSIVE: no fear within 22 s (the screech came after ~11 s when measured; the mother wandered off, or B died)');
check('A press while feared floats "Feared"',
  playerFear && bvSlotted && fearFloat !== null ? fearFloat === 'Feared' : null,
  playerFear ? `float ${JSON.stringify(fearFloat)}, all ${JSON.stringify(await b.page.evaluate(() => window.__floats))}` : 'INCONCLUSIVE: never feared');

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
