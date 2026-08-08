package skills

// The retaliate_slow effect (docs/archive/plan-cc-and-retaliation.md C2): the first
// passive in the game with a RUNTIME TRIGGER rather than an equip-time scalar
// fold. Everything else `recomputeDerived` handles is a pure number —
// stat_multiplier and resist_passive — and the shape of this one is different:
// it folds a *payload* (how hard, how long, and from which skill) that a
// damage-path site fires later.
//
// ⚑ Modelled on lifesteal_burst, NOT on slow_aura: it projects nothing and
// targets nobody, it changes what happens when the wearer is hit. That is why
// it authors its duration outright — slow_aura derives the buff lifetime from
// `tickInterval + 1`, and a passive has no cadence to derive from.

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRetaliateSlow_ParsesItsPayload(t *testing.T) {
	def := mustParse(t, []byte(`{
	  "id": 200, "name": "FrostShield", "category": "passive", "maxLevel": 5,
	  "effects": [{
	    "type": "retaliate_slow",
	    "slowFraction": 0.1, "slowFractionPerLevel": 0.05,
	    "slowDurationTicks": 150, "slowDurationTicksPerLevel": 0
	  }]
	}`))
	require.Len(t, def.Effects, 1)

	e := def.Effects[0]
	require.Equal(t, EffectTypeRetaliateSlow, e.Type)
	require.NotNil(t, e.Retaliate)

	// The slow_aura key names and its FractionAt scaling — base + (L−1)×perLevel.
	assert.InDelta(t, 0.1, e.Retaliate.FractionAt(1), 1e-6)
	assert.InDelta(t, 0.3, e.Retaliate.FractionAt(5), 1e-6)
	assert.Equal(t, 150, e.Retaliate.TicksAt(1))
	assert.Equal(t, 150, e.Retaliate.TicksAt(5), "a flat duration does not move with level")
}

// L6: each effect type carries its own field allowlist, enforced at load. A key
// that is not in effectKeys is a boot error — the good failure, and the reason
// the allowlist entry cannot be forgotten. A passive has no circle, so the
// geometry/cadence/targeting keys are exactly what must NOT be accepted here.
func TestRetaliateSlow_RejectsGeometryAndCadence(t *testing.T) {
	for _, key := range []string{`"radius": 2`, `"tickInterval": 30`, `"targetsEnemies": true`} {
		raw, err := parseSkillDefinition([]byte(`{
		  "id": 200, "name": "FrostShield", "category": "passive", "maxLevel": 5,
		  "effects": [{"type": "retaliate_slow", "slowFraction": 0.1,
		    "slowDurationTicks": 150, `+key+`}]
		}`))
		if err == nil {
			_, err = raw.mapToSkillDefinition(nil)
		}
		require.Error(t, err, "authored %s", key)
	}
}

// L7: costFractionOfMax is valid on every effect type and is checked OUTSIDE
// effectKeys, so the allowlist cannot refuse it — this records the intent
// instead. Charging the victim of a hit for retaliating is not a mechanic
// anyone asked for, and a passive has no trigger of its own to charge.
func TestRetaliateSlow_AuthorsNoCost(t *testing.T) {
	def := mustParse(t, []byte(`{
	  "id": 200, "name": "FrostShield", "category": "passive", "maxLevel": 5,
	  "effects": [{"type": "retaliate_slow", "slowFraction": 0.1, "slowDurationTicks": 150}]
	}`))
	assert.Zero(t, def.Effects[0].CostFractionOfMax)
	assert.Zero(t, def.Effects[0].CostFractionOfMaxPerLevel)
}

var testFrostShield = &SkillDefinition{
	ID:       200,
	Name:     "FrostShield",
	Category: SkillCategoryPassive,
	MaxLevel: 5,
	Effects: []EffectDef{{
		Type:      EffectTypeRetaliateSlow,
		Retaliate: &RetaliateParams{Fraction: 0.1, FractionPerLevel: 0.05, DurationTicks: 150},
	}},
}

func TestRetaliateSlow_FoldsIntoDerivedStats(t *testing.T) {
	sc := NewSkillComponent(true)
	assert.Zero(t, sc.Derived.RetaliateSlow.Fraction, "nothing equipped: nothing retaliates")

	sc.EquipPassive(0, testFrostShield, 3)

	got := sc.Derived.RetaliateSlow
	assert.InDelta(t, 0.2, got.Fraction, 1e-6, "level 3: 0.1 + 2×0.05")
	assert.Equal(t, 150, got.Ticks)
	assert.Equal(t, SkillID(200), got.Source,
		"the buff store keys a slow by its SOURCE skill — without it the stream is SkillID(0)")
}

// Slows never stack, strongest wins (buffs.go). Two retaliate passives would
// resolve to one applied slow anyway, so the fold picks a winner up front —
// and it picks WHOLESALE, so the fraction, its duration and its source can
// never come from different skills.
func TestRetaliateSlow_StrongestPassiveWinsWholesale(t *testing.T) {
	weakLong := &SkillDefinition{
		ID: 201, Name: "WeakLong", Category: SkillCategoryPassive, MaxLevel: 1,
		Effects: []EffectDef{{
			Type:      EffectTypeRetaliateSlow,
			Retaliate: &RetaliateParams{Fraction: 0.05, DurationTicks: 900},
		}},
	}

	sc := NewSkillComponent(true)
	sc.EquipPassive(0, weakLong, 1)
	sc.EquipPassive(1, testFrostShield, 1) // 0.10 for 150

	got := sc.Derived.RetaliateSlow
	assert.InDelta(t, 0.1, got.Fraction, 1e-6, "the stronger fraction wins")
	assert.Equal(t, 150, got.Ticks, "…and brings ITS OWN duration, not the longer one")
	assert.Equal(t, SkillID(200), got.Source, "…and its own source")
}

// Unequipping must clear it: the fold is rebuilt from scratch every time, which
// is what stops a removed passive from leaving a live trigger behind.
func TestRetaliateSlow_ClearsWhenUnequipped(t *testing.T) {
	sc := NewSkillComponent(true)
	sc.EquipPassive(0, testFrostShield, 5)
	require.NotZero(t, sc.Derived.RetaliateSlow.Fraction)

	sc.UnequipPassive(0)
	assert.Zero(t, sc.Derived.RetaliateSlow.Fraction)
	assert.Zero(t, sc.Derived.RetaliateSlow.Ticks)
	assert.Zero(t, sc.Derived.RetaliateSlow.Source)
}
