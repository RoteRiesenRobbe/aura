#!/usr/bin/env node
// The vertical slice's PF2 at the game surface, on the LIVE world (boot
// WITHOUT -debug-zones): plan-vertical-slice.md §5.3 PF2.
//
// Legs:
//   A  F10: the memorial stands in the nave beside the ascension stone; E at
//      each one opens that one.
//   B  F29: the Miner Guild Associate outside the Anvilguard Forge teaches Pickaxe.
//   C  F52: Captain Brack offers the crab quest (two-row shape); 8 real crab kills
//      (tri-state: a short hunt is an INCONCLUSIVE venue) and a turn-in that pays
//      exactly 710 XP.
//
// ⚑ Restart aurad first and run this script ALONE (standing conversant rule).
//
// Usage: node .claude/skills/verify/pf2-slice-world.mjs [label] [url]
import { createRequire } from 'node:module';
import { join } from 'node:path';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');
import { joinAsNewCharacter } from './lib/join.mjs';
import { showSkillRowAt } from './lib/spellbook.mjs';

const label = process.argv[2] || 'run';
const url = process.argv[3] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

// Live-world venues (api/zones/world.json, city-hub + sorrowfen). WARP takes
// pixels, so fractional units are fine.
const AT = {
  Memorial: { x: -24.6, y: 3.4 },            // memorial 0.8 u, ascension stone 4.2 u
  Stone: { x: -24.6, y: -1.6 },              // stone 0.8 u, memorial 4.2 u
  Associate: { x: -44.6, y: -22.6 },         // the associate 0.8 u outside the forge door
  Brack: { x: -172.98, y: 50.8 },
};
// The six authored Lake Crab spawns on Sorrowfen's beach.
const CRABS = [
  { x: -174.1, y: 60.9 }, { x: -175.2, y: 64.4 }, { x: -172.9, y: 67.2 },
  { x: -174.2, y: 71.5 }, { x: -174.6, y: 77.7 }, { x: -174, y: 85 },
];

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const page = await (await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 800 } })).newPage();

const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

const results = [];
const check = (name, pass, detail) => results.push({ check: name, pass, detail });
const skip = (name, detail) => results.push({ check: name, skip: true, detail });

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await joinAsNewCharacter(page, 'pf2world');
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

const warpTo = async (where) => {
  await cmd(`WARP ${Math.round(where.x * 120)} ${Math.round(where.y * 120)}`);
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

// ⚑ Escape is NOT free: it closes the JOURNAL too (probed 2026-08-07: an
// unconditional Escape here closed it at the first NPC and nulled every
// detail read in the run). Only close the flight map, and only when open.
const closeMapIfOpen = async () => {
  const mapOpen = await page.evaluate(() => {
    const p = document.getElementById('worldMap');
    return !!p && !p.classList.contains('hidden');
  });
  if (mapOpen) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
};

const talkTo = async (displayName, tries = 4) => {
  for (let i = 0; i < tries; i++) {
    const open = await panel();
    if (open && open.actor === displayName) return open;
    if (open) await press('e');
    await closeMapIfOpen();
    await press('e');
    const now = await panel();
    if (now && now.actor === displayName) return now;
    await page.waitForTimeout(1200);
  }
  return await panel();
};

const leave = async () => { if (await panel()) await press('e'); };

const clickRow = async (needle) => {
  const handle = await page.evaluateHandle((n) => {
    const rows = [...document.querySelectorAll('#conversation .conversationRows li')];
    return rows.find((li) => li.textContent.includes(n)) ?? null;
  }, needle);
  const el = handle.asElement();
  if (!el) return false;
  const b = await el.boundingBox();
  if (!b) return false;
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForTimeout(1200);
  return true;
};

const journal = () => page.evaluate(() => {
  const p = document.getElementById('journal');
  if (!p) return null;
  const section = (cls) => [...p.querySelectorAll(`${cls} .journalQuest`)].map((q) => ({
    title: q.textContent,
    selected: q.classList.contains('selected'),
  }));
  const detailBody = p.querySelector('.journalDetailBody');
  return {
    open: !p.classList.contains('hidden'),
    running: section('.journalRunning'),
    completed: section('.journalCompleted'),
    detail: {
      title: p.querySelector('.journalDetailTitle')?.textContent ?? '',
      entries: [...(detailBody?.querySelectorAll('.journalEntry') ?? [])].map((e) => e.textContent),
      objectives: [...(detailBody?.querySelectorAll('.journalObjective') ?? [])].map((e) => e.textContent),
    },
  };
});

const selectQuest = async (title) => {
  const handle = await page.evaluateHandle((t) =>
    [...document.querySelectorAll('#journal .journalQuest')].find((li) => li.textContent === t) ?? null, title);
  const el = handle.asElement();
  if (!el) return false;
  const box = await el.boundingBox();
  if (!box) return false;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(500);
  return true;
};

// Quick KeyJ toggles reliably (raw keydown listener, probed 2026-08-07);
// re-open the journal if something (Escape, a stray toggle) closed it;
// selectQuest needs a VISIBLE list row to click.
const ensureJournalOpen = async () => {
  for (let i = 0; i < 3 && !(await journal())?.open; i++) {
    await page.keyboard.press('KeyJ');
    await page.waitForTimeout(600);
  }
};

const detailOf = async (title) => {
  await ensureJournalOpen();
  await selectQuest(title);
  const j = await journal();
  return j?.detail.title === title ? j.detail : null;
};

const inList = (section, title) => section.some((q) => q.title === title);

const waitForJournal = async (predicate, timeout = 15_000) => {
  await ensureJournalOpen();
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeout) {
    last = await journal();
    if (last && await predicate(last)) return last;
    await page.waitForTimeout(500);
  }
  return last;
};

const xpInLevel = () => page.evaluate(() => {
  // Numbers are locale-formatted (plan-localization.md D16): "XP 1,234 / 5,600".
  const m = /XP\s+([\d.,\s  ]+?)\s*\/\s*([\d.,\s  ]+)/.exec(document.querySelector('#xpBar .barText')?.textContent ?? '');
  return m ? Number(m[1].replace(/\D/g, '')) : -1;
});

const equipAndActivateAura = async (skillRe) => {
  const rowAppeared = await page.waitForFunction(
    (re) => [...document.querySelectorAll('#spellbookList li')].some((li) => new RegExp(re, 'i').test(li.textContent)),
    skillRe.source, { timeout: 20_000 }).catch(() => null);
  if (!rowAppeared) return { ok: false, why: `no spellbook row matches ${skillRe}` };
  const rowIndex = await page.evaluate((re) =>
    [...document.querySelectorAll('#spellbookList li')].findIndex((li) => new RegExp(re, 'i').test(li.textContent)),
  skillRe.source);
  await showSkillRowAt(page, rowIndex); // the book is a closable, paged panel since UI pass C3
  const rows = await page.$$('#spellbookList li');
  const box = await rows[rowIndex].boundingBox();
  await page.mouse.click(box.x + 25, box.y + box.height / 2);
  await page.waitForTimeout(700);
  if (!await page.evaluate(() => !!document.querySelector('#spellbookList li.selected'))) {
    return { ok: false, why: 'clicking the name did not select it' };
  }
  const slot = await page.$('#auraSlotList li');
  const sbox = await slot.boundingBox();
  await page.mouse.click(sbox.x + sbox.width / 2, sbox.y + sbox.height / 2);
  const equipped = await page.waitForFunction(
    (re) => new RegExp(re, 'i').test(document.querySelector('#auraSlotList')?.textContent || ''),
    skillRe.source, { timeout: 20_000 }).catch(() => null);
  if (!equipped) return { ok: false, why: 'slot never showed the skill (equip did not land)' };
  for (let i = 0; i < 5; i++) {
    await page.mouse.click(sbox.x + sbox.width / 2, sbox.y + sbox.height / 2);
    await page.waitForTimeout(1200);
    if (await page.evaluate(() => !!document.querySelector('#auraSlotList .auraSlot.activeSlot'))) {
      return { ok: true, why: `activeSlot lit (attempt ${i + 1})` };
    }
  }
  return { ok: false, why: 'slot never lit as active after 5 attempts' };
};

const catalog = await page.evaluate(async () => {
  try {
    const res = await fetch(new URL('/quests', window.location.origin).toString());
    return await res.json();
  } catch (e) { return String(e); }
});
const prose = (questId, stageId) => {
  const q = Array.isArray(catalog) ? catalog.find((x) => x.id === questId) : null;
  return q?.stages.find((s) => s.id === stageId)?.journal ?? `??${questId}/${stageId}`;
};
const titleOf = (questId) => (Array.isArray(catalog) ? catalog.find((x) => x.id === questId)?.title : null) ?? `??${questId}`;

await cmd('PING');
await cmd('GOD on');
await cmd('XP 120000'); // L25: the crabs are gray, so the bar moves by the turn-in alone

// --- leg A: the memorial in the nave (F10) ----------------------------------
try {
  await warpTo(AT.Memorial);
  const mem = await talkTo('Memorial Stone');
  check('A1 E beside the memorial opens the memorial (it stands in the nave now)',
    mem?.actor === 'Memorial Stone', `actor=${mem?.actor}`);
  await leave();
  await warpTo(AT.Stone);
  await press('e');
  const stone = await panel();
  check('A2 E beside the ascension stone still opens the stone, not the memorial',
    !!stone && stone.actor !== 'Memorial Stone', `actor=${stone?.actor}`);
  await leave();
} catch (e) {
  check('leg A ran to completion', false, `threw: ${e.message}`);
}

// --- leg B: Pickaxe's new teacher (F29) -------------------------------------
try {
  await warpTo(AT.Associate);
  const assoc = await talkTo('Miner Guild Associate');
  check('B1 the Miner Guild Associate stands by the forge and talks',
    assoc?.actor === 'Miner Guild Associate', `actor=${assoc?.actor} rows=${JSON.stringify(assoc?.rows)}`);
  await clickRow('Teach me');
  const teach = await panel();
  check('B2 his teaching row names Pickaxe',
    !!teach && teach.rows.some((r) => /Pickaxe/.test(r)), `rows=${JSON.stringify(teach?.rows)}`);
  await clickRow('Pickaxe');
  const learned = await page.waitForFunction(
    () => [...document.querySelectorAll('#spellbookList li')].some((li) => /Pickaxe/.test(li.textContent)),
    null, { timeout: 15_000 }).then(() => true).catch(() => false);
  check('B3 ...and the click lands Pickaxe in the spellbook', learned, '');
  await leave();
} catch (e) {
  check('leg B ran to completion', false, `threw: ${e.message}`);
}

// --- leg C: the crab quest (F52) --------------------------------------------
const Q = 'crabs-in-the-hammocks';
try {
  await warpTo(AT.Brack);
  const brack = await talkTo("Captain Brack");
  check('C1 Captain Brack carries the crab offer behind its own root row',
    !!brack && brack.rows.some((r) => r.includes('Any other trouble in the camp?'))
    && !brack.rows.some((r) => r.includes('About the crabs')),
    `actor=${brack?.actor} rows=${JSON.stringify(brack?.rows)}`);
  await clickRow('Any other trouble in the camp?');
  const brief = await panel();
  check('C2 the brief speaks the crab line and offers Accept',
    !!brief && brief.lines.includes('hammocks') && brief.rows.some((r) => r.includes("I'll do it")),
    `lines="${brief?.lines}" rows=${JSON.stringify(brief?.rows)}`);
  await clickRow("I'll do it");
  await waitForJournal((j) => inList(j.running, titleOf(Q)));
  const accepted = await detailOf(titleOf(Q));
  check('C3 accepting writes the diary and the "0/8 crabs killed" tracker',
    accepted?.entries[0] === prose(Q, 'cull') && (accepted?.objectives ?? []).some((o) => /^0\/8 crabs killed$/.test(o)),
    `entries=${JSON.stringify(accepted?.entries)} objectives=${JSON.stringify(accepted?.objectives)}`);
  await page.keyboard.press('KeyJ');
  const swapped = await talkTo('Captain Brack');
  check('C4 the root rows swapped: the offer row left, "About the crabs..." came',
    !!swapped && !swapped.rows.some((r) => r.includes('Any other trouble')) && swapped.rows.some((r) => r.includes('About the crabs')),
    `rows=${JSON.stringify(swapped?.rows)}`);
  await leave();

  const armed = await equipAndActivateAura(/Damage/);
  check('C5 Damage equipped and switched ON for the hunt', armed.ok, armed.why);
  const hunted = await (async () => {
    const deadline = Date.now() + 300_000;
    let i = 0;
    while (Date.now() < deadline) {
      const d = await detailOf(titleOf(Q));
      if ((d?.entries.length ?? 0) >= 2) return d;
      await warpTo(CRABS[i++ % CRABS.length]);
      await page.waitForTimeout(6000);
    }
    return null;
  })();
  if (!hunted) {
    skip('C6-C8 the crab cull and its turn-in', 'INCONCLUSIVE: eight crabs were not killed inside 300 s (six spawns, 60 s respawn)');
  } else {
    check('C6 eight real crab kills advance the cull to the report stage',
      hunted.entries[1] === prose(Q, 'report'), `entries=${JSON.stringify(hunted.entries)}`);
    await warpTo(AT.Brack);
    await talkTo('Captain Brack');
    await clickRow('About the crabs');
    const turnIn = await panel();
    check('C7 the turn-in row appears behind the progress row',
      !!turnIn && turnIn.rows.some((r) => r.includes('The crabs are dealt with')), `rows=${JSON.stringify(turnIn?.rows)}`);
    const xpBefore = await xpInLevel();
    await clickRow('The crabs are dealt with');
    const done = await waitForJournal((j) => inList(j.completed, titleOf(Q)));
    const xpAfter = await xpInLevel();
    check('C8 the turn-in completes the quest and pays EXACTLY 710 XP',
      inList(done?.completed ?? [], titleOf(Q)) && xpAfter - xpBefore === 710, `XP ${xpBefore} -> ${xpAfter}`);
  }
} catch (e) {
  check('leg C ran to completion', false, `threw: ${e.message}`);
}

console.log('\nlabel :', label);
for (const r of results) console.log(`${r.skip ? 'SKIP' : r.pass ? 'PASS' : 'FAIL'}  ${r.check}\n        ${r.detail}`);
console.log('\nconsole errors   :', consoleErrors.length);
for (const e of consoleErrors.slice(0, 5)) console.log('   ·', e);
await browser.close();
process.exit(results.some((r) => !r.skip && !r.pass) ? 1 : 0);
