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
 * ⚑ `maskDensity` is pure and vitest-reachable; `applyMaskNoise` needs a GPU
 * and is judged by eye and by the harness.
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
 * The ceiling a WOBBLY mask may raise its density to. [PLACEHOLDER]
 *
 * ⚑ Noise is not a low-frequency ramp: a narrow road's grain is a fraction of
 * a unit, which the base density cannot draw. The ceiling is what keeps a long
 * diagonal river — whose mask is its whole bounding BOX — from asking for a
 * texture the size of the map. VRAM is the axis this spends.
 */
export const WOBBLE_MAX_TEXELS_PER_UNIT = {desktop: 16, mobile: 8};

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

/** Noise grain as a fraction of the blend band, for a profile that does not
 *  author `wobbleSize`. [PLACEHOLDER]. ⚑ D2 first ruled ONE knob with the grain
 *  always derived; the PO amended it the same day, once the coupling was
 *  spelled out (a wider band meant bigger lumps whether you wanted them or not). */
export const GRAIN_PER_BAND = 0.5;

/**
 * The density a mask is baked at, and the noise grain drawn into it.
 *
 * ⚑ ONE density feeds the texture size, the blur strength AND the grain. A
 * mask that hits the cap gets a coarser texture, and a blur or a grain computed
 * off the uncapped density would draw a band or a blotch several times too
 * wide. That is why the grain is re-derived AFTER the cap.
 *
 * @param blend         the band width, world units
 * @param wobble        0…1; 0 returns exactly the C5 density and no grain
 * @param longestUnits  the footprint's longer side, world units
 * @param wobbleSize    the profile's authored grain, world units; 0 derives it
 *                      from the band (D2 amended)
 */
export function maskDensity(
    blend: number,
    wobble: number,
    longestUnits: number,
    mobile: boolean,
    wobbleSize: number = 0,
): { texelsPerUnit: number, grainUnits: number } {
    const device = mobile ? 'mobile' : 'desktop';
    let texelsPerUnit = BASE_TEXELS_PER_UNIT[device];
    let grainTarget = 0;
    if (wobble > 0 && blend > 0) {
        grainTarget = wobbleSize > 0 ? wobbleSize : blend * GRAIN_PER_BAND;
        texelsPerUnit = Math.min(
            Math.max(texelsPerUnit, MIN_GRAIN_TEXELS / grainTarget),
            WOBBLE_MAX_TEXELS_PER_UNIT[device],
        );
    }
    if (longestUnits * texelsPerUnit > MASK_MAX_TEXELS) {
        texelsPerUnit = MASK_MAX_TEXELS / longestUnits;
    }
    const grainUnits = grainTarget > 0
        ? Math.max(grainTarget, MIN_GRAIN_TEXELS / texelsPerUnit)
        : 0;
    return {texelsPerUnit, grainUnits};
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

// ⭐ THE WHOLE LOOK, in four lines of main():
//   m = the blurred ramp, 0.5 on the authored line (D22)
//   n = value-noise fbm keyed to world px, stretched to fill 0…1
//   v = m + wobble·(n − ½)·4m(1 − m)
//   a = linear remap of v around ½ with half-width s
// ⚑ The 4m(1 − m) bump is what keeps the blotches INSIDE the band: it is 1 on
// the line and 0 where the ramp is flat, so noise can never lift a far-outside
// texel to visible and leave a patch floating at the footprint's rectangular
// edge. ⚑ And the remap with s = ½ is the identity, so wobble → 0 converges on
// the clean ramp continuously rather than jumping.
const FRAGMENT = `
precision highp float;

varying vec2 vUV;
varying vec2 vWorld;

uniform sampler2D uTexture;
uniform float uWobble;
uniform float uSoft;
uniform float uGrain;

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

float fbm(vec2 p) {
    float sum = 0.5 * valueNoise(p);
    sum += 0.25 * valueNoise(p * 2.03 + 17.1);
    sum += 0.125 * valueNoise(p * 4.01 + 41.7);
    return sum / 0.875;
}

void main() {
    float m = texture2D(uTexture, vUV).a;
    // fbm crowds the middle of its range; stretch it back out so the knob's
    // top end actually reaches the edge of the band.
    float n = clamp((fbm(vWorld / uGrain) - 0.5) * 1.8 + 0.5, 0.0, 1.0);
    float v = m + uWobble * (n - 0.5) * 4.0 * m * (1.0 - m);
    float a = clamp((v - 0.5) / (2.0 * uSoft) + 0.5, 0.0, 1.0);
    // Premultiplied white, exactly what the blurred silhouette was: the mask
    // filter reads .r and .a, and both must carry the value.
    gl_FragColor = vec4(a);
}
`;

/** The edge's half-width after the threshold, in ramp units: ½ (the clean ramp,
 *  unchanged) at wobble 0, narrowing to a crisp edge at 1. [PLACEHOLDER] */
function softness(wobble: number): number {
    return 0.5 + (0.06 - 0.5) * wobble;
}

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
 */
export function applyMaskNoise(
    renderer: Renderer,
    blurred: RenderTexture,
    footprint: { x: number, y: number, width: number, height: number },
    texelsPerPx: number,
    wobble: number,
    grainPx: number,
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
                uWobble: {value: wobble, type: 'f32'},
                uSoft: {value: softness(wobble), type: 'f32'},
                uGrain: {value: grainPx, type: 'f32'},
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
