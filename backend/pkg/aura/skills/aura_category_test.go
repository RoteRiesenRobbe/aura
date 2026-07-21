package skills

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// Every effect type content can author must be explicitly classified — including
// the ones that deliberately draw no ring. Without this, adding a new EffectType
// (say frost_aura) would silently fall through to "no ring" and the aura would
// render as invisible with no build or test failure. A red test here is the
// intended signal: classify the new type, even if the answer is None.
func TestAuraCategory_ClassifiesEveryAuthorableEffectType(t *testing.T) {
	for name, tt := range effectTypeMap {
		_, ok := auraCategoryByEffect[tt]
		assert.True(t, ok, "effect type %q is authorable but has no aura-ring category", name)
	}
}

func TestAuraCategoryOf_RingCategories(t *testing.T) {
	assert.Equal(t, AuraCategoryDamage, AuraCategoryOf(EffectTypeDamageAura))
	assert.Equal(t, AuraCategoryHeal, AuraCategoryOf(EffectTypeHealAura))
	assert.Equal(t, AuraCategoryHeal, AuraCategoryOf(EffectTypeHotAura), "hot reads as heal on the ring")
	assert.Equal(t, AuraCategoryShield, AuraCategoryOf(EffectTypeShieldAura))
	assert.Equal(t, AuraCategoryDot, AuraCategoryOf(EffectTypeDotAura))
	assert.Equal(t, AuraCategorySlow, AuraCategoryOf(EffectTypeSlowAura))
	assert.Equal(t, AuraCategoryLight, AuraCategoryOf(EffectTypeLightAura))
	assert.Equal(t, AuraCategoryResist, AuraCategoryOf(EffectTypeResistAura))
}

func TestAuraCategoryOf_NonRingEffects(t *testing.T) {
	// Instants, passives and utility draw no persistent ring — they have no
	// radius to outline in the first place.
	for _, tt := range []EffectType{
		EffectTypeNone, EffectTypeStatMultiplier, EffectTypeInstantDamage,
		EffectTypeSelfHeal, EffectTypeResistPassive, EffectTypeInstantDot,
		EffectTypeSpawn, EffectTypeInstantShield, EffectTypeRecall,
		EffectTypeInstantHot, EffectTypeRevive, EffectTypeDash, EffectTypeTickRate,
	} {
		assert.Equal(t, AuraCategoryNone, AuraCategoryOf(tt), tt)
	}
}

// The bitmask exists for the multi-effect auras (Paladin, Vanguard, Warbanner):
// they keep the dual ring they render today instead of being demoted to their
// first effect.
func TestAuraCategoriesOf_CombinesEffects(t *testing.T) {
	dual := []EffectDef{
		{Type: EffectTypeDamageAura},
		{Type: EffectTypeHealAura},
	}
	got := AuraCategoriesOf(dual)
	assert.Equal(t, AuraCategoryDamage|AuraCategoryHeal, got)
	assert.True(t, got.Has(AuraCategoryDamage))
	assert.True(t, got.Has(AuraCategoryHeal))
	assert.False(t, got.Has(AuraCategoryShield))
}

func TestAuraCategoriesOf_IgnoresNonRingEffects(t *testing.T) {
	// A damage aura that also grants a stat multiplier is still just a damage ring.
	mixed := []EffectDef{
		{Type: EffectTypeDamageAura},
		{Type: EffectTypeStatMultiplier},
	}
	assert.Equal(t, AuraCategoryDamage, AuraCategoriesOf(mixed))

	assert.Equal(t, AuraCategoryNone, AuraCategoriesOf(nil))
	assert.Equal(t, AuraCategoryNone, AuraCategoriesOf([]EffectDef{}))
}

// Duplicate categories must not double-count — OR, not sum. A skill with two
// damage effects is one damage ring, and the byte stays a clean bitmask.
func TestAuraCategoriesOf_IsIdempotent(t *testing.T) {
	twice := []EffectDef{
		{Type: EffectTypeDamageAura},
		{Type: EffectTypeDotAura},
		{Type: EffectTypeDamageAura},
	}
	assert.Equal(t, AuraCategoryDamage|AuraCategoryDot, AuraCategoriesOf(twice))
}

// The whole taxonomy has to survive the trip through the wire as one ubyte.
func TestAuraCategory_FitsInAByte(t *testing.T) {
	all := AuraCategoryDamage | AuraCategoryHeal | AuraCategoryShield |
		AuraCategoryDot | AuraCategorySlow | AuraCategoryLight
	assert.LessOrEqual(t, uint64(all), uint64(255), "all ring categories must fit one wire ubyte")
}
