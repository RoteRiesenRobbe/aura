package main

import (
	"encoding/json"
	"math"
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/constant"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/vitals"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

// §35 C4c (plan-conf-duplication.md D3): the Go half of the shared-constants
// contract. api/shared-constants.json is the one authored home for the values
// the client restates by hand — the pip/ring bit tables, tier ranks, viewport
// and tickrate — and frontend/src/client-data/SharedConstants.test.ts asserts
// the client tables against the same file, so a renumber goes red on
// whichever side moved instead of silently mis-coloring pips or frames.
//
// Go constants cannot be enumerated by reflection, so the maps below are
// spelled out — a NEW bit therefore needs a fixture entry, this map, and the
// client table (whose test IS exhaustive over its enum) touched together.
type sharedConstants struct {
	AppliedEffectBits map[string]uint8 `json:"appliedEffectBits"`
	AuraCategoryBits  map[string]uint8 `json:"auraCategoryBits"`
	TierRanks         map[string]uint8 `json:"tierRanks"`
	ViewportMeters    struct {
		Width  float64 `json:"width"`
		Height float64 `json:"height"`
	} `json:"viewportMeters"`
	TicksPerSecond int          `json:"ticksPerSecond"`
	HPRounding     [][2]float64 `json:"hpRounding"`
	SkillPointCost struct {
		Tier1Points        int     `json:"tier1Points"`
		Tier2Points        int     `json:"tier2Points"`
		Tier3Points        int     `json:"tier3Points"`
		Tier2AboveFraction float64 `json:"tier2AboveFraction"`
		Tier3AboveFraction float64 `json:"tier3AboveFraction"`
	} `json:"skillPointCost"`
	CampChargeCap struct {
		Base      int `json:"base"`
		PerLevels int `json:"perLevels"`
	} `json:"campChargeCap"`
}

// TestSharedConstants_CampChargeCap pins skills.CampChargeCap against the
// fixture (plan-downtime.md C2/D9). The cap is a cross-language mirror for a
// deliberate reason: it is NOT on the wire — the server sends the live charge
// count and the client derives the cap from the level it already has, so both
// sides own the curve and either can drift alone.
func TestSharedConstants_CampChargeCap(t *testing.T) {
	raw, err := os.ReadFile("../../../api/shared-constants.json")
	require.NoError(t, err)
	var fixture sharedConstants
	require.NoError(t, json.Unmarshal(raw, &fixture))
	c := fixture.CampChargeCap
	require.NotZero(t, c.Base, "the fixture must carry a campChargeCap block")
	require.NotZero(t, c.PerLevels)

	// Level 0 is not a real character level; it is included so a cap curve that
	// went negative or divided by something odd cannot pass quietly.
	for _, level := range []int{0, 1, 2, 9, 10, 11, 20, 29, 30, 31} {
		assert.Equal(t, c.Base+level/c.PerLevels, skills.CampChargeCap(level),
			"skills.CampChargeCap has drifted from api/shared-constants.json (level %d)", level)
	}
}

// TestSharedConstants_SkillPointCurve pins skills.PointCost against the
// fixture — L2 (plan-numbers-rewrite): the moment the client shows what a
// level costs, the curve is a cross-language mirror, and §35 just closed
// exactly this class of duplication. Rather than restating the five numbers in
// Go (which would drift in lockstep with nothing failing), this reconstructs
// the curve FROM the fixture and asserts the shipped implementation agrees.
func TestSharedConstants_SkillPointCurve(t *testing.T) {
	raw, err := os.ReadFile("../../../api/shared-constants.json")
	require.NoError(t, err)
	var fixture sharedConstants
	require.NoError(t, json.Unmarshal(raw, &fixture))
	c := fixture.SkillPointCost
	require.NotZero(t, c.Tier1Points, "the fixture must carry a skillPointCost block")

	// The three caps the {1, 5, 10} authoring vocabulary allows (D2), plus a
	// couple of odd ones so the rounding rule is exercised rather than assumed.
	for _, maxLevel := range []int{1, 3, 5, 7, 10} {
		for level := 0; level <= maxLevel+1; level++ {
			want := 0
			switch {
			case level <= 1 || level > maxLevel:
				want = 0 // free on unlock; nothing to buy past the cap
			case float64(level) <= math.Ceil(c.Tier2AboveFraction*float64(maxLevel)):
				want = c.Tier1Points
			case float64(level) <= math.Ceil(c.Tier3AboveFraction*float64(maxLevel)):
				want = c.Tier2Points
			default:
				want = c.Tier3Points
			}
			assert.Equal(t, want, skills.PointCost(maxLevel, level),
				"skills.PointCost has drifted from api/shared-constants.json (cap %d, level %d)", maxLevel, level)
		}
	}
}

// TestSharedConstants_HPRounding pins vitals.HP against the fixture — §3.11
// (plan-resource-costs-feedback): R1's absolute-HP cost line makes this
// rounding rule live arithmetic in TWO languages, so the tooltip and the health
// bar can now disagree by a point. The client half asserts the same pairs
// against its own roundHP.
func TestSharedConstants_HPRounding(t *testing.T) {
	raw, err := os.ReadFile("../../../api/shared-constants.json")
	require.NoError(t, err)
	var fixture sharedConstants
	require.NoError(t, json.Unmarshal(raw, &fixture))
	require.NotEmpty(t, fixture.HPRounding, "the fixture must carry an hpRounding table")

	for _, pair := range fixture.HPRounding {
		amount, want := pair[0], pair[1]
		assert.Equal(t, uint32(want), vitals.HP(float32(amount)),
			"vitals.HP has drifted from api/shared-constants.json at %v — the tooltip shows what this returns", amount)
	}
}

func TestSharedConstants_MatchGoTables(t *testing.T) {
	raw, err := os.ReadFile("../../../api/shared-constants.json")
	require.NoError(t, err)
	var fixture sharedConstants
	require.NoError(t, json.Unmarshal(raw, &fixture))

	assert.Equal(t, map[string]uint8{
		"dot":      uint8(skills.AppliedEffectDot),
		"slow":     uint8(skills.AppliedEffectSlow),
		"hot":      uint8(skills.AppliedEffectHot),
		"resist":   uint8(skills.AppliedEffectResist),
		"tickRate": uint8(skills.AppliedEffectTickRate),
		"calm":     uint8(skills.AppliedEffectCalm),
		"charm":    uint8(skills.AppliedEffectCharm),
		"speed":    uint8(skills.AppliedEffectSpeed),
	}, fixture.AppliedEffectBits,
		"skills.AppliedEffect has drifted from api/shared-constants.json — the client colors pips off these bits")

	assert.Equal(t, map[string]uint8{
		"damage": uint8(skills.AuraCategoryDamage),
		"heal":   uint8(skills.AuraCategoryHeal),
		"shield": uint8(skills.AuraCategoryShield),
		"dot":    uint8(skills.AuraCategoryDot),
		"slow":   uint8(skills.AuraCategorySlow),
		"light":  uint8(skills.AuraCategoryLight),
		"resist": uint8(skills.AuraCategoryResist),
	}, fixture.AuraCategoryBits,
		"skills.AuraCategory has drifted from api/shared-constants.json — the client colors aura rings off these bits")

	assert.Equal(t, map[string]uint8{
		"normal": uint8(mobs.TierRankNormal),
		"elite":  uint8(mobs.TierRankElite),
		"boss":   uint8(mobs.TierRankBoss),
	}, fixture.TierRanks,
		"mobs.TierRank has drifted from api/shared-constants.json — the client draws tier frames off these ranks")

	assert.Equal(t, float64(constant.ViewPortWidth), fixture.ViewportMeters.Width,
		"constant.ViewPortWidth has drifted from api/shared-constants.json")
	assert.Equal(t, float64(constant.ViewPortHeight), fixture.ViewportMeters.Height,
		"constant.ViewPortHeight has drifted from api/shared-constants.json")
	assert.Equal(t, constant.TicksPerSecond, fixture.TicksPerSecond,
		"constant.TicksPerSecond has drifted from api/shared-constants.json")
}
