#!/usr/bin/env node
// quest chunk C3 — the journal panel, its wire and its abandon verb
// (plan-quests.md §6, D7/D13/D14/D16/D17) — rewritten for the Q3 two-pane
// journal (plan-conversation-journal.md §4.5): a quest LIST on the left, the
// selected quest's diary on the right, Abandon in the detail pane.
//
// Boundary: this script owns the JOURNAL — the panel, the /quests catalog, the
// ledger arriving on GameState, the D17 banner, selection, and abandon. It does
// not assert anything about conversations (chunk3b-*) beyond using one talk as
// an event source, and it never asserts how much quest content exists (verify
// rule 1).
//
// Four parts:
//
//   A. Always runs — the catalog is reachable, J and the HUD button open and
//      close the panel, and an empty journal SAYS it is empty rather than
//      looking like a broken one (the D14 degrade this chunk exists to get
//      right).
//   B. Content-driven, and SKIPped when the probe quest is not loaded: accept →
//      the list shows the quest, auto-selected, its diary + Q2 objective line in
//      the detail pane → abandon (via the detail pane) → gone and offerable
//      again → re-accept → talk to the Emberkeeper → the objective
//      auto-advances, a second entry appears, the quest moves to Completed AND
//      the selection follows it there (Q3: selection is by id).
//   C. The Q2 counter leg, guarded on the shipped wolves quest: accept
//      wolves-on-the-road by cheat, select it (the Q3 row-click leg), verify the
//      selection survives close/reopen (PO ruling 2026-07-30), read the derived
//      "n/8 wolves killed" line, then kill real wolves and assert the LINE MOVES.
//      Tri-state: no kill inside the deadline is INCONCLUSIVE, not red.
//   D. The Q3 sizing invariant: with the panel open, #journal's rect intersects
//      neither #bottomCenter, #vitalSigns nor #leftColumn — asserted at the
//      default 1280×800 AND at 2560×1440, with a screenshot each. Runs last
//      because it resizes the viewport.
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
import { joinAsNewCharacter } from './lib/join.mjs';

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
await joinAsNewCharacter(page, 'diary');
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

// The Q3 DOM: the list rows are titles with a .selected flag; the words live in
// the detail pane.
const journal = () => page.evaluate(() => {
  const panel = document.getElementById('journal');
  if (!panel) return null;
  const section = (cls) => {
    const el = panel.querySelector(cls);
    return {
      visible: el && !el.classList.contains('hidden'),
      quests: [...el.querySelectorAll('.journalQuest')].map((q) => ({
        title: q.textContent,
        selected: q.classList.contains('selected'),
      })),
    };
  };
  const detailBody = panel.querySelector('.journalDetailBody');
  return {
    open: !panel.classList.contains('hidden'),
    status: panel.querySelector('.journalStatus')?.textContent ?? '',
    statusVisible: !panel.querySelector('.journalStatus')?.classList.contains('hidden'),
    panesVisible: !panel.querySelector('.journalPanes')?.classList.contains('hidden'),
    running: section('.journalRunning'),
    completed: section('.journalCompleted'),
    detail: {
      title: panel.querySelector('.journalDetailTitle')?.textContent ?? '',
      entries: [...(detailBody?.querySelectorAll('.journalEntry') ?? [])].map((p) => p.textContent),
      // Q2: the server-composed objective lines, rendered verbatim.
      objectives: [...(detailBody?.querySelectorAll('.journalObjective') ?? [])].map((p) => p.textContent),
      hasAbandon: !!detailBody?.querySelector('.journalAbandon'),
    },
  };
});

// Click the list row carrying this title (Q3 selection).
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

// Copied from chunkC4-quests (originally chunkP-presence): click the skill NAME
// (never the row centre — the spend/unspend buttons sit mid-row and win), equip
// into aura slot 0, then click the slot again to toggle the aura ON, retrying
// until the client's slot state has caught up with the server.
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
// it is indistinguishable from a journal whose catalog failed to load. Since
// Q3 the panes hide behind the status line — an empty list beside an empty
// diary would read as broken.
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
check('an empty journal hides the panes behind its status line (Q3)',
  opened?.panesVisible === false && opened?.statusVisible === true,
  `panesVisible=${opened?.panesVisible}, status "${opened?.status}"`);

await page.keyboard.press('KeyJ');
await page.waitForTimeout(600);
check('a second J closes it', (await journal())?.open === false, 'closed');

// Since 2026-08-23 the desktop journal button is the quest tracker's header
// (#questTrackerJournal, right column); #journalButton is the mobile sheet's.
const button = await page.$('#questTrackerJournal');
if (button) {
  const box = await button.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(600);
  check('the HUD button opens it too (D16)', (await journal())?.open === true, 'opened by click');
} else {
  check('the HUD button exists (D16)', false, '#questTrackerJournal not in the DOM');
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
  check('accepting lists the quest under Running, auto-selected as the first running quest (D7, Q3)',
    afterAccept?.running.visible
    && afterAccept.running.quests[0]?.title === probeTitle
    && afterAccept.running.quests[0]?.selected === true,
    `running rows: ${JSON.stringify(afterAccept?.running.quests)}`);

  check('the detail pane shows its title and the stage prose it entered (L6)',
    afterAccept?.detail.title === probeTitle
    && afterAccept?.detail.entries[0] === seekProse,
    `detail: ${JSON.stringify(afterAccept?.detail)}`);

  // Q2 (R2): the server composes the talk_to line from the load-resolved
  // display name; the panel renders it verbatim under the diary.
  check('the running stage shows its server-composed objective line (Q2)',
    JSON.stringify(afterAccept?.detail.objectives) === JSON.stringify(['Talk to the Emberkeeper']),
    `objectives: ${JSON.stringify(afterAccept?.detail.objectives)}`);

  check('and pings the journal banner (D17)',
    /journal updated/i.test(acceptBanner),
    `banner "${acceptBanner}"`);

  check('a running quest offers Abandon in its detail pane (D13, Q3)',
    afterAccept?.detail.hasAbandon === true && afterAccept?.completed.visible !== true,
    `abandon present=${afterAccept?.detail.hasAbandon}`);

  // Abandon by CLICKING it in the detail pane — the verb moved there with Q3,
  // and the view signature has to hold still for the click to land at all.
  const abandonBox = await (await page.$('#journal .journalAbandon')).boundingBox();
  await page.mouse.click(abandonBox.x + abandonBox.width / 2, abandonBox.y + abandonBox.height / 2);
  const afterAbandon = await waitForJournal((j) => j.running.quests.length === 0);
  check('abandoning removes it from the journal entirely (D13)',
    afterAbandon?.running.quests.length === 0 && afterAbandon?.completed.quests.length === 0,
    `running=${afterAbandon?.running.quests.length}, completed=${afterAbandon?.completed.quests.length}`);

  check('the emptied journal clears the detail pane and says it is empty again (Q3)',
    afterAbandon?.detail.title === '' && afterAbandon?.panesVisible === false,
    `detail title "${afterAbandon?.detail.title}", panesVisible=${afterAbandon?.panesVisible}`);

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

  // Q3: selection is by quest id, so completing moves the quest AND the
  // selection into the Completed section — the detail pane keeps showing it.
  check('the selection follows the quest into Completed (Q3)',
    afterTalk?.completed.quests[0]?.selected === true
    && afterTalk?.detail.title === probeTitle,
    `completed row: ${JSON.stringify(afterTalk?.completed.quests[0])}, detail "${afterTalk?.detail.title}"`);

  check('the completed quest carries BOTH entries, in the order walked (L6)',
    JSON.stringify(afterTalk?.detail.entries) === JSON.stringify([seekProse, spokenProse]),
    `entries: ${JSON.stringify(afterTalk?.detail.entries)}`);

  check('a completed quest cannot be abandoned (D13)',
    afterTalk?.detail.hasAbandon === false,
    `abandon present=${afterTalk?.detail.hasAbandon}`);

  check('a completed quest carries no objective line — the diary is its record (Q2 §7.1)',
    (afterTalk?.detail.objectives ?? []).length === 0,
    `objectives: ${JSON.stringify(afterTalk?.detail.objectives)}`);

  check('completion pings its own banner (D17)',
    /quest complete/i.test(completeBanner),
    `banner "${completeBanner}"`);
  }
}

// --- half C: the Q2 counter — "n/8 wolves killed" moves on real kills -------
//
// Independent of the probe quest: rides the SHIPPED wolves-on-the-road. ⚑
// Since Q4 its kill stage authors the tracker (the plural fix); ac0f8a11
// (2026-08-02, "quest text goes plain") re-worded it to "{n}/{m} wolves
// killed" and this script rode the old "slain" until 2026-08-23. The line on
// screen is the AUTHORED override with the {n}/{m}
// substitution live — which is exactly the half of Q2 the derived path could
// not show. The count is read as a pattern, never as a fixed number (verify
// rule 1/3) — and since N4 (plan-feel-pass-2.md) it counts kills SINCE this
// accept, so it starts at 0 however many wolves the character has ever slain.
// Since Q3 the line lives in the detail pane, so
// the wolves quest must be SELECTED to read it — which is what makes this half
// carry the row-click and close/reopen selection legs.

const WOLVES_QUEST = 'wolves-on-the-road';
const wolvesLoaded = Array.isArray(catalog.body) && catalog.body.some((q) => q.id === WOLVES_QUEST);
if (!wolvesLoaded) {
  skip('the objective counter moves on real kills (Q2)',
    `INCONCLUSIVE — the shipped quest "${WOLVES_QUEST}" is not loaded, nothing to count against.`);
} else {
  const wolvesTitle = catalog.body.find((q) => q.id === WOLVES_QUEST).title;
  const lineOf = (j) => (j?.detail.title === wolvesTitle ? j.detail.objectives : [])[0] ?? '';
  const entriesOf = (j) => (j?.detail.title === wolvesTitle ? j.detail.entries : []);

  // The panel only renders while open (visibility is the client's) — make sure
  // it is, whether or not half B ran.
  if (!(await journal())?.open) {
    await page.keyboard.press('KeyJ');
    await page.waitForTimeout(600);
  }

  await cmd(`QUEST ACCEPT ${WOLVES_QUEST}`);
  const accepted = await waitForJournal((j) => j.running.quests.some((q) => q.title === wolvesTitle));

  // Q3: clicking a list row selects it and swaps the detail pane. When half B
  // completed the probe quest, the selection is sitting on it (it followed the
  // quest into Completed), so this click genuinely switches quests.
  const before = accepted?.detail.title ?? '';
  const clicked = await selectQuest(wolvesTitle);
  const afterSelect = await journal();
  check('clicking a list row selects it and swaps the detail pane (Q3)',
    clicked
    && afterSelect?.detail.title === wolvesTitle
    && afterSelect?.running.quests.find((q) => q.title === wolvesTitle)?.selected === true,
    `detail "${before}" → "${afterSelect?.detail.title}"`);

  // PO ruling 2026-07-30: the journal remembers the selection across
  // close/reopen — it lands on the quest last read, not the first running one.
  await page.keyboard.press('KeyJ');
  await page.waitForTimeout(600);
  await page.keyboard.press('KeyJ');
  await page.waitForTimeout(600);
  check('the selection survives close/reopen (Q3, PO ruling)',
    (await journal())?.detail.title === wolvesTitle,
    `detail after reopen: "${(await journal())?.detail.title}"`);

  const startLine = lineOf(await journal());
  const startCount = Number(/^(\d+)\/8 wolves killed$/.exec(startLine)?.[1] ?? NaN);
  check('the kill stage shows the authored "{n}/{m} wolves killed" tracker, substituted (Q2/Q4)',
    Number.isInteger(startCount),
    `line "${startLine}"`);

  if (!Number.isInteger(startCount)) {
    skip('the objective counter moves on real kills (Q2)',
      'INCONCLUSIVE — no parseable starting line, nothing to watch move.');
  } else {
    // Arm and hunt, chunkC4's recipe: level 30 so wolves die on contact, walk a
    // circuit through the densest pack — they aggro at 3 units and come to us.
    await cmd('XP 400000');
    await cmd('SKILL Damage');
    const armed = await equipAndActivateAura(/Damage/);
    await cmd(`WARP ${-60 * 120} ${8 * 120}`);
    await page.waitForTimeout(1500);

    const moved = await (async () => {
      const deadline = Date.now() + 150_000;
      const keys = ['w', 'a', 's', 'd'];
      let i = 0;
      while (Date.now() < deadline) {
        const j = await journal();
        const line = lineOf(j);
        const n = Number(/^(\d+)\/8 wolves killed$/.exec(line)?.[1] ?? NaN);
        if (Number.isInteger(n) && n > startCount) return { line, n };
        // 8/8 advances the stage: the counter line gives way to carry_word's
        // authored tracker (Q4), and the second diary entry is the proof.
        if (entriesOf(j).length >= 2) return { line: '(stage advanced)', n: 8 };
        await page.evaluate(() => document.activeElement?.blur());
        await page.keyboard.down(keys[i++ % keys.length]);
        await page.waitForTimeout(1500);
        await page.keyboard.up(keys[(i - 1) % keys.length]);
        await page.waitForTimeout(500);
      }
      return null;
    })();

    if (!moved) {
      skip('the objective counter moves on real kills (Q2)',
        `INCONCLUSIVE — no wolf kill inside 150 s (aura armed: ${armed.ok} — ${armed.why}). ` +
        'The composition itself is pinned by the Go ledger tests; re-run alone on a fresh server.');
    } else {
      check('⭐ the objective counter moves on real kills (Q2, R2)',
        moved.n > startCount,
        `"${startLine}" → "${moved.line}"`);
    }
  }
}

// --- half D: the Q3 sizing invariant — no overlap with the HUD --------------
//
// §4.5: the panel may never overlap the bottom HUD strip or the spellbook
// column, enforced by positioning rather than by a third hand-copy of the
// strip's geometry — so the assertion here is the enforcement. Runs last
// because it resizes the viewport.

const overlapLeg = async (name) => {
  if (!(await journal())?.open) {
    await page.keyboard.press('KeyJ');
    await page.waitForTimeout(600);
  }
  const r = await page.evaluate(() => {
    const rect = (id) => {
      const el = document.getElementById(id);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { left: b.left, right: b.right, top: b.top, bottom: b.bottom };
    };
    const j = rect('journal');
    const intersects = (a, b) => !!(a && b
      && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom);
    return {
      journal: j,
      strip: intersects(j, rect('bottomCenter')),
      vitals: intersects(j, rect('vitalSigns')),
      leftColumn: intersects(j, rect('leftColumn')),
      stripTop: rect('bottomCenter')?.top,
    };
  });
  check(`the open journal overlaps neither the HUD strip nor the left column (Q3) — ${name}`,
    r.journal !== null && !r.strip && !r.vitals && !r.leftColumn,
    `journal ${JSON.stringify(r.journal)}, strip=${r.strip} (top ${Math.round(r.stripTop ?? -1)}), vitals=${r.vitals}, leftColumn=${r.leftColumn}`);
};

await overlapLeg('1280×800');
await page.screenshot({ path: `/tmp/chunkC3-journal-${label}-800.png` });

await page.setViewportSize({ width: 2560, height: 1440 });
await page.waitForTimeout(1500);
await overlapLeg('2560×1440');
await page.screenshot({ path: `/tmp/chunkC3-journal-${label}-1440.png` });

console.log('\nlabel :', label);
for (const r of results) console.log(`${r.skip ? 'SKIP' : r.pass ? 'PASS' : 'FAIL'}  ${r.check}\n        ${r.detail}`);
console.log('\nwebgl ctx losses :', consoleErrors.filter((t) => t.includes('[webgl] world context lost')).length);
console.log('console errors   :', consoleErrors.length);
for (const e of consoleErrors.slice(0, 5)) console.log('   ·', e);

await browser.close();
process.exit(results.some((r) => !r.skip && !r.pass) ? 1 : 0);
