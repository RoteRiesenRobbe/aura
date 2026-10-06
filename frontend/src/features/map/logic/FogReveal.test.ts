import {describe, expect, it} from 'vitest';
import {FogChunkData, MapFogData, mergeMapFog, zoneCellMask} from './FogReveal';

const N = 64;

/** A chunk on the server's grid with the given WORLD cells set. */
function chunkWith(x: number, y: number, cells: [number, number][]): FogChunkData {
    const bits = new Uint8Array(N * N / 8);
    for (const [cx, cy] of cells) {
        const bit = (cy - y * N) * N + (cx - x * N);
        bits[bit >> 3] |= 1 << (bit & 7);
    }
    return {x, y, bits};
}

function fog(...chunks: FogChunkData[]): MapFogData {
    return {cellSize: 2, chunkCells: N, chunks};
}

function isRevealed(mask: ReturnType<typeof zoneCellMask>, cx: number, cy: number): boolean {
    const col = cx - mask.cellX0, row = cy - mask.cellY0;
    if (col < 0 || row < 0 || col >= mask.cols || row >= mask.rows) {
        return false;
    }
    return mask.revealed[row * mask.cols + col] === 1;
}

describe('zoneCellMask', () => {
    it('decodes the LSB-first, row-major layout the server writes', () => {
        // Server pin: local (1, 0) is bit 1 of byte 0; local (0, 1) is bit 0 of
        // byte N/8 (TestBitLayout_RowMajorLSBFirst).
        const bits = new Uint8Array(N * N / 8);
        bits[0] = 0b10;
        bits[N / 8] = 0b1;
        const mask = zoneCellMask(fog({x: 0, y: 0, bits}), {originX: 20, originY: 20, width: 40, height: 40});
        expect(isRevealed(mask, 1, 0)).toBe(true);
        expect(isRevealed(mask, 0, 1)).toBe(true);
        expect(isRevealed(mask, 0, 0)).toBe(false);
        expect(mask.count).toBe(2);
    });

    it('handles negative chunk and cell indices', () => {
        const mask = zoneCellMask(fog(chunkWith(-1, -1, [[-1, -1], [-64, -64]])),
            {originX: 0, originY: 0, width: 540, height: 360});
        expect(isRevealed(mask, -1, -1)).toBe(true);
        expect(isRevealed(mask, -64, -64)).toBe(true);
        expect(isRevealed(mask, 0, 0)).toBe(false);
    });

    // L3: a zone away from the origin maps to different cells. Without the
    // origin term the underworld would read the surface's reveal.
    it('respects a non-zero zone origin', () => {
        const underworld = {originX: 5000, originY: 3000, width: 48, height: 28};
        // cell (2500, 1500) is the underworld's centre; (0, 0) is the surface's.
        const f = fog(chunkWith(39, 23, [[2500, 1500]]), chunkWith(0, 0, [[0, 0]]));
        const mask = zoneCellMask(f, underworld);
        expect(mask.cellX0).toBe(2488);  // floor((5000 - 24) / 2)
        expect(mask.cellY0).toBe(1493);  // floor((3000 - 14) / 2)
        expect(isRevealed(mask, 2500, 1500)).toBe(true);
        expect(mask.count).toBe(1);
    });

    // L7: one chunk can span two zones; each takes only its own cells.
    it('splits a chunk that straddles two zones', () => {
        const west = {originX: 20, originY: 20, width: 40, height: 40};    // cells 0…19
        const east = {originX: 100, originY: 20, width: 40, height: 40};   // cells 40…59
        const f = fog(chunkWith(0, 0, [[5, 5], [45, 5]]));
        const w = zoneCellMask(f, west), e = zoneCellMask(f, east);
        expect(isRevealed(w, 5, 5)).toBe(true);
        expect(w.count).toBe(1);
        expect(isRevealed(e, 45, 5)).toBe(true);
        expect(e.count).toBe(1);
    });

    it('covers a cell the zone edge cuts through', () => {
        // A 5-unit-wide zone from x = 0 to 5 overlaps cells 0, 1 and 2 ([4, 6)).
        const mask = zoneCellMask(fog(chunkWith(0, 0, [[2, 0]])),
            {originX: 2.5, originY: 1, width: 5, height: 2});
        expect(mask.cols).toBe(3);
        expect(isRevealed(mask, 2, 0)).toBe(true);
    });

    it('is empty for a fog with no chunks in the zone', () => {
        const mask = zoneCellMask(fog(chunkWith(10, 10, [[650, 650]])),
            {originX: 0, originY: 0, width: 100, height: 100});
        expect(mask.count).toBe(0);
    });
});

describe('mergeMapFog', () => {
    it('unions chunks and bits (D8), never replacing', () => {
        const a = fog(chunkWith(0, 0, [[1, 1]]), chunkWith(-1, 0, [[-1, 0]]));
        const b = fog(chunkWith(0, 0, [[2, 2]]), chunkWith(3, 3, [[200, 200]]));
        const merged = mergeMapFog(mergeMapFog(null, a), b);
        const mask = zoneCellMask(merged, {originX: 0, originY: 0, width: 1000, height: 1000});
        expect(isRevealed(mask, 1, 1)).toBe(true);
        expect(isRevealed(mask, 2, 2)).toBe(true);
        expect(isRevealed(mask, -1, 0)).toBe(true);
        expect(isRevealed(mask, 200, 200)).toBe(true);
        expect(mask.count).toBe(4);
    });

    it('does not alias the publication it merged from', () => {
        const pub = fog(chunkWith(0, 0, [[1, 1]]));
        const held = mergeMapFog(null, pub);
        mergeMapFog(held, fog(chunkWith(0, 0, [[3, 3]])));
        expect(zoneCellMask(pub, {originX: 0, originY: 0, width: 100, height: 100}).count).toBe(1);
    });

    it('a publication on another grid replaces the held copy', () => {
        const held = mergeMapFog(null, fog(chunkWith(0, 0, [[1, 1]])));
        const regrid: MapFogData = {cellSize: 4, chunkCells: N, chunks: [chunkWith(0, 0, [[2, 2]])]};
        const merged = mergeMapFog(held, regrid);
        expect(merged.cellSize).toBe(4);
        expect(merged.chunks).toHaveLength(1);
    });
});

// plan-map-fog-darkness.md C3: a walking publication carries one chunk, and the
// painted canvas must be bounded by it, never by the whole zone.
describe('zoneCellMask bounded by the publication', () => {
    it('spans only the incoming chunk inside a much larger zone', () => {
        const zone = {originX: 0, originY: 0, width: 4 * N * 2, height: 4 * N * 2};
        const mask = zoneCellMask(fog(chunkWith(1, 0, [[N + 3, 5]])), zone);
        expect(mask.cols).toBe(N);
        expect(mask.rows).toBe(N);
        expect(mask.cellX0).toBe(N);
        expect(mask.cellY0).toBe(0);
        expect(isRevealed(mask, N + 3, 5)).toBe(true);
        expect(mask.count).toBe(1);
    });

    it('still clips to the zone when the chunk is larger than it', () => {
        const mask = zoneCellMask(fog(chunkWith(0, 0, [[1, 1]])), {originX: 4, originY: 4, width: 8, height: 8});
        expect(mask.cols).toBe(4);
        expect(mask.rows).toBe(4);
        expect(isRevealed(mask, 1, 1)).toBe(true);
    });
});
