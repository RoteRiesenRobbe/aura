package mob

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/vitals"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Thorns on a mob (plan-effect-types-round-2.md C2, D17): a mob wearing a
// retaliate_burst bounces a share of every hit back at whoever landed it,
// through the attacker's ordinary mob-damage door, before its own mitigation.
// A reflected hit never retaliates (PO 2026-10-07), or two wearers would
// bounce one hit forever.

const thornsSource = skills.SkillID(204)

// touchedPlayer records the mob-damage door on a fake player.
type touchedPlayer struct {
	*fakeAuraPlayer
	got  []mobs.Factors
	from []model.MobEntity
}

func (p *touchedPlayer) MobTouches(m model.MobEntity, f mobs.Factors) {
	p.got = append(p.got, f)
	p.from = append(p.from, m)
}

func thornedMob(t *testing.T) *Mob {
	t.Helper()
	m := mobWithPool(1000)
	m.ApplyReflect(thornsSource, 0.25, []string{"nature"}, 300)
	_, live, _ := m.ReflectBurst()
	require.NotZero(t, live, "precondition: the reflect is up")
	return m
}

func TestThorns_AMobReflectsAPlayersHitThroughTheMobDoor(t *testing.T) {
	m := thornedMob(t)
	p := &touchedPlayer{fakeAuraPlayer: newFakeAuraPlayer()}

	m.PlayerTouches(p, model.Damage{HP: 40, Tags: []string{"frost"}})

	require.Len(t, p.got, 1)
	assert.InDelta(t, 10, p.got[0].Damage, 1e-6, "25% of the 40 HP swing")
	assert.Equal(t, []string{"nature"}, p.got[0].DamageTags, "the buff's authored type, not the hit's")
	assert.Equal(t, thornsSource, p.got[0].SkillID)
	assert.True(t, p.got[0].Reflected, "marked, so the player's own retaliation stays quiet")
	assert.Same(t, m, p.from[0])
	assert.Equal(t, vitals.VitalSign(960), m.Health(), "the mob's own hit still lands")
}

// The pre-mitigation rule, mob side: a damageReduction on the wearer does not
// shrink what it reflects.
func TestThorns_AMobReflectsThePreMitigationHit(t *testing.T) {
	m := thornedMob(t)
	m.ApplyStat(1, skills.StatDamageReduction, 0.5, 300)
	p := &touchedPlayer{fakeAuraPlayer: newFakeAuraPlayer()}

	m.PlayerTouches(p, model.Damage{HP: 40})

	require.Len(t, p.got, 1)
	assert.InDelta(t, 10, p.got[0].Damage, 1e-6)
}

func TestThorns_AReflectedHitIsNotReflectedAgain(t *testing.T) {
	m := thornedMob(t)
	p := &touchedPlayer{fakeAuraPlayer: newFakeAuraPlayer()}

	m.PlayerTouches(p, model.Damage{HP: 40, Reflected: true})

	assert.Empty(t, p.got)
}

func TestThorns_ADeadAttackerIsSkipped(t *testing.T) {
	m := thornedMob(t)
	p := &touchedPlayer{fakeAuraPlayer: newFakeAuraPlayer()}
	p.vs.Health = 0

	m.PlayerTouches(p, model.Damage{HP: 40})

	assert.Empty(t, p.got, "a DoT from a dead player must not bounce into its corpse")
}

// A summon's hit bounces at the summon, not at its owner standing elsewhere.
func TestThorns_ASummonsHitReflectsAtTheSummon(t *testing.T) {
	m := thornedMob(t)
	owner := &touchedPlayer{fakeAuraPlayer: newFakeAuraPlayer()}
	summon := mobWithPool(1000)

	m.PlayerTouches(owner, model.Damage{HP: 40, Source: summon})

	assert.Empty(t, owner.got)
	assert.Equal(t, vitals.VitalSign(990), summon.Health(), "25% of 40 back at the summon")
}

// Two thorned mobs: one hop each way at most. A bounces 25 into B, and B's
// reflect does not fire on that reflected hit.
func TestThorns_TwoWearersBounceOnce(t *testing.T) {
	a := thornedMob(t)
	b := thornedMob(t)

	a.MobTouches(b, mobs.Factors{Damage: 100})

	assert.Equal(t, vitals.VitalSign(900), a.Health(), "a takes the swing and nothing back")
	assert.Equal(t, vitals.VitalSign(975), b.Health(), "b takes 25% of its own swing, once")
}

func TestThorns_TheReflectWearsAPip(t *testing.T) {
	m := thornedMob(t)
	assert.NotZero(t, m.AppliedEffects()&skills.AppliedEffectReflect)
}
