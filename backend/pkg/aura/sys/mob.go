package sys

import (
	"log"
	"math"
	"math/rand"

	"github.com/EngoEngine/ecs"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/constant"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/mob"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/vitals"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/world"
)

// spawnPoint is the per-authored-spawn state (world foundation chunk 4). Each
// point owns at most one live mob; when that mob dies the point counts down to
// respawning a fresh one at the same spot.
type spawnPoint struct {
	def          *mobs.MobDefinition
	pos          phy.Vec2f
	angle        float32
	respawnTicks int
	variancePct  float32

	// Idle-movement archetype (mob-depth chunk 5): wanderRadius > 0 = local
	// wander (spawn position rolled within the radius, anchor stays the
	// authored pos) — already resolved against the mob type's default;
	// waypoints non-empty = route patrol (patrolLoop wraps last→first,
	// otherwise ping-pong). Mutually exclusive, enforced by the zone loader.
	// idleSpeedFactor is the per-spawn pace override (nil = type default).
	wanderRadius    float32
	waypoints       []phy.Vec2f
	patrolLoop      bool
	idleSpeedFactor *float32

	// level is the authored per-spawn level override (plan-mob-levels.md C1;
	// nil = inherit the species curveLevel). It is carried on the POINT, not
	// just applied to the first mob, so a respawn reproduces it instead of
	// silently falling back to the species value on first death (L5).
	level *int

	liveMobID uint64 // 0 = none live (respawn pending)
	respawnAt uint64 // tick to respawn at; only meaningful while liveMobID == 0
}

type MobSystem struct {
	mobs   []model.MobEntity
	game   model.Game
	rnd    *rand.Rand
	points []spawnPoint
	space  *phy.Space // handed to every spawned mob for obstacle steering (chunk 4)

	// pointByMob indexes n.points by the id of the mob currently living at it —
	// a CACHE of spawnPoint.liveMobID, not a second source of truth. It exists
	// because both of its readers were linear scans over every authored spawn:
	// onMobDeath ran one per death (14 640 iterations at the 30× world), and
	// dormancy needs the same answer per candidate mob per evaluation, which no
	// scan can afford. Written only where liveMobID is.
	pointByMob map[uint64]int

	// Dormancy (plan-world-scale.md S3). wakeSources is the seam that yields
	// every player-controlled position; NIL DISABLES DORMANCY ENTIRELY, which
	// is what keeps the sim harness and every unit test on the old code path
	// (L6 — the sim battery must come out byte-identical).
	wakeSources WakeSources
	// wakePositions is the per-tick scratch the seam appends into, reused so the
	// collection allocates nothing (the idle loop is allocation-audited,
	// fe0044d0).
	wakePositions []phy.Vec2f

	initialized bool
}

// WakeSources yields the position of everything a dormant mob must wake for
// (plan-world-scale.md D4): the players and spectators in the world.
//
// ⚑ SPECTATORS ARE NOT OPTIONAL, and the plan did not record this. A spectator
// — the pre-join start screen, and every dead player's death overlay — streams
// the world through Viewport().Collisions() exactly like a player does
// (core/net.go). A dormant mob is out of the space and therefore in no
// viewport, so leaving spectators out of this set renders the start screen as
// an empty world. The pre-join spectator sits at the origin, where world.json
// authors ~24 props, which is precisely where it would have been noticed.
//
// The other half of D4 — totems, summons, companions and charmed mobs — is NOT
// here: those are mobs, so MobSystem already holds them and collects them
// itself (see collectWakePositions).
//
// Implemented by sys.ConnectionStateSystem, wired post-construction in
// core.NewGameWith (the SetConnState / SetAnchors precedent).
type WakeSources interface {
	// AppendWakePositions appends to dst and returns it, so the caller can
	// reuse one scratch slice forever.
	AppendWakePositions(dst []phy.Vec2f) []phy.Vec2f
}

// SetWakeSources installs the dormancy seam and turns dormancy ON. Leaving it
// unset is a supported, and deliberately common, state: the sim harness and the
// unit tests run every mob every tick, exactly as before S3.
func (n *MobSystem) SetWakeSources(w WakeSources) { n.wakeSources = w }

// dormancyCheckInterval staggers the sleep/wake re-evaluation across ticks:
// each mob is judged every N ticks, spread by entity id so the work is flat
// rather than spiking on one tick. [PLACEHOLDER 5]
//
// It is safe because of the hysteresis band, not by luck: wake and sleep sit
// 0.5 × AOI apart (5 × 3 u), and the wake box already clears the widest
// obtainable view by 8 u — 160 ticks of walking at 0.05 u/tick, or 38 ticks
// even in flight. Judging 5 ticks late spends 0.25 u of that budget.
//
// It matters because the evaluation is the one part of dormancy that stays
// O(mobs × sources): at the 30× world with 50 connected that is ~732 000 pairs
// a tick, and the stagger divides it by N.
const dormancyCheckInterval = 5

// dormantMob is dormancy as MobSystem sees it: the flag, the D3 predicate, and
// the D4 "am I myself a wake source" question. A capability rather than a
// MobEntity method, like charmBreaker and targetForgetter below — a mob
// implementation that does not offer it simply never sleeps.
type dormantMob interface {
	Dormant() bool
	SetDormant(bool)
	Pristine() bool
	PlayerControlled() bool
}

func NewMobSystem(g model.Game, seed int64, spawns []world.Spawn, space *phy.Space) *MobSystem {
	rnd := rand.New(rand.NewSource(seed))
	points := make([]spawnPoint, 0, len(spawns))
	for _, s := range spawns {
		var waypoints []phy.Vec2f
		for _, w := range s.Waypoints {
			waypoints = append(waypoints, phy.Vec2f{X: w.X, Y: w.Y})
		}
		points = append(points, spawnPoint{
			def:             s.Def,
			pos:             phy.Vec2f{X: s.X, Y: s.Y},
			angle:           s.Angle,
			respawnTicks:    s.RespawnTicks,
			variancePct:     s.RespawnVariancePct,
			wanderRadius:    s.EffectiveWanderRadius(),
			waypoints:       waypoints,
			patrolLoop:      s.PatrolMode == "loop",
			idleSpeedFactor: s.IdleSpeedFactor,
			level:           s.Level,
		})
	}
	return &MobSystem{
		game:       g,
		rnd:        rnd,
		points:     points,
		space:      space,
		pointByMob: make(map[uint64]int, len(points)),
	}
}

func (n *MobSystem) Priority() int {
	return 20
}

func (n *MobSystem) New(w *ecs.World) {
	log.Println("MobSystem nominal")
}

func (n *MobSystem) AddEntity(e model.MobEntity) {
	n.mobs = append(n.mobs, e)
}

func (n *MobSystem) Update(dt float32) {
	// Initial population runs on the first tick, not in New(): AddEntity routes
	// to every registered system, and SkillSystem et al. are added after this
	// system in core.NewGameWith. By the first Update the world is fully wired.
	if !n.initialized {
		for i := range n.points {
			n.spawnAt(i)
		}
		n.initialized = true
	}

	// Dormancy (plan-world-scale.md S3): collect every player-controlled
	// position ONCE, then let each mob judge itself against it below. Inert
	// while no seam is installed.
	n.wakePositions = n.collectWakePositions(n.wakePositions[:0])

	// Update every mob, collecting the dead. Removal is deferred until after the
	// loop: game.RemoveEntity → MobSystem.Remove shifts n.mobs' backing array
	// synchronously, so removing inside `range n.mobs` would skip the survivor
	// that slides into the freed slot and double-update the next one (backlog §27.1).
	var dead []model.MobEntity
	for _, mob := range n.mobs {
		// A dormant mob is skipped ENTIRELY — no AI, and its shapes are already
		// out of the space, so Space.Update no longer walks them either. That is
		// both halves of F3.
		if n.dormantThisTick(mob) {
			continue
		}
		if !mob.Update(dt) {
			dead = append(dead, mob)
		}
	}
	for _, mob := range dead {
		n.onMobDeath(mob)
		n.game.RemoveEntity(mob.Basic())
	}

	// Respawn any point whose timer has elapsed. A mob with no owning point
	// (e.g. a future totem / owned entity) is never scheduled here, so it dies
	// and stays dead — the totem lifecycle guard falls out for free.
	tick := n.game.Ticks()
	for i := range n.points {
		if p := &n.points[i]; p.liveMobID == 0 && tick >= p.respawnAt {
			n.spawnAt(i)
		}
	}
}

// collectWakePositions gathers every player-controlled position for this tick
// (D4): the players and spectators from the seam, plus the owned and charmed
// mobs MobSystem already holds. Returns dst so the caller keeps one scratch.
//
// Returns nil when no seam is installed, which is how dormancy stays off for
// the sim harness and the unit tests.
func (n *MobSystem) collectWakePositions(dst []phy.Vec2f) []phy.Vec2f {
	if n.wakeSources == nil {
		return dst
	}
	dst = n.wakeSources.AppendWakePositions(dst)
	// The mob half of D4. A dormant mob can never be player-controlled (D3
	// refuses owned and charmed outright), so the flag check skips the whole
	// sleeping population for free.
	for _, m := range n.mobs {
		d, ok := m.(dormantMob)
		if !ok || d.Dormant() || !d.PlayerControlled() {
			continue
		}
		dst = append(dst, m.Position())
	}
	return dst
}

// nearWakeSource reports whether any wake source lies inside the AOI box scaled
// by margin (D6). The volume is DERIVED from the viewport rather than authored
// in units, which is what collapses L8's guardrail to two invariants that
// cannot drift — and what makes it move automatically if the viewport ever
// does. constant.ViewPortWidth/Height are already pinned to
// api/shared-constants.json (cmd/aurad/shared_constants_test.go), so the wake
// volume inherits that cross-language guarantee for free.
//
// A box, not a circle: the AOI already is one (phy.NewBox, player.go), a box of
// the same linear margin covers ~45 % less area than the enclosing circle, and
// the test is two compares with no sqrt on a per-mob-per-source path.
func (n *MobSystem) nearWakeSource(pos phy.Vec2f, margin float32) bool {
	hx := constant.ViewPortWidth / 2 * margin
	hy := constant.ViewPortHeight / 2 * margin
	for _, s := range n.wakePositions {
		dx := s.X - pos.X
		if dx < 0 {
			dx = -dx
		}
		if dx > hx {
			continue
		}
		dy := s.Y - pos.Y
		if dy < 0 {
			dy = -dy
		}
		if dy <= hy {
			return true
		}
	}
	return false
}

// dormantThisTick judges one mob's sleep state and reports whether its Update
// should be skipped. It owns the space surgery, so the flag and the shapes can
// never disagree.
//
// Hysteresis (D6): a sleeping mob wakes on the SMALLER wake box, an awake one
// sleeps only outside the LARGER sleep box. Between the two it keeps whatever
// state it has, so a player pacing a boundary cannot thrash it.
func (n *MobSystem) dormantThisTick(m model.MobEntity) bool {
	if n.wakeSources == nil {
		return false
	}
	d, ok := m.(dormantMob)
	if !ok {
		return false
	}
	asleep := d.Dormant()

	// Stagger the re-evaluation, spread by entity id. An unjudged mob simply
	// keeps its current state — safe by the hysteresis band, see the const.
	if (n.game.Ticks()+m.Basic().ID())%dormancyCheckInterval != 0 {
		return asleep
	}

	cfg := n.game.Config()
	if asleep {
		// Proximity is the ordinary wake, but NOT the only one: anything that
		// stopped this mob being pristine has to wake it too.
		//
		// ⚑ Without this a sleeping mob is unreachable by everything that finds
		// mobs by walking MobSystem.mobs rather than the physics space — an
		// encounter script's ForceThreatToTop, the THREAT cheat, any future
		// list-walking caller. It would take the threat, stay asleep, and never
		// act on it. Found by a test that only failed when an earlier test had
		// shifted entity ids enough to change which tick the stagger judged it
		// on, which is exactly how this would have reached production: rare,
		// ordering-dependent, and silent.
		if n.nearWakeSource(m.Position(), cfg.MobWakeMargin) || !d.Pristine() {
			n.setDormant(m, d, false)
			return false
		}
		return true
	}
	// Cheapest rejections first: the box scan is O(wake sources), the predicate
	// is a handful of field reads, and only a point-owned mob may sleep at all.
	if !n.pointOwned(m) || !d.Pristine() {
		return false
	}
	if n.nearWakeSource(m.Position(), cfg.MobSleepMargin) {
		return false
	}
	n.setDormant(m, d, true)
	return true
}

// pointOwned reports whether an authored spawn point owns this mob (D3). It is
// what keeps encounter adds, thrown projectiles and anything else the world
// does not itself respawn out of dormancy.
func (n *MobSystem) pointOwned(m model.MobEntity) bool {
	_, ok := n.pointByMob[m.Basic().ID()]
	return ok
}

// setDormant flips the flag and moves the mob's shapes in or out of the physics
// space (D5). Leaving the space is what lifts the SECOND half of F3: skipping
// mob.Update alone would leave Space.Update resetting, re-bounding and
// re-inserting all ~3 shapes of every sleeping mob, every tick, forever.
//
// ⚑ Sleep uses SleepShape, not RemoveShape — see the essay on SleepShape for
// why the purge sweep must not run here and why skipping it is safe.
//
// ⚑ A woken mob's shapes are back in s.shapes but not yet in the grid; the next
// Space.Update (priority 0, later this same tick) re-derives their bounding
// boxes and inserts them. The one-tick lag is invisible against the wake box's
// 8 u of margin.
func (n *MobSystem) setDormant(m model.MobEntity, d dormantMob, asleep bool) {
	d.SetDormant(asleep)
	if n.space == nil {
		return
	}
	for _, b := range m.Bodies() {
		if b == nil {
			continue
		}
		if asleep {
			n.space.SleepShape(b)
		} else {
			n.space.AddShape(b)
		}
	}
}

// onMobDeath links a dead mob back to its spawn point (if any) and schedules
// its respawn at the same spot after respawnTicks ± variance.
func (n *MobSystem) onMobDeath(m model.MobEntity) {
	id := m.Basic().ID()
	i, ok := n.pointByMob[id]
	if !ok {
		return
	}
	delete(n.pointByMob, id)
	p := &n.points[i]
	p.liveMobID = 0
	p.respawnAt = n.game.Ticks() + uint64(n.rollDelay(p))
}

// rollDelay is the respawn delay in ticks: respawnTicks rolled within the
// percentage band [ticks×(1−pct), ticks×(1+pct)] (item 11 convention; absent/0
// variance is exact).
func (n *MobSystem) rollDelay(p *spawnPoint) int {
	d := int(vitals.RollVariance(float32(p.respawnTicks), p.variancePct, n.rnd))
	if d < 0 {
		d = 0
	}
	return d
}

// spawnAt builds a fresh mob for the point and registers it with the game.
// Each NewMob seeds its own RNG from a per-process salt mixed with its entity
// ID, so HP variance rolls per spawn (item 11 Phase 3) and differs per server
// run (§27.2.2). A wander point rolls the (re)spawn position uniformly
// within its radius (chunk 5a); the wander anchor stays the AUTHORED point —
// anchoring on the roll would drift the territory (gotcha #7). Waypoint and
// stationary mobs spawn exactly at the authored spot.
func (n *MobSystem) spawnAt(idx int) {
	p := &n.points[idx]
	m := mob.NewMob(p.def, n.game.Config().MobChaseIntoAuraMargin, n.space)
	pos := p.pos
	if p.wanderRadius > 0 {
		pos = pos.Add(randomInDisc(n.rnd, p.wanderRadius))
		m.SetWander(p.pos, p.wanderRadius)
	}
	if len(p.waypoints) > 0 {
		m.SetWaypoints(p.waypoints, p.patrolLoop)
	}
	if p.idleSpeedFactor != nil {
		m.SetIdleSpeedFactor(*p.idleSpeedFactor)
	}
	if p.level != nil {
		// The two calls belong together (plan-mob-levels.md L1): NewMob already
		// filled the pool at the SPECIES level, so the override widens the max
		// without moving the health — an up-levelled mob would spawn wounded,
		// and out-of-combat regen would quietly close the gap, making it
		// reproduce only on a fresh pull. Same trap, same fix, as the summon
		// path's SetOwner + RestoreToFullHealth pair.
		m.SetSpawnLevel(*p.level)
		m.RestoreToFullHealth()
	}
	m.SetPosition(pos)
	m.SetAngle(p.angle)
	p.liveMobID = m.Basic().ID()
	// The two writes belong together: pointByMob is liveMobID's index, so a
	// spawn that set one without the other would make the mob un-respawnable
	// (onMobDeath) or ineligible for dormancy (pointOwned).
	n.pointByMob[p.liveMobID] = idx
	n.game.AddEntity(m)
}

// randomInDisc rolls a uniform offset within a disc of the given radius.
func randomInDisc(rnd *rand.Rand, radius float32) phy.Vec2f {
	r := radius * float32(math.Sqrt(rnd.Float64()))
	theta := rnd.Float64() * 2 * math.Pi
	return phy.Vec2f{X: r * float32(math.Cos(theta)), Y: r * float32(math.Sin(theta))}
}

func (n *MobSystem) Remove(b ecs.BasicEntity) {
	// `found` rather than `delete`: the old name shadowed the builtin for the
	// rest of the function, which the pointByMob cleanup below needs.
	found := -1
	for index, entity := range n.mobs {
		if entity.Basic().ID() == b.ID() {
			found = index
			break
		}
	}
	if found >= 0 {
		n.mobs = append(n.mobs[:found], n.mobs[found+1:]...)
	}
	// Keep the spawn-point index from outliving the mob. onMobDeath has
	// normally cleared it already (this is a no-op then); the case that matters
	// is a removal that never went through a death — doFuneral on disconnect —
	// which would otherwise leave a dead id owning a point forever.
	delete(n.pointByMob, b.ID())
	// ⚑ Runs for EVERY removal, mobs included. Skipping the mob branch looks
	// free — a dying mob is removed at 0 HP, which the per-tick HealthRatio
	// reset already catches — but a player's placed entities are mobs too, and
	// doFuneral removes them ALIVE on disconnect. That left the whole pack
	// latched on a vanished camp, permanently.
	n.ForgetDeparted(b.ID())
}

// ForgetDeparted severs every reference the mobs hold to the entity that just
// left the world (plan-faction-flips chunk 3, D10 / L-G for the charm half;
// the aggro half followed the same reasoning once the ghost-chase bug was
// traced). Death AND disconnect both end in game.RemoveEntity(player), whose
// fan-out reaches every system's Remove — which makes this the one hook
// covering both, and the only one available: a disconnected player's entity is
// gone but the mob's pointer stays valid and its HealthRatio stays above 0, so
// a per-tick poll would leave a pet following a ghost for the rest of a
// 60-second charm, and a chaser parked on the disconnect spot indefinitely.
//
// Exported since plan-flight-paths.md C2: a flight takeoff is the same event
// for the ground world — the flyer has left it — so the input system calls
// this directly (the FlightForget seam), without any entity removal.
//
// It is the second half of the guarantee, not the whole of it: severing the
// references a mob already holds only sticks because Space.RemoveShape now
// also purges the departed shape from the sensor sets, so nothing re-acquires
// it on the next tick. Either half alone leaves the mob latched.
func (n *MobSystem) ForgetDeparted(id uint64) {
	for _, m := range n.mobs {
		if c, ok := m.(charmBreaker); ok && c.CharmedBy(id) {
			c.EndCharm()
		}
		if f, ok := m.(targetForgetter); ok {
			f.ForgetEntity(id)
		}
	}
}

// targetForgetter is a departing entity as the mobs' combat state sees it: an
// id to match (the fan-out holds ecs ids, never entity refs) and the verb that
// drops every latch onto it. A capability rather than a MobEntity method, like
// charmBreaker below and every other narrow contract the systems assert.
type targetForgetter interface {
	ForgetEntity(id uint64)
}

// charmBreaker is the charm link as the removal fan-out sees it: an id to match
// (the fan-out holds ecs ids, never player refs) and the verb to end it. A
// capability rather than a MobEntity method, like every other narrow contract
// the systems assert.
type charmBreaker interface {
	CharmedBy(id uint64) bool
	EndCharm()
}
