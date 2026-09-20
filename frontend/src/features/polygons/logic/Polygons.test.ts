import {describe, it, expect} from 'vitest';
import {toPolygons} from './Polygons';
import {resolve, loadRegions} from '../../regions/logic/Regions';

// 1 unit = 120 px (api/shared-constants.json pointsPerMeter), the same
// conversion Regions.toRegions and Paths.toPaths apply — pinned here because
// the world and the full-screen map both read it and a disagreement is
// invisible in either alone.
const PX = 120;

const TRI = [{x: 0, y: 0}, {x: 4, y: 0}, {x: 4, y: 4}];

// One outlined polygon, varying only the outline fields.
function outlinedPolygon(over: Record<string, unknown>) {
    return toPolygons([{profile: 'Water', points: TRI, ...over} as never]);
}

describe('toPolygons', () => {
    it('converts server units to world pixels', () => {
        const [poly] = toPolygons([{profile: 'Mountains', points: [{x: -1, y: 0}, {x: 3, y: 2}, {x: 0, y: 5}]}]);
        expect(poly.profile).toBe('Mountains');
        expect(poly.points).toEqual([
            {x: -PX, y: 0}, {x: 3 * PX, y: 2 * PX}, {x: 0, y: 5 * PX},
        ]);
    });

    // Every zone shipped before this authors none.
    it('treats an absent array as no polygons', () => {
        expect(toPolygons(undefined)).toEqual([]);
    });

    // ⭐ THREE points, not two: a polygon encloses an AREA. That is the region
    // rule, and it is the one place a polygon deliberately does NOT follow the
    // path it shares a Tiled layer with.
    it('drops a shape that cannot enclose an area rather than the whole zone', () => {
        const kept = toPolygons([
            {profile: 'Water', points: [{x: 0, y: 0}, {x: 1, y: 0}]},   // a line
            {profile: 'Water', points: [{x: 0, y: 0}]},                  // a point
            {profile: 'Water', points: TRI},                             // fine
        ]);
        expect(kept).toHaveLength(1);
        expect(kept[0].points).toHaveLength(3);
    });

    // ⚑ The origin is applied ONCE, here — the server leaves client-visual
    // geometry zone-local and the client places it (plan-underworld.md U2).
    it('applies a placed zone origin once', () => {
        const [poly] = toPolygons([{profile: 'Water', points: TRI}], {x: 500, y: 300});
        expect(poly.points[0]).toEqual({x: 500 * PX, y: 300 * PX});
        expect(poly.points[1]).toEqual({x: 504 * PX, y: 300 * PX});
    });

    // blocksMovement is read by the SERVER alone. It must not reach the drawn
    // shape at all — a blocking rock and a decorative one look identical.
    it('does not carry blocksMovement into the drawn polygon', () => {
        const [poly] = toPolygons([{profile: 'Water', blocksMovement: true, points: TRI}]);
        expect(poly).not.toHaveProperty('blocksMovement');
    });
});

// ⭐ THE distinction the whole primitive exists for, and the only test that can
// state it: a polygon is not a material. `Regions.resolve()` answers "what is
// underfoot" for footsteps, music and atmosphere, and is heading for
// quest-trigger identity — a cave wall is none of those things.
//
// ⚑ Structurally a Polygon IS a Region (it extends it so the paint code is
// shared), so nothing in the type system stops someone from feeding one array
// into the other. This is what would go red if they did.
describe('polygons are not regions', () => {
    it('a polygon does not answer a resolve() lookup', () => {
        loadRegions([]);
        const inside = {x: 1 * PX, y: 1 * PX};
        // Same shape, same profile, loaded as a REGION: resolve answers.
        loadRegions([{profile: 'Swamp', points: TRI}]);
        expect(resolve('color', inside)).not.toBeUndefined();

        // The polygon array is simply not part of that lookup — there is no
        // `loadPolygons` call resolve() could ever see.
        loadRegions([]);
        toPolygons([{profile: 'Swamp', points: TRI}]);
        expect(resolve('color', inside)).toBe(resolve('color', {x: 9e6, y: 9e6}));
    });
});

// ---- outlines (plan-zone-polygons.md D3) ---------------------------------

describe('polygon outlines', () => {
    it('converts the outline width to world pixels too', () => {
        const [s] = outlinedPolygon({outlineProfile: 'Coast', outlineWidth: 1.5});
        expect(s.outlineProfile).toBe('Coast');
        expect(s.outlineWidth).toBe(1.5 * PX);
    });

    // ⚑ HALF-authored degrades to NO outline, never to half of one. The server
    // refuses both halves, so this is the client's degrade path for a
    // hand-edited file — and either half alone would draw nothing anyway, so
    // the only question is whether the absence is deliberate.
    it('drops a half-authored outline entirely', () => {
        for (const half of [
            {outlineProfile: 'Coast'},
            {outlineWidth: 1.5},
            {outlineProfile: 'Coast', outlineWidth: 0},
            {outlineProfile: 'Coast', outlineWidth: NaN},
            {outlineProfile: '', outlineWidth: 2},
        ]) {
            const [s] = outlinedPolygon(half);
            expect(s).not.toHaveProperty('outlineProfile');
            expect(s).not.toHaveProperty('outlineWidth');
        }
    });

    // The common case: no outline authored at all, and neither key appears.
    it('leaves an un-outlined shape with neither key', () => {
        const [s] = outlinedPolygon({});
        expect(s).not.toHaveProperty('outlineProfile');
        expect(s).not.toHaveProperty('outlineWidth');
    });
});
