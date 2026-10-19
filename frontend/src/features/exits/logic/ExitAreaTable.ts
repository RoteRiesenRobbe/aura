/**
 * Touch exits as the client draws them (plan-passages.md P5, D10, Q3/Q4): the
 * pure half. An area glows gold and names where it leads when the player comes
 * near; a `hidden` one draws nothing. No look: the glow alone marks it (PO
 * 2026-10-19).
 *
 * ⭐ FROM THE BUNDLED ZONE, NEVER STREAMED, like the talk exits' looks (D5): a
 * touch exit has no entity at all.
 *
 * Pure and DOM-free, so vitest can import it.
 */
/** The glow's colour (PO 2026-10-18: gold) [PLACEHOLDER shade]. */
export const EXIT_GLOW_COLOR = 0xffc83d;
/** How far the glow's light reaches in the dark, world units [PLACEHOLDER]. */
export const EXIT_GLOW_RADIUS = 3;
/** How near the player comes before the destination's name shows, world
 *  units, measured to the area's edge (Q3) [PLACEHOLDER]. */
export const EXIT_NAME_RANGE = 4;

/**
 * What a touch exit draws over its glow (PO 2026-10-19): zone.go's ExitSigils
 * and ExitParticles, the default first (absent = it), 'none' = nothing.
 * ExitAreaTable.test.ts pins both to the palette's enums.
 */
export const EXIT_SIGILS = ['runes', 'none'];
export const EXIT_PARTICLES = ['rising', 'none'];

/** A touch exit as the bundled zone file authors it. */
export interface ExitAreaJSON {
    id?: string;
    points: {x: number, y: number}[];
    anchor: string;
    hidden?: boolean;
    sigil?: string;
    particles?: string;
}

/** One area to draw, in world PIXELS. */
export interface ExitAreaPlacement {
    /** What the door header resolves the name by: the id, or "@" + anchor. */
    key: string;
    sigil: string;
    particles: string;
    points: {x: number, y: number}[];
    centroid: {x: number, y: number};
}

/** The areas to draw, origin applied; a hidden one draws nothing (Q4). */
export function exitAreaPlacements(
    areas: ExitAreaJSON[] | undefined,
    origin: {x: number, y: number} | undefined,
    unitToPx: (u: number) => number,
): ExitAreaPlacement[] {
    const ox = origin?.x ?? 0, oy = origin?.y ?? 0;
    const out: ExitAreaPlacement[] = [];
    for (const a of areas || []) {
        if (a.hidden || !a.points || a.points.length < 3) {
            continue;
        }
        const points = a.points.map(p => ({x: unitToPx(p.x + ox), y: unitToPx(p.y + oy)}));
        const centroid = {
            x: points.reduce((s, p) => s + p.x, 0) / points.length,
            y: points.reduce((s, p) => s + p.y, 0) / points.length,
        };
        out.push({
            key: a.id || '@' + a.anchor,
            sigil: a.sigil || EXIT_SIGILS[0],
            particles: a.particles || EXIT_PARTICLES[0],
            points, centroid,
        });
    }
    return out;
}

/** The distance from p to the polygon's edge; 0 inside. */
export function distanceToPolygon(p: {x: number, y: number}, points: {x: number, y: number}[]): number {
    let inside = false;
    let best = Infinity;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const a = points[i], b = points[j];
        if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) {
            inside = !inside;
        }
        const dx = b.x - a.x, dy = b.y - a.y;
        const lenSq = dx * dx + dy * dy;
        const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
        best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
    }
    return inside ? 0 : best;
}

/**
 * The rising streaks over a touch exit (PO 2026-10-19: "rising holy longish
 * thin lines"), all [PLACEHOLDER]: how many per square unit of area (clamped),
 * how far each rises over its life in units (starting slow and accelerating,
 * PO 2026-10-19), and how long each lives in seconds.
 */
export const SPARKLE_PER_UNIT2 = 18;
export const SPARKLE_MIN = 48;
export const SPARKLE_MAX = 540;
export const SPARKLE_RISE = {min: 1.2, max: 2.4};
export const SPARKLE_LIFE = {min: 1.4, max: 2.4};
/** The rise goes with t to this power: high = lingers at its start, then shoots up. */
export const SPARKLE_EASE = 4;

/** How many streaks an area of this many square units carries. */
export function sparkleCount(areaUnits2: number): number {
    return Math.max(SPARKLE_MIN, Math.min(SPARKLE_MAX, Math.round(areaUnits2 * SPARKLE_PER_UNIT2)));
}

/** The polygon's area (shoelace), in the square of its own units. */
export function polygonArea(points: {x: number, y: number}[]): number {
    let twice = 0;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        twice += (points[j].x + points[i].x) * (points[j].y - points[i].y);
    }
    return Math.abs(twice) / 2;
}

/**
 * The radius of the largest circle around `c` that stays inside the polygon:
 * the distance to its nearest edge. Where the rune circle fits (PO
 * 2026-10-19).
 */
export function inscribedRadius(c: {x: number, y: number}, points: {x: number, y: number}[]): number {
    let best = Infinity;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const a = points[i], b = points[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const lenSq = dx * dx + dy * dy;
        const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.y - a.y) * dy) / lenSq));
        best = Math.min(best, Math.hypot(c.x - (a.x + t * dx), c.y - (a.y + t * dy)));
    }
    return best;
}

/**
 * One rune of the circle: 2-3 strokes between the points of a 3 × 2 grid
 * (x in 0..1, y in 0..1, y = 0 the rune's top), chosen by a seeded generator so
 * an area keeps the same runes on every load. A placeholder for drawn glyphs.
 */
export function runeStrokes(seed: number): [number, number, number, number][] {
    let s = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
    const next = () => (s = (s * 16807) % 2147483647) / 2147483647;
    // The grid: three columns, two rows plus the middle of each column.
    const xs = [0, 0.5, 1], ys = [0, 0.5, 1];
    const strokes: [number, number, number, number][] = [
        // Every rune has a stave, so the ring reads as writing.
        [0.5, 0, 0.5, 1],
    ];
    const n = 1 + Math.floor(next() * 2);
    for (let i = 0; i < n; i++) {
        const x1 = xs[Math.floor(next() * 3)], y1 = ys[Math.floor(next() * 3)];
        let x2 = xs[Math.floor(next() * 3)], y2 = ys[Math.floor(next() * 3)];
        if (x1 === x2 && y1 === y2) {
            x2 = x1 === 0.5 ? 1 : 0.5;
        }
        strokes.push([x1, y1, x2, y2]);
    }
    return strokes;
}

/** A stable number for a string: the seed an area's runes are drawn from. */
export function seedOf(key: string): number {
    let h = 7;
    for (let i = 0; i < key.length; i++) {
        h = (h * 31 + key.charCodeAt(i)) % 2147483646;
    }
    return h;
}

/**
 * A random point inside the polygon: drawn from its bounding box until one
 * lands inside, so a concave area spreads its streaks evenly. A sliver that
 * keeps missing falls back to its first vertex rather than looping on.
 */
export function randomPointIn(points: {x: number, y: number}[], random: () => number): {x: number, y: number} {
    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const w = Math.max(...xs) - minX, h = Math.max(...ys) - minY;
    for (let i = 0; i < 30; i++) {
        const p = {x: minX + random() * w, y: minY + random() * h};
        if (distanceToPolygon(p, points) === 0) {
            return p;
        }
    }
    return {...points[0]};
}
