package main

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
)

// A teach line may name its skill as {skill} (stock.teach-skill, 2026-10-15);
// any other line cannot, because nothing would fill it in.
func TestDialogueEntries_SkillArgOnlyOnATeachLine(t *testing.T) {
	teach := mobs.InteractionGrant{Kind: mobs.GrantTeachSkill, Line: "I'll teach you {skill}.", LineID: "stock.teach-skill"}
	npc := func(lines ...string) *mobs.MobDefinition {
		return &mobs.MobDefinition{Name: "Farmer", Interaction: &mobs.Interaction{Nodes: []mobs.InteractionNode{{
			ID: "root", Lines: lines, LineIDs: []string{"stock.teach-skill"},
			Options: []mobs.InteractionOption{{Grants: []mobs.InteractionGrant{teach}}},
		}}}}
	}

	entries, findings := dialogueEntries([]*mobs.MobDefinition{npc()})
	require.Empty(t, findings)
	require.Len(t, entries, 1)
	assert.Equal(t, []string{"skill"}, entries[0].args, "the teach line may carry {skill}")

	_, findings = dialogueEntries([]*mobs.MobDefinition{npc("I'll teach you {skill}.")})
	require.Len(t, findings, 1)
	assert.Contains(t, findings[0], "only a teach_skill grant's line can name {skill}")
}
