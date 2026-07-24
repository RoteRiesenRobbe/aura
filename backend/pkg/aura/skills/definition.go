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
	EffectTypeShieldAura
	EffectTypeInstantShield
	EffectTypeRecall
	EffectTypeHotAura
	EffectTypeInstantHot
	EffectTypeRevive
	EffectTypeDash
	EffectTypeTickRate
)

// HasVisibleTickCadence reports whether an active-aura effect produces a
// periodic on-ring HIT worth drawing a tick indicator for (skill-vocab chunk
// 6). Only the four output auras qualify: damage/heal land a visible event each
// tick, and dot/hot re-apply on their authored cadence. State + visual effects
// (slow, resist, light) re-apply too — often at interval 1 — but show no
// per-tick hit, so an indicator would just strobe; those report the wire 0 (no
// indicator) instead.
func HasVisibleTickCadence(t EffectType) bool {
	switch t {
	case EffectTypeDamageAura, EffectTypeHealAura, EffectTypeDotAura, EffectTypeHotAura:
		return true
	default:
		return false
	}
}

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
	"shield_aura":     EffectTypeShieldAura,
	"instant_shield":  EffectTypeInstantShield,
	"recall":          EffectTypeRecall,
	"hot_aura":        EffectTypeHotAura,
	"instant_hot":     EffectTypeInstantHot,
	"revive":          EffectTypeRevive,
	"dash":            EffectTypeDash,
	"tick_rate":       EffectTypeTickRate,
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
	StatCritChance      = "critChance"      // applied in sys.rollHitDamage (§4.3 amendment, backlog §23)
	StatDamageDealt     = "damageDealt"     // applied at sys' outgoing-damage base sites (Strong, triage 2026-07-21)
)

var validStats = map[string]bool{
	StatMovementSpeed:   true,
	StatMaxHealth:       true,
	StatDamageReduction: true,
	StatCritChance:      true,
	StatDamageDealt:     true,
}

// EffectDef holds the parameters of one effect within a skill: the shared
// core (geometry, cadence, targeting) plus exactly ONE per-type payload —
// the pointer matching Type is non-nil, every other one nil. Parsing
// enforces the invariant and hard-fails any JSON key the effect type does
// not read (see effectKeys); code constructing an EffectDef directly (tests)
// must uphold it too.
// The json tags on EffectDef, SkillDefinition, and the payload structs are
// the skill-catalog wire shape (GET /skills, plan-ui-polish chunk 1). They
// live on the real structs — not a DTO — so a new field can't silently miss
// the catalog: an untagged field still marshals (under its Go name), it just
// looks off, which is a review-visible smell instead of missing data.
type EffectDef struct {
	Type EffectType `json:"type"`

	// Geometry: effect radius — the aura sensor size, or the one-shot query
	// circle of an instant_damage burst.
	Radius         float32 `json:"radius"`
	RadiusPerLevel float32 `json:"radiusPerLevel"`

	// Cadence: every how many ticks an active-aura effect fires. Always >= 1
	// after parsing (absent → 1); negative PerLevel = faster at higher
	// levels, effective interval floored at 1. Not valid on cooldown-fired
	// or equip-time effects — they have no tick cadence.
	TickInterval         int `json:"tickInterval"`
	TickIntervalPerLevel int `json:"tickIntervalPerLevel"`

	// Targeting: Selector orders candidates when MaxTargets caps the set
	// (0 = uncapped AoE-all); the flags gate RELATIVE to the caster's faction
	// (plan-effect-foundations F8/Step 1) — same faction by TargetsAllies,
	// other faction by TargetsEnemies — so the same skill retargets correctly
	// when its caster's faction differs or flips (mob loadouts, future charm/
	// summons). Placeables have no faction; damage effects reach them via
	// TargetsStructures only. Flags also drive the sensor/query masks.
	Selector           Selector `json:"selector"`
	MaxTargets         int      `json:"maxTargets"`
	MaxTargetsPerLevel int      `json:"maxTargetsPerLevel"`
	TargetsEnemies     bool     `json:"targetsEnemies"`
	TargetsAllies      bool     `json:"targetsAllies"`
	TargetsStructures  bool     `json:"targetsStructures"`

	// Per-type payloads — exactly one non-nil, matching Type.
	Damage   *DamageParams   `json:"damage,omitempty"`   // damage_aura, instant_damage
	Heal     *HealParams     `json:"heal,omitempty"`     // heal_aura
	SelfHeal *SelfHealParams `json:"selfHeal,omitempty"` // self_heal
	Slow     *SlowParams     `json:"slow,omitempty"`     // slow_aura
	Resist   *ResistParams   `json:"resist,omitempty"`   // resist_aura, resist_passive
	Stat     *StatParams     `json:"stat,omitempty"`     // stat_multiplier
	Dot      *DotParams      `json:"dot,omitempty"`      // dot_aura, instant_dot
	Spawn    *SpawnParams    `json:"spawn,omitempty"`    // spawn
	Threat   *ThreatParams   `json:"threat,omitempty"`   // taunt, detaunt
	Shield   *ShieldParams   `json:"shield,omitempty"`   // shield_aura, instant_shield
	Hot      *HotParams      `json:"hot,omitempty"`      // hot_aura, instant_hot
	Revive   *ReviveParams   `json:"revive,omitempty"`   // revive
	Dash     *DashParams     `json:"dash,omitempty"`     // dash
	TickRate *TickRateParams `json:"tickRate,omitempty"` // tick_rate
}

// ThreatParams is the taunt / detaunt payload (mob-depth chunk 7). Margin is
// the head start a taunt sets above the mob's current max threat (force-to-top,
// decided v1); detaunt is a single-entry removal and ignores it.
type ThreatParams struct {
	Margin float32 `json:"margin"`
}

// DamageParams is the damage_aura / instant_damage payload: absolute HP
// dealt per hit (item 11 Phase 1).
type DamageParams struct {
	HP         float32 `json:"hp"`
	HPPerLevel float32 `json:"hpPerLevel"`

	// Damage tags for resistances (item 11 Phase 2). Arbitrary strings by
	// design (bespoke tags like "boss_x_lava" compose with general ones like
	// "fire"). Always non-empty after parsing: absent → [DamageTagPhysical].
	Tags []string `json:"tags"`

	// Gated flips the resist default for this payload's tags (content pass
	// C1, GDD §5 chore gate): the hit only damages targets whose BASE
	// resistances explicitly name one of Tags (skills.GateOpensFor) — every
	// unauthored target is immune instead of unresisted. Requires explicit
	// damageTags (gating the [physical] default hard-fails at parse). This
	// is what makes Harvest pop turnips and nothing else without every
	// combat mob authoring a "harvest": 0 entry.
	Gated bool `json:"gated"`

	// Per-hit percentage variance band (item 11 Phase 3): each hit rolls
	// uniform in [center×(1−v), center×(1+v)] around the level-scaled
	// amount. 0 = static (the default); valid range 0 <= v < 1. The roll
	// happens before the target's mitigation (decision C3).
	Variance float32 `json:"variance"`

	// Per-effect aura-hit VFX override (item 11 Step 4). HitStyleAuto
	// (default) derives the style from the tick cadence.
	HitStyle HitStyle `json:"hitStyle"`

	// Mob casters only: damage dealt to structures (placeables) per tick.
	// Structures read this via MobTouches double dispatch.
	StructureDamageFraction float32 `json:"structureDamageFraction"`

	// Damage vocabulary (plan-skill-vocab chunk 1) — all optional (F2), zero =
	// inert. Composition order is F6 §3.1: base × berserker × execute × crit,
	// then the variance roll, then the target's mitigation.
	//
	// Execute: hits on targets whose health ratio is strictly below
	// ExecuteBelowFraction are multiplied by ExecuteBonusFactor. Deterministic,
	// per target, evaluated at hit time. Authored as a pair.
	ExecuteBelowFraction float32 `json:"executeBelowFraction"`
	ExecuteBonusFactor   float32 `json:"executeBonusFactor"`

	// Berserker: outgoing damage × (1 + max × (1 − casterHealthRatio)) — the
	// caster's missing HP scales the whole application. The acting entity's own
	// HP counts (a summon rages on ITS wounds, not the owner's; §4.2 parallel).
	BerserkerMaxBonusFactor float32 `json:"berserkerMaxBonusFactor"`

	// Crit: the ONE sanctioned, upside-only combat RNG (§4.3 decided
	// 2026-07-13; v2 PO 2026-07-20): each hit rolls the effect's (level-scaled)
	// authored chance PLUS the acting caster's own crit chance (character base
	// + critChance stat), after execute/berserker and before variance. A crit
	// multiplies by CritFactor, or the global default factor when none is
	// authored (sys.defaultCritFactor). Crit-flagged damage lands on the
	// target's crit_taken wire accumulator. Chance may be authored alone;
	// a factor needs an authored chance source.
	CritChance         float32 `json:"critChance"`
	CritChancePerLevel float32 `json:"critChancePerLevel"`
	CritFactor         float32 `json:"critFactor"`

	// Lifesteal: the hit's recipient (the living Source, else the toucher)
	// heals LifestealFraction × damage DEALT — shield-absorbed included,
	// overkill excluded (F6 §3.1/9).
	LifestealFraction float32 `json:"lifestealFraction"`
}

// HPAt is the level-scaled damage center in absolute HP (pre-variance-roll).
func (p *DamageParams) HPAt(level int) float32 {
	return Scaled(p.HP, p.HPPerLevel, level)
}

// CritChanceAt is the effect's authored crit chance at a skill level
// (base + (L−1)×perLevel), before the caster's own chance adds on top
// (§4.3 v2).
func (p *DamageParams) CritChanceAt(level int) float32 {
	return Scaled(p.CritChance, p.CritChancePerLevel, level)
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
// Phase 1) plus the caster's HP cost per heal tick. Heals roll their variance
// per hit like damage does (decision C1). The self-cost scales per level via
// SelfDamageHPPerLevel (triage item 2): authored negative it falls with level
// (leveling makes the aura cheaper, never stronger), clamped at 0. FractionOfMax
// (triage item 13) is the percent-of-max heal used by the campfire: > 0 heals
// that fraction of the TARGET's max HP instead of the flat HP (mutually
// exclusive with HP), so a campfire restores the same share of every pool.
type HealParams struct {
	HP                   float32 `json:"hp"`
	HPPerLevel           float32 `json:"hpPerLevel"`
	SelfDamageHP         float32 `json:"selfDamageHp"`
	SelfDamageHPPerLevel float32 `json:"selfDamageHpPerLevel"`

	FractionOfMax         float32 `json:"fractionOfMax"`
	FractionOfMaxPerLevel float32 `json:"fractionOfMaxPerLevel"`

	Variance float32 `json:"variance"`
}

// HPAt is the level-scaled heal center in absolute HP (pre-variance-roll).
func (p *HealParams) HPAt(level int) float32 {
	return Scaled(p.HP, p.HPPerLevel, level)
}

// SelfDamageAt is the level-scaled self-cost in absolute HP (triage item 2).
// SelfDamageHPPerLevel is authored negative to make the aura cheaper per level;
// the cost is clamped at 0 so an over-generous curve never heals the caster.
func (p *HealParams) SelfDamageAt(level int) float32 {
	cost := Scaled(p.SelfDamageHP, p.SelfDamageHPPerLevel, level)
	if cost < 0 {
		cost = 0
	}
	return cost
}

// FractionAt is the level-scaled percent-of-max heal fraction (triage item 13);
// 0 when unset. The apply site multiplies it by the target's max HP.
func (p *HealParams) FractionAt(level int) float32 {
	return Scaled(p.FractionOfMax, p.FractionOfMaxPerLevel, level)
}

// SelfHealParams is the self_heal payload (cooldown heal on the caster).
// FractionOfMax > 0 heals that fraction of the caster's max HP, overriding
// the flat HealHP (the heal cooldown scales with max HP); the fraction grows
// by FractionOfMaxPerLevel per level (absolute, e.g. 0.20 → 0.25 → 0.30).
type SelfHealParams struct {
	HealHP         float32 `json:"healHp"`
	HealHPPerLevel float32 `json:"healHpPerLevel"`

	FractionOfMax         float32 `json:"fractionOfMax"`
	FractionOfMaxPerLevel float32 `json:"fractionOfMaxPerLevel"`

	Variance float32 `json:"variance"`
}

// SlowParams is the slow_aura payload: movement-speed reduction applied to
// every slowable target in range (no selector/cap — a slow aura is a zone).
type SlowParams struct {
	Fraction         float32 `json:"fraction"`
	FractionPerLevel float32 `json:"fractionPerLevel"`
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
	Tags           []string `json:"tags"`
	Factor         float32  `json:"factor"`
	FactorPerLevel float32  `json:"factorPerLevel"`
	TargetsSelf    bool     `json:"targetsSelf"`
}

// FactorAt is the level-scaled resistance multiplier, floored at 0.
func (p *ResistParams) FactorAt(level int) float32 {
	factor := Scaled(p.Factor, p.FactorPerLevel, level)
	if factor < 0 {
		factor = 0
	}
	return factor
}

// ShieldParams is the shield_aura / instant_shield payload (plan-skill-vocab
// chunk 2): an absorb pool granted to eligible targets, drained by incoming
// post-mitigation damage before HP. shield_aura re-applies it every effect
// tick (lifetime interval + 1, the aura convention — a top-up while in
// range); instant_shield applies it once on cooldown activation with its own
// DurationTicks lifetime. TargetsSelf also buffs the caster — without
// consuming a MaxTargets slot (the resist_aura convention).
type ShieldParams struct {
	HP            float32 `json:"hp"`
	HPPerLevel    float32 `json:"hpPerLevel"`
	DurationTicks int     `json:"durationTicks"` // instant_shield only; 0 on shield_aura
	TargetsSelf   bool    `json:"targetsSelf"`
}

// HPAt is the level-scaled absorb pool size, floored at 0.
func (p *ShieldParams) HPAt(level int) float32 {
	hp := Scaled(p.HP, p.HPPerLevel, level)
	if hp < 0 {
		hp = 0
	}
	return hp
}

// DotParams is the dot_aura / instant_dot payload (effect foundations
// Step 2): a damage-over-time debuff applied to eligible targets. dot_aura
// re-applies it every effect tick (refresh — continuous burn while in
// range); instant_dot applies it once on cooldown activation via a one-shot
// query circle (the instant_damage delivery). Either way the debuff then
// runs on the TARGET, independent of the aura or the caster's presence:
// TickCount damage events of HP each, one every Interval game ticks.
type DotParams struct {
	HP         float32 `json:"hp"`
	HPPerLevel float32 `json:"hpPerLevel"`

	// Same semantics as DamageParams: tags for resistances (absent →
	// [DamageTagPhysical]) and a per-event variance roll before mitigation.
	Tags     []string `json:"tags"`
	Variance float32  `json:"variance"`

	TickCount int `json:"tickCount"` // number of damage events per application
	Interval  int `json:"interval"`  // game ticks between events
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

// HotParams is the hot_aura / instant_hot payload (plan-skill-vocab chunk 3):
// the DotParams twin, but restoring HP instead of dealing it and carrying no
// damage tags (heals are not mitigated). hot_aura re-applies it every effect
// tick to wounded allies in range — the buff's own duration outlasts the aura
// cadence, so it keeps healing after the target leaves range (case 1). The
// instant_hot cooldown applies it once to the caster (TargetsSelf) and/or
// allies in range (TargetsAllies) — cases 2 and 3.
type HotParams struct {
	HP         float32 `json:"hp"`
	HPPerLevel float32 `json:"hpPerLevel"`

	Variance float32 `json:"variance"`

	TickCount int `json:"tickCount"` // number of heal events per application
	Interval  int `json:"interval"`  // game ticks between events

	TargetsSelf bool `json:"targetsSelf"` // instant_hot: also heals the caster (aura form is allies-implicit)
}

// HPAt is the level-scaled per-event heal center in absolute HP
// (pre-variance-roll).
func (p *HotParams) HPAt(level int) float32 {
	return Scaled(p.HP, p.HPPerLevel, level)
}

// DurationTicks is the buff lifetime of one application (the DotParams rule).
func (p *HotParams) DurationTicks() int {
	return p.TickCount*p.Interval + 1
}

// ReviveParams is the revive payload (plan-skill-vocab §3.6): a cooldown-fired
// query circle (Radius/RadiusPerLevel on the effect) that collects the nearest
// player corpse and rebuilds its owner at the corpse with HealthFraction of max
// HP. No target flags — corpses sit on the Viewport layer, reached by a
// dedicated mask.
type ReviveParams struct {
	HealthFraction float32 `json:"healthFraction"`
}

// DashParams is the dash payload (plan-skill-vocab §3.8). Direction was decided
// at chunk-5 start to be the caster's last movement vector, superseding the
// doc's original "facing direction" — Aura characters are non-turning icons
// with no facing/camera rotation, so the movement vector (current if pressed,
// else the last recorded one) is the only aim available. Distance is the
// world-unit displacement (scaled per level); the actual travel is clamped by a
// stepped static-collision probe so a dash never tunnels a blocking prop or the
// border.
type DashParams struct {
	Distance         float32 `json:"distance"`
	DistancePerLevel float32 `json:"distancePerLevel"`
}

// TickRateParams is the tick_rate payload (plan-skill-vocab chunk 6): a
// cooldown-fired, self-targeted haste / tick-slow. Factor scales the caster's
// OWN aura cadence for DurationTicks game ticks — < 1 hastes, > 1 slows. The
// buff composes multiplicatively with any other tick_rate source and is floored
// at 1 tick at EffectiveTickInterval. Self-only: no target flags, no radius.
type TickRateParams struct {
	Factor        float32 `json:"factor"`
	DurationTicks int     `json:"durationTicks"`
}

// SpawnParams is the spawn payload (effect foundations Step 3 / mob-depth
// chunk 1): a cooldown-fired summon of an owned, caster-aligned mob. Two
// scaling sources compose (chunk-1 decision): the SUMMON SKILL's level scales
// the TTL (and the spawn site equips the summon's loadout at that level);
// the OWNER's player level scales body and output — bonus max HP plus a
// damage/heal power multiplier. Power never touches CC parameters (slow
// fraction/duration ride only the summon's own skill levels).
type SpawnParams struct {
	MobName string `json:"mobName"`

	TTLTicks         int `json:"ttlTicks"`
	TTLTicksPerLevel int `json:"ttlTicksPerLevel"`

	MaxHealthPerOwnerLevel float32 `json:"maxHealthPerOwnerLevel"`
	PowerPerOwnerLevel     float32 `json:"powerPerOwnerLevel"`
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
	Name          string  `json:"name"`
	Bonus         float32 `json:"bonus"`
	BonusPerLevel float32 `json:"bonusPerLevel"`
}

// BonusAt is the level-scaled additive stat bonus.
func (p *StatParams) BonusAt(level int) float32 {
	return Scaled(p.Bonus, p.BonusPerLevel, level)
}

type SkillDefinition struct {
	ID   SkillID `json:"id"`
	Name string  `json:"name"`

	// DisplayName is the human-facing name shown in the client (spellbook,
	// tooltips, banners): the optional authored `displayName` JSON override,
	// else derived from Name by CamelCase→spaces (plan-ui-polish chunk 1).
	// Always non-empty after parsing.
	DisplayName string `json:"displayName"`

	Category SkillCategory `json:"category"`
	MaxLevel int           `json:"maxLevel"`

	// Legacy marks proving-grounds-only content (step-7 A.5): kept for the
	// legacy zone, sim presets and tests, but never referenced by the live
	// world — loaders warn when live content points at a legacy def.
	Legacy bool `json:"legacy"`

	// Zero for non-cooldown skills.
	CooldownTicks         int `json:"cooldownTicks"`
	CooldownTicksPerLevel int `json:"cooldownTicksPerLevel"`

	// Cast time (plan-skill-vocab chunk 4): ticks the activation winds up
	// before the skill fires and the cooldown is consumed. 0 (the default) =
	// today's instant behavior. Deliberate acts (movement, aura switch,
	// another cooldown) always cancel a cast; damage cancels ONLY when
	// CastInterruptedByDamage is set — casts are combat vocabulary, the
	// damage-interrupt is Recall-style opt-in (chunk-4 start decision).
	// NOTE: the mob fire path ignores cast time — mobs never author castTicks;
	// hard-fail is cheap to add when a boss wants telegraphed casts.
	CastTicks               int  `json:"castTicks"`
	CastTicksPerLevel       int  `json:"castTicksPerLevel"`
	CastInterruptedByDamage bool `json:"castInterruptedByDamage"`

	Effects []EffectDef `json:"effects"`
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
	GatedDamageTags  bool     `json:"gatedDamageTags"`

	Variance float32 `json:"variance"` // 0 = static; only on damage/heal amounts

	Selector           string `json:"selector"`
	MaxTargets         int    `json:"maxTargets"`
	MaxTargetsPerLevel int    `json:"maxTargetsPerLevel"`

	StructureDamageFraction float32 `json:"structureDamageFraction"`
	TargetsStructures       bool    `json:"targetsStructures"`

	HealHP               float32 `json:"healHP"`
	HealHPPerLevel       float32 `json:"healHPPerLevel"`
	SelfDamageHP         float32 `json:"selfDamageHP"`
	SelfDamageHPPerLevel float32 `json:"selfDamageHPPerLevel"`

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
	CritChancePerLevel      float32 `json:"critChancePerLevel"`
	CritFactor              float32 `json:"critFactor"`
	LifestealFraction       float32 `json:"lifestealFraction"`

	SpawnMob               string  `json:"spawnMob"`
	TTLTicks               int     `json:"ttlTicks"`
	TTLTicksPerLevel       int     `json:"ttlTicksPerLevel"`
	MaxHealthPerOwnerLevel float32 `json:"maxHealthPerOwnerLevel"`
	PowerPerOwnerLevel     float32 `json:"powerPerOwnerLevel"`

	ThreatMargin float32 `json:"threatMargin"` // taunt: head start above the current top

	ShieldHP            float32 `json:"shieldHP"`
	ShieldHPPerLevel    float32 `json:"shieldHPPerLevel"`
	ShieldDurationTicks int     `json:"shieldDurationTicks"` // instant_shield only

	HotTicks        int `json:"hotTicks"`        // heal events per hot application
	HotTickInterval int `json:"hotTickInterval"` // game ticks between hot events

	ReviveHealthFraction float32 `json:"reviveHealthFraction"` // revive: fraction of max HP restored

	DashDistance         float32 `json:"dashDistance"`         // dash: world-unit displacement
	DashDistancePerLevel float32 `json:"dashDistancePerLevel"` // dash: displacement added per level

	TickRateFactor        float32 `json:"tickRateFactor"`        // tick_rate: cadence multiplier (<1 haste, >1 slow)
	TickRateDurationTicks int     `json:"tickRateDurationTicks"` // tick_rate: buff lifetime in game ticks
}

type skillDefinition struct {
	ID          int    `json:"id"`
	Name        string `json:"name"`
	DisplayName string `json:"displayName"` // absent → derived CamelCase→spaces
	Category    string `json:"category"`
	MaxLevel    int    `json:"maxLevel"`
	Legacy      bool   `json:"legacy"` // absent → live content (step-7 A.5)

	CooldownTicks         int `json:"cooldownTicks"`
	CooldownTicksPerLevel int `json:"cooldownTicksPerLevel"`

	CastTicks               int  `json:"castTicks"`
	CastTicksPerLevel       int  `json:"castTicksPerLevel"`
	CastInterruptedByDamage bool `json:"castInterruptedByDamage"`

	// Kept raw so mapping can hard-fail keys the effect type does not read
	// (see effectKeys).
	Effects []json.RawMessage `json:"effects"`
}

// Shared key groups for the effectKeys allowlist.
var (
	keysGeometry    = []string{"radius", "radiusPerLevel"}
	keysCadence     = []string{"tickInterval", "tickIntervalPerLevel"}
	keysCapped      = []string{"selector", "maxTargets", "maxTargetsPerLevel"}
	keysTargetFlags = []string{"targetsEnemies", "targetsAllies"}
	// The damage-vocabulary keys (execute/berserker/crit/lifesteal, chunk 1)
	// ride only here — dots are deliberately excluded in v1 (§3.3; add to
	// keysDotPayload + DotParams when content wants a burning execute).
	keysDamagePayload = []string{
		"damageHP", "damageHPPerLevel", "damageTags", "gatedDamageTags", "variance", "hitStyle", "targetsStructures", "structureDamageFraction",
		"executeBelowFraction", "executeBonusFactor", "berserkerMaxBonusFactor", "critChance", "critChancePerLevel", "critFactor", "lifestealFraction",
	}
	keysResistPayload = []string{"resistTags", "resistFactor", "resistFactorPerLevel"}
	keysDotPayload    = []string{"damageHP", "damageHPPerLevel", "damageTags", "variance", "dotTicks", "dotTickInterval"}
	keysShieldPayload = []string{"shieldHP", "shieldHPPerLevel"}
	// Hot reuses the heal HP/variance keys (heal HP is heal HP) plus its own
	// cadence, the dot twin (plan-skill-vocab chunk 3).
	keysHotPayload = []string{"healHP", "healHPPerLevel", "variance", "hotTicks", "hotTickInterval"}
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
		[]string{"healHP", "healHPPerLevel", "selfDamageHP", "selfDamageHPPerLevel",
			"healFractionOfMax", "healFractionOfMaxPerLevel", "variance"}),
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
	// Shield pair (chunk 2), mirroring resist_aura's shape. The aura form
	// derives its buff lifetime from the cadence (interval + 1); only the
	// instant form carries an authored shieldDurationTicks.
	EffectTypeShieldAura: mergeKeys(keysGeometry, keysCadence, keysCapped, keysTargetFlags,
		keysShieldPayload, []string{"targetsSelf"}),
	EffectTypeInstantShield: mergeKeys(keysGeometry, keysCapped, keysTargetFlags,
		keysShieldPayload, []string{"shieldDurationTicks", "targetsSelf"}),
	// Recall (chunk 4): no payload at all — the destination is the caster's
	// campfire anchor (ConnectionStateSystem), the cast time is a skill-def
	// field. Any key beyond "type" hard-fails.
	EffectTypeRecall: {},
	// Hot pair (chunk 3), mirroring the shield pair's shape. The aura form is
	// allies-implicit (no target flags, like heal_aura) and derives its
	// re-apply cadence from keysCadence; the instant form carries the target
	// flags + targetsSelf like instant_shield. Both author the buff's own
	// heal cadence (hotTicks/hotTickInterval).
	EffectTypeHotAura: mergeKeys(keysGeometry, keysCadence, keysCapped, keysHotPayload),
	EffectTypeInstantHot: mergeKeys(keysGeometry, keysCapped, keysTargetFlags,
		keysHotPayload, []string{"targetsSelf"}),
	// Revive (chunk 3): a query circle (geometry) of player corpses + the
	// fraction of max HP the revived player returns with. Corpses carry no
	// faction, so no target flags.
	EffectTypeRevive: mergeKeys(keysGeometry, []string{"reviveHealthFraction"}),
	// Dash (chunk 5): a bare displacement — no geometry (the collision query is
	// a stepped probe, not an authored radius), no targeting, no cadence.
	// Distance is the only payload; direction is the caster's movement vector,
	// read at fire time.
	EffectTypeDash: {"dashDistance", "dashDistancePerLevel"},
	// Tick-rate (chunk 6): a self-targeted haste / tick-slow — a bare scalar
	// factor plus a lifetime. No geometry, no targeting, no cadence (it MODIFIES
	// cadence rather than having one).
	EffectTypeTickRate: {"tickRateFactor", "tickRateDurationTicks"},
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

	if s.CastTicks < 0 {
		return nil, fmt.Errorf("skill %q: castTicks must be >= 0, got %v", s.Name, s.CastTicks)
	}
	// The flag on an instant skill would silently never apply — hard-fail
	// like the no-scaling guards.
	if s.CastInterruptedByDamage && s.CastTicks == 0 {
		return nil, fmt.Errorf("skill %q: castInterruptedByDamage requires castTicks > 0", s.Name)
	}

	effects := make([]EffectDef, 0, len(s.Effects))
	for _, rawEffect := range s.Effects {
		effect, err := mapEffect(rawEffect)
		if err != nil {
			return nil, fmt.Errorf("skill %q: %w", s.Name, err)
		}
		effects = append(effects, effect)
	}

	displayName := s.DisplayName
	if displayName == "" {
		displayName = DeriveDisplayName(s.Name)
	}

	return &SkillDefinition{
		ID:                      SkillID(s.ID),
		Name:                    s.Name,
		DisplayName:             displayName,
		Category:                category,
		MaxLevel:                s.MaxLevel,
		Legacy:                  s.Legacy,
		CooldownTicks:           s.CooldownTicks,
		CooldownTicksPerLevel:   s.CooldownTicksPerLevel,
		CastTicks:               s.CastTicks,
		CastTicksPerLevel:       s.CastTicksPerLevel,
		CastInterruptedByDamage: s.CastInterruptedByDamage,
		Effects:                 effects,
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
	case EffectTypeShieldAura, EffectTypeInstantShield:
		def.Shield, err = e.shieldParams(effectType)
	case EffectTypeHotAura, EffectTypeInstantHot:
		def.Hot, err = e.hotParams()
	case EffectTypeRevive:
		def.Revive, err = e.reviveParams()
	case EffectTypeDash:
		def.Dash, err = e.dashParams()
	case EffectTypeTickRate:
		def.TickRate, err = e.tickRateParams()
	case EffectTypeLightAura, EffectTypeRecall:
		// Payload-less by design: light_aura is pure geometry (its radius
		// streams as the wire light_radius) and recall's destination is the
		// caster's campfire anchor. Both intentionally leave every payload nil.
	default:
		// A type in effectTypeMap but absent from this switch would parse into
		// an EffectDef with every payload nil — the exact invariant the struct
		// doc-comment says parsing enforces, silently violated. Hard-fail so a
		// new EffectType can't ship a nil-payload no-op (§27.3.1).
		return EffectDef{}, fmt.Errorf("effect type %v has no payload mapping", effectType)
	}
	if err != nil {
		return EffectDef{}, err
	}

	// Geometry types sense through a radius — a zero-radius aura reaches
	// nothing, a silent no-op the per-payload guards above don't catch. Gate
	// on the allowlist so only radius-reading types are checked (passives,
	// spawns, dashes, recall carry no geometry). Placed after the switch so a
	// more specific payload error wins (§27.3.2).
	if slices.Contains(effectKeys[effectType], "radius") && def.Radius <= 0 {
		return EffectDef{}, fmt.Errorf("effect type %v: radius must be > 0 (an aura with no radius reaches nothing)", effectType)
	}

	return def, nil
}

// damageParams builds the damage payload, normalizing absent tags to
// [DamageTagPhysical] (Phase 2: no "matches nothing" damage).
func (e *effectDef) damageParams() (*DamageParams, error) {
	tags := e.DamageTags
	if len(tags) == 0 {
		// Gating the implicit [physical] default would silently damage
		// nothing that doesn't author "physical" — require the tags spelled
		// out (content pass C1).
		if e.GatedDamageTags {
			return nil, fmt.Errorf("gatedDamageTags: requires explicit damageTags")
		}
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

	// A damage effect with no direct damage AND no structure damage does
	// nothing — hard-fail like the dot/shield no-scaling guards. A siege aura
	// (0 direct HP but a structureDamageFraction > 0) stays valid: it still
	// damages placeables (§27.3.2).
	if e.DamageHP == 0 && e.DamageHPPerLevel == 0 && e.StructureDamageFraction == 0 {
		return nil, fmt.Errorf("damage: no damage authored (damageHP, damageHPPerLevel, structureDamageFraction all 0)")
	}

	// Damage vocabulary (chunk 1). Execute is authored as a pair — a lone
	// threshold is a silent no-op, a lone factor is unanchored; both hard-fail
	// like the other no-scaling guards.
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
	// Crit v2 (§4.3 amendment, PO 2026-07-20): chance may be authored alone —
	// it adds to the caster's own crit chance and rolls at the global default
	// factor. A factor with no authored chance source stays invalid.
	if e.CritFactor != 0 && e.CritChance == 0 && e.CritChancePerLevel == 0 {
		return nil, fmt.Errorf("crit: critFactor requires an authored critChance or critChancePerLevel")
	}
	if e.CritChance < 0 || e.CritChance > 1 {
		return nil, fmt.Errorf("critChance: must be in [0, 1], got %v", e.CritChance)
	}
	if e.CritChancePerLevel < 0 {
		return nil, fmt.Errorf("critChancePerLevel: must be >= 0, got %v", e.CritChancePerLevel)
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
		Gated:                   e.GatedDamageTags,
		Variance:                e.Variance,
		HitStyle:                hitStyle,
		StructureDamageFraction: e.StructureDamageFraction,
		ExecuteBelowFraction:    e.ExecuteBelowFraction,
		ExecuteBonusFactor:      e.ExecuteBonusFactor,
		BerserkerMaxBonusFactor: e.BerserkerMaxBonusFactor,
		CritChance:              e.CritChance,
		CritChancePerLevel:      e.CritChancePerLevel,
		CritFactor:              e.CritFactor,
		LifestealFraction:       e.LifestealFraction,
	}, nil
}

func (e *effectDef) healParams() (*HealParams, error) {
	if err := validateVariance(e.Variance); err != nil {
		return nil, err
	}
	// Flat HP and percent-of-max are mutually exclusive (triage item 13): a heal
	// tick is one or the other, never both. Keeps the apply-site branch total.
	if e.HealFractionOfMax > 0 && e.HealHP > 0 {
		return nil, fmt.Errorf("heal_aura: healHP and healFractionOfMax are mutually exclusive (flat XOR percent-of-max)")
	}
	// A heal that restores nothing (no flat HP, no percent-of-max) is a silent
	// no-op — hard-fail like the hot guard (§27.3.2).
	if e.HealHP == 0 && e.HealHPPerLevel == 0 && e.HealFractionOfMax == 0 && e.HealFractionOfMaxPerLevel == 0 {
		return nil, fmt.Errorf("heal_aura: no heal authored (healHP, healHPPerLevel, healFractionOfMax, healFractionOfMaxPerLevel all 0)")
	}
	return &HealParams{
		HP:                    e.HealHP,
		HPPerLevel:            e.HealHPPerLevel,
		SelfDamageHP:          e.SelfDamageHP,
		SelfDamageHPPerLevel:  e.SelfDamageHPPerLevel,
		FractionOfMax:         e.HealFractionOfMax,
		FractionOfMaxPerLevel: e.HealFractionOfMaxPerLevel,
		Variance:              e.Variance,
	}, nil
}

func (e *effectDef) selfHealParams() (*SelfHealParams, error) {
	if err := validateVariance(e.Variance); err != nil {
		return nil, err
	}
	// Same no-op guard as heal_aura: a self_heal cooldown that restores
	// nothing is unauthorable (§27.3.2, evened out with heal_aura).
	if e.HealHP == 0 && e.HealHPPerLevel == 0 && e.HealFractionOfMax == 0 && e.HealFractionOfMaxPerLevel == 0 {
		return nil, fmt.Errorf("self_heal: no heal authored (healHP, healHPPerLevel, healFractionOfMax, healFractionOfMaxPerLevel all 0)")
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

// shieldParams builds the shield payload. A both-zero pool is a do-nothing
// buff and hard-fails like the dot/stat no-scaling guards; the instant form
// requires its authored buff lifetime (the aura form derives it from the
// cadence, and the allowlist already rejects the key there).
func (e *effectDef) shieldParams(effectType EffectType) (*ShieldParams, error) {
	if e.ShieldHP < 0 {
		return nil, fmt.Errorf("shieldHP: must be >= 0, got %v", e.ShieldHP)
	}
	if e.ShieldHP == 0 && e.ShieldHPPerLevel == 0 {
		return nil, fmt.Errorf("shield: no pool authored (shieldHP and shieldHPPerLevel both 0)")
	}
	if effectType == EffectTypeInstantShield && e.ShieldDurationTicks < 1 {
		return nil, fmt.Errorf("shieldDurationTicks: must be >= 1, got %v", e.ShieldDurationTicks)
	}
	return &ShieldParams{
		HP:            e.ShieldHP,
		HPPerLevel:    e.ShieldHPPerLevel,
		DurationTicks: e.ShieldDurationTicks,
		TargetsSelf:   e.TargetsSelf,
	}, nil
}

// hotParams builds the hot payload, the dotParams twin: the cadence fields are
// required (a hot with no events or no spacing is unauthorable rather than a
// silent no-op) and some heal must be authored. No tags — heals aren't
// mitigated.
func (e *effectDef) hotParams() (*HotParams, error) {
	if err := validateVariance(e.Variance); err != nil {
		return nil, err
	}
	if e.HealHP == 0 && e.HealHPPerLevel == 0 {
		return nil, fmt.Errorf("hot: no heal authored (healHP and healHPPerLevel both 0)")
	}
	if e.HotTicks < 1 {
		return nil, fmt.Errorf("hotTicks: must be >= 1, got %v", e.HotTicks)
	}
	if e.HotTickInterval < 1 {
		return nil, fmt.Errorf("hotTickInterval: must be >= 1, got %v", e.HotTickInterval)
	}
	return &HotParams{
		HP:          e.HealHP,
		HPPerLevel:  e.HealHPPerLevel,
		Variance:    e.Variance,
		TickCount:   e.HotTicks,
		Interval:    e.HotTickInterval,
		TargetsSelf: e.TargetsSelf,
	}, nil
}

// reviveParams builds the revive payload. The health fraction is required and
// must land in (0, 1] — a 0 revive spawns an instantly-dead player, a > 1 one
// overheals past max.
func (e *effectDef) reviveParams() (*ReviveParams, error) {
	if e.ReviveHealthFraction <= 0 || e.ReviveHealthFraction > 1 {
		return nil, fmt.Errorf("reviveHealthFraction: must be in (0, 1], got %v", e.ReviveHealthFraction)
	}
	return &ReviveParams{HealthFraction: e.ReviveHealthFraction}, nil
}

// dashParams builds the dash payload. Distance must be strictly positive — a
// zero-distance dash is a do-nothing cooldown. DistancePerLevel may be zero for
// a flat dash.
func (e *effectDef) dashParams() (*DashParams, error) {
	if e.DashDistance <= 0 {
		return nil, fmt.Errorf("dashDistance: must be > 0, got %v", e.DashDistance)
	}
	return &DashParams{Distance: e.DashDistance, DistancePerLevel: e.DashDistancePerLevel}, nil
}

// tickRateParams builds the tick_rate payload. Factor must be strictly positive
// and not 1 (a factor of 1 is a no-op cooldown; 0 or negative is nonsensical for
// a cadence multiplier). DurationTicks must be positive — a zero-lifetime buff
// expires before it can act.
func (e *effectDef) tickRateParams() (*TickRateParams, error) {
	if e.TickRateFactor <= 0 {
		return nil, fmt.Errorf("tickRateFactor: must be > 0, got %v", e.TickRateFactor)
	}
	if e.TickRateFactor == 1 {
		return nil, fmt.Errorf("tickRateFactor: 1 is a no-op (neither haste nor slow)")
	}
	if e.TickRateDurationTicks <= 0 {
		return nil, fmt.Errorf("tickRateDurationTicks: must be > 0, got %v", e.TickRateDurationTicks)
	}
	return &TickRateParams{Factor: e.TickRateFactor, DurationTicks: e.TickRateDurationTicks}, nil
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
