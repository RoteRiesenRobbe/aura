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
	"github.com/RoteRiesenRobbe/aura/pkg/aura/quests"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

// --- test doubles (ported verbatim from the deleted npc_test.go) ---

// fakeLearner is a minimal player surface: a real spellbook (so Discover /
// HasDiscovered behave for real), a level, and a cascade-call counter.
type fakeLearner struct {
	sc           *skills.SkillComponent
	level        uint32
	cascadeCalls int
	// The quest surface the C2 vocabulary reads and writes. nil is a state a real
	// player is never in, and the evaluator is pinned to fail closed on it rather
	// than panic inside a per-tick render path.
	ledger *quests.Ledger
	xp     []uint64
	// bloodline is what this slot has already spent (C2a step 3), ascensions how
	// many lives it has spent getting there (C2a step 4).
	bloodline  []string
	ascensions int
	accountID  int64
}

func (f *fakeLearner) SkillComponent() *skills.SkillComponent { return f.sc }
func (f *fakeLearner) Progression() model.PlayerProgression {
	return model.PlayerProgression{Level: f.level}
}
func (f *fakeLearner) ApplyRecipeCascade()             { f.cascadeCalls++ }
func (f *fakeLearner) QuestLedger() *quests.Ledger     { return f.ledger }
func (f *fakeLearner) AddExperience(experience uint64) { f.xp = append(f.xp, experience) }
func (f *fakeLearner) BloodlineUnlocks() []string      { return f.bloodline }
func (f *fakeLearner) BloodlineAscensions() int        { return f.ascensions }
func (f *fakeLearner) AccountID() int64                { return f.accountID }

var _ learner = (*fakeLearner)(nil)

func newLearner(level uint32) *fakeLearner {
	return &fakeLearner{sc: skills.NewSkillComponent(true), level: level}
}

// newQuestLearner is a learner with a real ledger over the given quest content,
// so the evaluator's quest cases run against the actual ledger ops rather than a
// stub that cannot refuse anything.
func newQuestLearner(t *testing.T, level uint32, defs ...*quests.QuestDefinition) *fakeLearner {
	t.Helper()
	reg, err := quests.NewRegistry(defs...)
	require.NoError(t, err)
	l := newLearner(level)
	l.ledger = quests.NewLedger(reg)
	return l
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

// teachingInteraction is one node, one option and a grant list — exactly what
// the migrated NPCs author. Since D18 there is no trigger to choose: a
// conversation only ever opens on the key. (Q1/R1 deleted blockedLine — a
// locked row is greyed and inert, so there is no refusal line to author.)
func teachingInteraction(lines []string, grants ...mobs.InteractionGrant) *mobs.Interaction {
	node := mobs.InteractionNode{ID: "root", Lines: lines}
	if len(grants) > 0 {
		node.Options = []mobs.InteractionOption{{Grants: grants}}
	}
	return &mobs.Interaction{Nodes: []mobs.InteractionNode{node}}
}

// ambientInteraction is the town-crier shape (D18): lore called out to whoever
// walks past, AND a conversation behind the key. The two are independent
// fields, which is the whole reason the single-valued trigger was retired.
func ambientInteraction(ambient []string, grants ...mobs.InteractionGrant) *mobs.Interaction {
	in := teachingInteraction([]string{"lore"}, grants...)
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
	in := teachingInteraction([]string{"greetings"},
		grant(1, 1, "learned heal"), grant(2, 5, "learned dash"))
	p := newLearner(10) // qualifies for both

	c := present(in, p, noRows)

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

	c := present(in, newLearner(1), noRows)

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

	c := present(in, newLearner(1), noRows)

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

	assert.Equal(t, "root", present(in, newLearner(3), noRows).EntryNode, "the gated node is skipped")
	assert.Equal(t, "veteran", present(in, newLearner(10), noRows).EntryNode, "the gate opens exactly at the value")
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

	low := present(in, newLearner(3), noRows)
	assert.ElementsMatch(t, []string{"root", "directions"}, nodeIDs(low), "the gated node is not sent at all")
	require.Len(t, rowsOf(t, low, "root"), 1, "and the row pointing at it is hidden")
	assert.Equal(t, "Where is the mill?", rowsOf(t, low, "root")[0].Text)

	high := present(in, newLearner(10), noRows)
	assert.ElementsMatch(t, []string{"root", "secret", "directions"}, nodeIDs(high))
	assert.Len(t, rowsOf(t, high, "root"), 2)
}

func TestPresent_NoNodePassesMeansNoConversation(t *testing.T) {
	in := &mobs.Interaction{Nodes: []mobs.InteractionNode{{
		ID:         "veteran",
		Conditions: []mobs.InteractionCondition{{Kind: mobs.ConditionMinLevel, Value: 10}},
		Lines:      []string{"Well met."},
	}}}

	assert.Nil(t, present(in, newLearner(1), noRows), "an actor with nothing to say opens no panel")
}

// D17's cheap win: the 11 NPCs nobody re-authored need ZERO content work,
// because a legacy multi-grant option expands to one row per grant, each
// labelled with its skill's display name.
func TestPresent_ExpandsLegacyMultiGrantOptionToOneRowPerGrant(t *testing.T) {
	in := teachingInteraction([]string{"What would you have of the flame?"},
		namedGrant(1, "Torch", 1, "a light in dark places"),
		namedGrant(2, "Ignite", 7, "a fire in your enemies"),
		namedGrant(3, "Immolate", 12, "burn everything around you"))

	rows := rowsOf(t, present(in, newLearner(1), noRows), "root")

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

	rows := rowsOf(t, present(in, newLearner(1), noRows), "root")

	require.Len(t, rows, 1)
	assert.Equal(t, "Teach me the fire.", rows[0].Text)
	assert.EqualValues(t, 0, rows[0].GrantIndex, "it still carries its one grant")
}

// "Things already learned are not shown in that list" — the PO brief verbatim.
// Under 3a this was a silent skip inside the walk; it is visibility now.
func TestPresent_HidesKnownRows(t *testing.T) {
	in := teachingInteraction([]string{"greetings"},
		namedGrant(1, "Torch", 1, "light"),
		namedGrant(2, "Ignite", 1, "fire"))
	p := newLearner(10)
	p.sc.Discover(1) // already knows Torch

	rows := rowsOf(t, present(in, p, noRows), "root")

	require.Len(t, rows, 1, "the known row is gone")
	assert.Equal(t, "Ignite", rows[0].Text)
	// ⚑ L21 again, and this is the case that bites: the ONE remaining row is at
	// presented position 0 but authored grant index 1.
	assert.EqualValues(t, 1, rows[0].GrantIndex)
}

// D20: a row the player is too low for is SHOWN, greyed, with the wall named —
// each NPC becomes a signpost for progression and a reason to come back.
func TestPresent_LocksTooLowRowsAndNamesTheWall(t *testing.T) {
	in := teachingInteraction([]string{"greetings"},
		namedGrant(1, "Torch", 1, "light"),
		namedGrant(2, "Ignite", 7, "fire"),
		namedGrant(3, "Immolate", 12, "burn"))

	rows := rowsOf(t, present(in, newLearner(2), noRows), "root")

	require.Len(t, rows, 3, "locked rows are shown, not hidden")
	assert.False(t, rows[0].Locked, "Torch@1 is available at level 2")
	assert.True(t, rows[1].Locked, "Ignite@7 is not")
	assert.True(t, rows[2].Locked, "nor Immolate@12")
	assert.EqualValues(t, 7, rows[1].RequiredLevel, "the wall is named so the panel can render it")
	assert.EqualValues(t, 12, rows[2].RequiredLevel)
}

// ⭐ A TEACHING ROW NAMES ITS SKILL, LOCKED OR NOT (plan-ascension.md §13.9's
// second consumer). The client hangs the spellbook's own tooltip off this, and
// the locked row is the one that needs it most: "come back at 7" is only worth
// showing if the player can find out what waits at 7.
func TestPresent_TeachingRowNamesItsSkill(t *testing.T) {
	in := teachingInteraction([]string{"greetings"},
		namedGrant(1, "Torch", 1, "light"),
		namedGrant(2, "Ignite", 7, "fire"))

	rows := rowsOf(t, present(in, newLearner(2), noRows), "root")

	require.Len(t, rows, 2)
	assert.EqualValues(t, 1, rows[0].SkillID, "an available row names what it teaches")
	require.True(t, rows[1].Locked)
	assert.EqualValues(t, 2, rows[1].SkillID, "and so does a row locked behind a level wall")
}

// A navigation row teaches nothing, so it is about no ability, and 0 is what
// tells the client to attach no tooltip to it.
func TestPresent_NavigationRowNamesNoSkill(t *testing.T) {
	in := &mobs.Interaction{Nodes: []mobs.InteractionNode{
		{ID: "root", Lines: []string{"hello"}, Options: []mobs.InteractionOption{{Text: "Anything new?", Next: "news"}}},
		{ID: "news", Lines: []string{"They burned the forest."}},
	}}

	rows := rowsOf(t, present(in, newLearner(1), noRows), "root")

	require.Len(t, rows, 1)
	assert.Zero(t, rows[0].SkillID)
}

// ⛑ THE AUTHORED DISPLAY NAME, NEVER A FRESH DERIVATION: the C3 defect
// (§13.8) in its second home. `Display()` resolves the override; deriving from
// the raw name re-implements the rule and silently drops it, which is the whole
// reason the override exists. Latent when written: none of the five skills with
// an authored override is currently taught by an NPC, so the first teacher
// authored for one would have been the first to render it wrong.
func TestPresent_RowUsesTheAuthoredDisplayName(t *testing.T) {
	g := namedGrant(1, "RimeBurst", 1, "cold")
	g.Skill.DisplayName = "Rime-Burst"
	in := teachingInteraction([]string{"greetings"}, g)

	rows := rowsOf(t, present(in, newLearner(2), noRows), "root")

	require.Len(t, rows, 1)
	assert.Equal(t, "Rime-Burst", rows[0].Text, "the override wins over CamelCase→spaces")
}

// The row carries what the actor will say, chosen by the row's own state — which
// is what lets the panel answer on click with no round-trip (L24). A locked row
// carries NOTHING (Q1/R1): the greying and the named wall are the whole message.
func TestPresent_RowCarriesTheReplyForItsState(t *testing.T) {
	in := teachingInteraction([]string{"greetings"},
		namedGrant(1, "Torch", 1, "Let this be a light for you."),
		namedGrant(2, "Ignite", 7, "Let me show you fire."))

	rows := rowsOf(t, present(in, newLearner(2), noRows), "root")

	require.Len(t, rows, 2)
	assert.Equal(t, "Let this be a light for you.", rows[0].Reply, "an available row replies with the grant line")
	assert.Empty(t, rows[1].Reply, "a locked row says nothing — it is inert")
}

// A navigation row hands nothing over, and says so with the wire default rather
// than a second flag.
func TestPresent_NavigationRowCarriesNoGrant(t *testing.T) {
	in := &mobs.Interaction{Nodes: []mobs.InteractionNode{
		{ID: "root", Lines: []string{"hello"}, Options: []mobs.InteractionOption{{Text: "Anything new?", Next: "news"}}},
		{ID: "news", Lines: []string{"They burned the forest."}},
	}}

	rows := rowsOf(t, present(in, newLearner(1), noRows), "root")

	require.Len(t, rows, 1)
	assert.Equal(t, model.ConversationNoGrant, rows[0].GrantIndex)
	assert.Equal(t, "news", rows[0].Next)
	assert.False(t, rows[0].Locked)
}

// The sign-post case (ForestSign / LamplessTraveller): lines, no rows. It is a
// first-class shape, not a degenerate one — the panel shows the lore and Leave.
func TestPresent_LoreOnlyNodeHasNoRows(t *testing.T) {
	in := teachingInteraction([]string{"No entry.", "Trolls up north."})

	c := present(in, newLearner(10), noRows)

	require.NotNil(t, c)
	assert.Equal(t, []string{"No entry.", "Trolls up north."}, c.Nodes[0].Lines)
	assert.Empty(t, c.Nodes[0].Options)
}

// The all-learned sage: the greeting survives even though every row is gone, so
// an NPC you have exhausted still talks instead of opening an empty box.
func TestPresent_AllKnownLeavesTheLinesStanding(t *testing.T) {
	in := teachingInteraction([]string{"You have learned all I can teach."},
		namedGrant(1, "Torch", 1, "light"))
	p := newLearner(10)
	p.sc.Discover(1)

	c := present(in, p, noRows)

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
	in := teachingInteraction([]string{"greetings"},
		namedGrant(1, "Torch", 1, "Let this be a light."),
		namedGrant(2, "Ignite", 1, "Let me show you fire."))
	p := newLearner(10) // qualifies for BOTH — the walk would have taught both

	reply, taught, ok := applyGrant(in, p, noRows, "root", 0, 0)

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
	in := teachingInteraction(nil,
		namedGrant(1, "Torch", 1, "a"), namedGrant(2, "Ignite", 5, "b"), namedGrant(3, "Immolate", 10, "c"))
	p := newLearner(20) // qualifies for all three

	_, _, ok := applyGrant(in, p, noRows, "root", 0, 2)

	require.True(t, ok)
	assert.False(t, p.sc.HasDiscovered(1))
	assert.False(t, p.sc.HasDiscovered(2))
	assert.True(t, p.sc.HasDiscovered(3), "picking Immolate skips straight to it")
	assert.Equal(t, 1, p.cascadeCalls)
}

// Q1/R1: a locked row is INERT — clicking it is refused exactly like a stale
// click, with no reply, no grant and no cascade. The greying already said it.
func TestApplyGrant_LockedRowIsSilentlyRefused(t *testing.T) {
	in := teachingInteraction(nil,
		namedGrant(1, "Ignite", 7, "Let me show you fire."))
	p := newLearner(2)

	reply, taught, ok := applyGrant(in, p, noRows, "root", 0, 0)

	assert.False(t, ok, "an ordinary silent refusal — the path a stale click already takes")
	assert.Empty(t, reply)
	assert.Nil(t, taught)
	assert.False(t, p.sc.HasDiscovered(1))
	assert.Zero(t, p.cascadeCalls)
}

// Every refusal is validated on the row's OWN merits — never on the path taken
// to reach it, which is what keeps server session state down to two fields.
func TestApplyGrant_Refusals(t *testing.T) {
	build := func() *mobs.Interaction {
		in := teachingInteraction([]string{"greetings"}, namedGrant(1, "Torch", 1, "light"))
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

			reply, taught, ok := applyGrant(build(), p, noRows, tc.node, tc.option, tc.grant)

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
	in := teachingInteraction([]string{"greetings"}, namedGrant(1, "Torch", 1, "light"))
	in.Nodes = append(in.Nodes, mobs.InteractionNode{
		ID:         "secret",
		Conditions: []mobs.InteractionCondition{{Kind: mobs.ConditionMinLevel, Value: 10}},
		Lines:      []string{"the vault"},
		Options: []mobs.InteractionOption{{
			Grants: []mobs.InteractionGrant{namedGrant(9, "Vault", 1, "the way in")},
		}},
	})

	_, taught, ok := applyGrant(in, newLearner(10), noRows, "secret", 0, 0)

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
	assert.Empty(t, rowsOf(t, present(build(), newLearner(1), noRows), "root"),
		"the row is hidden — its destination node is condition-failed")

	p := newLearner(1)
	reply, taught, ok := applyGrant(build(), p, noRows, "root", 0, 0)

	assert.False(t, ok, "a hidden row is refused, not granted")
	assert.Empty(t, reply)
	assert.Nil(t, taught)
	assert.False(t, p.sc.HasDiscovered(1), "and the spellbook is untouched")

	// ...and it discriminates: the same row is grantable once the destination is
	// visible, or the fix would have disabled grant+navigate rows outright.
	high := newLearner(10)
	_, taught, ok = applyGrant(build(), high, noRows, "root", 0, 0)
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
				{Text: "learn", Grants: []mobs.InteractionGrant{
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
		for _, node := range present(in, newLearner(level), noRows).Nodes {
			for _, row := range node.Options {
				presented[[2]int{int(row.OptionIndex), int(row.GrantIndex)}] = true
			}
		}

		for ni := range in.Nodes {
			node := &in.Nodes[ni]
			for oi := range node.Options {
				for gi := range node.Options[oi].Grants {
					_, _, ok := applyGrant(build(), newLearner(level), noRows, node.ID, oi, gi)
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

	_, _, ok := applyGrant(in, newLearner(10), noRows, "root", 0, int(model.ConversationNoGrant))
	assert.False(t, ok)
}

// ⚑ L24, and the test that landmine explicitly asks for INSTEAD of a
// refusal-message wire path: the panel speaks optimistically from the row's
// `reply` before the server has applied anything, so the row's state and
// applyGrant()'s verdict must be incapable of disagreeing. Swept across the
// levels that straddle every wall.
func TestPresentAndApplyGrant_CannotDisagree(t *testing.T) {
	newIn := func() *mobs.Interaction {
		return teachingInteraction([]string{"greetings"},
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
			rows := rowsOf(t, present(newIn(), seen, noRows), "root")

			for i, row := range rows {
				// A fresh learner in the same state, so each row is taken from
				// exactly the situation it was presented in.
				taker := newLearner(level)
				if known != 0 {
					taker.sc.Discover(known)
				}
				reply, taught, ok := applyGrant(newIn(), taker, noRows, "root", int(row.OptionIndex), int(row.GrantIndex))

				// Q1/R1's deliberate twin: a LOCKED row is presented with an
				// empty Reply and refused silently, so the panel's silence and
				// the server's refusal are the same statement.
				if row.Locked {
					assert.False(t, ok, "level %d, known %d, row %d (%s): a locked row is inert",
						level, known, i, row.Text)
					assert.Empty(t, row.Reply,
						"level %d, known %d, row %d (%s): the panel has nothing to speak for it", level, known, i, row.Text)
					assert.Empty(t, reply)
					assert.Nil(t, taught)
					continue
				}
				require.True(t, ok, "level %d, known %d, row %d (%s): a presented available row must always be accepted",
					level, known, i, row.Text)
				assert.Equal(t, row.Reply, reply,
					"level %d, known %d, row %d (%s): the panel already said this", level, known, i, row.Text)
				assert.NotNil(t, taught,
					"level %d, known %d, row %d (%s): an available row teaches", level, known, i, row.Text)
			}
		}
	}
}

// --- the quest vocabulary at the evaluator (plan-quests.md C2, §5) ---

const (
	questID   = "pelts"
	stageHunt = "hunt"
	stageTurn = "turn_in"
	stageDone = "done"
)

// peltsQuest is the three-stage shape C4 authors: an objective stage, a dialogue
// stage a turn-in row leaves, and a terminal stage. The edge is registered the way
// quests.CrossValidate registers it at boot, so `turn_in` waits instead of
// completing on entry.
func peltsQuest() *quests.QuestDefinition {
	q := &quests.QuestDefinition{
		ID: questID, Title: "Pelts",
		Stages: []*quests.Stage{
			{ID: stageHunt, Journal: "Hunt wolves.", Next: stageTurn,
				Objectives: []quests.Objective{{Kind: quests.ObjectiveKill, Target: 3, Count: 2}}},
			{ID: stageTurn, Journal: "Bring the pelts back."},
			{ID: stageDone, Journal: "Done."},
		},
	}
	q.NoteDialogueEdgeFrom(stageTurn)
	return q
}

func offerGrant() mobs.InteractionGrant {
	return mobs.InteractionGrant{Kind: mobs.GrantOfferQuest, Quest: questID, Line: "Then go."}
}

func advanceGrant() mobs.InteractionGrant {
	return mobs.InteractionGrant{
		Kind: mobs.GrantAdvanceQuest, Quest: questID,
		FromStage: stageTurn, ToStage: stageDone, Line: "You have my thanks.",
	}
}

// oneOption wraps grants in the single-option node shape every quest row has.
func oneOption(text string, grants ...mobs.InteractionGrant) *mobs.Interaction {
	return &mobs.Interaction{Nodes: []mobs.InteractionNode{{
		ID: "root", Lines: []string{"Wolves again."},
		Options: []mobs.InteractionOption{{Text: text, Grants: grants}},
	}}}
}

// ⭐ The load-bearing shape decision (§5, PO-ruled): a quest-bearing option is ONE
// row, not one row per grant the way a flat teaching list is. Otherwise a player
// could click the reward without advancing the quest.
func TestPresent_QuestOptionIsOneRow(t *testing.T) {
	in := oneOption("Here are the pelts.",
		advanceGrant(),
		mobs.InteractionGrant{Kind: mobs.GrantXP, XP: 250, Line: "experience"},
		namedGrant(1, "Torch", 0, "and this"))

	p := newQuestLearner(t, 1, peltsQuest())
	require.NoError(t, p.ledger.Accept(questID))
	p.ledger.NoteKill(3)
	p.ledger.NoteKill(3) // waiting at turn_in, so the show-rule lets the row through
	rows := rowsOf(t, present(in, p, noRows), "root")

	require.Len(t, rows, 1, "three grants, ONE row — the option is the atomic unit")
	assert.Equal(t, "Here are the pelts.", rows[0].Text, "labelled by the authored text, never by a reward")
	assert.EqualValues(t, 0, rows[0].GrantIndex, "the quest grant leads, so the row addresses index 0")
	assert.Equal(t, "You have my thanks.", rows[0].Reply, "the quest grant's line is the actor's answer")
}

// A quest row is NOT hidden by the already-known rule that hides a learned
// skill: its availability is the LEDGER's answer (CanApply), never the
// rewards' — a turn-in whose reward skill is already known still needs taking.
func TestPresent_QuestRowShownRegardlessOfRewardsAlreadyKnown(t *testing.T) {
	in := oneOption("Here are the pelts.", advanceGrant(), namedGrant(1, "Torch", 0, "and this"))
	p := newQuestLearner(t, 1, peltsQuest())
	require.NoError(t, p.ledger.Accept(questID))
	p.ledger.NoteKill(3)
	p.ledger.NoteKill(3) // waiting at turn_in, so the edge is walkable
	p.sc.Discover(1)     // already knows the reward skill

	rows := rowsOf(t, present(in, p, noRows), "root")
	require.Len(t, rows, 1, "the quest op still needs taking")
}

// ⭐ R1's headline (plan-conversation-journal.md Q1 §4.1 ②): a quest row is
// shown iff its ledger op would succeed. This is what makes an Accept row
// vanish the moment the quest is accepted while its sibling questions stay
// askable — per-ROW availability on a shared node, with no option-level
// conditions and nothing new to author.
func TestPresent_QuestRowShownIffItsLedgerOpWouldSucceed(t *testing.T) {
	in := &mobs.Interaction{Nodes: []mobs.InteractionNode{
		{
			ID: "quest_node", Lines: []string{"Wolves have taken the road."},
			Options: []mobs.InteractionOption{
				{Text: "I'll do it.", Grants: []mobs.InteractionGrant{offerGrant()}},
				{Text: "How many?", Next: "answer"},
				{Text: "Here are the pelts.", Grants: []mobs.InteractionGrant{advanceGrant()}},
			},
		},
		{ID: "answer", Lines: []string{"Two, at least."}},
	}}
	rowTexts := func(p *fakeLearner) []string {
		var texts []string
		for _, r := range rowsOf(t, present(in, p, noRows), "quest_node") {
			texts = append(texts, r.Text)
		}
		return texts
	}

	p := newQuestLearner(t, 1, peltsQuest())
	assert.Equal(t, []string{"I'll do it.", "How many?"}, rowTexts(p),
		"not started: the offer shows, the turn-in does not")

	require.NoError(t, p.ledger.Accept(questID))
	assert.Equal(t, []string{"How many?"}, rowTexts(p),
		"accepted: the Accept row is GONE, its sibling question stays askable")

	p.ledger.NoteKill(3)
	p.ledger.NoteKill(3)
	assert.Equal(t, []string{"How many?", "Here are the pelts."}, rowTexts(p),
		"objective met: the turn-in appears exactly when it can be taken")

	_, _, ok := applyGrant(in, p, noRows, "quest_node", 2, 0)
	require.True(t, ok)
	assert.Equal(t, []string{"How many?"}, rowTexts(p),
		"completed: both quest rows are gone, the question survives")
}

// A ledger-less learner sees no quest rows at all — the show-rule fails closed
// exactly like the apply-rule it mirrors.
func TestPresent_QuestRowHiddenWithoutALedger(t *testing.T) {
	in := oneOption("I'll help.", offerGrant())
	assert.Empty(t, rowsOf(t, present(in, newLearner(1), noRows), "root"))
}

// --- the empty-destination prune (PO 2026-08-02): a row that leads to nothing
// but Back is not shown. A navigation row promises the node behind it has
// something to take or ask; when every one of that node's authored options is
// currently hidden, the promise is empty and the row goes with them. Lore
// leaves — nodes that never authored options — stay reachable: their lines ARE
// the content.

// hubInteraction is the authored hub shape (farmer.json): a root whose rows
// NAVIGATE — one to the quest node, one to a lore leaf.
func hubInteraction() *mobs.Interaction {
	return &mobs.Interaction{Nodes: []mobs.InteractionNode{
		{ID: "root", Lines: []string{"Well?"}, Options: []mobs.InteractionOption{
			{Text: "Do you have a task for me?", Next: "quest_node"},
			{Text: "Who are you?", Next: "about"},
		}},
		{ID: "quest_node", Lines: []string{"The brief."}, Options: []mobs.InteractionOption{
			{Text: "I'll do it.", Grants: []mobs.InteractionGrant{offerGrant()}},
			{Text: "Here are the pelts.", Grants: []mobs.InteractionGrant{advanceGrant()}},
		}},
		{ID: "about", Lines: []string{"Nobody."}},
	}}
}

func rowTextsOf(t *testing.T, in *mobs.Interaction, p *fakeLearner, nodeID string) []string {
	t.Helper()
	var texts []string
	for _, r := range rowsOf(t, present(in, p, noRows), nodeID) {
		texts = append(texts, r.Text)
	}
	return texts
}

func TestPresent_NavRowHiddenWhileItsQuestNodeHasNothingTakeable(t *testing.T) {
	in := hubInteraction()
	p := newQuestLearner(t, 1, peltsQuest())

	assert.Contains(t, rowTextsOf(t, in, p, "root"), "Do you have a task for me?",
		"not started: the offer is takeable, so the way to it shows")

	require.NoError(t, p.ledger.Accept(questID))
	assert.NotContains(t, rowTextsOf(t, in, p, "root"), "Do you have a task for me?",
		"mid-quest: offer refused, turn-in not yet walkable — the node is nothing but Back")

	p.ledger.NoteKill(3)
	p.ledger.NoteKill(3)
	assert.Contains(t, rowTextsOf(t, in, p, "root"), "Do you have a task for me?",
		"turn-in walkable: the way back to it shows again")

	require.NoError(t, p.ledger.AdvanceDialogue(questID, stageTurn, stageDone))
	assert.NotContains(t, rowTextsOf(t, in, p, "root"), "Do you have a task for me?",
		"completed: the quest is spent and the row is gone for good")
	assert.Contains(t, rowTextsOf(t, in, p, "root"), "Who are you?",
		"the lore leaf never authored options, so the way to it survives every state")
}

func TestPresent_NavRowHiddenWhenEveryTeachingIsKnown(t *testing.T) {
	in := &mobs.Interaction{Nodes: []mobs.InteractionNode{
		{ID: "root", Lines: []string{"hm"}, Options: []mobs.InteractionOption{
			{Text: "Teach me something.", Next: "teachings"},
		}},
		{ID: "teachings", Lines: []string{"What do you want to learn?"}, Options: []mobs.InteractionOption{
			{Grants: []mobs.InteractionGrant{
				namedGrant(1, "Heal", 1, "yours"),
				namedGrant(2, "Dash", 5, "yours"),
			}},
		}},
	}}
	p := newLearner(1)

	assert.Contains(t, rowTextsOf(t, in, p, "root"), "Teach me something.")

	p.sc.Discover(1)
	assert.Contains(t, rowTextsOf(t, in, p, "root"), "Teach me something.",
		"Dash is level-locked but SHOWN (D20's signpost), so the node is still worth entering")

	p.sc.Discover(2)
	assert.NotContains(t, rowTextsOf(t, in, p, "root"), "Teach me something.",
		"everything behind the row is known: nothing but Back left, so the row goes")
}

// The prune cascades: a pure selection node (the nesting shape ruled for
// multi-quest NPCs) whose every row just got pruned is itself nothing but Back,
// so the row pointing at IT goes too.
func TestPresent_PruneCascadesThroughAPureSelectionNode(t *testing.T) {
	in := &mobs.Interaction{Nodes: []mobs.InteractionNode{
		{ID: "root", Lines: []string{"Well?"}, Options: []mobs.InteractionOption{
			{Text: "Something to do?", Next: "selection"},
		}},
		{ID: "selection", Lines: []string{"Pick."}, Options: []mobs.InteractionOption{
			{Text: "The pelts.", Next: "quest_node"},
		}},
		{ID: "quest_node", Lines: []string{"The brief."}, Options: []mobs.InteractionOption{
			{Text: "I'll do it.", Grants: []mobs.InteractionGrant{offerGrant()}},
			{Text: "Here are the pelts.", Grants: []mobs.InteractionGrant{advanceGrant()}},
		}},
	}}
	p := newQuestLearner(t, 1, peltsQuest())

	assert.Contains(t, rowTextsOf(t, in, p, "root"), "Something to do?")

	require.NoError(t, p.ledger.Accept(questID))
	p.ledger.NoteKill(3)
	p.ledger.NoteKill(3)
	require.NoError(t, p.ledger.AdvanceDialogue(questID, stageTurn, stageDone))

	assert.Empty(t, rowsOf(t, present(in, p, noRows), "root"),
		"quest done: the quest node empties, the selection row goes with it, and root's row follows")
}

func TestApplyGrant_OfferAcceptsTheQuest(t *testing.T) {
	in := oneOption("I'll help.", offerGrant())
	p := newQuestLearner(t, 1, peltsQuest())

	reply, taught, ok := applyGrant(in, p, noRows, "root", 0, 0)

	require.True(t, ok)
	assert.Equal(t, "Then go.", reply)
	assert.Nil(t, taught, "an offer teaches nothing, so no unlock banner fires")

	path, running, completed := p.ledger.Progress(questID)
	assert.Equal(t, []string{stageHunt}, path)
	assert.True(t, running)
	assert.False(t, completed)
}

// D3's retroactive credit, through the dialogue row rather than the cheat: a
// veteran who already has the kills completes the objective stage on accept.
// N4/D4 reversed the old retroactive cascade at this grant: kills from before
// the accept no longer credit — the click lands the quest on its objective
// stage, and only kills since then move it (the baseline is per stage entry).
func TestApplyGrant_OfferDoesNotCreditOldKills(t *testing.T) {
	in := oneOption("I'll help.", offerGrant())
	p := newQuestLearner(t, 1, peltsQuest())
	p.ledger.NoteKill(3)
	p.ledger.NoteKill(3)

	_, _, ok := applyGrant(in, p, noRows, "root", 0, 0)
	require.True(t, ok)

	path, running, _ := p.ledger.Progress(questID)
	assert.Equal(t, []string{stageHunt}, path, "the veteran's old kills do not fall through the stage")
	assert.True(t, running)

	p.ledger.NoteKill(3)
	p.ledger.NoteKill(3)
	path, running, _ = p.ledger.Progress(questID)
	assert.Equal(t, []string{stageHunt, stageTurn}, path, "two kills since accept clear the stage")
	assert.True(t, running, "and it waits at the dialogue stage rather than completing")
}

// ⚑ The anti-double-dip guard, and the reason the loader forces the quest grant
// to lead: the whole option is applied in authored order and abandoned entirely if
// the quest op is refused.
func TestApplyGrant_ReClickingAnOfferGrantsNothing(t *testing.T) {
	in := oneOption("I'll help.", offerGrant(),
		mobs.InteractionGrant{Kind: mobs.GrantXP, XP: 100, Line: "a little something"})
	p := newQuestLearner(t, 1, peltsQuest())

	_, _, ok := applyGrant(in, p, noRows, "root", 0, 0)
	require.True(t, ok)
	require.Equal(t, []uint64{100}, p.xp)

	_, _, ok = applyGrant(in, p, noRows, "root", 0, 0)

	assert.False(t, ok, "the quest is already running, so the row is refused outright")
	assert.Equal(t, []uint64{100}, p.xp, "and the reward is NOT paid a second time")
}

// The turn-in: one click advances the quest AND hands over every reward on the row.
func TestApplyGrant_TurnInAdvancesAndPaysOut(t *testing.T) {
	in := oneOption("Here are the pelts.",
		advanceGrant(),
		mobs.InteractionGrant{Kind: mobs.GrantXP, XP: 250, Line: "experience"},
		namedGrant(7, "Torch", 0, "and this"))
	p := newQuestLearner(t, 1, peltsQuest())
	require.NoError(t, p.ledger.Accept(questID))
	p.ledger.NoteKill(3)
	p.ledger.NoteKill(3) // now waiting at turn_in

	reply, taught, ok := applyGrant(in, p, noRows, "root", 0, 0)

	require.True(t, ok)
	assert.Equal(t, "You have my thanks.", reply)
	require.NotNil(t, taught, "the reward skill still reports for its unlock banner")
	assert.EqualValues(t, 7, *taught)

	_, running, completed := p.ledger.Progress(questID)
	assert.False(t, running)
	assert.True(t, completed, "the edge lands on a terminal stage")
	assert.Equal(t, []uint64{250}, p.xp)
	assert.True(t, p.sc.HasDiscovered(7))
	assert.Equal(t, 1, p.cascadeCalls, "and the recipe cascade ran for the taught skill")
}

// The transaction, from the other side: a turn-in taken at the wrong time pays
// out NOTHING, not "everything except the advance".
func TestApplyGrant_TurnInAtTheWrongStageGrantsNothing(t *testing.T) {
	in := oneOption("Here are the pelts.",
		advanceGrant(),
		mobs.InteractionGrant{Kind: mobs.GrantXP, XP: 250, Line: "experience"},
		namedGrant(7, "Torch", 0, "and this"))
	p := newQuestLearner(t, 1, peltsQuest())
	require.NoError(t, p.ledger.Accept(questID)) // still on `hunt`, no kills

	_, taught, ok := applyGrant(in, p, noRows, "root", 0, 0)

	assert.False(t, ok)
	assert.Nil(t, taught)
	assert.Empty(t, p.xp, "no XP")
	assert.False(t, p.sc.HasDiscovered(7), "no skill")
	assert.Zero(t, p.cascadeCalls)
}

// A quest grant addressed at a non-zero index is a crafted message: the loader
// guarantees the quest grant leads, so only index 0 can ever be presented.
func TestApplyGrant_RefusesAQuestGrantAddressedByARewardIndex(t *testing.T) {
	in := oneOption("Here are the pelts.",
		advanceGrant(),
		mobs.InteractionGrant{Kind: mobs.GrantXP, XP: 250, Line: "experience"})
	p := newQuestLearner(t, 1, peltsQuest())
	require.NoError(t, p.ledger.Accept(questID))
	p.ledger.NoteKill(3)
	p.ledger.NoteKill(3)

	_, _, ok := applyGrant(in, p, noRows, "root", 0, 1) // the XP grant, addressed directly

	assert.False(t, ok, "a reward inside a bundle is not separately takeable")
	assert.Empty(t, p.xp)
}

// A ledger-less learner must not panic the evaluator; refusing is the safe answer.
func TestApplyGrant_QuestRowWithoutALedgerIsRefused(t *testing.T) {
	in := oneOption("I'll help.", offerGrant())

	_, _, ok := applyGrant(in, newLearner(1), noRows, "root", 0, 0)
	assert.False(t, ok)
}

// --- quest_at_stage node gating ---

// questGatedInteraction is the authoring shape D11/L3 produce: conditional nodes
// first, the unconditional greeting last.
func questGatedInteraction() *mobs.Interaction {
	return &mobs.Interaction{Nodes: []mobs.InteractionNode{
		{
			ID:         "turn_in_node",
			Conditions: []mobs.InteractionCondition{{Kind: mobs.ConditionQuestAtStage, Quest: questID, Stage: stageTurn}},
			Lines:      []string{"You have them?"},
			Options:    []mobs.InteractionOption{{Text: "Here are the pelts.", Grants: []mobs.InteractionGrant{advanceGrant()}}},
		},
		{
			ID:         "thanks_node",
			Conditions: []mobs.InteractionCondition{{Kind: mobs.ConditionQuestAtStage, Quest: questID, Stage: mobs.QuestStageCompleted}},
			Lines:      []string{"The road is safer for it."},
		},
		{
			ID:         "offer_node",
			Conditions: []mobs.InteractionCondition{{Kind: mobs.ConditionQuestAtStage, Quest: questID, Stage: mobs.QuestStageNotStarted}},
			Lines:      []string{"Wolves have taken the road."},
			Options:    []mobs.InteractionOption{{Text: "I'll help.", Grants: []mobs.InteractionGrant{offerGrant()}}},
		},
		{ID: "root", Lines: []string{"Mind the road."}},
	}}
}

// ⭐ The whole point of the condition: one NPC, four things to say, chosen by
// where the player stands in the quest. This is what makes an offer disappear once
// taken and a turn-in appear only when earned.
func TestPresent_QuestStageSelectsTheGreeting(t *testing.T) {
	in := questGatedInteraction()

	p := newQuestLearner(t, 1, peltsQuest())
	assert.Equal(t, "offer_node", present(in, p, noRows).EntryNode, "not started → the offer")

	require.NoError(t, p.ledger.Accept(questID))
	assert.Equal(t, "root", present(in, p, noRows).EntryNode,
		"running but mid-objective → neither the offer nor the turn-in, so the fallback")

	p.ledger.NoteKill(3)
	p.ledger.NoteKill(3)
	assert.Equal(t, "turn_in_node", present(in, p, noRows).EntryNode, "objective met → the turn-in")

	_, _, ok := applyGrant(in, p, noRows, "turn_in_node", 0, 0)
	require.True(t, ok)
	assert.Equal(t, "thanks_node", present(in, p, noRows).EntryNode, "completed → the epilogue")
}

// The offer row is not merely deprioritised once the quest is running — its node
// is gone, and with it the row.
func TestPresent_OfferNodeVanishesOnceRunning(t *testing.T) {
	in := questGatedInteraction()
	p := newQuestLearner(t, 1, peltsQuest())
	require.NoError(t, p.ledger.Accept(questID))

	assert.NotContains(t, nodeIDs(present(in, p, noRows)), "offer_node")
}

// A quest condition with no ledger fails closed, like every unknown condition.
func TestConditionsPass_QuestConditionWithoutALedgerFailsClosed(t *testing.T) {
	in := questGatedInteraction()
	c := present(in, newLearner(1), noRows)

	require.NotNil(t, c, "the unconditional fallback still speaks")
	assert.Equal(t, "root", c.EntryNode)
	assert.Equal(t, []string{"root"}, nodeIDs(c), "every quest-gated node is hidden")
}

// The converse direction (C0's rule) over the quest vocabulary: nothing the
// ledger refuses may be reachable through a presented row.
func TestPresentAndApplyGrant_CannotDisagreeOnQuestRows(t *testing.T) {
	states := []func(p *fakeLearner){
		func(p *fakeLearner) {},
		func(p *fakeLearner) { _ = p.ledger.Accept(questID) },
		func(p *fakeLearner) {
			_ = p.ledger.Accept(questID)
			p.ledger.NoteKill(3)
			p.ledger.NoteKill(3)
		},
		func(p *fakeLearner) {
			_ = p.ledger.Accept(questID)
			p.ledger.NoteKill(3)
			p.ledger.NoteKill(3)
			_ = p.ledger.AdvanceDialogue(questID, stageTurn, stageDone)
		},
	}

	for i, setup := range states {
		in := questGatedInteraction()
		seen := newQuestLearner(t, 1, peltsQuest())
		setup(seen)

		for _, node := range present(in, seen, noRows).Nodes {
			for _, row := range node.Options {
				taker := newQuestLearner(t, 1, peltsQuest())
				setup(taker)

				reply, _, ok := applyGrant(questGatedInteraction(), taker, noRows, node.ID, int(row.OptionIndex), int(row.GrantIndex))

				assert.True(t, ok, "state %d: presented row %q on node %q was refused", i, row.Text, node.ID)
				assert.Equal(t, row.Reply, reply, "state %d: the panel already said this", i)
			}
		}
	}
}

// The converse over quest rows, the C0 pin the Q1 show-rule must keep honest
// (L3): with offer and turn-in sitting UNGATED on one shared node — the R1
// authoring shape — anything applyGrant accepts must have been on screen.
// Before the show-rule this fixture would present a turn-in the ledger refuses;
// with it, present() and applyGrant ask the ledger the same question.
func TestApplyGrant_AcceptsOnlyWhatPresentEmitted_QuestRows(t *testing.T) {
	build := func() *mobs.Interaction {
		return &mobs.Interaction{Nodes: []mobs.InteractionNode{
			{
				ID: "root", Lines: []string{"Wolves again."},
				Options: []mobs.InteractionOption{
					{Text: "I'll help.", Grants: []mobs.InteractionGrant{offerGrant()}},
					{Text: "Here are the pelts.", Grants: []mobs.InteractionGrant{advanceGrant()}},
					{Text: "gossip", Next: "news"},
				},
			},
			{ID: "news", Lines: []string{"news"}},
		}}
	}
	states := []func(p *fakeLearner){
		func(p *fakeLearner) {},
		func(p *fakeLearner) { _ = p.ledger.Accept(questID) },
		func(p *fakeLearner) {
			_ = p.ledger.Accept(questID)
			p.ledger.NoteKill(3)
			p.ledger.NoteKill(3)
		},
		func(p *fakeLearner) {
			_ = p.ledger.Accept(questID)
			p.ledger.NoteKill(3)
			p.ledger.NoteKill(3)
			_ = p.ledger.AdvanceDialogue(questID, stageTurn, stageDone)
		},
	}

	for i, setup := range states {
		in := build()
		seen := newQuestLearner(t, 1, peltsQuest())
		setup(seen)
		presented := map[[2]int]bool{}
		for _, node := range present(in, seen, noRows).Nodes {
			for _, row := range node.Options {
				presented[[2]int{int(row.OptionIndex), int(row.GrantIndex)}] = true
			}
		}

		for ni := range in.Nodes {
			node := &in.Nodes[ni]
			for oi := range node.Options {
				for gi := range node.Options[oi].Grants {
					taker := newQuestLearner(t, 1, peltsQuest())
					setup(taker)
					_, _, ok := applyGrant(build(), taker, noRows, node.ID, oi, gi)
					if ok {
						assert.True(t, presented[[2]int{oi, gi}],
							"state %d: node %q option %d grant %d was accepted but never shown", i, node.ID, oi, gi)
					}
				}
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

	m := mob.NewMob(npcDef("Farmer", teachingInteraction([]string{"lore"}, grant(1, 1, "learned heal"))), 0, nil)
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
	s, space, m, p := interactFixture(t, teachingInteraction([]string{"lore"}, grant(1, 1, "learned heal")))

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
	s, space, m, p := interactFixture(t, teachingInteraction([]string{"lore"}, grant(1, 1, "learned heal")))

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
	s, space, near, p := interactFixture(t, teachingInteraction([]string{"near"}))

	// A second conversant, well outside the player's reach, teaching skill 1.
	far := mob.NewMob(npcDef("Hermit", teachingInteraction(nil, grant(1, 1, "learned heal"))), 0, nil)
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
	s, space, m, p := interactFixture(t, teachingInteraction([]string{"lore"}, grant(1, 1, "learned heal")))

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

	near := mob.NewMob(npcDef("Farmer", teachingInteraction([]string{"near"})), 0, nil)
	near.SetPosition(phy.Vec2f{X: 1, Y: 0})
	addNpcToSpace(t, space, near)

	far := mob.NewMob(npcDef("Hermit", teachingInteraction([]string{"far"})), 0, nil)
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
	m := mob.NewMob(npcDef("TownCrier", teachingInteraction([]string{"lore"})), 0, nil)
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
		teachingInteraction(nil, grant(7, 1, "learn to farm")))

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
	s, space, m, p := interactFixture(t, teachingInteraction([]string{"hello"},
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
	s, space, m, p := interactFixture(t, teachingInteraction([]string{"hello"}, namedGrant(1, "Torch", 1, "light")))
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
	m := mob.NewMob(npcDef("Farmer", teachingInteraction([]string{"hello"}, namedGrant(1, "Torch", 1, "light"))), 0, nil)
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

// ⚑ Q1 §4.2 (plan-conversation-journal.md): combat no longer ends a
// conversation — D21's safety rationale is explicitly overruled, because
// nothing is blocked while the panel is open and the player's OWN aura ticking
// re-stamped the combat window, making them un-talkable for the whole fight
// plus 3.3 s. These are the entity-model D21 tests INVERTED, not deleted (L1):
// what still closes a session is range, death, disconnect and despawn.
func TestSession_SurvivesCombat(t *testing.T) {
	t.Run("the player is hit", func(t *testing.T) {
		s, space, m, p := interactFixture(t, teachingInteraction([]string{"hello"}, namedGrant(1, "Torch", 1, "light")))
		step := stepper(s, space, p)

		pressInteract(p, m.Basic().ID())
		step()
		require.NotNil(t, p.conversation)

		p.inCombat = true
		step()

		assert.Equal(t, m.Basic().ID(), p.ConversingWith(), "being hit does not close the panel")
		assert.NotNil(t, p.conversation)
	})

	t.Run("the actor is pulled into a fight", func(t *testing.T) {
		s, space, m, p := interactFixture(t, teachingInteraction([]string{"hello"}, namedGrant(1, "Torch", 1, "light")))
		step := stepper(s, space, p)

		pressInteract(p, m.Basic().ID())
		step()
		require.NotNil(t, p.conversation)

		m.PlayerTouches(p, model.Damage{HP: 5})
		step()

		require.True(t, m.InCombat(), "the actor really is in combat")
		assert.Equal(t, m.Basic().ID(), p.ConversingWith(), "and keeps talking anyway")
		assert.NotNil(t, p.conversation)
	})
}

// ⚑ The OFFER side, inverted with the session side above (Q1 §4.2 / L1): the
// entity-model R2 fix made sense() withdraw the offer in combat so the badge
// could not lie about a session the gates would refuse. With the gates gone the
// offer must SURVIVE combat — and these Go tests remain the only eyes on the
// offer path (no cheat can stamp player combat, so the browser harness cannot
// reach it), which is why they are inverted rather than deleted.
func TestInteractionSystem_CombatDoesNotWithdrawTheOffer(t *testing.T) {
	t.Run("the player is in combat", func(t *testing.T) {
		s, space, m, p := interactFixture(t, teachingInteraction([]string{"lore"}, grant(1, 1, "learned heal")))
		step := stepper(s, space, p)

		step()
		require.Equal(t, m.Basic().ID(), p.Interactable(), "offered while out of combat")

		p.inCombat = true
		step()
		assert.Equal(t, m.Basic().ID(), p.Interactable(), "the badge stays lit mid-fight")

		// And the verb agrees, because it validates against that same number.
		pressInteract(p, m.Basic().ID())
		step()
		assert.Equal(t, m.Basic().ID(), p.ConversingWith(), "E opens a conversation mid-fight")
	})

	t.Run("the actor is in combat", func(t *testing.T) {
		s, space, m, p := interactFixture(t, teachingInteraction([]string{"lore"}, grant(1, 1, "learned heal")))
		step := stepper(s, space, p)

		step()
		require.Equal(t, m.Basic().ID(), p.Interactable())

		m.PlayerTouches(p, model.Damage{HP: 5})
		step()

		require.True(t, m.InCombat(), "the actor really is in combat")
		assert.Equal(t, m.Basic().ID(), p.Interactable(), "a fighting actor still offers to talk")
	})
}

// Ambient lines were never gated by combat (D18), and now nothing about the
// interaction system is: the crier calls out AND offers, mid-fight.
func TestInteractionSystem_AmbientStillFiresInCombat(t *testing.T) {
	s, space, m, p := interactFixture(t, &mobs.Interaction{
		Ambient: []string{"Hear ye!"},
		Nodes:   []mobs.InteractionNode{{ID: "root", Lines: []string{"lore"}}},
	})
	step := stepper(s, space, p)

	p.inCombat = true
	step()

	assert.Equal(t, m.Basic().ID(), p.Interactable(), "the offer stands mid-fight too")
	require.Len(t, sentOf(p), 1, "and the crier still calls out")
	_, msg := decodeEntityMessage(t, sentOf(p)[0])
	assert.Equal(t, "Hear ye!", msg)
}

// The actor dying or despawning takes the panel with it — ecs.World calls
// Remove on every system, and a session naming an actor that is gone must not
// survive as a tree pointing at nothing.
func TestSession_ClosesWhenTheActorGoesAway(t *testing.T) {
	s, space, m, p := interactFixture(t, teachingInteraction([]string{"hello"}, namedGrant(1, "Torch", 1, "light")))
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
	s, space, m, p := interactFixture(t, teachingInteraction([]string{"hello"}, namedGrant(1, "Torch", 1, "light")))
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
	m := mob.NewMob(npcDef("Farmer", teachingInteraction([]string{"hello"}, namedGrant(1, "Torch", 1, "light"))), 0, nil)
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

	m := mob.NewMob(wanderingNpcDef(teachingInteraction([]string{"hello"},
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
	s, space, m, p := interactFixture(t, teachingInteraction([]string{"hello"}, namedGrant(1, "Torch", 1, "light")))
	step := stepper(s, space, p)

	other := mob.NewMob(wanderingNpcDef(teachingInteraction([]string{"elsewhere"})), 0, nil)
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

	def := npcDef("Farmer", teachingInteraction([]string{"lore"}))
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

// --- the node-level row source (plan-ascension.md §12.4 C2a step 2, P10) ---
//
// Some lists cannot be authored: what a bloodline may still learn is per-player
// and composed at render time, and so are the names on C3's memorial. A node
// declares where its rows come from and the evaluator asks a provider.
//
// ⚑ The provider is threaded as an ARGUMENT rather than held on the system,
// which keeps present() pure - the property its own doc calls the entire point
// of the presentation/mutation split. `noRows` is the nil provider every static
// test passes, spelled out so a call site says what it means.

var noRows RowSource

// fakeRowSource records what it was asked, which is how the round-trip tests
// prove the SAME kind and the SAME indices reach the provider that present()
// put on the wire.
type fakeRowSource struct {
	rows      []model.ConversationOption
	reply     string
	accept    map[int]bool // option index -> may be taken; nil means all
	presented []mobs.RowSourceKind
	applied   [][3]any // kind, option, grant
}

func (f *fakeRowSource) PresentRows(kind mobs.RowSourceKind, _ learner) []model.ConversationOption {
	f.presented = append(f.presented, kind)
	return f.rows
}

func (f *fakeRowSource) ApplyRow(kind mobs.RowSourceKind, _ learner, option, grant int) (string, bool) {
	f.applied = append(f.applied, [3]any{kind, option, grant})
	if f.accept != nil && !f.accept[option] {
		return "", false
	}
	return f.reply, true
}

// ⚑ GrantIndex 0, NEVER model.ConversationNoGrant. 255 means "navigation row"
// to the client and Conversation.ts refuses to SEND such a row, so a takeable
// generated row carrying the sentinel dead-ends in the panel while every Go
// test here stays green. The fake models what a real provider must emit.
func generatedRow(option int, text, reply string) model.ConversationOption {
	return model.ConversationOption{
		OptionIndex: uint8(option),
		GrantIndex:  0,
		Text:        text,
		Reply:       reply,
	}
}

func sourceInteraction() *mobs.Interaction {
	return &mobs.Interaction{Nodes: []mobs.InteractionNode{{
		ID:    "root",
		Lines: []string{"your line has learned all it can"},
		Rows:  mobs.RowSourceAscensionCatalog,
	}}}
}

func TestPresent_RendersTheRowsItsSourceGenerates(t *testing.T) {
	src := &fakeRowSource{rows: []model.ConversationOption{
		generatedRow(0, "Frost Shield", "it is yours"),
		generatedRow(1, "Paralyze", "it is yours"),
	}}

	rows := rowsOf(t, present(sourceInteraction(), newLearner(30), src), "root")

	require.Len(t, rows, 2)
	assert.Equal(t, "Frost Shield", rows[0].Text)
	assert.Equal(t, "Paralyze", rows[1].Text)
	assert.Equal(t, []mobs.RowSourceKind{mobs.RowSourceAscensionCatalog}, src.presented,
		"the node's own kind is what the provider is asked for")
}

// ⚑ FAILS CLOSED, like every other unresolved thing on this path. A build with
// no provider wired shows the node's lines and no rows rather than panicking -
// and the lines are exactly what the empty case says anyway (D14).
func TestPresent_ASourceNodeWithNoProviderStillSpeaks(t *testing.T) {
	c := present(sourceInteraction(), newLearner(30), noRows)

	require.NotNil(t, c)
	require.Len(t, c.Nodes, 1)
	assert.Equal(t, []string{"your line has learned all it can"}, c.Nodes[0].Lines)
	assert.Empty(t, c.Nodes[0].Options)
}

// The round trip: the indices present() streamed are the indices the provider
// is handed back, unchanged. L21's rule applied to a list nobody authored.
func TestApplyGrant_RoutesASourceNodeToItsProvider(t *testing.T) {
	src := &fakeRowSource{
		rows:  []model.ConversationOption{generatedRow(0, "Frost Shield", "it is yours")},
		reply: "it is yours",
	}

	reply, taught, ok := applyGrant(sourceInteraction(), newLearner(30), src, "root", 0, 0)

	require.True(t, ok)
	assert.Equal(t, "it is yours", reply)
	assert.Nil(t, taught, "a generated row hands over no skill of its own")
	require.Len(t, src.applied, 1)
	assert.Equal(t, [3]any{mobs.RowSourceAscensionCatalog, 0, 0}, src.applied[0])
}

func TestApplyGrant_RefusesASourceNodeWithNoProvider(t *testing.T) {
	_, _, ok := applyGrant(sourceInteraction(), newLearner(30), noRows, "root", 0, 0)
	assert.False(t, ok)
}

// ⭐ A row on a node this player cannot SEE must never reach the provider. The
// provider judges its own rows on their merits and has no idea which node it is
// speaking for - so if the node gate were skipped here, a crafted message would
// walk straight past a condition the panel enforces.
func TestApplyGrant_ASourceNodeStillHonoursItsConditions(t *testing.T) {
	in := sourceInteraction()
	in.Nodes[0].Conditions = []mobs.InteractionCondition{{Kind: mobs.ConditionMinLevel, Value: 30}}
	src := &fakeRowSource{rows: []model.ConversationOption{generatedRow(0, "Frost Shield", "yours")}, reply: "yours"}

	_, _, ok := applyGrant(in, newLearner(29), src, "root", 0, 0)

	assert.False(t, ok, "below the gate the node does not exist for this player")
	assert.Empty(t, src.applied, "and the provider was never even asked")
}

// D14 at the panel: a source that comes back empty leaves a node with lines and
// nothing else, and a row leading to it must SURVIVE the empty-destination
// prune. The alternative is a player who is told nothing at all about why their
// bloodline has run out.
func TestPresent_ALinkToAnEmptySourceNodeSurvivesThePrune(t *testing.T) {
	in := &mobs.Interaction{Nodes: []mobs.InteractionNode{
		{ID: "root", Lines: []string{"hello"}, Options: []mobs.InteractionOption{
			{Text: "what can my line still learn?", Next: "catalog"},
		}},
		{ID: "catalog", Lines: []string{"nothing left to teach"}, Rows: mobs.RowSourceAscensionCatalog},
	}}

	rows := rowsOf(t, present(in, newLearner(30), &fakeRowSource{}), "root")

	require.Len(t, rows, 1, "the way to the empty catalog stays on screen")
	assert.Equal(t, "catalog", rows[0].Next)
}

// The property test's whole point, extended over rows nobody authored: a
// presented row must always be acceptable, and the reply the panel already
// spoke must be the one the server produces. A provider that refused a row it
// had just presented would make the optimistic panel lie.
func TestPresentAndApplyGrant_CannotDisagree_OnGeneratedRows(t *testing.T) {
	newSrc := func() *fakeRowSource {
		return &fakeRowSource{
			rows: []model.ConversationOption{
				generatedRow(0, "Frost Shield", "it is yours"),
				generatedRow(3, "Paralyze", "it is yours"), // a sparse index, as a filtered list produces
			},
			reply: "it is yours",
			// ⚑ The fake accepts EXACTLY what it presented, and nothing else.
			// A permissive fake cannot tell this test apart from one where the
			// machinery shifts an index on the way through - which is precisely
			// the mutation this pin has to catch.
			accept: map[int]bool{0: true, 3: true},
		}
	}

	rows := rowsOf(t, present(sourceInteraction(), newLearner(30), newSrc()), "root")
	require.Len(t, rows, 2)

	for i, row := range rows {
		reply, _, ok := applyGrant(sourceInteraction(), newLearner(30), newSrc(), "root",
			int(row.OptionIndex), int(row.GrantIndex))
		require.True(t, ok, "row %d (%s): a presented row must always be accepted", i, row.Text)
		assert.Equal(t, row.Reply, reply, "row %d (%s): the panel already said this", i, row.Text)
	}
}

// ⭐ The converse direction, and the one that matters for a crafted message:
// the machinery FORWARDS an index, it does not vouch for it. A provider is the
// only thing that knows which rows it presented, so applyGrant must carry its
// refusal through untouched rather than treating "the node exists" as consent.
//
// ⚑ This is the generated-row twin of TestApplyGrant_AcceptsOnlyWhatPresentEmitted,
// which structurally cannot cover a list it did not author.
func TestApplyGrant_CarriesASourcesRefusalThrough(t *testing.T) {
	src := &fakeRowSource{
		rows:   []model.ConversationOption{generatedRow(0, "Frost Shield", "yours")},
		reply:  "yours",
		accept: map[int]bool{0: true}, // every other index is refused
	}

	_, _, ok := applyGrant(sourceInteraction(), newLearner(30), src, "root", 7, 0)
	assert.False(t, ok, "an index the source never presented is refused")

	_, _, ok = applyGrant(sourceInteraction(), newLearner(30), src, "root", 0, 0)
	assert.True(t, ok, "and the presented one still goes through")
}

// --- kills_this_life (plan-ascension.md §13 step 1, D18 tier A) ---

// killGate is a resolved gate, the shape the mob loader hands over: the id is
// what the ledger is keyed by, the name is what the player is shown.
func killGate(species mobs.MobID, count int) []mobs.InteractionCondition {
	return []mobs.InteractionCondition{
		{Kind: mobs.ConditionKillsThisLife, Species: "DireWolf", SpeciesID: species, Value: count},
	}
}

// The whole evaluation, and it costs NO new learner surface: QuestLedger() was
// already on it for quest_at_stage, KillCount is an O(1) map read, and NoteKill
// counts every credited kill of every species unconditionally, quest or no
// quest (quests/ledger.go NoteKill). D18 tier A, free exactly as claimed.
func TestConditionsPass_KillsThisLifeCountsTheLedger(t *testing.T) {
	const wolf = mobs.MobID(12)
	for _, tc := range []struct {
		kills int
		pass  bool
	}{{0, false}, {19, false}, {20, true}, {21, true}} {
		p := newQuestLearner(t, 30)
		for i := 0; i < tc.kills; i++ {
			p.ledger.NoteKill(wolf)
		}
		assert.Equal(t, tc.pass, conditionsPass(killGate(wolf, 20), p),
			"%d kills against a threshold of 20", tc.kills)
	}
}

// Kills of the WRONG species do not count toward the gate. Trivial-looking, and
// it is the pin that would go red if the evaluation ever read a total instead of
// a per-species count, which is exactly what a bare "kills" kind would have
// invited (D18's naming discipline).
func TestConditionsPass_KillsThisLifeIsPerSpecies(t *testing.T) {
	p := newQuestLearner(t, 30)
	for i := 0; i < 50; i++ {
		p.ledger.NoteKill(mobs.MobID(99))
	}
	assert.False(t, conditionsPass(killGate(mobs.MobID(12), 20), p),
		"fifty of something else is not twenty dire wolves")
}

// A nil ledger fails closed with everything else on this path: a conversation
// is not the place to panic, and the unconditional fallback node still speaks.
// ⚑ KillCount is read through a nil *Ledger here, which is the case MatchesStage
// already guards for and the reason the guard belongs in the ledger.
func TestConditionsPass_KillsThisLifeFailsClosedWithoutALedger(t *testing.T) {
	assert.False(t, conditionsPass(killGate(mobs.MobID(12), 20), newLearner(30)),
		"no ledger means no proof of the kills, not a free pass")
}

// ⭐ AN UNRESOLVED SPECIES FAILS CLOSED. A zero id is what a condition carries
// when nothing resolved it, and counting kills of "mob 0" would be a gate
// answering about the wrong species entirely. Until §13 step 2 cross-validates
// the ascension catalog, this is the belt to that braces.
func TestConditionsPass_KillsThisLifeFailsClosedOnAnUnresolvedSpecies(t *testing.T) {
	p := newQuestLearner(t, 30)
	for i := 0; i < 50; i++ {
		p.ledger.NoteKill(0)
	}
	unresolved := []mobs.InteractionCondition{
		{Kind: mobs.ConditionKillsThisLife, Species: "DireWolf", Value: 20},
	}
	assert.False(t, conditionsPass(unresolved, p),
		"a gate nobody resolved must never pass")
}

// --- the row-source mux (plan-ascension.md C3 step 6, P22) ---

// stubRows answers for exactly one kind, so the mux's dispatch is measurable.
type stubRows struct {
	kind mobs.RowSourceKind
	text string
}

func (s stubRows) PresentRows(kind mobs.RowSourceKind, _ learner) []model.ConversationOption {
	if kind != s.kind {
		return nil
	}
	return []model.ConversationOption{{Text: s.text}}
}

func (s stubRows) ApplyRow(kind mobs.RowSourceKind, _ learner, _, _ int) (string, bool) {
	if kind != s.kind {
		return "", false
	}
	return s.text, true
}

// ⭐ TWO CONSUMERS, ONE HOOK. P10 chose a node-level row source over a grant
// expansion precisely so the memorial could reuse it, and until C3 the system
// held exactly ONE source, so the claim was untested. This is the test.
func TestRowSourceMux_DispatchesByKind(t *testing.T) {
	mux := newRowSourceMux()
	mux.add(mobs.RowSourceAscensionCatalog, stubRows{mobs.RowSourceAscensionCatalog, "a reward"})
	mux.add(mobs.RowSourceMemorialNames, stubRows{mobs.RowSourceMemorialNames, "a name"})
	p := newLearner(30)

	rewards := mux.PresentRows(mobs.RowSourceAscensionCatalog, p)
	require.Len(t, rewards, 1)
	assert.Equal(t, "a reward", rewards[0].Text)

	names := mux.PresentRows(mobs.RowSourceMemorialNames, p)
	require.Len(t, names, 1)
	assert.Equal(t, "a name", names[0].Text)

	reply, ok := mux.ApplyRow(mobs.RowSourceMemorialNames, p, 0, 0)
	assert.True(t, ok)
	assert.Equal(t, "a name", reply)
}

// A kind nobody registered answers with nothing rather than panicking: an
// authored `rows` key the loader accepted but the wiring forgot is a bug, and
// the honest symptom is an empty list, not a dead server.
func TestRowSourceMux_AnUnregisteredKindServesNothing(t *testing.T) {
	mux := newRowSourceMux()
	mux.add(mobs.RowSourceAscensionCatalog, stubRows{mobs.RowSourceAscensionCatalog, "a reward"})

	assert.Empty(t, mux.PresentRows(mobs.RowSourceMemorialNames, newLearner(30)))
	_, ok := mux.ApplyRow(mobs.RowSourceMemorialNames, newLearner(30), 0, 0)
	assert.False(t, ok)
}

// ⛑ A DUPLICATE REGISTRATION IS A BUILD-ORDER BUG, and it must not be absorbed
// by silently keeping the last writer: two providers claiming one kind would
// surface as the monument showing reward rows, or the stone showing names, with
// nothing in any log to say why.
func TestRowSourceMux_RefusesADuplicateRegistration(t *testing.T) {
	mux := newRowSourceMux()
	mux.add(mobs.RowSourceMemorialNames, stubRows{mobs.RowSourceMemorialNames, "first"})

	assert.Panics(t, func() {
		mux.add(mobs.RowSourceMemorialNames, stubRows{mobs.RowSourceMemorialNames, "second"})
	})
}
