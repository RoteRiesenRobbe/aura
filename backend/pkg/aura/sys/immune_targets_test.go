package sys

// plan-vertical-slice.md R23 (amends plan-immune-targets.md D1 and D4): an
// effect never targets what it can never hurt, read from the species file only
// (D2), and an exact authored zero is the only resistance that steers (D3).
// Every leg puts the immune mob NEARER than the one the hit should take, or it
// would pass by accident (L6).

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/mob"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func speciesMob(resistances map[string]float32, gateKeys ...string) *mob.Mob {
	def := testMobDef()
	def.Factors.Resistances = resistances
	def.Factors.GateKeys = gateKeys
	return mob.NewMob(def, 0, nil)
}

// brambleMob is the gated structure shape: immune to every tag, opened only by
// the harvest key.
func brambleMob() *mob.Mob {
	return speciesMob(map[string]float32{"*": 0}, "harvest")
}

// struck reports whether the mob was picked: a landed hit, an "Immune" stamp
// and an applied dot all note a skill event. A gate that refuses notes nothing,
// so a gated leg reads health instead.
func struck(m *mob.Mob) bool { return len(m.SkillEvents()) > 0 }

func physicalNearest1() skills.EffectDef {
	e := cappedDamageEffect(skills.SelectorNearest, 1)
	e.Damage = &skills.DamageParams{HP: 10, Tags: []string{"physical"}}
	return e
}

// --- selectDamageTargets directly ---

func TestSelectDamageTargets_NeverPicksTheImmune(t *testing.T) {
	bramble, wolf := brambleMob(), speciesMob(nil)
	set := setOf(colliderAt(vec(1, 0), bramble), colliderAt(vec(2, 0), wolf))

	got := selectDamageTargets(set, vec(0, 0), skills.SelectorNearest, 1, alwaysEligible, []string{"physical"}, "")
	require.Len(t, got, 1)
	assert.Same(t, wolf, got[0].Shape().UserData, "the hurtable mob takes the single slot")

	got = selectDamageTargets(set, vec(0, 0), skills.SelectorNearest, 2, alwaysEligible, []string{"physical"}, "")
	require.Len(t, got, 1, "a spare slot stays empty")
	assert.Same(t, wolf, got[0].Shape().UserData)

	got = selectDamageTargets(set, vec(0, 0), skills.SelectorAll, 0, alwaysEligible, []string{"physical"}, "")
	require.Len(t, got, 1, "an uncapped effect skips it as well")
	assert.Same(t, wolf, got[0].Shape().UserData)
}

func TestSelectDamageTargets_KeepsSelectorOrderAmongTheHurtable(t *testing.T) {
	bramble, nearWolf, midWolf, farWolf := brambleMob(), speciesMob(nil), speciesMob(nil), speciesMob(nil)
	set := setOf(colliderAt(vec(1, 0), bramble), colliderAt(vec(2, 0), nearWolf),
		colliderAt(vec(3, 0), midWolf), colliderAt(vec(4, 0), farWolf))

	got := selectDamageTargets(set, vec(0, 0), skills.SelectorNearest, 2, alwaysEligible, []string{"physical"}, "")

	require.Len(t, got, 2)
	assert.Same(t, nearWolf, got[0].Shape().UserData)
	assert.Same(t, midWolf, got[1].Shape().UserData, "a stable partition: the selector's order survives")
}

func TestSelectDamageTargets_NonMobIsNeverSkipped(t *testing.T) {
	// A target without a species file (a player, a test double) always
	// counts as "can hurt" (§4).
	bramble, other := brambleMob(), &touchRecorder{}
	set := setOf(colliderAt(vec(1, 0), bramble), colliderAt(vec(2, 0), other))

	got := selectDamageTargets(set, vec(0, 0), skills.SelectorNearest, 1, alwaysEligible, []string{"physical"}, "")

	require.Len(t, got, 1)
	assert.Same(t, other, got[0].Shape().UserData)
}

// --- through the damage appliers ---

// §8 leg 1, the PO's report: the Bramble nearer than the wolf.
func TestDamageAura_Nearest1SkipsANearerImmuneStructure(t *testing.T) {
	bramble, wolf := brambleMob(), speciesMob(nil)
	set := setOf(colliderAt(vec(1, 0), bramble), colliderAt(vec(2, 0), wolf))

	applyDamageAura(newFakePlayer(), testSkillID, 1, physicalNearest1(), set, testRNG())

	assert.True(t, struck(wolf), "the wolf gets the hit")
	assert.False(t, struck(bramble), "the Bramble no longer soaks it")
}

// R23, the PO's report (F40): alone at the mushroom is empty ground. No hit,
// no cost, no combat. The wolf leg is the control: the same effect does all
// three.
func TestAuraEffect_AloneWithAnImmuneTargetIsEmptyGround(t *testing.T) {
	dot := dotEffect() // fire-tagged
	dot.Type = skills.EffectTypeDotAura
	dot.Selector, dot.MaxTargets = skills.SelectorNearest, 1
	all := physicalNearest1()
	all.Selector, all.MaxTargets = skills.SelectorAll, 0
	gated := physicalNearest1()
	gated.Damage = &skills.DamageParams{HP: 10, GateKey: "smash"}

	for name, tc := range map[string]struct {
		effect   skills.EffectDef
		hurtable func() *mob.Mob
	}{
		"capped damage":   {physicalNearest1(), func() *mob.Mob { return speciesMob(nil) }},
		"uncapped damage": {all, func() *mob.Mob { return speciesMob(nil) }},
		"dot":             {dot, func() *mob.Mob { return speciesMob(nil) }},
		"another key":     {gated, func() *mob.Mob { return speciesMob(map[string]float32{"*": 0}, "smash") }},
	} {
		t.Run(name, func(t *testing.T) {
			cast := func(target *mob.Mob) *fakePlayer {
				p := newFakePlayer()
				testSkillSystem().applyAuraEffect(p, testSkillID, 1, costed(tc.effect, 0.1), setOf(colliderAt(vec(1, 0), target)))
				return p
			}

			control := cast(tc.hurtable())
			require.Less(t, int(control.vitalSigns.Health), 100, "the control pays")
			require.Positive(t, control.combatActions, "the control enters combat")

			bramble := brambleMob()
			p := cast(bramble)
			assert.Empty(t, bramble.SkillEvents(), "no hit event, so no shot is drawn")
			assert.EqualValues(t, 100, p.vitalSigns.Health, "no cost")
			assert.Zero(t, p.combatActions, "no combat")
			assert.False(t, bramble.InCombat())
		})
	}
}

// The gated mirror: Harvest alone beside a wolf reaches nobody. A refused gate
// notes no event, so this leg reads the cost and the combat.
func TestAuraEffect_HarvestAloneBesideAWolfIsEmptyGround(t *testing.T) {
	p := newFakePlayer()
	effect := physicalNearest1()
	effect.Damage = &skills.DamageParams{HP: 10, GateKey: "harvest"}

	testSkillSystem().applyAuraEffect(p, testSkillID, 1, costed(effect, 0.1), setOf(colliderAt(vec(1, 0), speciesMob(nil))))

	assert.EqualValues(t, 100, p.vitalSigns.Health)
	assert.Zero(t, p.combatActions)
}

// R23: a spare slot stays empty.
func TestDamageAura_SpareSlotLeavesTheImmuneStructureAlone(t *testing.T) {
	bramble, wolf := brambleMob(), speciesMob(nil)
	set := setOf(colliderAt(vec(1, 0), bramble), colliderAt(vec(2, 0), wolf))
	effect := physicalNearest1()
	effect.MaxTargets = 3

	applyDamageAura(newFakePlayer(), testSkillID, 1, effect, set, testRNG())

	assert.True(t, struck(wolf))
	assert.False(t, struck(bramble))
}

// D2 with nobody else to take the slot: a temporary immunity stays a target
// and still reads "Immune".
func TestDamageAura_AloneWithAnInvulnerableMobStillStrikesIt(t *testing.T) {
	warlord := speciesMob(nil)
	warlord.SetInvulnerable(true)

	landed := applyDamageAura(newFakePlayer(), testSkillID, 1, physicalNearest1(), setOf(colliderAt(vec(1, 0), warlord)), testRNG())

	assert.True(t, landed)
	events := warlord.SkillEvents()
	require.Len(t, events, 1)
	assert.Equal(t, model.HitKindImmune, events[0].Kind)
}

func TestMobDamageAura_AloneWithAnImmuneStructureLandsNothing(t *testing.T) {
	caster := newFakeMob()
	caster.faction = model.FactionAligned // the target loads hostile
	bramble := brambleMob()

	landed := applyDamageAura(caster, testSkillID, 1, physicalNearest1(), setOf(colliderAt(vec(1, 0), bramble)), testRNG())

	assert.False(t, landed)
	assert.False(t, struck(bramble))
}

// §8 leg 4, the mirror: Harvest picks the key holder over a nearer wolf.
func TestDamageAura_GatedHitPrefersTheKeyHolder(t *testing.T) {
	wolf, turnip := speciesMob(nil), speciesMob(map[string]float32{"*": 0}, "harvest")
	wolfHP, turnipHP := wolf.Health(), turnip.Health()
	set := setOf(colliderAt(vec(1, 0), wolf), colliderAt(vec(2, 0), turnip))
	effect := physicalNearest1()
	effect.Damage = &skills.DamageParams{HP: 10, GateKey: "harvest"}

	applyDamageAura(newFakePlayer(), testSkillID, 1, effect, set, testRNG())

	assert.Less(t, turnip.Health(), turnipHP, "the turnip gets the hit")
	assert.Equal(t, wolfHP, wolf.Health())
}

// §8 leg 5: tag immunity, the direct hit.
func TestDamageAura_PoisonSkipsANearerPoisonImmuneMob(t *testing.T) {
	skeleton, ghoul := speciesMob(map[string]float32{"poison": 0}), speciesMob(nil)
	set := setOf(colliderAt(vec(1, 0), skeleton), colliderAt(vec(2, 0), ghoul))
	effect := physicalNearest1()
	effect.Damage.Tags = []string{"poison"}

	applyDamageAura(newFakePlayer(), testSkillID, 1, effect, set, testRNG())

	assert.True(t, struck(ghoul))
	assert.False(t, struck(skeleton))
}

// §8 leg 5: tag immunity, the dot reads its own tags.
func TestDotAura_SkipsANearerTagImmuneMob(t *testing.T) {
	salamander, wolf := speciesMob(map[string]float32{"fire": 0}), speciesMob(nil)
	set := setOf(colliderAt(vec(1, 0), salamander), colliderAt(vec(2, 0), wolf))
	effect := dotEffect() // fire-tagged
	effect.Selector, effect.MaxTargets = skills.SelectorNearest, 1

	applyDotEffect(newFakePlayer(), testSkillID, 1, effect, set)

	assert.True(t, struck(wolf))
	assert.False(t, struck(salamander))
}

// §8 leg 6, D2: scripted invulnerability is temporary state, so the nearer
// invulnerable mob is still picked.
func TestDamageAura_InvulnerableMobIsStillPicked(t *testing.T) {
	warlord, add := speciesMob(nil), speciesMob(nil)
	warlord.SetInvulnerable(true)
	set := setOf(colliderAt(vec(1, 0), warlord), colliderAt(vec(2, 0), add))

	applyDamageAura(newFakePlayer(), testSkillID, 1, physicalNearest1(), set, testRNG())

	assert.True(t, struck(warlord))
	assert.False(t, struck(add))
}

// §8 leg 7, D3: a partial resistance never steers the pick.
func TestDamageAura_PartialResistanceNeverSteers(t *testing.T) {
	bear, drakeling := speciesMob(map[string]float32{"frost": 0.25}), speciesMob(map[string]float32{"frost": 1.5})
	set := setOf(colliderAt(vec(1, 0), bear), colliderAt(vec(2, 0), drakeling))
	effect := physicalNearest1()
	effect.Damage.Tags = []string{"frost"}

	applyDamageAura(newFakePlayer(), testSkillID, 1, effect, set, testRNG())

	assert.True(t, struck(bear))
	assert.False(t, struck(drakeling))
}

// §8 leg 8: a mob caster runs the same ordering (applyMobDamageAura).
func TestMobDamageAura_SkipsANearerImmuneStructure(t *testing.T) {
	caster := newFakeMob()
	caster.faction = model.FactionAligned // the targets load hostile
	bramble, wolf := brambleMob(), speciesMob(nil)
	set := setOf(colliderAt(vec(1, 0), bramble), colliderAt(vec(2, 0), wolf))

	applyDamageAura(caster, testSkillID, 1, physicalNearest1(), set, testRNG())

	assert.True(t, struck(wolf))
	assert.False(t, struck(bramble))
}

// §8 leg 8: a credited caster (a charmed mob; an owned summon shares the
// path) runs the same ordering.
func TestCreditedDamageAura_SkipsANearerImmuneStructure(t *testing.T) {
	charmed := mob.NewMob(hostileMobDef(), 0, nil)
	charmed.Charm(newFakePlayer(), 63, 1800)
	bramble, wolf := brambleMob(), speciesMob(nil)
	set := setOf(colliderAt(vec(1, 0), bramble), colliderAt(vec(2, 0), wolf))

	applyDamageAura(charmed, testSkillID, 1, physicalNearest1(), set, testRNG())

	assert.True(t, struck(wolf))
	assert.False(t, struck(bramble))
}
