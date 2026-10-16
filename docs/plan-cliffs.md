# Plan: Cliffs that join and end — per-end shapes, end caps, welds

**Status: C1 shipped; C2 + C3 code shipped (PO look, the fade migration and one Tiled save owed), 2026-10-16. 4 chunks (C1-C4).**
Open PO calls in §7. ⏸ The raised-area model (Option B) is PARKED, not dropped (§8);
C4 (mountains and pits) is its enclosed first slice.

**Owns:** `endsStart` / `endsEnd` on `paths[]`, the `fade` end, the profile `cap`
texture, welding in the Tiled save, and `outlineFacing` on `polygons[]`.
**Sibling of:** `plan-world-paths.md` (the path primitive, the `alignTexture` ribbon
mesh, the `corners`/`ends` rider). This plan does NOT build that rider's held chunk B
(round corners and ends on the mesh, §3 D4).
**Schema:** DB none · wire none · conf none · **zone format: two additive keys and one
new `ends` value on `paths[]`, one additive key on `polygons[]`** · client profile
table: one optional field.

⚑ Line references pinned 2026-10-16 at `411a5412` (main); re-verify before relying on them.

---

## 1. What this is

A `Cliff` path does two jobs: it **blocks movement** (a wall) and it **reads as a height
difference** to the ground on its far side. Three problems in the level editor (PO
2026-10-16):

1. **Cliffs that meet look choppy.** You cannot make two cliffs connect cleanly.
2. **Cliff ends mostly look bad.** `point` only sometimes works and narrows the collider
   with the drawing; `flat` looks cut off.
3. **`round` ends break `alignTexture`.**

### 1.1 Why each one happens

A cliff is drawn as a **band**: one tile with the lip on one side, the face in the
middle and the foot shadow on the other (`cliff-placeholder.png`, 720×320), mapped along
the centreline by the ribbon mesh (`PathRibbon.ts`, arc-length UVs). A band has a fixed
height everywhere, and a real height difference never just stops: it runs into
something, turns a corner, or slopes down to nothing.

- **Joins:** two paths are two bands, each with its own lip and its own semi-transparent
  shadow. Where they overlap, one lip cuts across the other face and the shadows stack.
  There is no shared geometry, so no setting can fix it.
- **Ends:** `flat` cuts the band. `point` narrows the band's POSITIONS while keeping its
  `v` range (`ribbonGeometry`'s `factors`), so the whole tile is squeezed into the tip.
  The collider narrows too, by ruling: `pathTaper` (`paths_collision.go:66`) emits
  shrinking rects inside the taper.
- **Round:** the mesh only knows `sharp` corners and `flat`/`point` ends. Anything else
  falls back to the one-matrix stroke (`RegionPaint.ts` `paintRibbon`, refusal 4), which
  is exact on a straight leg and wrong past a bend. On a one-sided cliff a round end is
  also the wrong SHAPE: it wraps the face around the tip onto the high side.

⚑ One extra cause of joins: `ends` covers BOTH ends of a path, so a cliff that should
fade at one end and meet a wall at the other has to be split in two, and the split is
a join.

## 2. What already works (checked 2026-10-16)

- **The ribbon mesh** (`PathRibbon.ts`) follows any number of bends with continuous UVs.
- **A closed ring is fitted to a whole number of tiles** (`ribbonGeometry`, `uScale`), so
  its seam is invisible. D2 reuses this for the stretch between two caps.
- **The taper machinery** (`taperedCentreline`, `pathTaper`) already splits a path into
  end stretches and a full-width middle, measured along the arc, clamped to half the
  path. Its length is a constant held TWICE (`TAPER_LENGTH_PER_WIDTH` in `Paths.ts`,
  `taperLengthPerWidth` in `paths_collision.go`), each side pinned by a test. D2 follows
  the same pattern.
- **Array order is draw order** (`plan-world-paths.md` §4.1). D3's T-weld relies on it.
- **The Tiled save is a converter** (`tools/tiled/extensions/aura-zone/aura-convert.js`)
  that writes `api/zones/world.json` in place, and it already refuses bad shapes with a
  message (`ends` on a closed ring). D3 adds welds there.
- **Ramps are holes between cliff ends**, which is how the PO authors them today. This
  plan keeps that: no ramp object, no ramp prop.

## 3. Design

### D1 — a shape setting for each end

Two optional keys on `paths[]`:

| key | values | absent |
|---|---|---|
| `endsStart` | `round` · `flat` · `point` · `fade` | follows `ends` |
| `endsEnd` | same | follows `ends` |

`ends` keeps its meaning (both ends), so all 11 aligned paths in `world.json` stay
byte-identical. "Start" is the first Tiled point, the same direction that decides which
side the face is on.

- ⛔ Either key on a CLOSED path refuses the boot, exactly as `ends` does now.
- ⚑ A new zone key goes through EVERY writer: Go `world.Path`, `aura-convert.js` (read,
  write, the `AuraPathEnds` enum in `tools/tiled/palette/propertytypes.json`, the
  `AuraPath` class), and `ZoneModel.ts`'s `ZonePath` (carried, never edited). The
  `alignTexture` rider counted four writers. ⚑ The Tiled extension is a COPY: re-run
  `tools/tiled/install.sh` after editing it.

### D2 — `fade`: the cliff slopes down, drawn as art

A new `ends` value. The last stretch of the path is drawn with a **cap texture** at full
width instead of squeezing the band.

- **The profile names the cap**, in `terrain-profiles.json`:
  `"Cliff": { …, "cap": "cliff-cap-placeholder" }`. ONE texture serves both ends: it is
  drawn for the END of the run, and the start uses it mirrored along the run (`u`
  reversed, `v` unchanged), so the face stays on the correct side.
- ⛔ `fade` on a profile with no `cap` refuses the boot. Otherwise it would be a quiet
  no-op, which this primitive keeps refusing.
- **Cap length = `CAP_LENGTH_PER_WIDTH × width`** [PLACEHOLDER, start at 2, the taper's
  number], fixed rather than authored, and held twice like the taper, because the
  SERVER needs it (D2 collision) and cannot read the texture. The art is stretched to
  that length. On a path shorter than two caps, each cap is clamped to half the path,
  like the taper.
- **The middle is fitted to whole tiles between the caps**, the same correction a
  closed ring gets, so the cap's inner edge always meets the tile at `u = 0`. The cap
  art must therefore start exactly where the tile's left edge starts (the generator
  checks this).
- **Drawing:** three meshes per faded path at most (cap, middle, cap), or one mesh with
  the cap stretches cut out. Corners inside a cap stay mitred, as everywhere on the mesh.
- **Collision:** see Q1. The collider stays full width up to a point inside the cap and
  stops there. It does NOT narrow, which is what the PO disliked about `point`.
- `point` stays in the vocabulary (roads and rivers may still want it). The 7 `Cliff`
  paths in `world.json` move from `point` to `fade` in C2, after the side-by-side look.

### D3 — welds happen in the Tiled save (PO ruling 2026-10-16)

When you press Ctrl+S, the converter looks for cliff endpoints that touch and joins them
before writing `world.json`. Client and server then read the same geometry, and no
constant needs a second copy.

**End to end** (an L shape, or one cliff continuing another): if the end of path A lies
within the snap distance [PLACEHOLDER, 0.5 u] of the start of path B, the two become
**one path** (A's points, then B's). The texture runs on unbroken and the meeting point
becomes an ordinary mitred corner.
- Allowed only when both paths have the same `profile`, `width`, `blocksMovement`,
  `alignTexture` and `outlineProfile`/`outlineWidth`. Otherwise the save refuses and
  names both objects.
- ⛔ **Direction matters.** End-to-START joins as is. End-to-END (or start-to-start)
  would need one path reversed, which flips its face to the other side. The save
  refuses with "these two cliffs face opposite ways; reverse one", and does not guess.
- The merged path keeps A's `endsStart` and B's `endsEnd`.
- ⚑ **The weld is permanent in the file.** When you reopen the map, you see one object.
  Splitting it again is a manual edit. This is honest (it is what the game sees), but
  it is a one-way operation.

**End onto another cliff's side** (a T shape): if an endpoint of the stem path lies
within the bar's half-width of the bar's centreline, and not within the snap distance
of the bar's own ends:
- the stem's endpoint moves onto the bar's centreline (projected),
- that end of the stem becomes `flat` (needs D1),
- the stem is moved BEFORE the bar in the array, so the bar draws over it and the cut
  end is hidden in the bar's opaque face, with only the bar's shadow showing.
- ⚑ Whether this reads right from BOTH sides of the bar (the high side and the low
  side) is an in-game question (Q4).

**Scope:** welds apply to paths whose profile has a `cap`, i.e. cliffs. Roads and
rivers are left alone; overlapping strokes are fine for them.

⚑ **Only the Tiled save welds.** A hand edit to `world.json` or the in-game zone
editor (which carries paths but never edits their geometry) does not. Record this in
`manual-tiled-editor.md`.

### D4 — `round` on an aligned path refuses instead of falling back

Today `round` corners or ends on an `alignTexture` path silently fall back to the
stroke and lose alignment past a bend (problem 3). After this plan the save and
`-validate` refuse it with a message naming the path. ⚑ This keeps `plan-world-paths.md`'s
chunk B (the mesh learning round corners and ends) HELD, not closed: a curved fence
with rounded ends may still want it. Cliffs no longer need it, because `fade` and
welds replace every use a cliff had for `round`.

⚑ ~~PO call (Q5)~~ **Settled by the content (C1, 2026-10-16): cap profiles only, so D4
moves to C2.** The `Water` river is `alignTexture` with round ends and corners
(absent), and it draws through the stroke because its profile DRIFTS. Refusing every
aligned `round` would refuse `world.json`. And the server cannot tell which profiles
drift or have caps (the profile table is client-only), so the refusal lives where that
table is read: the client's content tests and the Tiled save.

### D5 — placeholder caps from the existing generators

`tools/make-cliff-tile.mjs` and `tools/make-cliff-smooth-tile.mjs` each gain a cap
output (`cliff-cap-placeholder.png`, `cliff-smooth-cap-placeholder.png`): the same
height as the tile (320 rows, the drop in the middle rows), the face narrowing as the
lip descends to meet the foot, with the shadow fading out. Its left edge matches the
tile's left edge (checked by the script). Real art is still wanted (`docs/art/assets.csv`).

### D6 — mountains and pits: a polygon with a cliff rim

A mountain or a deep hole is ENCLOSED by nature, so it is a polygon, not a path
(PO 2026-10-16). Most of it exists: the filled interior blocks
(`blocksMovement`, the zone-polygon raster), the fill is a ground texture (rock, or
something dark for a pit), and `outlineProfile` draws a rim. What is missing:

- **The rim never takes the ribbon mesh.** `paintOutline` (`RegionPaint.ts`) defaults to
  `aligned = false` and round corners for a polygon, so a `Cliff` rim draws with its
  texture fixed to the world and breaks at every bend. ⭐ The fix is the EXISTING mitred
  mesh, closed ring, whole-tile fit (§2), not `plan-world-paths.md` chunk B: round
  corners would fan every outer corner from one `u`, smearing the face into a wedge
  there, and a mountain outline has enough points for mitres to read smooth.
- **One new key, `outlineFacing`: `out` · `in`**, on `polygons[]`. `out` is a mountain
  (the face drops away from the shape), `in` is a pit (the face drops towards its
  centre). Present = the rim is drawn as an aligned, sharp, inset ribbon; absent =
  today's outline, unchanged (every shipped polygon).
  - ⛔ `outlineFacing` without an `outlineProfile` refuses the boot (a quiet no-op).
- **The drawn direction is derived, never authored.** The loader reads the polygon's
  signed area and orders the rim so the face points the way `outlineFacing` says.
  Which way you went round the shape in Tiled no longer matters, which removes the
  §9 direction landmine for closed shapes.
- **The rim sits INSIDE the boundary.** An outline is centred on the edge today, so half
  a cliff face would hang outside the collider, over walkable ground. In both cases the
  boundary is where you stop (a mountain's foot, a pit's lip), so the rim is shifted
  inward by half its width: one rim on the boundary, the other `outlineWidth` inside
  it. `ribbonGeometry` gains an asymmetric reach for this; the `v` registration does
  not change.
- **Collision is untouched.** The fill blocks, the rim stays decoration (polygons D3:
  an outline never collides).
- **Look:** a rim alone makes the top read flat, which suits a mesa more than a peak.
  Ridges or shading on the fill are art, not engine. For a pit, a dark fill (or later
  a gradient towards the centre; the lightmap branch could darken it) sells the depth.

⚑ This is the enclosed case of the parked Option B (§8), without merging, levels or
ramps. Nothing in it blocks B later.

## 4. Chunks

| Chunk | What | Depends on |
|---|---|---|
| **C1** ✅ | D1 per-end keys through every writer and validator | — |
| **C2** ✅ code | D2 `fade`: profile `cap`, the cap mesh, whole-tile middle, collision, the constant ×2 · D4 refusal for cap profiles · D5 placeholder caps · migrate the 7 cliffs after the look | C1 |
| **C3** ✅ code | D3 welds in `aura-convert.js`: end-to-end merge, the direction refusal, the T-weld | C1 (C2 for the scope rule) |
| **C4** | D6 `outlineFacing` through every polygon writer (Go `world.Polygon`, `aura-convert.js` + an `AuraOutlineFacing` enum on `AuraPolygon`, `ZoneModel.ts` `ZonePolygon`) · the rim as an aligned sharp inset ribbon · direction from signed area · one test mountain and one test pit | none (independent of C1-C3) |

## 5. Schema impact

DB none · FlatBuffers none · conf none · **zone format:** `endsStart`, `endsEnd`
(absent-safe) and the value `fade` · `terrain-profiles.json`: optional `cap`.
⚑ A running binary that predates the keys refuses `world.json` (`DisallowUnknownFields`):
rebuild before restarting (`dev-restart-windows.sh` does).

## 6. Test strategy

- **vitest** (`PathRibbon.test.ts`): the cap split and the whole-tile fit (the cap's
  inner edge lands on `u = 0`); the mirrored start cap keeps the face side; a path
  shorter than two caps clamps.
- **Go** (`paths_test.go`): per-end resolution; `fade` collision stops at the Q1 point
  and never narrows; the constant pinned against the TS side; `fade` without a cap and
  aligned `round` both refuse in `-validate`.
- **Converter** (`AuraTiledConvert.test.ts`): end-to-start merge; end-to-end refusal;
  mismatched profile refusal; the T-weld (projection, `flat`, order); roads untouched.
  Use awkward coordinates, not round ones (the `alignTexture` rider's lesson).
- **C4, vitest:** the inset rim (one rim on the boundary, the other `outlineWidth`
  inside); the same face side whichever way the polygon was wound, for both `out`
  and `in`; the ring fitted to whole tiles. **Go:** `outlineFacing` without an
  outline refuses; collision byte-identical with and without the key.
- **`bash tools/tiled/verify.sh`** for the round-trip.
- **In-game look (PO):** a faded cliff from both sides; an L weld; a T weld from the
  high side and from the low side; walking into a faded end; `point` and `fade` side by
  side before the migration; a mountain and a pit (C4), walked round, on the world
  view AND the full-screen map (it bakes the same paint).

## 7. Open PO calls

- **Q1 — where does the wall end under `fade`?** Options: where the cap starts (the
  sloped end is walkable, like a ramp), halfway into the cap, or at the tip. Proposal:
  a constant `FADE_WALL_FRACTION` [PLACEHOLDER], tried at 0, 0.5 and 1 in C2's look
  session, then fixed.
- **Q2 — key names.** `endsStart` / `endsEnd` sort together in Tiled's property list;
  alternatives welcome.
- **Q3 — snap distance** for welds [PLACEHOLDER 0.5 u].
- **Q4 — the T-weld from the high side.** It may need the stem drawn above, not below,
  when it approaches from the lip side. Decided in-game.
- ✅ **Q5 — D4's scope: cap profiles only**, forced by the river (D4).
- ✅ **Q2 — key names:** shipped as proposed, `endsStart` / `endsEnd` (C1).
- ✅ **Q6 — `outlineFacing` names: `out` / `in`** (PO 2026-10-16).
- ✅ **Q7 — a narrow neck: left to the eye** (PO 2026-10-16). An inset rim folds over
  itself where the polygon is narrower than twice `outlineWidth` (the mitre limit
  clamps spikes, not folds); `-validate` does not check it.

## 8. ⏸ PARKED: Option B, cliffs as the edge of a raised area

Kept open for the future (PO 2026-10-16). The alternative this session weighed first:

- You author the high ground as a closed shape with a **level** number, and the cliff
  is drawn along its edge as a closed ring (no ends, so the seam fitting in §2 applies).
- Overlapping shapes on the same level merge into one outline, so joins are real
  corners. **Stacking:** each level N draws the merged outline of every shape at level
  N or higher (contour lines). A higher shape crossing a lower one's edge was the hard
  case; the proposal was to refuse it at load first, and only build a taller face when
  a map needs one.
- The face always points away from the raised area, so it can never face the wrong way.
- Ramps were separate objects laid across the edge, opening the wall the way a bridge
  prop already opens a path's collision.

**Why it is parked, not chosen (PO):** a raised area must not be enclosed on all sides.
The PO wants ground that is raised at one end and simply continues into the next area
at the same level, without painting a giant area. And ramps should stay holes between
cliff ends, not props.

**What would bring it back:** content that is mostly enclosed plateaus, mesas or
terraces, or a need to know a point's height (for example, height-dependent gameplay).
The `fade` cap art (D2) carries over as its ramp art, and C4's inset rim with derived
facing is the ring B would draw.

⚑ Height is NOT the fix for walls as safe farming spots (`docs/feedback.md`
2026-10-16): that is a mob-behaviour rule for every wall.

## 9. Landmines

- ⛔ **Direction decides the face side** and nothing in Tiled shows it. The weld's
  direction refusal (D3) is the only guard; keep it.
- ⚑ Every new constant shared by client and server is held twice and pinned by tests
  naming each other (the taper's pattern). Do not add a third copy.
- ⚑ The Tiled extension is a copy: re-run `install.sh`, or the first save silently
  drops the new keys (happened with `alignTexture`).
- ⚑ After any `api/` edit, rebuild or boot with `-content ../api`; a zone edit needs a
  restart (`project-zone-edit-half-live`).

## 10. Chunk ledgers

### C1 — SHIPPED 2026-10-16 on branch `cliffs` (PO in-game look passed)

`endsStart` / `endsEnd` on `paths[]`, each overriding `ends` for one end.

- **Go:** `world.Path.EndsStart` / `EndsEnd`, `endOf(start)`, the same vocabulary and
  ring refusal for all three end keys (`validatePathShape`); `pathTaper` tapers each
  pointed end on its own, a lone taper clamped to half the path like a pair.
- **Client:** `PathShape.ends` is now a resolved pair `[start, end]` (`toPaths`);
  `taperedCentreline` takes which ends are pointed; `pathSilhouette` keeps the one
  stroke when both ends match, otherwise butt-caps it and fills each end on its own
  (a taper outline, or a new `roundCapOutline` half disc that meets the butt edge
  without overlapping it). `paintRibbon` falls back if EITHER end is round.
- **Writers:** `aura-convert.js` (read, write, validation; both keys use the existing
  `AuraPathEnds` enum), `generate-palette.mjs` → `AuraPath` members, `ZoneModel.ts`
  (carried). The completeness pin now includes both keys.
- ⚑ D4 moved to C2 (see D4: the drifting river is aligned + round).

**Schema:** DB none · wire none · conf none · zone format +2 keys (absent-safe; no
shipped zone changes).

**Verified:** Go `world` red-first then green, full suite bar the known prop pin
(`TestPropContent_C1bMigrationPreservesLookAndCollision`) · `-validate` 0 findings on
both zone sets · vitest 1717/0 (11 new/updated red-first) · typecheck clean · Tiled
extension reinstalled · `tools/tiled/verify.sh` all green (its palette leg reads
"stale" only on an EOL difference after a restore; `project-palette-regen-dirties-tree`).
✅ **PO in-game look passed** (a cliff authored `endsStart: point`, `endsEnd: flat` in
Tiled; that `world.json` edit stays the PO's, uncommitted) · pre-commit join smoke
`hygiene-wire-prune.mjs` against the dev client: 0 console errors, 0 WebGL losses.
⚑ A `round` end on an `alignTexture` path still drops the whole path to the stroke
(D4, C2).

### C2 — CODE SHIPPED 2026-10-16 on branch `cliffs`; ⛔ PO look + migration OWED

The `fade` end, the profile `cap`, D4's refusal and the placeholder caps.

- **Go:** `fade` joins `PathEnds`. `capLengthPerWidth` = 2 (pinned against the TS
  side) and `fadeWallFraction` = 0.5 [PLACEHOLDER, Q1: server-only, set it to 0 / 0.5 /
  1 in the look and rebuild]. `pathTaper` also measures each faded end's open stretch:
  the wall stops there at FULL width, rects clipped to the exact cut, no joint in the
  open part, clamped to half the path like the taper.
- **Client:** `PathEnds` + `fade`, `CAP_LENGTH_PER_WIDTH` = 2. Profiles parse `cap` (a
  file stem, read off the surface's OWN profile, `regionCap`), and `neededTextures`
  loads it with the tile; a cap texture CLAMPS instead of repeating, or its first column
  would bleed into the tip. `fadedRibbon` cuts ONE ribbon into cap / middle / cap (rim
  pairs shared where pieces meet, mitres included), the start cap mirrored in `u`
  only, the middle fitted to whole tiles; a `point` other end still narrows.
  `paintRibbon` draws the pieces as up to three meshes in one masked container; while
  the cap is loading, or on a profile without one, `fade` draws as `flat`. The stroke
  silhouette treats `fade` as `flat`.
- **D4 + "fade needs a cap"** (the server cannot see the profile table): a content test
  over every shipped zone file, areas included (`Paths.test.ts`), and the Tiled save
  (`checkCapShape`, from a generated `content.json` `CAP_PROFILES`). Every shipped
  aligned cliff is already sharp with no round end.
- **D5:** `make-cliff-tile.mjs` and `make-cliff-smooth-tile.mjs` write
  `cliff-cap-placeholder.png` / `cliff-smooth-cap-placeholder.png`, 360×320 (2 × 1.5 u
  at scale 1, so unstretched at the documented width): everything above the foot sinks
  toward it, the shadow and talus thin out. Checked: the left column equals the tile's
  column 0 to the byte, the tip column is clear. Both profiles name their cap. The
  tiles themselves regenerate byte-identical.

**Schema:** DB none · wire none · conf none · zone format: the value `fade` (no shipped
zone uses it yet) · `terrain-profiles.json`: `cap` on `Cliff` and `Cliff Smooth`.

**Verified:** Go `world` red-first then green, full suite bar the known prop pin ·
`-validate` 0 findings on both zone sets · vitest 1742/0 (new legs red-first) ·
typecheck clean · Tiled extension reinstalled · `tools/tiled/verify.sh` all green ·
`hygiene-wire-prune.mjs` against the dev client: 0 console errors, 0 WebGL losses.

⛔ **Owed:** the PO look (§6: `point` and `fade` side by side, a faded cliff from both
sides, walking into a faded end at 0 / 0.5 / 1), then Q1's ruling, then migrating the
cliffs in `world.json` from `point` to `fade` (9 in the working copy, the PO's
uncommitted edits included, so the migration waits for that file to be committed).

### C3 — CODE SHIPPED 2026-10-16 on branch `cliffs`; ⛔ one Tiled save + PO look OWED

Welds in the Tiled save, `weldPaths` in `aura-convert.js`, run by `modelToZone` on each
array (the zone level's and each area's, never across them).

- **End to start** within `WELD_SNAP` [PLACEHOLDER 0.5 u, Q3] → ONE path (A's points,
  then B's minus its first), A's start shape and B's end shape (`ends` when they agree,
  else `endsStart` / `endsEnd`). Chains (A→B→C) and either array order work. Refused
  when they differ in `profile`, `width`, `blocksMovement`, `alignTexture`, the outline
  pair, `corners` or `effect`, naming the keys.
- **End to end / start to start** → refused, "face opposite ways; reverse one".
- **T-weld:** an end that meets no other end, within half a bar's width of the bar's
  centreline and more than `WELD_SNAP` from the bar's own ends (a ring bar has none):
  the end is projected onto the bar, set `flat`, and the stem moved before the bar. A
  second save changes nothing (an end already on the line is not re-projected).
- Cap profiles only; roads and rivers never weld. `validateModel` reads the zone
  UNwelded (`modelToZone(m, true)`) and turns each refusal into one error naming both
  objects.

⛔ **The shipped world has ONE T-junction, and it welds on the next Tiled save**: root
path 10 (`Cliff`, 9 points) starts 0.001 u off root path 5's centreline, 2.7 u before
path 5's pointed end. The save sets its `endsStart` to `flat` and moves it before path
5 (the point rounds back to the same 0.01 u). Not applied here: `world.json` carries
the PO's uncommitted edits. Until the PO saves it once in Tiled, the four
`world.json` round-trip legs of `verify.sh` and two vitest legs ("a full Tiled-model
round-trip reproduces world.json exactly", "finds nothing to weld in the shipped
world") are red, by that diff alone. Then Q4 (that T from the high and the low side)
in the look.

**Schema:** DB none · wire none · conf none · zone format none (welds write keys that
already exist).

**Verified:** converter vitest legs red-first then green (merge, chain, order, snap
boundary, opposite-ways refusal, mismatch refusal naming the key, roads untouched,
T-weld end and start, idempotent, half-width boundary, refusal naming both objects
on save) · the weld of the shipped world checked by hand: only the T above, and
stable on a second pass · Tiled extension reinstalled.
