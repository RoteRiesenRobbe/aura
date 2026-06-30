package codec

import (
	"testing"

	flatbuffers "github.com/google/flatbuffers/go"
	"github.com/stretchr/testify/assert"
	"github.com/trichner/berryhunter/pkg/api/BerryhunterApi"
)

func buildInputBytes(addFields func(b *flatbuffers.Builder)) []byte {
	b := flatbuffers.NewBuilder(64)
	BerryhunterApi.InputStart(b)
	addFields(b)
	offset := BerryhunterApi.InputEnd(b)
	b.Finish(offset)
	return b.FinishedBytes()
}

func TestUnmarshalInput_ActiveAuraSlot_AbsentField(t *testing.T) {
	buf := buildInputBytes(func(b *flatbuffers.Builder) {
		BerryhunterApi.InputAddTick(b, 1)
		// active_aura_slot not added — old client behaviour
	})
	fbInput := BerryhunterApi.GetRootAsInput(buf, 0)
	result := unmarshalInput(fbInput)
	assert.Equal(t, -1, result.ActiveAuraSlot)
}

func TestUnmarshalInput_ActiveAuraSlot_SlotTwo(t *testing.T) {
	buf := buildInputBytes(func(b *flatbuffers.Builder) {
		BerryhunterApi.InputAddTick(b, 1)
		BerryhunterApi.InputAddActiveAuraSlot(b, int8(2))
	})
	fbInput := BerryhunterApi.GetRootAsInput(buf, 0)
	result := unmarshalInput(fbInput)
	assert.Equal(t, 2, result.ActiveAuraSlot)
}
