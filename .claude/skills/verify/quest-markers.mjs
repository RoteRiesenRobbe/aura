#!/usr/bin/env node
// Quest-giver markers at the game surface (plan-quest-giver-markers.md C3).
//
// Boundary: this owns what the PLAYER SEES of the markers — the glyph over a
// giver's head, its colour, the map layer, and the level tint on the journal,
// the tracker and the dialogue offer row. Which marker a ledger state yields is
// Go's (sys/questmarkers_test.go, exhaustively); the colour rule is vitest's
// (QuestMarkers.test.ts). The quest CONTENT belongs to chunkC4-quests.mjs and
// the kill-quest scripts. It never asserts how much quest content exists.
//
// The subject is the Hermit and village-welcome (L1, his only quest): it walks
// `!` → grey `?` → yellow `?` → nothing, through the QUEST cheat so no kill or
// conversation timing decides a leg, except the two talk_to objectives, which
// are what move the quest to its report stage.
//
// Legs:
//   1  at spawn (Flora's fire): a coloured `!` over Flora, and Flora's `!` on
//      the map; the Hermit (far away, in fog) has no map marker.
//   2  at the Hermit: a `!` over him in the L1 tint, his map marker appears
//      once the ground is uncovered, his offer row in the panel is tinted.
//   3  QUEST ACCEPT village-welcome: the Hermit shows a GREY `?`; the journal
//      and the tracker titles carry the L1 tint.
//   4  talk to Reinhard and the TownCrier (the objectives): the Hermit shows
//      the YELLOW `?`.
//   5  XP to level 15: the journal + tracker titles turn grey (trivial).
//   5c the full-screen map: hovering the Hermit's yellow `?` shows a black box
//      naming "Village Welcome" in the QUEST's tint (grey now), not the
//      marker's yellow; moving off hides it. Real mouse.move only.
//   6  QUEST ADVANCE village-welcome back known: no glyph over the Hermit.
//   7  a PHONE (a second, touch context with `&mobile`, a fresh character at
//      the spawn): a TAP on Flora's map marker opens the box centred ABOVE the
//      marker; a tap on open map hides it. Real touchscreen.tap only.
//
// ⚑ Restart aurad first and run this script ALONE (standing conversant rule).
// Usage: node .claude/skills/verify/quest-markers.mjs [label] [url]
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');
import { joinAsNewCharacter } from './lib/join.mjs';

const label = process.argv[2] || 'run';
const url = process.argv[3] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const shotDir = process.env.QM_SHOT_DIR || dirname(fileURLToPath(import.meta.url));
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

// Positions DERIVED from the zone file (zone-local = world for the primary zone).
const repo = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const world = JSON.parse(readFileSync(join(repo, 'api/zones/world.json'), 'utf8'));
const spawnOf = (mob) => {
  for (const s of [...(world.spawns || []), ...(world.areas || []).flatMap((a) => a.spawns || [])]) {
    if (s.mob === mob) return { x: s.x, y: s.y };
  }
  throw new Error(`no spawn for ${mob}`);
};
const HERMIT = spawnOf('Hermit');
const REINHARD = spawnOf('Reinhard');
const CRIER = spawnOf('TownCrier');
const FLORA = spawnOf('Flora');

// The difficulty tint of an at-level quest and the trivial grey
// (client-data/Mobs.ts DIFFICULTY_BANDS / DIFFICULTY_GRAY).
const YELLOW = 0xf5d442;
const GRAY = 0x9d9d9d;
const rgb = (c) => `rgb(${(c >> 16) & 255}, ${(c >> 8) & 255}, ${c & 255})`;

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

const results = [];
const check = (name, pass, detail) => results.push({ check: name, pass: !!pass, detail });

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await joinAsNewCharacter(page, 'qmarks');
await page.waitForFunction(() => !!window.game?.character?.plate?.parent, null, { timeout: 120_000 });
await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
await page.evaluate(() => {
  const p = document.getElementById('developPanel'); if (p) p.style.display = 'none';
  window.__auraRoot = window.game.character.plate.parent;
});

const cmd = async (text) => {
  await page.evaluate((t) => {
    document.getElementById('console_command').value = t;
    document.getElementById('console').dispatchEvent(new Event('submit', { cancelable: true }));
  }, text);
  await page.waitForTimeout(900);
};
await cmd('GOD');

const warpTo = async (p, dx = 0, dy = 0) => {
  await cmd(`WARP ${Math.round(p.x + dx) * 120} ${Math.round(p.y + dy) * 120}`);
  await page.waitForTimeout(2500);
};

// The display names the plates speak with, off the served catalog.
const names = await page.evaluate(async () => {
  const mobs = await (await fetch('/mobs')).json();
  const out = {};
  for (const m of mobs) out[m.name] = m.displayName;
  return out;
});

// One sample: the glyph over the plate whose name text is `display`.
const glyphOver = (display) => page.evaluate((d) => {
  const toNum = (f) => (typeof f === 'number' ? f : (typeof f === 'string' ? parseInt(f.replace('#', ''), 16) : (f?.color ?? null)));
  for (const plate of window.__auraRoot.children) {
    const texts = plate.children.filter((c) => typeof c.text === 'string');
    if (!texts.some((t) => t.text === d)) continue;
    const g = texts.find((t) => t.text === '!' || t.text === '?');
    if (!g) return { plate: true, glyph: null };
    return { plate: true, glyph: g.text, visible: g.visible, fill: toNum(g.style.fill), y: g.y };
  }
  return { plate: false };
}, display);

const waitGlyph = async (display, want, ms = 15_000) => {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) {
    last = await glyphOver(display);
    if (want(last)) return last;
    await page.waitForTimeout(700);
  }
  return last;
};

// The map layer: every glyph and its layer position, plus the map's scale.
const mapGlyphs = () => page.evaluate(() => {
  const mm = window.game.miniMap;
  const layer = mm?.questMarkers?.layer;
  if (!layer) return null;
  return {
    scale: mm.scale,
    glyphs: layer.children.map((c) => ({ text: c.text, x: c.position.x, y: c.position.y })),
  };
});
const mapHas = (m, at) => !!m && m.glyphs.some((g) =>
  Math.abs(g.x - at.x * 120 * m.scale) < 1 && Math.abs(g.y - at.y * 120 * m.scale) < 1);

const press = async (key) => {
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down(key);
  await page.waitForTimeout(1400);
  await page.keyboard.up(key);
  await page.waitForTimeout(900);
};
const panel = () => page.evaluate(() => {
  const el = document.getElementById('conversation');
  if (!el || el.classList.contains('hidden')) return null;
  return {
    actor: el.querySelector('.conversationActor')?.textContent?.trim() ?? '',
    rows: [...el.querySelectorAll('.conversationRows li')].map((li) => ({
      text: li.textContent.trim(),
      color: li.querySelector('span')?.style.color ?? '',
    })),
  };
});
const talkTo = async (display, tries = 4) => {
  for (let i = 0; i < tries; i++) {
    const open = await panel();
    if (open && open.actor === display) return open;
    if (open) await press('e');
    await press('e');
    const now = await panel();
    if (now && now.actor === display) return now;
    await page.waitForTimeout(1200);
  }
  return await panel();
};
const leave = async () => { if (await panel()) await press('e'); };
const clickRow = async (pred) => {
  const handle = await page.evaluateHandle((src) => {
    const f = new Function('t', `return (${src})(t)`);
    return [...document.querySelectorAll('#conversation .conversationRows li')].find((li) => f(li.textContent.trim())) ?? null;
  }, pred.toString());
  const el = handle.asElement();
  if (!el) return false;
  const b = await el.boundingBox();
  if (!b) return false;
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForTimeout(1200);
  return true;
};

const titleColors = () => page.evaluate(() => ({
  journal: [...document.querySelectorAll('#journal .journalQuest')].map((li) => ({ t: li.textContent, c: li.style.color })),
  tracker: [...document.querySelectorAll('.questTrackerTitle')].map((d) => ({ t: d.textContent, c: d.style.color })),
}));
const title = 'Village Welcome';

// --- 1: at spawn ---------------------------------------------------------------
await page.waitForTimeout(3000);
const eliza = await waitGlyph(names.Flora, (s) => s?.glyph === '!');
check('1a Flora (beside the spawn fire) shows a `!`', eliza?.glyph === '!' && eliza.visible, eliza);
let map = await mapGlyphs();
check('1b the map layer exists and marks Flora on revealed ground', mapHas(map, FLORA), map);
check('1c the Hermit (in fog) is NOT on the map yet', map && !mapHas(map, HERMIT), map);

// --- 2: at the Hermit ----------------------------------------------------------
await warpTo(HERMIT, 1, 0);
const hermit = await waitGlyph(names.Hermit, (s) => s?.glyph === '!');
check('2a the Hermit shows a `!` in the L1 (yellow) tint', hermit?.glyph === '!' && hermit.fill === YELLOW, hermit);
await page.waitForTimeout(2500);
map = await mapGlyphs();
check('2b the Hermit is on the map once his ground is uncovered', mapHas(map, HERMIT), map);
await page.screenshot({ path: join(shotDir, `qm-${label}-hermit-offer.png`) });

let conv = await talkTo(names.Hermit);
let tinted = conv?.rows.find((r) => r.color === rgb(YELLOW));
if (!tinted && conv) {
  // Two-row shape: the offer row is one node down, behind the root's brief row.
  for (const r of conv.rows) {
    if (/Leave/.test(r.text)) continue;
    if (await clickRow((t) => !/Leave|Back/.test(t))) {
      conv = await panel();
      tinted = conv?.rows.find((r2) => r2.color === rgb(YELLOW));
    }
    break;
  }
}
check('2c the Hermit\'s offer row is tinted by the quest level', !!tinted, conv);
await leave();

// --- 3: accepted ---------------------------------------------------------------
await cmd('QUEST ACCEPT village-welcome');
let s = await waitGlyph(names.Hermit, (g) => g?.glyph === '?');
check('3a accepted, objectives open: the Hermit shows a GREY `?`', s?.glyph === '?' && s.fill === GRAY, s);
await page.keyboard.press('KeyJ');
await page.waitForTimeout(800);
let colors = await titleColors();
check('3b the journal title carries the L1 tint', colors.journal.some((j) => j.t === title && j.c === rgb(YELLOW)), colors);
check('3c the tracker title carries the L1 tint', colors.tracker.some((j) => j.t === title && j.c === rgb(YELLOW)), colors);
await page.keyboard.press('KeyJ');

// --- 4: the objectives ---------------------------------------------------------
await warpTo(REINHARD, 1, 0);
const r1 = await talkTo(names.Reinhard); await leave();
await warpTo(CRIER, 1, 0);
const r2 = await talkTo(names.TownCrier); await leave();
await warpTo(HERMIT, 1, 0);
s = await waitGlyph(names.Hermit, (g) => g?.glyph === '?' && g.fill === YELLOW, 20_000);
check('4 both talks done: the Hermit shows the YELLOW `?`', s?.glyph === '?' && s.fill === YELLOW,
  { glyph: s, talkedReinhard: r1?.actor, talkedCrier: r2?.actor });
await page.screenshot({ path: join(shotDir, `qm-${label}-hermit-turnin.png`) });

// --- 5: a level-up recolours ---------------------------------------------------
await cmd('XP 20000');
await page.waitForTimeout(2500);
await page.keyboard.press('KeyJ');
await page.waitForTimeout(800);
colors = await titleColors();
check('5a at level 15 the journal title is trivial grey', colors.journal.some((j) => j.t === title && j.c === rgb(GRAY)), colors);
check('5b and so is the tracker title', colors.tracker.some((j) => j.t === title && j.c === rgb(GRAY)), colors);
await page.keyboard.press('KeyJ');

// --- 5c: the map hover ---------------------------------------------------------
await page.keyboard.press('KeyM');
await page.waitForTimeout(1500);
// The Hermit's glyph centre in client px: canvas + layer offset + glyph point,
// half a font size up (the glyph hangs above its point).
const hermitGlyph = await page.evaluate(([hx, hy]) => {
  const mm = window.game.miniMap;
  const layer = mm.questMarkers.layer;
  const box = mm.application.canvas.getBoundingClientRect();
  const g = layer.children.find((c) =>
    Math.abs(c.position.x - hx * 120 * mm.scale) < 1 && Math.abs(c.position.y - hy * 120 * mm.scale) < 1);
  if (!g) return null;
  return { x: box.left + layer.position.x + g.position.x, y: box.top + layer.position.y + g.position.y - g.style.fontSize / 2 };
}, [HERMIT.x, HERMIT.y]);
const hoverBox = () => page.evaluate(() => {
  const el = document.querySelector('#worldMap .worldMapQuestHover');
  if (!el) return null;
  return {
    hidden: el.classList.contains('hidden'),
    background: getComputedStyle(el).backgroundColor,
    lines: [...el.children].map((d) => ({ t: d.textContent, c: d.style.color })),
  };
});
let hover = null;
if (hermitGlyph) {
  await page.mouse.move(hermitGlyph.x - 40, hermitGlyph.y);
  await page.mouse.move(hermitGlyph.x, hermitGlyph.y, { steps: 4 });
  await page.waitForTimeout(800);
  hover = await hoverBox();
}
check('5c hovering the Hermit\'s map marker names the quest in a black box, in the quest\'s (grey) tint',
  !!hover && !hover.hidden && hover.background === 'rgb(0, 0, 0)' &&
  hover.lines.some((l) => l.t === title && l.c === rgb(GRAY)), { hermitGlyph, hover });
await page.screenshot({ path: join(shotDir, `qm-${label}-map-hover.png`) });
if (hermitGlyph) {
  await page.mouse.move(hermitGlyph.x + 150, hermitGlyph.y + 150, { steps: 4 });
  await page.waitForTimeout(800);
}
const off = await hoverBox();
check('5d moving off the marker hides the box', !!off && off.hidden, off);
await page.keyboard.press('KeyM');
await page.waitForTimeout(800);

// --- 6: turned in --------------------------------------------------------------
await cmd('QUEST ADVANCE village-welcome back known');
s = await waitGlyph(names.Hermit, (g) => g?.plate && (!g.glyph || g.visible === false));
check('6 turned in: no glyph over the Hermit', s?.plate && (!s.glyph || s.visible === false), s);

// --- 7: the phone ---------------------------------------------------------------
const phone = await (await browser.newContext({
  viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true,
})).newPage();
phone.on('pageerror', (e) => consoleErrors.push('phone pageerror: ' + e.message));
await phone.goto(url + '&mobile', { waitUntil: 'domcontentloaded', timeout: 120_000 });
await joinAsNewCharacter(phone, 'qmphone');
await phone.waitForFunction(() => !!window.game?.character?.plate?.parent, null, { timeout: 120_000 });
await phone.evaluate(() => { const p = document.getElementById('developPanel'); if (p) p.style.display = 'none'; });
await phone.waitForTimeout(3000);
await phone.keyboard.press('KeyM');
await phone.waitForTimeout(1500);
const elizaGlyph = await phone.evaluate(([ex, ey]) => {
  const mm = window.game.miniMap;
  if (!mm?.isOpen()) return { open: false };
  const layer = mm.questMarkers.layer;
  const box = mm.application.canvas.getBoundingClientRect();
  const g = layer.children.find((c) =>
    Math.abs(c.position.x - ex * 120 * mm.scale) < 1 && Math.abs(c.position.y - ey * 120 * mm.scale) < 1);
  if (!g) return { open: true, glyph: false };
  return { open: true, x: box.left + layer.position.x + g.position.x, y: box.top + layer.position.y + g.position.y - g.style.fontSize / 2 };
}, [FLORA.x, FLORA.y]);
const phoneBox = () => phone.evaluate(() => {
  const el = document.querySelector('#worldMap .worldMapQuestHover');
  const r = el.getBoundingClientRect();
  return { hidden: el.classList.contains('hidden'), lines: [...el.children].map((d) => d.textContent),
    left: r.left, right: r.right, top: r.top, bottom: r.bottom };
});
let tapBox = null;
if (elizaGlyph?.x !== undefined) {
  await phone.touchscreen.tap(elizaGlyph.x, elizaGlyph.y);
  await phone.waitForTimeout(800);
  tapBox = await phoneBox();
}
const centred = tapBox && Math.abs((tapBox.left + tapBox.right) / 2 - elizaGlyph.x) < 2;
check('7a phone: a tap on Flora\'s map marker opens the box ABOVE it, centred',
  !!tapBox && !tapBox.hidden && tapBox.lines.length > 0 && tapBox.bottom <= elizaGlyph.y && centred,
  { elizaGlyph, tapBox });
await phone.screenshot({ path: join(shotDir, `qm-${label}-phone-tap.png`) });
if (elizaGlyph?.x !== undefined) {
  await phone.touchscreen.tap(elizaGlyph.x + 120, elizaGlyph.y + 80);
  await phone.waitForTimeout(800);
}
const tapOff = await phoneBox();
check('7b phone: a tap on open map hides it', tapOff.hidden, tapOff);

const errors = consoleErrors.filter((e) => !/401|favicon/.test(e));
check('no console errors', errors.length === 0, errors.slice(0, 5));

await browser.close();
let failed = 0;
for (const r of results) {
  const tag = r.pass ? 'PASS' : 'FAIL';
  if (!r.pass) failed++;
  console.log(`${tag}  ${r.check}${r.pass ? '' : '  ' + JSON.stringify(r.detail)}`);
}
console.log(`\n${label}: ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
