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
	SkillCategoryNone SkillCategory = iota
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
	EffectTypeNone EffectType = iota
	EffectTypeDamageAura
	EffectTypeHealAura
	EffectTypeStatMultiplier
	EffectTypeInstantDamage
	EffectTypeSlowAura
	EffectTypeSelfHeal
)

var effectTypeMap = map[string]EffectType{
	"damage_aura":     EffectTypeDamageAura,
	"heal_aura":       EffectTypeHealAura,
	"stat_multiplier": EffectTypeStatMultiplier,
	"instant_damage":  EffectTypeInstantDamage,
	"slow_aura":       EffectTypeSlowAura,
	"self_heal":       EffectTypeSelfHeal,
}

// Selector decides which of the in-range candidates a capped effect actually
// affects (v1-roadmap.md item 11). It only matters once maxTargets caps the
// set — an uncapped effect hits everything in range regardless of selector.
type Selector int

const (
	SelectorNearest      Selector = iota // default: closest to the caster
	SelectorLowestHealth                 // most-wounded by current/max ratio
	SelectorAll                          // explicit AoE-all, ignores maxTargets
)

// selectorMap parses the JSON `selector` field. Absent → nearest (the default
// for every aura and heal — positioning steers the single target).
var selectorMap = map[string]Selector{
	"":              SelectorNearest,
	"nearest":       SelectorNearest,
	"lowest_health": SelectorLowestHealth,
	"all":           SelectorAll,
}

// HitStyle is a per-effect override for the aura-hit VFX (item 11 Step 4). The
// default, HitStyleAuto, derives the style from the effect's tick cadence (see
// sys.auraHitStyleFor); the explicit values pin a style regardless of cadence so
// each aura is individually configurable via its JSON `hitStyle` field. Kept in
// this package (not model) to avoid the skills↔model import cycle; sys maps it
// to model.AuraHitStyle.
type HitStyle int

const (
	HitStyleAuto  HitStyle = iota // default: derive from tick cadence
	HitStyleSlash                 // always a discrete slash
	HitStyleFire                  // always a sustained fire/spark
	HitStyleNone                  // never show a hit VFX
)

// hitStyleMap parses the JSON `hitStyle` field. Absent/"auto" → cadence-derived.
var hitStyleMap = map[string]HitStyle{
	"":      HitStyleAuto,
	"auto":  HitStyleAuto,
	"slash": HitStyleSlash,
	"fire":  HitStyleFire,
	"none":  HitStyleNone,
}

// Supported stat_multiplier stat names. A stat listed here must actually be
// applied somewhere (movementSpeed: core/input.go; maxHealth:
// player.MaxHealthFactor) — accepting an unapplied stat would be a silent
// no-op, which is why unknown names hard-fail at load.
const (
	StatMovementSpeed   = "movementSpeed"
	StatMaxHealth       = "maxHealth"
	StatDamageReduction = "damageReduction" // applied in player.takeDamage
)

var validStats = map[string]bool{
	StatMovementSpeed:   true,
	StatMaxHealth:       true,
	StatDamageReduction: true,
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

	// damage_aura, instant_damage — absolute HP dealt per hit (item 11 Phase 1).
	DamageHP         float32
	DamageHPPerLevel float32
	TargetsMobs      bool
	TargetsPlayers   bool

	// damage_aura, heal_aura, instant_damage — capped targeting (item 11).
	// MaxTargets 0 = uncapped (AoE-all). Selector orders the candidates when
	// capped; MaxTargetsPerLevel grows the cap with skill level.
	Selector           Selector
	MaxTargets         int
	MaxTargetsPerLevel int

	// damage_aura, mob casters only: damage dealt to structures (placeables)
	// per tick. Structures read this via MobTouches double dispatch.
	StructureDamageFraction float32
	TargetsStructures       bool

	// heal_aura, self_heal — absolute HP (item 11 Phase 1). SelfDamageHP is the
	// caster's HP cost per heal tick (HealAura self-cost).
	HealHP         float32
	HealHPPerLevel float32
	SelfDamageHP   float32

	// self_heal only: heal a fraction of the caster's MAX HP instead of a flat
	// amount (heal cooldown). When > 0 it overrides HealHP; the fraction grows
	// by HealFractionOfMaxPerLevel per level (absolute, e.g. 0.20 → 0.25 → 0.30).
	HealFractionOfMax         float32
	HealFractionOfMaxPerLevel float32

	// slow_aura: movement-speed reduction applied to targets in range
	SlowFraction         float32
	SlowFractionPerLevel float32

	// damage_aura, heal_aura — always >= 1 after parsing (absent in JSON → 1)
	TickInterval int
	// per-level change to the tick interval (negative = faster at higher
	// levels). Effective interval is floored at 1.
	TickIntervalPerLevel int

	// damage_aura, instant_damage — per-effect aura-hit VFX override
	// (item 11 Step 4). HitStyleAuto (default) derives it from the tick cadence.
	HitStyle HitStyle

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

	DamageHP         float32 `json:"damageHP"`
	DamageHPPerLevel float32 `json:"damageHPPerLevel"`
	TargetsMobs      bool    `json:"targetsMobs"`
	TargetsPlayers   bool    `json:"targetsPlayers"`

	Selector           string `json:"selector"`
	MaxTargets         int    `json:"maxTargets"`
	MaxTargetsPerLevel int    `json:"maxTargetsPerLevel"`

	StructureDamageFraction float32 `json:"structureDamageFraction"`
	TargetsStructures       bool    `json:"targetsStructures"`

	HealHP         float32 `json:"healHP"`
	HealHPPerLevel float32 `json:"healHPPerLevel"`
	SelfDamageHP   float32 `json:"selfDamageHP"`

	HealFractionOfMax         float32 `json:"healFractionOfMax"`
	HealFractionOfMaxPerLevel float32 `json:"healFractionOfMaxPerLevel"`

	SlowFraction         float32 `json:"slowFraction"`
	SlowFractionPerLevel float32 `json:"slowFractionPerLevel"`

	TickInterval         *int `json:"tickInterval"` // nil → default 1
	TickIntervalPerLevel int  `json:"tickIntervalPerLevel"`

	HitStyle string `json:"hitStyle"` // "" → auto (cadence-derived)

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

	if effectType == EffectTypeStatMultiplier && !validStats[e.Stat] {
		return EffectDef{}, fmt.Errorf("stat_multiplier: unknown stat %q", e.Stat)
	}

	selector, ok := selectorMap[e.Selector]
	if !ok {
		return EffectDef{}, fmt.Errorf("unknown selector: %q", e.Selector)
	}

	tickInterval := 1
	if e.TickInterval != nil && *e.TickInterval > 0 {
		tickInterval = *e.TickInterval
	}

	hitStyle, ok := hitStyleMap[e.HitStyle]
	if !ok {
		return EffectDef{}, fmt.Errorf("unknown hitStyle: %q", e.HitStyle)
	}

	return EffectDef{
		Type:                      effectType,
		Radius:                    e.Radius,
		RadiusPerLevel:            e.RadiusPerLevel,
		DamageHP:                  e.DamageHP,
		DamageHPPerLevel:          e.DamageHPPerLevel,
		TargetsMobs:               e.TargetsMobs,
		TargetsPlayers:            e.TargetsPlayers,
		Selector:                  selector,
		MaxTargets:                e.MaxTargets,
		MaxTargetsPerLevel:        e.MaxTargetsPerLevel,
		StructureDamageFraction:   e.StructureDamageFraction,
		TargetsStructures:         e.TargetsStructures,
		HealHP:                    e.HealHP,
		HealHPPerLevel:            e.HealHPPerLevel,
		SelfDamageHP:              e.SelfDamageHP,
		HealFractionOfMax:         e.HealFractionOfMax,
		HealFractionOfMaxPerLevel: e.HealFractionOfMaxPerLevel,
		SlowFraction:              e.SlowFraction,
		SlowFractionPerLevel:      e.SlowFractionPerLevel,
		TickInterval:              tickInterval,
		TickIntervalPerLevel:      e.TickIntervalPerLevel,
		HitStyle:                  hitStyle,
		Stat:                      e.Stat,
		AdditivePerLevel:          e.AdditivePerLevel,
	}, nil
}
