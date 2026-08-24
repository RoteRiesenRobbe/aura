package player

// plan-immune-feedback.md: the player half of the immune_hit per-tick
// one-shot. Only full mitigation sets it - god mode short-circuits earlier
// and writes no flag (D6), a gate-keyed hit at a player was never a valid
// target (D1), and a 0-HP hit is a no-op, not immunity.

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/stretchr/testify/assert"
)

// newImmuneHitTestPlayer is newTestPlayer plus the status-effect store a
// landing hit writes into (the CritLandsOnCritTaken precedent).
func newImmuneHitTestPlayer() *player {
	p := newTestPlayer(nil)
	p.statusEffects = model.NewStatusEffects()
	return p
}

func TestPlayer_ImmuneHit_FullResistSetsFlag(t *testing.T) {
	p := newImmuneHitTestPlayer()
	p.ApplyResist(69, []string{skills.ResistWildcard}, 0, 2) // immunity buff

	p.MobTouches(newFakeAttackerMob(), mobs.Factors{Damage: 10, DamageTags: []string{"physical"}})

	assert.True(t, p.ImmuneHit())
	assert.Zero(t, p.DamageTaken())
}

func TestPlayer_ImmuneHit_GodWritesNoFlag(t *testing.T) {
	// D6: IsGod() returns before the mitigation check - a god player simply
	// never sets the flag, no code needed.
	p := newImmuneHitTestPlayer()
	p.SetGodmode(true)

	p.MobTouches(newFakeAttackerMob(), mobs.Factors{Damage: 10})

	assert.False(t, p.ImmuneHit())
}

func TestPlayer_ImmuneHit_GateMissStaysSilent(t *testing.T) {
	// D1: a player has no gate keys at all, so a gated hit never damages one -
	// and it is a non-target, not an immune target.
	p := newImmuneHitTestPlayer()

	p.MobTouches(newFakeAttackerMob(), mobs.Factors{Damage: 10, GateKey: "harvest"})

	assert.False(t, p.ImmuneHit())
}

func TestPlayer_ImmuneHit_NormalAndZeroDamageLeaveFlagUnset(t *testing.T) {
	p := newImmuneHitTestPlayer()
	p.MobTouches(newFakeAttackerMob(), mobs.Factors{Damage: 10})
	assert.False(t, p.ImmuneHit(), "a landing hit is not immunity")

	q := newImmuneHitTestPlayer()
	q.MobTouches(newFakeAttackerMob(), mobs.Factors{Damage: 0})
	assert.False(t, q.ImmuneHit(), "a zero-damage hit is a no-op, not immunity")
}

func TestPlayer_ImmuneHit_ResetTickNumbersClearsIt(t *testing.T) {
	p := newImmuneHitTestPlayer()
	p.ApplyResist(69, []string{skills.ResistWildcard}, 0, 2)
	p.MobTouches(newFakeAttackerMob(), mobs.Factors{Damage: 10, DamageTags: []string{"physical"}})
	assert.True(t, p.ImmuneHit())

	p.ResetTickNumbers()

	assert.False(t, p.ImmuneHit(), "per-tick one-shot like damage_taken")
}
