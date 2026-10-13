package skills

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// plan-lightmap.md L2: a light_aura carries an optional colour.

func lightSkillJSON(color string) []byte {
	colorKey := ""
	if color != "" {
		colorKey = `, "color": "` + color + `"`
	}
	return []byte(`{
  "id": 93, "name": "TestLamp", "category": "active_aura", "maxLevel": 3,
  "effects": [{"type": "light_aura", "radius": 4.0` + colorKey + `}]
}`)
}

func parseLight(t *testing.T, color string) (*SkillDefinition, error) {
	t.Helper()
	raw, err := parseSkillDefinition(lightSkillJSON(color))
	require.NoError(t, err)
	return raw.mapToSkillDefinition(nil)
}

func TestParse_LightColorAuthored(t *testing.T) {
	def, err := parseLight(t, "#ffb060")
	require.NoError(t, err)
	require.NotNil(t, def.Effects[0].Light)
	assert.Equal(t, uint32(0xffb060), def.Effects[0].Light.Color)
}

func TestParse_LightColorAbsentIsUnauthored(t *testing.T) {
	def, err := parseLight(t, "")
	require.NoError(t, err)
	require.NotNil(t, def.Effects[0].Light)
	assert.Equal(t, uint32(0), def.Effects[0].Light.Color)
}

func TestParse_LightColorRefusesBlackAndJunk(t *testing.T) {
	for _, bad := range []string{"#000000", "orange", "#fff", "#gg0000", "ffb060"} {
		_, err := parseLight(t, bad)
		assert.Error(t, err, bad)
	}
}

func TestParse_ColorRefusedOffALight(t *testing.T) {
	// The per-type key allowlist runs when the raw effect maps, not at parse.
	raw, err := parseSkillDefinition([]byte(`{
  "id": 94, "name": "TestBurn", "category": "active_aura", "maxLevel": 1,
  "effects": [{"type": "damage_aura", "radius": 2.0, "damageHP": 1, "targetsEnemies": true, "color": "#ff0000"}]
}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition(nil)
	assert.Error(t, err, "a colour on a damage_aura must be refused")
}

var (
	warmAuraDef = &SkillDefinition{
		ID: 95, Name: "TestWarmLamp", Category: SkillCategoryActiveAura, MaxLevel: 3,
		Effects: []EffectDef{{Type: EffectTypeLightAura, Radius: 4.0, Light: &LightParams{Color: 0xffe6c2}}},
	}
	orangePassiveDef = &SkillDefinition{
		ID: 96, Name: "TestOrangeTorch", Category: SkillCategoryPassive, MaxLevel: 3,
		Effects: []EffectDef{{Type: EffectTypeLightAura, Radius: 2.5, RadiusPerLevel: 1.0, Light: &LightParams{Color: 0xffc98a}}},
	}
)

// D5: one colour per entity, the colour of the source that won the radius.
func TestComponentLight_ColourFollowsTheWinningRadius(t *testing.T) {
	sc := NewSkillComponent(true)
	sc.EquipAura(0, warmAuraDef, 1)
	sc.SetActiveAura(0)
	sc.EquipPassive(0, orangePassiveDef, 1) // 2.5 < 4

	r, c := sc.Light()
	assert.Equal(t, float32(4.0), r)
	assert.Equal(t, uint32(0xffe6c2), c)

	sc.EquipPassive(0, orangePassiveDef, 3) // 4.5 > 4
	r, c = sc.Light()
	assert.Equal(t, float32(4.5), r)
	assert.Equal(t, uint32(0xffc98a), c)
}

// A tie keeps the earlier source: the active aura before the passives.
func TestComponentLight_TieKeepsTheAura(t *testing.T) {
	sc := NewSkillComponent(true)
	sc.EquipAura(0, warmAuraDef, 1)
	sc.SetActiveAura(0)
	tied := &SkillDefinition{
		ID: 97, Name: "TestTiedTorch", Category: SkillCategoryPassive, MaxLevel: 1,
		Effects: []EffectDef{{Type: EffectTypeLightAura, Radius: 4.0, Light: &LightParams{Color: 0x123456}}},
	}
	sc.EquipPassive(0, tied, 1)

	_, c := sc.Light()
	assert.Equal(t, uint32(0xffe6c2), c)
}

func TestComponentLight_UnauthoredIsZero(t *testing.T) {
	sc := NewSkillComponent(true)
	sc.EquipAura(0, lightAuraDef, 1)
	sc.SetActiveAura(0)

	assert.Equal(t, uint32(0), sc.LightColor())
}

func TestComponentLight_NoLightNoColour(t *testing.T) {
	sc := NewSkillComponent(true)
	r, c := sc.Light()
	assert.Equal(t, float32(0), r)
	assert.Equal(t, uint32(0), c)
}
