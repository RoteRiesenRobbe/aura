# Plan — World & Zones (roadmap item 4, first slice)

**Status:** PLANNED (2026-07-08). No code yet. This is the execution plan +
decision record for the first world/level-design pass — the work that unblocks
the item-12 content pass by giving us a **hand-authored world** instead of the
procedurally-assembled one.

> **This is step 1 of the decided systems-first execution order** (roadmap.md
> "Execution order (decided 2026-07-08)"). It ships the **editor + loader +
> boundary + a scaffold zone** that proves the pipeline; the **real designed
> zones are authored later, in the content pass (step 6 / roadmap item 12)** —
> not in this phase.

> Scope note: this is roadmap **item 4** (world & zones) plus the **placement +
> respawn half of item 7** (mob spawn points). It deliberately does **not** pull
> in item 5 (darkness), item 6 (aura line-of-sight), or item 7's patrol
> archetypes — see §1.2 for the exact line.

---

## 1. Goal & scope

### 1.1 In scope

Replace the procedural world with a **hand-authored single zone**, authored in an
**in-game editor**, loaded by the server as the source of truth:

1. **Rectangular world** with a real physical boundary (replaces the circular
   `InvCircle` world of `radius 20`).
2. **A zone file** (`zone.json`) — the server-authoritative description of the
   world: bounds, mob spawn points, and collidable props. Loaded at boot via the
   existing `-content <dir>` flag; replaces `gen.Generate`.
3. **Props** — hand-placed static objects (rocks, walls, trees-as-decoration,
   landmarks) with per-object occluder flags (`blocksMovement` now, `blocksAura`
   carried but inert). Reuse the existing static/resource-entity plumbing.
4. **Fixed mob spawn points** — mobs spawn at authored positions, respawn **at
   the same spot** after a timer + random variance. Replaces global-count +
   random/procreation spawning.
5. **Tile / terrain floor** — authored ground textures rendered as the world
   floor (extends the existing `ground-textures` feature).
6. **In-game editor** — extend the existing MysticWand placement tool to also
   place props + spawn points and export a full `zone.json`.
7. **The first authored zone** as the concrete deliverable.

### 1.2 Explicitly deferred (the scope line)

| Deferred | Belongs to | Why now-not |
|---|---|---|
| Aura line-of-sight occlusion (`blocksAura` runtime) | item 6 | Gated on a blob perf spike; we only carry the flag |
| Darkness / light rendering / `light_aura` | item 5 | Needs the effect-type work; decoupled by design |
| Mob patrol archetypes (local / route patrol) | item 7 | Mobs stay stationary-idle in this pass |
| Multiple zones + zone transitions | item 4 later | One zone now; single `phy.Space` |
| Zones as separate physics `Space`s (sharding) | item 4 later | Performance move; not needed at current scale |
| Zone-scoped chat | item 8 | Global chat stays until multiple zones exist |
| Live "save to server" editor endpoint | this doc, later | The export→commit→`-content` reload loop is enough |

### 1.3 Confirmed decisions (this planning session)

- **Resources are dead weight.** The procedural resource grid (trees/stone/ore)
  stops generating. The world is authored terrain + props + mob spawns. (The
  survival/gathering loop it fed was removed in Block 2.)
- **Rectangular**, not circular.
- **Full authoring pipeline now** (not a throwaway minimum), but content scoped
  to **one zone**, **single Space**.
- **In-game editor** (extend the existing MysticWand tool) — not Tiled, not
  hand-written JSON.
- **Occluders: data flags now, movement-blocking implemented, LoS/darkness
  deferred.**
- **Mobs: spawns + respawn only**, no patrols.
- **Tile-based terrain** floor.

**A–D (the code-surfaced forks), as confirmed:**

- **A — Zone file ownership:** one **server-owned `zone.json`** loaded at boot.
  Props stream to clients as **entities** (like resources do today); mob spawns
  drive the server spawn system. **Terrain textures stay a client-visual layer**
  (no new wire for the floor).
- **B — What a prop is:** **reuse the existing static/resource-entity plumbing**
  (body + sprite + AOI streaming), minus harvest/depletion, plus the two occluder
  flags. New entity type only if reuse fights us.
- **C — Editor persistence:** keep the existing **export → commit → reload** dev
  workflow. The MysticWand tool grows to place props + spawns and export a full
  `zone.json`; drop it into `api/` and restart with `-content ../api`. A live
  server-save endpoint is deferred.
- **D — Rectangular boundary physics:** add a new **`InvAABB`** shape (mirrors
  `InvCircle`) to keep entities inside a rectangle. This is the highest-risk
  piece — do it first (chunk 1).

---

## 2. Current-state anchors (what this touches)

Real symbols/files, so the plan isn't hand-wavy:

- **World population seam:** `cmd/berryhunterd/berryhunterd.go:113–146` —
  `gen.Generate(items, rnd, radius)` for resources, then `initialMobCount`
  random mobs via `newRandomMobEntity`, then `md.Generator.Fixed` mobs — all at
  **random positions** inside `radius`. **This is the block the zone loader
  replaces.**
- **World radius:** `core/game.go` — `GameConfig.Radius` (default `20`),
  `game.radius`, `Radius()` accessor; boundary at `game.go:96` —
  `phy.NewInvCircle(VEC2F_ZERO, gc.Radius)` on `LayerBorderCollision`. The
  MiniMap radius is `gc.Radius * codec.Points2px` (`game.go:80`).
- **`radius` is threaded widely:** `gen.Generate`, `gen.NewRandomPos`,
  `gen.NewRandomCoordinate`, `sys/mob.go` (`findMobSpawnPosition`,
  `findNearbySpawnPosition` via `game.Radius()`), `mob.NewMob(d, rndPos, radius,
  …)`, `berryhunterd.go`. Rectangular bounds must be threaded through or adapted
  at each.
- **Physics shapes:** `phy/inv_circle.go` (`NewInvCircle` — the model to mirror),
  `phy/box.go` — **`Box` collision resolution `panic("not implemented")`**; only
  `Circle` and `InvCircle` are fully resolved. **No `InvAABB` exists yet.**
- **Procedural resources:** `gen/generator.go` (`Generate`, `trees`,
  `resources`, `chunkSize`), `gen/resource_entity.go`
  (`NewRandomEntityFrom` — the static-entity constructor props will reuse).
- **Mob spawn/respawn:** `sys/mob.go` — `respawnMob` (random / procreation),
  `findMobSpawnPosition`; mob JSON `generator` block (`Weight`/`Fixed`/
  `RespawnBehavior`) in `items/mobs/definitions.go`. Config `InitialMobCount`
  (`cfg/gamecfg.go`, default 50).
- **Content loading:** `-content <dir>` flag + `fs.FS` loaders (effect
  foundations Step 0). The zone file loads through the same mechanism;
  `skills/milestone-unlocks.json` is the precedent for a code-adjacent JSON.
- **Frontend editor (existing):** `frontend/src/features/ground-textures/` —
  activated by equipping a **`MysticWand`** (`_GroundTexturesPanel.ts`,
  `isActive()`); click-to-place (`placeTexture(position)`);
  `GroundTextureManager` (place/remove, `getTexturesAsJSON()`); exports via
  **browser download** (`saveAs('ground-textures.json')`, `file-saver`); loads a
  **build-time bundled** `client-data/ground-textures.json`. Renders into the
  existing `game.layers.terrain.textures` PixiJS layer. Texture SVGs already ship
  **light + dark variants** (grass/sand/pebble/puddle/stonePatch/rubble/…).
- **MiniMap:** `frontend/src/features/mini-map/` uses the world radius for
  scaling — a rectangular world needs width/height instead.

---

## 3. Architecture & data model

### 3.1 The zone file (`zone.json`)

Server-authoritative. Loaded at boot through the `-content` mechanism. Draft
shape (all numbers **[PLACEHOLDER]**, units = game units / "Points", the server's
native coordinate space — **not** pixels):

```jsonc
{
  "name": "WhisperingWood",
  "bounds": { "width": 120, "height": 80 },   // rectangle centered on origin
  "props": [
    { "type": "Rock", "x": 12.0, "y": -5.0, "rotation": 0.0,
      "blocksMovement": true,  "blocksAura": true },
    { "type": "Fence", "x": 20.0, "y": 3.0, "rotation": 1.57,
      "blocksMovement": true,  "blocksAura": false },
    { "type": "Bush", "x": -8.0, "y": 10.0, "rotation": 0.0,
      "blocksMovement": false, "blocksAura": false }
  ],
  "spawns": [
    { "mob": "Dodo", "x": 30.0, "y": 12.0, "angle": 0.0,
      "respawnTicks": 900, "respawnVariancePct": 0.2 }
  ]
}
```

Notes:
- **`bounds`** replaces `radius`. Rectangle centered on origin (so existing
  origin-centered coordinate math and the camera keep working); `[-w/2, w/2] ×
  [-h/2, h/2]`.
- **Terrain textures are NOT in this file** (decision A) — they stay in the
  client-visual `ground-textures.json`. (Open sub-decision §7.1: whether to
  eventually fold them in and ship once over the wire.)
- **`respawnTicks` + `respawnVariancePct`** — respawn delay at the same spot;
  actual delay rolls uniformly in `ticks × [1−pct, 1+pct]`. Mirrors the variance
  convention from item 11 Phase 3 (percentage band, absent/0 = exact).
- **Prop `type`** resolves against a small **prop registry** (name → sprite +
  default body radius/shape). Analogous to how resource entity types resolve
  today. Whether props are their own registry or reuse item defs is §7.2.

### 3.2 Prop entity model (decision B)

A prop = a **static body** (circle or box) + a sprite + occluder flags. Reuse
the resource/static-entity path (`gen/resource_entity.go`,
`model/resource/…` rendering + AOI streaming), stripping:
- harvest / depletion / respawn-on-depletion behavior,
- the resource `Generator` (props are placed, not generated).

Adding:
- `blocksMovement` → body on `LayerMobStaticCollision | LayerBorderCollision`
  (collidable) vs a non-colliding decorative body / no body.
- `blocksAura` → stored, **inert this pass** (item 6 reads it later).

**Wire:** props ride the existing entity-streaming path (they render like
resources do). Minimal-to-zero new wire if we map prop types onto existing
`EntityType`s or add a few. Verify the frontend `EntityType` enum coverage during
chunk 3.

### 3.3 Spawn-point system (replaces global-count spawning)

`MobSystem` gains **per-spawn-point state**: each authored spawn owns one live
mob (or a running respawn timer). On boot, spawn one mob per point at its
position/angle. On mob death:
1. Remove the mob (as today).
2. Start a **respawn timer** for that point (`respawnTicks ± variance`).
3. When it elapses, spawn a fresh mob **at the same point**.

This **replaces** `respawnMob`'s random-location + procreation logic and the
`berryhunterd.go` `initialMobCount` / `Generator.Fixed` loops. The mob JSON
`generator` block (`Weight`/`Fixed`/`RespawnBehavior`) becomes **obsolete for
world population** (may stay as struct fields until a follow-up removes them —
see §5 gotcha on the totem cross-link).

### 3.4 Rectangular boundary (decision D)

New `phy.InvAABB` mirroring `InvCircle`: an inverse axis-aligned box that keeps
`Circle` bodies inside `[-w/2, w/2] × [-h/2, h/2]`, resolving the same way
`InvCircle` pushes bodies inward. Only **circle-vs-InvAABB** resolution is needed
(all dynamic bodies are circles today — players, mobs). No box-vs-box.

### 3.5 Editor (decision C)

Extend the MysticWand tool:
- **Modes:** terrain texture (existing) → add **prop placement** and **spawn
  placement**. A mode selector in the panel.
- Prop mode: pick a prop type, click to place, set rotation, toggle
  `blocksMovement`/`blocksAura`.
- Spawn mode: pick a mob, click to place, set `respawnTicks`/variance; render a
  distinct **editor-only marker** (not a live mob).
- **Export:** `getZoneAsJSON()` alongside `getTexturesAsJSON()`; download
  `zone.json`; author drops it into `api/` and restarts with `-content ../api`.
- **Round-trip:** the editor should be able to **load** the current `zone.json`
  (so editing is iterative, not append-only). Simplest path: the client fetches
  the same file the server loaded (bundle it like `ground-textures.json`, or a
  tiny dev-only GET). Pin down in chunk 5.

---

## 4. Pitfalls & gotchas

1. **`phy.Box` collision resolution is unimplemented (`panic`).** Do **not**
   build the rectangular boundary out of four `Box` walls — it will panic at
   runtime. Build `InvAABB` instead (chunk 1). This is the single biggest risk;
   front-load it.
2. **`radius` is load-bearing in ~8 places.** Circle→rect isn't a one-line
   config swap. Either (a) keep a `Radius()`-shaped bounding accessor for
   compatibility during migration and add `Bounds()`, or (b) replace call sites
   wholesale. Lean (a) to keep chunks small: add `Bounds()`, migrate the border
   + spawn helpers first, retire `Radius()` last. Watch: `mob.NewMob(…, radius,
   …)` and the `rndPos` bool path.
3. **MiniMap assumes a circular/radius world** (`gc.Radius * Points2px`,
   `MiniMapInterfaces`). A rectangular world needs width/height on the wire and
   a rectangular minimap. Likely a small **wire change** (world bounds in
   `Welcome`/`GameState`). Scope this in chunk 1 or a dedicated sub-step —
   don't let it surprise chunk 6.
4. **Units mismatch — Points vs pixels.** Server coordinates are game units
   ("Points"); the client scales by `codec.Points2px`. The existing
   `ground-textures.json` stores **client** coordinates. `zone.json` is
   **server** coordinates. The editor authors on the client — it must **export
   in server units** (divide by `Points2px`) or the loader must convert. Pick one
   convention and pin it; a silent px/point mix will place everything 30× off.
5. **"Tile-based terrain" vs the existing free-form texture system.** The
   existing tool places textures **free-form** (x/y/size/rotation/flip), not on a
   snapped grid. It already produces a grass/sand/water floor. Building a rigid
   tile grid is real extra work for arguably no visual gain. **Open sub-decision
   §7.1** — resolve before chunk 6. (Lean: keep free-form; it satisfies the
   "authored floor" intent with zero new machinery.)
6. **Deleting resources may leave dangling references.** `gen.Generate`, the
   harvest/depletion code, resource `EntityType`s, and any item/recipe that
   references gathered resources. Block 2 removed survival, but verify nothing
   still expects world resources (crafting UI, item drops). Stop *generating*
   them (remove from `berryhunterd.go`); keep the `gen` package (props reuse
   `resource_entity.go`). Grep for orphaned callers during chunk 2.
7. **Totem cross-link (effect foundations Step 3).** That plan
   (`plan-effect-foundations.md` §8) introduces a `respawnBehavior:"None"` guard
   **in `MobSystem`** for TTL'd owned entities. Our spawn-point rework rewrites
   exactly that respawn path. **Coordinate:** the new per-spawn-point respawn
   must not respawn totems/owned mobs (they have no spawn point). Design the
   spawn loop as "respawn only mobs that belong to a spawn point"; totems simply
   have none → they die and stay dead. This actually *simplifies* the totem
   guard. Note it in both plans.
8. **Editor is dev-only.** Gated behind the MysticWand equip (already the case);
   `zone.json` export is a dev workflow. Ensure spawn markers / prop-edit state
   never leak into production builds or the normal game view.
9. **Deterministic seeding.** Today resources + mob HP variance ride seeded
   RNG (`chunkRand`, entity-ID-seeded mob `rand`). Authored placement removes the
   resource seeding entirely; mob **HP variance still rolls at spawn** (item 11
   Phase 3) — a spawn-point mob must still get its entity-ID-seeded `rand` so HP
   bands work. Don't drop the per-mob seed when rewriting the spawn path.
10. **Camera / world-size assumptions on the client.** The camera-follow and any
    "clamp to world edge" logic may assume the circular radius. Rectangular
    bounds may change clamping. Low risk (camera follows the player), but check
    during chunk 6.
11. **The "blue bleed" terrain bug** (pre-existing, CLAUDE.md) lives in the
    ground/tile rendering — the same area chunk 6 touches. Don't inherit blame for
    it, but a bigger world may make it more visible; note if it worsens.

---

## 5. Chunking (dependency order)

Each chunk is independently buildable, testable, and small enough to land + get
confirmed on its own (per the working-style: plan → confirm → build → sanity
check, pause between chunks).

### Chunk 1 — Rectangular world boundary (backend / `phy`) — ✅ DONE + verified in-game 2026-07-08
- **Goal:** the world is a rectangle with a working physical wall.
- **Do:** add `phy.InvAABB` (mirror `InvCircle`; circle-vs-InvAABB resolution +
  tests); add `GameConfig.Bounds{Width,Height}` (keep `Radius` temporarily);
  swap the `game.go:96` border to `InvAABB`; add `game.Bounds()`; wire world
  size to the client (Welcome/GameState field) + make the MiniMap render a
  rectangle.
- **Tests:** `phy` unit tests (a circle pushed back inside each edge/corner);
  boot test (world constructs, player can't leave the rectangle).
- **Gotchas:** #1, #2, #3, #4. **Front-loads the biggest risk.**
- **Record (2026-07-08, full suite green, tsc green, boot- + in-game-verified —
  walked all 4 corners/edges, wall holds):**
  - `phy.InvAABB` (`phy/inv_aabb.go`) mirrors `InvCircle` structurally: static
    wall, embeds `dynamicColliderShape` + nil `CollisionResolver`, only
    `intersectWithCircle`/`resolveCollisionWithCircle` do real work (box/inv-circle
    dispatchers panic — a static wall only ever meets circles and is never the
    querying shape; `IntersectWith` panics for the same reason). Resolution
    (`resolveInvAABB`) clamps the circle centre per-axis into the box shrunk by
    the radius, so edges and corners fall out of the same three lines; a
    box-narrower-than-circle guard mirrors InvCircle. `updateBB` doubles the
    half-extents (the InvCircle broadphase-overrun hack) so a body that drifts
    just past a boundary still shares a grid cell with the wall. **No change to
    `Circle`/`Box`/`InvCircle` or the double-dispatch interfaces** — exactly how
    InvCircle was originally added. Pins: per-edge/corner push-back, interior =
    zero force, narrow-box guard, and an **end-to-end confinement test** that
    drives a dynamic circle outside each edge through the real `Space.Update()`
    broadphase+resolution pipeline (`phy/inv_aabb_test.go`).
  - Config: `cfg.Bounds{Width,Height}` + `GameConfig.Bounds` (keep `Radius`);
    `core.Bounds(w,h)` option; `game.Bounds() (w,h)` + `model.Game.Bounds`
    (`Radius()` marked Deprecated — still drives the circular `NewRandomPos`
    spawn/gen paths until chunks 2/4). Wall swapped to
    `NewInvAABB(VEC2F_ZERO, gc.Bounds.Width, gc.Bounds.Height)`.
  - **§7.3 wire = REPLACE:** `Welcome.map_radius` retired → `map_width` +
    `map_height` (float, ×`Points2px`). Regenerated Go + TS FlatBuffers (flatc
    v24.3.25). Consumers migrated: `codec.Welcome`, `WelcomeMessage.ts`,
    `Game.ts` backdrop, `EntityManager(width,height,…)`, `MiniMap.setup(w,h)`.
  - Frontend backdrop: circle→rect (full-bounds `shallowWaterColor` + 240px-inset
    `landColor` land rect — the water ring preserved rectangularly). **Camera
    clamp rewritten circular→rectangular** (`camera/logic/Camera.ts`
    `keepWithinMapBoundaries`: clamp camera centre to `worldHalf − screenHalf`,
    lock to centre if the world is smaller than the viewport) — a circular clamp
    would have fought the rectangular wall at the corners; dead `extraBoundary`
    removed.
  - **§7.5 bounds = [PLACEHOLDER] 60×40 server units** (7200×4800 px), chosen to
    comfortably contain the still-circular radius-20 spawn area so nothing spawns
    outside the wall during the temporary circle-spawn/rect-wall overlap. Set in
    both `core/game.go` (default literal) and `cmd/berryhunterd/berryhunterd.go`.
  - Expected-and-intended leftovers for later chunks: mobs still spawn in the old
    radius-20 circle (chunk 4 replaces with authored spawn points); the 240px
    blue water ring frames the green world (cosmetic; drop or restyle in the
    terrain/content pass if desired).

### Chunk 2 — Zone file schema + loader; stop generating resources (backend) — ✅ DONE + verified in-game 2026-07-08
- **Goal:** the server loads `zone.json` (bounds + empty props/spawns ok) via
  `-content`; procedural resources are gone.
- **Do:** `zone.json` schema + parser + hard-fail validation (mirror the
  effect/skill loader style — unknown keys, unknown prop/mob names, bad bounds);
  load in `berryhunterd.go`, apply `bounds` to the game; **remove
  `gen.Generate` from population** and the `initialMobCount`/`Generator.Fixed`
  loops (chunk 4 replaces spawns). Keep the `gen` package.
- **Tests:** `TestZone_LoadsValid`, hard-fail cases, `-content` disk-load test
  (mirror `TestDiskContent_RepoApiLoadsEndToEnd`); boot with an empty-ish zone.
- **Gotchas:** #6 (dangling resource refs).
- **Sub-decisions taken:** **(a)** loader walks `*.json` and **requires exactly
  one** zone (byte-identical to `RecipesFromFS`; lifting the "exactly one" guard
  is all multi-zone later needs) — not a fixed filename. **(b)** spawn `mob`
  names **are resolved against the mob registry at load time** (registry is
  available; catches typos at boot, resolved `*MobDefinition` stashed on the
  `Spawn` for chunk 4); prop `type` resolution **defers to chunk 3** (no prop
  registry yet).
- **Record (2026-07-08, full suite green, embedded + `-content ../api` boot-verified,
  **verified in-game 2026-07-08** — walked the empty bounded rectangle):**
  - **New `pkg/berryhunter/world` package** (`zone.go`): `Zone`/`Bounds`/`Prop`/
    `Spawn` types + `LoadZoneFS(fsys, mobs.Registry)`, mirroring `RecipesFromFS`.
    `parseZone` uses `json.Decoder.DisallowUnknownFields()` so typos/stale keys
    fail **by name**; `validate()` pins non-empty name + strictly-positive bounds;
    `resolve()` binds each spawn's mob name to its `*MobDefinition`. Walk requires
    exactly one zone (0 → "no zone file", ≥2 → "multiple zone files … not
    supported yet"). Props parse structurally; type resolution is chunk 3.
  - **Content + embed:** `api/zones/zone.json` ([PLACEHOLDER] `Scaffold` 60×40,
    empty props/spawns — the real scaffold layout is chunk 6); `pkg/api/zones/
    zones.go` (`//go:embed *.json`, flat like `recipes.go`); `Makefile` `cp-defs`
    now also copies `../api/zones`.
  - **Loader wiring** (`cmd/berryhunterd/loaders.go`): `zones fs.FS` on
    `contentSources`; `embeddedContent()` returns `azones.Zones`; `diskContent`
    adds `sub("zones")` so a missing `zones/` hard-fails like the other subdirs;
    new `loadZone(fsys, mr)` helper (panic-on-error + a count/bounds boot-log line).
  - **Population removed** (`cmd/berryhunterd/berryhunterd.go`): deleted the
    `gen.Generate` resource loop, the `initialMobCount` random-mob loop, the
    `Generator.Fixed` loop, and the now-dead `newRandomMobEntity`/
    `findMobSpawnPosition` helpers (+ 6 dead imports: gen, mobs, model, model/mob,
    phy, wrand). Bounds now come from `zone.Bounds` via `core.Bounds(...)` instead
    of the hardcoded `60×40` literal. **`radius` / `core.Radius` kept** —
    `sys/mob.go` + `sys/respawn.go` still read `game.Radius()` for the circular
    respawn paths until chunk 4 retires them.
  - **Gotcha #6 swept:** no `gen.Generate` callers remain; the `gen` package
    stays (props reuse `resource_entity.go` in chunk 3; `NewRandomPos` still feeds
    the kept-but-now-inert resource/mob respawn paths). `cfg.InitialMobCount`
    lingers unused (harmless; removal is out of scope).
  - **Pins:** `world/zone_test.go` (valid load, empty props/spawns, unknown-key,
    non-positive bounds, missing name, unknown spawn mob, multiple/no zones);
    extended `TestDiskContent_RepoApiLoadsEndToEnd` asserts the repo `api/zones`
    zone loads with positive bounds.
  - **Intended leftovers:** no mobs / resources / props spawn — the world is a
    bounded empty rectangle until chunk 3 (props) + chunk 4 (spawn points). The
    branch stays **uncommitted** until the world is playable again (mobs, chunk 4).

### Chunk 3 — Props as static entities (backend + minimal wire) — ✅ DONE + verified in-game + committed 2026-07-08
- **Goal:** authored props spawn, collide (`blocksMovement`), render, and stream.
- **Do:** prop registry (type → sprite + body); build prop entities from
  `zone.props` reusing `resource_entity.go` plumbing minus harvest; occluder
  flags on the body (`blocksMovement` live, `blocksAura` stored/inert); ensure
  the frontend renders them (EntityType coverage).
- **Tests:** `TestZone_PropsBecomeCollidableEntities`,
  `TestProp_BlocksMovementFlagSetsBodyLayer`, a non-colliding decoration case.
- **Gotchas:** #6, EntityType/wire coverage.
- **Record (2026-07-08, full backend suite green (28 pkgs), embedded +
  `-content ../api` boot-verified — 2 prop defs, zone loads 5 props/7 spawns
  both modes; **verified in-game + committed 2026-07-08** — props render at
  authored spots, blockers stop movement, the decorative rock walks through):**
  - **§7.2 DECIDED → dedicated prop registry as a JSON content dir**
    (`api/props/*.json`, mirroring mobs): `world.PropDefinition` (name →
    `entityType` + `body.radius`) + `world.PropRegistryFromFS` in
    `world/props.go`. Hard-fails by name: unknown JSON keys
    (`DisallowUnknownFields`), empty name, unknown `entityType`, non-positive
    radius, duplicate prop names. `entityType` is a **name resolved against the
    FlatBuffers enum** (`BerryhunterApi.EnumValuesEntityType`); the definition
    stores the FlatBuffers type because `world` can't import `model`
    (`model → cfg → world` would cycle) — the boot seam converts, like `gen`'s
    tables always did.
  - **Prop entity = new lean type, NOT `resource.Resource`** (decision B's
    "new entity type only if reuse fights us" clause triggered: reuse would
    need a synthetic `items.Item`, its `Solid` flag is def-level while
    `blocksMovement` is per-instance, stock/replenish semantics are dead
    weight, and `blocksAura` has no home). `model/prop.Prop` =
    `model.BaseEntity` + `blocksAura` field; `prop.New(entityType, pos, radius,
    blocksMovement, blocksAura)` sets `Shape().UserData` (viewport streaming)
    and layers: blocking → `PlayerStatic|MobStatic|Viewport` (the solid-resource
    bits minus the generation-spacing `LayerRessourceCollision` nothing masks
    anymore), decorative → `Viewport` only (streams, never collides). New
    `model.PropEntity` interface (`Entity` + `BlocksAura()`).
  - **Routing needed zero `core/game.go` changes** — props fall through
    `AddEntity`'s existing `case model.Entity` → `addEntity` (PhysicsSystem
    `AddStaticBody` + NetSystem). No respawn/update/status/decay systems
    involved; `sys/respawn.go` never sees props.
  - **Wire + frontend: zero changes.** New codec case `model.PropEntity` →
    `PropEntityFlatbufMarshal` rides the existing `Resource` table with
    **capacity=1/stock=1** (the client's resource classes scale sprites by
    stock/capacity, so 1/1 renders full size) and an empty status-effects
    vector. Scaffold prop types map onto existing EntityTypes
    (**Rock→Stone, Tree→RoundTree**), so the frontend's `gameObjectClasses`
    array already covers them; dedicated prop art/EntityTypes are content work
    (the known 5-file path: server.fbs + regen, class, `gameObjectClasses`,
    `Graphics.ts`, SVG).
  - **Rotation deferred:** parsed + stored on `world.Prop`, but the `Resource`
    wire table has no rotation field and circle props don't need one —
    revisit in chunk 5/6 if the editor places rotated props.
  - **Wiring:** `zone.resolve` binds `Prop.Def` (unknown type fails at boot);
    `LoadZoneFS(fsys, mobs.Registry, world.PropRegistry)`; `contentSources.props`
    (embedded `pkg/api/props` + disk `sub("props")`, missing subdir hard-fails);
    `loadProps` boot-log line; `Makefile cp-defs` copies `../api/props`;
    `berryhunterd.go` places props once after `NewGameWith` via
    `g.AddEntity(prop.New(...))`.
  - **Content [PLACEHOLDER]:** `api/props/rock.json` (Stone, r 0.5) +
    `tree.json` (RoundTree, r 1.0); `api/zones/zone.json` authors **5 props**
    near the origin — 2 blocking Trees, 2 blocking Rocks, 1 **decorative**
    walk-through Rock at (2, 5) — to exercise both layer paths in-game.
  - **Pins:** `world/props_test.go` (valid load, unknown key/entityType/name,
    non-positive radius, duplicate name); `zone_test.go` prop resolution +
    `TestZone_RejectsUnknownPropType`; `model/prop/prop_test.go` — layer flags
    per occluder flag, UserData, and **end-to-end through the real
    `Space.Update()`**: a player-masked circle overlapping a blocking prop is
    pushed out, a decorative prop leaves it unmoved;
    `TestDiskContent_RepoApiLoadsEndToEnd` extended (props registry + every
    zone prop resolved).

### Chunk 4 — Spawn-point system (backend) — ✅ DONE + verified in-game + committed 2026-07-08
- **Goal:** mobs spawn at authored points and respawn at the same spot on a
  timer.
- **Do:** per-spawn-point state in `MobSystem`; boot spawns one mob per point;
  death → timer (`respawnTicks ± variancePct`) → respawn at the point; remove
  random/procreation population. Preserve per-mob HP-variance seeding (#9).
- **Tests:** `TestSpawnPoint_SpawnsAtAuthoredPosition`,
  `TestSpawnPoint_RespawnsAtSameSpotAfterTimer`,
  `TestSpawnPoint_RespawnVarianceWithinBand`, `TestSpawnPoint_NoSpawnPointNoRespawn`
  (the totem cross-link, #7).
- **Gotchas:** #7 (totem coordination), #9 (seed).
- **Note (jumped ahead of Chunk 3):** taken next after Chunk 2 (out of order) to
  get mobs back and reach a playable/committable state sooner. Props (Chunk 3)
  follow after.
- **Record (2026-07-08, full suite green, embedded + `-content ../api` boot-verified,
  **verified in-game + committed 2026-07-08**):**
  - **`sys/mob.go` rewritten.** The random/procreation population is gone
    (`respawnMob`, `findMobSpawnPosition`, `findNearbySpawnPosition`, `randomMob`
    + the `gen`/`wrand` imports deleted). New `spawnPoint` struct (def, pos,
    angle, respawnTicks, variancePct, `liveMobID`, `respawnAt`); `MobSystem` holds
    `points []spawnPoint` + an `initialized` flag.
  - **Initial spawn on the first `Update` tick, not `New()`** — `game.AddEntity`
    routes a mob only to systems registered *before* the call, and SkillSystem is
    added *after* MobSystem in `core.NewGameWith`; by the first `Update` the world
    is fully wired. `spawnAt` keeps calling `mob.NewMob`, so each spawn re-seeds
    its entity-ID RNG and rolls HP variance (#9 handled for free).
  - **Death → `onMobDeath`** links the dead mob to its point by `liveMobID` and
    sets `respawnAt = Ticks() + rollDelay`; the respawn loop spawns each due point
    (`liveMobID == 0 && Ticks() >= respawnAt`). **A dead mob owned by no point (a
    future totem/owned entity) matches nothing → stays dead** — gotcha #7's totem
    guard falls out of the design for free, no special case.
  - **`rollDelay`** reuses `vitals.RollVariance` for the `ticks × [1−pct, 1+pct]`
    band (absent/0 = exact), clamped ≥ 0.
  - **Wiring:** `GameConfig.Spawns []world.Spawn` + `core.Spawns(...)` option →
    `NewMobSystem(g, seed, spawns)` at `game.go:116`; `berryhunterd.go` passes
    `core.Spawns(zone.Spawns)`. No import cycles (`cfg → world → mobs`,
    `sys → world → mobs`; both already import `mobs`). **`radius`/`core.Radius`
    kept** — `sys/mob.go`'s `spawnAt` passes `game.Radius()` to the unused
    `rndPos=false` NewMob path, and `sys/respawn.go` (resources) still reads it;
    full Radius retirement waits.
  - **Content [PLACEHOLDER]:** `api/zones/zone.json` now authors **7 spawns**
    (4 Dodo @900t, 2 SaberToothCat @1800t, 1 Mammoth @2700t, all 0.2 variance)
    inside the 60×40 bounds — scaffold to exercise the chunk; real placement is
    Chunk 6 / content.
  - **Pins:** `sys/mob_test.go` — a minimal `fakeGame` implementing `model.Game`
    (records add/remove, forwards to the system, settable tick); spawns-at-position
    (+ init-runs-once), respawns-at-same-spot-after-timer (not before), variance-
    within-band, exact-delay-without-variance, no-point-no-respawn (totem guard).
    `MobTouches(nil, Factors{Damage: 1e6})` is the lethal path (no player needed).
  - **Obsolete-but-kept:** the mob-def `Generator` block (`Weight`/`Fixed`/
    `RespawnBehavior`) and `cfg.InitialMobCount` no longer drive anything; left as
    struct fields for a later cleanup (plan §3.3).
  - **This is the playable/commit point** — world bounded, loaded from
    `zone.json`, mobs live at authored spots with same-spot respawns. Committed.

### Chunk 5 — Editor: props + spawns placement + zone export (frontend)
- **Goal:** author a full `zone.json` in-game.
- **Do:** extend the MysticWand panel with prop + spawn modes; place/rotate/flag
  props; place spawn markers with respawn settings; `getZoneAsJSON()` +
  download; **load** an existing `zone.json` for iterative editing; export in
  **server units** (#4).
- **Tests:** manual (in-game authoring round-trip); light unit tests on the
  JSON (de)serialization if factored out.
- **Gotchas:** #4 (units), #8 (dev-only).

### Chunk 6 — Terrain floor + a scaffold zone (frontend + pipeline proof)
- **Goal:** prove the whole pipeline end-to-end with a **throwaway scaffold
  zone** — NOT the real designed zone (that's the content pass, roadmap item 12).
- **Do:** resolve §7.1 (free-form vs grid); finalize the terrain flow; author a
  minimal scaffold `zone.json` (a bounded area, a few props, a couple of spawn
  points) purely to verify editor → export → server-load → in-game behavior.
- **Tests:** in-game verification (boot with `-content`, walk the zone, mobs
  spawn/respawn at their spots, props collide, boundary holds).
- **Gotchas:** #5, #10, #11.
- **Scope guard:** do not over-invest in this zone's *design* — it exists to
  exercise the tooling. Real zone layout, environmental storytelling, and mob
  placement are content work.

---

## 6. Open sub-decisions (pin before the relevant chunk)

- **§7.1 — Terrain: free-form textures vs a snapped tile grid.** The existing
  system is free-form and already looks like terrain. Lean: **keep free-form**
  (KISS; satisfies "authored floor"). Decide before chunk 6. *(This softens the
  "tile-based" choice into "authored textured floor" — confirm that's acceptable.)*
- **§7.2 — Prop registry. DECIDED 2026-07-08 → dedicated registry as JSON
  content** (`api/props/*.json` → `world.PropRegistryFromFS`), not item/resource
  defs — props aren't items. The prop entity is likewise a new lean
  `model/prop.Prop`, not a reused `resource.Resource` (decision B's escape
  hatch: reuse fights us — synthetic `items.Item`, def-level `Solid` vs
  per-instance `blocksMovement`, dead stock semantics, no home for
  `blocksAura`). See the chunk 3 record.
- **§7.3 — World-size on the wire. DECIDED 2026-07-08 → REPLACE.** `Welcome.map_radius`
  is retired; new `map_width`/`map_height` floats (server units → px like the old
  radius). Rationale: frontend + backend ship together and every consumer is rewritten
  in this chunk anyway, so a wire-break costs nothing and keeps one honest source of
  truth (an appended width/height leaves `map_radius` a meaningless field with no
  remaining consumer). All `map_radius` consumers migrate: `WelcomeMessage.ts`,
  `Game.ts` water-circle + MiniMap setup, `EntityManager` bounds.
- **§7.4 — Editor load path.** Bundle `zone.json` like `ground-textures.json`
  (build-time) vs a dev-only GET endpoint. Lean: bundle first (zero new server
  surface). Decide in chunk 5.
- **§7.5 — Placeholder numbers.** Bounds set to **[PLACEHOLDER] 60×40 server
  units** in chunk 1 (contains the radius-20 spawn circle); `respawnTicks`,
  `respawnVariancePct`, prop body radii still **[PLACEHOLDER]**, tuned in-game.

---

## 7. Cross-references

- `docs/roadmap.md` item 4 (world & zones), item 7 (mob placement/respawn).
- `docs/architecture.md` — zones-as-Spaces analysis (deferred; single Space now).
- `docs/plan-effect-foundations.md` §8 — totem lifecycle; **coordinate the
  `MobSystem` respawn rewrite** (§5 gotcha #7).
- `docs/gdd.md` — world design intent (handcrafted, environmental storytelling).
