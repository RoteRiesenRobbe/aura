/**
 * Pure zone data model for the in-game zone editor (world foundation chunk 5).
 *
 * Mirrors the backend's world.Zone schema (backend/pkg/berryhunter/world/zone.go).
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
    waypoints?: ZoneWaypoint[];
    patrolMode?: 'pingpong' | 'loop';
}

// A fixed world campfire position (atmosphere & recovery chunk 2) — a plain
// point; the heal fixture itself is defined by the Campfire mob def.
export interface ZoneCampfire {
    x: number;
    y: number;
}

// A circle of constant darkness (atmosphere & recovery chunk 3) — purely
// client-visual; the radius is the outer (soft) edge of the dark pocket.
export interface ZoneDarkArea {
    x: number;
    y: number;
    radius: number;
}

// One ordered skill a teaching NPC grants on approach (plan-npc-teaching.md).
export interface ZoneTeaching {
    skill: string;
    requiredLevel: number;
    line: string;
}

// A peaceful, hand-placed teaching/lore NPC (plan-npc-teaching.md). A teaching
// NPC has teachings + a tooLowLine; a pure lore/sign-post NPC has only lines.
// Both may coexist on one NPC (lore is the fallback when nothing is taught).
export interface ZoneNpc {
    type: string;
    x: number;
    y: number;
    radius: number;
    tooLowLine?: string;
    teachings?: ZoneTeaching[];
    lines?: string[];
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
    npcs?: ZoneNpc[];
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
    npcs: ZoneNpc[];

    constructor(name: string, bounds: ZoneBounds, terrain: ZoneTerrain[], props: ZoneProp[], spawns: ZoneSpawn[], campfires: ZoneCampfire[], darkAreas: ZoneDarkArea[], npcs: ZoneNpc[]) {
        this.name = name;
        this.bounds = bounds;
        this.terrain = terrain;
        this.props = props;
        this.spawns = spawns;
        this.campfires = campfires;
        this.darkAreas = darkAreas;
        this.npcs = npcs;
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
            (data.npcs || []).map(n => ({
                ...n,
                teachings: (n.teachings || []).map(t => ({...t})),
                lines: (n.lines || []).slice(),
            })),
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

    addCampfire(campfire: ZoneCampfire): number {
        return this.campfires.push(campfire) - 1;
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
                waypoints: s.waypoints && s.waypoints.length > 0
                    ? s.waypoints.map(w => ({x: round(w.x, 2), y: round(w.y, 2)}))
                    : undefined,
                patrolMode: s.patrolMode === 'loop' ? 'loop' : undefined,
            })),
            // Omitted (undefined key) while empty, so pre-step-3 zones
            // round-trip diff-clean — the chunk-5 array precedent.
            campfires: this.campfires.length > 0
                ? this.campfires.map(c => ({x: round(c.x, 2), y: round(c.y, 2)}))
                : undefined,
            darkAreas: this.darkAreas.length > 0
                ? this.darkAreas.map(d => ({x: round(d.x, 2), y: round(d.y, 2), radius: round(d.radius, 2)}))
                : undefined,
            // Omitted (undefined key) while empty, so pre-step-5 zones
            // round-trip diff-clean. Teachings/lines are content strings kept
            // verbatim; only positions round.
            npcs: this.npcs.length > 0
                ? this.npcs.map(n => ({
                    type: n.type,
                    x: round(n.x, 2),
                    y: round(n.y, 2),
                    radius: round(n.radius, 2),
                    tooLowLine: n.teachings && n.teachings.length > 0 ? n.tooLowLine : undefined,
                    teachings: n.teachings && n.teachings.length > 0
                        ? n.teachings.map(t => ({skill: t.skill, requiredLevel: t.requiredLevel, line: t.line}))
                        : undefined,
                    lines: n.lines && n.lines.length > 0 ? n.lines.slice() : undefined,
                }))
                : undefined,
        };
        return JSON.stringify(data, null, 2);
    }
}
