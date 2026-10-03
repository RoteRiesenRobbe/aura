/**
 * A zone file's areas, client side (plan-prop-draw-order.md P4, D10-D12).
 *
 * An area is a named group of objects (`areas: [{id, spawns, props, …}]`), for
 * the author's convenience in Tiled. It changes nothing in game: every reader
 * flattens it away at load, exactly as the server does, so no feature module
 * learns that areas exist. This is the client's one copy of that flatten.
 *
 * ⚑ The twin of world.Zone.flatten (zone.go). ZoneAreas.test.ts flattens the
 * server's own fixture (world/testdata/area-flatten.json) against the same
 * expectation, and scrapes OBJECT_KINDS from zone.go's Objects struct.
 *
 * Pure and DOM-free, so vitest can import it.
 */
import {PROP_LAYERS, PropLayersJSON} from './PropLayers';

/** Every object array a zone holds, and so everything an area may hold. */
export const OBJECT_KINDS = [
    'decals', 'props', 'spawns', 'bindPoints', 'darkAreas', 'regions',
    'paths', 'structures', 'atmospheres', 'clearings', 'anchors',
] as const;
export type ObjectKind = typeof OBJECT_KINDS[number];

/** One entry of a zone file's `areas`: an id plus any of the object arrays. */
export interface AreaJSON {
    id: string;
    props?: PropLayersJSON<object>;
    [kind: string]: unknown;
}

/** Copies of an area's objects of one kind, each tagged with the area. */
function tagged(objects: unknown, id: string): object[] {
    return ((objects as object[]) || []).map(o => ({...o, area: id}));
}

/**
 * The zone with every area folded into its own arrays (D11): for each kind,
 * the zone-level objects first, then each area in file order, each in its own
 * array order. Props keep the layer rank as the outer key, which flattenProps
 * then walks: a Dark Woods canopy draws over a Farmlands building.
 *
 * Each area object is a copy carrying `area: <id>`; a zone-level object is
 * left as it is, with no `area` key at all. A kind no area holds keeps its
 * zone-level shape, and a zone with no areas comes back as the same object.
 */
export function flattenAreas<Z extends object>(zone: Z & {areas?: AreaJSON[]}): Z {
    const areas = zone.areas;
    if (!areas) {
        return zone;
    }
    const own = zone as unknown as Record<string, unknown>;
    const out: Record<string, unknown> = {...own};
    delete out.areas;
    for (const kind of OBJECT_KINDS) {
        if (kind === 'props') {
            continue;
        }
        const fromAreas = areas.flatMap(a => tagged(a[kind], a.id));
        if (fromAreas.length > 0) {
            out[kind] = [...((own[kind] as object[]) || []), ...fromAreas];
        }
    }
    if (areas.some(a => a.props)) {
        const zoneProps = (own.props || {}) as PropLayersJSON<object>;
        const props: PropLayersJSON<object> = {};
        for (const layer of PROP_LAYERS) {
            props[layer] = [...(zoneProps[layer] || []),
                ...areas.flatMap(a => tagged(a.props && a.props[layer], a.id))];
        }
        out.props = props;
    }
    return out as Z;
}
