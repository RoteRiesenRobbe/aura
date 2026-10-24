#!/usr/bin/env node
// plan-appearance.md C1: the medallion frame stack on mobs and NPCs, read off
// the live scene graph at five venues. Per token near the player it reports
// the ring texture in the frame slot and its tier tint, and how
// far it reaches past the ring, and the drawn diameter, paired with the
// nameplate standing at the same position. Screenshots per venue for the eye.
//
// Expectations (D15, D23, M-D12, M-D14 as ruled 2026-10-17):
//   - every combat target / NPC carries exactly one ring sprite in `frame`,
//     drawn at its own size (2 x size = the collider diameter);
//   - Wolf / AlphaBoar wear the forest family, Bandit leather, the Hermit and
//     the Dragon grey, Grandfather Knot forest (his own ring, D23). Webpack
//     inlines the greyscale SVG rings as data URIs, so families are checked by
//     TEXTURE IDENTITY: one family = one shared texture, two families never;
//   - the tier tints the ring (PO 2026-10-17): normal / elite / boss each get
//     their own tint (Medallions.ringTint), and there is no rim layer.
// Report-style plus asserts; INCONCLUSIVE when a venue shows no subject.
//
// C1b (plan-appearance.md D31-D34) adds per subject: exactly one disc sprite
// in the token's `disc` slot, below the portrait, tinted DISC_SHADE and drawn
// at the pack portrait's 0.86 of the ring; and, when this build carries the
// pack, a pack portrait (a canvas-backed texture, PackIconFiles) with every
// subject's portrait a different texture (the wolf line no longer shares one).
//
// C2 (plan-appearance.md D28, D29, D32) tints the disc by the wire stance:
// each subject names the stance it reads idle (hostile red, neutral yellow,
// friendly blue; the harvestable Turnip is flora, neutral), and one live leg
// arms the starting aura on top of the Alpha Boar (prey): a boar it hits fights
// back and must read hostile. INCONCLUSIVE when the aura cannot be armed.
//
// C2b (plan-appearance.md D37, D38): one medallion for every token. At the
// spawn the player summons a Companion: the companion and the player each
// wear exactly one ring (the grey family, normal tint) over a friendly blue
// disc, and the starting Campfire is a plain object (no ring, no disc). At the
// front the plate-less ArmySoldiers wear the same.
//
// C3 (plan-appearance.md): a second, fresh profile picks the green-hood
// portrait and the leather ring at creation. Its own token must wear the
// leather ring (the Bandit's texture) and the green-hood bust (LOOK default
// swaps it away, LOOK green-hood brings the same texture back), the select
// card must show the same portrait and ring as the picker drew, and all of it
// must survive a relog.
//
// C4 (plan-appearance.md): the in-game Appearance panel on the same profile.
// C opens it, Escape closes it, the desktop button opens it, the spellbook
// opening closes it (PanelExclusivity); its selected tiles are the worn look.
// Picking the red hood changes the own wire value, the first client sees the
// second wearing it (the same texture the first wears by LOOK red-hood), and
// it survives a death + respawn and a relog through character select (the
// pick persists). A third, forced-?mobile page opens it from the ☰ sheet.
//
// C5 (plan-appearance.md): the same profile is not offered the locked forest
// ring at level 1; the XP cheat earns it with the "New look" toast, it is
// worn and survives a relog. A fourth page with a forged catalog offers it at
// level 1 and the server refuses the pick.
//
// C5c (plan-appearance.md): the panel shows the locked items greyed, the
// forest ring's GAME tooltip (#skillTooltip, no title attribute) naming the
// level with this character's progress from the server; the earned ring
// lights the Appearance button, glows in the picker for one visit and is seen
// once the panel shuts.
//
// Usage: node .claude/skills/verify/c1-medallions.mjs [label] [url]
// Screenshots go to C1_SHOT_DIR (default: the script's directory).
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync, readFileSync } from 'node:fs';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');
import { joinAsNewCharacter } from './lib/join.mjs';
import { showSkillRowAt } from './lib/spellbook.mjs';

const label = process.argv[2] || 'run';
const url = process.argv[3] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const shotDir = process.env.C1_SHOT_DIR || dirname(fileURLToPath(import.meta.url));
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

// Venue = a warp point near the subject's spawn; subject = the plate name and
// the ring file expected on it. Positions from api/zones/world.json.
const VENUES = [
  { name: 'wolf', at: [-190, -21], subjects: [['Wolf', 'forest', 'normal', 'hostile']] },
  { name: 'bandit', at: [-141, -23], subjects: [['Bandit', 'leather', 'normal', 'hostile']] },
  { name: 'alphaBoar', at: [-214, 35], subjects: [['Alpha Boar', 'forest', 'elite', 'neutral']] },
  { name: 'hermit', at: [-254, 5], subjects: [['Hermit', 'grey', 'normal', 'friendly']] },
  { name: 'knot', at: [40, -147], subjects: [['Grandfather Knot', 'forest', 'normal', 'friendly']] },
  { name: 'dragon', at: [211, 163], subjects: [['Dragon', 'grey', 'boss', 'hostile']] },
  // C1b (D31-D34): the wolf line's own portraits, a pack-tinted harvestable,
  // and placeholder species with their own (speciesPortraits) busts.
  { name: 'wolfLine', at: [-83, 172], subjects: [['Elite Wolf', 'forest', 'elite', 'hostile'], ['Alpha Wolf', 'forest', 'normal', 'hostile']] },
  { name: 'direWolf', at: [-160.4, 22.2], subjects: [['Dire Wolf', 'forest', 'normal', 'hostile']] },
  { name: 'turnip', at: [-192.4, 15.5], subjects: [['Turnip', 'grey', 'normal', 'neutral']] },
  { name: 'cultist', at: [165, -18.6], subjects: [['Cultist', 'grey', 'normal', 'hostile']] },
  { name: 'skeleton', at: [80.7, -27.7], subjects: [['Skeleton', 'grey', 'normal', 'hostile']] },
  // C2b: the army wears no plate (xpFactor 0, no talk); checked by layer below.
  { name: 'army', at: [-66, 154], subjects: [] },
];
// Medallions.ts STANCE_TINTS [PLACEHOLDER shades]; restated so a retune is loud.
const STANCE_TINTS = { hostile: 0xc0392b, neutral: 0xd4a017, friendly: 0x2e6fd8 };
const stanceOf = (tint) => Object.keys(STANCE_TINTS).find((k) => STANCE_TINTS[k] === tint) ?? `0x${tint?.toString(16)}`;
// Medallions.ts RING_TINTS [PLACEHOLDER shades]; restated so a retune is loud.
const TINTS = { normal: 0x707070, elite: 0xffffff, boss: 0xffd040 };

// The prod build serves assets under content hashes: map each hashed dist PNG
// back to its source border by bytes, so an expectation can name the source.
const repo = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const borderDir = join(repo, 'frontend/src/features/game-objects/assets/border');
const distDir = join(repo, 'frontend/dist');
const hashedToSource = {};
for (const b of readdirSync(borderDir).filter((f) => f.endsWith('.png'))) {
  const bytes = readFileSync(join(borderDir, b));
  for (const d of readdirSync(distDir).filter((f) => f.endsWith('.png'))) {
    if (readFileSync(join(distDir, d)).equals(bytes)) hashedToSource[d] = b.replace('.png', '');
  }
}
const sourceOf = (hashed) => hashedToSource[hashed] ?? hashed;

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const page = await (await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 800 } })).newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await joinAsNewCharacter(page, 'medal');
await page.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
const cmd = async (t) => {
  await page.evaluate((text) => {
    const input = document.getElementById('console_command');
    input.value = text;
    document.getElementById('console').dispatchEvent(new Event('submit', { cancelable: true }));
  }, t);
  await page.waitForTimeout(600);
};
await page.evaluate(() => {
  let r = window.game.character.plate.parent;
  while (r.parent) r = r.parent;
  window.__auraRoot = r;
  window.__plates = window.game.character.plate.parent;
  document.getElementById('developPanel').style.display = 'none';
});
await cmd('GOD on');
await cmd('SKILL SummonCompanion');

// Every token group (a container with a `token` child holding `frame`) plus
// the plate text standing on it.
const readTokensSource = () => {
  const out = [];
  const plates = window.__plates.children.map((p) => ({
    x: p.position.x, y: p.position.y,
    text: p.children.find((c) => typeof c.text === 'string')?.text ?? '',
  }));
  const walk = (c, layer) => {
    if (!c) return;
    const token = c.children?.find((k) => k.label === 'token');
    const frameSlot = token?.children?.find((k) => k.label === 'frame');
    if (token && frameSlot) {
      const frame = token.children.find((k) => k.label === 'frame');
      // A Graphics carries a texture too; the ring is the Sprite (discriminate
      // by `.context`, as c2-campfire-markers does).
      const ringSprites = frame.children.filter((k) => k.texture && !k.context);
      const src = (s) => String(s.texture?.source?.label ?? s.texture?.label ?? s.texture?.source?.resource?.src ?? '');
      const plate = plates.find((p) => Math.hypot(p.x - c.position.x, p.y - c.position.y) < 1);
      const discSlot = token.children.find((k) => k.label === 'disc');
      const portrait = token.children.find((k) => k.label === 'actualShape')?.children?.[0];
      const resource = portrait?.texture?.source?.resource;
      out.push({
        layer,
        plate: plate?.text ?? '',
        x: c.position.x / 120, y: c.position.y / 120,
        rings: ringSprites.map((s) => ({ src: src(s).split('/').pop().split('?')[0].slice(0, 40), uid: s.texture.source.uid, tint: s.tint, w: s.width })),
        discOrder: token.children.map((k) => k.label).join(','),
        discs: (discSlot?.children ?? []).map((d) => ({ tint: d.tint, w: d.width })),
        portrait: { uid: portrait?.texture?.source?.uid, pack: resource?.tagName === 'CANVAS' },
      });
      return;
    }
    (c.children || []).forEach((k) => walk(k, k.label && !k.children?.some((g) => g.label === 'token') ? k.label : layer));
  };
  walk(window.__auraRoot, 'root');
  const me = window.game.character;
  return { me: [me.getX() / 120, me.getY() / 120], tokens: out };
};
const readTokens = () => page.evaluate(readTokensSource);

const packIcons = await page.evaluate(async () =>
  Object.keys((await (await fetch('/icons/icons.json', { cache: 'no-store' })).json()).icons ?? {}).length);
let pass = 0, fail = 0, inconclusive = 0;
const portraits = []; // [portrait texture uid, label], for the distinct-portrait leg
const report = [];
const seen = []; // [family, texture uid, label] per subject, for the identity legs
// C2b: one medallion check, shared by the spawn and army legs.
const medallionProblems = (t, stance) => {
  const problems = [];
  if (t.rings.length !== 1) problems.push(`${t.rings.length} ring sprites`);
  else if (t.rings[0].tint !== TINTS.normal) problems.push(`ring tint 0x${t.rings[0].tint.toString(16)}, want normal`);
  if (t.discs.length !== 1) problems.push(`${t.discs.length} disc sprites`);
  else if (t.discs[0].tint !== STANCE_TINTS[stance]) problems.push(`disc reads ${stanceOf(t.discs[0].tint)}, want ${stance}`);
  return problems;
};
const check = (name, t, stance, family) => {
  if (!t) { inconclusive++; report.push(`INCONCLUSIVE ${name}: not in view`); return; }
  const problems = medallionProblems(t, stance);
  if (!problems.length && family) seen.push([family, t.rings[0].uid, name]);
  const line = `${name}: ring tex#${t.rings[0]?.uid} 0x${t.rings[0]?.tint?.toString(16)} ${t.rings[0]?.w?.toFixed(0)}px disc ${stanceOf(t.discs[0]?.tint)}`;
  if (problems.length) { fail++; report.push(`FAIL ${line} -> ${problems.join('; ')}`); } else { pass++; report.push(`PASS ${line}`); }
};
{
  // Summon the companion (the chunk2-follower flow): equip from the book, hold Q.
  const row = await page.evaluate(() =>
    [...document.querySelectorAll('#spellbookList li')].findIndex((li) => /Companion/i.test(li.textContent)));
  if (row >= 0) {
    await showSkillRowAt(page, row);
    const box = await (await page.$$('#spellbookList li'))[row].boundingBox();
    await page.mouse.click(box.x + 25, box.y + box.height / 2);
    await page.waitForTimeout(700);
    const sb = await (await page.$('#cooldownSlotList li:first-child')).boundingBox();
    await page.mouse.click(sb.x + sb.width / 2, sb.y + sb.height / 2);
    await page.waitForTimeout(700);
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.down('q');
    await page.waitForTimeout(1400);
    await page.keyboard.up('q');
    await page.waitForTimeout(4000);
  }
  const snap = await readTokens();
  await page.screenshot({ path: join(shotDir, `c1-${label}-spawn.png`) });
  check('player', snap.tokens.find((t) => t.layer === 'characters'), 'friendly', 'grey');
  check('companion', snap.tokens.find((t) => t.layer === 'companion'), 'friendly', 'grey');
  const fire = snap.tokens.find((t) => t.layer === 'campfireMob');
  if (!fire) { inconclusive++; report.push('INCONCLUSIVE campfire: not in view'); }
  else if (fire.rings.length || fire.discs.length) { fail++; report.push(`FAIL campfire: ${fire.rings.length} rings, ${fire.discs.length} discs, want a plain object`); }
  else { pass++; report.push('PASS campfire: a plain object (no ring, no disc)'); }
}
for (const v of VENUES) {
  await cmd(`WARP ${v.at[0] * 120} ${v.at[1] * 120}`);
  // Let the camera settle (WARP gotcha) and the catalog-driven ring land.
  await page.waitForTimeout(8000);
  const snap = await readTokens();
  for (const t of snap.tokens) t.rings.forEach((r) => { r.src = sourceOf(r.src); });
  await page.screenshot({ path: join(shotDir, `c1-${label}-${v.name}.png`) });
  for (const [plateName, ringFile, tier, stance] of v.subjects) {
    const t = snap.tokens.find((k) => k.plate.startsWith(plateName + ' ') || k.plate === plateName);
    if (!t) { inconclusive++; report.push(`INCONCLUSIVE ${v.name}: no "${plateName}" in view`); continue; }
    const problems = [];
    if (t.rings.length !== 1) problems.push(`${t.rings.length} ring sprites`);
    else {
      seen.push([ringFile, t.rings[0].uid, `${v.name}/${t.plate}`]);
      if (t.rings[0].tint !== TINTS[tier]) problems.push(`tint 0x${t.rings[0].tint.toString(16)}, want 0x${TINTS[tier].toString(16)} (${tier})`);
      if (t.discOrder !== 'disc,actualShape,frame,indicators') problems.push(`token order ${t.discOrder}`);
      if (t.discs.length !== 1) problems.push(`${t.discs.length} disc sprites`);
      else {
        if (t.discs[0].tint !== STANCE_TINTS[stance]) problems.push(`disc reads ${stanceOf(t.discs[0].tint)}, want ${stance}`);
        if (Math.abs(t.discs[0].w - t.rings[0].w * 0.86) > 1) problems.push(`disc ${t.discs[0].w.toFixed(1)}px, want 0.86 x ${t.rings[0].w.toFixed(1)}`);
      }
      if (packIcons > 0) {
        if (!t.portrait.pack) problems.push('portrait is not the pack bust');
        portraits.push([t.portrait.uid, `${v.name}/${t.plate}`]);
      }
    }
    const line = `${v.name}: "${t.plate}" family=${ringFile} tex#${t.rings[0]?.uid} tint=0x${t.rings[0]?.tint?.toString(16)} ${t.rings[0]?.w?.toFixed(0)}px disc=${t.discs[0]?.w?.toFixed(0)}px ${stanceOf(t.discs[0]?.tint)} portrait#${t.portrait.uid}${t.portrait.pack ? ' pack' : ''}`;
    if (problems.length) { fail++; report.push(`FAIL ${line} -> ${problems.join('; ')}`); }
    else { pass++; report.push(`PASS ${line}`); }
  }
  if (v.name === 'army') {
    const soldiers = snap.tokens.filter((t) => t.layer === 'wildlife' && !t.plate);
    if (!soldiers.length) { inconclusive++; report.push('INCONCLUSIVE army: no ArmySoldier in view'); }
    soldiers.forEach((t, i) => check(`army/soldier${i + 1}`, t, 'friendly', 'grey'));
  }
  // Every OTHER token in view: bare (no ring) is fine for fixtures, but more
  // than one ring sprite never is.
  for (const t of snap.tokens) {
    if (t.rings.length > 1) { fail++; report.push(`FAIL ${v.name}: "${t.plate}" carries ${t.rings.length} ring sprites`); }
  }
  report.push(`  (${v.name} census: ${snap.tokens.map((t) => `${t.plate || '?'}[${t.rings.length ? `tex#${t.rings[0].uid} 0x${t.rings[0].tint.toString(16)}` : 'bare'} ${t.rings[0]?.w?.toFixed(0) ?? '-'}px]`).join(' ')})`);
}
// C2 live leg (D28): prey reads neutral until it fights back. Arm the starting
// aura, stand on the Alpha Boar, and its disc must turn hostile.
{
  const boarVenue = VENUES.find((v) => v.name === 'alphaBoar');
  await cmd(`WARP ${boarVenue.at[0] * 120} ${boarVenue.at[1] * 120}`);
  await page.waitForTimeout(8000);
  const slot = await page.$('#auraSlotList li');
  const sbox = slot && await slot.boundingBox();
  let armed = false;
  for (let i = 0; sbox && i < 5 && !armed; i++) {
    await page.mouse.click(sbox.x + sbox.width / 2, sbox.y + sbox.height / 2);
    await page.waitForTimeout(1200);
    armed = await page.evaluate(() => !!document.querySelector('#auraSlotList .auraSlot.activeSlot'));
  }
  const find = async () => (await readTokens()).tokens.find((k) => k.plate.startsWith('Alpha Boar'));
  let boar = await find();
  if (!armed || !boar) {
    inconclusive++;
    report.push(`INCONCLUSIVE live stance: ${armed ? 'no Alpha Boar in view' : 'the starting aura never armed'}`);
  } else {
    // The aura hits whichever prey is nearest, so any boar in view may be
    // the one that fights back; the idle ones must stay neutral meanwhile.
    const boars = () => readTokens().then((r) => r.tokens.filter((k) => /^(Alpha )?Boar\b/.test(k.plate)));
    let seenBoars = [];
    for (let i = 0; i < 15 && !seenBoars.some((k) => k.discs[0]?.tint === STANCE_TINTS.hostile); i++) {
      if (i % 3 === 0) await cmd(`WARP ${Math.round(boar.x * 120)} ${Math.round(boar.y * 120)}`);
      await page.waitForTimeout(1500);
      seenBoars = await boars();
    }
    await page.screenshot({ path: join(shotDir, `c1-${label}-alphaBoar-hit.png`) });
    const dump = seenBoars.map((k) => `${k.plate}=${stanceOf(k.discs[0]?.tint)}`).join(' ');
    if (seenBoars.some((k) => k.discs[0]?.tint === STANCE_TINTS.hostile)) { pass++; report.push(`PASS live stance: a boar under the aura reads hostile (${dump})`); }
    else { fail++; report.push(`FAIL live stance: no boar under the aura reads hostile (${dump})`); }
  }
}
// Family identity: same family -> same texture, different family -> different.
{
  // C3: a fresh profile with a chosen look.
  const ctx = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 800 } });
  const p2 = await ctx.newPage();
  // A background page throttles its frames, and the look is drawn per frame.
  await p2.bringToFront();
  p2.on('console', (m) => { if (m.type() === 'error') errors.push('c3: ' + m.text()); });
  p2.on('pageerror', (e) => errors.push('c3 pageerror: ' + e.message));
  const ok = (cond, line) => { if (cond) { pass++; report.push(`PASS ${line}`); } else { fail++; report.push(`FAIL ${line}`); } };
  const tile = (slot, id) => `#characterCreation .lookOptions[data-slot="${slot}"] .lookOption[data-item="${id}"]`;
  const srcs = (sel) => p2.evaluate((q) => {
    const el = document.querySelector(q);
    return { portrait: el?.querySelector('.medallionPortrait')?.getAttribute('src'), ring: el?.querySelector('.medallionRing')?.getAttribute('src') };
  }, sel);
  await p2.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await p2.waitForSelector(tile('portrait', 'green-hood'), { timeout: 120_000 });
  const tiles = await p2.locator('#characterCreation .lookOption').count();
  ok(tiles === 10, `picker offers ${tiles} starter tiles (8 portraits + 2 rings)`);
  const plainRing = (await srcs(tile('ring', 'ring-plain') + ' .medallion')).ring;
  await p2.click(tile('portrait', 'green-hood'));
  await p2.click(tile('ring', 'ring-leather'));
  const preview = await srcs('#characterCreation .lookPreview .medallion');
  const picked = await p2.evaluate(() => document.querySelector('#characterCreation .lookPreview .medallion')?.dataset);
  ok(picked?.portrait === 'green-hood' && picked?.ring === 'ring-leather', `preview wears ${picked?.portrait} + ${picked?.ring}`);
  ok(preview.ring && preview.ring !== plainRing, 'preview ring is not the plain ring');
  await p2.screenshot({ path: join(shotDir, `c1-${label}-c3-picker.png`) });

  let lookName = '';
  const enterWorld = async () => {
    lookName = await joinAsNewCharacter(p2, 'look');
    await p2.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
    await p2.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
    await p2.evaluate(() => {
      let r = window.game.character.plate.parent;
      while (r.parent) r = r.parent;
      window.__auraRoot = r;
      window.__plates = window.game.character.plate.parent;
      document.getElementById('developPanel').style.display = 'none';
    });
  };
  const cmd2 = async (t) => {
    await p2.evaluate((text) => {
      document.getElementById('console_command').value = text;
      document.getElementById('console').dispatchEvent(new Event('submit', { cancelable: true }));
    }, t);
    await p2.waitForTimeout(1500);
  };
  const readTokens2 = async () => {
    const fn = readTokensSource;
    return p2.evaluate(fn);
  };
  // In the world: the own ring is the Bandit's leather ring, the own bust the
  // green hood, by texture identity inside this page.
  const worldLegs = async (when) => {
    await cmd2('GOD on');
    const v = VENUES.find((x) => x.name === 'bandit');
    await cmd2(`WARP ${v.at[0] * 120} ${v.at[1] * 120}`);
    await p2.waitForTimeout(8000);
    const snap = await readTokens2();
    const me = snap.tokens.find((t) => t.layer === 'characters');
    const bandit = snap.tokens.find((t) => t.plate.startsWith('Bandit'));
    if (!me || !bandit) { inconclusive++; report.push(`INCONCLUSIVE c3 ${when}: player or Bandit not in view`); return; }
    ok(me.rings.length === 1 && me.rings[0].uid === bandit.rings[0]?.uid, `c3 ${when}: own ring tex#${me.rings[0]?.uid} is the Bandit's leather tex#${bandit.rings[0]?.uid}`);
    await p2.screenshot({ path: join(shotDir, `c1-${label}-c3-${when}.png`) });
    if (packIcons === 0) { report.push(`c3 ${when}: no pack icons, portrait leg skipped`); return; }
    // The medallion's own portrait sprite (actualShape holds more than it).
    const ownPortrait = () => p2.evaluate(() => {
      const t = window.game.character.medallion.portrait.texture;
      return { uid: t.source.uid, pack: t.source.resource?.tagName === 'CANVAS' };
    });
    // Wait for the wire to name the look, then for frames to draw it.
    const wearing = async (id) => {
      await cmd2(`LOOK ${id}`);
      await p2.waitForFunction((want) => {
        const c = window.game.character;
        const items = window.__appearanceIds;
        return c.portraitWire === items.indexOf(want) + 1;
      }, id, { timeout: 15_000 });
      await p2.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 300)))));
      return ownPortrait();
    };
    await p2.evaluate(async () => {
      window.__appearanceIds = (await (await fetch('/appearance')).json()).portraits.map((p) => p.id);
    });
    const first = await ownPortrait();
    const worn = first.uid;
    const swapped = (await wearing('default')).uid;
    const back = (await wearing('green-hood')).uid;
    const wires = await p2.evaluate(() => [window.game.character.portraitWire, window.game.character.ringWire]);
    ok(first.pack && swapped !== worn && back === worn, `c3 ${when}: own portrait is the green-hood bust (tex#${worn} pack=${first.pack}; LOOK default -> tex#${swapped}, back -> tex#${back}; wire ${wires})`);
  };
  await enterWorld();
  await worldLegs('created');

  // Relog, the in-product way out (chunk4-persistence): leaving ends the
  // world session, so coming back is a cold join that reads the row. A page
  // reload would reconnect into the stashed character instead.
  await p2.click('#gameSettingsButton');
  await p2.click('#leaveToCharacterSelect');
  await p2.waitForSelector('#characterSelect:not(.hidden) .slotCard .medallion', { timeout: 60_000 });
  await p2.waitForTimeout(2000);
  const card = await srcs('#characterSelect .slotCard .medallion');
  const cardLook = await p2.evaluate(() => document.querySelector('#characterSelect .slotCard .medallion')?.dataset);
  ok(cardLook?.portrait === 'green-hood' && cardLook?.ring === 'ring-leather', `select card wears ${cardLook?.portrait} + ${cardLook?.ring}`);
  ok(card.ring === preview.ring, 'select card ring is the picked ring art');
  ok(card.portrait === preview.portrait, 'select card portrait is the picked portrait art');
  await p2.screenshot({ path: join(shotDir, `c1-${label}-c3-select.png`) });
  await enterWorld();
  await worldLegs('relogged');

  // --- C4: the in-game Appearance panel -----------------------------------
  const panelOpen = () => p2.evaluate(() => !document.getElementById('appearance').classList.contains('hidden'));
  const worn = () => p2.evaluate(() => [...document.querySelectorAll('#appearance .lookOption.selected')].map((t) => t.dataset.item));
  const press = async (key) => { await p2.keyboard.press(key); await p2.waitForTimeout(300); };
  await p2.mouse.click(640, 300); // focus the game, not the console
  await press('KeyC');
  ok(await panelOpen(), 'c4: C opens the Appearance panel');
  const panelTiles = await p2.locator('#appearance .lookOption:not(.locked)').count();
  ok(panelTiles === 10, `c4: the panel offers ${panelTiles} starter tiles (8 portraits + 2 rings)`);
  ok(JSON.stringify(await worn()) === JSON.stringify(['green-hood', 'ring-leather']), `c4: the panel shows the worn look ${await worn()}`);
  await press('Escape');
  ok(!(await panelOpen()), 'c4: Escape closes it');
  await p2.click('#appearanceButton');
  ok(await panelOpen(), 'c4: the desktop button opens it');
  await p2.screenshot({ path: join(shotDir, `c1-${label}-c4-panel.png`) });
  await p2.click('#spellbookButton');
  await p2.waitForTimeout(300);
  ok(!(await panelOpen()), 'c4: opening the spellbook closes it');
  await press('Escape');

  const redHood = await p2.evaluate(() => window.__appearanceIds.indexOf('red-hood') + 1);
  await press('KeyC');
  await p2.click('#appearance .lookOption[data-item="red-hood"]');
  const pickedRed = await p2.waitForFunction((w) => window.game.character.portraitWire === w, redHood, { timeout: 15_000 })
    .then(() => true).catch(() => false);
  ok(pickedRed, `c4: picking the red hood sets the own portrait wire to ${redHood}`);
  await p2.waitForTimeout(500);
  ok(JSON.stringify(await worn()) === JSON.stringify(['red-hood', 'ring-leather']), `c4: the panel follows the server: ${await worn()}`);
  await press('Escape');

  // The first client, at the same spot, sees it (texture identity: it wears
  // the red hood itself by LOOK and compares busts).
  if (packIcons > 0) {
    const v = VENUES.find((x) => x.name === 'bandit');
    // Two units to the side: on the same spot the two tokens overlap, and a
    // player's name is not in the plate layer, so the tokens are told apart
    // by position (the second client stands at the venue point).
    await cmd(`WARP ${(v.at[0] + 2) * 120} ${v.at[1] * 120}`);
    await cmd('LOOK red-hood');
    await page.bringToFront();
    await page.waitForTimeout(6000);
    const snap = await readTokens();
    const dist = (t, x, y) => Math.hypot(t.x - x, t.y - y);
    const chars = snap.tokens.filter((t) => t.layer === 'characters');
    const mine = chars.sort((a, b) => dist(a, ...snap.me) - dist(b, ...snap.me))[0];
    const theirs = chars.filter((t) => t !== mine && dist(t, v.at[0], v.at[1]) < 1.5)[0];
    if (!theirs) { inconclusive++; report.push(`INCONCLUSIVE c4: ${lookName} not in the first client's view`); }
    else ok(theirs.portrait.uid === mine?.portrait.uid, `c4: the first client sees ${lookName} in the red hood (tex#${theirs.portrait.uid} = own red hood tex#${mine?.portrait.uid})`);
    await page.screenshot({ path: join(shotDir, `c1-${label}-c4-observer.png`) });
    await p2.bringToFront();
  } else report.push('c4: no pack icons, observer leg skipped');

  // Death + respawn keeps it (the C3 gap C4 closed: deadState carries the look).
  await cmd2('GOD off');
  await cmd2('KILL');
  const died = await p2.waitForFunction(() => document.getElementById('endScreen')?.classList.contains('showing'), null, { timeout: 15_000 })
    .then(() => true).catch(() => false);
  await p2.waitForTimeout(2500);
  await p2.evaluate(() => document.querySelector('#endScreen .playerNameSubmit')?.click());
  await p2.waitForFunction(() => !document.getElementById('endScreen')?.classList.contains('showing'), null, { timeout: 20_000 }).catch(() => null);
  await p2.waitForTimeout(3000);
  await p2.mouse.click(640, 300);
  await press('KeyC');
  ok(died && JSON.stringify(await worn()) === JSON.stringify(['red-hood', 'ring-leather']), `c4: after a death and respawn (died ${died}) the panel shows ${await worn()}`);
  await press('Escape');

  // Relog: the pick was saved, the select card reads the row.
  await p2.click('#gameSettingsButton');
  await p2.click('#leaveToCharacterSelect');
  await p2.waitForSelector('#characterSelect:not(.hidden) .slotCard .medallion', { timeout: 60_000 });
  await p2.waitForTimeout(2000);
  const savedLook = await p2.evaluate(() => document.querySelector('#characterSelect .slotCard .medallion')?.dataset);
  ok(savedLook?.portrait === 'red-hood' && savedLook?.ring === 'ring-leather', `c4: after a relog the select card wears ${savedLook?.portrait} + ${savedLook?.ring}`);
  await enterWorld();
  await p2.waitForTimeout(3000);
  await p2.mouse.click(640, 300);
  await press('KeyC');
  ok(JSON.stringify(await worn()) === JSON.stringify(['red-hood', 'ring-leather']), `c4: back in the world the panel shows ${await worn()}`);
  await press('Escape');

  // --- C5: ownership and unlocks ------------------------------------------
  // The forest ring is a character item at level 3 [PLACEHOLDER]: not offered
  // to a fresh character, earned by the XP cheat with the toast, then worn and
  // kept through a relog (the save writes it at character scope).
  const offered = () => p2.evaluate(() => [...document.querySelectorAll('#appearance .lookOption')].map((t) => t.dataset.item));
  const forestWire = await p2.evaluate(async () => (await (await fetch('/appearance')).json()).rings.findIndex((r) => r.id === 'ring-forest') + 1);
  ok(forestWire > 0, `c5: /appearance serves the locked ring-forest (wire ${forestWire})`);
  const lockedTiles = () => p2.evaluate(() => [...document.querySelectorAll('#appearance .lookOption.locked')].map((t) => t.dataset.item));
  const forestTile = () => p2.evaluate(() => {
    const t = document.querySelector('#appearance .lookOption[data-item="ring-forest"]');
    return t && { locked: t.classList.contains('locked'), fresh: t.classList.contains('fresh') };
  });
  await press('KeyC');
  const locked = await forestTile();
  ok(locked?.locked, `c5c: a level-1 character sees the forest ring locked (locked tiles ${await lockedTiles()})`);
  // The game's tooltip (#skillTooltip), never the browser's title (PO 2026-10-23).
  await p2.hover('#appearance .lookOption[data-item="ring-forest"]');
  await p2.waitForTimeout(300);
  const tip = await p2.evaluate(() => {
    const t = document.getElementById('skillTooltip');
    return { shown: !!t && !t.classList.contains('hidden'), text: t?.innerText ?? '', titles: document.querySelectorAll('#appearance .lookOption[title]').length };
  });
  ok(tip.shown && /Forest Ring/.test(tip.text) && /Locked: level 3 \(1\/3\)/.test(tip.text) && tip.titles === 0,
    `c5c: the game tooltip names the level with the progress, no title attribute: ${JSON.stringify(tip)}`);
  await p2.screenshot({ path: join(shotDir, `c1-${label}-c5c-locked.png`) });
  // plan-appearance.md C5b: a look only a stone gives is locked with no progress.
  await p2.hover('#appearance .lookOption[data-item="gold-amulet"]');
  await p2.waitForTimeout(300);
  const stoneTip = await p2.evaluate(() => {
    const tile = document.querySelector('#appearance .lookOption[data-item="gold-amulet"]');
    const t = document.getElementById('skillTooltip');
    return { locked: !!tile?.classList.contains('locked'), text: t && !t.classList.contains('hidden') ? t.innerText : '' };
  });
  ok(stoneTip.locked && /Gold Amulet/.test(stoneTip.text) && /Locked: a gift of an ascension stone/.test(stoneTip.text),
    `c5b: the stone's gift is locked and its tooltip says so: ${JSON.stringify(stoneTip)}`);
  await p2.click('#appearance .lookOption[data-item="ring-forest"]', { force: true }); // aria-disabled: Playwright waits for enabled otherwise
  await p2.waitForTimeout(1500);
  ok(!(await worn()).includes('ring-forest'), 'c5c: pressing the locked tile wears nothing');
  await press('Escape');
  await p2.evaluate(() => {
    window.__banners = [];
    const b = document.getElementById('alertBanner');
    new MutationObserver(() => window.__banners.push(b.textContent)).observe(b, { childList: true, subtree: true, characterData: true });
  });
  await cmd2('XP 5000');
  // The banner is a queue (4.9 s each) and the level-ups queue their own
  // rewards ahead of the look's, so give it time.
  const toast = await p2.waitForFunction(() => window.__banners.some((t) => /New look: Forest Ring/.test(t)), null, { timeout: 90_000 })
    .then(() => true).catch(() => false);
  ok(toast, `c5: the level-up fires the "New look: Forest Ring" toast (banners seen: ${(await p2.evaluate(() => window.__banners.length))})`);
  const crumb = await p2.evaluate(() => document.getElementById('appearanceButton').classList.contains('breadcrumb'));
  ok(crumb, 'c5c: the earned ring lights the Appearance button');
  await press('KeyC');
  const earned = await forestTile();
  ok(earned && !earned.locked && earned.fresh, `c5c: the panel offers the forest ring, glowing (${JSON.stringify(earned)})`);
  await p2.click('#appearance .lookOption[data-item="ring-forest"]');
  const woreForest = await p2.waitForFunction((w) => window.game.character.ringWire === w, forestWire, { timeout: 15_000 })
    .then(() => true).catch(() => false);
  ok(woreForest, `c5: the earned forest ring is worn (own ring wire ${forestWire})`);
  await p2.screenshot({ path: join(shotDir, `c1-${label}-c5-earned.png`) });
  await press('Escape');
  const seenAfter = await p2.evaluate(() => document.getElementById('appearanceButton').classList.contains('breadcrumb'));
  await press('KeyC');
  ok(!seenAfter && !(await forestTile())?.fresh, 'c5c: shutting the panel counts it as seen (no breadcrumb, no glow)');
  await press('Escape');
  await p2.click('#gameSettingsButton');
  await p2.click('#leaveToCharacterSelect');
  await p2.waitForSelector('#characterSelect:not(.hidden) .slotCard .medallion', { timeout: 60_000 });
  await p2.waitForTimeout(2000);
  const savedRing = await p2.evaluate(() => document.querySelector('#characterSelect .slotCard .medallion')?.dataset.ring);
  ok(savedRing === 'ring-forest', `c5: after a relog the select card wears ${savedRing}`);
  await enterWorld();
  await p2.waitForTimeout(3000);
  await p2.mouse.click(640, 300);
  await press('KeyC');
  ok((await offered()).includes('ring-forest') && (await worn()).includes('ring-forest'),
    `c5: back in the world the forest ring is still owned and worn (${await worn()})`);
  await ctx.close();

  // A locked pick is refused by the SERVER: a client whose catalog is forged
  // to call the forest ring a starter offers it, presses it, and keeps its ring.
  const fctx = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 800 } });
  await fctx.route('**/appearance**', async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    for (const r of body.rings) if (r.id === 'ring-forest') r.starter = true;
    await route.fulfill({ response: res, json: body });
  });
  const fp = await fctx.newPage();
  fp.on('pageerror', (e) => errors.push('c5 forged pageerror: ' + e.message));
  await fp.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await joinAsNewCharacter(fp, 'lockd');
  await fp.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
  await fp.evaluate(() => { const d = document.getElementById('developPanel'); if (d) d.style.display = 'none'; });
  await fp.waitForTimeout(3000);
  await fp.mouse.click(640, 300);
  await fp.keyboard.press('KeyC');
  await fp.waitForTimeout(500);
  const forgedTile = await fp.locator('#appearance .lookOption[data-item="ring-forest"]').count();
  const before = await fp.evaluate(() => window.game.character.ringWire);
  if (forgedTile === 1) await fp.click('#appearance .lookOption[data-item="ring-forest"]');
  await fp.waitForTimeout(3000);
  const after = await fp.evaluate(() => window.game.character.ringWire);
  ok(forgedTile === 1 && after === before && after !== forestWire,
    `c5: the server refuses a locked ring (forged tile ${forgedTile}, ring wire ${before} -> ${after}, forest is ${forestWire})`);
  await fctx.close();

  // The phone: the ☰ sheet's row opens it, full screen.
  const mctx = await browser.newContext({ locale: 'en-US', viewport: { width: 390, height: 844 } });
  const mp = await mctx.newPage();
  mp.on('pageerror', (e) => errors.push('c4 mobile pageerror: ' + e.message));
  await mp.goto(url + '&mobile', { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await joinAsNewCharacter(mp, 'lookm');
  await mp.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
  await mp.evaluate(() => { const d = document.getElementById('developPanel'); if (d) d.style.display = 'none'; });
  await mp.waitForTimeout(3000);
  const desktopButtonHidden = await mp.evaluate(() => getComputedStyle(document.getElementById('appearanceButton')).display === 'none');
  await mp.click('#mobileMenuButton');
  await mp.waitForTimeout(300);
  await mp.click('#appearanceSheetButton');
  await mp.waitForTimeout(500);
  const mobile = await mp.evaluate(() => {
    const r = document.getElementById('appearance').getBoundingClientRect();
    return { open: !document.getElementById('appearance').classList.contains('hidden'), w: r.width, h: r.height, tiles: document.querySelectorAll('#appearance .lookOption:not(.locked)').length };
  });
  ok(desktopButtonHidden && mobile.open && mobile.w >= 389 && mobile.tiles === 10,
    `c4 mobile: desktop button hidden ${desktopButtonHidden}, the ☰ row opens it (${mobile.open}) full screen ${mobile.w}x${mobile.h}, ${mobile.tiles} tiles`);
  await mp.screenshot({ path: join(shotDir, `c1-${label}-c4-mobile.png`) });
  await mctx.close();
}
for (let i = 0; i < seen.length; i++) {
  for (let j = i + 1; j < seen.length; j++) {
    const [fa, ua, la] = seen[i], [fb, ub, lb] = seen[j];
    if ((fa === fb) !== (ua === ub)) { fail++; report.push(`FAIL family identity: ${la} (${fa}, tex#${ua}) vs ${lb} (${fb}, tex#${ub})`); }
  }
}
report.push(`family identity: ${seen.length} subjects checked pairwise`);
// D33/D34: every subject draws its own bust (the wolf line used to share one).
for (let i = 0; i < portraits.length; i++) {
  for (let j = i + 1; j < portraits.length; j++) {
    if (portraits[i][0] === portraits[j][0]) { fail++; report.push(`FAIL shared portrait: ${portraits[i][1]} and ${portraits[j][1]} (tex#${portraits[i][0]})`); }
  }
}
report.push(packIcons > 0 ? `portraits: ${portraits.length} pack busts checked pairwise (${packIcons} pack icons in this build)` : 'portraits: this build has no pack icons, pack legs skipped');
if (errors.length) { fail++; report.push(`FAIL page errors: ${errors.slice(0, 5).join(' | ')}`); }
console.log(report.join('\n'));
console.log(`\n${label}: ${pass} PASS / ${fail} FAIL / ${inconclusive} INCONCLUSIVE`);
await browser.close();
process.exit(fail ? 1 : 0);
