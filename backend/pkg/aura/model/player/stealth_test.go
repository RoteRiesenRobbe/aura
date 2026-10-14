package player

// Stealth breaks on damage TAKEN when HP actually moves
// (plan-effect-types-round-2.md C6, D1, D26): a hit the shield eats whole is
// no break, the hit that gets through is.

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestStealth_TakingDamageBreaksIt(t *testing.T) {
	p := newCCPlayer(t)
	require.True(t, p.ApplyStealth(168, 600))

	p.takeDamage(model.Damage{HP: 5}, 0, model.StatusEffectDamagedAmbient)

	assert.False(t, p.Stealthed())
}

func TestStealth_AFullyAbsorbedHitDoesNotBreakIt(t *testing.T) {
	p := newCCPlayer(t)
	require.True(t, p.ApplyStealth(168, 600))
	p.buffs.ApplyShield(1, 50, 300)

	p.takeDamage(model.Damage{HP: 5}, 0, model.StatusEffectDamagedAmbient)

	assert.True(t, p.Stealthed(), "HP did not move")
}

func TestStealth_GodStillHides(t *testing.T) {
	p := newCCPlayer(t)
	p.SetGodmode(true)

	assert.True(t, p.ApplyStealth(168, 600), "stealth is the player's own tool, not CC")
}
