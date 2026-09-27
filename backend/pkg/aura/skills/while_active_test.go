package skills

import (
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The while-active self modifier (plan-aura-drawbacks.md C1, D1/D2): a
// stat_multiplier on an ACTIVE AURA folds into DerivedStats while that aura is
// the switched-on one, both signs legal, inside bounds only the aura form has.

func loadOneEffect(t *testing.T, category string, maxLevel int, effect string) (*SkillDefinition, error) {
	t.Helper()
	raw, err := parseSkillDefinition([]byte(fmt.Sprintf(
		`{"id":1,"name":"X","category":%q,"maxLevel":%d,"effects":[%s]}`, category, maxLevel, effect)))
	require.NoError(t, err)
	return raw.mapToSkillDefinition(nil)
}

// The 2026-09-12 file shape (a stat_multiplier on an aura) loads now.
func TestLoader_StatMultiplierOnAnActiveAuraLoads(t *testing.T) {
	def, err := loadOneEffect(t, "active_aura", 1, `{"type":"stat_multiplier","stat":"maxHealth","statBonus":0.1}`)
	require.NoError(t, err)
	require.Len(t, def.Effects, 1)
	assert.Equal(t, EffectTypeStatMultiplier, def.Effects[0].Type)
}

// §3.1 item 5: the active-aura bounds. [PLACEHOLDER] numbers, pinned at the
// edges: -0.9 / +1 for movement and pool (-1 would be a stun or a dead pool
// through the back door), -1 / +1 for the two reduction stats (damage taken and
// cost cap at 2x). The passive form keeps its old rules (A8), so every value
// refused on an aura still loads on a passive.
func TestLoader_ActiveAuraStatBoundsRefuseOutOfRange(t *testing.T) {
	cases := []struct {
		stat  string
		bonus float32
	}{
		{StatMovementSpeed, -0.95},
		{StatMovementSpeed, 1.05},
		{StatMaxHealth, -0.95},
		{StatMaxHealth, 1.05},
		{StatDamageReduction, -1.05},
		{StatDamageReduction, 1.05},
		{StatCostReduction, -1.05},
		{StatCostReduction, 1.05},
	}
	for _, tc := range cases {
		t.Run(fmt.Sprintf("%s %v", tc.stat, tc.bonus), func(t *testing.T) {
			effect := fmt.Sprintf(`{"type":"stat_multiplier","stat":%q,"statBonus":%v}`, tc.stat, tc.bonus)

			_, err := loadOneEffect(t, "active_aura", 1, effect)
			require.Error(t, err)
			assert.Contains(t, err.Error(), tc.stat)
			assert.Contains(t, err.Error(), "level 1")

			_, err = loadOneEffect(t, "passive", 1, effect)
			assert.NoError(t, err, "the passive form keeps its current rules (A8)")
		})
	}
}

// The bound holds at EVERY level, not just level 1: a per-level slope walks a
// legal base out of range by maxLevel.
func TestLoader_ActiveAuraStatBoundIsCheckedAtEveryLevel(t *testing.T) {
	effect := `{"type":"stat_multiplier","stat":"movementSpeed","statBonus":-0.5,"statBonusPerLevel":-0.1}`

	_, err := loadOneEffect(t, "active_aura", 5, effect)
	assert.NoError(t, err, "-0.5 .. -0.9 across five levels is inside the bound")

	_, err = loadOneEffect(t, "active_aura", 6, effect)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "level 6", "the refusal names the first level out of range")
}

// The edges themselves are legal.
func TestLoader_ActiveAuraStatBoundEdgesLoad(t *testing.T) {
	for _, tc := range []struct {
		stat  string
		bonus float32
	}{
		{StatMovementSpeed, -0.9}, {StatMovementSpeed, 1},
		{StatMaxHealth, -0.9}, {StatMaxHealth, 1},
		{StatDamageReduction, -1}, {StatDamageReduction, 1},
		{StatCostReduction, -1}, {StatCostReduction, 1},
	} {
		_, err := loadOneEffect(t, "active_aura", 1,
			fmt.Sprintf(`{"type":"stat_multiplier","stat":%q,"statBonus":%v}`, tc.stat, tc.bonus))
		assert.NoError(t, err, "%s %v", tc.stat, tc.bonus)
	}
}

// damageDealt and critChance stay unbounded on an aura, as the plan wrote it:
// neither has a degenerate value the way a -1 speed or pool does.
func TestLoader_DamageDealtAndCritChanceAreUnboundedOnAnAura(t *testing.T) {
	for _, stat := range []string{StatDamageDealt, StatCritChance} {
		for _, bonus := range []float32{-5, 5} {
			_, err := loadOneEffect(t, "active_aura", 1,
				fmt.Sprintf(`{"type":"stat_multiplier","stat":%q,"statBonus":%v}`, stat, bonus))
			assert.NoError(t, err, "%s %v", stat, bonus)
		}
	}
}

// stat_multiplier stays illegal on a cooldown: nothing folds a cast.
func TestLoader_StatMultiplierOnACooldownIsStillRefused(t *testing.T) {
	_, err := loadOneEffect(t, "cooldown", 1, `{"type":"stat_multiplier","stat":"maxHealth","statBonus":0.1}`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "legal on: active_aura, passive")
}

// §6 / §8 Q4: a resist_aura that targets its own caster with a factor above 1
// (a per-tag self-curse) is still LEGAL. The content census that no shipped
// file authors it lives beside the other content censuses (cmd/aurad).
func TestLoader_SelfTargetedResistAuraAboveOneStillLoads(t *testing.T) {
	_, err := loadOneEffect(t, "active_aura", 1,
		`{"type":"resist_aura","radius":2,"resistTags":["fire"],"resistFactor":1.5,"targetsSelf":true,"tickInterval":30}`)
	assert.NoError(t, err)
}

// --- the fold ---

func drawbackAura(stat string, bonus float32) *SkillDefinition {
	return &SkillDefinition{
		ID: 901, Name: "Drawback", Category: SkillCategoryActiveAura, MaxLevel: 1,
		Effects: []EffectDef{
			{Type: EffectTypeDamageAura, Radius: 2, TickInterval: 30, Damage: &DamageParams{HP: 5}},
			{Type: EffectTypeStatMultiplier, Stat: &StatParams{Name: stat, Bonus: bonus}},
		},
	}
}

func TestFold_OnAtSwitchOnOffAtSwitchOff(t *testing.T) {
	sc := NewSkillComponent(true)
	sc.EquipAura(0, drawbackAura(StatMovementSpeed, -0.3), 1)
	assert.Equal(t, float32(1), sc.Derived.MovementSpeedFactor(), "equipped but inactive: folds nothing (A1)")

	sc.SetActiveAura(0)
	assert.InDelta(t, 0.7, sc.Derived.MovementSpeedFactor(), 1e-6, "on at switch-on")

	sc.SetActiveAura(-1)
	assert.Equal(t, float32(1), sc.Derived.MovementSpeedFactor(), "gone at -1")
}

func TestFold_SwitchingToAnotherAuraDropsTheFirst(t *testing.T) {
	sc := NewSkillComponent(true)
	sc.EquipAura(0, drawbackAura(StatMovementSpeed, -0.3), 1)
	sc.EquipAura(1, &SkillDefinition{ID: 902, Name: "Plain", Category: SkillCategoryActiveAura, MaxLevel: 1}, 1)
	sc.SetActiveAura(0)

	sc.SetActiveAura(1)

	assert.Equal(t, float32(1), sc.Derived.MovementSpeedFactor(), "gone at switch-off to another slot")
}

// Only the ACTIVE slot folds: two drawback auras equipped, one on.
func TestFold_OnlyTheActiveSlotFolds(t *testing.T) {
	sc := NewSkillComponent(true)
	sc.EquipAura(0, drawbackAura(StatMaxHealth, -0.2), 1)
	sc.EquipAura(1, drawbackAura(StatMaxHealth, -0.4), 1)

	sc.SetActiveAura(1)

	assert.InDelta(t, 0.6, sc.Derived.MaxHealthFactor(), 1e-6)
}

// The aura adds to the passives, it does not replace them.
func TestFold_ComposesWithThePassives(t *testing.T) {
	sc := NewSkillComponent(true)
	sc.EquipPassive(0, &SkillDefinition{
		ID: 903, Name: "Swift", Category: SkillCategoryPassive, MaxLevel: 1,
		Effects: []EffectDef{{Type: EffectTypeStatMultiplier, Stat: &StatParams{Name: StatMovementSpeed, Bonus: 0.1}}},
	}, 1)
	sc.EquipAura(0, drawbackAura(StatMovementSpeed, -0.3), 1)

	sc.SetActiveAura(0)

	assert.InDelta(t, 0.8, sc.Derived.MovementSpeedFactor(), 1e-6, "1 + 0.1 - 0.3")
}

// Unequipping the ACTIVE aura resets ActiveAuraSlot to -1, so its fold must go
// with it; replacing the aura in the active slot must fold the new one.
func TestFold_UnequipOrReplaceTheActiveAuraRefolds(t *testing.T) {
	sc := NewSkillComponent(true)
	sc.EquipAura(0, drawbackAura(StatMovementSpeed, -0.3), 1)
	sc.SetActiveAura(0)

	sc.EquipAura(0, drawbackAura(StatMovementSpeed, -0.5), 1)
	assert.InDelta(t, 0.5, sc.Derived.MovementSpeedFactor(), 1e-6, "the replacement folds")

	sc.UnequipAura(0)
	assert.Equal(t, float32(1), sc.Derived.MovementSpeedFactor(), "unequipping the active aura drops the fold")
}

// A level change on the active aura re-folds at the new level.
func TestFold_FollowsTheActiveAurasLevel(t *testing.T) {
	sc := NewSkillComponent(true)
	def := drawbackAura(StatMovementSpeed, -0.2)
	def.MaxLevel = 3
	def.Effects[1].Stat.BonusPerLevel = -0.1
	sc.Discover(def.ID)
	sc.EquipAura(0, def, 1)
	sc.SetActiveAura(0)

	sc.setSkillLevel(def.ID, 3)

	assert.InDelta(t, 0.6, sc.Derived.MovementSpeedFactor(), 1e-6, "-0.2 + 2 × -0.1")
}

// L1: the two floors are gone. A negative damageReduction makes damage taken
// bigger, a negative costReduction makes the cost bigger; the upper clamp at 1
// (fully mitigated, free) stays.
func TestDerivedFactors_NegativeBonusIsLive(t *testing.T) {
	d := DerivedStats{DamageReductionBonus: -0.5, CostReductionBonus: -1}
	assert.InDelta(t, 1.5, d.DamageReductionFactor(), 1e-6)
	assert.InDelta(t, 2.0, d.CostFactor(), 1e-6)

	d = DerivedStats{DamageReductionBonus: 1.5, CostReductionBonus: 1.5}
	assert.Equal(t, float32(0), d.DamageReductionFactor(), "upper clamp stays")
	assert.Equal(t, float32(0), d.CostFactor(), "upper clamp stays")
}
