package mobs

// Loader coverage for the CC-immunity flag (docs/archive/plan-cc-and-retaliation.md
// C1, D1 + A1/A2).
//
// D1 ruled immunity is AUTHORED per mob, with no tier default — `tier` stays
// the cosmetic label definitions.go:13-15 promises. The recorded cost of that
// ruling is that a future elite could silently ship CC-able; A1 converts it
// into a boot error instead of a code default, and the check has to live here
// because this is the only layer where the raw pointer still distinguishes
// "absent" from "authored false". Downstream, Factors.CCImmune is a plain bool
// and the distinction is gone for good.

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// A1: a definition at tier ≥ elite that says nothing about CC does not boot.
// Both tiers, because the rule is "elite and above", not "elite".
func TestCCImmune_EliteAndBossMustAuthorTheKey(t *testing.T) {
	for _, tier := range []string{TierElite, TierBoss} {
		_, err := loadOne(t, "troll.json", `{
		  "id": 40, "name": "Troll", "type": "MOB", "tier": "`+tier+`",
		  "factors": {"baseMaxHealth": 200},
		  "body": {"radius": 0.5, "aggroRadius": 4}
		}`)
		require.Error(t, err, "tier %q", tier)
		assert.Contains(t, err.Error(), "factors.ccImmune",
			"the refusal must name the missing key, like the maxHealth precedent")
	}
}

// The escape hatch D1 bought over the pure tier rule: a deliberately CC-able
// elite is authorable, and it is NOT the same thing as an elite nobody thought
// about. This pin is what makes A2's pointer load-bearing — against a plain
// bool the two cases are one.
func TestCCImmune_EliteMayAuthorFalse(t *testing.T) {
	def, err := loadOne(t, "elite-wolf.json", `{
	  "id": 41, "name": "EliteWolf", "type": "MOB", "tier": "elite",
	  "factors": {"baseMaxHealth": 200, "ccImmune": false},
	  "body": {"radius": 0.5, "aggroRadius": 4}
	}`)
	require.NoError(t, err, "authoring false is a decision, not an omission")
	assert.False(t, def.Factors.CCImmune)
}

func TestCCImmune_EliteAuthoringTrueResolves(t *testing.T) {
	def, err := loadOne(t, "orc.json", `{
	  "id": 42, "name": "Orc", "type": "MOB", "tier": "elite",
	  "factors": {"baseMaxHealth": 200, "ccImmune": true},
	  "body": {"radius": 0.5, "aggroRadius": 4}
	}`)
	require.NoError(t, err)
	assert.True(t, def.Factors.CCImmune)
}

// A normal-tier mob is never required to say anything — absent means CC-able,
// which is what every mob in the game is today — but it may opt in.
func TestCCImmune_NormalTierIsOptionalBothWays(t *testing.T) {
	def, err := loadOne(t, "wolf.json", `{
	  "id": 43, "name": "Wolf", "type": "MOB",
	  "factors": {"baseMaxHealth": 20},
	  "body": {"radius": 0.3, "aggroRadius": 3}
	}`)
	require.NoError(t, err, "the requirement is tier-scoped, not global")
	assert.False(t, def.Factors.CCImmune, "absent → CC-able, the status quo for all 56 normals")

	immune, err := loadOne(t, "wolf.json", `{
	  "id": 43, "name": "Wolf", "type": "MOB",
	  "factors": {"baseMaxHealth": 20, "ccImmune": true},
	  "body": {"radius": 0.3, "aggroRadius": 3}
	}`)
	require.NoError(t, err, "a normal-tier mob may be immune — the flag is per-mob, not per-tier")
	assert.True(t, immune.Factors.CCImmune)
}

// The census, in the role_content_test.go idiom: a PIN, not a rule. D1 makes
// `false` a legal thing to author at any tier, so the loader cannot demand
// `true` — this is where a flip gets noticed instead. A7 authored all nine as
// true; `orc` is the one to look at twice, since it is the thin-the-orc-line
// quest target and therefore the first place a player meets the rule (L5).
func TestCCImmune_ContentCensus(t *testing.T) {
	r := contentRegistry(t)

	immune := map[string]bool{}
	for _, def := range r.Mobs() {
		if def.Rank() >= TierRankElite {
			immune[def.Name] = def.Factors.CCImmune
		}
	}

	assert.Equal(t, map[string]bool{
		"EliteWolf":            true,
		"EliteBandit":          true,
		"Troll":                true,
		"Orc":                  true,
		"GreaterFireElemental": true,
		"OrcWarlord":           true,
		// legacy: true — proving-grounds content, not the live world. They
		// carry the key because the loader validates by tier; nothing a player
		// meets depends on their value.
		"Mammoth":      true,
		"AngryMammoth": true,
		"ProvingBoss":  true,
	}, immune, "every elite/boss names its CC stance; adding one is fine, adding it AND this line is the ceremony")
}
