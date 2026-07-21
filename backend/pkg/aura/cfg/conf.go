package cfg

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/curve"
)

type Server struct {
	Port        int    `json:"port"`
	TlsHost     string `json:"tlsHost"`
	FrontendDir string `json:"frontendDir"`
}

type Config struct {
	Server Server `json:"server"`
	Game   struct {
		// Zone selects which zone file (by file stem, e.g. "scaffold" for
		// scaffold.json) to load. Empty loads the sole zone when only one
		// exists; the -zone flag overrides this.
		Zone                   string  `json:"zone"`
		TotalDayCycleSeconds   uint64  `json:"totalDayCycleSeconds"`
		DayTimeSeconds         uint64  `json:"dayTimeSeconds"`
		MobChaseIntoAuraMargin float32 `json:"mobChaseIntoAuraMargin"`
		Player                 struct {
			// constant for out-of-combat health regen
			HealthGainTick float32 `json:"healthGainTick"`

			//
			WalkingSpeedPerTick float32 `json:"walkingSpeedPerTick"`
			BaseHealth          int     `json:"baseHealth"`
			// LevelGrowth + MaxLevel define f(character level) =
			// levelGrowth^(L-1) — the number-inflation curve (GDD §5,
			// [WORKING LOCK 2026-07-16]: 1.12 × 30). Replaced the linear
			// maxHealthLevelGainFraction in C0.
			LevelGrowth           float64 `json:"levelGrowth"`
			MaxLevel              int     `json:"maxLevel"`
			LevelUpXPBase         uint32  `json:"levelUpXPBase"`
			LevelUpXPGrowthFactor float32 `json:"levelUpXPGrowthFactor"`
			SkillPointsPerLevel   int     `json:"skillPointsPerLevel"`
			// CritChance is the flat base crit chance every player character
			// has (§4.3 v2, PO 2026-07-20) [PLACEHOLDER 0.05]; skill-authored
			// chance and the critChance passive stat add on top.
			CritChance float32 `json:"critChance"`
		} `json:"player"`
	} `json:"game"`
}

// reads the config from file
func ReadConfig(filename string) (*Config, error) {
	var err error
	// read file
	dat, err := os.ReadFile(filename)
	if err != nil {
		return nil, err
	}

	// parse config
	config := &Config{}
	if err := json.Unmarshal(dat, config); err != nil {
		return nil, err
	}

	// Default if values are missing
	if config.Game.TotalDayCycleSeconds <= 0 {
		config.Game.TotalDayCycleSeconds = 600
	}
	if config.Game.DayTimeSeconds <= 0 {
		config.Game.DayTimeSeconds = 400
	}
	// f(L) curve defaults [WORKING LOCK 2026-07-16]. Defaulted HERE — the
	// single point both consumers read through — because the curve feeds two
	// places that must never diverge: the player-side PlayerConfig.LevelCurve
	// and the mob registry's tier+baseline derivation (C0, GDD §5 one-knob
	// rule).
	if config.Game.Player.LevelGrowth <= 0 {
		config.Game.Player.LevelGrowth = curve.Default().Growth
	}
	if config.Game.Player.MaxLevel <= 0 {
		config.Game.Player.MaxLevel = curve.Default().MaxLevel
	}
	if config.Game.Player.CritChance <= 0 {
		config.Game.Player.CritChance = 0.05
	}
	// Validate
	if config.Game.DayTimeSeconds > config.Game.TotalDayCycleSeconds {
		return config, fmt.Errorf("invalid configuration: DayTimeSeconds (%d) must not be larger than TotalDayCycleSeconds (%d)",
			config.Game.DayTimeSeconds, config.Game.TotalDayCycleSeconds)
	}
	return config, err
}
