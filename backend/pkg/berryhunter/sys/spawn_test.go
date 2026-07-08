package sys

import (
	"testing"
)

// Interim rule until zones author explicit player spawn points: players spawn
// uniformly in the central 80% of the rectangular world bounds.
func TestRandomSpawnPosition_StaysInCentral80PercentOfBounds(t *testing.T) {
	const width, height float32 = 60, 40
	maxX := 0.4 * width
	maxY := 0.4 * height

	for i := 0; i < 10000; i++ {
		pos := randomSpawnPosition(width, height)
		if pos.X < -maxX || pos.X > maxX {
			t.Fatalf("spawn X out of central 80%%: %f (max ±%f)", pos.X, maxX)
		}
		if pos.Y < -maxY || pos.Y > maxY {
			t.Fatalf("spawn Y out of central 80%%: %f (max ±%f)", pos.Y, maxY)
		}
	}
}

// The distribution must actually use the rectangle, not collapse to the old
// spawn circle (radius 16 in a 60×40 world) or a single point.
func TestRandomSpawnPosition_SpreadsBeyondLegacySpawnCircle(t *testing.T) {
	const width, height float32 = 60, 40
	const legacyRadiusSq = 16 * 16

	for i := 0; i < 10000; i++ {
		pos := randomSpawnPosition(width, height)
		if pos.X*pos.X+pos.Y*pos.Y > legacyRadiusSq {
			return // found a point only the rectangle allows
		}
	}
	t.Fatal("10000 samples all inside the legacy radius-16 circle — helper is not rectangular")
}
