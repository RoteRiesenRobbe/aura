package player

// A flyer is immune to everything (PO 2026-11-22: "players need to be immune
// against all while flying"). Leaving phy.Space already keeps every aura and
// sensor off a flyer; these pin the doors that do NOT go through the space —
// a DoT applied before takeoff that keeps ticking, a placed area the lerp
// crosses — so a flyer takes no damage and no crowd control from any source.

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
)

func newFlyingImmuneTestPlayer(t *testing.T) *player {
	t.Helper()
	p := newFlightPlayer(t)
	p.statusEffects = model.NewStatusEffects()
	p.BeginFlight(nil, "spawnpoint-1", "spawnpoint-2", phy.Vec2f{X: 20, Y: 1}, 100)
	require.True(t, p.Flying(), "fixture: airborne")
	return p
}

func TestFlying_TakesNoDamage(t *testing.T) {
	p := newFlyingImmuneTestPlayer(t)
	before := p.PlayerVitalSigns.Health

	p.MobTouches(newFakeAttackerMob(), mobs.Factors{Damage: 10})
	p.AreaTouches(nil, model.Damage{HP: 10, Tags: []string{"miasma"}})

	assert.Equal(t, before, p.PlayerVitalSigns.Health, "a flyer loses no HP")
	assert.Zero(t, damageTaken(p))
	assert.False(t, immuneHit(p), "silent, like GOD: no Immune float in the air")
}

func TestFlying_RefusesCrowdControl(t *testing.T) {
	p := newFlyingImmuneTestPlayer(t)

	assert.False(t, p.ApplySlow(1, 0.5, 30), "slow")
	assert.False(t, p.ApplyStun(1, 30), "stun")
	assert.False(t, p.ApplyFear(1, nil, 30), "fear")
}

func TestFlying_LandingEndsTheImmunity(t *testing.T) {
	p := newFlyingImmuneTestPlayer(t)
	p.Ground()
	before := p.PlayerVitalSigns.Health

	p.MobTouches(newFakeAttackerMob(), mobs.Factors{Damage: 10})

	assert.Less(t, p.PlayerVitalSigns.Health, before, "a landed player takes damage again")
}
