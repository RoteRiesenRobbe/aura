package sys

import (
	"log"
	"math"
	"math/rand"
	"sync/atomic"

	"github.com/EngoEngine/ecs"
	"github.com/google/flatbuffers/go"
	"github.com/google/uuid"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/codec"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/minions"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/constant"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/corpse"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/player"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/spectator"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/vitals"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
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

// reconnectStashTTLTicks is how long a disconnected character (and its name
// reservation) survives server-side awaiting a reconnect: ~10 min.
// [PLACEHOLDER] (plan-reconnect-token.md)
const reconnectStashTTLTicks = 10 * 60 * constant.TicksPerSecond

// reconnectStash is a disconnected character awaiting its owner's return
// (plan-reconnect-token.md): the deadState idea generalized — keyed by the
// session's reconnect token instead of the per-connection UUID, so it survives
// the socket. Alive characters stash their live position/HP; dead ones stash
// the death scene (corpse position, dead flag) so a reconnect rebuilds the
// death overlay and Respawn still works. The name stays reserved while
// stashed; the TTL sweep frees both. Buffs and casting state are NOT carried
// (the death-respawn precedent).
type reconnectStash struct {
	name        string
	progression model.PlayerProgression
	skills      *skills.SkillComponent
	health      vitals.VitalSign // alive-stash only; dead reconnects respawn normally
	position    phy.Vec2f        // alive: last position; dead: the deathspot
	anchor      phy.Vec2f
	hasAnchor   bool
	dead        bool
	disconnectTick uint64
}

// CampfireDwellRadiusFactor scales a campfire's heal radius down to its bind
// radius: standing within heal range alone must NOT bind (healing without
// binding is deliberate). [PLACEHOLDER] Hand-synced with the client's inner
// dwell-ring factor (frontend Campfire game object). (chunk 4)
const CampfireDwellRadiusFactor = 0.5

// campfireDwellTicks is how long a player must stay inside a campfire's bind
// radius before it becomes their respawn anchor: ~1.7 s — a bit more than half
// the original 3 s, which felt sluggish in play. [PLACEHOLDER] (chunk 4)
const campfireDwellTicks = 17 * constant.TicksPerSecond / 10

// CampfireAnchor is a placed world campfire as the respawn tracker sees it:
// position + pre-scaled bind radius. Built in cmd/aurad right after
// the campfire mobs are placed and handed over via CampfireAnchorSink.
type CampfireAnchor struct {
	Pos         phy.Vec2f
	DwellRadius float32
	// StartingSpawn marks this fire as a first-arrival spawn point (triage
	// item 5): fresh / unbound players spawn only at flagged fires.
	StartingSpawn bool
}

// CampfireAnchorSink is implemented by the game so cmd/aurad can hand
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
	// tokenByClient maps a live connection to its character's reconnect token
	// (minted on first join, reused across reconnects). Kept as a side map so
	// the token stays out of the model.Client interface.
	tokenByClient map[uuid.UUID]string
	// stashByToken holds disconnected characters awaiting reconnect, keyed by
	// their token; swept by TTL.
	stashByToken map[string]reconnectStash
	// playerCount mirrors len(players), republished at the end of every
	// Update. The players slice itself may only be touched by the game-loop
	// goroutine; this is the cross-goroutine window onto it (see PlayerCount).
	playerCount atomic.Int64
}

// PlayerCount is the number of joined characters currently in the world.
//
// It is served over HTTP (GET /players, the start screen's "players online"
// readout), so it is deliberately a per-tick snapshot rather than a live
// len(s.players): the handler runs on a net/http goroutine and reading the
// slice there would race the loop's appends and splices. Same shape as
// core.TickStats. Spectators — clients on the start screen or the death
// overlay — are not players and are not counted.
func (s *ConnectionStateSystem) PlayerCount() int {
	return int(s.playerCount.Load())
}

// SetCampfireAnchors installs the placed campfires as respawn anchors.
func (s *ConnectionStateSystem) SetCampfireAnchors(campfires []CampfireAnchor) {
	s.campfires = campfires
}

func NewConnectionStateSystem(g model.Game) *ConnectionStateSystem {
	return &ConnectionStateSystem{
		game:          g,
		names:         stringSet{},
		deadByClient:  map[uuid.UUID]deadState{},
		anchors:       map[uuid.UUID]phy.Vec2f{},
		dwell:         map[uint64]int{},
		tokenByClient: map[uuid.UUID]string{},
		stashByToken:  map[string]reconnectStash{},
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

// defaultSpawnPosition places a first-time / unbound arrival at a random
// STARTING-SPAWN campfire (triage item 5), jittered within that campfire's bind
// radius so they land inside the binding ring but never exactly on the fire.
// Real zones are guaranteed ≥1 flagged fire by world-zone validation; if none
// is flagged (bare test zones) it falls back to any campfire, then to a random
// world position when there are no campfires at all.
func (s *ConnectionStateSystem) defaultSpawnPosition() phy.Vec2f {
	if len(s.campfires) == 0 {
		return randomSpawnPosition(s.game.Bounds())
	}
	starts := make([]CampfireAnchor, 0, len(s.campfires))
	for _, c := range s.campfires {
		if c.StartingSpawn {
			starts = append(starts, c)
		}
	}
	if len(starts) == 0 {
		starts = s.campfires // defensive: validation forbids this in real zones
	}
	c := starts[rand.Intn(len(starts))]
	return jitterAround(c.Pos, c.DwellRadius)
}

func (s *ConnectionStateSystem) Update(dt float32) {
	s.sweepExpiredStashes()

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

	// Publish the count last, after this tick's joins and deaths have settled.
	s.playerCount.Store(int64(len(s.players)))
}

// sweepExpiredStashes drops stashed characters whose owner never came back:
// the stash and its name reservation are freed. The map only holds recently
// disconnected characters, so the every-tick iteration is negligible.
func (s *ConnectionStateSystem) sweepExpiredStashes() {
	if len(s.stashByToken) == 0 {
		return
	}
	now := s.game.Ticks()
	for tok, stash := range s.stashByToken {
		if now-stash.disconnectTick >= reconnectStashTTLTicks {
			log.Printf("⌛ stashed character '%s' expired.", stash.name)
			s.names.remove(stash.name)
			delete(s.stashByToken, tok)
		}
	}
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
	sendAcceptMessage(client, s.tokenByClient[client.UUID()])

	p := player.New(s.game, client, dead.name)
	p.SetProgression(dead.progression)
	p.SetSkillComponent(dead.skills)
	p.SetPosition(s.respawnPosition(client.UUID()))
	// Re-stamp full health AFTER progression/skills (triage item 14): the
	// constructor stamped the base pool before +maxHealth passives were back.
	p.VitalSigns().Health = p.MaxHealth()
	s.game.AddEntity(p)
	return true
}

// tryJoin upgrades a spectator to a fresh player — the brand-new-client path.
// A Join presenting a known reconnect token restores the stashed character
// instead (see reattach). A DEAD client may also Join (name change instead of
// Respawn): its dead state is released first — corpse removed, old name freed
// — then the flow proceeds exactly like a first join, still restoring carried
// progression.
func (s *ConnectionStateSystem) tryJoin(sp model.Spectator) {
	j := sp.Client().NextJoin()
	if j == nil {
		return
	}
	client := sp.Client()
	if stash, ok := s.stashByToken[j.ReconnectToken]; ok && j.ReconnectToken != "" {
		s.reattach(sp, j.ReconnectToken, stash)
		return
	}
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
	token, ok := s.tokenByClient[client.UUID()]
	if !ok { // first join on this connection: mint the character's token
		token = uuid.NewString()
		s.tokenByClient[client.UUID()] = token
	}
	sendAcceptMessage(client, token)

	p := player.New(s.game, client, name)
	if wasDead {
		p.SetProgression(dead.progression)
		p.SetSkillComponent(dead.skills)
	}

	// spawn the player at a random campfire (default spawn)
	p.SetPosition(s.defaultSpawnPosition())

	s.game.AddEntity(p)
}

// reattach restores a stashed character onto a new connection: the reload
// path. The stashed name is still reserved (never freed while stashed) and is
// reused verbatim — the token identifies the character, so it wins over the
// Join's name field. An alive character comes back exactly where it was with
// its exact HP; a dead one gets its death scene rebuilt (corpse, dead marker,
// overlay spectator) so Respawn/revive work as if the connection never
// dropped.
func (s *ConnectionStateSystem) reattach(sp model.Spectator, token string, stash reconnectStash) {
	client := sp.Client()
	// Consume the stash BEFORE removing the spectator (the tryRespawn ordering
	// rule for state the removal fan-out must not see twice).
	delete(s.stashByToken, token)
	s.game.RemoveEntity(sp.Basic())

	s.tokenByClient[client.UUID()] = token
	if stash.hasAnchor {
		s.anchors[client.UUID()] = stash.anchor
	}
	sendAcceptMessage(client, token)

	if stash.dead {
		log.Printf("🔌 '%s' reconnected (dead).", stash.name)
		// Rebuild the death scene under the new connection: the client lands
		// on the death overlay (Accept hides the start screen, Obituary shows
		// the end screen) and the normal Respawn path takes over.
		sendObituaryMessage(client)
		c := corpse.New(stash.position)
		s.game.AddEntity(c)
		s.deadByClient[client.UUID()] = deadState{
			name:        stash.name,
			corpse:      c,
			progression: stash.progression,
			skills:      stash.skills,
		}
		s.game.AddEntity(spectator.NewSpectator(stash.position, client))
		return
	}

	log.Printf("🔌 '%s' reconnected.", stash.name)
	p := player.New(s.game, client, stash.name)
	p.SetProgression(stash.progression)
	p.SetSkillComponent(stash.skills)
	p.SetPosition(stash.position)
	// Exact stashed HP, clamped AFTER progression/skills are back (triage
	// item 14 ordering) in case the max pool shrank.
	health := stash.health
	if health > p.MaxHealth() {
		health = p.MaxHealth()
	}
	p.VitalSigns().Health = health
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
	token, hasToken := s.tokenByClient[client.UUID()]

	// The removal fan-out runs the full disconnect bookkeeping (funeral, name
	// stashed, anchor dropped); death deliberately re-adds name + anchor +
	// token and drops the spurious stash after it returns — this keeps
	// removeFromPlayers a single unconditional path.
	s.game.RemoveEntity(p.Basic())
	s.names.add(name)
	if hasAnchor {
		s.anchors[client.UUID()] = anchor
	}
	if hasToken {
		delete(s.stashByToken, token)
		s.tokenByClient[client.UUID()] = token
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
		return s.defaultSpawnPosition()
	}
	return jitterAround(anchor, respawnJitterRadius)
}

// jitterAround spreads positions in a small disc around pos so simultaneous
// arrivals (respawns, recalls) don't stack on one point.
func jitterAround(pos phy.Vec2f, radius float32) phy.Vec2f {
	angle := rand.Float64() * 2 * math.Pi
	r := rand.Float32() * radius
	return phy.Vec2f{
		X: pos.X + r*float32(math.Cos(angle)),
		Y: pos.Y + r*float32(math.Sin(angle)),
	}
}

// AnchorOf is the ConnState seam (plan-skill-vocab chunk 4): the campfire
// anchor a client last bound to, feeding recall's precondition + destination.
func (s *ConnectionStateSystem) AnchorOf(id uuid.UUID) (phy.Vec2f, bool) {
	anchor, ok := s.anchors[id]
	return anchor, ok
}

// ReviveAtCorpse is the ConnState seam behind the revive effect (plan-skill-vocab
// §3.6): it consumes the dead marker whose corpse has the given entity ID —
// exactly like tryRespawn, but the destination is the corpse (that is the whole
// point of a revive, not the campfire) and the player returns at healthFraction
// of max HP instead of full. Reports false when no such corpse is waiting: the
// dead client already respawned or disconnected between the caster's query and
// this call (a benign same-tick race; the losing path no-ops).
func (s *ConnectionStateSystem) ReviveAtCorpse(corpseID uint64, healthFraction float32) bool {
	var clientUUID uuid.UUID
	var dead deadState
	found := false
	for id, d := range s.deadByClient {
		if d.corpse.Basic().ID() == corpseID {
			clientUUID, dead, found = id, d, true
			break
		}
	}
	if !found {
		return false
	}
	sp := s.spectatorByClient(clientUUID)
	if sp == nil {
		return false // corpse without a waiting spectator — mid-teardown, no-op
	}
	client := sp.Client()

	// Consume the marker BEFORE removing the spectator (the tryRespawn ordering
	// rule): the removal fan-out's disconnect-while-dead cleanup must find
	// nothing, or it would free the name and corpse mid-revive.
	delete(s.deadByClient, clientUUID)

	corpsePos := dead.corpse.Position()
	s.game.RemoveEntity(sp.Basic())
	s.game.RemoveEntity(dead.corpse.Basic())

	log.Printf("✨ '%s' was revived!", dead.name)
	sendAcceptMessage(client, s.tokenByClient[client.UUID()])

	p := player.New(s.game, client, dead.name)
	p.SetProgression(dead.progression)
	p.SetSkillComponent(dead.skills)
	p.SetPosition(corpsePos)
	// Partial revive: set health AFTER progression/skills so MaxHealth reflects
	// the restored loadout.
	p.VitalSigns().Health = vitals.VitalSign(float32(p.MaxHealth()) * healthFraction)
	s.game.AddEntity(p)
	return true
}

// spectatorByClient finds the waiting spectator for a client UUID, or nil.
func (s *ConnectionStateSystem) spectatorByClient(id uuid.UUID) model.Spectator {
	for _, sp := range s.spectators {
		if sp.Client().UUID() == id {
			return sp
		}
	}
	return nil
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
	// they never land here. The death scene is stashed for a reconnect (name
	// stays reserved, corpse removed and recreated on reattach); without a
	// token (defensive) everything the death kept alive is released.
	client := sp.Client().UUID()
	if dead, ok := s.deadByClient[client]; ok {
		if token, hasToken := s.tokenByClient[client]; hasToken {
			anchor, hasAnchor := s.anchors[client]
			s.stashByToken[token] = reconnectStash{
				name:           dead.name,
				progression:    dead.progression,
				skills:         dead.skills,
				position:       dead.corpse.Position(),
				anchor:         anchor,
				hasAnchor:      hasAnchor,
				dead:           true,
				disconnectTick: s.game.Ticks(),
			}
			delete(s.tokenByClient, client)
		} else {
			s.names.remove(dead.name)
		}
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
	clientUUID := p.Client().UUID()
	// Stash the character for a reconnect instead of freeing it (the name
	// stays reserved while stashed). Death routes through here too — it drops
	// the spurious stash and re-registers the token right after the fan-out
	// returns (see handleDeath). Without a token (defensive): old free path.
	if token, hasToken := s.tokenByClient[clientUUID]; hasToken {
		anchor, hasAnchor := s.anchors[clientUUID]
		s.stashByToken[token] = reconnectStash{
			name:           p.Name(),
			progression:    p.Progression(),
			skills:         p.SkillComponent(),
			health:         p.VitalSigns().Health,
			position:       p.Position(),
			anchor:         anchor,
			hasAnchor:      hasAnchor,
			disconnectTick: s.game.Ticks(),
		}
		delete(s.tokenByClient, clientUUID)
	} else {
		s.names.remove(p.Name())
	}
	delete(s.anchors, clientUUID)
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

func sendAcceptMessage(c model.Client, reconnectToken string) {
	builder := flatbuffers.NewBuilder(64)
	acceptMsg := codec.AcceptMessageFlatbufMarshal(builder, reconnectToken)
	builder.Finish(acceptMsg)
	c.SendMessage(builder.FinishedBytes())
}

func sendObituaryMessage(c model.Client) {
	builder := flatbuffers.NewBuilder(32)
	obituaryMsg := codec.ObituaryMessageFlatbufMarshal(builder)
	builder.Finish(obituaryMsg)
	c.SendMessage(builder.FinishedBytes())
}
