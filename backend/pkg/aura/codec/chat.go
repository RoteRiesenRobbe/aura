package codec

import (
	"github.com/RoteRiesenRobbe/aura/pkg/api/AuraApi"
	"github.com/google/flatbuffers/go"
)

// EntityMessageFlatbufMarshal wraps an EntityMessage in a ServerMessage. `kind`
// distinguishes an ordinary speech-bubble/announcement (Chat) from a skill
// unlock (Unlock), on which entity_id carries the skill id and msg the source
// label — see plan-unlock-attribution.md.
func EntityMessageFlatbufMarshal(builder *flatbuffers.Builder, id uint64, msg string, kind AuraApi.EntityMessageKind) flatbuffers.UOffsetT {
	msgOffset := builder.CreateString(msg)
	AuraApi.EntityMessageStart(builder)
	AuraApi.EntityMessageAddEntityId(builder, id)
	AuraApi.EntityMessageAddMessage(builder, msgOffset)
	AuraApi.EntityMessageAddKind(builder, kind)
	entityMessage := AuraApi.EntityMessageEnd(builder)

	return ServerMessageWrapFlatbufMarshal(builder, entityMessage, AuraApi.ServerMessageBodyEntityMessage)
}
