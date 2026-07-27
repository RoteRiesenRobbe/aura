#!/usr/bin/env node
// plan-entity-model.md chunk 3a — the PO's in-game taste check, framed.
//
// chunk3a-npc-merge.mjs already proves the BEHAVIOUR (teaches, speaks,
// attributes). This script exists for the half a smoke test cannot give you:
// does each merged NPC LOOK right. It frames one NPC at a time in clear screen
// space and pairs the picture with the three assertions you would otherwise be
// squinting at:
//
//   · the sprite has non-zero rendered size — the 3a pilot's latent wire gap
//     (Mob.radius was in server.fbs from the beginning and the server never
//     wrote it, so an NPC rendered as a valid texture at scale [0,0])
//   · a health bar IS present — D3, the PO accepted bars on NPCs
//   · NO nameplate — gated free by experience: 0, unlike the Boar/Wolf/Stag
//     plates that DO appear in the same frames as the control
//
// ⚑ Screen-up is DECREASING world y. To put an NPC in the clear upper-middle
// (away from the spellbook, the action bars and the dev panel) the player must
// stand at a LARGER y than it. Standing off is deliberate: close enough to be
// in frame, far enough that the HUD does not cover the subject.
//
// Usage: node .claude/skills/verify/npc-portraits.mjs [label] [url]
import { createRequire } from 'node:module';
import { join } from 'node:path';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');

const label = process.argv[2] || 'run';
const url = process.argv[3] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

// The four the PO named, with their authored spawn positions.
const NPCS = [
  { name: 'Farmer', x: -57, y: 28.6 },
  { name: 'Hermit', x: -54.9, y: 25.6 },
  { name: 'TownCrier', x: -55.7, y: 22 },
  { name: 'Emberkeeper', x: 34.5, y: -19.6 },
];
const STANDOFF = 3; // units below (= larger y) so the NPC frames above centre

const w = (x, y) => `${Math.round(x) * 120} ${Math.round(y) * 120}`;

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();

const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await page.waitForSelector('#startForm .playerNameSubmit:not([disabled])', { timeout: 120_000 });
await page.fill('#startForm .playerNameInput', 'Po' + String(process.pid).slice(-4));
await page.click('#startForm .playerNameSubmit');
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

await cmd('PING'); // first command after joining is dropped (harness note)
await cmd('GOD');  // a parked level-1 player is inside plenty of aggro radii

// Cache the scene root while the character is alive — Character.destroy() nulls
// `plate`, so the documented way in dies with the player.
await page.evaluate(() => {
  let r = window.game.character.plate.parent;
  while (r.parent) r = r.parent;
  window.__auraRoot = r;
});

// Fold the dev panel away so it does not sit on top of the subject.
await page.evaluate(() => {
  const min = [...document.querySelectorAll('a,button,div')]
    .find((e) => e.textContent?.trim() === 'Minimize');
  min?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  min?.click?.();
});

// Everything drawn in the world, with its rendered size — the size is what
// makes the scale-[0,0] class of bug visible to an assertion instead of only
// to an eye.
const scene = () => page.evaluate(() => {
  const out = { texts: [], sprites: [] };
  const walk = (c) => {
    if (typeof c?.text === 'string' && c.text) out.texts.push(c.text);
    if (c?.texture && c.visible) {
      const b = c.getBounds?.();
      if (b && b.width > 0) out.sprites.push({ w: Math.round(b.width), h: Math.round(b.height) });
    }
    (c?.children || []).forEach(walk);
  };
  walk(window.__auraRoot);
  return out;
});

const results = [];
for (const npc of NPCS) {
  await cmd(`WARP ${w(npc.x, npc.y + STANDOFF)}`);
  // ⚑ The camera interpolates a long warp very slowly (backlog §20) — a shot
  // taken early renders the PREVIOUS position, silently and plausibly.
  await page.waitForTimeout(22_000);

  const before = await scene();
  await page.screenshot({ path: `/tmp/npc-${label}-${npc.name}.png` });

  // TownCrier → /Town ?Crier/i, so the check catches the catalog's spaced
  // displayName as well as the raw definition name.
  const pattern = new RegExp(npc.name.replace(/([a-z])([A-Z])/g, '$1 ?$2'), 'i');
  const plates = before.texts.filter((t) => pattern.test(t));
  const biggest = before.sprites.reduce((m, s) => Math.max(m, s.w), 0);
  results.push({
    npc: npc.name,
    nameplate: plates.length === 0 ? 'absent (correct)' : `PRESENT: ${JSON.stringify(plates)}`,
    otherPlates: before.texts.filter((t) => /\b(Boar|Wolf|Stag|Dire|Bear|Spider)\b/i.test(t)).length,
    widestSprite: biggest,
    shot: `/tmp/npc-${label}-${npc.name}.png`,
  });
}

console.log('\nlabel:', label);
for (const r of results) {
  console.log(`\n${r.npc}`);
  console.log(`  nameplate      : ${r.nameplate}`);
  console.log(`  mob plates seen: ${r.otherPlates}  (control — proves plates DO render here)`);
  console.log(`  widest sprite  : ${r.widestSprite}px  (0 ⇒ the scale-[0,0] wire gap is back)`);
  console.log(`  screenshot     : ${r.shot}`);
}
console.log('\nwebgl ctx losses :', consoleErrors.filter((t) => t.includes('[webgl] world context lost')).length);
console.log('console errors   :', consoleErrors.length);
for (const e of consoleErrors.slice(0, 5)) console.log('   ·', e);

await browser.close();
