package mobs

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// --- the authored interaction container (plan-entity-model.md chunk 3a) ---
// An actor carries a conversation the same way it carries a skill loadout.
// These pin the VOCABULARY and its rejections; the evaluator's behaviour lives
// in sys/interaction.go, and the "does it actually teach" pins live with it.

// interactionMobJSON wraps an interaction block in the smallest legal mob so
// each case reads as the block under test and nothing else. The body is a
// parameter because an interaction block makes collisionLayer mandatory (H2),
// so the body is no longer incidental to every case.
func interactionMobJSON(body, interaction string) []byte {
	return []byte(`{
	  "id": 90,
	  "name": "Farmer",
	  "type": "MOB",
	  "entityType": "Farmer",
	  "factors": {"baseMaxHealth": 200, "speed": 0},
	  "body": ` + body + `,
	  "skills": [],
	  "interaction": ` + interaction + `
	}`)
}

// the body all 14 migrated NPCs author: viewport-only, so nothing can target it
const conversantBodyJSON = `{"radius": 0.35, "aggroRadius": 1.0, "collisionLayer": 97}`

func mapInteraction(t *testing.T, interaction string) (*MobDefinition, error) {
	t.Helper()
	return mapInteractionWithBody(t, conversantBodyJSON, interaction)
}

func mapInteractionWithBody(t *testing.T, body, interaction string) (*MobDefinition, error) {
	t.Helper()
	raw, err := parseMobDefinition(interactionMobJSON(body, interaction))
	require.NoError(t, err)
	return raw.mapToMobDefinition(testSkillRegistry(t), nil, testCurve())
}

// The degenerate case decision 6 authors: one node, one option, one grant.
const teachOneJSON = `{
  "nodes": [{
    "id": "root",
    "lines": ["Tend to the field if you have time..."],
    "options": [{
      "grants": [{"kind": "teach_skill", "skill": "DodoAura", "requiredLevel": 1, "line": "Let me show you."}]
    }]
  }]
}`

func TestMapMobDefinition_ResolvesInteraction(t *testing.T) {
	def, err := mapInteraction(t, teachOneJSON)
	require.NoError(t, err)

	in := def.Interaction
	require.NotNil(t, in)
	require.Len(t, in.Nodes, 1)

	node := in.Nodes[0]
	assert.Equal(t, "root", node.ID)
	assert.Equal(t, []string{"Tend to the field if you have time..."}, node.Lines)
	require.Len(t, node.Options, 1)

	opt := node.Options[0]
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

// --- ambient speech (chunk 3b-ii, D18) ---

// ⚑ The finding that retired `trigger` outright: it was a SINGLE value, so an
// actor could never both call out as you pass AND open a tree on E — which is
// exactly the NPC the PO brief describes. Ambient is its own field, spoken on
// the sensor's rising edge, independent of the conversation entirely.
func TestMapMobDefinition_ResolvesAmbient(t *testing.T) {
	def, err := mapInteraction(t, `{
	  "ambient": ["The bridge past the mill is out!", "Mind the wolves."],
	  "nodes": [{"id": "root", "lines": ["hi"]}]
	}`)
	require.NoError(t, err)
	require.NotNil(t, def.Interaction)
	assert.Equal(t, []string{"The bridge past the mill is out!", "Mind the wolves."},
		def.Interaction.Ambient)
}

// Ambient is optional: an actor that only answers the key authors none, which
// is all 14 conversants at the start of this chunk.
func TestMapMobDefinition_AbsentAmbientIsEmpty(t *testing.T) {
	def, err := mapInteraction(t, teachOneJSON)
	require.NoError(t, err)
	assert.Empty(t, def.Interaction.Ambient, "silence is the default, and the only behaviour there is")
}

// D18 deletes the enum. An authored `trigger` is now an unknown key — and the
// mob loader does NOT reject unknown keys (L22), so this hard-fail is the only
// thing standing between a stale content file and a key that means nothing.
func TestMapMobDefinition_RejectsRetiredTriggerKey(t *testing.T) {
	_, err := mapInteraction(t, `{"trigger": "interact", "nodes": [{"id": "root", "lines": ["hi"]}]}`)
	require.Error(t, err, "trigger was retired in 3b-ii (D18) and must not load silently")
	assert.Contains(t, err.Error(), "trigger")
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

func TestMapMobDefinition_RejectsEmptyNodes(t *testing.T) {
	_, err := mapInteraction(t, `{"nodes": []}`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "nodes")
}

// An option is a BUTTON now (D15). One that neither grants nor navigates was
// merely pointless under the walk; in the panel it is a row a player clicks
// and watches do nothing.
func TestMapMobDefinition_RejectsInertOption(t *testing.T) {
	_, err := mapInteraction(t, `{"nodes": [{
	  "id": "root",
	  "lines": ["hi"],
	  "options": [{"text": "A button that does nothing."}]
	}]}`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "next")
}

// ...while an option that only navigates is entirely legitimate — that is the
// whole "anything new around here?" branch.
func TestMapMobDefinition_AcceptsNavigationOnlyOption(t *testing.T) {
	def, err := mapInteraction(t, `{"nodes": [
	  {"id": "root", "lines": ["hi"], "options": [{"text": "Anything new?", "next": "news"}]},
	  {"id": "news", "lines": ["They burned the forest."]}
	]}`)
	require.NoError(t, err)
	require.Len(t, def.Interaction.Nodes[0].Options, 1)
	assert.Empty(t, def.Interaction.Nodes[0].Options[0].Grants)
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

// R1 (plan-conversation-journal.md Q1): a refused row says nothing — the
// greying already says it — so blockedLine is DELETED, and the key is a
// tombstone like `trigger` (L22): a stale content file must fail with a
// sentence naming the replacement, not with `unknown field "blockedLine"`.
func TestMapMobDefinition_RejectsRetiredBlockedLineKey(t *testing.T) {
	_, err := mapInteraction(t, `{"nodes": [{
	  "id": "root",
	  "options": [{"blockedLine": "Come back later.", "grants": [
	    {"kind": "teach_skill", "skill": "DodoAura", "requiredLevel": 5, "line": "here"}
	  ]}]
	}]}`)
	require.Error(t, err, "blockedLine was retired (Q1/R1) and must not load silently")
	assert.Contains(t, err.Error(), "blockedLine")
	assert.Contains(t, err.Error(), "inert", "the tombstone names what replaced it")
}

// ...and the rule that demanded one for a gated grant went with it: a locked
// row is greyed with its wall named, and clicking it does nothing.
func TestMapMobDefinition_GatedGrantNeedsNoBlockedLine(t *testing.T) {
	_, err := mapInteraction(t, `{"nodes": [{
	  "id": "root",
	  "lines": ["hi"],
	  "options": [{"text": "Everything you have.", "grants": [
	    {"kind": "teach_skill", "skill": "DodoAura", "requiredLevel": 2, "line": "here"}
	  ]}]
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

// --- the quest vocabulary (plan-quests.md C2, §5) ---
//
// Three new grant kinds and one new condition kind, every piece an additive case
// behind the loader's existing hard-fails. What these pin is the AUTHORING
// contract: which keys each kind requires, which it refuses, and the placement
// rules that keep a turn-in row atomic. The runtime behaviour lives in
// sys/interaction.go, and the ledger ops it drives live in pkg/aura/quests.

// A quest-bearing option is ONE row (the PO's ruling, §5): the quest grant leads
// and the rest of the option is its reward, applied together or not at all.
const questTurnInJSON = `{
  "nodes": [{
    "id": "root",
    "lines": ["Any luck with the wolves?"],
    "options": [{
      "text": "Here are the pelts.",
      "grants": [
        {"kind": "advance_quest", "quest": "pelts", "fromStage": "turn_in", "toStage": "done", "line": "You have my thanks."},
        {"kind": "grant_xp", "xp": 250, "line": "Experience is its own reward."},
        {"kind": "teach_skill", "skill": "DodoAura", "line": "And this, besides."}
      ]
    }]
  }]
}`

func TestParseGrantKind_ResolvesTheQuestKinds(t *testing.T) {
	for authored, want := range map[string]GrantKind{
		"offer_quest":   GrantOfferQuest,
		"advance_quest": GrantAdvanceQuest,
		"grant_xp":      GrantXP,
	} {
		kind, ok := ParseGrantKind(authored)
		require.True(t, ok, authored)
		assert.Equal(t, want, kind)
	}
}

func TestParseConditionKind_ResolvesQuestAtStage(t *testing.T) {
	kind, ok := ParseConditionKind("quest_at_stage")
	require.True(t, ok)
	assert.Equal(t, ConditionQuestAtStage, kind)
}

func TestMapMobDefinition_ResolvesAQuestTurnIn(t *testing.T) {
	def, err := mapInteraction(t, questTurnInJSON)
	require.NoError(t, err)

	grants := def.Interaction.Nodes[0].Options[0].Grants
	require.Len(t, grants, 3)

	assert.Equal(t, GrantAdvanceQuest, grants[0].Kind)
	assert.Equal(t, "pelts", grants[0].Quest)
	assert.Equal(t, "turn_in", grants[0].FromStage)
	assert.Equal(t, "done", grants[0].ToStage)
	assert.Nil(t, grants[0].Skill, "a quest grant resolves no skill")

	assert.Equal(t, GrantXP, grants[1].Kind)
	assert.EqualValues(t, 250, grants[1].XP)

	assert.Equal(t, GrantTeachSkill, grants[2].Kind)
	require.NotNil(t, grants[2].Skill, "and the reward teach still resolves")
}

func TestMapMobDefinition_ResolvesAQuestOffer(t *testing.T) {
	def, err := mapInteraction(t, `{"nodes": [{
	  "id": "root",
	  "lines": ["Wolves again."],
	  "options": [{
	    "text": "I'll help.",
	    "grants": [{"kind": "offer_quest", "quest": "pelts", "line": "Then go."}]
	  }]
	}]}`)
	require.NoError(t, err)

	g := def.Interaction.Nodes[0].Options[0].Grants[0]
	assert.Equal(t, GrantOfferQuest, g.Kind)
	assert.Equal(t, "pelts", g.Quest)
}

func TestMapMobDefinition_ResolvesAQuestCondition(t *testing.T) {
	def, err := mapInteraction(t, `{"nodes": [
	  {
	    "id": "mid_quest",
	    "conditions": [{"kind": "quest_at_stage", "quest": "pelts", "stage": "turn_in"}],
	    "lines": ["Back already?"]
	  },
	  {"id": "root", "lines": ["Wolves again."]}
	]}`)
	require.NoError(t, err)

	c := def.Interaction.Nodes[0].Conditions[0]
	assert.Equal(t, ConditionQuestAtStage, c.Kind)
	assert.Equal(t, "pelts", c.Quest)
	assert.Equal(t, "turn_in", c.Stage)
}

// Per-kind payload resolution (§5's code-review item): the loader used to resolve
// a `skill` for EVERY grant unconditionally, so every new kind would have had to
// author a dummy skill name to boot at all.
func TestMapMobDefinition_QuestGrantNeedsNoSkill(t *testing.T) {
	_, err := mapInteraction(t, `{"nodes": [{
	  "id": "root",
	  "lines": ["hi"],
	  "options": [{"text": "yes", "grants": [{"kind": "offer_quest", "quest": "pelts", "line": "go"}]}]
	}]}`)
	assert.NoError(t, err, "resolving a skill for a quest grant would be a boot failure with nothing wrong")
}

func TestMapMobDefinition_RejectsAQuestGrantCarryingASkill(t *testing.T) {
	_, err := mapInteraction(t, `{"nodes": [{
	  "id": "root",
	  "lines": ["hi"],
	  "options": [{"text": "yes", "grants": [
	    {"kind": "offer_quest", "quest": "pelts", "skill": "DodoAura", "line": "go"}
	  ]}]
	}]}`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "skill")
}

func TestMapMobDefinition_RejectsATeachCarryingQuestKeys(t *testing.T) {
	_, err := mapInteraction(t, `{"nodes": [{
	  "id": "root",
	  "lines": ["hi"],
	  "options": [{"text": "yes", "grants": [
	    {"kind": "teach_skill", "skill": "DodoAura", "quest": "pelts", "line": "take it"}
	  ]}]
	}]}`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "quest")
}

func TestMapMobDefinition_RejectsAQuestGrantWithoutAQuest(t *testing.T) {
	_, err := mapInteraction(t, `{"nodes": [{
	  "id": "root",
	  "lines": ["hi"],
	  "options": [{"text": "yes", "grants": [{"kind": "offer_quest", "line": "go"}]}]
	}]}`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "quest")
}

func TestMapMobDefinition_RejectsAnAdvanceWithoutStages(t *testing.T) {
	for _, grant := range []string{
		`{"kind": "advance_quest", "quest": "pelts", "toStage": "done", "line": "x"}`,
		`{"kind": "advance_quest", "quest": "pelts", "fromStage": "turn_in", "line": "x"}`,
		`{"kind": "advance_quest", "quest": "pelts", "fromStage": "same", "toStage": "same", "line": "x"}`,
	} {
		_, err := mapInteraction(t, `{"nodes": [{
		  "id": "root", "lines": ["hi"],
		  "options": [{"text": "yes", "grants": [`+grant+`]}]
		}]}`)
		assert.Error(t, err, grant)
	}
}

// An offer carries no edge: which stage it lands on is the quest file's business
// (its first), so authoring one here is a misunderstanding worth naming.
func TestMapMobDefinition_RejectsAnOfferCarryingStages(t *testing.T) {
	_, err := mapInteraction(t, `{"nodes": [{
	  "id": "root", "lines": ["hi"],
	  "options": [{"text": "yes", "grants": [
	    {"kind": "offer_quest", "quest": "pelts", "fromStage": "a", "toStage": "b", "line": "go"}
	  ]}]
	}]}`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "Stage")
}

// --- the atomic-row rules that make a bundle safe (§5, the PO's ruling) ---

// The quest grant must lead, because applyGrant applies the option in authored
// order and aborts the whole row if the quest op is refused. A reward sitting
// ABOVE the advance would be handed over before anything checked whether the
// quest could advance at all — which on a re-click is a free second payout.
func TestMapMobDefinition_RejectsAQuestGrantThatDoesNotLead(t *testing.T) {
	_, err := mapInteraction(t, `{"nodes": [{
	  "id": "root", "lines": ["hi"],
	  "options": [{"text": "here", "grants": [
	    {"kind": "grant_xp", "xp": 10, "line": "reward"},
	    {"kind": "advance_quest", "quest": "pelts", "fromStage": "a", "toStage": "b", "line": "thanks"}
	  ]}]
	}]}`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "first")
}

func TestMapMobDefinition_RejectsTwoQuestGrantsInOneOption(t *testing.T) {
	_, err := mapInteraction(t, `{"nodes": [{
	  "id": "root", "lines": ["hi"],
	  "options": [{"text": "here", "grants": [
	    {"kind": "advance_quest", "quest": "a", "fromStage": "x", "toStage": "y", "line": "1"},
	    {"kind": "advance_quest", "quest": "b", "fromStage": "x", "toStage": "y", "line": "2"}
	  ]}]
	}]}`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "one")
}

// A bundle renders as one row, so it cannot fall back to a skill's display name
// the way a flat teaching list does — an unlabelled bundle is a blank button.
func TestMapMobDefinition_RejectsAnUnlabelledQuestRow(t *testing.T) {
	_, err := mapInteraction(t, `{"nodes": [{
	  "id": "root", "lines": ["hi"],
	  "options": [{"grants": [{"kind": "offer_quest", "quest": "pelts", "line": "go"}]}]
	}]}`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "text")
}

// L10's first half, enforceable without the quest registry: a standalone
// grant_xp row is an XP faucet a player can click forever. The terminal-edge half
// needs the stage graph and lives in the quests cross-validation.
func TestMapMobDefinition_RejectsStandaloneGrantXP(t *testing.T) {
	_, err := mapInteraction(t, `{"nodes": [{
	  "id": "root", "lines": ["hi"],
	  "options": [{"text": "gift", "grants": [{"kind": "grant_xp", "xp": 500, "line": "here"}]}]
	}]}`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "advance_quest")
}

func TestMapMobDefinition_RejectsGrantXPWithoutAnAmount(t *testing.T) {
	_, err := mapInteraction(t, `{"nodes": [{
	  "id": "root", "lines": ["hi"],
	  "options": [{"text": "here", "grants": [
	    {"kind": "advance_quest", "quest": "pelts", "fromStage": "a", "toStage": "b", "line": "thanks"},
	    {"kind": "grant_xp", "line": "reward"}
	  ]}]
	}]}`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "xp")
}

// A level gate is a property of a teachable skill, not of a quest edge: the quest
// file's own stage graph is what says when an edge is walkable.
func TestMapMobDefinition_RejectsARequiredLevelOnAQuestGrant(t *testing.T) {
	_, err := mapInteraction(t, `{"nodes": [{
	  "id": "root", "lines": ["hi"],
	  "options": [{"text": "yes", "grants": [
	    {"kind": "offer_quest", "quest": "pelts", "requiredLevel": 5, "line": "go"}
	  ]}]
	}]}`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "requiredLevel")
}

// --- D8/D10 schema room: the vocabulary exists, authoring it does not ---

func TestMapMobDefinition_RejectsAuthoredCosts(t *testing.T) {
	_, err := mapInteraction(t, `{"nodes": [{
	  "id": "root", "lines": ["hi"],
	  "options": [{"text": "trade", "costs": [{"kind": "unlearn_skill", "skill": "DodoAura"}], "grants": [
	    {"kind": "advance_quest", "quest": "pelts", "fromStage": "a", "toStage": "b", "line": "thanks"}
	  ]}]
	}]}`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "schema room")
}

func TestMapMobDefinition_RejectsAuthoredConsequences(t *testing.T) {
	_, err := mapInteraction(t, `{"nodes": [{
	  "id": "root", "lines": ["hi"],
	  "options": [{"text": "betray", "consequences": [{"kind": "faction_hostile", "faction": "orc"}], "grants": [
	    {"kind": "advance_quest", "quest": "pelts", "fromStage": "a", "toStage": "b", "line": "thanks"}
	  ]}]
	}]}`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "schema room")
}

// An unknown cost/consequence KIND is still named as such, so a typo inside the
// reserved vocabulary reads as a typo rather than as the reservation.
func TestMapMobDefinition_RejectsUnknownCostKind(t *testing.T) {
	_, err := mapInteraction(t, `{"nodes": [{
	  "id": "root", "lines": ["hi"],
	  "options": [{"text": "trade", "costs": [{"kind": "pay_gold"}], "grants": [
	    {"kind": "advance_quest", "quest": "pelts", "fromStage": "a", "toStage": "b", "line": "thanks"}
	  ]}]
	}]}`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "pay_gold")
}

// --- L3: node order silently selects the greeting ---

// selectNode speaks the FIRST node whose conditions pass, so a conditional node
// below an unconditional one can never be reached. Nothing authors conditions
// today, which is exactly why the rule is free to make now: quest-conditional
// greetings are the shape that trips it, and a dead greeting is invisible in play
// (the NPC simply says the wrong thing).
func TestMapMobDefinition_RejectsAConditionalNodeBelowAnUnconditionalOne(t *testing.T) {
	_, err := mapInteraction(t, `{"nodes": [
	  {"id": "root", "lines": ["Wolves again."]},
	  {
	    "id": "mid_quest",
	    "conditions": [{"kind": "quest_at_stage", "quest": "pelts", "stage": "turn_in"}],
	    "lines": ["Back already?"]
	  }
	]}`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "mid_quest")
}

func TestMapMobDefinition_AcceptsConditionalNodesAboveTheFallback(t *testing.T) {
	_, err := mapInteraction(t, `{"nodes": [
	  {
	    "id": "mid_quest",
	    "conditions": [{"kind": "quest_at_stage", "quest": "pelts", "stage": "turn_in"}],
	    "lines": ["Back already?"]
	  },
	  {
	    "id": "veteran",
	    "conditions": [{"kind": "minLevel", "value": 10}],
	    "lines": ["You've the look of someone who has seen things."]
	  },
	  {"id": "root", "lines": ["Wolves again."]}
	]}`)
	assert.NoError(t, err, "the unconditional fallback last is the authoring shape quests need")
}

// ⭐ L3 asks about GREETINGS, so it must not fire on a node nothing greets with.
// A conditional node that an option NAVIGATES to is a destination, not a greeting
// candidate, and its position below the fallback is correct rather than a
// mistake — the rule's own comment always said so ("a node below the fallback is
// not useless"), it just failed it anyway. Intake round 8 item 2 is the first
// content that needs the shape: an info row is hidden by gating the node behind
// it, and hoisting that node above the fallback would make it the GREETING the
// moment its condition passed, which is a worse bug than the one being fixed.
func TestMapMobDefinition_AcceptsAConditionalNavigationDestinationBelowTheFallback(t *testing.T) {
	_, err := mapInteraction(t, `{"nodes": [
	  {"id": "root", "lines": ["Wolves again."], "options": [
	    {"text": "Where do they nest?", "next": "nest"}
	  ]},
	  {
	    "id": "nest",
	    "conditions": [{"kind": "quest_at_stage", "quest": "pelts", "stage": "running"}],
	    "lines": ["North of the tunnel."]
	  }
	]}`)
	assert.NoError(t, err, "an option points at it, so it was never competing to be the greeting")
}

// The teeth stay exactly where they were: unreferenced AND conditional AND below
// the fallback is still the silent dead greeting the rule was written for.
func TestMapMobDefinition_StillRejectsAnUnreachableConditionalGreeting(t *testing.T) {
	_, err := mapInteraction(t, `{"nodes": [
	  {"id": "root", "lines": ["Wolves again."], "options": [
	    {"text": "Where do they nest?", "next": "nest"}
	  ]},
	  {"id": "nest", "lines": ["North of the tunnel."]},
	  {
	    "id": "mid_quest",
	    "conditions": [{"kind": "quest_at_stage", "quest": "pelts", "stage": "turn_in"}],
	    "lines": ["Back already?"]
	  }
	]}`)
	require.Error(t, err, "nothing navigates to mid_quest, so it could only ever have been a greeting")
	assert.Contains(t, err.Error(), "mid_quest")
}

// --- the wire index ceiling (L4, plan-quests.md C0) ---

// option_index and grant_index are ubyte on the wire, and present() truncates
// with a bare uint8() cast — so a 256th entry silently aliases index 0 and hands
// over the wrong thing. The cap is 254, not 255, because grant_index defaults to
// 255 as the client's "this row only navigates" sentinel (server.fbs:375) while
// option_index has NO default (:372), which makes an authored 255 a legitimate
// index colliding with that sentinel. Quest content is what grows option lists,
// so the guard lands before the vocabulary that grows them.
func optionsJSON(n int) string {
	opts := make([]string, 0, n)
	for i := 0; i < n; i++ {
		opts = append(opts, `{"text": "row", "next": "more"}`)
	}
	return `{"nodes": [
	  {"id": "root", "lines": ["hi"], "options": [` + strings.Join(opts, ",") + `]},
	  {"id": "more", "lines": ["more"]}
	]}`
}

func grantsJSON(n int) string {
	grants := make([]string, 0, n)
	for i := 0; i < n; i++ {
		grants = append(grants, `{"kind": "teach_skill", "skill": "DodoAura", "line": "take it"}`)
	}
	return `{"nodes": [{
	  "id": "root",
	  "lines": ["hi"],
	  "options": [{"text": "learn", "grants": [` + strings.Join(grants, ",") + `]}]
	}]}`
}

func TestMapMobDefinition_AcceptsTheLastAddressableOption(t *testing.T) {
	def, err := mapInteraction(t, optionsJSON(255))
	require.NoError(t, err)
	assert.Len(t, def.Interaction.Nodes[0].Options, 255, "indices 0..254 all fit in a ubyte")
}

func TestMapMobDefinition_RejectsUnaddressableOptionCount(t *testing.T) {
	_, err := mapInteraction(t, optionsJSON(256))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "254")
}

func TestMapMobDefinition_AcceptsTheLastAddressableGrant(t *testing.T) {
	def, err := mapInteraction(t, grantsJSON(255))
	require.NoError(t, err)
	assert.Len(t, def.Interaction.Nodes[0].Options[0].Grants, 255)
}

func TestMapMobDefinition_RejectsUnaddressableGrantCount(t *testing.T) {
	_, err := mapInteraction(t, grantsJSON(256))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "254")
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
	  "body": {"radius": 0.35, "collisionLayer": 97},
	  "interaction": {"nodes": [{"id": "root", "lines": ["hi"]}]}
	}`))
	require.NoError(t, err)

	_, err = raw.mapToMobDefinition(testSkillRegistry(t), nil, testCurve())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "range")
}

// L12 (plan-pre-accounts-hygiene.md H2): an omitted collisionLayer is 0, which
// model/mob then substitutes with Viewport|Action — i.e. the DEFAULT for a
// conversant is aura-targetable and killable, and the content pin that was
// meant to catch that reads the same authored 0 and passes trivially. The guard
// constrains authoring rather than policy: the value stays entirely the
// author's (a teaching guard that fights bandits is a legal actor), only
// "unset" stops being a legal way to say it.
func TestMapMobDefinition_RejectsConversantWithoutCollisionLayer(t *testing.T) {
	_, err := mapInteractionWithBody(t, `{"radius": 0.35, "aggroRadius": 1.0}`, teachOneJSON)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "collisionLayer")
}

// The author stays free to pick the value — including one that keeps the actor
// on the Action layer, which is what a fighting conversant needs.
func TestMapMobDefinition_AcceptsAnyAuthoredCollisionLayer(t *testing.T) {
	def, err := mapInteractionWithBody(t,
		`{"radius": 0.35, "aggroRadius": 1.0, "collisionLayer": 99}`, teachOneJSON)
	require.NoError(t, err)
	require.NotNil(t, def.Interaction)
	assert.Equal(t, 99, def.Body.CollisionLayer)
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

// --- the node-level row source (plan-ascension.md §12.4 C2a step 2, P10) ---
//
// A node may declare that its rows are GENERATED rather than authored. The
// ascension catalog is the first consumer and C3's memorial is the second, so
// the vocabulary is a parse table with the same refuse-at-boot discipline as
// every other authored kind: a typo must never ship as a node that silently
// shows nothing.

func TestMapMobDefinition_ResolvesARowSource(t *testing.T) {
	def, err := mapInteraction(t, `{"nodes": [{
	  "id": "root",
	  "lines": ["nothing left to teach"],
	  "rows": "ascension_catalog",
	  "rewards": []
	}]}`)
	require.NoError(t, err)
	assert.Equal(t, RowSourceAscensionCatalog, def.Interaction.Nodes[0].Rows)
}

// --- a catalog node's own reward list (plan-ascension-sites.md C3, D3/D5) ---
//
// A site owns what it offers. The list is authored by unlock key, in the order a
// player will see it, and it is the ONLY thing that node ever serves.

func TestMapMobDefinition_ResolvesARewardListInItsAuthoredOrder(t *testing.T) {
	def, err := mapInteraction(t, `{"nodes": [{
	  "id": "root",
	  "lines": ["pick one"],
	  "rows": "ascension_catalog",
	  "rewards": ["RimeBurst", "Lantern", "KeenEye"]
	}]}`)
	require.NoError(t, err)
	// ⭐ THE AUTHORED ORDER, NOT A SORTED ONE (D3). The order is the wire's index
	// space for this node, and a loader that tidied it would silently renumber
	// every row the moment content was re-authored.
	assert.Equal(t, []string{"RimeBurst", "Lantern", "KeenEye"}, def.Interaction.Nodes[0].Rewards)
}

// D5: there is no catch-all. An absent list used to be expressible as "serve the
// whole catalog", which is exactly the implicit global C1 took out of the price;
// a site that does not say what it offers is a boot failure.
func TestMapMobDefinition_RejectsACatalogNodeThatListsNoRewards(t *testing.T) {
	_, err := mapInteraction(t, `{"nodes": [{
	  "id": "root",
	  "lines": ["pick one"],
	  "rows": "ascension_catalog"
	}]}`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "rewards")
}

// ⚑ An authored EMPTY list is legitimate and distinct from an absent one: a
// stone that ends lives and hands out nothing (D14's ascend-anyway row is all it
// offers). That distinction is the whole reason the authored shape is a pointer.
func TestMapMobDefinition_AcceptsAnEmptyRewardList(t *testing.T) {
	def, err := mapInteraction(t, `{"nodes": [{
	  "id": "root",
	  "lines": ["a life can be laid down here, and nothing is given back"],
	  "rows": "ascension_catalog",
	  "rewards": []
	}]}`)
	require.NoError(t, err)
	assert.Empty(t, def.Interaction.Nodes[0].Rewards)
}

// P3: the same discipline the loader already applies to authored options on a
// rows node. A `rewards` list anywhere else is a key that means nothing, and a
// silently inert authored key is what DisallowUnknownFields catches one
// keystroke earlier.
func TestMapMobDefinition_RejectsARewardListOnANodeThatIsNotTheCatalog(t *testing.T) {
	for _, node := range []string{
		`{"id": "root", "lines": ["hi"], "rewards": ["RimeBurst"]}`,
		`{"id": "root", "lines": ["the dead"], "rows": "memorial_names", "rewards": ["RimeBurst"]}`,
	} {
		_, err := mapInteraction(t, `{"nodes": [`+node+`]}`)
		require.Error(t, err, node)
		assert.Contains(t, err.Error(), "rewards", node)
	}
}

// ⭐ The same argument the catalog's own duplicate check makes, one layer down:
// two rows spending one bloodline_unlocks key leaves the second unpickable
// forever, and it reaches the player as a row that greys out for no reason after
// they clicked its twin.
func TestMapMobDefinition_RejectsARewardListThatNamesOneKeyTwice(t *testing.T) {
	_, err := mapInteraction(t, `{"nodes": [{
	  "id": "root",
	  "lines": ["pick one"],
	  "rows": "ascension_catalog",
	  "rewards": ["RimeBurst", "Lantern", "RimeBurst"]
	}]}`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "RimeBurst")
}

func TestMapMobDefinition_RejectsUnknownRowSource(t *testing.T) {
	_, err := mapInteraction(t, `{"nodes": [{
	  "id": "root",
	  "lines": ["hi"],
	  "rows": "the_vault_inventory"
	}]}`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "the_vault_inventory")
}

// ⭐ The index space is the reason, not tidiness. A generated row is addressed
// by its OptionIndex into the source's list, so an authored option on the same
// node would claim the same numbers - and the collision only ever shows up as
// a player clicking one row and being handed a different one.
func TestMapMobDefinition_RejectsAuthoredOptionsOnARowSourceNode(t *testing.T) {
	_, err := mapInteraction(t, `{"nodes": [{
	  "id": "root",
	  "lines": ["hi"],
	  "rows": "ascension_catalog",
	  "rewards": [],
	  "options": [{"text": "bye", "next": "root"}]
	}]}`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "ascension_catalog")
}

// ⚑ A generated list can legitimately come back EMPTY (D14: a bloodline that
// has learned everything it can). The lines are what the node says then, so a
// source node without them is a blank panel exactly when the content most needs
// to explain itself.
func TestMapMobDefinition_RejectsARowSourceNodeWithNoLines(t *testing.T) {
	_, err := mapInteraction(t, `{"nodes": [{
	  "id": "root",
	  "rows": "ascension_catalog",
	  "rewards": []
	}]}`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "lines")
}

// --- bloodline_ascensions (plan-ascension.md D18 tier B, C2a step 4) ---
//
// The one v1 condition kind that reads ACROSS a character's own life: how many
// times this account/slot has ascended. It is tier B rather than tier C because
// the count is derivable from the characters table at ticket time, so it costs
// no migration.

func TestParseCondition_ResolvesBloodlineAscensions(t *testing.T) {
	cond, err := ParseCondition(JSONCondition{Kind: "bloodline_ascensions", Value: 3})
	require.NoError(t, err)
	assert.Equal(t, ConditionBloodlineAscensions, cond.Kind)
	assert.Equal(t, 3, cond.Value)
}

// ⚑ D18's naming discipline, pinned: the kind NAMES ITS SCOPE. A bare
// "ascensions" would leave per-life and cross-life ambiguous, and the whole cost
// model hangs on that line (tier B is free, tier C needs a migration).
func TestParseCondition_RejectsTheUnscopedSpelling(t *testing.T) {
	_, err := ParseCondition(JSONCondition{Kind: "ascensions", Value: 3})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "ascensions")
}

// A threshold of zero or less passes for every character alive, so authoring it
// is a gate that does nothing: the silently-inert-content class the whole
// refuse-at-boot discipline exists for.
func TestParseCondition_RejectsANonPositiveAscensionCount(t *testing.T) {
	for _, value := range []int{0, -1} {
		_, err := ParseCondition(JSONCondition{Kind: "bloodline_ascensions", Value: value})
		require.Error(t, err, "value %d", value)
		assert.Contains(t, err.Error(), "positive")
	}
}

// --- kills_this_life (plan-ascension.md §13 step 1, D18 tier A / P9) ---

func TestParseConditionKind_ResolvesKillsThisLife(t *testing.T) {
	kind, ok := ParseConditionKind("kills_this_life")
	require.True(t, ok)
	assert.Equal(t, ConditionKillsThisLife, kind)
}

// ⚑ D18's naming discipline again, and this is the kind it was written for: a
// bare "kills" would leave per-life and cross-life ambiguous, and the per-life
// half is free (the quest ledger already counts it) while the cross-life half
// is the one that costs a migration (tier C, not taken).
func TestParseCondition_RejectsTheUnscopedKillSpelling(t *testing.T) {
	_, err := ParseCondition(JSONCondition{Kind: "kills", Species: "DireWolf", Value: 20})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "kills")
}

// The authored species rides through the parse UNRESOLVED: the mob registry is
// mid-construction here (mapToInteraction runs per definition), so the name is
// all this stage can hold. resolveConditionSpecies fills in the id (P20).
func TestParseCondition_CarriesTheAuthoredSpecies(t *testing.T) {
	cond, err := ParseCondition(JSONCondition{Kind: "kills_this_life", Species: "DireWolf", Value: 20})
	require.NoError(t, err)
	assert.Equal(t, ConditionKillsThisLife, cond.Kind)
	assert.Equal(t, "DireWolf", cond.Species)
	assert.Equal(t, 20, cond.Value)
	assert.Zero(t, cond.SpeciesID, "the parse stage cannot resolve a name")
}

func TestParseCondition_RejectsAKillGateWithNoSpecies(t *testing.T) {
	_, err := ParseCondition(JSONCondition{Kind: "kills_this_life", Value: 20})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "species")
}

// Same reasoning as the bloodline_ascensions guard directly above: a threshold
// of zero passes for every character alive, which is an authored gate that does
// nothing, and here it would ALSO make an unresolved species harmless-looking,
// since nothing would ever be counted against it.
func TestParseCondition_RejectsANonPositiveKillCount(t *testing.T) {
	for _, value := range []int{0, -1} {
		_, err := ParseCondition(JSONCondition{Kind: "kills_this_life", Species: "DireWolf", Value: value})
		require.Error(t, err, "value %d", value)
		assert.Contains(t, err.Error(), "positive")
	}
}

// --- the memorial's row source (plan-ascension.md C3 step 6, D11) ---

func TestParseRowSourceKind_ResolvesMemorialNames(t *testing.T) {
	kind, ok := ParseRowSourceKind("memorial_names")
	require.True(t, ok)
	assert.Equal(t, RowSourceMemorialNames, kind)
}

// ⭐ The SECOND consumer of the dynamic-row hook, which is what P10 promised
// when it chose a node-level hook over a grant expansion: "one hook, two
// consumers, or it is not the extension the plan said it was". A memorial row
// grants nothing at all, so a grant-shaped hook could never have served it.
func TestMapMobDefinition_ResolvesAMemorialRowSource(t *testing.T) {
	def, err := mapInteraction(t, `{"nodes": [{
	  "id": "root",
	  "lines": ["Names, more than you can count."],
	  "rows": "memorial_names"
	}]}`)
	require.NoError(t, err)
	assert.Equal(t, RowSourceMemorialNames, def.Interaction.Nodes[0].Rows)
}

// --- lockedWhenGated: a row that names its destination's gate (C2, P5) ---

// The shape the ascension sites author: an unconditional greeting whose row
// points at a gated node, opted in to rendering LOCKED instead of vanishing.
const lockedWhenGatedJSON = `{
  "nodes": [
    {
      "id": "catalog",
      "conditions": [{"kind": "minLevel", "value": 30}],
      "lines": ["Pick one."]
    },
    {
      "id": "root",
      "lines": ["A stone."],
      "options": [{"text": "Show me the rewards.", "next": "catalog", "lockedWhenGated": true}]
    }
  ]
}`

func TestMapMobDefinition_CarriesLockedWhenGated(t *testing.T) {
	def, err := mapInteraction(t, lockedWhenGatedJSON)
	require.NoError(t, err)

	root := def.Interaction.Nodes[1]
	require.Len(t, root.Options, 1)
	assert.True(t, root.Options[0].LockedWhenGated)
	assert.Equal(t, "catalog", root.Options[0].Next)
}

// ⚑ OPT-IN IS THE WHOLE POINT (P5), so the default must be provably off:
// rendering every gated destination would leak hidden nodes out of every quest
// tree in the game.
func TestMapMobDefinition_LockedWhenGatedDefaultsOff(t *testing.T) {
	def, err := mapInteraction(t, `{"nodes": [
	  {"id": "catalog", "conditions": [{"kind": "minLevel", "value": 30}], "lines": ["Pick one."]},
	  {"id": "root", "lines": ["A stone."], "options": [{"text": "Show me.", "next": "catalog"}]}
	]}`)
	require.NoError(t, err)
	assert.False(t, def.Interaction.Nodes[1].Options[0].LockedWhenGated)
}

// The flag names a DESTINATION's gate, so a row with no destination has nothing
// to name and would render locked forever with an empty requirement.
func TestMapMobDefinition_RejectsLockedWhenGatedWithoutNext(t *testing.T) {
	_, err := mapInteraction(t, `{"nodes": [{
	  "id": "root",
	  "lines": ["hi"],
	  "options": [{"text": "learn", "lockedWhenGated": true, "grants": [
	    {"kind": "teach_skill", "skill": "DodoAura", "requiredLevel": 1, "line": "here"}
	  ]}]
	}]}`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "lockedWhenGated")
}

// An unconditional destination is always visible, so the flag can never fire:
// silently inert authoring is exactly what DisallowUnknownFields exists to stop
// one keystroke earlier.
func TestMapMobDefinition_RejectsLockedWhenGatedOnAnUngatedDestination(t *testing.T) {
	_, err := mapInteraction(t, `{"nodes": [
	  {"id": "news", "lines": ["news"]},
	  {"id": "root", "lines": ["hi"], "options": [{"text": "gossip", "next": "news", "lockedWhenGated": true}]}
	]}`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "lockedWhenGated")
	assert.Contains(t, err.Error(), "news")
}

// ⛑ A GRANT-BEARING ROW IS REFUSED. The locked row is inert by construction and
// applyGrant refuses its indices, so a flagged row carrying a grant would be a
// reward the panel offers and the server silently declines: the exact
// present/apply disagreement L24's pin exists to prevent. P5's row is a pure
// navigation row; nothing needs the other shape.
func TestMapMobDefinition_RejectsLockedWhenGatedOnAGrantingRow(t *testing.T) {
	_, err := mapInteraction(t, `{"nodes": [
	  {"id": "vault", "conditions": [{"kind": "minLevel", "value": 10}], "lines": ["in"]},
	  {"id": "root", "lines": ["hi"], "options": [{"text": "step inside", "next": "vault", "lockedWhenGated": true,
	    "grants": [{"kind": "teach_skill", "skill": "DodoAura", "requiredLevel": 1, "line": "here"}]}]}
	]}`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "lockedWhenGated")
}
