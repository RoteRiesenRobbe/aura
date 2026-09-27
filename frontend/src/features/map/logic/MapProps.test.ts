import {describe, expect, it} from 'vitest';
import {MAP_ICON_SIZE, MapIconStyle, MapPropDefinition, MapPropKind, mapPropKind, mapPropShapes} from './MapProps';

const PX = 120;

const STYLES: Record<MapPropKind, MapIconStyle> = {
    tree: {color: 0x00ff00, alpha: 0.8, sizeFactor: 0.6},
    stone: {color: 0x777777, alpha: 1, sizeFactor: 1},
    prop: {color: 0x553311, alpha: 0.9, sizeFactor: 0.5},
};

const DEFS: Record<string, MapPropDefinition> = {
    Tree: {entityType: 'RoundTree', body: {radius: 1}},
    Rock: {entityType: 'Stone', body: {radius: 0.5}},
    House: {entityType: 'House', body: {width: 4, height: 3}},
};
const lookup = (type: string) => DEFS[type];

describe('mapPropKind', () => {
    it('groups crowns as trees, Stone as stone, and everything else as a prop', () => {
        expect(mapPropKind('RoundTree')).toBe('tree');
        expect(mapPropKind('PineTree')).toBe('tree');
        expect(mapPropKind('Stone')).toBe('stone');
        expect(mapPropKind('House')).toBe('prop');
        expect(mapPropKind('SomethingNew')).toBe('prop');
    });
});

describe('mapPropShapes', () => {
    it('keeps a tree at the size its live icon had (1.2 × its crown)', () => {
        const {shapes} = mapPropShapes([{type: 'Tree', x: 10, y: -5}], lookup, STYLES, PX);
        expect(shapes).toHaveLength(1);
        const s = shapes[0];
        expect(s).toMatchObject({kind: 'tree', rect: false, x: 1200, y: -600, rotation: 0, color: 0x00ff00});
        expect(s.halfWidth).toBeCloseTo(1 * 0.6 * MAP_ICON_SIZE * PX);
        expect(s.halfWidth).toBeCloseTo(1.2 * PX);
        expect(s.halfHeight).toBe(s.halfWidth);
    });

    it('applies the placement scale, as world.Prop.VisualBody does', () => {
        const {shapes} = mapPropShapes([{type: 'Tree', x: 0, y: 0, scale: 2.5}], lookup, STYLES, PX);
        expect(shapes[0].halfWidth).toBeCloseTo(2.5 * 1.2 * PX);
    });

    it('draws a rect body at its true footprint, turned, with its aspect', () => {
        const {shapes} = mapPropShapes([{type: 'House', x: 1, y: 2, rotation: 0.7}], lookup, STYLES, PX);
        expect(shapes[0]).toMatchObject({kind: 'prop', rect: true, rotation: 0.7});
        expect(shapes[0].halfWidth).toBeCloseTo(2 * PX);
        expect(shapes[0].halfHeight).toBeCloseTo(1.5 * PX);
    });

    it('skips and counts a type this build does not know', () => {
        const {shapes, unknown} = mapPropShapes(
            [{type: 'Tree', x: 0, y: 0}, {type: 'NotBuiltYet', x: 1, y: 1}], lookup, STYLES, PX);
        expect(shapes).toHaveLength(1);
        expect(unknown).toBe(1);
    });

    it('drops a placement with no position and tolerates an absent list', () => {
        expect(mapPropShapes([{type: 'Tree', x: NaN, y: 0}], lookup, STYLES, PX).shapes).toEqual([]);
        expect(mapPropShapes(undefined, lookup, STYLES, PX)).toEqual({shapes: [], unknown: 0});
    });

    it('drops a degenerate body rather than drawing a NaN shape', () => {
        const broken = (t: string) => t === 'Flat' ? {entityType: 'Flat', body: {width: 0, height: 2}} : undefined;
        expect(mapPropShapes([{type: 'Flat', x: 0, y: 0}], broken, STYLES, PX).shapes).toEqual([]);
    });
});
