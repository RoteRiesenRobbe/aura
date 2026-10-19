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
  { name: 'hermit', at: [-121, -29], subjects: [['Hermit', 'grey', 'normal', 'friendly']] },
  { name: 'knot', at: [40, -147], subjects: [['Grandfather Knot', 'forest', 'normal', 'friendly']] },
  { name: 'dragon', at: [211, 163], subjects: [['Dragon', 'grey', 'boss', 'hostile']] },
  // C1b (D31-D34): the wolf line's own portraits, a pack-tinted harvestable,
  // and placeholder species with their own (speciesPortraits) busts.
  { name: 'wolfLine', at: [-83, 172], subjects: [['Elite Wolf', 'forest', 'elite', 'hostile'], ['Alpha Wolf', 'forest', 'normal', 'hostile']] },
  { name: 'direWolf', at: [-160.4, 22.2], subjects: [['Dire Wolf', 'forest', 'normal', 'hostile']] },
  { name: 'turnip', at: [-192.4, 15.5], subjects: [['Turnip', 'grey', 'normal', 'neutral']] },
  { name: 'cultist', at: [165, -18.6], subjects: [['Cultist', 'grey', 'normal', 'hostile']] },
  { name: 'skeleton', at: [80.7, -27.7], subjects: [['Skeleton', 'grey', 'normal', 'hostile']] },
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

// Every token group (a container with a `token` child holding `frame`) plus
// the plate text standing on it.
const readTokens = () => page.evaluate(() => {
  const out = [];
  const plates = window.__plates.children.map((p) => ({
    x: p.position.x, y: p.position.y,
    text: p.children.find((c) => typeof c.text === 'string')?.text ?? '',
  }));
  const walk = (c) => {
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
        plate: plate?.text ?? '',
        x: c.position.x / 120, y: c.position.y / 120,
        rings: ringSprites.map((s) => ({ src: src(s).split('/').pop().split('?')[0].slice(0, 40), uid: s.texture.source.uid, tint: s.tint, w: s.width })),
        discOrder: token.children.map((k) => k.label).join(','),
        discs: (discSlot?.children ?? []).map((d) => ({ tint: d.tint, w: d.width })),
        portrait: { uid: portrait?.texture?.source?.uid, pack: resource?.tagName === 'CANVAS' },
      });
      return;
    }
    (c.children || []).forEach(walk);
  };
  walk(window.__auraRoot);
  const me = window.game.character;
  return { me: [me.getX() / 120, me.getY() / 120], tokens: out };
});

const packIcons = await page.evaluate(async () =>
  Object.keys((await (await fetch('/icons/icons.json', { cache: 'no-store' })).json()).icons ?? {}).length);
let pass = 0, fail = 0, inconclusive = 0;
const portraits = []; // [portrait texture uid, label], for the distinct-portrait leg
const report = [];
const seen = []; // [family, texture uid, label] per subject, for the identity legs
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
      if (t.discOrder !== 'disc,actualShape,frame') problems.push(`token order ${t.discOrder}`);
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
