package player

// Reading this tick's hit events (plan-skill-vfx.md C1), plus the pins on the
// list itself. The mob package carries the twin of this file; the two funnels
// implement one rule and are pinned to it separately on purpose.

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/EngoEngine/ecs"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/vitals"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

// The four helpers name the retired per-tick accumulators, so every test that
// used to read one reads the event list with the same words.

func damageTaken(p *player) vitals.VitalSign {
	return eventAmount(p.SkillEvents(), model.HitKindDamage, model.HitKindCrit)
}

func critTaken(p *player) vitals.VitalSign {
	return eventAmount(p.SkillEvents(), model.HitKindCrit)
}

func healReceived(p *player) vitals.VitalSign {
	return eventAmount(p.SkillEvents(), model.HitKindHeal)
}

func immuneHit(p *player) bool {
	return eventSeen(p.SkillEvents(), model.HitKindImmune)
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

func TestPlayer_HitEventNamesItsSourceVictimAndSkill(t *testing.T) {
	p := hittablePlayer(t)
	attacker := newFakeAttackerMob()

	p.MobTouches(attacker, mobs.Factors{Damage: 10, DamageTags: []string{"physical"}, SkillID: 101})

	require.Len(t, p.SkillEvents(), 1)
	e := p.SkillEvents()[0]
	assert.Equal(t, attacker.Basic().ID(), e.Source)
	assert.Equal(t, p.Basic().ID(), e.Victim)
	assert.Equal(t, skills.SkillID(101), e.SkillID)
	assert.Equal(t, model.HitKindDamage, e.Kind)
	assert.NotZero(t, e.Amount)
}

func TestPlayer_GodTakesNoHitAndRecordsNothing(t *testing.T) {
	// God short-circuits before everything (§12a.3) - including the event, so
	// a cheat-mode player's HUD stays as quiet as their health bar.
	p := newTestPlayer(nil)
	p.SetGodmode(true)

	p.takeDamage(model.Damage{HP: 40, Tags: []string{"physical"}, SkillID: 5}, 7, model.StatusEffectDamagedAmbient)

	assert.Empty(t, p.SkillEvents())
}

func TestPlayer_FullResistRecordsImmuneWithNoAmount(t *testing.T) {
	p := hittablePlayer(t)
	p.buffs.ApplyResist(4, []string{"fire"}, 0, 5)

	p.takeDamage(model.Damage{HP: 40, Tags: []string{"fire"}, SkillID: 5}, 7, model.StatusEffectDamagedAmbient)

	require.Len(t, p.SkillEvents(), 1)
	e := p.SkillEvents()[0]
	assert.Equal(t, model.HitKindImmune, e.Kind)
	assert.Zero(t, e.Amount)
	assert.Equal(t, skills.SkillID(5), e.SkillID)
}

func TestPlayer_CritHitCarriesTheCritKind(t *testing.T) {
	p := hittablePlayer(t)
	p.takeDamage(model.Damage{HP: 10, Crit: true}, 7, model.StatusEffectDamagedAmbient)

	require.Len(t, p.SkillEvents(), 1)
	assert.Equal(t, model.HitKindCrit, p.SkillEvents()[0].Kind)
}

// A PARTIAL absorb reports the real HP loss and leaves the absorbed share off
// the wire (§12a.3): the shield bar already shows that half.
func TestPlayer_PartialAbsorbReportsTheRealLoss(t *testing.T) {
	p := hittablePlayer(t)
	p.buffs.ApplyShield(4, 10, 5)

	p.takeDamage(model.Damage{HP: 30}, 7, model.StatusEffectDamagedAmbient)

	require.Len(t, p.SkillEvents(), 1)
	e := p.SkillEvents()[0]
	assert.Equal(t, model.HitKindDamage, e.Kind)
	assert.Equal(t, vitals.VitalSign(20), e.Amount, "10 of the 30 went to the shield")
}

// A hit the shield ate WHOLE reports the absorb instead, so the landing is
// never silent (PO 2026-09-19).
func TestPlayer_FullAbsorbReportsAnAbsorbEvent(t *testing.T) {
	p := hittablePlayer(t)
	before := p.VitalSigns().Health
	p.buffs.ApplyShield(4, 50, 5)

	p.takeDamage(model.Damage{HP: 30}, 7, model.StatusEffectDamagedAmbient)

	require.Len(t, p.SkillEvents(), 1)
	e := p.SkillEvents()[0]
	assert.Equal(t, model.HitKindAbsorb, e.Kind)
	assert.Equal(t, vitals.VitalSign(30), e.Amount)
	assert.Equal(t, before, p.VitalSigns().Health, "and no HP was lost")
}

func TestPlayer_HealEventNamesItsCasterAndSkill(t *testing.T) {
	p := newTestPlayer(nil)
	p.PlayerVitalSigns.Health = p.MaxHealth().Sub(40)
	healer := newTestPlayer(nil)

	healed := p.Heal(model.Healing{HP: 30, Caster: healer, SkillID: 72})

	require.Equal(t, vitals.VitalSign(30), healed)
	require.Len(t, p.SkillEvents(), 1)
	e := p.SkillEvents()[0]
	assert.Equal(t, model.HitKindHeal, e.Kind)
	assert.Equal(t, healer.Basic().ID(), e.Source)
	assert.Equal(t, p.Basic().ID(), e.Victim)
	assert.Equal(t, skills.SkillID(72), e.SkillID)
	assert.Equal(t, vitals.VitalSign(30), e.Amount)
}

func TestPlayer_HealAtFullHealthIsNotALanding(t *testing.T) {
	p := newTestPlayer(nil)
	p.PlayerVitalSigns.Health = p.MaxHealth()

	p.Heal(model.Healing{HP: 30, Caster: p, SkillID: 72})

	assert.Empty(t, p.SkillEvents())
}

func TestPlayer_NoteSkillFiredIsSourceOnly(t *testing.T) {
	p := newTestPlayer(nil)
	p.NoteSkillFired(45)

	require.Len(t, p.SkillEvents(), 1)
	e := p.SkillEvents()[0]
	assert.True(t, e.Fired)
	assert.Equal(t, p.Basic().ID(), e.Source)
	assert.Zero(t, e.Victim)
	assert.Equal(t, skills.SkillID(45), e.SkillID)
}

// --- the per-tick lifecycle, and its allocation pin ---

func TestPlayer_ResetTickNumbersTruncatesTheEventList(t *testing.T) {
	p := hittablePlayer(t)
	p.takeDamage(model.Damage{HP: 10}, 7, model.StatusEffectDamagedAmbient)
	require.NotEmpty(t, p.SkillEvents())

	p.ResetTickNumbers()

	assert.Empty(t, p.SkillEvents())
	p.takeDamage(model.Damage{HP: 10}, 7, model.StatusEffectDamagedAmbient)
	assert.Len(t, p.SkillEvents(), 1, "and the list is still usable afterwards")
}

func TestPlayer_SkillEventResetAllocatesNothing(t *testing.T) {
	p := newTestPlayer(nil)
	for i := 0; i < 3; i++ {
		p.noteSkillEvent(model.SkillEvent{Source: 1, Victim: 2})
	}
	p.ResetTickNumbers()

	allocs := testing.AllocsPerRun(50, func() {
		for i := 0; i < 3; i++ {
			p.noteSkillEvent(model.SkillEvent{Source: 1, Victim: 2})
		}
		p.ResetTickNumbers()
	})

	assert.Zero(t, allocs, "the reset runs per entity per tick - it must truncate, never re-make")
}

// --- the reflect and the leech name their own skill (§12a.2/5) ---

func TestPlayer_ReflectedHitNamesTheGrantingPassive(t *testing.T) {
	// The reflect leaves through the attacker's ordinary damage entry, so it is
	// an ordinary hit and an ordinary hit names a skill. It names the PASSIVE
	// that bounced it, not whatever aura the wearer happens to be running.
	p := reflectWearer(t, 3)
	attacker := &reflectableAttacker{basic: ecs.NewBasic(), ratio: 1}

	p.retaliate(attacker, 50)

	require.Len(t, attacker.hits, 1)
	assert.Equal(t, p.skills.Derived.RetaliateDamage.Source, attacker.hits[0].SkillID)
	assert.NotZero(t, attacker.hits[0].SkillID, "precondition: the passive has an id")
}

func TestPlayer_LifestealHealNamesTheHittingSkill(t *testing.T) {
	// A leech-back is attributed to the skill that earned it, so the number
	// appears under the damage that caused it rather than out of nowhere.
	p := hittablePlayer(t)
	p.PlayerVitalSigns.Health = p.MaxHealth().Sub(40)

	model.ApplyLifesteal(20, 0.5, 141, nil, p)

	require.Len(t, p.SkillEvents(), 1)
	e := p.SkillEvents()[0]
	assert.Equal(t, model.HitKindHeal, e.Kind)
	assert.Equal(t, skills.SkillID(141), e.SkillID)
	assert.Equal(t, p.Basic().ID(), e.Source, "the leecher heals itself")
}

// --- the phase axis (plan-skill-vfx.md §12h), the mob file's twin ---

func TestPlayer_ApplyDotNotesAppliedOnIgniteAndOnRefresh(t *testing.T) {
	p := hittablePlayer(t)
	caster := newFakeAttackerMob()
	dot := skills.DotBuff{HP: 5, Tags: []string{"poison"}, Interval: 1, Caster: caster}

	require.True(t, p.ApplyDot(55, dot, 5), "precondition: the first call ignites")
	require.False(t, p.ApplyDot(55, dot, 5), "precondition: the second call refreshes")

	require.Len(t, p.SkillEvents(), 2, "one Applied per call, ignite and refresh alike")
	for _, e := range p.SkillEvents() {
		assert.Equal(t, model.HitPhaseApplied, e.Phase)
		assert.Equal(t, model.HitKindDamage, e.Kind)
		assert.Equal(t, caster.Basic().ID(), e.Source)
		assert.Equal(t, p.Basic().ID(), e.Victim)
		assert.Equal(t, skills.SkillID(55), e.SkillID)
		assert.Zero(t, e.Amount)
	}
}

func TestPlayer_ApplyDotFromACasterWithNoIDNotesNothing(t *testing.T) {
	p := hittablePlayer(t)
	p.ApplyDot(55, skills.DotBuff{HP: 5, Interval: 1, Caster: "a bog"}, 5)
	assert.Empty(t, p.SkillEvents())
}

func TestPlayer_ApplyHotNotesHealApplied(t *testing.T) {
	p := hittablePlayer(t)
	healer := newTestPlayer(nil)

	p.ApplyHot(72, skills.HotBuff{HP: 5, Interval: 1, Caster: healer}, 5)

	require.Len(t, p.SkillEvents(), 1)
	e := p.SkillEvents()[0]
	assert.Equal(t, model.HitPhaseApplied, e.Phase)
	assert.Equal(t, model.HitKindHeal, e.Kind)
	assert.Equal(t, healer.Basic().ID(), e.Source)
	assert.Zero(t, e.Amount)
}

func TestPlayer_DirectHitIsPhaseDirect(t *testing.T) {
	p := hittablePlayer(t)
	p.takeDamage(model.Damage{HP: 10}, 7, model.StatusEffectDamagedAmbient)
	require.Len(t, p.SkillEvents(), 1)
	assert.Equal(t, model.HitPhaseDirect, p.SkillEvents()[0].Phase)
}

func TestPlayer_DotTickNotesDamageTick(t *testing.T) {
	p := hittablePlayer(t)
	p.takeDamage(model.Damage{HP: 10, Tick: true}, 7, model.StatusEffectDamagedAmbient)
	require.Len(t, p.SkillEvents(), 1)
	assert.Equal(t, model.HitKindDamage, p.SkillEvents()[0].Kind)
	assert.Equal(t, model.HitPhaseTick, p.SkillEvents()[0].Phase)
}

func TestPlayer_CritTickStaysCritAndTick(t *testing.T) {
	p := hittablePlayer(t)
	p.takeDamage(model.Damage{HP: 10, Crit: true, Tick: true}, 7, model.StatusEffectDamagedAmbient)
	require.Len(t, p.SkillEvents(), 1)
	assert.Equal(t, model.HitKindCrit, p.SkillEvents()[0].Kind)
	assert.Equal(t, model.HitPhaseTick, p.SkillEvents()[0].Phase)
}

func TestPlayer_FullyResistedTickNotesImmuneTick(t *testing.T) {
	p := hittablePlayer(t)
	p.buffs.ApplyResist(4, []string{"fire"}, 0, 5)
	p.takeDamage(model.Damage{HP: 40, Tags: []string{"fire"}, Tick: true}, 7, model.StatusEffectDamagedAmbient)
	require.Len(t, p.SkillEvents(), 1)
	assert.Equal(t, model.HitKindImmune, p.SkillEvents()[0].Kind)
	assert.Equal(t, model.HitPhaseTick, p.SkillEvents()[0].Phase)
}

func TestPlayer_AbsorbedTickNotesAbsorbTick(t *testing.T) {
	p := hittablePlayer(t)
	p.buffs.ApplyShield(4, 50, 5)
	p.takeDamage(model.Damage{HP: 30, Tick: true}, 7, model.StatusEffectDamagedAmbient)
	require.Len(t, p.SkillEvents(), 1)
	assert.Equal(t, model.HitKindAbsorb, p.SkillEvents()[0].Kind)
	assert.Equal(t, model.HitPhaseTick, p.SkillEvents()[0].Phase)
}

func TestPlayer_MobTouchesThreadsTheTickFlag(t *testing.T) {
	p := hittablePlayer(t)
	p.MobTouches(newFakeAttackerMob(), mobs.Factors{Damage: 10, DamageTags: []string{"physical"}, Tick: true})
	require.Len(t, p.SkillEvents(), 1)
	assert.Equal(t, model.HitPhaseTick, p.SkillEvents()[0].Phase)
}

func TestPlayer_HotTickNotesHealTick(t *testing.T) {
	p := newTestPlayer(nil)
	p.PlayerVitalSigns.Health = p.MaxHealth().Sub(40)

	p.Heal(model.Healing{HP: 30, Caster: newTestPlayer(nil), SkillID: 72, Tick: true})

	require.Len(t, p.SkillEvents(), 1)
	assert.Equal(t, model.HitKindHeal, p.SkillEvents()[0].Kind)
	assert.Equal(t, model.HitPhaseTick, p.SkillEvents()[0].Phase)
}

func TestPlayer_FiredIsPhaseDirect(t *testing.T) {
	p := newTestPlayer(nil)
	p.NoteSkillFired(45)
	require.Len(t, p.SkillEvents(), 1)
	assert.Equal(t, model.HitPhaseDirect, p.SkillEvents()[0].Phase)
}
