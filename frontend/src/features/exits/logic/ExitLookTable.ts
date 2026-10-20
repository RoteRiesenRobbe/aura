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
import exitLookSizes from '../../../client-data/exit-look-sizes.json';

/** The look an exit draws when it names none [PLACEHOLDER default, D1]. */
export const DEFAULT_EXIT_LOOK = 'cave-mouth';

/**
 * Every drawn look's art box in world units, centred on the exit and pointing
 * UP (-y) at rotation 0. [PLACEHOLDER] sizes (the stairs halved, PO
 * 2026-10-19; the cave exit cut from 2.4 to ~30 %, PO 2026-10-20); the cave mouth's is its prop's body (api/props/cave-mouth.json),
 * whose art it reuses. ⚑ JSON for the profile tables' reason: the Tiled palette
 * generator reads the same file, so an exit's box in Tiled is the size the game
 * draws it at.
 */
export const EXIT_LOOK_SIZES: Record<string, {width: number, height: number}> = exitLookSizes;

/** An exit as the bundled zone file authors it (only what a look needs). */
export interface ExitJSON {
    x: number;
    y: number;
    rotation?: number;
    look?: string;
    // Draws nothing at all (P3b): found by its E prompt alone.
    hidden?: boolean;
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
 * A `hidden` exit and an unknown look draw nothing; the server refuses the second at
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
        if (e.hidden) {
            continue;
        }
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
