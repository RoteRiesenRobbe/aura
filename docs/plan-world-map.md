# Plan: The world map & minimap rework (fast travel, part 1)

**Status:** IN PROGRESS — **C1 shipped** 2026-08-04 (`f09d99d0`), **C2 built**
2026-08-04 (`[uncommitted]`), C3 open. Designed 2026-08-04. Per-chunk ledger: §10.

⚑ **C2 absorbed `plan-flight-paths.md` C1 wholesale** (PO ruling: discovered
fires persist per character). That reverses **§8** — this plan *does* ship a
migration — and makes **§6 C3's** "the one chunk with a protocol change" false.
Both are annotated in place rather than rewritten.

**Sibling:** `plan-flight-paths.md` (part 2) builds the flight system **on top of
this**. This doc ships standalone and is useful without it; that split is PO
ruling **D1**.

---

## 1. What this is, and its inputs

Backlog **§41** (fast travel, WoW/Gothic fit: **high**) was opened as a design
session on 2026-08-04. The PO chose **option 2 — WoW-Classic flight paths** and
extended the ask: fast travel needs a **map to select destinations on**, and the
map/minimap wanted a rework anyway. Twelve decisions were ruled in-session
(§3 here + §3 of the sibling doc).

This part owns everything that is true whether or not flight ever ships:

- one map **module** with two states — the docked minimap and a full-screen map,
- **campfires on the map** (discovered ones only),
- **other players on the map**, which is a server change, not a client one,
- the HUD button + key that toggles the two states.

Nothing here needs the flight state machine, and none of it is throwaway when
flight lands: part 2 adds destination selection *to this map* and a route
overlay, and that is the whole of its UI surface.

## 2. What already exists (surveyed 2026-08-04, don't re-derive)

**The client already bundles every zone.** `GroundTextureManager` webpack-
`require.context`s `api/zones/*.json` into `zonesByStem` and exposes
`getZoneData(zoneName)`; `DarknessOverlay` already reads `campfires` and
`darkAreas` out of it. So terrain, campfire positions and world bounds are
**already on the client, at full fidelity, with zero wire work**. A full-screen
map is a second renderer over data the client has held since the darkness chunk.

**The minimap already draws the whole world.** `MiniMap.updateScaling` sets
`scale = width / mapWidth` — it is a world-scale map already, not a viewport
window. It has a layer split (`CHARACTER` / `OTHER`), a four-level dynamic
model (`LevelOfDynamic`), and an icon-lifecycle contract (`IMiniMapRendered`)
that game objects already implement.

**Other characters already appear on it** — `EntityManager` adds every
`visibleOnMinimap` object, and `Character` implements `createMinimapIcon()`.
⚑ **But only while inside the AOI.** The server streams a **20 × 12 m** viewport
(`model/constant/const.go: ViewPortWidth/Height`), which is roughly one screen.
So "show other players on the minimap" is **not** a client feature — the client
already draws every player it knows about, and it knows about almost none of
them. It is a new server stream (D7).

**Scale check.** `api/zones/world.json` is **144 × 72** units and holds 5
campfires, 777 props, 485 spawns, 537 terrain pieces. The whole world is ~7 × 6
viewports. Player walk speed is `0.05`/tick = **1.5 units/s**, so the world is
about **96 s wide on foot** today.

## 3. Decisions (PO, 2026-08-04)

- **D1 — Two plans, map first.** The map/minimap rework is its own plan and its
  own sessions; flight builds on it. *Why:* destination selection needs a map to
  click, so building flight first would mean shipping a throwaway text list.
- **D5 — One map system, two states.** Today's minimap becomes the **docked
  state** of a single map module; a key + a HUD button toggle the **full-screen
  state**. One renderer, one marker set. *Why:* two surfaces drawing the same
  markers is exactly the duplication DRY warns about, and they would drift.
  The full-screen state **pauses nothing** — the world keeps running behind it,
  like the `J` journal.
- **D6 — Map contents are deliberately sparse: discovered campfires + other
  players + self, over the real terrain.** Undiscovered campfires are **not
  drawn at all** (not dimmed, not greyed — absent). **No mobs** and **no quest
  markers.** *Why (mobs):* the client only knows AOI mobs, so map-wide mobs would
  mean putting ~485 spawns into the roster stream. *Why (quest markers):* GDD §7
  is "no quest log, no markers"; the `J` journal already softened that once and
  this is not the session to soften it again.
- **D7 — All players in the zone, low rate.** A new server roster carrying every
  online character's position at ~1 Hz, drawn on both map states. *Why:* the ask
  is "the world feels populated"; with a handful of players over 144 × 72 the
  bandwidth is negligible, and any narrower rule (proximity, acquaintance) is
  invisible to the player, so the map just looks arbitrarily incomplete.

## 4. The shape

### 4.1 The map module

`features/mini-map/` grows into the map feature (rename deferred to the chunk —
see §6 C1). One PixiJS application, one marker registry, two **states**:

| | docked (today's minimap) | full-screen |
|---|---|---|
| size | HUD corner box | viewport-filling overlay |
| scale | `width / mapWidth` (unchanged) | `min(w/mapW, h/mapH)`, letterboxed |
| terrain | none (as today) | yes — the bundled zone terrain, scaled |
| markers | self, players, discovered fires | same, larger, labelled |
| input | none | pan/zoom deferred; click = flight (part 2) |

The toggle is a **state on the module**, not a second module: markers are
registered once and both states read the same registry. That is the D5
requirement made structural — if a marker can exist in one state and not the
other, D5 has been lost.

### 4.2 Terrain on the full-screen state

Drawn from `getZoneData(zoneName).terrain` — the same 537 pieces the world
renderer places, at map scale. ⚑ **Render once into a texture, not per frame.**
537 sprites re-rasterized every frame in a second GL context is precisely the
mobile perf ceiling the project already has (`project_mobile_layout`: the
minimap is *already* a second per-frame GL context). Bake on zone load, redraw
only on resize.

⚑ **No fog of war.** The whole terrain is visible from the first open; only
*campfires* are gated by discovery (D6). This was accepted explicitly — if the
PO later wants unexplored terrain hidden, that is a new decision, not an
oversight.

> **SUPERSEDED 2026-08-04, in C1 itself.** The PO took exactly that new
> decision: terrain **is** fogged, session-only, revealed by the real 20 × 12
> AOI as you walk (`MapFog.ts`). The paragraph above is kept as the record of
> what was decided at design time and what it took to reverse it. Persistence
> of the reveal is still open and can ride part 2's migration.

### 4.3 The player roster (the one wire addition)

A new low-rate server message: `PlayerRoster { tick, entries: [{ id, x, y, name? }] }`,
sent ~1×/s to every connected player, listing every **live player character in
the zone**. Not part of `GameState` — it has a different rate and a different
scope, and folding it in would inflate the 30 Hz snapshot for a 1 Hz fact.

⚑ **The flyer-invisibility rule from part 2 applies to this stream too.** When
flight ships, a flying player must be filtered out of the roster exactly as they
are filtered out of `GameState` — otherwise the map leaks precisely what the
"invisible to players below" rule is meant to hide. Part 2 owns the filter; this
doc owns the reminder, and the roster is designed with **one** assembly point so
there is one place to apply it.

⚑ **Name is optional and probably out.** Sending every player's name every second
is a small privacy/harassment surface and the dots are the ask. Recommendation:
**dots only in v1**, no names, no levels. [PLACEHOLDER — PO may want names.]

### 4.4 Campfire markers

From bundled zone data (positions) filtered by the **discovered set** (which
character has dwelled where). Part 2 owns persisting that set — but the map is
the first consumer, so **this plan needs the set to exist**:

- If part 1 ships first, the docked/full-screen map shows fires the character
  has bound **this session**. ⚑ The dwell tracker holds only the *current*
  anchor (`s.anchors`, one fire per connection) — C2 adds a small in-memory
  session **set**, accumulated at the same dwell trigger, no persistence.
- Part 2 promotes that to persisted state (new migration, `plan-flight-paths.md`
  §5). Nothing in the map UI changes when it does — the set just survives logout.

That ordering is deliberate: it keeps part 1 free of any schema change.

## 5. Landmines

1. **The minimap is a second GL context, per frame, and mobile is already at its
   ceiling.** (`CLAUDE.md` standing gotchas; `project_mobile_layout`.) A
   full-screen map that re-rasterizes terrain every frame will be the thing that
   pushes it over. Bake to a texture (§4.2), and measure on the phone before
   declaring the chunk done.
2. **`pointerdown`, never `click`.** `MouseManager` registers `mousedown` on
   `document.documentElement` with `preventDefault()`, which suppresses the
   synthetic click. A map button wired to `click` silently never fires. This is
   in `CLAUDE.md` for a reason — it has bitten before.
3. **The mobile ☰ sheet has an open bug.** `#registrationNag` covers the open
   sheet (journal unreachable on phones, `mobile-layout.mjs` leg 7 legitimately
   red, **needs a PO call**). A map button placed in that sheet inherits the bug.
   Either place it outside the sheet or fix the nag first — do not ship a map
   button that is unreachable on phones and call it done.
4. **The AOI is 20 × 12 m and the zoom cap exists because of it.**
   `camera/logic/Zoom.ts: MAX_VISIBLE_WIDTH = 18 m` with a comment saying exactly
   why. Nothing in this plan touches it; part 2 does. Do not "clean it up".
5. **`LevelOfDynamic.REMOVABLE_REMEMBERED` exists and is subtle.** The minimap
   deliberately *keeps* some icons after they leave the AOI and drops them only
   when they re-enter the viewport. Roster-driven player markers must not be
   pushed through that lifecycle — they have their own source of truth and their
   own removal rule (absent from the roster = gone).
6. **Two sources for the same player.** A player inside the AOI arrives via
   `GameState` *and* via the roster. Pick one as authoritative for the marker
   (recommendation: AOI position when present, roster otherwise) or the dot will
   visibly stutter between a 30 Hz and a 1 Hz position.

## 6. Chunks

- **C1 — The map module, two states, no new data.** Rename/restructure
  `features/mini-map` into the map feature; add the full-screen state, the HUD
  button and the key binding; render bundled terrain baked to a texture. Markers
  stay exactly what they are today (AOI entities). *Ships a usable full-screen
  map on its own.*
- **C2 — Campfire markers.** Draw discovered fires on both states from bundled
  zone data × the ~~session~~ **persisted** dwell set. ⚑ The open question here
  ("a small wire addition, or derived client-side?") was settled by the PO
  taking a **third** option neither branch anticipated: persist the set per
  character, which pulls part 2's C1 into this chunk. See §10's C2 ledger.
- **C3 — The player roster.** New server message + assembly point + client
  markers on both states. ~~The one chunk with a protocol change~~ — **no longer
  true:** C2's persistence ruling put two fields on `GameState` and regenerated
  the bindings, so C3 is the *second* wire change, not the first. C3's is still
  the larger one (a new message, not two appended fields).

Suggested order **C1 → C2 → C3**. C1 is the risky one (perf, mobile); C3 is the
one that touches the wire. C2 between them is small and is what part 2 needs.

## 7. Test strategy

- **Vitest** for the pure logic: map-scale math (world → map coordinates in both
  states, letterboxing), marker registry state transitions, roster
  reconciliation (AOI vs roster precedence, §5 landmine 6).
- **Go** for the roster assembly: one live player, several, a dead player
  (excluded), a spectator (excluded), and — once part 2 exists — a flying player
  (excluded, and pinned by a test in **both** directions).
- **`verify` skill** (headless Playwright): open the map, see terrain, see own
  marker, toggle back; a second joined client appears as a dot.
- **Mobile**: real-device check per `project_mobile_layout` — headless perf
  transfers only as ratios, so a phone pass is required before C1 is called done.

## 8. Schema impact

**None in this plan.** No persisted state is touched: the map reads bundled
content and live positions, and the session dwell set already exists in memory.
The discovered-campfire *persistence* is part 2's migration
(`plan-flight-paths.md` §5), deliberately kept out of here so this plan can ship
without a database change.

> **SUPERSEDED 2026-08-04, in C2.** The PO ruled that discovered campfires must
> persist **per character**, which is exactly what part 2's C1 was for — so C2
> absorbed it and this plan ships **migration `000002_character_campfires`**
> after all. The paragraph above is kept as the record of the design-time
> intent, the same way §4.2's "no fog of war" was kept when C1 reversed it.
>
> ⚑ Note what the reversal did **not** cost: nothing was thrown away. The
> session-set design in §4.4 was never built, because the question was asked
> before the code was written.

## 9. Open / [PLACEHOLDER]

- Key binding for the map toggle (`M` is the obvious candidate; verified free
  2026-08-04 — `Controls.ts` binds only WASD/arrows, P, 1–3, Q/R/F, E, J).
- Player names on the map — recommended **off** (§4.3).
- Pan/zoom inside the full-screen state — **out of v1** unless the world grows
  past what fits legibly; at 144 × 72 it fits.
- Whether the docked minimap keeps its current size/position or gets a pass —
  not asked, not assumed.

## 10. Chunk ledger

### C1 — The map module, two states — DONE (2026-08-04), PO-VERIFIED IN-GAME 2026-08-04, committed `f09d99d0`

Ships the docked ⇄ full-screen toggle, the bundled-terrain bake, and — added
mid-chunk by PO ruling — session fog of war and click-away dismissal.

**PO rulings (2026-08-04), all taken in-session:**

- **Map button lives OUTSIDE the ☰ sheet.** ⚑ Sharper than it looked: on mobile
  `#minimap` is *itself* inside the sheet (`opacity: 0; pointer-events: none`
  until `menuOpen`), so minimap-tap cannot be the phone's entry point and the
  button is the only one. It is a permanent 4.4 rem square under the ☰ — which
  **widens the permanent mobile HUD** that the 2026-08-02 ruling capped at "the
  bars, the tiles, the combat indicator and the alert banner. Nothing else."
  Flagged in `HUD.mobile.less`, not slipped in.
- **Tapping the docked minimap opens the full-screen state** (third entry point,
  `pointerdown`).
- **The docked minimap gets no visual pass** — C1 only adds the second state.
- **`M`** is the toggle key (verified free against `Controls.ts`); Esc closes on
  the existing journal path.
- **Fog of war — REVERSES §4.2.** That section recorded "no fog of war… if the
  PO later wants unexplored terrain hidden, that is a new decision, not an
  oversight." This is that decision, taken because props are only ever seen
  inside the streamed AOI and a map showing the whole world read as
  inconsistent. **Session-only** (no schema change, so §8 holds) and the reveal
  is **exactly the AOI**, both PO-chosen.
- **The overlay stays translucent.** It was briefly opaque; that was the wrong
  half of the fix. Panels visible *through* the map is fine — panels stacked
  *on top of* it was the bug, and that is z-index, not opacity. ⚑ One layer
  covers the world and the panels together, so no opacity value can hide the
  panels while showing the world.
- **Press ON the map does not dismiss** — reserved for part 2's destination
  selection, so the gesture never has to be un-learned.

**Findings that outlive this chunk:**

1. ⚑ **`Welcome.mapWidth` is px space, not world units** — `Bounds.Width *
   Points2px` (`core/game.go`), so the 144 × 72 zone arrives as 17280 × 8640,
   the same space `getX()/getY()` use. The scale math is a pure ratio and was
   always right; the doc comment claiming "world units" was not. The trap is
   "helpfully" converting one side.
2. ⚑ **The world is origin-centred**, so both states put the layer origin at the
   canvas centre and **letterboxing needs no offset term at all** — just the
   smaller of the two axis fits.
3. ⚑ **Backlog §53, filed from this chunk — and its first version was WRONG.**
   The full-screen map shows a cluster of prop icons at the world origin that
   the character never visited. Cause: `core/game.go:467` creates the pre-join
   spectator at `VEC2F_ZERO`, so the client is streamed the ~24 props around
   the origin and builds `STATIC` icons for them — and `STATIC` is documented
   as *"never removed"*. Positions are **correct**; it is a fog-consistency
   problem, visible only now because C1 draws at 7× the docked scale and added
   fog. ⚑ It was first filed as *"icons use player-relative coordinates"* on
   the strength of small values at `add()` time (−466, −96, 1360) while the
   player was at −6982 — an inference never checked against "do real props sit
   near the origin?" (24 do). Two measurements settled it: the values never
   change over 3 s, and the objects are detached from the scene graph. The
   lesson is the general one: **a small coordinate is not evidence of a
   relative coordinate.**
4. ⚑ **A mask Sprite is not drawn normally** — `AlphaMask` sets
   `renderable = false` for a Sprite mask, but it must still be IN the scene
   graph to have a world transform. A detached mask silently masks nothing.

**Content:** no JSON, no ids, no pins. New files `MapScale.ts` (+ its test),
`MapTerrain.ts`, `MapFog.ts`; `#worldMap` + `#mapButton` markup; `MiniMap.setup`
gains `zoneName`.

**Schema impact: NONE.** Bundled zone content and live positions only; the fog
lives in one object and is deliberately not persisted.

**Verified:** `tsc --noEmit` clean · vitest **190/190** (26 in the map suite,
covering letterbox fits, the zero/NaN degenerates, terrain↔marker scale
alignment and the click-away hit test) · production webpack build clean ·
`c1-world-map.mjs` (new, this chunk's harness) **12/12, 0 console errors** ·
`ctxloss-warning clean` 0 warnings · boot `87 skills/15 factions/65 mobs/10
recipes/5 props/3 milestone unlocks/4 quests`, zone world 144×72 777 props/485
spawns/5 campfires, 0 panics.

**Harness gate:** `filler-batch` (owns minimap lifecycle) ends **1 check failed**
— proven pre-existing by `git stash` + rebuild + re-run against HEAD, which
fails identically; its message contradicts itself (*"DAMAGE 100 did NOT empty
the pool, got Focus 0/100"*). ⚑ Its death/respawn player-dot leg failed once and
passed on re-run **and** at HEAD — a flake in the pixel-blob probe, recorded
here so the next run does not read it as new. `mobile-layout` legs 1–6 and 8
green; **leg 7 red is the known `#registrationNag` bug** already carried in
CLAUDE.md, untouched by this chunk.

**Still open for C1:** the **mobile real-device pass** §7 requires (headless
perf transfers only as ratios) and the `features/map/` rename, deliberately not
taken so the diff stayed reviewable.

### C2 — Campfire markers + discovery persistence — DONE (2026-08-04), PO-VERIFIED IN-GAME 2026-08-04, committed `[uncommitted]`

Ships discovered-campfire markers on both map states, the per-character
persistence behind them, and backlog **§53**. ⚑ **It absorbs
`plan-flight-paths.md` C1 entirely** — that chunk was "discovery + persistence +
the set on the wire", which is precisely what the PO's ruling required here.

**PO rulings (2026-08-04), all taken in-session:**

- **Discovered fires PERSIST per character — reverses §8.** Asked as an outcome
  question ("remember across logins, or this session only?") with a
  session-only recommendation; the PO overrode it, citing the flight plan.
  ⚑ **The question was asked before any code existed**, so the reversal cost
  nothing: the session-set design in §4.4 was never built.
- **Storage is a real table**, not `character_flags` JSONB — the option
  `plan-flight-paths.md` §5 recommended and left as "decide at C1".
  `game.character_spellbook` is the precedent: a per-character set with a
  composite primary key and a real foreign key.
- **The bound fire is highlighted** among the discovered ones (an orange ring,
  the same `0xE37313` the "Bound to campfire" floating text uses, so the two
  readings of one fact look like one fact).
- **Marker sizes 9 px docked / 26 px full-screen [PLACEHOLDER]** — kept after
  the PO looked at the fixed build.
- **No new mobile item.** C1's real-device pass stays as filed and the desktop
  check covers marker legibility. (The PO's call; the risk it accepts is a 9 px
  marker on a phone.)

**⚑ The bug that shipped to the PO and came back — markers behind props.**
The marker layer was placed *under* both icon layers, reasoned from "the player
dot must stay readable over a fire it is standing in". But the ~777 **prop**
icons live in that same layer, so a fire's visibility depended on how wooded its
surroundings were: the PO's report was one fire clear, one half-covered, one
completely gone. Fixed by putting the layer **between** the two — above the
scenery, below the people.

Two things outlive it:

1. ⚑ **Every leg I had still passed with the markers invisible.** Count,
   position, scale, persistence, the cold-login leg — all green, all blind. The
   harness gained **leg 2d**, which asserts `props < campfires < characters` as
   stage indices. A test suite that cannot fail when the feature is invisible is
   not testing the feature.
2. ⚑ **The layer is inserted by INDEX, not appended.** Appending is right on the
   first `setup()` and wrong on every re-setup, where it lands above the
   character layer and starts hiding the player dot — a variant only a second
   join in one page life would ever show.

**Findings that outlive this chunk:**

1. ⚑ **`Welcome` cannot carry per-character data.** It is sent on WebSocket
   *connect*, before Join, from a single pre-built `g.welcomeMsg` shared by
   every client (`core/game.go:250`). The owner-only `GameState` table is where
   per-character facts belong; `Character` is broadcast to everyone.
2. ⚑ **A one-shot set during a system's Update reaches that same tick's wire.**
   ecs sorts systems by priority: StatusEffects **101** (clears the per-tick
   fields) → ConnectionState **10** (join, dwell bind) → Physics **0** → Net
   **−100** (encodes and sends). So `publishCampfireState` at join is encoded
   before anything clears it. This is why the join publication needs no second
   delivery path — and it was traced, not assumed.
3. ⚑ **A pixi `Graphics` has a truthy `.texture`** (a white 1 × 1), so
   `!!child.texture` cannot tell one from a Sprite. `.context` can. This cost
   the new harness a red run that read as a product defect.
4. ⚑ **`harnessdb -cleanup` owns every character-scoped table**, and the tool's
   own comment predicted this: the first cleanup after the migration failed on
   `character_campfires_character_id_fkey`. The schema carries no
   `ON DELETE CASCADE` anywhere, deliberately, so each new child table is that
   tool's problem on the day it ships.
5. ⚑ **§53's filed fix was insufficient as written.** "Clear the minimap when
   the character enters the world" would have been a one-way loss: icons are
   created only on an entity's *first* sighting (`EntityManager.addOrUpdate`),
   so anything still in `this.objects` would never get a second one. The fix
   clears **and rebuilds** from what is actually in view (`reseedMinimap`).
6. ⚑ **The discovered set is CONNECTION state, with four seams, and a missing
   one fails silently.** It is keyed like `s.anchors` and every one of that
   map's touch points has a twin: seeded from the play ticket at join, carried
   through the reconnect stash, re-added after death's removal fan-out, dropped
   on disconnect. Miss the stash leg and an F5 loses the session's discoveries —
   invisibly, because the next save writes the shrunken set back over the good
   one.
7. ⚑ **The save INSERTS, it does not replace.** Discovery is monotonic, so
   `ON CONFLICT DO NOTHING` is both correct and what preserves `discovered_at`
   — the only collection here that breaks the snapshot-over-deltas house style,
   and the store test pins the asymmetry so nobody "fixes" it back.

**Content:** no JSON, no ids, no pins. New files `MapCampfires.ts`,
`store/migrations/000002_character_campfires.{up,down}.sql`,
`sys/campfire_discovery_test.go`, `.claude/skills/verify/c2-campfire-markers.mjs`.
`MapScale.ts` gains `campfireMarkers()`; `server.fbs` gains `home_campfire` +
`discovered_campfires` on `GameState` (appended at the table end); `window.game`
gains a `miniMap` handle for the harness — markers are pixi children with no DOM
of their own, and C1 could only screenshot them.

**Schema impact: YES — migration `000002_character_campfires`.**
`(character_id, campfire_id, discovered_at)`, PK `(character_id, campfire_id)`,
FK to `game.characters`, no `ON DELETE CASCADE` (house rule). `campfire_id` is
the authored `spawnpoint-N` string and is **not** an FK to anything: campfires
are content in `api/zones/`, not rows. An id that no longer resolves is skipped
silently at both ends, the rule `home_campfire_id` already follows.

**Verified:** `go build` + full Go suite green · `make -C backend db-test` green
vs real Postgres (the round-trip now carries the set, plus a leg proving a
shorter save cannot un-discover) · `tsc --noEmit` clean · vitest **199/199**
(+9, covering D6 selection, the unplaceable id, scale-0, and marker↔terrain
scale agreement) · production webpack build clean · **`c2-campfire-markers.mjs`
17/17, 0 console errors** · `c1-world-map` **12/12** unregressed ·
`hygiene-wire-prune` clean (642 sprites decoded, 0 ctx losses, 0 console errors)
— the `.fbs` gate · `campfire-bind-persistence` **6/6** · `chunk4-persistence`
**16/16** · boot `87 skills/15 factions/65 mobs/10 recipes/5 props/3 milestone
unlocks/4 quests`, zone world 144×72 777 props/485 spawns/5 campfires, migration
`version=2 dirty=false`, **0 panics, 0 errors, 0 warnings**.

**Harness gate:** `filler-batch` (owns minimap lifecycle) ends **1 check
failed** — the same pre-existing self-contradicting check C1 recorded (*"DAMAGE
100 did NOT empty the pool, got Focus 0/100"*), identical wording, and its
minimap-on-death legs are green across two runs including after the stage-order
change.

**Runbook note:** the dev database was dumped to `/tmp/aura-dev-backup.sql`
before the migration applied, with `aurad` stopped first so it flushed
(`docs/manual-db-migrations.md` §4).

**Still open for C2:** nothing. C1's tail (the mobile real-device pass, the
`features/map/` rename) is unchanged and still C1's.

#### Deploying C2 to live — rulings + the one-way finding (2026-08-04)

**⚑ MEASURED: the deploy is ONE-WAY.** An `aurad` embedding only `000001`,
booted against a version-2 database, does **not** start —
`applying migrations: no migration found for version 2: read down for version 2
migrations: file does not exist`. A hard failure, and with `Restart=always` it
is a restart loop with the game down. **This is the first deploy where that can
bite**: `000001` was the initial schema, so there has never been a previous
version to fall back to. Recovery is redeploy-forward, or hand-editing
`public.schema_migrations`. Verified against a throwaway database by removing
the `000002` files and re-running `store.Migrate`; it is a property of every
future migration, not of this one.

Consequence for sequencing: **ship C2 alone, not batched with C3.** With no
rollback, the cheapest repair is a forward fix, and a forward fix is cheapest
when the change set is small.

**PO rulings (2026-08-04):**

- **No backfill.** Existing characters start with an empty discovered set and
  re-discover by resting — 1.7 s per fire, and the normal loop anyway. ⚑ The
  accepted, visible cost: on the first login after the update **every existing
  character opens a map with no fires on it, including the fire they are bound
  to**. (The rejected alternative was one `INSERT..SELECT` seeding a row per
  non-NULL `home_campfire_id`, which would have been *provably* correct rather
  than a guess — that column is only ever written by a completed dwell.)
- **A one-off `pg_dump` before the restart, kept off-box.** Does not close
  `plan-playtest-deploy.md`'s `[ ] Daily backup + a restore actually exercised
  once`; that stays the open ops chunk it already was.

**Why the migration itself is the cheap part:** additive `CREATE TABLE`, no
existing row read or rewritten, no column added to `characters`; the FK takes a
brief lock on a table with a handful of rows. **And client/server skew is safe
in both directions** — the two fields were appended at the table end, so an old
cached client ignores them and a new client against an old server reads them
absent and degrades to "nothing discovered". No renumbering, hence no garbage
decode (`hygiene-wire-prune` is that gate, and is clean).

⚑ `devops/deploy.sh`'s `restart()` is a single `systemctl restart`, so the dump
has to bracket it rather than sit inside it: **stop** `aurad` first and wait for
`💾 flushed N live character(s) for shutdown`, or the dump misses the last
minutes of play.
