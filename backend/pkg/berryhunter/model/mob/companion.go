package mob

// Companion follower behavior (mob-depth chunk 6): an owned, MOVING summon
// follows its owner and fights per §3.6 — attack what the owner attacks
// (assist) or what attacks the owner (defend), sticky until the target dies
// or leaves the owner tether, then resume following. Acquisition reads the
// owner's combat signals (model.CombatSignals) instead of the aggro sensor:
// the sensor mask sees the player layer, useless for an aligned mob — and the
// signals are exactly the §3.6 events. Follow movement rides moveTowards, so
// obstacle steering and slows apply like everywhere else.

import (
	"github.com/trichner/berryhunter/pkg/berryhunter/model"
	"github.com/trichner/berryhunter/pkg/berryhunter/phy"
)

// [PLACEHOLDER] companion tuning defaults.
const (
	// companionFollowDistance is the hold ring around the owner
	// (center-to-center): beyond it the companion walks, inside it stands.
	companionFollowDistance float32 = 1.5
	// companionTeleportDistance is the "hopelessly far" catch-up threshold:
	// beyond it the companion snaps beside the owner instead of walking —
	// steering only handles convex blockers, a wall could otherwise strand it
	// for its whole TTL (the sanctioned exception to gotcha #6).
	companionTeleportDistance float32 = 15
	// companionTetherRadius bounds combat to the owner's surroundings: a
	// signal target beyond it is never acquired, a sticky target drifting
	// beyond it is dropped — the companion never strays from its owner.
	companionTetherRadius float32 = 10
)

// isFollower reports whether this mob follows an owner: owned and able to
// move. The totem (speed 0) stays a stationary hazard; a zone-spawned mob has
// no owner. Deliberately implicit — no schema flag until content needs a
// non-following mobile summon (YAGNI, recorded at chunk-6 plan-first).
func (m *Mob) isFollower() bool {
	return m.owner != nil && m.velocity > 0
}

// ownerCombatant is the owner as combat sees it (position/liveness); nil when
// the owner shape doesn't support it.
func (m *Mob) ownerCombatant() model.Combatant {
	c, _ := m.owner.(model.Combatant)
	return c
}

// updateFollow is the follower's idle movement: snap-catch-up when hopelessly
// far, walk at FULL speed toward the follow ring when beyond it, stand inside
// it. Never the idle amble — the owner (player speed 0.05/tick) outruns every
// current mob's idle pace. A dead/absent owner means stand; the TTL cleans up.
func (m *Mob) updateFollow() {
	owner := m.ownerCombatant()
	if owner == nil || owner.HealthRatio() == 0 {
		return
	}
	ownerPos := owner.Position()
	delta := m.Position().Sub(ownerPos)
	distance := delta.Abs()
	if distance <= companionFollowDistance {
		return
	}

	// Ring point nearest the companion: moveTowards' arrival clamp then stops
	// the walk ON the ring instead of pushing into the owner.
	var dir phy.Vec2f
	if distance < 1e-4 {
		dir = m.heading
	} else {
		dir = delta.Div(distance)
	}
	ringPoint := ownerPos.Add(dir.Mult(companionFollowDistance))

	if distance > companionTeleportDistance {
		m.SetPosition(ringPoint)
		return
	}
	m.moveTowards(ringPoint)
}

// updateCompanionTargeting replaces sensor acquisition, threat retention and
// the leash for followers (§3.6): hold the sticky target while it lives
// within the owner tether; otherwise acquire from the owner's combat signals,
// defend before assist. setAggroTarget/resetAggro keep driving the aura gate.
func (m *Mob) updateCompanionTargeting() {
	if m.aggroTarget != nil {
		if m.aggroTarget.HealthRatio() == 0 || !m.withinOwnerTether(m.aggroTarget) {
			m.resetAggro()
		}
		return
	}

	signals, ok := m.owner.(model.CombatSignals)
	if !ok {
		return
	}
	// Defend beats assist: protecting the owner is the more urgent signal.
	for _, t := range [...]model.Combatant{signals.RecentAttacker(), signals.RecentAttackTarget()} {
		if t == nil || t.HealthRatio() == 0 || t.Faction() == m.faction {
			continue
		}
		if !m.withinOwnerTether(t) || !m.auraCanReach(t) {
			continue
		}
		m.setAggroTarget(t)
		return
	}
}

// auraCanReach reports whether the companion's aura could ever hit t: the
// prospective aura mask (slot 0 + own faction — the sensor's stored mask is
// stale while the aura is gated) must intersect the target's body layer.
// Only PROVEN unreachability rejects; a target without a physical body or a
// mob without an aura passes unchanged. This keeps the companion off pure
// hazards (e.g. the brazier, whose Viewport-only body no damage mask sees) —
// acquiring one would just park it in the hazard's aura until it dies.
func (m *Mob) auraCanReach(t model.Combatant) bool {
	first := m.skills.AuraSlots[0]
	if first == nil {
		return true
	}
	bodied, ok := t.(model.BodiedEntity)
	if !ok {
		return true
	}
	bodies := bodied.Bodies()
	if len(bodies) == 0 {
		return true
	}
	// Bodies()[0] is the main physical body by BaseEntity convention (sensors
	// are appended after it).
	return model.AuraMaskFor(first.Def, m.faction)&bodies[0].Shape().Layer != 0
}

// withinOwnerTether reports whether t is inside the combat tether around the
// OWNER (not the companion) — the companion fights beside its owner, so both
// acquisition and stickiness are bounded there.
func (m *Mob) withinOwnerTether(t model.Combatant) bool {
	owner := m.ownerCombatant()
	if owner == nil {
		return false
	}
	return t.Position().Sub(owner.Position()).Abs() <= companionTetherRadius
}
