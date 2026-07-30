package sys

// The conversation evaluator (plan-entity-model.md chunks 3a → 3b-ii).
//
// ⚑ Chunk 3a's cases were sys/npc_test.go's, ported verbatim onto the merged
// actor, and their whole point was that nothing changed. 3b-ii is the opposite:
// D17 retires the ordered grant walk those cases pinned, so the evaluate() suite
// is REWRITTEN here around present() (pure — builds the tree) and applyGrant()
// (hands over exactly one grant). What survived unchanged is node selection and
// the fail-closed condition check.

import (
	"testing"

	flatbuffers "github.com/google/flatbuffers/go"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/api/AuraApi"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/mob"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

// --- test doubles (ported verbatim from the deleted npc_test.go) ---

// fakeLearner is a minimal player surface: a real spellbook (so Discover /
// HasDiscovered behave for real), a level, and a cascade-call counter.
type fakeLearner struct {
	sc           *skills.SkillComponent
	level        uint32
	cascadeCalls int
}

func (f *fakeLearner) SkillComponent() *skills.SkillComponent { return f.sc }
func (f *fakeLearner) Progression() model.PlayerProgression {
	return model.PlayerProgression{Level: f.level}
}
func (f *fakeLearner) ApplyRecipeCascade() { f.cascadeCalls++ }

var _ learner = (*fakeLearner)(nil)

func newLearner(level uint32) *fakeLearner {
	return &fakeLearner{sc: skills.NewSkillComponent(true), level: level}
}

// addPlayerCollider puts a fake player into the space on the real player body
// layer, which is what a sensor's Collisions() reports.
func addPlayerCollider(space *phy.Space, p *fakePlayer, pos phy.Vec2f) *phy.Circle {
	body := phy.NewCircle(pos, 0.5)
	body.Shape().Layer = int(model.LayerPlayerCollision)
	body.Shape().UserData = model.PlayerEntity(p)
	space.AddShape(body)
	return body
}

func sentOf(p *fakePlayer) [][]byte { return p.client.(*fakeClient).sent }

// pressInteract queues one Interact naming id, as the client's E key does: it
// OPENS the conversation and takes nothing.
func pressInteract(p *fakePlayer, id uint64) {
	c := p.client.(*fakeClient)
	c.interacts = append(c.interacts, &model.Interact{EntityID: id, GrantIndex: model.ConversationNoGrant})
}

// takeRow queues the message a panel click produces: the AUTHORED indices the
// server streamed in the row, never the row's position on screen (L21).
func takeRow(p *fakePlayer, id uint64, nodeID string, option, grant uint8) {
	c := p.client.(*fakeClient)
	c.interacts = append(c.interacts, &model.Interact{
		EntityID: id, NodeID: nodeID, OptionIndex: option, GrantIndex: grant,
	})
}

func unlocksOf(p *fakePlayer) []capturedUnlock { return p.client.(*fakeClient).unlocks }

// decodeEntityMessage unwraps the wire bytes speakToSensor() produces back into the
// anchored entity id + text, verifying it really is an EntityMessage.
func decodeEntityMessage(t *testing.T, b []byte) (uint64, string) {
	t.Helper()
	sm := AuraApi.GetRootAsServerMessage(b, 0)
	require.Equal(t, AuraApi.ServerMessageBodyEntityMessage, sm.BodyType())
	var tbl flatbuffers.Table
	require.True(t, sm.Body(&tbl))
	var em AuraApi.EntityMessage
	em.Init(tbl.Bytes, tbl.Pos)
	return em.EntityId(), string(em.Message())
}

// --- builders: the degenerate one-node case content authors ---

// grant builds one teach_skill grant with a distinct skill definition (the id
// is all the evaluator touches on Skill).
func grant(id int, reqLevel uint32, line string) mobs.InteractionGrant {
	return mobs.InteractionGrant{
		Kind:          mobs.GrantTeachSkill,
		RequiredLevel: reqLevel,
		Line:          line,
		Skill:         &skills.SkillDefinition{ID: skills.SkillID(id)},
	}
}

// teachingInteraction is one node, one option, a grant list and a blocked line
// — exactly what all 14 migrated NPCs author. Since D18 there is no trigger to
// choose: a conversation only ever opens on the key.
func teachingInteraction(blockedLine string, lines []string, grants ...mobs.InteractionGrant) *mobs.Interaction {
	node := mobs.InteractionNode{ID: "root", Lines: lines}
	if len(grants) > 0 || blockedLine != "" {
		node.Options = []mobs.InteractionOption{{BlockedLine: blockedLine, Grants: grants}}
	}
	return &mobs.Interaction{Nodes: []mobs.InteractionNode{node}}
}

// ambientInteraction is the town-crier shape (D18): lore called out to whoever
// walks past, AND a conversation behind the key. The two are independent
// fields, which is the whole reason the single-valued trigger was retired.
func ambientInteraction(ambient []string, grants ...mobs.InteractionGrant) *mobs.Interaction {
	in := teachingInteraction("too low", []string{"lore"}, grants...)
	in.Ambient = ambient
	return in
}

// --- present(): the personalised tree, and it mutates NOTHING ---
//
// This suite replaces the ported evaluate() cases wholesale (D17). The old ones
// pinned an ordered grant WALK — meeting the Emberkeeper once handed you Torch
// AND Ignite AND Immolate up to your level, in one breath. A list is not a walk:
// clicking Ignite now teaches Ignite and nothing else, so what used to be one
// function doing presentation and mutation in a single pass is two.

// rowsOf is the presented option rows of one node, by id.
func rowsOf(t *testing.T, c *model.Conversation, nodeID string) []model.ConversationOption {
	t.Helper()
	require.NotNil(t, c)
	for _, n := range c.Nodes {
		if n.ID == nodeID {
			return n.Options
		}
	}
	t.Fatalf("node %q not presented; got %v", nodeID, nodeIDs(c))
	return nil
}

func nodeIDs(c *model.Conversation) []string {
	if c == nil {
		return nil
	}
	ids := make([]string, 0, len(c.Nodes))
	for _, n := range c.Nodes {
		ids = append(ids, n.ID)
	}
	return ids
}

// namedGrant is a grant whose skill has a real name, so the display-name
// fallback for an unlabelled row can be asserted.
func namedGrant(id int, name string, reqLevel uint32, line string) mobs.InteractionGrant {
	g := grant(id, reqLevel, line)
	g.Skill.Name = name
	return g
}

// ⚑ The assertion the whole split exists for: presenting a tree must not touch
// the spellbook. Everything else in this file is a detail by comparison — if
// present() mutates, the panel teaches people things by being looked at.
func TestPresent_MutatesNothing(t *testing.T) {
	in := teachingInteraction("too low", []string{"greetings"},
		grant(1, 1, "learned heal"), grant(2, 5, "learned dash"))
	p := newLearner(10) // qualifies for both

	c := present(in, p)

	require.NotNil(t, c)
	assert.False(t, p.sc.HasDiscovered(1), "presenting must never grant")
	assert.False(t, p.sc.HasDiscovered(2))
	assert.Zero(t, p.cascadeCalls, "and never run the recipe cascade")
}

// Every node whose conditions pass is emitted, not just the entry one — the
// client needs the whole tree to navigate locally (D16).
func TestPresent_EmitsEveryReachableNode(t *testing.T) {
	in := &mobs.Interaction{Nodes: []mobs.InteractionNode{
		{ID: "root", Lines: []string{"hello"}, Options: []mobs.InteractionOption{
			{Text: "Anything new?", Next: "news"},
			{Text: "Where is the mill?", Next: "directions"},
		}},
		{ID: "news", Lines: []string{"They burned the forest."}},
		{ID: "directions", Lines: []string{"Two hills east."}},
	}}

	c := present(in, newLearner(1))

	assert.ElementsMatch(t, []string{"root", "news", "directions"}, nodeIDs(c))
	assert.Equal(t, "root", c.EntryNode)
}

// An authored cycle is harmless by construction: present() serialises nodes, it
// does not walk them, so there is no traversal to run away.
func TestPresent_AuthoredCycleIsHarmless(t *testing.T) {
	in := &mobs.Interaction{Nodes: []mobs.InteractionNode{
		{ID: "root", Lines: []string{"hello"}, Options: []mobs.InteractionOption{{Text: "on", Next: "news"}}},
		{ID: "news", Lines: []string{"news"}, Options: []mobs.InteractionOption{{Text: "back", Next: "root"}}},
	}}

	c := present(in, newLearner(1))

	assert.ElementsMatch(t, []string{"root", "news"}, nodeIDs(c))
}

// The entry node is selectNode()'s, unchanged from 3a — a conditional greeting
// still works, it just no longer decides the whole conversation.
func TestPresent_EntryNodeIsTheFirstWhoseConditionsPass(t *testing.T) {
	in := &mobs.Interaction{Nodes: []mobs.InteractionNode{
		{
			ID:         "veteran",
			Conditions: []mobs.InteractionCondition{{Kind: mobs.ConditionMinLevel, Value: 10}},
			Lines:      []string{"Well met, veteran."},
		},
		{ID: "root", Lines: []string{"Move along."}},
	}}

	assert.Equal(t, "root", present(in, newLearner(3)).EntryNode, "the gated node is skipped")
	assert.Equal(t, "veteran", present(in, newLearner(10)).EntryNode, "the gate opens exactly at the value")
}

// A condition-failed node is omitted AND the rows pointing at it disappear —
// otherwise the panel offers a button leading nowhere.
func TestPresent_OmitsConditionFailedNodeAndItsInboundRows(t *testing.T) {
	in := &mobs.Interaction{Nodes: []mobs.InteractionNode{
		{ID: "root", Lines: []string{"hello"}, Options: []mobs.InteractionOption{
			{Text: "Tell me the secret.", Next: "secret"},
			{Text: "Where is the mill?", Next: "directions"},
		}},
		{
			ID:         "secret",
			Conditions: []mobs.InteractionCondition{{Kind: mobs.ConditionMinLevel, Value: 10}},
			Lines:      []string{"The vault is under the mill."},
		},
		{ID: "directions", Lines: []string{"Two hills east."}},
	}}

	low := present(in, newLearner(3))
	assert.ElementsMatch(t, []string{"root", "directions"}, nodeIDs(low), "the gated node is not sent at all")
	require.Len(t, rowsOf(t, low, "root"), 1, "and the row pointing at it is hidden")
	assert.Equal(t, "Where is the mill?", rowsOf(t, low, "root")[0].Text)

	high := present(in, newLearner(10))
	assert.ElementsMatch(t, []string{"root", "secret", "directions"}, nodeIDs(high))
	assert.Len(t, rowsOf(t, high, "root"), 2)
}

func TestPresent_NoNodePassesMeansNoConversation(t *testing.T) {
	in := &mobs.Interaction{Nodes: []mobs.InteractionNode{{
		ID:         "veteran",
		Conditions: []mobs.InteractionCondition{{Kind: mobs.ConditionMinLevel, Value: 10}},
		Lines:      []string{"Well met."},
	}}}

	assert.Nil(t, present(in, newLearner(1)), "an actor with nothing to say opens no panel")
}

// D17's cheap win: the 11 NPCs nobody re-authored need ZERO content work,
// because a legacy multi-grant option expands to one row per grant, each
// labelled with its skill's display name.
func TestPresent_ExpandsLegacyMultiGrantOptionToOneRowPerGrant(t *testing.T) {
	in := teachingInteraction("Grow stronger.", []string{"What would you have of the flame?"},
		namedGrant(1, "Torch", 1, "a light in dark places"),
		namedGrant(2, "Ignite", 7, "a fire in your enemies"),
		namedGrant(3, "Immolate", 12, "burn everything around you"))

	rows := rowsOf(t, present(in, newLearner(1)), "root")

	require.Len(t, rows, 3, "one row per grant, from a single authored option")
	assert.Equal(t, []string{"Torch", "Ignite", "Immolate"},
		[]string{rows[0].Text, rows[1].Text, rows[2].Text}, "labelled by the skill")
	// ⚑ L21: all three came from authored option 0 and differ only by grant
	// index. A client echoing back its own row position would be right here by
	// accident and wrong the moment a row is hidden.
	assert.Equal(t, []uint8{0, 0, 0}, []uint8{rows[0].OptionIndex, rows[1].OptionIndex, rows[2].OptionIndex})
	assert.Equal(t, []uint8{0, 1, 2}, []uint8{rows[0].GrantIndex, rows[1].GrantIndex, rows[2].GrantIndex})
}

// An authored label wins over the derived one — the new content shape.
func TestPresent_AuthoredTextLabelsTheRow(t *testing.T) {
	in := &mobs.Interaction{Nodes: []mobs.InteractionNode{{
		ID:    "root",
		Lines: []string{"hello"},
		Options: []mobs.InteractionOption{{
			Text:   "Teach me the fire.",
			Grants: []mobs.InteractionGrant{namedGrant(1, "Torch", 1, "a light in dark places")},
		}},
	}}}

	rows := rowsOf(t, present(in, newLearner(1)), "root")

	require.Len(t, rows, 1)
	assert.Equal(t, "Teach me the fire.", rows[0].Text)
	assert.EqualValues(t, 0, rows[0].GrantIndex, "it still carries its one grant")
}

// "Things already learned are not shown in that list" — the PO brief verbatim.
// Under 3a this was a silent skip inside the walk; it is visibility now.
func TestPresent_HidesKnownRows(t *testing.T) {
	in := teachingInteraction("Grow stronger.", []string{"greetings"},
		namedGrant(1, "Torch", 1, "light"),
		namedGrant(2, "Ignite", 1, "fire"))
	p := newLearner(10)
	p.sc.Discover(1) // already knows Torch

	rows := rowsOf(t, present(in, p), "root")

	require.Len(t, rows, 1, "the known row is gone")
	assert.Equal(t, "Ignite", rows[0].Text)
	// ⚑ L21 again, and this is the case that bites: the ONE remaining row is at
	// presented position 0 but authored grant index 1.
	assert.EqualValues(t, 1, rows[0].GrantIndex)
}

// D20: a row the player is too low for is SHOWN, greyed, with the wall named —
// each NPC becomes a signpost for progression and a reason to come back.
func TestPresent_LocksTooLowRowsAndNamesTheWall(t *testing.T) {
	in := teachingInteraction("Fire doesn't suffer the careless.", []string{"greetings"},
		namedGrant(1, "Torch", 1, "light"),
		namedGrant(2, "Ignite", 7, "fire"),
		namedGrant(3, "Immolate", 12, "burn"))

	rows := rowsOf(t, present(in, newLearner(2)), "root")

	require.Len(t, rows, 3, "locked rows are shown, not hidden")
	assert.False(t, rows[0].Locked, "Torch@1 is available at level 2")
	assert.True(t, rows[1].Locked, "Ignite@7 is not")
	assert.True(t, rows[2].Locked, "nor Immolate@12")
	assert.EqualValues(t, 7, rows[1].RequiredLevel, "the wall is named so the panel can render it")
	assert.EqualValues(t, 12, rows[2].RequiredLevel)
}

// The row carries what the actor will say, chosen by the row's own state — which
// is what lets the panel answer on click with no round-trip (L24).
func TestPresent_RowCarriesTheReplyForItsState(t *testing.T) {
	in := teachingInteraction("Fire doesn't suffer the careless.", []string{"greetings"},
		namedGrant(1, "Torch", 1, "Let this be a light for you."),
		namedGrant(2, "Ignite", 7, "Let me show you fire."))

	rows := rowsOf(t, present(in, newLearner(2)), "root")

	require.Len(t, rows, 2)
	assert.Equal(t, "Let this be a light for you.", rows[0].Reply, "an available row replies with the grant line")
	assert.Equal(t, "Fire doesn't suffer the careless.", rows[1].Reply, "a locked row replies with the blockedLine")
}

// A navigation row hands nothing over, and says so with the wire default rather
// than a second flag.
func TestPresent_NavigationRowCarriesNoGrant(t *testing.T) {
	in := &mobs.Interaction{Nodes: []mobs.InteractionNode{
		{ID: "root", Lines: []string{"hello"}, Options: []mobs.InteractionOption{{Text: "Anything new?", Next: "news"}}},
		{ID: "news", Lines: []string{"They burned the forest."}},
	}}

	rows := rowsOf(t, present(in, newLearner(1)), "root")

	require.Len(t, rows, 1)
	assert.Equal(t, model.ConversationNoGrant, rows[0].GrantIndex)
	assert.Equal(t, "news", rows[0].Next)
	assert.False(t, rows[0].Locked)
}

// The sign-post case (ForestSign / LamplessTraveller): lines, no rows. It is a
// first-class shape, not a degenerate one — the panel shows the lore and Leave.
func TestPresent_LoreOnlyNodeHasNoRows(t *testing.T) {
	in := teachingInteraction("", []string{"No entry.", "Trolls up north."})

	c := present(in, newLearner(10))

	require.NotNil(t, c)
	assert.Equal(t, []string{"No entry.", "Trolls up north."}, c.Nodes[0].Lines)
	assert.Empty(t, c.Nodes[0].Options)
}

// The all-learned sage: the greeting survives even though every row is gone, so
// an NPC you have exhausted still talks instead of opening an empty box.
func TestPresent_AllKnownLeavesTheLinesStanding(t *testing.T) {
	in := teachingInteraction("too low", []string{"You have learned all I can teach."},
		namedGrant(1, "Torch", 1, "light"))
	p := newLearner(10)
	p.sc.Discover(1)

	c := present(in, p)

	require.NotNil(t, c)
	assert.Equal(t, []string{"You have learned all I can teach."}, c.Nodes[0].Lines)
	assert.Empty(t, rowsOf(t, c, "root"), "nothing left to pick")
}

func TestConditionsPass_UnknownKindFailsClosed(t *testing.T) {
	assert.False(t, conditionsPass([]mobs.InteractionCondition{{Kind: "hasQuest"}}, newLearner(99)),
		"a kind the engine does not implement must never pass by default")
}

// --- applyGrant(): hands over exactly ONE grant, validated on its own merits ---

func TestApplyGrant_TeachesExactlyOneSkill(t *testing.T) {
	in := teachingInteraction("too low", []string{"greetings"},
		namedGrant(1, "Torch", 1, "Let this be a light."),
		namedGrant(2, "Ignite", 1, "Let me show you fire."))
	p := newLearner(10) // qualifies for BOTH — the walk would have taught both

	reply, taught, ok := applyGrant(in, p, "root", 0, 0)

	require.True(t, ok)
	assert.Equal(t, "Let this be a light.", reply)
	require.NotNil(t, taught)
	assert.EqualValues(t, 1, *taught)
	assert.True(t, p.sc.HasDiscovered(1), "Torch is learned")
	assert.False(t, p.sc.HasDiscovered(2), "⚑ and Ignite is NOT — a list is not a walk (D17)")
	assert.Equal(t, 1, p.cascadeCalls, "one cascade for the one grant")
}

// The chunk's one behaviour change, stated as its own case so the diff is not
// mistaken for an accident: the same fixture that used to hand over three
// skills at once now hands over the one that was clicked.
func TestApplyGrant_TheOrderedWalkIsGone(t *testing.T) {
	in := teachingInteraction("too low", nil,
		namedGrant(1, "Torch", 1, "a"), namedGrant(2, "Ignite", 5, "b"), namedGrant(3, "Immolate", 10, "c"))
	p := newLearner(20) // qualifies for all three

	_, _, ok := applyGrant(in, p, "root", 0, 2)

	require.True(t, ok)
	assert.False(t, p.sc.HasDiscovered(1))
	assert.False(t, p.sc.HasDiscovered(2))
	assert.True(t, p.sc.HasDiscovered(3), "picking Immolate skips straight to it")
	assert.Equal(t, 1, p.cascadeCalls)
}

// D17/D20: a locked row answers with the authored blockedLine and grants
// nothing. It is accepted (the actor speaks) but hands nothing over.
func TestApplyGrant_LockedRowRefusesWithTheAuthoredLine(t *testing.T) {
	in := teachingInteraction("Fire doesn't suffer the careless.", nil,
		namedGrant(1, "Ignite", 7, "Let me show you fire."))
	p := newLearner(2)

	reply, taught, ok := applyGrant(in, p, "root", 0, 0)

	assert.True(t, ok, "the actor answers rather than ignoring the click")
	assert.Equal(t, "Fire doesn't suffer the careless.", reply)
	assert.Nil(t, taught)
	assert.False(t, p.sc.HasDiscovered(1))
	assert.Zero(t, p.cascadeCalls)
}

// Every refusal is validated on the row's OWN merits — never on the path taken
// to reach it, which is what keeps server session state down to two fields.
func TestApplyGrant_Refusals(t *testing.T) {
	build := func() *mobs.Interaction {
		in := teachingInteraction("too low", []string{"greetings"}, namedGrant(1, "Torch", 1, "light"))
		in.Nodes = append(in.Nodes, mobs.InteractionNode{
			ID:         "secret",
			Conditions: []mobs.InteractionCondition{{Kind: mobs.ConditionMinLevel, Value: 10}},
			Lines:      []string{"the vault"},
			Options: []mobs.InteractionOption{{
				Grants: []mobs.InteractionGrant{namedGrant(9, "Vault", 1, "the way in")},
			}},
		})
		return in
	}

	cases := []struct {
		name           string
		node           string
		option, grant  int
		level          uint32
		alreadyKnows   skills.SkillID
		wantTaughtNone bool
	}{
		{name: "unknown node", node: "nowhere", option: 0, grant: 0, level: 10},
		{name: "condition-failed node", node: "secret", option: 0, grant: 0, level: 3},
		{name: "option index out of range", node: "root", option: 7, grant: 0, level: 10},
		{name: "grant index out of range", node: "root", option: 0, grant: 7, level: 10},
		{name: "negative index", node: "root", option: 0, grant: -1, level: 10},
		{name: "already known", node: "root", option: 0, grant: 0, level: 10, alreadyKnows: 1},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			p := newLearner(tc.level)
			if tc.alreadyKnows != 0 {
				p.sc.Discover(tc.alreadyKnows)
			}
			before := p.cascadeCalls

			reply, taught, ok := applyGrant(build(), p, tc.node, tc.option, tc.grant)

			assert.False(t, ok, "refused")
			assert.Empty(t, reply, "silently — a stale click is ordinary, not an error")
			assert.Nil(t, taught)
			assert.Equal(t, before, p.cascadeCalls, "and nothing was applied")
		})
	}
}

// The gated node's grant IS reachable once its condition passes — proof the
// refusal above discriminates rather than disabling the path.
func TestApplyGrant_ConditionPassedNodeGrants(t *testing.T) {
	in := teachingInteraction("too low", []string{"greetings"}, namedGrant(1, "Torch", 1, "light"))
	in.Nodes = append(in.Nodes, mobs.InteractionNode{
		ID:         "secret",
		Conditions: []mobs.InteractionCondition{{Kind: mobs.ConditionMinLevel, Value: 10}},
		Lines:      []string{"the vault"},
		Options: []mobs.InteractionOption{{
			Grants: []mobs.InteractionGrant{namedGrant(9, "Vault", 1, "the way in")},
		}},
	})

	_, taught, ok := applyGrant(in, newLearner(10), "secret", 0, 0)

	require.True(t, ok)
	require.NotNil(t, taught)
	assert.EqualValues(t, 9, *taught)
}

// N1, the both-ends defect (plan-quests.md C0, archive/plan-entity-model.md
// §8b): presentOptions hides a row whose `next` names a node this player cannot
// see, and applyGrant had no equivalent check — so an invisible row stayed
// grantable by a replayed or crafted Interact naming its authored indices.
//
// ⚑ This is the shape of every quest turn-in row (reward plus follow-up node),
// which is why the fix lands before the vocabulary that authors it (L1).
func TestApplyGrant_RefusesARowNavigatingToAHiddenNode(t *testing.T) {
	build := func() *mobs.Interaction {
		return &mobs.Interaction{Nodes: []mobs.InteractionNode{
			{ID: "root", Lines: []string{"hello"}, Options: []mobs.InteractionOption{{
				Text:   "take the badge and step inside",
				Grants: []mobs.InteractionGrant{namedGrant(1, "Torch", 1, "light")},
				Next:   "vault",
			}}},
			{
				ID:         "vault",
				Conditions: []mobs.InteractionCondition{{Kind: mobs.ConditionMinLevel, Value: 10}},
				Lines:      []string{"the vault"},
			},
		}}
	}

	// The row is invisible to a level-1 player: its destination is gated.
	assert.Empty(t, rowsOf(t, present(build(), newLearner(1)), "root"),
		"the row is hidden — its destination node is condition-failed")

	p := newLearner(1)
	reply, taught, ok := applyGrant(build(), p, "root", 0, 0)

	assert.False(t, ok, "a hidden row is refused, not granted")
	assert.Empty(t, reply)
	assert.Nil(t, taught)
	assert.False(t, p.sc.HasDiscovered(1), "and the spellbook is untouched")

	// ...and it discriminates: the same row is grantable once the destination is
	// visible, or the fix would have disabled grant+navigate rows outright.
	high := newLearner(10)
	_, taught, ok = applyGrant(build(), high, "root", 0, 0)
	require.True(t, ok)
	require.NotNil(t, taught)
}

// The converse direction of TestPresentAndApplyGrant_CannotDisagree, which L24
// asked for and which that test structurally cannot cover: it iterates only the
// rows present() emitted, so it proves presented ⇒ accepted and never
// accepted ⇒ presented. This one enumerates EVERY authored index triple and
// asserts that anything applyGrant accepts was on screen.
func TestApplyGrant_AcceptsOnlyWhatPresentEmitted(t *testing.T) {
	build := func() *mobs.Interaction {
		return &mobs.Interaction{Nodes: []mobs.InteractionNode{
			{ID: "root", Lines: []string{"hello"}, Options: []mobs.InteractionOption{
				{Text: "learn", BlockedLine: "too low", Grants: []mobs.InteractionGrant{
					namedGrant(1, "Torch", 1, "light"),
					namedGrant(2, "Ignite", 7, "fire"),
				}},
				{Text: "step inside", Grants: []mobs.InteractionGrant{
					namedGrant(3, "Vault", 1, "the way in"),
				}, Next: "vault"},
				{Text: "gossip", Next: "news"},
			}},
			{
				ID:         "vault",
				Conditions: []mobs.InteractionCondition{{Kind: mobs.ConditionMinLevel, Value: 10}},
				Lines:      []string{"the vault"},
			},
			{ID: "news", Lines: []string{"news"}},
		}}
	}

	for _, level := range []uint32{1, 7, 10, 30} {
		in := build()
		presented := map[[2]int]bool{}
		for _, node := range present(in, newLearner(level)).Nodes {
			for _, row := range node.Options {
				presented[[2]int{int(row.OptionIndex), int(row.GrantIndex)}] = true
			}
		}

		for ni := range in.Nodes {
			node := &in.Nodes[ni]
			for oi := range node.Options {
				for gi := range node.Options[oi].Grants {
					_, _, ok := applyGrant(build(), newLearner(level), node.ID, oi, gi)
					if ok {
						assert.True(t, presented[[2]int{oi, gi}],
							"level %d: node %q option %d grant %d was accepted but never shown",
							level, node.ID, oi, gi)
					}
				}
			}
		}
	}
}

// A navigation row is not a grant, so taking one through applyGrant is a
// mistake the server refuses rather than a no-op it accepts.
func TestApplyGrant_RefusesANavigationRow(t *testing.T) {
	in := &mobs.Interaction{Nodes: []mobs.InteractionNode{
		{ID: "root", Lines: []string{"hello"}, Options: []mobs.InteractionOption{{Text: "on", Next: "news"}}},
		{ID: "news", Lines: []string{"news"}},
	}}

	_, _, ok := applyGrant(in, newLearner(10), "root", 0, int(model.ConversationNoGrant))
	assert.False(t, ok)
}

// ⚑ L24, and the test that landmine explicitly asks for INSTEAD of a
// refusal-message wire path: the panel speaks optimistically from the row's
// `reply` before the server has applied anything, so the row's state and
// applyGrant()'s verdict must be incapable of disagreeing. Swept across the
// levels that straddle every wall.
func TestPresentAndApplyGrant_CannotDisagree(t *testing.T) {
	newIn := func() *mobs.Interaction {
		return teachingInteraction("Fire doesn't suffer the careless.", []string{"greetings"},
			namedGrant(1, "Torch", 1, "light"),
			namedGrant(2, "Ignite", 7, "fire"),
			namedGrant(3, "Immolate", 12, "burn"))
	}

	for _, level := range []uint32{1, 2, 6, 7, 11, 12, 30} {
		for _, known := range []skills.SkillID{0, 1, 2, 3} {
			seen := newLearner(level)
			if known != 0 {
				seen.sc.Discover(known)
			}
			rows := rowsOf(t, present(newIn(), seen), "root")

			for i, row := range rows {
				// A fresh learner in the same state, so each row is taken from
				// exactly the situation it was presented in.
				taker := newLearner(level)
				if known != 0 {
					taker.sc.Discover(known)
				}
				reply, taught, ok := applyGrant(newIn(), taker, "root", int(row.OptionIndex), int(row.GrantIndex))

				require.True(t, ok, "level %d, known %d, row %d (%s): a presented row must always be accepted",
					level, known, i, row.Text)
				assert.Equal(t, row.Reply, reply,
					"level %d, known %d, row %d (%s): the panel already said this", level, known, i, row.Text)
				assert.Equal(t, !row.Locked, taught != nil,
					"level %d, known %d, row %d (%s): locked iff nothing is taught", level, known, i, row.Text)
			}
		}
	}
}

// --- InteractionSystem.Update: rising-edge wiring against real physics ---

// npcDef is the shape the migrated content authors: passive friendly faction,
// no loadout, no movement, one conversation.
func npcDef(name string, in *mobs.Interaction) *mobs.MobDefinition {
	return &mobs.MobDefinition{
		ID:   51,
		Name: name,
		// The sprite is irrelevant here, so every fixture borrows one — which
		// is what content does too (four merged NPCs share the Hermit sprite
		// via this same override).
		EntityType:        "Signpost",
		Faction:           5,
		AggroMask:         0,
		FriendlyToPlayers: true,
		Factors:           mobs.Factors{BaseMaxHealth: 200, Speed: 0},
		Body:              mobs.Body{Radius: 0.35, AggroRadius: 3},
		Interaction:       in,
	}
}

// countingConversant reveals how many times the evaluator ran (Interaction() is
// read exactly once per rising edge).
type countingConversant struct {
	Conversant
	calls int
}

func (c *countingConversant) Interaction() *mobs.Interaction {
	c.calls++
	return c.Conversant.Interaction()
}

func addNpcToSpace(t *testing.T, space *phy.Space, m *mob.Mob) {
	t.Helper()
	// Registration as game.addMobEntity does it: EVERY body dynamic, sensor
	// included — which is exactly what the deleted addNpcEntity had to do by
	// hand for the old two-shape NPC.
	for _, b := range m.Bodies() {
		space.AddShape(b)
	}
}

// --- ambient speech: the rising edge's only remaining job (D18) ---

// The anti-spam edge itself is unchanged; what it fires has changed. Ambient
// lore is called out once per entry, not once per tick, and re-fires when the
// player leaves and comes back.
func TestInteractionSystem_AmbientFiresOncePerRisingEdge(t *testing.T) {
	space := phy.NewSpace()

	m := mob.NewMob(npcDef("TownCrier", ambientInteraction([]string{"The bridge is out!"})), 0, nil)
	m.SetPosition(phy.Vec2f{X: 0, Y: 0})
	addNpcToSpace(t, space, m)

	p := newFakePlayer()
	p.level = 10
	player := phy.NewCircle(phy.Vec2f{X: 1, Y: 0}, 0.5)
	player.Shape().Layer = int(model.LayerPlayerCollision)
	player.Shape().UserData = model.PlayerEntity(p)
	space.AddShape(player)

	s := NewInteractionSystem()
	s.AddEntity(m)

	step := func() {
		space.Update()
		s.Update(33.0)
	}

	step()
	require.Len(t, sentOf(p), 1, "the actor calls out on entry")
	_, msg := decodeEntityMessage(t, sentOf(p)[0])
	assert.Equal(t, "The bridge is out!", msg)

	step()
	step()
	step()
	assert.Len(t, sentOf(p), 1, "standing in range does not re-fire")

	player.SetPosition(phy.Vec2f{X: 50, Y: 0})
	step()
	assert.Len(t, sentOf(p), 1, "leaving does not fire")

	player.SetPosition(phy.Vec2f{X: 1, Y: 0})
	step()
	assert.Len(t, sentOf(p), 2, "leave + re-enter calls out again")
}

// ⚑ D18's whole reason for existing: `trigger` was a SINGLE value, so an actor
// could never both call out as you pass AND answer the key. This is that NPC,
// and the assertion is that the ambient line costs the conversation nothing.
func TestInteractionSystem_AmbientDoesNotOpenAConversation(t *testing.T) {
	space := phy.NewSpace()

	m := mob.NewMob(npcDef("TownCrier",
		ambientInteraction([]string{"The bridge is out!"}, grant(1, 1, "learned heal"))), 0, nil)
	m.SetPosition(phy.Vec2f{X: 0, Y: 0})
	addNpcToSpace(t, space, m)

	p := newFakePlayer()
	p.level = 10
	addPlayerCollider(space, p, phy.Vec2f{X: 1, Y: 0})

	s := NewInteractionSystem()
	s.AddEntity(m)
	s.AddPlayer(p)

	for i := 0; i < 4; i++ {
		space.Update()
		s.Update(33.0)
	}

	assert.False(t, p.sc.HasDiscovered(1), "walking past must never teach")
	assert.Empty(t, unlocksOf(p), "so no attribution banner fires")
	require.Len(t, sentOf(p), 1, "only the ambient line, once")

	// ...and the conversation behind the key still works, on the same actor:
	// the row the panel would have shown teaches when it is taken.
	takeRow(p, m.Basic().ID(), "root", 0, 0)
	space.Update()
	s.Update(33.0)
	assert.True(t, p.sc.HasDiscovered(1), "the conversation the ambient line did not open still teaches")
}

// The whole rule, asserted on the SPELLBOOK rather than on a bubble: an actor
// that authors no ambient says nothing at all as you walk up. ⚑ This is 3b-i's
// L18 check surviving D18 — the guard it protected is gone, but the behaviour it
// protected is now the ONLY behaviour, and a regression here would present as
// the pre-3b ambush rather than as silence (every conversant authors lore
// lines, so a bubble would look plausible either way).
func TestInteractionSystem_ApproachTeachesAndSaysNothing(t *testing.T) {
	space := phy.NewSpace()

	m := mob.NewMob(npcDef("Farmer", teachingInteraction("too low", []string{"lore"}, grant(1, 1, "learned heal"))), 0, nil)
	m.SetPosition(phy.Vec2f{X: 0, Y: 0})
	addNpcToSpace(t, space, m)

	p := newFakePlayer()
	p.level = 10
	addPlayerCollider(space, p, phy.Vec2f{X: 1, Y: 0})

	s := NewInteractionSystem()
	s.AddEntity(m)

	for i := 0; i < 4; i++ {
		space.Update()
		s.Update(33.0)
	}

	assert.False(t, p.sc.HasDiscovered(1), "nothing is taught unprompted")
	assert.Empty(t, sentOf(p), "and nothing is said unprompted either")
	assert.Empty(t, unlocksOf(p), "so no attribution banner fires")
}

// --- the interact verb (chunk 3b-i) ---

// interactFixture wires the standard scene: one conversant at the origin, one
// registered player 1 unit away, inside the sensor.
func interactFixture(t *testing.T, in *mobs.Interaction) (*InteractionSystem, *phy.Space, *mob.Mob, *fakePlayer) {
	return namedInteractFixture(t, "Farmer", in)
}

func namedInteractFixture(t *testing.T, name string, in *mobs.Interaction) (*InteractionSystem, *phy.Space, *mob.Mob, *fakePlayer) {
	t.Helper()
	space := phy.NewSpace()

	m := mob.NewMob(npcDef(name, in), 0, nil)
	m.SetPosition(phy.Vec2f{X: 0, Y: 0})
	addNpcToSpace(t, space, m)

	p := newFakePlayer()
	p.level = 10
	p.SetPosition(phy.Vec2f{X: 1, Y: 0})
	addPlayerCollider(space, p, phy.Vec2f{X: 1, Y: 0})

	s := NewInteractionSystem()
	s.AddEntity(m)
	s.AddPlayer(p)
	return s, space, m, p
}

// The prompt: standing in range stamps who the player could talk to, which is
// the single value the client's badge and the server's validation both use.
func TestInteractionSystem_StampsInteractableWhileInRange(t *testing.T) {
	s, space, m, p := interactFixture(t, teachingInteraction("too low", []string{"lore"}, grant(1, 1, "learned heal")))

	space.Update()
	s.Update(33.0)

	assert.Equal(t, m.Basic().ID(), p.Interactable(), "an actor in range is offered")
	assert.Empty(t, sentOf(p), "but offering is not speaking")
}

// ⚑ L20. The stamp and the drain live in one Update, and the stamp must come
// first: ResetTickNumbers zeroed the field at the top of this tick, so a
// handlers-first Update would validate every keypress against 0 and refuse it.
// This is the test that fails if the two halves are ever reordered.
func TestInteractionSystem_StampAndInteractInTheSameTick(t *testing.T) {
	s, space, m, p := interactFixture(t, teachingInteraction("too low", []string{"lore"}, grant(1, 1, "learned heal")))

	// The click is already queued when the tick begins — the ordinary case,
	// since the client sends it a tick or more before the server drains it.
	takeRow(p, m.Basic().ID(), "root", 0, 0)

	space.Update()
	s.Update(33.0)

	assert.True(t, p.sc.HasDiscovered(1), "the row is honoured in the same tick it was stamped")
	require.Len(t, unlocksOf(p), 1, "and attributed")
}

// Range enforcement: the server honours only the actor it told this player
// about. Naming a real conversant that is out of range is refused without a
// word — a stale keypress from a player who walked away is ordinary, not an
// error. This is the whole of the range check: one comparison against the value
// the client was given, never a second geometry implementation that could
// disagree with the badge it drew.
func TestInteractionSystem_RefusesUnofferedActor(t *testing.T) {
	s, space, near, p := interactFixture(t, teachingInteraction("", []string{"near"}))

	// A second conversant, well outside the player's reach, teaching skill 1.
	far := mob.NewMob(npcDef("Hermit", teachingInteraction("too low", nil, grant(1, 1, "learned heal"))), 0, nil)
	far.SetPosition(phy.Vec2f{X: 50, Y: 0})
	addNpcToSpace(t, space, far)
	s.AddEntity(far)

	takeRow(p, far.Basic().ID(), "root", 0, 0)
	space.Update()
	s.Update(33.0)

	assert.Equal(t, near.Basic().ID(), p.Interactable(), "only the near actor was offered")
	assert.False(t, p.sc.HasDiscovered(1), "so the far one is refused")
	assert.Empty(t, sentOf(p), "silently")
}

// D19 superseding D13: a conversation reply no longer travels as an
// EntityMessage AT ALL — the text already rode the streamed row, so the panel
// spoke it locally. Nothing is broadcast, which makes the crowded-town-square
// problem D13 solved disappear rather than be solved. The unlock banner stays
// private, as it always was.
func TestInteractionSystem_TakingARowBroadcastsNothing(t *testing.T) {
	s, space, m, p := interactFixture(t, teachingInteraction("too low", []string{"lore"}, grant(1, 1, "learned heal")))

	bystander := newFakePlayer()
	bystander.level = 10
	bystander.SetPosition(phy.Vec2f{X: -1, Y: 0})
	addPlayerCollider(space, bystander, phy.Vec2f{X: -1, Y: 0})
	s.AddPlayer(bystander)

	takeRow(p, m.Basic().ID(), "root", 0, 0)
	space.Update()
	s.Update(33.0)

	require.True(t, p.sc.HasDiscovered(1), "the row was taken")
	assert.Empty(t, sentOf(p), "and yet no bubble was sent — the panel already spoke (D19)")
	assert.Empty(t, sentOf(bystander), "least of all to a bystander")
	assert.Len(t, unlocksOf(p), 1, "only the private attribution banner")
	assert.Empty(t, unlocksOf(bystander))
	assert.Equal(t, m.Basic().ID(), bystander.Interactable(), "though they are offered the same actor")
}

// ...while AMBIENT speech is public by design, which is why speakToSensor kept
// its fan-out when the private reply was retired (D19).
func TestInteractionSystem_AmbientSpeechFansOut(t *testing.T) {
	s, space, _, p := interactFixture(t, ambientInteraction([]string{"The bridge is out!"}))

	bystander := newFakePlayer()
	bystander.level = 10
	bystander.SetPosition(phy.Vec2f{X: -1, Y: 0})
	addPlayerCollider(space, bystander, phy.Vec2f{X: -1, Y: 0})

	space.Update()
	s.Update(33.0)

	assert.NotEmpty(t, sentOf(p), "ambient speech reaches everyone standing around")
	assert.NotEmpty(t, sentOf(bystander))
}

// L17: where two sensors overlap, the stamp must be deterministic or the badge
// flickers between them as iteration order changes. Nearest by centre wins.
func TestInteractionSystem_NearestConversantWins(t *testing.T) {
	space := phy.NewSpace()

	near := mob.NewMob(npcDef("Farmer", teachingInteraction("", []string{"near"})), 0, nil)
	near.SetPosition(phy.Vec2f{X: 1, Y: 0})
	addNpcToSpace(t, space, near)

	far := mob.NewMob(npcDef("Hermit", teachingInteraction("", []string{"far"})), 0, nil)
	far.SetPosition(phy.Vec2f{X: -2, Y: 0})
	addNpcToSpace(t, space, far)

	p := newFakePlayer()
	p.level = 10
	p.SetPosition(phy.Vec2f{X: 0, Y: 0})
	addPlayerCollider(space, p, phy.Vec2f{X: 0, Y: 0})

	s := NewInteractionSystem()
	// Registered far-first, so a system that simply took the last offer would
	// pick the near one by accident and pass. Both orders are asserted below.
	s.AddEntity(far)
	s.AddEntity(near)
	s.AddPlayer(p)

	space.Update()
	s.Update(33.0)
	assert.Equal(t, near.Basic().ID(), p.Interactable(), "the nearer actor wins")

	p.interactableID, p.interactableDistSq = 0, 0
	s.actors[0], s.actors[1] = s.actors[1], s.actors[0]
	s.Update(33.0)
	assert.Equal(t, near.Basic().ID(), p.Interactable(), "regardless of registration order")
}

// A mob with nothing to say is not registered at all — capability, not type.
func TestInteractionSystem_IgnoresNonConversantMobs(t *testing.T) {
	s := NewInteractionSystem()
	s.AddEntity(mob.NewMob(testMobDef(), 0, nil))

	assert.Empty(t, s.actors, "an ordinary mob carries no conversation")
}

// Unlike the NPC system it replaced, Remove cannot be a no-op: a conversant is
// an ordinary actor now, and an actor can die or despawn.
func TestInteractionSystem_RemoveDropsActorAndItsEdgeState(t *testing.T) {
	m := mob.NewMob(npcDef("TownCrier", teachingInteraction("", []string{"lore"})), 0, nil)
	s := NewInteractionSystem()
	s.AddEntity(m)
	s.seen[m.Basic().ID()] = map[uint64]bool{7: true}

	s.Remove(m.Basic())

	assert.Empty(t, s.actors)
	assert.NotContains(t, s.seen, m.Basic().ID())
}

// ecs.World calls Remove on every system for every removed entity, so the
// players list needs the same sweep the actors list has — otherwise each
// disconnect leaks a player whose client queue keeps being drained (3b-i).
func TestInteractionSystem_RemoveDropsPlayer(t *testing.T) {
	p := newFakePlayer()
	s := NewInteractionSystem()
	s.AddPlayer(p)
	require.Len(t, s.players, 1)

	s.Remove(p.Basic())

	assert.Empty(t, s.players, "a disconnected player must not stay registered")
}

// The attribution label is the definition's display name — the same one the
// mob catalog serves for nameplates (TownCrier → "Town Crier"). The merge
// deleted the old authored-name-vs-sprite-name fallback: one name per actor.
func TestInteractionSystem_TeachEmitsUnlockAttribution(t *testing.T) {
	s, space, m, p := namedInteractFixture(t, "TownCrier",
		teachingInteraction("too low", nil, grant(7, 1, "learn to farm")))

	takeRow(p, m.Basic().ID(), "root", 0, 0)
	space.Update()
	s.Update(33.0)

	require.Len(t, unlocksOf(p), 1, "one unlock attribution for the one taught skill")
	assert.Equal(t, uint64(7), unlocksOf(p)[0].skillID)
	assert.Equal(t, "Taught by: Town Crier", unlocksOf(p)[0].source)

	// Standing in range without pressing again must not re-emit.
	s.Update(33.0)
	assert.Len(t, unlocksOf(p), 1, "no re-emit while merely standing in range")
}

// Ambient's audience is everyone in the sensor, not just whoever crossed the
// edge — one marshal, fanned. The newline join into a single bubble is the
// existing speech contract and is pinned here because ambient is now its only
// caller.
func TestInteractionSystem_AmbientReachesAllSensorPlayers(t *testing.T) {
	space := phy.NewSpace()

	m := mob.NewMob(npcDef("ForestSign",
		ambientInteraction([]string{"Welcome, traveler.", "Trolls up north."})), 0, nil)
	m.SetPosition(phy.Vec2f{X: 0, Y: 0})
	addNpcToSpace(t, space, m)

	s := NewInteractionSystem()
	s.AddEntity(m)

	// A bystander already standing in range; a newcomer waiting out of range.
	bystander := newFakePlayer()
	bystander.level = 10
	addPlayerCollider(space, bystander, phy.Vec2f{X: 1, Y: 0})
	newcomer := newFakePlayer()
	newcomer.level = 10
	newcomerBody := addPlayerCollider(space, newcomer, phy.Vec2f{X: 50, Y: 0})

	step := func() { space.Update(); s.Update(33.0) }

	// Tick 1: the bystander alone approaches -> one bubble reaches it.
	step()
	require.Len(t, sentOf(bystander), 1, "bystander hears the actor on its own approach")
	bystanderBefore := len(sentOf(bystander))

	// Tick 2: the newcomer crosses in. It is the only rising edge, yet the
	// bubble it triggers fans out to EVERY player in the sensor.
	newcomerBody.SetPosition(phy.Vec2f{X: 2, Y: 0})
	step()

	assert.Len(t, sentOf(newcomer), 1, "newcomer hears the actor it approached")
	assert.Equal(t, bystanderBefore+1, len(sentOf(bystander)),
		"bystander who did not move also hears the newcomer's bubble (fan-out to all)")

	// Content: anchored on the actor, lines newline-joined into one bubble.
	id, msg := decodeEntityMessage(t, sentOf(newcomer)[0])
	assert.Equal(t, m.Basic().ID(), id, "bubble anchored on the actor entity")
	assert.Equal(t, "Welcome, traveler.\nTrolls up north.", msg, "lines joined into one bubble")
}

// --- the session: two fields, no node bookkeeping (chunk 3b-ii, D16) ---

// stepper advances one tick in the order the real loop uses.
//
// ⚑ It zeroes the interactable stamp first, because ResetTickNumbers
// (StatusEffectsSystem, priority 101) does exactly that before
// InteractionSystem (priority 20) runs — the double has no ResetTickNumbers of
// its own. Without it a player who walks away keeps a stale stamp forever and
// the range end-condition can never be observed. It is also L20 stated as a
// harness invariant: the system has to re-stamp before it validates anything.
func stepper(s *InteractionSystem, space *phy.Space, players ...*fakePlayer) func() {
	return func() {
		space.Update()
		for _, p := range players {
			p.interactableID, p.interactableDistSq = 0, 0
		}
		s.Update(33.0)
	}
}

// Opening streams the WHOLE personalised tree, not the node the player is on:
// the client navigates locally from here and only comes back to take a row.
func TestSession_OpeningStreamsTheWholeTree(t *testing.T) {
	in := &mobs.Interaction{Nodes: []mobs.InteractionNode{
		{ID: "root", Lines: []string{"hello"}, Options: []mobs.InteractionOption{{Text: "Anything new?", Next: "news"}}},
		{ID: "news", Lines: []string{"They burned the forest."}},
	}}
	s, space, m, p := namedInteractFixture(t, "TownCrier", in)
	step := stepper(s, space, p)

	step() // in range, no panel yet
	require.Nil(t, p.conversation, "standing in range opens nothing (D18)")

	pressInteract(p, m.Basic().ID())
	step()

	c := p.conversation
	require.NotNil(t, c, "the key opens the panel")
	assert.Equal(t, m.Basic().ID(), c.EntityID)
	assert.Equal(t, "Town Crier", c.ActorName, "the header carries the name, which is why NPCs need no nameplate")
	assert.Equal(t, "root", c.EntryNode)
	assert.ElementsMatch(t, []string{"root", "news"}, nodeIDs(c))
}

// The tree is rebuilt every tick, so a row taught this tick is gone from the
// next snapshot with no invalidation logic to get wrong.
func TestSession_TaughtRowVanishesFromTheNextSnapshot(t *testing.T) {
	s, space, m, p := interactFixture(t, teachingInteraction("too low", []string{"hello"},
		namedGrant(1, "Torch", 1, "light"), namedGrant(2, "Ignite", 1, "fire")))
	step := stepper(s, space, p)

	pressInteract(p, m.Basic().ID())
	step()
	require.Len(t, rowsOf(t, p.conversation, "root"), 2)

	takeRow(p, m.Basic().ID(), "root", 0, 0)
	step()

	rows := rowsOf(t, p.conversation, "root")
	require.Len(t, rows, 1, "the taught row is gone")
	assert.Equal(t, "Ignite", rows[0].Text)
	assert.True(t, p.sc.HasDiscovered(1))
	assert.False(t, p.sc.HasDiscovered(2), "and only the clicked row was taught (D17)")
}

// Leave / Escape / a second E. The panel then closes because the tree left the
// snapshot, never because the client decided to.
func TestSession_ClosesOnClose(t *testing.T) {
	s, space, m, p := interactFixture(t, teachingInteraction("too low", []string{"hello"}, namedGrant(1, "Torch", 1, "light")))
	step := stepper(s, space, p)

	pressInteract(p, m.Basic().ID())
	step()
	require.NotNil(t, p.conversation)

	p.client.(*fakeClient).interacts = append(p.client.(*fakeClient).interacts,
		&model.Interact{EntityID: m.Basic().ID(), Close: true})
	step()

	assert.Zero(t, p.ConversingWith())
	assert.Nil(t, p.conversation, "the tree goes with the session")
}

// ⚑ L26 in one test: talk range used to govern only whether a badge lit; it
// tears the panel down now, which is why every conversant authors a real range
// instead of inheriting aggroRadius 1.0.
func TestSession_ClosesOnWalkingOutOfRange(t *testing.T) {
	space := phy.NewSpace()
	m := mob.NewMob(npcDef("Farmer", teachingInteraction("too low", []string{"hello"}, namedGrant(1, "Torch", 1, "light"))), 0, nil)
	m.SetPosition(phy.Vec2f{X: 0, Y: 0})
	addNpcToSpace(t, space, m)

	p := newFakePlayer()
	p.level = 10
	p.SetPosition(phy.Vec2f{X: 1, Y: 0})
	body := addPlayerCollider(space, p, phy.Vec2f{X: 1, Y: 0})

	s := NewInteractionSystem()
	s.AddEntity(m)
	s.AddPlayer(p)
	step := stepper(s, space, p)

	pressInteract(p, m.Basic().ID())
	step()
	require.NotNil(t, p.conversation)

	body.SetPosition(phy.Vec2f{X: 50, Y: 0})
	p.SetPosition(phy.Vec2f{X: 50, Y: 0})
	step()

	assert.Zero(t, p.ConversingWith(), "walking away ends it")
	assert.Nil(t, p.conversation)
}

// ⚑ D21, the rule that makes a NON-BLOCKING panel safe: a player cannot be left
// reading dialogue while something eats them. Both sides count.
func TestSession_ClosesWhenEitherPartyEntersCombat(t *testing.T) {
	t.Run("the player is hit", func(t *testing.T) {
		s, space, m, p := interactFixture(t, teachingInteraction("too low", []string{"hello"}, namedGrant(1, "Torch", 1, "light")))
		step := stepper(s, space, p)

		pressInteract(p, m.Basic().ID())
		step()
		require.NotNil(t, p.conversation)

		p.inCombat = true
		step()

		assert.Zero(t, p.ConversingWith())
		assert.Nil(t, p.conversation)
	})

	t.Run("the actor is pulled into a fight", func(t *testing.T) {
		s, space, m, p := interactFixture(t, teachingInteraction("too low", []string{"hello"}, namedGrant(1, "Torch", 1, "light")))
		step := stepper(s, space, p)

		pressInteract(p, m.Basic().ID())
		step()
		require.NotNil(t, p.conversation)

		// Damage taken is the mob's own in-combat stamp (round 3): holding an
		// aggro target OR having been hit recently. A conversant is not normally
		// attackable, but the rule must hold for any actor that carries a
		// conversation — a teaching guard that fights bandits is the point of the
		// capability model.
		m.PlayerTouches(p, model.Damage{HP: 5})
		step()

		require.True(t, m.InCombat(), "the actor really is in combat")
		assert.Zero(t, p.ConversingWith(), "so the conversation ends")
		assert.Nil(t, p.conversation)
	})
}

// ⚑ The OFFER side of D21, and the half no in-game harness can reach: no cheat
// can stamp player combat (DAMAGE bypasses takeDamage, THREAT is read-only), so
// the browser harness reports SKIP here and these are the only eyes on it.
//
// Combat must withdraw the offer, not merely tear down the session. If it only
// tore down, sense() would keep stamping through the whole recent-combat window
// (~3.3 s, the shared combatRegenGraceTicks) and the client — which draws the
// badge straight from this value — would light a key cap over an actor that
// refuses to talk. Since the interact key is edge-triggered, the player would
// press it, get nothing, and have to release and press again until the window
// expired. A prompt that does nothing is precisely what handleInteracts'
// contract says must never exist.
func TestInteractionSystem_CombatWithdrawsTheOffer(t *testing.T) {
	t.Run("the player is in combat", func(t *testing.T) {
		s, space, m, p := interactFixture(t, teachingInteraction("too low", []string{"lore"}, grant(1, 1, "learned heal")))
		step := stepper(s, space, p)

		step()
		require.Equal(t, m.Basic().ID(), p.Interactable(), "offered while out of combat")

		p.inCombat = true
		step()
		assert.Zero(t, p.Interactable(), "the badge goes dark rather than lying")

		// And the verb agrees, because it validates against that same number.
		pressInteract(p, m.Basic().ID())
		step()
		assert.Zero(t, p.ConversingWith(), "E cannot open what was never offered")

		// The offer returns on its own once the window passes — no re-entry
		// bookkeeping, because the stamp is live state rather than an event.
		p.inCombat = false
		step()
		assert.Equal(t, m.Basic().ID(), p.Interactable(), "and comes back by itself")
	})

	t.Run("the actor is in combat", func(t *testing.T) {
		s, space, m, p := interactFixture(t, teachingInteraction("too low", []string{"lore"}, grant(1, 1, "learned heal")))
		step := stepper(s, space, p)

		step()
		require.Equal(t, m.Basic().ID(), p.Interactable())

		m.PlayerTouches(p, model.Damage{HP: 5})
		step()

		require.True(t, m.InCombat(), "the actor really is in combat")
		assert.Zero(t, p.Interactable(), "a fighting actor stops offering to talk")
	})
}

// Ambient lines are deliberately NOT gated by combat: they are independent of
// the conversation (D18), and the town crier calling out as the player sprints
// past mid-fight is the behaviour rather than a bug. Pinned because the obvious
// reading of "combat suppresses talking" would sweep these up too.
func TestInteractionSystem_AmbientStillFiresInCombat(t *testing.T) {
	s, space, _, p := interactFixture(t, &mobs.Interaction{
		Ambient: []string{"Hear ye!"},
		Nodes:   []mobs.InteractionNode{{ID: "root", Lines: []string{"lore"}}},
	})
	step := stepper(s, space, p)

	p.inCombat = true
	step()

	assert.Zero(t, p.Interactable(), "no offer while fighting")
	require.Len(t, sentOf(p), 1, "but the crier still calls out")
	_, msg := decodeEntityMessage(t, sentOf(p)[0])
	assert.Equal(t, "Hear ye!", msg)
}

// The actor dying or despawning takes the panel with it — ecs.World calls
// Remove on every system, and a session naming an actor that is gone must not
// survive as a tree pointing at nothing.
func TestSession_ClosesWhenTheActorGoesAway(t *testing.T) {
	s, space, m, p := interactFixture(t, teachingInteraction("too low", []string{"hello"}, namedGrant(1, "Torch", 1, "light")))
	step := stepper(s, space, p)

	pressInteract(p, m.Basic().ID())
	step()
	require.NotNil(t, p.conversation)

	s.Remove(m.Basic())
	step()

	assert.Zero(t, p.ConversingWith())
	assert.Nil(t, p.conversation)
}

// A player who disconnects (or dies — RemoveEntity fans out the same way) is
// dropped from the system, so nothing keeps rebuilding a tree for a dead client.
func TestSession_DisconnectDropsThePlayerEntirely(t *testing.T) {
	s, space, m, p := interactFixture(t, teachingInteraction("too low", []string{"hello"}, namedGrant(1, "Torch", 1, "light")))
	step := stepper(s, space, p)

	pressInteract(p, m.Basic().ID())
	step()
	require.NotNil(t, p.conversation)

	s.Remove(p.Basic())
	step()

	assert.Empty(t, s.players, "no queue is drained for a client that is gone")
}

// ⚑ The bookkeeping-free half of D16: the server never tracks WHERE in the tree
// a player is, so a row from a node they never visited is honoured on its own
// merits. If this ever starts failing, someone has added session state that D16
// deliberately does without.
func TestSession_ARowFromAnUnvisitedNodeIsStillHonoured(t *testing.T) {
	in := &mobs.Interaction{Nodes: []mobs.InteractionNode{
		{ID: "root", Lines: []string{"hello"}, Options: []mobs.InteractionOption{{Text: "Teach me.", Next: "teachings"}}},
		{ID: "teachings", Lines: []string{"What would you have?"}, Options: []mobs.InteractionOption{{
			Text:   "Torch",
			Grants: []mobs.InteractionGrant{namedGrant(1, "Torch", 1, "light")},
		}}},
	}}
	s, space, m, p := interactFixture(t, in)
	step := stepper(s, space, p)

	pressInteract(p, m.Basic().ID())
	step()

	// Straight to the deep node's row, without ever "navigating" there.
	takeRow(p, m.Basic().ID(), "teachings", 0, 0)
	step()

	assert.True(t, p.sc.HasDiscovered(1))
}

// Taking a row out of range is refused by the same one comparison that gates
// opening — the badge and the verb cannot disagree.
func TestSession_ARowTakenOutOfRangeIsRefused(t *testing.T) {
	space := phy.NewSpace()
	m := mob.NewMob(npcDef("Farmer", teachingInteraction("too low", []string{"hello"}, namedGrant(1, "Torch", 1, "light"))), 0, nil)
	m.SetPosition(phy.Vec2f{X: 0, Y: 0})
	addNpcToSpace(t, space, m)

	p := newFakePlayer()
	p.level = 10
	p.SetPosition(phy.Vec2f{X: 50, Y: 0})
	addPlayerCollider(space, p, phy.Vec2f{X: 50, Y: 0})

	s := NewInteractionSystem()
	s.AddEntity(m)
	s.AddPlayer(p)

	takeRow(p, m.Basic().ID(), "root", 0, 0)
	stepper(s, space, p)()

	assert.False(t, p.sc.HasDiscovered(1), "no badge, no grant")
	assert.Empty(t, unlocksOf(p))
}

// --- the hold: an actor in conversation stops walking (D22) ---

// wanderingNpcDef is a conversant that actually MOVES. ⚑ It has to be synthetic:
// all 14 authored conversants ship speed 0, which is exactly why the chunk also
// authors a moving Wanderer in content — a hold that nothing exercises is a hold
// nobody would notice breaking.
func wanderingNpcDef(in *mobs.Interaction) *mobs.MobDefinition {
	def := npcDef("Wanderer", in)
	def.Factors.Speed = 0.5
	def.Factors.WanderRadius = 4
	def.Factors.IdleSpeedFactor = 1 // full pace, so a few ticks move a measurable distance
	def.Factors.IdleDwellMinTicks = 1
	def.Factors.IdleDwellMaxTicks = 1
	return def
}

// travelled runs n ticks of the actor's own Update and reports how far it moved.
func travelled(m *mob.Mob, n int) float32 {
	from := m.Position()
	for i := 0; i < n; i++ {
		m.Update(33.0)
	}
	return m.Position().Sub(from).Abs()
}

func TestHold_ActorStopsWhileTalkedToAndResumesAfter(t *testing.T) {
	space := phy.NewSpace()

	m := mob.NewMob(wanderingNpcDef(teachingInteraction("too low", []string{"hello"},
		namedGrant(1, "Torch", 1, "light"))), 0, nil)
	m.SetPosition(phy.Vec2f{X: 0, Y: 0})
	m.SetWander(phy.Vec2f{X: 0, Y: 0}, 4)
	addNpcToSpace(t, space, m)

	p := newFakePlayer()
	p.level = 10
	p.SetPosition(phy.Vec2f{X: 1, Y: 0})
	addPlayerCollider(space, p, phy.Vec2f{X: 1, Y: 0})

	s := NewInteractionSystem()
	s.AddEntity(m)
	s.AddPlayer(p)
	step := stepper(s, space, p)

	// Baseline: left alone, it wanders.
	step()
	require.Greater(t, travelled(m, 60), float32(0.5), "the fixture actually moves, or the test proves nothing")

	// Talking to it stops it.
	pressInteract(p, m.Basic().ID())
	step()
	require.NotNil(t, p.conversation)
	assert.InDelta(t, 0, travelled(m, 60), 0.001, "an actor in conversation holds position")

	// ...and it walks on again the moment the panel closes.
	p.client.(*fakeClient).interacts = append(p.client.(*fakeClient).interacts,
		&model.Interact{EntityID: m.Basic().ID(), Close: true})
	step()
	require.Zero(t, p.ConversingWith())
	assert.Greater(t, travelled(m, 60), float32(0.5), "and resumes afterwards")
}

// The hold is derived fresh every tick from who is actually talking, so an actor
// nobody is talking to is never held — no reference counting, nothing to leak.
func TestHold_ClearedForAnActorNobodyIsTalkingTo(t *testing.T) {
	s, space, m, p := interactFixture(t, teachingInteraction("too low", []string{"hello"}, namedGrant(1, "Torch", 1, "light")))
	step := stepper(s, space, p)

	other := mob.NewMob(wanderingNpcDef(teachingInteraction("", []string{"elsewhere"})), 0, nil)
	other.SetPosition(phy.Vec2f{X: 30, Y: 0})
	other.SetWander(phy.Vec2f{X: 30, Y: 0}, 4)
	addNpcToSpace(t, space, other)
	s.AddEntity(other)

	pressInteract(p, m.Basic().ID())
	step()
	require.NotNil(t, p.conversation, "one actor is being talked to")

	assert.Greater(t, travelled(other, 60), float32(0.5), "the one nobody is talking to keeps walking")
}

// The unattackability half of D5, asserted as BEHAVIOUR: an NPC body carries
// no Action bit, so an aura query for combat targets cannot see it at all —
// which is what makes it unattackable by hostile mobs too, not just players.
func TestInteractionSystem_NpcBodyIsNotAnAuraTarget(t *testing.T) {
	space := phy.NewSpace()

	def := npcDef("Farmer", teachingInteraction("", []string{"lore"}))
	def.Body.CollisionLayer = 97 // PlayerStatic|Viewport|MobStatic — no Action(2)
	m := mob.NewMob(def, 0, nil)
	m.SetPosition(phy.Vec2f{X: 0, Y: 0})
	addNpcToSpace(t, space, m)

	// An aura is a sensor masked to the combatant layers; this is the query
	// every damage aura runs.
	aura := phy.NewCircle(phy.Vec2f{X: 0, Y: 0}, 5)
	aura.Shape().Layer = int(model.LayerNoneCollision)
	aura.Shape().Mask = int(model.LayerCombatants)
	aura.Shape().IsSensor = true
	space.AddShape(aura)
	space.Update()

	for c := range aura.Collisions() {
		assert.NotSame(t, m.Bodies()[0], c, "an NPC body must never surface as an aura target")
	}
}

// --- quest talked-to stamping (plan-quests.md C1) ---

// Opening a session stamps the conversant's species id (MobID, L12) into the
// quest ledger's talked-to set. Merely standing in range stamps nothing — the
// badge is an offer, not a conversation.
func TestSession_OpeningStampsTalkedTo(t *testing.T) {
	in := &mobs.Interaction{Nodes: []mobs.InteractionNode{{ID: "root", Lines: []string{"hello"}}}}
	s, space, m, p := interactFixture(t, in)
	step := stepper(s, space, p)

	step()
	assert.False(t, p.ledger.HasTalkedTo(51), "standing in range is not talking (D18)")

	pressInteract(p, m.Basic().ID())
	step()
	assert.True(t, p.ledger.HasTalkedTo(51), "opening the panel stamps the conversant")
}
