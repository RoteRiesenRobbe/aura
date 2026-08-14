#!/usr/bin/env node
// plan-flight-paths.md C3 — the client flight experience, at the real game
// surface. This is also the FIRST in-game exercise of C2's server state
// machine: until this chunk no client could send StartFlight at all, so every
// leg below is the first time that code has run outside a Go test.
//
// Owns: the map click that starts a flight (arm → confirm), the camera
// zoom-out coupled to the server AOI, the input + ability lock, the in-flight
// indicator, and that LANDING RESTORES ALL OF IT. Plus the two-client
// snapshot-invisibility check C2 deferred for want of a way to fly.
//
//   1  discover two fires, so there is somewhere to fly to (D4)
//   2  one press on a marker ARMS it — no flight yet (D11 has no bail-out, so
//      a single stray press must not commit the player to a crossing)
//   3  the second press flies: Character.flying turns true
//   4  airborne: zoom out, ability bar greyed + refusing, indicator counting
//   5  the observer's snapshot LOSES the flyer (D13 — the body left the space)
//   5b the observer's MAP KEEPS them, and the dot tracks the flight (D16, C4)
//   6  landing restores every one of them, at the destination fire
//
// ⚑ Leg 6 is the one that can fail alone, and it is the same bug class as a
// takeoff that only half-happens: the plan's landmine 1 asks for every gate to
// be pinned in BOTH directions.
//
// ⚑ LEGS 5 AND 5b ARE THE WHOLE POINT, AND THEY POINT OPPOSITE WAYS. The world
// and the map are different facts (D16, PO 2026-08-05): the same player, at the
// same instant, must be gone from the observer's snapshot and present on the
// observer's map. Scored side by side and from one client, because a filter
// added to codec.RosterFor would make 5b red while leaving 5 green — and the
// plan, five source comments and two status docs all used to instruct exactly
// that. (This header said it too, until C4.)
//
// Usage: node .claude/skills/verify/c3-flight-client.mjs [label] [url]
// Afterwards: cd backend && go run ./cmd/harnessdb -cleanup
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const label = process.argv[2] || 'c3f';
const url = process.argv[3] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');
import { joinAsNewCharacter } from './lib/join.mjs';

const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };
const outDir = dirname(fileURLToPath(import.meta.url));

// WARP takes 1/120 units and wants whole units.
const w = (p) => `${Math.round(p.x) * 120} ${Math.round(p.y) * 120}`;

// api/zones/world.json campfires. The origin is the fire the flight LEAVES
// from — it must be discovered too (a C2 ruling), which the dwell provides.
// The destination is the far southwest, ~85 units away: long enough that the
// flight is still running several samples after takeoff at 4× walk.
const ORIGIN = { id: 'spawnpoint-2', x: 44, y: 10.5 };
const DEST = { id: 'spawnpoint-4', x: -21.26, y: -23.51 };

const results = [];
const consoleErrors = [];
let phase = 'boot';
const check = (ok, name, note) => {
  results.push({ ok, name, note });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? '  — ' + note : ''}`);
};

const browser = await chromium.launch({ args: ['--no-sandbox'], env });

const newPlayer = async (tag) => {
  const page = await (await browser.newContext({ viewport: { width: 1100, height: 720 } })).newPage();
  // A 401 on a cold load is expected: the client asks the server who it is
  // before it can know (the chunk4-persistence filter, same reason).
  page.on('console', (m) => {
    if (m.type() === 'error' && !/\b401\b/.test(m.text())) consoleErrors.push(`[${tag}@${phase}] ` + m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(`[${tag}@${phase}] pageerror: ` + e.message));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  const name = await joinAsNewCharacter(page, tag);
  await page.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
  await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
  await page.evaluate(() => { const p = document.getElementById('developPanel'); if (p) p.style.display = 'none'; });
  await page.waitForTimeout(1200);
  return { page, name };
};

const cmd = async (page, text) => {
  await page.evaluate((t) => {
    const input = document.getElementById('console_command');
    input.value = t;
    document.getElementById('console').dispatchEvent(new Event('submit', { cancelable: true }));
  }, text);
  await page.waitForTimeout(700);
};

/**
 * ONE ATOMIC SAMPLE of everything a flight touches. Read as a single evaluate
 * on purpose (the §"one sample = one page.evaluate" rule): a flight is a state
 * that ends on its own, so two round trips can straddle the landing and score
 * the zoom of one moment against the lock of another.
 */
const readFlight = (page) => page.evaluate(() => {
  const map = window.game?.miniMap;
  const campfires = map?.['campfires'];
  const bar = document.getElementById('flightBar');
  const char = window.game?.character;
  return {
    // The HUD's own claim about the flight.
    barShown: !!bar && getComputedStyle(bar).display !== 'none',
    barText: bar?.querySelector('.barText')?.textContent ?? '',
    // Inline scale since code-health C5 (ProgressFill): "38.33% 1" — the
    // leading number is the fill percent, which is all the growth check reads.
    barFill: bar?.querySelector('.indicator')?.style.scale ?? '',
    locked: !!document.getElementById('actionBars')?.classList.contains('flightLocked'),
    zoomInInactive: !!document.getElementById('zoomInButton')?.classList.contains('inactive'),
    zoomOutInactive: !!document.getElementById('zoomOutButton')?.classList.contains('inactive'),
    // The camera's world scale, read off the ACCUMULATED transform of the
    // character's own sprite: `worldTransform.a` is screen px per world px
    // times the sprite's own (constant) scale, so a change in it IS the zoom
    // changing. Taken this way rather than through a Game API, because
    // window.game is a four-method façade and everything else on it reads
    // `undefined` silently (the skill's standing gotcha).
    stageScale: char?.shape?.worldTransform?.a ?? null,
    // Own position in wire units (÷120 = world units).
    x: char?.getX() ?? null,
    y: char?.getY() ?? null,
    // How far off screen-centre the flyer renders, as a fraction of the
    // viewport — the measurable form of "the camera keeps up". ⚑ Only
    // meaningful away from the map edges, where the camera clamps and the
    // player legitimately drifts off centre; every leg using it samples
    // mid-flight for exactly that reason.
    screenOffset: (() => {
      const g = char?.shape?.getGlobalPosition?.();
      if (!g) return null;
      return Math.hypot(g.x - window.innerWidth / 2, g.y - window.innerHeight / 2)
        / Math.min(window.innerWidth, window.innerHeight);
    })(),
    // Which stage layer the character's sprite is parented to. A flyer moves
    // to `flyers`, which is added to the cameraGroup AFTER the prop layers, so
    // it draws over the trees and rocks it passes (PO pass 2026-08-05: "the
    // player renders under props while flying"). Read as the container's own
    // name plus its index, because "above the props" is a fact about ORDER,
    // not about which container it happens to sit in.
    // ⚑ Everything below goes through `window.game.layers`, never
    // `game.cameraGroup` or `game.map` — the console façade exposes exactly
    // {run, character, pause, play, miniMap, layers}, and the other two read
    // `undefined` in silence (the skill's standing gotcha). The cameraGroup is
    // reached as a layer's own `.parent`, which is the same object.
    layerName: char?.shape?.parent?.['label'] ?? char?.shape?.parent?.['name'] ?? null,
    layerIndex: (() => {
      const p = char?.shape?.parent;
      return p?.parent ? p.parent.getChildIndex(p) : null;
    })(),
    propLayerIndex: (() => {
      const trees = window.game?.layers?.resources?.trees;
      return trees?.parent ? trees.parent.getChildIndex(trees) : null;
    })(),
    // The E prompt over a campfire (PO 2026-08-05). Counted off the campfire
    // LAYER — each child is a fire's shape group, and a lit badge is a visible
    // sub-container holding the 'E' text.
    fireBadges: (window.game?.layers?.mobs?.campfire?.children || [])
      .filter((shape) => (shape.children || []).some((c) =>
        c.visible !== false && (c.children || []).some((t) => t['text'] === 'E')))
      .length,
    // Map state, for the arm/confirm legs.
    mapOpen: !!map?.isOpen(),
    discovered: Array.from(campfires?.['discovered'] || []),
    armed: campfires?.['armed'] ?? null,
    rings: (campfires?.layer.children || []).filter((c) => !!c.context).length,
    sprites: (campfires?.layer.children || []).filter((c) => !c.context).length,
    scale: map?.scale ?? null,
  };
});

/**
 * Whether this client is drawing a nameplate for the named character.
 *
 * ⚑ BY NAME, not by counting plates. Mobs share the same unfiltered namePlates
 * overlay (Mobs.ts), and mobs enter and leave the viewport constantly — a count
 * would swing for reasons that have nothing to do with the flight and read as
 * a defect either way it moved.
 */
const seesPlayer = (page, name) => page.evaluate((wanted) => {
  const parent = (window.__auraPlate || window.game?.character?.['plate'])?.parent;
  if (!parent) return null;
  return parent.children.some((plate) =>
    (plate.children || []).some((c) => c.text === wanted));
}, name);

/**
 * The dots on this client's map, in canvas px from the layer origin — the
 * c3-player-roster reader, trimmed to what the flight legs ask.
 */
const readMapDots = (page) => page.evaluate(() => {
  const players = window.game?.miniMap?.['players'];
  if (!players) return { reachable: false };
  return {
    reachable: true,
    dots: players.layer.children.length,
    positions: players.layer.children.map((c) => ({ x: c.x, y: c.y })),
    scale: window.game.miniMap.scale,
    // For the landing diagnostic below: a dot at a fire is UNDER that fire's
    // marker (the PO's draw order puts campfires on top), so its presence in
    // the scene graph does not mean it can be seen.
    dotRadius: players.layer.children[0]?.getLocalBounds
      ? (players.layer.children[0].getLocalBounds().maxX
         - players.layer.children[0].getLocalBounds().minX) / 2
      : null,
    fireSize: (() => {
      const fire = window.game.miniMap['campfires']?.layer.children.find((c) => !c.context);
      if (!fire) return null;
      const bnd = fire.getLocalBounds();
      return Math.max(bnd.maxX - bnd.minX, bnd.maxY - bnd.minY) * fire.scale.x;
    })(),
  };
});

/**
 * Distance from the nearest drawn dot to a world point, in canvas px.
 *
 * ⚑ NEAREST-DOT, NEVER A COUNT — inherited verbatim from c3-player-roster,
 * where a count went red because a third player (the PO, hand-testing) was on
 * the same dev server. What these legs mean is "the flyer's dot is / is not
 * HERE", and that is what this measures.
 */
const nearestDot = (sampled, target) => sampled.positions
  .map((p) => Math.hypot(p.x - target.x, p.y - target.y))
  .sort((x, y) => x - y)[0];

/**
 * How far a dot may legitimately lag its player, in canvas px.
 *
 * ⚑ DERIVED, not guessed, and the derivation is the point: the roster
 * publishes at 1 Hz (core/net.go rosterIntervalTicks), so a dot is up to one
 * full second stale — which at flight speed is ~4.3 world units, roughly three
 * times a walker's staleness. That step is the accepted, written-down cost of
 * a 1 Hz roster (MapPlayers' header; re-affirmed by the PO at C4 rather than
 * fixed). A tolerance tighter than the publication interval would be scoring
 * the roster rate, not the D16 ruling.
 */
const lagPx = (scale) => 4.3 * 1.2 * 120 * scale + 2.0;

/**
 * Hold the interact key long enough for the rAF-throttled Controls clock to
 * sample it — the standing hotkey gotcha, and the reason a 200 ms press reads
 * as a dead feature (chunk3b-interact's `press` verbatim).
 */
const pressInteract = async (page) => {
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down('e');
  await page.waitForTimeout(1400);
  await page.keyboard.up('e');
  await page.waitForTimeout(1200);
};

/** Press the drawn map at a campfire's marker position. */
const pressFire = async (page, fire) => {
  const box = await page.evaluate(() => {
    const c = window.game.miniMap.application.canvas;
    const b = c.getBoundingClientRect();
    return { left: b.left, top: b.top, width: b.width, height: b.height };
  });
  const scale = (await readFlight(page)).scale;
  await page.mouse.click(
    box.left + box.width / 2 + fire.x * 120 * scale,
    box.top + box.height / 2 + fire.y * 120 * scale);
  await page.waitForTimeout(500);
};

let a, b;
try {
  phase = 'join';
  a = await newPlayer('fly');
  b = await newPlayer('watch');
  console.log(`\nflyer=${a.name}  observer=${b.name}\n`);

  // Cache the plate roots while both characters are alive — a death nulls the
  // documented way into the scene graph (the skill's standing gotcha).
  for (const p of [a.page, b.page]) {
    await p.evaluate(() => { window.__auraPlate = window.game.character['plate']; });
  }

  // --- 1. two discovered fires, and both players at the origin -------------
  phase = 'discover';
  for (const p of [a.page, b.page]) {
    await cmd(p, 'PING');   // the first command after joining is dropped
    await cmd(p, 'GOD');    // the eastern fire has company; dying proves nothing
  }
  // ⚑ THE PROMPT AT A FIRE WITH NO CONVERSANT, scored FIRST and from the
  // spawn, because it is the case the rest of this script structurally cannot
  // reach. Both flight endpoints have an NPC standing on them — VillageHealer
  // 1.5 units from spawnpoint-2, LamplessTraveller 1.1 from spawnpoint-4 — so
  // every later badge reading is taken where a conversant is ALSO in range.
  // That is what let the badge ship suppressed at every lonely fire while this
  // script went green: the "my own panel is open" guard compared `offered`
  // against a partnerId of 0 and matched whenever nobody was offered (PO:
  // "sometimes the E is not visible"). spawnpoint-1 is the starting spawn and
  // its nearest conversant is the TownCrier at 3.2 units — outside talk range —
  // so a fresh character stands at a fire and nothing else.
  await a.page.waitForTimeout(3000); // dwell in the spawn fire's radius
  let spawnState = await readFlight(a.page);
  check(spawnState.discovered.includes('spawnpoint-1') && spawnState.fireBadges >= 1,
    '0 the E prompt lights at a fire with NO conversant in range',
    `discovered=[${spawnState.discovered}] badges=${spawnState.fireBadges}`);

  // The flyer dwells at BOTH ends, because the destination must be discovered
  // (D4) and so must the origin.
  await cmd(a.page, `WARP ${w(DEST)}`);
  await a.page.waitForTimeout(6000);
  await cmd(a.page, `WARP ${w(ORIGIN)}`);
  await a.page.waitForTimeout(6000);
  await cmd(b.page, `WARP ${w(ORIGIN)}`);
  await b.page.waitForTimeout(6000);

  let s = await readFlight(a.page);
  const haveBoth = s.discovered.includes(ORIGIN.id) && s.discovered.includes(DEST.id);
  check(haveBoth, '1 both ends discovered by dwelling (D4)', `discovered=[${s.discovered}]`);
  if (!haveBoth) throw new Error('no flyable pair — the rest cannot be scored');

  // The observer must actually be able to see the flyer before takeoff, or
  // leg 5's "cannot see them" proves nothing at all.
  const seenBefore = await seesPlayer(b.page, a.name);
  check(seenBefore === true,
    '1b the observer can see the flyer BEFORE takeoff (leg 5\'s precondition)',
    `sees ${a.name}: ${seenBefore}`);

  const groundScale = s.stageScale;
  const groundX = s.x;

  // --- 2. the map opened with M is READ-ONLY (PO ruling 2026-08-05) --------
  // Flight is reachable only through E at a fire, so the M map must not depart.
  // This leg is the negative control for leg 2a: without it, an E that silently
  // did nothing would still score green as long as M happened to arm.
  phase = 'read-only map';
  await a.page.keyboard.press('KeyM');
  await a.page.waitForTimeout(900);
  s = await readFlight(a.page);
  check(s.mapOpen, '2 the M map opened');
  await pressFire(a.page, DEST);
  s = await readFlight(a.page);
  check(s.armed === '' && !s.barShown,
    '2a a press on the M-opened map arms NOTHING (flight is fire-gated)',
    `armed="${s.armed}" bar=${s.barShown}`);
  await a.page.keyboard.press('Escape');
  await a.page.waitForTimeout(600);

  // --- 2a. E at the fire opens the map, and one press ARMS -----------------
  phase = 'arm';
  s = await readFlight(a.page);
  check(s.fireBadges >= 1,
    '2a1 the campfire wears the E prompt while you stand at it',
    `${s.fireBadges} badge(s) lit`);
  await pressInteract(a.page);
  await a.page.waitForTimeout(600);
  s = await readFlight(a.page);
  check(s.mapOpen, '2b E at the campfire opens the flight map');
  if (!s.mapOpen) throw new Error('E did not open the map — the flight legs cannot be scored');

  // A second E closes it: once the map is up every remaining choice is made
  // with the mouse, so the control that opened it is the one players reach for
  // to dismiss it (PO 2026-08-05) — the conversation panel's rule exactly.
  await pressInteract(a.page);
  s = await readFlight(a.page);
  check(!s.mapOpen, '2b2 and a second E closes it again', `open=${s.mapOpen}`);
  await pressInteract(a.page);
  s = await readFlight(a.page);
  check(s.mapOpen, '2b3 and a third re-opens it — the toggle is stable');
  if (!s.mapOpen) throw new Error('the map did not re-open — the flight legs cannot be scored');

  await pressFire(a.page, DEST);
  s = await readFlight(a.page);
  check(s.armed === DEST.id, '2c one press arms the destination', `armed=${s.armed}`);
  check(s.rings >= 2, '2d and rings it, without replacing the bound fire\'s ring',
    `${s.rings} ring(s) for ${s.sprites} marker(s)`);
  check(!s.barShown && !s.locked,
    '2e a single press does NOT commit to the crossing (D11 has no bail-out)',
    `bar=${s.barShown} locked=${s.locked}`);
  await a.page.screenshot({ path: join(outDir, `${label}-armed.png`) });

  // --- 3. the second press flies -------------------------------------------
  phase = 'takeoff';
  await pressFire(a.page, DEST);
  await a.page.waitForFunction(
    () => getComputedStyle(document.getElementById('flightBar')).display !== 'none',
    null, { timeout: 15_000 }).catch(() => {});
  s = await readFlight(a.page);
  check(s.barShown, '3 the confirming press starts the flight', `bar="${s.barText}"`);
  check(!s.mapOpen, '3b and closes the map behind it');
  if (!s.barShown) throw new Error('never took off — the airborne legs cannot be scored');

  // --- 4. airborne ---------------------------------------------------------
  phase = 'airborne';
  check(/^Flying — \d+\.\ds$/.test(s.barText),
    '4 the indicator shows an ETA in the cast bar\'s convention', `"${s.barText}"`);
  check(s.locked, '4b the ability bar is greyed for the duration');
  check(s.zoomInInactive && s.zoomOutInactive,
    '4c both zoom buttons lock with it',
    `in=${s.zoomInInactive} out=${s.zoomOutInactive}`);
  check(s.stageScale !== null && groundScale !== null && s.stageScale < groundScale * 0.75,
    '4d the camera zooms OUT, with the server AOI (landmine 3)',
    `stage scale ${groundScale?.toFixed(4)} -> ${s.stageScale?.toFixed(4)}`);

  // Altitude has no other representation — no shadow, no scale change — so a
  // flyer that passes BEHIND a tree stops reading as flight at all (PO pass
  // 2026-08-05). Asserted as stage ORDER rather than as a container name: the
  // claim is "above the props", and a renamed layer that still drew underneath
  // would pass a name check while looking exactly as wrong.
  check(s.layerIndex !== null && s.propLayerIndex !== null
      && s.layerIndex > s.propLayerIndex,
    '4d2 the flyer draws ABOVE the props it crosses',
    `flyer layer '${s.layerName}' at ${s.layerIndex}, props at ${s.propLayerIndex}`);

  // A press mid-flight must refuse AND say why.
  await a.page.click('#auraSlotList li[data-slot="0"]', { timeout: 5000 }).catch(() => {});
  await a.page.waitForTimeout(400);
  const banner = await a.page.evaluate(() =>
    document.getElementById('alertBanner')?.textContent ?? '');
  check(/flying/i.test(banner),
    '4e a locked ability press states the reason instead of failing silently',
    `banner="${banner.trim()}"`);

  // The lerp is really moving, and the ETA is really counting down.
  const t1 = await readFlight(a.page);
  await a.page.waitForTimeout(2500);
  const t2 = await readFlight(a.page);
  const moved = Math.hypot(t2.x - t1.x, t2.y - t1.y) / 120;
  check(moved > 2.0, '4f the flyer is moving, fast', `${moved.toFixed(2)} world units in 2.5 s`);
  const sec = (t) => parseFloat((t.barText.match(/([\d.]+)s/) || [])[1] ?? 'NaN');
  check(sec(t2) < sec(t1), '4g the ETA counts down', `${sec(t1)}s -> ${sec(t2)}s`);
  check(parseFloat(t2.barFill) > parseFloat(t1.barFill || '0'),
    '4h and the progress fill grows with it', `${t1.barFill} -> ${t2.barFill}`);
  // Hard-follow: the flyer stays centred instead of being pushed toward the
  // screen edge. Sampled mid-flight, away from the map edges where the camera
  // legitimately clamps. The steering Vehicle tops out at movementSpeed × 2
  // and flight is 4× walk, so without the hard-follow this drifts steadily out
  // and eventually off screen.
  check(t2.screenOffset !== null && t2.screenOffset < 0.08,
    '4i the camera hard-follows rather than trailing at walk speed',
    `${(t2.screenOffset * 100)?.toFixed(1)}% of the viewport off centre`);
  await a.page.screenshot({ path: join(outDir, `${label}-airborne.png`) });

  // --- 5. the observer loses the flyer (D13) -------------------------------
  phase = 'invisible';
  const seenDuring = await seesPlayer(b.page, a.name);
  check(seenDuring === false,
    '5 the flyer leaves the observer\'s snapshot (D13 — the body left the space)',
    `sees ${a.name}: before=${seenBefore} airborne=${seenDuring}`);

  // --- 5b. ...and stays on the observer's MAP (D16) -------------------------
  //
  // The same player, the same instant, the opposite answer. This is the leg a
  // filter in codec.RosterFor turns red while leaving leg 5 green.
  const dots1 = await readMapDots(b.page);
  const air1 = await readFlight(a.page);
  if (!dots1.reachable) {
    check(false, '5b the observer\'s roster layer is reachable',
      'window.game.miniMap.players missing');
  } else {
    const tol = lagPx(dots1.scale);
    const near1 = nearestDot(dots1, { x: air1.x * dots1.scale, y: air1.y * dots1.scale });
    check(near1 !== undefined && near1 < tol,
      '5b the flyer is STILL a dot on the observer\'s map (D16)',
      `nearest dot ${near1 === undefined ? 'none' : near1.toFixed(2) + ' px'}`
      + ` from the flyer, tolerance ${tol.toFixed(2)} px, of ${dots1.dots} dot(s)`);

    // ⚑ Present is not enough — a dot frozen at the origin fire would pass the
    // leg above for the first second of every flight. The payoff the PO ruled
    // for is watching someone CROSS the map, so the dot has to move with the
    // lerp. (It does because core/input.go writes SetPosition every tick and
    // RosterFor reads Position(); leaving the physics space freezes nothing.)
    await a.page.waitForTimeout(2500);
    const dots2 = await readMapDots(b.page);
    const air2 = await readFlight(a.page);
    const flew = Math.hypot(air2.x - air1.x, air2.y - air1.y) / 120;
    const near2 = nearestDot(dots2, { x: air2.x * dots2.scale, y: air2.y * dots2.scale });
    check(flew > 1.0 && near2 !== undefined && near2 < lagPx(dots2.scale),
      '5c and the dot TRACKS the flight rather than sitting at the origin fire',
      `the flyer moved ${flew.toFixed(2)} world units; the nearest dot followed to`
      + ` ${near2 === undefined ? 'none' : near2.toFixed(2) + ' px'}`);
  }

  // --- 6. landing restores everything --------------------------------------
  phase = 'landing';
  await a.page.waitForFunction(
    () => getComputedStyle(document.getElementById('flightBar')).display === 'none',
    null, { timeout: 90_000 }).catch(() => {});
  await a.page.waitForTimeout(1500);
  s = await readFlight(a.page);
  check(!s.barShown, '6 the indicator goes away on landing');
  check(!s.locked, '6b the ability bar is usable again');
  check(!s.zoomInInactive || !s.zoomOutInactive, '6c the zoom buttons unlock',
    `in=${s.zoomInInactive} out=${s.zoomOutInactive}`);
  check(s.stageScale !== null && Math.abs(s.stageScale - groundScale) < groundScale * 0.02,
    '6d the camera returns to exactly the pre-flight zoom level',
    `${groundScale?.toFixed(4)} -> ${s.stageScale?.toFixed(4)}`);
  // Landmine 1's both-directions rule, applied to the render layer: a flyer
  // left on the flyers layer after touchdown walks over every tree for the
  // rest of the session, which looks like nothing at all until someone stands
  // behind one.
  check(s.layerIndex !== null && s.propLayerIndex !== null
      && s.layerIndex < s.propLayerIndex,
    '6d2 and drops back UNDER the props on landing',
    `layer '${s.layerName}' at ${s.layerIndex}, props at ${s.propLayerIndex}`);
  const landed = Math.hypot(s.x / 120 - DEST.x, s.y / 120 - DEST.y);
  check(landed < 3.0, '6e and the flyer is at the destination fire',
    `${landed.toFixed(2)} world units from ${DEST.id}, from ${(groundX / 120).toFixed(1)}`);

  // Movement works again — the input gate came off with the rest.
  const before = { x: s.x, y: s.y };
  await a.page.keyboard.down('KeyD');
  await a.page.waitForTimeout(2000);
  await a.page.keyboard.up('KeyD');
  await a.page.waitForTimeout(600);
  const after = await readFlight(a.page);
  check(Math.hypot(after.x - before.x, after.y - before.y) / 120 > 0.3,
    '6f movement input is accepted again',
    `${(Math.hypot(after.x - before.x, after.y - before.y) / 120).toFixed(2)} world units walked`);
  await a.page.screenshot({ path: join(outDir, `${label}-landed.png`) });

  // --- 6g. the map dot survives landing too (D16, both directions) ----------
  //
  // ⚑ There is no restore-at-landing gate here to forget, and that is the leg:
  // D16 is cheaper than the filter it replaced precisely because takeoff
  // changed nothing, so landing has nothing to undo (landmine 1's rule costs
  // one assertion instead of a mechanism).
  const dots3 = await readMapDots(b.page);
  const landedAt = await readFlight(a.page);
  const near3 = nearestDot(dots3, { x: landedAt.x * dots3.scale, y: landedAt.y * dots3.scale });
  check(near3 !== undefined && near3 < lagPx(dots3.scale),
    '6g the flyer\'s dot is still on the observer\'s map after landing',
    `${near3 === undefined ? 'none' : near3.toFixed(2) + ' px'} from the landed flyer`
    + ` of ${dots3.dots} dot(s)`);

  // ⚑ NOT A LEG — a measurement, for a call the PO already owns. The dot is in
  // the scene graph; whether it can be SEEN is a different question, because
  // the ruled draw order puts campfires above other players and landing puts
  // the dot under a fire marker by construction. That is CLAUDE.md's standing
  // open item ("your own dot is invisible under that fire's marker") reaching
  // a second surface: every arrival, for every observer. Recorded, not fixed —
  // marker sizing is a tuning call, and asserting the graph would be the same
  // false comfort as C2's `display: block` on an invisible marker.
  console.log(`\n  [diagnostic] landed dot vs the fire marker it sits under:`
    + ` dot r=${dots3.dotRadius?.toFixed(1)} px, marker=${dots3.fireSize?.toFixed(1)} px`
    + ` → ${dots3.dotRadius * 2 < dots3.fireSize ? 'OCCLUDED' : 'visible'}`);
  await b.page.screenshot({ path: join(outDir, `${label}-observer-map.png`) });

} catch (e) {
  check(false, `harness error during "${phase}"`, e.message);
} finally {
  console.log(`\nconsole errors: ${consoleErrors.length}`);
  consoleErrors.slice(0, 10).forEach((e) => console.log('  ' + e));
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} passed`);
  await browser.close();
  process.exit(passed === results.length && consoleErrors.length === 0 ? 0 : 1);
}
