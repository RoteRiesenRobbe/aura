#!/usr/bin/env node
// The generic kill quests at the game surface (plan-generic-kill-quests.md C1).
//
// Boundary: this script owns the FOUR C1 quests — that each giver carries the
// offer row, that one of them (boars-in-the-field) walks end to end (accept →
// tracker → six real kills → dialogue-stage tracker → turn-in pays exactly its
// authored 180 XP, once), and that the show-rule closes the row afterwards.
// The C4 quests belong to chunkC4-quests.mjs; the panel itself to
// chunk3b-ii-conversation.mjs. It never asserts how much quest content exists.
//
// Legs:
//   A  boars-in-the-field on the Farmer, END TO END. The hunt warps stop to
//      stop across the authored L2-boar spawn points around the farm (boars
//      are retaliation-only prey — they do not come to us, so a wander circuit
//      is the wrong tool). Tri-state: a hunt that does not reach six kills in
//      its window is an INCONCLUSIVE venue, not a content failure.
//   B  dire-wolves-in-the-forest: the Lamplighter's offer row + accept.
//   C  spiders-in-the-diggings: the Miner's offer row + accept.
//   D  kobolds-on-the-road: the Wanderer's offer row + accept. ⚑ The Wanderer
//      MOVES (spawn randomised ±4 units, wanders 4 more), so leg D searches a
//      ring of warp points and goes INCONCLUSIVE if it never stands close
//      enough — that is the actor's documented nature, not a content failure.
//
// ⚑ XP 20000 first (→ level 15): scales the seeded Damage aura enough to kill
// an L2 boar in a few ticks, AND makes every mob near the farm gray (≤ L9
// pays 0), so the only XP the bar can move by during leg A is the turn-in's
// authored 180 — the payment assert cannot be contaminated by hunt kills or a
// mid-window ding.
//
// ⚑ Restart aurad first and run this script ALONE (standing conversant rule).
//
// Usage: node .claude/skills/verify/c1-kill-quests.mjs [label] [url]
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

// Whole units (WARP granularity). Standing ON the NPC is what makes the server
// offer THAT one (conversant-cluster gotcha — the Farmer shares the village
// with the Hermit and the TownCrier ~3 units away).
const AT = {
  Farmer: { x: -57, y: 29 },
  Lamplighter: { x: -66, y: -28 },
  Miner: { x: -27, y: -26 },
  Wanderer: { x: -16, y: 31 }, // authored point; the actor is never exactly here
};
// The authored L2 Boar spawn points around the farm (api/zones/world.json,
// rounded to warp granularity). The hunt cycles these until the tracker fills.
const BOARS = [
  { x: -68, y: 29 }, { x: -66, y: 32 }, { x: -63, y: 33 }, { x: -59, y: 35 },
  { x: -56, y: 35 }, { x: -53, y: 33 }, { x: -49, y: 30 }, { x: -47, y: 27 },
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
await joinAsNewCharacter(page, 'boarcull');
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

const talkTo = async (displayName, tries = 4) => {
  for (let i = 0; i < tries; i++) {
    const open = await panel();
    if (open && open.actor === displayName) return open;
    if (open) await press('e');
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
// re-open the journal if something closed it — ⚑ Escape closes the JOURNAL,
// not just the map, so never press it unconditionally.
const ensureJournalOpen = async () => {
  for (let i = 0; i < 3 && !(await journal())?.open; i++) {
    await page.keyboard.press('KeyJ');
    await page.waitForTimeout(600);
  }
};

const closeMapIfOpen = async () => {
  const mapOpen = await page.evaluate(() => {
    const p = document.getElementById('worldMap');
    return !!p && !p.classList.contains('hidden');
  });
  if (mapOpen) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
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

// Copied from chunkC4-quests: equip by clicking the NAME, activate with retries.
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

// Prose from the catalog (D14) — an edit to the diary text must not redden this.
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

await cmd('PING'); // the first command after joining is dropped
await cmd('GOD');  // standing in aggro radii for minutes
await cmd('XP 20000'); // → L15: strong aura, and every mob near the farm is gray (see header)
await ensureJournalOpen();

const C1_IDS = ['boars-in-the-field', 'dire-wolves-in-the-forest', 'kobolds-on-the-road', 'spiders-in-the-diggings'];
check('the four C1 kill quests are served (by name, never by count)',
  Array.isArray(catalog) && C1_IDS.every((id) => catalog.some((q) => q.id === id)),
  Array.isArray(catalog) ? catalog.map((q) => q.id).join(', ') : String(catalog));

// --- leg A: boars-in-the-field on the Farmer, end to end ---------------------

try {
  await warpTo(AT.Farmer);
  const farmer = await talkTo('Farmer');
  check('A1 the Farmer carries BOTH quest rows at root (the first two-offer giver)',
    farmer?.actor === 'Farmer'
    && farmer.rows.some((r) => r.includes('Do you have a task for me'))
    && farmer.rows.some((r) => r.includes('Anything else that needs doing')),
    `actor=${farmer?.actor} rows=${JSON.stringify(farmer?.rows)}`);

  await clickRow('Anything else that needs doing');
  const node = await panel();
  check('A2 the boar node speaks the brief and offers Accept (turn-in hidden before the deed)',
    node?.rows.some((r) => r.includes("I'll do it"))
    && !node.rows.some((r) => r.includes('I killed the 6 boars')),
    `lines="${node?.lines}" rows=${JSON.stringify(node?.rows)}`);

  await clickRow("I'll do it");
  await waitForJournal((j) => inList(j.running, titleOf('boars-in-the-field')));
  const accepted = await detailOf(titleOf('boars-in-the-field'));
  check('A3 accepting writes the diary and shows the "{n}/{m} boars killed" tracker (Q2)',
    accepted?.entries[0] === prose('boars-in-the-field', 'cull')
    && (accepted?.objectives ?? []).some((o) => /^0\/6 boars killed$/.test(o)),
    `entries=${JSON.stringify(accepted?.entries)} objectives=${JSON.stringify(accepted?.objectives)}`);

  const reOpened = await panel();
  check('A4 the Accept row VANISHED the moment the quest started (Q1 show-rule)',
    reOpened !== null && !reOpened.rows.some((r) => r.includes("I'll do it")),
    `rows=${JSON.stringify(reOpened?.rows)}`);
  await leave();

  const armed = await equipAndActivateAura(/Damage/);
  check('A5 Damage equipped and switched ON for the hunt', armed.ok, armed.why);

  // The hunt: warp spawn point to spawn point until the objective advances.
  const hunted = await (async () => {
    const deadline = Date.now() + 240_000;
    let i = 0;
    while (Date.now() < deadline) {
      const d = await detailOf(titleOf('boars-in-the-field'));
      if ((d?.entries.length ?? 0) >= 2) return d;
      await warpTo(BOARS[i++ % BOARS.length]);
      await page.waitForTimeout(6000); // a few aura ticks on whatever stands here
    }
    return null;
  })();

  if (!hunted) {
    skip('A6–A9 the boar cull and its turn-in',
      'INCONCLUSIVE — six boars were not killed inside 240 s. Boars wander off their spawn points on a ' +
      'long-lived server; restart and re-run alone.');
  } else {
    check('A6 six real boar kills advance the cull off the counters',
      hunted.entries[1] === prose('boars-in-the-field', 'report'),
      `entries=${JSON.stringify(hunted.entries)}`);
    check('A7 ...and the report stage shows its authored tracker',
      (hunted.objectives ?? []).some((o) => o.includes('Return to the Farmer')),
      `objectives=${JSON.stringify(hunted.objectives)}`);

    await warpTo(AT.Farmer);
    await talkTo('Farmer');
    await clickRow('Anything else that needs doing');
    const turnIn = await panel();
    check('A8 the turn-in row appeared behind the same row, exactly when walkable (show-rule)',
      turnIn?.rows.some((r) => r.includes('I killed the 6 boars'))
      && !turnIn.rows.some((r) => r.includes("I'll do it")),
      `rows=${JSON.stringify(turnIn?.rows)}`);

    const xpBefore = await xpInLevel();
    await clickRow('I killed the 6 boars');
    const done = await waitForJournal((j) => inList(j.completed, titleOf('boars-in-the-field')));
    const xpAfter = await xpInLevel();
    check('A9 the turn-in completes the quest and pays EXACTLY the authored 180 XP',
      inList(done?.completed ?? [], titleOf('boars-in-the-field')) && xpAfter - xpBefore === 180,
      `XP ${xpBefore} → ${xpAfter}, completed=${JSON.stringify((done?.completed ?? []).map((q) => q.title))}`);

    const after = await panel();
    check('A10 the row is CLOSED after completion — no re-accept, no second payment (show-rule)',
      after !== null
      && !after.rows.some((r) => r.includes('I killed the 6 boars'))
      && !after.rows.some((r) => r.includes("I'll do it")),
      `rows=${JSON.stringify(after?.rows)}`);
    await leave();
  }
} catch (e) {
  check('leg A (boars-in-the-field) ran to completion', false, `threw: ${e.message}`);
}

// --- legs B/C: the stationary givers — offer row + accept --------------------

const offerLeg = async (tag, where, displayName, questId, rowNeedle, turnInNeedle) => {
  try {
    await warpTo(where);
    const npc = await talkTo(displayName);
    check(`${tag}1 the ${displayName} carries the quest behind its own root row`,
      npc?.actor === displayName && npc.rows.some((r) => r.includes(rowNeedle)),
      `actor=${npc?.actor} rows=${JSON.stringify(npc?.rows)}`);

    await clickRow(rowNeedle);
    const node = await panel();
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
      && (d?.objectives ?? []).some((o) => /^0\/\d+ .+ killed$/.test(o)),
      `entries=${JSON.stringify(d?.entries)} objectives=${JSON.stringify(d?.objectives)}`);
    await leave();
    return true;
  } catch (e) {
    check(`leg ${tag} (${questId}) ran to completion`, false, `threw: ${e.message}`);
    return false;
  }
};

await offerLeg('B', AT.Lamplighter, 'Lamplighter', 'dire-wolves-in-the-forest',
  'Do you have a task for me', 'I killed the 4 dire wolves');
await offerLeg('C', AT.Miner, 'Miner', 'spiders-in-the-diggings',
  'Do you have a task for me', 'I killed the 6 spiders');

// --- leg D: the Wanderer — a moving giver ------------------------------------

// The Wanderer is never at its authored point (spawn randomised ±4, wanders 4
// more). Search a ring of warp points; if it is never within talk range, that
// is the actor's nature — INCONCLUSIVE, not red.
try {
  const OFFSETS = [
    [0, 0], [3, 0], [-3, 0], [0, 3], [0, -3], [3, 3], [-3, 3], [3, -3], [-3, -3],
    [6, 0], [-6, 0], [0, 6], [0, -6], [6, 3], [-6, -3], [3, 6], [-3, -6], [6, 6], [-6, 6], [6, -6], [-6, -6],
  ];
  let wanderer = null;
  for (const [dx, dy] of OFFSETS) {
    await warpTo({ x: AT.Wanderer.x + dx, y: AT.Wanderer.y + dy });
    // Campfire spawnpoint-3 (-16.47,31.53) is 0.7u from the Wanderer's authored
    // point, and E at a fire opens the FLIGHT MAP (flight C3) — close it, but
    // ONLY it: a blind Escape would close the journal too.
    await closeMapIfOpen();
    await press('e');
    const open = await panel();
    if (open && open.actor === 'Wanderer') { wanderer = open; break; }
    if (open) await press('e'); // some other actor answered — close and move on
  }
  if (!wanderer) {
    skip('D1–D3 kobolds-on-the-road on the Wanderer',
      'INCONCLUSIVE — the Wanderer was not inside talk range at any of 21 search points ' +
      '(it wanders up to ~8 units off its authored spot). Re-run, ideally freshly restarted.');
  } else {
    check('D1 the Wanderer carries the quest behind its own root row (beside the road directions)',
      wanderer.rows.some((r) => r.includes('Do you have a task for me'))
      && wanderer.rows.some((r) => r.includes('Which way is safe')),
      `rows=${JSON.stringify(wanderer.rows)}`);

    // ⚑ The Wanderer resumes its stroll the instant a conversation ends, and a
    // row click races the hold — observed live: the click lands, the panel
    // re-reads at ROOT. Retry the navigation; the row's existence is D1's.
    let node = null;
    for (let i = 0; i < 4 && !node?.rows.some((r) => r.includes("I'll do it")); i++) {
      await clickRow('Do you have a task for me');
      node = await panel();
      if (!node) { await press('e'); node = await panel(); }
    }
    check('D2 the kobold node offers Accept (turn-in hidden before the deed)',
      node?.rows.some((r) => r.includes("I'll do it"))
      && !node.rows.some((r) => r.includes('I killed the 8 kobolds')),
      `lines="${node?.lines}" rows=${JSON.stringify(node?.rows)}`);

    await clickRow("I'll do it");
    const j = await waitForJournal((jj) => inList(jj.running, titleOf('kobolds-on-the-road')));
    const d = await detailOf(titleOf('kobolds-on-the-road'));
    check('D3 accepting starts the quest and shows the "{n}/{m} kobolds killed" tracker',
      inList(j?.running ?? [], titleOf('kobolds-on-the-road'))
      && d?.entries[0] === prose('kobolds-on-the-road', 'cull')
      && (d?.objectives ?? []).some((o) => /^0\/8 kobolds killed$/.test(o)),
      `entries=${JSON.stringify(d?.entries)} objectives=${JSON.stringify(d?.objectives)}`);
    await leave();
  }
} catch (e) {
  check('leg D (kobolds-on-the-road) ran to completion', false, `threw: ${e.message}`);
}

await page.screenshot({ path: `/tmp/c1-kill-quests-${label}.png` });

console.log('\nlabel :', label);
for (const r of results) console.log(`${r.skip ? 'SKIP' : r.pass ? 'PASS' : 'FAIL'}  ${r.check}\n        ${r.detail}`);
console.log('\nwebgl ctx losses :', consoleErrors.filter((t) => t.includes('[webgl] world context lost')).length);
console.log('console errors   :', consoleErrors.length);
for (const e of consoleErrors.slice(0, 5)) console.log('   ·', e);

await browser.close();
process.exit(results.some((r) => !r.skip && !r.pass) ? 1 : 0);
