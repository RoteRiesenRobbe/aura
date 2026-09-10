# Plan: region atmosphere — the air a region carries, and what you can see through it

> **Status: DESIGNED 2026-09-08. Nothing built. Every ruling below marked
> PROPOSAL is mine and the PO may veto any of them; §8 holds the calls I could
> not make.** All numbers **[PLACEHOLDER]**.
>
> Opened by the PO ask, verbatim:
> *"what if we introduce effects per region (we can call it region-atmosphere).
> this means when a player is in a certain region like a dungeon, there is for
> example a dark fog surrounding them and limiting their view similar to the
> darkAreas we already have, but global and not placed in the level separately.
> we can then also extend this to limit surrounding darken reveal only until we
> hit a cave wall or other object. this would give a 'line of sight' effect."*
>
> ⭐ **This is the consumer `plan-region-primitive.md` §4.3 already has a row
> for** — *"atmosphere / fog · the local player's position, per frame"* — and
> the answer to its §11 open question *"should `darkAreas` eventually fold into
> `regions`?"*. It is also the case `archive/plan-atmosphere-recovery.md` §3.3
> deliberately left open when darkness shipped: *"circles first… polygons only
> if content proves the need."* §1.1 is that proof.
>
> ⚑ **Schema: DB NONE · wire NONE · conf NONE · content NONE, for the whole
> atmosphere half.** The profile table is client-side by region-primitive
> **D12** (`frontend/src/client-data/profiles.json`), so A1–A2 touch no zone
> file, no Go, no `cp-defs` and none of the three zone-format writers. ⭐ **A
> consequence worth stating up front: the atmosphere half is FULLY live under
> HMR** — no server restart, none of [[project-zone-edit-half-live]]'s boot-time
> seam. Tuning gloom in front of the game is a file save. Only **B1** touches
> content, and only by one optional prop-definition field.

## 1. What this is

Two features that share one lookup, and they are separable in that order:

- **A — atmosphere.** A region's profile gains properties that describe the
  **air** rather than the ground: how dark the region is (`gloom`) and how far
  you can see inside it (`sight`). One authored polygon replaces a hand-placed
  chain of dark circles, and the same table that already says what a swamp
  looks like underfoot now says what it is like to stand in one.
- **B — line of sight.** The hole your own light punches in that darkness stops
  at walls instead of being a circle. Vision becomes what you can actually see
  from where you stand.

**A ships without B. B is worthless without A** — with nothing dark on screen
there is nothing for a wall to cut into. That ordering is the whole chunk plan.

### 1.1 Why now — the evidence, counted

- **`world.json` holds 35 hand-placed `darkAreas`**, in three obvious chains of
  9, 9 and 13 circles at a repeating grid pitch (`{-62.4,-25.2} … {-50.4,-10.8}`
  at 6-unit spacing, r 7.2). Nobody wanted 35 circles; they wanted three dark
  *places*, and circles were the only vocabulary available.
- **`underworld.json` holds exactly one** dark circle, r=10 at the room's
  centre — and its own U3b ledger records why it is not the whole room: *"⚑
  deliberately **not** wholesale dark — a pitch-black demo room is one nobody
  can find the exit in."* That is a **content** compromise forced by the
  **shape** vocabulary. A cave zone wants "all of this is dark, and the exit is
  a lit pocket", which is one polygon and one hole, not a tiling of circles.
- **The region primitive is shipped and the underworld already leans on it.**
  `plan-underworld.md` §6 already says the region and path primitives *"carry
  the whole visual identity (cave floor, lava rivers, chasm edges) with no new
  code"* — and then, one bullet earlier, that `darkAreas` are *"circles only —
  a wholesale-dark zone wants one enormous circle, a chain of them, or the
  first polygon dark area."* This plan is that last option, and it costs less
  than the first two because the polygon already exists: it is the cave floor
  region.
- **Cave walls are already the recorded direction.** `plan-underworld.md` §7.1
  item 1: *"Build the cave walls as blocking `paths`, not props"* — **the
  single biggest perf decision in that feature, and a content one.** B1's
  occluder set therefore already has its primary geometry: authored,
  client-side, and free of streaming.

### 1.2 What this is NOT — three fences, all of them pre-existing

1. ⛔ **This is not aura line-of-sight.** Aura LoS was **CUT 2026-07-10** and
   `blocksAura` was deleted 2026-07-11 (`gdd.md` §184/§205, `roadmap.md` item
   6, `backlog.md` §629). Auras pass through walls and always will. What B adds
   is **vision**, and `gdd.md` is explicit that the two are different things:
   *"darkness is purely visual. It restricts vision but has no effect on
   damage, hit chance, or aura behavior — in the dark you can be hit, you just
   see poorly."* ⭐ **That fence is also what makes B cheap**: vision is a
   client-side question, so nothing here reaches the server, the wire or the
   simulation — and by the same token, nothing here can ever be balance.
2. ⛔ **Never on the day/night filter machinery** — region-primitive **L7**,
   release-map §8.2, and a standing lock in `CLAUDE.md`. It was disabled because
   ~25 per-layer filter passes reassigned at 30 Hz made avatars invisible at the
   transition. The working pattern is `DarknessOverlay`'s and this plan stays
   inside it: shapes on one dedicated layer, erase-blend holes, zone-data-driven.
3. ⛔ **No gameplay meaning**, region-primitive §1 verbatim. No mob sees further
   because a region is bright; none is blinded because it is dark. The one place
   this fence is genuinely thin is `isHidden()` — §8 Q4.

## 2. Decision ledger

| | Decision | Status |
|---|---|---|
| **D0** | Atmosphere is **profile properties on the existing region primitive**, not a new array and not a new file. | PROPOSAL |
| **D1** | `gloom` is a **per-shape** property (drawn on the region's own footprint, like `blend`/`scroll`); `sight` is a **per-point** property (resolved at the player, like music). §3.1 is why getting this backwards is the trap. | PROPOSAL |
| **D2** | The darkness is drawn in **world space on the region's footprint**, not as a screen-space vignette around the player. §3.2 weighs the alternative and why it loses. | PROPOSAL |
| **D3** | Gloom shapes draw in **authored order**, and a region declaring `gloom: 0` inside one declaring `gloom: 1` draws as an **erase** shape. ⭐ This is what keeps the DRAWING and `resolve()` agreeing under D0. | PROPOSAL |
| **D4** | `darkAreas` **stays**, unchanged, indefinitely if need be. This plan adds a second source of dark shapes; it does not migrate content. The retrofit is its own optional chunk (**A3**) and is a content judgement. | PROPOSAL |
| **D5** | The gloom edge uses `DarknessVisuals.EDGE_FADE`, **not** the profile's `blend`. Two different edges of two different things; see §3.2. | PROPOSAL |
| **D6** | **A1 ships hard-edged gloom polygons.** The feather (`buildBlendMask`) is A1b, triggered by the first gloom region whose edge is actually visible in play. A wholesale-dark zone's gloom edge is the border wall, which nobody ever sees. | PROPOSAL |
| **D7** | `sight` never **shrinks** a light the player earned: the local hole is `max(wire light_radius, sight)`. A region cannot take away what Lantern or Torch gives. | PROPOSAL |
| **D8** | An occluder is authored by the prop **DEFINITION** (`occludesSight`), not by the placement — the `crossesPaths` idiom, not the `blocksMovement` one. §3.5 argues why this one goes the other way from paths **D4**. | PROPOSAL |
| **D9** | **B ships with LOS on the local player's own light only.** Every other light keeps its circle. §3.7 has the compositing reason and the upgrade path. | PROPOSAL, needs PO (§8 Q3) |
| **D10** | The visibility polygon is a **stencil** mask (a `Graphics` set as `mask`), never an alpha mask, and the falloff stays a texture. **L2 + L3.** | FORCED by the engine, not a preference |
| **D11** | Neither the full-screen map nor the minimap draws gloom. The map is **knowledge**, not vision (`plan-world-map.md` D16's shape); `MapFog` already owns "where have I been". | PROPOSAL |

## 3. Design

### 3.1 The two shapes of property, and the trap between them

The shipped code already distinguishes these and says so in three places
(`regionBlend`, `regionScroll` and `regionPaintSpec` all carry the same
warning):

- **Per-point** — `resolve(property, point)`: D0's outward search, *the last
  region in array order containing the point whose profile declares the
  property wins*. For anything about **where you are standing**: music,
  footsteps, and here `sight`.
- **Per-shape** — the region's **own** profile, no `resolve()` call at all. For
  anything about **how a shape is drawn**: `blend`, `scroll`, and here `gloom`.
  ⚑ The reason is already stated twice in `Regions.ts`: *"a still pond drawn
  inside a flowing river would inherit the river's current"*, and *"a region
  drawn inside another would inherit the outer one's band width and feather an
  edge its author wrote as hard."*

⭐ **`gloom` is the first property that is genuinely BOTH**, and that is the
interesting part of this design rather than a wrinkle. It is per-shape when it
is *drawn* and per-point when `isHidden()` asks *"is this spot swallowed by the
darkness"*. §3.3 shows the two answers agree for free, provided D3 holds.

### 3.2 `gloom` — the darkness that follows the polygon

```json
"Cave": { "texture": "pd196", "scale": 0.35, "blend": 1.5,
          "color": "#3a3a3a", "gloom": 1, "sight": 4 }
```

`gloom?: number | null` — 0…1, opacity of the dark shape drawn over this
region's footprint. Absent = **transparent** to gloom (D0), so the next
containing region answers; `DEFAULT_PROFILE.gloom = 0`, which is every zone and
every profile shipped today, so **the feature costs exactly zero until it is
authored** — the same bar `blend` and `scroll` were held to.

`DarknessOverlay.loadZone` gains a second source beside `zone.darkAreas`: walk
`Regions.loadedRegions()` in authored order and, for each region whose own
profile declares `gloom > 0`, add
`new Graphics().poly(points).fill({color: 0x000000, alpha: gloom})` to the same
layer, before the light holes. Nothing else about the overlay changes: same
layer, same `AlphaFilter`, same erase-blend holes on top, same exemption from
the day-cycle filter set.

**Why world-space and not a screen-space vignette (D2).** A vignette centred on
the player is the cheaper reading of *"global and not placed in the level"* —
one sprite, no geometry, no polygon at all. It loses on three counts:

- **You could not see a dark place from outside it.** The overworld's three dark
  chains are pockets in a lit world; walking up to a cave mouth and seeing black
  inside it is what makes it read as a cave. A vignette only exists once you are
  already in.
- **`isHidden()` and every light hole already work in world space.** A vignette
  is a second, parallel darkness with its own rules — and other players' lights
  could not punch through it, because their holes are world-space sprites.
- **It answers a different question anyway.** *"How far can I see"* is `sight`
  (§3.4), and that is a property of the player, expressed as the radius of the
  hole they already have. The vignette and the region fill are not two designs
  for one feature; they are the two halves, and this plan builds both.

**Why `EDGE_FADE` and not `blend` (D5).** A profile's `blend` is the width of
the band where its **ground** crossfades into its neighbour — 1.5 units across
the region set, 0.3 for a road. The darkness edge is a different object with a
hard constraint the ground edge does not have: **overlapping dark shapes must
chain without a visible seam**, which is exactly why the shipped circles are
fully opaque up to the authored radius with the fade appended *outside* it, and
why the layer carries an `AlphaFilter` to flatten the overlaps. Coupling the two
would make a road's 0.3 the darkness feather of whatever the road runs through.

⚑ **The overlap guarantee is partly lost the moment two gloom values differ**,
and that is the honest cost of allowing a number instead of a flag. Two
*equal*-alpha shapes still chain flat (the filter's whole job); a `0.6` over a
`1` shows the seam. Mitigation is authoring, and the alternative — flattening
the layer to a per-pixel `max` — needs a second render target and is YAGNI until
somebody authors partial gloom. §8 Q1 asks whether partial gloom is wanted at
all; if the answer is no, this paragraph deletes itself.

### 3.3 `resolve()` and the drawing agree — but only because of D3

`isHidden(x, y)` today is *"inside an authored dark circle and reached by no
light"*, and it gates mob nameplates. With gloom it becomes:

```ts
if (!active || (gloomAt(p) <= 0 && !inAnyCircle(p, darkCircles))) { return false; }
```

⭐ **No new geometry code**: the per-point resolve *is* the containment test,
over the same polygons in the same order the renderer drew. ⚑ `resolve` returns
`Profile['gloom']`, which is `number | null` — `null` is D11's authored "nothing
here", so `gloomAt` must map it to 0 explicitly rather than lean on coercion
(**L1**).

⛔ **And this is exactly where D3 earns its place.** D0 says the *last*
declaring region wins, so an inner region authored `gloom: 0` inside an outer
`gloom: 1` is a **lit clearing in a dark forest** — a thing an author will
absolutely try. `resolve()` gets that right on its own. The **drawing** does
not: the outer polygon's black fill still covers the clearing. The fix is one
branch, using machinery already in the file:

> **Draw every gloom-*declaring* region in authored order. `gloom > 0` draws a
> black fill; `gloom === 0` draws an *erase*-blended fill.** Light holes are
> still appended after all of them, so a light in the clearing is unaffected and
> double-erase clamps exactly as the campfire glow already relies on.

That makes the render follow D0 by construction instead of by coincidence. ⚑
Note the word *declaring*: a profile that omits `gloom` draws nothing at all —
it is transparent, not a hole.

### 3.4 `sight` — the view limit, and the ramp across the boundary

`sight?: number` — world units, how far the local player sees unaided inside
this region. Resolved **per point**, per frame, at the interpolated player
position. Today that number is a constant: `MIN_SELF_LIGHT_PX = 40` px = **0.33
units**, a hole *"deliberately tiny, just covering the avatar sprite itself"*
(PO 2026-07-17). `sight` makes it authorable, and the shipped default is that
same constant, so nothing changes until a profile says otherwise.

For scale, against a **20 × 12 unit** screen: Lantern is r 4.0 (+0.5/level),
Torch r 2.5 (+0.25/level), a campfire r 7.0. So a `sight` of ~2 reads as "grope
forward", ~4 as "a dim room", and much past ~8 stops being darkness at all.

⭐ **D7 — `sight` never takes light away.** The local hole is
`max(entity.lightRadius, sight)`, which is the shape the code already has:
`Player.ts:128` is literally `Math.max(entity.lightRadius, MIN_SELF_LIGHT_PX)`
today, so the change is *what the second argument is*. Without this a region
could cancel the Lantern, and the GDD's whole light-vs-damage trade-off is that
the aura is what buys you the room. ⚑ It also means `sight` can only ever make a
region **kinder**, which is a good property for a knob nobody has tuned.

**The crossing.** A hole that snaps from 0.33 to 4 units at a polygon edge is a
pop. It wants a short ramp (~300–500 ms [PLACEHOLDER]) — and ⭐ **this is the
"remembered value" wrapper `plan-region-primitive.md` §4.3 already predicts**:

```ts
const next = resolve('sight', playerPosition);
if (next !== current) { rampTo(next); current = next; }
```

§4.3 says outright that the wrapper *"arrives with its first consumer, which is
music, and atmosphere reuses it rather than adding a third thing"*. Music is not
built and is blocked in both directions — backlog §19's ~160 MB of eagerly
decoded audio, plus a content ask nobody has started. ⭐ **So atmosphere is now
the first consumer and should build the wrapper** — small, pure, testable — for
music to reuse. `plan-region-audio.md` §3.5's music tracker folds into it, and
that doc should be told.

⚑ `PrerenderEvent.trigger(this.timeDelta)` already carries the frame delta
(`Game.ts:471`); `DarknessOverlay.update()` currently ignores it. The ramp needs
it, and the `paused` guard above that line is load-bearing for the reason
`advanceSurfaceScroll` documents — a ramp advanced across a pause jumps (**L8**).

### 3.5 B1 — the occluder set

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
   ⚑ **`Paths.ts` deliberately drops `blocksMovement` from the drawn path and a
   test pins that** (`Paths.test.ts:53`). Do **not** relax that pin — the
   occluder set is a **second derivation from `PathDefinition`**, beside
   `toPaths()`, and not a change to what gets drawn (**L6**).
3. **The zone border** — four segments from `bounds` at `origin`. Free, and
   without them a light at the wall spills into the void.

**D8 — `occludesSight` is a prop-DEFINITION field.** `plan-world-paths.md`
**D4** put `blocksMovement` on the *placement* and `plan-underworld.md` U3b
followed it for `anchor`, so the burden is on going the other way. It is
discharged: those two are about **where a thing is used** (this river is
fordable here; this door leads there), whereas *"can you see through a boulder"*
is about **what the thing is** — a material fact, the same category as
`crossesPaths` on a bridge, which is a definition field for exactly this reason.
⚑ And its **absence** is what matters most: `occludesSight` defaults false, so a
zone with no authored occluders builds an empty set and B is inert, exactly as
`gloom` defaults 0.

⚑ **The collider is not the silhouette.** `body.collisionFactor` shrinks the
collider (a tree's trunk is 0.714 of its crown); an occluder should use the
**visual** body, because what you cannot see past is the thing you can see.
Whether a tree occludes **at all** is §8 Q2 — a canopy is above eye height in a
top-down world, and shadowing every trunk in a forest may read as noise.

**Cost, counted rather than feared.** `world.json` is 772 props over 144 × 72 =
10 368 u² → **0.074 props/u²**. The sweep set is what lies inside the light
radius, not the screen: a Lantern at r 4 covers ~50 u² ≈ **4 props ≈ 16
corners**; a campfire at r 7 covers ~154 u² ≈ 11 props ≈ 45 corners — and
occluders are a subset of those. This is not a scale problem, and B1 should ship
the naive filter (linear scan, squared distances, the `inAnyCircle` idiom)
rather than a spatial index.

### 3.6 B2 — the visibility polygon

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

### 3.7 B3 — drawing it, and the two engine facts that pick the design

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
*N* is the same code in a loop. §8 Q3 is the PO's call on whether an ally's torch
shining through a wall beside your correctly shadowed one is worse than no
shadows at all.

### 3.8 What this plan does not touch

- **`darkAreas`** (D4). Still parsed, still validated, still drawn. A3 is an
  optional content retrofit, deletable without touching a line of A1/A2.
- **The server.** Not one byte. No wire field, no Go change, no `cp-defs`.
- **The map.** `MapTerrain` does not draw darkness today and must not start
  (D11). ⚑ Stated here so nobody "fixes" the asymmetry: region-primitive §4.7's
  map-parity rule is about the **ground**, which the map bakes; vision is not a
  drawing of the world.
- **The day/night cycle** (§1.2 fence 2).
- **Mob AI, targeting, aura selection** (§1.2 fence 1).

## 4. Schema impact

| | A1 · A1b · A2 · A3 | B1 | B2 · B3 |
|---|---|---|---|
| DB | **NONE** | **NONE** | **NONE** |
| Wire | **NONE** | **NONE** | **NONE** |
| conf | **NONE** | **NONE** | **NONE** |
| Zone format | **NONE** | **NONE** | **NONE** |
| Content | **NONE** (`profiles.json` is client-side, D12) | **one prop-definition field**, `occludesSight`, absent-safe | **NONE** |

⭐ **The three zone-format writers (region-primitive L1/L3) are not involved
anywhere in this plan**, because no zone file grows a key. That is the direct
payoff of D12 having put the profile table in the client. ⚑ `occludesSight` is a
**prop definition** field (`api/props/*.json`), which is loader-side rather than
zone-format — it does not go near `ZoneModel`, `aura-convert.js` or the
completeness pin. It does need the Go `PropDefinition` struct to accept it
(`DisallowUnknownFields` hard-fails an unknown key at boot), which is one field
and one test, and `cp-defs` on the way to a build.

## 5. Chunks

| Chunk | Content | Verify |
|---|---|---|
| **A1** | `gloom` on `Profile` + `DEFAULT_PROFILE` + `buildProfiles` · `regionGloom()` beside `regionBlend` · gloom shapes in `DarknessOverlay.loadZone` in authored order with D3's erase branch · `isHidden()` through the resolve · **hard edges** (D6) | vitest on the parse, D3's ordering and `isHidden` · in-game: author `gloom` on the underworld's `Mountains` region, watch the room go dark, walk out through a passage |
| **A1b** *(triggered, not scheduled)* | Feathered gloom edges via `buildBlendMask`'s silhouette callback. ⚑ Needs a `Renderer` in `DarknessOverlay.setup`, which it does not take today. **Trigger: the first gloom region whose edge is visible in play.** | in-game only |
| **A2** | `sight` + the ramp + the remembered-value wrapper (`plan-region-audio.md` inherits it) · `max(wire, sight)` (D7) · the frame delta into `update()` | vitest on the wrapper and the max rule · in-game: cross the boundary, Lantern on and off |
| **A3** *(optional, PO call)* | **Content**: re-author `world.json`'s 35 `darkAreas` as 2–3 gloom regions. ⚑ A content judgement — *where the dark places actually are* — not a transform derivable from circle positions. `plan-world-paths.md` C4's shape exactly. | in-game, plus a before/after screenshot pair |
| **B1** | `Occluders.ts` — pure segment derivation from props (+ `occludesSight`), blocking paths and the border. No rendering. | vitest: it is 100 % testable and should be 100 % tested · a count assertion against the real `world.json` |
| **B2** | The visibility polygon. Pure. | vitest incl. every §3.6 edge case · **mutation-verified**: the no-occluder case must return today's circle |
| **B3** | The stencil mask on the local player's hole (D9/D10) · the interpolated-position pin | in-game: stand behind a wall inside a gloom region · frame time on the mobile ceiling |

**A1 → A2 → B1 → B2 → B3**, each independently shippable. ⭐ **A1 is inert until
a profile authors `gloom`**, so it can land at any time without touching how the
world looks today.

## 6. Test strategy

- **The pure half is large and should carry the weight.** `buildProfiles`
  parsing, `regionGloom`, D3's ordering, `isHidden`'s null handling, the ramp
  wrapper, all of B1 and all of B2 are DOM-free and vitest-reachable. The
  existing `Regions.test.ts` takes its profile table explicitly *"so the
  resolution rule can be pinned without depending on which profiles are authored
  today"* — every new test follows that.
- ⛔ **The drawing half is untestable and the ledger must say so**, the posture
  `plan-world-paths.md` C3 and `plan-underworld.md` U4b both took. A green suite
  says nothing about whether the screen went dark.
- **Mutation-verify three things specifically**, because each fails silently:
  ① drop D3's erase branch → a lit clearing that draws black · ② make `sight`
  overwrite instead of `max` → the Lantern stops working inside a `sight` region
  and nothing errors · ③ return the raw circle from B2 when occluders exist →
  looks exactly like B3 not being wired up.
- **The `[PLACEHOLDER]` values pin nothing.** `profiles.json`'s own header says
  every value there is *"data, not code, and no test pins any of it"* — keep it
  that way for `gloom` and `sight`.
- **Test in a PLACED zone.** See L5.

## 7. Landmines

- **L1 — `resolve('gloom')` can return `null`.** D11's authored "nothing here"
  is a legal value for every profile property. `null > 0` is `false` and
  `null <= 0` is `true` in JS, so the naive comparison happens to work — which is
  worse than it failing, because the next property added will not be so lucky.
  Map it to 0 explicitly.
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
  mechanic arriving through the back door. §8 Q4.
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
- **L8 — the `paused` guard.** A ramp, or a per-frame polygon rebuild, advanced
  across a pause jumps by the whole pause — the trap `advanceSurfaceScroll`
  already documents at `Game.ts:467`.
- **L9 — partial gloom values do not chain flat.** §3.2. Equal values do; the
  `AlphaFilter` exists for that. Deletes itself if §8 Q1 says gloom is a flag.
- **L10 — a fresh `RenderTexture`'s contents are UNDEFINED, not blank**
  (region-primitive L13). Only bites A1b, and only if it builds one.
- **L11 — a bounds-covering gloom polygon can drift from the bounds.** A zone
  resized in Tiled leaves its "the whole zone is dark" polygon at the old size,
  and the symptom is a lit strip along one edge. ⚑ This is the argument for a
  zone-level atmosphere default instead; §8 Q6 carries it with its trigger. It
  is deliberately **not** built now, because it would be the first zone-format
  field in this plan and would drag all three writers in.

## 8. Open questions for the PO

1. **Is `gloom` a number or a flag?** A number buys dim-but-not-black regions (a
   mist, an overcast moor); a flag deletes L9 and §3.2's last paragraph and keeps
   the shipped chaining guarantee absolute. My lean: **keep the number**, author
   only 0 and 1 until something wants otherwise.
2. **Do trees occlude?** A canopy is above eye height in a top-down world, and a
   forest of trunk shadows may read as noise rather than as sight lines. My lean:
   **rocks, boulders, houses and gate walls yes; trees no** — `occludesSight`
   authored on four of the six shipped prop definitions.
3. **LOS on one light or on all of them?** (D9) One is a single stencil and the
   only hole whose shape you read. All of them is correct, but is *N* stencils
   and makes every campfire and every ally a per-frame sweep. My lean: **ship
   one, look at it, then decide** — the widening is a loop.
4. **Should LOS shape `isHidden()`?** (L4) If yes, a mob behind a wall loses its
   nameplate — consistent, and arguably the point. If no, plates leak the
   position of things you cannot see. ⚑ Either way this is the only place the
   feature touches something a player can play around, so it wants a ruling
   rather than a default.
5. **Is A3 wanted, and when?** Re-authoring `world.json`'s 35 circles is pure
   upside for authoring and pure churn for a world the PO is currently judging in
   front of the game. It can wait indefinitely (D4).
6. **A zone-level atmosphere default?** (L11) Instead of authoring a polygon over
   the whole cave, `zone.profile: "Cave"` as the fallback `resolve()` consults
   before `DEFAULT_PROFILE`. ⛔ Not proposed for v1 — it is a zone-format field,
   three writers, the completeness pin, and one polygon is not yet boilerplate.
   **Named trigger: the third zone that wants a wholesale atmosphere**, or the
   first time L11's drift actually happens.
7. **Does a lit region exist as content?** D3 makes a `gloom: 0` clearing inside
   a dark region work, and the underworld's *"deliberately not wholesale dark"*
   compromise suggests somebody wants exactly that. Worth confirming, because it
   is the one design property that costs a branch to keep.

## 9. Cross-references

- `docs/plan-region-primitive.md` — the primitive, `resolve()`, **D0** (the
  resolution rule), **D11** (totality), **D12** (the client-side table), **§4.3**
  (the atmosphere row and the remembered-value wrapper), **§4.4** + **§11** (the
  `darkAreas` fold-in question this answers), **L7** (never the day/night
  filters), **L12/L13** (masks and render textures).
- `docs/plan-world-paths.md` — the path primitive, **D4** (per-placement
  blocking, the ruling D8 goes the other way from and says why), and C3's
  cheap-stencil-mask finding.
- `docs/plan-underworld.md` — **§6** (what the underworld gets for free, and the
  circles-only limitation), **§7.1 item 1** (cave walls as blocking paths),
  **U4a** (the zone-origin bug L5 restates), **U4b** (the untestable-drawing
  posture), **U5** (the content pass this unblocks).
- `docs/archive/plan-atmosphere-recovery.md` **§3.3** — where `darkAreas`,
  `light_aura`, `light_radius` and `DarknessOverlay` shipped, and the *"polygons
  only if content proves the need"* clause §1.1 answers.
- `docs/plan-region-audio.md` **§3.5** — the music tracker that becomes the
  second consumer of A2's wrapper.
- `docs/plan-release-map.md` **§8.2** — the atmosphere/lighting bullet, which
  already prescribes exactly this approach and forbids the filter one.
- `docs/gdd.md` — Darkness & Light (purely visual; Lantern and Torch), §184/§205
  (aura LoS cut 2026-07-10).
- `docs/backlog.md` §19 — the audio blocker that is why atmosphere, not music, is
  the wrapper's first consumer.

## 10. Chunk ledgers

*(Nothing built.)*
