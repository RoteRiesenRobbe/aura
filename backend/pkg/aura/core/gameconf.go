package core

import (
	"github.com/RoteRiesenRobbe/aura/pkg/aura/ascension"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/cfg"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/quests"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/world"
)

type Configuration func(g *cfg.GameConfig) error

func Config(conf *cfg.Config) Configuration {
	return func(g *cfg.GameConfig) error {
		g.TotalDayCycleSeconds = conf.Game.TotalDayCycleSeconds
		g.DayTimeSeconds = conf.Game.DayTimeSeconds
		g.MobChaseIntoAuraMargin = conf.Game.MobChaseIntoAuraMargin
		g.MobWakeMargin = conf.Game.Mob.WakeMargin
		g.MobSleepMargin = conf.Game.Mob.SleepMargin

		g.PlayerConfig.HealthGainTick = conf.Game.Player.HealthGainTick
		g.PlayerConfig.WalkingSpeedPerTick = conf.Game.Player.WalkingSpeedPerTick
		g.PlayerConfig.FlightSpeedFactor = conf.Game.Player.FlightSpeedFactor
		g.PlayerConfig.BaseHealth = conf.Game.Player.BaseHealth
		g.PlayerConfig.LevelCurve = conf.LevelCurve()
		g.PlayerConfig.LevelUpXPBase = conf.Game.Player.LevelUpXPBase
		g.PlayerConfig.LevelUpXPGrowthFactor = conf.Game.Player.LevelUpXPGrowthFactor
		g.PlayerConfig.SkillPointsPerLevel = conf.Game.Player.SkillPointsPerLevel
		g.PlayerConfig.CritChance = conf.Game.Player.CritChance

		// Copied raw: CombatConfig's accessors normalize the zero value, so
		// defaulting here as well would be the same knob enforced two ways.
		g.CombatConfig.DefaultCritFactor = conf.Game.Combat.DefaultCritFactor
		g.CombatConfig.HealerThreatFactor = conf.Game.Combat.HealerThreatFactor
		g.CombatConfig.PresenceRadius = conf.Game.Combat.PresenceRadius
		if g.PlayerConfig.SkillPointsPerLevel <= 0 {
			g.PlayerConfig.SkillPointsPerLevel = 1
		}
		// No LevelCurve defaulting here: cfg.ReadConfig is the single default
		// point, so the player curve can never diverge from the mob registry's
		// tier+baseline derivation (both read the same conf values). A zero
		// curve (hand-built configs in tests/sim) is neutral by curve.F.
		if g.PlayerConfig.BaseHealth <= 0 {
			g.PlayerConfig.BaseHealth = 100 // [PLACEHOLDER] item 11 Phase 1
		}
		// Defaulting must be TOTAL (§35 C1 L1): the environment confs omit the
		// whole player block by design, so an absent key is the normal case,
		// not an authoring mistake. Values restate conf.default.json exactly.
		if g.PlayerConfig.HealthGainTick <= 0 {
			g.PlayerConfig.HealthGainTick = 0.00033 // ≈1%/s, regen lock Session ③ FINAL
		}
		if g.PlayerConfig.WalkingSpeedPerTick <= 0 {
			g.PlayerConfig.WalkingSpeedPerTick = 0.05
		}
		if g.PlayerConfig.FlightSpeedFactor <= 0 {
			// ≈2.8× walk (D8) — cut from 4× by the PO's first in-air pass
			// 2026-08-05 ("too fast"). [PLACEHOLDER]
			g.PlayerConfig.FlightSpeedFactor = 2.8
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
		// Dormancy's wake volume (plan-world-scale.md D6). Defaulted here for
		// the same total-defaulting reason as everything above: the environment
		// confs omit the whole mob block by design.
		//
		// ⚑ These two must satisfy L8's invariants — wake > 1 (the wake volume
		// strictly contains the AOI, so nothing pops in on screen) and sleep >
		// wake (hysteresis is a band, not an inversion). Both are asserted in
		// cmd/simharness/guardrail_test.go; a config that violates them is a
		// mob fading in in front of the player, or a sleep/wake thrash.
		if g.MobWakeMargin <= 1 {
			g.MobWakeMargin = 1.7
		}
		if g.MobSleepMargin <= g.MobWakeMargin {
			g.MobSleepMargin = g.MobWakeMargin + 0.5
		}

		return nil
	}
}

func Registries(m mobs.Registry) Configuration {
	return func(g *cfg.GameConfig) error {
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

// AscensionCatalog installs the ascension reward catalog (plan-ascension.md C1).
func AscensionCatalog(c ascension.Catalog) Configuration {
	return func(g *cfg.GameConfig) error {
		g.AscensionCatalog = c
		return nil
	}
}

func Recipes(r skills.RecipeRegistry) Configuration {
	return func(g *cfg.GameConfig) error {
		g.Recipes = r
		return nil
	}
}

func QuestRegistry(r quests.Registry) Configuration {
	return func(g *cfg.GameConfig) error {
		g.QuestRegistry = r
		return nil
	}
}

func Tokens(t []string) Configuration {
	return func(g *cfg.GameConfig) error {
		g.Tokens = t
		return nil
	}
}

func Bounds(width, height float32) Configuration {
	return func(g *cfg.GameConfig) error {
		g.Bounds = cfg.Bounds{Width: width, Height: height}
		return nil
	}
}

func ZoneName(name string) Configuration {
	return func(g *cfg.GameConfig) error {
		g.ZoneName = name
		return nil
	}
}

func Spawns(spawns []world.Spawn) Configuration {
	return func(g *cfg.GameConfig) error {
		g.Spawns = spawns
		return nil
	}
}
