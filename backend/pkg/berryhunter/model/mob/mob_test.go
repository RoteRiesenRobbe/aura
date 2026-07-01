package mob

// Characterization tests pinning the CURRENT hardcoded mob aura behavior.
// They are the "old" side of the Phase 6 strict 1:1 migration comparison
// (docs/skill-system-design.md, Phase 6): once mobs move onto the SkillSystem,
// the new path must reproduce exactly these numbers and rules. Any deviation
// from these tests during the migration is a bug, not a design change.

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/trichner/berryhunter/pkg/berryhunter/items"
	"github.com/trichner/berryhunter/pkg/berryhunter/items/mobs"
	"github.com/trichner/berryhunter/pkg/berryhunter/model"
	"github.com/trichner/berryhunter/pkg/berryhunter/model/constant"
	"github.com/trichner/berryhunter/pkg/berryhunter/model/vitals"
	"github.com/trichner/berryhunter/pkg/berryhunter/phy"
)

func testMobDefinition() *mobs.MobDefinition {
	return &mobs.MobDefinition{
		ID:   1,
		Name: "Dodo", // must be a valid BerryhunterApi entity type name
		Factors: mobs.Factors{
			Vulnerability:  2.0,
			DamageFraction: 0.05,
			Speed:          1.0,
			Experience:     42,
		},
		Body: mobs.Body{
			Radius:       0.3,
			DamageRadius: 0.5,
			// AggroRadius unset on purpose — the default is characterized below.
		},
	}
}

func newTestMob() *Mob {
	return NewMob(testMobDefinition(), false, 0, 0)
}

// fakeAuraPlayer implements the slices of model.PlayerEntity that the mob
// interacts with. Unimplemented methods panic via the embedded nil interface.
type fakeAuraPlayer struct {
	model.PlayerEntity
	pos    phy.Vec2f
	radius float32
	vs     model.PlayerVitalSigns
	xp     []uint64
}

func (f *fakeAuraPlayer) Position() phy.Vec2f                { return f.pos }
func (f *fakeAuraPlayer) Radius() float32                    { return f.radius }
func (f *fakeAuraPlayer) VitalSigns() *model.PlayerVitalSigns { return &f.vs }
func (f *fakeAuraPlayer) AddExperience(xp uint64)            { f.xp = append(f.xp, xp) }

func newFakeAuraPlayer() *fakeAuraPlayer {
	return &fakeAuraPlayer{
		radius: 0.25,
		vs:     model.PlayerVitalSigns{Health: vitals.Max},
	}
}

// mobTouchRecorder implements model.Interacter and records MobTouches calls —
// it stands in for whatever the mob's damage aura hits.
type mobTouchRecorder struct {
	factors []mobs.Factors
}

func (r *mobTouchRecorder) PlayerHitsWith(p model.PlayerEntity, item items.Item)       {}
func (r *mobTouchRecorder) PlayerTouches(p model.PlayerEntity, damageFraction float32) {}
func (r *mobTouchRecorder) MobTouches(m model.MobEntity, factors mobs.Factors) {
	r.factors = append(r.factors, factors)
}

// --- damage intake (what player auras do to the mob) ---

func TestMob_PlayerTouches_AppliesVulnerability(t *testing.T) {
	m := newTestMob()

	m.PlayerTouches(newFakeAuraPlayer(), 0.1)

	assert.Equal(t, vitals.Max.SubFraction(0.1*2.0), m.Health(),
		"incoming damage is scaled by Factors.Vulnerability")
	assert.Contains(t, m.StatusEffects().Effects(), model.StatusEffectDamagedAmbient)
}

func TestMob_PlayerTouches_ZeroVulnerabilityDefaultsToOne(t *testing.T) {
	def := testMobDefinition()
	def.Factors.Vulnerability = 0
	m := NewMob(def, false, 0, 0)

	m.PlayerTouches(newFakeAuraPlayer(), 0.1)

	assert.Equal(t, vitals.Max.SubFraction(0.1), m.Health())
}

// --- kill rewards ---

func TestMob_KillGrantsExperienceExactlyOnce(t *testing.T) {
	m := newTestMob()
	p := newFakeAuraPlayer()

	m.PlayerTouches(p, 1.0) // 1.0 * vulnerability 2.0 → overkill, health clamps to 0

	require.Equal(t, vitals.VitalSign(0), m.Health())
	require.Equal(t, []uint64{42}, p.xp, "killer receives Factors.Experience")

	// A second touch on the corpse must not grant rewards again.
	m.PlayerTouches(p, 1.0)
	assert.Equal(t, []uint64{42}, p.xp)
}

func TestMob_Update_DeadMobWithAggroTargetIsRemoved(t *testing.T) {
	m := newTestMob()
	m.SetPosition(phy.Vec2f{X: 1, Y: 1}) // initializes spawn territory
	p := newFakeAuraPlayer()
	p.pos = phy.Vec2f{X: 1.2, Y: 1}
	m.aggroTarget = p
	m.health = 0

	assert.False(t, m.Update(0),
		"a dead mob that still has an aggro target reports death and gets removed")
}

// TestMob_Update_DeadMobWithoutAggro_ZombieBug documents a real bug found while
// writing these tests: Update applies out-of-combat regeneration BEFORE the
// death check, so a mob that reaches 0 health while it has no aggro target
// (reachable by kiting it out of its territory until it drops aggro, then
// letting the aura finish it) heals itself above zero in the same tick and
// survives. Because deathRewardGiven is already latched, the resurrected mob
// never grants XP or drops again. MobSystem relies solely on Update's return
// value, so nothing else removes it.
//
// This test pins the CURRENT (buggy) behavior on purpose — fixing it means
// checking health before regenerating (or right after aura intake). When the
// fix lands, invert these assertions.
func TestMob_Update_DeadMobWithoutAggro_ZombieBug(t *testing.T) {
	m := newTestMob()
	m.health = 0 // dead, but no aggro target and no spawn set

	alive := m.Update(0)

	assert.True(t, alive, "BUG: corpse regenerates instead of dying")
	assert.Greater(t, uint32(m.Health()), uint32(0),
		"BUG: out-of-combat regen runs on a dead mob")
}

// TestMob_KillRewardGoesToLastToucherOnly characterizes the single-recipient
// XP model: only the player whose touch drops the mob to 0 is rewarded. This
// is exactly what v1-roadmap.md item 10 (XP & participation) will change —
// when participation XP lands, replace this test with the new rule.
func TestMob_KillRewardGoesToLastToucherOnly(t *testing.T) {
	m := newTestMob()
	attacker := newFakeAuraPlayer()
	finisher := newFakeAuraPlayer()

	m.PlayerTouches(attacker, 0.2) // 0.4 damage — participates, doesn't kill
	m.PlayerTouches(finisher, 1.0) // kill

	assert.Empty(t, attacker.xp, "participant gets nothing today")
	assert.Equal(t, []uint64{42}, finisher.xp)
}

// --- damage aura output (what the mob does per tick) ---

func TestMob_Update_DamageAuraTouchesTargetsWithFactors(t *testing.T) {
	m := newTestMob()
	target := &mobTouchRecorder{}

	targetCircle := phy.NewCircle(phy.VEC2F_ZERO, 0.25)
	targetCircle.Shape().IsSensor = true
	targetCircle.Shape().Layer = int(model.LayerPlayerCollision)
	targetCircle.Shape().UserData = target

	space := phy.NewSpace()
	space.AddShape(m.damageAura)
	space.AddShape(targetCircle)
	space.Update()
	require.NotEmpty(t, m.damageAura.Collisions(), "physics setup must produce a collision")

	m.Update(0)

	require.Len(t, target.factors, 1, "one MobTouches per tick per target in range")
	assert.InDelta(t, 0.05, target.factors[0].DamageFraction, 1e-6,
		"the mob passes its full Factors through — the target applies DamageFraction")
}

func TestNewMob_DamageAuraWiring(t *testing.T) {
	m := newTestMob()

	assert.True(t, m.damageAura.Shape().IsSensor)
	assert.InDelta(t, 0.5, m.damageAura.Radius, 1e-6, "radius = Body.DamageRadius")
	assert.Equal(t, int(model.LayerPlayerCollision), m.damageAura.Shape().Mask,
		"Damages unset defaults to Player")
	assert.Equal(t, int(model.LayerNoneCollision), m.damageAura.Shape().Layer)
}

// --- aggro ---

func TestNewMob_AggroRadiusDefaultsToFourTimesDamageRadius(t *testing.T) {
	m := newTestMob()

	assert.InDelta(t, 4*0.5, m.aggroAura.Radius, 1e-6)
}

func TestMob_StopsChasingInsideAuraStopDistance(t *testing.T) {
	m := newTestMob() // at origin; default chaseIntoAuraMargin 0.05
	p := newFakeAuraPlayer()
	m.aggroTarget = p

	// stopDistance = damageAura.Radius + player.Radius - margin = 0.5 + 0.25 - 0.05 = 0.7
	p.pos = phy.Vec2f{X: 0.8, Y: 0}
	assert.True(t, m.shouldApproachAggroTarget(), "outside stop distance → keep approaching")

	p.pos = phy.Vec2f{X: 0.6, Y: 0}
	assert.False(t, m.shouldApproachAggroTarget(), "inside stop distance → hold position")
}

func TestMob_FindAggroTarget_PicksNearestLivingPlayer(t *testing.T) {
	m := newTestMob()

	near := newFakeAuraPlayer()
	near.pos = phy.Vec2f{X: 0.5, Y: 0}
	far := newFakeAuraPlayer()
	far.pos = phy.Vec2f{X: 1.5, Y: 0}
	dead := newFakeAuraPlayer()
	dead.pos = phy.Vec2f{X: 0.1, Y: 0}
	dead.vs.Health = 0

	space := phy.NewSpace()
	space.AddShape(m.aggroAura)
	for _, p := range []*fakeAuraPlayer{near, far, dead} {
		c := phy.NewCircle(p.pos, 0.25)
		c.Shape().IsSensor = true
		c.Shape().Layer = int(model.LayerPlayerCollision)
		c.Shape().UserData = model.PlayerEntity(p)
		space.AddShape(c)
	}
	space.Update()
	require.NotEmpty(t, m.aggroAura.Collisions())

	target := m.findAggroTarget()

	require.NotNil(t, target)
	assert.Same(t, near, target, "nearest living player wins; dead players are ignored")
}

// --- out-of-combat regeneration ---

func TestMob_RegeneratesOutOfCombat(t *testing.T) {
	m := newTestMob()
	m.health = vitals.Max.SubFraction(0.5)
	start := m.health

	alive := m.Update(0) // no aggro target, nothing in range

	assert.True(t, alive)
	assert.Equal(t, start.AddFraction(1.0/(2*constant.TicksPerSecond)), m.Health(),
		"heals to full over ~2 seconds of ticks while out of combat")
}
