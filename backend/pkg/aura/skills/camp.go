package skills

import (
	"encoding/json"
	"fmt"
)

// Campfire traits (docs/plan-campfire-traits.md D2, R15): a trait is a skill of
// the `camp` category. Its level is its spellbook entry, so it persists in
// character_spellbook like any skill, but it is bought from its own pool
// (campfire points, one per discovered fire, D3) at a flat 1 point per level
// (R5), starts at 0 = no entry (unlike an ability's free level 1), is never
// equipped and carries no effects: the camp reads it at placement (D6).

// CampTraitKind is what a trait changes about its owner's camp.
type CampTraitKind int

const (
	CampTraitNone CampTraitKind = iota
	CampTraitDuration
	CampTraitHeal
	CampTraitCharges
	CampTraitBuff
)

var campTraitKindMap = map[string]CampTraitKind{
	"duration": CampTraitDuration,
	"heal":     CampTraitHeal,
	"charges":  CampTraitCharges,
	"buff":     CampTraitBuff,
}

var campTraitKindNames = reverseNames(campTraitKindMap)

func (k CampTraitKind) MarshalJSON() ([]byte, error) { return marshalEnum(campTraitKindNames, k) }

// campBuffStats are the three stats a buff trait may raise (R9).
var campBuffStats = map[string]bool{
	StatMaxHealth:     true,
	StatDamageDealt:   true,
	StatMovementSpeed: true,
}

// CampTraitDef is the authored `campTrait` block. PerLevel is in the kind's own
// unit: ticks of camp lifetime (duration), camp-aura levels (heal), charges
// (charges), a stat fraction (buff). All values [PLACEHOLDER].
type CampTraitDef struct {
	Kind     CampTraitKind `json:"kind"`
	Stat     string        `json:"stat,omitempty"`
	PerLevel float32       `json:"perLevel"`
}

type campTraitDefinition struct {
	Kind     string  `json:"kind"`
	Stat     string  `json:"stat"`
	PerLevel float32 `json:"perLevel"`
}

// IsCampTrait reports whether the skill is a campfire trait.
func (d *SkillDefinition) IsCampTrait() bool {
	return d != nil && d.Category == SkillCategoryCamp
}

// Value is the trait's total at the given level, in PerLevel's unit.
func (t *CampTraitDef) Value(level int) float32 {
	if t == nil || level <= 0 {
		return 0
	}
	return t.PerLevel * float32(level)
}

// parseCampTrait validates the block against the category: a camp skill needs
// one, every other category must not author one, and a buff names one of the
// three stats while the other kinds name none.
func parseCampTrait(raw json.RawMessage, category SkillCategory) (*CampTraitDef, error) {
	if len(raw) == 0 || string(raw) == "null" {
		if category == SkillCategoryCamp {
			return nil, fmt.Errorf("a camp skill needs a campTrait block")
		}
		return nil, nil
	}
	if category != SkillCategoryCamp {
		return nil, fmt.Errorf("campTrait is only legal on a camp skill")
	}
	var t campTraitDefinition
	if err := json.Unmarshal(raw, &t); err != nil {
		return nil, fmt.Errorf("campTrait: %w", err)
	}
	kind, ok := campTraitKindMap[t.Kind]
	if !ok {
		return nil, fmt.Errorf("campTrait: unknown kind %q", t.Kind)
	}
	if kind == CampTraitBuff {
		if !campBuffStats[t.Stat] {
			return nil, fmt.Errorf("campTrait: a buff needs stat maxHealth, damageDealt or movementSpeed, got %q", t.Stat)
		}
	} else if t.Stat != "" {
		return nil, fmt.Errorf("campTrait: stat is only legal on a buff, got %q on %q", t.Stat, t.Kind)
	}
	if t.PerLevel <= 0 {
		return nil, fmt.Errorf("campTrait: perLevel must be > 0, got %v", t.PerLevel)
	}
	return &CampTraitDef{Kind: kind, Stat: t.Stat, PerLevel: t.PerLevel}, nil
}
