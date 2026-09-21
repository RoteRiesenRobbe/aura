package sys

import (
	"math/rand"
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/constant"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/spectator"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The touring spectator's AOI box is larger than one wake volume, so its wake
// positions must tile it: every corner of the box has to sit inside some wake
// volume at the SHIPPED default margin, or the rim of the start screen renders
// mob-less.
func TestAppendWakePositions_TileTheTouringSpectatorsBox(t *testing.T) {
	const wakeMargin = 1.7 // core/gameconf.go's default

	s, _ := newStateFixture(t)
	plan := spectator.NewTourPlan(phy.Vec2f{}, 144, 72, nil)
	sp := spectator.NewTouringSpectator(plan.NewTour(rand.New(rand.NewSource(1))), nil)
	s.AddSpectator(sp)

	wake := s.AppendWakePositions(nil)
	require.Len(t, wake, 4)

	hx := float32(constant.ViewPortWidth / 2 * spectator.TourViewportScale)
	hy := float32(constant.ViewPortHeight / 2 * spectator.TourViewportScale)
	pos := sp.Position()
	for _, corner := range []phy.Vec2f{{X: -hx, Y: -hy}, {X: hx, Y: -hy}, {X: -hx, Y: hy}, {X: hx, Y: hy}} {
		covered := false
		for _, w := range wake {
			dx, dy := w.X-(pos.X+corner.X), w.Y-(pos.Y+corner.Y)
			if dx < 0 {
				dx = -dx
			}
			if dy < 0 {
				dy = -dy
			}
			if dx <= constant.ViewPortWidth/2*wakeMargin && dy <= constant.ViewPortHeight/2*wakeMargin {
				covered = true
			}
		}
		assert.True(t, covered, "box corner %v is outside every wake volume", corner)
	}
}

func TestAppendWakePositions_AnOrdinarySpectatorIsOnePosition(t *testing.T) {
	s, _ := newStateFixture(t)
	s.AddSpectator(spectator.NewSpectator(phy.Vec2f{X: 3, Y: 4}, nil))
	assert.Equal(t, []phy.Vec2f{{X: 3, Y: 4}}, s.AppendWakePositions(nil))
}
