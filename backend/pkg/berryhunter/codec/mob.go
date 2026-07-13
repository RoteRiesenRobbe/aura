package codec

import (
	"github.com/google/flatbuffers/go"
	"github.com/trichner/berryhunter/pkg/api/BerryhunterApi"
	"github.com/trichner/berryhunter/pkg/berryhunter/model"
)

func MobEntityFlatbufMarshal(m model.MobEntity, builder *flatbuffers.Builder) flatbuffers.UOffsetT {
	statusEffects := StatusEffectsMarshal(builder, m)

	BerryhunterApi.MobStart(builder)
	BerryhunterApi.MobAddId(builder, m.Basic().ID())
	BerryhunterApi.MobAddStatusEffects(builder, statusEffects)
	BerryhunterApi.MobAddMobId(builder, uint16(m.MobID()))
	BerryhunterApi.MobAddEntityType(builder, BerryhunterApi.EntityType(m.Type()))
	BerryhunterApi.MobAddRotation(builder, m.Angle())

	aabb := AabbMarshalFlatbuf(m.AABB(), builder)
	BerryhunterApi.MobAddAabb(builder, aabb)
	BerryhunterApi.MobAddHealth(builder, m.Health().UInt32())
	BerryhunterApi.MobAddMaxHealth(builder, m.MaxHealth().UInt32())

	pos := Vec2fMarshalFlatbuf(builder, m.Position())
	BerryhunterApi.MobAddPos(builder, pos)

	BerryhunterApi.MobAddBurstRadius(builder, f32ToU16Px(m.BurstRadius()))
	BerryhunterApi.MobAddDamageTaken(builder, m.DamageTaken().UInt32())
	BerryhunterApi.MobAddHealReceived(builder, m.HealReceived().UInt32())
	BerryhunterApi.MobAddAuraHitStyle(builder, byte(m.AuraHitStyle()))
	// 0 while the aura is gated — the client hides the ring (chunk 3c).
	BerryhunterApi.MobAddAuraRadius(builder, f32ToU16Px(m.AuraRadius()))
	// 0 = no light; the client hole-punches the darkness overlay (chunk 3).
	BerryhunterApi.MobAddLightRadius(builder, f32ToU16Px(m.LightRadius()))
	// 0 = not a respawn anchor; the client draws the bind circle (chunk 4).
	BerryhunterApi.MobAddDwellRadius(builder, f32ToU16Px(m.DwellRadius()))

	return BerryhunterApi.MobEnd(builder)
}
