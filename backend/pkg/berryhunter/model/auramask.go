package model

import "github.com/trichner/berryhunter/pkg/berryhunter/skills"

// factionLayers maps a caster's faction to the (enemy, ally) body layers
// under the current two-faction world: aligned entities (players) live on the
// player layer, hostile ones (mobs) on the action layer.
//
// NOTE for the charm/summon era: once factions cross entity kinds (an aligned
// mob is still on the action layer), faction no longer maps 1:1 to a layer —
// enemy-targeting masks must then widen to both layers and eligibility does
// the exact faction check (plan-effect-foundations §4, Step 1 note).
func factionLayers(f Faction) (enemy, ally CollisionLayer) {
	if f == FactionHostile {
		return LayerPlayerCollision, LayerActionCollision
	}
	return LayerActionCollision, LayerPlayerCollision
}

// AuraMaskFor derives the collision mask of an entity's aura sensor from a
// skill's effects and the caster's faction (effect foundations Step 1):
// targetsEnemies maps to the opposing faction's body layer, targetsAllies —
// and the heal aura's implicit allies — to the caster's own, and
// targetsStructures to the placeable layer. SkillSystem re-derives the mask
// whenever the active skill changes; because it is faction-relative, a future
// faction flip (charm) retargets on the next tick with no extra wiring.
func AuraMaskFor(def *skills.SkillDefinition, casterFaction Faction) int {
	enemyLayer, allyLayer := factionLayers(casterFaction)
	mask := LayerNoneCollision
	for _, e := range def.Effects {
		switch e.Type {
		case skills.EffectTypeDamageAura, skills.EffectTypeSlowAura, skills.EffectTypeResistAura:
			if e.TargetsEnemies {
				mask |= enemyLayer
			}
			if e.TargetsAllies {
				mask |= allyLayer
			}
			// Only damage effects can author targetsStructures (allowlist).
			if e.TargetsStructures {
				mask |= LayerPlaceableCollision
			}
		case skills.EffectTypeHealAura:
			mask |= allyLayer
		}
	}
	return int(mask)
}

// InstantDamageMask derives the one-shot query mask for a single
// instant_damage effect from its target flags — the same faction-relative
// layer mapping the aura sensor uses.
func InstantDamageMask(e skills.EffectDef, casterFaction Faction) int {
	enemyLayer, allyLayer := factionLayers(casterFaction)
	mask := LayerNoneCollision
	if e.TargetsEnemies {
		mask |= enemyLayer
	}
	if e.TargetsAllies {
		mask |= allyLayer
	}
	if e.TargetsStructures {
		mask |= LayerPlaceableCollision
	}
	return int(mask)
}
