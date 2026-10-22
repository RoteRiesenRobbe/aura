package codec

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/api/AuraApi"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	flatbuffers "github.com/google/flatbuffers/go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// model.LockKind mirrors AuraApi.ConversationLockKind by value: the codec
// casts one into the other.
func TestLockKind_MirrorsTheWireEnum(t *testing.T) {
	for kind, wire := range map[model.LockKind]AuraApi.ConversationLockKind{
		model.LockMinLevel:      AuraApi.ConversationLockKindMinLevel,
		model.LockAscensions:    AuraApi.ConversationLockKindAscensions,
		model.LockQuestAtStage:  AuraApi.ConversationLockKindQuestAtStage,
		model.LockQuestComplete: AuraApi.ConversationLockKindQuestComplete,
		model.LockKills:         AuraApi.ConversationLockKindKills,
		model.LockTravelClosed:  AuraApi.ConversationLockKindTravelClosed,
		model.LockSkillLevel:    AuraApi.ConversationLockKindSkillLevel,
		model.LockUnknown:       AuraApi.ConversationLockKindUnknown,
	} {
		assert.Equal(t, uint8(wire), uint8(kind), "%s", wire)
	}
}

// A skill_level reason carries its skill id (plan-appearance.md C5).
func TestLockReasons_SkillRoundTrips(t *testing.T) {
	b := flatbuffers.NewBuilder(0)
	vec := lockReasonsFlatbuf(b, []model.LockReason{{Kind: model.LockSkillLevel, Value: 10, Have: 6, Skill: 7}})
	AuraApi.ConversationOptionStart(b)
	AuraApi.ConversationOptionAddLocks(b, vec)
	b.Finish(AuraApi.ConversationOptionEnd(b))

	opt := AuraApi.GetRootAsConversationOption(b.FinishedBytes(), 0)
	require.Equal(t, 1, opt.LocksLength())
	var lock AuraApi.ConversationLock
	require.True(t, opt.Locks(&lock, 0))
	assert.Equal(t, AuraApi.ConversationLockKindSkillLevel, lock.Kind())
	assert.Equal(t, uint32(10), lock.Value())
	assert.Equal(t, uint32(6), lock.Have())
	assert.Equal(t, uint16(7), lock.Skill())
}
