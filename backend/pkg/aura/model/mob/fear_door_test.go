package mob

// The fear door on Mob (plan-effect-types-round-2.md C5, D22 + D23, L3): a
// feared mob runs from the fearer at its normal speed, casts nothing, and an
// immune species refuses it like every other CC.

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const fearDoorSource = skills.SkillID(166)

func TestFear_TheMobRunsFromTheFearer(t *testing.T) {
	m, p := aggroedMob(t) // the attacker stands at +0.3 on X
	slot := m.SkillComponent().ActiveAuraSlot

	require.True(t, m.ApplyFear(fearDoorSource, p, 90))
	for i := 0; i < 10; i++ {
		require.True(t, m.Update(0))
	}

	assert.Less(t, m.Position().X, float32(-0.2), "it ran away from the fearer, not towards its target")
	assert.True(t, m.auraSuppressed(), "and it casts nothing while it runs")
	assert.Equal(t, slot, m.SkillComponent().ActiveAuraSlot, "L3: the aura slot never flips")
	assert.NotNil(t, m.aggroTarget, "its fight resumes when the fear ends")
}

func TestFear_IsRefusedByACCImmuneSpecies(t *testing.T) {
	m := NewMob(immuneDefinition(), 0, nil)
	p := newFakeAuraPlayer()

	assert.False(t, m.ApplyFear(fearDoorSource, p, 90))
	assert.False(t, m.Feared())
}

func TestFear_RunsEvenWithoutAFight(t *testing.T) {
	m := newTestMob()
	m.SetPosition(phy.VEC2F_ZERO)
	p := newFakeAuraPlayer()
	p.pos = phy.Vec2f{X: 1}
	require.True(t, m.ApplyFear(fearDoorSource, p, 90))

	m.Update(0)

	assert.Less(t, m.Position().X, float32(0), "away from where the fearer stood")
}
