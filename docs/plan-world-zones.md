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

### Chunk 1 — Rectangular world boundary (backend / `phy`)
- **Goal:** the world is a rectangle with a working physical wall.
- **Do:** add `phy.InvAABB` (mirror `InvCircle`; circle-vs-InvAABB resolution +
  tests); add `GameConfig.Bounds{Width,Height}` (keep `Radius` temporarily);
  swap the `game.go:96` border to `InvAABB`; add `game.Bounds()`; wire world
  size to the client (Welcome/GameState field) + make the MiniMap render a
  rectangle.
- **Tests:** `phy` unit tests (a circle pushed back inside each edge/corner);
  boot test (world constructs, player can't leave the rectangle).
- **Gotchas:** #1, #2, #3, #4. **Front-loads the biggest risk.**

### Chunk 2 — Zone file schema + loader; stop generating resources (backend)
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

### Chunk 3 — Props as static entities (backend + minimal wire)
- **Goal:** authored props spawn, collide (`blocksMovement`), render, and stream.
- **Do:** prop registry (type → sprite + body); build prop entities from
  `zone.props` reusing `resource_entity.go` plumbing minus harvest; occluder
  flags on the body (`blocksMovement` live, `blocksAura` stored/inert); ensure
  the frontend renders them (EntityType coverage).
- **Tests:** `TestZone_PropsBecomeCollidableEntities`,
  `TestProp_BlocksMovementFlagSetsBodyLayer`, a non-colliding decoration case.
- **Gotchas:** #6, EntityType/wire coverage.

### Chunk 4 — Spawn-point system (backend)
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
- **§7.2 — Prop registry: new registry vs reuse item/resource defs.** Lean: a
  small dedicated prop registry (type → sprite + body), since props aren't items
  anymore. Decide in chunk 3.
- **§7.3 — World-size on the wire.** New `Welcome`/`GameState` field for
  rectangular bounds (width/height) vs reusing/retiring the radius field. Decide
  in chunk 1.
- **§7.4 — Editor load path.** Bundle `zone.json` like `ground-textures.json`
  (build-time) vs a dev-only GET endpoint. Lean: bundle first (zero new server
  surface). Decide in chunk 5.
- **§7.5 — Placeholder numbers.** Bounds (120×80?), `respawnTicks`,
  `respawnVariancePct`, prop body radii — all **[PLACEHOLDER]**, tuned in-game.

---

## 7. Cross-references

- `docs/roadmap.md` item 4 (world & zones), item 7 (mob placement/respawn).
- `docs/architecture.md` — zones-as-Spaces analysis (deferred; single Space now).
- `docs/plan-effect-foundations.md` §8 — totem lifecycle; **coordinate the
  `MobSystem` respawn rewrite** (§5 gotcha #7).
- `docs/gdd.md` — world design intent (handcrafted, environmental storytelling).
