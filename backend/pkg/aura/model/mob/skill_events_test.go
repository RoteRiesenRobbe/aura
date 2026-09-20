package mob

// Reading this tick's hit events (plan-skill-vfx.md C1), plus the pins on the
// list itself.
//
// The four per-tick accumulators (damageTaken / critTaken / healReceived /
// immuneHit) are gone: they could say THAT a mob was hit, never by whom or
// with what. Every test that used to read one reads the event list instead,
// and the four helpers below name the old questions so that re-point stayed
// mechanical and reviewable - same subject, same expectation, one layer out.

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/EngoEngine/ecs"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/vitals"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

// damageTaken is the HP this mob lost to hits this tick, crits included - the
// old damageTaken accumulator, which summed both.
func damageTaken(m *Mob) vitals.VitalSign {
	return eventAmount(m.SkillEvents(), model.HitKindDamage, model.HitKindCrit)
}

// critTaken is the crit-flagged share of it.
func critTaken(m *Mob) vitals.VitalSign {
	return eventAmount(m.SkillEvents(), model.HitKindCrit)
}

func healReceived(m *Mob) vitals.VitalSign {
	return eventAmount(m.SkillEvents(), model.HitKindHeal)
}

func immuneHit(m *Mob) bool {
	return eventSeen(m.SkillEvents(), model.HitKindImmune)
}

func eventAmount(events []model.SkillEvent, kinds ...model.HitKind) vitals.VitalSign {
	var total vitals.VitalSign
	for _, e := range events {
		for _, k := range kinds {
			if e.Kind == k {
				total += e.Amount
			}
		}
	}
	return total
}

func eventSeen(events []model.SkillEvent, kind model.HitKind) bool {
	for _, e := range events {
		if e.Kind == kind {
			return true
		}
	}
	return false
}

// --- the events themselves ---

func TestMob_HitEventNamesItsSourceVictimAndSkill(t *testing.T) {
	m := newTestMob()
	p := newFakeAuraPlayer()

	m.PlayerTouches(p, model.Damage{HP: 10, Tags: []string{"physical"}, SkillID: 141})

	require.Len(t, m.SkillEvents(), 1)
	e := m.SkillEvents()[0]
	assert.Equal(t, p.Basic().ID(), e.Source, "the toucher acted")
	assert.Equal(t, m.Basic().ID(), e.Victim)
	assert.Equal(t, skills.SkillID(141), e.SkillID)
	assert.Equal(t, model.HitKindDamage, e.Kind)
	assert.False(t, e.Fired)
	assert.NotZero(t, e.Amount)
}

func TestMob_HitEventCarriesTheCritKind(t *testing.T) {
	m := newTestMob()
	m.PlayerTouches(newFakeAuraPlayer(), model.Damage{HP: 10, Tags: []string{"physical"}, Crit: true})

	require.Len(t, m.SkillEvents(), 1)
	assert.Equal(t, model.HitKindCrit, m.SkillEvents()[0].Kind)
	assert.Equal(t, damageTaken(m), critTaken(m), "a crit is the whole loss here")
}

func TestMob_ImmuneEventCarriesNoAmount(t *testing.T) {
	m := newTestMob()
	m.SetInvulnerable(true)
	m.PlayerTouches(newFakeAuraPlayer(), model.Damage{HP: 10, SkillID: 7})

	require.Len(t, m.SkillEvents(), 1)
	e := m.SkillEvents()[0]
	assert.Equal(t, model.HitKindImmune, e.Kind)
	assert.Zero(t, e.Amount, "nothing got through, so there is nothing to show")
	assert.Equal(t, skills.SkillID(7), e.SkillID, "a bounced hit still names its skill")
}

// A summon's hit is attributed to the SUMMON (§5.1), not to the player it is
// credited to: that is where C2 draws the effect from, and the client resolves
// own-caused through the mob's wire owner_id instead.
func TestMob_HitEventAttributesAnOwnedSummonToItself(t *testing.T) {
	m := newTestMob()
	p := newFakeAuraPlayer()
	summon := &fakeLeechSource{basic: ecs.NewBasic(), ratio: 1}

	m.PlayerTouches(p, model.Damage{HP: 10, Tags: []string{"physical"}, Source: summon, SkillID: 3})

	require.Len(t, m.SkillEvents(), 1)
	assert.Equal(t, summon.Basic().ID(), m.SkillEvents()[0].Source)
}

func TestMob_HealEventNamesItsCasterAndSkill(t *testing.T) {
	m := newTestMob()
	m.PlayerTouches(newFakeAuraPlayer(), model.Damage{HP: 50, Tags: []string{"physical"}})
	m.ResetTickNumbers()
	healer := newFakeAuraPlayer()

	healed := m.Heal(model.Healing{HP: 20, Caster: healer, SkillID: 9})

	require.NotZero(t, healed)
	require.Len(t, m.SkillEvents(), 1)
	e := m.SkillEvents()[0]
	assert.Equal(t, model.HitKindHeal, e.Kind)
	assert.Equal(t, healer.Basic().ID(), e.Source)
	assert.Equal(t, m.Basic().ID(), e.Victim)
	assert.Equal(t, skills.SkillID(9), e.SkillID)
	assert.Equal(t, healed, e.Amount)
}

func TestMob_HealAtFullHealthIsNotALanding(t *testing.T) {
	m := newTestMob()
	require.Equal(t, m.MaxHealth(), m.Health())

	m.Heal(model.Healing{HP: 20, Caster: newFakeAuraPlayer(), SkillID: 9})

	assert.Empty(t, m.SkillEvents(), "nothing was restored, so nothing landed")
}

func TestMob_NoteSkillFiredIsSourceOnly(t *testing.T) {
	m := newTestMob()
	m.NoteSkillFired(42)

	require.Len(t, m.SkillEvents(), 1)
	e := m.SkillEvents()[0]
	assert.True(t, e.Fired)
	assert.Equal(t, m.Basic().ID(), e.Source)
	assert.Zero(t, e.Victim, "a cast has no victim")
	assert.Zero(t, e.Amount)
	assert.Equal(t, skills.SkillID(42), e.SkillID)
}

// --- the per-tick lifecycle, and its allocation pin ---

func TestMob_ResetTickNumbersTruncatesTheEventList(t *testing.T) {
	m := newTestMob()
	m.PlayerTouches(newFakeAuraPlayer(), model.Damage{HP: 10, Tags: []string{"physical"}})
	require.NotEmpty(t, m.SkillEvents())

	m.ResetTickNumbers()

	assert.Empty(t, m.SkillEvents(), "per-tick one-shot, like the accumulators it replaced")
	m.PlayerTouches(newFakeAuraPlayer(), model.Damage{HP: 10, Tags: []string{"physical"}})
	assert.Len(t, m.SkillEvents(), 1, "and the list is still usable afterwards")
}

// The status-effects Clear() pin's twin (status_effects_alloc_test.go): the
// reset runs for every entity on every tick, so re-making the slice there
// would cost an allocation per entity per tick, with nobody online.
func TestMob_SkillEventResetAllocatesNothing(t *testing.T) {
	m := newTestMob()
	p := newFakeAuraPlayer()
	// Warm-up: the slice reaches its steady-state capacity here.
	for i := 0; i < 3; i++ {
		m.PlayerTouches(p, model.Damage{HP: 1, Tags: []string{"physical"}})
	}
	m.ResetTickNumbers()

	allocs := testing.AllocsPerRun(50, func() {
		for i := 0; i < 3; i++ {
			m.noteSkillEvent(model.SkillEvent{Source: 1, Victim: 2})
		}
		m.ResetTickNumbers()
	})

	assert.Zero(t, allocs, "the reset runs per entity per tick - it must truncate, never re-make")
}
