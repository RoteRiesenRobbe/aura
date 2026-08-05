package core

import (
	"testing"

	"github.com/EngoEngine/ecs"
	flatbuffers "github.com/google/flatbuffers/go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/api/AuraApi"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/codec"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/constant"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
)

// The map's player roster (plan-world-map.md C3, §4.3 / D7): every live player
// character in the zone, published to everyone at ~1 Hz.
//
// What these pin is the property the design rests on — ONE assembly, ONE
// marshal, the SAME bytes to every client. ⚑ Part 1 justified that partly as
// "so part 2's flyer-invisibility filter has exactly one place to live"; C4
// ruled there is NO such filter (D16 — see roster_flight_test.go), so the
// property now stands on its own: one marshal for a message every viewer
// receives identically, and a roster that therefore cannot vary per viewer.
//
// ⚑ The dead and spectators are NOT filtered by the roster code and so are not
// tested for here. NetSystem.players holds joined, living characters only — a
// spectator is on a separate slice and death removes the player entity — and
// sys/playercount_test.go already pins both exclusions against every join,
// death and disconnect flow, over the same membership rule.

// rosterPlayer is a model.PlayerEntity that answers only the two questions the
// roster asks. Embedding the interface rather than implementing its ~40 methods
// is deliberate: anything the roster reaches for beyond id/position/client
// panics loudly instead of silently returning a zero value.
type rosterPlayer struct {
	model.PlayerEntity
	basic  ecs.BasicEntity
	pos    phy.Vec2f
	client *rosterClient
	flying bool
}

func (p *rosterPlayer) Basic() ecs.BasicEntity { return p.basic }
func (p *rosterPlayer) Position() phy.Vec2f    { return p.pos }
func (p *rosterPlayer) Client() model.Client   { return p.client }

// Flying is answered — rather than left to the embedded nil — so that
// roster_flight_test.go's D16 pin asserts a fact instead of catching a panic.
// The roster does not ask this question today, and D16 says it never should.
func (p *rosterPlayer) Flying() bool { return p.flying }

// rosterClient records what was sent to it, same embedding trick.
type rosterClient struct {
	model.Client
	sent [][]byte
}

func (c *rosterClient) SendMessage(msg []byte) error {
	c.sent = append(c.sent, msg)
	return nil
}

func newRosterPlayer(x, y float32) *rosterPlayer {
	return &rosterPlayer{
		basic:  ecs.NewBasic(),
		pos:    phy.Vec2f{X: x, Y: y},
		client: &rosterClient{},
	}
}

func TestRoster_IsOneMessageSharedByEveryPlayer(t *testing.T) {
	ana := newRosterPlayer(2, -3)
	bo := newRosterPlayer(-10, 0.5)

	n := &NetSystem{game: &game{Tick: 90}}
	n.players = []model.PlayerEntity{ana, bo}

	n.sendRoster()

	require.Len(t, ana.client.sent, 1, "every player gets the roster")
	require.Len(t, bo.client.sent, 1)
	// ⚑ The same backing array, not merely equal contents: assembled once,
	// marshalled once. An assertion on equality alone would pass for a
	// per-viewer build and lose the property the design depends on.
	assert.Same(t, &ana.client.sent[0][0], &bo.client.sent[0][0],
		"one marshal, the same bytes to everyone")

	roster := rosterFrom(t, ana.client.sent[0])
	assert.Equal(t, uint64(90), roster.Tick())
	require.Equal(t, 2, roster.EntriesLength())

	entry := &AuraApi.RosterEntry{}
	require.True(t, roster.Entries(entry, 0))
	assert.Equal(t, ana.basic.ID(), entry.Id(), "entries carry the entity id GameState uses")
	// ⚑ Client px space, exactly like Character.pos — the space Welcome's
	// map_width and the client's getX()/getY() share. A roster in world units
	// would place every dot at 1/120 of its distance from the origin, which
	// looks like a clustering bug rather than a unit bug.
	assert.InDelta(t, 2*codec.Points2px, entry.Pos(nil).X(), 0.01)
	assert.InDelta(t, -3*codec.Points2px, entry.Pos(nil).Y(), 0.01)

	require.True(t, roster.Entries(entry, 1))
	assert.Equal(t, bo.basic.ID(), entry.Id())
	assert.InDelta(t, -10*codec.Points2px, entry.Pos(nil).X(), 0.01)
}

func TestRoster_DropsAPlayerWhoLeft(t *testing.T) {
	ana := newRosterPlayer(1, 1)
	bo := newRosterPlayer(2, 2)

	n := &NetSystem{game: &game{Tick: 30}}
	n.players = []model.PlayerEntity{ana, bo}
	n.sendRoster()

	// Bo disconnects: the removal fan-out takes him off the players slice.
	n.Remove(bo.basic)
	n.sendRoster()

	require.Len(t, ana.client.sent, 2)
	// The whole roster every time, so a departure needs no removal signal —
	// absence IS the signal, and the client drops the dot.
	assert.Equal(t, 1, rosterFrom(t, ana.client.sent[1]).EntriesLength(),
		"a player who left is simply absent from the next roster")
}

func TestRoster_EmptyServerSendsNothing(t *testing.T) {
	n := &NetSystem{game: &game{Tick: 30}}
	// Nobody to assemble and nobody to send to; the guard exists so an idle
	// server allocates no builder once a second (the *_alloc_test.go pins).
	n.sendRoster()
}

func TestRosterInterval_IsOneHertz(t *testing.T) {
	// D7 is "~1 Hz", expressed against the tick rate rather than a bare 30 so
	// a change to TicksPerSecond cannot silently turn it into 2 Hz.
	assert.Equal(t, uint64(constant.TicksPerSecond), rosterIntervalTicks)
}

func rosterFrom(t *testing.T, payload []byte) *AuraApi.PlayerRoster {
	t.Helper()
	msg := AuraApi.GetRootAsServerMessage(payload, 0)
	require.Equal(t, AuraApi.ServerMessageBodyPlayerRoster, msg.BodyType())

	body := new(flatbuffers.Table)
	require.True(t, msg.Body(body))
	roster := &AuraApi.PlayerRoster{}
	roster.Init(body.Bytes, body.Pos)
	return roster
}
