package core

import (
	"log"
	"log/slog"

	"github.com/EngoEngine/ecs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/codec"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/constant"
	"github.com/google/flatbuffers/go"
	"github.com/google/uuid"
)

type NetSystem struct {
	entities   []model.Entity
	players    []model.PlayerEntity
	spectators []model.Spectator
	game       *game

	// ownerState is what the owner-only "slow" block and the conversation tree
	// were last SENT against, per live connection (plan-server-performance.md
	// chunk 3). Lazily allocated so a NetSystem built by struct literal (the
	// roster tests) does not need to know about it.
	ownerState map[uuid.UUID]ownerStateWatch
}

// ownerStateHeartbeatTicks is how often the owner-only block and the
// conversation tree get force-resent even without a revision change (chunk 3,
// D2): a missed invalidation then self-heals within seconds instead of
// persisting for the rest of the session. ~5s [PLACEHOLDER].
const ownerStateHeartbeatTicks = uint64(5 * constant.TicksPerSecond)

// ownerStateWatch is what the last owner-state send for one live connection
// was taken against — the sys.saveWatch shape and reasoning, applied to the
// wire instead of to persistence. A change in level, skillRev or questRev
// forces an immediate resend of the owner-only block; a change in
// conversingWith additionally forces the conversation tree, since a freshly
// opened conversation needs its tree even when no revision moved. nextForce is
// the heartbeat baseline underneath all of that.
type ownerStateWatch struct {
	level          uint32
	skillRev       uint64
	questRev       uint64
	conversingWith uint64
	nextForce      uint64
}

// ownerStateGate decides whether p's owner-only block and conversation tree
// need building this tick, and commits the watch forward when they do. A
// previously unseen connection (join, respawn, reconnect — reconnect always
// mints a fresh Client with a fresh UUID, so it lands here too) always sends
// both: this is what satisfies chunk 3's L2 (a new viewer must start dirty)
// without any extra bookkeeping at the join sites.
func (n *NetSystem) ownerStateGate(p model.PlayerEntity) (sendOwner, sendConvTree bool) {
	if n.ownerState == nil {
		n.ownerState = make(map[uuid.UUID]ownerStateWatch)
	}
	now := n.game.Tick
	clientUUID := p.Client().UUID()
	current := ownerStateWatch{
		level:    p.Progression().Level,
		skillRev: p.SkillComponent().Revision(),
		// ⚑ DisplayRevision, not Revision: the save-side counter deliberately
		// ignores objective-counter progress (a database write per credited
		// kill), but the JOURNAL has to show "3/8 slain" ticking over the
		// moment the kill lands. Watching the save counter here left the
		// tracker stale for up to the heartbeat.
		questRev:       p.QuestLedger().DisplayRevision(),
		conversingWith: p.ConversingWith(),
	}

	watch, known := n.ownerState[clientUUID]
	if !known {
		current.nextForce = now + ownerStateHeartbeatTicks
		n.ownerState[clientUUID] = current
		return true, true
	}

	heartbeatDue := now >= watch.nextForce
	sendOwner = heartbeatDue ||
		current.level != watch.level ||
		current.skillRev != watch.skillRev ||
		current.questRev != watch.questRev
	sendConvTree = sendOwner || current.conversingWith != watch.conversingWith

	if sendOwner || sendConvTree {
		// nextForce is the OWNER-BLOCK heartbeat only. A conversation opening
		// on its own (sendConvTree true, sendOwner false — no spellbook/quest
		// change) must not push the owner-block safety net back, or a player
		// who keeps opening conversations could starve it indefinitely.
		if sendOwner {
			current.nextForce = now + ownerStateHeartbeatTicks
		} else {
			current.nextForce = watch.nextForce
		}
		n.ownerState[clientUUID] = current
	}
	return sendOwner, sendConvTree
}

// forgetOwnerState drops a client's owner-state bookkeeping. Called wherever
// the connection's world presence ends, mirroring sys.forgetSaveWatch.
func (n *NetSystem) forgetOwnerState(clientUUID uuid.UUID) {
	delete(n.ownerState, clientUUID)
}

func NewNetSystem(g *game) *NetSystem {
	// TODO configure path/ports here
	return &NetSystem{game: g}
}

func (n *NetSystem) Priority() int {
	return -100
}

func (n *NetSystem) New(w *ecs.World) {
	log.Println("NetSystem nominal")
}

func (n *NetSystem) AddEntity(e model.Entity) {
	n.entities = append(n.entities, e)
}

func (n *NetSystem) AddPlayer(p model.PlayerEntity) {
	n.AddEntity(p)
	n.players = append(n.players, p)
}

func (n *NetSystem) AddSpectator(s model.Spectator) {
	n.spectators = append(n.spectators, s)
}

// rosterIntervalTicks is how often the map's player roster goes out: ~1 Hz
// (plan-world-map.md D7). [PLACEHOLDER]
//
// ⚑ The accepted, visible cost of 1 Hz: another player's dot STEPS once a
// second while your own dot — which comes from the 30 Hz AOI stream, not from
// here — glides. That asymmetry is deliberate and is not a bug report waiting
// to happen only because it is written down: interpolating roster dots is a
// whole moving-average of its own for a marker a few pixels across, and YAGNI
// says not until someone actually minds.
const rosterIntervalTicks = uint64(constant.TicksPerSecond)

func (n *NetSystem) Update(dt float32) {
	// assemble game state prototype
	characterGameState := codec.CharacterGameState{}
	characterGameState.Tick = n.game.Tick

	// process players
	for _, player := range n.players {
		n.playerSendState(player, characterGameState)
	}

	// assemble game state prototype
	spectatorGameState := codec.SpectatorGameState{}
	spectatorGameState.Tick = n.game.Tick

	// process players
	for _, spectator := range n.spectators {
		n.spectatorSendState(spectator, spectatorGameState)
	}

	if n.game.Tick%rosterIntervalTicks == 0 {
		n.sendRoster()
	}
}

// sendRoster publishes the map's player roster to every player.
//
// ⚑ ONE ASSEMBLY, ONE MARSHAL, THE SAME BYTES TO EVERYONE — the whole reason
// §4.3 specified a single assembly point. Per-viewer assembly would cost a
// marshal per player for a message every player gets identically.
//
// ⚑ The second reason this comment used to give — "so part 2's
// flyer-invisibility filter cannot be forgotten in one of two places" — is
// SPENT: there is no such filter. The PO ruled flyers stay on the map (D16,
// plan-flight-paths.md C4), so the single assembly now stands on the first
// reason alone. It also means the roster CANNOT vary per viewer: everyone gets
// the same bytes, so a flyer is visible to all or to none, which is exactly
// what makes "flyers cannot see each other in the world, but can on the map"
// consistent rather than accidental.
//
// Spectators are deliberately skipped: a client on the start screen or the
// death overlay has no map open, and the roster is for the map.
//
// ⚑ A failed send is ignored here rather than disconnecting. The 30 Hz
// GameState send above already runs its own error path over the same sockets
// every tick, so a dead socket is detected there within 33 ms — reacting to it
// twice would mean removing an entity while iterating the slice a caller above
// is also iterating.
func (n *NetSystem) sendRoster() {
	if len(n.players) == 0 {
		return
	}

	roster := codec.RosterFor(n.game.Tick, n.players)

	builder := flatbuffers.NewBuilder(64)
	builder.Finish(codec.PlayerRosterMessageFlatbufMarshal(builder, &roster))
	payload := builder.FinishedBytes()

	for _, player := range n.players {
		_ = player.Client().SendMessage(payload)
	}
}

func (n *NetSystem) playerSendState(p model.PlayerEntity, gs codec.CharacterGameState) {
	var entities []model.Entity

	// find all entities in view
	for c := range p.Viewport().Collisions() {
		userData := c.Shape().UserData
		if userData != nil {
			entities = append(entities, userData.(model.Entity))
		}
	}

	// copy gameStatePrototype
	gs.Entities = entities
	gs.Player = p

	// Owner-only block + conversation tree (plan-server-performance.md chunk
	// 3): built and sent only when something in them actually moved since the
	// last tick they were sent, plus a heartbeat safety net.
	sendOwner, sendConvTree := n.ownerStateGate(p)
	gs.SkipOwnerState = !sendOwner
	gs.SkipConversationTree = !sendConvTree

	// marshal and send state
	builder := flatbuffers.NewBuilder(64)
	msg := codec.CharacterGameStateMessageMarshalFlatbuf(builder, &gs)
	builder.Finish(msg)

	err := p.Client().SendMessage(builder.FinishedBytes())
	if err != nil {
		slog.Error("👢 Disconnect player",
			slog.Bool("spectator", false),
			slog.String("uuid", p.Client().UUID().String()),
			slog.Any("error", err),
		)
		n.game.RemoveEntity(p.Basic())
	}
}

func (n *NetSystem) spectatorSendState(s model.Spectator, gs codec.SpectatorGameState) {
	var entities []model.Entity

	// find all entities in view
	for c := range s.Viewport().Collisions() {
		userData := c.Shape().UserData
		if userData != nil {
			entities = append(entities, userData.(model.Entity))
		}
	}

	// copy gameStatePrototype
	gs.Entities = entities
	gs.Spectator = s

	// marshal and send state
	builder := flatbuffers.NewBuilder(64)
	msg := codec.SpectatorGameStateMessageMarshalFlatbuf(builder, &gs)
	builder.Finish(msg)

	err := s.Client().SendMessage(builder.FinishedBytes())
	if err != nil {
		slog.Error("👢 Disconnect player",
			slog.Bool("spectator", true),
			slog.String("uuid", s.Client().UUID().String()),
			slog.Any("error", err),
		)
		n.game.RemoveEntity(s.Basic())
	}
}

func (n *NetSystem) Remove(b ecs.BasicEntity) {
	var d int

	// delete from entitites
	d = -1
	for index, entity := range n.entities {
		if entity.Basic().ID() == b.ID() {
			d = index
			break
		}
	}
	if d >= 0 {
		n.entities = append(n.entities[:d], n.entities[d+1:]...)
	}

	// delete from players
	d = -1
	for index, entity := range n.players {
		if entity.Basic().ID() == b.ID() {
			d = index
			break
		}
	}
	if d >= 0 {
		// Drop the owner-state watch (chunk 3) before the slice removal, while
		// the client is still reachable — mirrors sys.forgetSaveWatch. Left
		// behind, it would grow the map forever and, on the same UUID being
		// reused, is not actually possible (each connection mints its own), but
		// tidying it up is cheap and avoids a slow leak either way.
		n.forgetOwnerState(n.players[d].Client().UUID())
		n.players = append(n.players[:d], n.players[d+1:]...)
	}

	// delete from spectators
	d = -1
	for index, entity := range n.spectators {
		if entity.Basic().ID() == b.ID() {
			d = index
			break
		}
	}
	if d >= 0 {
		n.spectators = append(n.spectators[:d], n.spectators[d+1:]...)
	}
}
