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
import {readdirSync, readFileSync} from 'node:fs';
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
    //
    // ⭐ A LAYER IS NOT ALWAYS ONE ARRAY, and this is the only structural fact
    // this test has to state rather than derive. Two layers carry two classes
    // each: `paths` holds AuraPath + AuraPolygon (zone-polygons D5) and, since
    // A4, `atmospheres` holds AuraAtmosphere + AuraClearing.
    //
    // ⛔ THE PATHS ROW WAS ALREADY WRONG AND NOBODY KNEW, which is the durable
    // point. This test has asserted layer-count == same-named-array-count since
    // before D5 shipped, and it kept passing only because no zone authors a
    // polygon yet — authoring one would have reddened it with nothing broken.
    // A4 made the same latent defect fire at once, because world.json DOES
    // author a clearing. The bug was found by content, not by the suite.
    const SHARED_LAYERS: Record<string, string[]> = {
        paths: ['polygons', 'paths'],
        atmospheres: ['atmospheres', 'clearings'],
    };

    it('maps every array onto its own layer, losing nothing', () => {
        const src = JSON.parse(worldText);
        const model = C.zoneToModel(src);
        const counts: Record<string, number> = {};
        model.layers.forEach((l: {name: string; objects: unknown[]}) => {
            counts[l.name] = l.objects.length;
        });
        const expected: Record<string, number> = {};
        C.LAYERS.forEach((name: string) => {
            expected[name] = (SHARED_LAYERS[name] || [name])
                .reduce((n, array) => n + (src[array] || []).length, 0);
        });
        expect(counts).toEqual(expected);
    });

    // ⚑ The guard on the map above: a layer that stops being shared, or an array
    // that moves off one, would make the sum silently wrong in the other
    // direction and this test would go back to passing for the wrong reason.
    it('every array named in SHARED_LAYERS is real, and includes the layer itself', () => {
        const src = JSON.parse(worldText);
        Object.keys(SHARED_LAYERS).forEach((layerName) => {
            const arrays = SHARED_LAYERS[layerName];
            expect(C.LAYERS).toContain(layerName);
            arrays.forEach(a => {
                expect(src[a] === undefined || Array.isArray(src[a])).toBe(true);
            });
            // The layer's own name must be one of the arrays it carries, or the
            // reduce above would be counting a layer that has no array at all.
            expect(arrays).toContain(layerName);
        });
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

    /* ---- a prop's blocksMovement, the newest tri-state ---------------------
     * ⭐ THE DEFAULT IS THE SERVER'S TO APPLY, not this file's. Absent means
     * "ask api/props/<type>.json", so the one thing these legs must prove is
     * that absent STAYS absent through a full round-trip — a converter that
     * helpfully filled in a bool would freeze today's answer into the zone and
     * re-typing the prop would stop moving its placements.
     */
    const propZone = (over: Record<string, unknown> = {}) =>
        zone({props: [{type: 'Tree', x: 0, y: 0, rotation: 0, ...over}]});

    it('⭐ an inheriting prop keeps NO blocksMovement key at all', () => {
        const out = roundTrip(propZone());
        expect('blocksMovement' in out.props[0]).toBe(false);
        expect(JSON.stringify(out)).not.toContain('blocksMovement');
    });

    it('an explicit blocking prop survives as true', () => {
        const out = roundTrip(propZone({blocksMovement: true}));
        expect(out.props[0].blocksMovement).toBe(true);
    });

    it('an explicit walk-through prop survives as false — it is an OVERRIDE', () => {
        const out = roundTrip(propZone({blocksMovement: false}));
        expect(out.props[0].blocksMovement).toBe(false);
        expect('blocksMovement' in out.props[0]).toBe(true);
    });

    /* ⛔ THE SHADOWING RULE, and it is invisible from the file it protects: an
     * object-level property SHADOWS the class member that declares its enum, and
     * the Properties panel then degrades from a dropdown to a free-text box. So
     * an inheriting prop must reach Tiled carrying NOTHING, and the member is
     * what shows '(inherit)'. Measured in the GUI during C6; the same trap the
     * spawn sentinels exist to avoid. */
    it('⛔ zoneToModel sets no property on an inheriting prop, so the dropdown survives', () => {
        const m = C.zoneToModel(propZone()) as {layers: {name: string; objects:
            {properties: Record<string, unknown>; enums: Record<string, string>}[]}[]};
        const o = m.layers.filter(l => l.name === 'props')[0].objects[0];
        expect('blocksMovement' in o.properties).toBe(false);
        // …but the enum is still declared, so a value SET later is written typed.
        expect(o.enums.blocksMovement).toBe(C.PROP_BLOCKS_ENUM);
    });

    it('an authored prop reaches Tiled as the enum STRING, not a bool', () => {
        const m = C.zoneToModel(propZone({blocksMovement: false})) as {layers:
            {name: string; objects: {properties: Record<string, unknown>}[]}[]};
        const o = m.layers.filter(l => l.name === 'props')[0].objects[0];
        expect(o.properties.blocksMovement).toBe(C.PROP_WALK_THROUGH);
    });

    /* ⚑ A Tiled that never loaded the project degrades a typed value to whatever
     * the writer put there (tiled.propertyValue throws on an unregistered type,
     * measured during the atmosphere split). A zone opened that way must still
     * round-trip, which is why readPropBlocks accepts a raw bool. */
    it('a raw boolean property still reads, for a project-less Tiled', () => {
        const m = C.zoneToModel(propZone()) as {layers: {name: string; objects:
            {properties: Record<string, unknown>}[]}[]};
        const o = m.layers.filter(l => l.name === 'props')[0].objects[0];
        o.properties.blocksMovement = false;
        expect((C.modelToZone(m) as {props: {blocksMovement: unknown}[]})
            .props[0].blocksMovement).toBe(false);
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

/* ---- the generated object templates ---------------------------------------
 * ⭐ WHY THEY EXIST: Tiled inserts a tile object at the tile IMAGE's natural
 * pixel size, and the box IS the scale (plan-prop-scale.md C1). roundTree.png
 * is 512² against a 336 px body, so every tree ever DRAGGED out of the palette
 * authored `"scale": 1.524` — silently, on every placement. House, Bridge and
 * Tombstone were worse off: their image aspect is not their body aspect, so the
 * proportions check REFUSED the save and they could not be dragged in at all.
 *
 * ⛔ verify.sh cannot cover this. It drives headless --export-map, which has no
 * way to perform a drag, and a template is insert-time only — by the time a map
 * is on disk the objects are ordinary tile objects. So the pin is STATIC (the
 * boxes are right, the gids point where they claim) and the drag itself is a
 * human check in verify.sh's footer, the same posture the enum dropdown takes.
 */
describe('AuraConvert — the generated object templates', () => {
    const dir = nodeRequire.resolve('../../../../../tools/tiled/palette/content.json')
        .replace(/content\.json$/, 'templates');

    function templates(kind: 'props' | 'terrain') {
        return readdirSync(dir + '/' + kind).map(f => {
            const text = readFileSync(dir + '/' + kind + '/' + f, 'utf8');
            const obj = /<object name="([^"]*)" class="([^"]*)" gid="(\d+)" width="([\d.]+)" height="([\d.]+)"\/>/
                .exec(text);
            const set = /<tileset firstgid="1" source="[^"]*\/([^"/]+)"\/>/.exec(text);
            expect(obj, `${kind}/${f} has no parsable object`).toBeTruthy();
            expect(set, `${kind}/${f} has no parsable tileset`).toBeTruthy();
            return {
                file: f, tsx: set![1], name: obj![1], cls: obj![2],
                gid: +obj![3], w: +obj![4], h: +obj![5],
            };
        });
    }

    // type -> tile id, straight out of the tsx the template points at. The
    // template's gid is firstgid(1) + that id, and nothing else guarantees the
    // two orderings stay together.
    function tileIds(tsx: string) {
        const text = readFileSync(dir.replace(/templates$/, '') + tsx, 'utf8');
        const out: Record<string, number> = {};
        const re = /<tile id="(\d+)"[^>]*>\s*<properties>\s*<property name="auraType" value="([^"]*)"/g;
        let m;
        while ((m = re.exec(text))) { out[m[2]] = +m[1]; }
        return out;
    }

    // Through the real derivation, never a reimplementation of it: drop the
    // template's box onto a placement and ask the serializer what it authors.
    function authored(kind: 'props' | 'terrain', name: string, w: number, h: number) {
        const z = kind === 'props'
            ? zone({props: [{type: name, x: 0, y: 0, rotation: 0, blocksMovement: false}]})
            : zone({terrain: [{type: name, x: 0, y: 0, size: 1, rotation: 0, flipped: 'none'}]});
        const model = C.zoneToModel(z) as {layers: {name: string;
            objects: {width: number; height: number}[]}[]};
        const o = model.layers.filter(l => l.name === kind)[0].objects[0];
        o.width = w;
        o.height = h;
        return JSON.parse(C.serializeZone(C.modelToZone(model)));
    }

    it('there is exactly one template per prop and per texture', () => {
        expect(templates('props').map(t => t.name).sort())
            .toEqual(Object.keys(content.PROP_SIZE).sort());
        expect(templates('terrain').map(t => t.name).sort())
            .toEqual([...content.TERRAIN_TYPES].sort());
    });

    it('each gid points at the tile its own tileset holds for that name', () => {
        (['props', 'terrain'] as const).forEach(kind => {
            templates(kind).forEach(t => {
                const ids = tileIds(t.tsx);
                expect(t.gid, `${kind}/${t.file} gid`).toBe(ids[t.name] + 1);
            });
        });
    });

    // ⭐ THE POINT OF THE WHOLE THING: a dragged prop authors no `scale` key.
    it('a prop dropped from its template authors NO scale', () => {
        templates('props').forEach(t => {
            const sz = content.PROP_SIZE[t.name];
            expect({w: t.w, h: t.h}, `${t.file} box`)
                .toEqual({w: +(sz.w * C.PX).toFixed(4), h: +(sz.h * C.PX).toFixed(4)});
            expect(authored('props', t.name, t.w, t.h).props[0].scale,
                `${t.file} must inherit its type body`).toBeUndefined();
        });
    });

    /* ⚑ Terrain has no type body to be right about — the box IS the size — so
     * a dragged patch used to inherit its IMAGE's size: 0.42 for the twelve
     * 100² SVG textures against 1.07 for the two 256² PNGs, a 2.56× split with
     * nothing behind it. One canonical box is the fix, and the NUMBER is a
     * [PLACEHOLDER] look call, so this pins the invariants rather than the
     * value: every texture starts the same, and it serializes clean. */
    it('every texture template shares one box, and it round-trips clean', () => {
        const all = templates('terrain');
        const [first] = all;
        all.forEach(t => expect({w: t.w, h: t.h}, `${t.file} box`)
            .toEqual({w: first.w, h: first.h}));
        expect(first.w).toBe(first.h);
        const size = authored('terrain', first.name, first.w, first.h).terrain[0].size;
        expect(size).toBeGreaterThan(0);
        expect(size, 'a box that serializes to float dust is a box nobody can retype')
            .toBe(Math.round(size * 100) / 100);
        // ⭐ ONE number, two consumers. The templates are cut at it and the "fit
        // to true size" action resizes to it, so the generator publishes it
        // through content.json instead of each side declaring its own. Two
        // copies would drift the day the look call is made, and the symptom
        // would be a patch that changes size when you fix it.
        expect(size, 'the templates and content.TERRAIN_SIZE must be the same number')
            .toBe(content.TERRAIN_SIZE);
        expect(C.terrainSize()).toBe(content.TERRAIN_SIZE);
    });

    /* ⛔ The fit action's lookup must NOT be propSize()'s. That helper answers
     * {w:1,h:1} for an unknown name, which is right for a CONVERSION — the
     * geometry still round-trips — and catastrophic for a RESIZE, where it
     * would squash an unrecognised prop to a 120 px box that looks deliberate.
     * So the raw table is exported and the action refuses instead. */
    it('exposes the raw tables the fit action refuses on, not a fallback', () => {
        expect(Object.keys(C.propSizes()).sort())
            .toEqual(Object.keys(content.PROP_SIZE).sort());
        expect(C.propSizes().NoSuchProp).toBeUndefined();
    });

    it('the class matches the layer the template belongs on', () => {
        templates('props').forEach(t => expect(t.cls, t.file).toBe('AuraProp'));
        templates('terrain').forEach(t => expect(t.cls, t.file).toBe('AuraTerrain'));
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
        // ⚑ DERIVED from the palette, never typed: a body is a [PLACEHOLDER]
        // look call the PO retunes in front of the game, and a test that names
        // the number turns every such retune into a red suite. What is being
        // pinned is that the box IS the body — a rect's own w/h, a circle's
        // 2*radius — at PX.
        // ⚑ That radius is the VISUAL one since C1b: the authored body is what
        // the sprite is drawn at, and the smaller trunk collider is
        // body.collisionFactor. Before C1b this box drew the COLLIDER and the
        // editor was 29% too small.
        const px = (u: number) => u * C.PX;
        expect({w: house.width, h: house.height})
            .toEqual({w: px(content.PROP_SIZE.House.w), h: px(content.PROP_SIZE.House.h)});
        expect({w: tree.width, h: tree.height})
            .toEqual({w: px(content.PROP_SIZE.Tree.w), h: px(content.PROP_SIZE.Tree.h)});
        // …and the circle really is square, which is the half a rect cannot say.
        expect(tree.width).toBe(tree.height);
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
        // Tree is a circle, House a rect. One multiplier has to serve both,
        // which is why it is not terrain's absolute size.
        const src = zone({props: [
            {type: 'Tree', x: 0, y: 0, rotation: 0, blocksMovement: true, scale: 2.5},
            {type: 'House', x: 4, y: 1, rotation: 0, blocksMovement: true, scale: 0.5},
        ]});
        const model = C.zoneToModel(src);
        // The box really is the scaled physics footprint — what you see is
        // what blocks, at the size it blocks.
        const box = (t: string, s: number) =>
            [content.PROP_SIZE[t].w * C.PX * s, content.PROP_SIZE[t].h * C.PX * s];
        expect(model.layers[1].objects.map((o: {width: number; height: number}) =>
            [o.width, o.height])).toEqual([box('Tree', 2.5), box('House', 0.5)]);
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

    /* ⛔ PRESENT AND WRONG IS REFUSED; ABSENT IS THE DEFAULT — the same
     * asymmetry `clears` records. An absent property is Tiled dropping a value
     * still at its member default, invisible to the author and required to
     * round-trip. A value that is present and unrecognised is somebody having
     * typed it, and a prop that quietly stopped blocking looks on screen exactly
     * like one that still does. */
    it('refuses a blocksMovement Tiled cannot map, and says what it takes', () => {
        const m = modelOf(zone({props: [{type: 'Tree', x: 0, y: 0, rotation: 0}]})) as unknown as
            {layers: {name: string; objects: {properties: Record<string, unknown>}[]}[]};
        m.layers.filter(l => l.name === 'props')[0].objects[0]
            .properties.blocksMovement = 'solid-ish';
        const e = C.validateModel(m) as string[];
        expect(e).toHaveLength(1);
        expect(e[0]).toContain('blocksMovement');
        expect(e[0]).toContain(C.PROP_BLOCKS_INHERIT);
    });

    it('accepts all three values, and an absent one', () => {
        C.PROP_BLOCKS_VALUES.forEach((v: string) => {
            const m = modelOf(zone({props: [{type: 'Tree', x: 0, y: 0, rotation: 0}]})) as unknown as
                {layers: {name: string; objects: {properties: Record<string, unknown>}[]}[]};
            m.layers.filter(l => l.name === 'props')[0].objects[0].properties.blocksMovement = v;
            expect(C.validateModel(m), v).toEqual([]);
        });
        expect(errs(zone({props: [{type: 'Tree', x: 0, y: 0, rotation: 0}]}))).toEqual([]);
    });

    // ⭐ These exist because the first cut of the paths leg called get() —
    // modelToZone's local property reader — inside validateModel, where it does
    // not exist. Every save from Tiled threw "get is not defined", and the whole
    // suite stayed green because NOTHING drove validateModel over a path. The
    // completeness pin cannot catch this: it exercises the serializer and the
    // model round-trip, never the validator.
    function pathZone(over: Record<string, unknown> = {}) {
        return zone({
            paths: [{
                profile: 'Fields', points: [{x: 0, y: 0}, {x: 5, y: 2}],
                width: 3, ...over,
            }],
        });
    }

    it('a well-formed path validates cleanly', () => {
        expect(errs(pathZone())).toEqual([]);
    });

    it('a path with no width says so instead of throwing', () => {
        expect(only(pathZone({width: undefined}))).toContain('width is not set');
    });

    it('a path with a zero or negative width is refused', () => {
        expect(only(pathZone({width: 0}))).toContain('positive number of world units');
        expect(only(pathZone({width: -2}))).toContain('positive number of world units');
    });

    it('a path needs two points to be a line', () => {
        expect(only(pathZone({points: [{x: 0, y: 0}]}))).toContain('at least 2 points');
    });

    it('a path naming a profile that does not exist is refused', () => {
        expect(only(pathZone({profile: 'Nope'}))).toContain('unknown profile "Nope"');
    });

    // ⭐ P1: a POLYGON on the paths layer is now legal and IS the closed flag.
    // Before this it was refused outright ("a closed river is a lake"), which
    // is the assertion this replaces — the fill it was protecting against is
    // AuraPolygon's job, not a shape rule's.
    it('a path drawn as a closed polygon validates cleanly', () => {
        const z = pathZone({points: [{x: 0, y: 0}, {x: 5, y: 0}, {x: 5, y: 5}], closed: true});
        expect(C.validateModel(C.zoneToModel(z))).toEqual([]);
    });

    it('a closed path needs three points to be a ring', () => {
        expect(only(pathZone({points: [{x: 0, y: 0}, {x: 5, y: 0}], closed: true})))
            .toContain('at least 3 points');
    });

    // ⭐ The shape IS the flag, in both directions: a closed path must come back
    // out of the Tiled model as a polygon and go back into the file as
    // `closed: true`, with no property anywhere in between. A `closed` property
    // in the Properties panel would be a second source of truth that could
    // contradict the shape it was drawn as.
    it('a closed path round-trips through the SHAPE, not through a property', () => {
        const z = pathZone({points: [{x: 0, y: 0}, {x: 5, y: 0}, {x: 5, y: 5}], closed: true});
        const model = C.zoneToModel(z);
        const obj = model.layers.find((l: {name: string}) => l.name === 'paths').objects[0];
        expect(obj.shape).toBe('polygon');
        expect(obj.properties).not.toHaveProperty('closed');
        expect(C.modelToZone(model).paths[0].closed).toBe(true);
    });

    // And the other way: an open path must not grow the key at all, or every
    // decorative road in every shipped zone gains a "closed": false nobody
    // wrote and every zone file changes on the next save.
    it('an open path emits no closed key', () => {
        const out = JSON.parse(C.serializeZone(C.modelToZone(C.zoneToModel(pathZone()))));
        expect(out.paths[0]).not.toHaveProperty('closed');
    });

    // ---- polygons, sharing the paths layer (plan-zone-polygons.md D5) -----

    function polyZone(over: Record<string, unknown> = {}) {
        return zone({
            polygons: [{
                profile: 'Fields',
                points: [{x: 0, y: 0}, {x: 5, y: 0}, {x: 5, y: 5}],
                ...over,
            }],
        });
    }

    it('a well-formed polygon validates cleanly', () => {
        expect(errs(polyZone())).toEqual([]);
    });

    it('a polygon needs three points to enclose an area', () => {
        expect(only(polyZone({points: [{x: 0, y: 0}, {x: 5, y: 0}]})))
            .toContain('at least 3 points');
    });

    it('a polygon naming a profile that does not exist is refused', () => {
        expect(only(polyZone({profile: 'Nope'}))).toContain('unknown profile "Nope"');
    });

    // ⭐ L2b — THE one check the layer-per-type scheme got for free. Two classes
    // share this layer and modelToZone routes by class, so an object that is
    // NEITHER lands in neither array and vanishes on the next save with every
    // other check green.
    it('an object on the paths layer with no recognised class is refused by id', () => {
        const model = C.zoneToModel(polyZone());
        const layer = model.layers.find((l: {name: string}) => l.name === 'paths');
        layer.objects.push({
            shape: 'polygon', layer: 'paths', name: 'stray', cls: '', id: 4242,
            x: 0, y: 0, width: 0, height: 0, rotation: 0, flipH: false, flipV: false,
            polygon: [{x: 0, y: 0}, {x: 10, y: 0}, {x: 10, y: 10}], properties: {},
        });
        const msg = C.validateModel(model).join(' | ');
        expect(msg).toContain('AuraPath');
        expect(msg).toContain('AuraPolygon');
        expect(msg).toContain('DROPPED on save');
    });

    // ⭐ The two classes must not read each other's objects. A polygon read as a
    // path would come back width-less (and be refused for it, which at least is
    // loud); a path read as a polygon would come back as a filled shape, which
    // is not loud at all.
    it('paths and polygons on one layer round-trip into their own arrays', () => {
        const z = zone({
            paths: [{profile: 'Road', points: [{x: 0, y: 0}, {x: 5, y: 2}], width: 3}],
            polygons: [{profile: 'Water', points: [{x: 1, y: 1}, {x: 6, y: 1}, {x: 6, y: 6}]}],
        });
        const model = C.zoneToModel(z);
        const layer = model.layers.find((l: {name: string}) => l.name === 'paths');
        expect(layer.objects.map((o: {cls: string}) => o.cls)).toEqual(['AuraPolygon', 'AuraPath']);

        const back = C.modelToZone(model);
        expect(back.paths).toHaveLength(1);
        expect(back.paths[0].profile).toBe('Road');
        expect(back.polygons).toHaveLength(1);
        expect(back.polygons[0].profile).toBe('Water');
        expect(back.polygons[0]).not.toHaveProperty('width');
    });

    // ---- A4: the SECOND shared layer, and its own class split -------------
    //
    // ⛔ THESE LEGS EXIST BECAUSE A MUTATION SURVIVED WITHOUT THEM. Pointing
    // modelToZone's `atmospheres` back at the whole layer — the exact defect
    // zone-polygons D5 produced on the paths layer — left the completeness pin,
    // the round-trip pin and all 133 other legs GREEN, because the pin compares
    // KEYS and both keys were still emitted. What it actually does is hand every
    // clearing back a second time as an atmosphere whose profile is the string
    // "darkness", which no profile table contains: the fog bank grows a shape
    // that paints nothing, and the file on disk quietly gains it on every save.

    function airZone() {
        return zone({
            atmospheres: [{
                profile: 'Fog',
                points: [{x: 0, y: 0}, {x: 6, y: 0}, {x: 6, y: 6}],
            }],
            clearings: [{
                clears: 'darkness',
                points: [{x: 1, y: 1}, {x: 3, y: 1}, {x: 3, y: 3}],
            }],
        });
    }

    it('air and clearings on one layer round-trip into their own arrays', () => {
        const model = C.zoneToModel(airZone());
        const layer = model.layers.find((l: {name: string}) => l.name === 'atmospheres');
        // ⚑ ATMOSPHERES FIRST, THEN CLEARINGS — D17's order, so the canvas shows
        // the z-order the client draws and the resolver answers.
        expect(layer.objects.map((o: {cls: string}) => o.cls))
            .toEqual(['AuraAtmosphere', 'AuraClearing']);

        const back = C.modelToZone(model);
        expect(back.atmospheres).toHaveLength(1);
        expect(back.atmospheres[0].profile).toBe('Fog');
        expect(back.clearings).toHaveLength(1);
        expect(back.clearings[0].clears).toBe('darkness');
        // ⛔ L7 on the wire: a clearing paints nothing, so it must come back with
        // NO profile. zone.go refuses the key by name, so a converter that added
        // one would write a file that no longer boots.
        expect(back.clearings[0]).not.toHaveProperty('profile');
    });

    it('an object on the atmospheres layer with no recognised class is refused by id', () => {
        const model = C.zoneToModel(airZone());
        const layer = model.layers.find((l: {name: string}) => l.name === 'atmospheres');
        layer.objects.push({
            shape: 'polygon', layer: 'atmospheres', name: 'stray', cls: '', id: 4243,
            x: 0, y: 0, width: 0, height: 0, rotation: 0, flipH: false, flipV: false,
            polygon: [{x: 0, y: 0}, {x: 10, y: 0}, {x: 10, y: 10}], properties: {},
        });
        const msg = C.validateModel(model).join(' | ');
        expect(msg).toContain('AuraAtmosphere');
        expect(msg).toContain('AuraClearing');
        expect(msg).toContain('DROPPED on save');
    });

    // ⭐ The C6 rule with no sentinel available. Tiled may DROP a property still
    // sitting at its declared default, so an absent `clears` has to read back as
    // that same default — otherwise a freshly drawn clearing becomes a different
    // clearing the first time it is saved. The palette's member default and
    // aura-convert's CLEARS_DEFAULT are the two halves that must agree.
    it('an absent clears reads back as the palette default', () => {
        const model = C.zoneToModel(airZone());
        const layer = model.layers.find((l: {name: string}) => l.name === 'atmospheres');
        const hole = layer.objects.find((o: {cls: string}) => o.cls === 'AuraClearing');
        delete hole.properties.clears;
        expect(C.validateModel(model)).toEqual([]);
        expect(C.modelToZone(model).clearings[0].clears).toBe('both');
    });

    // ⛔ REFUSED, never defaulted — the asymmetry with the leg above is the
    // point. Absent is Tiled being tidy; present-and-wrong is the author having
    // typed something, and a clearing that silently cleared nothing looks on
    // screen exactly like one drawn in the wrong place.
    it('a clears value outside the closed set is refused by id', () => {
        const model = C.zoneToModel(airZone());
        const layer = model.layers.find((l: {name: string}) => l.name === 'atmospheres');
        const hole = layer.objects.find((o: {cls: string}) => o.cls === 'AuraClearing');
        hole.properties.clears = 'sight';
        const msg = C.validateModel(model).join(' | ');
        expect(msg).toContain('clears');
        expect(msg).toContain('darkness, haze, both');
    });

    // ⚑ A clearing is air, so it refuses everything an atmosphere refuses. The
    // serializer must not grow a collision key "for symmetry with polygons".
    it('a clearing serializes exactly two keys', () => {
        const out = JSON.parse(C.serializeZone(C.modelToZone(C.zoneToModel(airZone()))));
        expect(Object.keys(out.clearings[0]).sort()).toEqual(['clears', 'points']);
    });

    it('a decorative polygon emits no blocksMovement key', () => {
        const out = JSON.parse(C.serializeZone(C.modelToZone(C.zoneToModel(polyZone()))));
        expect(out.polygons[0]).not.toHaveProperty('blocksMovement');
    });

    // ---- outlines, on both surface types (plan-zone-polygons.md D3) -------

    it('an outline round-trips on a path and on a polygon alike', () => {
        const z = zone({
            paths: [{
                profile: 'Road', points: [{x: 0, y: 0}, {x: 5, y: 0}], width: 2,
                outlineProfile: 'Desert', outlineWidth: 0.5,
            }],
            polygons: [{
                profile: 'Water', points: [{x: -8, y: -4}, {x: -2, y: -4}, {x: -2, y: 2}],
                outlineProfile: 'Coast', outlineWidth: 1.25,
            }],
        });
        const back = C.modelToZone(C.zoneToModel(z));
        expect(back.paths[0].outlineProfile).toBe('Desert');
        expect(back.paths[0].outlineWidth).toBe(0.5);
        expect(back.polygons[0].outlineProfile).toBe('Coast');
        expect(back.polygons[0].outlineWidth).toBe(1.25);
    });

    // ⚑ Tri-state, like every other optional key: a shape with no outline must
    // not grow two keys nobody wrote, or every zone file changes on the next
    // save.
    it('a shape with no outline emits neither key', () => {
        const out = JSON.parse(C.serializeZone(C.modelToZone(C.zoneToModel(pathZone()))));
        expect(out.paths[0]).not.toHaveProperty('outlineProfile');
        expect(out.paths[0]).not.toHaveProperty('outlineWidth');
    });

    // ⭐ Both half-authored forms fail SILENTLY in game — a named profile with no
    // width strokes zero pixels, a width with no profile strokes nothing — so
    // both are refused rather than absorbed. Mirrors validateOutline in zone.go.
    it('refuses a half-authored outline, both ways round', () => {
        expect(only(pathZone({outlineProfile: 'Desert', outlineWidth: 0})))
            .toContain('a zero-wide outline draws nothing');

        // ⚑ The other half has to be built on the MODEL, not in a zone file: a
        // width with no profile is a mistake you can only make in Tiled's
        // Properties panel, because both writers gate the width on the profile
        // and would drop it on the way in. That is the point of checking it
        // here — this is the only layer that can still see it.
        const model = C.zoneToModel(pathZone());
        const obj = model.layers.find((l: {name: string}) => l.name === 'paths').objects[0];
        obj.properties.outlineWidth = 2;
        expect(C.validateModel(model).join(' | ')).toContain('no outlineProfile is chosen');
    });

    it('refuses an outline profile that does not exist', () => {
        expect(only(pathZone({outlineProfile: 'Nope', outlineWidth: 1})))
            .toContain('unknown outline profile "Nope"');
    });

    // ⚑ The placeholder is LEGAL on outlineProfile and refused on profile — the
    // same sentinel meaning two different things, because Tiled has no nullable
    // enum. This is the pin that keeps someone from "tidying" that up.
    it('the profile placeholder means NO OUTLINE, not a mistake', () => {
        const z = pathZone();
        const model = C.zoneToModel(z);
        const obj = model.layers.find((l: {name: string}) => l.name === 'paths').objects[0];
        obj.properties.outlineProfile = C.PROFILE_UNSET;
        obj.properties.outlineWidth = 0;
        expect(C.validateModel(model)).toEqual([]);
        expect(C.modelToZone(model).paths[0].outlineProfile).toBeUndefined();
    });

    // ---- ⭐ RECTANGLES on the three closed-area layers ---------------------
    //
    // ⛔ THIS BLOCK EXISTS BECAUSE A REAL BOOT BROKE (2026-09-14). The
    // atmospheres layer was added without a validateModel leg — the only shape
    // layer without one — so Tiled happily saved three objects with no vertices
    // and aurad died on "needs at least 3 points to enclose an area, got 0".
    // Save-time validation exists precisely to catch what the server would
    // reject while the author is still looking at the object.
    //
    // ⭐ The PO's instinct was the right one: "i used rectangle in tiled,
    // assuming it would convert to a polygon cleanly". A rect IS a closed area,
    // so all three closed-area layers now accept one and convert it to its four
    // corners; the refusal that used to greet it was the wrong call.

    // Where each closed-area type lives, and the class Tiled marks it with.
    const CLOSED_AREAS: [string, string, string][] = [
        ['regions', 'AuraRegion', 'Swamp'],
        ['paths', 'AuraPolygon', 'Mountains'],
        ['atmospheres', 'AuraAtmosphere', 'Fog'],
    ];

    // A Tiled object as the format writer hands it back, on the given layer.
    function areaObject(layer: string, cls: string, profile: string,
                        over: Record<string, unknown> = {}) {
        return {
            shape: 'rect', layer, cls, name: profile, id: 4242,
            x: 1200, y: 600, width: 600, height: 360, rotation: 0,
            flipH: false, flipV: false, properties: {profile},
            ...over,
        };
    }

    function withArea(layer: string, cls: string, profile: string,
                      over: Record<string, unknown> = {}) {
        const model = C.zoneToModel(zone());
        model.layers.find((l: {name: string}) => l.name === layer)
            .objects.push(areaObject(layer, cls, profile, over));
        return model;
    }

    CLOSED_AREAS.forEach(([layer, cls, profile]) => {
        it(`a RECTANGLE on the ${layer} layer converts to four corners`, () => {
            const model = withArea(layer, cls, profile);
            expect(C.validateModel(model)).toEqual([]);

            const back = C.modelToZone(model);
            const key = layer === 'paths' ? 'polygons' : layer;
            const pts = back[key][back[key].length - 1].points;
            // 1200,600 px at 120 px/u is (10, 5) from the top-left of a 20x10
            // zone, i.e. (0, 0) in world units; the rect is 5 x 3 u.
            expect(pts).toEqual([
                {x: 0, y: 0}, {x: 5, y: 0}, {x: 5, y: 3}, {x: 0, y: 3},
            ]);
        });

        it(`a rectangle with NO SIZE on ${layer} is refused, not silently empty`, () => {
            // ⛔ The case the point count CANNOT catch, and it is worse than the
            // crash it replaces: a rect always yields four corners, so a 0x0 one
            // passes "at least 3 points" on both sides, boots, and then draws
            // nothing, blocks nothing and says nothing.
            const msg = C.validateModel(withArea(layer, cls, profile,
                {width: 0, height: 0})).join(' | ');
            expect(msg).toContain('no size');
        });

        it(`an ELLIPSE on ${layer} is refused by name`, () => {
            const msg = C.validateModel(withArea(layer, cls, profile,
                {shape: 'ellipse'})).join(' | ');
            expect(msg).toContain('POLYGON or a RECTANGLE');
            expect(msg).toContain('an ellipse');
        });

        it(`a vertex-less POLYGON on ${layer} is refused — the boot that broke`, () => {
            const msg = C.validateModel(withArea(layer, cls, profile,
                {shape: 'polygon', polygon: []})).join(' | ');
            expect(msg).toContain('at least 3 points');
        });
    });

    // ⚑ A rect anchors at its TOP-LEFT and rotates about that — the plain-rect
    // convention, NOT the tile convention the boxed objects use. Getting it
    // wrong would put a rotated area's corners somewhere plausible and wrong.
    it('a rotated rectangle rotates about its top-left corner', () => {
        const back = C.modelToZone(withArea('atmospheres', 'AuraAtmosphere', 'Fog',
            {rotation: 90}));
        // A 5 x 3 rect turned a quarter turn spans 3 across and 5 down.
        expect(back.atmospheres[back.atmospheres.length - 1].points).toEqual([
            {x: 0, y: 0}, {x: 0, y: 5}, {x: -3, y: 5}, {x: -3, y: 0},
        ]);
    });

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
        // ⛔ The FULL filename, not a substring of it: since the 2026-09-15
        // split there are two tables, and 'profiles.json' alone matches both.
        expect(msg).toContain('terrain-profiles.json');
    });

    // ⭐ THE SPLIT’S OWN CHECK (PO 2026-09-15). The ground and the air keep
    // separate profile namespaces, and this is the pair of messages that makes
    // a crossed name say WHERE the name actually lives rather than the true but
    // useless "unknown profile". ⚑ Both names are DERIVED from the palette, so
    // renaming a profile cannot redden this.
    describe('a profile from the OTHER table is refused by name (2026-09-15)', () => {
        const AN_AIR_PROFILE = (content.AIR_PROFILE_NAMES as string[])[0];

        it('refuses an atmosphere profile on a region, and says so', () => {
            const msg = only(region({profile: AN_AIR_PROFILE}));
            expect(msg).toContain('"' + AN_AIR_PROFILE + '" is an atmosphere profile');
            expect(msg).toContain('atmosphere-profiles.json');
            expect(msg).toContain('needs one from terrain-profiles.json');
        });

        it('refuses a terrain profile on an atmosphere, and says so', () => {
            const msg = only(zone({
                atmospheres: [{
                    profile: A_REAL_PROFILE,
                    points: [{x: 0, y: 0}, {x: 2, y: 0}, {x: 2, y: 2}],
                }],
            }));
            expect(msg).toContain('"' + A_REAL_PROFILE + '" is a terrain profile');
            expect(msg).toContain('terrain-profiles.json');
            expect(msg).toContain('needs one from atmosphere-profiles.json');
        });

        // ⚑ The two lists must be disjoint or the messages above are
        // nonsense — a name in both would resolve differently per call site.
        it('keeps the two vocabularies disjoint', () => {
            const ground = content.PROFILE_NAMES as string[];
            const air = content.AIR_PROFILE_NAMES as string[];
            expect(ground.filter(n => air.indexOf(n) >= 0)).toEqual([]);
            expect(air.length).toBeGreaterThan(0);
        });
    });

    // ⭐ WHICH ENUM EACH CLASS MEMBER DECLARES — pinned HERE because nothing
    // else can see it. ⛔ Measured 2026-09-16, not assumed: verify.sh’s Tiled
    // round-trip CANNOT catch this. Headless --export-map loads no project, so
    // tiled.propertyValue throws and aura-world-format.js falls back to writing
    // the bare string (its typedValue), which round-trips whatever the member
    // says. Pointing AuraAtmosphere.profile back at AuraProfile was mutation-
    // tested against the full verify.sh and every leg stayed GREEN — the only
    // visible symptom is the wrong DROPDOWN in the GUI, which is why this pin
    // exists and why verify.sh’s footer now asks a human to look.
    describe('the generated palette wires each class to its own vocabulary', () => {
        const types = nodeRequire('../../../../../tools/tiled/palette/propertytypes.json')
            .propertyTypes as {name: string; type: string; values?: string[];
                members?: {name: string; value?: unknown; propertyType?: string}[]}[];
        const classOf = (name: string) => {
            const found = types.filter(t => t.name === name)[0];
            expect(found, name + ' is missing from the palette').toBeTruthy();
            return found;
        };
        const memberType = (cls: string, member: string) => {
            const m = (classOf(cls).members || []).filter(x => x.name === member)[0];
            expect(m, cls + '.' + member + ' is missing').toBeTruthy();
            return m.propertyType;
        };

        it('gives the atmosphere layer the AIR enum', () => {
            expect(memberType('AuraAtmosphere', 'profile')).toBe('AuraAtmosphereProfile');
        });

        // ⚑ And the ground classes keep the ground one. Asserting only the
        // atmosphere would pass a palette that had moved EVERYTHING to the air
        // enum, which is the same bug wearing the other shoe.
        it('leaves every ground surface on the terrain enum', () => {
            expect(memberType('AuraRegion', 'profile')).toBe('AuraProfile');
            expect(memberType('AuraPath', 'profile')).toBe('AuraProfile');
            expect(memberType('AuraPolygon', 'profile')).toBe('AuraProfile');
        });

        // ⚑ An outline is a GROUND surface even on a shape that is not — it
        // strokes the boundary, so it paints from the terrain table.
        it('keeps outlines on the terrain enum, on both surface types', () => {
            expect(memberType('AuraPath', 'outlineProfile')).toBe('AuraProfile');
            expect(memberType('AuraPolygon', 'outlineProfile')).toBe('AuraProfile');
        });

        // ⭐ The area effect (plan-area-effects.md E1) — a THIRD vocabulary, and
        // not a profile table at all: an effect names an authored SKILL. Pinned
        // here for the same measured reason the two above are: verify.sh cannot
        // see which enum a member declares.
        it('gives every effect-bearing shape the skill enum', () => {
            expect(memberType('AuraPath', 'effect')).toBe('AuraEffect');
            expect(memberType('AuraPolygon', 'effect')).toBe('AuraEffect');
            expect(memberType('AuraAtmosphere', 'effect')).toBe('AuraEffect');
        });

        // ⛔ AND THE TWO SHAPES THAT MUST NOT HAVE ONE, which is the half a
        // "does it exist" pin would miss. A region is the MATERIAL UNDERFOOT —
        // the footsteps/music/colour lookup — so an effect there would be a
        // property of every patch of that material rather than of a place. A
        // clearing paints nothing and names nothing (A4/L7); an erase that also
        // burned you is one shape doing two jobs, which is the ambiguity A4
        // exists to have removed.
        it('gives NO effect member to a region or a clearing', () => {
            ['AuraRegion', 'AuraClearing'].forEach(cls => {
                const names = (classOf(cls).members || []).map(m => m.name);
                expect(names, cls).not.toContain('effect');
            });
        });

        // ⭐ The enum VALUES must match the name lists the converter validates
        // against, or the dropdown offers something the save then refuses.
        // Both carry the placeholder at index 0 and the names after it.
        it('offers exactly the names the converter will accept', () => {
        const values = (name: string) => classOf(name).values as string[];
            expect(values('AuraProfile').slice(1))
                .toEqual(content.PROFILE_NAMES as string[]);
            expect(values('AuraAtmosphereProfile').slice(1))
                .toEqual(content.AIR_PROFILE_NAMES as string[]);
        });

        // ⚑ The effect enum carries its own placeholder at index 0, and the
        // placeholder MEANS something different from the profile one: there it
        // is a mistake the save refuses, here it is "this shape is decorative",
        // which is every shape in every shipped zone.
        it('leads the effect dropdown with the no-effect placeholder', () => {
            const vals = classOf('AuraEffect').values as string[];
            expect(vals[0]).toBe(C.EFFECT_UNSET);
            expect(vals.slice(1)).toEqual(content.EFFECT_NAMES as string[]);
        });

        // ⭐ And the class DEFAULT is that placeholder, on all three. The C6 rule
        // with no spare value available: Tiled may DROP a property still at its
        // class default, so the default and "absent" have to reach the same
        // answer. A default naming a real skill would arm every shape in the
        // world with a hazard nobody drew.
        it('defaults every effect member to the placeholder', () => {
            ['AuraPath', 'AuraPolygon', 'AuraAtmosphere'].forEach(cls => {
                const m = (classOf(cls).members || []).filter(x => x.name === 'effect')[0];
                expect(m.value, cls).toBe(C.EFFECT_UNSET);
            });
        });
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

    /**
     * ⭐ AREA EFFECTS (plan-area-effects.md E1) — one optional key on three
     * shapes, inert until authored.
     *
     * ⛔ Every leg here uses a DIFFERENT effect per shape, deliberately. The
     * three arrays are read by three separate branches of modelToZone, and a
     * reader cross-wired to the wrong shape would round-trip a single shared
     * name perfectly — the trap the shared-layer fixtures in verify.sh each
     * document in their own words.
     */
    describe('an area effect on a shape (E1)', () => {
        // Derived from the palette, never typed: the dropdown IS the vocabulary
        // the validator checks against, so a hand-written name here would go red
        // the next time somebody renames a skill and look like a converter bug.
        const EFFECTS = content.EFFECT_NAMES as string[];
        const [E_PATH, E_POLY, E_AIR] = [EFFECTS[0], EFFECTS[1], EFFECTS[2]];

        const shaped = (over: Record<string, unknown> = {}) => zone({
            paths: [{profile: A_REAL_PROFILE, width: 2,
                points: [{x: 0, y: 0}, {x: 4, y: 0}], effect: E_PATH}],
            polygons: [{profile: A_REAL_PROFILE,
                points: [{x: 0, y: 0}, {x: 4, y: 0}, {x: 4, y: 4}], effect: E_POLY}],
            atmospheres: [{profile: (content.AIR_PROFILE_NAMES as string[])[0],
                points: [{x: 1, y: 1}, {x: 5, y: 1}, {x: 5, y: 5}], effect: E_AIR}],
            ...over,
        });

        it('⭐ each shape keeps its OWN effect through a full round-trip', () => {
            const back = roundTrip(shaped());
            expect(back.paths[0].effect).toBe(E_PATH);
            expect(back.polygons[0].effect).toBe(E_POLY);
            expect(back.atmospheres[0].effect).toBe(E_AIR);
        });

        it('marks the property so Tiled sets it as a TYPED value', () => {
            const m = C.zoneToModel(shaped()) as
                {layers: {name: string; objects: {cls: string; enums: Record<string, string>}[]}[]};
            const objs = m.layers.flatMap(l => l.objects)
                .filter(o => o.enums && o.enums.effect);
            expect(objs).toHaveLength(3);
            objs.forEach(o => expect(o.enums.effect, o.cls).toBe('AuraEffect'));
        });

        // ⭐ D10, and it is the acceptance criterion for the chunk: the feature
        // costs exactly zero until authored. A decorative shape must not grow an
        // "effect": "(no effect)" nobody wrote, or every shipped zone changes on
        // its next save.
        it('⭐ a decorative shape grows no key at all', () => {
            const back = roundTrip(zone({
                paths: [{profile: A_REAL_PROFILE, width: 2,
                    points: [{x: 0, y: 0}, {x: 4, y: 0}]}],
                polygons: [{profile: A_REAL_PROFILE,
                    points: [{x: 0, y: 0}, {x: 4, y: 0}, {x: 4, y: 4}]}],
                atmospheres: [{profile: (content.AIR_PROFILE_NAMES as string[])[0],
                    points: [{x: 1, y: 1}, {x: 5, y: 1}, {x: 5, y: 5}]}],
            }));
            expect(Object.keys(back.paths[0])).not.toContain('effect');
            expect(Object.keys(back.polygons[0])).not.toContain('effect');
            expect(Object.keys(back.atmospheres[0])).not.toContain('effect');
        });

        // ⚑ The C6 rule with no spare value available: Tiled is free to DROP a
        // property still sitting at its class default, so the sentinel and an
        // absent property have to reach the same answer. They do — both mean
        // "no effect" — which is what keeps a freshly drawn shape unchanged.
        it('the placeholder means NO EFFECT, and reads back as absent', () => {
            const model = C.zoneToModel(shaped());
            model.layers.forEach((l: {objects: {properties: Record<string, unknown>}[]}) =>
                l.objects.forEach(o => {
                    if (o.properties && o.properties.effect !== undefined) {
                        o.properties.effect = C.EFFECT_UNSET;
                    }
                }));
            expect(C.validateModel(model)).toEqual([]);
            const back = C.modelToZone(model);
            expect(back.paths[0].effect).toBeUndefined();
            expect(back.polygons[0].effect).toBeUndefined();
            expect(back.atmospheres[0].effect).toBeUndefined();
        });

        // ⚑ Tiled hands a typed enum property back as an INDEX into the declared
        // values, never as the string — the same trap the profile legs exist
        // for, on a third enum.
        it('decodes a typed enum index back to its name', () => {
            const values = content.ENUM_VALUES.AuraEffect as string[];
            const model = C.zoneToModel(shaped());
            const obj = model.layers.find((l: {name: string}) => l.name === 'atmospheres')
                .objects[0];
            obj.properties.effect = {
                value: values.indexOf(E_AIR), typeId: 0, typeName: 'AuraEffect',
            };
            expect(C.modelToZone(model).atmospheres[0].effect).toBe(E_AIR);
        });

        // ⭐ THE LEG L5 DEMANDS, WRITTEN THE DAY THE KEY LANDS. The atmospheres
        // layer shipped with NO validateModel leg at all, and the missing leg —
        // not the bad shape — is what let a vertex-less object refuse the PO's
        // boot. The server refuses an unknown effect too
        // (world.CrossValidateAreaEffects); this says so hours earlier, with an
        // id that goes into Edit ▸ Select Object by Id.
        (['paths', 'polygons', 'atmospheres'] as const).forEach(array => {
            it('refuses an unknown effect on ' + array + ', by id', () => {
                const over: Record<string, unknown> = {};
                const base = shaped()[array] as Record<string, unknown>[];
                over[array] = [{...base[0], effect: 'NoSuchSkill'}];
                const msg = only(shaped(over));
                expect(msg).toContain('unknown effect "NoSuchSkill"');
                // ⚑ It has to say WHERE effects live. "unknown effect" alone is
                // true and useless — the crossed-profile message's posture.
                expect(msg).toContain('api/skills/');
            });
        });

        it('refuses an effect with stray whitespace rather than trimming it', () => {
            const msg = only(shaped({polygons: [{profile: A_REAL_PROFILE,
                points: [{x: 0, y: 0}, {x: 4, y: 0}, {x: 4, y: 4}],
                effect: ' ' + E_POLY}]}));
            expect(msg).toContain('stray whitespace');
        });

        // The dropdown exercised end to end: every name the generator offers has
        // to pass the check that reads its output back. The profile legs' own
        // posture, derived from the content and never a second list.
        it('accepts every effect the palette actually offers', () => {
            expect(EFFECTS.length).toBeGreaterThan(0);
            EFFECTS.forEach(effect => expect(
                errs(zone({polygons: [{profile: A_REAL_PROFILE,
                    points: [{x: 0, y: 0}, {x: 4, y: 0}, {x: 4, y: 4}], effect}]})),
                effect).toEqual([]));
        });

        // ⛔ THE DRIFT GUARD, AND IT CAUGHT A REAL BUG WHILE E1 WAS BEING
        // WRITTEN. api/skills/ has a mobs/ SUBDIRECTORY, and the Go registry
        // walks the tree (skills.RegistryFromFS uses fs.WalkDir) while the first
        // cut of readEffects did a flat readdir — so the palette offered 72 of
        // 105 names and Tiled would have REFUSED a name the server accepts.
        // Derived from the directory, never a count.
        it('⭐ offers every skill the SERVER loads, subdirectories included', () => {
            const dir = nodeRequire.resolve('../../../../../api/skills/damage.json')
                .replace(/damage\.json$/, '');
            const names: string[] = [];
            (function walk(d: string) {
                for (const entry of readdirSync(d, {withFileTypes: true})) {
                    const abs = d + '/' + entry.name;
                    if (entry.isDirectory()) { walk(abs); continue; }
                    if (!entry.name.endsWith('.json')) { continue; }
                    names.push(JSON.parse(readFileSync(abs, 'utf8')).name);
                }
            })(dir);
            expect([...EFFECTS].sort()).toEqual(names.sort());
        });
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

    it('rejects an empty campfire id or a duplicate one', () => {
        const fire = (id: string, startingSpawn?: boolean) => ({id, x: 0, y: 0, startingSpawn});
        expect(errs(zone({campfires: [fire('a', true)]}))).toEqual([]);
        expect(errs(zone({campfires: [fire('a', true), fire('a')]})).join(' '))
            .toContain('duplicate spawn point id');
        expect(errs(zone({campfires: [fire('', true)]})).join(' ')).toContain('must not be empty');
    });

    // ⭐ AND ACCEPTS A ZONE WITH FIRES BUT NO STARTING SPAWN, which used to be
    // refused (plan-underworld.md U1/L4). That rule moved from per-FILE to
    // per-SET on the server the moment more than one zone could load: a cave
    // nobody binds in legitimately carries fires with none flagged, while the
    // WORLD must still have somewhere to put a fresh character.
    //
    // ⚑ Tiled edits ONE file and simply cannot answer a question about the set,
    // so keeping the check here refused to save every legal cave — which is how
    // it was found, on the first attempt to edit underworld.json. The invariant
    // is not weakened: world.Place still hard-fails the boot.
    it('accepts a cave: campfires with no starting spawn is a SET-wide question', () => {
        const fire = (id: string, startingSpawn?: boolean) => ({id, x: 0, y: 0, startingSpawn});
        expect(errs(zone({campfires: [fire('underworld-1')]}))).toEqual([]);
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
        // 11× the type's own box is past the rail of 10, whatever that box is.
        o.width = content.PROP_SIZE.Tree.w * C.PX * 11;
        o.height = content.PROP_SIZE.Tree.h * C.PX * 11;
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
        // ⚑ Authored NON-ZERO on purpose. origin is omitted when absent so
        // today's zones round-trip diff-clean, so a {0, 0} fixture would
        // serialize to no key at all and the pin would pass while both writers
        // quietly dropped it — the same trap paths.blocksMovement documents
        // two fields down.
        origin: {x: 500, y: -500},
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
            // ⛑ The per-placement travel destination (U3b). Authored here for
            // the reason origin and paths.blocksMovement both document: its
            // sentinel is the EMPTY STRING, so a fixture that left it out would
            // serialize to no key at all and this pin would pass while both
            // writers quietly dropped every cave mouth’s destination.
            anchor: 'underworld-entry',
        }],
        campfires: [{id: 'spawnpoint-1', x: 6, y: 6, startingSpawn: true}],
        darkAreas: [{x: 7, y: 7, radius: 2}],
        regions: [{profile: 'swamp', points: [{x: 1, y: 1}, {x: 3, y: 1}, {x: 3, y: 2}]}],
        // ⚑ blocksMovement is tri-state on a path (false = absent), so the
        // fixture has to author it TRUE or the key never appears and the pin
        // passes while the writers quietly disagree about it.
        // ⚑ closed is tri-state for the same reason, and it is DERIVED from the
        // Tiled shape rather than from a property — so a fixture that left it
        // out would exercise the polyline branch only, and both writers could
        // quietly drop every moat in the world with this pin still green.
        // ⚑ The outline pair is authored on BOTH types, not just one: they are
        // the same two keys read by the same helper, so a fixture that exercised
        // only the path would leave the polygon's half of that helper untested
        // and this pin green.
        // ⚑ `effect` is authored on ALL THREE shapes that can carry one, with a
        // DIFFERENT name on each (plan-area-effects.md E1). One would satisfy
        // this pin — it compares key SETS — while two of the three writers
        // quietly dropped it, which is exactly the hole the pin exists to close
        // one level up. The per-array legs below assert the values.
        paths: [{
            profile: 'Water', points: [{x: 1, y: 1}, {x: 5, y: 2}, {x: 4, y: 6}],
            width: 3, blocksMovement: true, closed: true,
            outlineProfile: 'Coast', outlineWidth: 0.5,
            effect: 'Blight',
        }],
        // ⚑ blocksMovement TRUE for the same tri-state reason as the path above:
        // false is the authored default, so a decorative fixture would never
        // emit the key and this pin would pass while both writers dropped it.
        polygons: [{
            profile: 'Mountains',
            points: [{x: 2, y: 1}, {x: 6, y: 1}, {x: 6, y: 5}],
            blocksMovement: true,
            outlineProfile: 'Ice', outlineWidth: 1.25,
            effect: 'Immolate',
        }],
        // ⛔ NO blocksMovement, NO outline, NO width — the D15 ruling in the
        // fixture. An atmosphere is air, and authoring one of those here "for
        // symmetry" would make this pin demand that both writers round-trip a
        // key zone.go refuses by name, i.e. demand they produce a zone file that
        // no longer boots. ⚑ `effect` below is the ONE addition that ruling does
        // not turn away (plan-area-effects.md D1): it describes no wall.
        //
        // ⚑ It has its OWN Tiled layer rather than riding `paths` by class
        // (D16), so this is also the fixture that proves the ninth layer is
        // read back — a converter that forgot to add it to LAYERS would lose
        // every shape on it and nothing else would notice.
        atmospheres: [{
            profile: 'CaveAir',
            points: [{x: 1, y: 2}, {x: 7, y: 2}, {x: 7, y: 6}],
            effect: 'Envenom',
        }],
        // ⛔ TWO keys and NO PROFILE — the A4 ruling in the fixture (L7). A
        // clearing paints nothing, so there is no look to name, and authoring a
        // profile here "for symmetry with the atmosphere above" would demand
        // both writers round-trip a key zone.go refuses by name.
        //
        // ⚑ It SHARES the atmospheres layer with the shape above it and is told
        // apart by CLASS (zone-polygons D5's scheme, not D16's), so this is also
        // the fixture that proves the split survives a round-trip: a converter
        // that read the layer whole would hand both objects back as atmospheres
        // and lose the clears value with nothing else noticing.
        clearings: [{
            clears: 'darkness' as const,
            points: [{x: 3, y: 3}, {x: 5, y: 3}, {x: 5, y: 5}],
        }],
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

    // ⚑ These four stay memberless: none of them has a per-placement knob at
    // all, so there is nothing a member could carry.
    //
    // ⛔ AuraProp CAME OFF THIS LIST on 2026-09-17, and the reason it was ever on
    // it is the interesting half. blocksMovement is a BOOL, which has no spare
    // value to serve as an inherit sentinel — so a member defaulting to true,
    // plus a Tiled that drops default-valued properties, would have flipped all
    // 777 props to false. Sound reasoning, steep price: a freshly dragged prop
    // showed an EMPTY Properties panel and saved as non-blocking. The fix was to
    // stop asking a bool to carry three answers — see the AuraProp block below.
    it('gives the OTHER classes no members, deliberately', () => {
        ['AuraTerrain', 'AuraCampfire', 'AuraDarkArea', 'AuraAnchor']
            .forEach(n => expect(byName(n).members ?? [], n).toEqual([]));
    });

    /* ⭐ THE PIN THE WHOLE PROP DESIGN RESTS ON, and the same one the spawn
     * sentinels get above: the palette's class default and the converter's
     * "absent" reading must be the SAME value. Equal, the design is immune to
     * which way Tiled behaves — a kept '(inherit)' and a dropped property reach
     * the same answer. Unequal, a freshly drawn prop is silently rewritten on
     * its first save, and nothing else in the suite would say so. */
    it("⭐ AuraProp's class default IS the converter's inherit sentinel", () => {
        const members = byName('AuraProp').members ?? [];
        expect(members.length, 'AuraProp carries exactly one member').toBe(1);
        expect(members[0].name).toBe('blocksMovement');
        expect(members[0].propertyType).toBe(C.PROP_BLOCKS_ENUM);
        expect(members[0].value, 'class default must equal PROP_BLOCKS_INHERIT')
            .toBe(C.PROP_BLOCKS_INHERIT);
    });

    // ⚑ And the enum behind it must actually offer the three values the
    // converter maps, with the sentinel leading so it is the natural default.
    it('offers inherit, blocks and walk-through, sentinel first', () => {
        const values = byName(C.PROP_BLOCKS_ENUM).values ?? [];
        expect(values).toEqual(C.PROP_BLOCKS_VALUES);
        expect(values[0]).toBe(C.PROP_BLOCKS_INHERIT);
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
