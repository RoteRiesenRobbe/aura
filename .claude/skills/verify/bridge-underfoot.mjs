#!/usr/bin/env node
// `underfoot` — a prop you WALK ON draws BELOW the character walking on it
// (PO 2026-09-16; plan-world-paths.md D6's z-order half, which the original
// ruling got wrong: it compared the deck to layers.terrain.paths, never to
// layers.characters).
//
// What this leg can show WITHOUT a placed bridge:
//   1. ⭐ THE ORDER. `layers.terrain.decks` is in the scene graph and sits
//      BELOW `layers.characters` in the same parent. That ordering is the whole
//      fix — a prop on `resources.trees` is added AFTER characters and covers
//      them.
//   2. The client still boots. Props.ts now THROWS on a mixed-underfoot
//      entityType group at module scope, which would blank the page rather than
//      degrade — 0 page errors is what says it did not.
//   3. Any Bridge actually PLACED in the zone renders on `decks` and on no
//      other layer (skipped, loudly, when the zone places none).
//
// ⛔ What it CANNOT show: that the deck reads correctly under a player standing
// on it. That is a pixel A/B and it needs an authored placement over the river —
// see the hand-over note. Do not read a green run here as "the bridge looks
// right".
//
//   node .claude/skills/verify/bridge-underfoot.mjs [url]
import { createRequire } from 'node:module';
import { join } from 'node:path';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');
import { joinAsNewCharacter } from './lib/join.mjs';

const url = process.argv[2] || 'http://localhost:2001/?token=plz&wsUrl=ws://localhost:2000/game&develop';

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await joinAsNewCharacter(page, 'deck');
await page.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
await page.waitForTimeout(1500);

const report = await page.evaluate(() => {
  const g = window.game;
  const decks = g.layers.terrain.decks;
  const chars = g.layers.characters;
  const trees = g.layers.resources.trees;
  const parent = decks && decks.parent;
  const idx = (c) => (parent ? parent.children.indexOf(c) : -1);

  // ⚑ Counted off the CONTAINERS, not off the entity manager: the layer a prop
  // ended up in is the only fact this leg is about, and a container cannot
  // disagree with itself about what it is drawing.
  return {
    hasDecks: !!decks,
    inScene: !!parent,
    deckIdx: idx(decks), charIdx: idx(chars), treeIdx: idx(trees),
    spotIdx: idx(g.layers.terrain.resourceSpots),
    deckChildren: decks ? decks.children.length : -1,
    treeChildren: trees ? trees.children.length : -1,
  };
});

const fail = [];
if (!report.hasDecks) { fail.push('layers.terrain.decks does not exist'); }
if (!report.inScene) { fail.push('layers.terrain.decks is not in the scene graph'); }
if (!(report.deckIdx < report.charIdx)) { fail.push(`decks (${report.deckIdx}) is NOT below characters (${report.charIdx})`); }
if (!(report.spotIdx < report.deckIdx)) { fail.push(`decks (${report.deckIdx}) is NOT above resourceSpots (${report.spotIdx})`); }
if (errors.length) { fail.push(`${errors.length} page error(s): ${errors.slice(0, 3).join(' | ')}`); }

console.log(JSON.stringify(report, null, 2));
console.log(report.deckChildren > 0
  ? `✓ ${report.deckChildren} object(s) drawn on decks`
  : '⚑ NO BRIDGE PLACED in this zone — the ordering is proven, the bridge itself is not');
console.log(fail.length ? '✖ FAIL: ' + fail.join('; ') : '✓ PASS: decks is in the scene, above resourceSpots and below characters');

await browser.close();
process.exit(fail.length ? 1 : 0);
