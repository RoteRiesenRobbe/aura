#!/usr/bin/env node
// plan-passages.md verification at the real game surface, one leg block per
// chunk. Every venue is DERIVED from the zone files, so a re-placement moves
// the legs rather than rotting them.
//
// P1: a door authored in `exits` (not `spawns`) still talks and still moves
// you: each row lands beside its anchor.
//
// P2: the door mob is a Passage, so it draws NOTHING of its own (R3): no
// visible Graphics under its shape (the health bar and the tier frame are
// Graphics) and no text on its plate. Read from 4 u away, outside the 2 u
// reach, so the E badge is not up. The picture is the exit's look in the
// `exitLooks` layer, the one its zone file names, and a `hidden` exit
// (P3b's toggle) draws nothing.
//
// P3: the WORDS (D6). The panel's header is the exit's own title, else the
// place its anchor stands in (the region with an id, else the zone's name);
// its line and row are the exit's own (exit.<id>.*), else (no conversation of
// its own) the destination's line (anchor.<name>.text), else its LOOK's words
// (exit-look.<look>.*, P3b/D12). Three venues: the barn door (destination
// line), the barn stairs (their own words), and a world exit with neither (the
// look's words). Every expectation is DERIVED from the zone files and
// api/lang/en/regions.arb, so new words move the legs.
//
// P4 + P5: a TOUCH exit, the first one the world places (the Fallow Reach
// test strip's, plan-passages.md P5). P5: it draws a gold glow and its look,
// and names where it leads only while the player is near (Q3). P4: the legs
// move the player with WARP, a step under PassageSystem's arrival jump (3 u)
// reads as a walk, a longer one as an arrival. Arriving inside = disarmed;
// stepping out and back in = the crossing: the curtain runs (D9) and the
// player lands beside the anchor, and does not bounce back.
//
// ⚑ GOD on throughout: nothing here is about combat, and a wolf on the way
// to the barn door would null the scene graph mid-leg.
//
// Usage: node passages.mjs [url] [outdir]
import { createRequire } from 'node:module';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');
import { joinAsNewCharacter } from './lib/join.mjs';
import { readZone } from './lib/zone.mjs';

const url = process.argv[2] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const outdir = process.argv[3] || '/tmp/passages-shots';
mkdirSync(outdir, { recursive: true });

// --- venues, derived from the zone files --------------------------------------
const root = new URL('../../../', import.meta.url);
const zoneDir = new URL('api/zones/', root).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const zones = Object.fromEntries(readdirSync(zoneDir).filter(f => f.endsWith('.json')).map(f =>
  [f.replace(/\.json$/, ''), readZone(zoneDir + f)]));
const world = (z, p) => ({ x: p.x + (zones[z].origin?.x || 0), y: p.y + (zones[z].origin?.y || 0) });
const anchorZone = (name) => {
  for (const z of Object.keys(zones)) {
    const a = (zones[z].anchors || []).find(x => x.name === name);
    if (a) { return { stem: z, a }; }
  }
  throw new Error(`no anchor ${name}`);
};
const anchorAt = (name) => { const { stem, a } = anchorZone(name); return world(stem, a); };

// P3: the words the panel must show, by D6's tiers.
const en = JSON.parse(readFileSync(new URL('api/lang/en/regions.arb', root), 'utf8'));
const inside = (p, poly) => {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    if ((poly[i].y > p.y) !== (poly[j].y > p.y)
        && p.x < (poly[j].x - poly[i].x) * (p.y - poly[i].y) / (poly[j].y - poly[i].y) + poly[i].x) { hit = !hit; }
  }
  return hit;
};
const wordsOf = (exit) => {
  const { stem, a } = anchorZone(exit.anchor);
  const place = (zones[stem].regions || []).filter(r => r.id && inside(a, r.points)).pop();
  const own = (k) => (exit.id ? en[`exit.${exit.id}.${k}`] : undefined);
  const look = (k) => (exit.conversation ? undefined : en[`exit-look.${exit.look || 'cave-mouth'}.${k}`]);
  return {
    header: own('title') || (place ? en[`region.${place.id}.title`] : en[`zone.${stem}.name`]),
    line: own('text') || (exit.conversation ? undefined : en[`anchor.${exit.anchor}.text`]) || look('text'),
    row: own('go') || look('go'),
  };
};
const barnDoor = zones.world.exits.find(e => e.anchor === 'barn-inside');
const barnUp = zones.barn.exits[0];
const plainExit = zones.world.exits.find(e => !e.id && !e.hidden && !e.conversation && !en[`anchor.${e.anchor}.text`]);
const hidden = zones.world.exits.find(e => e.hidden);
if (!barnDoor || !barnUp || !barnUp.id || !plainExit) {
  throw new Error('venue drifted: expected the barn door, the barn stairs with an id, and a world exit with no words');
}
const CASES = [
  { leg: 'barn door (world → barn)', at: world('world', barnDoor), dest: anchorAt(barnDoor.anchor),
    look: barnDoor.look || 'cave-mouth', words: wordsOf(barnDoor) },
  { leg: 'barn stairs (barn → world)', at: world('barn', barnUp), dest: anchorAt(barnUp.anchor),
    look: barnUp.look || 'cave-mouth', words: wordsOf(barnUp) },
  { leg: `look words (world → ${plainExit.anchor})`, at: world('world', plainExit), dest: anchorAt(plainExit.anchor),
    look: plainExit.look || 'cave-mouth', words: wordsOf(plainExit) },
];

const results = [];
const pass = (leg, note) => { results.push(['PASS', leg]); console.log(`  ✔ ${leg} - ${note}`); };
const fail = (leg, note) => { results.push(['FAIL', leg]); console.log(`  ✘ ${leg} - ${note}`); };

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 800 } });
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
const warp = async (p) => {
  await cmd(`WARP ${Math.round(p.x * 120)} ${Math.round(p.y * 120)}`);
  await page.waitForTimeout(2500);
};
const pos = () => page.evaluate(() => ({ x: window.game.character.getX() / 120, y: window.game.character.getY() / 120 }));
const panel = () => page.evaluate(() => {
  const el = document.getElementById('conversation');
  if (!el || el.classList.contains('hidden')) return null;
  const li = [...el.querySelectorAll('.conversationRows li')].filter(x => !x.classList.contains('conversationLeaveRow'));
  return { actor: el.querySelector('.conversationActor')?.textContent?.trim() ?? '',
    lines: el.querySelector('.conversationLines')?.textContent?.trim() ?? '',
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

// One sample of everything P2 asserts about the door at `at` (world units),
// read in one evaluate: the npcs-layer entity standing there, its visible
// Graphics, its plate's text, and the exit looks drawn within 0.5 u.
const doorSample = (at) => page.evaluate(({ x, y }) => {
  let r = window.game.character.plate.parent;
  while (r.parent) r = r.parent;
  const byLabel = (c, name) => {
    if (c.label === name) return c;
    for (const k of c.children || []) { const f = byLabel(k, name); if (f) return f; }
    return null;
  };
  const near = (o) => Math.hypot(o.position.x / 120 - x, o.position.y / 120 - y) < 0.5;
  const npcs = byLabel(r, 'npcs');
  const door = (npcs?.children || []).find(near);
  const visibleGraphics = (c) => (c.visible === false ? 0 : (c.context ? 1 : 0)
    + (c.children || []).reduce((n, k) => n + visibleGraphics(k), 0));
  const texts = (c) => (c.text !== undefined ? [c.text] : []).concat(...(c.children || []).map(texts));
  const plates = byLabel(r, 'namePlates');
  const plate = (plates?.children || []).find(near);
  const looks = (byLabel(r, 'exitLooks')?.children || []).filter(near).map(s => s.label);
  // The control: some OTHER mob in view does draw Graphics (its health bar),
  // or a zero above proves nothing.
  const others = ['npcs', 'turnip', 'wildlife'].flatMap(l => byLabel(r, l)?.children || []).filter(o => o !== door);
  const control = Math.max(0, ...others.map(visibleGraphics));
  return {
    found: !!door,
    graphics: door ? visibleGraphics(door) : null,
    plateText: plate ? texts(plate).filter(t => t !== '') : null,
    looks,
    control,
  };
}, at);

console.log('passages');
await page.goto(url);
await joinAsNewCharacter(page, 'passages');
await cmd('GOD on');

const actors = [];
for (const c of CASES) {
  // P2: from 4 u off, outside the door's reach, so no E badge is drawn.
  await warp({ x: c.at.x + 4, y: c.at.y });
  const s = await doorSample(c.at);
  if (!s.found) {
    fail(`${c.leg}: bare`, 'no entity on the npcs layer at the exit');
  } else if (!(s.control > 0)) {
    fail(`${c.leg}: bare`, 'no other mob in view draws Graphics, so a zero proves nothing');
  } else if (s.graphics === 0 && (s.plateText === null || s.plateText.length === 0)) {
    pass(`${c.leg}: bare`, 'the door draws no bar, no frame and no plate text');
  } else {
    fail(`${c.leg}: bare`, `${s.graphics} visible Graphics, plate text ${JSON.stringify(s.plateText)}`);
  }
  if (s.looks.length === 1 && s.looks[0] === `exitLook:${c.look}`) {
    pass(`${c.leg}: look`, `draws ${s.looks[0]}`);
  } else {
    fail(`${c.leg}: look`, `expected exitLook:${c.look}, got ${JSON.stringify(s.looks)}`);
  }
  await page.screenshot({ path: join(outdir, `${c.leg.split(' ')[0]}-look.png`) });

  // P1: one unit beside the door, inside its 2 u reach, clear of its body.
  await warp({ x: c.at.x + 1, y: c.at.y });
  await pressInteract();
  const p = await panel();
  if (!p || !p.actor || !p.rows.some(r => !r.locked)) {
    fail(c.leg, `no conversation with a takeable row opened (${JSON.stringify(p)})`);
    await page.screenshot({ path: join(outdir, `${c.leg.split(' ')[0]}-nopanel.png`) });
    continue;
  }
  actors.push(p.actor);
  // P3: the words, each column on its own so a miss names which tier broke.
  const w = c.words;
  if (p.actor === w.header) {
    pass(`${c.leg}: header`, `"${p.actor}"`);
  } else {
    fail(`${c.leg}: header`, `expected "${w.header}", got "${p.actor}"`);
  }
  if (w.line === undefined) {
    pass(`${c.leg}: line`, `a conversation of its own: "${p.lines}"`);
  } else if (p.lines.includes(w.line)) {
    pass(`${c.leg}: line`, `"${w.line}"`);
  } else {
    fail(`${c.leg}: line`, `expected "${w.line}", got "${p.lines}"`);
  }
  if (w.row !== undefined) {
    if (p.rows.some(r => r.text.includes(w.row))) {
      pass(`${c.leg}: row`, `"${w.row}"`);
    } else {
      fail(`${c.leg}: row`, `expected "${w.row}", got ${JSON.stringify(p.rows.map(r => r.text))}`);
    }
  }
  await page.screenshot({ path: join(outdir, `${c.leg.split(' ')[0]}-panel.png`) });
  if (!(await clickFirstRow())) { fail(c.leg, 'could not click the row'); continue; }
  await page.waitForTimeout(3500);
  const at = await pos();
  const d = Math.hypot(at.x - c.dest.x, at.y - c.dest.y);
  if (d <= 2) {
    pass(c.leg, `"${p.actor}" → landed ${d.toFixed(2)} u from its anchor`);
  } else {
    fail(c.leg, `"${p.actor}" → at (${at.x.toFixed(1)}, ${at.y.toFixed(1)}), ${d.toFixed(1)} u from its anchor`);
  }
}

// P1's "the door field is honoured" is gone: since P3 the header names the
// exit or the place (D6), and since P3b every ordinary exit talks through one
// shared conversation, worded by its look (D12).

// P2: a hidden exit draws no look, and its door is still there to talk to.
if (hidden) {
  const at = world('world', hidden);
  await warp({ x: at.x + 4, y: at.y });
  const s = await doorSample(at);
  if (s.found && s.looks.length === 0) {
    pass('hidden look', `the exit to ${hidden.anchor} draws nothing, its door stands`);
  } else {
    fail('hidden look', `door found ${s.found}, looks ${JSON.stringify(s.looks)}`);
  }
} else {
  fail('hidden look', 'no world exit is hidden; the venue drifted');
}

// P4 + P5: the world's first touch exit.
const touch = zones.world.exitAreas?.find(a => !a.hidden);
if (!touch) {
  fail('touch', 'no world touch exit; the venue drifted');
} else {
  const xs = touch.points.map(p => p.x);
  const ys = touch.points.map(p => p.y);
  const mid = world('world', { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 });
  const left = world('world', { x: Math.min(...xs), y: mid.y });
  const key = touch.id || `@${touch.anchor}`;
  const sample = () => page.evaluate((key) => {
    let r = window.game.character.plate.parent;
    while (r.parent) r = r.parent;
    const all = [];
    const walk = (c) => { all.push(c); (c.children || []).forEach(walk); };
    walk(r);
    const name = all.find(c => c.label === `exitName:${key}`);
    return {
      glow: all.some(c => c.label === `exitGlow:${key}`),
      look: all.filter(c => c.label && c.label.startsWith('exitLook:') && c.parent?.label === 'exitAreas').map(c => c.label),
      name: name ? { visible: name.visible, text: name.text } : null,
    };
  }, key);

  // P5: near, the glow, the look and the destination's name (the header rule).
  await warp({ x: left.x - 2, y: left.y });
  let s5 = await sample();
  const wantLook = `exitLook:${touch.look || 'cave-mouth'}`;
  if (s5.glow && s5.look.includes(wantLook)) {
    pass('touch: glow + look', `gold glow and ${wantLook}`);
  } else {
    fail('touch: glow + look', `glow ${s5.glow}, looks ${JSON.stringify(s5.look)}`);
  }
  const wantName = wordsOf(touch).header;
  if (s5.name?.visible && s5.name.text === wantName) {
    pass('touch: name near', `"${s5.name.text}" floats over it`);
  } else {
    fail('touch: name near', `expected "${wantName}" visible, got ${JSON.stringify(s5.name)}`);
  }
  await page.screenshot({ path: join(outdir, 'touch-near.png') });
  await warp({ x: left.x - 9, y: left.y });
  s5 = await sample();
  if (s5.name && !s5.name.visible) {
    pass('touch: name far', 'hidden 9 u off');
  } else {
    fail('touch: name far', JSON.stringify(s5.name));
  }

  // P4: from far into the middle is an ARRIVAL: nobody moves.
  await warp(mid);
  let at = await pos();
  if (Math.hypot(at.x - mid.x, at.y - mid.y) < 1) {
    pass('touch: arriving inside', 'disarmed, nobody moved');
  } else {
    fail('touch: arriving inside', `moved to (${at.x.toFixed(1)}, ${at.y.toFixed(1)}) though it arrived inside`);
  }
  // A step out and a step back in: both walks, so the crossing.
  await warp({ x: left.x - 1, y: left.y });
  await page.evaluate(() => { window.__curtainSeen = false; });
  await cmd(`WARP ${Math.round((left.x + 0.4) * 120)} ${Math.round(left.y * 120)}`);
  const curtain = await page.waitForFunction(() => {
    const el = document.getElementById('zoneCurtain');
    return el !== null && el.className.includes('running');
  }, null, { timeout: 3000, polling: 30 }).then(() => true, () => false);
  if (curtain) {
    pass('touch: curtain', 'the dwell started the curtain (D9)');
  } else {
    fail('touch: curtain', 'no curtain ran');
  }
  await page.waitForTimeout(3500);
  at = await pos();
  const dest = anchorAt(touch.anchor);
  const d = Math.hypot(at.x - dest.x, at.y - dest.y);
  if (d <= 2) {
    pass('touch: walking in', `moved to ${touch.anchor}, ${d.toFixed(2)} u from it`);
  } else {
    fail('touch: walking in', `at (${at.x.toFixed(1)}, ${at.y.toFixed(1)}), ${d.toFixed(1)} u from ${touch.anchor}`);
  }
  await page.waitForTimeout(2000);
  const still = await pos();
  if (Math.hypot(still.x - at.x, still.y - at.y) < 1) {
    pass('touch: no bounce', 'stays where it landed');
  } else {
    fail('touch: no bounce', `moved again to (${still.x.toFixed(1)}, ${still.y.toFixed(1)})`);
  }
}

if (consoleErrors.length) { fail('page errors', consoleErrors.slice(0, 3).join(' | ')); }

await browser.close();
const failed = results.filter(r => r[0] === 'FAIL').length;
console.log(failed ? `FAILED ${failed}/${results.length}` : `all ${results.length} green`);
process.exit(failed ? 1 : 0);
