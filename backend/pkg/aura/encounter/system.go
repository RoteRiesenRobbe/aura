// Package encounter is the encounter-controller spine (mob-depth chunk 9):
// an ECS system owning per-encounter state objects behind an interface — one
// Go struct per encounter (roadmap lean F3, no scripting DSL). Encounters
// react to lifecycle hooks; everything they act through (spawning, immunity,
// scripted flee, threat) are exported seams on the System and on Mob.
package encounter

import (
	"fmt"
	"log"

	"github.com/EngoEngine/ecs"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/mob"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
)

// Encounter is one scripted encounter behind lifecycle hooks. v1 hooks are
// OnTick + OnMobDeath only — proximity/dwell triggers (9f) slid to the
// content pass; an encounter that needs proximity queries it in OnTick.
type Encounter interface {
	Name() string
	// OnTick fires once per game tick, after this tick's deaths were
	// dispatched, so the hook always sees post-death state.
	OnTick(s *System)
	// OnMobDeath fires exactly once per dead mob (any mob, not only
	// encounter-spawned ones); encounters filter by the IDs they track.
	OnMobDeath(s *System, mobID uint64)
}

// Registrar is what aurad type-asserts the game against to register
// encounters post-construction — encounters cannot ride cfg.GameConfig
// (model → cfg import direction; the interface above mentions model types).
type Registrar interface {
	RegisterEncounter(e Encounter)
}

// System dispatches lifecycle hooks and carries the capability surface
// encounters act through (the System itself is the hook parameter — no
// separate context struct until an encounter needs a narrower one).
type System struct {
	game       model.Game
	space      *phy.Space
	encounters []Encounter
	tracked    map[uint64]model.MobEntity // every live mob, via addMobEntity routing
	deaths     []uint64                   // queued in Remove, drained in Update
	announcer  Announcer                  // nil until wired (tests); Announce no-ops
}

// Announcer is the server-wide system-message surface (chat.ChatSystem) —
// narrow so encounters don't depend on the chat package.
type Announcer interface {
	Broadcast(text string)
}

func NewSystem(g model.Game, space *phy.Space) *System {
	return &System{
		game:    g,
		space:   space,
		tracked: make(map[uint64]model.MobEntity),
	}
}

// SetAnnouncer wires the broadcast surface post-construction (the
// SetConnState precedent — chat is built later in core/game.go).
func (s *System) SetAnnouncer(a Announcer) {
	s.announcer = a
}

// Announce broadcasts a system message to every connected player; a no-op
// while unwired so encounter tests need no chat fake.
func (s *System) Announce(text string) {
	if s.announcer == nil {
		return
	}
	s.announcer.Broadcast(text)
}

// Priority 15 — directly after the MobSystem (20): deaths it detects this
// tick are dispatched the same tick, and hook-driven spawns are serialized
// by the NetSystem (-100) without an extra tick of lag.
func (s *System) Priority() int {
	return 15
}

func (s *System) New(w *ecs.World) {
	log.Println("EncounterSystem nominal")
}

func (s *System) Register(e Encounter) {
	s.encounters = append(s.encounters, e)
}

func (s *System) AddEntity(m model.MobEntity) {
	s.tracked[m.Basic().ID()] = m
}

// Remove receives every entity removal (World.RemoveEntity fans out to all
// systems). Mobs are only ever removed on death — incl. TTL expiry — so a
// tracked ID here IS a mob death; anything untracked (players, placeables)
// is ignored. Dispatch is deferred to Update: Remove fires mid-iteration
// inside MobSystem.Update, and draining in Update gives encounters one
// well-defined execution point per tick.
func (s *System) Remove(b ecs.BasicEntity) {
	id := b.ID()
	if _, ok := s.tracked[id]; !ok {
		return
	}
	delete(s.tracked, id)
	s.deaths = append(s.deaths, id)
}

func (s *System) Update(dt float32) {
	deaths := s.deaths
	s.deaths = nil
	for _, id := range deaths {
		for _, e := range s.encounters {
			e.OnMobDeath(s, id)
		}
	}
	for _, e := range s.encounters {
		e.OnTick(s)
	}
}

// Ticks is the game clock, for encounter-owned timers.
func (s *System) Ticks() uint64 {
	return s.game.Ticks()
}

// Despawn removes a live encounter mob from the world (C6 empty-arena beat).
// Removal routes through the normal entity teardown, so the encounter's own
// OnMobDeath sees the id next Update — clear your reference BEFORE calling.
func (s *System) Despawn(m *mob.Mob) {
	s.game.RemoveEntity(m.Basic())
}

// SpawnMob spawns a mob of the named definition at pos — the scripted-spawn
// primitive (9c), mirroring sys.spawnSummon minus the summon-only parts (no
// owner, no TTL, no faction flip). The spawned mob has no spawn point, so it
// dies permanently (pinned by TestSpawnPoint_NoSpawnPointNoRespawn); it
// routes back through game.AddEntity, so the System auto-tracks it for death
// dispatch. The returned *mob.Mob is the encounter's handle for the scripted
// seams (SetInvulnerable, SetFleeOverride, HealthRatio, threat).
func (s *System) SpawnMob(defName string, pos phy.Vec2f) (*mob.Mob, error) {
	def, err := s.game.Mobs().GetByName(defName)
	if err != nil {
		return nil, fmt.Errorf("encounter spawn: %w", err)
	}
	m := mob.NewMob(def, s.game.Config().MobChaseIntoAuraMargin, s.space)
	// Exactly one SetPosition: spawnPosition + aggro sensor latch on the
	// first call (gotcha #5) — never "correct" it afterwards.
	m.SetPosition(pos)
	s.game.AddEntity(m)
	return m, nil
}
