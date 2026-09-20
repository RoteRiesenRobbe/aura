import {AlphaFilter, Container, Sprite, Texture} from 'pixi.js';
import {meter2px} from '../../../client-data/BasicConfig';
import {PrerenderEvent} from '../../core/logic/Events';
import {getZoneData} from '../../ground-textures/logic/GroundTextureManager';
import {gameObjectId} from '../../common/logic/Types';
import * as Atmospheres from '../../atmospheres/logic/Atmospheres';
import * as Clearings from '../../atmospheres/logic/Clearings';
import {
    ATMOSPHERE_PROFILES, DEFAULT_PROFILE, declaresDarkness, declaresHaze,
    lightRadiusWithSight,
    resolveIn, resolveSight,
} from '../../regions/logic/Regions';
import {advanceRamp, ramp, rampSettled, rampTo} from '../../regions/logic/Ramp';

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
    // the player's own sight floor (Regions.SELF_SIGHT_FLOOR_PX, authorable
    // per profile since A2) is the guaranteed minimum.
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
    // How long a full `sight` crossing takes, in ms (A2). A hole that snapped
    // from the floor to a room's worth of vision at a polygon edge is a pop;
    // this is short enough to feel like your eyes adjusting and long enough
    // that the boundary is not a line. [PLACEHOLDER]
    SIGHT_RAMP_MS: 400,
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

/** The prop type whose placements cast a static light. Matched against the
 *  `type` in `zone.props`, which is the prop's `name` in api/props/. */
const TORCH_PROP_TYPE = 'Torch';
/**
 * A torch lights HALF as far as a campfire (PO 2026-09-20), and it is written
 * as a fraction rather than as 3.5 deliberately: the two are the same kind of
 * thing, so the small one should follow the big one when the big one is
 * retuned. Same argument the campfire radius above makes for reading its own
 * value out of the skill definition instead of restating it. [PLACEHOLDER].
 */
const TORCH_LIGHT_FRACTION = 0.3;
const TORCH_LIGHT_RADIUS: number = CAMPFIRE_LIGHT_RADIUS * TORCH_LIGHT_FRACTION;

interface LightSource {
    // Minimal structural slice of GameObject — id + world-positioned shape.
    object: { id: gameObjectId, shape: Container };
    sprite: Sprite;
    /** The wire's own radius in px, kept apart from the DRAWN size because the
     *  local player's hole is `max(wire, sight)` and sight moves every frame
     *  while the wire value only changes when the server says so (D7). */
    wireRadiusPx: number;
    /** Is this the LOCAL player's hole? Only that one gets `sight`: it answers
     *  "how far can I see", which is a question about the viewer and not about
     *  the entity. A remote player standing in fog keeps their own light. */
    own: boolean;
}

interface Circle {
    x: number;
    y: number;
    // Squared, so the hit test never needs a square root.
    radiusSq: number;
}

let layer: Container = null;
// ⭐ THE HAZE LAYER IS A SEPARATE FILTERED CONTAINER, and that separation is the
// whole feature (PO 2026-09-14). The darkness layer's AlphaFilter forces it into
// its own render texture, and an erase sprite removes alpha from everything
// already in that texture — which is exactly why a lantern cuts fog today. A
// sibling container INSIDE the darkness layer would not help: it composites into
// the same target before the holes are punched.
//
// ⛔ So haze lives outside the darkness layer entirely, with a filter of its own,
// and nothing in the darkness layer can reach it. A lamp shows you the fog; it
// does not disperse it.
//
// ⚑ It is drawn UNDER the darkness (Game adds it to cameraGroup first), so fog
// is only visible where there is light to see it by: an unlit smoky cave reads
// black, and its fog appears inside the lantern pocket. ⚑ It still needs its own
// filter despite having no light holes, because an authored `haze: 0` clearing
// is an erase, and an unscoped erase would eat the world beneath.
let hazeLayer: Container = null;
let hazeActive = false;
// The atmosphere shapes' own child container, inserted BETWEEN the dark
// circles and the erase holes (plan-region-atmosphere.md A1).
//
// ⭐ A child container rather than shapes added straight to the layer, and the
// reason is ORDER. Three things share this layer and the order is load-bearing:
// dark circles, then the DARKNESS shapes, then every erase hole (static campfire glows and
// the wire-driven lights that `setLightRadius` appends later). Game repaints
// the atmospheres a SECOND time when the zone's ground tiles land, and a repaint
// that re-added them to the layer would put the fog on top of the campfire
// glows and quietly seal them shut. Emptying one container in place cannot.
let atmosphereLayer: Container = null;
const radialTextures = new Map<number, Texture>();
let active = false;
/** The local player's unaided sight radius in world PX, easing across
 *  boundaries rather than snapping (A2). Starts at the shipped floor, which is
 *  what every zone that authors no `sight` keeps forever. */
const sightPx = ramp(meter2px(DEFAULT_PROFILE.sight));
const lights = new Map<gameObjectId, LightSource>();
// Hit-test geometry for isHidden(), in the same world-px space as the sprites.
// Kept alongside the sprites rather than derived from them because the sprite
// radii include the soft fade, and the fade is exactly the part that must NOT
// count as "hidden".
const darkCircles: Circle[] = [];
const staticLights: Circle[] = [];

/** Where {@link RegionPaint.paintAtmospheres} draws — emptied and refilled by
 *  Game on every terrain repaint, never re-parented. Null before the first
 *  {@link loadZone}. */
export function atmosphereContainer(): Container {
    return atmosphereLayer;
}

export function setup(darknessLayer: Container, hazeContainer: Container) {
    layer = darknessLayer;
    layer.filters = [new AlphaFilter({alpha: DarknessVisuals.MAX_ALPHA})];
    layer.visible = false;
    // ⚑ Full alpha, unlike the darkness: MAX_ALPHA is how much of the world a
    // DARK AREA hides, and a fog bank's thickness is its own `haze` value. The
    // filter is here for render-target isolation, not for opacity.
    hazeContainer.filters = [new AlphaFilter({alpha: 1})];
    hazeContainer.visible = false;
    hazeLayer = hazeContainer;
    PrerenderEvent.subscribe(update);
}

/** Where the HAZE half of {@link RegionPaint.paintAtmospheres} draws. Null
 *  before {@link setup}. */
export function hazeContainer(): Container {
    return hazeLayer;
}

/**
 * Places the active zone's dark areas (called next to
 * GroundTextureManager.loadZone). No dark areas → the layer stays invisible
 * and every light update is a no-op.
 */
export function loadZone(zoneName: string) {
    clear();
    // Dark areas and campfire glows are client-visual, so they are authored
    // zone-local and placed here (plan-underworld.md U2) — see
    // GroundTextureManager.loadZone for why the server does not do it.
    const zoneOrigin = getZoneData(zoneName)?.origin;
    const ox = zoneOrigin ? zoneOrigin.x : 0;
    const oy = zoneOrigin ? zoneOrigin.y : 0;
    const darkAreas = getZoneData(zoneName)?.darkAreas || [];
    // ⛔ `active` GATES FIVE THINGS, not one: `layer.visible`, the static
    // campfire-glow block below, `setLightRadius`, `update` and `isHidden`. It
    // read `darkAreas.length > 0` alone until A1, which meant a zone that
    // authored darkness and no circles — the underworld, the whole point of the
    // feature — drew NOTHING, placed no campfire glow, never opened the
    // player's own hole, and reported no error anywhere. It presented exactly
    // as "the feature was never wired up".
    //
    // ⚑ Any atmosphere that DECLARES darkness counts — including one declaring
    // ZERO. Since A4 that is no longer an erase but a plain statement that this
    // air is not dark, and a zone that bothers to say so is still a zone that
    // means to use the overlay; a lit hole in nothing costs one invisible
    // stencil, and the alternative is the five-way L12 silence again.
    //
    // ⛔ CLEARINGS ARE DELIBERATELY NOT COUNTED HERE, which is the one place A4
    // does NOT simply mirror the atmosphere. A clearing only ever SUBTRACTS, so
    // a zone whose air is entirely clearings has nothing to darken and nothing
    // to erase — turning the layer on for it would light the overlay up to draw
    // holes in an empty texture, every frame, forever.
    const air = Atmospheres.loadedAtmospheres();
    active = darkAreas.length > 0 || air.some(a => declaresDarkness(a));
    layer.visible = active;
    // ⚑ Gated separately, and that is what keeps the second render target from
    // costing anything in a zone with no fog: a layer nobody authored is never
    // drawn, exactly as the darkness layer has always worked.
    hazeActive = air.some(a => declaresHaze(a));
    if (hazeLayer !== null) { hazeLayer.visible = hazeActive; }

    darkAreas.forEach((area) => {
        // Fully dark up to the authored radius; the fade lives outside it.
        const fadeRadius = area.radius + DarknessVisuals.EDGE_FADE;
        const sprite = new Sprite(texture(area.radius / fadeRadius));
        sprite.anchor.set(0.5);
        sprite.position.set(meter2px(area.x + ox), meter2px(area.y + oy));
        sprite.width = sprite.height = 2 * meter2px(fadeRadius);
        layer.addChild(sprite);
        // The AUTHORED radius, not fadeRadius: inside it the world is fully
        // black, in the fade ring it is only partly dark and a plate there
        // still matches what the player can see.
        darkCircles.push({
            x: meter2px(area.x + ox),
            y: meter2px(area.y + oy),
            radiusSq: meter2px(area.radius) ** 2,
        });
    });

    // The atmosphere shapes' container, added AFTER the circles and BEFORE
    // every erase hole. Empty here: Game paints into it, and repaints it when
    // the zone's ground tiles land (fog can name a texture too).
    atmosphereLayer = new Container();
    layer.addChild(atmosphereLayer);

    // Static campfire glow — erase sprites appended after the dark sprites so
    // they render on top within this layer's own texture. The wire-driven
    // hole for an in-range fire overlaps this one; double-erase clamps, the
    // result is identical.
    if (active) {
        const zone = getZoneData(zoneName);
        const campfires = zone?.campfires || [];
        campfires.forEach((fire) => {
            punchStaticLight(fire.x + ox, fire.y + oy, CAMPFIRE_LIGHT_RADIUS);
        });
        // Torches (PO 2026-09-20) — a small permanent fire, lighting half as
        // far as a campfire. ⭐ They are read from `zone.props` rather than
        // from the wire for exactly the reason the campfires are: a light
        // that arrived with its entity would pop a dark pocket lit the moment
        // its source drifted into the interest range, which is the defect the
        // static-glow path exists to fix. A torch's own sprite still streams
        // like any other prop; only its LIGHT is authored-static.
        //
        // ⛔ And the hole is only half the job. `isHidden` answers gameplay
        // questions (a nameplate in the dark) off `staticLights`, so a torch
        // that painted a hole without registering one would light the picture
        // and leave the sim insisting the lit pocket is dark — the A4 seam
        // verbatim (see the comment on `inDarkness`). `punchStaticLight` does
        // both, which is why it exists rather than two call sites.
        (zone?.props || []).forEach((prop) => {
            if (prop.type === TORCH_PROP_TYPE) {
                punchStaticLight(prop.x + ox, prop.y + oy, TORCH_LIGHT_RADIUS);
            }
        });
    }
}

/**
 * One authored, never-moving light: the erase hole the player SEES and the
 * circle `isHidden` ANSWERS FROM, written together so neither can be added
 * without the other. Positions are world units; the caller has already
 * applied the zone origin.
 */
function punchStaticLight(x: number, y: number, radius: number) {
    const px = meter2px(x);
    const py = meter2px(y);
    const radiusPx = meter2px(radius);

    const sprite = new Sprite(texture(DarknessVisuals.LIGHT_CORE_FRACTION));
    sprite.anchor.set(0.5);
    sprite.blendMode = 'erase';
    sprite.position.set(px, py);
    sprite.width = sprite.height = 2 * radiusPx;
    layer.addChild(sprite);

    staticLights.push({x: px, y: py, radiusSq: radiusPx ** 2});
}

/**
 * Sizes (or removes, radiusPx <= 0) the light hole an entity punches into
 * the darkness. Wire light_radius is already in px. Erase sprites are
 * appended after the dark sprites, so they always render on top of them
 * within this layer's own render texture.
 */
export function setLightRadius(
    object: { id: gameObjectId, shape: Container },
    radiusPx: number,
    own = false,
) {
    if (!active) {
        return;
    }
    let light = lights.get(object.id);
    // ⚑ The OWN light is never removed for a zero radius: the player always has
    // at least their sight floor, and a snapshot with no light_radius means "no
    // light SOURCE", not "no eyes". Removing it would black out the avatar the
    // moment a torch burned out.
    if (radiusPx <= 0 && !own) {
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
        light = {object, sprite, wireRadiusPx: 0, own};
        lights.set(object.id, light);
    }
    light.object = object;
    light.own = light.own || own;
    light.wireRadiusPx = Math.max(radiusPx, 0);
    applyRadius(light);
}

/**
 * The drawn size of one hole — ⭐ **D7, and it is one `Math.max`.**
 *
 * `sight` may only ever RAISE the local player's hole, never lower it. Without
 * that an authored region could cancel a Lantern, and the GDD's whole
 * light-vs-damage trade-off — the aura is what buys you the room — would be
 * revocable by map data. It also means `sight` can only ever make a place
 * kinder, which is a good property for a knob nobody has tuned.
 */
function applyRadius(light: LightSource) {
    const radius = light.own
        ? lightRadiusWithSight(light.wireRadiusPx, sightPx.value)
        : light.wireRadiusPx;
    light.sprite.width = light.sprite.height = 2 * radius;
}

/**
 * Per-frame: glue light holes to their (interpolated) entity positions and
 * self-clean lights whose entity left the viewport (GameObject.hide detaches
 * the shape from its layer).
 */
function update(deltaMS: number) {
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
    advanceSight(deltaMS);
}

/**
 * Resolves `sight` at the local player's INTERPOLATED position and eases the
 * hole toward it (A2).
 *
 * ⚑ The interpolated position, not the snapshot one — the sprite was just moved
 * to it above, and resolving at a different point would make the ramp fire a
 * step early or late at a boundary the player can see themselves crossing.
 *
 * ⚑ `deltaMS` arrives from `PrerenderEvent`, which `Game.loop` triggers AFTER
 * its `paused` guard — so a ramp can never be advanced across a pause and jump
 * the whole way (L8, the trap `advanceSurfaceScroll` documents).
 *
 * ⭐ Costs nothing in a zone that authors no atmospheres: the resolve short-
 * circuits on an empty list, `rampTo` is a no-op when the target has not moved,
 * and `advanceRamp` returns immediately once settled. The common frame does one
 * array-length check.
 */
function advanceSight(deltaMS: number) {
    const own = ownLight();
    if (own === undefined) {
        return;
    }
    const shapes = Atmospheres.loadedAtmospheres();
    const target = shapes.length === 0
        ? DEFAULT_PROFILE.sight
        : resolveSight(own.sprite.position, shapes, ATMOSPHERE_PROFILES);
    rampTo(sightPx, meter2px(target));
    if (rampSettled(sightPx)) {
        return;
    }
    advanceRamp(sightPx, deltaMS, DarknessVisuals.SIGHT_RAMP_MS);
    applyRadius(own);
}

function ownLight(): LightSource | undefined {
    for (const light of lights.values()) {
        if (light.own) { return light; }
    }
    return undefined;
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
    if (!active || !(inAnyCircle(x, y, darkCircles) || inDarkness(x, y))) {
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

/**
 * Is this world-px point swallowed by an authored atmosphere?
 *
 * ⭐ NO NEW GEOMETRY CODE. `resolveIn` already walks a shape list backwards and
 * answers "the last shape containing this point whose profile declares the
 * property" — the identical rule the painter drew by, over the identical array
 * in the identical order. So the drawing and the lookup agree by construction,
 * and D3's clearing falls out for free: a `darkness: 0` pocket is the last
 * declaring shape at that point, so it answers 0 and the plate stays visible,
 * exactly as the erase hole makes the mob visible.
 *
 * ⚑ `resolveIn` and not `resolve`: `resolve` walks the REGIONS, which is the
 * ground. Darkness lives on the atmospheres and nowhere else (D0/D15).
 *
 * ⛔⛔ THE CLEARING CHECK BELOW IS THE A4 SEAM, AND IT IS THE ONE THING IN THAT
 * chunk THAT LOOKS RIGHT ON SCREEN WHILE BEING WRONG. Until A4 a clearing WAS
 * an atmosphere and DID declare `darkness: 0`, so it was the last declaring
 * shape at its point and this walk answered 0 all by itself — the comment above
 * used to say it "falls out for free". A4 gave the clearing its own class and
 * took its profile away (L7), and a profile-less shape is INVISIBLE to a walk
 * that looks profiles up by name. Delete these three lines and the picture stays
 * perfect — the hole is still painted, the mob is still lit — while the sim
 * reports the player as standing in darkness and hides every nameplate in the
 * lit pocket. Nothing throws, and no screenshot shows it.
 *
 * ⭐ D17 is why this is a flat containment test and not an ordering comparison:
 * a clearing is applied AFTER every atmosphere regardless of authoring order,
 * so "is this point in a clearing that cuts darkness" is the whole question.
 * `paintAtmospheres` cuts its holes by the same rule in the same pass order, so
 * the drawing and this lookup agree by construction.
 */
function inDarkness(x: number, y: number): boolean {
    const shapes = Atmospheres.loadedAtmospheres();
    if (shapes.length === 0) {
        return false;
    }
    if (Clearings.clearsAt('darkness', {x, y}, Clearings.loadedClearings())) {
        return false;
    }
    return resolveIn('darkness', {x, y}, shapes, ATMOSPHERE_PROFILES) > 0;
}

function clear() {
    lights.forEach((light, id) => removeLight(id, light));
    // ⚑ Back to the floor on a zone swap, INSTANTLY. Easing here would ramp
    // across a teleport between two zones that share nothing, which reads as a
    // slow fade-in on arrival rather than as eyes adjusting.
    sightPx.value = sightPx.target = sightPx.from = meter2px(DEFAULT_PROFILE.sight);
    // ⚑ `{children: true}`, unlike the terrain layers' bare `destroy()`. The
    // atmosphere container holds the painted fog, and a bare destroy on a
    // Container frees the container and STRANDS its children. ⛔ It does NOT
    // free the blend-mask RenderTextures: those came back from paintAtmospheres
    // and Game owns them, exactly as it owns the terrain ones.
    layer.removeChildren().forEach(child => child.destroy({children: true}));
    atmosphereLayer = null;
    if (hazeLayer !== null) {
        hazeLayer.removeChildren().forEach(child => child.destroy({children: true}));
        hazeLayer.visible = false;
    }
    hazeActive = false;
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
