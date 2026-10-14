#!/usr/bin/env node
// Grandfather Knot, `clear-the-grove` and `the-sleeping-roots` at the game surface
// (docs/plan-grandfather-knot.md C2).
//
// Boundary: this script owns the tree's quest END TO END — the offer, six real
// deadwood harvested with a real Harvest aura, the three root legs walked one at
// a time with a return to the tree between each (the "Which root was it again?"
// row naming exactly the current leg), and the turn-in teaching EntanglingRoots.
// Plus one screenshot of the tree for the art pass (twice an NPC's size, bark
// ring). It never asserts the skill's numbers or that the root holds a mob —
// those are Go pins (model/mob/root_test.go, quests/content_test.go).
//
// ⚑ Restart aurad first and run this script ALONE (standing conversant rule).
//
// Usage: node .claude/skills/verify/gk-grandfather-knot.mjs [label] [url]
import { createRequire } from 'node:module';
import { join } from 'node:path';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');
import { joinAsNewCharacter } from './lib/join.mjs';
import { showSkillRowAt } from './lib/spellbook.mjs';
import { readZone } from './lib/zone.mjs';

const label = process.argv[2] || 'run';
const url = process.argv[3] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

// Positions come from the zone file, never from this script (tests derive,
// never hardcode): a Tiled move of the tree or a root must not redden it.
const zone = readZone(new URL('../../../api/zones/world.json', import.meta.url));
const spawnsOf = (mob) => zone.spawns.filter((s) => s.mob === mob);
const one = (mob) => {
  const [s] = spawnsOf(mob);
  if (!s) throw new Error(`${mob} is not placed in world.json`);
  return s;
};
const TREE = one('GrandfatherKnot');
const ROOTS = [
  { mob: 'StreamRoot', actor: 'Stream Root', row: 'The root by the stream is awake.' },
  { mob: 'StoneRoot', actor: 'Stone Root', row: 'The root by the stones is awake.' },
  { mob: 'GladeRoot', actor: 'Glade Root', row: 'The last root is awake.' },
];
const DEADWOOD = spawnsOf('Deadwood');

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const page = await (await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 800 } })).newPage();

const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

const results = [];
const check = (name, pass, detail) => results.push({ check: name, pass, detail });

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await joinAsNewCharacter(page, 'oldroots');
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
  // Only the panel body scrolls (40vh): the brief is long enough at 1280x800
  // that its accept row starts below the fold.
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const b = await el.boundingBox();
  if (!b) return false;
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForTimeout(1200);
  return true;
};
const journal = () => page.evaluate(() => {
  const p = document.getElementById('journal');
  if (!p) return null;
  const section = (cls) => [...p.querySelectorAll(`${cls} .journalQuest`)].map((q) => q.textContent);
  const body = p.querySelector('.journalDetailBody');
  return {
    running: section('.journalRunning'),
    completed: section('.journalCompleted'),
    title: p.querySelector('.journalDetailTitle')?.textContent ?? '',
    objectives: [...(body?.querySelectorAll('.journalObjective') ?? [])].map((e) => e.textContent),
  };
});
const selectQuest = async (title) => {
  const handle = await page.evaluateHandle((t) =>
    [...document.querySelectorAll('#journal .journalQuest')].find((li) => li.textContent === t) ?? null, title);
  const el = handle.asElement();
  if (!el) return;
  const box = await el.boundingBox();
  if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(500);
};
// A conversation closes the journal (one panel at a time), so every read
// re-opens it first.
const ensureJournal = async () => {
  if (await panel()) return;
  if (await page.evaluate(() => document.getElementById('journal')?.classList.contains('hidden') ?? true)) {
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press('KeyJ');
    await page.waitForTimeout(800);
  }
};
let questTitle = 'Clear the Grove'; // the quest whose journal lines objectives() reads
const objectives = async () => {
  await ensureJournal();
  await selectQuest(questTitle);
  const j = await journal();
  return j?.title === questTitle ? j.objectives : [];
};
const waitFor = async (predicate, timeout = 15_000) => {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await predicate()) return true;
    await page.waitForTimeout(500);
  }
  return false;
};
const spellbook = () => page.evaluate(() =>
  [...document.querySelectorAll('#spellbookList li')].map((li) => li.textContent.trim()));

// chunkC4-quests' equip-and-switch-on, unchanged.
const equipAndActivateAura = async (skillRe) => {
  const rowAppeared = await page.waitForFunction(
    (re) => [...document.querySelectorAll('#spellbookList li')].some((li) => new RegExp(re, 'i').test(li.textContent)),
    skillRe.source, { timeout: 20_000 }).catch(() => null);
  if (!rowAppeared) return { ok: false, why: `no spellbook row matches ${skillRe}` };
  const rowIndex = await page.evaluate((re) =>
    [...document.querySelectorAll('#spellbookList li')].findIndex((li) => new RegExp(re, 'i').test(li.textContent)),
  skillRe.source);
  await showSkillRowAt(page, rowIndex);
  const rows = await page.$$('#spellbookList li');
  const box = await rows[rowIndex].boundingBox();
  await page.mouse.click(box.x + 25, box.y + box.height / 2);
  await page.waitForTimeout(700);
  const slot = await page.$('#auraSlotList li');
  const sbox = await slot.boundingBox();
  await page.mouse.click(sbox.x + sbox.width / 2, sbox.y + sbox.height / 2);
  const equipped = await page.waitForFunction(
    (re) => new RegExp(re, 'i').test(document.querySelector('#auraSlotList')?.textContent || ''),
    skillRe.source, { timeout: 20_000 }).catch(() => null);
  if (!equipped) return { ok: false, why: 'slot never showed the skill' };
  for (let i = 0; i < 5; i++) {
    await page.mouse.click(sbox.x + sbox.width / 2, sbox.y + sbox.height / 2);
    await page.waitForTimeout(1200);
    if (await page.evaluate(() => !!document.querySelector('#auraSlotList .auraSlot.activeSlot'))) {
      return { ok: true, why: `activeSlot lit (attempt ${i + 1})` };
    }
  }
  return { ok: false, why: 'slot never lit as active' };
};

await page.keyboard.press('KeyJ'); // journal open for the whole run
await cmd('GOD');
// The heaps carry the Glimmerwood's spawn level (12); a level-1 character's
// Harvest barely dents them, so play at the zone's band like a real visitor.
await cmd('XP 20000');

// --- leg A: the first quest, Clear the Grove ----------------------------------
await warpTo(TREE, 1.6, 0);
await page.waitForTimeout(2500);
await page.screenshot({ path: `.claude/skills/verify/gk-tree-${label}.png` });
const greet = await talkTo('Grandfather Knot');
check('A1 the panel names him "Grandfather Knot" and he greets in his voice',
  greet?.actor === 'Grandfather Knot' && /little walker/i.test(greet?.lines ?? ''), JSON.stringify(greet));
check('A2 only the first task is offered: no step, root or second-quest row',
  greet?.rows.includes('Do you have a task for me?')
    && !(greet?.rows ?? []).some((r) => /awake|grove is clear|Which root|About the deadwood|another task/.test(r)),
  JSON.stringify(greet?.rows));
await clickRow('Do you have a task for me?');
const brief = await panel();
check('A3 the grove brief is simple: deadwood, no story yet',
  /deadwood/i.test(brief?.lines ?? '') && !/angry|asleep/.test(brief?.lines ?? '') && brief?.rows.includes("I'll do it."),
  JSON.stringify(brief));
await clickRow("I'll do it.");
await leave();
check('A4 accepting starts "Clear the Grove" with the deadwood tracker',
  await waitFor(async () => (await objectives()).some((o) => /^0\/6 deadwood cleared$/.test(o))),
  JSON.stringify(await objectives()));
const midTidy = await talkTo('Grandfather Knot');
check('A5 while clearing: "About the deadwood." replaces the task row',
  midTidy?.rows.includes('About the deadwood.') && !midTidy?.rows.includes('Do you have a task for me?'), JSON.stringify(midTidy?.rows));
await clickRow('About the deadwood.');
check('A6 …and it answers with the reminder', /Six heaps/.test((await panel())?.lines ?? ''), JSON.stringify(await panel()));
await leave();

await cmd('SKILL Harvest');
const armed = await equipAndActivateAura(/Harvest/);
check('A7 Harvest equipped and switched ON', armed.ok, armed.why);
let cleared = false;
for (let round = 0; round < 3 && !cleared; round++) {
  for (const d of DEADWOOD) {
    await warpTo(d, 0.4, 0);
    // Stand until this heap pops (the tracker count moves) or 10 s pass: the
    // heaps carry a spawn level, and a higher one takes several Harvest ticks.
    const before = (await objectives()).join();
    await waitFor(async () => (await objectives()).join() !== before, 10_000);
    if ((await objectives()).some((o) => o === 'Return to Grandfather Knot')) { cleared = true; break; }
  }
}
check('A8 six harvested deadwood move the quest to "Return to Grandfather Knot"', cleared, JSON.stringify(await objectives()));

await warpTo(TREE, 1.6, 0);
await talkTo('Grandfather Knot');
check('A9 the grove turn-in is offered and completes the quest', await clickRow('The grove is clear.')
  && await waitFor(async () => { await leave(); await ensureJournal(); return (await journal())?.completed.includes('Clear the Grove'); }),
JSON.stringify((await journal())?.completed));

// --- leg B: the second quest is offered only now, with the story ---------------
const between = await talkTo('Grandfather Knot');
check('B1 after the grove: "Do you have another task?" replaces the first task row',
  between?.rows.includes('Do you have another task?') && !between?.rows.includes('Do you have a task for me?'), JSON.stringify(between?.rows));
await clickRow('Do you have another task?');
const story = await panel();
check('B2 the roots brief tells the story (angry trees, sleeping roots) and sends you west',
  /angry/.test(story?.lines ?? '') && /asleep/.test(story?.lines ?? '') && /stream/.test(story?.lines ?? '')
    && !/deadwood/i.test(story?.lines ?? '') && story?.rows.includes("I'll do it."),
  JSON.stringify(story));
await clickRow("I'll do it.");
await leave();
questTitle = 'The Sleeping Roots';
check('B3 accepting starts "The Sleeping Roots" at the stream root',
  await waitFor(async () => (await objectives()).includes('Wake the root by the stream')), JSON.stringify(await objectives()));

// --- leg C: the three roots, one at a time --------------------------------------
// The first leg starts on accept; each later one is sent from a row on his
// greeting, and nothing about the deadwood is left to read.
for (let i = 0; i < ROOTS.length; i++) {
  const root = ROOTS[i];
  if (i > 0) {
    await warpTo(TREE, 1.6, 0);
    const before = await talkTo('Grandfather Knot');
    check(`C${i + 1}a the tree offers "${ROOTS[i - 1].row}"`, before?.rows.includes(ROOTS[i - 1].row), JSON.stringify(before?.rows));
    await clickRow(ROOTS[i - 1].row);
    const sent = await panel();
    const asks = (sent?.rows ?? []).filter((r) => r === 'Which root was it again?').length;
    check(`C${i + 1}b exactly one "Which root was it again?" row while leg ${i + 1} runs, and no deadwood talk`,
      asks === 1 && !(sent?.rows ?? []).some((r) => /deadwood|task/i.test(r)), JSON.stringify(sent));
    await leave();
  }
  await warpTo(one(root.mob), 1.0, 0);
  const k = await talkTo(root.actor);
  check(`C${i + 1}c the ${root.actor} answers`, k?.actor === root.actor, JSON.stringify(k));
  await leave();
  check(`C${i + 1}d touching it sends you back to the tree`,
    await waitFor(async () => (await objectives()).includes('Return to Grandfather Knot')), JSON.stringify(await objectives()));
}

// --- leg D: the turn-in ---------------------------------------------------------
await warpTo(TREE, 1.6, 0);
await talkTo('Grandfather Knot');
check('D1 the turn-in row is offered', await clickRow('The last root is awake.'), JSON.stringify(await panel()));
check('D2 EntanglingRoots lands in the spellbook',
  await waitFor(async () => (await spellbook()).some((r) => /Entangling Roots/i.test(r))), JSON.stringify(await spellbook()));
await leave();
check('D3 the quest is completed', await waitFor(async () => { await ensureJournal(); return (await journal())?.completed.includes('The Sleeping Roots'); }),
  JSON.stringify((await journal())?.completed));
const after = await talkTo('Grandfather Knot');
check('D4 afterwards he greets with the completed line', /about a century.*your journey/.test(after?.lines ?? ''), JSON.stringify(after));

check('Z no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 5).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.check}${r.pass ? '' : `\n      ${r.detail}`}`);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
