package codec

import (
	"fmt"
	"log/slog"

	"github.com/google/flatbuffers/go"

	"github.com/RoteRiesenRobbe/aura/pkg/api/AuraApi"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

func Vec2fMarshalFlatbuf(builder *flatbuffers.Builder, v phy.Vec2f) flatbuffers.UOffsetT {
	return AuraApi.CreateVec2f(builder, f32ToPx(v.X), f32ToPx(v.Y))
}

func AabbMarshalFlatbuf(aabb model.AABB, builder *flatbuffers.Builder) flatbuffers.UOffsetT {
	return AuraApi.CreateAABB(builder, f32ToPx(aabb.Left), f32ToPx(aabb.Bottom), f32ToPx(aabb.Right), f32ToPx(aabb.Upper))
}

func characterCommonMarshalFlatbuf(builder *flatbuffers.Builder, p model.PlayerEntity) {
	// prepend entity specific things
	name := builder.CreateString(p.Name())
	statusEffects := StatusEffectsMarshal(builder, p)

	// populate player table
	AuraApi.CharacterStart(builder)
	AuraApi.CharacterAddId(builder, p.Basic().ID())
	AuraApi.CharacterAddName(builder, name)
	AuraApi.CharacterAddStatusEffects(builder, statusEffects)

	pos := Vec2fMarshalFlatbuf(builder, p.Position())
	AuraApi.CharacterAddPos(builder, pos)

	aabb := AabbMarshalFlatbuf(p.AABB(), builder)
	AuraApi.CharacterAddAabb(builder, aabb)

	AuraApi.CharacterAddRadius(builder, f32ToU16Px(p.Radius()))
	AuraApi.CharacterAddRotation(builder, p.Angle())
	AuraApi.CharacterAddEntityType(builder, AuraApi.EntityType(p.Type()))
	AuraApi.CharacterAddHealth(builder, p.VitalSigns().Health.UInt32())
	AuraApi.CharacterAddMaxHealth(builder, p.MaxHealth().UInt32())
	AuraApi.CharacterAddLevelProgress(builder, fracToUint32(p.LevelProgressFraction()))
	AuraApi.CharacterAddLevel(builder, p.Progression().Level)
	AuraApi.CharacterAddAuraRadius(builder, f32ToU16Px(p.AuraRadius()))
	// 0 = no light; the client hole-punches the darkness overlay (chunk 3).
	AuraApi.CharacterAddLightRadius(builder, f32ToU16Px(p.LightRadius()))
	AuraApi.CharacterAddBurstRadius(builder, f32ToU16Px(p.BurstRadius()))
	AuraApi.CharacterAddActiveSkillId(builder, ActiveSkillID(p.SkillComponent()))
	// Floating-number sources (item 11): damage/heal in absolute HP, XP raw.
	AuraApi.CharacterAddDamageTaken(builder, p.DamageTaken().UInt32())
	// Crit-flagged share of damage taken (skill-vocab chunk 1, §4.3).
	AuraApi.CharacterAddCritTaken(builder, p.CritTaken().UInt32())
	// Current total absorb capacity — a live value (skill-vocab chunk 2).
	AuraApi.CharacterAddShieldHp(builder, p.ShieldHP().UInt32())
	AuraApi.CharacterAddHealReceived(builder, p.HealReceived().UInt32())
	AuraApi.CharacterAddXpGained(builder, u64ToU32Clamped(p.XpGained()))
	AuraApi.CharacterAddAuraHitStyle(builder, byte(p.AuraHitStyle()))
	// One-tick stamp: a campfire became the respawn anchor (chunk 4).
	AuraApi.CharacterAddCampfireBound(builder, p.CampfireBound())
	// In-combat flag — drives the HUD combat indicator.
	AuraApi.CharacterAddInCombat(builder, p.InCombat())
	// Absolute XP progress for the HUD XP-bar text (xpInLevel/xpForNextLevel).
	xpInLevel, xpForNextLevel := p.LevelProgressXP()
	AuraApi.CharacterAddXpInLevel(builder, u64ToU32Clamped(xpInLevel))
	AuraApi.CharacterAddXpForNextLevel(builder, u64ToU32Clamped(xpForNextLevel))
	// Aura tick cadence + phase; both 0 while no aura is active. The client
	// draws the tick indicator from these (own player + other players; chunk 6).
	AuraApi.CharacterAddAuraTickInterval(builder, uint16(p.AuraTickInterval()))
	AuraApi.CharacterAddAuraTickPhase(builder, uint16(p.AuraTickPhase()))
	// Ring colour (triage item 7); 0 while no aura is active.
	AuraApi.CharacterAddAuraCategory(builder, byte(p.AuraCategories()))
	// Buff/debuff kinds currently applied TO the player — drives the pips.
	AuraApi.CharacterAddAppliedEffects(builder, byte(p.AppliedEffects()))
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
	return AuraApi.CharacterEnd(builder)
}

// player marshalled for the acting player
func CharacterMarshalFlatbuf(p model.PlayerEntity, builder *flatbuffers.Builder) flatbuffers.UOffsetT {
	characterCommonMarshalFlatbuf(builder, p)
	// other stuffz
	AuraApi.CharacterAddLevelProgress(builder, fracToUint32(p.LevelProgressFraction()))
	AuraApi.CharacterAddLevel(builder, p.Progression().Level)

	return AuraApi.CharacterEnd(builder)
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
	AuraApi.SpectatorStart(b)
	AuraApi.SpectatorAddId(b, s.Basic().ID())
	pos := Vec2fMarshalFlatbuf(b, s.Position())
	AuraApi.SpectatorAddPos(b, pos)
	return AuraApi.SpectatorEnd(b)
}

// AuraSlotsMarshalFlatbuf serializes the 4 aura slot contents as a positional
// [ushort] vector: index i = AuraSlots[i], 0 = empty slot. Must be called before
// GameStateStart (FlatBuffers rule). Emits in slot order 0→3 (reverse-prepend
// is the FlatBuffers write mechanic; the logical index ordering is preserved).
func AuraSlotsMarshalFlatbuf(sc *skills.SkillComponent, builder *flatbuffers.Builder) flatbuffers.UOffsetT {
	n := skills.MaxAuraSlots
	AuraApi.GameStateStartAuraSlotsVector(builder, n)
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
	AuraApi.GameStateStartSpellbookVector(builder, n)
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
	AuraApi.GameStateStartPassiveSlotsVector(builder, n)
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
	AuraApi.GameStateStartCooldownSlotsVector(builder, n)
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
	AuraApi.GameStateStartCooldownRemainingTicksVector(builder, n)
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
	AuraApi.GameStateStartSpellbookLevelsVector(builder, n)
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

	AuraApi.GameStateStart(builder)
	AuraApi.GameStateAddTick(builder, gs.Tick)

	AuraApi.GameStateAddPlayerType(builder, AuraApi.PlayerCharacter)
	AuraApi.GameStateAddPlayer(builder, character)

	AuraApi.GameStateAddEntities(builder, entities)
	AuraApi.GameStateAddSpellbook(builder, spellbook)
	AuraApi.GameStateAddSpellbookLevels(builder, spellbookLevels)
	AuraApi.GameStateAddAuraSlots(builder, auraSlots)
	AuraApi.GameStateAddPassiveSlots(builder, passiveSlots)
	AuraApi.GameStateAddCooldownSlots(builder, cooldownSlots)
	AuraApi.GameStateAddCooldownRemainingTicks(builder, cooldownRemaining)
	AuraApi.GameStateAddActiveAuraSlot(builder, int8(gs.Player.SkillComponent().ActiveAuraSlot))
	AuraApi.GameStateAddSkillPoints(builder, uint16(max(gs.Player.AvailableSkillPoints(), 0)))

	// Cast bar (skill-vocab chunk 4): the running cast, read live off the
	// component each tick; absent fields read as 0 = no cast.
	sc := gs.Player.SkillComponent()
	if es := sc.CastingSkill(); es != nil {
		AuraApi.GameStateAddCastSkillId(builder, uint16(es.Def.ID))
		AuraApi.GameStateAddCastTicksLeft(builder, uint16(sc.CastTicksLeft))
		AuraApi.GameStateAddCastTicksTotal(builder, uint16(es.EffectiveCastTicks()))
	}
	// Rejection feedback (chunk 4, §3.5): per-tick one-shot, campfire_bound
	// lifecycle — stamped by the SkillSystem, cleared in ResetTickNumbers.
	if id, reason := gs.Player.ActivationRejected(); reason != model.ActivationRejectedNone {
		AuraApi.GameStateAddActivationRejectedSkillId(builder, uint16(id))
		AuraApi.GameStateAddActivationRejectedReason(builder, byte(reason))
	}

	return AuraApi.GameStateEnd(builder)
}

func CharacterGameStateMessageMarshalFlatbuf(builder *flatbuffers.Builder, g *CharacterGameState) flatbuffers.UOffsetT {
	gs := g.MarshalFlatbuf(builder)
	return ServerMessageWrapFlatbufMarshal(builder, gs, AuraApi.ServerMessageBodyGameState)
}

// MarshalFlatbuf implements FlatbufCodec for GameState
func (gs *SpectatorGameState) MarshalFlatbuf(builder *flatbuffers.Builder) flatbuffers.UOffsetT {
	entities := EntitiesMarshalFlatbuf(gs.Entities, builder)
	spectator := SpectatorMarshalFlatbuf(builder, gs.Spectator)

	AuraApi.GameStateStart(builder)
	AuraApi.GameStateAddTick(builder, gs.Tick)
	AuraApi.GameStateAddPlayerType(builder, AuraApi.PlayerSpectator)
	AuraApi.GameStateAddPlayer(builder, spectator)
	AuraApi.GameStateAddEntities(builder, entities)

	return AuraApi.GameStateEnd(builder)
}

func SpectatorGameStateMessageMarshalFlatbuf(builder *flatbuffers.Builder, g *SpectatorGameState) flatbuffers.UOffsetT {
	gs := g.MarshalFlatbuf(builder)
	return ServerMessageWrapFlatbufMarshal(builder, gs, AuraApi.ServerMessageBodyGameState)
}

// EntitiesMarshalFlatbuf marshals a list of Entity interfaces
func EntitiesMarshalFlatbuf(entities []model.Entity, builder *flatbuffers.Builder) flatbuffers.UOffsetT {
	n := len(entities)

	offsets := make([]flatbuffers.UOffsetT, n)
	for _, e := range entities {
		var marshalled flatbuffers.UOffsetT
		var eType AuraApi.AnyEntity

		switch v := e.(type) {
		case model.PlayerEntity:
			marshalled = CharacterEntityFlatbufMarshal(v, builder)
			eType = AuraApi.AnyEntityCharacter
		case model.MobEntity:
			marshalled = MobEntityFlatbufMarshal(v, builder)
			eType = AuraApi.AnyEntityMob
		case model.PlaceableResourceEntity:
			// Placeable resources are handled as resources for the client
			marshalled = ResourceEntityFlatbufMarshal(v, builder)
			eType = AuraApi.AnyEntityResource
		case model.PlaceableEntity:
			marshalled = PlaceableEntityFlatbufMarshal(v, builder)
			eType = AuraApi.AnyEntityPlaceable
		case model.ResourceEntity:
			marshalled = ResourceEntityFlatbufMarshal(v, builder)
			eType = AuraApi.AnyEntityResource
		case model.PropEntity:
			// Props ride the resource streaming path to the client (decision B,
			// plan-world-zones.md §3.2).
			marshalled = PropEntityFlatbufMarshal(v, builder)
			eType = AuraApi.AnyEntityResource
		default:
			slog.Error("unknown entity", slog.Any("entity", e))
			panic(fmt.Sprintf("unknown entity: %+v", e))
		}
		AuraApi.EntityStart(builder)
		AuraApi.EntityAddE(builder, marshalled)
		AuraApi.EntityAddEType(builder, eType)
		offsets = append(offsets, AuraApi.EntityEnd(builder))
	}

	AuraApi.GameStateStartEntitiesVector(builder, n)
	for _, o := range offsets {
		builder.PrependUOffsetT(o)
	}
	return builder.EndVector(n)
}

// EntityFlatbufMarshal marshals an Entity interface to its corresponding
// flatbuffer schema
func ResourceEntityFlatbufMarshal(e model.ResourceEntity, builder *flatbuffers.Builder) flatbuffers.UOffsetT {
	statusEffects := StatusEffectsMarshal(builder, e)

	AuraApi.ResourceStart(builder)
	AuraApi.ResourceAddId(builder, e.Basic().ID())
	AuraApi.ResourceAddStatusEffects(builder, statusEffects)

	pos := Vec2fMarshalFlatbuf(builder, e.Position())
	AuraApi.ResourceAddPos(builder, pos)

	aabb := AabbMarshalFlatbuf(e.AABB(), builder)
	AuraApi.ResourceAddAabb(builder, aabb)

	AuraApi.ResourceAddRadius(builder, f32ToU16Px(e.Radius()))
	AuraApi.ResourceAddEntityType(builder, AuraApi.EntityType(e.Type()))

	AuraApi.ResourceAddCapacity(builder, byte(e.Stock().Capacity))
	AuraApi.ResourceAddStock(builder, byte(e.Stock().Available))

	return AuraApi.ResourceEnd(builder)
}

// PropEntityFlatbufMarshal marshals a static prop through the Resource wire
// table. The client's resource classes scale their sprite by stock/capacity,
// so a constant 1/1 renders the prop at full size; props carry no status
// effects, so the vector is always empty.
func PropEntityFlatbufMarshal(e model.PropEntity, builder *flatbuffers.Builder) flatbuffers.UOffsetT {
	builder.StartVector(1, 0, 0)
	statusEffects := builder.EndVector(0)

	AuraApi.ResourceStart(builder)
	AuraApi.ResourceAddId(builder, e.Basic().ID())
	AuraApi.ResourceAddStatusEffects(builder, statusEffects)

	pos := Vec2fMarshalFlatbuf(builder, e.Position())
	AuraApi.ResourceAddPos(builder, pos)

	aabb := AabbMarshalFlatbuf(e.AABB(), builder)
	AuraApi.ResourceAddAabb(builder, aabb)

	AuraApi.ResourceAddRadius(builder, f32ToU16Px(e.Radius()))
	AuraApi.ResourceAddEntityType(builder, AuraApi.EntityType(e.Type()))

	AuraApi.ResourceAddCapacity(builder, 1)
	AuraApi.ResourceAddStock(builder, 1)

	return AuraApi.ResourceEnd(builder)
}

func PlaceableEntityFlatbufMarshal(e model.PlaceableEntity, builder *flatbuffers.Builder) flatbuffers.UOffsetT {
	statusEffects := StatusEffectsMarshal(builder, e)

	AuraApi.PlaceableStart(builder)
	AuraApi.PlaceableAddId(builder, e.Basic().ID())
	AuraApi.PlaceableAddStatusEffects(builder, statusEffects)

	pos := Vec2fMarshalFlatbuf(builder, e.Position())
	AuraApi.PlaceableAddPos(builder, pos)

	aabb := AabbMarshalFlatbuf(e.AABB(), builder)
	AuraApi.PlaceableAddAabb(builder, aabb)

	AuraApi.PlaceableAddRadius(builder, f32ToU16Px(e.Radius()))
	AuraApi.PlaceableAddEntityType(builder, AuraApi.EntityType(e.Type()))

	AuraApi.PlaceableAddItem(builder, byte(e.Item().ID))

	return AuraApi.PlaceableEnd(builder)
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
