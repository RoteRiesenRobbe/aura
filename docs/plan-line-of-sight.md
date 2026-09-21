# Plan: line of sight — what the light actually reaches

> **Status: DESIGNED, NOTHING BUILT. Split out of `plan-region-atmosphere.md`
> 2026-09-16 (PO-asked) with every section below carried VERBATIM from it.** All
> numbers **[PLACEHOLDER]** unless marked measured.
>
> ⏸ **UNSCHEDULED, and inclusion is NOT RULED (PO 2026-09-21).** Nothing here
> is "next". The one line-of-sight idea that was actually prototyped (AURAS,
> branch `prototype/aura-los`, 2026-08-15) came back with the PO verdict *"we
> don't need it yet, or it is just a different game entirely"* (`roadmap.md`
> item 6). Whether that verdict also covers this light-only variant is an open
> PO call, and B1 does not start without it.
>
> ⭐ **This is the second half of the PO's original atmosphere ask**, and their
> words are still the brief:
> *"we can then also extend this to limit surrounding darken reveal only until we
> hit a cave wall or other object. this would give a 'line of sight' effect."*
>
> ⭐ **Why it is its own plan** (PO 2026-09-16, *"I feel like it should maybe move
> to its own plan"*): the A-half answered **what the air looks like** and shipped
> as AUTHORING VOCABULARY — profile keys, a Tiled class, the four-writer tax. B
> answers **what you can see through it** and is GEOMETRY plus render-target
> work with almost no authoring surface at all: one prop-definition flag. They
> share a render layer and nothing else, and B's open questions (does a tree
> occlude? whose lights get shadows?) are not atmosphere questions.
>
> ⚑ **What stayed in `plan-region-atmosphere.md`:** everything A — the two dials,
> the two profile tables, `sight`, `AuraClearing` — all shipped, plus **A3**, a
> PO content call, which is the only thing keeping that doc out of `archive/`.
>
> ⛔ **B clips LIGHT, never AURAS.** Aura line-of-sight was **CUT 2026-07-10**
> (`gdd.md` §142/§163, `roadmap.md` item 6) and the `blocksAura` flag deleted
> 2026-07-11. Auras pass through every wall and this plan does not reopen that.

## 1. What this is

Today **every light is an unconditional circle**: a `Sprite` of a radial-gradient
texture with `blendMode: 'erase'`, sized to the light radius and clipped by
nothing. So a lantern erases the darkness on the far side of a cave wall, and
the wall you cannot walk through is the wall you can see straight past.

B clips each light hole to what the light can actually reach:

| Chunk | What | Purity |
|---|---|---|
| **B1** | `Occluders.ts` — segments from props, blocking paths, blocking polygons, the border | **pure**, 100 % testable |
| **B2** | the visibility polygon — the angular sweep | **pure**, 100 % testable |
| **B3** | the stencil mask on the light sprite | **untestable**, in-game only |

⭐ **Two of the three chunks are pure geometry, and that is the design.** The
drawing half is untestable under vitest by exactly the split that leaves
`buildBlendMask` and `ZoneCurtain`'s CSS untested, and `plan-underworld.md` U4b
is the cautionary tale: *"a green `CurtainSequence` says nothing about whether
anything animates."* Push everything that can be a number into B1 and B2.

⭐ **The no-occluder case returns today's circle**, which is what makes B safe to
land: a zone that authors no occluders builds an empty set and B is inert.

## 2. Decision ledger

| | Decision | Status |
|---|---|---|
| **D8** | An occluder is authored by the prop **DEFINITION** (`occludesSight`), not by the placement — the `crossesPaths` idiom, not the `blocksMovement` one. §4.1 argues why this one goes the other way from paths **D4**. | PROPOSAL |
| **D9** | **B ships with LOS on the local player's own light only.** Every other light keeps its circle. §4.3 has the compositing reason and the upgrade path. ⚑ **Re-priced 2026-09-16, §3**: the reason is still COMPOSITING CORRECTNESS, but the performance objection to *N* lights is much weaker than it looked once static lights are cached. | PROPOSAL, needs PO (§7 Q3) |
| **D10** | The visibility polygon is a **stencil** mask (a `Graphics` set as `mask`), never an alpha mask, and the falloff stays a texture. **L2 + L3.** | FORCED by the engine, not a preference |
| **D19** | ⭐ **A STATIC light over a STATIC occluder set has a STATIC visibility polygon, and it is cached.** Only a light that MOVES pays the sweep per frame. §3 is the measurement that makes this the load-bearing perf decision rather than an optimisation. ⚑ Designed in from B2 rather than retrofitted, because the cache key (light position + occluder-set revision) is easier to get right before there are consumers. | PROPOSAL, new with the split |

## 3. ⭐ Performance — MEASURED 2026-09-16, not estimated

⛔ **The cost is quadratic in SEGMENTS PER LIGHT, and linear in lights.** The
sweep tests every candidate ray against every segment, so doubling the segments
in range roughly **quadruples** the work. Lights are the easy axis; radius is
the dangerous one, because segments-in-range grows with radius **squared**.

One visibility polygon, one light, one frame (desktop, Node, the §4.2 algorithm):

| Segments in radius | Per sweep | % of a 60 fps frame | Lights to fill a frame |
|---|---|---|---|
| 3 | 10 µs | 0.06 % | 1663 |
| 11 | 57 µs | 0.34 % | 293 |
| 19 | 145 µs | 0.87 % | 115 |
| 34 | 355 µs | 2.13 % | 46 |
| 64 | 1075 µs | 6.45 % | 15 |
| 128 | 3756 µs | 22.5 % | 4 |

**Against real content.** `underworld.json`'s two blocking polygons carry **64
wall segments** — the only real LOS venue that exists today. Sampled on a 0.5 u
grid over the whole zone:

| Light radius | Mean segments in range | **Worst case** |
|---|---|---|
| r 4 (Lantern) | 3.1 | **11** |
| r 7 (campfire) | 8.0 | **19** |
| r 12 | 18.9 | **34** |

⭐ **So D9 as designed — the local player's own light, r ≈ 4 — costs ~57 µs
worst case, 0.34 % of a frame.** It is free, and no argument about it is worth
having.

⚑ **Opening it to other players**, the PO's actual question: 10 players at
lantern radius ≈ 570 µs (3.4 %) and still fine; **20 lights at campfire radius
in a dense cave ≈ 2.9 ms — 17 % of a 60 fps frame, on a DESKTOP.** ⛔ The known
mobile ceiling is roughly 3–5× slower, which puts that case underwater.

⭐ **D19 is what collapses it.** Campfires do not move and cave walls do not
move, so a campfire's visibility polygon is computed once and cached until the
occluder set changes; only players and mobs pay per frame. The 5-campfires +
20-players case becomes **20 sweeps, not 25**, and the campfires cost nothing
after the first frame.

⚑ **The GPU is not the bottleneck.** D10's stencil is one push/pop per LOS light
per frame — 2*N* state changes, noise beside the CPU sweep at any *N* this game
will see. ⛔ Do not reach for a GPU-side scheme to fix a CPU-side cost.

⚑ **Where to look first if it ever does get slow**, in order: cap the number of
LOS lights before capping their radius (linear beats quadratic); cache static
lights (D19); only then consider a spatial index for the occluder filter —
§4.1 argues, with the density counted, that the naive linear scan is right for
the shipped world.

## 4. Design

### 4.1 B1 — the occluder set

A pure module (`features/darkness/logic/Occluders.ts`): no PixiJS, no
`require.context`, turning bundled zone data into **segments in world pixels**.
⚑ Its own file for the reason `PropPlaceholderLayout.ts`'s header states —
*"Props.ts reaches `require.context` at import time, which only webpack
provides. Anything importing it is untestable under vitest."* The geometry is
the part most worth testing, so it must not import the bundlers.

Three sources, all already client-side and all static at load:

1. **Props.** `zone.props` gives type · x · y · rotation · scale ·
   `blocksMovement`; `api/props/*.json` gives the body — `Props.ts:63` already
   bundles those definitions, and `propFootprint()` already reconstructs
   half-extents from the same authored body. Circle bodies contribute a tangent
   pair; rect bodies four rotated segments. ⭐ **Zero wire cost and no streaming
   pop**: this reads the bundled zone copy, not the AOI-streamed entity, so a
   wall occludes before it has streamed in.
2. **Blocking paths** — the cave walls, per `plan-underworld.md` §7.1. A stroked
   polyline of width *w* is two offset polylines plus round caps; for occlusion,
   the **centre-line segments dilated by w/2** is close enough and far simpler.
   ⚑ **[REVIEW] A path may now be CLOSED** (`PathDefinition.closed`, shipped P1
   `8d9dc4b9`), so the derivation must emit the **wraparound segment** from the
   last point back to the first. The loop asks *"is there a next SEGMENT"*,
   never *"is there a next point"* — P1's own finding — and the failure mode
   here is a ring wall that leaks light through exactly one seam.
   ⚑ **`Paths.ts` deliberately drops `blocksMovement` from the drawn path and a
   test pins that** (`Paths.test.ts:53`). Do **not** relax that pin — the
   occluder set is a **second derivation from `PathDefinition`**, beside
   `toPaths()`, and not a change to what gets drawn (**L6**).
3. **The zone border** — four segments from `bounds` at `origin`. Free, and
   without them a light at the wall spills into the void.
4. ⭐ **[REVIEW] Blocking polygons** — `zone.polygons` carrying `blocksMovement`,
   which did not exist when this plan was written (zone-polygons P2–P4, designed
   2026-09-09, shipped uncommitted by review time). **This is the PRIMARY source
   now, not a fourth afterthought**: `CLAUDE.md` names *"cave walls as blocking
   polygons"* as the polygon primitive's first content consumer, while
   `plan-underworld.md` §7.1 item 1 still says *paths* — the two disagree, and
   **B1 reads both rather than waiting for the ruling** (§7 Q4). The geometry is
   the cheapest of the three: `Polygons.loadedPolygons()` already hands over
   world-pixel vertices with `origin` applied, and a polygon's occluder set is
   its **edges, closed** — no dilation, no caps. ⛔ The **outline**
   (`outlineProfile` / `outlineWidth`) is decoration and contributes nothing;
   occlude on the authored ring only.

**D8 — `occludesSight` is a prop-DEFINITION field.** `plan-world-paths.md`
**D4** put `blocksMovement` on the *placement* and `plan-underworld.md` U3b
followed it for `anchor`, so the burden is on going the other way. It is
discharged: those two are about **where a thing is used** (this river is
fordable here; this door leads there), whereas *"can you see through a boulder"*
is about **what the thing is** — a material fact, the same category as
`crossesPaths` on a bridge, which is a definition field for exactly this reason.
⚑ And its **absence** is what matters most: `occludesSight` defaults false, so a
zone with no authored occluders builds an empty set and B is inert, exactly as
`darkness` and `haze` default 0. ⚑ That sentence said `gloom` when it was written;
the dial was split in two and renamed by A1 (`plan-region-atmosphere.md` §10), and
the rule it states is unchanged.

⚑ **The collider is not the silhouette.** `body.collisionFactor` shrinks the
collider (a tree's trunk is 0.714 of its crown); an occluder should use the
**visual** body, because what you cannot see past is the thing you can see.
Whether a tree occludes **at all** is §7 Q2 — a canopy is above eye height in a
top-down world, and shadowing every trunk in a forest may read as noise.

**Cost, counted rather than feared.** `world.json` is 772 props over 144 × 72 =
10 368 u² → **0.074 props/u²**. The sweep set is what lies inside the light
radius, not the screen: a Lantern at r 4 covers ~50 u² ≈ **4 props ≈ 16
corners**; a campfire at r 7 covers ~154 u² ≈ 11 props ≈ 45 corners — and
occluders are a subset of those. This is not a scale problem, and B1 should ship
the naive filter (linear scan, squared distances, the `inAnyCircle` idiom)
rather than a spatial index.

### 4.2 B2 — the visibility polygon

The classic angular sweep: pure math, fully unit-testable, and that matters here
because ⛔ **the drawing half is not** — it is untestable under vitest by exactly
the split that leaves `buildBlendMask` and `ZoneCurtain`'s CSS untested, and
`plan-underworld.md` U4b is the cautionary tale: *"a green `CurtainSequence`
says nothing about whether anything animates."* Push everything that can be a
number into B2.

For a light at *P* with radius *r*, over the segments B1 hands it:

1. Collect candidate angles: both endpoints of every segment, each ± a small
   epsilon so a ray slides past a corner instead of stopping on it.
2. Cast each ray, take the nearest hit, clamp to *r*.
3. Sort by angle; the hit points in order are the polygon.
4. Between two consecutive rays that both ran to the clamp, insert arc points so
   the unoccluded part stays visibly round rather than a chord.

Edge cases that must be **tests, not comments**: no occluders at all (→ the full
circle, i.e. **today's behaviour, which is what makes B safe to land**) · the
light **inside** an occluder (→ degenerate; return the circle rather than a black
screen) · collinear and duplicate endpoints · a segment entirely outside *r*.

### 4.3 B3 — drawing it, and the two engine facts that pick the design

The light hole today is a `Sprite` of a canvas radial-gradient texture with
`blendMode: 'erase'`. To clip it, set the visibility polygon as that sprite's
**mask**:

```ts
light.sprite.mask = new Graphics().poly(visibility).fill(0xffffff);
```

⭐ **D10 is forced, not chosen:**

- **`FillGradient` in the installed PixiJS 8.4.1 is LINEAR ONLY.** Its
  `GradientType` union names `'radial'` and the class implements only
  `buildLinearGradient()` — verified at HEAD in
  `node_modules/pixi.js/lib/scene/graphics/shared/fill/FillGradient.d.ts`. So the
  obvious shortcut — draw the visibility polygon *with* a radial gradient fill
  and skip the mask entirely — **does not exist**, however much the type name
  suggests it does.
- **A `Graphics` mask is a STENCIL; a texture/sprite mask is a FILTER PASS.**
  Region-primitive **L12** is about the second (`AlphaMaskPipe extends
  FilterEffect` — a render-target switch per masked object per frame);
  `paintSurface` already discovered and documented the first, giving a scrolling
  surface with `blend: 0` *"a CHEAP one: the plain silhouette as a stencil, no
  RenderTexture and no blur pass."* Same path here.

⚑ **The mask must be built from the sprite's own interpolated position**, not
the snapshot position — `update()` already copies
`light.object.shape.position` onto the sprite each frame, and a polygon built
from a different point lags the avatar by one interpolation step, which reads as
the shadows swimming.

**D9 — one LOS light in v1, and the reason is compositing, not cost.** Shadows
do not compose by drawing black over the light: a point in A's shadow but lit by
B is lit, so each light needs its **own** clipped erase shape. Per-light masks
are correct by construction, and the cost is one stencil pass per LOS light per
frame. Starting at one — the local player's, the only hole whose shape you are
actually reading — keeps the first landing at a single stencil, and widening to
*N* is the same code in a loop. §7 Q3 is the PO's call on whether an ally's torch
shining through a wall beside your correctly shadowed one is worse than no
shadows at all.

## 5. Schema impact

- **DB: NONE.** Nothing here is persisted.
- **WIRE: NONE.** Every occluder is derived from the BUNDLED zone copy and the
  bundled prop definitions, client-side. ⭐ That is deliberate and it is what
  makes a wall occlude before it has streamed in — see §4.1 item 1.
- **CONF: NONE.**
- **CONTENT: one new prop-DEFINITION field**, `occludesSight` (D8), defaulting
  false — so a zone that authors none builds an empty set and B is inert.
- **ZONE FORMAT: NONE.** B1 reads `blocksMovement` on paths and polygons, which
  both already exist.

## 6. Test strategy

- **B1 and B2 are pure and should carry the whole weight.** Segment derivation
  and the sweep are DOM-free and vitest-reachable; §4.2 lists the edge cases that
  must be tests rather than comments.
- **B1 wants a count assertion against the real `world.json`**, derived not
  hardcoded — `feedback-tests-derive-not-hardcode`, and the A4 lesson that a
  test naming a census reddens on every map edit.
- ⛔ **Mutation-verify B2's no-occluder case**: returning the raw circle when
  occluders DO exist looks exactly like B3 not being wired up.
- ⛔ **B3 is untestable and the ledger must say so**, the posture
  `plan-world-paths.md` C3 and `plan-underworld.md` U4b both took.
- **Test in a PLACED zone** (L5) — and the underworld is both the only placed
  zone and the only one with occluders, which is convenient for once.
- ⚑ **Frame time on the mobile ceiling is a B3 acceptance criterion**, not a
  nice-to-have: §3 says desktop is free and says nothing about phones.

## 7. Open questions for the PO

1. **Do trees occlude?** A canopy is above eye height in a top-down world, and a
   forest of trunk shadows may read as noise rather than as sight lines. My lean:
   **rocks, boulders, houses and gate walls yes; trees no** — `occludesSight`
   authored on four of the six shipped prop definitions (`Rock`, `Boulder`,
   `House`, `GateWall`; ⚑ that count silently excludes `Tombstone` as well as
   `Tree` — a headstone is knee-high, so no, but say so).
2. **Should LOS shape `isHidden()`?** (L4) If yes, a mob behind a wall loses its
   nameplate — consistent, and arguably the point. If no, plates leak the
   position of things you cannot see. ⚑ Either way this is the only place the
   feature touches something a player can play around, so it wants a ruling
   rather than a default.
3. **LOS on one light or on all of them?** (D9) One is a single stencil and the
   only hole whose shape you read. All of them is correct, but is *N* stencils
   and makes every ally a per-frame sweep. ⚑ **Re-armed by §3**: the perf case
   against *N* is much weaker than it looked — with D19's cache the real cost is
   moving lights only. So this is now mostly a LOOK question: is an ally's torch
   shining through a wall, beside your correctly shadowed one, worse than neither
   of you having shadows? My lean: **ship one, look at it, then decide** — the
   widening is a loop.
4. ⚑ **Are cave walls paths or polygons?** `CLAUDE.md` says polygons;
   `plan-underworld.md` §7.1 item 1 still says paths. B1 reads both either way,
   so this blocks no chunk — but it decides what the PO actually authors in
   Tiled, and therefore which occluder leg ever gets walked in front of the game.
   ⚑ **The content has since answered in practice**: `underworld.json` authors
   **2 blocking polygons, 64 segments, and zero blocking paths**, so polygons are
   what a ruling would be ratifying.

## 8. Landmines

- **L2 — a texture mask is a filter pass; a `Graphics` mask is a stencil.**
  Region-primitive **L12** plus `paintSurface`'s cheap-mask path. Getting this
  backwards puts a render-target switch per light per frame on a client whose
  measured frame time is ~204 ms/Mpx on a phone.
- **L3 — `FillGradient` is linear-only in 8.4.1** despite `GradientType` naming
  `'radial'`, so the soft falloff has to stay a texture. Verified at HEAD;
  re-check on any PixiJS bump, because this is the one landmine here that a
  version bump *removes*.
- **L4 — `isHidden()` is the one gameplay-adjacent surface in the whole plan.**
  It gates mob nameplates today, already justified as *"vision in the dark is the
  light role's job (GDD 'spotting targets'), and a readable plate over an
  invisible mob hands that away for free."* Let LOS shape it and a mob behind a
  rock loses its plate — which is either the feature working or a stealth
  mechanic arriving through the back door. §7 Q2.
  ⚑ **[A4] `isHidden` has a SECOND input now** — `Clearings.clearsAt`, which is
  not a profile walk. Anything B adds to that function is the THIRD, and the A4
  ledger records what that class of seam costs when missed.
- **L5 — the zone origin, U4a's bug verbatim.** Every shape here is built from
  zone-local authored coordinates and drawn in world space. `Regions.toRegions`
  and `DarknessOverlay.loadZone` both already apply `origin`; anything new must
  too, and the failure is **invisible in `world`** (origin `{0,0}`) and 300 units
  off in the underworld. **Test in a placed zone or you have not tested it.**
- **L6 — `Paths.ts` drops `blocksMovement` on purpose and a test pins it.** The
  occluder derivation is a second reader of `PathDefinition`, not a change to the
  drawn path. Do not "fix" the pin.
- **L7 — a module reaching `require.context` at import time is untestable.**
  Stated in `PropPlaceholderLayout.ts`'s header; it is why B1 is its own file
  rather than a function inside `Props.ts`.
- **L8 — the `paused` guard.** A per-frame polygon rebuild advanced across a
  pause jumps by the whole pause — the trap `advanceSurfaceScroll` already
  documents at `Game.ts:467`.
- ⚑ **L19 — the player's OWN LIGHT lights the player, and it breaks probes.**
  `isHidden` returns false for any point inside any light, so asking it about the
  tile the player is standing on always answers "lit" whatever the air is doing.
  ⛔ Measured the hard way while writing `a4-clearing.mjs` (A4 ledger): both
  readings came back false, which reads exactly like a broken feature. Ask from a
  distance — the query takes explicit world-pixel coordinates precisely so it
  can be asked about somewhere else.
- ⚑ **L20 — a clearing's overlap with a dark bank can be narrower than the light
  the player carries**, and then the camera cannot see the feature at all. A4's
  pixel A/B is inconclusive for exactly this reason. Any B probe that samples
  pixels needs a venue chosen so the thing under test is BIGGER than the carried
  light, or it measures the lantern.

## 9. Cross-references

- `docs/plan-region-atmosphere.md` — ⭐ **the parent plan and the other half of
  the same PO ask.** §1.1 (why now), **D0** (atmosphere is its own array),
  **D15/D16** (never blocking, its own layer), §3.8 (the z-order B3 draws into),
  and the A0–A4 ledgers. The darkness layer B3 masks is that plan's.
- `docs/plan-zone-polygons.md` — `zone.polygons`, `blocksMovement`, the `closed`
  flag on paths, and `outlineProfile`/`outlineWidth`. **B1's primary occluder
  source**, and the P3 finding that a grid-aligned fixture proves nothing about a
  sampled collider — which applies to occluder fixtures verbatim.
- `docs/plan-world-paths.md` — the path primitive, **D4** (per-placement
  blocking, the ruling D8 goes the other way from and says why), and C3's
  cheap-stencil-mask finding.
- `docs/plan-underworld.md` — **§6** (what the underworld gets for free),
  **§7.1 item 1** (cave walls as blocking paths — the claim §7 Q4 disputes),
  **U4a** (the zone-origin bug L5 restates), **U4b** (the untestable-drawing
  posture).
- `docs/plan-region-primitive.md` — **L12/L13** (masks and render textures),
  **L7** (never the day/night filters).
- `docs/archive/plan-atmosphere-recovery.md` **§3.3** — where `darkAreas`,
  `light_aura`, `light_radius` and `DarknessOverlay` shipped.
- `docs/plan-world-scale.md` / `docs/plan-server-performance.md` — the frame
  budget §3 is spending, and the mobile ceiling it does not measure.
- `docs/gdd.md` — Darkness & Light (purely visual; Lantern and Torch), §184/§205
  (⛔ **aura** LoS cut 2026-07-10 — this plan is about LIGHT).

## 10. Chunk ledgers

*(none — nothing built)*
