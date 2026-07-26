package codec

import (
	"testing"

	flatbuffers "github.com/google/flatbuffers/go"
	"github.com/stretchr/testify/assert"
	"github.com/RoteRiesenRobbe/aura/pkg/api/AuraApi"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/mob"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

func testMobDef(speed float32) *mobs.MobDefinition {
	return &mobs.MobDefinition{
		ID:   1,
		Name: "Dodo",
		Factors: mobs.Factors{
			Speed:      speed,
			BaseMaxHealth:  40,
			Experience: 1,
		},
		Body: mobs.Body{Radius: 0.3, AggroRadius: 2.0},
		Skills: []mobs.MobSkill{{
			Def: &skills.SkillDefinition{
				ID: 199, Name: "TestAura", Category: skills.SkillCategoryActiveAura, MaxLevel: 5,
				Effects: []skills.EffectDef{{
					Type: skills.EffectTypeDamageAura, Radius: 0.5, TargetsEnemies: true,
					TickInterval: 1, Damage: &skills.DamageParams{HP: 1},
				}},
			},
			Level: 1,
		}},
	}
}

func marshalledMob(t *testing.T, m *mob.Mob) *AuraApi.Mob {
	t.Helper()
	b := flatbuffers.NewBuilder(256)
	b.Finish(MobEntityFlatbufMarshal(m, b))
	return AuraApi.GetRootAsMob(b.FinishedBytes(), 0)
}

// Mob.aura_radius (mob-depth chunk 3c): the wire carries the ACTIVE aura's
// effective radius in px — 0 while the aura is gated — so the client draws
// the ring only while the aura actually runs.
func TestMobMarshalFlatbuf_AuraRadius(t *testing.T) {
	stationary := mob.NewMob(testMobDef(0), 0, nil) // speed 0 → aura always on
	assert.Equal(t, uint16(0.5*Points2px), marshalledMob(t, stationary).AuraRadius(),
		"active aura → effective radius in px on the wire")

	gated := mob.NewMob(testMobDef(1), 0, nil) // moving mob spawns with the aura off
	assert.Equal(t, uint16(0), marshalledMob(t, gated).AuraRadius(),
		"gated aura → 0 on the wire, no ring on the client")
}

// Mob.aura_tick_interval/aura_tick_phase (skill-vocab chunk 6): the wire carries
// the active aura's first-effect effective cadence and the accumulator phase;
// both 0 while the aura is gated, so the client shows no tick indicator.
func TestMobMarshalFlatbuf_AuraTick(t *testing.T) {
	def := testMobDef(0) // speed 0 → aura always on
	def.Skills[0].Def.Effects[0].TickInterval = 8

	m := mob.NewMob(def, 0, nil)
	marshalled := marshalledMob(t, m)
	assert.Equal(t, uint16(8), marshalled.AuraTickInterval(),
		"active aura → first-effect effective interval on the wire")
	assert.Equal(t, uint16(0), marshalled.AuraTickPhase(),
		"a freshly-spawned mob's accumulator is at phase 0")

	gated := mob.NewMob(testMobDef(1), 0, nil) // moving mob spawns with the aura off
	assert.Equal(t, uint16(0), marshalledMob(t, gated).AuraTickInterval(),
		"gated aura → interval 0, no tick indicator")
	assert.Equal(t, uint16(0), marshalledMob(t, gated).AuraTickPhase())

	// A state/visual first effect (here light_aura) re-applies silently — no
	// per-tick hit — so it reports interval 0 and shows no indicator, even
	// though the aura is active (skill-vocab chunk 6 tick-cadence gate).
	stateDef := testMobDef(0)
	stateDef.Skills[0].Def.Effects[0] = skills.EffectDef{Type: skills.EffectTypeLightAura, Radius: 0.5, TickInterval: 1}
	assert.Equal(t, uint16(0), marshalledMob(t, mob.NewMob(stateDef, 0, nil)).AuraTickInterval(),
		"a non-hit first effect → no tick indicator")
}

// Mob.aura_category (triage item 7): the wire carries the active aura's
// effect-category bitmask, so the client colours a mob's ring by what the aura
// actually does. Before this every mob ring rendered the same red damage sprite.
func TestMobMarshalFlatbuf_AuraCategory(t *testing.T) {
	stationary := mob.NewMob(testMobDef(0), 0, nil) // speed 0 → aura always on
	assert.Equal(t, byte(skills.AuraCategoryDamage), marshalledMob(t, stationary).AuraCategory(),
		"active damage aura → damage bit on the wire")

	gated := mob.NewMob(testMobDef(1), 0, nil) // moving mob spawns with the aura off
	assert.Equal(t, byte(0), marshalledMob(t, gated).AuraCategory(),
		"gated aura → 0 on the wire, no ring on the client")
}

// A multi-effect aura keeps every category it carries, rather than being
// demoted to its first effect — the dual-ring case (Paladin/Vanguard/Warbanner).
func TestMobMarshalFlatbuf_AuraCategory_MultiEffect(t *testing.T) {
	def := testMobDef(0)
	def.Skills[0].Def.Effects = append(def.Skills[0].Def.Effects, skills.EffectDef{
		Type: skills.EffectTypeSlowAura, Radius: 0.5, TargetsEnemies: true, TickInterval: 1,
	})

	got := marshalledMob(t, mob.NewMob(def, 0, nil)).AuraCategory()
	assert.Equal(t, byte(skills.AuraCategoryDamage|skills.AuraCategorySlow), got,
		"both categories ride the same byte")
}

// Mob.tier (triage item 15): the authored tier rides the wire as an ordered
// rank, so the client draws the portrait frame ring without its own
// EntityType→tier table.
func TestMobMarshalFlatbuf_Tier(t *testing.T) {
	for _, tc := range []struct {
		tier string
		want byte
	}{
		{"", byte(mobs.TierRankNormal)}, // absent → normal, matching the loader default
		{mobs.TierNormal, byte(mobs.TierRankNormal)},
		{mobs.TierElite, byte(mobs.TierRankElite)},
		{mobs.TierBoss, byte(mobs.TierRankBoss)},
	} {
		def := testMobDef(0)
		def.Tier = tc.tier
		assert.Equal(t, tc.want, marshalledMob(t, mob.NewMob(def, 0, nil)).Tier(),
			"tier %q on the wire", tc.tier)
	}
}
