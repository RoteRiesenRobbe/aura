// Spell builder C1+C3 (plan-content-editor.md §B5, §B12): the CONTENT EDITOR's
// Skills tab, editable and saving through the aurad seam. Needs the editor AND
// a built, mtime-fresh `backend/aurad` (the save legs run `aurad -validate`);
// no DB, no frontend build:
//
//     make -C backend build
//     PORT=4611 node tools/content-editor/server.mjs &
//     cd ~/.cache/aurahunter-run && node <repo>/.claude/skills/verify/content-editor-skills-tab.mjs http://localhost:4611 <shots-dir>
//
// (`playwright` is resolved from ~/.cache/aurahunter-run inside the script;
// setup-browser.sh in the run-simharness skill installs it.) Three parts:
//
//   1. the SWEEP: every player skill opens with no console error or page
//      exception, every effect card rendered, no dirty dot on load, no
//      `.err-line` that is not a live hint the content earns; a parked skill
//      (ThrowBomb / ThrowMine) has NO Save button and ZERO enabled controls
//      (§B4.8), every other skill has a Save button, `id` disabled and `name`
//      enabled. Counts (cards, previews, cheat-only, parked, mandatory
//      targetFactions) are printed, not asserted: they move with content.
//   2. the EDIT legs on Damage, OmniPassive and OmniAura: the type picker is
//      FILTERED by the skill's category (C3 rider: an aura is not offered
//      stat_multiplier, a passive is not offered damage_aura) · a blanked number marks the file
//      dirty · add effect then Reset restores the card count · a rename is
//      refused as a GUARD (200, stage guard) · an illegal cost is refused BY
//      THE SEAM ("refused by aurad -validate") · a real description edit is
//      SAVED, the file on disk carries exactly that change with `_comment`
//      intact, and the harness writes the original bytes back · a type change
//      confirms naming the dropped keys incl. `hitStyle (not shown)`, accept
//      drops them and keeps `radius`, cancel leaves the type · move down swaps
//      · Delete confirms · lowering maxLevel confirms and cancel posts nothing.
//   3. screenshots of Damage / OmniStrike / ThrowBomb / NovaBurst for the PO.
//
// ⚑ Part 2 WRITES api/skills/damage.json once and restores it itself; if the
// run dies mid-leg, `git checkout api/skills/damage.json`.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';

const url = process.argv[2] || 'http://localhost:4611';
const outdir = process.argv[3] || 'skills-shots';
mkdirSync(outdir, { recursive: true });
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DAMAGE_FILE = join(REPO, 'api', 'skills', 'damage.json');

const workdir = join(homedir(), '.cache', 'aurahunter-run');
// playwright lives in the run dir, and node resolves a bare import from the
// SCRIPT's own path, not the cwd: resolve it from the run dir explicitly so
// the recipe above works as written and REPO still derives from this file.
const { chromium } = createRequire(join(workdir, 'package.json'))('playwright');
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const page = await (await browser.newContext({ viewport: { width: 1400, height: 2400 } })).newPage();
const problems = [];
page.on('console', (m) => { if (m.type() === 'error') problems.push(`console.error: ${m.text()}`); });
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

await page.goto(url);
await page.waitForFunction(() => document.querySelectorAll('#npc-list li').length > 0);
await page.click('#sidebar-tabs .tab-btn[data-tab="skill"]');
await page.waitForSelector('#skill-list li.list-group');

// Locator-based on purpose: the sidebar re-renders after every save and
// validation pass, so an element handle taken a moment earlier can be detached
// by the time it is clicked.
async function open(name) {
  const row = page.locator('#skill-list .group-items li').filter({ hasText: new RegExp(`^\\s*${name}\\s*$`) });
  if (await row.count() === 0) { problems.push(`sidebar has no "${name}"`); return false; }
  await row.first().click();
  await page.waitForTimeout(150);
  return true;
}
const save = () => page.locator('#editor-root .editor-actions button.primary');
const feedback = async () => (await page.locator('#save-feedback').innerText()).trim();
async function reset() {
  page.once('dialog', (d) => d.accept());
  await page.locator('#editor-root .editor-actions button', { hasText: 'Reset' }).click();
  await page.waitForTimeout(250);
}
function nextDialog(action = 'accept') {
  return new Promise((res) => page.once('dialog', async (d) => { const m = d.message(); await (action === 'accept' ? d.accept() : d.dismiss()); res(m); }));
}

/* ---- 1. the sweep ------------------------------------------------------ */
const groups = await page.$$eval('#skill-list li.list-group', (els) => els.map((g) => ({
  label: g.querySelector('.group-name').textContent,
  count: g.querySelectorAll('.group-items li').length,
})));
console.log('groups:', groups.map((g) => `${g.label} ${g.count}`).join(' · '));

const dirtyDots = await page.$$eval('#skill-list .group-items li.dirty', (els) => els.length);
if (dirtyDots) problems.push(`${dirtyDots} skill(s) show a dirty dot on load`);

const items = await page.$$eval('#skill-list .group-items li', (els) => els.map((li) => li.textContent.trim()));
console.log(`${items.length} skills in the sidebar`);

const stats = { cards: 0, previews: 0, cheatOnly: 0, sourced: 0, stray: 0, parked: 0, mandatory: 0, hints: 0 };
const perSkill = [];
for (const name of items) {
  await open(name);
  await page.waitForFunction(() => !document.getElementById('editor-root').hidden);
  const facts = await page.evaluate(() => {
    const root = document.getElementById('editor-root');
    const controls = [...root.querySelectorAll('input, select, textarea')];
    return {
      cards: root.querySelectorAll('.effect-card').length,
      previews: root.querySelectorAll('.level-table').length,
      cheatOnly: !!root.querySelector('.sources-panel .cheat-only'),
      stray: root.querySelectorAll('.stray-key').length,
      parked: !!root.querySelector('.parked-banner'),
      mandatory: !!root.querySelector('.field.mandatory'),
      enabled: controls.filter((c) => !c.disabled).length,
      disabled: controls.filter((c) => c.disabled).length,
      idDisabled: !!root.querySelector('.field[title="id"] input:disabled'),
      nameEnabled: !!root.querySelector('.field[title="name"] input:not(:disabled)'),
      errLines: [...root.querySelectorAll('.err-line')].map((e) => e.textContent),
      saveButtons: [...root.querySelectorAll('.editor-actions button')].filter((b) => /save/i.test(b.textContent)).length,
      comment: !!root.querySelector('.skill-comment textarea'),
    };
  });
  if (facts.parked) {
    if (facts.enabled) problems.push(`${name}: parked, but ${facts.enabled} enabled control(s)`);
    if (facts.saveButtons) problems.push(`${name}: parked, but a Save button exists`);
  } else {
    if (facts.saveButtons !== 1) problems.push(`${name}: ${facts.saveButtons} Save button(s), expected 1`);
    if (!facts.idDisabled) problems.push(`${name}: the id field is editable`);
    if (!facts.nameEnabled) problems.push(`${name}: the name field is not editable`);
  }
  if (facts.errLines.length) { stats.hints += facts.errLines.length; console.log(`  hint on ${name}: ${facts.errLines.join(' | ')}`); }
  if (facts.cards === 0) problems.push(`${name}: no effect cards rendered`);
  stats.cards += facts.cards; stats.previews += facts.previews; stats.stray += facts.stray;
  if (facts.cheatOnly) stats.cheatOnly += 1; else stats.sourced += 1;
  if (facts.parked) stats.parked += 1;
  if (facts.mandatory) stats.mandatory += 1;
  perSkill.push({ name, ...facts });
}
console.log('totals:', JSON.stringify(stats));
console.log('parked:', perSkill.filter((p) => p.parked).map((p) => p.name).join(', '));
console.log('mandatory targetFactions:', perSkill.filter((p) => p.mandatory).map((p) => p.name).join(', '));
console.log('cheat-only:', perSkill.filter((p) => p.cheatOnly).map((p) => p.name).join(', '));
console.log('disabled controls per editable skill:', [...new Set(perSkill.filter((p) => !p.parked).map((p) => p.disabled))].join('/'));
console.log('editable _comment on', perSkill.filter((p) => p.comment).length, 'skills');

// Jump link: from Taunt's sources into CityGuard's node, sidebar must follow.
await open('Taunt');
const link = await page.$('#editor-root .sources-panel a.ref-link');
if (link) {
  await link.click();
  await page.waitForTimeout(200);
  const activeTab = await page.$eval('#sidebar-tabs .tab-btn.active', (b) => b.dataset.tab);
  const title = await page.$eval('#editor-root h2', (h) => h.textContent);
  console.log(`jump from Taunt → tab "${activeTab}", editor "${title}"`);
  if (activeTab === 'skill') problems.push('jump link did not switch the sidebar tab');
} else {
  problems.push('Taunt has no source link to test the jump with');
}
await page.click('#sidebar-tabs .tab-btn[data-tab="skill"]');

/* ---- 2. the edit legs -------------------------------------------------- */
await open('Damage');
const cards = await page.locator('#editor-root .effect-card').count();

// the type picker is filtered by the skill's category (C3 rider, PO
// 2026-09-12): the legality table is Go's, carried by the fixture, and the
// select is the only place an author can pick a type at all.
const pickerOptions = () => page.locator('#editor-root .effect-card .type-select').first()
  .evaluate((n) => [...n.options].map((o) => o.value));
const auraTypes = await pickerOptions();
if (auraTypes.includes('stat_multiplier')) problems.push('Damage (an active_aura) offers stat_multiplier in the type picker');
if (!auraTypes.includes('damage_aura')) problems.push('Damage (an active_aura) does not offer damage_aura in the type picker');

// a blanked number marks the file dirty; a typed 0 stays a value
const radius = page.locator('#editor-root .field[title="radius"] input').first();
await radius.fill('');
await page.waitForTimeout(150);
if (await page.locator('#skill-list li.dirty').count() === 0) problems.push('blanking radius produced no dirty marker');
await reset();
if (await page.locator('#skill-list li.dirty').count() !== 0) problems.push('Reset left a dirty marker');

// add effect, then Reset
await page.locator('#editor-root button.add-row', { hasText: 'Add effect' }).click();
await page.waitForTimeout(200);
const afterAdd = await page.locator('#editor-root .effect-card').count();
if (afterAdd !== cards + 1) problems.push(`add effect: ${cards} -> ${afterAdd}`);
const newType = await page.locator('#editor-root .effect-card .type-select').last().inputValue();
if (newType !== 'damage_aura') problems.push(`a new card on an aura opened on "${newType}", expected damage_aura`);
await reset();
if (await page.locator('#editor-root .effect-card').count() !== cards) problems.push('Reset did not drop the added card');

// a rename is refused as a guard (Damage is milestone level 1)
await page.locator('#editor-root .field[title="name"] input').first().fill('DamageRenamed');
await page.waitForTimeout(100);
await save().click();
await page.waitForFunction(() => /refused|saved|could not/.test(document.getElementById('save-feedback').textContent), null, { timeout: 15000 });
let fb = await feedback();
console.log('rename:', fb.slice(0, 110));
if (!fb.startsWith('refused:') || !/Milestone/.test(fb)) problems.push(`rename not refused as a guard naming the milestone: ${fb.slice(0, 160)}`);
await reset();

// an illegal cost is refused BY THE SEAM
const cost = page.locator('#editor-root .field[title="costFractionOfMax"] input').first();
await cost.fill('1.5');
await page.waitForTimeout(100);
await save().click();
await page.waitForFunction(() => /refused|saved|could not/.test(document.getElementById('save-feedback').textContent), null, { timeout: 30000 });
fb = await feedback();
console.log('seam refusal:', fb.slice(0, 140));
if (!fb.startsWith('refused by aurad -validate:')) problems.push(`illegal cost was not refused by the seam: ${fb.slice(0, 160)}`);
await reset();

// a real save: description edited, disk changed by that key only, then restored
const originalBytes = readFileSync(DAMAGE_FILE, 'utf8');
const original = JSON.parse(originalBytes);
const marker = 'C3 harness, restored immediately.';
await page.locator('#editor-root .field[title="description"] textarea').first().fill(marker);
await page.waitForTimeout(100);
await save().click();
await page.waitForFunction(() => /refused|saved|could not/.test(document.getElementById('save-feedback').textContent), null, { timeout: 30000 });
fb = await feedback();
console.log('save:', fb.slice(0, 90));
if (!fb.startsWith('saved')) problems.push(`save did not succeed: ${fb.slice(0, 160)}`);
try {
  const written = JSON.parse(readFileSync(DAMAGE_FILE, 'utf8'));
  if (written.description !== marker) problems.push('saved file does not carry the new description');
  if (written._comment !== original._comment) problems.push('saved file lost or changed _comment');
  const expect = { ...original, description: marker };
  const norm = (o) => JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]));
  if (norm(written) !== norm(expect)) problems.push('saved file differs from the original beyond description');
  if (await page.locator('#skill-list li.dirty').count() !== 0) problems.push('a saved skill still shows a dirty marker');
} finally {
  writeFileSync(DAMAGE_FILE, originalBytes, 'utf8');
}
if (readFileSync(DAMAGE_FILE, 'utf8') !== originalBytes) problems.push('damage.json was not restored byte for byte');

// a parked skill stays read-only, whole
await open('ThrowBomb');
if (await save().count() !== 0) problems.push('ThrowBomb offers a Save button');
const enabled = await page.locator('#editor-root input:not(:disabled), #editor-root select:not(:disabled), #editor-root textarea:not(:disabled)').count();
if (enabled !== 0) problems.push(`ThrowBomb has ${enabled} enabled control(s)`);

await open('OmniPassive');
const passiveTypes = await pickerOptions();
if (passiveTypes.includes('damage_aura')) problems.push('OmniPassive (a passive) offers damage_aura in the type picker');
if (!passiveTypes.includes('stat_multiplier')) problems.push('OmniPassive (a passive) does not offer stat_multiplier in the type picker');
console.log(`picker: aura ${auraTypes.length} type(s), passive ${passiveTypes.length}`);

// the confirm paths on OmniAura
await open('OmniAura');
const typeSel = () => page.locator('#editor-root .effect-card .type-select').first();
if (await typeSel().inputValue() !== 'damage_aura') problems.push('OmniAura card #0 is not damage_aura');
let dlg = nextDialog('accept');
await typeSel().selectOption('heal_aura');
let msg = await dlg;
await page.waitForTimeout(250);
if (!msg.includes('hitStyle (not shown)')) problems.push(`type-change confirm did not mark the hidden key: ${msg.slice(0, 200)}`);
if (!msg.includes('damageHP')) problems.push(`type-change confirm did not name damageHP: ${msg.slice(0, 200)}`);
const card0 = () => page.locator('#editor-root .effect-card').first();
if (await card0().locator('.field[title="damageHP"]').count() !== 0) problems.push('damageHP survived a type change that dropped it');
if (await card0().locator('.field[title="radius"]').count() === 0) problems.push('radius (legal on heal_aura too) was dropped by the type change');
console.log('type-change confirm:', msg.replace(/\n+/g, ' | ').slice(0, 150));

dlg = nextDialog('dismiss');
// slow_aura, not instant_damage: the picker is category-filtered now, and a
// cooldown type is no longer an option on an aura. It drops the capped +
// variance keys, so the confirm still fires.
await typeSel().selectOption('slow_aura');
await dlg;
await page.waitForTimeout(250);
const afterCancel = await typeSel().inputValue();
if (afterCancel !== 'heal_aura') problems.push(`cancelling a type change left the select on "${afterCancel}"`);

const typesBefore = await page.locator('#editor-root .effect-card .type-select').evaluateAll((ns) => ns.map((n) => n.value));
await card0().locator('button[title="Move down"]').click();
await page.waitForTimeout(250);
const typesAfter = await page.locator('#editor-root .effect-card .type-select').evaluateAll((ns) => ns.map((n) => n.value));
if (!(typesAfter[0] === typesBefore[1] && typesAfter[1] === typesBefore[0])) problems.push(`move down did not swap: ${typesBefore.slice(0, 2)} -> ${typesAfter.slice(0, 2)}`);

dlg = nextDialog('accept');
await card0().locator('button.danger').click();
const removeMsg = await dlg;
await page.waitForTimeout(250);
if (!/key\(s\) it authors/.test(removeMsg)) problems.push(`remove confirm did not list the authored keys: ${removeMsg.slice(0, 120)}`);
if (await page.locator('#editor-root .effect-card').count() !== typesAfter.length - 1) problems.push('remove did not drop exactly one card');

const maxLevel = page.locator('#editor-root .field[title="maxLevel"] input').first();
const was = Number(await maxLevel.inputValue());
await maxLevel.fill(String(was - 1));
await page.waitForTimeout(100);
dlg = nextDialog('dismiss');
await save().click();
const lowerMsg = await dlg;
await page.waitForTimeout(500);
if (!lowerMsg.includes('maxLevel')) problems.push(`lowering maxLevel did not confirm: ${lowerMsg.slice(0, 120)}`);
if ((await feedback()) !== '') problems.push(`cancelling the maxLevel confirm still posted: "${await feedback()}"`);
console.log('maxLevel confirm:', lowerMsg.split('\n')[0]);
await reset();

/* ---- 3. screenshots ---------------------------------------------------- */
for (const name of ['Damage', 'OmniStrike', 'ThrowBomb', 'NovaBurst']) {
  await open(name);
  await page.screenshot({ path: join(outdir, `${name}.png`), fullPage: true });
}

await browser.close();
for (const p of problems) console.log('PROBLEM', p);
console.log(`${problems.length} problem(s)`);
process.exit(problems.length ? 1 : 0);
