package mob

// The live bug this chunk was opened for (playtest round 3, 2026-07-25): a lone
// healer regenerated through incoming damage and was effectively unkillable by a
// solo player. It never acquired an aggro target, "in combat" WAS "has an aggro
// target", so it sat in the out-of-combat branch every tick and healed itself
// back up faster than it was being hurt.

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
)

func TestMob_LoneHealerUnderFireIsKillable(t *testing.T) {
	m := newTestHealerMob()
	require.True(t, m.isPacifist(), "no combat aura: it will never acquire a target")

	// Chip away at it with hits well under the old regen-per-tick rate, the
	// pattern that used to be unwinnable.
	start := m.Health()
	for i := 0; i < 20; i++ {
		m.takeDamage(model.Damage{HP: 2}, model.StatusEffectDamagedAmbient)
		m.Update(0)
	}

	assert.Less(t, m.Health(), start, "sustained chip damage now actually lands")
	assert.Nil(t, m.aggroTarget, "and it still never fights back (pacifist, PO 2026-07-25)")
}

// The flip side of the same rule: left alone, a wounded healer still heals up.
// The fix is a combat gate, not a removal of mob regeneration.
func TestMob_HealerStillRegeneratesWhenLeftAlone(t *testing.T) {
	m := newTestHealerMob()
	m.health = m.maxHealth / 2
	wounded := m.Health()

	for i := 0; i < combatRegenGraceTicks+5; i++ {
		m.Update(0)
	}

	assert.Greater(t, m.Health(), wounded, "disengaging still lets it recover")
}
