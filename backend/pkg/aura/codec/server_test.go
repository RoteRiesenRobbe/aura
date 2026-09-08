package codec

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/api/AuraApi"
	flatbuffers "github.com/google/flatbuffers/go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
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
		ZoneNames:          []string{"scaffold", "underworld"},
	}

	b := flatbuffers.NewBuilder(64)
	// Marshal wraps the Welcome in a ServerMessage; unwrap it to read the table.
	msg := WelcomeMessageFlatbufMarshal(b, w)
	b.Finish(msg)

	sm := AuraApi.GetRootAsServerMessage(b.FinishedBytes(), 0)
	assert.Equal(t, AuraApi.ServerMessageBodyWelcome, sm.BodyType())

	var tbl flatbuffers.Table
	// Named "ok", not "require": the old name shadowed the require PACKAGE, so
	// any later require.X in this function stopped compiling.
	ok := sm.Body(&tbl)
	assert.True(t, ok)

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

	// The loaded zone set (plan-underworld.md U2). ORDER IS MEANING here —
	// primary first — and a flatbuffers vector is built back to front, so the
	// encoder reverses its offsets; reading them back in order is what pins
	// that it got the reversal right rather than shipping a mirrored list.
	require.EqualValues(t, 2, welcome.ZoneNamesLength())
	assert.Equal(t, "scaffold", string(welcome.ZoneNames(0)), "primary zone comes first")
	assert.Equal(t, "underworld", string(welcome.ZoneNames(1)))
}

// A Welcome that names no zone set at all — every pre-U2 caller — still encodes
// and still reads back as an empty vector rather than a decode failure.
func TestWelcomeMarshalFlatbuf_ZoneNamesMayBeEmpty(t *testing.T) {
	b := flatbuffers.NewBuilder(64)
	b.Finish(WelcomeMessageFlatbufMarshal(b, &Welcome{ServerName: "s", ZoneName: "world"}))

	sm := AuraApi.GetRootAsServerMessage(b.FinishedBytes(), 0)
	var tbl flatbuffers.Table
	require.True(t, sm.Body(&tbl))
	var welcome AuraApi.Welcome
	welcome.Init(tbl.Bytes, tbl.Pos)

	assert.Equal(t, "world", string(welcome.ZoneName()))
	assert.EqualValues(t, 0, welcome.ZoneNamesLength())
}
