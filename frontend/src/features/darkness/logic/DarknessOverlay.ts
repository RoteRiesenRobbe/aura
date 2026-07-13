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
    // a dark area. [PLACEHOLDER]
    MAX_ALPHA: 0.94,
    // Fraction of the radius that is fully dark / fully lit before the soft
    // edge starts. [PLACEHOLDER]
    CORE_FRACTION: 0.55,
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

let layer: Container = null;
let radialTexture: Texture = null;
let active = false;
const lights = new Map<gameObjectId, LightSource>();

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
        const sprite = new Sprite(texture());
        sprite.anchor.set(0.5);
        sprite.position.set(meter2px(area.x), meter2px(area.y));
        sprite.width = sprite.height = 2 * meter2px(area.radius);
        layer.addChild(sprite);
    });

    // Static campfire glow — erase sprites appended after the dark sprites so
    // they render on top within this layer's own texture. The wire-driven
    // hole for an in-range fire overlaps this one; double-erase clamps, the
    // result is identical.
    if (active) {
        const campfires = getZoneData(zoneName)?.campfires || [];
        campfires.forEach((fire) => {
            const sprite = new Sprite(texture());
            sprite.anchor.set(0.5);
            sprite.blendMode = 'erase';
            sprite.position.set(meter2px(fire.x), meter2px(fire.y));
            sprite.width = sprite.height = 2 * meter2px(CAMPFIRE_LIGHT_RADIUS);
            layer.addChild(sprite);
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
        const sprite = new Sprite(texture());
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

function clear() {
    lights.forEach((light, id) => removeLight(id, light));
    layer.removeChildren().forEach(child => child.destroy());
    active = false;
    layer.visible = false;
}

/**
 * One shared soft radial gradient (opaque core, transparent rim), generated
 * once on a canvas — used for the dark circles (normal blend) and the light
 * holes (erase blend, alpha = erase strength → soft light edge).
 */
function texture(): Texture {
    if (radialTexture === null) {
        const size = DarknessVisuals.TEXTURE_SIZE;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createRadialGradient(
            size / 2, size / 2, (size / 2) * DarknessVisuals.CORE_FRACTION,
            size / 2, size / 2, size / 2,
        );
        gradient.addColorStop(0, 'rgba(0, 0, 0, 1)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);
        radialTexture = Texture.from(canvas);
    }
    return radialTexture;
}
