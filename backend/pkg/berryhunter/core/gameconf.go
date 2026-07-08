package core

import (
	"github.com/trichner/berryhunter/pkg/berryhunter/cfg"
	"github.com/trichner/berryhunter/pkg/berryhunter/items"
	"github.com/trichner/berryhunter/pkg/berryhunter/items/mobs"
	"github.com/trichner/berryhunter/pkg/berryhunter/skills"
	"github.com/trichner/berryhunter/pkg/berryhunter/world"
)

type Configuration func(g *cfg.GameConfig) error

func Config(conf *cfg.Config) Configuration {
	return func(g *cfg.GameConfig) error {
		g.TotalDayCycleSeconds = conf.Game.TotalDayCycleSeconds
		g.DayTimeSeconds = conf.Game.DayTimeSeconds
		g.InitialMobCount = conf.Game.InitialMobCount
		g.MobChaseIntoAuraMargin = conf.Game.MobChaseIntoAuraMargin

		g.PlayerConfig.HealthGainTick = conf.Game.Player.HealthGainTick
		g.PlayerConfig.WalkingSpeedPerTick = conf.Game.Player.WalkingSpeedPerTick
		g.PlayerConfig.BaseHealth = conf.Game.Player.BaseHealth
		g.PlayerConfig.MaxHealthLevelGainFraction = conf.Game.Player.MaxHealthLevelGainFraction
		g.PlayerConfig.LevelUpXPBase = conf.Game.Player.LevelUpXPBase
		g.PlayerConfig.LevelUpXPGrowthFactor = conf.Game.Player.LevelUpXPGrowthFactor
		g.PlayerConfig.SkillPointsPerLevel = conf.Game.Player.SkillPointsPerLevel
		if g.PlayerConfig.SkillPointsPerLevel <= 0 {
			g.PlayerConfig.SkillPointsPerLevel = 1
		}
		if g.PlayerConfig.MaxHealthLevelGainFraction <= 0 {
			g.PlayerConfig.MaxHealthLevelGainFraction = 0.1
		}
		if g.PlayerConfig.BaseHealth <= 0 {
			g.PlayerConfig.BaseHealth = 100 // [PLACEHOLDER] item 11 Phase 1
		}
		if g.PlayerConfig.LevelUpXPBase == 0 {
			g.PlayerConfig.LevelUpXPBase = 300
		}
		if g.PlayerConfig.LevelUpXPGrowthFactor <= 1.0 {
			g.PlayerConfig.LevelUpXPGrowthFactor = 1.2
		}
		if g.MobChaseIntoAuraMargin <= 0 {
			g.MobChaseIntoAuraMargin = 0.2
		}
		if g.InitialMobCount <= 0 {
			g.InitialMobCount = 50
		}

		if conf.Chieftain.Addr != "" {
			ctn := &cfg.ChieftainConfig{}
			ctn.Addr = conf.Chieftain.Addr
			ctn.CaCertFile = conf.Chieftain.CaCertFile
			ctn.ClientCertFile = conf.Chieftain.ClientCertFile
			ctn.ClientKeyFile = conf.Chieftain.ClientKeyFile
			g.ChieftainConfig = ctn
		}

		return nil
	}
}

func Registries(r items.Registry, m mobs.Registry) Configuration {
	return func(g *cfg.GameConfig) error {
		g.ItemRegistry = r
		g.MobRegistry = m
		return nil
	}
}

func SkillRegistry(r skills.Registry) Configuration {
	return func(g *cfg.GameConfig) error {
		g.SkillRegistry = r
		return nil
	}
}

func MilestoneUnlocks(unlocks []skills.MilestoneUnlock) Configuration {
	return func(g *cfg.GameConfig) error {
		g.MilestoneUnlocks = unlocks
		return nil
	}
}

func Recipes(r skills.RecipeRegistry) Configuration {
	return func(g *cfg.GameConfig) error {
		g.Recipes = r
		return nil
	}
}

func Tokens(t []string) Configuration {
	return func(g *cfg.GameConfig) error {
		g.Tokens = t
		return nil
	}
}

func Radius(r float32) Configuration {
	return func(g *cfg.GameConfig) error {
		g.Radius = r
		return nil
	}
}

func Bounds(width, height float32) Configuration {
	return func(g *cfg.GameConfig) error {
		g.Bounds = cfg.Bounds{Width: width, Height: height}
		return nil
	}
}

func Spawns(spawns []world.Spawn) Configuration {
	return func(g *cfg.GameConfig) error {
		g.Spawns = spawns
		return nil
	}
}
