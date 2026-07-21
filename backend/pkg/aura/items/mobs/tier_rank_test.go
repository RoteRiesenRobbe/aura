package mobs

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestRank_EncodesAuthoredTier(t *testing.T) {
	assert.Equal(t, TierRankNormal, (&MobDefinition{Tier: TierNormal}).Rank())
	assert.Equal(t, TierRankElite, (&MobDefinition{Tier: TierElite}).Rank())
	assert.Equal(t, TierRankBoss, (&MobDefinition{Tier: TierBoss}).Rank())
}

// The loader defaults an absent tier to normal; a definition that never went
// through the loader (synthetic/test defs) must encode the same way rather than
// producing a stray rank.
func TestRank_AbsentTierIsNormal(t *testing.T) {
	assert.Equal(t, TierRankNormal, (&MobDefinition{}).Rank())
}

// Ordering is part of the contract — the client reads the byte as a severity.
func TestTierRank_IsOrdered(t *testing.T) {
	assert.Less(t, TierRankNormal, TierRankElite)
	assert.Less(t, TierRankElite, TierRankBoss)
}

// tierRanks is both the loader's validity check and the wire encoding, so every
// authorable tier necessarily has a rank. This pins the three that exist today
// against one being dropped from the map — which would silently make previously
// valid content fail to load.
func TestTierRank_CoversEveryTier(t *testing.T) {
	for _, tier := range []string{TierNormal, TierElite, TierBoss} {
		_, ok := tierRanks[tier]
		assert.True(t, ok, "tier %q has no wire encoding", tier)
	}
	assert.Len(t, tierRanks, 3, "a new tier needs a client frame colour too — see triage item 15")
}
