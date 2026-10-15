#!/usr/bin/env node
// plan-lightmap.md L6 (D11): wire lights EASE instead of snapping, read as
// PIXELS, and the nameplate answer still flips on the wire's frame.
//
// Venue: the TUNNEL zone (derived from the zone file): a stand inside its dark
// circle, far from the campfire's reach. The probe gets the Lantern, puts it
// in aura slot 1 and toggles it, reading four 5×5 patches at 0.2 / 0.4 / 0.6 /
// 0.8 × the Lantern's radius on EVERY frame:
//
//   on     the patches light up on DIFFERENT frames, inner first: the hole
//          grows (pre-L6 it snapped, every patch lit on one frame); and on the
//          first frame isHidden says the outer patch is lit, its drawn light is
//          not yet there (gameplay reads the wire's radius, the picture eases);
//   off    the patches go dark on different frames, outer first (the own hole
//          shrinks to the sight floor instead of snapping).
//
// ⚑ Frame-rate bound: software GL renders ~10 fps at this size, so a 300 ms ramp
// spans ~3 frames. That is enough to tell a grow from a snap, not to trace
// a curve.
//
//   node .claude/skills/verify/l6-light-ease.mjs [url]

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { joinAsNewCharacter } from './lib/join.mjs';
import { readZone } from './lib/zone.mjs';
import { showSkillRow, closeSpellbook } from './lib/spellbook.mjs';

const url = process.argv[2]
  || 'http://localhost:2001/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = {
  ...process.env,
  LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':'),
};

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const PX = 120;
// Small enough for a steady frame rate under software GL (~16 fps here at
// this size, ~5 at 1600×1000), so a 300 ms ramp spans several frames.
const VIEW = { width: 1100, height: 700 };
// The spellbook drag needs the full layout; the window shrinks after it.
const SETUP_VIEW = { width: 1600, height: 1000 };
const results = [];
const pass = (n, d = '') => { results.push('PASS'); console.log(`  ✅ ${n}${d ? ' — ' + d : ''}`); };
const fail = (n, d = '') => { results.push('FAIL'); console.log(`  ❌ ${n}${d ? ' — ' + d : ''}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function venue() {
  const zone = readZone(join(root, 'api/zones/tunnel.json'));
  const dark = zone.darkAreas[0];
  const fire = zone.bindPoints[0];
  const lantern = JSON.parse(readFileSync(join(root, 'api/skills/lantern.json'), 'utf8'))
    .effects.find(e => e.type === 'light_aura').radius;
  const fireLight = JSON.parse(readFileSync(join(root, 'api/skills/mobs/campfire-aura.json'), 'utf8'))
    .effects.find(e => e.type === 'light_aura').radius;
  // Half way between the circle's centre and its far rim, away from the fire.
  const away = Math.sign(dark.y - fire.y) || -1;
  const stand = { x: dark.x, y: dark.y + away * dark.radius * 0.5 };
  const probes = [0.2, 0.4, 0.6, 0.8].map(f => ({ x: stand.x + lantern * f, y: stand.y }));
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  if (probes.some(p => d(p, dark) > dark.radius - 1 || d(p, fire) < fireLight + 1)) {
    throw new Error('venue: a probe is not in plain darkness');
  }
  return { origin: zone.origin, stand, probes };
}

(async () => {
  const v = venue();
  const browser = await chromium.launch({ env });
  const page = await browser.newPage({ viewport: SETUP_VIEW });
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    console.log(`joined as ${await joinAsNewCharacter(page, 'lease')}`);
    await sleep(6000);
    const cmd = async (text) => {
      await page.evaluate((t) => {
        const input = document.getElementById('console_command');
        if (!input) { return; }
        input.value = t;
        document.getElementById('console').dispatchEvent(new Event('submit', { cancelable: true }));
      }, text);
      await sleep(700);
    };
    await cmd('GOD');
    await cmd('XP 99999999');
    await cmd('SKILL Lantern');
    await page.evaluate(() => {
      const p = document.getElementById('developPanel');
      if (p) { p.style.display = 'none'; }
    });

    // Lantern into aura slot 1 (the d-map-fog-darkness recipe), left OFF.
    const lanternId = await page.waitForFunction(() => [...document.querySelectorAll('#spellbookList [data-skill-id]')]
      .find((e) => /Lantern/i.test(e.textContent))?.dataset.skillId ?? null, null, { timeout: 20_000 })
      .then((h) => h.jsonValue());
    await showSkillRow(page, lanternId);
    const row = page.locator(`#spellbookList [data-skill-id="${lanternId}"]`).first();
    const box = await row.boundingBox();
    await page.mouse.click(box.x + 25, box.y + box.height / 2);
    const slot = await page.locator('#auraSlotList .auraSlot[data-slot="1"]').first().boundingBox();
    await page.mouse.click(slot.x + slot.width / 2, slot.y + slot.height / 2);
    await closeSpellbook(page);
    await sleep(800);
    await page.setViewportSize(VIEW);

    await cmd(`WARP ${Math.round((v.stand.x + v.origin.x) * PX)} ${Math.round((v.stand.y + v.origin.y) * PX)}`);
    let last = null;
    for (let i = 0; i < 30; i++) {
      await sleep(1000);
      const here = await page.evaluate(() => {
        const g = window.game.character.shape.getGlobalPosition();
        return { x: g.x, y: g.y };
      });
      if (last && Math.abs(here.x - last.x) < 0.5 && Math.abs(here.y - last.y) < 0.5) { break; }
      last = here;
    }
    await sleep(1500);

    const worlds = v.probes.map(p => ({ x: (p.x + v.origin.x) * PX, y: (p.y + v.origin.y) * PX }));
    const screens = await page.evaluate((ws) => ws.map((w) => {
      const g = window.game.layers.darkness.toGlobal(w);
      return { x: Math.round(g.x), y: Math.round(g.y) };
    }), worlds);

    // ⭐ Pixels read on EVERY frame, in the page: a screenshot takes longer
    // than the whole 300 ms ramp here. The darkness layer's onRender queues a
    // microtask, which runs after the frame is drawn and before it is
    // composited, so readPixels sees the finished frame. isHidden is read in
    // the same microtask, so each sample pairs the picture with the answer.
    const record = (ms) => page.evaluate(({ ss, ws, ms }) => {
      window.__lease = new Promise((resolve) => {
        const canvas = document.querySelector('canvas');
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        const k = canvas.width / canvas.clientWidth;
        const buf = new Uint8Array(5 * 5 * 4);
        const dk = window.game.layers.darkness;
        const out = [];
        const t0 = performance.now();
        dk.onRender = () => Promise.resolve().then(() => {
          const r = ss.map((sp) => {
            gl.readPixels(Math.round(sp.x * k) - 2, canvas.height - Math.round(sp.y * k) - 3, 5, 5, gl.RGBA, gl.UNSIGNED_BYTE, buf);
            let sum = 0;
            for (let i = 0; i < buf.length; i += 4) { sum += buf[i]; }
            return Math.round(sum / 25);
          });
          const outer = ws[ws.length - 1];
          out.push({ r, hidden: window.game.darkness.isHidden(outer.x, outer.y) });
          if (performance.now() - t0 > ms) { dk.onRender = null; resolve(out); }
        });
      });
    }, { ss: screens, ws: worlds, ms });
    const done = () => page.evaluate(() => window.__lease);
    const toggle = async () => {
      const b = await page.locator('#auraSlotList .auraSlot[data-slot="1"]').first().boundingBox();
      await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
      await sleep(100);
      const lit = await page.evaluate(() => !!document.querySelector('#auraSlotList .auraSlot[data-slot="1"].activeSlot'));
      console.log(`  slot 1 clicked, active: ${lit}`);
    };
    const fmt = (s) => s.map(x => `${x.r.join('/')}${x.hidden ? '' : '*'}`).join(' ');
    // The first frame each patch is past 10 % of its own lit value, and the
    // last frame it still is.
    const firstLit = (s, lit) => lit.map((l, i) => s.findIndex(x => x.r[i] > l * 0.1));
    const lastLit = (s, lit) => lit.map((l, i) => s.map(x => x.r[i] > l * 0.1).lastIndexOf(true));

    await record(300);
    const before = await done();
    console.log(`  unlit ${fmt(before.slice(-1))} (patches inner → outer)`);

    // --- on --------------------------------------------------------------------
    await record(2500);
    await toggle();
    const on = await done();
    console.log(`  on (* = isHidden false at the outer patch): ${fmt(on)}`);
    const lit = on[on.length - 1].r;
    (lit.every((l, i) => l > before[before.length - 1].r[i] + 20) ? pass : fail)('the Lantern lights every patch', lit.join('/'));
    const ons = firstLit(on, lit);
    (ons[ons.length - 1] > ons[0] ? pass : fail)('the hole GROWS: the outer patch lights after the inner',
      `first lit frame per patch ${ons.join('/')}`);
    const flip = on.findIndex(x => !x.hidden);
    (flip >= 0 && flip < ons[ons.length - 1] ? pass : fail)('isHidden flips on the wire, before the outer patch is drawn lit',
      `flip at frame ${flip}, outer lit at ${ons[ons.length - 1]}`);

    // --- off -------------------------------------------------------------------
    await record(2500);
    await toggle();
    const off = await done();
    console.log(`  off: ${fmt(off)}`);
    const offs = lastLit(off, lit);
    (off[off.length - 1].r[lit.length - 1] < lit[lit.length - 1] * 0.1 ? pass : fail)('the outer patch goes dark again',
      off[off.length - 1].r.join('/'));
    (offs[0] > offs[offs.length - 1] ? pass : fail)('the hole SHRINKS: the inner patch stays lit longer than the outer',
      `last lit frame per patch ${offs.join('/')}`);
  } catch (e) {
    fail('run', String(e && e.message || e));
  } finally {
    await browser.close();
  }
  const failed = results.filter(r => r === 'FAIL').length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
