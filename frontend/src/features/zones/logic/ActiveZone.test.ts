import {describe, expect, it, vi} from 'vitest';

// GroundTextureManager reaches PixiJS and a webpack require.context at import
// time, so the bundled-zone lookup is stubbed rather than loaded. What is under
// test here is the geometry, which is pure.
vi.mock('../../ground-textures/logic/GroundTextureManager', () => ({
    getZoneData: (name: string) => ({
        world: {bounds: {width: 144, height: 72}},
        under: {bounds: {width: 60, height: 40}, origin: {x: 0, y: -300}},
        noBounds: {},
    } as Record<string, unknown>)[name],
}));

import {ActiveZoneTracker, contains, zoneAt, zoneRects} from './ActiveZone';

/**
 * The client half of "which zone am I in" (plan-underworld.md U2).
 *
 * ⭐ This mirrors cfg.ZoneIndexAt on the server ON PURPOSE. The two sides must
 * agree about where a player is, and the rule — a point in one of a few
 * non-overlapping rectangles — is small enough that restating it beats
 * inventing a wire field to carry the answer. If one side ever changes, this
 * file and backend/pkg/aura/cfg/placedbounds_test.go should both have to.
 */

describe('zoneRects', () => {
    it('reads bounds and origin from the bundled zone data', () => {
        const rects = zoneRects(['world', 'under']);
        expect(rects).toHaveLength(2);
        expect(rects[0]).toEqual({name: 'world', originX: 0, originY: 0, width: 144, height: 72});
        expect(rects[1]).toEqual({name: 'under', originX: 0, originY: -300, width: 60, height: 40});
    });

    it('defaults a missing origin to the shared origin', () => {
        expect(zoneRects(['world'])[0].originY).toBe(0);
    });

    // ⚑ Skipped, not faked. Inventing bounds would put the camera clamp and the
    // map on a rectangle the server's border wall does not agree with.
    it('skips a zone with no bundled data rather than guessing its size', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(zoneRects(['world', 'missing', 'noBounds'])).toHaveLength(1);
        expect(warn).toHaveBeenCalledTimes(2);
        warn.mockRestore();
    });
});

describe('contains', () => {
    const world = {name: 'world', originX: 0, originY: 0, width: 144, height: 72};

    it('includes the edge, where the border wall still holds you', () => {
        expect(contains(world, 72, 36)).toBe(true);
        expect(contains(world, -72, -36)).toBe(true);
    });

    it('excludes just past the edge', () => {
        expect(contains(world, 72.1, 0)).toBe(false);
        expect(contains(world, 0, -36.1)).toBe(false);
    });

    it('follows the origin', () => {
        const under = {name: 'under', originX: 0, originY: -300, width: 60, height: 40};
        expect(contains(under, 0, -300)).toBe(true);
        expect(contains(under, 0, 0)).toBe(false);
    });
});

describe('zoneAt', () => {
    const rects = zoneRects(['world', 'under']);

    it('finds the containing zone', () => {
        expect(zoneAt(rects, 0, 0)?.name).toBe('world');
        expect(zoneAt(rects, 5, -295)?.name).toBe('under');
    });

    // The gap is unreachable in play — each zone's wall holds its occupants in
    // — so this is a bug signal, not a case to render.
    it('returns undefined in the gap between zones', () => {
        expect(zoneAt(rects, 0, -150)).toBeUndefined();
    });
});

describe('ActiveZoneTracker', () => {
    it('starts in the zone it is told to', () => {
        expect(new ActiveZoneTracker(['world', 'under'], 'under').active?.name).toBe('under');
    });

    it('falls back to the primary zone when given no starting zone', () => {
        expect(new ActiveZoneTracker(['world', 'under']).active?.name).toBe('world');
    });

    // ⭐ The whole transition contract: a change is reported ONCE, and only on
    // the tick it happens. A caller drives a re-render off this return value,
    // so reporting every tick would rebuild the world 30 times a second.
    it('reports a change once, then stays quiet', () => {
        const t = new ActiveZoneTracker(['world', 'under'], 'world');
        expect(t.update(0, 0)).toBeUndefined();
        expect(t.update(0, -300)?.name).toBe('under');
        expect(t.update(1, -299)).toBeUndefined();
        expect(t.update(0, 0)?.name).toBe('world');
    });

    // ⚑ Sticky across an unknown position, deliberately. A player who is
    // briefly nowhere would otherwise tear the world down twice — out to
    // nothing and back — for no reason.
    it('keeps the last zone when the position is in no zone at all', () => {
        const t = new ActiveZoneTracker(['world', 'under'], 'world');
        expect(t.update(0, -150)).toBeUndefined();
        expect(t.active?.name).toBe('world');
    });
});
