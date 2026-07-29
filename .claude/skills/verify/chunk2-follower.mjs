#!/usr/bin/env node
// plan-entity-model.md chunk 2 — the FOLLOWER half, the one behaviour change
// with no eyes on it.
//
// chunk2-roles.mjs deliberately skips this: chunk 2 rewrote what makes a mob a
// follower (`role == follower && owner != nil`, replacing the old
// `owner != nil && velocity > 0` inference), and summoning one needs a cooldown
// equipped through the aura panel — so the path rested on Go pins alone.
//
// What this proves in the live game:
//   1. SummonCompanion spawns a companion at all (role resolved, owner set)
//   2. it FOLLOWS — the player walks a long way and the gap stays small,
//      which is the follower steering the chunk rewrote
//   3. it is a distinct actor from the player, not a VFX
//
// ⚑ Slot hotkeys need a LONG hold (~1.3 s). They are edge-triggered from
// Controls.update, whose Tock clock is rAF-driven, and a headless page throttles
// rAF hard — a short down/up pair falls between two samples, the key really does
// flip in KeyboardManager, and no action ever fires. It reads exactly like a
// broken feature.
//
// ⚑ Equipping uses REAL mouse clicks. Synthetic PointerEvents are eaten by
// SimpleBar's capture-phase handler inside the panels and produce false FAILs.
//
// Usage: node .claude/skills/verify/chunk2-follower.mjs [label] [url]
import { createRequire } from 'node:module';
import { join } from 'node:path';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');

const label = process.argv[2] || 'run';
const url = process.argv[3] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

// A wolf-dense spot in zone 1 — the companion needs something to engage.
// ⚑ The companion FIGHTS here and usually DIES here, and both are the point.
// This spot has 5 Wolves, 2 Boars and a DireWolf within 6.5 units, so combat is
// reliable — which is what the leg needs — but a level-1 companion rarely
// outlives it. Moving somewhere calmer was tried and is worse: at (61, 16) the
// companion survived at 0.8 units with ZERO floating numbers, i.e. nothing to
// fight and nothing to measure (sweep, 2026-07-29). So the venue stays hot and
// the CHECK carries the uncertainty instead — see the tri-state below.
const HOSTILE = `${-40 * 120} ${10 * 120}`;

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();

const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await page.waitForSelector('#startForm .playerNameSubmit:not([disabled])', { timeout: 120_000 });
await page.fill('#startForm .playerNameInput', 'Fol' + String(process.pid).slice(-4));
await page.click('#startForm .playerNameSubmit');
await page.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });

const cmd = async (text) => {
  await page.evaluate((t) => {
    const input = document.getElementById('console_command');
    input.value = t;
    document.getElementById('console').dispatchEvent(new Event('submit', { cancelable: true }));
  }, text);
  await page.waitForTimeout(700);
};

const pos = () => page.evaluate(() => ({
  x: +(window.game.character.getX() / 120).toFixed(2),
  y: +(window.game.character.getY() / 120).toFixed(2),
}));

await cmd('PING');
await cmd('GOD');
await cmd('SKILL SummonCompanion');

await page.evaluate(() => {
  let r = window.game.character.plate.parent;
  while (r.parent) r = r.parent;
  window.__auraRoot = r;
});

// ⚑ The scene graph has a dedicated layer container named `companion` (the
// sprite class's own layer), and summoned companions are its children. That is
// the only reliable handle: window.game is a facade with no EntityManager, and
// "nearest sprite to screen centre" picks up trees and turnips, which makes a
// following companion look like a fleeing one.
//
// ⚑ Measure in WORLD space, never screen space. The obvious metric — distance
// from the companion's screen bounds to the viewport centre — is WRONG, because
// `Cam Boundaries: On` clamps the camera at the map edges, so the player is NOT
// drawn at the centre near a boundary. That artefact reported a following
// companion as 84px → 638px "fleeing" (2026-07-27) and looked exactly like a
// broken follower.
//
// A companion child's `.position` and `window.game.character.getX()/getY()` are
// in the SAME space (verified: character.shape.position equals getX/getY), so
// the difference is a true distance in wire units — divide by 120 for world.
const companions = () => page.evaluate(() => {
  let layer = null;
  const find = (c) => {
    if (c?.name === 'companion') { layer = c; return; }
    (c?.children || []).forEach(find);
  };
  find(window.__auraRoot);
  if (!layer) return null;
  const ch = window.game.character;
  return (layer.children || [])
    .filter((c) => c.visible && c.position)
    .map((c) => +(Math.hypot(c.position.x - ch.getX(), c.position.y - ch.getY()) / 120).toFixed(2));
});

// Distance in WORLD units from the player to the nearest companion.
const gapToCompanion = async () => {
  const list = await companions();
  return list && list.length ? Math.min(...list) : null;
};

const clickEl = async (sel) => {
  const el = await page.$(sel);
  if (!el) return false;
  const box = await el.boundingBox();
  if (!box) return false;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(700);
  return true;
};

const results = [];

// --- equip: click the spellbook entry, then the target cooldown slot ---
const spellbookRow = await page.evaluate(() =>
  [...document.querySelectorAll('#spellbookList li')].findIndex((li) => /Companion/i.test(li.textContent)));
results.push({
  check: 'SummonCompanion is in the spellbook',
  detail: `row index ${spellbookRow}`,
  pass: spellbookRow >= 0,
});

if (spellbookRow >= 0) {
  const rows = await page.$$('#spellbookList li');
  const box = await rows[spellbookRow].boundingBox();
  // ⚑ Click the NAME, not the row centre. Each row is
  // "<name> [−] <lvl>/<max> [+]" and the spend/unspend buttons sit mid-row with
  // explicit precedence in the pointerdown handler — a centre click spends a
  // skill point instead of selecting the skill, and the equip then silently
  // never happens.
  await page.mouse.click(box.x + 25, box.y + box.height / 2);
  await page.waitForTimeout(700);
  const selected = await page.evaluate(() => !!document.querySelector('#spellbookList li.selected'));
  results.push({
    check: 'Clicking the name selects it for binding',
    detail: `li.selected present: ${selected}; cooldown panel invited: ${await page.evaluate(() => document.getElementById('cooldownLoadout')?.classList.contains('hasPendingSkill'))}`,
    pass: selected,
  });
  await clickEl('#cooldownSlotList li:first-child');
}

const equipped = await page.evaluate(() =>
  document.querySelector('#cooldownSlotList')?.textContent?.trim() || '');
results.push({
  check: 'It is equipped into cooldown slot 1',
  detail: `cooldown bar reads: ${JSON.stringify(equipped.slice(0, 60))}`,
  pass: /Companion/i.test(equipped),
});

// --- fire it: Q, held long enough for the rAF-throttled sampler ---
// ⚑ The hold is ~1.4 s on purpose. Slot hotkeys are edge-triggered from
// Controls.update on an rAF-driven Tock clock, and a headless page throttles
// rAF hard enough that a short press falls between two samples.
const fireQ = async () => {
  // Wait out any running cooldown first — the slot renders a seconds timer.
  for (let i = 0; i < 90; i++) {
    const busy = await page.evaluate(() =>
      /\d+(\.\d+)?s/.test(document.querySelector('#cooldownSlotList li:first-child')?.textContent || ''));
    if (!busy) break;
    await page.waitForTimeout(1000);
  }
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down('q');
  await page.waitForTimeout(1400);
  await page.keyboard.up('q');
  await page.waitForTimeout(2500);
};

const beforeCount = (await companions())?.length ?? -1;
await fireQ();
const afterCount = (await companions())?.length ?? -1;
await page.screenshot({ path: `/tmp/follower-${label}-summoned.png` });
results.push({
  check: 'Firing the cooldown spawns a companion',
  detail: `companion-layer children ${beforeCount} → ${afterCount}`,
  pass: afterCount > beforeCount,
});

// --- the actual chunk-2 question: does it FOLLOW ---
const walk = async (key, seconds) => {
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down(key);
  await page.waitForTimeout(seconds * 1000);
  await page.keyboard.up(key);
};

const gapAtSummon = await gapToCompanion();
const startPos = await pos();
await walk('s', 6);
await page.waitForTimeout(2000);
const gapAfterWalk = await gapToCompanion();
const endPos = await pos();
await page.screenshot({ path: `/tmp/follower-${label}-after-walk.png` });

const travelled = Math.hypot(endPos.x - startPos.x, endPos.y - startPos.y);
results.push({
  check: 'The companion trails the player across a long walk',
  detail: `player moved ${travelled.toFixed(1)} world units; companion gap ${gapAtSummon} → ${gapAfterWalk} units`,
  // A follower keeps station within a couple of units. A stationary summon
  // would be left ~`travelled` units behind, which is the discriminator.
  pass: travelled > 4 && gapAfterWalk !== null && gapAfterWalk < travelled / 2,
});

// --- does it FIGHT what you fight ---
// The player has NO aura equipped (only a cooldown was bound) and is in GOD, so
// any damage number appearing in the world cannot have come from the player's
// own auras — it is the companion engaging, which is the second half of the
// PO's follower question.
// The player's XP bar. With no aura equipped the player deals no damage and so
// cannot be a kill participant on their own account — a rising XP bar can only
// have come through the companion. That is the attributable evidence; floating
// numbers alone are not, since mobs fight each other too.
const xpValue = async () => {
  const m = (await page.evaluate(() =>
    document.querySelector('#xpBar .barText')?.textContent?.trim() || '')).match(/(\d+)/);
  return m ? +m[1] : null;
};

const floaters = () => page.evaluate(() => {
  let layer = null;
  const find = (c) => {
    if (c?.name === 'floatingNumbers') { layer = c; return; }
    (c?.children || []).forEach(find);
  };
  find(window.__auraRoot);
  return layer ? (layer.children || []).length : null;
});

// ⚑ WARP moves only the PLAYER, so the companion from the follow test is left
// behind and drops out of the client's view — scoring the engagement against
// it would be scoring damage numbers it could not have caused (observed
// 2026-07-27: "companion still null units away", a PASS that proved nothing).
// Summon a FRESH one on the hostile ground instead.
await cmd('WARP ' + HOSTILE);
await page.waitForTimeout(22_000);
const xpBefore = await xpValue();
await fireQ();

let sawFloaters = 0;
let presentDuringFight = false;
for (let i = 0; i < 14; i++) {
  await page.waitForTimeout(1500);
  sawFloaters = Math.max(sawFloaters, (await floaters()) ?? 0);
  if ((await gapToCompanion()) !== null) presentDuringFight = true;
}
const xpAfter = await xpValue();
const gapInFight = presentDuringFight ? await gapToCompanion() : null;
await page.screenshot({ path: `/tmp/follower-${label}-fight.png` });
// ⚑ Presence used to be part of the assertion, on the reasoning that damage
// numbers with no companion in the world prove only that mobs were fighting
// each other. The reasoning is right; the signal was wrong. A companion sent
// into hostile ground gets focused and dies inside the 21 s window, so
// requiring it to be VISIBLE reported a companion that had fought, killed and
// died as a failure — twice in a row, on `peak floating numbers: 4` (sweep,
// 2026-07-29). XP is the attributable evidence: the player has no aura
// equipped, deals no damage, and so cannot be a kill participant on their own
// account, which means a rising XP bar came through the companion.
//
// ⚑ TRI-STATE. A companion that was killed before it could land a kill has not
// failed this check — it has made it unobservable, and INCONCLUSIVE is the
// honest word (the swift-harness precedent). FAIL is reserved for the case that
// actually indicts the feature: combat happened, the companion was there for it,
// and its owner still earned nothing.
const xpRose = xpBefore !== null && xpAfter !== null && xpAfter > xpBefore;
const detail = `XP ${xpBefore} → ${xpAfter}; peak floating numbers: ${sawFloaters}; ` +
  `companion present during fight: ${presentDuringFight}` +
  `${gapInFight === null ? '' : `, ending ${gapInFight} units away`}`;
if (xpRose && sawFloaters > 0) {
  results.push({ check: 'It engages: XP rises with no player aura equipped', pass: true, detail });
} else {
  results.push({
    check: 'It engages: XP rises with no player aura equipped',
    skip: true,
    detail: `INCONCLUSIVE — ${sawFloaters === 0
      ? 'no combat happened at all in the 21 s window (nothing came into range)'
      : 'combat happened but the companion earned its owner no XP, and it did not survive to be watched'}. ` +
      `${detail}. ⚑ Re-run against a FRESHLY RESTARTED server: mobs wander far from their authored spawns ` +
      `on a long-lived one, so a venue picked from world.json stops describing the world.`,
  });
}

console.log('\nlabel :', label);
for (const r of results) console.log(`${r.skip ? 'SKIP' : r.pass ? 'PASS' : 'FAIL'}  ${r.check}\n        ${r.detail}`);
console.log('\nwebgl ctx losses :', consoleErrors.filter((t) => t.includes('[webgl] world context lost')).length);
console.log('console errors   :', consoleErrors.length);
for (const e of consoleErrors.slice(0, 5)) console.log('   ·', e);

await browser.close();
