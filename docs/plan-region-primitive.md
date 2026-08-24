# Plan: the region primitive — named areas that carry their own properties

> **Status: DESIGNED 2026-08-23 (D0–D3 + D11 PO-ruled; D4–D10 are §9
> proposals the PO may veto). No chunk built.** Opened by the PO question
> *"could it be possible to have different ground colors on the map"* during
> the zone-outline pass, then twice widened in the same session: first by
> *"can this also be used for different footstep sounds per biome?"*, then by
> *"music should also be included"* — which surfaced that
> **`plan-release-map.md` §8 (D6, PO-ruled 2026-08-23) already specifies this
> same field**, and that both of us were rediscovering `tdd.md` §4.6 (2026-07-09).
> This doc is the reconciliation: **one mechanism, several consumers.**
>
> ⚑ **Schema impact: NONE. No migration.** One new client-visual zone array,
> parsed-and-ignored server-side exactly like `darkAreas`; not one byte of
> persisted state moves (§6).
>
> **Widened 2026-08-24** by the ground-texture spike (thrown away the same
> day, nothing committed): §4.8 designs `texture` as an optional profile
> property, D5 gained spike evidence, and §11 gained the adoption + blend
> questions. No new ruling; textures are a designed option, not a decision.

## 1. What this is

`tdd.md` §4.6 decided the shape on **2026-07-09** and deliberately did not
build it:

> *Three later features — per-area music, darkness patches, and per-area
> terrain/biome — all reduce to the same primitive: **a named region inside a
> zone carrying its own properties**… don't build regions yet, but don't design
> them out… the loader's `DisallowUnknownFields` makes a later `regions: [...]`
> a one-line additive change. One shared region primitive then underpins music
> + darkness + terrain.*

That is exactly this plan. ⚑ The primitive has already been half-broken once:
**darkness shipped as its own `darkAreas` array**, not as a region property.
This plan does **not** retrofit that (§4.4) but records it so the next person
does not read `darkAreas` as evidence that regions were rejected.

**The mechanism:** a zone gains `regions: [...]`. Each region is a polygon
naming a **profile**. A profile is a named bag of client-side presentation
properties — ground color, footstep sounds, music, later atmosphere. The
server never reads any of it.

**What it is not:** not gameplay. No movement cost, no spawn weighting, no
damage modifier, no server-side "the player is in the swamp". Anything
mechanical needs the server to consume the array, which §4.5 forecloses.

### 1.1 The state of the ground today

The world's ground is **one color**. `Game.startRendering` draws a single
`Graphics().rect(bounds).fill(GraphicsConfig.landColor)` — `0x006030`, the
`LAND_COLOR` token (`Game.ts:506-512`). Everything else is 549 hand-placed SVG
blobs on top, each with its fill baked into the asset (`land1.svg` is literally
`fill:#006030` — which is why it reads as *land shape*, not as texture).

Music is one hardcoded looping mp3 (`Music.ts`, 32 lines). Footsteps are one
`footsteps-on-road` set. Atmosphere does not exist.

### 1.2 Why not just paint texture blobs

The cheap alternative — new colored ground-texture *types*, painted by hand —
already works and needs no plan (it is how `Sand` covers the map today, 372
pieces). Weighed and rejected for the zone outline:

- The base fill shows through every gap, so a biome must be painted to **full
  coverage**. `Sand` needs 372 pieces for the fraction it covers; a whole swamp
  zone is thousands.
- Terrain array order is paint order and the array is flat with no addressing
  (backlog §58), so "the swamp's ground" would be indistinguishable from
  decoration inside one 3000-entry array.
- The full-screen map bakes the same pieces, so the cost lands twice.
- **And it gets you nothing for music, footsteps or atmosphere** — the whole
  reason §4.6 called this one primitive.

A region is one object per area, and the texture blobs go back to what they are
good at: **edge treatment**. Sand meeting a swamp polygon is the blending the
existing assets already do well.

## 2. Relationship to `plan-release-map.md` §8 (D6)

**D6 and this plan are the same feature**, ruled and designed a day apart
without either knowing about the other. The reconciliation, agreed 2026-08-23:

| | release-map §8 / D6 | this plan |
|---|---|---|
| field | `regions: [...]` | same name, same place |
| shape | coordinate squares | **polygons** — a square is a 4-point polygon (D1) |
| purpose | zone look + music + atmosphere | the same, plus ground color and footsteps |
| touch points | *"TWO are mandatory"* | ⚑ **three** — see §5 |
| resolution | point-in-rect per frame | one rule, per property (D0) |

- **D6 stands unchanged as the direction and the ruling.** It says the game is
  ONE contiguous map, zones are coordinate regions inside it, no multi-world,
  no server hop, no `phy.Space` split. Nothing here touches that.
- **This doc owns the mechanism**; §8 should link here rather than re-specify
  the field, and its *"TWO touch points"* line needs correcting to three (§5).
- **Polygons do not overturn D6.** A coordinate square is expressible as a
  4-point polygon, so D1 is a strict superset of what D6 asks for. A zone-sized
  region will in practice be authored as a rectangle in Tiled.

## 3. Decision ledger

D0–D3 and D11 taken 2026-08-23 as PO rulings. D4–D10 are §9 proposals.

- **D0 — ONE array, one resolution rule, applied per property.** Zone-regions
  (music, atmosphere) and biome-regions (color, footsteps) are the **same
  object at different sizes**, not two mechanisms. Resolution: **the last
  region in array order that contains the point AND whose profile declares that
  property wins.** A profile that does not declare a property is transparent to
  it. This is `tdd.md` §4.6's "one shared primitive", it satisfies D6, and it
  is one rule rather than one per consumer. Chosen over two arrays with
  different semantics (a partition for music, an overlay for paint).
- **D1 — polygons.** `points: [{x, y}, …]`. Chosen over circles (the
  `darkAreas` precedent) and rectangles: a coastline or forest edge is one
  polygon and an indefinite number of circles, Tiled has native polygon objects
  with vertex dragging, and the surface that would have paid for the harder
  shape (the in-game editor) is excused from placing them by D3. ⚑ A rectangle
  is a 4-point polygon, which is what makes D6 fit inside this without a
  ruling change.
- **D2 — a named profile, resolved client-side.** The zone authors
  `"profile": "swamp"`; what that name means lives once in the client. One
  source of truth per profile, a generated Tiled dropdown for free (tiled D7:
  palettes are generated, never hand-maintained), and a re-skin of every swamp
  in the world is one edit. Raw hex per region was rejected: 40 swamp polygons
  would hold 40 copies of one decision. ⭐ **This ruling is what made the two
  later widenings free** — had raw hex won, footsteps and music would each have
  been a content migration instead of a client-side key.
- **D3 — Tiled places them; the in-game editor round-trips them.** Tiled gets a
  `regions` object layer. The in-game editor gets **no new mode** — but it
  **must** carry the array through load → save untouched, or the first in-game
  save silently deletes every region in the world. See L1; this is not
  optional, and it is the single most dangerous thing in this plan.
- **D11 (2026-08-23, PO) — ALWAYS fall back to the default profile, at every
  level.** Not just "outside every region": an unknown profile name, a profile
  that omits the property, and a named asset that is missing all resolve to the
  default rather than to silence, a blank, or a throw. `resolve()` is
  total — it always returns something usable. §4.2 states the chain. ⚑ The one
  deliberate exception is an **explicitly authored** `null`, which is how an
  author asks for "nothing here" (`plan-region-audio.md` D8); absence and
  `null` are different answers on purpose.

## 4. Design

### 4.1 The authored shape

```jsonc
"regions": [
  { "profile": "swamp",                      // zone-sized, authored as a rect
    "points": [ {"x": -60, "y": 10}, {"x": -10, "y": 10},
                {"x": -10, "y": 45}, {"x": -60, "y": 45} ] },

  { "profile": "bog",                        // a blob inside it
    "points": [ {"x": -30, "y": 20}, {"x": -10, "y": 24},
                {"x": -8,  "y": 38}, {"x": -32, "y": 35} ] }
]
```

Server units like everything else in the zone file; the client multiplies by
`meter2px` on load, as `GroundTextureManager.loadZone` and
`MapTerrain.bakeTerrain` already do.

**Omitted while empty**, like `campfires`, `darkAreas` and `anchors`, so every
existing zone round-trips diff-clean (`ZoneModel.getZoneAsJSON` precedent).

### 4.2 Resolution (D0), stated once

```ts
function resolve<K>(property: K, point): Profile[K] | undefined {
    for (let i = regions.length - 1; i >= 0; i--)          // last wins
        if (property in PROFILES[regions[i].profile]
            && pointInPolygon(point, regions[i]))
            return PROFILES[regions[i].profile][property];
    return DEFAULT_PROFILE[property];
}
```

With the §4.1 example, standing in the bog: **color** and **steps** come from
`bog`; **music** falls through to `swamp`, because `bog` does not declare it.
That fall-through is the whole point of D0 — a small biome blob inside a zone
does not need to restate the zone's music, and a zone does not need to know
which blobs sit inside it.

**The fallback chain (D11).** `resolve()` never fails and never returns
nothing usable:

1. the last containing region whose profile **declares** the property, else
2. the **default profile** — today's shipped values, which are the world as it
   sounds and looks right now (`LAND_COLOR`, `step/step2/step3`,
   `derpy-berryhunter.mp3`),
3. and if a profile names an asset that does not exist, the default's asset —
   ⚑ **not** silence. This one has to be explicit: `SpatialAudio.play` already
   does `if (!sound.exists(soundId)) return;`, so a typo'd sound id is
   **silently dropped today**. A region that mutes the game because someone
   mis-spelled a step id is the exact failure D11 exists to prevent.

⚑ An **authored `null`** is a value, not an absence: it means "nothing here"
and is the only way to reach silence (`plan-region-audio.md` D8).

⚑ **Array order is the only ordering.** No z-index, no size heuristic, no
"innermost wins" — mirrors `terrain`'s paint order
(`GroundTextureManager.ts:23-35`), which authors already understand, and it is
what the Tiled layer's `draworder: index` already preserves.

### 4.3 Consumers

| consumer | property | called with | owned by |
|---|---|---|---|
| ground color | `color` | each region's own polygon, once at load | **this plan, C1** |
| footsteps | `steps` | the position the movement event already carries | `plan-region-audio.md` |
| music | `music` | the local player's position, per frame | `plan-region-audio.md` |
| atmosphere / fog | *(unnamed)* | the local player's position, per frame | `plan-release-map.md` §8, later |

⭐ **There is ONE check, not two.** `resolve(property, point)` is the whole
interface, and every consumer calls it with a point it already has — a remote
player's footstep is the *identical* call to your own, just a different
argument (`PlayerMoved` and `CharacterMoved` both hand over a `Vector`
already, `Character.onMove()`). Nothing about the lookup is local-player-
specific, and no consumer needs a second mechanism to reach a position it holds.

What music adds on top is **not a different lookup** — it is one remembered
value:

```ts
const next = resolve('music', playerPosition);
if (next !== current) { crossfade(current, next); current = next; }
```

That change-detection exists because music has *transitions* (a crossfade is
about the boundary, not the location), not because the query differs. Two
shipped patterns have that exact shape and are worth reading first:
`DarknessOverlay.inAnyCircle` (per-frame membership) and `MapFog.revealAt`
(entered-a-new-cell tracking).

C1 builds `resolve()` and the profile table — that is the entire primitive.
The remembered-value wrapper arrives with its first consumer, which is music,
and atmosphere reuses it rather than adding a third thing.

### 4.4 What this plan does not absorb

- **`darkAreas` stays its own array.** Folding shipped darkness into `regions`
  is a migration of authored content plus a rewrite of a working overlay, for
  tidiness. YAGNI; recorded in §10 as a someday.
- **Atmosphere/fog is release-map's**, not this plan's. ⛔ And it carries a
  standing lock worth repeating here because it is easy to get wrong: **do NOT
  build per-zone tint on the day/night machinery** — it was disabled precisely
  because ~25 per-layer filter passes reassigned at 30 Hz made avatars
  invisible at the transition. The working pattern is `DarknessOverlay`'s:
  gradient sprites on a dedicated layer, zone-data-driven.
- **No gameplay meaning** (§1).

### 4.5 Client rendering (C1's half)

A new container `layers.terrain.regions`, between `ground` (the base fill) and
`textures` (the blobs) in `Game.ts:212-218` and the `addChild` order at `:275`.
Each region is one `Graphics().poly(points).fill(color)`, drawn once at load.

Three things fall out for free:

- **Night tint is automatic.** The day-cycle filter set is *derived* — every
  layer minus an explicit exempt set (`Game.ts:533-552`) — precisely so a new
  layer is night-correct by default.
- **Darkness sits above it** and is exempt from the tint; a dark area over a
  swamp is still dark.
- **No per-frame cost.** Static `Graphics`, like the base fill.

The profile table is a new export beside `LAND_COLOR` in `client-data/Theme.ts`
— the leaf module that already owns cross-language colors. ⚑ `Theme.test.ts`
pins LESS/TS color pairs; profile colors have **no LESS twin**, so they sit
outside that pin, the same call `HEALTH_FILL` already carries there.

### 4.6 Server side: parse, validate, ignore

`world/zone.go` gains a `Region` struct and `Zone.Regions`, documented with the
sentence `TerrainTexture` and `DarkArea` already carry: *purely client-visual —
the server parses it (so `DisallowUnknownFields` accepts the key and typos fail
by name) but never uses it.*

`validate()` gains, following the `darkArea` radius check at `zone.go:317`:

- `len(points) < 3` → error naming the region index (a polygon needs an area).
- `profile` empty → error. **Unknown** profile names are *not* checked
  server-side: the table lives in the client, the server has never validated
  `terrain.type` either, and Tiled's save-time validation (tiled C4) is where
  an unknown name gets caught with an object id. A deliberate asymmetry — and
  ⭐ **D11 is what makes it safe**: an unknown name resolves to the default
  profile, so a typo costs you the region's look, never the world's sound or a
  broken client.

No `resolve()` work, no registry, no boot-time cross-validation.

### 4.7 Map parity is non-negotiable

`MapTerrain.bakeTerrain` draws its own copy of the land fill *and* the terrain
pieces into one RenderTexture, once, and deliberately never re-bakes (it is the
mobile perf ceiling that file exists to pay once). Regions must be baked into
the same texture, between the land rect and the pieces. Skipping this does not
degrade — it produces a **map that is a wrong drawing of the world**.

### 4.8 Ground texture: the profile's optional `texture` property (spike-informed, 2026-08-24)

**Status: designed, not ruled.** A one-day throwaway spike (2026-08-24, fully
deleted, nothing committed) put tiled seamless textures and a two-texture
cross-fade in front of the PO in-game. It ended at "insightful", with no
adoption ruling; this section records the design and the evidence so the C3
palette sitting can choose between flat color, texture, or both per profile.

**The authored shape does not change.** `texture` is one more optional profile
property beside `color`, resolved by the same `resolve()` (D0) with the same
D11 chain: a profile declaring neither paints nothing (the base fill shows), a
`texture` naming a missing asset falls back to the profile's `color`, then to
the default profile. Authoring in Tiled is identical to color regions: draw
the polygon, pick the profile. Nothing new to teach any of the three
whitelists beyond what §5 already requires.

**The asset source that makes this cheap to try:** opengameart.org's
"100 Seamless Textures" pack (`pdtextures.zip`, 15.5 MB), CC0, 750×750 JPGs,
painterly rather than photographic, so it sits closer to the flat top-down art
direction than feared. Spike shortlist by role: 185 / 135 / 186 (green ground,
185 nearest today's `LAND_COLOR` feel), 131 / 162 (dirt), 104–106 (sand),
156 / 141 (stone). ⚑ Tile **scale is the sensitive knob**: the raw 750 px tile
reads as either ground or wallpaper depending on world scale, so the profile
table should carry a per-texture scale, tuned by eye once.

**Rendering shape, and the one wrong way to build it.** The spike drew each
texture as a full-map `TilingSprite` plus a full-map alpha mask. That is the
throwaway shape: generalized to N textures it stacks N full-screen layers and
this client is measurably **fill-bound** (the mobile lesson pinned in
`Game.ts renderResolution()`: frame time ≈ linear in pixels painted). The
shipped shape is the same as §4.5's color regions: **one polygon-clipped fill
per region** (`Graphics().poly(points).fill({texture, matrix})`), so every
ground pixel is painted once, exactly like today's flat rect with a texture
sample instead of a solid color. Pixi 8.4 supports both forms; neither is used
anywhere in the client yet, so either way it is a new (small) pattern.

**Soft borders, if wanted (the D5 question).** The spike's fluent cross-fade
technique carries over without its overdraw problem: generate an
alpha-gradient band (smoothstep across the border, optionally wobbled so it
does not read as a ruler edge) into a canvas **once at zone load**, and mask
only a border-band sprite with it. Cost: a second texture sample only inside
the bands, which are a small fraction of any viewport; zero per-frame
generation. Who owns the blend width (global constant / per profile / per
region) is an open question; lean: per profile with a shipped default.

**Performance at target scale** (asked 2026-08-24: 12 zones × 6 textures):

- **Zone count is free at runtime.** The client renders exactly one zone
  (`Welcome.zoneName`); other zones' textures are never decoded or uploaded.
  Zone count only affects assets: 6 shared textures ≈ 1–1.5 MB; even 6 unique
  per zone × 12 zones ≈ 15 MB of per-zone lazily-loaded files. ⚑ But see L3:
  today the client **eagerly bundles every zone JSON**, and textures must NOT
  join an eager bundle: load the active zone's set at `startRendering`.
- **VRAM is trivial**: a 750×750 texture ≈ 2.25 MB, ×6 ≈ 14 MB (~18 MB with
  mipmaps). Phone-safe.
- **The only real axis is overdraw**, and the polygon-clipped shape holds it
  at ~1× (blend bands locally 2×), i.e. steady-state delta versus today's
  flat rect ≈ zero by construction. Draw calls: 6–12 region polygons are
  noise next to the 537 blob sprites already drawn above them.
- **Map parity costs once**: §4.7's bake gains the same polygon fills, paid at
  bake time, not per frame.

**Two client traps the spike hit, recorded so C-whatever does not re-find
them:**

- `Preloading.registerGameObjectSVG`'s `data:{width,height}` pair **crops a
  raster top-left instead of scaling it** (the documented vectors-only caveat
  at `Preloading.ts:63-75`); tile JPGs/PNGs must load through the `{src}`-only
  branch.
- The 74 `Land` terrain blobs are filled with the exact `LAND_COLOR` green.
  Invisible over the flat fill, they become solid green patches over any
  texture. A textured profile rollout must re-judge (or re-tint / delete)
  them; the sand blobs read differently over texture too.

## 5. The whitelist problem — now THREE, and one is guarded

There are **three parallel whitelists** for the zone format, and only the first
is authoritative (`AuraTiledConvert.test.ts:434`):

| whitelist | on an unknown key | guard |
|---|---|---|
| `backend/pkg/aura/world/zone.go` | hard-fails boot | `DisallowUnknownFields` |
| `aura-convert.js` `serializeZone` (Tiled) | drops it silently | ✅ **the completeness pin** |
| `ZoneModel.getZoneAsJSON()` (in-game editor) | drops it silently | ❌ **nothing** |

⚑ **`plan-release-map.md` §8.2 says "TWO touch points are mandatory" and that
is now wrong** — the Tiled extension shipped 2026-08-22/23, adding a third.
Correcting that line is part of C2.

This is the failure that ate `spawn.level` once already. Adding `Regions` to
`zone.go` will turn the **tiled C5 completeness pin red** — by design; the pin
scrapes `zone.go`'s `json:` tags and asserts the converter round-trips exactly
that key set. This plan is its first customer. `ZoneModel` has no such pin, so
C1 must teach it `regions` and C2 should extend the pin to cover it.

## 6. Schema impact

**NONE — no migration.** A new client-visual array in the zone file; no
persisted state, no wire field, no FlatBuffers change, no table. The one
persisted identity near the zone file — `Campfire.ID`
(`characters.home_campfire_id`, never reuse a number) — is untouched, and the
byte-stability gate (tiled D6) is what proves the round-trip did not re-mint it.

## 7. Chunk breakdown

- **C1 — the primitive + color, end to end.** `zone.go` struct + validate +
  tests · the profile table in `Theme.ts` (**`color` only**) · `resolve()` ·
  the `regions` layer in `Game.ts` · the bake in `MapTerrain.ts` ·
  `ZoneModel` round-trip (L1) · `aura-convert.js` read/write so the C5 pin goes
  green · **one hand-authored region in `world.json`** as the worked example.
  Done when it is visible in-game, visible on the full map, and a Tiled
  open→save is still a zero-byte diff.
- **C2 — authoring surface.** The Tiled polygon layer in the generated palette
  (a `Profile` enum + an `AuraRegion` class) · save-time validation mirroring
  §4.6, naming the object id (tiled C4's pattern) · extend the completeness pin
  to `ZoneModel` · fix `plan-release-map.md` §8.2's "TWO touch points" ·
  `manual-zone-editor.md` + `manual-tiled-editor.md` notes.
- **C3 — the color palette** (optional, content-adjacent). The biome color set
  for the zones in the outline — swamp, desert, ash, dead forest, stone. A
  taste decision; its own sitting. ⚑ This sitting also owns the §4.8 adoption
  call: flat color, texture, or both per profile.
- **C4 - ground texture** (optional, exists only if C3 adopts §4.8). The
  `texture` profile property end to end: polygon-clipped fills in `Game.ts` +
  the `MapTerrain` bake · per-zone texture loading (the `{src}`-only branch,
  §4.8's raster trap) · per-texture scale in the profile table · the blend-band
  masks if soft borders were ruled in · the `Land`-blob re-judgement (§4.8).
  Authoring surface is C2's unchanged; `texture` is just one more profile
  member.

Audio consumers are `plan-region-audio.md`. Atmosphere is release-map's.

## 8. Test strategy

1. **Go** — a zone parsing `regions`; rejection of `< 3` points and of an empty
   profile, both naming the index; a zone with no `regions` key still loading.
2. **vitest** — `resolve()` as a pure function: a point in one region, in two
   overlapping ones (**last wins**), the fall-through case (inner region does
   not declare the property → outer one answers), and outside everything →
   default. ⚑ The fall-through case is D0's whole reason to exist; if only one
   resolution test survives review, it is that one.
3. **vitest — the D11 fallback chain, as its own group.** `resolve()` is total:
   an unknown profile name, a profile omitting the property, and a profile
   naming a missing asset each return the default rather than `undefined`,
   silence or a throw — while an authored `null` returns `null`. ⚑ Write these
   as a table; they are cheap, and they are the difference between a typo
   costing one region's look and a typo muting the game.
4. **vitest** — `aura-convert.js` round-trips a region polygon object-for-object
   (the `waypoints` polyline cases are the template); `ZoneModel` round-trips
   regions untouched; the completeness pin green again, **proven red first**.
5. **Byte-stability (tiled D6)** — Tiled open → Ctrl+S → `git diff
   --exit-code`. ⚑ Baseline against a settled file: `api/zones/world.json` is
   dirty in the working tree right now.
6. **In-game** (`verify`) — the region renders under props and over the base
   fill, the full map shows it in the same place, a dark area over it is still
   dark.
7. `go build ./...`, `npm run typecheck`, the standing tail. ⚑ Content edit →
   `go test -count=1`.

## 9. Proposals adopted without a choice prompt (PO may veto any)

- **D4 — the key is `profile`, not `biome`.** A ruined fortress carrying music
  and gloom is not a biome; `zone` would collide with the zone *file*. If the
  PO prefers `biome`, it is a find-and-replace in an unshipped field.
- **D5 — hard edges, no soft fade.** The ground-texture blobs are the edge
  treatment, as `Sand` meets land today. A radial fade drags in the alpha-seam
  problem `DarknessOverlay` solves with its own render texture — cost with no
  evidence it is needed. ⚑ **New evidence 2026-08-24**: the ground-texture
  spike (§4.8) showed a fluent texture-to-texture cross-fade via a one-off
  alpha-gradient mask, generated once at load, no per-frame cost and no
  alpha-seam class (one mask per border, not overlapping radial sprites). D5
  stands as written for **color** regions; whether *textured* regions get soft
  borders is §11's blend question, decided if and when textures are adopted.
- **D6 — the base `LAND_COLOR` fill stays.** Regions paint over it; a zone need
  not be fully covered.
- **D7 — the profile table lives in `Theme.ts`**, not `Graphics.ts` (which owns
  *assets*; these are tokens).
- **D8 — unknown profile names are a Tiled-side error, not a boot error.**
- **D9 — no `regions` support in the in-game editor panel**, not even read-only.
  Round-trip only (D3/L1).
- **D10 — one profile table, not one per consumer.** Color, steps and music
  live on the same object even though different plans build them.

## 10. Landmines

- **L1 — `ZoneModel.getZoneAsJSON()` drops what it has never heard of.**
  Ship the field without teaching it and the first in-game editor save deletes
  every region, silently, with all tests green. Highest severity here.
- **L2 — `MapTerrain` bakes once and never re-bakes.** Regions go into the
  bake, never a per-frame draw.
- **L3 — the client eagerly webpack-bundles every zone JSON**
  (`GroundTextureManager.ts:144`). Polygons are small beside 549 terrain
  pieces, but this is what bites when the outline's 21 regions-worth of content
  exists.
- **L4 — `terrain.type` is validated nowhere** and `profile` inherits that
  posture (D8): a typo renders as *nothing*, in the browser, at load. The
  generated Tiled enum closes it in practice.
- **L5 — the C5 pin goes red the moment `zone.go` grows the field**, before the
  converter is taught. Correct behaviour; do not "fix" it by adding `regions`
  to `NOT_AUTHORED_IN_TILED`.
- **L6 — an audio profile member drags in backlog §19** (~160 MB of eagerly
  decoded mp3s). Owned by `plan-region-audio.md`; **no chunk in this plan adds
  a byte of audio.**
- **L7 — ⛔ never build atmosphere on the day/night filter machinery** (§4.4).

## 11. Open questions

- **Do regions belong in the minimap too?** `MiniMap` is a second per-frame GL
  context and the named mobile perf ceiling. The full-screen map is in scope;
  the minimap is not, pending a measurement.
- **Should a profile carry a default DECORATION set** — paint a swamp and have
  the editor offer reeds and puddles, instead of picking from all 18
  ground-texture types? Authoring convenience only.
- **Should `darkAreas` eventually fold into `regions`?** (§4.4) Tidiness versus
  a content migration and an overlay rewrite. Not now.
- **C3's palette**: how many profiles, and which colors. A PO call.
- **Textured profiles at all?** (§4.8) The 2026-08-24 spike look ended at
  "insightful" with no verdict; the C3 sitting decides flat color, texture, or
  both. If both: is `color` under a texture the fallback only (D11), or a tint?
- **If textures get soft borders** (the D5 evidence note): who owns the blend
  width (global constant, per profile, or per region)? Lean per profile with a
  shipped default.
- **Quest-readable regions — a possibility, not a requirement** (PO 2026-08-24,
  quest-gap conversation): a future "entered region" quest objective would ride
  this primitive and is the natural substitute for a location-objective verb
  ("reach the shrine"). To be taken into the plan or explicitly left out at its
  planning session — it is NOT a precondition of any chunk. The one thing to
  decide then: whether regions get stable, nameable ids the quest ledger could
  reference (a pure presentation feature has no reason to guarantee that on its
  own). Nothing else about the design changes either way.

## 12. Chunk ledgers

*(appended per execution session — none yet)*
