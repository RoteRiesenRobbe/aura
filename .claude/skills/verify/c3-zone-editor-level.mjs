#!/usr/bin/env node
// plan-mob-levels.md C3 — the zone editor can author a per-spawn level, and
// the exporter does not eat it.
//
// C1 taught the loader to accept `spawn.level`; C2 put the effective level on
// the wire so the plate stops lying. Neither made the number AUTHORABLE: the
// editor had no field, and — the real defect (landmine L7) — `getZoneAsJSON`
// serializes an explicit field WHITELIST, so a level that only existed in
// `fromJSON`'s spread survived a load and vanished on the next save. Silent
// data loss on a round-trip, invisible from the editor.
//
// This script drives the PANEL, which is the half a unit test cannot reach:
// the input → readSpawnControls → model → export chain, and the way back
// (selecting a levelled spawn must repopulate the field). The pure
// fromJSON → getZoneAsJSON round-trip is pinned in ZoneModel.test.ts, which
// is where it belongs.
//
// The legs, and why each one exists:
//
//   1. the field exists at all (a missing input reads as "the feature shipped"
//      everywhere else, because every other assertion here would still pass
//      with an empty string in it)
//   2. an authored level reaches the EXPORT — the L7 defect, at the surface
//   3. a BLANK field exports no `level` key — the diff-clean property. Absent
//      must stay absent, or one edited spawn turns world.json's 485 into a
//      485-line diff, and every unedited spawn silently freezes its inherited
//      level into a copy
//   4. re-selecting the spawn repopulates the field with 15, not '' and not
//      the species default (L6: pre-filling from the species would freeze
//      inheritance the same way)
//   5. a fractional level is REFUSED. world.Spawn.Level is a *int, so a 2.5
//      that reached the file would fail json.Unmarshal at boot with a type
//      error rather than the loader's friendly ">= 1" message
//
// ⚑ No content edit, no restart, no revert — unlike c2-mob-level.mjs this
// script authors its probe through the editor itself and never writes to
// api/. It does need the frontend PROD BUILD (the panel HTML is bundled).
//
// ⚑ The zone JSON the editor edits is webpack-bundled at build time
// (`require.context('../../../../../api/zones')`), NOT fetched — so a
// hand-authored level in api/zones/*.json needs `npm run build` before the
// editor can see it, not a server restart. That is the opposite of what the
// c2 probe needed, and getting it backwards reads as the whitelist eating the
// field again.
//
// Usage: node .claude/skills/verify/c3-zone-editor-level.mjs [label] [url]
import { createRequire } from 'node:module';
import { join } from 'node:path';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');
import { joinAsNewCharacter } from './lib/join.mjs';

const label = process.argv[2] || 'run';
// ⚑ `&textures` is what mounts the editor, NOT `&develop`. The panel partial
// is rendered only under Constants.MODE_PARAMETERS.GROUND_TEXTURE_EDITOR
// (BasicConfig.ts), so a `&develop`-only URL leaves every #zoneEditor_* id
// absent from the DOM — which reads as "the field was never added".
const url = process.argv[3] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop&textures';
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

const LEVEL = 15;
const MOB = 'Wolf'; // cL2 in the catalog, so 15 is unmistakably an override

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();

const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await joinAsNewCharacter(page, 'zone');
await page.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });

const results = [];
const record = (name, ok, detail) => { results.push({ name, ok, detail }); };

// The editor lives in the develop panel; the panel partial is rendered there,
// so every selector below is a plain form control, not a HUD element — real
// clicks, no pointerdown dance.
await page.waitForSelector('#zoneEditor_spawnMob', { state: 'attached', timeout: 60_000 });

// Leg 1 — the field exists. Asserted FIRST and on its own, because a missing
// input would make legs 2-5 measure an empty string and still look sane.
const fieldPresent = await page.evaluate(() => {
  const el = document.getElementById('zoneEditor_spawnLevel');
  return el === null ? null : { type: el.getAttribute('type'), min: el.getAttribute('min'), step: el.getAttribute('step'), value: el.value };
});
record('the spawn tool has a level field, blank by default',
  fieldPresent !== null && fieldPresent.value === '',
  fieldPresent === null ? 'no #zoneEditor_spawnLevel' : JSON.stringify(fieldPresent));
if (fieldPresent === null) {
  console.log('\nlabel:', label, '\n  FAIL  no level field — nothing further is measurable');
  await browser.close();
  process.exit(1);
}

// Switch the editor into spawn mode and pick a species.
await page.check('input[name="zoneEditor_mode"][value="spawn"]');
await page.selectOption('#zoneEditor_spawnMob', MOB);

// exportedSpawns reads the REAL export path (#zoneEditor_showPopup fills the
// popup from currentZoneJSON), not the model — the whitelist lives there.
const exportedSpawns = async () => {
  await page.click('#zoneEditor_showPopup');
  const json = await page.textContent('#zoneEditorOutput');
  await page.click('#zoneEditor_closePopup');
  return JSON.parse(json).spawns;
};

// ⚑ Deselect lives INSIDE #zoneEditor_spawnSelection, which is `hidden` while
// nothing is selected — so a bare page.click on it blocks forever waiting for
// visibility rather than failing. Every deselect goes through here.
const deselect = async () => {
  if (await page.isVisible('#zoneEditor_spawnDeselect')) {
    await page.click('#zoneEditor_spawnDeselect');
  }
};

// The zone as it stands before the probe touches anything — kept whole, not
// just counted, because the non-interference leg below compares levels.
const baseline = await exportedSpawns();
const before = baseline.length;

// Leg 2 — an authored level reaches the export.
await page.fill('#zoneEditor_spawnLevel', String(LEVEL));
await page.click('#zoneEditor_spawnPlaceButton');
let spawns = await exportedSpawns();
const levelled = spawns[spawns.length - 1];
record(`a spawn placed at level ${LEVEL} exports it`,
  spawns.length === before + 1 && levelled?.mob === MOB && levelled?.level === LEVEL,
  JSON.stringify(levelled));

// Leg 4 — and the way back. This is a SECOND instance of the same silent-loss
// class, not a nicety: populate is what a level survives when the PO selects a
// levelled spawn to change its respawn ticks and hits Update. A field left
// blank on selection would write the blank straight back over the level.
// (Run before leg 3, while exactly one spawn stands at the player's feet.)
await deselect();
await page.fill('#zoneEditor_spawnLevel', ''); // only populate can bring it back
const target = await page.evaluate(() => {
  // ⚑ window.game is the six-member console façade (BrowserConsole.ts), NOT
  // IGame — there is no `player`, so no camera to invert. The character's own
  // Pixi container knows where it renders, which is the same answer without
  // the missing object: shape lives in world space under the camera group, so
  // its GLOBAL position is the screen point the spawn was placed at.
  const shape = window.game.character.shape;
  const g = shape.getGlobalPosition();
  const el = document.elementFromPoint(g.x, g.y);
  // ⚑ "Is the canvas on top?" is the WRONG question — the full-screen
  // #inputAreas overlay (virtual joystick) sits above it, so elementFromPoint
  // over open world returns the overlay and a canvas-only check calls every
  // valid point covered. The editor's own isMapPointerEvent accepts both;
  // this mirrors it rather than inventing a second rule.
  const onMap = el?.tagName === 'CANVAS' || (el !== null && el.closest('#inputAreas') !== null);
  return { pageX: g.x, pageY: g.y, onCanvas: onMap, tag: el?.id || el?.tagName };
});
if (!target.onCanvas) {
  // Something (the develop panel, a HUD element) sits over the spawn — the
  // click would land on it. Say so instead of reporting a broken feature.
  record('re-selecting the spawn repopulates the field with its own level (INCONCLUSIVE)',
    false, `the spawn's screen point is covered by ${target.tag}`);
} else {
  await page.mouse.click(target.pageX, target.pageY);
  await page.waitForTimeout(400);
  const selected = await page.textContent('#zoneEditor_spawnSelectedIndex');
  const repopulated = await page.inputValue('#zoneEditor_spawnLevel');
  if (selected !== String(spawns.length - 1)) {
    record('re-selecting the spawn repopulates the field with its own level (INCONCLUSIVE)',
      false, `the click selected spawn #${selected}, not #${spawns.length - 1} — nothing measured`);
  } else {
    record('re-selecting the spawn repopulates the field with its own level',
      repopulated === String(LEVEL), `field='${repopulated}' after selecting #${selected}`);
  }
}

// Leg 3 — a blank field exports NO key. The diff-clean property.
await deselect();
await page.fill('#zoneEditor_spawnLevel', '');
await page.click('#zoneEditor_spawnPlaceButton');
spawns = await exportedSpawns();
const inherited = spawns[spawns.length - 1];
record('a spawn placed with a blank field exports no level key',
  spawns.length === before + 2 && inherited?.mob === MOB && !('level' in (inherited || {})),
  JSON.stringify(inherited));

// …and the untouched ones stay untouched — the property that protects every
// other spawn in the zone from a one-spawn edit.
//
// ⚑ THIS LEG WAS REWRITTEN IN world-replacement C2 (2026-08-06), because the
// world moved out from under it. It used to assert `untouched === 0` — no
// pre-existing spawn carries a level at all — which was true only while NO
// zone shipped a placement. C2 authored one on all 423 combat spawns, so the
// old form went red on correct content and read as a C3 regression.
//
// What it was really protecting is not ABSENCE, it is NON-INTERFERENCE: an
// edit to one spawn must not rewrite the levels of the ones it never touched.
// So the assertion is now that the pre-existing slice round-trips **exactly**,
// levels and all — which is strictly stronger than the old form (it would also
// catch a level being changed, not just added) and no longer depends on the
// world happening to be un-levelled.
const beforeLevels = JSON.stringify(baseline.map((s) => s.level ?? null));
const afterLevels = JSON.stringify(spawns.slice(0, before).map((s) => s.level ?? null));
const authored = baseline.filter((s) => 'level' in s).length;
record('no pre-existing spawn had its level added, changed or dropped',
  beforeLevels === afterLevels,
  `${before} pre-existing spawns, ${authored} authored a level — all unchanged`);

// Leg 5 — a fraction is refused, and refusal means NOTHING is placed.
await deselect();
await page.fill('#zoneEditor_spawnLevel', '2.5');
await page.click('#zoneEditor_spawnPlaceButton');
spawns = await exportedSpawns();
record('a fractional level is refused, and places nothing',
  spawns.length === before + 2, `${spawns.length} spawns, expected ${before + 2}`);

// Leg 6 — the map marker. Beyond the plan's letter, and the reason it is here:
// without a label an override is invisible on the map, which is the same
// silent state the whitelist produced, wearing a different hat. The pair is
// the assertion — "Wolf L15" for the override AND a bare "Wolf" for the
// inherited one, because a suffix on every diamond would re-merge the two
// numbers L6 keeps apart.
const markerLabels = await page.evaluate(() => {
  let root = window.game.character.plate.parent;
  while (root.parent) root = root.parent;
  const out = [];
  const walk = (c) => {
    if (typeof c?.text === 'string' && c.text) out.push(c.text);
    (c?.children || []).forEach(walk);
  };
  walk(root);
  return out;
});
const overriddenLabels = markerLabels.filter((t) => t === `${MOB} L${LEVEL}`).length;
const bareLabels = markerLabels.filter((t) => t === MOB).length;
record('the map marker says "Wolf L15" for the override and bare "Wolf" for the inherited one',
  overriddenLabels === 1 && bareLabels >= 1,
  `${overriddenLabels} × "${MOB} L${LEVEL}", ${bareLabels} × "${MOB}"`);

await page.screenshot({ path: `/tmp/c3-zone-editor-${label}.png` });

console.log('\nlabel:', label);
let pass = 0;
for (const r of results) {
  console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  —  ${r.detail}`);
  if (r.ok) pass++;
}
console.log(`\n${pass}/${results.length} passed`);
console.log(`console errors: ${consoleErrors.length}`);
consoleErrors.slice(0, 8).forEach((e) => console.log('  ' + e));
console.log(`screenshot: /tmp/c3-zone-editor-${label}.png`);
console.log('⚑ nothing was written to api/ — the probe lives in the browser only');

await browser.close();
process.exit(pass === results.length && consoleErrors.length === 0 ? 0 : 1);
