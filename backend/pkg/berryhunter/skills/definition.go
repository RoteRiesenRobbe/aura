package skills

import (
	"encoding/json"
	"fmt"
	"slices"
	"sort"
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
	EffectTypeDotAura
	EffectTypeInstantDot
	EffectTypeSpawn
	EffectTypeTaunt
	EffectTypeDetaunt
	EffectTypeLightAura
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
	"dot_aura":        EffectTypeDotAura,
	"instant_dot":     EffectTypeInstantDot,
	"spawn":           EffectTypeSpawn,
	"taunt":           EffectTypeTaunt,
	"detaunt":         EffectTypeDetaunt,
	"light_aura":      EffectTypeLightAura,
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

// EffectDef holds the parameters of one effect within a skill: the shared
// core (geometry, cadence, targeting) plus exactly ONE per-type payload —
// the pointer matching Type is non-nil, every other one nil. Parsing
// enforces the invariant and hard-fails any JSON key the effect type does
// not read (see effectKeys); code constructing an EffectDef directly (tests)
// must uphold it too.
type EffectDef struct {
	Type EffectType

	// Geometry: effect radius — the aura sensor size, or the one-shot query
	// circle of an instant_damage burst.
	Radius         float32
	RadiusPerLevel float32

	// Cadence: every how many ticks an active-aura effect fires. Always >= 1
	// after parsing (absent → 1); negative PerLevel = faster at higher
	// levels, effective interval floored at 1. Not valid on cooldown-fired
	// or equip-time effects — they have no tick cadence.
	TickInterval         int
	TickIntervalPerLevel int

	// Targeting: Selector orders candidates when MaxTargets caps the set
	// (0 = uncapped AoE-all); the flags gate RELATIVE to the caster's faction
	// (plan-effect-foundations F8/Step 1) — same faction by TargetsAllies,
	// other faction by TargetsEnemies — so the same skill retargets correctly
	// when its caster's faction differs or flips (mob loadouts, future charm/
	// summons). Placeables have no faction; damage effects reach them via
	// TargetsStructures only. Flags also drive the sensor/query masks.
	Selector           Selector
	MaxTargets         int
	MaxTargetsPerLevel int
	TargetsEnemies     bool
	TargetsAllies      bool
	TargetsStructures  bool

	// Per-type payloads — exactly one non-nil, matching Type.
	Damage   *DamageParams   // damage_aura, instant_damage
	Heal     *HealParams     // heal_aura
	SelfHeal *SelfHealParams // self_heal
	Slow     *SlowParams     // slow_aura
	Resist   *ResistParams   // resist_aura, resist_passive
	Stat     *StatParams     // stat_multiplier
	Dot      *DotParams      // dot_aura, instant_dot
	Spawn    *SpawnParams    // spawn
	Threat   *ThreatParams   // taunt, detaunt
}

// ThreatParams is the taunt / detaunt payload (mob-depth chunk 7). Margin is
// the head start a taunt sets above the mob's current max threat (force-to-top,
// decided v1); detaunt is a single-entry removal and ignores it.
type ThreatParams struct {
	Margin float32
}

// DamageParams is the damage_aura / instant_damage payload: absolute HP
// dealt per hit (item 11 Phase 1).
type DamageParams struct {
	HP         float32
	HPPerLevel float32

	// Damage tags for resistances (item 11 Phase 2). Arbitrary strings by
	// design (bespoke tags like "boss_x_lava" compose with general ones like
	// "fire"). Always non-empty after parsing: absent → [DamageTagPhysical].
	Tags []string

	// Per-hit percentage variance band (item 11 Phase 3): each hit rolls
	// uniform in [center×(1−v), center×(1+v)] around the level-scaled
	// amount. 0 = static (the default); valid range 0 <= v < 1. The roll
	// happens before the target's mitigation (decision C3).
	Variance float32

	// Per-effect aura-hit VFX override (item 11 Step 4). HitStyleAuto
	// (default) derives the style from the tick cadence.
	HitStyle HitStyle

	// Mob casters only: damage dealt to structures (placeables) per tick.
	// Structures read this via MobTouches double dispatch.
	StructureDamageFraction float32

	// Damage vocabulary (plan-skill-vocab chunk 1) — all optional (F2), zero =
	// inert. Composition order is F6 §3.1: base × berserker × execute × crit,
	// then the variance roll, then the target's mitigation.
	//
	// Execute: hits on targets whose health ratio is strictly below
	// ExecuteBelowFraction are multiplied by ExecuteBonusFactor. Deterministic,
	// per target, evaluated at hit time. Authored as a pair.
	ExecuteBelowFraction float32
	ExecuteBonusFactor   float32

	// Berserker: outgoing damage × (1 + max × (1 − casterHealthRatio)) — the
	// caster's missing HP scales the whole application. The acting entity's own
	// HP counts (a summon rages on ITS wounds, not the owner's; §4.2 parallel).
	BerserkerMaxBonusFactor float32

	// Crit: the ONE sanctioned, upside-only combat RNG (§4.3 decided
	// 2026-07-13): each hit rolls CritChance to multiply by CritFactor, after
	// execute/berserker and before variance. Crit-flagged damage lands on the
	// target's crit_taken wire accumulator. Authored as a pair.
	CritChance float32
	CritFactor float32

	// Lifesteal: the hit's recipient (the living Source, else the toucher)
	// heals LifestealFraction × damage DEALT — shield-absorbed included,
	// overkill excluded (F6 §3.1/9).
	LifestealFraction float32
}

// HPAt is the level-scaled damage center in absolute HP (pre-variance-roll).
func (p *DamageParams) HPAt(level int) float32 {
	return Scaled(p.HP, p.HPPerLevel, level)
}

// ExecuteMultiplier is the per-target execute bonus: ExecuteBonusFactor while
// the target's health ratio is strictly below the threshold, else 1. Neutral
// when execute is not authored.
func (p *DamageParams) ExecuteMultiplier(targetHealthRatio float32) float32 {
	if p.ExecuteBonusFactor == 0 || targetHealthRatio >= p.ExecuteBelowFraction {
		return 1
	}
	return p.ExecuteBonusFactor
}

// BerserkerMultiplier is the caster-side missing-HP bonus:
// 1 + max × (1 − casterHealthRatio), ratio clamped to [0, 1]. Neutral when
// berserker is not authored.
func (p *DamageParams) BerserkerMultiplier(casterHealthRatio float32) float32 {
	if p.BerserkerMaxBonusFactor == 0 {
		return 1
	}
	if casterHealthRatio > 1 {
		casterHealthRatio = 1
	}
	if casterHealthRatio < 0 {
		casterHealthRatio = 0
	}
	return 1 + p.BerserkerMaxBonusFactor*(1-casterHealthRatio)
}

// HealParams is the heal_aura payload: absolute HP healed per tick (item 11
// Phase 1) plus the caster's flat HP cost per heal tick. Heals roll their
// variance per hit like damage does (decision C1); the self-cost stays
// static by design (predictable build cost).
type HealParams struct {
	HP           float32
	HPPerLevel   float32
	SelfDamageHP float32
	Variance     float32
}

// HPAt is the level-scaled heal center in absolute HP (pre-variance-roll).
func (p *HealParams) HPAt(level int) float32 {
	return Scaled(p.HP, p.HPPerLevel, level)
}

// SelfHealParams is the self_heal payload (cooldown heal on the caster).
// FractionOfMax > 0 heals that fraction of the caster's max HP, overriding
// the flat HealHP (the heal cooldown scales with max HP); the fraction grows
// by FractionOfMaxPerLevel per level (absolute, e.g. 0.20 → 0.25 → 0.30).
type SelfHealParams struct {
	HealHP         float32
	HealHPPerLevel float32

	FractionOfMax         float32
	FractionOfMaxPerLevel float32

	Variance float32
}

// SlowParams is the slow_aura payload: movement-speed reduction applied to
// every slowable target in range (no selector/cap — a slow aura is a zone).
type SlowParams struct {
	Fraction         float32
	FractionPerLevel float32
}

// FractionAt is the level-scaled slow fraction; the apply site clamps it to
// [0, 1].
func (p *SlowParams) FractionAt(level int) float32 {
	return Scaled(p.Fraction, p.FractionPerLevel, level)
}

// ResistParams is the resist_aura / resist_passive payload: tag resistance
// granted to targets (item 11 Phase 2). Factor is the incoming-damage
// multiplier for each covered tag (0.5 = takes half, 0 = immune);
// negative FactorPerLevel = stronger per level. TargetsSelf (resist_aura
// only) also buffs the caster — without consuming a MaxTargets slot.
type ResistParams struct {
	Tags           []string
	Factor         float32
	FactorPerLevel float32
	TargetsSelf    bool
}

// FactorAt is the level-scaled resistance multiplier, floored at 0.
func (p *ResistParams) FactorAt(level int) float32 {
	factor := Scaled(p.Factor, p.FactorPerLevel, level)
	if factor < 0 {
		factor = 0
	}
	return factor
}

// DotParams is the dot_aura / instant_dot payload (effect foundations
// Step 2): a damage-over-time debuff applied to eligible targets. dot_aura
// re-applies it every effect tick (refresh — continuous burn while in
// range); instant_dot applies it once on cooldown activation via a one-shot
// query circle (the instant_damage delivery). Either way the debuff then
// runs on the TARGET, independent of the aura or the caster's presence:
// TickCount damage events of HP each, one every Interval game ticks.
type DotParams struct {
	HP         float32
	HPPerLevel float32

	// Same semantics as DamageParams: tags for resistances (absent →
	// [DamageTagPhysical]) and a per-event variance roll before mitigation.
	Tags     []string
	Variance float32

	TickCount int // number of damage events per application
	Interval  int // game ticks between events
}

// HPAt is the level-scaled per-event damage center in absolute HP
// (pre-variance-roll).
func (p *DotParams) HPAt(level int) float32 {
	return Scaled(p.HP, p.HPPerLevel, level)
}

// DurationTicks is the buff lifetime of one application: long enough for all
// TickCount events at Interval cadence, +1 to survive the tick boundary (the
// aura lifetime convention — aging runs at tick start, acting mid-tick).
func (p *DotParams) DurationTicks() int {
	return p.TickCount*p.Interval + 1
}

// SpawnParams is the spawn payload (effect foundations Step 3 / mob-depth
// chunk 1): a cooldown-fired summon of an owned, caster-aligned mob. Two
// scaling sources compose (chunk-1 decision): the SUMMON SKILL's level scales
// the TTL (and the spawn site equips the summon's loadout at that level);
// the OWNER's player level scales body and output — bonus max HP plus a
// damage/heal power multiplier. Power never touches CC parameters (slow
// fraction/duration ride only the summon's own skill levels).
type SpawnParams struct {
	MobName string

	TTLTicks         int
	TTLTicksPerLevel int

	MaxHealthPerOwnerLevel float32
	PowerPerOwnerLevel     float32
}

// TTLAt is the summon lifetime in ticks at the given SKILL level, floored at 1.
func (p *SpawnParams) TTLAt(level int) int {
	ttl := Scaled(p.TTLTicks, p.TTLTicksPerLevel, level)
	if ttl < 1 {
		ttl = 1
	}
	return ttl
}

// MaxHealthBonusAt is the flat bonus HP granted by the OWNER's player level.
func (p *SpawnParams) MaxHealthBonusAt(ownerLevel int) float32 {
	return Scaled(0, p.MaxHealthPerOwnerLevel, ownerLevel)
}

// PowerAt is the damage/heal output multiplier granted by the OWNER's player
// level (1 = neutral).
func (p *SpawnParams) PowerAt(ownerLevel int) float32 {
	return Scaled(1, p.PowerPerOwnerLevel, ownerLevel)
}

// StatParams is the stat_multiplier payload: an additive bonus to the named
// stat (see validStats — every stat needs a hand-placed application site).
type StatParams struct {
	Name          string
	Bonus         float32
	BonusPerLevel float32
}

// BonusAt is the level-scaled additive stat bonus.
func (p *StatParams) BonusAt(level int) float32 {
	return Scaled(p.Bonus, p.BonusPerLevel, level)
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
	TargetsEnemies   bool     `json:"targetsEnemies"`
	TargetsAllies    bool     `json:"targetsAllies"`
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

	DotTicks        int `json:"dotTicks"`        // damage events per application
	DotTickInterval int `json:"dotTickInterval"` // game ticks between events

	ExecuteBelowFraction    float32 `json:"executeBelowFraction"`
	ExecuteBonusFactor      float32 `json:"executeBonusFactor"`
	BerserkerMaxBonusFactor float32 `json:"berserkerMaxBonusFactor"`
	CritChance              float32 `json:"critChance"`
	CritFactor              float32 `json:"critFactor"`
	LifestealFraction       float32 `json:"lifestealFraction"`

	SpawnMob               string  `json:"spawnMob"`
	TTLTicks               int     `json:"ttlTicks"`
	TTLTicksPerLevel       int     `json:"ttlTicksPerLevel"`
	MaxHealthPerOwnerLevel float32 `json:"maxHealthPerOwnerLevel"`
	PowerPerOwnerLevel     float32 `json:"powerPerOwnerLevel"`

	ThreatMargin float32 `json:"threatMargin"` // taunt: head start above the current top
}

type skillDefinition struct {
	ID       int    `json:"id"`
	Name     string `json:"name"`
	Category string `json:"category"`
	MaxLevel int    `json:"maxLevel"`

	CooldownTicks         int `json:"cooldownTicks"`
	CooldownTicksPerLevel int `json:"cooldownTicksPerLevel"`

	// Kept raw so mapping can hard-fail keys the effect type does not read
	// (see effectKeys).
	Effects []json.RawMessage `json:"effects"`
}

// Shared key groups for the effectKeys allowlist.
var (
	keysGeometry      = []string{"radius", "radiusPerLevel"}
	keysCadence       = []string{"tickInterval", "tickIntervalPerLevel"}
	keysCapped        = []string{"selector", "maxTargets", "maxTargetsPerLevel"}
	keysTargetFlags   = []string{"targetsEnemies", "targetsAllies"}
	// The damage-vocabulary keys (execute/berserker/crit/lifesteal, chunk 1)
	// ride only here — dots are deliberately excluded in v1 (§3.3; add to
	// keysDotPayload + DotParams when content wants a burning execute).
	keysDamagePayload = []string{
		"damageHP", "damageHPPerLevel", "damageTags", "variance", "hitStyle", "targetsStructures", "structureDamageFraction",
		"executeBelowFraction", "executeBonusFactor", "berserkerMaxBonusFactor", "critChance", "critFactor", "lifestealFraction",
	}
	keysResistPayload = []string{"resistTags", "resistFactor", "resistFactorPerLevel"}
	keysDotPayload    = []string{"damageHP", "damageHPPerLevel", "damageTags", "variance", "dotTicks", "dotTickInterval"}
)

// effectKeys lists every JSON key each effect type actually reads (besides
// "type"). Parsing hard-fails on any other key: unknown keys (typos, stale
// renames like the pre-unification "additivePerLevel", which json.Unmarshal
// would silently drop) and known keys on a type whose behavior ignores them
// (silent no-ops otherwise) fail identically. Adding an effect type means
// adding its entry here — no other type's list changes.
var effectKeys = map[EffectType][]string{
	EffectTypeDamageAura: mergeKeys(keysGeometry, keysCadence, keysCapped, keysTargetFlags, keysDamagePayload),
	// No cadence: instant_damage fires on cooldown activation, not per tick.
	EffectTypeInstantDamage: mergeKeys(keysGeometry, keysCapped, keysTargetFlags, keysDamagePayload),
	// No target flags: heal auras target allies implicitly (mob support
	// behaviors lift the player-only capability with roadmap item 7).
	EffectTypeHealAura: mergeKeys(keysGeometry, keysCadence, keysCapped,
		[]string{"healHP", "healHPPerLevel", "selfDamageHP", "variance"}),
	EffectTypeSelfHeal: {"healHP", "healHPPerLevel", "healFractionOfMax", "healFractionOfMaxPerLevel", "variance"},
	// No selector/cap: a slow aura is a zone — it slows everything in range.
	EffectTypeSlowAura: mergeKeys(keysGeometry, keysCadence, keysTargetFlags,
		[]string{"slowFraction", "slowFractionPerLevel"}),
	EffectTypeResistAura: mergeKeys(keysGeometry, keysCadence, keysCapped, keysTargetFlags,
		keysResistPayload, []string{"targetsSelf"}),
	// Equip-time folds into DerivedStats — no geometry, cadence, or targeting.
	EffectTypeResistPassive:  keysResistPayload,
	EffectTypeStatMultiplier: {"stat", "statBonus", "statBonusPerLevel"},
	EffectTypeDotAura:        mergeKeys(keysGeometry, keysCadence, keysCapped, keysTargetFlags, keysDotPayload),
	// No cadence: instant_dot applies once on cooldown activation.
	EffectTypeInstantDot: mergeKeys(keysGeometry, keysCapped, keysTargetFlags, keysDotPayload),
	// No geometry/cadence/targeting: a spawn fires at the caster's position on
	// cooldown activation — placement is the spawn site's business.
	EffectTypeSpawn: {"spawnMob", "ttlTicks", "ttlTicksPerLevel", "maxHealthPerOwnerLevel", "powerPerOwnerLevel"},
	// Threat ops (chunk 7): a query circle (geometry) of enemy mobs; taunt
	// carries a threatMargin, detaunt is a bare single-entry removal.
	EffectTypeTaunt:   mergeKeys(keysGeometry, keysTargetFlags, []string{"threatMargin"}),
	EffectTypeDetaunt: mergeKeys(keysGeometry, keysTargetFlags),
	// Rendering-only (chunk 3): pure geometry — no payload, no targeting, no
	// cadence, no apply path. The radius streams as the wire light_radius.
	EffectTypeLightAura: keysGeometry,
}

func mergeKeys(groups ...[]string) []string {
	var merged []string
	for _, g := range groups {
		merged = append(merged, g...)
	}
	return merged
}

// renamedEffectKeys maps retired JSON keys to a hint naming their successor,
// so a stale key fails with the migration target instead of a bare rejection.
var renamedEffectKeys = map[string]string{
	"targetsMobs":      "targetsEnemies/targetsAllies (faction-relative since effect foundations Step 1)",
	"targetsPlayers":   "targetsEnemies/targetsAllies (faction-relative since effect foundations Step 1)",
	"additivePerLevel": "statBonus/statBonusPerLevel (level-scaling unification)",
	"damageFraction":   "damageHP (absolute HP, item 11 Phase 1)",
	"healFraction":     "healHP (absolute HP, item 11 Phase 1)",
}

// validateEffectKeys hard-fails any JSON key outside the effect type's
// allowlist. Keys are checked in sorted order so the first error is
// deterministic.
func validateEffectKeys(typeName string, effectType EffectType, raw map[string]json.RawMessage) error {
	keys := make([]string, 0, len(raw))
	for k := range raw {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	allowed := effectKeys[effectType]
	for _, k := range keys {
		if k == "type" || slices.Contains(allowed, k) {
			continue
		}
		if hint, ok := renamedEffectKeys[k]; ok {
			return fmt.Errorf("effect %q: field %q was renamed to %s", typeName, k, hint)
		}
		return fmt.Errorf("effect %q: field %q is not valid on this effect type", typeName, k)
	}
	return nil
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
	for _, rawEffect := range s.Effects {
		effect, err := mapEffect(rawEffect)
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

// mapEffect parses one effect object: resolve the type, hard-fail any JSON
// key the type does not read, then build the shared core + the type's payload.
func mapEffect(raw json.RawMessage) (EffectDef, error) {
	var e effectDef
	if err := json.Unmarshal(raw, &e); err != nil {
		return EffectDef{}, err
	}
	effectType, ok := effectTypeMap[e.Type]
	if !ok {
		return EffectDef{}, fmt.Errorf("unknown effect type: %q", e.Type)
	}

	var keys map[string]json.RawMessage
	if err := json.Unmarshal(raw, &keys); err != nil {
		return EffectDef{}, err
	}
	if err := validateEffectKeys(e.Type, effectType, keys); err != nil {
		return EffectDef{}, err
	}

	return e.mapToEffectDef(effectType)
}

// mapToEffectDef builds the public EffectDef: the shared core plus exactly
// one per-type payload.
func (e *effectDef) mapToEffectDef(effectType EffectType) (EffectDef, error) {
	selector, ok := selectorMap[e.Selector]
	if !ok {
		return EffectDef{}, fmt.Errorf("unknown selector: %q", e.Selector)
	}

	tickInterval := 1
	if e.TickInterval != nil && *e.TickInterval > 0 {
		tickInterval = *e.TickInterval
	}

	def := EffectDef{
		Type:                 effectType,
		Radius:               e.Radius,
		RadiusPerLevel:       e.RadiusPerLevel,
		TickInterval:         tickInterval,
		TickIntervalPerLevel: e.TickIntervalPerLevel,
		Selector:             selector,
		MaxTargets:           e.MaxTargets,
		MaxTargetsPerLevel:   e.MaxTargetsPerLevel,
		TargetsEnemies:       e.TargetsEnemies,
		TargetsAllies:        e.TargetsAllies,
		TargetsStructures:    e.TargetsStructures,
	}

	var err error
	switch effectType {
	case EffectTypeDamageAura, EffectTypeInstantDamage:
		def.Damage, err = e.damageParams()
	case EffectTypeHealAura:
		def.Heal, err = e.healParams()
	case EffectTypeSelfHeal:
		def.SelfHeal, err = e.selfHealParams()
	case EffectTypeSlowAura:
		def.Slow = &SlowParams{Fraction: e.SlowFraction, FractionPerLevel: e.SlowFractionPerLevel}
	case EffectTypeResistAura, EffectTypeResistPassive:
		def.Resist, err = e.resistParams()
	case EffectTypeStatMultiplier:
		def.Stat, err = e.statParams()
	case EffectTypeDotAura, EffectTypeInstantDot:
		def.Dot, err = e.dotParams()
	case EffectTypeSpawn:
		def.Spawn, err = e.spawnParams()
	case EffectTypeTaunt:
		def.Threat, err = e.tauntParams()
	case EffectTypeDetaunt:
		def.Threat = &ThreatParams{} // single-entry removal, no margin
	}
	if err != nil {
		return EffectDef{}, err
	}
	return def, nil
}

// damageParams builds the damage payload, normalizing absent tags to
// [DamageTagPhysical] (Phase 2: no "matches nothing" damage).
func (e *effectDef) damageParams() (*DamageParams, error) {
	tags := e.DamageTags
	if len(tags) == 0 {
		tags = []string{DamageTagPhysical}
	} else if err := validateTags("damageTags", tags); err != nil {
		return nil, err
	}

	hitStyle, ok := hitStyleMap[e.HitStyle]
	if !ok {
		return nil, fmt.Errorf("unknown hitStyle: %q", e.HitStyle)
	}
	if err := validateVariance(e.Variance); err != nil {
		return nil, err
	}

	// Damage vocabulary (chunk 1). Execute and crit are authored as pairs — a
	// lone threshold/chance is a silent no-op, a lone factor is unanchored;
	// both hard-fail like the other no-scaling guards.
	if (e.ExecuteBelowFraction != 0) != (e.ExecuteBonusFactor != 0) {
		return nil, fmt.Errorf("execute: executeBelowFraction and executeBonusFactor must be authored together")
	}
	if e.ExecuteBelowFraction < 0 || e.ExecuteBelowFraction > 1 {
		return nil, fmt.Errorf("executeBelowFraction: must be in [0, 1], got %v", e.ExecuteBelowFraction)
	}
	if e.ExecuteBonusFactor < 0 {
		return nil, fmt.Errorf("executeBonusFactor: must be >= 0, got %v", e.ExecuteBonusFactor)
	}
	if e.BerserkerMaxBonusFactor < 0 {
		return nil, fmt.Errorf("berserkerMaxBonusFactor: must be >= 0, got %v", e.BerserkerMaxBonusFactor)
	}
	if (e.CritChance != 0) != (e.CritFactor != 0) {
		return nil, fmt.Errorf("crit: critChance and critFactor must be authored together")
	}
	if e.CritChance < 0 || e.CritChance > 1 {
		return nil, fmt.Errorf("critChance: must be in [0, 1], got %v", e.CritChance)
	}
	if e.CritFactor < 0 {
		return nil, fmt.Errorf("critFactor: must be >= 0, got %v", e.CritFactor)
	}
	if e.LifestealFraction < 0 {
		return nil, fmt.Errorf("lifestealFraction: must be >= 0, got %v", e.LifestealFraction)
	}

	return &DamageParams{
		HP:                      e.DamageHP,
		HPPerLevel:              e.DamageHPPerLevel,
		Tags:                    tags,
		Variance:                e.Variance,
		HitStyle:                hitStyle,
		StructureDamageFraction: e.StructureDamageFraction,
		ExecuteBelowFraction:    e.ExecuteBelowFraction,
		ExecuteBonusFactor:      e.ExecuteBonusFactor,
		BerserkerMaxBonusFactor: e.BerserkerMaxBonusFactor,
		CritChance:              e.CritChance,
		CritFactor:              e.CritFactor,
		LifestealFraction:       e.LifestealFraction,
	}, nil
}

func (e *effectDef) healParams() (*HealParams, error) {
	if err := validateVariance(e.Variance); err != nil {
		return nil, err
	}
	return &HealParams{
		HP:           e.HealHP,
		HPPerLevel:   e.HealHPPerLevel,
		SelfDamageHP: e.SelfDamageHP,
		Variance:     e.Variance,
	}, nil
}

func (e *effectDef) selfHealParams() (*SelfHealParams, error) {
	if err := validateVariance(e.Variance); err != nil {
		return nil, err
	}
	return &SelfHealParams{
		HealHP:                e.HealHP,
		HealHPPerLevel:        e.HealHPPerLevel,
		FractionOfMax:         e.HealFractionOfMax,
		FractionOfMaxPerLevel: e.HealFractionOfMaxPerLevel,
		Variance:              e.Variance,
	}, nil
}

func (e *effectDef) resistParams() (*ResistParams, error) {
	if len(e.ResistTags) == 0 {
		return nil, fmt.Errorf("resistTags: required on resist effects")
	}
	if err := validateTags("resistTags", e.ResistTags); err != nil {
		return nil, err
	}
	if e.ResistFactor < 0 {
		return nil, fmt.Errorf("resistFactor: must be >= 0, got %v", e.ResistFactor)
	}
	return &ResistParams{
		Tags:           e.ResistTags,
		Factor:         e.ResistFactor,
		FactorPerLevel: e.ResistFactorPerLevel,
		TargetsSelf:    e.TargetsSelf,
	}, nil
}

// dotParams builds the dot payload. Tags normalize like damage tags; the
// cadence fields are required — a dot with no events (or no spacing) is
// unauthorable rather than a silent no-op, mirroring the stat guard.
func (e *effectDef) dotParams() (*DotParams, error) {
	tags := e.DamageTags
	if len(tags) == 0 {
		tags = []string{DamageTagPhysical}
	} else if err := validateTags("damageTags", tags); err != nil {
		return nil, err
	}
	if err := validateVariance(e.Variance); err != nil {
		return nil, err
	}
	if e.DamageHP == 0 && e.DamageHPPerLevel == 0 {
		return nil, fmt.Errorf("dot: no damage authored (damageHP and damageHPPerLevel both 0)")
	}
	if e.DotTicks < 1 {
		return nil, fmt.Errorf("dotTicks: must be >= 1, got %v", e.DotTicks)
	}
	if e.DotTickInterval < 1 {
		return nil, fmt.Errorf("dotTickInterval: must be >= 1, got %v", e.DotTickInterval)
	}
	return &DotParams{
		HP:         e.DamageHP,
		HPPerLevel: e.DamageHPPerLevel,
		Tags:       tags,
		Variance:   e.Variance,
		TickCount:  e.DotTicks,
		Interval:   e.DotTickInterval,
	}, nil
}

// spawnParams builds the spawn payload. The mob name resolves against the mob
// registry at boot (mobs load after skills — see mobs.RegistryFromFS); here we
// only reject the unauthorable: no mob, a non-positive base TTL (an instantly
// expiring summon), or negative owner-level scaling (the fields are buffs).
func (e *effectDef) spawnParams() (*SpawnParams, error) {
	if e.SpawnMob == "" {
		return nil, fmt.Errorf("spawn: spawnMob is required")
	}
	if e.TTLTicks < 1 {
		return nil, fmt.Errorf("ttlTicks: must be >= 1, got %v", e.TTLTicks)
	}
	if e.MaxHealthPerOwnerLevel < 0 {
		return nil, fmt.Errorf("maxHealthPerOwnerLevel: must be >= 0, got %v", e.MaxHealthPerOwnerLevel)
	}
	if e.PowerPerOwnerLevel < 0 {
		return nil, fmt.Errorf("powerPerOwnerLevel: must be >= 0, got %v", e.PowerPerOwnerLevel)
	}
	return &SpawnParams{
		MobName:                e.SpawnMob,
		TTLTicks:               e.TTLTicks,
		TTLTicksPerLevel:       e.TTLTicksPerLevel,
		MaxHealthPerOwnerLevel: e.MaxHealthPerOwnerLevel,
		PowerPerOwnerLevel:     e.PowerPerOwnerLevel,
	}, nil
}

// tauntParams builds the taunt payload. Margin must be strictly positive — a
// force-to-top that merely equals the current top loses retention's lower-ID
// tiebreak (the chunk-7 handoff: exceed, don't match), so a zero margin is a
// silent no-op and hard-fails like the other no-scaling guards.
func (e *effectDef) tauntParams() (*ThreatParams, error) {
	if e.ThreatMargin <= 0 {
		return nil, fmt.Errorf("threatMargin: must be > 0, got %v", e.ThreatMargin)
	}
	return &ThreatParams{Margin: e.ThreatMargin}, nil
}

func (e *effectDef) statParams() (*StatParams, error) {
	if !validStats[e.Stat] {
		return nil, fmt.Errorf("stat_multiplier: unknown stat %q", e.Stat)
	}
	// A both-zero stat_multiplier does nothing — hard-fail rather than load a
	// do-nothing passive.
	if e.StatBonus == 0 && e.StatBonusPerLevel == 0 {
		return nil, fmt.Errorf("stat_multiplier: no scaling authored (statBonus and statBonusPerLevel both 0)")
	}
	return &StatParams{
		Name:          e.Stat,
		Bonus:         e.StatBonus,
		BonusPerLevel: e.StatBonusPerLevel,
	}, nil
}

// validateTags rejects empty and duplicate tag entries (shared by damageTags
// and resistTags).
func validateTags(field string, tags []string) error {
	seen := make(map[string]bool, len(tags))
	for _, tag := range tags {
		if tag == "" {
			return fmt.Errorf("%s: empty tag", field)
		}
		if seen[tag] {
			return fmt.Errorf("%s: duplicate tag %q", field, tag)
		}
		seen[tag] = true
	}
	return nil
}

// validateVariance bounds the per-hit variance band (item 11 Phase 3):
// v >= 1 would allow a zero-or-negative roll.
func validateVariance(v float32) error {
	if v < 0 || v >= 1 {
		return fmt.Errorf("variance: must be in [0, 1), got %v", v)
	}
	return nil
}
