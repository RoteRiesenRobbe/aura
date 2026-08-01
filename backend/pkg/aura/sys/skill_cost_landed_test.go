package sys

// What "landed" MEANS (plan-resource-costs-feedback R2 / §5.1 + §5.2).
//
// D8 has always said an aura "pays only when its effect actually lands", but
// the code implemented three rules: heal paid for work done, damage and dot
// paid when something was hit, and shield / resist / hot paid for a target
// merely being IN RANGE — while a targetsSelf effect answered an unconditional
// true, before the target set was even read.
//
// R2 makes it one rule: work done. A refresh at the same strength changes
// nothing but an expiry timer, so it is not work and is not charged. Shield is
// the one exception in shape, not in principle — its pool is a sustain signal,
// so restoring HP a target actually absorbed IS work.
//
// Reuses the fakePlayer / recorder doubles from skills_behavior_test.go, which
// are backed by a real skills.Buffs precisely so their new-vs-refresh answers
// are the shipped ones.

import (
	"os"
	"testing"

	"github.com/EngoEngine/ecs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/factions"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/vitals"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// --- §5.2: a refresh is not work, on every applier that carries a buff ---

func TestAuraCost_RefreshOnTheSameTargetChargesNothing(t *testing.T) {
	// The idle drain, per applier. A target that stays in range keeps its buff
	// alive by refresh (lifetime = tick interval + 1), so the aura pays for the
	// application that reached it and nothing after.
	for _, tc := range []struct {
		name   string
		effect skills.EffectDef
		target func() any
	}{
		{"resist_aura", resistEffect(), func() any { return &resistTargetRecorder{basic: ecs.NewBasic()} }},
		{"shield_aura", shieldEffect(), func() any { return &shieldTargetRecorder{basic: ecs.NewBasic()} }},
		{"hot_aura", hotAuraEffect(), func() any { return woundedHotTarget() }},
		{"dot_aura", dotEffect(), func() any { return &dotRecorder{basic: ecs.NewBasic()} }},
		{"slow_aura", slowEffect(), func() any { return newSlowTarget() }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			caster := newFakePlayer() // 100 max, 100 current
			set := colliderSetOf(tc.target())
			effect := costed(tc.effect, 0.1)
			s := testSkillSystem()

			s.applyAuraEffect(caster, 1, 1, effect, set)
			require.Equal(t, vitals.VitalSign(90), caster.vitalSigns.Health,
				"the application that reached the target costs")

			for i := 0; i < 5; i++ {
				s.applyAuraEffect(caster, 1, 1, effect, set)
			}
			assert.Equal(t, vitals.VitalSign(90), caster.vitalSigns.Health,
				"and holding it there costs nothing — a refresh only bumps an expiry timer")
		})
	}
}

func TestAuraCost_TargetLeavingAndReturningPaysAgain(t *testing.T) {
	// The other half of the rule, and what stops "charge once" becoming "charge
	// once ever": once the buff has lapsed, the next application is genuinely
	// new. Modelled here by a fresh target — the same thing the aura sees when
	// somebody walks back into range after their buff ran out.
	caster := newFakePlayer()
	effect := costed(resistEffect(), 0.1)
	s := testSkillSystem()

	s.applyAuraEffect(caster, 1, 1, effect, colliderSetOf(&resistTargetRecorder{basic: ecs.NewBasic()}))
	s.applyAuraEffect(caster, 1, 1, effect, colliderSetOf(&resistTargetRecorder{basic: ecs.NewBasic()}))

	assert.Equal(t, vitals.VitalSign(80), caster.vitalSigns.Health)
}

// --- §3.2's correction case: the aura that charged for existing ---

func TestAuraCost_SelfTargetingAuraAloneInAnEmptyFieldChargesOnce(t *testing.T) {
	// Warbanner's shape. `targetsSelf` used to set the landed flag BEFORE the
	// target set was read, so the aura charged full price with no ally, no
	// enemy — with nobody in the world at all. At skill 10 that was 1.31 %/s
	// against 0.40 %/s tapered regen: a full pool to the clamp in ~110 s of
	// standing still.
	effect := costed(shieldEffect(), 0.1)
	effect.Shield.TargetsSelf = true

	caster := newFakePlayer()
	s := testSkillSystem()

	s.applyAuraEffect(caster, 1, 1, effect, nil)
	require.Equal(t, vitals.VitalSign(90), caster.vitalSigns.Health,
		"putting the shield up is work and costs")

	for i := 0; i < 30; i++ {
		s.applyAuraEffect(caster, 1, 1, effect, nil)
	}
	assert.Equal(t, vitals.VitalSign(90), caster.vitalSigns.Health,
		"wearing it is not")
}

func TestAuraCost_ShieldChargesAgainOnceThePoolWasConsumed(t *testing.T) {
	// Shield's own sustain signal (§5.2), and the reason its rule is wider than
	// resist's: a full pool topped up to full is not work, but replacing HP the
	// wearer actually absorbed is. So a shield aura costs exactly while it is
	// doing its job, and nothing while nothing is hitting the people under it.
	effect := costed(shieldEffect(), 0.1)
	effect.Shield.TargetsSelf = true

	caster := newFakePlayer()
	s := testSkillSystem()

	s.applyAuraEffect(caster, 1, 1, effect, nil)
	s.applyAuraEffect(caster, 1, 1, effect, nil)
	require.Equal(t, vitals.VitalSign(90), caster.vitalSigns.Health, "granted, then held")

	// Something hits the wearer and the pool eats part of it.
	require.Greater(t, caster.buffs.AbsorbShield(5), float32(0))

	s.applyAuraEffect(caster, 1, 1, effect, nil)
	assert.Equal(t, vitals.VitalSign(80), caster.vitalSigns.Health,
		"the absorbed 5 HP was replaced — that is work")
}

// --- §5.1: pay to ignite, not to keep burning ---

func TestAuraCost_DotChargesOnIgnitionNotOnEveryReapplication(t *testing.T) {
	// F9, the PO's report: Immolate pays every 20 ticks while its dot only fires
	// every 60, so "it feels weird to pay again even if the dot is already
	// applied". The burn is bought once. (R3 re-prices it to the whole burn.)
	caster := newFakePlayer()
	target := &dotRecorder{basic: ecs.NewBasic()}
	set := colliderSetOf(target)
	effect := costed(dotEffect(), 0.1)
	s := testSkillSystem()

	for i := 0; i < 10; i++ {
		s.applyAuraEffect(caster, 1, 1, effect, set)
	}

	assert.Equal(t, vitals.VitalSign(90), caster.vitalSigns.Health, "one ignition, one charge")
	assert.Len(t, target.dots, 10, "while the debuff is still re-applied every tick")
}

// --- D9: the ruling is about AURAS. Cooldowns still pay on cast ---

func TestCooldownCost_InstantShieldPaysOnEveryCastIncludingARefresh(t *testing.T) {
	// The instant twins count their self-apply as a hit on purpose — a Barrier
	// cast with nobody around is not a whiff — and R2 must not sweep them up:
	// a cooldown is a committed act (D9). Re-casting onto a full pool still
	// costs, which is exactly the case the aura path now stops charging for.
	effect := costed(shieldEffect(), 0.1)
	effect.Shield.TargetsSelf = true
	effect.Type = skills.EffectTypeInstantShield
	effect.Shield.DurationTicks = 300

	caster := newFakePlayer()
	s := testSkillSystem()
	for i := 0; i < 3; i++ {
		es := equippedCooldown(effect)
		s.fireAndCharge(caster, es)
	}

	assert.Equal(t, vitals.VitalSign(70), caster.vitalSigns.Health,
		"three casts, three charges")
}

// --- §3.8: the free floor stops paying for its own pricing ---

// pricelessPayer panics if anything asks it what its pool is. The free Damage
// aura is the most-executed aura in the game and MaxHealth() is a math.Pow
// through curve.F; before R2 it evaluated that per effect per tick and then
// multiplied it by zero. It allocates nothing, so the alloc guards structurally
// cannot see it — this is the only eye on it.
type pricelessPayer struct {
	*fakePlayer
}

func (pricelessPayer) MaxHealth() vitals.VitalSign {
	panic("a free effect must never price the caster's pool (§3.8)")
}

func TestEffectCostHP_FreeEffectNeverPricesThePool(t *testing.T) {
	caster := pricelessPayer{newFakePlayer()}

	assert.Zero(t, effectCostHP(caster, caster, damageEffect(1), 1))

	assert.Panics(t, func() { effectCostHP(caster, caster, costed(damageEffect(1), 0.1), 1) },
		"and a priced one still reads it — otherwise this test proves nothing")
}

var _ costPayer = pricelessPayer{}

// --- the regression §3.2 actually describes, on REAL content ---

// warbannerDef reads the authored Warbanner straight from the api/ tree. The
// per-applier tests above use synthetic effects; this one is here because
// Warbanner is the skill the finding was computed on and because all four of its
// effects are priced and dispatched together — the composed case a per-applier
// test cannot see. (Its four cadences were 40/120/30/1 when this was written;
// R3/F5 put all four on the damage beat of 40. The property below does not
// depend on either arrangement.)
func warbannerDef(t *testing.T) *skills.SkillDefinition {
	t.Helper()
	fr, err := factions.RegistryFromFS(os.DirFS("../../../../api/factions"))
	require.NoError(t, err)
	registry, err := skills.RegistryFromFS(os.DirFS("../../../../api/skills"), fr)
	require.NoError(t, err)
	def, err := registry.GetByName("Warbanner")
	require.NoError(t, err)
	return def
}

func TestAuraCost_WarbannerNextToAnAllyWithNoEnemyDoesNotDrain(t *testing.T) {
	// §3.2, computed: at skill level 10 Warbanner's shield charged 1.31 %/s for
	// an ally merely standing in range — no enemy required — against 0.40 %/s
	// tapered out-of-combat regen. Net −0.91 %/s doing nothing, full pool to the
	// 1-HP clamp in ~110 s. This test failed before R2.
	def := warbannerDef(t)
	caster := newFakePlayer()
	ally := newFakePlayer() // full health: there is nothing to heal either

	set := colliderSetOf(ally)
	s := testSkillSystem()

	// Seconds of standing still, every effect on its own authored cadence — the
	// applyAuraEffects dispatch loop, without needing a live phy space.
	run := func(seconds int) {
		for tick := 1; tick <= seconds*33; tick++ {
			for _, effect := range def.Effects {
				if tick%skills.EffectiveTickInterval(effect, def.MaxLevel, 1) != 0 {
					continue
				}
				s.applyAuraEffect(caster, def.ID, def.MaxLevel, effect, set)
			}
		}
	}

	run(10)
	afterTen := int(caster.vitalSigns.Health)
	run(10)
	afterTwenty := int(caster.vitalSigns.Health)

	// The real property, and the one R3 had to restate: putting the shield up is
	// work and is paid for once; TIME is not. Asserting a specific surviving
	// health would pin the shield's price instead, which is a number the content
	// passes move on purpose — this failed for exactly that reason when F5
	// re-authored the shield beat, with the drain it was written to catch long
	// gone.
	assert.Equal(t, afterTen, afterTwenty,
		"holding a support aura next to a healthy ally with no enemy is not a RUNNING cost")

	// And the one-off is genuinely one-off, not a slow leak under a coarse
	// second-hand: a handful of HP at most, against the ~46 the pre-R2 drain
	// took over the same 20 seconds.
	assert.Greater(t, afterTwenty, 90,
		"the initial application should cost a few HP, not a measurable share of the pool")
}
