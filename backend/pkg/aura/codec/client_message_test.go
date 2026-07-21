package codec

import (
	"testing"

	flatbuffers "github.com/google/flatbuffers/go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/RoteRiesenRobbe/aura/pkg/api/AuraApi"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

func buildInputBytes(addFields func(b *flatbuffers.Builder)) []byte {
	b := flatbuffers.NewBuilder(64)
	AuraApi.InputStart(b)
	addFields(b)
	offset := AuraApi.InputEnd(b)
	b.Finish(offset)
	return b.FinishedBytes()
}

func TestUnmarshalInput_ActiveAuraSlot_AbsentField(t *testing.T) {
	buf := buildInputBytes(func(b *flatbuffers.Builder) {
		AuraApi.InputAddTick(b, 1)
		// active_aura_slot not added — old client behaviour
	})
	fbInput := AuraApi.GetRootAsInput(buf, 0)
	result := unmarshalInput(fbInput)
	assert.Equal(t, -1, result.ActiveAuraSlot)
}

func TestUnmarshalInput_ActiveAuraSlot_SlotTwo(t *testing.T) {
	buf := buildInputBytes(func(b *flatbuffers.Builder) {
		AuraApi.InputAddTick(b, 1)
		AuraApi.InputAddActiveAuraSlot(b, int8(2))
	})
	fbInput := AuraApi.GetRootAsInput(buf, 0)
	result := unmarshalInput(fbInput)
	assert.Equal(t, 2, result.ActiveAuraSlot)
}

func TestUnmarshalInput_ActiveAuraSlot_DeactivateSentinel(t *testing.T) {
	buf := buildInputBytes(func(b *flatbuffers.Builder) {
		AuraApi.InputAddTick(b, 1)
		AuraApi.InputAddActiveAuraSlot(b, int8(-2))
	})
	fbInput := AuraApi.GetRootAsInput(buf, 0)
	result := unmarshalInput(fbInput)
	// -2 is the explicit "deactivate" wire sentinel. It must survive as a value
	// distinct from the absent-field case (which yields -1 = no change); otherwise
	// the server cannot tell "no command" from "explicitly go to Nothing".
	assert.Equal(t, -2, result.ActiveAuraSlot)
}

func buildEquipClientMessage(skillID uint16, slot int8) []byte {
	b := flatbuffers.NewBuilder(64)
	AuraApi.EquipStart(b)
	AuraApi.EquipAddSkillId(b, skillID)
	AuraApi.EquipAddSlot(b, slot)
	body := AuraApi.EquipEnd(b)

	AuraApi.ClientMessageStart(b)
	AuraApi.ClientMessageAddBodyType(b, AuraApi.ClientMessageBodyEquip)
	AuraApi.ClientMessageAddBody(b, body)
	root := AuraApi.ClientMessageEnd(b)
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
