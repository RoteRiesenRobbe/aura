package main

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/curve"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/mob"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

// TestGiantSpiderLoadsItsWebAndParalyze pins the shipped wiring of
// plan-aura-drawbacks.md C2 (D7) through the real loaders and a real mob: the
// giant spider carries one aura and two cooldowns (SpinWeb, Paralyze), SpinWeb
// resolves its spawnMob to the SpiderWeb def, and the web is an unkillable,
// XP-free structure whose one aura is the slow its sprite is drawn for.
func TestGiantSpiderLoadsItsWebAndParalyze(t *testing.T) {
	content, err := diskContent("../../../api")
	require.NoError(t, err)
	factionsRegistry := mustLoadFactions(t, content)
	skillsRegistry, err := skills.RegistryFromFS(content.skills, factionsRegistry)
	require.NoError(t, err)
	mobsRegistry, err := mobs.RegistryFromFS(skillsRegistry, factionsRegistry, curve.Default(), content.mobs)
	require.NoError(t, err)

	spiderDef, err := mobsRegistry.GetByName("GiantSpider")
	require.NoError(t, err)
	spider := mob.NewMob(spiderDef, 0, phy.NewSpace())
	sc := spider.SkillComponent()

	var auras, cooldowns []string
	for _, es := range sc.AuraSlots {
		if es != nil {
			auras = append(auras, es.Def.Name)
		}
	}
	for _, es := range sc.CooldownSlots {
		if es != nil {
			cooldowns = append(cooldowns, es.Def.Name)
		}
	}
	assert.Equal(t, []string{"GiantVenomSpit"}, auras)
	assert.ElementsMatch(t, []string{"SpinWeb", "Paralyze"}, cooldowns)

	spin, err := skillsRegistry.GetByName("SpinWeb")
	require.NoError(t, err)
	require.Len(t, spin.Effects, 1)
	require.Equal(t, skills.EffectTypeSpawn, spin.Effects[0].Type)
	webDef, err := mobsRegistry.GetByName(spin.Effects[0].Spawn.MobName)
	require.NoError(t, err, "SpinWeb's spawnMob resolves to a mob def")
	assert.Equal(t, "SpiderWeb", webDef.Name)
	assert.Equal(t, mobs.RoleStructure, webDef.Role)
	assert.Zero(t, webDef.Factors.XPFactor)

	web := mob.NewMob(webDef, 0, phy.NewSpace())
	var webAuras []*skills.EquippedSkill
	for _, es := range web.SkillComponent().AuraSlots {
		if es != nil {
			webAuras = append(webAuras, es)
		}
	}
	require.Len(t, webAuras, 1)
	aura := webAuras[0].Def
	assert.Equal(t, "SpiderWebAura", aura.Name)
	require.Len(t, aura.Effects, 1)
	effect := aura.Effects[0]
	assert.Equal(t, skills.EffectTypeSlowAura, effect.Type)
	// The client draws the web at a fixed 1.5 units (Graphics.ts spiderWeb), so
	// the slowing area must not grow with level or the picture lies.
	assert.InDelta(t, 1.5, effect.Radius, 1e-6)
	assert.Zero(t, effect.RadiusPerLevel)
}
