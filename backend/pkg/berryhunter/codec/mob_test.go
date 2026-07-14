package codec

import (
	"testing"

	flatbuffers "github.com/google/flatbuffers/go"
	"github.com/stretchr/testify/assert"
	"github.com/trichner/berryhunter/pkg/api/BerryhunterApi"
	"github.com/trichner/berryhunter/pkg/berryhunter/items/mobs"
	"github.com/trichner/berryhunter/pkg/berryhunter/model/mob"
	"github.com/trichner/berryhunter/pkg/berryhunter/skills"
)

func testMobDef(speed float32) *mobs.MobDefinition {
	return &mobs.MobDefinition{
		ID:   1,
		Name: "Dodo",
		Factors: mobs.Factors{
			Speed:      speed,
			MaxHealth:  40,
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

func marshalledMob(t *testing.T, m *mob.Mob) *BerryhunterApi.Mob {
	t.Helper()
	b := flatbuffers.NewBuilder(256)
	b.Finish(MobEntityFlatbufMarshal(m, b))
	return BerryhunterApi.GetRootAsMob(b.FinishedBytes(), 0)
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
