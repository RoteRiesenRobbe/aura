// Package sim is the balancing / what-if explorer (docs/plan-sim-harness.md):
// it builds a minimal deterministic world, drives the REAL ECS systems
// headlessly (no re-modeled combat math), and reports outcome metrics as
// distributions over N seeded runs. Chunk 1: explicit-input 1v1 TTK / TTD.
package sim

import "github.com/trichner/berryhunter/pkg/berryhunter/skills"

// AuraSpec is one synthetic damage aura, given as explicit numbers — the
// "these numbers" half of the tool's number→outcome question. It maps 1:1
// onto a real skills.SkillDefinition with a single damage_aura effect.
type AuraSpec struct {
	DamageHP     float32 `json:"damageHP"`     // absolute HP per hit (pre-roll center)
	TickInterval int     `json:"tickInterval"` // game ticks between hits (min 1)
	Radius       float32 `json:"radius"`       // aura reach in world units
	Variance     float32 `json:"variance"`     // per-hit ± band, 0 = static
	CritChance   float32 `json:"critChance"`   // per-hit crit roll, 0 = never
	CritFactor   float32 `json:"critFactor"`   // crit damage multiplier (pair with CritChance)
	MaxTargets   int     `json:"maxTargets"`   // nearest-N cap; 0 = uncapped (the chunk-3 matrix axis)

	// DotTicks > 0 turns the spec into a dot_aura (C8 full-roster presets):
	// each application deals DamageHP per event, DotTicks events, one every
	// DotTickInterval game ticks — running on the TARGET independent of the
	// aura (the tail keeps ticking after leaving range). TickInterval stays
	// the application cadence; dots carry no crit (DotParams has none).
	DotTicks        int `json:"dotTicks,omitempty"`
	DotTickInterval int `json:"dotTickInterval,omitempty"`
}

// definition builds the real skill definition the ECS runs. Direct
// construction mirrors what the JSON loader would produce for the same
// numbers (Selector zero value = nearest, nil tags = untagged damage).
func (a AuraSpec) definition(id skills.SkillID, name string) *skills.SkillDefinition {
	interval := a.TickInterval
	if interval < 1 {
		interval = 1
	}
	effect := skills.EffectDef{
		Type:           skills.EffectTypeDamageAura,
		Radius:         a.Radius,
		TickInterval:   interval,
		TargetsEnemies: true,
		MaxTargets:     a.MaxTargets,
		Damage: &skills.DamageParams{
			HP:         a.DamageHP,
			Variance:   a.Variance,
			CritChance: a.CritChance,
			CritFactor: a.CritFactor,
		},
	}
	if a.DotTicks > 0 {
		dotInterval := a.DotTickInterval
		if dotInterval < 1 {
			dotInterval = 1
		}
		effect.Type = skills.EffectTypeDotAura
		effect.Damage = nil
		effect.Dot = &skills.DotParams{
			HP:        a.DamageHP,
			Variance:  a.Variance,
			TickCount: a.DotTicks,
			Interval:  dotInterval,
		}
	}
	return &skills.SkillDefinition{
		ID:       id,
		Name:     name,
		Category: skills.SkillCategoryActiveAura,
		MaxLevel: 1,
		Effects:  []skills.EffectDef{effect},
	}
}

// PlayerSpec is the synthetic player build: an absolute HP pool plus one
// damage aura. Regen is the real combat-gated player regen and never fires
// mid-fight, so it is not a chunk-1 knob (the chain runner in chunk 4 models
// recovery explicitly).
type PlayerSpec struct {
	MaxHealth int      `json:"maxHealth"`
	Aura      AuraSpec `json:"aura"`
}

// MobSpec is the synthetic mob: pool, movement/acquisition geometry and one
// damage aura. The spawn-HP variance is rolled by the RUN's seeded rng (not
// the mob's own entity-ID-seeded rng) so distributions are reproducible
// under a fixed base seed.
type MobSpec struct {
	MaxHealth            float32  `json:"maxHealth"`
	MaxHealthVariance    float32  `json:"maxHealthVariance"` // spawn roll band, 0 = exact
	Speed                float32  `json:"speed"`             // chase speed factor (0 = stationary, aura always on)
	BodyRadius           float32  `json:"bodyRadius"`
	AggroRadius          float32  `json:"aggroRadius"`
	FleeBelowHealthRatio float32  `json:"fleeBelowHealthRatio"` // 0 = never flees
	Aura                 AuraSpec `json:"aura"`
}

// Outcome is how a fight ended.
type Outcome string

const (
	OutcomeMobDied    Outcome = "mob_died"
	OutcomePlayerDied Outcome = "player_died"
	OutcomeTimeout    Outcome = "timeout"
)

// Scenario is one fight arrangement: explicit combatants, their starting
// distance, and which ending is the measured metric. TTK and TTD are the two
// chunk-1 instances; Pack is the chunk-3 one.
type Scenario struct {
	Name             string     `json:"name"`
	Player           PlayerSpec `json:"player"`
	Mob              MobSpec    `json:"mob"`
	PlayerAuraActive bool       `json:"playerAuraActive"` // false = idle player (TTD)
	StartDistance    float32    `json:"startDistance"`    // player at origin, mobs on a ring of radius d (mob 0 at (d, 0))
	MaxTicks         int        `json:"maxTicks"`         // timeout guard
	Primary          Outcome    `json:"primary"`          // the metric-defining ending
	// PackSize is the number of identical mobs (0/1 = single); OutcomeMobDied
	// then means the WHOLE pack died.
	PackSize int `json:"packSize,omitempty"`
	// RegenTick is the player's out-of-combat regen as a fraction of max HP
	// per tick; 0 = the game default. Combat-gated, so it never moves a
	// fight — it is the chunk-4 recovery knob.
	RegenTick float32 `json:"regenTick,omitempty"`
}

// DefaultRegenTick mirrors conf.default.json's healthGainTick [PLACEHOLDER].
const DefaultRegenTick = 0.00033

// DefaultMaxTicks caps a fight at 120 simulated seconds [PLACEHOLDER] —
// far above the GDD working targets (TTK ~8 s, TTD ~20-25 s), so a timeout
// reads as "these numbers do not resolve", itself a finding.
const DefaultMaxTicks = 120 * TicksPerSecond

// TTK is the "player kills a mob" scenario: both auras run; the metric is
// the mob's death. A player death instead is reported, not measured.
func TTK(p PlayerSpec, m MobSpec, startDistance float32) Scenario {
	return Scenario{
		Name:             "TTK",
		Player:           p,
		Mob:              m,
		PlayerAuraActive: true,
		StartDistance:    startDistance,
		MaxTicks:         DefaultMaxTicks,
		Primary:          OutcomeMobDied,
	}
}

// TTD is the "idle player is killed" scenario: the player's aura is off
// (ActiveAuraSlot -1), the player never fights back; the metric is the
// player's death.
func TTD(p PlayerSpec, m MobSpec, startDistance float32) Scenario {
	return Scenario{
		Name:             "TTD",
		Player:           p,
		Mob:              m,
		PlayerAuraActive: false,
		StartDistance:    startDistance,
		MaxTicks:         DefaultMaxTicks,
		Primary:          OutcomePlayerDied,
	}
}

// Pack is the "player clears a homogeneous pack" scenario: packSize copies
// of one mob on a ring at startDistance, player at origin fighting back; the
// metric is the whole pack's death. Reproducibility keeps the chunk-1/2
// contract: mobs must aggro (startDistance ≤ AggroRadius) or have speed 0 —
// idle wander draws from the mobs' own entity-ID-seeded rngs.
func Pack(p PlayerSpec, m MobSpec, packSize int, startDistance float32) Scenario {
	return Scenario{
		Name:             "PACK",
		Player:           p,
		Mob:              m,
		PlayerAuraActive: true,
		StartDistance:    startDistance,
		MaxTicks:         DefaultMaxTicks,
		Primary:          OutcomeMobDied,
		PackSize:         packSize,
	}
}
