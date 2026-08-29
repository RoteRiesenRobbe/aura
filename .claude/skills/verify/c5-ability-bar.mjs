#!/usr/bin/env node
// The ONE ability bar (plan-ui-pass.md §5 C5).
//
// ⚑ NOT `c5-bars.mjs` - that name belongs to an earlier pass and still runs.
//
// Boundary: this script owns C5's structural + state claims - one container
// holding both slot families with a divider between them, icon-only slots in
// the board's 52px anatomy, and the four slot STATES the board draws (active
// rim, empty dim, cooldown sweep, pending-equip). What a slot's tooltip SAYS is
// `round4-tooltip`; the book that feeds it is `c3-spellbook`; the glyph
// vocabulary itself is `c4-skill-icons`. Colour and taste are the PO's call at
// the in-game look.
//
// Legs:
//   1. ONE bar: #auraLoadout, the divider and #cooldownLoadout inside
//      #abilityBar, laid out left-to-right on one band; utility is a SEPARATE
//      island beside it, not inside
//   2. the slot anatomy: a 52px circle, hotkey chip present, .slotLabel still
//      RENDERED and still holding the name (the harness contract) but taking no
//      space
//   3. every FILLED slot draws a glyph token, never the letter fallback; an
//      EMPTY slot is dimmed and carries no token
//   4. the active aura wears the wooden rim (D12) and the ember dot
//  4b. the ember dot keeps BEATING over a wall-clock window, and its pulse
//      class does not stay stuck on the element (the C5-look pip defect)
//   5. firing a cooldown draws the sweep + whole seconds AT GLYPH SCALE, the
//      sweep RUNS DOWN, and both clear when the cooldown ends
//   6. a pending equip highlights the circles without blanking the active rim
//   7. the utility island: both buttons carry glyphs, Camp carries its charge
//      chip, both keep their .slotLabel
//   8. the passive island: tokens + .slotLabel, anchored BELOW the open
//      spellbook and near the bottom of the screen (D1)
//   9. #actionBars.flightLocked still dims the whole family and keeps pointer
//      events (CSS contract only - a real flight is `c3-flight-client`)
//  10. mobile (D2): the tile row survives, hotkeys stay hidden, tiles carry
//      glyphs, the utility thumb column is still fixed at the right edge
//
// ⚑ Restart the server first, and run this script ALONE.
//
// Usage: node .claude/skills/verify/c5-ability-bar.mjs [label] [url]
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');
import { joinAsNewCharacter } from './lib/join.mjs';
import { openSpellbook, closeSpellbook, showSkillRow } from './lib/spellbook.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const label = process.argv[2] || 'run';
const url = process.argv[3] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

// Shockwave is the shortest cooldown in the catalog (240 ticks = 8 s) and needs
// no target, which is what makes leg 5's "watch it run down AND clear" leg
// affordable. Strong is the passive; the seeded Damage aura is already in aura
// slot 0, so nothing has to be equipped for the aura legs.
const CD_SKILL = 'Shockwave';
const PASSIVE_SKILL = 'Strong';

const results = [];
const check = (name, pass, detail) => results.push({ check: name, pass, detail });
const skip = (name, detail) => results.push({ check: name, skip: true, detail });

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const consoleErrors = [];

function wire(page) {
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
}

const clickEl = async (page, selector) => {
  const box = await page.locator(selector).first().boundingBox().catch(() => null);
  if (!box) return false;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(400);
  return true;
};

// ⚑ A spellbook row is clicked NEAR ITS LEFT EDGE, never at its centre: the
// row's right half is `.skillControls` (the +/- spend buttons), so a centred
// click spends a point instead of selecting the skill and the equip that was
// supposed to follow silently never happens. The suite's standing idiom
// (r1-focus-cost, r7-strong, c2-frost-shield all use x + 25).
const clickRow = async (page, selector) => {
  const box = await page.locator(selector).first().boundingBox().catch(() => null);
  if (!box) return false;
  await page.mouse.click(box.x + 25, box.y + box.height / 2);
  await page.waitForTimeout(400);
  return true;
};

// One sample of a slot list, in the shape every leg below reads. Everything
// here is DOM + computed style: no screenshots are asserted on.
const SLOTS = (listSelector) => {
  const list = document.querySelector(listSelector);
  if (!list) return null;
  return [...list.querySelectorAll('li')].map((li) => {
    const cs = getComputedStyle(li);
    const box = li.getBoundingClientRect();
    const token = li.querySelector(':scope > .ink-token');
    const labelEl = li.querySelector(':scope > .slotLabel');
    const labelBox = labelEl?.getBoundingClientRect();
    const pip = li.querySelector(':scope > .beatPip');
    return {
      slot: li.dataset.slot ?? null,
      utility: li.dataset.utility ?? null,
      skillId: li.dataset.skillId ?? null,
      label: labelEl?.textContent?.trim() ?? null,
      // The label must still be IN THE DOM and still hold the name, but must
      // take no layout space - the whole harness contract in two numbers.
      labelRendered: !!labelEl,
      labelBox: labelBox ? { w: Math.round(labelBox.width), h: Math.round(labelBox.height) } : null,
      w: Math.round(box.width),
      h: Math.round(box.height),
      x: Math.round(box.x),
      y: Math.round(box.y),
      radius: cs.borderRadius,
      borderColor: cs.borderTopColor,
      borderWidth: cs.borderTopWidth,
      opacity: Number(cs.opacity),
      boxShadow: cs.boxShadow,
      hasToken: !!token,
      hasSvg: !!token?.querySelector('svg > path'),
      fallback: !!token?.classList.contains('letterFallback'),
      hotkeyShown: (() => {
        const hk = li.querySelector(':scope > .hotkey');
        return hk ? getComputedStyle(hk).display !== 'none' : null;
      })(),
      hotkeyText: li.querySelector(':scope > .hotkey')?.textContent ?? null,
      active: li.classList.contains('activeSlot'),
      onCooldown: li.classList.contains('onCooldown'),
      cdText: li.querySelector(':scope > .cdRemaining')?.textContent ?? null,
      cdSweepShown: (() => {
        const s = li.querySelector(':scope > .cdSweep');
        return s ? getComputedStyle(s).display !== 'none' : null;
      })(),
      cdSweepDeg: (() => {
        const v = li.style.getPropertyValue('--cd-sweep').trim();
        return v ? parseFloat(v) : null;
      })(),
      pipShown: pip ? getComputedStyle(pip).display !== 'none' : null,
      charges: li.querySelector(':scope > .utilityCharges')?.textContent ?? null,
      // The cooldown digits must read at GLYPH scale (PO at the C5 look), and
      // must still fit the circle they sit in - scrollWidth over clientWidth is
      // the overflow the eye would see.
      cdFontSize: (() => {
        const e = li.querySelector(':scope > .cdRemaining');
        return e ? Math.round(parseFloat(getComputedStyle(e).fontSize)) : null;
      })(),
      cdOverflows: (() => {
        const e = li.querySelector(':scope > .cdRemaining');
        return e ? e.scrollWidth > e.clientWidth + 1 : null;
      })(),
      tokenSize: token ? Math.round(token.getBoundingClientRect().width) : null,
    };
  });
};

// ---------------------------------------------------------------- desktop ---

const deskCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await deskCtx.newPage();
wire(page);
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await joinAsNewCharacter(page, 'c5bar');
await page.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
await page.evaluate(() => { const p = document.getElementById('developPanel'); if (p) p.style.display = 'none'; });

const cmd = async (text) => {
  await page.evaluate((t) => {
    const input = document.getElementById('console_command');
    input.value = t;
    document.getElementById('console').dispatchEvent(new Event('submit', { cancelable: true }));
  }, text);
  await page.waitForTimeout(500);
};

await cmd('PING'); // the first command after joining is dropped (harness note)
await cmd('GOD');
await cmd(`SKILL ${CD_SKILL}`);
await cmd(`SKILL ${PASSIVE_SKILL}`);
await page.waitForTimeout(1500);

// --- leg 1: ONE bar ---------------------------------------------------------

const structure = await page.evaluate(() => {
  const bar = document.getElementById('abilityBar');
  const aura = document.getElementById('auraLoadout');
  const cds = document.getElementById('cooldownLoadout');
  const util = document.getElementById('utilityBar');
  const div = bar?.querySelector(':scope > .barDivider');
  const r = (el) => {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
  };
  return {
    barExists: !!bar,
    auraInside: !!bar && !!aura && bar.contains(aura),
    cdInside: !!bar && !!cds && bar.contains(cds),
    dividerInside: !!div,
    utilityOutside: !!bar && !!util && !bar.contains(util),
    utilitySibling: util?.parentElement?.id === 'actionBars',
    listsIntact: !!document.querySelector('#abilityBar #auraSlotList')
      && !!document.querySelector('#abilityBar #cooldownSlotList'),
    aura: r(aura), div: r(div), cds: r(cds), util: r(util), bar: r(bar),
  };
});
check('1 ⭐ ONE bar: both slot families and the divider live inside #abilityBar',
  structure.barExists && structure.auraInside && structure.cdInside
    && structure.dividerInside && structure.listsIntact,
  JSON.stringify({ bar: structure.barExists, aura: structure.auraInside, cd: structure.cdInside, div: structure.dividerInside, lists: structure.listsIntact }));
check('1b the divider sits BETWEEN the two families, all three on one band',
  !!structure.aura && !!structure.div && !!structure.cds
    && structure.aura.x + structure.aura.w <= structure.div.x + 2
    && structure.div.x + structure.div.w <= structure.cds.x + 2
    && Math.abs(structure.aura.y - structure.cds.y) < 8,
  JSON.stringify({ aura: structure.aura, div: structure.div, cds: structure.cds }));
check('1c the utility island is BESIDE the bar, not inside it',
  structure.utilityOutside && structure.utilitySibling
    && !!structure.util && !!structure.bar && structure.util.x >= structure.bar.x + structure.bar.w - 2,
  JSON.stringify({ outside: structure.utilityOutside, sibling: structure.utilitySibling, util: structure.util, bar: structure.bar }));

// ⚑ This leg exists because 20 green legs did NOT catch the bar rendering
// "Aura Slots" and "Cooldowns" as text between the circles: the hide rule was
// written with a child combinator and the titles sit one level deeper. Only a
// human looking at a screenshot found it. Never delete this leg.
const titles = await page.evaluate(() =>
  ['#auraLoadout', '#cooldownLoadout', '#utilityBar', '#passiveLoadout'].map((sel) => {
    const t = document.querySelector(`${sel} .auraLoadoutTitle`);
    return { sel, found: !!t, display: t ? getComputedStyle(t).display : null };
  }));
check('1d icon-only: every panel title in the family is hidden, and still in the DOM',
  titles.every((t) => t.found && t.display === 'none'),
  JSON.stringify(titles));

// --- leg 2: the slot anatomy ------------------------------------------------

const auraSlots = await page.evaluate(SLOTS, '#auraSlotList');
const filled = auraSlots.filter((s) => s.skillId && s.skillId !== '0');
if (filled.length === 0) {
  skip('2 the 52px circle anatomy', 'INCONCLUSIVE - no aura slot holds a skill');
} else {
  check('2 ⭐ a slot is a 52px ink-ringed circle with its hotkey chip',
    auraSlots.every((s) => s.w === 52 && s.h === 52 && /50%/.test(s.radius)
      && s.borderWidth === '3px' && s.hotkeyShown === true),
    JSON.stringify(auraSlots.map((s) => ({ w: s.w, h: s.h, r: s.radius, bw: s.borderWidth, hk: s.hotkeyText, shown: s.hotkeyShown }))));
  check('2b .slotLabel is still RENDERED, still holds the name, and takes NO space',
    auraSlots.every((s) => s.labelRendered && !!s.label && s.labelBox.w <= 1 && s.labelBox.h <= 1),
    JSON.stringify(auraSlots.map((s) => ({ label: s.label, box: s.labelBox }))));
}

// --- leg 3: filled draws a glyph, empty is dim and bare ---------------------

const empties = auraSlots.filter((s) => s.skillId === '0');
check('3 ⭐ a FILLED slot draws a glyph token, never the letter fallback',
  filled.length > 0 && filled.every((s) => s.hasToken && s.hasSvg && !s.fallback),
  JSON.stringify(filled.map((s) => ({ id: s.skillId, name: s.label, svg: s.hasSvg, fb: s.fallback }))));
check('3b an EMPTY slot dims and carries no token (the board\'s 0.55)',
  empties.length > 0 && empties.every((s) => !s.hasToken && s.opacity > 0.4 && s.opacity < 0.7),
  JSON.stringify(empties.map((s) => ({ slot: s.slot, opacity: s.opacity, token: s.hasToken }))));

// --- leg 4: the active aura wears the rim ----------------------------------

await clickEl(page, '#auraSlotList li[data-slot="0"]');
await page.waitForTimeout(900);
const afterActivate = await page.evaluate(SLOTS, '#auraSlotList');
const activeSlot = afterActivate.find((s) => s.active);
check('4 ⭐ the ACTIVE aura wears the wooden rim (D12) and shows the ember dot',
  !!activeSlot
    && /rgb\(138, 90, 43\)/.test(activeSlot.boxShadow)
    && activeSlot.pipShown === true
    && afterActivate.filter((s) => s.pipShown === true).length === 1,
  JSON.stringify({ slot: activeSlot?.slot, pip: activeSlot?.pipShown, shadow: activeSlot?.boxShadow?.slice(0, 90) }));

await page.screenshot({ path: join(here, `c5-bar-${label}-active.png`) });

// --- leg 4b: the metronome keeps BEATING -----------------------------------
//
// The ember dot pulses once per landed aura tick, as a CSS animation restarted
// from HUD.pulseAuraMetronome. Two claims, both from the C5 in-game look where
// the PO saw it "pulse twice and then never again":
//   · it restarts MANY times across a wall-clock window, not once;
//   · `.beatPulse` does not stay stuck on the element between beats. A retained
//     class makes every later restart depend on the engine noticing a remove
//     and a re-add inside one frame, and it replays a pulse of its own the next
//     time the pip is shown again (display:none cancels, re-display re-creates).
//
// ⚑ WALL CLOCK ONLY. The window is a timeout and the assertion counts
// `animationstart` events; nothing here waits on a frame. A headless page runs
// its rAF clock at a fraction of 60 fps, so any frame-counted version of this
// leg would be measuring the harness.
// ⚑ The seeded Damage aura ticks every 40 game ticks (~1.33 s), so a 12 s
// window expects ~9 beats. The floor is deliberately slack: this leg is here to
// tell "many" from "one", not to police the cadence.
const PIP_WINDOW_MS = 12_000;
const pipArmed = await page.evaluate(() => {
  const pip = document.querySelector('#auraSlotList > .auraSlot.activeSlot .beatPip');
  if (!pip) return false;
  window.__c5pip = { starts: 0, withClass: 0, withoutClass: 0 };
  pip.addEventListener('animationstart', () => { window.__c5pip.starts++; });
  window.__c5pipSampler = setInterval(() => {
    if (pip.classList.contains('beatPulse')) window.__c5pip.withClass++;
    else window.__c5pip.withoutClass++;
  }, 50);
  return true;
});
if (!pipArmed) {
  skip('4b the metronome keeps beating', 'INCONCLUSIVE - no pip on an active slot');
} else {
  await page.waitForTimeout(PIP_WINDOW_MS);
  const pipRun = await page.evaluate(() => {
    clearInterval(window.__c5pipSampler);
    return window.__c5pip;
  });
  check('4b ⭐ the ember dot pulses REPEATEDLY, not once (>= 6 in 12 s)',
    pipRun.starts >= 6,
    JSON.stringify({ ...pipRun, expected: '~9 beats at the seeded aura\'s 40-tick cadence' }));
  check('4c ...and .beatPulse comes back OFF between beats (no stuck class)',
    pipRun.withoutClass > 0,
    JSON.stringify({ withClass: pipRun.withClass, withoutClass: pipRun.withoutClass }));
}

// --- leg 5: the cooldown sweep ---------------------------------------------

// Equip the cheat-granted cooldown into slot 0 through the REAL flow (click the
// book row, then click the slot) - C5 changed the slot's look, never the flow.
// ⚑ `Shockwave` is one capitalised word, so the server's DeriveDisplayName
// leaves it alone and a bare /Shockwave/i matches the row.
await showSkillRow(page, new RegExp(CD_SKILL, 'i'));
const cdRowId = await page.evaluate((needle) => {
  const row = [...document.querySelectorAll('#spellbookList > li[data-skill-id]')]
    .find((r) => !r.classList.contains('offPage') && new RegExp(needle, 'i').test(r.textContent));
  return row?.dataset.skillId ?? null;
}, CD_SKILL);
if (cdRowId) {
  await clickRow(page, `#spellbookList li[data-skill-id="${cdRowId}"]`);
  await clickEl(page, '#cooldownSlotList li[data-slot="0"]');
  await page.waitForTimeout(900);
}
await closeSpellbook(page);

const cdEquipped = await page.evaluate(SLOTS, '#cooldownSlotList');
if (!cdEquipped[0] || cdEquipped[0].skillId === '0') {
  skip('5 the cooldown sweep', `INCONCLUSIVE - ${CD_SKILL} never landed in cooldown slot 0`);
} else {
  check('5a the cooldown slot took the equip and drew its glyph',
    cdEquipped[0].hasSvg && !cdEquipped[0].fallback && !!cdEquipped[0].label,
    JSON.stringify({ id: cdEquipped[0].skillId, name: cdEquipped[0].label, svg: cdEquipped[0].hasSvg }));

  await page.evaluate(() => document.activeElement?.blur());
  await clickEl(page, '#cooldownSlotList li[data-slot="0"]');
  await page.waitForTimeout(700);
  const firing = await page.evaluate(SLOTS, '#cooldownSlotList');
  const f = firing[0];
  check('5b ⭐ firing it draws the sweep and WHOLE seconds over the glyph',
    f.onCooldown && f.cdSweepShown === true && f.cdSweepDeg > 0
      && /^\d+s$/.test((f.cdText ?? '').trim()),
    JSON.stringify({ onCooldown: f.onCooldown, sweepShown: f.cdSweepShown, deg: f.cdSweepDeg, text: f.cdText }));

  // The PO's second ask at the C5 look: "the cooldown numbers inside the
  // cooldown icons are too small, they should be as big as the icon". The
  // digits are sized off @slot-glyph, the same value the token under them uses,
  // so the two numbers must agree - and the string must still fit the circle.
  check('5b2 ⭐ the seconds render at GLYPH scale and still fit the circle',
    f.cdFontSize !== null && f.tokenSize !== null
      && f.cdFontSize === f.tokenSize && f.cdOverflows === false,
    JSON.stringify({ cdFontSize: f.cdFontSize, tokenSize: f.tokenSize, overflows: f.cdOverflows, text: f.cdText }));

  await page.waitForTimeout(3000);
  const midway = (await page.evaluate(SLOTS, '#cooldownSlotList'))[0];
  check('5c the sweep RUNS DOWN rather than sitting at a fixed angle',
    midway.cdSweepDeg !== null && f.cdSweepDeg !== null && midway.cdSweepDeg < f.cdSweepDeg,
    `${f.cdSweepDeg}deg -> ${midway.cdSweepDeg}deg (${f.cdText} -> ${midway.cdText})`);
  await page.screenshot({ path: join(here, `c5-bar-${label}-cooldown.png`) });

  // 240 ticks = 8 s; wait it out with margin, then assert BOTH clear.
  await page.waitForFunction(
    () => !document.querySelector('#cooldownSlotList li[data-slot="0"]')?.classList.contains('onCooldown'),
    null, { timeout: 20_000 }).catch(() => {});
  const cleared = (await page.evaluate(SLOTS, '#cooldownSlotList'))[0];
  check('5d ⭐ when the cooldown ends the sweep and the seconds both clear',
    !cleared.onCooldown && cleared.cdSweepShown === false && (cleared.cdText ?? '') === ''
      && cleared.cdSweepDeg === 0,
    JSON.stringify({ onCooldown: cleared.onCooldown, sweepShown: cleared.cdSweepShown, deg: cleared.cdSweepDeg, text: cleared.cdText }));
}

// --- leg 6: the pending-equip highlight on circles --------------------------

await openSpellbook(page);
const passiveShown = await showSkillRow(page, new RegExp(PASSIVE_SKILL, 'i'));
if (!passiveShown) {
  skip('6 the pending-equip highlight', `INCONCLUSIVE - ${PASSIVE_SKILL} is not in the book`);
} else {
  const passiveId = await page.evaluate((needle) => {
    const row = [...document.querySelectorAll('#spellbookList > li[data-skill-id]')]
      .find((r) => !r.classList.contains('offPage') && new RegExp(needle, 'i').test(r.textContent));
    return row?.dataset.skillId ?? null;
  }, PASSIVE_SKILL);
  await clickRow(page, `#spellbookList li[data-skill-id="${passiveId}"]`);
  await page.waitForTimeout(400);
  const pending = await page.evaluate(() => ({
    flagged: !!document.querySelector('#passiveLoadout.hasPendingSkill'),
    slots: [...document.querySelectorAll('#passiveSlotList li')].map((li) => {
      const cs = getComputedStyle(li);
      return { border: cs.borderTopColor, radius: cs.borderRadius, opacity: Number(cs.opacity), cursor: cs.cursor };
    }),
    // The active AURA rim must survive a pending passive: border and box-shadow
    // are different properties on purpose (CSS never merges one across rules).
    auraRim: getComputedStyle(
      document.querySelector('#auraSlotList li.activeSlot') ?? document.body).boxShadow,
  }));
  check('6 ⭐ a pending equip highlights the passive circles (gold border, no dim, pointer)',
    pending.flagged
      && pending.slots.every((s) => /50%/.test(s.radius) && s.opacity === 1 && s.cursor === 'pointer')
      && pending.slots.every((s) => /rgba?\(255, 215, 94/.test(s.border)),
    JSON.stringify({ flagged: pending.flagged, slots: pending.slots }));
  check('6b ...and the active aura keeps its wooden rim while a skill is pending',
    /rgb\(138, 90, 43\)/.test(pending.auraRim),
    pending.auraRim.slice(0, 90));

  // Land it, so leg 8 has a filled passive slot to read.
  await clickEl(page, '#passiveSlotList li[data-slot="0"]');
  await page.waitForTimeout(900);
}

// --- leg 8: the passive island (D1) -----------------------------------------

const passives = await page.evaluate(SLOTS, '#passiveSlotList');
const passiveFilled = passives.filter((s) => s.skillId && s.skillId !== '0');
check('8 ⭐ passive slots carry the same 52px anatomy, a glyph and a .slotLabel (D1)',
  passives.every((s) => s.w === 52 && s.h === 52 && s.labelRendered && !!s.label)
    && passiveFilled.length > 0 && passiveFilled.every((s) => s.hasSvg && !s.fallback),
  JSON.stringify(passives.map((s) => ({ id: s.skillId, name: s.label, w: s.w, svg: s.hasSvg }))));

// The book must be up for 8b's "both visible at once" claim - re-open rather
// than assume, since the equip flow is free to close it.
await openSpellbook(page);
const columnGeom = await page.evaluate(() => {
  const book = document.getElementById('spellbook');
  const island = document.getElementById('passiveLoadout');
  const r = (el) => {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height) };
  };
  return {
    bookOpen: !!book && !book.classList.contains('hidden'),
    book: r(book), island: r(island), viewport: window.innerHeight,
    // The stretched column must not eat world clicks in its empty middle.
    columnPointer: getComputedStyle(document.getElementById('leftColumn')).pointerEvents,
    islandPointer: getComputedStyle(island).pointerEvents,
  };
});
check('8b ⭐ the island is bottom-anchored and the OPEN book still sits above it (D1)',
  columnGeom.bookOpen && !!columnGeom.book && !!columnGeom.island
    && columnGeom.book.bottom <= columnGeom.island.top
    && columnGeom.viewport - columnGeom.island.bottom < 40,
  JSON.stringify(columnGeom));
check('8c the stretched left column takes no pointer events; its panels opt back in',
  columnGeom.columnPointer === 'none' && columnGeom.islandPointer === 'auto',
  `column=${columnGeom.columnPointer} island=${columnGeom.islandPointer}`);

await page.screenshot({ path: join(here, `c5-bar-${label}-book-open.png`) });
await closeSpellbook(page);

// --- leg 7: the utility island ---------------------------------------------

const utils = await page.evaluate(SLOTS, '#utilityList');
check('7 ⭐ both utility buttons carry glyphs and keep their .slotLabel',
  utils.length === 2
    && utils.every((u) => u.hasSvg && !u.fallback && u.labelRendered && !!u.label)
    && utils[0].label === 'Recall' && utils[1].label === 'Camp',
  JSON.stringify(utils.map((u) => ({ util: u.utility, name: u.label, svg: u.hasSvg }))));
check('7b Camp carries its charge chip',
  /^\d+\/\d+$/.test((utils[1]?.charges ?? '').trim()),
  `charges="${utils[1]?.charges}"`);

// --- leg 9: the flight lock survives the restyle ---------------------------

const locked = await page.evaluate(() => {
  const bars = document.getElementById('actionBars');
  bars.classList.add('flightLocked');
  const cs = getComputedStyle(bars);
  const out = { opacity: Number(cs.opacity), filter: cs.filter, pointer: cs.pointerEvents };
  bars.classList.remove('flightLocked');
  return out;
});
check('9 #actionBars.flightLocked still dims the family AND keeps it clickable',
  locked.opacity < 0.6 && /grayscale/.test(locked.filter) && locked.pointer !== 'none',
  JSON.stringify(locked));

await page.screenshot({ path: join(here, `c5-bar-${label}-desktop.png`) });
await deskCtx.close();

// ----------------------------------------------------------------- mobile ---
// D2: ICONS INHERIT, LAYOUT STAYS. The tile row, the hidden hotkeys and the
// fixed right-edge thumb column are all unchanged; only the tile's content is.

const mobCtx = await browser.newContext({
  viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true,
  deviceScaleFactor: 3,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
});
const mob = await mobCtx.newPage();
wire(mob);
await mob.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await joinAsNewCharacter(mob, 'c5mob');
await mob.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
// The ?develop panel covers half a phone screen; the screenshots below are for
// the PO's eye, so it goes.
await mob.evaluate(() => { const p = document.getElementById('developPanel'); if (p) p.style.display = 'none'; });
await mob.waitForTimeout(2500);

const mobile = await mob.evaluate(() => {
  const tiles = [...document.querySelectorAll('#auraSlotList li, #cooldownSlotList li')];
  const util = [...document.querySelectorAll('#utilityList li')];
  const bar = document.getElementById('abilityBar');
  const cs = bar ? getComputedStyle(bar) : null;
  const r = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
  return {
    tileCount: tiles.length,
    tiles: tiles.map((t) => ({
      ...r(t),
      radius: getComputedStyle(t).borderRadius,
      hotkeyShown: (() => { const hk = t.querySelector(':scope > .hotkey'); return hk ? getComputedStyle(hk).display !== 'none' : null; })(),
      token: !!t.querySelector(':scope > .ink-token'),
      svg: !!t.querySelector(':scope > .ink-token svg > path'),
      label: t.querySelector(':scope > .slotLabel')?.textContent?.trim() ?? null,
    })),
    // The wrapper must be invisible on the phone - no panel chrome, no divider.
    barChrome: cs ? { bg: cs.backgroundColor, border: cs.borderTopWidth, shadow: cs.boxShadow } : null,
    dividerShown: (() => { const d = document.querySelector('#abilityBar > .barDivider'); return d ? getComputedStyle(d).display !== 'none' : null; })(),
    utility: util.map((u) => ({ ...r(u), position: getComputedStyle(u.parentElement.parentElement).position, svg: !!u.querySelector(':scope > .ink-token svg > path'), charges: u.querySelector(':scope > .utilityCharges')?.textContent ?? null })),
    viewport: { w: window.innerWidth, h: window.innerHeight },
  };
});

check('10 ⭐ mobile keeps the tile row (D2): 6 tiles, rounded not circular, hotkeys hidden',
  mobile.tileCount === 6
    && mobile.tiles.every((t) => !/50%/.test(t.radius) && t.hotkeyShown === false)
    && mobile.tiles.every((t) => t.x >= 0 && t.x + t.w <= mobile.viewport.w),
  JSON.stringify({ count: mobile.tileCount, first: mobile.tiles[0], viewport: mobile.viewport }));
check('10b the phone\'s wrapper carries NO panel chrome and hides the divider',
  !!mobile.barChrome && mobile.barChrome.border === '0px'
    && mobile.barChrome.shadow === 'none' && mobile.dividerShown === false,
  JSON.stringify({ chrome: mobile.barChrome, divider: mobile.dividerShown }));
const mobileFilled = mobile.tiles.filter((t) => t.label && !/Empty/.test(t.label));
check('10c the filled tiles inherit the glyphs, and the label text stays readable from the DOM',
  mobileFilled.length > 0 && mobileFilled.every((t) => t.token && t.svg),
  JSON.stringify(mobileFilled.map((t) => ({ label: t.label, svg: t.svg }))));
check('10d the utility thumb column is still fixed at the right edge, with glyphs',
  mobile.utility.length === 2
    && mobile.utility.every((u) => u.position === 'fixed' && u.svg)
    && mobile.utility.every((u) => u.x + u.w > mobile.viewport.w * 0.6),
  JSON.stringify(mobile.utility));

await mob.screenshot({ path: join(here, `c5-bar-${label}-mobile.png`) });

// The ☰ sheet: the passive island is a LIST here, names visible (D2 reading).
const sheetOpened = await (async () => {
  const box = await mob.locator('#mobileMenuButton').first().boundingBox().catch(() => null);
  if (!box) return false;
  await mob.tap('#mobileMenuButton');
  await mob.waitForTimeout(800);
  return mob.evaluate(() => document.documentElement.classList.contains('menuOpen'));
})();
if (!sheetOpened) {
  skip('10e the ☰ sheet\'s passive rows', 'INCONCLUSIVE - the sheet would not open');
} else {
  const sheet = await mob.evaluate(() => {
    const island = document.getElementById('passiveLoadout');
    const rows = [...document.querySelectorAll('#passiveSlotList li')];
    return {
      titleShown: getComputedStyle(island.querySelector('.auraLoadoutTitle')).display !== 'none',
      marginTop: getComputedStyle(island).marginTop,
      rows: rows.map((li) => {
        const lb = li.querySelector(':scope > .slotLabel').getBoundingClientRect();
        const b = li.getBoundingClientRect();
        return { w: Math.round(b.w ?? b.width), labelW: Math.round(lb.width), label: li.querySelector(':scope > .slotLabel').textContent.trim() };
      }),
      columnPointer: getComputedStyle(document.getElementById('leftColumn')).pointerEvents,
    };
  });
  check('10e the ☰ sheet renders the passive island as a LIST with visible names',
    sheet.titleShown && sheet.marginTop === '0px'
      && sheet.rows.length === 3 && sheet.rows.every((r) => r.labelW > 20),
    JSON.stringify(sheet));
  check('10f the sheet still swallows its own taps (pointer-events restated)',
    sheet.columnPointer === 'auto', `leftColumn pointer-events=${sheet.columnPointer}`);
  await mob.screenshot({ path: join(here, `c5-bar-${label}-sheet.png`) });
}

await mob.setViewportSize({ width: 390, height: 844 });
await mob.waitForTimeout(1000);
await mob.screenshot({ path: join(here, `c5-bar-${label}-portrait.png`) });
await mobCtx.close();

console.log('\nlabel :', label);
for (const r of results) console.log(`${r.skip ? 'SKIP' : r.pass ? 'PASS' : 'FAIL'}  ${r.check}\n        ${r.detail}`);
const failed = results.filter((r) => !r.skip && !r.pass).length;
const passed = results.filter((r) => !r.skip && r.pass).length;
console.log(`\n${passed} passed, ${failed} failed, ${results.filter((r) => r.skip).length} inconclusive`);
console.log('console errors   :', consoleErrors.length);
for (const e of consoleErrors.slice(0, 5)) console.log('   ·', e);

await browser.close();
process.exit(failed > 0 ? 1 : 0);
