#!/usr/bin/env node
// quest chunk C3 — the journal panel, its wire and its abandon verb
// (plan-quests.md §6, D7/D13/D14/D16/D17).
//
// Boundary: this script owns the JOURNAL — the panel, the /quests catalog, the
// ledger arriving on GameState, the D17 banner, and abandon. It does not assert
// anything about conversations (chunk3b-*) beyond using one talk as an event
// source, and it never asserts how much quest content exists (verify rule 1).
//
// Two halves:
//
//   A. Always runs — the catalog is reachable, J and the HUD button open and
//      close the panel, and an empty journal SAYS it is empty rather than
//      looking like a broken one (the D14 degrade this chunk exists to get
//      right).
//   B. Content-driven, and SKIPped when the probe quest is not loaded: accept →
//      the running section shows the stage's diary + a banner → abandon → gone
//      and offerable again → re-accept → talk to the Emberkeeper → the objective
//      auto-advances, a second entry appears, the quest moves to Completed and
//      pings "Quest complete".
//
// To run half B, install the fixture next door and restart aurad:
//     cp .claude/skills/verify/chunkC3-probe-quest.json api/quests/
//     (restart the server, run this script, then DELETE it again —
//      api/quests/ is shipped content and C4 owns what lives there)
//
// ⚑ Restart the server first, and run this script ALONE — two harnesses in one
// world put each other's NPCs in combat, which withdraws the talk offer for
// every player at once.
//
// Usage: node .claude/skills/verify/chunkC3-journal.mjs [label] [url]
import { createRequire } from 'node:module';
import { join } from 'node:path';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');

const label = process.argv[2] || 'run';
const url = process.argv[3] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

const PROBE_QUEST = 'harness-probe';
// The Emberkeeper (34.52, -19.6) — isolated by 30.5 units from every other
// conversant, which is why the interact harness uses it too: no cluster can
// offer somebody else instead and quietly satisfy a talk_to for the wrong NPC.
const NEAR_EMBERKEEPER = `${35 * 120} ${-22 * 120}`;

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
await page.fill('#startForm .playerNameInput', 'Diary' + String(process.pid).slice(-4));
await page.click('#startForm .playerNameSubmit');
await page.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
// The develop panel overlays the right half of the screen and eats clicks.
await page.evaluate(() => { const p = document.getElementById('developPanel'); if (p) p.style.display = 'none'; });

const cmd = async (text) => {
  await page.evaluate((t) => {
    const input = document.getElementById('console_command');
    input.value = t;
    document.getElementById('console').dispatchEvent(new Event('submit', { cancelable: true }));
  }, text);
  await page.waitForTimeout(900);
};

const journal = () => page.evaluate(() => {
  const panel = document.getElementById('journal');
  if (!panel) return null;
  const section = (cls) => {
    const el = panel.querySelector(cls);
    return {
      visible: el && !el.classList.contains('hidden'),
      quests: [...el.querySelectorAll('.journalQuest')].map((q) => ({
        title: q.querySelector('.journalQuestTitle')?.textContent ?? '',
        entries: [...q.querySelectorAll('.journalEntry')].map((p) => p.textContent),
        hasAbandon: !!q.querySelector('.journalAbandon'),
      })),
    };
  };
  return {
    open: !panel.classList.contains('hidden'),
    status: panel.querySelector('.journalStatus')?.textContent ?? '',
    statusVisible: !panel.querySelector('.journalStatus')?.classList.contains('hidden'),
    running: section('.journalRunning'),
    completed: section('.journalCompleted'),
  };
});

const banner = () => page.evaluate(() => document.getElementById('alertBanner')?.textContent ?? '');

// Cache the scene-graph root while the character is alive: Character.destroy()
// nulls `plate`, which is the documented way in, so a mid-run death would turn
// every read below into a crash that looks like a journal failure.
const primeRoot = () => page.evaluate(() => {
  if (!window.__auraRoot) {
    let r = window.game.character.plate.parent;
    while (r.parent) r = r.parent;
    window.__auraRoot = r;
  }
  return true;
});

// How many interact badges are effectively visible (the chunk3b-interact
// definition: a Text reading "E" whose whole ancestor chain is visible).
const badgeCount = () => page.evaluate(() => {
  let n = 0;
  const walk = (c) => {
    if (c?.visible === false) return;
    if (typeof c?.text === 'string' && c.text.trim() === 'E') n++;
    (c?.children || []).forEach(walk);
  };
  walk(window.__auraRoot);
  return n;
});

// ⚑ Walk in short bursts until the badge lights, rather than trusting the WARP
// point: the talk sensor is ~1 unit wide and headless walking speed swings with
// rAF throttling, so no fixed walk duration reaches these actors reliably.
const walkUntilBadge = async (key, maxSeconds = 14) => {
  await page.evaluate(() => document.activeElement?.blur());
  for (let elapsed = 0; elapsed < maxSeconds; elapsed += 0.5) {
    if (await badgeCount() > 0) return true;
    await page.keyboard.down(key);
    await page.waitForTimeout(500);
    await page.keyboard.up(key);
  }
  return await badgeCount() > 0;
};

// The panel renders off a view signature, so give it a couple of ticks to catch
// up with a ledger change rather than peeking at the frame of the command.
const waitForJournal = async (predicate, timeout = 15_000) => {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeout) {
    last = await journal();
    if (last && predicate(last)) return last;
    await page.waitForTimeout(500);
  }
  return last;
};

await cmd('PING'); // the first command after joining is dropped (harness note)
// GOD, because this script stands still next to an NPC for a while and a dead
// player nulls the way into the scene graph.
await cmd('GOD');
await primeRoot();

// --- half A: the catalog and the panel itself -------------------------------

const catalog = await page.evaluate(async () => {
  try {
    const res = await fetch(new URL('/quests', window.location.origin).toString());
    return { ok: res.ok, body: await res.json() };
  } catch (e) {
    return { ok: false, body: String(e) };
  }
});
check('/quests serves the catalog (D14)',
  catalog.ok && Array.isArray(catalog.body),
  `HTTP ok=${catalog.ok}, ${Array.isArray(catalog.body) ? catalog.body.length + ' quests' : catalog.body}`);

// D14's projection: titles and prose, nothing else. Asserted on the KEYS, since
// the leak this guards against is a field nobody meant to serve.
if (Array.isArray(catalog.body) && catalog.body.length > 0) {
  const questKeys = Object.keys(catalog.body[0]).sort().join(',');
  const stageKeys = Object.keys(catalog.body[0].stages?.[0] ?? {}).sort().join(',');
  check('the catalog is a minimal projection — no objectives, no graph, no rewards',
    questKeys === 'id,stages,title' && stageKeys === 'id,journal',
    `quest keys [${questKeys}], stage keys [${stageKeys}]`);
} else {
  skip('the catalog is a minimal projection', 'no quest content loaded — nothing to project');
}

const closedAtStart = await journal();
check('the journal starts closed', closedAtStart && !closedAtStart.open, `open=${closedAtStart?.open}`);

await page.keyboard.press('KeyJ');
await page.waitForTimeout(600);
const opened = await journal();
check('J opens the journal (D16)', opened?.open === true, `open=${opened?.open}`);

// The degrade this chunk exists for: an empty journal must SAY it is empty, or
// it is indistinguishable from a journal whose catalog failed to load.
const emptyWorld = !Array.isArray(catalog.body) || catalog.body.length === 0;
if (emptyWorld) {
  check('an empty journal says so, rather than looking broken',
    opened?.statusVisible && /nothing written/i.test(opened?.status ?? ''),
    `status "${opened?.status}"`);
} else {
  check('the catalog loaded, so the panel does not claim to be unavailable',
    !/unavailable/i.test(opened?.status ?? ''),
    `status "${opened?.status || '(none)'}"`);
}

await page.keyboard.press('KeyJ');
await page.waitForTimeout(600);
check('a second J closes it', (await journal())?.open === false, 'closed');

const button = await page.$('#journalButton');
if (button) {
  const box = await button.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(600);
  check('the HUD button opens it too (D16)', (await journal())?.open === true, 'opened by click');
} else {
  check('the HUD button exists (D16)', false, '#journalButton not in the DOM');
}

await page.keyboard.press('Escape');
await page.waitForTimeout(600);
check('Escape closes it', (await journal())?.open === false, 'closed');

// --- half B: a quest actually moving through it -----------------------------

const probeLoaded = Array.isArray(catalog.body) && catalog.body.some((q) => q.id === PROBE_QUEST);
if (!probeLoaded) {
  skip('a quest walks through the journal (accept → abandon → complete)',
    `INCONCLUSIVE — the probe quest "${PROBE_QUEST}" is not loaded. ` +
    'cp .claude/skills/verify/chunkC3-probe-quest.json api/quests/ and restart aurad to run this half.');
} else {
  const probeTitle = catalog.body.find((q) => q.id === PROBE_QUEST).title;
  const [seekProse, spokenProse] = catalog.body.find((q) => q.id === PROBE_QUEST).stages.map((s) => s.journal);

  await page.keyboard.press('KeyJ'); // open and leave it open for the rest
  await page.waitForTimeout(400);

  await cmd(`QUEST ACCEPT ${PROBE_QUEST}`);
  const acceptBanner = await banner();
  const afterAccept = await waitForJournal((j) => j.running.quests.length > 0);
  check('accepting puts the quest in Running with the stage it entered (D7, L6)',
    afterAccept?.running.visible
    && afterAccept.running.quests[0]?.title === probeTitle
    && afterAccept.running.quests[0]?.entries[0] === seekProse,
    `running: ${JSON.stringify(afterAccept?.running.quests)}`);

  check('and pings the journal banner (D17)',
    /journal updated/i.test(acceptBanner),
    `banner "${acceptBanner}"`);

  check('a running quest offers Abandon; nothing else does (D13)',
    afterAccept?.running.quests[0]?.hasAbandon === true && afterAccept?.completed.visible !== true,
    `abandon row present=${afterAccept?.running.quests[0]?.hasAbandon}`);

  // Abandon by CLICKING the row — the whole point of the verb living in the
  // panel, and the reason the view signature has to hold still (a rebuilt row
  // drops the click).
  const abandonBox = await (await page.$('.journalAbandon')).boundingBox();
  await page.mouse.click(abandonBox.x + abandonBox.width / 2, abandonBox.y + abandonBox.height / 2);
  const afterAbandon = await waitForJournal((j) => j.running.quests.length === 0);
  check('abandoning removes it from the journal entirely (D13)',
    afterAbandon?.running.quests.length === 0 && afterAbandon?.completed.quests.length === 0,
    `running=${afterAbandon?.running.quests.length}, completed=${afterAbandon?.completed.quests.length}`);

  // ...and it is offerable again, which is what "back to not-started" means.
  await cmd(`QUEST ACCEPT ${PROBE_QUEST}`);
  const reaccepted = await waitForJournal((j) => j.running.quests.length > 0);
  check('an abandoned quest can be started again',
    reaccepted?.running.quests.length === 1,
    `running=${reaccepted?.running.quests.length}`);

  // The objective is a talk_to, so one conversation advances it — the counter
  // path (C1) driving the panel, end to end.
  await cmd(`WARP ${NEAR_EMBERKEEPER}`);
  await page.waitForTimeout(20_000); // camera + position settle across the warp (§20)
  // The warp point is NEAR the Emberkeeper, not inside its ~1-unit talk sensor:
  // walk in until the badge lights, then stop (chunk3b-interact's rule).
  const inRange = await walkUntilBadge('s');
  // ⚑ HOLD E, do not tap it: the interact key is edge-triggered from
  // Controls.update, whose Tock clock is rAF-driven, and a headless page's rAF
  // is throttled far below the nominal 33 ms — a short press falls between two
  // samples and nothing fires, which reads exactly like a broken objective.
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down('e');
  await page.waitForTimeout(1400);
  await page.keyboard.up('e');
  await page.waitForTimeout(1500);

  // The precondition that makes this the subject (verify rule 5): if no
  // conversation opened, the talk never happened and the objective was never
  // asked to advance — that is an inconclusive venue, not a journal failure.
  const talked = await page.evaluate(() =>
    !document.getElementById('conversation')?.classList.contains('hidden'));
  void inRange;

  const afterTalk = talked ? await waitForJournal((j) => j.completed.quests.length > 0, 20_000) : null;
  if (!talked) {
    skip('the objective auto-advances off the talk and completes the quest',
      'INCONCLUSIVE — the conversation never opened, so no talk event was produced. ' +
      'Restart the server (conversants wander) and re-run this script alone.');
  } else {
  const completeBanner = await banner();
  check('the objective auto-advances off the talk and completes the quest',
    afterTalk?.completed.quests.length === 1 && afterTalk?.running.quests.length === 0,
    `completed=${afterTalk?.completed.quests.length}, running=${afterTalk?.running.quests.length}`);

  check('the completed quest carries BOTH entries, in the order walked (L6)',
    JSON.stringify(afterTalk?.completed.quests[0]?.entries) === JSON.stringify([seekProse, spokenProse]),
    `entries: ${JSON.stringify(afterTalk?.completed.quests[0]?.entries)}`);

  check('a completed quest cannot be abandoned (D13)',
    afterTalk?.completed.quests[0]?.hasAbandon === false,
    `abandon row present=${afterTalk?.completed.quests[0]?.hasAbandon}`);

  check('completion pings its own banner (D17)',
    /quest complete/i.test(completeBanner),
    `banner "${completeBanner}"`);
  }
}

await page.screenshot({ path: `/tmp/chunkC3-journal-${label}.png` });

console.log('\nlabel :', label);
for (const r of results) console.log(`${r.skip ? 'SKIP' : r.pass ? 'PASS' : 'FAIL'}  ${r.check}\n        ${r.detail}`);
console.log('\nwebgl ctx losses :', consoleErrors.filter((t) => t.includes('[webgl] world context lost')).length);
console.log('console errors   :', consoleErrors.length);
for (const e of consoleErrors.slice(0, 5)) console.log('   ·', e);

await browser.close();
process.exit(results.some((r) => !r.skip && !r.pass) ? 1 : 0);
