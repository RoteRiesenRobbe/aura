# Plan: prop draw order: deterministic stacking, prop layers and area groups authored in Tiled

**Status:** ✅ **COMPLETE, archived 2026-10-04** (P4 + P4b + P4c `dd3f3582`).
DESIGNED 2026-09-20, **REVISED 2026-10-02** (PO session: D1, D3,
D4, D8 and D9 ruled the same day). **P0-P3 built and PO-passed (§11); P4,
P4b (area ids from one list, a Tiled dropdown, D15) and P4c (world.json
migrated into 22 areas, D16) built 2026-10-03 (§11) and PO-passed the same
day ("i checked all": the GUI checks and the Deep Woods / Strand seam).** Five chunks: P0 → P1 → P2 → P3 → P4. P4
(area groups) was added on 2026-10-02 at the PO's request. Line refs come from
a survey of HEAD `3bff5220` on 2026-10-02; re-verify them before executing.

**Origin.**

- PO, 2026-09-20: *"when i place props above each other, the draw order seems
  random (which one is on top)"*.
- Reported again 2026-10-02: *"sometimes the oak tree is behind the house,
  sometimes on top (example in elizas house in farmlands), it seems random, i
  would like it deterministic"*.

**The revision.** On 2026-10-02 the PO asked for **sub-containers** in Tiled:
*"a props → trees container … props in there could on top of the other rule
render generally on top of other props outside the container"*. They also ruled
that the client's `resources.minerals` / `resources.trees` split and the
bespoke Tree/Stone classes are legacy: *"these should all be sorted into the
new layer system"*.

Later the same session they ruled that **the zone file's own nesting carries
the layer**: *"what if we consider json structure itself to carry that info in
its hierarchy?"*, then *"yes"* to the design in §3.3-§3.4.

This replaces the 2026-09-20 P2 (an authored `drawOrder` integer) and an
earlier same-day draft that used a `layer` key per placement and per type
(both in §9). P1 keeps its core and grows.

---

## 1. What this is

Two overlapping props have no defined stacking order today. The design has two
rules, and the first one beats the second:

1. **The prop layer.** Every placement sits in one of four **prop layers**.
   - In Tiled they are sub-layers of one `props` group layer.
   - In the zone file they are four arrays under `props`.
   - A higher layer always draws over a lower one.
2. **The object order.** Inside a layer, Tiled's object order decides, which is
   the order of that layer's array in the file. Raise and Lower in Tiled are
   the lever.

The rule behind the layer set: **draw order = height above the ground.** A
bridge is under your feet, a crate is knee-high, a roof is over your head, a
tree crown is above the roof.

---

## 2. What was checked, not assumed

All read from the tree on 2026-10-02.

1. **The randomness has two sources, and both are real.**
   - The snapshot is built by ranging over a Go **map**:
     `for c := range p.Viewport().Collisions()` (`core/net.go:258`, spectator
     twin `:296`). Go deliberately randomises map iteration order.
   - The client makes insertion order *be* z-order. `show()` is a bare
     `this.layer.addChild(this.shape)` (`_GameObject.ts:328-329`), and there
     are zero `zIndex` / `sortableChildren` hits in `frontend/src`.
   - It re-picks every time you walk away and come back.
     `EntityManager.newSnapshot` hides and deletes any object missing from a
     snapshot (`EntityManager.ts:242-262`), and the next sighting rebuilds it
     and appends it on top.
2. **One container holds nearly every prop.** Every generic prop draws into
   `layers.resources.trees` (`Props.ts:78-80`), so House and OakTree share it.
   There are two exceptions:
   - `Stone` (Rock, Boulder) draws into `layers.resources.minerals`, below all
     other props.
   - `underfoot` props (Bridge) draw into `layers.terrain.decks`, under every
     entity (`Game.ts:281-295`).
3. **NPCs are in the props container too.** That is new since 2026-09-20.
   - Twelve NPC classes construct onto `layers.resources.trees`: Farmer,
     NpcPlaceholder, Signpost, Hermit, Wanderer, Traveller, TownCrier, DogNpc,
     Miner, CityGuard, VillageHealer, FrontCaptain (`Mobs.ts:1520-1710`).
   - So an NPC draws **over the player**, and in the same random pool as the
     props.
   - Mobs are created after props, so any order keyed on entity id would put
     every NPC over every tree crown.
4. **Entity ids ascend in spawn order, and props spawn in zone-file order.**
   - `ecs.NewBasic()` is a global atomic counter (`model/base_entity.go:9`).
   - Props are built once at boot by
     `for i := range z.Props { g.AddEntity(prop.FromZone(...)) }`
     (`cmd/aurad/aurad.go:221-225`). That is the only `FromZone` call site;
     no prop is ever created at runtime.
   - The in-game zone editor's `placeProp` (`ZoneEditor.ts:383`) edits only the
     file model and a marker. It spawns nothing on the server.
   - ⭐ So **whatever order the server spawns props in is a total order the
     client can read off the id**, with no wire field for it.
5. **Zone-file order is Tiled object order.**
   - The converter maps the `props` object layer in order on read
     (`aura-convert.js:652`) and writes it back in order (`:1070`).
   - That layer draws by index (`aura-world-format.js:196`), so Tiled already
     shows the later object on top.
6. **Tiled layers are rebuilt on every open.**
   - The zone file stores arrays, never layers.
   - `zoneToModel` rebuilds the layer list from the fixed `LAYERS`
     (`aura-convert.js:31`), and `modelToZone` reads it back **by name**.
   - So a sub-layer only survives if the zone file records it.
7. **⛔ Today's writer silently drops group layers.**
   - `write()` skips any top-level layer that is not an object layer
     (`aura-world-format.js:266-270`): group, tile and image layers alike.
   - The "unknown layer" refusal only covers object layers, so the skip is not
     reported.
   - An author who drags props into a hand-made group layer **loses them on
     save**. P0 closes this.
8. **The bespoke Tree/Stone behaviour is narrow.**
   - Tree (`RoundTree`, placed as `Tree`) and Mineral (`Stone`, placed as Rock
     and Boulder) differ from the generic path in one way that matters: each
     lays a "resource spot" decal into `layers.terrain.resourceSpots`
     (`Resources.ts:68-69`, `:115-116`; art `treeSpot.svg` / `stoneSpot.svg`,
     `Graphics.ts:509-524`).
   - That decal is a Berryhunter harvest-spot vestige. OakTree, PineTree and
     DeadTree never had it.
   - Rotation is not a difference: all of them take the authored angle.
   - Their sprites are already named in `api/props/tree.json`, `rock.json` and
     `boulder.json`.
9. **`underfoot` is draw order only; walking over water is `crossesPaths`.**
   - `underfoot` is a type flag the server parses but never exports or acts on
     (`world/props.go:214-219`). It exists only so `crossesPaths` can require
     it.
   - `crossesPaths` clears blocking paths under the deck
     (`paths_collision.go:117-123`). It requires `underfoot` and
     `blocksMovement: false` (`props.go:264-280`).
   - Only Bridge authors either flag.
10. **Who reads a zone's `props` array.**
    - Go: `aurad.go:222`, `world/place.go:114`, `world/paths_collision.go:119`,
      `world/zone.go:894` and `:1127`, `loaders.go:282` and `:317`.
    - The client reads the **bundled** zone files directly:
      `DarknessOverlay.ts:266` (torch light), `MapTerrain.ts:164` (the map),
      and the in-game editor (`ZoneModel.ts`, `ZoneEditor.ts`,
      `_ZoneEditorPanel.ts`, all by flat index).
    - Both writers: `aura-convert.js:457`, `:652` and `:1070`; and
      `ZoneModel.ts:560`.
11. **The census.** 29 prop types; 8 zone files (5 in `api/zones/`, 3 in
    `.debug/`). `world.json` holds 182 placements, 86 of them `Tree`.

---

## 3. Design

### 3.1 D1: the layer set (RULED 2026-10-02)

There are four layers. The table lists them top to bottom, ordered by height
above the ground. PO 2026-10-02: the set and the type table as proposed, with
the proposed `clutter` renamed **`default`**.

| Layer | Draws | The migration puts here |
| --- | --- | --- |
| `canopy` | over everything below | Tree, OakTree, PineTree, DeadTree |
| `buildings` | over `default` | House, Cottage, Barn, Mill, RuinedHouse, GateWall, Gate, Palisade, CaveMouth |
| `default` | over characters | Crate, BrokenCrate, Cart, BurntCart, Haystack, Well, Torch, Tombstone, FencePost, BrokenFence, Rock, Boulder, Stump, FallenLog, Bush |
| `underfoot` | **under** every character and mob | Bridge |

The type table is a **migration table and an authoring convention**, not a
rule. Under D3 any placement may sit in any layer, and nothing stores a layer
on the type. The one exception is `crossesPaths` (D4).

**Why four layers.** In Tiled a dragged prop lands in the selected layer, so
every extra layer is one more choice per drag. Each layer answers a question an
author really asks:

- "Do I walk on it?" → `underfoot`.
- "Is it a roof or a wall?" → `buildings`.
- "Is it a crown?" → `canopy`.
- Everything else → `default`.

Finer ordering, such as a cart over a haystack, is what object order inside a
layer is for.

**Placement choices in the table:**

- **Gate** goes with the walls it closes (GateWall, Palisade).
- **CaveMouth** is a rock arch, so it counts as a building.
- A **torch** mounted on a wall is the textbook case for a different layer: put
  that one torch in `buildings`.

**Naming.**

- `buildings`, not `structures`: `plan-zone-naming.md` N2 takes `structures`
  for the polygons array.
- `canopy`, not `trees`: a crown is what draws there, while a fallen trunk goes
  in `default`.
- `default`, not the proposed `clutter` (PO 2026-10-02). It is the layer
  everything goes in unless it belongs to one of the other three.

### 3.2 D2: the vocabulary is fixed, not free-form

The four names are the four keys of the zone file's `props` object, so the
structure itself fixes them.

- A sub-layer with any other name refuses the Tiled save, and the refusal names
  the layer.
- Every zone shows all four sub-layers, including empty ones, in the same order.
- The rank order lives in Go (the order the server flattens the four arrays,
  D5). `aura-convert.js` mirrors it, and a pin test guards the mirror (§6).
- **Rejected: free-form per-zone layers.** "Which layer is above which" would
  become a per-zone fact that every reader needs, and two zones could mean
  different things by the same name.

### 3.3 D3: the zone file's nesting IS the layer (RULED 2026-10-02)

```json
"props": {
  "underfoot": [ {"type": "Bridge", "x": 10.5, "y": -3, "rotation": 0} ],
  "default":   [ {"type": "Crate", …}, {"type": "Well", …} ],
  "buildings": [ {"type": "House", …} ],
  "canopy":    [ {"type": "OakTree", …} ]
}
```

- **The position is the layer.** There is no `layer` key on a placement and no
  "absent means use the type's layer" rule.
  - Every placement's layer is visible where it sits, and the file has the
    same shape as the Tiled group.
  - Changing a prop type never moves placed props.
- **Prop types carry no layer.** The `underfoot` key on Bridge's definition
  goes away. Its only job, the `crossesPaths` pairing, moves to the placement
  (D4).
- **The array order is the draw order.** The server flattens the arrays bottom
  to top (D5), so nothing sorts anything, and a file cannot be "unsorted".
- **Readers keep a flat list.**
  - Go: `zone.go` decodes the four arrays and flattens them at load into
    today's `[]Prop`, with a `Layer` field (`json:"-"`) on each entry. Every Go
    reader in §2.10 keeps iterating one slice, unchanged.
  - Client: the bundled-zone readers (`DarknessOverlay`, `MapTerrain`, the
    in-game editor) go through one shared flatten helper.
  - The in-game editor keeps its flat index over that list. A new in-game
    placement goes into `default`; move it in Tiled.
- **Byte stability is natural.** Tiled writes each sub-layer to its own array
  in object order, so a round-trip reproduces the file exactly.

**Rejected: a `layer` key per placement**, with a required `layer` key on each
prop type and "absent = inherit" (the earlier same-day draft). It saved
touching 182 placements, at the cost of:

- two places that say where a prop draws;
- a type edit that silently moves placements;
- a server-side sort;
- unsorted files that reorder on their first Tiled save.

**Rejected: nesting the prop definitions** in folders (`api/props/canopy/…`).
The loader and the palette generator read one flat directory, and once D3
removes the type's layer there is nothing for the folders to say.

### 3.4 D4: `underfoot` is per placement, plus one wire field (RULED 2026-10-02)

Any prop may be placed in `underfoot`: a broken crate, a rug, debris, a dock.
It then draws under characters and mobs. **That is all `underfoot` does.**
Walking over water stays the separate, bridge-only `crossesPaths` (§2.9), and a
blocking prop in `underfoot` still blocks.

**The client needs to know per entity which container to use.** Today it
derives that from the prop type, and D3 makes it a placement fact. So one field
is added:

- `underfoot:bool = false`, appended to `table Resource` after `prop_name`.
- The Go builder omits a field equal to its default and trims trailing default
  slots, so **every non-underfoot prop encodes exactly the bytes it does
  today**. That covers 177 of the 182 world placements.

**The `crossesPaths` rule moves from the type to the placement.**

- A placement of a `crossesPaths` type must sit in `props.underfoot`. Go
  enforces it at boot; the converter enforces it at save and names the object
  id.
  - **Why:** a deck that clears the river drawn over the player crossing it is
    the campfire defect.
- The type-level "`crossesPaths` needs `underfoot`" check goes, along with the
  key.
- The type-level "`crossesPaths` needs `blocksMovement: false`" check stays.

### 3.5 D5: the order inside a container travels as spawn order

- **Server:** spawns props in flattened order: `underfoot`, `default`,
  `buildings`, `canopy`, each in file order. This is exactly the slice D3's
  load produces, so the `aurad.go` loop is unchanged.
- **Client:** inserts by entity id (D6). By §2.4, id order is exactly
  (layer, Tiled object order), across the three layers that share
  `props.standing`.
- **Wire:** no draw-rank field. The `underfoot` field (D4) only picks the
  container; inside a container, the id carries the order.

⚑ The cost is an implicit contract, "spawn order is draw order". Two things pin
it:

- a Go test over the flatten order;
- one comment at each end.

Ids are only compared within one boot, never persisted (§7 L1).

### 3.6 D6: ordered insertion on the client (kept from 2026-09-20)

On `show()`, binary-search the container for the entity-id slot and call
`addChildAt`.

- The container stays sorted by construction, so arrival order stops mattering.
- **No per-frame cost.** Props enter and leave view continuously, and a
  `sortableChildren` re-sort would run on every one of those changes.
- **The trade-off:** with unique ids, `sortableChildren` would now also be
  correct (the 2026-09-20 objection was about ties). Ordered insertion stays
  because it is the cheaper of the two.

### 3.7 D7: the client's containers

| Today | After |
| --- | --- |
| `terrain.decks` | `props.underfoot`, same position: the last terrain container, under every entity. Chosen per entity from the wire (D4). |
| `resources.minerals` + `resources.trees` | **one** `props.standing`, same position: above characters and mobs, below flyers |
| `terrain.resourceSpots` | deleted with the decals (D8) |
| NPCs in `resources.trees` | `mobs.npcs`, under characters (D9) |

`default`, `buildings` and `canopy` all share `props.standing`. Their relative
order is entirely the id order (D5).

### 3.8 D8: the legacy Tree/Stone classes fold into the generic path (RULED 2026-10-02)

- **Deleted:** `Resources.ts`'s `Tree` / `RoundTree` / `Mineral` / `Stone`, and
  the `BESPOKE_ENTITY_TYPES` exclusions for `RoundTree` / `Stone`
  (`Props.ts:85`).
- **Moved:** the `Resource` base class moves into `Props.ts`.
- **What remains:** the generic path, which already reads each type's sprite
  from its own JSON.

**The resource-spot decals are retired** (PO 2026-10-02: *"yes"*).

- Only 3 of the 8 tree and rock types have a decal today, and it is a
  harvest-spot leftover.
- Ground scuffing can be authored as a terrain decal where it is wanted.
- The change is visible on 89 placements (86 Tree, 2 Boulder, 1 Rock), so P2
  owes an in-game look.

**Out of scope:** the wire names (the `Resource` table and the `RoundTree` /
`Stone` `EntityType` values). Renaming them is a wire change with no behaviour
change; it is recorded as a cleanup candidate.

### 3.9 D9: NPCs leave the props container (RULED 2026-10-02)

NPCs move to their own container, under the characters (`mobs.npcs`). PO
2026-10-02: *"yes under players"*.

- This applies the 2026-08 mobs-under-characters ruling ("the player must
  never be covered") to NPCs.
- **Rejected:** a container between characters and props, which would have
  kept today's look (an NPC over the player).

---

## 4. Tiled UX, as the PO will see it

```text
Layers panel (top = drawn last)
  anchors · atmospheres · darkAreas · campfires · spawns
  ▾ props            ← group layer
      canopy
      buildings
      default
      underfoot
  terrain · paths · regions
```

- **Placing.** Select a sub-layer, then drag from Templates as today
  ([[project-tiled-drop-size]]).
  - Any prop is legal in any sub-layer.
  - The only refusal is a `crossesPaths` prop outside `underfoot` (D4).
- **Moving a placed prop between layers.** Use Tiled's *Move Objects to Layer*.
- **Ordering inside a layer.** Use Raise, Lower, Raise to Top and Lower to
  Bottom. The Objects panel lists the topmost first.
- **Seeing under the trees.** Hide `canopy` with its eye toggle. This is the
  everyday payoff of the group.
  - ⚑ Visibility and locks do not persist across a reopen (measured,
    `plan-zone-naming.md` §2 fact 3), so the four sub-layers open visible and
    unlocked every time.

---

## 5. Schema impact

| | P0 | P1 | P2 | P3 | P4 |
| --- | --- | --- | --- | --- | --- |
| DB | NONE | NONE | NONE | NONE | NONE |
| Wire | NONE | NONE (the snapshot's entity ORDER becomes sorted; same bytes, same set) | NONE | **+1 field `Resource.underfoot:bool = false`**, appended; zero bytes when false | NONE |
| conf.json | NONE | NONE | NONE | NONE | NONE |
| Content: prop defs | NONE | NONE | NONE (decals are client art) | **−1 key** `underfoot` (Bridge only) | NONE |
| Zone format | NONE | NONE | NONE | **`props` becomes an object of four arrays** (breaking; all 8 files migrated) | **+1 optional key `areas`**, additive: no migration, and every existing file stays valid byte for byte |

---

P4b (built): DB/wire/conf NONE · content **+1 file** `api/areas/areas.json` ·
zone format NONE (an area `id` must name a listed area). P4c (built):
world.json rewritten into `areas`, no format change.

## 6. Chunks

### P0: close the silent-drop trap (tiny, extension only)

`write()` refuses a save containing anything it would drop:

- any non-object layer that holds content;
- any group layer (until P3 teaches it the `props` group).

The refusal names the layer. Reinstall the extension after the change.

**Done when** a hand-made group layer full of props refuses the save instead of
emptying it.

### P1: deterministic order, schema NONE

1. Ordered insertion keyed by entity id (D6), in both prop containers.
2. Merge `resources.minerals` + `resources.trees` into `props.standing`, and
   rename `terrain.decks` to `props.underfoot` (D7). Tree and Stone still exist
   at this point and simply point at the merged container.
3. Move the twelve NPC classes to `mobs.npcs` (D9).
4. Sort the entity slice in `playerSendState` / `spectatorSendState` by id
   (the 2026-09-20 D6). It cannot fix stacking alone, but it removes the
   per-tick shuffle from the 30 Hz message.
5. A Go test that props spawn in zone-file order. Extract the `aurad.go` loop
   into a tested helper, which P3 extends to the four-array flatten.

**Done when** Eliza's oak and house stack the same way across a
walk-away-and-return, a reload and a server restart, and Raise/Lower in Tiled
(after save + restart) is what flips them.

⚑ Until P3 the order is pure file order, so some overlaps will settle the
"wrong" way once. Don't fix them by hand: P3's migration moves every prop into
its layer anyway.

### P2: fold the legacy classes (client only)

1. Retire `Tree` / `RoundTree` / `Mineral` / `Stone`; the generic path draws
   all of them. `Resource` moves into `Props.ts`, and `Resources.ts` is
   deleted.
2. Delete the decals, `terrain.resourceSpots` and the
   `GraphicsConfig.resources.tree/mineral` spot entries (D8).
3. Confirm `MapProps`'s style table (keyed by entity type,
   `MapProps.ts:60-64`) is untouched. It reads wire names, which stay.

**Done when:**

- trees and rocks look as before, minus the decals (in-game look);
- no client code mentions `resources.` layers or the bespoke classes.

### P3: prop layers end to end (behind the PO's uncommitted zones)

1. **Go zone format** (`world/zone.go`):
   - `props` decodes as four arrays.
   - At load they flatten into `[]Prop` with `Layer`, in rank order. The rank
     list is the only place the order is defined.
   - The D4 rule: a `crossesPaths` type outside `underfoot` refuses the boot
     and names the zone and index.
2. **Go prop defs** (`world/props.go`): drop `Underfoot` and the type-level
   `crossesPaths` → `underfoot` check (D4).
3. **Wire:**
   - `server.fbs` gains `underfoot:bool = false`, appended to `table Resource`.
   - Regenerate **both** binding sets.
   - `model/prop` carries the flag through `FromZone`, and the `codec` writes
     it.
4. **Migration:** a one-off script rewrites all 8 zone files' `props` arrays
   into the four arrays.
   - Each prop goes by D1's table, in file order within each layer.
   - It refuses on an unknown type rather than guessing.
   - Bridge's definition drops `underfoot`.
5. **Converter** (`aura-convert.js`):
   - `zoneToModel` builds the `props` group's four sub-layers from the four
     arrays.
   - `modelToZone` writes them back.
   - Validation mirrors Go: an unknown sub-layer, `crossesPaths` outside
     `underfoot`, an object outside the group.
   - The palette's `content.json` carries `crossesPaths` per prop type if it
     does not already.
6. **Extension** (`aura-world-format.js`): builds a `GroupLayer` on read, walks
   it on write, and relaxes P0's refusal for exactly this group.
   - ⭐ **For P4:** find the `props` group and its sub-layers by **walking the
     layer tree by name**, never by a fixed top-level position. Keep the walk
     a function of "one group of kind layers", so P4 reuses it once for the
     zone level and once per area, instead of rewriting it (§10).
7. **Client zone readers:** one flatten helper, used by `DarknessOverlay`,
   `MapTerrain` and `ZoneModel`.
   - `ZoneModel.getZoneAsJSON` emits the four arrays.
   - A new in-game placement goes to `default`.
8. **Client render:** `Props.ts` picks the container from the streamed
   `underfoot` per entity. `PropDefJSON.underfoot` goes.
9. **Survey and update every other zone reader:** tools, harness scripts,
   `cmd/simharness` and test fixtures. Grep for `"props"` and `.props`;
   §2.10 is the runtime list, not the whole list.
10. **Docs:** the `add-content` skill and `manual-content-authoring.md` drop
    `underfoot` from the prop-definition rules and describe the four arrays.

**Done when:**

- Tiled shows the four sub-layers in every zone.
- Eliza's oak draws over the roof with no hand-authoring (the migration put it
  in `canopy`).
- A torch moved into `buildings` draws over its wall.
- A broken crate moved into `underfoot` draws under the player.
- Every zone file round-trips byte-identically through Tiled and the in-game
  editor.
- Non-underfoot props cost zero extra wire bytes.

### P4: area groups (RULED, design in §10; after P3 and N2)

1. **Go** (`world/zone.go`):
   - Add `Areas []Area` to `Zone`. An `Area` has an `id` plus any of the
     zone's object arrays, with `props` in its P3 shape.
   - At load, flatten everything into today's slices (D11). Each object gets an
     `Area` field (`json:"-"`), empty for zone-level objects.
   - Validation:
     - area ids must match the slug charset (D12) and be unique within the zone;
     - an area id must not collide with a kind name;
     - error messages name the area id as well as the index.
2. **Converter + extension:**
   - On read, the zone-level layers stay at the top, as today. After them comes
     one group per area, in file order, each holding the full kind set (D13).
   - On write, the writer walks the groups and rebuilds `areas`, emitting
     empty arrays nowhere.
   - The save refuses an unknown kind layer inside an area, and a group that
     is neither `props` nor a well-formed area.
3. **`ZoneModel.ts`:**
   - Carries `area` on each in-memory object and regroups on write.
   - A new in-game placement is zone-level.
   - The key-completeness pins cover `areas`.
4. **Client zone readers:** one normalisation where the client picks its
   bundled zone. `ZoneSets.ts` and `GroundTextureManager.ts` hold the
   `require.context`; `MapProps.ts`, `MapScale.ts` and the in-game editor
   import zones as well. It flattens areas exactly as Go does (D11), so no
   feature module learns that areas exist.
5. **A cross-language pin:** one fixture with two areas and a zone-level
   object in each order-sensitive array. Go and the client flatten it, and the
   test asserts identical order.
6. **Docs:** `manual-content-authoring.md` / the zone-format notes gain
   `areas`.

**Done when:**

- An author creates a "Farmlands" group in Tiled, moves anchors, atmospheres
  and props into it, and saves.
- The game behaves identically, and the file reopens with the same groups.
- A zone with no `areas` is byte-identical to before P4.
- ⭐ **The game can still say which area every object lives in** (the PO's
  condition on D10): a test asserts the area on each flattened object, in Go
  and on the client, and zone-level objects carry none.

### P4b: area ids from one list, picked from a dropdown (RULED 2026-10-03, design in §10.6)

1. **Content:** `api/areas/areas.json`, the area list (D15's table). It joins
   `contentSources`, `cp-defs` and the embed (CLAUDE.md: a missing directory
   hard-fails the boot, a forgotten one silently no-ops).
2. **Go:** load the list; a zone area whose `id` is not in it refuses the boot
   (it replaces P4's slug-only check, which stays as the list's own rule).
   `-validate` reports it.
3. **Palette** (`generate-palette.mjs`): an `AuraAreaId` enum from the list,
   and an `AuraArea` class with `useAs: ["layer"]` and one `id` member
   defaulting to `(pick an area)`.
4. **Converter + extension:** an area group is one whose class is `AuraArea`;
   its `id` comes from that property (typed, as a spawn's `mob` is), never from
   its name. On read the group is named by its id. The save refuses
   `(pick an area)`, an id not in the list, and a group that is neither
   `props` nor an `AuraArea`.
5. **Tests:** Go (unknown id refused, the list loads), vitest (the class and
   enum in the palette, the id read off the property, the name ignored, the
   refusals), `verify.sh` (an area round-trips, an unknown id refuses), and the
   cross-language fixture's ids added to a test list.
6. **Docs:** the Tiled manual's Areas section, the authoring manual,
   `add-content` (a new area is one line plus a palette regenerate).

**Done when:** a fresh group's Properties panel offers the area dropdown
(PO GUI check), a group renamed freely still saves under its picked id, and an
id that is not in the list cannot reach a zone file through either writer.

### P4c: migrate world.json into areas (RULED 2026-10-03, design in §10.7)

A one-off, kept script (`scripts/migrate-areas.mjs`, the
`migrate-prop-layers.mjs` posture: all-or-nothing, canonical-form input only).

**Done when:** every titled region of world.json and everything inside it sits
in its area per §10.7, the leftovers are listed, and in game nothing looks or
behaves differently (`p1-prop-order`, `map-props-bake`, `-validate`, a
same-order check of every order-sensitive array where it overlaps).

---

## 7. ⚑ Landmines

1. **An id is relative, never absolute.** It comes from a global counter, so
   content created earlier in boot shifts every later id. Only the relative
   order of props from the one spawn loop is load-bearing. ⛔ Never persist an
   entity id, or compare one across boots, for anything.
2. **One commit, no compatibility window.**
   - `DisallowUnknownFields` turns the reshaped `props` into a refused boot
     unless all of these move together: `zone.go`, both writers, the client's
     zone readers (the client bundles `api/zones` directly), the 8 zone files,
     the embedded copies and Bridge's definition (the `plan-zone-naming.md`
     L1 rule).
   - The key-completeness pins in `AuraTiledConvert.test.ts` go red until both
     writers emit the four keys. That is the pins doing their job.
3. **The in-game editor's flat index.** Selection, markers and the panel all
   address props by flat index (§2.10). The flatten helper must give a stable
   order (rank, then file order), and add and remove must map back to the right
   array. Test that a round trip keeps each prop in its own array.
4. **A zone edit is half-live** ([[project-zone-edit-half-live]]). The new
   order shows only after `make -C backend build` (or `-content ../api`) and a
   restart.
5. **Uncommitted work in the tree.**
   - `api/zones/world.json` and `api/schema/server.fbs` are both modified at
     HEAD. P3 rewrites every zone file and appends to `Resource`, so it lands
     after that work is committed.
   - It must not run concurrently with `plan-zone-naming.md` N2, which also
     rewrites every zone file.
   - P0-P2 have no such constraint.
6. **`addChildAt` and child indexing.** Before P1 ships, check that nothing
   reads the prop containers by child index. (The known index readers,
   `AuraRings` and `EffectPips`, work inside a character's own shape.)
7. **Tiled's GroupLayer API is assumed, not yet measured headless.**
   - Confirm in P3 that `GroupLayer`, `addLayer` / `layerAt` and
     `isGroupLayer` work under `--export-map`, the way `ObjectGroup.locked` was
     probed for N1.
   - A `verify.sh` leg proves names survive a real save, never the GUI
     ([[project-tiled-roundtrip-blind-spot]]).
   - Move-to-Layer and Raise/Lower are eye-only checks.
8. **The byte-stability tests are on the known-inconclusive list at HEAD.**
   Check them red or green *before* P3, so P3 isn't blamed for an existing
   failure.
9. **P4 after N2.** `plan-zone-naming.md` N2 renames three of the arrays an
   area holds (`terrain`, `polygons`, `campfires`). Landing P4 first means
   teaching every writer and reader the old names and then renaming them twice.
10. **P4 has more readers than P3.** P3 touches only `props`; P4 touches
    every array, and the client reads most of them straight from the bundled
    file (regions, paths, polygons, terrain, atmospheres, darkAreas, props,
    anchors). The normalisation must sit at the single point where a zone is
    picked. Grep for every `require` of `api/zones` before trusting that
    there is only one.
11. **Order-sensitive arrays become area-major (D11).** After P4 a Dark Woods
    path can no longer draw between two Farmlands paths. That is a real loss
    of expressiveness, deliberately accepted: Tiled cannot show such an
    interleaving across groups anyway (§10.1).

---

## 8. PO calls

### Answered

- **2026-09-20:** order is authored in Tiled, not by a Y-sort or an id-sort.
  Props only; moving mobs and characters are out of scope.
- **2026-10-02:** Tiled object order (Raise/Lower) is the in-layer lever.
  Sub-containers are wanted. The `resources.*` split and the bespoke Tree/Stone
  classes are legacy and fold into the new system.
- **2026-10-02:** area groups (Farmlands → anchors, atmospheres, …) are wanted
  for editing convenience. At first they were recorded as a separate future
  plan; later the same day they were added here as **P4**, at the PO's request.
  The PO suggested a JSON section for them.
- **2026-10-02, D1:** the four layers and the type table, with `clutter`
  renamed `default`. PO: *"I like them, except "clutter". maybe this could be
  "default"."*
- **2026-10-02, D8:** the resource-spot decals are retired (*"yes"*).
- **2026-10-02, D9:** NPCs draw under the characters (*"yes under players"*).
- **2026-10-02:** `default` never draws under characters. PO: *"no, no default
  under player, that is what underfoot is for right?"* `underfoot` is draw
  order only; walking over water is the separate, bridge-only `crossesPaths`.
- **2026-10-02, P4:** areas are optional at every level (*"I like it."*); one
  flatten rule for server and client (D11), with the interleaving limit and the
  kept area field explained; areas are keyed by **id**, not by a display name
  (D12): *"can also be ids and the game can later name them if needed."*
- **2026-10-02, D3 + D4:** the zone file's nesting carries the layer. Prop
  types carry no layer. `underfoot` is per placement, with one appended wire
  field. PO: *"what if we consider json structure itself to carry that info in
  its hierarchy?"*, then *"yes"*.

- **2026-10-02, D10 + D13 + D14 (P4, §10):**
  - **D10**, the nested `areas` section: *"yes, if the game can still find out
    which area each object lives in"*. It can: D11 keeps the area on every
    flattened object (Go `Area`, the client's `area` field), so the condition
    is part of P4's done-when, not a new design.
  - **D13**, every area opens with the full kind set in Tiled: *"yes"*. The
    measure-and-fall-back note in §10.4 stands.
  - **D14**, area over kind, with the Tiled-only discrepancy: accepted. PO:
    *"there was no solution for this AFAIK, so it is accepted"*.

- **2026-10-03, D15 + D16 (P4b, P4c, §10.6-§10.7):** area ids come from one
  list in code, picked from a Tiled dropdown (*"Then later there can be no
  mismatch"*); world.json migrates one area per titled region, Saltgrass
  Strand inside `farmlands`, order-preserving. The id table is proposed, to be
  confirmed when P4b writes it.

### Open

- **D2, D5, D6, D7:** fixed vocabulary, spawn order as the in-container order,
  ordered insertion, and the container table. Presented 2026-10-02 and not
  vetoed; listed here so the record shows they were proposed rather than
  ruled.

---

## 9. Superseded

- **The 2026-09-20 P2:** an authored `drawOrder: int16` per placement, with an
  appended `Resource.draw_order`. Replaced by the layers: sub-layers plus object
  order give the same authoring power without a number to manage.
  - Its open call "is P1 enough?" is answered by the 2026-10-02 ask.
- **The earlier 2026-10-02 draft:**
  - a required `layer` key on every prop type, which would have replaced
    `underfoot`;
  - an optional `props[].layer` override that inherited the type's layer;
  - a server-side stable sort;
  - type-only `underfoot`, needing no wire field.

  It was replaced the same session by D3-D4 (nesting, per-placement
  `underfoot`, one wire field). Reasons in §3.3.

- **Area groups as a per-object `area` tag** (the first 2026-10-02 §10): replaced
  by D10's nesting. A Tiled save makes every array area-major anyway, so the
  tag's promise to keep the whole-zone order could not be kept (§10.1).

---

## 10. P4 design: area groups (RULED 2026-10-02)

PO, 2026-10-02: *"Ultimately I would also like to be able to have a container
level on top for regions. eg. "Farmlands" -> anchors, atmorspheres and "Dark
Woods" -> anchors, atmospheres. This has nothing to do with depth sorting though
and is primarily for my Tiled editing convenience, although the game could also
use that info for other things in the future."*

Later the same day: *"i also want [it] added to the plan as P step in the end.
i suppose this will also change json structure by adding a regions section, or
do you have a better proposal?"*

### 10.1 D10: a nested section, not a per-object tag (RULED 2026-10-02)

An earlier draft of §10 recommended an `area` tag on each object, to keep each
array's order across the whole zone. **That argument does not survive Tiled.**

- Tiled shows each area as its own group. Its writer can only emit a kind's
  objects group by group.
- Suppose `paths` is `[Farmlands A, Dark Woods B, Farmlands C]`. Tiled shows
  A and C together under Farmlands and B under Dark Woods. On save, B can only
  land before or after both, never between them.
- So **a Tiled save makes every array area-major anyway**. A tag would only
  pretend otherwise, and would need a hidden per-object sequence number to keep
  the pretence up.

**Recommendation:** nest, as the PO suggested. The file then says exactly what
the editor shows, which is D3's argument again.

**The shape:**

```jsonc
"regions": [ … ],            // zone-level: objects in no area, exactly as today
"anchors": [ … ],
"areas": [
  { "id": "farmlands",
    "anchors":     [ … ],
    "atmospheres": [ … ],
    "props":       { "default": [ … ], "canopy": [ … ] } },
  { "id": "dark-woods", … }
]
```

- **Naming:** `areas`, not `regions`. `regions` is already the array of ground
  polygons, and those carry the very titles ("Farmlands", "Deep Woods") an area
  would be named after.
- **Optional at every level** (RULED 2026-10-02, PO: *"I like it."*):
  - `areas` itself is optional;
  - an area authors only the kinds it uses;
  - a zone with no areas is unchanged byte for byte.
  - So P4 has **no migration**: the PO moves content into areas in Tiled at
    their own pace.
- **What an area may hold:** every object array a zone holds (`terrain`,
  `props`, `spawns`, `campfires`, `darkAreas`, `regions`, `paths`, `polygons`,
  `atmospheres`, `clearings`, `anchors`; after N2, their new names). Zone-level
  settings (`name`, `bounds`, `origin`, `ground`) stay zone-level only.

### 10.2 D11: one flatten rule, shared by Go and the client (RULED 2026-10-02)

Every reader flattens at load into today's flat arrays, so no gameplay or render
code learns about areas:

- **For each kind:** zone-level objects first, then each area in file order,
  each in its own array order.
- **For props:** the layer rank stays the outer key, so P3's rule "layer beats
  everything" holds across areas. A Dark Woods `canopy` draws over a Farmlands
  `buildings` prop. Within one layer it is zone-level first, then area by area.
- **Each flattened object keeps its area name** (Go: `Area`, `json:"-"`). That
  is the hook the PO's "the game could also use that info later" needs. Nothing
  reads it in P4 (YAGNI); a later feature can.
- **Cost:** order-sensitive arrays become area-major (§7 L11):
  - region and atmosphere resolution, where the last shape containing a point
    wins;
  - path, polygon and terrain draw order.
  - The order is still fully authorable: move an area group up or down to put
    its shapes above another area's.
  - ⚑ **The flatten does NOT bring back interleaving.** It only makes the
    server, the client and Tiled agree on the one order Tiled can express.
    There is no way to put a Dark Woods path *between* two Farmlands paths.
    - Zone-level objects sit below every area's objects of the same kind, so
      they cannot be used to interleave either.
    - The practical answer: if two areas' shapes must interleave, they belong
      in one area. Or move the area groups.
    - Only a cross-area order key (the retired `drawOrder` idea, §9) could
      express true interleaving, and nothing asks for it (YAGNI).
- **Objects that span areas** (PO 2026-10-02: *"how about a path from farmland
  to darkwoods as we already have on the map?"*).
  - **They are common.** Checking which titled regions each `world.json` path's
    vertices fall in finds many:
    - the main river (path 0: Farmlands, Deep Woods, Brackenfold Meadows, The
      Fallow Reach);
    - the coastal water (path 18, 4 regions);
    - several cliffs (paths 2, 3, 12, 25).
    - Most roads touch one region.
  - **An object belongs to exactly one group, never two.** Its geometry can go
    anywhere; the group only decides its order and where it shows in Tiled.
  - **The rule: an object that spans areas lives at the zone level.** Zone
    level draws first in every kind (D11), so it is the floor every area sits
    on. That is right for the river, the coast and the cliffs: each area's roads
    and bridges draw over them.
    - Inside the zone level, order is free as before. A long road crossing the
      river can sit above it there.
  - **The one conflict:** a spanning road crossing an area-local stream. Here
    the road at zone level would draw under the stream. The fix is to move the
    stream to the zone level too, below the road.
  - **Need something above every area?** An area does not have to be a place.
    A group with an id like `crossings`, moved to the top in Tiled, is an
    ordered group like any other.
  - So any cross-area ordering can still be expressed by choosing the group.
    What cannot be expressed is one object belonging to two groups.
- **Knowing an object's area is not lost.**
  - Go keeps `Area` on every flattened object.
  - The client's normalisation keeps an `area` field the same way.
  - So server and game code can ask "which area is this in" at any time.
  - Nothing needs it on the wire: the client reads the same bundled zone file.

### 10.3 D12: an area has an id, not a display name (RULED 2026-10-02)

PO, 2026-10-02: *"can also be ids and the game can later name them if needed."*

- The key is `id`: a slug (`[a-z0-9-]+`, e.g. `farmlands`, `dark-woods`).
  - It is unique within the zone and must not collide with a kind name.
  - The Tiled group layer's name IS the id.
- It is stable by construction. Renaming or translating what a player might one
  day see never touches a zone file. That suits the localization plan, since
  English is the base language and other languages live in string tables.
- A display name is not built (YAGNI). If the game ever shows areas, it maps
  the id to text then.
- Matching it to a titled region polygon, or deriving membership from which
  titled region contains an object, was considered.
  - Derived membership would change an object's group whenever it is dragged
    across a border.
  - A required link would make renaming a region title a two-place edit.
- Either can come later if the game starts reading areas.

### 10.4 D13: every area shows the full kind set in Tiled (RULED 2026-10-02)

- Each area group opens with every kind layer, empty ones included, and `props`
  with its four sub-layers. That gives predictable drop targets, the same rule
  as D2.
- To create a new area, the author makes a group layer with only the kind
  layers they need. The writer accepts any subset, and the next open fills in
  the rest.
- **Cost:** 14 layers per area (10 kinds plus the 4 prop sub-layers). Groups
  collapse in the Layers panel, but whether Tiled persists their
  expanded/collapsed state is unmeasured. If every area opens expanded, a
  23-area world is a long list. Measure this in P4, and fall back to "only
  non-empty kinds" if it reads badly.

### 10.5 D14: area over kind (the PO's ask), with one Tiled-only discrepancy (ACCEPTED 2026-10-02)

```text
Layers panel (top = drawn last)
  ▸ dark-woods     anchors · atmospheres · … · ▾ props (4) · … · regions
  ▸ farmlands      anchors · atmospheres · … · ▾ props (4) · … · regions
  anchors · atmospheres · … · ▾ props (4) · … · regions     ← zone-level, as today
```

- **The discrepancy.** ⚑ Tiled draws group by group, so Dark Woods' regions
  draw over Farmlands' props **in the editor**. The game always draws kind by
  kind: every region under every prop.
  - This only shows where areas touch, and only in Tiled.
  - Clicks are unaffected: `regions` and `atmospheres` open locked in every
    group (N1's D2), so they never win a click.
- **The alternative,** kind over area (`regions → Farmlands, Dark Woods`), has
  no discrepancy but splits one area across ten places. That is the opposite
  of the ask.

### 10.6 D15: one list of area ids, picked from a dropdown (RULED 2026-10-03, amends D12)

PO, 2026-10-03, on the id convention: *"we should establish a clean id for
areas throughout the code base. "01" would be too sterile and a long name too
arbitrary"*, then *"Maybe a code source of truth would be better and we can
only pick one from a drop down in tiled? Then later there can be no
mismatch."*

- **Amends D12 as built in P4**, where the Tiled group's NAME is the id. The id
  becomes a typed `id` property on an `AuraArea` layer class, picked from an
  `AuraAreaId` enum generated from `api/areas/areas.json`. The group name is a
  free label. Go refuses an id the list does not hold.
- **The convention for an id:** the short name a player would call the place,
  lowercase, words joined by `-`. Drop "The", apostrophes, and a generic word
  (Meadows, Sprawl, Fort, Mount, Commons, Grove) when a coined name remains;
  keep two words when both are ordinary. Once anything references an id it
  never changes (the `spawnpoint-N` and skill-id rule). The display title can
  change freely; it is not the id.
- **The first list** (proposed 2026-10-03; the PO confirms or edits it when
  P4b writes the file):

  | Region (world.json title) | id |
  | --- | --- |
  | Farmlands + Saltgrass Strand | `farmlands` |
  | Brackenfold Meadows | `brackenfold` |
  | Deep Woods | `deep-woods` |
  | Southgate Sprawl | `southgate` |
  | The Umberwood | `umberwood` |
  | Brunnstedt | `brunnstedt` |
  | Fort Grimwatch | `grimwatch` |
  | The Ashen Fields | `ashen-fields` |
  | The Cinder Conclave | `cinder-conclave` |
  | Wrecker's Bluff | `wreckers-bluff` |
  | The Greyspine | `greyspine` |
  | Netmender's Coast | `netmenders-coast` |
  | Northgate Commons | `northgate` |
  | Sorrowfen | `sorrowfen` |
  | The Sunscar | `sunscar` |
  | The Fallow Reach | `fallow-reach` |
  | The Glimmerwood | `glimmerwood` |
  | Rimefrost | `rimefrost` |
  | Hollow Marsh | `hollow-marsh` |
  | Moonveil Grove | `moonveil` |
  | The Witherwood | `witherwood` |
  | Mount Wyrmhold | `wyrmhold` |

- **Measured headless (Tiled 1.12.2, a throwaway probe extension, 2026-10-03):**
  a `GroupLayer` takes `className = 'AuraArea'` and an `id` property; both
  survive a TMX save; a TMX carrying the enum as a typed property
  (`propertytype="AuraAreaId"`, string storage) reads back as the plain string.
  With no project loaded, `tiled.propertyValue('AuraAreaId', …)` throws
  "Unknown type", so the read falls back to a bare string exactly as a spawn's
  `mob` does. ⛔ Whether the Properties panel shows the DROPDOWN on a group
  layer is GUI-only (the [[project-tiled-roundtrip-blind-spot]] rule).
- **Rejected:** the group name as the id (P4 as built), because a typo makes a
  second area silently; a sterile number ("01"); the full title as a slug
  (`the-cinder-conclave`), arbitrary and long.

### 10.7 D16: migrating world.json, one area per Zone or titled region, order-preserving (RULED 2026-10-03)

Reverses §10.1's "no migration, the PO moves content at their own pace" for
world.json (PO 2026-10-03: *"Could we auto migrate our existing areas in
world.json? Each region and all objects in it should map to one area."*).

- **Membership:** each titled region goes into its area, in region file order,
  and every object goes to the area of the region containing it (a point: its
  position; a shape: all its vertices; "the last containing region wins",
  the game's own rule). An object crossing areas stays at the zone level (D11).
- ⭐ **Saltgrass Strand belongs to `farmlands`** (PO 2026-10-03: *"the strand in
  zone 1 belongs to farmland"*, `content-zone-1-farmland.md`: Zone 1 is
  Farmlands + Strand). Measured safe for region lookup: the Strand (region 15)
  moves ahead of regions 1-14 in flattened order, but overlaps none of them
  (half-unit grid). Every other titled region is its own area until
  `content-world.md` maps it to a zone.
- **Order-preserving** (PO: *"sounds ok"*): an object whose move would flip its
  order against an overlapping object of the same kind stays at the zone
  level, so the game looks exactly as before; the script lists those. ⚑ PO:
  this is what could get P4 reverted *"if workflow sucks for paths and co"*;
  the migration is lossless (folding the areas back gives a file the game
  treats identically), so a revert costs nothing.
- **The census (2026-10-03, world.json at `b058eb5c`):** 23 titled regions,
  every title unique. Inside one region: 393 of 393 spawns, 181 of 182 props,
  45 of 45 bind points, 10 of 10 anchors, 8 of 8 decals, 19 of 28 paths, 21 of
  25 atmospheres, 8 of 11 structures. A rough bounding-box check finds about
  10 overlapping pairs a naive move would flip (4 paths, 1 structure, 2
  atmospheres, 3 canopy trees on the Farmlands and Brackenfold borders); the
  order-preserving rule keeps them at the zone level.

---

## 11. Chunk ledgers

### P0: the silent-drop trap closed ✅ 2026-10-02 (uncommitted)

**What landed:**

- `aura-convert.js`: `layerRefusals(layers)` decides what a save would drop,
  and `formatLayerRefusals` words it. It is pure and takes plain descriptors
  `{name, kind, empty, layers?}`. One message per offending layer:
  - every **group** layer refuses, empty or not, and so does one named like a
    zone layer;
  - a **tile** or **image** layer refuses only when it holds something;
  - an **object** layer refuses when `LAYERS` does not name it, empty or not
    (the old unknown-layer refusal, folded in so there is one decision);
  - a layer of any **other** kind refuses rather than being skipped.
- `aura-world-format.js`: `describeLayer` adapts Tiled's layers (tile:
  `region().rects`, image: `imageSource`) and `write()` refuses **before**
  walking any objects. The separate unknown-layer check is gone.
- ⚑ **For P3:** a group's descriptor already carries its children
  (`layers`), so P3 changes one branch: accept a group named `props` and walk
  its children by name. `LAYERS` is untouched.
- **The empty-layer decision:** an empty tile or image layer is let through.
  Dropping it loses nothing, and Tiled's New Map starts with an empty
  "Tile Layer 1", so refusing would block a save that deletes nothing. An empty
  **group** still refuses, as briefed: P3 gives a group meaning by its name, so
  a stray one is a mistake worth naming now.

**Tests:**

- vitest `AuraTiledConvert.test.ts`, 8 new cases. Red first (8/8,
  `C.layerRefusals is not a function`), then green. Full suite **1463/0**
  (61 files; it was 1455/0 at HEAD, byte-stability **green before and after**).
  `npm run typecheck` clean.
- **Real Tiled (1.12.2), headless:** seven hand-built TMX variants exported to
  `aura-zone`. Group with props, empty group, filled tile layer, image layer
  with an image, and an unknown object layer were all refused with nothing
  written. Empty tile layer, empty image layer and the base map all saved, and
  the base saved byte-identical.
- **The bug, measured at HEAD's writer:** the group, filled-tile and image
  variants all **saved**, the group's OakTree gone (`props: 0`).
- `verify.sh` gained leg **2a**: a group of props refuses, with a control
  proving the same map saves without the group. All legs green, 0 ❌.
- Extension reinstalled (`install.sh`). Leg 0 confirms the copy is in step.
- ⚑ Headless `--export-map` prints **no** refusal text, only the exit code.
  The message wording is seen only in the GUI (PO check).

**Schema:** DB **NONE** · wire **NONE** · conf **NONE** · content **NONE** ·
zone format **NONE**.

**PO GUI check ✅ 2026-10-02:** the refusal dialog names the layer, the
document stays open, and the save goes through once the group is deleted.

### P1: deterministic order ✅ 2026-10-02 (uncommitted; PO look owed)

**What landed, item by item (§6):**

1. **Ordered insertion (D6).** New `OrderedLayer.ts`: `addChildOrdered`
   binary-searches the slot by key (upper bound, so equal keys keep arrival
   order) and calls `addChildAt`. Keys live in a `WeakMap`, and an unkeyed
   child counts as +∞, so it stays on top. `Resource.show()` uses it with the
   entity id, which covers every prop class (generated props,
   `PropPlaceholder`, Tree, Stone) in both containers.
2. **Containers (D7).** `layers.resources` is gone. `layers.props.standing`
   (the old `trees` and `minerals`, merged) sits where they sat.
   `terrain.decks` became `layers.props.underfoot` at the same scene
   position. `IGameLayers.props` is typed `{underfoot, standing}`. Tree and
   Stone point at `standing`; their spot decals stay on
   `terrain.resourceSpots` until P2.
3. **NPCs (D9).** The twelve NPC classes construct on the new `mobs.npcs`,
   added last among the mob layers, directly under `characters`.
4. **Server sort.** `core/net.go`: the two duplicated viewport loops became
   `entitiesInView`, which sorts by entity id (`slices.SortFunc`, one
   O(n log n) per viewer per tick).
5. **Spawn order.** `cmd/aurad/zoneset.go`: `propEntities(zones)` builds the
   props in zone order, then file order. `aurad.go` adds what it returns.
   P3 extends it.

- **L6 checked:** nothing in `frontend/src` reads a prop container by child
  index. Three harnesses named the old containers and were repointed:
  `bridge-underfoot`, `c3-flight-client` (its layer-index leg) and
  `hygiene-wire-prune` (a comment). Two stale comments were also updated:
  `aura-convert.js` (extension reinstalled) and `AuraTiledConvert.test.ts`.

**Tests:**

- Go: `TestEntitiesInView_AreInAscendingIDOrderEveryTime` (core) and
  `TestZoneSet_PropsSpawnInZoneFileOrder` (cmd/aurad), both red first
  (undefined), then green. `go build ./...` is clean. Full `go test ./...`
  green except `world.TestPropContent_C1bMigrationPreservesLookAndCollision`:
  **red at HEAD too** (run in a clean worktree at `d0155593`); its package
  depends on nothing P1 touched. Unowned, not P1's.
- vitest: `OrderedLayer.test.ts`, 3 cases, red first (missing module), then
  green. Full suite **1466/0** (62 files). `npm run typecheck` clean.
- **In-game, new harness `p1-prop-order.mjs`: 10/10.** At Eliza's farmhouse,
  every child of `props.standing` mapped to a `world.json` placement (12 of
  12) in ascending file order, and the OakTree (#170) drew over the Cottage
  (#155). It held after a walk-away-and-return (60 u away until both left the
  snapshot, then back). `npcs < characters < props.standing` held (13 < 14 <
  15), an NPC near Eliza drew on `mobs.npcs`, and there were no page errors.
  Expectations are derived from `world.json`.
- `bridge-underfoot.mjs` PASS (no bridge placed, so only the ordering is
  proven). `tools/tiled/verify.sh` all green.
- ⚑ `c3-flight-client.mjs` dies at leg 1, before any prop leg: its campfire
  venues are coordinates from the old 144×72 map. That predates P1, which only
  renamed one container read there. Not repaired here.

**Schema:** DB **NONE** · wire **NONE** (the same fields; only the order of
the entity vector is now fixed) · conf **NONE** · content **NONE** · zone
format **NONE**.

**PO look ✅ 2026-10-02:**

- The done-when holds: oak and house stay stable across a walk-away, a reload
  and a server restart, and Raise/Lower in Tiled, then save and restart, flips
  them.
- D9 is not visible by eye: NPCs collide, so the player never overlaps one.
  The harness's layer-order leg is the evidence.
- PO question: why a restart? The order key is the entity id, which the
  server assigns at boot from its own copy of the zone (D5, no wire field), so
  a reorder is half-live like any zone edit.
- ⚑ Until P3 the order is pure file order, so some overlaps settle the
  "wrong" way once. Don't hand-fix them (§6).

### P2: the legacy classes folded ✅ 2026-10-02 (uncommitted; PO look owed)

**What landed, item by item (§6):**

1. **Classes.** `Resources.ts` is deleted: `Tree` / `RoundTree` / `Mineral` /
   `Stone` are gone, and `Resource` (with its ordered `show()`) moved verbatim
   into `Props.ts`. `BESPOKE_ENTITY_TYPES` is now `{PropPlaceholder}` alone, so
   Tree (`RoundTree`, `roundTree.png`) and Rock + Boulder (`Stone`,
   `stone.png`) are built by the generic path. `gameObjectClasses` points at
   `Props.genericPropClasses.RoundTree` / `.Stone`; `index.ts`'s side-effect
   import now names `Props`.
2. **Decals (D8).** `terrain.resourceSpots` (container + `cameraGroup` entry),
   `GraphicsConfig.resources` and the `treeSpot.svg` / `stoneSpot.svg` assets
   are deleted. Nothing in `frontend/src` read them. ⚑ `wiki-generator/` still
   reads `GraphicsConfig.resources`, but it was already broken (it imports the
   long-gone `client-data/Items`), so it is unowned as before.
3. **`MapProps`** untouched: its style table is keyed by wire names.

- **Why it is the same picture:** a circle body takes no aspect correction, so
  `SimpleProp.initShape` is exactly `GameObject.initShape`
  (`createInjectedSVG` at the streamed size and authored rotation), and the
  PNGs ignore `maxSize`.
- Stale mentions repointed: `add-content` skill (bespoke classes now extend
  `Resource` in `Props.ts`). Left as they are, being true history:
  `server.fbs`'s forest-set comment and `deadTree.svg`'s note on the `treeSpot`
  decal (`server.fbs` untouched keeps wire **NONE** literal).
- **TDD:** vitest cannot import `Props.ts` (webpack `require.context`, no
  shim; `ActiveZone.test.ts` mocks around the same wall), so no unit test.
  The gate is typecheck + the suite + a grep + the harnesses below.

**Tests:**

- `npm run typecheck` clean. vitest **1466/0** (62 files, unchanged from P1).
  `go build ./...` clean (no Go change).
- Grep of `frontend/src` for `resourceSpots`, `Resources.*`, `Mineral`,
  `GraphicsConfig.resources`, `treeSpot`/`stoneSpot`: only two explanatory
  comments (`Game.ts`, `deadTree.svg`).
- **`p1-prop-order.mjs` 10/10** after a restart (Eliza's 12 standing props,
  trees included, map to `world.json` in file order; oak over cottage; holds
  after walk-away-and-return).
- **`bridge-underfoot.mjs` rewritten (rule 8) and PASS:** the deck is above
  `terrain.textures` (4 < 5) and below characters (13); `resourceSpots` is
  absent both as a layer key and by label anywhere on the stage, with a
  control that the same walk finds `characters` exactly once.
- **One-off probe (not kept):** the generic sprite at every Rock/Boulder
  placement and Eliza's nearest Tree is on `props.standing` at exactly
  2 × radius × scale × 120 px with a loaded texture (Boulder 264, Rock 256 at
  scale 1.994, Tree 240), rotation 0 as authored; no page errors.

**Schema:** DB **NONE** · wire **NONE** · conf **NONE** · content **NONE** ·
zone format **NONE**.

### P3: prop layers end to end ✅ 2026-10-02 (PO: "works")

**Preconditions checked:** working tree clean at `815e358c`; `plan-zone-naming.md`
N2 unstarted (its status line; one branch, no other worktree), so L5 held. L8:
the byte-stability tests were green before anything changed (vitest 1466/0).

**What landed, item by item (§6):**

1. **Go zone format** (`world/zone.go`). `PropLayers` holds the four arrays and
   its **field order is the rank** (underfoot, default, buildings, canopy).
   `flatten` walks it in that order and tags each `Prop.Layer` (`json:"-"`).
   `Zone.PropLayers` decodes `props`; `parseZone` flattens it into
   `Zone.Props` (now `json:"-"`) and empties it, so there is one copy and every
   Go reader iterates `Props` unchanged. An unknown layer key refuses through
   `DisallowUnknownFields` (D2), and so does the old flat array (L2).
   - **D4** in `resolve`: a `crossesPaths` placement outside `underfoot`
     refuses the boot as `prop props.default[0]: "Bridge" crosses paths, so it
     must be placed in props.underfoot …`.
   - ⚑ **Beyond the brief:** every prop error (scale, unknown type, the bridge
     pair) now names `props.<layer>[n]` instead of the flat index, which no
     author can find in a layered file (`Zone.propRef`).
2. **Go prop defs** (`world/props.go`): `Underfoot` and the type-level
   "`crossesPaths` needs `underfoot`" check are gone; a stale `underfoot` key
   refuses by name. The `crossesPaths` → `blocksMovement: false` check stays.
3. **Wire:** `Resource.underfoot:bool = false`, appended after `prop_name`.
   Both binding sets regenerated: TS with `flatc_Windows_v24_3_25.exe` and
   `make.sh`'s flags, Go with `go generate ./pkg/api`. `prop.FromZone` sets it
   from `Layer`, `PropEntity` gains `Underfoot()`, and the codec writes it.
4. **Migration:** `scripts/migrate-prop-layers.mjs`, kept as the record.
   - D1's table, file order kept inside each layer. It is all-or-nothing, and
     it refuses an unknown type or any file not already in
     `JSON.stringify(…, null, 2)` form.
   - world.json: 182 = underfoot 5 · default 58 · buildings 12 · canopy 107.
     world_debug: 772. barn 14, koboldCave 24, underworld 2; both tunnels and
     `.debug/underworld` 0.
   - Bridge drops `underfoot`.
   - The embedded copies were refreshed by running the `cp-defs` recipe by
     hand (`make` is not on this box's bash PATH). ⚑ That also refreshed
     `backend/pkg/api/props/stump.json`, stale since `815e358c`.
5. **Converter** (`aura-convert.js`): `PROP_LAYERS` + `PROPS_GROUP`.
   - `zoneToModel` builds `{name: 'props', layers: [4 object layers]}`, bottom
     first. `modelToZone` reads them back by name (`subLayerObjects`).
   - `serializeZone` always writes all four arrays in rank order, empty ones
     included; ZoneModel does the same.
   - A `props` that `zoneToModel` cannot map (the flat array, an unknown layer
     key) refuses to OPEN: a lenient read would lose the props on the next
     save.
   - Validation: D4, by object id, naming `props/underfoot` and Move Objects to
     Layer. The palette's `content.json` gains `CROSSES_PATHS`
     (`generate-palette.mjs`); nothing else in the palette changed.
6. **Extension:** `read()` builds a `GroupLayer`; `write()` walks it
   (`readObjects`, labels `props.<layer>`).
   - `layerRefusals` relaxes P0 for the `props` group only
     (`propsGroupRefusals`): any subset of the four object layers, each once;
     anything else inside it refuses as `props/<name>`.
   - Also refused: `props` as a plain object layer, a prop layer dragged out of
     the group, and ⚑ (beyond the brief) **two layers with one name**, at the
     top level and inside the group, since the writer reads the first by name
     and the second would vanish.
   - `aura-fit-size.js` recognises a prop by its layer's PARENT.
   - **L7 measured** with a throwaway probe extension under `--export-map`
     (Tiled 1.12.2): `GroupLayer`, `addLayer`, `layerAt` / `layerCount`,
     `isGroupLayer` and `parentLayer` (on a layer and via `object.layer`) all
     work headless, and child order is insertion order (index 0 = bottom). The
     walk is one function of one group, ready for P4.
7. **Client zone readers:** `features/zones/logic/PropLayers.ts`
   (`PROP_LAYERS`, `flattenProps`, `groupProps`), pure.
   - `DarknessOverlay` (torches) and `MapTerrain` (the bake) flatten through
     it; `ZoneJSON.props` is typed per layer.
   - `ZoneModel` keeps a flat list in the server's spawn order (rank, then
     file order) with an in-memory `layer` per prop. `addProp` appends into
     `default`; `updateProp` KEEPS the layer (the panel rebuilds a prop with
     none); `getZoneAsJSON` regroups and never writes `layer`.
8. **Client render:** `Props.ts` picks the container from the streamed
   `underfoot` per entity (the 7th argument of EntityManager's constructor
   seam). `PropDefJSON.underfoot` and the "mixes underfoot" throw are gone.
9. **Other readers:** `p1-prop-order.mjs` (spawn order, labels like
   `canopy[101]`), `map-props-bake.mjs`, `c2-world-walk.mjs`,
   `scripts/zone-census.mjs` (`propsOf`), `scripts/probegen.mjs`.
   `bridge-underfoot.mjs` gained a leg (below).
   - Left alone, being already-run one-offs: `double-world-vertical`,
     `recenter-world-y`, `scale-world-15x`; `world-place.py` never touched
     props.
   - `cmd/simharness` reads zones through `world`, so it needed nothing. Its
     four placement tests were red only until the embedded Bridge lost its key.
10. **Docs:** `manual-content-authoring.md` §1b (no layer on a type, the four
    arrays and their table, the D4 rule; also the stale `Resources.ts` line P2
    left behind), the `add-content` skill, and ⚑ `manual-tiled-editor.md` (the
    layer table and a prop-layer subsection). The last was not in the brief,
    but it described the old single layer.

**Tests:**

- **Go:**
  - `zone_props_test.go`: the flatten order across all four layers with keys
    written in reverse (D5's pin); struct field order = flatten order (so the
    vitest scrape is valid); an unknown layer and the flat array refused.
  - `paths_bridge_test.go`: a bridge outside underfoot refused as
    `props.default[0]`; any prop allowed underfoot, and still blocking; the
    type key refused.
  - Codec: `TestPropEntityFlatbufMarshal_UnderfootRidesTheWire`.
  - 22 inline fixtures moved to the object shape.
  - ⚑ **TDD, honestly:** the codec test was red first. The flatten tests were
    written alongside the code; swapping two ranks in `flatten` turned both
    red, then the swap was reverted.
  - `go build ./...` clean. `go test ./...` green except the known
    `world.TestPropContent_C1bMigrationPreservesLookAndCollision` (the same
    Tree / Boulder messages as at HEAD).
  - ⚑ `auth.TestMissingAccountStillCostsABcryptCompare` failed once in the
    PRE-change baseline under full-suite load and passed after: a timing
    flake, not P3's.
- **`aurad -validate`:** 0 findings for `-content ../api`, for `-debug-zones`,
  and for the embedded copy.
- **vitest 1480/0** (62 files, was 1466). `npm run typecheck` clean.
  - `AuraTiledConvert.test.ts`: the rank scraped from zone.go's `PropLayers`
    against BOTH `C.PROP_LAYERS` and the client's `PROP_LAYERS`; a four-layer
    round-trip; empty arrays written; the open refusals; D4; the group
    refusals (subset, stray child, flat `props`, stray prop layer, duplicates).
  - `ZoneModel.test.ts` (L3): flat order, each prop back in its own array,
    add → `default`, an edit keeps its layer, a removal leaves the right array,
    no `layer` key in the file.
  - The real world.json stays byte-stable through both writers.
- **`tools/tiled/verify.sh`: 28 ✅ / 0 ❌**, extension reinstalled.
  - New: a stray `props/roofs` layer injected into the TMX group refuses
    (control: the same map saves); a Bridge in `default` refuses.
  - The scaled-props fixture now spans all four sub-layers, so a real Tiled
    save round-trips the group byte-identically.
  - Footer step 10 lists the GUI checks.
- **In-game** (`dev-restart-windows.sh all`, webpack dev):
  - `p1-prop-order.mjs` **10/10**: Eliza's 12 standing props in spawn order;
    the oak (`canopy[101]`) over the cottage (`buildings[5]`) with no hand
    edit, held after a walk-away-and-return; `npcs < characters < standing`.
  - `bridge-underfoot.mjs` **PASS**, including its new leg: the Bridge at
    `props.underfoot[0]` (-181.02, 8.57) draws on `props.underfoot` and not on
    `standing`, which is the per-entity wire flag working end to end.
  - `map-props-bake.mjs` **7/7** (182 of 182 baked; underworld 2 of 2).
  - `hygiene-wire-prune.mjs`: 698 sprites decoded off the Resource path,
    0 console errors, 0 WebGL losses.
- **Wire cost:** `TestPropEntityFlatbufMarshal_RealPropCostsNothing` is green
  unchanged. Its reference table has no `underfoot` slot, so every placement
  outside `underfoot` (177 of 182 in world.json) encodes byte-identically.

**Schema:** DB **NONE** · wire **+1 field** (`Resource.underfoot`, zero bytes
when false) · conf **NONE** · prop defs **−1 key** (Bridge `underfoot`) · zone
format **BREAKING** (`props` → four arrays; all 16 files, 8 + 8 embedded,
migrated; no compatibility window, L2).

**PO checks owed** (the server and webpack are already restarted on P3, and
the extension is installed):

1. Eliza's farmhouse (-238, 15.6): the oak draws over the cottage roof, by
   layer, with nothing hand-ordered.
2. In Tiled, every zone (world, barn, koboldCave, tunnel, underworld) shows
   `props` as a group of canopy · buildings · default · underfoot. Hide
   `canopy`: the crowns vanish.
3. Move the torch at `default[57]` (-239.2, 24, by the Gate) into `buildings`
   with Layer ▸ Move Objects to Layer, save, restart: it draws over the gate.
4. Move the broken crate at `default[54]` (-194.7, 27.7, by the RuinedHouse)
   into `underfoot`, save, restart, walk over it: it draws under the player
   and still blocks.
5. Drag a Bridge into `default` and save: the save refuses, naming the object.
   Then revert the test edits, or keep them as authored content.

**PO review ✅ 2026-10-02:** *"works"*. One observation, logged in
`docs/feedback.md` and out of scope here: the underworld entrances (the
`CaveMouth` MOB, a travel conversant) now draw UNDER the `CaveMouth` / `Barn`
prop they stand in. That is P1's D9 (NPCs on `mobs.npcs`, under the
characters, while props stand above them), not P3. PO: *"not convinced these
should be NPCs and not a sort of interactable prop? but not for this plan."*

### P4: area groups ✅ 2026-10-03 (PO: "i checked all")

**Preconditions checked:** tree clean at `b058eb5c` (N2 landed, L9 held).
Baseline before any change: vitest 1481/0; Go green except the known
`world.TestPropContent_C1bMigrationPreservesLookAndCollision`.

**What landed, item by item (§6):**

1. **Go** (`world/zone.go`).
   - `Objects` holds every object array; `Zone` and `Area {ID; Objects}` both
     embed it, so the two cannot disagree about what an area may hold. An
     area with any other key (name, bounds, ground, a typo) refuses through
     `DisallowUnknownFields`.
   - Every object type embeds `InArea` (`Area string json:"-"`).
     `Zone.flatten` (in `parseZone`, after `validateAreaIDs`, before
     `validate`) appends each area's objects kind by kind, tagged, and
     empties `Areas`. Props go through `flattenProps`: rank outer, then zone
     level, then area by area (D11). The `aurad.go` spawn loop is unchanged.
   - D12 in `validateAreaIDs`: slug, unique, not one of `objectKindNames()`
     (derived from `Objects`' tags, so a new array is reserved with it).
   - **Messages name the area:** `objectRef` counts the index inside the
     object's own array: `spawn 1 in area "b": level 0 must be >= 1`.
     Zone-level messages read exactly as before. `propRef`, the outline /
     effect / path-shape helpers and the two area-effect cross-validations
     (`area_effects.go`) take the same ref.
   - Uniqueness stays ZONE-WIDE across areas (anchor names, bind point ids):
     validate runs on the flattened slices.
2. **Converter** (`aura-convert.js`).
   - `zoneToModel`: the zone-level stack as before, then one group per area in
     file order, each `kindLayers(area, 'id/')`: the full layer set, the props
     group with its four sub-layers, `regions`/`atmospheres` locked (D13). The
     P3/N2 open refusals also run inside every area.
   - `modelToZone`: `readKinds` per group; every top-level group except
     `props` is an area (`areaGroups`), its name the id.
   - `serializeZone` → `serializeObjects(group, inArea)`: the zone level
     writes as before; an area writes no empty array (prop layers included)
     and stays `{id}` when empty, so the author's group survives a save.
     `areas` follows `anchors`, zone.go's order.
   - Validation runs per scope with shared uniqueness maps; labels read
     `farmlands/spawns`, `farmlands/props.canopy`. Area ids are checked as in
     Go. `polygonNotices` reads every area's paths layer.
   - `layerRefusals`: a group other than `props` is an area (`areaRefusals`):
     the zone's layers and a props group, each once; anything else (an
     unknown layer, `props` as an object layer, a prop layer outside the
     group, a nested group, a filled tile/image layer) refuses as
     `area/layer`. A badly NAMED area drops nothing, so its name is
     validateModel's. `OBJECT_KINDS` exported and pinned.
3. **Extension** (`aura-world-format.js`): `tiledLayer` builds groups and
   `modelLayer` reads them recursively. `aura-fit-size.js` needed nothing.
4. **`ZoneModel.ts`**: `fromJSON` runs the shared flatten and keeps `areaIds`;
   every object type extends `InArea` (in memory only); `getZoneAsJSON`
   regroups through `objectsJSON(area)`, byte-identical to the converter. A
   new in-game placement is zone level; `updateProp` / `updateSpawn` /
   `updateDarkArea` and the new `updateAnchor` keep the area
   (`ZoneEditor.updateAnchor` used to write the array directly). Decals carry
   their area through `GroundTexture.Parameters.area`, because the editor
   re-reads them from the texture store at export.
5. **Client zone readers:** `features/zones/logic/ZoneAreas.ts`
   (`OBJECT_KINDS`, `flattenAreas`), applied once in `GroundTextureManager`'s
   `bundleByStem`, the one place a bundled zone is picked (L10: the only other
   `require.context` over `api/zones` is the in-game editor's, which goes
   through `ZoneModel.fromJSON`). Area objects carry `area`; zone-level ones
   carry no key; a zone without areas comes back as the same object.
6. **The cross-language pin:** `world/testdata/area-flatten.json`, two areas
   and every kind, with the expected order and area per object. Go
   (`TestZone_AreasFlattenLikeTheClient`) and vitest (`ZoneAreas.test.ts`)
   both assert against it; both `OBJECT_KINDS` copies are scraped from
   zone.go's `Objects`.
7. **Docs:** `manual-tiled-editor.md` §3 "Areas", `manual-content-authoring.md`
   §1b. **Harnesses:** `p1-prop-order.mjs` and `map-props-bake.mjs` flatten
   areas when deriving expectations.

**Tests:**

- **Go:** `zone_areas_test.go`, 7 tests, red first (undefined `Area`), then
  green. ⚑ Mutation: flattening areas before the zone level turned the fixture
  pin red; reverted. `go build` / `go vet` clean; `go test ./...` green except
  the known C1b test.
- **`aurad -validate`:** 0 findings for `-content ../api`, `-debug-zones` and
  the embedded copy. A copy of `api/` with world.json content moved into two
  areas plus an empty one: **0 findings, still 182 props / 393 spawns**; with
  an id `Dark Woods`, refused by name.
- **vitest 1511/0** (63 files; +30), the new legs red first. The P0 legs P4
  deliberately changes were rewritten (a group is now an area; the trap fires
  one level down as `trees/props`). The completeness pin's fixture gained an
  area. `npm run typecheck` clean.
- **`tools/tiled/verify.sh` 32 ✅ / 0 ❌**, extension reinstalled. New:
  world.json with content of most kinds moved into two areas plus an empty one
  round-trips **byte-identically through real Tiled** (area > props > canopy);
  a stray `roofs` layer in an area and a group renamed `Farmlands` both refuse
  with nothing written. Footer item 11 lists the GUI checks.
- **In-game** (`dev-restart-windows.sh all`): shipped zones `p1-prop-order`
  10/10, `map-props-bake` 7/7, `bridge-underfoot` PASS. ⭐ **With world.json
  temporarily rewritten into two areas** (Eliza's oak in `farmlands`, her
  cottage in `dark-woods`, 100 spawns, decals, regions, paths, an atmosphere,
  bind points, an anchor moved; restored and restarted after):
  `p1-prop-order` 10/10, the server's spawn order matching the area-aware
  flatten prop for prop, and `map-props-bake` 7/7 (182 of 182).

**Schema:** DB **NONE** · wire **NONE** · conf **NONE** · content **NONE** ·
zone format **+1 optional key `areas`** (additive; no zone authors it, every
file byte-identical).

⚑ **Left open:**

- **D13's cost is unmeasured:** whether Tiled reopens area groups expanded.
  Headless cannot see it (footer item 11).
- **Other harnesses read world.json's zone-level arrays raw** (~30, for
  venues). Once content moves into areas, one whose venue moved goes
  INCONCLUSIVE, not wrong. `scripts/zone-census.mjs` and `probegen.mjs` also
  count the zone level only.

**PO checks owed** (server and webpack restarted on P4, extension installed):

1. In Tiled, Layer ▸ New ▸ Group Layer `farmlands` at the top, save, reopen:
   it holds the full layer set, `regions` / `atmospheres` padlocked. Does it
   reopen expanded, and does a list of areas read acceptably (§10.4)?
2. Move a few anchors, a spawn and a tree into it (Move Objects to Layer),
   save, restart: the game is unchanged, and world.json has them under
   `areas[0]`.
3. Rename the group `Farmlands` and save: refused, naming the group.

⚑ **Superseded by P4b:** checks 1 and 3 above assumed the group's NAME is the
id. Since P4b a group must carry the class `AuraArea` and an id picked from
the dropdown; the P4b ledger below lists the checks that replace them.

### P4b: area ids from one list ✅ 2026-10-03 (PO: "i checked all")

The PO confirmed D15's id table by asking for P4b to be built ("Do P4b and
P4c"), so `api/areas/areas.json` ships the table as proposed.

**Built:**

- **Content:** `api/areas/areas.json`, `{"areas": [22 ids]}` in D15's table
  order. It joins `contentSources` (`areas`), `embeddedContent` (new embed
  package `pkg/api/areas`), `diskContent`, the Makefile's `cp-defs` and
  `validate_test.go`'s copy list.
- **Go:**
  - `world/areas.go`: `LoadAreaIDs` (strict decode, a non-empty list, every id
    under D12's rule) and `CrossValidateAreaIDs` (every zone area must be
    listed; all failures joined).
  - `world/zone.go`: D12's rule is now `checkAreaIDs`, shared by the list and
    each zone. `Zone.AreaIDs` (`json:"-"`) keeps the ids once `flatten` has
    emptied `Areas`, so an area that holds nothing is still checked.
  - `cmd/aurad`: an `areas` load stage with no dependencies; the zones stage
    skips without it. `loadZones` runs the cross-check beside the
    area-effect passes. This follows `area_effects.go`'s precedent: the list
    is not threaded through ~70 `LoadZoneFS` call sites.
- **Palette** (`generate-palette.mjs`):
  - the `AuraAreaId` enum, `(pick an area)` first, then the list;
  - the `AuraArea` class (`useAs: ["layer"]`) with one member, `id`.
  - Both are appended LAST, so no existing type id renumbered (the diff is
    additions only).
  - `content.json` gains `AREA_IDS`.
- **Converter:**
  - A group is an area when its class is `AuraArea` (`areaGroups`). Its id is
    `areaId(g)`: the typed `id` property decoded through `plainValue`, absent
    reading as `AREA_UNSET`. It is never the group's name.
  - On read, each area opens named by its id with class + typed property.
  - validateModel refuses no id picked, a malformed id, an unlisted id and
    one id on two groups.
  - layerRefusals refuses a group that is neither `props` nor an `AuraArea`.
    A duplicate name involving an area gets its own message: the name is
    only a label.
  - An area group is never mistaken for the props group, whatever its label.
- **Extension** (`aura-world-format.js`): a group carries `className` and
  typed properties on read, and reports `cls` and `properties` on write.

**Verified:**

- **Go green bar the known C1b test.** New tests:
  - `areas_test.go`: the list loads in order; a bad list is refused six ways
    plus a missing file; an unlisted area is refused, an empty one included.
  - `TestLoadZones_RunsTheAreaListCheck`, at the boot seam.
  - `TestEmbeddedAreaList_LoadsAndMatchesSource`.
  - The cross-language fixture's ids are checked against a test list.
- **`-validate` 0 findings**: embedded, `-content ../api` and `-debug-zones`.
- **vitest 1518/0**, typecheck clean.
  - New describe "area ids from the list (P4b)", 7 tests: palette shape,
    read side, the rename keeps the id, typed decode, the three no-id forms,
    unlisted and duplicate ids, a classless group not read as an area.
  - The P0/P4 tests now mark area groups by class.
- **`verify.sh` 35 ✅ / 0 ❌**, extension reinstalled.
  - The area round-trip uses listed ids. New leg: the group is renamed AND
    its id stored as a typed `propertytype="AuraAreaId"` (what the GUI
    writes), and it saves byte-identically under `farmlands`.
  - `area-stray`, `area-unlisted`, `area-noid` and `area-noclass` each refuse
    with nothing written, and each leg first proves its edit applied.

**Schema:** DB **NONE** · wire **NONE** · conf **NONE** · content **+1 file**
(`api/areas/areas.json`) · zone format **NONE** (an area id must now be
listed).

**PO GUI checks owed** (verify.sh footer item 11):

1. New Group Layer: save is refused (not an area).
2. Class `AuraArea`: does the `id` DROPDOWN show on a group layer? This is
   the one thing headless cannot prove (§10.6).
3. With the id still at `(pick an area)`: save is refused.
4. Pick an id and save: it reopens named by its id, with the dropdown kept.
5. Rename the group: the file does not change.

### P4c: world.json migrated into areas ✅ 2026-10-03 (PO: "i checked all")

**Built:**

- **`scripts/migrate-areas.mjs`** (D16), all or nothing, canonical input
  only; once areas exist it refuses.
  - Titled region → area per D15's table, the Strand into `farmlands`.
    Membership by the game's lookup (the last containing region): a point by
    its position, a shape only when all its vertices land in one area.
  - Order-preserving: footprints are padded by `--margin` (3 u by default;
    the result is identical at 1 and 5 u). The earlier object of an
    overlapping pair that would reorder stays at the zone level, repeated
    until stable. A titled region is never demoted: a real overlap that
    reorders refuses the run, and a near miss inside the margin is printed
    as a seam notice.
  - The script then checks itself: it folds the areas back (D11) and
    refuses if any object changed or vanished, or if any overlapping pair is
    reordered.
- **The result**, 22 areas:
  - Into areas: spawns 393/393, props 182/182 (all four layers), bind points
    45/45, anchors 10/10, decals 8/8, regions 23/23.
  - Paths 14/28, structures 8/11, atmospheres 19/25.
  - The 23 left at the zone level are, by original index:
    - paths 0-4, 12, 17-22, 24, 25: the river, cliffs, roads and Brunnstedt's
      walls;
    - structures 2, 6, 9;
    - atmospheres 0, 1, 2, 5, 6, 17.
  - Seven of those stay for order rather than spanning areas:
    - paths 1, 17, 19, 21, 22;
    - atmospheres 1, 5.
  - The census's "19 of 28 paths" counted vertices inside regions, without
    the order rule.
- **The readers taught areas:**
  - `.claude/skills/verify/lib/zone.mjs` (`readZone`/`flattenZone`, D11), now
    used by `a4-clearing`, `a5-darkness-blend`, `bridge-underfoot`,
    `c2-world-walk` and `c4-region-texture`.
  - `c2-mob-level` finds its probe by mob and position. ⚑ Its probe Stag was
    already gone before P4c (index 213 is a Bear), so it still says
    "re-pick the probe".
  - `verify.sh` builds its fixtures from a flattened copy (leg 1 still
    round-trips the real file).
  - `world-regions.py` flattens spawns.
  - `world-place.py` refuses a zone with areas: it rewrites zone-level
    spawns only. Untested, since there is no Python on this box.
  - Two tests read world.json raw and now sum or flatten across areas:
    `AuraTiledConvert.test.ts` "maps every array…" and "the layer stack…",
    and `ZoneModel.test.ts` "respawn-free".

**Verified:**

- **Go loads the same world.** A throwaway test (deleted after) parsed the
  pre-migration file and the migrated one: every kind holds the same objects
  (props 182, spawns 393, bind points 45, regions 23, paths 28, structures 11,
  atmospheres 25, anchors 10, decals 8). All 182 props carry an area, and the
  ids come in table order.
- **Go green bar C1b**, with the embed refreshed (`cp-defs` by hand: no
  `make` here). **`-validate` 0 findings ×3.** **vitest 1518/0.**
  **`verify.sh` 35 ✅ / 0 ❌**: the migrated world.json round-trips through
  real Tiled byte-identically (204213 bytes; +36 KB, because nested objects
  indent deeper).
- **In game** (`dev-restart-windows.sh all`):
  - `p1-prop-order` 10/10. Eliza's oak `farmlands/canopy[49]` still draws
    over her cottage `farmlands/buildings[5]`, in spawn order.
  - `map-props-bake` 7/7 (182 of 182).
  - `bridge-underfoot` PASS.

**Schema:** DB **NONE** · wire **NONE** · conf **NONE** · content: world.json
rewritten into `areas` (no format change).

⚑ **For the PO:**

- ⭐ **One seam may look different.**
  - Deep Woods (region 2) and Saltgrass Strand (region 15) come within 0.41 u
    near (-184, -28). The Strand now draws BEFORE Deep Woods (it moved into
    `farmlands`, D16), so where their feathered edges meet, Deep Woods'
    1.5 u band lies over the Strand's instead of under it.
  - The region LOOKUP is unchanged: the two do not overlap.
  - Wrecker's Bluff and the Strand also swap, but they sit 5.29 u apart
    with 0.5 u bands, so nothing meets.
  - Look check: `WARP` to about (-184, -28).
- **The workflow risk the PO named.** Every region and nearly every object
  now opens inside an area group, 22 of them, each with 14 layers. D13's
  "does a long list read badly" (§10.4) is now a real-world question, not a
  hypothetical.
- **Still zone-level only:** `scripts/zone-census.mjs` and `probegen.mjs` (dev
  scripts, not taught), and the one-off historical scripts
  (`scale-world-15x`, `double-world-vertical`, `recenter-world-y`).
- **Revert path (D16):** fold the areas back. The game treats the result
  identically, and the pre-migration file is `git show HEAD:api/zones/world.json`.

**PO pass, 2026-10-03:** *"i checked all"*: the P4/P4b GUI checks (the `AuraArea` dropdown on a group layer included) and the Deep Woods / Strand seam. Pre-commit re-run on a fresh boot: `p1-prop-order` 10/10, `map-props-bake` 7/7, `bridge-underfoot` PASS.
