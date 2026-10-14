package skills

// Empower next cast (plan-effect-types-round-2.md C4, D7, D20, D21): a
// self-only cooldown that arms the caster's NEXT cooldown with any mix of
// instant cast, free, guaranteed crit and a damage/heal factor.

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParse_Empower(t *testing.T) {
	data := []byte(`{
      "id": 162, "name": "Swiftness", "category": "cooldown", "maxLevel": 1, "cooldownTicks": 900,
      "effects": [{"type": "empower", "empowerInstant": true, "empowerFree": true,
        "empowerCrit": true, "empowerFactor": 1.5, "empowerDurationTicks": 450}]
    }`)
	def := mustParse(t, data)

	require.Len(t, def.Effects, 1)
	e := def.Effects[0]
	assert.Equal(t, EffectTypeEmpower, e.Type)
	require.NotNil(t, e.Empower)
	assert.Equal(t, EmpowerParams{Instant: true, Free: true, Crit: true, Factor: 1.5, DurationTicks: 450}, *e.Empower)
	assert.True(t, def.GrantsEmpower())
}

func TestMap_EmpowerRefusesBadShapes(t *testing.T) {
	for name, effect := range map[string]string{
		"grants nothing":  `{"type":"empower","empowerDurationTicks":300}`,
		"no duration":     `{"type":"empower","empowerInstant":true}`,
		"factor of one":   `{"type":"empower","empowerFactor":1,"empowerDurationTicks":300}`,
		"negative factor": `{"type":"empower","empowerFactor":-0.5,"empowerDurationTicks":300}`,
		"radius":          `{"type":"empower","empowerFree":true,"empowerDurationTicks":300,"radius":3}`,
		"target flags":    `{"type":"empower","empowerFree":true,"empowerDurationTicks":300,"targetsAllies":true}`,
	} {
		raw, err := parseSkillDefinition([]byte(`{"id":162,"name":"E","category":"cooldown","maxLevel":1,"cooldownTicks":300,"effects":[` + effect + `]}`))
		require.NoError(t, err, name)
		_, err = raw.mapToSkillDefinition(nil)
		assert.Error(t, err, name)
	}
}

func TestMap_EmpowerIsCooldownOnly(t *testing.T) {
	raw, err := parseSkillDefinition([]byte(`{"id":162,"name":"E","category":"active_aura","maxLevel":1,"effects":[{"type":"empower","empowerFree":true,"empowerDurationTicks":300}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition(nil)
	assert.Error(t, err)
}

func TestBuffs_EmpowerLifecycle(t *testing.T) {
	var b Buffs
	_, ok := b.Empower()
	require.False(t, ok, "nothing armed on a fresh store")

	p := EmpowerParams{Free: true, Crit: true, DurationTicks: 3}
	b.ApplyEmpower(162, p, 3)

	got, ok := b.Empower()
	require.True(t, ok)
	assert.Equal(t, p, got)
	assert.Equal(t, EffectKindEmpower, b.OwnEffects()[0].Kinds, "the tray shows it")
	assert.Equal(t, AppliedEffectNone, b.AppliedEffects(), "no pip: self-only, the tray is the read (C4)")

	_, firing := b.EmpoweredFire()
	assert.False(t, firing, "live is not firing: only an armed cast reads crit and factor")
	b.ArmEmpower()
	_, firing = b.EmpoweredFire()
	assert.True(t, firing)

	b.ConsumeEmpower()
	_, ok = b.Empower()
	assert.False(t, ok, "spent once")
	_, firing = b.EmpoweredFire()
	assert.False(t, firing)
}

func TestBuffs_EmpowerExpires(t *testing.T) {
	var b Buffs
	b.ApplyEmpower(162, EmpowerParams{Free: true, DurationTicks: 2}, 2)
	b.Tick()
	b.Tick()
	_, ok := b.Empower()
	assert.False(t, ok, "an unspent empower runs out")
}

func TestBuffs_ANewEmpowerReplacesTheLiveOne(t *testing.T) {
	var b Buffs
	b.ApplyEmpower(162, EmpowerParams{Free: true, DurationTicks: 100}, 100)
	b.ApplyEmpower(163, EmpowerParams{Crit: true, DurationTicks: 100}, 100)

	got, ok := b.Empower()
	require.True(t, ok)
	assert.Equal(t, EmpowerParams{Crit: true, DurationTicks: 100}, got, "one empower at a time, the latest wins")
	assert.Len(t, b.OwnEffects(), 1)
}
