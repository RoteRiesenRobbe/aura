package codec

import (
	"fmt"
	"log/slog"

	"github.com/google/flatbuffers/go"

	"github.com/RoteRiesenRobbe/aura/pkg/api/AuraApi"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/quests"
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
	// Resource cost paid this tick (round-7 item 7) — the blue number.
	AuraApi.CharacterAddCostPaid(builder, p.CostPaid().UInt32())
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
	// Flight state (plan-flight-paths.md C2, D15): destination + arrival tick
	// let the client run its camera, input lock and ETA without guessing.
	// Dest/arrival only while airborne — the fields default to zero/absent.
	if p.Flying() {
		AuraApi.CharacterAddFlying(builder, true)
		dest := Vec2fMarshalFlatbuf(builder, p.FlightDest())
		AuraApi.CharacterAddFlightDest(builder, dest)
		AuraApi.CharacterAddFlightArrivalTick(builder, p.FlightArrivalTick())
	}
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
		builder.PrependUint16(uint16(sc.SlotCooldownRemaining(i)))
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

// ConversationMarshalFlatbuf serializes the open conversation tree; 0 = none,
// and the caller then writes no field at all so the client reads it as absent
// (chunk 3b-ii, D16 — an absent tree IS the close signal).
//
// ⚑ FlatBuffers builds inside out: every string and every nested vector must be
// finished BEFORE the table that references it is started, so this walks the
// tree bottom-up — option strings, then option tables, then the option vector,
// then the node's own strings, then the node table. Must itself be called
// before GameStateStart, like every other vector here.
func ConversationMarshalFlatbuf(c *model.Conversation, builder *flatbuffers.Builder) flatbuffers.UOffsetT {
	if c == nil {
		return 0
	}

	nodeOffsets := make([]flatbuffers.UOffsetT, 0, len(c.Nodes))
	for i := range c.Nodes {
		node := &c.Nodes[i]

		optionOffsets := make([]flatbuffers.UOffsetT, 0, len(node.Options))
		for j := range node.Options {
			opt := &node.Options[j]
			text := builder.CreateString(opt.Text)
			next := builder.CreateString(opt.Next)
			reply := builder.CreateString(opt.Reply)

			AuraApi.ConversationOptionStart(builder)
			AuraApi.ConversationOptionAddOptionIndex(builder, opt.OptionIndex)
			AuraApi.ConversationOptionAddGrantIndex(builder, opt.GrantIndex)
			AuraApi.ConversationOptionAddText(builder, text)
			AuraApi.ConversationOptionAddNext(builder, next)
			AuraApi.ConversationOptionAddLocked(builder, opt.Locked)
			AuraApi.ConversationOptionAddRequiredLevel(builder, opt.RequiredLevel)
			AuraApi.ConversationOptionAddReply(builder, reply)
			AuraApi.ConversationOptionAddConfirmSeconds(builder, opt.ConfirmSeconds)
			AuraApi.ConversationOptionAddSkillId(builder, opt.SkillID)
			optionOffsets = append(optionOffsets, AuraApi.ConversationOptionEnd(builder))
		}
		AuraApi.ConversationNodeStartOptionsVector(builder, len(optionOffsets))
		// Prepend in reverse so index 0 lands at the lowest address — the same
		// rule every vector in this file follows.
		for k := len(optionOffsets) - 1; k >= 0; k-- {
			builder.PrependUOffsetT(optionOffsets[k])
		}
		options := builder.EndVector(len(optionOffsets))

		lineOffsets := make([]flatbuffers.UOffsetT, 0, len(node.Lines))
		for _, line := range node.Lines {
			lineOffsets = append(lineOffsets, builder.CreateString(line))
		}
		AuraApi.ConversationNodeStartLinesVector(builder, len(lineOffsets))
		for k := len(lineOffsets) - 1; k >= 0; k-- {
			builder.PrependUOffsetT(lineOffsets[k])
		}
		lines := builder.EndVector(len(lineOffsets))

		id := builder.CreateString(node.ID)
		AuraApi.ConversationNodeStart(builder)
		AuraApi.ConversationNodeAddId(builder, id)
		AuraApi.ConversationNodeAddLines(builder, lines)
		AuraApi.ConversationNodeAddOptions(builder, options)
		nodeOffsets = append(nodeOffsets, AuraApi.ConversationNodeEnd(builder))
	}

	AuraApi.ConversationStartNodesVector(builder, len(nodeOffsets))
	for k := len(nodeOffsets) - 1; k >= 0; k-- {
		builder.PrependUOffsetT(nodeOffsets[k])
	}
	nodes := builder.EndVector(len(nodeOffsets))

	actorName := builder.CreateString(c.ActorName)
	entryNode := builder.CreateString(c.EntryNode)

	AuraApi.ConversationStart(builder)
	AuraApi.ConversationAddEntityId(builder, c.EntityID)
	AuraApi.ConversationAddActorName(builder, actorName)
	AuraApi.ConversationAddEntryNode(builder, entryNode)
	AuraApi.ConversationAddNodes(builder, nodes)
	return AuraApi.ConversationEnd(builder)
}

// QuestProgressMarshalFlatbuf serializes the owning player's quest ledger
// (plan-quests.md chunk C3, §6): one entry per running or completed quest, ids
// only — the titles and diary prose come from the /quests catalog. 0 = nothing
// to send, and the caller then writes no field at all, which the client reads as
// an empty journal.
//
// ⚑ Same inside-out rule as ConversationMarshalFlatbuf: each entry's strings and
// its stage vector must be finished before the entry table is started, and the
// whole thing before GameStateStart.
func QuestProgressMarshalFlatbuf(entries []quests.ProgressEntry, builder *flatbuffers.Builder) flatbuffers.UOffsetT {
	if len(entries) == 0 {
		return 0
	}

	offsets := make([]flatbuffers.UOffsetT, 0, len(entries))
	for i := range entries {
		e := &entries[i]

		stageOffsets := make([]flatbuffers.UOffsetT, 0, len(e.Path))
		for _, s := range e.Path {
			stageOffsets = append(stageOffsets, builder.CreateString(s))
		}
		AuraApi.QuestProgressStartStagesVector(builder, len(stageOffsets))
		// Prepend in reverse so index 0 lands at the lowest address — the walked
		// path is ORDERED (L6), so this is what keeps the diary readable.
		for k := len(stageOffsets) - 1; k >= 0; k-- {
			builder.PrependUOffsetT(stageOffsets[k])
		}
		stages := builder.EndVector(len(stageOffsets))

		// The current stage's composed objective lines (Q2, R2) — one string
		// per objective, same reversal rule. Absent for completed quests.
		var objectives flatbuffers.UOffsetT
		if len(e.Objectives) > 0 {
			objectiveOffsets := make([]flatbuffers.UOffsetT, 0, len(e.Objectives))
			for _, line := range e.Objectives {
				objectiveOffsets = append(objectiveOffsets, builder.CreateString(line))
			}
			AuraApi.QuestProgressStartObjectivesVector(builder, len(objectiveOffsets))
			for k := len(objectiveOffsets) - 1; k >= 0; k-- {
				builder.PrependUOffsetT(objectiveOffsets[k])
			}
			objectives = builder.EndVector(len(objectiveOffsets))
		}

		questID := builder.CreateString(e.QuestID)
		AuraApi.QuestProgressStart(builder)
		AuraApi.QuestProgressAddQuestId(builder, questID)
		AuraApi.QuestProgressAddStages(builder, stages)
		AuraApi.QuestProgressAddCompleted(builder, e.Completed)
		if objectives != 0 {
			AuraApi.QuestProgressAddObjectives(builder, objectives)
		}
		offsets = append(offsets, AuraApi.QuestProgressEnd(builder))
	}

	AuraApi.GameStateStartQuestProgressVector(builder, len(offsets))
	for k := len(offsets) - 1; k >= 0; k-- {
		builder.PrependUOffsetT(offsets[k])
	}
	return builder.EndVector(len(offsets))
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
	conversation := ConversationMarshalFlatbuf(gs.Player.Conversation(), builder)
	questProgress := QuestProgressMarshalFlatbuf(gs.Player.QuestLedger().Snapshot(), builder)
	// The map's campfire markers (plan-world-map.md C2). Both are one-shots: on
	// almost every tick these are empty and add nothing to the buffer. Built
	// here with everything else, because strings and vectors cannot be created
	// once GameStateStart has opened the table.
	var homeCampfire flatbuffers.UOffsetT
	if home := gs.Player.HomeCampfire(); home != "" {
		homeCampfire = builder.CreateString(home)
	}
	discoveredCampfires := DiscoveredCampfiresMarshalFlatbuf(gs.Player.DiscoveredCampfires(), builder)

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
	// The cost-reduction passive's multiplier (R1/F2). The server has always
	// applied it in effectCostHP; without it on the wire the tooltip renders a
	// price the player is not charged, which is exactly what the PO reported
	// after the feel pass. Neutral 1 is the field default, so an unmodified
	// player adds no bytes.
	AuraApi.GameStateAddCostFactor(builder, gs.Player.SkillComponent().Derived.CostFactor())
	// The damageDealt passive's multiplier (round-7 item 5) — Strong's answer
	// to the same worked-but-invisible defect. Neutral 1 is the field default,
	// so an unmodified player adds no bytes.
	AuraApi.GameStateAddDamageFactor(builder, gs.Player.SkillComponent().Derived.DamageFactor())
	// The Camp charge store (plan-downtime.md C2): owner-only data like
	// skill_points above. Only the COUNT rides the wire — the client derives
	// the cap from the level it already has, through the shared cap curve, so
	// the button can read "2/3" off one field.
	AuraApi.GameStateAddCampCharges(builder, uint8(min(max(gs.Player.CampCharges(), 0), 255)))

	// Cast bar (skill-vocab chunk 4): the running cast, read live off the
	// component each tick; absent fields read as 0 = no cast.
	sc := gs.Player.SkillComponent()
	if es := sc.CastingSkill(); es != nil {
		AuraApi.GameStateAddCastSkillId(builder, uint16(es.Def.ID))
		AuraApi.GameStateAddCastTicksLeft(builder, uint16(sc.CastTicksLeft))
		AuraApi.GameStateAddCastTicksTotal(builder, uint16(es.EffectiveCastTicks()))
	}
	// A baseline-utility cast rides the same two tick fields — one cast at a
	// time, so cast_skill_id and cast_utility are never both nonzero
	// (plan-downtime.md C1). The client's bar only needs the label source.
	if ud := sc.CastingUtilityDef(); ud != nil {
		AuraApi.GameStateAddCastUtility(builder, uint8(ud.Kind))
		AuraApi.GameStateAddCastTicksLeft(builder, uint16(sc.CastTicksLeft))
		AuraApi.GameStateAddCastTicksTotal(builder, uint16(ud.CastTicks))
	}
	// Rejection feedback (chunk 4, §3.5): per-tick one-shot, campfire_bound
	// lifecycle — stamped by the SkillSystem, cleared in ResetTickNumbers.
	if id, reason := gs.Player.ActivationRejected(); reason != model.ActivationRejectedNone {
		AuraApi.GameStateAddActivationRejectedSkillId(builder, uint16(id))
		AuraApi.GameStateAddActivationRejectedReason(builder, AuraApi.ActivationRejection(reason))
	}
	// Who the player can talk to right now (chunk 3b-i). Unlike the fields
	// above this is live STATE, not a one-shot: it is re-stamped every tick by
	// the InteractionSystem while the player stands in range, and 0 (the
	// default, so nothing is written) means nobody.
	if id := gs.Player.Interactable(); id != 0 {
		AuraApi.GameStateAddInteractableEntityId(builder, id)
	}
	// The open conversation tree (chunk 3b-ii). Writing NOTHING when there is no
	// panel is load-bearing: an absent field is the client's only close signal,
	// so every server-side end condition needs no client counterpart.
	if conversation != 0 {
		AuraApi.GameStateAddConversation(builder, conversation)
	}
	// The quest ledger (chunk C3): live STATE re-sent every tick like the
	// spellbook, because EntityMessage is a garnish channel that drops on a full
	// buffer (L8). Nothing written while the player has no quests.
	if questProgress != 0 {
		AuraApi.GameStateAddQuestProgress(builder, questProgress)
	}
	// The map's campfire markers (plan-world-map.md C2): one-shots published on
	// entering the world and on completing a dwell, absent on every other tick.
	// Absent means "no change" — see the schema note; the set only grows, so
	// there is no cleared state for absence to be confused with.
	if homeCampfire != 0 {
		AuraApi.GameStateAddHomeCampfire(builder, homeCampfire)
	}
	if discoveredCampfires != 0 {
		AuraApi.GameStateAddDiscoveredCampfires(builder, discoveredCampfires)
	}

	return AuraApi.GameStateEnd(builder)
}

// DiscoveredCampfiresMarshalFlatbuf builds the spawn-point id vector, or 0 when
// there is nothing to publish this tick.
func DiscoveredCampfiresMarshalFlatbuf(ids []string, builder *flatbuffers.Builder) flatbuffers.UOffsetT {
	if len(ids) == 0 {
		return 0
	}
	offsets := make([]flatbuffers.UOffsetT, 0, len(ids))
	for _, id := range ids {
		offsets = append(offsets, builder.CreateString(id))
	}
	AuraApi.GameStateStartDiscoveredCampfiresVector(builder, len(offsets))
	// Prepend in reverse so index 0 lands at the lowest address — the same rule
	// every vector here follows. The set is sorted, and staying sorted on the
	// wire is what keeps a harness assertion about it stable.
	for k := len(offsets) - 1; k >= 0; k-- {
		builder.PrependUOffsetT(offsets[k])
	}
	return builder.EndVector(len(offsets))
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

	offsets := make([]flatbuffers.UOffsetT, 0, n)
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
	// Prepend in reverse so index 0 lands at the lowest address — the same
	// rule as every other vector in this file. Prepending forward used to
	// emit the entities reversed; harmless (the client keys on id) but it
	// made this the one vector that disagreed with the others.
	for i := len(offsets) - 1; i >= 0; i-- {
		builder.PrependUOffsetT(offsets[i])
	}
	return builder.EndVector(n)
}

// PropEntityFlatbufMarshal marshals a static prop through the Resource wire
// table. Props carry no status effects, so the vector is always empty.
// (The harvest-era capacity/stock pair went with the pre-accounts hygiene
// chunk: the client scaled a resource sprite by stock/capacity, and this wrote
// a constant 1/1 for every prop — a ratio that could only ever be 1 once the
// §26 prune emptied the resource system.)
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

	// The authored orientation (plan-prop-scale.md C2) — the same line
	// Character and Mob already have. ⚑ Free when it is 0: the field is last
	// in the table, so the builder both skips the value and trims the vtable
	// slot, and an unrotated world streams byte-for-byte what it streamed
	// before this chunk.
	AuraApi.ResourceAddRotation(builder, e.Angle())

	return AuraApi.ResourceEnd(builder)
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
