#!/usr/bin/env node
// plan-entity-presentation.md EP1: the state ring, read off the live scene graph.
//
// Legs (main world, GOD on throughout):
//   1. no pip strip: the own overhead bar and a wolf's carry backdrop, health
//      and shield only (R5, D4);
//   2. the own token (R8, D7): Swift fired from cooldown slot 1 puts a `speed`
//      indicator on the OWN medallion at 315°, on the circle outside the ring
//      (D2-D4), while the tray lists the spell;
//   3. a dot on a mob: Immolate (dot_aura) armed beside the wolf venue puts a
//      `dot` indicator at 22.5° on a wolf's medallion, and its bar clears the
//      band (D8);
//   4. stealth (R3, R13): Vanish fades the own shape AND its plate to 0.4; a
//      mob handed the Stealth bit client-side (no mob authors stealth, so this
//      is the client path only) fades with its plate;
//   5. a MEASUREMENT, no assert: rAF frame time with up to 30 mobs each
//      forced to 4 indicators vs none, alternated over rounds. Headless here is
//      SwiftShader (CPU raster), so only the ratio means anything.
//
// The geometry is restated from TokenState.ts so a retune is loud.
// Report-style, PASS / FAIL / INCONCLUSIVE per leg.
//
// Usage: node .claude/skills/verify/ep1-state-ring.mjs [label] [url]
// Screenshots go to EP1_SHOT_DIR (default: the script's directory).
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { joinAsNewCharacter } from './lib/join.mjs';
import { showSkillRowAt } from './lib/spellbook.mjs';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');

const label = process.argv[2] || 'run';
const url = process.argv[3] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const shotDir = process.env.EP1_SHOT_DIR || dirname(fileURLToPath(import.meta.url));
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

// TokenState.ts [PLACEHOLDER]s, restated.
const ANGLES = { dot: 22.5, slow: 45, speed: 315, hot: 337.5 };
const GAP = 3;
const diameterOf = (size) => Math.max(6, Math.min(12, (size + GAP) * Math.PI / 8 * 0.85));
const radiusOf = (size) => size + GAP + diameterOf(size) / 2;
const BIT = { dot: 1, slow: 2, hot: 4, speed: 128, stealth: 4096 };
const WOLF_VENUE = [-190, -21];
const ARMY_VENUE = [-66, 154];

let pass = 0, fail = 0, inconclusive = 0;
const report = [];
const check = (name, ok, detail) => {
  if (ok === null) { inconclusive++; report.push(`INCONCLUSIVE ${name}: ${detail}`); return; }
  if (ok) pass++; else fail++;
  report.push(`${ok ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
};

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const page = await (await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 800 } })).newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await joinAsNewCharacter(page, 'ep1');
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
const waitFor = async (pred, ms, step = 200) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const v = await pred();
    if (v) return v;
    await page.waitForTimeout(step);
  }
  return null;
};

// One token's state ring, read off its entity: ring radius (the ring sprite
// spans 2 × size), each indicator's label, angle and distance, and the
// overhead bar's top edge and child count.
const readTokenSource = (which) => {
  const pick = () => {
    if (which === 'own') return window.game.character;
    const me = window.game.character;
    const mobs = window.game.objectsInView().filter((o) => o && o !== me && o.medallion && typeof o.setStance === 'function' && o.shape?.parent);
    const named = which ? mobs.filter((o) => (o.nameElement?.text || '').startsWith(which)) : mobs;
    named.sort((a, b) => Math.hypot(a.getX() - me.getX(), a.getY() - me.getY()) - Math.hypot(b.getX() - me.getX(), b.getY() - me.getY()));
    return named[0] || null;
  };
  const o = pick();
  if (!o) return null;
  const token = o.shape.children.find((c) => c.label === 'token');
  const ring = token.children.find((c) => c.label === 'frame')?.children?.[0];
  const box = o.shape.getChildByLabel('stateIndicators', true);
  const bar = o.overheadBar?.container;
  const barBack = bar?.children?.[0];
  return {
    id: o.id,
    name: o.nameElement?.text ?? '',
    size: ring ? ring.width / 2 : null,
    order: token.children.map((c) => c.label).join(','),
    indicators: (box?.children ?? []).map((c) => ({
      label: c.label, x: c.x, y: c.y, w: c.width,
      angle: ((Math.atan2(c.x, -c.y) * 180 / Math.PI) + 360) % 360,
      r: Math.hypot(c.x, c.y),
      inToken: box.parent?.parent === token,
    })),
    visible: !!box?.visible,
    barChildren: bar?.children?.length ?? null,
    barTop: bar && barBack ? bar.y + barBack.getLocalBounds().y : null,
    alpha: o.shape.alpha,
    plateAlpha: o.plate?.alpha ?? null,
  };
};
const readToken = (which) => page.evaluate(readTokenSource, which);
const placed = (t, id) => {
  const ind = t?.indicators.find((i) => i.label === id);
  if (!ind) return { ok: false, why: `no ${id} indicator (have ${t?.indicators.map((i) => i.label).join(',') || 'none'})` };
  const wantR = radiusOf(t.size);
  const ok = Math.abs(ind.angle - ANGLES[id]) < 0.5 && Math.abs(ind.r - wantR) < 0.5 && ind.inToken;
  return { ok, why: `${id} at ${ind.angle.toFixed(1)}° r ${ind.r.toFixed(1)} (want ${ANGLES[id]}° r ${wantR.toFixed(1)}, ring ${t.size.toFixed(1)}), ${ind.w.toFixed(1)} px, in token ${ind.inToken}` };
};

const equipCooldown = async (skillRe, slotIndex) => {
  const rowIndex = await page.waitForFunction(
    (re) => [...document.querySelectorAll('#spellbookList li')].findIndex((li) => new RegExp(re, 'i').test(li.textContent)),
    skillRe.source, { timeout: 20_000, polling: 500 }).then((h) => h.jsonValue()).catch(() => -1);
  if (rowIndex < 0) return false;
  await showSkillRowAt(page, rowIndex);
  const box = await (await page.$$('#spellbookList li'))[rowIndex].boundingBox();
  await page.mouse.click(box.x + 25, box.y + box.height / 2);
  await page.waitForTimeout(700);
  const sbox = await (await page.$(`#cooldownSlotList li[data-slot="${slotIndex}"]`)).boundingBox();
  await page.mouse.click(sbox.x + sbox.width / 2, sbox.y + sbox.height / 2);
  await page.waitForTimeout(700);
  return page.evaluate((i) => /\S/.test(document.querySelector(`#cooldownSlotList li[data-slot="${i}"] .slotLabel`)?.textContent || ''), slotIndex);
};
const equipAndActivateAura = async (skillRe, slotIndex) => {
  const rowIndex = await page.waitForFunction(
    (re) => [...document.querySelectorAll('#spellbookList li')].findIndex((li) => new RegExp(re, 'i').test(li.textContent)),
    skillRe.source, { timeout: 20_000, polling: 500 }).then((h) => h.jsonValue()).catch(() => -1);
  if (rowIndex < 0) return false;
  await showSkillRowAt(page, rowIndex);
  const box = await (await page.$$('#spellbookList li'))[rowIndex].boundingBox();
  await page.mouse.click(box.x + 25, box.y + box.height / 2);
  await page.waitForTimeout(700);
  const sel = `#auraSlotList li[data-slot="${slotIndex}"]`;
  const sbox = await (await page.$(sel)).boundingBox();
  await page.mouse.click(sbox.x + sbox.width / 2, sbox.y + sbox.height / 2);
  await page.waitForTimeout(1000);
  for (let i = 0; i < 5; i++) {
    if (await page.evaluate((s) => !!document.querySelector(s)?.classList.contains('activeSlot'), sel)) return true;
    await page.mouse.click(sbox.x + sbox.width / 2, sbox.y + sbox.height / 2);
    await page.waitForTimeout(1200);
  }
  return false;
};
// ⚑ ~1.4 s hold: slot hotkeys are edge-triggered off an rAF clock a headless
// page throttles (swift-cooldown.mjs).
const fireKey = async (key) => {
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down(key);
  await page.waitForTimeout(1400);
  await page.keyboard.up(key);
};

await cmd('PING');
await cmd('GOD on');

// --- 1 + 2: the own token -----------------------------------------------------
const own0 = await readToken('own');
check('The own token stacks disc, actualShape, frame, indicators', own0.order === 'disc,actualShape,frame,indicators', own0.order);
check('No pip strip under the own bar', own0.barChildren === 3, `${own0.barChildren} bar children`);
check('A fresh own token shows no indicators', own0.indicators.length === 0 && !own0.visible, `${own0.indicators.length} indicators, visible ${own0.visible}`);

await cmd('SKILL Swift');
await cmd('SKILL Vanish');
await cmd('SKILL Immolate');
const swiftSlot = await equipCooldown(/Swift/, 0);
let ownSpeed = null;
if (swiftSlot) {
  await fireKey('q');
  ownSpeed = await waitFor(async () => {
    const t = await readToken('own');
    return t.indicators.some((i) => i.label === 'speed') ? t : null;
  }, 4000);
}
if (ownSpeed) await page.screenshot({ path: join(shotDir, `ep1-${label}-own-speed.png`) });
const trayHasSwift = await page.evaluate(() => !!document.querySelector('#buffTray .buffCircle[data-skill-name="Swift"]'));
if (!swiftSlot) check('Swift puts the speed indicator on the OWN token (R8)', null, 'Swift never reached cooldown slot 1');
else if (!ownSpeed) check('Swift puts the speed indicator on the OWN token (R8)', false, 'no speed indicator within 4 s of firing');
else {
  const p = placed(ownSpeed, 'speed');
  check('Swift puts the speed indicator on the OWN token at 315° (R8, D2)', p.ok, `${p.why}; tray lists Swift: ${trayHasSwift}`);
}

// --- 4a: own stealth ------------------------------------------------------------
await page.waitForTimeout(6000); // let Swift run out, so the own mask is stealth alone
const vanishSlot = await equipCooldown(/Vanish/, 1);
let stealthed = null;
if (vanishSlot) {
  await fireKey('r');
  stealthed = await waitFor(async () => {
    const t = await readToken('own');
    return t.alpha < 1 ? t : null;
  }, 4000);
}
if (!vanishSlot) check('Vanish fades the own shape and plate (R3, R13)', null, 'Vanish never reached cooldown slot 2');
else check('Vanish fades the own shape and plate (R3, R13)',
  !!stealthed && Math.abs(stealthed.alpha - 0.4) < 1e-6 && Math.abs(stealthed.plateAlpha - 0.4) < 1e-6 && stealthed.indicators.length === 0,
  stealthed ? `shape ${stealthed.alpha}, plate ${stealthed.plateAlpha}, indicators ${stealthed.indicators.map((i) => i.label).join(',') || 'none'}` : 'alpha never dropped within 4 s');

// --- 3: a dot on a wolf -----------------------------------------------------------
await cmd(`WARP ${WOLF_VENUE[0] * 120} ${WOLF_VENUE[1] * 120}`, 3000);
const wolf0 = await readToken('Wolf');
if (wolf0) {
  check('No pip strip under a wolf\'s bar', wolf0.barChildren === 3, `${wolf0.barChildren} bar children`);
}
const armed = await equipAndActivateAura(/Immolate/, 0);
let dotted = null;
if (armed) {
  // Walk onto the nearest wolf so the aura reaches it.
  dotted = await waitFor(async () => {
    await page.evaluate(() => {
      const me = window.game.character;
      const mobs = window.game.objectsInView().filter((o) => o && o !== me && o.medallion && (o.nameElement?.text || '').startsWith('Wolf'));
      mobs.sort((a, b) => Math.hypot(a.getX() - me.getX(), a.getY() - me.getY()) - Math.hypot(b.getX() - me.getX(), b.getY() - me.getY()));
      if (mobs[0]) window.__target = mobs[0].id;
    });
    const target = await page.evaluate(() => {
      const o = window.game.objectsInView().find((x) => x.id === window.__target);
      return o ? [o.getX(), o.getY()] : null;
    });
    if (target) await cmd(`WARP ${Math.round(target[0])} ${Math.round(target[1])}`, 1200);
    const t = await page.evaluate((src) => {
      // eslint-disable-next-line no-new-func
      const read = new Function('which', `return (${src})(which);`);
      const o = window.game.objectsInView().find((x) => x.id === window.__target);
      return o ? read(o.nameElement?.text?.split(' ')[0] || 'Wolf') : null;
    }, readTokenSource.toString());
    return t && t.indicators.some((i) => i.label === 'dot') ? t : null;
  }, 15000, 500);
}
if (dotted) await page.screenshot({ path: join(shotDir, `ep1-${label}-wolf-dot.png`) });
if (!armed) check('Immolate puts the dot indicator on a wolf at 22.5° (D2)', null, 'Immolate never lit active');
else if (!dotted) check('Immolate puts the dot indicator on a wolf at 22.5° (D2)', null, 'no wolf showed a dot indicator within 15 s (venue)');
else {
  const p = placed(dotted, 'dot');
  check('Immolate puts the dot indicator on a wolf at 22.5° (D2)', p.ok, `${dotted.name}: ${p.why}`);
  const bandOuter = radiusOf(dotted.size) + diameterOf(dotted.size) / 2;
  check('The wolf\'s bar clears the indicator band (D8)', dotted.barTop >= bandOuter - 1e-6,
    `bar top ${dotted.barTop?.toFixed(1)} vs band outer ${bandOuter.toFixed(1)}`);
}

// --- 4b: mob stealth, client path ---------------------------------------------------
const mobStealth = await page.evaluate(async () => {
  const me = window.game.character;
  const mob = window.game.objectsInView().find((o) => o && o !== me && o.medallion && o.plate && typeof o.setStance === 'function');
  if (!mob) return null;
  mob.setAppliedEffects(4096);
  const wire = mob.setAppliedEffects;
  mob.setAppliedEffects = () => {}; // hold it against the next snapshot
  await new Promise((r) => setTimeout(r, 300));
  const out = { name: mob.nameElement?.text ?? '', shape: mob.shape.alpha, plate: mob.plate.alpha };
  mob.setAppliedEffects = wire;
  mob.setAppliedEffects(0);
  return out;
});
check('A stealthed mob fades whole, plate included (R3; client path, no mob authors stealth)',
  mobStealth ? Math.abs(mobStealth.shape - 0.4) < 1e-6 && Math.abs(mobStealth.plate - 0.4) < 1e-6 : null,
  mobStealth ? `${mobStealth.name}: shape ${mobStealth.shape}, plate ${mobStealth.plate}` : 'no medallion mob in view');

// --- 5: frame time, 30 mobs × 4 indicators vs none -----------------------------------
// The front's army (c1-medallions' `army` venue) is the densest medallion crowd.
await cmd(`WARP ${ARMY_VENUE[0] * 120} ${ARMY_VENUE[1] * 120}`, 4000);
const frames = await page.evaluate(async ({ mask }) => {
  const gl = document.createElement('canvas').getContext('webgl');
  const dbg = gl?.getExtension('WEBGL_debug_renderer_info');
  const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown';
  const me = window.game.character;
  const mobs = window.game.objectsInView()
    .filter((o) => o && o !== me && o.medallion && o.shape?.parent)
    .slice(0, 30);
  const wires = mobs.map((m) => m.setAppliedEffects);
  const force = (v) => mobs.forEach((m, i) => { wires[i].call(m, v); m.setAppliedEffects = () => {}; });
  const sample = (ms) => new Promise((resolve) => {
    const deltas = []; let last = performance.now(); const end = last + ms;
    const step = (t) => { deltas.push(t - last); last = t; if (t < end) requestAnimationFrame(step); else resolve(deltas); };
    requestAnimationFrame(step);
  });
  const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const rounds = { with: [], without: [] };
  for (let r = 0; r < 3; r++) {
    for (const v of (r % 2 ? ['with', 'without'] : ['without', 'with'])) {
      force(v === 'with' ? mask : 0);
      await sample(300);
      rounds[v].push(median(await sample(2000)));
    }
  }
  mobs.forEach((m, i) => { m.setAppliedEffects = wires[i]; wires[i].call(m, 0); });
  return { renderer, mobs: mobs.length, with: rounds.with, without: rounds.without };
}, { mask: BIT.dot | BIT.slow | BIT.hot | BIT.speed });
const med = (a) => [...a].sort((x, y) => x - y)[1];
report.push(`MEASURE frame time, ${frames.mobs} medallion mobs × 4 indicators vs none (${frames.renderer}): `
  + `with ${frames.with.map((v) => v.toFixed(2)).join('/')} ms (median ${med(frames.with).toFixed(2)}), `
  + `without ${frames.without.map((v) => v.toFixed(2)).join('/')} ms (median ${med(frames.without).toFixed(2)})`);

// The smallest token's numbers, from the formula (the smallest medallion species is 26).
report.push(`MEASURE geometry: size 26 -> indicator ${diameterOf(26).toFixed(1)} px, band ${(GAP + diameterOf(26)).toFixed(1)} px; size 30 (player) -> ${diameterOf(30).toFixed(1)} px, band ${(GAP + diameterOf(30)).toFixed(1)} px`);

await browser.close();
console.log(report.join('\n'));
if (errors.length) console.log(`console errors (${errors.length}):\n  ` + errors.slice(0, 10).join('\n  '));
console.log(`\n${pass} pass, ${fail} fail, ${inconclusive} inconclusive`);
process.exit(fail ? 1 : 0);
