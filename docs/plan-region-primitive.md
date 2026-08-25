# Plan: the region primitive — named areas that carry their own properties

> **Status 2026-08-25: C1 + C2 + C3 ALL DONE, nothing outstanding on any of
> them · C4 IS NEXT and is fully specced (§4.9).**
> ⭐ Regions render in game (PO-confirmed), are drawable in Tiled off a
> generated `AuraProfile` dropdown (PO-confirmed), an unknown profile is
> refused at save time with its object id, and **all three zone-format
> whitelists are pinned** — §5's table has no ❌ row left. C3 ruled the
> **16-profile set (D17)**, that **every profile ends up textured (D18)**, and
> that the `Land` blobs are **left alone (D19)**. ⏸ Colour tuning deferred by
> the PO ("much later") and blocks nothing.
> ⚑ **Settle D18's fork before C4 spends 16 art picks**: sixteen independent
> textures, or a new `tint` key.
>
> Ground textures are adopted: texture or colour per profile, colour as the
> fallback under a texture, hard edges, and one sitting deciding the palette
> and the texture/colour split together. §4.9 is the implementation spec,
> written against the shipped code. ⚑ Nothing about the **zone file** changes
> for textures — a region still just names a profile — so no whitelist and no
> Tiled work rides on C4.
>
> *(Earlier banner, kept for the trail:)*
> **READY TO IMPLEMENT 2026-08-24 — C1 next, colour only.** (Designed
> 2026-08-23; D0–D3 + D11 PO-ruled, D4–D10 are §9 proposals the PO may veto.
> No chunk built.) ⭐ **A readiness pass on 2026-08-24 re-checked every claim
> this doc makes about the code and found them all still true** — the layer
> seam, the map bake, the three whitelists, the polyline precedent. It found
> **one gap the design had not noticed** (D12: the palette generator cannot
> read a `.ts` profile table) and **one landmine** (L8: the obvious home for
> that table hard-fails boot). Both are settled below; nothing else blocks C1.
> PO scoping the same day: **authoring in Tiled + rendered colours first, all
> audio consumers later** — which is C1 then C2 exactly as §7 already splits
> them, since C1 is specified as `color` only. `plan-region-audio.md` is
> untouched and unscheduled.
>
> Opened by the PO question
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
⚑ The ledger continues in §9: D12 (2026-08-24) and D13–D16 (2026-08-25) are
also PO rulings — see the note there.

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

**Status: RULED 2026-08-25 — adopted (D13–D16). C4 is a real chunk.** A
one-day throwaway spike (2026-08-24, fully deleted, nothing committed) put
tiled seamless textures and a two-texture cross-fade in front of the PO
in-game. It ended at "insightful" with no verdict; the 2026-08-25 spec session
ruled it in, and §4.9 is the implementation spec. The four rulings, in one
place:

| | ruling |
|---|---|
| **D13** | adopted — **texture OR colour, per profile**; flat colour stays first-class |
| **D14** | a profile's `color` under a texture is the **fallback only**, never a tint |
| **D15** | **hard edges** in C4; the blend band is specced, not built |
| **D16** | C3 and C4's look decisions are **one sitting**, not two |

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
  ⚑ **Corrected 2026-08-25: this is NOT texture-specific and it is already
  live.** Any region paint — flat colour included — puts those blobs on a
  background that is no longer their own green. 75 `Land` blobs exist, and
  **12 of them overlap C1's single worked-example region**, so the first
  in-game look at C1 will show green patches inside the swamp. The
  re-judgement is owed by the D16 sitting, not by C4.

### 4.9 C4 — the implementation spec (2026-08-25)

Written against the shipped code, not from memory. C1's renderer already emits
`Graphics().poly(points).fill(…)` at both draw sites, which **is** §4.8's
polygon-clipped shape — so adoption is a fill argument, not a new renderer.

**The authored shape.** One more optional profile property beside `color`:

```jsonc
"swamp": { "texture": "pd185", "scale": 0.5, "color": "#2c4028" },
"ash":   { "color": "#4a4a4a" }
```

`texture` names a file in the texture set; `scale` is the per-texture tile
scale (§4.8: the sensitive knob), tuned by eye once and shipped in the table;
`color` is the D14 fallback. **The zone file does not change at all** — a
region still names a profile, so no whitelist, no `zone.go` field, no Tiled
change. C2's authoring surface covers textured profiles the day it ships.

**The resolution rule does not change either**, with one thing to get right:

- `Profile` gains `texture?: string | null` and `scale?: number`. `resolveIn`
  is already generic over `keyof Profile` and needs no edit.
- `buildProfiles` gains a `texture` branch under **the same rule that keeps
  D11 true**: declare the key only when the value is usable (D12's fix, C1) —
  a texture naming a file that is not in the set must leave the key ABSENT, or
  `resolve()` hands back `undefined` and the chain is broken.
- ⚑ **D14's fallback is WITHIN one profile, not across regions.** D0 resolves
  each property independently, so `resolve('texture') ?? resolve('color')`
  would happily take the texture from an outer region and the colour from an
  inner one — two different authors' intent, blended by accident. The fallback
  therefore lives in the **per-region paint lookup** (`regionColor`'s sibling,
  which already reads ONE profile), not in a chain of `resolve()` calls.
  Consumers that ask per-point (audio) are unaffected: they ask for one
  property and take D11's answer.

**Rendering.** Both existing draw sites gain the same three lines:

```ts
const paint = regionPaint(region);          // {texture, matrix} | {color} | null
if (paint === null) { return; }             // authored "nothing here" (C1)
container.addChild(new Graphics().poly(region.points).fill(paint));
```

`regionPaint` replaces `regionColor` and owns D14: texture if its asset
loaded, else the profile's colour, else the default profile's (D11). The
`matrix` is a `Matrix().scale(s, s)` from the profile's `scale`. Pixi **8.4.1**
is installed and its `FillStyle` takes `{texture, matrix}` (verified in
`node_modules/pixi.js/lib/scene/graphics/shared/FillTypes.d.ts`), so this needs
no new dependency and no `TilingSprite`.

⚑ Map parity (§4.7/L2) is the same edit in `MapTerrain.bakeTerrain`, and it
is **not optional**: a textured world with a flat-coloured map is the "wrong
drawing of the world" failure, one chunk later.

**Asset pipeline — the part with the real traps.**

- **Tiles ship as PNG/JPG. NEVER SVG.** `webpack.common.js:86` inlines every
  `.svg` as a base64 data URI *into the JS bundle*; `.png/.jpg` go through
  `type: 'asset'`, which emits a separate file above webpack's 8 KB threshold.
  A 750×750 SVG texture would be pasted into `main.js` as text. (This is a
  sharper statement of §4.8's L3 note: for rasters the URL is bundled, the
  bytes are not.)
- ⛔ **Do NOT register tiles in `GraphicsConfig.groundTextureTypes`.**
  `GroundTextureTypes.ts` preloads every entry through `Preloading`, which
  **blocks boot** until all of them resolve. That is fine for 18 small blobs
  and wrong for 72 tiles (12 zones × 6): a player would stare at the loader
  while zones they are not in download. Load the ACTIVE zone's set in
  `startRendering`, beside `Regions.loadRegions`, via `Assets.load(url)`.
- The spike's `registerGameObjectSVG` crop trap (§4.8) is avoided for free by
  not using that helper at all.
- Source: opengameart's CC0 "100 Seamless Textures" (`pdtextures.zip`).
  ⚑ **The licence file ships with the assets** — CC0 needs no attribution, but
  the pack's provenance belongs in the repo beside the files, not in a commit
  message that nobody reads later.

**Degrade path.** A texture that fails to load is not an error state: the
region paints its `color` (D14) and the world is merely flatter. Nothing
throws, nothing is blank — the same posture D11 sets for every other miss.

**Out of scope for C4, deliberately:** blend bands (D15 — specced in §4.8,
built only if the seam reads badly in-game), the minimap (§11's standing
question), and any per-region texture override (the profile is the unit, D2).

### 4.10 C5 — soft borders, the blend band (designed 2026-08-25)

**Status: RULED 2026-08-25 (D20–D22), scheduled for execution.** All three PO
calls listed at the end are answered: build now (D20), colour regions too
(D21, reversing D5), symmetric band with the authored line as its middle
(D22, no inset).
This is §4.8's *"Soft borders, if wanted"* paragraph turned into a chunk. It
**reopens D15** (which shipped hard edges for C4, deliberately, until the seam
was looked at in game) and **proposes reversing D5** (which ruled hard edges for
colour regions). Neither is a technical question; both are taste, and the design
below is what they are choosing between.

**What it is, in one rule.** A region's own paint ramps to zero across a band at
its edge, so what is beneath — an earlier region in authored order, or D6's base
fill — blends through. ⭐ **A region feathers ITS OWN edge and knows nothing
about its neighbours.** That is the whole economy of this design: a border
between two regions and a border against bare land are the same code, the
blend-width owner question (§11) answers itself (the region being drawn owns
it), and nothing has to compute adjacency — which, for overlapping authored
polygons, would be a genuine geometry problem.

⭐ **Colour regions come free — that is a fact about the code, not a favour.**
Since C4 there is ONE draw path (`RegionPaint.paintRegions` → `regionPaint` →
`Graphics().poly().fill(paint)`), and the ramp lives on the SHAPE's alpha, never
in the fill. A texture fill and a flat colour feather identically; making the
band texture-only would cost an extra branch and buy nothing. ⚑ **It is not free
as a DECISION.** D5 ruled hard edges for colour on the argument that the terrain
blobs already do the edge treatment, the way `Sand` meets land today. Soft
colour borders reverse that argument, and the reversal belongs to the PO.

#### The mechanism

Regions are **arbitrary polygons**, which rules out both techniques already
shipped in this client: `DarknessOverlay`'s cached radial-gradient textures work
because a dark area is a CIRCLE, and `MapFog`'s stamps are axis-aligned
rectangles. Neither generalises to a concave 11-vertex blob.

| shape | how the ramp is made | verdict |
| --- | --- | --- |
| **blurred silhouette** (recommended) | rasterise the polygon white into a low-res RenderTexture, blur it, use it as that region's alpha mask | works for texture AND colour, no geometry maths, arbitrary polygons |
| per-edge gradient quads | one `FillGradient` quad per polygon edge, alpha 1 → 0 across the band | nearly free per frame, but **colour only** — Pixi cannot put a gradient and a texture in one fill — and it seams at every corner where two ramps overlap |
| inset polygon + band ring | offset the polygon inward by the band width, fill the ring with a per-vertex alpha ramp | needs polygon offsetting (self-intersection at reflex vertices) and a custom mesh shader: a dependency and a shader, for a cosmetic band |
| bake the whole layer once | render every region into one world-space texture | ⛔ impossible: the world is 17280 px wide, and any resolution that fits destroys the C4 tile detail this chunk exists to keep |

**The recommended build, against the installed Pixi 8.4.1:**

1. Per region at zone load: `RenderTexture.create({width, height})` over the
   region's bounding box at a **low resolution** — the ramp is low-frequency, so
   this is where the cost goes away. `MapFog` states the same economy for the
   same reason (1024 texels across a 144-unit world).
2. Render the polygon in white into it. ⚑ **A fresh RenderTexture's contents are
   UNDEFINED, not blank** — `MapFog.ts:78-86` documents this trap and clears
   explicitly with `clearColor: [0,0,0,0]`. Skipping it shows GPU garbage.
3. `BlurFilter` over that texture. Blur strength ↔ band width: texels =
   world-unit width × `meter2px` × the texture's resolution.
4. `regionGraphics.mask = new Sprite(rt)`. ⚑ **The mask sprite must be IN the
   scene graph** to have a world transform — `MiniMap.setupTerrain` already
   carries this note for the fog: *"a detached mask silently masks nothing"*.

⚑ **The one real cost question is a MEASUREMENT, not a design call.** Pixi's
`AlphaMaskPipe` is a `FilterEffect`: a live alpha mask costs a render-target
switch plus a filter pass **per masked object, per frame**, sized to that
object's bounds. N regions = N passes. This client is measurably fill-bound
(`Game.renderResolution()`: ~16 ms fixed + ~204 ms/Mpx on a phone), so N
full-region passes is exactly the axis that hurts. Two shapes:

- **(a) live masks** — simplest, N passes per frame, cost scaling with how much
  of the screen the regions cover.
- **(b) flattened once** — render each masked region into a second RenderTexture
  at load and draw a plain Sprite thereafter: zero passes per frame, VRAM
  proportional to region bbox × resolution. ⛔ **`cacheAsTexture` is NOT
  available** — it postdates the installed 8.4.1, so the flatten is hand-rolled
  with `renderer.render({target})`, exactly as `MapFog` and `MapTerrain` already
  do.

Build (a) first because it is smaller, then **measure on a phone-shaped
viewport** before choosing. The trade genuinely inverts with region count and
size, and no document can settle it.

⭐ **MEASURED at execution (2026-08-25, `c5-mask-cost.mjs`)**: at HEAD the one
shipped Fields region spans the whole map, so blend 1.5 makes every frame pay
a FULL-SCREEN AlphaMaskPipe pass - the maximal form of the cost above. On a
phone-shaped viewport (390x844 at DPR 3, headless SwiftShader, ratios only):
median frame 266.7 ms masked vs 250.0 ms unmasked over two runs each, a
**1.07-1.09x ratio for the worst case**. Live masks (shape a) stand; the
flatten (shape b) is a named follow-up with this script as its re-measure,
worth re-running when zones author MANY feathered regions rather than one.

#### Three things to get right

- ⚑ **The blur bleeds OUTWARD as well as inward.** A symmetric blur puts the 50 %
  line ON the authored edge, so a region visually spills half a band past the
  polygon someone drew in Tiled. Either accept that (softest), or **inset the
  silhouette by half the band before blurring**, making the authored polygon the
  region's outer limit. Lean: inset — C2's whole point is that what you draw is
  what you get. ⭐ **RULED AGAINST the lean: D22 chose symmetric** (2026-08-25).
  The tiebreaker was abutting borders: with inset, two regions sharing an edge
  are both near 0 % alpha exactly there, opening a band-wide gutter of base
  fill; symmetric degrades to a mostly-crossfade (roughly 50 % later region,
  25 % earlier, 25 % base bleed). Overlap authoring gives a perfect crossfade
  in either mode, but symmetric is the one that fails soft when an author
  abuts instead. No inset code exists.
- ⚑ **The visual band and LOGICAL membership diverge, on purpose.** `resolve()`
  (D0) is a hard point-in-polygon test and stays one, so a footstep or a music
  cue flips at the exact edge while the ground fades across the band. Nobody can
  hear a half-blended footstep. The alternative — feathering the lookup — would
  make `resolve()` return a blend rather than a value and break D11's totality,
  which is the one guarantee everything else rests on.
- ⚑ **Map parity (§4.7) is not optional, and it is the cheap half.**
  `bakeTerrain` already renders through a RenderTexture, so masked containers
  bake correctly and are paid once, at a resolution (2048 across the world) far
  coarser than any band. ⛔ What must not happen is the world getting bands while
  the map keeps hard edges — §4.7's "wrong drawing of the world", in a form no
  single screenshot catches because each looks plausible alone. Extend the C4
  harness's A/B (`c4-region-texture.mjs`, `AURA_C4_BLOCK_TILES=1`), which exists
  precisely to make that class of divergence visible.

#### The knob

`blend`, in world units, as one more optional profile key beside `texture` and
`scale`, with a shipped default. Per **profile**, not per region — D2 makes the
profile the unit, and a per-region override would be the first thing in this
design to break that. `0` means hard edges, so D5's world stays expressible per
profile instead of becoming unreachable. This is what §11 leaned toward, and
`scale` set the precedent in C4: a look knob is a data edit.

#### Deliberately out of scope

The **wobble** — §4.8's *"optionally wobbled so it does not read as a ruler
edge"*. A blur alone gives a mathematically clean ramp, and whether that reads
as natural or as a soft ruler is exactly the judgement to make in front of the
game, once. Noise displacement is a second decision with its own knob, and it
can be added inside the same mask generation without touching a line of the rest.

**Schema NONE, no zone-file field, no whitelist, no Tiled change** — same as C4.
The authored shape does not move; this is one more presentation property.

#### The three calls this chunk needs

1. **Build it at all?** D15 shipped hard edges *until the seam reads badly in
   game*, and that look has not happened yet — C4's tiles landed the same day.
   Designing it now is free; building it before looking is the thing D15 refused.
   ✅ **ANSWERED (D20, 2026-08-25): build now, by PO direction** - D15 reopened
   by choice, not by a seam observation.
2. **Colour regions too, reversing D5?** Free in code, a taste reversal in
   design. Recommended **yes**: with all 16 profiles textured, colour is now the
   fallback path (D14/D18), and having the fallback change the EDGE TREATMENT as
   well as the fill would make a missing file look like a different world rather
   than a flatter one.
   ✅ **ANSWERED (D21, 2026-08-25): yes, colour too. D5 is REVERSED.**
3. **Does the authored polygon mean the OUTER edge of the band, or its middle?**
   Lean outer, i.e. inset before blurring.
   ✅ **ANSWERED (D22, 2026-08-25): its MIDDLE - symmetric, against the lean.**
   Rationale in the bullet above (the abutting-border gutter).

## 5. The whitelist problem — now THREE, and one is guarded

There are **three parallel whitelists** for the zone format, and only the first
is authoritative (`AuraTiledConvert.test.ts:434`):

| whitelist | on an unknown key | guard |
|---|---|---|
| `backend/pkg/aura/world/zone.go` | hard-fails boot | `DisallowUnknownFields` |
| `aura-convert.js` `serializeZone` (Tiled) | drops it silently | ✅ **the completeness pin** |
| `ZoneModel.getZoneAsJSON()` (in-game editor) | drops it silently | ✅ **since C2** |

⭐ **C2 closed the third row** (2026-08-25). The pin now derives the key set
from BOTH writers over ONE shared fixture, and additionally asserts that the two
emit the *same* set — agreeing with `zone.go` separately is not enough when both
land in the same file. Reproduced red first by deleting `regions` from
`getZoneAsJSON`: it named all three lost keys and pointed at the fix.

⚑ **`plan-release-map.md` said "TWO touch points are mandatory" and that was
wrong** — the Tiled extension shipped 2026-08-22/23, adding a third. Corrected
in C2 in **both** places that carried the claim (§8.2 and §6, in different
words), along with §8.2's "only the Tiled one is guarded".

This is the failure that ate `spawn.level` once already. Adding `Regions` to
`zone.go` turned the **tiled C5 completeness pin red** — by design; the pin
scrapes `zone.go`'s `json:` tags and asserts the converter round-trips exactly
that key set. This plan was its first customer. C1 taught `ZoneModel`
`regions`; **C2 brought `ZoneModel` under the pin itself**, so the next field
cannot be taught to one writer only. ⚑ The pin makes forgetting a touch point
loud; it does not make one optional.

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
- **C3 — the look sitting** (content-adjacent; **D16: one sitting, not two**).
  The profile set for the zones in the outline — swamp, desert, ash, dead
  forest, stone — and **per profile, whether it is a colour or a texture**
  (D13). Merged with what used to be C4's adoption call because deciding a
  palette twice is exactly the waste D16 exists to avoid: a colour chosen
  without knowing whether that profile ends up textured is a colour chosen for
  nothing. Also owns the **`Land`-blob re-judgement** (§4.8) — re-tint, delete,
  or leave — which C1 already makes visible. A taste decision; needs the PO in
  front of the game, not a document.
- **C4 — ground texture, end to end** (D13; spec in §4.9). `texture` + `scale`
  in the profile table and `buildProfiles` (declaring only usable values, D12's
  rule) · `regionPaint` replacing `regionColor`, owning D14's within-profile
  fallback · the fill argument at BOTH draw sites (`Game.ts` + the
  `MapTerrain` bake — §4.7 is not optional) · per-zone `Assets.load` at
  `startRendering`, ⛔ never through `GroundTextureTypes`' boot-blocking
  preload · the CC0 pack + its licence file in the repo. Hard edges (D15);
  no blend bands. Authoring surface is C2's, unchanged.

- **C5 — soft borders, the blend band** (designed 2026-08-25; spec in §4.10;
  **RULED + SCHEDULED same day: D20 build, D21 colour too, D22 symmetric**).
  A per-region alpha ramp at the
  polygon edge, so a region blends into whatever is under it: a blurred
  silhouette in a low-res RenderTexture used as that region's mask · a `blend`
  width per profile beside `texture`/`scale`, `0` meaning hard edges · the same
  masks in the `MapTerrain` bake, because §4.7 does not stop being true for
  edges · a measurement deciding live masks vs flattening once. Covers colour
  AND textured regions through the one draw path (D21 reversed D5); the
  authored line is the band's middle, no inset (D22).
  The wobble is deliberately not in it. Schema NONE.
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

⚑ **The title applies to D4–D10 only.** D12 (2026-08-24) and D13–D16
(2026-08-25) are **PO rulings**, taken with an explicit choice prompt, and are
appended here to keep the D-numbers one running sequence rather than splitting
the ledger across two sections. Nothing from D12 on is a proposal to be vetoed
in passing — each would have to be re-opened as the ruling it is.

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
  ⭐ **REVERSED by D21 (2026-08-25, PO ruling, the C5 calls):** colour regions
  feather like textured ones; `blend: 0` per profile is how a hard edge is
  still authored.
- **D6 — the base `LAND_COLOR` fill stays.** Regions paint over it; a zone need
  not be fully covered.
- **D7 — the profile table lives in `Theme.ts`**, not `Graphics.ts` (which owns
  *assets*; these are tokens). ⚑ **SUPERSEDED by D12 (2026-08-24)** — the
  *client* half is unchanged (the table is client-owned, `Graphics.ts` is still
  wrong), but the table itself is now JSON beside `Theme.ts` rather than TS
  inside it, because a `.ts` table is unreadable to the palette generator.
- **D8 — unknown profile names are a Tiled-side error, not a boot error.**
- **D9 — no `regions` support in the in-game editor panel**, not even read-only.
  Round-trip only (D3/L1).
- **D10 — one profile table, not one per consumer.** Color, steps and music
  live on the same object even though different plans build them.

- **D12 (2026-08-24, PO) — the profile table is ONE JSON file, at
  `frontend/src/client-data/profiles.json`.** The client imports it; the Tiled
  palette generator `readFileSync`s it and emits the `AuraProfile` enum from it.

  ⚑ **The gap this closes was not visible in the design.** D2 says the profile
  table lives once in the client and D7 put it in `Theme.ts`; C2 wants a
  *generated* `Profile` enum (tiled D7: palettes are generated, never
  hand-maintained). But `tools/tiled/generate-palette.mjs` is a Node ESM script
  that reads `api/` JSON and `require()`s `aura-convert.js` — **it cannot read a
  `.ts` file at all**. Left unnoticed, C2 would have quietly hand-listed the
  profile names in the generator, which is the exact drift that script's own
  header exists to forbid.

  Rejected alternatives: **`aura-convert.js` owns it** (the generator already
  `require()`s it, but then a *rendering token* would live in an ES5 file under
  `tools/` and the client would import upward out of the app — backwards); **a
  hand-kept enum in the generator** (cheapest to write, and it drifts the first
  time somebody adds a profile: it renders in game and is unofferable in Tiled).

  ⛔ **NOT `api/zones/profiles.json`** — see L8. It was the first choice and it
  hard-fails boot.

  ⚑ Consequence worth stating: **profile colours become a data edit, not a code
  edit**, which is what C3 (the palette sitting) actually wants. `Theme.ts` keeps
  `LAND_COLOR` — that is still the *default* profile's colour (§4.2 step 2) and
  it has a LESS twin the profile colours do not (§4.5).

  ⭐ **This ruling is what makes D13's textures nearly free**, the same way D2
  made audio free: `texture` and `scale` are two more keys in a file that is
  already the single source for both the client and Tiled.

- **D13 (2026-08-25, PO) — ground textures are ADOPTED: texture OR colour, per
  profile.** A profile declares `color`, or `texture`, or both (D14). Flat
  colour stays **first-class**, not a stepping stone — "ash" can be a flat grey
  forever while "swamp" is painted. Chosen over *textures everywhere* (which
  makes the flat path dead code and forces an art decision for every profile
  before any can ship) and over *spec-but-don't-rule* (which is what forces the
  palette to be chosen twice — D16). ⚑ The authored zone shape does not change
  at all: a region names a profile, so **no whitelist, no `zone.go` field, no
  Tiled change**, and C2 covers textured profiles the day it ships. Spec: §4.9.

- **D14 (2026-08-25, PO) — a profile's `color` under a `texture` is the
  FALLBACK, never a tint.** Texture loads → paint texture; texture missing →
  paint the profile's colour; neither → the default profile (D11, unchanged).
  Chosen over *tint* (one grey tile serving as ash/slate/granite is real
  economy, but it gives one key two meanings and leaves "tinted but missing"
  undefined) and over *mutually exclusive* (which throws away the safety net
  D11 exists to provide). ⚑ **The fallback is WITHIN one profile.** D0 resolves
  each property independently, so a naïve `resolve('texture') ?? resolve('color')`
  can take the texture from an outer region and the colour from an inner one —
  see §4.9, where the fallback lives in the per-region paint lookup instead.

- **D15 (2026-08-25, PO) — C4 ships HARD EDGES; the blend band is specced, not
  built.** D5 stands for colour AND texture through C4. The terrain blobs keep
  doing edge treatment, as `Sand` meets land today. The spike's one-off
  alpha-gradient band (§4.8, D5's evidence note) is written down and stays
  unbuilt until the seam actually reads badly in-game — which is a judgement
  nobody can make from a document. Keeps C4 small and leaves the blend-width
  ownership question (§11) genuinely open rather than answered on spec.

- **D16 (2026-08-25, PO) — C3 and C4's look decisions are ONE sitting.** The
  profile set, each profile's colour-or-texture, and the `Land`-blob
  re-judgement are decided together in front of the running game. A palette
  chosen before knowing which profiles end up textured is a palette chosen
  twice. C4's *implementation* is still its own execution chunk afterwards.

- **D17 (2026-08-25, PO, the C3 sitting) — the profile set is SIXTEEN: eight
  families x two.** `Fields`/`Suburbs` · `Forest`/`Swamp` · `Coastal Cliff`/`Coast`
  · `Magic Forest`/`Dead Magic Forest` · `Ashen Fields`/`Volcano` ·
  `City`/`Derelict Fortress` · `Desert`/`Wasteland` · `Mountains`/`Ice`. Named in
  **Title Case with spaces**, matching the shipped `terrain.type` convention
  ("Dark Green Grass 1") — these names are read by a human in a dropdown.
  Authored order is the dropdown order, base then variation.

  ⚑ **Names are the only sticky part of this file.** Values are free forever
  (data, not code, nothing pins them); a rename means fixing every region that
  names the profile. Proven the same session: renaming the three placeholders
  turned the save-time check red on the PO's own three drawn regions, by name,
  with the object index — which is the check working, and is why the cost is
  worth stating rather than hiding.

  ⭐ **A profile is a MATERIAL, not a PLACE.** Many separate forests share
  `Forest`. This kills the idea (floated and withdrawn the same session) that a
  profile name could serve as the quest-addressable identity — see §11.

- **D18 (2026-08-25, PO) — EVERY profile is intended to carry a texture
  eventually.** So D13's colour-or-texture split stays in the *code* but not in
  the *content*: the 16 shipped colours are D14's fallback and D11's default,
  never a deliberate final look. ⚑ This does **not** make the colour path dead
  code — it is still what paints when a texture fails to load, and still what
  an unknown profile resolves to.

  ⚑ **The fork this opens, to settle before C4**: the PO's set is 8 families x
  2, and nearly every variation was described as *"a darker variation of"* its
  base — which is a **tint** relationship, and D14 ruled colour-under-texture is
  a fallback, NEVER a tint. Two ways: sixteen independent textures (works
  today, no design change, chosen for now), or a **new `tint` key** later —
  which sidesteps D14's actual objection, since that objection was to giving
  ONE key two meanings, not to tinting as such. ⚑ Note the variations are not
  uniform anyway (`Ice` is *brighter*, `Coast` is a *variant*), so one tint
  knob would not cover the set. Deliberately not decided on spec.

- **D19 (2026-08-25, PO) — the `Land` blobs are LEFT ALONE.** L11's re-judgement
  is answered: "doesn't matter". No re-tint, no deletion. ⚑ Measured correction
  while closing it: there are **74**, not the 75 L11 claimed (§4.8 said 74; the
  file says 74).

- **D20 (2026-08-25, PO) — C5 is BUILT, by direction.** D15's trigger ("until
  the seam reads badly in game") never fired; the PO scheduled the chunk
  anyway. D15's hard-edge world stays expressible per profile via `blend: 0`.

- **D21 (2026-08-25, PO) — colour regions feather too; D5 is REVERSED.** One
  rule for every region: any profile with `blend > 0` feathers, textured or
  not. The deciding argument: with all 16 profiles textured (D18), colour is
  the fallback path (D14), and a fallback that changed the edge treatment as
  well as the fill would make a missing file look like a different world
  rather than a flatter one.

- **D22 (2026-08-25, PO) — the authored polygon is the band's MIDDLE.**
  Symmetric blur, no inset; a region visually spills half a band past the
  drawn line, accepted. Chosen against §4.10's inset lean because of abutting
  borders: inset puts both neighbours near 0 % alpha exactly at a shared
  edge, opening a band-wide gutter of base fill, while symmetric degrades to
  a mostly-crossfade with roughly a quarter of base bleed. ⭐ The clean
  region-to-region border in EITHER mode is authored by OVERLAP, the
  system's native idiom (D0 last-wins): the later region's band then ramps
  over the earlier one at full opacity, a perfect crossfade with zero base
  bleed. Abutment is the degraded case, and symmetric is the mode that
  fails soft there.

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
- **L8 — ⛔ `api/zones/` is a directory of ZONES, and every `.json` in it is
  one.** Dropping a non-zone JSON there (the obvious home for D12's profile
  table) breaks the game two ways, one of them instantly:
  - `world.LoadZoneFS` walks the directory and treats **every** `.json` stem as
    a candidate zone. Today there is exactly one, so `-zone` is never passed;
    add a second stem and boot dies with *"multiple zones found (profiles,
    world); select one with -zone"* on every dev machine and the server.
  - `GroundTextureManager.ts:144`'s `require.context('…/api/zones', …)` bundles
    it into `zonesByStem` as a zone named `profiles`.

  Found on the 2026-08-24 readiness pass, before anything was written. Hence
  D12's path outside `api/`. ⚑ The same trap catches any future
  "small data file about zones" — it belongs beside its consumer, not beside
  the zone.
- **L9 — ⛔ a ground texture must never be an SVG** (C4). `webpack.common.js:86`
  matches `/\.svg$/` with `type: 'asset/inline'` and inlines it as a base64
  data URI **into the JS bundle**; `.png/.jpg` fall to `type: 'asset'`, which
  emits a separate file above webpack's 8 KB threshold. Every existing ground
  blob is an SVG *because they are tiny vectors*; a 750×750 painterly tile is
  neither. Ship tiles as PNG/JPG.
- **L10 — ⛔ do NOT register C4's tiles in `GraphicsConfig.groundTextureTypes`.**
  `GroundTextureTypes.ts` walks that map at import and preloads every entry
  through `Preloading`, which **blocks boot** until all resolve. Correct for 18
  small blobs; at 12 zones × 6 tiles it means staring at a loader while zones
  you are not in download. The active zone's set loads in `startRendering`,
  beside `Regions.loadRegions`.
- **L11 — the `Land` blobs.** ✅ **ANSWERED by D19 (2026-08-25): left alone.**
  **74** terrain pieces (not 75) are filled with the exact `LAND_COLOR`, so over
  any region paint they read as flat green patches. The D16 sitting looked and
  ruled it does not matter. Kept as a landmine only so the next person to
  notice the patches knows it was seen and accepted, not missed.

- **L12 — an alpha mask is a FILTER PASS, per object, per frame** (C5). Pixi's
  `AlphaMaskPipe` extends `FilterEffect`, so N masked regions are N
  render-target switches every frame, each sized to its region's bounds — on a
  client whose measured frame time is ~204 ms/Mpx on a phone. It is why §4.10
  makes live-mask-vs-flatten a measurement rather than a preference. ⛔ And
  `cacheAsTexture` is **not** in the installed 8.4.1: flattening is hand-rolled
  with `renderer.render({target})`, as `MapFog` and `MapTerrain` already do.
- **L13 — a fresh `RenderTexture`'s contents are UNDEFINED, not blank.**
  Documented at `MapFog.ts:78-86` and re-found by every new consumer: clear it
  explicitly with `clearColor: [0,0,0,0]` or the first frame shows GPU garbage.
  ⚑ And a mask sprite must be IN the scene graph to have a world transform —
  a detached mask silently masks nothing (`MiniMap.setupTerrain`).

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
- ~~**Textured profiles at all?**~~ **ANSWERED 2026-08-25 — D13/D14.** Adopted:
  texture or colour per profile; `color` under a texture is the fallback, not a
  tint.
- ~~**If textures get soft borders: who owns the blend width?**~~ **DESIGNED
  2026-08-25 — §4.10 / C5.** Per profile: `blend` in world units beside
  `texture` and `scale`, `0` meaning hard edges. It falls out of the design
  rather than being chosen, because a region feathers its OWN edge and never
  consults a neighbour. ⚑ Still **unscheduled**: D15 shipped hard edges until
  the seam reads badly in game, and that look has not happened yet. §4.10 lists
  the three calls it needs, the sharpest being whether COLOUR regions get bands
  too — free in code, a reversal of D5 in design.
- **Which textures, and at what tile scale?** The D16 sitting picks from the
  CC0 pack (§4.8's shortlist by role) and tunes `scale` by eye. ⚑ Scale is the
  knob that decides whether a tile reads as *ground* or as *wallpaper*; it
  cannot be chosen from a document.
- **Quest-readable regions — a possibility, not a requirement** (PO 2026-08-24,
  quest-gap conversation): a future "entered region" quest objective would ride
  this primitive and is the natural substitute for a location-objective verb
  ("reach the shrine"). To be taken into the plan or explicitly left out at its
  planning session — it is NOT a precondition of any chunk. The one thing to
  decide then: whether regions get stable, nameable ids the quest ledger could
  reference (a pure presentation feature has no reason to guarantee that on its
  own). Nothing else about the design changes either way.

  ⭐ **Sharpened by the C3 sitting (2026-08-25), and one wrong answer ruled
  out.** The PO asked directly: *does a quest-named region need a unique
  profile?* **No — and it must not.** That would force a throwaway profile per
  quest location, inverting what a profile is. D17 settles why: a profile is a
  **material**, many places share one, so the profile name can never be the
  identity. An id (or an area name) is therefore genuinely needed once quests
  want locations — it is only the SHAPE that is still open, and it is a real
  fork: **is the addressable thing one polygon, or a NAMED AREA that several
  polygons make up?** A swamp drawn as four overlapping blobs is one place, not
  four. Picking the wrong one means migrating authored content later.
  ⚑ Timing is genuinely free: the field is additive, and since C2 all three
  whitelists are pinned, so adding it later costs exactly what adding it now
  costs. There is no pre-build argument — only the quest design can answer the
  fork.

## 12. Chunk ledgers

### C2 — the authoring surface ✅ 2026-08-25, `97b27099`

**What shipped.** Drawing a region in Tiled is now a normal authoring action:
the `regions` layer takes a polygon, the Properties panel offers a **generated
`AuraProfile` dropdown**, and the save refuses a name the client could not
resolve. Plus the pin work C1 left owed.

- **`generate-palette.mjs` reads `profiles.json`.** `readProfiles()` skips
  `_`-prefixed documentation keys exactly as `Regions.buildProfiles` does
  client-side, and emits `enumType('AuraProfile', [PROFILE_UNSET, …])` plus
  `classType('AuraRegion', …, [member('profile', …)])`. ⭐ **D12 is the whole
  reason this is four lines**: the profile table is JSON, so the generator can
  read the same file the client imports. Had it stayed in `Theme.ts`, this
  chunk would have hand-listed the names in the generator — the exact drift
  that script's header forbids.
- **`AuraRegion` carries a member; `AuraProp` still must not.** Same rule C6
  settled, restated in the generator: a class member is safe exactly when its
  default is a value the converter maps back to "not authored".
  `PROFILE_UNSET = '(pick a profile)'` is that value — not a profile name, and
  refused at save — so a Tiled that drops a default-valued property and a Tiled
  that keeps it reach the same answer. `blocksMovement` has no such spare
  value, which is why `AuraProp` is still memberless.
- **Three save-time messages, not one.** "profile must not be empty", "no
  profile chosen" and `unknown profile "x" — the profiles are: …` are different
  mistakes with different fixes; the unknown-name message names the file to edit
  and the command to re-run. Pinned that none is reported as another.
- **The unknown-profile check is C2's, and only C2 could have it.** `zone.go`
  accepts any non-empty name (D8) and the client absorbs a miss (D11), so
  before the generated enum existed there was no vocabulary anywhere to check
  against. C1's test asserting an unknown name is *accepted* is inverted here,
  deliberately, with the reasoning kept in place.
- **⭐ The completeness pin now covers BOTH writers** (the item C1 deferred).
  One shared `EVERY_KEY` fixture, both key sets derived from behaviour, and a
  third assertion the plan did not ask for but the failure mode demands: **the
  two writers must emit the same key set**, since both land in the same file.
  Proven red first by deleting `regions` from `getZoneAsJSON` — three tests
  went red naming `profile, points, regions`.
- **Two new `verify.sh` legs, 9/9 green against the real binary.** A zone
  carrying **every** profile the palette offers round-trips byte-identically —
  which is the only way to prove the enum INDEX Tiled hands back decodes to the
  right *name* (a wrong index would land on a different profile, not an error).
  And an unknown profile is refused with nothing written. ⚑ vitest cannot cover
  either: it drives the pure converter, which never meets Tiled's `MapObject`.
- **Docs.** `manual-tiled-editor.md` gains a **Regions** section (seven layers
  now, not six), quick-reference rows and the profiles.json half of §6;
  `manual-zone-editor.md` gains §5d "carried, not edited here" with the
  `spawn.level`/`prop.scale` history and the pin that now prevents a third.
  `plan-release-map.md`'s touch-point count corrected in both places it
  appeared (§8.2 *and* §6, which said it in different words), along with
  §8.2's now-false "only the Tiled one is guarded".

**Schema impact: NONE**, at every layer — no migration, no wire field, no table,
and **not one byte of the zone format changed**: C2 is authoring surface and
tests over C1's shipped field.

⚑ **Not in this chunk, and not a gap**: the C1 worked-example region was
reverted out of `world.json` with the playground edits (`993b714a`), so the
committed world carries **no region** today. Nothing is broken by that — the
verify legs author their own — but the first thing the D16 sitting will want is
a region back in the file.

✅ **The one human check PASSED, PO 2026-08-25: "the dropdown renders".**
A project's custom types do not load headlessly (`tiled.project` is null under
`--export-map`), so *"the profile dropdown renders in the Properties panel"*
was the one claim no test could make. It was checked by hand and holds — the
generated `AuraProfile` enum reaches the Properties panel as a real dropdown.
**C2 has nothing outstanding.**

**Verified:** vitest **494/494** (27 files, +7 over C1's 487) · `tsc --noEmit` clean ·
`bash tools/tiled/verify.sh` **9/9** against the real Tiled binary, incl. the
two new region legs and world.json still byte-identical · palette regenerated
and idempotent · `go build ./...` + `go test -count=1 ./...` green (untouched
by this chunk, run to confirm exactly that).

**Next:** **C3 — the look sitting** (D16), which needs the PO in front of the
running game, not a document.

### C3 — the look sitting (D16) ✅ 2026-08-25, RULED, `97b27099`

Held in front of the running game, as D16 required. The PO had already drawn
three regions into `world.json` and confirmed **"areas render in game as I
would expect"** — so C1's renderer needed no verdict, and the sitting was purely
the look decisions. Output is **D17 (the set) · D18 (all textured) · D19 (Land
blobs left)**; the reasoning for each is in §9 beside the other rulings.

- **`profiles.json` now carries the 16.** Placeholder colours, chosen as a
  starting palette to be judged in game and tuned in one file. ⚑ Every value is
  free forever; only the NAMES are sticky (D17).
- **The rename cost was paid, and demonstrated the check.** The three drawn
  regions named `sand`/`ash`/`swamp`; C2's save-time check turned them red by
  name the instant the palette changed under them. Migrated
  `sand → Desert`, `ash → Ashen Fields`, `swamp → Swamp` **through
  `serializeZone` itself**, so the file stayed canonical rather than
  hand-edited. Nothing was lost - the whole `regions` array is still
  uncommitted work, and the diff is +109/-0.
- **One test stopped hand-typing a profile.** The save-time validation fixture
  took `'swamp'` as a literal, which since C2 means *"go red when somebody
  renames a profile, and look like a converter bug"*. It now derives from
  `content.PROFILE_NAMES` — the same derive-from-behaviour rule the pin uses.
- **Incidentally proven**: the 16 include names WITH SPACES ("Coastal Cliff",
  "Dead Magic Forest"), and `verify.sh`'s region leg round-trips **every**
  profile through the real Tiled binary, so the enum-INDEX decode survives them.

**Schema impact: NONE.** A content + data change; the only code touched is one
test fixture.

**Verified:** vitest **494/494** · tsc clean · `verify.sh` **9/9**, world.json
byte-identical through real Tiled at its new size (264,949 bytes).

⏸ **Colour tuning DEFERRED by PO choice 2026-08-25** ("much later"). The 16
placeholder colours ship as they are. ⚑ This blocks nothing: under D18 every
profile is meant to end up textured, so these values are D14's fallback and
D11's default rather than the shipped look — and tuning them is a one-file
edit whenever it happens, frontend rebuild only. **C3 has nothing outstanding.**

**Next:** **C4 — ground texture** (§4.9, a complete spec). ⚑ Settle D18's
tint-vs-sixteen-textures fork first; it is cheap either way but it decides how
many textures get picked.

### C5 — soft borders, the blend band ✅ 2026-08-25, `4937a977`

**What shipped.** A region's paint now ramps to zero across a band at its own
edge, blending into whatever is beneath (an earlier region, or D6's base
fill): a blurred-silhouette alpha mask in a low-res RenderTexture, built per
region at paint time inside the ONE shared draw path, so the world and the
full-map bake feather identically (§4.7). Executed the same day the spec was
ruled; the three §4.10 calls landed as **D20** (build now, D15 reopened by PO
direction, not by a seam observation), **D21** (colour regions feather too,
**D5 REVERSED**; `blend: 0` keeps a hard edge authorable per profile) and
**D22** (the authored polygon is the band's MIDDLE - symmetric, no inset,
chosen for how abutting borders degrade).

- **`blend` is one more optional profile key** (world units) beside
  `texture`/`scale`; `DEFAULT_PROFILE.blend = 0`, so the feature costs exactly
  nothing until authored. ⛔ `parseBlend` deliberately does NOT copy
  `parseScale`'s `<= 0` rejection: **0 is a VALID authored value** - dropping
  it would leave the key absent and an inner `blend: 0` region inside an outer
  feathered one would feather anyway. `regionBlend()` is the pure per-region
  lookup (own profile, never a `resolve()` chain), and `resolve()` itself is
  untouched: logical membership stays a hard point-in-polygon test, exactly as
  §4.10's second "get right" demands.
- **⭐ The one real implementation finding: a masked polygon cannot feather its
  own boundary outward.** Masked alpha is content × mask, and the content is 0
  outside the polygon, so the outward half of D22's symmetric ramp multiplies
  nothing and the edge ends in a 50 %-opacity STEP on the authored line. A
  feathered region therefore paints a RECT over the mask's footprint and takes
  its shape from the mask alone; `blend: 0` keeps the exact C4 `poly().fill()`
  path. Tile phase is unchanged (the fill matrix is texture→local).
- **Mask RT lifetime is explicit at both sites**, because the shipped destroy
  discipline pointed the wrong way for them: the callers' bare
  `child.destroy()` / `texture: false` is right for SHARED tiles and would
  strand a per-pass mask forever. `paintRegions` returns the RTs it created;
  `Game.regionMasks` frees the previous pass's on every repaint (the
  tiles-landed second pass is the leak that would have shipped), and
  `bakeTerrain` frees its set right after `scratch.destroy`.
- **The numbers**: 6 mask texels per world unit (3 on mobile, the
  `fogWidth`/`bakeWidth` halving), texture capped at 2048 with ONE density
  variable feeding both RT size and blur strength (a capped region gets a
  coarser band, never a wider one); strength = half the band in texels;
  footprint margin 1.5 × band (half a band of real outward bleed + the
  BlurFilter's own 2×strength padding). Shipped Fields mask: 891 × 459 texels
  over a 17820 × 9180 px footprint.
- **⭐ §4.10's cost measurement RAN** (`c5-mask-cost.mjs`, kept in the verify
  suite): at HEAD the one shipped region spans the whole map, so blend 1.5 is
  the WORST case - a full-screen AlphaMaskPipe pass every frame. Phone-shaped
  viewport (390×844 @ DPR 3, ratios only): median 266.7 ms masked vs 250.0 ms
  unmasked, **1.07-1.09x**. Live masks (shape a) stand; the flatten (shape b)
  is a named follow-up with this script as its re-measure, worth re-running
  when zones author MANY feathered regions.
- **Harness**: `c4-region-texture.mjs` gained leg 5 - it derives an interior
  edge with non-zero blend from `world.json` + `profiles.json`, samples a
  pixel run across it in the world AND the open map, and classifies transition
  width; it fails loudly on world-vs-map divergence. ⚑ **INCONCLUSIVE at HEAD
  by construction**: the one shipped region has no interior edge to sample. It
  arms itself the moment a second region (or any interior feathered edge)
  exists - do not read that row as a flake. The band itself was proven at
  blend 20 by eye in the world AND by decoding the map bake's pixel ramp
  (~10.8 world units of inward ramp at fit scale = the inward half of a
  20-unit band), plus a structural in-page check (exactly one masked region
  Graphics, mask sprite in the scene graph).
- **Camera-clamp finding**: the client clamps the camera to world bounds, so
  for a full-map region the outward half of the band is never on screen; the
  spill-past-the-line question is real only for interior regions.

**Schema impact: NONE** at every layer - no zone-file field, no whitelist, no
Tiled change, no Go change, no migration.

**Verified:** vitest **515/515** (27 files, +10; ⚑ CLAUDE.md's recorded 494
was stale - the pre-chunk baseline measured 505) · `tsc --noEmit` clean · prod
build clean (3 pre-existing size warnings) · `c4-region-texture.mjs` green
(4 PASS + the designed INCONCLUSIVE) · `c1-world-map.mjs` **12/12** ·
`go test` untouched (no backend change). Implementation by an Opus 5 agent,
reviewed line-by-line in-session; harness residue cleaned (10 accounts,
server stopped first).

⏸ **Open, deliberately**: the look knobs (1.5 width, texel density) are
placeholders for the look sitting; `Forest`/`Ice` still author no tile; the
wobble stays out of scope (its own decision, addable inside the same mask
generation).

**Next:** the look sitting in front of the running game - ⚑ at HEAD the PO
sees almost nothing (no interior seam exists in shipped content; the only
visible effect at blend 1.5 is a subtle fade at the world border). Draw a
second region in Tiled or bump one profile's `blend` to judge the band.
