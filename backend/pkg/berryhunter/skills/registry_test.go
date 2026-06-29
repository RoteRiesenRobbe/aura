package skills

import (
	"os"
	"testing"
	"testing/fstest"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// damageAuraJSON and healAuraJSON are defined in definition_test.go.

var duplicateIDJSON = []byte(`{
  "id": 1,
  "name": "AlsoID1",
  "category": "active_aura",
  "maxLevel": 1,
  "effects": [{"type": "damage_aura", "targetsMobs": true}]
}`)

var duplicateNameJSON = []byte(`{
  "id": 99,
  "name": "DamageAura",
  "category": "active_aura",
  "maxLevel": 1,
  "effects": [{"type": "damage_aura", "targetsMobs": true}]
}`)

func TestRegistry_LoadsMultipleSkills(t *testing.T) {
	fsys := fstest.MapFS{
		"damage-aura.json": {Data: damageAuraJSON},
		"heal-aura.json":   {Data: healAuraJSON},
	}
	r, err := RegistryFromFS(fsys)
	require.NoError(t, err)
	assert.Len(t, r.All(), 2)
}

func TestRegistry_GetByID_Found(t *testing.T) {
	fsys := fstest.MapFS{"damage-aura.json": {Data: damageAuraJSON}}
	r, err := RegistryFromFS(fsys)
	require.NoError(t, err)

	def, err := r.Get(SkillID(1))
	require.NoError(t, err)
	assert.Equal(t, "DamageAura", def.Name)
}

func TestRegistry_GetByID_NotFound(t *testing.T) {
	fsys := fstest.MapFS{"damage-aura.json": {Data: damageAuraJSON}}
	r, err := RegistryFromFS(fsys)
	require.NoError(t, err)

	_, err = r.Get(SkillID(999))
	assert.Error(t, err)
}

func TestRegistry_GetByName_Found(t *testing.T) {
	fsys := fstest.MapFS{"damage-aura.json": {Data: damageAuraJSON}}
	r, err := RegistryFromFS(fsys)
	require.NoError(t, err)

	def, err := r.GetByName("DamageAura")
	require.NoError(t, err)
	assert.Equal(t, SkillID(1), def.ID)
}

func TestRegistry_GetByName_NotFound(t *testing.T) {
	fsys := fstest.MapFS{"damage-aura.json": {Data: damageAuraJSON}}
	r, err := RegistryFromFS(fsys)
	require.NoError(t, err)

	_, err = r.GetByName("NoSuchSkill")
	assert.Error(t, err)
}

func TestRegistry_MalformedJSON(t *testing.T) {
	fsys := fstest.MapFS{"bad.json": {Data: []byte(`{invalid`)}}
	_, err := RegistryFromFS(fsys)
	assert.Error(t, err)
}

func TestRegistry_DuplicateID(t *testing.T) {
	fsys := fstest.MapFS{
		"damage-aura.json": {Data: damageAuraJSON},
		"also-id-1.json":   {Data: duplicateIDJSON},
	}
	_, err := RegistryFromFS(fsys)
	assert.Error(t, err)
}

func TestRegistry_DuplicateName(t *testing.T) {
	fsys := fstest.MapFS{
		"damage-aura.json":      {Data: damageAuraJSON},
		"duplicate-name.json":   {Data: duplicateNameJSON},
	}
	_, err := RegistryFromFS(fsys)
	assert.Error(t, err)
}

func TestRegistry_EmptyDirectory(t *testing.T) {
	fsys := fstest.MapFS{}
	r, err := RegistryFromFS(fsys)
	require.NoError(t, err)
	assert.Empty(t, r.All())
}

func TestRegistry_LoadsFromDisk(t *testing.T) {
	fsys := os.DirFS("../../../../api/skills")
	r, err := RegistryFromFS(fsys)
	require.NoError(t, err)
	assert.Len(t, r.All(), 2)

	damage, err := r.GetByName("DamageAura")
	require.NoError(t, err)
	assert.Equal(t, SkillID(1), damage.ID)

	heal, err := r.GetByName("HealAura")
	require.NoError(t, err)
	assert.Equal(t, SkillID(2), heal.ID)
}
