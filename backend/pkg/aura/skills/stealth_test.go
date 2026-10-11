package skills

// Stealth (plan-effect-types-round-2.md C6, D1, D24): a self-only cooldown
// with an authored duration cap; the holder is hidden from mobs until it
// runs out or damage moves HP either way.

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParse_Stealth(t *testing.T) {
	def := mustParse(t, []byte(`{
      "id": 168, "name": "Vanish", "category": "cooldown", "maxLevel": 1, "cooldownTicks": 1800,
      "effects": [{"type": "stealth", "stealthDurationTicks": 600}]
    }`))

	require.Len(t, def.Effects, 1)
	assert.Equal(t, EffectTypeStealth, def.Effects[0].Type)
	require.NotNil(t, def.Effects[0].Stealth)
	assert.Equal(t, 600, def.Effects[0].Stealth.DurationTicks)
}

func TestMap_StealthRefusesBadShapes(t *testing.T) {
	for name, effect := range map[string]string{
		"no cap":       `{"type":"stealth"}`,
		"radius":       `{"type":"stealth","stealthDurationTicks":600,"radius":3}`,
		"target flags": `{"type":"stealth","stealthDurationTicks":600,"targetsAllies":true}`,
	} {
		raw, err := parseSkillDefinition([]byte(`{"id":168,"name":"V","category":"cooldown","maxLevel":1,"cooldownTicks":300,"effects":[` + effect + `]}`))
		require.NoError(t, err, name)
		_, err = raw.mapToSkillDefinition(nil)
		assert.Error(t, err, name)
	}
}

func TestMap_StealthIsCooldownOnly(t *testing.T) {
	raw, err := parseSkillDefinition([]byte(`{"id":168,"name":"V","category":"active_aura","maxLevel":1,"effects":[{"type":"stealth","stealthDurationTicks":600}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition(nil)
	assert.Error(t, err)
}

func TestBuffs_StealthLifecycle(t *testing.T) {
	var b Buffs
	b.ApplyStealth(168, 600)

	assert.True(t, b.Stealthed())
	assert.NotZero(t, b.AppliedEffects()&AppliedEffectStealth, "the bit every viewer's token alpha reads (D24)")
	assert.Equal(t, EffectKindStealth, b.OwnEffects()[0].Kinds)

	b.DropStealth()
	assert.False(t, b.Stealthed())
}
