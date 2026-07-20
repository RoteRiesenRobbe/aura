package cfg

import (
	"encoding/json"
	"log/slog"

	"github.com/trichner/berryhunter/pkg/berryhunter/curve"
	"github.com/trichner/berryhunter/pkg/berryhunter/items"
	"github.com/trichner/berryhunter/pkg/berryhunter/items/mobs"
	"github.com/trichner/berryhunter/pkg/berryhunter/skills"
	"github.com/trichner/berryhunter/pkg/berryhunter/world"
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
	ItemRegistry     items.Registry
	MobRegistry      mobs.Registry
	SkillRegistry    skills.Registry
	MilestoneUnlocks []skills.MilestoneUnlock
	Recipes          skills.RecipeRegistry

	// Spawns are the authored mob spawn points from the zone (world foundation
	// chunk 4). The MobSystem spawns one mob per point and respawns it at the
	// same spot on death.
	Spawns []world.Spawn

	TotalDayCycleSeconds   uint64
	DayTimeSeconds         uint64
	MobChaseIntoAuraMargin float32

	PlayerConfig PlayerConfig
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
