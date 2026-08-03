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

// --- component-level light fold (content pass C2 lift 2: passive light) ---

var lightAuraDef = &SkillDefinition{
	ID:       90,
	Name:     "TestLight",
	Category: SkillCategoryActiveAura,
	MaxLevel: 3,
	Effects:  []EffectDef{{Type: EffectTypeLightAura, Radius: 4.0, RadiusPerLevel: 1.0}},
}

var lightPassiveDef = &SkillDefinition{
	ID:       91,
	Name:     "TestTorch",
	Category: SkillCategoryPassive,
	MaxLevel: 3,
	Effects:  []EffectDef{{Type: EffectTypeLightAura, Radius: 2.5, RadiusPerLevel: 0.5}},
}

var statPassiveDef = &SkillDefinition{
	ID:       92,
	Name:     "TestStatPassive",
	Category: SkillCategoryPassive,
	MaxLevel: 3,
	Effects:  []EffectDef{{Type: EffectTypeStatMultiplier, Stat: &StatParams{Name: "movementSpeed", Bonus: 0.1}}},
}

func TestComponentLightRadius_NothingEquippedYieldsZero(t *testing.T) {
	sc := NewSkillComponent(true)

	assert.Equal(t, float32(0), sc.LightRadius())
}

func TestComponentLightRadius_ActiveAuraOnly(t *testing.T) {
	sc := NewSkillComponent(true)
	sc.EquipAura(0, lightAuraDef, 1)
	sc.SetActiveAura(0)

	assert.Equal(t, float32(4.0), sc.LightRadius())
}

// An equipped but INACTIVE light aura emits nothing — only the active aura
// slot counts (unchanged pre-lift behavior).
func TestComponentLightRadius_InactiveAuraEmitsNothing(t *testing.T) {
	sc := NewSkillComponent(true)
	sc.EquipAura(0, lightAuraDef, 1)

	assert.Equal(t, float32(0), sc.LightRadius())
}

// The lift itself: a light passive emits from its slot with no active aura —
// this is what makes Torch work while a damage aura is active.
func TestComponentLightRadius_PassiveOnly(t *testing.T) {
	sc := NewSkillComponent(true)
	sc.EquipPassive(0, lightPassiveDef, 2)

	assert.Equal(t, float32(3.0), sc.LightRadius())
}

// Active light aura + light passive fold as MAX, not sum.
func TestComponentLightRadius_ActiveAndPassiveTakeMax(t *testing.T) {
	sc := NewSkillComponent(true)
	sc.EquipAura(0, lightAuraDef, 1) // 4.0
	sc.SetActiveAura(0)
	sc.EquipPassive(0, lightPassiveDef, 3) // 3.5

	assert.Equal(t, float32(4.0), sc.LightRadius())

	sc.EquipAura(0, lightAuraDef, 1)
	sc.EquipPassive(0, lightPassiveDef, 3)
	sc.SetActiveAura(-1)
	assert.Equal(t, float32(3.5), sc.LightRadius(), "passive wins when no active aura light")
}

// Switching the active aura away from Light keeps the passive glow — the
// GDD §7 trade-off resolution.
func TestComponentLightRadius_PassivePersistsAcrossAuraSwitch(t *testing.T) {
	sc := NewSkillComponent(true)
	sc.EquipAura(0, lightAuraDef, 3)                          // 6.0
	sc.EquipAura(1, &SkillDefinition{ID: 93, MaxLevel: 1}, 1) // no light
	sc.EquipPassive(1, lightPassiveDef, 1)                    // 2.5
	sc.SetActiveAura(0)
	assert.Equal(t, float32(6.0), sc.LightRadius())

	sc.SetActiveAura(1)
	assert.Equal(t, float32(2.5), sc.LightRadius())
}

func TestComponentLightRadius_NonLightPassiveYieldsZero(t *testing.T) {
	sc := NewSkillComponent(true)
	sc.EquipPassive(0, statPassiveDef, 1)

	assert.Equal(t, float32(0), sc.LightRadius())
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

// defRegistry is a Registry over a handful of definitions — the minimum
// SpentPoints needs now that the point cost is cap-relative (L1).
type defRegistry map[SkillID]*SkillDefinition

func (r defRegistry) Get(id SkillID) (*SkillDefinition, error) {
	if def, ok := r[id]; ok {
		return def, nil
	}
	return nil, assert.AnError
}
func (r defRegistry) GetByName(string) (*SkillDefinition, error) { return nil, assert.AnError }
func (r defRegistry) All() []*SkillDefinition                    { return nil }

// The D10 table, straight from the plan doc: the first half of a skill's own
// levels cost 1 point, the third quarter 2, the last quarter 3.
func TestPointCost_EscalatesRelativeToTheSkillsOwnCap(t *testing.T) {
	t.Run("cap 10 — the build-defining core auras (D11)", func(t *testing.T) {
		for level, want := range map[int]int{1: 0, 2: 1, 3: 1, 4: 1, 5: 1, 6: 2, 7: 2, 8: 2, 9: 3, 10: 3} {
			assert.Equal(t, want, PointCost(10, level), "level %d", level)
		}
		assert.Equal(t, 16, BoundPoints(10, 10), "16 points to max a 10-cap skill")
	})

	t.Run("cap 5 — the supporting skills, quarters rounded up", func(t *testing.T) {
		for level, want := range map[int]int{1: 0, 2: 1, 3: 1, 4: 2, 5: 3} {
			assert.Equal(t, want, PointCost(5, level), "level %d", level)
		}
		assert.Equal(t, 7, BoundPoints(5, 5), "7 points to max a 5-cap skill")
	})

	t.Run("cap 1 — binary abilities cost nothing at all", func(t *testing.T) {
		assert.Equal(t, 0, PointCost(1, 1))
		assert.Equal(t, 0, BoundPoints(1, 1))
	})

	t.Run("level 1 is free on unlock, and past the cap is unbuyable", func(t *testing.T) {
		// The free first level is load-bearing for the free floor (D6): every
		// discovered skill is usable before any investment.
		assert.Equal(t, 0, PointCost(10, 1))
		assert.Equal(t, 0, PointCost(10, 11))
	})

	t.Run("the same level costs differently under a different cap", func(t *testing.T) {
		// This is the whole point of a cap-relative curve (D2/D10): §37 moving
		// a cap re-prices the skill instead of needing a new table.
		assert.Equal(t, 1, PointCost(10, 5), "mid-run of a 10-cap skill")
		assert.Equal(t, 3, PointCost(5, 5), "the last level of a 5-cap one")
	})
}

func TestSpentPoints(t *testing.T) {
	other := &SkillDefinition{ID: 2, Name: "Other", MaxLevel: 5}
	defs := defRegistry{testDef.ID: testDef, other.ID: other}

	t.Run("fresh spellbook has spent nothing", func(t *testing.T) {
		sc := NewSkillComponent(true)
		sc.Discover(testDef.ID)

		assert.Equal(t, 0, sc.SpentPoints(defs))
	})

	t.Run("sums the cap-relative cost across skills", func(t *testing.T) {
		sc := NewSkillComponent(true)
		sc.Discover(testDef.ID)
		sc.Discover(other.ID)
		require.True(t, sc.RaiseSkillLevel(testDef)) // to L2 = 1 point
		require.True(t, sc.RaiseSkillLevel(testDef)) // to L3 = 1 point
		require.True(t, sc.RaiseSkillLevel(testDef)) // to L4 = 2 points
		require.True(t, sc.RaiseSkillLevel(other))   // to L2 = 1 point

		assert.Equal(t, 5, sc.SpentPoints(defs))
	})

	t.Run("nil spellbook has spent nothing", func(t *testing.T) {
		sc := NewSkillComponent(false)

		assert.Equal(t, 0, sc.SpentPoints(defs))
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
		assert.Equal(t, 0, sc.SlotCooldownRemaining(1), "equips ready to fire")
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

// A cooldown belongs to the skill, not to the slot: the counter must survive
// every way a slot can be emptied, or re-slotting resets it (the exploit).
func TestCooldownMemory(t *testing.T) {
	t.Run("survives moving the skill to another slot", func(t *testing.T) {
		sc := NewSkillComponent(true)
		sc.EquipCooldown(0, testNova, 1)
		sc.StartCooldown(sc.CooldownSlots[0])

		sc.EquipCooldown(2, testNova, 1)

		assert.Equal(t, 300, sc.SlotCooldownRemaining(2),
			"re-slotting must not mint a ready copy")
		assert.Equal(t, 0, sc.SlotCooldownRemaining(0), "the old slot is empty")
	})

	t.Run("keeps ticking while the skill is unslotted", func(t *testing.T) {
		sc := NewSkillComponent(true)
		sc.EquipCooldown(0, testNova, 1)
		sc.StartCooldown(sc.CooldownSlots[0])
		sc.CooldownSlots[0] = nil // pushed out of the loadout

		for i := 0; i < 10; i++ {
			sc.TickCooldowns()
		}

		assert.Equal(t, 290, sc.CooldownRemaining(testNova.ID),
			"parking a skill must not freeze its recovery")
	})

	t.Run("clears at zero", func(t *testing.T) {
		sc := NewSkillComponent(true)
		sc.SetCooldownRemaining(testNova.ID, 2)

		sc.TickCooldowns()
		assert.Equal(t, 1, sc.CooldownRemaining(testNova.ID))
		sc.TickCooldowns()
		assert.Equal(t, 0, sc.CooldownRemaining(testNova.ID), "ready again")
	})

	t.Run("undiscovered and unslotted skills read ready", func(t *testing.T) {
		sc := NewSkillComponent(true)
		assert.Equal(t, 0, sc.CooldownRemaining(testNova.ID))
		assert.Equal(t, 0, sc.SlotCooldownRemaining(0), "empty slot")
		assert.Equal(t, 0, sc.SlotCooldownRemaining(99), "out of range")
	})

	t.Run("ticking allocates nothing on an idle component", func(t *testing.T) {
		// processCooldowns calls this every tick for every entity in the world.
		sc := NewSkillComponent(false)
		assert.Zero(t, testing.AllocsPerRun(100, sc.TickCooldowns))
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
		sc.StartCooldown(es) // just fired

		assert.InDelta(t, 1.7, sc.BurstRadius(BurstVFXTicks), 1e-6) // 1.5 + 2×0.1
	})

	t.Run("zero once the window has passed", func(t *testing.T) {
		sc := NewSkillComponent(true)
		sc.EquipCooldown(0, testNova, 1)
		es := sc.CooldownSlots[0]
		sc.SetCooldownRemaining(es.Def.ID, es.EffectiveCooldownTicks()-BurstVFXTicks)

		assert.Equal(t, float32(0), sc.BurstRadius(BurstVFXTicks))
	})

	t.Run("instant_dot burst (Ignite) reports its radius", func(t *testing.T) {
		ignite := &SkillDefinition{
			ID: 22, Name: "Ignite", Category: SkillCategoryCooldown, MaxLevel: 3, CooldownTicks: 300,
			Effects: []EffectDef{{
				Type: EffectTypeInstantDot, Radius: 1.5, RadiusPerLevel: 0.1, TargetsEnemies: true,
				Dot: &DotParams{HP: 6, HPPerLevel: 1.5, TickCount: 3, Interval: 30},
			}},
		}
		sc := NewSkillComponent(true)
		sc.EquipCooldown(0, ignite, 3)
		es := sc.CooldownSlots[0]
		sc.StartCooldown(es) // just fired

		assert.InDelta(t, 1.7, sc.BurstRadius(BurstVFXTicks), 1e-6) // 1.5 + 2×0.1
	})

	t.Run("radiusless bursts (self_heal) stay zero", func(t *testing.T) {
		selfHeal := &SkillDefinition{
			ID: 21, Name: "FirstAid", Category: SkillCategoryCooldown, MaxLevel: 3, CooldownTicks: 900,
			Effects: []EffectDef{{Type: EffectTypeSelfHeal, SelfHeal: &SelfHealParams{HealHP: 0.2}}},
		}
		sc := NewSkillComponent(true)
		sc.EquipCooldown(0, selfHeal, 1)
		sc.SetCooldownRemaining(selfHeal.ID, 900) // just fired

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
	Name:     "Swift",
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

	t.Run("critChance accumulates into CritChanceBonus", func(t *testing.T) {
		// Backlog §23: crit as a stackable player stat — the derived bonus
		// is additive chance on every outgoing direct hit (rollHitDamage).
		keen := &SkillDefinition{
			ID: 14, Name: "KeenPassive", Category: SkillCategoryPassive, MaxLevel: 3,
			Effects: []EffectDef{
				{Type: EffectTypeStatMultiplier, Stat: &StatParams{Name: StatCritChance, Bonus: 0.05, BonusPerLevel: 0.05}},
			},
		}
		sc := NewSkillComponent(true)
		sc.EquipPassive(0, keen, 2)

		assert.InDelta(t, 0.10, sc.Derived.CritChanceBonus, 1e-6)
	})

	t.Run("damageDealt accumulates into DamageDealtBonus", func(t *testing.T) {
		// Strong (triage 2026-07-21): all outgoing damage × (1 + bonus),
		// applied at the base-composition sites in sys.
		strong := &SkillDefinition{
			ID: 15, Name: "StrongPassive", Category: SkillCategoryPassive, MaxLevel: 5,
			Effects: []EffectDef{
				{Type: EffectTypeStatMultiplier, Stat: &StatParams{Name: StatDamageDealt, Bonus: 0.04, BonusPerLevel: 0.02}},
			},
		}
		sc := NewSkillComponent(true)
		sc.EquipPassive(0, strong, 3)

		assert.InDelta(t, 0.08, sc.Derived.DamageDealtBonus, 1e-6)
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

// AuraCategories is the ring-colour bitmask serialized to both Character and
// Mob (triage item 7): the ACTIVE aura only, 0 while none is active.
func TestAuraCategories_ActiveAuraOnly(t *testing.T) {
	sc := NewSkillComponent(true)
	damage := &SkillDefinition{
		ID: 900, Name: "TestDamage", Category: SkillCategoryActiveAura, MaxLevel: 5,
		Effects: []EffectDef{{Type: EffectTypeDamageAura}},
	}
	heal := &SkillDefinition{
		ID: 901, Name: "TestHeal", Category: SkillCategoryActiveAura, MaxLevel: 5,
		Effects: []EffectDef{{Type: EffectTypeHealAura}},
	}

	sc.EquipAura(0, damage, 1)
	sc.EquipAura(1, heal, 1)
	assert.Equal(t, AuraCategoryNone, sc.AuraCategories(),
		"equipped but nothing activated → no ring")

	sc.ActiveAuraSlot = 0
	assert.Equal(t, AuraCategoryDamage, sc.AuraCategories())

	// Switching the active slot re-colours the ring — the loadout is a
	// one-active-aura design, so the other equipped aura must not leak in.
	sc.ActiveAuraSlot = 1
	assert.Equal(t, AuraCategoryHeal, sc.AuraCategories())

	sc.ActiveAuraSlot = -1
	assert.Equal(t, AuraCategoryNone, sc.AuraCategories())
}

// --- baseline utility casting (plan-downtime.md C1) --------------------------

func TestStartUtilityCast_SetsKindAndTicks(t *testing.T) {
	sc := NewSkillComponent(true)

	sc.StartUtilityCast(UtilityRecall)

	assert.True(t, sc.IsCasting())
	assert.Equal(t, UtilityRecall, sc.CastingUtility)
	assert.Equal(t, 300, sc.CastTicksLeft)
	assert.Nil(t, sc.CastingSkill(), "a utility cast occupies no cooldown slot")
}

func TestStartUtilityCast_UnknownKindIgnored(t *testing.T) {
	sc := NewSkillComponent(true)

	sc.StartUtilityCast(UtilityNone)
	assert.False(t, sc.IsCasting())
	sc.StartUtilityCast(UtilityKind(200)) // client-supplied garbage
	assert.False(t, sc.IsCasting())
}

func TestCancelCast_ClearsAUtilityCast(t *testing.T) {
	sc := NewSkillComponent(true)
	sc.StartUtilityCast(UtilityRecall)

	sc.CancelCast()

	assert.False(t, sc.IsCasting())
	assert.Equal(t, UtilityNone, sc.CastingUtility)
	assert.Equal(t, 0, sc.CastTicksLeft)
}

// One cast at a time is the standing rule; the two casting states must not
// coexist or the wire would have to pick one and the other would fire blind.
func TestStartUtilityCast_CancelsARunningSlotCast(t *testing.T) {
	sc := NewSkillComponent(true)
	sc.EquipCooldown(0, castDef(true), 1)
	sc.StartCast(0)
	require.True(t, sc.IsCasting())

	sc.StartUtilityCast(UtilityRecall)

	assert.Equal(t, -1, sc.CastingSlot, "the slot cast is gone")
	assert.Equal(t, UtilityRecall, sc.CastingUtility)
	assert.Equal(t, 300, sc.CastTicksLeft, "ticks are the utility's, not a leftover")
}

func TestStartCast_CancelsARunningUtilityCast(t *testing.T) {
	sc := NewSkillComponent(true)
	sc.EquipCooldown(0, castDef(true), 1)
	sc.StartUtilityCast(UtilityRecall)
	require.True(t, sc.IsCasting())

	sc.StartCast(0)

	assert.Equal(t, UtilityNone, sc.CastingUtility, "the utility cast is gone")
	assert.Equal(t, 0, sc.CastingSlot)
}

// Recall opts into the damage interrupt (plan-downtime.md D7: the 10 s
// interruptible cast is the ONLY brake on a free, cooldown-less Recall).
func TestCancelCastOnDamage_UtilityRecallIsInterrupted(t *testing.T) {
	sc := NewSkillComponent(true)
	sc.StartUtilityCast(UtilityRecall)

	sc.CancelCastOnDamage()

	assert.False(t, sc.IsCasting())
	assert.Equal(t, UtilityNone, sc.CastingUtility)
}

func TestRequestUtilityCast_QueuesOnlyKnownKinds(t *testing.T) {
	sc := NewSkillComponent(true)

	sc.RequestUtilityCast(UtilityRecall)
	sc.RequestUtilityCast(UtilityKind(200)) // dropped, client-supplied
	sc.RequestUtilityCast(UtilityNone)      // dropped

	assert.Equal(t, []UtilityKind{UtilityRecall}, sc.PendingUtilities)
}
