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

	r, l := sc.Light()
	assert.Equal(t, float32(4.0), r)
	assert.Equal(t, uint32(0xffe6c2), l.Color)

	sc.EquipPassive(0, orangePassiveDef, 3) // 4.5 > 4
	r, l = sc.Light()
	assert.Equal(t, float32(4.5), r)
	assert.Equal(t, uint32(0xffc98a), l.Color)
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

	_, l := sc.Light()
	assert.Equal(t, uint32(0xffe6c2), l.Color)
}

func TestComponentLight_UnauthoredIsZero(t *testing.T) {
	sc := NewSkillComponent(true)
	sc.EquipAura(0, lightAuraDef, 1)
	sc.SetActiveAura(0)

	assert.Equal(t, uint32(0), sc.LightColor())
}

func TestComponentLight_NoLightNoColour(t *testing.T) {
	sc := NewSkillComponent(true)
	r, l := sc.Light()
	assert.Equal(t, float32(0), r)
	assert.Equal(t, uint32(0), l.Color)
	assert.False(t, l.Flicker)
}

// plan-lightmap.md L7 (D12): a light_aura may flicker; absent = steady.
func TestParse_LightFlicker(t *testing.T) {
	parse := func(extra string) (*SkillDefinition, error) {
		raw, err := parseSkillDefinition([]byte(`{
  "id": 93, "name": "TestFire", "category": "active_aura", "maxLevel": 1,
  "effects": [{"type": "light_aura", "radius": 4.0` + extra + `}]
}`))
		require.NoError(t, err)
		return raw.mapToSkillDefinition(nil)
	}
	def, err := parse(`, "flicker": true`)
	require.NoError(t, err)
	assert.True(t, def.Effects[0].Light.Flicker)

	def, err = parse(``)
	require.NoError(t, err)
	assert.False(t, def.Effects[0].Light.Flicker, "absent = steady")
}

func TestParse_FlickerRefusedOffALight(t *testing.T) {
	raw, err := parseSkillDefinition([]byte(`{
  "id": 94, "name": "TestBurn", "category": "active_aura", "maxLevel": 1,
  "effects": [{"type": "damage_aura", "radius": 2.0, "damageHP": 1, "targetsEnemies": true, "flicker": true}]
}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition(nil)
	assert.Error(t, err, "flicker on a damage_aura must be refused")
}

// D12 rides D5: the flag of the effect that won the radius, never an OR.
func TestComponentLight_FlickerFollowsTheWinningRadius(t *testing.T) {
	steady := &SkillDefinition{
		ID: 98, Name: "TestSteadyLamp", Category: SkillCategoryActiveAura, MaxLevel: 1,
		Effects: []EffectDef{{Type: EffectTypeLightAura, Radius: 4.0, Light: &LightParams{}}},
	}
	fire := &SkillDefinition{
		ID: 99, Name: "TestFirePassive", Category: SkillCategoryPassive, MaxLevel: 3,
		Effects: []EffectDef{{Type: EffectTypeLightAura, Radius: 2.5, RadiusPerLevel: 1.0, Light: &LightParams{Flicker: true}}},
	}
	sc := NewSkillComponent(true)
	sc.EquipAura(0, steady, 1)
	sc.SetActiveAura(0)
	sc.EquipPassive(0, fire, 1) // 2.5 < 4: the steady lamp wins
	assert.False(t, sc.LightFlicker())

	sc.EquipPassive(0, fire, 3) // 4.5 > 4: the fire wins
	assert.True(t, sc.LightFlicker())
}
