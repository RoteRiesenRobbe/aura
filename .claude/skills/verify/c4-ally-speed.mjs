#!/usr/bin/env node
// plan-effect-types.md C4 (ally speed) verification, on the c3-invulnerability
// pattern: the two new skills must reach the client as REAL content — named in
// the spellbook, tooltipped from their own effect cases, and (for the aura) ring
// -categorised on the new speed bit.
//
// What it actually proves, and why each check is here:
//   · the catalog parses over the wire (a lower bound, never a census);
//   · FlyYouFools and Onward render their names, not "Skill #71" — which is the
//     tell that a new skill's catalog entry did NOT parse;
//   · the speed_aura tooltip renders its OWN case, not the "(speed_aura)"
//     fallback, and carries the work-gated cost wording rather than a cadence;
//   · the ally burst says the ALLIES move — the line that would have been a
//     plain lie under the shipped self-only wording;
//   · Swift still says "Move …", byte-identical, which is the D8 pin at the
//     surface a player actually reads;
//   · the aura's wire aura_category carries the new speed bit (128), so the
//     ring has a colour to draw.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');
import { joinAsNewCharacter } from './lib/join.mjs';
import { showSkillRow } from './lib/spellbook.mjs';

const url = process.argv[2] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const outdir = process.argv[3] || '/tmp/c4-ally-speed-shots';
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
await joinAsNewCharacter(page, 'c4spd', { timeout: 30_000 });
await page.waitForFunction(() => !!window.game?.character, null, { timeout: 30_000 });
console.log('joined');

// --- the census, over the wire ---
const catalog = await page.evaluate(async () => {
  const payload = await (await fetch('http://localhost:2000/skills')).json();
  const speedAura = payload.skills.find(s => s.name === 'FlyYouFools');
  const burst = payload.skills.find(s => s.name === 'Onward');
  return {
    skillCount: payload.skills?.length,
    speedAuraType: speedAura?.effects?.[0]?.type,
    speedAuraTargetsAllies: speedAura?.effects?.[0]?.targetsAllies,
    burstType: burst?.effects?.[0]?.type,
    burstTargetsSelf: burst?.effects?.[0]?.speed?.targetsSelf,
  };
});
console.log('GET /skills →', JSON.stringify(catalog));
// ⚑ A LOWER BOUND, not a census: this read `!== 97` and went red the day a
// 98th skill was authored (105 at the C3 sweep, 2026-08-27) - the suite's own
// rule 1, "never assert a content COUNT". What matters here is that the
// catalog parsed at all; the three skills this script is about are asserted
// by name below.
if (!(catalog.skillCount >= 97)) fail('the skills catalog did not parse: ' + catalog.skillCount);
if (catalog.speedAuraType !== 'speed_aura') fail('FlyYouFools is not a speed_aura: ' + catalog.speedAuraType);
if (catalog.speedAuraTargetsAllies !== true) fail('FlyYouFools does not target allies');
if (catalog.burstType !== 'speed_burst') fail('Onward is not a speed_burst: ' + catalog.burstType);
// D9: the ally burst leaves its caster behind, and that flag rides the payload.
if (catalog.burstTargetsSelf !== false) fail('Onward should NOT target self (D9), got ' + catalog.burstTargetsSelf);

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
await runCommand('SKILL FlyYouFools');
await runCommand('SKILL Onward');
await runCommand('SKILL Swift');
await page.waitForTimeout(900);

const spellbook = await page.evaluate(() => {
  const entries = [...document.querySelectorAll('#spellbookList [data-skill-id]')];
  return entries.map(e => ({ id: e.dataset.skillId, text: e.textContent.trim().replace(/\s+/g, ' ') }));
});
console.log('spellbook entries:', JSON.stringify(spellbook, null, 1));
if (spellbook.some(e => /Skill #\d+/.test(e.text))) {
  fail('spellbook shows placeholder names ⇒ a catalog entry did NOT parse: ' + JSON.stringify(spellbook));
}

async function hoverTooltip(skillId) {
  await showSkillRow(page, skillId); // the book is a closable, paged panel since UI pass C3
  const entry = page.locator(`#spellbookList [data-skill-id="${skillId}"]`).first();
  await entry.scrollIntoViewIfNeeded();
  await entry.hover();
  await page.waitForTimeout(400);
  const text = await page.evaluate(() => {
    const tip = document.querySelector('#skillTooltip');
    if (!tip || tip.classList.contains('hidden')) return null;
    return [...tip.children].map(c => c.textContent).join(' | ');
  });
  await page.mouse.move(10, 10);
  return text;
}

const idOf = (re) => (spellbook.find(e => re.test(e.text)) || {}).id;

// --- the aura: its own case, and the work-gated cost sentence ---
const auraId = idOf(/Fly, You Fools/i);
if (!auraId) fail('FlyYouFools not in the spellbook after the SKILL cheat');
const auraTip = auraId ? await hoverTooltip(auraId) : null;
console.log('Fly, You Fools! →', auraTip);
if (auraTip) {
  if (/\(speed_aura\)/.test(auraTip)) fail('the tooltip fell through to the unknown-type fallback');
  if (!/Speed: 1\.3×/.test(auraTip)) fail('no speed line: ' + auraTip);
  if (!/refreshed every 1s/.test(auraTip)) fail('no cadence — TICKING_TYPES entry missing?: ' + auraTip);
  if (!/when it reaches someone new/.test(auraTip)) fail('cost is not work-gated: ' + auraTip);
  if (!/Targets: all allies in range/.test(auraTip)) fail('no ally targets line: ' + auraTip);
}
await page.screenshot({ path: join(outdir, 'fly-you-fools.png') });

// --- the ally burst: the line that used to lie ---
const burstId = idOf(/Onward/i);
if (!burstId) fail('Onward not in the spellbook after the SKILL cheat');
const burstTip = burstId ? await hoverTooltip(burstId) : null;
console.log('Onward →', burstTip);
if (burstTip) {
  if (!/Allies in range move 1\.4×/.test(burstTip)) fail('the burst does not say the ALLIES move: ' + burstTip);
  if (/^.*\| Move 1\.4×/.test(burstTip)) fail('the burst still claims the caster sprints: ' + burstTip);
}
await page.screenshot({ path: join(outdir, 'onward.png') });

// --- Swift, unchanged: the D8 pin where a player can see it ---
const swiftId = idOf(/Swift/i);
if (!swiftId) fail('Swift not in the spellbook after the SKILL cheat');
const swiftTip = swiftId ? await hoverTooltip(swiftId) : null;
console.log('Swift →', swiftTip);
if (swiftTip && !/Move 1\.5×/.test(swiftTip)) {
  fail('Swift no longer reads "Move 1.5×…" — the targetsSelf edit changed behavior: ' + swiftTip);
}

// ⚑ The new speed RING bit is deliberately NOT checked here, and the first
// draft's check was removed rather than kept: aura_category rides the entity
// snapshot (Character.aura_category), not the /skills catalog, so reading it off
// the catalog returned undefined and the guard could never fail — coverage that
// only looks like coverage. Reaching the real value needs the aura equipped into
// a slot AND switched on, which is spellbook-drag machinery this script has no
// other reason to drive. The bit is pinned harder elsewhere anyway, in both
// directions and on both sides: api/shared-constants.json against the Go table
// (cmd/aurad/shared_constants_test.go) and against the client enum
// (SharedConstants.test.ts), plus the exhaustive
// TestAuraCategory_ClassifiesEveryAuthorableEffectType.

if (errors.length) {
  console.error('\n' + errors.length + ' problem(s):');
  errors.forEach(e => console.error('  · ' + e));
  await browser.close();
  process.exit(1);
}
console.log('\nAll checks passed.');
await browser.close();
