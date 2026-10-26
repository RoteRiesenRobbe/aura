package corpse

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
)

func TestCorpseWearsTheLookItWasGiven(t *testing.T) {
	portrait, ring := New(phy.Vec2f{}, 3, 4).Look()
	assert.Equal(t, uint16(3), portrait)
	assert.Equal(t, uint16(4), ring)
}
