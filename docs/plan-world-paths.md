# Plan: World paths — a stroked polyline primitive for roads and water

**Status: C1 + C2 + C3 SHIPPED 2026-09-07; C4 NOT STARTED.** ⭐ **D6 was answered after the first draft and rewrote §4.2: bridges are PROPS, not paths** — which deleted D11's last-wins clearing rule outright. Schema impact: **DB NONE · FlatBuffers NONE · conf NONE · content = one new zone array** (absent = no paths, so every shipped zone stays valid).

⭐ **This is the sibling of the region primitive, not a new system.** A region is a closed polygon *filled*; a path is an open polyline *stroked*. The profile table, the paint spec, the blend mask, map parity and the Tiled round-trip are all reused verbatim — Pixi 8's `StrokeStyle extends FillStyle` (verified at HEAD in `frontend/node_modules/pixi.js/lib/scene/graphics/shared/FillTypes.d.ts:43`), so `regionPaint()`'s `{texture, matrix}` output feeds `.stroke({…})` unchanged.

⚑ **The genuinely new part is the server side**: a blocking path is the first world geometry that stops movement and is neither a prop nor the border wall.

⚑ Line references pinned 2026-09-06; re-verify before relying on them.

---

## 1. What this is

**Roads already exist in this game, as 372 hand-stamped `Sand` blobs.** `api/zones/world.json` holds 537 `terrain` entries; **372 of them are one sand blob (69 %)**, and `docs/art/README.md:289` already records it: *"Every road in the game is this one blob, scaled and flipped. Second-most-repeated image after the tree."* `art/README.md:307` adds the shape of the problem — *"the world is currently far more road than meadow."*

`plan-region-primitive.md` §1.2 wrote the argument against painting an area out of blobs, and every line of it applies unchanged to a road:

- The base fill shows through every gap, so a road must be stamped to **full coverage**.
- Terrain array order is paint order and **the array is flat with no addressing** (backlog §58), so a road is indistinguishable from decoration inside one 3 000-entry array.
- The full-screen map bakes the same pieces, so **the cost lands twice**.

The PO's ask is the fix: paint **one vector path with points**, rendered as a strip between the ground and the terrain blobs — and use the same primitive for **water**, which is **non-traversable by default** and **animated** in a later chunk.

### 1.1 Interior water does not exist today

`layers.terrain.water` is only the screen-sized backdrop *outside* the world bounds plus a 240 px beach ring (`Game.ts:515-527`, `Graphics.ts:15-16` — `deepWaterColor 0x1C57B5` / `shallowWaterColor 0x287aff`). The `Coast` and `Coastal Cliff` profiles paint **sand**. `gdd.md:524` mentions rivers aspirationally as part of per-zone geometry; there is **no ruling on interior water, rivers, roads or paths anywhere in `docs/`**, and backlog holds no entry for any of them. The slate is clean.

### 1.2 ⭐ The free side-effect: this arms the open look sitting

`plan-region-primitive.md`'s C5 ledger records its seam leg as **INCONCLUSIVE at HEAD by construction** — *"the one shipped region has no interior edge to sample… it arms itself the moment a second region (or any interior feathered edge) exists"*. `api/zones/world.json` confirms it: `regions` holds exactly one entry, `Fields`, a rectangle at the full 144 × 72 bounds.

A path is the first shipped content that creates an interior feathered edge. It makes C5's leg assertable and makes the whole open look sitting — texture picks, the 0.35 scale, blend width, mask density — judgeable in front of the game for the first time.

---

## 2. What already works — checked, not assumed

| Piece | Where | Reuse |
|---|---|---|
| `Point{X,Y float32}`, server units | `backend/pkg/aura/world/zone.go:222` | verbatim |
| Profile table (`texture`/`scale`/`blend`/`color`), 16 profiles | `frontend/src/client-data/profiles.json` | add `Road`, `Water` |
| Paint spec + D14 texture-or-colour fallback | `Regions.ts:315 regionPaintSpec` | verbatim |
| Per-zone tile loading (never at boot) | `RegionPaint.ts:68 loadZoneTextures` | verbatim |
| Blurred-silhouette blend mask | `RegionPaint.ts:204 buildBlendMask` | one small generalization (§4.3) |
| Map parity through ONE shared paint fn | `MapTerrain.ts:100` calls `paintRegions` | extended (§4.4) |
| Polyline authoring, round-tripped | `spawns[].waypoints`, Tiled polyline → `aura-convert.js` | the template |
| A static body that is **not** an entity | `core/game.go:127-129`, the border wall via `p.AddStaticBody(ecs.NewBasic(), wall)` | the collider precedent |
| `blocksMovement` as authored vocabulary | `zone.go` `Prop.BlocksMovement` → `prop.go:134 propLayer` | same word, same meaning |

⚑ **The regions Tiled layer explicitly refuses a polyline** (`aura-convert.js:873` — *"must be a POLYGON — the regions layer holds outlines"*). Paths get their own layer; that refusal stays exactly as it is.

---

## 3. ⚑ The constraint everything follows from

**The profile table is client-side by ruling (D12), and the server must not learn it.** A profile is a *material* (D17) — its look, its tile, its blend width. So "this water blocks" cannot be a profile property without handing the server a second content table and breaking D12.

**Therefore blocking is authored per placement, as `blocksMovement` — the exact word `props[]` already uses and the server already reads.** The server parses `profile` and ignores it, precisely as it does for `regions`, `terrain` and `darkAreas`. A shallow ford is then just a water path authored `false`, with no new vocabulary at all.

---

## 4. Design

### 4.1 ⭐ D1 — the authored shape is ONE array

```jsonc
"paths": [
  { "profile": "Water", "width": 5, "blocksMovement": true,
    "points": [{"x":-40,"y":-30}, {"x":-38,"y":-10}, {"x":-30,"y":12}] },
  { "profile": "Road",  "width": 2.5,
    "points": [{"x":-60,"y":0}, {"x":0,"y":4}, {"x":60,"y":-2}] }
],
"props": [
  { "type": "Bridge", "x": -38, "y": -10, "rotation": 1.2, "blocksMovement": false }
]
```

```go
// backend/pkg/aura/world/zone.go
type Path struct {
    Profile        string  `json:"profile"`
    Points         []Point `json:"points"`
    Width          float32 `json:"width"`
    BlocksMovement bool    `json:"blocksMovement"`
}
```

- **`points` is an open POLYLINE**, ≥ 2 points. A region is ≥ 3 and closed — a different concept, kept a different array (**D2**, §9 records the rejected alternatives).
- **`width` is per-path, in server units (D3).** Width is geometry, not material: one river narrows and widens, and a footpath and a highway share the `Road` profile.
- **`blocksMovement` defaults `false` (D4)** — a bool whose zero value is the safe one, matching `props[]` and keeping Tiled's *"a class member is safe exactly when its default is a value the converter maps back to 'not authored'"* rule (region-primitive C2) honest.
- **`profile` is NOT validated server-side (D5)** — `Region`'s D8 posture verbatim: the table lives in the client, Tiled catches an unknown name at save time with the object id, and D11's totality resolves a miss to the default. A typo costs one path's look, never a boot failure.
- **Array order is draw order and resolution order**, exactly as `regions` (D0).

Server-side `validate()` checks, each naming the array index: non-empty `profile`, `len(points) >= 2`, `width > 0`.

### 4.2 ⭐ D6 — a bridge is a PROP, and it clears the corridor it stands on

**PO-answered 2026-09-06** (this reverses the first draft's path-vs-path design; see §9 D11 for what it deleted).

The PO's requirement is a path crossing *on top of* water. Three halves, and two are free.

**The look is free.** A prop is an entity drawn in the `resources` layers, far above `layers.terrain.paths`. A bridge sprite sits on the river with no z-order work at all.

**The art and the authoring are free.** A prop already has a sprite, a rect body, a rotation, the Tiled tile-object workflow and the in-game editor's place/move/rotate. `api/props/` holds six definitions today (`house.json` and `gate-wall.json` are the rect precedent); a bridge is a seventh.

**The collision is not free.** The river's corridors sit under the deck, so without a rule the bridge is visually crossable and physically walled.

⛔ **Authoring a gap in the river instead FAILS STRUCTURALLY, and this is the finding that set the design.** The gap must exceed the river's width for a player to fit through the round end-caps, and the deck must then be wider than the gap to hide it — so **a narrow bridge over a wide river, which is the normal case, becomes inexpressible**. A 5-unit river would demand a >5-unit (600 px) bridge.

⭐ **The rule: a prop whose DEFINITION authors `crossesPaths: true` clears the blocking path corridors under its footprint.**

```jsonc
// api/props/bridge.json
{ "name": "Bridge", "entityType": "…", "sprite": "bridge.png",
  "body": { "width": 6, "height": 2 },
  "crossesPaths": true }
```

⭐ **It is a DEFINITION flag, not a placement flag** — authored once for the prop type, never per placement, so an author cannot forget it on the twelfth bridge and cannot accidentally set it on a tree. `PropDefinition` (`world/props.go:95`) and `propDefinitionDoc` (`:173`) each gain the one field; `parsePropDefinition` uses `DisallowUnknownFields`, so the pair must move together or boot fails by name.

⚑ **The footprint that clears is the VISUAL body, not the collision body** (`world/zone.go:86 VisualBody()`). The deck you can see is the deck you can walk on; `CollisionBody()` is the visual body times `collisionFactor`, a ratio authored to let a tree crown overhang its trunk, and it has no meaning for a prop that does not block.

Corridor construction, per blocking path — **all boot-time, once**:

1. Sample the centreline at `CLEAR_STEP` (**[PLACEHOLDER] 0.5 units**). A sample is *clear* if it falls inside any `crossesPaths` prop's visual footprint (a point-in-rotated-rect test — the prop's `Rotation` already orients it).
2. Emit one `phy.NewSolidRotatedAABB` per maximal **blocked run** within each authored segment: centre at the run midpoint, length = run length, height = the path's `width`, angle = the segment's.
3. Add a `phy.NewCircle(vertex, width/2)` at each interior vertex whose sample is blocked — fills the wedge a bend opens on the outer corner.
4. Layer = `LayerPlayerStaticCollision | LayerMobStaticCollision`. ⭐ **Deliberately NOT `LayerViewportCollision`** — the client draws water from its own bundled zone copy, so these bodies never stream, never marshal, and cost the wire exactly zero.
5. Register through `p.AddStaticBody(ecs.NewBasic(), body)`, the border wall's precedent (`core/game.go:127-129`).

⚑ **Ordering does not enter it.** Props are a separate array, so there is no last-wins rule to state and no "the bridge must come after the river" trap — *any* `crossesPaths` prop clears, wherever it is authored. This is the whole simplification the PO's answer bought.

⚑ **Sampling finds gaps; it does not set body count.** An unbridged 40-unit segment is ONE rect, not 80.

⚑ **A `crossesPaths` prop placed with `blocksMovement: true` must be REFUSED at boot, by index.** It would clear the water and then wall the deck with its own body — a bridge you cannot cross, from two authored values that are individually legal. This is the one new validation rule the ruling adds.

⚑ **Cap each emitted rect at `MAX_COLLIDER_SEGMENT` ([PLACEHOLDER] 8 units).** A 40-unit diagonal rect has an enormous bounding box, and the broadphase is a sparse spatial hash that inserts by AABB — one such body would be paired against half the map every tick. `plan-world-scale.md` M1-F3 measured **PhysicsSystem at 74 % of tick** at density 10×, so this is not theoretical.

### 4.3 D7 — client rendering is a stroke instead of a fill

New `frontend/src/features/paths/logic/Paths.ts` — the pure half, mirroring `Regions.ts` and equally free of webpack and PixiJS so it stays unit-testable: `PathDefinition` → `Path` (server units → world px through `meter2px`, the ONE conversion, so world and map cannot disagree), plus `pathWidthPx`.

The PixiJS half reuses `RegionPaint.ts` with **one generalization**. `buildBlendMask` hardcodes its silhouette as `new Graphics().poly(points).fill(0xffffff)` (`RegionPaint.ts:238`); extract that into a `draw: (g: Graphics) => void` argument:

- region → `g.poly(points).fill(0xffffff)`
- path → `g.poly(points, false).stroke({width, color: 0xffffff, cap: 'round', join: 'round'})`

and grow `footprintOf`'s margin by `width/2` for a path. Everything else is untouched: the texel density, the `MASK_MAX_TEXELS` cap, the **one-density-variable-feeds-both** rule, the explicit `clearColor`, and the caller-owns-the-mask-texture contract.

Unblended paths take the cheap path exactly as regions do — `new Graphics().poly(points, false).stroke({...regionPaint(path), width, cap, join})`, no render texture, no mask, no filter pass. **The feature costs zero until a profile authors `blend`.**

⚑ **`regionPaint()` mints a fresh `Matrix` per call on purpose** (`RegionPaint.ts:97-104` — Pixi's `convertFillInputToFillStyle` calls `matrix.invert()` *in place*). Reuse the function; never cache its result across two paths.

### 4.4 ⚑ D8 — map parity, made structural rather than remembered

`plan-region-primitive.md` L2: skipping the map bake *"does not degrade — it produces a map that is a WRONG DRAWING of the world"*, in *"a form no single screenshot catches because each looks plausible alone"*. Its remedy was one shared paint function called by both draw sites.

Do the same one level up: replace the two `paintRegions(...)` calls (`Game.ts:606-624` and `MapTerrain.ts:100`) with a single **`paintTerrainSurfaces(container, regions, paths, renderer)`** that draws regions then paths in order and returns the combined mask textures. A future third surface then cannot be added to the world and forgotten on the map.

⚑ Both callers still own and `destroy(true)` the returned masks — `MapTerrain.ts:152-159` documents exactly why `texture: false` is right for every other child and would strand these forever.

**Layer home:** a new `layers.terrain.paths` container between `regions` and `textures` in `Game.ts:215-280`. A road lies *on* the field and *under* the edge-treatment blobs. Night tint is inherited automatically (the day-cycle filter set is derived); `darkness` correctly stays above.

### 4.5 D9 — animated water, and the shape is already there

The blend path already draws **a rect over the mask footprint, taking its shape from the mask alone** (`RegionPaint.ts:304-321`, D22). So animation is a swap of that one node: `Graphics.rect().fill(texture)` → a **`TilingSprite`** over the same footprint with the same mask, scrolled by nudging `tilePosition` per frame. One draw call, GPU-side UV scroll, nothing rebuilt per frame — and it sidesteps the matrix-invert trap entirely.

Opt-in per profile (`"scroll": {"x": …, "y": …}`, **[PLACEHOLDER]**); absent = static, so it costs zero until authored.

⛔ **Never build this on the day/night filter machinery** (region-primitive L7 — ~25 per-layer filter passes at 30 Hz once made avatars invisible). The working pattern is `DarknessOverlay`'s.

⚑ The map bakes once and will therefore bake a still frame. That is correct, not a bug.

⭐ **What C3 actually built differs from the sketch above in ONE way, and it matters.** The sketch said "swap the blend path's node", which would have made `scroll` silently do nothing on a profile authoring `blend: 0` — the class of quiet no-op this repo keeps paying for. A drifting surface needs a mask to have a *shape*, so the shipped code gives an unfeathered one a **cheap** mask instead: the plain silhouette as a stencil, no RenderTexture and no blur pass. All three cases (still-hard, still-feathered, drifting) now go through one `paintSurface` helper that both `paintRegions` and `paintPaths` call.

⚑ **Tile PHASE is not cosmetic.** A `Graphics` fill phases from the texture matrix, which is texture→LOCAL, and every surface sits at the container origin — so two adjacent rivers share one continuous tiling. A `TilingSprite` phases from its OWN top-left. `tilePosition = -footprint` reproduces the fill exactly; without it every river restarts its tile at its own bounding box and two touching ones show a seam where the pattern jumps.

⚑ **`tilePosition` must be WRAPPED to one tile.** The tiling is exactly periodic so wrapping is invisible, and without it a long session walks the offset past what a float32 uniform can resolve — the water stutters and then stops.

### 4.6 What this does NOT absorb

- **No movement cost, no damage, no server-side "the player is in the river".** Blocking is the only mechanical consumer; anything else needs its own ruling. This keeps region-primitive §1's *"not gameplay"* boundary intact.
- **Paths do not join `resolve()`** in v1. Footsteps-on-road belongs to `plan-region-audio.md`. ⚑ Under D6 that consumer gets no head start: C2's clearing test is point-in-rotated-rect against a prop, so **`distanceToPolyline` is never built** — an audio consumer would have to write it. The first draft's design would have handed it over free; noted so the saving is not assumed later.
- **Paths carry no id.** The §11 quest-addressable fork (*"is the addressable thing one polygon, or a NAMED AREA that several polygons make up?"*) is left open for paths exactly as it is for regions — region-primitive records that *"timing is genuinely free: adding it later costs exactly what adding it now costs."*
- **The minimap still draws no surfaces** — out of scope pending a measurement, unchanged from region-primitive §11 (a second per-frame GL context, the named mobile ceiling).
- **The 372 `Sand` blobs are not deleted.** Re-authoring the world's roads is a content pass and wants the PO in front of the game.

---

## 5. Chunks

**C1 — the primitive, draw-only.** `Path` struct + `validate()` in `zone.go`; the `Road`/`Water` profiles; `Paths.ts`; the `buildBlendMask` generalization and the stroke draw; `paintTerrainSurfaces` at both draw sites; the `layers.terrain.paths` container; all three writers + a `paths` polyline layer in Tiled; the completeness pin. **Nothing blocks yet.**

**C2 — blocking, and the bridge prop.** The corridor builder; `crossesPaths` on `PropDefinition` + `propDefinitionDoc` + the `blocksMovement` conflict refusal; `api/props/bridge.json` and its art; the prop-footprint clearing; `AddStaticBody` at the boot seam; the segment cap. Go tests, mutation-verified. ⚑ A new prop definition also touches the Tiled palette, which is **generated, never hand-edited** (`tools/tiled/generate-palette.mjs` → `palette/props.tsx`) — see the `add-content` skill.

**C3 — animated water.** The `TilingSprite` swap and the per-profile `scroll` key.

**C4 — re-author the 372 `Sand` blobs as paths.** PO-ruled 2026-09-07: yes, the roads become paths. A CONTENT pass, not code: it has to decide where the roads actually run, which is a judgement about the map and not a transform anyone can derive from 372 scattered blob positions.

⏸ **The look sitting** (which textures, what widths, what blend) rides on top — this is what finally makes it judgeable (§1.2).

---

## 6. Schema impact

- **DB: NONE.** Nothing about a path is persisted per character.
- **FlatBuffers: NONE.** Paths never reach the wire — the client reads its bundled zone copy (as it does for `regions`, `terrain`, `darkAreas`), and the colliders are deliberately off `LayerViewportCollision`.
- **conf: NONE.**
- **Content:** one new zone array. Backward compatible — an absent `paths` is no paths.

---

## 7. The whitelist problem

A new zone-file key must land in **three** writers, and only the first fails loudly on its own:

1. **`backend/pkg/aura/world/zone.go`** — struct field + `json:` tag + `validate()` rule. `DisallowUnknownFields` means an untaught key **hard-fails boot**.
2. **`tools/tiled/extensions/aura-zone/aura-convert.js`** — `serializeZone` (the key, in **zone.go struct order**), the `LAYERS` array at `:25`, `zoneToModel`, `modelToZone`, `validateModel`; plus `aura-world-format.js` for the polyline shape mapping. Untaught → **dropped silently** on the next Tiled save.
3. **`frontend/src/features/zone-editor/logic/ZoneModel.ts`** — the `ZoneData` interface, `fromJSON`'s deep copy, **and an explicit named key in `getZoneAsJSON()`**. Untaught → **dropped silently** on the next in-game-editor save.

Plus `GroundTextureManager.getZoneData`'s `ZoneJSON` interface, the client's read-only fourth view, since the renderer reads `paths` through it.

Both writers must emit **byte-identical** output; that is `aura-convert.js`'s stated acceptance criterion, not a nicety.

---

## 8. Test strategy

**Go** — `world/zone_test.go`: a path parses; `< 2` points, non-positive `width` and an empty `profile` are each rejected **by index**; an absent `paths` is valid. New corridor tests: N segments → the expected bodies and layers; **a bridge clears exactly the covered run** (mutation-verified — delete the clearing and it must go red); a non-blocking path emits no bodies; the segment cap splits a long run.

**vitest** — `Paths.test.ts` for the pure half (unit→px conversion, degenerate inputs, width parsing). The `RegionPaint` generalization must leave every existing region test untouched.

**The pins** — `AuraTiledConvert.test.ts:704-870` completeness (red first, then green: every Go key survives both writers, and both writers emit the same key set), plus a Tiled open→Ctrl+S byte-stability `git diff --exit-code`.

⚑ **The two byte-stability tests are already red at HEAD on a fresh checkout** (they pin the PO's uncommitted `world.json` repair — CLAUDE.md, Known-inconclusive). Establish that baseline *before* starting, or the existing noise reads as a regression you caused.

⚑ **Assert the invariant, never the population** (`docs/feedback.md` 2026-09-05): no test may hardcode "the world has N paths".

**In-game** — a `paths` harness leg: walk into water and be stopped; walk onto the bridge and cross; confirm the full-screen map shows the same water the world does.

**Verification tail** — `go build ./...` · `go vet` · `go test -count=1 ./...` · `npm run typecheck` · `npm test` · `bash tools/tiled/verify.sh` · the harness leg. ⚑ `-content ../api` is **server-only**, and a stale `backend/aurad.exe` **shadows** the extensionless `aurad`.

---

## 9. Proposals adopted without a choice prompt (PO may veto any)

- **D2 — a separate `paths` array, not a widened `regions`.** Adding `width` to `regions` and treating points as a polyline when it is set was considered and rejected: it collides with the closed-polygon semantics `pointInPolygon` and the Tiled layer both depend on, and makes one array mean two things. A separate array costs one more entry in each of the three writers and nothing else.
- **D10 — `cap: 'round'`, `join: 'round'`** as the shipped stroke geometry. A butt cap reads as a river cut off with scissors. Cheap to flip; a look-sitting question.
- ⛑ **D11 — DELETED by D6 (PO, 2026-09-06), kept for the trail.** The first draft made the clearing rule LAST-WINS between paths: a third path authoring `blocksMovement: false`, later in the array than its river, cleared it. With bridges as props the rule has no ordering to state at all — props are a separate array, so *any* `crossesPaths` prop clears wherever it sits. ⭐ **What the PO's answer bought**: no ordering trap, no third `Bridge` profile, no path-vs-path geometry, and a bridge with real art and a real editor workflow on day one. The cost is one definition field and one conflict refusal.

---

## 10. ⚑ Landmines

- **L1 — `ZoneModel.getZoneAsJSON()` drops what it has never heard of.** Ship `paths` without teaching it and the first in-game-editor save deletes every path silently, with all tests green. It has eaten `spawn.level` once already and threatened `prop.scale`. All three writers are pinned since region-primitive C2, so this now goes red loudly — but *the pin does not make the third touch point optional, it makes forgetting it loud.*
- **L2 — the completeness pin goes red the moment `zone.go` grows the field**, before the converter is taught. That is correct behaviour. ⛔ Do not "fix" it by adding `paths` to `NOT_AUTHORED_IN_TILED`.
- **L3 — ⛔ a blocking path can seal the map.** `archive/plan-test-world.md` L4 recorded this for props (*"Blocking props can seal the map"*); a river spans the world by nature, so this primitive makes it far easier to do by accident. A boot-time reachability flood-fill from the starting spawns is the named remedy if authoring proves error-prone.
- **L4 — a mob patrol route authored across blocking water will push into the bank forever.** Mob steering is simple and has no repath. An authoring rule, and a cheap harness assertion.
- **L5 — the long-thin-rect broadphase cost** (§4.2 step 5). Measure before declaring C2 done: `loadbot -god`, boot `-dev`, read **p95, not snap/s**, and check `recovered_panics == 0` first — a panic makes a tick number read falsely *fast* ([[project-capacity-measurement-validity]]).
- **L6 — ⛔ a ground texture must never be an SVG.** `webpack.common.js:86` inlines every `.svg` as a base64 data URI **into the JS bundle**; rasters emit a separate file. JPG/PNG only.
- **L7 — ⛔ do not register path tiles in `GraphicsConfig.groundTextureTypes`.** `GroundTextureTypes.ts` preloads every entry through `Preloading`, which **blocks boot**. Load the active zone's set in `startRendering`, as C4 does.
- **L8 — a mask sprite must be IN the scene graph** to have a world transform; a detached mask silently masks *nothing* and the shape paints as a full opaque rectangle. And a fresh `RenderTexture`'s contents are **undefined, not blank** — clear explicitly to transparent.
- **L9 — ⛔ a `crossesPaths` prop authored `blocksMovement: true` is a bridge you cannot cross.** It clears the water, then walls the deck with its own body. Two individually legal authored values; refused at boot by index (§4.2). ⚑ The mirror case is silent and cannot be refused: a bridge prop placed *beside* the river clears nothing and simply looks wrong.
- **L10 — ⛔ `api/zones/` is a directory of ZONES**, and every `.json` in it is one. Any small data file about paths belongs beside its consumer, never there.

---

## 11. Open questions

1. ~~**Should bridges be PROPS rather than paths?**~~ **ANSWERED 2026-09-06 (PO) — D6: yes.** §4.2 is rewritten and D11 is deleted; C2 grows the bridge prop and its `crossesPaths` definition flag.
2. ~~**Do the 372 `Sand` blobs get re-authored as paths?**~~ **ANSWERED 2026-09-07 (PO) — yes.** Now **C4**, owed. Until it runs, roads exist twice in two idioms.
3. ~~**Should a path carry a stable id?**~~ **DEFERRED 2026-09-07 (PO)**, consistently with regions. The cost of adding it later is the cost of adding it now.
4. ~~**Does water need a shallow/deep distinction?**~~ **DEFERRED 2026-09-07 (PO): the one bool is the whole vocabulary.** A ford is `blocksMovement: false`; slow, damage and swim are each their own ruling, and §4.6 already forecloses them.

---

## 12. Chunk ledgers

### C1 + C2 — SHIPPED 2026-09-07

**What shipped.** The primitive end to end, and the collision with it.

- **`zone.Path`** (`world/zone.go`) — profile · points · width · blocksMovement — plus `validate()` naming the array index, and **2 points, not 3**.
- **`PathCorridors`** (`world/paths_collision.go`, new) — pure geometry, because `world` can import neither `model` nor `phy`; `prop.FromZone` is the same seam for the same reason. Returns `Corridor`, one form set at a time exactly like `PropBody`.
- **`crossesPaths`** on `PropDefinition` + `propDefinitionDoc` (D6), and the **conflict refusal** in `resolve()` — it needs the RESOLVED definition, so it cannot live in `validate()`.
- **The boot seam** — `cfg.GameConfig.PathCorridors` → `core.PathCorridors(…)` → registered beside the border wall in `game.go`, on `PlayerStatic|MobStatic` and ⭐ **deliberately not `Viewport`**.
- **Client** — `features/paths/logic/Paths.ts` (new, pure), `Path extends Region` so `regionPaintSpec`/`regionBlend` take it unchanged; `buildBlendMask` generalized to take a **silhouette callback**; `paintPaths` + **`paintTerrainSurfaces`**, the one entry point both draw sites now call; `layers.terrain.paths` between regions and textures.
- **All three writers + the client's fourth view** — `zone.go`, `aura-convert.js` (`LAYERS`, all four functions, the `AuraPath` class, a regenerated palette), `ZoneModel` (interface · `fromJSON` · **the `getZoneAsJSON` whitelist**), and `GroundTextureManager`'s `ZoneJSON`.
- Profiles **`Road`** and **`Water`**. ⚑ Their `blend` is 0.6/0.8, not the regions' uniform 1.5 — a band is measured in world units, so 1.5 on a 2.5-unit road is a soft edge wider than the road. All [PLACEHOLDER].

**⭐ The design changed mid-plan, and the reason is worth keeping.** The first draft made bridges a third PATH and cleared corridors by a last-wins rule between paths (D11). The PO ruled bridges are PROPS, which deleted D11 outright: props are a separate array, so *any* `crossesPaths` prop clears wherever it sits — no ordering trap, no third profile, no path-vs-path geometry, and the bridge gets real art and the existing editor workflow for one definition field.

**⚑ What the sampling does and does not do.** `clearStep` finds the gap a deck opens; it does **not** set body count — adjacent blocked samples merge back into one rect, so an unbridged 40-unit segment emits ONE. `maxCorridorSegment` then splits that for the broadphase, which inserts by bounding box.

**Schema impact: DB NONE · FlatBuffers NONE · conf NONE.** Content: one new zone array plus one optional prop-definition field, both absent-safe. **No shipped zone authors either**, so the feature is inert at HEAD.

**Verified:** `go build` · `go vet` · **`go test -count=1 ./...` EXIT 0** · `tsc --noEmit` · **vitest 597/597** (was 586; +11) · **`tools/tiled/verify.sh` all green**, including a byte-identical 263 581-byte `world.json` round-trip.

⭐ **The completeness pin did its job**: adding `paths` to `zone.go` turned it red on all three legs *before* either writer was taught, exactly as L2 says it should. It is green now because both writers emit the key and emit the same key set.

⭐ **The bridge clearing is mutation-verified**: stubbing `coveredByBridge` to `true` reddens all four bridge tests; restoring it greens them.

**⛔ NOT verified in-game, and deliberately so.** No shipped zone authors a path, so there is nothing to walk into: C1+C2 ship **dormant**. The in-game leg belongs with C4, which is what first puts a path in the world.

**Next: C4** (re-author the sand roads — a content judgement, PO-ruled 2026-09-07) and **C3** (animated water), which is ⛔ **blocked on art**: `Water` authors `texture: null` because there is no water tile in `features/regions/assets/ground`, and scrolling a flat colour is invisible. Building the `TilingSprite` machinery before the tile exists is YAGNI.

### C3 — SHIPPED 2026-09-07

**What shipped.** Water drifts. One new profile key, one new frame-loop line, and a refactor that made the three drawing cases one function.

- **`scroll: {x, y}`** on a profile (`Regions.ts` `Profile` · `parseScroll` · `DEFAULT_PROFILE` · **`regionScroll`**), in **world UNITS PER SECOND**. Absent or `{0,0}` = still. ⚑ Its OWN profile's vector, never a `resolve()` chain — the same rule `regionBlend` and `regionPaintSpec` obey, so a still pond drawn inside a flowing river cannot inherit the current.
- **`ScrollingSurface`** + **`advanceSurfaceScroll`** (`RegionPaint.ts`) — a `TilingSprite` over the mask footprint, and **two number writes per drifting surface per frame**. Nothing is rebuilt, no geometry touched, no texture re-uploaded: the tile offset is a uniform.
- **`paintTerrainSurfaces` now returns `PaintedSurfaces {masks, scrollers}`** instead of a bare `RenderTexture[]`. `Game` keeps both and **replaces** the scroller array on repaint; `MapTerrain` destructures `.masks` and **drops `.scrollers` deliberately** — it bakes one still frame, so a drifting river is a still river on the map.
- **`paintSurface`** — the three cases (still-hard · still-feathered · drifting) in one place, called by both `paintRegions` and `paintPaths`. That collapse is what makes a **region** able to drift too: a lake is a `Water` region and now animates with no extra code.
- **`Water` authors `{"x": 0.4, "y": 0.15}`**, [PLACEHOLDER] — at `scale: 0.35` one 750 px tile spans ~2.19 units, so the pattern repeats about every 5.5 s.

**⭐ The unblocking was the tile, and it already existed.** C1's ledger recorded C3 as blocked on art. `tools/make-water-tile.mjs` (committed `a94f7193`, with the C1 Tiled fix) removed that block, so the plan-doc note above is the *stale* line, not this one.

**⚑ Three traps, all now pinned in comments.** (1) The `paused` guard must come FIRST or the river jumps forward by the whole pause on resume. (2) `Game.regionScrollers` must be REPLACED on repaint, not appended — the previous pass's sprites are already destroyed. (3) `scroll` on a `texture: null` profile animates nothing on purpose: D14's fallback is a flat colour and a colour has no phase.

**Schema impact: DB NONE · FlatBuffers NONE · conf NONE · content NONE.** `profiles.json` is a client-side table (D12) that never reaches the server or the zone files, so `cp-defs` is not involved and no zone changed.

**Verified:** `tsc --noEmit` clean · **vitest 620/620** (was 602; +18) · `webpack --config webpack.prod.js` compiled (3 pre-existing size warnings only). **Mutation-verified twice**: rejecting the authored `{0,0}` in `parseScroll` reddens *"KEEPS an authored zero vector"*; returning the shared `DEFAULT_PROFILE.scroll` object reddens *"never hands back the shared default object"* and *"never borrows the drift"*.

**⛔ Not in-game-verified by me** — the PO has water authored in `world.json` and is looking at it. ⚑ The pixi half (`advanceSurfaceScroll`, the `TilingSprite` phase and wrap) is **untestable in vitest** by the same house split that leaves `buildBlendMask` untested: `RegionPaint.ts` reaches webpack's `require.context` at import. The pure half — parse, totality, the anti-aliasing of the shared default — is covered.
