package mob

// Chunk 1b of plan-entity-model.md ("the Actor model"): a mob's level is no
// longer frozen at registry load. MaxHealth is derived from it, and an owned
// summon reads its OWNER's current level — which is what collapses the two
// bespoke summon-scaling mechanisms into one rule.
//
// ⚑ Same rule as 1a: pin BEHAVIOUR (the pool, the health that fits in it),
// never Derived (landmine L6).

import (
	"math"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/curve"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/vitals"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

// curvedMobDefinition is a definition on the live curve: an authored BASE pool
// plus a curve position, the C0 tier+baseline authoring shape.
func curvedMobDefinition(base uint32, curveLevel int) *mobs.MobDefinition {
	d := testMobDefinition()
	d.Factors.BaseMaxHealth = base
	d.CurveLevel = curveLevel
	d.Curve = curve.Curve{Growth: 1.12, MaxLevel: 30}
	return d
}

// The registry no longer pre-derives the pool: baseMaxHealth × f(level) is
// evaluated live, so it follows Level rather than the level frozen at load.
func TestMob_MaxHealth_RidesTheCurveAtItsLevel(t *testing.T) {
	m := NewMob(curvedMobDefinition(100, 5), 0, nil)

	want := vitals.VitalSign(vitals.HP(100 * float32(math.Pow(1.12, 4))))
	require.Equal(t, vitals.VitalSign(157), want, "f(5) = growth⁴ on a 100 HP base")
	assert.Equal(t, want, m.MaxHealth(), "the authored base is scaled at the mob's level")
	assert.Equal(t, want, m.Health(), "and it spawns at that full pool")
}

// The summon rule (decision 2): Level = owner.Level, read LIVE. An existing
// summon's pool therefore grows when its owner levels up — current health
// stays absolute and regenerates up, exactly like the player's own pool.
func TestMob_OwnedSummon_LevelTracksItsOwnerLive(t *testing.T) {
	owner := newFakeAuraPlayer()
	owner.prog.Level = 10

	m := NewMob(curvedMobDefinition(60, 1), 0, nil)
	require.Equal(t, vitals.VitalSign(60), m.MaxHealth(), "unowned: its own curve level")

	m.SetOwner(owner)

	assert.Equal(t, 10, m.Level(), "an owned summon stands where its owner stands")
	assert.Equal(t, vitals.VitalSign(166), m.MaxHealth(), "60 × f(10)")
	assert.InDelta(t, math.Pow(1.12, 9), float64(m.PowerScale()), 1e-6,
		"and its output rides the same level — which is what lets casterPowerScale "+
			"stop multiplying in the owner's curve separately")

	owner.prog.Level = 20
	assert.Equal(t, 20, m.Level(), "live, not snapshotted at spawn")
	assert.Equal(t, vitals.VitalSign(517), m.MaxHealth(), "60 × f(20)")
}

// The spawn site owes a summon a full pool: construction happens before the
// owner is known, so the base pool is all it has at that moment.
func TestMob_RestoreToFullHealth_FillsTheDerivedPool(t *testing.T) {
	owner := newFakeAuraPlayer()
	owner.prog.Level = 10

	m := NewMob(curvedMobDefinition(60, 1), 0, nil)
	m.SetOwner(owner)
	require.Equal(t, vitals.VitalSign(60), m.Health(), "still the base pool it spawned with")

	m.RestoreToFullHealth()

	assert.Equal(t, m.MaxHealth(), m.Health())
	assert.Zero(t, m.HealReceived(), "a spawn fill is not a heal — no floating number")
}

// A pool that SHRINKS mid-life (an unequipped passive, an owner that somehow
// lost levels) must not strand current health above the cap.
func TestMob_Update_ClampsHealthToAShrunkPool(t *testing.T) {
	m := NewMob(curvedMobDefinition(100, 1), 0, nil)
	m.SkillComponent().EquipPassive(0, statPassive(skills.StatMaxHealth, 1), 1)
	m.RestoreToFullHealth()
	require.Equal(t, vitals.VitalSign(200), m.Health(), "+100% max health, filled")

	m.SkillComponent().EquipPassive(0, statPassive(skills.StatMaxHealth, 0), 1)
	m.Update(0.033)

	assert.Equal(t, vitals.VitalSign(100), m.MaxHealth())
	assert.Equal(t, vitals.VitalSign(100), m.Health(), "clamped down to the pool, not left above it")
}

// The variance roll is a lifetime multiplier on the BASE pool, so it composes
// with the curve instead of being baked into a pre-derived number.
func TestNewMob_VarianceRollsAroundTheCurvedPool(t *testing.T) {
	d := curvedMobDefinition(100, 5)
	d.Factors.MaxHealthVariance = 0.1

	for i := 0; i < 16; i++ {
		m := NewMob(d, 0, nil)
		hp := m.MaxHealth()
		if hp < 141 || hp > 173 { // 157 ± 10%
			t.Fatalf("rolled pool %d outside the band around f(5) × 100 = 157", hp)
		}
		require.Equal(t, hp, m.Health(), "spawns at its rolled full pool")
	}
}
