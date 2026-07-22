package mobs

import (
	"encoding/json"
	"net/http/httptest"
	"testing"
	"testing/fstest"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// catalogTestRegistry: a normal cL2 species, an elite cL10 whose CamelCase
// name exercises the display-name split, and a boss. IDs are deliberately out
// of file order so the sort is pinned rather than accidental.
func catalogTestRegistry(t *testing.T) Registry {
	t.Helper()
	r, err := RegistryFromFS(testSkillRegistry(t), nil, testCurve(), fstest.MapFS{
		"alpha-wolf.json": {Data: []byte(`{
		  "id": 47,
		  "name": "AlphaWolf",
		  "type": "MOB",
		  "tier": "elite",
		  "curveLevel": 10,
		  "baseMaxHealth": 80,
		  "body": {"radius": 0.35, "aggroRadius": 4}
		}`)},
		"wolf.json": {Data: []byte(`{
		  "id": 12,
		  "name": "Wolf",
		  "type": "MOB",
		  "curveLevel": 2,
		  "baseMaxHealth": 20,
		  "body": {"radius": 0.3, "aggroRadius": 3}
		}`)},
		"orc-warlord.json": {Data: []byte(`{
		  "id": 38,
		  "name": "OrcWarlord",
		  "type": "MOB",
		  "tier": "boss",
		  "curveLevel": 20,
		  "baseMaxHealth": 400,
		  "body": {"radius": 1.2, "aggroRadius": 8}
		}`)},
	})
	require.NoError(t, err)
	return r
}

type catalogEntry map[string]any

func decodeMobCatalog(t *testing.T, data []byte) []catalogEntry {
	t.Helper()
	var entries []catalogEntry
	require.NoError(t, json.Unmarshal(data, &entries), "catalog JSON must decode")
	return entries
}

func TestMobCatalogJSON_SortedByID(t *testing.T) {
	data, err := CatalogJSON(catalogTestRegistry(t))
	require.NoError(t, err)
	entries := decodeMobCatalog(t, data)

	require.Len(t, entries, 3)
	// Sorted by ID regardless of the walk order.
	assert.Equal(t, []any{float64(12), float64(38), float64(47)},
		[]any{entries[0]["id"], entries[1]["id"], entries[2]["id"]})
}

func TestMobCatalogJSON_NameplateFields(t *testing.T) {
	data, err := CatalogJSON(catalogTestRegistry(t))
	require.NoError(t, err)
	entries := decodeMobCatalog(t, data)

	wolf, warlord, alpha := entries[0], entries[1], entries[2]

	// Display name: CamelCase splits, single words stay put — the same rule
	// the skill catalog uses (skills.DeriveDisplayName).
	assert.Equal(t, "Wolf", wolf["displayName"])
	assert.Equal(t, "Alpha Wolf", alpha["displayName"])
	assert.Equal(t, "Orc Warlord", warlord["displayName"])

	// The authored combat level drives the nameplate tint; it must survive as
	// the authored number, NOT the derived power scale.
	assert.Equal(t, float64(2), wolf["curveLevel"])
	assert.Equal(t, float64(10), alpha["curveLevel"])

	// Tier travels as the same rank the wire Mob.tier carries.
	assert.Equal(t, float64(TierRankNormal), wolf["tier"])
	assert.Equal(t, float64(TierRankElite), alpha["tier"])
	assert.Equal(t, float64(TierRankBoss), warlord["tier"])
}

// Nameplates are for things you fight. Fixtures (campfires, braziers),
// summons (companions, totems) and obstacles (brambles, rockfalls) are all
// MobDefinitions too, and labelling them would put "Campfire 1" on screen.
func TestMobCatalogJSON_CombatTargetExcludesPropsAndAllies(t *testing.T) {
	r, err := RegistryFromFS(testSkillRegistry(t), nil, testCurve(), fstest.MapFS{
		"wolf.json": {Data: []byte(`{
		  "id": 12, "name": "Wolf", "type": "MOB", "curveLevel": 2,
		  "factors": {"baseMaxHealth": 20, "experience": 40},
		  "body": {"radius": 0.3, "aggroRadius": 3}
		}`)},
		"campfire.json": {Data: []byte(`{
		  "id": 13, "name": "Campfire", "type": "MOB", "curveLevel": 1,
		  "factors": {"baseMaxHealth": 50, "experience": 0, "speed": 0},
		  "body": {"radius": 0.3, "aggroRadius": 0.1}
		}`)},
	})
	require.NoError(t, err)

	data, err := CatalogJSON(r)
	require.NoError(t, err)
	entries := decodeMobCatalog(t, data)

	assert.Equal(t, true, entries[0]["combatTarget"], "a wolf grants XP — it is a target")
	assert.Equal(t, false, entries[1]["combatTarget"], "a campfire grants no XP — it is a fixture")
}

// The catalog is public and read-only. Anything beyond the nameplate fields
// would hand players an out-of-game answer key for content the spellbook is
// meant to make them discover (zero-hint policy), so the projection is pinned
// exactly — a future field added to MobDefinition must not leak by default.
func TestMobCatalogJSON_ExposesNothingBeyondNameplateFields(t *testing.T) {
	data, err := CatalogJSON(catalogTestRegistry(t))
	require.NoError(t, err)

	for _, entry := range decodeMobCatalog(t, data) {
		keys := make([]string, 0, len(entry))
		for k := range entry {
			keys = append(keys, k)
		}
		assert.ElementsMatch(t, []string{"id", "name", "displayName", "curveLevel", "tier", "combatTarget"}, keys,
			"catalog must not leak drops/resistances/HP/skill loadouts")
	}
}

func TestMobCatalogHandler_ServesJSONWithCORS(t *testing.T) {
	handler, err := CatalogHandler(catalogTestRegistry(t))
	require.NoError(t, err)

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequest("GET", "/mobs", nil))

	assert.Equal(t, 200, rec.Code)
	assert.Equal(t, "application/json", rec.Header().Get("Content-Type"))
	// The dev client runs on :2001 against aurad on :2000.
	assert.Equal(t, "*", rec.Header().Get("Access-Control-Allow-Origin"))
	assert.Len(t, decodeMobCatalog(t, rec.Body.Bytes()), 3)
}
