package mobs

import (
	"encoding/json"
	"net/http/httptest"
	"testing"
	"testing/fstest"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
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
		  "factors": {"baseMaxHealth": 80, "ccImmune": true},
		  "body": {"radius": 0.35, "aggroRadius": 4}
		}`)},
		"wolf.json": {Data: []byte(`{
		  "id": 12,
		  "name": "Wolf",
		  "type": "MOB",
		  "curveLevel": 2,
		  "factors": {"baseMaxHealth": 20},
		  "body": {"radius": 0.3, "aggroRadius": 3}
		}`)},
		"orc-warlord.json": {Data: []byte(`{
		  "id": 38,
		  "name": "OrcWarlord",
		  "type": "MOB",
		  "tier": "boss",
		  "curveLevel": 20,
		  "factors": {"baseMaxHealth": 400, "ccImmune": true},
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
		  "factors": {"baseMaxHealth": 20},
		  "body": {"radius": 0.3, "aggroRadius": 3}
		}`)},
		"campfire.json": {Data: []byte(`{
		  "id": 13, "name": "Campfire", "type": "MOB", "curveLevel": 1,
		  "factors": {"baseMaxHealth": 50, "xpFactor": 0, "speed": 0},
		  "body": {"radius": 0.3, "aggroRadius": 0.1}
		}`)},
	})
	require.NoError(t, err)

	data, err := CatalogJSON(r)
	require.NoError(t, err)
	entries := decodeMobCatalog(t, data)

	assert.Equal(t, true, entries[0]["combatTarget"], "a wolf grants XP (absent xpFactor defaults to 1) — it is a target")
	assert.Equal(t, false, entries[1]["combatTarget"], "a campfire authors xpFactor 0 — it is a fixture")
}

// A conversant — a mob that authors an interaction block — gets a name-only
// plate on the client (intake round 9 item 1: "Return to the Lamplighter" in a
// full journal is unactionable if the name only ever appears inside the
// dialogue window). Fixtures and prey both author no interaction, so the flag
// separates NPCs from campfires without a second authored knob.
func TestMobCatalogJSON_ConversantMeansAuthoredInteraction(t *testing.T) {
	r, err := RegistryFromFS(testSkillRegistry(t), nil, testCurve(), fstest.MapFS{
		"wolf.json": {Data: []byte(`{
		  "id": 12, "name": "Wolf", "type": "MOB", "curveLevel": 2,
		  "factors": {"baseMaxHealth": 20},
		  "body": {"radius": 0.3, "aggroRadius": 3}
		}`)},
		"lamplighter.json": {Data: []byte(`{
		  "id": 53, "name": "Lamplighter", "type": "MOB", "entityType": "Hermit", "curveLevel": 1,
		  "factors": {"baseMaxHealth": 50, "xpFactor": 0, "speed": 0},
		  "body": {"radius": 0.35, "collisionLayer": 97, "aggroRadius": 1.0},
		  "interaction": {"range": 2.0, "nodes": [{"id": "root", "lines": ["Hello."]}]}
		}`)},
	})
	require.NoError(t, err)

	data, err := CatalogJSON(r)
	require.NoError(t, err)
	entries := decodeMobCatalog(t, data)

	assert.Equal(t, false, entries[0]["conversant"], "a wolf authors no interaction")
	assert.Equal(t, true, entries[1]["conversant"], "the Lamplighter carries a conversation")
	assert.Equal(t, false, entries[1]["combatTarget"], "conversant and combat target stay independent facts")
}

// The catalog is public and read-only. Anything beyond the nameplate fields
// would hand players an out-of-game answer key for content the spellbook is
// meant to make them discover (zero-hint policy), so the projection is pinned
// exactly — a future field added to MobDefinition must not leak by default.
//
// `auraSkillId` is the ONE deliberate exception, added by C2b because a mob's
// ambient VFX has no other way to learn which aura is running; CatalogEntry's
// doc argues why an aura id is not an answer key. It is in the list so that
// exception stays a decision somebody made, not a field that drifted in.
func TestMobCatalogJSON_ExposesNothingBeyondNameplateFields(t *testing.T) {
	data, err := CatalogJSON(catalogTestRegistry(t))
	require.NoError(t, err)

	for _, entry := range decodeMobCatalog(t, data) {
		keys := make([]string, 0, len(entry))
		for k := range entry {
			keys = append(keys, k)
		}
		assert.ElementsMatch(t, []string{"id", "name", "displayName", "curveLevel", "tier", "combatTarget", "conversant", "auraSkillId"}, keys,
			"catalog must not leak drops/resistances/HP/skill loadouts")
	}
}

// --- auraSkillId (plan-skill-vfx.md C2b, §12d.2) ---

// auraCatalogSkills: one active aura and one passive, so "the species' ACTIVE
// aura" is a claim the fixture can actually falsify - a species carrying only
// the passive must still report 0.
func auraCatalogSkills(t *testing.T) skills.Registry {
	t.Helper()
	r, err := skills.RegistryFromFS(fstest.MapFS{
		"warmth-aura.json": {Data: []byte(`{
		  "id": 201, "name": "WarmthAura", "category": "active_aura", "maxLevel": 1,
		  "effects": [{"type": "heal_aura", "radius": 2, "healFractionOfMax": 0.1, "tickInterval": 60}]
		}`)},
		"thick-hide.json": {Data: []byte(`{
		  "id": 202, "name": "MobThickHide", "category": "passive", "maxLevel": 1,
		  "effects": [{"type": "resist_passive", "resistTags": ["fire"], "resistFactor": 0.8}]
		}`)},
	}, nil)
	require.NoError(t, err)
	return r
}

// A mob's ambient VFX layers need to know WHICH aura is running, and the Mob
// wire table carries no active skill id (§12d.2). The species' one active aura
// rides the catalog instead, since it never changes after boot.
func TestMobCatalogJSON_AuraSkillIDNamesTheSpeciesActiveAura(t *testing.T) {
	r, err := RegistryFromFS(auraCatalogSkills(t), nil, testCurve(), fstest.MapFS{
		"campfire.json": {Data: []byte(`{
		  "id": 12, "name": "Campfire", "type": "MOB", "curveLevel": 1,
		  "factors": {"baseMaxHealth": 20, "xpFactor": 0, "speed": 0},
		  "body": {"radius": 0.3, "aggroRadius": 0.1},
		  "skills": [{"skillName": "WarmthAura", "level": 1}]
		}`)},
		"turnip.json": {Data: []byte(`{
		  "id": 13, "name": "Turnip", "type": "MOB", "curveLevel": 1,
		  "factors": {"baseMaxHealth": 20, "xpFactor": 0, "speed": 0},
		  "body": {"radius": 0.3, "aggroRadius": 0.1}
		}`)},
		"stag.json": {Data: []byte(`{
		  "id": 14, "name": "Stag", "type": "MOB", "curveLevel": 2,
		  "factors": {"baseMaxHealth": 20},
		  "body": {"radius": 0.3, "aggroRadius": 3},
		  "skills": [{"skillName": "MobThickHide", "level": 1}]
		}`)},
	})
	require.NoError(t, err)

	entries := decodeMobCatalog(t, mustCatalogJSON(t, r))

	assert.Equal(t, float64(201), entries[0]["auraSkillId"], "the Campfire's one active aura")
	assert.Equal(t, float64(0), entries[1]["auraSkillId"], "a species with no skills at all authors no aura")
	assert.Equal(t, float64(0), entries[2]["auraSkillId"],
		"a passive is not an aura: it is never the running skill, so it has no ambient moment")
}

// The content pin the whole mechanism rests on. `auraSkillId` is SINGULAR, so
// a species that ever authors two active auras silently loses one of them on
// the client, and there is nothing in the loader forbidding it (a mob may
// carry any number of skills). This is where that day gets loud.
func TestContent_EverySpeciesAuthorsAtMostOneActiveAura(t *testing.T) {
	r := contentRegistry(t)

	for _, def := range r.Mobs() {
		auras := []string{}
		for _, s := range def.Skills {
			if s.Def != nil && s.Def.Category == skills.SkillCategoryActiveAura {
				auras = append(auras, s.Def.Name)
			}
		}
		assert.LessOrEqual(t, len(auras), 1,
			"%s authors %v: the /mobs catalog carries ONE auraSkillId, so the client would "+
				"draw the first and silently drop the rest (plan-skill-vfx.md §12d.2)", def.Name, auras)
	}

	// A named example from each side, so the pin also fails when the derivation
	// itself breaks rather than only when the content does.
	byName := map[string]float64{}
	for _, entry := range decodeMobCatalog(t, mustCatalogJSON(t, r)) {
		byName[entry["name"].(string)] = entry["auraSkillId"].(float64)
	}
	campfire, err := r.GetByName("Campfire")
	require.NoError(t, err)
	require.Len(t, campfire.Skills, 1)
	require.Equal(t, "CampfireAura", campfire.Skills[0].Def.Name)
	assert.Equal(t, float64(campfire.Skills[0].Def.ID), byName["Campfire"], "the campfire's warmth aura")
	assert.NotZero(t, byName["Campfire"], "and it is a real id, not the absent-aura 0")
	assert.Equal(t, float64(0), byName["Turnip"], "a turnip runs nothing")
}

func mustCatalogJSON(t *testing.T, r Registry) []byte {
	t.Helper()
	data, err := CatalogJSON(r)
	require.NoError(t, err)
	return data
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
