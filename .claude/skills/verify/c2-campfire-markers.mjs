#!/usr/bin/env node
// plan-world-map.md C2 — campfire markers on the map, at the real game surface.
//
// Owns: discovery on entering a fire's circle (instant; standing binds nothing),
// the marker layer in BOTH map states,
// the home-fire highlight, and — the leg that matters most — that a COLD LOGIN
// shows the markers again without standing there again.
//
//   1  join a fresh character and stand in a fire that is NOT the default spawn
//   2  the marker appears at once (discovery), docked and full-screen, at the
//      fire's own position; E + "Bind & Restock" then puts the home ring on it
//   3  leave to character-select — a real session end, so the return is a cold
//      join out of Postgres, not the reconnect stash
//   4  come back: the marker is there BEFORE anything is rediscovered
//
// ⚑ Leg 4 is the one that can fail alone. The set lands on the client through a
// ONE-SHOT published on the join tick (ConnectionStateSystem -> NetSystem in the
// same tick, by system priority). Everything else here would still pass if that
// publication were lost between the two systems, and the map would simply be
// empty until the player's next rebind — which reads as "persistence is broken"
// when persistence is fine.
//
// ⚑ The fire is deliberately spawnpoint-2 (-141.33, 2.13), which is NOT flagged
// startingSpawn — the campfire-bind-persistence.mjs venue, for the same reason:
// binding at the starting fire would pass whether discovery persists or not.
//
// Usage: node .claude/skills/verify/c2-campfire-markers.mjs [label] [url]
// Afterwards: cd backend && go run ./cmd/harnessdb -cleanup
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { harnessCharacterName } from './lib/join.mjs';

const label = process.argv[2] || 'c2';
const url = process.argv[3] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

const outDir = dirname(fileURLToPath(import.meta.url));

// WARP takes 1/120 units and wants whole units.
const w = (x, y) => `${Math.round(x) * 120} ${Math.round(y) * 120}`;
// api/zones/world.json bindPoints.
const BOUND_FIRE = { id: 'spawnpoint-2', x: -141.33, y: 2.13 };  // not startingSpawn
const START_FIRE = { id: 'spawnpoint-1', x: -239.78, y: 15.36 }; // startingSpawn
// ⚑ The negative control has to be a fire this run NEVER visits. spawnpoint-1
// is not it: a fresh character spawns inside its bind radius and discovers it
// on the first tick. spawnpoint-4 is a few dozen units east of BOUND_FIRE.
const NEVER_FIRE = { id: 'spawnpoint-4', x: -96.53, y: 2.56 };

const results = [];
const consoleErrors = [];
const check = (ok, name, note) => {
  results.push({ ok, name, note });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? '  — ' + note : ''}`);
};

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1400, height: 900 } });
const page = await context.newPage();
// A 401 on a cold load is expected: the client asks the server who it is before
// it can know (same filter, same reason, as chunk4-persistence.mjs).
page.on('console', (m) => {
  if (m.type() === 'error' && !/\b401\b/.test(m.text())) consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

const cmd = async (text) => {
  await page.evaluate((t) => {
    const input = document.getElementById('console_command');
    input.value = t;
    document.getElementById('console').dispatchEvent(new Event('submit', { cancelable: true }));
  }, text);
  await page.waitForTimeout(600);
};

/**
 * One atomic sample of the marker layer.
 *
 * ⚑ Reads the pixi scene graph through window.game.miniMap (the internal-tools
 * console surface), not the DOM: markers are pixi children and have no DOM of
 * their own. C1 could only screenshot them, which is not an assertion.
 *
 * The layer holds one Sprite per discovered fire, plus one Graphics ring for
 * the bound one — so `sprites` is the marker count and `rings` is 0 or 1.
 */
const readMarkers = () => page.evaluate(() => {
  const map = window.game?.miniMap;
  const campfires = map?.['campfires'];
  if (!campfires) return { reachable: false };
  const children = campfires.layer.children;
  return {
    reachable: true,
    total: children.length,
    // ⚑ `context`, NOT `texture`, is the discriminator. A pixi Graphics has a
    // truthy `.texture` too (a white 1 × 1), so counting on that reports every
    // ring as a marker — measured, and it cost this harness a red run. Only a
    // Graphics carries a GraphicsContext.
    sprites: children.filter((c) => !c.context).length,
    rings: children.filter((c) => !!c.context).length,
    discovered: Array.from(campfires['discovered'] || []),
    home: campfires['home'],
    // Marker positions in canvas px from the layer origin (the canvas centre).
    positions: children.filter((c) => !c.context).map((c) => ({ x: c.x, y: c.y })),
    scale: map.scale,
    open: map.isOpen(),
    // Stacking order on the map's stage. ⚑ This is an assertion, not a
    // curiosity: the first cut put the markers UNDER the prop layer and a fire
    // in dense forest was invisible behind the ~777 prop icons — reported
    // in-game with one fire clear, one half-covered and one gone.
    // (Layer.CHARACTER = 0, Layer.OTHER = 1 — MiniMapInterfaces.)
    depth: {
      campfires: map.stage.getChildIndex(campfires.layer),
      props: map.stage.getChildIndex(map.layerContainers[1]),
      characters: map.stage.getChildIndex(map.layerContainers[0]),
    },
  };
});


// --- the campfire conversation (E at a fire opens a panel; standing binds nothing) ---
// Copied from c2-pull-through.mjs (harnesses are self-contained). ⚑ E is a ~1.4 s
// HOLD, never keyboard.press: the interact key is edge-triggered off Controls.update's
// rAF-driven clock, which a headless page throttles far below the nominal input tick.
const pressInteract = async () => {
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down('e');
  await page.waitForTimeout(1400);
  await page.keyboard.up('e');
  await page.waitForTimeout(1400);
};
const convPanel = () => page.evaluate(() => {
  const el = document.getElementById('conversation');
  if (!el || el.classList.contains('hidden')) return null;
  const li = [...el.querySelectorAll('.conversationRows li')];
  return {
    actor: el.querySelector('.conversationActor')?.textContent?.trim() ?? '',
    rows: li.filter((x) => !x.classList.contains('conversationLeaveRow')).map((x) => x.textContent.trim()),
    hasLeave: li.some((x) => x.classList.contains('conversationLeaveRow')),
  };
});
// A single E press is not evidence (the hold can fall between two rAF samples): retry.
const pressForPanel = async (tries = 3) => {
  for (let i = 0; i < tries; i++) {
    await pressInteract();
    const p = await convPanel();
    if (p) return p;
  }
  return null;
};
// Rows are rebuilt on every render: scroll, elementFromPoint check, real mouse click.
const clickRow = async (needle) => {
  const found = await page.evaluate((n) => {
    const row = [...document.querySelectorAll('#conversation .conversationRows li')].find((li) => li.textContent.includes(n));
    if (!row) return false;
    row.scrollIntoView({ block: 'center' });
    return true;
  }, needle);
  if (!found) return { ok: false, why: `no row matches "${needle}"` };
  await page.waitForTimeout(250);
  const node = (await page.evaluateHandle((n) =>
    [...document.querySelectorAll('#conversation .conversationRows li')].find((li) => li.textContent.includes(n)) ?? null, needle)).asElement();
  const b = node && await node.boundingBox();
  if (!b) return { ok: false, why: 'the row has no box' };
  const cx = b.x + Math.min(60, b.width / 2), cy = b.y + b.height / 2;
  const hit = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('#conversation .conversationRows li'), [cx, cy]);
  if (!hit) return { ok: false, why: 'something lies on top of the row' };
  await page.mouse.click(cx, cy);
  await page.waitForTimeout(1100);
  return { ok: true };
};
const homeFire = () => page.evaluate(() => window.game?.miniMap?.['campfires']?.['home'] ?? null);
// Stand inside the fire's bind circle first. E opens the Campfire panel, "Bind & Restock"
// is clicked, and the home marker is awaited.
const bindAtFire = async () => {
  const pnl = await pressForPanel();
  if (!pnl || !/campfire/i.test(pnl.actor)) return { ok: false, why: `E opened ${pnl ? `"${pnl.actor}"` : 'nothing'}, not the Campfire panel` };
  const c = await clickRow('Bind');
  if (!c.ok) return c;
  for (let i = 0; i < 25; i++) {
    const h = await homeFire();
    if (h) return { ok: true, home: h };
    await page.waitForTimeout(300);
  }
  return { ok: false, why: 'the home marker never appeared after the Bind & Restock click' };
};

const enterWorld = async () => {
  await page.waitForSelector('#accountScreens.hidden', { state: 'attached', timeout: 120_000 });
  await page.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
  await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
  await page.evaluate(() => { const p = document.getElementById('developPanel'); if (p) p.style.display = 'none'; });
  await page.waitForTimeout(1200);
};

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });

  const creation = page.locator('#characterCreation:not(.hidden)');
  await creation.waitFor({ state: 'visible', timeout: 120_000 });
  const name = harnessCharacterName('c2m');
  await page.fill('#characterCreation .characterNameInput', name);
  await page.click('#characterCreation .characterCreateSubmit');
  await enterWorld();
  console.log(`\njoined as ${name}\n`);

  // --- 1. undiscovered fires are ABSENT, not dimmed (D6) --------------------
  //
  // ⚑ NOT "no markers at all". A fresh character spawns jittered *inside* a
  // starting fire's bind radius, so it has already discovered that one by the
  // time the join sequence finishes — measured, and an earlier version of this
  // leg failed on it. The property worth pinning is the one D6 states: the
  // world has five fires and the map shows only the ones you have stood at.
  let m = await readMarkers();
  if (!m.reachable) {
    check(false, '1 the map is reachable from the console surface', 'window.game.miniMap missing');
    throw new Error('cannot read the marker layer');
  }
  check(m.discovered.length <= 1 && m.sprites === m.discovered.length,
    '1 undiscovered fires are absent, not dimmed (D6)',
    `${m.sprites} marker(s) of 5 placed fires, discovered=[${m.discovered}]`);

  // --- 2. entering the circle discovers the fire ----------------------------
  await cmd('PING'); // the first command after joining is dropped (harness note)
  await cmd('GOD on');  // this fire has company; dying mid-conversation proves nothing
  await cmd(`WARP ${w(BOUND_FIRE.x, BOUND_FIRE.y)}`);
  await page.waitForTimeout(20_000); // camera + position settle across the warp (§20)

  m = await readMarkers();
  const discoveredEastern = m.discovered.includes(BOUND_FIRE.id);
  check(discoveredEastern, '2 standing in the fire discovers it (instantly, no bind)',
    `discovered=[${m.discovered}] home=${m.home}`);
  check(m.sprites === m.discovered.length, '2b one marker per discovered fire',
    `${m.sprites} sprites for ${m.discovered.length} ids`);
  check(m.home !== BOUND_FIRE.id && m.rings === 0, '2c standing there bound nothing: no home ring yet',
    `home=${m.home}, ${m.rings} ring(s)`);
  const bind = await bindAtFire();
  check(bind.ok && bind.home === BOUND_FIRE.id, '2e E + "Bind & Restock" binds it', bind.ok ? `home=${bind.home}` : bind.why);
  m = await readMarkers();
  check(m.rings === 1, '2f and the bound fire is now highlighted', `${m.rings} ring(s)`);

  // ⚑ 2d is the leg that would have caught the shipped-and-caught bug: markers
  // drawn UNDER the prop layer are invisible wherever the forest is dense, and
  // every count and position leg above still passes while they are.
  //
  // ⚑ The upper half was RELAXED in C3 by PO ruling (2026-08-04): fires now
  // draw above the player dots too — *"the campfire is still the most important
  // information the map can provide"* — so this chunk's original
  // `campfires < characters` is no longer the rule and asserting it would fail
  // a correct build. What C2 owns is the half that came from its own bug: a
  // fire is never behind the scenery. The full order is c3-player-roster's leg 3.
  check(m.depth.campfires > m.depth.props,
    '2d markers draw above the props (C2\'s own bug; the upper bound is C3\'s leg 3)',
    `props ${m.depth.props} < campfires ${m.depth.campfires} (characters ${m.depth.characters})`);

  // --- 3. the marker sits where the fire is --------------------------------
  //
  // Position, not just presence: a marker at the wrong place is the failure a
  // count can never catch, and the whole map is a claim about positions.
  const expected = { x: BOUND_FIRE.x * 120 * m.scale, y: BOUND_FIRE.y * 120 * m.scale };
  const nearest = m.positions
    .map((p) => Math.hypot(p.x - expected.x, p.y - expected.y))
    .sort((a, b) => a - b)[0];
  check(nearest !== undefined && nearest < 1.0, '3 the marker is at the fire\'s own position',
    `${nearest?.toFixed(3)} px from ${JSON.stringify(expected)} (docked scale ${m.scale.toFixed(5)})`);

  // --- 4. markers survive the state toggle, at the full-screen scale --------
  const dockedScale = m.scale;
  await page.keyboard.press('KeyM');
  await page.waitForTimeout(900);
  const full = await readMarkers();
  check(full.open === true, '4 the map opened');
  check(full.sprites === m.sprites, '4b the same markers are drawn full-screen',
    `${m.sprites} docked -> ${full.sprites} full-screen`);
  check(full.scale > dockedScale * 5, '4c and at the full-screen scale',
    `${dockedScale.toFixed(5)} -> ${full.scale.toFixed(5)}`);
  const fullExpected = BOUND_FIRE.x * 120 * full.scale;
  const fullNearest = full.positions
    .map((p) => Math.abs(p.x - fullExpected))
    .sort((a, b) => a - b)[0];
  check(fullNearest !== undefined && fullNearest < 1.0,
    '4d re-placed by the new scale, not stretched from the old one',
    `${fullNearest?.toFixed(3)} px from ${fullExpected.toFixed(1)}`);
  await page.screenshot({ path: join(outDir, `${label}-markers-fullscreen.png`) });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // --- 5. leave the world --------------------------------------------------
  await page.click('#gameSettingsButton');
  await page.click('#leaveToCharacterSelect');
  await page.waitForSelector('#characterSelect:not(.hidden)', { state: 'visible', timeout: 60_000 });
  check(true, '5 left the world to character-select');
  await page.waitForTimeout(2000); // the async writer

  // --- 6. THE LEG THAT MATTERS: a cold login already has the markers -------
  await page.click('#characterSelect .slotCard .button');
  await enterWorld();

  // ⚑ Sampled immediately, before anything could re-discover anything. The
  // character lands at its bound fire, so waiting would let leg 2's mechanism
  // manufacture the answer leg 6 is asking about.
  const cold = await readMarkers();
  check(cold.discovered.includes(BOUND_FIRE.id),
    '6 the cold login already knows the discovered fire',
    `discovered=[${cold.discovered}] home=${cold.home}`);
  check(cold.sprites >= 1, '6b and draws it without standing there again',
    `${cold.sprites} sprite(s), ${cold.rings} ring(s)`);
  check(cold.home === BOUND_FIRE.id, '6c with the bound fire still the highlighted one',
    `home=${cold.home}`);
  check(!cold.discovered.includes(NEVER_FIRE.id),
    '6d and has NOT discovered the fire it never stood at',
    `discovered=[${cold.discovered}], expected ${NEVER_FIRE.id} absent`);

  await page.keyboard.press('KeyM');
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(outDir, `${label}-after-relogin.png`) });

  // --- 7. backlog §53: no origin props on the map --------------------------
  //
  // The pre-join spectator sits at (0,0) and used to seed ~24 permanent STATIC
  // prop icons there. Counted rather than eyeballed: the character has never
  // been near the origin, so any icon within a few units of it is a leftover.
  const originIcons = await page.evaluate(() => {
    const map = window.game?.miniMap;
    if (!map) return null;
    let near = 0, total = 0;
    Object.values(map.layerContainers).forEach((layer) => {
      layer.children.forEach((c) => {
        total++;
        // Layer origin IS the canvas centre, so a world-origin icon sits at 0,0.
        if (Math.hypot(c.x, c.y) < 4) near++;
      });
    });
    return { near, total };
  });
  check(originIcons && originIcons.near === 0, '7 no leftover icons at the world origin (§53)',
    originIcons ? `${originIcons.near} of ${originIcons.total} icons within 4 px of the origin` : 'unreadable');

} catch (err) {
  check(false, 'the run completed', String(err && err.message ? err.message : err));
} finally {
  check(consoleErrors.length === 0, `${consoleErrors.length} console errors`,
    consoleErrors.slice(0, 3).join(' | '));
  await browser.close();
}

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} passed`);
console.log('(run: cd backend && go run ./cmd/harnessdb -cleanup)');
process.exit(passed === results.length ? 0 : 1);
