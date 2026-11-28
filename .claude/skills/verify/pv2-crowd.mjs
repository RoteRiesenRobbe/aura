#!/usr/bin/env node
// plan-playtest-versions.md PV2b (D8 + D9): crowd resistance's wire field
// Mob.crowd_resist and its badge under the bar, on the live world, three
// clients.
//
// ⚑ Boot aurad with a SCRATCH conf, never a repo conf (D1, L4):
//   AURAD_CONF=<copy of backend/conf.json + game.mob: damageFactor 1.1,
//   healthFactor 1.1, crowdPerAttacker 0.1, crowdCap 0.5>
//   ./aurad -dev -content ../api
// Version B's values [PLACEHOLDER]: three players on one mob read 20.
// ⚑ Fighters run GOD ON. This harness reads the wire percent, which follows
// the players' rows on the mob's threat table; GOD only skips the player's own
// takeDamage, so L8 (test DAMAGE with GOD off) does not bind it. With GOD off
// the observer died while the other clients joined (PV2's b15).
//
// Legs (boars are prey: they fight back, never aggro first):
//   1. a summon alone shows nothing: A (Damage aura) + A's Fire Totem on the
//      boars for 12 s, before B and C join: every mob in view reads 0 (R2),
//      with the preconditions that the totem exists and a boar was hurt;
//   2. three players read 20: A, B, C (Damage aura) on the Alpha Boar; within
//      20 s a mob reads crowd_resist 20 on the wire, its `crowdBadge` row is
//      shown with the text "20%", sits under the bar, and the nameplate hangs
//      clear below it (L10); then B and C walk ~2.5 u away alive and it still
//      reads 20 (R8: no recency window), and with the mob uncovered a
//      screenshot of the badge;
//   3. a reset clears it: all three WARP ~45 u off (the leash: 3 s with the
//      target out of the sensor), then A alone comes back with its aura ON. Without a
//      reset, B's and C's rows still count (R8: no window) and A's hits relight
//      the badge: FAIL. After a reset A is the only row: it stays at 0. Every
//      aura is off between legs 2 and 3, or the party kills the mob.
// ⚑ Three clients, not four: a fourth in-world page never got past world
// entry (2026-11-28, the open join hang).
// Report-style, PASS / FAIL / INCONCLUSIVE per leg.
//
// Usage: node .claude/skills/verify/pv2-crowd.mjs [label] [url]
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { joinAsNewCharacter } from './lib/join.mjs';
import { closeSpellbook, showSkillRowAt } from './lib/spellbook.mjs';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');

const label = process.argv[2] || 'run';
const url = process.argv[3] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const shotDir = process.env.PV2_SHOT_DIR || dirname(fileURLToPath(import.meta.url));
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

const THREE = 20; // round((3 - 1) × crowdPerAttacker 0.1 × 100)
const VENUE = { x: -195.8, y: -9.2 }; // seven boars within ~4 u (world.json, farmlands)
const ALPHA = { x: -214.6, y: 34.4 }; // the Alpha Boar (brackenfold, L4 elite prey)
const wire = (p) => `${Math.round(p.x * 120)} ${Math.round(p.y * 120)}`;

let pass = 0, fail = 0, inconclusive = 0;
const report = [];
const check = (name, ok, detail) => {
  if (ok === null) { inconclusive++; report.push(`INCONCLUSIVE ${name}: ${detail}`); return; }
  if (ok) pass++; else fail++;
  report.push(`${ok ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
};

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const errors = [];

const newPlayer = async (topic) => {
  const page = await (await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 800 } })).newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${topic}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${topic}] pageerror: ${e.message}`));
  // ⚑ Joins hang intermittently at world entry (open, verify skill); one
  // reload and a second join is the documented rerun, per client.
  for (let attempt = 1; ; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
      await joinAsNewCharacter(page, topic);
      break;
    } catch (e) {
      console.error(`[${topic}] join attempt ${attempt} hung`);
      if (attempt >= 2) throw e;
      report.push(`note: ${topic} join attempt 1 hung, retrying`);
    }
  }
  await page.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
  await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
  await page.evaluate(() => { const p = document.getElementById('developPanel'); if (p) p.style.display = 'none'; });
  return page;
};

const cmd = async (page, text, wait = 700) => {
  await page.evaluate((t) => {
    const input = document.getElementById('console_command');
    input.value = t;
    document.getElementById('console').dispatchEvent(new Event('submit', { cancelable: true }));
  }, text);
  if (wait) await page.waitForTimeout(wait);
};

const pickSkill = async (page, re) => {
  const i = await page.waitForFunction(
    (src) => [...document.querySelectorAll('#spellbookList li')].findIndex((li) => new RegExp(src, 'i').test(li.textContent)),
    re.source, { timeout: 20_000, polling: 500 }).then((h) => h.jsonValue()).catch(() => -1);
  if (i < 0) return false;
  await showSkillRowAt(page, i);
  const box = await (await page.$$('#spellbookList li'))[i].boundingBox();
  await page.mouse.click(box.x + 25, box.y + box.height / 2);
  await page.waitForTimeout(700);
  return true;
};

// Aura slot 1 on or off; the active slot toggles on a click.
const AURA_SLOT = '#auraSlotList li[data-slot="0"]';
const setAura = async (page, on) => {
  const box = await (await page.$(AURA_SLOT)).boundingBox();
  const isOn = () => page.evaluate((s) => !!document.querySelector(s)?.classList.contains('activeSlot'), AURA_SLOT);
  for (let i = 0; i < 5 && (await isOn()) !== on; i++) {
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(1000);
  }
  return (await isOn()) === on;
};

const equipAura = async (page, re) => {
  if (!await pickSkill(page, re)) return false;
  const box = await (await page.$(AURA_SLOT)).boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForFunction((src) => new RegExp(src, 'i').test(document.querySelector('#auraSlotList')?.textContent || ''),
    re.source, { timeout: 20_000 }).catch(() => null);
  await page.waitForTimeout(1000);
  return true;
};

// The slot shows the skill as a pack icon with no label text, so read its id.
const equipCooldown = async (page, re) => {
  if (!await pickSkill(page, re)) return false;
  const box = await (await page.$('#cooldownSlotList li[data-slot="0"]')).boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(700);
  return page.evaluate(() => !!document.querySelector('#cooldownSlotList li[data-slot="0"]')?.dataset.skillId);
};

const fireKey = async (page, key) => {
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down(key);
  await page.waitForTimeout(1400);
  await page.keyboard.up(key);
};

// One sample of every mob in view (one evaluate = one moment): id, name, the
// last wire crowd_resist and health ratio the snapshot fed, the badge row as
// drawn, and the y of the bar's bottom edge and the nameplate's top in the
// mob's frame. setHealth and setCrowdResist are wrapped once per mob.
const sampleMobs = (page) => page.evaluate(() => {
  const me = window.game.character;
  return window.game.objectsInView()
    .filter((o) => o && o !== me && typeof o.setCrowdResist === 'function' && o.shape?.parent && o.medallion)
    .map((o) => {
      if (!o.__pv2) {
        o.__pv2 = true;
        const hp = o.setHealth.bind(o);
        o.setHealth = (h, max) => { o.__hp = max ? h / max : null; return hp(h, max); };
        const crowd = o.setCrowdResist.bind(o);
        o.setCrowdResist = (p) => { o.__crowd = p; return crowd(p); };
      }
      const badge = o.shape.getChildByLabel('crowdBadge', true);
      const bar = o.overheadBar?.container;
      const barBottom = bar ? bar.getLocalBounds().maxY + bar.y : null;
      const g = o.shape.getGlobalPosition();
      return {
        id: o.id, name: o.nameElement?.text ?? '', crowd: o.__crowd ?? null, hp: o.__hp ?? null,
        badge: badge ? {
          visible: badge.visible, text: badge.children.find((c) => typeof c.text === 'string')?.text ?? '',
          top: badge.y + badge.getLocalBounds().minY, bottom: badge.y + badge.getLocalBounds().maxY,
          iconTexture: !!badge.children[0]?.texture?.width,
        } : null,
        barBottom, nameTop: o.nameElement ? o.nameElement.y : null,
        screen: { x: g.x, y: g.y },
        x: o.getX() / 120, y: o.getY() / 120,
      };
    });
});
const focusOf = (page) => page.evaluate(() => document.querySelector('#healthBar .barText')?.textContent?.trim() || '');

// --- 1: one player + a summon, before B and C join ----------------------------
const A = await newPlayer('crowdsolo');
await cmd(A, 'GOD on');
await cmd(A, 'XP 1700');
await cmd(A, 'SKILL Damage');
await cmd(A, 'SKILL FireTotem');
const aAura = await equipAura(A, /Damage/);
const aTotem = await equipCooldown(A, /Fire Totem/);
// The totem is cast with A's aura OFF (a hit interrupts the cast), retried
// until a new medallion stands beside A.
await setAura(A, false);
await cmd(A, 'WARP ' + wire(VENUE), 3000);
let totem = null;
for (let cast = 1; cast <= 3 && !totem; cast++) {
  const before = await A.evaluate(() => window.game.objectsInView().map((o) => o?.id));
  await fireKey(A, 'q');
  for (let t = 0; t < 20 && !totem; t++) {
    totem = await A.evaluate((seen) => {
      const me = window.game.character;
      const o = window.game.objectsInView().find((x) => x && x !== me && !seen.includes(x.id) && x.medallion
        && Math.hypot(x.getX() - me.getX(), x.getY() - me.getY()) < 3 * 120 && x.shape?.parent);
      return o ? { id: o.id } : null;
    }, before);
    if (!totem) await A.waitForTimeout(200);
  }
  if (totem) report.push(`leg 1: totem #${totem.id} on cast ${cast}`);
}
const aOn = await setAura(A, true);
let soloLit = null, soloHurt = false, soloSeen = 0;
for (let t = 0; t < 40; t++) {
  const mobs = await sampleMobs(A);
  soloSeen = Math.max(soloSeen, mobs.length);
  for (const m of mobs) {
    if (m.hp !== null && m.hp < 1) soloHurt = true;
    if (m.crowd > 0) soloLit = soloLit || m;
  }
  await A.waitForTimeout(300);
}
const leg1 = 'A summon alone shows no crowd resistance (R2)';
if (!aAura || !aOn) check(leg1, null, `A's Damage aura never armed (equip ${aAura}, on ${aOn})`);
else if (!totem) check(leg1, null, `no totem after three casts (slot holds a skill: ${aTotem}); one player alone lit ${soloLit ? 'a mob' : 'nothing'}`);
else if (!soloHurt) check(leg1, null, `no mob in view was hurt in 12 s (${soloSeen} mobs seen)`);
else check(leg1, !soloLit, soloLit ? `${soloLit.name} #${soloLit.id} read ${soloLit.crowd} with one player + totem` : `0 of ${soloSeen} mobs above 0 with one player + totem #${totem.id}`);

// --- 2: three players, on the Alpha Boar --------------------------------------
// ⚑ The third join hung at world entry in every run with two pages already in
// the world (2026-11-28): the in-world pages shrink to 200×150 while a client
// joins, cutting their render cost (window.game.pause() throws here). A join
// that still hangs ends the run with the legs scored so far printed.
const finish = async () => {
  check('No console errors', errors.length === 0, errors.length ? errors.slice(0, 5).join(' | ') : '0');
  console.log(report.join('\n'));
  console.log(`\npv2-crowd ${label}: ${pass} PASS, ${fail} FAIL, ${inconclusive} INCONCLUSIVE`);
  await browser.close();
  process.exit(fail ? 1 : 0);
};
const joinPaused = async (topic, inWorld) => {
  for (const p of inWorld) await p.setViewportSize({ width: 200, height: 150 });
  try {
    return await newPlayer(topic);
  } catch (e) {
    check('Three players read 20 on the wire (D8, D9)', null, `${topic} never got into the world (join hang)`);
    return finish();
  } finally {
    for (const p of inWorld) await p.setViewportSize({ width: 1280, height: 800 }).catch(() => {});
  }
};
// A stays at the venue while B and C join (HOME would move nobody: a fresh
// harness character has no bound campfire).
const B = await joinPaused('crowdtwo', [A]);
const C = await joinPaused('crowdthree', [A, B]);
for (const p of [B, C]) {
  await cmd(p, 'GOD on');
  await cmd(p, 'XP 1700');
  await cmd(p, 'SKILL Damage');
}
const bAura = await equipAura(B, /Damage/) && await setAura(B, true);
const cAura = await equipAura(C, /Damage/) && await setAura(C, true);
// The Alpha wanders off its spawn point, and prey never closes in on its own
// (b16: three auras on, every mob at full health 1.7 u away). A goes first and
// reads where it actually stands; all three land on it.
await cmd(A, 'WARP ' + wire(ALPHA), 3000);
const alpha = (await sampleMobs(A)).filter((m) => /^Alpha Boar/.test(m.name))
  .sort((a, b) => Math.hypot(a.x - ALPHA.x, a.y - ALPHA.y) - Math.hypot(b.x - ALPHA.x, b.y - ALPHA.y))[0];
const at = alpha ? { x: alpha.x, y: alpha.y } : ALPHA;
report.push(`leg 2: Alpha Boar ${alpha ? `#${alpha.id} at (${at.x.toFixed(1)}, ${at.y.toFixed(1)})` : 'not in view, using its spawn'}`);
await cmd(A, 'WARP ' + wire({ x: at.x - 0.3, y: at.y }), 0);
await cmd(B, 'WARP ' + wire({ x: at.x + 0.3, y: at.y }), 0);
await cmd(C, 'WARP ' + wire({ x: at.x, y: at.y + 0.3 }));
let lit = null, litAt = 0;
for (let t = 0; t < 66 && !lit; t++) {
  const mobs = (await sampleMobs(A)).filter((m) => m.crowd === THREE);
  mobs.sort((a, b) => (b.hp ?? 1) - (a.hp ?? 1));
  lit = mobs[0] || null;
  if (lit) litAt = Date.now(); else await A.waitForTimeout(300);
}
if (!lit) {
  const view = await sampleMobs(A);
  const near = view.filter((m) => Math.hypot(m.x - ALPHA.x, m.y - ALPHA.y) < 6)
    .map((m) => `${m.name}#${m.id} hp ${m.hp?.toFixed(2)} crowd ${m.crowd} at (${m.x.toFixed(1)}, ${m.y.toFixed(1)})`);
  const who = await Promise.all([A, B, C].map((p) => p.evaluate((s) => ({
    focus: document.querySelector('#healthBar .barText')?.textContent?.trim() || '',
    aura: !!document.querySelector(s)?.classList.contains('activeSlot'),
    at: `${(window.game.character.getX() / 120).toFixed(1)}, ${(window.game.character.getY() / 120).toFixed(1)}`,
  }), AURA_SLOT)));
  report.push(`leg 2 diag: near the Alpha ${near.join('; ') || 'nothing'}; A/B/C ${JSON.stringify(who)}`);
}
const leg2 = 'Three players read 20 on the wire (D8, D9)';
if (!bAura || !cAura) check(leg2, null, `B or C never armed the Damage aura (B ${bAura}, C ${cAura})`);
else check(leg2, !!lit, lit ? `${lit.name} #${lit.id} crowd_resist ${lit.crowd}, hp ${lit.hp?.toFixed(2)}` : `no mob in view read ${THREE} within 20 s`);
if (lit) {
  const b = lit.badge;
  check('The badge shows "20%" under the bar (D9)', !!b && b.visible && b.text === '20%' && b.top >= lit.barBottom - 0.5,
    b ? `visible ${b.visible}, text "${b.text}", row ${b.top.toFixed(1)}..${b.bottom.toFixed(1)}, bar bottom ${lit.barBottom?.toFixed(1)}, icon ${b.iconTexture}` : 'no `crowdBadge` child');
  check('The nameplate hangs clear below the badge (L10)', !!b && lit.nameTop !== null && lit.nameTop >= b.bottom - 0.5,
    `name top ${lit.nameTop?.toFixed(1)}, badge bottom ${b?.bottom.toFixed(1)}`);
  // ⚑ Every aura goes OFF now: left on, three Damage auras grind the Alpha
  // down before leg 3, it leaves A's entity list, and leg 3 read "never back
  // in view" (PV2's INCONCLUSIVE; with the auras off, b4 sampled it 50 of 50
  // times). The rows stay on the table without new hits (R8).
  await Promise.all([A, B, C].map((p) => setAura(p, false)));
  // R8: B and C walk away alive and keep counting; A steps back so no player
  // token covers the badge for the screenshot (A's aura keeps the fight on).
  await cmd(B, 'WARP ' + wire({ x: lit.x + 2.5, y: lit.y }), 0);
  await cmd(C, 'WARP ' + wire({ x: lit.x, y: lit.y + 2.5 }), 0);
  await cmd(A, 'WARP ' + wire({ x: lit.x - 0.6, y: lit.y }), 2500);
  const away = (await sampleMobs(A)).find((m) => m.id === lit.id);
  check('Walkers away alive still count (R8)', away ? away.crowd === THREE : null,
    away ? `#${lit.id} reads ${away.crowd} with B and C 2.5 u away` : `#${lit.id} left A's view`);
  // The book left open by the equip and the slot's tooltip cover the left half
  // of the view: close both, then read the mob's screen position fresh.
  await closeSpellbook(A);
  await A.mouse.move(1260, 400);
  await A.waitForTimeout(500);
  const shot = (await sampleMobs(A)).find((m) => m.id === lit.id) || away || lit;
  await A.screenshot({ path: join(shotDir, `pv2-${label}-badge.png`),
    clip: { x: Math.max(0, shot.screen.x - 120), y: Math.max(0, shot.screen.y - 80), width: 240, height: 200 } }).catch(() => {});
  await A.screenshot({ path: join(shotDir, `pv2-${label}-crowd.png`) }).catch(() => {});
}

// --- 3: a reset clears it ------------------------------------------------------
const leg3 = 'A combat reset clears the crowd resistance (D8, ResetClears)';
if (lit) {
  // ⚑ WARP, not HOME: a fresh harness character has no bound campfire, so
  // HOME answers "no campfire bound" and nobody moves (PV2's leg 3 never left
  // the sensor). The leg-1 venue is ~45 u off, far outside it.
  for (const p of [A, B, C]) await cmd(p, 'WARP ' + wire(VENUE), 0);
  await A.waitForTimeout(6000);
  await cmd(A, 'WARP ' + wire({ x: lit.x + 0.6, y: lit.y }), 1500);
  // A's hits write A's row again: after a reset the only row, before one a
  // fourth write beside B's and C's surviving rows.
  const aBack = await setAura(A, true);
  report.push(`leg 3: A's aura back on: ${aBack}`);
  let seen = null, relit = null, missing = 0;
  for (let t = 0; t < 50 && !relit; t++) {
    const mob = (await sampleMobs(A)).find((m) => m.id === lit.id);
    if (mob) { seen = mob; if (mob.crowd > 0) relit = mob; } else missing++;
    await A.waitForTimeout(300);
  }
  const focus = await Promise.all([A, B, C].map(focusOf));
  const diag = `${Math.round((Date.now() - litAt) / 1000)} s after lit; A/B/C ${JSON.stringify(focus)}; ${missing} samples without #${lit.id}`;
  if (relit) check(leg3, false, `#${lit.id} read ${relit.crowd} with A alone: B's and C's rows survived; ${diag}`);
  else if (!seen || seen.hp === 0) check(leg3, null, `#${lit.id} never back in A's view; ${diag}`);
  else check(leg3, true, `#${lit.id} at 0 with A's aura on it, badge ${seen.badge?.visible ? 'shown' : 'hidden'}, hp ${seen.hp?.toFixed(2)}; ${diag}`);
} else {
  check(leg3, null, 'leg 2 lit nothing');
}

check('No console errors', errors.length === 0, errors.length ? errors.slice(0, 5).join(' | ') : '0');
console.log(report.join('\n'));
console.log(`\npv2-crowd ${label}: ${pass} PASS, ${fail} FAIL, ${inconclusive} INCONCLUSIVE`);
await browser.close();
process.exit(fail ? 1 : 0);
