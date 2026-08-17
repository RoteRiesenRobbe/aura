package player

// The retaliate_damage trigger (docs/plan-effect-types.md C2, D4): while the
// passive is equipped, every mob that damages the wearer takes HP back.
//
// ⚑ The reflect is ATTRIBUTED (D4, PO ruling): it goes out through the
// attacker's ordinary player-damage entry with the wearer as toucher, so it
// makes the wearer a participant, builds threat, and a reflect-only kill pays
// XP and kill credit like any other kill. A bare health deduction was
// explicitly rejected — it would have made a fire shield the one damage source
// in the game that cannot finish a fight.

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/mob"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/quests"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const reflectSource = skills.SkillID(201)

// reflectableAttacker records what was dealt to it. It implements only the
// slice of model.MobEntity the trigger needs plus the player-damage entry and
// the liveness read — the embedded nil interface is the tripwire for anything
// else.
type reflectableAttacker struct {
	model.MobEntity
	hits    []model.Damage
	by      []model.PlayerEntity
	ratio   float32
	touched int
}

func (a *reflectableAttacker) PlayerTouches(p model.PlayerEntity, damage model.Damage) {
	a.touched++
	a.hits = append(a.hits, damage)
	a.by = append(a.by, p)
}

func (a *reflectableAttacker) HealthRatio() float32 { return a.ratio }

func livingAttacker() *reflectableAttacker { return &reflectableAttacker{ratio: 1} }

var reflectPassive = &skills.SkillDefinition{
	ID:       reflectSource,
	Name:     "FireShield",
	Category: skills.SkillCategoryPassive,
	MaxLevel: 5,
	Effects: []skills.EffectDef{{
		Type: skills.EffectTypeRetaliateDamage,
		RetaliateDamage: &skills.RetaliateDamageParams{
			HP: 3, HPPerLevel: 1, Tags: []string{"fire"},
		},
	}},
}

// reflectWearer returns a player with the reflect passive equipped at a level.
func reflectWearer(t *testing.T, level int) *player {
	t.Helper()
	p := hittablePlayer(t)
	p.skills.EquipPassive(0, reflectPassive, level)
	require.NotZero(t, p.skills.Derived.RetaliateDamage.Damage, "precondition: the passive is on")
	return p
}

func TestRetaliateDamage_ReflectsOntoTheMobThatHitYou(t *testing.T) {
	p := reflectWearer(t, 3)
	mob := livingAttacker()

	p.MobTouches(mob, mobs.Factors{Damage: 5})

	require.Len(t, mob.hits, 1, "the attacker takes the reflect exactly once per hit")
	assert.InDelta(t, 5, mob.hits[0].HP, 1e-6, "level 3: 3 + 2×1")
	assert.Equal(t, []string{"fire"}, mob.hits[0].Tags,
		"tagged, so the attacker's own resistances answer it")
	assert.Same(t, model.PlayerEntity(p), mob.by[0],
		"the WEARER is the toucher — that is what makes XP and kill credit work")
}

// D4, and the thing a bare health deduction would have lost: Source stays nil,
// so the reflect reads as a direct player hit everywhere downstream.
func TestRetaliateDamage_CarriesNoDamageSource(t *testing.T) {
	p := reflectWearer(t, 1)
	mob := livingAttacker()

	p.MobTouches(mob, mobs.Factors{Damage: 1})

	require.Len(t, mob.hits, 1)
	assert.Nil(t, mob.hits[0].Source,
		"the player is the toucher, not a summon acting on their behalf")
}

func TestRetaliateDamage_DoesNothingWithoutThePassive(t *testing.T) {
	p := hittablePlayer(t)
	mob := livingAttacker()

	p.MobTouches(mob, mobs.Factors{Damage: 5})

	assert.Empty(t, mob.hits, "no passive, no reflect")
}

// The retaliate_slow rule, inherited unchanged: retaliate runs BEFORE
// takeDamage and ignores its result. Swinging at you is the trigger, not the
// hit landing.
func TestRetaliateDamage_AFullyMitigatedHitStillReflects(t *testing.T) {
	p := reflectWearer(t, 1)
	mob := livingAttacker()

	p.MobTouches(mob, mobs.Factors{Damage: 0})

	require.Len(t, mob.hits, 1)
	assert.InDelta(t, 3, mob.hits[0].HP, 1e-6)
}

// A keep-pin, not a red: the existing IsGod() short-circuit in retaliate covers
// BOTH halves, so this passed the moment the reflect was written inside it. It
// stays because the guard is one line away from being lost in a refactor, and a
// cheat-mode player burning everything that brushed them is a playtest artifact
// that would look like a feature.
func TestRetaliateDamage_AGodPlayerDoesNot(t *testing.T) {
	p := reflectWearer(t, 5)
	p.SetGodmode(true)
	require.True(t, p.IsGod(), "precondition")
	mob := livingAttacker()

	p.MobTouches(mob, mobs.Factors{Damage: 5})

	assert.Empty(t, mob.hits, "GOD walks through the world without burning it")
}

// An attacker with no player-damage entry at all — a structure, or any future
// MobEntity that never gained the door — is skipped in silence, the
// non-slowable-attacker rule.
func TestRetaliateDamage_ANonReflectableAttackerIsSkipped(t *testing.T) {
	p := reflectWearer(t, 5)

	assert.NotPanics(t, func() {
		p.MobTouches(&plainAttacker{}, mobs.Factors{Damage: 5})
	})
}

// ⚑ THE guard that is new code rather than inherited. ApplySlow on a corpse is
// a natural no-op, so retaliate_slow never needed a liveness check — but
// PlayerTouches is NOT a no-op: it runs noteParticipant, noteThreat and
// tryGrantKillRewards. A dead mob's DoT tick carries its caster's ref BY
// DESIGN, so without this the burn from a mob you already killed would keep
// re-entering that mob's reward path every tick.
func TestRetaliateDamage_ADeadAttackerIsNotTouched(t *testing.T) {
	p := reflectWearer(t, 5)
	corpse := &reflectableAttacker{ratio: 0}

	p.MobTouches(corpse, mobs.Factors{Damage: 5})

	assert.Zero(t, corpse.touched,
		"a dead DoT caster's tick must not re-enter its own reward path")
}

// --- the attributed path, against a REAL mob (D4) ---
//
// The fakes above pin what leaves the wearer. These pin what ARRIVES: a real
// *mob.Mob, its real damage math, its real participant/threat/reward path. That
// is the whole of D4 — routing through PlayerTouches instead of deducting
// health is only worth doing if XP, kill credit and mitigation actually follow.

// reflectMob is a plain wolf. Name must be a valid AuraApi entity type
// (NewMob panics otherwise), and xpFactor 1 makes it an ordinary kill.
func reflectMob(t *testing.T, level int, resistances map[string]float32) *mob.Mob {
	t.Helper()
	return mob.NewMob(&mobs.MobDefinition{
		ID:         1,
		Name:       "Wolf",
		Tier:       mobs.TierNormal,
		CurveLevel: level,
		Factors: mobs.Factors{
			Speed:       1,
			XPFactor:    1,
			Resistances: resistances,
		},
		Body: mobs.Body{Radius: 0.3, AggroRadius: 2},
	}, 0, nil)
}

// rewardablePlayer is reflectWearer plus the two things a mob's reward fan-out
// reads that the bare fixture leaves empty: a name (kill credit lists it) and a
// quest ledger (NoteKill is unconditional).
func rewardablePlayer(t *testing.T, reflect float32) *player {
	t.Helper()
	p := hittablePlayer(t)
	p.name = "Reflector"
	p.adoptQuestLedger(quests.NewLedger(nil))
	// reflect 0 = no flat passive at all, for the tests that want the burst to
	// be the only reflect in play.
	if reflect > 0 {
		p.skills.EquipPassive(0, &skills.SkillDefinition{
			ID: reflectSource, Name: "FireShield", Category: skills.SkillCategoryPassive, MaxLevel: 5,
			Effects: []skills.EffectDef{{
				Type:            skills.EffectTypeRetaliateDamage,
				RetaliateDamage: &skills.RetaliateDamageParams{HP: reflect, Tags: []string{"fire"}},
			}},
		}, 1)
		require.InDelta(t, reflect, p.skills.Derived.RetaliateDamage.Damage, 1e-6, "precondition")
	}
	return p
}

// Participation + threat in one pass: the reflect alone is enough to put the
// wearer on the corpse's credit list and on its threat table. Neither is
// something a health deduction could have produced.
func TestRetaliateDamage_AReflectMakesYouAParticipantAndBuildsThreat(t *testing.T) {
	p := rewardablePlayer(t, 5)
	m := reflectMob(t, 1, nil)

	p.MobTouches(m, mobs.Factors{Damage: 1})

	assert.Equal(t, []string{"Reflector"}, m.KillCreditNames(),
		"the reflect is a player hit — it credits like one")
	rows, _ := m.ThreatSnapshot()
	require.Len(t, rows, 1, "and it pulls threat")
	assert.Greater(t, rows[0].Threat, float32(0))
}

// Mitigation applies normally (D4). It comes free from routing through
// PlayerTouches, so one assert is enough to pin that it was not bypassed.
func TestRetaliateDamage_TheAttackersResistanceMitigatesTheReflect(t *testing.T) {
	p := rewardablePlayer(t, 40)
	m := reflectMob(t, 1, map[string]float32{"fire": 0.5})
	full := m.MaxHealth()

	p.MobTouches(m, mobs.Factors{Damage: 1})

	assert.Equal(t, full-20, m.Health(),
		"a fire-resistant mob takes half the fire shield: 40 × 0.5")
}

// ⚑ THE re-entrancy pin (D4's flagged unverified risk). The reflect deals
// attributed damage from INSIDE the attacker's own damage delivery — MobTouches
// → retaliate → the mob's PlayerTouches — and here it kills the attacker
// mid-call. Everything the death path does must survive being entered from
// there: the health floors at 0, the rewards grant, and they grant ONCE.
//
// The mob's own hit still lands afterwards, deliberately: it attacked while it
// was alive. That is the same reading as a dead mob's DoT tick still landing.
func TestRetaliateDamage_AReflectKillingMidDeliveryIsSafe(t *testing.T) {
	p := rewardablePlayer(t, 100000) // enough to kill anything in one bounce
	m := reflectMob(t, 1, nil)
	before := p.PlayerVitalSigns.Health

	require.NotPanics(t, func() { p.MobTouches(m, mobs.Factors{Damage: 7}) })

	assert.Zero(t, m.Health(), "the reflect killed it mid-delivery")
	assert.Equal(t, []string{"Reflector"}, m.KillCreditNames())
	require.NotZero(t, p.Progression().Experience, "a reflect-only kill pays XP")
	assert.EqualValues(t, 1, p.QuestLedger().KillCount(1), "…and quest kill credit, once")
	assert.Equal(t, before-7, p.PlayerVitalSigns.Health,
		"the mob attacked while alive, so its own hit still lands")

	// Once, not once per participant-visit: the death latched deathRewardGiven
	// while the reflect was still on the stack.
	xp := p.Progression().Experience
	p.MobTouches(m, mobs.Factors{Damage: 0})
	assert.Equal(t, xp, p.Progression().Experience, "no second award")
	assert.EqualValues(t, 1, p.QuestLedger().KillCount(1), "no second kill credit")
}

// The dead-attacker guard against the real reward path, which is where it
// actually matters: a DoT the dead caster left burning must not walk back into
// its own corpse's rewards every tick.
func TestRetaliateDamage_ADeadDoTCasterDoesNotReEnterItsRewardPath(t *testing.T) {
	p := rewardablePlayer(t, 100000)
	m := reflectMob(t, 1, nil)
	p.MobTouches(m, mobs.Factors{Damage: 1})
	require.Zero(t, m.Health(), "precondition: it is dead")
	xp := p.Progression().Experience

	// Its DoT keeps ticking with its own ref, as designed.
	for i := 0; i < 3; i++ {
		p.MobTouches(m, mobs.Factors{Damage: 1})
	}

	assert.Equal(t, xp, p.Progression().Experience, "no re-award")
	assert.EqualValues(t, 1, p.QuestLedger().KillCount(1), "no re-credit")
}
