/**
 * What an exit looks like (plan-passages.md P2, R4/D5): the pure half.
 *
 * ⭐ A LOOK IS DRAWN FROM THE BUNDLED ZONE, NEVER STREAMED. The door's mob is
 * a Passage, which draws nothing; the picture comes from `exits[].look` at zone
 * load, the way decals and static lights do. So a new look is one SVG plus one
 * row here: no wire value, no server change, no EntityType.
 *
 * ⚑ The look NAMES are zone.go's ExitLooks and aura-convert.js's EXIT_LOOKS;
 * ExitLookTable.test.ts pins this table to the palette's AuraExitLook enum,
 * which the converter generates.
 *
 * Pure and DOM-free, so vitest can import it.
 */

/** The look an exit draws when it names none [PLACEHOLDER default, D1]. */
export const DEFAULT_EXIT_LOOK = 'cave-mouth';

/** Draws nothing at all: the exit is found by its E prompt alone (R4). */
export const HIDDEN_EXIT_LOOK = 'hidden';

/**
 * Every drawn look's art box in world units, centred on the exit and pointing
 * UP (-y) at rotation 0. [PLACEHOLDER] sizes; the cave mouth's is its prop's
 * body (api/props/cave-mouth.json), whose art it reuses.
 */
export const EXIT_LOOK_SIZES: Record<string, {width: number, height: number}> = {
    'cave-mouth': {width: 3, height: 2.4},
    'stairs-down': {width: 2, height: 2},
    'stairs-up': {width: 2, height: 2},
    'door': {width: 1.6, height: 0.8},
};

/** An exit as the bundled zone file authors it (only what a look needs). */
export interface ExitJSON {
    x: number;
    y: number;
    rotation?: number;
    look?: string;
}

/** One look to draw, in world PIXELS. */
export interface ExitLookPlacement {
    look: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
}

/**
 * The looks to draw for a zone's exits, origin applied (the server leaves the
 * file zone-local for client-visual data, as for paths and regions).
 * `hidden` and an unknown look draw nothing; the server refuses the second at
 * boot, so it can only reach here from a stale bundle.
 */
export function exitLookPlacements(
    exits: ExitJSON[] | undefined,
    origin: {x: number, y: number} | undefined,
    unitToPx: (u: number) => number,
): ExitLookPlacement[] {
    const ox = origin?.x ?? 0, oy = origin?.y ?? 0;
    const out: ExitLookPlacement[] = [];
    for (const e of exits || []) {
        const look = e.look || DEFAULT_EXIT_LOOK;
        const size = EXIT_LOOK_SIZES[look];
        if (!size) {
            continue;
        }
        out.push({
            look,
            x: unitToPx(e.x + ox),
            y: unitToPx(e.y + oy),
            width: unitToPx(size.width),
            height: unitToPx(size.height),
            rotation: e.rotation || 0,
        });
    }
    return out;
}
