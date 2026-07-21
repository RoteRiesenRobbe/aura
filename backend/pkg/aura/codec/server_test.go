package codec

import (
	"testing"

	flatbuffers "github.com/google/flatbuffers/go"
	"github.com/stretchr/testify/assert"
	"github.com/RoteRiesenRobbe/aura/pkg/api/AuraApi"
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
}
