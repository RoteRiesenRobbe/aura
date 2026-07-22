import {AlphaFilter, Container, Sprite, Texture} from 'pixi.js';
import {meter2px} from '../../../client-data/BasicConfig';
import {PrerenderEvent} from '../../core/logic/Events';
import {getZoneData} from '../../ground-textures/logic/GroundTextureManager';
import {gameObjectId} from '../../common/logic/Types';

/**
 * Darkness overlay (atmosphere & recovery chunk 3).
 *
 * Dark areas are authored per zone (`zone.darkAreas`, circles in server
 * units) and are constantly dark — independent of the day/night cycle (§6.5),
 * which is why this layer is deliberately NOT in the DayCycle filtered set.
 * Light sources (wire `light_radius` on Character/Mob) punch soft holes into
 * the darkness via erase-blend sprites.
 *
 * The AlphaFilter forces the layer to render into its own texture, which
 * (a) confines the erase blending to the darkness instead of the world
 * beneath, and (b) flattens overlapping dark circles to one uniform opacity
 * before the alpha applies — chained circles ("tunnels") show no darker
 * intersections.
 */

const DarknessVisuals = {
    // Overall darkness opacity — how much of the world stays visible inside
    // a dark area. FULLY opaque (playtest-1 Pass C item 3): at the former 0.94
    // the world beneath still came through at 6%, which measures as 9% of
    // daylight luminance and, crucially, PRESERVES relative contrast — props
    // stayed a readable silhouette against the ground, so the tunnel was
    // navigable without any light at all. That contradicts both gdd.md §6.5
    // ("field of view heavily restricted") and the 2026-07-17 ruling recorded
    // in Player.ts, so the residual 6% was never the design — it was the
    // placeholder. Vision now comes exclusively from the light holes, of which
    // the player's own MIN_SELF_LIGHT_PX glow is the guaranteed floor.
    MAX_ALPHA: 1,
    // Width (world units) of the soft edge appended OUTSIDE the authored
    // radius — the authored circle itself is guaranteed fully dark, so
    // overlapping circles chain without bright seams. [PLACEHOLDER]
    EDGE_FADE: 2,
    // Fraction of a light hole's radius that is fully lit before its soft
    // edge starts (light fades inside its radius, unlike dark areas).
    // [PLACEHOLDER]
    LIGHT_CORE_FRACTION: 0.55,
    TEXTURE_SIZE: 256,
};

// World campfires glow permanently (chunk 4 follow-up): their wire
// light_radius only streams while the fire is inside the interest range,
// which made a dark pocket "pop" lit the moment its fire entered the
// viewport. The fires are static and authored in the same bundled zone JSON
// as the dark areas, so their holes are punched at load. The radius (server
// units) comes straight from the bundled skill definition — the same repo-api
// bundling the zone data uses — so retuning the content value cannot desync
// the static glow from the wire-driven hole.
const campfireAura = require('../../../../../api/skills/mobs/campfire-aura.json');
const CAMPFIRE_LIGHT_RADIUS: number =
    campfireAura.effects.find((e) => e.type === 'light_aura')?.radius ?? 0;

interface LightSource {
    // Minimal structural slice of GameObject — id + world-positioned shape.
    object: { id: gameObjectId, shape: Container };
    sprite: Sprite;
}

interface Circle {
    x: number;
    y: number;
    // Squared, so the hit test never needs a square root.
    radiusSq: number;
}

let layer: Container = null;
const radialTextures = new Map<number, Texture>();
let active = false;
const lights = new Map<gameObjectId, LightSource>();
// Hit-test geometry for isHidden(), in the same world-px space as the sprites.
// Kept alongside the sprites rather than derived from them because the sprite
// radii include the soft fade, and the fade is exactly the part that must NOT
// count as "hidden".
const darkCircles: Circle[] = [];
const staticLights: Circle[] = [];

export function setup(darknessLayer: Container) {
    layer = darknessLayer;
    layer.filters = [new AlphaFilter({alpha: DarknessVisuals.MAX_ALPHA})];
    layer.visible = false;
    PrerenderEvent.subscribe(update);
}

/**
 * Places the active zone's dark areas (called next to
 * GroundTextureManager.loadZone). No dark areas → the layer stays invisible
 * and every light update is a no-op.
 */
export function loadZone(zoneName: string) {
    clear();
    const darkAreas = getZoneData(zoneName)?.darkAreas || [];
    active = darkAreas.length > 0;
    layer.visible = active;

    darkAreas.forEach((area) => {
        // Fully dark up to the authored radius; the fade lives outside it.
        const fadeRadius = area.radius + DarknessVisuals.EDGE_FADE;
        const sprite = new Sprite(texture(area.radius / fadeRadius));
        sprite.anchor.set(0.5);
        sprite.position.set(meter2px(area.x), meter2px(area.y));
        sprite.width = sprite.height = 2 * meter2px(fadeRadius);
        layer.addChild(sprite);
        // The AUTHORED radius, not fadeRadius: inside it the world is fully
        // black, in the fade ring it is only partly dark and a plate there
        // still matches what the player can see.
        darkCircles.push({
            x: meter2px(area.x),
            y: meter2px(area.y),
            radiusSq: meter2px(area.radius) ** 2,
        });
    });

    // Static campfire glow — erase sprites appended after the dark sprites so
    // they render on top within this layer's own texture. The wire-driven
    // hole for an in-range fire overlaps this one; double-erase clamps, the
    // result is identical.
    if (active) {
        const campfires = getZoneData(zoneName)?.campfires || [];
        campfires.forEach((fire) => {
            const sprite = new Sprite(texture(DarknessVisuals.LIGHT_CORE_FRACTION));
            sprite.anchor.set(0.5);
            sprite.blendMode = 'erase';
            sprite.position.set(meter2px(fire.x), meter2px(fire.y));
            sprite.width = sprite.height = 2 * meter2px(CAMPFIRE_LIGHT_RADIUS);
            layer.addChild(sprite);
            staticLights.push({
                x: meter2px(fire.x),
                y: meter2px(fire.y),
                radiusSq: meter2px(CAMPFIRE_LIGHT_RADIUS) ** 2,
            });
        });
    }
}

/**
 * Sizes (or removes, radiusPx <= 0) the light hole an entity punches into
 * the darkness. Wire light_radius is already in px. Erase sprites are
 * appended after the dark sprites, so they always render on top of them
 * within this layer's own render texture.
 */
export function setLightRadius(object: { id: gameObjectId, shape: Container }, radiusPx: number) {
    if (!active) {
        return;
    }
    let light = lights.get(object.id);
    if (radiusPx <= 0) {
        if (light) {
            removeLight(object.id, light);
        }
        return;
    }
    if (!light) {
        const sprite = new Sprite(texture(DarknessVisuals.LIGHT_CORE_FRACTION));
        sprite.anchor.set(0.5);
        sprite.blendMode = 'erase';
        layer.addChild(sprite);
        light = {object, sprite};
        lights.set(object.id, light);
    }
    light.object = object;
    light.sprite.width = light.sprite.height = 2 * radiusPx;
}

/**
 * Per-frame: glue light holes to their (interpolated) entity positions and
 * self-clean lights whose entity left the viewport (GameObject.hide detaches
 * the shape from its layer).
 */
function update() {
    if (!active) {
        return;
    }
    lights.forEach((light, id) => {
        if (light.object.shape.parent === null) {
            removeLight(id, light);
            return;
        }
        light.sprite.position.copyFrom(light.object.shape.position);
    });
}

function removeLight(id: gameObjectId, light: LightSource) {
    layer.removeChild(light.sprite);
    light.sprite.destroy();
    lights.delete(id);
}

/**
 * Is this world-px point swallowed by the darkness — inside an authored dark
 * area and reached by no light? Used by the overlays that render ABOVE the
 * darkness layer and would otherwise stay fully lit inside a black area
 * (mob name plates). Vision in the dark is the light role's job (GDD §6.5
 * "spotting targets"), and a readable plate over an invisible mob hands that
 * away for free.
 *
 * Cheap by construction: squared distances only, and it early-outs on the
 * dark-circle test, so a point in the lit 95% of the map costs one pass over
 * the zone's handful of circles and never touches the light lists.
 */
export function isHidden(x: number, y: number): boolean {
    if (!active || !inAnyCircle(x, y, darkCircles)) {
        return false;
    }
    if (inAnyCircle(x, y, staticLights)) {
        return false;
    }
    // Dynamic (wire-driven) lights: the full radius counts, not just the
    // fully-erased core, so a plate reappears as soon as any light reaches the
    // mob — the same moment the mob itself starts to become visible.
    for (const light of lights.values()) {
        const radius = light.sprite.width / 2;
        if ((x - light.sprite.position.x) ** 2 + (y - light.sprite.position.y) ** 2 <= radius ** 2) {
            return false;
        }
    }
    return true;
}

function inAnyCircle(x: number, y: number, circles: Circle[]): boolean {
    return circles.some(c => (x - c.x) ** 2 + (y - c.y) ** 2 <= c.radiusSq);
}

function clear() {
    lights.forEach((light, id) => removeLight(id, light));
    layer.removeChildren().forEach(child => child.destroy());
    darkCircles.length = 0;
    staticLights.length = 0;
    active = false;
    layer.visible = false;
}

/**
 * Soft radial gradient textures (opaque up to `coreFraction` of the radius,
 * transparent rim), generated on a canvas and cached per fraction — used for
 * the dark circles (normal blend, fraction depends on the authored radius so
 * the fade width stays constant in world units) and the light holes (erase
 * blend, alpha = erase strength → soft light edge).
 */
function texture(coreFraction: number): Texture {
    // Round the cache key so near-identical fractions share a texture.
    const key = Math.round(coreFraction * 100) / 100;
    let cached = radialTextures.get(key);
    if (!cached) {
        const size = DarknessVisuals.TEXTURE_SIZE;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createRadialGradient(
            size / 2, size / 2, (size / 2) * key,
            size / 2, size / 2, size / 2,
        );
        gradient.addColorStop(0, 'rgba(0, 0, 0, 1)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);
        cached = Texture.from(canvas);
        radialTextures.set(key, cached);
    }
    return cached;
}
