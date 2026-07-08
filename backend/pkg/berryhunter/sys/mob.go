package sys

import (
	"log"
	"math/rand"

	"github.com/EngoEngine/ecs"

	"github.com/trichner/berryhunter/pkg/berryhunter/items/mobs"
	"github.com/trichner/berryhunter/pkg/berryhunter/model"
	"github.com/trichner/berryhunter/pkg/berryhunter/model/mob"
	"github.com/trichner/berryhunter/pkg/berryhunter/model/vitals"
	"github.com/trichner/berryhunter/pkg/berryhunter/phy"
	"github.com/trichner/berryhunter/pkg/berryhunter/world"
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

	liveMobID uint64 // 0 = none live (respawn pending)
	respawnAt uint64 // tick to respawn at; only meaningful while liveMobID == 0
}

type MobSystem struct {
	mobs   []model.MobEntity
	game   model.Game
	rnd    *rand.Rand
	points []spawnPoint

	initialized bool
}

func NewMobSystem(g model.Game, seed int64, spawns []world.Spawn) *MobSystem {
	rnd := rand.New(rand.NewSource(seed))
	points := make([]spawnPoint, 0, len(spawns))
	for _, s := range spawns {
		points = append(points, spawnPoint{
			def:          s.Def,
			pos:          phy.Vec2f{s.X, s.Y},
			angle:        s.Angle,
			respawnTicks: s.RespawnTicks,
			variancePct:  s.RespawnVariancePct,
		})
	}
	return &MobSystem{game: g, rnd: rnd, points: points}
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

	for _, mob := range n.mobs {
		alive := mob.Update(dt)
		if !alive {
			n.onMobDeath(mob)
			n.game.RemoveEntity(mob.Basic())
		}
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

// spawnAt builds a fresh mob for the point at its authored position/angle and
// registers it with the game. Each NewMob seeds its own entity-ID RNG, so HP
// variance rolls per spawn (item 11 Phase 3).
func (n *MobSystem) spawnAt(p *spawnPoint) {
	m := mob.NewMob(p.def, false, n.game.Radius(), n.game.Config().MobChaseIntoAuraMargin)
	m.SetPosition(p.pos)
	m.SetAngle(p.angle)
	p.liveMobID = m.Basic().ID()
	n.game.AddEntity(m)
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
}
