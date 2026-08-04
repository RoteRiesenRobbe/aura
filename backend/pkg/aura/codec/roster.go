package codec

import (
	flatbuffers "github.com/google/flatbuffers/go"

	"github.com/RoteRiesenRobbe/aura/pkg/api/AuraApi"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
)

// PlayerRoster is every live player character in the zone, for the map's dots
// (plan-world-map.md C3, §4.3 / D7).
//
// ⚑ It is assembled ONCE per publication and the finished bytes go to every
// client — see core.NetSystem.sendRoster. That is why this type exists at all
// rather than the marshal taking the player slice directly: the assembly is a
// separate, testable step from the send, and when flight ships its
// flyer-invisibility filter has exactly one place to live
// (plan-flight-paths.md C4, which warns that the roster is a *second* leak path
// for the fact GameState's filter hides).
type PlayerRoster struct {
	Tick    uint64
	Entries []RosterEntry
}

// RosterEntry is one player's identity and position. Positions are the model's
// own units here; the marshal converts to client px exactly like Character.pos,
// so the two can never drift apart.
type RosterEntry struct {
	ID  uint64
	Pos phy.Vec2f
}

// RosterFor assembles the roster from the players currently in the world.
//
// ⚑ The exclusions the plan's §7 asks for (the dead, spectators) are NOT tested
// for here, and deliberately: `NetSystem.players` holds joined, living
// characters only — a spectator is on a separate list and death removes the
// player entity and adds one — so filtering again would be a second opinion on
// who is in the world, with its own way of being wrong. sys.PlayerCount is the
// same slice under the same rule, and playercount_test.go already pins both
// exclusions against every join/death/disconnect flow.
func RosterFor(tick uint64, players []model.PlayerEntity) PlayerRoster {
	entries := make([]RosterEntry, 0, len(players))
	for _, p := range players {
		if p == nil {
			continue
		}
		entries = append(entries, RosterEntry{
			ID:  p.Basic().ID(),
			Pos: p.Position(),
		})
	}
	return PlayerRoster{Tick: tick, Entries: entries}
}

// PlayerRosterMessageFlatbufMarshal serializes a roster as a ServerMessage.
//
// ⚑ Vectors are built back-to-front: every entry table must be complete before
// the vector that points at them starts (the prepend-reversal rule), so the
// offsets are collected first and written in reverse.
func PlayerRosterMessageFlatbufMarshal(builder *flatbuffers.Builder, r *PlayerRoster) flatbuffers.UOffsetT {
	offsets := make([]flatbuffers.UOffsetT, len(r.Entries))
	for i, e := range r.Entries {
		AuraApi.RosterEntryStart(builder)
		AuraApi.RosterEntryAddId(builder, e.ID)
		AuraApi.RosterEntryAddPos(builder, Vec2fMarshalFlatbuf(builder, e.Pos))
		offsets[i] = AuraApi.RosterEntryEnd(builder)
	}

	AuraApi.PlayerRosterStartEntriesVector(builder, len(offsets))
	for i := len(offsets) - 1; i >= 0; i-- {
		builder.PrependUOffsetT(offsets[i])
	}
	entries := builder.EndVector(len(offsets))

	AuraApi.PlayerRosterStart(builder)
	AuraApi.PlayerRosterAddTick(builder, r.Tick)
	AuraApi.PlayerRosterAddEntries(builder, entries)
	roster := AuraApi.PlayerRosterEnd(builder)

	return ServerMessageWrapFlatbufMarshal(builder, roster, AuraApi.ServerMessageBodyPlayerRoster)
}
