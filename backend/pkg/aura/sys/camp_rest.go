package sys

import (
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

// The camp's rest buffs (docs/plan-campfire-traits.md CT3, D9-D11): a player
// who stays in a placed camp's heal ring for campRestTicks gets the camp
// owner's buff traits as timed buffs, refreshed every aura cycle while they
// stay. Every player who rests gets them (R10), never a mob; leaving the ring
// resets that player's clock, taking damage does not (R19). Permanent world
// fires give none (R20): only applyCamp registers a rest camp.

const (
	// campRestTicks is how long a player rests before the buffs land:
	// 5 s [PLACEHOLDER] (D10, R16).
	campRestTicks = 150
	// campRestBuffTicks is how long a rest buff lasts: 5 min [PLACEHOLDER]
	// (R12, D9). Death and logout end it sooner by construction: the buff store
	// lives on the player entity, and every respawn, revive and reconnect builds
	// a new one (D11, L6).
	campRestBuffTicks = 9000
)

// restCamp is one placed camp's rest state: its owner's buffs snapshotted at
// placement (D6, so a later respec changes the next camp only), the heal ring
// they are earned in, and a clock per resting player.
type restCamp struct {
	buffs []skills.CampRestBuff
	// ring is the camp aura's heal radius and cycle its heal interval, read at
	// placement: "in the ring" means exactly what the heal can reach.
	ring  float32
	cycle int
	// clocks counts each resting player's consecutive ticks, keyed by entity
	// id (a respawned player is a new entity and starts over). seen stamps the
	// tick a clock last counted, so a player counts once per tick and a clock
	// not stamped this tick is a player who left; the camp's own stamp advances
	// every tick, so the sweep allocates nothing.
	clocks map[uint64]restClock
	stamp  uint64
}

type restClock struct {
	ticks int
	seen  uint64
}

func newRestCamp(buffs []skills.CampRestBuff, ring float32, cycle int) *restCamp {
	return &restCamp{buffs: buffs, ring: ring, cycle: max(cycle, 1), clocks: map[uint64]restClock{}}
}

// tick advances every clock by one tick of presence in the ring around pos,
// read from the camp's aura sensor. A player lands the buffs on reaching
// campRestTicks and again on every cycle after, each a refresh under the
// store's rules (an equal stream tops its timer up; a stronger one counts over
// a weaker one, R11/R18). Refreshing every tick instead would bump the buff
// revision every tick and open the owner-state gate 30 times a second.
func (rc *restCamp) tick(pos phy.Vec2f, sensed phy.ColliderSet) {
	rc.stamp++
	for c := range sensed {
		p, ok := c.Shape().UserData.(model.PlayerEntity)
		if !ok || !withinReach(c, pos, rc.ring) {
			continue
		}
		id := p.Basic().ID()
		clock := rc.clocks[id]
		if clock.seen == rc.stamp {
			continue // a second shape of the same player
		}
		clock.seen = rc.stamp
		clock.ticks++
		rc.clocks[id] = clock
		if clock.ticks >= campRestTicks && (clock.ticks-campRestTicks)%rc.cycle == 0 {
			applyRestBuffs(p, rc.buffs)
		}
	}
	for id, clock := range rc.clocks {
		if clock.seen != rc.stamp {
			delete(rc.clocks, id)
		}
	}
}

// applyRestBuffs grants each buff with the trait's own id as the source (D9):
// damage dealt and max Focus through the stat store, movement speed through the
// speed store, which is where the movement sites read it.
func applyRestBuffs(p model.PlayerEntity, buffs []skills.CampRestBuff) {
	for _, b := range buffs {
		if b.Stat == skills.StatMovementSpeed {
			if s, ok := p.(speedApplier); ok {
				s.ApplySpeed(b.Source, 1+b.Bonus, campRestBuffTicks)
			}
			continue
		}
		if s, ok := p.(model.StatBuffable); ok {
			s.ApplyStat(b.Source, b.Stat, b.Bonus, campRestBuffTicks)
		}
	}
}

// restCampFor builds the rest state for a camp just placed by owner, or nil
// when the owner holds no buff trait (D10: such a camp skips the clock) or the
// camp aura has no heal effect to rest in.
func restCampFor(owner model.PlayerEntity, aura *skills.EquippedSkill) *restCamp {
	buffs := owner.CampRestBuffs()
	if len(buffs) == 0 || aura == nil {
		return nil
	}
	for _, e := range aura.Def.Effects {
		if e.Type == skills.EffectTypeHealAura {
			ring := skills.Scaled(e.Radius, e.RadiusPerLevel, aura.Level)
			return newRestCamp(buffs, ring, skills.EffectiveTickInterval(e, aura.Level, 1))
		}
	}
	return nil
}
