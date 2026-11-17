#!/usr/bin/env node
// Dialogue quest icons (plan-dialogue-quest-icons.md QI1) at the game surface:
// the conversation rows wear the map's `!` / yellow `?` / grey `?` in a gutter
// left of the text, the text itself is untinted, and every row's text starts
// at one x (R4). Which row gets which marker is pinned in Go
// (sys/questrowmarkers_test.go); this script owns what only pixels and the DOM
// show: the glyph is drawn, coloured, and the text column stays aligned.
//
// Venue: Reinhard, who both offers and hands in giant-rats-in-the-barn. His
// position is DERIVED from api/zones/world.json. The quest states are set with
// the QUEST cheat (ACCEPT, ADVANCE), never by hunting rats.
//
// Usage: node qi1-quest-icons.mjs [url] [outdir] [phone]
// `phone` runs leg 1 (glyph, colour, the aligned text column) on a landscape
// phone viewport (844x390, touch), where the mobile HUD styles the panel. It
// stops there: the later legs reopen the panel with keyboard Escape/E, which a
// touch context does not drive (the reopen came back empty on 2026-11-17).
import { createRequire } from 'node:module';
import { mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');
import { joinAsNewCharacter } from './lib/join.mjs';
import { readZone } from './lib/zone.mjs';

const url = process.argv[2] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const outdir = process.argv[3] || '/tmp/qi1-quest-icons-shots';
const phone = process.argv[4] === 'phone';
mkdirSync(outdir, { recursive: true });

const root = new URL('../../../', import.meta.url);
const zoneDir = new URL('api/zones/', root).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const zones = Object.fromEntries(readdirSync(zoneDir).filter(f => f.endsWith('.json')).map(f =>
  [f.replace(/\.json$/, ''), readZone(zoneDir + f)]));
const spawnOf = (mob) => {
  for (const z of Object.values(zones)) {
    const s = [z, ...(z.areas || [])].flatMap(a => a.spawns || []).find(x => x.mob === mob);
    if (s) return { x: s.x + (z.origin?.x || 0), y: s.y + (z.origin?.y || 0) };
  }
  throw new Error(`no spawn of ${mob}`);
};

const QUEST = 'giant-rats-in-the-barn';
const OFFER = 'The pest in the granary';
const PROGRESS = 'About the rats in the granary...';
const ACCEPT = "I'll do it.";
const ON_IT = 'Any assistance for the task?';
const TURN_IN = "I've killed the rats."; // hidden while hunting
const TEACH = 'Teach me something.';
const FLORA = "Flora sends me. I'm looking for work.";
// The wire colours (QuestMarkers.ts QUEST_TURN_IN_COLOR, Mobs.ts DIFFICULTY_GRAY).
const YELLOW = 'rgb(245, 212, 66)';
const GREY = 'rgb(157, 157, 157)';

const results = [];
const pass = (leg, note) => { results.push('PASS'); console.log(`  ✔ ${leg} - ${note}`); };
const fail = (leg, note) => { results.push('FAIL'); console.log(`  ✘ ${leg} - ${note}`); };
const check = (leg, ok, note) => (ok ? pass : fail)(leg, note);

const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };
const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const context = await browser.newContext(phone
  ? { locale: 'en-US', viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
  : { locale: 'en-US', viewport: { width: 1280, height: 800 } });
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
// One atomic read of the open panel: per row its label, glyph, glyph colour,
// the label's inline colour and the label's left edge.
const panel = () => page.evaluate(() => {
  const el = document.getElementById('conversation');
  if (!el || el.classList.contains('hidden')) return null;
  return {
    actor: el.querySelector('.conversationActor')?.textContent?.trim() ?? '',
    rows: [...el.querySelectorAll('.conversationRows > li')].map((li) => {
      // The glyph is the row's ::before (data-quest-glyph), never a child node.
      const before = getComputedStyle(li, '::before');
      const marked = li.dataset.questGlyph !== undefined;
      const span = li.querySelector('span:not(.conversationWall)');
      const label = span ?? li;
      // A row with no label span (the Leave row) is measured by its text node.
      const range = document.createRange();
      range.selectNodeContents(label);
      return {
        text: label.textContent.trim(),
        rowText: li.textContent.trim(),
        glyph: marked ? before.content.replace(/^"|"$/g, '') : '',
        glyphColor: marked ? before.color : '',
        glyphRight: marked ? li.getBoundingClientRect().left + parseFloat(before.left) + parseFloat(before.width) : null,
        labelInline: label.style?.color ?? '',
        labelLeft: range.getBoundingClientRect().left,
      };
    }),
  };
});
const pressInteract = async () => {
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down('e');
  await page.waitForTimeout(1400);
  await page.keyboard.up('e');
  await page.waitForTimeout(1400);
};
const closePanel = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(600); };
const clickRow = async (text) => {
  const node = (await page.evaluateHandle((t) => [...document.querySelectorAll('#conversation .conversationRows > li')]
    .find(li => li.textContent.includes(t)) ?? null, text)).asElement();
  if (!node) return false;
  const b = await node.boundingBox();
  if (!b) return false;
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForTimeout(900);
  return true;
};
const row = (p, text) => p?.rows.find(r => r.text === text);
const open = async () => {
  await closePanel();
  await pressInteract();
  const p = await panel();
  if (!p || p.actor !== 'Reinhard') {
    console.log('  panel:', JSON.stringify(p));
    throw new Error(`the panel is not Reinhard's (actor ${p?.actor ?? 'none'}): the venue answered the wrong NPC`);
  }
  return p;
};
const shot = (name) => page.screenshot({ path: join(outdir, `${name}.png`) });

console.log('qi1-quest-icons');
await page.goto(url);
await joinAsNewCharacter(page, 'questicons');
await page.evaluate(() => { const d = document.getElementById('developPanel'); if (d) d.style.display = 'none'; });
await cmd('GOD on');
const at = spawnOf('Reinhard');
await warp({ x: at.x + 1, y: at.y });
await settle();

// Leg 1: offered. The leading row and the Accept wear a tinted `!`; the label
// is untinted; a plain row has no glyph and its text starts at the same x.
let p = await open();
await shot('1-offer-root');
let r = row(p, OFFER), plain = row(p, TEACH);
if (!r || !plain) console.log('  rows:', JSON.stringify(p.rows));
check('1a offer root row', r?.glyph === '!' && r.glyphColor !== '' && r.labelInline === '' && r.rowText === OFFER,
  `glyph ${JSON.stringify(r?.glyph)} colour ${r?.glyphColor} label inline ${JSON.stringify(r?.labelInline)} row text ${JSON.stringify(r?.rowText)}`);
check('1b plain row', plain && plain.glyph === '', `teach row glyph ${JSON.stringify(plain?.glyph)}`);
check('1c text column aligned (R4)', r && plain && Math.abs(r.labelLeft - plain.labelLeft) < 0.5,
  `quest label x ${r?.labelLeft} vs plain ${plain?.labelLeft}`);
check('1d glyph sits left of the text', r && r.glyphRight !== null && r.glyphRight <= r.labelLeft + 0.5,
  `glyph right ${r?.glyphRight} vs label left ${r?.labelLeft}`);
const leave = p.rows[p.rows.length - 1];
check('1e Leave row aligned', Math.abs(leave.labelLeft - plain.labelLeft) < 0.5 && leave.glyph === '',
  `Leave x ${leave.labelLeft}`);
await clickRow(OFFER);
p = await panel();
const accept = row(p, ACCEPT);
await shot('1-offer-accept');
check('1f Accept row', accept?.glyph === '!' && accept.glyphColor === r?.glyphColor,
  `glyph ${JSON.stringify(accept?.glyph)} colour ${accept?.glyphColor} (root ${r?.glyphColor})`);

if (phone) {
  check('console', consoleErrors.length === 0, consoleErrors.length ? consoleErrors.join(' | ') : '0 page errors');
  const ok = results.filter(x => x === 'PASS').length;
  console.log(`\nqi1-quest-icons (phone, leg 1): ${ok}/${results.length} PASS · shots in ${outdir}`);
  await browser.close();
  process.exit(ok === results.length ? 0 : 1);
}

// Leg 2: running, not walkable. The progress row is grey `?`; inside, "on it" is plain.
await cmd(`QUEST ACCEPT ${QUEST}`);
p = await open();
r = row(p, PROGRESS);
await shot('2-running-root');
check('2a progress row grey ?', r?.glyph === '?' && r.glyphColor === GREY, `glyph ${JSON.stringify(r?.glyph)} colour ${r?.glyphColor}`);
check('2b offer row gone', !row(p, OFFER), 'the taken offer leaves the root');
await clickRow(PROGRESS);
p = await panel();
await shot('2-running-progress');
const onIt = row(p, ON_IT);
check('2c on-it row plain', onIt && onIt.glyph === '', `glyph ${JSON.stringify(onIt?.glyph)}`);
check('2d no hand-in yet', !row(p, TURN_IN), 'the hand-in row is hidden while hunting');

// Leg 3: a walkable hand-in wears the yellow `?`. The rats' report stage sits
// behind eight real kills (an objective stage the cheat refuses), so this leg
// takes eliza-sends-me instead: its `road` stage is reaching Reinhard's farm,
// where the player already stands, so it moves on to `meet`, which Reinhard's
// own root row hands in. (Yellow on a LEADING row is pinned in Go.)
await cmd('QUEST ACCEPT eliza-sends-me');
p = await open();
const flora = row(p, FLORA);
await shot('3-turnin-root');
if (!flora) console.log('  rows:', JSON.stringify(p.rows));
check('3a hand-in row yellow ?', flora?.glyph === '?' && flora.glyphColor === YELLOW,
  `glyph ${JSON.stringify(flora?.glyph)} colour ${flora?.glyphColor}`);
check('3b grey row stays grey', row(p, PROGRESS)?.glyphColor === GREY, 'the rats are still hunted');

check('console', consoleErrors.length === 0, consoleErrors.length ? consoleErrors.join(' | ') : '0 page errors');
const passed = results.filter(x => x === 'PASS').length;
console.log(`\nqi1-quest-icons: ${passed}/${results.length} PASS · shots in ${outdir}`);
await browser.close();
process.exit(passed === results.length ? 0 : 1);
