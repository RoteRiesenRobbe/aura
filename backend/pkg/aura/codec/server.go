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

	// ⚑ Every string has to be built BEFORE WelcomeStart — flatbuffers refuses
	// a nested write once a table is open — and a vector is built back to
	// front, so the offsets go in reversed.
	zoneNameOffsets := make([]flatbuffers.UOffsetT, len(w.ZoneNames))
	for i, n := range w.ZoneNames {
		zoneNameOffsets[i] = builder.CreateString(n)
	}
	AuraApi.WelcomeStartZoneNamesVector(builder, len(zoneNameOffsets))
	for i := len(zoneNameOffsets) - 1; i >= 0; i-- {
		builder.PrependUOffsetT(zoneNameOffsets[i])
	}
	zoneNames := builder.EndVector(len(zoneNameOffsets))

	AuraApi.WelcomeStart(builder)
	AuraApi.WelcomeAddServerName(builder, serverName)
	AuraApi.WelcomeAddMapWidth(builder, w.Width)
	AuraApi.WelcomeAddMapHeight(builder, w.Height)
	AuraApi.WelcomeAddTotalDaycycleTicks(builder, w.TotalDayCycleTicks)
	AuraApi.WelcomeAddDayTimeTicks(builder, w.DayTimeTicks)
	AuraApi.WelcomeAddZoneName(builder, zoneName)
	AuraApi.WelcomeAddGrayBase(builder, w.GrayBase)
	AuraApi.WelcomeAddGrayStep(builder, w.GrayStep)
	AuraApi.WelcomeAddZoneNames(builder, zoneNames)

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
	// With several zones loaded it is the PRIMARY one, and every existing
	// consumer keeps reading it unchanged.
	ZoneName string
	// ZoneNames is every zone the server loaded, primary first
	// (plan-underworld.md U2). The client bundles all zone files already, so
	// this is only telling it which of them are real this boot; where the
	// player IS, it derives from position.
	ZoneNames []string

	// GrayBase and GrayStep are the kill-XP gray knobs the client needs to
	// derive the nameplate's difficulty colour from what a kill actually pays
	// (plan-world-replacement.md C0). They must be filled from the NORMALIZED
	// economy — mob.KillXPConfig(), not the raw conf block — or the client
	// re-acquires a rule the server does not pay by; see the caller in
	// core/game.go.
	GrayBase int32
	GrayStep int32
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
