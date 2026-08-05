#!/usr/bin/env node
// plan-mob-levels.md C2 — the nameplate stops reading the species catalog.
//
// C1 made a spawn point able to author `level` and the mob stand at it, but
// server-side only: the plate and its difficulty tint still came from the
// static /mobs catalog, so an overridden mob's plate LIED (landmine L3). C2
// puts the effective level on the wire (`Mob.level`) and switches both halves
// of the plate to it. This script is the proof at the real surface.
//
// The assertion is deliberately a PAIR, and the pair is the whole point:
//
//   · the overridden Stag plates "Stag 25" and tints RED (24 levels above a
//     fresh character) — the number came from the placement
//   · a second, untouched Stag of the SAME species plates "Stag 1" and tints
//     yellow — the number still comes from the catalog when nothing overrides
//
// One species, two levels, in one world. Either half alone proves much less:
// a catalog-fed plate would show "Stag 1" for both, and a plate fed the raw
// override rather than the effective level would show "Stag 0" for the control.
//
// ⚑ TEXT and TINT are asserted separately on purpose. They can drift: the
// text is written ONCE per species (setMobId early-returns on an unchanged id)
// while the tint is recomputed every frame off a cached difference, so a
// setLevel that only stored the number would leave the text catalog-fed
// forever and the tint correct — a half-fix that looks right in-game.
//
// ⚑ NEEDS A THROWAWAY CONTENT EDIT (the probe-quest precedent). No zone JSON
// ships with an override — C3 owns the first real placements — so install one
// by hand, restart, run, then revert:
//
//     node .claude/skills/verify/c2-mob-level.mjs --install   # patches world.json
//     ./scripts/dev-restart.sh                                # -content ../api
//     node .claude/skills/verify/c2-mob-level.mjs c2
//     git checkout api/zones/world.json                       # ALWAYS
//
// ⚑ Revert BEFORE any `make -C backend build`: that runs cp-defs, which would
// bake the probe override into the embedded content and ship it in the binary.
// The script SKIPs (not fails) when the override is absent, so a sweep that
// forgets the install says so instead of reporting a product defect.
//
// Usage: node .claude/skills/verify/c2-mob-level.mjs [label] [url]
//        node .claude/skills/verify/c2-mob-level.mjs --install | --revert
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';

// --- the probe placement -----------------------------------------------------
// Spawn index 213 is a Stag at (-62.12, 29.88), ~7 units from the starting
// campfire; index 172 is another Stag at (-66.36, 22.55), ~8.5 units away and
// untouched. Same species, so the control is exact. Stag is cL1 in the catalog,
// which makes 25 unmistakably an override rather than a coincidence.
const ZONE = 'api/zones/world.json';
const SUBJECT = { index: 213, mob: 'Stag', x: -62.12, y: 29.88, level: 25 };
const CONTROL = { index: 172, mob: 'Stag', x: -66.36, y: 22.55, level: 1 };

if (process.argv[2] === '--install' || process.argv[2] === '--revert') {
  const zone = JSON.parse(readFileSync(ZONE, 'utf8'));
  const s = zone.spawns[SUBJECT.index];
  if (s.mob !== SUBJECT.mob) {
    console.error(`spawn ${SUBJECT.index} is a ${s.mob}, not a ${SUBJECT.mob} — the zone moved; re-pick the probe`);
    process.exit(1);
  }
  if (process.argv[2] === '--install') {
    s.level = SUBJECT.level;
  } else {
    delete s.level;
  }
  writeFileSync(ZONE, JSON.stringify(zone, null, 2) + '\n');
  console.log(`${process.argv[2]} → spawn ${SUBJECT.index} (${s.mob} @ ${s.x},${s.y}) level=${s.level ?? '(none)'}`);
  console.log('⚑ restart aurad with -content ../api, and NEVER commit this edit');
  process.exit(0);
}

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');
import { joinAsNewCharacter } from './lib/join.mjs';

const label = process.argv[2] || 'run';
const url = process.argv[3] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

// DIFFICULTY_BANDS (client-data/Mobs.ts) at player level 1: +24 → deadly red,
// 0 → even yellow. Both values are [PLACEHOLDER] there; asserted here because
// the tint is the half that would silently keep reading the catalog.
const RED = 0xff5555;
const YELLOW = 0xf5d442;

// The probe must actually be installed, or every leg below measures nothing.
const installed = (() => {
  try {
    return JSON.parse(readFileSync(ZONE, 'utf8')).spawns[SUBJECT.index].level === SUBJECT.level;
  } catch { return false; }
})();
if (!installed) {
  console.log(`SKIP — no probe override in ${ZONE}.`);
  console.log('  node .claude/skills/verify/c2-mob-level.mjs --install, restart aurad, re-run, then git checkout the zone.');
  process.exit(0);
}

const w = (x, y) => `${Math.round(x) * 120} ${Math.round(y) * 120}`;

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();

const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await joinAsNewCharacter(page, 'level');
await page.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });

const cmd = async (text) => {
  await page.evaluate((t) => {
    const input = document.getElementById('console_command');
    input.value = t;
    document.getElementById('console').dispatchEvent(new Event('submit', { cancelable: true }));
  }, text);
  await page.waitForTimeout(600);
};

await cmd('PING'); // the first command after joining is dropped (harness note)
await cmd('GOD');  // a parked level-1 player sits inside plenty of aggro radii

// Cache the scene root while the character is alive — Character.destroy() nulls
// `plate`, and that is the documented way in.
await page.evaluate(() => {
  let r = window.game.character.plate.parent;
  while (r.parent) r = r.parent;
  window.__auraRoot = r;
});
await page.evaluate(() => {
  const p = document.getElementById('developPanel');
  if (p) p.style.display = 'none';
});

// One sample = one page.evaluate: text and tint describe the SAME frame, so a
// mob that wanders out between two round trips cannot make them disagree.
const plates = () => page.evaluate(() => {
  const out = [];
  const walk = (c) => {
    if (typeof c?.text === 'string' && c.text) {
      let fill = c.style?.fill;
      if (typeof fill === 'string') fill = parseInt(fill.replace('#', ''), 16);
      out.push({ text: c.text, fill });
    }
    (c?.children || []).forEach(walk);
  };
  walk(window.__auraRoot);
  return out;
});

// The player level the tint is measured against — asserted, not assumed: a
// character that dinged mid-run would move both bands and invalidate the pair.
// Read off the RENDERED level plate: Character keeps no `level` field, it keeps
// a PIXI.Text, and window.game is a four-method façade with no way to the
// backend state (the documented trap — a missing property reads undefined in
// silence rather than throwing).
const playerLevel = () => page.evaluate(() => {
  const t = window.game.character.levelElement?.text;
  return t === undefined ? null : Number(t);
});

const results = [];
const record = (name, ok, detail) => { results.push({ name, ok, detail }); };

for (const target of [SUBJECT, CONTROL]) {
  const role = target === SUBJECT ? 'SUBJECT (overridden)' : 'CONTROL (inherits species)';
  // Stand ~3 units "below" (larger y) so the mob frames above centre.
  await cmd(`WARP ${w(target.x, target.y + 3)}`);
  // The camera interpolates a long warp very slowly (backlog §20) — a sample
  // taken early describes the PREVIOUS position, silently and plausibly.
  await page.waitForTimeout(22_000);

  const seen = await plates();
  const lvl = await playerLevel();
  await page.screenshot({ path: `/tmp/c2-mob-level-${label}-${target.level}.png` });

  const mine = seen.filter((p) => new RegExp(`^${target.mob} \\d+$`).test(p.text));
  const want = `${target.mob} ${target.level}`;
  const hit = mine.find((p) => p.text === want);
  const wantFill = target === SUBJECT ? RED : YELLOW;

  record(`${role}: plate reads "${want}"`, !!hit,
    hit ? 'text from the wire' : `saw ${JSON.stringify(mine.map((p) => p.text))}`);
  record(`${role}: tint is ${wantFill.toString(16)}`, hit?.fill === wantFill,
    hit ? `fill=${hit.fill?.toString(16)}` : 'no plate to read');
  record(`${role}: player still level 1 (the tint's other operand)`, lvl === 1, `level=${lvl}`);
}

// The pair, stated as one fact: the same species carried two different levels
// in one world. This is what a catalog-fed plate cannot produce.
const bothSeen = results.filter((r) => r.name.includes('plate reads') && r.ok).length === 2;
record('one species, two levels — the plate is per-INSTANCE', bothSeen,
  bothSeen ? `${SUBJECT.mob} 25 and ${CONTROL.mob} 1 both rendered` : 'at least one half missing');

console.log('\nlabel:', label);
let pass = 0;
for (const r of results) {
  console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  —  ${r.detail}`);
  if (r.ok) pass++;
}
console.log(`\n${pass}/${results.length} passed`);
console.log(`console errors: ${consoleErrors.length}`);
consoleErrors.slice(0, 8).forEach((e) => console.log('  ' + e));
console.log(`screenshots: /tmp/c2-mob-level-${label}-25.png, /tmp/c2-mob-level-${label}-1.png`);
console.log('\n⚑ revert the probe: git checkout api/zones/world.json');

await browser.close();
process.exit(pass === results.length && consoleErrors.length === 0 ? 0 : 1);
