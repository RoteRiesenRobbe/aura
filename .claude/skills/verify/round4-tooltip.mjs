#!/usr/bin/env node
// Round-4 tooltip fix verification: the /skills payload reshape ({curve,
// skills}) must not break catalog parsing, and a hovered skill tooltip must
// render the CHARACTER-level-scaled HP value — the number that actually lands.
//
// Drives: join → SKILL Rejuvenation → hover in the spellbook (level 1) →
// XP to the cap → hover again. The two tooltip texts must differ by the curve.
//
// UI pass C8 leg (2026-09-02): a DESCRIBED skill (Frost Shield) renders its
// served `description` as ONE `.tooltipDescription` child directly under the
// subtitle (ruling D2), with the sentence absent from the generated lines, and
// an undescribed skill (Rejuvenation, the hovers above) grows no such child.
// This is the only durable browser eye on the block: the formatter's unit
// tests see `content.description`, never the DOM.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');
import { joinAsNewCharacter } from './lib/join.mjs';
import { showSkillRow } from './lib/spellbook.mjs';

const url = process.argv[2] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const outdir = process.argv[3] || '/tmp/round4-shots';
mkdirSync(outdir, { recursive: true });

const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = {
  ...process.env,
  LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':'),
};

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

const fail = (msg) => { errors.push('CHECK FAILED: ' + msg); };

await page.goto(url, { waitUntil: 'domcontentloaded' });

// --- join ---
await joinAsNewCharacter(page, 'tip', { timeout: 30_000 });
// #gameUI is zero-size (Playwright's visibility wait never resolves) and its
// class is not 'active' in this build — wait on the live scene graph instead.
await page.waitForFunction(() => !!window.game?.character, null, { timeout: 30_000 });
console.log('joined');

// --- the catalog itself: did the reshaped payload parse? ---
const catalogState = await page.evaluate(async () => {
  const response = await fetch('http://localhost:2000/skills');
  const payload = await response.json();
  return { curve: payload.curve, skillCount: payload.skills?.length };
});
console.log('GET /skills →', JSON.stringify(catalogState));
if (!catalogState.curve || catalogState.curve.growth !== 1.12) {
  fail('payload carries no curve: ' + JSON.stringify(catalogState.curve));
}

async function runCommand(command) {
  await page.waitForSelector('#console_command', { state: 'attached' });
  await page.evaluate((cmd) => {
    const input = document.querySelector('#console_command');
    input.value = cmd;
    document.querySelector('#console').dispatchEvent(new Event('submit', { cancelable: true }));
  }, command);
  await page.waitForTimeout(400);
}

await runCommand('GOD');
await runCommand('SKILL Rejuvenation');
await page.waitForTimeout(800);

// --- read the spellbook entry: real name, or the "Skill #29" fallback? ---
const spellbook = await page.evaluate(() => {
  const entries = [...document.querySelectorAll('#spellbookList [data-skill-id]')];
  return entries.map(e => ({ id: e.dataset.skillId, text: e.textContent.trim().replace(/\s+/g, ' ') }));
});
console.log('spellbook entries:', JSON.stringify(spellbook, null, 1));
if (spellbook.length === 0) {
  fail('no spellbook entries found — selector or unlock path changed');
}
if (spellbook.some(e => /Skill #\d+/.test(e.text))) {
  fail('spellbook shows placeholder names ⇒ the catalog did NOT parse: ' + JSON.stringify(spellbook));
}

async function hoverTooltip(skillId) {
  await showSkillRow(page, skillId); // the book is a closable, paged panel since UI pass C3
  const entry = page.locator(`#spellbookList [data-skill-id="${skillId}"]`).first();
  await entry.scrollIntoViewIfNeeded();
  await entry.hover();
  await page.waitForTimeout(400);
  return page.evaluate(() => {
    const tip = document.querySelector('#skillTooltip');
    if (!tip || tip.classList.contains('hidden')) return null;
    return [...tip.children].map(c => c.textContent).join(' | ');
  });
}

const rejuvenationId = (spellbook.find(e => /Rejuvenation/i.test(e.text)) || {}).id;
if (!rejuvenationId) {
  fail('Rejuvenation not in the spellbook after SKILL Rejuvenation');
}

const atLevel1 = rejuvenationId ? await hoverTooltip(rejuvenationId) : null;
console.log('tooltip @ character level 1:', atLevel1);
if (!atLevel1) fail('no tooltip rendered on hover');
await page.screenshot({ path: join(outdir, 'tooltip-level-1.png') });

// --- level to the cap and hover again ---
await page.mouse.move(10, 10);          // drop the tooltip
await runCommand('XP 99999999');
await page.waitForTimeout(1500);
// Character has no `level` field — the level lives on its world-space plate
// (Character.setLevel writes levelElement.text), which is also the only
// client-side rendering of it.
const level = await page.evaluate(() => Number(window.game?.character?.levelElement?.text));
console.log('character level now:', level);
if (level !== 30) fail('XP cheat did not reach the level cap, got ' + level);

const atLevel30 = rejuvenationId ? await hoverTooltip(rejuvenationId) : null;
console.log('tooltip @ character level 30:', atLevel30);
await page.screenshot({ path: join(outdir, 'tooltip-level-30.png') });

if (atLevel1 && atLevel30) {
  if (atLevel1 === atLevel30) {
    fail('tooltip is IDENTICAL at character level 1 and 30 — the reported bug is not fixed');
  }
  // The reported case: 4 × 1.12²⁹ ≈ 107.
  if (!/Heal over time: 107\b/.test(atLevel30)) {
    fail('expected "Heal over time: 107" at level 30, got: ' + atLevel30);
  }
  // The boundary: radius is NOT an HP value and must not have moved.
  //
  // ⚑ Compare the CURRENT value only, never the whole rendered line. Since the
  // 2026-08-01 preview gating a "→ next" appears only while the next level is
  // affordable, and the XP cheat between these two hovers hands out 29 points —
  // so the level-30 line grew a preview the level-1 line never had, and a
  // whole-string compare reported an unmoved radius as moved. The scale
  // question is about the number, not about whether a preview is on screen.
  const radiusOf = t => (t.match(/Radius: ([\d.]+)/) || [])[1];
  if (radiusOf(atLevel1) !== radiusOf(atLevel30)) {
    fail(`radius moved with the curve (${radiusOf(atLevel1)} → ${radiusOf(atLevel30)}) — over-applied scale`);
  }

  // The next-level preview is gated on affordability (2026-08-01): it answers
  // "what does the point I am about to spend get me?", so it only renders while
  // there is a point to spend. A level-1 character holds zero (TotalSkillPoints
  // is (level-1) × perLevel), and the XP cheat above hands out 29.
  //
  // This is the ONLY eye on the wiring — the formatter's unit tests take the
  // flag as an argument, so a HUD that never pushed the point count would leave
  // them all green with the feature dead on screen.
  if (/→/.test(atLevel1)) {
    fail('a level-1 character has no skill points, yet the tooltip previews the next level: ' + atLevel1);
  }
  if (!/→/.test(atLevel30)) {
    fail('29 unspent points and still no next-level preview: ' + atLevel30);
  }
}

// --- C8: the served description block (plan-ui-pass.md §5 C8, D1/D2) ---------
if (atLevel30 && /tooltipDescription/.test(await page.evaluate(() =>
    [...document.querySelectorAll('#skillTooltip > *')].map(c => c.className).join(' ')))) {
  fail('Rejuvenation authors no description, yet its tooltip carries a .tooltipDescription child');
}
await page.mouse.move(10, 10);
await runCommand('SKILL FrostShield');
await page.waitForTimeout(800);
const frostId = (await page.evaluate(() =>
  [...document.querySelectorAll('#spellbookList [data-skill-id]')]
    .map(e => ({ id: e.dataset.skillId, text: e.textContent }))
    .find(e => /Frost Shield/i.test(e.text)) || {})).id;
if (!frostId) {
  fail('Frost Shield not in the spellbook after SKILL FrostShield');
} else {
  await showSkillRow(page, frostId);
  const row = page.locator(`#spellbookList [data-skill-id="${frostId}"]`).first();
  await row.scrollIntoViewIfNeeded();
  await row.hover();
  await page.waitForTimeout(400);
  const described = await page.evaluate(() => {
    const tip = document.querySelector('#skillTooltip');
    if (!tip || tip.classList.contains('hidden')) return null;
    return [...tip.children].map(c => ({ cls: c.className, text: c.textContent }));
  });
  console.log('Frost Shield tooltip children:', JSON.stringify(described));
  await page.screenshot({ path: join(outdir, 'tooltip-described.png') });
  // The served text, read off the catalog rather than typed here, so a
  // re-authored sentence does not turn this leg red.
  const served = await page.evaluate(async () => {
    const payload = await (await fetch('http://localhost:2000/skills')).json();
    return payload.skills.find(s => s.name === 'FrostShield')?.description ?? null;
  });
  if (!served) {
    fail('GET /skills serves no description for FrostShield');
  } else if (!described) {
    fail('no tooltip rendered on the Frost Shield hover');
  } else {
    // D2: title, subtitle, THEN the prose, then the numbers.
    if (described[2]?.cls !== 'tooltipDescription') {
      fail('the description is not the third tooltip child (D2): ' + described.map(c => c.cls).join(' > '));
    }
    if (described[2]?.text !== served) {
      fail(`description text "${described[2]?.text}" ≠ served "${served}"`);
    }
    if (described.slice(3).some(c => c.text === served)) {
      fail('the description sentence ALSO renders as a generated line');
    }
    if (described.filter(c => c.cls === 'tooltipDescription').length !== 1) {
      fail('expected exactly one .tooltipDescription child');
    }
  }
}

await browser.close();

if (errors.length) {
  console.error('\n=== FAILURES ===');
  for (const e of errors) console.error(' ✗ ' + e);
  process.exit(1);
}
console.log('\nAll checks passed.');
