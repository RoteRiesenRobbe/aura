package core

import (
	"log"
	"log/slog"

	"github.com/EngoEngine/ecs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/codec"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/constant"
	"github.com/google/flatbuffers/go"
)

type NetSystem struct {
	entities   []model.Entity
	players    []model.PlayerEntity
	spectators []model.Spectator
	game       *game
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
// marshal per player for a message every player gets identically, and, more
// importantly, it would give part 2's flyer-invisibility filter a second place
// to be forgotten (plan-flight-paths.md L: "the roster is a *second* leak path
// for the same fact — one filter is not enough, and they are in different
// files"). When flight ships, the filter goes in codec.RosterFor and nowhere
// else.
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
