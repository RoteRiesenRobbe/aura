package mapfog

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/persist"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/world"
)

// The player stands at the centre of cell (10, 8). Every bound below is
// derived from the cell grid and the constants, never a magic distance.
var (
	standX, standY = cellCentre(10), cellCentre(8)
	stand          = phy.Vec2f{X: standX, Y: standY}
)

// cave is a dark circle centred on the player, wide enough to cover the whole
// AOI box, so every cell of the mark is dark.
func cave() DarkWorld {
	return DarkWorld{Circles: []Circle{{standX, standY, 40}}}
}

func square(cx, cy, half float32) []world.Point {
	return []world.Point{{X: cx - half, Y: cy - half}, {X: cx + half, Y: cy - half},
		{X: cx + half, Y: cy + half}, {X: cx - half, Y: cy + half}}
}

// revealedAround counts revealed cells in the AOI box around (10, 8).
func revealedAround(f *Fog) int {
	n := 0
	for cy := 8 - reachY; cy <= 8+reachY; cy++ {
		for cx := 10 - reachX; cx <= 10+reachX; cx++ {
			if f.Revealed(cx, cy) {
				n++
			}
		}
	}
	return n
}

// cellsWithin counts the AOI cells whose centre is within r of the player:
// what D4 says a light of radius r maps.
func cellsWithin(r float32) int {
	n := 0
	for cy := 8 - reachY; cy <= 8+reachY; cy++ {
		for cx := 10 - reachX; cx <= 10+reachX; cx++ {
			if inCircle(cellCentre(cx), cellCentre(cy), Circle{standX, standY, r}) {
				n++
			}
		}
	}
	return n
}

func TestDark_UnlitDarknessStaysHidden(t *testing.T) {
	f := New()
	require.True(t, f.MarkAt(stand, 0, BuildDarkMask(cave())))
	assert.Equal(t, 0, revealedAround(f))
}

func TestDark_OwnLightAtTheGateMapsItsCircle(t *testing.T) {
	f := New()
	f.MarkAt(stand, MinRevealLight, BuildDarkMask(cave()))
	assert.Equal(t, cellsWithin(MinRevealLight), revealedAround(f))
	assert.True(t, f.Revealed(10, 8))
}

func TestDark_LanternMapsItsCircle(t *testing.T) {
	f := New()
	f.MarkAt(stand, 4, BuildDarkMask(cave()))
	assert.Equal(t, cellsWithin(4), revealedAround(f))
	// A cell whose centre is just outside the circle stays hidden.
	assert.False(t, f.Revealed(10+3, 8), "centre 6 u away, outside a 4 u light")
}

func TestDark_LightBelowTheGateRevealsNothingDark(t *testing.T) {
	f := New()
	f.MarkAt(stand, MinRevealLight-0.5, BuildDarkMask(cave()))
	assert.Equal(t, 0, revealedAround(f))
}

func TestDark_StaticLightMapsWithoutOwnLight(t *testing.T) {
	w := cave()
	w.Lights = []Circle{{standX, standY, 7}}
	f := New()
	f.MarkAt(stand, 0, BuildDarkMask(w))
	assert.Equal(t, cellsWithin(7), revealedAround(f))
}

func TestDark_ClearingInsideDarknessIsMapped(t *testing.T) {
	w := cave()
	w.Clearings = [][]world.Point{square(standX, standY, 1)}
	f := New()
	f.MarkAt(stand, 0, BuildDarkMask(w))
	assert.Equal(t, 1, revealedAround(f), "only the cell the clearing covers")
	assert.True(t, f.Revealed(10, 8))
}

func TestDark_OutsideDarknessIsMappedAsBefore(t *testing.T) {
	plain, darkFar := New(), New()
	plain.MarkAt(stand, 0, nil)
	darkFar.MarkAt(stand, 0, BuildDarkMask(DarkWorld{Circles: []Circle{{500, 500, 10}}}))
	assert.Equal(t, revealedAround(plain), revealedAround(darkFar))
	assert.Equal(t, (2*reachX+1)*(2*reachY+1), revealedAround(plain))
}

// D5: only the AUTHORED radius is dark; the fade ring drawn outside it is not.
func TestDark_FadeRingDoesNotGate(t *testing.T) {
	r := float32(3)
	w := DarkWorld{Circles: []Circle{{standX - r - CellSize, standY, r}}}
	assert.False(t, w.dark(standX, standY), "one cell past the authored edge")
	assert.True(t, w.dark(standX-r-CellSize, standY))
}

// D5: partly dark air stays mapped like daylight.
func TestDark_PartialDarknessDoesNotGate(t *testing.T) {
	for _, d := range []float32{0.55, 0.35, 0.28} {
		w := DarkWorld{Atmospheres: []DarkShape{{d, square(standX, standY, 20)}}}
		assert.False(t, w.dark(standX, standY), "darkness %v", d)
	}
}

// D5, PO 2026-10-05: overlapping darkness STACKS, as the screen draws it.
func TestDark_OverlapStacksInEitherOrder(t *testing.T) {
	full := DarkShape{1, square(standX, standY, 20)}
	half := DarkShape{0.5, square(standX, standY, 20)}
	assert.True(t, DarkWorld{Atmospheres: []DarkShape{full, half}}.dark(standX, standY))
	assert.True(t, DarkWorld{Atmospheres: []DarkShape{half, full}}.dark(standX, standY))
	assert.False(t, DarkWorld{Atmospheres: []DarkShape{half, half}}.dark(standX, standY),
		"0.5 + 0.5 stacks to 0.75, grey on screen")
}

// C2: the gate re-marks when the light changes, not only on a new cell.
func TestDark_LightChangeReMarksInTheSameCell(t *testing.T) {
	mask := BuildDarkMask(cave())
	f := New()
	require.True(t, f.MarkAt(stand, 0, mask))
	require.False(t, f.MarkAt(stand, 0, mask), "same cell, same light: gated")
	require.True(t, f.MarkAt(stand, 4, mask), "lighting a Lantern maps at once")
	assert.True(t, f.Revealed(10, 8))
}

func TestTakeDirty_ReturnsTouchedChunksThenEmpties(t *testing.T) {
	f := New()
	f.Seed([]persist.FogChunk{{X: 5, Y: 5, CellSize: CellSize, ChunkCells: ChunkCells,
		Bits: make([]byte, chunkBytes)}})
	f.MarkAt(stand, 0, nil)

	dirty := f.TakeDirty()
	require.Len(t, dirty, 1, "the mark touched one chunk; a seed never dirties")
	assert.Equal(t, int16(0), dirty[0].X)
	assert.True(t, f.TakeDirty() == nil, "emptied")

	f.MarkAt(phy.Vec2f{X: standX + CellSize, Y: standY}, 0, nil)
	assert.Len(t, f.TakeDirty(), 1, "a step that sets new bits dirties again")
	f.MarkAt(stand, 0, nil)
	assert.Nil(t, f.TakeDirty(), "walking back over mapped ground sets nothing new")
}

func TestNeedsLight_NilMaskIsNeverDark(t *testing.T) {
	var m *DarkMask
	assert.False(t, m.NeedsLight(0, 0))
}
