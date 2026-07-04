package model

import "github.com/trichner/berryhunter/pkg/berryhunter/skills"

// AuraMaskFor derives the collision mask of an entity's aura sensor from a
// skill's effects: damage-aura target flags map to the corresponding layers,
// and heal auras implicitly target players. This replaces the legacy
// hardcoded masks (player sensor: Player|Action; mob JSON "damages" field:
// Player/Placeable/All). SkillSystem re-derives it whenever the active skill
// changes, so mobs switching auras (future boss mechanics) retarget correctly.
func AuraMaskFor(def *skills.SkillDefinition) int {
	mask := LayerNoneCollision
	for _, e := range def.Effects {
		switch e.Type {
		case skills.EffectTypeDamageAura:
			if e.TargetsPlayers {
				mask |= LayerPlayerCollision
			}
			if e.TargetsMobs {
				mask |= LayerActionCollision
			}
			if e.TargetsStructures {
				mask |= LayerPlaceableCollision
			}
		case skills.EffectTypeSlowAura:
			if e.TargetsMobs {
				mask |= LayerActionCollision
			}
			if e.TargetsPlayers {
				mask |= LayerPlayerCollision
			}
		case skills.EffectTypeHealAura:
			mask |= LayerPlayerCollision
		}
	}
	return int(mask)
}

// InstantDamageMask derives the one-shot query mask for a single
// instant_damage effect from its target flags — the same layer mapping the
// aura sensor uses for damage_aura targets.
func InstantDamageMask(e skills.EffectDef) int {
	mask := LayerNoneCollision
	if e.TargetsPlayers {
		mask |= LayerPlayerCollision
	}
	if e.TargetsMobs {
		mask |= LayerActionCollision
	}
	if e.TargetsStructures {
		mask |= LayerPlaceableCollision
	}
	return int(mask)
}
