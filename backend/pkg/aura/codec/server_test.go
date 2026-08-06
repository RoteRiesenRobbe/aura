package codec

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/api/AuraApi"
	flatbuffers "github.com/google/flatbuffers/go"
	"github.com/stretchr/testify/assert"
)

// TestWelcomeMarshalFlatbuf_RoundTrip pins that the Welcome message — including
// the zone_name added in world foundation chunk 6 — survives the wire encode so
// the client can render the matching zone terrain.
func TestWelcomeMarshalFlatbuf_RoundTrip(t *testing.T) {
	w := &Welcome{
		ServerName:         "test-server",
		Width:              7200,
		Height:             4800,
		TotalDayCycleTicks: 18000,
		DayTimeTicks:       12000,
		ZoneName:           "scaffold",
		GrayBase:           5,
		GrayStep:           6,
	}

	b := flatbuffers.NewBuilder(64)
	// Marshal wraps the Welcome in a ServerMessage; unwrap it to read the table.
	msg := WelcomeMessageFlatbufMarshal(b, w)
	b.Finish(msg)

	sm := AuraApi.GetRootAsServerMessage(b.FinishedBytes(), 0)
	assert.Equal(t, AuraApi.ServerMessageBodyWelcome, sm.BodyType())

	var tbl flatbuffers.Table
	require := sm.Body(&tbl)
	assert.True(t, require)

	var welcome AuraApi.Welcome
	welcome.Init(tbl.Bytes, tbl.Pos)

	assert.Equal(t, "test-server", string(welcome.ServerName()))
	assert.EqualValues(t, 7200, welcome.MapWidth())
	assert.EqualValues(t, 4800, welcome.MapHeight())
	assert.EqualValues(t, 18000, welcome.TotalDaycycleTicks())
	assert.EqualValues(t, 12000, welcome.DayTimeTicks())
	assert.Equal(t, "scaffold", string(welcome.ZoneName()))
	// The gray knobs (plan-world-replacement.md C0). This is the encoder's own
	// contract only — that these carry the NORMALIZED economy rather than the
	// raw conf block is asserted where the real Welcome is built,
	// core/welcome_test.go.
	assert.EqualValues(t, 5, welcome.GrayBase())
	assert.EqualValues(t, 6, welcome.GrayStep())
}
