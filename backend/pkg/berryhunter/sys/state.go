package sys

import (
	"log"
	"math"
	"math/rand"

	"github.com/EngoEngine/ecs"
	"github.com/google/flatbuffers/go"
	"github.com/google/uuid"
	"github.com/trichner/berryhunter/pkg/berryhunter/codec"
	"github.com/trichner/berryhunter/pkg/berryhunter/minions"
	"github.com/trichner/berryhunter/pkg/berryhunter/model"
	"github.com/trichner/berryhunter/pkg/berryhunter/model/constant"
	"github.com/trichner/berryhunter/pkg/berryhunter/model/corpse"
	"github.com/trichner/berryhunter/pkg/berryhunter/model/player"
	"github.com/trichner/berryhunter/pkg/berryhunter/model/spectator"
	"github.com/trichner/berryhunter/pkg/berryhunter/phy"
	"github.com/trichner/berryhunter/pkg/berryhunter/skills"
)

type stringSet map[string]struct{}

func (s stringSet) add(str string) {
	s[str] = struct{}{}
}

func (s stringSet) remove(str string) {
	delete(s, str)
}

func (s stringSet) contains(str string) bool {
	_, ok := s[str]
	return ok
}

// deadState is the one dead-marker (chunk 4): while a client's spectator waits
// on the death overlay, its name stays reserved, its corpse stands at the
// deathspot and its carried progression waits to be restored. The level is
// kept (only the current level's partial XP is lost); the whole skill
// component carries the spellbook, equipped loadout and active aura so no
// unlock — milestone or drop — is ever lost on death. Consumed by Respawn
// (name reused verbatim) or a fresh Join (name freed, progression still
// restored), cleaned up when the dead client disconnects — entries never
// outlive the death they record.
type deadState struct {
	name        string
	corpse      model.CorpseEntity
	progression model.PlayerProgression
	skills      *skills.SkillComponent
}

// CampfireDwellRadiusFactor scales a campfire's heal radius down to its bind
// radius: standing within heal range alone must NOT bind (healing without
// binding is deliberate). [PLACEHOLDER] Hand-synced with the client's inner
// dwell-ring factor (frontend Campfire game object). (chunk 4)
const CampfireDwellRadiusFactor = 0.5

// campfireDwellTicks is how long a player must stay inside a campfire's bind
// radius before it becomes their respawn anchor: 3 s. [PLACEHOLDER] (chunk 4)
const campfireDwellTicks = 3 * constant.TicksPerSecond

// CampfireAnchor is a placed world campfire as the respawn tracker sees it:
// position + pre-scaled bind radius. Built in cmd/berryhunterd right after
// the campfire mobs are placed and handed over via CampfireAnchorSink.
type CampfireAnchor struct {
	Pos         phy.Vec2f
	DwellRadius float32
}

// CampfireAnchorSink is implemented by the game so cmd/berryhunterd can hand
// the placed campfires to the ConnectionStateSystem (the encounter.Registrar
// pattern: Go-side wiring, no zone-schema coupling).
type CampfireAnchorSink interface {
	SetCampfireAnchors([]CampfireAnchor)
}

type ConnectionStateSystem struct {
	spectators   []model.Spectator
	players      []model.PlayerEntity
	game         model.Game
	names        stringSet
	deadByClient map[uuid.UUID]deadState
	campfires    []CampfireAnchor
	// anchors is the campfire a client last bound to (dwell completed); their
	// respawn point. Keyed by client so it survives death; dropped on
	// disconnect (client UUIDs are per-connection).
	anchors map[uuid.UUID]phy.Vec2f
	// dwell counts a player's consecutive ticks inside a campfire's bind
	// radius, keyed by player entity ID (reset on leave, dropped on removal).
	dwell map[uint64]int
}

// SetCampfireAnchors installs the placed campfires as respawn anchors.
func (s *ConnectionStateSystem) SetCampfireAnchors(campfires []CampfireAnchor) {
	s.campfires = campfires
}

func NewConnectionStateSystem(g model.Game) *ConnectionStateSystem {
	return &ConnectionStateSystem{
		game:         g,
		names:        stringSet{},
		deadByClient: map[uuid.UUID]deadState{},
		anchors:      map[uuid.UUID]phy.Vec2f{},
		dwell:        map[uint64]int{},
	}
}

func (*ConnectionStateSystem) Priority() int {
	return 10
}

func (s *ConnectionStateSystem) AddSpectator(spectator model.Spectator) {
	s.spectators = append(s.spectators, spectator)
}

func (s *ConnectionStateSystem) AddPlayer(player model.PlayerEntity) {
	s.players = append(s.players, player)
	s.names.add(player.Name())
}

// spawnAreaFactor keeps spawns off the border wall. Interim rule until zones
// author explicit player spawn points.
const spawnAreaFactor = 0.8

func randomSpawnPosition(width, height float32) phy.Vec2f {
	return phy.Vec2f{
		X: (rand.Float32() - 0.5) * spawnAreaFactor * width,
		Y: (rand.Float32() - 0.5) * spawnAreaFactor * height,
	}
}

func (s *ConnectionStateSystem) Update(dt float32) {
	// Both loops iterate SNAPSHOT copies: RemoveEntity fans out synchronously
	// into removeFromPlayers/removeFromSpectators, which shift the live slices
	// mid-loop — with two same-tick deaths the old live iteration processed
	// the second dying player twice (double obituary/spectator/corpse).
	spectators := append([]model.Spectator(nil), s.spectators...)
	for _, sp := range spectators {
		if s.tryRespawn(sp) {
			continue
		}
		s.tryJoin(sp)
	}

	players := append([]model.PlayerEntity(nil), s.players...)
	for _, p := range players {
		if p.VitalSigns().Health == 0 {
			s.handleDeath(p)
		}
	}

	s.trackCampfireDwell()
}

// tryRespawn upgrades a DEAD client's spectator back to a player (chunk 4):
// the reserved name is reused verbatim (no mangling — it is still ours),
// carried progression/skills are restored, the corpse is removed and the
// spawn point is the bound campfire anchor (random fallback). A Respawn from
// a client that never died is consumed and ignored.
func (s *ConnectionStateSystem) tryRespawn(sp model.Spectator) bool {
	if sp.Client().NextRespawn() == nil {
		return false
	}
	client := sp.Client()
	dead, ok := s.deadByClient[client.UUID()]
	if !ok {
		return false
	}
	// Consume the dead marker BEFORE removing the spectator: the removal
	// fan-out hits removeFromSpectators, whose disconnect-while-dead cleanup
	// must find nothing (it would free the name and corpse mid-respawn).
	delete(s.deadByClient, client.UUID())

	s.game.RemoveEntity(sp.Basic())
	s.game.RemoveEntity(dead.corpse.Basic())

	log.Printf("🏕️ '%s' respawned!", dead.name)
	sendAcceptMessage(client)

	p := player.New(s.game, client, dead.name)
	p.SetProgression(dead.progression)
	p.SetSkillComponent(dead.skills)
	p.SetPosition(s.respawnPosition(client.UUID()))
	s.game.AddEntity(p)
	return true
}

// tryJoin upgrades a spectator to a fresh player — the brand-new-client path.
// A DEAD client may also Join (name change instead of Respawn): its dead state
// is released first — corpse removed, old name freed — then the flow proceeds
// exactly like a first join, still restoring carried progression.
func (s *ConnectionStateSystem) tryJoin(sp model.Spectator) {
	j := sp.Client().NextJoin()
	if j == nil {
		return
	}
	client := sp.Client()
	dead, wasDead := s.deadByClient[client.UUID()]
	if wasDead {
		delete(s.deadByClient, client.UUID())
		s.names.remove(dead.name)
		s.game.RemoveEntity(dead.corpse.Basic())
	}

	s.game.RemoveEntity(sp.Basic())

	// upgrade to p
	name := j.PlayerName // resolve collisions!
	if len(name) > 20 {  // limit user input to 20 characters
		name = name[:20]
	}
	name = s.manglePlayerName(name)
	log.Printf("☺️ '%s' joined!", name)
	sendAcceptMessage(client)

	p := player.New(s.game, client, name)
	if wasDead {
		p.SetProgression(dead.progression)
		p.SetSkillComponent(dead.skills)
	}

	// spawn the player at a random location
	p.SetPosition(randomSpawnPosition(s.game.Bounds()))

	s.game.AddEntity(p)
}

// handleDeath downgrades a dead player to a spectator waiting on the death
// overlay: progression is stashed, a corpse marks the deathspot, and the name
// stays reserved until respawn or disconnect (chunk 4).
func (s *ConnectionStateSystem) handleDeath(p model.PlayerEntity) {
	log.Printf("💀 '%s' died.", p.Name())
	client := p.Client()
	sendObituaryMessage(client)
	deathspot := p.Position()
	p.LoseCurrentLevelExperience()
	name := p.Name()
	anchor, hasAnchor := s.anchors[client.UUID()]

	// The removal fan-out runs the full disconnect bookkeeping (funeral, name
	// freed, anchor dropped); death deliberately re-adds name + anchor after
	// it returns — this keeps removeFromPlayers a single unconditional path.
	s.game.RemoveEntity(p.Basic())
	s.names.add(name)
	if hasAnchor {
		s.anchors[client.UUID()] = anchor
	}

	c := corpse.New(deathspot)
	s.game.AddEntity(c)
	s.deadByClient[client.UUID()] = deadState{
		name:        name,
		corpse:      c,
		progression: p.Progression(),
		skills:      p.SkillComponent(),
	}

	// Drain stale lifecycle messages: a Join/Respawn banked while alive would
	// otherwise auto-revive the player on the next tick, bypassing the death
	// overlay.
	for client.NextJoin() != nil {
	}
	for client.NextRespawn() != nil {
	}

	// let the player be a new spectator at the spot of his demise
	deathView := spectator.NewSpectator(deathspot, client)
	s.game.AddEntity(deathView)
}

// respawnJitterRadius spreads campfire respawns in a small disc around the
// anchor so simultaneous respawns don't stack on one point. [PLACEHOLDER]
const respawnJitterRadius = 1.0

func (s *ConnectionStateSystem) respawnPosition(id uuid.UUID) phy.Vec2f {
	anchor, ok := s.anchors[id]
	if !ok {
		return randomSpawnPosition(s.game.Bounds())
	}
	angle := rand.Float64() * 2 * math.Pi
	r := rand.Float32() * respawnJitterRadius
	return phy.Vec2f{
		X: anchor.X + r*float32(math.Cos(angle)),
		Y: anchor.Y + r*float32(math.Sin(angle)),
	}
}

// trackCampfireDwell advances each player's bind progress: campfireDwellTicks
// consecutive ticks inside a fire's bind radius make that fire the client's
// respawn anchor. Full-health players bind too — this is a position check,
// deliberately NOT keyed on heal events.
func (s *ConnectionStateSystem) trackCampfireDwell() {
	if len(s.campfires) == 0 {
		return
	}
	for _, p := range s.players {
		pos := p.Position()
		var near *CampfireAnchor
		for i := range s.campfires {
			c := &s.campfires[i]
			if pos.DistanceToSquared(c.Pos) <= c.DwellRadius*c.DwellRadius {
				near = c
				break
			}
		}
		id := p.Basic().ID()
		if near == nil {
			delete(s.dwell, id)
			continue
		}
		s.dwell[id]++
		// Exactly-at-threshold: bind once per dwell (leaving and returning
		// re-binds) and stamp the one-tick feedback for the client.
		if s.dwell[id] == campfireDwellTicks {
			s.anchors[p.Client().UUID()] = near.Pos
			p.NoteCampfireBound()
		}
	}
}

func (s *ConnectionStateSystem) doFuneral(p model.PlayerEntity) {
	// remove the players placed entities
	for _, e := range p.OwnedEntities() {
		s.game.RemoveEntity(e)
	}
}

func (s *ConnectionStateSystem) Remove(e ecs.BasicEntity) {
	s.removeFromPlayers(e)
	s.removeFromSpectators(e)
}

func (s *ConnectionStateSystem) removeFromSpectators(e ecs.BasicEntity) {
	arr := s.spectators
	idx := minions.FindBasic(func(i int) model.BasicEntity { return arr[i] }, len(arr), e)
	if idx < 0 {
		return
	}
	sp := arr[idx]
	s.spectators = append(arr[:idx], arr[idx+1:]...)

	// Disconnect-while-dead (chunk 4): a dead client's spectator vanishing
	// with its dead marker still present means the connection dropped — the
	// respawn/join paths consume the marker BEFORE removing the spectator, so
	// they never land here. Release everything the death kept alive.
	client := sp.Client().UUID()
	if dead, ok := s.deadByClient[client]; ok {
		s.names.remove(dead.name)
		s.game.RemoveEntity(dead.corpse.Basic())
		delete(s.deadByClient, client)
		delete(s.anchors, client)
	}
}

func (s *ConnectionStateSystem) removeFromPlayers(e ecs.BasicEntity) {
	arr := s.players
	idx := minions.FindBasic(func(i int) model.BasicEntity { return arr[i] }, len(arr), e)
	if idx < 0 {
		return
	}
	p := arr[idx]
	s.doFuneral(p)
	s.names.remove(p.Name())
	delete(s.anchors, p.Client().UUID())
	delete(s.dwell, p.Basic().ID())
	s.players = append(arr[:idx], arr[idx+1:]...)
}

func (s *ConnectionStateSystem) manglePlayerName(name string) string {
	mangler := minions.DefaultMangler
	for s.names.contains(name) {
		name, mangler = mangler(name)
	}
	return name
}

func sendAcceptMessage(c model.Client) {
	builder := flatbuffers.NewBuilder(32)
	acceptMsg := codec.AcceptMessageFlatbufMarshal(builder)
	builder.Finish(acceptMsg)
	c.SendMessage(builder.FinishedBytes())
}

func sendObituaryMessage(c model.Client) {
	builder := flatbuffers.NewBuilder(32)
	obituaryMsg := codec.ObituaryMessageFlatbufMarshal(builder)
	builder.Finish(obituaryMsg)
	c.SendMessage(builder.FinishedBytes())
}
