import {describe, it, expect} from 'vitest';
import {toPaths} from './Paths';
import {regionBlend, regionPaintSpec, Profile} from '../../regions/logic/Regions';

// 1 unit = 120 px (api/shared-constants.json pointsPerMeter), the same
// conversion Regions.toRegions applies — pinned here because the world and the
// full-screen map both read it and a disagreement is invisible in either alone.
const PX = 120;

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
        Water: {texture: null, blend: 0.8, color: 0x2a63a8},
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

    // A profile transparent to blend gets the shipped default — a hard edge,
    // which costs no mask and no filter pass.
    it('defaults an undeclared blend to a hard edge', () => {
        const [bare] = toPaths([{profile: 'Bare', width: 2, points: [{x: 0, y: 0}, {x: 1, y: 0}]}]);
        expect(regionBlend(bare, profiles)).toBe(0);
    });
});
