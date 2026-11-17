#!/usr/bin/env node
// Campfire traits CT3 (docs/plan-campfire-traits.md §CT3, D9-D11, R10-R12,
// R17-R20): the rest buffs at the game surface, two clients.
//
// OWNER buys strong buff traits (max Focus 15, damage 5, speed 5) plus Camp
// duration 5 (a 20 s camp); STRANGER buys a weak one (max Focus 3). Spends go
// over the raw wire (the ct1 pattern: SpendSkillPoint built with the
// frontend's flatbuffers, offsets read from the generated bindings).
// Strength is read off the Focus bar's MAXIMUM (max_health rides every tick
// and now carries the max-Focus buff); presence and time off the buff tray.
//
//   1  OWNER places a camp, STRANGER stands on the owner: 3 s in, no rest circle
//   2  ~9 s in, both carry three rest circles (182/183/184), freshly full
//   3  the kinds: the speed trait is a Speed circle, the other two StatUp
//   4  max Focus rose by the owner's +4.95 % on BOTH (the stranger gets the
//      owner's strength, not their own, R10/D6)
//   5  the tooltips: the stranger's reads the OWNER's level and strength
//      (OwnEffect.level, the granted level, since CT3)
//   6  after the camp burns out the buffs stay, the circles barely drained
//   7  OWNER rests at the stranger's WEAKER camp: max Focus keeps the strong
//      value (R11) while the circle refills to 5 min (the weak stream is the
//      longest, R18: the PO checklist's tray-timer note)
//   8  death: OWNER dies and respawns with no rest circle and the base maximum
//
// Usage: node .claude/skills/verify/ct3-rest-buffs.mjs [label] [url]
// Afterwards (stop aurad first): cd backend && go run ./cmd/harnessdb -cleanup
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');
import { joinAsNewCharacter } from './lib/join.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const fb = await import(join(repo, 'frontend/node_modules/flatbuffers/mjs/flatbuffers.js'));

const url = process.argv[3] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const label = process.argv[2] || 'run';
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

const DURATION = 179, FOCUS = 182, DAMAGE = 183, SPEED = 184;
const REST = [FOCUS, DAMAGE, SPEED];
const KIND_SPEED = 1 << 2, KIND_STAT_UP = 1 << 12;
const OPEN_GROUND = { x: -168, y: -84 }; // r4-camp's clearing: no spawn within 40 u

// --- offsets from the generated bindings (ct1) ---------------------------------
const gsSrc = readFileSync(join(repo, 'api/schema/js/aura-api/game-state.ts'), 'utf8');
const off = (fn) => {
  const m = new RegExp(`^${fn}\\([^)]*\\)[^{]*\\{\\s*const offset = this\\.bb!\\.__offset\\(this\\.bb_pos, (\\d+)\\)`, 'm').exec(gsSrc);
  if (!m) throw new Error(`no offset for GameState.${fn} in the generated bindings`);
  return +m[1];
};
const O = { spellbook: off('spellbook'), levels: off('spellbookLevels'), owner: off('ownerState'), points: off('campPoints'), charges: off('campCharges') };
const bodyEnum = (file, name) => {
  const m = new RegExp(`${name} = (\\d+)`).exec(readFileSync(join(repo, `api/schema/js/aura-api/${file}`), 'utf8'));
  if (!m) throw new Error(`no ${name} in ${file}`);
  return +m[1];
};
const GAME_STATE = bodyEnum('server-message-body.ts', 'GameState');
const SPEND = bodyEnum('client-message-body.ts', 'SpendSkillPoint');

const spendBytes = (id) => {
  const b = new fb.Builder(64);
  b.startObject(2);
  b.addFieldInt16(0, id, 0);
  b.addFieldInt8(1, 0, 0);
  const body = b.endObject();
  b.startObject(2);
  b.addFieldInt8(0, SPEND, 0);
  b.addFieldOffset(1, body, 0);
  b.finish(b.endObject());
  return [...b.asUint8Array()];
};

const bindPoints = (() => {
  const out = [];
  const walk = (v) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (v && typeof v === 'object') {
      if (Array.isArray(v.bindPoints)) v.bindPoints.forEach((p) => p?.id && out.push(p.id));
      Object.values(v).forEach(walk);
    }
  };
  walk(JSON.parse(readFileSync(join(repo, 'api/zones/world.json'), 'utf8')));
  return [...new Set(out)];
})();
const START = bindPoints.find((id) => id === 'spawnpoint-1') ?? bindPoints[0];

const results = [];
const check = (ok, name, note) => {
  results.push({ ok, name, note });
  console.log(`${ok === null ? 'INCONCLUSIVE' : ok ? 'PASS' : 'FAIL'}  ${name}${note ? '  - ' + note : ''}`);
};
const consoleErrors = [];

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'], env });

// --- one client: page, decoded wire, helpers -------------------------------------
async function client(tag) {
  const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const wire = { points: null, charges: null, spellbook: null };
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`${tag}: ${m.text()}`); });
  page.on('pageerror', (e) => consoleErrors.push(`${tag} pageerror: ${e.message}`));
  page.on('websocket', (ws) => {
    if (!ws.url().includes('/game')) return;
    ws.on('framereceived', ({ payload }) => {
      if (typeof payload === 'string') return;
      const bb = new fb.ByteBuffer(new Uint8Array(payload));
      const root = bb.readInt32(bb.position()) + bb.position();
      const t = bb.__offset(root, 4);
      if (!t || bb.readUint8(root + t) !== GAME_STATE) return;
      const gs = bb.__indirect(root + bb.__offset(root, 6));
      const u = (o, w) => { const x = bb.__offset(gs, o); return x ? (w === 2 ? bb.readUint16(gs + x) : bb.readUint8(gs + x)) : 0; };
      wire.points = u(O.points, 2);
      wire.charges = u(O.charges, 1);
      const ow = bb.__offset(gs, O.owner);
      if (ow && bb.readInt8(gs + ow)) {
        const book = {};
        const so = bb.__offset(gs, O.spellbook), lo = bb.__offset(gs, O.levels);
        const n = so ? bb.__vector_len(gs + so) : 0;
        for (let i = 0; i < n; i++) book[bb.readUint16(bb.__vector(gs + so) + i * 2)] = lo ? bb.readUint8(bb.__vector(gs + lo) + i) : 0;
        wire.spellbook = book;
      }
    });
  });
  await page.addInitScript(() => {
    const Orig = window.WebSocket;
    window.WebSocket = class extends Orig {
      constructor(...a) { super(...a); if (String(a[0]).includes('/game')) window.__gameWs = this; }
    };
  });

  const c = { tag, page, wire };
  c.cmd = async (text) => {
    await page.evaluate((t) => {
      const input = document.getElementById('console_command');
      input.value = t;
      document.getElementById('console').dispatchEvent(new Event('submit', { cancelable: true }));
    }, text);
    await page.waitForTimeout(600);
  };
  c.until = async (pred, ms = 6_000) => {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) { if (await pred()) return true; await page.waitForTimeout(150); }
    return pred();
  };
  c.level = (id) => wire.spellbook?.[id] ?? 0;
  c.spend = async (id, n) => {
    for (let i = 0; i < n; i++) {
      await page.evaluate((b) => window.__gameWs.send(new Uint8Array(b)), spendBytes(id));
      await page.waitForTimeout(150);
    }
  };
  // Separators accepted: a levelled pool reads "1,234" (the r4-camp repair).
  c.health = () => page.evaluate(() => {
    const m = /Focus\s+([\d.,\s]+)\/([\d.,\s]+)/.exec(document.querySelector('#healthBar .barText')?.textContent ?? '');
    const n = (s) => +s.replace(/\D/g, '');
    return m ? { cur: n(m[1]), max: n(m[2]) } : null;
  });
  c.pos = () => page.evaluate(() => ({ x: Math.round(window.game.character.getX()), y: Math.round(window.game.character.getY()) }));
  // The three rest circles, read atomically.
  c.rest = () => page.evaluate((ids) => [...document.querySelectorAll('#buffTray .buffCircle')]
    .filter((el) => ids.includes(Number(el.dataset.skillId)))
    .map((el) => ({ id: Number(el.dataset.skillId), name: el.dataset.skillName, kinds: Number(el.dataset.kinds),
      gone: parseFloat(el.style.getPropertyValue('--gone')) || 0, harmful: el.classList.contains('harmful') })), REST);
  c.tooltip = async (id) => {
    const el = await page.$(`#buffTray .buffCircle[data-skill-id="${id}"]`);
    const bb = el ? await el.boundingBox() : null;
    if (!bb) return '';
    await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await page.waitForTimeout(700);
    const text = await page.evaluate(() => {
      const t = document.getElementById('skillTooltip');
      return t && !t.classList.contains('hidden') ? t.textContent.replace(/\s+/g, ' ').trim() : '';
    });
    await page.mouse.move(640, 300);
    return text;
  };
  c.campsNearby = (radius = 4) => page.evaluate((r) => {
    let layer = null;
    const find = (n) => { if (n?.name === 'campfireMob') { layer = n; return; } (n?.children || []).forEach(find); };
    find(window.__auraRoot);
    if (!layer) return 0;
    const ch = window.game.character;
    return (layer.children || []).filter((n) => n.visible && n.position)
      .map((n) => Math.hypot(n.position.x - ch.getX(), n.position.y - ch.getY()) / 120).filter((d) => d <= r).length;
  }, radius);
  c.placeCamp = async () => {
    const before = await c.campsNearby();
    await page.click('#utilityList li[data-utility="2"]');
    for (let i = 0; i < 80; i++) {
      if ((await c.campsNearby()) > before) return Date.now();
      await page.waitForTimeout(250);
    }
    return 0;
  };
  const pressInteract = async () => {
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.down('e');
    await page.waitForTimeout(1400);
    await page.keyboard.up('e');
    await page.waitForTimeout(1400);
  };
  c.fireRow = async (needle, exact = false) => {
    for (let i = 0; i < 3; i++) {
      await pressInteract();
      const open = await page.evaluate(() => { const el = document.getElementById('conversation'); return !!el && !el.classList.contains('hidden'); });
      if (!open) continue;
      const node = (await page.evaluateHandle(([n, ex]) => [...document.querySelectorAll('#conversation .conversationRows li')]
        .find((li) => (ex ? li.textContent.trim() === n : li.textContent.includes(n))) ?? null, [needle, exact])).asElement();
      if (!node) return false;
      await node.scrollIntoViewIfNeeded();
      const b = await node.boundingBox();
      if (!b) return false;
      await page.mouse.click(b.x + Math.min(60, b.width / 2), b.y + b.height / 2);
      await page.waitForTimeout(1100);
      return true;
    }
    return false;
  };
  c.join = async () => {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await joinAsNewCharacter(page, tag);
    await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
    await page.evaluate(() => { const p = document.getElementById('developPanel'); if (p) p.style.display = 'none'; });
    await page.waitForTimeout(1200);
    await c.cmd('PING'); // the first command after joining is dropped
    await c.cmd('GOD on');
    await c.cacheRoot();
    await c.until(() => wire.points !== null && wire.spellbook !== null);
  };
  c.cacheRoot = () => page.evaluate(() => {
    let r = window.game.character.plate.parent;
    while (r.parent) r = r.parent;
    window.__auraRoot = r;
  });
  // Bind at the start fire, visit `fires` more, spend, then Restock for charges.
  c.prepare = async (fires, buys) => {
    await c.cmd(`WARP ${START}`);
    await page.waitForTimeout(2_000);
    const bound = await c.fireRow('Bind');
    for (const id of bindPoints.filter((b) => b !== START).slice(0, fires)) {
      await c.cmd(`WARP ${id}`);
      await page.waitForTimeout(800);
    }
    const need = buys.reduce((s, [, n]) => s + n, 0);
    await c.until(() => wire.points >= need, 8_000);
    for (const [id, n] of buys) await c.spend(id, n);
    const bought = await c.until(() => buys.every(([id, n]) => c.level(id) === n));
    await c.cmd(`WARP ${START}`);
    await page.waitForTimeout(2_000);
    const restocked = bound && await c.fireRow('Restock', true);
    await c.until(() => wire.charges >= 1);
    return { bound, bought, restocked, charges: wire.charges, book: JSON.stringify(wire.spellbook) };
  };
  return c;
}

const near = (a, b, tol) => Math.abs(a - b) <= tol;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  const owner = await client('ct3own');
  const stranger = await client('ct3str');
  await owner.join();
  await stranger.join();
  // The owner levels first, so a +4.95 % reads in whole Focus points; the ding
  // refills the pool, so it must settle before any baseline.
  await owner.cmd('XP 60000');
  await owner.page.waitForTimeout(2_000);

  const own = await owner.prepare(30, [[FOCUS, 15], [DAMAGE, 5], [SPEED, 5], [DURATION, 5]]);
  const str = await stranger.prepare(4, [[FOCUS, 3]]);
  check(own.bought && own.charges >= 1 && str.bought && str.charges >= 1, 'setup: both bought their traits and hold a charge',
    `owner ${own.book} charges=${own.charges}; stranger ${str.book} charges=${str.charges}`);

  await owner.cmd(`WARP ${OPEN_GROUND.x * 120} ${OPEN_GROUND.y * 120}`);
  await owner.page.waitForTimeout(3_000);
  const spot = await owner.pos();
  await stranger.cmd(`WARP ${spot.x} ${spot.y}`);
  await sleep(20_000); // both cameras settle (verify skill: after WARP)
  await owner.cacheRoot();
  await stranger.cacheRoot();
  const ownBase = await owner.health(), strBase = await stranger.health();

  // --- 1-2. the clock -------------------------------------------------------------
  const placedAt = await owner.placeCamp();
  check(!!placedAt, 'the owner places a camp', `base max: owner ${ownBase?.max}, stranger ${strBase?.max}`);
  await sleep(Math.max(0, placedAt + 3_000 - Date.now()));
  const early = [await owner.rest(), await stranger.rest()];
  check(early.every((r) => r.length === 0), '3 s into the rest: no rest circle yet (restTicks = 5 s)', JSON.stringify(early));
  await sleep(Math.max(0, placedAt + 9_000 - Date.now()));
  const [ownRest, strRest] = [await owner.rest(), await stranger.rest()];
  const three = (r) => REST.every((id) => r.some((c) => c.id === id && !c.harmful && c.gone < 20));
  check(three(ownRest) && three(strRest), '~9 s in: owner AND stranger carry the three rest circles, freshly full (R10)',
    `owner ${JSON.stringify(ownRest)} | stranger ${JSON.stringify(strRest)}`);

  // --- 3. kinds ---------------------------------------------------------------------
  const kind = (r, id) => r.find((c) => c.id === id)?.kinds ?? 0;
  check(kind(ownRest, SPEED) & KIND_SPEED && kind(ownRest, FOCUS) & KIND_STAT_UP && kind(ownRest, DAMAGE) & KIND_STAT_UP,
    'the speed trait is a Speed circle, max Focus and damage StatUp',
    `kinds 182=${kind(ownRest, FOCUS)} 183=${kind(ownRest, DAMAGE)} 184=${kind(ownRest, SPEED)}`);

  // --- 4. max Focus, the owner's strength on both ----------------------------------
  const ownUp = await owner.health(), strUp = await stranger.health();
  const want = (b) => Math.round(b * 1.0495);
  check(ownBase && strBase && near(ownUp.max, want(ownBase.max), 1) && near(strUp.max, want(strBase.max), 1),
    'max Focus rose by the OWNER\'s +4.95 % on both (the stranger\'s own +0.99 % is not used)',
    `owner ${ownBase?.max} -> ${ownUp?.max} (want ${want(ownBase?.max)}), stranger ${strBase?.max} -> ${strUp?.max} (want ${want(strBase?.max)})`);
  // ⚑ Not "current stays": the camp's own heal tops a now-wounded owner up in
  // the same window (run1 read 965 -> 1012). R17's gain half is pinned in Go
  // (TestCampFocusBuff_RaisesTheMaximumOnly...), where no healer stands by.
  check(ownUp.cur <= ownUp.max, 'current Focus never exceeds the raised maximum', `owner ${ownUp?.cur}/${ownUp?.max}`);

  // --- 5. tooltips (report) ---------------------------------------------------------
  const tipOwn = await owner.tooltip(DAMAGE), tipStr = await stranger.tooltip(DAMAGE);
  console.log(`REPORT  tooltip, owner:    ${tipOwn}`);
  console.log(`REPORT  tooltip, stranger: ${tipStr}`);
  // The owner's damage trait is level 5 (+1.65 %); the stranger holds none, so
  // a tooltip priced at the viewer's own level read "Lv 0/15 ... +0%" (run2).
  const granted = (t) => /Lv 5\/15/.test(t) && /\+1\.65\s?%/.test(t);
  check(granted(tipOwn) && granted(tipStr), "both tooltips show the camp's granted level and strength, not the viewer's",
    `owner: ${tipOwn.slice(0, 90)} | stranger: ${tipStr.slice(0, 90)}`);
  await owner.page.screenshot({ path: `/tmp/ct3-rest-owner-${label}.png` });
  await stranger.page.screenshot({ path: `/tmp/ct3-rest-stranger-${label}.png` });

  // --- 6. the camp burns out, the buffs stay ---------------------------------------
  await owner.until(async () => (await owner.campsNearby()) === 0, 25_000);
  await sleep(3_000);
  const after = await owner.rest();
  const afterMax = (await owner.health())?.max;
  check(three(after.map((c) => ({ ...c, gone: 0 }))) && after.every((c) => c.gone > 5 && c.gone < 60) && afterMax === ownUp.max,
    'after the camp burns out the buffs stay, the circles drain slowly (5 min)',
    `${JSON.stringify(after)} max=${afterMax}`);

  // --- 7. a weaker camp ---------------------------------------------------------------
  const goneBefore = after.find((c) => c.id === FOCUS)?.gone ?? 0;
  const strSpot = await stranger.pos();
  await owner.cmd(`WARP ${strSpot.x} ${strSpot.y}`);
  await sleep(2_000);
  const weakAt = await stranger.placeCamp();
  await sleep(Math.max(0, weakAt + 9_000 - Date.now()));
  const weakRest = await owner.rest();
  const weakMax = (await owner.health())?.max;
  const focusGone = weakRest.find((c) => c.id === FOCUS)?.gone ?? -1;
  check(!!weakAt && weakMax === ownUp.max, 'resting at a weaker camp keeps the stronger max-Focus buff (R11)',
    `owner max ${ownUp.max} -> ${weakMax}`);
  check(!!weakAt && focusGone >= 0 && focusGone < goneBefore, 'the max-Focus circle refills to 5 min there (the weaker stream is the longest, R18)',
    `--gone ${goneBefore.toFixed(1)} -> ${focusGone.toFixed(1)}; damage/speed (not on the weak camp) ${JSON.stringify(weakRest.filter((c) => c.id !== FOCUS).map((c) => c.gone))}`);

  // --- 8. death -----------------------------------------------------------------------
  await owner.cmd('DAMAGE 100');
  await owner.page.waitForSelector('#endScreen.showing', { timeout: 20_000 });
  await owner.page.waitForTimeout(2_500);
  await owner.page.evaluate(() => document.querySelector('#endForm').dispatchEvent(new Event('submit', { cancelable: true })));
  await owner.page.waitForFunction(() => !!window.game?.character, null, { timeout: 30_000 });
  await owner.page.waitForTimeout(4_000);
  const dead = await owner.rest();
  const deadMax = (await owner.health())?.max;
  check(dead.length === 0 && deadMax === ownBase.max, 'death ends every rest buff (D11): no circle, the base maximum',
    `circles ${JSON.stringify(dead)} max ${deadMax} (base ${ownBase.max})`);
} catch (e) {
  check(false, 'the run completed', e.message);
} finally {
  const real = consoleErrors.filter((e) => !/favicon|webglcontextlost/i.test(e));
  check(real.length === 0, 'no console errors', real.slice(0, 3).join(' | '));
  await browser.close();
  const failed = results.filter((r) => r.ok === false).length;
  console.log(`\n[ct3-rest-buffs ${label}] ${results.filter((r) => r.ok).length}/${results.length} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
