package mobs

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// --- the authored interaction container (plan-entity-model.md chunk 3a) ---
// An actor carries a conversation the same way it carries a skill loadout.
// These pin the VOCABULARY and its rejections; the evaluator's behaviour lives
// in sys/interaction.go, and the "does it actually teach" pins live with it.

// interactionMobJSON wraps an interaction block in the smallest legal mob so
// each case reads as the block under test and nothing else.
func interactionMobJSON(interaction string) []byte {
	return []byte(`{
	  "id": 90,
	  "name": "Farmer",
	  "type": "MOB",
	  "entityType": "Farmer",
	  "factors": {"baseMaxHealth": 200, "speed": 0},
	  "body": {"radius": 0.35, "aggroRadius": 1.0},
	  "skills": [],
	  "interaction": ` + interaction + `
	}`)
}

func mapInteraction(t *testing.T, interaction string) (*MobDefinition, error) {
	t.Helper()
	raw, err := parseMobDefinition(interactionMobJSON(interaction))
	require.NoError(t, err)
	return raw.mapToMobDefinition(testSkillRegistry(t), nil, testCurve())
}

// The degenerate case decision 6 authors: one node, one option, one grant.
const teachOneJSON = `{
  "trigger": "approach",
  "nodes": [{
    "id": "root",
    "lines": ["Tend to the field if you have time..."],
    "options": [{
      "blockedLine": "There's always money in farming.",
      "grants": [{"kind": "teach_skill", "skill": "DodoAura", "requiredLevel": 1, "line": "Let me show you."}]
    }]
  }]
}`

func TestMapMobDefinition_ResolvesInteraction(t *testing.T) {
	def, err := mapInteraction(t, teachOneJSON)
	require.NoError(t, err)

	in := def.Interaction
	require.NotNil(t, in)
	assert.Equal(t, TriggerApproach, in.Trigger)
	require.Len(t, in.Nodes, 1)

	node := in.Nodes[0]
	assert.Equal(t, "root", node.ID)
	assert.Equal(t, []string{"Tend to the field if you have time..."}, node.Lines)
	require.Len(t, node.Options, 1)

	opt := node.Options[0]
	assert.Equal(t, "There's always money in farming.", opt.BlockedLine)
	require.Len(t, opt.Grants, 1)

	grant := opt.Grants[0]
	assert.Equal(t, GrantTeachSkill, grant.Kind)
	assert.Equal(t, uint32(1), grant.RequiredLevel)
	assert.Equal(t, "Let me show you.", grant.Line)
	// Resolved at LOAD, like every other content reference — an unknown skill
	// must fail at boot, never at the moment a player walks up to the NPC.
	require.NotNil(t, grant.Skill)
	assert.Equal(t, "DodoAura", grant.Skill.Name)
}

// A mob without the key is every mob shipped before this chunk.
func TestMapMobDefinition_AbsentInteractionIsNil(t *testing.T) {
	raw, err := parseMobDefinition([]byte(`{
	  "id": 91,
	  "name": "Wolf",
	  "type": "MOB",
	  "factors": {"baseMaxHealth": 30, "speed": 0.7},
	  "body": {"radius": 0.3, "aggroRadius": 3}
	}`))
	require.NoError(t, err)

	def, err := raw.mapToMobDefinition(testSkillRegistry(t), nil, testCurve())
	require.NoError(t, err)
	assert.Nil(t, def.Interaction)
}

// --- the three parse tables (the tierRanks/ParseRole precedent) ---

func TestParseTrigger_AbsentIsApproach(t *testing.T) {
	trigger, ok := ParseTrigger("")
	require.True(t, ok)
	assert.Equal(t, TriggerApproach, trigger)
}

// D6: the schema NAMES the 3b value, the loader refuses to accept content the
// engine cannot honour — the same rule that gates tier and role.
func TestParseTrigger_InteractIsNotAuthorableYet(t *testing.T) {
	_, ok := ParseTrigger(string(TriggerInteract))
	assert.False(t, ok, "trigger \"interact\" must not load until chunk 3b implements it")
}

func TestTriggers_CoverOnlyWhatTheEngineImplements(t *testing.T) {
	_, ok := triggers[string(TriggerApproach)]
	assert.True(t, ok)
	assert.Len(t, triggers, 1, "adding a trigger here without an implementation ships a dead key")
}

func TestParseGrantKind_ResolvesTeachSkill(t *testing.T) {
	kind, ok := ParseGrantKind("teach_skill")
	require.True(t, ok)
	assert.Equal(t, GrantTeachSkill, kind)

	_, ok = ParseGrantKind("")
	assert.False(t, ok, "a grant without a kind is not a default, it is a mistake")
}

func TestParseConditionKind_ResolvesMinLevel(t *testing.T) {
	kind, ok := ParseConditionKind("minLevel")
	require.True(t, ok)
	assert.Equal(t, ConditionMinLevel, kind)
}

// --- rejections (§6a.2): each one is a boot failure, not a silent degrade ---

func TestMapMobDefinition_RejectsUnknownTrigger(t *testing.T) {
	_, err := mapInteraction(t, `{"trigger": "shout", "nodes": [{"id": "root", "lines": ["hi"]}]}`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "shout")
}

func TestMapMobDefinition_RejectsInteractTrigger(t *testing.T) {
	_, err := mapInteraction(t, `{"trigger": "interact", "nodes": [{"id": "root", "lines": ["hi"]}]}`)
	require.Error(t, err, "interact must hard-fail until chunk 3b (D6)")
	assert.Contains(t, err.Error(), "interact")
}

func TestMapMobDefinition_RejectsEmptyNodes(t *testing.T) {
	_, err := mapInteraction(t, `{"trigger": "approach", "nodes": []}`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "nodes")
}

func TestMapMobDefinition_RejectsMissingNodeID(t *testing.T) {
	_, err := mapInteraction(t, `{"nodes": [{"lines": ["hi"]}]}`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "id")
}

func TestMapMobDefinition_RejectsDuplicateNodeID(t *testing.T) {
	_, err := mapInteraction(t, `{"nodes": [
	  {"id": "root", "lines": ["hi"]},
	  {"id": "root", "lines": ["hi again"]}
	]}`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "root")
}

// A dangling next is a conversation that dead-ends mid-sentence. Nothing in 3a
// follows a link, which is exactly why it has to be checked at load — the bug
// would otherwise surface only once 3b starts walking the graph.
func TestMapMobDefinition_RejectsDanglingNext(t *testing.T) {
	_, err := mapInteraction(t, `{"nodes": [{
	  "id": "root",
	  "lines": ["hi"],
	  "options": [{"text": "bye", "next": "nowhere"}]
	}]}`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "nowhere")
}

func TestMapMobDefinition_AcceptsResolvableNext(t *testing.T) {
	def, err := mapInteraction(t, `{"nodes": [
	  {"id": "root", "lines": ["hi"], "options": [{"text": "go on", "next": "more"}]},
	  {"id": "more", "lines": ["more"]}
	]}`)
	require.NoError(t, err)
	assert.Equal(t, "more", def.Interaction.Nodes[0].Options[0].Next)
}

func TestMapMobDefinition_RejectsUnknownGrantKind(t *testing.T) {
	_, err := mapInteraction(t, `{"nodes": [{
	  "id": "root",
	  "options": [{"grants": [{"kind": "give_gold", "skill": "DodoAura"}]}]
	}]}`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "give_gold")
}

func TestMapMobDefinition_RejectsUnknownConditionKind(t *testing.T) {
	_, err := mapInteraction(t, `{"nodes": [{
	  "id": "root",
	  "lines": ["hi"],
	  "conditions": [{"kind": "hasQuest", "value": 1}]
	}]}`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "hasQuest")
}

func TestMapMobDefinition_RejectsUnknownTaughtSkill(t *testing.T) {
	_, err := mapInteraction(t, `{"nodes": [{
	  "id": "root",
	  "options": [{"grants": [{"kind": "teach_skill", "skill": "NoSuchSkill", "line": "here"}]}]
	}]}`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "NoSuchSkill")
}

// Today's rule, moved: zone.go rejected a teaching NPC without a tooLowLine,
// because a player who is too low would otherwise be met with silence.
func TestMapMobDefinition_RejectsGatedGrantWithoutBlockedLine(t *testing.T) {
	_, err := mapInteraction(t, `{"nodes": [{
	  "id": "root",
	  "options": [{"grants": [{"kind": "teach_skill", "skill": "DodoAura", "requiredLevel": 5, "line": "here"}]}]
	}]}`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "blockedLine")
}

// An ungated grant can never block, so it needs no blocked line.
func TestMapMobDefinition_UngatedGrantNeedsNoBlockedLine(t *testing.T) {
	_, err := mapInteraction(t, `{"nodes": [{
	  "id": "root",
	  "options": [{"grants": [{"kind": "teach_skill", "skill": "DodoAura", "line": "here"}]}]
	}]}`)
	require.NoError(t, err)
}

// Today's other rule, moved: an NPC with neither teachings nor lore lines is
// an NPC that says nothing at all.
func TestMapMobDefinition_RejectsSilentNode(t *testing.T) {
	_, err := mapInteraction(t, `{"nodes": [{"id": "root"}]}`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "lines")
}

func TestMapMobDefinition_RejectsGrantWithoutLine(t *testing.T) {
	_, err := mapInteraction(t, `{"nodes": [{
	  "id": "root",
	  "options": [{"grants": [{"kind": "teach_skill", "skill": "DodoAura"}]}]
	}]}`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "line")
}

// --- the sensor (D7) ---

// range is optional: absent means the aggro sensor IS the interaction range,
// which is what all 14 migrated NPCs author.
func TestMapMobDefinition_AbsentRangeFallsBackToAggroRadius(t *testing.T) {
	def, err := mapInteraction(t, teachOneJSON)
	require.NoError(t, err)
	assert.Zero(t, def.Interaction.Range)
	assert.InDelta(t, 1.0, def.SenseRadius(), 0.0001)
}

// Talk range and aggro range are different quantities: the fighting teaching
// guard authors both, and the sensor has to cover the wider one.
func TestSenseRadius_TakesTheWiderOfTheTwo(t *testing.T) {
	def := &MobDefinition{Body: Body{AggroRadius: 8}, Interaction: &Interaction{Range: 1.5}}
	assert.InDelta(t, 8.0, def.SenseRadius(), 0.0001)

	def = &MobDefinition{Body: Body{AggroRadius: 1}, Interaction: &Interaction{Range: 4}}
	assert.InDelta(t, 4.0, def.SenseRadius(), 0.0001)
}

// A conversant nobody can ever reach reads exactly like a content typo, so it
// must not boot. A structure legitimately omits aggroRadius — then range is
// the only radius it has, and it is required.
func TestMapMobDefinition_RejectsConversantWithNoSenseRadius(t *testing.T) {
	raw, err := parseMobDefinition([]byte(`{
	  "id": 92,
	  "name": "Farmer",
	  "type": "MOB",
	  "entityType": "Farmer",
	  "role": "structure",
	  "factors": {"baseMaxHealth": 200, "speed": 0},
	  "body": {"radius": 0.35},
	  "interaction": {"nodes": [{"id": "root", "lines": ["hi"]}]}
	}`))
	require.NoError(t, err)

	_, err = raw.mapToMobDefinition(testSkillRegistry(t), nil, testCurve())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "range")
}

func TestMapMobDefinition_RejectsNegativeRange(t *testing.T) {
	_, err := mapInteraction(t, `{"range": -1, "nodes": [{"id": "root", "lines": ["hi"]}]}`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "range")
}

// A mob that carries no conversation has no sense radius beyond its aggro one.
func TestSenseRadius_WithoutInteractionIsTheAggroRadius(t *testing.T) {
	def := &MobDefinition{Body: Body{AggroRadius: 3}}
	assert.InDelta(t, 3.0, def.SenseRadius(), 0.0001)
}
