package sys

import (
	"testing"

	"github.com/EngoEngine/ecs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Stat buffs and debuffs on others (plan-effect-types-round-2.md C1, D11-D14):
// stat_aura and instant_stat, the resist pair's shape over the stat payload.

type appliedStat struct {
	source skills.SkillID
	stat   string
	bonus  float32
	ticks  int
}

// statTarget records ApplyStat calls on a REAL buff store, so the new-vs-refresh
// answer an aura is charged off is the shipped one.
type statTarget struct {
	model.MobEntity
	basic   ecs.BasicEntity
	faction model.Faction
	stats   []appliedStat
	buffs   skills.Buffs
}

func (r *statTarget) Basic() ecs.BasicEntity { return r.basic }
func (r *statTarget) Faction() model.Faction { return r.faction }
func (r *statTarget) ApplyStat(source skills.SkillID, stat string, bonus float32, ticks int) bool {
	r.stats = append(r.stats, appliedStat{source, stat, bonus, ticks})
	return r.buffs.ApplyStat(source, stat, bonus, ticks)
}
func (r *statTarget) EffectiveStats() skills.DerivedStats {
	return skills.DerivedStats{}.WithBuffs(&r.buffs)
}

func statAuraEffect() skills.EffectDef {
	return skills.EffectDef{
		Type:          skills.EffectTypeStatAura,
		TargetsAllies: true,
		TickInterval:  20,
		Stat:          &skills.StatParams{Name: skills.StatDamageReduction, Bonus: 0.2, BonusPerLevel: 0.05},
	}
}

func TestApplyStatAura_BuffsAlliesAndSelfWithLevelScaledBonus(t *testing.T) {
	caster := newFakePlayer()
	ally := &statTarget{basic: ecs.NewBasic(), faction: model.FactionAligned}
	effect := statAuraEffect()
	effect.Stat.TargetsSelf = true

	fresh := applyStatAura(caster, 90, 3, effect, colliderSetOf(ally))

	assert.True(t, fresh, "a first application is work")
	require.Len(t, ally.stats, 1)
	got := ally.stats[0]
	assert.Equal(t, skills.SkillID(90), got.source)
	assert.Equal(t, skills.StatDamageReduction, got.stat)
	assert.InDelta(t, 0.3, got.bonus, 1e-6, "level 3 = 0.2 + 2×0.05")
	assert.Equal(t, 21, got.ticks, "lifetime = tick interval + 1, the resist_aura rule")
	assert.InDelta(t, 0.3, caster.buffs.StatBonus(skills.StatDamageReduction), 1e-6, "targetsSelf buffs the caster")

	assert.False(t, applyStatAura(caster, 90, 3, effect, colliderSetOf(ally)),
		"a refresh at the same bonus is not work and is not charged")
}

func TestApplyStatAura_EnemiesOnlyWhenAuthored(t *testing.T) {
	caster := newFakePlayer()
	enemy := &statTarget{basic: ecs.NewBasic(), faction: model.FactionHostile}

	applyStatAura(caster, 90, 1, statAuraEffect(), colliderSetOf(enemy))
	assert.Empty(t, enemy.stats, "targetsAllies alone never reaches an enemy")

	debuff := statAuraEffect()
	debuff.TargetsAllies, debuff.TargetsEnemies = false, true
	debuff.Stat = &skills.StatParams{Name: skills.StatDamageDealt, Bonus: -0.25}
	applyStatAura(caster, 91, 1, debuff, colliderSetOf(enemy))
	require.Len(t, enemy.stats, 1)
	assert.InDelta(t, 0.75, enemy.EffectiveStats().DamageFactor(), 1e-6, "a demoralize weakens the enemy's hits")
}

func demoralizeDef() *skills.SkillDefinition {
	return &skills.SkillDefinition{
		ID: 92, Name: "Demoralize", Category: skills.SkillCategoryCooldown, MaxLevel: 1,
		CooldownTicks: 600,
		Effects: []skills.EffectDef{{
			Type:           skills.EffectTypeInstantStat,
			Radius:         3,
			TargetsEnemies: true,
			Stat:           &skills.StatParams{Name: skills.StatDamageDealt, Bonus: -0.2, DurationTicks: 300},
		}},
	}
}

func TestCooldown_InstantStatDebuffsTheEnemyInTheCircle(t *testing.T) {
	enemy := &statTarget{basic: ecs.NewBasic(), faction: model.FactionHostile}
	caster, sk := cooldownCaster(spaceWithBurstTarget(int(model.LayerActionCollision), enemy))
	caster.sc.EquipCooldown(0, demoralizeDef(), 1)
	caster.sc.RequestCooldownActivation(0)

	sk.Update(33.0)

	require.Len(t, enemy.stats, 1)
	assert.InDelta(t, -0.2, enemy.stats[0].bonus, 1e-6)
	assert.Equal(t, 300+1, enemy.stats[0].ticks, "instant lifetime = authored duration + 1")
	assert.Zero(t, caster.buffs.StatBonus(skills.StatDamageDealt), "no self-debuff without targetsSelf")
}

func TestApplyInstantStat_WhiffAnswersFalse(t *testing.T) {
	caster, sk := cooldownCaster(spaceWithBurstTarget(int(model.LayerActionCollision), nil))
	assert.False(t, sk.applyInstantStat(caster, 92, 1, demoralizeDef().Effects[0]),
		"nobody in the circle: a mob keeps the cooldown ready")
}

// D14: the two shared outgoing read sites see the buffs beside Derived.
func TestCasterFactors_ReadTheTimedStatBuffs(t *testing.T) {
	caster := newFakePlayer()
	caster.buffs.ApplyStat(1, skills.StatDamageDealt, 0.5, 30)
	caster.buffs.ApplyStat(2, skills.StatCritChance, 0.25, 30)

	assert.InDelta(t, 1.5, casterDamageFactor(caster), 1e-6)
	assert.InDelta(t, 0.25, casterCritChance(caster)-casterCritChance(newFakePlayer()), 1e-6)
}

func (f *fakePlayer) ApplyStat(source skills.SkillID, stat string, bonus float32, ticks int) bool {
	return f.buffs.ApplyStat(source, stat, bonus, ticks)
}
func (f *fakePlayer) EffectiveStats() skills.DerivedStats { return f.sc.Derived.WithBuffs(&f.buffs) }

// fakeMob carries no buff store; its stats are its loadout fold.
func (m *fakeMob) ApplyStat(skills.SkillID, string, float32, int) bool { return false }
func (m *fakeMob) EffectiveStats() skills.DerivedStats                 { return m.sc.Derived }
