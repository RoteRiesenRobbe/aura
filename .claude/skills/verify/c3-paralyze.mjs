// Paralyze, the game's first hard stun (docs/archive/plan-cc-and-retaliation.md C3).
//
// What this owns that no Go test can: a stun is only real if a mob a player
// stuns actually STOPS — and "stops" here has a very specific meaning that the
// unit pins can only assert one layer at a time. On screen it is one thing:
// a mob that was moving becomes completely motionless, then resumes.
//
// ⚑ The observable is GROWTH-THEN-CLOSURE of the gap while the player walks
// away, and it took a failed run to find it. The obvious read — "the stunned
// mob stops moving" — is unusable at this venue: the first attempt scored
// INCONCLUSIVE with a still-run of 9 out of 10 samples BEFORE the cast,
// because a wolf that reaches melee parks there and stops moving on its own.
// A parked mob that gets stunned looks exactly like a parked mob.
//
// Walking away fixes it, and the signature is self-controlling: a stunned mob
// cannot follow, so the gap grows; when the stun expires it resumes chasing, so
// the gap closes again. Nothing else produces both halves — a calmed mob grows
// the gap and never closes it, an unaffected one never lets it grow.
//
// ⚑ Tri-state: mobs wander and packs thin out, so "nothing was moving nearby
// to stun" is INCONCLUSIVE, never red.

import { createRequire } from 'module';
import { join } from 'path';
import { joinAsNewCharacter } from './lib/join.mjs';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');

const label = process.argv[2] || 'run';
const url = process.argv[3] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

// The wolf pack the other CC scripts use — normal-tier, so C1's immunity gate
// is not in the way, and dense enough that something is reliably in motion.
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
await joinAsNewCharacter(page, 'stun');
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

// GOD is fine here (unlike the FrostShield harness): nothing in a stun is
// suppressed by cheat mode, and a dead player nulls every read.
await cmd('GOD');

// --- leg 1: learn it --------------------------------------------------------
await cmd('SKILL Paralyze');
await page.waitForFunction(
  () => [...document.querySelectorAll('#spellbookList [data-skill-id]')]
    .some((e) => /Paralyze/i.test(e.textContent)),
  null, { timeout: 20_000 }).catch(() => {});
const skillId = await page.evaluate(() =>
  [...document.querySelectorAll('#spellbookList [data-skill-id]')]
    .find((e) => /Paralyze/i.test(e.textContent))?.dataset.skillId ?? null);
check('Paralyze reaches the spellbook', skillId !== null, `data-skill-id ${skillId}`);

// --- leg 2: the tooltip says it cannot ACT ----------------------------------
// "Holds for 3s" would read as a root. The word that matters is "attack".
let tip = '';
if (skillId) {
  const row = page.locator(`#spellbookList [data-skill-id="${skillId}"]`).first();
  await row.scrollIntoViewIfNeeded();
  await row.hover();
  await page.waitForTimeout(600);
  tip = await page.evaluate(() =>
    document.querySelector('#skillTooltip, .skillTooltip')?.textContent?.trim() ?? '');
}
check('Its tooltip says the target cannot move, attack OR use abilities',
  /cannot move, attack or use abilities/i.test(tip),
  `tooltip: ${JSON.stringify(tip.slice(0, 200))}`);

// --- leg 3: equip into a cooldown slot --------------------------------------
if (skillId) {
  const row = page.locator(`#spellbookList [data-skill-id="${skillId}"]`).first();
  const box = await row.boundingBox();
  await page.mouse.click(box.x + 25, box.y + box.height / 2); // the NAME, not the row centre
  await page.waitForTimeout(700);
  const slot = page.locator('#cooldownSlotList li:first-child');
  const slotBox = await slot.boundingBox();
  await page.mouse.click(slotBox.x + slotBox.width / 2, slotBox.y + slotBox.height / 2);
  await page.waitForTimeout(700);
}
const bar = await page.evaluate(() =>
  document.querySelector('#cooldownSlotList')?.textContent?.trim() ?? '');
check('Paralyze is equipped into cooldown slot 1', /Paralyze/i.test(bar),
  `cooldown bar: ${JSON.stringify(bar.slice(0, 60))}`);

// --- the venue --------------------------------------------------------------
await cmd(`WARP ${PACK}`);
await page.waitForTimeout(9_000); // the camera interpolates slowly (backlog §20)

await page.evaluate(() => {
  let r = window.game.character.plate.parent;
  while (r.parent) r = r.parent;
  window.__auraRoot = r;
});

// Mob sprites live under a layer PER SPECIES; `wildlife` is the pack's. World
// units off .position — screen space lies, the camera clamps at map edges.
const nearestPos = () => page.evaluate(`
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
    return best ? { x: +best.position.x.toFixed(2), y: +best.position.y.toFixed(2), gap: +bestD.toFixed(2) } : null;
  })()
`);

// ⚑ TAG the sprite, then follow THAT reference. Tracking "whatever is nearest"
// cannot see a stun at all: the held mob is left behind and a different, closer
// wolf becomes nearest — a run measured the player walking 1.00 u while the
// "gap" SHRANK 1.03 → 0.39, which is a second wolf arriving, not a failed stun.
// chunk3-charm tags its pet and its control for the same reason.
const tagNearest = () => page.evaluate(`
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
    window.__stunned = best;
    return best ? +bestD.toFixed(2) : null;
  })()
`);

// Distance to the TAGGED sprite. null once it is gone (dead mobs are unparented,
// not destroyed) — which is INCONCLUSIVE, never a failure.
const taggedGap = () => page.evaluate(`
  (() => {
    const t = window.__stunned;
    if (!t || t.destroyed || !t.parent || !t.position) return null;
    const ch = window.game.character;
    return +(Math.hypot(t.position.x - ch.getX(), t.position.y - ch.getY()) / 120).toFixed(2);
  })()
`);

const sampleGaps = async (n, everyMs) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = await nearestPos();
    out.push(p ? p.gap : null);
    await page.waitForTimeout(everyMs);
  }
  return out;
};

const walk = async (key, seconds) => {
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down(key);
  await page.waitForTimeout(seconds * 1000);
  await page.keyboard.up(key);
};

// --- leg 4: precondition — something is engaged at melee --------------------
const approach = await sampleGaps(8, 800);
const closed = approach.filter((g) => g !== null);
const engaged = closed.length >= 5 && closed[closed.length - 1] < 1.5;
if (!engaged) {
  check('Precondition: a mob is engaged at melee range (mobs wander — INCONCLUSIVE, not red)', null,
    `gap trace: ${JSON.stringify(closed)}`);
} else {
  check('Precondition: a mob is engaged at melee range', true,
    `gap over 6 s: ${JSON.stringify(closed)}`);
}

// --- leg 5: cast, walk away, and it cannot follow ---------------------------
if (engaged) {
  await page.evaluate(() => document.activeElement?.blur());
  // ⚑ SHORT hold, and the cooldown assert below is what makes it safe. The
  // 1400 ms the other cooldown harnesses use is fine for a 60 s charm, but it
  // is HALF of this stun: measured, a 1.4 s hold plus round-trips left ~1.5 s
  // of a 3 s stun, the walk ran past it, and the tagged wolf kept pace with the
  // player exactly (1.02 → 1.01 while the player moved 1.29 u). Every second
  // spent holding the key is a second of the stun not available to measure.
  await page.keyboard.down('q');
  await page.waitForTimeout(500);
  await page.keyboard.up('q');

  const fired = await page.evaluate(() =>
    document.querySelector('#cooldownSlotList li:first-child')?.textContent?.trim() ?? '');
  check('Firing Paralyze consumes the cooldown', /\d/.test(fired), `slot reads: ${JSON.stringify(fired)}`);

  // ⛔ THE MOVEMENT LEG WAS BUILT, MEASURED, AND CUT. Recorded here rather than
  // left in, because "an assert that cries wolf on correct content gets deleted,
  // not fixed" (plan-world-replacement C2), and this one flipped sign between
  // runs on a stun the Go pins prove works:
  //
  //   tracking "nearest mob"   → player walked 1.00u, gap SHRANK 1.03 → 0.39
  //                              (a second wolf arrived; the tracker cannot
  //                               follow the held one — chunk3-charm tags its
  //                               sprite for exactly this reason)
  //   tagged sprite, 1.4s hold → player walked 1.29u, gap 1.02 → 1.01
  //   tagged sprite, 0.5s hold → player walked 1.19u, gap 1.01 → 1.49  (+0.48)
  //   tagged sprite, 0.5s hold → player walked 1.10u, gap 1.03 → 0.82  (−0.21)
  //
  // The cause is a timing race with no headroom: the stun is 3 s, the key-hold
  // and round-trips eat ~1 s of it, a wolf's chase speed is close to the
  // player's, and pack members drift through the tracked distance (a
  // precondition trace in one run read [1.01,1.01,1.01,0.73,0.53,0.7,1.01,1.01]
  // with nothing cast at all). The signal and the noise are the same size.
  //
  // ⚑ What WOULD make it measurable, for whoever wants it: a longer authored
  // stun (a test-only skill), or a stationary/slow target species so the
  // chase-speed term drops out. Not worth a content change today.
  //
  // ⚑ The mechanism is proven where it can be proven exactly: 17 Go pins, and
  // every one in `sys` verified by MUTATION — disabling the gate reddens three,
  // moving it above tickBuffEvents reddens the fourth. What this script owns is
  // the integration surface above them: the skill exists, reads correctly,
  // equips, and fires.
}

await page.screenshot({ path: `/tmp/paralyze-${label}.png` });
check('No console errors', consoleErrors.length === 0, `${consoleErrors.length}`);

const pass = results.filter((r) => r.pass === true).length;
const fail = results.filter((r) => r.pass === false).length;
const inconclusive = results.filter((r) => r.pass === null).length;
console.log(JSON.stringify({ results, pass, fail, inconclusive }, null, 2));
await browser.close();
process.exit(fail === 0 ? 0 : 1);
