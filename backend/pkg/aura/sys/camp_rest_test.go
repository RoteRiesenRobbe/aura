package sys

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/mob"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Campfire traits CT3 (docs/plan-campfire-traits.md D9-D11, R10-R12, R17-R20):
// resting at a player's camp grants its owner's buff traits.

const (
	restFocusID  skills.SkillID = 182
	restDamageID skills.SkillID = 183
	restSpeedID  skills.SkillID = 184
)

// fullRestBuffs is an owner with all three buff traits at level 15 (+4.95 %).
func fullRestBuffs() []skills.CampRestBuff {
	return []skills.CampRestBuff{
		{Source: restFocusID, Stat: skills.StatMaxHealth, Bonus: 0.0495},
		{Source: restDamageID, Stat: skills.StatDamageDealt, Bonus: 0.0495},
		{Source: restSpeedID, Stat: skills.StatMovementSpeed, Bonus: 0.0495},
	}
}

func damageOnly(bonus float32) []skills.CampRestBuff {
	return []skills.CampRestBuff{{Source: restDamageID, Stat: skills.StatDamageDealt, Bonus: bonus}}
}

// testRestCamp is a snapshot with the real camp aura's ring and cycle.
func testRestCamp(buffs []skills.CampRestBuff) *restCamp {
	return newRestCamp(buffs, 0.75, 60)
}

// rest runs n camp ticks with the given colliders in the sensor.
func rest(rc *restCamp, n int, in phy.ColliderSet) {
	for range n {
		rc.tick(phy.VEC2F_ZERO, in)
	}
}

func damageBonus(p *fakePlayer) float32 { return p.buffs.StatBonus(skills.StatDamageDealt) }

// --- the clock (D10) -------------------------------------------------------------

func TestRestClock_BuffsLandOnTheRestTickAndNotBefore(t *testing.T) {
	p := newFakePlayer()
	rc := testRestCamp(fullRestBuffs())
	in := colliderSetOf(model.PlayerEntity(p))

	rest(rc, campRestTicks-1, in)
	assert.Zero(t, damageBonus(p), "restTicks - 1: nothing yet")
	assert.True(t, p.buffs.Empty())

	rest(rc, 1, in)
	assert.InDelta(t, 0.0495, damageBonus(p), 1e-6, "restTicks: the damage buff")
	assert.InDelta(t, 0.0495, p.buffs.StatBonus(skills.StatMaxHealth), 1e-6, "the max-Focus buff")
	assert.InDelta(t, 1.0495, p.buffs.SpeedFactor(), 1e-6, "the speed buff rides ApplySpeed")
	effects := p.buffs.OwnEffects()
	require.Len(t, effects, 3, "three tray circles, one per trait")
	for _, e := range effects {
		assert.Equal(t, campRestBuffTicks, e.Left, "5 min each")
	}
}

func TestRestClock_LeavingTheRingResetsTheClock(t *testing.T) {
	p := newFakePlayer()
	rc := testRestCamp(damageOnly(0.03))
	in := colliderSetOf(model.PlayerEntity(p))

	rest(rc, campRestTicks-1, in)
	rest(rc, 1, phy.ColliderSet{}) // one step out
	rest(rc, campRestTicks-1, in)
	assert.Zero(t, damageBonus(p), "the clock restarted on re-entry")

	rest(rc, 1, in)
	assert.InDelta(t, 0.03, damageBonus(p), 1e-6)
}

func TestRestClock_OutsideTheHealRingIsNotResting(t *testing.T) {
	p := newFakePlayer()
	rc := testRestCamp(damageOnly(0.03))
	// In the sensor (the light reaches 2.0) but past the heal ring: 0.75 + 0.25.
	far := phy.NewCircle(phy.Vec2f{X: 1.1}, 0.25)
	far.Shape().UserData = model.PlayerEntity(p)

	rest(rc, campRestTicks, phy.ColliderSet{far: {}})

	assert.Zero(t, damageBonus(p), "the rest ring is the heal's reach, not the light's")
}

func TestRestClock_TakingDamageDoesNotReset(t *testing.T) {
	p := newFakePlayer()
	rc := testRestCamp(damageOnly(0.03))
	in := colliderSetOf(model.PlayerEntity(p))

	rest(rc, campRestTicks-1, in)
	p.vitalSigns.Health -= 10 // R19: presence only
	p.inCombat = true
	rest(rc, 1, in)

	assert.InDelta(t, 0.03, damageBonus(p), 1e-6)
}

func TestRestClock_StayingRefreshesEachAuraCycle(t *testing.T) {
	p := newFakePlayer()
	rc := testRestCamp(damageOnly(0.03))
	in := colliderSetOf(model.PlayerEntity(p))
	rest(rc, campRestTicks, in)

	for range 59 {
		p.buffs.Tick()
		rc.tick(phy.VEC2F_ZERO, in)
	}
	assert.Equal(t, campRestBuffTicks-59, p.buffs.OwnEffects()[0].Left, "no refresh between cycles (the tray gate stays quiet)")

	p.buffs.Tick()
	rc.tick(phy.VEC2F_ZERO, in)
	assert.Equal(t, campRestBuffTicks, p.buffs.OwnEffects()[0].Left, "one aura cycle on: topped up to 5 min")
}

func TestRestClock_CountsAPlayerOncePerTick(t *testing.T) {
	p := newFakePlayer()
	rc := testRestCamp(damageOnly(0.03))
	in := colliderSetOf(model.PlayerEntity(p), model.PlayerEntity(p)) // two shapes, one player

	rest(rc, campRestTicks/2, in)

	assert.Zero(t, damageBonus(p), "half the rest is half the rest, however many shapes")
}

func TestRestClock_EveryPlayerWhoRestsGetsThemAndNoMob(t *testing.T) {
	owner, stranger := newFakePlayer(), newFakePlayer()
	require.NotEqual(t, owner.Basic().ID(), stranger.Basic().ID())
	wolf := mob.NewMob(testMobDef(), 0, nil)
	rc := testRestCamp(damageOnly(0.03))

	rest(rc, campRestTicks, colliderSetOf(model.PlayerEntity(owner), model.PlayerEntity(stranger), wolf))

	assert.InDelta(t, 0.03, damageBonus(owner), 1e-6)
	assert.InDelta(t, 0.03, damageBonus(stranger), 1e-6, "R10: not just the owner")
	assert.Zero(t, wolf.EffectiveStats().DamageDealtBonus, "players only")
}

// --- strongest wins (R11, R18) ----------------------------------------------------

func TestRestBuffs_TwoCampsOfDifferentStrength(t *testing.T) {
	p := newFakePlayer()
	in := colliderSetOf(model.PlayerEntity(p))
	strong, weak, equal := testRestCamp(damageOnly(0.04)), testRestCamp(damageOnly(0.02)), testRestCamp(damageOnly(0.04))

	rest(strong, campRestTicks, in)
	for range 1000 {
		p.buffs.Tick()
	}
	rest(weak, campRestTicks, in)
	assert.InDelta(t, 0.04, damageBonus(p), 1e-6, "R11: a weaker camp is ignored while the stronger lives")

	rest(equal, campRestTicks, in)
	assert.InDelta(t, 0.04, damageBonus(p), 1e-6, "an equal camp refreshes")
	// The strong stream, refreshed, now outlasts the weak one: age the weak
	// out first and the strong one still counts.
	for range campRestBuffTicks - 1 {
		p.buffs.Tick()
	}
	assert.InDelta(t, 0.04, damageBonus(p), 1e-6, "the refresh topped the stronger stream to 5 min")
}

func TestRestBuffs_AWeakerStreamTakesOverWhenTheStrongerExpiresFirst(t *testing.T) {
	p := newFakePlayer()
	in := colliderSetOf(model.PlayerEntity(p))
	rest(testRestCamp(damageOnly(0.04)), campRestTicks, in)
	for range 1000 {
		p.buffs.Tick()
	}
	rest(testRestCamp(damageOnly(0.02)), campRestTicks, in)

	for range campRestBuffTicks - 1000 {
		p.buffs.Tick()
	}

	assert.InDelta(t, 0.02, damageBonus(p), 1e-6, "R18: the weaker stream is kept and takes over")
}

// --- placement and wiring (D6, D10) -----------------------------------------------

// placeRestCamp channels the caster's Camp to completion with camp-aura.json's
// heal shape and returns the placed camp.
func placeRestCamp(t *testing.T, caster *fakePlayer, g *fakeGame, sk *SkillSystem) *mob.Mob {
	t.Helper()
	def := campMobTestDef()
	def.Skills = []mobs.MobSkill{{Def: campHealAuraDef(), Level: 1}}
	g.mobReg = fakeMobRegistry{campMobName: def}
	caster.sc.RequestUtilityCast(skills.UtilityCamp)
	for range campCastUpdates {
		sk.Update(33.0)
	}
	require.Len(t, g.added, 1)
	return g.added[0].(*mob.Mob)
}

func TestUtilityCamp_SnapshotsTheOwnersBuffTraits(t *testing.T) {
	caster, g, sk := campTestSetup(1)
	caster.campBuffs = damageOnly(0.03)
	camp := placeRestCamp(t, caster, g, sk)
	rc := sk.restCamps[camp.Basic().ID()]
	require.NotNil(t, rc)

	caster.campBuffs = nil // the owner resets every trait
	assert.Equal(t, damageOnly(0.03), rc.buffs, "D6: snapshotted at placement")
	assert.InDelta(t, 0.75, rc.ring, 1e-6, "the ring is the camp aura's heal radius")
	assert.Equal(t, 60, rc.cycle, "the cycle is the heal's interval")

	sk.Remove(camp.Basic())
	assert.Empty(t, sk.restCamps, "a camp that burns out drops its clocks")
}

func TestUtilityCamp_WithoutBuffTraitsRunsNoClock(t *testing.T) {
	caster, g, sk := campTestSetup(1)
	placeRestCamp(t, caster, g, sk)
	assert.Empty(t, sk.restCamps, "D10: a camp with no buff traits skips the clock")
}

// The wiring through the real tick: a real camp and a real player in one physics
// space, so a hook behind an early return in processEntity would go red here.
func TestRestClock_ARealPlayerRestingAtARealCamp(t *testing.T) {
	caster, g, sk := campTestSetup(1)
	space := phy.NewSpace()
	sk.space = space
	g.space = space
	caster.campBuffs = damageOnly(0.03)
	camp := placeRestCamp(t, caster, g, sk)
	sk.AddEntity(camp)

	p := realCCPlayer(t, camp.Position())
	addBodies(space, p.Bodies())
	ticks := []ccTickable{p.(ccTickable)}

	for range campRestTicks - 1 {
		worldTick(space, sk, ticks...)
	}
	require.Zero(t, p.(model.StatBuffable).EffectiveStats().DamageDealtBonus, "precondition: not rested yet")
	for range 2 { // one more rest tick, with one tick of physics lag allowed
		worldTick(space, sk, ticks...)
	}

	assert.InDelta(t, 0.03, p.(model.StatBuffable).EffectiveStats().DamageDealtBonus, 1e-6)
}
