import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {flattenAreas, OBJECT_KINDS} from './ZoneAreas';
import {flattenProps} from './PropLayers';

// NOT named 'require': TypeScript reserves that identifier at module top level.
const nodeRequire = createRequire(__filename);
const read = (rel: string) => readFileSync(nodeRequire.resolve(rel), 'utf8');

type Placed = {x: number, area: string, layer?: string};
type Obj = {x?: number, points?: {x: number}[], area?: string, layer?: string};

// ⭐ The cross-language pin (plan-prop-draw-order.md P4, D11): the SAME fixture
// and the SAME expectation world/zone_areas_test.go flattens against, so the
// client and the server cannot disagree about the order. It also asserts the
// area each flattened object came from: the PO's condition on D10.
describe('ZoneAreas.flattenAreas', () => {
    const fixture = JSON.parse(read('../../../../../backend/pkg/aura/world/testdata/area-flatten.json'));

    // An object's label is its x, or its first point's: what the fixture names.
    const placed = (o: Obj): Placed => {
        const out: Placed = {x: o.x !== undefined ? o.x : (o.points as {x: number}[])[0].x, area: o.area || ''};
        if (o.layer) { out.layer = o.layer; }
        return out;
    };

    it('flattens the shared fixture exactly as the server does', () => {
        const flat = flattenAreas(fixture.zone) as Record<string, unknown>;
        const got: Record<string, Placed[]> = {};
        OBJECT_KINDS.forEach(kind => {
            const objs = kind === 'props'
                ? flattenProps(flat.props as Record<string, Obj[]>)
                : flat[kind] as Obj[];
            got[kind] = objs.map(placed);
        });
        expect(got).toEqual(fixture.expected);
        expect(flat).not.toHaveProperty('areas');
    });

    it('covers every object kind in the fixture', () => {
        expect(Object.keys(fixture.expected).sort()).toEqual([...OBJECT_KINDS].sort());
    });

    // ⚑ "zone-level objects carry none" is literal: no `area` key at all, so a
    // reader cannot mistake "" for an area named nothing.
    it('tags only area objects, and copies rather than mutates', () => {
        const before = JSON.stringify(fixture.zone);
        const flat = flattenAreas(fixture.zone) as {spawns: Obj[], props: {canopy: Obj[]}};
        expect(flat.spawns[0]).not.toHaveProperty('area');
        expect(flat.props.canopy[0]).not.toHaveProperty('area');
        expect(flat.spawns[2].area).toBe('farmlands');
        expect(JSON.stringify(fixture.zone)).toBe(before);
    });

    it('hands back a zone with no areas untouched', () => {
        const zone = {name: 'Z', spawns: [{x: 1}], props: {default: [{x: 2}]}};
        expect(flattenAreas(zone)).toBe(zone);
    });

    // A kind no area holds keeps its zone-level shape, absent included, so a
    // reader that tells "absent" from "empty" sees exactly the file.
    it('leaves a kind alone when no area holds it', () => {
        const flat = flattenAreas({name: 'Z', areas: [{id: 'a', anchors: [{x: 1}]}]}) as Record<string, unknown>;
        expect(Object.keys(flat).sort()).toEqual(['anchors', 'name']);
    });

    // The kind list mirrors zone.go's Objects, scraped from the struct the
    // server decodes, so a new object array cannot be flattened on one side only.
    it('the object kinds are zone.go\'s Objects keys', () => {
        const body = /type Objects struct \{([\s\S]*?)\n\}/.exec(read('../../../../../backend/pkg/aura/world/zone.go'));
        expect(body, 'zone.go no longer declares Objects where this test looks').not.toBeNull();
        const goKinds = [...(body as RegExpExecArray)[1].matchAll(/`json:"([^",]+)/g)].map(m => m[1]);
        expect([...OBJECT_KINDS]).toEqual(goKinds);
    });
});
