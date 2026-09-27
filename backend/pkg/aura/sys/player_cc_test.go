package sys

// The player CC doors at the SkillSystem (plan-aura-drawbacks.md C2, §3.2-§3.4,
// PO rulings D9/D10). Every leg puts its slow or stun on a player built by the
// REAL constructor, never a double: a double that has the door proves nothing
// about the type the game runs (self_buff_capabilities_test.go, the R3 story).

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/mob"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/player"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const ccTestSource = skills.SkillID(211)

// realCCPlayer is a player from the real constructor, standing at pos.
func realCCPlayer(t *testing.T, pos phy.Vec2f) model.PlayerEntity {
	t.Helper()
	p := player.New(newStateFakeGame(t), nil, "cc-target")
	p.SetPosition(pos)
	return p
}

// ccTickable is the per-tick hook (the StatusEffectsSystem's) both real entity
// kinds carry: it ages the buff store, the combat window and the stamps.
type ccTickable interface{ ResetTickNumbers() }

// worldTick is one tick in the order the game runs it: the tick-start hooks,
// then physics, then the SkillSystem.
func worldTick(space *phy.Space, sk *SkillSystem, entities ...ccTickable) {
	for _, e := range entities {
		e.ResetTickNumbers()
	}
	space.Update()
	sk.Update(33.0)
}

func addBodies(space *phy.Space, bodies model.Bodies) {
	for _, b := range bodies {
		if b != nil {
			space.AddShape(b)
		}
	}
}

// --- the slow door ---

func TestSlowAura_AMobSlowReachesARealPlayer(t *testing.T) {
	caster := mob.NewMob(testMobDef(), 0, nil)
	p := realCCPlayer(t, phy.Vec2f{})
	require.Equal(t, float32(1), p.MovementFactor(), "precondition")

	effect := skills.EffectDef{
		Type: skills.EffectTypeSlowAura, Radius: 2, TickInterval: 10, TargetsEnemies: true,
		Slow: &skills.SlowParams{Fraction: 0.4},
	}
	fresh := applySlowAura(caster, ccTestSource, 1, effect, colliderSetOf(p))

	assert.True(t, fresh, "the player's door answered")
	assert.InDelta(t, 0.6, p.MovementFactor(), 1e-6, "the walk slows")
	assert.NotZero(t, p.AppliedEffects()&skills.AppliedEffectSlow, "the Slow pip bit is on the wire")
	assert.True(t, p.InCombat(), "a slowed player is in combat (A4)")
}

// §3.5: GOD refuses both doors through the real appliers.
func TestCCDoors_GodRefusesThroughTheAppliers(t *testing.T) {
	caster := mob.NewMob(testMobDef(), 0, nil)
	p := realCCPlayer(t, phy.Vec2f{})
	p.SetGodmode(true)

	slow := skills.EffectDef{
		Type: skills.EffectTypeSlowAura, Radius: 2, TickInterval: 10, TargetsEnemies: true,
		Slow: &skills.SlowParams{Fraction: 0.4},
	}
	applySlowAura(caster, ccTestSource, 1, slow, colliderSetOf(p))
	p.(stunnable).ApplyStun(ccTestSource, 30)

	assert.Equal(t, float32(1), p.MovementFactor())
	assert.False(t, p.(stunSuppressible).Stunned())
	assert.False(t, p.InCombat())
}

// §3.4 (a): the web IS a poison pool that slows. A structure mob's slow_aura in
// a real space slows a real player standing inside, holds the slow while they
// stay, and frees them within one buff lifetime (interval + 1) of leaving.
func TestWeb_SlowsAPlayerInsideAndFreesThemWithinOneLifetime(t *testing.T) {
	const interval = 10
	webAura := &skills.SkillDefinition{
		ID: 212, Name: "TestWebAura", Category: skills.SkillCategoryActiveAura, MaxLevel: 1,
		Effects: []skills.EffectDef{{
			Type: skills.EffectTypeSlowAura, Radius: 1.5, TickInterval: interval, TargetsEnemies: true,
			Slow: &skills.SlowParams{Fraction: 0.4},
		}},
	}
	webDef := totemMobDef()
	webDef.Name = "Totem"
	webDef.Skills = []mobs.MobSkill{{Def: webAura, Level: 1}}
	web := mob.NewMob(webDef, 0, nil)
	web.SetPosition(phy.Vec2f{})

	space := phy.NewSpace()
	addBodies(space, web.Bodies())
	p := realCCPlayer(t, phy.Vec2f{X: 0.5})
	addBodies(space, p.Bodies())

	sk := NewSkillSystem(space, newFakeGame())
	sk.rng = testRNG()
	sk.AddEntity(web)

	for i := 0; i < 2*interval; i++ {
		worldTick(space, sk, web, p.(ccTickable))
	}
	require.InDelta(t, 0.6, p.MovementFactor(), 1e-6, "slowed inside the web")
	for i := 0; i < 3*interval; i++ {
		worldTick(space, sk, web, p.(ccTickable))
		require.InDelta(t, 0.6, p.MovementFactor(), 1e-6, "tick %d: the slow holds between aura beats", i)
	}

	p.SetPosition(phy.Vec2f{X: 20})
	for i := 0; i < interval+1; i++ {
		worldTick(space, sk, web, p.(ccTickable))
	}
	assert.Equal(t, float32(1), p.MovementFactor(), "free within one buff lifetime of leaving")
}

// --- the stun door, the cast half ---

func stunTestAura() *skills.SkillDefinition {
	return &skills.SkillDefinition{
		ID: 213, Name: "TestStunAura", Category: skills.SkillCategoryActiveAura, MaxLevel: 1,
		Effects: []skills.EffectDef{{
			Type: skills.EffectTypeDamageAura, Radius: 1, TickInterval: 1, TargetsEnemies: true,
			Damage: &skills.DamageParams{HP: 1},
		}},
	}
}

func stunTestCooldown() *skills.SkillDefinition {
	return &skills.SkillDefinition{
		ID: 214, Name: "TestStunBurst", Category: skills.SkillCategoryCooldown, MaxLevel: 1,
		CooldownTicks: 100,
		Effects: []skills.EffectDef{{
			Type: skills.EffectTypeInstantDamage, Radius: 1, TargetsEnemies: true,
			Damage: &skills.DamageParams{HP: 1},
		}},
	}
}

// A6 on a player: the real player now answers the gate, so their aura stops
// ticking while stunned and resumes on the beat it was interrupted.
func TestStun_ARealPlayersAuraDoesNotTick(t *testing.T) {
	p := realCCPlayer(t, phy.Vec2f{})
	sc := p.SkillComponent()
	sc.EquipAura(0, stunTestAura(), 1)
	sc.SetActiveAura(0)
	s := testSkillSystem()

	s.processEntity(p)
	before := sc.AuraSlots[0].TickAccumulator
	require.NotZero(t, before, "precondition: it advances when not stunned")

	require.True(t, p.(stunnable).ApplyStun(ccTestSource, 90))
	for i := 0; i < 5; i++ {
		s.processEntity(p)
	}
	assert.Equal(t, before, sc.AuraSlots[0].TickAccumulator, "a stunned player's aura does not tick")
}

// The same-tick race: the input system runs before the SkillSystem, so a press
// can be queued this tick and a stun land later in the same SkillSystem pass.
// That press must not survive the stun and fire the moment it ends.
func TestStun_APressQueuedBeforeTheStunDoesNotFireWhenItEnds(t *testing.T) {
	p := realCCPlayer(t, phy.Vec2f{})
	sc := p.SkillComponent()
	sc.EquipCooldown(0, stunTestCooldown(), 1)
	sc.RequestUtilityCast(skills.UtilityRecall)
	sc.RequestCooldownActivation(0)
	require.True(t, p.(stunnable).ApplyStun(ccTestSource, 3))

	s := testSkillSystem()
	for i := 0; i < 10; i++ {
		p.(ccTickable).ResetTickNumbers()
		s.processEntity(p)
	}

	require.False(t, p.(stunSuppressible).Stunned(), "precondition: the stun is over")
	assert.Zero(t, sc.SlotCooldownRemaining(0), "the queued press never fired")
	assert.False(t, sc.IsCasting(), "the queued utility never started")
	assert.Empty(t, sc.PendingCooldowns)
	assert.Empty(t, sc.PendingUtilities)
}

// --- a mob-cast stun reaches a real player in a real space ---

func paralyzeDef() *skills.SkillDefinition {
	return &skills.SkillDefinition{
		ID: 215, Name: "TestParalyze", Category: skills.SkillCategoryCooldown, MaxLevel: 1,
		CooldownTicks: 900,
		Effects: []skills.EffectDef{{
			Type: skills.EffectTypeStun, Radius: 2.5, MaxTargets: 1, TargetsEnemies: true,
			Stun: &skills.StunParams{DurationTicks: 60},
		}},
	}
}

func TestStun_AMobCastStunReachesARealPlayerAndIsConsumedOnlyOnAHit(t *testing.T) {
	casterDef := testMobDef()
	casterDef.Skills = []mobs.MobSkill{{Def: paralyzeDef(), Level: 1}}
	caster := mob.NewMob(casterDef, 0, nil)
	caster.SetPosition(phy.Vec2f{})

	space := phy.NewSpace()
	addBodies(space, caster.Bodies())
	p := realCCPlayer(t, phy.Vec2f{X: 20})
	addBodies(space, p.Bodies())
	sk := NewSkillSystem(space, newFakeGame())
	sk.rng = testRNG()
	sk.AddEntity(caster)

	for i := 0; i < 5; i++ {
		worldTick(space, sk, caster, p.(ccTickable))
	}
	require.Zero(t, caster.SkillComponent().SlotCooldownRemaining(0), "nobody in range: kept ready, not consumed")
	require.False(t, p.(stunSuppressible).Stunned())

	p.SetPosition(phy.Vec2f{X: 1})
	worldTick(space, sk, caster, p.(ccTickable))

	assert.True(t, p.(stunSuppressible).Stunned(), "the mob's stun held the real player")
	assert.Equal(t, float32(0), p.MovementFactor())
	assert.NotZero(t, caster.SkillComponent().SlotCooldownRemaining(0), "consumed on the hit")
	_, reason := p.ActivationRejected()
	assert.Equal(t, model.ActivationRejectedStunned, reason, "P5: the landing is noted")
}

// --- instant_slow (§3.2, D3) ---

func snareDef(duration int) *skills.SkillDefinition {
	return &skills.SkillDefinition{
		ID: 216, Name: "TestSnare", Category: skills.SkillCategoryCooldown, MaxLevel: 1,
		CooldownTicks: 300,
		Effects: []skills.EffectDef{{
			Type: skills.EffectTypeInstantSlow, Radius: 2.5, MaxTargets: 1, TargetsEnemies: true,
			Slow: &skills.SlowParams{Fraction: 0.4, DurationTicks: duration},
		}},
	}
}

// A mob's instant_slow lands on a real player for its authored lifetime (+1,
// the instant_resist convention) and is consumed only on a hit.
func TestInstantSlow_AMobCastSlowsARealPlayerAndIsConsumedOnlyOnAHit(t *testing.T) {
	const duration = 20
	casterDef := testMobDef()
	casterDef.Skills = []mobs.MobSkill{{Def: snareDef(duration), Level: 1}}
	caster := mob.NewMob(casterDef, 0, nil)
	caster.SetPosition(phy.Vec2f{})

	space := phy.NewSpace()
	addBodies(space, caster.Bodies())
	p := realCCPlayer(t, phy.Vec2f{X: 20})
	addBodies(space, p.Bodies())
	sk := NewSkillSystem(space, newFakeGame())
	sk.rng = testRNG()
	sk.AddEntity(caster)

	for i := 0; i < 5; i++ {
		worldTick(space, sk, caster, p.(ccTickable))
	}
	require.Zero(t, caster.SkillComponent().SlotCooldownRemaining(0), "nobody in range: kept ready")

	p.SetPosition(phy.Vec2f{X: 1})
	worldTick(space, sk, caster, p.(ccTickable))
	require.NotZero(t, caster.SkillComponent().SlotCooldownRemaining(0), "consumed on the hit")
	require.InDelta(t, 0.6, p.MovementFactor(), 1e-6, "the real player is slowed")
	assert.True(t, p.InCombat(), "a slowed player is in combat")

	// The lifetime is the authored one: it holds after the player walks out of
	// the circle, and ends duration + 1 ticks after it landed.
	p.SetPosition(phy.Vec2f{X: 20})
	for i := 0; i < duration; i++ {
		worldTick(space, sk, caster, p.(ccTickable))
	}
	assert.InDelta(t, 0.6, p.MovementFactor(), 1e-6, "still slowed after the authored duration")
	worldTick(space, sk, caster, p.(ccTickable))
	assert.Equal(t, float32(1), p.MovementFactor(), "gone at duration + 1")
}

// The bool is the mob-consume contract, the applyStun shape: a hit is "a
// target was selected", so a REFRESH is still a hit. Fresh-only would let a
// mob whose cooldown is shorter than its slow re-fire every tick unconsumed.
// A player caster stamps its own combat entry, the applySlowAura rule.
func TestApplyInstantSlow_ARefreshIsAHitAndTheCasterEntersCombat(t *testing.T) {
	space := phy.NewSpace()
	target := mob.NewMob(testMobDef(), 0, nil)
	target.SetPosition(phy.Vec2f{X: 1})
	addBodies(space, target.Bodies())
	caster := realCCPlayer(t, phy.Vec2f{})
	s := NewSkillSystem(space, newFakeGame())
	s.rng = testRNG()
	space.Update()

	effect := snareDef(20).Effects[0]
	require.True(t, s.applyInstantSlow(caster, 216, 1, effect), "a fresh slow is a hit")
	require.NotZero(t, target.AppliedEffects()&skills.AppliedEffectSlow, "the target is slowed")
	assert.True(t, caster.InCombat(), "CC'ing a hostile enters combat")

	assert.True(t, s.applyInstantSlow(caster, 216, 1, effect), "a refresh is still a hit")

	target.SetPosition(phy.Vec2f{X: 20})
	space.Update()
	assert.False(t, s.applyInstantSlow(caster, 216, 1, effect), "an empty circle is a whiff")
}

// --- the mob spawn guard (A5) ---

func TestSpawnGuard_AnIdleMobSpawnsNothingAndAFightingOneDoes(t *testing.T) {
	g := newFakeGame()
	g.mobReg = fakeMobRegistry{"Totem": totemMobDef()}
	casterDef := testMobDef()
	casterDef.Skills = []mobs.MobSkill{{Def: summonTotemDef(), Level: 1}}
	caster := mob.NewMob(casterDef, 0, nil)
	caster.SetPosition(phy.Vec2f{X: 5, Y: 5})

	sk := NewSkillSystem(phy.NewSpace(), g)
	sk.rng = testRNG()
	sk.AddEntity(caster)

	for i := 0; i < 10; i++ {
		sk.Update(33.0)
	}
	require.False(t, caster.InCombat(), "precondition: idle")
	assert.Empty(t, g.added, "an idle mob drops nothing, however long its cooldown sits ready")
	assert.Zero(t, caster.SkillComponent().SlotCooldownRemaining(0), "and the cooldown is kept, not spent")

	caster.AreaTouches(nil, model.Damage{HP: 1}) // hit: the damage-recency window opens
	require.True(t, caster.InCombat())
	sk.Update(33.0)

	require.Len(t, g.added, 1, "a fighting mob drops its summon")
	summon := g.added[0].(*mob.Mob)
	// TTL 300 at skill level 1: 299 live updates, the 300th removes it (the
	// TestCooldown_SpawnAddsOwnedAlignedMobWithTTL count).
	for i := 0; i < summonTotemDef().Effects[0].Spawn.TTLTicks-1; i++ {
		require.True(t, summon.Update(0), "tick %d: alive inside its TTL", i)
	}
	assert.False(t, summon.Update(0), "the summon expires by TTL")
}

// The stun dies with the character (§7 C2 tests): the buff store lives on the
// player struct, and the respawn rebuilds that struct, so nothing carries it
// over. The DR ladder goes with it.
func TestStun_DiesWithTheCharacter(t *testing.T) {
	s, g := newStateFixture(t)
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Alice")
	require.True(t, p.(stunnable).ApplyStun(ccTestSource, 10_000))
	kill(t, s, p)

	c.respawns = append(c.respawns, &model.Respawn{})
	s.Update(0)

	respawned := g.players[len(g.players)-1]
	require.NotSame(t, p, respawned)
	assert.False(t, respawned.(stunSuppressible).Stunned(), "the respawned character is not held")
	assert.Equal(t, float32(1), respawned.MovementFactor())
}
