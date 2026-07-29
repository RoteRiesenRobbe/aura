package skills

// AuraCategory is the effect-category taxonomy the client colours aura rings by
// (triage item 7). It is a bitmask, not an index: the multi-effect auras
// (Paladin, Vanguard, Warbanner) light one ring per category they carry, which
// is the red+green dual ring those three already render today.
//
// Serialized as the aura_category wire ubyte on both Mob and Character, so the
// colour language is identical for players and mobs and the client needs no
// skill-ID table of its own.
type AuraCategory uint8

const (
	AuraCategoryNone   AuraCategory = 0
	AuraCategoryDamage AuraCategory = 1 << 0
	AuraCategoryHeal   AuraCategory = 1 << 1
	AuraCategoryShield AuraCategory = 1 << 2
	AuraCategoryDot    AuraCategory = 1 << 3
	AuraCategorySlow   AuraCategory = 1 << 4
	AuraCategoryLight  AuraCategory = 1 << 5
	AuraCategoryResist AuraCategory = 1 << 6
)

// Has reports whether c carries the given category bit.
func (c AuraCategory) Has(other AuraCategory) bool { return c&other != 0 }

// auraCategoryByEffect classifies every authorable effect type. Effects with no
// persistent radius to outline (instants, passives, utility) map to None.
//
// This is an exhaustive table rather than a switch with a default on purpose:
// TestAuraCategory_ClassifiesEveryAuthorableEffectType fails when a new
// EffectType is added without a decision here, instead of the new aura silently
// rendering ringless.
var auraCategoryByEffect = map[EffectType]AuraCategory{
	EffectTypeDamageAura: AuraCategoryDamage,
	EffectTypeHealAura:   AuraCategoryHeal,
	// A heal-over-time reads as healing on the ring; its cadence is already
	// carried separately by aura_tick_interval.
	EffectTypeHotAura:    AuraCategoryHeal,
	EffectTypeShieldAura: AuraCategoryShield,
	EffectTypeDotAura:    AuraCategoryDot,
	EffectTypeSlowAura:   AuraCategorySlow,
	EffectTypeLightAura:  AuraCategoryLight,

	// Teal on the client, matching the applied-resist pip — projected and
	// received resist share one colour (PO pick 2026-07-21).
	EffectTypeResistAura: AuraCategoryResist,

	// No persistent aura radius — nothing to outline.
	EffectTypeNone:           AuraCategoryNone,
	EffectTypeStatMultiplier: AuraCategoryNone,
	EffectTypeInstantDamage:  AuraCategoryNone,
	EffectTypeSelfHeal:       AuraCategoryNone,
	EffectTypeResistPassive:  AuraCategoryNone,
	EffectTypeInstantDot:     AuraCategoryNone,
	EffectTypeSpawn:          AuraCategoryNone,
	EffectTypeTaunt:          AuraCategoryNone,
	EffectTypeDetaunt:        AuraCategoryNone,
	EffectTypeInstantShield:  AuraCategoryNone,
	EffectTypeRecall:         AuraCategoryNone,
	EffectTypeInstantHot:     AuraCategoryNone,
	EffectTypeRevive:         AuraCategoryNone,
	EffectTypeDash:           AuraCategoryNone,
	EffectTypeTickRate:       AuraCategoryNone,
	// Calm is cooldown-fired and leaves no ring; the client tell is the
	// applied-effect pip on the calmed mob (plan-faction-flips chunk 2).
	EffectTypeCalm: AuraCategoryNone,
	// Charm is cooldown-fired and leaves no ring either; its tell is the
	// applied-effect pip on the charmed mob (D13, plan-faction-flips chunk 3).
	EffectTypeCharm: AuraCategoryNone,
}

// AuraCategoryOf is the ring category a single effect contributes.
func AuraCategoryOf(t EffectType) AuraCategory { return auraCategoryByEffect[t] }

// AuraCategoriesOf is the union of ring categories across a skill's effects —
// the value serialized to the wire. OR, not sum: repeating a category does not
// double-count.
func AuraCategoriesOf(effects []EffectDef) AuraCategory {
	var c AuraCategory
	for _, e := range effects {
		c |= AuraCategoryOf(e.Type)
	}
	return c
}
