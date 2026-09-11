// Spell builder C1 (plan-content-editor.md §B5 C1, §B12): the CONTENT EDITOR's
// Skills tab, read-only. Needs the editor only - no aurad, no DB, no frontend
// build:
//
//     PORT=4611 node tools/content-editor/server.mjs &
//     cd ~/.cache/aurahunter-run && node <repo>/.claude/skills/verify/content-editor-skills-tab.mjs http://localhost:4611 <shots-dir>
//
// (run from ~/.cache/aurahunter-run so `playwright` resolves; setup-browser.sh
// in the run-simharness skill installs it.) It switches to Skills, clicks every
// player skill, and fails on any console error or page exception, any ENABLED
// control (C1 is read-only until C3), any Save button, any dirty dot on load,
// any effect card missing; it checks one sources-panel jump switches the
// sidebar tab (D6), and screenshots Damage / OmniStrike / ThrowBomb / NovaBurst
// for the PO. Counts (cards, previews, cheat-only, parked, mandatory
// targetFactions) are printed, not asserted: they move with content.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const url = process.argv[2] || 'http://localhost:4611';
const outdir = process.argv[3] || 'skills-shots';
mkdirSync(outdir, { recursive: true });

const workdir = join(homedir(), '.cache', 'aurahunter-run');
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

const groups = await page.$$eval('#skill-list li.list-group', (els) => els.map((g) => ({
  label: g.querySelector('.group-name').textContent,
  count: g.querySelectorAll('.group-items li').length,
})));
console.log('groups:', groups.map((g) => `${g.label} ${g.count}`).join(' · '));

const dirtyDots = await page.$$eval('#skill-list .group-items li.dirty', (els) => els.length);
if (dirtyDots) problems.push(`${dirtyDots} skill(s) show a dirty dot on load`);

const items = await page.$$eval('#skill-list .group-items li', (els) => els.map((li) => li.textContent.trim()));
console.log(`${items.length} skills in the sidebar`);

const stats = { cards: 0, previews: 0, cheatOnly: 0, sourced: 0, stray: 0, parked: 0, mandatory: 0 };
const perSkill = [];
for (const name of items) {
  await page.click(`#skill-list .group-items li:has-text("${name}")`, { strict: false }).catch(async () => {
    // has-text is substring; fall back to exact match
    const handle = await page.$$('#skill-list .group-items li');
    for (const h of handle) if ((await h.textContent()).trim() === name) { await h.click(); break; }
  });
  await page.waitForFunction(() => !document.getElementById('editor-root').hidden);
  const facts = await page.evaluate(() => {
    const root = document.getElementById('editor-root');
    return {
      title: root.querySelector('h2')?.textContent || '',
      badge: !!root.querySelector('.readonly-badge'),
      cards: root.querySelectorAll('.effect-card').length,
      previews: root.querySelectorAll('.level-table').length,
      cheatOnly: !!root.querySelector('.sources-panel .cheat-only'),
      sources: root.querySelectorAll('.sources-panel ul li').length,
      stray: root.querySelectorAll('.stray-key').length,
      parked: !!root.querySelector('.parked-banner'),
      mandatory: !!root.querySelector('.field.mandatory'),
      enabled: [...root.querySelectorAll('input, select, textarea')].filter((c) => !c.disabled).length,
      errLines: [...root.querySelectorAll('.err-line')].map((e) => e.textContent),
      saveButtons: [...root.querySelectorAll('button')].filter((b) => /save/i.test(b.textContent)).length,
    };
  });
  const header = await page.$eval('#editor-root h2', (h) => h.firstChild.textContent);
  if (!facts.badge) problems.push(`${name}: no read-only badge`);
  if (facts.enabled) problems.push(`${name}: ${facts.enabled} enabled control(s) in a read-only tab`);
  if (facts.saveButtons) problems.push(`${name}: a Save button exists`);
  if (facts.errLines.length) problems.push(`${name}: ${facts.errLines.join(' | ')}`);
  if (facts.cards === 0) problems.push(`${name}: no effect cards rendered`);
  stats.cards += facts.cards; stats.previews += facts.previews; stats.stray += facts.stray;
  if (facts.cheatOnly) stats.cheatOnly += 1; else stats.sourced += 1;
  if (facts.parked) stats.parked += 1;
  if (facts.mandatory) stats.mandatory += 1;
  perSkill.push({ name, header, ...facts });
}
console.log('totals:', JSON.stringify(stats));
console.log('parked:', perSkill.filter((p) => p.parked).map((p) => p.name).join(', '));
console.log('mandatory targetFactions:', perSkill.filter((p) => p.mandatory).map((p) => p.name).join(', '));
console.log('cheat-only:', perSkill.filter((p) => p.cheatOnly).map((p) => p.name).join(', '));

// Jump link: from Taunt's sources into CityGuard's node, sidebar must follow.
await page.click('#skill-list .group-items li:has-text("Taunt")');
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

for (const name of ['Damage', 'OmniStrike', 'ThrowBomb', 'NovaBurst']) {
  const handles = await page.$$('#skill-list .group-items li');
  for (const h of handles) if ((await h.textContent()).trim() === name) { await h.click(); break; }
  await page.waitForTimeout(100);
  await page.screenshot({ path: join(outdir, `${name}.png`), fullPage: true });
}

await browser.close();
for (const p of problems) console.log('PROBLEM', p);
console.log(`${problems.length} problem(s)`);
process.exit(problems.length ? 1 : 0);
