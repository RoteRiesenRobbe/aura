/* aura-convert.js — the PURE half of the Aura zone format for Tiled.
 *
 * No Tiled API is touched here, deliberately: everything risky (the canonical
 * serializer, the unit/anchor math, the tri-state omit rules) lives in plain
 * functions so it can be tested by vitest outside Tiled. The Tiled glue is
 * aura-world-format.js, which loads AFTER this file — Tiled shares globals
 * across an extension's files and loads them alphabetically (measured, C0).
 *
 * The exported JSON must match ZoneModel.getZoneAsJSON()
 * (frontend/src/features/zone-editor/logic/ZoneModel.ts) BYTE FOR BYTE, or a
 * Tiled save and an in-game-editor save produce a 260 KB diff against each
 * other. That is the acceptance criterion, not a nicety.
 *
 * Written in ES5 on purpose: Tiled runs QJSEngine, and this file is also
 * require()d by the test under Node.
 */
var AuraConvert = (function () {
    'use strict';

    // 1 unit = 120 px. codec.Points2px / BasicConfig.PIXEL_PER_METER, both
    // pinned to api/shared-constants.json "pointsPerMeter".
    var PX = 120;

    // Layer name selects the world.json array (D5).
    var LAYERS = ['terrain', 'props', 'spawns', 'campfires', 'darkAreas', 'anchors'];

    // ZoneModel's rounding helper, verbatim.
    function round(value, digits) {
        var factor = Math.pow(10, digits);
        return Math.round(value * factor) / factor;
    }

    function deg2rad(d) { return d * Math.PI / 180; }
    function rad2deg(r) { return r * 180 / Math.PI; }

    /* ---- Tiled tile-object anchor math -------------------------------------
     * Tiled anchors a tile object at the BOTTOM-LEFT of its unrotated box and
     * rotates clockwise about that point. Aura anchors sprites at their CENTRE
     * (createInjectedSVG sets anchor 0.5/0.5) and rotates clockwise about it.
     * Both flip in local space before rotating, so the mapping is a pure change
     * of anchor. Measured off rendered pixels in C0; see the plan's section 11. */
    function tileAnchor(cx, cy, w, h, deg) {
        var t = deg2rad(deg), c = Math.cos(t), s = Math.sin(t);
        return {x: cx - (w / 2 * c + h / 2 * s), y: cy - (w / 2 * s - h / 2 * c)};
    }
    function tileCentre(x, y, w, h, deg) {
        var t = deg2rad(deg), c = Math.cos(t), s = Math.sin(t);
        return {x: x + (w / 2 * c + h / 2 * s), y: y + (w / 2 * s - h / 2 * c)};
    }

    /* A plain RECTANGLE object anchors at its TOP-LEFT instead, and rotates
     * about that (also measured off pixels). C1 has no tilesets, so terrain and
     * props are rectangles; C2 turns them into tile objects and flips ANCHOR
     * below to 'tile'. Keeping both pairs is what makes that a one-word change
     * rather than a re-derivation. */
    function rectAnchor(cx, cy, w, h, deg) {
        var t = deg2rad(deg), c = Math.cos(t), s = Math.sin(t);
        return {x: cx - (w / 2 * c - h / 2 * s), y: cy - (w / 2 * s + h / 2 * c)};
    }
    function rectCentre(x, y, w, h, deg) {
        var t = deg2rad(deg), c = Math.cos(t), s = Math.sin(t);
        return {x: x + (w / 2 * c - h / 2 * s), y: y + (w / 2 * s + h / 2 * c)};
    }

    // Which anchor convention the boxed objects (terrain, props) use. C2 gave
    // them real tilesets, so they are tile objects now.
    var ANCHOR = 'tile';

    /* The generated content vocabulary (tools/tiled/palette/content.json):
     * terrain type list, prop body sizes, derived mob kinds and species speeds.
     * Injected through an explicit seam rather than read off a global — C5 moved
     * it out of the extension and into the palette, so the loader differs
     * between Tiled and Node and neither should be assumed here.
     * Absent is survivable — props fall back to a 1-unit box, every spawn reads
     * as combat, and the vocabulary CHECKS skip themselves (see validateModel) —
     * so the converter stays testable on its own. */
    var content = {TERRAIN_TYPES: [], PROP_SIZE: {}, MOB_KIND: {}, MOB_SPEED: {}, ENUM_VALUES: {}};
    function useContent(c) {
        content = {
            TERRAIN_TYPES: (c && c.TERRAIN_TYPES) || [],
            PROP_SIZE: (c && c.PROP_SIZE) || {},
            MOB_KIND: (c && c.MOB_KIND) || {},
            MOB_SPEED: (c && c.MOB_SPEED) || {},
            ENUM_VALUES: (c && c.ENUM_VALUES) || {},
        };
    }

    /* Tiled hands an ENUM-typed property back as {value, typeId, typeName},
     * where value is an INDEX into the type's declared values — never the
     * string. Decode it here so nothing downstream has to know.
     *
     * ⚑ Why typed values at all, when a plain string round-trips fine: a plain
     * string property SHADOWS the class member that declares the enum, so the
     * Properties panel degrades to a free-text box. Measured — the dropdown
     * reappeared only after resetting the field, which is the panel falling
     * back to the (typed) member. */
    function plainValue(v) {
        if (v === null || typeof v !== 'object') { return v; }
        if (typeof v.typeName !== 'string') { return v; }
        var values = content.ENUM_VALUES[v.typeName];
        if (values && typeof v.value === 'number' && v.value >= 0 && v.value < values.length) {
            return values[v.value];
        }
        // An index we cannot decode must not silently become a number that
        // then reads as a mob name. Surface it instead: validation rejects it.
        return values ? '(unknown ' + v.typeName + ' #' + v.value + ')' : v.value;
    }
    function propSize(type) {
        return content.PROP_SIZE[type] || {w: 1, h: 1};
    }

    /* ---- C6: the inherit sentinels ------------------------------------------
     * Four of the spawn knobs are tri-state — absent means "inherit the species
     * value", and for wanderRadius an explicit 0 means the opposite ("forced
     * stationary", 19 spawns rely on it). Tiled cannot express absent: a typed
     * class member always has a value. So each field borrows a value the loader
     * ALREADY rejects, which therefore can never collide with real data:
     *
     *   level               0    zone.go rejects < 1 (Mob.spawnLevel encodes
     *                            "no override" as 0 — the engine's own sentinel)
     *   wanderRadius       -1    negatives rejected; 0 is TAKEN (stationary)
     *   idleSpeedFactor     0    valid range is (0, 1]
     *   respawnTicks       -1    0 is TAKEN (absent parses to 0 = next tick)
     *   respawnVariancePct -1    same
     *   patrolMode   pingpong    the writer omits anything that is not "loop"
     *
     * ⚑ wanderRadius and respawnTicks are the two rows where the obvious
     * sentinel (0) is a real authored value. That is why this table exists
     * rather than "use 0 everywhere".
     *
     * ⚑ The mapping is applied in exactly ONE place (readSpawn) and consumed by
     * both modelToZone and validateModel. Two copies would be two chances to
     * silently rewrite ~226 inheriting spawns. */
    var SPAWN_INHERIT = {
        respawnTicks: -1,
        respawnVariancePct: -1,
        wanderRadius: -1,
        idleSpeedFactor: 0,
        level: 0,
    };
    var PATROL_INHERIT = 'pingpong';

    // The AuraMobName default. A class member cannot be empty, so a hand-drawn
    // spawn would otherwise silently become whichever mob sorted first. This is
    // not a mob name, so validation refuses the save until one is picked.
    var MOB_UNSET = '(pick a mob)';

    /* Read a spawn object's authored values, with every sentinel resolved back
     * to "absent". The single source of truth for the table above. */
    // Which spawn properties carry a custom enum type. aura-world-format.js
    // reads this to set them as TYPED values, which is what keeps the dropdown.
    var SPAWN_ENUMS = {mob: 'AuraMobName', patrolMode: 'AuraPatrolMode'};

    function readSpawn(o) {
        function raw(k) {
            var v = o.properties && o.properties[k] !== undefined && o.properties[k] !== null
                ? o.properties[k] : undefined;
            return plainValue(v);
        }
        // ⚑ The typed property wins over the object's Name, which is kept only
        // as a readable label and is refreshed from the property on reopen.
        var mob = raw('mob');
        var out = {mob: mob !== undefined ? mob : o.name};
        for (var k in SPAWN_INHERIT) {
            if (Object.prototype.hasOwnProperty.call(SPAWN_INHERIT, k)) {
                var v = raw(k);
                out[k] = (v === undefined || v === SPAWN_INHERIT[k]) ? undefined : v;
            }
        }
        var pm = raw('patrolMode');
        out.patrolMode = (pm === undefined || pm === PATROL_INHERIT) ? undefined : pm;
        out.waypointCount = (o.shape === 'polyline' && o.polygon) ? o.polygon.length - 1 : 0;
        return out;
    }
    function spawnClass(mob) {
        var k = content.MOB_KIND[mob] || 'combat';
        return 'AuraSpawn' + k.charAt(0).toUpperCase() + k.slice(1);
    }
    function anchorOf(cx, cy, w, h, deg) {
        return ANCHOR === 'tile' ? tileAnchor(cx, cy, w, h, deg) : rectAnchor(cx, cy, w, h, deg);
    }
    function centreOf(x, y, w, h, deg) {
        return ANCHOR === 'tile' ? tileCentre(x, y, w, h, deg) : rectCentre(x, y, w, h, deg);
    }

    /* Does this text end in a newline?
     *
     * ⚑ The repo has TWO zone writers that disagree by one byte:
     * scripts/world-place.py writes json.dumps(...) + "\n", while
     * ZoneModel.getZoneAsJSON is a bare JSON.stringify with no trailing
     * newline — and the committed world.json carries the Python one. Picking
     * either side would make this tool byte-stable against one writer and
     * one byte off the other, forever. So we take no side: whatever the file
     * had on the way in, it gets back on the way out. */
    function endsWithNewline(text) {
        return text.length > 0 && text.charAt(text.length - 1) === '\n';
    }

    /* ---- The canonical serializer ------------------------------------------
     * Field order, rounding and omit rules mirror ZoneModel.getZoneAsJSON().
     * undefined values are dropped by JSON.stringify — that is how every
     * tri-state key stays absent. */
    function serializeZone(z, trailingNewline) {
        var data = {
            name: z.name,
            bounds: {width: z.bounds.width, height: z.bounds.height},
            terrain: z.terrain.map(function (t) {
                return {
                    type: t.type,
                    x: round(t.x, 2),
                    y: round(t.y, 2),
                    size: round(t.size, 2),
                    rotation: round(t.rotation, 3),
                    flipped: t.flipped,
                };
            }),
            props: z.props.map(function (p) {
                return {
                    type: p.type,
                    x: round(p.x, 2),
                    y: round(p.y, 2),
                    rotation: round(p.rotation, 3),
                    blocksMovement: p.blocksMovement,
                };
            }),
            spawns: z.spawns.map(function (s) {
                return {
                    mob: s.mob,
                    x: round(s.x, 2),
                    y: round(s.y, 2),
                    angle: round(s.angle, 3),
                    // Tri-state: a talker authors no respawn keys at all, and
                    // an absent key parses to 0 server-side ("respawn next
                    // tick"). Never synthesise these.
                    respawnTicks: s.respawnTicks,
                    respawnVariancePct: s.respawnVariancePct,
                    // undefined = inherit the species value; an explicit 0
                    // wanderRadius is a real value (stationary override).
                    wanderRadius: s.wanderRadius !== undefined ? round(s.wanderRadius, 2) : undefined,
                    idleSpeedFactor: s.idleSpeedFactor !== undefined ? round(s.idleSpeedFactor, 2) : undefined,
                    level: s.level,
                    waypoints: s.waypoints && s.waypoints.length > 0
                        ? s.waypoints.map(function (w) { return {x: round(w.x, 2), y: round(w.y, 2)}; })
                        : undefined,
                    patrolMode: s.patrolMode === 'loop' ? 'loop' : undefined,
                };
            }),
            campfires: z.campfires && z.campfires.length > 0
                ? z.campfires.map(function (c) {
                    return {
                        id: c.id,
                        x: round(c.x, 2),
                        y: round(c.y, 2),
                        startingSpawn: c.startingSpawn ? true : undefined,
                    };
                })
                : undefined,
            darkAreas: z.darkAreas && z.darkAreas.length > 0
                ? z.darkAreas.map(function (d) {
                    return {x: round(d.x, 2), y: round(d.y, 2), radius: round(d.radius, 2)};
                })
                : undefined,
            anchors: z.anchors && z.anchors.length > 0
                ? z.anchors.map(function (a) { return {name: a.name, x: round(a.x, 2), y: round(a.y, 2)}; })
                : undefined,
        };
        return JSON.stringify(data, null, 2) + (trailingNewline ? '\n' : '');
    }

    /* ---- zone JSON  ->  plain layer/object model ---------------------------
     * The model is deliberately Tiled-free: {shape, name, x, y, width, height,
     * rotation(deg), flipH, flipV, polygon, properties}. aura-world-format.js
     * turns these into MapObjects and back, and nothing numeric lives there. */
    function zoneToModel(z) {
        var hw = z.bounds.width / 2, hh = z.bounds.height / 2;
        function px(u, half) { return (u + half) * PX; }
        function set(o, k, v) { if (v !== undefined && v !== null) { o[k] = v; } }

        var terrain = (z.terrain || []).map(function (t) {
            var side = t.size * 2 * PX;
            var a = anchorOf(px(t.x, hw), px(t.y, hh), side, side, rad2deg(t.rotation || 0));
            return {
                shape: 'tile', layer: 'terrain', name: t.type,
                tileset: 'terrain', tileType: t.type, cls: 'AuraTerrain',
                x: a.x, y: a.y, width: side, height: side,
                rotation: rad2deg(t.rotation || 0),
                // Real gid flip flags now that a tileset exists (C1 parked
                // these in a custom property for want of a tile).
                flipH: t.flipped === 'horizontal',
                flipV: t.flipped === 'vertical',
                properties: {},
            };
        });

        // ⚑ Props carry no size in world.json — it belongs to the TYPE
        // (api/props/*.json body), so the box here is the type's true physics
        // footprint and is DISPLAY ONLY: the writer recovers the centre from
        // whatever box Tiled reports and never emits a size, so resizing a prop
        // in Tiled is discarded. Per-placement scale is its own plan
        // (docs/plan-prop-scale.md).
        var props = (z.props || []).map(function (p2) {
            var sz = propSize(p2.type);
            var w = sz.w * PX, h = sz.h * PX;
            var a = anchorOf(px(p2.x, hw), px(p2.y, hh), w, h, rad2deg(p2.rotation || 0));
            return {
                shape: 'tile', layer: 'props', name: p2.type,
                tileset: 'props', tileType: p2.type, cls: 'AuraProp',
                x: a.x, y: a.y, width: w, height: h,
                rotation: rad2deg(p2.rotation || 0),
                flipH: false, flipV: false,
                properties: {blocksMovement: !!p2.blocksMovement},
            };
        });

        var spawns = (z.spawns || []).map(function (s) {
            var o = {
                shape: 'point', layer: 'spawns', name: s.mob, cls: spawnClass(s.mob),
                x: px(s.x, hw), y: px(s.y, hh),
                width: 0, height: 0, rotation: rad2deg(s.angle || 0),
                flipH: false, flipV: false, properties: {},
            };
            // C6: the whole form is visible on every spawn because the CLASS
            // declares all seven members. Only the ones actually authored are
            // set on the object, so the rest render as inherited defaults —
            // which is also what keeps them typed (an object-level property
            // shadows the member that gives it its type).
            //
            // ⚑ Setting the sentinel explicitly and omitting it are the same
            // thing to readSpawn, by design and by test. Omitting is chosen
            // only because it reads better in the panel.
            o.properties.mob = s.mob;
            o.enums = {mob: SPAWN_ENUMS.mob};
            for (var k in SPAWN_INHERIT) {
                if (Object.prototype.hasOwnProperty.call(SPAWN_INHERIT, k)
                    && s[k] !== undefined && s[k] !== null && s[k] !== SPAWN_INHERIT[k]) {
                    o.properties[k] = s[k];
                }
            }
            if (s.patrolMode === 'loop') {
                o.properties.patrolMode = 'loop';
                o.enums.patrolMode = SPAWN_ENUMS.patrolMode;
            }
            // A patrolling spawn IS its route: a polyline whose origin is the
            // spawn point and whose first vertex is that origin. Editing the
            // route is then dragging vertices, which is the whole point.
            if (s.waypoints && s.waypoints.length > 0) {
                o.shape = 'polyline';
                o.polygon = [{x: 0, y: 0}].concat(s.waypoints.map(function (w) {
                    return {x: px(w.x, hw) - o.x, y: px(w.y, hh) - o.y};
                }));
            }
            return o;
        });

        var campfires = (z.campfires || []).map(function (c) {
            var o = {
                shape: 'point', layer: 'campfires', name: c.id, cls: 'AuraCampfire',
                x: px(c.x, hw), y: px(c.y, hh),
                width: 0, height: 0, rotation: 0, flipH: false, flipV: false,
                properties: {},
            };
            if (c.startingSpawn) { o.properties.startingSpawn = true; }
            return o;
        });

        var darkAreas = (z.darkAreas || []).map(function (d) {
            var side = d.radius * 2 * PX;
            return {
                shape: 'ellipse', layer: 'darkAreas', name: '', cls: 'AuraDarkArea',
                x: px(d.x, hw) - side / 2, y: px(d.y, hh) - side / 2,
                width: side, height: side, rotation: 0,
                flipH: false, flipV: false, properties: {},
            };
        });

        var anchors = (z.anchors || []).map(function (a) {
            return {
                shape: 'point', layer: 'anchors', name: a.name, cls: 'AuraAnchor',
                x: px(a.x, hw), y: px(a.y, hh),
                width: 0, height: 0, rotation: 0,
                flipH: false, flipV: false, properties: {},
            };
        });

        return {
            zoneName: z.name,
            boundsWidth: z.bounds.width,
            boundsHeight: z.bounds.height,
            layers: [
                // terrain array order IS paint order (GroundTextureManager), so
                // the layer must draw by index or the canvas lies about which
                // piece covers which.
                {name: 'terrain', drawOrder: 'index', objects: terrain},
                {name: 'props', drawOrder: 'index', objects: props},
                {name: 'spawns', drawOrder: 'index', objects: spawns},
                {name: 'campfires', drawOrder: 'index', objects: campfires},
                {name: 'darkAreas', drawOrder: 'index', objects: darkAreas},
                {name: 'anchors', drawOrder: 'index', objects: anchors},
            ],
        };
    }

    /* ---- plain model  ->  zone JSON ---------------------------------------- */
    function modelToZone(m) {
        var hw = m.boundsWidth / 2, hh = m.boundsHeight / 2;
        function u(p2, half) { return p2 / PX - half; }
        function get(o, k) {
            return o.properties && o.properties[k] !== undefined && o.properties[k] !== null
                ? o.properties[k] : undefined;
        }
        function layer(name) {
            for (var i = 0; i < m.layers.length; i++) {
                if (m.layers[i].name === name) { return m.layers[i].objects || []; }
            }
            return [];
        }
        function centre(o) { return centreOf(o.x, o.y, o.width, o.height, o.rotation || 0); }

        return {
            name: m.zoneName,
            bounds: {width: m.boundsWidth, height: m.boundsHeight},
            terrain: layer('terrain').map(function (o, i) {
                if (o.flipH && o.flipV) {
                    throw new Error('terrain[' + i + '] "' + o.name + '": world.json has no'
                        + ' both-axes flip; use one flip plus 180 degrees of rotation');
                }
                var c = centre(o);
                return {
                    type: o.name,
                    x: u(c.x, hw), y: u(c.y, hh),
                    size: o.width / (2 * PX),
                    rotation: deg2rad(o.rotation || 0),
                    flipped: o.flipH ? 'horizontal' : (o.flipV ? 'vertical' : 'none'),
                };
            }),
            props: layer('props').map(function (o) {
                var c = centre(o);
                return {
                    type: o.name,
                    x: u(c.x, hw), y: u(c.y, hh),
                    rotation: deg2rad(o.rotation || 0),
                    blocksMovement: !!get(o, 'blocksMovement'),
                };
            }),
            spawns: layer('spawns').map(function (o) {
                // Every sentinel comes back as undefined here, which the
                // serializer drops — that is what keeps the ~226 inheriting
                // spawns byte-identical while the editor shows a full form.
                var p = readSpawn(o);
                var s = {
                    mob: p.mob,
                    x: u(o.x, hw), y: u(o.y, hh),
                    angle: deg2rad(o.rotation || 0),
                    respawnTicks: p.respawnTicks,
                    respawnVariancePct: p.respawnVariancePct,
                    wanderRadius: p.wanderRadius,
                    idleSpeedFactor: p.idleSpeedFactor,
                    level: p.level,
                    patrolMode: p.patrolMode,
                };
                if (o.shape === 'polyline' && o.polygon && o.polygon.length > 1) {
                    s.waypoints = o.polygon.slice(1).map(function (v) {
                        return {x: u(o.x + v.x, hw), y: u(o.y + v.y, hh)};
                    });
                }
                return s;
            }),
            campfires: layer('campfires').map(function (o) {
                return {
                    id: o.name,
                    x: u(o.x, hw), y: u(o.y, hh),
                    startingSpawn: get(o, 'startingSpawn') ? true : undefined,
                };
            }),
            darkAreas: layer('darkAreas').map(function (o) {
                return {
                    x: u(o.x + o.width / 2, hw),
                    y: u(o.y + o.height / 2, hh),
                    radius: o.width / (2 * PX),
                };
            }),
            anchors: layer('anchors').map(function (o) {
                return {name: o.name, x: u(o.x, hw), y: u(o.y, hh)};
            }),
        };
    }

    /* ---- save-time validation (C4) -----------------------------------------
     * A mirror of world/zone.go's validate() + resolve(), run on the model just
     * before serializing. Everything checked here is something the server
     * already refuses — the point is WHEN and WHERE it is reported.
     *
     * ⭐ Without this, dragging a Tree tile onto the spawns layer saves happily
     * and kills the server at boot with `spawn 488: unknown mob "Tree"`: the
     * right complaint, in the wrong tool, hours later, naming an array index
     * nobody can map back to the thing they dragged. Here it names the object's
     * Tiled id (Edit ▸ Select Object by Id jumps straight to it) and refuses
     * the save, which loses nothing — Tiled keeps the document open.
     *
     * ⚑ The vocabulary checks are skipped when the generated content is absent,
     * so the converter stays usable (and testable) without aura-content.js. */

    function has(map, key) { return Object.prototype.hasOwnProperty.call(map, key); }

    // "Tree" on the spawns layer is not a typo, it is a layer mistake — and the
    // vocabularies already to hand can say so. This is the whole reason the
    // chunk exists, so the message earns its length.
    function whereElse(name) {
        if (has(content.PROP_SIZE, name)) { return 'prop type'; }
        if (has(content.MOB_KIND, name)) { return 'mob'; }
        for (var i = 0; i < content.TERRAIN_TYPES.length; i++) {
            if (content.TERRAIN_TYPES[i] === name) { return 'ground texture'; }
        }
        return null;
    }
    var LAYER_OF_KIND = {'prop type': 'props', 'mob': 'spawns', 'ground texture': 'terrain'};

    function unknownName(layer, name, what) {
        var msg = 'unknown ' + what + ' "' + name + '"';
        var kind = whereElse(name);
        if (kind && LAYER_OF_KIND[kind] !== layer) {
            msg += ' — "' + name + '" is a ' + kind + ', so this object belongs in the "'
                + LAYER_OF_KIND[kind] + '" layer, not "' + layer + '"';
        }
        return msg;
    }

    function validateModel(m) {
        var errors = [];
        function bad(o, i, msg) {
            errors.push(o.layer + ' #' + (o.id !== undefined ? o.id : '?')
                + (o.name ? ' "' + o.name + '"' : '') + ' (' + o.layer + '[' + i + ']): ' + msg);
        }
        function layer(name) {
            for (var i = 0; i < m.layers.length; i++) {
                if (m.layers[i].name === name) { return m.layers[i].objects || []; }
            }
            return [];
        }
        function prop(o, k) {
            return o.properties && o.properties[k] !== undefined && o.properties[k] !== null
                ? o.properties[k] : undefined;
        }
        function num(o, i, k, v, test, expected) {
            if (v === undefined) { return true; }
            if (typeof v !== 'number' || isNaN(v) || !test(v)) {
                bad(o, i, k + ' ' + JSON.stringify(v) + ' must be ' + expected);
                return false;
            }
            return true;
        }

        if (!m.zoneName || !String(m.zoneName).replace(/\s/g, '')) {
            errors.push('zone name must not be empty (map property "zoneName")');
        }
        if (!(m.boundsWidth > 0) || !(m.boundsHeight > 0)) {
            errors.push('bounds must be positive, got ' + m.boundsWidth + 'x' + m.boundsHeight);
        }

        // ⭐ terrain.type is the one field validated NOWHERE else: the server
        // ignores it (zone.go has no terrain checks at all) and the client
        // dereferences undefined at render time, so a typo shows up as a broken
        // browser rather than a failed boot. Free to close here.
        var terrainKnown = content.TERRAIN_TYPES.length > 0;
        layer('terrain').forEach(function (o, i) {
            if (terrainKnown && whereElse(o.name) !== 'ground texture') {
                bad(o, i, unknownName('terrain', o.name, 'ground texture'));
            }
            if (!(o.width > 0)) { bad(o, i, 'size must be positive'); }
            if (o.flipH && o.flipV) {
                bad(o, i, 'world.json has no both-axes flip; use one flip plus 180° of rotation');
            }
        });

        var propsKnown = Object.keys(content.PROP_SIZE).length > 0;
        layer('props').forEach(function (o, i) {
            if (propsKnown && !has(content.PROP_SIZE, o.name)) {
                bad(o, i, unknownName('props', o.name, 'prop type'));
            }
        });

        var mobsKnown = Object.keys(content.MOB_KIND).length > 0;
        layer('spawns').forEach(function (o, i) {
            // ⚑ Through readSpawn, never off the raw properties: every
            // inheriting spawn carries `level: 0` and `wanderRadius: -1`, and
            // range-checking those raw would flag ~226 healthy spawns.
            var p = readSpawn(o);
            var known = !mobsKnown || has(content.MOB_KIND, p.mob);
            if (p.mob === MOB_UNSET) {
                bad(o, i, 'no mob chosen yet — pick one in the Properties panel ("mob")');
                known = false;
            } else if (!known) {
                bad(o, i, unknownName('spawns', p.mob, 'mob'));
            }

            var waypoints = p.waypointCount;
            if (waypoints === 1) {
                bad(o, i, 'a route needs at least 2 waypoints (the polyline needs a third point'
                    + ' — its first vertex is the spawn itself)');
            }

            var wr = p.wanderRadius;
            num(o, i, 'wanderRadius', wr, function (v) { return v >= 0; }, 'zero or positive');
            if (typeof wr === 'number' && wr > 0 && waypoints > 0) {
                bad(o, i, 'wanderRadius and waypoints are mutually exclusive');
            }
            num(o, i, 'idleSpeedFactor', p.idleSpeedFactor,
                function (v) { return v > 0 && v <= 1; }, 'in (0, 1]');
            num(o, i, 'level', p.level,
                function (v) { return v >= 1 && v === Math.floor(v); }, 'a whole number >= 1');
            num(o, i, 'respawnTicks', p.respawnTicks,
                function (v) { return v >= 0; }, 'zero or positive');
            num(o, i, 'respawnVariancePct', p.respawnVariancePct,
                function (v) { return v >= 0; }, 'zero or positive');

            // Only "loop" survives readSpawn — "pingpong" IS the inherit
            // sentinel, so anything left here is a typo.
            var mode = p.patrolMode;
            if (mode !== undefined && mode !== 'loop') {
                bad(o, i, 'patrolMode "' + mode + '" must be "pingpong" or "loop"');
            }
            if (mode !== undefined && waypoints === 0) { bad(o, i, 'patrolMode without waypoints'); }

            // zone.go checks this in resolve(), not validate(), because it needs
            // the resolved species — which is why the generated MOB_SPEED exists.
            if (known && mobsKnown) {
                var moves = (typeof wr === 'number' && wr > 0) || waypoints > 0;
                if (moves && !(content.MOB_SPEED[p.mob] > 0)) {
                    bad(o, i, 'stationary mob "' + p.mob + '" (speed 0) cannot wander or patrol');
                }
            }
        });

        var campfires = layer('campfires');
        var seenFire = {};
        var hasStart = false;
        campfires.forEach(function (o, i) {
            var id = String(o.name || '').replace(/^\s+|\s+$/g, '');
            if (!id) { bad(o, i, 'id must not be empty (the object\'s Name is the campfire id)'); }
            else if (seenFire[id]) { bad(o, i, 'duplicate spawn point id "' + id + '"'); }
            seenFire[id] = true;
            if (prop(o, 'startingSpawn')) { hasStart = true; }
        });
        if (campfires.length > 0 && !hasStart) {
            errors.push('zone has ' + campfires.length
                + ' campfire(s) but none is flagged startingSpawn — fresh players would'
                + ' have nowhere to land');
        }

        layer('darkAreas').forEach(function (o, i) {
            if (!(o.width > 0)) { bad(o, i, 'radius must be positive'); }
            // world.json carries a single radius, and the writer reads it off the
            // width — so an ellipse dragged out of round would silently lose its
            // height. Refuse rather than pick a side.
            else if (Math.abs(o.width - o.height) > 0.5) {
                bad(o, i, 'must stay a circle (' + Math.round(o.width) + '×' + Math.round(o.height)
                    + ' px) — world.json has one radius, so hold Shift while resizing');
            }
        });

        var seenAnchor = {};
        var hw = m.boundsWidth / 2, hh = m.boundsHeight / 2;
        layer('anchors').forEach(function (o, i) {
            var name = String(o.name || '').replace(/^\s+|\s+$/g, '');
            if (!name) { bad(o, i, 'name must not be empty'); }
            else if (seenAnchor[name]) { bad(o, i, 'duplicate anchor name "' + name + '"'); }
            seenAnchor[name] = true;
            var x = o.x / PX - hw, y = o.y / PX - hh;
            if (x < -hw || x > hw || y < -hh || y > hh) {
                bad(o, i, 'at (' + round(x, 2) + ', ' + round(y, 2) + ') is outside the bounds');
            }
        });

        return errors;
    }

    // One refusal message for Tiled. Capped: a layer mistake made in bulk would
    // otherwise produce hundreds of lines and hide its own first one.
    var MAX_REPORTED = 12;
    function formatErrors(errors) {
        var shown = errors.slice(0, MAX_REPORTED);
        var more = errors.length - shown.length;
        return 'Refusing to save — ' + errors.length + ' problem(s) the server would reject:\n\n'
            + shown.join('\n')
            + (more > 0 ? '\n… and ' + more + ' more.' : '')
            + '\n\nThe object ids above go straight into Edit ▸ Select Object by Id.';
    }

    /* UTF-8 bytes for a string.
     *
     * ⚑ This exists because Tiled's TextFile writes CRLF on Windows, which
     * added 14602 bytes to a 266073-byte world.json — every line, every save,
     * against a repo that stores LF. The writer therefore goes through
     * BinaryFile, which needs bytes rather than a string. Hand-rolled because
     * QJSEngine has no TextEncoder; JSON.stringify does not escape non-ASCII,
     * so a zone or mob name outside ASCII would otherwise corrupt silently. */
    function utf8Bytes(str) {
        var out = [], i, c, c2, cp;
        for (i = 0; i < str.length; i++) {
            c = str.charCodeAt(i);
            if (c < 0x80) {
                out.push(c);
            } else if (c < 0x800) {
                out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
            } else if (c >= 0xD800 && c <= 0xDBFF && i + 1 < str.length) {
                c2 = str.charCodeAt(++i);
                cp = 0x10000 + ((c - 0xD800) << 10) + (c2 - 0xDC00);
                out.push(0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 63),
                         0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
            } else {
                out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
            }
        }
        return out;
    }

    return {
        PX: PX,
        LAYERS: LAYERS,
        utf8Bytes: utf8Bytes,
        useContent: useContent,
        endsWithNewline: endsWithNewline,
        round: round,
        deg2rad: deg2rad,
        rad2deg: rad2deg,
        tileAnchor: tileAnchor,
        rectAnchor: rectAnchor,
        rectCentre: rectCentre,
        tileCentre: tileCentre,
        serializeZone: serializeZone,
        zoneToModel: zoneToModel,
        modelToZone: modelToZone,
        validateModel: validateModel,
        formatErrors: formatErrors,
        SPAWN_INHERIT: SPAWN_INHERIT,
        SPAWN_ENUMS: SPAWN_ENUMS,
        plainValue: plainValue,
        PATROL_INHERIT: PATROL_INHERIT,
        MOB_UNSET: MOB_UNSET,
        readSpawn: readSpawn,
    };
})();

if (typeof module === 'object' && module.exports) { module.exports = AuraConvert; }
