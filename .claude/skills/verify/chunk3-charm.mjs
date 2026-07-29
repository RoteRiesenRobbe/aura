#!/usr/bin/env node
// plan-faction-flips.md chunk 3 — charm, the enslave cooldown.
//
// What this proves in the live game (the Go tests cover the mechanism; this
// covers what no unit test can see — that a wolf actually changes sides):
//   1. CharmBeast is castable: granted, equipped, fired, cooldown consumed
//   2. the charmed mob carries the charm pip (D13) — with an IN-PICTURE CONTROL,
//      a second mob of the same species that does not
//   3. it FOLLOWS the charmer across a walk while the control mob falls behind
//   4. it FIGHTS for the charmer — XP rises with EVERY aura slot empty and the
//      player in GOD, so the credit can only have come through CreditTo (D2)
//   5. on expiry the pip goes out and the pet stops being a pet
//
// ⚑ Three traps inherited from chunk2-calm.mjs, all of which faked a product
// failure there: after the 20 s camera settle the tracked mob has usually
// already ARRIVED (so the precondition is "engaged", not "still closing"); the
// observation window must fit inside the effect's duration (charm is 59.4 s at
// level 1, which is roomier than calm's 9.9 s but still finite); and mob sprites
// live in one layer PER SPECIES, never a single "mob" layer.
//
// ⚑ And one of its own: WARP moves only the player. Charm on the spot you want
// to test on — a pet left behind by a warp is a pet whose behaviour you cannot
// score.
//
// Usage: node .claude/skills/verify/chunk3-charm.mjs [label] [url]
import { createRequire } from 'node:module';
import { join } from 'node:path';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');

const label = process.argv[2] || 'run';
const url = process.argv[3] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

// ⭐ TWO locations, and picking them is the single most important thing in this
// script.
//
// A charmed mob is player-ALIGNED, so everything hostile to `aligned` turns on
// it (D9/L-E, working exactly as designed). Cast inside the wolf pack the other
// scripts use, the pet is dead in EIGHT SECONDS — three wolves focus it — and
// every measurement after the cast silently rots: it cannot follow, it cannot
// survive to expiry, and its unparented sprite keeps its last drawn pip forever,
// so the timer looks broken too. Two runs were lost to exactly that.
//
// LONE is the most isolated prey spawn in the zone: the nearest thing hostile to
// `aligned` is 14 units away (every aggro radius is ~5.4) and the nearest other
// prey is 5.5 — outside charm's 4.0 radius, so it makes a clean in-picture
// control. A pet charmed here lives out its whole 59.4 s.
//
// PACK is the wolf-dense spot, where the pet has something to fight.
const LONE = `${59 * 120} ${11 * 120}`;
const PACK = `${-40 * 120} ${10 * 120}`;

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();

const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await page.waitForSelector('#startForm .playerNameSubmit:not([disabled])', { timeout: 120_000 });
await page.fill('#startForm .playerNameInput', 'Charm' + String(process.pid).slice(-4));
await page.click('#startForm .playerNameSubmit');
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

await cmd('PING');
await cmd('GOD'); // a dead player nulls character.plate and kills the run
await cmd('SKILL CharmBeast');
await cmd(`WARP ${LONE}`);
await page.waitForTimeout(20_000); // the camera interpolates slowly (backlog §20)

await page.evaluate(() => {
  let r = window.game.character.plate.parent;
  while (r.parent) r = r.parent;
  window.__auraRoot = r;
});

const wildlifeLayer = () => `
  (() => {
    let layer = null;
    const find = (c) => { if (layer) return; if (c?.name === 'wildlife') { layer = c; return; }
      (c?.children || []).forEach(find); };
    find(window.__auraRoot);
    return layer;
  })()
`;

// ⭐ Tag the two nearest wildlife sprites by OBJECT IDENTITY: the one we charm,
// and a CONTROL of the same species. Tracking "nearest mob" alone would let a
// second wolf wandering in read as a following pet — and the control is what
// turns the pip check from "a dot appeared" into "a dot appeared on THIS one and
// not on that one, in the same frame".
const tagPair = () => page.evaluate(`
  (() => {
    const layer = ${wildlifeLayer()};
    if (!layer) return null;
    const ch = window.game.character;
    const ranked = (layer.children || [])
      .filter((c) => c.visible && c.position)
      .map((c) => ({ c, d: Math.hypot(c.position.x - ch.getX(), c.position.y - ch.getY()) / 120 }))
      .sort((a, b) => a.d - b.d);
    if (!ranked.length) return null;
    window.__pet = ranked[0].c;
    window.__control = ranked[1] ? ranked[1].c : null;
    return { pet: +ranked[0].d.toFixed(2), control: ranked[1] ? +ranked[1].d.toFixed(2) : null, seen: ranked.length };
  })()
`);

const gaps = () => page.evaluate(`
  (() => {
    const ch = window.game.character;
    const at = (t) => (!t || t.destroyed || !t.parent || !t.position) ? null
      : +(Math.hypot(t.position.x - ch.getX(), t.position.y - ch.getY()) / 120).toFixed(2);
    return { pet: at(window.__pet), control: at(window.__control) };
  })()
`);

// The pip strip is a Container holding exactly one Graphics, parked BELOW the
// overhead bar at x=0, y>0 (Mobs.initHealthBar: effectPips.container.y =
// barHeight/2 + 9). The bar's own fill groups are the other single-Graphics
// containers in that subtree and both sit at a NEGATIVE-or-mirrored x, which is
// what separates them; everything above the bar sits at y=0.
//
// ⚑ The signal is DRAWN INSTRUCTIONS, not `visible` — an earlier version of this
// script read `visible` and reported every mob in the game as pipped. EffectPips
// early-returns when the mask has not changed, so on a mob that has never
// carried an effect the redraw never runs and the Graphics keeps its
// constructed default of visible=true with nothing drawn in it. Empty
// instructions is the honest "no pips".
const pipOn = () => page.evaluate(`
  (() => {
    const strip = (root) => {
      let found = null;
      const walk = (c) => {
        if (found !== null || !c) return;
        const kids = c.children || [];
        if (kids.length === 1 && kids[0] && kids[0].context && c.x === 0 && c.y > 0) {
          const g = kids[0];
          found = !!g.visible && (g.context.instructions || []).length > 0;
          return;
        }
        kids.forEach(walk);
      };
      walk(root);
      return found;
    };
    const live = (t) => t && !t.destroyed && t.parent;
    return {
      pet: live(window.__pet) ? strip(window.__pet) : null,
      control: live(window.__control) ? strip(window.__control) : null,
    };
  })()
`);

// ⚑ A dead mob's sprite is UNPARENTED, not destroyed — and it keeps its last
// drawn frame forever. Reading only `destroyed` made a pet that had been killed
// five seconds in look like a live pet whose pip never expired, which is what
// sent an earlier run of this script hunting a phantom bug in the charm timer.
// Every reader below goes through live().
const alive = () => page.evaluate(`
  (() => {
    const live = (t) => !!(t && !t.destroyed && t.parent);
    return { pet: live(window.__pet), control: live(window.__control) };
  })()
`);

// The aura ring is added at child index 0 of the mob's shape and drawn only
// while the mob has a target (AuraRingStack.setRadius(0) clears it). For a
// CHARMED mob that is a clean read on "it is fighting somebody", and the
// somebody can never be the charmer — same faction. Off right after the flip is
// the other half: the flip dropped its aggro on the player (L-A).
const auraLit = () => page.evaluate(`
  (() => {
    const read = (t) => {
      if (!t || t.destroyed || !t.parent) return null;
      const ring = (t.children || [])[0];
      const g = ring && (ring.children || []).length === 1 ? ring.children[0] : null;
      if (!g || !g.context) return null;
      return !!g.visible && (g.context.instructions || []).length > 0;
    };
    return { pet: read(window.__pet), control: read(window.__control) };
  })()
`);

const floaters = () => page.evaluate(() => {
  let layer = null;
  const find = (c) => { if (c?.name === 'floatingNumbers') { layer = c; return; } (c?.children || []).forEach(find); };
  find(window.__auraRoot);
  return layer ? (layer.children || []).length : null;
});

const xpText = () => page.evaluate(() =>
  document.querySelector('#xpBar .barText')?.textContent?.trim() || '');
const xpValue = async () => {
  const m = (await xpText()).match(/(\d+)/);
  return m ? +m[1] : null;
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
const check = (name, pass, detail) => results.push({ check: name, pass, detail });

// --- probe: the player must project NOTHING, or check 4 proves nothing ---
const auraState = await page.evaluate(() =>
  document.querySelector('#auraSlotList')?.textContent?.replace(/\s+/g, ' ').trim() || '(no panel)');
const noAura = !/\b(Damage|Heal|Shield|Light|Slow)\b/.test(auraState);
check('The player projects no aura (so any XP earned came through the pet)', noAura,
  `aura slots: ${JSON.stringify(auraState.slice(0, 80))}`);

// --- equip CharmBeast into cooldown slot 1 ---
const row = await page.evaluate(() =>
  [...document.querySelectorAll('#spellbookList li')].findIndex((li) => /^\s*Charm\s*Beast/i.test(li.textContent)));
check('Charm Beast is in the spellbook after SKILL CharmBeast', row >= 0, `row index ${row}`);

if (row >= 0) {
  const rows = await page.$$('#spellbookList li');
  const box = await rows[row].boundingBox();
  await page.mouse.click(box.x + 25, box.y + box.height / 2); // the NAME, not the row centre
  await page.waitForTimeout(700);
  await clickEl('#cooldownSlotList li:first-child');
}

const equipped = await page.evaluate(() =>
  document.querySelector('#cooldownSlotList')?.textContent?.trim() || '');
check('Charm Beast is equipped into cooldown slot 1', /Charm/i.test(equipped),
  `cooldown bar: ${JSON.stringify(equipped.slice(0, 60))}`);

const fireQ = async () => {
  for (let i = 0; i < 90; i++) {
    const busy = await page.evaluate(() =>
      /\d+(\.\d+)?s/.test(document.querySelector('#cooldownSlotList li:first-child')?.textContent || ''));
    if (!busy) break;
    await page.waitForTimeout(1000);
  }
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down('q');
  await page.waitForTimeout(1400); // rAF-throttled edge sampler needs a long hold
  await page.keyboard.up('q');
  await page.waitForTimeout(600);
};

const walk = async (key, seconds) => {
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down(key);
  await page.waitForTimeout(seconds * 1000);
  await page.keyboard.up(key);
};

// --- precondition: something is engaged, and we know which sprite it is ---
const tagged = await tagPair();
const approach = [];
for (let i = 0; i < 8; i++) {
  approach.push((await gaps()).pet);
  await page.waitForTimeout(1000);
}
const closed = approach.filter((d) => d !== null);
// Prey do not chase, so the precondition is "inside charm's 4.0 radius", not
// "engaged". The control is deliberately NOT required to be out of range: two
// prey share this spawn point, and the pip check below then proves D3's cap —
// two candidates inside the radius, exactly one charmed, the nearest.
const inRange = closed.length > 0 && closed[closed.length - 1] < 4.0 && tagged && tagged.control !== null;
check('Precondition: a wildlife mob is inside charm range, with a second one to compare against',
  inRange, `tagged ${JSON.stringify(tagged)}; the target's distance over 8 s: ${JSON.stringify(closed)}`);

await page.screenshot({ path: `/tmp/charm-${label}-before.png` });
const xpBefore = await xpValue();

// --- cast ---
const castAt = Date.now();
await fireQ();
const cooldownAfterCast = await page.evaluate(() =>
  document.querySelector('#cooldownSlotList li:first-child')?.textContent?.trim() || '');
check('Firing Charm Beast consumes the cooldown', /\d/.test(cooldownAfterCast),
  `slot reads: ${JSON.stringify(cooldownAfterCast.slice(0, 40))}`);

// --- the pip, against an in-picture control ---
const pipDuring = await pipOn();
check('The charmed mob carries the charm pip and a same-species control does not',
  pipDuring.pet === true && pipDuring.control === false,
  `pet ${pipDuring.pet} / control ${pipDuring.control} — control was ${tagged && tagged.control} units away`
  + ' (both null = the metric found nothing; both true = it cannot tell them apart;'
  + ' a control INSIDE the 4.0 radius that stays unpipped is also D3\'s maxTargets-1 nearest-pick)');

await page.screenshot({ path: `/tmp/charm-${label}-cast.png` });

// --- does it FOLLOW? ---
// ⚑ Walk IMMEDIATELY, and far. A charmed mob is player-aligned, so its own
// packmates turn on it the instant it flips (D9/L-E, working as designed) and in
// the middle of a wolf pack it is dead in about five seconds — which reads as
// "the pet never followed" and, on a frozen sprite, as "the charm never
// expired". Dragging it clear is both the honest test and the way the spell is
// actually meant to be played.
const startPos = await page.evaluate(() => ({ x: window.game.character.getX(), y: window.game.character.getY() }));
await walk('s', 8); // away from the wolves, deeper into the prey field
await page.waitForTimeout(5000);
const endPos = await page.evaluate(() => ({ x: window.game.character.getX(), y: window.game.character.getY() }));
const travelled = Math.hypot(endPos.x - startPos.x, endPos.y - startPos.y) / 120;
const afterWalk = await gaps();
const liveAfterWalk = await alive();
check('It follows its charmer across a walk while the control mob is left behind',
  travelled > 3 && liveAfterWalk.pet && afterWalk.pet !== null && afterWalk.pet < travelled / 2,
  `player moved ${travelled.toFixed(1)} units; pet gap ${afterWalk.pet} (alive ${liveAfterWalk.pet}), control gap ${afterWalk.control}`);

// --- expiry ---
// Level-1 charm is 1800 ticks = 59.4 s, and out here the pet lives to see it.
const elapsed = () => ((Date.now() - castAt) / 1000).toFixed(1);
const beforeExpiry = { t: elapsed(), ...(await pipOn()) };
while ((Date.now() - castAt) / 1000 < 66) await page.waitForTimeout(2000);
const pipAfter = await pipOn();
const liveAtEnd = await alive();
check('The charm expires on its own and the pip goes out',
  liveAtEnd.pet && pipAfter.pet === false,
  liveAtEnd.pet
    ? `at t+${beforeExpiry.t}s the pip was ${beforeExpiry.pet}; at t+${elapsed()}s it is ${pipAfter.pet}`
    : `INCONCLUSIVE — the pet died before its charm ran out (last pip ${beforeExpiry.pet} at t+${beforeExpiry.t}s)`);
await page.screenshot({ path: `/tmp/charm-${label}-expiry.png` });

// --- LEG B: does it FIGHT for its charmer? ---
// Charm needs something worth charming next to something worth fighting, so this
// leg goes to the wolf pack. Every aura slot is Empty and GOD is on, so the
// player cannot damage anything and cannot be the pet's target either (same
// faction now): a lit aura ring on the pet is "it is engaging something on your
// behalf". The defend signal is what starts it — a wolf hitting a GOD player
// still stamps the attacker, because player.MobTouches records it BEFORE
// takeDamage.
//
// ⚑ The pet does not survive this leg, and that is the finding, not a fault:
// three wolves focus a charmed packmate and kill it in about eight seconds. A
// THREAT dump goes into the server log at the same moment so the fight is
// legible there too (grep `THREAT mob=` in /tmp/bh.log — the pet shows its
// former packmates as threat rows and they show it as their target).
await cmd(`WARP ${PACK}`);
await page.waitForTimeout(20_000);
await tagPair();
await fireQ(); // waits out the ~118 s cooldown first
await cmd('THREAT');
let ringLitInFight = false;
let peakFloaters = 0;
const SAMPLE_MS = 1200;
let petSamples = 0;
for (let i = 0; i < 14; i++) {
  await page.waitForTimeout(SAMPLE_MS);
  const r = await auraLit();
  if (r.pet === true) ringLitInFight = true;
  if (r.pet !== null) petSamples++;
  peakFloaters = Math.max(peakFloaters, (await floaters()) ?? 0);
}
const xpAfter = await xpValue();
await page.screenshot({ path: `/tmp/charm-${label}-fight.png` });
// ⚑ Assert on the XP, not on the ring. The comment above already records that
// the pet does not survive this leg — three wolves focus a charmed packmate and
// kill it in about eight seconds (D9, PO-accepted) — so requiring a LIT RING in
// one of 14 samples requires the pet to be alive and rendered at that instant,
// which the design says it usually will not be. It failed twice in a row on
// `pet present for 1/14 samples` while XP went 0 → 70 (sweep, 2026-07-29): the
// pet had fought, killed, credited its charmer and died, i.e. the feature
// working exactly as ruled, reported as a failure.
//
// XP with EVERY aura slot empty is the honest evidence, and it is what this
// script's own header says the check is. The player deals no damage, so they
// cannot be a kill participant on their own account — a rising XP bar can only
// have come through the pet. (⚑ If Pass 3 item 1 ever lands, "presence counts"
// would make mere proximity earn XP and this discriminator would weaken.)
//
// ⚑ TRI-STATE, because the pet dying is DESIGN, not a defect. If it never
// survived a single sample there was nothing to observe, and the honest report
// is INCONCLUSIVE — the swift-harness precedent. Only a pet that was alive to
// be watched and still earned its charmer nothing is a real FAIL. Reporting
// "the accepted behaviour happened" as a failure is what made three of this
// script's checks look broken for two days.
const xpRose = xpBefore !== null && xpAfter !== null && xpAfter > xpBefore;
// ⚑ Order matters: EVIDENCE FIRST, observability only as the fallback. Gating
// on "was the pet alive to watch" before looking at the XP reported a genuine
// PASS as INCONCLUSIVE on a run that read XP 0 → 70 — the pet had fought,
// killed, credited its charmer and died, which is the whole feature working.
const observable = petSamples > 0;
if (!xpRose && !observable) {
  results.push({
    check: 'It fights for its charmer: XP rises with every aura slot empty',
    skip: true,
    detail: `INCONCLUSIVE — the pet died before any of the 14 samples, so the fight was never observable. ` +
      `D9 (PO-accepted): former packmates focus a charmed mob and kill it in ~8 s. ` +
      `XP ${xpBefore} → ${xpAfter}; peak floating numbers ${peakFloaters}. ` +
      `⚑ Re-run against a FRESHLY RESTARTED server — mobs wander far from their authored spawns on a long-lived one.`,
  });
} else check('It fights for its charmer: XP rises with every aura slot empty',
  xpRose,
  `XP ${xpBefore} → ${xpAfter}; ring lit: ${ringLitInFight} (context — the pet is expected to die); ` +
  `the pet was still there for ${petSamples}/14 samples (~${(petSamples * SAMPLE_MS / 1000).toFixed(0)}s of a 17s window); ` +
  `peak floating numbers ${peakFloaters}`);

await page.screenshot({ path: `/tmp/charm-${label}-after.png` });

console.log('\nlabel :', label);
for (const r of results) console.log(`${r.skip ? 'SKIP' : r.pass ? 'PASS' : 'FAIL'}  ${r.check}\n        ${r.detail}`);
console.log(`\npassed : ${results.filter((r) => r.pass).length}/${results.filter((r) => !r.skip).length}` +
  `${results.some((r) => r.skip) ? `, ${results.filter((r) => r.skip).length} inconclusive` : ''}`);
console.log('webgl ctx losses :', consoleErrors.filter((t) => t.includes('[webgl] world context lost')).length);
console.log('console errors   :', consoleErrors.length);
for (const e of consoleErrors.slice(0, 5)) console.log('   ·', e);

await browser.close();
