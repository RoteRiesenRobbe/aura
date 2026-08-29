// FrostShield, the retaliate_slow passive (docs/archive/plan-cc-and-retaliation.md C2).
//
// What this owns that no Go test can: the passive is only real if a player can
// LEARN it, READ it, EQUIP it, and then have a mob that hits them actually slow
// down. Every layer under that is unit-pinned — the parse, the DerivedStats
// fold, the MobTouches trigger, and both mob→player dispatch legs (sys's
// TestApplyDamageAura_MobCaster_DamagesViaMobTouches and
// TestTickDots_MobSourcedDamageRidesMobTouches) — but nothing proves the chain
// end to end through the real spellbook and the real wire.
//
// ⚑ It does NOT use GOD, and that is the whole point of leg 4b: IsGod()
// short-circuits inside takeDamage, so a cheat-mode player must slow nothing
// (A4). Every other CC harness turns GOD on to survive; this one levels up
// instead, which is why leg 0 spends XP before walking into the pack.
//
// ⚑ Tri-state, like the other CC harnesses: mobs wander, so "no mob came close
// enough to hit me" is INCONCLUSIVE, never red. A red here means a mob hit the
// player and was NOT slowed.

import { createRequire } from 'module';
import { join } from 'path';
import { joinAsNewCharacter } from './lib/join.mjs';
import { showSkillRow } from './lib/spellbook.mjs';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');

const label = process.argv[2] || 'run';
const url = process.argv[3] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

// The wolf pack the other CC scripts use — dense enough that something reliably
// closes to melee, and normal-tier, so C1's immunity gate is not in the way.
const PACK = `${-40 * 120} ${10 * 120}`;

const results = [];
const check = (name, pass, detail) => {
  results.push({ check: name, pass, detail });
  console.log(`${pass === null ? '~' : pass ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await joinAsNewCharacter(page, 'frost');
await page.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
await page.evaluate(() => {
  const p = document.getElementById('developPanel');
  if (p) p.style.display = 'none';
});

const cmd = async (text) => {
  await page.evaluate((t) => {
    const input = document.getElementById('console_command');
    input.value = t;
    document.getElementById('console').dispatchEvent(new Event('submit', { cancelable: true }));
  }, text);
  await page.waitForTimeout(700);
};

// --- leg 0: survive without GOD ---------------------------------------------
// A level-1 character dies to the pack in under ten seconds (TTD ~8.7 s), and a
// dead player nulls the reads. Levelling is the honest way to buy the time,
// because GOD would suppress the very mechanic under test.
await cmd('XP 200000');
// ⚑ The client's level lives on the HUD text node, not as a field on the
// character — window.game.character.level reads undefined in silence.
const level = await page.evaluate(() => Number(window.game?.character?.levelElement?.text ?? NaN));
check('Precondition: levelled up enough to take hits without GOD', Number.isFinite(level) && level >= 10,
  `level ${level}`);

// --- leg 1: learn it --------------------------------------------------------
await cmd('SKILL FrostShield');
await page.waitForFunction(
  () => [...document.querySelectorAll('#spellbookList [data-skill-id]')]
    .some((e) => /FrostShield|Frost Shield/i.test(e.textContent)),
  null, { timeout: 20_000 }).catch(() => {});
const skillId = await page.evaluate(() =>
  [...document.querySelectorAll('#spellbookList [data-skill-id]')]
    .find((e) => /FrostShield|Frost Shield/i.test(e.textContent))?.dataset.skillId ?? null);
check('FrostShield reaches the spellbook', skillId !== null, `data-skill-id ${skillId}`);

// --- leg 2: the tooltip says who gets slowed --------------------------------
// The line has to name the TARGET. "Slow: 10%" on a passive reads as "you are
// slowed", which is the opposite of the mechanic.
let tip = '';
if (skillId) {
  await showSkillRow(page, skillId); // the book is a closable, paged panel since UI pass C3
  const row = page.locator(`#spellbookList [data-skill-id="${skillId}"]`).first();
  await row.scrollIntoViewIfNeeded();
  await row.hover();
  await page.waitForTimeout(600);
  tip = await page.evaluate(() =>
    document.querySelector('#skillTooltip, .skillTooltip')?.textContent?.trim() ?? '');
}
check('Its tooltip names the slow, its target and the window',
  /slows anything that damages you/i.test(tip) && /%/.test(tip) && /s\b/.test(tip),
  `tooltip: ${JSON.stringify(tip.slice(0, 160))}`);

// --- leg 3: equip it --------------------------------------------------------
if (skillId) {
  await showSkillRow(page, skillId);
  const row = page.locator(`#spellbookList [data-skill-id="${skillId}"]`).first();
  const box = await row.boundingBox();
  await page.mouse.click(box.x + 25, box.y + box.height / 2);
  await page.waitForSelector('#spellbookList li.selected', { timeout: 5_000 }).catch(() => {});
  const slot = page.locator('#passiveSlotList .passiveSlot[data-slot="0"]').first();
  const slotBox = await slot.boundingBox();
  await page.mouse.click(slotBox.x + slotBox.width / 2, slotBox.y + slotBox.height / 2);
  // ⚑ .slotLabel, not the li: a passive slot carries an icon token beside the
  // name since UI pass C5 D1.
  await page.waitForFunction(
    () => /Frost/i.test(document.querySelector('#passiveSlotList .passiveSlot[data-slot="0"] .slotLabel')?.textContent ?? ''),
    null, { timeout: 15_000 }).catch(() => {});
}
const equipped = await page.evaluate(() =>
  /Frost/i.test(document.querySelector('#passiveSlotList .passiveSlot[data-slot="0"] .slotLabel')?.textContent ?? ''));
check('It equips into a passive slot', equipped);

// --- leg 4: a mob that hits you slows down ----------------------------------
//
// The observable is the mob's own debuff PIP — the strip chunk3-charm reads,
// which lights for free here because retaliate_slow reuses slowPayload and
// therefore the existing AppliedEffectSlow bit. No control is needed: any
// wildlife mob standing in melee range with the slow pip up is the trigger
// working, because nothing else in this run applies a slow.
//
// ⚑ Mob sprites are NOT under one "mob" layer — there is a layer PER SPECIES,
// probed live; `wildlife` is the right one for the wolf pack. Distances are
// measured in WORLD units off .position: screen space lies, because the camera
// clamps at map edges.
await page.evaluate(() => {
  let r = window.game.character.plate.parent;
  while (r.parent) r = r.parent;
  window.__auraRoot = r;
});

const nearestWildlife = () => page.evaluate(`
  (() => {
    let layer = null;
    const find = (c) => { if (layer) return; if (c?.name === 'wildlife') { layer = c; return; }
      (c?.children || []).forEach(find); };
    find(window.__auraRoot);
    if (!layer) return null;
    const ch = window.game.character;
    let best = null, bestD = Infinity;
    for (const c of layer.children || []) {
      if (!c.visible || !c.position) continue;
      const d = Math.hypot(c.position.x - ch.getX(), c.position.y - ch.getY()) / 120;
      if (d < bestD) { bestD = d; best = c; }
    }
    if (!best) return null;
    // The pip strip: a container at x === 0, y > 0 holding one graphics child.
    let pip = null;
    const walk = (c) => {
      if (pip !== null || !c) return;
      const kids = c.children || [];
      if (kids.length === 1 && kids[0] && kids[0].context && c.x === 0 && c.y > 0) {
        const g = kids[0];
        pip = !!g.visible && (g.context.instructions || []).length > 0;
        return;
      }
      kids.forEach(walk);
    };
    walk(best);
    return { gap: +bestD.toFixed(2), pip };
  })()
`);

await cmd(`WARP ${PACK}`);
await page.waitForTimeout(8_000);

// Stand still and let something come chew on us. Sampling over 14 s covers the
// approach plus several hits; the slow is re-applied on every one, so once it
// starts the pip stays up for the rest of the fight.
let engaged = null;
let pipSeen = false;
const trace = [];
for (let i = 0; i < 14; i++) {
  const r = await nearestWildlife();
  if (r) {
    trace.push(r.gap);
    if (r.gap < 1.2) engaged = Math.min(engaged ?? Infinity, r.gap);
    if (r.pip === true) pipSeen = true;
  }
  await page.waitForTimeout(1000);
}

if (engaged === null) {
  check('Something closed to melee range (mobs wander — INCONCLUSIVE, not red)', null,
    `nearest gap trace: ${JSON.stringify(trace)}`);
} else {
  check('A mob that hit you carries the slow pip', pipSeen,
    `closed to ${engaged.toFixed(2)}u; pip seen: ${pipSeen}; trace ${JSON.stringify(trace)}`);
}

// --- leg 4b: A4 — a GOD player retaliates against nothing --------------------
// IsGod() short-circuits inside takeDamage, so without the explicit check a
// cheat-mode player would walk the world slowing everything that brushed them.
// Only meaningful if something was actually in melee range above.
if (engaged !== null) {
  await cmd('GOD');
  await page.waitForTimeout(7_000); // > the 5 s slow, so anything left is fresh
  let godPip = false;
  for (let i = 0; i < 6; i++) {
    const r = await nearestWildlife();
    if (r && r.gap < 1.2 && r.pip === true) godPip = true;
    await page.waitForTimeout(1000);
  }
  check('A4: a GOD player retaliates against nothing', !godPip,
    `slow pip under GOD: ${godPip}`);
}

await page.screenshot({ path: `/tmp/frost-${label}.png` });
check(`No console errors`, consoleErrors.length === 0, `${consoleErrors.length}`);

const pass = results.filter((r) => r.pass === true).length;
const fail = results.filter((r) => r.pass === false).length;
const inconclusive = results.filter((r) => r.pass === null).length;
console.log(JSON.stringify({ results, pass, fail, inconclusive }, null, 2));
await browser.close();
process.exit(fail === 0 ? 0 : 1);
