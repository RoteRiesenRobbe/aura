/**
 * Draws the touch exits (plan-passages.md P5, D10, Q3/Q4): a gold glow over
 * each area and the name of where it leads, shown while the player is within
 * EXIT_NAME_RANGE of it. No look at the centroid: the glow alone marks a touch
 * exit (PO 2026-10-19). A `hidden` area draws none of it. The light the glow
 * casts in the dark is DarknessOverlay's (resetZone), from the same table.
 *
 * The glow (PO 2026-10-19): no rim, the fill fading out softly at the edge,
 * and thin streaks of light rising out of it, as if it lifted you away. It
 * breathes, and a circle of runes turns on it.
 *
 * ⚑ It inherits [[project-zone-edit-half-live]]: an area draws from the
 * bundle before the server behaves.
 */
import * as PIXI from 'pixi.js';
import {meter2px} from '../../../client-data/BasicConfig';
import {PrerenderEvent} from '../../core/logic/Events';
import {GameState, IGame} from '../../core/logic/IGame';
import * as GroundTextureManager from '../../ground-textures/logic/GroundTextureManager';
import {
    distanceToPolygon, EXIT_GLOW_COLOR, EXIT_NAME_RANGE, ExitAreaJSON, ExitAreaPlacement, exitAreaPlacements,
    inscribedRadius, polygonArea, randomPointIn, runeStrokes, seedOf, SPARKLE_EASE, SPARKLE_LIFE, SPARKLE_RISE, sparkleCount,
} from './ExitAreaTable';
import {exitHeader} from './ExitHeader';

// [PLACEHOLDER] the glow's look: a soft fill, its edge blurred over this many
// units (a live BlurFilter: a handful of areas per zone, so no bake).
const FILL_ALPHA = 0.7;
const FADE_UNITS = 0.45;
// [PLACEHOLDER] a streak: a dot at rest, drawn out into a hairline with its
// speed (PO 2026-10-19).
const STREAK_COLOR = 0xfff4c8;
const STREAK_WIDTH = 1.5;
const STREAK_DOT = 1.5;
// The length goes with t to this power: high = stays a dot longer as it rises.
const STREAK_STRETCH_EASE = 5;
const STREAK_LENGTH = {min: 8, max: 20};
// [PLACEHOLDER] the breathing (PO 2026-10-19): the glow and the runes swell
// and dim together, over this period, between these fractions of full.
const BREATH_SECONDS = 2.8;
const BREATH = {min: 0.6, max: 1};
// [PLACEHOLDER] the rune circle (PO 2026-10-19), drawn, not art: an outer ring
// of runes turning one way, an inner hexagram turning the other, fitted inside
// the area. Radians per second.
const RUNE_COLOR = 0xffe08a;
const RUNE_ALPHA = 0.75;
const RUNE_COUNT = 12;
const RUNE_FIT = 0.9;
const RUNE_SPIN_OUTER = 0.18;
const RUNE_SPIN_INNER = -0.3;

interface Streak {
    x: number;
    y: number;
    length: number;
    rise: number; // px over its whole life
    life: number; // seconds
    age: number; // seconds
}

interface Drawn {
    placement: ExitAreaPlacement;
    name: PIXI.Text | null;
    streaks: Streak[];
    sparkles: PIXI.Graphics;
    glow: PIXI.Graphics;
    runes: PIXI.Container | null;
    outer: PIXI.Graphics | null;
    inner: PIXI.Graphics | null;
}

let drawn: Drawn[] = [];
// Seconds since load: the breath's clock, shared so every area breathes in step.
let clock = 0;

/**
 * The rune circle, centred on 0: an outer band of runes between two rings,
 * and a hexagram inside. null when the area is too thin for one to read.
 */
function runeCircle(p: ExitAreaPlacement): {runes: PIXI.Container, outer: PIXI.Graphics, inner: PIXI.Graphics} | null {
    const r = inscribedRadius(p.centroid, p.points) * RUNE_FIT;
    if (r < meter2px(0.35)) {
        return null;
    }
    const width = Math.max(1.5, r * 0.018);
    const stroke = {color: RUNE_COLOR, alpha: RUNE_ALPHA, width};

    const outer = new PIXI.Graphics();
    outer.circle(0, 0, r).stroke(stroke);
    outer.circle(0, 0, r * 0.76).stroke(stroke);
    const seed = seedOf(p.key);
    const h = r * 0.15, w = h * 0.6, mid = r * 0.88;
    for (let i = 0; i < RUNE_COUNT; i++) {
        const a = (i / RUNE_COUNT) * Math.PI * 2;
        const cos = Math.cos(a), sin = Math.sin(a);
        // Each rune stands upright on the ring: its local x runs along the
        // tangent, its local y outward from the centre.
        const at = (u: number, v: number) => {
            const tx = (u - 0.5) * w, ty = (0.5 - v) * h;
            return [cos * (mid + ty) - sin * tx, sin * (mid + ty) + cos * tx];
        };
        for (const [x1, y1, x2, y2] of runeStrokes(seed + i * 7919)) {
            const [ax, ay] = at(x1, y1), [bx, by] = at(x2, y2);
            outer.moveTo(ax, ay).lineTo(bx, by);
        }
    }
    outer.stroke(stroke);

    const inner = new PIXI.Graphics();
    const ri = r * 0.6;
    for (const turn of [0, Math.PI]) {
        const pts: number[] = [];
        for (let k = 0; k < 3; k++) {
            const a = turn - Math.PI / 2 + (k * Math.PI * 2) / 3;
            pts.push(Math.cos(a) * ri, Math.sin(a) * ri);
        }
        inner.poly(pts).stroke(stroke);
    }
    inner.circle(0, 0, ri).stroke({...stroke, alpha: RUNE_ALPHA * 0.6});

    const runes = new PIXI.Container();
    runes.label = 'exitRunes:' + p.key;
    runes.position.set(p.centroid.x, p.centroid.y);
    runes.blendMode = 'add';
    runes.addChild(outer, inner);
    return {runes, outer, inner};
}

function between(range: {min: number, max: number}): number {
    return range.min + Math.random() * (range.max - range.min);
}

// A fresh streak somewhere in the area; `age` staggers the first batch so
// they do not all rise in step.
function newStreak(points: {x: number, y: number}[], age: number): Streak {
    const p = randomPointIn(points, Math.random);
    return {
        x: p.x, y: p.y,
        length: between(STREAK_LENGTH),
        rise: meter2px(between(SPARKLE_RISE)),
        life: between(SPARKLE_LIFE),
        age,
    };
}

/**
 * Replaces both layers' exit-area contents with this zone's. Idempotent, so a
 * zone swap (Game.renderZone) simply calls it again.
 */
export function loadExitAreas(
    glowLayer: PIXI.Container,
    sparkleLayer: PIXI.Container,
    nameLayer: PIXI.Container,
    areas: ExitAreaJSON[] | undefined,
    origin: {x: number, y: number} | undefined,
) {
    for (const d of drawn) {
        d.name?.destroy();
    }
    glowLayer.removeChildren().forEach(c => c.destroy());
    sparkleLayer.removeChildren().forEach(c => c.destroy());
    drawn = [];
    for (const p of exitAreaPlacements(areas, origin, meter2px)) {
        const glow = new PIXI.Graphics()
            .poly(p.points.flatMap(v => [v.x, v.y]))
            .fill({color: EXIT_GLOW_COLOR, alpha: FILL_ALPHA});
        glow.filters = [new PIXI.BlurFilter({strength: meter2px(FADE_UNITS) / 2, quality: 4})];
        glow.label = 'exitGlow:' + p.key;
        glowLayer.addChild(glow);

        const circle = p.sigil === 'runes' ? runeCircle(p) : null;
        if (circle) {
            glowLayer.addChild(circle.runes);
        }

        const sparkles = new PIXI.Graphics();
        sparkles.label = 'exitSparkles:' + p.key;
        sparkles.blendMode = 'add';
        // Over every prop (PO 2026-10-19): a streak rising past a tree's
        // crown must not vanish behind it.
        sparkleLayer.addChild(sparkles);
        const count = p.particles === 'rising'
            ? sparkleCount(polygonArea(p.points) / (meter2px(1) * meter2px(1))) : 0;
        const streaks: Streak[] = [];
        for (let i = 0; i < count; i++) {
            const s = newStreak(p.points, 0);
            s.age = Math.random() * s.life;
            streaks.push(s);
        }

        // Q3: the place it leads to, by the door header's own rule.
        const title = exitHeader(p.key, GroundTextureManager.getZoneSet());
        let name: PIXI.Text | null = null;
        if (title) {
            name = new PIXI.Text({
                text: title,
                style: {
                    fontFamily: 'Arial',
                    fontSize: 22,
                    fontWeight: 'bold',
                    fill: EXIT_GLOW_COLOR,
                    stroke: {color: 0x000000, width: 4},
                },
            });
            name.label = 'exitName:' + p.key;
            name.anchor.set(0.5, 1);
            name.position.set(p.centroid.x, Math.min(...p.points.map(v => v.y)) - 8);
            name.visible = false;
            nameLayer.addChild(name);
        }
        drawn.push({
            placement: p, name, streaks, sparkles, glow,
            runes: circle?.runes ?? null, outer: circle?.outer ?? null, inner: circle?.inner ?? null,
        });
    }
}

// One frame of an area's streaks: each lingers at its start, then rises and
// accelerates (the rise goes with t^SPARKLE_EASE), brightens then fades over its life, and is reborn
// elsewhere in the area when it ends.
function animate(d: Drawn, seconds: number) {
    // The breath: the glow and the runes swell and dim together.
    const breath = BREATH.min + (BREATH.max - BREATH.min)
        * (0.5 + 0.5 * Math.sin((clock / BREATH_SECONDS) * Math.PI * 2));
    d.glow.alpha = breath;
    if (d.runes) {
        d.runes.alpha = breath;
        d.outer.rotation += RUNE_SPIN_OUTER * seconds;
        d.inner.rotation += RUNE_SPIN_INNER * seconds;
    }

    const g = d.sparkles;
    g.clear();
    for (let i = 0; i < d.streaks.length; i++) {
        let s = d.streaks[i];
        s.age += seconds;
        if (s.age >= s.life) {
            s = d.streaks[i] = newStreak(d.placement.points, 0);
        }
        const t = s.age / s.life;
        const alpha = Math.sin(Math.PI * t);
        // A dot while it lingers and well into its rise, drawn out only near
        // the end (PO 2026-10-19: later than its speed alone would).
        const length = STREAK_DOT + s.length * 1.5 * Math.pow(t, STREAK_STRETCH_EASE);
        const top = s.y - s.rise * Math.pow(t, SPARKLE_EASE) - length;
        g.rect(s.x - STREAK_WIDTH / 2, top, STREAK_WIDTH, length)
            .fill({color: STREAK_COLOR, alpha: 0.95 * alpha});
    }
}

/** Animates the streaks, and shows each area's name while the player is near. */
export function setup(game: IGame) {
    PrerenderEvent.subscribe((deltaMs: number) => {
        const character = game.state === GameState.PLAYING ? game.player?.character : undefined;
        const range = meter2px(EXIT_NAME_RANGE);
        const seconds = Math.min(0.1, (deltaMs || 0) / 1000);
        clock += seconds;
        for (const d of drawn) {
            animate(d, seconds);
            if (!d.name) {
                continue;
            }
            d.name.visible = character !== undefined
                && distanceToPolygon({x: character.getX(), y: character.getY()}, d.placement.points) <= range;
        }
    });
}
