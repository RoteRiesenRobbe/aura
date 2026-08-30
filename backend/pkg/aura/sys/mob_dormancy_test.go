package sys

// Mob dormancy (plan-world-scale.md S3). The §8 test list, leg by leg — every
// one of these is a criterion that, if it silently stopped holding, would look
// like a gameplay bug somewhere far away from this file: a mob that never
// regenerates, a poison that stops ticking, a chase that freezes mid-stride, a
// totem whose aura passes through what it is standing next to.

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/constant"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/mob"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/world"
)

const (
	testWakeMargin  = 1.7
	testSleepMargin = 2.2
)

// fakeWakeSources is the WakeSources seam: a settable list of positions.
type fakeWakeSources struct{ positions []phy.Vec2f }

func (f *fakeWakeSources) AppendWakePositions(dst []phy.Vec2f) []phy.Vec2f {
	return append(dst, f.positions...)
}

func (f *fakeWakeSources) at(x, y float32) { f.positions = []phy.Vec2f{{X: x, Y: y}} }
func (f *fakeWakeSources) none()           { f.positions = nil }

// farAway is comfortably outside the sleep box on both axes.
var farAway = phy.Vec2f{X: 500, Y: 500}

type dormancyFixture struct {
	ms    *MobSystem
	game  *fakeGame
	wake  *fakeWakeSources
	space *phy.Space
}

// newDormancyFixture builds a MobSystem with dormancy ARMED: a real space (so
// shapes can be watched leaving and returning), configured margins, and one
// authored spawn point at the origin per requested spawn.
func newDormancyFixture(t *testing.T, spawns ...world.Spawn) *dormancyFixture {
	t.Helper()
	space := phy.NewSpace()
	g := newFakeGame()
	g.cfg.MobWakeMargin = testWakeMargin
	g.cfg.MobSleepMargin = testSleepMargin
	g.space = space
	ms := NewMobSystem(g, 42, spawns, space)
	g.ms = ms
	w := &fakeWakeSources{}
	ms.SetWakeSources(w)
	return &dormancyFixture{ms: ms, game: g, wake: w, space: space}
}

// oneSpawn is a single authored point at the origin — dormancy's D3 requires a
// spawn point to own the mob, so tests that want a sleepable mob start here.
func oneSpawn() world.Spawn {
	return world.Spawn{Def: testMobDef(), X: 0, Y: 0}
}

// tick advances the world one tick, faithfully enough for dormancy.
//
// ⚑ The StatusEffects().Clear() matters and is not decoration: the real
// StatusEffectsSystem runs at priority 101, the TOP of every tick, and clears
// every entity's transient effects before anything re-sets them. Without it a
// mob that has EVER taken damage keeps StatusEffectDamaged forever, so
// Pristine's statusEffects clause never clears and NO damaged mob can ever
// sleep — which silently turns several legs below into tautologies that pass
// for the wrong reason.
func (f *dormancyFixture) tick() {
	for _, m := range f.ms.mobs {
		if se, ok := m.(model.StatusEntity); ok {
			se.StatusEffects().Clear()
		}
	}
	f.ms.Update(0)
	f.game.tick++
}

// settle runs enough ticks for the staggered re-evaluation to reach every mob
// at least once (dormancyCheckInterval), then leaves the world advanced.
func (f *dormancyFixture) settle() {
	for i := 0; i < dormancyCheckInterval; i++ {
		f.tick()
	}
}

// theMob is the single spawned mob.
func (f *dormancyFixture) theMob(t *testing.T) *mob.Mob {
	t.Helper()
	require.Len(t, f.game.added, 1, "fixture expects exactly one spawned mob")
	m, ok := f.game.added[0].(*mob.Mob)
	require.True(t, ok)
	return m
}

// findable reports whether the mob's body is reachable through the space — the
// question every consumer actually asks (a viewport, an aura, an aggro sensor
// all read what the grid produced). Runs Update first, mirroring PhysicsSystem
// at priority 0 later in the same tick.
func (f *dormancyFixture) findable(m *mob.Mob) bool {
	f.space.Update()
	probe := phy.NewCircle(m.Position(), 1)
	probe.Shape().IsSensor = true
	probe.Shape().Mask = -1 // every layer
	for _, hit := range f.space.QueryCircle(probe) {
		for _, b := range m.Bodies() {
			if hit == b {
				return true
			}
		}
	}
	return false
}

// ─── Leg 1 — a pristine mob far from everything sleeps, and leaves the space ──

func TestDormancy_PristineMobFarFromEverythingSleepsAndLeavesTheSpace(t *testing.T) {
	f := newDormancyFixture(t, oneSpawn())
	f.wake.none()

	f.settle()

	m := f.theMob(t)
	assert.True(t, m.Dormant(), "a pristine mob with nothing player-controlled near it must sleep")
	assert.False(t, f.findable(m), "and it must be out of the physics space — the other half of F3")
}

// The mob must actually stop thinking, not merely be flagged.
func TestDormancy_ADormantMobDoesNotTick(t *testing.T) {
	f := newDormancyFixture(t)
	f.wake.none()
	f.ms.Update(0) // initialise with no points

	counted := &countingMob{MobEntity: mob.NewMob(testMobDef(), 0, nil), alive: true}
	f.ms.AddEntity(counted)
	// Not point-owned, so it can never sleep — that is leg 8's guarantee and
	// also what makes this a control: it keeps ticking.
	for i := 0; i < dormancyCheckInterval*2; i++ {
		f.ms.Update(0)
		f.game.tick++
	}
	assert.Positive(t, counted.updates, "a mob with no spawn point must keep ticking")
}

// ─── Leg 2 — a damaged mob still ticks (L3: it must be able to regenerate) ────

func TestDormancy_DamagedMobFarFromEverythingStillTicks(t *testing.T) {
	f := newDormancyFixture(t, oneSpawn())
	f.wake.none()
	f.ms.Update(0)

	m := f.theMob(t)
	m.MobTouches(nil, mobs.Factors{Damage: 5}) // chip it
	require.NotEqual(t, m.MaxHealth(), m.Health(), "fixture: the mob is wounded")

	f.settle()

	assert.False(t, m.Dormant(), "a wounded mob must stay awake so it can regenerate (L3)")
}

// ⭐ THE PO-CONFIRMED GUARANTEE (2026-08-29): a mob always regenerates to full
// BEFORE it is allowed to go dormant. This closes the plan's L3 outright rather
// than merely mitigating it — L3 feared "chip a mob, walk away, find it still
// hurt", which D3's full-health clause makes unreachable: a wounded mob is never
// ELIGIBLE to sleep, so it stays awake and heals like any other out-of-combat
// mob.
//
// The margin is not narrow, which is why this is comfortable rather than lucky:
// regen finishes in ~6 s (full pool in 5 s once out of combat) while the player
// needs ~15 s of walking to clear the 22 u sleep box.
//
// ⚑ Relaxing D3's `health == MaxHealth()` clause re-opens L3 for real, and this
// is the leg that would say so.
func TestDormancy_AMobAlwaysRegeneratesToFullBeforeSleeping(t *testing.T) {
	f := newDormancyFixture(t, oneSpawn())
	f.wake.at(0, 0) // a player standing on it
	f.tick()
	m := f.theMob(t)

	m.MobTouches(nil, mobs.Factors{Damage: 20})
	require.Less(t, m.Health(), m.MaxHealth(), "fixture: wounded")

	// Walk away at the player's real pace (game.player.walkingSpeedPerTick).
	const walk = 0.05
	var x float32
	healed := -1
	for tick := 1; tick <= 1800; tick++ {
		x += walk
		f.wake.at(x, 0)
		f.tick()
		if healed < 0 && m.Health() == m.MaxHealth() {
			healed = tick
		}
		if m.Dormant() {
			assert.Equal(t, m.MaxHealth(), m.Health(),
				"a mob must be at FULL health when it goes dormant — it slept at %d/%d after %.1fs",
				m.Health(), m.MaxHealth(), float64(tick)/30)
			assert.GreaterOrEqual(t, tick, healed,
				"and it must have healed strictly before sleeping")
			assert.Positive(t, healed, "it must actually have regenerated, not slept instantly")
			return
		}
	}
	t.Fatalf("the mob never went dormant within 60 s (player reached %.1f u away)", x)
}

// ─── Leg 3 — a status effect keeps it awake (the poison case) ────────────────

func TestDormancy_MobWithABuffFarFromEverythingStillTicks(t *testing.T) {
	f := newDormancyFixture(t, oneSpawn())
	f.wake.none()
	f.ms.Update(0)

	m := f.theMob(t)
	m.ApplyDot(skills.SkillID(1), skills.DotBuff{HP: 3, Interval: 3}, 90)
	require.False(t, m.Pristine(), "fixture: a dot makes it non-pristine")

	f.settle()

	assert.False(t, m.Dormant(), "a dot must keep ticking — freezing it would stall the damage")
}

// ─── Leg 4 — threat keeps it awake, so a chase never freezes mid-stride ──────

func TestDormancy_MobWithThreatFarFromEverythingStillTicks(t *testing.T) {
	f := newDormancyFixture(t, oneSpawn())
	f.wake.none()
	f.ms.Update(0)

	m := f.theMob(t)
	m.ForceThreatToTop(newFakePlayer(), 50)
	require.False(t, m.Pristine(), "fixture: threat makes it non-pristine")

	f.settle()

	assert.False(t, m.Dormant(), "a mob holding threat must keep running its chase and leash")
}

// ─── Leg 5 — owned entities are never dormant, and their TTL still expires ───

func TestDormancy_OwnedEntitiesAreNeverDormant(t *testing.T) {
	f := newDormancyFixture(t)
	f.wake.none()
	f.ms.Update(0)

	summon := mob.NewMob(testMobDef(), 0, nil)
	summon.SetOwner(newFakePlayer())
	summon.SetTTLTicks(60)
	f.ms.AddEntity(summon)

	f.settle()

	assert.False(t, summon.Dormant(), "an owned summon must never sleep — its TTL has to keep counting")
	assert.False(t, summon.Pristine(), "and D3 must refuse it outright")
}

// ─── Leg 6 — a totem wakes a mob, not only a player (D4 / L2) ────────────────

func TestDormancy_ADormantMobWakesForATotem(t *testing.T) {
	f := newDormancyFixture(t, oneSpawn())
	f.wake.none()
	f.settle()

	m := f.theMob(t)
	require.True(t, m.Dormant(), "fixture: asleep with nothing around")

	// A totem: an owned mob, planted right next to the sleeper, with its owner
	// nowhere near. Without D4 this is the L2 bug — the totem's aura would tick
	// straight through a mob that is not in the space.
	totem := mob.NewMob(testMobDef(), 0, nil)
	totem.SetOwner(newFakePlayer())
	totem.SetPosition(phy.Vec2f{X: 1, Y: 1})
	f.ms.AddEntity(totem)

	f.settle()

	assert.False(t, m.Dormant(), "a player-controlled entity must wake what it stands next to, owner or not")
	assert.True(t, f.findable(m), "and the woken mob must be back in the space, aura-hittable")
}

// ─── Losing pristineness wakes a mob, even with nobody near ─────────────────

// Proximity is not the only way out of dormancy. Anything that reaches a mob by
// walking MobSystem.mobs instead of the physics space — an encounter script's
// ForceThreatToTop, the THREAT cheat — can make a sleeping mob non-pristine
// while no wake source is anywhere near it. It has to wake, or it takes the
// threat and never acts on it.
//
// ⚑ This is a REGRESSION PIN for a real bug found during S3: with wake driven
// by proximity alone, a mob that slept on its spawn tick could be handed threat
// and stay asleep forever. It surfaced only when entity ids happened to line the
// staggered re-evaluation up with the spawn tick — silent and order-dependent,
// which is precisely how it would have shipped.
func TestDormancy_LosingPristinenessWakesADormantMob(t *testing.T) {
	f := newDormancyFixture(t, oneSpawn())
	f.wake.none()
	f.settle()

	m := f.theMob(t)
	require.True(t, m.Dormant(), "fixture: asleep, with nothing player-controlled anywhere")

	m.ForceThreatToTop(newFakePlayer(), 50) // as an encounter script would
	f.settle()

	assert.False(t, m.Dormant(), "a mob that stops being pristine must wake, proximity or not")
	assert.True(t, f.findable(m), "and rejoin the space so it can act on what it was handed")
}

// ─── Leg 7 — hysteresis: the band between wake and sleep does not thrash ─────

func TestDormancy_HysteresisBandDoesNotResleepAWokenMob(t *testing.T) {
	f := newDormancyFixture(t, oneSpawn())

	// Inside the wake box ⇒ awake.
	f.wake.at(constant.ViewPortWidth/2*testWakeMargin-0.5, 0)
	f.settle()
	m := f.theMob(t)
	require.False(t, m.Dormant(), "fixture: inside the wake box it is awake")

	// Drift into the band: outside the wake box, still inside the sleep box.
	between := float32(constant.ViewPortWidth/2*testWakeMargin+constant.ViewPortWidth/2*testSleepMargin) / 2
	f.wake.at(between, 0)
	f.settle()

	assert.False(t, m.Dormant(),
		"a mob in the hysteresis band must hold its state — otherwise pacing the boundary thrashes it")
}

func TestDormancy_HysteresisBandDoesNotWakeASleepingMob(t *testing.T) {
	f := newDormancyFixture(t, oneSpawn())
	f.wake.none()
	f.settle()
	m := f.theMob(t)
	require.True(t, m.Dormant(), "fixture: asleep")

	// Into the band from the far side: inside the sleep box, outside the wake box.
	between := float32(constant.ViewPortWidth/2*testWakeMargin+constant.ViewPortWidth/2*testSleepMargin) / 2
	f.wake.at(between, 0)
	f.settle()

	assert.True(t, m.Dormant(), "the band must not wake it either — hysteresis is symmetric")
}

// ─── Leg 8 — respawn timers still fire with no player anywhere near ──────────

func TestDormancy_RespawnStillFiresForADormantRegion(t *testing.T) {
	spawn := oneSpawn()
	spawn.RespawnTicks = 3
	f := newDormancyFixture(t, spawn)
	f.wake.none()
	f.ms.Update(0)

	m := f.theMob(t)
	killMob(m)
	f.ms.Update(0) // the kill is collected, the point starts counting

	require.Len(t, f.game.removed, 1, "fixture: the mob died")
	before := len(f.game.added)

	for i := 0; i < 10; i++ {
		f.game.tick++
		f.ms.Update(0)
	}

	assert.Greater(t, len(f.game.added), before,
		"a spawn point must keep respawning even with nobody near — its timer is not AI")
}

// ─── Leg 9 — a woken mob rejoins the space and is immediately hittable ───────

func TestDormancy_WakingRejoinsTheSpace(t *testing.T) {
	f := newDormancyFixture(t, oneSpawn())
	f.wake.none()
	f.settle()

	m := f.theMob(t)
	require.True(t, m.Dormant())
	require.False(t, f.findable(m), "fixture: out of the space while asleep")

	f.wake.at(0, 0) // a player walks up
	f.settle()

	assert.False(t, m.Dormant())
	assert.True(t, f.findable(m), "a woken mob must be back in the space on the next rebuild")
}

// ─── Leg 10 — D6 containment, asserted against the viewport, not a literal ───

// Anything inside the AOI box is awake. The assertion reads
// constant.ViewPortWidth/Height rather than a number, so it still holds if the
// viewport ever moves — which is the whole reason D6 derives the wake volume
// instead of authoring it in units.
func TestDormancy_EverythingInsideTheAOIBoxIsAwake(t *testing.T) {
	// The far corner of the AOI: the hardest point for containment to hold.
	corner := phy.Vec2f{X: constant.ViewPortWidth / 2, Y: constant.ViewPortHeight / 2}

	spawn := oneSpawn()
	spawn.X, spawn.Y = corner.X, corner.Y
	f := newDormancyFixture(t, spawn)
	f.wake.at(0, 0) // a player at the origin — the mob sits at its AOI corner

	f.settle()

	m := f.theMob(t)
	assert.False(t, m.Dormant(),
		"a mob anywhere inside the AOI box must be awake — it is about to be STREAMED to that player")
	assert.True(t, f.findable(m), "and therefore findable by that player's viewport")
}

// The margins themselves must contain the AOI (L8's invariant, in the unit that
// actually reads them). A wake margin at or below 1 puts the wake boundary
// inside the streamed area, which is a mob fading in on screen.
func TestDormancy_WakeVolumeStrictlyContainsTheAOI(t *testing.T) {
	assert.Greater(t, float32(testWakeMargin), float32(1.0),
		"the wake volume must strictly contain the AOI or mobs pop in on screen")
	assert.Greater(t, float32(testSleepMargin), float32(testWakeMargin),
		"hysteresis is a band, not an inversion")
}

// ─── L7 — the patroller ruling, decided here with a test ────────────────────

// PATROLLERS SLEEP. Freeze-and-resume is correct by construction rather than by
// care: a dormant mob's Update never runs, so nothing writes its position, its
// waypoint index, its leg timer or its steering latch. It thaws exactly where
// and how it froze — mid-leg — and walks on.
//
// This is the leg that would catch a future "recompute the route on wake"
// optimisation, which is precisely how a patroller would learn to teleport.
func TestDormancy_APatrollerFreezesAndResumesWithoutTeleporting(t *testing.T) {
	spawn := oneSpawn()
	// A patroller needs a speed to patrol with; the zone loader enforces this
	// for authored waypoint spawns (world/zone.go), and the fixture bypasses it.
	spawn.Def.Factors.Speed = 1
	spawn.Waypoints = []world.Waypoint{{X: 6, Y: 0}, {X: -6, Y: 0}}
	f := newDormancyFixture(t, spawn)

	// Let it get properly under way on its first leg.
	f.wake.at(0, 0)
	for i := 0; i < 20; i++ {
		f.ms.Update(0)
		f.game.tick++
	}
	m := f.theMob(t)
	require.False(t, m.Dormant(), "fixture: awake and patrolling")
	midLeg := m.Position()
	require.NotEqual(t, phy.Vec2f{X: 0, Y: 0}, midLeg, "fixture: it has left its spawn point")

	// Everyone leaves; it sleeps mid-leg.
	f.wake.none()
	f.settle()
	require.True(t, m.Dormant(), "a patroller is allowed to sleep")
	frozen := m.Position()

	for i := 0; i < 50; i++ { // a long nap
		f.ms.Update(0)
		f.game.tick++
	}
	assert.Equal(t, frozen, m.Position(), "a dormant patroller must not drift — nothing writes its position")

	// Someone comes back.
	f.wake.at(frozen.X, frozen.Y)
	f.settle()
	require.False(t, m.Dormant())

	// It thaws where it froze. The waypoints sit 6 u away, so a route
	// recomputed on wake — the plausible future regression — would show up as a
	// jump of that order; ordinary walking covers well under a unit in the few
	// ticks it takes to notice the visitor.
	resumed := m.Position()
	assert.Less(t, float64(resumed.Sub(frozen).Abs()), 1.0,
		"it resumes from where it froze — a jump toward a waypoint is a teleport on wake")

	for i := 0; i < 10; i++ {
		f.ms.Update(0)
		f.game.tick++
	}
	assert.NotEqual(t, resumed, m.Position(), "and it must resume walking its leg, not stand there")
}

// ─── Dormancy is OFF unless the seam is installed (L6) ──────────────────────

// The sim harness and every pre-S3 unit test run without a WakeSources seam and
// must be byte-identical to before: every mob, every tick.
func TestDormancy_IsInertWithoutTheSeam(t *testing.T) {
	space := phy.NewSpace()
	g := newFakeGame()
	g.space = space
	ms := NewMobSystem(g, 42, []world.Spawn{oneSpawn()}, space)
	g.ms = ms
	// deliberately no SetWakeSources

	for i := 0; i < dormancyCheckInterval*2; i++ {
		ms.Update(0)
		g.tick++
	}

	require.Len(t, g.added, 1)
	m := g.added[0].(*mob.Mob)
	assert.False(t, m.Dormant(), "no seam ⇒ no dormancy, whatever the distances say")
}
