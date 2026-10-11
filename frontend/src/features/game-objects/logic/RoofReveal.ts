/**
 * Roof reveal (plan-roof-props.md): a prop whose definition authors `roof`
 * draws over the characters like every other `buildings` prop, and fades to
 * its `revealAlpha` while the LOCAL player stands under it, together with
 * every roof piece touching that one, so an L-shaped building opens whole
 * (PO 2026-10-10).
 *
 * ⭐ Purely visual and purely local: the server streams roofs like any prop
 * and never learns who is under one. Another player sees the roof you are
 * under closed.
 *
 * The geometry and the ease are pure functions (RoofReveal.test.ts); the
 * live set and the per-frame update are the wiring at the bottom.
 */
import {PrerenderEvent} from '../../core/logic/Events';
import {GameState, IGame} from '../../core/logic/IGame';
import {PropFootprint} from './PropPlaceholderLayout';

/** A gap this small between two roof pieces still joins them. 0.05 u in px. [PLACEHOLDER] */
export const TOUCH_EPSILON_PX = 6;
/** Time for a full 0 ↔ 1 fade. [PLACEHOLDER] */
export const FADE_MS = 200;

/** A roof's drawn footprint in world px: centre, turn, half-extents. */
export interface RoofShape {
    id: number;
    x: number;
    y: number;
    rotation: number;
    footprint: PropFootprint;
}

interface Point {
    x: number;
    y: number;
}

/** Whether the point lies under the roof, tested in the roof's own turned frame. */
export function contains(roof: RoofShape, point: Point): boolean {
    const dx = point.x - roof.x;
    const dy = point.y - roof.y;
    const cos = Math.cos(roof.rotation);
    const sin = Math.sin(roof.rotation);
    // Undo the roof's turn.
    const lx = dx * cos + dy * sin;
    const ly = -dx * sin + dy * cos;
    const {isRect, halfWidth, halfHeight} = roof.footprint;
    if (!isRect) {
        return lx * lx + ly * ly <= halfWidth * halfWidth;
    }
    return Math.abs(lx) <= halfWidth && Math.abs(ly) <= halfHeight;
}

/** Half-extents of the roof's world-aligned bounding box. */
function boundsHalf(roof: RoofShape): Point {
    const {isRect, halfWidth, halfHeight} = roof.footprint;
    if (!isRect) {
        return {x: halfWidth, y: halfWidth};
    }
    const cos = Math.abs(Math.cos(roof.rotation));
    const sin = Math.abs(Math.sin(roof.rotation));
    return {
        x: halfWidth * cos + halfHeight * sin,
        y: halfWidth * sin + halfHeight * cos,
    };
}

/**
 * Whether two roof pieces belong to one building: their world bounding boxes
 * overlap or meet within TOUCH_EPSILON_PX.
 *
 * ⚑ Bounding boxes, so a rotated piece reaches a little further than it draws.
 * Roof pieces of one building sit flush, and two separate buildings sit a
 * street apart, so the slack decides nothing real.
 */
export function touching(a: RoofShape, b: RoofShape, epsilon: number = TOUCH_EPSILON_PX): boolean {
    const ha = boundsHalf(a);
    const hb = boundsHalf(b);
    return Math.abs(a.x - b.x) <= ha.x + hb.x + epsilon
        && Math.abs(a.y - b.y) <= ha.y + hb.y + epsilon;
}

/**
 * The ids of the roofs to reveal: every roof containing the player, then every
 * roof touching a revealed one, transitively. `player` null = nobody to reveal
 * for (dead, or not in the world yet).
 *
 * O(n²) over the roofs currently in view, which is a handful.
 */
export function roofsToReveal(roofs: readonly RoofShape[], player: Point | null): Set<number> {
    const revealed = new Set<number>();
    if (player === null) {
        return revealed;
    }
    const queue = roofs.filter(roof => contains(roof, player));
    queue.forEach(roof => revealed.add(roof.id));
    while (queue.length > 0) {
        const current = queue.pop();
        for (const other of roofs) {
            if (!revealed.has(other.id) && touching(current, other)) {
                revealed.add(other.id);
                queue.push(other);
            }
        }
    }
    return revealed;
}

/** Moves `current` toward `target` at one full range per FADE_MS, never past it. */
export function stepAlpha(current: number, target: number, dtMs: number, fadeMs: number = FADE_MS): number {
    const step = dtMs / fadeMs;
    if (current < target) {
        return Math.min(target, current + step);
    }
    return Math.max(target, current - step);
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

/** What a roof prop exposes to the reveal (Props.ts implements it). */
export interface RoofProp {
    readonly id: number;
    readonly roofRevealAlpha: number;
    shape: { alpha: number };
    roofShape(): RoofShape;
}

const live = new Set<RoofProp>();

/** A roof entering the view. Its show() calls this. */
export function register(roof: RoofProp): void {
    live.add(roof);
}

/** A roof leaving the view. It comes back opaque: the next show() starts at 1. */
export function unregister(roof: RoofProp): void {
    live.delete(roof);
    roof.shape.alpha = 1;
}

export function setup(game: IGame): void {
    PrerenderEvent.subscribe((dtMs: number) => update(game, dtMs));
}

function update(game: IGame, dtMs: number): void {
    if (live.size === 0) {
        return;
    }
    const character = game.state === GameState.PLAYING ? game.player?.character : undefined;
    const player = character ? {x: character.getX(), y: character.getY()} : null;
    const roofs = [...live];
    const revealed = roofsToReveal(roofs.map(roof => roof.roofShape()), player);
    for (const roof of roofs) {
        const target = revealed.has(roof.id) ? roof.roofRevealAlpha : 1;
        if (roof.shape.alpha !== target) {
            roof.shape.alpha = stepAlpha(roof.shape.alpha, target, dtMs);
        }
    }
}
