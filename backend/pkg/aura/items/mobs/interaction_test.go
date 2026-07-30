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
// ⚑ requiredLevel 1 is not a gate: players START at level 1, so it can never
// refuse anybody, and demanding a refusal line for it only adds a string nobody
// will ever read. 3a asked for one whenever requiredLevel was set at all.
func TestMapMobDefinition_LevelOneGrantNeedsNoBlockedLine(t *testing.T) {
	_, err := mapInteraction(t, `{"nodes": [{
	  "id": "root",
	  "lines": ["hi"],
	  "options": [{"text": "A light to carry.", "grants": [
	    {"kind": "teach_skill", "skill": "DodoAura", "requiredLevel": 1, "line": "here"}
	  ]}]
	}]}`)
	require.NoError(t, err)
}

// ...while a real wall still has to have an answer, or clicking a greyed row
// gets silence.
func TestMapMobDefinition_RealGateStillNeedsBlockedLine(t *testing.T) {
	_, err := mapInteraction(t, `{"nodes": [{
	  "id": "root",
	  "lines": ["hi"],
	  "options": [{"text": "Everything you have.", "grants": [
	    {"kind": "teach_skill", "skill": "DodoAura", "requiredLevel": 2, "line": "here"}
	  ]}]
	}]}`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "blockedLine")
}

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
