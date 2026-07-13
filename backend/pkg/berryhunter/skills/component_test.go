package skills

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var testDef = &SkillDefinition{
	ID:       1,
	Name:     "TestSkill",
	Category: SkillCategoryActiveAura,
	MaxLevel: 5,
}

func TestNewSkillComponent_PlayerState(t *testing.T) {
	sc := NewSkillComponent(true)

	assert.Equal(t, -1, sc.ActiveAuraSlot)
	assert.NotNil(t, sc.Spellbook)
	assert.Empty(t, sc.Spellbook)
	for i := range sc.AuraSlots {
		assert.Nil(t, sc.AuraSlots[i])
	}
	for i := range sc.PassiveSlots {
		assert.Nil(t, sc.PassiveSlots[i])
	}
	for i := range sc.CooldownSlots {
		assert.Nil(t, sc.CooldownSlots[i])
	}
}

func TestNewSkillComponent_MobHasNilSpellbook(t *testing.T) {
	sc := NewSkillComponent(false)

	assert.Nil(t, sc.Spellbook)
}

func TestEquipAura_PopulatesSlot(t *testing.T) {
	sc := NewSkillComponent(true)
	sc.EquipAura(0, testDef, 2)

	require.NotNil(t, sc.AuraSlots[0])
	assert.Equal(t, testDef, sc.AuraSlots[0].Def)
	assert.Equal(t, 2, sc.AuraSlots[0].Level)
}

func TestEffectiveRadius_Level1(t *testing.T) {
	es := &EquippedSkill{
		Def: &SkillDefinition{Effects: []EffectDef{
			{Radius: 1.5, RadiusPerLevel: 0.25},
		}},
		Level: 1,
	}

	assert.Equal(t, float32(1.5), es.EffectiveRadius())
}

func TestEffectiveRadius_ScalesWithLevel(t *testing.T) {
	es := &EquippedSkill{
		Def: &SkillDefinition{Effects: []EffectDef{
			{Radius: 1.5, RadiusPerLevel: 0.25},
		}},
		Level: 3,
	}

	assert.Equal(t, float32(2.0), es.EffectiveRadius())
}

func TestEffectiveRadius_MultiEffectTakesMax(t *testing.T) {
	es := &EquippedSkill{
		Def: &SkillDefinition{Effects: []EffectDef{
			{Radius: 1.0},
			{Radius: 2.5},
		}},
		Level: 1,
	}

	assert.Equal(t, float32(2.5), es.EffectiveRadius())
}

func TestEffectiveRadius_NoEffectsYieldsZero(t *testing.T) {
	es := &EquippedSkill{Def: &SkillDefinition{}, Level: 1}

	assert.Equal(t, float32(0), es.EffectiveRadius())
}

// light_aura is rendering-only: its radius must not size the combat sensor or
// the aura_radius wire (chunk 3 §6.3 — the campfire's big light would
// otherwise become its sensor/heal ring).
func TestEffectiveRadius_ExcludesLightAura(t *testing.T) {
	es := &EquippedSkill{
		Def: &SkillDefinition{Effects: []EffectDef{
			{Type: EffectTypeHealAura, Radius: 1.5},
			{Type: EffectTypeLightAura, Radius: 7.0},
		}},
		Level: 1,
	}

	assert.Equal(t, float32(1.5), es.EffectiveRadius())
}

func TestLightRadius_MaxOverLightEffectsScaled(t *testing.T) {
	es := &EquippedSkill{
		Def: &SkillDefinition{Effects: []EffectDef{
			{Type: EffectTypeHealAura, Radius: 1.5},
			{Type: EffectTypeLightAura, Radius: 4.0, RadiusPerLevel: 1.0},
		}},
		Level: 3,
	}

	assert.Equal(t, float32(6.0), es.LightRadius())
}

func TestLightRadius_NoLightEffectYieldsZero(t *testing.T) {
	es := &EquippedSkill{
		Def: &SkillDefinition{Effects: []EffectDef{
			{Type: EffectTypeDamageAura, Radius: 2.0},
		}},
		Level: 1,
	}

	assert.Equal(t, float32(0), es.LightRadius())
}

func TestUnequipAura_ClearsSlot(t *testing.T) {
	sc := NewSkillComponent(true)
	sc.EquipAura(0, testDef, 1)
	sc.UnequipAura(0)

	assert.Nil(t, sc.AuraSlots[0])
}

func TestUnequipAura_ClearsActiveIfSameSlot(t *testing.T) {
	sc := NewSkillComponent(true)
	sc.EquipAura(0, testDef, 1)
	sc.SetActiveAura(0)
	sc.UnequipAura(0)

	assert.Equal(t, -1, sc.ActiveAuraSlot)
}

func TestUnequipAura_KeepsActiveIfDifferentSlot(t *testing.T) {
	sc := NewSkillComponent(true)
	sc.EquipAura(0, testDef, 1)
	sc.EquipAura(1, testDef, 1)
	sc.SetActiveAura(0)
	sc.UnequipAura(1)

	assert.Equal(t, 0, sc.ActiveAuraSlot)
}

func TestSetActiveAura_ResetsTickAccumulator(t *testing.T) {
	sc := NewSkillComponent(true)
	sc.EquipAura(0, testDef, 1)
	sc.AuraSlots[0].TickAccumulator = 5

	sc.SetActiveAura(0)

	assert.Equal(t, 0, sc.AuraSlots[0].TickAccumulator)
}

func TestSetActiveAura_OutOfRangeIsIgnored(t *testing.T) {
	sc := NewSkillComponent(true)
	sc.SetActiveAura(99)

	assert.Equal(t, -1, sc.ActiveAuraSlot)
}

func TestSpellbook(t *testing.T) {
	t.Run("discover and check", func(t *testing.T) {
		sc := NewSkillComponent(true)
		sc.Discover(SkillID(1))

		assert.True(t, sc.HasDiscovered(SkillID(1)))
		assert.False(t, sc.HasDiscovered(SkillID(2)))
	})

	t.Run("discovered list", func(t *testing.T) {
		sc := NewSkillComponent(true)
		sc.Discover(SkillID(1))
		sc.Discover(SkillID(3))

		ids := sc.Discovered()
		assert.Len(t, ids, 2)
		assert.ElementsMatch(t, []SkillID{1, 3}, ids)
	})

	t.Run("nil spellbook is no-op", func(t *testing.T) {
		sc := NewSkillComponent(false)
		assert.NotPanics(t, func() { sc.Discover(SkillID(1)) })
		assert.False(t, sc.HasDiscovered(SkillID(1)))
		assert.Empty(t, sc.Discovered())
	})
}

func TestSkillLevel(t *testing.T) {
	t.Run("discover grants level 1", func(t *testing.T) {
		sc := NewSkillComponent(true)
		sc.Discover(testDef.ID)

		assert.Equal(t, 1, sc.SkillLevel(testDef.ID))
	})

	t.Run("undiscovered skill is level 0", func(t *testing.T) {
		sc := NewSkillComponent(true)

		assert.Equal(t, 0, sc.SkillLevel(SkillID(99)))
	})

	t.Run("nil spellbook is level 0", func(t *testing.T) {
		sc := NewSkillComponent(false)

		assert.Equal(t, 0, sc.SkillLevel(testDef.ID))
	})

	t.Run("re-discover never downgrades", func(t *testing.T) {
		sc := NewSkillComponent(true)
		sc.Discover(testDef.ID)
		require.True(t, sc.RaiseSkillLevel(testDef))
		require.True(t, sc.RaiseSkillLevel(testDef))

		sc.Discover(testDef.ID)

		assert.Equal(t, 3, sc.SkillLevel(testDef.ID))
	})
}

func TestRaiseSkillLevel(t *testing.T) {
	t.Run("raises by one", func(t *testing.T) {
		sc := NewSkillComponent(true)
		sc.Discover(testDef.ID)

		assert.True(t, sc.RaiseSkillLevel(testDef))
		assert.Equal(t, 2, sc.SkillLevel(testDef.ID))
	})

	t.Run("undiscovered skill fails", func(t *testing.T) {
		sc := NewSkillComponent(true)

		assert.False(t, sc.RaiseSkillLevel(testDef))
		assert.Equal(t, 0, sc.SkillLevel(testDef.ID))
	})

	t.Run("capped at maxLevel", func(t *testing.T) {
		sc := NewSkillComponent(true)
		sc.Discover(testDef.ID)
		for i := 1; i < testDef.MaxLevel; i++ {
			require.True(t, sc.RaiseSkillLevel(testDef))
		}

		assert.False(t, sc.RaiseSkillLevel(testDef))
		assert.Equal(t, testDef.MaxLevel, sc.SkillLevel(testDef.ID))
	})

	t.Run("nil spellbook fails", func(t *testing.T) {
		sc := NewSkillComponent(false)

		assert.False(t, sc.RaiseSkillLevel(testDef))
	})

	t.Run("propagates to all equipped instances", func(t *testing.T) {
		sc := NewSkillComponent(true)
		sc.Discover(testDef.ID)
		sc.EquipAura(0, testDef, 1)
		sc.EquipAura(2, testDef, 1)

		require.True(t, sc.RaiseSkillLevel(testDef))

		assert.Equal(t, 2, sc.AuraSlots[0].Level)
		assert.Equal(t, 2, sc.AuraSlots[2].Level)
	})
}

func TestLowerSkillLevel(t *testing.T) {
	t.Run("lowers by one", func(t *testing.T) {
		sc := NewSkillComponent(true)
		sc.Discover(testDef.ID)
		require.True(t, sc.RaiseSkillLevel(testDef))

		assert.True(t, sc.LowerSkillLevel(testDef))
		assert.Equal(t, 1, sc.SkillLevel(testDef.ID))
	})

	t.Run("floor at level 1", func(t *testing.T) {
		sc := NewSkillComponent(true)
		sc.Discover(testDef.ID)

		assert.False(t, sc.LowerSkillLevel(testDef))
		assert.Equal(t, 1, sc.SkillLevel(testDef.ID))
	})

	t.Run("undiscovered skill fails", func(t *testing.T) {
		sc := NewSkillComponent(true)

		assert.False(t, sc.LowerSkillLevel(testDef))
	})

	t.Run("propagates to equipped instances", func(t *testing.T) {
		sc := NewSkillComponent(true)
		sc.Discover(testDef.ID)
		require.True(t, sc.RaiseSkillLevel(testDef))
		sc.EquipAura(0, testDef, sc.SkillLevel(testDef.ID))

		require.True(t, sc.LowerSkillLevel(testDef))

		assert.Equal(t, 1, sc.AuraSlots[0].Level)
	})
}

func TestSpentPoints(t *testing.T) {
	t.Run("fresh spellbook has spent nothing", func(t *testing.T) {
		sc := NewSkillComponent(true)
		sc.Discover(testDef.ID)

		assert.Equal(t, 0, sc.SpentPoints())
	})

	t.Run("sums level minus one across skills", func(t *testing.T) {
		other := &SkillDefinition{ID: 2, Name: "Other", MaxLevel: 5}
		sc := NewSkillComponent(true)
		sc.Discover(testDef.ID)
		sc.Discover(other.ID)
		require.True(t, sc.RaiseSkillLevel(testDef)) // level 2 = 1 point
		require.True(t, sc.RaiseSkillLevel(testDef)) // level 3 = 2 points
		require.True(t, sc.RaiseSkillLevel(other))   // level 2 = 1 point

		assert.Equal(t, 3, sc.SpentPoints())
	})

	t.Run("nil spellbook has spent nothing", func(t *testing.T) {
		sc := NewSkillComponent(false)

		assert.Equal(t, 0, sc.SpentPoints())
	})
}

func TestTotalSkillPoints(t *testing.T) {
	assert.Equal(t, 0, TotalSkillPoints(1, 1))
	assert.Equal(t, 4, TotalSkillPoints(5, 1))
	assert.Equal(t, 8, TotalSkillPoints(5, 2))
}

var testNova = &SkillDefinition{
	ID:                    20,
	Name:                  "NovaBurst",
	Category:              SkillCategoryCooldown,
	MaxLevel:              3,
	CooldownTicks:         300,
	CooldownTicksPerLevel: -20,
	Effects: []EffectDef{
		{Type: EffectTypeInstantDamage, Radius: 1.5, RadiusPerLevel: 0.1, TargetsEnemies: true, Damage: &DamageParams{HP: 0.15, HPPerLevel: 0.03}},
	},
}

func TestEquipCooldown(t *testing.T) {
	t.Run("populates the slot", func(t *testing.T) {
		sc := NewSkillComponent(true)
		sc.EquipCooldown(1, testNova, 2)

		require.NotNil(t, sc.CooldownSlots[1])
		assert.Equal(t, testNova.ID, sc.CooldownSlots[1].Def.ID)
		assert.Equal(t, 2, sc.CooldownSlots[1].Level)
		assert.Equal(t, 0, sc.CooldownSlots[1].CdTicks, "equips ready to fire")
	})

	t.Run("equipping the same cooldown again moves it", func(t *testing.T) {
		// Two slots of the same cooldown would be two independent charges —
		// the same stacking trap as duplicate passives.
		sc := NewSkillComponent(true)
		sc.EquipCooldown(0, testNova, 1)

		sc.EquipCooldown(1, testNova, 1)

		assert.Nil(t, sc.CooldownSlots[0], "old slot must be cleared")
		require.NotNil(t, sc.CooldownSlots[1])
	})
}

func TestEffectiveCooldownTicks(t *testing.T) {
	t.Run("level 1 uses the base cooldown", func(t *testing.T) {
		es := &EquippedSkill{Def: testNova, Level: 1}
		assert.Equal(t, 300, es.EffectiveCooldownTicks())
	})

	t.Run("scales per level (negative = shorter)", func(t *testing.T) {
		es := &EquippedSkill{Def: testNova, Level: 3}
		assert.Equal(t, 260, es.EffectiveCooldownTicks())
	})

	t.Run("never drops below one tick", func(t *testing.T) {
		fast := &SkillDefinition{CooldownTicks: 10, CooldownTicksPerLevel: -20}
		es := &EquippedSkill{Def: fast, Level: 2}
		assert.Equal(t, 1, es.EffectiveCooldownTicks())
	})
}

func TestBurstRadius(t *testing.T) {
	t.Run("zero without recent burst", func(t *testing.T) {
		sc := NewSkillComponent(true)
		sc.EquipCooldown(0, testNova, 1)

		assert.Equal(t, float32(0), sc.BurstRadius(BurstVFXTicks))
	})

	t.Run("level-scaled radius while within the window", func(t *testing.T) {
		sc := NewSkillComponent(true)
		sc.EquipCooldown(0, testNova, 3)
		es := sc.CooldownSlots[0]
		es.CdTicks = es.EffectiveCooldownTicks() // just fired

		assert.InDelta(t, 1.7, sc.BurstRadius(BurstVFXTicks), 1e-6) // 1.5 + 2×0.1
	})

	t.Run("zero once the window has passed", func(t *testing.T) {
		sc := NewSkillComponent(true)
		sc.EquipCooldown(0, testNova, 1)
		es := sc.CooldownSlots[0]
		es.CdTicks = es.EffectiveCooldownTicks() - BurstVFXTicks

		assert.Equal(t, float32(0), sc.BurstRadius(BurstVFXTicks))
	})

	t.Run("radiusless bursts (self_heal) stay zero", func(t *testing.T) {
		selfHeal := &SkillDefinition{
			ID: 21, Name: "Heal", Category: SkillCategoryCooldown, MaxLevel: 3, CooldownTicks: 900,
			Effects: []EffectDef{{Type: EffectTypeSelfHeal, SelfHeal: &SelfHealParams{HealHP: 0.2}}},
		}
		sc := NewSkillComponent(true)
		sc.EquipCooldown(0, selfHeal, 1)
		sc.CooldownSlots[0].CdTicks = 900 // just fired

		assert.Equal(t, float32(0), sc.BurstRadius(BurstVFXTicks))
	})
}

func TestRequestCooldownActivation(t *testing.T) {
	t.Run("queues valid slot indices", func(t *testing.T) {
		sc := NewSkillComponent(true)
		sc.RequestCooldownActivation(0)
		sc.RequestCooldownActivation(1)

		assert.Equal(t, []int{0, 1}, sc.PendingCooldowns)
	})

	t.Run("ignores out-of-range slots", func(t *testing.T) {
		sc := NewSkillComponent(true)
		sc.RequestCooldownActivation(-1)
		sc.RequestCooldownActivation(MaxCooldownSlots)

		assert.Empty(t, sc.PendingCooldowns)
	})
}

var testSwift = &SkillDefinition{
	ID:       10,
	Name:     "SwiftPassive",
	Category: SkillCategoryPassive,
	MaxLevel: 3,
	Effects: []EffectDef{
		{Type: EffectTypeStatMultiplier, Stat: &StatParams{Name: StatMovementSpeed, Bonus: 0.05, BonusPerLevel: 0.05}},
	},
}

func TestDerivedStats(t *testing.T) {
	t.Run("zero without passives", func(t *testing.T) {
		sc := NewSkillComponent(true)

		assert.Equal(t, float32(0), sc.Derived.MovementSpeedBonus)
		assert.Equal(t, float32(0), sc.Derived.MaxHealthBonus)
	})

	t.Run("equip applies statBonus plus (level-1) times perLevel", func(t *testing.T) {
		sc := NewSkillComponent(true)
		sc.EquipPassive(0, testSwift, 2)

		assert.InDelta(t, 0.10, sc.Derived.MovementSpeedBonus, 1e-6)
	})

	t.Run("base and perLevel scale independently", func(t *testing.T) {
		// Pins the unified convention: NOT perLevel×level (0.06) and NOT
		// base×level (0.30) — base + (L−1)×perLevel.
		frontloaded := &SkillDefinition{
			ID: 13, Name: "Frontloaded", Category: SkillCategoryPassive, MaxLevel: 3,
			Effects: []EffectDef{
				{Type: EffectTypeStatMultiplier, Stat: &StatParams{Name: StatMovementSpeed, Bonus: 0.10, BonusPerLevel: 0.02}},
			},
		}
		sc := NewSkillComponent(true)
		sc.EquipPassive(0, frontloaded, 3)

		assert.InDelta(t, 0.14, sc.Derived.MovementSpeedBonus, 1e-6)
	})

	t.Run("unequip removes the bonus", func(t *testing.T) {
		sc := NewSkillComponent(true)
		sc.EquipPassive(0, testSwift, 2)
		sc.UnequipPassive(0)

		assert.Equal(t, float32(0), sc.Derived.MovementSpeedBonus)
	})

	t.Run("passives stack additively", func(t *testing.T) {
		other := &SkillDefinition{
			ID: 11, Name: "OtherSwift", Category: SkillCategoryPassive, MaxLevel: 3,
			Effects: []EffectDef{
				{Type: EffectTypeStatMultiplier, Stat: &StatParams{Name: StatMovementSpeed, Bonus: 0.02, BonusPerLevel: 0.02}},
			},
		}
		sc := NewSkillComponent(true)
		sc.EquipPassive(0, testSwift, 1)
		sc.EquipPassive(1, other, 1)

		assert.InDelta(t, 0.07, sc.Derived.MovementSpeedBonus, 1e-6)
	})

	t.Run("stats sum independently", func(t *testing.T) {
		tank := &SkillDefinition{
			ID: 12, Name: "TankPassive", Category: SkillCategoryPassive, MaxLevel: 3,
			Effects: []EffectDef{
				{Type: EffectTypeStatMultiplier, Stat: &StatParams{Name: StatMaxHealth, Bonus: 0.1, BonusPerLevel: 0.1}},
			},
		}
		sc := NewSkillComponent(true)
		sc.EquipPassive(0, testSwift, 1)
		sc.EquipPassive(1, tank, 2)

		assert.InDelta(t, 0.05, sc.Derived.MovementSpeedBonus, 1e-6)
		assert.InDelta(t, 0.20, sc.Derived.MaxHealthBonus, 1e-6)
	})

	t.Run("level raise recomputes equipped passive", func(t *testing.T) {
		sc := NewSkillComponent(true)
		sc.Discover(testSwift.ID)
		sc.EquipPassive(0, testSwift, 1)

		require.True(t, sc.RaiseSkillLevel(testSwift))

		assert.Equal(t, 2, sc.PassiveSlots[0].Level)
		assert.InDelta(t, 0.10, sc.Derived.MovementSpeedBonus, 1e-6)
	})

	t.Run("level drop recomputes equipped passive (free respec)", func(t *testing.T) {
		sc := NewSkillComponent(true)
		sc.Discover(testSwift.ID)
		require.True(t, sc.RaiseSkillLevel(testSwift))
		sc.EquipPassive(0, testSwift, 2)

		require.True(t, sc.LowerSkillLevel(testSwift))

		assert.InDelta(t, 0.05, sc.Derived.MovementSpeedBonus, 1e-6)
	})

	t.Run("equipping the same passive again moves it, never duplicates", func(t *testing.T) {
		// The same buff in two slots would stack (0.05 + 0.05); equipping a
		// passive already present elsewhere must clear the old slot instead.
		sc := NewSkillComponent(true)
		sc.EquipPassive(0, testSwift, 1)

		sc.EquipPassive(2, testSwift, 1)

		assert.Nil(t, sc.PassiveSlots[0], "old slot must be cleared")
		require.NotNil(t, sc.PassiveSlots[2])
		assert.InDelta(t, 0.05, sc.Derived.MovementSpeedBonus, 1e-6, "bonus must count once")
	})

	t.Run("re-equipping into the same slot is a plain overwrite", func(t *testing.T) {
		sc := NewSkillComponent(true)
		sc.EquipPassive(1, testSwift, 1)

		sc.EquipPassive(1, testSwift, 2)

		require.NotNil(t, sc.PassiveSlots[1])
		assert.Equal(t, 2, sc.PassiveSlots[1].Level)
		assert.InDelta(t, 0.10, sc.Derived.MovementSpeedBonus, 1e-6)
	})

	t.Run("non-passive-slot skills do not contribute", func(t *testing.T) {
		// A stat effect on an aura-slotted skill must not leak into DerivedStats:
		// only PassiveSlots are read (passives run in parallel, auras don't).
		sc := NewSkillComponent(true)
		sc.EquipAura(0, testSwift, 1)

		assert.Equal(t, float32(0), sc.Derived.MovementSpeedBonus)
	})
}

// --- resist passives → Derived.Resistances (item 11 Phase 2 Step 3) ---

func TestDerivedStats_Resistances(t *testing.T) {
	fireSkin := &SkillDefinition{
		ID: 41, Name: "FireSkin", Category: SkillCategoryPassive, MaxLevel: 3,
		Effects: []EffectDef{
			{Type: EffectTypeResistPassive, Resist: &ResistParams{Tags: []string{"fire"}, Factor: 0.8, FactorPerLevel: -0.1}},
		},
	}

	t.Run("nil without resist passives", func(t *testing.T) {
		sc := NewSkillComponent(true)
		sc.EquipPassive(0, testSwift, 1)
		assert.Nil(t, sc.Derived.Resistances)
	})

	t.Run("equip grants the level-scaled factor", func(t *testing.T) {
		sc := NewSkillComponent(true)
		sc.EquipPassive(0, fireSkin, 2) // 0.8 + 1×(-0.1) = 0.7

		assert.InDelta(t, 0.7, sc.Derived.Resistances["fire"], 1e-6)
	})

	t.Run("distinct passives stack multiplicatively per tag", func(t *testing.T) {
		emberSkin := &SkillDefinition{
			ID: 42, Name: "EmberSkin", Category: SkillCategoryPassive, MaxLevel: 3,
			Effects: []EffectDef{
				{Type: EffectTypeResistPassive, Resist: &ResistParams{Tags: []string{"fire"}, Factor: 0.5}},
			},
		}
		sc := NewSkillComponent(true)
		sc.EquipPassive(0, fireSkin, 1) // 0.8
		sc.EquipPassive(1, emberSkin, 1)

		assert.InDelta(t, 0.4, sc.Derived.Resistances["fire"], 1e-6)
	})

	t.Run("unequip removes the resistance", func(t *testing.T) {
		sc := NewSkillComponent(true)
		sc.EquipPassive(0, fireSkin, 1)
		sc.UnequipPassive(0)

		assert.Nil(t, sc.Derived.Resistances)
	})

	t.Run("factor floors at zero", func(t *testing.T) {
		sc := NewSkillComponent(true)
		sc.EquipPassive(0, fireSkin, 3+7) // over-leveled on purpose: 0.8 − 9×0.1 < 0 → clamp 0

		assert.InDelta(t, 0.0, sc.Derived.Resistances["fire"], 1e-6)
	})
}

func TestRaiseLoadoutLevels(t *testing.T) {
	// Spawn-site consumer (mob-depth chunk 1): a summon's whole loadout follows
	// the summon skill's level — clamped per skill, never lowering an authored
	// higher level, and re-deriving passive stats.
	aura := &SkillDefinition{ID: 1, Name: "A", Category: SkillCategoryActiveAura, MaxLevel: 3}
	authoredHigh := &SkillDefinition{ID: 4, Name: "H", Category: SkillCategoryActiveAura, MaxLevel: 5}
	passive := &SkillDefinition{ID: 2, Name: "P", Category: SkillCategoryPassive, MaxLevel: 5,
		Effects: []EffectDef{{Type: EffectTypeStatMultiplier, Stat: &StatParams{Name: StatMovementSpeed, Bonus: 0.1, BonusPerLevel: 0.1}}}}
	cooldown := &SkillDefinition{ID: 3, Name: "C", Category: SkillCategoryCooldown, MaxLevel: 2}

	sc := NewSkillComponent(false)
	sc.EquipAura(0, aura, 1)
	sc.EquipAura(1, authoredHigh, 5)
	sc.EquipPassive(0, passive, 1)
	sc.EquipCooldown(0, cooldown, 1)

	sc.RaiseLoadoutLevels(4)

	assert.Equal(t, 3, sc.AuraSlots[0].Level, "clamped to the skill's own MaxLevel")
	assert.Equal(t, 5, sc.AuraSlots[1].Level, "an authored higher level is never lowered")
	assert.Equal(t, 4, sc.PassiveSlots[0].Level)
	assert.InDelta(t, 0.4, sc.Derived.MovementSpeedBonus, 1e-6, "raising a passive re-derives stats")
	assert.Equal(t, 2, sc.CooldownSlots[0].Level, "cooldowns clamp too")
}

// --- cast-time primitive (plan-skill-vocab chunk 4) ---

func castDef(interruptedByDamage bool) *SkillDefinition {
	return &SkillDefinition{
		ID: 28, Name: "Recall", Category: SkillCategoryCooldown, MaxLevel: 1,
		CooldownTicks:           9000,
		CastTicks:               300,
		CastTicksPerLevel:       -30,
		CastInterruptedByDamage: interruptedByDamage,
	}
}

func TestEffectiveCastTicks_LevelScaled(t *testing.T) {
	es := &EquippedSkill{Def: castDef(true), Level: 1}
	assert.Equal(t, 300, es.EffectiveCastTicks())

	es.Level = 3
	assert.Equal(t, 240, es.EffectiveCastTicks(), "300 − 2×30")
}

func TestEffectiveCastTicks_FlooredAtZero(t *testing.T) {
	// 0 = instant is the default for every existing skill; heavy negative
	// per-level scaling must not go below it.
	es := &EquippedSkill{Def: castDef(true), Level: 20}
	assert.Equal(t, 0, es.EffectiveCastTicks())

	instant := &EquippedSkill{Def: testDef, Level: 1}
	assert.Equal(t, 0, instant.EffectiveCastTicks(), "no castTicks authored → instant")
}

func TestNewSkillComponent_NotCasting(t *testing.T) {
	sc := NewSkillComponent(true)

	assert.False(t, sc.IsCasting())
	assert.Equal(t, -1, sc.CastingSlot)
}

func TestStartCast_SetsSlotAndTicks(t *testing.T) {
	sc := NewSkillComponent(true)
	sc.EquipCooldown(1, castDef(true), 1)

	sc.StartCast(1)

	assert.True(t, sc.IsCasting())
	assert.Equal(t, 1, sc.CastingSlot)
	assert.Equal(t, 300, sc.CastTicksLeft)
}

func TestStartCast_InvalidOrEmptySlotIgnored(t *testing.T) {
	sc := NewSkillComponent(true)

	sc.StartCast(-1)
	assert.False(t, sc.IsCasting())
	sc.StartCast(MaxCooldownSlots)
	assert.False(t, sc.IsCasting())
	sc.StartCast(0) // equipped nothing
	assert.False(t, sc.IsCasting())
}

func TestCancelCast_ClearsState(t *testing.T) {
	sc := NewSkillComponent(true)
	sc.EquipCooldown(0, castDef(true), 1)
	sc.StartCast(0)

	sc.CancelCast()

	assert.False(t, sc.IsCasting())
	assert.Equal(t, -1, sc.CastingSlot)
	assert.Equal(t, 0, sc.CastTicksLeft)
}

func TestCastingSkill_ReturnsCastingSlotSkill(t *testing.T) {
	sc := NewSkillComponent(true)
	assert.Nil(t, sc.CastingSkill(), "idle → nil")

	sc.EquipCooldown(0, castDef(true), 1)
	sc.StartCast(0)
	require.NotNil(t, sc.CastingSkill())
	assert.Equal(t, SkillID(28), sc.CastingSkill().Def.ID)
}

func TestCancelCastOnDamage_FlaggedSkillCancels(t *testing.T) {
	sc := NewSkillComponent(true)
	sc.EquipCooldown(0, castDef(true), 1)
	sc.StartCast(0)

	sc.CancelCastOnDamage()

	assert.False(t, sc.IsCasting(), "castInterruptedByDamage → damage cancels")
}

func TestCancelCastOnDamage_UnflaggedSkillKeepsCasting(t *testing.T) {
	// Damage-interrupt is opt-in (chunk-4 start decision 2026-07-14): casts
	// are combat vocabulary; only skills like Recall break on damage.
	sc := NewSkillComponent(true)
	sc.EquipCooldown(0, castDef(false), 1)
	sc.StartCast(0)

	sc.CancelCastOnDamage()

	assert.True(t, sc.IsCasting(), "unflagged cast survives damage")
	assert.Equal(t, 300, sc.CastTicksLeft)
}
