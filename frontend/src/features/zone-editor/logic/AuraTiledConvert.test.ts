/**
 * Guards the Tiled zone format's pure half
 * (tools/tiled/extensions/aura-zone/aura-convert.js).
 *
 * ⚑ Why a test for a tools/ file lives under frontend/src: vitest's include is
 * `src/**\/*.test.ts`, so `npm test` is the only runner in the repo — and this
 * guards exactly the invariant ZoneModel.test.ts guards next door. The two
 * serializers MUST agree byte for byte, because a Tiled save and an in-game
 * editor save land in the same file. Keeping the tests adjacent is the point.
 *
 * The module under test is plain ES5 with a module.exports footer (Tiled runs
 * QJSEngine and cannot use ESM), hence createRequire rather than import.
 */
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
// The third whitelist. C2 brought it under the same pin: two of the three
// serializers being complete is not the invariant — all three are.
import {ZoneData, ZoneModel} from './ZoneModel';

// NOT named 'require': TypeScript reserves that identifier at module top level
// (TS2441), and webpack type-checks this file as part of the app build.
const nodeRequire = createRequire(__filename);
const C = nodeRequire('../../../../../tools/tiled/extensions/aura-zone/aura-convert.js');

// require.resolve, not a file: URL — under vitest's jsdom environment
// import.meta.url is not guaranteed to be one.
const worldText = readFileSync(nodeRequire.resolve('../../../../../api/zones/world.json'), 'utf8');

// The generated content vocabulary. C5 moved it out of the extension and into
// the palette as plain JSON, so the extension carries no content at all and the
// converter takes it through an explicit seam. Loading it here tests the REAL
// configuration.
const content = nodeRequire('../../../../../tools/tiled/palette/content.json');
C.useContent(content);

// A minimal zone the shipped file cannot exercise on its own.
function zone(overrides: Record<string, unknown> = {}) {
    return {
        name: 'T', bounds: {width: 20, height: 10},
        terrain: [], props: [], spawns: [],
        ...overrides,
    };
}

// Through the serializer on purpose. modelToZone returns raw floats and leaves
// tri-state keys present-but-undefined, exactly as ZoneModel does; rounding and
// key-dropping are the serializer's job, and the file on disk is what matters.
function roundTrip(z: unknown) {
    return JSON.parse(C.serializeZone(C.modelToZone(C.zoneToModel(z))));
}

describe('AuraConvert — byte-stability against the shipped world.json', () => {
    it('the canonical serializer reproduces world.json exactly', () => {
        expect(C.serializeZone(JSON.parse(worldText))).toBe(worldText);
    });

    it('a full Tiled-model round-trip reproduces world.json exactly', () => {
        const model = C.zoneToModel(JSON.parse(worldText));
        expect(C.serializeZone(C.modelToZone(model))).toBe(worldText);
    });

    // The repo has two zone writers that disagree by one byte:
    // scripts/world-place.py appends a newline, ZoneModel.getZoneAsJSON does
    // not, and the committed world.json carries the Python one. Taking either
    // side would leave this tool permanently one byte off the other writer.
    it('preserves a trailing newline when the source had one', () => {
        const z = JSON.parse(worldText);
        expect(C.endsWithNewline(worldText + '\n')).toBe(true);
        expect(C.serializeZone(z, true)).toBe(C.serializeZone(z) + '\n');
    });

    it('adds no trailing newline when the source had none', () => {
        const z = JSON.parse(worldText);
        expect(C.endsWithNewline(C.serializeZone(z, false))).toBe(false);
        expect(C.serializeZone(z, false)).toBe(C.serializeZone(z));
    });

    // Counts are DERIVED from the file, never hardcoded: world.json is live
    // content and every authored edit would otherwise turn this red. What is
    // being asserted is "no array loses objects", not any particular census.
    it('maps every array onto its own layer, losing nothing', () => {
        const src = JSON.parse(worldText);
        const model = C.zoneToModel(src);
        const counts: Record<string, number> = {};
        model.layers.forEach((l: {name: string; objects: unknown[]}) => {
            counts[l.name] = l.objects.length;
        });
        const expected: Record<string, number> = {};
        C.LAYERS.forEach((name: string) => { expected[name] = (src[name] || []).length; });
        expect(counts).toEqual(expected);
    });

    it('terrain paint order is preserved as index draw order', () => {
        const src = JSON.parse(worldText);
        const model = C.zoneToModel(src);
        const terrain = model.layers.find((l: {name: string}) => l.name === 'terrain');
        expect(terrain.drawOrder).toBe('index');
        // array order is paint order, so object order must match file order
        const last = src.terrain.length - 1;
        expect(terrain.objects[0].name).toBe(src.terrain[0].type);
        expect(terrain.objects[last].name).toBe(src.terrain[last].type);
    });
});

describe('AuraConvert — the tri-state fields', () => {
    it('an inheriting spawn keeps wanderRadius absent, not zero', () => {
        const out = roundTrip(zone({spawns: [{mob: 'Wolf', x: 1, y: 2, angle: 0}]}));
        expect('wanderRadius' in out.spawns[0]).toBe(false);
        expect(JSON.stringify(out)).not.toContain('wanderRadius');
    });

    it('an explicit wanderRadius of 0 survives — it means "stationary"', () => {
        const out = roundTrip(zone({
            spawns: [{mob: 'Wolf', x: 1, y: 2, angle: 0, wanderRadius: 0}],
        }));
        expect(out.spawns[0].wanderRadius).toBe(0);
        expect('wanderRadius' in out.spawns[0]).toBe(true);
    });

    it('a talker keeps NO respawn keys (an absent key means respawn-next-tick)', () => {
        const out = JSON.stringify(roundTrip(zone({
            spawns: [{mob: 'Farmer', x: -57, y: 28.6, angle: 0}],
        })));
        expect(out).not.toContain('respawnTicks');
        expect(out).not.toContain('respawnVariancePct');
    });

    it('level and idleSpeedFactor survive when authored', () => {
        const out = roundTrip(zone({
            spawns: [{mob: 'Wolf', x: 0, y: 0, angle: 0, level: 13, idleSpeedFactor: 0.1}],
        }));
        expect(out.spawns[0].level).toBe(13);
        expect(out.spawns[0].idleSpeedFactor).toBe(0.1);
    });
});

describe('AuraConvert — terrain geometry', () => {
    it('size is a HALF-EXTENT: 1.75 becomes a 420 px box', () => {
        const model = C.zoneToModel(zone({
            terrain: [{type: 'Land', x: 0, y: 0, size: 1.75, rotation: 0, flipped: 'none'}],
        }));
        const o = model.layers[0].objects[0];
        expect(o.width).toBe(420);
        expect(o.height).toBe(420);
    });

    it('a rotated, flipped piece round-trips', () => {
        const t = {type: 'Sand', x: -12.34, y: 5.67, size: 1.42, rotation: 6.176, flipped: 'horizontal'};
        expect(roundTrip(zone({terrain: [t]})).terrain[0]).toEqual(t);
    });

    it('each flip value round-trips', () => {
        ['none', 'horizontal', 'vertical'].forEach(flipped => {
            const t = {type: 'Land', x: 1, y: 2, size: 1, rotation: 1.5, flipped};
            expect(roundTrip(zone({terrain: [t]})).terrain[0].flipped).toBe(flipped);
        });
    });

    it('rejects a both-axes flip, which world.json cannot express', () => {
        const model = C.zoneToModel(zone({
            terrain: [{type: 'Land', x: 0, y: 0, size: 1, rotation: 0, flipped: 'horizontal'}],
        }));
        model.layers[0].objects[0].flipV = true;
        expect(() => C.modelToZone(model)).toThrow(/both-axes flip/);
    });

    it('flip rides the real gid flags, not a custom property', () => {
        const model = C.zoneToModel(zone({
            terrain: [{type: 'Land', x: 0, y: 0, size: 1, rotation: 0, flipped: 'vertical'}],
        }));
        const o = model.layers[0].objects[0];
        expect(o.shape).toBe('tile');
        expect({h: o.flipH, v: o.flipV}).toEqual({h: false, v: true});
        expect(o.properties.flipped).toBeUndefined();
    });
});

describe('AuraConvert — the generated palette (C2)', () => {
    it('draws each prop at its TYPE body size, in px', () => {
        const model = C.zoneToModel(zone({
            props: [
                {type: 'House', x: 0, y: 0, rotation: 0, blocksMovement: true},
                {type: 'Tree', x: 0, y: 0, rotation: 0, blocksMovement: true},
            ],
        }));
        const [house, tree] = model.layers[1].objects;
        // house.json body 4x3 units; tree.json radius 1.4 -> 2.8x2.8 units.
        // ⚑ The tree's 1.4 is its VISUAL radius since C1b — the authored body
        // is now what the sprite is drawn at, and the 1.0 trunk collider is
        // body.collisionFactor. That is precisely what makes this box match
        // the game: before C1b it drew the collider and was 29% too small.
        expect({w: house.width, h: house.height}).toEqual({w: 4 * 120, h: 3 * 120});
        expect({w: tree.width, h: tree.height}).toEqual({w: 2.8 * 120, h: 2.8 * 120});
    });

    it('every prop type in world.json has a palette size', () => {
        const used = new Set<string>(JSON.parse(worldText).props.map((p: {type: string}) => p.type));
        used.forEach(t => expect(content.PROP_SIZE[t], `no size for prop "${t}"`).toBeDefined());
    });

    it('every mob in world.json has a derived kind', () => {
        const used = new Set<string>(JSON.parse(worldText).spawns.map((s: {mob: string}) => s.mob));
        used.forEach(m => expect(content.MOB_KIND[m], `no kind for mob "${m}"`).toBeDefined());
    });

    it('classes spawns by derived kind, so Tiled colours them like the editor', () => {
        const model = C.zoneToModel(zone({
            spawns: [
                {mob: 'Wolf', x: 0, y: 0, angle: 0},    // combat
                {mob: 'Farmer', x: 0, y: 0, angle: 0},  // talker (authors an interaction)
            ],
        }));
        expect(model.layers[2].objects.map((o: {cls: string}) => o.cls))
            .toEqual(['AuraSpawnCombat', 'AuraSpawnTalker']);
    });

    // ⭐ INVERTED by plan-prop-scale.md C1. Before C1 the writer read a prop's
    // box only to recover its centre and threw the size away, so this test
    // asserted the discard. Resizing a prop IS authoring scale now — that is
    // the whole chunk, opened by a PO scaling a tree in Tiled to no effect.
    it('resizing a prop authors scale, and the centre still comes back', () => {
        const src = zone({props: [{type: 'House', x: 3, y: -4, rotation: 0, blocksMovement: true}]});
        const model = C.zoneToModel(src);
        const o = model.layers[1].objects[0];
        // House is 4×3 units = 480×360 px. Double it, about its centre.
        // ⚑ A tile object anchors BOTTOM-left, so the bottom edge moves DOWN
        // (+y) while the left edge moves left — getting this backwards is
        // exactly the mistake the anchor convention invites.
        o.x -= 240; o.y += 180; o.width = 960; o.height = 720;
        const out = C.modelToZone(model).props[0];
        // Still no absolute size key — the multiplier is the whole format.
        expect('size' in out).toBe(false);
        expect(out.scale).toBe(2);
        expect({x: C.round(out.x, 2), y: C.round(out.y, 2)}).toEqual({x: 3, y: -4});
    });

    // The case that protects all 807 existing placements: an untouched box must
    // derive EXACTLY 1, which normalises back to absent.
    it('an untouched prop authors no scale at all', () => {
        for (const type of ['Tree', 'Boulder', 'Rock', 'House', 'GateWall']) {
            const src = zone({props: [{type, x: 1.5, y: -2.5, rotation: 0.3, blocksMovement: true}]});
            const out = roundTrip(src).props[0];
            expect(out, type).not.toHaveProperty('scale');
        }
    });

    it('scale round-trips through the box for both body shapes', () => {
        // Tree is a circle (visual r 1.4 → a 2.8×2.8-unit box), House a 4×3
        // rect. One multiplier has to serve both, which is why it is not
        // terrain's absolute size.
        const src = zone({props: [
            {type: 'Tree', x: 0, y: 0, rotation: 0, blocksMovement: true, scale: 2.5},
            {type: 'House', x: 4, y: 1, rotation: 0, blocksMovement: true, scale: 0.5},
        ]});
        const model = C.zoneToModel(src);
        // The box really is the scaled physics footprint — what you see is
        // what blocks, at the size it blocks.
        expect(model.layers[1].objects.map((o: {width: number; height: number}) =>
            [o.width, o.height])).toEqual([[840, 840], [240, 180]]);
        expect(roundTrip(src).props.map((p: {scale?: number}) => p.scale)).toEqual([2.5, 0.5]);
    });

    // An explicit 1 means exactly what absent means, so it normalises away —
    // the C6 sentinel call, applied to a value rather than to a member default.
    it('an explicit scale of 1 normalises back to absent', () => {
        const src = zone({props: [{type: 'Tree', x: 0, y: 0, rotation: 0, blocksMovement: true, scale: 1}]});
        expect(roundTrip(src).props[0]).not.toHaveProperty('scale');
    });

    // A prop whose type the palette does not know falls back to a 1×1 box in
    // BOTH directions, so the round-trip is still lossless — the validator is
    // what refuses the save, not a silently mangled scale.
    it('an unknown prop type still round-trips its scale', () => {
        const src = zone({props: [{type: 'Nonesuch', x: 0, y: 0, rotation: 0, blocksMovement: false, scale: 3}]});
        expect(roundTrip(src).props[0].scale).toBe(3);
    });
});

describe('AuraConvert — patrol routes and the remaining arrays', () => {
    it('every polyline vertex is a waypoint, node 0 included, and comes back', () => {
        const s = {
            mob: 'GiantSpider', x: 35.18, y: -32.29, angle: 1.309,
            respawnTicks: 1800, respawnVariancePct: 0.2, wanderRadius: 0, level: 14,
            waypoints: [{x: 31.94, y: -32.03}, {x: 31.3, y: -35}],
            patrolMode: 'loop',
        };
        const model = C.zoneToModel(zone({bounds: {width: 188, height: 144}, spawns: [s]}));
        const o = model.layers[2].objects[0];
        expect(o.shape).toBe('polyline');
        // One vertex per waypoint — no prepended origin. This spawn's route does
        // not start at its own spawn point (5 of the 7 in world.json don't), so
        // vertex 0 is deliberately NOT {0, 0): the origin is where the mob spawns,
        // the vertices are where it walks. Under the old rule node 0 was dropped
        // as "the origin", which cost every route one click and made the node-0
        // handle a no-op.
        expect(o.polygon).toHaveLength(2);
        expect(o.polygon[0]).not.toEqual({x: 0, y: 0});
        expect(roundTrip(zone({bounds: {width: 188, height: 144}, spawns: [s]})).spawns[0])
            .toEqual(s);
    });

    it('a route drawn from the spawn keeps its first waypoint on the spawn', () => {
        // What Tiled produces when you DRAW: node 0 sits at the object origin.
        // It is a real waypoint now, so the mob starts (and in loop mode returns)
        // at home — the shape 2 of the 7 hand-authored routes already have.
        const s = {
            mob: 'Wolf', x: -42.37, y: 26.86, angle: 0,
            waypoints: [{x: -42.37, y: 26.86}, {x: -42.05, y: 21.18}],
        };
        const model = C.zoneToModel(zone({spawns: [s]}));
        const o = model.layers[2].objects[0];
        expect(o.polygon).toHaveLength(2);
        expect(o.polygon[0]).toEqual({x: 0, y: 0});
        expect(roundTrip(zone({spawns: [s]})).spawns[0]).toEqual(s);
    });

    it('patrolMode is omitted unless it is "loop"', () => {
        const base = {mob: 'Wolf', x: 0, y: 0, angle: 0,
            waypoints: [{x: 1, y: 1}, {x: 2, y: 2}]};
        expect(JSON.stringify(roundTrip(zone({spawns: [{...base, patrolMode: 'pingpong'}]}))))
            .not.toContain('patrolMode');
        expect(roundTrip(zone({spawns: [{...base, patrolMode: 'loop'}]})).spawns[0].patrolMode)
            .toBe('loop');
    });

    it('a campfire keeps its id and its startingSpawn flag only when true', () => {
        const out = roundTrip(zone({
            campfires: [
                {id: 'spawnpoint-1', x: -58.2, y: 24, startingSpawn: true},
                {id: 'spawnpoint-2', x: 44, y: 10.5},
            ],
        }));
        expect(out.campfires[0]).toEqual({id: 'spawnpoint-1', x: -58.2, y: 24, startingSpawn: true});
        expect('startingSpawn' in out.campfires[1]).toBe(false);
    });

    it('a dark area survives as a circle', () => {
        const d = {x: -62.4, y: -25.2, radius: 7.2};
        expect(roundTrip(zone({darkAreas: [d]})).darkAreas[0]).toEqual(d);
    });

    // --- regions (plan-region-primitive.md C1) -------------------------------

    it('a region survives as a polygon, vertex for vertex', () => {
        const r = {
            profile: 'swamp',
            points: [{x: -62.4, y: -25.2}, {x: -40, y: -25.2}, {x: -40, y: 3.5}, {x: -62.4, y: 3.5}],
        };
        expect(roundTrip(zone({regions: [r]})).regions[0]).toEqual(r);
    });

    // The origin sits on vertex 0, exactly as Tiled produces when you draw a
    // polygon — so a hand-authored region and a drawn one serialise the same.
    it('anchors the polygon on its first vertex', () => {
        const m = C.zoneToModel(zone({
            regions: [{profile: 'bog', points: [{x: 2, y: 1}, {x: 4, y: 1}, {x: 4, y: 3}]}],
        }));
        const o = m.layers.filter(l => l.name === 'regions')[0].objects[0];
        expect(o.shape).toBe('polygon');
        expect(o.polygon[0]).toEqual({x: 0, y: 0});
        expect(o.polygon.length).toBe(3);
        // Profile is both the label and the typed property (readSpawn's rule).
        expect(o.name).toBe('bog');
        expect(o.properties.profile).toBe('bog');
    });

    // Several regions in one zone keep their authored ORDER: array order is
    // resolution order (D0, last containing region wins), so a converter that
    // reordered them would silently change which profile paints on top.
    it('keeps region order', () => {
        const tri = (n: number) => [{x: n, y: 0}, {x: n + 1, y: 0}, {x: n + 1, y: 1}];
        const out = roundTrip(zone({
            regions: [
                {profile: 'swamp', points: tri(0)},
                {profile: 'bog', points: tri(2)},
                {profile: 'ash', points: tri(4)},
            ],
        }));
        expect(out.regions.map((r: {profile: string}) => r.profile)).toEqual(['swamp', 'bog', 'ash']);
    });

    // --- the typed profile dropdown (C2) ------------------------------------

    // ⚑ The GUI defect this exists for: a PLAIN-STRING property shadows the
    // class member that declares the enum, and the Properties panel degrades
    // from a dropdown to a free-text box. The spawn's mob carries the same
    // marker for the same reason.
    it('marks profile as an AuraProfile enum so the panel keeps the dropdown', () => {
        const m = C.zoneToModel(zone({
            regions: [{profile: 'swamp', points: [{x: 0, y: 0}, {x: 2, y: 0}, {x: 2, y: 2}]}],
        }));
        const o = m.layers.filter(l => l.name === 'regions')[0].objects[0];
        expect(o.enums).toEqual({profile: 'AuraProfile'});
    });

    // ⚑ And the other half of that defect: Tiled hands a typed enum property
    // back as an INDEX into the declared values, never as the string. A reader
    // that took the raw value would write the number 2 into the zone file as a
    // profile name — which zone.go accepts (D8) and the client cannot resolve.
    it('decodes a profile handed back as an enum index', () => {
        const values = (content.ENUM_VALUES as Record<string, string[]>).AuraProfile;
        const wanted = values[values.length - 1];
        const m = C.zoneToModel(zone({
            regions: [{profile: 'swamp', points: [{x: 0, y: 0}, {x: 2, y: 0}, {x: 2, y: 2}]}],
        })) as {layers: {name: string, objects: {properties: Record<string, unknown>}[]}[]};
        m.layers.filter(l => l.name === 'regions')[0].objects[0].properties.profile =
            {typeName: 'AuraProfile', typeId: 1, value: values.indexOf(wanted)};
        expect(C.modelToZone(m).regions[0].profile).toBe(wanted);
    });

    it('empty optional arrays stay omitted', () => {
        const out = JSON.stringify(roundTrip(zone()));
        expect(out).not.toContain('campfires');
        expect(out).not.toContain('darkAreas');
        expect(out).not.toContain('regions');
        expect(out).not.toContain('anchors');
    });
});

describe('AuraConvert — utf8Bytes (the CRLF workaround needs bytes)', () => {
    const enc = new TextEncoder();
    it.each(['plain ascii', 'Wörld', 'ünïcodé — em dash', '🜁 astral'])(
        'encodes %j exactly like TextEncoder', (s) => {
            expect(C.utf8Bytes(s)).toEqual(Array.from(enc.encode(s)));
        });

    it('encodes the whole shipped world.json identically', () => {
        expect(C.utf8Bytes(worldText)).toEqual(Array.from(enc.encode(worldText)));
    });
});

/**
 * C4 — save-time validation.
 *
 * Every rule below is one the server already enforces at boot; the value here
 * is that it fires while the author is still looking at the object, and names
 * that object's Tiled id instead of an array index in a log they never see.
 */
describe('AuraConvert — save-time validation (C4)', () => {
    // Stamp Tiled-style ids on, since zoneToModel builds a model Tiled has not
    // touched yet. Real saves always carry them.
    function modelOf(z: unknown) {
        const m = C.zoneToModel(z) as {layers: {objects: {id: number}[]}[]};
        let id = 100;
        m.layers.forEach(l => l.objects.forEach(o => { o.id = ++id; }));
        return m;
    }
    const errs = (z: unknown): string[] => C.validateModel(modelOf(z));
    const only = (z: unknown): string => {
        const e = errs(z);
        expect(e).toHaveLength(1);
        return e[0];
    };

    // A spawn that is legal in every respect, to vary one field at a time.
    function spawn(over: Record<string, unknown> = {}) {
        return zone({spawns: [{mob: 'Wolf', x: 0, y: 0, angle: 0, ...over}]});
    }

    it('the shipped world.json has nothing to complain about', () => {
        expect(C.validateModel(C.zoneToModel(JSON.parse(worldText)))).toEqual([]);
    });

    // ⭐ The case that opened the chunk.
    it('a prop dropped on the spawns layer says which layer it belongs in', () => {
        const msg = only(zone({spawns: [{mob: 'Tree', x: 0, y: 0, angle: 0}]}));
        expect(msg).toContain('unknown mob "Tree"');
        expect(msg).toContain('belongs in the "props" layer');
    });

    it('a mob dropped on the props layer points back at spawns', () => {
        const msg = only(zone({props: [{type: 'Wolf', x: 0, y: 0, rotation: 0, blocksMovement: true}]}));
        expect(msg).toContain('unknown prop type "Wolf"');
        expect(msg).toContain('belongs in the "spawns" layer');
    });

    it('names the object\'s Tiled id, not its array index', () => {
        const msg = only(zone({spawns: [{mob: 'Nope', x: 0, y: 0, angle: 0}]}));
        expect(msg).toContain('#101');
    });

    // terrain.type is validated on NEITHER side today — the server ignores it
    // and the client dereferences undefined at render time.
    it('catches a terrain type nothing else in the pipeline checks', () => {
        const t = {type: 'Not A Texture', x: 0, y: 0, size: 1, rotation: 0, flipped: 'none'};
        expect(only(zone({terrain: [t]}))).toContain('unknown ground texture');
    });

    it('accepts every terrain type the game actually ships', () => {
        const terrain = (content.TERRAIN_TYPES as string[]).map((type, i) => ({
            type, x: i - 8, y: 0, size: 1, rotation: 0, flipped: 'none',
        }));
        expect(errs(zone({terrain}))).toEqual([]);
    });

    // ⚑ -1, 0 and 0 are NOT used here on purpose: C6 reserved exactly those
    // three values as the inherit sentinels for wanderRadius, idleSpeedFactor
    // and level, so they now read as "absent" rather than as bad input. Nothing
    // is lost — Tiled can no longer put them in the file at all.
    it('rejects a negative wanderRadius but keeps 0, which means stationary', () => {
        expect(only(spawn({wanderRadius: -5}))).toContain('wanderRadius');
        expect(errs(spawn({wanderRadius: 0}))).toEqual([]);
    });

    it('rejects idleSpeedFactor outside (0, 1] and a level below 1', () => {
        expect(only(spawn({idleSpeedFactor: -0.5}))).toContain('idleSpeedFactor');
        expect(only(spawn({idleSpeedFactor: 1.5}))).toContain('idleSpeedFactor');
        expect(errs(spawn({idleSpeedFactor: 1}))).toEqual([]);
        expect(only(spawn({level: -3}))).toContain('level');
        expect(errs(spawn({level: 30}))).toEqual([]);
    });

    it('rejects wanderRadius together with a route', () => {
        const w = [{x: 1, y: 1}, {x: 2, y: 2}];
        expect(only(spawn({wanderRadius: 3, waypoints: w}))).toContain('mutually exclusive');
    });

    it('rejects a one-point route, and explains the polyline has a third point', () => {
        expect(only(spawn({waypoints: [{x: 1, y: 1}]}))).toContain('at least 2 waypoints');
    });

    it('rejects patrolMode without a route', () => {
        expect(only(spawn({patrolMode: 'loop'}))).toContain('patrolMode without waypoints');
    });

    // --- regions (plan-region-primitive.md C1) -------------------------------
    //
    // ⚑ These two are a PAIR, and the second one only became possible when the
    // first arrived: the Tiled glue used to fold a polygon into a polyline
    // because a patrol route was the only vertex shape in the format. Now that
    // regions are polygons, the fold is gone — and a route accidentally drawn
    // as a polygon would lose its waypoints in silence. Both shapes therefore
    // refuse to be each other, loudly, at save time.

    // ⚑ Derived, not a literal: since C2 an unknown profile is a save-time
    // ERROR, so a hand-typed name here would go red the next time somebody
    // renames a profile — and the failure would look like a converter bug.
    const A_REAL_PROFILE = (content.PROFILE_NAMES as string[])[0];

    function region(over: Record<string, unknown> = {}) {
        return zone({
            regions: [{
                profile: A_REAL_PROFILE,
                points: [{x: 0, y: 0}, {x: 2, y: 0}, {x: 2, y: 2}],
                ...over,
            }],
        });
    }

    it('accepts a well-formed region', () => {
        expect(errs(region())).toEqual([]);
    });

    it('rejects a region with an empty profile', () => {
        expect(only(region({profile: ''}))).toContain('profile must not be empty');
    });

    it('rejects a region with fewer than 3 points', () => {
        expect(only(region({points: [{x: 0, y: 0}, {x: 2, y: 0}]})))
            .toContain('at least 3 points');
    });

    // ⭐ C2 inverts C1's posture here, deliberately: while the palette was free
    // text there was no vocabulary to check a name against, so an unknown one
    // could only be absorbed by the client (D11 — it costs that region's look
    // and nothing else). The generated AuraProfile enum IS that vocabulary, so
    // the typo is now caught where it was written, with the object id.
    it('rejects an unknown profile name, now that the palette carries the vocabulary', () => {
        const msg = only(region({profile: 'no-such-profile'}));
        expect(msg).toContain('unknown profile "no-such-profile"');
        expect(msg).toContain('profiles.json');
    });

    // The dropdown the generator emits, exercised end to end: every name it
    // offers must pass the check that reads its output back. Derived from the
    // content, never a second list — the terrain-type test's posture above.
    it('accepts every profile the palette actually offers', () => {
        const names = content.PROFILE_NAMES as string[];
        expect(names.length).toBeGreaterThan(0);
        names.forEach(profile => expect(errs(region({profile})), profile).toEqual([]));
    });

    // The AuraProfile default, mirroring AuraMobName's: a class member cannot
    // be empty, so a freshly drawn region would otherwise silently become
    // whichever profile happens to sort first.
    it('refuses to save a region nobody assigned a profile to', () => {
        expect(only(region({profile: C.PROFILE_UNSET as string}))).toContain('pick a profile');
    });

    // ⚑ Two different mistakes with two different fixes: "you left it unset"
    // must never be reported as "unknown profile", and neither as "empty".
    it('an unknown profile is not reported as an empty one', () => {
        expect(only(region({profile: 'no-such-profile'}))).not.toContain('must not be empty');
    });

    it('refuses a patrol route drawn as a closed polygon instead of dropping its waypoints', () => {
        const m = C.zoneToModel(spawn({waypoints: [{x: 1, y: 1}, {x: 2, y: 2}]})) as
            {layers: {name: string, objects: {id: number, shape: string}[]}[]};
        let id = 100;
        m.layers.forEach(l => l.objects.forEach(o => { o.id = ++id; }));
        // What Tiled hands back when someone drew the route with the polygon tool.
        m.layers.filter(l => l.name === 'spawns')[0].objects[0].shape = 'polygon';

        const e = C.validateModel(m) as string[];
        expect(e).toHaveLength(1);
        expect(e[0]).toContain('must be a POLYLINE');
    });

    // zone.go makes this check in resolve(), after the species is bound — which
    // is why the generated content carries speeds at all.
    it('rejects a speed-0 species set to wander', () => {
        expect(content.MOB_SPEED.TownCrier).toBe(0);
        const msg = only(zone({spawns: [{mob: 'TownCrier', x: 0, y: 0, angle: 0, wanderRadius: 5}]}));
        expect(msg).toContain('cannot wander or patrol');
    });

    it('rejects campfires with no starting spawn, an empty id, or a duplicate id', () => {
        const fire = (id: string, startingSpawn?: boolean) => ({id, x: 0, y: 0, startingSpawn});
        expect(only(zone({campfires: [fire('a')]}))).toContain('startingSpawn');
        expect(errs(zone({campfires: [fire('a', true)]}))).toEqual([]);
        expect(errs(zone({campfires: [fire('a', true), fire('a')]})).join(' '))
            .toContain('duplicate spawn point id');
        expect(errs(zone({campfires: [fire('', true)]})).join(' ')).toContain('must not be empty');
    });

    it('rejects a duplicate anchor name and one placed outside the bounds', () => {
        const at = (name: string, x: number) => ({name, x, y: 0});
        expect(errs(zone({anchors: [at('a', 0), at('a', 1)]})).join(' ')).toContain('duplicate anchor');
        expect(only(zone({anchors: [at('far', 100)]}))).toContain('outside the bounds');
    });

    // world.json carries ONE radius, so the writer reads the width and would
    // silently drop a stretched height.
    it('rejects a dark area dragged out of round', () => {
        const m = modelOf(zone({darkAreas: [{x: 0, y: 0, radius: 2}]}));
        expect(C.validateModel(m)).toEqual([]);
        const ellipse = (m as unknown as {layers: {name: string; objects: {height: number}[]}[]})
            .layers.filter(l => l.name === 'darkAreas')[0].objects[0];
        ellipse.height = 100;
        expect(C.validateModel(m).join(' ')).toContain('must stay a circle');
    });

    // plan-prop-scale.md C1. Scale is authored by RESIZING, so an out-of-range
    // scale is an out-of-range box — refused while the author is still looking
    // at the object, rather than at boot hours later.
    it('rejects a prop resized past the scale rail', () => {
        const m = modelOf(zone({props: [{type: 'Tree', x: 0, y: 0, rotation: 0, blocksMovement: true}]}));
        expect(C.validateModel(m)).toEqual([]);
        const o = (m as unknown as {layers: {name: string; objects: {width: number; height: number}[]}[]})
            .layers.filter(l => l.name === 'props')[0].objects[0];
        // Tree's visual body is r 1.4 → a 2.8-unit (336 px) box. 11× is past
        // the rail of 10.
        o.width = 336 * 11; o.height = 336 * 11;
        const msg = C.validateModel(m).join(' ');
        expect(msg).toContain('scale 11 must be in (0, 10]');
    });

    // world.json carries ONE uniform multiplier, so a box dragged out of
    // proportion would silently lose an axis — the dark-area call again.
    it('rejects a prop dragged out of proportion', () => {
        const m = modelOf(zone({props: [{type: 'House', x: 0, y: 0, rotation: 0, blocksMovement: true}]}));
        expect(C.validateModel(m)).toEqual([]);
        const o = (m as unknown as {layers: {name: string; objects: {width: number; height: number}[]}[]})
            .layers.filter(l => l.name === 'props')[0].objects[0];
        o.width = 960;   // 2× on x only; height stays at 3 units
        const msg = C.validateModel(m).join(' ');
        expect(msg).toContain('must keep its proportions');
        expect(msg).toContain('hold Shift');
    });

    it('accepts a uniformly scaled prop', () => {
        expect(errs(zone({props: [
            {type: 'House', x: 0, y: 0, rotation: 0, blocksMovement: true, scale: 2},
            {type: 'Tree', x: 4, y: 0, rotation: 0, blocksMovement: true, scale: 10},
            {type: 'Rock', x: -4, y: 0, rotation: 0, blocksMovement: true, scale: 0.25},
        ]}))).toEqual([]);
    });

    // The scale checks divide by the type's footprint, so an unresolvable name
    // must not also produce a nonsense multiplier on top of its real complaint.
    it('an unknown prop type reports only that, not a bogus scale', () => {
        const e = errs(zone({props: [{type: 'Nonesuch', x: 0, y: 0, rotation: 0, blocksMovement: true}]}));
        expect(e).toHaveLength(1);
        expect(e[0]).toContain('unknown prop type');
    });

    it('rejects an empty zone name and non-positive bounds', () => {
        expect(errs(zone({name: '  '})).join(' ')).toContain('zone name');
        expect(errs(zone({bounds: {width: 0, height: 10}})).join(' ')).toContain('bounds must be positive');
    });

    it('caps the refusal message so its first line stays visible', () => {
        const spawns = Array.from({length: 40}, (_, i) => ({mob: 'Nope', x: i - 20, y: 0, angle: 0}));
        const e = errs(zone({spawns}));
        expect(e).toHaveLength(40);
        const text = C.formatErrors(e) as string;
        expect(text).toContain('40 problem(s)');
        expect(text).toContain('… and 28 more.');
        expect(text.split('\n').filter(l => l.indexOf('spawns #') === 0)).toHaveLength(12);
    });
});

/**
 * C5 — the completeness pin.
 *
 * ⭐ Three whitelists have to agree about what keys a zone file carries:
 * backend/pkg/aura/world/zone.go (authoritative), ZoneModel.getZoneAsJSON, and
 * aura-convert.js's serializeZone. Only the first is enforced by anything —
 * DisallowUnknownFields hard-fails a boot on a key the server does not know.
 * The reverse direction has no guard at all: a key a WRITER has never heard of
 * is silently dropped on that editor's first save, and D6's byte-stability test
 * only notices once the field is actually authored somewhere. This closes that
 * window.
 *
 * ⭐ C2 of plan-region-primitive.md extended it to the SECOND writer. The pin
 * shipped guarding Tiled only, which left the worse half open: the in-game
 * editor has eaten an unlisted field twice already (spawn.level, prop.scale)
 * and each time the loss was silent, green and somebody else's work. The two
 * writers land in the same file, so anything short of all three agreeing is a
 * data-loss bug waiting for the next save.
 */
describe('AuraConvert — the format completeness pin (C5)', () => {
    const zoneGo = readFileSync(
        nodeRequire.resolve('../../../../../backend/pkg/aura/world/zone.go'), 'utf8');

    // Keys zone.go accepts that Tiled deliberately does not author. Each one is
    // a decision, not an oversight — anything not listed here must round-trip.
    const NOT_AUTHORED_IN_TILED: Record<string, string> = {
        // Retired-content zone tag (zone.go:175). No shipped zone authors it,
        // and the in-game editor's getZoneAsJSON drops it too — this is a
        // pre-existing repo property, written down here for the first time.
        legacy: 'retired-content tag; ZoneModel.getZoneAsJSON drops it as well',
    };

    function goJsonKeys(): Set<string> {
        const keys = new Set<string>();
        const re = /`json:"([^",]+)/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(zoneGo)) !== null) {
            if (m[1] !== '-') { keys.add(m[1]); }   // json:"-" is never serialized
        }
        return keys;
    }

    // ⚑ ONE fixture for both writers. Two would drift, and a key exercised
    // against only one of them is exactly the hole this pin exists to close.
    const EVERY_KEY = {
        name: 'T',
        bounds: {width: 20, height: 10},
        terrain: [{type: 'Green Grass 1', x: 0, y: 0, size: 1, rotation: 0.5, flipped: 'horizontal'}],
        props: [{type: 'Tree', x: 1, y: 1, rotation: 0.25, blocksMovement: true, scale: 2.5}],
        spawns: [{
            mob: 'Wolf', x: 2, y: 2, angle: 0.75,
            respawnTicks: 300, respawnVariancePct: 10,
            idleSpeedFactor: 0.5, level: 7,
            waypoints: [{x: 3, y: 3}, {x: 4, y: 4}], patrolMode: 'loop',
        }, {
            // wanderRadius is mutually exclusive with waypoints, so it needs
            // a spawn of its own to appear at all.
            mob: 'Wolf', x: 5, y: 5, angle: 0, wanderRadius: 4,
        }],
        campfires: [{id: 'spawnpoint-1', x: 6, y: 6, startingSpawn: true}],
        darkAreas: [{x: 7, y: 7, radius: 2}],
        regions: [{profile: 'swamp', points: [{x: 1, y: 1}, {x: 3, y: 1}, {x: 3, y: 2}]}],
        anchors: [{name: 'a', x: 8, y: 8}],
    };

    // Every key present anywhere in a serialized zone, at any depth.
    function keysIn(json: string): Set<string> {
        const keys = new Set<string>();
        (function walk(v: unknown) {
            if (Array.isArray(v)) { v.forEach(walk); return; }
            if (v && typeof v === 'object') {
                Object.keys(v as object).forEach(k => {
                    keys.add(k);
                    walk((v as Record<string, unknown>)[k]);
                });
            }
        })(JSON.parse(json));
        return keys;
    }

    // Derived from BEHAVIOUR, not a second hand-written list: a fourth list
    // would be exactly the thing this pin exists to prevent.
    //
    // ⚑ The full path, not just the serializer: this also catches a key that
    // survives serialization but is lost in the Tiled model.
    function keysConverterEmits(): Set<string> {
        return keysIn(C.serializeZone(C.modelToZone(C.zoneToModel(EVERY_KEY))));
    }

    // The same fixture through the OTHER writer, by the same rule: what
    // ZoneModel emits, not what a list claims it emits.
    function keysZoneModelEmits(): Set<string> {
        return keysIn(ZoneModel.fromJSON(EVERY_KEY as unknown as ZoneData).getZoneAsJSON());
    }

    // Guards the scrape itself: a refactor that moves the structs out of
    // zone.go must go red here, not quietly green with an empty key set.
    it('finds the schema where it expects it', () => {
        const keys = goJsonKeys();
        expect(keys.size).toBeGreaterThan(20);
        ['name', 'bounds', 'terrain', 'props', 'spawns', 'waypoints', 'patrolMode']
            .forEach(k => expect(keys).toContain(k));
    });

    it('the fixture really does exercise every key it can', () => {
        // If this drops, the pins below start passing for the wrong reason.
        const expected = goJsonKeys().size - Object.keys(NOT_AUTHORED_IN_TILED).length;
        expect(keysConverterEmits().size).toBe(expected);
        expect(keysZoneModelEmits().size).toBe(expected);
    });

    it('⭐ every key zone.go accepts survives a Tiled round-trip', () => {
        const emitted = keysConverterEmits();
        const missing = [...goJsonKeys()]
            .filter(k => !emitted.has(k) && !(k in NOT_AUTHORED_IN_TILED));
        expect(missing, `zone.go declares ${missing.join(', ')}, which Tiled would SILENTLY DROP`
            + ' on the next save. Add it to serializeZone/zoneToModel/modelToZone in'
            + ' tools/tiled/extensions/aura-zone/aura-convert.js — and to'
            + ' ZoneModel.getZoneAsJSON, or the two editors stop agreeing. If the key is'
            + ' deliberately not authorable in Tiled, add it to NOT_AUTHORED_IN_TILED with'
            + ' its reason.').toEqual([]);
    });

    // ⭐ The half the pin was missing until C2, and the worse half: this editor
    // has silently eaten an unlisted field twice (spawn.level, prop.scale), and
    // both times what it deleted was work done in the OTHER editor.
    it('⭐ every key zone.go accepts survives an in-game editor save', () => {
        const emitted = keysZoneModelEmits();
        const missing = [...goJsonKeys()]
            .filter(k => !emitted.has(k) && !(k in NOT_AUTHORED_IN_TILED));
        expect(missing, `zone.go declares ${missing.join(', ')}, which ZoneModel.getZoneAsJSON`
            + ' would SILENTLY DROP on the next in-game editor save — deleting whatever Tiled or'
            + ' a placement script wrote there. Name it in getZoneAsJSON (and keep fromJSON'
            + ' carrying it), even if this editor has no tool for it: round-tripping a field it'
            + ' cannot author is the whole job.').toEqual([]);
    });

    // ⚑ Both writers land in the same file, so agreeing with zone.go is not
    // enough on its own — they must agree with EACH OTHER, or a Tiled save and
    // an in-game save produce two different files from one world.
    it('⭐ the two writers emit the same key set', () => {
        expect([...keysZoneModelEmits()].sort()).toEqual([...keysConverterEmits()].sort());
    });

    it('emits nothing zone.go would reject — DisallowUnknownFields is unforgiving', () => {
        const known = goJsonKeys();
        [['Tiled', keysConverterEmits()], ['the in-game editor', keysZoneModelEmits()]]
            .forEach(([who, emitted]) => {
                const extra = [...emitted as Set<string>].filter(k => !known.has(k));
                expect(extra, `${who} emits ${extra.join(', ')}, which would hard-fail the boot`)
                    .toEqual([]);
            });
    });

    it('records why each exception is an exception', () => {
        Object.keys(NOT_AUTHORED_IN_TILED).forEach(k => {
            expect(goJsonKeys(), `${k} is no longer in zone.go — drop the exception`).toContain(k);
            expect(NOT_AUTHORED_IN_TILED[k].length).toBeGreaterThan(10);
            // The exceptions are shared, so each must really be absent from
            // BOTH writers — an exception that only one of them honours would
            // hide a real gap in the other.
            expect(keysConverterEmits().has(k)).toBe(false);
            expect(keysZoneModelEmits().has(k)).toBe(false);
        });
    });
});

/**
 * C6 — dropdowns and typed spawn fields.
 *
 * ⚑ The riskiest chunk in the plan: a wrong sentinel silently rewrites the ~226
 * spawns that inherit their species values. The byte-identical round-trip above
 * is the acceptance test; these cases pin each row of the table individually so
 * a failure says WHICH one.
 */
describe('AuraConvert — inherit sentinels and the typed spawn form (C6)', () => {
    const types = nodeRequire('../../../../../tools/tiled/palette/propertytypes.json')
        .propertyTypes as {name: string; type: string; values?: string[];
            members?: {name: string; value: unknown; propertyType?: string}[]}[];
    const byName = (n: string) => types.filter(t => t.name === n)[0];

    function spawnObj(z: unknown, i = 0) {
        const m = C.zoneToModel(z) as {layers: {name: string; objects: Record<string, never>[]}[]};
        return m.layers.filter(l => l.name === 'spawns')[0].objects[i] as unknown as
            {name: string; properties: Record<string, unknown>; enums: Record<string, string>};
    }
    const oneSpawn = (over: Record<string, unknown> = {}) =>
        zone({spawns: [{mob: 'Wolf', x: 0, y: 0, angle: 0, ...over}]});
    const backOut = (z: unknown) => roundTrip(z).spawns[0] as Record<string, unknown>;

    it('⭐ the generated class defaults ARE the converter\'s sentinels', () => {
        const members = byName('AuraSpawnCombat').members ?? [];
        const value = (n: string) => members.filter(m => m.name === n)[0]?.value;
        Object.keys(C.SPAWN_INHERIT as Record<string, number>).forEach(k => {
            expect(value(k), `class default for ${k} must equal the inherit sentinel`)
                .toBe((C.SPAWN_INHERIT as Record<string, number>)[k]);
        });
        expect(value('patrolMode')).toBe(C.PATROL_INHERIT);
        expect(value('mob')).toBe(C.MOB_UNSET);
    });

    it('gives every spawn kind the same form', () => {
        const names = ['AuraSpawnCombat', 'AuraSpawnTalker', 'AuraSpawnFixture', 'AuraSpawnCompanion'];
        const shape = JSON.stringify(byName('AuraSpawnCombat').members);
        names.forEach(n => expect(JSON.stringify(byName(n).members), n).toBe(shape));
    });

    // ⚑ The reason AuraProp stays memberless: blocksMovement is a bool with no
    // spare value, so it has no sentinel — a default would risk flipping props.
    it('gives the OTHER classes no members, deliberately', () => {
        ['AuraProp', 'AuraTerrain', 'AuraCampfire', 'AuraDarkArea', 'AuraAnchor']
            .forEach(n => expect(byName(n).members ?? [], n).toEqual([]));
    });

    it('offers every mob in the dropdown, with the unset default first', () => {
        const values = byName('AuraMobName').values ?? [];
        expect(values[0]).toBe(C.MOB_UNSET);
        expect(values.length).toBe(Object.keys(content.MOB_KIND).length + 1);
        expect(values).toContain('TownCrier');
    });

    /**
     * ⭐ Only the AUTHORED knobs are set on the object; the rest are left to the
     * class, which is what makes them render as typed, inherited defaults. An
     * object-level property SHADOWS the member that gives it its type — that is
     * the GUI bug this replaced: the mob dropdown appeared only after resetting
     * the field, i.e. only once the shadow was gone.
     */
    it('overrides only what the file actually authored', () => {
        expect(Object.keys(spawnObj(oneSpawn()).properties)).toEqual(['mob']);
        const authored = spawnObj(oneSpawn({wanderRadius: 4, level: 9})).properties;
        expect(Object.keys(authored).sort()).toEqual(['level', 'mob', 'wanderRadius']);
        expect(authored.wanderRadius).toBe(4);
    });

    it('marks the enum-typed properties so Tiled can set them as typed values', () => {
        expect(spawnObj(oneSpawn()).enums).toEqual({mob: 'AuraMobName'});
        expect(spawnObj(oneSpawn({waypoints: [{x: 1, y: 1}, {x: 2, y: 2}], patrolMode: 'loop'}))
            .enums).toEqual({mob: 'AuraMobName', patrolMode: 'AuraPatrolMode'});
    });

    /**
     * ⚑ Tiled hands a typed enum property back as an INDEX into the type's
     * values array, never as the string. Decoding it needs the exact list the
     * palette declared, which is why the generator publishes ENUM_VALUES.
     */
    it('decodes a typed enum value back to its string', () => {
        const values = content.ENUM_VALUES.AuraMobName as string[];
        const at = (n: string) => values.indexOf(n);
        const typed = (t: string, i: number) => ({value: i, typeId: 0, typeName: t});
        expect(C.readSpawn({name: '', properties: {mob: typed('AuraMobName', at('Bear'))}}).mob)
            .toBe('Bear');
        expect(C.readSpawn({name: '', properties: {patrolMode: typed('AuraPatrolMode', 1)}}).patrolMode)
            .toBe('loop');
        // index 0 is the pingpong sentinel, so it must resolve to "inherit"
        expect(C.readSpawn({name: '', properties: {patrolMode: typed('AuraPatrolMode', 0)}}).patrolMode)
            .toBeUndefined();
        // a plain string still works — that is the no-project fallback path
        expect(C.readSpawn({name: '', properties: {mob: 'Bear'}}).mob).toBe('Bear');
    });

    it('refuses to guess when an enum index cannot be decoded', () => {
        const bogus = {value: 9999, typeId: 3, typeName: 'AuraMobName'};
        expect(C.plainValue(bogus)).toContain('unknown AuraMobName');
    });

    it('⭐ round-trips each sentinel row: authored survives, inherited stays absent', () => {
        const rows: [string, unknown][] = [
            ['wanderRadius', 6], ['idleSpeedFactor', 0.4], ['level', 12],
            ['respawnTicks', 900], ['respawnVariancePct', 15],
        ];
        rows.forEach(([key, authored]) => {
            expect(backOut(oneSpawn({[key]: authored})), key).toHaveProperty(key, authored);
            expect(Object.keys(backOut(oneSpawn())), `${key} must stay absent`).not.toContain(key);
        });
    });

    // The one row where the obvious sentinel would have been wrong.
    it('keeps an explicit wanderRadius of 0 distinct from inheriting', () => {
        expect(spawnObj(oneSpawn({wanderRadius: 0})).properties.wanderRadius).toBe(0);
        expect(backOut(oneSpawn({wanderRadius: 0}))).toHaveProperty('wanderRadius', 0);
    });

    // Talkers are the only spawns with no respawn keys, so this row exists for them.
    it('keeps a talker free of respawn keys through the typed form', () => {
        const out = backOut(zone({spawns: [{mob: 'TownCrier', x: 0, y: 0, angle: 0}]}));
        expect(Object.keys(out)).toEqual(['mob', 'x', 'y', 'angle']);
    });

    /**
     * ⭐ The property that makes the design safe whichever way Tiled behaves.
     * If Tiled stores a property that merely EQUALS its class default, we read
     * the sentinel; if Tiled omits it instead, we read nothing. Both must land
     * on "inherit" — otherwise the answer depends on Tiled internals we cannot
     * test headlessly.
     */
    it('reads an omitted property and its sentinel identically', () => {
        const withSentinels = spawnObj(oneSpawn());
        const stripped = {...withSentinels, properties: {mob: 'Wolf'}};
        expect(C.readSpawn(stripped)).toEqual(C.readSpawn(withSentinels));
    });

    it('takes identity from the typed property, falling back to the Name', () => {
        const o = spawnObj(oneSpawn());
        expect(C.readSpawn({...o, properties: {...o.properties, mob: 'Bear'}}).mob).toBe('Bear');
        expect(C.readSpawn({name: 'Bear', properties: {}}).mob).toBe('Bear');
    });

    /**
     * ⭐ A freshly drawn object has no name, no class and no properties, so the
     * form never appeared and the old message was `unknown mob ""`. These three
     * are the only place the tool can teach the workflow, so they carry the
     * setup step rather than a diagnosis.
     */
    it('tells you how to set up an object drawn from scratch', () => {
        const at = (layer: string, shape: string, w = 0) => {
            const m = C.zoneToModel(zone()) as {layers: {name: string; objects: unknown[]}[]};
            m.layers.filter(l => l.name === layer)[0].objects.push({
                shape, layer, id: 42, name: '', x: 1200, y: 600,
                width: w, height: w, rotation: 0, properties: {},
            });
            return (C.validateModel(m) as string[])[0];
        };
        expect(at('spawns', 'point')).toContain('Set its Class');
        expect(at('spawns', 'point')).toContain('AuraSpawnCombat');
        expect(at('props', 'rect', 120)).toContain('aura-props tileset');
        expect(at('terrain', 'rect', 120)).toContain('aura-terrain tileset');
    });

    it('refuses a spawn nobody has assigned a mob to', () => {
        const o = spawnObj(oneSpawn());
        o.properties.mob = C.MOB_UNSET;
        const m = C.zoneToModel(oneSpawn()) as {layers: {name: string; objects: unknown[]}[]};
        m.layers.filter(l => l.name === 'spawns')[0].objects[0] = o;
        const errors = C.validateModel(m) as string[];
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('no mob chosen yet');
    });

    // The failure this chunk could most easily cause: range checks reading the
    // sentinels raw would flag every inheriting spawn in the file.
    it('does not mistake its own sentinels for bad values', () => {
        expect(C.validateModel(C.zoneToModel(oneSpawn()))).toEqual([]);
        expect(C.validateModel(C.zoneToModel(JSON.parse(worldText)))).toEqual([]);
    });
});
