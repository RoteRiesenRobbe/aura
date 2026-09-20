/**
 * The clearing primitive (plan-region-atmosphere.md A4).
 *
 * A zone can name closed areas — `zone.clearings` — that ERASE atmosphere
 * rather than painting it: the lit pocket at a cave mouth, the hole in a fog
 * bank. The fifth surface primitive, and the only one that names no profile at
 * all.
 *
 * ⭐ IT IS ITS OWN CLASS BECAUSE THE ALTERNATIVE WAS A MAGIC VALUE, and the PO
 * rejected that on sight (2026-09-16, reopening D3). A1 shipped a design where
 * an atmosphere profile authoring `darkness: 0` meant ERASE — one key doing two
 * jobs, *how much* and *which operation* — so three distinct author intents
 * collapsed onto two spellings:
 *
 * | the author means                       | they wrote      | they got        |
 * |----------------------------------------|-----------------|-----------------|
 * | "no opinion, ask the next atmosphere"  | omit the key    | correct         |
 * | "there is NO darkness in my air"       | `darkness: 0`   | ⛔ an erase      |
 * | "cut a hole in whatever is here"       | `darkness: 0`   | by magic value  |
 *
 * ⭐ The payoff is the middle row, and it is the part the PO saw: `darkness: 0`
 * is now a plain DECLARATION of zero — legal, meaningful, and unsayable before.
 * A pure fog profile can state "and it is not dark in here", which stops a
 * containing dark bank from being reported at that point.
 *
 * ⚑ THE SHAPE IS THE FLAG, third application. `Paths.ts` records it for
 * `closed` (a bool can contradict the shape it was drawn as) and zone-polygons
 * D5 for `AuraPolygon` (a class, never a property, tells a wall from a road).
 * A flag on the PROFILE — which is what the PO was offered first and also
 * rejected — would still make the LOOK table carry an OPERATION.
 *
 * ⛔ IT TAKES NO PROFILE, AND THE EMPTINESS IS THE RULING (L7). A clearing
 * paints nothing, so an author reaching for "what colour is my clearing" must
 * find NOTHING rather than a field that quietly means something else. The
 * server refuses `profile` on a clearing by name.
 */
import {pointInPolygon, Region} from '../../regions/logic/Regions';
import {meter2px} from '../../../client-data/BasicConfig';

/**
 * Which layers a clearing cuts. Mirrors `world.ClearsDarkness` / `ClearsHaze` /
 * `ClearsBoth` in `zone.go`, which refuses anything outside the set at boot.
 *
 * ⚑ An enum rather than two bools, for the reason §11.5 proposed and Tiled
 * settles: a dropdown comes free, and a bool PAIR lets an author tick neither —
 * a shape that means nothing and would have to be refused anyway.
 */
export type Clears = 'darkness' | 'haze' | 'both';

/**
 * A clearing as the renderer uses it: vertices in WORLD PIXELS.
 *
 * ⭐ It extends `Region` structurally — as `Path`, `Polygon` and `Atmosphere`
 * all do — so the shipped `pointInPolygon` walk and the shipped draw path take
 * it unchanged. ⚑ Its `profile` is the EMPTY STRING and is never read: no
 * profile table contains it, so every `resolveIn`-shaped lookup would skip the
 * shape, which is precisely the seam A4 has to close deliberately rather than
 * inherit. See {@link clearsAt}.
 */
export interface Clearing extends Region {
    clears: Clears;
}

/** Authored shape, straight out of the zone file: server units.
 *
 *  ⛔ Two fields, and the SHORTNESS IS THE POINT — no profile, no
 *  `blocksMovement`, no outline. The server refuses every one of those by name
 *  (`DisallowUnknownFields`). */
export interface ClearingDefinition {
    clears: Clears;
    points: { x: number, y: number }[];
}

/** What an absent or unrecognised `clears` means. ⚑ Must equal the palette
 *  member's default and `CLEARS_DEFAULT` in `aura-convert.js` — a Tiled that
 *  DROPS a default-valued property and one that KEEPS it have to agree. */
const CLEARS_DEFAULT: Clears = 'both';

const VALID: Clears[] = ['darkness', 'haze', 'both'];

let clearings: Clearing[] = [];

/**
 * Authored server units → world pixels. The ONE conversion, for exactly the
 * reason `Regions.toRegions` and `Atmospheres.toAtmospheres` are.
 *
 * ⚑ The origin is applied HERE and NOT on the server, `Atmospheres`' posture
 * verbatim: a clearing is client-visual, so the server leaves it zone-local on
 * purpose. Applying it in both places would cut every hole twice as far from
 * its bank as it should be — invisible in `world` (origin {0,0}) and 300 units
 * off in the underworld.
 *
 * An absent array = no clearings, which is every zone shipped before this.
 */
export function toClearings(
    defs: ClearingDefinition[] | undefined,
    origin?: {x: number, y: number},
): Clearing[] {
    const ox = origin ? origin.x : 0;
    const oy = origin ? origin.y : 0;
    return (defs || [])
        .map(c => ({
            profile: '',
            // ⚑ The client's own degrade path for a hand-edited file, and it
            // falls back rather than dropping the shape: the server already
            // refuses an unrecognised value at boot, so anything reaching here
            // has bypassed that, and a hole in the wrong layers still beats a
            // hole that silently is not there (region-primitive D11's posture).
            clears: VALID.indexOf(c.clears) >= 0 ? c.clears : CLEARS_DEFAULT,
            points: (c.points || []).map(pt => ({x: meter2px(pt.x + ox), y: meter2px(pt.y + oy)})),
        }))
        // THREE points to enclose an area — a region's, a polygon's and an
        // atmosphere's rule. The server refuses fewer.
        .filter(c => c.points.length >= 3);
}

/** Installs the loaded zone's clearings.
 *
 *  ⚑ REPLACES, never appends — a zone swap calls this again and the old zone's
 *  holes must not survive it. */
export function loadClearings(defs: ClearingDefinition[] | undefined, origin?: {x: number, y: number}) {
    clearings = toClearings(defs, origin);
}

/** The loaded zone's clearings, in world pixels and in authored order. */
export function loadedClearings(): Clearing[] {
    return clearings;
}

/** Does this clearing cut the darkness layer? */
export function clearsDarkness(c: Clearing): boolean {
    return c.clears === 'darkness' || c.clears === 'both';
}

/** Does this clearing cut the haze layer? */
export function clearsHaze(c: Clearing): boolean {
    return c.clears === 'haze' || c.clears === 'both';
}

/**
 * ⛔ THE SEAM A4 MUST NOT MISS, and the reason it is a chunk rather than a
 * tweak.
 *
 * `DarknessOverlay.inDarkness()` — the GAMEPLAY query deciding whether a mob's
 * nameplate is readable — is a walk over atmosphere PROFILES. D3's clearing
 * fell out of that walk FOR FREE, because it was an atmosphere and it DECLARED
 * `darkness: 0`, so it was the last declaring shape at that point and answered
 * zero on its own.
 *
 * ⛔ A profile-less clearing is INVISIBLE to that walk. Build A4 naively and a
 * player stands in a lit pocket while the sim still believes they are in the
 * dark: correct on screen, wrong in the simulation, and nothing throws. Same
 * class of defect as the abutting-collider trap in `plan-zone-polygons.md`, and
 * it will not be found by looking at the picture — which is why it is
 * mutation-verified and pinned by its own test.
 *
 * ⚑ This is the fix, and it is what keeps the design honest: clearings enter
 * the lookup DELIBERATELY, answering 0 for whichever layers they cut. One
 * resolved model, two authoring surfaces — `resolveIn` itself does not change.
 *
 * ⭐ D17: a clearing is applied AFTER every atmosphere regardless of authoring
 * order, so this is a plain "is the point in any clearing that cuts this
 * layer", never a position-in-array comparison. Two separate arrays cannot
 * express interleaving without inventing an ordering key, and "cuts a hole in
 * whatever is already there" is the reading that needs none. The painter draws
 * by the same rule, so the drawing and the lookup agree by construction — the
 * property D3 had and A4 must not lose.
 */
export function clearsAt(
    layer: 'darkness' | 'haze',
    point: { x: number, y: number },
    inClearings: Clearing[],
): boolean {
    const cuts = layer === 'darkness' ? clearsDarkness : clearsHaze;
    for (const clearing of inClearings) {
        if (cuts(clearing) && pointInPolygon(point, clearing.points)) {
            return true;
        }
    }
    return false;
}
