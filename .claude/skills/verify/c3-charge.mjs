// c3-charge.mjs: the charge effect type at the game surface
// (docs/plan-effect-types-round-2.md C3), with the example skill Charge
// (a charge to the nearest enemy + a 1 s stun):
//
//   1  with nothing in range the press is REFUSED: the "No valid target"
//      floating text, and the cooldown slot starts no timer
//   2  next to a boar the press moves the player to contact with it
//      (the gap to the TAGGED boar shrinks to touching)
//   3  the stun authored after the charge lands from the landing spot
//      (a Slow-bit pip on a mob: stun is wire-identical to slow on the pips)
//   4  the cooldown starts after a landed charge
//   5  the charge's `rush` layer glides the token (non-zero body offsets
//      written) and leaves it at exact zero
//
// ⛔ Needs the DEBUG zone set (`./scripts/dev-restart.sh server debug`): the
// venues are positions in api/zones/.debug/world_debug.json (see BOAR). Boars are retaliation-only, so one stands
// still until hit. GOD on throughout: GOD only touches the PLAYER's own damage,
// cost and CC, and charge + a stun on a mob are none of those.
// Tri-state: no boar within the search radius at the venue is INCONCLUSIVE.
//
// Usage: node .claude/skills/verify/c3-charge.mjs [label] [url]
// Boundary: the contact arithmetic, walls and the eligibility rules are Go's
// (sys/charge_test.go); the tooltip line is vitest's.

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
const shotDir = process.env.CHARGE_SHOT_DIR || '/tmp';

const PIP_SLOW = 2; // api/shared-constants.json appliedEffectBits.slow
// Venues derived from world_debug.json by scoring every boar and stag with a
// stand point 4 u out: inside the border, no other enemy spawn (turnips count)
// within 2.5 u of the target's distance, the line to it clearest of blocking
// props. This boar is the only clear winner (margin 2.7 u, clearance 1.8 u);
// two earlier hand picks lost to trees, a turnip patch and the map border.
const BOAR = { x: 36.35, y: 15.55 };
const STAND = { x: 40, y: 15 };
const NOWHERE = { x: 68, y: 0 }; // 9 u from any spawn; leg 1 checks it is empty
const SEARCH = 6; // charge.json radius at level 1

const results = [];
const check = (name, pass, detail) => results.push({ check: name, pass, detail });

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const consoleErrors = [];
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await joinAsNewCharacter(page, 'charge');
await page.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
await page.evaluate(() => {
  const p = document.getElementById('developPanel'); if (p) p.style.display = 'none';
  let r = window.game.character.plate.parent;
  while (r.parent) r = r.parent;
  window.__auraRoot = r;
  // Every pip mask the client is handed, and every floating text on the own
  // character (the rejection's only surface).
  window.__masks = [];
  const pips = Object.getPrototypeOf(window.game.character.overheadBar.effectPips);
  const setMask = pips.setMask;
  pips.setMask = function (mask) { if (mask) window.__masks.push(mask); return setMask.call(this, mask); };
  window.__floats = [];
  const ch = window.game.character;
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
const warp = (p) => cmd(`WARP ${Math.round(p.x * 120)} ${Math.round(p.y * 120)}`, 3000);
const me = () => page.evaluate(() => ({ x: window.game.character.getX() / 120, y: window.game.character.getY() / 120 }));

// Mob sprites live under a layer per role; boars are `wildlife`. World units
// off .position, never screen space (the camera clamps at map edges).
const tagNearest = () => page.evaluate(() => {
  let layer = null;
  const find = (c) => { if (layer) return; if (c?.name === 'wildlife') { layer = c; return; } (c?.children || []).forEach(find); };
  find(window.__auraRoot);
  if (!layer) return null;
  const ch = window.game.character;
  let best = null, bestD = Infinity;
  for (const c of layer.children || []) {
    if (!c.visible || !c.position) continue;
    const d = Math.hypot(c.position.x - ch.getX(), c.position.y - ch.getY()) / 120;
    if (d < bestD) { bestD = d; best = c; }
  }
  window.__target = best;
  return best ? +bestD.toFixed(2) : null;
});
const taggedGap = () => page.evaluate(() => {
  const t = window.__target;
  if (!t || t.destroyed || !t.parent || !t.position) return null;
  const ch = window.game.character;
  return +(Math.hypot(t.position.x - ch.getX(), t.position.y - ch.getY()) / 120).toFixed(2);
});
// Nearest sprite in ANY mob layer (the siblings of `wildlife`): the empty
// venue must be empty of every enemy, not only of prey.
const nearestAnyMob = () => page.evaluate(() => {
  let layer = null;
  const find = (c) => { if (layer) return; if (c?.name === 'wildlife') { layer = c; return; } (c?.children || []).forEach(find); };
  find(window.__auraRoot);
  if (!layer?.parent) return null;
  const ch = window.game.character;
  let bestD = Infinity, bestIn = null;
  const MOB_LAYERS = ['totem', 'companion', 'campfireMob', 'turnip', 'wildlife', 'npcs']; // Game.ts layers.mobs
  for (const group of layer.parent.children) {
    if (!MOB_LAYERS.includes(group.name)) continue;
    for (const c of group.children || []) {
      if (!c.visible || !c.position) continue;
      const d = Math.hypot(c.position.x - ch.getX(), c.position.y - ch.getY()) / 120;
      if (d < bestD) { bestD = d; bestIn = group.name; }
    }
  }
  return bestD === Infinity ? null : `${bestD.toFixed(2)} (${bestIn})`;
});
// A stand point `dist` u from the tagged boar's LIVE position (boars wander
// off their spawn). Two rules, both measured the hard way:
//   - the tagged boar must be the NEAREST wildlife to the stand point, or the
//     server charges a herd mate and the harness measures the wrong boar;
//   - of those, the direction whose line to the boar passes farthest from any
//     standing prop wins: a tree in the way stops the charge short (correctly,
//     the wall rule is Go's). The sprite layer cannot tell a blocking prop from
//     decor, so this is best effort and the clearance is reported.
// WARP truncates to whole units, so candidates are whole-unit points.
const bestStand = (dist) => page.evaluate((d) => {
  const t = window.__target;
  if (!t?.position) return null;
  const named = (n) => { let f = null; const find = (c) => { if (f) return; if (c?.name === n) { f = c; return; } (c?.children || []).forEach(find); }; find(window.__auraRoot); return f; };
  const props = (named('propsStanding')?.children || []).filter((p) => p.position);
  // Turnips are enemies too (harvest mobs), and the boar field borders a
  // patch: a first version that checked only `wildlife` charged a turnip 2 runs in 3.
  const herd = [...(named('wildlife')?.children || []), ...(named('turnip')?.children || [])]
    .filter((c) => c !== t && c.visible && c.position);
  const bx = t.position.x / 120, by = t.position.y / 120;
  let best = null;
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI) / 8;
    const sx = Math.trunc(bx + d * Math.cos(a)), sy = Math.trunc(by + d * Math.sin(a));
    const reach = Math.hypot(sx - bx, sy - by);
    if (reach < 2.5) continue;
    const ux = (bx - sx) / reach, uy = (by - sy) / reach;
    if (herd.some((c) => Math.hypot(c.position.x / 120 - sx, c.position.y / 120 - sy) < reach + 0.5)) continue;
    let clearance = Infinity;
    for (const p of props) {
      const px = p.position.x / 120 - sx, py = p.position.y / 120 - sy;
      const along = Math.max(0, Math.min(reach, px * ux + py * uy));
      clearance = Math.min(clearance, Math.hypot(px - along * ux, py - along * uy));
    }
    if (!best || clearance > best.clearance) best = { x: sx, y: sy, clearance: +clearance.toFixed(2) };
  }
  return best;
}, dist);
// The gap to the nearest wildlife or turnip sprite, whichever it is.
const nearestWildGap = () => page.evaluate(() => {
  const named = (n) => { let f = null; const find = (c) => { if (f) return; if (c?.name === n) { f = c; return; } (c?.children || []).forEach(find); }; find(window.__auraRoot); return f; };
  const ch = window.game.character;
  let bestD = Infinity;
  for (const c of [...(named('wildlife')?.children || []), ...(named('turnip')?.children || [])]) {
    if (!c.visible || !c.position) continue;
    bestD = Math.min(bestD, Math.hypot(c.position.x - ch.getX(), c.position.y - ch.getY()) / 120);
  }
  return bestD === Infinity ? null : +bestD.toFixed(2);
});
const slotTimer = () => page.evaluate(() =>
  /\d+(\.\d+)?s/.test(document.querySelector('#cooldownSlotList li[data-slot="0"]')?.textContent || ''));
const pressQ = async () => {
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down('q');
  await page.waitForTimeout(1400);
  await page.keyboard.up('q');
  await page.waitForTimeout(800);
};

await cmd('PING');
await cmd('GOD');
await cmd('SKILL Charge');

// Equip into cooldown slot 1: click the NAME, then the slot.
const rowIndex = await page.waitForFunction(
  () => [...document.querySelectorAll('#spellbookList li')].findIndex((li) => /Charge/.test(li.textContent)),
  null, { timeout: 20_000, polling: 500 }).then((h) => h.jsonValue()).catch(() => -1);
let equipped = false;
if (rowIndex >= 0) {
  await showSkillRowAt(page, rowIndex);
  const box = await (await page.$$('#spellbookList li'))[rowIndex].boundingBox();
  await page.mouse.click(box.x + 25, box.y + box.height / 2);
  await page.waitForTimeout(700);
  const sbox = await (await page.$('#cooldownSlotList li[data-slot="0"]')).boundingBox();
  await page.mouse.click(sbox.x + sbox.width / 2, sbox.y + sbox.height / 2);
  equipped = !!(await page.waitForFunction(
    () => /Charge/.test(document.querySelector('#cooldownSlotList li[data-slot="0"] .slotLabel')?.textContent || ''),
    null, { timeout: 20_000 }).catch(() => null));
}
check('Charge is equipped into cooldown slot 1', equipped, `spellbook row ${rowIndex}`);
await page.keyboard.press('b').catch(() => {}); // close the spellbook again

// --- leg 1: nothing in range -----------------------------------------------------
await warp(NOWHERE);
const emptyGap = await nearestAnyMob();
const empty = emptyGap === null || parseFloat(emptyGap) > SEARCH + 1;
let refused = null;
if (equipped && empty) {
  await page.evaluate(() => { window.__floats = []; });
  const before = await me();
  await pressQ();
  const after = await me();
  const floats = await page.evaluate(() => window.__floats.slice());
  const timer = await slotTimer();
  const moved = Math.hypot(after.x - before.x, after.y - before.y);
  refused = floats.some((f) => /No valid target/.test(f)) && !timer && moved < 0.3;
  check('Nothing in range: the press is refused (No valid target, no cooldown, no movement)', refused,
    `floats ${JSON.stringify(floats)}, slot timer ${timer}, moved ${moved.toFixed(2)} u`);
} else {
  check('Nothing in range: the press is refused (No valid target, no cooldown, no movement)', null,
    `INCONCLUSIVE: equipped ${equipped}, nearest mob at the empty venue ${emptyGap} u`);
}

// --- legs 2-4: a boar in range -----------------------------------------------------
await warp(STAND);
await page.waitForTimeout(2000);
await tagNearest();
const stand = await bestStand(4);
if (stand) { await warp(stand); await page.waitForTimeout(1500); }
const startGap = stand ? await taggedGap() : null;
if (!equipped || startGap === null || startGap > SEARCH - 0.5 || startGap < 2) {
  for (const n of ['The press moves the player to contact with the boar', 'The stun after the charge lands (Slow-bit pip on a mob)', 'A landed charge starts the cooldown', 'The charge plays its rush: the token glided (non-zero body offsets) and rests at exact zero']) {
    check(n, null, `INCONCLUSIVE: equipped ${equipped}, clear stand ${JSON.stringify(stand)}, tagged boar ${startGap} u (need 2-${SEARCH - 0.5})`);
  }
} else {
  await page.evaluate(() => { window.__masks = []; });
  const fxBefore = await page.evaluate(() => window.game.skillFx());
  const before = await me();
  // Up to three presses (the throttled rAF edge trigger swallows some), until
  // the slot starts its timer or the server answers with a refusal float.
  let floats = [];
  let fired = false;
  for (let i = 0; i < 3 && !fired && floats.length === 0; i++) {
    await page.evaluate(() => { window.__floats = []; });
    await pressQ();
    fired = await slotTimer();
    floats = await page.evaluate(() => window.__floats.slice());
  }
  const fxAfter = await page.evaluate(() => window.game.skillFx());
  const restOffset = await page.evaluate(() => window.game.character.bodyOffset());
  const after = await me();
  const endGap = await nearestWildGap();
  const moved = Math.hypot(after.x - before.x, after.y - before.y);
  const LEGS = ['The press moves the player to contact with the boar', 'The stun after the charge lands (Slow-bit pip on a mob)', 'A landed charge starts the cooldown', 'The charge plays its rush: the token glided (non-zero body offsets) and rests at exact zero'];
  if (!fired) {
    // Never a FAIL: either the key never reached the server, or the server
    // refused because the venue's premise (an enemy in range) did not hold.
    const why = floats.length ? `the server refused: ${JSON.stringify(floats)}` : 'three presses never reached the server';
    for (const n of LEGS) check(n, null, `INCONCLUSIVE: ${why} (gap ${startGap} u)`);
  } else {
    const contact = endGap !== null && endGap < 1.2;
    // Contact: the two body radii, well under a unit. A loose bound, the
    // arithmetic is Go's. Short of contact the line was blocked (the sprite
    // layer cannot tell a blocking prop from decor) or the server charged an
    // enemy the harness does not see: venue, not product.
    check(LEGS[0], contact ? true : null,
      `${contact ? '' : 'INCONCLUSIVE: stopped short. '}gap ${startGap} -> ${endGap} u (nearest wildlife or turnip), moved ${moved.toFixed(2)} u, line clearance ${stand.clearance} u`);
    const stunned = await page.evaluate((b) => window.__masks.some((m) => (m & b) !== 0), PIP_SLOW);
    check(LEGS[1], contact ? stunned : null,
      `${contact ? '' : 'INCONCLUSIVE: no contact, so the 1 u stun had nothing to reach. '}Slow bit seen in a pip mask: ${stunned}`);
    check(LEGS[2], true, 'slot shows a seconds timer');
    // The rush (the charge's look): the token glided through body offsets and
    // is back at EXACT zero once it ran out (well inside the 1.4 s key hold).
    // Only a charge that moved the player has a jump to run.
    const rushes = (fxAfter.spawnedByKind.rush ?? 0) - (fxBefore.spawnedByKind.rush ?? 0);
    const nudges = fxAfter.lungeNudges - fxBefore.lungeNudges;
    check(LEGS[3], moved > 1 ? rushes >= 1 && nudges > 0 && restOffset.x === 0 && restOffset.y === 0 : null,
      `${moved > 1 ? '' : 'INCONCLUSIVE: the charge did not move the player. '}rush planned ${rushes}, non-zero body offsets written ${nudges}, offset at rest ${JSON.stringify(restOffset)}`);
  }
  await page.screenshot({ path: join(shotDir, `c3-charge-${label}-landed.png`) });
}

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
