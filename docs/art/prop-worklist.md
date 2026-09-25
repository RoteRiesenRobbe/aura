# Prop worklist - the artist's cut

The *source of truth* stays [`assets.csv`](assets.csv) / [`assets.md`](assets.md).
This file is a working re-cut of the same rows: **only what is still open**,
grouped so one drawing feeds several props.

State: `placeholder` = an SVG exists, look at it first. `shared` = it wears
another asset's art. `missing` = blank page.

> ⚑ **Greyscale is a drawing-time trick here, not a shipping format.** Props are
> not runtime-tinted - nothing in `game-objects/` recolours a prop sprite. So
> paint value-first if that is faster for you, but **commit the coloured PNG**.
>
> ⚑ Format per [`pipeline.md`](pipeline.md): PNG, power-of-two square canvas at
> **2x the on-screen px** below, art filling **82%** of that canvas. Rect props
> (cart, barn, gate) carry their aspect in the file, like `house.svg`.

---

## A. Environment props - top-down, no frame, no portrait rule

### A1. Canopy family - one whorl set feeds four

The whole group is the same leaf material at different densities.

| Prop | Prio | State | px |
|---|---|---|---|
| Tree | - | **drawn - your master** | 492 |
| Tree variant 2 | **P0** | placeholder | 216 |
| Tree variant 3 | P1 | missing | - |
| Bush | P1 | placeholder | 108 |
| Fern | P2 | missing | - |
| Tree ground spot | - | drawn - **re-cut if a silhouette changes** | 344 |

⭐ A variant must differ in **silhouette**, never just hue. `roundTree` is a
smooth disc; variant 2 is a spiked wheel. Variant 3 needs a third outline.
Bush = one whorl shrunk. Fern = a few fronds sliced off a whorl.
⚑ Bush is **non-blocking by definition** - the only forest filler you can
scatter by the hundred without adding a collider.

### A2. Bare wood - one trunk cross-section + one bark strip feeds four

No leaves anywhere in this group; it is all end grain and bark.

| Prop | Prio | State | px |
|---|---|---|---|
| Dead tree | P1 | placeholder | 228 |
| Fallen log | P2 | placeholder | 288 x 84 |
| Stump | P2 | placeholder | 132 |
| Fence post | P2 | placeholder | 53 |

⭐ Dead tree is the **strongest silhouette in the forest set and it is free**: a
living tree from above hides its own structure, a dead one *is* the structure.
Its cast shadow is the asset. Log = the same trunk laid down. Stump + fence post
= the same end-grain disc at two sizes - the stump must read **cut**, not broken.

### A3. Rock - one silhouette away from done

Boulder and Rock are currently the *same `stone.png` scaled*, which is why the world has
exactly one rock shape.

| Prop | Prio | State | px |
|---|---|---|---|
| Boulder | **P0** | shared | 456 |
| Rock | P1 | shared | 192 |
| Mossy rock | P2 | missing | - |
| Mineral ground spot | - | drawn | ~0.7x |

Two real silhouettes = the cheapest environment win after trees. Mossy rock is a
moss layer over either one.

### A4. Farm timber - one plank sheet + one iron band + one wheel feeds five

| Prop | Prio | State | px |
|---|---|---|---|
| Cart | P1 | placeholder | 264 x 156 |
| Burnt cart | P1 | placeholder | 264 x 156 |
| Plough | P2 | missing | - |
| Crate | P3 | placeholder | 108 |
| Trough | P3 | missing | - |

Burnt cart = the cart file with a char pass - the one place a value-only variant
is genuinely correct. ⚑ Cart's shaft points **west** in the art; a rect prop
turns with its collider, so placement rotation handles direction.

### A5. Fence line - one post + one rail + one hinge feeds four

| Prop | Prio | State | px |
|---|---|---|---|
| Palisade segment | P1 | placeholder | 288 x 96 |
| Broken fence | P1 | placeholder | 240 x 192 |
| Gate | P2 | placeholder | 240 x 192 |
| Fence post | P2 | placeholder | 53 |

Fence post also lives in A2 - draw it once, in the bark material. It exists to
**terminate a hedgerow path**, which has no end-cap art, so it is the post's end
grain seen top-down, no rail stubs (a path leaves in any direction and prop
rotation is never applied).

### A6. Buildings - roof material is the whole separator

| Prop | Prio | State | px |
|---|---|---|---|
| House | - | **drawn - your master** (tiled gable) | 480 x 360 |
| Cottage variant | P1 | placeholder | 360 x 312 |
| Barn | P1 | placeholder | 720 x 480 |
| Mill | P2 | placeholder | 600 x 480 |

⭐ The village is currently **12 copies of House**. Cottage separates on
**material first, shape second**: house = tiled gable (ruled courses), cottage =
thatch. Barn = a big rectangle in either roof sheet. Mill = barn + wheel + race.
⚑ Aspect is load-bearing - anything off-ratio visibly squashes.

The thatch sheet you draw here is the **same material as the haystack** (A7).

### A7. Straw - draw the material once

| Prop | Prio | State | px |
|---|---|---|---|
| Haystack | P1 | placeholder | 204 |

⚑ The first draft read as a tree stump: a clean circle with concentric rings and
even radial lines *is* growth rings. Irregularity is what makes it straw. Feeds
the cottage thatch roof.

### A8. Masonry - one stone-block sheet feeds three

| Prop | Prio | State | px |
|---|---|---|---|
| GateWall | P1 | drawn - **must tile seamlessly** (24 sit shoulder to shoulder) | 288 x 288 |
| Well | P1 | placeholder | 168 |
| Bridge deck | P1 | missing | - |
| Cave mouth frame | P1 | placeholder | 360 x 288 |

Well = stone ring, open shaft, thin winding beam, **no roof** (it would hide the
hole that identifies it). Bridge = plank deck (A4 sheet) + stone abutments. Cave
mouth borrows the boulder master. ⚑ Bridge deck must author `crossesPaths:true`
**and** `blocksMovement:false`, or it walls its own deck.

### A9. One-offs - no family

| Prop | Prio | State | px |
|---|---|---|---|
| Torch | P1 | placeholder | 62 |
| Tent | P2 | missing | - |
| Mushroom cluster | P3 | missing | - |

⭐ Torch is **the only prop that emits light** (half a campfire radius, 3.5 u).
About a player wide. Tent is canvas - the only fabric in the prop set, bandit
camp.

---

## B. Interactables - the framed set

These are **entities, not scenery**: a player walks up and something happens.
They carry a nameplate and the medallion layer stack, so they follow
[`medallion-asset-spec.md`](medallion-asset-spec.md) (512² shared canvas, ring +
rim per family), not the A-list rules above.

### B1. Fire

| Object | Prio | State |
|---|---|---|
| Campfire | **P0** | drawn |
| Camp (your own temporary fire) | P1 | **shared with Campfire** |

⭐ Campfire is the most important friendly object in the game - bind point,
respawn point, heal, fast travel. Players navigate by these. **Camp currently
wears the same art at 60 px instead of 120 px, so size is the only cue that it
is temporary** - own art here is a gameplay fix, not polish.

### B2. The monument problem - four objects, one signpost

⭐ **The biggest single art defect in the game right now.** Four distinct objects
all render `signpost.svg`:

| Object | Prio | State |
|---|---|---|
| AscensionStone | **P0** | shared - signpost.svg |
| MemorialStone | P1 | shared - signpost.svg |
| FrontAscensionStone | P1 | shared - signpost.svg |
| Signpost / ForestSign | P1 | the actual sign - own art missing |

AscensionStone is where a max-level character is **spent** - the game's most
significant object, currently a road sign. MemorialStone carries the names of
everyone ascended and **stands right beside it**, so the village shows two
identical signposts side by side. FrontAscensionStone is the same monument kind
in a war-front setting (level 25).

Three stones + one sign. The stones are one kit-bash family (same stone
material, different crown and inscription); the sign is A2 bark + a board.

### B3. Summons - drawn, nothing owed

Totem, FireTotem (siblings, differ by drawing only), Companion, Soldier-,
Shieldbearer- and MedicCompanion. All **P3, all drawn.**

---

## Priority roll-up

**P0 (4):** Tree variant 2 · Boulder + Rock silhouettes · Campfire ·
AscensionStone.

**P1 (16):** Tree variant 3 · Bush · Dead tree · Broken fence · Palisade ·
Haystack · Cart · Burnt cart · Well · Barn · Cottage variant · Bridge deck ·
Cave mouth frame · Torch · Signpost · Camp + Memorial/FrontAscension stones.

**P2 (9):** Fern · Stump · Fallen log · Fence post · Gate · Mill · Plough ·
Mossy rock · Tent.

**P3 (3):** Crate · Trough · Mushroom cluster.

**Fastest path to a visibly different world:** A1 (a second and third tree
silhouette - 573 placements ride on it), then A3 (two rock shapes, 168
placements), then A6 cottage (the 12-copy village).
