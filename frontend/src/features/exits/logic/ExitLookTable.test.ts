import {createRequire} from 'node:module';
import {describe, expect, it} from 'vitest';
import {DEFAULT_EXIT_LOOK, EXIT_LOOK_SIZES, exitLookPlacements} from './ExitLookTable';

const nodeRequire = createRequire(__filename);
const content = nodeRequire('../../../../../tools/tiled/palette/content.json');

describe('ExitLookTable (plan-passages.md P2)', () => {
    // The table is the client's copy of the look names; the palette's sizes
    // are generated from the converter's names (pinned to zone.go) and this
    // table's own JSON, so Tiled offers exactly what the client draws.
    it('draws every look Tiled offers, at the size Tiled boxes it', () => {
        const looks = Object.keys(content.EXIT_LOOK_SIZE);
        expect(looks[0]).toBe(DEFAULT_EXIT_LOOK);
        expect(Object.keys(EXIT_LOOK_SIZES).sort()).toEqual([...looks].sort());
        for (const look of looks) {
            expect(content.EXIT_LOOK_SIZE[look]).toEqual({w: EXIT_LOOK_SIZES[look].width, h: EXIT_LOOK_SIZES[look].height});
        }
    });

    it('places a look on its exit, origin applied, default for an absent look', () => {
        const px = (u: number) => u * 120;
        const out = exitLookPlacements([
            {x: 1, y: 2},
            {x: 3, y: 4, rotation: 1.5, look: 'stairs-up'},
            {x: 5, y: 6, look: 'door', hidden: true},
            {x: 7, y: 8, look: 'trapdoor'},
        ], {x: 100, y: -50}, px);
        expect(out).toEqual([
            {look: DEFAULT_EXIT_LOOK, x: 101 * 120, y: -48 * 120,
                width: px(EXIT_LOOK_SIZES[DEFAULT_EXIT_LOOK].width),
                height: px(EXIT_LOOK_SIZES[DEFAULT_EXIT_LOOK].height), rotation: 0},
            {look: 'stairs-up', x: 103 * 120, y: -46 * 120,
                width: px(EXIT_LOOK_SIZES['stairs-up'].width),
                height: px(EXIT_LOOK_SIZES['stairs-up'].height), rotation: 1.5},
        ]);
        expect(exitLookPlacements(undefined, undefined, px)).toEqual([]);
    });
});
