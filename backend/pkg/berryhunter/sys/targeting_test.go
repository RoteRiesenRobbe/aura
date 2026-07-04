package sys

// Unit + behavior tests for the item-11 targeting pipeline: selector ordering,
// target cap, and their level scaling. selectTargets is tested directly; the
// wiring into the damage/heal apply functions is tested through them.

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
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

func TestSelectTargets_AllSelectorIgnoresCap(t *testing.T) {
	set := setOf(colliderAt(vec(1, 0), "a"), colliderAt(vec(2, 0), "b"), colliderAt(vec(3, 0), "c"))

	got := selectTargets(set, phy.VEC2F_ZERO, skills.SelectorAll, 1, alwaysEligible)

	assert.Len(t, got, 3, "selector all is the explicit AoE-all case, cap ignored")
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

	applyDamageAura(caster, 1, cappedDamageEffect(skills.SelectorNearest, 1), set)

	assert.Len(t, near.touches, 1, "the closest target is hit")
	assert.Empty(t, far.touches, "the capped-out target is spared")
}

func TestApplyDamageAura_UncappedHitsAll(t *testing.T) {
	caster := newFakePlayer()
	a := &touchRecorder{}
	b := &touchRecorder{}
	set := setOf(colliderAt(vec(1, 0), a), colliderAt(vec(20, 0), b))

	applyDamageAura(caster, 1, cappedDamageEffect(skills.SelectorNearest, 0), set)

	assert.Len(t, a.touches, 1)
	assert.Len(t, b.touches, 1)
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
	applyDamageAura(caster, 2, effect, set)

	assert.Len(t, near.touches, 1)
	assert.Len(t, mid.touches, 1)
	assert.Empty(t, far.touches)
}