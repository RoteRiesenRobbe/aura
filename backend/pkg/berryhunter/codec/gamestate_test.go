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
