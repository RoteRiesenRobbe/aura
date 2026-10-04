#!/usr/bin/env node
// Talkable remains (EntityType Remains) and `the-lost-friend` at the game surface.
//
// Boundary: the lore body at the farmland's burnt cart answers with its lines;
// the silent Remains prop draws (screenshot only); the Wanderer offers the quest,
// talking to the FallenTraveller in the kobold cave advances it, and the
// Wanderer's turn-in completes it. Screenshots of both bodies and the prop for
// the art pass. XP amounts and the census are Go pins (quests/content_test.go).
//
// ⚑ The Wanderer MOVES (spawn randomised ±4 units, wanders 4 more): the offer
// and turn-in legs search a ring of warp points, as c1-kill-quests.mjs does.
// ⚑ Restart aurad first and run this script ALONE (standing conversant rule).
//
// Usage: node .claude/skills/verify/remains-lost-friend.mjs [label] [url]
import { createRequire } from 'node:module';
import { join } from 'node:path';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');
import { joinAsNewCharacter } from './lib/join.mjs';
import { readZone } from './lib/zone.mjs';

const label = process.argv[2] || 'run';
const url = process.argv[3] || 'http://localhost:2001/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

// Positions come from the zone files (tests derive, never hardcode). A cave
// zone's coordinates are local to its origin.
const world = readZone(new URL('../../../api/zones/world.json', import.meta.url));
const cave = readZone(new URL('../../../api/zones/koboldCave.json', import.meta.url));
const one = (zone, mob) => {
  const s = zone.spawns.find((sp) => sp.mob === mob);
  if (!s) throw new Error(`${mob} is not placed`);
  return { x: s.x + (zone.origin?.x ?? 0), y: s.y + (zone.origin?.y ?? 0) };
};
const CARTER = one(world, 'DeadCarter');
const FRIEND = one(cave, 'FallenTraveller');
const WANDERER = one(world, 'Wanderer');
const PROP = Object.values(world.props).flat().find((p) => p.type === 'Remains');

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();

const consoleErrors = [];
// A headless page has no audio device; that error is the environment's.
page.on('console', (m) => { if (m.type() === 'error' && !/AudioContext/.test(m.text())) consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

const results = [];
const check = (name, pass, detail) => results.push({ check: name, pass, detail });

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await joinAsNewCharacter(page, 'remains');
await page.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
await page.evaluate(() => { const p = document.getElementById('developPanel'); if (p) p.style.display = 'none'; });

const cmd = async (text) => {
  await page.evaluate((t) => {
    const input = document.getElementById('console_command');
    input.value = t;
    document.getElementById('console').dispatchEvent(new Event('submit', { cancelable: true }));
  }, text);
  await page.waitForTimeout(900);
};
const warpTo = async (at, dx = 0, dy = 0) => {
  await cmd(`WARP ${Math.round((at.x + dx) * 120)} ${Math.round((at.y + dy) * 120)}`);
  await page.waitForTimeout(1500);
};
const panel = () => page.evaluate(() => {
  const el = document.getElementById('conversation');
  if (!el || el.classList.contains('hidden')) return null;
  return {
    actor: el.querySelector('.conversationActor')?.textContent?.trim() ?? '',
    lines: el.querySelector('.conversationLines')?.textContent?.trim() ?? '',
    rows: [...el.querySelectorAll('.conversationRows li')].map((li) => li.textContent.trim()),
  };
});
const press = async (key) => {
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down(key);
  await page.waitForTimeout(1400);
  await page.keyboard.up(key);
  await page.waitForTimeout(900);
};
const talkTo = async (actor, tries = 4) => {
  for (let i = 0; i < tries; i++) {
    const open = await panel();
    if (open && open.actor === actor) return open;
    if (open) await press('e');
    await press('e');
    const now = await panel();
    if (now && now.actor === actor) return now;
    await page.waitForTimeout(1200);
  }
  return await panel();
};
const leave = async () => { if (await panel()) await press('e'); };
const clickRow = async (needle) => {
  const handle = await page.evaluateHandle((n) =>
    [...document.querySelectorAll('#conversation .conversationRows li')].find((li) => li.textContent.includes(n)) ?? null, needle);
  const el = handle.asElement();
  if (!el) return false;
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const b = await el.boundingBox();
  if (!b) return false;
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForTimeout(1200);
  return true;
};
const closeMapIfOpen = async () => {
  if (await page.evaluate(() => { const m = document.getElementById('worldMap'); return !!m && !m.classList.contains('hidden'); })) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }
};
const seen = [];
// The Wanderer moves and stands by a campfire (E there opens the flight map),
// so read its live nameplate and stand right on its far side from the fire.
// The NPC sprite on layers.mobs.npcs nearest the authored point, in world units.
const locate = (near) => page.evaluate((n) => {
  const ref = window.game.character.plate.parent;
  let best = null;
  for (const c of window.game.layers.mobs.npcs.children) {
    const l = ref.toLocal(c.getGlobalPosition());
    const at = { x: l.x / 120, y: l.y / 120 };
    const d = Math.hypot(at.x - n.x, at.y - n.y);
    if (d < 12 && (!best || d < best.d)) best = { ...at, d };
  }
  return best;
}, near);
const findWanderer = async () => {
  for (let i = 0; i < 6; i++) {
    await warpTo(WANDERER, 0, 0);
    if (i === 0) await page.screenshot({ path: `.claude/skills/verify/remains-wanderer-${label}.png` });
    const at = await locate(WANDERER);
    if (!at) continue;
    // The nameplate sits under the portrait; stand half a unit below it.
    await warpTo(at, 0, 0.4);
    await closeMapIfOpen();
    await press('e');
    await closeMapIfOpen();
    const open = await panel();
    if (open && open.actor === 'Wanderer') return open;
    if (open) { seen.push(open.actor); await press('e'); }
  }
  return null;
};
const journalObjectives = async () => {
  if (await panel()) await leave();
  if (await page.evaluate(() => document.getElementById('journal')?.classList.contains('hidden') ?? true)) {
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press('KeyJ');
    await page.waitForTimeout(800);
  }
  const handle = await page.evaluateHandle(() =>
    [...document.querySelectorAll('#journal .journalQuest')].find((li) => li.textContent === 'The Lost Friend') ?? null);
  const el = handle.asElement();
  if (el) { const b = await el.boundingBox(); if (b) await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(500); }
  return page.evaluate(() => {
    const p = document.getElementById('journal');
    const sec = (cls) => [...(p?.querySelectorAll(`${cls} .journalQuest`) ?? [])].map((q) => q.textContent);
    return {
      completed: sec('.journalCompleted'),
      objectives: [...(p?.querySelector('.journalDetailBody')?.querySelectorAll('.journalObjective') ?? [])].map((e) => e.textContent),
    };
  });
};
const waitFor = async (predicate, timeout = 15_000) => {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await predicate()) return true;
    await page.waitForTimeout(500);
  }
  return false;
};

await cmd('GOD');
await cmd('XP 2000');

// --- leg A: the lore body at the burnt cart -----------------------------------
await warpTo(CARTER, 1.2, 0);
await page.waitForTimeout(2000);
await page.screenshot({ path: `.claude/skills/verify/remains-carter-${label}.png` });
const carter = await talkTo('Dead Carter');
check('A1 the burnt-cart body answers as "Dead Carter" with its lore lines',
  carter?.actor === 'Dead Carter' && /burnt cart/.test(carter?.lines ?? '') && /Bandits/.test(carter?.lines ?? ''), JSON.stringify(carter));
check('A2 it offers no rows beyond Leave (a lore leaf)', (carter?.rows ?? []).every((r) => r === 'Leave.'), JSON.stringify(carter?.rows));
await leave();

// --- leg B: the silent prop (look only; skipped while none is placed) --------
if (PROP) {
  await warpTo(PROP, 1.2, 0);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `.claude/skills/verify/remains-prop-${label}.png` });
} else {
  console.log('NOTE  B no Remains prop placed in world.json: no prop screenshot');
}

// --- leg C: the Wanderer's offer ----------------------------------------------
const w1 = await findWanderer();
if (!w1) {
  check('C the Wanderer was found', false, 'INCONCLUSIVE — not inside talk range at any of 21 search points; re-run. Other actors: ' + JSON.stringify(seen));
} else {
  check('C1 the Wanderer has the "Are you travelling alone?" row', w1.rows.includes('Are you travelling alone?'), JSON.stringify(w1.rows));
  await clickRow('Are you travelling alone?');
  const brief = await panel();
  check('C2 the brief names the grey cloak and the staff (what the body lines match)',
    /grey cloak/.test(brief?.lines ?? '') && /staff/.test(brief?.lines ?? ''), JSON.stringify(brief));
  check('C3 before accepting, no turn-in row', !(brief?.rows ?? []).includes('I found him. He is dead.'), JSON.stringify(brief?.rows));
  await clickRow("I'll look for him.");
  check('C4 accepting shows the search tracker',
    await waitFor(async () => (await journalObjectives()).objectives.some((o) => /Find the Wanderer's friend in the forest/.test(o))),
    JSON.stringify(await journalObjectives()));

  // --- leg D: the body in the cave --------------------------------------------
  await warpTo(FRIEND, 1.2, 0);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `.claude/skills/verify/remains-friend-${label}.png` });
  const friend = await talkTo('Fallen Traveller');
  check('D1 the cave body answers as "Fallen Traveller" (grey cloak, staff)',
    friend?.actor === 'Fallen Traveller' && /grey cloak/.test(friend?.lines ?? '') && /staff/.test(friend?.lines ?? ''), JSON.stringify(friend));
  await leave();
  check('D2 talking to it advances the quest to "Tell the Wanderer"',
    await waitFor(async () => (await journalObjectives()).objectives.includes('Tell the Wanderer')), JSON.stringify(await journalObjectives()));

  // --- leg E: the turn-in -------------------------------------------------------
  await leave();
  const w2 = await findWanderer();
  if (!w2) {
    check('E the Wanderer was found again', false, 'INCONCLUSIVE — not inside talk range; re-run');
  } else {
    await clickRow('Are you travelling alone?');
    check('E1 the turn-in row is offered and taken', await clickRow('I found him. He is dead.'), JSON.stringify(await panel()));
    check('E2 the quest is completed',
      await waitFor(async () => (await journalObjectives()).completed.includes('The Lost Friend')), JSON.stringify(await journalObjectives()));
  }
}

check('Z no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 5).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.check}${r.pass ? '' : `\n      ${r.detail}`}`);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
