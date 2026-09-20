# Plan: Filled polygons — a blocking AREA primitive, and outlines for both

> **Status:** designed 2026-09-09 (PO session). **P1-P4 ALL SHIPPED 2026-09-10**
> (ledgers §12), plus a P3 rider 2026-09-12 fixing the collider poking out of
> slanted outlines. ⚑ The three [PLACEHOLDER] tuning numbers are unjudged and
> COUPLED — see §12 "What is OWED".
> **Owns:** `zone.polygons` (a new authored array + Tiled class `AuraPolygon`),
> the filled-area collider, and `outlineProfile`/`outlineWidth` on both polygons
> and paths.
> **Sibling of:** `plan-world-paths.md` (stroked polylines) and
> `plan-region-primitive.md` (ground material + future quest triggers). Shares
> their profile table and their paint code; shares neither's type.
> **Schema:** DB none · wire none · conf none · **zone format: one new array +
> two fields on two types**, all absent-safe.

---

## 1. What this is

Three things the world cannot currently express, in one primitive plus one field:

1. **A filled area that is not a ground material.** A rock mass in the
   underworld, a building footprint, a lake you cannot swim. `regions` fill, but
   a region is a *material* answering `resolve()` for footsteps, music and
   (soon) atmosphere, and is heading for quest-trigger identity. A cave wall is
   none of those things.
2. **A filled area that BLOCKS.** No world geometry stops movement over an
   *area* today: props block at their own footprint, path corridors block along
   a line, and the border wall is one rectangle. `plan-underworld.md` §7.1 item
   1 already rules cave walls should be blocking geometry rather than props —
   this is the shape that ruling wants when the wall is a mass rather than a
   ribbon.
3. **An outline.** A river with banks, a wall with a mortar edge, a cliff with a
   lip. Today the only way is a second coincident object kept in sync by hand.

### 1.1 ⭐ Why this is a new type and not a flag

The session started at the other end — a `polygon: bool` on `AuraPath` deciding
fill-vs-stroke — and the divergence killed it. Once filled areas block, a
polygon and a path disagree about **three of their seven properties**:

| | stroked path | filled polygon |
| --- | --- | --- |
| `width` | required, load-bearing | **meaningless** |
| collider | rotated rect chain along segments | **inset rotated boundary + coarse interior fill** |
| closure | open or closed | **always closed** |
| minimum points | 2 | **3** |
| profile · blend · scroll · outline | shared | shared |

⭐ **And the codebase already ruled this exact question once.**
`world.Path`'s own doc comment says it: *"Deliberately its own array rather than
a Region with a width (D2). … One array meaning two things would make both
harder."* A bool would make `width` a field that is required half the time,
give the validator conditional rules instead of its own messages per class, and
put a "which branch am I in" question in front of every Go reader of the
collider. Tiled's Properties panel is a real authoring surface, and a class that
shows only its own fields is the whole reason `AuraPath` is a class.

⛔ **This does NOT absorb regions.** Regions stay their own type, their own
array, their own `resolve()`. Only the *draw calls* are shared, which is already
how paths work.

---

## 2. What already works — checked, not assumed

- `paintSurface` (`RegionPaint.ts:380-420`) already takes a **draw callback** and
  handles all three cases — hard, feathered, drifting — for any silhouette. A
  fill callback is `g => g.poly(points).fill(style)`, which is literally what
  `paintRegions` passes today.
- `blend` is **per profile** (`profiles.json`), not per shape. This is what makes
  the outline question answer itself (§4.3).
- `Corridor` (`paths_collision.go:19`) already expresses **both** a rotated rect
  (Length/Width/Angle) and a circle (Radius), and installs through the border
  wall's own `AddStaticBody` seam, deliberately OFF `LayerViewportCollision` so
  it never streams and costs the wire zero. A filled collider needs **no new
  physics shape and no new installation path** — it emits more `Corridor`s.
- `resolveSolidAABB` (`solid_aabb.go:139-176`) **ejects a circle whose centre is
  inside the box**, along the axis of least penetration. Verified at HEAD. This
  is what makes a solid interior fill safe where a hollow shell would trap.
- `paintTerrainSurfaces` already returns `{masks, scrollers}` and `MapTerrain`
  already consumes it, so **map parity is structural** — a third surface kind
  drawn through the same function is on the map for free (world-paths D8).
- `SolidRotatedAABB` exists and blocking paths already use it, so **a collider
  oriented to a diagonal wall is a solved problem at HEAD** — it just has to be
  pointed at a polygon's edges (D2).
- ⭐ `bruteIntersectShapes` (`space.go:135-141`) tests **`IntersectAabb` FIRST**,
  before the layer check and before any narrowphase, and `gridWidth` is **10
  world units**. Both verified at HEAD. This is the fact D2's whole shape rests
  on: shape *count* is cheap, shape *complexity* is expensive.
- ⛔ `resolveSolidAABB` ejects along the **axis of least penetration**, never the
  true face normal (`solid_aabb.go:160-176`). Harmless for one box, a *staircase*
  for a diagonal wall tiled out of axis-aligned ones — see D2.
- `phy` has **no polygon shape** (circle · box · AABB · InvAABB · InvCircle ·
  SolidAABB/rotated). ⛔ Adding one is out of scope — *"treat the inherited
  physics as a stable foundation; extend, don't rewrite."* §4.5 records the full
  reasoning, which is stronger than that quote alone.

---

## 3. ⚑ The constraint everything follows from

**The broadphase inserts by AABB, and PhysicsSystem was measured at 74 % of the
tick budget at 10× density** (`plan-world-scale.md` M1-F3). `maxCorridorSegment
= 8` exists for exactly this reason. A filled area collider is the first thing
in the codebase whose body count scales with **area** rather than with length,
so its cap is not tuning — it is the design (§4.2).

⚑ **D2's revision softened this, and the softening is worth stating**: once the
boundary stroke owns the surface, the interior cell size stops governing how a
wall *feels* and governs only how granular the ejection is. It is still the term
that scales with area — but it is now a safety knob, not a look knob, and can be
coarse by default.

---

## 4. Design

### 4.1 ⭐ D1 — `zone.polygons` is its own array and its own Tiled class

```go
// Polygon is a CLOSED polygon naming a client-side presentation PROFILE and
// FILLED — a rock mass, a building footprint, a lake (plan-zone-polygons.md).
type Polygon struct {
	Profile        string  `json:"profile"`
	Points         []Point `json:"points"`
	BlocksMovement bool    `json:"blocksMovement"`
	OutlineProfile string  `json:"outlineProfile,omitempty"`
	OutlineWidth   float32 `json:"outlineWidth,omitempty"`
}
```

- **`Profile`** — the same client-side table regions and paths name, unvalidated
  server-side (region-primitive D8's posture verbatim: a typo costs one shape's
  look, never a broken client).
- **`BlocksMovement`** — the same word `props[]` and `paths[]` already use, zero
  value safe, so a polygon is decorative until someone says otherwise
  (world-paths D4).
- **Always closed.** The client closes it (`g.poly(points).fill()` closes by
  construction); the validator requires ≥ 3 points. ⛔ There is no `closed`
  field here and never should be — an unfilled open shape is a `path`.

Tiled: class **`AuraPolygon`**, four touch points — `aura.tiled-project`,
`palette/propertytypes.json`, `generate-palette.mjs`, `aura-convert.js` — and
⭐ **NO new layer** (D5).

### 4.1b ⭐ D5 — `AuraPolygon` shares the `paths` layer, discriminated by CLASS

PO ask 2026-09-09: *"too many layers in Tiled will make me a little crazy."*
Eight object layers exist already; a ninth for one more surface kind is clutter
for no gain. `modelToZone` filters `layer('paths')` by `o.cls` instead, which is
also the more honest discriminator — the class is what Tiled shows in the
Properties panel, and it is already how a `AuraPath` is told from a stray
plain polyline.

⚑ **This needs a validator leg it would not otherwise need**: an object on the
shared layer whose class is neither `AuraPath` nor `AuraPolygon` currently
lands in *neither* array and vanishes on save. Refuse by object id, naming both
legal classes. (The layer-per-type scheme got this check for free, which is the
one real thing D5 gives up.)

⭐ **Layer names cost nothing and this is worth recording**: `zoneToModel`
SYNTHESIZES the layer list on every load (`{name: 'paths', drawOrder: 'index',
objects: paths}`) and the zone file stores arrays, never layers. So renaming or
merging layers is a two-line change with **no content migration** — including
the further step of collapsing `regions` + `paths` into one `surfaces` layer if
the clutter still bites. ⛔ The only thing given up there is per-type hide and
select in Tiled's layer panel, which is an authoring convenience worth keeping
until it is proven unnecessary.

### 4.2 ⭐ D2 — a filled collider is a ROTATED BOUNDARY STROKE over a COARSE INTERIOR FILL

Two parts, each doing the one job the other does badly:

1. **The boundary** — every edge of the polygon becomes a `SolidRotatedAABB` of
   thickness `T`, exactly as a blocking path's corridor does, with joint circles
   at the vertices. ⭐ **This is the surface players actually touch, and it is
   rotated, so it slides correctly.**
2. **The interior** — sampled on a COARSE grid, blocked cells merged back into
   maximal axis-aligned rects capped at `maxCorridorSegment` on both axes, and
   emitted as ordinary `Corridor{X, Y, Length, Width, Angle: 0}`. ⭐ **Its only
   job is EJECTION**, never defining the surface.

⭐ **This shape was reached by asking a performance question and getting a
feel answer** (PO, 2026-09-09). Two things were verified in the engine first:

- `bruteIntersectShapes` (`space.go:135-141`) runs **`IntersectAabb` FIRST** — 4
  comparisons — before the layer test and before any narrowphase, and the
  broadphase cell (`gridWidth`) is **10 world units**. So shape *count* is cheap
  and shape *complexity* is expensive, which **inverts** the usual "fewer shapes
  must be faster" intuition. A derived estimate for one player at a 30×20 u
  rock: ~90 flop-equivalents for a box fill against ~155 for convex pieces,
  because small boxes have TIGHT bounding boxes that reject in 4 comparisons
  while convex pieces have large ones that pass the cheap test and then pay
  O(V) SAT. Boxes win on perf by roughly 1.5–2×.
- ⛔ **But `resolveSolidAABB` ejects along the AXIS OF LEAST PENETRATION —
  always X or Y, never the true face normal.** So a diagonal wall built out of
  axis-aligned cells is a *staircase*: a player sliding along it gets alternating
  X and Y pushes — zigzag, snagging, stutter. ⭐ **That is a FEEL defect, it
  outranks the perf question, and cave walls are precisely where it would be
  felt.** It is what the boundary stroke exists to fix, and `SolidRotatedAABB`
  already solves it today for blocking paths.

⭐ **The hybrid is also CHEAPER than the uniform fill it replaces**, because the
interior no longer defines the surface and can therefore be coarse. For that
30×20 u rock: ~12 rotated boundary boxes + vertex joints + ~30 interior cells at
2 u ≈ **~50 bodies, against ~80** for a uniform 0.5 u fill — and it slides
correctly. ⭐ **It also dissolves the shell-vs-fill argument this section used to
hold**: a boundary-only shell was refused because its failure mode is a
**trapped** entity — anything arriving inside (a knockback, a WARP, a spawn a
metre off, a mob shoved by another mob) is sealed in, unable to leave and unable
to reach anything, while auras pass through it. The hybrid keeps the shell's
smooth surface AND the fill's ejection guarantee instead of choosing between
them. ⭐ **Wrong-but-recoverable beats cheap-but-sealed** still holds; it is now
simply not a trade.

⚑ **The boundary stroke is INSET, never centred.** Each edge's box is shifted
inward along that edge's own inward normal by `T/2`, so its OUTER face lies on
the drawn outline and nothing extends past the art. A centred stroke would
over-cover by `T/2` and quietly invert the under-cover ruling. ⛔ No true polygon
offsetting (mitring) is needed or wanted: shifting each segment along its own
normal overlaps harmlessly at concave corners and under-covers slightly at convex
ones — which is the ruled direction — and the joint circles already cover the
inner wedge.

⚑ **Inward requires WINDING ORDER, and Tiled lets you draw either way** (L10).
Take it from the signed area and normalise at load. A clockwise-authored polygon
stroked with the sign flipped puts the entire boundary OUTSIDE the art — a
silent inversion of the under-cover ruling that would look like the collision
being mysteriously fat.

⚑ **The two parts are meant to OVERLAP, and a GAP between them is the bug.**
Overlapping static boxes summing their reaction on one circle is already normal
here (a path corridor's joint circles overlap its segments deliberately). Pin it
with a test rather than tuning the inset to abut.

⚑ **Interior cells are sampled at their CENTRES, which UNDER-covers by up to half
a cell.** Now harmless — the boundary stroke defines the surface — but kept
because it is also the bridge-clearing precedent (`appendPathCorridors` samples
sub-interval midpoints for the same reason).

⚑ **Ejection artefacts still need testing, not assuming** (L5): an entity deep
inside a *tiled* interior is ejected from one box into the next, walking outward
over several ticks, and overlapping boxes resolving in one tick can jitter. The
greedy merge keeps this short — bigger boxes eject further per tick — so the
merge is a correctness feature, not only a perf one.

⭐ **A convex polygon shape in `phy` is no longer the escalation path this
section once implied** — the boundary stroke buys the sliding quality that was
its main remaining advantage. See §4.5.

### 4.2b ⭐ D6 — the cap AUTO-COARSENS the offending polygon; it never refuses

A large or jagged polygon at a fine cell size emits thousands of boxes, and ⛔ no
polygon may be allowed to silently degrade the tick. **PO ruling 2026-09-09: the
server raises that ONE polygon's cell size until it fits under the cap, boots
normally, and says so.** A boot refusal was offered and declined — an authoring
session must not be stoppable by having drawn a big rock.

⚑ **The known cost of this ruling, accepted with it: that rock's collision is
now blockier than every other rock and nothing on screen says so.** This is the
"silently differs from what was authored" failure class, and it is exactly what
the cheaper design must therefore work to defeat. Two mitigations are part of
D6, not optional extras:

1. **Boot log at WARN**, naming the zone, the polygon index, both cell sizes and
   both box counts — e.g. `polygons[3] coarsened 0.5→1.5u (812→240 boxes)`.
2. ⭐ **A NON-BLOCKING notice in Tiled at save time**, through the existing
   refusal channel (which already reports by object id, and whose ids *"go
   straight into Edit ▸ Select Object by Id"*). This is what turns "read the
   server log afterwards" into "told while standing on the shape".

⚑ **The Tiled-side estimate must NOT re-implement the greedy fill** — two copies
of one algorithm in two languages is the drift trap this codebase keeps naming.
It reports a deliberately CONSERVATIVE proxy (interior area ÷ cell², no merging)
and says so in its wording: the editor warns *early*, the server decides. ⛔ The
two numbers will disagree and the message must not pretend otherwise.

⚑ **Coarsening is per-polygon and must be DETERMINISTIC** — the same zone file
must produce the same colliders on every boot, or a bug reproduces on one
machine and not another. Double the cell until it fits; never search.

**Bridges clear it too.** `coveredByBridge` is a point test and the cell fill has
points; a `crossesPaths` prop clears the cells it covers, exactly as it clears
path corridor runs. Free, consistent, and it makes a causeway across a filled
lake authorable on day one (world-paths D6 unchanged).

### 4.3 ⭐ D3 — the outline is a SECOND PROFILE, which is what dissolves the feathering problem

```
outlineProfile: string   // absent or empty = no outline
outlineWidth:   float32  // world units, stroke centred on the boundary
```

On **both** `Polygon` and `Path`. Flat keys rather than a nested object because
Tiled properties are flat, so the three writers stay a one-line mapping each.

⭐ **The outline carries its own `blend` because a profile carries `blend`.** The
worry that an outline "fights feathering" dissolves: a wall names an outline
profile with `blend: 0` and gets a hard rim; a riverbank names one with `blend:
0.3` and gets a soft one; the base surface keeps whatever its own profile says.
Two independent knobs, **no rule, no forced feather-off, no new field.**

⚑ **The footprint must grow by `max(blendMargin, outlineWidth / 2)`.** An
outline overhangs the boundary by half its width, and a mask sized to the blend
alone clips it — which reads in-game as *the blend* being broken. This is the
identical trap C1 hit and fixed for the stroke itself
(`RegionPaint.ts:542-549`); the machinery is there, it just needs the third
term.

⛔ **The outline is DECORATION and never touches collision.** Corridors stay
derived from `width` (paths) and the filled interior (polygons). Otherwise "my
river blocks wider than I authored it" becomes a debugging session, and the
outline stops being safely tunable by eye.

**Draw order: body then outline, per object, in array order.** A later object's
body therefore covers an earlier object's outline, which is the last-wins
ordering every other surface already uses. Surface order overall becomes
**regions → polygons → paths**: material, then masses, then ribbons, so a road
still runs on top of everything.

### 4.4 D4 — `Path.Closed`, and why it is last

A path drawn as a Tiled **polygon** rather than a polyline strokes a *closed*
ring: a moat, a ring road, a circular town wall. This is one derived bool
(`closed: o.shape === 'polygon'`, never an authored property — the shape *is*
the flag, and an authored one could contradict it), plus a wraparound segment
and a seam joint circle in `appendPathCorridors`, plus `.poly(points, closed)`
on the client.

⚑ **The accidental-close worry is answered by D1, not by a rule.** Clicking the
first node while finishing a road can make Tiled convert the object to a polygon
shape. Under this design that accident merely joins the two ends of the road —
visually obvious, harmless, one undo — because **closure does not imply fill**;
fill is a different class. That is the whole reason `AuraPolygon` being separate
makes `Path.Closed` safe.

⚑ **Scheduled FIRST by PO choice 2026-09-09** (§7 P1), reversing the draft's
"last, nothing wants it yet": it is the smallest piece, it touches only paths,
and it is the question this whole design started from. The accepted cost is a
second pass over the three writers.

### 4.5 What this does NOT absorb

- ⛔ **Regions.** Unchanged, untouched, no outline field, still the material and
  future quest-trigger type. `Regions.resolve()` does not see polygons.
- ⛔ **Path corridors.** `appendPathCorridors` keeps its segment walk; the cell
  fill is a separate function beside it.
- ⛔ **`phy`.** No new shape — and the reasoning is worth keeping, because
  *"why not just add polygons to the physics engine"* is the obvious question
  (PO-asked 2026-09-09). Three answers, in ascending order of decisiveness:
  1. `phy` resolves by **double dispatch** (`CollisionResolver` /
     `Intersector`, one method per shape kind). A 6th collider among 5 existing
     ones is ~20 new methods, plus `ClosestPoint`, which mob steering's
     `boxRepulsion` is written in terms of. Tedious, not decisive.
  2. ⭐ **Every standard resolver is CONVEX-ONLY, and an authored cave wall is
     concave.** So a polygon shape does not remove the decomposition step — it
     adds a new shape *on top of* it. The cell fill needs neither.
  3. ⚑ **The broadphase inserts by AABB**, so a large irregular convex piece
     occupies a bounding box the size of everything near it and pairs against
     all of it every tick. This is not speculation: it is verbatim why
     `maxCorridorSegment = 8` exists (*"a single 40-unit diagonal rect occupies
     a box the size of a city block"*). Fewer, bigger pieces hand back part of
     what they win.

  4. ⭐ **And measured against the engine as it is, boxes are simply FASTER** —
     roughly 1.5–2× for one player at a wall, because `IntersectAabb` runs first
     and small boxes reject in 4 comparisons where big convex AABBs pass the
     cheap test and then pay O(V) SAT (§4.2). The naive "fewer shapes must be
     faster" intuition is backwards here.

  ⚑ **D2's revision then took the last remaining argument away.** A convex shape's
  genuine advantage was never throughput, it was **sliding along a diagonal**
  — and the rotated boundary stroke buys exactly that with a shape the engine
  already has. What is left for a `phy` polygon is exactness of contact, which
  under-cover has already conceded on purpose. ⭐ **The escalation path is
  therefore recorded as WEAKER than it looked, not merely deferred**: it stays a
  legitimate `phy` chunk of its own if L5's ejection proves bad in-game, but it
  is no longer the obvious "proper" answer this section originally implied.
- ⛔ **Props.** A building you can enter is still props. A polygon has no art of
  its own beyond its profile texture.

---

## 5. Schema impact

| Layer | Impact |
| --- | --- |
| **DB** | **NONE** — nothing persisted changes. |
| **Wire (FlatBuffers)** | **NONE** — the client bundles zones itself; colliders are static bodies off `LayerViewportCollision` and cost the wire exactly zero. |
| **conf.json** | **NONE** — the cell size and cap are Go constants beside `maxCorridorSegment`, which is where the reader will look for them. |
| **Zone format** | One new array `polygons`; `outlineProfile` + `outlineWidth` on `polygons` and `paths`; `closed` on `paths` (P4). All absent-safe — every shipped zone stays valid and byte-identical. |
| **Content** | None required. The feature is **inert at HEAD** until a zone authors a polygon. |

---

## 6. ⚑ The whitelist problem, inherited verbatim

A new zone-format field means **three** writers, and only one of them fails
loudly ([[project-zone-format-whitelists]]):

1. `backend/pkg/aura/world/zone.go` — the Go struct + `validate()`
2. `tools/tiled/extensions/aura-zone/aura-convert.js` — **both** directions
   (`zoneToModel` and `modelToZone`), and they must emit the same keys
3. `frontend/src/features/zone-editor/logic/ZoneModel.ts` —
   `getZoneAsJSON()` is a hand-written whitelist that **silently deletes what it
   has never heard of**, all tests green

⭐ The tiled completeness pin reddens all three by design the moment `zone.go`
grows a field, which is exactly what happened on world-paths C1 and is the
system working. ⚑ **U4b found a FOURTH writer** — `aura-world-format.js` copies
*map-level* values by hand. A new object layer is not map-level, so it should be
out of scope here, ⛔ **but confirm it rather than assume it**: that is precisely
the assumption that dropped `origin` and refused the next boot.

⚑ `verify.sh` needs a **polygons leg**, and its fixture must be mutation-proof —
U4b's `origin` fixture initially passed its own mutation because one axis was
zero.

---

## 7. Chunks

Each independently shippable; the feature is inert until content authors it.

- **P1 — closed paths.** ✅ **SHIPPED 2026-09-10** (ledger §12). `Path.Closed`,
  derived from the Tiled shape (never an
  authored property) · a wraparound segment + a seam joint circle in
  `appendPathCorridors` · `.poly(points, closed)` on the client. Moats, ring
  roads, circular town walls. ⚑ **Ships FIRST by PO choice 2026-09-09** — it is
  the smallest, it touches only paths, and it is where this design started. The
  accepted cost is that the three writers are taught **twice** (here and again
  at P2) rather than once.
- **P2 — the polygon primitive, draw only.** ✅ **SHIPPED 2026-09-10** (§12). `world.Polygon` + validation ·
  `Polygons.ts` (`toPolygons`, origin-aware, the C1 degrade posture) · painted
  through `paintSurface` with a fill callback · map parity · the Tiled class on
  the **shared `paths` layer** (D5) · all three writers · `verify.sh` leg. No
  collision. **A lake authored `Water` drifts for free**, because `paintSurface`
  already owns `scroll`.
- **P3 — filled blocking.** ✅ **SHIPPED 2026-09-10** (§12). `PolygonColliders` beside `PathCorridors`: the inset
  rotated **boundary stroke** (winding-normalised, L10) plus the coarse
  axis-aligned **interior fill**, `maxCorridorSegment` cap on both axes, bridge
  clearing, the auto-coarsening cap (D6), installation through the existing
  `AddStaticBody` seam. ⚑ Includes the diagonal-slide test and the
  interior-ejection test (L5).
- **P4 — outlines.** ✅ **SHIPPED 2026-09-10** (§12). `outlineProfile`/`outlineWidth` on both types · one shared
  paint helper · the `max(blendMargin, outlineWidth/2)` footprint fix · map
  parity · writers.

Order rationale: P1 first by PO choice (§9). P2 before P3 so the shape can be
*seen* before it blocks — a wrongly-drawn invisible collider is the worst first
bug. P4 wants P2's shapes in front of it to judge.

---

## 8. Test strategy

**Go** — `PolygonColliders`: a unit square at a known cell size emits a known
body count · a concave L never fills the notch · a polygon under a bridge loses
those cells and only those · the cap coarsens deterministically and logs (D6) ·
a degenerate (< 3 points, zero area, duplicated vertices) polygon emits nothing
rather than a NaN body.

Three tests exist specifically because D2 is a hybrid:

- ⭐ **Winding (L10)**: the SAME square authored clockwise and counter-clockwise
  produces the SAME colliders. Without normalisation one of them strokes
  outward, and nothing else in the suite would notice.
- ⭐ **Under-cover holds at the boundary**: no emitted body extends past the
  drawn outline, for a convex shape and a concave one. This is what pins the
  inset, and a centred stroke fails it.
- ⭐ **No gap between stroke and fill**: sample along the inward normal from
  each edge and assert continuous coverage. Overlap is expected and fine; a gap
  is the bug (§4.2).

**L5 gets its own test**: a circle placed at the centroid of a filled mass is
outside it within N ticks. **The diagonal-slide defect gets one too**: a circle
driven along a 45° face accumulates motion along that face without alternating
X/Y reversals — the staircase symptom the boundary stroke exists to prevent.

**Go, validation** — ≥ 3 points · profile non-empty · blocking + outline
combinations legal · the outline fields absent-safe.

**Vitest** — `toPolygons` degrade paths (absent array, < 3 points, bad outline
width) drop one shape, never the zone · origin offset applied once · the
world/map shape agreement that world-paths D8 pins for paths.

**Tiled** — `verify.sh` round-trip byte stability with a polygons fixture
carrying an outline, ⚑ **mutation-verified** (change a coordinate *and* an
outline field; both must redden).

**In-game** — ⛔ mandatory before any chunk is called done, and the reason is on
the record: U2 shipped without an in-game pass and produced three browser-only
defects. Walk into a filled mass from four directions; stand inside one via WARP
and confirm ejection; check the outline against the blend at a feathered edge.
⚑ **Restart the server after every Tiled save** — [[project-zone-edit-half-live]]
means the polygon *renders* instantly while its collider is still the one the
running server booted with.

---

## 9. PO calls

### Answered 2026-09-09

- ✅ **Under-cover at the boundary** (§4.2). Cells block on a CENTRE test, so
  collision sits slightly *inside* the art and a character may clip a little way
  into a rock face. The rejected alternative, over-cover, puts an invisible wall
  in open ground, which reads as a bug rather than as a rough edge.
- ✅ **Closed paths ship FIRST**, as P1 (§7, §4.4).
- ✅ **No new Tiled layer** — `AuraPolygon` rides the `paths` layer, D5 (§4.1b).
- ✅ **Scale anchors the cell size is judged against**, established the same
  session and worth not re-deriving: **1 world unit = 120 px** (which is what
  the `WARP <x·120>` cheat is doing), the player collider is **0.25 u radius**
  (`player.go:28`), the zone is 144×72 u, a road is ~2.5 u wide, and an existing
  path corridor box is capped at 8 u long.

- ✅ **The body cap AUTO-COARSENS, it never refuses to boot** (D6, §4.2b). The
  boot-refusal option was offered and declined: an authoring session must not be
  stoppable by having drawn a big rock. ⚑ Its accepted cost — one rock blocking
  blockier than the rest with nothing on screen saying so — is what the WARN log
  and the non-blocking Tiled notice exist to defeat.

### Still open

1. **Interior cell size** — [PLACEHOLDER], tuned in front of the game. ⭐ **D2's
   revision made this much less sensitive**: the boundary stroke owns the
   surface, so the cell size no longer governs how a wall *feels*, only how
   granular the ejection is. Starting proposal **2 u** (up from the pre-revision
   0.5 u), which puts a 30×20 u rock at ~50 bodies total including its boundary.
2. **Boundary thickness `T`** — [PLACEHOLDER], and the one number that *is*
   safety-critical (L11): too thin and a fast mover tunnels through the surface
   into the interior fill. Starting proposal **1 u**, i.e. 20 ground-player
   steps. ⚑ Wants checking against flight and any knockback before P3 ships.
3. **Body cap number.** Starting proposal **256 bodies per polygon** — obviously
   generous for a cave wall, obviously biting for "someone filled the zone".
   Depends on 1; not worth pinning before P3 has real shapes to count. ⚑ Under
   D6 this number is *how blocky a big rock gets*, not *what is legal*, which
   makes it safer to start low and raise it. ⚑ It counts the **interior fill
   only** — the boundary stroke is set by perimeter, not by the cell size, so
   coarsening cannot reduce it and must not be expected to.

### Decided without a prompt (PO may veto)

- **Flat `outlineProfile`/`outlineWidth`** rather than a nested `outline: {}`
  object: Tiled properties are flat, so the three writers stay a one-line
  mapping each. KISS, and invisible to the author either way.
- **A filled polygon keeps `scroll`.** A drifting lake is the obvious win and
  costs nothing — `paintSurface` already owns it (§7 P2).

---

## 10. ⚑ Landmines

- **L1 — the three-writer whitelist.** §6. `ZoneModel.getZoneAsJSON()` deletes
  silently with all tests green. Already ate `spawn.level` once.
- **L2 — body count scales with AREA.** §3. The first collider in the codebase
  that does. A cap is mandatory; its behaviour is §9 open call 1.
- **L2b — an object on the shared `paths` layer with no recognised class lands
  in NEITHER array and vanishes on save.** The cost of D5 (§4.1b), and the one
  check the layer-per-type scheme got for free. Refuse by object id.
- **L3 — a filled blocking polygon can SEAL THE MAP**, and worse than a river
  can: a polygon has an *inside*, so it can also seal a region *off* rather than
  merely across. No automated check is proposed; this is an authoring hazard to
  name in the Tiled class description.
- **L4 — the outline must never affect collision.** §4.3.
- **L5 — interior ejection is multi-tick and can jitter.** §4.2. Has its own
  test. If it proves bad in-game, the fallback is a coarser cell (bigger boxes
  eject further), not a shell.
- **L6 — [[project-zone-edit-half-live]].** A Tiled save renders the polygon
  instantly and the collider not at all until the server restarts. Cost a
  debugging session on 2026-09-07 when water drew but did not block. **Restart
  after every save.**
- **L7 — `width` on a path and `outlineWidth` on a polygon are different
  things.** An author who reaches for "how wide is my wall" on an `AuraPolygon`
  finds only the outline. Name it in the property description.
- **L8 — a `crossesPaths` prop authored `blocksMovement: true`** clears the
  cells and then walls its own deck — world-paths L9, now reachable through a
  second geometry type.
- **L9 — the boundary stroke and the interior fill are meant to OVERLAP.** A gap
  between them is the bug; overlapping statics summing their reaction on one
  circle is already normal (a path corridor's joint circles overlap its
  segments). ⛔ Do not "fix" the overlap by tuning the inset to abut — that
  converts a harmless double-push into an intermittent hole.
- **L10 — the inward normal needs WINDING ORDER, and Tiled lets you draw either
  way.** Normalise from the signed area at load. A clockwise polygon stroked
  with the sign flipped puts the whole boundary OUTSIDE the art: under-cover
  silently inverts to over-cover, and it presents in-game as collision that is
  mysteriously fat rather than as anything obviously wrong.
- **L11 — the boundary stroke's thickness `T` must exceed the largest per-tick
  displacement**, or something fast tunnels straight through the surface into
  the interior fill (where it will then be ejected, so it self-heals — but it
  self-heals by teleport-looking pops). ⚑ A ground player steps 0.05 u/tick;
  flight lerps and knockback do not. Pick `T` against the fastest mover, not the
  player.

---

## 11. Proposals adopted without a choice prompt (PO may veto)

1. Surface draw order **regions → polygons → paths** (§4.3).
2. Outline drawn per object immediately after that object's body, so array order
   governs overlap exactly as it does everywhere else.
3. The cell size and body cap live as Go constants beside `maxCorridorSegment`
   rather than in `conf.json` — the reader who needs one has just read the
   other, and `conf.json` is player-facing tuning, not geometry.
4. `PolygonColliders` is a **separate function** from `appendPathCorridors`
   rather than a branch inside it: a line algorithm and an area algorithm that
   happen to emit the same output type (DRY's "don't deduplicate what merely
   looks alike" — the rule `world.Point` itself was created under).
5. No `id` or `name` on a polygon. Array index is the only handle, exactly as
   for regions and paths; a quest-addressable shape is region-primitive §11's
   open question and should be answered once, for one type.

---

## 12. Chunk ledgers

### P1 — closed paths ✅ 2026-09-10 (`8d9dc4b9`)

**What shipped.** `world.Path.Closed`, one derived bool. A path drawn in Tiled
with the **polygon** tool strokes a closed ring — a moat, a ring road, a
circular town wall — and a blocking one walls the wraparound from the last point
back to the first. Four files carry it end to end: `zone.go` (the field +
validation), `paths_collision.go` (the wraparound segment + the seam joint),
`aura-convert.js` (all three directions + the validator), `ZoneModel.ts`, plus
`Paths.ts` and `RegionPaint.ts` on the draw side.

⭐ **The shape IS the flag, and that is the design.** `closed` exists nowhere in
Tiled's Properties panel: `zoneToModel` picks the shape from it, `modelToZone`
reads it back off `o.shape`, and nothing in between is a property. D4 asked for
this ("never an authored property — the shape *is* the flag") and the reason
survived contact: an authored bool can contradict the shape it was drawn as, and
then two sources of truth disagree about where a road ends.

⚑ **The validator leg that was DELETED is the notable change.** The paths layer
used to refuse a polygon outright — *"a closed river is a lake, and Pixi would
happily draw one"*. That refusal is gone, because the lake it was protecting
against is `AuraPolygon`'s job (D1) and not a shape rule's. What replaced it is a
POINT-COUNT rule: a polygon-shaped path needs **3** points, a polyline **2** —
the same split regions and paths already had, now inside one type. ⭐ **The proof
that closure did not become fill is on screen**: the pixel column through the
middle of the probe ring reads **0 % water** in both modes (§ in-game below).

⚑ **The seam joint is the bend a reader forgets.** Every vertex of a ring is a
bend — there is no end cap to leave open — so a closed path gets **n** joint
circles where an open one gets **n − 2**, and the extra one is at point 0, the
only bend whose two segments are not adjacent in the array. The loop therefore
asks *"is there a next SEGMENT"*, never *"is there a next point"*.

⚑ **`closed` is tri-state in every writer** (absent = open), so **every shipped
zone stays byte-identical** and the feature is inert at HEAD — `world.json`'s
four paths all parse `closed=false` off the Go zero value, untouched.

**Schema.** DB **NONE** · wire **NONE** · conf **NONE** · zone format **one new
key on `paths`**, absent-safe · content **NONE**.

**Verified.**
- `go build ./...` · `go vet ./...` · **`go test -count=1 ./...` EXIT 0**
- `tsc --noEmit` · **vitest 672/672** (+7) · prod webpack build
- **`bash tools/tiled/verify.sh` all green** through real Tiled, including its
  new **closed-path leg** (a moat, a ring road and an ordinary open road in one
  fixture, byte-identical round-trip)
- **Mutation-verified ×5**: kill the wraparound → covered length falls 80 → 60 ·
  kill the seam joint → 4 corners becomes 3 · drop `closed` from
  `ZoneModel.getZoneAsJSON` → the completeness pin names it by name · drop the
  shape READ in `modelToZone` → the Tiled leg reddens · force every path to a
  polygon → the Tiled leg reddens the other way.

⭐ **IN-GAME VERIFIED, as an A/B** (`.claude/skills/verify/p1-closed-path.mjs`,
new). A probe ring at x −27..−19, y 10..18 (width 2, blocking), authored so its
**wraparound is the west side**, walked from the middle at (−23, 14):

| | walk WEST (the wraparound) | walk EAST (an ordinary segment) | pixels at x = −23 |
| --- | --- | --- | --- |
| `closed: true` | **stopped at x = −25.75** — exactly the predicted face | stopped at −20.25 | 0 % water |
| `closed` absent | **walked through to −29.72** | stopped at −20.25 | 0 % water |

⭐ **The east column is what makes the west column mean anything**: it is walled
identically in both runs, so a stale server, a missed warp or a dead collider
would have failed both. And the drawn side follows the same A/B — the pixel
column at x = −27 is **100 % water closed, 0 % open**, while x = −19 is 71 % in
both. ⚑ The probe ring was installed against a **byte-exact backup** of the PO's
uncommitted `world.json` and restored by sha256 afterwards.

⚑ **What P1 did NOT need, confirmed rather than assumed** (§6): `aura-world-format.js`,
the fourth writer, already maps `polygon` and `polyline` in both directions
generically — a new object SHAPE is not a map-level value. And the palette is
untouched: `AuraPath`'s `useAs` carries no shape restriction, so a class that
gained no property needed no regeneration.

**Harness gate.** `c4-region-texture` (it owns `RegionPaint.ts`): **4 PASS, 1
INCONCLUSIVE**, the inconclusive being a zone that authors only one region so
there is no interior blended edge to read — content, not code. ⚑ **A real
harness defect was found and fixed here rather than left**: that script walked
the WHOLE stage and compared the textured-fill count against `zone.regions`
alone, so the four paths the PO has authored made it report a stale
`frontend/dist` that was perfectly current. It is now scoped to
`layers.terrain.regions` — which its own comment said was impossible ("the
façade exposes no layer map"), untrue since the flight chunk added `layers`.
⚑ `c3-zone-editor-level` (it owns `ZoneModel.getZoneAsJSON`) is **deferred to
the end of P4 by PO instruction 2026-09-10** — ZoneModel is touched again at P2
and P4, and running it three times costs more than it buys.

⚑ **The accepted cost of shipping first (§4.4) was paid as designed**: the three
writers are taught `closed` now and will be taught `polygons` again at P2.

### P2 — the polygon primitive, draw only ✅ 2026-09-10 (`05553e43`)

**What shipped.** `zone.polygons` — closed polygons naming the same profile a
region and a path do, FILLED into the world and onto the map. `world.Polygon`
(profile · points · blocksMovement), `Polygons.ts` (`toPolygons`, origin-aware,
the C1 degrade posture), `paintPolygons` through the same `paintSurface` a region
uses, a `polygons` render layer between the regions and the paths, and the
`AuraPolygon` Tiled class on the **shared `paths` layer** (D5).

⭐ **The draw is byte-for-byte a region's** — same callback, same mask, same
helper — and what differs is not the drawing but the MEANING. A `Regions.resolve()`
lookup answers "what material is underfoot" for footsteps, music and atmosphere;
a cave wall is none of those. ⚑ That distinction has its own vitest pin
(`polygons are not regions`), because `Polygon` structurally EXTENDS `Region` so
the paint code can be shared — nothing in the type system stops someone from
feeding one array into the other.

⭐ **`paintTerrainSurfaces` grew a third surface for one line per draw site**,
which is the entire claim region-primitive L2 was built on. The map got polygons
for free and it is verified: the probe L and its notch both draw on the
full-screen map.

⭐ **THE SHARED LAYER FOUND A REAL FOURTH-WRITER DEFECT, and only real Tiled
could.** `aura-world-format.js` has WRITTEN `obj.className` since the palette
existed and never read it back — harmless while a class merely tinted an object,
because every layer held one kind. D5 made the class the discriminator, so on the
first save every object came back class-less and the L2b check refused the whole
paths layer. ⚑ **The completeness pin cannot see this writer** (it exercises the
pure converter, never Tiled's read/write path), so the `verify.sh` leg is the only
guard — and §6 said to confirm rather than assume, which is exactly what caught it.

⚑ **The one cost of D5 is paid as designed**: an object on the shared layer whose
class is neither `AuraPath` nor `AuraPolygon` lands in NEITHER array and would
vanish on save, so the validator refuses one by object id naming both legal
classes. The layer-per-type scheme got that check for free.

⛔ **No `width` member on `AuraPolygon`**, deliberately (L7): a polygon has no
stroke to be wide, and an author reaching for "how wide is my wall" should find
nothing rather than a field that quietly means something else. P4 then gives them
`outlineWidth`, which is the honest answer.

---

### P3 — filled blocking ✅ 2026-09-10 (`05553e43`)

**What shipped.** `PolygonColliders` beside `PathCorridors`: the winding-normalised
**inset rotated boundary stroke** plus the **coarse axis-aligned interior fill**,
bridge clearing on both halves, the auto-coarsening cap (D6) with its WARN log and
its non-blocking Tiled notice, installed through the existing `AddStaticBody` seam.
Three Go constants beside `maxCorridorSegment`, all [PLACEHOLDER]: cell **2 u**,
boundary thickness **1 u**, interior cap **256 bodies**.

⭐⭐ **THE HEADLINE FINDING, and it came from the mandatory in-game pass: the
interior fill as designed DID NOT EJECT.** A character warped into the probe mass
drifted **0.27 u in six seconds** and parked exactly on the seam between two
8-unit boxes. The mechanism is precise and worth keeping: `resolveSolidAABB`
pushes a centre INSIDE a box along its least-penetration axis and a centre
OUTSIDE one away from its nearest point, so two ABUTTING solid boxes push in
**opposite directions** at their shared seam and a body arriving there finds a
**stable equilibrium**. ⛔ That is strictly WORSE than the hollow shell D2
rejected — sealed-but-mobile beats stuck-in-place — so the fill was not the thing
to remove.

⭐ **The cause was applying `maxCorridorSegment` to the interior, and lifting it
is principled rather than a workaround.** That cap exists because a **ROTATED**
rect's bounding box is far larger than the rect — *"a single 40-unit diagonal rect
occupies a box the size of a city block"* — of WALKABLE ground, pairing against
everything standing on it. An interior-fill box is **AXIS-ALIGNED**, so its
bounding box IS the box, and that box is the inside of a solid mass **where by
construction nothing walks**. Big is free here and was not there. ⚑ The boundary
stroke, which really is rotated, still honours the cap. After the change the same
warp ejects in a single push, first sample: **(−23, 11) → (−22.72, 14.29)**, out
of the mass.

⚑ **This re-aims the D6 body cap at a different class of shape.** A big SQUARE now
merges to ONE box however large it is, so what blows the budget is a **JAGGED**
outline, not a big one — the cap's test fixture is now a long diagonal band
(one body per grid row, unmergeable) rather than a big rectangle.

⚑ Three tests exist specifically because D2 is a hybrid, and all three are
mutation-verified: **winding** (the same square drawn clockwise and
counter-clockwise emits identical colliders — without normalisation one strokes
OUTWARD and nothing else notices, L10), **under-cover holds** (no body reaches
past the drawn outline, convex and concave — a centred stroke fails it), and **no
gap between stroke and fill** (sample inward along every edge normal; overlap is
fine, a gap is the bug, L9).

⚑ **A Go constant trap worth naming**: `polygonBoundaryThickness` is written
`1.0`, not `1`. As an untyped INTEGER constant, `polygonBoundaryThickness / 2` is
integer division and silently yields **zero** — a boundary of no thickness, which
walls nothing and reads as the feature not working.

⚑ **Polygons are offset by `world.Place`, regions are not**, and the test says
why: polygons are collision geometry so they must move with a placed zone, while
the client applies the origin to regions itself — doing it in both places would
move them twice.

---


### P3 rider — the fill was poking out of the art ✅ 2026-09-12 (`05553e43`)

⛔ **PO pass, 2026-09-10: "collision is MUCH worse than paths — big chunks of
colliders poking out of the outline, we cannot even pretend to slide on diagonal
walls."** The report was exactly right and the cause was one line.

⭐ **The interior fill blocked a cell when its CENTRE was inside.** On an
axis-aligned edge that is harmless. On a SLANTED one a cell whose centre is
barely inside sticks out by most of a half-diagonal — so the outermost collision
surface became an axis-aligned STAIRCASE OUTSIDE the drawn outline, and the
rotated boundary stroke sat buried behind it where nothing ever touched it. The
whole of D2's hybrid rests on the stroke being the surface; a fill that reaches
past it destroys that. ⚑ Lifting the merge cap (the ejection fix above) did not
cause this but made it louder — the teeth merged into the "big chunks".

**The fix, in three parts.**

1. ⭐ **A cell blocks only when it lies WHOLLY inside**, tested exactly: centre
   inside AND no polygon edge crosses the cell rectangle. ⚑ Four corners alone
   would admit a cell a thin concave notch cuts straight through.
2. ⚑ **The cell size dropped 2 u → 0.5 u**, and it is no longer a free knob. The
   band the fill cannot reach is now up to one cell DIAGONAL wide, and the stroke
   must bridge it — so `polygonBoundaryThickness >= polygonCellSize * sqrt(2)`,
   pinned by a test. ⭐ Coarsening (D6) therefore thickens that polygon's stroke
   with its cell, or the shapes D6 exists for would open a ring-shaped gap inside
   the wall.
3. ⚑ **A ceiling of `area / perimeter` on the stroke**, or a thick stroke inset
   from one edge pokes out through the OPPOSITE one on a thin shape — the
   under-cover ruling inverting by a different route. ⭐ When the ceiling binds
   there is still no gap: two opposite edges each reaching the inradius inward
   meet in the middle.

⚑ **The joint circles were also bulging**, and it showed up only once the fill
stopped hiding it: a circle of radius r is tangent to both edges at `r / (b·n)`
along the bisector, not at `r`. Worst overshoot went **1.4 u → 0.153 → 0.060**.

⭐⭐ **THE TEST DEFECT IS THE LESSON, and it is not "add a diagonal".** The
under-cover test had a convex square and a concave L — and **every edge of both
lies on the sample grid**, so no cell could ever poke out however the fill was
written. It passed for the wrong reason. ⛔ **And "diagonal" was not enough
either**: the first in-game probe was a 45° diamond on whole units, whose edges
pass exactly through the grid's CORNERS — a deliberately broken build scored
clean on it. A fixture has to be **AWKWARD**: no edge axis-aligned, at 45°, or on
a grid line. Both the Go table and the in-game probe now are.

⚑ **Two in-game harness legs were themselves wrong and were rewritten, not
tuned**: the hold-off leg measured the END of the hold, by which point sliding
had carried the player past the vertex where the face's line means nothing (it
went NEGATIVE and passed for free); and it then used `min()`, which finds the
VALLEYS between staircase teeth and scored the broken build clean. ⭐ The exact
bound now lives in Go, which measures the emitted geometry directly; the in-game
leg is honest about being a smoke check. ⚑ Its slide bar is DERIVED from the
walking pace and the face's slope — the hardcoded 2.5 u went red at 2.45 on a
healthy wall.

**Verified.** `go build` · `go vet` · **`go test -count=1 ./...` EXIT 0** · tsc ·
**vitest 695/695** · prod build · **`verify.sh` all green (15 legs)**.
**Mutation-verified**: restoring the centre test reddens both awkward fixtures
(43 and 4 sampled points outside) and the numeric overshoot leg (0.35 vs < 0.1),
while both grid-aligned fixtures stay green — which is the test gap, demonstrated.
⭐ **In-game**: worst hold-off 0.60 u while sliding, 2.50 u of travel along the
face, **0 direction reversals** — no staircase.

⚑ **Still owed, and now with a reason to look**: the three [PLACEHOLDER] numbers
are tied together by the sqrt(2) relation, so **tuning one means re-checking the
other two**. And the PO has a `Wall` profile authored in `profiles.json` with
`"texture": "null"` — the STRING, not JSON `null`. It happens to work, because no
such tile exists and D14 falls back to the colour, but it is working by accident.

---

### P4 — outlines ✅ 2026-09-10 (`05553e43`)

**What shipped.** `outlineProfile` + `outlineWidth` on **both** `Path` and
`Polygon`, one shared paint helper, one shared converter, one shared validator.

⭐ **A second PROFILE is what dissolves the feathering problem** — verified rather
than assumed. The probe wall's body is `Mountains` (a texture) and its rim is
`Ice` (a colour), and the GPU draw list shows them as **two separate masked
surfaces with two different paint sources**: 4 children and 2 sources with the
outline authored, **2 and 1 without**. Two independent knobs, no rule, no forced
feather-off, no new field.

⚑ **The footprint grows by half the outline width on top of the blend band**, or
the mask clips the rim and it reads in-game as *the blend* being broken. Identical
trap to the one C1 hit for a path's own stroke; the machinery was there and needed
the third term.

⚑ **Both HALF-authored forms are refused, on both types, in both editors** — a
named profile with no width strokes zero pixels and a width with no profile
strokes nothing, so either one looks exactly like the feature not working.
⚑ The width-without-profile case can only be made **in Tiled's Properties panel**:
both writers gate the width on the profile and drop it on the way in, so its test
has to be built on the MODEL rather than in a zone file.

⚑ **`PROFILE_UNSET` now means two different things and that is deliberate**: on
`profile` it means "you forgot" and is refused, on `outlineProfile` it means "no
outline" and is legal. Tiled has no nullable enum, so the sentinel carries the
difference — pinned by a test so nobody tidies it away.

⛔ **The outline never touches collision** (L4), pinned for both builders: the same
world with a 9-unit rim on a 3-unit river and a 20-unit rock emits byte-identical
colliders.

---

### P2-P4 — shared verification

**Schema.** DB **NONE** · wire **NONE** · conf **NONE** · content **NONE** · zone
format **one new array (`polygons`) + two keys on two types**, all absent-safe.
⭐ **Inert at HEAD**: no shipped zone authors a polygon or an outline, and
`world.json` round-trips byte-identically through real Tiled.

**Verified.**
- `go build ./...` · `go vet ./...` · **`go test -count=1 ./...` EXIT 0**
- `tsc --noEmit` · **vitest 695/695** (+23 over P1) · prod webpack build
- **`bash tools/tiled/verify.sh` all green** through real Tiled — **15 legs**,
  four of them new here (a mixed-class shared layer in order · an unknown outline
  profile · outlines surviving as names rather than enum INDICES on a second
  member of the same enum type · a half-authored outline refused)
- **Mutation-verified ×4** on the collider: winding normalisation off → the two
  windings disagree · the boundary stroke centred instead of inset → under-cover
  fails, convex and concave · the interior fill removed → the gap, notch and
  bridge tests all redden · (plus the cap-lift, which was found by measurement
  rather than mutation)

⭐ **IN-GAME VERIFIED, as an A/B** (`.claude/skills/verify/p3-filled-polygon.mjs`,
new). The probe is a **concave L** — the shape a convex `phy` polygon could not
express without decomposition — with an `Ice` outline, at the most open tile in
the zone:

| | `blocksMovement: true` | authored decorative |
| --- | --- | --- |
| warped INSIDE the mass | **ejected out**, first sample | stays where it was put |
| the concave NOTCH | open ground, stood in it | open ground |
| walking west into the mass | **stopped at −22.75** on the face at −23 | **walked through to −25.49** |

⚑ The probe was installed against a **byte-exact backup** of the PO's uncommitted
`world.json` and restored by sha256 afterwards.

**Harness gate.** `c4-region-texture` **4 PASS / 1 INCONCLUSIVE** (the zone
authors one region, so there is no interior blended edge to read — content, not
code). ⚑ `c3-zone-editor-level` (it owns `ZoneModel.getZoneAsJSON`) was deferred
here by PO instruction and is **still owed**.

**⚑ What is OWED** (revised 2026-09-12, after the PO's pass and the P3 rider).
1. ⛔ **The three [PLACEHOLDER] numbers are unjudged, and they are now COUPLED**:
   cell **0.5 u**, boundary **1 u**, cap **256 bodies**. ⭐ The stroke must stay
   `>= cell * sqrt(2)` to bridge the band the fill cannot reach, so **raising the
   cell means thickening the stroke** — pinned by
   `TestTheStrokeCanBridgeWhatTheFillCannotReach`, which goes red if anyone tunes
   one alone. ⚑ The boundary thickness is still the safety-critical one (L11) and
   is still **only** checked against a ground player's 0.05 u/tick, never against
   flight or knockback.
2. **The cap's own coarsening has not been seen in-game** — only in Go. The WARN
   log and the non-blocking Tiled notice are both untested against a real
   oversized authored shape. ⚑ And the cap now bites a DIFFERENT class of shape
   than the plan assumed: a big square merges to one box, so what blows the
   budget is a JAGGED outline, not a big one.
3. ⭐ **The PO has now authored polygons and judged them** (`underworld.json`
   carries two, profile `City`), which is what produced the P3 rider. ⚑ **They
   are authored DECORATIVE** — neither sets `blocksMovement` — so at HEAD they
   emit no colliders at all, and re-testing the collision fix needs that flag put
   back on. ⛔ Still unjudged: the rim against a feathered body (no zone authors
   an outline yet) and the draw order against paths.
4. ⚑ **`profiles.json`'s new `Wall` profile authors `"texture": "null"` — the
   STRING, not JSON `null`.** It works by accident: no such tile exists, so D14
   falls back to the colour. Worth correcting before it is copied.
5. **`c3-zone-editor-level`** — the harness that owns `ZoneModel.getZoneAsJSON`,
   deferred through P1-P4 by PO instruction and never run.

