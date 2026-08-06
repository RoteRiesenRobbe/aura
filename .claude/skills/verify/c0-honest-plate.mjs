#!/usr/bin/env node
// plan-world-replacement.md C0 — the honest plate.
//
// The client used to carry a SECOND, frozen copy of the server's gray rule:
// DIFFICULTY_BANDS grayed everything more than 5 levels below you, while the
// server pays nothing only below ZD(P) = grayBase + P/grayStep. The two agree
// up to player level 11 and diverge from 12 up, so a mob that still paid ~14 %
// of an at-level kill was tinted "trivial". C0 deletes the copy: the two knobs
// ship in Welcome and the boundary is derived.
//
// ⚑ THIS SCRIPT DERIVES ITS OWN EXPECTATIONS FROM backend/conf.json, for the
// same reason the client now derives its boundary from the wire — a hardcoded
// table here would be a THIRD frozen copy, and it would go green against a
// client that had simply swapped one constant for another. It reads the conf
// the server booted with, applies curve.KillXP's normalization and
// GrayDistance, and checks every visible nameplate against that.
//
// ⚑ Which makes the strongest way to run it TWICE:
//
//     node .claude/skills/verify/c0-honest-plate.mjs c0           # shipped 5/6
//     # then set game.player.killXP.grayBase to 2 in backend/conf.json,
//     # ./scripts/dev-restart.sh, and re-run:
//     node .claude/skills/verify/c0-honest-plate.mjs c0-narrow    # the SAME
//     #   Marauder must now plate GRAY — no rebuild, conf only
//     git checkout backend/conf.json
//
// A boundary that moves with the server's conf cannot be a client-side
// constant. Leg 3 reports which regime it is in, so the second run is
// self-labelling rather than something the reader has to remember.
//
// The venue is the ISOLATED Marauder at (32.68, 16.64) — 10 Marauder spawns
// exist and nine of them are in the bandit camp at (45,-29); this one stands
// alone, with a Boar 3.8 units away as the control. At player level 22 under
// the shipped conf: ZD(22) = 5 + 3 = 8, so the server pays for anything above
// level 14 — the Marauder pays, the Boar does not — while the deleted client
// rule grayed everything at or below 16, i.e. BOTH.
//
// ⚑ THE VENUE'S NUMBERS MOVED IN world-replacement C2 (2026-08-06), and the
// script had to move with them. C2 authored a level on all 423 combat spawns:
// this Marauder is the V→M patroller and now stands at **16**, not its cL12,
// and the control Boar is one of the five D13 village-livestock spawns, held
// at 2 on purpose. A subject at 16 no longer divides the two rules at player
// level 18 (the deleted rule only grayed 5+ below, and 16 is 2 below 18), so
// the PLAYER LEVEL moved 18 → 22 to restore the divergence. ⚑ The script would
// have SAID so rather than passing falsely — leg 3 exists for exactly this and
// reported INCONCLUSIVE — but a harness left self-labelling is a harness that
// proves nothing, so it is repaired here rather than in whatever chunk next
// runs it.
//
// ⚑ Boundary with c2-mob-level: that one owns what a plate SAYS (its level
// text and tint come from the wire, per instance). This one owns what the tint
// MEANS — that its gray boundary is the server's pay boundary.
//
// Usage: node .claude/skills/verify/c0-honest-plate.mjs [label] [url]
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');
import { joinAsNewCharacter } from './lib/join.mjs';

const label = process.argv[2] || 'run';
const url = process.argv[3] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

// --- the server's rule, read from the server's conf ---------------------------
// Mirrors curve.KillXP.Normalized (each non-positive field falls back to the
// built-in default for THAT field) and curve.KillXP.GrayDistance.
const DEFAULTS = { grayBase: 5, grayStep: 6 };
const conf = (() => {
  try {
    const k = JSON.parse(readFileSync('backend/conf.json', 'utf8'))?.game?.player?.killXP ?? {};
    return {
      grayBase: k.grayBase > 0 ? k.grayBase : DEFAULTS.grayBase,
      grayStep: k.grayStep > 0 ? k.grayStep : DEFAULTS.grayStep,
    };
  } catch {
    return { ...DEFAULTS };
  }
})();
const grayDistance = (p) => {
  const lvl = Math.max(1, p);
  return conf.grayStep < 1 ? conf.grayBase : conf.grayBase + Math.floor(lvl / conf.grayStep);
};
// The rule C0 DELETED, kept only so the run can say whether this venue is still
// a divergence case at all.
const oldRuleSaysGray = (playerLevel, mobLevel) => mobLevel - playerLevel < -5;

const GRAY = 0x9d9d9d;
const PLAYER_LEVEL = 22;
const SUBJECT = { mob: 'Marauder', level: 16, x: 32.68, y: 16.64 };
const CONTROL = { mob: 'Boar', level: 2, x: 36.4, y: 15.6 };

const w = (x, y) => `${Math.round(x) * 120} ${Math.round(y) * 120}`;

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();

const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await joinAsNewCharacter(page, 'plate');
await page.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });

const cmd = async (text) => {
  await page.evaluate((t) => {
    const input = document.getElementById('console_command');
    input.value = t;
    document.getElementById('console').dispatchEvent(new Event('submit', { cancelable: true }));
  }, text);
  await page.waitForTimeout(500);
};

await cmd('PING'); // the first command after joining is dropped (harness note)
await cmd('GOD');  // this script parks inside a bandit camp's aggro radii

await page.evaluate(() => {
  let r = window.game.character.plate.parent;
  while (r.parent) r = r.parent;
  window.__auraRoot = r; // Character.destroy() nulls `plate`; cache while alive
  const p = document.getElementById('developPanel');
  if (p) p.style.display = 'none';
});

// One sample = one page.evaluate: level, plates and XP describe the SAME frame.
const sample = () => page.evaluate(() => {
  const plates = [];
  const walk = (c) => {
    if (typeof c?.text === 'string' && /^[A-Za-z]+ \d+$/.test(c.text)) {
      let fill = c.style?.fill;
      if (typeof fill === 'string') fill = parseInt(fill.replace('#', ''), 16);
      plates.push({ text: c.text, fill });
    }
    (c?.children || []).forEach(walk);
  };
  walk(window.__auraRoot);
  const xpText = document.querySelector('#xpBar .barText')?.textContent || '';
  const m = /XP\s+(\d+)\s*\/\s*(\d+)/.exec(xpText);
  return {
    plates,
    level: Number(window.game.character.levelElement?.text ?? NaN),
    xp: m ? Number(m[1]) : null,
    xpForNext: m ? Number(m[2]) : null,
  };
});

const results = [];
const record = (name, state, detail) => results.push({ name, state, detail });

// --- reach the player level the venue needs -----------------------------------
// The venue only divides the two rules at a level where they disagree, so the
// level is a PRECONDITION, not a detail. A coarse grant first (well under the
// threshold at the shipped curve — 22 costs 67.5k cumulative at base 300 ×
// growth 1.2), then steps too small to skip a level.
await cmd('XP 60000');
let lvl = (await sample()).level;
for (let i = 0; i < 60 && lvl < PLAYER_LEVEL; i++) {
  await cmd('XP 1000');
  lvl = (await sample()).level;
}
record(`player is level ${PLAYER_LEVEL} — the tint's other operand`,
  lvl === PLAYER_LEVEL ? 'PASS' : 'FAIL', `level=${lvl}`);

// --- the colour legs, BEFORE anything is armed --------------------------------
// ⚑ Order matters. The tint sample is taken from BETWEEN the two mobs, where
// both are certainly in view — but that is also inside LongRangeStrike's 2.6
// radius, so an aura activated first would start killing the subject during the
// 22 s camera settle. Sample first, arm second.
await cmd(`WARP ${w((SUBJECT.x + CONTROL.x) / 2, (SUBJECT.y + CONTROL.y) / 2)}`);
await page.waitForTimeout(22_000); // the camera interpolates a long warp slowly

const plateFor = (snap, m) => snap.plates.find((p) => p.text === `${m.mob} ${m.level}`);

// ⚑ THE SUBJECT IS A PATROLLER, and one shot at it misses. `world.json` gives
// this Marauder three waypoints running ~13 units west (it is spawn #402, the
// V→M route), so most of the time it is nowhere near its spawn point and the
// midpoint venue cannot see it. Two consecutive single-sample runs scored the
// colour leg INCONCLUSIVE while the pay leg found and killed it for Δ460 both
// times — the mob was fine, the sampling was not. Sample until both plates are
// in one frame, bounded, and fall back to the last frame so the tri-state still
// reports rather than hangs. (The header calls the venue "isolated", which is
// true of its NEIGHBOURS — nine other Marauders are 45 units away — and says
// nothing about it standing still.)
let s = await sample();
for (let i = 0; i < 8 && !(plateFor(s, SUBJECT) && plateFor(s, CONTROL)); i++) {
  await page.waitForTimeout(4_000);
  s = await sample();
}
await page.screenshot({ path: `/tmp/c0-honest-plate-${label}-venue.png` });
const zd = grayDistance(lvl);

record(`venue: "${SUBJECT.mob} ${SUBJECT.level}" and "${CONTROL.mob} ${CONTROL.level}" are both on screen`,
  plateFor(s, SUBJECT) && plateFor(s, CONTROL) ? 'PASS' : 'INCONCLUSIVE',
  `saw ${JSON.stringify(s.plates.map((p) => p.text).slice(0, 12))}`);

// This leg states the regime rather than assuming it: under the shipped 5/6
// this venue is a DIVERGENCE case, which is what makes the two colour legs
// worth anything. Under a re-tuned band it may not be, and the run should say
// so instead of passing for the wrong reason.
const diverges = oldRuleSaysGray(lvl, SUBJECT.level) && SUBJECT.level > lvl - zd;
record(`the venue divides the two rules (grayBase ${conf.grayBase}, grayStep ${conf.grayStep} ⇒ ZD(${lvl})=${zd})`,
  diverges ? 'PASS' : 'INCONCLUSIVE',
  diverges
    ? `the deleted −5 rule grays ${SUBJECT.mob} ${SUBJECT.level}; the server pays for anything above ${lvl - zd}`
    : `both rules agree here — re-pick the venue or the band before reading the colour legs`);

// The two named legs, derived from the server's own numbers.
for (const m of [SUBJECT, CONTROL]) {
  const plate = plateFor(s, m);
  const shouldBeGray = m.level - lvl < 0 && m.level - lvl <= -zd;
  const isGray = plate?.fill === GRAY;
  record(`${m.mob} ${m.level} plates ${shouldBeGray ? 'GRAY' : 'coloured'} — the server ${shouldBeGray ? 'pays nothing' : 'pays'} for it`,
    plate ? (isGray === shouldBeGray ? 'PASS' : 'FAIL') : 'INCONCLUSIVE',
    plate ? `fill=${plate.fill?.toString(16)}` : 'no plate on screen');
}

// Every OTHER plate in view, against the same derived boundary. Free coverage:
// this venue's neighbours span cL2–cL9 and the boundary sits at 10.
{
  const others = s.plates.filter((p) => ![`${SUBJECT.mob} ${SUBJECT.level}`, `${CONTROL.mob} ${CONTROL.level}`].includes(p.text));
  const wrong = others.filter((p) => {
    const mobLevel = Number(p.text.split(' ')[1]);
    const shouldBeGray = mobLevel - lvl < 0 && mobLevel - lvl <= -zd;
    return (p.fill === GRAY) !== shouldBeGray;
  });
  record(`every other plate in view agrees with the boundary (${others.length} checked)`,
    others.length === 0 ? 'INCONCLUSIVE' : (wrong.length === 0 ? 'PASS' : 'FAIL'),
    wrong.length ? JSON.stringify(wrong.map((p) => `${p.text}=${p.fill?.toString(16)}`)) : 'no disagreement');
}

// --- equip a damage aura with reach ------------------------------------------
// The seeded Damage aura is pre-equipped but its radius is 1.0, and mobs at a
// venue settle 2.5–3 units out — a run with it measures a player reaching
// nothing (the r3-lifesteal lesson). LongRangeStrike reaches 2.6.
await cmd('SKILL LongRangeStrike');
const equipAndActivate = async (skillRe) => {
  const rowAppeared = await page.waitForFunction(
    (re) => [...document.querySelectorAll('#spellbookList li')].some((li) => new RegExp(re, 'i').test(li.textContent)),
    skillRe, { timeout: 20_000 }).catch(() => null);
  if (!rowAppeared) return { ok: false, why: `no spellbook row matches ${skillRe}` };
  const rowIndex = await page.evaluate((re) =>
    [...document.querySelectorAll('#spellbookList li')].findIndex((li) => new RegExp(re, 'i').test(li.textContent)), skillRe);
  const rows = await page.$$('#spellbookList li');
  const box = await rows[rowIndex].boundingBox();
  await page.mouse.click(box.x + 25, box.y + box.height / 2); // the NAME, not the row centre
  await page.waitForTimeout(700);
  const slot = await page.$('#auraSlotList li');
  const sbox = await slot.boundingBox();
  await page.mouse.click(sbox.x + sbox.width / 2, sbox.y + sbox.height / 2); // equip
  const equipped = await page.waitForFunction(
    (re) => new RegExp(re, 'i').test(document.querySelector('#auraSlotList')?.textContent || ''),
    skillRe, { timeout: 20_000 }).catch(() => null);
  if (!equipped) return { ok: false, why: 'the slot never showed the skill' };
  for (let i = 0; i < 5; i++) {
    await page.mouse.click(sbox.x + sbox.width / 2, sbox.y + sbox.height / 2); // activate
    await page.waitForTimeout(1200);
    if (await page.evaluate(() => !!document.querySelector('#auraSlotList .auraSlot.activeSlot'))) {
      return { ok: true, why: `activeSlot lit (attempt ${i + 1})` };
    }
  }
  return { ok: false, why: 'the slot never lit as active' };
};
const armed = await equipAndActivate('Long');

// --- the pay legs -------------------------------------------------------------
// Colour and pay are scored SEPARATELY: a fix that only recoloured plates would
// pass everything above.
//
// ⚑ A level-up refills the pool AND resets xpInLevel, so the window is void if
// the level moves — re-measure rather than score a wrapped counter.
const xpWindow = async (seconds, gone) => {
  const before = await sample();
  const deadline = Date.now() + seconds * 1000;
  let last = before;
  while (Date.now() < deadline) {
    await page.waitForTimeout(3000);
    last = await sample();
    if (last.level !== before.level) return { void: true, why: `dinged to ${last.level} mid-window` };
    if (gone && !last.plates.some((p) => p.text === gone)) break;
  }
  return {
    delta: last.xp - before.xp,
    killed: gone ? !last.plates.some((p) => p.text === gone) : null,
    before: before.xp, after: last.xp,
  };
};

// ⚑ The pay EXPECTATION is derived from the boundary too, exactly like the
// colour one. An earlier draft hardcoded "the Marauder pays" and went red the
// moment the band was narrowed in conf — a frozen expectation about the gray
// rule, in the script written to prove the client no longer holds one.
const payLeg = async (m, seconds, at) => {
  const shouldBeGray = m.level - lvl < 0 && m.level - lvl <= -zd;
  const name = `pay: ${m.mob} ${m.level} ${shouldBeGray ? 'pays NOTHING' : 'pays'} — the tint said so`;
  if (!armed.ok) return record(name, 'INCONCLUSIVE', `no active aura — ${armed.why}`);
  await cmd(`WARP ${w(at.x, at.y)}`);
  await page.waitForTimeout(22_000);
  const win = await xpWindow(seconds, `${m.mob} ${m.level}`);
  if (win.void) return record(name, 'INCONCLUSIVE', win.why);
  if (!win.killed) return record(name, 'INCONCLUSIVE', `${m.mob} never died in ${seconds}s`);
  const ok = shouldBeGray ? win.delta === 0 : win.delta > 0;
  record(name, ok ? 'PASS' : 'FAIL', `${m.mob} died, XP ${win.before}→${win.after} (Δ${win.delta})`);
};

// The control first, from ITS far side: LongRangeStrike reaches 2.6 and takes
// ONE target ("nearest"), so with the other 4+ units away and idle each window
// resolves one mob and cannot be contaminated by the other.
await payLeg(CONTROL, 90, { x: CONTROL.x + 0.6, y: CONTROL.y });
await payLeg(SUBJECT, 120, { x: SUBJECT.x, y: SUBJECT.y + 1 });
await page.screenshot({ path: `/tmp/c0-honest-plate-${label}-after-fight.png` });

console.log('\nlabel:', label);
console.log(`conf: grayBase=${conf.grayBase} grayStep=${conf.grayStep}  ⇒  ZD(${lvl})=${zd}, ` +
  `the server pays for anything above level ${lvl - zd}`);
let pass = 0, fail = 0, incon = 0;
for (const r of results) {
  console.log(`  ${r.state.padEnd(12)} ${r.name}  —  ${r.detail}`);
  if (r.state === 'PASS') pass++; else if (r.state === 'FAIL') fail++; else incon++;
}
console.log(`\n${pass}/${results.length} passed, ${fail} failed, ${incon} inconclusive`);
console.log(`console errors: ${consoleErrors.length}`);
consoleErrors.slice(0, 8).forEach((e) => console.log('  ' + e));
console.log(`screenshots: /tmp/c0-honest-plate-${label}-venue.png`);

await browser.close();
process.exit(fail === 0 && consoleErrors.length === 0 ? 0 : 1);
