#!/usr/bin/env node
// Deep Woods W1-W3 (content-zone-2-woodland.md §3.5-§3.8) at the real game
// surface. Report-style shots of the new layout, then the legs a browser owns:
// the new NPCs answer E with their own panel, and each new cave door moves the
// player to its anchor. The quest rows themselves are pinned in Go
// (sys/quest_content_test.go); this script never asserts a quest stage.
//
// Venues are DERIVED from the zone files (exits by anchor name, NPCs by spawn),
// so a Tiled pass that moves them moves the legs.
//
// ⚑ GOD on throughout: the plateau and the bear country are full of things
// that would null the scene graph mid-leg.
//
// Usage: node woods-w123.mjs [url] [outdir]
import { createRequire } from 'node:module';
import { mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');
import { joinAsNewCharacter } from './lib/join.mjs';
import { readZone } from './lib/zone.mjs';

const url = process.argv[2] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const outdir = process.argv[3] || '/tmp/woods-w123-shots';
mkdirSync(outdir, { recursive: true });

const root = new URL('../../../', import.meta.url);
const zoneDir = new URL('api/zones/', root).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const zones = Object.fromEntries(readdirSync(zoneDir).filter(f => f.endsWith('.json')).map(f =>
  [f.replace(/\.json$/, ''), readZone(zoneDir + f)]));
const world = (z, p) => ({ x: p.x + (zones[z].origin?.x || 0), y: p.y + (zones[z].origin?.y || 0) });
const allOf = (z, key) => [zones[z], ...(zones[z].areas || [])].flatMap(a => a[key] || []);
const anchorAt = (name) => {
  for (const z of Object.keys(zones)) {
    const a = allOf(z, 'anchors').find(x => x.name === name);
    if (a) return world(z, a);
  }
  throw new Error(`no anchor ${name}`);
};
const exitTo = (anchor) => {
  for (const z of Object.keys(zones)) {
    const e = allOf(z, 'exits').find(x => x.anchor === anchor);
    if (e) return world(z, e);
  }
  throw new Error(`no exit to ${anchor}`);
};
const spawnOf = (mob) => {
  for (const z of Object.keys(zones)) {
    const s = allOf(z, 'spawns').find(x => x.mob === mob);
    if (s) return world(z, s);
  }
  throw new Error(`no spawn of ${mob}`);
};

const results = [];
const pass = (leg, note) => { results.push('PASS'); console.log(`  ✔ ${leg} - ${note}`); };
const fail = (leg, note) => { results.push('FAIL'); console.log(`  ✘ ${leg} - ${note}`); };

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
const consoleErrors = [];
page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));

const cmd = async (c) => {
  await page.waitForSelector('#console_command', { state: 'attached' });
  await page.evaluate((x) => {
    document.querySelector('#console_command').value = x;
    document.querySelector('#console').dispatchEvent(new Event('submit', { cancelable: true }));
  }, c);
  await page.waitForTimeout(350);
};
const pos = () => page.evaluate(() => ({ x: window.game.character.getX() / 120, y: window.game.character.getY() / 120 }));
const warp = async (p) => {
  await cmd(`WARP ${Math.round(p.x * 120)} ${Math.round(p.y * 120)}`);
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(700);
    const q = await pos();
    if (Math.hypot(q.x - p.x, q.y - p.y) < 1.5) break;
  }
};
// The camera eases across a long jump (backlog §20): wait for the player to
// sit near the viewport's centre before a shot.
const settle = async () => {
  for (let i = 0; i < 60; i++) {
    const ok = await page.evaluate(() => {
      const s = window.game.character.shape.getGlobalPosition();
      return Math.abs(s.x - innerWidth / 2) < 120 && Math.abs(s.y - innerHeight / 2) < 120;
    });
    if (ok) return;
    await page.waitForTimeout(700);
  }
};
const panel = () => page.evaluate(() => {
  const el = document.getElementById('conversation');
  if (!el || el.classList.contains('hidden')) return null;
  const li = [...el.querySelectorAll('.conversationRows li')].filter(x => !x.classList.contains('conversationLeaveRow'));
  return { actor: el.querySelector('.conversationActor')?.textContent?.trim() ?? '',
    lines: el.querySelector('.conversationLines')?.textContent?.trim() ?? '',
    rows: li.map(x => x.textContent.trim()) };
});
const pressInteract = async () => {
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down('e');
  await page.waitForTimeout(1400);
  await page.keyboard.up('e');
  await page.waitForTimeout(1400);
};
const closePanel = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(600); };
const clickFirstRow = async () => {
  const node = (await page.evaluateHandle(() => [...document.querySelectorAll('#conversation .conversationRows li')]
    .find(li => !li.classList.contains('conversationLeaveRow') && !li.classList.contains('locked')) ?? null)).asElement();
  if (!node) return false;
  const b = await node.boundingBox();
  if (!b) return false;
  await page.mouse.click(b.x + Math.min(60, b.width / 2), b.y + b.height / 2);
  return true;
};

console.log('woods-w123');
await page.goto(url);
await joinAsNewCharacter(page, 'woods');
await page.evaluate(() => { const d = document.getElementById('developPanel'); if (d) d.style.display = 'none'; });
await cmd('GOD on');

// --- shots (report-style) ---------------------------------------------------
const shots = [
  ['fire', spawnOf('Fritz')],
  ['camp', { x: -108, y: -24 }],
  ['plateau', spawnOf('KoboldChief')],
  ['dark-forest-edge', spawnOf('FallenTraveller')],
  ['broken-bridge', { x: -95, y: 3 }],
  // the two forest masses, seen from the road beside them (never warp INTO one)
  ['forest-mass-west', { x: -128.5, y: 8.5 }],
  ['forest-mass-east', { x: -107.5, y: -6.5 }],
];
for (const [name, at] of shots) {
  await warp({ x: at.x + 1.5, y: at.y + 1.5 });
  await settle();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${outdir}/${name}.png` });
  console.log(`  · shot ${name} at (${at.x.toFixed(1)}, ${at.y.toFixed(1)})`);
}

// --- the new NPCs answer E with their own panel -------------------------------
// Each stand point is 1.1 u off the NPC, on the side away from its neighbours.
const talk = [
  ['Fritz', spawnOf('Fritz'), { dx: -1.1, dy: -0.2 }, /What happened here\?/],
  // a fresh character has none of Tobias's quests running, so his rows all hide
  ['Tobias', spawnOf('Tobias'), { dx: 0.5, dy: 1.0 }, null],
  ['Gnome 1', spawnOf('Gnome1'), { dx: 0, dy: 1.0 }, null],
  ['Lamplighter', spawnOf('Lamplighter'), { dx: -1.0, dy: -0.4 }, /Can I help with your lamps\?/],
  ['Woodcutter 1', spawnOf('FallenTraveller'), { dx: 0, dy: -1.1 }, null],
  ['Woodcutter 2', spawnOf('Woodcutter2'), { dx: 0, dy: 1.1 }, null],
  ['Woodcutter 3', spawnOf('Woodcutter3'), { dx: 0, dy: 1.1 }, null],
];
for (const [actor, at, off, row] of talk) {
  await warp({ x: at.x + off.dx, y: at.y + off.dy });
  await page.waitForTimeout(1500);
  await pressInteract();
  const p = await panel();
  if (!p) { fail(`talk ${actor}`, 'no panel opened'); continue; }
  const rowOk = !row || p.rows.some(r => row.test(r));
  if (p.actor === actor && rowOk) pass(`talk ${actor}`, `"${p.lines.slice(0, 60)}…" rows: ${p.rows.length}`);
  else fail(`talk ${actor}`, `actor "${p.actor}", rows ${JSON.stringify(p.rows)}`);
  await page.screenshot({ path: `${outdir}/talk-${actor.replace(/ /g, '-')}.png` });
  await closePanel();
}

// --- each new door moves the player to its anchor ------------------------------
const doors = [
  ['kobold NE mouth', 'kobold-hub-inside'],
  ['kobold east branch to the city', 'koboldcave-city'],
  ['kobold west branch to the plateau', 'koboldcave-surface'],
  ['bear cave mouth', 'bearcave-inside'],
  ['bear cave way out', 'bearcave-surface'],
  ['wolf den mouth', 'wolfden-inside'],
  ['wolf den way out', 'wolfden-surface'],
];
for (const [leg, anchor] of doors) {
  const door = exitTo(anchor);
  const dest = anchorAt(anchor);
  // stand just off the door, on the side its own anchor is not
  await warp({ x: door.x + 0.9, y: door.y + 0.3 });
  await page.waitForTimeout(1500);
  await pressInteract();
  const p = await panel();
  if (!p) { fail(leg, 'no panel at the door'); continue; }
  await clickFirstRow();
  let q = await pos();
  for (let i = 0; i < 12 && Math.hypot(q.x - dest.x, q.y - dest.y) > 2.5; i++) {
    await page.waitForTimeout(700);
    q = await pos();
  }
  const d = Math.hypot(q.x - dest.x, q.y - dest.y);
  if (d <= 2.5) pass(leg, `"${p.actor}" → landed ${d.toFixed(2)} u from ${anchor}`);
  else fail(leg, `"${p.actor}" rows ${JSON.stringify(p.rows)}; at (${q.x.toFixed(1)}, ${q.y.toFixed(1)}), ${d.toFixed(1)} u from ${anchor}`);
  await settle();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${outdir}/door-${anchor}.png` });
  await closePanel();
}

console.log(`\n${results.filter(r => r === 'PASS').length}/${results.length} PASS, console errors: ${consoleErrors.length}`);
consoleErrors.slice(0, 5).forEach(e => console.log('  ' + e));
console.log(`shots: ${outdir}`);
await browser.close();
