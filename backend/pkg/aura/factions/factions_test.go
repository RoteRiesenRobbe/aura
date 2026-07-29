package factions

import (
	"fmt"
	"testing"
	"testing/fstest"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func factionFS(files map[string]string) fstest.MapFS {
	fsys := fstest.MapFS{}
	for name, content := range files {
		fsys[name] = &fstest.MapFile{Data: []byte(content)}
	}
	return fsys
}

func TestRegistryFromFS_ValidLoad(t *testing.T) {
	r, err := RegistryFromFS(factionFS(map[string]string{
		"predator.json": `{"_comment": "authoring note", "name": "predator", "hostileTo": ["aligned", "prey"]}`,
		"prey.json":     `{"name": "prey", "hostileTo": []}`,
	}))
	require.NoError(t, err)

	// IDs are assigned in sorted-name order after the reserved built-ins.
	predator, err := r.GetByName("predator")
	require.NoError(t, err)
	prey, err := r.GetByName("prey")
	require.NoError(t, err)
	assert.Equal(t, firstContentID, predator.ID)
	assert.Equal(t, firstContentID+1, prey.ID)

	assert.Equal(t, Bit(Aligned)|Bit(prey.ID), predator.AggroMask,
		"hostileTo resolves to the referenced factions' bits")
	assert.Zero(t, prey.AggroMask, "explicit [] = passive, retaliation-only")
}

func TestRegistryFromFS_ReservedBuiltinsAlwaysPresent(t *testing.T) {
	r, err := RegistryFromFS(factionFS(nil))
	require.NoError(t, err)

	aligned, err := r.GetByName("aligned")
	require.NoError(t, err)
	assert.Equal(t, Aligned, aligned.ID)

	hostile, err := r.GetByName("hostile")
	require.NoError(t, err)
	assert.Equal(t, Hostile, hostile.ID)
	assert.Equal(t, Bit(Aligned), hostile.AggroMask,
		"the default faction aggros exactly the aligned faction — the pre-factions behavior")
}

func TestRegistryFromFS_HostileToMayReferenceBuiltins(t *testing.T) {
	r, err := RegistryFromFS(factionFS(map[string]string{
		"raider.json": `{"name": "raider", "hostileTo": ["aligned", "hostile"]}`,
	}))
	require.NoError(t, err)

	raider, err := r.GetByName("raider")
	require.NoError(t, err)
	assert.Equal(t, Bit(Aligned)|Bit(Hostile), raider.AggroMask)
}

// --- friendlyToPlayers (§9 lift 6, content pass C5) ---

func TestRegistryFromFS_FriendlyToPlayersParsed(t *testing.T) {
	r, err := RegistryFromFS(factionFS(map[string]string{
		"human_army.json": `{"name": "human_army", "hostileTo": ["orc"], "friendlyToPlayers": true}`,
		"orc.json":        `{"name": "orc", "hostileTo": ["aligned", "human_army"]}`,
	}))
	require.NoError(t, err)

	army, err := r.GetByName("human_army")
	require.NoError(t, err)
	assert.True(t, army.FriendlyToPlayers)

	orc, err := r.GetByName("orc")
	require.NoError(t, err)
	assert.False(t, orc.FriendlyToPlayers, "absent = false, the normal case")
}

func TestRegistryFromFS_FriendlyToPlayersHostileToAlignedFails(t *testing.T) {
	// A faction cannot be harm-proof to players AND proactively hunt them —
	// contradictory curated content aborts at boot like every other anomaly.
	_, err := RegistryFromFS(factionFS(map[string]string{
		"confused.json": `{"name": "confused", "hostileTo": ["aligned"], "friendlyToPlayers": true}`,
	}))
	require.ErrorContains(t, err, "friendlyToPlayers")
}

// --- legacy tag (step-7 A.5) ---

func TestRegistryFromFS_LegacyTagParsed(t *testing.T) {
	r, err := RegistryFromFS(factionFS(map[string]string{
		"tusker.json": `{"name": "tusker", "hostileTo": [], "legacy": true}`,
		"kobold.json": `{"name": "kobold", "hostileTo": []}`,
	}))
	require.NoError(t, err)

	tusker, err := r.GetByName("tusker")
	require.NoError(t, err)
	assert.True(t, tusker.Legacy)

	kobold, err := r.GetByName("kobold")
	require.NoError(t, err)
	assert.False(t, kobold.Legacy, "absent = live content, the normal case")
}

func TestRegistryFromFS_MissingHostileToFails(t *testing.T) {
	_, err := RegistryFromFS(factionFS(map[string]string{
		"vague.json": `{"name": "vague"}`,
	}))
	require.ErrorContains(t, err, "hostileTo is required")
}

func TestRegistryFromFS_ReservedNameFails(t *testing.T) {
	for _, name := range []string{"aligned", "hostile"} {
		_, err := RegistryFromFS(factionFS(map[string]string{
			"x.json": fmt.Sprintf(`{"name": %q, "hostileTo": []}`, name),
		}))
		require.ErrorContains(t, err, "reserved or already declared", "declaring %q must fail", name)
	}
}

func TestRegistryFromFS_DuplicateNameFails(t *testing.T) {
	_, err := RegistryFromFS(factionFS(map[string]string{
		"a.json": `{"name": "twin", "hostileTo": []}`,
		"b.json": `{"name": "twin", "hostileTo": []}`,
	}))
	require.ErrorContains(t, err, "reserved or already declared")
}

func TestRegistryFromFS_UnknownHostileToFails(t *testing.T) {
	_, err := RegistryFromFS(factionFS(map[string]string{
		"typo.json": `{"name": "typo", "hostileTo": ["pray"]}`,
	}))
	require.ErrorContains(t, err, `unknown faction "pray"`)
}

func TestRegistryFromFS_SelfReferenceFails(t *testing.T) {
	_, err := RegistryFromFS(factionFS(map[string]string{
		"narcissist.json": `{"name": "narcissist", "hostileTo": ["narcissist"]}`,
	}))
	require.ErrorContains(t, err, "must not reference itself")
}

func TestRegistryFromFS_UnknownKeyFails(t *testing.T) {
	_, err := RegistryFromFS(factionFS(map[string]string{
		"stale.json": `{"name": "stale", "hostileTo": [], "hostiles": []}`,
	}))
	require.ErrorContains(t, err, "hostiles")
}

func TestRegistryFromFS_EmptyNameFails(t *testing.T) {
	_, err := RegistryFromFS(factionFS(map[string]string{
		"anon.json": `{"name": "  ", "hostileTo": []}`,
	}))
	require.ErrorContains(t, err, "name must not be empty")
}

func TestRegistryFromFS_TooManyFactionsFails(t *testing.T) {
	files := map[string]string{}
	for i := 0; i < MaxFactions-int(firstContentID)+1; i++ {
		files[fmt.Sprintf("f%02d.json", i)] = fmt.Sprintf(`{"name": "f%02d", "hostileTo": []}`, i)
	}
	_, err := RegistryFromFS(factionFS(files))
	require.ErrorContains(t, err, "at most")
}

func TestRegistryFromFS_AllIsSortedByID(t *testing.T) {
	r, err := RegistryFromFS(factionFS(map[string]string{
		"b.json": `{"name": "beta", "hostileTo": []}`,
		"a.json": `{"name": "alpha", "hostileTo": []}`,
	}))
	require.NoError(t, err)

	all := r.All()
	require.Len(t, all, 4) // 2 built-ins + 2 declared
	for i := 1; i < len(all); i++ {
		assert.Less(t, all[i-1].ID, all[i].ID)
	}
}

// --- displayName: the player-facing wording (tooltip faction scope) ---

func TestRegistryFromFS_DisplayNameIsAuthored(t *testing.T) {
	// The faction NAME is an internal identifier (`wildlife_prey`); the display
	// name is what a player reads in a tooltip. It is authored here rather than
	// derived because deriving it would be a second naming convention beside
	// skills.DeriveDisplayName's CamelCase rule — and no rule turns
	// `wildlife_prey` into "Prey".
	r, err := RegistryFromFS(factionFS(map[string]string{
		"wildlife_prey.json": `{"name": "wildlife_prey", "displayName": "Prey", "hostileTo": []}`,
	}))
	require.NoError(t, err)

	prey, err := r.GetByName("wildlife_prey")
	require.NoError(t, err)
	assert.Equal(t, "Prey", prey.DisplayName)
}

func TestRegistryFromFS_DisplayNameFallsBackToTheName(t *testing.T) {
	// An unauthored display name degrades to the identifier rather than to
	// nothing: a tooltip reading "Affects: kobold" is poor, one reading
	// "Affects: " is broken. Also what the code-declared built-ins get.
	r, err := RegistryFromFS(factionFS(map[string]string{
		"kobold.json": `{"name": "kobold", "hostileTo": []}`,
	}))
	require.NoError(t, err)

	kobold, err := r.GetByName("kobold")
	require.NoError(t, err)
	assert.Equal(t, "kobold", kobold.DisplayName)

	aligned, err := r.GetByName("aligned")
	require.NoError(t, err)
	assert.Equal(t, "aligned", aligned.DisplayName)
}
