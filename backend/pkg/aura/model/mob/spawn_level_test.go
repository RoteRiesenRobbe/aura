package mob

// Chunk C1 of plan-mob-levels.md ("one species, many levels"): a spawn point
// may author an absolute level, and the mob placed there stands at it. HP,
// damage and kill XP follow with zero seam code, because all three already
// derive live from Level().
//
// ⚑ The precedence `owner ?? spawnLevel ?? definition.CurveLevel` is pinned by
// OTHER plans, not by this one (landmine L2): entity-model chunk 1b makes a
// summon stand at its owner's level live, and plan-faction-flips L-B/L-M pin
// that a CHARMED mob keeps its own (charm binds `charmer`, deliberately never
// `owner`). The tests below exist to make the wrong order red.

import (
	"math"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/vitals"
)

func TestMob_SpawnLevel_OverridesTheSpeciesCurveLevel(t *testing.T) {
	m := NewMob(curvedMobDefinition(100, 1), 0, nil)
	require.Equal(t, 1, m.Level(), "the authored species level, before any override")

	m.SetSpawnLevel(15)

	assert.Equal(t, 15, m.Level(), "the placement wins over the species default")
}

func TestMob_SpawnLevel_AbsentInheritsTheSpecies(t *testing.T) {
	m := NewMob(curvedMobDefinition(100, 7), 0, nil)

	assert.Equal(t, 7, m.Level(), "no override: the species value, byte-for-byte today's behaviour")
	assert.Zero(t, m.spawnLevel, "and the zero value IS 'none' — the loader rejects level: 0")
}

// L2, the pin the other two plans own. An owner is bound only by SKILL spawns
// (summons, the camp utility mob); a point-spawned mob never has one, so in
// practice the two do not meet. The order is load-bearing the day something
// makes them.
func TestMob_SpawnLevel_OwnerStillWins(t *testing.T) {
	owner := newFakeAuraPlayer()
	owner.prog.Level = 4

	m := NewMob(curvedMobDefinition(60, 1), 0, nil)
	m.SetSpawnLevel(30)
	require.Equal(t, 30, m.Level(), "the override, while unowned")

	m.SetOwner(owner)

	assert.Equal(t, 4, m.Level(), "an owned summon stands where its OWNER stands, override or not")

	owner.prog.Level = 9
	assert.Equal(t, 9, m.Level(), "live, and still not falling back to the override")
}

// A charmed mob keeps its own level (faction-flips L-B/L-M) — and "its own"
// now means the OVERRIDE, not the species value. Charming an overridden
// level-30 wolf must not shrink it to anything.
func TestMob_SpawnLevel_SurvivesCharm(t *testing.T) {
	charmer := newFakeAuraPlayer()
	charmer.prog.Level = 3

	m := NewMob(curvedMobDefinition(100, 1), 0, nil)
	m.SetSpawnLevel(20)
	pool := m.MaxHealth()

	m.Charm(charmer, charmSource, 60)

	assert.Equal(t, 20, m.Level(), "a charmed mob keeps its own level — the placement's, here")
	assert.Equal(t, pool, m.MaxHealth(), "and its own pool with it")
}

// The pool is the whole point: an up-levelled mob has to be as beefy as the
// same species authored at that curveLevel. Computed both ways — the species
// definition at 15 against the species definition at 1 placed at 15.
//
// ⚑ Deliberately a variance-free definition (curvedMobDefinition leaves
// maxHealthVariance at 0): NewMob rolls variance from a per-entity, per-process
// seed, so two separately constructed mobs of a variance-carrying species never
// have equal absolute pools. The variance axis is pinned separately below.
func TestMob_SpawnLevel_PoolMatchesTheSameSpeciesAuthoredThere(t *testing.T) {
	authored := NewMob(curvedMobDefinition(100, 15), 0, nil)

	placed := NewMob(curvedMobDefinition(100, 1), 0, nil)
	placed.SetSpawnLevel(15)
	placed.RestoreToFullHealth()

	assert.Equal(t, authored.MaxHealth(), placed.MaxHealth(),
		"a level-15 placement is a level-15 mob")
	assert.InDelta(t, math.Pow(1.12, 14), float64(placed.PowerScale()), 1e-6,
		"and its skill output rides the same f(L)")
}

// L1 — the pool is filled at CONSTRUCTION (m.health = m.MaxHealth() in NewMob),
// before any spawn-site setter can run. Without the RestoreToFullHealth() that
// spawnAt pairs with SetSpawnLevel, an up-levelled mob spawns with its species'
// small pool inside a big max — and out-of-combat regen quietly heals the gap,
// so it only ever reproduces on a fresh pull.
func TestMob_SpawnLevel_NeedsTheSpawnSiteFill(t *testing.T) {
	m := NewMob(curvedMobDefinition(100, 1), 0, nil)
	require.Equal(t, vitals.VitalSign(100), m.Health(), "born at the species pool")

	m.SetSpawnLevel(15)
	require.Less(t, m.Health(), m.MaxHealth(), "the max widened; the health did not follow")

	m.RestoreToFullHealth()

	assert.Equal(t, m.MaxHealth(), m.Health(), "the spawn site's tool closes the gap")
	assert.Zero(t, m.HealReceived(), "a spawn fill is not a heal")
}

// The variance axis is independent of the level axis: the roll rides the BASE
// pool, so it still lands inside its band around the OVERRIDDEN pool.
func TestMob_SpawnLevel_VarianceStillRollsAroundTheOverriddenPool(t *testing.T) {
	d := curvedMobDefinition(100, 1)
	d.Factors.MaxHealthVariance = 0.1

	for i := 0; i < 16; i++ {
		m := NewMob(d, 0, nil)
		m.SetSpawnLevel(5)
		m.RestoreToFullHealth()

		hp := m.MaxHealth()
		if hp < 141 || hp > 173 { // f(5) × 100 = 157, ± 10 %
			t.Fatalf("rolled pool %d outside the band around f(5) × 100 = 157", hp)
		}
		require.Equal(t, hp, m.Health(), "spawns at its rolled, overridden full pool")
	}
}

// The species-side `< 1 → 1` guard is untouched, and a defensive spawnLevel
// that never came through the loader falls THROUGH to the species value rather
// than returning nonsense (the guard is `> 0`, not `!= 0`).
func TestMob_SpawnLevel_NonPositiveFallsThroughToTheSpecies(t *testing.T) {
	m := NewMob(curvedMobDefinition(100, 6), 0, nil)

	m.SetSpawnLevel(-3)

	assert.Equal(t, 6, m.Level(), "a nonsense override is not an override")
}
