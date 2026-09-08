package cfg

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// Zone containment (plan-underworld.md U2). This is the rule the roster filter
// and, on the other side of the wire, the client's active-zone derivation both
// answer "which zone is this position in" with — so it has to agree with the
// border wall built from the same rectangle, or a player can be held inside a
// zone the lookup says they are not in.

func TestPlacedBounds_ContainsMatchesTheRectangleTheWallIsBuiltFrom(t *testing.T) {
	z := PlacedBounds{Bounds: Bounds{Width: 144, Height: 72}}

	assert.True(t, z.Contains(0, 0), "the centre")
	assert.True(t, z.Contains(72, 36), "the far corner is inside — the wall holds you AT the edge")
	assert.True(t, z.Contains(-72, -36), "and the near corner")
	assert.False(t, z.Contains(72.1, 0))
	assert.False(t, z.Contains(0, -36.1))
}

func TestPlacedBounds_ContainsFollowsTheOrigin(t *testing.T) {
	z := PlacedBounds{Bounds: Bounds{Width: 60, Height: 40}, OriginY: -300}

	assert.True(t, z.Contains(0, -300), "the placed centre")
	assert.True(t, z.Contains(29, -281))
	assert.False(t, z.Contains(0, 0), "the surface origin is nowhere near this zone")
}

func TestZoneIndexAt_FindsTheContainingZone(t *testing.T) {
	zones := []PlacedBounds{
		{Bounds: Bounds{Width: 144, Height: 72}, ZoneID: "world"},
		{Bounds: Bounds{Width: 60, Height: 40}, OriginY: -300, ZoneID: "under"},
	}

	assert.Equal(t, 0, ZoneIndexAt(zones, 0, 0))
	assert.Equal(t, 1, ZoneIndexAt(zones, 5, -295))
}

// ⚑ The gap between zones is unreachable in play — each zone's wall holds its
// occupants in — so -1 is a bug signal, not a case to handle. It is pinned so
// the callers can rely on the distinction rather than guessing zone 0.
func TestZoneIndexAt_ReturnsMinusOneInTheGapBetweenZones(t *testing.T) {
	zones := []PlacedBounds{
		{Bounds: Bounds{Width: 144, Height: 72}, ZoneID: "world"},
		{Bounds: Bounds{Width: 60, Height: 40}, OriginY: -300, ZoneID: "under"},
	}

	assert.Equal(t, -1, ZoneIndexAt(zones, 0, -150), "the empty space between the two rectangles")
	assert.Equal(t, -1, ZoneIndexAt(nil, 0, 0), "no zones at all")
}
