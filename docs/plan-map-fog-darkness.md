# Plan: The Map Reveal Respects Darkness

> **Status: DESIGNED 2026-10-04, D1-D3 RULED (PO), D4-D6 RULED 2026-10-05, nothing built,
> 3 chunks, ready for C1.** The map reveals the full screen-sized box wherever you walk, lit or not,
> so a pitch-black cave is mapped in full. Wanted (PO): "a map or mini map should only reveal
> areas with darkness that we actually lit up sufficiently."
>
> ⚑ Line refs pinned to `6f7a29fb`.
>
> **Schema: DB NONE · wire NONE · conf NONE · content: the atmosphere profiles move to
> `api/atmospheres/profiles.json` (+1 content dir), prop definitions gain `lightFraction`.**

---

## 1. What exists

- **Two writers stamp the same box, and neither knows about darkness.**
  - Server: `mapfog.Fog.MarkAt` (`backend/pkg/aura/mapfog/mapfog.go:95`) sets every 2 u cell
    the AOI overlaps (11 × 7 cells ≈ 22 × 14 u), gated on entering a new cell (D5 of the
    archived `plan-map-fog-persistence.md`). This is the persisted copy, published only on
    entering the world (`sys/state.go:420 publishMapFog`).
  - Client: `MapFog.revealAt` (`frontend/src/features/map/logic/MapFog.ts:116`) stamps a
    20 × 12 rectangle on a 1 u gate, called from `MiniMap.update` (`MiniMap.ts:1064-1073`).
    This is the live copy.
- **Darkness is client-only.** `DarknessOverlay.ts` builds it from `darkAreas` circles,
  atmospheres whose profile declares `darkness` (`frontend/src/client-data/atmosphere-profiles.json`),
  clearings, static lights (campfire bind points, `Torch` props at 0.3 × the campfire radius)
  and the wire `light_radius`. The server parses `darkAreas` and `clearings` but never reads
  them, and `world/place.go:52` deliberately leaves them un-offset for that reason.
- **The server already knows the light.** `SkillComponent.LightRadius()`
  (`skills/component.go:743`) is the max over the active aura and the passives, the value the
  wire streams.
- **Point-in-polygon already exists in Go:** `world.PointInPolygon` (`world/point_in_polygon.go:30`).
  Atmospheres are already offset into world coordinates (area-effects E2).

---

## 2. Decisions

- **D1 · Whose light counts: your own + static lights. RULED.** Your own `LightRadius()`, plus
  the fixed campfire and torch pockets. Not other players' lanterns, not light-emitting mobs
  (that would need a re-check every time a nearby light moves, not only when you enter a cell).
- **D2 · "Lit sufficiently" = a light radius of at least 2.5 u. RULED** (value [PLACEHOLDER];
  ⭐ lowered from 3 u by the PO 2026-10-05 so the Torch passive maps from its first level).
  Below that, your own light reveals nothing inside darkness. The Torch (2.5 u at level 1) maps
  a narrow trail, the Lantern (4 u) a wider one; the bare sight floor (0.33 u) maps nothing.
  Static lights are not gated
  (the campfire is 7 u, a torch ~2.1 u: a torch pocket is mapped because you can see it).
- **D3 · Reveals stored under the old rule stay. RULED.** No scrub, no migration. Only new
  exploration follows the rule.
- **D4 · Inside darkness a cell is revealed WHOLE when its CENTRE is lit. RULED 2026-10-05.**
  Rejected: any-overlap (a Lantern maps ~21 cells, up to ~2.8 u past the light), fully-inside
  (a 3 u light maps one cell), smaller cells (resets every stored reveal, against D3).
  The reveal is already blocky: 2 u cells (`mapfog.CellSize`, [PLACEHOLDER]); the restored
  map is drawn cell by cell. So a lit circle maps as a stepped disc, not a smooth one, and a
  block's corner can show up to ~1.4 u of ground that stayed dark on screen. This errs toward
  revealing, as the persistence plan's D4 does. Finer edges mean a smaller `CellSize`, which
  resets every stored reveal (that plan's D10); not proposed.
- **D5 · "Complete darkness" is what the rule applies to. RULED 2026-10-05.** A point is
  completely dark when EITHER:
  - it is inside a `darkArea` circle's **authored radius** (drawn fully black; the 2 u
    `EDGE_FADE` ring outside it is not dark, the same line `isHidden` uses), OR
  - the **stacked** darkness of every atmosphere there that declares `darkness`,
    `1 − Π(1 − dᵢ)`, is **≥ 1.0** (`DarkRevealThreshold`, [PLACEHOLDER]): today `Cave Air`
    and `Darkness`;

  AND no `darkness` / `both` clearing covers it. Partly dark air stays mapped like daylight,
  because the ground shows through it: `Gloom` 0.55, `Canopy` 0.35, `Storm Sky` 0.28. The shape
  test is the polygon itself, not its `blend` band (as `inDarkness` does). Lowering the
  threshold to 0.5 to include Gloom later is a one-number change.

  ⭐ **Stacked, NOT last-declaring-wins (PO 2026-10-05).** The painter stacks overlapping
  atmospheres (each is its own alpha group, `RegionPaint.paintAtmospheres`), so 1.0 under a
  later 0.5 draws black in either order, while `resolveIn` would answer 0.5 and map it. The
  map follows the screen: 1.0 + 0.5 → dark in either order; 0.5 + 0.5 → 0.75, not dark. At a
  1.0 threshold this equals "any covering atmosphere is ≥ 1.0"; stacking keeps it true if the
  threshold drops. ⚑ The client's `inDarkness` (nameplate hiding) still uses
  last-declaring-wins, so a later `darkness: 0` atmosphere over a black one shows nameplates
  in visible black. Pre-existing, out of scope here.
- **D6 · The server decides, and the client only draws what the server marked. RULED 2026-10-05.**
  The archived persistence plan's D1 already makes the server the owner of the reveal. If the
  client kept its own box, or its own port of the rule, the live map and the restored map would
  disagree, which is this bug in another shape. So the client's own reveal is deleted and the
  server pushes the chunks a mark changed.

### 2.1 How much smaller the reveal gets in darkness

The 2 u cell is the bit size, not the reveal box. Today one mark is the whole screen; in
darkness the box is replaced by the light circle (counts for a player standing at a cell centre):

| light | cells per mark | area vs. today's box (22 × 14 u) |
| --- | --- | --- |
| no light / sight floor 0.33 u | 0 (below D2's gate) | nothing |
| Torch level 1, 2.5 u (the gate) | 5 | ~6 % |
| 3 u | 9 | ~12 % |
| Lantern 4 u | 13 | ~17 % |
| campfire 7 u (static) | ~37 | ~48 % |

Walking with a Lantern maps a corridor about 8 u wide along your route; the rest of the dark
screen stays black, which is what you actually saw. Outside darkness nothing changes.

---

## 3. The rule

Per cell of the AOI box, judged at the cell centre:

1. not completely dark (D5) → reveal (today's behaviour);
2. dark, but inside a static light → reveal;
3. dark, within your light circle, and your radius ≥ 2.5 u (D2) → reveal;
4. otherwise it stays hidden.

It lives in one place, Go `mapfog`. `sight` is not read: the floor (0.33 u) is far below the
gate, and no shipped dark profile authors more than 0.5.

---

## 4. Chunks

### C1 · The server knows darkness

- **Move `frontend/src/client-data/atmosphere-profiles.json` → `api/atmospheres/profiles.json`**
  (one source). Add the directory to `contentSources` (`cmd/aurad/loaders.go`) and to cp-defs.
  The client `require`s it from `api/`, the way `DarknessOverlay.ts:69` already reads
  `campfire-aura.json`. The server parses only `darkness` per profile name; an unknown profile
  name still never fails a boot (the D8 posture of `plan-region-primitive.md`).
- `world/place.go`: offset **DarkAreas and Clearings** too, by its own rule ("what the server
  reads gets offset"). Update the `place_test.go:63` expectation that dark areas stay un-offset.
- Torch radius: move `TORCH_LIGHT_FRACTION` (`DarknessOverlay.ts:83`) to one spot both sides
  read (a key in the moved profiles file, or on the `Torch` prop definition), never a Go copy.
- New `mapfog.DarkMask`, baked once at boot from the placed zones on the fog's own chunk grid
  (`locate` / `chunkOf` reused): two bitmaps, `dark` and `staticLit`, only for chunks a dark
  shape touches. A world with no darkness costs nothing.

### C2 · Marking obeys the rule

- `Fog.MarkAt(pos, light, mask)` applies §3 per cell.
- The gate widens from "entered a new cell" to "entered a new cell **or** the light radius
  changed", so lighting a Lantern while standing in a cave maps it at once.
- `trackMapFog` (`sys/state.go:355`) passes `p.LightRadius()` and the mask.
- `Fog` records which chunks a mark changed (a dirty set).

### C3 · The live map comes from the server (D6)

- `trackMapFog`: when a mark set new bits, `p.NoteMapFog(fog.TakeDirty())`, i.e. only the
  touched chunks, usually one. **Wire NONE**: the existing `MapFog` table and the client's
  union merge (`FogReveal.mergeMapFog`) already accept a partial publication.
- Client: delete `MapFog.revealAt` and its call in `MiniMap.update`. `applyRevealed` paints
  **only the incoming chunks** (a chunk-bounded variant of `zoneCellMask`), not the whole
  merged zone, or every delta re-uploads a zone-sized canvas.
- Cost to measure: ≤ 512 B per touched chunk, roughly every 2 u walked, owner only. If that
  proves heavy, a compact per-mark table is the fallback (a wire change, not proposed now).
- Side effect: the live reveal becomes 2 u-blocky like the restored one (live is 1 u today).

---

## 5. Tests (TDD: `mapfog`, `sys`, `world`, vitest)

- An unlit dark cell stays hidden; a cell inside a ≥ 2.5 u own light is revealed; a 2 u light
  reveals nothing dark; a cell whose centre is just outside the circle stays hidden.
- A campfire pocket is revealed with no own light; a clearing inside darkness is revealed.
- `Gloom` and `Canopy` do not gate; the `darkArea` fade ring does not gate.
- Overlap (D5): 1.0 + a later 0.5 gates in either authored order; 0.5 + 0.5 does not.
- A `darkArea` in a zone placed away from {0,0} gates at its world position.
- Gate: same cell, light 0 → 4 re-marks; same cell, same light does not.
- `TakeDirty` returns only the touched chunks, then empties.
- vitest: the chunk-bounded mask paints only its chunks' cells; the profiles still load from
  the new path.
- Derive bounds from the registry; never hardcode an anchor.

## 6. Verification

- `go build ./...`; `go test -count=1 ./pkg/aura/mapfog/... ./pkg/aura/sys/... ./pkg/aura/world/...`;
  `-validate` for both zone sets; `npm test`; `npm run typecheck`. cp-defs by hand (no `make`
  on the Windows box).
- In game (`scripts/dev-restart-windows.sh`; the debug zones have dark caves): walk a cave with
  no light → the map stays black there; light a Lantern → its circle maps; a campfire pocket
  maps; relog → the restored map equals the live one.

---

## 7. Ledger

### C1-C3 · built + committed 2026-10-05, one session (PO asked for all three chunks at once; gate lowered to 2.5 u before the commit, both harnesses re-run 10/10)

**Built.**
- **C1.** `frontend/src/client-data/atmosphere-profiles.json` → `api/atmospheres/profiles.json`
  (`git mv`); every reader repointed (Regions.ts + test, generate-palette, make-precipitation-tiles,
  the a4/a5 harnesses, aura-convert's messages + their test). New content dir `atmospheres`
  (embed package, `contentSources`, cp-defs, `validate_test`'s list, a loadContent stage);
  `world.LoadAtmosphereDarkness` reads ONLY each profile's `darkness`. `world.Place` now offsets
  `DarkAreas` and `Clearings` (two placement tests flipped: clearings ARE placed now).
  ⭐ **Torch radius:** `TORCH_LIGHT_FRACTION` became a prop-definition key, `lightFraction`
  (Torch 0.3); the client's `DarknessOverlay` and the server's mask both read it, so ANY prop
  type authoring it now casts a static light (the old code matched the name `Torch`). The
  client reads it through its own `require.context`, not `Props.propDefinition`: Props →
  _GameObject → DarknessOverlay would be an import cycle. `mapfog.DarkMask` +
  `mapfog.DarkWorldOf` bake one `hidden` bitmap (completely dark AND no static light) per
  touched chunk at boot; the campfire radius comes from the `CampfireAura` skill
  (`cmd/aurad/map_fog_dark.go`). Boot logs `🌑 map reveal darkness baked`: 891 cells on the main
  world, 1203 on the debug world.
- **C2.** `Fog.MarkAt(pos, light, mask)` applies §3 per cell; the gate re-marks on a new cell OR a
  changed light; `set` records a dirty set of chunks that got a NEW bit; `TakeDirty`.
- **C3.** `trackMapFog` publishes `TakeDirty()` APPENDED to whatever the tick already carries (a
  join publishes the whole reveal earlier in the same tick). Client: `MapFog.revealAt`, its stamp
  and its call in `MiniMap.update` deleted; `setMapFog` paints only the incoming publication;
  `zoneCellMask` is bounded by the publication's chunks as well as the zone. The live map is now
  2 u-blocky like the restored one.

**Verified.** `go build` · `go test -count=1 ./...` green bar the known
`TestPropContent_C1bMigrationPreservesLookAndCollision` · `-validate` 0 findings ×3 (main
`-content`, debug, embedded) · vitest 1529/0 + typecheck · new harness
`.claude/skills/verify/d-map-fog-darkness.mjs` **10/10** on the debug zones (unlit cave black, spawn
control mapped, campfire pocket mapped with no own light and dark ground past it black, Lantern
maps its cell and not a dark cell 7 u off, relog restores exactly the live map, 0 console errors)
· `f2-map-fog-persistence.mjs` **10/10** on the main world (its hardcoded start fire, stale since
the map rebuild, now derived from `world.json`) · `generate-palette.mjs` regenerates byte-identical.

**Owed.**
- ⭐ **PO look in game**, desktop and phone: walk a cave with and without a Lantern, open the map.
- ⚑ **Wire cost unmeasured** (§4 C3: ≤ 512 B per touched chunk, about every 2 u walked, owner only).
- ⚑ `DarknessOverlay.inDarkness` still answers last-declaring-wins (D5's note); out of scope.
