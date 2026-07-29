package mob

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Charm (plan-faction-flips chunk 3, D2/D6/D10): a charmed mob fights FOR the
// charmer as a full companion for a limited time, keeps its own level, and
// reverts when the timer runs out or the charmer leaves the world.
//
// ⚑ The three questions `owner` used to answer alone are kept apart here on
// purpose (§6.1/§6.1b) — whose level am I (owner), who gets my credit
// (CreditTo), whose signals do I follow (leader) — so each has its own pin.

const charmSource = skills.SkillID(63)

// charmedWolf returns a hostile mob charmed by a player, plus that player.
func charmedWolf(t *testing.T, ticks int) (*Mob, *fakeOwner) {
	t.Helper()
	m := NewMob(predatorDefinition(), 0, nil)
	m.SetPosition(phy.VEC2F_ZERO)
	charmer := newFakeOwner()
	m.Charm(charmer, charmSource, ticks)
	return m, charmer
}

// --- D2: credit without re-levelling (L-B / L-M) ---

func TestCharm_KeepsItsOwnLevelAndPool(t *testing.T) {
	// L-B/L-M, the pin the whole design exists to protect: Level() reads the
	// OWNER's level live since entity-model chunk 1b, so binding a charmed mob
	// through owner (or letting leader() into the stat path) would shrink a
	// charmed elite to the charmer's level. Assert on the pool, not on a field.
	def := predatorDefinition()
	def.CurveLevel = 12
	m := NewMob(def, 0, nil)
	wantLevel, wantPool := m.Level(), m.MaxHealth()

	charmer := newFakeOwner()
	charmer.prog = model.PlayerProgression{Level: 3}
	m.Charm(charmer, charmSource, 100)

	assert.Equal(t, wantLevel, m.Level(), "a charmed mob stands where it stood")
	assert.Equal(t, wantPool, m.MaxHealth(), "…so its pool does not move either")
	assert.Nil(t, m.Owner(), "the charmer is not an owner (model.Owned stays nil)")
	assert.Equal(t, float32(1), m.SummonPower(), "and it is not a summon: no owner-level output knob")
}

func TestCharm_CreditsTheCharmer(t *testing.T) {
	// D2: attribution is the OTHER question owner used to answer. CreditTo is
	// the charmer while charmed, the owner otherwise, nil for a world mob.
	m := NewMob(predatorDefinition(), 0, nil)
	require.Nil(t, m.CreditTo(), "a world mob credits nobody")

	charmer := newFakeOwner()
	m.Charm(charmer, charmSource, 100)
	assert.Equal(t, model.PlayerEntity(charmer), m.CreditTo())

	m.EndCharm()
	assert.Nil(t, m.CreditTo(), "credit ends with the charm")
}

func TestCharm_SummonKeepsCreditingItsOwner(t *testing.T) {
	// The other half of "split the question, not the field": an ordinary summon
	// answers the same player to both questions, and must keep doing so.
	owner := newFakeOwner()
	m := newTestCompanion(owner)

	assert.Equal(t, model.PlayerEntity(owner), m.CreditTo())
	assert.Equal(t, model.PlayerEntity(owner), m.Owner())
}

// --- the allegiance flip (chunk 1's seam, first consumer) ---

func TestCharm_JoinsThePlayerSideAndRevertsExactly(t *testing.T) {
	def := predatorDefinition()
	m := NewMob(def, 0, nil)
	wantFaction, wantMask := m.Faction(), m.aggroMask
	require.NotEqual(t, model.FactionAligned, wantFaction, "precondition")

	m.Charm(newFakeOwner(), charmSource, 100)
	assert.Equal(t, model.FactionAligned, m.Faction(), "a charmed mob fights on the player side")
	assert.True(t, m.MayHarm(wantFaction, 0), "…and may harm what it used to belong to")

	m.EndCharm()
	assert.Equal(t, wantFaction, m.Faction(), "revert restores the authored allegiance")
	assert.Equal(t, wantMask, m.aggroMask, "…including the curated hostileTo set")
}

func TestCharm_ExpiryRevertsOnItsOwn(t *testing.T) {
	// The timer lives in the buff store (the pip comes from there); the mob
	// polls it, because expiry has to ACT — calm's expiry did not.
	m, _ := charmedWolf(t, 3)
	require.Equal(t, model.FactionAligned, m.Faction())

	for i := 0; i < 3; i++ {
		m.ResetTickNumbers() // the StatusEffectsSystem hook that ages the buff store
		require.True(t, m.Update(0))
	}

	assert.NotEqual(t, model.FactionAligned, m.Faction(), "the charm wore off")
	assert.Zero(t, m.AppliedEffects()&skills.AppliedEffectCharm, "and the pip goes out with it")
	assert.Nil(t, m.CreditTo())
}

func TestCharm_RevertLeavesAnEmptyThreatTableSoItTurnsOnYou(t *testing.T) {
	// L-A on the revert edge: re-acquisition through the RESTORED authored mask
	// is what makes "it turns on you" free — no re-engage code.
	m, charmer := charmedWolf(t, 100)
	m.PlayerTouches(charmer, model.Damage{HP: 5}) // it took a hit while charmed

	m.EndCharm()

	assert.Nil(t, m.aggroTarget)
	assert.False(t, m.HasThreat(charmer.Basic().ID()), "the flip clears the table on both edges")
}

func TestCharm_CarriesAnAppliedEffectPip(t *testing.T) {
	// D13's client tell — the only thing that distinguishes a charmed wolf from
	// any other wolf on screen (L-C: faction is not on the wire).
	m := NewMob(predatorDefinition(), 0, nil)
	assert.Zero(t, m.AppliedEffects()&skills.AppliedEffectCharm)

	m.Charm(newFakeOwner(), charmSource, 100)
	assert.NotZero(t, m.AppliedEffects()&skills.AppliedEffectCharm)
}

// --- D6: the pet behaviour, four call sites away ---

func TestCharm_FollowsItsCharmer(t *testing.T) {
	// D6/§6.1b: leader() = charmer ?? owner, and isFollower() widens to "has a
	// leader". If the substitution misses a site the mob silently stands still
	// and fights whatever wanders past (L-H inverted) — which reads as a tuning
	// problem, not a missing call.
	m, charmer := charmedWolf(t, 100)
	charmer.pos = phy.Vec2f{X: 5, Y: 0}

	require.True(t, m.Update(0))

	assert.InDelta(t, 0.055, m.Position().Abs(), 1e-3, "it steps toward its charmer at full speed")
	assert.Greater(t, m.Position().X, float32(0.04))
}

func TestCharm_AttacksWhatItsCharmerAttacks(t *testing.T) {
	m, charmer := charmedWolf(t, 100)
	enemy := newHostileCombatant(phy.Vec2f{X: 2, Y: 0})
	charmer.attackTarget = enemy

	require.True(t, m.Update(0))

	assert.Equal(t, model.Combatant(enemy), m.aggroTarget, "assist: it takes the charmer's target")
}

func TestCharm_DefendsItsCharmer(t *testing.T) {
	m, charmer := charmedWolf(t, 100)
	attacker := newHostileCombatant(phy.Vec2f{X: 2, Y: 0})
	charmer.attacker = attacker

	require.True(t, m.Update(0))

	assert.Equal(t, model.Combatant(attacker), m.aggroTarget)
}

func TestCharm_StopsBeingAFollowerWhenItReverts(t *testing.T) {
	// The widening must be exactly as temporary as the charm: no runtime role
	// mutation, so the authored role is untouched throughout (entity-model
	// chunk 2's property).
	m, charmer := charmedWolf(t, 100)
	require.True(t, m.isFollower())

	m.EndCharm()

	assert.False(t, m.isFollower(), "a reverted mob is an ordinary world mob again")
	assert.Equal(t, mobs.RoleCreature, m.role, "…and its authored role never moved")
	_ = charmer
}

// --- D10: the charmer leaves ---

func TestCharm_RevertsWhenTheCharmerDies(t *testing.T) {
	// D10/L-G. Death and disconnect both remove the player entity from the
	// world, so the break rides one hook — but the mob-side verb is this one.
	m, charmer := charmedWolf(t, 1000)
	charmer.vs.Health = 0

	m.EndCharm()

	assert.NotEqual(t, model.FactionAligned, m.Faction())
	assert.False(t, m.isFollower(), "no dangling leader for the movement path to follow")
}

func TestCharm_CharmedByReportsTheLink(t *testing.T) {
	// The query the removal fan-out uses to find whose charm to break: a mob
	// system holds ecs ids, not player refs.
	m, charmer := charmedWolf(t, 100)

	assert.True(t, m.CharmedBy(charmer.Basic().ID()))
	assert.False(t, m.CharmedBy(charmer.Basic().ID()+1))

	m.EndCharm()
	assert.False(t, m.CharmedBy(charmer.Basic().ID()))
}

func TestCharm_EndCharmIsIdempotentAndInertOnAnUncharmedMob(t *testing.T) {
	// The removal fan-out fires on every entity leaving the world, so EndCharm
	// runs far more often than a charm exists. It must never revert a mob that
	// was never charmed — that would nuke a summon's Align().
	owner := newFakeOwner()
	summon := newTestCompanion(owner)

	summon.EndCharm()

	assert.Equal(t, model.FactionAligned, summon.Faction(), "a summon's allegiance is not charm's to revert")
	assert.Equal(t, model.PlayerEntity(owner), summon.Owner())
	assert.True(t, summon.isFollower())
}
