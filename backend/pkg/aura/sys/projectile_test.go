package sys

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/curve"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/mob"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// --- projectile effect (plan-prototype-projectile.md P1, D2/D4/D5) ---
//
// The prototype's whole trick is that nothing here is new machinery: the
// projectile is a mob (D1), its detonation is the mob auto-fire path reading its
// own authored burst cooldown (D4), and mine-vs-timed is the TTL an authored
// throw skill hands it (D5). These tests pin the three joins that ARE new: the
// forward placement, the fuse (SetCooldownRemaining at spawn), and the
// despawn-on-fire the PO added on 2026-08-19.

// bombBurstTestDef is the shape of api/skills/bomb-burst.json: NovaBurst's
// instant_damage, enemies only, allies never. Numbers [PLACEHOLDER].
func bombBurstTestDef() *skills.SkillDefinition {
	return &skills.SkillDefinition{
		ID: 149, Name: "BombBurst", Category: skills.SkillCategoryCooldown, MaxLevel: 1,
		CooldownTicks: 300,
		Effects: []skills.EffectDef{{
			Type:           skills.EffectTypeInstantDamage,
			Radius:         2.0,
			TargetsEnemies: true,
			TargetsAllies:  false,
			Damage:         &skills.DamageParams{HP: 18},
		}},
	}
}

// projectileBombTestDef is the shape of api/mobs/projectile-bomb.json: a
// structure carrying its burst in a COOLDOWN slot (mob loadouts slot by
// category), with the effectively-unkillable pool D6 authors for the
// player-thrown side.
func projectileBombTestDef() *mobs.MobDefinition {
	return &mobs.MobDefinition{
		ID: 10, Name: "Companion", // must be a valid AuraApi entity type name
		Role:       mobs.RoleStructure,
		Body:       mobs.Body{Radius: 0.25},
		Factors:    mobs.Factors{BaseMaxHealth: 9999, Speed: 0},
		CurveLevel: 1,
		Curve:      curve.Curve{Growth: 1.12, MaxLevel: 30},
		Skills:     []mobs.MobSkill{{Def: bombBurstTestDef(), Level: 1}},
	}
}

// throwMineTestDef is the MINE authoring (D5): ttlTicks far outlasts armTicks,
// so it arms and then waits for someone to wander in.
func throwMineTestDef() *skills.SkillDefinition {
	return projectileDefWith(150, "ThrowMine", 3.0, 900, 45)
}

// throwBombTestDef is the TIMED authoring (D5): ttlTicks = armTicks + 1, which
// is exactly one fire opportunity.
func throwBombTestDef() *skills.SkillDefinition {
	return projectileDefWith(151, "ThrowBomb", 3.0, 46, 45)
}

func projectileDefWith(id skills.SkillID, name string, forward float32, ttl, arm int) *skills.SkillDefinition {
	return &skills.SkillDefinition{
		ID: id, Name: name, Category: skills.SkillCategoryCooldown, MaxLevel: 1,
		CooldownTicks: 300,
		Effects: []skills.EffectDef{{
			Type: skills.EffectTypeProjectile,
			Spawn: &skills.SpawnParams{
				MobName: "ProjectileBomb", TTLTicks: ttl,
				ForwardUnits: forward, ArmTicks: arm,
			},
		}},
	}
}

// throwTestSetup wires a player walking east with the given throw skill in slot
// 0, over a SkillSystem backed by the given space.
func throwTestSetup(space *phy.Space, throw *skills.SkillDefinition) (*fakePlayer, *fakeGame, *SkillSystem) {
	g := newFakeGame()
	g.mobReg = fakeMobRegistry{"ProjectileBomb": projectileBombTestDef()}
	caster := newFakePlayer()
	caster.lastMoveDir = phy.Vec2f{X: 1, Y: 0}
	caster.sc.EquipCooldown(0, throw, 1)
	sk := NewSkillSystem(space, g)
	sk.rng = testRNG()
	sk.AddEntity(caster)
	return caster, g, sk
}

// throwOnce fires the equipped throw and returns the projectile, registered
// with the SkillSystem exactly as the real game.AddEntity would.
func throwOnce(t *testing.T, caster *fakePlayer, g *fakeGame, sk *SkillSystem) *mob.Mob {
	t.Helper()
	caster.sc.RequestCooldownActivation(0)
	sk.Update(33.0)
	require.Len(t, g.added, 1, "a throw never whiffs, exactly like a spawn")
	m := g.added[0].(*mob.Mob)
	sk.AddEntity(m)
	return m
}

// --- placement (step 2) ---

func TestProjectile_LandsForwardUnitsAheadAlongLastMoveDir(t *testing.T) {
	caster, g, sk := throwTestSetup(phy.NewSpace(), throwMineTestDef())
	m := throwOnce(t, caster, g, sk)

	assert.InDelta(t, 3.0, m.Position().X, 1e-3, "forwardUnits ahead along the aim")
	assert.InDelta(t, 0.0, m.Position().Y, 1e-3)
	assert.Equal(t, caster.sc.CooldownSlots[0].EffectiveCooldownTicks(), caster.sc.SlotCooldownRemaining(0),
		"the throw consumes its own cooldown")
}

func TestProjectile_AimIsTheLastWalkingDirection(t *testing.T) {
	caster, g, sk := throwTestSetup(phy.NewSpace(), throwMineTestDef())
	caster.lastMoveDir = phy.Vec2f{X: 0, Y: -1} // walked north, per the client's axis

	m := throwOnce(t, caster, g, sk)

	assert.InDelta(t, 0.0, m.Position().X, 1e-3)
	assert.InDelta(t, -3.0, m.Position().Y, 1e-3)
}

// ⭐ A THROW NEVER WHIFFS, so a caster who has never moved gets the bomb at
// their feet rather than nothing at all: the spawn rule ("visible beats
// unplaceable", summonPosition's fallback) beats dash's, which returns false
// because a dash to nowhere is genuinely a no-op. Pinned so the fresh-spawn case
// is a decision rather than an accident.
func TestProjectile_ZeroAimLandsAtTheCastersFeet(t *testing.T) {
	caster, g, sk := throwTestSetup(phy.NewSpace(), throwMineTestDef())
	caster.lastMoveDir = phy.Vec2f{} // spawned, never walked

	m := throwOnce(t, caster, g, sk)

	assert.Equal(t, caster.aura.Position(), m.Position(), "no aim: at the caster's feet, still a bomb")
}

func TestProjectile_ClampsAtABlockingStatic(t *testing.T) {
	// A wall across the throw line at x = 2: the bomb must land short of it,
	// never inside the geometry and never beyond it.
	space := phy.NewSpace()
	wall := phy.NewCircle(phy.Vec2f{X: 2, Y: 0}, 0.5)
	wall.Shape().Layer = int(model.LayerPlayerStaticCollision)
	space.AddStaticShape(wall)

	caster, g, sk := throwTestSetup(space, throwMineTestDef())
	m := throwOnce(t, caster, g, sk)

	assert.Less(t, m.Position().X, float32(1.5), "clamped short of the wall's near face")
	assert.Greater(t, m.Position().X, float32(0.0), "but still thrown, not dropped")
	assert.GreaterOrEqual(t, m.Position().Sub(wall.Position()).Abs(), float32(0.75),
		"body clear of the blocker (0.25 + 0.5)")
}

func TestProjectile_ClampsAtTheBorder(t *testing.T) {
	// The border wall is an inverted AABB: only circles LEAVING the bounds
	// intersect it, which is what makes the same probe mask double as the
	// in-bounds check (summonPosition's note).
	space := phy.NewSpace()
	wall := phy.NewInvAABB(phy.VEC2F_ZERO, 4, 4) // half-extents 2×2
	wall.Shape().Layer = int(model.LayerBorderCollision)
	space.AddStaticShape(wall)

	caster, g, sk := throwTestSetup(space, throwMineTestDef())
	m := throwOnce(t, caster, g, sk)

	assert.Less(t, m.Position().X, float32(2.0), "never thrown out of bounds")
}

// --- ownership, pool and fuse (step 2) ---

func TestProjectile_IsOwnedAlignedFullPooledAndArmed(t *testing.T) {
	caster, g, sk := throwTestSetup(phy.NewSpace(), throwMineTestDef())
	caster.level = 5
	m := throwOnce(t, caster, g, sk)

	assert.Equal(t, model.FactionAligned, m.Faction(), "a thrown thing fights on its thrower's side")
	assert.Same(t, model.PlayerEntity(caster), m.Owner())
	// ⚑ The landmine buildSummon encodes: the pool only widens once the owner
	// is bound, so a projectile that skipped the refill would stand at its
	// species pool inside its owner-scaled max and quietly regenerate the gap.
	assert.Equal(t, m.MaxHealth(), m.Health(), "spawned at the full owner-scaled pool")

	burst := m.SkillComponent().CooldownSlots[0]
	require.NotNil(t, burst, "the projectile carries its detonation in a cooldown slot (D4)")
	assert.Equal(t, 45, m.SkillComponent().CooldownRemaining(burst.Def.ID),
		"the fuse IS the burst's cooldown, held down for armTicks")
}

// --- detonation (step 3) ---

// bombTarget is a hostile body the burst can land on, placed near the bomb.
func spaceWithBodyAt(pos phy.Vec2f, layer int, userData any) (*phy.Space, *phy.Circle) {
	space := phy.NewSpace()
	c := addBodyAt(space, pos, layer, userData)
	space.Update()
	return space, c
}

func addBodyAt(space *phy.Space, pos phy.Vec2f, layer int, userData any) *phy.Circle {
	c := phy.NewCircle(pos, 0.25)
	c.Shape().IsSensor = true
	c.Shape().Layer = layer
	c.Shape().UserData = userData
	space.AddShape(c)
	return c
}

// stepWorld runs one game tick in the REAL system order for the two systems
// that matter here: MobSystem (priority 20, TTL countdown + death sweep) before
// SkillSystem (priority -65, cooldown fire). Reports whether the projectile
// survived the tick. This ordering is what makes the timed variant's single
// fire opportunity a fact rather than a hope (D5).
func stepWorld(m *mob.Mob, sk *SkillSystem) bool {
	if !m.Update(0) {
		return false
	}
	sk.Update(33.0)
	return true
}

func TestProjectile_PreArmEntryDoesNothing(t *testing.T) {
	victim := &touchRecorder{}
	space, _ := spaceWithBodyAt(phy.Vec2f{X: 3, Y: 0}, int(model.LayerActionCollision), victim)
	caster, g, sk := throwTestSetup(space, throwMineTestDef())
	m := throwOnce(t, caster, g, sk)

	for tick := 1; tick < 45; tick++ {
		require.True(t, stepWorld(m, sk), "tick %d: the mine is still waiting", tick)
	}

	assert.Empty(t, victim.touches, "standing on an unarmed mine is safe")
}

func TestProjectile_ArmedEntryFiresAndDespawns(t *testing.T) {
	victim := &touchRecorder{}
	space, _ := spaceWithBodyAt(phy.Vec2f{X: 3, Y: 0}, int(model.LayerActionCollision), victim)
	caster, g, sk := throwTestSetup(space, throwMineTestDef())
	m := throwOnce(t, caster, g, sk)

	for tick := 1; tick <= 45; tick++ {
		require.True(t, stepWorld(m, sk), "tick %d: alive until the burst lands", tick)
	}

	require.Len(t, victim.touches, 1, "armed + a body in the radius = detonation")
	assert.InDelta(t, 18.0, victim.touches[0], 1e-3)
	// PO ruling 2026-08-19: the mine is consumed by its own bang. TTL 900 would
	// otherwise leave a spent bomb standing for 30 s.
	assert.False(t, m.Update(0), "the spent mine dies on the next MobSystem pass")
}

// With despawn-on-fire the mine is a single-use placement: it cannot re-arm and
// bang a second time even though its burst authors an ordinary 300-tick
// cooldown.
func TestProjectile_MineFiresExactlyOnce(t *testing.T) {
	victim := &touchRecorder{}
	space, _ := spaceWithBodyAt(phy.Vec2f{X: 3, Y: 0}, int(model.LayerActionCollision), victim)
	caster, g, sk := throwTestSetup(space, throwMineTestDef())
	m := throwOnce(t, caster, g, sk)

	for tick := 1; tick <= 400 && stepWorld(m, sk); tick++ {
	}

	assert.Len(t, victim.touches, 1, "one mine, one bang")
}

// The mine's OTHER half of D5: nobody ever comes, so it fizzles silently at TTL
// with its burst still held ready.
func TestProjectile_MineFizzlesAtTTLWhenNobodyComes(t *testing.T) {
	caster, g, sk := throwTestSetup(phy.NewSpace(), throwMineTestDef())
	m := throwOnce(t, caster, g, sk)

	alive := 0
	for tick := 1; tick <= 1000 && stepWorld(m, sk); tick++ {
		alive = tick
	}

	assert.Equal(t, 899, alive, "the mine stands its full authored TTL, then goes quietly")
}

// ⭐ THE D5 ORDERING PIN. The timed bomb authors ttlTicks = armTicks + 1, and
// that arithmetic only yields exactly one fire opportunity because MobSystem
// (20) runs BEFORE SkillSystem (-65) inside a tick: the burst comes ready at the
// skill pass of tick 45, and the TTL removes the bomb at the mob pass of tick
// 46, which is earlier in that tick than the skill pass would have been.
func TestProjectile_TimedFiresAtItsOneOpportunity(t *testing.T) {
	victim := &touchRecorder{}
	space, _ := spaceWithBodyAt(phy.Vec2f{X: 3, Y: 0}, int(model.LayerActionCollision), victim)
	caster, g, sk := throwTestSetup(space, throwBombTestDef())
	m := throwOnce(t, caster, g, sk)

	firedAt := 0
	for tick := 1; tick <= 200 && stepWorld(m, sk); tick++ {
		if firedAt == 0 && len(victim.touches) > 0 {
			firedAt = tick
		}
	}

	assert.Equal(t, 45, firedAt, "the timed bang lands on the arming tick, not one earlier or later")
	assert.Len(t, victim.touches, 1)
}

func TestProjectile_TimedDespawnsWithoutFiringWhenEmpty(t *testing.T) {
	caster, g, sk := throwTestSetup(phy.NewSpace(), throwBombTestDef())
	m := throwOnce(t, caster, g, sk)

	alive := 0
	for tick := 1; tick <= 200 && stepWorld(m, sk); tick++ {
		alive = tick
	}

	assert.Equal(t, 45, alive, "TTL = armTicks + 1: the mob pass of tick 46 removes it")
	burst := m.SkillComponent().CooldownSlots[0]
	assert.Equal(t, 0, m.SkillComponent().CooldownRemaining(burst.Def.ID),
		"an empty bang never consumed its cooldown - the accepted invisible fizzle (D5)")
}

// --- owner-side safety (step 5, review finding) ---

// alignedTouchRecorder (skills_behavior_test.go) stands in for a body on the
// PLAYER's side here: an ally, another summon, a second bomb.
//
// ⭐ The bomb must hurt mobs and never its own side. bomb-burst copies
// NovaBurst VERBATIM, and NovaBurst authors no targetFactions at all - it gates
// by targetsEnemies/targetsAllies - so the omni-trio's "targetFactions is
// stamped on every effect" trap does not bite here. Pinned rather than argued:
// the burst is fired by a structure enlisted under a PLAYER, which is a caster
// side NovaBurst was never authored for.
func TestProjectile_BurstSparesTheOwnersSide(t *testing.T) {
	enemy := &touchRecorder{}
	ally := &alignedTouchRecorder{}

	space := phy.NewSpace()
	addBodyAt(space, phy.Vec2f{X: 3, Y: 0}, int(model.LayerActionCollision), enemy)
	addBodyAt(space, phy.Vec2f{X: 3.2, Y: 0}, int(model.LayerPlayerCollision), ally)
	space.Update()

	caster, g, sk := throwTestSetup(space, throwMineTestDef())
	// The thrower standing right on their own mine, the §10 item 3 walk-through.
	casterBody := addBodyAt(space, phy.Vec2f{X: 3, Y: 0.1}, int(model.LayerPlayerCollision), caster)
	space.Update()
	require.NotNil(t, casterBody)

	m := throwOnce(t, caster, g, sk)
	for tick := 1; tick <= 45; tick++ {
		if !stepWorld(m, sk) {
			break
		}
	}

	require.Len(t, enemy.touches, 1, "the hostile body eats the burst")
	assert.Empty(t, ally.touches, "no friendly fire: same faction + targetsAllies false")
}

// ⚑ ACCEPTED PROTOTYPE COARSENESS, pinned so it is a known shape rather than a
// surprise: fireCooldown counts a non-empty query set as a HIT before
// eligibility runs (its own comment says so), and the query only excludes the
// caster's own shapes. So ANY combatant-layer body in the burst radius trips an
// armed mine - including the owner and their own structures, which sit on the
// player layer by the 160-layer trick. The bang is harmless to them, but it
// consumes the mine. Fixing it would mean a projectile-specific trigger, which
// is exactly the new detonation machinery D4 and the despawn ruling forbid.
func TestProjectile_AnyBodyInRangeTripsTheArmedMine(t *testing.T) {
	ally := &alignedTouchRecorder{}
	space, _ := spaceWithBodyAt(phy.Vec2f{X: 3, Y: 0}, int(model.LayerPlayerCollision), ally)

	caster, g, sk := throwTestSetup(space, throwMineTestDef())
	m := throwOnce(t, caster, g, sk)

	for tick := 1; tick <= 45; tick++ {
		if !stepWorld(m, sk) {
			break
		}
	}

	assert.Empty(t, ally.touches, "nothing landed on the friendly body")
	assert.False(t, m.Update(0), "but the mine is spent all the same")
}
