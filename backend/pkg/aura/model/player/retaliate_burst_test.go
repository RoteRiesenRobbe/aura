package player

// The retaliate_burst trigger (PO 2026-08-17): the PERCENTAGE reflect. A
// cooldown puts a timed self-buff up, and while it is up a SHARE of every hit
// taken goes back at whoever landed it, through the same attributed path the
// flat FireShield reflect uses.
//
// Three PO rulings are pinned here rather than merely implemented:
//
//  1. The share is of the PRE-MITIGATION hit — the damage as the mob authored
//     it. A fully absorbed hit reflects exactly as much as one that lands.
//  2. The tags are the BUFF's authored ones, never the incoming hit's.
//  3. Level scales the share only (pinned in skills/, where the scaling lives).

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const burstSource = skills.SkillID(203)

// burstWearer returns a player with a live reflect buff and nothing else.
func burstWearer(t *testing.T, fraction float32, tags []string) *player {
	t.Helper()
	p := hittablePlayer(t)
	p.ApplyReflect(burstSource, fraction, tags, 300)
	live, _ := p.ReflectBurst()
	require.NotZero(t, live, "precondition: the burst is up")
	return p
}

func TestRetaliateBurst_ReflectsAShareOfTheIncomingHit(t *testing.T) {
	p := burstWearer(t, 0.2, []string{"fire"})
	mob := livingAttacker()

	p.MobTouches(mob, mobs.Factors{Damage: 50})

	require.Len(t, mob.hits, 1)
	assert.InDelta(t, 10, mob.hits[0].HP, 1e-6, "20% of the 50 HP swing")
	assert.Equal(t, []string{"fire"}, mob.hits[0].Tags,
		"PO ruling 2: the buff's authored type, not the incoming hit's")
	assert.Nil(t, mob.hits[0].Source, "attributed as a direct player hit, like the flat reflect")
}

// ⚑ PO ruling 2, made falsifiable: the incoming hit is frost, the buff is fire,
// and what goes back is FIRE. A mirror implementation passes every other test
// in this file and fails this one.
func TestRetaliateBurst_DoesNotMirrorTheIncomingDamageType(t *testing.T) {
	p := burstWearer(t, 0.5, []string{"fire"})
	mob := livingAttacker()

	p.MobTouches(mob, mobs.Factors{Damage: 20, DamageTags: []string{"frost"}})

	require.Len(t, mob.hits, 1)
	assert.Equal(t, []string{"fire"}, mob.hits[0].Tags)
}

// ⚑ PO ruling 1, and the reason it was ruled that way: the share is of the hit
// as the MOB authored it, so a tanky build does not weaken its own reflect by
// being hard to hurt. Here the hit is fully absorbed by a shield and the
// reflect is unchanged.
func TestRetaliateBurst_ReflectsThePreMitigationHit(t *testing.T) {
	p := burstWearer(t, 0.2, []string{"fire"})
	p.ApplyShield(skills.SkillID(9), 1000, 300) // swallows the whole swing
	mob := livingAttacker()

	before := p.PlayerVitalSigns.Health
	p.MobTouches(mob, mobs.Factors{Damage: 50})

	assert.Equal(t, before, p.PlayerVitalSigns.Health, "precondition: nothing got through")
	require.Len(t, mob.hits, 1)
	assert.InDelta(t, 10, mob.hits[0].HP, 1e-6,
		"still 20% of 50: the share is of the swing, not of the damage taken")
}

// A share of nothing is nothing. The mob still swung, but there is no incoming
// amount to take a percentage of, so this is where the burst legitimately
// parts from the flat passive (which reflects on any hit at all).
func TestRetaliateBurst_AZeroDamageHitReflectsNothing(t *testing.T) {
	p := burstWearer(t, 0.2, []string{"fire"})
	mob := livingAttacker()

	p.MobTouches(mob, mobs.Factors{Damage: 0})

	assert.Empty(t, mob.hits, "0% of 0 is not a hit worth dealing")
}

func TestRetaliateBurst_DoesNothingWithoutTheBuff(t *testing.T) {
	p := hittablePlayer(t)
	mob := livingAttacker()

	p.MobTouches(mob, mobs.Factors{Damage: 50})

	assert.Empty(t, mob.hits, "no burst, no reflect")
}

func TestRetaliateBurst_StopsWhenTheBuffExpires(t *testing.T) {
	p := burstWearer(t, 0.2, []string{"fire"})
	for i := 0; i < 301; i++ {
		p.buffs.Tick()
	}
	mob := livingAttacker()

	p.MobTouches(mob, mobs.Factors{Damage: 50})

	assert.Empty(t, mob.hits, "the window closed")
}

// ⚑ THE composition pin: the flat passive and the burst are INDEPENDENT halves,
// so a player running both deals TWO deliveries, each with its own authored
// damage type. Summing them into one would have to pick one skill's tags for
// the other skill's damage, which is the same trap the buff store's
// strongest-wins read avoids.
func TestRetaliateBurst_ComposesWithTheFlatPassiveAsTwoDeliveries(t *testing.T) {
	p := reflectWearer(t, 1) // FireShield: flat 3, fire
	p.ApplyReflect(burstSource, 0.2, []string{"frost"}, 300)
	mob := livingAttacker()

	p.MobTouches(mob, mobs.Factors{Damage: 50})

	require.Len(t, mob.hits, 2, "two passives, two hits — never one summed hit")
	assert.InDelta(t, 3, mob.hits[0].HP, 1e-6, "the flat passive's own amount")
	assert.Equal(t, []string{"fire"}, mob.hits[0].Tags)
	assert.InDelta(t, 10, mob.hits[1].HP, 1e-6, "the burst's share of the swing")
	assert.Equal(t, []string{"frost"}, mob.hits[1].Tags,
		"each delivery keeps its own damage type, which is why they cannot be summed")
}

// The shared guards cover the burst half too — it lives inside the same GOD
// short-circuit and behind the same liveness check.
func TestRetaliateBurst_AGodPlayerDoesNot(t *testing.T) {
	p := burstWearer(t, 0.5, []string{"fire"})
	p.SetGodmode(true)
	require.True(t, p.IsGod(), "precondition")
	mob := livingAttacker()

	p.MobTouches(mob, mobs.Factors{Damage: 50})

	assert.Empty(t, mob.hits)
}

func TestRetaliateBurst_ADeadAttackerIsNotTouched(t *testing.T) {
	p := burstWearer(t, 0.5, []string{"fire"})
	corpse := &reflectableAttacker{ratio: 0}

	p.MobTouches(corpse, mobs.Factors{Damage: 50})

	assert.Zero(t, corpse.touched, "a dead DoT caster's tick must not re-enter its reward path")
}

func TestRetaliateBurst_ANonReflectableAttackerIsSkipped(t *testing.T) {
	p := burstWearer(t, 0.5, []string{"fire"})

	assert.NotPanics(t, func() {
		p.MobTouches(&plainAttacker{}, mobs.Factors{Damage: 50})
	})
}

// The C2 re-entrancy pin, aimed at the burst path: a percentage reflect landing
// the killing blow from INSIDE the attacker's own damage delivery. Same three
// requirements — the death settles, the rewards grant once, and the mob's own
// hit still lands, because it attacked while it was alive.
func TestRetaliateBurst_AReflectKillingMidDeliveryIsSafe(t *testing.T) {
	p := rewardablePlayer(t, 0) // no flat passive: the burst is the only reflect
	p.ApplyReflect(burstSource, 2.0, []string{"fire"}, 300)
	m := reflectMob(t, 1, nil)
	before := p.PlayerVitalSigns.Health

	require.NotPanics(t, func() { p.MobTouches(m, mobs.Factors{Damage: 500}) })

	assert.Zero(t, m.Health(), "1000 HP of reflect killed it mid-delivery")
	assert.Equal(t, []string{"Reflector"}, m.KillCreditNames())
	require.NotZero(t, p.Progression().Experience, "a burst-only kill pays XP")
	assert.EqualValues(t, 1, p.QuestLedger().KillCount(1), "…and quest credit, once")
	assert.Equal(t, before-500, p.PlayerVitalSigns.Health,
		"the mob attacked while alive, so its own hit still lands")

	xp := p.Progression().Experience
	p.MobTouches(m, mobs.Factors{Damage: 500})
	assert.Equal(t, xp, p.Progression().Experience, "no second award")
}

// Mitigation applies to what comes BACK, normally: ruling 1 is about the input
// side only. A fire-resistant mob still halves the reflect it receives.
func TestRetaliateBurst_TheAttackersResistanceMitigatesTheReflect(t *testing.T) {
	p := rewardablePlayer(t, 0)
	p.ApplyReflect(burstSource, 0.5, []string{"fire"}, 300)
	m := reflectMob(t, 1, map[string]float32{"fire": 0.5})
	full := m.MaxHealth()

	p.MobTouches(m, mobs.Factors{Damage: 40})

	assert.Equal(t, full-10, m.Health(), "50% of 40 = 20, halved by fire resistance = 10")
}
