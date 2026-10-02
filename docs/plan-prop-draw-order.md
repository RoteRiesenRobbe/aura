# Plan: prop draw order: deterministic stacking, prop layers and area groups authored in Tiled

**Status:** DESIGNED 2026-09-20, **REVISED 2026-10-02** (PO session: D1, D3,
D4, D8 and D9 ruled the same day), nothing built. Five chunks: P0 → P1 → P2 →
P3 → P4. P4 (area groups) was added on 2026-10-02 at the PO's request; its
decisions D10-D14 are PROPOSED. Line refs come from a survey of HEAD `3bff5220` on 2026-10-02; re-verify
them before executing.

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

### P4: area groups (PROPOSED, design in §10; after P3 and N2)

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

### Open

- **D10, D13, D14 (P4, §10):** a nested `areas` section rather than a tag;
  every area showing the full kind set in Tiled; area over kind as the
  hierarchy.
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

## 10. P4 design: area groups (PROPOSED)

PO, 2026-10-02: *"Ultimately I would also like to be able to have a container
level on top for regions. eg. "Farmlands" -> anchors, atmorspheres and "Dark
Woods" -> anchors, atmospheres. This has nothing to do with depth sorting though
and is primarily for my Tiled editing convenience, although the game could also
use that info for other things in the future."*

Later the same day: *"i also want [it] added to the plan as P step in the end.
i suppose this will also change json structure by adding a regions section, or
do you have a better proposal?"*

### 10.1 D10: a nested section, not a per-object tag

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

### 10.4 D13: every area shows the full kind set in Tiled

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

### 10.5 D14: area over kind (the PO's ask), with one Tiled-only discrepancy

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

---

## 11. Chunk ledgers

(empty, nothing built)
