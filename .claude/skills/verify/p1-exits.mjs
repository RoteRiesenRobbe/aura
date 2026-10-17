#!/usr/bin/env node
// plan-passages.md P1 verification: a door authored in `exits` (not `spawns`)
// still talks and still moves you, at the real game surface.
//
// Two doors, both derived from the zone files so a re-placement moves them
// rather than rotting this: the world's door to `barn-inside` (no `door`, so
// the GENERIC CaveMouth) and the barn's way back up (`door: "CaveExit"`). The
// two must open DIFFERENT panels (the `door` field is honoured) and each row
// must land beside its anchor.
//
// ⚑ GOD on throughout: nothing here is about combat, and a wolf on the way
// to the barn door would null the scene graph mid-leg.
//
// Usage: node p1-exits.mjs [url] [outdir]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');
import { joinAsNewCharacter } from './lib/join.mjs';
import { readZone } from './lib/zone.mjs';

const url = process.argv[2] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const outdir = process.argv[3] || '/tmp/p1-exits-shots';
mkdirSync(outdir, { recursive: true });

// --- venue, derived from the zone files ---------------------------------------
const root = new URL('../../../', import.meta.url);
const zones = Object.fromEntries(['world', 'barn'].map(n =>
  [n, readZone(new URL(`api/zones/${n}.json`, root).pathname.replace(/^\/([A-Za-z]:)/, '$1'))]));
const world = (z, p) => ({ x: p.x + (zones[z].origin?.x || 0), y: p.y + (zones[z].origin?.y || 0) });
const anchorAt = (name) => {
  for (const z of Object.keys(zones)) {
    const a = (zones[z].anchors || []).find(x => x.name === name);
    if (a) { return world(z, a); }
  }
  throw new Error(`no anchor ${name}`);
};
const barnDoor = zones.world.exits.find(e => e.anchor === 'barn-inside');
const barnUp = zones.barn.exits[0];
if (!barnDoor || !barnUp || barnDoor.door || barnUp.door !== 'CaveExit') {
  throw new Error('venue drifted: expected a generic door to barn-inside and a CaveExit in barn.json');
}
const CASES = [
  { leg: 'generic door (world → barn)', at: world('world', barnDoor), dest: anchorAt(barnDoor.anchor) },
  { leg: 'CaveExit door (barn → world)', at: world('barn', barnUp), dest: anchorAt(barnUp.anchor) },
];

const results = [];
const pass = (leg, note) => { results.push(['PASS', leg]); console.log(`  ✔ ${leg} - ${note}`); };
const fail = (leg, note) => { results.push(['FAIL', leg]); console.log(`  ✘ ${leg} - ${note}`); };

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
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
const panel = () => page.evaluate(() => {
  const el = document.getElementById('conversation');
  if (!el || el.classList.contains('hidden')) return null;
  const li = [...el.querySelectorAll('.conversationRows li')].filter(x => !x.classList.contains('conversationLeaveRow'));
  return { actor: el.querySelector('.conversationActor')?.textContent?.trim() ?? '',
    rows: li.map(x => ({ text: x.textContent.trim(), locked: x.classList.contains('locked') })) };
});
// ⚑ A ~1.4 s HOLD, never keyboard.press (c1-open-portal.mjs): the interact
// key is sampled off a throttled rAF clock in a headless page.
const pressInteract = async () => {
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down('e');
  await page.waitForTimeout(1400);
  await page.keyboard.up('e');
  await page.waitForTimeout(1400);
};
const clickFirstRow = async () => {
  const node = (await page.evaluateHandle(() => [...document.querySelectorAll('#conversation .conversationRows li')]
    .find(li => !li.classList.contains('conversationLeaveRow') && !li.classList.contains('locked')) ?? null)).asElement();
  if (!node) return false;
  await node.scrollIntoViewIfNeeded();
  const b = await node.boundingBox();
  if (!b) return false;
  await page.mouse.click(b.x + Math.min(60, b.width / 2), b.y + b.height / 2);
  return true;
};

console.log('p1-exits');
await page.goto(url);
await joinAsNewCharacter(page, 'p1exits');
await cmd('GOD on');

const actors = [];
for (const c of CASES) {
  // One unit beside the door: inside its 2 u reach, clear of its body.
  await cmd(`WARP ${Math.round((c.at.x + 1) * 120)} ${Math.round(c.at.y * 120)}`);
  await page.waitForTimeout(2500);
  await pressInteract();
  const p = await panel();
  if (!p || !p.actor || !p.rows.some(r => !r.locked)) {
    fail(c.leg, `no conversation with a takeable row opened (${JSON.stringify(p)})`);
    await page.screenshot({ path: join(outdir, `${c.leg.split(' ')[0]}-nopanel.png`) });
    continue;
  }
  actors.push(p.actor);
  if (!(await clickFirstRow())) { fail(c.leg, 'could not click the row'); continue; }
  await page.waitForTimeout(3500);
  const at = await pos();
  const d = Math.hypot(at.x - c.dest.x, at.y - c.dest.y);
  if (d <= 2) {
    pass(c.leg, `"${p.actor}" → landed ${d.toFixed(2)} u from its anchor`);
  } else {
    fail(c.leg, `"${p.actor}" → at (${at.x.toFixed(1)}, ${at.y.toFixed(1)}), ${d.toFixed(1)} u from its anchor`);
  }
  await page.screenshot({ path: join(outdir, `${c.leg.split(' ')[0]}.png`) });
}

if (actors.length === 2 && actors[0] !== actors[1]) {
  pass('door field', `the two doors talk as different definitions ("${actors[0]}" / "${actors[1]}")`);
} else {
  fail('door field', `expected two different actors, got ${JSON.stringify(actors)}`);
}
if (consoleErrors.length) { fail('page errors', consoleErrors.slice(0, 3).join(' | ')); }

await browser.close();
const failed = results.filter(r => r[0] === 'FAIL').length;
console.log(failed ? `FAILED ${failed}/${results.length}` : `all ${results.length} green`);
process.exit(failed ? 1 : 0);
