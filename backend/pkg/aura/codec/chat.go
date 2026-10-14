package codec

import (
	"github.com/RoteRiesenRobbe/aura/pkg/api/AuraApi"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/lang"
	"github.com/google/flatbuffers/go"
)

// EntityMessageFlatbufMarshal wraps an EntityMessage in a ServerMessage. `kind`
// distinguishes an ordinary speech-bubble/announcement (Chat) from a skill
// unlock (Unlock), on which entity_id carries the skill id and msg the source
// label — see plan-unlock-attribution.md.
func EntityMessageFlatbufMarshal(builder *flatbuffers.Builder, id uint64, msg string, kind AuraApi.EntityMessageKind) flatbuffers.UOffsetT {
	return KeyedEntityMessageFlatbufMarshal(builder, id, lang.Literal(msg), kind)
}

// KeyedEntityMessageFlatbufMarshal is the keyed form (plan-localization.md C2):
// key + typed args for the client to format, message = the English fallback
// (D10). An unkeyed message writes neither field, so it costs nothing extra.
func KeyedEntityMessageFlatbufMarshal(builder *flatbuffers.Builder, id uint64, m lang.Message, kind AuraApi.EntityMessageKind) flatbuffers.UOffsetT {
	var keyOffset, argsOffset flatbuffers.UOffsetT
	if m.Key != "" {
		keyOffset = builder.CreateString(m.Key)
		if len(m.Args) > 0 {
			argOffsets := make([]flatbuffers.UOffsetT, len(m.Args))
			for i, a := range m.Args {
				argOffsets[i] = messageArgFlatbufMarshal(builder, a)
			}
			AuraApi.EntityMessageStartArgsVector(builder, len(argOffsets))
			for k := len(argOffsets) - 1; k >= 0; k-- {
				builder.PrependUOffsetT(argOffsets[k])
			}
			argsOffset = builder.EndVector(len(argOffsets))
		}
	}
	msgOffset := builder.CreateString(m.English)
	AuraApi.EntityMessageStart(builder)
	AuraApi.EntityMessageAddEntityId(builder, id)
	AuraApi.EntityMessageAddMessage(builder, msgOffset)
	AuraApi.EntityMessageAddKind(builder, kind)
	if keyOffset != 0 {
		AuraApi.EntityMessageAddKey(builder, keyOffset)
	}
	if argsOffset != 0 {
		AuraApi.EntityMessageAddArgs(builder, argsOffset)
	}
	entityMessage := AuraApi.EntityMessageEnd(builder)

	return ServerMessageWrapFlatbufMarshal(builder, entityMessage, AuraApi.ServerMessageBodyEntityMessage)
}

func messageArgFlatbufMarshal(builder *flatbuffers.Builder, a lang.Arg) flatbuffers.UOffsetT {
	name := builder.CreateString(a.Name)
	var text, items flatbuffers.UOffsetT
	if a.Text != "" {
		text = builder.CreateString(a.Text)
	}
	if len(a.Items) > 0 {
		offsets := make([]flatbuffers.UOffsetT, len(a.Items))
		for i, s := range a.Items {
			offsets[i] = builder.CreateString(s)
		}
		AuraApi.MessageArgStartItemsVector(builder, len(offsets))
		for k := len(offsets) - 1; k >= 0; k-- {
			builder.PrependUOffsetT(offsets[k])
		}
		items = builder.EndVector(len(offsets))
	}
	AuraApi.MessageArgStart(builder)
	AuraApi.MessageArgAddName(builder, name)
	AuraApi.MessageArgAddKind(builder, AuraApi.MessageArgKind(a.Kind))
	if text != 0 {
		AuraApi.MessageArgAddText(builder, text)
	}
	AuraApi.MessageArgAddNumber(builder, a.Number)
	AuraApi.MessageArgAddId(builder, a.ID)
	if items != 0 {
		AuraApi.MessageArgAddItems(builder, items)
	}
	return AuraApi.MessageArgEnd(builder)
}
