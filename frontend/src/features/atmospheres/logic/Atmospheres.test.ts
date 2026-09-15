import {describe, it, expect} from 'vitest';
import {loadAtmospheres, loadedAtmospheres, toAtmospheres} from './Atmospheres';
import {
    buildProfiles, declaresDarkness, declaresHaze, DEFAULT_PROFILE, loadedRegions, loadRegions,
    ATMOSPHERE_PROFILES, TERRAIN_PROFILES, regionDarkness, regionHaze,
    lightRadiusWithSight, resolveIn, resolveSight, Region,
} from '../../regions/logic/Regions';
import {meter2px} from '../../../client-data/BasicConfig';
import {loadedPolygons, loadPolygons} from '../../polygons/logic/Polygons';

// 1 unit = 120 px (api/shared-constants.json pointsPerMeter), the same
// conversion every other surface primitive applies — pinned here because the
// world and the full-screen map both read it and a disagreement is invisible
// in either alone.
const PX = 120;

const TRI = [{x: 0, y: 0}, {x: 4, y: 0}, {x: 4, y: 4}];

describe('toAtmospheres', () => {
    it('converts server units to world pixels', () => {
        const [air] = toAtmospheres([
            {profile: 'CaveAir', points: [{x: -1, y: 0}, {x: 3, y: 2}, {x: 0, y: 5}]},
        ]);
        expect(air.profile).toBe('CaveAir');
        expect(air.points).toEqual([
            {x: -PX, y: 0}, {x: 3 * PX, y: 2 * PX}, {x: 0, y: 5 * PX},
        ]);
    });

    // Every zone shipped before this authors none — A0 is inert at HEAD.
    it('treats an absent array as no atmospheres', () => {
        expect(toAtmospheres(undefined)).toEqual([]);
    });

    // THREE points: an atmosphere encloses an AREA, the region and polygon
    // rule rather than the path one.
    it('drops a shape that cannot enclose an area rather than the whole zone', () => {
        const kept = toAtmospheres([
            {profile: 'Fog', points: [{x: 0, y: 0}, {x: 1, y: 0}]},   // a line
            {profile: 'Fog', points: [{x: 0, y: 0}]},                  // a point
            {profile: 'Fog', points: TRI},                             // fine
        ]);
        expect(kept).toHaveLength(1);
        expect(kept[0].points).toHaveLength(3);
    });

    // ⚑ The origin is applied ONCE, here. Unlike a polygon — which is collision
    // geometry and therefore placed by world.Place — an atmosphere is
    // client-visual and the server leaves it zone-local. Applying it in both
    // places would move every fog bank twice, and that failure is invisible in
    // `world` (origin {0,0}) and 300 units off in the underworld.
    it('applies a placed zone origin once', () => {
        const [air] = toAtmospheres([{profile: 'Fog', points: TRI}], {x: 500, y: 300});
        expect(air.points[0]).toEqual({x: 500 * PX, y: 300 * PX});
        expect(air.points[1]).toEqual({x: 504 * PX, y: 300 * PX});
    });

    // ⭐ THE D15 PIN, client half. "Polygon" in the PO's ask meant the SHAPE,
    // not the wall/mass concept. Nothing about collision or outlines may reach
    // the drawn atmosphere — the server refuses those keys by name, and if that
    // ever relaxes this is the second line of defence.
    it('carries no collision or outline fields into the drawn shape', () => {
        const [air] = toAtmospheres([{
            profile: 'Fog',
            points: TRI,
            blocksMovement: true,
            outlineProfile: 'Rim',
            outlineWidth: 0.5,
            width: 2,
            closed: true,
        } as never]);
        expect(air).not.toHaveProperty('blocksMovement');
        expect(air).not.toHaveProperty('outlineProfile');
        expect(air).not.toHaveProperty('outlineWidth');
        expect(air).not.toHaveProperty('width');
        expect(air).not.toHaveProperty('closed');
        // What IS carried, so the assertion above cannot pass by the conversion
        // silently returning nothing.
        expect(air.profile).toBe('Fog');
        expect(air.points).toHaveLength(3);
    });
});

describe('loadAtmospheres', () => {
    it('replaces rather than appends, so a zone swap drops the old zone', () => {
        loadAtmospheres([{profile: 'Fog', points: TRI}]);
        expect(loadedAtmospheres()).toHaveLength(1);

        loadAtmospheres([
            {profile: 'CaveAir', points: TRI},
            {profile: 'CaveAir', points: TRI},
        ]);
        expect(loadedAtmospheres()).toHaveLength(2);
        expect(loadedAtmospheres()[0].profile).toBe('CaveAir');

        loadAtmospheres(undefined);
        expect(loadedAtmospheres()).toEqual([]);
    });

    // ⭐ D0 as an executable pin: four surfaces, four stores, nothing merged.
    // A region answers resolve() for footsteps and music; the air a player
    // walks through must never turn up in that lookup just because it covers
    // the same ground.
    it('keeps the four surface arrays separate', () => {
        loadRegions([{profile: 'Fields', points: TRI}]);
        loadPolygons([{profile: 'Mountains', points: TRI}]);
        loadAtmospheres([{profile: 'CaveAir', points: TRI}]);

        expect(loadedRegions().map(r => r.profile)).toEqual(['Fields']);
        expect(loadedPolygons().map(p => p.profile)).toEqual(['Mountains']);
        expect(loadedAtmospheres().map(a => a.profile)).toEqual(['CaveAir']);

        // Loading atmospheres must not disturb either sibling.
        loadAtmospheres([{profile: 'Fog', points: TRI}, {profile: 'Fog', points: TRI}]);
        expect(loadedRegions()).toHaveLength(1);
        expect(loadedPolygons()).toHaveLength(1);
    });
});

// ---- darkness (plan-region-atmosphere.md A1) ---------------------------------

/** An axis-aligned square as the renderer holds one: world pixels. */
function square(profile: string, x: number, y: number, size: number): Region {
    return {
        profile,
        points: [
            {x, y}, {x: x + size, y}, {x: x + size, y: y + size}, {x, y: y + size},
        ],
    };
}

describe('darkness — parsing', () => {
    it('accepts an opacity in 0…1', () => {
        const profiles = buildProfiles({caveAir: {darkness: 0.7}});
        expect(profiles.caveAir.darkness).toBe(0.7);
    });

    // ⛔ Zero is not "no opinion" — it is the AUTHORED CLEARING D3 draws as an
    // erase. Dropping it would leave the key absent, which under the resolution
    // rule lets the bank it sits inside answer instead, and the lit pocket
    // would silently stay black.
    it('keeps an authored 0, which is a clearing and not a mistake', () => {
        const profiles = buildProfiles({clearing: {darkness: 0}});
        expect('darkness' in profiles.clearing).toBe(true);
        expect(profiles.clearing.darkness).toBe(0);
    });

    // Out of range is DROPPED rather than clamped: a profile asking for 2 has
    // misunderstood the unit, and falling back to the default makes that
    // visible at once where a silent clamp to 1 would look like it worked.
    it.each([
        ['above one', 2],
        ['negative', -0.5],
        ['not a number', 'dark'],
        ['not finite', Number.POSITIVE_INFINITY],
    ])('drops a %s value rather than clamping it', (_name, value) => {
        const profiles = buildProfiles({bad: {darkness: value}});
        expect('darkness' in profiles.bad).toBe(false);
    });

    // The feature has to cost exactly zero until a profile asks for it — the
    // bar blend and scroll were both held to.
    it('defaults to not dark at all', () => {
        expect(DEFAULT_PROFILE.darkness).toBe(0);
        expect(regionDarkness(square('unknown-profile', 0, 0, 10), {})).toBe(0);
    });
});

describe('darkness — declared vs. zero', () => {
    const profiles = buildProfiles({
        Bank: {darkness: 1},
        Clearing: {darkness: 0},
        Grass: {color: '#00ff00'},
    });

    // ⭐ THE D3 DISTINCTION, and the whole reason declaresDarkness exists beside
    // regionDarkness. A profile that DECLARES 0 is an authored clearing and draws
    // as an erase; one that declares nothing is transparent and draws NOTHING.
    // Collapsing the two would punch a hole through every fog bank that an
    // ordinary undeclared shape happens to overlap.
    it('tells a clearing apart from a shape with no opinion', () => {
        expect(declaresDarkness(square('Clearing', 0, 0, 1), profiles)).toBe(true);
        expect(declaresDarkness(square('Grass', 0, 0, 1), profiles)).toBe(false);
        expect(declaresDarkness(square('Bank', 0, 0, 1), profiles)).toBe(true);

        // …and both answer the same NUMBER, which is exactly why the number
        // alone cannot carry the distinction.
        expect(regionDarkness(square('Clearing', 0, 0, 1), profiles)).toBe(0);
        expect(regionDarkness(square('Grass', 0, 0, 1), profiles)).toBe(0);
    });

    // ⚑ Per SHAPE, never resolved at a point inside it: a clearing drawn inside
    // a bank must not inherit the bank's opacity, for the same reason a still
    // pond inside a river must not inherit its current.
    it('reads the shape\'s OWN profile, not the one it sits inside', () => {
        expect(regionDarkness(square('Clearing', 5, 5, 2), profiles)).toBe(0);
        expect(regionDarkness(square('Bank', 0, 0, 20), profiles)).toBe(1);
    });
});

describe('darkness — the per-point resolve', () => {
    const profiles = buildProfiles({
        Bank: {darkness: 1},
        Clearing: {darkness: 0},
        Grass: {color: '#00ff00'},
    });

    // ⭐ The lookup isHidden() uses is resolveIn over the SAME array in the SAME
    // order the painter drew — so the drawing and the lookup agree by
    // construction rather than by coincidence.
    it('answers dark inside a bank', () => {
        const air = [square('Bank', 0, 0, 20)];
        expect(resolveIn('darkness', {x: 10, y: 10}, air, profiles)).toBe(1);
    });

    it('answers lit outside every shape', () => {
        const air = [square('Bank', 0, 0, 20)];
        expect(resolveIn('darkness', {x: 50, y: 50}, air, profiles)).toBe(0);
    });

    // ⭐ The case D3 exists for: the LAST declaring shape containing the point
    // wins, so a clearing authored after the bank it sits inside answers 0.
    it('answers lit inside a clearing drawn over a bank', () => {
        const air = [square('Bank', 0, 0, 20), square('Clearing', 5, 5, 5)];
        expect(resolveIn('darkness', {x: 7, y: 7}, air, profiles)).toBe(0);
        // …and still dark just outside the clearing.
        expect(resolveIn('darkness', {x: 2, y: 2}, air, profiles)).toBe(1);
    });

    // ⚑ ORDER, not containment, decides. Authoring the bank last re-darkens the
    // clearing — which is a legal thing to author, and the pin that says the
    // rule is array order rather than "smallest shape wins".
    it('lets a later bank darken an earlier clearing', () => {
        const air = [square('Clearing', 5, 5, 5), square('Bank', 0, 0, 20)];
        expect(resolveIn('darkness', {x: 7, y: 7}, air, profiles)).toBe(1);
    });

    // A shape whose profile says nothing about darkness is TRANSPARENT to the
    // lookup — the bank behind it answers, and it does not punch a hole.
    it('sees through a shape that declares no darkness', () => {
        const air = [square('Bank', 0, 0, 20), square('Grass', 5, 5, 5)];
        expect(resolveIn('darkness', {x: 7, y: 7}, air, profiles)).toBe(1);
    });
});

// ---- sight (plan-region-atmosphere.md A2) ---------------------------------

describe('sight — the view limit', () => {
    const profiles = buildProfiles({
        Cave: {darkness: 1, sight: 2},
        Room: {darkness: 1, sight: 6},
        Bank: {darkness: 1},               // dark, but says nothing about sight
        Grass: {color: '#00ff00'},
    });

    // ⚑ The shipped default IS the old hard-coded floor, expressed in world
    // units. ⛔ There is deliberately NO `meter2px(DEFAULT_PROFILE.sight) ===
    // SELF_SIGHT_FLOOR_PX` assertion here: the default is DEFINED as
    // `px2meter(SELF_SIGHT_FLOOR_PX)`, so that comparison is a tautology that
    // passes for any value of the constant — it was written, it survived its
    // own mutation, and it was deleted. The duplication it would have guarded
    // is gone; one definition needs no pin.
    it('falls back to the profile default when nothing is authored', () => {
        expect(resolveSight({x: 0, y: 0}, [], profiles)).toBe(DEFAULT_PROFILE.sight);
        expect(DEFAULT_PROFILE.sight).toBeGreaterThan(0);
    });

    it('answers the containing shape\'s value', () => {
        const air = [square('Cave', 0, 0, 20)];
        expect(resolveSight({x: 10, y: 10}, air, profiles)).toBe(2);
    });

    it('falls back to the floor outside every shape', () => {
        const air = [square('Cave', 0, 0, 20)];
        expect(resolveSight({x: 99, y: 99}, air, profiles)).toBe(DEFAULT_PROFILE.sight);
    });

    // Per POINT, and the last declaring shape wins — regions' rule, and the
    // reason a lit room inside a cave can be authored as an inner shape.
    it('lets an inner room override the cave around it', () => {
        const air = [square('Cave', 0, 0, 20), square('Room', 5, 5, 5)];
        expect(resolveSight({x: 7, y: 7}, air, profiles)).toBe(6);
        expect(resolveSight({x: 2, y: 2}, air, profiles)).toBe(2);
    });

    // ⭐ darkness and sight are INDEPENDENT: a shape may be pitch dark and say
    // nothing about how far you see, in which case the floor answers. Binding
    // them would make "dark" and "blind" the same authored fact, and the GDD
    // separates them on purpose.
    it('is not implied by darkness', () => {
        const air = [square('Bank', 0, 0, 20)];
        expect(resolveIn('darkness', {x: 10, y: 10}, air, profiles)).toBe(1);
        expect(resolveSight({x: 10, y: 10}, air, profiles)).toBe(DEFAULT_PROFILE.sight);
    });

    it('is transparent through a shape that declares none', () => {
        const air = [square('Cave', 0, 0, 20), square('Grass', 5, 5, 5)];
        expect(resolveSight({x: 7, y: 7}, air, profiles)).toBe(2);
    });

    // 0 is a legal authored value — "you see nothing unaided" — and D7 is what
    // keeps it survivable, since a Lantern still wins the max downstream.
    it('accepts an authored zero', () => {
        const blind = buildProfiles({Pitch: {sight: 0}});
        expect('sight' in blind.Pitch).toBe(true);
        expect(resolveSight({x: 1, y: 1}, [square('Pitch', 0, 0, 10)], blind)).toBe(0);
    });

    it.each([
        ['negative', -1],
        ['not a number', 'far'],
        ['not finite', Number.POSITIVE_INFINITY],
    ])('drops a %s value and falls back to the floor', (_name, value) => {
        const bad = buildProfiles({Odd: {sight: value}});
        expect('sight' in bad.Odd).toBe(false);
        expect(resolveSight({x: 1, y: 1}, [square('Odd', 0, 0, 10)], bad))
            .toBe(DEFAULT_PROFILE.sight);
    });
});

describe('sight — D7, it can only ever make a place kinder', () => {
    const LANTERN_PX = meter2px(4);
    const FLOOR_PX = meter2px(DEFAULT_PROFILE.sight);

    // ⭐ THE RULING. A region that affords less sight than the light you are
    // carrying must not shrink your hole — otherwise map data could cancel a
    // Lantern, and the GDD's light-vs-damage trade-off goes with it.
    it('never shrinks a light the player earned', () => {
        expect(lightRadiusWithSight(LANTERN_PX, meter2px(2))).toBe(LANTERN_PX);
        expect(lightRadiusWithSight(LANTERN_PX, 0)).toBe(LANTERN_PX);
        expect(lightRadiusWithSight(LANTERN_PX, FLOOR_PX)).toBe(LANTERN_PX);
    });

    it('raises the hole when the air affords more than the light does', () => {
        expect(lightRadiusWithSight(FLOOR_PX, meter2px(6))).toBe(meter2px(6));
        expect(lightRadiusWithSight(0, meter2px(6))).toBe(meter2px(6));
    });

    // A player with no light at all still sees their own floor — "no light
    // SOURCE" is not "no eyes".
    it('leaves the floor standing with no light source at all', () => {
        expect(lightRadiusWithSight(0, FLOOR_PX)).toBe(FLOOR_PX);
    });

    // ⛔ The mutation this exists to catch: flipped to a plain assignment the
    // Lantern silently stops working inside every region that authors `sight`,
    // nothing throws, and the screen still looks like darkness working.
    it('is a MAX and not an assignment', () => {
        const dim = meter2px(1);
        expect(lightRadiusWithSight(LANTERN_PX, dim)).not.toBe(dim);
    });
});

// ---- ⭐ THE SPLIT: darkness vs haze (PO 2026-09-14) ------------------------
//
// The air is two things, and which one a profile authors decides how it
// behaves. `darkness` is the absence of light — a lantern removes it by
// definition. `haze` is suspended matter — a lamp shows it to you rather than
// dispersing it. ⭐ The behaviour follows from WHICH KEY you authored rather
// than from a flag beside a number, so the two can never contradict.

describe('darkness and haze are separate dials', () => {
    const table = {
        Night: {darkness: 0.8},
        Mist: {haze: 0.4, texture: 'fog-placeholder', scroll: {x: 1, y: 0}},
        Smoke: {darkness: 0.8, haze: 0.4},
        Nothing: {color: 0x334455},
        ClearBoth: {darkness: 0, haze: 0},
    };
    const shape = (profile: string) => ({profile, points: []});

    it('reads each dial from its own key, never from the other', () => {
        expect(regionDarkness(shape('Night'), table)).toBe(0.8);
        expect(regionHaze(shape('Night'), table)).toBe(0);
        expect(regionHaze(shape('Mist'), table)).toBe(0.4);
        expect(regionDarkness(shape('Mist'), table)).toBe(0);
    });

    // ⭐ The distinction that decides whether a shape is DRAWN AT ALL, and the
    // one that cost a session: removing the key from Fog made the whole bank
    // vanish — texture, drift and all — rather than making it pale.
    it('declaring a dial is what makes that half exist', () => {
        expect(declaresDarkness(shape('Night'), table)).toBe(true);
        expect(declaresHaze(shape('Night'), table)).toBe(false);
        expect(declaresHaze(shape('Mist'), table)).toBe(true);
        expect(declaresDarkness(shape('Mist'), table)).toBe(false);

        // A ground profile declaring neither is air that draws nothing — NOT a
        // hole. Collapsing those two would punch through every fog bank an
        // ordinary shape happens to overlap.
        expect(declaresDarkness(shape('Nothing'), table)).toBe(false);
        expect(declaresHaze(shape('Nothing'), table)).toBe(false);
    });

    // The smoky cave: both halves authored on one profile, each answering for
    // its own layer. A lantern then cuts the black and leaves the fog lit.
    it('a profile may author BOTH, and each dial keeps its own value', () => {
        expect(regionDarkness(shape('Smoke'), table)).toBe(0.8);
        expect(regionHaze(shape('Smoke'), table)).toBe(0.4);
        expect(declaresDarkness(shape('Smoke'), table)).toBe(true);
        expect(declaresHaze(shape('Smoke'), table)).toBe(true);
    });

    // ⚑ Per LAYER, so a clearing can open one and not the other. Today's
    // Clearing authors both zeros; one that authored only `darkness: 0` would
    // punch light into a smoky cave and leave the fog hanging.
    it('a clearing is per-layer: 0 is declared, and it is not "absent"', () => {
        expect(declaresDarkness(shape('ClearBoth'), table)).toBe(true);
        expect(declaresHaze(shape('ClearBoth'), table)).toBe(true);
        expect(regionDarkness(shape('ClearBoth'), table)).toBe(0);
        expect(regionHaze(shape('ClearBoth'), table)).toBe(0);
    });

    // ⛔ The shipped table is the thing the PO actually tunes, so it is pinned:
    // darkness must stay colour-only and haze must be the one that can drift.
    it('the shipped profiles keep darkness colour-only and haze textured', () => {
        expect(ATMOSPHERE_PROFILES['Cave Air'].darkness).toBeGreaterThan(0);
        expect('texture' in ATMOSPHERE_PROFILES['Cave Air']).toBe(false);
        expect('scroll' in ATMOSPHERE_PROFILES['Cave Air']).toBe(false);

        expect(ATMOSPHERE_PROFILES.Fog.haze).toBeGreaterThan(0);
        expect('darkness' in ATMOSPHERE_PROFILES.Fog).toBe(false);
        expect(ATMOSPHERE_PROFILES.Fog.texture).toBeTruthy();
    });
});

// ---- ⭐ THE TWO TABLES (PO 2026-09-15) -------------------------------------
//
// The ground and the air used to share one profiles.json and therefore ONE
// Tiled dropdown, so a ground profile could be named on an atmosphere (drawing
// nothing) and an atmosphere profile on a region (painting grey mud) — L15,
// and it cost a session. Two files means two enums and neither mistake is
// offerable. These pin the half a dropdown cannot: the DATA.

describe('the ground and air profile tables are separate namespaces', () => {
    // ⛔ THE LOAD-BEARING ONE. Every accessor picks its table by call site, so
    // a name in both would make "which Fog?" depend on which function you
    // happened to call — and both answers would look plausible on screen.
    it('shares no profile name between the two tables', () => {
        const shared = Object.keys(TERRAIN_PROFILES)
            .filter(name => name in ATMOSPHERE_PROFILES);
        expect(shared).toEqual([]);
    });

    // ⭐ The data half of the type split. TerrainProfile does not DECLARE these
    // keys, so TypeScript catches a read — but nothing type-checks the JSON,
    // and an air key authored on a ground profile is silently inert.
    it('no terrain profile authors an air-only key', () => {
        const offenders: string[] = [];
        Object.keys(TERRAIN_PROFILES).forEach((name) => {
            const profile = TERRAIN_PROFILES[name] as {[k: string]: unknown};
            ['darkness', 'haze', 'sight'].forEach((key) => {
                if (key in profile) { offenders.push(name + '.' + key); }
            });
        });
        expect(offenders).toEqual([]);
    });

    // ⚑ The other direction is NOT symmetric and must not be asserted: an air
    // profile legitimately wears texture/scale/blend/scroll/color, because fog
    // is a surface too. AtmosphereProfile EXTENDS TerrainProfile for exactly
    // that reason. What we can pin is that each table is non-empty, so a
    // mis-split file that parsed to nothing is not silently green.
    it('both tables actually loaded', () => {
        expect(Object.keys(TERRAIN_PROFILES).length).toBeGreaterThan(10);
        expect(Object.keys(ATMOSPHERE_PROFILES).length).toBeGreaterThan(0);
    });

    // ⛔ The shipped air table is what the PO tunes, so its two halves are
    // pinned apart: darkness stays colour-only, haze is the one that drifts.
    it('every shipped atmosphere declares at least one air dial', () => {
        const mute = Object.keys(ATMOSPHERE_PROFILES).filter((name) => {
            const shape = {profile: name, points: []};
            return !declaresDarkness(shape) && !declaresHaze(shape);
        });
        expect(mute).toEqual([]);
    });
});
