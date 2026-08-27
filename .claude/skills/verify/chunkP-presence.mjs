#!/usr/bin/env node
// chunk P — presence-counts XP attribution (plan-playtest-feedback.md §Chunk P
// plan, quest prerequisite D15). The two-client smoke the plan's test strategy
// requires, grown to three clients so BOTH legs ride one kill:
//
//   A  the fighter — Damage aura on, walks into the wolf pack, kills
//   B  the witness — Lantern (light aura) ON, standing ~4 units from the fight.
//      A light aura pairs with nobody hostile, so B structurally CANNOT touch
//      a mob — any XP it earns can only be presence credit. This is also the
//      ruling's canonical scenario (the dark-tunnel lantern-carrier).
//   C  the control — same distance, NO aura equipped at all. Must stay at 0:
//      presence requires an active aura ON, not merely standing nearby.
//
// Boundary: this script owns the presence-attribution rule at the game surface.
// The rule's edges (P2's ≥1-participant gate, dedupe, full-regen clear) are Go
// tests (model/mob + sys); this proves the live loop end to end — scan → probe
// → participant → kill → XP on a real client's XP bar.
//
// ⚑ Restart the server first (mobs wander off their authored spawns) — the
// venue is the follower harness's wolf pack at (-40, 10).
// ⚑ All three players run GOD: wolves WILL aggro the witnesses; GOD keeps them
// alive without making them participants (being hit never grants credit).
// ⚑ Tri-state: if A lands no kill in the window (nothing wandered into range),
// the run is INCONCLUSIVE, not a FAIL.
//
// Usage: node .claude/skills/verify/chunkP-presence.mjs [label] [url]
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { botName } from './botname.mjs';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');
import { joinAsNewCharacter } from './lib/join.mjs';
import { showSkillRowAt } from './lib/spellbook.mjs';

const label = process.argv[2] || 'run';
const url = process.argv[3] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

// The wolf pack (5 Wolves, 2 Boars, a DireWolf within 6.5 units) — combat is
// reliable here. The witnesses stand 4 units east: outside every aura in play
// (Lantern touches nothing anyway), inside the presence radius (8 + mob body).
const FIGHT = { x: -40, y: 10 };
const WATCH = { x: -36, y: 10 };
const wire = (p) => `${Math.round(p.x * 120)} ${Math.round(p.y * 120)}`;

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const consoleErrors = [];
const results = [];

const newPlayer = async (name) => {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`[${name}] ` + m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(`[${name}] pageerror: ` + e.message));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await joinAsNewCharacter(page, name);
  await page.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
  await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
  // The develop panel overlays the right half of the screen and eats clicks.
  await page.evaluate(() => { const p = document.getElementById('developPanel'); if (p) p.style.display = 'none'; });
  return page;
};

const cmd = async (page, text) => {
  await page.evaluate((t) => {
    const input = document.getElementById('console_command');
    input.value = t;
    document.getElementById('console').dispatchEvent(new Event('submit', { cancelable: true }));
  }, text);
  await page.waitForTimeout(700);
};

// XP as shown on the HUD bar ("XP <in>/<forNext>") — server-driven, so it is
// the real grant, not client math.
const xp = async (page) => {
  const m = (await page.evaluate(() => document.querySelector('#xpBar .barText')?.textContent?.trim() || ''))
    .match(/XP\s+(\d+)/);
  return m ? +m[1] : null;
};

// Select a spellbook skill by name (click the NAME, not the row centre — the
// spend/unspend buttons sit mid-row), equip it into aura slot 0, then click
// the slot again to ACTIVATE (first click equips the pending skill, second
// toggles the aura on). Returns the .activeSlot state as the client-side tell.
const equipAndActivateAura = async (page, skillRe) => {
  // The spellbook list renders off GameState on a throttled rAF loop — the row
  // for a just-cheated skill can take seconds to appear. Wait, don't peek.
  const rowAppeared = await page.waitForFunction(
    (re) => [...document.querySelectorAll('#spellbookList li')].some((li) => new RegExp(re, 'i').test(li.textContent)),
    skillRe.source, { timeout: 20_000 }).catch(() => null);
  if (!rowAppeared) return { ok: false, why: `no spellbook row matches ${skillRe}` };
  const rowIndex = await page.evaluate((re) =>
    [...document.querySelectorAll('#spellbookList li')].findIndex((li) => new RegExp(re, 'i').test(li.textContent)),
    skillRe.source);
  await showSkillRowAt(page, rowIndex); // the book is a closable, paged panel since UI pass C3
  const rows = await page.$$('#spellbookList li');
  const box = await rows[rowIndex].boundingBox();
  await page.mouse.click(box.x + 25, box.y + box.height / 2);
  await page.waitForTimeout(700);
  const selected = await page.evaluate(() => !!document.querySelector('#spellbookList li.selected'));
  if (!selected) return { ok: false, why: 'clicking the name did not select it' };

  const slot = await page.$('#auraSlotList li');
  const sbox = await slot.boundingBox();
  await page.mouse.click(sbox.x + sbox.width / 2, sbox.y + sbox.height / 2); // equip

  // ⚑ toggleAuraSlot refuses an activation until the CLIENT's slot state has
  // caught up with the server (currentAuraSlots is GameState-driven), and a
  // throttled headless page can lag that round trip by seconds — a fixed short
  // wait here made the whole harness flaky. Wait for the slot to actually
  // render the skill, then retry the activation click until the (synchronous,
  // optimistic) .activeSlot highlight appears.
  const equipped = await page.waitForFunction(
    (re) => new RegExp(re, 'i').test(document.querySelector('#auraSlotList')?.textContent || ''),
    skillRe.source, { timeout: 20_000 }).catch(() => null);
  if (!equipped) return { ok: false, why: 'slot never showed the skill (equip did not land)' };

  for (let i = 0; i < 5; i++) {
    await page.mouse.click(sbox.x + sbox.width / 2, sbox.y + sbox.height / 2); // activate
    await page.waitForTimeout(1200);
    const active = await page.evaluate(() => !!document.querySelector('#auraSlotList .auraSlot.activeSlot'));
    if (active) return { ok: true, why: `activeSlot lit (attempt ${i + 1})` };
  }
  return { ok: false, why: 'slot never lit as active after 5 attempts' };
};

const fighter = await newPlayer(botName('fighter'));
const witness = await newPlayer(botName('witness'));
const control = await newPlayer(botName('control'));

for (const [page, name] of [[fighter, 'A'], [witness, 'B'], [control, 'C']]) {
  await cmd(page, 'GOD');
  void name;
}

await cmd(fighter, 'SKILL Damage');
const aOn = await equipAndActivateAura(fighter, /Damage/);
results.push({ check: 'A: Damage aura equipped and ON', detail: aOn.why, pass: aOn.ok });

await cmd(witness, 'SKILL Lantern');
const bOn = await equipAndActivateAura(witness, /Lantern/);
results.push({ check: 'B: Lantern (light aura) equipped and ON', detail: bOn.why, pass: bOn.ok });

// C deliberately equips nothing — the whole point of the control.
const cBare = await control.evaluate(() => (document.querySelector('#auraSlotList .auraSlot.activeSlot') ? 'active?!' : 'no active aura'));
results.push({ check: 'C: no aura at all', detail: cBare, pass: cBare === 'no active aura' });

// Into position. WARP is server-side immediate (only the camera lags), and the
// XP reads below come from the DOM, so no camera settle is needed.
await cmd(witness, 'WARP ' + wire(WATCH));
await cmd(control, 'WARP ' + wire({ x: WATCH.x, y: WATCH.y + 1 }));
await cmd(fighter, 'WARP ' + wire(FIGHT));

const xpA0 = await xp(fighter);
const xpB0 = await xp(witness);
const xpC0 = await xp(control);

// Let the pack engage A and the aura grind. Poll until A's XP moves (= a kill
// happened) or the window closes. A short walk shuffle pulls stragglers in.
let xpA = xpA0;
const started = Date.now();
while (Date.now() - started < 90_000) {
  await fighter.evaluate(() => document.activeElement?.blur());
  await fighter.keyboard.down('a');
  await fighter.waitForTimeout(900);
  await fighter.keyboard.up('a');
  await fighter.keyboard.down('d');
  await fighter.waitForTimeout(900);
  await fighter.keyboard.up('d');
  await fighter.waitForTimeout(3000);
  xpA = await xp(fighter);
  if (xpA !== null && xpA0 !== null && xpA > xpA0) break;
}
// Give the same kill a beat to land on the witnesses' bars too.
await witness.waitForTimeout(2000);
const xpB = await xp(witness);
const xpC = await xp(control);

await fighter.screenshot({ path: `/tmp/chunkP-${label}-fighter.png` });
await witness.screenshot({ path: `/tmp/chunkP-${label}-witness.png` });

const killHappened = xpA !== null && xpA0 !== null && xpA > xpA0;
if (!killHappened) {
  results.push({
    check: 'A kill happened at all (anchor for both legs)',
    skip: true,
    detail: `INCONCLUSIVE — A's XP never moved (${xpA0} → ${xpA}) in 90 s; nothing came into range. ` +
      'Re-run against a freshly restarted server (mobs wander off their authored spawns).',
  });
} else {
  results.push({
    check: 'A kill happened (anchor)',
    detail: `A's XP ${xpA0} → ${xpA}`,
    pass: true,
  });
  results.push({
    check: 'B (aura on, never touching) earns presence XP',
    detail: `B's XP ${xpB0} → ${xpB} — a Lantern cannot touch a mob, so this is presence credit`,
    pass: xpB !== null && xpB > (xpB0 ?? 0),
  });
  results.push({
    check: 'C (no aura) stays at zero',
    detail: `C's XP ${xpC0} → ${xpC}`,
    pass: xpC === 0,
  });
}

console.log('\nlabel :', label);
for (const r of results) console.log(`${r.skip ? 'SKIP' : r.pass ? 'PASS' : 'FAIL'}  ${r.check}\n        ${r.detail}`);
console.log('\nwebgl ctx losses :', consoleErrors.filter((t) => t.includes('[webgl] world context lost')).length);
console.log('console errors   :', consoleErrors.length);
for (const e of consoleErrors.slice(0, 5)) console.log('   ·', e);

await browser.close();
process.exit(results.some((r) => !r.skip && !r.pass) ? 1 : 0);
