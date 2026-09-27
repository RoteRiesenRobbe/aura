# Ground noise — wobbly blend edges (W1) and texture overlays (W2)

Designed and W1 built 2026-09-23 (PO session). **W1 SHIPPED, look sitting owed · W1b + W1c SHIPPED 2026-09-26 `a4ad7f0c`, look sitting owed
(§6, §7) · W2 BUILT 2026-09-26 `[uncommitted]`, look sitting owed (§9).**

## 1. Why

**W1.** Every feathered surface (region, polygon, path, outline, fog bank) gets its soft edge from `buildBlendMask`
(`RegionPaint.ts`): the silhouette is rasterised white, Gaussian-blurred and hung as an alpha mask. The ramp is
mathematically clean and identical all along the edge. On a wide biome border that reads as a fade. On a road it
reads as a **soft ruler**, and the PO's words were *"the side of the path looks washed"*.

`plan-region-primitive.md` §4.8 predicted this ("optionally wobbled so it does not read as a ruler edge"). C5 left
the wobble out of scope and noted it was "addable inside the same mask generation". W1 is that addition.

**W2.** The second PO idea is *"randomly blend two overlaying textures, e.g. stones showing in a grassy patch"*. It
uses the same machinery: a world-keyed noise field thresholded into an alpha mask and baked once. It is the same
feature in a second mode, so it lives here as the next chunk.

## 2. Rulings (PO, 2026-09-23)

- **D1 — W1 first, W2 after W1 is judged in-game.** The two are designed together and built apart.
- **D2 — `wobble`, 0…1, per terrain profile; AMENDED the same day to add `wobbleSize`.** The first ruling was one
  knob, with the grain always derived from the band (`GRAIN_PER_BAND` = ½ the band). Once the coupling was spelled
  out, the PO asked for the separate setting: a wider band meant bigger lumps whether you wanted them or not.
  - `wobbleSize` is the blotch size in WORLD UNITS.
  - Absent (or dropped: 0, negative, non-finite), the grain is derived from the band exactly as before. A profile that
    omits it looks the same as under the original ruling.
  - ⚑ It never widens the band. The wander still lives inside `blend`. `wobbleSize` changes the lump size, never how
    far the edge can travel.
  - ⛔ **SUPERSEDED by D3 (2026-09-26)**: once W1b ships, the wander no longer lives inside `blend`.
- **D3 — wobble and blend are SEPARATE settings (PO, 2026-09-26).** *"A wobble would not always have to blend at the
  same time."* W1 coupled them twice: `blend` was both the softness AND the room to wander, and `wobble` was both the
  wander AND the crispness. W1b (§6) gives each look one knob, and adds the roughness that W1 hardcoded.

## 3. W1 — the design as built

**Bake-time, never per-frame.** The noise pass runs ONCE, when the mask is built, and its output is still just the
mask texture. `addFeathered`, `paintRibbon`, the drifting `TilingSprite` branch and `paintAir` are all untouched.
A per-frame shader on the surface was rejected: two per-layer filter/mask traps are on record here (region-primitive
L7, and the masked-erase trap in `cutHole`), and the mask was already a zone-load bake.

For a surface whose profile authors `wobble > 0`:

1. Silhouette → blur → RT1, exactly as C5.
2. A footprint-sized quad `Mesh` with a custom GLSL shader (`MaskNoise.ts`) samples RT1 into a new RT2:
   - `m` = the blurred alpha. It is 0.5 on the authored line (D22).
   - `n` = 3-octave value-noise fbm. It is keyed to **world px** and stretched back to fill 0…1.
   - `v = m + wobble·(n − ½)·4m(1 − m)`. The `4m(1−m)` bump is 1 on the line and 0 where the ramp is flat, so
     noise can never lift a far-outside texel and leave a blotch floating at the footprint's rectangular edge.
   - `a = clamp((v − ½)/(2s) + ½)`, with `s = mix(½, 0.06, wobble)`. At wobble 0 this is the identity, so the knob
     is continuous from the clean ramp.
3. RT1 is freed and RT2 is the mask. The ownership contract is unchanged: the caller frees one texture.

**Why world-keyed noise matters.** Two abutting surfaces wobble in agreement. The full-screen map bakes through the
same `paintTerrainSurfaces`, so it draws the SAME edge, and region-primitive L2's map parity holds with no extra code.
On average the 50 % line still sits on the authored one (D22).

**Density.** Noise needs about 3 texels per grain, and C5's 6 texels/unit cannot draw a narrow road's grain. A
wobbly mask is therefore baked at `max(base, 3 / grain)`, capped at `WOBBLE_MAX_TEXELS_PER_UNIT` (16 desktop, 8 mobile)
and then at the existing 2048-texel side. **One density variable still feeds the size, the blur strength and the
grain**, and the grain is re-derived after the cap. That rule lives in `maskDensity` and is pure and pinned.

**Degrade path.** The shader is GLSL only. Both `Application.init` calls take Pixi 8's default WebGL preference. On any
other renderer the pass returns `null`, warns once, and the surface keeps its clean ramp (D11's posture).

**`wobble: 0` or absent** skips step 2 entirely: C5's exact density, no extra pass, zero cost.

**Where it reaches.** Every `buildBlendMask` caller passes its own profile's `wobbleOf(...)` (both keys): regions, polygons,
outlines (the OUTLINE's profile), aligned ribbons, stroked paths, and atmospheres (`ATMOSPHERE_PROFILES`, so a fog
bank can wobble too). `cutHole` passes 0, because a clearing names no profile (A4 L7).

**Content.** `Road` authors `wobble: 0.6` for the look sitting. Every other profile is unchanged.

**Schema: DB / wire / conf / zone format — ALL NONE.** `wobble` is a client-only presentation key, the same class as
`blend`. `generate-palette.mjs` reads profile names only, so there is no Tiled change.

### 3.1 Traps recorded

- ⚑ **The Pixi 8 mesh-shader contract.** The GLSL must name `aPosition`, `aUV`, `uProjectionMatrix`,
  `uWorldTransformMatrix` and `uTransformMatrix`. If it names anything else it draws NOTHING, and no error is raised.
- ⚑ **The mask filter reads `.r` AND `.a`.** The shader writes premultiplied white (`vec4(a)`), exactly what the
  blurred silhouette was.
- ⚑ **`Shader.destroy(false)`.** The GL program is `GlProgram.from`-cached and shared by every mask in the zone.

## 4. W1 verification (2026-09-23)

- vitest **1035/1035** (after the `wobbleSize` amendment), including the new pins:
  - `Regions.test.ts`: `wobble` parse (0 kept, out-of-range/NaN/string/null dropped); `regionWobble` falls back to 0.
  - `MaskNoise.test.ts`: `maskDensity` returns C5's exact density at wobble 0, raises it for narrow bands, respects
    both caps, and keeps the grain ≥ 3 texels. An authored `wobbleSize` replaces the derived grain, still gets its
    3 texels, and is inert at wobble 0.
- `tsc --noEmit` clean · prod build clean (3 pre-existing size warnings).
- **Real browser, A/B at the same venue** (the Road by the bridge, ≈ −157.5, −52):
  - With `wobble 0` the road sides are a uniform soft smear.
  - With `wobble 0.6` they are an irregular, crisper worn edge.
  - Zero shader, GL or page errors.
- ⚑ **OWED:**
  - The PO look sitting (0.3 / 0.6 / 0.9 on Road; one wide region border, e.g. a `blend 1.5` biome edge).
  - The map view has not been checked by eye. It matches the world by construction (same bake, world-keyed noise).
  - VRAM for long diagonal wobbly paths is unmeasured. The cap bounds it at 2048² per mask.

## 5. W2 — texture overlay (designed; BUILT 2026-09-26, ledger §9)

- **Key:** `"overlay": { "profile": "<Name>", "coverage": 0…1 }` on a terrain profile.
  - It names ANOTHER terrain profile, as `outlineProfile` does, so the overlay reuses `texture`/`scale`/`color` and the
    D14 fallback without new vocabulary.
  - A `Stones` profile is the first consumer.
- **Paint:** after the body, the same footprint rect or ribbon is painted again with the overlay profile's paint.
  - Its mask is the SAME bake pass in a second mode (one shader, a mode uniform): the surface's own blurred silhouette
    × `smoothstep(1 − coverage ± s, n)`.
  - So the patches die out at the surface's edge instead of spilling past it.
- **Loading:** `neededTextures` must include overlay profiles' textures, or the overlay paints its fallback colour.
- **Cost:** one extra masked draw per frame, only on surfaces that author an overlay. Measure it in W2; region-primitive
  §4.8's overdraw argument says the axis is pixels painted.
- **Rulings (PO, 2026-09-26), answering the questions this section left open:**
  - **D4 — the overlay gets its OWN patch keys.** Size and roughness live on `overlay`, never borrowed from the base
    profile's `wobbleSize` / `wobbleRoughness`: patch size and edge fraying are different looks.
  - **D5 — each layer drifts by its own profile's `scroll`** (synchronised was allowed if cheaper; it is not: a drift
    is one `tilePosition` write per surface per frame). The patch SHAPES stay put, since the mask is a world-keyed
    bake; only the texture inside them moves.
  - **D6 — an overlay on an aligned ribbon follows arc-length UVs**, like its base. ⚑ It inherits `paintRibbon`'s
    refusal: an aligned AND drifting profile has no mesh branch yet, so a drifting overlay on an aligned ribbon
    stays world-aligned, exactly as the river does today.
  - **D7 — one noise pattern: the fbm blobs, shaped by `coverage` + the overlay's own size and roughness.** A
    `pattern` enum (`patches` | `scatter`, cellular noise for evenly strewn islands) is NOT built in W2. It is added
    only if the look sitting on the `Stones` profile shows blobs cannot read as strewn; it would slot into the same
    shader as one more mode, so nothing in W2 needs undoing.

## 6. W1b — separate wobble from blend, and expose roughness (designed + BUILT 2026-09-26, §6.5)

**Why (D3).** W1 ties four looks to two knobs:

- `blend` is the softness of the edge AND the room the edge may wander in. With `blend: 0` there is no mask at all
  (the six `blend > 0 ? buildBlendMask(…)` call sites in `RegionPaint.ts`, plus `maskDensity`'s guard and the
  `bandTexels < 1` early return), so `wobble` is silently inert. A CRISP edge that wanders (a cut field plot, a
  rocky shore) cannot be authored.
- `wobble` is how far the edge wanders AND how crisp it gets (`softness(wobble)`, ½ → 0.06). A soft edge that
  wanders far, or a crisp edge that wanders a little, cannot be authored.
- The ROUGHNESS (whether a lump is smooth or frayed) is fixed in the shader: 3 fbm octaves, weights ½ ¼ ⅛. Every
  surface gets the same mix.

### 6.1 The keys after W1b

| Key | Unit | Meaning | `0` / absent |
|---|---|---|---|
| `blend` | world units | the soft fade's width, and ONLY that. The meaning is unchanged; the second job is gone | a hard edge |
| `wobbleReach` | world units | how far the edge may wander either side of the authored line. **Replaces `wobble`** (0…1) | a straight edge, no noise pass (C5 exactly) |
| `wobbleSize` | world units | the lump size. Unchanged; its derived default moves from the band to the reach (§6.2) | derived |
| `wobbleRoughness` | 0…1 | how frayed each lump is: 0 = smooth lumps only, 1 = the fine octaves as strong as the coarse one | today's fixed mix |

- ⭐ Any combination is legal and means what it says: soft + straight (today's biome borders), crisp + wandering
  (field plots), soft + wandering (a worn road).
- ⚑ **The names are proposals** (`wobbleReach` was preferred over plain `wobble` because it is now a distance). Confirm
  them in the first minute of the execution session. They are cheap to change until content authors them.
- ⚑ Same parse posture as W1: an out-of-range, non-finite or non-number value is DROPPED, never clamped. `wobbleReach`
  and `wobbleSize` drop 0 and negatives. `wobbleRoughness` keeps 0 (smooth is a real look). All four keys work on
  atmosphere profiles too, as `wobble` does now.

### 6.2 The bake

The pipeline and every W1 contract stay the same (bake once, world-keyed noise, one density variable, the caller frees
one texture, a GLSL-only degrade to the clean ramp). What changes:

1. **The working band is `max(blend, 2 × wobbleReach)`** (the room both looks need), not `blend`. The silhouette is
   blurred to that band, and the footprint margin and `maskDensity` are sized from it.
2. **The displacement is calibrated in world units.** The noise term's amplitude is derived so the edge's excursion is
   `≈ wobbleReach`, not a 0…1 fraction of the band. The `4m(1−m)` bump stays, for the same reason as in W1.
3. **The threshold's softness comes from `blend`, not from the wobble:** `s = ½ × blend / band`, floored at about
   one texel. With `wobbleReach: 0` the band IS `blend` and `s = ½`, which is the identity remap, so C5 is exact. With
   `blend: 0` the edge is as crisp as the texture allows.
4. **Roughness is the octave gain.** Weights `1, g, g²` with `g` from `wobbleRoughness`; absent = `g = ½`, which is
   W1's exact mix. ⚑ **The sum must be normalised by its SPREAD, not just its total:** more equal-weight octaves
   narrow the fbm distribution (central limit), so without that normalisation a rougher edge would also wander LESS.
   The fixed `× 1.8` stretch becomes a value derived from the weights. That keeps roughness independent of reach.
5. **`blend: 0` with `wobbleReach > 0` gets a mask.** The six call-site guards become "`blend > 0` OR `wobbleReach > 0`",
   and so does `maskDensity`'s. A surface authoring neither still takes the maskless path, so the cost stays zero
   until authored.
6. `wobbleSize` absent derives from the REACH (`GRAIN_PER_BAND` becomes a per-reach constant), because the blend
   no longer sets the room.

⚑ **Density and roughness.** The finest octave is ¼ of the grain, and `MIN_GRAIN_TEXELS` guards only the base grain,
so on a capped mask the fine octave is already below a texel. At W1's gain ½ that is barely visible. At high roughness
it will alias. **Open for the session:** either include roughness in the density rule (raising VRAM on rough surfaces
only), or drop octaves that fall under ~2 texels. The second is cheaper, and matches what the eye can resolve anyway.

### 6.3 Content migration

`wobble` is authored ONLY in `terrain-profiles.json`: `Road` 0.6 (on `blend` 0.5) and the four field profiles 0.2
(on `blend` 0.2). The atmosphere table authors none, and Tiled never sees profile keys. There is no compatibility
window: the old key is dropped from the parser in the same commit, and a test fails if a profile still names it.

- Starting values, to judge by eye (W1's look translated, not preserved): `Road` ≈ `blend 0.25`, `wobbleReach 0.2`.
  The fields ≈ `blend 0`, `wobbleReach 0.1`, which is the crisp plot edge this whole split was asked for.
- ⛔ `terrain-profiles.json` carries UNCOMMITTED PO authoring as of 2026-09-26 (`Water` lost its `wobble: 0.3`).
  Migrate whatever is in the tree at the time; never overwrite it from HEAD.

### 6.4 Tests first

- `Regions.test.ts`: the parse rules for the three new keys (0 kept or dropped per §6.1); `wobble` is no longer
  declared; `DEFAULT_PROFILE` carries them.
- `MaskNoise.test.ts`, all pure:
  - `maskDensity` sizes from the working band;
  - `blend: 0, wobbleReach > 0` yields a real density and grain, where today it is inert;
  - `wobbleReach: 0` returns C5's exact density whatever the other keys say.
- Extract the band / softness / octave-weight maths into a pure function (the GPU half stays eye-judged):
  - `s = ½` exactly when there is no reach (the C5 identity);
  - the spread-normalised weights keep the reach constant across roughness 0…1;
  - absent roughness reproduces W1's `½ ¼ ⅛`.
- Real browser, at W1's venue (the Road by the bridge, ≈ −157.5, −52), plus one field plot:
  - A/B `blend` with a fixed reach;
  - `wobbleReach` with a fixed blend;
  - `wobbleRoughness` at 0 / 0.5 / 1;
  - zero GL errors.

**Schema: DB / wire / conf / zone format: ALL NONE.** Client-only presentation keys, like `blend`.

**W2 note.** W2's overlay mode runs through the same shader, so an overlay's patches get roughness for free. §5's D4
(2026-09-26) gives the overlay its own size AND roughness keys.

### 6.5 W1b as built (2026-09-26)

Built as §6.1-6.4 describe, with the names as proposed (`wobbleReach`, `wobbleRoughness`). What the session decided:

- **The numbers** (all [PLACEHOLDER]): `BAND_PER_REACH` = 3 (the band a reach needs; the amplitude is solved against
  it, and it comes out at 1.2), `GRAIN_PER_REACH` = 1, `MIN_OCTAVE_TEXELS` = 2, `NOISE_STRETCH` = 1.8 at W1's mix.
- **Octave drop over density** (§6.2's open question): the cheaper answer. ⚑ Consequence: on a narrow edge at the
  density ceiling the fine octaves are dropped, so roughness has little room to show there. A 0.2 u grain at
  16 texels/unit keeps only the coarse octave. Raising `MAX_TEXELS_PER_UNIT` (named `WOBBLE_MAX_TEXELS_PER_UNIT` until W1c) is the knob if the look sitting wants it.
- **Content was TRANSLATED, not retuned**: each W1 value was converted to the fade, wander and lump W1 actually drew
  (under the same linear-ramp reading), so the look sitting starts from today's picture:

  | Profile | W1 | W1b |
  |---|---|---|
  | `Road` | `blend 0.5, wobble 0.6` | `blend 0.24, wobbleReach 0.12, wobbleSize 0.25` |
  | `Water` | `blend 0.3, wobble 0.3` | `blend 0.22, wobbleReach 0.04, wobbleSize 0.15` |
  | the four fields | `blend 0.2, wobble 0.2` | `blend 0.16, wobbleReach 0.02, wobbleSize 0.1` |

  ⚑ The fields' W1 wander was 0.02 u, next to nothing: the crisp wandering plot edge is now authorable, but it is not
  what they carry. That is a look-sitting call.
- **One mask decision, `surfaceMask`**, replaces the six `blend > 0 ? buildBlendMask(…)` sites. `BlendMask` carries
  its `bandPx`, so the ribbon's overdraw follows the real band and not `blend`.
- **Guard**: `Regions.test.ts` checks every key in both RAW profile files against `DEFAULT_PROFILE`'s keys, so a
  retired `wobble` (or any typo) is red instead of being silently ignored.
- ⚑ The non-WebGL fallback is a band-wide clean ramp: a wobbly edge degrades to straight, but it fades over the band
  rather than over `blend`. Both Applications are WebGL, so nobody sees it.
- **Verified 2026-09-26:**
  - vitest **1204/1204**, `tsc --noEmit` clean, prod build clean.
  - Real browser (a fresh `aurad -dev`, the prod bundle) at the Road by the bridge (-156.8, -51.4) and the field plots
    (-167, -45): **0 console / page errors**. The only GL driver message is Chrome's generic "GPU stall due to
    ReadPixels" performance note. Road edges draw irregular, not as a soft ruler; plots and bank draw.
  - The probe was a scratch script, not a committed harness.
  - ⚑ OWED: the PO look sitting (W1's, now with three knobs), a `blend: 0` + `wobbleReach` plot seen in-game, and
    roughness 0 / 0.5 / 1 compared by eye.

## 7. W1c — a small blend draws at every size (designed + BUILT 2026-09-26, ledger §8)

**Why (PO 2026-09-26).** A straight edge's mask is baked at C5's fixed 6 texels per world unit (3 on mobile), and
`buildBlendMask` returned NO mask when the band came to under one texel. So any `blend` under ≈ 0.17 u drew as a hard
edge on desktop (≈ 0.33 u on a phone, where `Bog`'s 0.3 was already hard), and 0.2 was a one-texel smear. Wobbly
masks escaped it only because their density already rose with the grain. No earlier plan covered this: C5 left the
density as a look-sitting knob, and W1b fixed only `blend: 0` under a wobble.

**The design: the density follows the band, exactly as it already follows the grain.**

1. `texelsPerUnit = max(base, MIN_BAND_TEXELS / band, MIN_GRAIN_TEXELS / grain)`, capped at ONE ceiling for every
   mask, then at the 2048-texel side as before. `WOBBLE_MAX_TEXELS_PER_UNIT` becomes `MAX_TEXELS_PER_UNIT`: since W1c
   it caps every mask, not just a wobbly one. The one-density-variable rule is untouched.
2. **A band finer than the ceiling can draw is widened to the finest it can** (`MIN_BAND_TEXELS / ceiling`), never
   dropped to a hard edge: an author who wrote a `blend` asked for SOME softness, and a hard edge is the more
   surprising answer. `maskBand` owns the floor, so the footprint margin, the density and the noise shape all read
   the same band.
3. The `bandTexels < 1` bail-out stays, and is now reachable only at the 2048 cap on a shape more than ≈ 256 u long.

**Numbers** ([PLACEHOLDER]): `MIN_BAND_TEXELS` = 2, the ceiling unchanged at 16 / 8. Finest band ≈ 0.125 u desktop,
0.25 u mobile. Raising the ceiling to 32 / 16 halves both, at VRAM cost on narrow-blend surfaces only.

**Cost.** Only surfaces whose blend is under `MIN_BAND_TEXELS / base` (≈ 0.33 u desktop, 0.67 u mobile) bake denser.
In the tree today: `City` and `Lava` (0.2), `Bog` (0.3), plus the already-dense wobbly profiles. A surface with a wide
blend bakes exactly what it did.

**Schema: DB / wire / conf / zone format: ALL NONE.** No content change.

**As built (2026-09-26).** Exactly as above; `maskBand` and `maskDensity` gained the device and the band.
- vitest **1217/1217** (+13: the floor per device, every blend 0.01…1.5 spanning `MIN_BAND_TEXELS` on both devices
  under the ceiling, the cap still winning), `tsc --noEmit` clean, prod build clean.
- Real browser (the prod bundle, `aurad -dev`) at the `Lava` edge (39.6, −74.8, blend 0.2), the `Bog` edge
  (−150.1, −16.1, blend 0.3) and the Road: **0 console / page errors**; the Lava edge draws a narrow fade. No A/B
  against the pre-W1c bundle was shot.
- ⚑ OWED: the look sitting's judgement of the finest fade (0.125 u desktop), and the phone (0.25 u there).

## 8. W1b + W1c ledger — the review pass and the wrap (2026-09-26, `a4ad7f0c`)

A hostile review of the combined W1b + W1c diff, the same day, before the wrap. What it found and did:

- ⚑ **The octave count was coupled but not guarded.** `OCTAVE_SCALES` claimed "the shader is built from this array",
  but the weights ride a `vec3` and the fbm names three terms, so a fourth scale would be weighed and normalised in
  TS and never drawn. FIXED as a pin: a test holds the count at three, and the comment now says why.
- **The amplitude solve was not proved for every band `maskBand` can hand it**, W1c's floor included. A property test
  now sweeps blend × reach × device through `maskBand` → `maskDensity` → `noiseShape`: `x ≤ 1/BAND_PER_REACH`, the
  amplitude finite and positive, `0 < soft ≤ ½`.
- **Stale authoring text.** `terrain-profiles.json`'s `_comment_blend` now states W1c's floor (a positive blend is
  never hard; only 0 is), and `plan-region-primitive.md`'s W1 pointer names the W1b keys.
- **Checked and clean:** no other consumer reads a blend WIDTH (`regionBlend` has one caller, `surfaceMask`; the ribbon
  overdraw reads `bandPx`); the Tiled palette reads profile NAMES only; no `wobble` key survives in content, tools or
  the zone files; line endings uniform per file (`core.autocrlf` normalises on commit).
- **Cost, measured off the real content** (a scratch estimate of every masked surface's texture, not a GPU reading):
  `world` masks grow 26.2 → 27.8 MB desktop and 9.2 → 11.0 MB mobile; `underworld` 1.4 → 1.9 / 0.3 → 0.8 MB. The
  mobile growth is exactly the surfaces that used to draw HARD there (the W1c defect itself). The full-screen map
  bakes its own copy of every mask, so the real figure is about double.

**Verified at the wrap:**
- vitest **1224/1224** (W1b's 1204 → +13 W1c → +7 review), `tsc --noEmit` clean, prod build clean. No Go change.
- `c4-region-texture.mjs`: **6 PASS + 1 INCONCLUSIVE** (the band leg: world run unread, map run read a ramp at
  `Fields` blend 1.5). Not a W1b/W1c effect by construction — a 1.5 band on a straight edge bakes the identical mask
  (same band, density 6, no noise pass) — but NOT proved against HEAD.
- `a5-darkness-blend.mjs` `on` + `clearing-on` (the probe rects its header documents, installed in
  `underworld.json` and restored with `git checkout`, then rebuilt so the embedded copy is clean): **both PASS, 0
  page errors**; bank ramp **99 px** (100 recorded 2026-09-17), clearing rim **119 px** (104 recorded). The
  clearing's bake inputs are unchanged (band 2, density 6, no noise pass) and the probe venue is not the original,
  so the 15 px is recorded, not diagnosed. The `off` halves were not run.
- The scratch W1b/W1c probes (Road, fields, Lava, Bog): 0 console / page errors.
- **Schema: DB / wire / conf / zone format ALL NONE.** Client-only presentation keys.
- ⚑ Residue: `hrnss_wob_*`, `hrnss_blend_*`, `hrnss_regio_*` and two `a5` characters in the dev DB. `harnessdb
  -cleanup`, `aurad` stopped first.

**OWED (all the PO's):** the look sitting across all four knobs (roughness 0 / 0.5 / 1, a `blend: 0` +
`wobbleReach` plot, the finest fade), and the phone.

## 9. W2 as built — the overlay (2026-09-26, `[uncommitted]`)

⚑ **Built before W1's look sitting, at the PO's request** ("Implement it", the same day D4-D7 were ruled): D1's
"W2 after W1 is judged" was the PO's to waive.

**The key**, on a terrain profile: `"overlay": { "profile", "coverage", "size"?, "roughness"? }`.
- `profile` + `coverage` (0…1) are required; either missing or unusable drops the WHOLE overlay. `size` (world units,
  default 1.5) and `roughness` (0…1, default 0.5) are the overlay's OWN (D4) and drop alone. `coverage: 0` parses and
  paints nothing.
- `regionOverlay` returns `null` for an overlay naming a profile the table lacks: without it the miss would paint
  patches of the DEFAULT (bare land) colour, plausible enough to pass for a look. A content test fails on one.
- The named profile lends ONLY its paint (texture, scale, colour, drift). Its own blend, wobble and overlay are ignored,
  so an overlay never recurses. Ground only: an atmosphere profile's overlay is parsed and never drawn.
- `neededTextures` loads each overlay profile's tile too; missed, the patches paint their fallback colour forever.

**The bake** (`MaskNoise.applyPatchNoise`, the W1 program with `uMode = 1`): `a = m × smoothstep(t ± PATCH_SOFT, n)`,
where `m` is the SURFACE's own mask (its fade and wobble), or 1 when the surface has none (a hard edge, clipped by
the shape's geometry instead, §9.1), and `t = patchThreshold(coverage)` maps coverage onto `[−soft, 1 + soft]` so 1 covers everything and
0 nothing (exact at 0, ½, 1). Density: `overlayDensity`, the `maskDensity` rule with the patch as the grain, never
coarser than the base mask it reads. Roughness: `octaveMix`, extracted from `noiseShape` so both modes share it.

⛔ **Found by eye, fixed the same session: thresholded value noise traces its SQUARE lattice.** The first bake drew
patches with straight runs and right-angled corners (an "L" in the grass, blocky water in the bog). The patch mode now
turns each octave to its own angle and domain-warps the sample point (`patchFbm`, `PATCH_WARP_*`); neither changes the
noise's distribution, so the coverage cut and the stretch still hold. ⚑ The wobble mode is untouched, so W1b's edges
draw exactly as before.

**The paint** (`RegionPaint.paintOverlay`), right after each body, before its outline: the patches are a surface of the
overlay profile run through the body's own painters. Still → `addFeathered`; drifting → the TilingSprite at the
OVERLAY's `scroll` (D5); on a path whose body went out as a ribbon mesh → `paintRibbon` with arc-length UVs (D6). To
make that possible `paintRibbon` now takes a caller-built mask, one mask per path serving either branch. Regions,
polygons, paths and outlines all honour an overlay.

**Content.** A `Stones` profile and tile (`make-cellular-tiles.mjs`'s fourth tile, ≈ 45 % stones, mean asserted =
`#60574b`), and `Fields` carries `{ Stones, coverage 0.2, size 1.5, roughness 0.5 }` for the look sitting. Tiled
palette regenerated (`Stones` appended to the enum). `docs/art/assets.csv` +1 row.

**Numbers** ([PLACEHOLDER]): `OVERLAY_DEFAULTS` size 1.5 / roughness 0.5, `PATCH_SOFT` 0.06, `PATCH_WARP_SCALE` 0.6,
`PATCH_WARP_STRENGTH` 1.2.

**Cost.** One more mask texture and one masked draw per overlaid surface, none without one. The four `Fields` regions'
patch masks come to ≈ 3.6 MB desktop / 0.9 MB mobile (estimated from their footprints, not a GPU reading; the map bakes
its own copy, so about double), plus the `Stones` tile (381 KB download, ≈ 2.1 MB decoded).

**Schema: DB / wire / conf / zone format: ALL NONE.** Client-only presentation keys.

**Verified 2026-09-26:**
- vitest **1256/1256** (+32: overlay parse, `regionOverlay`, `neededTextures`, the content guard, `patchThreshold`,
  `overlayDensity`, `octaveMix`), `tsc --noEmit` clean, prod build clean (3 pre-existing size warnings). No Go change.
- `make-cellular-tiles.mjs`: stones seam exact, mean on the profile; the three existing PNGs byte-identical.
- Real browser (prod bundle, `aurad -dev`), scratch probe: `Fields` interior and its edge (patches fade out at the
  band, none past it). With THROWAWAY overlays (reverted) on `Road` (a wobbly stroked path), `Cliff Smooth` (an
  aligned ribbon, no base mask) and `Bog` (a drifting base, a drifting `Water` overlay): all draw; **0 console / page
  errors** throughout (the only warnings are the pre-existing `Water` alignTexture ones).
- ⚑ NOT verified: the drift seen MOVING (the overlay rides the same scroller list as the body, by construction); the
  full-screen map by eye (the probe's map shot is under unexplored fog; same bake, same world-keyed noise).
- ⚑ Residue: `hrnss_stone_*` characters in the dev DB (`harnessdb -cleanup`, `aurad` stopped first).

**OWED (the PO's):** the look sitting on `Fields` (coverage, size, roughness, `PATCH_SOFT`, the `Stones` tile itself)
and the phone; whether D7's `scatter` pattern is still wanted once seen.

### 9.1 W2 review pass (2026-09-27, `[uncommitted]`)

A hostile review of the W2 diff, then the PO's own A/B: a throwaway `Mountains` (hard edge) → `Water` overlay.

- ⛔ **A grey strip of bare base along a HARD edge** (PO screenshot): the patches stopped short of it. Two causes:
  1. **C5's, not W2's: every mask sat up to a texel short at its bottom and right.** The texture is rounded UP to whole
     texels, and the sprite was stretched back over the unrounded box. FIXED at the root: `snapToTexels` grows the
     box to whole texels first, so texture, box, sprite and noise-quad UVs are one size (pinned). ⚑ Every soft edge
     in the game moves by up to a texel toward where it always should have been.
  2. **The overlay drew a hard surface through a rasterised silhouette**, whose antialiased rim fades half a texel
     inside the crisp edge. FIXED: a maskless surface's patches cover the whole box (`applyPatchNoise` with no input
     samples white) and the shape's own geometry clips them, the stencil a drifting hard body already uses. A ribbon
     needs neither: the mesh is the body's geometry.
- **An outline's overlay followed the BODY's ribbon decision**, not the rim's own; the rim can fall back alone. FIXED.
- **The coverage cut and its softness lived in two places** (caller + shader uniform). `applyPatchNoise` takes
  `coverage` and derives the cut itself.
- **A mask was leaked per repaint** for a surface painting nothing (`color: null`) with a blend, pre-existing and now
  reachable as "stones on bare land". `paintSurface` hands it to `out.masks`.
- **An atmosphere overlay** is never drawn yet its tile would load: a test now fails on one.
- **`toString` passed the overlay's profile check** (`in` walks the prototype): own-key checks, pinned.
- The JSON's "one continuous patch field across a seam" was softened: only for equal `size`, and a huge shape can
  floor its grain.
- **Verified:** vitest **1265/1265** (+9), `tsc --noEmit` clean, prod build clean. Real browser at `Mountains`'s
  bottom and right hard edges (water reaches the edge, no strip, no spill), the `Fields` soft edge and the `Road`
  stones: **0 console / page errors**.
- **PO look 2026-09-27:** drift moving and the full-screen map both checked (works); the snapped soft edges look
  good. **Content, by ruling:** every look-sitting overlay was removed (`Fields`, `Road`, `Mountains` are as at HEAD)
  and `FieldsForestBlend` added instead: `Fields` with `Forest` patches (coverage 0.2, size 1.5, roughness 0.5), a
  second profile so no existing field changes. `Stones` stays as a material nothing names yet. The phone check moved
  to `docs/cleanup.md` entry 2.

### 9.2 A crisp wobbly edge, and roughness that shows (2026-09-27, `[uncommitted]`)

⛔ **PO: "0 blend on the road still looks blended."** W1b's "`blend: 0` draws as crisp as the texture allows" was true
and useless: the density followed the BAND (the room to wander, 3 × the reach) and the lump, never the FADE, so the
Road baked at 6 texels/unit and "crisp" spread over ≈ 0.33 u. The same density dropped every fine octave, so
`wobbleRoughness` was INERT on the Road at every value (measured: coarse octave only at lump 0.25 and 0.5).

- **The rule now (PO: keep the ceiling at 16 / 8):** on a wobbly edge `maskDensity` also wants `MIN_BAND_TEXELS / blend`
  (a `blend` of 0 asks for the ceiling) and, when roughness > 0, enough texels for the finest octave
  (`octaveTexelsNeeded`). `overlayDensity` takes the same roughness rule. Straight edges are untouched.
- **Cost:** in today's content only the Road grows (its 4 masks ≈ 0.2 → 1.6 MB desktop): the fields and `Water` were
  already at the ceiling through their small lumps.
- ⚑ The ceiling still bounds both: a crisp edge fades over ≈ 1 texel (0.06 u desktop, 0.125 u phone) plus the bilinear
  upscale, and a lump under ≈ 0.5 u (1 u on a phone) still loses its finest octave.
- **Verified:** vitest **1274/1274** (+9), `tsc --noEmit` clean, prod build clean. Not yet judged by eye.

### 9.3 The Road look: "pixelated, cubey" (PO 2026-09-27, `[uncommitted]`)

The crisp Road from §9.2 read as blocks: flat runs along the road with steep steps between. Diagnosed by A/B in the
browser, not by maths:
- **Not the resolution** (the PO's guess): tripling the ceiling (48 texels/unit) left the shape identical, only
  slightly crisper.
- **The displacement saturates.** The `4m(1 − m)` bump weakens away from the line, so near its extreme the edge moves
  ever less per unit of noise and piles up at ±reach. At `BAND_PER_REACH` 3 the response at the extreme was about a
  fifth of the centre's. **Now 6** (about two thirds; amplitude 0.375). 10 went too far: the wander flattened and
  stray specks detached from the edge.
- **The lattice.** The wobble's value noise traced its square grid once the edge could draw crisp, the defect §5's
  patches hit first. Both modes now share ONE `fbm`: octaves turned to their own angles and the sample point warped
  (`WARP_SCALE` / `WARP_STRENGTH`). The distribution is unchanged, so the reach solve and the coverage cut hold.
- **Road content (PO-approved by eye):** `blend` 0.08, `wobbleReach` 0.2, `wobbleSize` 0.8, `wobbleRoughness` 0.5
  (the PO's `scale` 0.5 kept). A finer, tidier alternative seen: 0.06 / 0.15 / 0.6 / 0.4.
- ⚑ Every wobbly edge changes pattern (not statistics); the field plots and the river were re-shot and read fine.
- **Verified:** vitest **1274/1274**, `tsc --noEmit` clean, prod build clean; real browser at the long road, the
  bridge, the field plots and the river: **0 console / page errors**.
