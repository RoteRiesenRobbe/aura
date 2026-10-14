package sys

// Death triggers (plan-effect-types-round-2.md C7, D6, D27-D29, L5, L6): a
// dying mob fires the cooldown skills its definition names in `onDeath`, from
// where it died, before it leaves the world. A despawn fires nothing.

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/mob"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func deathBurstDef() *skills.SkillDefinition {
	return &skills.SkillDefinition{
		ID: 230, Name: "TestDeathBurst", Category: skills.SkillCategoryCooldown, MaxLevel: 1,
		CooldownTicks: 30,
		Effects: []skills.EffectDef{{
			Type: skills.EffectTypeInstantDamage, Radius: 2, TargetsEnemies: true, Selector: skills.SelectorAll,
			Damage: &skills.DamageParams{HP: 10},
		}},
	}
}

func splitDef() *skills.SkillDefinition {
	spawn := &skills.SpawnParams{MobName: "Totem", TTLTicks: 300}
	return &skills.SkillDefinition{
		ID: 231, Name: "TestSplit", Category: skills.SkillCategoryCooldown, MaxLevel: 1,
		CooldownTicks: 30,
		Effects: []skills.EffectDef{
			{Type: skills.EffectTypeSpawn, Spawn: spawn},
			{Type: skills.EffectTypeSpawn, Spawn: spawn},
		},
	}
}

// deadBurster is a real mob carrying a death burst, already at 0 HP, beside a
// real player 1 u away.
func deadBurster(t *testing.T) (*mob.Mob, model.PlayerEntity, *SkillSystem) {
	t.Helper()
	def := testMobDef()
	def.OnDeath = []mobs.MobSkill{{Def: deathBurstDef(), Level: 1}}
	m := mob.NewMob(def, 0, nil)
	m.SetPosition(phy.Vec2f{})
	space := phy.NewSpace()
	addBodies(space, m.Bodies())
	p := realCCPlayer(t, phy.Vec2f{X: 1})
	addBodies(space, p.Bodies())
	space.Update()
	sk := NewSkillSystem(space, newFakeGame())
	sk.rng = testRNG()
	killMob(m)
	require.False(t, m.Update(0), "precondition: the mob reports dead")
	return m, p, sk
}

// L6: nothing on the fire path may whiff a caster for being at 0 HP.
func TestOnDeath_TheExplosionFiresFromTheDeadMob(t *testing.T) {
	m, p, sk := deadBurster(t)
	before := p.VitalSigns().Health

	require.True(t, sk.FireOnDeath(m))

	assert.Less(t, p.VitalSigns().Health, before, "the player beside the corpse took the burst")
}

// D6 + D28: an owner leaving retires its summons without a death.
func TestOnDeath_ADespawnFiresNothing(t *testing.T) {
	m, p, sk := deadBurster(t)
	m.ExpireWithOwner()
	before := p.VitalSigns().Health

	sk.FireOnDeath(m)

	assert.Equal(t, before, p.VitalSigns().Health)
}

// D29 + L5: adds are ordinary mobs on the dead mob's side, bound to nobody, so
// its removal never retires them.
func TestOnDeath_SplitsIntoUnownedAdds(t *testing.T) {
	g := newFakeGame()
	g.mobReg = fakeMobRegistry{"Totem": totemMobDef()}
	def := testMobDef()
	def.OnDeath = []mobs.MobSkill{{Def: splitDef(), Level: 1}}
	m := mob.NewMob(def, 0, nil)
	m.SetPosition(phy.Vec2f{X: 5, Y: 5})
	sk := NewSkillSystem(phy.NewSpace(), g)
	sk.rng = testRNG()
	killMob(m)

	sk.FireOnDeath(m)

	require.Len(t, g.added, 2, "both adds, with the mob out of combat and dead (no A5 gate here)")
	for _, a := range g.added {
		add := a.(*mob.Mob)
		assert.False(t, add.OwnedBy(m.Basic().ID()), "no owner: the parent's removal cannot retire it")
		assert.Equal(t, m.Faction(), add.Faction(), "it fights on the parent's side")
	}
}

type deathRecorder struct {
	fires   bool // what FireOnDeath reports
	fired   []uint64
	removed func() []uint64
	// removedAtFire is what the game had removed when each trigger fired.
	removedAtFire [][]uint64
}

func (r *deathRecorder) FireOnDeath(m model.MobEntity) bool {
	r.fired = append(r.fired, m.Basic().ID())
	r.removedAtFire = append(r.removedAtFire, append([]uint64(nil), r.removed()...))
	return r.fires
}

// D27: the sweep fires the triggers BEFORE RemoveEntity, while the mob is still
// in the space and the SkillSystem. A mob whose triggers fired nothing leaves
// at once, exactly as before.
func TestMobSystem_FiresDeathTriggersBeforeRemoval(t *testing.T) {
	ms, g := newMobSystemWith(nil)
	ms.Update(0)
	rec := &deathRecorder{removed: func() []uint64 { return g.removed }}
	ms.SetDeathTriggers(rec)
	m := mob.NewMob(testMobDef(), 0, nil)
	g.AddEntity(m)
	killMob(m)

	ms.Update(0)

	require.Equal(t, []uint64{m.Basic().ID()}, rec.fired)
	assert.Empty(t, rec.removedAtFire[0], "fired while the mob was still in the world")
	assert.Equal(t, []uint64{m.Basic().ID()}, g.removed, "and then removed")
}

// PO 2026-10-11: a mob whose death triggers FIRED lingers for one snapshot, so
// the client still holds its position and owner when the burst's events
// arrive (hit marks, the authored look, the owner's damage numbers). It leaves
// at the start of the next tick, and its triggers never fire twice.
func TestMobSystem_AMobWhoseTriggersFiredLingersOneTick(t *testing.T) {
	ms, g := newMobSystemWith(nil)
	ms.Update(0)
	rec := &deathRecorder{removed: func() []uint64 { return g.removed }, fires: true}
	ms.SetDeathTriggers(rec)
	m := mob.NewMob(testMobDef(), 0, nil)
	g.AddEntity(m)
	killMob(m)

	ms.Update(0)
	require.Len(t, rec.fired, 1)
	assert.Empty(t, g.removed, "still in the world for this tick's snapshot")

	ms.Update(0)
	assert.Equal(t, []uint64{m.Basic().ID()}, g.removed, "gone next tick")
	assert.Len(t, rec.fired, 1, "and its triggers fired once")
}

func TestOnDeath_StampsTheFiredEventForTheLook(t *testing.T) {
	m, _, sk := deadBurster(t)

	require.True(t, sk.FireOnDeath(m), "a trigger fired")

	var fired []skills.SkillID
	for _, e := range m.SkillEvents() {
		if e.Fired {
			fired = append(fired, e.SkillID)
		}
	}
	assert.Equal(t, []skills.SkillID{230}, fired, "the burst's FIRED event, so an on-fired layer draws")
}

func TestOnDeath_ADespawnReportsNothingFired(t *testing.T) {
	m, _, sk := deadBurster(t)
	m.ExpireWithOwner()

	assert.False(t, sk.FireOnDeath(m))
}

// A dead mob acts no more: during its lingering tick its aura must not tick.
func TestSkillSystem_ADeadMobDoesNotAct(t *testing.T) {
	auraDef := &skills.SkillDefinition{
		ID: 233, Name: "TestDeadAura", Category: skills.SkillCategoryActiveAura, MaxLevel: 1,
		Effects: []skills.EffectDef{{
			Type: skills.EffectTypeDamageAura, Radius: 2, TargetsEnemies: true, TickInterval: 1,
			Damage: &skills.DamageParams{HP: 5},
		}},
	}
	def := testMobDef()
	def.Skills = []mobs.MobSkill{{Def: auraDef, Level: 1}}
	caster := mob.NewMob(def, 0, nil)
	caster.SkillComponent().SetActiveAura(0)
	space := phy.NewSpace()
	addBodies(space, caster.Bodies())
	p := realCCPlayer(t, phy.Vec2f{X: 1})
	addBodies(space, p.Bodies())
	sk := NewSkillSystem(space, newFakeGame())
	sk.rng = testRNG()
	sk.AddEntity(caster)
	killMob(caster)
	full := p.VitalSigns().Health

	for i := 0; i < 3; i++ {
		worldTick(space, sk, caster, p.(ccTickable))
	}

	assert.Equal(t, full, p.VitalSigns().Health)
}
