#!/usr/bin/env node
// C5 (plan-code-health.md) — before/after capture for the behaviour-neutral
// bar refactor. NOT a pass/fail harness: it prints one JSON block of geometry
// facts and drops screenshots, for a human (or a diff) to compare across the
// refactor. Run once at the pre-change tree ("before") and once after
// ("after"); the samples must match.
//
// Scenes: (a) own plate with health bar + HoT pip, (c) shield segment visible,
// (b) mob plates/bars at the boar field (eyeball only — mobs wander, so pixels
// are not comparable, but the geometry class is shared with (a)),
// (d) cast bar mid-Recall with the indicator rect vs the shown fraction.
// The flight bar is owned by c3-flight-client.mjs (its barFill + ETA legs).
//
// ⚑ Field-layout tolerant on purpose: reads `ch.overheadBar ?? ch` so the SAME
// script runs before (fields on Character/Mob) and after (fields on the
// extracted OverheadHealthBar), and the cast fill via width OR scale.
//
// Usage: node .claude/skills/verify/c5-bars.mjs <label> [url]
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { joinAsNewCharacter } from './lib/join.mjs';
import { showSkillRowAt } from './lib/spellbook.mjs';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');

const label = process.argv[2] || 'run';
const url = process.argv[3] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const outDir = process.env.C5_OUT_DIR || '/tmp/claude-1000/-root-workspaces-aurahunter/6a10deea-6fc0-421d-9b06-d40f55f64d51/scratchpad';
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

// The most open whole-unit tile (swift-cooldown's venue): fixed ground for a
// comparable backdrop. Boar field beside the Farmer for the mob scene.
const OPEN = { x: -23, y: 14 };
const BOARS = { x: -57, y: 26 };
const wire = (p) => `${Math.round(p.x) * 120} ${Math.round(p.y) * 120}`;

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const consoleErrors = [];
const ctxLosses = [];
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
  if (/webgl.*context lost/i.test(m.text())) ctxLosses.push(1);
});
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await joinAsNewCharacter(page, 'cfive');
await page.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
await page.evaluate(() => { const p = document.getElementById('developPanel'); if (p) p.style.display = 'none'; });

const cmd = async (text) => {
  await page.evaluate((t) => {
    const input = document.getElementById('console_command');
    input.value = t;
    document.getElementById('console').dispatchEvent(new Event('submit', { cancelable: true }));
  }, text);
  await page.waitForTimeout(700);
};

// n1-shield-bar's worked example, single-client.
const equipAndActivateAura = async (skillRe, slotIndex) => {
  const rowAppeared = await page.waitForFunction(
    (re) => [...document.querySelectorAll('#spellbookList li')].some((li) => new RegExp(re, 'i').test(li.textContent)),
    skillRe.source, { timeout: 20_000, polling: 500 }).catch(() => null);
  if (!rowAppeared) return { ok: false, why: `no spellbook row matches ${skillRe}` };
  const rowIndex = await page.evaluate((re) =>
    [...document.querySelectorAll('#spellbookList li')].findIndex((li) => new RegExp(re, 'i').test(li.textContent)),
    skillRe.source);
  await showSkillRowAt(page, rowIndex); // the book is a closable, paged panel since UI pass C3
  const rows = await page.$$('#spellbookList li');
  const box = await rows[rowIndex].boundingBox();
  await page.mouse.click(box.x + 25, box.y + box.height / 2);
  await page.waitForTimeout(700);
  const sel = `#auraSlotList li[data-slot="${slotIndex}"]`;
  const slot = await page.$(sel);
  const sbox = await slot.boundingBox();
  await page.mouse.click(sbox.x + sbox.width / 2, sbox.y + sbox.height / 2); // equip
  const equipped = await page.waitForFunction(
    ({ re, s }) => new RegExp(re, 'i').test(document.querySelector(s + ' .slotLabel')?.textContent || ''),
    { re: skillRe.source, s: sel }, { timeout: 20_000, polling: 500 }).catch(() => null);
  if (!equipped) return { ok: false, why: `slot ${slotIndex} never showed the skill` };
  for (let i = 0; i < 5; i++) {
    await page.mouse.click(sbox.x + sbox.width / 2, sbox.y + sbox.height / 2); // activate
    await page.waitForTimeout(1200);
    if (await page.evaluate((s) => !!document.querySelector(s)?.classList.contains('activeSlot'), sel))
      return { ok: true };
  }
  return { ok: false, why: `slot ${slotIndex} never lit active` };
};

// One atomic sample of the own overhead bar. Layout-tolerant: the fill groups
// live on Character before C5 and on Character.overheadBar after it. The bar
// container is plate.children[0] (initHealthBar runs before createName).
const sampleOverhead = () => page.evaluate(() => {
  const ch = window.game.character;
  const ob = ch?.overheadBar ?? ch;
  const bar = ch?.plate?.children?.[0];
  const r = (v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v);
  const b = bar?.getLocalBounds?.();
  return {
    barY: r(bar?.y),
    barChildren: bar?.children?.length,
    barBounds: b ? { x: r(b.x), y: r(b.y), w: r(b.width), h: r(b.height) } : null,
    healthScale: r(ob?.healthFillGroup?.scale.x),
    healthPos: ob ? { x: r(ob.healthFillGroup?.position.x), y: r(ob.healthFillGroup?.position.y) } : null,
    shieldVisible: ob?.shieldFillGroup?.visible,
    shieldScale: r(ob?.shieldFillGroup?.scale.x),
    shieldX: r(ob?.shieldFillGroup?.position.x),
    pipY: r(ob?.effectPips?.container?.y),
    pipChildren: ob?.effectPips?.container?.children?.length,
    hudShield: document.querySelector('#healthBar .shieldIndicator')?.style.display,
    focusText: document.querySelector('#healthBar .barText')?.textContent,
  };
});

const shot = (name, clip) => page.screenshot({ path: join(outDir, `c5-bars-${label}-${name}.png`), clip });
const CENTER = { x: 420, y: 180, width: 440, height: 440 };
const out = { label };

await cmd('GOD');
await cmd('XP 99999999');
await cmd('SKILL Warbanner');
await cmd('SKILL Rejuvenation');
await cmd('WARP ' + wire(OPEN));
await page.waitForTimeout(20_000); // camera settle after WARP (standing gotcha)

// --- (a) plate: bar + HoT pip ---
const rejuv = await equipAndActivateAura(/Rejuvenation/, 0);
await page.waitForTimeout(3_000); // first HoT tick -> own pip
out.rejuvSetup = rejuv;
out.sceneA_plate = await sampleOverhead();
await shot('a-plate', CENTER);

// --- (c) shield segment (Warbanner self-shield) ---
const wb = await equipAndActivateAura(/Warbanner/, 1);
out.warbannerSetup = wb;
await page.waitForFunction(() => {
  const ch = window.game.character; const ob = ch?.overheadBar ?? ch;
  return ob?.shieldFillGroup?.visible === true;
}, null, { timeout: 20_000, polling: 500 }).catch(() => null);
out.sceneC_shield = await sampleOverhead();
await shot('c-shield', CENTER);

// --- (b) mob plates/bars (eyeball; mobs wander) ---
await cmd('WARP ' + wire(BOARS));
await page.waitForTimeout(20_000);
out.sceneB_mobPlates = await page.evaluate(() => {
  const plates = window.game.character?.plate?.parent?.children ?? [];
  return plates.filter((c) => c.label === 'mobPlate' || c.name === 'mobPlate').length;
});
await shot('b-mobs');

// --- (d) cast bar mid-Recall: indicator rect vs shown fraction ---
await page.click('#utilityList li[data-utility="1"]');
await page.waitForFunction(() => document.getElementById('castBar')?.classList.contains('casting'),
  null, { timeout: 10_000 }).catch(() => null);
await page.waitForTimeout(3_000); // ~30% into the 10 s cast
out.sceneD_cast = await page.evaluate(() => {
  const bar = document.getElementById('castBar');
  const ind = bar?.querySelector('.indicator');
  const bi = ind?.getBoundingClientRect();
  const bb = bar?.getBoundingClientRect();
  return {
    casting: bar?.classList.contains('casting'),
    text: bar?.querySelector('.barText')?.textContent,
    inlineWidth: ind?.style.width || null,
    inlineScale: ind?.style.scale || null,
    rectFraction: bb && bi ? Math.round((bi.width / bb.width) * 1000) / 1000 : null,
    barRect: bb ? { w: Math.round(bb.width), h: Math.round(bb.height) } : null,
  };
});
await shot('d-cast', { x: 340, y: 560, width: 600, height: 240 });

console.log(JSON.stringify(out, null, 2));
console.log(`webgl ctx losses : ${ctxLosses.length}`);
console.log(`console errors   : ${consoleErrors.length}`);
for (const e of consoleErrors.slice(0, 6)) console.log('   · ' + e);
await browser.close();
