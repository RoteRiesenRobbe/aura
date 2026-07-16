package sys

// Unit + behavior tests for the item-11 targeting pipeline: selector ordering,
// target cap, and their level scaling. selectTargets is tested directly; the
// wiring into the damage/heal apply functions is tested through them.

import (
	"testing"

	"github.com/EngoEngine/ecs"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/trichner/berryhunter/pkg/berryhunter/model"
	"github.com/trichner/berryhunter/pkg/berryhunter/model/vitals"
	"github.com/trichner/berryhunter/pkg/berryhunter/phy"
	"github.com/trichner/berryhunter/pkg/berryhunter/skills"
)

// ratioStub is UserData that exposes a health ratio for lowest_health tests.
type ratioStub struct{ r float32 }

func (s ratioStub) HealthRatio() float32 { return s.r }

func colliderAt(pos phy.Vec2f, userData any) phy.Collider {
	c := phy.NewCircle(pos, 0.25)
	c.Shape().UserData = userData
	return c
}

func setOf(cs ...phy.Collider) phy.ColliderSet {
	set := make(phy.ColliderSet, len(cs))
	for _, c := range cs {
		set[c] = struct{}{}
	}
	return set
}

func vec(x, y float32) phy.Vec2f { return phy.Vec2f{X: x, Y: y} }

// alwaysEligible passes every candidate through the eligibility filter.
func alwaysEligible(phy.Collider) bool { return true }

// --- effectiveMaxTargets / effectiveTickInterval ---

func TestEffectiveMaxTargets(t *testing.T) {
	assert.Equal(t, 0, effectiveMaxTargets(skills.EffectDef{MaxTargets: 0, MaxTargetsPerLevel: 5}, 3),
		"MaxTargets 0 stays uncapped regardless of per-level")
	assert.Equal(t, 1, effectiveMaxTargets(skills.EffectDef{MaxTargets: 1}, 1))
	assert.Equal(t, 3, effectiveMaxTargets(skills.EffectDef{MaxTargets: 1, MaxTargetsPerLevel: 1}, 3),
		"1 + (3-1)*1 = 3")
	assert.Equal(t, 1, effectiveMaxTargets(skills.EffectDef{MaxTargets: 2, MaxTargetsPerLevel: -5}, 3),
		"a configured cap never scales below 1")
}

func TestEffectiveTickInterval(t *testing.T) {
	assert.Equal(t, 10, effectiveTickInterval(skills.EffectDef{TickInterval: 10}, 1))
	assert.Equal(t, 6, effectiveTickInterval(skills.EffectDef{TickInterval: 10, TickIntervalPerLevel: -2}, 3),
		"10 + (3-1)*-2 = 6")
	assert.Equal(t, 1, effectiveTickInterval(skills.EffectDef{TickInterval: 2, TickIntervalPerLevel: -10}, 5),
		"floored at 1")
}

// --- selectTargets ---

func TestSelectTargets_UncappedReturnsAllEligible(t *testing.T) {
	set := setOf(colliderAt(vec(1, 0), "a"), colliderAt(vec(2, 0), "b"), colliderAt(vec(3, 0), "c"))

	got := selectTargets(set, phy.VEC2F_ZERO, skills.SelectorNearest, 0, alwaysEligible)

	assert.Len(t, got, 3, "maxTargets 0 hits everyone in range")
}

func TestSelectTargets_EligibleFilterAppliedBeforeCap(t *testing.T) {
	keep := colliderAt(vec(1, 0), "keep")
	set := setOf(keep, colliderAt(vec(2, 0), "drop"), colliderAt(vec(3, 0), "drop"))

	got := selectTargets(set, phy.VEC2F_ZERO, skills.SelectorNearest, 2,
		func(c phy.Collider) bool { return c.Shape().UserData == "keep" })

	require.Len(t, got, 1, "only eligible candidates count toward the cap")
	assert.Equal(t, "keep", got[0].Shape().UserData)
}

func TestSelectTargets_NearestCapTakesClosest(t *testing.T) {
	near := colliderAt(vec(1, 0), "near")
	mid := colliderAt(vec(5, 0), "mid")
	far := colliderAt(vec(9, 0), "far")
	set := setOf(far, near, mid)

	got := selectTargets(set, phy.VEC2F_ZERO, skills.SelectorNearest, 2, alwaysEligible)

	require.Len(t, got, 2)
	assert.Equal(t, "near", got[0].Shape().UserData)
	assert.Equal(t, "mid", got[1].Shape().UserData)
}

func TestSelectTargets_LowestHealthCapTakesMostWounded(t *testing.T) {
	// Percentual: the 0.1-ratio target is picked over a physically closer but
	// healthier one — position must not matter for lowest_health.
	healthy := colliderAt(vec(1, 0), ratioStub{0.9})
	wounded := colliderAt(vec(9, 0), ratioStub{0.1})
	mid := colliderAt(vec(2, 0), ratioStub{0.5})
	set := setOf(healthy, wounded, mid)

	got := selectTargets(set, phy.VEC2F_ZERO, skills.SelectorLowestHealth, 1, alwaysEligible)

	require.Len(t, got, 1)
	assert.InDelta(t, 0.1, got[0].Shape().UserData.(ratioStub).r, 1e-6)
}

// idStub is UserData that exposes an entity ID for the stable-order tests.
type idStub struct{ basic ecs.BasicEntity }

func (s *idStub) Basic() ecs.BasicEntity { return s.basic }

// Equidistant candidates under a cap: the pick must not ride on Go's
// randomized map iteration — ties resolve to the lowest entity ID (creation
// order) every time. Pack fights in the sim harness replay under a fixed
// seed only if this holds (plan-sim-harness §3, chunk 3).
func TestSelectTargets_EquidistantTieIsDeterministic(t *testing.T) {
	first := &idStub{ecs.NewBasic()}
	second := &idStub{ecs.NewBasic()}
	third := &idStub{ecs.NewBasic()}
	set := setOf(colliderAt(vec(1, 0), first), colliderAt(vec(-1, 0), second), colliderAt(vec(0, 1), third))

	for i := 0; i < 50; i++ {
		got := selectTargets(set, phy.VEC2F_ZERO, skills.SelectorNearest, 1, alwaysEligible)
		require.Len(t, got, 1)
		assert.Same(t, first, got[0].Shape().UserData, "ties resolve to the oldest entity, run %d", i)
	}
}

// The uncapped path needs a deterministic APPLICATION order too: per-target
// damage rolls draw from the caster's rng in slice order, so map order
// leaking through would randomize which target gets which roll.
func TestSelectTargets_UncappedOrderIsDeterministic(t *testing.T) {
	a := &idStub{ecs.NewBasic()}
	b := &idStub{ecs.NewBasic()}
	c := &idStub{ecs.NewBasic()}
	set := setOf(colliderAt(vec(2, 0), b), colliderAt(vec(1, 0), a), colliderAt(vec(3, 0), c))

	for i := 0; i < 50; i++ {
		got := selectTargets(set, phy.VEC2F_ZERO, skills.SelectorNearest, 0, alwaysEligible)
		require.Len(t, got, 3)
		assert.Same(t, a, got[0].Shape().UserData, "run %d", i)
		assert.Same(t, b, got[1].Shape().UserData, "run %d", i)
		assert.Same(t, c, got[2].Shape().UserData, "run %d", i)
	}
}

func TestSelectTargets_AllSelectorIgnoresCap(t *testing.T) {
	set := setOf(colliderAt(vec(1, 0), "a"), colliderAt(vec(2, 0), "b"), colliderAt(vec(3, 0), "c"))

	got := selectTargets(set, phy.VEC2F_ZERO, skills.SelectorAll, 1, alwaysEligible)

	assert.Len(t, got, 3, "selector all is the explicit AoE-all case, cap ignored")
}

// --- effectCollisions (per-effect range check, atmosphere & recovery chunk 2) ---

func TestEffectCollisions_SubSensorRadiusDropsOutOfRangeTarget(t *testing.T) {
	// Sensor radius 1.0, effect radius 0.3, target bodies radius 0.25: the
	// overlap rule mirrors the sensor's own circle-circle test, so the effect
	// reaches out to centerDist < 0.3 + 0.25 = 0.55.
	inRange := colliderAt(vec(0.5, 0), "in")
	outOfRange := colliderAt(vec(0.6, 0), "out")
	set := setOf(inRange, outOfRange)

	effect := skills.EffectDef{Radius: 0.3}
	got := effectCollisions(set, phy.VEC2F_ZERO, 1.0, effect, 1)

	assert.Contains(t, got, inRange, "a target overlapping the effect circle is kept")
	assert.NotContains(t, got, outOfRange, "a mid-sensor target beyond the effect radius is dropped")
}

func TestEffectCollisions_EqualRadiiPassSetThroughUntouched(t *testing.T) {
	// The sensor produced this set; an effect at the full sensor radius must
	// not second-guess it (bit-identical no-op) — even for an entry that has
	// since drifted beyond the radius.
	drifted := colliderAt(vec(5, 0), "drifted")
	set := setOf(drifted)

	effect := skills.EffectDef{Radius: 1.0}
	got := effectCollisions(set, phy.VEC2F_ZERO, 1.0, effect, 1)

	assert.Contains(t, got, drifted, "equal radii: no distance check runs, the sensor's set is authoritative")
}

func TestEffectCollisions_LevelScalesEffectRadius(t *testing.T) {
	// Radius 0.3 + 0.35/level: at L1 the 0.6-distant target is out of range
	// (0.6 ≥ 0.55), at L2 the scaled radius 0.65 reaches it (0.6 < 0.9).
	target := colliderAt(vec(0.6, 0), "t")
	set := setOf(target)
	effect := skills.EffectDef{Radius: 0.3, RadiusPerLevel: 0.35}

	assert.NotContains(t, effectCollisions(set, phy.VEC2F_ZERO, 1.0, effect, 1), target,
		"level 1: base radius misses")
	assert.Contains(t, effectCollisions(set, phy.VEC2F_ZERO, 1.0, effect, 2), target,
		"level 2: the per-level radius growth reaches the target")
}

// --- wiring through applyDamageAura / applyHealAura ---

func cappedDamageEffect(sel skills.Selector, maxTargets int) skills.EffectDef {
	e := damageEffect(1)
	e.Selector = sel
	e.MaxTargets = maxTargets
	return e
}

func TestApplyDamageAura_CapHitsOnlyNearest(t *testing.T) {
	caster := newFakePlayer() // aura at origin
	near := &touchRecorder{}
	far := &touchRecorder{}
	set := setOf(colliderAt(vec(1, 0), near), colliderAt(vec(20, 0), far))

	applyDamageAura(caster, 1, cappedDamageEffect(skills.SelectorNearest, 1), set, testRNG())

	assert.Len(t, near.touches, 1, "the closest target is hit")
	assert.Empty(t, far.touches, "the capped-out target is spared")
}

func TestApplyDamageAura_UncappedHitsAll(t *testing.T) {
	caster := newFakePlayer()
	a := &touchRecorder{}
	b := &touchRecorder{}
	set := setOf(colliderAt(vec(1, 0), a), colliderAt(vec(20, 0), b))

	applyDamageAura(caster, 1, cappedDamageEffect(skills.SelectorNearest, 0), set, testRNG())

	assert.Len(t, a.touches, 1)
	assert.Len(t, b.touches, 1)
}

func TestApplyHealAura_LowestHealthHealsMostWounded(t *testing.T) {
	// HealAura ships with selector lowest_health + maxTargets 1: the single
	// most-wounded ally (by percentage) is healed, even if farther away than a
	// less-wounded one.
	caster := newFakePlayer()
	nearHealthy := newFakePlayer()
	nearHealthy.vitalSigns.Health = 90 // 90% of maxHealth 100, close
	farWounded := newFakePlayer()
	farWounded.vitalSigns.Health = 30 // 30% of maxHealth 100, far
	farWoundedStart := farWounded.vitalSigns.Health

	effect := healEffect()
	effect.Selector = skills.SelectorLowestHealth
	effect.MaxTargets = 1
	set := setOf(
		colliderAt(vec(1, 0), model.PlayerEntity(nearHealthy)),
		colliderAt(vec(20, 0), model.PlayerEntity(farWounded)),
	)

	testSkillSystem().applyHealAura(caster, 1, effect, set)

	assert.Equal(t, farWoundedStart.Add(10), farWounded.vitalSigns.Health,
		"the most-wounded ally is healed")
	assert.Equal(t, vitals.VitalSign(90), nearHealthy.vitalSigns.Health,
		"the healthier ally is left untouched by the single-target cap")
}

func TestApplyHealAura_RecordsHealReceivedNumber(t *testing.T) {
	// The healed ally accumulates the exact heal delta for its floating heal
	// number (item 11).
	caster := newFakePlayer()
	ally := newFakePlayer()
	ally.vitalSigns.Health = 50
	before := ally.vitalSigns.Health

	testSkillSystem().applyHealAura(caster, 1, healEffect(), setOf(colliderAt(vec(1, 0), model.PlayerEntity(ally))))

	assert.Equal(t, ally.vitalSigns.Health-before, ally.healReceived)
	assert.NotZero(t, ally.healReceived)
}

func TestApplyDamageAura_CapGrowsWithLevel(t *testing.T) {
	caster := newFakePlayer()
	near := &touchRecorder{}
	mid := &touchRecorder{}
	far := &touchRecorder{}
	set := setOf(colliderAt(vec(1, 0), near), colliderAt(vec(5, 0), mid), colliderAt(vec(20, 0), far))

	// maxTargets 1 at L1, +1 per level → 2 targets at L2.
	effect := cappedDamageEffect(skills.SelectorNearest, 1)
	effect.MaxTargetsPerLevel = 1
	applyDamageAura(caster, 2, effect, set, testRNG())

	assert.Len(t, near.touches, 1)
	assert.Len(t, mid.touches, 1)
	assert.Empty(t, far.touches)
}

// --- aura-hit style resolution (item 11 Step 4) ---

func TestAuraHitStyleFor_AutoDerivesFromCadence(t *testing.T) {
	slow := skills.EffectDef{Type: skills.EffectTypeDamageAura, TickInterval: auraSlashTickThreshold, Damage: &skills.DamageParams{}}
	fast := skills.EffectDef{Type: skills.EffectTypeDamageAura, TickInterval: 1, Damage: &skills.DamageParams{}}

	assert.Equal(t, model.AuraHitStyleSlash, auraHitStyleFor(slow, 1),
		"a slow-tick aura reads as slash under HitStyleAuto")
	assert.Equal(t, model.AuraHitStyleFire, auraHitStyleFor(fast, 1),
		"a fast-tick aura reads as fire under HitStyleAuto")
}

func TestAuraHitStyleFor_ExplicitOverrideBeatsCadence(t *testing.T) {
	// A fast-tick aura that pins slash, and a slow-tick aura that pins fire:
	// the explicit hitStyle must win over the cadence default.
	pinnedSlash := skills.EffectDef{Type: skills.EffectTypeDamageAura, TickInterval: 1, Damage: &skills.DamageParams{HitStyle: skills.HitStyleSlash}}
	pinnedFire := skills.EffectDef{Type: skills.EffectTypeDamageAura, TickInterval: auraSlashTickThreshold, Damage: &skills.DamageParams{HitStyle: skills.HitStyleFire}}

	assert.Equal(t, model.AuraHitStyleSlash, auraHitStyleFor(pinnedSlash, 1))
	assert.Equal(t, model.AuraHitStyleFire, auraHitStyleFor(pinnedFire, 1))
}

func TestAuraHitStyleFor_NoneSuppressesVFX(t *testing.T) {
	effect := skills.EffectDef{Type: skills.EffectTypeDamageAura, TickInterval: 1, Damage: &skills.DamageParams{HitStyle: skills.HitStyleNone}}
	assert.Equal(t, model.AuraHitStyleNone, auraHitStyleFor(effect, 1))
}
