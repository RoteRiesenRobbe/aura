package mapfog

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/persist"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
)

// ⚑ L3: the negative quadrant is where truncation ships wrong. int(-0.5) is 0,
// which merges cells −1 and 0 and chunks −1 and 0.
func TestCellOf_FloorsOnBothSidesOfZero(t *testing.T) {
	cases := []struct {
		coord float32
		cell  int
	}{
		{0, 0},
		{1.99, 0},
		{2, 1},
		{-0.01, -1},
		{-2, -1},
		{-2.01, -2},
		{8192, 4096},
		{-8192, -4096},
	}
	for _, c := range cases {
		assert.Equal(t, c.cell, cellOf(c.coord), "cellOf(%v)", c.coord)
	}
}

func TestChunkOf_FloorsOnBothSidesOfZero(t *testing.T) {
	cases := []struct {
		cell  int
		chunk int
	}{
		{0, 0},
		{ChunkCells - 1, 0},
		{ChunkCells, 1},
		{-1, -1},
		{-ChunkCells, -1},
		{-ChunkCells - 1, -2},
		{4096, 64},
		{-4096, -64},
	}
	for _, c := range cases {
		assert.Equal(t, c.chunk, chunkOf(c.cell), "chunkOf(%d)", c.cell)
	}
}

// D4: every cell the AOI can overlap from anywhere in the centre's cell is
// set, and nothing else. The centre (20, 16) is cell (10, 8); the 20 × 12 AOI
// reaches 5 cells either side in x and 3 in y → cells x 5…15, y 5…11.
func TestMarkAt_SetsTheCellsTheAOICanOverlapFromThisCell(t *testing.T) {
	f := New()
	require.True(t, f.MarkAt(phy.Vec2f{X: 20, Y: 16}))

	for cy := 0; cy <= 15; cy++ {
		for cx := 0; cx <= 20; cx++ {
			want := cx >= 5 && cx <= 15 && cy >= 5 && cy <= 11
			assert.Equal(t, want, f.Revealed(cx, cy), "cell (%d, %d)", cx, cy)
		}
	}
	assert.Equal(t, 1, f.Len(), "one chunk touched")
}

// The review's hole, pinned: a cell entered exactly on its line and then
// crossed without leaving it must not leave the far-edge cell fogged. The
// gate suppresses the second mark, so the first has to have covered it.
func TestMarkAt_EnteringACellOnItsLineStillCoversTheWholeCell(t *testing.T) {
	f := New()
	f.MarkAt(phy.Vec2f{X: 20, Y: 16})
	require.False(t, f.MarkAt(phy.Vec2f{X: 21.9, Y: 17.9}), "same cell: gated")
	assert.True(t, f.Revealed(15, 11), "the AOI at (21.9, 17.9) overlaps cell (15, 11)")
}

// Across the origin: the AOI straddles four chunks, and the cells on both
// sides of 0 are set.
func TestMarkAt_AcrossTheOriginTouchesFourChunks(t *testing.T) {
	f := New()
	f.MarkAt(phy.Vec2f{X: 0, Y: 0})
	assert.Equal(t, 4, f.Len(), "(−1,−1) (0,−1) (−1,0) (0,0)")
	assert.True(t, f.Revealed(-1, -1))
	assert.True(t, f.Revealed(-5, -3), "cell (0, 0) ± (5, 3)")
	assert.True(t, f.Revealed(5, 3))
	assert.False(t, f.Revealed(-6, 0))
	assert.False(t, f.Revealed(6, 0))
	assert.False(t, f.Revealed(0, -4))
	assert.False(t, f.Revealed(0, 4))
}

// A chunk boundary away from the origin: two chunks, not four.
func TestMarkAt_AcrossOneChunkEdgeTouchesTwoChunks(t *testing.T) {
	f := New()
	edge := float32(ChunkCells * CellSize) // x = 128 is chunk 1's first cell
	f.MarkAt(phy.Vec2f{X: edge, Y: 30})
	assert.Equal(t, 2, f.Len())
	assert.True(t, f.Revealed(ChunkCells-1, 15))
	assert.True(t, f.Revealed(ChunkCells, 15))
}

// D5: a standing character costs one comparison per tick. Re-marking inside
// the same cell does nothing and says so.
func TestMarkAt_IsGatedOnEnteringANewCell(t *testing.T) {
	f := New()
	assert.True(t, f.MarkAt(phy.Vec2f{X: 20.1, Y: 16.1}))
	for i := range 30 {
		assert.False(t, f.MarkAt(phy.Vec2f{X: 20.9, Y: 16.9}), "same cell, tick %d", i)
	}
	assert.True(t, f.MarkAt(phy.Vec2f{X: 22.1, Y: 16.1}), "a new cell marks")
	assert.False(t, f.MarkAt(phy.Vec2f{X: 22.1, Y: 16.1}))
}

// A position no grid can hold (a NaN from a physics bug, a teleport into the
// void) marks nothing rather than wrapping an int16 into someone else's chunk.
func TestMarkAt_IgnoresUnrepresentablePositions(t *testing.T) {
	f := New()
	nan := float32(0)
	nan = nan / nan
	f.MarkAt(phy.Vec2f{X: nan, Y: 0})
	f.MarkAt(phy.Vec2f{X: 1e9, Y: 0})
	f.MarkAt(phy.Vec2f{X: 0, Y: -1e9})
	assert.Equal(t, 0, f.Len())
}

// Only touched chunks exist, the output is sorted by (x, y), and every chunk
// carries the grid it was drawn on (D10).
func TestChunks_SortedAndStampedWithTheGrid(t *testing.T) {
	f := New()
	f.MarkAt(phy.Vec2f{X: 0, Y: 0})
	chunks := f.Chunks()
	require.Len(t, chunks, 4)
	var keys [][2]int16
	for _, c := range chunks {
		keys = append(keys, [2]int16{c.X, c.Y})
		assert.Equal(t, int16(CellSize), c.CellSize)
		assert.Equal(t, int16(ChunkCells), c.ChunkCells)
		assert.Len(t, c.Bits, chunkBytes)
	}
	assert.Equal(t, [][2]int16{{-1, -1}, {-1, 0}, {0, -1}, {0, 0}}, keys)
}

// ⚑ The snapshot is handed to the writer goroutine, so it must not alias the
// live bitmap the game loop keeps writing into.
func TestChunks_DoesNotAliasTheLiveBits(t *testing.T) {
	f := New()
	f.MarkAt(phy.Vec2f{X: 20, Y: 16})
	snap := f.Chunks()
	before := append([]byte(nil), snap[0].Bits...)
	f.MarkAt(phy.Vec2f{X: 60, Y: 40})
	assert.Equal(t, before, snap[0].Bits)
}

func TestChunks_OfAnEmptyOrNilFogIsNil(t *testing.T) {
	assert.Nil(t, New().Chunks())
	var f *Fog
	assert.Nil(t, f.Chunks())
	assert.Equal(t, 0, f.Len())
}

// D8's server-side twin: seeding UNIONS, so a carried live fog and a stored
// snapshot both survive; and a repeat seed changes nothing.
func TestSeed_UnionsWithWhatIsAlreadyRevealed(t *testing.T) {
	stored := New()
	stored.MarkAt(phy.Vec2f{X: -100, Y: -100})

	f := New()
	f.MarkAt(phy.Vec2f{X: 100, Y: 100})
	f.Seed(stored.Chunks())
	f.Seed(stored.Chunks())

	assert.True(t, f.Revealed(cellOf(-100), cellOf(-100)))
	assert.True(t, f.Revealed(cellOf(100), cellOf(100)))
	assert.False(t, f.Revealed(0, 0))
}

// D10: a row drawn on another grid is skipped silently, and so is one whose
// bitmap is the wrong size for its own grid. Never an error.
func TestSeed_SkipsAChunkFromAnotherGrid(t *testing.T) {
	full := make([]byte, chunkBytes)
	for i := range full {
		full[i] = 0xff
	}
	f := New()
	f.Seed([]persist.FogChunk{
		{X: 0, Y: 0, CellSize: CellSize + 1, ChunkCells: ChunkCells, Bits: full},
		{X: 1, Y: 0, CellSize: CellSize, ChunkCells: ChunkCells / 2, Bits: full[:chunkBytes/4]},
		{X: 2, Y: 0, CellSize: CellSize, ChunkCells: ChunkCells, Bits: full[:10]},
		{X: 3, Y: 0, CellSize: CellSize, ChunkCells: ChunkCells, Bits: full},
	})
	assert.Equal(t, 1, f.Len(), "only the chunk on the current grid survives")
	assert.True(t, f.Revealed(3*ChunkCells, 0))
}

// Save → seed → save is an identity: the round trip the persist fingerprint
// depends on.
func TestSeed_RoundTripsChunks(t *testing.T) {
	f := New()
	f.MarkAt(phy.Vec2f{X: 0, Y: 0})
	f.MarkAt(phy.Vec2f{X: 300, Y: -200})
	g := New()
	g.Seed(f.Chunks())
	assert.Equal(t, f.Chunks(), g.Chunks())
}

// The bit layout is part of the wire contract F2 decodes: row-major within the
// chunk, LSB-first within a byte.
func TestBitLayout_RowMajorLSBFirst(t *testing.T) {
	f := New()
	f.set(1, 0) // local (1, 0) → bit 1 of byte 0
	f.set(0, 1) // local (0, 1) → bit ChunkCells → byte ChunkCells/8, bit 0
	bits := f.Chunks()[0].Bits
	assert.Equal(t, byte(0b10), bits[0])
	assert.Equal(t, byte(0b1), bits[ChunkCells/8])
}
