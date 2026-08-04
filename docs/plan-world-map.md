# Plan: The world map & minimap rework (fast travel, part 1)

**Status:** IN PROGRESS — **C1 shipped** 2026-08-04 (`f09d99d0`), **C2 shipped
and live** 2026-08-04 (`6c0888ff`), **C3 shipped** 2026-08-04 (`106585c4`),
all three PO-verified in-game. Every chunk is built; what keeps this doc out of
`archive/` is **C1's tail** — the mobile real-device pass §7 requires, and the
`features/map/` rename. Designed 2026-08-04. Per-chunk ledger: §10.

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

> **WRONG, corrected 2026-08-04 in C3.** Other characters have **never** been
> drawn on the minimap at all: `Character` sets `visibleOnMinimap = false` in its
> constructor (`Character.ts:78`) and only the local `Player` flips it true
> (`Player.ts:28`). `EntityManager` gates on that flag at all three of its call
> sites. The survey read the *capability* (an icon factory and a manager that
> honours the flag) as the *behaviour*.
>
> ⚑ **This is what dissolves landmine 6.** With no AOI-driven dot for other
> players, the roster is the **only** source, not a second one, and the whole
> arbitration the landmine asked for reduces to "skip your own id". The
> conclusion the paragraph draws — "it is a new server stream" — was right
> anyway, and for a stronger reason than the one given.

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

> **RULED 2026-08-04 in C3: dots only, confirming the recommendation** — with
> the rider that a *hover* readout may come later and must not be blocked. The
> shipped message is `PlayerRoster { tick, entries: [{ id, pos }] }`: no name
> field, but `RosterEntry` is a **table** (a struct could never gain one) and
> carries the id a hover would need to resolve. §10's C3 ledger has the detail.

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

   > **DISSOLVED 2026-08-04 in C3, on a corrected survey — see §2.** Other
   > players are not drawn from the AOI and never have been, so there is no
   > second source to arbitrate against. What survives of the landmine is the
   > *self* case: your own dot comes from the AOI at 30 Hz **and** would come
   > from the roster at 1 Hz, so the client drops its own id from the roster.
   > `MapScale.rosterMarkers` does exactly that, and the harness's leg 1b is the
   > negative control for it.

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
  the larger one (a new message, not two appended fields). ⚑ **Built
  2026-08-04** — and smaller than billed, because the roster turned out to be
  the *only* source for other players rather than a second one (§2's correction).
  Ledger: §10 C3.

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

### C2 — Campfire markers + discovery persistence — DONE (2026-08-04), PO-VERIFIED IN-GAME 2026-08-04, committed `6c0888ff`

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

#### Deployed to live 2026-08-04 ✅

`6c0888ff` is live at `https://aura-game.duckdns.org/`. Sequence run as designed:
`systemctl stop aurad` → `💾 flushed 0 live character(s)` (nobody online) →
`pg_dump` pulled **off-box** to `~/aura-live-pre-000002.sql` → `devops/deploy.sh`
→ boot log `🗄️ database schema ready version=2 dirty=false`, 0 panics, 0
ERROR/WARN. Live went **1 → 2**. After: `character_campfires` present and empty
(no backfill, per the ruling below), **14 characters and 65 spellbook rows
unchanged**. The served bundle hash was compared against the local build and
matches — an rsync deploy can otherwise serve a stale frontend silently.

⚑ **The dump was RESTORE-TESTED, not just taken** — restored into a throwaway
database and counted: 18 character rows, 12 accounts, 65 spellbook rows, schema
version 1. A dump nobody has restored is not a backup, and this deploy is
one-way.

⚑ **And the restore test found a real constraint:** live is **PostgreSQL 18.4**,
the dev box's container is **16.14**, and an 18-dump does not restore onto 16 —
it dies on `unrecognized configuration parameter "transaction_timeout"` (a
PG 17+ setting). Deleting that one `SET` line makes it restore cleanly, but the
general point stands for the backup chunk: **an off-box backup is only as good
as the version you can restore it onto.** Recorded in
`plan-playtest-deploy.md`'s backup checklist item.

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

### C3 — The player roster — DONE (2026-08-04), PO-VERIFIED IN-GAME 2026-08-04, committed `106585c4`

Ships the `PlayerRoster` message, its single assembly point, and other players'
dots on both map states. **The map is now feature-complete for part 1**: D6's
three contents (self, discovered fires, other players) are all drawn.

**PO rulings (2026-08-04), both taken before any code existed:**

- **Dots only, no names — confirms §4.3's recommendation.** ⚑ With a rider:
  *"at a later point we might want information when hovering a player. Don't
  build it yet, but don't block it either."* Two things were shaped by that and
  neither costs anything today: `RosterEntry` is a **table, not a struct** (a
  struct's layout is frozen at birth, so `name` could never be appended), and
  it **carries the entity id** even though nothing drawn needs one. The client
  keeps the decoded entries rather than reducing them to coordinates, so a
  hover readout is a client change, not a wire change.
- **Same shape and size as your own dot, a different colour** — the option
  chosen over "different colour AND smaller". Colour is white at 0.9 alpha
  **[PLACEHOLDER]**: it has to separate from your own dark blue and from the
  campfire ring's orange, on green terrain and on the dark HUD box alike.
  ⚑ **The size half was implemented, measured, and then deliberately deviated
  from — see finding 7.** The dots are now `7 / 20 px` per state
  **[PLACEHOLDER]**, not the own dot's `4 / 29`. **This needs the PO's eye.**

**⚑ The survey was wrong, and it made the chunk smaller — see §2 and landmine 6.**
Other players have never been on the minimap: `Character` sets
`visibleOnMinimap = false` and only the local `Player` flips it true. So the
roster is the **only** source rather than a second one, and landmine 6's
"pick one as authoritative or the dot stutters" collapses to "skip your own id".
The lesson generalises: **the survey read a capability as a behaviour** — an
icon factory plus a manager that honours a flag is not the same as the flag
being set.

**Findings that outlive this chunk:**

1. ⚑ **One assembly, one marshal, the same bytes to everyone — and it is a
   design requirement, not an optimisation.** `plan-flight-paths.md` C4 warns
   that the roster is a *second* leak path for the fact `playerSendState`'s
   flyer filter hides, "and they are in different files". A per-viewer assembly
   would add a third. The Go test asserts the two clients received *the same
   backing array*, not merely equal bytes: an equality assertion would pass for
   a per-viewer build and lose the property.
2. ⚑ **`NetSystem.players` is exactly "joined and alive"**, so the roster
   filters nothing. §7 asked for dead- and spectator-exclusion tests; filtering
   again in `RosterFor` would be a *second opinion* on who is in the world,
   with its own way of being wrong. `sys/playercount_test.go` already pins both
   exclusions over the same membership rule, and the roster inherits them.
3. ⚑ **The 1 Hz dots STEP while your own dot GLIDES**, and that is written down
   rather than fixed (YAGNI). It is the most likely thing to come back from the
   PO as a bug report, so it is named in `rosterIntervalTicks`' comment and in
   `MapPlayers`' header — an accepted cost, not an oversight.
4. ⚑ **A `model.PlayerEntity` is ~40 methods, and embedding the interface is
   how to fake it.** `struct { model.PlayerEntity; ... }` overriding only
   `Basic()`, `Position()` and `Client()` panics loudly on anything else the
   code under test reaches for — strictly better than a hand-written stub that
   returns plausible zero values.
5. ⚑ **A harness must assert against where the other player IS, not where WARP
   was told to put them.** Leg 5 failed at 3.1 px until it read B's real
   position off B's own client: a warp lands a fraction of a unit off its
   target (measured: −29.95, −19.68 for a `WARP -30 -20`), because the body is
   pushed out of whatever it materialised inside. The warp target is the
   harness's *intent*; the client's position is the *fact* the map claims.
6. ⚑ **`clear()` drops the dots although they are not entities.** C2
   established that terrain, fog and campfire markers survive a clear; the
   roster does not, and the reason is death — a dead client leaves the players
   slice and stops receiving publications, so without this the last roster
   before dying would sit frozen behind the death overlay.
7. ⚑ **"Same size as your own dot" was implemented literally, and it erased the
   campfires — C2's bug with the operands swapped.** The own dot is sized
   `character.size × sizeFactor × iconSizeFactor`, and `iconSizeFactor` rides
   the map scale: **4.2 px docked, 29.2 px full-screen**. The campfire markers
   are per-state constants, **9 / 26**. So full-screen a dot is *wider than a
   fire* and the roster layer draws above it — a player standing at a fire left
   only the fire's orange home ring. Binding a campfire is what standing still
   at one is FOR, so that is not a corner case. **All 13 legs passed while it
   happened**, exactly as C2's did: leg 3 proves the dot draws *above* the
   marker and says nothing about the marker surviving. The new **leg 6b**
   asserts `dot ≤ fire` on the same canvas, and the dots became per-state
   constants **7 / 20** — under the fires so a person cannot swallow a
   landmark, above them so a landmark cannot swallow a person.
   ⚑ **The docstring was the tell**: it claimed one number sizing both was "the
   PO's ruling made structural". It was structural about the wrong invariant —
   the ruling was that another player is not a *different kind of thing*, not
   that a dot must be 29 px wide. **Flagged for the PO**, since it does touch
   the letter of what they chose.
   ⚑ **Overtaken the same day by the ruling in finding 8** — which inverts the
   order and makes the collision impossible from the other side. The sizes were
   kept anyway: they are what the PO looked at, and a marker that is 29 px in
   one state and 4 px in the other is a marker whose legibility depends on
   which state you are in.
8. ⚑ **PO RULING, 2026-08-04: the map's draw order is `terrain → props →
   other players → you → campfires`**, and the same in the world — *"the
   campfire is still the most important information the map can provide"*.
   Two reversals ride on it, both taken knowingly:
   - **On the map it inverts C2's "above the scenery, below the people".** C2
     put fires under both icon layers so a person could not be swallowed by a
     landmark; the ruling takes the opposite trade, because a dot moves and a
     fire is what the map is *for*. C2's own half survives untouched: fires
     stay above the ~777 prop icons, which is the bug C2 was fixing. Its
     harness leg 2d was relaxed to exactly that half, with the upper bound
     moved to C3's leg 3.
   - **The world is NOT part of it, and the two are not tied together.** The
     first cut changed both — the original ask said "in the world and minimap" —
     which reversed `6afbee84`'s campfire half (2026-07-21, from a PO report:
     every mob layer moved under `characters` so *"the fire sprite can no longer
     hide the avatar"*). The PO bounced it back **from a screenshot** within
     minutes: *"the order I gave only applies to the minimap; in the world,
     players should render on top of campfires."* `Game.ts` is byte-identical to
     HEAD again; only its comment changed, to say why the two orders differ.
     ⚑ The principle worth keeping: **a map marker is a claim about where
     something is; a world sprite is the thing itself.** The map ranks by
     information value, the world by physical sense — and "make them consistent"
     is a cleanup that would break one of them, so `c3-player-roster` leg 6c
     asserts **both** orders in one place, and says they are deliberately
     opposite.
   ⚑ **And it has a consequence nobody asked for, found by a harness that
   failed for the right reason**: you respawn at your bound fire, so your own
   dot lands exactly under that fire's marker — measured, icon at layer
   position `(-82, 33)` against the marker's `(-81.7, 33.7)` — and **is
   invisible until you walk off it**. `filler-batch`'s respawn leg is a pixel
   probe and went red on precisely this. Its subject is icon *lifecycle* (no
   leak, no duplicate), so it now counts CHARACTER-layer children instead of
   blue pixels, keeping the pixel probe as the "more than one dot visible"
   guard. ⚑ Proven a genuine consequence and not a regression by the house
   method: `git stash -u` + rebuild + re-run at HEAD, where the same leg is
   green. **Worth the PO's eye in-game** — "where am I" right after dying is a
   moment you look at the map.
9. ⚑ **A harness on the dev server is NOT alone on it.** Three legs asserted
   `dots === 1` and went red while the feature was perfectly correct: the PO was
   hand-testing on the same server, so their character was a third dot. `GET
   /players` and the boot log named them (`'Bamm-Bamm Bull' joined`), which is
   what separated "bystander" from "leaked ghost" in one command. Every position
   leg now asks **"is B's dot here / not here"** through one `nearestDot`
   helper, never "how many dots are there" — and the passing run reports
   `2 dot(s)` with the extra one ignored, which is a better proof of the feature
   than the count ever was.

**Content:** no JSON, no ids, no pins. `BrowserConsole.ts` exposes
`window.game.layers` (the `miniMap` precedent — the world's draw order is now a
ruling, and only a stage-index assertion can pin it). New files `MapPlayers.ts`,
`messages/incoming/PlayerRosterMessage.ts`, `codec/roster.go`,
`core/roster_test.go`, `.claude/skills/verify/c3-player-roster.mjs`.
`server.fbs` gains `RosterEntry` + `PlayerRoster` and
**`ServerMessageBody.PlayerRoster = 7`** (the first addition to that pinned
union since the entity-model chunks); `MapScale.ts` gains `rosterMarkers()`;
`Graphics.ts` gains the `otherPlayer` minimap icon.

**Schema impact: NONE.** The roster is assembled from live positions every
tick-30 and persisted nowhere — nothing about who is online outlives the
session. (Contrast C2, which is the migration in this plan.)

**Client/server skew is safe in both directions.** An old cached client hits
`Backend.ts`'s `default:` branch and warns instead of throwing; a new client
against an old server simply never receives the message and draws no dots. The
union value is appended, so nothing renumbers — `hygiene-wire-prune` is that
gate and is clean.

**Verified:** `go build` + full Go suite green (incl. 4 new roster tests) ·
`make -C backend db-test` green vs real Postgres · `tsc --noEmit` clean ·
vitest **207/207** (+8, covering self-exclusion, the not-yet-known local
character, px-space placement, a dot landing on the same spot as the campfire
at the same world point, scale-0 and the non-finite entry) · production webpack
build clean · **`c3-player-roster.mjs` 15/15, 0 console errors** — with the PO
live on the same server, i.e. a real third player on the map (legs 6/6b/6c are
findings 7 and 8's) ·
`c1-world-map` **12/12** and `c2-campfire-markers` **17/17** unregressed (leg 2d
relaxed to its own half per finding 8) · `filler-batch` back to its **one**
recorded pre-existing failure (the self-contradicting *"DAMAGE 100 did NOT empty
the pool, got Focus 0/100"*) after finding 8's probe change · `hygiene-wire-prune` clean (631 sprites decoded, 0 ctx
losses, 0 console errors) — the `.fbs` gate · boot `87 skills/15 factions/65
mobs/10 recipes/5 props/3 milestone unlocks/4 quests`, migration `version=2
dirty=false`, **0 panics, 0 ERROR**.

**Harness note:** the first `c3-player-roster` run ended 11/13 — leg 5 on the
warp-target measurement above, and a **backlog §29 lost WebGL context** on
client A (with its usual companion, pixi's error reporter dying on
`gl.getShaderSource(shader).split()`). It did not recur on the re-run, and §29's
trigger is still unknown; the harness now **tags every console error with the
leg that was running**, so the next sighting says *when*. Four GL contexts in
one headless process (two pages × world + map) is a plausible aggravator and is
recorded as a suspicion, not a finding.

**Still open for C3:** PO in-game verification — **the dot's colour and size**
(both [PLACEHOLDER]) and **one consequence of finding 8's map order**: your own
dot is invisible while you stand at your bound fire, which is exactly where you
respawn. (The world-order consequence is gone: the world was reverted.) C1's
tail (the mobile real-device pass, the `features/map/` rename) is unchanged and
still C1's.
