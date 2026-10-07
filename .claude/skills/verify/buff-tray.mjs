#!/usr/bin/env node
// Buff tray C2 (plan-buff-tray.md §7 C2, the desktop half): the own player's
// timed effects as icon circles above the action bars, at the game surface.
//
//   1  boot: the catalog carries icons on the mob skills C0 authored,
//   2  an empty tray on a fresh character, and no pips under the own plate,
//   3  Swift: a beneficial circle appears, its wedge grows (the elapsed share
//      darkens), the hover tooltip reads Swift's tooltip plus a time line, and
//      the circle leaves when the burst runs out,
//   4  Recover while hurt (instant_hot, the one SELF hot: a hot aura skips its
//      caster by design, applyHotAura): a hot circle, and still no pips under
//      the own plate while it is up (D10),
//   5  the giant spiders' venom: a HARMFUL circle keyed by the biting spider
//      (caster != 0, D16), REFILLED by every re-bite while in the pack (D2),
//      then draining out and leaving after the warp away,
//   6  a spider under the player's Immolate (a 2 u dot aura; Blight's 1 u never
//      reaches a spider biting from 1.6 u) still carries its own Dot pip: the
//      pips retired for the own player only.
//   C3 (plan-buff-tray.md §7 C3, the phone + always-on half):
//   7  an equipped passive (Tough) is a PERMANENT beneficial circle: full, at
//      the outer end, its tooltip ending in "permanent",
//   8  the active OverchargeAura (the one aura with drawbacks, a cheat-only
//      rig) is a permanent HARMFUL circle, gone when the aura is switched off,
//   9  ?mobile at 844x390: the tray sits under the Focus/XP bars, harmful row
//      above beneficial, right-aligned, 36 px circles (D8, D21),
//  10  a 200 ms press opens no tooltip, a 700 ms hold opens it, lifting closes
//      it (D12). ⚑ The hold keys on html.mobile, so a mouse press drives it.
//
// ⚑ VENUE: the GiantSpider pack of the DEBUG world (five around (35, -33)),
// so the server must boot with `./scripts/dev-restart.sh server debug`
// (c2-player-cc.mjs's venue). Leg 5 stands IN the pack under GOD: GOD skips
// takeDamage and refuses slow and stun, but a dot's APPLICATION is none of
// those, so the venom still lands on the tray while the player cannot die.
// ⚑ Tri-state: the pack decides whether a spider closes to bite range and
// whether it follows the warp away, so an unobservable leg is INCONCLUSIVE.
// ⚑ Everything the tray shows is read off its DOM: `.buffCircle` carries
// data-skill-name, data-caster, data-kinds and the `--gone` wedge angle.
//
// Usage: node .claude/skills/verify/buff-tray.mjs [label] [url]
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { joinAsNewCharacter } from './lib/join.mjs';
import { showSkillRowAt } from './lib/spellbook.mjs';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');

const label = process.argv[2] || 'run';
const url = process.argv[3] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const shotDir = process.env.TRAY_SHOT_DIR || '/tmp';
const serverLog = process.env.AURA_SERVER_LOG || '/tmp/aura-dev/server.log';
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

// api/shared-constants.json effectKindBits (pinned on both sides).
const KIND = { slow: 2, speed: 4, dot: 64, hot: 128 };
// Off the pack's north edge, and the pack itself (c2-player-cc.mjs).
const IDLE = { x: 33, y: -27 };
const PACK = { x: 35, y: -33 };

const results = [];
const check = (name, pass, detail) => results.push({ check: name, pass, detail });
const f1 = (n) => (typeof n === 'number' ? n.toFixed(1) : String(n));

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

// --- leg 1a: the server booted the debug world ---------------------------------
let bootLog = '';
try { bootLog = readFileSync(serverLog, 'utf8'); } catch { /* reported below */ }
const debugZones = /"msg":"Loading content"[^\n]*"debugZones":true/.test(bootLog);
check('Boot: the debug zone set is up (the spider pack is its venue)', debugZones,
  `debugZones ${debugZones} in ${serverLog}`);

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await joinAsNewCharacter(page, 'tray');
await page.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
await page.evaluate(() => { const p = document.getElementById('developPanel'); if (p) p.style.display = 'none'; });

const cmd = async (text, wait = 700) => {
  await page.evaluate((t) => {
    const input = document.getElementById('console_command');
    input.value = t;
    document.getElementById('console').dispatchEvent(new Event('submit', { cancelable: true }));
  }, text);
  if (wait) await page.waitForTimeout(wait);
};

// --- leg 1b: the catalog carries the C0 icons ----------------------------------
const catalog = await page.evaluate(async () => {
  const j = await (await fetch('/skills')).json();
  const list = Array.isArray(j.skills) ? j.skills : Object.values(j.skills || {});
  const icon = (n) => list.find((s) => s.name === n)?.icon || '';
  return { venom: icon('GiantVenomSpit'), web: icon('SpiderWebAura'), swift: icon('Swift') };
});
check('Catalog: the C0 mob skills carry icons (GiantVenomSpit, SpiderWebAura)',
  !!catalog.venom && !!catalog.web && !!catalog.swift,
  `GiantVenomSpit ${JSON.stringify(catalog.venom)}, SpiderWebAura ${JSON.stringify(catalog.web)}, Swift ${JSON.stringify(catalog.swift)}`);

// --- the tray and the own plate, read off the DOM / the scene ------------------
const tray = () => page.evaluate(() => {
  const read = (side) => [...document.querySelectorAll(`#buffTray .buffBox.${side} .buffCircle`)].map((c) => ({
    name: c.dataset.skillName, skillId: Number(c.dataset.skillId), caster: c.dataset.caster,
    kinds: Number(c.dataset.kinds), gone: parseFloat(c.style.getPropertyValue('--gone')) || 0,
    harmfulClass: c.classList.contains('harmful'), permanent: c.classList.contains('permanent'),
    token: c.querySelector('.ink-token')?.className || '',
  }));
  return { beneficial: read('beneficial'), harmful: read('harmful'), present: !!document.getElementById('buffTray') };
});
// The own plate's strip: DRAWN instructions, not `visible` (the standing
// EffectPips gotcha); a never-fed strip has none.
const ownPips = () => page.evaluate(() => {
  const ob = window.game.character?.overheadBar;
  const g = ob?.effectPips?.container?.children?.[0];
  return { drawnMask: ob?.effectPips?.drawnMask ?? null, instructions: (g?.context?.instructions || []).length };
});
const find = (t, side, name) => t[side].find((c) => c.name === name) || null;
const waitFor = async (pred, ms, step = 150) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const v = await pred();
    if (v) return v;
    await page.waitForTimeout(step);
  }
  return null;
};

await cmd('PING');
await cmd('GOD');
await cmd('WARP ' + (IDLE.x * 120) + ' ' + (IDLE.y * 120), 3000);

// --- leg 2: empty tray, no own pips ----------------------------------------------
const t0 = await tray();
const p0 = await ownPips();
check('A fresh character: the tray is there and empty, the own plate draws no pips',
  t0.present && t0.beneficial.length === 0 && t0.harmful.length === 0 && p0.instructions === 0,
  `tray present ${t0.present}, beneficial ${t0.beneficial.length}, harmful ${t0.harmful.length}; own pips drawnMask ${p0.drawnMask}, instructions ${p0.instructions}`);

// --- leg 3: Swift ------------------------------------------------------------------
await cmd('SKILL Swift');
const swiftRow = await page.waitForFunction(
  () => [...document.querySelectorAll('#spellbookList li')].findIndex((li) => /Swift/i.test(li.textContent)),
  null, { timeout: 20_000, polling: 500 }).then((h) => h.jsonValue()).catch(() => -1);
if (swiftRow >= 0) {
  await showSkillRowAt(page, swiftRow);
  const rows = await page.$$('#spellbookList li');
  const box = await rows[swiftRow].boundingBox();
  await page.mouse.click(box.x + 25, box.y + box.height / 2); // the name, not the point spender
  await page.waitForTimeout(700);
  const slot = await page.$('#cooldownSlotList li:first-child');
  const sb = await slot.boundingBox();
  await page.mouse.click(sb.x + sb.width / 2, sb.y + sb.height / 2);
  await page.waitForTimeout(700);
}
const equipped = await page.evaluate(() => document.querySelector('#cooldownSlotList')?.textContent?.trim() || '');
// ⚑ ~1.4 s hold: slot hotkeys are edge-triggered off an rAF clock a headless
// page throttles (swift-cooldown.mjs).
await page.evaluate(() => document.activeElement?.blur());
await page.keyboard.down('q');
await page.waitForTimeout(1400);
await page.keyboard.up('q');

const swiftUp = await waitFor(async () => find(await tray(), 'beneficial', 'Swift'), 4000);
let swiftLater = null; let swiftTip = ''; let swiftGone = null;
if (swiftUp) {
  await page.waitForTimeout(1500);
  swiftLater = find(await tray(), 'beneficial', 'Swift');
  // hover the circle, read the shared #skillTooltip
  const el = await page.$('#buffTray .buffBox.beneficial .buffCircle[data-skill-name="Swift"]');
  const bb = el ? await el.boundingBox() : null;
  if (bb) {
    await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await page.waitForTimeout(600);
    swiftTip = await page.evaluate(() => {
      const t = document.getElementById('skillTooltip');
      return t && !t.classList.contains('hidden') ? t.textContent : '';
    });
    await page.screenshot({ path: join(shotDir, `buff-tray-${label}-swift.png`) });
    await page.mouse.move(640, 300);
  }
  swiftGone = await waitFor(async () => (find(await tray(), 'beneficial', 'Swift') ? null : true), 9000, 250);
}
check('Swift: a beneficial circle with the Speed kind appears when it fires',
  /Swift/i.test(equipped) && !!swiftUp && (swiftUp.kinds & KIND.speed) !== 0 && !swiftUp.harmfulClass,
  swiftUp ? `circle ${JSON.stringify(swiftUp)}` : `no Swift circle within 4 s; cooldown bar reads ${JSON.stringify(equipped.slice(0, 40))}`);
check('Swift: the wedge grows as the burst runs (the elapsed share darkens)',
  swiftUp && swiftLater ? swiftLater.gone > swiftUp.gone + 20 : null,
  swiftUp && swiftLater ? `--gone ${f1(swiftUp.gone)}deg -> ${f1(swiftLater.gone)}deg over 1.5 s` : 'INCONCLUSIVE: the circle was not up long enough to sample twice');
check('Swift: hovering the circle shows the Swift tooltip plus a time line',
  swiftUp ? /Swift/.test(swiftTip) && /\d+ s left/.test(swiftTip) && /as fast for/.test(swiftTip) : null,
  `tooltip: ${JSON.stringify(swiftTip.slice(0, 160))}`);
check('Swift: the circle leaves when the burst expires', swiftUp ? swiftGone === true : null,
  swiftGone ? 'gone within 9 s of firing' : 'still on the tray 9 s after firing (the burst is 150 ticks)');

// --- leg 4: Recover while hurt: the self hot (instant_hot) --------------------------
const equipAndActivateAura = async (skillRe, slotIndex) => {
  const rowIndex = await page.waitForFunction(
    (re) => [...document.querySelectorAll('#spellbookList li')].findIndex((li) => new RegExp(re, 'i').test(li.textContent)),
    skillRe.source, { timeout: 20_000, polling: 500 }).then((h) => h.jsonValue()).catch(() => -1);
  if (rowIndex < 0) return { ok: false, why: `no spellbook row matches ${skillRe}` };
  await showSkillRowAt(page, rowIndex);
  const rows = await page.$$('#spellbookList li');
  const box = await rows[rowIndex].boundingBox();
  await page.mouse.click(box.x + 25, box.y + box.height / 2);
  await page.waitForTimeout(700);
  const sel = `#auraSlotList li[data-slot="${slotIndex}"]`;
  const sbox = await (await page.$(sel)).boundingBox();
  await page.mouse.click(sbox.x + sbox.width / 2, sbox.y + sbox.height / 2); // equip
  const equippedOk = await page.waitForFunction(
    ({ re, s }) => new RegExp(re, 'i').test(document.querySelector(s + ' .slotLabel')?.textContent || ''),
    { re: skillRe.source, s: sel }, { timeout: 20_000, polling: 500 }).catch(() => null);
  if (!equippedOk) return { ok: false, why: `slot ${slotIndex} never showed the skill` };
  for (let i = 0; i < 5; i++) {
    await page.mouse.click(sbox.x + sbox.width / 2, sbox.y + sbox.height / 2); // activate
    await page.waitForTimeout(1200);
    if (await page.evaluate((s) => !!document.querySelector(s)?.classList.contains('activeSlot'), sel)) return { ok: true };
  }
  return { ok: false, why: `slot ${slotIndex} never lit active` };
};

const equipCooldown = async (skillRe, slotIndex) => {
  const rowIndex = await page.waitForFunction(
    (re) => [...document.querySelectorAll('#spellbookList li')].findIndex((li) => new RegExp(re, 'i').test(li.textContent)),
    skillRe.source, { timeout: 20_000, polling: 500 }).then((h) => h.jsonValue()).catch(() => -1);
  if (rowIndex < 0) return false;
  await showSkillRowAt(page, rowIndex);
  const rows = await page.$$('#spellbookList li');
  const box = await rows[rowIndex].boundingBox();
  await page.mouse.click(box.x + 25, box.y + box.height / 2);
  await page.waitForTimeout(700);
  const sbox = await (await page.$(`#cooldownSlotList li[data-slot="${slotIndex}"]`)).boundingBox();
  await page.mouse.click(sbox.x + sbox.width / 2, sbox.y + sbox.height / 2);
  await page.waitForTimeout(700);
  return page.evaluate((i) => /\S/.test(document.querySelector(`#cooldownSlotList li[data-slot="${i}"] .slotLabel`)?.textContent || '') , slotIndex);
};
const fireKey = async (key) => {
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down(key);
  await page.waitForTimeout(1400);
  await page.keyboard.up(key);
};

await cmd('SKILL Recover');
await cmd('SKILL Immolate');
await cmd('DAMAGE 50');
const recoverSlot = await equipCooldown(/Recover/, 1);
if (recoverSlot) await fireKey('r');
const hotUp = recoverSlot ? await waitFor(async () => find(await tray(), 'beneficial', 'Recover'), 6000) : null;
let pipsUnderHot = null;
if (hotUp) {
  pipsUnderHot = await ownPips();
  await page.screenshot({ path: join(shotDir, `buff-tray-${label}-hot.png`) });
}
check('Recover: a hot circle appears when the self hot lands',
  recoverSlot ? !!hotUp && (hotUp.kinds & KIND.hot) !== 0 && !hotUp.harmfulClass : null,
  recoverSlot ? (hotUp ? `circle ${JSON.stringify(hotUp)}` : 'no Recover circle within 6 s of firing') : 'INCONCLUSIVE: Recover never reached cooldown slot 1');
check('D10: the own plate draws no pips while the hot is up',
  hotUp ? pipsUnderHot.instructions === 0 : null,
  hotUp ? `own pips drawnMask ${pipsUnderHot.drawnMask}, instructions ${pipsUnderHot.instructions}` : 'INCONCLUSIVE: no hot circle');

// --- leg 7: a passive is a permanent beneficial circle (D9) --------------------------
const tooltipText = () => page.evaluate(() => {
  const t = document.getElementById('skillTooltip');
  return t && !t.classList.contains('hidden') ? t.textContent : '';
});
const hoverCircle = async (selector) => {
  const el = await page.$(selector);
  const bb = el ? await el.boundingBox() : null;
  if (!bb) return '';
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await page.waitForTimeout(600);
  const text = await tooltipText();
  await page.mouse.move(640, 300);
  return text;
};
const equipPassive = async (skillRe, slotIndex) => {
  const rowIndex = await page.waitForFunction(
    (re) => [...document.querySelectorAll('#spellbookList li')].findIndex((li) => new RegExp(re, 'i').test(li.textContent)),
    skillRe.source, { timeout: 20_000, polling: 500 }).then((h) => h.jsonValue()).catch(() => -1);
  if (rowIndex < 0) return false;
  await showSkillRowAt(page, rowIndex);
  const rows = await page.$$('#spellbookList li');
  const box = await rows[rowIndex].boundingBox();
  await page.mouse.click(box.x + 25, box.y + box.height / 2);
  await page.waitForTimeout(700);
  const sbox = await (await page.$(`#passiveSlotList .passiveSlot[data-slot="${slotIndex}"]`)).boundingBox();
  await page.mouse.click(sbox.x + sbox.width / 2, sbox.y + sbox.height / 2);
  return !!(await page.waitForFunction(
    ({ re, i }) => new RegExp(re, 'i').test(document.querySelector(`#passiveSlotList .passiveSlot[data-slot="${i}"] .slotLabel`)?.textContent || ''),
    { re: skillRe.source, i: slotIndex }, { timeout: 15_000, polling: 500 }).catch(() => null));
};

await cmd('SKILL Tough');
const toughEquipped = await equipPassive(/Tough/, 0);
const toughUp = toughEquipped ? await waitFor(async () => find(await tray(), 'beneficial', 'Tough'), 4000) : null;
const toughTip = toughUp ? await hoverCircle('#buffTray .buffBox.beneficial .buffCircle.permanent[data-skill-name="Tough"]') : '';
const benOrder = (await tray()).beneficial;
check('A passive (Tough): a permanent beneficial circle, full, at the OUTER end (P5)',
  toughEquipped ? !!toughUp && toughUp.permanent && !toughUp.harmfulClass && toughUp.gone === 0
    && benOrder[benOrder.length - 1]?.name === 'Tough' : null,
  toughEquipped ? `circle ${JSON.stringify(toughUp)}; beneficial order ${JSON.stringify(benOrder.map((c) => c.name))}` : 'INCONCLUSIVE: Tough never reached passive slot 0');
check('A passive: the tooltip is Tough\'s plus the line "permanent"',
  toughUp ? /Tough/.test(toughTip) && /permanent$/.test(toughTip.trim()) : null,
  `tooltip: ${JSON.stringify(toughTip.slice(-120))}`);

// --- leg 8: an aura's drawbacks are a permanent harmful circle (D9) ----------------
await cmd('SKILL OverchargeAura');
const overcharge = await equipAndActivateAura(/Overcharge/, 0);
const drawbackUp = overcharge.ok ? await waitFor(async () => (await tray()).harmful.find((c) => c.permanent && /Overcharge/.test(c.name)) || null, 4000) : null;
const drawbackTip = drawbackUp ? await hoverCircle('#buffTray .buffBox.harmful .buffCircle.permanent') : '';
if (drawbackUp) await page.screenshot({ path: join(shotDir, `buff-tray-${label}-always-on.png`) });
let drawbackGone = null;
if (drawbackUp) {
  const sbox = await (await page.$('#auraSlotList li[data-slot="0"]')).boundingBox();
  await page.mouse.click(sbox.x + sbox.width / 2, sbox.y + sbox.height / 2); // switch it off
  drawbackGone = await waitFor(async () => ((await tray()).harmful.some((c) => c.permanent) ? null : true), 4000);
}
check('The active OverchargeAura: one permanent HARMFUL circle for its four drawbacks',
  overcharge.ok ? !!drawbackUp && drawbackUp.gone === 0 && (await tray()).harmful.filter((c) => c.permanent).length <= 1 : null,
  overcharge.ok ? `circle ${JSON.stringify(drawbackUp)}; tooltip tail ${JSON.stringify(drawbackTip.slice(-160))}` : `INCONCLUSIVE: ${overcharge.why}`);
check('Switching the aura off takes the drawback circle away', drawbackUp ? drawbackGone === true : null,
  drawbackGone ? 'gone within 4 s' : 'still on the tray 4 s after switching the aura off');

// --- leg 5 + 6: the pack, Immolate on, GOD on ----------------------------------------
const blight = await equipAndActivateAura(/Immolate/, 0);
await cmd('WARP ' + (PACK.x * 120) + ' ' + (PACK.y * 120), 2500);
const venomUp = await waitFor(async () => {
  const t = await tray();
  return t.harmful.find((c) => (c.kinds & (KIND.dot | KIND.slow)) !== 0) || null;
}, 25_000, 250);
// A spider under Blight carries the Dot pip on ITS plate: the strip retired for the own player only.
const mobPip = await waitFor(async () => page.evaluate(() => {
  // A mob's overhead bar hangs on its SHAPE (Mobs.ts, not on the mobPlate the
  // nameplate uses), so walk every mob layer's children. The pip strip is the
  // one-Graphics container parked below the bar at x=0, y>0 (the old own-plate
  // walker of swift-cooldown.mjs), and DRAWN instructions are the signal,
  // never `visible`.
  let drawn = 0; let strips = 0; let shapes = 0;
  const walk = (c, onStrip) => {
    if (!c) return;
    const kids = c.children || [];
    if (kids.length === 1 && kids[0] && kids[0].context && c.x === 0 && c.y > 0) { onStrip(kids[0]); return; }
    kids.forEach((k) => walk(k, onStrip));
  };
  for (const layer of Object.values(window.game.layers.mobs || {})) {
    for (const shape of layer.children || []) {
      shapes++;
      walk(shape, (g) => { strips++; if ((g.context.instructions || []).length > 0) drawn++; });
    }
  }
  return drawn > 0 ? { shapes, strips, drawn } : null;
}), 12_000, 300);
let venomShot = null; let refills = 0; const venomSamples = [];
if (venomUp) {
  venomShot = join(shotDir, `buff-tray-${label}-venom.png`);
  await page.screenshot({ path: venomShot });
  // The spider bites every 40 ticks and each bite refreshes the dot: the
  // wedge snaps back DOWN (D2). Sampled at 200 ms against a 1.33 s cycle.
  let last = venomUp.gone;
  for (let i = 0; i < 25; i++) {
    await page.waitForTimeout(200);
    const c = (await tray()).harmful.find((x) => x.name === venomUp.name && x.caster === venomUp.caster);
    if (!c) break;
    venomSamples.push(Math.round(c.gone));
    if (c.gone < last - 5) refills++;
    last = c.gone;
  }
}
await cmd('WARP ' + (IDLE.x * 120) + ' ' + ((IDLE.y + 8) * 120), 1500);
// Watch the harmful circle drain and go. A re-bite refreshes it (the pack may
// follow), which the leg reports rather than counting as a failure.
let drained = null; let venomRefreshed = false; let venomGoneAt = null; let lastGone = venomUp ? venomUp.gone : 0;
if (venomUp) {
  const tStart = Date.now();
  while (Date.now() - tStart < 20_000) {
    const c = (await tray()).harmful.find((x) => x.name === venomUp.name && x.caster === venomUp.caster);
    if (!c) { venomGoneAt = Date.now() - tStart; break; }
    if (c.gone < lastGone - 5) venomRefreshed = true;
    if (c.gone > lastGone + 5) drained = true;
    lastGone = c.gone;
    await page.waitForTimeout(200);
  }
}
check('The giant spiders\' venom: a HARMFUL circle keyed by the biting spider (D16)',
  venomUp ? venomUp.harmfulClass && venomUp.caster !== '0' && (venomUp.kinds & KIND.dot) !== 0 : null,
  venomUp ? `circle ${JSON.stringify(venomUp)}; screenshot ${venomShot}` : 'INCONCLUSIVE: no spider closed to bite range in 25 s (no harmful circle)');
check('In the pack: every re-bite REFILLS the venom circle (D2)',
  venomUp ? refills >= 1 : null,
  venomUp ? `${refills} refill(s) in 5 s; --gone samples ${JSON.stringify(venomSamples.filter((_, i) => i % 2 === 0))}` : 'INCONCLUSIVE: no harmful circle to sample');
check('Away from the pack the venom circle drains out and leaves',
  venomUp ? (venomGoneAt !== null && (drained || venomGoneAt < 2000)) : null,
  venomUp ? `drained ${drained}, refreshed by a re-bite ${venomRefreshed}, gone after ${venomGoneAt === null ? '> 20 s' : venomGoneAt + ' ms'}` : 'INCONCLUSIVE: no harmful circle to watch');
check('A spider under Immolate still carries its own Dot pip (the strip retired for the own player only)',
  blight.ok ? !!mobPip : null,
  blight.ok ? (mobPip ? `${mobPip.drawn} of ${mobPip.strips} mob pip strips drawn across ${mobPip.shapes} mob shapes` : 'no mob plate drew a Dot pip within 12 s of arriving with Immolate on') : `INCONCLUSIVE: ${blight.why}`);

// --- legs 9 + 10: the phone (?mobile, 844x390) -------------------------------------
// ⚑ Shut the desktop page first: two live pages leave one in the background,
// and a background page clamps timers, which the 500 ms hold IS.
await page.close();
const phoneCtx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true });
const phone = await phoneCtx.newPage();
phone.on('console', (m) => { if (m.type() === 'error') consoleErrors.push('phone: ' + m.text()); });
phone.on('pageerror', (e) => consoleErrors.push('phone pageerror: ' + e.message));
await phone.goto(url + '&mobile', { waitUntil: 'domcontentloaded', timeout: 120_000 });
await joinAsNewCharacter(phone, 'trayph');
await phone.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
await phone.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
await phone.evaluate(() => { const p = document.getElementById('developPanel'); if (p) p.style.display = 'none'; });
await phone.evaluate((t) => {
  for (const c of t) {
    const input = document.getElementById('console_command');
    input.value = c;
    document.getElementById('console').dispatchEvent(new Event('submit', { cancelable: true }));
  }
}, ['GOD', 'SKILL Tough']);
await phone.waitForTimeout(1500);
// The spellbook lives in the ☰ sheet on the phone: equip through the same
// pointerdown handlers the taps reach, dispatched on the (hidden) rows.
const phoneEquipped = await phone.evaluate(async () => {
  const row = [...document.querySelectorAll('#spellbookList li')].find((li) => /Tough/i.test(li.textContent));
  if (!row) return 'no Tough row';
  row.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 500));
  document.querySelector('#passiveSlotList .passiveSlot[data-slot="0"]')
    .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  return 'sent';
});
const phoneCircle = await phone.waitForSelector('#buffTray .buffCircle.permanent', { timeout: 8000 }).catch(() => null);
// Picking a passive brings up the ☰ sheet (its slots live there, HUD.ts); a
// player then shuts it with ☰, which is what uncovers the tray.
if (await phone.evaluate(() => document.documentElement.classList.contains('menuOpen'))) {
  await phone.click('#mobileMenuButton');
  await phone.waitForTimeout(500);
}
const geo = await phone.evaluate(() => {
  const r = (el) => { const b = el?.getBoundingClientRect(); return b ? { top: b.top, bottom: b.bottom, left: b.left, right: b.right, w: b.width, h: b.height } : null; };
  const trayEl = document.getElementById('buffTray');
  const ci = document.getElementById('combatIndicator');
  return {
    parent: trayEl?.parentElement?.id, visible: trayEl ? getComputedStyle(trayEl).display !== 'none' : false,
    xp: r(document.getElementById('xpBar')), tray: r(trayEl),
    harmful: r(trayEl?.querySelector('.buffBox.harmful')), beneficial: r(trayEl?.querySelector('.buffBox.beneficial')),
    circle: r(trayEl?.querySelector('.buffCircle')), vw: window.innerWidth, column: r(document.getElementById('utilityBar')),
    combatTop: ci ? parseFloat(getComputedStyle(ci).top) : null,
  };
});
await phone.screenshot({ path: join(shotDir, `buff-tray-${label}-phone.png`) });
check('Phone: the tray sits under the Focus/XP bars, harmful row above beneficial (D8, D21)',
  geo.visible && geo.parent === 'vitalSigns' && geo.tray && geo.xp && geo.tray.top >= geo.xp.bottom - 1
    && geo.harmful.top < geo.beneficial.top && geo.combatTop >= geo.tray.bottom - 1,
  `parent ${geo.parent}, xp bottom ${f1(geo.xp?.bottom)}, tray ${f1(geo.tray?.top)}-${f1(geo.tray?.bottom)}, harmful top ${f1(geo.harmful?.top)}, beneficial top ${f1(geo.beneficial?.top)}, combat indicator top ${f1(geo.combatTop)}`);
check('Phone: a 36 px circle anchored at the right edge of the free strip, left of the tile column',
  phoneCircle ? Math.round(geo.circle.w) === 36 && geo.circle.right <= geo.column.left && geo.column.left - geo.circle.right < 20 : null,
  phoneCircle ? `circle ${f1(geo.circle.w)} px, right edge ${f1(geo.circle.right)}, tile column left ${f1(geo.column.left)}` : `INCONCLUSIVE: no Tough circle on the phone (equip: ${phoneEquipped})`);
let tapTip = null; let holdTip = null; let liftTip = null; let onTop = null;
if (phoneCircle) {
  const bb = await phoneCircle.boundingBox();
  // A press only reaches a circle nothing else covers (the tile column did, once).
  onTop = await phone.evaluate(({ x, y }) => {
    let n = document.elementFromPoint(x, y);
    const hit = n?.closest('.buffCircle') ? 'buffCircle' : null;
    while (n && !n.id) n = n.parentElement;
    return hit || n?.id || 'nothing';
  }, { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 });
  const tipOpen = () => phone.evaluate(() => { const t = document.getElementById('skillTooltip'); return !!t && !t.classList.contains('hidden'); });
  await phone.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await phone.waitForTimeout(300);
  await phone.mouse.down(); await phone.waitForTimeout(200); await phone.mouse.up();
  await phone.waitForTimeout(700);
  tapTip = await tipOpen();
  await phone.mouse.down(); await phone.waitForTimeout(700);
  holdTip = await tipOpen() ? await phone.evaluate(() => document.getElementById('skillTooltip').textContent) : '';
  await phone.screenshot({ path: join(shotDir, `buff-tray-${label}-phone-hold.png`) });
  await phone.mouse.up(); await phone.waitForTimeout(300);
  liftTip = await tipOpen();
}
check('Phone: nothing covers the circle (a press reaches it)', phoneCircle ? onTop === 'buffCircle' : null,
  phoneCircle ? `on top at the circle's centre: ${onTop}` : 'INCONCLUSIVE: no circle');
check('Phone: hovering and a 200 ms tap open no tooltip (D12)', phoneCircle ? tapTip === false : null,
  phoneCircle ? `tooltip open after the tap: ${tapTip}` : 'INCONCLUSIVE: no circle');
check('Phone: a 700 ms hold opens the tooltip, lifting closes it (D12)',
  phoneCircle ? /Tough/.test(holdTip) && /permanent/.test(holdTip) && liftTip === false : null,
  phoneCircle ? `held: ${JSON.stringify(holdTip.slice(-80))}; open after lifting: ${liftTip}` : 'INCONCLUSIVE: no circle');

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
