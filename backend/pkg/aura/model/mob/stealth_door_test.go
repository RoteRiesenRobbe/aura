package mob

// Stealth at the mob's doors (plan-effect-types-round-2.md C6, D2, D25, D26,
// L7): a stealthed player is not acquired, writes no threat, and the hit that
// breaks stealth lands and writes its threat as usual.

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type stealthyCombatant struct {
	*fakeCombatant
	hidden bool
}

func (s *stealthyCombatant) Stealthed() bool { return s.hidden }

func TestStealth_AStealthedPlayerIsNotAcquired(t *testing.T) {
	m := newTestMob()
	m.SetPosition(phy.Vec2f{X: 2.5, Y: 0})
	p := &stealthyCombatant{fakeCombatant: newFakeCombatant(), hidden: true}
	p.pos = phy.Vec2f{X: 1.5, Y: 0}
	sensedBy(m, p, model.LayerPlayerCollision)
	require.NotEmpty(t, m.aggroAura.Collisions())

	assert.Nil(t, m.findAggroTarget(), "standing in the sensor, unseen")

	p.hidden = false
	assert.Same(t, model.Combatant(p), m.findAggroTarget(), "control: seen once stealth ends")
}

func TestStealth_AStealthedSourceWritesNoThreat(t *testing.T) {
	m := newTestMob()
	p := &stealthyCombatant{fakeCombatant: newFakeCombatant(), hidden: true}

	m.NoteThreat(p, 50) // a heal on someone the mob fights (D25)

	assert.False(t, m.HasThreat(p.basic.ID()))
}

// stealthyPlayer is the fake player with a stealth that breaks, as the real
// player's does.
type stealthyPlayer struct {
	*fakeAuraPlayer
	hidden bool
}

func (s *stealthyPlayer) Stealthed() bool { return s.hidden }
func (s *stealthyPlayer) BreakStealth()   { s.hidden = false }

func TestStealth_TheBreakingHitLandsAndWritesThreat(t *testing.T) {
	m := newTestMob()
	p := &stealthyPlayer{fakeAuraPlayer: newFakeAuraPlayer(), hidden: true}

	m.PlayerTouches(p, model.Damage{HP: 5})

	assert.False(t, p.hidden, "dealing damage breaks stealth (D1)")
	assert.True(t, m.HasThreat(p.basic.ID()), "and the hit writes its threat (D26)")
}

func TestStealth_AFullyResistedHitDoesNotBreakIt(t *testing.T) {
	def := testMobDefinition()
	def.Factors.Resistances = map[string]float32{"*": 0}
	m := NewMob(def, 0, nil)
	p := &stealthyPlayer{fakeAuraPlayer: newFakeAuraPlayer(), hidden: true}

	m.PlayerTouches(p, model.Damage{HP: 5, Tags: []string{"physical"}})

	assert.True(t, p.hidden, "HP did not move, so it is no break (D26)")
}
