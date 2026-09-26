/**
 * The WOBBLE on a soft edge (plan-ground-noise.md W1), and the density every
 * blend mask is baked at.
 *
 * ⭐ WHAT IT FIXES. C5's blend mask is a blurred silhouette: a mathematically
 * clean Gaussian ramp, identical at every point of the edge. On a wide region
 * border that reads as a gentle fade; on a road it reads as a SOFT RULER — the
 * side of the path looks washed rather than worn. `plan-region-primitive.md`
 * §4.8 predicted exactly this and left the wobble out of C5 "addable inside the
 * same mask generation", which is where it lives.
 *
 * ⭐ HOW. One extra pass, AT BAKE, never per frame: the blurred mask is read
 * back through a quad whose shader perturbs it with world-keyed noise and
 * re-thresholds it. The output is still just the mask texture, so nothing
 * downstream — the masked rect, the ribbon, the scroller, the fog — knows the
 * difference. ⛔ Not a per-frame shader on the surface: two per-layer
 * filter/mask traps are on record here (region-primitive L7, and the masked
 * erase), and the mask was already a zone-load bake.
 *
 * ⭐ THE NOISE IS KEYED TO WORLD PX, and that is load-bearing twice: two abutting
 * surfaces wobble in agreement, and the full-screen map (which bakes through
 * the same `paintTerrainSurfaces`) draws the SAME edge the world does — L2's
 * map parity with no extra code.
 *
 * ⭐ W1b (D3) SPLIT THE KNOBS. W1 read `blend` as both the fade and the room to
 * wander, and `wobble` as both the wander and the crispness. Now `blend` is
 * the fade ONLY, `wobbleReach` is how far the edge wanders in world units, and
 * `wobbleRoughness` is the octave mix W1 hardcoded. The bake blurs to a band
 * wide enough for both ({@link maskBand}) and derives the shader's uniforms so
 * each knob moves one look ({@link noiseShape}).
 *
 * ⚑ `maskBand`, `maskDensity` and `noiseShape` are pure and vitest-reachable;
 * `applyMaskNoise` needs a GPU and is judged by eye and by the harness.
 */
import {
    Container, GlProgram, Mesh, MeshGeometry, Renderer, RendererType, RenderTexture, Shader,
    UniformGroup,
} from 'pixi.js';

/**
 * Texels per WORLD UNIT in a blend mask with no wobble (C5).
 *
 * The mask holds nothing but a low-frequency alpha ramp, which is where the
 * cost of the feature goes away — `MapFog` states the same economy for the same
 * reason. At 6 per unit the 1.5-unit band is 9 texels wide, and one texel
 * covers 20 screen px at native zoom: enough segments that the bilinear upscale
 * of a Gaussian ramp reads as a ramp rather than as steps.
 *
 * Halved on mobile, exactly as `MapFog.fogWidth` and `MapTerrain.bakeWidth`
 * are halved and for the same reason: the phone is the platform already at its
 * render ceiling, and this is the axis that costs only VRAM.
 */
export const BASE_TEXELS_PER_UNIT = {desktop: 6, mobile: 3};

/**
 * The ceiling ANY mask may raise its density to. [PLACEHOLDER]
 *
 * ⚑ Two things the base density cannot draw raise it: a narrow road's noise
 * grain (W1) and a narrow fade (W1c). The ceiling is what keeps a long diagonal
 * river — whose mask is its whole bounding BOX — from asking for a texture the
 * size of the map. VRAM is the axis this spends. ⚑ It also sets the finest
 * fade any mask draws: {@link MIN_BAND_TEXELS} of these.
 */
export const MAX_TEXELS_PER_UNIT = {desktop: 16, mobile: 8};

/** The fewest texels a band may span (W1c). [PLACEHOLDER]. Below about one the
 *  blur rounds to nothing; at two the bilinear upscale still reads as a ramp.
 *  A band finer than this at the ceiling is WIDENED to it (see maskBand). */
export const MIN_BAND_TEXELS = 2;

/**
 * Hard cap on either side of a mask texture. A region the size of the world
 * (144 units) asks for 882 texels at the base density, so nothing clean is near
 * this — it is here so that an author who draws one enormous shape gets a
 * coarser band instead of a texture no GL implementation will allocate.
 */
export const MASK_MAX_TEXELS = 2048;

/** The smallest noise feature, in texels, worth drawing. Below it the blotches
 *  turn into per-texel speckle, which reads as a rendering fault, not ground. */
export const MIN_GRAIN_TEXELS = 3;

/** Noise grain as a multiple of the reach, for a profile that does not author
 *  `wobbleSize`. [PLACEHOLDER]. ⚑ W1 derived it from the BAND (½ of it); since
 *  D3 the band is the fade and the reach is the room, so the lump follows the
 *  room. At 1 a lump is about as wide as the edge travels. */
export const GRAIN_PER_REACH = 1;

/** The band the bake blurs to, as a multiple of the reach. [PLACEHOLDER] but
 *  NOT free: {@link noiseShape} solves the amplitude against it, and below ~2.5
 *  the ramp is too steep for the `4m(1 − m)` bump to let the edge travel its
 *  full reach. At 3 the needed amplitude is 1.2. */
export const BAND_PER_REACH = 3;

/** The octaves' frequencies, relative to the grain. ⭐ The SHADER is built from
 *  this array, so the octave-drop rule and the GLSL cannot disagree. The
 *  offsets de-correlate the octaves' lattices. ⛔ Exactly THREE: the weights
 *  ride a `vec3` uniform and the fbm names three terms, so a fourth entry
 *  would be weighed here and never drawn (MaskNoise.test.ts pins the count). */
export const OCTAVE_SCALES = [1, 2.03, 4.01];
const OCTAVE_OFFSETS = [0, 17.1, 41.7];

/** An octave finer than this many texels is DROPPED rather than drawn: below
 *  it the lattice aliases into speckle, which reads as a rendering fault, not
 *  ground. [PLACEHOLDER]. ⚑ The cheaper of §6.2's two answers: a rough surface
 *  does not raise the density, so on a narrow edge at the ceiling roughness has
 *  little room to show. `MAX_TEXELS_PER_UNIT` is the knob if it must. */
export const MIN_OCTAVE_TEXELS = 2;

/** The stretch that spreads W1's fbm back out to fill 0…1, at W1's octave mix
 *  (gain ½). Every other mix is stretched to the SAME spread (see noiseShape). */
export const NOISE_STRETCH = 1.8;

/**
 * The band the bake blurs to, in world units: the fade, widened to give the
 * wander room when the reach needs more than the fade has.
 *
 * ⭐ W1c: a band finer than the densest mask can draw is widened to the finest
 * it CAN draw, never dropped to a hard edge — an author who wrote a `blend`
 * asked for some softness. The floor is per device, as the ceiling is.
 *
 * ⚑ `reach` 0 returns the blend exactly whenever the mask can draw it, so a
 * straight edge is C5's mask; a surface with neither key gets 0 (no mask).
 */
export function maskBand(blend: number, reach: number, mobile: boolean): number {
    const band = reach > 0 ? Math.max(blend, BAND_PER_REACH * reach) : blend;
    if (band <= 0) { return 0; }
    return Math.max(band, MIN_BAND_TEXELS / MAX_TEXELS_PER_UNIT[mobile ? 'mobile' : 'desktop']);
}

/**
 * The density a mask is baked at, and the noise grain drawn into it.
 *
 * ⚑ ONE density feeds the texture size, the blur strength AND the grain. A
 * mask that hits the cap gets a coarser texture, and a blur or a grain computed
 * off the uncapped density would draw a band or a blotch several times too
 * wide. That is why the grain is re-derived AFTER the cap.
 *
 * ⭐ W1c: the density follows the BAND exactly as it follows the grain, so a
 * narrow fade gets the texels to draw it. A band of C5's width or wider bakes
 * at the base, as it always did.
 *
 * @param band          world units, from {@link maskBand}
 * @param reach         world units; 0 means no grain
 * @param longestUnits  the footprint's longer side, world units
 * @param wobbleSize    the profile's authored grain, world units; 0 derives it
 *                      from the reach
 */
export function maskDensity(
    band: number,
    reach: number,
    longestUnits: number,
    mobile: boolean,
    wobbleSize: number = 0,
): { texelsPerUnit: number, grainUnits: number } {
    const device = mobile ? 'mobile' : 'desktop';
    let wanted = BASE_TEXELS_PER_UNIT[device];
    if (band > 0) {
        wanted = Math.max(wanted, MIN_BAND_TEXELS / band);
    }
    let grainTarget = 0;
    if (reach > 0) {
        grainTarget = wobbleSize > 0 ? wobbleSize : reach * GRAIN_PER_REACH;
        wanted = Math.max(wanted, MIN_GRAIN_TEXELS / grainTarget);
    }
    let texelsPerUnit = Math.min(wanted, MAX_TEXELS_PER_UNIT[device]);
    if (longestUnits * texelsPerUnit > MASK_MAX_TEXELS) {
        texelsPerUnit = MASK_MAX_TEXELS / longestUnits;
    }
    const grainUnits = grainTarget > 0
        ? Math.max(grainTarget, MIN_GRAIN_TEXELS / texelsPerUnit)
        : 0;
    return {texelsPerUnit, grainUnits};
}

/** The noise pass's uniforms. */
export interface NoiseShape {
    /** How hard the noise pushes the ramp; solved so the edge travels `reach`. */
    amp: number;
    /** The threshold's half-width in ramp units: the fade, as a share of the band. */
    soft: number;
    /** One per {@link OCTAVE_SCALES} entry, summing to 1. */
    weights: number[];
    /** Spreads the weighted sum back out, to the same spread at every mix. */
    stretch: number;
}

function spreadOf(weights: number[]): number {
    return Math.sqrt(weights.reduce((sum, w) => sum + w * w, 0));
}

/** W1's mix, gain ½ over the three octaves, and the spread NOISE_STRETCH was
 *  tuned at. */
const W1_SPREAD = spreadOf([4 / 7, 2 / 7, 1 / 7]);

/**
 * The shader's uniforms for one mask: each of D3's three knobs moves ONE look.
 *
 * ⭐ THE FADE (`soft`). The ramp crosses the band at one per band, so a
 *   threshold half-width of `blend / (2·band)` fades over exactly `blend`
 *   world units. With no reach the band IS the blend and this is ½, the
 *   identity remap, so the knob converges on C5. A `blend` of 0 is floored at
 *   one texel, the crispest edge the mask can draw.
 *
 * ⭐ THE REACH (`amp`). Along the ramp m ≈ ½ − d/band, and the shader moves the
 *   edge to where d/band = amp·(n − ½)·4m(1 − m). At the noise's extreme
 *   (n − ½ = ½) solving for d = reach gives amp = 2x / (1 − 4x²), x = reach/band.
 *   ⚑ "Linear ramp" is W1's own reading of the blurred band; the Gaussian's
 *   tails make the real excursion a little shorter. Judged by eye.
 *
 * ⭐ THE ROUGHNESS (`weights`, `stretch`). The octave gain: weights 1, g, g²,
 *   normalised. ⛔ More equal-weight octaves NARROW the sum (central limit), so
 *   without a matching stretch a rougher edge would also wander LESS. The
 *   stretch hands back W1's spread at every gain. An octave under
 *   {@link MIN_OCTAVE_TEXELS} is dropped BEFORE normalising, so the spread
 *   survives that too.
 */
export function noiseShape(
    blend: number,
    band: number,
    reach: number,
    texelsPerUnit: number,
    grainUnits: number,
    roughness: number,
): NoiseShape {
    const soft = Math.min(0.5, Math.max(blend, 1 / texelsPerUnit) / (2 * band));
    const x = reach / band;
    const amp = 2 * x / (1 - 4 * x * x);

    const grainTexels = grainUnits * texelsPerUnit;
    const raw = OCTAVE_SCALES.map((scale, i) =>
        i === 0 || grainTexels / scale >= MIN_OCTAVE_TEXELS ? Math.pow(roughness, i) : 0);
    const total = raw.reduce((a, b) => a + b, 0);
    const weights = raw.map(w => w / total);
    return {amp, soft, weights, stretch: NOISE_STRETCH * W1_SPREAD / spreadOf(weights)};
}

/** A JS number as a GLSL float literal (`1` alone is an int in GLSL ES 1.0). */
function glsl(value: number): string {
    return Number.isInteger(value) ? value.toFixed(1) : String(value);
}

// GLSL ES 1.0 so it runs on WebGL1 and 2 alike. ⚑ Pixi 8's mesh pipe feeds
// exactly these names — `aPosition`/`aUV`, the global `uProjectionMatrix` +
// `uWorldTransformMatrix` and the local `uTransformMatrix` — and a shader that
// names them differently draws NOTHING without a single error.
const VERTEX = `
attribute vec2 aPosition;
attribute vec2 aUV;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;

varying vec2 vUV;
varying vec2 vWorld;

void main() {
    mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
    gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
    vUV = aUV;
    // The quad's LOCAL coordinates are world px — see applyMaskNoise.
    vWorld = aPosition;
}
`;

// ⭐ THE WHOLE LOOK, in four lines of main() — every uniform from noiseShape:
//   m = the blurred ramp, 0.5 on the authored line (D22)
//   n = value-noise fbm keyed to world px, weighted per octave, stretched
//   v = m + amp·(n − ½)·4m(1 − m)
//   a = linear remap of v around ½ with half-width s
// ⚑ The 4m(1 − m) bump is what keeps the blotches INSIDE the band: it is 1 on
// the line and 0 where the ramp is flat, so noise can never lift a far-outside
// texel to visible and leave a patch floating at the footprint's rectangular
// edge. ⚑ And the remap with s = ½ is the identity, so a reach → 0 inside a
// band that is all fade converges on the clean ramp rather than jumping.
const FRAGMENT = `
precision highp float;

varying vec2 vUV;
varying vec2 vWorld;

uniform sampler2D uTexture;
uniform float uAmp;
uniform float uSoft;
uniform float uGrain;
uniform vec3 uWeights;
uniform float uStretch;

// Dave Hoskins' hash12: no sin(), so it holds precision at world-px scale.
float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
               mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}

// The weights sum to 1, so this stays in 0…1 whatever the mix.
float fbm(vec2 p) {
    return uWeights.x * valueNoise(p * ${glsl(OCTAVE_SCALES[0])} + ${glsl(OCTAVE_OFFSETS[0])})
        + uWeights.y * valueNoise(p * ${glsl(OCTAVE_SCALES[1])} + ${glsl(OCTAVE_OFFSETS[1])})
        + uWeights.z * valueNoise(p * ${glsl(OCTAVE_SCALES[2])} + ${glsl(OCTAVE_OFFSETS[2])});
}

void main() {
    float m = texture2D(uTexture, vUV).a;
    // fbm crowds the middle of its range; stretch it back out so the reach's
    // extreme is actually reached.
    float n = clamp((fbm(vWorld / uGrain) - 0.5) * uStretch + 0.5, 0.0, 1.0);
    float v = m + uAmp * (n - 0.5) * 4.0 * m * (1.0 - m);
    float a = clamp((v - 0.5) / (2.0 * uSoft) + 0.5, 0.0, 1.0);
    // Premultiplied white, exactly what the blurred silhouette was: the mask
    // filter reads .r and .a, and both must carry the value.
    gl_FragColor = vec4(a);
}
`;

let warnedRenderer = false;

/**
 * Re-bakes a blurred mask with the wobble applied, into a NEW texture of the
 * same size, or returns `null` and leaves the caller on the clean ramp.
 *
 * ⚑ The input is NOT freed here — the caller owns both and frees the one it
 * does not keep. ⚑ A fresh RenderTexture's contents are UNDEFINED, not blank
 * (MapFog.ts carries the same note), hence the explicit transparent clear.
 *
 * @param footprint     the mask's box in WORLD PX — the quad is drawn over it,
 *                      which is what makes the shader's `vWorld` world px
 * @param texelsPerPx   the SAME density the input was baked at
 * @param grainPx       the noise grain, world px
 * @param shape         the uniforms {@link noiseShape} derived for this mask
 */
export function applyMaskNoise(
    renderer: Renderer,
    blurred: RenderTexture,
    footprint: { x: number, y: number, width: number, height: number },
    texelsPerPx: number,
    grainPx: number,
    shape: NoiseShape,
): RenderTexture | null {
    // ⛔ GLSL only. Both Applications take Pixi 8's default (WebGL) preference;
    // should that ever change, the wobble degrades to the clean ramp (D11's
    // posture) instead of breaking the paint.
    if (renderer.type !== RendererType.WEBGL) {
        if (!warnedRenderer) {
            warnedRenderer = true;
            console.warn('MaskNoise: the blend wobble needs WebGL; drawing clean soft edges.');
        }
        return null;
    }

    const {x, y, width, height} = footprint;
    const geometry = new MeshGeometry({
        positions: new Float32Array([x, y, x + width, y, x + width, y + height, x, y + height]),
        uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
        indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    });
    const shader = new Shader({
        glProgram: GlProgram.from({
            vertex: VERTEX,
            fragment: FRAGMENT,
            name: 'mask-noise',
            preferredFragmentPrecision: 'highp',
        }),
        resources: {
            uTexture: blurred.source,
            noiseUniforms: new UniformGroup({
                uAmp: {value: shape.amp, type: 'f32'},
                uSoft: {value: shape.soft, type: 'f32'},
                uGrain: {value: grainPx, type: 'f32'},
                uWeights: {value: new Float32Array(shape.weights), type: 'vec3<f32>'},
                uStretch: {value: shape.stretch, type: 'f32'},
            }),
        },
    });

    const output = RenderTexture.create({width: blurred.width, height: blurred.height});
    // The same holder transform the silhouette was drawn with, so texel (i, j)
    // of the output lies exactly over texel (i, j) of the input.
    const holder = new Container();
    holder.addChild(new Mesh({geometry, shader}));
    holder.scale.set(texelsPerPx);
    holder.position.set(-x * texelsPerPx, -y * texelsPerPx);
    renderer.render({
        container: holder,
        target: output,
        clear: true,
        clearColor: [0, 0, 0, 0],
    });
    holder.destroy({children: true});
    geometry.destroy();
    // ⚑ `false`: the program is cached and shared by every mask in the zone.
    shader.destroy(false);
    return output;
}
