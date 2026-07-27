package mob

// Role-as-loadout (playtest feedback round 3, backlog §31 gap 5).
//
// ⚑ "Role" here means the COMBAT role — supporter or fighter — and it is
// derived from the loadout every tick, never authored. It is a different axis
// from the authored actor role (creature/structure/follower, items/mobs/role.go),
// which is why the finder below is loadoutSlots and not roleSlots: a follower
// can be a supporter, a structure can be a fighter.
//
// A mob used to BE a healer: NewMob checked whether slot 0 carried a heal
// effect and latched a `seekHealer` bool for the mob's whole life, and
// updateAggro then returned early on it — before threat, retaliation, the
// safe-zone break and the leash. Followers had a second early return of the
// same shape. The two collided: a follower carrying a heal aura (MedicCompanion,
// ShieldbearerCompanion) took the follower branch and never healed anything.
//
// There is no healer type any more. A mob carries a loadout, and one selector
// picks a MODE per tick from what that loadout can DO crossed with what the mob
// can SEE. The whole spectrum is then content, with no branching left:
//
//	support auras only              → pacifist healer; kill it to stop the healing
//	damage auras only               → ordinary combat mob, rule never fires
//	heal + damage                   → attacks in the gaps, heals when needed
//	damage + shield, threshold 0.5  → guardian: cleaves, shields an ally below 50%
//	threshold 0.2                   → mostly fights, emergency support only
//
// This works because mob aura switching was already fully supported and simply
// had no users: the SkillSystem re-derives the aura collider's radius AND mask
// every tick from the active slot, so flipping heal→damage retargets and
// resizes the sensor for free, and shouldApproach reads the live radius.

import (
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

// combatMode is what a mob is doing this tick. It is derived state, recomputed
// every tick by selectMode — never authored, never latched at construction.
type combatMode uint8

const (
	modeIdle combatMode = iota
	modeEngage
	modeSupport
	// modeFlee: under attack with nothing to support and no way to fight back
	// (playtest round 5, 2026-07-26). Only pacifists ever reach it — PO scope
	// call: a mob that can answer its attacker answers it.
	modeFlee
)

// supportCategories is the set of aura categories that count as supporting an
// ally — Heal and Shield (PO 2026-07-25). Resist and Light are deliberately out:
// both are ally-facing too, but a torchbearer walking to the wounded is not the
// behaviour anyone asked for, and YAGNI until content wants it.
const supportCategories = skills.AuraCategoryHeal | skills.AuraCategoryShield

// combatCategories is the set that counts as being able to fight back. A mob
// with none of these has no answer to an attacker and never acquires one.
const combatCategories = skills.AuraCategoryDamage | skills.AuraCategoryDot | skills.AuraCategorySlow

// defaultSupportThreshold [PLACEHOLDER] is the health ratio at or below which an
// ally is worth supporting when the definition authors none. 1.0 = anything
// short of full health, which is exactly what the old seek-healer did.
const defaultSupportThreshold float32 = 1.0

// loadoutSlots finds the first aura slot able to support and the first able to
// fight. −1 for absent. A multi-effect aura that does both (a damage+heal
// Paladin shape) legitimately answers to both, in which case mode switching
// resolves to the same slot and is a no-op — the loadout already is the hybrid.
func loadoutSlots(sc *skills.SkillComponent) (support, combat int) {
	support, combat = -1, -1
	for i, eq := range sc.AuraSlots {
		if eq == nil {
			continue
		}
		cats := skills.AuraCategoriesOf(eq.Def.Effects)
		if support < 0 && cats.Has(supportCategories) {
			support = i
		}
		if combat < 0 && cats.Has(combatCategories) {
			combat = i
		}
	}
	return support, combat
}

// isPacifist reports whether the mob can support but cannot fight. Such a mob
// acquires no enemies at all — it has nothing to answer an attacker with, so
// chasing one would only walk it away from the ally it exists to heal (PO
// 2026-07-25: pacifist healers ignore their attacker).
//
// Note the asymmetry with a mob carrying NO auras whatsoever (an obstacle, a
// harvest prop): that one is not a pacifist and keeps its pre-round-3 behaviour
// of acquiring and chasing harmlessly. Narrowing the rule to "carries support"
// is what keeps every existing damage and prop mob byte-identical.
func (m *Mob) isPacifist() bool {
	return m.supportSlot >= 0 && m.combatSlot < 0
}

// updateSupportTarget maintains the wounded ally this mob wants to support —
// the support-side twin of enemy acquisition, and deliberately a SEPARATE field
// from aggroTarget. Merging them is what made "who I chase", "whether my aura is
// on" and "am I in combat" one overloaded flag in the first place.
//
// Acquire at or below the authored threshold, release only at full health: the
// gap between the two is hysteresis, so a guardian healing an ally across its
// own 0.5 threshold does not drop it the instant it crosses back.
func (m *Mob) updateSupportTarget() {
	if m.supportSlot < 0 {
		return
	}
	if m.supportTarget != nil {
		r := m.supportTarget.HealthRatio()
		if r <= 0 || r >= 1 || !m.withinSensor(m.supportTarget) {
			m.supportTarget = nil
		}
	}
	if m.supportTarget == nil {
		if ally := m.findWoundedAlly(); ally != nil {
			m.supportTarget = ally
		}
	}
}

// findWoundedAlly picks the most-wounded (lowest health ratio) living same-
// faction ally at or below the support threshold within the aggro sensor — the
// support equivalent of findAggroTarget's nearest-enemy pick. The sensor mask
// (LayerCombatants, set in NewMob for any support-carrying mob) is what lets a
// passive-faction mob see its allies at all; this filters to same faction.
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
			continue // dead or full — nothing to support
		}
		if r > m.supportThreshold {
			continue // hurt, but not hurt enough to break off for
		}
		if best == nil || r < bestRatio {
			best = target
			bestRatio = r
		}
	}
	return best
}

// selectMode is the single decision point that replaced both updateAggro early
// returns. Support outranks engage on purpose: a guardian that can see a dying
// ally should drop the cleave and shield it.
//
// Flee sits BELOW support (round 5): a healer that can still do its job does it,
// even while being hit — reaching the flee case at all means the support case
// already failed, i.e. there is nobody to heal. It sits above engage only for
// readability; a pacifist has no combat slot, so the two can never compete.
func (m *Mob) selectMode() {
	next := modeIdle
	switch {
	case m.supportSlot >= 0 && m.supportTarget != nil:
		next = modeSupport
	case m.isPacifist() && m.InCombat():
		next = modeFlee
	case m.combatSlot >= 0 && m.aggroTarget != nil:
		next = modeEngage
	}
	m.applyMode(next)
}

// applyMode points the active aura slot at the chosen mode, and owns aura
// gating outright — setAggroTarget/resetAggro deliberately no longer touch it,
// so there is exactly one writer.
//
// ⚑ The thrash landmine: SkillComponent.SetActiveAura zeroes the slot's
// TickAccumulator (an anti-exploit guard against rapid-switch DPS stacking). A
// selector free to flip every tick would therefore restart the count forever and
// the mob would deal and heal EXACTLY ZERO, silently and with no error. So a
// swap of one live aura for another waits for a tick boundary: the outgoing slot
// must have completed at least one full cadence of its fastest effect. Turning
// an aura ON or OFF is unaffected — neither can discard progress.
//
// This damping is mob-side only, and must stay that way: players switch through
// SkillComponent.SetActiveAura directly (core/input.go, sys/equip), and switch
// timing mid-fight is a core skill expression per the GDD.
func (m *Mob) applyMode(next combatMode) {
	// Structures (totems, braziers, campfires) are aura-always-on: the aura IS
	// their entire behaviour and never gates (chunk 3c; authored since chunk 2).
	if m.role == mobs.RoleStructure {
		m.mode = next
		return
	}

	slot := -1
	switch next {
	case modeSupport:
		slot = m.supportSlot
	case modeEngage:
		slot = m.combatSlot
	}

	if slot != m.skills.ActiveAuraSlot {
		if slot >= 0 && m.skills.ActiveAuraSlot >= 0 && !m.auraTickBoundaryReached() {
			return // hold this mode one more tick, slot and all
		}
		m.skills.SetActiveAura(slot)
	}
	m.mode = next
}

// auraTickBoundaryReached reports whether the active slot has run long enough to
// have applied its fastest effect at least once since it became active.
func (m *Mob) auraTickBoundaryReached() bool {
	eq := m.skills.AuraSlots[m.skills.ActiveAuraSlot]
	if eq == nil {
		return true
	}
	return eq.TickAccumulator >= fastestTickInterval(eq)
}

// fastestTickInterval is the shortest effective tick interval across a skill's
// effects — the cadence that fires first after activation, and therefore the
// shortest dwell that still guarantees output.
//
// Expressed in the aura's own authored units rather than a magic tick count, so
// it self-tunes per skill and cannot drift out of sync with a retune. Tick-rate
// factor 1: mobs do not satisfy the SkillSystem's tickRateBuffed interface (only
// the player implements TickRateFactor), so their auras tick unscaled — see
// sys/skills.go. Should that change, this must take the factor too, or the dwell
// could expire before a tick-slowed aura has fired.
func fastestTickInterval(eq *skills.EquippedSkill) int {
	best := 0
	for _, e := range eq.Def.Effects {
		if n := skills.EffectiveTickInterval(e, eq.Level, 1); best == 0 || n < best {
			best = n
		}
	}
	if best == 0 {
		return 1
	}
	return best
}
