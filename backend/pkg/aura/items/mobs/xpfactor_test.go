package mobs

// Loader + catalog coverage for the kill-XP formula's one surviving authored
// input (docs/plan-xp-formula.md C1, landmines L1 + L2).

import (
	"testing"
	"testing/fstest"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/curve"
)

func loadOne(t *testing.T, name, body string) (*MobDefinition, error) {
	t.Helper()
	r, err := RegistryFromFS(testSkillRegistry(t), nil, testCurve(), fstest.MapFS{
		name: {Data: []byte(body)},
	})
	if err != nil {
		return nil, err
	}
	defs := r.Mobs()
	require.Len(t, defs, 1)
	return defs[0], nil
}

// L2, the silent-wiring class in its fourth appearance: a renamed JSON key
// means every old def parses cleanly with the zero value — every mob in the
// game pays nothing and the suite stays green. DisallowUnknownFields alone
// does NOT catch it: `"experience": 0` is what 29 of the 65 defs authored, and
// against a non-pointer field it parses perfectly and means something else now.
func TestXPFactor_LegacyExperienceKeyHardFails(t *testing.T) {
	for _, authored := range []string{`"experience": 0`, `"experience": 40`} {
		_, err := loadOne(t, "wolf.json", `{
		  "id": 12, "name": "Wolf", "type": "MOB",
		  "factors": {"baseMaxHealth": 20, `+authored+`},
		  "body": {"radius": 0.3, "aggroRadius": 3}
		}`)
		require.Error(t, err, "authored %s", authored)
		assert.Contains(t, err.Error(), "factors.xpFactor",
			"the refusal must name the replacement, like the maxHealth precedent")
	}
}

// Absent means "an ordinary mob", and only an EXPLICIT 0 pays nothing. The two
// must not collapse into one — which is why the JSON field is a pointer.
func TestXPFactor_AbsentDefaultsToOneAndZeroIsAuthorable(t *testing.T) {
	def, err := loadOne(t, "wolf.json", `{
	  "id": 12, "name": "Wolf", "type": "MOB",
	  "factors": {"baseMaxHealth": 20},
	  "body": {"radius": 0.3, "aggroRadius": 3}
	}`)
	require.NoError(t, err)
	assert.EqualValues(t, 1, def.Factors.XPFactor, "absent → a full at-level kill")

	def, err = loadOne(t, "campfire.json", `{
	  "id": 13, "name": "Campfire", "type": "MOB",
	  "factors": {"baseMaxHealth": 20, "xpFactor": 0, "speed": 0},
	  "body": {"radius": 0.3, "aggroRadius": 0.1}
	}`)
	require.NoError(t, err)
	assert.Zero(t, def.Factors.XPFactor, "an authored 0 survives as 0")

	def, err = loadOne(t, "turnip.json", `{
	  "id": 14, "name": "Turnip", "type": "MOB",
	  "factors": {"baseMaxHealth": 20, "xpFactor": 0.05, "speed": 0},
	  "body": {"radius": 0.3, "aggroRadius": 0.1}
	}`)
	require.NoError(t, err)
	assert.InDelta(t, 0.05, def.Factors.XPFactor, 1e-6, "the harvest weight (§3.4)")
}

func TestXPFactor_NegativeIsRefused(t *testing.T) {
	_, err := loadOne(t, "wolf.json", `{
	  "id": 12, "name": "Wolf", "type": "MOB",
	  "factors": {"baseMaxHealth": 20, "xpFactor": -1},
	  "body": {"radius": 0.3, "aggroRadius": 3}
	}`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "xpFactor")
}

// L1: CombatTarget silently derived from `Experience > 0` — the nameplate
// path. Deleting the field without re-deriving un-nameplates every combat mob
// in the game and no other test screams.
func TestXPFactor_CombatTargetFollowsXPFactor(t *testing.T) {
	r, err := RegistryFromFS(testSkillRegistry(t), nil, testCurve(), fstest.MapFS{
		"wolf.json": {Data: []byte(`{
		  "id": 12, "name": "Wolf", "type": "MOB",
		  "factors": {"baseMaxHealth": 20},
		  "body": {"radius": 0.3, "aggroRadius": 3}
		}`)},
		"turnip.json": {Data: []byte(`{
		  "id": 14, "name": "Turnip", "type": "MOB",
		  "factors": {"baseMaxHealth": 20, "xpFactor": 0.05, "speed": 0},
		  "body": {"radius": 0.3, "aggroRadius": 0.1}
		}`)},
		"campfire.json": {Data: []byte(`{
		  "id": 13, "name": "Campfire", "type": "MOB",
		  "factors": {"baseMaxHealth": 20, "xpFactor": 0, "speed": 0},
		  "body": {"radius": 0.3, "aggroRadius": 0.1}
		}`)},
	})
	require.NoError(t, err)

	byName := map[string]*MobDefinition{}
	for _, d := range r.Mobs() {
		byName[d.Name] = d
	}
	assert.True(t, byName["Wolf"].Factors.XPFactor > 0)
	assert.True(t, byName["Turnip"].Factors.XPFactor > 0,
		"a fractional weight is still prey — the nameplate is not an XP amount")
	assert.Zero(t, byName["Campfire"].Factors.XPFactor)

	entries := map[string]bool{}
	for _, d := range r.Mobs() {
		entries[d.Name] = d.Factors.XPFactor > 0 && !d.FriendlyToPlayers
	}
	assert.Equal(t, map[string]bool{"Wolf": true, "Turnip": true, "Campfire": false}, entries)
}

// Content census: the 29 defs that authored `experience: 0` are exactly the
// ones that must still pay nothing after the migration — every NPC, structure,
// totem, summon and sign. A new combat mob accidentally authoring xpFactor 0
// would be invisible otherwise (no nameplate, no XP, no error).
func TestContent_XPFactorZeroSpeciesAreNotPrey(t *testing.T) {
	var free []string
	for _, def := range contentRegistry(t).Mobs() {
		if def.Factors.XPFactor == 0 {
			free = append(free, def.Name)
		}
	}
	assert.Len(t, free, 29, "every xpFactor-0 species: %v", free)

	// ⚑ Exactly ONE structure pays anything, and it is the harvest chore's
	// target: the Turnip at 0.05 (PO 2026-08-05, the one §3.4 curation pulled
	// into C1 — under the bare migration rule a vegetable would have paid a
	// full at-level kill). Braziers, totems, camps and barricades pay nothing,
	// and a new one that accidentally omits xpFactor lands here.
	var payingStructures []string
	for _, def := range contentRegistry(t).Mobs() {
		if def.Role == RoleStructure && def.Factors.XPFactor > 0 {
			payingStructures = append(payingStructures, def.Name)
		}
	}
	assert.Equal(t, []string{"Turnip"}, payingStructures)
}

// A new tier added without a kill-XP weight would silently pay like a normal.
// The expectation table is exhaustive over tierRanks BY CONSTRUCTION: a fourth
// tier constant fails here until someone decides what it is worth.
func TestKillXPTierMultiplier_CoversEveryTier(t *testing.T) {
	k := curve.DefaultKillXP()
	want := map[string]float64{
		TierNormal: 1, // by definition: base(P) IS the at-level normal kill
		TierElite:  k.TierElite,
		TierBoss:   k.TierBoss,
	}
	require.Len(t, want, len(tierRanks), "a tier was added without a kill-XP weight")

	for tier := range tierRanks {
		got := (&MobDefinition{Tier: tier}).KillXPTierMultiplier(k)
		assert.Equal(t, want[tier], got, "tier %q", tier)
		assert.Greater(t, got, 0.0, "tier %q must pay something", tier)
	}

	// An absent tier label is a normal, matching Rank()'s own default.
	assert.EqualValues(t, 1, (&MobDefinition{}).KillXPTierMultiplier(k))
}
