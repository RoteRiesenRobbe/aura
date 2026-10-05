import {describe, expect, it} from 'vitest';
import {
    buildProfiles,
    DEFAULT_PROFILE,
    groundColor,
    neededTextures,
    OVERLAY_DEFAULTS,
    Profile,
    Region,
    regionBlend,
    REGION_BLEND_OUTWARD,
    regionBlendOutward,
    regionOverlay,
    regionPaintSpec,
    regionScroll,
    regionWobble,
    resolveIn,
    withGround,
} from './Regions';
import terrainProfilesJson from '../../../client-data/terrain-profiles.json';
import atmosphereProfilesJson from '../../../../../api/atmospheres/profiles.json';

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

// plan-ground-noise.md W1b (D3). `wobbleReach` is a LENGTH, so it takes
// `wobbleSize`'s shape: a zero reach is no wobble, which absence already says,
// and an authored 0 is dropped onto that same meaning.
describe('PROFILES — the wobbleReach key (ground-noise W1b)', () => {
    it.each([0.1, 0.6, 2])('keeps a positive reach of %s world units', (wobbleReach) => {
        expect(buildProfiles({rough: {wobbleReach}}).rough.wobbleReach).toBe(wobbleReach);
    });

    // ⚑ DROPPED, not clamped — the parse posture every length here shares.
    it.each([
        ['a zero', 0],
        ['a negative value', -0.1],
        ['NaN', Number.NaN],
        ['an infinite value', Number.POSITIVE_INFINITY],
        ['a string', '0.5'],
        ['a null', null],
    ])('drops %s instead of declaring it', (_label, wobbleReach) => {
        expect('wobbleReach' in buildProfiles({bad: {wobbleReach}}).bad).toBe(false);
    });

    it('defaults to a straight edge — the feature costs nothing until authored', () => {
        expect(DEFAULT_PROFILE.wobbleReach).toBe(0);
    });

    // ⛔ W1's 0…1 dial is RETIRED, not aliased: a profile still naming it would
    // otherwise go quietly straight. The raw-JSON guard below is what catches it.
    it('no longer declares the W1 `wobble` dial', () => {
        expect('wobble' in buildProfiles({old: {wobble: 0.6}}).old).toBe(false);
        expect('wobble' in DEFAULT_PROFILE).toBe(false);
    });
});

// D23: `false` IS a value here — it is how a region profile opts back into
// D22's symmetric fade — so an authored false must survive the parser.
describe('PROFILES — the blendOutward key (D23)', () => {
    it('keeps a boolean, false included', () => {
        expect(buildProfiles({out: {blendOutward: true}}).out.blendOutward).toBe(true);
        expect(buildProfiles({sym: {blendOutward: false}}).sym.blendOutward).toBe(false);
    });
    it.each([['a string', 'true'], ['a number', 1], ['null', null]])(
        'drops %s instead of declaring it', (_label, blendOutward) => {
            expect('blendOutward' in buildProfiles({bad: {blendOutward}}).bad).toBe(false);
        });
    it('an authored value wins over either default', () => {
        const profiles = buildProfiles({out: {blendOutward: true}, sym: {blendOutward: false}});
        [true, false].forEach((fallback) => {
            expect(regionBlendOutward({profile: 'out', points: []}, fallback, profiles)).toBe(true);
            expect(regionBlendOutward({profile: 'sym', points: []}, fallback, profiles)).toBe(false);
        });
    });
    it('a silent or unknown profile takes the CALLER\'s default (regions outward, polygons not)', () => {
        const profiles = buildProfiles({silent: {}});
        expect(REGION_BLEND_OUTWARD).toBe(true);
        expect(DEFAULT_PROFILE.blendOutward).toBe(false);
        [true, false].forEach((fallback) => {
            expect(regionBlendOutward({profile: 'silent', points: []}, fallback, profiles)).toBe(fallback);
            expect(regionBlendOutward({profile: 'no-such-profile', points: []}, fallback, profiles))
                .toBe(fallback);
        });
    });
});

// ⚑ Unlike the reach, `0` IS a value here: a smooth lump is a real look, so an
// authored 0 must survive the parser (the `blend: 0` trap, again).

describe('PROFILES — the wobbleRoughness key (ground-noise W1b)', () => {
    it('KEEPS an authored 0, which is smooth lumps and not a missing value', () => {
        const profiles = buildProfiles({smooth: {wobbleRoughness: 0}});
        expect('wobbleRoughness' in profiles.smooth).toBe(true);
        expect(profiles.smooth.wobbleRoughness).toBe(0);
    });

    it.each([0.3, 1])('keeps %s', (wobbleRoughness) => {
        expect(buildProfiles({frayed: {wobbleRoughness}}).frayed.wobbleRoughness).toBe(wobbleRoughness);
    });

    it.each([
        ['a negative value', -0.1],
        ['a value above 1', 1.5],
        ['NaN', Number.NaN],
        ['a string', '0.5'],
        ['a null', null],
    ])('drops %s instead of declaring it', (_label, wobbleRoughness) => {
        expect('wobbleRoughness' in buildProfiles({bad: {wobbleRoughness}}).bad).toBe(false);
    });

    it("defaults to W1's fixed octave mix, so an edge that does not author it looks as W1 drew it", () => {
        expect(DEFAULT_PROFILE.wobbleRoughness).toBe(0.5);
    });
});

// ⚑ Unlike `wobbleRoughness`, `0` is NOT a value here: a zero-sized blotch is
// meaningless, and the shipped default 0 already means "derive it from the
// reach". An authored 0 is therefore dropped, and lands on the same meaning.
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

    it('defaults to 0, which means "derive the grain from the reach"', () => {
        expect(DEFAULT_PROFILE.wobbleSize).toBe(0);
    });
});

// ⚑ Its OWN profile's values, never a resolve() chain — regionBlend's rule, for
// regionBlend's reason: the edge belongs to the shape being drawn.
describe('regionWobble — the three wobble keys this surface authors (ground-noise W1b)', () => {
    const WOBBLE = buildProfiles({
        full: {blend: 0, wobbleReach: 0.3, wobbleSize: 1.2, wobbleRoughness: 0},
        reachOnly: {blend: 1, wobbleReach: 0.2},
        quiet: {color: '#111111'},
    });

    it('returns every value the profile declares', () => {
        expect(regionWobble({profile: 'full', points: []}, WOBBLE))
            .toEqual({reach: 0.3, size: 1.2, roughness: 0});
    });

    it('fills each key the profile omits from the default, one key at a time', () => {
        expect(regionWobble({profile: 'reachOnly', points: []}, WOBBLE)).toEqual({
            reach: 0.2,
            size: DEFAULT_PROFILE.wobbleSize,
            roughness: DEFAULT_PROFILE.wobbleRoughness,
        });
    });

    it.each([
        ['a profile transparent to every wobble key', 'quiet'],
        ['an unknown profile name', 'no-such-profile'],
    ])('falls back to the defaults (a straight edge) for %s', (_label, profile) => {
        expect(regionWobble({profile, points: []}, WOBBLE)).toEqual({
            reach: DEFAULT_PROFILE.wobbleReach,
            size: DEFAULT_PROFILE.wobbleSize,
            roughness: DEFAULT_PROFILE.wobbleRoughness,
        });
    });
});

// ⭐ The parser DROPS what it does not know, so the parsed tables cannot show a
// retired or misspelt key — it is simply absent, and the surface quietly draws
// without it. Only the RAW files can. `DEFAULT_PROFILE` is `Required<Profile>`,
// so its keys ARE the vocabulary: a key added to the type is legal here with no
// second list to maintain.
describe('the shipped profile files author only keys the parser knows', () => {
    it.each([
        ['terrain-profiles.json', terrainProfilesJson],
        ['atmosphere-profiles.json', atmosphereProfilesJson],
    ])('%s', (_file, raw) => {
        const offenders: string[] = [];
        Object.keys(raw).forEach((name) => {
            if (name.charAt(0) === '_') { return; }
            Object.keys((raw as { [k: string]: unknown })[name] as object).forEach((key) => {
                if (!(key in DEFAULT_PROFILE)) { offenders.push(name + '.' + key); }
            });
        });
        expect(offenders).toEqual([]);
    });
});

describe('neededTextures — what the zone has to load, and nothing more', () => {
    const PAINT = buildProfiles({
        tiled: {texture: 'pd185'},
        alsoTiled: {texture: 'pd185'},
        other: {texture: 'pd186'},
        flat: {color: '#333333'},
        stones: {texture: 'stones-tile'},
        stony: {texture: 'pd185', overlay: {profile: 'stones', coverage: 0.3}},
        stonyFlat: {color: '#333333', overlay: {profile: 'stones', coverage: 0.3}},
        brokenOverlay: {color: '#333333', overlay: {profile: 'no-such-profile', coverage: 0.3}},
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

    // ⚑ ground-noise W2: the overlay's tile is only ever named INDIRECTLY, by
    // the profile the overlay names. Missed here, the patches paint their
    // fallback colour for the life of the session.
    it("loads an overlay's tile too, even under a flat base", () => {
        expect(neededTextures([square('stony', 0, 0)], PAINT).sort()).toEqual(['pd185', 'stones-tile']);
        expect(neededTextures([square('stonyFlat', 0, 0)], PAINT)).toEqual(['stones-tile']);
    });

    it('asks for nothing for an overlay naming an unknown profile', () => {
        expect(neededTextures([square('brokenOverlay', 0, 0)], PAINT)).toEqual([]);
    });
});

// plan-ground-noise.md W2: a second profile painted over the surface in
// world-keyed noise patches. Same drop-not-clamp posture as every other key.
describe('PROFILES — the overlay key (ground-noise W2)', () => {
    const parse = (overlay: unknown) => buildProfiles({p: {overlay}}).p.overlay;

    it('keeps a well-formed overlay, with and without its own patch keys', () => {
        expect(parse({profile: 'Stones', coverage: 0.3}))
            .toEqual({profile: 'Stones', coverage: 0.3});
        expect(parse({profile: 'Stones', coverage: 0.3, size: 2, roughness: 0}))
            .toEqual({profile: 'Stones', coverage: 0.3, size: 2, roughness: 0});
    });

    it.each([
        ['a non-object', 'Stones'],
        ['null', null],
        ['no profile', {coverage: 0.3}],
        ['an empty profile name', {profile: '', coverage: 0.3}],
        ['a non-string profile', {profile: 3, coverage: 0.3}],
        ['no coverage', {profile: 'Stones'}],
        ['a coverage over 1', {profile: 'Stones', coverage: 1.5}],
        ['a negative coverage', {profile: 'Stones', coverage: -0.1}],
        ['a non-finite coverage', {profile: 'Stones', coverage: NaN}],
    ])('drops the WHOLE overlay for %s', (_label, raw) => {
        expect(parse(raw)).toBeUndefined();
    });

    it('drops an unusable size or roughness, and keeps the overlay', () => {
        [0, -1, NaN, '2'].forEach((size) => {
            expect(parse({profile: 'Stones', coverage: 0.3, size})).toEqual({profile: 'Stones', coverage: 0.3});
        });
        [-0.1, 1.5, NaN, '0.5'].forEach((roughness) => {
            expect(parse({profile: 'Stones', coverage: 0.3, roughness}))
                .toEqual({profile: 'Stones', coverage: 0.3});
        });
    });

    it('defaults to no overlay — the feature costs nothing until authored', () => {
        expect(DEFAULT_PROFILE.overlay).toBeNull();
    });
});

describe('regionOverlay — the patches this surface paints (ground-noise W2)', () => {
    const OVERLAID = buildProfiles({
        stones: {texture: 'stones-tile', color: '#777777'},
        full: {overlay: {profile: 'stones', coverage: 0.4, size: 2, roughness: 0}},
        bare: {overlay: {profile: 'stones', coverage: 0.4}},
        none: {overlay: {profile: 'stones', coverage: 0}},
        broken: {overlay: {profile: 'no-such-profile', coverage: 0.4}},
        inherited: {overlay: {profile: 'toString', coverage: 0.4}},
        quiet: {color: '#111111'},
    });
    const at = (profile: string) => regionOverlay({profile, points: []}, OVERLAID);

    it('returns every value the overlay declares', () => {
        expect(at('full')).toEqual({profile: 'stones', coverage: 0.4, size: 2, roughness: 0});
    });

    // D4: the patch keys are the OVERLAY's own, never the base's wobble keys.
    it('fills an omitted size and roughness from the overlay defaults', () => {
        expect(at('bare')).toEqual({
            profile: 'stones', coverage: 0.4,
            size: OVERLAY_DEFAULTS.size, roughness: OVERLAY_DEFAULTS.roughness,
        });
    });

    it.each([
        ['no overlay', 'quiet'],
        ['an unknown surface profile', 'no-such-profile'],
        ['a coverage of 0, which paints nothing', 'none'],
        ['an overlay naming a profile the table does not have', 'broken'],
        ['an overlay naming an Object.prototype member', 'inherited'],
    ])('is null for %s', (_label, profile) => {
        expect(at(profile)).toBeNull();
    });
});

// ⛔ Ground only: paintAir never draws an overlay, but neededTextures would
// still download its tile. An authored one is a silent no-op, so it is red.
describe('the shipped atmosphere profiles author no overlay (ground-noise W2)', () => {
    it('atmosphere-profiles.json', () => {
        const raw = atmosphereProfilesJson as { [k: string]: unknown };
        const offenders = Object.keys(raw).filter(name => name.charAt(0) !== '_'
            && 'overlay' in (raw[name] as object));
        expect(offenders).toEqual([]);
    });
});

// ⭐ The parse above drops a broken overlay SILENTLY, so only the raw file can
// show one: every authored overlay must survive the parser and name a real
// ground profile, or a look sitting judges patches that are not there.
describe('the shipped terrain profiles author only working overlays (ground-noise W2)', () => {
    it('every overlay parses, uses known keys and names a terrain profile', () => {
        const raw = terrainProfilesJson as { [k: string]: unknown };
        const parsed = buildProfiles(raw);
        const known = ['profile', 'coverage', 'size', 'roughness'];
        const offenders: string[] = [];
        Object.keys(raw).forEach((name) => {
            if (name.charAt(0) === '_') { return; }
            const authored = (raw[name] as { overlay?: object }).overlay;
            if (authored === undefined) { return; }
            Object.keys(authored).forEach((key) => {
                if (known.indexOf(key) < 0) { offenders.push(name + '.overlay.' + key); }
            });
            const overlay = parsed[name].overlay;
            if (!overlay) {
                offenders.push(name + '.overlay (dropped by the parser)');
            } else if (!Object.prototype.hasOwnProperty.call(parsed, overlay.profile)) {
                offenders.push(name + '.overlay.profile "' + overlay.profile + '" is not a terrain profile');
            }
        });
        expect(offenders).toEqual([]);
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

// ---- the zone's ground (PO 2026-09-27) --------------------------------------

describe('withGround — the zone fill sits beneath every authored region', () => {
    const rect = {left: -100, top: -100, right: 100, bottom: 100};

    it('absent ground leaves the regions untouched', () => {
        const regions = [square('swamp', 0, 0)];
        expect(withGround(regions, undefined, rect)).toEqual(regions);
    });

    it('paints only where no region does: an authored region wins inside itself', () => {
        const regions = withGround([square('swamp', 0, 0)], 'bog', rect);
        expect(resolve({x: 5, y: 5}, regions)).toBe(0x111111);
        expect(resolve({x: 50, y: 50}, regions)).toBe(0x222222);
    });

    it('covers the whole rectangle it is given, outside the zone included', () => {
        const regions = withGround([], 'bog', rect);
        expect(resolve({x: -99, y: 99}, regions)).toBe(0x222222);
    });
});

describe('groundColor — the flat fill behind everything', () => {
    it('is black when the zone names no ground', () => {
        expect(groundColor(undefined, PROFILES)).toBe(0x000000);
    });

    it('is black for a profile with no colour, or an unknown one', () => {
        expect(groundColor('quiet', PROFILES)).toBe(0x000000);
        expect(groundColor('nope', PROFILES)).toBe(0x000000);
    });

    it("is the profile's colour otherwise", () => {
        expect(groundColor('bog', PROFILES)).toBe(0x222222);
    });
});
