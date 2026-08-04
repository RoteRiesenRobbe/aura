#!/usr/bin/env node
// plan-world-map.md C3 — the player roster, at the real game surface.
//
// TWO clients, because one cannot prove any of this: the whole chunk is "you
// can see other people on your map", and every leg here is read from A's map
// about B.
//
//   1  A alone: the roster reaches the client and draws NOBODY — A's own dot is
//      excluded by id, which is the landmine-6 answer made observable
//   2  B joins at a known place: A grows exactly one dot, at B's position
//   3  the depth order props < campfires < roster < characters
//   4  full-screen: the same dot, re-placed by the new scale
//   5  B moves: A's dot follows within the ~1 Hz publication window
//   6  B leaves the world: A's dot is GONE — absence in the roster IS the
//      removal signal, and there is no second message to miss
//
// ⚑ Leg 1 is a negative control that can only fail one way, and it is the way
// this chunk would most plausibly break: a roster that included your own dot
// would look completely correct in a screenshot with two players on the map.
//
// ⚑ Leg 3 is C2's lesson carried forward. Its markers shipped INVISIBLE behind
// the ~777 prop icons while every count, position and persistence leg passed.
// A dot buried under a tree is the same failure, and only a stage-index
// assertion catches it.
//
// ⚑ Every wait after a change is ≥ 1.6 s. The roster is published once a second
// (core/net.go rosterIntervalTicks), so anything shorter is a coin flip.
//
// Usage: node .claude/skills/verify/c3-player-roster.mjs [label] [url]
// Afterwards: cd backend && go run ./cmd/harnessdb -cleanup
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const label = process.argv[2] || 'c3';
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
// Two spots far apart and far from the origin, so a dot at the wrong scale or
// on a stale position cannot coincidentally land on the right answer.
const B_FIRST = { x: 44, y: 10 };
const B_SECOND = { x: -30, y: -20 };
// The fire A discovers by spawning at it (startingSpawn, api/zones/world.json) —
// leg 6 stands B on top of it. WARP's whole-unit granularity lands ~0.2 units
// off, which is well inside either marker.
const A_FIRE = { x: -58, y: 24 };
// One publication is 1 s; 1.6 s is one full window plus slack for a throttled
// headless page.
const ROSTER_WINDOW = 1600;

const results = [];
const consoleErrors = [];
// Which leg was running when an error landed. ⚑ Worth the two lines: the one
// error class this harness is likely to see is backlog §29's lost WebGL
// context (four browser contexts in one headless process — two pages × the
// world canvas + the map's), and "when" is the only evidence that separates
// an environment problem from a product one.
let phase = 'boot';
const check = (ok, name, note) => {
  results.push({ ok, name, note });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? '  — ' + note : ''}`);
};

const browser = await chromium.launch({ args: ['--no-sandbox'], env });

const newPlayer = async (tag) => {
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
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
 * One atomic sample of the roster layer, read off the pixi scene graph through
 * window.game.miniMap — the dots are pixi children with no DOM of their own.
 *
 * `held` is the roster as RECEIVED (including the local player, who is filtered
 * only at draw time); `dots` is what is actually on screen. Reporting both is
 * what makes leg 1 diagnosable: "received 1, drew 0" is the pass, "received 0"
 * would mean the message never arrived at all.
 */
const readRoster = () => page => page.evaluate(() => {
  const map = window.game?.miniMap;
  const players = map?.['players'];
  if (!players) return { reachable: false };
  const children = players.layer.children;
  return {
    reachable: true,
    dots: children.length,
    // Dot positions in canvas px from the layer origin (the canvas centre) —
    // the dots are drawn at their own origin and POSITIONED, like every entity
    // icon on this map.
    positions: children.map((c) => ({ x: c.x, y: c.y })),
    held: (players['players'] || []).length,
    // ⚑ The dot's drawn radius against the campfire marker's drawn size, on the
    // SAME canvas. The dots are layered above the fires, so a dot wider than a
    // marker erases the fire a player is standing at — which is C2's bug with
    // the operands swapped, and no count, position or depth leg can see it.
    dotRadius: children[0]?.getLocalBounds
      ? (children[0].getLocalBounds().maxX - children[0].getLocalBounds().minX) / 2
      : null,
    fireSize: (() => {
      const fire = map['campfires']?.layer.children.find((c) => !c.context);
      if (!fire) return null;
      const b = fire.getLocalBounds();
      return Math.max(b.maxX - b.minX, b.maxY - b.minY) * fire.scale.x;
    })(),
    selfId: players['selfId'],
    characterId: window.game?.character?.id ?? null,
    scale: map.scale,
    open: map.isOpen(),
    // ⚑ The assertion C2 had to learn the hard way. Layer.CHARACTER = 0,
    // Layer.OTHER = 1 (MiniMapInterfaces).
    depth: {
      props: map.stage.getChildIndex(map.layerContainers[1]),
      campfires: map['campfires'] ? map.stage.getChildIndex(map['campfires'].layer) : -1,
      roster: map.stage.getChildIndex(players.layer),
      characters: map.stage.getChildIndex(map.layerContainers[0]),
    },
  };
});
const sample = readRoster();

/** Where a client's own character is, in the px space the roster uses. */
const ownPosition = (page) => page.evaluate(() => ({
  x: window.game.character.getX(),
  y: window.game.character.getY(),
}));
const bPosition = () => ownPosition(b.page);

/**
 * Distance from the nearest drawn dot to a world point, in canvas px.
 *
 * ⚑ EVERY position leg goes through this instead of counting dots, and the
 * reason is a measured red run: the dev server had a THIRD player on it — the
 * PO, hand-testing — so `dots === 1` failed while the feature was perfectly
 * correct. A harness that assumes it is alone on a shared server is asserting
 * something the product never promised. What each leg actually means is "B's
 * dot is / is not here", and that is what this measures.
 */
const nearestDot = (sampled, target) => sampled.positions
  .map((p) => Math.hypot(p.x - target.x, p.y - target.y))
  .sort((x, y) => x - y)[0];
/** A dot is "here" within ~2 px; anything further is a different player. */
const HERE = 2.0;

let a, b;
try {
  phase = '1-alone';
  a = await newPlayer('c3a');
  console.log(`\nA joined as ${a.name}`);
  await a.page.waitForTimeout(ROSTER_WINDOW);

  // --- 1. alone: the roster arrives, and draws nobody -----------------------
  let m = await sample(a.page);
  if (!m.reachable) {
    check(false, '1 the roster layer is reachable', 'window.game.miniMap.players missing');
    throw new Error('cannot read the roster layer');
  }
  check(m.held >= 1, '1 the roster message reaches the client',
    `${m.held} entry/entries held`);
  // ⚑ The negative control: A's OWN entry must not become a dot. Asked as
  // "is there a dot where I am standing", not "is the layer empty" — another
  // player may legitimately be online (the PO, hand-testing on the same dev
  // server, is what made the count version go red).
  const aAt = await ownPosition(a.page);
  const selfDot = nearestDot(m, {x: aAt.x * m.scale, y: aAt.y * m.scale});
  check(selfDot === undefined || selfDot > HERE,
    '1b and your own dot is not drawn from it',
    `nearest dot ${selfDot === undefined ? 'none' : selfDot.toFixed(2) + ' px'} from own position;`
    + ` ${m.dots} dot(s) on the map, selfId=${m.selfId} character=${m.characterId}`);
  check(m.selfId === m.characterId && m.selfId > 0,
    '1c the exclusion is by the local character id', `selfId=${m.selfId}`);

  // --- 2. B joins somewhere known -------------------------------------------
  phase = '2-join';
  b = await newPlayer('c3b');
  console.log(`B joined as ${b.name}`);
  await cmd(b.page, 'PING'); // the first command after joining is dropped
  await cmd(b.page, 'GOD');  // B must not die mid-run and vanish for the wrong reason
  await cmd(b.page, `WARP ${w(B_FIRST)}`);
  await a.page.waitForTimeout(ROSTER_WINDOW * 2);

  // ⚑ Position, not presence, and certainly not a count — a dot in the wrong
  // place is the failure a count can never catch, and a count is also what a
  // bystander breaks. Against B's REAL position (see leg 5's note), not the
  // warp target.
  m = await sample(a.page);
  const bAt = await bPosition();
  const expected = { x: bAt.x * m.scale, y: bAt.y * m.scale };
  let nearest = nearestDot(m, expected);
  check(nearest !== undefined && nearest < HERE,
    '2 a second player appears, at their own position',
    `${nearest?.toFixed(3)} px from ${JSON.stringify(expected)} of ${m.dots} dot(s)`
    + ` (docked scale ${m.scale.toFixed(5)})`);

  // --- 3. depth ------------------------------------------------------------
  //
  // The PO's order, lowest first: props → other players → you → campfires
  // (2026-08-04). ⚑ It INVERTS C2's fires-under-the-people rule, so this leg is
  // also the thing that would catch a merge quietly restoring it.
  check(m.depth.props < m.depth.roster && m.depth.roster < m.depth.characters
    && m.depth.characters < m.depth.campfires,
    '3 the ruled draw order: props < other players < you < campfires',
    `props ${m.depth.props} < roster ${m.depth.roster} < characters ${m.depth.characters} < campfires ${m.depth.campfires}`);

  // --- 4. the full-screen state --------------------------------------------
  phase = '4-fullscreen';
  const dockedScale = m.scale;
  await a.page.keyboard.press('KeyM');
  await a.page.waitForTimeout(900);
  const full = await sample(a.page);
  check(full.open === true, '4 the map opened');
  check(full.dots >= 1, '4b the dots survive the state change', `${full.dots} dot(s)`);
  check(full.scale > dockedScale * 5, '4c and at the full-screen scale',
    `${dockedScale.toFixed(5)} -> ${full.scale.toFixed(5)}`);
  // ⚑ Re-placed by the new scale rather than stretched from the old one: the
  // dots are redrawn on a state change even though no roster arrived.
  const fullExpected = { x: bAt.x * full.scale, y: bAt.y * full.scale };
  const fullNearest = nearestDot(full, fullExpected);
  check(fullNearest !== undefined && fullNearest < HERE,
    '4d re-placed by the new scale, not stretched from the old one',
    `${fullNearest?.toFixed(3)} px from ${JSON.stringify(fullExpected)}`);
  await a.page.screenshot({ path: join(outDir, `${label}-roster-fullscreen.png`) });

  // --- 5. the dot follows ---------------------------------------------------
  //
  // ⚑ Checked against where B ACTUALLY IS, read off B's own client, not against
  // the coordinates WARP was handed. Measured: a warp can land a fraction of a
  // unit off its target — the body is pushed out of whatever it materialised
  // inside — and asserting on the requested spot turned a correct dot into a
  // 3 px miss. The warp target is the harness's intent; B's position is the
  // fact the map is making a claim about.
  phase = '5-move';
  await cmd(b.page, `WARP ${w(B_SECOND)}`);
  await a.page.waitForTimeout(ROSTER_WINDOW * 2);
  const moved = await sample(a.page);
  const at = await bPosition();
  const movedExpected = { x: at.x * moved.scale, y: at.y * moved.scale };
  const stale = nearestDot(moved, expected);
  nearest = nearestDot(moved, movedExpected);
  check(nearest !== undefined && nearest < HERE && (stale === undefined || stale > HERE),
    '5 the dot follows the other player across the world, leaving nothing behind',
    `${nearest?.toFixed(3)} px from the new spot, ${stale?.toFixed(1)} px from the old one`
    + ` (B at ${(at.x / 120).toFixed(2)}, ${(at.y / 120).toFixed(2)})`);

  // --- 6. the fire wins where a player stands on it -------------------------
  //
  // ⚑ The case the ruling is ABOUT, made observable: a player dwelling at a
  // fire is the single most likely place for two markers to coincide — binding
  // a campfire is what standing still at one is FOR. Leg 3 proves the order in
  // the abstract; this proves both markers actually exist at the same spot
  // while it applies, which is the only way the order can be shown to matter.
  //
  // ⚑ It measures the two sizes and does NOT assert on them. Under the old
  // order the dot had to fit inside the fire or it erased it; now the fire is
  // on top and covers whatever it likes. The numbers stay in the output because
  // they are what caught the first bug, and because a dot that outgrew the fire
  // would now silently ring it.
  phase = '6-at-the-fire';
  await cmd(b.page, `WARP ${w(A_FIRE)}`);
  await a.page.waitForTimeout(ROSTER_WINDOW * 2);
  const together = await sample(a.page);
  const fireAt = await bPosition(); // B's last position, for leg 7
  check(together.fireSize !== null && together.dotRadius !== null,
    '6 a fire marker and a player dot coincide on the map',
    `dot ${(together.dotRadius * 2)?.toFixed(1)} px across vs fire ${together.fireSize?.toFixed(1)} px`);
  check(together.depth.campfires > together.depth.roster,
    '6b and the fire is the one drawn on top',
    `roster ${together.depth.roster} < campfires ${together.depth.campfires}`);
  await a.page.screenshot({ path: join(outDir, `${label}-dot-at-fire.png`) });

  // ⚑ 6c pins the WORLD order, which is the OPPOSITE of the map's — and that
  // opposition is the point, not an inconsistency to be tidied away. On the map
  // the fire marker wins (6b above); in the world the player wins, unchanged
  // since `6afbee84` ("the fire sprite used to hide the avatar completely").
  // The PO ruled both, separately, and building the world to match the map was
  // tried in this chunk and bounced back from a screenshot. Anyone who "fixes"
  // one to agree with the other breaks a ruling, so both are asserted in one
  // place. B is standing in the fire, so the screenshot shows the world half.
  const worldOrder = await b.page.evaluate(() => {
    const layers = window.game?.layers;
    const group = layers?.characters?.parent;
    if (!group) return null;
    return {
      characters: group.getChildIndex(layers.characters),
      campfire: group.getChildIndex(layers.mobs.campfire),
      wildlife: group.getChildIndex(layers.mobs.wildlife),
    };
  });
  check(worldOrder && worldOrder.campfire < worldOrder.characters
    && worldOrder.wildlife < worldOrder.characters,
    '6c in the WORLD the avatar draws over the fire — the map\'s order INVERTED, on purpose',
    worldOrder
      ? `campfire ${worldOrder.campfire} < characters ${worldOrder.characters}`
      + ` (map: roster ${together.depth.roster} < campfires ${together.depth.campfires})`
      : 'world layers unreadable');
  await b.page.screenshot({ path: join(outDir, `${label}-world-at-fire.png`) });

  // --- 7. and disappears when they leave ------------------------------------
  //
  // A real session end, not a socket drop: leaving to character-select takes B
  // out of the world's player list, which is the only thing the roster reads.
  phase = '7-leave';
  await b.page.click('#gameSettingsButton');
  await b.page.click('#leaveToCharacterSelect');
  await b.page.waitForSelector('#characterSelect:not(.hidden)', { state: 'visible', timeout: 60_000 });
  await a.page.waitForTimeout(ROSTER_WINDOW * 2);

  const gone = await sample(a.page);
  const leftBehind = nearestDot(gone, { x: fireAt.x * gone.scale, y: fireAt.y * gone.scale });
  check(leftBehind === undefined || leftBehind > HERE,
    '7 a player who left leaves no dot behind',
    `nearest dot to B's last position: ${leftBehind === undefined ? 'none' : leftBehind.toFixed(1) + ' px'}`
    + ` (${gone.dots} dot(s) still on the map, ${gone.held} roster entries held)`);
  await a.page.screenshot({ path: join(outDir, `${label}-after-leave.png`) });

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
