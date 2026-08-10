package cfg

import (
	"encoding/json"
	"log/slog"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/ascension"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/curve"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/quests"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/world"
)

// Bounds is the rectangular world size in server units (world foundation
// chunk 1).
type Bounds struct {
	Width  float32
	Height float32
}

type GameConfig struct {
	Tokens []string
	Bounds Bounds

	// ZoneName is the active zone's identity (its file stem), sent to the
	// client in the Welcome so it renders the matching terrain (chunk 6).
	ZoneName         string
	MobRegistry      mobs.Registry
	SkillRegistry    skills.Registry
	MilestoneUnlocks []skills.MilestoneUnlock
	Recipes          skills.RecipeRegistry
	QuestRegistry    quests.Registry

	// AscensionCatalog is the curated reward list an ascending bloodline picks
	// one entry from (plan-ascension.md D13). Empty until C3 authors it, and
	// empty is a legal world (D14).
	AscensionCatalog ascension.Catalog

	// Spawns are the authored mob spawn points from the zone (world foundation
	// chunk 4). The MobSystem spawns one mob per point and respawns it at the
	// same spot on death.
	Spawns []world.Spawn

	TotalDayCycleSeconds   uint64
	DayTimeSeconds         uint64
	MobChaseIntoAuraMargin float32

	PlayerConfig PlayerConfig
	CombatConfig CombatConfig
}

// Built-in defaults for the combat factors [PLACEHOLDER], applied whenever the
// matching conf entry is absent (zero). They live here — not at the read sites
// — so a hand-built GameConfig (the sim harness, tests) and a real conf.json
// without a game.combat block resolve to the same numbers through one path.
const (
	DefaultCritFactor         = 2.0
	DefaultHealerThreatFactor = 0.5
	// DefaultPresenceRadius is the presence-participation range (chunk P, P1)
	// [PLACEHOLDER 8]: the viewport is 20×12 units, so ~8 reads as "clearly at
	// the fight, on your screen".
	DefaultPresenceRadius = 8.0
)

// CombatConfig holds combat factors that apply to EVERY acting entity — player,
// mob, summon alike — which is why they sit outside PlayerConfig next to the
// player-character-only CritChance (backlog §25 B). See §31 for the wider
// player/mob stat convergence these are the first instalment of.
type CombatConfig struct {
	// DefaultCritFactor multiplies crits on effects that author no critFactor
	// of their own (§4.3 v2, PO 2026-07-20); authored factors win.
	DefaultCritFactor float32

	// HealerThreatFactor weights landed healing into threat (§6.3, decided
	// 2026-07-10): healedHP × factor, credited on every mob in combat with the
	// heal target.
	HealerThreatFactor float32

	// PresenceRadius is the presence-participation range (chunk P, P1): a
	// player with an active aura ON within this range of a player-fought mob
	// joins its participant set — one fixed radius, flat for all mobs. The
	// mob's body radius is added at the query (the withinSensor convention),
	// so a large boss body doesn't shrink the effective ring.
	PresenceRadius float32
}

// CritFactor is DefaultCritFactor with the zero value normalized to the
// built-in default, so callers never have to check.
func (c CombatConfig) CritFactor() float32 {
	if c.DefaultCritFactor <= 0 {
		return DefaultCritFactor
	}
	return c.DefaultCritFactor
}

// HealerThreat is HealerThreatFactor with the zero value normalized to the
// built-in default. Note a deliberate consequence: healer threat cannot be
// switched OFF by authoring 0 — set a tiny value instead.
func (c CombatConfig) HealerThreat() float32 {
	if c.HealerThreatFactor <= 0 {
		return DefaultHealerThreatFactor
	}
	return c.HealerThreatFactor
}

// PresenceRange is PresenceRadius with the zero value normalized to the
// built-in default. Per the standing conf ruling, authoring 0 restores the
// default — it does not disable presence credit.
func (c CombatConfig) PresenceRange() float32 {
	if c.PresenceRadius <= 0 {
		return DefaultPresenceRadius
	}
	return c.PresenceRadius
}

func (g *GameConfig) LogValue() slog.Value {
	raw, err := json.Marshal(g)
	if err != nil {
		return slog.AnyValue(err)
	}

	var asMap map[string]any
	err = json.Unmarshal(raw, &asMap)
	if err != nil {
		return slog.AnyValue(err)
	}

	return slog.GroupValue(
		slog.Any("raw", asMap),
	)
}

type PlayerConfig struct {
	// constant for out-of-combat health regen
	HealthGainTick float32

	WalkingSpeedPerTick float32

	// FlightSpeedFactor × WalkingSpeedPerTick is the campfire-to-campfire
	// flight speed (plan-flight-paths.md D8). [PLACEHOLDER 4]
	FlightSpeedFactor float32

	// BaseHealth is the player's absolute HP pool at level 1 (item 11 Phase 1)
	// [PLACEHOLDER]; scaled by f(level) (LevelCurve) × passive bonuses.
	BaseHealth int

	// LevelCurve is f(character level) — the global HP-value inflation
	// multiplier (GDD §5): player max HP and HP-side skill output scale by
	// F(level); MaxLevel caps level-ups. Zero growth = neutral (curve.F).
	LevelCurve curve.Curve

	LevelUpXPBase         uint32
	LevelUpXPGrowthFactor float32

	// skill points earned per player level beyond 1 [PLACEHOLDER]
	SkillPointsPerLevel int

	// CritChance is the flat character-base crit chance on every direct hit
	// (§4.3 v2, PO 2026-07-20) [PLACEHOLDER]; additive with the critChance
	// passive stat and any skill-authored chance. Read in sys.rollHitDamage's
	// apply sites.
	CritChance float32
}
