package sys

// The look step (plan-ascension-ceremony.md AC2, D7): a stone offers looks in
// one slot, the ones this character owns leave the list, a fixed "No new look"
// row skips it, and the pick is only granted when the channel completes.

import (
	"testing"
	"testing/fstest"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/appearance"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/persist"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

// stepLooks is gatedLooks plus three stone gifts: two portraits and a ring.
func stepLooks(t *testing.T) appearance.Catalog {
	t.Helper()
	files := gatedLookFiles()
	file := func(s string) *fstest.MapFile { return &fstest.MapFile{Data: []byte(s)} }
	files["elder.json"] = file(`{"id": "elder", "slot": "portrait", "scope": "bloodline", "grantedBy": "stone", "name": "Elder"}`)
	files["sage.json"] = file(`{"id": "sage", "slot": "portrait", "scope": "account", "grantedBy": "stone", "name": "Sage"}`)
	files["ring-heir.json"] = file(`{"id": "ring-heir", "slot": "ring", "family": "forest", "scope": "bloodline",
		"grantedBy": "stone", "name": "Heir Ring"}`)
	c, err := appearance.Load(files, lookWorld{})
	require.NoError(t, err)
	return c
}

func lookNode(id, slot string, looks ...string) *mobs.InteractionNode {
	return &mobs.InteractionNode{ID: id, Rows: mobs.RowSourceAscensionLooks, LookSlot: slot, Looks: looks}
}

// lookWalk is a stone of gift → portrait → ring, as the loader builds it.
func lookWalk(t *testing.T) (c *ascensionCeremony, looks appearance.Catalog, gift, portrait, ring, summary *mobs.InteractionNode) {
	t.Helper()
	looks = stepLooks(t)
	c = newAscensionCeremony(newAscensionRows(testCatalog(nil)), newAscensionLooks(looks))
	gift = catalogNode()
	gift.ID = "catalog"
	portrait = lookNode("portrait", "portrait", "elder", "sage")
	ring = lookNode("ring", "ring", "ring-heir")
	summary = inCeremony(gift, portrait, ring)
	return
}

func ownLook(p *fakeLearner, c appearance.Catalog, ids ...string) {
	for _, id := range ids {
		p.owned = append(p.owned, c.Flat(id))
	}
}

// --- what the step offers ----------------------------------------------------

func TestLookStep_OffersTheStonesLooksThenNoNewLook(t *testing.T) {
	c, looks, _, portrait, ring, _ := lookWalk(t)
	p := newAscensionLearner(30)

	rows := c.PresentRows(portrait, p)
	require.Len(t, rows, 3)
	assert.Equal(t, uint8(0), rows[0].OptionIndex)
	assert.Equal(t, "Elder", rows[0].Text)
	assert.Equal(t, looks.Flat("elder")+1, rows[0].Appearance, "the item rides as its flat index + 1")
	assert.Equal(t, uint8(1), rows[1].OptionIndex)
	assert.Equal(t, looks.Flat("sage")+1, rows[1].Appearance)
	skip := rows[2]
	assert.Equal(t, uint8(lookSkipIndex), skip.OptionIndex)
	assert.Zero(t, skip.Appearance)
	assert.Equal(t, "conversation.ascend.no-look", skip.TextKey)
	for _, r := range rows {
		// ⭐ Never the no-grant sentinel: the client sends only rows that grant.
		assert.NotEqual(t, model.ConversationNoGrant, r.GrantIndex)
		assert.False(t, r.Locked)
		assert.Equal(t, "ring", r.Next, "a pick leads to the next step")
	}
	assert.Equal(t, mobs.CeremonySummaryNodeID, c.PresentRows(ring, p)[0].Next)
}

// ⭐ L2: a row's index is its position in the AUTHORED list, so owning the
// first look does not renumber the second.
func TestLookStep_AnOwnedLookLeavesTheListAndTheIndicesStay(t *testing.T) {
	c, looks, _, portrait, _, _ := lookWalk(t)
	p := newAscensionLearner(30)
	ownLook(p, looks, "elder")

	rows := c.PresentRows(portrait, p)
	require.Len(t, rows, 2)
	assert.Equal(t, uint8(1), rows[0].OptionIndex)
	assert.Equal(t, looks.Flat("sage")+1, rows[0].Appearance)

	_, ok := c.ApplyRow(portrait, p, 0, 0)
	assert.False(t, ok, "an owned look cannot be picked")
	_, ok = c.ApplyRow(portrait, p, 1, 0)
	assert.True(t, ok)
}

// D5: a step with nothing left to offer is skipped in both directions and
// leaves no summary line; its skip row is not offered either.
func TestLookStep_AStepWithEverythingOwnedIsSkipped(t *testing.T) {
	c, looks, gift, portrait, ring, summary := lookWalk(t)
	p := newAscensionLearner(30)
	ownLook(p, looks, "elder", "sage")

	assert.Empty(t, c.PresentRows(portrait, p))
	assert.Equal(t, "ring", c.PresentRows(gift, p)[0].Next, "the gift leads past the empty step")
	_, ok := c.ApplyRow(portrait, p, lookSkipIndex, 0)
	assert.False(t, ok, "nothing was offered, so nothing can be skipped")

	_, ok = c.ApplyRow(gift, p, 1, 0)
	require.True(t, ok)
	_, ok = c.ApplyRow(ring, p, lookSkipIndex, 0)
	require.True(t, ok)
	rows := c.PresentRows(summary, p)
	require.Len(t, rows, 3, "gift, ring, Confirm")
	assert.Equal(t, "Ring: none", rows[1].Text)
}

func TestLookStep_RefusesWhatItDidNotOffer(t *testing.T) {
	c, _, gift, portrait, _, _ := lookWalk(t)
	p := newAscensionLearner(30)
	for _, option := range []int{-1, 2, 99, 253, 255} {
		_, ok := c.ApplyRow(portrait, p, option, 0)
		assert.False(t, ok, "option %d", option)
	}
	assert.Nil(t, (&ascensionLooks{}).PresentRows(gift, p), "not a look node")
	assert.Empty(t, p.CeremonyDraft().Picks)
}

// --- the draft and the summary ---------------------------------------------

func TestLookStep_APickOrASkipIsOnlyRemembered(t *testing.T) {
	c, _, _, portrait, ring, _ := lookWalk(t)
	p := newAscensionLearner(30)

	_, ok := c.ApplyRow(portrait, p, 1, 0)
	require.True(t, ok)
	_, ok = c.ApplyRow(ring, p, lookSkipIndex, 0)
	require.True(t, ok)

	assert.Nil(t, p.sc.PendingAscension)
	assert.False(t, p.sc.IsCasting())
	kind := string(mobs.RowSourceAscensionLooks)
	assert.Equal(t, []skills.StepPick{
		{Step: "portrait", Kind: kind, Key: "sage"},
		{Step: "ring", Kind: kind, Key: ""},
	}, p.CeremonyDraft().Picks)
}

func TestLookStep_TheSummaryNamesEveryPickInOrder(t *testing.T) {
	c, looks, gift, portrait, ring, summary := lookWalk(t)
	p := newAscensionLearner(30)
	for _, click := range []struct {
		node   *mobs.InteractionNode
		option int
	}{{gift, 1}, {portrait, 0}, {ring, lookSkipIndex}} {
		_, ok := c.ApplyRow(click.node, p, click.option, 0)
		require.True(t, ok)
	}

	rows := c.PresentRows(summary, p)
	require.Len(t, rows, 4)
	assert.Equal(t, "Gift: Frost Shield", rows[0].Text)
	assert.Equal(t, "Portrait: Elder", rows[1].Text)
	assert.Equal(t, "conversation.ascend.summary.portrait", rows[1].TextKey)
	assert.Equal(t, looks.Flat("elder")+1, rows[1].Appearance)
	assert.Equal(t, "Ring: none", rows[2].Text)
	assert.Equal(t, "conversation.ascend.summary.no-ring", rows[2].TextKey)
	for i, r := range rows[:3] {
		assert.Equal(t, uint8(i), r.OptionIndex)
		assert.True(t, r.Locked, "a summary line is inert")
	}
	_, hasConfirm := confirmRow(rows)
	assert.True(t, hasConfirm)
}

// A shown look step with no pick holds Confirm back, the gift's rule.
func TestLookStep_AnUnansweredStepHoldsConfirm(t *testing.T) {
	c, _, gift, _, ring, summary := lookWalk(t)
	p := newAscensionLearner(30)
	_, ok := c.ApplyRow(gift, p, 1, 0)
	require.True(t, ok)
	_, ok = c.ApplyRow(ring, p, 0, 0)
	require.True(t, ok)

	_, hasConfirm := confirmRow(c.PresentRows(summary, p))
	assert.False(t, hasConfirm, "the portrait step was shown and never answered")
	_, ok = c.ApplyRow(summary, p, summaryConfirmIndex, 0)
	assert.False(t, ok)
}

// --- completion (D9) --------------------------------------------------------

func TestLookStep_CompletionGrantsThePickedLooks(t *testing.T) {
	c, _, gift, portrait, ring, summary := lookWalk(t)
	p := newAscensionLearner(30)
	for _, click := range []struct {
		node   *mobs.InteractionNode
		option int
	}{{gift, 1}, {portrait, 1}, {ring, 0}, {summary, summaryConfirmIndex}} {
		_, ok := c.ApplyRow(click.node, p, click.option, 0)
		require.True(t, ok)
	}
	require.NotNil(t, p.sc.PendingAscension)

	req, ok := c.CompleteAscension(p, p.sc.PendingAscension)
	require.True(t, ok)
	assert.Equal(t, "FrostShield", req.UnlockKey)
	assert.Equal(t, []persist.AppearanceGrant{
		{Item: "sage", Scope: "account"},
		{Item: "ring-heir", Scope: "bloodline"},
	}, req.Appearance)
}

func TestLookStep_ASkipGrantsNothing(t *testing.T) {
	c, _, _, _, _, _ := lookWalk(t)
	req, ok := c.CompleteAscension(newAscensionLearner(30), &skills.AscensionPick{Picks: []skills.StepPick{
		{Step: "ring", Kind: string(mobs.RowSourceAscensionLooks), Key: ""},
	}})
	require.True(t, ok)
	assert.Empty(t, req.Appearance)
}

// ⭐ D9: a look that became owned between pick and completion refuses the
// whole ascension, never a partial grant.
func TestLookStep_ALookOwnedBeforeCompletionRefusesTheAscension(t *testing.T) {
	c, looks, _, _, _, _ := lookWalk(t)
	p := newAscensionLearner(30)
	ownLook(p, looks, "elder")
	_, ok := c.CompleteAscension(p, &skills.AscensionPick{Picks: []skills.StepPick{
		{Step: "catalog", Kind: string(mobs.RowSourceAscensionCatalog), Key: "FrostShield"},
		{Step: "portrait", Kind: string(mobs.RowSourceAscensionLooks), Key: "elder"},
	}})
	assert.False(t, ok)

	for _, key := range []string{"retired-look", "crown", "default"} {
		_, ok := c.CompleteAscension(p, &skills.AscensionPick{Picks: []skills.StepPick{
			{Step: "portrait", Kind: string(mobs.RowSourceAscensionLooks), Key: key},
		}})
		assert.False(t, ok, "%q is no stone gift", key)
	}
}
