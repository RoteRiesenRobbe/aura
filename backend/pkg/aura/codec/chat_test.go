package codec

import (
	"testing"

	flatbuffers "github.com/google/flatbuffers/go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/RoteRiesenRobbe/aura/pkg/api/AuraApi"
)

// unwrapEntityMessage pulls the EntityMessage table out of a ServerMessage the
// marshal helper produced.
func unwrapEntityMessage(t *testing.T, buf []byte) *AuraApi.EntityMessage {
	t.Helper()
	sm := AuraApi.GetRootAsServerMessage(buf, 0)
	require.Equal(t, AuraApi.ServerMessageBodyEntityMessage, sm.BodyType())
	var tbl flatbuffers.Table
	require.True(t, sm.Body(&tbl))
	em := &AuraApi.EntityMessage{}
	em.Init(tbl.Bytes, tbl.Pos)
	return em
}

// TestEntityMessage_KindRoundTrip pins that an Unlock-kind message survives the
// wire encode with its skill id (entity_id), source label (message) and kind
// intact — the plumbing the unlock-attribution feature rides on.
func TestEntityMessage_KindRoundTrip(t *testing.T) {
	b := flatbuffers.NewBuilder(64)
	msg := EntityMessageFlatbufMarshal(b, 42, "Taught by: Farmer", AuraApi.EntityMessageKindUnlock)
	b.Finish(msg)

	em := unwrapEntityMessage(t, b.FinishedBytes())
	assert.EqualValues(t, 42, em.EntityId())
	assert.Equal(t, "Taught by: Farmer", string(em.Message()))
	assert.Equal(t, AuraApi.EntityMessageKindUnlock, em.Kind())
}

// TestEntityMessage_ChatKindRoundTrip pins the ordinary chat path still encodes
// kind == Chat.
func TestEntityMessage_ChatKindRoundTrip(t *testing.T) {
	b := flatbuffers.NewBuilder(64)
	msg := EntityMessageFlatbufMarshal(b, 7, "hello", AuraApi.EntityMessageKindChat)
	b.Finish(msg)

	em := unwrapEntityMessage(t, b.FinishedBytes())
	assert.EqualValues(t, 7, em.EntityId())
	assert.Equal(t, "hello", string(em.Message()))
	assert.Equal(t, AuraApi.EntityMessageKindChat, em.Kind())
}

// TestEntityMessage_KindDefaultsToChat pins backward compatibility: a message
// built without the appended `kind` field (as an old client/server would emit)
// decodes as Chat, so the new client's kind branch never mistakes legacy chat
// for an unlock.
func TestEntityMessage_KindDefaultsToChat(t *testing.T) {
	b := flatbuffers.NewBuilder(64)
	msgOffset := b.CreateString("legacy")
	AuraApi.EntityMessageStart(b)
	AuraApi.EntityMessageAddEntityId(b, 3)
	AuraApi.EntityMessageAddMessage(b, msgOffset)
	// kind deliberately not added — simulates a pre-feature message.
	em := AuraApi.EntityMessageEnd(b)
	b.Finish(em)

	got := AuraApi.GetRootAsEntityMessage(b.FinishedBytes(), 0)
	assert.Equal(t, AuraApi.EntityMessageKindChat, got.Kind())
}
