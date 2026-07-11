package mob

// Support mobs (mob-depth chunk 8): a seek-healer is a moving mob whose primary
// aura is a heal aura. It reacts to wounded ALLIES the way a damage mob reacts
// to enemy players — its aggro sensor senses fellow combatants, it acquires the
// most-wounded ally in range as its aggro target, chases it at full speed and
// its heal aura gates on/off with that acquisition. Everything downstream
// (chase movement, aura gating via setAggroTarget/resetAggro, the evade return)
// is the shared aggro machinery; only WHO it acquires differs.

import (
	"github.com/trichner/berryhunter/pkg/berryhunter/model"
	"github.com/trichner/berryhunter/pkg/berryhunter/skills"
)

// firstAuraHeals reports whether slot 0's active aura carries a heal effect —
// the seek-healer signal (chunk 8). Inferred from content (a heal aura in the
// primary slot) rather than a dedicated def flag: the heal aura IS the marker.
func firstAuraHeals(sc *skills.SkillComponent) bool {
	first := sc.AuraSlots[0]
	if first == nil {
		return false
	}
	for _, e := range first.Def.Effects {
		if e.Type == skills.EffectTypeHealAura {
			return true
		}
	}
	return false
}

// updateHealerTargeting is the seek-healer's replacement for enemy acquisition
// (chunk 8): retain the current wounded ally while it still needs healing and
// stays in sensor range, otherwise acquire the most-wounded ally in the sensor.
// Acquisition flips the heal aura on (setAggroTarget → setAuraActive), release
// flips it off (resetAggro) — the ring shows only while it is actually healing.
func (m *Mob) updateHealerTargeting() {
	if m.aggroTarget != nil {
		r := m.aggroTarget.HealthRatio()
		// Healed to full, dead, or wandered out of the sensor → let it go.
		if r <= 0 || r >= 1 || !m.targetWithinSensor() {
			m.resetAggro()
		}
	}
	if m.aggroTarget == nil {
		if ally := m.findWoundedAlly(); ally != nil {
			m.setAggroTarget(ally)
		}
	}
}

// findWoundedAlly picks the most-wounded (lowest health ratio) living same-
// faction ally in the aggro sensor — the healer equivalent of findAggroTarget's
// nearest-enemy pick. The sensor mask (LayerCombatants, set in NewMob) lets a
// passive-faction healer see its allies at all; this filters to same faction.
func (m *Mob) findWoundedAlly() model.Combatant {
	var best model.Combatant
	bestRatio := float32(1)
	selfID := m.Basic().ID()
	for c := range m.aggroAura.Collisions() {
		target, ok := c.Shape().UserData.(model.Combatant)
		if !ok {
			continue
		}
		if target.Faction() != m.faction || target.Basic().ID() == selfID {
			continue
		}
		r := target.HealthRatio()
		if r <= 0 || r >= 1 {
			continue // dead or full — nothing to heal
		}
		if best == nil || r < bestRatio {
			best = target
			bestRatio = r
		}
	}
	return best
}
