package cfg

import (
	"encoding/json"
	"log/slog"

	"github.com/trichner/berryhunter/pkg/berryhunter/items"
	"github.com/trichner/berryhunter/pkg/berryhunter/items/mobs"
	"github.com/trichner/berryhunter/pkg/berryhunter/skills"
	"github.com/trichner/berryhunter/pkg/berryhunter/world"
)

// Bounds is the rectangular world size in server units (world foundation
// chunk 1). Radius is being phased out in favour of this; both coexist while
// the circular spawn/gen paths migrate (chunks 2/4).
type Bounds struct {
	Width  float32
	Height float32
}

type GameConfig struct {
	Tokens           []string
	Radius           float32
	Bounds           Bounds
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
	InitialMobCount        int
	MobChaseIntoAuraMargin float32

	PlayerConfig    PlayerConfig
	ChieftainConfig *ChieftainConfig
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

type ChieftainConfig struct {
	Addr           string
	CaCertFile     string
	ClientCertFile string
	ClientKeyFile  string
}

type PlayerConfig struct {
	// constant for out-of-combat health regen
	HealthGainTick float32

	WalkingSpeedPerTick float32

	// BaseHealth is the player's absolute HP pool at level 1 (item 11 Phase 1)
	// [PLACEHOLDER]; scaled by MaxHealthLevelGainFraction + passive bonuses.
	BaseHealth int

	MaxHealthLevelGainFraction float32

	LevelUpXPBase         uint32
	LevelUpXPGrowthFactor float32

	// skill points earned per player level beyond 1 [PLACEHOLDER]
	SkillPointsPerLevel int
}
