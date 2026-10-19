package mob

// Stance (plan-appearance.md C2, D28 + D32): the mob's current stance toward
// the player side, which the client paints on the medallion disc (red /
// yellow / blue). A projection of state the mob already tracks, read every
// tick for the wire.

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestStance_IdleByAggroSet(t *testing.T) {
	assert.Equal(t, model.StanceHostile, NewMob(predatorDefinition(), 0, nil).Stance(),
		"a wolf hunts players on sight: hostile while idle")
	assert.Equal(t, model.StanceNeutral, NewMob(preyDefinition(), 0, nil).Stance(),
		"prey acquires nothing: neutral while idle (D28)")
}

func TestStance_PreyFightingThePlayerSideIsHostile(t *testing.T) {
	// PO 2026-10-18: a player-side entity on the threat table is enough, so a
	// prey fleeing its attacker and a pacifist being beaten read hostile too.
	prey := NewMob(preyDefinition(), 0, nil)
	p := newFakeAuraPlayer()
	prey.PlayerTouches(p, model.Damage{HP: 1})
	require.True(t, prey.HasThreat(p.basic.ID()))
	assert.Equal(t, model.StanceHostile, prey.Stance(), "hit by a player: it fights back")

	prey.resetAggro()
	assert.Equal(t, model.StanceNeutral, prey.Stance(), "calmed down again: neutral")
}

func TestStance_PreyTargetingThePlayerSideIsHostile(t *testing.T) {
	prey := NewMob(preyDefinition(), 0, nil)
	prey.aggroTarget = newFakeCombatant() // aligned: a player's summon
	assert.Equal(t, model.StanceHostile, prey.Stance())
}

func TestStance_PreyFightingAnotherMobStaysNeutral(t *testing.T) {
	prey := NewMob(preyDefinition(), 0, nil)
	wolf := NewMob(predatorDefinition(), 0, nil)
	prey.MobTouches(wolf, mobs.Factors{Damage: 1})
	prey.aggroTarget = wolf
	require.True(t, prey.HasThreat(wolf.Basic().ID()))
	assert.Equal(t, model.StanceNeutral, prey.Stance(),
		"stance is toward the player side; a deer fighting a wolf is no threat to you")
}

func TestStance_CalmedReadsNeutral(t *testing.T) {
	m, _ := aggroedMob(t)
	require.Equal(t, model.StanceHostile, m.Stance())
	m.ApplyCalm(calmSource, 100)
	assert.Equal(t, model.StanceNeutral, m.Stance(), "D32: neutral for the calm's duration")
}

func TestStance_Friendly(t *testing.T) {
	charmed := NewMob(predatorDefinition(), 0, nil)
	charmed.Align()
	assert.Equal(t, model.StanceFriendly, charmed.Stance(), "on the player side (charm, summon)")

	soldierDef := predatorDefinition()
	soldierDef.FriendlyToPlayers = true
	assert.Equal(t, model.StanceFriendly, NewMob(soldierDef, 0, nil).Stance(),
		"a friendly-to-players species, whatever its aggro set")
}

func TestStance_EnlistedUnderAHostileSummonerIsHostile(t *testing.T) {
	summoner := NewMob(predatorDefinition(), 0, nil)
	raised := NewMob(preyDefinition(), 0, nil)
	raised.EnlistUnder(summoner)
	assert.Equal(t, model.StanceHostile, raised.Stance(), "it inherits a set that hunts players")
}
