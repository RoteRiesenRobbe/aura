/**
 * The stored map reveal, decoded (plan-map-fog-persistence.md F2).
 *
 * The server tracks what each character has uncovered as a coverage bitmap of
 * world-space cells, stored as explored CHUNKS only and published once on
 * entering the world (D7). This module is the pure half of restoring it: the
 * client-side merge of publications (D8) and the chunk → one-zone cell mask
 * the fog texture is painted from. Nothing here touches PixiJS, so it runs
 * under vitest; MapFog.applyRevealed does the drawing.
 *
 * ⭐ WORLD COORDINATES, NO ZONE ID (D9). A chunk is only a storage page: it can
 * straddle two zones (L7), so a zone takes the CELLS inside its own rectangle,
 * never a whole chunk. Which map shows a cell is decided here, on the client.
 *
 * Units: everything in this file is in WORLD UNITS (server units), not px.
 */

/** One explored chunk, exactly as the wire carries it. */
export interface FogChunkData {
    /** World-space chunk index; may be negative. */
    x: number;
    y: number;
    /**
     * chunkCells² coverage bits: row-major within the chunk, LSB-first within
     * a byte (the server's mapfog layout, pinned there by
     * TestBitLayout_RowMajorLSBFirst).
     */
    bits: Uint8Array;
}

/** A publication, or the client's merged copy of all of them. */
export interface MapFogData {
    /** World units per cell side. */
    cellSize: number;
    /** Cells per chunk side. */
    chunkCells: number;
    chunks: FogChunkData[];
}

/** A zone's rectangle in world units. Zones are origin-centred. */
export interface ZoneRect {
    originX: number;
    originY: number;
    width: number;
    height: number;
}

/**
 * The revealed cells of ONE zone, one entry per cell of the zone's cell range.
 * `revealed[row * cols + col]` is 1 for world cell (cellX0 + col, cellY0 + row).
 */
export interface CellMask {
    cellX0: number;
    cellY0: number;
    cols: number;
    rows: number;
    revealed: Uint8Array;
    /** How many cells are revealed; 0 means there is nothing to draw. */
    count: number;
}

/**
 * Unions a new publication into what the client already holds (D8).
 *
 * ⚑ UNION, never replace: a respawn re-sends a set the client already drew,
 * and a later publication may carry areas this session never saw. A
 * publication on a DIFFERENT grid replaces the held copy outright — its bits
 * name other cells, so ORing them would be nonsense. (The server only changes
 * grid across a deploy, which is a new page load anyway.)
 */
export function mergeMapFog(held: MapFogData | null, incoming: MapFogData): MapFogData {
    if (!held || held.cellSize !== incoming.cellSize || held.chunkCells !== incoming.chunkCells) {
        return {
            cellSize: incoming.cellSize,
            chunkCells: incoming.chunkCells,
            chunks: incoming.chunks.map(c => ({x: c.x, y: c.y, bits: c.bits.slice()})),
        };
    }
    const byKey = new Map<string, FogChunkData>();
    for (const c of held.chunks) {
        byKey.set(`${c.x}:${c.y}`, c);
    }
    for (const c of incoming.chunks) {
        const known = byKey.get(`${c.x}:${c.y}`);
        if (!known || known.bits.length !== c.bits.length) {
            byKey.set(`${c.x}:${c.y}`, {x: c.x, y: c.y, bits: c.bits.slice()});
            continue;
        }
        for (let i = 0; i < c.bits.length; i++) {
            known.bits[i] |= c.bits[i];
        }
    }
    return {cellSize: held.cellSize, chunkCells: held.chunkCells, chunks: Array.from(byKey.values())};
}

/**
 * The cells of `zone` that `fog` reveals.
 *
 * The range is every cell the zone's rectangle overlaps: a cell straddling the
 * zone's edge is included and clipped by the fog texture's own bounds when it
 * is drawn. ⚑ The zone's ORIGIN is part of the rectangle (L3): a zone placed
 * away from {0,0} — the underworld — maps to entirely different cells.
 */
export function zoneCellMask(fog: MapFogData, zone: ZoneRect): CellMask {
    const cs = fog.cellSize;
    const n = fog.chunkCells;
    const cellX0 = Math.floor((zone.originX - zone.width / 2) / cs);
    const cellY0 = Math.floor((zone.originY - zone.height / 2) / cs);
    const cellX1 = Math.ceil((zone.originX + zone.width / 2) / cs) - 1;
    const cellY1 = Math.ceil((zone.originY + zone.height / 2) / cs) - 1;
    const cols = Math.max(0, cellX1 - cellX0 + 1);
    const rows = Math.max(0, cellY1 - cellY0 + 1);
    const revealed = new Uint8Array(cols * rows);
    let count = 0;

    for (const chunk of fog.chunks) {
        const baseX = chunk.x * n;
        const baseY = chunk.y * n;
        // Skip a chunk wholly outside the zone's cell range.
        if (baseX + n - 1 < cellX0 || baseX > cellX1 || baseY + n - 1 < cellY0 || baseY > cellY1) {
            continue;
        }
        const fromX = Math.max(baseX, cellX0), toX = Math.min(baseX + n - 1, cellX1);
        const fromY = Math.max(baseY, cellY0), toY = Math.min(baseY + n - 1, cellY1);
        for (let cy = fromY; cy <= toY; cy++) {
            for (let cx = fromX; cx <= toX; cx++) {
                const bit = (cy - baseY) * n + (cx - baseX);
                if ((chunk.bits[bit >> 3] >> (bit & 7)) & 1) {
                    const i = (cy - cellY0) * cols + (cx - cellX0);
                    if (!revealed[i]) {
                        revealed[i] = 1;
                        count++;
                    }
                }
            }
        }
    }
    return {cellX0, cellY0, cols, rows, revealed, count};
}
