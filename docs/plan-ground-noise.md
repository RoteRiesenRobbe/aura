# Ground noise — wobbly blend edges (W1) and texture overlays (W2)

Designed and W1 built 2026-09-23 (PO session). **W1 SHIPPED, look sitting owed · W2 designed, not built.**

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

## 5. W2 — texture overlay (designed, NOT built)

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
- **Open for W2's session:**
  - Should the overlay's patch size reuse the base profile's `wobbleSize`, or get its own key on `overlay`? The
    D2 amendment points to the second: patch size and edge fraying are different looks.
  - Does a drifting base keep a still overlay?
  - Does an overlay on an aligned ribbon follow arc-length UVs?
  - Is `coverage` enough, or do stones want a second, sparser octave?
