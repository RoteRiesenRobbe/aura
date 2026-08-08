package mob

// CC immunity at the doors (docs/archive/plan-cc-and-retaliation.md C1, D1 + A3).
//
// `Mob` is the only entity that can be CC'd at all, and it exposes exactly
// three doors — ApplySlow, ApplyCalm, Charm. The gate sits on each door rather
// than on the eligibility layer in sys/skills.go, so that any future CC (the
// stun in C3) inherits it by construction, and so that a whiff against an
// immune elite still counts as an act of hostility while refunding the caster.
//
// ⚑ The three doors are NOT the same shape — different return types, and one
// of them has a side effect. They will not accept a copy-pasted early return,
// which is what these pins are here to hold. Each asserts on BEHAVIOUR (does
// it move, does it hold its target, whose side is it on) rather than on the
// buff store, for the reason the entity-model chunks recorded: a populated
// field is not a working mechanic.

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// A distinct id from calmSource/charmSource so a leaked buff names itself.
const ccImmuneSource = skills.SkillID(64)

// immuneDefinition is an ordinary test mob that authored factors.ccImmune.
// Tier is deliberately left at the default: the flag is per-mob, and the
// loader's tier requirement (A1) is a separate rule tested in items/mobs.
func immuneDefinition() *mobs.MobDefinition {
	def := testMobDefinition()
	def.Factors.CCImmune = true
	return def
}

// --- door 1: ApplySlow ---

func TestCCImmune_SlowIsRefusedAndNothingSlowsDown(t *testing.T) {
	immune := NewMob(immuneDefinition(), 0, nil)
	full := immune.stepLength()
	require.Greater(t, full, float32(0), "precondition: the fixture moves")

	assert.False(t, immune.ApplySlow(ccImmuneSource, 0.5, 100),
		"the return means 'freshly slowed' — an immune mob was not")
	assert.Equal(t, float32(0), immune.buffs.SlowFraction(), "and nothing was written to the store")
	assert.Equal(t, full, immune.stepLength(), "so it still moves at full speed")

	// Control: the same call on the same fixture without the flag.
	normal := newTestMob()
	require.True(t, normal.ApplySlow(ccImmuneSource, 0.5, 100))
	assert.Less(t, normal.stepLength(), full, "precondition: the slow works on anything else")
}

// --- door 2: ApplyCalm (L1 — the door with the side effect) ---

func TestCCImmune_CalmKeepsTheAggroLink(t *testing.T) {
	// L1, the load-bearing one. ApplyCalm calls resetAggro() INSIDE the door.
	// A gate placed after the buff write — or one that forgets the side effect
	// is there at all — ships a boss that "resists" the calm and drops its
	// target anyway, which is precisely the failure the immunity exists to
	// prevent: the disengage lands while the debuff does not.
	m, _ := aggroedImmuneMob(t)

	m.ApplyCalm(ccImmuneSource, 100)

	assert.False(t, m.Calmed(), "the buff is refused")
	assert.NotNil(t, m.aggroTarget, "…and so is the disengage that rides inside the same door")

	// It keeps fighting, tick after tick — the calm bought nothing at all.
	for i := 0; i < 5; i++ {
		require.True(t, m.Update(0))
		require.NotNil(t, m.aggroTarget, "tick %d: still on you", i)
	}
	assert.Equal(t, 0, m.SkillComponent().ActiveAuraSlot, "and its aura stays on")
}

// --- door 3: Charm ---

func TestCCImmune_CharmIsRefusedBeforeTheFactionFlip(t *testing.T) {
	def := predatorDefinition()
	def.Factors.CCImmune = true
	m := NewMob(def, 0, nil)
	m.SetPosition(phy.VEC2F_ZERO)
	wantFaction, wantMask := m.Faction(), m.aggroMask
	require.NotEqual(t, model.FactionAligned, wantFaction, "precondition: it is not on the player side")

	charmer := newFakeOwner()
	m.Charm(charmer, ccImmuneSource, 100)

	assert.Equal(t, wantFaction, m.Faction(), "an immune mob does not change sides")
	assert.Equal(t, wantMask, m.aggroMask, "…and keeps hunting what it hunted")
	assert.Nil(t, m.charmer, "the companion link is never made")
	assert.Nil(t, m.CreditTo(), "so nobody collects its credit")
	assert.False(t, m.buffs.Charmed(), "and no timer is left running to expire later")

	// Control: the same call without the flag flips it.
	control, _ := charmedWolf(t, 100)
	require.Equal(t, model.FactionAligned, control.Faction(), "precondition: charm works on anything else")
}

// aggroedImmuneMob is calm_test.go's aggroedMob with the flag set: a CC-immune
// mob that has just been hit by a player standing inside its sensor, i.e. one
// with a live aggro link and its aura switched on.
func aggroedImmuneMob(t *testing.T) (*Mob, *fakeAuraPlayer) {
	t.Helper()
	m := NewMob(immuneDefinition(), 0, nil)
	m.SetPosition(phy.VEC2F_ZERO)
	p := newFakeAuraPlayer()
	p.pos = phy.Vec2f{X: 0.3, Y: 0}
	m.PlayerTouches(p, model.Damage{HP: 5})
	require.True(t, m.Update(0))
	require.NotNil(t, m.aggroTarget, "precondition: the mob is fighting")
	return m, p
}
