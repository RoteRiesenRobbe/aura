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
	"math"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
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
	// companionJitterAngle bounds the per-companion ANGULAR offset of the hold
	// point around the owner (triage item 6, ruling (c)): siblings steering to
	// the same ring bearing settle at distinct angles instead of stacking on one
	// point. Cosmetic — the hold RADIUS stays companionFollowDistance (only the
	// bearing shifts), so a companion never drifts closer to or further from the
	// owner than intended. Radians. [PLACEHOLDER]
	companionJitterAngle = 0.5
	// companionJitterBuckets quantizes the id-derived jitter angle. Prime, so
	// the multiplicative hash below scatters CONSECUTIVE entity ids (the ids of
	// companions spawned in one cast) across the range instead of into
	// near-identical angles.
	companionJitterBuckets = 619
)

// companionHoldAngleOffset is the stable per-companion angular offset applied to
// the follow bearing (triage item 6): an id-hashed angle in
// [-companionJitterAngle, companionJitterAngle). Purely functional (no rng draw,
// no time) so it is identical every tick and reproducible in the sim; a
// multiplicative hash scatters consecutive ids (companions from one cast).
func (m *Mob) companionHoldAngleOffset() float64 {
	h := (m.Basic().ID() * 2654435761) % companionJitterBuckets
	return (float64(h)/float64(companionJitterBuckets)*2 - 1) * companionJitterAngle
}

// isFollower reports whether this mob follows a leader: authored as a follower
// AND actually owned, or charmed right now.
//
// The role is the authored intent (chunk 2 — it used to be inferred from
// "owned and able to move", which made a totem's stillness the only thing
// keeping it planted). Ownership stays a runtime precondition on top of it:
// every follower path needs someone to follow or to take combat signals from,
// so an ownerless follower — a companion def placed from the zone editor —
// degrades to ordinary creature behaviour rather than standing inert.
//
// Charm widens it WITHOUT mutating the role (plan-faction-flips D6): a charmed
// wolf is a creature that is temporarily somebody's pet, and m.role is still
// never written after construction — entity-model chunk 2's property survives.
func (m *Mob) isFollower() bool {
	if m.charmer != nil {
		return true
	}
	return m.role == mobs.RoleFollower && m.owner != nil
}

// leaderCombatant is the leader as combat sees it (position/liveness); nil when
// there is none, or when its shape doesn't support it.
//
// ⚑ Every owner-read in this file goes through leader() (D6/§6.1b): a charmed
// mob follows and defends its CHARMER while keeping its own level, and the two
// links are separate fields precisely so the stat path never sees this one.
func (m *Mob) leaderCombatant() model.Combatant {
	c, _ := m.leader().(model.Combatant)
	return c
}

// updateFollow is the follower's idle movement: snap-catch-up when hopelessly
// far, walk at FULL speed toward the follow ring when beyond it, stand inside
// it. Never the idle amble — the owner (player speed 0.05/tick) outruns every
// current mob's idle pace. A dead/absent owner means stand; the TTL cleans up.
func (m *Mob) updateFollow() {
	leader := m.leaderCombatant()
	if leader == nil || leader.HealthRatio() == 0 {
		return
	}
	ownerPos := leader.Position()
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
	// Rotate the hold bearing by a small per-companion offset (item 6) so
	// siblings sharing a bearing settle at distinct angles on the ring; rotation
	// preserves |dir|, so the hold radius stays companionFollowDistance.
	if theta := m.companionHoldAngleOffset(); theta != 0 {
		cos, sin := float32(math.Cos(theta)), float32(math.Sin(theta))
		dir = phy.Vec2f{X: dir.X*cos - dir.Y*sin, Y: dir.X*sin + dir.Y*cos}
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

	signals, ok := m.leader().(model.CombatSignals)
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
// slot-0 aura mask must intersect the target's body layer. Only PROVEN
// unreachability rejects; a target without a physical body or a mob without
// an aura passes unchanged. This keeps the companion off pure hazards (e.g.
// the brazier, whose Viewport-only body no damage mask sees) — acquiring one
// would just park it in the hazard's aura until it dies.
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
	return model.AuraMaskFor(first.Def)&bodies[0].Shape().Layer != 0
}

// withinOwnerTether reports whether t is inside the combat tether around the
// OWNER (not the companion) — the companion fights beside its owner, so both
// acquisition and stickiness are bounded there.
func (m *Mob) withinOwnerTether(t model.Combatant) bool {
	leader := m.leaderCombatant()
	if leader == nil {
		return false
	}
	return t.Position().Sub(leader.Position()).Abs() <= companionTetherRadius
}
