package codec

import (
	"testing"

	flatbuffers "github.com/google/flatbuffers/go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/trichner/berryhunter/pkg/api/BerryhunterApi"
	"github.com/trichner/berryhunter/pkg/berryhunter/skills"
)

func TestSpellbookMarshalFlatbuf_RoundTrip(t *testing.T) {
	sc := skills.NewSkillComponent(true)
	sc.Discover(skills.SkillID(1))
	sc.Discover(skills.SkillID(2))

	b := flatbuffers.NewBuilder(128)

	spellbook := SpellbookMarshalFlatbuf(sc, b)

	BerryhunterApi.GameStateStart(b)
	BerryhunterApi.GameStateAddSpellbook(b, spellbook)
	gs := BerryhunterApi.GameStateEnd(b)
	b.Finish(gs)

	result := BerryhunterApi.GetRootAsGameState(b.FinishedBytes(), 0)

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

	BerryhunterApi.GameStateStart(b)
	BerryhunterApi.GameStateAddSpellbook(b, spellbook)
	BerryhunterApi.GameStateAddSpellbookLevels(b, levels)
	gs := BerryhunterApi.GameStateEnd(b)
	b.Finish(gs)

	result := BerryhunterApi.GetRootAsGameState(b.FinishedBytes(), 0)

	require.Equal(t, 2, result.SpellbookLength())
	require.Equal(t, 2, result.SpellbookLevelsLength())
	// Positionally parallel: index i of spellbook_levels belongs to spellbook[i].
	assert.Equal(t, uint16(1), result.Spellbook(0))
	assert.Equal(t, byte(1), result.SpellbookLevels(0))
	assert.Equal(t, uint16(3), result.Spellbook(1))
	assert.Equal(t, byte(3), result.SpellbookLevels(1))
}

func TestPassiveSlotsMarshalFlatbuf_PositionalOrder(t *testing.T) {
	// Equip passive slots 0 and 2; wire must read [id0, 0, id2, 0].
	sc := skills.NewSkillComponent(true)
	def0 := &skills.SkillDefinition{ID: 10, Name: "SwiftPassive"}
	def2 := &skills.SkillDefinition{ID: 11, Name: "TankPassive"}
	sc.EquipPassive(0, def0, 1)
	sc.EquipPassive(2, def2, 1)

	b := flatbuffers.NewBuilder(128)

	passiveSlots := PassiveSlotsMarshalFlatbuf(sc, b)

	BerryhunterApi.GameStateStart(b)
	BerryhunterApi.GameStateAddPassiveSlots(b, passiveSlots)
	gs := BerryhunterApi.GameStateEnd(b)
	b.Finish(gs)

	result := BerryhunterApi.GetRootAsGameState(b.FinishedBytes(), 0)

	require.Equal(t, skills.MaxPassiveSlots, result.PassiveSlotsLength())
	assert.Equal(t, uint16(10), result.PassiveSlots(0))
	assert.Equal(t, uint16(0), result.PassiveSlots(1))
	assert.Equal(t, uint16(11), result.PassiveSlots(2))
	assert.Equal(t, uint16(0), result.PassiveSlots(3))
}

func TestCooldownSlotsMarshalFlatbuf_ContentsAndRemaining(t *testing.T) {
	sc := skills.NewSkillComponent(true)
	nova := &skills.SkillDefinition{ID: 20, Name: "NovaBurst", CooldownTicks: 300}
	sc.EquipCooldown(1, nova, 1)
	sc.CooldownSlots[1].CdTicks = 120

	b := flatbuffers.NewBuilder(128)

	slots := CooldownSlotsMarshalFlatbuf(sc, b)
	remaining := CooldownRemainingMarshalFlatbuf(sc, b)

	BerryhunterApi.GameStateStart(b)
	BerryhunterApi.GameStateAddCooldownSlots(b, slots)
	BerryhunterApi.GameStateAddCooldownRemainingTicks(b, remaining)
	gs := BerryhunterApi.GameStateEnd(b)
	b.Finish(gs)

	result := BerryhunterApi.GetRootAsGameState(b.FinishedBytes(), 0)

	require.Equal(t, skills.MaxCooldownSlots, result.CooldownSlotsLength())
	require.Equal(t, skills.MaxCooldownSlots, result.CooldownRemainingTicksLength())
	assert.Equal(t, uint16(0), result.CooldownSlots(0), "empty slot")
	assert.Equal(t, uint16(0), result.CooldownRemainingTicks(0))
	assert.Equal(t, uint16(20), result.CooldownSlots(1))
	assert.Equal(t, uint16(120), result.CooldownRemainingTicks(1))
}

func TestGameStateSkillPoints_RoundTrip(t *testing.T) {
	b := flatbuffers.NewBuilder(64)

	BerryhunterApi.GameStateStart(b)
	BerryhunterApi.GameStateAddSkillPoints(b, 7)
	gs := BerryhunterApi.GameStateEnd(b)
	b.Finish(gs)

	result := BerryhunterApi.GetRootAsGameState(b.FinishedBytes(), 0)

	assert.Equal(t, uint16(7), result.SkillPoints())
}

func TestSpellbookMarshalFlatbuf_Empty(t *testing.T) {
	sc := skills.NewSkillComponent(true)

	b := flatbuffers.NewBuilder(64)

	spellbook := SpellbookMarshalFlatbuf(sc, b)

	BerryhunterApi.GameStateStart(b)
	BerryhunterApi.GameStateAddSpellbook(b, spellbook)
	gs := BerryhunterApi.GameStateEnd(b)
	b.Finish(gs)

	result := BerryhunterApi.GetRootAsGameState(b.FinishedBytes(), 0)

	assert.Equal(t, 0, result.SpellbookLength())
}

func TestAuraSlotsMarshalFlatbuf_PositionalOrder(t *testing.T) {
	// Equip slots 0 and 2; slots 1 and 3 empty.
	// Wire must read [id0, 0, id2, 0] — empty middle slot must survive.
	sc := skills.NewSkillComponent(true)
	def0 := &skills.SkillDefinition{ID: 1, Name: "DamageAura"}
	def2 := &skills.SkillDefinition{ID: 2, Name: "HealAura"}
	sc.EquipAura(0, def0, 1)
	sc.EquipAura(2, def2, 1)

	b := flatbuffers.NewBuilder(128)
	auraSlots := AuraSlotsMarshalFlatbuf(sc, b)
	BerryhunterApi.GameStateStart(b)
	BerryhunterApi.GameStateAddAuraSlots(b, auraSlots)
	gs := BerryhunterApi.GameStateEnd(b)
	b.Finish(gs)

	result := BerryhunterApi.GetRootAsGameState(b.FinishedBytes(), 0)
	require.Equal(t, 4, result.AuraSlotsLength())
	assert.Equal(t, uint16(1), result.AuraSlots(0), "slot 0 = DamageAura")
	assert.Equal(t, uint16(0), result.AuraSlots(1), "slot 1 = empty")
	assert.Equal(t, uint16(2), result.AuraSlots(2), "slot 2 = HealAura")
	assert.Equal(t, uint16(0), result.AuraSlots(3), "slot 3 = empty")
}

func TestAuraSlotsMarshalFlatbuf_AllEmpty(t *testing.T) {
	sc := skills.NewSkillComponent(true)

	b := flatbuffers.NewBuilder(64)
	auraSlots := AuraSlotsMarshalFlatbuf(sc, b)
	BerryhunterApi.GameStateStart(b)
	BerryhunterApi.GameStateAddAuraSlots(b, auraSlots)
	gs := BerryhunterApi.GameStateEnd(b)
	b.Finish(gs)

	result := BerryhunterApi.GetRootAsGameState(b.FinishedBytes(), 0)
	require.Equal(t, 4, result.AuraSlotsLength())
	for i := 0; i < 4; i++ {
		assert.Equal(t, uint16(0), result.AuraSlots(i))
	}
}

func TestActiveSkillID_ActiveSlotYieldsSkillID(t *testing.T) {
	sc := skills.NewSkillComponent(true)
	sc.EquipAura(1, &skills.SkillDefinition{ID: 2, Name: "HealAura"}, 1)
	sc.SetActiveAura(1)

	assert.Equal(t, uint16(2), ActiveSkillID(sc))
}

func TestActiveSkillID_NothingActiveYieldsZero(t *testing.T) {
	sc := skills.NewSkillComponent(true)
	sc.EquipAura(0, &skills.SkillDefinition{ID: 1, Name: "DamageAura"}, 1)

	assert.Equal(t, uint16(0), ActiveSkillID(sc))
}

func TestActiveSkillID_ActiveButEmptySlotYieldsZero(t *testing.T) {
	sc := skills.NewSkillComponent(true)
	sc.SetActiveAura(2) // slot 2 was never equipped

	assert.Equal(t, uint16(0), ActiveSkillID(sc))
}

func TestCharacterActiveSkillId_RoundTrip(t *testing.T) {
	b := flatbuffers.NewBuilder(64)
	BerryhunterApi.CharacterStart(b)
	BerryhunterApi.CharacterAddActiveSkillId(b, 2)
	c := BerryhunterApi.CharacterEnd(b)
	b.Finish(c)

	result := BerryhunterApi.GetRootAsCharacter(b.FinishedBytes(), 0)
	assert.Equal(t, uint16(2), result.ActiveSkillId())
}

func TestCharacterActiveSkillId_AbsentReadsZero(t *testing.T) {
	b := flatbuffers.NewBuilder(64)
	BerryhunterApi.CharacterStart(b)
	c := BerryhunterApi.CharacterEnd(b)
	b.Finish(c)

	result := BerryhunterApi.GetRootAsCharacter(b.FinishedBytes(), 0)
	assert.Equal(t, uint16(0), result.ActiveSkillId(), "absent field must read as 0 = Nothing")
}

func TestGameStateActiveAuraSlot_RoundTrip(t *testing.T) {
	b := flatbuffers.NewBuilder(64)
	BerryhunterApi.GameStateStart(b)
	BerryhunterApi.GameStateAddActiveAuraSlot(b, 2)
	gs := BerryhunterApi.GameStateEnd(b)
	b.Finish(gs)

	result := BerryhunterApi.GetRootAsGameState(b.FinishedBytes(), 0)
	assert.Equal(t, int8(2), result.ActiveAuraSlot())
}

func TestGameStateActiveAuraSlot_AbsentReadsMinusOne(t *testing.T) {
	// Server→client the -1 default and an absent field are semantically
	// identical (Nothing) — this pins the claim that no sentinel is needed
	// in this direction (unlike the client→server -2 deactivate sentinel).
	b := flatbuffers.NewBuilder(64)
	BerryhunterApi.GameStateStart(b)
	gs := BerryhunterApi.GameStateEnd(b)
	b.Finish(gs)

	result := BerryhunterApi.GetRootAsGameState(b.FinishedBytes(), 0)
	assert.Equal(t, int8(-1), result.ActiveAuraSlot())
}

func TestSpellbookMarshalFlatbuf_NilSpellbook(t *testing.T) {
	sc := skills.NewSkillComponent(false) // mob — nil spellbook

	b := flatbuffers.NewBuilder(64)

	spellbook := SpellbookMarshalFlatbuf(sc, b)

	BerryhunterApi.GameStateStart(b)
	BerryhunterApi.GameStateAddSpellbook(b, spellbook)
	gs := BerryhunterApi.GameStateEnd(b)
	b.Finish(gs)

	result := BerryhunterApi.GetRootAsGameState(b.FinishedBytes(), 0)

	assert.Equal(t, 0, result.SpellbookLength())
}
