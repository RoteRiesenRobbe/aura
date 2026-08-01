#!/usr/bin/env node
// Playtest round 6 item 3 (chunk B) — in-game smoke for mob-vs-mob soft
// separation.
//
// Warps a GOD player into the densest wolf cluster in the world zone (7 spawns
// inside ~8 units around (-63.7, 7.5)), holds there while the pack gathers,
// and reports the things a headless run CAN judge: console errors, a lost
// world context (§29), and a screenshot of the gathered pack.
//
// It deliberately does NOT measure spacing. The client exposes no entity
// manager (`window.game` is the four-key console facade), so mob positions
// would have to be reverse-engineered out of the PIXI layer tree — the
// numbers live in the Go pins (model/mob/separation_test.go) instead, and
// whether the pack READS as spread is the PO's in-game acceptance item.
//
// Usage: node .claude/skills/verify/mob-separation.mjs [label] [url]
import { createRequire } from 'node:module';
import { join } from 'node:path';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');
import { joinAsNewCharacter } from './lib/join.mjs';

const label = process.argv[2] || 'run';
const url = process.argv[3] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

// Densest Wolf cluster in api/zones/world.json. WARP is in 1/120 units and
// wants a whole unit, so (-64, 8) → -7680 960.
const WARP = '-7680 960';

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();

const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await joinAsNewCharacter(page, 'sep');
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
await cmd('GOD');
await cmd(`WARP ${WARP}`);
// The camera interpolates slowly across a warp (backlog §20) — allow the
// settle, then let the wolves notice and gather.
await page.waitForTimeout(25_000);
await page.screenshot({ path: `/tmp/mobsep-${label}-gathered.png` });

// Then walk, so the pack is CHASING for the second shot. That is the state
// this chunk changes: a stopped mob does not steer at all, so a pack that has
// already settled on the aura ring keeps whatever spacing it arrived with.
await page.keyboard.down('a');
await page.waitForTimeout(9_000);
const pos = await page.evaluate(() => ({ x: +window.game.character.getX().toFixed(2), y: +window.game.character.getY().toFixed(2) }));
await page.screenshot({ path: `/tmp/mobsep-${label}.png` });
await page.keyboard.up('a');

const ctxLoss = consoleErrors.filter((t) => t.includes('[webgl] world context lost'));
console.log('label            :', label);
console.log('player position  :', JSON.stringify(pos), '(target -64 / 8)');
console.log('webgl ctx losses :', ctxLoss.length, '(any > 0 ⇒ blank world, §29, not this chunk)');
console.log('console errors   :', consoleErrors.length);
for (const e of consoleErrors.slice(0, 5)) console.log('   ·', e);
console.log('screenshot       : /tmp/mobsep-' + label + '.png');
await browser.close();
process.exitCode = consoleErrors.length === 0 ? 0 : 1;
