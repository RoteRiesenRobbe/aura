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
