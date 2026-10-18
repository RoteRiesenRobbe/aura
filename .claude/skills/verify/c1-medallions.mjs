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
  { name: 'wolf', at: [-190, -21], subjects: [['Wolf', 'forest', 'normal']] },
  { name: 'bandit', at: [-141, -23], subjects: [['Bandit', 'leather', 'normal']] },
  { name: 'alphaBoar', at: [-214, 35], subjects: [['Alpha Boar', 'forest', 'elite']] },
  { name: 'hermit', at: [-121, -29], subjects: [['Hermit', 'grey', 'normal']] },
  { name: 'knot', at: [40, -147], subjects: [['Grandfather Knot', 'forest', 'normal']] },
  { name: 'dragon', at: [211, 163], subjects: [['Dragon', 'grey', 'boss']] },
];
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
      out.push({
        plate: plate?.text ?? '',
        x: c.position.x / 120, y: c.position.y / 120,
        rings: ringSprites.map((s) => ({ src: src(s).split('/').pop().split('?')[0].slice(0, 40), uid: s.texture.source.uid, tint: s.tint, w: s.width })),
      });
      return;
    }
    (c.children || []).forEach(walk);
  };
  walk(window.__auraRoot);
  const me = window.game.character;
  return { me: [me.getX() / 120, me.getY() / 120], tokens: out };
});

let pass = 0, fail = 0, inconclusive = 0;
const report = [];
const seen = []; // [family, texture uid, label] per subject, for the identity legs
for (const v of VENUES) {
  await cmd(`WARP ${v.at[0] * 120} ${v.at[1] * 120}`);
  // Let the camera settle (WARP gotcha) and the catalog-driven ring land.
  await page.waitForTimeout(8000);
  const snap = await readTokens();
  for (const t of snap.tokens) t.rings.forEach((r) => { r.src = sourceOf(r.src); });
  await page.screenshot({ path: join(shotDir, `c1-${label}-${v.name}.png`) });
  for (const [plateName, ringFile, tier] of v.subjects) {
    const t = snap.tokens.find((k) => k.plate.startsWith(plateName + ' ') || k.plate === plateName);
    if (!t) { inconclusive++; report.push(`INCONCLUSIVE ${v.name}: no "${plateName}" in view`); continue; }
    const problems = [];
    if (t.rings.length !== 1) problems.push(`${t.rings.length} ring sprites`);
    else {
      seen.push([ringFile, t.rings[0].uid, `${v.name}/${t.plate}`]);
      if (t.rings[0].tint !== TINTS[tier]) problems.push(`tint 0x${t.rings[0].tint.toString(16)}, want 0x${TINTS[tier].toString(16)} (${tier})`);
    }
    const line = `${v.name}: "${t.plate}" family=${ringFile} tex#${t.rings[0]?.uid} tint=0x${t.rings[0]?.tint?.toString(16)} ${t.rings[0]?.w?.toFixed(0)}px`;
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
// Family identity: same family -> same texture, different family -> different.
for (let i = 0; i < seen.length; i++) {
  for (let j = i + 1; j < seen.length; j++) {
    const [fa, ua, la] = seen[i], [fb, ub, lb] = seen[j];
    if ((fa === fb) !== (ua === ub)) { fail++; report.push(`FAIL family identity: ${la} (${fa}, tex#${ua}) vs ${lb} (${fb}, tex#${ub})`); }
  }
}
report.push(`family identity: ${seen.length} subjects checked pairwise`);
if (errors.length) { fail++; report.push(`FAIL page errors: ${errors.slice(0, 5).join(' | ')}`); }
console.log(report.join('\n'));
console.log(`\n${label}: ${pass} PASS / ${fail} FAIL / ${inconclusive} INCONCLUSIVE`);
await browser.close();
process.exit(fail ? 1 : 0);
