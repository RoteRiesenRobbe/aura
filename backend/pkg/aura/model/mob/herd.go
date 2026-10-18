package mob

import (
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/constant"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
)

// Herding (plan-herding.md): a mob whose definition carries `herd` runs from
// every player inside its sensor, remembers who it ran from, and — with a pen
// — counts for all of them once it has stood in the pen long enough.
//
// ⭐ Running is MOVEMENT, never a fight: no aggro target, no threat row, no
// combat state and no returnPos (D2). That is what keeps leash, regen, combat
// music and the M1-F5(B) walk-home freeze out of it, and it is why the branch
// sits below every combat case in Update's switch.

// herderMemoryTicks is how long a player stays a herder after a sheep last ran
// from them (D3, R2): long enough for a player who drove a sheep to the gate to
// keep the credit, short enough that scaring it once and leaving does not.
// [PLACEHOLDER] 10 s.
const herderMemoryTicks = 10 * constant.TicksPerSecond

// penDwellTicks is how long a herd animal must stand inside its pen to count
// (R3). [PLACEHOLDER] 2 s.
const penDwellTicks = 2 * constant.TicksPerSecond

// herder is one player a herd animal ran from, and on which of its own ticks.
type herder struct {
	player   model.PlayerEntity
	lastTick uint64
}

// HerdPen is the region this mob counts in, "" for none — including every mob
// that is no herd animal at all.
func (m *Mob) HerdPen() string {
	if m.definition.Herd == nil {
		return ""
	}
	return m.definition.Herd.Pen
}

// herdPush is where a herd animal runs from this tick (D2, R12): the point
// whose away-direction is the sum of every herding player's push, each the
// unit vector from the player to the animal weighted by 1/distance — so one
// player drives it straight away, two flanking players steer it between them,
// and the nearer of two pushes harder. Every player counted is noted as a
// herder (D3). ok is false with nobody to run from.
//
// Only players on the ground herd (R9): a companion on the player layer is a
// mob, not a PlayerEntity, and a flyer or a stealthed player is not there. A
// dead player has left the space, and its departure fan-out (ForgetEntity)
// drops it from the herders too.
func (m *Mob) herdPush() (from phy.Vec2f, ok bool) {
	pos := m.Position()
	runRadius := m.definition.Body.AggroRadius
	var push phy.Vec2f
	for c := range m.aggroAura.Collisions() {
		p, isPlayer := c.Shape().UserData.(model.PlayerEntity)
		if !isPlayer || p.Flying() || model.IsStealthed(p) {
			continue
		}
		// The sensor is the wider of the run radius and a talking stray's
		// talk range (SenseRadius), so the run radius is judged here, centre
		// to centre (D12): a stubborn stray lets you into talk range.
		delta := pos.Sub(p.Position())
		d2 := delta.AbsSq()
		if d2 > runRadius*runRadius {
			continue
		}
		if m.herders == nil {
			m.herders = make(map[uint64]herder)
		}
		m.herders[p.Basic().ID()] = herder{player: p, lastTick: m.herdTick}
		ok = true

		if d2 > 1e-8 {
			push = push.Add(delta.Div(d2))
		}
	}
	// A zero sum (exact cancellation, or a player on top of it) hands
	// moveAwayFrom a threat at its own position, which keeps its heading.
	return pos.Sub(push), ok
}

// tickHerd advances the herd clock and drops the herders it has forgotten
// (D3). The clock is the mob's own: it stops while the mob sleeps, which is why
// SetDormant clears the memory.
func (m *Mob) tickHerd() {
	m.herdTick++
	for id, h := range m.herders {
		if m.herdTick-h.lastTick > herderMemoryTicks {
			delete(m.herders, id)
		}
	}
}

// UpdatePen advances the pen timer (D4, R3): inside counts up, outside starts
// over. At penDwellTicks the animal is penned — every remembered herder gets
// one credit on the species counter kill and harvest share (D5), and the mob
// leaves the world the way a TTL expiry does: health zeroed, no kill rewards,
// its spawn point schedules the respawn. An animal nobody herded leaves the
// same way with no credit, so the pen never fills. Reports whether it was
// penned; the caller removes it.
func (m *Mob) UpdatePen(inside bool) bool {
	if !inside {
		m.penTicks = 0
		return false
	}
	m.penTicks++
	if m.penTicks < penDwellTicks {
		return false
	}
	for _, h := range m.herders {
		if ledger := h.player.QuestLedger(); ledger != nil {
			ledger.NoteKill(m.definition.ID)
		}
	}
	m.herders = nil
	m.penTicks = 0
	m.health = 0
	return true
}
