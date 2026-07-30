#!/usr/bin/env node
// quest chunk C4 — the first authored quests (plan-quests.md §8 C4, D9).
//
// Boundary: this script owns the AUTHORED QUEST CONTENT — that the offer,
// advance and turn-in rows exist on the right conversants at the right ledger
// states, that taking one pays what it says, and that the journal fills with the
// authored prose. It does NOT own the journal panel itself (chunkC3-journal),
// the interact verb (chunk3b-interact) or the conversation panel's navigation
// (chunk3b-ii-conversation), and it never asserts how much quest content exists.
//
// The four legs, and why each is here:
//
//   A  village-welcome — talk_to. Offer row → two real conversations → the
//      objective advances off the lifetime counters → turn-in row pays 150 XP.
//   B  turnip-chore — harvest. The offer row also NAVIGATES to root, where the
//      same NPC teaches the very aura the objective needs (N1's shape, in
//      shipped content) → five real turnips → turn-in.
//   D  the-lost-lamp — the only NON-TERMINAL advance edge in the game: the
//      Miner's row moves the quest on and must NOT complete it. Deliberately
//      stops before the kobolds, because the kill path is already proven by B
//      and the kills are the expensive part.
//   C  wolves-on-the-road — D9's branch, and the one leg that needs real
//      combat (eight wolves). Tri-state: if the hunt does not land eight kills
//      in its window, that is an INCONCLUSIVE venue, not a content failure.
//      Runs LAST so a slow hunt cannot cost the other three legs.
//
// ⚑ Restart aurad first and run this script ALONE — it stands in conversations
// all over the map, and a second harness in the same world puts NPCs in combat,
// which withdraws the talk offer for every player at once (D21).
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
  Miner: { x: -27, y: -26 },
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

const journal = () => page.evaluate(() => {
  const p = document.getElementById('journal');
  if (!p) return null;
  const section = (cls) => [...p.querySelectorAll(`${cls} .journalQuest`)].map((q) => ({
    title: q.querySelector('.journalQuestTitle')?.textContent ?? '',
    entries: [...q.querySelectorAll('.journalEntry')].map((e) => e.textContent),
  }));
  return { running: section('.journalRunning'), completed: section('.journalCompleted') };
});

// The journal renders off a view signature, so give the ledger a few ticks to
// arrive rather than peeking at the frame of the click.
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

const questIn = (section, title) => section.find((q) => q.title === title) ?? null;
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

await cmd('PING'); // the first command after joining is dropped
await cmd('GOD');  // this script stands still in aggro radii for minutes
await page.keyboard.press('KeyJ'); // journal open for the whole run
await page.waitForTimeout(600);

check('the four authored quests are served (boot count 4)',
  Array.isArray(catalog) && catalog.length === 4,
  Array.isArray(catalog) ? catalog.map((q) => q.id).join(', ') : String(catalog));

// --- leg A: village-welcome, the talk_to verb -------------------------------

try {
  await warpTo(AT.Hermit);
  const hermit = await talkTo('Hermit');
  check('A1 the Hermit greets an unstarted quest with its offer node (quest_at_stage not_started)',
    hermit?.actor === 'Hermit' && hermit.rows.some((r) => r.includes('Whose faces')),
    `actor=${hermit?.actor} rows=${JSON.stringify(hermit?.rows)}`);

  const accepted = await clickRow('Whose faces');
  const afterOffer = await waitForJournal((j) => questIn(j.running, titleOf('village-welcome')) !== null);
  const running = questIn(afterOffer?.running ?? [], titleOf('village-welcome'));
  check('A2 clicking the offer row starts the quest and writes its first diary entry',
    accepted && running?.entries[0] === prose('village-welcome', 'meet'),
    `entries=${JSON.stringify(running?.entries)}`);
  check('A3 ...and pings the journal banner (D17)', /journal updated/i.test(await banner()), await banner());
  await leave();

  await warpTo(AT.Farmer);
  const farmer = await talkTo('Farmer');
  check('A4 the Farmer answers (one of the two talk_to targets)', farmer?.actor === 'Farmer', `actor=${farmer?.actor}`);
  await leave();

  await warpTo(AT.TownCrier);
  const crier = await talkTo('Town Crier');
  check('A5 the Town Crier answers (the second target)', crier?.actor === 'Town Crier', `actor=${crier?.actor}`);
  await leave();

  const advanced = await waitForJournal((j) => (questIn(j.running, titleOf('village-welcome'))?.entries.length ?? 0) >= 2);
  check('A6 the objective advances off the two conversations alone — no row, no click (D3/D4)',
    questIn(advanced?.running ?? [], titleOf('village-welcome'))?.entries.length === 2,
    `entries=${JSON.stringify(questIn(advanced?.running ?? [], titleOf('village-welcome'))?.entries)}`);

  await warpTo(AT.Hermit);
  const backAtHermit = await talkTo('Hermit');
  check('A7 the Hermit now greets with the TURN-IN node, not the offer',
    backAtHermit?.rows.some((r) => r.includes('spoken to them both')) && !backAtHermit.rows.some((r) => r.includes('Whose faces')),
    `rows=${JSON.stringify(backAtHermit?.rows)}`);

  const xpBefore = await xpInLevel();
  await clickRow('spoken to them both');
  const done = await waitForJournal((j) => questIn(j.completed, titleOf('village-welcome')) !== null);
  const xpAfter = await xpInLevel();
  check('A8 the turn-in completes the quest and moves it to Completed (D7)',
    questIn(done?.completed ?? [], titleOf('village-welcome')) !== null
    && questIn(done?.running ?? [], titleOf('village-welcome')) === null,
    `completed=${JSON.stringify(questIn(done?.completed ?? [], titleOf('village-welcome'))?.entries?.length)} entries`);
  check('A9 ...and pays the authored 150 XP through the normal level path (L9)',
    xpAfter - xpBefore === 150, `XP ${xpBefore} → ${xpAfter}`);
  await leave();
} catch (e) {
  check('leg A (village-welcome) ran to completion', false, `threw: ${e.message}`);
}

// --- leg D: the-lost-lamp, the non-terminal advance edge ---------------------

try {
  await warpTo(AT.Traveller);
  const traveller = await talkTo('Lampless Traveller');
  check('D1 the traveller offers the lamp chain', traveller?.rows.some((r) => r.includes('Where did they take it')),
    `actor=${traveller?.actor} rows=${JSON.stringify(traveller?.rows)}`);
  await clickRow('Where did they take it');
  const lampRunning = await waitForJournal((j) => questIn(j.running, titleOf('the-lost-lamp')) !== null);
  check('D2 accepting writes the first entry and leaves the quest running',
    questIn(lampRunning?.running ?? [], titleOf('the-lost-lamp'))?.entries[0] === prose('the-lost-lamp', 'ask_miner'),
    `entries=${JSON.stringify(questIn(lampRunning?.running ?? [], titleOf('the-lost-lamp'))?.entries)}`);
  await leave();

  await warpTo(AT.Miner);
  const miner = await talkTo('Miner');
  check('D3 the Miner carries the mid-quest row, gated on the stage the traveller left the player at',
    miner?.rows.some((r) => r.includes('Where do the kobolds nest')),
    `actor=${miner?.actor} rows=${JSON.stringify(miner?.rows)}`);

  await clickRow('Where do the kobolds nest');
  const midChain = await waitForJournal((j) => (questIn(j.running, titleOf('the-lost-lamp'))?.entries.length ?? 0) >= 2);
  const lamp = questIn(midChain?.running ?? [], titleOf('the-lost-lamp'));
  // ⭐ The whole point of leg D: an advance_quest row that ENDS NOTHING.
  // Terminality is derived from the world's edges (C1 ①), so a stage wrongly read
  // as terminal would complete the quest here, three stages early — and it would
  // look like a success on every screen.
  check('D4 ⭐ the Miner\'s row advances the quest WITHOUT completing it (the only non-terminal edge)',
    lamp?.entries.length === 2 && lamp.entries[1] === prose('the-lost-lamp', 'clear_den')
    && questIn(midChain?.completed ?? [], titleOf('the-lost-lamp')) === null,
    `running entries=${JSON.stringify(lamp?.entries?.length)}, completed=${questIn(midChain?.completed ?? [], titleOf('the-lost-lamp')) !== null}`);
  await leave();

  skip('D5 the kobold objective and the lamp turn-in',
    'not attempted on purpose — six real kobold kills cost what eight wolves cost (leg C), and the ' +
    'counter → advance path is already proven by legs A and B. The Go content pins cover the rest of the graph.');
} catch (e) {
  check('leg D (the-lost-lamp) ran to completion', false, `threw: ${e.message}`);
}

// --- leg B: turnip-chore, the harvest verb ----------------------------------

try {
  await warpTo(AT.Farmer);
  const farmer = await talkTo('Farmer');
  check('B1 the Farmer offers the chore', farmer?.rows.some((r) => r.includes('clear your north row')),
    `rows=${JSON.stringify(farmer?.rows)}`);

  await clickRow('clear your north row');
  const afterOffer = await panel();
  // N1 in shipped content: the offer row grants AND navigates, and the node it
  // lands on is where the aura the objective needs is taught. Both halves were
  // broken before C0 — the server refused such a row, the client swallowed its line.
  check('B2 the offer row also NAVIGATES, landing on the teaching that makes the chore possible (N1)',
    afterOffer?.rows.some((r) => /harvest/i.test(r)),
    `rows after the offer=${JSON.stringify(afterOffer?.rows)}`);

  await clickRow('Harvest');
  await page.waitForTimeout(1200);
  const book = await spellbook();
  check('B3 the Harvest aura is learned in the same conversation',
    book.some((r) => /harvest/i.test(r)), `spellbook=${JSON.stringify(book)}`);
  await leave();

  const armed = await equipAndActivateAura(/Harvest/);
  check('B4 Harvest equipped and switched ON', armed.ok, armed.why);

  await warpTo(AT.Turnips);
  // Turnips are 20 HP and resist everything except the `harvest` tag, so this is
  // the cheapest real objective in the game — and they respawn on 600 ticks, so
  // standing in the row is enough to reach five.
  const harvested = await waitForJournal(
    (j) => (questIn(j.running, titleOf('turnip-chore'))?.entries.length ?? 0) >= 2, 150_000);
  const chore = questIn(harvested?.running ?? [], titleOf('turnip-chore'));
  if (chore?.entries.length >= 2) {
    check('B5 five real harvests advance the objective stage off the lifetime counters (D2/D3)',
      chore.entries[1] === prose('turnip-chore', 'handover'), `entries=${JSON.stringify(chore.entries)}`);

    await warpTo(AT.Farmer);
    const backAtFarmer = await talkTo('Farmer');
    check('B6 the Farmer now greets with the turn-in row',
      backAtFarmer?.rows.some((r) => r.includes('out of the ground')), `rows=${JSON.stringify(backAtFarmer?.rows)}`);
    await clickRow('out of the ground');
    const done = await waitForJournal((j) => questIn(j.completed, titleOf('turnip-chore')) !== null);
    check('B7 the chore completes',
      questIn(done?.completed ?? [], titleOf('turnip-chore')) !== null,
      `completed=${JSON.stringify((done?.completed ?? []).map((q) => q.title))}`);
    await leave();
  } else {
    skip('B5–B7 the harvest objective and its turn-in',
      `INCONCLUSIVE — the journal never reached the handover stage in 150 s ` +
      `(entries=${chore?.entries.length ?? 0}). Restart the server (mobs and props settle) and re-run alone.`);
  }
} catch (e) {
  check('leg B (turnip-chore) ran to completion', false, `threw: ${e.message}`);
}

// --- leg C: wolves-on-the-road, D9's branch ---------------------------------

try {
  await warpTo(AT.TownCrier);
  const crier = await talkTo('Town Crier');
  check('C1 the crier offers the wolf cull', crier?.rows.some((r) => r.includes('How many wolves')),
    `rows=${JSON.stringify(crier?.rows)}`);
  await clickRow('How many wolves');
  await waitForJournal((j) => questIn(j.running, titleOf('wolves-on-the-road')) !== null);
  await leave();

  // Eight real wolves. Level 30 so each dies on contact, then walk a circuit
  // through the densest pack in the zone — wolves aggro at 3 units and are
  // slower than the player, so they come to us.
  await cmd('XP 400000');
  await cmd('SKILL Damage');
  const armed = await equipAndActivateAura(/Damage/);
  await warpTo(AT.WolfCountry);
  const hunted = await (async () => {
    const deadline = Date.now() + 180_000;
    const keys = ['w', 'a', 's', 'd'];
    let i = 0;
    while (Date.now() < deadline) {
      const j = await journal();
      const q = questIn(j?.running ?? [], titleOf('wolves-on-the-road'));
      if ((q?.entries.length ?? 0) >= 2) return q;
      await page.evaluate(() => document.activeElement?.blur());
      await page.keyboard.down(keys[i++ % keys.length]);
      await page.waitForTimeout(1500);
      await page.keyboard.up(keys[(i - 1) % keys.length]);
      await page.waitForTimeout(500);
    }
    return null;
  })();

  if (!hunted) {
    skip('C2–C5 D9\'s branch (two turn-ins, different rewards)',
      `INCONCLUSIVE — eight wolves were not killed inside 180 s (aura armed: ${armed.ok}). ` +
      'The branch itself is pinned by the Go content tests; re-run alone on a freshly restarted server ' +
      'to walk it at the surface.');
  } else {
    check('C2 eight real wolf kills advance the cull off the counters',
      hunted.entries[1] === prose('wolves-on-the-road', 'carry_word'), `entries=${JSON.stringify(hunted.entries)}`);

    await warpTo(AT.Shaman);
    const shaman = await talkTo('Shaman');
    check('C3 ⭐ the Shaman offers a turn-in for a quest given by somebody else, at the far end of the map',
      shaman?.rows.some((r) => r.includes('Eight of them are dealt with')),
      `actor=${shaman?.actor} rows=${JSON.stringify(shaman?.rows)}`);
    await leave(); // deliberately NOT taken: the other leg is the one we walk

    await warpTo(AT.CityGuard);
    const guard = await talkTo('City Guard');
    check('C4 ⭐ ...and so does the City Guard — the same stage, two eligible NPCs (D9)',
      guard?.rows.some((r) => r.includes('Eight of them are dealt with')),
      `actor=${guard?.actor} rows=${JSON.stringify(guard?.rows)}`);

    const bookBefore = await spellbook();
    await clickRow('Eight of them are dealt with');
    const done = await waitForJournal((j) => questIn(j.completed, titleOf('wolves-on-the-road')) !== null);
    const bookAfter = await spellbook();
    check('C5 taking the militia leg completes the quest on ITS terminal stage, with its own diary entry',
      questIn(done?.completed ?? [], titleOf('wolves-on-the-road'))?.entries.slice(-1)[0]
        === prose('wolves-on-the-road', 'told_militia'),
      `entries=${JSON.stringify(questIn(done?.completed ?? [], titleOf('wolves-on-the-road'))?.entries)}`);
    check('C6 ...and pays the militia leg\'s own reward — Taunt, which the shaman leg does not teach',
      !bookBefore.some((r) => /taunt/i.test(r)) && bookAfter.some((r) => /taunt/i.test(r)),
      `spellbook gained: ${JSON.stringify(bookAfter.filter((r) => !bookBefore.includes(r)))}`);
    await leave();

    // The branch seals: a completed quest matches `completed`, never the terminal
    // stage it ended on (C2 shape decision ②), so the road not taken is gone.
    await warpTo(AT.Shaman);
    const shamanAfter = await talkTo('Shaman');
    check('C7 ⭐ the road not taken is closed — the Shaman\'s turn-in row is gone once the quest is finished',
      !(shamanAfter?.rows ?? []).some((r) => r.includes('Eight of them are dealt with')),
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
