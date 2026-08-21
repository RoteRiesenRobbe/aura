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
	// ⚑ The LAST free bit in the aura_category ubyte (C4, PO ruling
	// 2026-08-17). A ninth category needs a wider wire field, which is a §39
	// conversation — do not add one here without it.
	AuraCategorySpeed AuraCategory = 1 << 7
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

	// Green on the client, matching the applied-SPEED pip for the resist
	// reason: the ring says "this field hastens" and the pip on an ally says
	// "I am hastened", and one colour has to mean one thing (PO ruling
	// 2026-08-17). The colour is the pip's existing green, moved into the
	// shared table rather than duplicated.
	EffectTypeSpeedAura: AuraCategorySpeed,

	// No persistent aura radius — nothing to outline.
	EffectTypeNone:           AuraCategoryNone,
	EffectTypeStatMultiplier: AuraCategoryNone,
	EffectTypeInstantDamage:  AuraCategoryNone,
	EffectTypeSelfHeal:       AuraCategoryNone,
	EffectTypeResistPassive:  AuraCategoryNone,
	EffectTypeInstantDot:     AuraCategoryNone,
	EffectTypeSpawn:          AuraCategoryNone,
	// Both spawns draw nothing on the CASTER's ring: what they produce is a
	// separate entity with a ring of its own (plan-portal-spells.md D4).
	EffectTypeSpawnAtAnchor: AuraCategoryNone,
	// The thrown twin is a third spawn, and the same answer: the ring belongs to
	// the projectile that lands, never to the arm that threw it
	// (plan-prototype-projectile.md D2).
	EffectTypeProjectile: AuraCategoryNone,
	EffectTypeTaunt:      AuraCategoryNone,
	EffectTypeDetaunt:       AuraCategoryNone,
	EffectTypeInstantShield: AuraCategoryNone,
	EffectTypeRecall:        AuraCategoryNone,
	EffectTypeInstantHot:    AuraCategoryNone,
	EffectTypeRevive:        AuraCategoryNone,
	EffectTypeDash:          AuraCategoryNone,
	EffectTypeTickRate:      AuraCategoryNone,
	// The resist cooldown draws no ring for its instant twin's reason: the
	// query circle exists for one cast and is gone, so there is nothing
	// persistent to outline. The buff it grants shows on the TARGET as the
	// resist pip, which is the read the resist_aura ring points at anyway.
	EffectTypeInstantResist: AuraCategoryNone,
	// A speed burst is self-targeted and projects nothing; its tell is the
	// applied-effect pip on the caster (plus visibly moving faster).
	EffectTypeSpeedBurst: AuraCategoryNone,
	// A lifesteal burst projects nothing either — it changes what the caster's
	// OWN damage does when it lands, so its tell is the heal-back numbers
	// floating off whatever aura the player already had on.
	EffectTypeLifestealBurst: AuraCategoryNone,
	// Calm is cooldown-fired and leaves no ring; the client tell is the
	// applied-effect pip on the calmed mob (plan-faction-flips chunk 2).
	EffectTypeCalm: AuraCategoryNone,
	// Charm is cooldown-fired and leaves no ring either; its tell is the
	// applied-effect pip on the charmed mob (D13, plan-faction-flips chunk 3).
	EffectTypeCharm: AuraCategoryNone,
	// Retaliate slow is a PASSIVE — it has no ring for the same reason
	// stat_multiplier and resist_passive have none: nothing is projected, so
	// there is no circle to colour. ⚑ Deliberately NOT AuraCategorySlow: that
	// would be reading the effect it applies rather than the geometry it draws,
	// and the tell is on the ATTACKER (the existing slow pip lights on the mob
	// that hit you, for free), never on the wearer.
	EffectTypeRetaliateSlow: AuraCategoryNone,
	// Retaliate damage is a PASSIVE too, and none for the same reason: the
	// wearer projects no circle. ⚑ Deliberately NOT AuraCategoryDamage — the
	// map answers "what ring does this draw", not "what does this do", and a
	// damage ring on a player wearing a fire shield would promise a hit zone
	// that does not exist. The tell is on the ATTACKER: it takes a damage
	// number, which is the read.
	EffectTypeRetaliateDamage: AuraCategoryNone,
	// The percentage reflect is a self-buff fired on cooldown, so it draws no
	// ring for the lifesteal_burst reason rather than the passive one: nothing
	// is projected, the caster's own state changed. Its tell is the damage
	// numbers coming off whatever hits you.
	EffectTypeRetaliateBurst: AuraCategoryNone,
	// A stun is cooldown-fired and projects no ring; its tell is the pip on
	// the stunned mob — which is the SLOW pip, since the ubyte has no bit left
	// (D6). The mob visibly stopping doing anything is the rest of the read.
	EffectTypeStun: AuraCategoryNone,
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
