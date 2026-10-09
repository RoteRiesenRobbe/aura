#!/usr/bin/env node
// Aura drawbacks C2 (plan-aura-drawbacks.md §7 C2): the player CC doors at the
// game surface, against the giant spider pack of the DEBUG world.
//
//   1  boot sanity: the catalog carries SpinWeb, SpiderWebAura and OmniStrike's
//      instant_slow,
//   2  OmniStrike's tooltip renders the instant_slow line,
//   3  idle spiders drop no webs,
//   4  an aggroed spider drops a web near itself, which expires on its own,
//   5  the web slows (pace inside vs outside, the Slow bit), stepping out frees,
//   6  Paralyze lands: input dead, a cooldown press refused and named, an aura
//      switch still allowed,
//   7  the refused press does not fire when the stun ends; a press after does,
//   8  diminishing returns, observed if the pack delivers several stuns,
//   9  GOD: no slow, no stun, while a Paralyze is ready and in range,
//  10  a death while stunned respawns a free character.
//
// ⚑ VENUE: GiantSpider is placed only in api/zones/.debug/world_debug.json (five
// at level 14 around (35, -33)), so the server must boot with
// `./scripts/dev-restart.sh server debug`. Leg 1 reads the boot log to say so.
// ⚑ GOD refuses both CC doors (§3.5), so every CC leg runs with GOD OFF; the
// character is levelled to 30 instead, which buys ~35 s of the pack. GOD goes
// back on between the legs that need the spiders' attention but not their bite.
// ⚑ Observation seams, all read-only: the own Character's prototype methods
// setAuraTick (fed once per GameState for the own character, so its call count
// is a SNAPSHOT CLOCK and durations come out in ticks; it was setAppliedEffects
// until plan-buff-tray.md C2 retired the own pip feed, D10) and
// showFloatingText (the "Stunned" text), wrapped at the PROTOTYPE so the
// respawned character (a new instance window.game.character never re-points
// to) is caught too; the Slow state is read off the BUFF TRAY's DOM (a harmful
// `.buffCircle` whose data-kinds carries the Slow bit) and folded into the same
// `m` mask shape the legs always read (⚑ one snapshot LATE: setAuraTick fires
// inside Player.updateFromBackend, before Backend feeds HUD.updateBuffTray for
// the same snapshot, so the mask column lags the server by one tick; every
// leg reading it has a 30-snapshot tolerance); the turnip layer
// for the webs (fingerprinted by the web SVG's stroke colour, since the venom
// spider is also a data-URI SVG); the THREAT cheat's log lines for who is
// fighting whom.
// ⚑ Tri-state: the pack decides how many spiders engage, where the webs land
// and whether a second stun lands, so an unobservable leg is INCONCLUSIVE.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { joinAsNewCharacter } from './lib/join.mjs';
import { showSkillRow, closeSpellbook } from './lib/spellbook.mjs';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');

const label = process.argv[2] || 'run';
const url = process.argv[3] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const shotDir = process.env.C2_SHOT_DIR || '/tmp';
const serverLog = process.env.AURA_SERVER_LOG || '/tmp/aura-dev/server.log';
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

// North of the pack: ~5 u from the nearest GiantSpider (aggro radius 3), ~7 u
// from the bandit camp to the east. Walking north-south ('w' is -y) reaches it.
const IDLE = { x: 33, y: -27 };
const SLOW_BIT = 1 << 1;
const WEB_RADIUS = 1.5;

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const page = await (await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 800 } })).newPage();
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

const results = [];
const check = (name, pass, detail) => {
  results.push({ check: name, pass, detail });
  const tag = pass === null ? 'INCONCLUSIVE' : pass ? 'PASS' : 'FAIL';
  console.log(`${tag}  ${name}\n        ${detail}`);
};
const note = (text) => console.log(`  .  ${text}`);
const median = (xs) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : String(v));
// Pace over CONTIGUOUS runs of samples that satisfy pred: straight-line
// displacement over elapsed time, summed over every run of at least minMs
// (after dropping skipMs at each run's start). Per-interval speeds are useless
// here: the 100 ms sampler and the ~33 ms snapshot stream alias, so adjacent
// intervals read 0 and 2x in turn.
// ⚑ And the headless client stalls: the server coasts on a held key for at most
// 15 ticks, so a frame longer than ~500 ms (a screenshot, a heavy evaluate, a
// respawn's first render) stops the walk server-side for a moment. The robust
// reading is therefore the STEP pace: the median non-zero per-snapshot step of
// the server position x 30 ticks/s, i.e. the speed while actually moving.
const stepPace = (ss, pred) => {
  const steps = [];
  for (let i = 1; i < ss.length; i++) {
    const a = ss[i - 1]; const b = ss[i];
    if (b.snap - a.snap !== 1 || !pred(a) || !pred(b)) continue;
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (d > 0.005 && d < 0.2) steps.push(d);
  }
  return { pace: median(steps) * 30, n: steps.length };
};
const runPace = (ss, pred, { skipMs = 0, minMs = 400 } = {}) => {
  const runs = []; let cur = [];
  const flush = () => {
    const kept = cur.filter((q) => q.t >= cur[0].t + skipMs);
    if (kept.length >= 2) {
      const a = kept[0]; const b = kept[kept.length - 1];
      if (b.t - a.t >= minMs) runs.push({ d: Math.hypot(b.x - a.x, b.y - a.y), ms: b.t - a.t });
    }
    cur = [];
  };
  for (const q of ss) { if (pred(q)) cur.push(q); else if (cur.length) flush(); }
  if (cur.length) flush();
  const ms = runs.reduce((n, r) => n + r.ms, 0);
  return { pace: ms ? runs.reduce((n, r) => n + r.d, 0) / (ms / 1000) : NaN, ms: Math.round(ms), runs: runs.length };
};

// --- leg 1a: the server booted the debug world with the C2 content ----------
let bootLog = '';
try { bootLog = readFileSync(serverLog, 'utf8'); } catch { /* reported below */ }
const bootLine = (re) => (bootLog.match(re) || [])[0] || null;
const debugZones = /"msg":"Loading content"[^\n]*"debugZones":true/.test(bootLog);
const skillCount = Number((bootLog.match(/"Loaded skill definitions","count":(\d+)/) || [])[1]);
const mobCount = Number((bootLog.match(/"Loaded mob definitions","count":(\d+)/) || [])[1]);
// ⚑ No content COUNT here (harness rule 1): the exact 121/77 pin went red the
// moment the PO authored more mobs (97 on 2026-10-02) and said nothing about
// CC. The boot leg asserts the debug set is primary and the catalogs loaded.
check('Boot: debug zone set, skills and mobs loaded',
  debugZones && bootLine(/"id":"world_debug"[^\n]*"primary":true/) !== null && skillCount >= 100 && mobCount >= 70,
  `debugZones ${debugZones}, skills ${skillCount}, mobs ${mobCount}, primary world_debug ${bootLine(/"id":"world_debug"[^\n]*"primary":true/) !== null}`);

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await joinAsNewCharacter(page, 'cc');
await page.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
await page.evaluate(() => {
  const p = document.getElementById('developPanel');
  if (p) p.style.display = 'none';
});

const cmd = async (text, wait = 700) => {
  await page.evaluate((t) => {
    const input = document.getElementById('console_command');
    input.value = t;
    document.getElementById('console').dispatchEvent(new Event('submit', { cancelable: true }));
  }, text);
  if (wait) await page.waitForTimeout(wait);
};

// --- leg 1b: the catalog the client reads -----------------------------------
const catalog = await page.evaluate(async () => {
  const j = await (await fetch('/skills')).json();
  const list = Array.isArray(j.skills) ? j.skills : Object.values(j.skills || {});
  const by = (n) => list.find((s) => s.name === n) || null;
  const omni = by('OmniStrike');
  return {
    spinWeb: !!by('SpinWeb'),
    webAura: !!by('SpiderWebAura'),
    webAuraEffect: JSON.stringify(by('SpiderWebAura')?.effects?.[0] ?? null),
    omniSlow: JSON.stringify(omni?.effects?.find((e) => e.type === 'instant_slow') ?? null),
  };
});
check('Catalog carries SpinWeb and SpiderWebAura', catalog.spinWeb && catalog.webAura,
  `SpinWeb ${catalog.spinWeb}, SpiderWebAura ${catalog.webAura}: ${catalog.webAuraEffect.slice(0, 200)}`);
check('Catalog carries OmniStrike instant_slow', /"durationTicks":120/.test(catalog.omniSlow),
  catalog.omniSlow);

// --- instrumentation ----------------------------------------------------------
await page.evaluate(() => {
  const h = window.__h = { snap: 0, lastMask: -1, masks: [], floats: [], samples: [], trace: [], key: '', char: null, chars: 0 };
  const proto = Object.getPrototypeOf(window.game.character);
  // The own effects' mask, read off the tray and folded into the OLD
  // applied_effects shape every leg reads: a Slow kind (EffectKind bit 2, the
  // strip's AppliedEffectBit.Slow value) OR a Stun kind (bit 1024) lights
  // SLOW_BIT, because on the pips a stun always lit the Slow bit (CLAUDE.md
  // watch item) and the stun legs time the hold by that bit going dark.
  // ⚑ A `.leaving` circle is skipped: a sustained circle (the web's slow)
  // stays one more lifetime sweeping out AFTER the server dropped it (PO look
  // 2026-10-04), and the legs time the SERVER's slow.
  h.mask = () => [...document.querySelectorAll('#buffTray .buffCircle:not(.leaving)')]
    .reduce((acc, c) => acc | ((Number(c.dataset.kinds) & (2 | 1024)) ? 2 : 0), 0);
  const oSet = proto.setAuraTick;
  proto.setAuraTick = function (...args) {
    if (this.isPlayerCharacter) {
      const m = h.mask();
      if (h.char !== this) { h.char = this; h.chars++; h.lastMask = -1; }
      h.snap++;
      if (m !== h.lastMask) { h.masks.push({ snap: h.snap, t: performance.now(), m }); h.lastMask = m; }
      // The newest SERVER position (the interpolation buffer's head), not the
      // rendered one: a pace in server ticks, free of the 300 ms frame.
      const b = this.positionBuffer;
      const p = b && b.length ? b[b.length - 1] : this.shape.position;
      h.trace.push({ snap: h.snap, real: performance.now(), x: p.x / 120, y: p.y / 120, m, key: h.key });
      if (h.trace.length > 30000) h.trace.splice(0, 5000);
    }
    return oSet.apply(this, args);
  };
  const oFloat = proto.showFloatingText;
  proto.showFloatingText = function (text, ...rest) {
    if (this.isPlayerCharacter && typeof text === 'string' && !/^[-+]?\d+$/.test(text)) {
      h.floats.push({ snap: h.snap, t: performance.now(), text });
    }
    return oFloat.call(this, text, ...rest);
  };
  // Any textured descendant counts: the first one is not always the body
  // sprite (a mob's aura ring or emitter particles can come first).
  const isWeb = (c) => {
    let hit = false;
    const find = (o) => {
      if (hit || !o) return;
      if (o.texture) {
        const s = o.texture.source;
        const src = String(s?.label || s?.resource?.src || '');
        if (src.includes('232%2c232%2c226') || src.includes('232,232,226')) { hit = true; return; }
      }
      (o.children || []).forEach(find);
    };
    find(c);
    return hit;
  };
  h.isWeb = isWeb;
  h.webs = () => (window.game.layers.mobs.turnip.children || []).filter(isWeb).map((c) => ({
    x: +(c.position.x / 120).toFixed(2), y: +(c.position.y / 120).toFixed(2), w: Math.round(c.width),
  }));
  h.wildlife = () => (window.game.layers.mobs.wildlife.children || []).filter((c) => c.visible).map((c) => ({
    x: +(c.position.x / 120).toFixed(2), y: +(c.position.y / 120).toFixed(2), w: Math.round(c.width),
  }));
  h.me = () => { const c = h.char || window.game.character; return { x: c.getX() / 120, y: c.getY() / 120 }; };
  // The own plate's strip is never fed since D10; the tray's harmful box is the read.
  h.pip = () => [...document.querySelectorAll('#buffTray .buffBox.harmful .buffCircle')].map((c) => `${c.dataset.skillName}:${c.dataset.kinds}${c.classList.contains('sustained') && !c.classList.contains('leaving') && parseFloat(c.style.getPropertyValue('--gone')) === 0 ? ':steady' : ''}`).join(',');
  setInterval(() => {
    const me = h.me();
    h.samples.push({ t: performance.now(), snap: h.snap, x: me.x, y: me.y, m: h.lastMask, key: h.key, webs: h.webs(),
      wild: h.wildlife().filter((w) => Math.abs(w.x - me.x) < 8 && Math.abs(w.y - me.y) < 8) });
    if (h.samples.length > 6000) h.samples.splice(0, 1000);
  }, 100);
});

const state = () => page.evaluate(() => {
  const h = window.__h;
  const me = h.me();
  return { t: performance.now(), snap: h.snap, x: me.x, y: me.y, m: h.lastMask, pip: h.pip(), webs: h.webs(), wild: h.wildlife(), floats: h.floats.length };
});
const setKey = (k) => page.evaluate((k) => { window.__h.key = k; return performance.now(); }, k);
// Per-snapshot trace, timed by the SERVER tick (t = snapshot index x 1000/30).
const traceSince = (t0) => page.evaluate((t0) => window.__h.trace.filter((q) => q.real >= t0)
  .map((q) => ({ ...q, t: q.snap * (1000 / 30) })), t0);
const samplesSince = (t0) => page.evaluate((t0) => window.__h.samples.filter((s) => s.t >= t0), t0);
const floatsSince = (t0) => page.evaluate((t0) => window.__h.floats.filter((f) => f.t >= t0), t0);
const masksSince = (t0) => page.evaluate((t0) => window.__h.masks.filter((f) => f.t >= t0), t0);
const now = () => page.evaluate(() => performance.now());
const nearest = (p, list) => {
  let best = null; let d = Infinity;
  for (const o of list) { const dd = Math.hypot(o.x - p.x, o.y - p.y); if (dd < d) { d = dd; best = o; } }
  return best ? { ...best, d } : null;
};
const threat = async () => {
  const before = (() => { try { return readFileSync(serverLog, 'utf8').length; } catch { return 0; } })();
  await cmd('THREAT', 900);
  let text = '';
  try { text = readFileSync(serverLog, 'utf8').slice(before); } catch { /* empty */ }
  return [...text.matchAll(/THREAT mob=(\d+) def=(\w+) invulnerable=\w+ target=(\d+)/g)]
    .map((m) => ({ id: Number(m[1]), def: m[2], target: Number(m[3]) }));
};

// --- setup: level, the rig skills, the loadout ------------------------------
await cmd('GOD');
await cmd('XP 99999999');
await cmd('SKILL OmniStrike');
await cmd('SKILL FirstAid');
await cmd('SKILL Lantern');
const skillIdOf = async (re) => {
  await page.waitForFunction((src) => [...document.querySelectorAll('#spellbookList [data-skill-id]')]
    .some((e) => new RegExp(src, 'i').test(e.textContent)), re.source, { timeout: 20_000 }).catch(() => {});
  return page.evaluate((src) => [...document.querySelectorAll('#spellbookList [data-skill-id]')]
    .find((e) => new RegExp(src, 'i').test(e.textContent))?.dataset.skillId ?? null, re.source);
};
const omniId = await skillIdOf(/Omni ?Strike/);
const firstAidId = await skillIdOf(/First ?Aid/);
const lanternId = await skillIdOf(/Lantern/);

// --- leg 2: the tooltip --------------------------------------------------------
let tipLines = [];
if (omniId) {
  await showSkillRow(page, omniId);
  const entry = page.locator(`#spellbookList [data-skill-id="${omniId}"]`).first();
  await entry.scrollIntoViewIfNeeded();
  await entry.hover();
  await page.waitForTimeout(600);
  tipLines = await page.evaluate(() => {
    const tip = document.querySelector('#skillTooltip');
    if (!tip || tip.classList.contains('hidden')) return [];
    return [...tip.children].map((c) => c.textContent);
  });
  await page.mouse.move(10, 10);
}
const slowLine = tipLines.find((l) => /^Slow: \d+(\.\d+)?%( → \d+(\.\d+)?%)? for \d+(\.\d+)?s( → \d+(\.\d+)?s)?$/.test(l));
check('OmniStrike tooltip renders the instant_slow line', slowLine !== undefined,
  slowLine !== undefined ? JSON.stringify(slowLine) : `no Slow line in ${JSON.stringify(tipLines)}`);
check('No unknown-type fallback "(instant_slow)" in the tooltip', tipLines.length > 0 && !tipLines.some((l) => l.includes('(instant_slow)')),
  `${tipLines.length} lines`);

// --- loadout: FirstAid in cooldown slot 1 (Q), Lantern in aura slot 2 --------
const equip = async (skillId, slotSel, labelSel, re) => {
  if (!skillId) return false;
  await showSkillRow(page, skillId);
  const row = page.locator(`#spellbookList [data-skill-id="${skillId}"]`).first();
  const box = await row.boundingBox();
  await page.mouse.click(box.x + 25, box.y + box.height / 2);   // the NAME, never the row centre
  await page.waitForSelector('#spellbookList li.selected', { timeout: 5_000 }).catch(() => {});
  const slotBox = await page.locator(slotSel).first().boundingBox();
  await page.mouse.click(slotBox.x + slotBox.width / 2, slotBox.y + slotBox.height / 2);
  return page.waitForFunction(([s, src]) => new RegExp(src, 'i').test(document.querySelector(s)?.textContent ?? ''),
    [labelSel, re.source], { timeout: 15_000 }).then(() => true).catch(() => false);
};
const aidEquipped = await equip(firstAidId, '#cooldownSlotList li', '#cooldownSlotList li .slotLabel', /First ?Aid/);
const lanternEquipped = await equip(lanternId, '#auraSlotList .auraSlot[data-slot="1"]', '#auraSlotList .auraSlot[data-slot="1"] .slotLabel', /Lantern/);
await closeSpellbook(page);
note(`loadout: FirstAid in cooldown slot 1 ${aidEquipped}, Lantern in aura slot 2 ${lanternEquipped}; `
  + `active aura slot: ${await page.evaluate(() => document.querySelector('#auraSlotList .auraSlot.activeSlot')?.dataset.slot ?? 'none')}`);
const cooldownText = () => page.evaluate(() => document.querySelector('#cooldownSlotList li')?.textContent ?? '');
const cooldownRunning = async () => /\d+(\.\d+)?s/.test(await cooldownText());

// --- walking ------------------------------------------------------------------
const walk = async (key, ms, tag = key) => {
  await page.evaluate(() => document.activeElement?.blur());
  const a = await state();
  await setKey(tag);
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await setKey('');
  await page.keyboard.up(key);
  await page.waitForTimeout(400);
  const b = await state();
  return Math.hypot(b.x - a.x, b.y - a.y) / (ms / 1000);
};

await cmd(`WARP ${IDLE.x * 120} ${IDLE.y * 120}`);
await page.waitForTimeout(10_000);

// --- leg 5a: the baseline pace, off any web, north of the pack ----------------
// ⚑ The same METHOD as the web crossing: per-interval speeds off the in-page
// 100 ms samples, steady state only (the first 400 ms of each hold dropped).
// A start-to-stop distance over the node-side hold time reads ~10-15 % low
// (key latency on a 300 ms headless frame), which would bias the ratio.
await walk('d', 2000);   // warm-up after the warp, discarded
const tBase = await now();
const basePaces = [await walk('a', 2500, 'base'), await walk('d', 2500, 'base'), await walk('a', 2500, 'base')];
const baseTrace = await traceSince(tBase);
const baseRun = runPace(baseTrace, (q) => q.key === 'base', { skipMs: 400 });
const baseStep = stepPace(baseTrace, (q) => q.key === 'base');
const baseline = baseStep.pace;
const openGround = baseline >= 1.3;
note(`baseline pace: step pace ${f2(baseline)} u/s over ${baseStep.n} moving snapshots; run pace ${f2(baseRun.pace)} u/s over ${baseRun.ms} ms (nominal 1.5); start-to-stop [${basePaces.map(f2).join(', ')}] u/s`);
await cmd(`WARP ${IDLE.x * 120} ${IDLE.y * 120}`, 3000);

// --- leg 3: idle spiders drop no webs -----------------------------------------
const idleStart = await state();
const giantsInView = idleStart.wild.filter((w) => w.x > 29 && w.x < 39 && w.y > -37 && w.y < -30);
const threatA = await threat();
const IDLE_MS = 26_000;
const tIdle = await now();
await page.waitForTimeout(IDLE_MS);
const idleSamples = await samplesSince(tIdle);
const threatB = await threat();
const giantRows = [...threatA, ...threatB].filter((r) => r.def === 'GiantSpider');
const webRows = [...threatA, ...threatB].filter((r) => r.def === 'SpiderWeb');
const idleWebs = idleSamples.reduce((n, s) => Math.max(n, s.webs.length), 0);
const allIdle = giantRows.length > 0 && giantRows.every((r) => r.target === 0);
check('Idle spiders drop no webs',
  giantsInView.length === 0 || !allIdle ? null : idleWebs === 0 && webRows.length === 0,
  `stood ${IDLE_MS / 1000} s at (${f2(idleStart.x)}, ${f2(idleStart.y)}); spider-sized sprites in view ${giantsInView.length}; `
  + `GiantSpider THREAT rows ${giantRows.length}, all target=0 ${allIdle}; max webs on the client ${idleWebs}; SpiderWeb THREAT rows ${webRows.length}`);

// --- leg 4 + 6: GOD off, walk into aggro, wait for the web and the stun --------
// ⚑ Latency is the enemy here: a headless frame takes ~300 ms, and every
// page.evaluate queues behind one, so a node-side poll loop sees the stun late
// and a 3 s stun is over before a 1.2 s press is done. The stun is therefore
// detected by an in-page poll (waitForFunction), the aura slot's box is taken
// BEFORE the fight, and every judgement is made afterwards from the in-page
// 100 ms samples and the snapshot-stamped mask log.
const auraBox = await page.locator('#auraSlotList .auraSlot[data-slot="1"]').first().boundingBox();
await cmd('GOD off');
const tAggro = await now();
const snapAggro = (await state()).snap;
await page.evaluate(() => document.activeElement?.blur());
await setKey('w');
await page.keyboard.down('w');
const wUp = setTimeout(() => { page.keyboard.up('w').catch(() => {}); }, 2000);
const stunFloat = await page.waitForFunction((t0) => window.__h.floats.find((f) => f.text === 'Stunned' && f.t >= t0) || null,
  tAggro, { timeout: 25_000, polling: 40 }).then((h) => h.jsonValue()).catch(() => null);
let stun = null;
if (stunFloat) {
  await page.keyboard.down('d');
  await page.keyboard.down('q');
  if (auraBox) await page.mouse.click(auraBox.x + auraBox.width / 2, auraBox.y + auraBox.height / 2);
  const tDown = await setKey('stun');
  const switchedAt = page.waitForFunction(() => document.querySelector('#auraSlotList .auraSlot[data-slot="1"].activeSlot') ? performance.now() : null,
    null, { timeout: 2_500, polling: 40 }).then((h) => h.jsonValue()).catch(() => null);
  await page.waitForTimeout(1000);
  await page.keyboard.up('q');
  const tQup = await now();
  const cdDuring = await cooldownText();
  const bitDuring = await page.evaluate(() => window.__h.lastMask);
  // The bit clears when the stun ends (no web is under the player yet).
  const clear = await page.waitForFunction((snap) => window.__h.masks.find((e) => e.snap > snap && !(e.m & 2)) || null,
    stunFloat.snap, { timeout: 12_000, polling: 40 }).then((h) => h.jsonValue()).catch(() => null);
  await page.waitForTimeout(1500);
  await page.keyboard.up('d');
  await setKey('');
  const cdAfter = await cooldownText();
  const switched = await switchedAt;
  const samples = await samplesSince(tDown);
  const floats = (await floatsSince(tAggro)).filter((f) => f.text === 'Stunned');
  stun = { tDown, tQup, cdDuring, cdAfter, bitDuring, clear, switched, samples, floats };
}
clearTimeout(wUp);
await page.keyboard.up('w');
await setKey('');
await page.screenshot({ path: join(shotDir, `c2-cc-${label}-after-stun.png`) });

check('Paralyze lands on the player (the "Stunned" text floats)', stunFloat ? true : null,
  stunFloat ? `first "Stunned" ${Math.round(stunFloat.t - tAggro)} ms after GOD off + walk-in (snapshot +${stunFloat.snap - snapAggro})`
    : 'no "Stunned" float within 25 s of walking into the pack');

// --- leg 4: the web ------------------------------------------------------------
{
  const ss = await samplesSince(tAggro);
  const s = ss.find((q) => q.webs.length);
  if (s) {
    const web = s.webs[0];
    const spider = nearest(web, s.wild || []);
    check('An aggroed spider drops a web', true,
      `first web seen ${Math.round(s.t - tAggro)} ms after the walk-in at (${web.x}, ${web.y}), sprite width ${web.w}px; `
      + `nearest wildlife sprite ${spider ? `${f2(spider.d)} u away (width ${spider.w}px)` : 'none'}; player ${f2(Math.hypot(web.x - s.x, web.y - s.y))} u away; `
      + `webs at that moment ${JSON.stringify(s.webs)}`);
  } else {
    check('An aggroed spider drops a web', null, 'no web seen yet (re-checked below with the web lifetimes)');
  }
}

if (stun) {
  const stunEnd = stun.clear ? stun.clear.t : Infinity;
  // Frozen: from 300 ms after d went down (input latency) to the bit clearing.
  const held = stun.samples.filter((q) => q.t >= stun.tDown + 300 && q.t <= stunEnd);
  const drift = held.length ? Math.max(...held.map((q) => Math.hypot(q.x - held[0].x, q.y - held[0].y))) : NaN;
  const after = stun.samples.filter((q) => q.t > stunEnd);
  const resume = held.length ? after.find((q) => Math.hypot(q.x - held[held.length - 1].x, q.y - held[held.length - 1].y) > 0.1) : null;
  const landing = stun.floats[0];
  const pressFloats = stun.floats.filter((f) => f.t > stun.tDown && f.t <= stun.tQup + 300 && f.snap !== landing.snap);
  const pressBeforeEnd = pressFloats.filter((f) => f.t < stunEnd);
  const sameSnap = stun.floats.filter((f) => f.snap === landing.snap).length;
  check('Stunned: movement input is dead',
    held.length >= 2 ? drift < 0.05 : null,
    `d went down ${Math.round(stun.tDown - landing.t)} ms after the "Stunned" float; ${held.length} samples between d+300 ms and the stun's end, max drift ${f2(drift)} u; `
    + `stun ${stun.clear ? `${stun.clear.snap - landing.snap} snapshots (${Math.round(stun.clear.t - landing.t)} ms) from the "Stunned" float to the Slow bit clearing` : 'never cleared'}`);
  check('Stunned: a cooldown press is refused (no cooldown starts)',
    pressBeforeEnd.length > 0 || stun.tQup < stunEnd ? !/\d+(\.\d+)?s/.test(stun.cdDuring) && !/\d+(\.\d+)?s/.test(stun.cdAfter) : null,
    `Q held ${Math.round(stun.tQup - stun.tDown)} ms, released ${stun.tQup < stunEnd ? 'before' : 'AFTER'} the stun ended; cooldown slot right after the hold ${JSON.stringify(stun.cdDuring)}, `
    + `1.5 s after the stun ${JSON.stringify(stun.cdAfter)}`);
  check('Stunned: the refused press floats "Stunned" again', pressBeforeEnd.length > 0,
    `"Stunned" floats caused by the press: ${pressFloats.length} (${pressBeforeEnd.length} before the stun ended); `
    + `floats on the landing snapshot: ${sameSnap}`);
  check('Stunned: an aura switch still works',
    stun.switched !== null ? stun.switched < stunEnd : false,
    stun.switched !== null ? `aura slot 2 (Lantern) lit ${Math.round(stun.switched - stun.tDown)} ms after the click, ${stun.switched < stunEnd ? 'while still stunned' : 'only after the stun ended'}`
      : 'aura slot 2 never lit within 2.5 s of the click');
  // --- leg 7 ---------------------------------------------------------------------
  check('After the stun: movement resumes', resume ? true : false,
    resume ? `moving again ${Math.round(resume.t - stunEnd)} ms after the Slow bit cleared (d still held)` : 'no movement after the stun ended');
  check('After the stun: the press made during it did not fire', stun.tQup < stunEnd ? !/\d+(\.\d+)?s/.test(stun.cdAfter) : null,
    `cooldown slot 1.5 s after the stun: ${JSON.stringify(stun.cdAfter)}`);
}


// Durations: every "Stunned" float not caused by the Q press, and the Slow-bit
// intervals around them. Measured before any web is entered.
const stunFloats = (await floatsSince(tAggro)).filter((f) => f.text === 'Stunned');
const maskLog = await masksSince(tAggro);
const slowIntervals = [];
{
  let on = null;
  for (const e of maskLog) {
    if ((e.m & SLOW_BIT) && on === null) on = e;
    if (!(e.m & SLOW_BIT) && on !== null) { slowIntervals.push({ from: on.snap, to: e.snap, ticks: e.snap - on.snap, ms: Math.round(e.t - on.t) }); on = null; }
  }
  if (on) slowIntervals.push({ from: on.snap, to: null, ticks: null });
}
note(`"Stunned" floats since walk-in: ${JSON.stringify(stunFloats.map((f) => ({ snap: f.snap - snapAggro, ms: Math.round(f.t - tAggro) })))}`);
note(`Slow-bit intervals (snapshots rel. to walk-in): ${JSON.stringify(slowIntervals.map((i) => ({ ...i, from: i.from - snapAggro, to: i.to === null ? null : i.to - snapAggro })))}`);
const snapRate = await page.evaluate(() => {
  const s = window.__h.samples; const a = s[s.length - 51]; const b = s[s.length - 1];
  return a && b ? (b.snap - a.snap) / ((b.t - a.t) / 1000) : NaN;
});
note(`snapshot clock: ${f2(snapRate)} own-player snapshots per second (server tick 30/s)`);

// --- GOD on: the positive control for leg 7 -----------------------------------
await cmd('GOD');
const meAfterStun = await state();
let fired = false;
for (let attempt = 0; attempt < 2 && !fired; attempt++) {
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down('q');
  await page.waitForTimeout(1400);
  await page.keyboard.up('q');
  fired = await page.waitForFunction(() => /\d+(\.\d+)?s/.test(document.querySelector('#cooldownSlotList li')?.textContent ?? ''),
    null, { timeout: 3_000 }).then(() => true).catch(() => false);
}
check('After the stun: a fresh press does fire (control)', stun ? fired : null,
  `cooldown slot after a press out of the stun: ${JSON.stringify(await cooldownText())}`);

// Back to where the fight started: the post-stun walk can carry the player out
// of the spider's leash, and a spider that walks home is out of combat and
// spins nothing (probe 2026-09-27: no second volley in 45 s after such a walk).
await cmd(`WARP ${Math.round(stunFloat ? 32.75 * 120 : meAfterStun.x * 120)} ${Math.round(stunFloat ? -29.3 * 120 : meAfterStun.y * 120)}`, 1500);
const engaged = async () => {
  const rows = await threat();
  const g = rows.filter((r) => r.def === 'GiantSpider');
  return { giants: g.length, onMe: g.filter((r) => r.target !== 0).length, webs: rows.filter((r) => r.def === 'SpiderWeb').length };
};
note(`THREAT after re-engaging: ${JSON.stringify(await engaged())} (GiantSpiders within the dump radius / with a target / SpiderWebs)`);

// --- web lifetimes, and the second web volley ---------------------------------
const webSightings = async () => {
  const ss = await samplesSince(tAggro);
  const seen = new Map();
  for (const s of ss) {
    for (const w of s.webs) {
      const k = `${w.x},${w.y}`;
      let e = seen.get(k);
      if (!e) {
        // Born in view, not walked into view: well inside the 1280x800 frame
        // (10.7 x 6.7 u) and the player did not jump since the last sample.
        const prev = ss[ss.indexOf(s) - 1];
        const born = Math.abs(w.x - s.x) < 3.5 && Math.abs(w.y - s.y) < 2.2
          && !!prev && Math.hypot(prev.x - s.x, prev.y - s.y) < 0.6 && !prev.webs.some((p) => `${p.x},${p.y}` === k);
        e = { first: s, last: s, widths: new Set(), shrink: null, born };
      }
      if (!e.shrink && e.widths.size && Math.max(...e.widths) >= 400 && w.w <= 370) e.shrink = s;
      e.last = s; e.widths.add(w.w); seen.set(k, e);
    }
  }
  const lastSample = ss[ss.length - 1];
  return [...seen.entries()].map(([k, e]) => ({
    at: k, firstMs: Math.round(e.first.t - tAggro), snaps: e.last.snap - e.first.snap,
    ms: Math.round(e.last.t - e.first.t), stillThere: e.last === lastSample, widths: [...e.widths],
    toShrink: e.shrink ? e.shrink.snap - e.first.snap : null, born: e.born,
  }));
};

// Structure of a web sprite: the wide phase and the narrow (despawn) phase.
const anatomy = (wide) => page.evaluate((wide) => {
  const c = (window.game.layers.mobs.turnip.children || []).find((x) => window.__h.isWeb(x) && (x.width >= 400) === wide);
  if (!c) return null;
  const desc = (o, depth) => ({
    type: o.constructor?.name, label: o.label || o.name || '', visible: o.visible, alpha: +o.alpha.toFixed(2),
    w: Math.round(o.width), h: Math.round(o.height), scale: +(o.scale?.x ?? 1).toFixed(2),
    kids: depth < 2 ? (o.children || []).map((k) => desc(k, depth + 1)) : (o.children || []).length,
  });
  return desc(c, 0);
}, wide);
const anatomies = { wide: await anatomy(true), narrow: await anatomy(false) };

// A fresh (wide-phase, not yet tried) web within maxD of the player.
const tried = new Set();
const waitFreshWeb = async (maxD, timeoutMs) => {
  const t0 = await now();
  for (;;) {
    const s = await state();
    if (!anatomies.wide) anatomies.wide = await anatomy(true);
    if (!anatomies.narrow) anatomies.narrow = await anatomy(false);
    const fresh = s.webs.filter((w) => w.w >= 400 && !tried.has(`${w.x},${w.y}`))
      .map((w) => ({ ...w, d: Math.hypot(w.x - s.x, w.y - s.y) })).filter((w) => w.d < maxD)
      .sort((p, q) => p.d - q.d);
    if (fresh.length) { tried.add(`${fresh[0].x},${fresh[0].y}`); return { web: fresh[0], s }; }
    if ((await now()) - t0 >= timeoutMs) return null;
    await page.waitForTimeout(150);
  }
};

// Walk straight through a web: side-step onto its line, then cross it along
// one axis. Every sample of the crossing carries `${tag}` as its key flag.
const KEYS = { x: ['a', 'd'], y: ['w', 's'] };
const walkThrough = async (target, tag) => {
  const me = await state();
  const dx = target.x - me.x; const dy = target.y - me.y;
  const axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
  const along = axis === 'x' ? dx : dy;
  const across = axis === 'x' ? dy : dx;
  const mainKey = KEYS[axis][along >= 0 ? 1 : 0];
  const sideKey = KEYS[axis === 'x' ? 'y' : 'x'][across >= 0 ? 1 : 0];
  await page.evaluate(() => document.activeElement?.blur());
  if (Math.abs(across) > 0.3) {
    await setKey(`${tag}:side`);
    await page.keyboard.down(sideKey);
    await page.waitForTimeout(Math.min(2500, (Math.abs(across) / 1.3) * 1000));
    await page.keyboard.up(sideKey);
  }
  const tMain = await setKey(tag);
  await page.keyboard.down(mainKey);
  let shot = null;
  const holdMs = Math.min(8500, ((Math.abs(along) + WEB_RADIUS + 1.8) / 0.9) * 1000 + 1500);
  while ((await now()) - tMain < holdMs) {
    const s = await state();
    const w = nearest(s, [target]);
    if (!shot && w.d < 1.0 && (s.m & SLOW_BIT)) {
      const path = join(shotDir, `c2-cc-${label}-in-web.png`);
      await page.screenshot({ path });
      shot = { path, pip: s.pip, m: s.m, d: w.d };
    }
    await page.waitForTimeout(100);
  }
  await setKey('');
  await page.keyboard.up(mainKey);
  await page.waitForTimeout(1500);
  const ss = await traceSince(tMain);
  const stuns = (await floatsSince(tMain)).filter((f) => f.text === 'Stunned').map((f) => Math.round(f.t - tMain));
  // Pace inside (bit lit, or any under GOD) vs off the web before and after.
  const main = ss.filter((q) => q.key === tag && q.real >= tMain + 400);
  const dOf = (q) => nearest(q, [target]).d;
  const inPred = (q) => dOf(q) < 1.2 && (tag === 'god' || (q.m & SLOW_BIT));
  const inTimes = main.filter((q) => dOf(q) < 1.2).map((q) => q.t);
  const offPred = (q) => dOf(q) > 2.2 && !(q.m & SLOW_BIT);
  const inside = runPace(main, inPred);
  inside.step = stepPace(main, inPred);
  const outside = inTimes.length ? runPace(main.filter((q) => q.t < inTimes[0]), offPred) : runPace(main, offPred);
  const after = inTimes.length ? runPace(main.filter((q) => q.t > inTimes[inTimes.length - 1]), offPred) : { pace: NaN, ms: 0, runs: 0 };
  after.step = inTimes.length ? stepPace(main.filter((q) => q.t > inTimes[inTimes.length - 1]), offPred) : { pace: NaN, n: 0 };
  outside.step = stepPace(inTimes.length ? main.filter((q) => q.t < inTimes[0]) : main, offPred);
  // Ticks to free: the first sample past the edge (1.5 u + a 0.5 u body) after
  // having been inside, then the first sample with the bit dark.
  let exitS = null; let clearS = null; let inside1 = false; let edgeS = null;
  for (const q of ss) {
    const d = nearest(q, [target]).d;
    if (d < 1.2) inside1 = true;
    if (inside1 && !edgeS && d > WEB_RADIUS) edgeS = q;
    if (inside1 && !exitS && d > WEB_RADIUS + 0.5) exitS = q;
    if (exitS && !clearS && !(q.m & SLOW_BIT)) clearS = q;
  }
  const clearAfterEdge = edgeS ? ss.find((q) => q.snap >= edgeS.snap && !(q.m & SLOW_BIT)) : null;
  return { target, mainKey, inside, outside, after, exitS, clearS, edgeS, clearAfterEdge, shot, stuns, crossed: inside1 };
};

// --- leg 5: the web slows -------------------------------------------------------
// ⚑ Paralyze is the confound: a stun mid-crossing reads as a very strong slow.
// A spider spends its Paralyze on a GOD player too (applyStun reports a hit on
// target SELECTION), so the walk is made straight out of a GOD stretch, and a
// crossing a stun still reached is retried on the next web, up to three.
let webLeg = null;
const webTries = [];
for (let attempt = 0; attempt < 3; attempt++) {
  const fresh = await waitFreshWeb(4.5, 40_000);
  if (!fresh) break;
  await cmd('GOD off', 200);
  const r = await walkThrough(fresh.web, 'web');
  await cmd('GOD', 300);
  webTries.push(r);
  if (r.stuns.length === 0 && r.crossed && r.inside.ms >= 500 && r.inside.pace > 0.2) { webLeg = r; break; }
  // Walk back into the pack for the next one.
  await cmd(`WARP ${Math.round(32.75 * 120)} ${Math.round(-29.3 * 120)}`, 1500);
}
note(`web crossings: ${JSON.stringify(webTries.map((r) => ({ at: [r.target.x, r.target.y], key: r.mainKey, inside: r.inside, before: r.outside, after: r.after, stunsAtMs: r.stuns, crossed: r.crossed })))}`);
if (!webLeg && webTries.length) webLeg = webTries[webTries.length - 1];
if (!webLeg) {
  check('The web slows a player inside it (pace about 0.6x)', null, 'no fresh web came within 4.5 u');
} else {
  const vin = webLeg.inside.step.pace;
  const ratio = vin / baseline;
  const blocked = vin <= 0.2;
  const usable = openGround && webLeg.inside.step.n >= 10 && webLeg.stuns.length === 0 && !blocked;
  check('The web slows a player inside it (pace about 0.6x)',
    usable ? ratio > 0.45 && ratio < 0.75 : null,
    `${usable ? '' : 'INCONCLUSIVE: ' + (webLeg.stuns.length ? `a stun landed ${webLeg.stuns.join('/')} ms into the crossing; ` : '') + (webLeg.inside.step.n < 10 ? 'too few moving snapshots inside; ' : '') + (blocked ? 'the crossing was blocked (a body in the way); ' : '') + (openGround ? '' : 'obstructed baseline; ')}`
    + `crossed the web at (${webLeg.target.x}, ${webLeg.target.y}) on ${webLeg.mainKey}; step pace inside ${f2(vin)} u/s (${webLeg.inside.step.n} moving snapshots), `
    + `off the web before ${f2(webLeg.outside.step.pace)} (${webLeg.outside.step.n}), after ${f2(webLeg.after.step.pace)} (${webLeg.after.step.n}); baseline ${f2(baseline)} u/s; inside/baseline ${f2(ratio)}x; `
    + `run paces (stalls included) inside ${f2(webLeg.inside.pace)} over ${webLeg.inside.ms} ms, after ${f2(webLeg.after.pace)} over ${webLeg.after.ms} ms`);
  const shot = webTries.map((r) => r.shot).find((x) => x) || null;
  check('Inside the web: the Slow bit is lit and the tray shows the harmful SpiderWebAura circle, STEADY (no strobing wedge)',
    shot ? (shot.m & SLOW_BIT) !== 0 && /Spider Web Aura:\d+:steady/.test(shot.pip || '') : null,
    shot ? `mask ${shot.m}, harmful circles [${shot.pip}], ${f2(shot.d)} u from the web centre; screenshot ${shot.path}`
      : 'never sampled inside 1.0 u of the web centre with the bit lit');
  const ex = webLeg.exitS; const cl = webLeg.clearS;
  const vafter = webLeg.after.step.pace;
  check('Stepping out frees the player within a second',
    ex && cl && webLeg.stuns.length === 0 ? (cl.snap - ex.snap) <= 30 && (webLeg.after.step.n < 10 || vafter > baseline * 0.85) : null,
    ex ? `past the edge + 0.5 u at snapshot ${ex.snap}, Slow bit dark at ${cl?.snap ?? 'never'} `
      + `(${cl ? cl.snap - ex.snap : '?'} snapshots; server position and bit read off the same snapshot); centre distance first > 1.5 u at ${webLeg.edgeS?.snap}, `
      + `bit dark ${webLeg.clearAfterEdge ? webLeg.clearAfterEdge.snap - webLeg.edgeS.snap : '?'} snapshots later; `
      + `step pace after leaving ${f2(vafter)} u/s (${webLeg.after.step.n} moving snapshots) vs baseline ${f2(baseline)}` : 'the walk never left the web');
}

// --- leg 8: diminishing returns --------------------------------------------------
{
  const closed = slowIntervals.filter((i) => i.ticks !== null);
  const firstTicks = closed[0]?.ticks;
  const later = closed.slice(1).map((i) => i.ticks);
  check('A second stun inside the DR window is shorter (observed, never red)',
    stunFloats.length >= 2 && closed.length >= 2 ? (later.some((t) => t < firstTicks * 0.75) ? true : null) : null,
    `"Stunned" floats before the web leg: ${stunFloats.length}; Slow-bit intervals (ticks): ${JSON.stringify(closed.map((i) => i.ticks))}; `
    + 'overlapping casts from two spiders merge into one interval, so read the float snapshots above');
}

// --- leg 9: GOD, while a Paralyze is ready and in range --------------------------
{
  await cmd(`WARP ${Math.round(32.75 * 120)} ${Math.round(-29.3 * 120)}`, 3000);
  const godEngA = await engaged();
  note(`THREAT at the start of the GOD window: ${JSON.stringify(godEngA)}`);
  const tGod = await now();
  const godStart = await state();
  let closest = Infinity; const gaps = [];
  const GOD_MS = 34_000;
  let godWeb = null;
  while ((await now()) - tGod < GOD_MS) {
    const s = await state();
    const n = nearest(s, s.wild);
    if (n) { closest = Math.min(closest, n.d); gaps.push(n.d); }
    if (!anatomies.wide) anatomies.wide = await anatomy(true);
    if (!anatomies.narrow) anatomies.narrow = await anatomy(false);
    // Walk through a web that comes up, under GOD.
    if (!godWeb) {
      const fresh = await waitFreshWeb(4.5, 1);
      if (fresh) {
        godWeb = await walkThrough(fresh.web, 'god');
        await cmd(`WARP ${Math.round(32.75 * 120)} ${Math.round(-29.3 * 120)}`, 1000);
      }
    }
    await page.waitForTimeout(250);
  }
  const godEngB = await engaged();
  note(`THREAT at the end of the GOD window: ${JSON.stringify(godEngB)}`);
  note(`web anatomy, wide phase: ${JSON.stringify(anatomies.wide)}`);
  note(`web anatomy, narrow phase: ${JSON.stringify(anatomies.narrow)}`);
  const godMasks = (await masksSince(tGod)).filter((e) => e.m & SLOW_BIT);
  const godFloats = (await floatsSince(tGod)).filter((f) => f.text === 'Stunned');
  const nearGap = median(gaps);
  const lastStunEnd = slowIntervals.filter((i) => i.to !== null).map((i) => i.to).pop();
  check('GOD: no slow, no stun while the pack is on you',
    closest < 2.5 && godEngA.onMe > 0 && godEngB.onMe > 0 ? godMasks.length === 0 && godFloats.length === 0 : null,
    `held GOD ${GOD_MS / 1000} s from ${Math.round(tGod - tAggro)} ms after the walk-in (the first Paralyze casts land ~0-5 s in, cooldown 30 s); `
    + `GiantSpiders with a target at start/end ${godEngA.onMe}/${godEngB.onMe}; nearest wildlife: closest ${f2(closest)} u, median ${f2(nearGap)} u; Slow-bit onsets ${godMasks.length}; "Stunned" floats ${godFloats.length}; `
    + `snapshots since the last stun ended at the start: ${lastStunEnd ? godStart.snap - lastStunEnd : '?'} (DR reset 540)`);
  check('GOD: walking through a web is not slowed',
    godWeb && godWeb.inside.step.n >= 10 && openGround ? godWeb.inside.step.pace > baseline * 0.9 : null,
    godWeb ? `web at (${godWeb.target.x}, ${godWeb.target.y}), step pace inside ${f2(godWeb.inside.step.pace)} u/s (${godWeb.inside.step.n} moving snapshots) vs baseline ${f2(baseline)}; run pace ${f2(godWeb.inside.pace)} over ${godWeb.inside.ms} ms`
      : 'no fresh web came within 4.5 u during the GOD window');
  // ⚑ Two clocks: the server removes the web at ttlTicks (240); the client then
  // plays a despawn, during which the container is narrower (the aura ring is
  // gone, only the fading body sprite and its bar are left). `toShrink` is the
  // server-side lifetime as the client sees it, `snaps` the whole visible life.
  const sightings = await webSightings();
  const expired = sightings.filter((w) => !w.stillThere && w.born);
  check('The web expires on its own (~240 ticks)',
    // ⚑ Median + ceiling, not `every` (harness rule 3, repaired 2026-10-04): a
    // web first SEEN a few 100 ms samples after it was spun, or one that died
    // with its spider, reads SHORT (213 and 130 were seen beside seven values
    // around 237), and that says nothing about the TTL. The invariant is: the
    // typical web lasts its ~240 ticks, and none OUTLIVES them.
    expired.length === 0 ? null : (() => {
      const lives = expired.map((w) => w.toShrink).filter((n) => n !== null).sort((a, b) => a - b);
      if (!lives.length) return false;
      const median = lives[Math.floor(lives.length / 2)];
      return median >= 215 && median <= 265 && lives[lives.length - 1] <= 265;
    })(),
    `${expired.length} webs seen from birth to gone (${sightings.length - expired.length} others walked into view or were still up); toShrink ${JSON.stringify(expired.map((w) => w.toShrink))} snapshots (first seen to the container narrowing), `
    + `whole visible life ${JSON.stringify(expired.map((w) => w.snaps))} snapshots`);
}

// --- leg 10: death while stunned, then respawn ------------------------------------
// ⚑ Not "GOD off and wait for Paralyze": applyStun reports a hit whenever it
// SELECTS a target, so a Paralyze cast at a GOD player is spent (cooldown
// consumed) although the stun was refused. The cheap way into a slowed state
// is a web: wait for one under GOD, then walk into it with GOD off.
{
  await cmd(`WARP ${Math.round(32.75 * 120)} ${Math.round(-29.3 * 120)}`, 2000);
  let web = null;
  const tWait = await now();
  while (!web && (await now()) - tWait < 30_000) {
    const s = await state();
    const w = nearest(s, s.webs);
    if (w && w.d < 5) web = { w, s };
    else await page.waitForTimeout(250);
  }
  const t0 = await now();
  let held = null;
  if (web) {
    await cmd('GOD off', 0);
    const dx = web.w.x - web.s.x; const dy = web.w.y - web.s.y;
    const axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
    const key = KEYS[axis][(axis === 'x' ? dx : dy) >= 0 ? 1 : 0];
    await page.keyboard.down(key);
    for (let i = 0; i < 60 && !held; i++) {
      const s = await state();
      if (s.m & SLOW_BIT) held = s;
      else await page.waitForTimeout(100);
    }
    await page.keyboard.up(key);
  }
  const floatsOnOff = (await floatsSince(t0)).filter((f) => f.text === 'Stunned');
  note(`leg 10: ${web ? `walked at the web (${web.w.x}, ${web.w.y}) with GOD off; Slow bit ${held ? `lit ${Math.round(held.t - t0)} ms later` : 'never lit'}` : 'no web within 5 u in 30 s'}; "Stunned" floats ${floatsOnOff.length}`);
  if (!held) {
    check('Death while stunned or slowed: the respawned character is free', null, 'the character never got slowed or stunned (see the leg 10 note above)');
  } else {
    const oldChars = await page.evaluate(() => window.__h.chars);
    await cmd('KILL', 1500);
    const dead = await page.waitForFunction(() => {
      const s = document.getElementById('endScreen');
      return !!s && s.classList.contains('showing');
    }, null, { timeout: 15_000 }).then(() => true).catch(() => false);
    await page.waitForTimeout(2500);
    await page.evaluate(() => document.querySelector('#endScreen .playerNameSubmit')?.click());
    const respawned = await page.waitForFunction((n) => window.__h.chars > n, oldChars, { timeout: 20_000 }).then(() => true).catch(() => false);
    await page.waitForTimeout(3000);
    const r0 = await state();
    const masksAfter = await page.evaluate(() => window.__h.masks.slice(-3));
    let pace = NaN;
    if (respawned) {
      const tR = await now();
      await walk('d', 2500, 'respawn');
      pace = stepPace(await traceSince(tR), (q) => q.key === 'respawn').pace;
    }
    const r1 = await state();
    check('Death while stunned or slowed: the respawned character is free',
      respawned ? (r0.m & SLOW_BIT) === 0 && pace > baseline * 0.85 : false,
      `died ${dead}, respawned as a new character ${respawned}; mask after respawn ${r0.m} (last changes ${JSON.stringify(masksAfter.map((e) => e.m))}), harmful circles [${r0.pip}]; `
      + `step pace ${f2(pace)} u/s (baseline ${f2(baseline)}) walking from (${f2(r0.x)}, ${f2(r0.y)}) to (${f2(r1.x)}, ${f2(r1.y)})`);
  }
}

function report() {
  const pass = results.filter((r) => r.pass === true).length;
  const fail = results.filter((r) => r.pass === false).length;
  const inc = results.filter((r) => r.pass === null).length;
  console.log(`\nlabel : ${label}   PASS ${pass}  FAIL ${fail}  INCONCLUSIVE ${inc}`);
  console.log('webgl ctx losses :', consoleErrors.filter((t) => t.includes('[webgl] world context lost')).length);
  console.log('console errors   :', consoleErrors.length);
  for (const e of consoleErrors.slice(0, 5)) console.log('   .', e);
}

report();
await browser.close();
const failed = results.some((r) => r.pass === false) || consoleErrors.length > 0;
process.exit(failed ? 1 : 0);
