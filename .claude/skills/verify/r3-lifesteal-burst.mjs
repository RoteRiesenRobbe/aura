#!/usr/bin/env node
// R3 (plan-resource-costs-feedback §5.6): Bloodthirst, the rider Reaper lost.
//
// R3 is otherwise a content chunk, but this one item added a whole new effect
// type end to end — payload, buff store, applier, dispatch, composition into the
// damage payload, catalog JSON, tooltip case. The Go tests cover the engine and
// vitest covers the formatting; what neither can see is the two seams BETWEEN
// them, which is all this script is for:
//
//   leg 1  `GET /skills` actually serves the new `lifesteal` payload, so the
//          tooltip has something to read — a missing json tag renders
//          "(lifesteal_burst)" and nothing else fails,
//   leg 2  the buff reaches the DAMAGE path on a real player in a real fight,
//          i.e. the caster's own hits heal them for six seconds.
//
// ⚑ Leg 2 is why this exists at all. R3 built the entire feature against a test
// double that had ApplyLifesteal/LifestealFraction while the REAL player type
// did not — six behaviour tests green, Bloodthirst inert in the actual game.
// A capability guard now catches that in Go (sys/self_buff_capabilities_test.go),
// and this is the same question asked at the surface.
//
// ⚑ Boundary: the tooltip's number FORMATTING belongs to SkillTooltip.test.ts;
// the cost half of a tooltip belongs to r1-focus-cost.mjs. Legs 3–4 here only
// spot-check that R3's re-authored content still renders a cost at all.
//
// Usage: node r3-lifesteal-burst.mjs [url] [outdir]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');

const url = process.argv[2] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const outdir = process.argv[3] || '/tmp/r3-shots';
mkdirSync(outdir, { recursive: true });

const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = {
  ...process.env,
  LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':'),
};

// The zone-1 hostile venue chunk2-follower uses to find something to fight.
const HOSTILE = `${-40 * 120} ${10 * 120}`;

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

const results = [];
const check = (name, pass, detail) => results.push({ name, pass, detail });

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#startForm .playerNameSubmit:not([disabled])', { timeout: 30_000 });
await page.fill('#startForm .playerNameInput', 'R3Bloodthirst');
await page.click('#startForm .playerNameSubmit');
await page.waitForFunction(() => !!window.game?.character, null, { timeout: 30_000 });
await page.evaluate(() => {
  const panel = document.getElementById('developPanel');
  if (panel) panel.style.display = 'none';
  let r = window.game.character.plate.parent;
  while (r.parent) r = r.parent;
  window.__auraRoot = r;
});
console.log('joined');

const cmd = async (text) => {
  await page.waitForSelector('#console_command', { state: 'attached' });
  await page.evaluate((t) => {
    const input = document.getElementById('console_command');
    input.value = t;
    document.getElementById('console').dispatchEvent(new Event('submit', { cancelable: true }));
  }, text);
  await page.waitForTimeout(600);
};

// GOD so the player cannot die mid-run (a dead player nulls character.plate,
// which is the documented way into the scene graph, and the run then reads as a
// crash in the feature under test). It does NOT block the DAMAGE cheat, which is
// how leg 2 makes room for the leech to heal.
await cmd('GOD');
await cmd('SKILL Bloodthirst');

await page.waitForFunction(
  () => [...document.querySelectorAll('#spellbookList [data-skill-id]')]
    .some(e => /Bloodthirst/i.test(e.textContent)),
  null, { timeout: 20_000 }).catch(() => {});

const spellbook = await page.evaluate(() =>
  [...document.querySelectorAll('#spellbookList [data-skill-id]')]
    .map(e => ({ id: e.dataset.skillId, name: e.querySelector('.skillName')?.textContent?.trim() ?? e.textContent.trim() })));
const idOf = (re) => (spellbook.find(e => re.test(e.name)) || {}).id;
console.log('spellbook:', JSON.stringify(spellbook.map(s => s.name)));

async function tooltipOf(skillId, shot) {
  const entry = page.locator(`#spellbookList [data-skill-id="${skillId}"]`).first();
  await entry.scrollIntoViewIfNeeded();
  await entry.hover();
  await page.waitForTimeout(400);
  const text = await page.evaluate(() => {
    const tip = document.querySelector('#skillTooltip');
    if (!tip || tip.classList.contains('hidden')) return null;
    return [...tip.children].map(c => c.textContent).join(' | ');
  });
  if (shot) await page.screenshot({ path: join(outdir, shot) });
  await page.mouse.move(10, 10);
  return text;
}

// --- leg 1: the catalog serves the payload and the tooltip reads it ---------
const btId = idOf(/Bloodthirst/i);
check('Bloodthirst is learnable and reaches the spellbook', !!btId, `skill id ${btId}`);

const btTip = btId ? await tooltipOf(btId, 'bloodthirst-tooltip.png') : null;
console.log('Bloodthirst tooltip:', btTip);
// The default branch of the tooltip's effect switch prints the raw type name —
// which is exactly what a missing `lifesteal` json tag on the catalog would
// produce, with no error anywhere.
check(
  'The tooltip renders the leech line, not the raw effect type',
  !!btTip && /Heals you for [\d.]+%( → [\d.]+%)? of the damage you deal, for [\d.]+s/.test(btTip)
    && !/\(lifesteal_burst\)/.test(btTip),
  btTip ? btTip.slice(0, 160) : '(no tooltip)');
check(
  'It says the burst rides whatever aura is on',
  !!btTip && /Works with whichever aura you have on/.test(btTip),
  btTip ? 'present' : '(no tooltip)');

// --- legs 3–4 (run early, while the spellbook is quiet): R3's re-priced
// content still renders a cost. The VALUE is R3's own arithmetic, checked in
// Go; this only proves the re-authored JSON did not break the cost line. ------
await cmd('SKILL Immolate');
await cmd('SKILL Warbanner');
await page.waitForFunction(
  () => [...document.querySelectorAll('#spellbookList [data-skill-id]')]
    .some(e => /Warbanner/i.test(e.textContent)),
  null, { timeout: 20_000 }).catch(() => {});
const reread = await page.evaluate(() =>
  [...document.querySelectorAll('#spellbookList [data-skill-id]')]
    .map(e => ({ id: e.dataset.skillId, name: e.querySelector('.skillName')?.textContent?.trim() ?? e.textContent.trim() })));
const idOf2 = (re) => (reread.find(e => re.test(e.name)) || {}).id;

for (const [label, re, shot] of [['Immolate', /Immolate/i, 'immolate-tooltip.png'], ['Warbanner', /Warbanner/i, 'warbanner-tooltip.png']]) {
  const id = idOf2(re);
  const tip = id ? await tooltipOf(id, shot) : null;
  console.log(`${label} tooltip:`, tip);
  check(
    `${label} still renders an absolute Focus cost after the re-authoring`,
    !!tip && /Costs you: \d+( → \d+)? Focus/.test(tip),
    tip ? tip.slice(0, 200) : '(no tooltip)');
}

// --- leg 2: the burst reaches the damage path in a real fight ---------------
// Equip the seeded Damage aura and Bloodthirst, go somewhere hostile, open a
// wound, then compare a control window against the burst window.
const equipFromSpellbook = async (re, slotSel) => {
  const rows = await page.$$('#spellbookList li[data-skill-id]');
  for (const row of rows) {
    const text = await row.evaluate(el => el.textContent);
    if (!re.test(text)) continue;
    await row.scrollIntoViewIfNeeded();
    const box = await row.boundingBox();
    if (!box) return false;
    // ⚑ Click the NAME (x + 25), not the row centre — the centre lands on the
    // spend buttons and silently spends a skill point instead of selecting.
    await page.mouse.click(box.x + 25, box.y + box.height / 2);
    await page.waitForTimeout(600);
    const slot = await page.$(slotSel);
    if (!slot) return false;
    const sb = await slot.boundingBox();
    await page.mouse.click(sb.x + sb.width / 2, sb.y + sb.height / 2);
    await page.waitForTimeout(800);
    return true;
  }
  return false;
};

// ⚑ LongRangeStrike, not the seeded Damage aura. Damage has a radius of 1.0 and
// mobs at this venue settle 2.5–3 units out, so a run with it equipped measures
// a player who is reaching nothing — floating numbers everywhere (other mobs
// fighting each other), a flat health bar, and a leg that reads as a broken
// buff. LRS reaches 2.6 and authors no lifesteal of its own, so any heal-back
// can only have come from the burst.
await cmd('SKILL LongRangeStrike');
await page.waitForFunction(
  () => [...document.querySelectorAll('#spellbookList [data-skill-id]')]
    .some(e => /Long[- ]?Range[- ]?Strike/i.test(e.textContent)),
  null, { timeout: 20_000 }).catch(() => {});
await equipFromSpellbook(/Long[- ]?Range[- ]?Strike/i, '#auraSlotList li[data-slot="0"]');
// ⚑ toggleAuraSlot refuses the activation click until currentAuraSlots has
// synced from the server — wait for the slot to show the skill, then activate.
await page.waitForFunction(
  () => /Strike/i.test(document.querySelector('#auraSlotList li[data-slot="0"] .slotLabel')?.textContent ?? ''),
  null, { timeout: 15_000 }).catch(() => {});
for (let i = 0; i < 8; i++) {
  const active = await page.evaluate(() => !!document.querySelector('#auraSlotList .activeSlot'));
  if (active) break;
  const slot = await page.$('#auraSlotList li[data-slot="0"]');
  const sb = slot && await slot.boundingBox();
  if (sb) await page.mouse.click(sb.x + sb.width / 2, sb.y + sb.height / 2);
  await page.waitForTimeout(900);
}
await equipFromSpellbook(/Bloodthirst/i, '#cooldownSlotList li:first-child');

const loadout = await page.evaluate(() => ({
  aura: document.querySelector('#auraSlotList li[data-slot="0"] .slotLabel')?.textContent?.trim() ?? '',
  active: !!document.querySelector('#auraSlotList .activeSlot'),
  cooldown: document.querySelector('#cooldownSlotList li:first-child')?.textContent?.trim() ?? '',
}));
console.log('loadout:', JSON.stringify(loadout));
check(
  'LongRangeStrike is the active aura and Bloodthirst is in cooldown slot 1',
  /Strike/i.test(loadout.aura) && loadout.active && /Bloodthirst/i.test(loadout.cooldown),
  JSON.stringify(loadout));

await cmd('WARP ' + HOSTILE);
await page.waitForTimeout(6000);


// ⚑ Two preconditions, because "health did not rise" has three causes and only
// one of them is a bug: nothing in range, nothing being hit, or the buff not
// working. `mobPlate` is the per-mob nameplate container — its `.position` is in
// the same space as `character.getX()/getY()`, so the difference is a true world
// distance (÷120). Never screen space: `Cam Boundaries: On` clamps the camera at
// map edges, so the player is not drawn at the viewport centre.
const nearestMobVec = () => page.evaluate(() => {
  const ch = window.game.character;
  let best = null;
  const walk = (c) => {
    if (c?.name === 'mobPlate' && c.position && c.visible) {
      const dx = (c.position.x - ch.getX()) / 120, dy = (c.position.y - ch.getY()) / 120;
      const d = Math.hypot(dx, dy);
      if (best === null || d < best.d) best = { d: +d.toFixed(2), dx, dy };
    }
    (c?.children || []).forEach(walk);
  };
  walk(window.__auraRoot);
  return best;
});
const nearestMob = async () => (await nearestMobVec())?.d ?? null;

// Floating combat numbers are the only client-side proof that hits are actually
// landing — a mob in range that is somehow not being damaged looks identical to
// a broken buff on the health bar alone.
const floatingNumbers = () => page.evaluate(() => {
  let n = 0;
  const walk = (c) => {
    if (c?.name === 'floatingNumbers') n += (c.children || []).length;
    (c?.children || []).forEach(walk);
  };
  walk(window.__auraRoot);
  return n;
});

const health = () => page.evaluate(() => {
  const t = document.querySelector('#healthBar .barText')?.textContent ?? '';
  const m = t.match(/(\d+)\s*\/\s*(\d+)/);
  return m ? { cur: Number(m[1]), max: Number(m[2]) } : null;
});

// Close the gap. Mobs wander, so the venue only guarantees mobs SOMEWHERE near
// — walking in is what makes the aura the subject of the measurement rather
// than a bystander. Short bursts, re-aimed each time, and it gives up rather
// than wandering the map.
for (let i = 0; i < 10; i++) {
  const v = await nearestMobVec();
  if (!v || v.d < 2.0) break;
  await page.evaluate(() => document.activeElement?.blur());
  const keys = [];
  if (Math.abs(v.dx) > 0.3) keys.push(v.dx > 0 ? 'd' : 'a');
  if (Math.abs(v.dy) > 0.3) keys.push(v.dy > 0 ? 's' : 'w');
  for (const k of keys) await page.keyboard.down(k);
  await page.waitForTimeout(900);
  for (const k of keys) await page.keyboard.up(k);
  await page.waitForTimeout(400);
}
console.log('approach done, nearest mob:', await nearestMob());

// Open a wound so the leech has somewhere to go, and let combat latch (an
// in-combat player does not regenerate, so any RISE can only be the leech).
await cmd('DAMAGE 60');
await page.waitForTimeout(3000);

// Poll rather than sleep: the number layer is transient, so a single read at the
// end of a five-second window sees whatever happened to be on screen that frame.
const sample = async (seconds) => {
  const before = await health();
  let numbers = 0, closest = await nearestMob();
  for (let i = 0; i < seconds * 4; i++) {
    await page.waitForTimeout(250);
    numbers += await floatingNumbers();
    const d = await nearestMob();
    if (d !== null && (closest === null || d < closest)) closest = d;
  }
  const after = await health();
  return { before, after, numbers, closest, delta: (after?.cur ?? 0) - (before?.cur ?? 0) };
};

const control = await sample(5);
console.log('control window:', JSON.stringify(control));

// ⚑ ~1.4 s hold: slot hotkeys are edge-triggered from Controls.update on an
// rAF-driven clock, and a headless page throttles rAF hard enough that a short
// press falls between two samples.
await page.evaluate(() => document.activeElement?.blur());
await page.keyboard.down('q');
await page.waitForTimeout(1400);
await page.keyboard.up('q');
await page.waitForTimeout(300);

const burst = await sample(5);
console.log('burst window:', JSON.stringify(burst));
await page.screenshot({ path: join(outdir, 'burst-window.png') });

const cooldownFired = await page.evaluate(() =>
  /\d+(\.\d+)?s/.test(document.querySelector('#cooldownSlotList li:first-child')?.textContent || ''));

// ⚑ Tri-state, and the preconditions are checked in this order deliberately.
// "Health did not rise" has three causes and only one is a bug: nothing in
// range, nothing being hit, or the buff not working. A run that cannot tell
// them apart must say INCONCLUSIVE rather than red — an earlier draft of this
// script reported a textbook run (control 0, burst +20) as inconclusive because
// its observability probe guessed a container name wrong, which is the mirror
// image of the same mistake.
const fought = (control.numbers + burst.numbers) > 0;
const inRange = [control.closest, burst.closest].some(d => d !== null && d < 2.0);
const wounded = (control.before?.cur ?? 0) < (control.before?.max ?? 1);

if (!inRange || !fought || !wounded) {
  check('INCONCLUSIVE — the venue did not produce a fight to measure', null,
    `nearest mob ${control.closest}u / ${burst.closest}u, floating numbers ` +
    `${control.numbers}+${burst.numbers}, wounded: ${wounded} — ` +
    `the leech had no damage to leech from, so a flat health line proves nothing`);
} else {
  check(
    'Firing Bloodthirst heals the caster from their own hits',
    burst.delta > 0 && burst.delta > control.delta,
    `in a live fight (nearest mob ${burst.closest}u, ${control.numbers + burst.numbers} combat numbers) ` +
    `and wounded to ${control.before.cur}/${control.before.max}: health over 5 s went ` +
    `${control.delta} without the burst and ${burst.delta} with it ` +
    `(${burst.before.cur} → ${burst.after.cur}); cooldown running afterwards: ${cooldownFired}`);
}

await browser.close();

console.log('\n=== results ===');
let passed = 0, failed = 0, inconclusive = 0;
for (const r of results) {
  const tag = r.pass === null ? '~ INCONCLUSIVE' : r.pass ? '✓ PASS' : '✗ FAIL';
  if (r.pass === null) inconclusive++; else if (r.pass) passed++; else failed++;
  console.log(`${tag}  ${r.name}\n        ${r.detail}`);
}
console.log(`\n${passed} passed, ${failed} failed, ${inconclusive} inconclusive`);
if (errors.length) {
  console.error('\n=== console/page errors ===');
  for (const e of errors) console.error(' ! ' + e);
}
process.exit(failed || errors.length ? 1 : 0);
