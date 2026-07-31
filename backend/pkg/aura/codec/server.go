package codec

import (
	"github.com/RoteRiesenRobbe/aura/pkg/api/AuraApi"
	flatbuffers "github.com/google/flatbuffers/go"
)

func ServerMessageWrapFlatbufMarshal(builder *flatbuffers.Builder, body flatbuffers.UOffsetT, bodyType AuraApi.ServerMessageBody) flatbuffers.UOffsetT {
	AuraApi.ServerMessageStart(builder)
	AuraApi.ServerMessageAddBodyType(builder, bodyType)
	AuraApi.ServerMessageAddBody(builder, body)
	return AuraApi.ServerMessageEnd(builder)
}

func WelcomeMessageFlatbufMarshal(builder *flatbuffers.Builder, w *Welcome) flatbuffers.UOffsetT {
	serverName := builder.CreateString(w.ServerName)
	zoneName := builder.CreateString(w.ZoneName)

	AuraApi.WelcomeStart(builder)
	AuraApi.WelcomeAddServerName(builder, serverName)
	AuraApi.WelcomeAddMapWidth(builder, w.Width)
	AuraApi.WelcomeAddMapHeight(builder, w.Height)
	AuraApi.WelcomeAddTotalDaycycleTicks(builder, w.TotalDayCycleTicks)
	AuraApi.WelcomeAddDayTimeTicks(builder, w.DayTimeTicks)
	AuraApi.WelcomeAddZoneName(builder, zoneName)

	welcome := AuraApi.WelcomeEnd(builder)

	return ServerMessageWrapFlatbufMarshal(builder, welcome, AuraApi.ServerMessageBodyWelcome)
}

type Welcome struct {
	ServerName         string
	Width              float32
	Height             float32
	TotalDayCycleTicks uint64
	DayTimeTicks       uint64
	// ZoneName is the active zone's identity (its file stem); the client uses
	// it to render the matching bundled terrain (world foundation chunk 6).
	ZoneName string
}

func AcceptMessageFlatbufMarshal(builder *flatbuffers.Builder, reconnectToken string) flatbuffers.UOffsetT {
	tokenOffset := builder.CreateString(reconnectToken)
	AuraApi.AcceptStart(builder)
	AuraApi.AcceptAddReconnectToken(builder, tokenOffset)
	accept := AuraApi.AcceptEnd(builder)

	return ServerMessageWrapFlatbufMarshal(builder, accept, AuraApi.ServerMessageBodyAccept)
}

func ObituaryMessageFlatbufMarshal(builder *flatbuffers.Builder) flatbuffers.UOffsetT {
	AuraApi.ObituaryStart(builder)
	accept := AuraApi.ObituaryEnd(builder)

	return ServerMessageWrapFlatbufMarshal(builder, accept, AuraApi.ServerMessageBodyObituary)
}

func PongMessageFlatbufMarshal(builder *flatbuffers.Builder) flatbuffers.UOffsetT {
	AuraApi.PongStart(builder)
	validToken := AuraApi.PongEnd(builder)

	return ServerMessageWrapFlatbufMarshal(builder, validToken, AuraApi.ServerMessageBodyPong)
}
