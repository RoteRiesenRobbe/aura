package mob

// The live bug this chunk was opened for (playtest round 3, 2026-07-25): a lone
// healer regenerated through incoming damage and was effectively unkillable by a
// solo player. It never acquired an aggro target, "in combat" WAS "has an aggro
// target", so it sat in the out-of-combat branch every tick and healed itself
// back up faster than it was being hurt.

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/constant"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMob_LoneHealerUnderFireIsKillable(t *testing.T) {
	m := newTestHealerMob()
	require.True(t, m.isPacifist(), "no combat aura: it will never acquire a target")

	// Chip away at it with hits well under the old regen-per-tick rate, the
	// pattern that used to be unwinnable.
	start := m.Health()
	for i := 0; i < 20; i++ {
		m.takeDamage(model.Damage{HP: 2}, model.StatusEffectDamagedAmbient)
		m.Update(0)
	}

	assert.Less(t, m.Health(), start, "sustained chip damage now actually lands")
	assert.Nil(t, m.aggroTarget, "and it still never fights back (pacifist, PO 2026-07-25)")
}

// The flip side of the same rule: left alone, a wounded healer still heals up.
// The fix is a combat gate, not a removal of mob regeneration.
func TestMob_HealerStillRegeneratesWhenLeftAlone(t *testing.T) {
	m := newTestHealerMob()
	m.health = m.MaxHealth() / 2
	wounded := m.Health()

	for i := 0; i < constant.CombatRegenGraceTicks+5; i++ {
		m.Update(0)
	}

	assert.Greater(t, m.Health(), wounded, "disengaging still lets it recover")
}

// --- pacifist flee (playtest round 5, 2026-07-26) ---
//
// The observation: a healer or drummer beaten on with nothing in range to heal
// or shield just stood there taking it. Round 3 is what made this visible — it
// gave pacifists a reason to hold still (support) without giving them anything
// to do when there is nobody to support.
//
// ⚑ Why factors.fleeBelowHealthRatio does NOT cover this. It exists, it looks
// like the knob for exactly this, and authoring it on BanditHealer does
// *nothing*: shouldFlee() is only consulted inside `case m.aggroTarget != nil`
// (Update), and a pacifist never acquires an aggro target by design. The ask is
// also not a cowardice threshold — it fires at full health — so it is a MODE,
// not a ratio.

func TestMob_PacifistUnderFireFleesFromAttacker(t *testing.T) {
	m := newTestHealerMob()
	require.True(t, m.isPacifist())
	m.SetPosition(phy.Vec2f{X: 1, Y: 1})

	p := newFakeAuraPlayer()
	p.pos = phy.Vec2f{X: 1, Y: 0.5} // due south of the mob
	m.PlayerTouches(p, model.Damage{HP: 5})

	require.True(t, m.Update(0))

	assert.Equal(t, modeFlee, m.mode, "attacked, nothing to support ⇒ flee")
	// Away from the top-threat attacker = due north, exactly one step. Same
	// vector the health-threshold flee produces; this only changes what selects
	// it and what it flees FROM.
	assert.InDelta(t, 1, m.Position().X, 1e-5)
	assert.InDelta(t, float64(1+m.velocity), float64(m.Position().Y), 1e-5)
	assert.Nil(t, m.aggroTarget, "fleeing is not fighting back — still a pacifist")
	assert.Equal(t, -1, m.skills.ActiveAuraSlot, "and it has nobody to heal, so no ring")
}

// The flee ends itself: InCombat() is the damage-recency window round 3 built,
// so the mob calms down and goes back to wandering with no new timer.
func TestMob_PacifistFleeEndsWithTheCombatWindow(t *testing.T) {
	m := newTestHealerMob()
	p := newFakeAuraPlayer()
	p.pos = phy.Vec2f{X: -1, Y: 0}
	m.PlayerTouches(p, model.Damage{HP: 5})

	require.True(t, m.Update(0))
	require.Equal(t, modeFlee, m.mode)

	for i := 0; i < constant.CombatRegenGraceTicks+5; i++ {
		m.Update(0)
	}

	assert.Equal(t, modeIdle, m.mode, "the damage-recency window lapses ⇒ back to idle")
}

// Support outranks flee: a healer that can still do its job does it, even while
// being hit. Ordering in selectMode is what enforces this.
func TestMob_PacifistPrefersSupportOverFlee(t *testing.T) {
	m := newTestHealerMob()
	ally := newFakeCombatant()
	ally.faction = m.faction
	ally.healthRatio = 0.5
	ally.pos = phy.Vec2f{X: 0.5, Y: 0}

	space := phy.NewSpace()
	space.AddShape(m.aggroAura)
	addSensorContact(m, space, ally, model.LayerActionCollision)
	require.NotEmpty(t, m.aggroAura.Collisions())

	p := newFakeAuraPlayer()
	p.pos = phy.Vec2f{X: -1, Y: 0}
	m.PlayerTouches(p, model.Damage{HP: 5})

	require.True(t, m.Update(0))

	assert.Equal(t, modeSupport, m.mode, "a wounded ally in range outranks running away")
	assert.Equal(t, m.supportSlot, m.skills.ActiveAuraSlot, "and the heal aura is on")
}

// Stationary support mobs (campfires, totems, braziers) are pacifists too, so
// they now reach modeFlee when damaged. That must stay inert: they are
// role structure, which early-returns out of applyMode before any aura gating,
// and moveAwayFrom refuses to move a zero-velocity mob. This is the one place
// the new mode meets an existing early return.
func TestMob_StationaryPacifistCannotFleeAndKeepsItsAura(t *testing.T) {
	def := testMobDefinition()
	def.Role = mobs.RoleStructure // ⇒ aura always on (chunk 2: authored, not speed-inferred)
	def.Factors.Speed = 0
	def.Skills = []mobs.MobSkill{{Def: testHealAuraSkill(), Level: 1}}
	m := NewMob(def, 0, nil)
	require.Equal(t, mobs.RoleStructure, m.role)
	m.SetPosition(phy.Vec2f{X: 2, Y: 2})
	before := m.Position()
	activeBefore := m.skills.ActiveAuraSlot

	p := newFakeAuraPlayer()
	p.pos = phy.Vec2f{X: 1, Y: 2}
	m.PlayerTouches(p, model.Damage{HP: 5})
	require.True(t, m.Update(0))

	assert.Equal(t, before, m.Position(), "a brazier does not run away")
	assert.Equal(t, activeBefore, m.skills.ActiveAuraSlot, "and its aura never gates")
}

// Scope is pacifists only (PO 2026-07-26): a mob that can fight back answers an
// attacker the way it always did. This is the regression guard for every
// existing damage mob.
func TestMob_FighterUnderFireDoesNotFlee(t *testing.T) {
	m := newTestMob() // damage aura, no support
	require.False(t, m.isPacifist())

	p := newFakeAuraPlayer()
	p.pos = phy.Vec2f{X: -1, Y: 0}
	m.PlayerTouches(p, model.Damage{HP: 5})

	require.True(t, m.Update(0))

	assert.NotEqual(t, modeFlee, m.mode, "it has an answer; flee is not for it")
}
