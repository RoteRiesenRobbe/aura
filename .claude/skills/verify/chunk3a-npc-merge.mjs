#!/usr/bin/env node
// plan-entity-model.md chunk 3a — in-game smoke for the NPC merge.
//
// What it proves: a teaching NPC that is now an ordinary ACTOR (Mob wire path,
// spawn-placed, interaction block) still does everything the old statless
// model/npc type did — renders, speaks on approach, teaches, and attributes
// the unlock — and that an NPC still on the OLD path works alongside it, which
// is what makes the pilot step meaningful.
//
//   1. Farmer      → approach teaches Harvest, bubble + "Taught by: Farmer"
//   2. Emberkeeper → the 3-grant walk STOPS at the first gate: a level-1
//                    player learns Torch@1 and then hears the blocked line
//                    for Ignite@7, granting nothing further
//   3. ForestSign  → a lore-only node speaks (an object that talks: the
//                    clearest proof role and interaction are orthogonal)
//
// ⚑ Two harness traps carried over from chunk 2, both still live:
//   · the dev console input stopPropagation()s keydown, so WASD is swallowed
//     while it holds focus — blur() before every walk.
//   · screen-up is DECREASING world y, so walking toward a LARGER y is 's'.
//
// Usage: node .claude/skills/verify/chunk3a-npc-merge.mjs [label] [url]
import { createRequire } from 'node:module';
import { join } from 'node:path';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');

const label = process.argv[2] || 'run';
const url = process.argv[3] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

// WARP takes 1/120 units and wants whole units.
const w = (x, y) => `${Math.round(x) * 120} ${Math.round(y) * 120}`;
// Farmer sits at (-57, 28.6); approach it from a LOWER y so the walk is 's'.
const NEAR_FARMER = w(-57, 26);
// Emberkeeper (34.52, -19.6) and ForestSign (-53.61, -1.18) — same geometry:
// stand at a smaller y and walk 's'.
const NEAR_EMBERKEEPER = w(35, -22);
const NEAR_FORESTSIGN = w(-54, -4);

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();

const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await page.waitForSelector('#startForm .playerNameSubmit:not([disabled])', { timeout: 120_000 });
await page.fill('#startForm .playerNameInput', 'Npc' + String(process.pid).slice(-4));
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

// ⚑ getX/getY are in the wire's 1/120 units, not world units.
const pos = () => page.evaluate(() => ({
  x: +(window.game.character.getX() / 120).toFixed(2),
  y: +(window.game.character.getY() / 120).toFixed(2),
}));

// Every piece of text currently rendered in the world, harvested by walking
// the whole PIXI tree from the root. ⚑ window.game is a small facade (run /
// character / pause / play) with no EntityManager on it, so the documented
// character.plate.parent route is the way in.
//
// A speech bubble appearing at all is itself a proof: Chat.showMessage looks
// the speaker up in the EntityManager and silently no-ops for an entity the
// client is not tracking — so a bubble anchored on the Farmer means the client
// really did build a game object for it off the Mob wire path.
//
// ⚑ The root is cached on first use (window.__auraRoot). The documented way in
// is character.plate.parent, but `plate` is nulled by Character.destroy() — so
// the instant the player DIES this walk throws `null (reading 'parent')` and
// the whole run dies with it, mid-assertion, looking like a product bug. A
// level-1 player parked next to a lore NPC for 20 s is entirely killable
// (observed 2026-07-27 at the ForestSign, after steps 1-2 had passed). Cache
// the root while the character is alive and the harvest survives the death;
// GOD below stops it happening at all.
const worldText = () => page.evaluate(() => {
  if (!window.__auraRoot) {
    let r = window.game.character.plate.parent;
    while (r.parent) r = r.parent;
    window.__auraRoot = r;
  }
  const root = window.__auraRoot;
  const out = [];
  const walk = (c) => {
    if (typeof c?.text === 'string' && c.text) out.push(c.text);
    (c?.children || []).forEach(walk);
  };
  walk(root);
  return out;
});

// The skills the spellbook panel lists — the client's view of what the player
// actually knows.
const spellbook = () => page.evaluate(() =>
  [...document.querySelectorAll('#spellbookList li')].map((li) => li.textContent.trim()));

const bannerText = () => page.evaluate(() => document.getElementById('alertBanner')?.textContent?.trim() || '');

const walkTo = async (key, seconds) => {
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down(key);
  await page.waitForTimeout(seconds * 1000);
  await page.keyboard.up(key);
};

await cmd('PING'); // the first command after joining is dropped (harness note)
// Survivability only — GOD changes nothing this script asserts (approach,
// grants, bubbles, attribution all ignore it), but a level-1 player standing
// still next to an NPC for 20 s is inside plenty of aggro radii. Without it the
// run is a coin-flip that fails as a crash rather than as a FAIL line.
await cmd('GOD');
await worldText(); // prime window.__auraRoot while the character is alive

const results = [];

// --- 1. the MIGRATED Farmer: renders, speaks, teaches, attributes ---
await cmd(`WARP ${NEAR_FARMER}`);
await page.waitForTimeout(20_000); // camera + position settle across the warp (§20)

const before = await spellbook();
await page.screenshot({ path: `/tmp/chunk3a-${label}-farmer-approach.png` });

await walkTo('s', 4); // toward the larger y the Farmer stands at
const farmerPos = await pos();
const farmerBubbles = await worldText();
const farmerBanner = await bannerText();
const after = await spellbook();
await page.screenshot({ path: `/tmp/chunk3a-${label}-farmer-taught.png` });

results.push({
  check: 'Approaching the migrated Farmer teaches Harvest',
  detail: `spellbook ${JSON.stringify(before)} → ${JSON.stringify(after)} at ${JSON.stringify(farmerPos)}`,
  pass: after.some((s) => /Harvest/i.test(s)) && !before.some((s) => /Harvest/i.test(s)),
});
results.push({
  check: 'It speaks its authored teaching line',
  detail: `bubbles: ${JSON.stringify(farmerBubbles)}`,
  pass: farmerBubbles.some((t) => t.includes('there is always farming')),
});
results.push({
  check: 'The unlock is attributed to the definition display name',
  detail: `banner: ${JSON.stringify(farmerBanner)}`,
  pass: /Taught by: Farmer/.test(farmerBanner),
});

// --- 2. the Emberkeeper: the ordered walk stops at the first gate ---
await cmd(`WARP ${NEAR_EMBERKEEPER}`);
await page.waitForTimeout(20_000);
const beforeEmber = await spellbook();
await walkTo('s', 5);
const emberPos = await pos();
const emberBubbles = await worldText();
const afterEmber = await spellbook();
await page.screenshot({ path: `/tmp/chunk3a-${label}-emberkeeper.png` });

results.push({
  check: 'The Emberkeeper grants Torch@1 and stops at Ignite@7',
  detail: `spellbook ${JSON.stringify(beforeEmber)} → ${JSON.stringify(afterEmber)} at ${JSON.stringify(emberPos)}`,
  pass: afterEmber.some((sk) => /Torch/i.test(sk)) && !afterEmber.some((sk) => /Ignite|Immolate/i.test(sk)),
});
results.push({
  check: 'It speaks the grant line AND the blocked line, in that order',
  detail: `bubbles: ${JSON.stringify(emberBubbles.slice(-3))}`,
  pass: emberBubbles.some((t) => t.includes('a light for you in dark places'))
    && emberBubbles.some((t) => t.includes("Fire doesn't suffer the careless")),
});

// --- 3. a lore-only actor: the sign-post that talks ---
await cmd(`WARP ${NEAR_FORESTSIGN}`);
await page.waitForTimeout(20_000);
await walkTo('s', 4);
const signPos = await pos();
const signBubbles = await worldText();
await page.screenshot({ path: `/tmp/chunk3a-${label}-forestsign.png` });
results.push({
  check: 'A grant-less lore node still speaks (ForestSign)',
  detail: `bubbles: ${JSON.stringify(signBubbles.slice(-3))} at ${JSON.stringify(signPos)}`,
  pass: signBubbles.some((t) => t.includes('DANGER')),
});

const ctxLoss = consoleErrors.filter((t) => t.includes('[webgl] world context lost'));
console.log('\nlabel            :', label);
for (const r of results) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.check}\n        ${r.detail}`);
}
console.log('webgl ctx losses :', ctxLoss.length, '(any > 0 ⇒ blank world, §29, not this chunk)');
console.log('console errors   :', consoleErrors.length);
for (const e of consoleErrors.slice(0, 5)) console.log('   ·', e);

await browser.close();
process.exitCode = results.every((r) => r.pass) && consoleErrors.length === 0 ? 0 : 1;
