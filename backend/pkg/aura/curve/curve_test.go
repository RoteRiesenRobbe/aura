package curve

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestCurve_F(t *testing.T) {
	c := Curve{Growth: 1.12, MaxLevel: 30}

	assert.InDelta(t, 1.0, c.F(1), 1e-12, "f(1) is the un-inflated baseline")
	assert.InDelta(t, 1.12, c.F(2), 1e-12)
	assert.InDelta(t, 1.12*1.12, c.F(3), 1e-12)
	assert.InDelta(t, 1.0, c.F(0), 1e-12, "levels below 1 clamp to the baseline")
	assert.InDelta(t, c.F(30), c.TotalInflation(), 1e-12)
}

// A zero/absent growth means "no inflation configured" — the multiplier is
// neutral at every level instead of collapsing values to 0 (F would otherwise
// return 0^(L-1)). Keeps un-migrated configs and zero-value test fixtures safe.
func TestCurve_F_ZeroGrowthIsNeutral(t *testing.T) {
	c := Curve{}

	assert.Equal(t, 1.0, c.F(1))
	assert.Equal(t, 1.0, c.F(10))
}
