/**
 * Touch exits as the client draws them (plan-passages.md P5, D10, Q3/Q4): the
 * pure half. An area glows gold, carries its look at the centroid, and names
 * where it leads when the player comes near; a `hidden` one draws nothing.
 *
 * ⭐ FROM THE BUNDLED ZONE, NEVER STREAMED, like the talk exits' looks (D5): a
 * touch exit has no entity at all.
 *
 * Pure and DOM-free, so vitest can import it.
 */
import {DEFAULT_EXIT_LOOK} from './ExitLookTable';

/** The glow's colour (PO 2026-10-18: gold) [PLACEHOLDER shade]. */
export const EXIT_GLOW_COLOR = 0xffc83d;
/** How far the glow's light reaches in the dark, world units [PLACEHOLDER]. */
export const EXIT_GLOW_RADIUS = 3;
/** How near the player comes before the destination's name shows, world
 *  units, measured to the area's edge (Q3) [PLACEHOLDER]. */
export const EXIT_NAME_RANGE = 4;

/** A touch exit as the bundled zone file authors it. */
export interface ExitAreaJSON {
    id?: string;
    points: {x: number, y: number}[];
    anchor: string;
    look?: string;
    hidden?: boolean;
}

/** One area to draw, in world PIXELS. */
export interface ExitAreaPlacement {
    /** What the door header resolves the name by: the id, or "@" + anchor. */
    key: string;
    look: string;
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
        out.push({key: a.id || '@' + a.anchor, look: a.look || DEFAULT_EXIT_LOOK, points, centroid});
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
