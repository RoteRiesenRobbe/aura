// FloatingNumberLayout is the placement rule for rising combat text
// (_GameObject.showFloatingText), pure so it can be unit-tested without Pixi.
//
// Before it, every number spawned at one point with a random horizontal
// jitter narrower than a three-digit number, so a heal and a damage number
// landing on the same server tick drew on top of each other (docs/feedback.md
// 2026-09-13). Two rules, the classic scrolling-combat-text shape:
//
// 1. A LANE per kind. Losses (damage, crit) sit left of the entity's centre
//    line, gains (heal, cost, XP) right of it. Each lane is anchored at its
//    inner edge, so two texts of any width never cross the centre and no
//    horizontal measurement is needed. Word labels go to 'center' unless a
//    caller says otherwise ("Immune" takes the damage lane: it stands where
//    the red number would have been). A centre-lane text straddles both
//    sides, so it dodges every lane and every lane dodges it.
// 2. A free-slot search within a lane. The lane remembers its live texts; a
//    new one spawns at the base slot if nothing overlaps it there, else one
//    spacing above the highest text it collides with. A text that has risen
//    clear of the base frees it again, so a steady stream of ticks keeps
//    landing at the base instead of climbing off the screen.
//
// plan-skill-vfx.md C1 replaces the per-tick aggregates with per-hit events
// (more numbers per entity per frame, not fewer); the slot search is per
// spawn, so that stream inherits this layout unchanged.
//
// All pixel constants [PLACEHOLDER].

export type FloatingNumberKind = 'damage' | 'crit' | 'heal' | 'xp' | 'cost';
export type FloatingLane = 'left' | 'center' | 'right';

// Half the horizontal gap between the two number lanes.
export const LANE_HALF_GAP_PX = 6;
// Vertical breathing room between two stacked texts.
export const STACK_GAP_PX = 2;

// A text still rising in the lane: where it is NOW, and half its height.
export interface Occupant {
    y: number;
    halfHeight: number;
}

const LANE_BY_KIND: Record<FloatingNumberKind, FloatingLane> = {
    damage: 'left',
    crit: 'left',
    heal: 'right',
    cost: 'right',
    xp: 'right',
};

export function laneFor(kind: FloatingNumberKind): FloatingLane {
    return LANE_BY_KIND[kind];
}

// Text anchor.x for the lane: the left lane hangs off its right edge, the
// right lane off its left edge, so both grow AWAY from the centre line.
export function laneAnchorX(lane: FloatingLane): number {
    switch (lane) {
        case 'left': return 1;
        case 'right': return 0;
        default: return 0.5;
    }
}

export function laneX(lane: FloatingLane, baseX: number): number {
    switch (lane) {
        case 'left': return baseX - LANE_HALF_GAP_PX;
        case 'right': return baseX + LANE_HALF_GAP_PX;
        default: return baseX;
    }
}

// Which lanes a spawn must dodge: its own, plus the centre lane, which
// straddles both sides (a "Level up!" and its "+N XP" land in one frame).
export function lanesSeenBy(lane: FloatingLane): FloatingLane[] {
    return lane === 'center' ? ['left', 'center', 'right'] : [lane, 'center'];
}

// The spawn y for a text of the given half-height: the base slot if nothing
// occupies it, else one spacing above the highest occupant it collides with.
// Occupants are read off the live texts (their real positions), never
// predicted from a rise model, so the layout cannot drift from what is drawn.
export function freeSlotY(occupied: readonly Occupant[], baseY: number, halfHeight: number): number {
    // Lowest on screen first (largest y), so one pass climbs past every
    // occupant the candidate collides with.
    const byHeight = [...occupied].sort((a, b) => b.y - a.y);
    let y = baseY;
    for (const o of byHeight) {
        const spacing = o.halfHeight + halfHeight + STACK_GAP_PX;
        if (Math.abs(y - o.y) < spacing) {
            y = o.y - spacing;
        }
    }
    return y;
}
