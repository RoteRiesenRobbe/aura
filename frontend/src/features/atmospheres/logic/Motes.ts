import {Container, Sprite, Texture} from 'pixi.js';
import {meter2px} from '../../../client-data/BasicConfig';
import {isMobile} from '../../user-interface/logic/Mobile';
import {Motes, pointInPolygon, RegionPoint} from '../../regions/logic/Regions';

/**
 * MOTE SWARMS — an atmosphere's `motes` key (2026-09-29, backlog §62): glowing
 * specks that each dance on their own path and swell in and out of sight.
 *
 * ⭐ Why not the tile: `scroll` moves one texture as a SHEET, so every mote on
 * it drifts in lockstep, and a tile of fairy lights reads as a rising snowfall.
 * Here every mote owns its path and its life, which is the whole look.
 *
 * ⭐ THE MOTION is a sum of two sines per axis around the point the mote was
 * born — bounded (a mote never strays past `wander`), smooth, and closed-form,
 * so it needs no per-mote velocity state. The second harmonic is what curls
 * the path; one sine per axis is a Lissajous loop and reads mechanical.
 *
 * ⭐ THE FADE is SCALE, not alpha (PO 2026-09-29): a mote swells from nothing
 * to full and back over its `life`, then is reborn somewhere else in the shape.
 * The rebirth jump is invisible because it happens at scale 0.
 *
 * ⚑ The per-frame cost is one position and one scale write per mote, capped per
 * shape by {@link maxMotes}. Paused games do not advance it (Game.loop's guard).
 */

/** Motes above this per shape are not drawn. [PLACEHOLDER] — the phone check. */
export function maxMotes(mobile: boolean): number {
    return mobile ? 150 : 400;
}

/** One mote. Lengths in world PX, times in seconds. */
export interface Mote {
    /** Where this life began. */
    homeX: number;
    homeY: number;
    /** Two harmonics per axis: [amplitude px, ω rad/s, phase rad] each. */
    x1: [number, number, number];
    x2: [number, number, number];
    y1: [number, number, number];
    y2: [number, number, number];
    life: number;
    age: number;
}

/** A swarm's spec in the units the frame loop works in. */
export interface MoteSpec {
    wanderPx: number;
    speedPx: number;
    life: number;
}

export type Rng = () => number;

/** Shoelace area of a polygon, in the square of its own units. */
export function polygonArea(points: RegionPoint[]): number {
    let twice = 0;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        twice += (points[j].x + points[i].x) * (points[j].y - points[i].y);
    }
    return Math.abs(twice / 2);
}

/** How many motes a shape of `areaPx2` square px gets at `density` per unit². */
export function moteCount(areaPx2: number, density: number, mobile: boolean): number {
    const unit = meter2px(1);
    return Math.min(maxMotes(mobile), Math.round(areaPx2 / (unit * unit) * density));
}

/** A uniformly random point inside the polygon, by rejection from its box.
 *  ⚑ Falls back to the first vertex for a shape too thin to hit in 32 tries,
 *  rather than looping: a degenerate bank should draw little, not hang. */
export function randomPointIn(points: RegionPoint[], rng: Rng): RegionPoint {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    points.forEach((p) => {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    });
    for (let tries = 0; tries < 32; tries++) {
        const p = {x: minX + rng() * (maxX - minX), y: minY + rng() * (maxY - minY)};
        if (pointInPolygon(p, points)) { return p; }
    }
    return {x: points[0].x, y: points[0].y};
}

/** `base` jittered by ±`spread` (a fraction). */
function jitter(base: number, spread: number, rng: Rng): number {
    return base * (1 + spread * (2 * rng() - 1));
}

/** A new mote somewhere in the shape, `age` seconds into its life.
 *
 *  ω is chosen so the mote's typical speed along the path is about `speedPx`:
 *  a sine of amplitude A at ω moves at A·ω on average (×2/π), so the primary
 *  harmonic carries most of the wander at ω = speed / wander. */
export function spawnMote(points: RegionPoint[], spec: MoteSpec, rng: Rng, age = 0): Mote {
    const home = randomPointIn(points, rng);
    const omega = spec.wanderPx > 0 ? spec.speedPx / spec.wanderPx : 0;
    const harmonic = (share: number, speedUp: number): [number, number, number] =>
        [spec.wanderPx * share, jitter(omega * speedUp, 0.4, rng), rng() * 2 * Math.PI];
    return {
        homeX: home.x,
        homeY: home.y,
        x1: harmonic(0.65, 1),
        x2: harmonic(0.35, 2.5),
        y1: harmonic(0.65, 1),
        y2: harmonic(0.35, 2.5),
        life: jitter(spec.life, 0.3, rng),
        age,
    };
}

function wave(h: [number, number, number], t: number): number {
    return h[0] * Math.sin(h[1] * t + h[2]);
}

/** Where the mote is and how swollen, 0…1. Never strays past the wander. */
export function moteAt(mote: Mote): { x: number, y: number, swell: number } {
    const t = mote.age;
    const phase = Math.min(1, Math.max(0, t / mote.life));
    return {
        x: mote.homeX + wave(mote.x1, t) + wave(mote.x2, t),
        y: mote.homeY + wave(mote.y1, t) + wave(mote.y2, t),
        swell: Math.sin(Math.PI * phase),
    };
}

/** Ages a mote by `seconds`; past its life it is REBORN in place (the same
 *  object, so a sprite can keep pointing at it) somewhere new in the shape. */
export function stepMote(
    mote: Mote, seconds: number, points: RegionPoint[], spec: MoteSpec, rng: Rng,
): void {
    mote.age += seconds;
    if (mote.age < mote.life) { return; }
    // ⚑ The leftover carries into the new life, so a long frame does not
    // stall every mote at zero together — and they would pulse in unison.
    const carry = (mote.age - mote.life) % mote.life;
    Object.assign(mote, spawnMote(points, spec, rng, carry));
}

// ---- Pixi binding -----------------------------------------------------------

const GLOW_SIZE = 64;
let glow: Texture | null = null;

/** A white core in a soft halo; tinted per swarm. Built once, never freed —
 *  one 64² texture for the session, shared by every mote. */
function glowTexture(): Texture {
    if (glow === null) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = GLOW_SIZE;
        const ctx = canvas.getContext('2d');
        const r = GLOW_SIZE / 2;
        const gradient = ctx.createRadialGradient(r, r, 0, r, r, r);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
        gradient.addColorStop(0.18, 'rgba(255, 255, 255, 0.9)');
        gradient.addColorStop(0.45, 'rgba(255, 255, 255, 0.3)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, GLOW_SIZE, GLOW_SIZE);
        glow = Texture.from(canvas);
    }
    return glow;
}

/** A painted swarm: hand to {@link advanceMotes} every frame, drop on repaint.
 *  Its sprites die with the container they were added to; the glow texture is
 *  shared and must NOT be destroyed with them (a bare `destroy({children})`
 *  leaves textures alone). */
export interface MoteSwarm {
    container: Container;
    motes: Mote[];
    sprites: Sprite[];
    points: RegionPoint[];
    spec: MoteSpec;
    /** Sprite scale at full swell. */
    fullScale: number;
    rng: Rng;
}

/** Builds one shape's swarm, or `null` when the shape is too small to hold a
 *  single mote. The caller adds `container` to the scene and owns the mask. */
export function createSwarm(
    points: RegionPoint[], motes: Motes, color: number, rng: Rng = Math.random,
): MoteSwarm | null {
    if (points.length < 3) { return null; }
    const count = moteCount(polygonArea(points), motes.density, isMobile());
    if (count <= 0) { return null; }
    const spec: MoteSpec = {
        wanderPx: meter2px(motes.wander),
        speedPx: meter2px(motes.speed),
        life: motes.life,
    };
    const swarm: MoteSwarm = {
        container: new Container(),
        motes: [],
        sprites: [],
        points,
        spec,
        fullScale: meter2px(motes.size) / GLOW_SIZE,
        rng,
    };
    const texture = glowTexture();
    for (let i = 0; i < count; i++) {
        // ⭐ Born STAGGERED across a life, or the whole swarm would swell and
        // vanish in one breath on the first frame.
        const mote = spawnMote(points, spec, rng, rng() * spec.life);
        const sprite = new Sprite(texture);
        sprite.anchor.set(0.5);
        sprite.tint = color;
        swarm.motes.push(mote);
        swarm.sprites.push(sprite);
        swarm.container.addChild(sprite);
    }
    placeSprites(swarm);
    return swarm;
}

function placeSprites(swarm: MoteSwarm): void {
    swarm.motes.forEach((mote, i) => {
        const at = moteAt(mote);
        const sprite = swarm.sprites[i];
        sprite.position.set(at.x, at.y);
        sprite.scale.set(swarm.fullScale * at.swell);
    });
}

/** Advances every swarm by one frame. */
export function advanceMotes(swarms: MoteSwarm[], deltaMS: number): void {
    if (swarms.length === 0) { return; }
    const seconds = deltaMS / 1000;
    swarms.forEach((swarm) => {
        swarm.motes.forEach(mote => stepMote(mote, seconds, swarm.points, swarm.spec, swarm.rng));
        placeSprites(swarm);
    });
}
