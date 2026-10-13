import {AlphaFilter, Container, Sprite, Texture} from 'pixi.js';
import {meter2px} from '../../../client-data/BasicConfig';
import {PrerenderEvent} from '../../core/logic/Events';
import {getZoneData} from '../../ground-textures/logic/GroundTextureManager';
import {flattenProps} from '../../zones/logic/PropLayers';
import {requireAll} from '../../common/logic/Utils';
import {gameObjectId} from '../../common/logic/Types';
import * as Atmospheres from '../../atmospheres/logic/Atmospheres';
import * as Clearings from '../../atmospheres/logic/Clearings';
import {
    ATMOSPHERE_PROFILES, DEFAULT_PROFILE, declaresDarkness, declaresHaze,
    lightRadiusWithSight,
    resolveIn, resolveSight,
} from '../../regions/logic/Regions';
import {advanceRamp, ramp, rampSettled, rampTo} from '../../regions/logic/Ramp';
import {authoredLightColor, lightTint, WHITE_LIGHT} from './LightColor';

/**
 * Darkness overlay (atmosphere & recovery chunk 3).
 *
 * Dark areas are authored per zone (`zone.darkAreas`, circles in server
 * units) and are constantly dark — independent of the day/night cycle (§6.5),
 * which is why this layer is deliberately NOT in the DayCycle filtered set.
 *
 * ⭐ THE LAYER IS A LIGHTMAP (plan-lightmap.md L1). It renders how LIT each
 * pixel is — white = fully lit, black = nothing seen — and the AlphaFilter
 * composites the finished texture over the world with `multiply`:
 *   1. a white base quad over the whole zone (D3: the map is opaque, so a
 *      coloured light can never tint daylight around it);
 *   2. dark circles and the darkness atmospheres paint toward their colour;
 *   3. clearings paint WHITE (D4);
 *   4. light sources (wire `light_radius` on Character/Mob, the static
 *      campfire and torch glows) SCREEN in their own colour (D2).
 *
 * ⭐ Screen is `1 - (1-ambient)(1-light)`, which is exactly what the erase holes
 * this replaced computed (`1 - d(1-a)` under a darkness d): white lights are
 * pixel-identical to the old build, partial darkness and soft rims included.
 *
 * The filter also forces the layer into its own render texture, which flattens
 * overlapping dark circles to one uniform value before the composite —
 * chained circles ("tunnels") show no darker intersections.
 *
 * ⛔ FULL DARKNESS SHOWS NOTHING (PO 2026-10-13, "no shine through ever"): a
 * black lightmap pixel multiplies the world to exactly 0. That holds only while
 * MAX_ALPHA is 1 and a darkness-1 profile is black, and the Go loader refuses
 * any other colour there (plan-lightmap.md D7).
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
    // ⛔ Under the multiply composite (plan-lightmap.md D1) anything below 1
    // mixes the world back in under every black pixel: shine-through.
    MAX_ALPHA: 1,
    // How far past the zone's bounds the white base quad reaches, in world
    // units: lights near the edge glow over the zone's outer ground, and a
    // light outside the base would screen onto transparent and tint daylight
    // (plan-lightmap.md D3).
    BASE_MARGIN: 64,
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
const campfireLight = campfireAura.effects.find((e) => e.type === 'light_aura');
const CAMPFIRE_LIGHT_RADIUS: number = campfireLight?.radius ?? 0;
// The glow's colour from the same effect (plan-lightmap.md D6): one file, both
// numbers, so the static glow and the wire-driven one cannot disagree.
const CAMPFIRE_LIGHT_COLOR: number = authoredLightColor(campfireLight?.color, WHITE_LIGHT);

/**
 * The static light each prop TYPE casts, in world units, keyed by the prop's
 * `name` in api/props/ (what `zone.props` names as `type`). A definition that
 * authors `lightFraction` lights that fraction of the campfire's radius: a
 * torch follows the campfire when the campfire is retuned (PO 2026-09-20).
 * [PLACEHOLDER] values.
 *
 * ⭐ Read from the prop file, never restated here, because the SERVER reads the
 * same key to map the torch's pocket (plan-map-fog-darkness.md C1): one number,
 * two readers, so the drawn pocket and the mapped one cannot drift apart.
 * ⚑ Its own require.context rather than Props.propDefinition: Props imports
 * _GameObject, which imports this module, and that cycle would run a class
 * `extends` before its base exists.
 */
const PROP_LIGHTS = new Map<string, { radius: number, color: number }>(
    (requireAll(require.context('../../../../../api/props', false, /\.json$/)) as unknown as
        { name: string, lightFraction?: number, lightColor?: string }[])
        .filter(def => (def.lightFraction ?? 0) > 0)
        // ⚑ A prop is a light SOURCE of its own (PO 2026-10-12, "one colour
        // per source"), so it authors `lightColor`; absent, it reads as a small
        // campfire. Client-only: the server's map fog reads the radius alone.
        .map(def => [def.name, {
            radius: CAMPFIRE_LIGHT_RADIUS * def.lightFraction,
            color: authoredLightColor(def.lightColor, CAMPFIRE_LIGHT_COLOR),
        }] as [string, { radius: number, color: number }]),
);

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
// its own render texture, and a light lifts everything already in that texture
// toward white — so fog painted there would be cut by every lantern. A sibling
// container INSIDE the darkness layer would not help: it composites into the
// same target before the lights are drawn.
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
// circles and the lights (plan-region-atmosphere.md A1).
//
// ⭐ A child container rather than shapes added straight to the layer, and the
// reason is ORDER. Four things share this layer and the order is load-bearing:
// the white base, dark circles, then the DARKNESS shapes, then every light (static campfire glows and
// the wire-driven lights that `setLightRadius` appends later). Game repaints
// the atmospheres a SECOND time when the zone's ground tiles land, and a repaint
// that re-added them to the layer would put the fog on top of the campfire
// glows and quietly seal them shut. Emptying one container in place cannot.
let atmosphereLayer: Container = null;
const radialTextures = new Map<string, Texture>();
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
    // ⭐ `multiply` composites the lightmap over the world (plan-lightmap.md D1):
    // a native blend on WebGL and WebGPU, set on the filter because the filter
    // is what draws the layer's texture back onto the screen.
    layer.filters = [new AlphaFilter({alpha: DarknessVisuals.MAX_ALPHA, blendMode: 'multiply'})];
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

    // ⭐ The lightmap's white base (plan-lightmap.md D3), first child, so
    // everything after it paints toward dark or back toward light. Without it
    // the render target clears to transparent, which multiplies as "lit" too —
    // but a coloured light screened onto transparent would tint daylight.
    // ⚑ The whole zone plus a margin, never just the dark shapes: a light can
    // stand anywhere in the zone.
    const bounds = getZoneData(zoneName)?.bounds;
    const base = new Sprite(Texture.WHITE);
    base.anchor.set(0.5);
    base.position.set(meter2px(ox), meter2px(oy));
    base.width = meter2px((bounds ? bounds.width : 0) + 2 * DarknessVisuals.BASE_MARGIN);
    base.height = meter2px((bounds ? bounds.height : 0) + 2 * DarknessVisuals.BASE_MARGIN);
    layer.addChild(base);

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
    // every light. Empty here: Game paints into it, and repaints it when
    // the zone's ground tiles land (fog can name a texture too).
    atmosphereLayer = new Container();
    layer.addChild(atmosphereLayer);

    // Static campfire glow — screen sprites appended after the dark sprites
    // so they render on top within this layer's own texture. The wire-driven
    // light for an in-range fire overlaps this one; two screens of a full
    // core stay white, exactly as the two erases this replaced did.
    if (active) {
        const zone = getZoneData(zoneName);
        const campfires = zone?.bindPoints || [];
        campfires.forEach((fire) => {
            punchStaticLight(fire.x + ox, fire.y + oy, CAMPFIRE_LIGHT_RADIUS, CAMPFIRE_LIGHT_COLOR);
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
        flattenProps(zone?.props).forEach((prop) => {
            const light = PROP_LIGHTS.get(prop.type);
            if (light !== undefined) {
                punchStaticLight(prop.x + ox, prop.y + oy, light.radius, light.color);
            }
        });
    }
}

/**
 * One authored, never-moving light: the glow the player SEES and the
 * circle `isHidden` ANSWERS FROM, written together so neither can be added
 * without the other. Positions are world units; the caller has already
 * applied the zone origin.
 */
function punchStaticLight(x: number, y: number, radius: number, color: number) {
    const px = meter2px(x);
    const py = meter2px(y);
    const radiusPx = meter2px(radius);

    const sprite = lightSprite(color);
    sprite.position.set(px, py);
    sprite.width = sprite.height = 2 * radiusPx;
    layer.addChild(sprite);

    staticLights.push({x: px, y: py, radiusSq: radiusPx ** 2});
}

/**
 * Sizes (or removes, radiusPx <= 0) the light an entity casts into the
 * darkness. Wire light_radius is already in px; wire light_color is 0 when
 * unauthored (white). Light sprites are appended after the dark sprites, so
 * they always render on top of them within this layer's own render texture.
 */
export function setLightRadius(
    object: { id: gameObjectId, shape: Container },
    radiusPx: number,
    own = false,
    color = 0,
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
        const sprite = lightSprite(color);
        layer.addChild(sprite);
        light = {object, sprite, wireRadiusPx: 0, own};
        lights.set(object.id, light);
    }
    light.object = object;
    light.own = light.own || own;
    light.wireRadiusPx = Math.max(radiusPx, 0);
    light.sprite.tint = lightTint(color);
    applyRadius(light);
}

/**
 * One light's sprite (plan-lightmap.md D2): the WHITE radial ramp, tinted, and
 * SCREENED onto the lightmap. Screen is `1 - (1-ambient)(1-light)`: it can only
 * lift a pixel toward the light's colour, never past white, so a light over
 * lit ground changes nothing and two overlapping lights combine exactly as the
 * erase holes this replaced did.
 *
 * ⛔ Never masked: a masked sprite draws through a filter pass and loses its
 * blend mode (the clearing build of 2026-09-17 read solid black for it).
 */
function lightSprite(color: number): Sprite {
    const sprite = new Sprite(texture(DarknessVisuals.LIGHT_CORE_FRACTION, true));
    sprite.anchor.set(0.5);
    sprite.blendMode = 'screen';
    sprite.tint = lightTint(color);
    return sprite;
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
 * transparent rim), generated on a canvas and cached per fraction and colour —
 * BLACK for the dark circles (normal blend, fraction depends on the authored
 * radius so the fade width stays constant in world units) and WHITE for the
 * lights (screen blend, tinted per source; alpha = strength → soft rim).
 */
function texture(coreFraction: number, white = false): Texture {
    // Round the cache key so near-identical fractions share a texture.
    const fraction = Math.round(coreFraction * 100) / 100;
    const key = (white ? 'w' : 'k') + fraction;
    let cached = radialTextures.get(key);
    if (!cached) {
        const size = DarknessVisuals.TEXTURE_SIZE;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createRadialGradient(
            size / 2, size / 2, (size / 2) * fraction,
            size / 2, size / 2, size / 2,
        );
        const rgb = white ? '255, 255, 255' : '0, 0, 0';
        gradient.addColorStop(0, `rgba(${rgb}, 1)`);
        gradient.addColorStop(1, `rgba(${rgb}, 0)`);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);
        cached = Texture.from(canvas);
        radialTextures.set(key, cached);
    }
    return cached;
}
