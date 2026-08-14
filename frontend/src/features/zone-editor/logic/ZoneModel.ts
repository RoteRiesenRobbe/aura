/**
 * Pure zone data model for the in-game zone editor (world foundation chunk 5).
 *
 * Mirrors the backend's world.Zone schema (backend/pkg/aura/world/zone.go).
 * ALL coordinates and radii in this model are SERVER UNITS ("Points"), never
 * pixels — conversion happens at the interaction/render boundary in ZoneEditor.
 * The backend parses zone.json with DisallowUnknownFields, so the serialized
 * field set here must match the Go structs exactly.
 */

export interface ZoneBounds {
    width: number;
    height: number;
}

export interface ZoneTerrain {
    type: string;
    x: number;
    y: number;
    size: number;
    rotation: number; // radians
    flipped: 'none' | 'horizontal' | 'vertical';
}

export interface ZoneProp {
    type: string;
    x: number;
    y: number;
    rotation: number; // radians
    blocksMovement: boolean;
}

export interface ZoneWaypoint {
    x: number;
    y: number;
}

export interface ZoneSpawn {
    mob: string;
    x: number;
    y: number;
    angle: number; // radians
    respawnTicks: number;
    respawnVariancePct: number;
    // Idle-movement archetype (mob-depth chunk 5 + pacing rework).
    // wanderRadius is TRI-STATE: undefined = inherit the mob type's default
    // (factors.wanderRadius), explicit 0 = stationary override, > 0 = wander
    // with that radius (mutually exclusive with waypoints). idleSpeedFactor
    // overrides the type's idle pace (undefined = inherit; (0, 1]).
    // waypoints non-empty = route patrol; patrolMode 'loop' wraps last→first
    // (circling a landmark), undefined/'pingpong' reverses at the ends.
    // The serializer omits undefined/default values so pre-chunk-5 zones
    // round-trip diff-clean — but an explicit 0 radius IS exported.
    wanderRadius?: number;
    idleSpeedFactor?: number;
    // ABSOLUTE per-spawn level override (plan-mob-levels.md C3, D1) — the mob
    // placed here stands at it, and HP, damage and kill XP all follow.
    // undefined = inherit the species curveLevel, which is the overwhelming
    // majority of spawns and must serialize exactly as before. Integer >= 1;
    // the backend rejects 0 because Mob.spawnLevel encodes "no override" as 0.
    // ⚑ It is deliberately NOT pre-filled from the species value anywhere:
    // copying the default in would freeze inheritance into a snapshot (L6).
    level?: number;
    waypoints?: ZoneWaypoint[];
    patrolMode?: 'pingpong' | 'loop';
}

// A fixed world campfire position (atmosphere & recovery chunk 2) — a plain
// point; the heal fixture itself is defined by the Campfire mob def.
// startingSpawn marks the new-player spawn fire (intermission ① item 16); the
// backend hard-fails at boot unless exactly one campfire in a zone carries it,
// so it must survive editor round-trips.
export interface ZoneCampfire {
    // Stable spawn-point identity. A character's campfire bind is persisted as
    // this string, so it must survive editor round-trips and must never be
    // handed to a different fire — see mintSpawnPointId. The backend hard-fails
    // at boot on a missing or duplicate id.
    id: string;
    x: number;
    y: number;
    startingSpawn?: boolean;
}

// A circle of constant darkness (atmosphere & recovery chunk 3) — purely
// client-visual; the radius is the outer (soft) edge of the dark pocket.
export interface ZoneDarkArea {
    x: number;
    y: number;
    radius: number;
}

// NPCs have no editor type of their own since the actor merge
// (plan-entity-model.md chunk 3a): they are ordinary mob definitions placed as
// ordinary spawns, so the spawn tool authors them and their conversation lives
// in api/mobs/*.json — like every mob's skills, drops and resistances already
// did.

// Named point an encounter script looks up at boot (content pass C6) — the
// editor owns WHERE (boss home, totem spots, wave mouth), the Go script owns
// WHAT happens. Names must stay in sync with the script's lookups: the server
// hard-fails at boot on a missing anchor.
export interface ZoneAnchor {
    name: string;
    x: number;
    y: number;
}

export interface ZoneData {
    name: string;
    bounds: ZoneBounds;
    terrain: ZoneTerrain[];
    props: ZoneProp[];
    spawns: ZoneSpawn[];
    // Omitted when empty so pre-step-3 zones round-trip diff-clean.
    campfires?: ZoneCampfire[];
    darkAreas?: ZoneDarkArea[];
    // Omitted when empty so pre-step-5 zones round-trip diff-clean.
    // Omitted when empty so pre-C6 zones round-trip diff-clean.
    anchors?: ZoneAnchor[];
}

// The spawn editor's derived category (plan-zone-editor-structure.md D1):
// computed from fields every mob def already carries, never authored. It
// drives three display surfaces (picker grouping, marker colour, and, from
// C2, which controls show), and nothing else: no data behaviour reads it.
export type MobKind = 'combat' | 'talker' | 'fixture' | 'companion' | 'legacy';

// The minimal structural shape kindOf needs, decoupled from how the defs got
// into the browser (ZoneEditor's require.context cannot be imported under
// vitest, which is why this rule lives here).
export interface MobKindDef {
    role?: string;
    legacy?: boolean;
    interaction?: object;
}

export function kindOf(def: MobKindDef): MobKind {
    // Legacy first is deliberate and temporary: Brazier is BOTH legacy and
    // structure, and the ten legacy defs must read as one block until C3
    // deletes them; this branch goes with them.
    if (def.legacy === true) {
        return 'legacy';
    }
    if (def.interaction != null) {
        return 'talker';
    }
    if (def.role === 'structure') {
        return 'fixture';
    }
    if (def.role === 'follower') {
        return 'companion';
    }
    // The common case: 36 defs author no role at all, and unrecognized role
    // values (e.g. "creature") fall through here rather than throw.
    return 'combat';
}

// spawnPointNumber reads the <n> out of "spawnpoint-<n>", or 0 for any id that
// is not in that shape — a hand-authored name is legal, it just does not
// participate in the numbering.
function spawnPointNumber(id: string): number {
    let match = /^spawnpoint-(\d+)$/.exec(id || '');
    return match === null ? 0 : parseInt(match[1], 10);
}

function round(value: number, digits: number): number {
    const factor = Math.pow(10, digits);
    return Math.round(value * factor) / factor;
}

export class ZoneModel {
    name: string;
    bounds: ZoneBounds;
    // terrain is a serialization slot filled at export time from the live
    // GroundTextureManager store (the editor renders/edits terrain there, in
    // pixels). Kept here so getZoneAsJSON is the single whole-zone serializer.
    terrain: ZoneTerrain[];
    props: ZoneProp[];
    spawns: ZoneSpawn[];
    campfires: ZoneCampfire[];
    darkAreas: ZoneDarkArea[];
    anchors: ZoneAnchor[];
    // 0 until the first mint, which seeds it from the loaded zone.
    private nextSpawnPointNumber: number = 0;

    constructor(name: string, bounds: ZoneBounds, terrain: ZoneTerrain[], props: ZoneProp[], spawns: ZoneSpawn[], campfires: ZoneCampfire[], darkAreas: ZoneDarkArea[], anchors: ZoneAnchor[]) {
        this.name = name;
        this.bounds = bounds;
        this.terrain = terrain;
        this.props = props;
        this.spawns = spawns;
        this.campfires = campfires;
        this.darkAreas = darkAreas;
        this.anchors = anchors;
    }

    static fromJSON(data: ZoneData): ZoneModel {
        return new ZoneModel(
            data.name,
            {width: data.bounds.width, height: data.bounds.height},
            (data.terrain || []).map(t => ({...t})),
            (data.props || []).map(p => ({...p})),
            // wanderRadius/idleSpeedFactor/patrolMode keep their tri-state:
            // absent stays undefined (= inherit), explicit values survive.
            (data.spawns || []).map(s => ({
                ...s,
                waypoints: (s.waypoints || []).map(w => ({...w})),
            })),
            (data.campfires || []).map(c => ({...c})),
            (data.darkAreas || []).map(d => ({...d})),
            (data.anchors || []).map(a => ({...a})),
        );
    }

    addProp(prop: ZoneProp): number {
        return this.props.push(prop) - 1;
    }

    addSpawn(spawn: ZoneSpawn): number {
        return this.spawns.push(spawn) - 1;
    }

    updateProp(index: number, prop: ZoneProp) {
        this.props[index] = prop;
    }

    updateSpawn(index: number, spawn: ZoneSpawn) {
        this.spawns[index] = spawn;
    }

    removeProp(index: number) {
        this.props.splice(index, 1);
    }

    removeSpawn(index: number) {
        this.spawns.splice(index, 1);
    }

    // The id is minted HERE rather than at the call site so no path can add a
    // fire without one — a campfire with no id fails zone validation at boot.
    addCampfire(campfire: ZoneCampfire): number {
        return this.campfires.push({...campfire, id: campfire.id || this.mintSpawnPointId()}) - 1;
    }

    // mintSpawnPointId hands out spawnpoint-<n> above every number currently in
    // the zone, and the counter only ever climbs — deleting a fire does not free
    // its number, because re-minting it would silently hand a retired spawn
    // point's bound characters to whatever new object took the name.
    //
    // ⚑ It scans EVERY id-bearing object, not just campfires. Campfires are the
    // only kind today; the namespace is deliberately generic so the next one
    // (a waystone, a bound totem) joins it without a rework, and two kinds
    // counting independently is exactly the collision this guards against.
    //
    // ⚑ Monotonic within a session and re-seeded from the file on load, which
    // leaves one narrow case: deleting the highest-numbered fire, saving, and
    // adding a new one in a later session re-issues that number. Its worst
    // outcome is a character arriving at a different campfire than they
    // remember — the fire they bound to no longer exists either way.
    private mintSpawnPointId(): string {
        if (this.nextSpawnPointNumber === 0) {
            this.nextSpawnPointNumber = 1 + this.campfires.reduce(
                (highest, c) => Math.max(highest, spawnPointNumber(c.id)), 0);
        }
        return `spawnpoint-${this.nextSpawnPointNumber++}`;
    }

    removeCampfire(index: number) {
        this.campfires.splice(index, 1);
    }

    addDarkArea(darkArea: ZoneDarkArea): number {
        return this.darkAreas.push(darkArea) - 1;
    }

    updateDarkArea(index: number, darkArea: ZoneDarkArea) {
        this.darkAreas[index] = darkArea;
    }

    removeDarkArea(index: number) {
        this.darkAreas.splice(index, 1);
    }

    addAnchor(anchor: ZoneAnchor): number {
        return this.anchors.push(anchor) - 1;
    }

    removeAnchor(index: number) {
        this.anchors.splice(index, 1);
    }

    /**
     * Serializes in the exact field order of the hand-written api/zones/zone.json.
     * Coordinates are rounded to 2 decimals (~1.2 px), angles to 3.
     */
    getZoneAsJSON(): string {
        const data: ZoneData = {
            name: this.name,
            bounds: {width: this.bounds.width, height: this.bounds.height},
            terrain: this.terrain.map(t => ({
                type: t.type,
                x: round(t.x, 2),
                y: round(t.y, 2),
                size: round(t.size, 2),
                rotation: round(t.rotation, 3),
                flipped: t.flipped,
            })),
            props: this.props.map(p => ({
                type: p.type,
                x: round(p.x, 2),
                y: round(p.y, 2),
                rotation: round(p.rotation, 3),
                blocksMovement: p.blocksMovement,
            })),
            spawns: this.spawns.map(s => ({
                mob: s.mob,
                x: round(s.x, 2),
                y: round(s.y, 2),
                angle: round(s.angle, 3),
                respawnTicks: s.respawnTicks,
                respawnVariancePct: s.respawnVariancePct,
                // undefined keys are dropped by JSON.stringify — inheriting
                // spawns serialize exactly as before chunk 5. An explicit 0
                // radius is a real value (stationary override) and exports.
                wanderRadius: s.wanderRadius !== undefined ? round(s.wanderRadius, 2) : undefined,
                idleSpeedFactor: s.idleSpeedFactor !== undefined ? round(s.idleSpeedFactor, 2) : undefined,
                // Named here or the whitelist eats it: the backend has
                // accepted spawn.level since C1, so an override that only
                // lives in fromJSON's spread survives a load and vanishes on
                // the next save — silent data loss on a round-trip (L7).
                level: s.level,
                waypoints: s.waypoints && s.waypoints.length > 0
                    ? s.waypoints.map(w => ({x: round(w.x, 2), y: round(w.y, 2)}))
                    : undefined,
                patrolMode: s.patrolMode === 'loop' ? 'loop' : undefined,
            })),
            // Omitted (undefined key) while empty, so pre-step-3 zones
            // round-trip diff-clean — the chunk-5 array precedent.
            campfires: this.campfires.length > 0
                // startingSpawn only serializes when true — non-spawn fires
                // stay bare {x, y} like the hand-written file.
                // ⚑ The id is serialized FIRST and unconditionally. This
                // whitelist is the whole reason a hand-authored id could be
                // silently dropped by a round-trip through the editor, which
                // would unbind every character bound to that fire.
                ? this.campfires.map(c => ({
                    id: c.id,
                    x: round(c.x, 2),
                    y: round(c.y, 2),
                    startingSpawn: c.startingSpawn ? true : undefined,
                }))
                : undefined,
            darkAreas: this.darkAreas.length > 0
                ? this.darkAreas.map(d => ({x: round(d.x, 2), y: round(d.y, 2), radius: round(d.radius, 2)}))
                : undefined,
            // Omitted (undefined key) while empty, so pre-C6 zones round-trip
            // diff-clean. Names are script-lookup keys kept verbatim.
            anchors: this.anchors.length > 0
                ? this.anchors.map(a => ({name: a.name, x: round(a.x, 2), y: round(a.y, 2)}))
                : undefined,
        };
        return JSON.stringify(data, null, 2);
    }
}
