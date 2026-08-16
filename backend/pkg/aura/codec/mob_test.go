package codec

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/api/AuraApi"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/mob"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	flatbuffers "github.com/google/flatbuffers/go"
	"github.com/stretchr/testify/assert"
)

// testMobDef builds a mob in the given ROLE: a structure's aura is always on,
// a creature's is gated until it aggros — which is the only thing these wire
// tests care about. (It used to take a speed and lean on the pre-chunk-2
// inference that speed 0 meant "turret".)
func testMobDef(role mobs.Role) *mobs.MobDefinition {
	return &mobs.MobDefinition{
		ID:   1,
		Name: "Wolf",
		Role: role,
		Factors: mobs.Factors{
			Speed:         1,
			BaseMaxHealth: 40,
			XPFactor:      1,
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
	stationary := mob.NewMob(testMobDef(mobs.RoleStructure), 0, nil) // a structure's aura is always on
	assert.Equal(t, uint16(0.5*Points2px), marshalledMob(t, stationary).AuraRadius(),
		"active aura → effective radius in px on the wire")

	gated := mob.NewMob(testMobDef(mobs.RoleCreature), 0, nil) // a creature spawns with its aura gated
	assert.Equal(t, uint16(0), marshalledMob(t, gated).AuraRadius(),
		"gated aura → 0 on the wire, no ring on the client")
}

// Mob.aura_tick_interval/aura_tick_phase (skill-vocab chunk 6): the wire carries
// the active aura's first-effect effective cadence and the accumulator phase;
// both 0 while the aura is gated, so the client shows no tick indicator.
func TestMobMarshalFlatbuf_AuraTick(t *testing.T) {
	def := testMobDef(mobs.RoleStructure) // a structure's aura is always on
	def.Skills[0].Def.Effects[0].TickInterval = 8

	m := mob.NewMob(def, 0, nil)
	marshalled := marshalledMob(t, m)
	assert.Equal(t, uint16(8), marshalled.AuraTickInterval(),
		"active aura → first-effect effective interval on the wire")
	assert.Equal(t, uint16(0), marshalled.AuraTickPhase(),
		"a freshly-spawned mob's accumulator is at phase 0")

	gated := mob.NewMob(testMobDef(mobs.RoleCreature), 0, nil) // a creature spawns with its aura gated
	assert.Equal(t, uint16(0), marshalledMob(t, gated).AuraTickInterval(),
		"gated aura → interval 0, no tick indicator")
	assert.Equal(t, uint16(0), marshalledMob(t, gated).AuraTickPhase())

	// A state/visual first effect (here light_aura) re-applies silently — no
	// per-tick hit — so it reports interval 0 and shows no indicator, even
	// though the aura is active (skill-vocab chunk 6 tick-cadence gate).
	stateDef := testMobDef(mobs.RoleStructure)
	stateDef.Skills[0].Def.Effects[0] = skills.EffectDef{Type: skills.EffectTypeLightAura, Radius: 0.5, TickInterval: 1}
	assert.Equal(t, uint16(0), marshalledMob(t, mob.NewMob(stateDef, 0, nil)).AuraTickInterval(),
		"a non-hit first effect → no tick indicator")
}

// Mob.aura_category (triage item 7): the wire carries the active aura's
// effect-category bitmask, so the client colours a mob's ring by what the aura
// actually does. Before this every mob ring rendered the same red damage sprite.
func TestMobMarshalFlatbuf_AuraCategory(t *testing.T) {
	stationary := mob.NewMob(testMobDef(mobs.RoleStructure), 0, nil) // a structure's aura is always on
	assert.Equal(t, byte(skills.AuraCategoryDamage), marshalledMob(t, stationary).AuraCategory(),
		"active damage aura → damage bit on the wire")

	gated := mob.NewMob(testMobDef(mobs.RoleCreature), 0, nil) // a creature spawns with its aura gated
	assert.Equal(t, byte(0), marshalledMob(t, gated).AuraCategory(),
		"gated aura → 0 on the wire, no ring on the client")
}

// A multi-effect aura keeps every category it carries, rather than being
// demoted to its first effect — the dual-ring case (Paladin/Vanguard/Warbanner).
func TestMobMarshalFlatbuf_AuraCategory_MultiEffect(t *testing.T) {
	def := testMobDef(mobs.RoleStructure)
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
		def := testMobDef(mobs.RoleStructure)
		def.Tier = tc.tier
		assert.Equal(t, tc.want, marshalledMob(t, mob.NewMob(def, 0, nil)).Tier(),
			"tier %q on the wire", tc.tier)
	}
}

// Mob.radius (plan-entity-model.md chunk 3a): the body radius in px. The field
// was in the schema from the start but never written — every mob sprite class
// sizes itself from GraphicsConfig, so a permanent 0 was invisible. The merged
// NPCs size from the wire the way they did on the Resource path, which is what
// turned the gap into a rendering bug (a scale-0 sprite: valid texture, no
// pixels).
func TestMobMarshalFlatbuf_Radius(t *testing.T) {
	def := testMobDef(mobs.RoleCreature)
	def.Body.Radius = 0.35

	got := marshalledMob(t, mob.NewMob(def, 0, nil)).Radius()

	assert.Equal(t, f32ToU16Px(0.35), got, "the body radius must reach the client")
	assert.NotZero(t, got)
}

// Mob.level (plan-mob-levels.md C2): the wire carries the EFFECTIVE level —
// the server's live Mob.Level(), i.e. `owner ?? spawnLevel ?? curveLevel` —
// so the client renders the nameplate and its difficulty tint without
// re-implementing the precedence.
//
// Encoding the raw per-spawn override instead would plate an unoverridden mob
// as level 0 and an owned summon at its species value; the three cases below
// are exactly the three branches of Level().
func TestMobMarshalFlatbuf_Level(t *testing.T) {
	t.Run("no override: the species curve level", func(t *testing.T) {
		def := testMobDef(mobs.RoleCreature)
		def.CurveLevel = 7

		assert.Equal(t, uint16(7), marshalledMob(t, mob.NewMob(def, 0, nil)).Level(),
			"today's behaviour byte-for-byte — the catalog value, now also on the wire")
	})

	t.Run("spawn override: the placement, not the species", func(t *testing.T) {
		def := testMobDef(mobs.RoleCreature)
		def.CurveLevel = 1
		m := mob.NewMob(def, 0, nil)
		m.SetSpawnLevel(25)

		assert.Equal(t, uint16(25), marshalledMob(t, m).Level(),
			"the whole point of the chunk: the plate must stop reading the catalog")
	})

	// The free half of §3.3 — because the codec encodes the effective level, an
	// owned summon plates at its owner's level with no client-side precedence
	// and no code that knows summons exist.
	t.Run("owned summon: the owner's level wins", func(t *testing.T) {
		def := testMobDef(mobs.RoleCreature)
		def.CurveLevel = 1
		m := mob.NewMob(def, 0, nil)
		m.SetSpawnLevel(25)
		m.SetOwner(&levelledOwner{level: 12})

		assert.Equal(t, uint16(12), marshalledMob(t, m).Level(),
			"owner ?? spawnLevel ?? curveLevel, resolved server-side")
	})
}

// levelledOwner answers Progression() and nothing else: the embedded nil
// interface satisfies model.PlayerEntity at compile time, and Level() is the
// only call the encode path makes on an owner. Any other call panics loudly,
// which is the point — a double that silently answers would hide a widened
// dependency.
type levelledOwner struct {
	model.PlayerEntity
	level uint16
}

func (o *levelledOwner) Progression() model.PlayerProgression {
	return model.PlayerProgression{Level: uint32(o.level)}
}
