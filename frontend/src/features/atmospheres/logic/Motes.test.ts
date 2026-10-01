import {describe, expect, it} from 'vitest';
import {meter2px} from '../../../client-data/BasicConfig';
import {
    maxMotes, moteAt, moteCount, MoteSpec, polygonArea, randomPointIn, Rng, spawnMote, stepMote,
} from './Motes';
import {
    ATMOSPHERE_PROFILES, buildProfiles, DEFAULT_MOTES, declaresHaze, pointInPolygon, regionMotes,
} from '../../regions/logic/Regions';

/** A tiny seeded LCG, so a failing case replays. */
function seeded(seed: number): Rng {
    let state = seed >>> 0;
    return () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 0x100000000;
    };
}

const SQUARE = [{x: 0, y: 0}, {x: 400, y: 0}, {x: 400, y: 400}, {x: 0, y: 400}];
// An L, so the box around it has a corner a naive sampler would fill.
const ELL = [{x: 0, y: 0}, {x: 400, y: 0}, {x: 400, y: 100}, {x: 100, y: 100},
    {x: 100, y: 400}, {x: 0, y: 400}];
const SPEC: MoteSpec = {wanderPx: 30, speedPx: 15, life: 5};

describe('mote placement', () => {
    it('measures a polygon either winding', () => {
        expect(polygonArea(SQUARE)).toBe(160000);
        expect(polygonArea([...SQUARE].reverse())).toBe(160000);
    });

    it('samples only inside a concave shape', () => {
        const rng = seeded(7);
        for (let i = 0; i < 500; i++) {
            expect(pointInPolygon(randomPointIn(ELL, rng), ELL)).toBe(true);
        }
    });

    it('scales the count with area and caps it per shape', () => {
        const unit = meter2px(1);
        expect(moteCount(100 * unit * unit, 0.06, false)).toBe(6);
        expect(moteCount(1e6 * unit * unit, 0.06, false)).toBe(maxMotes(false));
        expect(maxMotes(true)).toBeLessThan(maxMotes(false));
    });
});

describe('a mote\'s dance', () => {
    it('never strays past its wander', () => {
        const rng = seeded(3);
        for (let i = 0; i < 50; i++) {
            const mote = spawnMote(SQUARE, SPEC, rng);
            for (let t = 0; t < mote.life; t += 0.1) {
                mote.age = t;
                const at = moteAt(mote);
                expect(Math.abs(at.x - mote.homeX)).toBeLessThanOrEqual(SPEC.wanderPx + 1e-9);
                expect(Math.abs(at.y - mote.homeY)).toBeLessThanOrEqual(SPEC.wanderPx + 1e-9);
            }
        }
    });

    it('swells from nothing to full and back over its life', () => {
        const mote = spawnMote(SQUARE, SPEC, seeded(1));
        mote.age = 0;
        expect(moteAt(mote).swell).toBeCloseTo(0);
        mote.age = mote.life / 2;
        expect(moteAt(mote).swell).toBeCloseTo(1);
        mote.age = mote.life;
        expect(moteAt(mote).swell).toBeCloseTo(0);
    });

    // ⭐ The complaint this whole module answers: on a tile every mote moved
    // together. Two motes must not share a path.
    it('moves each mote on its own path', () => {
        const rng = seeded(11);
        const a = spawnMote(SQUARE, SPEC, rng);
        const b = spawnMote(SQUARE, SPEC, rng);
        a.age = b.age = 1;
        const da = {x: moteAt(a).x - a.homeX, y: moteAt(a).y - a.homeY};
        const db = {x: moteAt(b).x - b.homeX, y: moteAt(b).y - b.homeY};
        expect(da).not.toEqual(db);
    });

    it('is reborn in place past its life, carrying the leftover time', () => {
        const rng = seeded(5);
        const mote = spawnMote(SQUARE, SPEC, rng);
        const life = mote.life;
        const same = mote;
        stepMote(mote, life + 0.25, SQUARE, SPEC, rng);
        expect(mote).toBe(same);
        expect(mote.age).toBeCloseTo(0.25);
        expect(pointInPolygon({x: mote.homeX, y: mote.homeY}, SQUARE)).toBe(true);
    });
});

describe('the motes profile key', () => {
    it('fills missing or bad keys from the default, and drops a non-object', () => {
        const table = buildProfiles({
            Empty: {haze: 1, motes: {}},
            Partial: {haze: 1, motes: {density: 0.2, life: -1}},
            Broken: {haze: 1, motes: 3},
        });
        expect(regionMotes({profile: 'Empty', points: []}, table)).toEqual(DEFAULT_MOTES);
        expect(regionMotes({profile: 'Partial', points: []}, table))
            .toEqual({...DEFAULT_MOTES, density: 0.2});
        expect(regionMotes({profile: 'Broken', points: []}, table)).toBeNull();
    });

    // ⛔ A swarm lives in the haze layer: without `haze` it would parse, look
    // authored, and draw nothing.
    it('every shipped swarm declares haze', () => {
        const mute = Object.keys(ATMOSPHERE_PROFILES).filter((name) => {
            const shape = {profile: name, points: []};
            return regionMotes(shape) !== null && !declaresHaze(shape);
        });
        expect(mute).toEqual([]);
        expect(regionMotes({profile: 'Fairy Dust', points: []})).not.toBeNull();
    });
});
