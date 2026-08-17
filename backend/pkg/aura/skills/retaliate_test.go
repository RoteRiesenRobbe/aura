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
		    "slowDurationTicks": 150, ` + key + `}]
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

// --- retaliate_damage (plan-effect-types.md C2, D3/D4) ---
//
// The retaliate_slow twin: same passive spine, a damage payload instead of a
// CC one. It reuses the DAMAGE vocabulary's authored key names (damageHP /
// damageHPPerLevel / damageTags) for the same reason retaliate_slow reuses
// slow_aura's: one axis, one spelling, wherever content meets it.

func TestRetaliateDamage_ParsesItsPayload(t *testing.T) {
	def := mustParse(t, []byte(`{
	  "id": 201, "name": "FireShield", "category": "passive", "maxLevel": 5,
	  "effects": [{
	    "type": "retaliate_damage",
	    "damageHP": 3, "damageHPPerLevel": 1,
	    "damageTags": ["fire"]
	  }]
	}`))
	require.Len(t, def.Effects, 1)

	e := def.Effects[0]
	require.Equal(t, EffectTypeRetaliateDamage, e.Type)
	require.NotNil(t, e.RetaliateDamage)

	// The damage_aura key names and the shared Scaled rule: base + (L−1)×perLevel.
	assert.InDelta(t, 3, e.RetaliateDamage.DamageAt(1), 1e-6)
	assert.InDelta(t, 7, e.RetaliateDamage.DamageAt(5), 1e-6)
	assert.Equal(t, []string{"fire"}, e.RetaliateDamage.Tags)
}

// The reflect is ordinary damage and enters resistance math like any other, so
// it inherits the no-"matches-nothing"-damage rule: absent damageTags normalize
// to [physical] at parse time, exactly as they do on damage_aura and dot_aura.
func TestRetaliateDamage_AbsentTagsDefaultToPhysical(t *testing.T) {
	def := mustParse(t, []byte(`{
	  "id": 201, "name": "FireShield", "category": "passive", "maxLevel": 5,
	  "effects": [{"type": "retaliate_damage", "damageHP": 3}]
	}`))
	assert.Equal(t, []string{DamageTagPhysical}, def.Effects[0].RetaliateDamage.Tags)
}

// The damage-type vocabulary is CLOSED, so a typo'd tag is a boot error rather
// than a reflect nothing can resist.
func TestRetaliateDamage_RejectsAnUnknownDamageType(t *testing.T) {
	raw, err := parseSkillDefinition([]byte(`{
	  "id": 201, "name": "FireShield", "category": "passive", "maxLevel": 5,
	  "effects": [{"type": "retaliate_damage", "damageHP": 3, "damageTags": ["fyre"]}]
	}`))
	if err == nil {
		_, err = raw.mapToSkillDefinition(nil)
	}
	require.Error(t, err)
}

// A reflect of 0 is a passive that does nothing — the retaliateParams rule.
func TestRetaliateDamage_RejectsAZeroReflect(t *testing.T) {
	raw, err := parseSkillDefinition([]byte(`{
	  "id": 201, "name": "FireShield", "category": "passive", "maxLevel": 5,
	  "effects": [{"type": "retaliate_damage", "damageHP": 0}]
	}`))
	if err == nil {
		_, err = raw.mapToSkillDefinition(nil)
	}
	require.Error(t, err)
}

// The retaliate_slow L6 test, aimed at the twin. Its allowlist is NARROWER than
// keysDamagePayload on purpose: a passive has no circle and no cadence, and the
// vocabulary keys that ride a real hit (gateKey, variance, hitStyle, the
// structure pair) belong to an effect that CHOOSES its targets — the reflect
// only ever answers whoever hit you.
func TestRetaliateDamage_RejectsGeometryCadenceAndHitVocabulary(t *testing.T) {
	for _, key := range []string{
		`"radius": 2`, `"tickInterval": 30`, `"targetsEnemies": true`,
		`"gateKey": "harvest"`, `"variance": 0.1`, `"hitStyle": "fire"`,
		`"targetsStructures": true`, `"critChance": 0.1`,
	} {
		raw, err := parseSkillDefinition([]byte(`{
		  "id": 201, "name": "FireShield", "category": "passive", "maxLevel": 5,
		  "effects": [{"type": "retaliate_damage", "damageHP": 3, ` + key + `}]
		}`))
		if err == nil {
			_, err = raw.mapToSkillDefinition(nil)
		}
		require.Error(t, err, "authored %s", key)
	}
}

// The retaliate_slow L7 intent, unchanged: a passive has no trigger of its own
// to charge, and charging the victim of a hit for hitting back is not a
// mechanic anyone asked for.
func TestRetaliateDamage_AuthorsNoCost(t *testing.T) {
	def := mustParse(t, []byte(`{
	  "id": 201, "name": "FireShield", "category": "passive", "maxLevel": 5,
	  "effects": [{"type": "retaliate_damage", "damageHP": 3}]
	}`))
	assert.Zero(t, def.Effects[0].CostFractionOfMax)
	assert.Zero(t, def.Effects[0].CostFractionOfMaxPerLevel)
}

var testFireShield = &SkillDefinition{
	ID:       201,
	Name:     "FireShield",
	Category: SkillCategoryPassive,
	MaxLevel: 5,
	Effects: []EffectDef{{
		Type:            EffectTypeRetaliateDamage,
		RetaliateDamage: &RetaliateDamageParams{HP: 3, HPPerLevel: 1, Tags: []string{"fire"}},
	}},
}

func TestRetaliateDamage_FoldsIntoDerivedStats(t *testing.T) {
	sc := NewSkillComponent(true)
	assert.Zero(t, sc.Derived.RetaliateDamage.Damage, "nothing equipped: nothing reflects")

	sc.EquipPassive(0, testFireShield, 3)

	got := sc.Derived.RetaliateDamage
	assert.InDelta(t, 5, got.Damage, 1e-6, "level 3: 3 + 2×1")
	assert.Equal(t, []string{"fire"}, got.Tags)
	assert.Equal(t, SkillID(201), got.Source,
		"the trigger site has the attacker and the amount, and no idea which passive granted it")
}

// The RetaliateSlow rule, for the same reason spelled the other way round: two
// reflect passives would both fire, so a fold that took the bigger number but
// the other one's tags would invent a third passive neither author wrote. The
// winner brings its damage, its tags and its source together.
func TestRetaliateDamage_StrongestPassiveWinsWholesale(t *testing.T) {
	weakFrost := &SkillDefinition{
		ID: 202, Name: "WeakFrost", Category: SkillCategoryPassive, MaxLevel: 1,
		Effects: []EffectDef{{
			Type:            EffectTypeRetaliateDamage,
			RetaliateDamage: &RetaliateDamageParams{HP: 1, Tags: []string{"frost"}},
		}},
	}

	sc := NewSkillComponent(true)
	sc.EquipPassive(0, weakFrost, 1)
	sc.EquipPassive(1, testFireShield, 1) // 3 fire

	got := sc.Derived.RetaliateDamage
	assert.InDelta(t, 3, got.Damage, 1e-6, "the bigger reflect wins")
	assert.Equal(t, []string{"fire"}, got.Tags, "…and brings ITS OWN damage type, not the loser's")
	assert.Equal(t, SkillID(201), got.Source, "…and its own source")
}

// The fold is rebuilt from scratch on every equip change, which is what stops a
// removed passive from leaving a live trigger behind.
func TestRetaliateDamage_ClearsWhenUnequipped(t *testing.T) {
	sc := NewSkillComponent(true)
	sc.EquipPassive(0, testFireShield, 5)
	require.NotZero(t, sc.Derived.RetaliateDamage.Damage)

	sc.UnequipPassive(0)
	assert.Zero(t, sc.Derived.RetaliateDamage.Damage)
	assert.Nil(t, sc.Derived.RetaliateDamage.Tags)
	assert.Zero(t, sc.Derived.RetaliateDamage.Source)
}

// --- retaliate_burst (plan-effect-types.md follow-up, PO 2026-08-17) ---
//
// The PERCENTAGE reflect: a cooldown that puts a timed self-buff up, and while
// it is up every hit taken bounces a SHARE of the incoming damage back. The
// lifesteal_burst shape read from the hit side, exactly as retaliate_damage is
// the FrostShield shape read from the damage side.

func TestRetaliateBurst_ParsesItsPayload(t *testing.T) {
	def := mustParse(t, []byte(`{
	  "id": 203, "name": "Retribution", "category": "cooldown", "maxLevel": 5,
	  "cooldownTicks": 900,
	  "effects": [{
	    "type": "retaliate_burst",
	    "costFractionOfMax": 0.02,
	    "reflectFraction": 0.2, "reflectFractionPerLevel": 0.05,
	    "reflectDurationTicks": 300, "reflectDurationTicksPerLevel": 0,
	    "damageTags": ["fire"]
	  }]
	}`))
	require.Len(t, def.Effects, 1)

	e := def.Effects[0]
	require.Equal(t, EffectTypeRetaliateBurst, e.Type)
	require.NotNil(t, e.RetaliateBurst)

	assert.InDelta(t, 0.2, e.RetaliateBurst.FractionAt(1), 1e-6)
	assert.InDelta(t, 0.4, e.RetaliateBurst.FractionAt(5), 1e-6, "level 5: 0.2 + 4×0.05")
	assert.Equal(t, 300, e.RetaliateBurst.TicksAt(1))
	assert.Equal(t, 300, e.RetaliateBurst.TicksAt(5), "PO ruling 3: level buys strength, not uptime")
	assert.Equal(t, []string{"fire"}, e.RetaliateBurst.Tags)
	assert.InDelta(t, 0.02, e.CostFractionOfMax, 1e-6, "a cooldown pays on activation")
}

// PO ruling 2: the reflected damage carries the tags AUTHORED ON THE SKILL, not
// the incoming hit's — the FireShield convention. So the same normalization
// applies: absent tags are physical, not "matches nothing".
func TestRetaliateBurst_AbsentTagsDefaultToPhysical(t *testing.T) {
	def := mustParse(t, []byte(`{
	  "id": 203, "name": "Retribution", "category": "cooldown", "maxLevel": 5,
	  "effects": [{"type": "retaliate_burst", "reflectFraction": 0.2, "reflectDurationTicks": 300}]
	}`))
	assert.Equal(t, []string{DamageTagPhysical}, def.Effects[0].RetaliateBurst.Tags)
}

func TestRetaliateBurst_RejectsAnUnknownDamageType(t *testing.T) {
	raw, err := parseSkillDefinition([]byte(`{
	  "id": 203, "name": "Retribution", "category": "cooldown", "maxLevel": 5,
	  "effects": [{"type": "retaliate_burst", "reflectFraction": 0.2,
	    "reflectDurationTicks": 300, "damageTags": ["fyre"]}]
	}`))
	if err == nil {
		_, err = raw.mapToSkillDefinition(nil)
	}
	require.Error(t, err)
}

// The lifestealParams rules, both halves: a zero share is a cast that does
// nothing, and a sub-1-tick buff expires before a hit can read it.
func TestRetaliateBurst_RejectsAZeroShareAndAZeroWindow(t *testing.T) {
	for _, payload := range []string{
		`"reflectFraction": 0, "reflectDurationTicks": 300`,
		`"reflectFraction": 0.2, "reflectDurationTicks": 0`,
	} {
		raw, err := parseSkillDefinition([]byte(`{
		  "id": 203, "name": "Retribution", "category": "cooldown", "maxLevel": 5,
		  "effects": [{"type": "retaliate_burst", ` + payload + `}]
		}`))
		if err == nil {
			_, err = raw.mapToSkillDefinition(nil)
		}
		require.Error(t, err, "authored %s", payload)
	}
}

// ⚑ No upper cap on the share, deliberately, and this is the lifesteal rule
// rather than the slow one: a reflect above 1 gives back more than it took,
// which is strong but coherent authored content. FractionAt floors at 0 only.
func TestRetaliateBurst_AcceptsAShareAboveOne(t *testing.T) {
	def := mustParse(t, []byte(`{
	  "id": 203, "name": "Retribution", "category": "cooldown", "maxLevel": 5,
	  "effects": [{"type": "retaliate_burst", "reflectFraction": 1.5, "reflectDurationTicks": 300}]
	}`))
	assert.InDelta(t, 1.5, def.Effects[0].RetaliateBurst.FractionAt(1), 1e-6)
}

// A self-buff projects nothing and reaches nobody, so it takes no geometry, no
// cadence and no target flags — the retaliate_slow/lifesteal_burst rule.
func TestRetaliateBurst_RejectsGeometryCadenceAndTargeting(t *testing.T) {
	for _, key := range []string{
		`"radius": 2`, `"tickInterval": 30`, `"targetsEnemies": true`,
		`"targetsAllies": true`, `"maxTargets": 1`, `"variance": 0.1`,
		`"damageHP": 3`, `"gateKey": "harvest"`,
	} {
		raw, err := parseSkillDefinition([]byte(`{
		  "id": 203, "name": "Retribution", "category": "cooldown", "maxLevel": 5,
		  "effects": [{"type": "retaliate_burst", "reflectFraction": 0.2,
		    "reflectDurationTicks": 300, ` + key + `}]
		}`))
		if err == nil {
			_, err = raw.mapToSkillDefinition(nil)
		}
		require.Error(t, err, "authored %s", key)
	}
}
