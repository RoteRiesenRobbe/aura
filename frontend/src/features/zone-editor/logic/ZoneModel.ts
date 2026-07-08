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

export interface ZoneProp {
    type: string;
    x: number;
    y: number;
    rotation: number; // radians
    blocksMovement: boolean;
    blocksAura: boolean;
}

export interface ZoneSpawn {
    mob: string;
    x: number;
    y: number;
    angle: number; // radians
    respawnTicks: number;
    respawnVariancePct: number;
}

export interface ZoneData {
    name: string;
    bounds: ZoneBounds;
    props: ZoneProp[];
    spawns: ZoneSpawn[];
}

function round(value: number, digits: number): number {
    const factor = Math.pow(10, digits);
    return Math.round(value * factor) / factor;
}

export class ZoneModel {
    name: string;
    bounds: ZoneBounds;
    props: ZoneProp[];
    spawns: ZoneSpawn[];

    constructor(name: string, bounds: ZoneBounds, props: ZoneProp[], spawns: ZoneSpawn[]) {
        this.name = name;
        this.bounds = bounds;
        this.props = props;
        this.spawns = spawns;
    }

    static fromJSON(data: ZoneData): ZoneModel {
        return new ZoneModel(
            data.name,
            {width: data.bounds.width, height: data.bounds.height},
            (data.props || []).map(p => ({...p})),
            (data.spawns || []).map(s => ({...s})),
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

    /**
     * Serializes in the exact field order of the hand-written api/zones/zone.json.
     * Coordinates are rounded to 2 decimals (~1.2 px), angles to 3.
     */
    getZoneAsJSON(): string {
        const data: ZoneData = {
            name: this.name,
            bounds: {width: this.bounds.width, height: this.bounds.height},
            props: this.props.map(p => ({
                type: p.type,
                x: round(p.x, 2),
                y: round(p.y, 2),
                rotation: round(p.rotation, 3),
                blocksMovement: p.blocksMovement,
                blocksAura: p.blocksAura,
            })),
            spawns: this.spawns.map(s => ({
                mob: s.mob,
                x: round(s.x, 2),
                y: round(s.y, 2),
                angle: round(s.angle, 3),
                respawnTicks: s.respawnTicks,
                respawnVariancePct: s.respawnVariancePct,
            })),
        };
        return JSON.stringify(data, null, 2);
    }
}
