package skills

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestScaled(t *testing.T) {
	t.Run("level 1 yields the base", func(t *testing.T) {
		assert.InDelta(t, 7.0, Scaled(float32(7), 1.6, 1), 1e-6)
		assert.Equal(t, 20, Scaled(20, -5, 1))
	})

	t.Run("each level adds perLevel", func(t *testing.T) {
		assert.InDelta(t, 10.2, Scaled(float32(7), 1.6, 3), 1e-6)
		assert.Equal(t, 26, Scaled(20, 3, 3))
	})

	t.Run("negative perLevel shrinks with level", func(t *testing.T) {
		assert.InDelta(t, 0.4, Scaled(float32(0.6), -0.1, 3), 1e-6)
		assert.Equal(t, 10, Scaled(20, -5, 3))
	})
}
