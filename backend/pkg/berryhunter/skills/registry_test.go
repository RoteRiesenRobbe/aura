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
		"damage-aura.json":    {Data: damageAuraJSON},
		"duplicate-name.json": {Data: duplicateNameJSON},
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
	// 25 player skills (incl. SwiftPassive/ToughPassive, NovaBurst/Heal,
	// SlowAura, the PaladinAura combination result, the FireWard resist
	// aura, the ImmolationAura/Ignite dot pair, SummonTotem,
	// SummonCompanion, the Taunt/Fade threat-op pair, Light, the
	// ReaperAura vocabulary smoke, the Barrier shield smoke, the Recall
	// cast-time cooldown, the chunk-3 HoT+revive smoke trio
	// Rejuvenation/Recover/Revive, the chunk-5 Dash cooldown, the chunk-6
	// Haste tick_rate cooldown, and the C1 Harvest peasant-start aura — né
	// TurnipPull, renamed C2 Part 2)
	// + the 5 C2 wildlife/forest drops/teachings (Hardy, ThickHide,
	// BerserkerAura, LongRangeStrike, Torch)
	// + the 2 C3 tunnel skills (Antivenom resist_passive, Pickaxe
	// smash-gated aura) + the C4 DamageBurst elite-drop cooldown
	// + the C5 Vanguard (the Front-Aura power outlier, §A)
	// + the C6 CallForAid boss drop (three-spawn cooldown)
	// + the 8 C7 recipe-net results (the §A ceiling trio Spearhead/
	// Lifewarden/Shockwave, the Warbanner capstone, the CallForAid squads
	// HoldTheLine/FieldMedics, and the gap fills Wildfire/Suppression —
	// Barrier's recipe home reuses the existing skill)
	// + 31 mob skills (mobs/ subdirectory: TotemAura +
	// CompanionAura + HealerAura + CampfireAura + the AngryMammothStomp
	// cooldown + the C2 wildlife auras WolfBite/BearSwipe/BoarGore/
	// StagNibble/EliteWolfBite + the C3 kobold/spider/hazard set
	// KoboldStab/KoboldVolley/SpiderBite/VenomSpit/PoisonPoolAura + the C4
	// bandit set BanditBlades/BanditVolley/BanditHeal/EliteBanditSlash/
	// RallyDrum + the C5 front set SoldierBlades/OrcCleave/
	// SpikeBarricadeAura + the C6 warlord set WarlordCleave/WarlordFrenzy/
	// WarbannerShield/GruntSlash, among the earlier proving/critter auras)
	assert.Len(t, r.All(), 75)

	for _, name := range []string{"DodoAura", "SaberToothCatAura", "MammothAura", "AngryMammothAura", "CompanionAura", "SummonCompanion"} {
		_, err := r.GetByName(name)
		assert.NoError(t, err, name)
	}

	damage, err := r.GetByName("DamageAura")
	require.NoError(t, err)
	assert.Equal(t, SkillID(1), damage.ID)

	heal, err := r.GetByName("HealAura")
	require.NoError(t, err)
	assert.Equal(t, SkillID(2), heal.ID)
}
