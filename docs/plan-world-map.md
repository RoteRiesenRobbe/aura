# Plan: The world map & minimap rework (fast travel, part 1)

**Status:** DESIGNED 2026-08-04, not started. Planning session only — no code written.

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
  zone data × the session dwell set. Needs a small wire addition (which fire ids
  this character has bound) or is derived client-side from the existing
  `campfire_bound` signal — decide at implementation; prefer the server telling
  the client the set, since part 2 persists it anyway.
- **C3 — The player roster.** New server message + assembly point + client
  markers on both states. The one chunk with a protocol change (`server.fbs`,
  bindings regenerated both sides).

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

## 9. Open / [PLACEHOLDER]

- Key binding for the map toggle (`M` is the obvious candidate; verified free
  2026-08-04 — `Controls.ts` binds only WASD/arrows, P, 1–3, Q/R/F, E, J).
- Player names on the map — recommended **off** (§4.3).
- Pan/zoom inside the full-screen state — **out of v1** unless the world grows
  past what fits legibly; at 144 × 72 it fits.
- Whether the docked minimap keeps its current size/position or gets a pass —
  not asked, not assumed.

## 10. Chunk ledger

*(empty — nothing built yet)*
