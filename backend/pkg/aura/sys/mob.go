package sys

import (
	"log"
	"math"
	"math/rand"

	"github.com/EngoEngine/ecs"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
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

	liveMobID uint64 // 0 = none live (respawn pending)
	respawnAt uint64 // tick to respawn at; only meaningful while liveMobID == 0
}

type MobSystem struct {
	mobs   []model.MobEntity
	game   model.Game
	rnd    *rand.Rand
	points []spawnPoint
	space  *phy.Space // handed to every spawned mob for obstacle steering (chunk 4)

	initialized bool
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
		})
	}
	return &MobSystem{game: g, rnd: rnd, points: points, space: space}
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
			n.spawnAt(&n.points[i])
		}
		n.initialized = true
	}

	// Update every mob, collecting the dead. Removal is deferred until after the
	// loop: game.RemoveEntity → MobSystem.Remove shifts n.mobs' backing array
	// synchronously, so removing inside `range n.mobs` would skip the survivor
	// that slides into the freed slot and double-update the next one (backlog §27.1).
	var dead []model.MobEntity
	for _, mob := range n.mobs {
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
		p := &n.points[i]
		if p.liveMobID == 0 && tick >= p.respawnAt {
			n.spawnAt(p)
		}
	}
}

// onMobDeath links a dead mob back to its spawn point (if any) and schedules
// its respawn at the same spot after respawnTicks ± variance.
func (n *MobSystem) onMobDeath(m model.MobEntity) {
	id := m.Basic().ID()
	for i := range n.points {
		p := &n.points[i]
		if p.liveMobID == id {
			p.liveMobID = 0
			p.respawnAt = n.game.Ticks() + uint64(n.rollDelay(p))
			return
		}
	}
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
func (n *MobSystem) spawnAt(p *spawnPoint) {
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
	m.SetPosition(pos)
	m.SetAngle(p.angle)
	p.liveMobID = m.Basic().ID()
	n.game.AddEntity(m)
}

// randomInDisc rolls a uniform offset within a disc of the given radius.
func randomInDisc(rnd *rand.Rand, radius float32) phy.Vec2f {
	r := radius * float32(math.Sqrt(rnd.Float64()))
	theta := rnd.Float64() * 2 * math.Pi
	return phy.Vec2f{X: r * float32(math.Cos(theta)), Y: r * float32(math.Sin(theta))}
}

func (n *MobSystem) Remove(b ecs.BasicEntity) {
	var delete int = -1
	for index, entity := range n.mobs {
		if entity.Basic().ID() == b.ID() {
			delete = index
			break
		}
	}
	if delete >= 0 {
		n.mobs = append(n.mobs[:delete], n.mobs[delete+1:]...)
	}
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
