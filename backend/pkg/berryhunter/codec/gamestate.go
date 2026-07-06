package codec

import (
	"fmt"
	"log/slog"

	"github.com/google/flatbuffers/go"

	"github.com/trichner/berryhunter/pkg/api/BerryhunterApi"
	"github.com/trichner/berryhunter/pkg/berryhunter/model"
	"github.com/trichner/berryhunter/pkg/berryhunter/phy"
	"github.com/trichner/berryhunter/pkg/berryhunter/skills"
)

func Vec2fMarshalFlatbuf(builder *flatbuffers.Builder, v phy.Vec2f) flatbuffers.UOffsetT {
	return BerryhunterApi.CreateVec2f(builder, f32ToPx(v.X), f32ToPx(v.Y))
}

func AabbMarshalFlatbuf(aabb model.AABB, builder *flatbuffers.Builder) flatbuffers.UOffsetT {
	return BerryhunterApi.CreateAABB(builder, f32ToPx(aabb.Left), f32ToPx(aabb.Bottom), f32ToPx(aabb.Right), f32ToPx(aabb.Upper))
}

func characterCommonMarshalFlatbuf(builder *flatbuffers.Builder, p model.PlayerEntity) {
	// prepend entity specific things
	name := builder.CreateString(p.Name())
	statusEffects := StatusEffectsMarshal(builder, p)

	// populate player table
	BerryhunterApi.CharacterStart(builder)
	BerryhunterApi.CharacterAddId(builder, p.Basic().ID())
	BerryhunterApi.CharacterAddName(builder, name)
	BerryhunterApi.CharacterAddStatusEffects(builder, statusEffects)

	pos := Vec2fMarshalFlatbuf(builder, p.Position())
	BerryhunterApi.CharacterAddPos(builder, pos)

	aabb := AabbMarshalFlatbuf(p.AABB(), builder)
	BerryhunterApi.CharacterAddAabb(builder, aabb)

	BerryhunterApi.CharacterAddRadius(builder, f32ToU16Px(p.Radius()))
	BerryhunterApi.CharacterAddRotation(builder, p.Angle())
	BerryhunterApi.CharacterAddEntityType(builder, BerryhunterApi.EntityType(p.Type()))
	BerryhunterApi.CharacterAddHealth(builder, p.VitalSigns().Health.UInt32())
	BerryhunterApi.CharacterAddMaxHealth(builder, p.MaxHealth().UInt32())
	BerryhunterApi.CharacterAddLevelProgress(builder, fracToUint32(p.LevelProgressFraction()))
	BerryhunterApi.CharacterAddLevel(builder, p.Progression().Level)
	BerryhunterApi.CharacterAddAuraRadius(builder, f32ToU16Px(p.AuraRadius()))
	BerryhunterApi.CharacterAddBurstRadius(builder, f32ToU16Px(p.BurstRadius()))
	BerryhunterApi.CharacterAddActiveSkillId(builder, ActiveSkillID(p.SkillComponent()))
	// Floating-number sources (item 11): damage/heal in absolute HP, XP raw.
	BerryhunterApi.CharacterAddDamageTaken(builder, p.DamageTaken().UInt32())
	BerryhunterApi.CharacterAddHealReceived(builder, p.HealReceived().UInt32())
	BerryhunterApi.CharacterAddXpGained(builder, u64ToU32Clamped(p.XpGained()))
	BerryhunterApi.CharacterAddAuraHitStyle(builder, byte(p.AuraHitStyle()))
	// Absolute XP progress for the HUD XP-bar text (xpInLevel/xpForNextLevel).
	xpInLevel, xpForNextLevel := p.LevelProgressXP()
	BerryhunterApi.CharacterAddXpInLevel(builder, u64ToU32Clamped(xpInLevel))
	BerryhunterApi.CharacterAddXpForNextLevel(builder, u64ToU32Clamped(xpForNextLevel))
}

// u64ToU32Clamped narrows a uint64 to uint32 for the wire, saturating rather
// than wrapping — the floating XP number only needs display precision.
func u64ToU32Clamped(v uint64) uint32 {
	if v > 0xffffffff {
		return 0xffffffff
	}
	return uint32(v)
}

// ActiveSkillID returns the skill ID of the currently active aura, or 0 if no
// aura is active (Nothing) or the active slot is empty. 0 is the wire encoding
// for "no ring" on Character.active_skill_id.
func ActiveSkillID(sc *skills.SkillComponent) uint16 {
	slot := sc.ActiveAuraSlot
	if slot < 0 || slot >= len(sc.AuraSlots) || sc.AuraSlots[slot] == nil {
		return 0
	}
	return uint16(sc.AuraSlots[slot].Def.ID)
}

func StatusEffectsMarshal(builder *flatbuffers.Builder, e model.StatusEntity) flatbuffers.UOffsetT {
	se := e.StatusEffects().Effects()
	if se == nil || len(se) == 0 {
		builder.StartVector(1, 0, 0)
		return builder.EndVector(0)
	}

	builder.StartVector(1, len(se), 0)
	for _, k := range se {
		builder.PrependUint16(uint16(k))
	}
	return builder.EndVector(len(se))
}

// general player as seen by other players
func CharacterEntityFlatbufMarshal(p model.PlayerEntity, builder *flatbuffers.Builder) flatbuffers.UOffsetT {
	// prepend entity specific things
	characterCommonMarshalFlatbuf(builder, p)
	return BerryhunterApi.CharacterEnd(builder)
}

// player marshalled for the acting player
func CharacterMarshalFlatbuf(p model.PlayerEntity, builder *flatbuffers.Builder) flatbuffers.UOffsetT {
	characterCommonMarshalFlatbuf(builder, p)
	// other stuffz
	BerryhunterApi.CharacterAddLevelProgress(builder, fracToUint32(p.LevelProgressFraction()))
	BerryhunterApi.CharacterAddLevel(builder, p.Progression().Level)

	return BerryhunterApi.CharacterEnd(builder)
}

func fracToUint32(f float32) uint32 {
	if f <= 0 {
		return 0
	}
	if f >= 1 {
		return ^uint32(0)
	}
	return uint32(f * float32(^uint32(0)))
}

func SpectatorMarshalFlatbuf(b *flatbuffers.Builder, s model.Spectator) flatbuffers.UOffsetT {
	BerryhunterApi.SpectatorStart(b)
	BerryhunterApi.SpectatorAddId(b, s.Basic().ID())
	pos := Vec2fMarshalFlatbuf(b, s.Position())
	BerryhunterApi.SpectatorAddPos(b, pos)
	return BerryhunterApi.SpectatorEnd(b)
}

// AuraSlotsMarshalFlatbuf serializes the 4 aura slot contents as a positional
// [ushort] vector: index i = AuraSlots[i], 0 = empty slot. Must be called before
// GameStateStart (FlatBuffers rule). Emits in slot order 0→3 (reverse-prepend
// is the FlatBuffers write mechanic; the logical index ordering is preserved).
func AuraSlotsMarshalFlatbuf(sc *skills.SkillComponent, builder *flatbuffers.Builder) flatbuffers.UOffsetT {
	n := skills.MaxAuraSlots
	BerryhunterApi.GameStateStartAuraSlotsVector(builder, n)
	// Prepend in reverse (slots 3→0) so index 0 lands at the lowest address.
	for i := n - 1; i >= 0; i-- {
		var id uint16
		if sc.AuraSlots[i] != nil {
			id = uint16(sc.AuraSlots[i].Def.ID)
		}
		builder.PrependUint16(id)
	}
	return builder.EndVector(n)
}

// SpellbookMarshalFlatbuf serializes the discovered skill IDs from sc as a
// [ushort] vector. Must be called before GameStateStart (FlatBuffers rule).
func SpellbookMarshalFlatbuf(sc *skills.SkillComponent, builder *flatbuffers.Builder) flatbuffers.UOffsetT {
	ids := sc.Discovered()
	n := len(ids)
	BerryhunterApi.GameStateStartSpellbookVector(builder, n)
	// Prepend in reverse: FlatBuffers grows the buffer downward, so the last
	// prepended element lands at the lowest address (index 0 when read).
	// Iterating backward preserves the ascending order that Discovered() returns.
	for i := n - 1; i >= 0; i-- {
		builder.PrependUint16(uint16(ids[i]))
	}
	return builder.EndVector(n)
}

// PassiveSlotsMarshalFlatbuf serializes the passive slot contents as a
// positional [ushort] vector: index i = PassiveSlots[i], 0 = empty slot.
// Must be called before GameStateStart (FlatBuffers rule).
func PassiveSlotsMarshalFlatbuf(sc *skills.SkillComponent, builder *flatbuffers.Builder) flatbuffers.UOffsetT {
	n := skills.MaxPassiveSlots
	BerryhunterApi.GameStateStartPassiveSlotsVector(builder, n)
	// Prepend in reverse so index 0 lands at the lowest address.
	for i := n - 1; i >= 0; i-- {
		var id uint16
		if sc.PassiveSlots[i] != nil {
			id = uint16(sc.PassiveSlots[i].Def.ID)
		}
		builder.PrependUint16(id)
	}
	return builder.EndVector(n)
}

// CooldownSlotsMarshalFlatbuf serializes the cooldown slot contents as a
// positional [ushort] vector: index i = CooldownSlots[i], 0 = empty slot.
// Must be called before GameStateStart (FlatBuffers rule).
func CooldownSlotsMarshalFlatbuf(sc *skills.SkillComponent, builder *flatbuffers.Builder) flatbuffers.UOffsetT {
	n := skills.MaxCooldownSlots
	BerryhunterApi.GameStateStartCooldownSlotsVector(builder, n)
	// Prepend in reverse so index 0 lands at the lowest address.
	for i := n - 1; i >= 0; i-- {
		var id uint16
		if sc.CooldownSlots[i] != nil {
			id = uint16(sc.CooldownSlots[i].Def.ID)
		}
		builder.PrependUint16(id)
	}
	return builder.EndVector(n)
}

// CooldownRemainingMarshalFlatbuf serializes the remaining cooldown ticks per
// slot, positionally parallel to cooldown_slots; 0 = ready (or empty slot).
func CooldownRemainingMarshalFlatbuf(sc *skills.SkillComponent, builder *flatbuffers.Builder) flatbuffers.UOffsetT {
	n := skills.MaxCooldownSlots
	BerryhunterApi.GameStateStartCooldownRemainingTicksVector(builder, n)
	for i := n - 1; i >= 0; i-- {
		var cd uint16
		if sc.CooldownSlots[i] != nil {
			cd = uint16(sc.CooldownSlots[i].CdTicks)
		}
		builder.PrependUint16(cd)
	}
	return builder.EndVector(n)
}

// SpellbookLevelsMarshalFlatbuf serializes the per-skill levels as a [ubyte]
// vector positionally parallel to the spellbook vector (same ascending-ID
// order from Discovered()). Must be called before GameStateStart.
func SpellbookLevelsMarshalFlatbuf(sc *skills.SkillComponent, builder *flatbuffers.Builder) flatbuffers.UOffsetT {
	ids := sc.Discovered()
	n := len(ids)
	BerryhunterApi.GameStateStartSpellbookLevelsVector(builder, n)
	// Prepend in reverse so index 0 lands at the lowest address (see
	// SpellbookMarshalFlatbuf).
	for i := n - 1; i >= 0; i-- {
		builder.PrependByte(byte(sc.SkillLevel(ids[i])))
	}
	return builder.EndVector(n)
}

// MarshalFlatbuf implements FlatbufCodec for GameState
func (gs *CharacterGameState) MarshalFlatbuf(builder *flatbuffers.Builder) flatbuffers.UOffsetT {
	entities := EntitiesMarshalFlatbuf(gs.Entities, builder)
	character := CharacterMarshalFlatbuf(gs.Player, builder)
	spellbook := SpellbookMarshalFlatbuf(gs.Player.SkillComponent(), builder)
	spellbookLevels := SpellbookLevelsMarshalFlatbuf(gs.Player.SkillComponent(), builder)
	auraSlots := AuraSlotsMarshalFlatbuf(gs.Player.SkillComponent(), builder)
	passiveSlots := PassiveSlotsMarshalFlatbuf(gs.Player.SkillComponent(), builder)
	cooldownSlots := CooldownSlotsMarshalFlatbuf(gs.Player.SkillComponent(), builder)
	cooldownRemaining := CooldownRemainingMarshalFlatbuf(gs.Player.SkillComponent(), builder)

	BerryhunterApi.GameStateStart(builder)
	BerryhunterApi.GameStateAddTick(builder, gs.Tick)

	BerryhunterApi.GameStateAddPlayerType(builder, BerryhunterApi.PlayerCharacter)
	BerryhunterApi.GameStateAddPlayer(builder, character)

	BerryhunterApi.GameStateAddEntities(builder, entities)
	BerryhunterApi.GameStateAddSpellbook(builder, spellbook)
	BerryhunterApi.GameStateAddSpellbookLevels(builder, spellbookLevels)
	BerryhunterApi.GameStateAddAuraSlots(builder, auraSlots)
	BerryhunterApi.GameStateAddPassiveSlots(builder, passiveSlots)
	BerryhunterApi.GameStateAddCooldownSlots(builder, cooldownSlots)
	BerryhunterApi.GameStateAddCooldownRemainingTicks(builder, cooldownRemaining)
	BerryhunterApi.GameStateAddActiveAuraSlot(builder, int8(gs.Player.SkillComponent().ActiveAuraSlot))
	BerryhunterApi.GameStateAddSkillPoints(builder, uint16(max(gs.Player.AvailableSkillPoints(), 0)))

	return BerryhunterApi.GameStateEnd(builder)
}

func CharacterGameStateMessageMarshalFlatbuf(builder *flatbuffers.Builder, g *CharacterGameState) flatbuffers.UOffsetT {
	gs := g.MarshalFlatbuf(builder)
	return ServerMessageWrapFlatbufMarshal(builder, gs, BerryhunterApi.ServerMessageBodyGameState)
}

// MarshalFlatbuf implements FlatbufCodec for GameState
func (gs *SpectatorGameState) MarshalFlatbuf(builder *flatbuffers.Builder) flatbuffers.UOffsetT {
	entities := EntitiesMarshalFlatbuf(gs.Entities, builder)
	spectator := SpectatorMarshalFlatbuf(builder, gs.Spectator)

	BerryhunterApi.GameStateStart(builder)
	BerryhunterApi.GameStateAddTick(builder, gs.Tick)
	BerryhunterApi.GameStateAddPlayerType(builder, BerryhunterApi.PlayerSpectator)
	BerryhunterApi.GameStateAddPlayer(builder, spectator)
	BerryhunterApi.GameStateAddEntities(builder, entities)

	return BerryhunterApi.GameStateEnd(builder)
}

func SpectatorGameStateMessageMarshalFlatbuf(builder *flatbuffers.Builder, g *SpectatorGameState) flatbuffers.UOffsetT {
	gs := g.MarshalFlatbuf(builder)
	return ServerMessageWrapFlatbufMarshal(builder, gs, BerryhunterApi.ServerMessageBodyGameState)
}

// EntitiesMarshalFlatbuf marshals a list of Entity interfaces
func EntitiesMarshalFlatbuf(entities []model.Entity, builder *flatbuffers.Builder) flatbuffers.UOffsetT {
	n := len(entities)

	offsets := make([]flatbuffers.UOffsetT, n)
	for _, e := range entities {
		var marshalled flatbuffers.UOffsetT
		var eType BerryhunterApi.AnyEntity

		switch v := e.(type) {
		case model.PlayerEntity:
			marshalled = CharacterEntityFlatbufMarshal(v, builder)
			eType = BerryhunterApi.AnyEntityCharacter
		case model.MobEntity:
			marshalled = MobEntityFlatbufMarshal(v, builder)
			eType = BerryhunterApi.AnyEntityMob
		case model.PlaceableResourceEntity:
			// Placeable resources are handled as resources for the client
			marshalled = ResourceEntityFlatbufMarshal(v, builder)
			eType = BerryhunterApi.AnyEntityResource
		case model.PlaceableEntity:
			marshalled = PlaceableEntityFlatbufMarshal(v, builder)
			eType = BerryhunterApi.AnyEntityPlaceable
		case model.ResourceEntity:
			marshalled = ResourceEntityFlatbufMarshal(v, builder)
			eType = BerryhunterApi.AnyEntityResource
		default:
			slog.Error("unknown entity", slog.Any("entity", e))
			panic(fmt.Sprintf("unknown entity: %+v", e))
		}
		BerryhunterApi.EntityStart(builder)
		BerryhunterApi.EntityAddE(builder, marshalled)
		BerryhunterApi.EntityAddEType(builder, eType)
		offsets = append(offsets, BerryhunterApi.EntityEnd(builder))
	}

	BerryhunterApi.GameStateStartEntitiesVector(builder, n)
	for _, o := range offsets {
		builder.PrependUOffsetT(o)
	}
	return builder.EndVector(n)
}

// EntityFlatbufMarshal marshals an Entity interface to its corresponding
// flatbuffer schema
func ResourceEntityFlatbufMarshal(e model.ResourceEntity, builder *flatbuffers.Builder) flatbuffers.UOffsetT {
	statusEffects := StatusEffectsMarshal(builder, e)

	BerryhunterApi.ResourceStart(builder)
	BerryhunterApi.ResourceAddId(builder, e.Basic().ID())
	BerryhunterApi.ResourceAddStatusEffects(builder, statusEffects)

	pos := Vec2fMarshalFlatbuf(builder, e.Position())
	BerryhunterApi.ResourceAddPos(builder, pos)

	aabb := AabbMarshalFlatbuf(e.AABB(), builder)
	BerryhunterApi.ResourceAddAabb(builder, aabb)

	BerryhunterApi.ResourceAddRadius(builder, f32ToU16Px(e.Radius()))
	BerryhunterApi.ResourceAddEntityType(builder, BerryhunterApi.EntityType(e.Type()))

	BerryhunterApi.ResourceAddCapacity(builder, byte(e.Stock().Capacity))
	BerryhunterApi.ResourceAddStock(builder, byte(e.Stock().Available))

	return BerryhunterApi.ResourceEnd(builder)
}

func PlaceableEntityFlatbufMarshal(e model.PlaceableEntity, builder *flatbuffers.Builder) flatbuffers.UOffsetT {
	statusEffects := StatusEffectsMarshal(builder, e)

	BerryhunterApi.PlaceableStart(builder)
	BerryhunterApi.PlaceableAddId(builder, e.Basic().ID())
	BerryhunterApi.PlaceableAddStatusEffects(builder, statusEffects)

	pos := Vec2fMarshalFlatbuf(builder, e.Position())
	BerryhunterApi.PlaceableAddPos(builder, pos)

	aabb := AabbMarshalFlatbuf(e.AABB(), builder)
	BerryhunterApi.PlaceableAddAabb(builder, aabb)

	BerryhunterApi.PlaceableAddRadius(builder, f32ToU16Px(e.Radius()))
	BerryhunterApi.PlaceableAddEntityType(builder, BerryhunterApi.EntityType(e.Type()))

	BerryhunterApi.PlaceableAddItem(builder, byte(e.Item().ID))

	return BerryhunterApi.PlaceableEnd(builder)
}

// intermediate struct to serialize
type SpectatorGameState struct {
	Tick      uint64
	Spectator model.Spectator
	Entities  []model.Entity
}

// intermediate struct to serialize
type CharacterGameState struct {
	Tick     uint64
	Player   model.PlayerEntity
	Entities []model.Entity
}
