import {describe, it, expect} from 'vitest';
import {toPaths} from './Paths';
import {regionBlend, regionPaintSpec, regionScroll, Profile} from '../../regions/logic/Regions';

// 1 unit = 120 px (api/shared-constants.json pointsPerMeter), the same
// conversion Regions.toRegions applies — pinned here because the world and the
// full-screen map both read it and a disagreement is invisible in either alone.
const PX = 120;

// One outlined path, varying only the outline fields.
function outlinedPath(over: Record<string, unknown>) {
    return toPaths([{
        profile: 'Water', width: 4, points: [{x: 0, y: 0}, {x: 4, y: 0}],
        ...over,
    } as never]);
}

describe('toPaths', () => {
    it('converts server units to world pixels, points and width alike', () => {
        const [path] = toPaths([
            {profile: 'Road', width: 2.5, points: [{x: -1, y: 0}, {x: 3, y: 2}]},
        ]);
        expect(path.profile).toBe('Road');
        expect(path.width).toBe(2.5 * PX);
        expect(path.points).toEqual([{x: -PX, y: 0}, {x: 3 * PX, y: 2 * PX}]);
    });

    // Every zone shipped before this authors no paths at all.
    it('treats an absent array as no paths', () => {
        expect(toPaths(undefined)).toEqual([]);
    });

    // ⭐ TWO points, not three: a path is an OPEN polyline and two points are a
    // complete road. A region needs three because it encloses an area.
    it('keeps a two-point path', () => {
        expect(toPaths([{profile: 'Road', width: 1, points: [{x: 0, y: 0}, {x: 1, y: 0}]}]))
            .toHaveLength(1);
    });

    it('drops a path that cannot be drawn rather than the whole zone', () => {
        const kept = toPaths([
            {profile: 'Road', width: 1, points: [{x: 0, y: 0}]},              // not a line
            {profile: 'Road', width: 0, points: [{x: 0, y: 0}, {x: 1, y: 0}]}, // invisible
            {profile: 'Road', width: -2, points: [{x: 0, y: 0}, {x: 1, y: 0}]},
            {profile: 'Road', width: NaN, points: [{x: 0, y: 0}, {x: 1, y: 0}]},
            {profile: 'Road', width: 2, points: [{x: 0, y: 0}, {x: 1, y: 0}]},  // fine
        ]);
        expect(kept).toHaveLength(1);
        expect(kept[0].width).toBe(2 * PX);
    });

    // ⚑ A NaN width would poison the whole Graphics batch, not one path — which
    // is why it is filtered here rather than handed to Pixi and hoped about.
    it('never emits a non-finite width', () => {
        toPaths([{profile: 'Road', width: Infinity, points: [{x: 0, y: 0}, {x: 1, y: 0}]}])
            .forEach(p => expect(Number.isFinite(p.width)).toBe(true));
    });

    // ---- closed paths (plan-zone-polygons.md P1) --------------------------

    // ⚑ Normalised to a real boolean, never carried through as undefined: it
    // reaches Pixi as `poly(points, closed)`, whose own default is TRUE — the
    // opposite of what a path means. An undefined would close every road.
    it('normalises closed to a boolean, defaulting to open', () => {
        const [open] = toPaths([{profile: 'Road', width: 1, points: [{x: 0, y: 0}, {x: 1, y: 0}]}]);
        expect(open.closed).toBe(false);

        const [ring] = toPaths([{
            profile: 'Road', width: 1, closed: true,
            points: [{x: 0, y: 0}, {x: 1, y: 0}, {x: 1, y: 1}],
        }]);
        expect(ring.closed).toBe(true);
    });

    // THREE for a ring, TWO for a line — the server refuses a two-point ring,
    // so this is the client's own degrade path for a hand-edited file, and it
    // drops one path rather than the zone.
    it('drops a two-point ring but keeps a two-point line', () => {
        const kept = toPaths([
            {profile: 'Road', width: 1, closed: true, points: [{x: 0, y: 0}, {x: 1, y: 0}]},
            {profile: 'Road', width: 1, points: [{x: 0, y: 0}, {x: 1, y: 0}]},
        ]);
        expect(kept).toHaveLength(1);
        expect(kept[0].closed).toBe(false);
    });

    // blocksMovement is read by the SERVER alone. It must not reach the drawn
    // shape at all — a blocking river and a ford look identical.
    it('does not carry blocksMovement into the drawn path', () => {
        const [path] = toPaths([
            {profile: 'Water', width: 4, blocksMovement: true, points: [{x: 0, y: 0}, {x: 1, y: 0}]},
        ]);
        expect(path).not.toHaveProperty('blocksMovement');
    });
});

describe('a path wears the region profile table unchanged', () => {
    const profiles: { [name: string]: Profile } = {
        Road: {texture: 'sand', scale: 0.35, blend: 0.6, color: 0xc2a878},
        Water: {texture: null, blend: 0.8, color: 0x2a63a8, scroll: {x: 0.4, y: 0.15}},
        Bare: {},
    };

    // ⭐ The claim the whole chunk rests on: a Path IS a Region as far as the
    // paint spec is concerned, so D14's texture-or-colour fallback and D0's
    // per-property transparency apply to a river with no new code.
    it('resolves a paint spec through regionPaintSpec', () => {
        const [road] = toPaths([{profile: 'Road', width: 2, points: [{x: 0, y: 0}, {x: 1, y: 0}]}]);
        expect(regionPaintSpec(road, () => true, profiles)).toEqual({texture: 'sand', scale: 0.35});
        // D14: the colour is the FALLBACK when the tile is not usable, never a tint.
        expect(regionPaintSpec(road, () => false, profiles)).toEqual({color: 0xc2a878});
    });

    // Water ships texture:null on purpose — there is no water tile yet, so D14
    // paints the colour. That is the designed degrade, not a missing file.
    it('paints the colour for a profile that authors no texture', () => {
        const [water] = toPaths([{profile: 'Water', width: 5, points: [{x: 0, y: 0}, {x: 1, y: 0}]}]);
        expect(regionPaintSpec(water, () => true, profiles)).toEqual({color: 0x2a63a8});
    });

    it('takes its blend from its own profile', () => {
        const [road] = toPaths([{profile: 'Road', width: 2, points: [{x: 0, y: 0}, {x: 1, y: 0}]}]);
        expect(regionBlend(road, profiles)).toBe(0.6);
    });

    // D11 totality: an unknown profile costs one path its look, never a throw.
    it('falls back to the default for an unknown profile', () => {
        const [ghost] = toPaths([{profile: 'Nope', width: 2, points: [{x: 0, y: 0}, {x: 1, y: 0}]}]);
        expect(() => regionPaintSpec(ghost, () => true, profiles)).not.toThrow();
        expect(regionBlend(ghost, profiles)).toBe(0);
    });

    // ⭐ C3, and the same claim one property further: a river is a path wearing
    // a profile that happens to drift. Nothing in Paths.ts knows about motion.
    it('takes its drift from its own profile', () => {
        const [river] = toPaths([{profile: 'Water', width: 5, points: [{x: 0, y: 0}, {x: 1, y: 0}]}]);
        expect(regionScroll(river, profiles)).toEqual({x: 0.4, y: 0.15});
    });

    it('is still for a profile that authors no drift', () => {
        const [road] = toPaths([{profile: 'Road', width: 2, points: [{x: 0, y: 0}, {x: 1, y: 0}]}]);
        expect(regionScroll(road, profiles)).toEqual({x: 0, y: 0});
    });

    // A profile transparent to blend gets the shipped default — a hard edge,
    // which costs no mask and no filter pass.
    it('defaults an undeclared blend to a hard edge', () => {
        const [bare] = toPaths([{profile: 'Bare', width: 2, points: [{x: 0, y: 0}, {x: 1, y: 0}]}]);
        expect(regionBlend(bare, profiles)).toBe(0);
    });
});

// ---- outlines (plan-zone-polygons.md D3) ---------------------------------

describe('path outlines', () => {
    it('converts the outline width to world pixels too', () => {
        const [s] = outlinedPath({outlineProfile: 'Coast', outlineWidth: 1.5});
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
            const [s] = outlinedPath(half);
            expect(s).not.toHaveProperty('outlineProfile');
            expect(s).not.toHaveProperty('outlineWidth');
        }
    });

    // The common case: no outline authored at all, and neither key appears.
    it('leaves an un-outlined shape with neither key', () => {
        const [s] = outlinedPath({});
        expect(s).not.toHaveProperty('outlineProfile');
        expect(s).not.toHaveProperty('outlineWidth');
    });
});
