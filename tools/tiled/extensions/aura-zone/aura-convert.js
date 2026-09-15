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
    var LAYERS = ['terrain', 'props', 'spawns', 'campfires', 'darkAreas', 'regions', 'paths', 'atmospheres', 'anchors'];

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

    /* The vertices of a CLOSED-AREA object — a region, an AuraPolygon or an
     * atmosphere — in pixels RELATIVE to o.x/o.y, which is the form o.polygon
     * already takes.
     *
     * ⭐ A RECTANGLE converts to its four corners instead of being refused
     * (PO 2026-09-14: "i used rectangle in tiled, assuming it would convert to a
     * polygon cleanly"). The assumption was right and the old refusal was the
     * wrong call: a rect IS a closed area, and it is the natural tool for a big
     * fog bank or a rock mass. All three closed-area layers accept one.
     *
     * ⚑ A plain rect anchors at its TOP-LEFT and rotates about that — the same
     * convention rectAnchor/rectCentre above already encode, and NOT the tile
     * convention the boxed objects use. Getting that wrong would put a rotated
     * area's corners in the wrong place with nothing to say so.
     *
     * ⛔ ONE-WAY, and worth knowing before you draw: the zone format has no
     * rectangle for these arrays, so a rect SAVES as four points and REOPENS as
     * a polygon. The shape is identical — nothing is lost — but you cannot drag
     * it by its handles as a rect afterwards.
     */
    function aOrAn(word) {
        return ('aeiou'.indexOf(String(word).charAt(0).toLowerCase()) >= 0 ? 'an ' : 'a ') + word;
    }

    function closedAreaPoints(o) {
        if (o.shape !== 'rect') { return o.polygon || []; }
        var t = deg2rad(o.rotation || 0), c = Math.cos(t), s2 = Math.sin(t);
        var w = o.width || 0, h = o.height || 0;
        var corners = [[0, 0], [w, 0], [w, h], [0, h]];
        return corners.map(function (pt) {
            return {x: pt[0] * c - pt[1] * s2, y: pt[0] * s2 + pt[1] * c};
        });
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
    var content = {
        TERRAIN_TYPES: [], PROP_SIZE: {}, MOB_KIND: {}, MOB_SPEED: {},
        PROFILE_NAMES: [], AIR_PROFILE_NAMES: [], ENUM_VALUES: {},
    };
    function useContent(c) {
        content = {
            TERRAIN_TYPES: (c && c.TERRAIN_TYPES) || [],
            PROP_SIZE: (c && c.PROP_SIZE) || {},
            MOB_KIND: (c && c.MOB_KIND) || {},
            MOB_SPEED: (c && c.MOB_SPEED) || {},
            // The profiles the client can actually resolve, straight out of
            // frontend/src/client-data/terrain-profiles.json and its air
            // sibling (D12). ⭐ TWO lists because they are two NAMESPACES: the
            // ground and the air are separate tables, and holding both is what
            // lets checkProfile say "that is an atmosphere profile" instead of
            // the true but useless "unknown profile". Absent means "no
            // vocabulary loaded", and the unknown-profile check skips itself —
            // the same posture every other content check here takes.
            PROFILE_NAMES: (c && c.PROFILE_NAMES) || [],
            AIR_PROFILE_NAMES: (c && c.AIR_PROFILE_NAMES) || [],
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

    /* ---- per-placement prop scale (plan-prop-scale.md C1) -------------------
     * world.json carries an optional `scale`, a multiplier on the prop TYPE's
     * body. Tiled has no scale concept for an object — it has a BOX — so the
     * multiplier lives in the box the object is drawn at, and resizing a prop
     * in Tiled IS authoring scale. (Before C1 the writer read the box only to
     * recover the centre and threw the size away.)
     *
     * ⚑ The upper rail (MAX_PROP_SCALE) mirrors world/zone.go's MaxPropScale.
     *
     * ⚑ ONE function, consumed by both modelToZone and validateModel — the C6
     * lesson: two copies of a derivation are two chances to rewrite the file.
     *
     * ⚑ An unscaled prop must derive EXACTLY 1 or all 807 existing placements
     * would grow a `scale` key and the file would stop being byte-stable. It
     * does: zoneToModel writes `sz.w * PX * 1` and this divides by the same
     * `sz.w * PX`, and x/x is exactly 1 in IEEE-754 for any finite non-zero x.
     * The fallback size ({w:1,h:1}, used when the generated content is absent)
     * is symmetric between the two directions, so it round-trips too. */
    var MAX_PROP_SCALE = 10;

    function readPropScale(o) {
        var sz = propSize(o.name);
        var s = round(o.width / (sz.w * PX), 3);
        // 1 IS "inherit the type's body", so it normalises back to absent —
        // the same call C6 made for its sentinels, and what keeps an untouched
        // prop serializing exactly as it was authored.
        return s === 1 ? undefined : s;
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
     *   anchor             ""    an empty anchor name is not a name (U3b)
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
        // The per-placement travel destination (plan-underworld.md U3b). Its
        // sentinel is the empty string, which is safe by the same C6 rule the
        // palette records: "" is not an anchor name, so a Tiled that drops a
        // default-valued property and one that keeps it reach the same answer.
        anchor: '',
    };
    var PATROL_INHERIT = 'pingpong';

    // The AuraMobName default. A class member cannot be empty, so a hand-drawn
    // spawn would otherwise silently become whichever mob sorted first. This is
    // not a mob name, so validation refuses the save until one is picked.
    var MOB_UNSET = '(pick a mob)';

    // The AuraProfile default, for exactly the same reason (C2): a region drawn
    // on the canvas and never assigned would otherwise take whichever profile
    // leads the table and repaint that ground silently. Not a profile name, so
    // validation refuses the save until one is picked.
    var PROFILE_UNSET = '(pick a profile)';
    // ⭐ TWO vocabularies since 2026-09-15, one per table. The MEMBER is called
    // 'profile' in both because the ZONE KEY is the same; only the list behind
    // it differs, which is what makes naming 'Forest' on a fog bank impossible
    // in the Properties panel rather than merely wrong on screen.
    // ⚑ `clears` is the THIRD vocabulary on this map and the only one that is
    // not a profile table: an AuraClearing names no profile at all (A4/L7), so
    // its one member points at a closed set of LAYER NAMES instead.
    var REGION_ENUMS = {
        profile: 'AuraProfile', air: 'AuraAtmosphereProfile', clears: 'AuraClears',
    };
    // The closed set zone.go's validate() refuses anything outside
    // (world.ClearsDarkness / ClearsHaze / ClearsBoth). Mirrored here so the
    // editor can say so while the author is still looking at the shape.
    var CLEARS_VALUES = ['darkness', 'haze', 'both'];
    // ⚑ What an ABSENT `clears` means, and it must equal the palette member's
    // own default (generate-palette.mjs) — the C6 rule: a member is safe exactly
    // when a Tiled that DROPS a default-valued property and a Tiled that KEEPS
    // it reach the same answer.
    var CLEARS_DEFAULT = 'both';

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
        out.waypointCount = (o.shape === 'polyline' && o.polygon) ? o.polygon.length : 0;
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
            // Where this zone sits in the shared coordinate space when several
            // are loaded together (plan-underworld.md U1). undefined =
            // {0, 0} and JSON.stringify drops the key, so every zone that
            // authors no origin — which is all of them today — stays
            // byte-identical.
            //
            // ⚑ CARRIED, NOT DRAWN. There is no origin object on any layer:
            // moving a zone by dragging it would move it relative to itself,
            // which is meaningless. It rides as a map property, like the
            // bounds it belongs beside.
            origin: z.origin !== undefined ? z.origin : undefined,
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
                    // undefined = inherit the type's body; JSON.stringify drops
                    // it, so an unscaled prop is byte-identical to before C1.
                    scale: p.scale !== undefined ? round(p.scale, 3) : undefined,
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
                    anchor: s.anchor || undefined,
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
            // Key order follows zone.go's struct order, and the whole object
            // must match ZoneModel.getZoneAsJSON byte for byte.
            regions: z.regions && z.regions.length > 0
                ? z.regions.map(function (r) {
                    return {
                        profile: r.profile,
                        points: r.points.map(function (p2) {
                            return {x: round(p2.x, 2), y: round(p2.y, 2)};
                        }),
                    };
                })
                : undefined,
            // A path's points are never closed in the FILE — a ring repeats no
            // first vertex, exactly as a region's polygon does not; `closed`
            // carries the wraparound instead. blocksMovement and closed are both
            // tri-state: false is the authored default, so an undefined must stay
            // absent or every decorative open path grows two keys nobody wrote.
            paths: z.paths && z.paths.length > 0
                ? z.paths.map(function (p2) {
                    return {
                        profile: p2.profile,
                        points: p2.points.map(function (v) {
                            return {x: round(v.x, 2), y: round(v.y, 2)};
                        }),
                        width: round(p2.width, 2),
                        blocksMovement: p2.blocksMovement ? true : undefined,
                        closed: p2.closed ? true : undefined,
                        outlineProfile: p2.outlineProfile || undefined,
                        outlineWidth: p2.outlineProfile ? round(p2.outlineWidth, 2) : undefined,
                    };
                })
                : undefined,
            // A polygon's points are never closed in the FILE — no first-vertex
            // repeat to strip, exactly as a region's are not. blocksMovement is
            // tri-state like everywhere else.
            polygons: z.polygons && z.polygons.length > 0
                ? z.polygons.map(function (g) {
                    return {
                        profile: g.profile,
                        points: g.points.map(function (v) {
                            return {x: round(v.x, 2), y: round(v.y, 2)};
                        }),
                        blocksMovement: g.blocksMovement ? true : undefined,
                        outlineProfile: g.outlineProfile || undefined,
                        outlineWidth: g.outlineProfile ? round(g.outlineWidth, 2) : undefined,
                    };
                })
                : undefined,
            // The AIR over an area (plan-region-atmosphere.md A0). Points are
            // never closed in the FILE, exactly as a region's and a polygon's
            // are not.
            //
            // ⛔ TWO keys and no third. There is deliberately no blocksMovement
            // and no outline to write (D15) — an atmosphere is air, and zone.go
            // refuses those keys by name, so emitting one would produce a file
            // that no longer boots.
            atmospheres: z.atmospheres && z.atmospheres.length > 0
                ? z.atmospheres.map(function (a) {
                    return {
                        profile: a.profile,
                        points: a.points.map(function (v) {
                            return {x: round(v.x, 2), y: round(v.y, 2)};
                        }),
                    };
                })
                : undefined,
            // The HOLES cut in that air (plan-region-atmosphere.md A4). Its own
            // array for the reason polygons got one despite sharing a layer with
            // paths: two kinds of object, told apart by CLASS, landing in two
            // places.
            //
            // ⛔ TWO keys and NO profile. A clearing paints nothing, so there is
            // nothing to name a look for — zone.go refuses `profile` by name,
            // and emitting one here would write a file that no longer boots.
            clearings: z.clearings && z.clearings.length > 0
                ? z.clearings.map(function (c) {
                    return {
                        clears: c.clears,
                        points: c.points.map(function (v) {
                            return {x: round(v.x, 2), y: round(v.y, 2)};
                        }),
                    };
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

        // ⚑ The box a prop is drawn at is the TYPE's true physics footprint
        // (api/props/*.json body) times the placement's optional scale — so
        // what you see is what blocks movement, at the size it really blocks.
        // Resizing the box IS authoring scale (C1); the writer derives the
        // multiplier straight back out of it.
        var props = (z.props || []).map(function (p2) {
            var sz = propSize(p2.type);
            var sc = (typeof p2.scale === 'number' && p2.scale > 0) ? p2.scale : 1;
            var w = sz.w * PX * sc, h = sz.h * PX * sc;
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
            // A patrolling spawn IS its route: a polyline drawn from the spawn
            // point, one vertex per waypoint. Editing the route is then dragging
            // vertices, which is the whole point.
            //
            // ⭐ EVERY vertex is a waypoint, node 0 included (PO ruling
            // 2026-08-23, plan-prop-scale.md-era Tiled follow-up). Tiled puts
            // node 0 at the object origin when you DRAW, so a fresh route's
            // first waypoint lands on the spawn — a mob starts, and in loop mode
            // returns, home. It used to be dropped as "the origin, not a
            // waypoint", which made N clicks give N-1 waypoints and left the
            // node-0 handle a silent no-op. The engine never had that notion:
            // patrol.go marches the waypoint list and treats the spawn purely as
            // where the mob starts, so both readings were legal — this one is
            // WYSIWYG. ⚑ Nothing forces node 0 to stay on the origin: a route
            // whose first waypoint is elsewhere (5 of the 7 in world.json,
            // hand-authored in the in-game editor) simply serialises with a
            // non-zero first vertex, and round-trips.
            if (s.waypoints && s.waypoints.length > 0) {
                o.shape = 'polyline';
                o.polygon = s.waypoints.map(function (w) {
                    return {x: px(w.x, hw) - o.x, y: px(w.y, hh) - o.y};
                });
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

        // A region IS its outline: a polygon object whose origin sits on the
        // first vertex, so node 0 is {0,0} exactly as Tiled produces when you
        // draw one. Same relative-vertex convention as a patrol polyline.
        //
        // ⚑ The PROFILE is both the object's Name (a readable label in the
        // layer list) and a typed property; readRegion lets the property win,
        // mirroring how a spawn's mob works. C2 turns that property into a
        // generated AuraProfile enum — here it is still free text.
        var regions = (z.regions || []).map(function (r) {
            var pts = r.points || [];
            var ox = pts.length > 0 ? px(pts[0].x, hw) : 0;
            var oy = pts.length > 0 ? px(pts[0].y, hh) : 0;
            return {
                shape: 'polygon', layer: 'regions', name: r.profile, cls: 'AuraRegion',
                x: ox, y: oy, width: 0, height: 0, rotation: 0,
                flipH: false, flipV: false,
                polygon: pts.map(function (p2) {
                    return {x: px(p2.x, hw) - ox, y: px(p2.y, hh) - oy};
                }),
                properties: {profile: r.profile},
                // C2: typed, or the Properties panel degrades to a free-text
                // box — an object-level PLAIN string shadows the class member
                // that declares the enum. Same marker, same reason, as a
                // spawn's mob.
                enums: {profile: REGION_ENUMS.profile},
            };
        });

        // A path IS its centreline: a polyline whose origin sits on the first
        // vertex, exactly like a patrol route and a region outline.
        //
        // ⭐ THE SHAPE IS THE FLAG (plan-zone-polygons.md P1). A polyline is an
        // open path, a polygon is a closed one — there is no `closed` property in
        // the Properties panel, deliberately: an authored bool could contradict
        // the shape it was drawn as, and then the two would disagree about where
        // a road ends. Closure is still only a STROKE either way; the FILLED
        // shape is a class of its own (D1), which is what makes an accidental
        // close in Tiled a one-undo cosmetic slip rather than a lake.
        var paths = (z.paths || []).map(function (p2) {
            var pts = p2.points || [];
            var ox = pts.length > 0 ? px(pts[0].x, hw) : 0;
            var oy = pts.length > 0 ? px(pts[0].y, hh) : 0;
            var o = {
                shape: p2.closed ? 'polygon' : 'polyline',
                layer: 'paths', name: p2.profile, cls: 'AuraPath',
                x: ox, y: oy, width: 0, height: 0, rotation: 0,
                flipH: false, flipV: false,
                polygon: pts.map(function (v) {
                    return {x: px(v.x, hw) - ox, y: px(v.y, hh) - oy};
                }),
                properties: {profile: p2.profile, width: p2.width},
                enums: {profile: REGION_ENUMS.profile},
            };
            // Only when true, so the Properties panel shows the class default
            // for an ordinary path and the round-trip stays byte-identical.
            if (p2.blocksMovement) { o.properties.blocksMovement = true; }
            writeOutline(o, p2);
            return o;
        });

        // ⭐ A polygon rides the SAME LAYER as a path and is told apart by its
        // CLASS (D5). PO ask 2026-09-09: "too many layers in Tiled will make me
        // a little crazy" — eight object layers exist already, and the class is
        // the more honest discriminator anyway, because it is what the
        // Properties panel shows. ⚑ The cost, and it is real: an object on this
        // layer whose class is neither AuraPath nor AuraPolygon lands in NEITHER
        // array and would vanish on save, so validateModel refuses one by id
        // (L2b). The layer-per-type scheme got that check for free.
        var polygons = (z.polygons || []).map(function (g) {
            var pts = g.points || [];
            var ox = pts.length > 0 ? px(pts[0].x, hw) : 0;
            var oy = pts.length > 0 ? px(pts[0].y, hh) : 0;
            var o = {
                shape: 'polygon', layer: 'paths', name: g.profile, cls: 'AuraPolygon',
                x: ox, y: oy, width: 0, height: 0, rotation: 0,
                flipH: false, flipV: false,
                polygon: pts.map(function (v) {
                    return {x: px(v.x, hw) - ox, y: px(v.y, hh) - oy};
                }),
                properties: {profile: g.profile},
                enums: {profile: REGION_ENUMS.profile},
            };
            if (g.blocksMovement) { o.properties.blocksMovement = true; }
            writeOutline(o, g);
            return o;
        });

        // ⭐ An atmosphere gets its OWN LAYER, and it is the one place this file
        // does NOT follow D5's class-discriminator (plan-region-atmosphere.md
        // D16). Two reasons, and the first is decisive: `darkAreas` — the
        // primitive atmosphere retires — already owns a layer, so sharing one
        // would give the successor worse authoring than the thing it replaces.
        // The second is that a polygon sits BESIDE a path while an atmosphere
        // COVERS the walls and roads it darkens, and Tiled toggles visibility
        // per LAYER and never per class — so on a shared layer there would be no
        // way to hide the fog to select the wall underneath.
        //
        // ⛔ NO blocksMovement, NO outline, NO width (D15). An atmosphere is
        // air: a polygon is a wall you walk into, this is what you walk through.
        // The two share a shape and nothing else, and the short property bag
        // here is that ruling where an author can see it.
        // ⛔ enums.profile is REGION_ENUMS.air here, NOT .profile — this is the
        // one writer of the four whose vocabulary is the atmosphere table.
        var atmospheres = (z.atmospheres || []).map(function (a) {
            var pts = a.points || [];
            var ox = pts.length > 0 ? px(pts[0].x, hw) : 0;
            var oy = pts.length > 0 ? px(pts[0].y, hh) : 0;
            return {
                shape: 'polygon', layer: 'atmospheres', name: a.profile, cls: 'AuraAtmosphere',
                x: ox, y: oy, width: 0, height: 0, rotation: 0,
                flipH: false, flipV: false,
                polygon: pts.map(function (v) {
                    return {x: px(v.x, hw) - ox, y: px(v.y, hh) - oy};
                }),
                properties: {profile: a.profile},
                enums: {profile: REGION_ENUMS.air},
            };
        });

        // ⭐ A CLEARING RIDES THE ATMOSPHERES LAYER AND IS TOLD APART BY ITS
        // CLASS (plan-region-atmosphere.md A4) — zone-polygons D5's scheme, not
        // D16's. D16 gave atmosphere a layer of its own because an atmosphere
        // COVERS the walls it darkens and Tiled toggles visibility per layer, so
        // a shared layer would leave no way to hide the fog and select the wall.
        // A clearing is the opposite case: it sits INSIDE the air it cuts, is
        // authored in the same breath, and hiding one to reach the other is
        // never the need. Sharing the layer also keeps the two visible together,
        // which is the only way to see that the hole lands in the bank.
        //
        // ⛔ NO profile member, and the emptiness IS the ruling (L7). A clearing
        // paints nothing; an author reaching for "what colour is my clearing"
        // must find NOTHING rather than a field that quietly means something
        // else. zone.go refuses the key by name.
        var clearings = (z.clearings || []).map(function (c) {
            var pts = c.points || [];
            var ox = pts.length > 0 ? px(pts[0].x, hw) : 0;
            var oy = pts.length > 0 ? px(pts[0].y, hh) : 0;
            return {
                shape: 'polygon', layer: 'atmospheres',
                // ⚑ The NAME is the clears value, so the Objects panel reads
                // "both" / "darkness" rather than a row of blank entries. The
                // typed property is still what modelToZone reads (readClears) —
                // the name is a label, exactly as it is for a region's profile.
                name: c.clears, cls: 'AuraClearing',
                x: ox, y: oy, width: 0, height: 0, rotation: 0,
                flipH: false, flipV: false,
                polygon: pts.map(function (v) {
                    return {x: px(v.x, hw) - ox, y: px(v.y, hh) - oy};
                }),
                properties: {clears: c.clears},
                enums: {clears: REGION_ENUMS.clears},
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
            // undefined when the zone authors no origin, so modelToZone can
            // tell "at {0,0}" apart from "authors nothing" and put the file
            // back exactly as it found it.
            originX: z.origin ? z.origin.x : undefined,
            originY: z.origin ? z.origin.y : undefined,
            layers: [
                // terrain array order IS paint order (GroundTextureManager), so
                // the layer must draw by index or the canvas lies about which
                // piece covers which.
                {name: 'terrain', drawOrder: 'index', objects: terrain},
                {name: 'props', drawOrder: 'index', objects: props},
                {name: 'spawns', drawOrder: 'index', objects: spawns},
                {name: 'campfires', drawOrder: 'index', objects: campfires},
                {name: 'darkAreas', drawOrder: 'index', objects: darkAreas},
                // Region array order is resolution order (D0: the LAST
                // containing region that declares a property wins), so this
                // layer draws by index for the same reason terrain does.
                {name: 'regions', drawOrder: 'index', objects: regions},
                // Path array order is draw order too — a bridge road drawn over
                // a river is authored by putting it later in the array.
                // ⚑ POLYGONS FIRST, then paths — the draw order is regions →
                // polygons → paths (masses under ribbons), and modelToZone
                // splits them back out by class with each array's own order
                // intact, so the round-trip stays byte-identical.
                {name: 'paths', drawOrder: 'index', objects: polygons.concat(paths)},
                // Atmosphere array order is draw order AND resolution order,
                // regions' rule exactly (D0/D3: the last declaring shape wins,
                // and a gloom:0 clearing erases the bank it sits inside), so
                // this layer draws by index for the same reason.
                // ⚑ ATMOSPHERES FIRST, THEN CLEARINGS, and the order is D17
                // rather than cosmetic: a clearing is applied AFTER every
                // atmosphere no matter where it was authored, so laying the
                // layer out that way makes the canvas show the same z-order the
                // client draws and the resolver answers. modelToZone splits them
                // back out by class with each array's own order intact, so the
                // round-trip stays byte-identical — the paths layer's rule
                // exactly.
                {name: 'atmospheres', drawOrder: 'index',
                    objects: atmospheres.concat(clearings)},
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
        // ⚑ The paths layer holds TWO classes since plan-zone-polygons.md D5.
        // Everything that reads it must say which one it wants, or a polygon
        // gets read as a width-less path.
        function onLayer(name, cls) {
            return layer(name).filter(function (o) { return o.cls === cls; });
        }
        function centre(o) { return centreOf(o.x, o.y, o.width, o.height, o.rotation || 0); }

        return {
            name: m.zoneName,
            bounds: {width: m.boundsWidth, height: m.boundsHeight},
            origin: (m.originX !== undefined && m.originX !== null)
                || (m.originY !== undefined && m.originY !== null)
                ? {x: Number(m.originX) || 0, y: Number(m.originY) || 0}
                : undefined,
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
                    scale: readPropScale(o),
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
                    anchor: p.anchor,
                };
                if (o.shape === 'polyline' && o.polygon && o.polygon.length > 0) {
                    s.waypoints = o.polygon.map(function (v) {
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
            regions: layer('regions').map(function (o) {
                return {
                    profile: readRegionProfile(o),
                    points: closedAreaPoints(o).map(function (v) {
                        return {x: u(o.x + v.x, hw), y: u(o.y + v.y, hh)};
                    }),
                };
            }),
            // ⚑ Split by CLASS, not by layer (D5). An object that is neither is
            // refused by validateModel before it can reach here, which is what
            // stops it from silently vanishing.
            paths: onLayer('paths', 'AuraPath').map(function (o) {
                var w = get(o, 'width');
                return {
                    profile: readRegionProfile(o),
                    points: (o.polygon || []).map(function (v) {
                        return {x: u(o.x + v.x, hw), y: u(o.y + v.y, hh)};
                    }),
                    width: typeof w === 'number' ? w : 0,
                    blocksMovement: get(o, 'blocksMovement') ? true : undefined,
                    // ⚑ Read off the SHAPE, never off a property — see the
                    // matching note in zoneToModel. get(o, 'closed') would be a
                    // second source of truth for something Tiled already knows.
                    closed: o.shape === 'polygon' ? true : undefined,
                    outlineProfile: readOutlineProfile(o),
                    outlineWidth: readOutlineProfile(o) !== undefined
                        ? (typeof get(o, 'outlineWidth') === 'number' ? get(o, 'outlineWidth') : 0)
                        : undefined,
                };
            }),
            polygons: onLayer('paths', 'AuraPolygon').map(function (o) {
                return {
                    profile: readRegionProfile(o),
                    points: closedAreaPoints(o).map(function (v) {
                        return {x: u(o.x + v.x, hw), y: u(o.y + v.y, hh)};
                    }),
                    blocksMovement: get(o, 'blocksMovement') ? true : undefined,
                    outlineProfile: readOutlineProfile(o),
                    outlineWidth: readOutlineProfile(o) !== undefined
                        ? (typeof get(o, 'outlineWidth') === 'number' ? get(o, 'outlineWidth') : 0)
                        : undefined,
                };
            }),
            // ⚑ Read by LAYER, not by class (D16) — so unlike the paths layer
            // this one needs no onLayer() split and cannot lose an object to a
            // class it does not recognise.
            //
            // ⛔ Two keys out, two keys in. If a future reader is tempted to add
            // blocksMovement here "for symmetry with polygons": don't. The
            // server refuses the key by name, so it would round-trip into a zone
            // file that no longer boots.
            atmospheres: onLayer('atmospheres', 'AuraAtmosphere').map(function (o) {
                return {
                    profile: readRegionProfile(o),
                    points: closedAreaPoints(o).map(function (v) {
                        return {x: u(o.x + v.x, hw), y: u(o.y + v.y, hh)};
                    }),
                };
            }),
            // ⭐ The SECOND class on this layer since A4, read by class for the
            // same reason the paths layer's two are: an object read as the wrong
            // kind comes back profile-less or clears-less, and both are silent.
            clearings: onLayer('atmospheres', 'AuraClearing').map(function (o) {
                return {
                    clears: readClears(o),
                    points: closedAreaPoints(o).map(function (v) {
                        return {x: u(o.x + v.x, hw), y: u(o.y + v.y, hh)};
                    }),
                };
            }),
            anchors: layer('anchors').map(function (o) {
                return {name: o.name, x: u(o.x, hw), y: u(o.y, hh)};
            }),
        };
    }

    // ⚑ The typed property wins over the object's Name, which is only a
    // readable label — the same rule readSpawn applies to a spawn's mob, and
    // the same GUI defect it exists for: a plain-string property SHADOWS a
    // typed class member, and a typed enum reads back as an INDEX.
    /* The outline pair (plan-zone-polygons.md D3), shared by paths and polygons
     * because they carry exactly the same two keys.
     *
     * ⚑ PROFILE_UNSET means two different things depending on which member it is
     * on, and that is deliberate rather than sloppy: on `profile` it means "you
     * forgot" and is refused; on `outlineProfile` it means "no outline" and is
     * perfectly legal. Both members share one enum type because Tiled has no
     * nullable enum, so the sentinel has to carry the difference.
     */
    function writeOutline(o, src) {
        if (!src.outlineProfile) { return; }
        o.properties.outlineProfile = src.outlineProfile;
        o.properties.outlineWidth = src.outlineWidth;
        o.enums = o.enums || {};
        o.enums.outlineProfile = REGION_ENUMS.profile;
    }

    function readOutlineProfile(o) {
        var v = o.properties && o.properties.outlineProfile !== undefined
            && o.properties.outlineProfile !== null
            ? plainValue(o.properties.outlineProfile) : undefined;
        if (v === undefined || v === '' || v === PROFILE_UNSET) { return undefined; }
        return v;
    }

    function readRegionProfile(o) {
        var v = o.properties && o.properties.profile !== undefined && o.properties.profile !== null
            ? plainValue(o.properties.profile) : undefined;
        return v !== undefined ? v : o.name;
    }

    /* Which layers an AuraClearing cuts (A4).
     *
     * ⚑ It falls back to CLEARS_DEFAULT and NOT to o.name, which is where it
     * parts company with readRegionProfile above. A profile has no sensible
     * default — a region that names none is an authoring mistake and the save
     * refuses it — but `clears` has exactly one: the palette member's own
     * default. Tiled is free to DROP a property still sitting at its default,
     * so reading absent as anything else would turn a freshly drawn clearing
     * into a different clearing on its first save.
     *
     * ⛔ An empty string is NOT absent. A member explicitly blanked is an
     * authoring mistake, and validateModel refuses it by id — quietly promoting
     * it to the default would hide the thing the author needs to see. */
    function readClears(o) {
        var v = o.properties && o.properties.clears !== undefined && o.properties.clears !== null
            ? plainValue(o.properties.clears) : undefined;
        return v !== undefined ? v : CLEARS_DEFAULT;
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
    // ⚑ A loop, not Array.prototype.indexOf: Tiled runs QJSEngine and the rest
    // of this file already takes that posture (see whereElse below).
    function hasValue(list, value) {
        for (var i = 0; i < list.length; i++) { if (list[i] === value) { return true; } }
        return false;
    }

    // "Tree" on the spawns layer is not a typo, it is a layer mistake — and the
    // vocabularies already to hand can say so. This is the whole reason the
    // chunk exists, so the message earns its length.
    function whereElse(name) {
        if (has(content.PROP_SIZE, name)) { return 'prop type'; }
        if (has(content.MOB_KIND, name)) { return 'mob'; }
        if (hasValue(content.TERRAIN_TYPES, name)) { return 'ground texture'; }
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

    /* ---- the non-blocking polygon notice (plan-zone-polygons.md D6) --------
     *
     * ⭐ The server never REFUSES an oversized polygon — PO 2026-09-09, an
     * authoring session must not be stoppable by having drawn a big rock. It
     * raises that one polygon's cell size until it fits and boots. The accepted
     * cost is that the rock's collision is blockier than every other rock's and
     * NOTHING ON SCREEN SAYS SO, so this exists to say it while the author is
     * still standing on the shape.
     *
     * ⛔ It must NOT re-implement the greedy fill. Two copies of one algorithm in
     * two languages is the drift trap this codebase keeps naming, and the copy
     * that drifts is always the one nobody runs. This reports a deliberately
     * CONSERVATIVE proxy — area ÷ cell², no merging — and the wording says so:
     * the editor warns EARLY, the server decides. The two numbers will disagree,
     * and the message must not pretend otherwise.
     */
    // ⚑ Mirrors the Go constants in world/polygons_collision.go, which are the
    // authority. They are [PLACEHOLDER] on both sides; a disagreement makes this
    // notice fire at the wrong size, never the collider wrong.
    var POLY_CELL = 2;
    var POLY_BODY_CAP = 256;

    function polygonNotices(m) {
        var notes = [];
        for (var li = 0; li < m.layers.length; li++) {
            if (m.layers[li].name !== 'paths') { continue; }
            var objs = m.layers[li].objects || [];
            for (var i = 0; i < objs.length; i++) {
                var o = objs[i];
                if (o.cls !== 'AuraPolygon') { continue; }
                if (!(o.properties && o.properties.blocksMovement)) { continue; }
                var pts = o.polygon || [];
                if (pts.length < 3) { continue; }
                // Shoelace, in Tiled PIXELS, then back to world units.
                var a2 = 0;
                for (var k = 0; k < pts.length; k++) {
                    var b = pts[(k + 1) % pts.length];
                    a2 += pts[k].x * b.y - b.x * pts[k].y;
                }
                var area = Math.abs(a2) / 2 / (PX * PX);
                var cells = Math.ceil(area / (POLY_CELL * POLY_CELL));
                if (cells > POLY_BODY_CAP) {
                    notes.push('paths #' + (o.id !== undefined ? o.id : '?')
                        + (o.name ? ' "' + o.name + '"' : '')
                        + ': this blocking polygon is large (~' + Math.round(area)
                        + ' sq units, roughly ' + cells + ' cells at ' + POLY_CELL
                        + 'u against a cap of ' + POLY_BODY_CAP + '). The server will'
                        + ' COARSEN its collision to fit and boot normally, so it will'
                        + ' block more bluntly than other shapes. This is a rough'
                        + ' estimate that ignores merging — the server decides, and'
                        + ' will report a smaller number. Split the shape if the'
                        + ' bluntness matters.');
                }
            }
        }
        return notes;
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
        // ⚑ The paths layer holds TWO classes since plan-zone-polygons.md D5.
        // Everything that reads it must say which one it wants, or a polygon
        // gets read as a width-less path.
        function onLayer(name, cls) {
            return layer(name).filter(function (o) { return o.cls === cls; });
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
        // A boxed object gets its identity from the TILE it carries, so one
        // drawn with the rectangle tool has no identity at all. Same confusion
        // as a bare point on the spawns layer, same kind of answer.
        function fromTileset(o, i, which, set) {
            bad(o, i, 'this has no type — it was drawn as a plain shape rather than dragged'
                + ' from the ' + set + ' tileset. Delete it and drag a ' + which + ' from the'
                + ' tileset panel instead; the tile is what says what it is');
        }

        var terrainKnown = content.TERRAIN_TYPES.length > 0;
        layer('terrain').forEach(function (o, i) {
            if (!o.name) {
                fromTileset(o, i, 'texture', 'aura-terrain');
            } else if (terrainKnown && whereElse(o.name) !== 'ground texture') {
                bad(o, i, unknownName('terrain', o.name, 'ground texture'));
            }
            if (!(o.width > 0)) { bad(o, i, 'size must be positive'); }
            if (o.flipH && o.flipV) {
                bad(o, i, 'world.json has no both-axes flip; use one flip plus 180° of rotation');
            }
        });

        var propsKnown = Object.keys(content.PROP_SIZE).length > 0;
        layer('props').forEach(function (o, i) {
            var known = true;
            if (!o.name) {
                fromTileset(o, i, 'prop', 'aura-props');
                known = false;
            } else if (propsKnown && !has(content.PROP_SIZE, o.name)) {
                bad(o, i, unknownName('props', o.name, 'prop type'));
                known = false;
            }
            // The scale checks need the type's real footprint to divide by, so
            // they only run once the name resolves — otherwise propSize's
            // {w:1,h:1} fallback would turn every box into a nonsense multiple.
            if (!known || !propsKnown) { return; }

            var sc = readPropScale(o);
            if (sc !== undefined && (!(sc > 0) || sc > MAX_PROP_SCALE)) {
                bad(o, i, 'scale ' + sc + ' must be in (0, ' + MAX_PROP_SCALE + '] —'
                    + ' a prop is sized by resizing its box, and this one is '
                    + (sc > MAX_PROP_SCALE ? sc + '× the body of its type' : 'not a positive size'));
            }
            // world.json carries ONE multiplier, so a box dragged out of
            // proportion would silently lose an axis. Same call as the dark
            // area's circle check, and the same fix: hold Shift.
            var sz = propSize(o.name);
            var expectedH = sz.h * PX * (sc === undefined ? 1 : sc);
            if (Math.abs(o.height - expectedH) > 0.5) {
                bad(o, i, 'must keep its proportions (' + Math.round(o.width) + '×'
                    + Math.round(o.height) + ' px, expected ' + Math.round(o.width) + '×'
                    + Math.round(expectedH) + ') — world.json has one uniform scale,'
                    + ' so hold Shift while resizing');
            }
        });

        var mobsKnown = Object.keys(content.MOB_KIND).length > 0;
        layer('spawns').forEach(function (o, i) {
            // ⚑ A route is a POLYLINE. Until regions existed a polygon drawn
            // here was quietly read as one; now that the two shapes are
            // distinct, an unrefused polygon would drop its waypoints in
            // silence. Refusing the save is the whole point of this pass.
            if (o.shape === 'polygon') {
                bad(o, i, 'a patrol route must be a POLYLINE, not a closed polygon — redraw it'
                    + ' with the polyline tool, or its waypoints are lost on save');
            }
            // ⚑ Through readSpawn, never off the raw properties: every
            // inheriting spawn carries `level: 0` and `wanderRadius: -1`, and
            // range-checking those raw would flag ~226 healthy spawns.
            var p = readSpawn(o);
            var known = !mobsKnown || has(content.MOB_KIND, p.mob);
            if (p.mob === MOB_UNSET) {
                bad(o, i, 'no mob chosen yet — pick one in the Properties panel ("mob")');
                known = false;
            } else if (!p.mob) {
                // A freshly drawn point has no name, no class and no properties,
                // so the form never appeared. Say how to make it appear rather
                // than reporting an unknown mob named "".
                bad(o, i, 'this spawn has no mob. Set its Class (Properties panel, top row) to'
                    + ' AuraSpawnCombat / AuraSpawnTalker / AuraSpawnFixture /'
                    + ' AuraSpawnCompanion — that is what brings up the spawn form — then'
                    + ' pick a "mob" from the dropdown');
                known = false;
            } else if (!known) {
                bad(o, i, unknownName('spawns', p.mob, 'mob'));
            }

            var waypoints = p.waypointCount;
            if (waypoints === 1) {
                bad(o, i, 'a route needs at least 2 waypoints — the polyline needs a second point');
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
        campfires.forEach(function (o, i) {
            var id = String(o.name || '').replace(/^\s+|\s+$/g, '');
            if (!id) { bad(o, i, 'id must not be empty (the object\'s Name is the campfire id)'); }
            else if (seenFire[id]) { bad(o, i, 'duplicate spawn point id "' + id + '"'); }
            seenFire[id] = true;
        });
        /* ⛔ "at least one campfire is a startingSpawn" USED TO BE CHECKED HERE and
         * cannot be any more (plan-underworld.md U1/L4). The server moved it from
         * per-FILE to per-SET (world.Place checkSetWide) the moment more than one
         * zone could load: a cave nobody binds in legitimately carries campfires
         * with no starting spawn, while the WORLD still must have somewhere to put
         * a fresh character.
         *
         * ⚑ Tiled edits ONE file, so it simply cannot answer a question about the
         * set — keeping the old rule here refused to save every legal cave. The
         * invariant is NOT weakened: aurad still hard-fails at boot, only later
         * and with the whole set in scope, which is the only scope it is true at.
         *
         * ⚑ Duplicate ids stay checked above, deliberately: those are a per-file
         * question too (the SET-wide half is checkSetWide's L5), and catching the
         * cheap half at save time still beats catching it at boot. */

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

        // Mirrors zone.go's region checks (§4.6), plus the one check the server
        // deliberately does not make (D8): the profile NAME.
        //
        // ⭐ C2 is what makes that possible. zone.go accepts any non-empty name
        // because the profile table lives in the client, so a typo reaches the
        // browser and resolves to the default (D11) — the region simply does
        // not paint, at load, with nothing said anywhere. The generated
        // AuraProfile enum is that vocabulary, so the typo becomes an error
        // where it was written, naming the object id.
        //
        // ⚑ Skipped when no palette is loaded, exactly like every other content
        // check here: the converter stays usable (and testable) without one.
        var profilesKnown = content.PROFILE_NAMES.length > 0;

        // ⭐ WHICH TABLE this shape’s profile must come from. Ground and air are
        // separate namespaces (2026-09-15), so the check needs to know which one
        // it is holding — and the payoff is the MESSAGE: naming an atmosphere
        // profile on a region used to read "unknown profile", which is true and
        // useless. Now it says where the name actually lives.
        function vocabulary(air) {
            return {
                names: air ? (content.AIR_PROFILE_NAMES || []) : content.PROFILE_NAMES,
                other: air ? content.PROFILE_NAMES : (content.AIR_PROFILE_NAMES || []),
                file: air ? 'atmosphere-profiles.json' : 'terrain-profiles.json',
                otherFile: air ? 'terrain-profiles.json' : 'atmosphere-profiles.json',
                otherKind: air ? 'a terrain' : 'an atmosphere',
            };
        }

        function checkProfile(o, i, known, air) {
            var v = vocabulary(air);
            var profile = String(readRegionProfile(o) || '').replace(/^\s+|\s+$/g, '');
            if (!profile) {
                bad(o, i, 'profile must not be empty');
            } else if (profile === PROFILE_UNSET) {
                // Its own message: "you have not picked one yet" and "that name
                // does not exist" are different mistakes with different fixes.
                bad(o, i, 'no profile chosen — "' + PROFILE_UNSET + '" is the placeholder,'
                    + ' not a profile. Pick one in the Properties panel');
            } else if (known && hasValue(v.other, profile)) {
                // ⭐ THE MESSAGE THE SPLIT EXISTS FOR. The dropdown no longer
                // offers this, so reaching it means a hand-edited file or a stale
                // palette — and both of those this names exactly.
                bad(o, i, '"' + profile + '" is ' + v.otherKind + ' profile (it lives in'
                    + ' frontend/src/client-data/' + v.otherFile + '), and this shape'
                    + ' needs one from ' + v.file + '. The two are separate'
                    + ' vocabularies: ' + v.names.join(', '));
            } else if (known && !hasValue(v.names, profile)) {
                bad(o, i, 'unknown profile "' + profile + '" — the profiles are: '
                    + v.names.join(', ') + '. Add it to'
                    + ' frontend/src/client-data/' + v.file + ' and re-run'
                    + ' node tools/tiled/generate-palette.mjs, or pick an existing one');
            }
        }
        layer('regions').forEach(function (o, i) {
            checkProfile(o, i, profilesKnown);
            checkClosedArea(o, i, 'a region');
        });

        // ⭐ THE SHARED LAYER'S OWN CHECK (L2b, the one cost of D5). Two classes
        // live here and modelToZone routes by class, so an object that is
        // NEITHER lands in neither array and vanishes on the next save with
        // every other check green. This is the only thing that says so, and the
        // layer-per-type scheme got it for free.
        layer('paths').forEach(function (o, i) {
            if (o.cls !== 'AuraPath' && o.cls !== 'AuraPolygon') {
                bad(o, i, 'is on the paths layer but its Class is '
                    + (o.cls ? '"' + o.cls + '"' : 'not set')
                    + ' — this layer holds AuraPath (a stroked line) and AuraPolygon'
                    + ' (a filled area), and anything else is DROPPED on save.'
                    + ' Set the Class in the Properties panel');
            }
        });

        // ⚑ The outline pair is ALL-OR-NOTHING, and both half-authored forms
        // fail SILENTLY: a named profile with no width strokes zero pixels, a
        // width with no profile strokes nothing at all. Either one looks exactly
        // like the outline feature not working, which is why they are refused
        // here rather than absorbed. Mirrors validateOutline in world/zone.go.
        layer('paths').forEach(function (o, i) {
            var op = prop(o, 'outlineProfile');
            var ow = prop(o, 'outlineWidth');
            var named = op !== undefined && plainValue(op) !== ''
                && plainValue(op) !== PROFILE_UNSET;
            var w = typeof ow === 'number' ? ow : 0;
            if (named && w <= 0) {
                bad(o, i, 'outlineProfile is set but outlineWidth is ' + w
                    + ' — a zero-wide outline draws nothing. Give it a width, or'
                    + ' put outlineProfile back to "' + PROFILE_UNSET + '"');
            } else if (!named && w !== 0) {
                bad(o, i, 'outlineWidth is ' + w + ' but no outlineProfile is chosen'
                    + ' — the width draws nothing on its own. Pick an outline profile,'
                    + ' or set the width back to 0');
            }
            // ⚑ An outline is a GROUND surface even on a shape that is not: it
            // strokes the boundary, so it reads from the terrain table like every
            // other painted edge.
            if (named && profilesKnown && !hasValue(content.PROFILE_NAMES, plainValue(op))) {
                bad(o, i, 'unknown outline profile "' + plainValue(op) + '" — known profiles are: '
                    + content.PROFILE_NAMES.join(', '));
            }
        });

        // Polygons carry the same profile vocabulary and get the same messages.
        onLayer('paths', 'AuraPolygon').forEach(function (o, i) {
            checkProfile(o, i, profilesKnown);
            checkClosedArea(o, i, 'an AuraPolygon',
                ' — or change its Class to AuraPath if you meant a line');
        });

        // Paths carry the SAME profile vocabulary as regions, so the same three
        // profile mistakes get the same three messages, from the same function.
        onLayer('paths', 'AuraPath').forEach(function (o, i) {
            checkProfile(o, i, profilesKnown);
            var n = (o.polygon || []).length;
            // ⭐ BOTH shapes are legal here, and which one it is IS the closed
            // flag (plan-zone-polygons.md P1). A polygon strokes a ring — a moat,
            // a ring road — it does not fill one; filling is AuraPolygon's job.
            if (o.shape !== 'polyline' && o.shape !== 'polygon') {
                bad(o, i, 'must be a POLYLINE or a POLYGON — a path is a line, and any'
                    + ' other shape is dropped on save');
            } else if (o.shape === 'polygon' && n < 3) {
                bad(o, i, 'a closed path needs at least 3 points to make a ring, has ' + n
                    + ' — draw it with the polyline tool if it is meant to be open');
            } else if (n < 2) {
                bad(o, i, 'needs at least 2 points to draw a line, has ' + n);
            }
            // ⚑ prop(), not get(): get() is modelToZone's local reader and does
            // not exist in this scope. Using it here threw "get is not defined"
            // on every save from Tiled, and no test caught it because nothing
            // drove validateModel over a path.
            var w = prop(o, 'width');
            if (w === undefined) {
                bad(o, i, 'width is not set — a path needs a width in world units.'
                    + ' Was this drawn with the plain polyline tool rather than as'
                    + ' an AuraPath?');
            } else {
                num(o, i, 'width', w, function (v) { return v > 0; },
                    'a positive number of world units');
            }
        });

        /* ⭐ THE CHECK THE ATMOSPHERES LAYER DID NOT HAVE, and its absence is how
         * a zone that Tiled saved happily refused the next boot (2026-09-14):
         * three atmospheres went to disk with "points": [] and aurad died on
         * "needs at least 3 points to enclose an area, got 0". Every other shape
         * layer had a leg; this one was added without one.
         *
         * ⛔ That is the whole point of save-time validation — catch what the
         * server would reject while the author is still looking at the object —
         * so a new shape layer without a leg here is a boot waiting to break.
         */
        function checkClosedArea(o, i, what, hint) {
            if (o.shape !== 'polygon' && o.shape !== 'rect') {
                bad(o, i, what + ' must be a POLYGON or a RECTANGLE — it encloses an'
                    + ' AREA, and ' + aOrAn(o.shape || 'shape') + ' has no inside to fill.'
                    + ' Draw it with the polygon or the rectangle tool'
                    + (hint || ''));
                return;
            }
            // ⛔ A rect ALWAYS yields four corners, so the point count cannot catch a
            // rectangle with no size — its four corners are the same point, the area
            // is zero, and the server's own "at least 3 points" rule waves it
            // through. That is WORSE than the empty-polygon crash it replaces: the
            // shape boots, draws nothing, blocks nothing, and says nothing. Measure
            // the size instead.
            if (o.shape === 'rect' && (Math.abs(o.width || 0) < 1 || Math.abs(o.height || 0) < 1)) {
                bad(o, i, what + ' is a rectangle with no size (' + (o.width || 0) + ' x '
                    + (o.height || 0) + ' px) — it encloses nothing. Drag it out, or delete it');
                return;
            }
            var n = closedAreaPoints(o).length;
            if (n < 3) {
                bad(o, i, what + ' needs at least 3 points to enclose an area, has ' + n
                    + ' — the polygon tool needs its nodes placed, or use the'
                    + ' rectangle tool instead');
            }
        }

        /* ⭐ THE SHARED LAYER'S OWN CHECK, second application (L2b). A4 put a
         * SECOND class on the atmospheres layer, so this layer now carries the
         * same cost the paths layer has carried since zone-polygons D5: an
         * object that is NEITHER class lands in neither array and VANISHES on
         * the next save with every other check green.
         *
         * ⛔ It is worth stating plainly that this check did not exist here
         * before A4 and did not need to — modelToZone read the layer whole. The
         * moment a class becomes a discriminator the layer needs a guard, and
         * the atmospheres layer has now been through the OTHER version of this
         * lesson too: it shipped without a closed-area leg at all, and that is
         * what let a vertex-less shape refuse the PO's boot (2026-09-14).
         */
        layer('atmospheres').forEach(function (o, i) {
            if (o.cls !== 'AuraAtmosphere' && o.cls !== 'AuraClearing') {
                bad(o, i, 'is on the atmospheres layer but its Class is '
                    + (o.cls ? '"' + o.cls + '"' : 'not set')
                    + ' — this layer holds AuraAtmosphere (air that PAINTS) and'
                    + ' AuraClearing (a hole that ERASES), and anything else is'
                    + ' DROPPED on save. Set the Class in the Properties panel');
            }
        });

        onLayer('atmospheres', 'AuraAtmosphere').forEach(function (o, i) {
            checkProfile(o, i, profilesKnown, true);
            checkClosedArea(o, i, 'an atmosphere',
                ' — or change its Class to AuraClearing if you meant a hole');
        });

        /* ⛔ THE CLEARS VALUE IS REFUSED, NEVER DEFAULTED, and that asymmetry
         * with readClears is deliberate. An ABSENT property is Tiled dropping a
         * value still at its default, which is invisible to the author and must
         * round-trip — so readClears supplies it. An property that is PRESENT
         * and wrong is the author having typed something, and a clearing that
         * silently cleared nothing looks on screen exactly like one drawn in the
         * wrong place. zone.go refuses the same set at boot; this says so hours
         * earlier, next to the shape.
         */
        onLayer('atmospheres', 'AuraClearing').forEach(function (o, i) {
            var raw = o.properties && o.properties.clears !== undefined
                && o.properties.clears !== null ? plainValue(o.properties.clears) : undefined;
            if (raw !== undefined && !hasValue(CLEARS_VALUES, raw)) {
                bad(o, i, 'clears ' + JSON.stringify(raw) + ' must be one of '
                    + CLEARS_VALUES.join(', ') + ' — which layers should this hole cut?');
            }
            checkClosedArea(o, i, 'an AuraClearing',
                ' — or change its Class to AuraAtmosphere if you meant air that paints');
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
        polygonNotices: polygonNotices,
        formatErrors: formatErrors,
        SPAWN_INHERIT: SPAWN_INHERIT,
        SPAWN_ENUMS: SPAWN_ENUMS,
        plainValue: plainValue,
        PATROL_INHERIT: PATROL_INHERIT,
        MOB_UNSET: MOB_UNSET,
        PROFILE_UNSET: PROFILE_UNSET,
        REGION_ENUMS: REGION_ENUMS,
        readSpawn: readSpawn,
    };
})();

if (typeof module === 'object' && module.exports) { module.exports = AuraConvert; }
