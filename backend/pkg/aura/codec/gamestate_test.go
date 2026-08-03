package codec

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/api/AuraApi"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/prop"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/quests"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	flatbuffers "github.com/google/flatbuffers/go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSpellbookMarshalFlatbuf_RoundTrip(t *testing.T) {
	sc := skills.NewSkillComponent(true)
	sc.Discover(skills.SkillID(1))
	sc.Discover(skills.SkillID(2))

	b := flatbuffers.NewBuilder(128)

	spellbook := SpellbookMarshalFlatbuf(sc, b)

	AuraApi.GameStateStart(b)
	AuraApi.GameStateAddSpellbook(b, spellbook)
	gs := AuraApi.GameStateEnd(b)
	b.Finish(gs)

	result := AuraApi.GetRootAsGameState(b.FinishedBytes(), 0)

	require.Equal(t, 2, result.SpellbookLength())
	// Discovered() returns IDs ascending; the codec must preserve that order on the wire.
	assert.Equal(t, uint16(1), result.Spellbook(0))
	assert.Equal(t, uint16(2), result.Spellbook(1))
}

func TestSpellbookLevelsMarshalFlatbuf_ParallelToSpellbook(t *testing.T) {
	defA := &skills.SkillDefinition{ID: 1, Name: "A", MaxLevel: 5}
	defC := &skills.SkillDefinition{ID: 3, Name: "C", MaxLevel: 5}
	sc := skills.NewSkillComponent(true)
	sc.Discover(defA.ID)
	sc.Discover(defC.ID)
	require.True(t, sc.RaiseSkillLevel(defC))
	require.True(t, sc.RaiseSkillLevel(defC)) // A at 1, C at 3

	b := flatbuffers.NewBuilder(128)

	spellbook := SpellbookMarshalFlatbuf(sc, b)
	levels := SpellbookLevelsMarshalFlatbuf(sc, b)

	AuraApi.GameStateStart(b)
	AuraApi.GameStateAddSpellbook(b, spellbook)
	AuraApi.GameStateAddSpellbookLevels(b, levels)
	gs := AuraApi.GameStateEnd(b)
	b.Finish(gs)

	result := AuraApi.GetRootAsGameState(b.FinishedBytes(), 0)

	require.Equal(t, 2, result.SpellbookLength())
	require.Equal(t, 2, result.SpellbookLevelsLength())
	// Positionally parallel: index i of spellbook_levels belongs to spellbook[i].
	assert.Equal(t, uint16(1), result.Spellbook(0))
	assert.Equal(t, byte(1), result.SpellbookLevels(0))
	assert.Equal(t, uint16(3), result.Spellbook(1))
	assert.Equal(t, byte(3), result.SpellbookLevels(1))
}

func TestPassiveSlotsMarshalFlatbuf_PositionalOrder(t *testing.T) {
	// Equip passive slots 0 and 2; wire must read [id0, 0, id2].
	sc := skills.NewSkillComponent(true)
	def0 := &skills.SkillDefinition{ID: 10, Name: "Swift"}
	def2 := &skills.SkillDefinition{ID: 11, Name: "TankPassive"}
	sc.EquipPassive(0, def0, 1)
	sc.EquipPassive(2, def2, 1)

	b := flatbuffers.NewBuilder(128)

	passiveSlots := PassiveSlotsMarshalFlatbuf(sc, b)

	AuraApi.GameStateStart(b)
	AuraApi.GameStateAddPassiveSlots(b, passiveSlots)
	gs := AuraApi.GameStateEnd(b)
	b.Finish(gs)

	result := AuraApi.GetRootAsGameState(b.FinishedBytes(), 0)

	require.Equal(t, skills.MaxPassiveSlots, result.PassiveSlotsLength())
	assert.Equal(t, uint16(10), result.PassiveSlots(0))
	assert.Equal(t, uint16(0), result.PassiveSlots(1))
	assert.Equal(t, uint16(11), result.PassiveSlots(2))
}

func TestCooldownSlotsMarshalFlatbuf_ContentsAndRemaining(t *testing.T) {
	sc := skills.NewSkillComponent(true)
	nova := &skills.SkillDefinition{ID: 20, Name: "NovaBurst", CooldownTicks: 300}
	sc.EquipCooldown(1, nova, 1)
	sc.SetCooldownRemaining(nova.ID, 120)

	b := flatbuffers.NewBuilder(128)

	slots := CooldownSlotsMarshalFlatbuf(sc, b)
	remaining := CooldownRemainingMarshalFlatbuf(sc, b)

	AuraApi.GameStateStart(b)
	AuraApi.GameStateAddCooldownSlots(b, slots)
	AuraApi.GameStateAddCooldownRemainingTicks(b, remaining)
	gs := AuraApi.GameStateEnd(b)
	b.Finish(gs)

	result := AuraApi.GetRootAsGameState(b.FinishedBytes(), 0)

	require.Equal(t, skills.MaxCooldownSlots, result.CooldownSlotsLength())
	require.Equal(t, skills.MaxCooldownSlots, result.CooldownRemainingTicksLength())
	assert.Equal(t, uint16(0), result.CooldownSlots(0), "empty slot")
	assert.Equal(t, uint16(0), result.CooldownRemainingTicks(0))
	assert.Equal(t, uint16(20), result.CooldownSlots(1))
	assert.Equal(t, uint16(120), result.CooldownRemainingTicks(1))
}

func TestGameStateSkillPoints_RoundTrip(t *testing.T) {
	b := flatbuffers.NewBuilder(64)

	AuraApi.GameStateStart(b)
	AuraApi.GameStateAddSkillPoints(b, 7)
	gs := AuraApi.GameStateEnd(b)
	b.Finish(gs)

	result := AuraApi.GetRootAsGameState(b.FinishedBytes(), 0)

	assert.Equal(t, uint16(7), result.SkillPoints())
}

// The cost factor rides the same owner-only slot as skill_points (R1/F2). Its
// neutral value is the FIELD DEFAULT, which is the half worth pinning: an
// unmodified player writes nothing and the client must still read 1, or every
// tooltip on every player without Discipline reads a cost of zero.
func TestGameStateCostFactor_RoundTrip(t *testing.T) {
	b := flatbuffers.NewBuilder(64)

	AuraApi.GameStateStart(b)
	AuraApi.GameStateAddCostFactor(b, 0.8)
	gs := AuraApi.GameStateEnd(b)
	b.Finish(gs)

	assert.Equal(t, float32(0.8), AuraApi.GetRootAsGameState(b.FinishedBytes(), 0).CostFactor())

	unwritten := flatbuffers.NewBuilder(64)
	AuraApi.GameStateStart(unwritten)
	unwritten.Finish(AuraApi.GameStateEnd(unwritten))

	assert.Equal(t, float32(1),
		AuraApi.GetRootAsGameState(unwritten.FinishedBytes(), 0).CostFactor(),
		"an absent cost factor must read as neutral, not as zero")
}

// The damage factor is cost_factor's twin (round-7 item 5, Strong): the same
// owner-only slot, the same neutral-by-field-default contract — an unmodified
// player writes nothing and the client must still read 1, or every damage
// tooltip on a player without Strong reads zero.
func TestGameStateDamageFactor_RoundTrip(t *testing.T) {
	b := flatbuffers.NewBuilder(64)

	AuraApi.GameStateStart(b)
	AuraApi.GameStateAddDamageFactor(b, 1.1)
	gs := AuraApi.GameStateEnd(b)
	b.Finish(gs)

	assert.Equal(t, float32(1.1), AuraApi.GetRootAsGameState(b.FinishedBytes(), 0).DamageFactor())

	unwritten := flatbuffers.NewBuilder(64)
	AuraApi.GameStateStart(unwritten)
	unwritten.Finish(AuraApi.GameStateEnd(unwritten))

	assert.Equal(t, float32(1),
		AuraApi.GetRootAsGameState(unwritten.FinishedBytes(), 0).DamageFactor(),
		"an absent damage factor must read as neutral, not as zero")
}

func TestSpellbookMarshalFlatbuf_Empty(t *testing.T) {
	sc := skills.NewSkillComponent(true)

	b := flatbuffers.NewBuilder(64)

	spellbook := SpellbookMarshalFlatbuf(sc, b)

	AuraApi.GameStateStart(b)
	AuraApi.GameStateAddSpellbook(b, spellbook)
	gs := AuraApi.GameStateEnd(b)
	b.Finish(gs)

	result := AuraApi.GetRootAsGameState(b.FinishedBytes(), 0)

	assert.Equal(t, 0, result.SpellbookLength())
}

func TestAuraSlotsMarshalFlatbuf_PositionalOrder(t *testing.T) {
	// Equip slots 0 and 2; slot 1 empty.
	// Wire must read [id0, 0, id2] — empty middle slot must survive.
	sc := skills.NewSkillComponent(true)
	def0 := &skills.SkillDefinition{ID: 1, Name: "Damage"}
	def2 := &skills.SkillDefinition{ID: 2, Name: "Heal"}
	sc.EquipAura(0, def0, 1)
	sc.EquipAura(2, def2, 1)

	b := flatbuffers.NewBuilder(128)
	auraSlots := AuraSlotsMarshalFlatbuf(sc, b)
	AuraApi.GameStateStart(b)
	AuraApi.GameStateAddAuraSlots(b, auraSlots)
	gs := AuraApi.GameStateEnd(b)
	b.Finish(gs)

	result := AuraApi.GetRootAsGameState(b.FinishedBytes(), 0)
	require.Equal(t, skills.MaxAuraSlots, result.AuraSlotsLength())
	assert.Equal(t, uint16(1), result.AuraSlots(0), "slot 0 = Damage")
	assert.Equal(t, uint16(0), result.AuraSlots(1), "slot 1 = empty")
	assert.Equal(t, uint16(2), result.AuraSlots(2), "slot 2 = Heal")
}

func TestAuraSlotsMarshalFlatbuf_AllEmpty(t *testing.T) {
	sc := skills.NewSkillComponent(true)

	b := flatbuffers.NewBuilder(64)
	auraSlots := AuraSlotsMarshalFlatbuf(sc, b)
	AuraApi.GameStateStart(b)
	AuraApi.GameStateAddAuraSlots(b, auraSlots)
	gs := AuraApi.GameStateEnd(b)
	b.Finish(gs)

	result := AuraApi.GetRootAsGameState(b.FinishedBytes(), 0)
	require.Equal(t, skills.MaxAuraSlots, result.AuraSlotsLength())
	for i := 0; i < skills.MaxAuraSlots; i++ {
		assert.Equal(t, uint16(0), result.AuraSlots(i))
	}
}

func TestActiveSkillID_ActiveSlotYieldsSkillID(t *testing.T) {
	sc := skills.NewSkillComponent(true)
	sc.EquipAura(1, &skills.SkillDefinition{ID: 2, Name: "Heal"}, 1)
	sc.SetActiveAura(1)

	assert.Equal(t, uint16(2), ActiveSkillID(sc))
}

func TestActiveSkillID_NothingActiveYieldsZero(t *testing.T) {
	sc := skills.NewSkillComponent(true)
	sc.EquipAura(0, &skills.SkillDefinition{ID: 1, Name: "Damage"}, 1)

	assert.Equal(t, uint16(0), ActiveSkillID(sc))
}

func TestActiveSkillID_ActiveButEmptySlotYieldsZero(t *testing.T) {
	sc := skills.NewSkillComponent(true)
	sc.SetActiveAura(2) // slot 2 was never equipped

	assert.Equal(t, uint16(0), ActiveSkillID(sc))
}

func TestCharacterActiveSkillId_RoundTrip(t *testing.T) {
	b := flatbuffers.NewBuilder(64)
	AuraApi.CharacterStart(b)
	AuraApi.CharacterAddActiveSkillId(b, 2)
	c := AuraApi.CharacterEnd(b)
	b.Finish(c)

	result := AuraApi.GetRootAsCharacter(b.FinishedBytes(), 0)
	assert.Equal(t, uint16(2), result.ActiveSkillId())
}

func TestCharacterActiveSkillId_AbsentReadsZero(t *testing.T) {
	b := flatbuffers.NewBuilder(64)
	AuraApi.CharacterStart(b)
	c := AuraApi.CharacterEnd(b)
	b.Finish(c)

	result := AuraApi.GetRootAsCharacter(b.FinishedBytes(), 0)
	assert.Equal(t, uint16(0), result.ActiveSkillId(), "absent field must read as 0 = Nothing")
}

func TestGameStateActiveAuraSlot_RoundTrip(t *testing.T) {
	b := flatbuffers.NewBuilder(64)
	AuraApi.GameStateStart(b)
	AuraApi.GameStateAddActiveAuraSlot(b, 2)
	gs := AuraApi.GameStateEnd(b)
	b.Finish(gs)

	result := AuraApi.GetRootAsGameState(b.FinishedBytes(), 0)
	assert.Equal(t, int8(2), result.ActiveAuraSlot())
}

func TestGameStateActiveAuraSlot_AbsentReadsMinusOne(t *testing.T) {
	// Server→client the -1 default and an absent field are semantically
	// identical (Nothing) — this pins the claim that no sentinel is needed
	// in this direction (unlike the client→server -2 deactivate sentinel).
	b := flatbuffers.NewBuilder(64)
	AuraApi.GameStateStart(b)
	gs := AuraApi.GameStateEnd(b)
	b.Finish(gs)

	result := AuraApi.GetRootAsGameState(b.FinishedBytes(), 0)
	assert.Equal(t, int8(-1), result.ActiveAuraSlot())
}

func TestSpellbookMarshalFlatbuf_NilSpellbook(t *testing.T) {
	sc := skills.NewSkillComponent(false) // mob — nil spellbook

	b := flatbuffers.NewBuilder(64)

	spellbook := SpellbookMarshalFlatbuf(sc, b)

	AuraApi.GameStateStart(b)
	AuraApi.GameStateAddSpellbook(b, spellbook)
	gs := AuraApi.GameStateEnd(b)
	b.Finish(gs)

	result := AuraApi.GetRootAsGameState(b.FinishedBytes(), 0)

	assert.Equal(t, 0, result.SpellbookLength())
}

// --- cast bar + rejection feedback wire (plan-skill-vocab chunk 4) ---

func TestGameStateCastAndRejection_RoundTrip(t *testing.T) {
	b := flatbuffers.NewBuilder(64)
	AuraApi.GameStateStart(b)
	AuraApi.GameStateAddCastSkillId(b, 28)
	AuraApi.GameStateAddCastTicksLeft(b, 120)
	AuraApi.GameStateAddCastTicksTotal(b, 300)
	AuraApi.GameStateAddActivationRejectedSkillId(b, 28)
	AuraApi.GameStateAddActivationRejectedReason(b, 1)
	gs := AuraApi.GameStateEnd(b)
	b.Finish(gs)

	result := AuraApi.GetRootAsGameState(b.FinishedBytes(), 0)
	assert.Equal(t, uint16(28), result.CastSkillId())
	assert.Equal(t, uint16(120), result.CastTicksLeft())
	assert.Equal(t, uint16(300), result.CastTicksTotal())
	assert.Equal(t, uint16(28), result.ActivationRejectedSkillId())
	assert.Equal(t, AuraApi.ActivationRejectionNoAnchor, result.ActivationRejectedReason())
}

func TestGameStateCastAndRejection_AbsentReadsZero(t *testing.T) {
	// The codec omits the fields when idle; old and new clients read 0 = none.
	b := flatbuffers.NewBuilder(64)
	AuraApi.GameStateStart(b)
	gs := AuraApi.GameStateEnd(b)
	b.Finish(gs)

	result := AuraApi.GetRootAsGameState(b.FinishedBytes(), 0)
	assert.Zero(t, result.CastSkillId())
	assert.Zero(t, result.CastTicksLeft())
	assert.Zero(t, result.CastTicksTotal())
	assert.Zero(t, result.ActivationRejectedSkillId())
	assert.Zero(t, result.ActivationRejectedReason())
	assert.Zero(t, result.CastUtility(), "absent cast_utility reads 0 = no utility cast")
	assert.Zero(t, result.CampCharges(), "absent camp_charges reads 0 = none held")
}

// The camp charge counter (plan-downtime.md C2, D3). Own-player data like
// skill_points, and 0 IS the meaningful neutral here — a fresh character holds
// none until their first dwell — so unlike cost_factor there is no
// absent-must-not-read-zero trap; the pin is that the value survives the trip.
func TestGameStateCampCharges_RoundTrip(t *testing.T) {
	b := flatbuffers.NewBuilder(64)
	AuraApi.GameStateStart(b)
	AuraApi.GameStateAddCampCharges(b, 3)
	gs := AuraApi.GameStateEnd(b)
	b.Finish(gs)

	assert.Equal(t, uint8(3), AuraApi.GetRootAsGameState(b.FinishedBytes(), 0).CampCharges())
}

// A baseline-utility cast rides the same two tick fields with cast_utility as
// the label source (plan-downtime.md C1).
func TestGameStateCastUtility_RoundTrip(t *testing.T) {
	b := flatbuffers.NewBuilder(64)
	AuraApi.GameStateStart(b)
	AuraApi.GameStateAddCastUtility(b, uint8(AuraApi.UtilityKindRecall))
	AuraApi.GameStateAddCastTicksLeft(b, 120)
	AuraApi.GameStateAddCastTicksTotal(b, 300)
	gs := AuraApi.GameStateEnd(b)
	b.Finish(gs)

	result := AuraApi.GetRootAsGameState(b.FinishedBytes(), 0)
	assert.Equal(t, uint8(AuraApi.UtilityKindRecall), result.CastUtility())
	assert.Zero(t, result.CastSkillId(), "one cast at a time — no slot skill during a utility cast")
	assert.Equal(t, uint16(120), result.CastTicksLeft())
	assert.Equal(t, uint16(300), result.CastTicksTotal())
}

// --- the interact prompt wire (plan-entity-model.md chunk 3b-i) ---

func TestGameStateInteractable_RoundTrip(t *testing.T) {
	b := flatbuffers.NewBuilder(64)
	AuraApi.GameStateStart(b)
	AuraApi.GameStateAddInteractableEntityId(b, 4711)
	gs := AuraApi.GameStateEnd(b)
	b.Finish(gs)

	result := AuraApi.GetRootAsGameState(b.FinishedBytes(), 0)
	assert.Equal(t, uint64(4711), result.InteractableEntityId())
}

func TestGameStateInteractable_AbsentReadsZero(t *testing.T) {
	// The codec omits the field when nobody is in range, and entity ids start
	// at 1, so 0 is an unambiguous "nobody" for old and new clients alike.
	b := flatbuffers.NewBuilder(64)
	AuraApi.GameStateStart(b)
	gs := AuraApi.GameStateEnd(b)
	b.Finish(gs)

	result := AuraApi.GetRootAsGameState(b.FinishedBytes(), 0)
	assert.Zero(t, result.InteractableEntityId())
}

// --- the conversation tree wire (plan-entity-model.md chunk 3b-ii) ---

// ⚑ The first payload on this channel that is a VECTOR OF TABLES INSIDE A
// TABLE, and FlatBuffers builds inside out — every string and nested vector has
// to be finished before the table referencing it is started. Getting that order
// wrong does not fail to compile and does not panic; it silently writes a tree
// whose strings belong to the wrong rows. Hence a round-trip that reads every
// field of a two-node, three-row tree back out.
func TestGameStateConversation_RoundTrip(t *testing.T) {
	c := &model.Conversation{
		EntityID:  4711,
		ActorName: "Emberkeeper",
		EntryNode: "root",
		Nodes: []model.ConversationNode{
			{
				ID:    "root",
				Lines: []string{"Fire remembers who feeds it.", "What would you have?"},
				Options: []model.ConversationOption{
					{OptionIndex: 0, GrantIndex: model.ConversationNoGrant, Text: "Anything new?", Next: "news"},
					{OptionIndex: 1, GrantIndex: 0, Text: "Torch", Reply: "a light in dark places"},
					{OptionIndex: 1, GrantIndex: 2, Text: "Immolate", Locked: true, RequiredLevel: 12,
						Reply: "Fire doesn't suffer the careless."},
				},
			},
			{ID: "news", Lines: []string{"They burned this forest."}},
		},
	}

	b := flatbuffers.NewBuilder(256)
	offset := ConversationMarshalFlatbuf(c, b)
	AuraApi.GameStateStart(b)
	AuraApi.GameStateAddConversation(b, offset)
	b.Finish(AuraApi.GameStateEnd(b))

	got := AuraApi.GetRootAsGameState(b.FinishedBytes(), 0).Conversation(nil)
	require.NotNil(t, got)
	assert.Equal(t, uint64(4711), got.EntityId())
	assert.Equal(t, "Emberkeeper", string(got.ActorName()))
	assert.Equal(t, "root", string(got.EntryNode()))
	require.Equal(t, 2, got.NodesLength())

	var root AuraApi.ConversationNode
	require.True(t, got.Nodes(&root, 0))
	assert.Equal(t, "root", string(root.Id()))
	require.Equal(t, 2, root.LinesLength())
	assert.Equal(t, "Fire remembers who feeds it.", string(root.Lines(0)), "line order survives the reversal")
	assert.Equal(t, "What would you have?", string(root.Lines(1)))
	require.Equal(t, 3, root.OptionsLength())

	var nav, torch, immolate AuraApi.ConversationOption
	require.True(t, root.Options(&nav, 0))
	require.True(t, root.Options(&torch, 1))
	require.True(t, root.Options(&immolate, 2))

	assert.Equal(t, "Anything new?", string(nav.Text()), "row order survives the reversal too")
	assert.Equal(t, model.ConversationNoGrant, nav.GrantIndex())
	assert.Equal(t, "news", string(nav.Next()))

	assert.Equal(t, "Torch", string(torch.Text()))
	assert.EqualValues(t, 1, torch.OptionIndex())
	assert.EqualValues(t, 0, torch.GrantIndex())
	assert.Equal(t, "a light in dark places", string(torch.Reply()))
	assert.False(t, torch.Locked())

	// ⚑ L21 across the wire: two rows from the SAME authored option, telling
	// themselves apart only by grant index. If the marshaller ever collapsed
	// them, a click would teach the wrong skill.
	assert.EqualValues(t, 1, immolate.OptionIndex())
	assert.EqualValues(t, 2, immolate.GrantIndex())
	assert.True(t, immolate.Locked())
	assert.EqualValues(t, 12, immolate.RequiredLevel())
	assert.Equal(t, "Fire doesn't suffer the careless.", string(immolate.Reply()))

	var news AuraApi.ConversationNode
	require.True(t, got.Nodes(&news, 1))
	assert.Equal(t, "news", string(news.Id()))
	assert.Zero(t, news.OptionsLength(), "a leaf reply has no rows")
}

// An absent conversation IS the close signal (D16), so no-panel must marshal to
// nothing rather than to an empty table.
func TestGameStateConversation_AbsentReadsNil(t *testing.T) {
	b := flatbuffers.NewBuilder(64)
	assert.Zero(t, ConversationMarshalFlatbuf(nil, b), "nil writes no table at all")

	AuraApi.GameStateStart(b)
	b.Finish(AuraApi.GameStateEnd(b))

	assert.Nil(t, AuraApi.GetRootAsGameState(b.FinishedBytes(), 0).Conversation(nil),
		"the client reads absent, which is how every server-side end condition reaches it")
}

// resourceIDAt reads the entity at index j as a Resource and returns its id.
// Every entity the test below marshals is a prop, which rides the Resource
// wire table (PropEntityFlatbufMarshal).
func resourceIDAt(t *testing.T, gs *AuraApi.GameState, j int) uint64 {
	t.Helper()

	var ent AuraApi.Entity
	require.True(t, gs.Entities(&ent, j), "entity %d missing", j)
	require.Equal(t, AuraApi.AnyEntityResource, ent.EType())

	var tbl flatbuffers.Table
	require.True(t, ent.E(&tbl), "entity %d carries no union payload", j)

	var res AuraApi.Resource
	res.Init(tbl.Bytes, tbl.Pos)
	return res.Id()
}

func TestEntitiesMarshalFlatbuf_LengthAndOrder(t *testing.T) {
	// The entities vector is rebuilt for every player, every tick — the
	// hottest allocation path in the server — and nothing pinned it before.
	// It must carry exactly len(entities) elements, in input order (the
	// prepend-in-reverse rule every other vector in this file follows).
	entities := []model.Entity{
		prop.New(model.EntityType(1), phy.Vec2f{X: 1, Y: 2}, 0.5, false),
		prop.New(model.EntityType(2), phy.Vec2f{X: 3, Y: 4}, 0.5, false),
		prop.New(model.EntityType(3), phy.Vec2f{X: 5, Y: 6}, 0.5, true),
	}

	b := flatbuffers.NewBuilder(256)
	vec := EntitiesMarshalFlatbuf(entities, b)

	AuraApi.GameStateStart(b)
	AuraApi.GameStateAddEntities(b, vec)
	gs := AuraApi.GameStateEnd(b)
	b.Finish(gs)

	result := AuraApi.GetRootAsGameState(b.FinishedBytes(), 0)

	require.Equal(t, len(entities), result.EntitiesLength())
	for i, e := range entities {
		assert.Equal(t, e.Basic().ID(), resourceIDAt(t, result, i),
			"entity at index %d is not the one that was marshalled there", i)
	}
}

// L-H5: deleting Resource.capacity/stock RENUMBERED aabb, which is the one
// field that sits after them — and a mid-table renumber is the failure mode
// that decodes as garbage rather than as an error. This reads every field a
// prop actually writes back off the wire, so a slot that shifted out from under
// its reader shows up as a wrong value here instead of as a misplaced collider
// in-game.
func TestPropEntityFlatbufMarshal_FieldsSurviveTheRenumber(t *testing.T) {
	p := prop.New(model.EntityType(26), phy.Vec2f{X: 3, Y: -4}, 0.75, true)

	b := flatbuffers.NewBuilder(256)
	b.Finish(PropEntityFlatbufMarshal(p, b))

	var res AuraApi.Resource
	res.Init(b.FinishedBytes(), flatbuffers.UOffsetT(flatbuffers.GetUOffsetT(b.FinishedBytes())))

	assert.Equal(t, p.Basic().ID(), res.Id())
	assert.Equal(t, AuraApi.EntityType(26), res.EntityType())
	assert.Equal(t, f32ToU16Px(p.Radius()), res.Radius())
	assert.Zero(t, res.StatusEffectsLength())

	var pos AuraApi.Vec2f
	require.NotNil(t, res.Pos(&pos))
	assert.InDelta(t, float64(f32ToPx(3)), pos.X(), 0.0001)
	assert.InDelta(t, float64(f32ToPx(-4)), pos.Y(), 0.0001)

	// the field the renumber moved
	var aabb AuraApi.AABB
	require.NotNil(t, res.Aabb(&aabb))
	var lower, upper AuraApi.Vec2f
	require.NotNil(t, aabb.Lower(&lower))
	require.NotNil(t, aabb.Upper(&upper))
	box := p.AABB()
	assert.InDelta(t, float64(f32ToPx(box.Left)), lower.X(), 0.0001)
	assert.InDelta(t, float64(f32ToPx(box.Bottom)), lower.Y(), 0.0001)
	assert.InDelta(t, float64(f32ToPx(box.Right)), upper.X(), 0.0001)
	assert.InDelta(t, float64(f32ToPx(box.Upper)), upper.Y(), 0.0001)
}

func TestEntitiesMarshalFlatbuf_Empty(t *testing.T) {
	b := flatbuffers.NewBuilder(64)
	vec := EntitiesMarshalFlatbuf(nil, b)

	AuraApi.GameStateStart(b)
	AuraApi.GameStateAddEntities(b, vec)
	gs := AuraApi.GameStateEnd(b)
	b.Finish(gs)

	result := AuraApi.GetRootAsGameState(b.FinishedBytes(), 0)
	assert.Zero(t, result.EntitiesLength())
}

// --- the quest ledger wire (plan-quests.md chunk C3, §6) ---

// The second vector-of-tables-inside-a-table on this channel, with the same
// inside-out build hazard as the conversation tree above: a nested string vector
// (the walked path) inside each entry. Round-tripped so a mis-ordered build
// shows up as scrambled paths rather than as nothing at all.
func TestGameStateQuestProgress_RoundTrip(t *testing.T) {
	entries := []quests.ProgressEntry{
		{QuestID: "choice", Path: []string{"choose", "a-end"}, Completed: true},
		{QuestID: "wolf-cull", Path: []string{"cull"}, Objectives: []string{"1/3 Wolf slain", "Talk to the Farmer"}},
	}

	b := flatbuffers.NewBuilder(256)
	offset := QuestProgressMarshalFlatbuf(entries, b)
	AuraApi.GameStateStart(b)
	AuraApi.GameStateAddQuestProgress(b, offset)
	b.Finish(AuraApi.GameStateEnd(b))

	got := AuraApi.GetRootAsGameState(b.FinishedBytes(), 0)
	require.Equal(t, 2, got.QuestProgressLength())

	var done, running AuraApi.QuestProgress
	require.True(t, got.QuestProgress(&done, 0))
	require.True(t, got.QuestProgress(&running, 1))

	assert.Equal(t, "choice", string(done.QuestId()), "entry order survives the reversal")
	require.Equal(t, 2, done.StagesLength())
	assert.Equal(t, "choose", string(done.Stages(0)), "the walked path keeps its order (L6)")
	assert.Equal(t, "a-end", string(done.Stages(1)))
	assert.True(t, done.Completed())
	assert.Zero(t, done.ObjectivesLength(), "a completed quest carries no objective line (Q2 §7.1)")

	assert.Equal(t, "wolf-cull", string(running.QuestId()))
	require.Equal(t, 1, running.StagesLength())
	assert.Equal(t, "cull", string(running.Stages(0)))
	assert.False(t, running.Completed())
	// Q2: the composed lines ride beside the path, order preserved — the same
	// prepend-reversal rule as the stages vector.
	require.Equal(t, 2, running.ObjectivesLength())
	assert.Equal(t, "1/3 Wolf slain", string(running.Objectives(0)))
	assert.Equal(t, "Talk to the Farmer", string(running.Objectives(1)))
}

// A player with no quests writes no vector at all, which the client reads as an
// empty journal — the shipped state until C4 authors content.
func TestGameStateQuestProgress_EmptyWritesNothing(t *testing.T) {
	b := flatbuffers.NewBuilder(64)
	assert.Zero(t, QuestProgressMarshalFlatbuf(nil, b), "nil writes no vector at all")

	AuraApi.GameStateStart(b)
	b.Finish(AuraApi.GameStateEnd(b))

	assert.Zero(t, AuraApi.GetRootAsGameState(b.FinishedBytes(), 0).QuestProgressLength())
}
