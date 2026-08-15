import {Graphics} from 'pixi.js';

/**
 * World-space occlusion wedges for the LoS prototype
 * (docs/plan-prototype-aura-los.md D7/D8): for every active aura ring, the
 * region behind each blocking prop inside the ring is washed dark: the
 * visual mirror of the server dropping sightline-blocked targets from the
 * effect funnel.
 *
 * One shared layer redrawn per frame, deliberately NOT part of AuraRingStack:
 * its redraw caches on radius+mask (shadows would freeze), and its container
 * rotates and pulse-scales with the entity while shadows are world-facts.
 *
 * The client mirrors the server rule approximately (D6): every prop entity
 * occludes, at its wire body radius. Exactly right in world.json (all
 * placements block movement); rect props shadow as their bounding circle.
 */

/** Opacity of an occlusion wedge. [PLACEHOLDER] */
const SHADOW_ALPHA = 0.35;
/** Wedge fill colour. [PLACEHOLDER] */
const SHADOW_COLOR = 0x000000;
/** Subdivision of the wedge's outer arc. */
const ARC_SEGMENTS = 8;

export interface ShadowCircle {
    x: number;
    y: number;
    radius: number;
}

export class AuraShadowLayer {
    readonly graphics = new Graphics();

    /** Full redraw from this frame's rings and occluders (world px). */
    update(rings: ShadowCircle[], occluders: ShadowCircle[]) {
        const g = this.graphics;
        g.clear();
        if (rings.length === 0 || occluders.length === 0) {
            return;
        }
        for (const ring of rings) {
            for (const occluder of occluders) {
                drawWedge(g, ring, occluder);
            }
        }
    }
}

/**
 * The shadow a prop casts inside one ring: the umbra of a point light at the
 * ring center: both tangent rays past the occluder out to the ring edge,
 * joined by an arc. Mirrors the server's D3 edge rules: a ring center inside
 * the prop casts nothing, a prop entirely outside the ring casts nothing.
 */
function drawWedge(g: Graphics, ring: ShadowCircle, o: ShadowCircle) {
    const dx = o.x - ring.x;
    const dy = o.y - ring.y;
    const d = Math.hypot(dx, dy);
    if (o.radius <= 0 || d <= o.radius) {
        return; // degenerate, or the ring center sits inside the prop (D3)
    }
    if (d - o.radius >= ring.radius) {
        return; // the prop is entirely outside the ring
    }
    // Distance from ring center to the tangent points, where the shadow starts.
    const t0 = Math.sqrt(d * d - o.radius * o.radius);
    if (t0 >= ring.radius) {
        return; // the shadow begins at or beyond the ring edge
    }
    const theta = Math.atan2(dy, dx);
    const alpha = Math.asin(o.radius / d);

    g.moveTo(ring.x + Math.cos(theta - alpha) * t0, ring.y + Math.sin(theta - alpha) * t0);
    for (let i = 0; i <= ARC_SEGMENTS; i++) {
        const a = theta - alpha + (2 * alpha * i) / ARC_SEGMENTS;
        g.lineTo(ring.x + Math.cos(a) * ring.radius, ring.y + Math.sin(a) * ring.radius);
    }
    g.lineTo(ring.x + Math.cos(theta + alpha) * t0, ring.y + Math.sin(theta + alpha) * t0);
    g.closePath();
    g.fill({color: SHADOW_COLOR, alpha: SHADOW_ALPHA});
}
