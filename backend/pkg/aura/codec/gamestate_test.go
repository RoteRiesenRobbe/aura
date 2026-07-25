package codec

import (
	"testing"

	flatbuffers "github.com/google/flatbuffers/go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/RoteRiesenRobbe/aura/pkg/api/AuraApi"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/prop"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
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
	sc.CooldownSlots[1].CdTicks = 120

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
	assert.Equal(t, byte(1), result.ActivationRejectedReason())
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
