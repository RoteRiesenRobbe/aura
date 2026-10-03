/**
 * Pure zone data model for the in-game zone editor (world foundation chunk 5).
 *
 * Mirrors the backend's world.Zone schema (backend/pkg/aura/world/zone.go).
 * ALL coordinates and radii in this model are SERVER UNITS ("Points"), never
 * pixels — conversion happens at the interaction/render boundary in ZoneEditor.
 * The backend parses zone.json with DisallowUnknownFields, so the serialized
 * field set here must match the Go structs exactly.
 */
import {DEFAULT_PROP_LAYER, flattenProps, groupProps, PROP_LAYERS, PropLayer, PropLayersJSON} from '../../zones/logic/PropLayers';
import {AreaJSON, flattenAreas, ObjectKind} from '../../zones/logic/ZoneAreas';

// IN MEMORY ONLY, on every object: the zone file's area it came from
// (plan-prop-draw-order.md P4), so a save puts it back in that group. The file
// carries no such key (the nesting IS the area). Absent = the zone level, which
// is also where a new in-game placement goes.
export interface InArea {
    area?: string;
}

export interface ZoneBounds {
    width: number;
    height: number;
}

export interface ZoneTerrain extends InArea {
    type: string;
    x: number;
    y: number;
    size: number;
    rotation: number; // radians
    flipped: 'none' | 'horizontal' | 'vertical';
}

export interface ZoneProp extends InArea {
    type: string;
    x: number;
    y: number;
    rotation: number; // radians
    // TRI-STATE since 2026-09-17: undefined = inherit the prop TYPE's own
    // blocksMovement (api/props/<type>.json), which itself defaults to BLOCKING.
    //
    // ⭐ It used to be a required boolean, and that was the bug: a prop dragged
    // fresh in Tiled carried no property at all, the converter read absent as
    // false, and you got a tree you could walk through. Whether a prop is solid
    // is a fact about the type; a placement only overrides it.
    //
    // ⛔ Anything that READS this must resolve it against the definition rather
    // than coerce it — `!prop.blocksMovement` is now wrong for an inheriting
    // prop of a blocking type. See propBlocks() in ZoneEditor.
    blocksMovement?: boolean;
    // Tri-state per-placement size multiplier on the prop TYPE's body
    // (plan-prop-scale.md C1): undefined = inherit the body verbatim. The
    // in-game editor never authors it — Tiled and the placement scripts do —
    // but it MUST survive a round-trip through here (see getZoneAsJSON).
    scale?: number;
    // IN MEMORY ONLY: which array of the file's `props` this placement came
    // from (plan-prop-draw-order.md D3), so a save puts it back there. The file
    // carries no such key (the nesting IS the layer), and getZoneAsJSON never
    // writes one. Absent = a new in-game placement, which lands in 'default'.
    layer?: PropLayer;
}

export interface ZoneWaypoint {
    x: number;
    y: number;
}

export interface ZoneSpawn extends InArea {
    mob: string;
    x: number;
    y: number;
    angle: number; // radians
    // TRI-STATE since plan-zone-editor-structure.md C2: undefined = the file
    // authors nothing and the serializer omits both keys. The authored
    // convention is exact: the 17 respawn-free spawns in world.json are
    // precisely the interaction carriers ("a talker authors no respawn").
    // ⚠ An absent key parses to 0 on the server (world.Spawn carries plain
    // int/float32), which means "respawn next tick" - inert for talkers, who
    // never die, but a COMBAT spawn must never lose its keys. That is why the
    // panel omits them by the def's interaction, never by an empty input.
    respawnTicks?: number;
    respawnVariancePct?: number;
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
    // Where THIS PLACEMENT of an anchor-mode travel_to row delivers, by zone-
    // anchor name (plan-underworld.md U3b). undefined = fall back to whatever
    // the mob definition authors. It is what lets ONE CaveMouth definition
    // serve every passage in the world: a door’s destination is where it
    // stands, not what kind of door it is.
    anchor?: string;
}

// A fixed world campfire position (atmosphere & recovery chunk 2) — a plain
// point; the heal fixture itself is defined by the Campfire mob def.
// startingSpawn marks the new-player spawn fire (intermission ① item 16). It
// must survive editor round-trips: a character's bind is persisted against the
// campfire id, and fresh players land on a flagged fire.
// ⚑ The invariant is PER LOADED SET, not per file (plan-underworld.md U1/L4):
// a cave nobody binds in legitimately carries fires with no starting spawn,
// while the WORLD must still have somewhere to put a fresh character. Only
// the PRIMARY zone may flag one, and world.Place enforces both halves at boot.
export interface ZoneCampfire extends InArea {
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
export interface ZoneDarkArea extends InArea {
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
export interface ZoneAnchor extends InArea {
    name: string;
    x: number;
    y: number;
}

// A polygon naming a client-side presentation profile — ground colour today,
// footsteps/music/atmosphere later (plan-region-primitive.md).
//
// ⚑ This editor deliberately cannot author one (D9): regions are placed in
// Tiled, and everything here exists purely so a save carries them through
// untouched (D3/L1). Nothing in the panel reads it.
export interface ZoneRegion extends InArea {
    profile: string;
    points: { x: number, y: number }[];
    // The place's name and the line under it (the region title banner,
    // 2026-09-28). Carried like everything else here.
    title?: string;
    subtitle?: string;
}

// An open polyline stroked as a road or a river (plan-world-paths.md).
//
// ⚑ Carried, never edited, exactly like ZoneRegion: paths are placed in Tiled
// and everything here exists so an in-game save carries them through untouched
// (L1). blocksMovement is tri-state on purpose — false is the authored default,
// so an undefined stays undefined and a decorative path exports byte-identically
// to the file it was loaded from.
export interface ZonePath extends InArea {
    profile: string;
    points: { x: number, y: number }[];
    width: number;
    blocksMovement?: boolean;
    // A second surface along the boundary (plan-zone-polygons.md D3). Carried,
    // never edited, like everything else here.
    outlineProfile?: string;
    outlineWidth?: number;
    // Tri-state for the same reason blocksMovement is: false is the authored
    // default, so an open path must export with no key at all.
    closed?: boolean;
    // Turn this path's tile to run ALONG the path (world.Path.AlignTexture).
    // Tri-state like the two above: absent is the authored default, so every
    // road and river exports with no key. ⛔ Only the FLAG is carried — the
    // angle itself is derived from the geometry at load (Paths.textureAngle)
    // and never stored, so nothing here can contradict the drawn shape.
    alignTexture?: boolean;
    // How the stroke turns and stops (world.Path.Corners / Ends). Carried,
    // never edited; absent = round, and absent must stay absent.
    corners?: string;
    ends?: string;
    // An authored skill applied to whatever stands in this shape
    // (plan-area-effects.md E1). Carried, never edited, like everything else
    // here. Absent = inert, which is every path in every shipped zone.
    effect?: string;
}

// A filled mass — a rock, a building footprint, a lake (plan-zone-polygons.md
// P2).
//
// ⚑ Carried, never edited, exactly like ZoneRegion and ZonePath: polygons are
// placed in Tiled and everything here exists so an in-game save carries them
// through untouched (L1). blocksMovement is tri-state for the same reason it is
// on a path.
export interface ZonePolygon extends InArea {
    profile: string;
    points: { x: number, y: number }[];
    blocksMovement?: boolean;
    outlineProfile?: string;
    outlineWidth?: number;
    // The lava pool, the bog (plan-area-effects.md E1). ⚑ On the SHAPE and never
    // on the profile (D2): the profile tables are client-side, so a profile key
    // would make the look table gameplay-authoritative — and a profile is a
    // MATERIAL, so a zone-1 pool and a zone-5 pool wearing the same "Lava" would
    // have to hurt identically.
    effect?: string;
}

// The AIR over an area — how dark this place is, how far you see inside it, and
// what the murk looks like (plan-region-atmosphere.md A0).
//
// ⚑ Carried, never edited, exactly like ZoneRegion, ZonePath and ZonePolygon.
//
// ⛔ TWO fields, and the shortness is the ruling (D15): an atmosphere is NOT a
// ZonePolygon. No blocksMovement, no outline, no width — a polygon is a wall you
// walk into, an atmosphere is air you walk through, and they share a shape and
// nothing else. Adding a collision field here would make it survive a round-trip
// and do nothing, which is worse than it being refused.
export interface ZoneAtmosphere extends InArea {
    profile: string;
    points: { x: number, y: number }[];
    // ⚑ THE ONE KEY THE D15 NOTE ABOVE DOES NOT REFUSE (plan-area-effects.md
    // D1). blocksMovement, outline and width all describe a WALL and would
    // round-trip into a file that no longer boots. An area effect describes no
    // wall — it is a region of space acting on what stands in it, which air does
    // as readily as ground. Lava is ground, miasma is air, one key covers both.
    effect?: string;
}

// A HOLE cut in that air — the lit pocket at a cave mouth, the gap in a fog
// bank (plan-region-atmosphere.md A4).
//
// ⚑ Carried, never edited, exactly like the four shapes above it.
//
// ⛔ TWO fields and NO PROFILE, and the absence is the ruling (L7). A clearing
// paints nothing, so there is no look to name. This is the whole of A4: the
// erase used to be an atmosphere whose profile authored `darkness: 0`, one key
// doing two jobs — *how much* and *which operation* — and the PO rejected it on
// sight. Carrying a profile here would re-create the ambiguity in the one writer
// nobody re-reads.
export interface ZoneClearing extends InArea {
    clears: 'darkness' | 'haze' | 'both';
    points: { x: number, y: number }[];
}

export interface ZoneData {
    name: string;
    bounds: ZoneBounds;
    // Where this zone's rectangle sits in the shared coordinate space when
    // several zones are loaded together (plan-underworld.md U1). Absent =
    // {0, 0}: the overworld, and every zone authored before the field existed.
    //
    // ⚑ CARRIED, NEVER EDITED — like regions and paths. There is no placement
    // tool in this editor, and the only thing this field has to do is survive
    // fromJSON -> getZoneAsJSON. Dropping it would silently move a whole zone
    // on top of another one on the next in-game save (L3).
    origin?: ZoneOrigin;
    // The terrain profile the zone is filled with, inside AND beyond its
    // bounds, beneath every region and polygon. Absent = black. Carried, never
    // edited — Tiled authors it as a map property.
    ground?: string;
    decals: ZoneTerrain[];
    // One array per prop layer (plan-prop-draw-order.md D3). The model holds
    // them FLAT (rank, then file order — the server's spawn order), so the
    // editor's flat prop index keeps working; fromJSON flattens and
    // getZoneAsJSON regroups.
    props: PropLayersJSON<ZoneProp>;
    spawns: ZoneSpawn[];
    // Omitted when empty so pre-step-3 zones round-trip diff-clean.
    bindPoints?: ZoneCampfire[];
    darkAreas?: ZoneDarkArea[];
    // Omitted when empty so pre-step-5 zones round-trip diff-clean.
    regions?: ZoneRegion[];
    paths?: ZonePath[];
    structures?: ZonePolygon[];
    atmospheres?: ZoneAtmosphere[];
    clearings?: ZoneClearing[];
    // Omitted when empty so pre-C6 zones round-trip diff-clean.
    anchors?: ZoneAnchor[];
    // Named groups of objects (plan-prop-draw-order.md P4). Omitted when
    // empty, so a zone without areas round-trips diff-clean.
    areas?: ZoneArea[];
}

// One entry of `areas`: an id plus any of the object arrays.
export type ZoneArea = {id: string} & Partial<Pick<ZoneData, ObjectKind>>;

// The spawn editor's derived category (plan-zone-editor-structure.md D1):
// computed from fields every mob def already carries, never authored. It
// drives three display surfaces (picker grouping, marker colour, and, from
// C2, which controls show), and nothing else: no data behaviour reads it.
export type MobKind = 'combat' | 'talker' | 'fixture';

// The minimal structural shape kindOf needs, decoupled from how the defs got
// into the browser (ZoneEditor's require.context cannot be imported under
// vitest, which is why this rule lives here).
export interface MobKindDef {
    role?: string;
    interaction?: object;
}

export function kindOf(def: MobKindDef): MobKind {
    if (def.interaction != null) {
        return 'talker';
    }
    if (def.role === 'structure') {
        return 'fixture';
    }
    // The common case: most defs author no role at all, and unrecognized role
    // values (e.g. "creature") fall through here rather than throw.
    //
    // ⚑ A fourth kind, 'companion', was derived from `role: "follower"` until
    // plan-summon-follows.md C2 retired that role: a pet is made by the SPELL's
    // `follows` key now, so nothing on a mob def says "companion" any more. The
    // four companion mobs land in 'combat' and zone authors simply do not place
    // them. Deriving the bucket from xpFactor 0 instead would be the
    // infer-from-a-number pattern the entity model retired.
    return 'combat';
}

// What the picked species can DO, driving which spawn controls show
// (plan-zone-editor-structure.md §4.5). Capability, never the kindOf bucket:
// Wanderer is a talker that walks (interaction + speed 0.5) and Turnip is a
// fixture that dies and respawns - two counterexamples are enough to say the
// bucket must never gate a control (L4).
export interface MobCapabilityDef {
    interaction?: object;
    factors?: { speed?: number };
}

export interface MobCapabilities {
    // factors.speed > 0 - mirrors the server's own boot refusal for movement
    // authoring on a speed-0 mob. All 58 defs author speed explicitly; an
    // absent value is the Go zero value, 0, so absent = does not move.
    moves: boolean;
    // carries no interaction - the respawn keys apply (§4.6: talkers author
    // none, and the editor must stop forcing them in).
    respawns: boolean;
}

export function capabilitiesOf(def: MobCapabilityDef): MobCapabilities {
    return {
        moves: ((def.factors && def.factors.speed) || 0) > 0,
        respawns: def.interaction == null,
    };
}

// spawnPointNumber reads the <n> out of "spawnpoint-<n>", or 0 for any id that
// is not in that shape — a hand-authored name is legal, it just does not
// participate in the numbering.
function spawnPointNumber(id: string): number {
    let match = /^spawnpoint-(\d+)$/.exec(id || '');
    return match === null ? 0 : parseInt(match[1], 10);
}

export interface ZoneOrigin {
    x: number;
    y: number;
}

function round(value: number, digits: number): number {
    const factor = Math.pow(10, digits);
    return Math.round(value * factor) / factor;
}

export class ZoneModel {
    name: string;
    bounds: ZoneBounds;
    // decals is a serialization slot filled at export time from the live
    // GroundTextureManager store (the editor renders/edits terrain there, in
    // pixels). Kept here so getZoneAsJSON is the single whole-zone serializer.
    decals: ZoneTerrain[];
    props: ZoneProp[];
    spawns: ZoneSpawn[];
    bindPoints: ZoneCampfire[];
    darkAreas: ZoneDarkArea[];
    anchors: ZoneAnchor[];
    // ⚑ Carried, never edited (D9), which is why it is not a constructor
    // parameter like every collection above: there is no region tool here and
    // no panel control, so the only thing this field must do is survive
    // fromJSON → getZoneAsJSON so a save does not delete Tiled's work (L1).
    // A model built any other way simply has none.
    regions: ZoneRegion[] = [];
    // Carried, never edited — see ZonePath and the region field above.
    paths: ZonePath[] = [];
    structures: ZonePolygon[] = [];
    atmospheres: ZoneAtmosphere[] = [];
    clearings: ZoneClearing[] = [];
    // Carried, never edited — see ZoneData.origin. undefined means the zone
    // authors no origin at all, which must serialize back to NO KEY rather
    // than to {x: 0, y: 0}, or every existing zone file gains a line on its
    // next save.
    origin?: ZoneOrigin;
    // Carried, never edited — see ZoneData.ground. undefined = no key.
    ground?: string;
    // The file's area ids, in file order (P4). Every object is held FLAT and
    // tagged with its area; getZoneAsJSON regroups by these. Kept as a list
    // so an area the author made survives even once it is empty.
    areaIds: string[] = [];
    // 0 until the first mint, which seeds it from the loaded zone.
    private nextSpawnPointNumber: number = 0;

    constructor(name: string, bounds: ZoneBounds, decals: ZoneTerrain[], props: ZoneProp[], spawns: ZoneSpawn[], bindPoints: ZoneCampfire[], darkAreas: ZoneDarkArea[], anchors: ZoneAnchor[]) {
        this.name = name;
        this.bounds = bounds;
        this.decals = decals;
        this.props = props;
        this.spawns = spawns;
        this.bindPoints = bindPoints;
        this.darkAreas = darkAreas;
        this.anchors = anchors;
    }

    static fromJSON(file: ZoneData): ZoneModel {
        // ⚑ The same flatten the server and the bundled-zone readers run
        // (ZoneAreas, D11): every area's objects join the flat lists below,
        // each tagged with its area.
        const data = flattenAreas(file as ZoneData & {areas?: AreaJSON[]});
        const model = new ZoneModel(
            data.name,
            {width: data.bounds.width, height: data.bounds.height},
            (data.decals || []).map(t => ({...t})),
            // ⚑ L3: the flat index the editor addresses props by is THIS
            // order, and each entry remembers its layer so a save puts it back
            // in its own array.
            flattenProps(data.props),
            // wanderRadius/idleSpeedFactor/patrolMode keep their tri-state:
            // absent stays undefined (= inherit), explicit values survive.
            (data.spawns || []).map(s => ({
                ...s,
                waypoints: (s.waypoints || []).map(w => ({...w})),
            })),
            (data.bindPoints || []).map(c => ({...c})),
            (data.darkAreas || []).map(d => ({...d})),
            (data.anchors || []).map(a => ({...a})),
        );
        // Deep-copied like every other array, so an edit here could never reach
        // the caller's data — even though nothing edits it.
        model.regions = (data.regions || []).map(r => ({
            profile: r.profile,
            points: (r.points || []).map(p => ({...p})),
            title: r.title,
            subtitle: r.subtitle,
            area: r.area,
        }));
        model.paths = (data.paths || []).map(p => ({
            profile: p.profile,
            points: (p.points || []).map(pt => ({...pt})),
            width: p.width,
            blocksMovement: p.blocksMovement,
            closed: p.closed,
            outlineProfile: p.outlineProfile,
            outlineWidth: p.outlineWidth,
            alignTexture: p.alignTexture,
            corners: p.corners,
            ends: p.ends,
            effect: p.effect,
            area: p.area,
        }));
        model.structures = (data.structures || []).map(g => ({
            profile: g.profile,
            points: (g.points || []).map(pt => ({...pt})),
            blocksMovement: g.blocksMovement,
            outlineProfile: g.outlineProfile,
            outlineWidth: g.outlineWidth,
            effect: g.effect,
            area: g.area,
        }));
        model.atmospheres = (data.atmospheres || []).map(a => ({
            profile: a.profile,
            points: (a.points || []).map(pt => ({...pt})),
            effect: a.effect,
            area: a.area,
        }));
        model.clearings = (data.clearings || []).map(c => ({
            clears: c.clears,
            points: (c.points || []).map(pt => ({...pt})),
            area: c.area,
        }));
        model.areaIds = (file.areas || []).map(a => a.id);
        model.origin = data.origin ? {x: data.origin.x, y: data.origin.y} : undefined;
        model.ground = data.ground || undefined;
        return model;
    }

    // A new in-game placement goes to the 'default' layer (D3) at the zone
    // level (P4); moving it is a Tiled job. Appended, so every index holds.
    addProp(prop: ZoneProp): number {
        return this.props.push({...prop, layer: prop.layer || DEFAULT_PROP_LAYER}) - 1;
    }

    addSpawn(spawn: ZoneSpawn): number {
        return this.spawns.push(spawn) - 1;
    }

    // ⚑ The layer and the area are KEPT: the panel rebuilds a prop from its
    // controls and has no control for either, so taking the caller's would
    // move an edited canopy tree into 'default', or out of its area, on the
    // next save. Every update below keeps the area for the same reason.
    updateProp(index: number, prop: ZoneProp) {
        this.props[index] = {...prop, layer: this.props[index].layer, area: this.props[index].area};
    }

    updateSpawn(index: number, spawn: ZoneSpawn) {
        this.spawns[index] = {...spawn, area: this.spawns[index].area};
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
        return this.bindPoints.push({...campfire, id: campfire.id || this.mintSpawnPointId()}) - 1;
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
            this.nextSpawnPointNumber = 1 + this.bindPoints.reduce(
                (highest, c) => Math.max(highest, spawnPointNumber(c.id)), 0);
        }
        return `spawnpoint-${this.nextSpawnPointNumber++}`;
    }

    removeCampfire(index: number) {
        this.bindPoints.splice(index, 1);
    }

    addDarkArea(darkArea: ZoneDarkArea): number {
        return this.darkAreas.push(darkArea) - 1;
    }

    updateDarkArea(index: number, darkArea: ZoneDarkArea) {
        this.darkAreas[index] = {...darkArea, area: this.darkAreas[index].area};
    }

    removeDarkArea(index: number) {
        this.darkAreas.splice(index, 1);
    }

    addAnchor(anchor: ZoneAnchor): number {
        return this.anchors.push(anchor) - 1;
    }

    updateAnchor(index: number, anchor: ZoneAnchor) {
        this.anchors[index] = {...anchor, area: this.anchors[index].area};
    }

    removeAnchor(index: number) {
        this.anchors.splice(index, 1);
    }

    /**
     * Serializes in the exact field order of the hand-written api/zones/zone.json.
     * Coordinates are rounded to 2 decimals (~1.2 px), angles to 3.
     */
    getZoneAsJSON(): string {
        // The zone level always carries decals, props and spawns, so the
        // spread below completes the ZoneData shape.
        const data = {
            name: this.name,
            bounds: {width: this.bounds.width, height: this.bounds.height},
            // Omitted when absent so every zone that authors no origin — which
            // is all of them today — round-trips diff-clean.
            ...(this.origin ? {origin: {x: this.origin.x, y: this.origin.y}} : {}),
            ...(this.ground ? {ground: this.ground} : {}),
            ...this.objectsJSON(undefined),
            // The areas (plan-prop-draw-order.md P4), after every zone-level
            // array, as zone.go declares them. Omitted when there are none, so
            // a zone without areas round-trips diff-clean.
            areas: this.areaIds.length > 0
                ? this.areaIds.map(id => ({id, ...this.objectsJSON(id)}))
                : undefined,
        } as ZoneData;
        return JSON.stringify(data, null, 2);
    }

    /**
     * The object arrays of one group, the zone level (undefined) or an area,
     * in zone.go's Objects order — serializeObjects in aura-convert.js exactly,
     * so the two writers agree byte for byte. The zone level always writes
     * decals, the four prop arrays and spawns; an AREA writes no empty array
     * at all, prop layers included (P4).
     */
    private objectsJSON(area: string | undefined): Partial<Pick<ZoneData, ObjectKind>> {
        const mine = <T extends InArea>(list: T[]): T[] => list.filter(o => o.area === area);
        const decals = mine(this.decals);
        const props = mine(this.props);
        const spawns = mine(this.spawns);
        const bindPoints = mine(this.bindPoints);
        const darkAreas = mine(this.darkAreas);
        const regions = mine(this.regions);
        const paths = mine(this.paths);
        const structures = mine(this.structures);
        const atmospheres = mine(this.atmospheres);
        const clearings = mine(this.clearings);
        const anchors = mine(this.anchors);
        const out: Partial<Pick<ZoneData, ObjectKind>> = {
            decals: decals.map(t => ({
                type: t.type,
                x: round(t.x, 2),
                y: round(t.y, 2),
                size: round(t.size, 2),
                rotation: round(t.rotation, 3),
                flipped: t.flipped,
            })),
            // All four layer arrays in rank order, empty ones included —
            // serializeZone's shape exactly, so the two writers agree.
            props: groupProps(props, p => ({
                type: p.type,
                x: round(p.x, 2),
                y: round(p.y, 2),
                rotation: round(p.rotation, 3),
                blocksMovement: p.blocksMovement,
                // ⚑ L1. Named here or the whitelist eats it: the backend has
                // accepted prop.scale since plan-prop-scale.md C1, and this
                // editor cannot author it — so a scale set in Tiled would
                // survive the load (fromJSON's spread) and vanish on the next
                // in-game save. Exactly how spawn.level was lost once already.
                // undefined is dropped by JSON.stringify, so inheriting props
                // serialize byte-for-byte as before.
                scale: p.scale !== undefined ? round(p.scale, 3) : undefined,
            })),
            spawns: spawns.map(s => ({
                mob: s.mob,
                x: round(s.x, 2),
                y: round(s.y, 2),
                angle: round(s.angle, 3),
                // Named here (the L7 whitelist) but tri-state: undefined is
                // dropped by JSON.stringify, so a talker's absent respawn
                // keys stay absent on export.
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
                // Named here or the whitelist eats it, `level`’s reason exactly:
                // the backend has read spawn.anchor since U3b, so an authored
                // destination that only lived in fromJSON’s spread would survive a
                // load and vanish on the next save — and the door it belonged to
                // would then take the keypress and move nobody.
                anchor: s.anchor || undefined,
            })),
            // Omitted (undefined key) while empty, so pre-step-3 zones
            // round-trip diff-clean — the chunk-5 array precedent.
            bindPoints: bindPoints.length > 0
                // startingSpawn only serializes when true — non-spawn fires
                // stay bare {x, y} like the hand-written file.
                // ⚑ The id is serialized FIRST and unconditionally. This
                // whitelist is the whole reason a hand-authored id could be
                // silently dropped by a round-trip through the editor, which
                // would unbind every character bound to that fire.
                ? bindPoints.map(c => ({
                    id: c.id,
                    x: round(c.x, 2),
                    y: round(c.y, 2),
                    startingSpawn: c.startingSpawn ? true : undefined,
                }))
                : undefined,
            darkAreas: darkAreas.length > 0
                ? darkAreas.map(d => ({x: round(d.x, 2), y: round(d.y, 2), radius: round(d.radius, 2)}))
                : undefined,
            // ⚑ Named here or the whitelist eats it (L1). This editor cannot
            // author a region (D9), so what it would delete is entirely
            // somebody else's work in Tiled — the spawn.level and prop.scale
            // failure, a third time. Coordinates are rounded exactly like every
            // other array so a Tiled save and an in-game save agree byte for
            // byte; the profile name is kept verbatim.
            regions: regions.length > 0
                ? regions.map(r => ({
                    profile: r.profile,
                    points: r.points.map(p => ({x: round(p.x, 2), y: round(p.y, 2)})),
                    // Same omit rule as aura-convert.js serializeZone.
                    title: r.title || undefined,
                    subtitle: r.title && r.subtitle ? r.subtitle : undefined,
                }))
                : undefined,
            // ⚑ Named here or the whitelist eats it (L1) — the fourth time this
            // comment has had to be written, after spawn.level, prop.scale and
            // regions. This editor cannot author a path, so what a missing line
            // here would silently delete is somebody else's work in Tiled.
            // blocksMovement stays tri-state: undefined is dropped by
            // JSON.stringify, so a decorative path exports exactly as authored
            // rather than growing a "blocksMovement": false nobody wrote.
            paths: paths.length > 0
                ? paths.map(p => ({
                    profile: p.profile,
                    points: p.points.map(pt => ({x: round(pt.x, 2), y: round(pt.y, 2)})),
                    width: round(p.width, 2),
                    blocksMovement: p.blocksMovement ? true : undefined,
                    closed: p.closed ? true : undefined,
                    // ⚑ The pair is all-or-nothing: a width without a profile
                    // draws nothing and the server refuses it, so the profile
                    // gates both keys.
                    outlineProfile: p.outlineProfile || undefined,
                    outlineWidth: p.outlineProfile ? round(p.outlineWidth || 0, 2) : undefined,
                    // ⚑ Tri-state like blocksMovement and closed: false must
                    // export as NO KEY, or every path in every shipped zone
                    // grows an "alignTexture": false nobody wrote.
                    alignTexture: p.alignTexture ? true : undefined,
                    // ⚑ Named here or the whitelist eats it (L1), and absent
                    // stays absent for alignTexture's reason.
                    corners: p.corners || undefined,
                    ends: p.ends || undefined,
                    // ⚑ Absent stays absent (plan-area-effects.md D10): no
                    // shipped path names an effect, so an empty string here must
                    // serialize to no key at all or every existing zone changes.
                    effect: p.effect || undefined,
                }))
                : undefined,
            // ⚑ Named here or the whitelist eats it (L1) — the fifth time this
            // comment has had to be written, after spawn.level, prop.scale,
            // regions and paths. This editor cannot author a polygon either.
            structures: structures.length > 0
                ? structures.map(g => ({
                    profile: g.profile,
                    points: g.points.map(pt => ({x: round(pt.x, 2), y: round(pt.y, 2)})),
                    blocksMovement: g.blocksMovement ? true : undefined,
                    outlineProfile: g.outlineProfile || undefined,
                    outlineWidth: g.outlineProfile ? round(g.outlineWidth || 0, 2) : undefined,
                    effect: g.effect || undefined,
                }))
                : undefined,
            // ⚑ Named here or the whitelist eats it (L1) — the SIXTH time this
            // comment has had to be written, after spawn.level, prop.scale,
            // regions, paths and polygons. This editor cannot author an
            // atmosphere either, so a missing line here deletes somebody else's
            // work in Tiled and every test stays green.
            //
            // ⛔ NO blocksMovement and NO outline to carry (D15) — an atmosphere
            // is air. ⚑ `effect` is the one addition that ruling does not turn
            // away (plan-area-effects.md D1): it describes no wall, it describes
            // a region of space acting on what stands in it.
            atmospheres: atmospheres.length > 0
                ? atmospheres.map(a => ({
                    profile: a.profile,
                    points: a.points.map(pt => ({x: round(pt.x, 2), y: round(pt.y, 2)})),
                    effect: a.effect || undefined,
                }))
                : undefined,
            // ⚑ The SEVENTH time the L1 comment above has had to be written. This
            // editor cannot author a clearing either, so a missing line here
            // deletes somebody else's Tiled work with every test still green.
            //
            // ⛔ Two keys and NO profile (L7) — a clearing paints nothing.
            clearings: clearings.length > 0
                ? clearings.map(c => ({
                    clears: c.clears,
                    points: c.points.map(pt => ({x: round(pt.x, 2), y: round(pt.y, 2)})),
                }))
                : undefined,
            // Omitted (undefined key) while empty, so pre-C6 zones round-trip
            // diff-clean. Names are script-lookup keys kept verbatim.
            anchors: anchors.length > 0
                ? anchors.map(a => ({name: a.name, x: round(a.x, 2), y: round(a.y, 2)}))
                : undefined,
        };
        if (area !== undefined) {
            const loose = out as Record<string, unknown>;
            Object.keys(loose).forEach(k => {
                if (Array.isArray(loose[k]) && (loose[k] as unknown[]).length === 0) {
                    loose[k] = undefined;
                }
            });
            const props: PropLayersJSON<ZoneProp> = {};
            PROP_LAYERS.forEach(l => {
                const list = (out.props || {})[l] || [];
                if (list.length > 0) {
                    props[l] = list;
                }
            });
            out.props = Object.keys(props).length > 0 ? props : undefined;
        }
        return out;
    }
}
