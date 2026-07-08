package cfg

import (
	"encoding/json"
	"fmt"
	"os"
)

type Server struct {
	Port        int    `json:"port"`
	TlsHost     string `json:"tlsHost"`
	FrontendDir string `json:"frontendDir"`
}

type Config struct {
	Server Server `json:"server"`
	Game   struct {
		TotalDayCycleSeconds   uint64  `json:"totalDayCycleSeconds"`
		DayTimeSeconds         uint64  `json:"dayTimeSeconds"`
		InitialMobCount        int     `json:"initialMobCount"`
		MobChaseIntoAuraMargin float32 `json:"mobChaseIntoAuraMargin"`
		Player                 struct {
			// constant for out-of-combat health regen
			HealthGainTick float32 `json:"healthGainTick"`

			//
			WalkingSpeedPerTick        float32 `json:"walkingSpeedPerTick"`
			BaseHealth                 int     `json:"baseHealth"`
			MaxHealthLevelGainFraction float32 `json:"maxHealthLevelGainFraction"`
			LevelUpXPBase              uint32  `json:"levelUpXPBase"`
			LevelUpXPGrowthFactor      float32 `json:"levelUpXPGrowthFactor"`
			SkillPointsPerLevel        int     `json:"skillPointsPerLevel"`
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
	if config.Game.InitialMobCount <= 0 {
		config.Game.InitialMobCount = 70
	}
	// Validate
	if config.Game.DayTimeSeconds > config.Game.TotalDayCycleSeconds {
		return config, fmt.Errorf("invalid configuration: DayTimeSeconds (%d) must not be larger than TotalDayCycleSeconds (%d)",
			config.Game.DayTimeSeconds, config.Game.TotalDayCycleSeconds)
	}
	return config, err
}
