package core

import (
	"fmt"
	"log/slog"
	"math/rand"
	"net/http"
	"runtime/debug"
	"sync/atomic"
	"time"

	"github.com/EngoEngine/ecs"
	flatbuffers "github.com/google/flatbuffers/go"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/cfg"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/codec"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/encounter"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/client"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/constant"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/mob"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/spectator"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/net"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/persist"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/quests"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/sys"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/sys/chat"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/sys/cmd"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/sys/equip"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/sys/statuseffects"
)

type entitiesMap map[uint64]model.BasicEntity

type game struct {
	ecs.World
	Tick          uint64
	config        *cfg.GameConfig
	mobRegistry   mobs.Registry
	skillRegistry skills.Registry
	questRegistry quests.Registry

	entities entitiesMap

	encounters *encounter.System
	connState  *sys.ConnectionStateSystem

	// graveyard is the memorial's roster, installed post-construction by
	// cmd/aurad (plan-ascension.md C3 step 5). nil until then, and nil forever in
	// a build with no database, which is a supported world.
	graveyard sys.GraveyardNames

	welcomeMsg []byte

	joinQueue chan model.Client

	boundsWidth  float32
	boundsHeight float32
}

// assert game implements its interface
var _ = model.Game(&game{})

func NewGameWith(seed int64, conf ...Configuration) (model.Game, error) {
	gc := &cfg.GameConfig{
		// [PLACEHOLDER] rectangular world size fallback; the authored zone's
		// bounds override this via core.Bounds. Tuned in-game.
		Bounds: cfg.Bounds{Width: 60, Height: 40},
		Tokens: []string{},
	}

	for _, c := range conf {
		err := c(gc)
		if err != nil {
			return nil, err
		}
	}
	slog.Debug("new game with config", slog.Any("configuration", gc))

	g := &game{
		entities:      make(entitiesMap),
		joinQueue:     make(chan model.Client, 16),
		mobRegistry:   gc.MobRegistry,
		skillRegistry: gc.SkillRegistry,
		questRegistry: gc.QuestRegistry,
		boundsWidth:   gc.Bounds.Width,
		boundsHeight:  gc.Bounds.Height,
		config:        gc,
	}

	// Prepare welcome message. Its static anyways.
	msg := &codec.Welcome{
		ServerName:         "Aura [Alpha] rza, n1b, xyckno & co.",
		Width:              gc.Bounds.Width * codec.Points2px,
		Height:             gc.Bounds.Height * codec.Points2px,
		TotalDayCycleTicks: g.config.TotalDayCycleSeconds * constant.TicksPerSecond,
		DayTimeTicks:       g.config.DayTimeSeconds * constant.TicksPerSecond,
		ZoneName:           gc.ZoneName,
		// The gray knobs come from the NORMALIZED economy, never from the conf
		// block (plan-world-replacement.md C0). mob.SetKillXP falls each
		// non-positive field back to the built-in default, so a conf that omits
		// them — the live server's does — pays 5/6 while the raw block reads
		// 0/0; shipping the raw pair would hand the client ZD = 0 and tint
		// every mob below its level gray against a server still paying them.
		// One source of truth for the number, on both sides of the wire.
		//
		// ⚑ Reads a value SetKillXP must already have installed: this message
		// is marshalled once, here. See welcome_test.go.
		GrayBase: int32(mob.KillXPConfig().GrayBase),
		GrayStep: int32(mob.KillXPConfig().GrayStep),
	}
	builder := flatbuffers.NewBuilder(32)
	welcomeMsg := codec.WelcomeMessageFlatbufMarshal(builder, msg)
	builder.Finish(welcomeMsg)
	g.welcomeMsg = builder.FinishedBytes()

	//---- create rnd to generate deterministic seeds for systems
	rnd := rand.New(rand.NewSource(seed))

	//---- setup systems
	p := sys.NewPhysicsSystem()
	g.AddSystem(p)

	wall := phy.NewInvAABB(phy.VEC2F_ZERO, gc.Bounds.Width, gc.Bounds.Height)
	wall.Shape().Layer = int(model.LayerBorderCollision)
	p.AddStaticBody(ecs.NewBasic(), wall)

	n := NewNetSystem(g)
	g.AddSystem(n)

	i := NewInputSystem(g)
	g.AddSystem(i)

	m := sys.NewMobSystem(g, rnd.Int63(), gc.Spawns, p.Space())
	g.AddSystem(m)

	// Conversations (plan-entity-model.md chunk 3a): actors carrying an
	// interaction block, registered through the ordinary mob path.
	interactionSys := sys.NewInteractionSystem()
	// The ascension stone's reward list is GENERATED per player, so it cannot be
	// authored in the mob's node tree (plan-ascension.md §4.2, P10). Wired here
	// because the catalog is content the game assembles, and the system is built
	// before it. ⚑ Forgetting this call shows an empty stone and fails no Go
	// test: the harness leg that asserts rows appear is what catches it.
	ascensionSource := sys.NewAscensionRows(gc.AscensionCatalog)
	interactionSys.AddRowSource(mobs.RowSourceAscensionCatalog, ascensionSource)
	// The memorial's names, the hook's SECOND consumer (C3 step 6, P10/P22). It
	// takes a READER rather than a listing: the graveyard seam is installed
	// post-construction by cmd/aurad and re-read on a timer, so a source handed a
	// value here would show an empty stone for the life of the process.
	interactionSys.AddRowSource(mobs.RowSourceMemorialNames,
		sys.NewMemorialRows(g.Graveyard))
	g.AddSystem(interactionSys)

	// The journal's one upstream verb (plan-quests.md chunk C3, D13): abandon.
	// Its own system because the journal is not a conversation — no actor, no
	// range, no session, just a player acting on their own ledger.
	g.AddSystem(sys.NewQuestSystem())

	// Chat is constructed before the encounter + command systems so both can
	// take it as their Announcer (server-wide system messages, content pass C6).
	chatSys := chat.New()
	g.AddSystem(chatSys)

	enc := encounter.NewSystem(g, p.Space())
	enc.SetAnnouncer(chatSys)
	g.AddSystem(enc)
	g.encounters = enc

	pl := sys.NewUpdateSystem()
	g.AddSystem(pl)

	sk := sys.NewSkillSystem(p.Space(), g)
	g.AddSystem(sk)

	se := statuseffects.NewStatusEffectsSystem()
	g.AddSystem(se)

	s := sys.NewConnectionStateSystem(g)
	g.AddSystem(s)
	g.connState = s
	// Recall's anchor seam (plan-skill-vocab chunk 4): the SkillSystem is
	// constructed before the ConnectionStateSystem, so the reference is wired
	// post-construction (the CampfireAnchorSink precedent).
	sk.SetConnState(s)
	// The travel_to grant's destination lookup (plan-portal-spells.md D3): a
	// portal delivers to its OWNER's bound campfire, resolved when the row is
	// taken. Same seam, same construction-order reason, narrower interface.
	// ⚑ Forgetting this call renders every portal row locked and fails no Go
	// test - the system supports a nil seam on purpose.
	interactionSys.SetAnchors(s)
	// The ceremony's completion check reads the SAME catalog object the panel
	// renders (C2a step 5), so what the stone offered and what the channel will
	// accept cannot drift apart.
	sk.SetAscensionSource(ascensionSource)
	// The flight machine's seams (plan-flight-paths.md C2): validation
	// answers from ConnState, takeoff leaves the physics space and sweeps
	// the mobs' latches. Wired here for the same construction-order reason.
	i.SetFlightSeams(s, p.Space(), m)
	// Mob dormancy's wake sources (plan-world-scale.md S3/D4). Same seam shape,
	// same construction-order reason as the three above.
	//
	// ⚑ THIS CALL IS THE ON-SWITCH. MobSystem runs every mob every tick while
	// the seam is nil, which is exactly what the sim harness and the unit tests
	// want (L6 — the sim battery must stay byte-identical). Deleting this line
	// silently restores the pre-S3 cost rather than failing anything.
	m.SetWakeSources(s)

	c := cmd.NewCommandSystem(g, gc.Tokens, p.Space(), chatSys)
	g.AddSystem(c)

	eq := equip.NewEquipSystem(g)
	g.AddSystem(eq)

	g.printSystems()
	return g, nil
}

func (g *game) Ticks() uint64 {
	return g.Tick
}

// RegisterEncounter satisfies encounter.Registrar — encounters are wired
// post-construction by aurad (they cannot ride cfg.GameConfig, see
// the Registrar doc).
func (g *game) RegisterEncounter(e encounter.Encounter) {
	g.encounters.Register(e)
}

// SetCampfireAnchors satisfies sys.CampfireAnchorSink: cmd/aurad hands
// the placed world campfires to the respawn tracker (chunk 4).
func (g *game) SetCampfireAnchors(campfires []sys.CampfireAnchor) {
	g.connState.SetCampfireAnchors(campfires)
}

// PlayerCount is the number of joined characters in the world, for cmd/aurad's
// GET /players endpoint. Safe to call off the game-loop goroutine — the
// ConnectionStateSystem publishes it atomically once per tick.
func (g *game) PlayerCount() int {
	return g.connState.PlayerCount()
}

// SetIdentity gives the join path its play-ticket store and session registry
// (step 8a chunk 3). Both are the SAME instances the accounts HTTP server
// holds — a ticket minted by /select is redeemed here, and the account slot
// /select checks is the one Join claims.
func (g *game) SetIdentity(tickets sys.PlayTickets, sessions sys.AccountSessions) {
	g.connState.SetIdentity(tickets, sessions)
}

// EndSessionFor ends an account's live world session, for the logout endpoint.
//
// ⚑ Safe to call from a net/http goroutine: it only queues the request, and the
// game loop performs the disconnect.
func (g *game) EndSessionFor(accountID int64) {
	g.connState.EndSessionFor(accountID)
}

// ⚑ THE SEAMS cmd/aurad TYPE-ASSERTS, PINNED AT COMPILE TIME. Every one of them
// is checked at RUNTIME over there (`g.(sys.PersistenceSink)`, panicking with
// "game does not accept a … seam"), so adding a method to one of these
// interfaces without implementing it here builds green and dies at boot. These
// three lines turn that into a build failure — found while adding the ascension
// seam, which would otherwise have been exactly that bug.
var (
	_ sys.PersistenceSink    = (*game)(nil)
	_ sys.IdentitySink       = (*game)(nil)
	_ sys.CampfireAnchorSink = (*game)(nil)
)

// SetCharacterSaves gives the save triggers somewhere to queue snapshots
// (step 8a chunk 4). Satisfies sys.PersistenceSink together with the flush
// below, following the SetCampfireAnchors precedent: the interface lives in
// sys, the game forwards, and cmd/aurad type-asserts.
func (g *game) SetCharacterSaves(saves sys.CharacterSaves) {
	g.connState.SetCharacterSaves(saves)
}

// SetCharacterAscensions gives the sacrifice request somewhere to go
// (plan-ascension.md C1). Same seam, same reasoning as the saves above.
func (g *game) SetCharacterAscensions(ascensions sys.CharacterAscensions) {
	g.connState.SetCharacterAscensions(ascensions)
}

// SetGraveyardNames installs the memorial's roster (plan-ascension.md C3 step 5,
// D11). Third seam, same shape as the two above.
//
// ⚑ It is installed POST-CONSTRUCTION like its siblings, which is why the
// memorial's row source reads it through the game rather than being handed a
// listing at build time: the world is constructed before anything that talks SQL
// exists, and a row source holding a nil snapshot forever is exactly the bug
// this indirection avoids.
func (g *game) SetGraveyardNames(names sys.GraveyardNames) {
	g.graveyard = names
}

// Graveyard is the memorial's current listing, or an empty one when no seam is
// installed.
//
// ⚑ NIL IS A SUPPORTED STATE, exactly as it is for the writer and the ascender:
// every existing test builds a bare game, and a build with no database behind it
// must still run a world: it simply has an empty monument, which is also what a
// world where nobody has ascended looks like.
//
// ⚑ Read on the conversation present path, so it stays one interface call and
// one atomic load underneath.
func (g *game) Graveyard() persist.Graveyard {
	if g.graveyard == nil {
		return persist.Graveyard{}
	}
	return g.graveyard.Latest()
}

// FlushLiveCharacters queues a snapshot of every live character, for the
// graceful-shutdown path.
//
// ⚑ Safe to call from the signal handler's goroutine: it only queues the
// request, and the game loop takes the snapshots.
func (g *game) FlushLiveCharacters(done chan<- struct{}) {
	g.connState.FlushLiveCharacters(done)
}

func (g *game) Bounds() (width, height float32) {
	return g.boundsWidth, g.boundsHeight
}

func (g *game) Mobs() mobs.Registry {
	return g.mobRegistry
}

func (g *game) Skills() skills.Registry {
	return g.skillRegistry
}

func (g *game) Quests() quests.Registry {
	return g.questRegistry
}

func (g *game) Handler(checkOrigin func(*http.Request) bool) http.Handler {
	return net.NewHandleFunc(func(c *net.Client) {
		client := client.NewClient(c)
		g.sendWelcomeMessage(client)

		select {
		case g.joinQueue <- client:
		default:
			slog.Info("😱 Join queue full! Dropping client.", slog.String("uuid", client.UUID().String()))
			client.Close()
		}
	}, checkOrigin)
}

func (g *game) Loop() {
	//---- run game loop
	tickrate := time.Second / constant.TicksPerSecond
	slog.Info("starting game loop", slog.Int("ticks_per_second", constant.TicksPerSecond))

	ticker := time.NewTicker(tickrate)
	for {
		g.update()
		<-ticker.C
	}
}

func (g *game) Config() *cfg.GameConfig {
	return g.config
}

func (g *game) GetEntity(id uint64) (model.BasicEntity, error) {
	e, ok := g.entities[id]
	if !ok {
		return nil, fmt.Errorf("entity with id %d not found", id)
	}
	return e, nil
}

func (g *game) RemoveEntity(e ecs.BasicEntity) {
	delete(g.entities, e.ID())
	g.World.RemoveEntity(e)
}

func (g *game) AddEntity(e model.BasicEntity) {
	g.entities[e.Basic().ID()] = e

	// If you add something here, you might want to edit
	// code.gamestate.EntitiesMarshalFlatbuf as well
	switch v := e.(type) {
	case model.PlayerEntity:
		g.addPlayer(v)
	case model.MobEntity:
		g.addMobEntity(v)
	case model.Spectator:
		g.addSpectator(v)
	case model.CorpseEntity:
		g.addCorpse(v)
	case model.Entity:
		g.addEntity(v)
	}
}

func (g *game) addSpectator(e model.Spectator) {
	// Loop over all Systems
	for _, system := range g.Systems() {
		// Use a type-switch to figure out which System is which
		switch s := system.(type) {

		// Create a case for each System you want to use
		case *sys.PhysicsSystem:
			s.AddEntity(e)
		case *NetSystem:
			s.AddSpectator(e)
		case *sys.ConnectionStateSystem:
			s.AddSpectator(e)
		}
	}
}

func (g *game) addMobEntity(e model.MobEntity) {
	// Loop over all Systems
	for _, system := range g.Systems() {
		// Use a type-switch to figure out which System is which
		switch s := system.(type) {

		// Create a case for each System you want to use
		case *sys.PhysicsSystem:
			s.AddEntity(e)
		case *statuseffects.StatusEffectsSystem:
			s.Add(e, e)
		case *NetSystem:
			s.AddEntity(e)
		case *sys.MobSystem:
			s.AddEntity(e)
		case *sys.SkillSystem:
			s.AddEntity(e)
		case *sys.InteractionSystem:
			// Capability, not type: the system keeps only the actors that
			// carry a conversation and ignores everything else (chunk 3a).
			s.AddEntity(e)
		case *encounter.System:
			s.AddEntity(e)
		}
	}
}

// addCorpse registers a corpse (atmosphere & recovery chunk 4). Same streaming
// as the plain-entity path, but the body goes in as DYNAMIC so the corpse can
// be removed again on respawn/disconnect — PhysicsSystem.Remove panics on
// static bodies.
func (g *game) addCorpse(e model.CorpseEntity) {
	for _, system := range g.Systems() {
		switch s := system.(type) {
		case *sys.PhysicsSystem:
			s.AddEntity(e)
		case *NetSystem:
			s.AddEntity(e)
		}
	}
}

func (g *game) addEntity(e model.Entity) {
	// Loop over all Systems
	for _, system := range g.Systems() {
		// Use a type-switch to figure out which System is which
		switch s := system.(type) {

		// Create a case for each System you want to use
		case *sys.PhysicsSystem:
			s.AddStaticBody(e.Basic(), e.Bodies()[0])
		case *NetSystem:
			s.AddEntity(e)
		}
	}
}

func (g *game) addPlayer(p model.PlayerEntity) {
	// Loop over all Systems
	for _, system := range g.Systems() {
		// Use a type-switch to figure out which System is which
		switch s := system.(type) {
		case *sys.PhysicsSystem:
			s.AddEntity(p)
		case *NetSystem:
			s.AddPlayer(p)
		case *PlayerInputSystem:
			s.AddPlayer(p)
		case *sys.UpdateSystem:
			s.AddUpdateable(p)
		case *statuseffects.StatusEffectsSystem:
			s.Add(p, p)
		case *cmd.CommandSystem:
			s.AddPlayer(p)
		case *chat.ChatSystem:
			s.AddPlayer(p)
		case *sys.ConnectionStateSystem:
			s.AddPlayer(p)
		case *sys.SkillSystem:
			s.AddEntity(p)
		case *equip.EquipSystem:
			s.AddPlayer(p)
		case *sys.InteractionSystem:
			// The mob branch registers conversants; this side registers who
			// can talk TO them, which is every player (chunk 3b-i).
			s.AddPlayer(p)
		case *sys.QuestSystem:
			s.AddPlayer(p)
		}
	}
}

// stepMicros is the tick budget in whole microseconds (1e6/30 = 33333),
// integer so the overload math below stays in integer division.
const stepMicros = 1_000_000 / constant.TicksPerSecond

// maxPanicStacks caps how many full stack traces the loop prints. A system
// that panics deterministically would otherwise emit one 30×/s and bury every
// other log line; past the cap the panic is still counted and logged, just
// without the trace.
const maxPanicStacks = 5

// recoveredPanics counts ticks aborted by a panic in an ECS system. Package
// scope mirrors TickStats — the loop is a singleton and telemetry readers
// (the /tickstats endpoint, tests) want it without a game handle.
var recoveredPanics atomic.Uint64

// RecoveredPanics reports how many ticks have been aborted by a recovered
// panic since process start. Any value above zero means the world is running
// on partially-updated state and wants investigating.
func RecoveredPanics() uint64 { return recoveredPanics.Load() }

// runTick performs the mutating half of a tick — admitting a joiner and
// stepping every ECS system — with a recover so that one bad entity or system
// cannot take the process down and disconnect everyone.
//
// The trade is deliberate and worth stating: recovering ABORTS THE REST OF
// THE TICK, so the world is left partially updated (some systems ran, the
// ones after the fault did not). That is a correctness cost accepted in
// exchange for availability — a transient edge case now costs one degraded
// tick instead of every player's session. It is not a licence to leave panics
// unfixed: RecoveredPanics() is the signal that something needs a real fix.
func (g *game) runTick() {
	defer func() {
		r := recover()
		if r == nil {
			return
		}
		n := recoveredPanics.Add(1)
		attrs := []any{
			slog.Any("panic", r),
			slog.Uint64("tick", atomic.LoadUint64(&g.Tick)),
			slog.Uint64("recovered_total", n),
		}
		if n <= maxPanicStacks {
			attrs = append(attrs, slog.String("stack", string(debug.Stack())))
		}
		slog.Error("recovered panic in game loop — tick aborted, world partially updated", attrs...)
	}()

	// accept at most one player per tick
	select {
	case client := <-g.joinQueue:
		s := spectator.NewSpectator(phy.VEC2F_ZERO, client)
		g.AddEntity(s)
	default:
	}

	g.World.Update(constant.StepMillis)
}

func (g *game) update() {
	// fixed steps of constant.StepMillis
	// monotonic clock — wall time jumps (e.g. WSL2 host-sleep resync) must
	// not register as overload
	before := time.Now()

	g.runTick()

	dt := time.Since(before)
	dtMicros := dt.Microseconds()
	TickStats.record(dtMicros) // load-test instrumentation, see devops/loadtest.md
	if dtMicros > stepMicros {
		fmt.Printf("Overload! Systems at: %d%%\n", overloadPercent(dtMicros))
	}

	// needs to be atomic to prevent race conditions
	atomic.AddUint64(&g.Tick, 1)
}

func overloadPercent(dtMicros int64) int64 {
	// multiply before dividing — integer division first truncates any
	// overload down to 100%
	return dtMicros * 100 / stepMicros
}

func (g *game) sendWelcomeMessage(c model.Client) {
	c.SendMessage(g.welcomeMsg)
}

func (g *game) printSystems() {
	// Systems() returns the world's live slice, already in execution order
	// (descending priority) — must not be sorted or otherwise mutated here,
	// or the tick order itself changes.
	systems := g.World.Systems()

	slog.Debug("enabled systems", slog.Int("count", len(systems)))
	for _, s := range systems {
		p := 0
		if prioritizer, ok := s.(ecs.Prioritizer); ok {
			p = prioritizer.Priority()
		}
		slog.Debug(fmt.Sprintf("%4d %T", p, s))
	}
}
