package mob

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
)

// The D22 hold, both edges (chunk 3b-ii): a wandering actor stops while
// somebody talks to it and RESUMES when the panel closes. The resume half had
// no Go eyes — only the chunk3b-ii-conversation.mjs harness leg asserted it,
// and that leg's drift pin rotted (2026-07-30 follow-up), so this pins the
// product behaviour where the harness cannot lie.
func TestMob_ConversingHoldsThenReleasesWander(t *testing.T) {
	m := newTestMob()
	anchor := phy.Vec2f{X: 5, Y: 5}
	m.SetPosition(anchor)
	m.SetWander(anchor, 2)

	movedWhileIdle := func(ticks int) bool {
		for i := 0; i < ticks; i++ {
			before := m.Position()
			m.Update(0)
			if m.Position() != before {
				return true
			}
		}
		return false
	}

	assert.True(t, movedWhileIdle(2000), "sanity: the wanderer ambles before anyone talks to it")

	m.SetConversing(true)
	assert.False(t, movedWhileIdle(2000), "an actor in conversation holds position (D22)")

	m.SetConversing(false)
	assert.True(t, movedWhileIdle(2000), "…and walks on when the panel closes (D22's release half)")
}
