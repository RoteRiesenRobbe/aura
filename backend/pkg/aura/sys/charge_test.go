package sys

// Charge (plan-effect-types-round-2.md C3, D18 + D19): pick the nearest enemy
// in the search radius, then dash to it along the stepped static probe dash
// already uses, stopping at contact distance.

import (
	"testing"

	"github.com/EngoEngine/ecs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func chargeEffect(radius float32) skills.EffectDef {
	return skills.EffectDef{Type: skills.EffectTypeCharge, Radius: radius}
}

// chargeTargetAt puts a combatant body (radius 0.25, the action layer mobs
// live on) into the space.
func chargeTargetAt(space *phy.Space, at phy.Vec2f, userData any) {
	c := phy.NewCircle(at, 0.25)
	c.Shape().IsSensor = true
	c.Shape().Layer = int(model.LayerActionCollision)
	c.Shape().UserData = userData
	space.AddShape(c)
}

// chargePlayer is a player at the origin. Its last movement points AWAY from
// every target the tests place, so a charge that silently fell back to the
// dash's aim would fail the position asserts.
func chargePlayer(space *phy.Space) (*fakePlayer, *SkillSystem) {
	p := newFakePlayer()
	p.aura = phy.NewCircle(phy.VEC2F_ZERO, 1.0)
	p.lastMoveDir = phy.Vec2f{X: 0, Y: -1}
	s := NewSkillSystem(space, nil)
	s.rng = testRNG()
	return p, s
}

func hostileAt(space *phy.Space, at phy.Vec2f) *stunRecorder {
	r := &stunRecorder{basic: ecs.NewBasic(), faction: model.FactionHostile}
	chargeTargetAt(space, at, r)
	return r
}

func TestCharge_LandsAtContactWithTheNearestEnemy(t *testing.T) {
	space := phy.NewSpace()
	hostileAt(space, phy.Vec2f{X: 3, Y: 0})
	hostileAt(space, phy.Vec2f{X: -5, Y: 0}) // farther: never the pick
	space.Update()
	p, s := chargePlayer(space)

	ok := s.applyCharge(p, chargeEffect(6), 1)

	require.True(t, ok)
	// Contact: the target's centre minus both radii (0.25 + 0.25).
	assert.InDelta(t, 2.5, p.Position().X, 1e-4)
	assert.InDelta(t, 0, p.Position().Y, 1e-4)
}

func TestCharge_SearchRadiusScalesWithLevel(t *testing.T) {
	space := phy.NewSpace()
	hostileAt(space, phy.Vec2f{X: 0, Y: 5})
	space.Update()
	p, s := chargePlayer(space)
	effect := chargeEffect(3)
	effect.RadiusPerLevel = 1

	require.False(t, s.applyCharge(p, effect, 1), "level 1 searches 3 units: nothing in range")
	require.True(t, s.applyCharge(p, effect, 3), "level 3 searches 5 units")
	assert.InDelta(t, 4.5, p.Position().Y, 1e-4)
}

func TestCharge_SkipsFriendlyTargets(t *testing.T) {
	space := phy.NewSpace()
	army := &friendlyStunTarget{stunRecorder{basic: ecs.NewBasic(), faction: model.Faction(2)}}
	chargeTargetAt(space, phy.Vec2f{X: 1, Y: 0}, army) // nearer, but never harmable
	hostileAt(space, phy.Vec2f{X: -4, Y: 0})
	space.Update()
	p, s := chargePlayer(space)

	require.True(t, s.applyCharge(p, chargeEffect(6), 1))

	assert.InDelta(t, -3.5, p.Position().X, 1e-4, "the charge ran at the hostile, not the friendly NPC")
}

func TestCharge_StopsAtAWall(t *testing.T) {
	space := phy.NewSpace()
	hostileAt(space, phy.Vec2f{X: 4, Y: 0})
	wall := phy.NewCircle(phy.Vec2f{X: 2, Y: 0}, 0.25)
	wall.Shape().Layer = int(model.LayerPlayerStaticCollision)
	space.AddStaticShape(wall)
	space.Update()
	p, s := chargePlayer(space)

	require.True(t, s.applyCharge(p, chargeEffect(6), 1))

	assert.Less(t, p.Position().X, float32(2), "the shared probe stops the charge before the wall")
	assert.Greater(t, p.Position().X, float32(0), "but it still advanced up to it")
}

func TestCharge_AlreadyInContactStaysPut(t *testing.T) {
	space := phy.NewSpace()
	hostileAt(space, phy.Vec2f{X: 0.4, Y: 0}) // closer than the two radii
	space.Update()
	p, s := chargePlayer(space)

	require.True(t, s.applyCharge(p, chargeEffect(6), 1), "a target in range is a landed charge")

	assert.InDelta(t, 0, p.Position().X, 1e-4, "never pulled backwards")
}

func TestCharge_NoEnemyInRangeReturnsFalse(t *testing.T) {
	space := phy.NewSpace()
	hostileAt(space, phy.Vec2f{X: 8, Y: 0})
	space.Update()
	p, s := chargePlayer(space)

	assert.False(t, s.applyCharge(p, chargeEffect(6), 1))
	assert.InDelta(t, 0, p.Position().X, 1e-4)
}

// D19: player-only in C3, like dash.
func TestCharge_MobCasterIsNoop(t *testing.T) {
	space := phy.NewSpace()
	r := &stunRecorder{basic: ecs.NewBasic(), faction: model.FactionAligned}
	chargeTargetAt(space, phy.Vec2f{X: 2, Y: 0}, r)
	space.Update()
	s := NewSkillSystem(space, nil)

	assert.False(t, s.applyCharge(newFakeMob(), chargeEffect(6), 1), "mobs cannot charge in C3")
}

func chargeStunDef() *skills.SkillDefinition {
	return &skills.SkillDefinition{
		ID: 160, Name: "Charge", Category: skills.SkillCategoryCooldown, MaxLevel: 1,
		CooldownTicks: 300,
		Effects: []skills.EffectDef{
			chargeEffect(6),
			{
				Type: skills.EffectTypeStun, TargetsEnemies: true, Radius: 1, MaxTargets: 1,
				Stun: &skills.StunParams{DurationTicks: 30},
			},
		},
	}
}

// D18's precondition: no enemy in range refuses the cast. Nothing is paid, no
// cooldown starts, and the HUD gets the rejection it already shows for revive.
func TestCharge_NoEnemyRejectsActivation(t *testing.T) {
	space := phy.NewSpace()
	space.Update()
	caster, sk := cooldownCaster(space)
	caster.sc.EquipCooldown(0, chargeStunDef(), 1)
	caster.sc.RequestCooldownActivation(0)

	sk.Update(33.0)

	assert.Equal(t, 0, caster.sc.SlotCooldownRemaining(0), "no enemy in range: no cooldown consumed")
	require.Len(t, caster.rejections, 1)
	assert.Equal(t, skills.SkillID(160), caster.rejections[0].skill)
	assert.Equal(t, model.ActivationRejectedNoTarget, caster.rejections[0].reason)
}

// L2: the effects after a charge fire from the LANDING spot in the same tick.
// The target stands 4 units out and the stun reaches 1, so only a stun that
// reads the moved collider can hold it.
func TestCharge_ThenStunHoldsTheTargetFromTheLanding(t *testing.T) {
	space := phy.NewSpace()
	target := hostileAt(space, phy.Vec2f{X: 4, Y: 0})
	space.Update()
	caster, sk := cooldownCaster(space)
	caster.lastMoveDir = phy.Vec2f{X: 0, Y: -1}
	caster.sc.EquipCooldown(0, chargeStunDef(), 1)
	caster.sc.RequestCooldownActivation(0)

	sk.Update(33.0)

	assert.InDelta(t, 3.5, caster.Position().X, 1e-4, "the charge landed at contact")
	assert.Equal(t, []int{30}, target.ticks, "the stun searched from the landing spot")
	assert.Equal(t, 300, caster.sc.SlotCooldownRemaining(0), "a landed charge consumes the cooldown")
	assert.Empty(t, caster.rejections)
}
