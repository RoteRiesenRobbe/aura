/**
 * The zone file's prop layers, client side (plan-prop-draw-order.md D1/D3).
 *
 * A zone's `props` is an object of four arrays, one per prop layer. Every
 * client reader of the BUNDLED zone files (the torch lights, the map's prop
 * bake, the in-game editor) wants one flat list instead, and this is the one
 * place that flattens it — in the server's order, so a flat index here and the
 * server's spawn order agree.
 *
 * ⚑ PROP_LAYERS mirrors zone.go's PropLayers, whose FIELD ORDER is the rank
 * (bottom to top). AuraTiledConvert.test.ts scrapes zone.go to pin this list.
 *
 * Pure and DOM-free, so vitest can import it.
 */

export const PROP_LAYERS = ['underfoot', 'default', 'buildings', 'canopy'] as const;
export type PropLayer = typeof PROP_LAYERS[number];

/** Where a placement goes when nobody chose: a new in-game placement. */
export const DEFAULT_PROP_LAYER: PropLayer = 'default';

/** A zone file's `props`: any subset of the four arrays (absent = empty). */
export type PropLayersJSON<P> = Partial<Record<PropLayer, P[]>>;

/**
 * Every placement in rank order, then file order inside a layer, each copied
 * and tagged with the layer it came from. This is the server's spawn order
 * (world.PropLayers.flatten), so it is also the draw order.
 */
export function flattenProps<P extends object>(props: PropLayersJSON<P> | undefined): (P & {layer: PropLayer})[] {
    const out: (P & {layer: PropLayer})[] = [];
    for (const layer of PROP_LAYERS) {
        for (const p of (props && props[layer]) || []) {
            out.push({...p, layer});
        }
    }
    return out;
}

/**
 * The inverse, for a writer: a flat list back to all four arrays, in rank
 * order and empty ones included, each array keeping the list's relative order.
 * An untagged entry lands in DEFAULT_PROP_LAYER.
 */
export function groupProps<P extends {layer?: PropLayer}, Q>(props: P[], toJSON: (p: P) => Q): Record<PropLayer, Q[]> {
    const out = {} as Record<PropLayer, Q[]>;
    for (const layer of PROP_LAYERS) {
        out[layer] = [];
    }
    for (const p of props) {
        out[p.layer || DEFAULT_PROP_LAYER].push(toJSON(p));
    }
    return out;
}
