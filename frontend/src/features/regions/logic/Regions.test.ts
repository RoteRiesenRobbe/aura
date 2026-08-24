import {describe, expect, it} from 'vitest';
import {buildProfiles, DEFAULT_PROFILE, Profile, Region, regionColor, resolveIn} from './Regions';

// The resolution rule (D0) and the fallback chain (D11), pinned against a
// hand-written table so the palette (C3, a taste decision) can change freely
// without touching these.

// Unit squares, laid out so containment is obvious by eye.
function square(profile: string, x: number, y: number, side = 10): Region {
    return {
        profile,
        points: [{x, y}, {x: x + side, y}, {x: x + side, y: y + side}, {x, y: y + side}],
    };
}

const PROFILES: { [name: string]: Profile } = {
    // Declares colour.
    swamp: {color: 0x111111},
    // Declares colour too — used for the last-wins leg.
    bog: {color: 0x222222},
    // Declares NOTHING: the transparent case D0 exists for.
    quiet: {},
};

const resolve = (point: {x: number, y: number}, regions: Region[]) =>
    resolveIn('color', point, regions, PROFILES);

describe('resolveIn — the resolution rule (D0)', () => {
    it('answers from the region containing the point', () => {
        expect(resolve({x: 5, y: 5}, [square('swamp', 0, 0)])).toBe(0x111111);
    });

    it('falls back to the default outside every region', () => {
        expect(resolve({x: 50, y: 50}, [square('swamp', 0, 0)])).toBe(DEFAULT_PROFILE.color);
    });

    it('lets the LAST overlapping region win, not the first or the smallest', () => {
        const regions = [square('swamp', 0, 0, 20), square('bog', 5, 5, 5)];
        expect(resolve({x: 7, y: 7}, regions)).toBe(0x222222);
        // Order is the ONLY rule: reverse them and the answer reverses too —
        // no size heuristic, no innermost-wins.
        expect(resolve({x: 7, y: 7}, regions.slice().reverse())).toBe(0x111111);
    });

    // ⭐ D0's whole reason to exist. If only one leg here survives review, it
    // is this one: an inner region that does not declare the property is
    // TRANSPARENT to it, and the region it sits inside answers.
    it('falls THROUGH a region whose profile does not declare the property', () => {
        const regions = [square('swamp', 0, 0, 20), square('quiet', 5, 5, 5)];
        expect(resolve({x: 7, y: 7}, regions)).toBe(0x111111);
    });

    it('ignores a containing region and keeps searching outward, not just upward', () => {
        // quiet is last AND innermost; swamp is first and outermost. Without
        // the continue-searching behaviour this returns the default.
        const regions = [square('swamp', 0, 0, 30), square('quiet', 1, 1, 28), square('quiet', 2, 2, 2)];
        expect(resolve({x: 3, y: 3}, regions)).toBe(0x111111);
    });
});

describe('resolveIn — the fallback chain is total (D11)', () => {
    it.each([
        ['an unknown profile name', [square('no-such-profile', 0, 0)]],
        ['a profile that declares nothing', [square('quiet', 0, 0)]],
        ['no regions at all', []],
    ])('resolves to the default for %s', (_label, regions) => {
        const answer = resolve({x: 5, y: 5}, regions as Region[]);
        expect(answer).toBe(DEFAULT_PROFILE.color);
        expect(answer).not.toBeUndefined();
    });

    // An authored null is a VALUE, not an absence: it means "nothing here" and
    // is the only way to reach silence once audio lands. Absence falls
    // through; null stops the search.
    it('returns an authored null instead of falling through', () => {
        const profiles = {outer: {color: 0x111111}, hole: {color: null as unknown as number}};
        const regions = [square('outer', 0, 0, 20), square('hole', 5, 5, 5)];
        expect(resolveIn('color', {x: 7, y: 7}, regions, profiles)).toBeNull();
    });
});

describe('resolveIn — polygon containment', () => {
    it('excludes a point outside a non-convex polygon that its bounding box would include', () => {
        // An L: the missing quadrant is inside the bbox but outside the shape.
        const L: Region = {
            profile: 'swamp',
            points: [{x: 0, y: 0}, {x: 10, y: 0}, {x: 10, y: 4}, {x: 4, y: 4}, {x: 4, y: 10}, {x: 0, y: 10}],
        };
        expect(resolve({x: 2, y: 8}, [L])).toBe(0x111111);
        expect(resolve({x: 8, y: 8}, [L])).toBe(DEFAULT_PROFILE.color);
    });

    it('handles a triangle, the smallest legal region', () => {
        const tri: Region = {profile: 'swamp', points: [{x: 0, y: 0}, {x: 10, y: 0}, {x: 0, y: 10}]};
        expect(resolve({x: 1, y: 1}, [tri])).toBe(0x111111);
        expect(resolve({x: 9, y: 9}, [tri])).toBe(DEFAULT_PROFILE.color);
    });
});

// ⚑ The table itself can violate D11, which the resolution tests above cannot
// see: they take a hand-written table of well-formed profiles. A profile
// authored with a colour the parser rejects must be TRANSPARENT to colour —
// the key absent, so the search continues — and never a present key holding
// `undefined`, which resolveIn would hand straight back to a consumer.
describe('PROFILES — a malformed authored value cannot break totality (D11)', () => {
    it('drops an unparseable colour instead of declaring it as undefined', () => {
        const profiles = buildProfiles({
            outer: {color: '#111111'},
            broken: {color: 'not-a-hex'},
        });

        expect('color' in profiles.broken).toBe(false);
        // And end to end: the broken region falls through to the one behind it.
        const regions = [square('outer', 0, 0, 20), square('broken', 5, 5, 5)];
        expect(resolveIn('color', {x: 7, y: 7}, regions, profiles)).toBe(0x111111);
    });

    it('keeps an authored null, which is a value and not a mistake', () => {
        const profiles = buildProfiles({hole: {color: null}});
        expect('color' in profiles.hole).toBe(true);
        expect(profiles.hole.color).toBeNull();
    });

    it('ignores _-prefixed documentation keys', () => {
        expect(Object.keys(buildProfiles({_comment: 'hi', swamp: {color: '#111111'}})))
            .toEqual(['swamp']);
    });
});

describe('regionColor — what the renderer actually paints', () => {
    it('returns null for an authored null, so the caller can skip the region', () => {
        // Proven through buildProfiles rather than the shipped table, so the
        // C3 palette sitting can change every colour without touching this.
        const profiles = buildProfiles({hole: {color: null}});
        expect(profiles.hole.color).toBeNull();
    });

    it('falls back to the default colour for an unknown profile', () => {
        expect(regionColor({profile: 'no-such-profile', points: []})).toBe(DEFAULT_PROFILE.color);
    });
});
