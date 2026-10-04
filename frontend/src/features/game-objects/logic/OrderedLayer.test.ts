import {describe, expect, it} from 'vitest';
import {Container} from 'pixi.js';
import {addChildOrdered} from './OrderedLayer';

/**
 * plan-prop-draw-order.md P1 (D6): a prop container stays sorted by entity id,
 * whatever order the props arrive in. Ids ascend in zone-file order, so this is
 * what makes a later prop in the file draw over an earlier one, every time.
 */
describe('addChildOrdered', () => {
    function keysOf(layer: Container, byChild: Map<Container, number>) {
        return layer.children.map(c => byChild.get(c as Container));
    }

    function fill(order: number[]) {
        const layer = new Container();
        const byChild = new Map<Container, number>();
        for (const key of order) {
            const child = new Container();
            byChild.set(child, key);
            addChildOrdered(layer, child, key);
        }
        return {layer, byChild};
    }

    it('sorts by key whatever the arrival order', () => {
        const {layer, byChild} = fill([5, 1, 9, 3, 7, 2, 8]);
        expect(keysOf(layer, byChild)).toEqual([1, 2, 3, 5, 7, 8, 9]);
    });

    it('puts a prop back in its own slot after it leaves and returns', () => {
        // The walk-away-and-return case: EntityManager hides a prop that left
        // the view, and the next sighting rebuilds it, which used to append it
        // on top of everything near it.
        const {layer, byChild} = fill([1, 2, 3, 4]);
        const two = layer.children[1] as Container;
        layer.removeChild(two);
        const back = new Container();
        byChild.set(back, 2);
        addChildOrdered(layer, back, 2);
        expect(keysOf(layer, byChild)).toEqual([1, 2, 3, 4]);
    });

    it('keeps an unkeyed child on top rather than guessing its place', () => {
        const layer = new Container();
        const stray = new Container();
        layer.addChild(stray);
        const a = new Container();
        const b = new Container();
        addChildOrdered(layer, b, 2);
        addChildOrdered(layer, a, 1);
        expect(layer.children).toEqual([a, b, stray]);
    });
});
