/**
 * The map's prop layer, from the BUNDLED zone data rather than the wire.
 *
 * ⭐ Every placed prop is baked into the map's terrain once per zone (MapTerrain),
 * so the fog decides what shows: a tree stands on the map exactly where you have
 * uncovered it, after a reload, a re-join and a zone crossing alike. Before this
 * the map drew a prop only once the server had streamed it into your view, kept
 * it for the page's lifetime ("STATIC, never removed"), and so lost them all on
 * a reload and leaked the old zone's trees onto the new zone's map on a crossing.
 *
 * ⚑ Pure on purpose, like MapScale: Props.ts (where the definitions live) reaches
 * `require.context` at import time and Graphics.ts `require`s image files, and
 * neither loads under vitest. The caller passes both lookups in.
 *
 * Coordinates are ZONE-LOCAL px, the space MapTerrain bakes in: zone files are
 * authored zone-local, so there is no origin term here (campfireMarkers' note).
 */

/** A placement as authored in `api/zones/*.json`. */
export interface MapPropPlacement {
    type: string;
    x: number;
    y: number;
    /** Radians. Absent = 0. */
    rotation?: number;
    /** Multiplier on the type's body. Absent = 1 (world.Prop.VisualBody). */
    scale?: number;
}

/** What the map needs from an api/props/*.json definition. */
export interface MapPropDefinition {
    entityType: string;
    body: { radius?: number; width?: number; height?: number };
}

/** One icon style: GraphicsConfig.miniMap.icons' shape. */
export interface MapIconStyle {
    color: number;
    alpha: number;
    /** Half-extent drawn = visual half-extent × sizeFactor × MAP_ICON_SIZE. */
    sizeFactor: number;
}

export type MapPropKind = 'tree' | 'stone' | 'prop';

/**
 * The factor the live icons were scaled by (MiniMap's old
 * `sizeFactorRelatedToMapSize`), kept so a baked tree and stone are exactly the
 * size their live icons were: tree 0.6 × 2 = 1.2× its crown, stone 2×. A
 * sizeFactor of 0.5 is therefore the prop's true footprint.
 */
export const MAP_ICON_SIZE = 2;

/**
 * Which style a prop draws in, by its RENDER class. Crowns read as trees;
 * `Stone` (Rock, Boulder) keeps its hexagon; everything else — buildings, carts,
 * stumps, fences — is a footprint in the one prop colour. [PLACEHOLDER] grouping.
 */
const KIND_BY_ENTITY_TYPE: Record<string, MapPropKind> = {
    RoundTree: 'tree',
    PineTree: 'tree',
    Bush: 'tree',
    Stone: 'stone',
};

export function mapPropKind(entityType: string): MapPropKind {
    return KIND_BY_ENTITY_TYPE[entityType] ?? 'prop';
}

export interface MapPropShape {
    kind: MapPropKind;
    /** A rect body draws as a turned rectangle, a round one as a circle (a
     *  stone: a hexagon). */
    rect: boolean;
    x: number;
    y: number;
    halfWidth: number;
    halfHeight: number;
    rotation: number;
    color: number;
    alpha: number;
}

/**
 * Resolves every placement to the shape the map draws, in zone-local px.
 *
 * A placement whose type this build does not know (a prop added since the last
 * webpack build) is skipped and counted, never guessed at: the caller warns, the
 * way MapTerrain does for an unknown terrain piece.
 */
export function mapPropShapes(
    props: MapPropPlacement[] | undefined,
    definitionOf: (type: string) => MapPropDefinition | undefined,
    styles: Record<MapPropKind, MapIconStyle>,
    worldToPx: number,
): { shapes: MapPropShape[]; unknown: number } {
    const shapes: MapPropShape[] = [];
    let unknown = 0;
    for (const prop of props ?? []) {
        if (!prop || !Number.isFinite(prop.x) || !Number.isFinite(prop.y)) {
            continue;
        }
        const def = definitionOf(prop.type);
        if (!def || !def.body) {
            unknown++;
            continue;
        }
        const kind = mapPropKind(def.entityType);
        const style = styles[kind];
        const grow = (prop.scale ?? 1) * style.sizeFactor * MAP_ICON_SIZE * worldToPx;
        const rect = def.body.width !== undefined && def.body.height !== undefined;
        const halfWidth = (rect ? def.body.width / 2 : def.body.radius) * grow;
        const halfHeight = (rect ? def.body.height / 2 : def.body.radius) * grow;
        if (!(halfWidth > 0) || !(halfHeight > 0)) {
            continue;
        }
        shapes.push({
            kind,
            rect,
            x: prop.x * worldToPx,
            y: prop.y * worldToPx,
            halfWidth,
            halfHeight,
            rotation: prop.rotation ?? 0,
            color: style.color,
            alpha: style.alpha,
        });
    }
    return {shapes, unknown};
}
