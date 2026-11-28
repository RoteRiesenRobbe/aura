#!/usr/bin/env node
// plan-playtest-versions.md PV2 (D3 + D4): crowd scaling's glyph bit, read off
// the wire on the live world, three clients.
//
// ⚑ Boot aurad with a SCRATCH conf, never a repo conf (D1, L4):
//   AURAD_CONF=<copy of backend/conf.json + game.mob: damageFactor 1.1,
//   healthFactor 1.1, crowdPerAttacker 0.25, crowdCap 1, crowdWindow 3000>
//   ./aurad -dev -content ../api
// Version B's values, except the window: the long one (100 s, harness-only)
// means a living, connected attacker leaves the count only through a combat
// reset, so leg 3 proves the reset path, not R5's window (a Go test owns that
// boundary).
// ⚑ Fighters run GOD ON. This harness reads the glyph bit, which follows the
// players' hits on the mob; GOD only skips the player's own takeDamage, so L8
// (test DAMAGE with GOD off) does not bind it. With GOD off the observer died
// while the other clients joined (b15: A at Focus 0 at the leg-1 venue), which
// is what lost leg 3's subject in earlier runs.
//
// Legs (boars are prey: they fight back, never aggro first):
//   1. a summon alone does not light it: A (Damage aura) + A's Fire Totem on
//      the boars for 12 s, before B and C join: no mob in view carries bit 15
//      (R2), with the preconditions that the totem exists and a boar was hurt;
//   2. three players light it: A, B, C (Damage aura) on the Alpha Boar; within
//      20 s a mob carries bit 15 on the wire, and its medallion draws the
//      `crowd` indicator at 202.5° (D4);
//   3. a reset clears it: all three go HOME (the leash: 3 s with the target out
//      of the sensor), then A alone comes back with its aura ON. Without a
//      reset, B's and C's rows still count (100 s window) and A's hits relight
//      the bit: FAIL. After a reset A is the only row: the bit stays dark.
// ⚑ Three clients, not four: a fourth in-world page here never got past world
// entry (2026-11-28, the open join hang).
// Report-style, PASS / FAIL / INCONCLUSIVE per leg.
//
// Usage: node .claude/skills/verify/pv2-crowd.mjs [label] [url]
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
const shotDir = process.env.PV2_SHOT_DIR || dirname(fileURLToPath(import.meta.url));
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

const CROWD = 1 << 15; // api/shared-constants.json appliedEffectBits.crowd
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
// wire mask, the last health ratio the snapshot fed, and the crowd indicator's
// angle when drawn. setHealth is wrapped once per mob to keep the ratio.
const sampleMobs = (page) => page.evaluate(() => {
  const me = window.game.character;
  return window.game.objectsInView()
    .filter((o) => o && o !== me && typeof o.setAppliedEffects === 'function' && o.shape?.parent && o.medallion)
    .map((o) => {
      if (!o.__pv2) {
        o.__pv2 = true;
        const orig = o.setHealth.bind(o);
        o.setHealth = (h, max) => { o.__hp = max ? h / max : null; return orig(h, max); };
      }
      const box = o.shape.getChildByLabel('stateIndicators', true);
      const ind = (box?.children ?? []).find((c) => c.label === 'crowd');
      return {
        id: o.id, name: o.nameElement?.text ?? '', mask: o.appliedMask ?? 0, hp: o.__hp ?? null,
        crowdAngle: ind ? ((Math.atan2(ind.x, -ind.y) * 180 / Math.PI) + 360) % 360 : null,
        glyph: ind ? !!ind.texture : null,
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
    if (m.mask & CROWD) soloLit = soloLit || m;
  }
  await A.waitForTimeout(300);
}
const leg1 = 'A summon alone does not light the crowd (R2)';
if (!aAura || !aOn) check(leg1, null, `A's Damage aura never armed (equip ${aAura}, on ${aOn})`);
else if (!totem) check(leg1, null, `no totem after three casts (slot holds a skill: ${aTotem}); one player alone lit ${soloLit ? 'a mob' : 'nothing'}`);
else if (!soloHurt) check(leg1, null, `no mob in view was hurt in 12 s (${soloSeen} mobs seen)`);
else check(leg1, !soloLit, soloLit ? `${soloLit.name} #${soloLit.id} carried bit 15 with one player + totem` : `0 of ${soloSeen} mobs lit with one player + totem #${totem.id}`);

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
    check('Three players light the crowd bit on the wire (D4)', null, `${topic} never got into the world (join hang)`);
    return finish();
  } finally {
    for (const p of inWorld) await p.setViewportSize({ width: 1280, height: 800 }).catch(() => {});
  }
};
await cmd(A, 'HOME'); // out of the boars' way while B and C join
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
  const mobs = (await sampleMobs(A)).filter((m) => m.mask & CROWD);
  mobs.sort((a, b) => (b.hp ?? 1) - (a.hp ?? 1));
  lit = mobs[0] || null;
  if (lit) litAt = Date.now(); else await A.waitForTimeout(300);
}
if (!lit) {
  const view = await sampleMobs(A);
  const near = view.filter((m) => Math.hypot(m.x - ALPHA.x, m.y - ALPHA.y) < 6)
    .map((m) => `${m.name}#${m.id} hp ${m.hp?.toFixed(2)} mask ${m.mask} at (${m.x.toFixed(1)}, ${m.y.toFixed(1)})`);
  const who = await Promise.all([A, B, C].map((p) => p.evaluate((s) => ({
    focus: document.querySelector('#healthBar .barText')?.textContent?.trim() || '',
    aura: !!document.querySelector(s)?.classList.contains('activeSlot'),
    at: `${(window.game.character.getX() / 120).toFixed(1)}, ${(window.game.character.getY() / 120).toFixed(1)}`,
  }), AURA_SLOT)));
  report.push(`leg 2 diag: near the Alpha ${near.join('; ') || 'nothing'}; A/B/C ${JSON.stringify(who)}`);
}
const leg2 = 'Three players light the crowd bit on the wire (D4)';
if (!bAura || !cAura) check(leg2, null, `B or C never armed the Damage aura (B ${bAura}, C ${cAura})`);
else check(leg2, !!lit, lit ? `${lit.name} #${lit.id} mask ${lit.mask}, hp ${lit.hp?.toFixed(2)}` : 'no mob in view carried bit 15 within 20 s');
if (lit) {
  check('The crowd indicator draws at 202.5° (D4)', lit.crowdAngle !== null && Math.abs(lit.crowdAngle - 202.5) < 0.5,
    lit.crowdAngle === null ? 'no `crowd` indicator child' : `${lit.crowdAngle.toFixed(1)}°, glyph texture ${lit.glyph}`);
  await A.screenshot({ path: join(shotDir, `pv2-${label}-crowd.png`) }).catch(() => {});
}

// --- 3: a reset clears it ------------------------------------------------------
const leg3 = 'A combat reset clears the crowd bit (D3, ResetClears)';
if (lit) {
  for (const p of [A, B, C]) await cmd(p, 'HOME', 0);
  await A.waitForTimeout(6000);
  await cmd(A, 'WARP ' + wire({ x: lit.x + 0.6, y: lit.y }), 0);
  let seen = null, relit = null, missing = 0;
  for (let t = 0; t < 50 && !relit; t++) {
    const mob = (await sampleMobs(A)).find((m) => m.id === lit.id);
    if (mob) { seen = mob; if (mob.mask & CROWD) relit = mob; } else missing++;
    await A.waitForTimeout(300);
  }
  const focus = await Promise.all([A, B, C].map(focusOf));
  const diag = `${Math.round((Date.now() - litAt) / 1000)} s after lit; A/B/C ${JSON.stringify(focus)}; ${missing} samples without #${lit.id}`;
  if (relit) check(leg3, false, `#${lit.id} relit with A alone (mask ${relit.mask}): B's and C's rows survived; ${diag}`);
  else if (!seen || seen.hp === 0) check(leg3, null, `#${lit.id} never back in A's view; ${diag}`);
  else check(leg3, true, `#${lit.id} dark with A's aura on it, hp ${seen.hp?.toFixed(2)}; ${diag}`);
} else {
  check(leg3, null, 'leg 2 lit nothing');
}

check('No console errors', errors.length === 0, errors.length ? errors.slice(0, 5).join(' | ') : '0');
console.log(report.join('\n'));
console.log(`\npv2-crowd ${label}: ${pass} PASS, ${fail} FAIL, ${inconclusive} INCONCLUSIVE`);
await browser.close();
process.exit(fail ? 1 : 0);
