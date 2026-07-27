package mobs

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// --- the authored role discriminator (plan-entity-model.md chunk 2) ---
// A mob declares WHAT IT IS instead of signalling it through a stat value.
// These pin the vocabulary itself; the behavioural half lives in model/mob.

func TestParseRole_AcceptsEveryAuthorableRole(t *testing.T) {
	for _, name := range []string{"creature", "structure", "follower"} {
		role, ok := ParseRole(name)
		assert.True(t, ok, "role %q must be authorable", name)
		assert.Equal(t, Role(name), role)
	}
}

func TestParseRole_AbsentIsCreature(t *testing.T) {
	// The default has to live here as well as in the loader: NewMob resolves a
	// directly-constructed definition (tests, the sim harness) the same way.
	role, ok := ParseRole("")
	require.True(t, ok)
	assert.Equal(t, RoleCreature, role)
}

func TestParseRole_RejectsUnknown(t *testing.T) {
	_, ok := ParseRole("turret")
	assert.False(t, ok)
}

// roles is the single source of valid roles — the tierRanks precedent: a role
// is authorable exactly when the table knows it, so the loader, the sim and the
// CLI cannot drift apart.
func TestRoles_CoversEveryRoleConstant(t *testing.T) {
	for _, role := range []Role{RoleCreature, RoleStructure, RoleFollower} {
		_, ok := roles[string(role)]
		assert.True(t, ok, "role %q is a constant with no table entry", role)
	}
	assert.Len(t, roles, 3, "a new role needs a behaviour in model/mob — it is not just a label")
}

func TestMapMobDefinition_RoleDefaultsToCreature(t *testing.T) {
	raw, err := parseMobDefinition([]byte(`{
	  "id": 60,
	  "name": "Wolf",
	  "type": "MOB",
	  "factors": {"baseMaxHealth": 30, "speed": 0.7},
	  "body": {"radius": 0.3, "aggroRadius": 3}
	}`))
	require.NoError(t, err)

	def, err := raw.mapToMobDefinition(testSkillRegistry(t), nil, testCurve())
	require.NoError(t, err)
	assert.Equal(t, RoleCreature, def.Role)
}

func TestMapMobDefinition_AuthoredRolesResolve(t *testing.T) {
	for name, want := range map[string]Role{
		"creature":  RoleCreature,
		"structure": RoleStructure,
		"follower":  RoleFollower,
	} {
		raw, err := parseMobDefinition([]byte(`{
		  "id": 61,
		  "name": "Wolf",
		  "type": "MOB",
		  "role": "` + name + `",
		  "factors": {"baseMaxHealth": 30, "speed": 0.7},
		  "body": {"radius": 0.3, "aggroRadius": 3}
		}`))
		require.NoError(t, err)

		def, err := raw.mapToMobDefinition(testSkillRegistry(t), nil, testCurve())
		require.NoError(t, err, "role %q", name)
		assert.Equal(t, want, def.Role)
	}
}

func TestMapMobDefinition_UnknownRoleFails(t *testing.T) {
	raw, err := parseMobDefinition([]byte(`{
	  "id": 62,
	  "name": "Wolf",
	  "type": "MOB",
	  "role": "turret",
	  "factors": {"baseMaxHealth": 30, "speed": 0.7},
	  "body": {"radius": 0.3, "aggroRadius": 3}
	}`))
	require.NoError(t, err)

	_, err = raw.mapToMobDefinition(testSkillRegistry(t), nil, testCurve())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "turret")
}

// A structure has no sensor to author: the 10 authored ones only ever carried
// an aggroRadius of 0.1 to pass this very check (chunk 2 retires the dummy).
func TestMapMobDefinition_StructureMayOmitAggroRadius(t *testing.T) {
	raw, err := parseMobDefinition([]byte(`{
	  "id": 63,
	  "name": "Campfire",
	  "type": "MOB",
	  "role": "structure",
	  "factors": {"baseMaxHealth": 30},
	  "body": {"radius": 0.3}
	}`))
	require.NoError(t, err)

	def, err := raw.mapToMobDefinition(testSkillRegistry(t), nil, testCurve())
	require.NoError(t, err)
	assert.Zero(t, def.Body.AggroRadius)
}

// It stays required for everything that moves — a creature or a follower
// without a sensor is an authoring mistake, not a design (PO 2026-07-27).
func TestMapMobDefinition_MovingRolesStillRequireAggroRadius(t *testing.T) {
	for _, role := range []string{"creature", "follower"} {
		raw, err := parseMobDefinition([]byte(`{
		  "id": 64,
		  "name": "Wolf",
		  "type": "MOB",
		  "role": "` + role + `",
		  "factors": {"baseMaxHealth": 30, "speed": 0.7},
		  "body": {"radius": 0.3}
		}`))
		require.NoError(t, err)

		_, err = raw.mapToMobDefinition(testSkillRegistry(t), nil, testCurve())
		require.Error(t, err, "role %q", role)
		assert.Contains(t, err.Error(), "aggroRadius")
	}
}

// D3 (PO 2026-07-27): a stationary CREATURE is a legal, wanted config — a
// hazard that gates its aura on aggro instead of running it always-on. Role and
// speed are orthogonal, so the loader takes no view on the combination.
func TestMapMobDefinition_StationaryCreatureIsLegal(t *testing.T) {
	raw, err := parseMobDefinition([]byte(`{
	  "id": 65,
	  "name": "Turnip",
	  "type": "MOB",
	  "factors": {"baseMaxHealth": 30, "speed": 0},
	  "body": {"radius": 0.3, "aggroRadius": 3}
	}`))
	require.NoError(t, err)

	def, err := raw.mapToMobDefinition(testSkillRegistry(t), nil, testCurve())
	require.NoError(t, err)
	assert.Equal(t, RoleCreature, def.Role)
}

// ...and so is a MOVING structure: "structure" says how it behaves, not how
// fast it walks. Nothing in content authors one today; the point is that the
// loader no longer couples the two axes.
func TestMapMobDefinition_MovingStructureIsLegal(t *testing.T) {
	raw, err := parseMobDefinition([]byte(`{
	  "id": 66,
	  "name": "Totem",
	  "type": "MOB",
	  "role": "structure",
	  "factors": {"baseMaxHealth": 30, "speed": 0.5},
	  "body": {"radius": 0.3}
	}`))
	require.NoError(t, err)

	def, err := raw.mapToMobDefinition(testSkillRegistry(t), nil, testCurve())
	require.NoError(t, err)
	assert.Equal(t, RoleStructure, def.Role)
}
