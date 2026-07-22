package mob

// Gray aggro (playtest-1 feedback Pass A, decision 2, PO 2026-07-22): a mob
// whose combat level sits a full band below its would-be target no longer
// acquires it proactively. The tester walked through low zones dragging a
// tail of trivial mobs; a gray mob is now scenery until poked. Retaliation
// (threat retention) is deliberately untouched — gray mobs stay attackable
// and hit back.

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// leveledCombatant is a fakeCombatant that also carries a character level —
// the shape of a player as the gray-aggro gate sees one.
type leveledCombatant struct {
	*fakeCombatant
	level int
}

func (l *leveledCombatant) CombatLevel() int { return l.level }

func newLeveledCombatant(level int) *leveledCombatant {
	return &leveledCombatant{fakeCombatant: newFakeCombatant(), level: level}
}

// sensedBy puts target inside m's aggro sensor and returns the updated space.
func sensedBy(m *Mob, target model.Combatant, layer model.CollisionLayer) {
	space := phy.NewSpace()
	space.AddShape(m.aggroAura)
	c := phy.NewCircle(target.Position(), target.Radius())
	c.Shape().IsSensor = true
	c.Shape().Layer = int(layer)
	c.Shape().UserData = target
	space.AddShape(c)
	space.Update()
}

// grayMobDefinition is a cL2 mob — the Z1 wolf/turnip band a levelled player
// walks back through.
func grayMobDefinition() *mobs.MobDefinition {
	def := testMobDefinition()
	def.CurveLevel = 2
	return def
}

func TestMob_FindAggroTarget_SkipsPlayerFarAboveItsBand(t *testing.T) {
	m := NewMob(grayMobDefinition(), 0, nil)
	player := newLeveledCombatant(2 + grayAggroBandLevels) // exactly at the band edge
	player.pos = phy.Vec2f{X: 0.5, Y: 0}
	sensedBy(m, player, model.LayerPlayerCollision)
	require.NotEmpty(t, m.aggroAura.Collisions())

	assert.Nil(t, m.findAggroTarget(),
		"cL2 mob vs a level-7 player: seen, but gray — no proactive acquisition")
}

func TestMob_FindAggroTarget_AcquiresPlayerInsideItsBand(t *testing.T) {
	m := NewMob(grayMobDefinition(), 0, nil)
	player := newLeveledCombatant(2 + grayAggroBandLevels - 1) // one level short of gray
	player.pos = phy.Vec2f{X: 0.5, Y: 0}
	sensedBy(m, player, model.LayerPlayerCollision)
	require.NotEmpty(t, m.aggroAura.Collisions())

	target := m.findAggroTarget()

	require.NotNil(t, target, "still inside the band — normal acquisition")
	assert.Same(t, player, target)
}

func TestMob_GrayTargetStillRetaliatesWhenHit(t *testing.T) {
	// "Still attackable": the gate is acquisition-only. A hit seeds threat and
	// retention acquires through it, exactly like the faction gate.
	m := NewMob(grayMobDefinition(), 0, nil)
	p := newFakeAuraPlayer()
	p.level = 2 + grayAggroBandLevels + 10

	m.PlayerTouches(p, model.Damage{HP: 5})
	require.True(t, m.Update(0))

	require.NotNil(t, m.aggroTarget, "gray mobs hit back — only the free aggro is gone")
}

func TestMob_FindAggroTarget_UnleveledTargetsAreNeverGray(t *testing.T) {
	// Mob-vs-mob acquisition (the front war, summons, prey) carries no
	// character level and must be unaffected by the gate.
	wolf := NewMob(predatorDefinition(), 0, nil)
	rabbit := newFakeCombatant()
	rabbit.faction = testFactionPrey
	rabbit.pos = phy.Vec2f{X: 0.5, Y: 0}
	sensedBy(wolf, rabbit, model.LayerActionCollision)
	require.NotEmpty(t, wolf.aggroAura.Collisions())

	assert.Same(t, model.Combatant(rabbit), wolf.findAggroTarget())
}

func TestMob_CombatLevelFallsBackToBaseline(t *testing.T) {
	// Directly-constructed definitions (tests, sim harness) leave CurveLevel at
	// its zero value; the mob must read as the cL1 baseline, mirroring the
	// definition loader's own absent-→-1 default. Without this the sim's
	// synthetic mobs would go gray against any levelled player.
	m := NewMob(testMobDefinition(), 0, nil)

	assert.Equal(t, 1, m.combatLevel())
}
