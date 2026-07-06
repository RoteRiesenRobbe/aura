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
	EffectTypeResistAura
	EffectTypeResistPassive
)

var effectTypeMap = map[string]EffectType{
	"damage_aura":     EffectTypeDamageAura,
	"heal_aura":       EffectTypeHealAura,
	"stat_multiplier": EffectTypeStatMultiplier,
	"instant_damage":  EffectTypeInstantDamage,
	"slow_aura":       EffectTypeSlowAura,
	"self_heal":       EffectTypeSelfHeal,
	"resist_aura":     EffectTypeResistAura,
	"resist_passive":  EffectTypeResistPassive,
}

// Selector decides which of the in-range candidates a capped effect actually
// affects (roadmap.md item 11). It only matters once maxTargets caps the
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

// DamageTagPhysical is the reserved default damage tag (item 11 Phase 2).
// Damage effects with no explicit `damageTags` are normalized to it at parse
// time, so armor-style resistance (a "physical" entry in a resistance map)
// applies to untyped damage like any other tag.
const DamageTagPhysical = "physical"

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

	// damage_aura, instant_damage — damage tags for resistances (item 11
	// Phase 2). Arbitrary strings by design (bespoke tags like "boss_x_lava"
	// compose with general ones like "fire"). Always non-empty after parsing:
	// absent in JSON → [DamageTagPhysical].
	DamageTags []string

	// damage_aura, instant_damage, heal_aura, self_heal — per-hit percentage
	// variance band (item 11 Phase 3, decision C2): each hit rolls uniform in
	// [amount×(1−v), amount×(1+v)] around the level-scaled amount. 0 = static
	// (the default); valid range 0 <= v < 1. The roll happens before the
	// target's mitigation (C3) and is invalid on effects without a rolled
	// amount (silent no-op otherwise).
	Variance float32

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

	// resist_aura, resist_passive — tag resistance granted to targets (item 11
	// Phase 2). ResistFactor is the incoming-damage multiplier for each covered
	// tag (0.5 = takes half, 0 = immune); effective factor at level L is
	// ResistFactor + (L−1) × ResistFactorPerLevel, floored at 0 (negative
	// PerLevel = stronger per level). TargetsSelf (resist_aura only) also buffs
	// the caster — without consuming a MaxTargets slot.
	ResistTags           []string
	ResistFactor         float32
	ResistFactorPerLevel float32
	TargetsSelf          bool

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

	// stat_multiplier — additive bonus to the named stat, scaled like every
	// other paired field: StatBonus + (L−1) × StatBonusPerLevel.
	Stat              string
	StatBonus         float32
	StatBonusPerLevel float32
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

	DamageHP         float32  `json:"damageHP"`
	DamageHPPerLevel float32  `json:"damageHPPerLevel"`
	TargetsMobs      bool     `json:"targetsMobs"`
	TargetsPlayers   bool     `json:"targetsPlayers"`
	DamageTags       []string `json:"damageTags"` // absent → [physical] on damage effects

	Variance float32 `json:"variance"` // 0 = static; only on damage/heal amounts

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

	ResistTags           []string `json:"resistTags"`
	ResistFactor         float32  `json:"resistFactor"`
	ResistFactorPerLevel float32  `json:"resistFactorPerLevel"`
	TargetsSelf          bool     `json:"targetsSelf"`

	SlowFraction         float32 `json:"slowFraction"`
	SlowFractionPerLevel float32 `json:"slowFractionPerLevel"`

	TickInterval         *int `json:"tickInterval"` // nil → default 1
	TickIntervalPerLevel int  `json:"tickIntervalPerLevel"`

	HitStyle string `json:"hitStyle"` // "" → auto (cadence-derived)

	Stat              string  `json:"stat"`
	StatBonus         float32 `json:"statBonus"`
	StatBonusPerLevel float32 `json:"statBonusPerLevel"`
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

// mapDamageTags validates and normalizes an effect's damage tags (item 11
// Phase 2). Damage-dealing effects always end up with at least one tag
// (absent → [DamageTagPhysical]); non-damage effects must not declare any —
// a tag there would be a silent no-op, which is why it hard-fails at load.
func mapDamageTags(effectType EffectType, tags []string) ([]string, error) {
	isDamageEffect := effectType == EffectTypeDamageAura || effectType == EffectTypeInstantDamage

	if !isDamageEffect {
		if len(tags) > 0 {
			return nil, fmt.Errorf("damageTags: only valid on damage_aura/instant_damage effects")
		}
		return nil, nil
	}

	if len(tags) == 0 {
		return []string{DamageTagPhysical}, nil
	}

	seen := make(map[string]bool, len(tags))
	for _, tag := range tags {
		if tag == "" {
			return nil, fmt.Errorf("damageTags: empty tag")
		}
		if seen[tag] {
			return nil, fmt.Errorf("damageTags: duplicate tag %q", tag)
		}
		seen[tag] = true
	}
	return tags, nil
}

// mapVariance validates the per-hit variance band (item 11 Phase 3). Only
// effects with a rolled amount (damage or heal) may declare one — anywhere
// else it would be a silent no-op, which is why it hard-fails at load — and
// v >= 1 would allow a 0-or-negative roll.
func mapVariance(effectType EffectType, variance float32) error {
	rollingEffect := effectType == EffectTypeDamageAura || effectType == EffectTypeInstantDamage ||
		effectType == EffectTypeHealAura || effectType == EffectTypeSelfHeal

	if !rollingEffect {
		if variance != 0 {
			return fmt.Errorf("variance: only valid on effects with a rolled amount (damage/heal)")
		}
		return nil
	}
	if variance < 0 || variance >= 1 {
		return fmt.Errorf("variance: must be in [0, 1), got %v", variance)
	}
	return nil
}

// mapResistFields validates the resist_aura/resist_passive fields (item 11
// Phase 2 Step 3). Resist effects require at least one covered tag (empty or
// duplicate tags hard-fail, like damageTags) and a non-negative factor;
// non-resist effects must not declare resist fields (silent no-ops otherwise).
func mapResistFields(effectType EffectType, e *effectDef) error {
	isResistEffect := effectType == EffectTypeResistAura || effectType == EffectTypeResistPassive

	if !isResistEffect {
		if len(e.ResistTags) > 0 || e.ResistFactor != 0 || e.ResistFactorPerLevel != 0 || e.TargetsSelf {
			return fmt.Errorf("resist fields are only valid on resist_aura/resist_passive effects")
		}
		return nil
	}

	if len(e.ResistTags) == 0 {
		return fmt.Errorf("resistTags: required on resist effects")
	}
	seen := make(map[string]bool, len(e.ResistTags))
	for _, tag := range e.ResistTags {
		if tag == "" {
			return fmt.Errorf("resistTags: empty tag")
		}
		if seen[tag] {
			return fmt.Errorf("resistTags: duplicate tag %q", tag)
		}
		seen[tag] = true
	}
	if e.ResistFactor < 0 {
		return fmt.Errorf("resistFactor: must be >= 0, got %v", e.ResistFactor)
	}
	return nil
}

// mapStatFields validates the stat_multiplier fields. The stat name must be
// known (an unapplied stat would be a silent no-op) and at least one of
// statBonus/statBonusPerLevel must be non-zero — a both-zero effect does
// nothing, and hard-failing it also catches the pre-rename "additivePerLevel"
// key, which json.Unmarshal silently drops. Non-stat effects must not declare
// stat fields (silent no-ops otherwise).
func mapStatFields(effectType EffectType, e *effectDef) error {
	if effectType != EffectTypeStatMultiplier {
		if e.Stat != "" || e.StatBonus != 0 || e.StatBonusPerLevel != 0 {
			return fmt.Errorf("stat fields are only valid on stat_multiplier effects")
		}
		return nil
	}

	if !validStats[e.Stat] {
		return fmt.Errorf("stat_multiplier: unknown stat %q", e.Stat)
	}
	if e.StatBonus == 0 && e.StatBonusPerLevel == 0 {
		return fmt.Errorf("stat_multiplier: no scaling authored (statBonus and statBonusPerLevel both 0; note additivePerLevel was renamed to this pair)")
	}
	return nil
}

func (e *effectDef) mapToEffectDef() (EffectDef, error) {
	effectType, ok := effectTypeMap[e.Type]
	if !ok {
		return EffectDef{}, fmt.Errorf("unknown effect type: %q", e.Type)
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

	damageTags, err := mapDamageTags(effectType, e.DamageTags)
	if err != nil {
		return EffectDef{}, err
	}

	if err := mapResistFields(effectType, e); err != nil {
		return EffectDef{}, err
	}

	if err := mapVariance(effectType, e.Variance); err != nil {
		return EffectDef{}, err
	}

	if err := mapStatFields(effectType, e); err != nil {
		return EffectDef{}, err
	}

	return EffectDef{
		Type:                      effectType,
		Radius:                    e.Radius,
		RadiusPerLevel:            e.RadiusPerLevel,
		DamageHP:                  e.DamageHP,
		DamageHPPerLevel:          e.DamageHPPerLevel,
		TargetsMobs:               e.TargetsMobs,
		TargetsPlayers:            e.TargetsPlayers,
		DamageTags:                damageTags,
		Variance:                  e.Variance,
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
		ResistTags:                e.ResistTags,
		ResistFactor:              e.ResistFactor,
		ResistFactorPerLevel:      e.ResistFactorPerLevel,
		TargetsSelf:               e.TargetsSelf,
		SlowFraction:              e.SlowFraction,
		SlowFractionPerLevel:      e.SlowFractionPerLevel,
		TickInterval:              tickInterval,
		TickIntervalPerLevel:      e.TickIntervalPerLevel,
		HitStyle:                  hitStyle,
		Stat:                      e.Stat,
		StatBonus:                 e.StatBonus,
		StatBonusPerLevel:         e.StatBonusPerLevel,
	}, nil
}
