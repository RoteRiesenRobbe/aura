package model

import "github.com/trichner/berryhunter/pkg/berryhunter/skills"

// LayerCombatants covers both body layers factioned entities live on: players
// (and player-owned summons, the §8 layer trick) on the player layer, mobs on
// the action layer. Since mob factions (chunk 6.6) allegiance no longer maps
// to a layer in either direction — an aligned companion sits on the action
// layer, a hostile brazier once sat on the player layer — so every
// faction-flag-derived mask spans both layers and ELIGIBILITY does the exact
// faction check (the former factionLayers NOTE, now the rule).
const LayerCombatants = LayerPlayerCollision | LayerActionCollision

// AuraMaskFor derives the collision mask of an entity's aura sensor from a
// skill's effects: targetsEnemies/targetsAllies — and the heal aura's implicit
// allies — span both combatant layers (who exactly qualifies is the
// per-target faction check at apply time), targetsStructures adds the
// placeable layer. SkillSystem re-derives the mask whenever the active skill
// changes.
func AuraMaskFor(def *skills.SkillDefinition) int {
	mask := LayerNoneCollision
	for _, e := range def.Effects {
		switch e.Type {
		case skills.EffectTypeDamageAura, skills.EffectTypeSlowAura, skills.EffectTypeResistAura, skills.EffectTypeDotAura, skills.EffectTypeShieldAura:
			if e.TargetsEnemies || e.TargetsAllies {
				mask |= LayerCombatants
			}
			// Only damage effects can author targetsStructures (allowlist).
			if e.TargetsStructures {
				mask |= LayerPlaceableCollision
			}
		case skills.EffectTypeHealAura:
			mask |= LayerCombatants
		}
	}
	return int(mask)
}

// InstantDamageMask derives the one-shot query mask for a single
// instant_damage effect from its target flags — the same layer mapping the
// aura sensor uses.
func InstantDamageMask(e skills.EffectDef) int {
	mask := LayerNoneCollision
	if e.TargetsEnemies || e.TargetsAllies {
		mask |= LayerCombatants
	}
	if e.TargetsStructures {
		mask |= LayerPlaceableCollision
	}
	return int(mask)
}
