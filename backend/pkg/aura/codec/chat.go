package codec

import (
	"github.com/google/flatbuffers/go"
	"github.com/RoteRiesenRobbe/aura/pkg/api/AuraApi"
)

func EntityMessageFlatbufMarshal(builder *flatbuffers.Builder, id uint64, msg string) flatbuffers.UOffsetT {
	msgOffset := builder.CreateString(msg)
	AuraApi.EntityMessageStart(builder)
	AuraApi.EntityMessageAddEntityId(builder, id)
	AuraApi.EntityMessageAddMessage(builder, msgOffset)
	entityMessage := AuraApi.EntityMessageEnd(builder)

	return ServerMessageWrapFlatbufMarshal(builder, entityMessage, AuraApi.ServerMessageBodyEntityMessage)
}
