package sys

import (
	"log"
	"math"
	"math/rand"
	"sync"
	"sync/atomic"

	"github.com/EngoEngine/ecs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/auth"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/codec"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/minions"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/constant"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/corpse"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/player"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/spectator"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/vitals"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/persist"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/quests"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/google/flatbuffers/go"
	"github.com/google/uuid"
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
	// quests is the character's quest ledger (plan-quests.md C1, L11): the
	// player struct is rebuilt on respawn, so like the skill component the
	// ledger pointer must ride the stash or every death wipes quest progress.
	quests *quests.Ledger
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
	quests      *quests.Ledger   // the L11 carry, exactly like deadState's
	health      vitals.VitalSign // alive-stash only; dead reconnects respawn normally
	// campCharges is the Camp charge store (plan-downtime.md C2). Alive-stash
	// only, and that asymmetry IS the ruling: the stash means "same session",
	// so an F5 keeps the charges, while death — which stashes through
	// deadState, not here — zeroes them along with everything else the
	// rebuilt player struct loses. Nothing about it reaches persist.
	campCharges int
	position    phy.Vec2f // alive: last position; dead: the deathspot
	anchor      string    // bound spawn-point id; "" for unbound
	// discovered is the anchor's twin — the whole discovered set, carried so a
	// reload does not lose the fires found since the last save. Unlike
	// campCharges above this is stashed on BOTH the alive and the dead path:
	// discovery is persisted progress, and death does not take it.
	discovered     stringSet
	dead           bool
	disconnectTick uint64

	// accountID owns this stash; 0 for a character that joined before accounts
	// existed (nothing does after chunk 3, but a stash outlives a deploy).
	//
	// ⚑ It is what turns reconnect from POSSESSION into IDENTITY. Before chunk 3
	// a valid reconnect token alone resumed a live character and nothing checked
	// who presented it — acceptable when nothing was staked on it, and a real
	// hole once a character carries progress (plan-accounts-frontend.md §8).
	accountID int64
	// characterID is the row this stash saves to (chunk 4). It rides the stash
	// for the same reason the ledger does (L11): the player struct is gone, and
	// the session-expiry save has nothing else to ask which row it is writing.
	characterID int64
}

// PlayTickets redeems a play ticket into the identity it was minted for.
// Implemented by *auth.TicketStore.
//
// ⚑ Declared HERE, as the narrowest thing the game needs, rather than importing
// auth's concrete type. The game must never be able to reach a password, a JWT
// or the credentials table (§10 invariant 1) — an interface with exactly one
// method is the cheapest way to make that structural instead of a rule someone
// remembers.
type PlayTickets interface {
	Redeem(token string) (auth.Ticket, error)
}

// AccountSessions enforces one live world session per account.
// Implemented by *auth.SessionRegistry.
type AccountSessions interface {
	Claim(s auth.Session) (existing auth.Session, ok bool)
	Stash(accountID int64) bool
	Release(accountID int64) bool
	Live(accountID int64) (auth.Session, bool)
}

// IdentitySink is the game seen from cmd/aurad's wiring, following the
// CampfireAnchorSink precedent: the interface lives here, `core.game`
// implements it, and aurad type-asserts rather than widening model.Game — which
// every mock and test double would then have to grow two methods for.
type IdentitySink interface {
	SetIdentity(tickets PlayTickets, sessions AccountSessions)
	EndSessionFor(accountID int64)
}

// CampfireDwellRadiusFactor scales a campfire's heal radius down to its bind
// radius: standing within heal range alone must NOT bind (healing without
// binding is deliberate). [PLACEHOLDER] The client does not restate this: the
// bind circle is drawn from the wire dwell_radius (Mobs.ts setDwellRadius),
// so this factor is the single source. (chunk 4)
const CampfireDwellRadiusFactor = 0.5

// campfireDwellTicks is how long a player must stay inside a campfire's bind
// radius before it becomes their respawn anchor: ~1.7 s — a bit more than half
// the original 3 s, which felt sluggish in play. [PLACEHOLDER] (chunk 4)
const campfireDwellTicks = 17 * constant.TicksPerSecond / 10

// CampfireAnchor is a placed world campfire as the respawn tracker sees it:
// position + pre-scaled bind radius. Built in cmd/aurad right after
// the campfire mobs are placed and handed over via CampfireAnchorSink.
type CampfireAnchor struct {
	// ID is the authored spawn-point id (world.Campfire.ID) — the identity a
	// character's bind is stored under, and the key everything else resolves
	// through. Zone validation guarantees it is non-empty and unique.
	ID          string
	Pos         phy.Vec2f
	DwellRadius float32
	// StartingSpawn marks this fire as a first-arrival spawn point (triage
	// item 5): fresh / unbound players spawn only at flagged fires.
	StartingSpawn bool
}

// dwellProgress is how long a player has stood at ONE campfire, and which.
//
// ⚑ The spawn point is half of it on purpose: a bare counter cannot tell
// "still at the same fire" from "now at a different one", and that is exactly
// the distinction the bind depends on.
type dwellProgress struct {
	spawnPoint string
	ticks      int
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
	// campfireByID resolves a spawn-point id back to the placed fire. Rebuilt
	// with the campfire list, never mutated after.
	campfireByID map[string]CampfireAnchor
	// anchors is the SPAWN-POINT ID of the campfire a client last bound to
	// (dwell completed); their respawn point. Keyed by client so it survives
	// death; dropped on disconnect (client UUIDs are per-connection).
	//
	// ⚑ An id rather than a position, because this is also what gets persisted.
	// Holding a position here and an id in the database would be two answers to
	// "where is home", and they would drift the first time a fire is moved.
	// Everything that needs coordinates resolves through campfireByID, so an id
	// that no longer resolves behaves as unbound everywhere at once.
	anchors map[uuid.UUID]string
	// discovered is the set of spawn-point ids each client's character has ever
	// dwelled at — the map's campfire markers (plan-world-map.md C2) and, once
	// flight ships, its flight network (plan-flight-paths.md D4).
	//
	// ⚑ CONNECTION STATE, keyed exactly like anchors, and every one of anchors'
	// touch points has a twin here: seeded from the play ticket at join, carried
	// through the reconnect stash, re-added after death's removal fan-out, and
	// dropped on disconnect. A missing twin does not fail loudly — it silently
	// loses a session's discoveries at whichever seam was forgotten.
	//
	// ⚑ It only ever GROWS within a session. Nothing un-discovers a fire, which
	// is what lets the save path insert instead of replacing (store.SaveCharacter).
	discovered map[uuid.UUID]stringSet
	// dwell tracks a player's bind progress at ONE campfire, keyed by player
	// entity ID (reset on leave or on reaching a different fire, dropped on
	// removal).
	dwell map[uint64]dwellProgress
	// tokenByClient maps a live connection to its character's reconnect token
	// (minted on first join, reused across reconnects). Kept as a side map so
	// the token stays out of the model.Client interface.
	tokenByClient map[uuid.UUID]string
	// stashByToken holds disconnected characters awaiting reconnect, keyed by
	// their token; swept by TTL.
	stashByToken map[string]reconnectStash
	// accountByClient maps a live connection to the account playing on it, so a
	// disconnect knows whose session slot to stash.
	accountByClient map[uuid.UUID]int64
	// characterByClient maps a live connection to the character row it plays, so
	// a save knows which row to write (chunk 4). Separate from accountByClient
	// rather than one struct because an account and a character are different
	// scopes — the session registry is keyed by the first, persistence by the
	// second, and merging them would invite one to be used for the other.
	characterByClient map[uuid.UUID]int64
	// saves queues character snapshots for the writer goroutine; nil in tests
	// and in any build without persistence wired (see SetCharacterSaves).
	saves CharacterSaves
	// ascensions runs the sacrifice transaction off the loop and hands its
	// outcome back; nil wherever saves is nil.
	ascensions CharacterAscensions
	// saveWatch is what each live character's last save was taken against, so a
	// forced-save event is three integer comparisons rather than a rebuild.
	saveWatch map[uuid.UUID]saveWatch
	// These four drive §5b's "your progress is not being saved" warning:
	// whether writes are currently failing, since when, when players were last
	// told, and whether they have been told at all.
	saveFailureActive bool
	failingSince      uint64
	lastSaveWarning   uint64
	saveWarningSent   bool
	// flushRequests holds shutdown flush requests, drained once per tick.
	//
	// ⚑ A sync.Map for the same reason logoutRequests is one: it is written from
	// the signal handler's goroutine and read by the game loop.
	flushRequests sync.Map
	// tickets and sessions are chunk 3's identity seam. Both are nil in tests
	// and in any build that has not wired them, and every use is guarded — the
	// game must keep working without a database behind it.
	tickets  PlayTickets
	sessions AccountSessions
	// logoutRequests holds account ids whose world session the logout endpoint
	// asked to end, drained once per tick.
	//
	// ⚑ A sync.Map, not a plain map, because it is written from net/http
	// goroutines and read by the game loop. Everything else in this struct is
	// loop-only; this is the one cross-goroutine inbox, and it exists so the
	// handler never touches s.players.
	logoutRequests sync.Map
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
	s.campfireByID = make(map[string]CampfireAnchor, len(campfires))
	for _, c := range campfires {
		s.campfireByID[c.ID] = c
	}
}

// campfireFor resolves a bound spawn-point id to the fire it names. Not ok for
// "" (never bound) and for an id the loaded zone no longer places — a fire
// deleted in the editor, or a bind made in another zone. Both mean UNBOUND, and
// deliberately so: refusing the join instead would lock a player out of the
// world over a content edit they did not make.
func (s *ConnectionStateSystem) campfireFor(id string) (CampfireAnchor, bool) {
	if id == "" {
		return CampfireAnchor{}, false
	}
	c, ok := s.campfireByID[id]
	return c, ok
}

// discoveredFor is a client's discovered set, created empty on first touch.
func (s *ConnectionStateSystem) discoveredFor(client uuid.UUID) stringSet {
	set, ok := s.discovered[client]
	if !ok {
		set = stringSet{}
		s.discovered[client] = set
	}
	return set
}

// DiscoveredCampfires is a client's discovered set as a sorted slice — the form
// both the wire and the save snapshot want.
//
// ⚑ It publishes the set RAW, without dropping ids the loaded zone no longer
// places. Filtering here would be a second opinion on resolution and the client
// needs its own anyway: its bundled zone data and the server's authored content
// can differ across a deploy, so "an id I cannot place draws nothing" has to
// hold on the client regardless of what the server sends.
func (s *ConnectionStateSystem) DiscoveredCampfires(client uuid.UUID) []string {
	return sortedSet(s.discovered[client])
}

// sortedSet renders a discovered set as the sorted slice the wire and the save
// snapshot both want. Nil for an empty set — an absent wire field and a
// no-rows save, which is what "has discovered nothing" means on both sides.
//
// ⚑ Sorted, not incidental: persist.CharacterState.Fingerprint() marshals this
// slice, so map-iteration order would make every snapshot of an unchanged
// character look dirty.
func sortedSet(set stringSet) []string {
	if len(set) == 0 {
		return nil
	}
	ids := make([]string, 0, len(set))
	for id := range set {
		ids = append(ids, id)
	}
	persist.SortCampfires(ids)
	return ids
}

// publishCampfireState stamps the owning client's home fire and whole discovered
// set onto the player, for this tick's GameState.
//
// ⚑ THE WHOLE SET, never a delta. It is five short strings today and the client
// simply replaces what it holds, so there is no accumulate-and-drift path and no
// "what if the client missed one" question to answer.
//
// ⚑ Called on every path that puts a player entity into the world (join,
// reattach, respawn, revive) and at the dwell threshold — the only two moments
// either value can change. Deliberately NOT every tick: the pair changes minutes
// apart, and a string vector at 30 Hz for that is the shape of waste the roster
// message was kept out of GameState to avoid.
func (s *ConnectionStateSystem) publishCampfireState(p model.PlayerEntity) {
	client := p.Client().UUID()
	p.NoteCampfireState(s.anchors[client], s.DiscoveredCampfires(client))
}

func NewConnectionStateSystem(g model.Game) *ConnectionStateSystem {
	return &ConnectionStateSystem{
		game:            g,
		names:           stringSet{},
		deadByClient:    map[uuid.UUID]deadState{},
		anchors:         map[uuid.UUID]string{},
		discovered:      map[uuid.UUID]stringSet{},
		dwell:           map[uint64]dwellProgress{},
		tokenByClient:   map[uuid.UUID]string{},
		stashByToken:    map[string]reconnectStash{},
		accountByClient: map[uuid.UUID]int64{},

		characterByClient: map[uuid.UUID]int64{},
		saveWatch:         map[uuid.UUID]saveWatch{},
	}
}

// SetIdentity installs the play-ticket store and the session registry.
//
// ⚑ Injected after construction rather than taken as constructor arguments,
// because the game is built before the accounts server and every existing test
// constructs this system with a bare game. Leaving both nil is a supported
// state: a build with no database still runs, it just cannot honour a ticket.
func (s *ConnectionStateSystem) SetIdentity(tickets PlayTickets, sessions AccountSessions) {
	s.tickets = tickets
	s.sessions = sessions
}

// EndSessionFor drops the account's live world session: the socket closes and
// the character leaves the world.
//
// ⚑ Called from the LOGOUT HTTP handler, and it is the one acknowledged place a
// handler reaches into the running game (§10, "the one known exception"). §3
// specifies that logout ends the world session, and chunk 1c could not honour
// it because the registry was not wired yet.
//
// ⚑ It is safe to call from a net/http goroutine because it only queues the
// disconnect; the loop performs it. Touching s.players here would race the
// game-loop goroutine, which is exactly the class of bug the PlayerCount
// snapshot exists to avoid.
func (s *ConnectionStateSystem) EndSessionFor(accountID int64) {
	if accountID == 0 {
		return
	}
	s.logoutRequests.Store(accountID, struct{}{})
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
	return JitterAround(c.Pos, c.DwellRadius)
}

func (s *ConnectionStateSystem) Update(dt float32) {
	s.sweepExpiredStashes()
	s.drainLogoutRequests()
	s.drainAscensions()
	s.drainFlushRequests()

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
	// ⚑ AFTER the join/death loops and the dwell tracker, never inside them —
	// §4 Rule 2. A snapshot taken mid-tick can catch a player whose health has
	// been decremented but whose death has not been processed yet; taken here it
	// sees a world that has finished moving for this tick.
	s.trackCharacterSaves()
	s.warnAboutFailingSaves()

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
			// §2's session-expiry save, taken before the stash is dropped —
			// this is the last moment its state exists anywhere.
			s.saveStash(stash)
			s.names.remove(stash.name)
			delete(s.stashByToken, tok)
			s.releaseExpiredSession(stash)
		}
	}
}

// discardStashFor drops any stashed character belonging to an account and frees
// its reserved name.
//
// ⚑ The name release is the point. A stash holds its character's name reserved
// so a reconnect can resume under it; when the player instead returns through
// character-select, that reservation is what makes their own name look taken.
func (s *ConnectionStateSystem) discardStashFor(accountID int64) {
	if accountID == 0 {
		return
	}
	for token, stash := range s.stashByToken {
		if stash.accountID != accountID {
			continue
		}
		s.names.remove(stash.name)
		delete(s.stashByToken, token)
	}
}

// releaseExpiredSession frees the account slot a swept stash was holding.
//
// ⚑ ONLY IF THE SLOT IS STILL THAT STASH'S. The player may have come back in
// the meantime on a DIFFERENT character — "leave to character select" does
// exactly that — which replaces the session while the old stash lingers to its
// TTL. Releasing unconditionally would then free a slot belonging to a session
// that is live right now, and the account could be joined twice: precisely the
// two-live-copies bug the registry exists to prevent, arriving ten minutes after
// the action that caused it.
func (s *ConnectionStateSystem) releaseExpiredSession(stash reconnectStash) {
	if s.sessions == nil || stash.accountID == 0 {
		return
	}
	live, ok := s.sessions.Live(stash.accountID)
	if !ok || !live.Stashed {
		return
	}
	s.sessions.Release(stash.accountID)
}

// drainLogoutRequests ends the world sessions the logout endpoint asked for.
//
// ⚑ Runs on the game loop, draining an inbox the HTTP handler filled. The
// handler cannot close the socket itself: s.players belongs to this goroutine.
func (s *ConnectionStateSystem) drainLogoutRequests() {
	s.logoutRequests.Range(func(key, _ any) bool {
		s.logoutRequests.Delete(key)
		accountID, _ := key.(int64)
		for client, account := range s.accountByClient {
			if account != accountID {
				continue
			}
			// Dropping the connection routes through the ordinary disconnect
			// path, which stashes the character and marks the session stashed.
			// The Release below is what makes logout different from a dropped
			// socket: the account is free again immediately, so the player can
			// log in elsewhere without waiting out the stash TTL.
			s.closeClient(client)
		}
		if s.sessions != nil {
			s.sessions.Release(accountID)
		}
		return true
	})
}

// playerByClient finds the live player behind a connection; nil if the socket
// has already gone. The same walk closeClient does, over the handful of players
// on this server.
func (s *ConnectionStateSystem) playerByClient(clientUUID uuid.UUID) model.PlayerEntity {
	for _, p := range s.players {
		if p.Client().UUID() == clientUUID {
			return p
		}
	}
	return nil
}

// closeClient drops a live connection by its client UUID.
func (s *ConnectionStateSystem) closeClient(clientUUID uuid.UUID) {
	for _, p := range s.players {
		if p.Client().UUID() == clientUUID {
			log.Printf("👋 ending '%s' world session (logged out)", p.Name())
			p.Client().Close()
			return
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
	p.SetQuestLedger(dead.quests)
	p.SetPosition(s.respawnPosition(client.UUID()))
	// Re-stamp full health AFTER progression/skills (triage item 14): the
	// constructor stamped the base pool before +maxHealth passives were back.
	p.VitalSigns().Health = p.MaxHealth()
	s.publishCampfireState(p)
	s.game.AddEntity(p)
	return true
}

// redeemTicket exchanges a play ticket for the identity it names, burning it.
//
// ⚑ A ticket is SINGLE USE, so this may be called at most once per Join. An
// unknown or expired one is not an error worth logging loudly: the client's
// answer is to call /select again and retry exactly once (§7b), and expiry
// firing here is the mechanism working — every server restart forgets them all.
func (s *ConnectionStateSystem) redeemTicket(token string) (auth.Ticket, bool) {
	if s.tickets == nil || token == "" {
		return auth.Ticket{}, false
	}
	t, err := s.tickets.Redeem(token)
	if err != nil {
		return auth.Ticket{}, false
	}
	return t, true
}

// claimSession takes the account's one live session slot, refusing the join if
// somebody already holds it. It reports whether the join may proceed.
//
// ⚑ THE CLAIM IS THE AUTHORITY, not /select's courtesy check (§5). Two tabs can
// pass /select simultaneously and both receive valid tickets — a mint-time check
// cannot be atomic with a session that does not exist yet. Exactly one of them
// wins here.
func (s *ConnectionStateSystem) claimSession(client model.Client, t auth.Ticket) bool {
	if s.sessions == nil || t.AccountID == 0 {
		return true
	}
	if _, ok := s.sessions.Claim(auth.Session{AccountID: t.AccountID, CharacterID: t.CharacterID}); !ok {
		log.Printf("🚫 join refused: account %d is already playing", t.AccountID)
		s.refuseJoin(client)
		return false
	}
	s.accountByClient[client.UUID()] = t.AccountID
	s.characterByClient[client.UUID()] = t.CharacterID
	return true
}

// refuseJoin turns a rejected Join away.
//
// ⚑ It closes the socket rather than sending a refusal message, and that is a
// decision (PO 2026-08-01): the client falls back to character-select and calls
// /select again, which answers over HTTP where the exact wording already exists
// (§5b, "This account is already logged in."). Adding a wire message for a case
// the HTTP layer can already explain would spend the one chunk that may touch
// client.fbs on a redundant one.
func (s *ConnectionStateSystem) refuseJoin(client model.Client) {
	client.Close()
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

	// The ticket is the only proof of identity this socket carries. Redeem it
	// first, because BOTH paths below need the account it names — the reconnect
	// path to check the stash belongs to the same account, the fresh-join path
	// to claim that account's session slot.
	//
	// ⚑ Redeeming BURNS the ticket, so it must happen exactly once per Join and
	// the result must be carried, never re-redeemed.
	ticket, hasTicket := s.redeemTicket(j.PlayTicket)

	if stash, ok := s.stashByToken[j.ReconnectToken]; ok && j.ReconnectToken != "" {
		// ⚑ IDENTITY, NOT POSSESSION (plan-accounts-frontend.md §8). Before
		// chunk 3 a valid token alone resumed a live character, so a leaked one
		// — XSS, a shared machine, a stray log line — let someone else take over
		// your session. A stash that belongs to an account now requires a ticket
		// naming that same account.
		if stash.accountID != 0 {
			if !hasTicket || ticket.AccountID != stash.accountID {
				log.Printf("🚫 reconnect refused: token presented without a matching identity")
				s.refuseJoin(client)
				return
			}
		}
		if hasTicket && !s.claimSession(client, ticket) {
			return
		}
		s.reattach(sp, j.ReconnectToken, stash)
		return
	}

	// ⚑ A fresh join REQUIRES a ticket (PO 2026-08-01). `player_name` is dead
	// weight on the wire: keeping a name-only route would leave a permanent
	// unauthenticated way into the world beside the authenticated one, which is
	// exactly the parallel path the play ticket exists to remove. The load bot
	// and the browser harness both mint one through the ordinary anonymous
	// endpoints, so nothing legitimate needs the old route.
	if !hasTicket {
		log.Printf("🚫 join refused: no play ticket presented")
		s.refuseJoin(client)
		return
	}
	if !s.claimSession(client, ticket) {
		return
	}
	// ⚑ Drop this account's own stale stash BEFORE naming the character, or the
	// player collides with themselves: leaving to character-select stashes the
	// character and KEEPS ITS NAME RESERVED (that is what the stash is for), so
	// playing the same character again finds "HEer" taken and joins them as
	// "HEer the ugly". The mangler was doing its job on the wrong input.
	//
	// It is safe here and only here: the reconnect path returned above, so
	// reaching this line means the player deliberately came back through
	// character-select and the old stash is obsolete by definition — its session
	// slot has just been re-claimed above.
	s.discardStashFor(ticket.AccountID)

	dead, wasDead := s.deadByClient[client.UUID()]
	if wasDead {
		delete(s.deadByClient, client.UUID())
		s.names.remove(dead.name)
		s.game.RemoveEntity(dead.corpse.Basic())
	}

	s.game.RemoveEntity(sp.Basic())

	// upgrade to p
	//
	// ⚑ The name comes off the TICKET, not the wire. /select read it from the
	// character row a moment ago (it had to, to prove ownership), so the game
	// loop never queries the database to answer a Join — a synchronous read
	// inside this single-goroutine tick would stall every player (ruling 11).
	//
	// ⚑ It is still passed through manglePlayerName. Character names are
	// globally unique in the DATABASE, but the in-world name set also holds
	// stashed and dead characters whose rows are gone, so a collision is still
	// reachable and the de-duplicator still earns its place.
	name := ticket.Name
	if len(name) > 20 { // the column allows 20; the wire never carries it now
		name = name[:20]
	}
	name = s.manglePlayerName(name)
	log.Printf("☺️ '%s' joined! (account %d, character %d)", name, ticket.AccountID, ticket.CharacterID)
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
		p.SetQuestLedger(dead.quests)
	} else {
		// ⚑ THE COLD LOAD, and only the cold load (§5, §6). The persisted state
		// rides the ticket because /select already read this character's row over
		// authenticated HTTP; the loop never queries the database (ruling 11).
		//
		// ⚑ Carried in-memory state WINS when it exists. A dead player rejoining
		// through character-select holds progress newer than anything on disk —
		// "load-from-DB is for cold logins only" is exactly this branch.
		restoreCharacterState(p, ticket.State, s.game.Skills())
	}

	// ⚑ AFTER the branch, not inside it, so all three join shapes get the same
	// answer — a cold load, a dead player rejoining through character-select,
	// and a brand-new successor. Seeding before the branch would be silently
	// discarded by the dead path's SetSkillComponent, which replaces the whole
	// component.
	//
	// ⚑ Order against the restore is deliberate but not delicate: Discover
	// merges and never overwrites a level, so running last cannot undo anything
	// restoreCharacterState just established — including the active aura slot,
	// which nothing here touches.
	seedBloodlineUnlocks(p, ticket.BloodlineUnlocks, s.game.Skills())

	// ⭐ And KEEP the keys, which is a different job from seeding the spellbook
	// with them (§12.4 C2a step 3). The ascension stone's reward list filters on
	// what this bloodline has SPENT, and the spellbook cannot answer that: a
	// world drop discovers a skill the bloodline never bought. These are the
	// durable rows resolved at /select, held in memory for a per-tick render.
	p.SetBloodlineUnlocks(ticket.BloodlineUnlocks)
	p.SetBloodlineAscensions(ticket.BloodlineAscensions)
	// ⚑ And the account itself (C3 step 6, D25), from the same ticket and for the
	// same reason: the memorial marks the reading player's own names, and the
	// loop has never had account identity ON A PLAYER before, only in
	// accountByClient, which is keyed by connection and unreachable from a
	// conversation.
	p.SetAccountID(ticket.AccountID)

	// Spawn at the bound campfire, or at a random starting fire when there is no
	// usable bind.
	//
	// ⚑ THE BIND IS RE-INSTALLED, not just read. s.anchors is keyed by
	// connection, so a cold login starts with nothing in it — and a player who
	// spawned at their home fire but stayed *unbound* would find recall refused
	// and their next death sending them across the map, until they happened to
	// dwell at the fire they are already standing in.
	//
	// ⚑ An unresolvable id leaves them unbound on purpose (campfireFor): the
	// next save then writes NULL and the dead id is cleared, rather than being
	// re-resolved and re-failing on every login for the life of the character.
	//
	// ⚑ A bind ALREADY on this connection wins over the ticket's, for the same
	// reason the state restore above prefers carried state: joining while dead
	// reuses the connection, and its live bind is newer than the snapshot
	// /select read.
	home := s.anchors[client.UUID()]
	if home == "" {
		home = ticket.State.HomeCampfireID
	}
	if fire, ok := s.campfireFor(home); ok {
		s.anchors[client.UUID()] = fire.ID
		p.SetPosition(JitterAround(fire.Pos, respawnJitterRadius))
	} else {
		p.SetPosition(s.defaultSpawnPosition())
	}

	// The discovered set is seeded the same way and for the same reason: it is
	// connection state, so a cold login starts empty and the ticket is the only
	// place the persisted set arrives from.
	//
	// ⚑ UNION, never replace. A player who rejoins through character-select
	// after dying has discoveries on this connection that are newer than the
	// snapshot /select read — the same "carried state wins" rule the restore
	// above follows, except a set can honour both halves instead of choosing.
	set := s.discoveredFor(client.UUID())
	for _, id := range ticket.State.DiscoveredCampfires {
		set.add(id)
	}

	s.publishCampfireState(p)
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
	// The account moves to the NEW connection, or the next disconnect would
	// stash nothing and the slot would never be released. The character moves
	// with it, or the resumed session would save to nowhere.
	if stash.accountID != 0 {
		s.accountByClient[client.UUID()] = stash.accountID
	}
	if stash.characterID != 0 {
		s.characterByClient[client.UUID()] = stash.characterID
	}
	if stash.anchor != "" {
		s.anchors[client.UUID()] = stash.anchor
	}
	// The anchor's twin: the reconnect stash is the ONLY carrier of a session's
	// discoveries across a reload. Without this leg an F5 loses every fire found
	// since the last save — invisibly, because the next save then writes the
	// shrunken set back and the loss looks like it was never discovered.
	if len(stash.discovered) > 0 {
		set := s.discoveredFor(client.UUID())
		for id := range stash.discovered {
			set.add(id)
		}
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
			quests:      stash.quests,
		}
		s.game.AddEntity(spectator.NewSpectator(stash.position, client))
		return
	}

	log.Printf("🔌 '%s' reconnected.", stash.name)
	p := player.New(s.game, client, stash.name)
	p.SetProgression(stash.progression)
	p.SetSkillComponent(stash.skills)
	p.SetQuestLedger(stash.quests)
	p.SetPosition(stash.position)
	// After the progression is back: the cap is level-derived, so restoring
	// the count first would clamp against a level-1 cap.
	p.SetCampCharges(stash.campCharges)
	// Exact stashed HP, clamped AFTER progression/skills are back (triage
	// item 14 ordering) in case the max pool shrank.
	health := stash.health
	if health > p.MaxHealth() {
		health = p.MaxHealth()
	}
	p.VitalSigns().Health = health
	s.publishCampfireState(p)
	s.game.AddEntity(p)
}

// handleDeath downgrades a dead player to a spectator waiting on the death
// overlay: progression is stashed, a corpse marks the deathspot, and the name
// stays reserved until respawn or disconnect (chunk 4).
func (s *ConnectionStateSystem) handleDeath(p model.PlayerEntity) {
	log.Printf("💀 '%s' died.", p.Name())
	// ⭐ A RUNNING CAST DIES WITH THE PLAYER. The component is STASHED and
	// re-installed on respawn, cast state included, so a cast left running here
	// resumes at the campfire and fires there: a Recall that teleports you after
	// you already respawned, a Camp planted out of nowhere, or (the one that
	// made this visible) an ascension completing from the respawn point with the
	// corpse still on the field. CancelCast is also what drops the ascension
	// pick, so this is one line for all three.
	p.SkillComponent().CancelCast()
	client := p.Client()
	sendObituaryMessage(client)
	deathspot := p.Position()
	p.LoseCurrentLevelExperience()
	name := p.Name()
	anchor, hasAnchor := s.anchors[client.UUID()]
	discovered := s.discovered[client.UUID()]
	token, hasToken := s.tokenByClient[client.UUID()]
	account := s.accountByClient[client.UUID()]
	character := s.characterByClient[client.UUID()]

	// The removal fan-out runs the full disconnect bookkeeping (funeral, name
	// stashed, anchor dropped); death deliberately re-adds name + anchor +
	// token and drops the spurious stash after it returns — this keeps
	// removeFromPlayers a single unconditional path.
	s.game.RemoveEntity(p.Basic())
	s.names.add(name)
	if hasAnchor {
		s.anchors[client.UUID()] = anchor
	}
	// The anchor's twin again: dying must not un-discover anything. The bind
	// survives death (state_test pins that), and the fires you found on the way
	// to dying survive it for the same reason.
	if len(discovered) > 0 {
		s.discovered[client.UUID()] = discovered
	}
	if hasToken {
		delete(s.stashByToken, token)
		s.tokenByClient[client.UUID()] = token
	}
	// ⚑ DEATH IS NOT A DISCONNECT, and the same fan-out that stashes the name
	// also marked the account's session stashed and forgot which character this
	// connection plays — while the socket is still open and the player is one
	// click from respawning. Re-registering is what keeps logout, the
	// one-session-per-account rule and the save path pointed at a player who is
	// still very much present; without it, dying quietly freed the account's
	// slot to a second tab.
	if account != 0 {
		s.accountByClient[client.UUID()] = account
		if s.sessions != nil {
			s.sessions.Claim(auth.Session{AccountID: account, CharacterID: character})
		}
	}
	if character != 0 {
		s.characterByClient[client.UUID()] = character
	}

	c := corpse.New(deathspot)
	s.game.AddEntity(c)
	s.deadByClient[client.UUID()] = deadState{
		name:        name,
		corpse:      c,
		progression: p.Progression(),
		skills:      p.SkillComponent(),
		quests:      p.QuestLedger(),
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
	fire, ok := s.campfireFor(s.anchors[id])
	if !ok {
		return s.defaultSpawnPosition()
	}
	return JitterAround(fire.Pos, respawnJitterRadius)
}

// JitterAround spreads positions in a small disc around pos so simultaneous
// arrivals (respawns, recalls, flight landings) don't stack on one point.
// Exported for the flight landing snap (core/input.go, plan-flight-paths.md).
func JitterAround(pos phy.Vec2f, radius float32) phy.Vec2f {
	angle := rand.Float64() * 2 * math.Pi
	r := rand.Float32() * radius
	return phy.Vec2f{
		X: pos.X + r*float32(math.Cos(angle)),
		Y: pos.Y + r*float32(math.Sin(angle)),
	}
}

// CampfireAt resolves which authored fire's bind radius contains pos, if any —
// the same geometry the dwell tracker walks every tick, shared so a "standing
// at a fire" answer can never disagree between binding and flight validation
// (plan-flight-paths.md §4.4). Only the boot-frozen authored slice answers: a
// player-placed mini-camp is never in it (L3), so it can no more become a
// flight node than a spawn point.
func (s *ConnectionStateSystem) CampfireAt(pos phy.Vec2f) (string, bool) {
	for i := range s.campfires {
		c := &s.campfires[i]
		if pos.DistanceToSquared(c.Pos) <= c.DwellRadius*c.DwellRadius {
			return c.ID, true
		}
	}
	return "", false
}

// CampfireDiscovered reports whether this client's character has discovered
// the fire (dwelled at it, D4) — flight validation's authority
// (plan-flight-paths.md §4.4).
func (s *ConnectionStateSystem) CampfireDiscovered(client uuid.UUID, id string) bool {
	return s.discovered[client].contains(id)
}

// CampfirePosition resolves a spawn-point id to its fire's position. Reports
// false for an id that no longer resolves — the home_campfire_id rule: stale
// is skipped silently, never an error.
func (s *ConnectionStateSystem) CampfirePosition(id string) (phy.Vec2f, bool) {
	fire, ok := s.campfireFor(id)
	return fire.Pos, ok
}

// AnchorOf is the ConnState seam (plan-skill-vocab chunk 4): the campfire
// anchor a client last bound to, feeding recall's precondition + destination.
//
// ⚑ A bind whose spawn point no longer exists reports false, i.e. recall
// refuses with "no campfire anchor bound" rather than teleporting the caster to
// a fire that is not there any more.
func (s *ConnectionStateSystem) AnchorOf(id uuid.UUID) (phy.Vec2f, bool) {
	fire, ok := s.campfireFor(s.anchors[id])
	return fire.Pos, ok
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
	s.publishCampfireState(p)
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
		id := p.Basic().ID()
		// A flyer's position sweeps the whole world (plan-flight-paths.md
		// §4.2): without this skip a slow fly-over would discover — and
		// REBIND the respawn to — fires never landed at, and a takeoff
		// within the dwell threshold of arriving would complete the origin
		// fire's dwell mid-air. Dropping the progress means a landing starts
		// a fresh count, which is exactly what standing at the fire earns.
		if p.Flying() {
			delete(s.dwell, id)
			continue
		}
		nearID, ok := s.CampfireAt(p.Position())
		if !ok {
			delete(s.dwell, id)
			continue
		}
		// ⚑ A DIFFERENT fire restarts the count. Only checking "near nothing"
		// left a player who moved straight from one bind radius into another
		// still accumulating the first fire's ticks — and since the bind fires
		// on the count being exactly at the threshold, it never fired again:
		// they stayed bound to a campfire they had left. Reachable on foot
		// wherever two bind radii touch, and instantly with a warp.
		progress := s.dwell[id]
		if progress.spawnPoint != nearID {
			progress = dwellProgress{spawnPoint: nearID}
		}
		progress.ticks++
		s.dwell[id] = progress
		// Exactly-at-threshold: bind once per dwell (leaving and returning
		// re-binds) and stamp the one-tick feedback for the client.
		if progress.ticks == campfireDwellTicks {
			s.anchors[p.Client().UUID()] = nearID
			p.NoteCampfireBound()
			// The same act rebinds the spawn point and refills the Camp
			// charge store (C2): the fire is the one anchor of the whole
			// downtime loop, and giving the two the same trigger is what
			// makes "walk back to a fire" a single errand.
			//
			// ⚑ Exactly-at-threshold, like the bind: standing at a fire
			// refills once per ENTRY, so spending charges without ever
			// leaving the dwell radius does not re-refill until you step out
			// and back in. Accepted (§6a) — the loop never does that.
			//
			// ⚑ L3 rides on s.campfires being the boot-frozen authored slice:
			// a player-placed camp is a spawned mob that never enters it, so
			// it can neither bind nor refill. Structural, and pinned in both
			// directions by test because that is exactly the kind of
			// invariant that erodes.
			p.RefillCampCharges()
			// …and discovers the fire (plan-world-map.md C2, absorbing
			// plan-flight-paths.md C1 / D4). A fourth consequence of the one
			// act, on the SAME firing rather than beside it: a discovery
			// threshold of its own is exactly how the consequences of "rest at
			// a fire" would drift apart. L3 above covers this too — a
			// player-placed mini-camp is never in s.campfires, so it can no
			// more become a map marker than it can become a spawn point.
			s.discoveredFor(p.Client().UUID()).add(nearID)
			s.publishCampfireState(p)
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
			s.stashByToken[token] = reconnectStash{
				name:           dead.name,
				progression:    dead.progression,
				skills:         dead.skills,
				quests:         dead.quests,
				position:       dead.corpse.Position(),
				anchor:         s.anchors[client],
				discovered:     s.discovered[client],
				dead:           true,
				disconnectTick: s.game.Ticks(),
				accountID:      s.accountByClient[client],
				characterID:    s.characterByClient[client],
			}
			delete(s.tokenByClient, client)
		} else {
			s.names.remove(dead.name)
		}
		// The dead player's socket is gone for real this time: the account's
		// session goes back to stashed and the connection's identity bindings go
		// with it. handleDeath deliberately put them back when the death itself
		// ran through removeFromPlayers, so this is the only place that undoes
		// them for a dead client.
		if account := s.accountByClient[client]; account != 0 && s.sessions != nil {
			s.sessions.Stash(account)
		}
		delete(s.accountByClient, client)
		delete(s.characterByClient, client)
		s.game.RemoveEntity(dead.corpse.Basic())
		delete(s.deadByClient, client)
		delete(s.anchors, client)
		delete(s.discovered, client)
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

	// §2's disconnect save — the cheap trigger that covers the common case.
	//
	// ⚑ DEATH ROUTES THROUGH HERE TOO, and that is wanted rather than tolerated:
	// handleDeath has already applied LoseCurrentLevelExperience, so this
	// persists the post-death numbers. Saving the pre-death ones would hand a
	// player their lost XP back for the price of a crash.
	s.saveCharacter(p)
	s.forgetSaveWatch(clientUUID)

	// Stash the character for a reconnect instead of freeing it (the name
	// stays reserved while stashed). Death routes through here too — it drops
	// the spurious stash and re-registers the token right after the fan-out
	// returns (see handleDeath). Without a token (defensive): old free path.
	// A disconnect mid-flight resolves the flight immediately
	// (plan-flight-paths.md D12/D14): the stashed position is the
	// DESTINATION — the flight is committed (D11), so arrival is where the
	// character truthfully is next. Reconnect and the session-expiry save
	// both read this one field, so one line covers both.
	position := p.Position()
	if p.Flying() {
		position = p.FlightDest()
	}
	if token, hasToken := s.tokenByClient[clientUUID]; hasToken {
		s.stashByToken[token] = reconnectStash{
			name:           p.Name(),
			progression:    p.Progression(),
			skills:         p.SkillComponent(),
			quests:         p.QuestLedger(),
			health:         p.VitalSigns().Health,
			campCharges:    p.CampCharges(),
			position:       position,
			anchor:         s.anchors[clientUUID],
			discovered:     s.discovered[clientUUID],
			disconnectTick: s.game.Ticks(),
			accountID:      s.accountByClient[clientUUID],
			characterID:    s.characterByClient[clientUUID],
		}
		delete(s.tokenByClient, clientUUID)
	} else {
		s.names.remove(p.Name())
	}

	// The socket is gone but the character is held: the account's slot stays
	// OCCUPIED — a second cold login must still be refused — while becoming
	// resumable by a reconnect. That distinction is the whole of Session.Stashed.
	if account := s.accountByClient[clientUUID]; account != 0 && s.sessions != nil {
		s.sessions.Stash(account)
	}
	delete(s.accountByClient, clientUUID)
	delete(s.characterByClient, clientUUID)
	delete(s.anchors, clientUUID)
	delete(s.discovered, clientUUID)
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
