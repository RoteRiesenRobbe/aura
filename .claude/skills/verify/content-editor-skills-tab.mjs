// Spell builder C1+C3+C4 (plan-content-editor.md §B5, §B12): the CONTENT EDITOR's
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
//   2b. the C4 PICKERS: the icon picker on Damage offers the whole vendored
//      set (counted off /api/data, not pinned) as inline SVGs with the file's
//      own glyph checked, and names the fetch script in its footer; the
//      spawnMob picker on SummonCompanion is grouped by role with Structures
//      first, offers the creature-role PortalHome, and its "edit in Mobs" link
//      lands on Companion in the Mobs tab. (Two groups since
//      plan-summon-follows.md C2 retired the follower role.)
//   2c. the C4 NEW-SKILL flow: "+ New" prompts, opens a draft with the id =
//      max over BOTH skill folders + 1, the L3 caveat beside it, NO category,
//      NO card and the "not yet saved" badge; a second "+ New" with the same
//      name is refused client-side; category + icon + one damage_aura card are
//      filled and SAVED, the file lands on disk with exactly the authored keys,
//      the rendered checklist carries the registry-pin count (recounted here),
//      the badge is gone; and a NEW file reusing id 1, posted straight at the
//      API, is refused BY THE SEAM naming the duplicate.
//   3. screenshots of Damage / OmniStrike / ThrowBomb / NovaBurst for the PO.
//
// ⚑ Part 2 WRITES api/skills/damage.json once and restores it itself, and part
// 2c WRITES AND DELETES api/skills/harness-test-skill.json (its cleanup is in a
// finally block; a leftover file reddens the Go registry count pin for
// everyone). If the run dies mid-leg: `git checkout api/skills/damage.json` and
// `rm -f api/skills/harness-test-skill.json`.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';

const url = process.argv[2] || 'http://localhost:4611';
const outdir = process.argv[3] || 'skills-shots';
mkdirSync(outdir, { recursive: true });
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DAMAGE_FILE = join(REPO, 'api', 'skills', 'damage.json');

// api/skills is two levels deep (player skills at the top, mob-embedded ones
// under mobs/), and BOTH share the id space (§B10 L6) and the registry count
// the post-save checklist names, so the sweep must recurse.
function readdirRecursive(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) out.push(...readdirRecursive(abs));
    else if (name.endsWith('.json')) out.push(abs);
  }
  return out;
}

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
// ⚑ Matches the row's `.item-name` span, not the whole <li>: C4 put the
// test-rig and not-yet-saved badges in the row, and a row's text content would
// otherwise read "OmniAura test rig" and match nothing.
async function open(name) {
  const row = page.locator('#skill-list .group-items li .item-name').filter({ hasText: new RegExp(`^\\s*${name}\\s*$`) });
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

const items = await page.$$eval('#skill-list .group-items li .item-name', (els) => els.map((n) => n.textContent.trim()));
console.log(`${items.length} skills in the sidebar`);

// C4: the test-rig badge, in the sidebar. A name list in skill-presentation.mjs
// (nothing in the content marks a cheat rig), so both halves are asserted: the
// three rows carry it and no other row does.
const RIGS = ['OmniAura', 'OmniPassive', 'OmniStrike'];
const badgedRows = await page.$$eval('#skill-list .group-items li', (els) => els
  .filter((li) => li.querySelector('.rig-badge'))
  .map((li) => li.querySelector('.item-name').textContent.trim()).sort());
if (JSON.stringify(badgedRows) !== JSON.stringify([...RIGS].sort())) problems.push(`sidebar test-rig badges: ${JSON.stringify(badgedRows)}, expected ${JSON.stringify([...RIGS].sort())}`);
console.log('sidebar test-rig badges:', badgedRows.join(', '));

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
      rig: !!root.querySelector('.editor-header .rig-badge'),
      testLink: (root.querySelector('.test-link-row a') || {}).textContent || '',
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
  // C4: the editor header's rig badge matches the sidebar's, and the test link
  // is on EVERY skill (the common case is testing one that already exists).
  if (facts.rig !== RIGS.includes(name)) problems.push(`${name}: editor header rig badge = ${facts.rig}, expected ${RIGS.includes(name)}`);
  if (!facts.testLink.includes(`start-cmds=GOD,SKILL ${name}`)) problems.push(`${name}: the "After saving" test link does not carry this skill (${facts.testLink.slice(0, 120)})`);
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

/* ---- 2b. the C4 pickers ------------------------------------------------- */
// The icon picker (§B4.4): the whole VENDORED set as real SVGs plus a "(none)"
// option, with the file's own value selected. The expected count comes from
// /api/data, not a literal - the set grows when someone runs the fetch script.
const glyphKeys = Object.keys((await (await fetch(`${url}/api/data`)).json()).skillIcons || {});
await open('Damage');
const iconFacts = await page.evaluate(() => {
  const field = document.querySelector('#editor-root .field[title="icon"]');
  const options = [...field.querySelectorAll('.icon-option')];
  return {
    options: options.length,
    glyphs: field.querySelectorAll('.icon-option .glyph svg').length,
    checked: options.filter((o) => o.querySelector('input').checked).map((o) => o.title),
    current: options.filter((o) => o.classList.contains('current')).map((o) => o.title),
    footer: (field.querySelector('.icon-picker .hint') || {}).textContent || '',
  };
});
if (iconFacts.options !== glyphKeys.length + 1) problems.push(`icon picker: ${iconFacts.options} option(s), expected ${glyphKeys.length + 1} (${glyphKeys.length} vendored + none)`);
if (iconFacts.glyphs !== glyphKeys.length) problems.push(`icon picker: ${iconFacts.glyphs} inline SVG(s), expected ${glyphKeys.length}`);
if (JSON.stringify(iconFacts.checked) !== JSON.stringify(['lorc/broadsword'])) problems.push(`icon picker: checked ${JSON.stringify(iconFacts.checked)}, expected Damage's own lorc/broadsword`);
if (JSON.stringify(iconFacts.current) !== JSON.stringify(['lorc/broadsword'])) problems.push(`icon picker: highlighted ${JSON.stringify(iconFacts.current)}, expected lorc/broadsword`);
if (!iconFacts.footer.includes('fetch-skill-icons.mjs')) problems.push(`icon picker footer does not name the script: ${iconFacts.footer.slice(0, 120)}`);
console.log(`icon picker: ${iconFacts.options} options (${iconFacts.glyphs} glyphs), current ${iconFacts.checked.join(',')}`);

// The spawnMob picker (§B4.6, PO 2026-09-12 overruling the plan's filter):
// EVERY mob, grouped by role, so a creature-role summon like PortalHome is
// offered too - plus the jump into the Mobs tab for the picked one.
await open('SummonCompanion');
const mobFacts = await page.evaluate(() => {
  const sel = document.querySelector('#editor-root .field[title="spawnMob"] select');
  return {
    value: sel.value,
    groups: [...sel.querySelectorAll('optgroup')].map((g) => `${g.label} ${g.children.length}`),
    hasPortalHome: [...sel.options].some((o) => o.value === 'PortalHome'),
    portalGroup: ([...sel.options].find((o) => o.value === 'PortalHome') || {}).parentElement?.label,
    link: !!document.querySelector('#editor-root .field[title="spawnMob"] a.ref-link'),
  };
});
if (mobFacts.value !== 'Companion') problems.push(`spawnMob picker: value "${mobFacts.value}", expected Companion`);
if (!mobFacts.groups[0] || !mobFacts.groups[0].startsWith('Structures')) problems.push(`spawnMob picker: first group is ${JSON.stringify(mobFacts.groups[0])}, expected Structures first`);
if (!mobFacts.hasPortalHome) problems.push('spawnMob picker: PortalHome (a creature-role summon that ships) is not offered');
if (mobFacts.portalGroup !== 'Creatures') problems.push(`spawnMob picker: PortalHome sits in group "${mobFacts.portalGroup}", expected Creatures`);
if (!mobFacts.link) problems.push('spawnMob picker: no "edit in Mobs" jump link for the picked mob');
console.log('spawnMob picker:', mobFacts.groups.join(' · '));
await page.locator('#editor-root .field[title="spawnMob"] a.ref-link').click();
await page.waitForTimeout(250);
const jumpedTab = await page.$eval('#sidebar-tabs .tab-btn.active', (b) => b.dataset.tab);
const jumpedTitle = await page.$eval('#editor-root h2', (h) => h.textContent.trim());
if (jumpedTab !== 'mob') problems.push(`the spawnMob jump landed on tab "${jumpedTab}", expected mob`);
if (jumpedTitle !== 'Companion') problems.push(`the spawnMob jump opened "${jumpedTitle}", expected Companion`);
console.log(`spawnMob jump → tab "${jumpedTab}", editor "${jumpedTitle}"`);
await page.click('#sidebar-tabs .tab-btn[data-tab="skill"]');

/* ---- 2c. the new-skill flow (C4) --------------------------------------- */
// ⚑ THIS WRITES api/skills/harness-test-skill.json AND DELETES IT AGAIN. A
// leftover file reddens the Go registry count pin for everyone, so the whole
// leg sits in try/finally and the cleanup asserts the file is gone.
const NEW_NAME = 'Harness Test Skill';
const NEW_FILE = join(REPO, 'api', 'skills', 'harness-test-skill.json');
const NEW_REL = 'api/skills/harness-test-skill.json';
try {
  page.once('dialog', (d) => d.accept(NEW_NAME));
  await page.click('#skill-new-btn');
  await page.waitForTimeout(300);

  const draft = await page.evaluate(() => {
    const root = document.getElementById('editor-root');
    const val = (key) => {
      const input = root.querySelector(`.field[title="${key}"] input, .field[title="${key}"] select, .field[title="${key}"] textarea`);
      return input ? input.value : null;
    };
    return {
      file: root.querySelector('.file-path').textContent,
      newBadge: !!root.querySelector('.file-path .new-badge'),
      id: val('id'),
      name: val('name'),
      maxLevel: val('maxLevel'),
      category: val('category'),
      icon: [...root.querySelectorAll('.field[title="icon"] .icon-option input')].filter((i) => i.checked).length,
      cards: root.querySelectorAll('.effect-card').length,
      idHints: [...root.querySelectorAll('.field[title="id"] .hint')].map((h) => h.textContent).join(' '),
      hints: [...root.querySelectorAll('.errors-inline .err-line')].map((e) => e.textContent),
    };
  });
  console.log('new draft:', JSON.stringify({ ...draft, idHints: draft.idHints.slice(0, 40) + '…', hints: draft.hints.length }));
  // max id over BOTH skill folders + 1 (L6), computed here rather than pinned.
  const maxId = readdirRecursive(join(REPO, 'api', 'skills'))
    .reduce((max, abs) => Math.max(max, JSON.parse(readFileSync(abs, 'utf8')).id || 0), 0);
  if (!draft.newBadge) problems.push('the new draft carries no "not yet saved" badge');
  if (!draft.file.includes(NEW_REL)) problems.push(`the new draft's file is ${draft.file}, expected ${NEW_REL}`);
  if (Number(draft.id) !== maxId + 1) problems.push(`the new draft's id is ${draft.id}, expected ${maxId + 1} (max over both folders + 1)`);
  if (draft.name !== 'HarnessTestSkill') problems.push(`the new draft's name is ${JSON.stringify(draft.name)}, expected HarnessTestSkill`);
  if (draft.maxLevel !== '5') problems.push(`the new draft's maxLevel is ${JSON.stringify(draft.maxLevel)}, expected 5`);
  if (draft.category !== '') problems.push(`the new draft opened WITH a category (${JSON.stringify(draft.category)}); the PO ruling is unset`);
  if (draft.cards !== 0) problems.push(`the new draft opened with ${draft.cards} effect card(s), expected none`);
  if (draft.icon !== 1) problems.push(`the new draft has ${draft.icon} icon radio(s) checked, expected exactly the "(none)" one`);
  if (!/re-mints/.test(draft.idHints)) problems.push(`the new draft's id field does not carry the L3 caveat: ${JSON.stringify(draft.idHints.slice(0, 120))}`);
  if (!draft.hints.some((h) => /category is required/.test(h))) problems.push(`the live hints do not ask for a category: ${JSON.stringify(draft.hints)}`);

  // A second "+ New" with the same name is refused CLIENT-SIDE (an alert), so
  // two drafts can never race for one file.
  const alertText = await new Promise((res) => {
    page.once('dialog', async (d) => {
      if (d.type() === 'prompt') { await d.accept(NEW_NAME); page.once('dialog', async (d2) => { const m = d2.message(); await d2.accept(); res(m); }); return; }
      const m = d.message(); await d.accept(); res(m);
    });
    page.click('#skill-new-btn');
  });
  await page.waitForTimeout(200);
  if (!/already resolves/.test(alertText)) problems.push(`a second "+ New" with the same name was not refused client-side: ${alertText.slice(0, 140)}`);
  console.log('duplicate "+ New":', alertText.slice(0, 90));

  // Fill the minimum a damage_aura aura needs, then save for real.
  await open('HarnessTestSkill');
  await page.locator('#editor-root .field[title="category"] select').selectOption('active_aura');
  await page.waitForTimeout(250);
  // The label, not its radio: the radio is visually hidden (zero-sized) so the
  // glyph itself is the click target, which is also how a human picks one.
  await page.locator('#editor-root .field[title="icon"] .icon-option[title="lorc/broadsword"]').click();
  await page.waitForTimeout(100);
  await page.locator('#editor-root button.add-row', { hasText: 'Add effect' }).click();
  await page.waitForTimeout(250);
  const cardType = await page.locator('#editor-root .effect-card .type-select').first().inputValue();
  if (cardType !== 'damage_aura') problems.push(`the added card opened on "${cardType}", expected damage_aura`);
  await page.locator('#editor-root .effect-card .field[title="radius"] input').first().fill('1');
  await page.locator('#editor-root .effect-card .field[title="damageHP"] input').first().fill('5');
  await page.locator('#editor-root .effect-card .field[title="tickInterval"] input').first().fill('40');
  await page.locator('#editor-root .effect-card .field[title="targetsEnemies"] input').first().check();
  await page.waitForTimeout(150);
  await save().click();
  await page.waitForFunction(() => /refused|saved|could not/.test(document.getElementById('save-feedback').textContent), null, { timeout: 30000 });
  const newFb = await feedback();
  console.log('new save:', newFb.slice(0, 120));
  if (!newFb.startsWith('saved')) problems.push(`the new skill was not saved: ${newFb.slice(0, 200)}`);

  if (!existsSync(NEW_FILE)) problems.push(`${NEW_REL} is not on disk after a successful save`);
  else {
    const written = JSON.parse(readFileSync(NEW_FILE, 'utf8'));
    const keys = Object.keys(written).sort().join(',');
    if (keys !== 'category,effects,icon,id,maxLevel,name') problems.push(`the written file authors ${keys}, expected exactly category,effects,icon,id,maxLevel,name`);
    const effectKeys = Object.keys(written.effects[0] || {}).sort().join(',');
    if (effectKeys !== 'damageHP,radius,targetsEnemies,tickInterval,type') problems.push(`the written effect authors ${effectKeys}, expected exactly damageHP,radius,targetsEnemies,tickInterval,type`);
    if (written.name !== 'HarnessTestSkill' || written.category !== 'active_aura' || written.icon !== 'lorc/broadsword') problems.push(`the written file's identity is wrong: ${JSON.stringify({ name: written.name, category: written.category, icon: written.icon })}`);
  }
  // The checklist rides the response and is rendered under "After saving".
  // Its registry-pin count must be the files NOW on disk, counted here too.
  const onDisk = readdirRecursive(join(REPO, 'api', 'skills')).length;
  const checklist = await page.$$eval('#skill-checklist li', (els) => els.map((li) => li.textContent));
  if (checklist.length !== 4) problems.push(`the rendered checklist has ${checklist.length} item(s), expected 4 for a new skill`);
  if (!checklist.some((c) => c.includes(`r.All(), ${onDisk}`))) problems.push(`no checklist item names the registry pin count ${onDisk}: ${JSON.stringify(checklist)}`);
  if (!checklist.some((c) => c.includes('content-skill-inventory.md'))) problems.push('no checklist item names the inventory row');
  console.log('checklist:', checklist.map((c) => c.slice(0, 50)).join(' | '));
  if (await page.locator('#editor-root .file-path .new-badge').count() !== 0) problems.push('the "not yet saved" badge survived a successful save');
  if (await page.locator('#skill-list li.dirty').count() !== 0) problems.push('the saved new skill still shows a dirty marker');

  // A NEW file reusing a shipped id is refused BY THE SEAM, not by a JS twin
  // of the loader's rule (D9). Posted straight at the API: the form locks the
  // id field, which is the point.
  const dupRes = await fetch(`${url}/api/save/skill`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      file: 'api/skills/harness-dup-id.json',
      isNew: true,
      raw: { id: 1, name: 'HarnessDupId', icon: 'lorc/broadsword', category: 'active_aura', maxLevel: 5, effects: [{ type: 'damage_aura', radius: 1, damageHP: 5, targetsEnemies: true, tickInterval: 40 }] },
    }),
  });
  const dupBody = await dupRes.json();
  if (dupRes.status !== 200) problems.push(`the duplicate-id POST answered HTTP ${dupRes.status}, expected 200 with a refusal`);
  if (dupBody.ok !== false || dupBody.stage !== 'validate') problems.push(`the duplicate-id save was not refused by the seam: ${JSON.stringify(dupBody).slice(0, 200)}`);
  else if (!(dupBody.errors || []).some((e) => /duplicate skill ID/i.test(e))) problems.push(`the seam's refusal does not name the duplicate id: ${JSON.stringify(dupBody.errors)}`);
  if (existsSync(join(REPO, 'api', 'skills', 'harness-dup-id.json'))) problems.push('the refused duplicate-id candidate was written to disk');
  console.log('duplicate id:', ((dupBody.errors || [])[0] || '(no error)').slice(0, 110));
} finally {
  // MANDATORY cleanup: a leftover file reddens the Go registry pin for everyone.
  if (existsSync(NEW_FILE)) unlinkSync(NEW_FILE);
  if (existsSync(NEW_FILE)) problems.push(`${NEW_REL} could not be deleted - delete it by hand before running go test`);
  else console.log(`cleanup: ${NEW_REL} deleted`);
}

/* ---- 3. screenshots ---------------------------------------------------- */
// Reloaded first, so the shots show the tree as it is ON DISK: the edit legs
// left their in-memory markers behind (a restored description, the deleted
// harness draft), and a screenshot for the PO should not carry them. The
// reload also proves the deleted draft is gone from a fresh load.
await page.goto(url);
await page.waitForFunction(() => document.querySelectorAll('#npc-list li').length > 0);
await page.click('#sidebar-tabs .tab-btn[data-tab="skill"]');
await page.waitForSelector('#skill-list li.list-group');
if (await page.locator('#skill-list .group-items li .item-name').filter({ hasText: /^\s*HarnessTestSkill\s*$/ }).count() !== 0) {
  problems.push('HarnessTestSkill is still in the sidebar after a reload - the file was not deleted');
}
for (const name of ['Damage', 'OmniStrike', 'ThrowBomb', 'NovaBurst']) {
  await open(name);
  await page.screenshot({ path: join(outdir, `${name}.png`), fullPage: true });
}

await browser.close();
for (const p of problems) console.log('PROBLEM', p);
console.log(`${problems.length} problem(s)`);
process.exit(problems.length ? 1 : 0);
