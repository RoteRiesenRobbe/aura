#!/usr/bin/env node
// Vertical slice PF5, Looks (plan-vertical-slice.md §5.3) at the real game
// surface: the named NPCs each wear a face of their own (F8, F18, F30), the
// player's forest ring is green (F16), the campfire draws no bind circle
// (F7), and the Campfire tab shows its trait icons (F6). Shots for the PO.
//
// What it asserts: the 18 NPCs that shared three faces before PF5, visited
// one by one, draw 18 different portrait textures (every conversant seen on
// the way counts too); the player's forest ring tint in the world and as DOM
// (the appearance panel, masked + multiplied). Shots only: the campfire with
// no bind circle (F7) and the Campfire tab's trait icons (F6). What it CANNOT
// show: that a face fits its NPC (the PO's pick, 2026-11-26), or anything
// without the prebuilt atlases (the pack leg fails first).
//
// Venues are derived from the zone files (spawns by mob name).
//
// Usage: node pf5-looks.mjs [url] [outdir]
import { createRequire } from 'node:module';
import { mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');
import { joinAsNewCharacter } from './lib/join.mjs';
import { openSpellbook } from './lib/spellbook.mjs';
import { readZone } from './lib/zone.mjs';

const url = process.argv[2] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop&start-cmds='
  + encodeURIComponent('GOD on,LOOK ring-forest,SKILL CampHeal,SKILL CampSpeedBuff');
const outdir = process.argv[3] || '/tmp/pf5-looks-shots';
mkdirSync(outdir, { recursive: true });

const root = new URL('../../../', import.meta.url);
const zoneDir = new URL('api/zones/', root).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const zones = Object.fromEntries(readdirSync(zoneDir).filter(f => f.endsWith('.json')).map(f =>
  [f.replace(/\.json$/, ''), readZone(zoneDir + f)]));
const world = (z, p) => ({ x: p.x + (zones[z].origin?.x || 0), y: p.y + (zones[z].origin?.y || 0) });
const allOf = (z, key) => [zones[z], ...(zones[z].areas || [])].flatMap(a => a[key] || []);
const spawnOf = (mob) => {
  for (const z of Object.keys(zones)) {
    const s = allOf(z, 'spawns').find(x => x.mob === mob);
    if (s) return world(z, s);
  }
  throw new Error(`no spawn of ${mob}`);
};

// Every NPC that shared a face before PF5 (§5.3: Farmer 9, Hooded woman 4,
// Prophet 5), visited one by one: they stand too far apart for one view.
const NPCS = ['Reinhard', 'ReinhardsWife', 'Benjamin', 'Farmhand', 'Hans', 'Hedda', 'Tobias',
  'Woodcutter2', 'Woodcutter3', 'Henrik', 'Fritz', 'CaptainBrack', 'PirateDeckhand',
  'Hermit', 'Fennick', 'Gnome1', 'Governor', 'Lamplighter'];
const bindPoint = (id) => {
  for (const z of Object.keys(zones)) {
    const b = allOf(z, 'bindPoints').find(x => x.id === id);
    if (b) return world(z, b);
  }
  throw new Error(`no bind point ${id}`);
};

const results = [];
const pass = (leg, note) => { results.push('PASS'); console.log(`  ✔ ${leg} - ${note}`); };
const fail = (leg, note) => { results.push('FAIL'); console.log(`  ✘ ${leg} - ${note}`); };

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await (await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 800 } })).newPage();
const consoleErrors = [];
page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 4).join(' | ')));

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
  await page.waitForTimeout(2500);
};

// Conversants in view (a name-only plate, no level digits): their plate name
// and an id for the portrait texture they draw, stable across stops.
const faces = () => page.evaluate(() => {
  const ids = (window.__pf5Faces ??= new Map());
  return window.game.objectsInView()
    .filter((o) => o && o.medallion && o.nameElement && o.portrait && o !== window.game.character)
    .filter((o) => !/\d/.test(o.nameElement.text))
    .map((o) => {
      const t = o.portrait.texture;
      if (!ids.has(t)) ids.set(t, ids.size + 1);
      return { name: o.nameElement.text, face: ids.get(t) };
    });
});

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await joinAsNewCharacter(page, 'pf5');
await page.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
await page.waitForTimeout(2000);

const packIcons = await page.evaluate(() => fetch('/icons/icons.json').then(r => r.json()).then(j => Object.keys(j.icons || {}).length).catch(() => 0));
if (packIcons === 0) fail('pack', 'no prebuilt icons served: the faces cannot differ without the pack');
else pass('pack', `${packIcons} icons served`);

// name -> face, over every stop
const faceOf = new Map();
for (const mob of NPCS) {
  await warp(spawnOf(mob));
  await page.screenshot({ path: join(outdir, `${mob}.png`) });
  for (const { name, face } of await faces()) faceOf.set(name, face);
}
const byFace = new Map();
for (const [name, face] of faceOf) {
  if (!byFace.has(face)) byFace.set(face, []);
  byFace.get(face).push(name);
}
const shared = [...byFace.values()].filter((names) => names.length > 1);
const listing = [...faceOf].map(([n, f]) => `${n}#${f}`).join(', ');
if (faceOf.size < NPCS.length) fail('faces', `saw ${faceOf.size} conversants, want at least ${NPCS.length}: ${listing}`);
else if (shared.length) fail('faces', `shared: ${shared.map(s => s.join(' = ')).join('; ')}`);
else pass('faces', `${faceOf.size} conversants, ${byFace.size} faces: ${listing}`);

// F7: a campfire with no bind circle, for the eye (the shot).
await warp(bindPoint('spawnpoint-1'));
await page.screenshot({ path: join(outdir, 'campfire.png') });

// F16: the player's own ring wears the forest item's green.
const ringTint = await page.evaluate(() => window.game.character.medallion?.ring?.tint);
if (ringTint === 0x5fae4a) pass('ring', 'forest ring tinted 0x5fae4a');
else fail('ring', `forest ring tint ${ringTint?.toString(16)}`);

// F6: the Campfire tab of the spellbook.
await openSpellbook(page);
await page.waitForTimeout(500);
const campTab = await page.$('.spellbookTab[data-category="camp"]');
const box = campTab && await campTab.boundingBox();
if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
await page.waitForTimeout(600);
await page.screenshot({ path: join(outdir, 'spellbook-campfire.png') });

await page.keyboard.press('Escape');
await page.waitForTimeout(300);

// F16 as DOM: the appearance panel's medallions (the look picker, also the
// character select's cards) multiply the item colour over the ring through a
// layer masked to the ring's shape. jsdom cannot see a mask; this can.
const appearanceButton = await page.$('#appearanceButton');
const abox = appearanceButton && await appearanceButton.boundingBox();
if (abox) await page.mouse.click(abox.x + abox.width / 2, abox.y + abox.height / 2);
await page.waitForTimeout(800);
const tints = await page.evaluate(() => [...document.querySelectorAll('#appearance .medallionRingTint')].map((el) => {
  const cs = getComputedStyle(el);
  const medallion = el.closest('.medallion');
  return {
    ring: medallion?.dataset.ring, colour: cs.backgroundColor, blend: cs.mixBlendMode,
    mask: (cs.maskImage || cs.webkitMaskImage || '').slice(0, 40), position: cs.position,
  };
}));
await page.screenshot({ path: join(outdir, 'appearance-panel.png') });
const masked = tints.filter((t) => t.mask.startsWith('url(') && t.blend === 'multiply' && t.position === 'absolute');
const forest = tints.find((t) => t.ring === 'ring-forest');
if (tints.length === 0) fail('dom-ring', 'no medallion tint layer in the appearance panel');
else if (masked.length !== tints.length) fail('dom-ring', `unmasked tint layers: ${JSON.stringify(tints.filter((t) => !masked.includes(t)))}`);
else if (!forest || forest.colour !== 'rgb(95, 174, 74)') fail('dom-ring', `forest ring colour ${forest?.colour}`);
else pass('dom-ring', `${tints.length} masked tint layers, forest ${forest.colour}`);

if (consoleErrors.length) fail('console', consoleErrors.slice(0, 3).join(' | '));
else pass('console', 'no page errors');

await browser.close();
const passed = results.filter(r => r === 'PASS').length;
console.log(`\npf5-looks: ${passed}/${results.length} PASS, shots in ${outdir}`);
process.exit(passed === results.length ? 0 : 1);
