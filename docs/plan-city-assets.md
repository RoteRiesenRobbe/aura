# Plan: City Assets: a prop kit for Dionsburg, district by district

**Status: DESIGNED 2026-10-22 (planning session, PO in chat). R1-R8 RULED, D1-D8 PROPOSED.
K1-K4 BUILT 2026-10-22, K5 2026-10-23 (§11); next K6. Heavy checks + the PO look once after K6 (R8).** No open PO calls (§7). Six chunks (§5).

**Owns:** the city's prop definitions, their placeholder SVGs and the city's artist-tracker rows.
**Builds on:** `plan-roof-props.md` (roof reveal, the `roof` key), `plan-prop-placeholders.md`
(the labelled `PropPlaceholder` box), `plan-zone-polygons.md` (`structures`), the `City` and
`Wall` terrain profiles. **Amends:** nothing. **Not in scope:** laying out the city itself in
Tiled (PO authoring work, as for the release map), NPCs and quests.
**Schema (as designed):** DB none · wire +1 `EntityType` per SVG hero (16 total, K1 +3) ·
conf none · content 67 new `api/props/*.json` · zone format none · lang none.

⚑ Line references pinned 2026-10-22 at `5ded547b` (main); re-verify before relying on them.

---

## 1. What this is

Dionsburg (`content-world.md`, the hub with three entrances) exists as a region of `world.json`,
painted with the `City` profile and `Cobblestone` streets, but has no city props. Every prop
today is a farm, coast or forest piece. The PO asked for:

- a market stall, whose awning uses the roof fade;
- a lazaret and slum tents;
- a library;
- a large central cathedral and its interior;
- a cemetery;
- a dwarf-led military district with military and jail pieces;
- a large central fountain;
- an elf-led mage district;
- a gnome-led craft district.

### 1.1 What already exists and is reused

- **Roof reveal** (`plan-roof-props.md`, built 2026-10-10, no shipped consumer yet). The
  prop definition authors `"roof": {"revealAlpha": a}` together with `"blocksMovement": false`.
  - The client fades it to `a` while the local player stands under it
    (`frontend/src/features/game-objects/logic/RoofReveal.ts:39`).
  - Touching roof pieces fade together, because `:90` flood-fills them.
  - Circle bodies are handled (`:47`).
  - The boot refuses a blocking roof (`backend/pkg/aura/world/props.go:351-361`), a roof
    in `underfoot`, and a placement that overrides it to blocking (`zone.go:1532-1543`).
  - Every definition sharing an entityType must agree on `roof` (`props.go:222`), except
    `PropPlaceholder`.
  - Manual: `manual-content-authoring.md:375-385`.
- **`PropPlaceholder`** is a labelled box sized by the definition's body. It is JSON only,
  with no wire change, because the name rides the wire (`Props.ts:375-395`). It honours
  `roof` by name (`Props.ts:389`).
- **Prop lights** are keyed by the placement's `type`, i.e. the prop name
  (`DarknessOverlay.ts:377`), so a placeholder that authors `lightFraction` lights too. They
  only show in dark areas.
- **`structures`** are filled polygons with a ground profile and outline. The `Wall` profile
  (`terrain-profiles.json:54`) already exists for stone shells.
- **Reused props:** Crate, Cart, Tombstone, Bedroll, Torch and Well.
- **Art conventions:**
  - `docs/art/README.md`: top-down, gritty, 120 px/m.
  - The `house.svg` style: true top-down, mostly roof, lit from the top-left, shadow baked
    down-right.
  - Non-square art uses `preserveAspectRatio="none"` with the body's aspect in its `viewBox`.

## 2. PO rulings (2026-10-22)

- **R1 - Hybrid fidelity: hero pieces get a hand-drawn SVG placeholder, the rest is a labelled
  `PropPlaceholder` box.** The heroes set the look; the boxes let the city be blocked out now.
  The artist replaces both later.
- **R2 - Plan doc first, then one district per execution session.**
- **R3 - Building shells are `structures` polygons** (the `Wall` profile, door gaps), not a
  wall-prop kit. Any floor plan works and no new entityType is needed for walls.
- **R4 - Big roofs are touching pieces** (nave + transept + apse), not one sprite. Each
  texture stays under 4096 px, and the pieces are reusable.
- **R5 - District palettes as proposed:**
  - Dwarven: dark stone, iron, red banners; + brass rivets and the clan's anvil sigil
    (PO 2026-10-23, K5).
  - Elven: pale stone, silver, sage green, violet glow.
  - Gnome: brass, copper, gears, soot.
  - Slums: patched brown cloth.
  - Lazaret: white with red cross bands.
  - Market: striped awnings.
  - Cathedral: grey slate with gold accents.
- **R6 - Order: K1 market + fountain, K2 cathedral + cemetery, K3 lazaret + slums, K4
  library + elven, K5 dwarven military + jail, K6 gnome craft.**
- **R7 - The city's internal id is `city-hub`, with no place name in it.** Before this it
  was `brunnstedt`, the city's old name, while players already saw "Dionsburg".
  - Renamed: the area id, the region id, the `region.city-hub.*` lang keys (en + de), and
    the dialogue sheet's label table.
  - No saved state names it: the map fog is stored in world coordinates (migration
    000003), and no quest reaches the region.
  - Schema: DB none · wire none · content: one area/region id + 2 lang keys.
- **R8 - Heavy checks once, at the end (PO 2026-10-22, after K1).** K2-K6 run only the
  cheap per-chunk tail (§6); in-game probes, harnesses, screenshots and the full Go suite
  run once after K6, over all six districts. The chunk order and contents stay as planned.

## 3. Design

### D1 - A building = shell + roof + interior [proposed]
A building has three layers:
- a `structures` polygon for its walls (`Wall` profile), with a door gap;
- one or more non-blocking `roof` props on top, in the `buildings` sub-layer;
- interior props in `default`.

Walking in through the door fades the roof and shows the interior. This is the pattern
`manual-content-authoring.md:384` already describes. The tents and the market stall are the
small form of it: a roof prop over a solid piece (counter, cot) or a non-blocking one (bedroll).

### D2 - Roof alpha [proposed]
Every roof uses `revealAlpha` 0.25 [PLACEHOLDER], so the building's outline stays readable
while you are inside it. Exception: tents and the stall use 0.3 [PLACEHOLDER], because the
cloth is small and fading it out completely makes it vanish.

### D3 - One entityType per SVG hero; placeholders share `PropPlaceholder` [proposed]
Each hero follows the manual's new-entityType steps (§4). Each placeholder is one JSON file.
When the artist's PNG lands, the placeholder file switches entityType (with its own wire
value) and nothing else.

### D4 - Naming [proposed]
- File: kebab-case (`market-stall-roof.json`).
- Name and entityType: PascalCase (`MarketStallRoof`).
- SVG: camelCase (`marketStallRoof.svg`).
- Roofs end in `Roof`.
- District nouns stay generic (`Workbench`, not `GnomeWorkbench`), unless the look is the
  district's (`ElvenPlanter`).

### D5 - Lights only where the fiction burns or glows [proposed]
Only these props author a light: LampPost, CandleStand, Brazier, Forge, CrystalPylon and
ArcaneCircle. All values are [PLACEHOLDER]. The lights only show in dark areas (day/night is
OFF), so in a lit city they are inert until a district is authored dark.

### D6 - Blocking
A prop blocks by default. Non-blocking means you walk over it or under it: roofs, rugs,
mounds, chains, rubbish and the arcane circle. Doors and gates can be overridden per
placement (`blocksMovement` in Tiled).

### D7 - The prop list
All sizes are metres, all [PLACEHOLDER]. In the Kind column, S = SVG hero (new entityType)
and P = PropPlaceholder. In the Body column, `r` = radius and `cf` = collisionFactor. In the
Flags column, R = roof, nb = non-blocking, L = light.

**K1 - Market + fountain**

| Prop | Kind | Body | Flags |
|---|---|---|---|
| MarketStallRoof | S | 3×2.4 | R 0.3 (striped awning) |
| MarketCounter | S | 2.6×0.8 | sits under the awning |
| CentralFountain | S | r 3, cf 0.9 | |
| Barrel | P | r 0.4 | |
| SackPile | P | 1×0.8 | |
| ProduceBasket | P | r 0.35 | |
| Bench | P | 1.8×0.5 | |
| LampPost | P | r 0.2 | L 0.25 `#ffd890` |

**K2 - Cathedral + cemetery**

| Prop | Kind | Body | Flags |
|---|---|---|---|
| CathedralNaveRoof | S | 10×24 | R 0.25 |
| Pew | S | 3×0.6 | |
| Altar | S | 2.4×1.2 | |
| Mausoleum | S | 4×3 | |
| CathedralTranseptRoof | P | 24×8 | R 0.25 |
| CathedralApseRoof | P | r 5 | R 0.25 |
| BellTower | P | 5×5 | solid tower, not a roof |
| Pillar | P | r 0.5 | |
| CandleStand | P | r 0.3 | L 0.2 `#ffcf80` flicker |
| Font | P | r 0.7 | |
| Organ | P | 3×1.5 | |
| Confessional | P | 2×1.5 | |
| GraveMound | P | 1×2 | nb |
| OpenGrave | P | 1×2 | |
| IronFence | P | 2.4×0.3 | |
| CemeteryGate | P | 3×0.5 | nb |
| AngelStatue | P | r 0.6 | |

**K3 - Lazaret + slums**

| Prop | Kind | Body | Flags |
|---|---|---|---|
| LazaretTent | S | 6×4 | R 0.3 |
| SlumTent | S | 2.4×2 | R 0.3 (Bedroll beneath) |
| Cot | P | 0.8×1.9 | |
| BandageTable | P | 1.6×0.8 | |
| Screen | P | 1.6×0.2 | |
| LeanTo | S (drawn after K3, PO) | 2.4×1.6 | R 0.3 |
| RubbishHeap | P | r 0.8 | nb |
| Brazier | P | r 0.4 | L 0.3 `#ffa050` flicker |

**K4 - Library + elven mage district**

| Prop | Kind | Body | Flags |
|---|---|---|---|
| Bookshelf | S | 2.4×0.6 | |
| MageTowerRoof | S | r 4 | R 0.25 |
| CrystalPylon | S | r 0.5 | L 0.35 `#b7a6ff` |
| LibraryRoof | S (drawn at K4, PO) | 8×6 | R 0.25 (pieces) |
| ReadingDesk | P | 1.8×1 | |
| Lectern | P | r 0.4 | |
| ScrollRack | P | 1.6×0.5 | |
| BookPile | P | r 0.35 | nb |
| ArcaneCircle | P | r 2 | nb, L 0.3 `#b7a6ff` |
| AlchemyTable | P | 2×1 | |
| Orrery | P | r 1 | |
| MoonPool | P | r 1.8 | |
| ElvenPlanter | P | 2×0.8 | |

**K5 - Dwarven military + jail**

| Prop | Kind | Body | Flags |
|---|---|---|---|
| TrainingDummy | S | r 0.45 | |
| JailBars | S | 2.4×0.3 | |
| BarracksRoof | S (drawn at K5, PO) | 8×6 | R 0.25 (pieces) |
| WeaponRack | P | 2×0.5 | |
| ArmorStand | P | r 0.4 | |
| Bunk | P | 1×2 | |
| Banner | P | r 0.25 | |
| Watchtower | S (drawn at K5, PO) | 4×4 | solid tower, not a roof |
| CellDoor | P | 1.2×0.3 | blocks; override per placement |
| Stocks | P | 2×0.6 | |
| Chains | P | r 0.4 | nb |
| GuardDesk | P | 1.8×0.9 | |

**K6 - Gnome craft district**

| Prop | Kind | Body | Flags |
|---|---|---|---|
| Workbench | S | 2.2×1 | |
| GearContraption | S | 2.4×2.4 | |
| WorkshopRoof | P | 6×5 | R 0.25 (pieces) |
| Forge | P | 2×1.6 | L 0.35 `#ff9040` flicker |
| Anvil | P | 0.9×0.5 | |
| Crane | P | 3×3 | |
| LumberStack | P | 2.4×1 | |
| SteamBoiler | P | r 1 | |
| ToolRack | P | 1.8×0.4 | |

In total: 16 SVG heroes and 51 placeholders (67 prop files).

### D8 - Tracker rows land with their chunk [proposed]
Each chunk adds its props to `docs/art/assets.csv` (state `placeholder`, with the district's
R5 palette in `notes`), regenerates `assets.md` (`node tools/asset-tracker.mjs`), and adds a
city section to `prop-worklist.md`. Rows describe files that exist, so they are not
pre-filled here.

## 4. What changes for the author

- **Placing a building in Tiled:**
  1. Draw a `structures` polygon (`Wall` profile) with a door gap in the `paths` layer.
  2. Drag the roof template(s) from `tools/tiled/palette/templates/props/` into
     `props › buildings`, flush with each other.
  3. Put the interior into `props › default`.
- **Drag from Templates, never the tileset** ([[project-tiled-drop-size]]).
- **Rect bodies never rotate** (`manual-content-authoring.md:331`), so a north-south nave and
  an east-west one are two definitions (swapped width and height). Build the city on the grid.

**Per chunk (the execution recipe):**
- **SVG hero:**
  1. Append the entityType at the END of `EntityType` in `api/schema/server.fbs`, then run
     `api/schema/make.bat`.
  2. Add the SVG to `frontend/src/features/game-objects/assets/resources/`.
  3. Add the prop JSON.
  4. Add a `gameObjectClasses` line in
     `frontend/src/features/backend/logic/messages/incoming/GameStateMessage.ts` (beside
     `:830`).
- **Placeholder:** the JSON only, with `"entityType": "PropPlaceholder", "sprite":
  "propPlaceholder.svg"`.
- **After either:**
  - With the zone closed in Tiled, run `node tools/tiled/generate-palette.mjs`, then
    `bash tools/tiled/verify.sh`.
  - Run cp-defs by hand (find + cp; [[project-no-make-on-windows-box]]).
  - Clear the webpack cache after an fbs regen ([[project-webpack-cache-stale-bindings]]).
  - Run `npm run build`.

## 5. Chunks

Each chunk takes one session, can ship on its own, and needs only K1's style reference before
it.

| # | Chunk | Contents | Size | Schema |
|---|---|---|---|---|
| K1 | Market + fountain | 3 SVG + 5 PH (D7). The first real `roof` consumer; the SVGs set the city's drawing style. | M | wire +3 EntityType · content +8 |
| K2 | Cathedral + cemetery | 4 SVG + 13 PH. Roof pieces flood-fill as one building. | M | wire +4 · content +17 |
| K3 | Lazaret + slums | 2 SVG + 6 PH | S | wire +2 · content +8 |
| K4 | Library + elven | 3 SVG + 10 PH (built: 4 + 9, LibraryRoof drawn). The first circle roof (MageTowerRoof). | M | wire +3 (built +4) · content +13 |
| K5 | Dwarven military + jail | 2 SVG + 10 PH (built: 4 + 8, BarracksRoof + Watchtower drawn) | S | wire +2 (built +4) · content +12 |
| K6 | Gnome craft | 2 SVG + 7 PH | S | wire +2 · content +9 |

**Per chunk (R8):** only the cheap tail in §6 (validate, `world` Go tests, vitest +
typecheck, palette + `verify.sh`, cp-defs, `npm run build`). No in-game probe, harness,
screenshots or full Go suite until K6.

**In-game (PO), ONCE after K6, over all six districts.** Place one of each prop in a scratch
spot of the debug world (`-debug-zones`), never in `world.json`, then check:
- each SVG reads at play zoom and sits at the right aspect;
- placeholders show their names;
- walking under a roof fades it to its alpha, and its touching pieces fade with it;
- solid props block, and nb props let you walk over them;
- a light shows in a dark spot (debug caves; FX and light draw BELOW darkness, so check
  both).

Revert the scratch placements afterwards. K1 additionally checks a stall built as awning plus
counter, walked under from all four sides (done headless at K1, §11; the PO look is still
owed and joins the final pass).

## 6. Test strategy

Per R8, the first five bullets run every chunk; the last two run once, after K6.

- **Go:** no new code. `go -C backend test -count=1 ./pkg/aura/world/...` covers prop load,
  the roof refusals and roof agreement for the new files. `aurad -validate -content ../api` is
  clean, and the boot log's prop count grows by the chunk's count.
- **vitest:** `npm --prefix frontend test` (RoofReveal, Props, any EntityType→class
  completeness pin) and `npm --prefix frontend run typecheck`.
- **Tiled:** `bash tools/tiled/verify.sh` is green.
- **Build:** cp-defs by hand, then `npm --prefix frontend run build` (L3: unlabelled boxes
  otherwise; clear the webpack cache first after an fbs regen, L2).
- **After K6 only:** the full Go suite (`go -C backend test -count=1 ./...`, report the reds
  against the known list), `hygiene-wire-prune` for the EntityType additions, and the §5
  in-game look. A `verify` leg stays optional; the PO's look is the gate (R1).

## 7. Open PO calls

- ~~**Q1 - Rename the internal id `brunnstedt`?**~~ **RULED 2026-10-22: R7.** The id is
  now `city-hub` and carries no place name; the title "Dionsburg" lives only in the lang
  files. Done in the planning session, outside any chunk.

## 8. Landmines

- **L1** `EntityType` is append-only and streamed; a mid-enum insert shifts every later prop
  on the wire. Append at the end, regenerate both bindings.
- **L2** After an fbs regen, webpack can compile the OLD enum while tsc is clean. Clear
  `frontend/node_modules/.cache/webpack` ([[project-webpack-cache-stale-bindings]]).
- **L3** `-content ../api` is SERVER-only. `Props.ts` compiles prop defs in at webpack build
  time, so a new placeholder renders unlabelled until `npm run build`
  (`plan-prop-placeholders.md` §10).
- **L4** Never regenerate the palette while the zone is open in Tiled: a changed body writes a
  `scale` onto every open placement.
- **L5** Without cp-defs, `go test` and plain `-validate` read stale embedded JSON
  ([[project-no-make-on-windows-box]]).
- **L6** A prop is baked at body × 120 px. Keep every side ≤ 34 m (4096 px) and split anything
  bigger (R4).
- **L7** A stale `backend/aurad.exe` shadows the freshly built `aurad` (Windows PATHEXT;
  `verify` skill).
- **L8** Known looks, not bugs (`plan-roof-props.md` §4): name plates show through roofs, and
  the world map draws roofs opaque.

## 9. Schema impact

- **DB:** NONE.
- **Wire:** +16 `EntityType` values across K1-K6, appended. No new fields.
- **Conf:** NONE.
- **Content:** 67 new `api/props/*.json`.
- **Zone format:** NONE.
- **Lang:** NONE (prop names are not player-facing text; a placeholder's label is a dev
  look).
- **Tiled palette:** regenerated per chunk.

## 10. Cross-references

`plan-roof-props.md`, `plan-prop-placeholders.md`, `manual-content-authoring.md` §1b,
`manual-tiled-editor.md` §3, `docs/art/README.md`, `docs/art/prop-worklist.md`,
`content-world.md` (Dionsburg).

## 11. Chunk ledgers

### K1 - BUILT 2026-10-22, PO look owed `6e29ef99` (market + fountain)

- **Wire:** `EntityType` +`MarketStallRoof` = 124, `MarketCounter` = 125,
  `CentralFountain` = 126, appended (L1). TS binding via
  `flatc_Windows_v24_3_25.exe --ts --gen-all` (diffed in a scratch dir first:
  only those three lines move), Go via `go generate` in `backend/pkg/api`.
  One `gameObjectClasses` line each (`Props.genericPropClasses`); no render class.
- **Art (R1, the city's style reference):** `marketStallRoof.svg` (300×240: one
  pitch, pole at the back/north, ten muted red and bleached-cream stripes down
  the slope, scalloped valance at the front/south, a sewn patch; nothing past
  the canvas), `marketCounter.svg` (260×80: plank top, two produce baskets, a
  cloth bundle, scales), `centralFountain.svg` (100×100: pale stone basin, wide
  water ring with ripples, an upper bowl on a pedestal, the spout). House-style
  light from the top-left, shadow baked down-right; ids prefixed (`stallCanvas`).
- **Content (+8, D7 numbers, all [PLACEHOLDER]):** the three heroes, plus the
  first SHIPPED `PropPlaceholder` defs: `Barrel`, `SackPile`, `ProduceBasket`,
  `Bench`, `LampPost` (`lightFraction` 0.25, `#ffd890`, no flicker). The awning is
  the first shipped `roof` consumer (`revealAlpha` 0.3, `blocksMovement: false`).
- **Palette:** regenerated with Tiled closed (L4). ⚑ Every existing prop
  template's `gid` shifts, because the tileset is alphabetical and 8 names
  joined it; the converter reads names, not gids, so nothing placed moves.
  `verify.sh` all green.
- **Tracker (D8):** 8 `assets.csv` rows (subcategory "Props — city: market",
  zone Dionsburg, state `placeholder`; the 5 boxes have no `current_file`),
  `assets.md` regenerated (248 rows), `prop-worklist.md` §C "City props -
  Dionsburg" / C1 + the priority roll-up; the Torch line no longer says
  "the only prop that emits light".
- **In game (headless probe, debug world, scratch placements):** the three
  heroes draw at their body aspect (360×288, 312×96, 720×720); every box
  carries its name; the awning goes 1 → 0.3 walked in from N, E and W, and the
  counter stops a walk from the south outside it (alpha stays 1: the counter is
  the stall's front by design); the LampPosts light a dark patch of the debug
  world. ⚑ The probe's first run was cut by an outside server restart onto the
  main zones; rerun on a fresh `-debug-zones` boot.
- **Scratch placements** (9: the stall at (44, -3) with its counter at
  (44, -2.25), the fountain at (34, -13), the boxes around the stall, LampPosts
  at (46.5, -5) and (43, -8)) are in `api/zones/.debug/world_debug.json`,
  UNCOMMITTED, for the PO look; `git checkout -- api/zones/.debug/world_debug.json`
  reverts them (§5).
- **Verified:** `go build ./...` · `go test -count=1 ./pkg/aura/world/...` red
  ONLY on `TestPropContent_C1bMigrationPreservesLookAndCollision` (Tree/Boulder),
  red at HEAD too (proved in a HEAD worktree; a known-inconclusive in the verify
  skill) · full Go suite: the 3 known reds only (that one,
  `TestPassages_EveryDoorCarriesItsWords`, simharness
  `TestRunPlacementsBattery_…` rungs 1-30; none touches props) · codec ok · `aurad -validate -content ../api` 0 findings, props
  39 → 47 (and `-debug-zones` 0 findings) · vitest 1879/0 · typecheck clean ·
  `npm run build` ok · `verify.sh` all green · `hygiene-wire-prune` 0 console
  errors, 0 context losses.
- **Schema:** DB none · wire +3 `EntityType` (124-126) · conf none · content +8
  props · zone format none · lang none.

### K2 - BUILT 2026-10-22, PO look owed (after K6, R8) `deb54aaf` (cathedral + cemetery)

- **Wire:** `EntityType` +`CathedralNaveRoof` = 127, `Pew` = 128, `Altar` = 129,
  `Mausoleum` = 130, appended (L1). TS binding: `flatc_Windows_v24_3_25.exe --ts
  --gen-all -o <scratch> aura.fbs` from `api/schema` (⚑ pass `aura.fbs`, not
  `*.fbs`: per-file runs rewrite `aura-api.ts` and the message files; and
  `make.bat`'s `--no-fb-import` is unknown to v24), diffed: only
  `entity-type.ts` moves. Go via `go generate` in `backend/pkg/api`. One
  `gameObjectClasses` line each, after K1's.
- **Art (R1, R5 grey slate + gold):** `cathedralNaveRoof.svg` (200×480, bakes
  1200 × 2880, under L6): slate courses (pattern `naveSlate`), the west pitch
  lit, the east shaded, a lead ridge with gold cresting (`naveCresting`), three
  dormers a side, the gold cross over the west front (NORTH). Unlike the
  awning it fills its canvas edge to edge, so flush pieces show no seam; its
  shadow is baked inside the east and south eaves. That orientation sets the
  rest: the transept crosses the SOUTH end, the apse beyond, so the altar
  stands south and the pews face south. `pew.svg` (300×60: backrest on the
  north edge, end boards, a brass plate, a hymnal), `altar.svg` (240×120: stone
  under a white cloth with a gold band toward the pews; cross, candlesticks,
  book, chalice), `mausoleum.svg` (400×300: an E-W slate ridge, gold cross,
  corner urns, steps to a south door).
- **Content (+17, D7 numbers, all [PLACEHOLDER]):** the four heroes; 13
  `PropPlaceholder` defs: roofs `CathedralTranseptRoof` 24×8 and
  `CathedralApseRoof` r 5 (`revealAlpha` 0.25, `blocksMovement: false`, like
  the nave); solid `BellTower`, `Pillar`, `Font`, `Organ`, `Confessional`,
  `OpenGrave`, `IronFence`, `AngelStatue`; `CandleStand` (light 0.2 `#ffcf80`,
  flicker); non-blocking `GraveMound`, `CemeteryGate`.
- **Flood fill pinned:** `RoofReveal.test.ts` "opens the cathedral whole"
  lays the three roof defs flush N-S (sizes read from the JSON) and stands
  in each: all three open, a chapel 3 m off stays shut.
- **Palette:** regenerated with Tiled closed (L4; it had `world.json` open
  mid-session, so the regen waited). Every prop template's `gid` shifts again
  (17 names joined the alphabetical tileset). `verify.sh` all green.
  ⚑ Found, NOT fixed (outside K2): `generate-palette.mjs` `imageSize` takes
  the first `width="N" … height="N"` in an SVG's first 2000 chars, so a root
  `width="100%"` falls through to a child element: 21 tiles carry a wrong
  image size (nave + mausoleum 14×12 from the slate pattern, K1's awning
  28×240, `house.svg` 384×284 …). Templates are body-sized, so placements
  are right; what Tiled draws for the tile is unchecked (roadmap watch item).
- **Tracker (D8):** 17 `assets.csv` rows (subcategory "Props — city:
  cathedral", zone Dionsburg, state `placeholder`, the 13 boxes without
  `current_file`), `assets.md` regenerated (265 rows), `prop-worklist.md` §C2
  + the roll-up (P1 20 · P2 21 · P3 12); CandleStand is the third light.
- **Verified (R8 cheap tail only):** `go build ./...` · `go test -count=1
  ./pkg/aura/world/...` red ONLY on the known
  `TestPropContent_C1bMigrationPreservesLookAndCollision` · `aurad -validate
  -content ../api` 0 findings, props 47 → 64 (and `-debug-zones` 0) · vitest
  1883/0 · typecheck clean · webpack cache cleared, `npm run build` ok · SVGs
  parse · `verify.sh` all green. No probe, harness, screenshots or full suite
  (R8). cp-defs by hand; the EOL-only copies (5 `lang/de`, 4 zones) checked
  out again. The `pkg/api/zones/world.json` + `.debug` copies carry another
  session's uncommitted zone edits and stay unstaged.
- **Schema:** DB none · wire +4 `EntityType` (127-130) · conf none ·
  content +17 props · zone format none · lang none.
- **K2 follow-up, 2026-10-22 `[uncommitted]` (PO: "can you draw them? no
  testing"):** the transept and apse moved from boxes to SVG heroes:
  `CathedralTranseptRoof` = 131, `CathedralApseRoof` = 132 (bindings
  regenerated as above, two `gameObjectClasses` lines, the two defs switch
  entityType + sprite and nothing else, D3). `cathedralTranseptRoof.svg`
  (480×160): slate arms on an E-W ridge, the nave's N-S roof running through
  the crossing (four valleys), a slate flèche with a gold finial; the eaves
  stop where the nave and apse join. `cathedralApseRoof.svg` (200×200, the
  circle's square): a square-cornered chancel carrying the nave's roof on (so
  it meets the transept without a gap), then a half-cone on lead ribs with a
  gold boss; the bottom corners stay empty. ⚑ The fade tests the circle
  body, so the two chancel corners (~5 m² each) do not open the roof by
  standing in them. Palette regenerated, `npm run build` ok; per the PO, no
  tests or validate run. Schema: wire +2 `EntityType` (now +6 for K2),
  content unchanged in count (2 defs edited). Committed `f3863607`.
- **K2 follow-up 2, 2026-10-22 `98be9dd0` (PO: "draw one"):** ONE bell
  tower, drawn: `BellTower` = 133, `bellTower.svg` (100×100 for 5 × 5, solid):
  an OPEN belfry, so the bell shows from above (PO: "another cross is a
  bit much"): a crenellated stone parapet around the dark bell chamber, two
  oak frame beams, the bronze bell on its headstock (the bronze is its gold
  accent), the ringing wheel edge-on, the city's longest shadow. Meant
  to stand flush against the nave's north-west corner, outside the nave
  (overlapping it would put a solid block inside the church). Not a roof:
  it never fades and joins no flood fill. `npm run build` ok; no tests (PO).
  The palette picked the tile up in a regen this session did not run
  (Tiled had `world.json` open, L4): only the BellTower tile moved. Schema:
  wire +1 `EntityType` (now +7 for K2), 1 def edited.

### K3 - BUILT 2026-10-22, PO look owed (after K6, R8) `3e522386` (lazaret + slums)

- **Wire:** `EntityType` +`LazaretTent` = 134, `SlumTent` = 135, and (drawn at
  the PO's ask before the wrap) `LeanTo` = 136, appended (L1). TS binding via
  `flatc_Windows_v24_3_25.exe --ts --gen-all -o <scratch> aura.fbs`, diffed:
  only `entity-type.ts` moves. Go via `go generate` in `backend/pkg/api`. One
  `gameObjectClasses` line each, after BellTower.
- **Art (R1, R5):** `lazaretTent.svg` (300×200 for 6 × 4, 50 units/m): a
  field-hospital marquee, a HIPPED roof on two king poles (four
  planes on a short E-W ridge, north lit, east darkest), washed-out white
  canvas, a red band along the ridge and one down both slopes so the whole
  roof is the cross; a fresh patch, a scorch mark. `slumTent.svg` (240×200,
  100 units/m): a crooked branch for a N-S ridge (the Bedroll lies along it),
  mismatched brown patches, a ragged sagging hem weighted with stones; west
  slope lit. `leanTo.svg` (240×160): one pitch against a wall, a beam along
  the north edge, salvaged planks down the slope to a ragged south edge, one
  board missing, two nailed battens, patched cloth over the east end. All
  three keep everything inside the canvas (a roof draws over characters);
  ids prefixed (`lazaret…`, `slumTent…`, `leanTo…`).
- **Content (+8, D7 numbers, all [PLACEHOLDER]):** roofs `LazaretTent` 6×4,
  `SlumTent` 2.4×2, `LeanTo` 2.4×1.6 (`revealAlpha` 0.3, `blocksMovement:
  false`, D2's cloth alpha); `PropPlaceholder` defs: solid `Cot` 0.8×1.9,
  `BandageTable` 1.6×0.8, `Screen` 1.6×0.2; non-blocking `RubbishHeap` r 0.8;
  `Brazier` r 0.4 (light 0.3 `#ffa050`, flicker), the fourth light. No
  placements anywhere.
- **Palette:** Tiled had `world.json` open at the start, so the regen waited
  (L4); after the PO closed it, regenerated (twice: again for LeanTo). Every
  prop template's `gid` shifts (expected). `verify.sh` all green.
- **cp-defs:** ⚑ NOT the full copy. The only api ↔ `pkg/api` gap besides the 8
  new defs was `zones/world.json`, mid-edit in another session (Tiled), so
  only the 8 props were copied: same result for K3, no EOL churn, nothing to
  check out again, the other session's copy untouched.
- **Tracker (D8):** 8 `assets.csv` rows (subcategory "Props — city: lazaret +
  slums", zone Dionsburg, state `placeholder`; the 3 heroes SVG, the 5 boxes
  PNG without `current_file`), `assets.md` regenerated (273 rows),
  `prop-worklist.md` §C3 + the roll-up (P1 20 · P2 26 · P3 15); the Torch and
  Tent notes there name Brazier and the city's cloth.
- **Verified (R8 cheap tail only, re-run after LeanTo):** `go build ./...` ·
  `go test -count=1 ./pkg/aura/world/...` red ONLY on the known
  `TestPropContent_C1bMigrationPreservesLookAndCollision` · `aurad -validate
  -content ../api` (scratch build, L7) 0 findings, props 64 → 72 · vitest
  1883/0 · typecheck clean · webpack cache cleared, `npm run build` ok (the 2
  usual size warnings) · the 3 SVGs parse · `verify.sh` all green. No probe,
  harness, screenshots or full suite (R8).
- **Schema:** DB none · wire +3 `EntityType` (134-136) · conf none · content
  +8 props · zone format none · lang none.

### K4 - BUILT 2026-10-22, PO look owed (after K6, R8) `c9d2f1b0` (library + elven mage district)

- **PO calls (asked up front, one prompt):** the library takes the ELVEN palette
  (pale stone, silver, sage green, violet glow), not its own; `LibraryRoof` is
  DRAWN as an SVG hero now, not a box (wire +4 instead of +3; the prop count
  stays 13).
- **Wire:** `EntityType` +`Bookshelf` = 137, `MageTowerRoof` = 138,
  `CrystalPylon` = 139, `LibraryRoof` = 140, appended (L1). TS binding via
  `flatc_Windows_v24_3_25.exe --ts --gen-all -o <scratch> aura.fbs`, diffed:
  only `entity-type.ts` moves. Go via `go generate` in `backend/pkg/api`. One
  `gameObjectClasses` line each, after LeanTo.
- **Art (R1, R5 elven):** `bookshelf.svg` (240×60, 100 units/m): pale wood,
  back board along the NORTH edge (it stands against a north wall), the open
  top showing a row of muted bindings between silver-capped uprights, one book
  leaning into a gap. `mageTowerRoof.svg` (200×200, the circle's square,
  25 units/m): the FIRST circle roof built as a whole tower: a cone that fills
  the circle and nothing else (the square's corners stay empty, so the fade,
  which tests the circle body, opens wherever the roof is drawn, unlike the
  apse's chancel corners); twelve sage-copper facets in fish scales shaded
  from the top-left, silver ribs and two bands, three violet dormers, a violet
  crystal finial; its shadow is baked inside the bottom-right eave.
  `crystalPylon.svg` (100×100): an octagonal pale-stone plinth, a silver
  collar, the violet crystal point-on with its own glow. `libraryRoof.svg`
  (320×240, 40 units/m): a roof PIECE, pale sage slate on an E-W silver ridge
  with leaf cresting, two skylights on the lit north pitch (violet lamplight
  in the glass); edge to edge, with NO east or west eave, so pieces laid flush
  E-W read as one roof (only the south eave is darkened). Nothing past any
  canvas; ids prefixed (`bookshelf…`, `mageTower…`, `pylon…`, `libraryRoof…`).
- **Content (+13, D7 numbers, all [PLACEHOLDER]):** the four heroes (roofs
  `MageTowerRoof` r 4 and `LibraryRoof` 8×6 at `revealAlpha` 0.25,
  `blocksMovement: false`; `CrystalPylon` r 0.5 solid, light 0.35 `#b7a6ff`,
  no flicker); `PropPlaceholder` defs: solid `ReadingDesk` 1.8×1, `Lectern`
  r 0.4, `ScrollRack` 1.6×0.5, `AlchemyTable` 2×1, `Orrery` r 1, `MoonPool`
  r 1.8, `ElvenPlanter` 2×0.8; non-blocking `BookPile` r 0.35 and
  `ArcaneCircle` r 2 (light 0.3 `#b7a6ff`). CrystalPylon and ArcaneCircle are
  the fifth and sixth lights. No placements anywhere.
- **Palette:** Tiled closed from the start (L4); regenerated once. Every prop
  template's `gid` shifts (expected). `verify.sh` all green.
- **cp-defs:** as at K3, only the 13 new defs copied: the one other api ↔
  `pkg/api` gap was `zones/world.json`, another session's in-flight edit,
  left untouched. No EOL churn.
- **Tracker (D8):** 13 `assets.csv` rows after the K3 block (subcategory
  "Props — city: library + elven", zone Dionsburg, state `placeholder`; the 4
  heroes SVG, the 9 boxes PNG without `current_file`), `assets.md` regenerated
  (286 rows), `prop-worklist.md` §C4 + the roll-up (P1 22 · P2 31 · P3 21);
  the Torch note in §A9 names the two new lights.
- **Verified (R8 cheap tail only):** `go build ./...` · `go test -count=1
  ./pkg/aura/world/...` red ONLY on the known
  `TestPropContent_C1bMigrationPreservesLookAndCollision` · `aurad -validate
  -content ../api` (scratch build, L7) 0 findings, props 72 → 85 · vitest
  1883/0 · typecheck clean · webpack cache cleared, `npm run build` ok (the 2
  usual size warnings) · the 4 SVGs parse · `verify.sh` all green. No probe,
  harness, screenshots or full suite (R8).
- **Schema:** DB none · wire +4 `EntityType` (137-140) · conf none · content
  +13 props · zone format none · lang none.
- **K4 follow-up, 2026-10-23 `[uncommitted]` (PO: walls, entrances and props
  for the library, tower, cathedral and barracks; "a roof hides where the door
  is"):** a new hero `Doorway` = 145 (`doorway.svg`, 260×100 for 2.6 × 1,
  non-blocking, lantern light 0.15 `#ffd890`, Tiled folder `City/Walls`): two
  jambs over a 2 m opening, threshold, a step out, a lantern. ⭐ Placed in
  `props › underfoot` (walked on, under characters and under the roof), centre
  on the wall's OUTER face, rotated so the step points out: from outside only
  the step and the lantern's light clear the eave; inside, the whole frame
  shows. (First tried in `buildings`, above the roof: it hid players walking
  through and cut a notch in the roof; rejected.) Options weighed with the PO:
  street cues, walls outside the roof, a door in the roof art, a distance fade
  (code); kept 1 + this prop. In `world.json`'s `city-hub` area, by script (the
  rest of the map byte-identical, checked): Wall `paths` 0.5 m set 0.25 m
  inside each roof with door gaps (the area's first `paths`); library 16×6
  (shelves on the north wall, +3 Bookshelf), mage tower ring r 3.6 with a NE
  door (ArcaneCircle at its centre in `underfoot`, Orrery moved to the
  library), cathedral (rotated 3π/2, so the west front leads in: a 2.8 m
  portal, Doorway scale 1.4, plus both transept doors; 18 pews facing the apse
  altar, 4 crossing piers, 2 candles, font, confessional, organ), barracks
  (south door, 4 bunks, armor stands along the east wall, rack, desk); one
  `Gloom` atmosphere over the mage quarter so its lights show. ⚑ Found: the
  Bookshelf's back is on its north edge, so it lines north walls only (or
  rotates, since C2b: rotated rects collide at their angle). Verified:
  `-validate` 0 findings, props 85 → 98 (K5's 12 + Doorway) · `world` red only
  on the known one · vitest 1883/0 · typecheck · `npm run build` · palette +
  `verify.sh` green · an overlap script (no solid prop in a wall or another
  prop). Schema: wire +1 `EntityType` · content +1 prop · zone: placements +
  paths + 1 atmosphere in `city-hub`.

### K5 - BUILT 2026-10-23, PO look owed (after K6, R8) `02fc227a` (dwarven military + jail)

- **PO calls (asked up front, one prompt):** `BarracksRoof` and `Watchtower`
  are DRAWN as SVG heroes, not boxes (wire +4 instead of +2; the prop count
  stays 12); the dwarven palette (R5) gains two accents: **brass rivets** on
  the iron and the clan's **anvil sigil** in brass on the red banners.
- **Wire:** `EntityType` +`TrainingDummy` = 141, `JailBars` = 142,
  `BarracksRoof` = 143, `Watchtower` = 144, appended (L1). TS binding via
  `flatc_Windows_v24_3_25.exe --ts --gen-all -o <scratch> aura.fbs`, diffed:
  only `entity-type.ts` moves. Go via `go generate` in `backend/pkg/api`. One
  `gameObjectClasses` line each, after LibraryRoof.
- **Art (R1, R5 dwarven + the two accents):** `trainingDummy.svg` (100×100,
  the r 0.45 circle's square): a dark-stone base in a brass-riveted iron band,
  a rope-bound burlap body with straw spilling from blade cuts, an oak
  crossbar for arms with iron caps, a dented iron helm with a riveted rim, a
  red rag on the east arm. `jailBars.svg` (240×30, 100 units/m): the TOPS of
  the bars, an east-west run: a dark stone sill, the iron head rail, thirteen
  square bar heads, heavier end posts, brass rivets at the rail joints, rust.
  `barracksRoof.svg` (320×240, 40 units/m): a roof PIECE on the LibraryRoof
  rule (edge to edge, no east or west eave, only the south eave darkened):
  heavy dark slabs, an iron ridge cap studded with brass, a soot-ringed
  chimney on the shaded pitch, the clan's red banner draped over the ridge
  with the brass anvil (one per piece, so a long hall shows a row of them).
  `watchtower.svg` (100×100 for 4 × 4, 25 units/m), on the BellTower rule
  (solid, open top seen from above, never fades): a crenellated dark-stone
  parapet with iron-capped corner turrets, an oak floor, an iron-strapped
  trapdoor, a bolt-thrower on its swivel aimed north-east, a bolt rack, the
  red anvil flag in the south-east corner, a long shadow. Nothing past any
  canvas; ids prefixed (`dummy…`, `barracksRoof…`). Rasterized at body ×
  120 with sharp for a look before the wrap.
- **Content (+12, D7 numbers, all [PLACEHOLDER]):** the four heroes
  (`TrainingDummy` r 0.45, `JailBars` 2.4×0.3, `Watchtower` 4×4 solid;
  `BarracksRoof` 8×6 at `revealAlpha` 0.25, `blocksMovement: false`);
  `PropPlaceholder` defs: solid `WeaponRack` 2×0.5, `ArmorStand` r 0.4,
  `Bunk` 1×2, `Banner` r 0.25, `CellDoor` 1.2×0.3 (blocks; overridden per
  placement), `Stocks` 2×0.6, `GuardDesk` 1.8×0.9; non-blocking `Chains`
  r 0.4. No K5 prop emits light (D5). No placements anywhere.
- **Tiled folders (new since K4, `1afeaf9d`):** `tools/tiled/prop-groups.json`
  gains `City/Military` (BarracksRoof, Watchtower, TrainingDummy, WeaponRack,
  ArmorStand, Bunk, Banner, GuardDesk) and `City/Jail` (JailBars, CellDoor,
  Stocks, Chains); every later chunk adds its props there too.
- **Palette:** Tiled closed (L4); regenerated once (97 props, 15 folders).
  Every prop template's `gid` shifts (expected). `verify.sh` all green.
- **cp-defs:** as at K3 and K4, only the 12 new defs copied: the one other api
  ↔ `pkg/api` gap was `zones/world.json`, another session's in-flight edit,
  left untouched. No EOL churn.
- **Found (L2 again):** the PO's running webpack dev server reported
  `TS2339 'TrainingDummy' does not exist on type 'typeof EntityType'` after the
  regen while `tsc --noEmit` and a cache-cleared `npm run build` were clean: a
  running dev server keeps the old enum, so it needs a restart after an fbs
  regen, not only the cache clear.
- **Tracker (D8):** 12 `assets.csv` rows after the K4 block (subcategory
  "Props — city: dwarven military + jail", zone Dionsburg, state
  `placeholder`; the 4 heroes SVG, the 8 boxes PNG without `current_file`),
  `assets.md` regenerated (298 rows), `prop-worklist.md` §C5 + the roll-up
  (P1 24 · P2 36 · P3 26).
- **Verified (R8 cheap tail only):** `go build ./...` · `go test -count=1
  ./pkg/aura/world/...` red ONLY on the known
  `TestPropContent_C1bMigrationPreservesLookAndCollision` · `aurad -validate
  -content ../api` (scratch build, L7) 0 findings, props 85 → 97 · vitest
  1883/0 · typecheck clean · webpack cache cleared, `npm run build` ok (the 2
  usual size warnings) · the 4 SVGs parse (jsdom) · `verify.sh` all green. No
  probe, harness, screenshots or full suite (R8).
- **Schema:** DB none · wire +4 `EntityType` (141-144) · conf none · content
  +12 props · zone format none · lang none.
