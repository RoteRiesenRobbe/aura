import {describe, expect, it} from 'vitest';
import {
    MapState, campfireMarkers, isInsideDrawnMap, mapScale, rescaleCoordinate, resizeTerrain,
    worldToMap,
} from './MapScale';

// The real world zone (api/zones/world.json) as the CLIENT receives it:
// origin-centred, and 144 × 72 world units × 120 px/unit — Welcome.mapWidth is
// `Bounds.Width * Points2px`, not metres. Using the real magnitude here keeps
// the fixture honest about the space the production caller works in.
const WORLD = {mapWidth: 17280, mapHeight: 8640};

describe('mapScale', () => {
    describe('docked', () => {
        it('fits width, ignoring height — the minimap always has', () => {
            expect(mapScale(MapState.DOCKED, {width: 1728, height: 1728}, WORLD))
                .toBeCloseTo(0.1, 10);
        });

        it('is unaffected by the box being short', () => {
            const wide = mapScale(MapState.DOCKED, {width: 288, height: 10}, WORLD);
            const tall = mapScale(MapState.DOCKED, {width: 288, height: 900}, WORLD);
            expect(wide).toBe(tall);
        });
    });

    describe('fullscreen', () => {
        it('fits both axes, so the limiting one wins', () => {
            // 1920/17280 = 0.1111 horizontally, 1080/8640 = 0.125 vertically
            // -> width binds.
            expect(mapScale(MapState.FULLSCREEN, {width: 1920, height: 1080}, WORLD))
                .toBeCloseTo(0.1111, 4);
        });

        it('lets height bind on a viewport wider than 2:1', () => {
            // The world is 2:1, so height only binds on a viewport wider than
            // that: 600/17280 = 0.0347 horizontally, 200/8640 = 0.0231.
            expect(mapScale(MapState.FULLSCREEN, {width: 600, height: 200}, WORLD))
                .toBeCloseTo(0.02315, 5);
        });

        it('exactly fills an aspect-matched viewport on both axes', () => {
            const scale = mapScale(MapState.FULLSCREEN, {width: 1440, height: 720}, WORLD);
            expect(WORLD.mapWidth * scale).toBeCloseTo(1440, 6);
            expect(WORLD.mapHeight * scale).toBeCloseTo(720, 6);
        });

        it('never exceeds the viewport on either axis — the letterbox guarantee', () => {
            const viewports = [
                {width: 1920, height: 1080},
                {width: 390, height: 844},
                {width: 844, height: 390},
                {width: 1000, height: 1000},
                {width: 320, height: 200},
            ];
            viewports.forEach((viewport) => {
                const scale = mapScale(MapState.FULLSCREEN, viewport, WORLD);
                expect(WORLD.mapWidth * scale).toBeLessThanOrEqual(viewport.width);
                expect(WORLD.mapHeight * scale).toBeLessThanOrEqual(viewport.height);
            });
        });

        it('is never larger than the docked scale for the same canvas', () => {
            const viewport = {width: 800, height: 600};
            expect(mapScale(MapState.FULLSCREEN, viewport, WORLD))
                .toBeLessThanOrEqual(mapScale(MapState.DOCKED, viewport, WORLD));
        });
    });

    describe('degenerate input', () => {
        // A pixi canvas measures 0 × 0 while display:none, which the phone
        // layout relies on (HUD.mobile.less keeps #minimap in the layout for
        // exactly this reason). A NaN/Infinity scale parks every icon in the
        // corner instead of failing loudly, so it is pinned here.
        it('returns 0 for a zero-sized canvas rather than NaN', () => {
            expect(mapScale(MapState.DOCKED, {width: 0, height: 0}, WORLD)).toBe(0);
            expect(mapScale(MapState.FULLSCREEN, {width: 0, height: 0}, WORLD)).toBe(0);
        });

        it('returns 0 for zero-sized bounds rather than Infinity', () => {
            const none = {mapWidth: 0, mapHeight: 0};
            expect(mapScale(MapState.DOCKED, {width: 800, height: 600}, none)).toBe(0);
            expect(mapScale(MapState.FULLSCREEN, {width: 800, height: 600}, none)).toBe(0);
        });

        it('survives NaN without propagating it', () => {
            expect(mapScale(MapState.FULLSCREEN, {width: NaN, height: 600}, WORLD)).toBe(0);
        });
    });
});

describe('worldToMap', () => {
    it('is a pure multiply — the origin is the container, not the caller', () => {
        expect(worldToMap(0, 0.1)).toBe(0);
        expect(worldToMap(-8640, 0.1)).toBeCloseTo(-864, 10);
        expect(worldToMap(4320, 0.1)).toBeCloseTo(432, 10);
    });

    it('places the world corners symmetrically about the origin', () => {
        const scale = mapScale(MapState.FULLSCREEN, {width: 1440, height: 720}, WORLD);
        expect(worldToMap(-WORLD.mapWidth / 2, scale)).toBeCloseTo(-720, 6);
        expect(worldToMap(WORLD.mapWidth / 2, scale)).toBeCloseTo(720, 6);
    });
});

describe('rescaleCoordinate', () => {
    it('preserves the world coordinate across a scale change', () => {
        // A point at canvas 60 under scale 2 sits at world 30; at scale 5 the
        // same world point must render at 150.
        expect(rescaleCoordinate(60, 2, 5)).toBe(150);
    });

    it('round-trips docked -> fullscreen -> docked', () => {
        const docked = mapScale(MapState.DOCKED, {width: 200, height: 200}, WORLD);
        const full = mapScale(MapState.FULLSCREEN, {width: 1920, height: 1080}, WORLD);
        // The western campfire, in px space: -58.2 world units × 120.
        const start = worldToMap(-6984, docked);
        const there = rescaleCoordinate(start, docked, full);
        expect(rescaleCoordinate(there, full, docked)).toBeCloseTo(start, 10);
    });

    it('leaves the coordinate alone when there is no previous scale to divide by', () => {
        expect(rescaleCoordinate(42, 0, 5)).toBe(42);
        expect(rescaleCoordinate(42, undefined as unknown as number, 5)).toBe(42);
    });

    it('collapses to the origin when the new scale is 0, and recovers from it', () => {
        // Toggling to a hidden (0 × 0) canvas and back must not strand icons:
        // the collapse is lossy, but the guard above means the recovery leg
        // keeps the canvas coordinate rather than dividing by zero.
        const collapsed = rescaleCoordinate(150, 5, 0);
        expect(collapsed).toBe(0);
        expect(rescaleCoordinate(collapsed, 0, 5)).toBe(0);
    });
});

/**
 * The one invariant that makes the map a drawing of the world rather than two
 * unrelated pictures: the baked terrain and the markers on top of it are
 * placed by the SAME scale. Everything else about the bake (texture size,
 * antialiasing, which SVG went where) is presentation; this is correctness.
 */
describe('resizeTerrain — terrain and markers share one scale', () => {
    const viewports = [
        {width: 1920, height: 1080},
        {width: 1440, height: 720},
        {width: 390, height: 844},
        {width: 600, height: 200},
    ];

    it('draws terrain whose half-width is exactly where an edge marker goes', () => {
        viewports.forEach((viewport) => {
            const scale = mapScale(MapState.FULLSCREEN, viewport, WORLD);
            const terrain = {width: 0, height: 0};
            resizeTerrain(terrain, WORLD.mapWidth, WORLD.mapHeight, scale);

            // A marker at the world's eastern edge is drawn here...
            const easternEdge = worldToMap(WORLD.mapWidth / 2, scale);
            // ...and the centre-anchored terrain sprite reaches exactly there.
            expect(terrain.width / 2).toBeCloseTo(easternEdge, 6);
            expect(terrain.height / 2)
                .toBeCloseTo(worldToMap(WORLD.mapHeight / 2, scale), 6);
        });
    });

    it('keeps a mid-world marker at the same fraction of the terrain at every scale', () => {
        // The western campfire at world -58.2 -> px -6984.
        const fractions = viewports.map((viewport) => {
            const scale = mapScale(MapState.FULLSCREEN, viewport, WORLD);
            const terrain = {width: 0, height: 0};
            resizeTerrain(terrain, WORLD.mapWidth, WORLD.mapHeight, scale);
            return worldToMap(-6984, scale) / terrain.width;
        });

        fractions.forEach((fraction) => {
            expect(fraction).toBeCloseTo(fractions[0], 10);
        });
        // Sanity on the fixture itself: -6984 of 17280 is just past four
        // tenths west of centre.
        expect(fractions[0]).toBeCloseTo(-0.4042, 4);
    });

    it('collapses to nothing at scale 0 rather than lingering as a stretched artefact', () => {
        const terrain = {width: 123, height: 456};
        resizeTerrain(terrain, WORLD.mapWidth, WORLD.mapHeight, 0);
        expect(terrain.width).toBe(0);
        expect(terrain.height).toBe(0);
    });

    it('never overflows the viewport it was fitted to', () => {
        const viewport = {width: 800, height: 600};
        const terrain = {width: 0, height: 0};
        resizeTerrain(terrain, WORLD.mapWidth, WORLD.mapHeight,
            mapScale(MapState.FULLSCREEN, viewport, WORLD));
        expect(terrain.width).toBeLessThanOrEqual(viewport.width);
        expect(terrain.height).toBeLessThanOrEqual(viewport.height);
    });
});

/**
 * Click-away dismissal: a press off the drawn map closes it, a press on it is
 * reserved (part 2 makes it destination selection). The map is centred in a
 * canvas that is usually a different shape, so "off the map" is mostly the
 * letterbox bands — which is exactly the region this has to get right.
 */
describe('isInsideDrawnMap', () => {
    // 1000 × 1000 canvas, 2:1 world -> scale 1000/17280, so the map is
    // 1000 × 500 centred vertically: bands of 250 above and below.
    const viewport = {width: 1000, height: 1000};
    const scale = mapScale(MapState.FULLSCREEN, viewport, WORLD);

    const at = (x: number, y: number) =>
        isInsideDrawnMap({x, y}, viewport, WORLD, scale);

    it('is true at the centre', () => {
        expect(at(500, 500)).toBe(true);
    });

    it('is false in the letterbox bands above and below', () => {
        expect(at(500, 100)).toBe(false);
        expect(at(500, 900)).toBe(false);
    });

    it('is true just inside each edge and false just outside', () => {
        // The map spans y from 250 to 750 at this scale.
        expect(at(500, 255)).toBe(true);
        expect(at(500, 245)).toBe(false);
        expect(at(500, 745)).toBe(true);
        expect(at(500, 755)).toBe(false);
        // ...and fills the full width, so the horizontal edges are the canvas.
        expect(at(5, 500)).toBe(true);
        expect(at(995, 500)).toBe(true);
    });

    it('is false for a press outside the canvas entirely (the header strip)', () => {
        expect(at(500, -40)).toBe(false);
        expect(at(-10, 500)).toBe(false);
    });

    it('is false when nothing is drawn, so the press still dismisses', () => {
        // A zero scale means an unmeasured or hidden canvas. Swallowing the
        // press there would leave the map open with no way out but the key.
        expect(isInsideDrawnMap({x: 500, y: 500}, viewport, WORLD, 0)).toBe(false);
    });

    it('tracks the letterbox as the viewport changes shape', () => {
        // A viewport WIDER than 2:1 letterboxes left and right instead.
        const wide = {width: 1000, height: 200};
        const wideScale = mapScale(MapState.FULLSCREEN, wide, WORLD);
        // Map is 400 × 200 centred: bands of 300 either side.
        expect(isInsideDrawnMap({x: 500, y: 100}, wide, WORLD, wideScale)).toBe(true);
        expect(isInsideDrawnMap({x: 100, y: 100}, wide, WORLD, wideScale)).toBe(false);
        expect(isInsideDrawnMap({x: 900, y: 100}, wide, WORLD, wideScale)).toBe(false);
    });
});

/**
 * Campfire markers (plan-world-map.md C2). The fixture is the real world zone's
 * five fires, so "discovered" and "placed" are the same shapes production sees.
 */
describe('campfireMarkers', () => {
    const FIRES = [
        {id: 'spawnpoint-1', x: -58.2, y: 24},
        {id: 'spawnpoint-2', x: 44, y: 10.5},
        {id: 'spawnpoint-3', x: -16.47, y: 31.53},
        {id: 'spawnpoint-4', x: -21.26, y: -23.51},
        {id: 'spawnpoint-5', x: 34.19, y: -20.68},
    ];
    const PX_PER_UNIT = 120;
    const FULL = mapScale(MapState.FULLSCREEN, {width: 1920, height: 1080}, WORLD);

    it('draws only discovered fires — the rest are absent, not dimmed', () => {
        const markers = campfireMarkers(
            FIRES, new Set(['spawnpoint-2', 'spawnpoint-5']), '', FULL, PX_PER_UNIT);

        expect(markers.map((m) => m.id)).toEqual(['spawnpoint-2', 'spawnpoint-5']);
    });

    it('places a marker exactly where the same world point renders', () => {
        const [marker] = campfireMarkers(
            FIRES, new Set(['spawnpoint-1']), '', FULL, PX_PER_UNIT);

        // -58.2 world units -> -6984 px -> the map's own worldToMap.
        expect(marker.x).toBeCloseTo(worldToMap(-6984, FULL), 6);
        expect(marker.y).toBeCloseTo(worldToMap(2880, FULL), 6);
    });

    it('flags exactly the bound fire as home', () => {
        const markers = campfireMarkers(
            FIRES, new Set(['spawnpoint-1', 'spawnpoint-2']), 'spawnpoint-2',
            FULL, PX_PER_UNIT);

        expect(markers.filter((m) => m.home).map((m) => m.id)).toEqual(['spawnpoint-2']);
    });

    it('flags nothing when the bound fire has not been discovered', () => {
        // Reachable: the bind is re-installed at join from a persisted id, and
        // a set that does not contain it can only mean content drift.
        const markers = campfireMarkers(
            FIRES, new Set(['spawnpoint-1']), 'spawnpoint-9', FULL, PX_PER_UNIT);

        expect(markers.every((m) => !m.home)).toBe(true);
    });

    it('silently skips a discovered id the zone no longer places', () => {
        // A fire deleted in the zone editor, or a client whose bundled content
        // is older than the server's. It must draw nothing — never throw, and
        // never warn once a frame.
        const markers = campfireMarkers(
            FIRES, new Set(['spawnpoint-1', 'spawnpoint-deleted']), '', FULL, PX_PER_UNIT);

        expect(markers.map((m) => m.id)).toEqual(['spawnpoint-1']);
    });

    it('draws nothing at scale 0, rather than stacking every fire on the origin', () => {
        // A canvas measures 0 × 0 while display:none — the phone keeps the
        // minimap in the layout for exactly that reason. Multiplying through
        // would put five fires at the centre of the world, which reads as a
        // real cluster rather than as an unmeasured canvas.
        expect(campfireMarkers(FIRES, new Set(['spawnpoint-1']), '', 0, PX_PER_UNIT))
            .toEqual([]);
        expect(campfireMarkers(FIRES, new Set(['spawnpoint-1']), '', NaN, PX_PER_UNIT))
            .toEqual([]);
    });

    it('draws nothing before anything is discovered, and survives absent data', () => {
        expect(campfireMarkers(FIRES, new Set(), '', FULL, PX_PER_UNIT)).toEqual([]);
        expect(campfireMarkers([], new Set(['spawnpoint-1']), '', FULL, PX_PER_UNIT))
            .toEqual([]);
        expect(campfireMarkers(
            undefined as never, new Set(['spawnpoint-1']), '', FULL, PX_PER_UNIT))
            .toEqual([]);
    });

    it('skips a fire with no id — it can never be named by the server set', () => {
        expect(campfireMarkers(
            [{x: 1, y: 2}], new Set(['spawnpoint-1']), '', FULL, PX_PER_UNIT)).toEqual([]);
    });

    it('keeps a marker on the same fraction of the map at every scale', () => {
        // The same invariant resizeTerrain is pinned against next door: markers
        // and the ground under them are placed by one scale, so a state toggle
        // cannot slide a fire off the spot it stands on.
        const fractions = [
            mapScale(MapState.DOCKED, {width: 202, height: 202}, WORLD),
            mapScale(MapState.FULLSCREEN, {width: 1920, height: 1080}, WORLD),
            mapScale(MapState.FULLSCREEN, {width: 390, height: 844}, WORLD),
        ].map((scale) => {
            const [marker] = campfireMarkers(
                FIRES, new Set(['spawnpoint-4']), '', scale, PX_PER_UNIT);
            return marker.x / (WORLD.mapWidth * scale);
        });

        fractions.forEach((fraction) => expect(fraction).toBeCloseTo(fractions[0], 10));
    });
});
