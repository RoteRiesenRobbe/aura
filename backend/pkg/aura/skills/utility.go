package skills

// Baseline utilities (plan-downtime.md D1): a small class of always-present
// abilities OUTSIDE the skill catalog and the spellbook — nothing to discover,
// level, slot, or spend points on, held by every character from creation.
// They are defined here as Go literals rather than content JSON because the
// content loaders feed the catalog, and the whole point of the class is that
// these are not catalog entries (the free-floor guard and every cooldown
// enumeration deliberately never see them).
//
// UtilityKind values are PERMANENTLY PINNED to the UtilityKind wire enum in
// api/schema/client.fbs (§28 discipline) — codec's pin test holds the two
// together.

// UtilityKind identifies a baseline utility. 0 is reserved as "none" so the
// zero value of casting state means idle.
type UtilityKind uint8

const (
	UtilityNone   UtilityKind = 0
	UtilityRecall UtilityKind = 1
)

// UtilityDef is the Go-side twin of a SkillDefinition for the baseline class:
// only the fields the cast path needs. No cost and no cooldown by design
// (plan-downtime.md D7) — the interruptible cast window is the entire brake.
type UtilityDef struct {
	Kind                    UtilityKind
	Name                    string
	CastTicks               int // [PLACEHOLDER]
	CastInterruptedByDamage bool
}

var utilityDefs = map[UtilityKind]*UtilityDef{
	// Recall inherits the retired skill's 10 s cast (300 ticks at 30/s) and
	// its damage interrupt; the 5 % cost and 5 min cooldown died with the
	// skill (D7 — free and cooldown-less, the cast is the only brake).
	UtilityRecall: {Kind: UtilityRecall, Name: "Recall", CastTicks: 300, CastInterruptedByDamage: true},
}

// UtilityByKind resolves a utility definition; nil for UtilityNone and for
// any kind this build does not know (client-supplied values).
func UtilityByKind(kind UtilityKind) *UtilityDef {
	return utilityDefs[kind]
}
