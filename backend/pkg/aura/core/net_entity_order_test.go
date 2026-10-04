package core

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/prop"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
)

// plan-prop-draw-order.md P1 item 4: the entities a snapshot carries go out in
// ascending id order, every tick.
//
// The viewport hands back a Go MAP of colliders, and Go randomises map
// iteration on purpose, so the slice used to be reshuffled on every tick. The
// client orders props by id itself (D6), so this does not fix stacking on its
// own; it removes the per-tick shuffle from the 30 Hz message.
func TestEntitiesInView_AreInAscendingIDOrderEveryTime(t *testing.T) {
	set := make(phy.ColliderSet)
	var want []uint64
	for i := range 64 {
		p := prop.New(model.EntityType(1), phy.Vec2f{X: float32(i)}, 0.5, 0.5, false)
		set[p.Bodies()[0]] = struct{}{}
		want = append(want, p.Basic().ID())
	}
	// A shape with no entity behind it (a wall, a sensor) is not streamed.
	set[phy.NewCircle(phy.Vec2f{}, 1)] = struct{}{}

	// Several reads, because one read of a 64-entry map could come out sorted
	// by luck and pass on a build that never sorts.
	for run := range 5 {
		got := entitiesInView(set)
		ids := make([]uint64, len(got))
		for i, e := range got {
			ids[i] = e.Basic().ID()
		}
		assert.Equal(t, want, ids, "read %d", run)
	}
}
