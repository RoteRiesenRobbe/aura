// Package mapfog is the server's record of how much of the world map one
// character has uncovered (plan-map-fog-persistence.md F1).
//
// ⭐ THE SERVER TRACKS THE REVEAL; THE CLIENT NEVER UPLOADS IT (D1). The loop
// already knows every character's position and the AOI it streams, so the
// reveal is derived from that, marked into a coverage bitmap and persisted with
// the rest of the character.
//
// ⚑ EXPLORED-ONLY CHUNKS IN WORLD COORDINATES (D2, D9). The world is one shared
// coordinate space every zone is placed into, so a cell needs no zone lookup
// and a resized zone keeps its reveal. Memory, rows and fingerprint work all
// scale with what the character has SEEN, not with the size of the world.
//
// ⚑ A BIT IS COVERAGE, NOT "WHERE I STOOD" (D4): every cell the AOI rectangle
// overlaps is set, so the client restores a zone's reveal in one draw rather
// than replaying a stamp per step.
package mapfog

import (
	"math"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/constant"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/persist"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
)

// CellSize is a cell's side in world units, ChunkCells a chunk's side in
// cells: 2 u and 64 cells, so a chunk is 128 × 128 u and 512 bytes.
// [PLACEHOLDER] both (D3; revisit at plan-minimap-local-viewport.md's look
// sitting). Each stored chunk carries both, so changing either is a reset,
// not a migration (D10).
const (
	CellSize   = 2
	ChunkCells = 64
	chunkBytes = ChunkCells * ChunkCells / 8
)

// aoiHalfWidth / aoiHalfHeight are the fixed AOI the reveal is marked with.
//
// ⚑ THE CONSTANTS, never the player's live viewport body (L4, D11). A flyer
// streams a scaled viewport, and reading that here would let a flight
// silently widen the stored reveal past what the client stamps.
const (
	aoiHalfWidth  = constant.ViewPortWidth / 2
	aoiHalfHeight = constant.ViewPortHeight / 2
)

type chunkKey struct{ x, y int16 }

type cell struct{ x, y int }

// Fog is one character's reveal. The zero value is not usable; use New.
//
// Loop-only: nothing here is safe for concurrent use, which is why Chunks
// copies before anything crosses to the writer goroutine.
type Fog struct {
	chunks map[chunkKey]*[chunkBytes]byte
	// last is the cell the previous mark was taken in (D5), valid once marked.
	last   cell
	marked bool
}

// New returns an empty reveal.
func New() *Fog {
	return &Fog{chunks: map[chunkKey]*[chunkBytes]byte{}}
}

// cellOf maps a world coordinate to its cell index.
//
// ⛔ math.Floor, never an integer conversion: conversion truncates toward zero
// and merges cells −1 and 0, which is exactly the negative quadrant world.json
// spans (L3).
func cellOf(coord float32) int {
	return int(math.Floor(float64(coord) / CellSize))
}

// chunkOf maps a cell index to its chunk index, flooring for the same reason.
func chunkOf(c int) int {
	return int(math.Floor(float64(c) / ChunkCells))
}

// representable reports whether a coordinate lands in a chunk an int16 index
// can name. World content stays inside ±world.MaxWorldCoordinate (chunk ±64);
// this only guards against a non-finite or runaway position wrapping into
// somebody else's chunk.
func representable(coord float32) bool {
	const limit = math.MaxInt16 * CellSize * ChunkCells / 2
	return coord > -limit && coord < limit // false for NaN too
}

// MarkAt reveals the fixed AOI around pos, reporting whether it marked.
//
// ⚑ GATED ON ENTERING A NEW CELL (D5), the rule MapFog.revealAt already uses
// client-side: a standing character costs one comparison per tick.
func (f *Fog) MarkAt(pos phy.Vec2f) bool {
	if !representable(pos.X) || !representable(pos.Y) {
		return false
	}
	here := cell{cellOf(pos.X), cellOf(pos.Y)}
	if f.marked && here == f.last {
		return false
	}
	f.last, f.marked = here, true

	// ⚑ THE RECTANGLE COMES FROM THE CELL, not the exact position. Marking is
	// gated per cell, so it must cover every cell the AOI overlaps from ANY
	// position inside this one: reachX / reachY cells either side, always.
	// Deriving it from the position instead left a sliver of up to one cell
	// unrevealed at the far edge when a cell was entered exactly on its line (a
	// warp to whole coordinates) and then crossed without leaving it. Erring
	// toward revealing is D4's rule.
	for cy := here.y - reachY; cy <= here.y+reachY; cy++ {
		for cx := here.x - reachX; cx <= here.x+reachX; cx++ {
			f.set(cx, cy)
		}
	}
	return true
}

// reachX / reachY are how many cells the AOI can overlap either side of the
// cell its centre is in: ceil(half-AOI / cell). With today's numbers 5 and 3,
// so a mark is 11 × 7 cells. Computed, not hand-written, because CellSize is a
// [PLACEHOLDER] and a half-AOI that stops dividing evenly must still round up.
var (
	reachX = int(math.Ceil(aoiHalfWidth / CellSize))
	reachY = int(math.Ceil(aoiHalfHeight / CellSize))
)

// locate splits a cell index into its chunk and the bit inside that chunk:
// row-major, LSB-first within a byte (the layout F2's client decodes).
func locate(cx, cy int) (chunkKey, int) {
	chx, chy := chunkOf(cx), chunkOf(cy)
	lx, ly := cx-chx*ChunkCells, cy-chy*ChunkCells
	return chunkKey{int16(chx), int16(chy)}, ly*ChunkCells + lx
}

func (f *Fog) set(cx, cy int) {
	key, bit := locate(cx, cy)
	bits := f.chunks[key]
	if bits == nil {
		bits = new([chunkBytes]byte)
		f.chunks[key] = bits
	}
	bits[bit/8] |= 1 << (bit % 8)
}

// Revealed reports whether a cell is set.
func (f *Fog) Revealed(cx, cy int) bool {
	if f == nil {
		return false
	}
	key, bit := locate(cx, cy)
	bits := f.chunks[key]
	return bits != nil && bits[bit/8]&(1<<(bit%8)) != 0
}

// RevealedAt reports whether the cell holding a world position is set.
func (f *Fog) RevealedAt(pos phy.Vec2f) bool {
	return f.Revealed(cellOf(pos.X), cellOf(pos.Y))
}

// Len is the number of explored chunks.
func (f *Fog) Len() int {
	if f == nil {
		return 0
	}
	return len(f.chunks)
}

// Seed unions stored chunks into the reveal.
//
// ⚑ UNION, never replace: a character rejoining through character-select after
// dying carries a live reveal newer than the snapshot /select read, and the
// campfire set's "carried state wins" rule can honour both halves here too.
//
// ⚑ A chunk drawn on another grid, or whose bitmap does not fit its grid, is
// skipped silently (D10): unresolvable stored state is never a join failure.
func (f *Fog) Seed(chunks []persist.FogChunk) {
	for _, c := range chunks {
		if c.CellSize != CellSize || c.ChunkCells != ChunkCells || len(c.Bits) != chunkBytes {
			continue
		}
		key := chunkKey{c.X, c.Y}
		bits := f.chunks[key]
		if bits == nil {
			bits = new([chunkBytes]byte)
			f.chunks[key] = bits
		}
		for i, b := range c.Bits {
			bits[i] |= b
		}
	}
}

// Chunks snapshots the reveal as persisted chunks sorted by (x, y), or nil
// when nothing is revealed.
//
// ⚑ A COPY, not a view: the snapshot goes to the writer goroutine while the
// loop keeps marking into the live bitmaps.
func (f *Fog) Chunks() []persist.FogChunk {
	if f.Len() == 0 {
		return nil
	}
	out := make([]persist.FogChunk, 0, len(f.chunks))
	for key, bits := range f.chunks {
		out = append(out, persist.FogChunk{
			X: key.x, Y: key.y,
			CellSize: CellSize, ChunkCells: ChunkCells,
			Bits: append([]byte(nil), bits[:]...),
		})
	}
	persist.SortFogChunks(out)
	return out
}
