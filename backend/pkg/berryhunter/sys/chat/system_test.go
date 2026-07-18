package chat

import (
	"testing"

	flatbuffers "github.com/google/flatbuffers/go"
	"github.com/trichner/berryhunter/pkg/api/BerryhunterApi"
	"github.com/trichner/berryhunter/pkg/berryhunter/model"
)

// bcastClient captures wire bytes; only SendMessage is expected — every other
// model.Client method panics via the embedded nil interface.
type bcastClient struct {
	model.Client
	sent [][]byte
}

func (c *bcastClient) SendMessage(b []byte) error {
	c.sent = append(c.sent, b)
	return nil
}

// bcastPlayer satisfies model.PlayerEntity for Broadcast, which only touches
// Client(); anything else panics via the embedded nil interface.
type bcastPlayer struct {
	model.PlayerEntity
	client *bcastClient
}

func (p *bcastPlayer) Client() model.Client { return p.client }

// decodeEntityMessage unwraps a ServerMessage envelope into (entityId, text),
// failing the test on any other body type.
func decodeEntityMessage(t *testing.T, b []byte) (uint64, string) {
	t.Helper()
	msg := BerryhunterApi.GetRootAsServerMessage(b, 0)
	if msg.BodyType() != BerryhunterApi.ServerMessageBodyEntityMessage {
		t.Fatalf("body type = %d, want EntityMessage", msg.BodyType())
	}
	var table flatbuffers.Table
	if !msg.Body(&table) {
		t.Fatalf("cannot unpack EntityMessage body")
	}
	var em BerryhunterApi.EntityMessage
	em.Init(table.Bytes, table.Pos)
	return em.EntityId(), string(em.Message())
}

func TestBroadcastReachesEveryPlayerAsSystemMessage(t *testing.T) {
	s := New()
	a := &bcastPlayer{client: &bcastClient{}}
	b := &bcastPlayer{client: &bcastClient{}}
	s.AddPlayer(a)
	s.AddPlayer(b)

	s.Broadcast("The Orc Warlord has fallen!")

	for i, p := range []*bcastPlayer{a, b} {
		if len(p.client.sent) != 1 {
			t.Fatalf("player %d received %d messages, want 1", i, len(p.client.sent))
		}
		id, text := decodeEntityMessage(t, p.client.sent[0])
		if id != SystemEntityID {
			t.Errorf("player %d entityId = %d, want %d (system)", i, id, SystemEntityID)
		}
		if text != "The Orc Warlord has fallen!" {
			t.Errorf("player %d message = %q", i, text)
		}
	}
}

func TestBroadcastWithNoPlayersIsANoOp(t *testing.T) {
	s := New()
	s.Broadcast("into the void") // must not panic
}
