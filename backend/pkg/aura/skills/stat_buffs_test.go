package skills

import (
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Stat buffs on others (plan-effect-types-round-2.md C1, D11-D15): a timed
// statPayload in the buff store, read beside Derived and never folded into it.

func TestBuffs_ApplyStatReportsNewThenRefresh(t *testing.T) {
	var b Buffs
	assert.True(t, b.ApplyStat(5, StatDamageDealt, 0.2, 30), "a first application is new work")
	assert.False(t, b.ApplyStat(5, StatDamageDealt, 0.2, 30), "the same bonus refreshes")
	assert.True(t, b.ApplyStat(5, StatDamageDealt, 0.3, 30), "a different bonus opens its own stream")
	assert.InDelta(t, 0.3, b.StatBonus(StatDamageDealt), 1e-6, "strongest within one skill counts")
}

// D13: within one skill the strongest stream counts (by magnitude, so a
// level-up mid-buff never double-counts), different skills ADD per stat.
func TestBuffs_StatBonusStrongestPerSkillSumAcrossSkills(t *testing.T) {
	var b Buffs
	b.ApplyStat(1, StatDamageDealt, 0.1, 30)
	b.ApplyStat(1, StatDamageDealt, 0.25, 30)
	b.ApplyStat(2, StatDamageDealt, -0.4, 30)
	b.ApplyStat(3, StatCritChance, 0.05, 30)

	assert.InDelta(t, 0.25-0.4, b.StatBonus(StatDamageDealt), 1e-6)
	assert.InDelta(t, 0.05, b.StatBonus(StatCritChance), 1e-6, "stats never leak into each other")
	assert.Zero(t, b.StatBonus(StatThreat))

	weaker := Buffs{}
	weaker.ApplyStat(1, StatDamageReduction, -0.3, 30)
	weaker.ApplyStat(1, StatDamageReduction, 0.1, 30)
	assert.InDelta(t, -0.3, weaker.StatBonus(StatDamageReduction), 1e-6, "strongest is by magnitude, either sign")
}

func TestBuffs_StatStreamExpires(t *testing.T) {
	var b Buffs
	b.ApplyStat(1, StatThreat, 0.5, 2)
	b.Tick()
	assert.InDelta(t, 0.5, b.StatBonus(StatThreat), 1e-6)
	b.Tick()
	assert.Zero(t, b.StatBonus(StatThreat), "gone after its lifetime")
}

// D12: the sign decides the side, on the pips and on the tray.
func TestBuffs_StatSignPicksTheBits(t *testing.T) {
	var up, down Buffs
	up.ApplyStat(1, StatDamageDealt, 0.2, 30)
	down.ApplyStat(1, StatDamageDealt, -0.2, 30)

	assert.Equal(t, AppliedEffectStatUp, up.AppliedEffects())
	assert.Equal(t, AppliedEffectStatDown, down.AppliedEffects())
	require.Len(t, up.OwnEffects(), 1)
	require.Len(t, down.OwnEffects(), 1)
	assert.Equal(t, EffectKindStatUp, up.OwnEffects()[0].Kinds)
	assert.Equal(t, EffectKindStatDown, down.OwnEffects()[0].Kinds)
}

// D14: the buffs ride beside Derived. WithBuffs adds the four on-others stats
// and leaves every other field alone.
func TestDerivedStats_WithBuffsAddsTheFourStats(t *testing.T) {
	d := DerivedStats{DamageDealtBonus: 0.1, MaxHealthBonus: 0.5}
	var b Buffs
	b.ApplyStat(1, StatDamageDealt, 0.2, 30)
	b.ApplyStat(2, StatDamageReduction, 0.3, 30)
	b.ApplyStat(3, StatCritChance, 0.05, 30)
	b.ApplyStat(4, StatThreat, 1, 30)

	got := d.WithBuffs(&b)
	assert.InDelta(t, 0.3, got.DamageDealtBonus, 1e-6)
	assert.InDelta(t, 0.3, got.DamageReductionBonus, 1e-6)
	assert.InDelta(t, 0.05, got.CritChanceBonus, 1e-6)
	assert.InDelta(t, 1, got.ThreatBonus, 1e-6)
	assert.InDelta(t, 0.5, got.MaxHealthBonus, 1e-6, "pool is not an on-others stat (D9)")
	assert.InDelta(t, 0.1, d.DamageDealtBonus, 1e-6, "a copy: Derived itself never changes")
}

// D13 floor, L13 bound, D15 floor: the composed factors cannot go degenerate.
func TestDerivedStats_ComposedFactorsAreBounded(t *testing.T) {
	assert.InDelta(t, 0.1, DerivedStats{DamageDealtBonus: -2}.DamageFactor(), 1e-6, "damage dealt floors at 0.1")
	assert.InDelta(t, 2, DerivedStats{DamageReductionBonus: -3}.DamageReductionFactor(), 1e-6, "damage taken caps at 2x")
	assert.InDelta(t, 0, DerivedStats{DamageReductionBonus: 3}.DamageReductionFactor(), 1e-6, "and floors at immune")
	assert.InDelta(t, 0, DerivedStats{ThreatBonus: -2}.ThreatFactor(), 1e-6, "threat floors at none")
	assert.InDelta(t, 1.6, DerivedStats{ThreatBonus: 0.6}.ThreatFactor(), 1e-6)
}

// D8: threat is a stat_multiplier stat too, passive and while active.
func TestLoader_ThreatStatFoldsFromAPassiveAndAnActiveAura(t *testing.T) {
	passive, err := loadOneEffect(t, "passive", 1, `{"type":"stat_multiplier","stat":"threat","statBonus":0.5}`)
	require.NoError(t, err)
	aura, err := loadOneEffect(t, "active_aura", 1, `{"type":"stat_multiplier","stat":"threat","statBonus":0.6}`)
	require.NoError(t, err)

	sc := NewSkillComponent(false)
	sc.EquipPassive(0, passive, 1)
	assert.InDelta(t, 0.5, sc.Derived.ThreatBonus, 1e-6)
	sc.EquipAura(0, aura, 1)
	sc.SetActiveAura(0)
	assert.InDelta(t, 1.1, sc.Derived.ThreatBonus, 1e-6)
}

func TestLoader_StatAuraAndInstantStatLoad(t *testing.T) {
	aura, err := loadOneEffect(t, "active_aura", 1,
		`{"type":"stat_aura","stat":"damageReduction","statBonus":0.2,"radius":3,"tickInterval":30,"targetsAllies":true,"targetsSelf":true,"maxTargets":4}`)
	require.NoError(t, err)
	e := aura.Effects[0]
	assert.Equal(t, EffectTypeStatAura, e.Type)
	require.NotNil(t, e.Stat)
	assert.Equal(t, StatDamageReduction, e.Stat.Name)
	assert.True(t, e.Stat.TargetsSelf)

	cd, err := loadOneEffect(t, "cooldown", 1,
		`{"type":"instant_stat","stat":"damageDealt","statBonus":-0.2,"radius":4,"targetsEnemies":true,"statDurationTicks":300}`)
	require.NoError(t, err)
	assert.Equal(t, EffectTypeInstantStat, cd.Effects[0].Type)
	assert.Equal(t, 300, cd.Effects[0].Stat.DurationTicks)
}

func TestLoader_StatOnOthersRefusals(t *testing.T) {
	cases := []struct{ name, category, effect, want string }{
		{"pool is not an on-others stat (D9)", "active_aura",
			`{"type":"stat_aura","stat":"maxHealth","statBonus":0.2,"radius":3,"tickInterval":30,"targetsAllies":true}`, "maxHealth"},
		{"cost is not an on-others stat (D9)", "cooldown",
			`{"type":"instant_stat","stat":"costReduction","statBonus":0.2,"radius":3,"targetsAllies":true,"statDurationTicks":30}`, "costReduction"},
		{"movement is not an on-others stat (D9)", "active_aura",
			`{"type":"stat_aura","stat":"movementSpeed","statBonus":0.2,"radius":3,"tickInterval":30,"targetsAllies":true}`, "movementSpeed"},
		{"the instant form needs its lifetime", "cooldown",
			`{"type":"instant_stat","stat":"damageDealt","statBonus":0.2,"radius":3,"targetsAllies":true}`, "statDurationTicks"},
		{"damage taken caps at 2x (L13)", "active_aura",
			`{"type":"stat_aura","stat":"damageReduction","statBonus":-1.5,"radius":3,"tickInterval":30,"targetsEnemies":true}`, "damageReduction"},
		{"no aura cadence on the instant form", "cooldown",
			`{"type":"instant_stat","stat":"damageDealt","statBonus":0.2,"radius":3,"targetsAllies":true,"statDurationTicks":30,"tickInterval":5}`, "tickInterval"},
		{"stat_aura is an aura", "cooldown",
			`{"type":"stat_aura","stat":"damageDealt","statBonus":0.2,"radius":3,"tickInterval":30,"targetsAllies":true}`, "stat_aura"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := loadOneEffect(t, tc.category, 1, tc.effect)
			require.Error(t, err)
			assert.Contains(t, err.Error(), tc.want)
		})
	}
}

// A slope that crosses zero would leave one level buffing nothing, and the
// sign picks the side, so a zero bonus at ANY level is refused.
func TestLoader_StatOnOthersRefusesAZeroAtAnyLevel(t *testing.T) {
	_, err := loadOneEffect(t, "active_aura", 3,
		`{"type":"stat_aura","stat":"damageDealt","statBonus":0.2,"statBonusPerLevel":-0.1,"radius":3,"tickInterval":30,"targetsAllies":true}`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), fmt.Sprintf("level %d", 3))
}
