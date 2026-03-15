package core

import (
	"github.com/trichner/berryhunter/pkg/berryhunter/cfg"
	"github.com/trichner/berryhunter/pkg/berryhunter/items"
	"github.com/trichner/berryhunter/pkg/berryhunter/items/mobs"
)

type Configuration func(g *cfg.GameConfig) error

func Config(conf *cfg.Config) Configuration {
	return func(g *cfg.GameConfig) error {
		g.ColdFractionNightPerS = conf.Game.ColdFractionNightPerS
		g.ColdFractionDayPerS = conf.Game.ColdFractionDayPerS

		g.TotalDayCycleSeconds = conf.Game.TotalDayCycleSeconds
		g.DayTimeSeconds = conf.Game.DayTimeSeconds
		g.MobChaseIntoAuraMargin = conf.Game.MobChaseIntoAuraMargin

		g.PlayerConfig.FreezingDamageTickFraction = conf.Game.Player.FreezingDamageTickFraction
		g.PlayerConfig.HealthGainSatietyLossTickFraction = conf.Game.Player.HealthGainSatietyLossTickFraction
		g.PlayerConfig.HealthGainSatietyThreshold = conf.Game.Player.HealthGainSatietyThreshold
		g.PlayerConfig.HealthGainTemperatureThreshold = conf.Game.Player.HealthGainTemperatureThreshold
		g.PlayerConfig.HealthGainTick = conf.Game.Player.HealthGainTick
		g.PlayerConfig.SatietyLossTickFraction = conf.Game.Player.SatietyLossTickFraction
		g.PlayerConfig.StarveDamageTickFraction = conf.Game.Player.StarveDamageTickFraction
		g.PlayerConfig.FreezingStarveDamageTickFraction = conf.Game.Player.FreezingStarveDamageTickFraction
		g.PlayerConfig.WalkingSpeedPerTick = conf.Game.Player.WalkingSpeedPerTick
		g.PlayerConfig.DamageAuraRadius = conf.Game.Player.DamageAuraRadius
		g.PlayerConfig.DamageAuraDamageFraction = conf.Game.Player.DamageAuraDamageFraction
		g.PlayerConfig.DamageAuraLevelGainFraction = conf.Game.Player.DamageAuraLevelGainFraction
		g.PlayerConfig.LevelUpXPBase = conf.Game.Player.LevelUpXPBase
		g.PlayerConfig.LevelUpXPGrowthFactor = conf.Game.Player.LevelUpXPGrowthFactor
		if g.PlayerConfig.DamageAuraRadius <= 0 {
			g.PlayerConfig.DamageAuraRadius = 0.6
		}
		if g.PlayerConfig.DamageAuraDamageFraction <= 0 {
			g.PlayerConfig.DamageAuraDamageFraction = 0.009
		}
		if g.PlayerConfig.DamageAuraLevelGainFraction <= 0 {
			g.PlayerConfig.DamageAuraLevelGainFraction = 0.002
		}
		if g.PlayerConfig.LevelUpXPBase == 0 {
			g.PlayerConfig.LevelUpXPBase = 150
		}
		if g.PlayerConfig.LevelUpXPGrowthFactor <= 1.0 {
			g.PlayerConfig.LevelUpXPGrowthFactor = 1.2
		}
		if g.MobChaseIntoAuraMargin <= 0 {
			g.MobChaseIntoAuraMargin = 0.2
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
