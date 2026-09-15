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
> ⚑ **REVIEWED 2026-09-12 against HEAD + the uncommitted zone-polygons tree.**
> Every code claim in here was re-verified; the ones that moved are marked
> **[REVIEW]** at the point of change, and the review added **L12–L15** plus
> **Q7–Q8**. ⭐ **The two that would have cost a session each are L12 (`active`
> is a five-way gate, so a gloom-only zone renders NOTHING and errors nowhere)
> and L13 (`DarknessOverlay.loadZone` runs 24 lines BEFORE `Regions.loadRegions`,
> so the shape list inside it answers for the PREVIOUS zone).** ⚑ Line
> numbers below are pinned to `8d9dc4b9` plus the working tree of 2026-09-12;
> re-verify before quoting one.
>
> ⭐ **REDESIGNED 2026-09-12 (PO ruling, mid-review): atmosphere is its OWN
> authored shape, not a property of a region.** `zone.atmospheres` — authored
> **areas**, each naming a profile — on **their own** Tiled object layer under a
> new class `AuraAtmosphere`. The PO also asked for **animated fog** and for
> reuse over reinvention; §3.2 is the answer to both, and it is larger than it
> looks. ⛔ **The reversed ruling is D0** and the superseded version is kept in
> the ledger with its reason. ⚑ **D5 and D6 fall with it** — the gloom edge is
> now the profile's own `blend`, so the feathering chunk **A1b is deleted rather
> than deferred**.
>
> ⛔ **ATMOSPHERE IS NOT `AuraPolygon`, AND THE WORD "POLYGON" IS THE TRAP**
> (**D15**, PO-corrected 2026-09-12). *Polygon* here is the **shape** — a closed
> ring of authored points — and **not** the zone-polygons concept, which is the
> **wall/mass** primitive that BLOCKS and paints terrain. An atmosphere area
> **never blocks**, never takes an outline, never enters `phy.Space`, and draws
> **on top of everything** rather than into the ground. Four arrays share a
> shape and share nothing else. Wherever this doc says "polygon" of an
> atmosphere it means the geometry, never the sibling.
>
> ⛔ **Schema, re-priced honestly by that ruling: DB NONE · wire NONE · conf NONE
> · content NONE, but the ZONE FORMAT grows one array** (`atmospheres`,
> absent-safe), which drags in the whole whitelist tax the old design had dodged:
> `zone.go` · `aura-convert.js` · `ZoneModel.getZoneAsJSON` (**L1**, the one that
> silently deletes) · `aura-world-format.js` (U4b's fourth writer) · the
> completeness pin going red by design · one Tiled palette class. ⚑ **That is
> the headline the plan LOST and it should not be glossed**: the old design's
> "schema NONE, tuning is an HMR save" came from region-primitive **D12** having
> put the profile table in the client.
>
> ⭐ **Most of that payoff is kept on purpose (D13): only the SHAPE goes in the
> zone file; every VALUE stays in `profiles.json`.** So drawing a new fog bank
> needs a server restart ([[project-zone-edit-half-live]]), and *tuning* gloom,
> fog art, softness and drift speed stays a client-side file save with no boot
> in it — the same split regions, paths and polygons already use. Only **B1**
> touches content, and only by one optional prop-definition field.

## 1. What this is

Two features that share one lookup, and they are separable in that order:

- **A — atmosphere.** A zone gains `atmospheres`: authored polygons that
  describe the **air** rather than the ground, naming a profile that says how
  dark this place is (`gloom`), how far you see inside it (`sight`), and what
  the murk actually looks like — which is the shipped `texture` / `color` /
  `scale` / `blend` / `scroll` vocabulary doing fog for free. One authored
  polygon replaces a hand-placed chain of dark circles.
  ⭐ **It is its own shape and not a region property (D0, PO 2026-09-12),
  because the air and the ground are not the same boundary**: the lit pocket at
  a cave mouth has the *same floor* as the dark part of the cave, and a lit
  clearing in a dark forest is still forest underfoot. Welding the two forces
  one polygon to answer both questions — and §3.3's D3 erase branch is the
  plan's own evidence, invented purely to work around a coupling that did not
  need to exist.
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
  ⚑ **[REVIEW]** True at `8d9dc4b9`. In the uncommitted P2–P4 tree that circle
  is already **deleted**, the room's region profile has moved `Mountains` →
  `Swamp`, and **two `City` polygons** are authored — scratch content for the
  polygon primitive, not a ruling. Re-read the file before quoting it, and do
  not let A1's verify step name a profile a Tiled save can rename.
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
| **D0** | ⭐ **Atmosphere is its OWN authored shape: `zone.atmospheres`, a fourth array of authored AREAS naming a profile** — Tiled class `AuraAtmosphere` on its **own** object layer (see **D16**). | **RULED, PO 2026-09-12** |
| ~~**D0′**~~ | ~~Atmosphere is **profile properties on the existing region primitive**, not a new array and not a new file.~~ ⛔ **SUPERSEDED 2026-09-12.** Kept because the reason matters: a region is *the material underfoot* — footsteps, music, ground texture, and later quest identity — so a fake region authored to carry a lit clearing silently overrides all of those for anyone standing in it. The air and the ground are different boundaries. Same test `world.Path`'s doc comment applied to split paths from regions and zone-polygons **D1** applied to split polygons from paths: *"one array meaning two things would make both harder."* Third time, same answer. | SUPERSEDED |
| **D1** | `gloom` is a **per-shape** property (drawn on the atmosphere shape's own footprint, like `blend`/`scroll`); `sight` is a **per-point** property (resolved at the player, like music). §3.1 is why getting this backwards is the trap. ⚑ Both halves now read the **`atmospheres`** array, so the two answers come from one source instead of two. | PROPOSAL |
| **D2** | The darkness is drawn in **world space on the shape's footprint**, not as a screen-space vignette around the player. §3.2 weighs the alternative and why it loses. | PROPOSAL |
| **D3** ✅ **CLOSED 2026-09-16 by A4 (§10) — `darkness: 0` now DECLARES zero and the erase is `AuraClearing`, its own class. Everything below describes the superseded design.** ⛔ **Was REOPENED 2026-09-16 (PO), §11 — `gloom: 0` shipped as `darkness: 0`/`haze: 0` and the PO rejected the magic value on sight:** *"0 darkness should be LEGAL, because there might be atmospheres that want no darkness at all. Maybe more class separation is in order?"* The replacement is **A4**, shipped the same day: a clearing is its own Tiled CLASS and `darkness: 0` simply declares zero. ⛔ The cell to the right is the SUPERSEDED rule, kept only because the reason matters. | Atmosphere shapes draw in **authored order**, and one declaring `gloom: 0` inside one declaring `gloom: 1` draws as an **erase** shape. ⭐ This is what keeps the DRAWING and `resolve()` agreeing under D0. ⚑ **D0's reversal makes it honest**: the lit clearing is now a real atmosphere shape, not a counterfeit region that also silently rewrote the footsteps. | PROPOSAL |
| **D4** | `darkAreas` **stays for now** — this plan adds a second source of dark shapes and does not migrate content. ⚑ **Amended 2026-09-12 (PO): it is MARKED FOR DELETION**, because a circle is now strictly a degenerate atmosphere shape and two sources of dark geometry is the duplication D0's reversal exists to avoid. Registered in `docs/cleanup.md`; the trigger is **A3**, the content retrofit, which stays a content judgement. | PROPOSAL + marked |
| ~~**D5**~~ | ~~The gloom edge uses `DarknessVisuals.EDGE_FADE`, **not** the profile's `blend`.~~ ⛔ **REVERSED 2026-09-12 by D0.** The argument was that a road's `blend: 0.3` must not become the darkness feather of whatever the road runs through — which was only ever true while atmosphere rode a **ground** profile. An atmosphere shape names an **atmosphere** profile, so its `blend` is the fog's own softness and nothing else's. ⚑ `darkAreas` circles keep `EDGE_FADE`; the two edges coexist because they belong to two primitives. | REVERSED |
| ~~**D6**~~ | ~~**A1 ships hard-edged gloom polygons**; the feather is A1b, triggered.~~ ⛔ **DELETED 2026-09-12.** `paintSurface` already feathers any surface it draws, via `buildBlendMask` and the profile's `blend`. **A1b was a whole deferred chunk (with its own `Renderer`-plumbing problem) that reuse dissolves.** | DELETED |
| **D7** | `sight` never **shrinks** a light the player earned: the local hole is `max(wire light_radius, sight)`. An atmosphere cannot take away what Lantern or Torch gives. | PROPOSAL |
| **D8** | An occluder is authored by the prop **DEFINITION** (`occludesSight`), not by the placement — the `crossesPaths` idiom, not the `blocksMovement` one. §3.5 argues why this one goes the other way from paths **D4**. | PROPOSAL |
| **D9** | **B ships with LOS on the local player's own light only.** Every other light keeps its circle. §3.7 has the compositing reason and the upgrade path. | PROPOSAL, needs PO (§8 Q3) |
| **D10** | The visibility polygon is a **stencil** mask (a `Graphics` set as `mask`), never an alpha mask, and the falloff stays a texture. **L2 + L3.** | FORCED by the engine, not a preference |
| **D11** | Neither the full-screen map nor the minimap draws gloom. The map is **knowledge**, not vision (`plan-world-map.md` D16's shape); `MapFog` already owns "where have I been". ⚑ **This is the one place an atmosphere shape must NOT follow its three siblings** — regions, paths and polygons all bake into the map by the parity rule (region-primitive §4.7), and atmosphere deliberately does not. Say so at the call site or someone will "fix" the asymmetry. | PROPOSAL |
| **D12** | ⭐ **Animated fog is the SHIPPED `scroll` property, and fog art is the shipped `texture` / `color` / `scale`.** No new vocabulary at all: an atmosphere shape is painted by `paintSurface`, which already does texture-or-colour fallback (D14), the feathered edge, the drift and the cheap stencil mask. Flat black darkness is simply a profile that authors a colour and no texture. | **RULED, PO 2026-09-12** (reuse, not reinvention) |
| **D13** | **Only the SHAPE goes in the zone file; every VALUE stays in `profiles.json`.** The same split regions, paths and polygons already use — and it is what keeps *tuning* fog free of the boot-time seam even though *drawing* one is not. | PROPOSAL |
| **D14** | **Four arrays of authored areas is accepted** (`regions` · `paths` · `polygons` · `atmospheres`), PO-ruled 2026-09-12, on zone-polygons **D5**'s free finding: `zoneToModel` synthesizes the layer list on every load and the zone file stores arrays rather than layers, so **merging them later is a two-line change with zero content migration**. The door stays open; nothing is built to hold it open. | **RULED, PO 2026-09-12** |
| **D15** | ⛔ **An atmosphere area NEVER BLOCKS and is not a sibling of `AuraPolygon`.** No `blocksMovement`, no `outlineProfile` / `outlineWidth`, nothing reaches `phy.Space`, and the Go side is parse-validate-**ignore**. ⭐ **The two arrays share a SHAPE and nothing else**: a polygon is a wall you walk into, an atmosphere is air you walk through. §3.8 is the z-order that follows from it. | **RULED, PO 2026-09-12** |
| **D16** | ⭐ **Atmosphere gets its OWN Tiled object layer**, `atmospheres` — it does **not** ride the `paths` layer by class the way `AuraPolygon` does. ⚑ **This NARROWS zone-polygons D5 rather than contradicting it**: D5 refused a new layer for shapes that sit *beside* paths, and an atmosphere area *covers* them. §3.8 has the two reasons and the precedent, which is decisive — **`darkAreas`, the primitive atmosphere replaces, already has its own layer today.** | PROPOSAL |

## 3. Design

### 3.1 The two shapes of property, and the trap between them

The shipped code already distinguishes these and says so in three places
(`regionBlend`, `regionScroll` and `regionPaintSpec` all carry the same
warning):

- **Per-point** — `resolve(property, point)`: region-primitive D0's search,
  *the last shape in array order containing the point whose profile declares the
  property wins*. For anything about **where you are standing**: music,
  footsteps, and here `sight`.
  ⭐ **[REUSE] `resolveIn` is already parameterized on the shape array**
  (`resolveIn(property, point, inShapes, profiles)`), so answering `sight` over
  `atmospheres` instead of `regions` is **a call, not a lookup engine**. The
  point-in-polygon walk, the last-declaring-wins order and the totality
  guarantee are shipped and tested; atmosphere passes a different array to them.
- **Per-shape** — the shape's **own** profile, no `resolve()` call at all. For
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
"CaveAir": { "color": "#000000", "blend": 0, "gloom": 1, "sight": 2 }
```

⚑ **An ATMOSPHERE profile, not a ground one.** It lives in the same
`profiles.json` table as `Cave`, `Swamp` and `Road` — but nothing paints ground
from it, and nothing resolves a footstep against it. **L15** is the residue of
one table serving two vocabularies, and the file's own header is where that
grouping has to be said out loud.

`gloom?: number | null` — 0…1, the **opacity of the whole painted atmosphere
surface**. Absent = **transparent** to gloom, so the next containing shape
answers; `DEFAULT_PROFILE.gloom = 0`, so **the feature costs exactly zero until
it is authored** — the same bar `blend` and `scroll` were held to.

⭐ **[REUSE — the load-bearing part of the 2026-09-12 redesign] An atmosphere
shape is painted by `paintSurface`, into the darkness layer.** The function at
`RegionPaint.ts:427` takes its **container as its first argument**, so pointing
it at `DarknessOverlay`'s layer instead of the terrain layer is free — and
everything the fog needs comes with it, already shipped, already tested:

| The fog wants | What it actually is | Status |
|---|---|---|
| To be a drifting cloud, not a flat wash | `scroll` — `scrollingSurface` + `advanceSurfaceScroll` | shipped, world-paths C3 |
| To look like murk rather than a black hole | `texture` + `scale`, with `color` as D14's fallback | shipped, region C4 |
| A soft edge instead of a cut-out | `blend` → `buildBlendMask` | shipped, region C5 — ⭐ **this is what deletes A1b** |
| Not to cost a filter pass | the cheap stencil path `paintSurface` already picks | shipped, world-paths C3 |

So `"Fog": {"texture": "fog01", "scale": 0.6, "blend": 2, "scroll": {"x": 0.4,
"y": 0.1}, "gloom": 0.7, "sight": 5}` is a drifting, soft-edged fog bank, and
`"Cave": {"color": "#000000", "blend": 0, "gloom": 1, "sight": 2}` is flat
pitch-black — **one code path, no branch, and no new vocabulary for either.**

`DarknessOverlay.loadZone` therefore gains a second source beside
`zone.darkAreas`: walk `Atmospheres.loaded()` in authored order and, for each
shape whose profile declares `gloom`, `paintSurface` it into a per-shape
`Container` carrying `alpha = gloom` — wrapped, because the paint may be several
children (a scroller plus its mask) and the opacity belongs to the group. Those
containers go in before the light holes. The rest of the overlay is unchanged:
same layer, same `AlphaFilter` flattening the overlaps, same erase-blend holes
on top, same exemption from the day-cycle filter set.

⚑ **`gloom: 0` is the one case that cannot be a paint** — it is D3's erase
stencil, which has no texture and no drift by definition. That is a branch on
the *value*, not a second drawing system.

⛔ **[REVIEW] Two things in `loadZone` are NOT unchanged, and both fail
silently.** The original wording here said "nothing else changes"; that was
wrong, and wrong in the direction where A1 presents as simply unwired:

- **`active` is a FIVE-way gate, not a flag** (**L12**). `active =
  darkAreas.length > 0` gates `layer.visible`, the static campfire-glow block,
  `setLightRadius`, `update` **and** `isHidden`. A zone that authors `gloom` and
  **no** `darkAreas` — which is the underworld, the whole point of the feature —
  computes `active = false`, so it draws no gloom, places no campfire glow, and
  never opens the player's own hole. It must become *"any dark area **or** any
  loaded region whose profile declares `gloom > 0`"*, and the gloom scan has to
  run **before** the `if (active)` campfire block that depends on it.
- **The gloom scan reads a list that is not loaded yet** (**L13**).
  `DarknessOverlay.loadZone` is called from `Game.renderZone` **24 lines above**
  `Regions.loadRegions` (and, after A0, `Atmospheres.load`), so `Atmospheres.loaded()` inside it answers for the
  *previous* zone, or for nothing at all on first load. ⭐ The fix is to **move
  the `DarknessOverlay.loadZone` call below the three `load*` calls**, not to
  re-derive regions inside the overlay: a second `toRegions` would be a fourth
  reader of the same authored points and could disagree about `origin`, which is
  **L5** arriving through a different door.

⚑ **[REVIEW] Draw order across the two sources is a decision now, not an
accident.** D3's `gloom: 0` erase shape is appended to the same layer as the
`darkAreas` sprites, so an erase drawn after them punches a hole in an authored
**circle** too, not only in an outer gloom polygon. That is probably what an
author means, but it has to be written down: **darkAreas → gloom shapes (in
authored order, erase branch included) → light holes**, and a `gloom: 0`
clearing laid over a shipped dark circle clears it.

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

**Why the edge is `blend` after all (D5, REVERSED 2026-09-12).** The original
ruling sent the gloom edge to `DarknessVisuals.EDGE_FADE` and kept it off the
profile's `blend`, on the grounds that `blend` is the width of the band where a
**ground** crossfades into its neighbour — 1.5 units across the region set, 0.3
for a road — and coupling them would make a road's 0.3 the darkness feather of
whatever the road ran through. ⭐ **That argument dies with D0.** An atmosphere
shape names an **atmosphere** profile; its `blend` is the softness of the fog's
own edge and is not shared with any road. The feather is then `buildBlendMask`,
already built, already rasterised, already correct — and **A1b, a whole deferred
chunk, disappears.**

⚑ **What survives the reversal is the chaining constraint**, and it is why
`darkAreas` keeps `EDGE_FADE`: **overlapping dark shapes must chain without a
visible seam**, which is why the shipped circles are fully opaque to the
authored radius with the fade appended *outside* it, and why the layer carries
an `AlphaFilter` to flatten overlaps. Two primitives, two edges, one flattening
filter over both.

⚑ **The overlap guarantee is partly lost the moment two gloom values differ**,
and that is the honest cost of allowing a number instead of a flag. Two
*equal*-alpha shapes still chain flat (the filter's whole job); a `0.6` over a
`1` shows the seam. Mitigation is authoring, and the alternative — flattening
the layer to a per-pixel `max` — needs a second render target and is YAGNI until
somebody authors partial gloom. §8 Q1 asks whether partial gloom is wanted at
all; if the answer is no, this paragraph deletes itself.

### 3.3 `resolve()` and the drawing agree — but only because of D3

`isHidden(x, y)` today is *"inside an authored dark circle and reached by no
light"*, and it gates mob nameplates. With gloom — resolved over the
`atmospheres` array, per D1 — it becomes:

```ts
if (!active || (gloomAt(p) <= 0 && !inAnyCircle(p, darkCircles))) { return false; }
```

⭐ **No new geometry code**: the per-point resolve *is* the containment test,
over the same polygons in the same order the renderer drew. ⚑ `resolve` returns
`Profile['gloom']`, which is `number | null` — `null` is D11's authored "nothing
here", so `gloomAt` must map it to 0 explicitly rather than lean on coercion
(**L1**).

⛔ **And this is exactly where D3 earns its place.** The resolution rule says the
*last* declaring shape wins, so an inner atmosphere authored `gloom: 0` inside an
outer `gloom: 1` is a **lit clearing in a dark forest** — a thing an author will
absolutely try. `resolve()` gets that right on its own. The **drawing** does
not: the outer polygon's fill still covers the clearing. The fix is one branch,
using machinery already in the file:

> **Draw every gloom-*declaring* atmosphere shape in authored order. `gloom > 0`
> paints the surface; `gloom === 0` draws an *erase*-blended fill.** Light holes are
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
   **B1 reads both rather than waiting for the ruling** (§8 Q8). The geometry is
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

### 3.8 Never blocking, and drawn on top of everything (D15, D16)

⭐ **The z-order the PO described is the one the engine already has, verified.**
`Game.ts` adds `layers.darkness` to the camera group with the comment *"Darkness
overlay above every entity"* — **after** terrain, props, region/path/polygon
paint, mobs, characters, resources and even `layers.flyers` (which is itself
lifted above trees deliberately, and then explicitly kept *below* darkness,
because *"a flyer crossing a dark region is still in it"*). An atmosphere area
painted into that layer is therefore on top of every wall polygon, every path
and every entity, for free and by construction.

⚑ **One thing is deliberately ABOVE the darkness and it is the reason `isHidden`
exists**: nameplates, chat messages and floating combat numbers are added after
it. They are UI drawn in world space, so z-order cannot dim them and never will
— which is exactly why hiding a plate in the dark is a **function call**
(`isHidden`, **L4**, §8 Q4) and not a layering question. Anybody "fixing" that
asymmetry would silently un-gate every nameplate in the game.

**Why its own Tiled layer (D16).** Zone-polygons **D5** ruled *no new layer* and
put `AuraPolygon` on the `paths` layer under a class, against the PO's *"too
many layers in Tiled will make me a little crazy"*. That reasoning holds for
polygons and breaks for atmosphere, on two counts:

1. ⭐ **The precedent runs the other way.** `aura-convert.js`'s `LAYERS` array is
   `['terrain', 'props', 'spawns', 'campfires', 'darkAreas', 'regions', 'paths',
   'anchors']` — **`darkAreas` already owns a dedicated layer** with its own
   class `AuraDarkArea`. Putting atmosphere on a shared layer would give the
   *successor* worse authoring than the primitive it retires, and A3 eventually
   frees the slot besides, so the layer count ends level.
2. ⭐ **Overlapping shapes need a visibility toggle, and a class cannot give
   one.** A polygon sits *beside* a path; an atmosphere area *covers* the walls
   and roads it darkens. On a shared layer there is no way to hide the fog to
   select the wall underneath — Tiled toggles visibility per **layer**, never
   per class. That cost does not exist for `AuraPolygon` and is unavoidable for
   atmosphere.

⚑ **It is nearly free**, by D5's own finding: `LAYERS` is a flat array, the
layer list is synthesized on every load, and the zone file stores arrays rather
than layers. ⛔ It does **not** buy back L2b: an object whose class is
unrecognised still lands in no array and vanishes on save, so the validator leg
is owed either way.

### 3.9 What this plan does not touch

- **`darkAreas`** (D4). Still parsed, still validated, still drawn. A3 is an
  optional content retrofit, deletable without touching a line of A1/A2.
- ⛔ **Collision, in any form** (D15). An atmosphere area is air. It never
  reaches `phy.Space`, never takes `blocksMovement`, and the walls it hangs over
  are `zone.polygons` and blocking `paths` — a **different** primitive that this
  one only shares a shape with.
- **The server.** Not one byte. No wire field, no Go change, no `cp-defs`.
- **The map.** `MapTerrain` does not draw darkness today and must not start
  (D11). ⚑ Stated here so nobody "fixes" the asymmetry: region-primitive §4.7's
  map-parity rule is about the **ground**, which the map bakes; vision is not a
  drawing of the world.
- **The day/night cycle** (§1.2 fence 2).
- **Mob AI, targeting, aura selection** (§1.2 fence 1).

## 4. Schema impact

| | **A0** | A1 · A2 · A3 | B1 | B2 · B3 |
|---|---|---|---|---|
| DB | **NONE** | **NONE** | **NONE** | **NONE** |
| Wire | **NONE** | **NONE** | **NONE** | **NONE** |
| conf | **NONE** | **NONE** | **NONE** | **NONE** |
| Zone format | ⛔ **ONE ARRAY**, `atmospheres`, absent-safe | **NONE** | **NONE** | **NONE** |
| Content | **NONE** | **NONE** (`profiles.json` is client-side, region-primitive D12) | **one prop-definition field**, `occludesSight`, absent-safe | **NONE** |

⛔ **[2026-09-12] The whole zone-format cost is A0 and it is real.** The old
design claimed NONE across the board because atmosphere rode the client-side
profile table; D0's reversal buys the right boundary and pays the whitelist tax
for it. A0 must teach **four** writers — `zone.go` (parse + validate + ignore,
the `DarkArea`/`Region` posture verbatim: `zone.go:228` and `:250` are the two
precedents, and the decoder sets `DisallowUnknownFields` so an untaught server
refuses the boot by name), `aura-convert.js`, `ZoneModel.getZoneAsJSON`
(**L1** — the whitelist whose omission silently deletes on the first in-game
save) and `aura-world-format.js` (U4b's fourth writer, which the completeness
pin **cannot see**) — plus one `AuraAtmosphere` class in the Tiled palette.
⭐ **The saving grace is that this is now a COPY, not a design**: zone-polygons
P2 did exactly this, end to end, four writers and all, days ago.

⭐ **D13 keeps the tuning loop free even so**: no *value* moves into the zone
file, so gloom, fog art, softness and drift speed are all still
`profiles.json` edits under HMR. Only *drawing a new shape* crosses the
boot-time seam. ⚑ `occludesSight` is a **prop definition** field
(`api/props/*.json`), loader-side rather than zone-format — it does not go near
`ZoneModel`, `aura-convert.js` or the completeness pin. It does need the Go `propDefinitionDoc` struct to accept it
(`parsePropDefinition` sets `DisallowUnknownFields`, so an unknown key hard-fails
the boot by name), which is one field and one test, and `cp-defs` on the way to a
build. ⭐ **[REVIEW] The implementation precedent is `sprite`, not
`crossesPaths`** — and the distinction is the shape of the whole field.
`crossesPaths` is *read* by the server (`paths_collision.go`,
`polygons_collision.go`); `occludesSight` is read by **nobody** server-side,
exactly like `sprite`, whose own doc comment records the posture verbatim:
*"parsed here only to fail boot fast on a missing value; nothing server-side
reads it, so it does not appear on the exported `PropDefinition`."* Follow that —
declare it on the doc struct and **not** on the exported type — or the next
reader assumes physics consumes it. ⚑ `crossesPaths` stays the right precedent
for **D8's authoring question** (definition vs. placement); it is the wrong one
for the plumbing.

## 5. Chunks

| Chunk | Content | Verify |
|---|---|---|
| **A0** *(new, 2026-09-12)* | ⭐ **The `atmospheres` area primitive** — `Atmospheres.ts` beside `Polygons.ts` (`toAtmospheres` + `load` + `loaded`, origin applied, ≥3 points) · the four writers · its **own** Tiled layer + the `AuraAtmosphere` class (**D16**) · Go parse-validate-ignore. ⛔ **No `blocksMovement`, no outline, nothing in `phy.Space`** (**D15**) — which is what makes it a *smaller* copy of zone-polygons P2 than it looks, since P2–P4's collision half does not exist here. ✅ **SHIPPED 2026-09-16 `5b57d0c4`** (ledger §10). | vitest on the conversion · `verify.sh`'s completeness + placed-zone legs · a Tiled round-trip that proves the shape survives a save (**L1**) · ⚑ a leg that an atmosphere area does **not** collide |
| **A1** ✅ *(shipped `5b57d0c4`; ⚑ `gloom` became `darkness` + `haze` — §10)* | `gloom` on `Profile` + `DEFAULT_PROFILE` + `buildProfiles` · atmosphere shapes painted by **`paintSurface` into the darkness layer** in authored order, per-shape container at `alpha = gloom`, with D3's erase branch · `isHidden()` through the resolve · ⛔ **[REVIEW] the `active` gate (L12) and the `loadZone` call order (L13)** — both silent, both one line · scroller registration + teardown (**L16**, **L17**) | vitest on the parse, D3's ordering and `isHidden` · in-game: author an atmosphere over **the underworld's room**, watch it go dark, walk out through a passage. ⚑ **A PLACED zone, per L5** — and the underworld is the only one |
| **A1-fog** *(same chunk, no code)* | ⭐ The fog **look**: a profile authoring `texture` + `scroll` + `blend`. **Zero engineering** (D12) — it is an `atmosphere-profiles.json` edit plus one art asset, and it is the PO's knob. ✅ The tile landed with `5b57d0c4` (`tools/make-fog-tile.mjs`, deterministic and re-runnable); every NUMBER is still [PLACEHOLDER] | in-game only; there is nothing testable about whether murk looks like murk |
| **A2** ✅ *(shipped `5b57d0c4`)* | `sight` + the ramp + the remembered-value wrapper (`plan-region-audio.md` inherits it) · `max(wire, sight)` (D7) · the frame delta into `update()` | vitest on the wrapper and the max rule · in-game: cross the boundary, Lantern on and off |
| **A3** *(optional, PO call)* | **Content**: re-author `world.json`'s 35 `darkAreas` as 2–3 atmosphere shapes. ⚑ A content judgement — *where the dark places actually are* — not a transform derivable from circle positions. `plan-world-paths.md` C4's shape exactly. ⭐ **It is now also the trigger that retires `darkAreas`** (D4, `docs/cleanup.md`): the primitive only leaves once nothing authors it | in-game, plus a before/after screenshot pair |
| **A4** ✅ *(shipped 2026-09-16; ledger §10)* | ⭐ **`AuraClearing` — the clearing becomes a CLASS.** Reopens **D3**: `darkness: 0` stops meaning *erase* and starts meaning *declares zero* (which a pure fog bank may legitimately want), and a clearing becomes its own Tiled class on the atmospheres layer, with its own `zone.clearings` array and **no profile member** (L7). ⛔ **The seam is `inDarkness()`** — a profile-less clearing is invisible to the `resolveIn` walk, so the sim would call a lit pocket dark. Four-writer tax; comparable to zone-polygons P2 | vitest on the class routing and the `inDarkness` seam · a `verify.sh` leg, since the fourth writer is unpinnable otherwise · ⛔ **mutation-verify the seam specifically** — the picture looks right either way |
| **B1** | `Occluders.ts` — pure segment derivation from props (+ `occludesSight`), blocking paths (**incl. the `closed` wraparound**), **blocking polygons [REVIEW]** and the border. No rendering. | vitest: it is 100 % testable and should be 100 % tested · a count assertion against the real `world.json` |
| **B2** | The visibility polygon. Pure. | vitest incl. every §3.6 edge case · **mutation-verified**: the no-occluder case must return today's circle |
| **B3** | The stencil mask on the local player's hole (D9/D10) · the interpolated-position pin | in-game: stand behind a wall inside an atmosphere shape · frame time on the mobile ceiling |

**A0 → A1 → A2 → A4** ✅ all shipped 2026-09-16 (A0-A2 `5b57d0c4`; A4 ledger §10).

⭐ **Next: B1** (the occlusion half, and the answer to the PO's original
line-of-sight ask), then B2 → B3. **A3 stays a PO content call.** ⚑ **§8 Q3 is open
and B3 needs it**: is an ally's torch shining through a wall, beside your own correctly
shadowed light, worse than neither having shadows (D9)?

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
- ⛔ **L12 — [REVIEW] `active` gates FIVE things, and `darkAreas.length > 0` is
  the whole of it today.** `layer.visible`, the static campfire glows,
  `setLightRadius`, `update` and `isHidden` all sit behind it, so a gloom-only
  zone renders **nothing, with no error** — which presents exactly as "A1 was
  never wired up". ⭐ The most expensive line in the chunk, and it is one
  boolean.
- ⛔ **L13 — [REVIEW] `DarknessOverlay.loadZone` runs BEFORE the regions load.**
  `Game.renderZone` calls it 24 lines above `Regions.loadRegions`, so
  `Atmospheres.loaded()` inside it answers for the **previous** zone — empty on first
  load, the old zone's polygons at the new zone's origin on a swap. A U4a-shaped
  failure: invisible in `world`, wrong in the underworld. Move the call; do not
  re-derive.
- ⚑ **L14 — [REVIEW] a `gloom: 0` erase shape also clears authored `darkAreas`
  circles**, because both live on the same layer and the erase is appended after
  them. Deliberate and probably wanted — but say so, because D4 promises
  `darkAreas` is *"unchanged"* and this is the one place the two sources touch.
- ⚑ **L15 — a profile is shared by FOUR shapes now** (`Polygon extends Region`
  structurally, and an atmosphere will too). ⭐ **D0's reversal defuses this
  rather than fixing it**: `gloom` is read only from the `atmospheres` array, so
  a ground profile that happens to declare it does nothing, and an atmosphere
  profile that happens to declare `texture` paints fog rather than ground. ⚑ The
  residue is that **one table now holds two vocabularies with an overlap**, and
  nothing in the file says which properties an atmosphere profile is allowed —
  so `profiles.json`'s header must group them, or the first author will put
  `gloom` on `Swamp` and wait for a dark swamp that never comes.
- ⚑ **L16 — a scrolling atmosphere must be REGISTERED or it never drifts.**
  `paintSurface` hands drift back in `out.scrollers`; the frame step is
  `advanceSurfaceScroll`, which `Game.loop` calls on `this.regionScrollers`
  only. Atmosphere scrollers must join that walk — and behind the **`paused`
  guard**, or a fog bank jumps by the whole pause (**L8**, the trap
  `advanceSurfaceScroll` already documents). The failure is silent: fog that
  renders perfectly and simply never moves.
- ⚑ **L17 — `paintSurface` can allocate a RenderTexture, and the caller owns
  the teardown.** A feathered atmosphere (`blend > 0`) pushes its mask texture
  into `out.masks`, which the *terrain* path destroys on repaint.
  `DarknessOverlay.clear()` has never had to destroy anything but sprites, so a
  zone swap would leak one texture per feathered shape. ⚑ Related to **L10**:
  the cheap-stencil path deliberately does NOT push to `out.masks`, so "destroy
  everything in the layer" and "destroy `out.masks`" are both required and
  neither is sufficient.
- ⚑ **L18 — the fourth writer cannot be caught by the completeness pin.**
  `aura-world-format.js` copies map-level values onto Tiled's `TileMap` **by
  hand** (U4b's finding: a Tiled save silently dropped `origin` and the next
  boot refused). A0 adds the array; `verify.sh` must grow a leg that a real
  Tiled round-trip preserves it, because no unit test in either language can
  see that writer.

## 8. Open questions for the PO

1. **Is `gloom` a number or a flag?** A number buys dim-but-not-black regions (a
   mist, an overcast moor); a flag deletes L9 and §3.2's last paragraph and keeps
   the shipped chaining guarantee absolute. My lean: **keep the number**, author
   only 0 and 1 until something wants otherwise.
2. **Do trees occlude?** A canopy is above eye height in a top-down world, and a
   forest of trunk shadows may read as noise rather than as sight lines. My lean:
   **rocks, boulders, houses and gate walls yes; trees no** — `occludesSight`
   authored on four of the six shipped prop definitions (`Rock`, `Boulder`,
   `House`, `GateWall`; ⚑ **[REVIEW]** that count silently excludes `Tombstone`
   as well as `Tree` — a headstone is knee-high, so no, but say so).
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
   the whole cave, `zone.atmosphere: "Cave"` as the fallback `resolve()` consults
   before `DEFAULT_PROFILE`. ⚑ **Re-priced 2026-09-12**: its old objection was
   *"it is a zone-format field and three writers"* — and A0 pays that toll
   anyway now, so the cost of this one drops to a scalar beside the array it
   would sit next to. ⛔ Still not proposed for v1, but on a weaker argument:
   one polygon is not yet boilerplate. **Named trigger unchanged: the third zone
   that wants a wholesale atmosphere**, or the first time L11's drift happens.
7. ~~**Does a blocking POLYGON carry gloom?**~~ ⛔ **ANSWERED 2026-09-12 by D0's
   reversal, and this is the cleanest evidence that the reversal was right.**
   The question only existed because gloom rode the profile table, which all
   three shapes share — so a `Cave` profile used by both a floor region and a
   rock polygon had two possible meanings and no way to author either one. With
   atmosphere as its own array the question does not arise: you draw the dark
   where the dark is, over the floor and the rock alike, and the rock keeps
   being a rock.
8. ⚑ **[REVIEW] Are cave walls paths or polygons?** `CLAUDE.md` says polygons;
   `plan-underworld.md` §7.1 item 1 still says paths. B1 reads both either way,
   so this blocks no chunk — but it decides what the PO actually authors in
   Tiled, and therefore which occluder leg ever gets walked in front of the game.
9. **Does a lit region exist as content?** D3 makes a `gloom: 0` clearing inside
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
  posture), ~~**U5**~~ (⛔ dropped 2026-09-10 — level authoring is manual, so what this
  unblocks is the **PO**, in Tiled, not a chunk of ours; §7.3 there).
- `docs/archive/plan-atmosphere-recovery.md` **§3.3** — where `darkAreas`,
  `light_aura`, `light_radius` and `DarknessOverlay` shipped, and the *"polygons
  only if content proves the need"* clause §1.1 answers.
- `docs/cleanup.md` — ⭐ **where `darkAreas`' death warrant lives** (D4, PO
  2026-09-12). It stays live and shipped until **A3** retires the last authored
  circle; the register is what stops "for now" from becoming "forever".
- `docs/plan-zone-polygons.md` — ⚑ **[REVIEW] designed the day after this plan
  and shipped P1–P4 before it started**: `zone.polygons`, the `closed` flag on
  paths, and `outlineProfile` / `outlineWidth`. B1's occluder set (§3.5 items 2
  and 4), **L15** and §8 Q7–Q8 are all consequences of it.
- `docs/plan-region-audio.md` **§3.5** — the music tracker that becomes the
  second consumer of A2's wrapper.
- `docs/plan-release-map.md` **§8.2** — the atmosphere/lighting bullet, which
  already prescribes exactly this approach and forbids the filter one.
- `docs/gdd.md` — Darkness & Light (purely visual; Lantern and Torch), §184/§205
  (aura LoS cut 2026-07-10).
- `docs/backlog.md` §19 — the audio blocker that is why atmosphere, not music, is
  the wrapper's first consumer.

## 10. Chunk ledgers

### A4 — `AuraClearing`: the clearing becomes a CLASS ✅ 2026-09-16

**What shipped.** `zone.clearings` — closed areas that ERASE atmosphere instead of
painting it, riding the atmospheres layer under a new Tiled class `AuraClearing` and
carrying **no profile at all**. **D3 is CLOSED**: `darkness: 0` stops meaning *erase*
and becomes a plain DECLARATION of zero, which is legal, useful, and was unsayable
before — a pure fog profile can now state *“and it is not dark in here”* and stop a
containing dark bank being reported at that point.

⭐ **THE PO’S SECOND OBJECTION WAS THE RIGHT ONE, and the design follows it rather than
the first.** Offered a `clearing` flag on the profile, the answer was *“hm, 0 darkness
should be LEGAL… maybe more class separation is in order?”* — which rejects the flag
too, and for a better reason: a flag on the PROFILE still makes the look table carry an
OPERATION. The class carries it instead. Third application of **P1’s “the SHAPE is the
flag”**, after `closed` and `AuraPolygon`.

⛔ **THE SEAM WAS THE WHOLE RISK AND IT BEHAVED EXACTLY AS §11.3 PREDICTED.**
`inDarkness()` is a walk over atmosphere PROFILES, and a profile-less clearing is
invisible to it — so the naive build leaves the picture PERFECT (hole painted, mob lit)
while the sim hides every nameplate in the lit pocket, with nothing thrown.
`Clearings.clearsAt` closes it deliberately. **Mutation-verified ×3** (kill the seam ·
ignore the layer · drop `both` from `clearsDarkness`); all three caught.

⭐ **D17, a ruling this chunk had to make and §11 had left open: a clearing applies
AFTER every atmosphere, regardless of authoring order.** Two separate arrays cannot
express interleaving without inventing an ordering key, and *“cuts a hole in whatever is
already there”* is the reading that needs none. ⚑ It is also what keeps the DRAWING and
the LOOKUP agreeing — `paintAtmospheres` cuts its holes in one pass after the paint
loop, so a point `clearsAt` calls clear is a point where a hole was actually cut. The
property D3 had, kept by different means.

⚑ `clears` is an ENUM (`darkness` / `haze` / `both`), per §11.5’s proposal: Tiled gives
a dropdown free and a bool PAIR lets an author tick neither. Absent reads as `both` (the
palette member’s own default — the C6 rule with no sentinel available); **present-and-
wrong is REFUSED**, by `zone.go` at boot and by `validateModel` at save.

⭐ **TWO PRE-EXISTING DEFECTS FELL OUT, and they are the durable part.**
① The converter’s **class split on the atmospheres layer was unpinned** — a mutation
pointing `modelToZone` back at the whole layer left all 133 legs GREEN, because the
completeness pin compares KEYS and both keys were still emitted. Now pinned by its own
leg, and the mutation is caught.
② `AuraTiledConvert`’s **layer-count test asserted layer-count == same-named-array-count
and had been wrong since zone-polygons D5** — it passed only because no zone authors a
polygon yet. A4 made it fire at once because `world.json` does author a clearing.
⛔ **The bug was found by CONTENT, not by the suite**, which is the thing to remember:
a shared layer needs its count test taught about sharing on the day the sharing lands.

**Content.** The `Clearing` PROFILE is retired in this commit — §11.5’s
`docs/cleanup.md` entry, executed rather than deferred, because once a clearing is a
class, a profile named `Clearing` that clears nothing is a trap wearing the right name.

⚑ **`world.json`’s migration is PREPARED IN THE WORKING TREE AND DELIBERATELY NOT IN
THIS COMMIT.** Its one `Clearing` atmosphere becomes a real clearing (`clears: "both"`,
byte-identical polygon) — but that file also carries the PO’s own uncommitted authoring
(the atmosphere banks themselves, new `CaveMouth` spawns), and `underworld.json` and
`tunnel.json` are entirely theirs. Splitting one file’s changes is not something to do on
someone else’s behalf, so **A4 ships INERT at HEAD** — the bar every surface primitive
before it was held to — and the migration goes in with the PO’s content.

⚑ **That shape never worked anyway**: it sat at index 0, BEFORE `Gloom`, so
last-declaring-wins painted straight over it. D17 is what makes it work at all.

**Schema: DB/WIRE/CONF/CONTENT NONE · ZONE FORMAT one new array, absent-safe.**

**Verified.** build · vet · `go test -count=1 ./...` EXIT 0 · tsc · **vitest 788/788** ·
prod build · **`verify.sh` all green through real Tiled incl. 2 new legs** ·
**mutation-verified ×5, one of which SURVIVED** and produced the missing class-split leg
above · **IN-GAME** (new `a4-clearing.mjs`, A/B): the sim reports LIT inside the clearing
and DARK outside it, and the scene graph holds **2 erase Graphics with the clearing
authored and 0 without**, 0 page errors.

⚑ **What the camera could NOT settle, recorded rather than smoothed over.** The pixel
A/B reads ×0.99 and is **inconclusive by geometry, not by defect**: a clearing must
OVERLAP a dark bank to have anything to erase, and this one’s overlap is a ~4 u strip —
narrower than the player’s OWN light, which erases the same darkness in both runs, so the
screen is identical either way. ⛔ **The bar was NOT lowered to make it green**: a pixel
leg that passed there would pass with `cutHole` deleted. To let the camera answer, author
a clearing whose overlap with a dark bank is comfortably wider than the carried light.
⚑ Two probe bugs of the same family were fixed on the way and are worth knowing before
writing the next one: **the player’s own light lights the player**, so asking `isHidden`
about the tile you warped onto always answers “lit”; and a sample patch offset away from
the avatar **walks out of the hole** unless the point is chosen for CLEARANCE, which
inverted the A/B and reported a working clearing as broken.

⚑ **Also owed, unchanged:** every number is [PLACEHOLDER] and the look sitting has not
happened. `sight` is still authored by nothing, so D7’s `max()` remains unexercised by
real content.


### A0 + A1 + A2 — the air, its two dials, and two profile tables ✅ 2026-09-16 (`5b57d0c4`)

**What shipped.** `zone.atmospheres` — polygons naming a profile, drawn as the AIR
over an area rather than the ground under it, on the ninth object layer and a client
render layer of their own. A1’s draw is byte-for-byte a region’s (`paintSurface` takes
its container as an argument), so `texture`/`scale`/`blend`/`scroll` came along free and
the deferred feathering chunk **A1b does not need to exist**. A2 adds `sight`, resolved
PER POINT and eased through the new `Ramp` — the “remembered value” wrapper
`plan-region-primitive.md` §4.3 predicted, arriving with its first real consumer.

⭐ **THE AIR IS TWO THINGS, and one dial could not say which** (PO 2026-09-14, and it
replaced `gloom` outright). `darkness` is the ABSENCE OF LIGHT — a lantern removes it by
definition, so it is drawn where the light holes erase it, and it is **COLOUR ONLY**.
`haze` is SUSPENDED MATTER — a lamp *shows* you fog rather than dispersing it, so it
lives in its own layer that nothing erases, and it is the half carrying `texture`,
`scale`, `blend` and `scroll`. ⭐ **The behaviour follows from WHICH KEY you authored**,
never from a flag beside a number, so the two cannot contradict — the same rule P1’s
closed-path shape flag follows. ⚑ Haze draws UNDER darkness, so fog is only visible
where there is light to see it by. ⚑ Authoring both is the smoky cave and is supported;
their opacities **COMPOUND rather than max** (0.8 under 0.4 reads ~0.88 unlit).

⭐ **TWO PROFILE TABLES, and this is the headline** (PO 2026-09-15, asked as *“can any
profile have darkness and haze? Even the regions?”*). `profiles.json` held the ground and
the air in ONE file and therefore fed ONE Tiled dropdown, so naming a ground profile on
an atmosphere drew **nothing** and an atmosphere profile on a region painted **grey
mud** — L15, and it had already cost a session. ⛔ **A validator leg catches that after
the fact; two files make it unrepresentable**, which is why the split beat the leg.
`terrain-profiles.json` → `AuraProfile` (19, worn by regions, paths, polygons and every
outline) and `atmosphere-profiles.json` → a new `AuraAtmosphereProfile` (4, atmospheres
only). ⚑ `AtmosphereProfile` **EXTENDS** `TerrainProfile` because fog legitimately wants
a texture — what the type split buys is the other direction, where
`TERRAIN_PROFILES.Forest.darkness` is now a **compile error** rather than data nothing
reads. ⛔ The two name lists are **DISJOINT** and three separate things pin it (the
palette generator hard-fails, a vitest, and a converter test): every accessor picks its
table by CALL SITE, so a name in both would make *“which Fog?”* depend on which lookup
ran, with both answers plausible on screen.

⭐ **The converter’s payoff is the MESSAGE.** A crossed name no longer reads *“unknown
profile”* — true and useless — but names the table the name actually lives in.

### ⚑ Two traps recorded, because neither is visible from the code

1. ⛔ **The texture preload must stay TWO calls.** A tile is named by a PROFILE, and the
   ground and air keep separate namespaces. Concatenating all four shape arrays into one
   `loadZoneTextures` would look `Fog` up in the terrain table, miss, and leave the bank
   on its fallback colour **for the life of the session with nothing said anywhere** —
   the exact failure the comment already there warns about, reintroduced by a
   tidier-looking line.
2. ⭐ **`verify.sh` CANNOT see which enum a class member declares — MEASURED, not
   assumed.** Headless `--export-map` loads no project, so `tiled.propertyValue` throws
   and `aura-world-format.js` falls back to writing the bare STRING (its `typedValue`),
   which round-trips whatever the member says. Pointing `AuraAtmosphere` back at
   `AuraProfile` was mutation-tested against the full `verify.sh` and **every leg stayed
   GREEN**. ⚑ The guard is a static pin over the generated palette instead
   (`AuraTiledConvert.test.ts`), and the DROPDOWN itself is now an explicit human check
   in `verify.sh`’s footer. ⭐ The general lesson: a round-trip leg proves NAMES survive,
   never that the GUI wiring is right.

### Riders that came in with it

- ⚑ The `Wall` profile authored `"texture": "null"` as a **STRING** — it worked by
  accident (no such tile, so D14 falls back to the colour) and is now real JSON `null`.
  This closes the item `plan-zone-polygons.md` §12 owed.
- ⚑ **Rectangles drawn in Tiled convert to polygons** on every closed-area layer
  (regions, `AuraPolygon`, atmospheres), with zero-size ones refused — PO-asked after
  *“I guess I used rectangle in Tiled, assuming it would convert cleanly”*.
- ⛔ **The atmospheres layer had NO `validateModel` leg at all**, which is what let a
  vertex-less shape reach the server and refuse the boot. That is the defect the PO hit;
  the missing leg, not the rectangle, was the cause.

**Schema: DB NONE · WIRE NONE · CONF NONE · CONTENT NONE** (both profile tables are
client-side, region-primitive D12) **· ZONE FORMAT one new array, absent-safe.**

Verified: build · vet · **`go test -count=1 ./...` EXIT 0** · tsc · **vitest 770/770** ·
prod build · **`verify.sh` all green** through real Tiled incl. two new legs ·
**mutation-verified ×5, one of which FAILED** and was replaced by the static pin ·
**IN-GAME**: fog paints textured and drifting, a `Clearing` cuts the fog and leaves the
ground intact (which is what proves the haze erase is scoped to its own render target),
darkness keeps its light holes, 0 page errors.

### ⚑ What this chunk OWES

- ⭐ **D3 is REOPENED by the PO (2026-09-16) and §11 holds the replacement design.**
  *“0 darkness should not be a clearing, it is not intuitive”*, then, on being offered a
  flag: *“0 darkness should be legal, because there might be atmospheres that want no
  darkness at all. Maybe more class separation is in order?”* — both correct, and the
  second is the better objection.
- ⚑ **Every number is [PLACEHOLDER] and the look sitting has not happened.** `Fog` sits
  at `haze: 0.5`, `Gloom` at `darkness: 0.55`, `Cave Air` at `1`. `sight` is authored by
  NOTHING shipped, so D7’s max() has never been exercised by real content.
- ⚑ The day/night cycle is still OFF (~25 per-layer filter passes); this chunk added a
  second filtered layer and did not change that verdict.

---

## 11. A4 — `AuraClearing`: the clearing becomes a CLASS, not a magic value

**Designed 2026-09-16 (PO-raised). ✅ BUILT the same day — the ledger is §10, and it
records the two rulings this section deliberately left open (D17's ordering, and
`clears` as an enum) plus the two pre-existing defects the build exposed.** This
REOPENED **D3**, which shipped in A1 and which the PO rejected the first time they read
it back.

### 11.1 What is wrong with D3

D3 made `darkness: 0` mean **erase**. It works, and `resolve()` gets it right on its own
— but it is one key doing two jobs: *how much* and *which operation*. Three separate
author intents collapse onto two spellings:

| the author means | today they write | what they get |
| --- | --- | --- |
| “no opinion, ask the next atmosphere” | omit the key | correct |
| “there is **no darkness** in my air” | `darkness: 0` | ⛔ an **erase**, not what they meant |
| “cut a hole in whatever is here” | `darkness: 0` | correct, but by a magic value |

⭐ **The PO’s objection is the sharper one, and it arrived in two steps.** First
*“0 darkness should not be a clearing, it is not intuitive — maybe a clearing flag
instead?”*. Then, offered exactly that flag: *“hm, 0 darkness should be LEGAL, because
there might be atmospheres that want no darkness at all. Maybe more class separation is
in order?”* — which rejects the flag too, and for a better reason. A flag on the
PROFILE still makes the look table carry an OPERATION.

⚑ **The absent-vs-zero confusion is the same bruise that already cost a session**: the
PO removed `haze` from `Fog` expecting it to go pale and the whole bank vanished. Any
design where “0” and “absent” differ in a way the author has to hold in their head will
keep producing that class of surprise.

### 11.2 The shape

⭐ **A clearing is a different KIND OF OBJECT, not an atmosphere with a special number.**
That matches two rulings this codebase already made, and it is why this design is not a
new idea so much as the consistent one:

- **P1 — “the SHAPE is the flag.”** A closed path carries no `closed` bool, because an
  authored bool can contradict the shape it was drawn as, and then two sources of truth
  disagree.
- **D5 — `AuraPath` and `AuraPolygon` share the `paths` layer and are told apart by
  CLASS**, not by a property, and they land in separate zone arrays.

```
atmospheres layer
├── AuraAtmosphere   profile → AuraAtmosphereProfile   (PAINTS)
└── AuraClearing     clears  → darkness | haze | both   (ERASES)
```

`zone.clearings[] = {clears, points}` — its own array, exactly as polygons got their own
despite sharing a layer with paths.

⛔ **`AuraClearing` takes NO profile member**, and the emptiness is the ruling. It paints
nothing, so by the L7 argument (a polygon has no `width`, an atmosphere has no
`blocksMovement`) an author reaching for *“what colour is my clearing”* must find
**NOTHING** rather than a field that quietly means something else.

That frees the whole vocabulary, and every cell below is then the obvious reading:

| author writes | means |
| --- | --- |
| *(key absent)* | no opinion — the search continues outward (D0) |
| `darkness: 0` | **declares** zero darkness; paints nothing, and STOPS the search |
| `darkness: 0.55` | paints, at that opacity |
| an `AuraClearing` | cuts a hole in whatever is already there |

⭐ **`darkness: 0` becomes genuinely USEFUL rather than merely legal**, which is the part
the PO saw and the flag design missed: a pure fog profile can declare *“and it is not
dark in here”*, which stops a containing dark bank from being reported at that point.
That is a capability the current design cannot express at all.

### 11.3 ⛔ The seam that must not be missed

`DarknessOverlay.inDarkness()` — the GAMEPLAY query deciding whether a mob’s nameplate
is visible — is `resolveIn('darkness', …) > 0`, a walk over atmosphere PROFILES. Its own
comment records that D3’s clearing *“falls out for free”* precisely because a clearing
DECLARES `darkness: 0` and is therefore the last declaring shape at that point.

⛔ **A clearing with no profile is INVISIBLE to that walk.** Build A4 naively and a
player stands in a lit pocket while the sim still thinks they are in the dark — correct
on screen, wrong in the simulation, and nothing throws. ⚑ Same class of defect as the
abutting-collider trap in `plan-zone-polygons.md`, and it will not be found by looking
at the picture.

⚑ **The fix is what keeps the design honest**: clearing shapes enter that lookup
deliberately, answering 0 for whichever layers they clear. One resolved model, two
authoring surfaces — `resolveIn` itself does not change.

### 11.4 What it costs — a CHUNK, not a tweak

A new zone-format array is the four-writer tax, and the completeness pin cannot see the
fourth writer:

1. `backend/pkg/aura/world/zone.go` — the struct, `DisallowUnknownFields`, validation
   (≥3 points; `clears` from a closed set) — and `place.go`, since clearings must take
   the zone origin like atmospheres do.
2. `aura-convert.js` — all three directions, plus the shared-layer class check the
   atmospheres layer does not have yet (D5’s L2b: an object that is NEITHER class lands
   in neither array and vanishes on the next save with every check green).
3. `ZoneModel.getZoneAsJSON()` — the in-game editor carries it through untouched.
4. ⛔ `aura-world-format.js` — **the writer the completeness pin cannot see**, and the
   one that has already produced two real defects (a dropped `origin`, an unread
   `className`). A `verify.sh` leg is the only guard.
5. `generate-palette.mjs` — the `AuraClearing` class and a `clears` enum.
6. Client — a `Clearings` loader, the `paintAtmospheres` erase pass, and §11.3’s seam.

⚑ Comparable to `plan-zone-polygons.md` P2 in shape and size.

### 11.5 ⚑ What this does NOT decide

- ~~Whether `clears` is an enum or two bools on the class.~~ ✅ **RESOLVED: the ENUM**,
  for the reason proposed — Tiled gives a dropdown for free and a bool PAIR lets an
  author tick neither. ⚑ Absent reads as `both` (the palette member's own default, the
  C6 rule with no sentinel available); present-and-wrong is REFUSED at both save and
  boot.
- ~~Whether the shipped `Clearing` PROFILE survives A4 at all.~~ ✅ **RESOLVED in the
  build: it does not.** Once a clearing is a class, a profile named `Clearing` that
  clears nothing is a trap wearing the right name — so A4 retired it and migrated
  `world.json`'s one use to a real clearing. Done inside the chunk rather than deferred
  to `docs/cleanup.md`, because leaving both spellings alive for even one session is
  precisely the ambiguity A4 exists to remove.
- Whether partial clearing (“thin the fog to 0.2”) should exist. It does not today —
  opacities COMPOUND, so a lower value cannot reduce — and A4 does not add it.
