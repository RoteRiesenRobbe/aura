package codec

import (
	"testing"

	flatbuffers "github.com/google/flatbuffers/go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/trichner/berryhunter/pkg/api/BerryhunterApi"
	"github.com/trichner/berryhunter/pkg/berryhunter/skills"
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

func TestUnmarshalInput_ActiveAuraSlot_DeactivateSentinel(t *testing.T) {
	buf := buildInputBytes(func(b *flatbuffers.Builder) {
		BerryhunterApi.InputAddTick(b, 1)
		BerryhunterApi.InputAddActiveAuraSlot(b, int8(-2))
	})
	fbInput := BerryhunterApi.GetRootAsInput(buf, 0)
	result := unmarshalInput(fbInput)
	// -2 is the explicit "deactivate" wire sentinel. It must survive as a value
	// distinct from the absent-field case (which yields -1 = no change); otherwise
	// the server cannot tell "no command" from "explicitly go to Nothing".
	assert.Equal(t, -2, result.ActiveAuraSlot)
}

func buildEquipClientMessage(skillID uint16, slot int8) []byte {
	b := flatbuffers.NewBuilder(64)
	BerryhunterApi.EquipStart(b)
	BerryhunterApi.EquipAddSkillId(b, skillID)
	BerryhunterApi.EquipAddSlot(b, slot)
	body := BerryhunterApi.EquipEnd(b)

	BerryhunterApi.ClientMessageStart(b)
	BerryhunterApi.ClientMessageAddBodyType(b, BerryhunterApi.ClientMessageBodyEquip)
	BerryhunterApi.ClientMessageAddBody(b, body)
	root := BerryhunterApi.ClientMessageEnd(b)
	b.Finish(root)
	return b.FinishedBytes()
}

func TestEquipMessageFlatbufferUnmarshal_RoundTrip(t *testing.T) {
	buf := buildEquipClientMessage(2, 1)
	msg := ClientMessageFlatbufferUnmarshal(buf)
	result := EquipMessageFlatbufferUnmarshal(msg)
	require.NotNil(t, result)
	assert.Equal(t, skills.SkillID(2), result.SkillID)
	assert.Equal(t, 1, result.Slot)
}

func TestEquipMessageFlatbufferUnmarshal_SlotZero(t *testing.T) {
	buf := buildEquipClientMessage(1, 0)
	msg := ClientMessageFlatbufferUnmarshal(buf)
	result := EquipMessageFlatbufferUnmarshal(msg)
	require.NotNil(t, result)
	assert.Equal(t, skills.SkillID(1), result.SkillID)
	assert.Equal(t, 0, result.Slot)
}
