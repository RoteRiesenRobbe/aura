package mobs

// The herd block (plan-herding.md D1, R14): a herdable animal runs from
// players and, with a pen, counts when driven into it.

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func mapHerd(t *testing.T, factorsAndHerd string) (*MobDefinition, error) {
	t.Helper()
	raw, err := parseMobDefinition([]byte(`{
	  "id": 1, "name": "Wolf", "type": "MOB",
	  ` + factorsAndHerd + `,
	  "body": {"radius": 0.2, "aggroRadius": 2.4}
	}`))
	require.NoError(t, err)
	return raw.mapToMobDefinition(onDeathSkillRegistry(t), nil, testCurve())
}

func TestMapMobDefinition_HerdWithPen(t *testing.T) {
	def, err := mapHerd(t, `"factors": {"speed": 0.6}, "herd": {"pen": "hans-pen"}`)
	require.NoError(t, err)
	require.NotNil(t, def.Herd)
	assert.Equal(t, "hans-pen", def.Herd.Pen)
}

func TestMapMobDefinition_HerdWithoutPenOnlyRuns(t *testing.T) {
	def, err := mapHerd(t, `"factors": {"speed": 0.6}, "herd": {}`)
	require.NoError(t, err)
	require.NotNil(t, def.Herd, "an empty block is a herd animal that counts nowhere (R14)")
	assert.Empty(t, def.Herd.Pen)
}

func TestMapMobDefinition_NoHerdIsNil(t *testing.T) {
	def, err := mapHerd(t, `"factors": {"speed": 0.6}`)
	require.NoError(t, err)
	assert.Nil(t, def.Herd)
}

func TestMapMobDefinition_HerdNeedsSpeed(t *testing.T) {
	_, err := mapHerd(t, `"factors": {"speed": 0}, "herd": {"pen": "hans-pen"}`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "speed")
}

func TestMapMobDefinition_HerdRejectsUnknownKey(t *testing.T) {
	_, err := parseMobDefinition([]byte(`{"id": 1, "name": "Wolf", "herd": {"pens": "x"}}`))
	assert.Error(t, err, "a typo'd herd key must fail by name")
}

func TestBindHerdPens(t *testing.T) {
	defs := []*MobDefinition{
		{Name: "Sheep", Herd: &Herd{Pen: "hans-pen"}},
		{Name: "Deer", Herd: &Herd{}},
		{Name: "Wolf"},
	}

	warnings, err := BindHerdPens(defs, map[string]bool{"hans-pen": true}, map[string]bool{"hans-pen": true})
	assert.NoError(t, err)
	assert.Empty(t, warnings)

	warnings, err = BindHerdPens(defs, map[string]bool{"hans-pen": true}, map[string]bool{})
	assert.NoError(t, err, "an undrawn pen is a warning: the debug world draws no shipped place")
	assert.Len(t, warnings, 1)

	_, err = BindHerdPens(defs, map[string]bool{}, map[string]bool{})
	require.Error(t, err, "an unlisted pen is a typo")
	assert.Contains(t, err.Error(), "hans-pen")
}
