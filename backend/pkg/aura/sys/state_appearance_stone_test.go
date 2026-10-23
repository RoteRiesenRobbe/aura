package sys

import (
	"testing"
	"testing/fstest"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/appearance"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/persist"
)

// plan-appearance.md C5b: a stone's bonus looks (D21c), granted on top of
// whatever was picked.

// stoneLooks is gatedLooks plus one look only a stone gives. Flat order:
// portraits crown 0, default 1, elder 2, green-hood 3; rings ring-claws 4,
// ring-forest 5, ring-leather 6, ring-plain 7.
func stoneLooks(t *testing.T) appearance.Catalog {
	t.Helper()
	files := gatedLookFiles()
	files["elder.json"] = &fstest.MapFile{Data: []byte(
		`{"id": "elder", "slot": "portrait", "scope": "bloodline", "grantedBy": "stone", "name": "x"}`)}
	c, err := appearance.Load(files, lookWorld{})
	require.NoError(t, err)
	require.Equal(t, flatElder, c.Flat("elder"))
	return c
}

const flatElder = uint16(2)

// ⭐ A stone gift's gate is empty, and an empty gate passes: the evaluator
// would hand it to everyone on the join tick. It stays locked, worded as the
// stone's gift, until a stone grants it.
func TestGrant_NeverGrantsAStoneGift(t *testing.T) {
	s, g := newStateFixture(t)
	s.SetAppearance(stoneLooks(t))
	c := newFakeClient()

	p := joinWithBloodlineCount(t, s, g, c, "Heir", persist.CharacterState{}, nil, 1)

	assert.NotContains(t, p.AppearanceOwned(), flatElder)
	assert.NotContains(t, appearanceUnlocks(c), uint64(flatElder))
	var elder *model.AppearanceLock
	for i, l := range p.AppearanceLocks() {
		if l.Item == flatElder {
			elder = &p.AppearanceLocks()[i]
		}
	}
	require.NotNil(t, elder, "listed as locked")
	assert.Equal(t, []model.LockReason{{Kind: mobs.LockStoneGift}}, elder.Reasons)
}

// The count path (D21a) has the same empty-gate trap: an ascension without
// this stone's bonus grants no stone gift.
func TestRequestAscension_GrantsNoStoneGiftByCount(t *testing.T) {
	s, _, _, p, ascensions, _ := ascendingFixture(t)
	s.SetAppearance(stoneLooks(t))

	require.True(t, s.RequestAscension(p, "", nil))
	assert.Equal(t, []persist.AppearanceGrant{{Item: "ring-claws", Scope: "bloodline"}},
		ascensions.requested[0].Appearance)
}

// The stone's bonus rides the same transaction as the count grants.
func TestRequestAscension_GrantsTheStonesBonus(t *testing.T) {
	s, _, _, p, ascensions, _ := ascendingFixture(t)
	s.SetAppearance(stoneLooks(t))

	require.True(t, s.RequestAscension(p, "", []string{"elder"}))
	assert.Equal(t, []persist.AppearanceGrant{
		{Item: "ring-claws", Scope: "bloodline"},
		{Item: "elder", Scope: "bloodline"},
	}, ascensions.requested[0].Appearance)
}

// An owned bonus is not granted twice, and an id the catalog lacks (content
// changed under a running channel) is dropped rather than written.
func TestRequestAscension_SkipsAnOwnedOrUnknownBonus(t *testing.T) {
	s, _, _, p, ascensions, _ := ascendingFixture(t)
	s.SetAppearance(stoneLooks(t))
	p.SetAppearanceOwned([]uint16{flatElder})

	require.True(t, s.RequestAscension(p, "", []string{"elder", "retired-look"}))
	assert.Equal(t, []persist.AppearanceGrant{{Item: "ring-claws", Scope: "bloodline"}},
		ascensions.requested[0].Appearance)
}
