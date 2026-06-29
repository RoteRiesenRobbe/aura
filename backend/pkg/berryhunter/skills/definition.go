package skills

import (
	"encoding/json"
	"fmt"
)

type SkillID int

func (s SkillID) String() string {
	return fmt.Sprintf("SkillID(%d)", s)
}

type SkillCategory int

const (
	SkillCategoryNone       SkillCategory = iota
	SkillCategoryActiveAura
	SkillCategoryPassive
	SkillCategoryCooldown
)

var skillCategoryMap = map[string]SkillCategory{
	"active_aura": SkillCategoryActiveAura,
	"passive":     SkillCategoryPassive,
	"cooldown":    SkillCategoryCooldown,
}

type EffectType int

const (
	EffectTypeNone           EffectType = iota
	EffectTypeDamageAura
	EffectTypeHealAura
	EffectTypeStatMultiplier
	EffectTypeInstantDamage
)

var effectTypeMap = map[string]EffectType{
	"damage_aura":     EffectTypeDamageAura,
	"heal_aura":       EffectTypeHealAura,
	"stat_multiplier": EffectTypeStatMultiplier,
	"instant_damage":  EffectTypeInstantDamage,
}

// EffectDef holds parameters for one effect within a skill. All effect-type-specific
// fields live in this struct (fat struct pattern). Fields that do not apply to a given
// EffectType are zero. When the number of effect types grows substantially, consider
// splitting into per-type structs behind an interface.
type EffectDef struct {
	Type EffectType

	// damage_aura, heal_aura, instant_damage
	Radius         float32
	RadiusPerLevel float32

	// damage_aura, instant_damage
	DamageFraction         float32
	DamageFractionPerLevel float32
	TargetsMobs            bool
	TargetsPlayers         bool

	// heal_aura
	HealFraction         float32
	HealFractionPerLevel float32
	SelfDamageFraction   float32

	// damage_aura, heal_aura — always >= 1 after parsing (absent in JSON → 1)
	TickInterval int

	// stat_multiplier
	Stat             string
	AdditivePerLevel float32
}

type SkillDefinition struct {
	ID       SkillID
	Name     string
	Category SkillCategory
	MaxLevel int

	// Zero for non-cooldown skills.
	CooldownTicks         int
	CooldownTicksPerLevel int

	Effects []EffectDef
}

// --- private JSON parsing types ---

type effectDef struct {
	Type string `json:"type"`

	Radius         float32 `json:"radius"`
	RadiusPerLevel float32 `json:"radiusPerLevel"`

	DamageFraction         float32 `json:"damageFraction"`
	DamageFractionPerLevel float32 `json:"damageFractionPerLevel"`
	TargetsMobs            bool    `json:"targetsMobs"`
	TargetsPlayers         bool    `json:"targetsPlayers"`

	HealFraction         float32 `json:"healFraction"`
	HealFractionPerLevel float32 `json:"healFractionPerLevel"`
	SelfDamageFraction   float32 `json:"selfDamageFraction"`

	TickInterval *int `json:"tickInterval"` // nil → default 1

	Stat             string  `json:"stat"`
	AdditivePerLevel float32 `json:"additivePerLevel"`
}

type skillDefinition struct {
	ID       int    `json:"id"`
	Name     string `json:"name"`
	Category string `json:"category"`
	MaxLevel int    `json:"maxLevel"`

	CooldownTicks         int `json:"cooldownTicks"`
	CooldownTicksPerLevel int `json:"cooldownTicksPerLevel"`

	Effects []effectDef `json:"effects"`
}

func parseSkillDefinition(data []byte) (*skillDefinition, error) {
	var s skillDefinition
	if err := json.Unmarshal(data, &s); err != nil {
		return nil, err
	}
	return &s, nil
}

func (s *skillDefinition) mapToSkillDefinition() (*SkillDefinition, error) {
	category, ok := skillCategoryMap[s.Category]
	if !ok {
		return nil, fmt.Errorf("unknown skill category: %q", s.Category)
	}

	effects := make([]EffectDef, 0, len(s.Effects))
	for _, e := range s.Effects {
		effect, err := e.mapToEffectDef()
		if err != nil {
			return nil, fmt.Errorf("skill %q: %w", s.Name, err)
		}
		effects = append(effects, effect)
	}

	return &SkillDefinition{
		ID:                    SkillID(s.ID),
		Name:                  s.Name,
		Category:              category,
		MaxLevel:              s.MaxLevel,
		CooldownTicks:         s.CooldownTicks,
		CooldownTicksPerLevel: s.CooldownTicksPerLevel,
		Effects:               effects,
	}, nil
}

func (e *effectDef) mapToEffectDef() (EffectDef, error) {
	effectType, ok := effectTypeMap[e.Type]
	if !ok {
		return EffectDef{}, fmt.Errorf("unknown effect type: %q", e.Type)
	}

	tickInterval := 1
	if e.TickInterval != nil && *e.TickInterval > 0 {
		tickInterval = *e.TickInterval
	}

	return EffectDef{
		Type:                   effectType,
		Radius:                 e.Radius,
		RadiusPerLevel:         e.RadiusPerLevel,
		DamageFraction:         e.DamageFraction,
		DamageFractionPerLevel: e.DamageFractionPerLevel,
		TargetsMobs:            e.TargetsMobs,
		TargetsPlayers:         e.TargetsPlayers,
		HealFraction:           e.HealFraction,
		HealFractionPerLevel:   e.HealFractionPerLevel,
		SelfDamageFraction:     e.SelfDamageFraction,
		TickInterval:           tickInterval,
		Stat:                   e.Stat,
		AdditivePerLevel:       e.AdditivePerLevel,
	}, nil
}
