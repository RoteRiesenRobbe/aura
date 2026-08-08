package mob

// The stun's door on Mob (plan-cc-and-retaliation.md C3) — the FOURTH CC door,
// and the reason C1 put the immunity gate on the doors rather than on the
// SkillSystem's eligibility layer: a CC added later inherits the gate by
// construction, and this is the chunk that cashes that in.

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const stunDoorSource = skills.SkillID(210)

func TestStun_HaltsTheMob(t *testing.T) {
	m := newTestMob()
	full := m.stepLength()
	require.Greater(t, full, float32(0), "precondition: the fixture moves")

	m.ApplyStun(stunDoorSource, 90)

	assert.Equal(t, float32(0), m.stepLength(), "a stunned mob does not move at all")
}

// C1's gate, inherited: an immune species refuses the stun exactly as it
// refuses slow, calm and charm. This is the pin that proves the door layer was
// the right place — no change to the immunity code was needed to cover a CC
// that did not exist when it was written.
func TestStun_IsRefusedByACCImmuneSpecies(t *testing.T) {
	m := NewMob(immuneDefinition(), 0, nil)
	full := m.stepLength()

	m.ApplyStun(stunDoorSource, 90)

	assert.False(t, m.buffs.Stunned(), "no timer is left running to expire later")
	assert.Equal(t, full, m.stepLength(), "…and it keeps walking")
}

// A5: a stunned mob KEEPS its threat table and its aggro target. The deliberate
// opposite of calm, whose door calls resetAggro() — calm is a DISENGAGE tool, a
// stun is a CONTROL tool, and a stun that also wiped aggro would be a strictly
// better calm.
func TestStun_KeepsItsAggroTarget(t *testing.T) {
	m, _ := aggroedMob(t)

	m.ApplyStun(stunDoorSource, 90)

	assert.NotNil(t, m.aggroTarget, "it is held, not calmed — it is still coming for you")
	assert.False(t, m.Calmed(), "and a stun is not a calm")
}

// PO 2026-08-08, found in the first hand playtest: a stunned mob dealt no
// damage but STILL DREW ITS AURA RING, which reads as "it is hitting me and the
// damage is broken" rather than as "it is held".
//
// ⚑ The suppression is real — processEntity returns before the aura fires — but
// the three read-only wire projections do not go through it: they read
// ActiveAuraSlot, which a stun deliberately does NOT clear. It cannot: clearing
// it means SetActiveAura, which zeroes TickAccumulator and would break A6's
// cadence freeze (and is the same landmine plan-mob-tether D5 records).
// So the projections answer "nothing is active" on their own while held.
func TestStun_HidesTheAuraOnTheWire(t *testing.T) {
	m, _ := aggroedMob(t)
	require.NotZero(t, m.AuraRadius(), "precondition: the ring is drawn while it fights")
	require.NotZero(t, m.AuraCategories(), "precondition: the ring has a colour")

	m.ApplyStun(stunDoorSource, 3)

	assert.Zero(t, m.AuraCategories(), "the client draws rings off this mask — a held mob must show none")
	assert.Zero(t, m.AuraRadius(), "…and there is no radius to size them by")
	assert.Zero(t, m.AuraTickInterval(), "…and no beat to indicate")
	assert.Equal(t, 0, m.SkillComponent().ActiveAuraSlot,
		"⚑ the SLOT is untouched — clearing it would zero the accumulator and break the cadence freeze")

	for i := 0; i < 3; i++ {
		m.ResetTickNumbers()
	}
	assert.NotZero(t, m.AuraRadius(), "the ring returns with the mob")
	assert.NotZero(t, m.AuraCategories())
}

// D8 (PO 2026-08-08): damage does NOT break the stun. It holds today for a
// structural reason — DropCalm is typed to *calmPayload, so the break-on-damage
// path cannot see a stun — and this pin is what stops that from being an
// accident. Generalising that path to "drop all CC" would silently make every
// stun useless in an aura game, where the caster's own damage is always on and
// would break the stun on the very tick it lands.
func TestStun_SurvivesDamage_AndCalmStillBreaks(t *testing.T) {
	m, p := aggroedMob(t)
	m.ApplyStun(stunDoorSource, 90)
	m.ApplyCalm(calmSource, 90)
	require.True(t, m.Calmed(), "precondition: both are up")

	// A hit lands, and the mob's own Update runs the break-on-damage check.
	m.PlayerTouches(p, model.Damage{HP: 5})
	require.True(t, m.Update(0))

	assert.False(t, m.Calmed(), "damage breaks the calm, as it always has")
	assert.True(t, m.buffs.Stunned(), "…and leaves the stun exactly where it was")
}

// The stun runs out and the mob simply carries on: no residue, no re-latch, no
// cleanup step that someone has to remember to call.
func TestStun_ExpiryRestoresMovement(t *testing.T) {
	m := newTestMob()
	m.SetPosition(phy.VEC2F_ZERO)
	full := m.stepLength()
	m.ApplyStun(stunDoorSource, 3)

	for i := 0; i < 3; i++ {
		require.Equal(t, float32(0), m.stepLength(), "tick %d: still held", i)
		m.ResetTickNumbers() // the StatusEffectsSystem hook that ages the buff store
	}

	assert.Equal(t, full, m.stepLength(), "an expired stun leaves nothing behind")
	_ = model.Damage{}
}
