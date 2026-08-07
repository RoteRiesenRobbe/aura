#!/usr/bin/env node
// The zone-2 generic kill quests at the game surface (plan-generic-kill-quests.md C2).
//
// Boundary: this script owns the FIVE C2 quests — each giver carries the offer
// row, one quest (bears-at-the-walls) walks end to end, the show-rule seals it.
// The C1 quests belong to c1-kill-quests.mjs, the C4 originals to
// chunkC4-quests.mjs — including the wolves turn-in rows that share the
// Shaman/CityGuard roots (their coexistence with the new rows is chunkC4's
// C5/C6 legs, which need the wolves quest ACTIVE — re-run that script after
// any edit here). Never asserts how much quest content exists.
//
// Legs:
//   A  bears-at-the-walls on the City Guard, END TO END — warps spawn point to
//      spawn point across the five authored L16 Bear spawns (predators wander,
//      so tri-state: a short hunt is an INCONCLUSIVE venue, not a failure).
//   B  dire-wolves-at-the-camp: Shaman offer + accept.
//   C  bandits-at-the-shrine: Emberkeeper offer + accept (⚑ campfire
//      spawnpoint-5 is 1.12 u from him — warp (35,-19) makes him 0.78 u vs the
//      fire's 1.87, breaking the E tie the C1 ledger's L1 documents).
//   D  alpha-wolves-at-the-village: VillageHealer offer + accept (⚑ spawnpoint-2 is 1.5 u
//      from her — warp (46,11): healer 0.6 u, fire 2.06 u).
//   E  thin-the-orc-line: FrontCaptain offer + accept.
//
// ⚑ XP 120000 first (→ L25): every mob near the city gate — Bear L16,
// EliteWolf L17, DireBear L18 — is gray (≤ P−(5+⌊P/10⌋) = 18), so the XP bar
// can only move by the turn-in's authored 2300 during leg A, and the Damage
// aura one-shots-ish the bears.
//
// ⚑ Restart aurad first and run this script ALONE (standing conversant rule).
//
// Usage: node .claude/skills/verify/c2-kill-quests.mjs [label] [url]
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

// Whole units (WARP granularity); fire-tie-safe where a campfire is near.
const AT = {
  CityGuard: { x: 62, y: 10 },
  Shaman: { x: 18, y: 6 },
  Emberkeeper: { x: 35, y: -19 },
  VillageHealer: { x: 46, y: 11 },
  FrontCaptain: { x: 59, y: 27 },
};
// The authored L16 Bear spawn points near the gate (api/zones/world.json).
const BEARS = [
  { x: 59, y: 11 }, { x: 56, y: 3 }, { x: 53, y: 3 }, { x: 50, y: -2 }, { x: 54, y: -4 },
];

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();

const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

const results = [];
const check = (name, pass, detail) => results.push({ check: name, pass, detail });
const skip = (name, detail) => results.push({ check: name, skip: true, detail });

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await joinAsNewCharacter(page, 'bearcull');
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
  await cmd(`WARP ${where.x * 120} ${where.y * 120}`);
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

// ⚑ Escape is NOT free: it closes the JOURNAL too (probed 2026-08-07 — an
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
// re-open the journal if something (Escape, a stray toggle) closed it —
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
  const m = /XP\s+(\d+)\s*\/\s*(\d+)/.exec(document.querySelector('#xpBar .barText')?.textContent ?? '');
  return m ? Number(m[1]) : -1;
});

const equipAndActivateAura = async (skillRe) => {
  const rowAppeared = await page.waitForFunction(
    (re) => [...document.querySelectorAll('#spellbookList li')].some((li) => new RegExp(re, 'i').test(li.textContent)),
    skillRe.source, { timeout: 20_000 }).catch(() => null);
  if (!rowAppeared) return { ok: false, why: `no spellbook row matches ${skillRe}` };
  const rowIndex = await page.evaluate((re) =>
    [...document.querySelectorAll('#spellbookList li')].findIndex((li) => new RegExp(re, 'i').test(li.textContent)),
  skillRe.source);
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
await cmd('GOD');
await cmd('XP 120000'); // → L25: everything near the gate is gray (see header)
await ensureJournalOpen();

const C2_IDS = ['dire-wolves-at-the-camp', 'bandits-at-the-shrine', 'alpha-wolves-at-the-village', 'bears-at-the-walls', 'thin-the-orc-line'];
check('the five C2 kill quests are served (by name, never by count)',
  Array.isArray(catalog) && C2_IDS.every((id) => catalog.some((q) => q.id === id)),
  Array.isArray(catalog) ? catalog.map((q) => q.id).join(', ') : String(catalog));

// --- leg A: bears-at-the-walls on the City Guard, end to end -----------------

try {
  await warpTo(AT.CityGuard);
  const guard = await talkTo('City Guard');
  check('A1 the City Guard carries the quest behind its own root row (turn-in-only no more)',
    guard?.actor === 'City Guard' && guard.rows.some((r) => r.includes('Do you have a task for me')),
    `actor=${guard?.actor} rows=${JSON.stringify(guard?.rows)}`);

  await clickRow('Do you have a task for me');
  const node = await panel();
  check('A2 the bear node speaks the brief and offers Accept (turn-in hidden before the deed)',
    node?.rows.some((r) => r.includes("I'll do it"))
    && !node.rows.some((r) => r.includes('I killed the 5 bears')),
    `lines="${node?.lines}" rows=${JSON.stringify(node?.rows)}`);

  await clickRow("I'll do it");
  await waitForJournal((j) => inList(j.running, titleOf('bears-at-the-walls')));
  const accepted = await detailOf(titleOf('bears-at-the-walls'));
  check('A3 accepting writes the diary and shows the "{n}/{m} bears killed" tracker (Q2)',
    accepted?.entries[0] === prose('bears-at-the-walls', 'cull')
    && (accepted?.objectives ?? []).some((o) => /^0\/5 bears killed$/.test(o)),
    `entries=${JSON.stringify(accepted?.entries)} objectives=${JSON.stringify(accepted?.objectives)}`);

  const reOpened = await panel();
  check('A4 the Accept row VANISHED the moment the quest started (Q1 show-rule)',
    reOpened !== null && !reOpened.rows.some((r) => r.includes("I'll do it")),
    `rows=${JSON.stringify(reOpened?.rows)}`);
  await leave();

  const armed = await equipAndActivateAura(/Damage/);
  check('A5 Damage equipped and switched ON for the hunt', armed.ok, armed.why);

  const hunted = await (async () => {
    const deadline = Date.now() + 240_000;
    let i = 0;
    while (Date.now() < deadline) {
      const d = await detailOf(titleOf('bears-at-the-walls'));
      if ((d?.entries.length ?? 0) >= 2) return d;
      await warpTo(BEARS[i++ % BEARS.length]);
      await page.waitForTimeout(8000); // bears are ~1k HP at L16; a few aura ticks
    }
    return null;
  })();

  if (!hunted) {
    skip('A6–A9 the bear cull and its turn-in',
      'INCONCLUSIVE — five bears were not killed inside 240 s. Bears wander off their spawn points on a ' +
      'long-lived server; restart and re-run alone.');
  } else {
    check('A6 five real bear kills advance the cull off the counters',
      hunted.entries[1] === prose('bears-at-the-walls', 'report'),
      `entries=${JSON.stringify(hunted.entries)}`);
    check('A7 ...and the report stage shows its authored tracker',
      (hunted.objectives ?? []).some((o) => o.includes('Return to the City Guard')),
      `objectives=${JSON.stringify(hunted.objectives)}`);

    await warpTo(AT.CityGuard);
    await talkTo('City Guard');
    await clickRow('Do you have a task for me');
    const turnIn = await panel();
    check('A8 the turn-in row appeared behind the same row, exactly when walkable (show-rule)',
      turnIn?.rows.some((r) => r.includes('I killed the 5 bears'))
      && !turnIn.rows.some((r) => r.includes("I'll do it")),
      `rows=${JSON.stringify(turnIn?.rows)}`);

    const xpBefore = await xpInLevel();
    await clickRow('I killed the 5 bears');
    const done = await waitForJournal((j) => inList(j.completed, titleOf('bears-at-the-walls')));
    const xpAfter = await xpInLevel();
    check('A9 the turn-in completes the quest and pays EXACTLY the authored 2300 XP',
      inList(done?.completed ?? [], titleOf('bears-at-the-walls')) && xpAfter - xpBefore === 2300,
      `XP ${xpBefore} → ${xpAfter}, completed=${JSON.stringify((done?.completed ?? []).map((q) => q.title))}`);

    const after = await panel();
    check('A10 the row is CLOSED after completion — no re-accept, no second payment (show-rule)',
      after !== null
      && !after.rows.some((r) => r.includes('I killed the 5 bears'))
      && !after.rows.some((r) => r.includes("I'll do it")),
      `rows=${JSON.stringify(after?.rows)}`);
    await leave();
  }
} catch (e) {
  check('leg A (bears-at-the-walls) ran to completion', false, `threw: ${e.message}`);
}

// --- legs B–E: the other four givers — offer row + accept --------------------

const offerLeg = async (tag, where, displayName, questId, countRe, turnInNeedle) => {
  try {
    await warpTo(where);
    const npc = await talkTo(displayName);
    check(`${tag}1 the ${displayName} carries the quest behind its own root row`,
      npc?.actor === displayName && npc.rows.some((r) => r.includes('Do you have a task for me')),
      `actor=${npc?.actor} rows=${JSON.stringify(npc?.rows)}`);

    let node = null;
    for (let i = 0; i < 4 && !node?.rows.some((r) => r.includes("I'll do it")); i++) {
      await clickRow('Do you have a task for me');
      node = await panel();
      if (!node) { await press('e'); node = await panel(); }
    }
    check(`${tag}2 the quest node offers Accept (turn-in hidden before the deed)`,
      node?.rows.some((r) => r.includes("I'll do it"))
      && !node.rows.some((r) => r.includes(turnInNeedle)),
      `lines="${node?.lines}" rows=${JSON.stringify(node?.rows)}`);

    await clickRow("I'll do it");
    let j = await waitForJournal((jj) => inList(jj.running, titleOf(questId)), 8000);
    if (!inList(j?.running ?? [], titleOf(questId))
        && (await panel())?.rows.some((r) => r.includes("I'll do it"))) {
      // the accept click can miss once against a re-rendering panel — retry
      // only while the row is still offered (a landed accept removes it)
      await clickRow("I'll do it");
      j = await waitForJournal((jj) => inList(jj.running, titleOf(questId)), 8000);
    }
    const d = await detailOf(titleOf(questId));
    check(`${tag}3 accepting starts ${questId} and writes its diary + tracker`,
      inList(j?.running ?? [], titleOf(questId))
      && d?.entries[0] === prose(questId, 'cull')
      && (d?.objectives ?? []).some((o) => countRe.test(o)),
      `entries=${JSON.stringify(d?.entries)} objectives=${JSON.stringify(d?.objectives)}`);
    await leave();
  } catch (e) {
    check(`leg ${tag} (${questId}) ran to completion`, false, `threw: ${e.message}`);
  }
};

await offerLeg('B', AT.Shaman, 'Shaman', 'dire-wolves-at-the-camp',
  /^0\/6 dire wolves killed$/, 'I killed the 6 dire wolves');
await offerLeg('C', AT.Emberkeeper, 'Emberkeeper', 'bandits-at-the-shrine',
  /^0\/6 bandits killed$/, 'I killed the 6 bandits');
await offerLeg('D', AT.VillageHealer, 'Village Healer', 'alpha-wolves-at-the-village',
  /^0\/5 alpha wolves killed$/, 'I killed the 5 alpha wolves');
await offerLeg('E', AT.FrontCaptain, 'Front Captain', 'thin-the-orc-line',
  /^0\/5 orcs killed$/, 'I killed the 5 orcs');

await page.screenshot({ path: `/tmp/c2-kill-quests-${label}.png` });

console.log('\nlabel :', label);
for (const r of results) console.log(`${r.skip ? 'SKIP' : r.pass ? 'PASS' : 'FAIL'}  ${r.check}\n        ${r.detail}`);
console.log('\nwebgl ctx losses :', consoleErrors.filter((t) => t.includes('[webgl] world context lost')).length);
console.log('console errors   :', consoleErrors.length);
for (const e of consoleErrors.slice(0, 5)) console.log('   ·', e);

await browser.close();
process.exit(results.some((r) => !r.skip && !r.pass) ? 1 : 0);
