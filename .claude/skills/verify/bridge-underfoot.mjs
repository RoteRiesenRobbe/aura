#!/usr/bin/env node
// `underfoot` — a prop you WALK ON draws BELOW the character walking on it
// (PO 2026-09-16; plan-world-paths.md D6's z-order half, which the original
// ruling got wrong: it compared the deck to layers.terrain.paths, never to
// layers.characters).
//
// What this leg can show WITHOUT a placed bridge:
//   1. ⭐ THE ORDER. `layers.props.underfoot` is in the scene graph and sits
//      BELOW `layers.characters` in the same parent. That ordering is the whole
//      fix — a prop on `props.standing` is added AFTER characters and covers
//      them.
//   2. The client still boots: 0 page errors.
//   3. ⭐ plan-prop-draw-order.md P3 (D4): `underfoot` is a PLACEMENT fact now,
//      streamed per entity as Resource.underfoot. The leg WARPs to the first
//      placement in world.json's props.underfoot and checks it draws on
//      `props.underfoot` and NOT on `props.standing` (skipped, loudly, when the
//      zone places none). Derived from the file, never typed in.
//   4. The deck sits above the last ground layer (`terrain.textures`), and the
//      retired `resourceSpots` container is gone (plan-prop-draw-order.md P2).
//
// ⛔ What it CANNOT show: that the deck reads correctly under a player standing
// on it. That is a pixel A/B and it needs an authored placement over the river —
// see the hand-over note. Do not read a green run here as "the bridge looks
// right".
//
//   node .claude/skills/verify/bridge-underfoot.mjs [url]
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { readFileSync } from 'node:fs';
import { readZone } from './lib/zone.mjs';
import { fileURLToPath } from 'node:url';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');
import { joinAsNewCharacter } from './lib/join.mjs';

const url = process.argv[2] || 'http://localhost:2001/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const repo = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const world = readZone(join(repo, 'api/zones/world.json'));
// World's origin is (0, 0), so file units x 120 are wire pixels.
const deck = ((world.props && world.props.underfoot) || [])[0];

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await (await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 900 } })).newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await joinAsNewCharacter(page, 'deck');
await page.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
await page.waitForTimeout(1500);

const report = await page.evaluate(() => {
  const g = window.game;
  const decks = g.layers.props.underfoot;
  const chars = g.layers.characters;
  const trees = g.layers.props.standing;
  const parent = decks && decks.parent;
  const idx = (c) => (parent ? parent.children.indexOf(c) : -1);

  // ⚑ Counted off the CONTAINERS, not off the entity manager: the layer a prop
  // ended up in is the only fact this leg is about, and a container cannot
  // disagree with itself about what it is drawing.
  return {
    hasDecks: !!decks,
    inScene: !!parent,
    deckIdx: idx(decks), charIdx: idx(chars), treeIdx: idx(trees),
    texturesIdx: idx(g.layers.terrain.textures),
    // ⚑ plan-prop-draw-order.md P2 (D8) retired the resource-spot decals with
    // their container. Checked by the layer key AND by name anywhere on the
    // stage, so a container re-added under another key is caught too.
    spotsLayer: 'resourceSpots' in g.layers.terrain,
    // The control: the same walk must find `characters` exactly once, or a 0
    // for resourceSpots proves nothing.
    ...(() => {
      const count = (label) => {
        let n = 0;
        const walk = (c) => { if (c.label === label) { n++; } (c.children || []).forEach(walk); };
        let root = chars;
        while (root && root.parent) { root = root.parent; }
        walk(root);
        return n;
      };
      return { spotsByName: count('resourceSpots'), charsByName: count('characters') };
    })(),
    deckChildren: decks ? decks.children.length : -1,
    treeChildren: trees ? trees.children.length : -1,
  };
});

const fail = [];
if (!report.hasDecks) { fail.push('layers.props.underfoot does not exist'); }
if (!report.inScene) { fail.push('layers.props.underfoot is not in the scene graph'); }
if (!(report.deckIdx < report.charIdx)) { fail.push(`decks (${report.deckIdx}) is NOT below characters (${report.charIdx})`); }
if (!(report.texturesIdx >= 0 && report.texturesIdx < report.deckIdx)) { fail.push(`decks (${report.deckIdx}) is NOT above terrain.textures (${report.texturesIdx})`); }
if (report.charsByName !== 1) { fail.push(`the stage walk found ${report.charsByName} 'characters' container(s), expected 1: the resourceSpots check is blind`); }
if (report.spotsLayer || report.spotsByName) { fail.push(`resourceSpots is back (layer key ${report.spotsLayer}, ${report.spotsByName} container(s) by name)`); }

// Leg 3: the placed deck, by position, on the right container and only there.
let deckLeg = '⚑ NO PLACEMENT in world.json props.underfoot — the per-placement flag is unproven';
if (deck) {
  await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
  const cmd = async (text) => {
    await page.evaluate((c) => {
      const input = document.getElementById('console_command');
      input.value = c;
      document.getElementById('console').dispatchEvent(new Event('submit', { cancelable: true }));
    }, text);
    await page.waitForTimeout(700);
  };
  await cmd('GOD');
  const at = { x: deck.x * 120, y: deck.y * 120 };
  await cmd(`WARP ${Math.round(at.x)} ${Math.round(at.y + 240)}`);
  const where = () => page.evaluate(({ x, y }) => {
    const on = (layer) => layer.children.some((c) => Math.abs(c.position.x - x) < 2 && Math.abs(c.position.y - y) < 2);
    return { underfoot: on(window.game.layers.props.underfoot), standing: on(window.game.layers.props.standing) };
  }, at);
  let seen = { underfoot: false, standing: false };
  for (let end = Date.now() + 30_000; Date.now() < end && !seen.underfoot && !seen.standing;) {
    seen = await where();
    if (!seen.underfoot && !seen.standing) { await page.waitForTimeout(500); }
  }
  if (!seen.underfoot) { fail.push(`the ${deck.type} at props.underfoot[0] (${deck.x}, ${deck.y}) is NOT on props.underfoot`); }
  if (seen.standing) { fail.push(`the ${deck.type} at props.underfoot[0] is ALSO on props.standing`); }
  deckLeg = seen.underfoot && !seen.standing
    ? `✓ the ${deck.type} at props.underfoot[0] (${deck.x}, ${deck.y}) draws on props.underfoot, not on standing`
    : `✖ the ${deck.type} at props.underfoot[0]: ${JSON.stringify(seen)}`;
}
if (errors.length) { fail.push(`${errors.length} page error(s): ${errors.slice(0, 3).join(' | ')}`); }

console.log(JSON.stringify(report, null, 2));
console.log(deckLeg);
console.log(fail.length ? '✖ FAIL: ' + fail.join('; ') : '✓ PASS: decks is in the scene, above terrain.textures and below characters; no resourceSpots');

await browser.close();
process.exit(fail.length ? 1 : 0);
