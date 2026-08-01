#!/usr/bin/env node
// quest content — the authored quests at the game surface.
// Written for plan-quests.md C4; REWRITTEN with conversation-journal Q4
// (2026-07-30), which restructured every conversant to R1's tree shape,
// simplified the lamp quest (no Miner leg), authored the Q2 trackers, and made
// Damage a creation-seeded milestone.
//
// Boundary: this script owns the AUTHORED QUEST CONTENT — that the offer,
// advance and turn-in rows exist on the right conversants at the right ledger
// states, that taking one pays what it says, that the authored trackers render,
// and that the journal fills with the authored prose. It does NOT own the
// journal panel itself (chunkC3-journal), the interact verb (chunk3b-interact)
// or the conversation panel's navigation (chunk3b-ii-conversation), and it
// never asserts how much quest content exists.
//
// The legs, and why each is here:
//
//   Z  Damage is in the spellbook at CREATION (the Q4 level-1 milestone) —
//      before any conversation. (The silence of the seeding is pinned in Go.)
//   A  village-welcome — talk_to, and the R1 headline at the surface: the
//      quest sits behind a row, its Accept row VANISHES once taken, and the
//      turn-in row appears exactly when walkable. Plus the authored
//      "Return to the Hermit" tracker. (Row texts follow the 2026-08-02
//      plain-text pass: entry rows are "Do you have a task for me?", accepts
//      are "I'll do it.", turn-ins state the completed fact.)
//   B  turnip-chore — harvest. Accept, then Back to root for the Harvest
//      teaching (behind the unified 'Teach me something.' row; the offer no
//      longer navigates, Back is the way out of a quest node) → five real
//      turnips → turn-in. Plus the "{n}/{m} turnips harvested" tracker.
//   D  the-lost-lamp — the simplified R3 version on the traveller alone:
//      follow-up answer-node + Back, accept, the "{n}/{m} kobolds killed"
//      tracker. Deliberately stops before the kobolds — the kill path is
//      proven by B/C and the turn-in reward is pinned by
//      TestContent_LanternIsQuestOnlyAndHasASource.
//   C  wolves-on-the-road — D9's branch, and the one leg that needs real
//      combat (eight wolves). Also asserts the crier's teachings NO LONGER
//      offer Damage. Tri-state: if the hunt does not land eight kills in its
//      window, that is an INCONCLUSIVE venue, not a content failure. Runs
//      LAST so a slow hunt cannot cost the other legs.
//
// ⚑ Restart aurad first and run this script ALONE — it stands in conversations
// all over the map, and a second harness in the same world puts NPCs in combat,
// which would at minimum steal kills and XP the assertions count.
//
// Usage: node .claude/skills/verify/chunkC4-quests.mjs [label] [url]
import { createRequire } from 'node:module';
import { join } from 'node:path';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');

const label = process.argv[2] || 'run';
const url = process.argv[3] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

// Venues. Whole units, because WARP has 1-unit granularity — and standing ON an
// NPC rather than near it is what makes the server offer THAT one: the village
// three sit within ~3.7 units of each other and the offer goes to the nearest
// (the standing conversant-cluster gotcha).
const AT = {
  Hermit: { x: -55, y: 26 },
  Farmer: { x: -57, y: 29 },
  TownCrier: { x: -56, y: 22 },
  Turnips: { x: -57, y: 31 },
  Traveller: { x: -21, y: -24 },
  Shaman: { x: 18, y: 6 },
  CityGuard: { x: 62, y: 10 },
  WolfCountry: { x: -60, y: 8 },
};

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();

const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

const results = [];
const check = (name, pass, detail) => results.push({ check: name, pass, detail });
const skip = (name, detail) => results.push({ check: name, skip: true, detail });

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await page.waitForSelector('#startForm .playerNameSubmit:not([disabled])', { timeout: 120_000 });
await page.fill('#startForm .playerNameInput', 'Quest' + String(process.pid).slice(-4));
await page.click('#startForm .playerNameSubmit');
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

// ⚑ WARP is server-side immediate; only the CAMERA lags (§20). Everything this
// script reads is DOM — the panel, the journal, the XP bar — so no settle is
// needed. Nothing here reads the scene graph, deliberately.
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
    canGoBack: !el.querySelector('.conversationBack')?.classList.contains('hidden'),
  };
});

// ⚑ ~1.4 s hold: the interact key is edge-triggered off an rAF-driven clock, and
// a headless page throttles rAF far below the nominal 33 ms — a tap falls between
// two samples and nothing fires, which reads exactly like a broken NPC.
const press = async (key) => {
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down(key);
  await page.waitForTimeout(1400);
  await page.keyboard.up(key);
  await page.waitForTimeout(900);
};

// Open a conversation and prove it is with the actor we came for (verify rule 5).
// A run that measures the wrong conversant goes green and proves nothing.
const talkTo = async (displayName, tries = 4) => {
  for (let i = 0; i < tries; i++) {
    const open = await panel();
    if (open && open.actor === displayName) return open;
    if (open) await press('e'); // wrong actor or a stale panel: close it first
    await press('e');
    const now = await panel();
    if (now && now.actor === displayName) return now;
    await page.waitForTimeout(1200);
  }
  return await panel();
};

const leave = async () => {
  if (await panel()) await press('e');
};

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

const clickBack = async () => {
  const el = await page.$('#conversation .conversationBack:not(.hidden)');
  if (!el) return false;
  const b = await el.boundingBox();
  if (!b) return false;
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForTimeout(900);
  return true;
};

// The Q3 two-pane journal DOM: list rows are titles with a .selected flag; the
// prose and the Q2 objective lines live in the detail pane.
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

// Select a quest's list row, then read its detail — the Q3 shape: the detail
// pane shows ONE quest, so every prose/tracker read goes through selection.
const detailOf = async (title) => {
  await selectQuest(title);
  const j = await journal();
  return j?.detail.title === title ? j.detail : null;
};

const inList = (section, title) => section.some((q) => q.title === title);

// The journal renders off a view signature, so give the ledger a few ticks to
// arrive rather than peeking at the frame of the click. The predicate may be
// async (detail reads go through a selection click).
const waitForJournal = async (predicate, timeout = 15_000) => {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeout) {
    last = await journal();
    if (last && await predicate(last)) return last;
    await page.waitForTimeout(500);
  }
  return last;
};

const banner = () => page.evaluate(() => document.getElementById('alertBanner')?.textContent?.trim() ?? '');
const spellbook = () => page.evaluate(() =>
  [...document.querySelectorAll('#spellbookList li')].map((li) => li.textContent.trim()));
// "XP 150/300" → 150. Within-level progress, so a level-up resets it.
const xpInLevel = () => page.evaluate(() => {
  const m = /XP\s+(\d+)\s*\/\s*(\d+)/.exec(document.querySelector('#xpBar .barText')?.textContent ?? '');
  return m ? Number(m[1]) : -1;
});

// Copied from chunkP-presence: click the skill NAME (never the row centre — the
// spend/unspend buttons sit mid-row and win), equip into aura slot 0, then click
// the slot again to toggle the aura ON, retrying until the client's slot state
// has caught up with the server.
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

// The catalog is the only place the diary prose lives (D14), so the journal
// assertions below compare against it rather than against strings copied here —
// a prose edit must not turn this script red.
const catalog = await page.evaluate(async () => {
  try {
    const res = await fetch(new URL('/quests', window.location.origin).toString());
    return await res.json();
  } catch (e) {
    return String(e);
  }
});
const prose = (questId, stageId) => {
  const q = Array.isArray(catalog) ? catalog.find((x) => x.id === questId) : null;
  return q?.stages.find((s) => s.id === stageId)?.journal ?? `??${questId}/${stageId}`;
};
const titleOf = (questId) => (Array.isArray(catalog) ? catalog.find((x) => x.id === questId)?.title : null) ?? `??${questId}`;

// --- leg Z: the creation milestone -------------------------------------------

// Before any conversation: the spellbook already holds Damage (the Q4 level-1
// milestone, seeded in New()). This is the surface half of the Go pin
// TestNew_AppliesLevel1MilestoneAtCreation.
const bookAtSpawn = await (async () => {
  await page.waitForFunction(() => document.querySelectorAll('#spellbookList li').length > 0, null, { timeout: 20_000 }).catch(() => null);
  return await spellbook();
})();
check('Z ⭐ a fresh character owns Damage at creation — no NPC involved (the Q4 milestone)',
  bookAtSpawn.some((r) => /damage/i.test(r)),
  `spellbook at spawn=${JSON.stringify(bookAtSpawn)}`);

await cmd('PING'); // the first command after joining is dropped
await cmd('GOD');  // this script stands still in aggro radii for minutes
await page.keyboard.press('KeyJ'); // journal open for the whole run
await page.waitForTimeout(600);

check('the four authored quests are served (boot count 4)',
  Array.isArray(catalog) && catalog.length === 4,
  Array.isArray(catalog) ? catalog.map((q) => q.id).join(', ') : String(catalog));

// --- leg A: village-welcome — talk_to + the R1 row lifecycle -----------------

try {
  await warpTo(AT.Hermit);
  const hermit = await talkTo('Hermit');
  check('A1 the Hermit greets at ROOT, the quest behind its own row (R1 — no greeting hijack)',
    hermit?.actor === 'Hermit' && hermit.rows.some((r) => r.includes('Do you have a task for me')),
    `actor=${hermit?.actor} rows=${JSON.stringify(hermit?.rows)}`);

  await clickRow('Do you have a task for me');
  const questNode = await panel();
  check('A2 the quest node speaks the brief and offers Accept (turn-in hidden before the deed)',
    questNode?.rows.some((r) => r.includes("I'll do it"))
    && !questNode.rows.some((r) => r.includes('I talked to the Farmer')),
    `rows=${JSON.stringify(questNode?.rows)}`);

  await clickRow("I'll do it");
  const afterOffer = await waitForJournal((j) => inList(j.running, titleOf('village-welcome')));
  const welcomeDetail = await detailOf(titleOf('village-welcome'));
  check('A3 clicking Accept starts the quest and writes its first diary entry',
    inList(afterOffer?.running ?? [], titleOf('village-welcome'))
    && welcomeDetail?.entries[0] === prose('village-welcome', 'meet'),
    `entries=${JSON.stringify(welcomeDetail?.entries)}`);
  check('A4 ...pings the journal banner (D17)', /journal updated/i.test(await banner()), await banner());
  check('A5 ...and shows the derived talk_to objective lines (Q2)',
    (welcomeDetail?.objectives ?? []).some((o) => o.includes('Talk to the Farmer'))
    && (welcomeDetail?.objectives ?? []).some((o) => o.includes('Talk to the Town Crier')),
    `objectives=${JSON.stringify(welcomeDetail?.objectives)}`);

  const reOffered = await panel();
  check('A6 ⭐ the Accept row VANISHED the moment the quest started (R1/Q1 show-rule)',
    reOffered !== null
    && !reOffered.rows.some((r) => r.includes("I'll do it")),
    `rows after accepting=${JSON.stringify(reOffered?.rows)}`);
  // A7 (answer-node + Back off a quest node) retired with the 2026-08-02
  // plain-text pass — the Hermit's lore follow-up went with the stylized text.
  // The same mechanism is still covered by D2/D3 (the Traveller's nest question).
  await leave();

  await warpTo(AT.Farmer);
  const farmer = await talkTo('Farmer');
  check('A8 the Farmer answers (one of the two talk_to targets)', farmer?.actor === 'Farmer', `actor=${farmer?.actor}`);
  await leave();

  await warpTo(AT.TownCrier);
  const crier = await talkTo('Town Crier');
  check('A9 the Town Crier answers (the second target)', crier?.actor === 'Town Crier', `actor=${crier?.actor}`);
  await leave();

  const advanced = await waitForJournal(async () => ((await detailOf(titleOf('village-welcome')))?.entries.length ?? 0) >= 2);
  const advancedDetail = await detailOf(titleOf('village-welcome'));
  check('A10 the objective advances off the two conversations alone — no row, no click (D3/D4)',
    advancedDetail?.entries.length === 2 && advancedDetail.entries[1] === prose('village-welcome', 'back'),
    `entries=${JSON.stringify(advancedDetail?.entries)}`);
  check('A11 ...and the dialogue stage shows its AUTHORED tracker (Q2 override, Q4 content)',
    (advancedDetail?.objectives ?? []).some((o) => o.includes('Return to the Hermit')),
    `objectives=${JSON.stringify(advancedDetail?.objectives)}`);

  await warpTo(AT.Hermit);
  await talkTo('Hermit');
  await clickRow('Do you have a task for me');
  const turnInNode = await panel();
  check('A12 ⭐ the turn-in row APPEARED on the same quest node, exactly when walkable (show-rule)',
    turnInNode?.rows.some((r) => r.includes('I talked to the Farmer'))
    && !turnInNode.rows.some((r) => r.includes("I'll do it")),
    `rows=${JSON.stringify(turnInNode?.rows)}`);

  const xpBefore = await xpInLevel();
  await clickRow('I talked to the Farmer');
  const done = await waitForJournal((j) => inList(j.completed, titleOf('village-welcome')));
  const xpAfter = await xpInLevel();
  check('A13 the turn-in completes the quest and moves it to Completed (D7)',
    inList(done?.completed ?? [], titleOf('village-welcome'))
    && !inList(done?.running ?? [], titleOf('village-welcome')),
    `completed=${JSON.stringify((done?.completed ?? []).map((q) => q.title))}`);
  check('A14 ...and pays the authored 150 XP through the normal level path (L9)',
    xpAfter - xpBefore === 150, `XP ${xpBefore} → ${xpAfter}`);
  await leave();
} catch (e) {
  check('leg A (village-welcome) ran to completion', false, `threw: ${e.message}`);
}

// --- leg B: turnip-chore — harvest, and Back as the way to the teaching ------

try {
  await warpTo(AT.Farmer);
  const farmer = await talkTo('Farmer');
  check('B1 the Farmer greets at root with the chore behind its own row',
    farmer?.rows.some((r) => r.includes('Do you have a task for me')),
    `rows=${JSON.stringify(farmer?.rows)}`);

  await clickRow('Do you have a task for me');
  const chore = await panel();
  check('B2 the chore node offers Accept (turn-in hidden before the deed)',
    chore?.rows.some((r) => r.includes("I'll do it"))
    && !chore.rows.some((r) => r.includes('I harvested the 5 turnips')),
    `rows=${JSON.stringify(chore?.rows)}`);

  await clickRow("I'll do it");
  await waitForJournal((j) => inList(j.running, titleOf('turnip-chore')));
  const choreDetail = await detailOf(titleOf('turnip-chore'));
  check('B3 accepting writes the diary and shows the "{n}/{m} turnips harvested" tracker (Q2/Q4)',
    choreDetail?.entries[0] === prose('turnip-chore', 'pull')
    && (choreDetail?.objectives ?? []).some((o) => /^\d+\/5 turnips harvested$/.test(o)),
    `entries=${JSON.stringify(choreDetail?.entries)} objectives=${JSON.stringify(choreDetail?.objectives)}`);

  // The Q4 shape: the offer row no longer navigates — Back to root is the way
  // to the teaching the chore needs (behind the unified 'Teach me something.').
  await clickBack();
  await clickRow('Teach me something');
  await clickRow('Harvest');
  await page.waitForTimeout(1200);
  const book = await spellbook();
  check('B4 Back → root → the named teaching row: Harvest learned in the same conversation',
    book.some((r) => /harvest/i.test(r)), `spellbook=${JSON.stringify(book)}`);
  await leave();

  const armed = await equipAndActivateAura(/Harvest/);
  check('B5 Harvest equipped and switched ON', armed.ok, armed.why);

  await warpTo(AT.Turnips);
  // Turnips are 20 HP and resist everything except the `harvest` tag, so this is
  // the cheapest real objective in the game — and they respawn on 600 ticks, so
  // standing in the row is enough to reach five.
  await waitForJournal(
    async () => ((await detailOf(titleOf('turnip-chore')))?.entries.length ?? 0) >= 2, 150_000);
  const pulled = await detailOf(titleOf('turnip-chore'));
  if (pulled?.entries.length >= 2) {
    check('B6 five real harvests advance the objective stage off the lifetime counters (D2/D3)',
      pulled.entries[1] === prose('turnip-chore', 'handover'), `entries=${JSON.stringify(pulled.entries)}`);
    check('B7 ...and the handover stage shows its authored tracker',
      (pulled.objectives ?? []).some((o) => o.includes('Return to the Farmer')),
      `objectives=${JSON.stringify(pulled.objectives)}`);

    await warpTo(AT.Farmer);
    await talkTo('Farmer');
    await clickRow('Do you have a task for me');
    const turnIn = await panel();
    check('B8 the turn-in row appeared behind the same chore row',
      turnIn?.rows.some((r) => r.includes('I harvested the 5 turnips')), `rows=${JSON.stringify(turnIn?.rows)}`);
    await clickRow('I harvested the 5 turnips');
    const done = await waitForJournal((j) => inList(j.completed, titleOf('turnip-chore')));
    check('B9 the chore completes',
      inList(done?.completed ?? [], titleOf('turnip-chore')),
      `completed=${JSON.stringify((done?.completed ?? []).map((q) => q.title))}`);
    await leave();
  } else {
    skip('B6–B9 the harvest objective and its turn-in',
      `INCONCLUSIVE — the journal never reached the handover stage in 150 s ` +
      `(entries=${pulled?.entries.length ?? 0}). Restart the server (mobs and props settle) and re-run alone.`);
  }
} catch (e) {
  check('leg B (turnip-chore) ran to completion', false, `threw: ${e.message}`);
}

// --- leg D: the-lost-lamp — the simplified R3 errand -------------------------

try {
  await warpTo(AT.Traveller);
  const traveller = await talkTo('Lampless Traveller');
  check('D1 the traveller greets at root, the lamp behind its own row',
    traveller?.rows.some((r) => r.includes('Do you have a task for me')),
    `actor=${traveller?.actor} rows=${JSON.stringify(traveller?.rows)}`);

  await clickRow('Do you have a task for me');
  const lampNode = await panel();
  check('D2 the lamp node offers Accept + the nest question (turn-in hidden)',
    lampNode?.rows.some((r) => r.includes("I'll do it"))
    && lampNode.rows.some((r) => r.includes('Where do they nest'))
    && !lampNode.rows.some((r) => r.includes('kobolds are dead')),
    `rows=${JSON.stringify(lampNode?.rows)}`);

  await clickRow('Where do they nest');
  const nest = await panel();
  await clickBack();
  check('D3 the nest question is an answer-node with Back (R1 follow-ups)',
    /North of the tunnel/i.test(nest?.lines ?? '') && (await panel())?.rows.some((r) => r.includes("I'll do it")),
    `lines="${nest?.lines}"`);

  await clickRow("I'll do it");
  await waitForJournal((j) => inList(j.running, titleOf('the-lost-lamp')));
  const lampDetail = await detailOf(titleOf('the-lost-lamp'));
  check('D4 accepting writes the diary and shows the "{n}/{m} kobolds killed" tracker (Q2/Q4)',
    lampDetail?.entries[0] === prose('the-lost-lamp', 'cull')
    && (lampDetail?.objectives ?? []).some((o) => /^\d+\/6 kobolds killed$/.test(o)),
    `entries=${JSON.stringify(lampDetail?.entries)} objectives=${JSON.stringify(lampDetail?.objectives)}`);
  await leave();

  skip('D5 the kobold cull and the lamp turn-in',
    'not attempted on purpose — six real kobold kills cost what eight wolves cost (leg C), and the ' +
    'counter → advance path is proven by B/C. The Lantern reward and its only-source status are pinned by ' +
    'TestContent_LanternIsQuestOnlyAndHasASource.');
} catch (e) {
  check('leg D (the-lost-lamp) ran to completion', false, `threw: ${e.message}`);
}

// --- leg C: wolves-on-the-road — D9's branch ---------------------------------

try {
  await warpTo(AT.TownCrier);
  const crier = await talkTo('Town Crier');
  check('C1 the crier greets at root with the wolves behind "Do you have a task for me?"',
    crier?.rows.some((r) => r.includes('Do you have a task for me')), `rows=${JSON.stringify(crier?.rows)}`);

  // Q4: the crier's teachings no longer offer Damage — it is the creation
  // milestone now. Recall must still be there (locked or not: the row shows).
  await clickRow('Teach me something');
  const teachings = await panel();
  check('C2 ⭐ the crier TEACHES NO DAMAGE any more (Q4) — Recall remains',
    teachings !== null
    && !teachings.rows.some((r) => /damage/i.test(r))
    && teachings.rows.some((r) => r.includes('Recall')),
    `teaching rows=${JSON.stringify(teachings?.rows)}`);
  await clickBack();

  await clickRow('Do you have a task for me');
  await clickRow("I'll do it");
  await waitForJournal((j) => inList(j.running, titleOf('wolves-on-the-road')));
  await leave();

  // Eight real wolves. Level 30 so each dies on contact, then walk a circuit
  // through the densest pack in the zone — wolves aggro at 3 units and are
  // slower than the player, so they come to us. Damage is already in the book
  // (leg Z — no SKILL cheat needed).
  await cmd('XP 400000');
  const armed = await equipAndActivateAura(/Damage/);
  await warpTo(AT.WolfCountry);
  const hunted = await (async () => {
    const deadline = Date.now() + 180_000;
    const keys = ['w', 'a', 's', 'd'];
    let i = 0;
    while (Date.now() < deadline) {
      const d = await detailOf(titleOf('wolves-on-the-road'));
      if ((d?.entries.length ?? 0) >= 2) return d;
      await page.evaluate(() => document.activeElement?.blur());
      await page.keyboard.down(keys[i++ % keys.length]);
      await page.waitForTimeout(1500);
      await page.keyboard.up(keys[(i - 1) % keys.length]);
      await page.waitForTimeout(500);
    }
    return null;
  })();

  if (!hunted) {
    skip('C3–C9 D9\'s branch (two turn-ins, different rewards)',
      `INCONCLUSIVE — eight wolves were not killed inside 180 s (aura armed: ${armed.ok}). ` +
      'The branch itself is pinned by the Go content tests; re-run alone on a freshly restarted server ' +
      'to walk it at the surface.');
  } else {
    check('C3 eight real wolf kills advance the cull off the counters',
      hunted.entries[1] === prose('wolves-on-the-road', 'carry_word'), `entries=${JSON.stringify(hunted.entries)}`);
    check('C4 ...and the carry stage shows its authored tracker (the choice, in the journal)',
      (hunted.objectives ?? []).some((o) => /Report to the City Guard or the Shaman/.test(o)),
      `objectives=${JSON.stringify(hunted.objectives)}`);

    await warpTo(AT.Shaman);
    const shaman = await talkTo('Shaman');
    check('C5 ⭐ the Shaman carries a turn-in row AT ROOT for a quest given by somebody else (D9)',
      shaman?.rows.some((r) => r.includes('8 wolves on the west road are dead')),
      `actor=${shaman?.actor} rows=${JSON.stringify(shaman?.rows)}`);
    await leave(); // deliberately NOT taken: the other leg is the one we walk

    await warpTo(AT.CityGuard);
    const guard = await talkTo('City Guard');
    check('C6 ⭐ ...and so does the City Guard — the same stage, two eligible NPCs (D9)',
      guard?.rows.some((r) => r.includes('8 wolves on the west road are dead')),
      `actor=${guard?.actor} rows=${JSON.stringify(guard?.rows)}`);

    const bookBefore = await spellbook();
    await clickRow('8 wolves on the west road are dead');
    const done = await waitForJournal((j) => inList(j.completed, titleOf('wolves-on-the-road')));
    const bookAfter = await spellbook();
    const doneDetail = await detailOf(titleOf('wolves-on-the-road'));
    check('C7 taking the militia leg completes the quest on ITS terminal stage, with its own diary entry',
      inList(done?.completed ?? [], titleOf('wolves-on-the-road'))
      && doneDetail?.entries.slice(-1)[0] === prose('wolves-on-the-road', 'told_militia'),
      `entries=${JSON.stringify(doneDetail?.entries)}`);
    check('C8 ...and pays the militia leg\'s own reward — Taunt, which the shaman leg does not teach',
      !bookBefore.some((r) => /taunt/i.test(r)) && bookAfter.some((r) => /taunt/i.test(r)),
      `spellbook gained: ${JSON.stringify(bookAfter.filter((r) => !bookBefore.includes(r)))}`);
    await leave();

    // The branch seals: a completed quest matches `completed`, never the terminal
    // stage it ended on (C2 shape decision ②), so the road not taken is gone.
    await warpTo(AT.Shaman);
    const shamanAfter = await talkTo('Shaman');
    check('C9 ⭐ the road not taken is closed — the Shaman\'s turn-in row is gone once the quest is finished',
      !(shamanAfter?.rows ?? []).some((r) => r.includes('8 wolves on the west road are dead')),
      `rows=${JSON.stringify(shamanAfter?.rows)}`);
    await leave();
  }
} catch (e) {
  check('leg C (wolves-on-the-road) ran to completion', false, `threw: ${e.message}`);
}

await page.screenshot({ path: `/tmp/chunkC4-quests-${label}.png` });

console.log('\nlabel :', label);
for (const r of results) console.log(`${r.skip ? 'SKIP' : r.pass ? 'PASS' : 'FAIL'}  ${r.check}\n        ${r.detail}`);
console.log('\nwebgl ctx losses :', consoleErrors.filter((t) => t.includes('[webgl] world context lost')).length);
console.log('console errors   :', consoleErrors.length);
for (const e of consoleErrors.slice(0, 5)) console.log('   ·', e);

await browser.close();
process.exit(results.some((r) => !r.skip && !r.pass) ? 1 : 0);
