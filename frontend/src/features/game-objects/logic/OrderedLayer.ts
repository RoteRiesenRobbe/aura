import {Container} from 'pixi.js';

/**
 * Ordered insertion into a container (plan-prop-draw-order.md D6).
 *
 * PixiJS draws a container's children in child order, and `addChild` appends,
 * so the last prop to ARRIVE drew on top. Arrival order is whatever a snapshot
 * happens to bring, and a prop that leaves the view and comes back is rebuilt
 * and appended again, so the stacking changed every time you walked away.
 *
 * Here each child carries a key (the entity id), and it is inserted at its
 * key's slot by binary search, so the container stays sorted by construction.
 * ⚑ No `sortableChildren`: that re-sorts on every add and remove, and props
 * enter and leave the view continuously.
 *
 * ⭐ The key is the entity id because the server spawns props in zone-file
 * order (cmd/aurad propEntities): id order IS Tiled's object order.
 *
 * A child added any other way has no key and is treated as +∞, so it stays on
 * top instead of breaking the search.
 */
const keys = new WeakMap<Container, number>();

function keyOf(child: Container): number {
    const key = keys.get(child);
    return key === undefined ? Infinity : key;
}

export function addChildOrdered(layer: Container, child: Container, key: number): void {
    keys.set(child, key);
    const children = layer.children as Container[];
    // Upper bound: the first child whose key is greater, so equal keys keep
    // their arrival order.
    let lo = 0;
    let hi = children.length;
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (keyOf(children[mid]) <= key) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }
    layer.addChildAt(child, lo);
}
