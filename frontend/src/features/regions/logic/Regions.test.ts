import {describe, expect, it} from 'vitest';
import {
    buildProfiles,
    DEFAULT_PROFILE,
    neededTextures,
    Profile,
    Region,
    regionBlend,
    regionPaintSpec,
    regionScroll,
    regionWobble,
    regionWobbleSize,
    resolveIn,
} from './Regions';

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

// The same rule, one chunk later, for C4's two keys (§4.9). A texture name is
// a FILE STEM, so anything that cannot name a file is dropped exactly like an
// unparseable colour — and the profile stays transparent to texture rather
// than declaring one nothing can paint.
describe('PROFILES — the texture and scale keys (C4)', () => {
    it('keeps a well-formed texture stem', () => {
        expect(buildProfiles({swamp: {texture: 'pd185'}}).swamp.texture).toBe('pd185');
    });

    it('drops a texture value that cannot name a file', () => {
        const profiles = buildProfiles({
            typed: {texture: 42},
            empty: {texture: ''},
            pathy: {texture: '../secrets/pd185.jpg'},
        });
        expect('texture' in profiles.typed).toBe(false);
        expect('texture' in profiles.empty).toBe(false);
        expect('texture' in profiles.pathy).toBe(false);
    });

    it('keeps an authored null texture, the "no tile here" value', () => {
        const profiles = buildProfiles({flat: {texture: null}});
        expect('texture' in profiles.flat).toBe(true);
        expect(profiles.flat.texture).toBeNull();
    });

    it('keeps a positive scale and drops every unusable one', () => {
        const profiles = buildProfiles({
            good: {scale: 0.35},
            zero: {scale: 0},
            negative: {scale: -1},
            texty: {scale: '0.35'},
        });
        expect(profiles.good.scale).toBe(0.35);
        expect('scale' in profiles.zero).toBe(false);
        expect('scale' in profiles.negative).toBe(false);
        expect('scale' in profiles.texty).toBe(false);
    });
});

// D14: a profile's colour under a texture is the FALLBACK, never a tint —
// and the fallback is WITHIN ONE PROFILE.
describe('regionPaintSpec — what the renderer actually paints (D14)', () => {
    const PAINT = buildProfiles({
        tiled: {texture: 'pd185', scale: 0.35, color: '#111111'},
        unscaled: {texture: 'pd186', color: '#222222'},
        flat: {color: '#333333'},
        hole: {color: null},
    });
    const usable = (name: string) => name === 'pd185' || name === 'pd186';

    it('paints the texture when it is usable', () => {
        expect(regionPaintSpec({profile: 'tiled', points: []}, usable, PAINT))
            .toEqual({texture: 'pd185', scale: 0.35});
    });

    it('carries NO colour beside a texture — the fallback is not a tint', () => {
        const spec = regionPaintSpec({profile: 'tiled', points: []}, usable, PAINT);
        expect('color' in spec).toBe(false);
    });

    it("falls back to the profile's own colour when the tile is not usable", () => {
        expect(regionPaintSpec({profile: 'tiled', points: []}, () => false, PAINT))
            .toEqual({color: 0x111111});
    });

    it('defaults the scale for a texture authored without one', () => {
        expect(regionPaintSpec({profile: 'unscaled', points: []}, usable, PAINT))
            .toEqual({texture: 'pd186', scale: DEFAULT_PROFILE.scale});
    });

    it('falls back to the DEFAULT colour for an unknown profile', () => {
        expect(regionPaintSpec({profile: 'no-such-profile', points: []}, usable, PAINT))
            .toEqual({color: DEFAULT_PROFILE.color});
    });

    it('returns null for an authored null, so the caller can skip the region', () => {
        expect(regionPaintSpec({profile: 'hole', points: []}, usable, PAINT)).toBeNull();
    });

    // ⚑ The trap §4.9 names: `resolve('texture') ?? resolve('color')` would
    // take the tile from the OUTER region and the colour from the inner one —
    // two authors' intent blended by accident. A colour-only region inside a
    // textured one paints flat, full stop.
    it('never borrows a texture from a region it happens to sit inside', () => {
        expect(regionPaintSpec({profile: 'flat', points: []}, usable, PAINT))
            .toEqual({color: 0x333333});
    });
});

// C5's key, and the ONE way it differs from `scale`: `0` is an authored VALUE
// here (a hard edge, D5's world) and must survive the parser. Dropping it would
// leave the key absent, and under D0 an absent key means the next containing
// region answers - so a `blend: 0` blob drawn inside a feathered region would
// feather anyway, the exact opposite of what was written down.
describe('PROFILES — the blend key (C5)', () => {
    it('KEEPS an authored 0, which is the hard edge and not a missing value', () => {
        const profiles = buildProfiles({hard: {blend: 0}});
        expect('blend' in profiles.hard).toBe(true);
        expect(profiles.hard.blend).toBe(0);
    });

    it('keeps a positive width', () => {
        expect(buildProfiles({soft: {blend: 1.5}}).soft.blend).toBe(1.5);
    });

    it('drops a negative width — there is no inward-only band (D22)', () => {
        expect('blend' in buildProfiles({backwards: {blend: -1}}).backwards).toBe(false);
    });

    it('drops a non-number and a non-finite width', () => {
        const profiles = buildProfiles({
            texty: {blend: '1.5'},
            nully: {blend: null},
            broken: {blend: Number.POSITIVE_INFINITY},
        });
        expect('blend' in profiles.texty).toBe(false);
        expect('blend' in profiles.nully).toBe(false);
        expect('blend' in profiles.broken).toBe(false);
    });

    it('defaults to hard edges — the feature costs nothing until authored', () => {
        expect(DEFAULT_PROFILE.blend).toBe(0);
    });
});

// ⚑ Its OWN profile's width, never a resolve() chain: a region drawn inside
// another must not inherit the outer one's band and feather an edge its author
// wrote as hard. Same rule regionPaintSpec obeys for the D14 fallback.
describe('regionBlend — how wide this region feathers its own edge (C5)', () => {
    const BLEND = buildProfiles({
        soft: {blend: 2},
        hard: {blend: 0},
        quiet: {color: '#111111'},
    });

    it('returns the width the profile declares', () => {
        expect(regionBlend({profile: 'soft', points: []}, BLEND)).toBe(2);
    });

    it('returns 0 for a profile that declares a hard edge', () => {
        expect(regionBlend({profile: 'hard', points: []}, BLEND)).toBe(0);
    });

    it.each([
        ['a profile transparent to blend', 'quiet'],
        ['an unknown profile name', 'no-such-profile'],
    ])('falls back to the default (0) for %s', (_label, profile) => {
        expect(regionBlend({profile, points: []}, BLEND)).toBe(DEFAULT_PROFILE.blend);
    });

    it('never borrows the band width of a region it happens to sit inside', () => {
        // The lookup takes ONE region, not a point - which is what makes the
        // borrow structurally impossible rather than merely avoided.
        expect(regionBlend({profile: 'hard', points: []}, BLEND)).toBe(0);
        expect(regionBlend({profile: 'quiet', points: []}, BLEND)).toBe(0);
    });
});

// plan-ground-noise.md W1. A dial in 0…1, and the same trap as `blend`: `0` is
// an authored VALUE ("a clean ramp, explicitly"), so it must survive the parser.
describe('PROFILES — the wobble key (ground-noise W1)', () => {
    it('KEEPS an authored 0, which is the clean ramp and not a missing value', () => {
        const profiles = buildProfiles({clean: {wobble: 0}});
        expect('wobble' in profiles.clean).toBe(true);
        expect(profiles.clean.wobble).toBe(0);
    });

    it.each([0.6, 1])('keeps %s', (wobble) => {
        expect(buildProfiles({rough: {wobble}}).rough.wobble).toBe(wobble);
    });

    // ⚑ DROPPED, not clamped — the parseOpacity posture. A `2` means the unit
    // was misunderstood, and falling back to the clean ramp shows that at once.
    it.each([
        ['a negative value', -0.1],
        ['a value above 1', 1.5],
        ['NaN', Number.NaN],
        ['a string', '0.5'],
        ['a null', null],
    ])('drops %s instead of declaring it', (_label, wobble) => {
        expect('wobble' in buildProfiles({bad: {wobble}}).bad).toBe(false);
    });

    it('defaults to the clean ramp — the feature costs nothing until authored', () => {
        expect(DEFAULT_PROFILE.wobble).toBe(0);
    });
});

// ⚑ Its OWN profile's value, never a resolve() chain — regionBlend's rule, for
// regionBlend's reason: the edge belongs to the shape being drawn.
describe('regionWobble — how much this surface breaks up its own edge (ground-noise W1)', () => {
    const WOBBLE = buildProfiles({
        rough: {blend: 1, wobble: 0.7},
        clean: {blend: 1, wobble: 0},
        quiet: {color: '#111111'},
    });

    it('returns the value the profile declares', () => {
        expect(regionWobble({profile: 'rough', points: []}, WOBBLE)).toBe(0.7);
        expect(regionWobble({profile: 'clean', points: []}, WOBBLE)).toBe(0);
    });

    it.each([
        ['a profile transparent to wobble', 'quiet'],
        ['an unknown profile name', 'no-such-profile'],
    ])('falls back to the default (0) for %s', (_label, profile) => {
        expect(regionWobble({profile, points: []}, WOBBLE)).toBe(DEFAULT_PROFILE.wobble);
    });
});

// ⚑ Unlike `blend` and `wobble`, `0` is NOT a value here: a zero-sized blotch
// is meaningless, and the shipped default 0 already means "derive it from the
// band". An authored 0 is therefore dropped, and lands on the same meaning.
describe('PROFILES — the wobbleSize key (ground-noise W1, D2 amended)', () => {
    it('keeps a positive size in world units', () => {
        expect(buildProfiles({lumpy: {wobbleSize: 0.8}}).lumpy.wobbleSize).toBe(0.8);
    });

    it.each([
        ['a zero', 0],
        ['a negative value', -0.5],
        ['NaN', Number.NaN],
        ['an infinite value', Number.POSITIVE_INFINITY],
        ['a string', '0.5'],
        ['a null', null],
    ])('drops %s instead of declaring it', (_label, wobbleSize) => {
        expect('wobbleSize' in buildProfiles({bad: {wobbleSize}}).bad).toBe(false);
    });

    it('defaults to 0, which means "derive the grain from the band"', () => {
        expect(DEFAULT_PROFILE.wobbleSize).toBe(0);
    });
});

describe('regionWobbleSize — the blotch size this surface authors, if any', () => {
    const SIZES = buildProfiles({
        lumpy: {blend: 0.5, wobble: 0.6, wobbleSize: 1.2},
        derived: {blend: 0.5, wobble: 0.6},
    });

    it('returns the size the profile declares', () => {
        expect(regionWobbleSize({profile: 'lumpy', points: []}, SIZES)).toBe(1.2);
    });

    it.each([
        ['a profile transparent to wobbleSize', 'derived'],
        ['an unknown profile name', 'no-such-profile'],
    ])('falls back to 0 (derive) for %s', (_label, profile) => {
        expect(regionWobbleSize({profile, points: []}, SIZES)).toBe(0);
    });
});

describe('neededTextures — what the zone has to load, and nothing more', () => {
    const PAINT = buildProfiles({
        tiled: {texture: 'pd185'},
        alsoTiled: {texture: 'pd185'},
        other: {texture: 'pd186'},
        flat: {color: '#333333'},
    });

    it('deduplicates, and ignores flat and unknown profiles', () => {
        const regions = [
            square('tiled', 0, 0), square('alsoTiled', 20, 0), square('other', 40, 0),
            square('flat', 60, 0), square('no-such-profile', 80, 0),
        ];
        expect(neededTextures(regions, PAINT).sort()).toEqual(['pd185', 'pd186']);
    });

    it('asks for nothing when no region is textured', () => {
        expect(neededTextures([square('flat', 0, 0)], PAINT)).toEqual([]);
    });
});

describe('PROFILES — the scroll key (world-paths C3)', () => {
    it('keeps a well-formed drift vector', () => {
        expect(buildProfiles({river: {scroll: {x: 0.4, y: -0.15}}}).river.scroll)
            .toEqual({x: 0.4, y: -0.15});
    });

    // ⚑ Same trap parseBlend documents: 0 is an authored VALUE ("explicitly
    // still"), not a missing one. Dropping it would leave the key absent, and
    // under D0 an outer region's drift would answer instead.
    it('KEEPS an authored zero vector rather than dropping it as pointless', () => {
        const profiles = buildProfiles({still: {scroll: {x: 0, y: 0}}});
        expect('scroll' in profiles.still).toBe(true);
        expect(profiles.still.scroll).toEqual({x: 0, y: 0});
    });

    it.each([
        ['a missing component', {x: 1}],
        ['a string component', {x: '1', y: 0}],
        ['a NaN component', {x: Number.NaN, y: 0}],
        ['an infinite component', {x: 0, y: Number.POSITIVE_INFINITY}],
        ['a null', null],
        ['a number', 4],
        ['an array', [1, 2]],
    ])('drops %s instead of declaring it', (_label, scroll) => {
        expect('scroll' in buildProfiles({bad: {scroll}}).bad).toBe(false);
    });

    it('defaults to still — the feature costs nothing until authored', () => {
        expect(DEFAULT_PROFILE.scroll).toEqual({x: 0, y: 0});
    });
});

// ⚑ Its OWN profile's vector, never a resolve() chain — the same rule
// regionBlend and regionPaintSpec obey, for the same reason: a still pond drawn
// inside a flowing river must not inherit the river's current.
describe('regionScroll — how fast this surface drifts (world-paths C3)', () => {
    const SCROLL = buildProfiles({
        river: {texture: 'water', scroll: {x: 0.4, y: 0.15}},
        pond: {texture: 'water', scroll: {x: 0, y: 0}},
        quiet: {color: '#111111'},
    });

    it('returns the vector the profile declares', () => {
        expect(regionScroll({profile: 'river', points: []}, SCROLL))
            .toEqual({x: 0.4, y: 0.15});
    });

    it('returns the zero vector for a profile that declares itself still', () => {
        expect(regionScroll({profile: 'pond', points: []}, SCROLL)).toEqual({x: 0, y: 0});
    });

    it.each([
        ['a profile transparent to scroll', 'quiet'],
        ['an unknown profile name', 'no-such-profile'],
    ])('falls back to the default for %s', (_label, profile) => {
        expect(regionScroll({profile, points: []}, SCROLL)).toEqual(DEFAULT_PROFILE.scroll);
    });

    // ⚑ The default is a shared literal and the paint site scales what it gets
    // into pixels. Handing the literal back would let one caller's arithmetic
    // make every still profile in the session drift.
    it('never hands back the shared default object', () => {
        const first = regionScroll({profile: 'quiet', points: []}, SCROLL);
        first.x = 99;
        expect(DEFAULT_PROFILE.scroll.x).toBe(0);
        expect(regionScroll({profile: 'quiet', points: []}, SCROLL).x).toBe(0);
    });

    it('never borrows the drift of a region it happens to sit inside', () => {
        // The lookup takes ONE region, not a point — which makes the borrow
        // structurally impossible rather than merely avoided.
        expect(regionScroll({profile: 'pond', points: []}, SCROLL)).toEqual({x: 0, y: 0});
        expect(regionScroll({profile: 'quiet', points: []}, SCROLL)).toEqual({x: 0, y: 0});
    });
});
