package codec

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/api/AuraApi"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/lang"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/quests"
	"github.com/google/flatbuffers/go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// plan-localization.md C2: the Go ArgKind constants mirror the wire enum one
// for one, so a renumber cannot silently turn a mob reference into a number.
func TestMessageArgKind_MirrorsTheWire(t *testing.T) {
	assert.Equal(t, AuraApi.MessageArgKindText, AuraApi.MessageArgKind(lang.ArgText))
	assert.Equal(t, AuraApi.MessageArgKindNumber, AuraApi.MessageArgKind(lang.ArgNumber))
	assert.Equal(t, AuraApi.MessageArgKindMob, AuraApi.MessageArgKind(lang.ArgMob))
	assert.Equal(t, AuraApi.MessageArgKindSkill, AuraApi.MessageArgKind(lang.ArgSkill))
	assert.Equal(t, AuraApi.MessageArgKindQuest, AuraApi.MessageArgKind(lang.ArgQuest))
	assert.Equal(t, AuraApi.MessageArgKindRegion, AuraApi.MessageArgKind(lang.ArgRegion))
	assert.Equal(t, AuraApi.MessageArgKindList, AuraApi.MessageArgKind(lang.ArgList))
}

func TestKeyedEntityMessage_RoundTrips(t *testing.T) {
	b := flatbuffers.NewBuilder(64)
	m := lang.Message{Key: lang.KeyWarlordFallen, English: "The Orc Warlord has fallen to A and B!",
		Args: []lang.Arg{lang.List("names", []string{"A", "B"}), lang.Number("count", 2), lang.MobRef("mob", 34)}}
	b.Finish(KeyedEntityMessageFlatbufMarshal(b, 0, m, AuraApi.EntityMessageKindChat))
	sm := AuraApi.GetRootAsServerMessage(b.FinishedBytes(), 0)
	var table flatbuffers.Table
	require.True(t, sm.Body(&table))
	var em AuraApi.EntityMessage
	em.Init(table.Bytes, table.Pos)
	assert.Equal(t, lang.KeyWarlordFallen, string(em.Key()))
	assert.Equal(t, m.English, string(em.Message()))
	require.Equal(t, 3, em.ArgsLength())
	var a AuraApi.MessageArg
	require.True(t, em.Args(&a, 0))
	assert.Equal(t, "names", string(a.Name()))
	assert.Equal(t, AuraApi.MessageArgKindList, a.Kind())
	assert.Equal(t, "B", string(a.Items(1)))
	require.True(t, em.Args(&a, 2))
	assert.Equal(t, uint64(34), a.Id())
}

func TestUnkeyedEntityMessage_WritesNoKey(t *testing.T) {
	b := flatbuffers.NewBuilder(64)
	b.Finish(EntityMessageFlatbufMarshal(b, 7, "hi", AuraApi.EntityMessageKindChat))
	sm := AuraApi.GetRootAsServerMessage(b.FinishedBytes(), 0)
	var table flatbuffers.Table
	require.True(t, sm.Body(&table))
	var em AuraApi.EntityMessage
	em.Init(table.Bytes, table.Pos)
	assert.Empty(t, em.Key())
	assert.Equal(t, 0, em.ArgsLength())
}

// The objective kinds mirror the wire one for one (C2).
func TestQuestObjectiveKind_MirrorsTheWire(t *testing.T) {
	assert.Equal(t, AuraApi.QuestObjectiveKindKill, AuraApi.QuestObjectiveKind(quests.ObjectiveKill))
	assert.Equal(t, AuraApi.QuestObjectiveKindHarvest, AuraApi.QuestObjectiveKind(quests.ObjectiveHarvest))
	assert.Equal(t, AuraApi.QuestObjectiveKindTalkTo, AuraApi.QuestObjectiveKind(quests.ObjectiveTalkTo))
	assert.Equal(t, AuraApi.QuestObjectiveKindReach, AuraApi.QuestObjectiveKind(quests.ObjectiveReach))
}
