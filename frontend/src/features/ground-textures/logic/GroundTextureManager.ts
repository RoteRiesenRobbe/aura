import {isDefined} from '../../common/logic/Utils';
import {GroundTexture, Parameters} from './GroundTexture';
import {groundTextureTypes} from './GroundTextureTypes';
import {IGame} from "../../core/logic/IGame";
import {meter2px} from '../../../client-data/BasicConfig';
import { Container } from 'pixi.js';


const textures: GroundTexture[] = [];
let renderingStarted = false;
let latestTextureIndex: number;
let terrainTexturesLayer: Container;

export function setup(game: IGame) {
    terrainTexturesLayer = game.layers.terrain.textures;
    textures.forEach((texture: GroundTexture) => {
        texture.addToMap(terrainTexturesLayer);
    });

    renderingStarted = true;
}

export function placeTexture(parameters: Parameters) {
    let newTexture = new GroundTexture(parameters);
    if (parameters.stacking === 'bottom') {
        textures.unshift(newTexture);
        latestTextureIndex = 0;
    } else {
        latestTextureIndex = textures.push(newTexture) - 1;
    }

    if (renderingStarted) {
        newTexture.addToMap(terrainTexturesLayer);
    }
}

export function removeLatestTexture() {
    if (isDefined(latestTextureIndex)) {
        let texture = textures[latestTextureIndex];
        textures.splice(latestTextureIndex, 1);
        if (renderingStarted) {
            texture.remove();
        }
        latestTextureIndex = undefined;
    }
}

/**
 * Removes every placed texture from the map and resets the store. Used by the
 * zone editor when switching to a different zone (chunk 6).
 */
export function clear() {
    textures.forEach(texture => {
        if (renderingStarted) {
            texture.remove();
        }
    });
    textures.length = 0;
    latestTextureIndex = undefined;
}

interface GroundTextureDefinition {
    type: string;
    x: number;
    y: number;
    size: number;
    rotation: number;
    flipped: 'none' | 'horizontal' | 'vertical';
}

export function getTexturesAsJSON() {
    return JSON.stringify(textures.map(function (texture) {
        let params = texture.parameters;
        return {
            type: params.type.name,
            x: params.x,
            y: params.y,
            size: params.size,
            rotation: Math.round(params.rotation * 1000) / 1000, // Round to 3 digits
            flipped: params.flipped,
        };
    }), null, 2);
}

export function getTextureCount() {
    return textures.length;
}

const PX_PER_UNIT = meter2px(1);

function round(value: number, digits: number): number {
    const factor = Math.pow(10, digits);
    return Math.round(value * factor) / factor;
}

/**
 * Returns the placed terrain in SERVER UNITS (px ÷ meter2px), matching the
 * zone.json terrain schema. The editor stores/edits terrain in pixels; the
 * unified zone export syncs from this (chunk 6). x/y/size rounded to 2, angle
 * to 3 — same convention as ZoneModel.
 */
export function getTerrainServerUnits(): GroundTextureDefinition[] {
    return textures.map(texture => {
        const p = texture.parameters;
        return {
            type: p.type.name,
            x: round(p.x / PX_PER_UNIT, 2),
            y: round(p.y / PX_PER_UNIT, 2),
            size: round(p.size / PX_PER_UNIT, 2),
            rotation: round(p.rotation, 3),
            flipped: p.flipped,
        };
    });
}

interface DarkAreaDefinition {
    x: number;
    y: number;
    radius: number;
}

interface RegionDefinition {
    profile: string;
    points: { x: number, y: number }[];
}

// A road or a river (plan-world-paths.md). Declared locally like every other
// shape in this file — this interface describes what the CLIENT can rely on
// finding, which is why blocksMovement is absent: it is read by the server
// alone, and nothing here draws differently because a river blocks.
interface PathDefinition {
    profile: string;
    points: { x: number, y: number }[];
    width: number;
}

interface CampfireDefinition {
    x: number;
    y: number;
    // Stable authored spawn-point id ("spawnpoint-N"). ⚑ Optional here and
    // required by the backend's zone validation: this interface describes what
    // the client can rely on finding, and a fire with no id simply cannot be a
    // map marker (plan-world-map.md C2) because the server's discovered set has
    // no way to name it.
    id?: string;
}

export interface ZoneBoundsJSON {
    width: number;
    height: number;
}

export interface ZoneOriginJSON {
    x: number;
    y: number;
}

export interface ZoneJSON {
    // Zone size in server units. The server's border wall is built from
    // exactly this rectangle, so it is also what the camera clamp and the map
    // must size themselves to (plan-underworld.md U2/L13).
    bounds?: ZoneBoundsJSON;
    // Where this zone's rectangle sits in the shared coordinate space; absent
    // means {0, 0}. It is what makes "which zone am I in" answerable from a
    // position, which is the whole of the client's zone handling — see
    // features/zones/logic/ActiveZone.ts.
    origin?: ZoneOriginJSON;
    terrain?: GroundTextureDefinition[];
    darkAreas?: DarkAreaDefinition[];
    // Ground-colour/presentation polygons, read by Regions.loadZone
    // (plan-region-primitive.md). Server units, like everything in the file.
    regions?: RegionDefinition[];
    // Roads and rivers, read by Paths.loadPaths. This is the client's fourth,
    // read-only view of the zone file — an array not named here simply never
    // reaches the renderer, with no error anywhere.
    paths?: PathDefinition[];
    // World campfires (chunk 2): read by the darkness overlay for their
    // static glow (chunk 4 follow-up).
    campfires?: CampfireDefinition[];
}

// Bundle every zone's data straight from the repo api/ (chunk 6, §7.4) — same
// convention as the zone editor. Keyed by file stem so the client can render
// the terrain of whichever zone the server selected (Welcome.zoneName).
const zonesContext = require.context('../../../../../api/zones', false, /\.json$/);
const zonesByStem: { [stem: string]: ZoneJSON } = {};
zonesContext.keys().forEach((key: string) => {
    const stem = key.replace(/^\.\//, '').replace(/\.json$/, '');
    zonesByStem[stem] = zonesContext(key) as ZoneJSON;
});

/**
 * Bundled zone data by file stem — other client-visual zone consumers (the
 * darkness overlay) read their arrays through this instead of bundling the
 * zone directory a third time.
 */
export function getZoneData(zoneName: string): ZoneJSON | undefined {
    return zonesByStem[zoneName];
}

/**
 * Loads the active zone's terrain (chosen by the server, delivered in
 * Welcome.zoneName) and places it. Terrain is authored in server units; the
 * client scales x/y/size to pixels via meter2px. Called after setup(), so
 * placed textures render immediately.
 */
export function loadZone(zoneName: string) {
    const zone = zonesByStem[zoneName];
    if (!isDefined(zone)) {
        console.warn(`No bundled zone data for "${zoneName}"; rendering no terrain.`);
        return;
    }
    // ⚑ THE ORIGIN IS APPLIED HERE, NOT ON THE SERVER. Terrain is client-visual,
    // so world.Place deliberately leaves it zone-local — the server never reads
    // it and shifting it there would just give the two sides two chances to
    // disagree. Every entity the client receives arrives in WORLD coordinates,
    // so the floor under them has to be drawn in world coordinates too, or a
    // placed zone renders its ground back at the surface
    // (plan-underworld.md U2).
    const ox = zone.origin ? zone.origin.x : 0;
    const oy = zone.origin ? zone.origin.y : 0;
    (zone.terrain || []).forEach(function (t: GroundTextureDefinition) {
        placeTexture({
            type: groundTextureTypes[t.type],
            x: meter2px(t.x + ox),
            y: meter2px(t.y + oy),
            size: meter2px(t.size),
            rotation: t.rotation,
            flipped: t.flipped,
            stacking: 'top',
        });
    });
}
