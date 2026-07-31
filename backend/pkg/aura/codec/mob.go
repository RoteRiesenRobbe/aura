package codec

import (
	"github.com/RoteRiesenRobbe/aura/pkg/api/AuraApi"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/google/flatbuffers/go"
)

func MobEntityFlatbufMarshal(m model.MobEntity, builder *flatbuffers.Builder) flatbuffers.UOffsetT {
	statusEffects := StatusEffectsMarshal(builder, m)

	AuraApi.MobStart(builder)
	AuraApi.MobAddId(builder, m.Basic().ID())
	AuraApi.MobAddStatusEffects(builder, statusEffects)
	AuraApi.MobAddMobId(builder, uint16(m.MobID()))
	AuraApi.MobAddEntityType(builder, AuraApi.EntityType(m.Type()))
	AuraApi.MobAddRotation(builder, m.Angle())

	aabb := AabbMarshalFlatbuf(m.AABB(), builder)
	AuraApi.MobAddAabb(builder, aabb)
	AuraApi.MobAddHealth(builder, m.Health().UInt32())
	AuraApi.MobAddMaxHealth(builder, m.MaxHealth().UInt32())

	pos := Vec2fMarshalFlatbuf(builder, m.Position())
	AuraApi.MobAddPos(builder, pos)

	// Body radius (px). The field has been in the schema since forever but was
	// never written: every mob sprite class sizes itself from GraphicsConfig
	// and ignores the wire value, so a permanent 0 went unnoticed. The merged
	// NPCs (plan-entity-model.md chunk 3a) DO size from the wire, the way they
	// always did on the Resource path — a hand-placed NPC should be exactly as
	// big as its authored body, not a per-session random roll. Mirrors
	// Resource.radius and Character.radius; existing mob classes are unaffected
	// because they still ignore it.
	AuraApi.MobAddRadius(builder, f32ToU16Px(m.Radius()))

	AuraApi.MobAddBurstRadius(builder, f32ToU16Px(m.BurstRadius()))
	AuraApi.MobAddDamageTaken(builder, m.DamageTaken().UInt32())
	// Crit-flagged share of damage taken (skill-vocab chunk 1, §4.3).
	AuraApi.MobAddCritTaken(builder, m.CritTaken().UInt32())
	// Current total absorb capacity — a live value (skill-vocab chunk 2).
	AuraApi.MobAddShieldHp(builder, m.ShieldHP().UInt32())
	AuraApi.MobAddHealReceived(builder, m.HealReceived().UInt32())
	AuraApi.MobAddAuraHitStyle(builder, byte(m.AuraHitStyle()))
	// 0 while the aura is gated — the client hides the ring (chunk 3c).
	AuraApi.MobAddAuraRadius(builder, f32ToU16Px(m.AuraRadius()))
	// 0 = no light; the client hole-punches the darkness overlay (chunk 3).
	AuraApi.MobAddLightRadius(builder, f32ToU16Px(m.LightRadius()))
	// 0 = not a respawn anchor; the client draws the bind circle (chunk 4).
	AuraApi.MobAddDwellRadius(builder, f32ToU16Px(m.DwellRadius()))
	// Aura tick cadence + phase; both 0 while no aura is active. The client
	// draws the tick indicator and reads the beat to dodge ticks (chunk 6).
	AuraApi.MobAddAuraTickInterval(builder, uint16(m.AuraTickInterval()))
	AuraApi.MobAddAuraTickPhase(builder, uint16(m.AuraTickPhase()))
	// Ring colour + portrait frame (triage items 7/15): the category bitmask is
	// 0 while no aura is active, the tier rank is a static property of the
	// definition.
	AuraApi.MobAddAuraCategory(builder, byte(m.AuraCategories()))
	AuraApi.MobAddTier(builder, byte(m.TierRank()))
	// Buff/debuff kinds currently applied TO the mob — drives the pips.
	AuraApi.MobAddAppliedEffects(builder, byte(m.AppliedEffects()))

	return AuraApi.MobEnd(builder)
}
