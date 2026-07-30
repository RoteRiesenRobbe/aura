package main

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/constant"
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
	TicksPerSecond int `json:"ticksPerSecond"`
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
