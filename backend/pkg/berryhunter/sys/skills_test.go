package sys

import (
	"testing"

	"github.com/EngoEngine/ecs"
	"github.com/stretchr/testify/assert"
	"github.com/trichner/berryhunter/pkg/berryhunter/model"
	"github.com/trichner/berryhunter/pkg/berryhunter/model/vitals"
	"github.com/trichner/berryhunter/pkg/berryhunter/phy"
	"github.com/trichner/berryhunter/pkg/berryhunter/skills"
)

// fakeSkillEntity implements skillEntity for unit tests.
// Fields left nil are safe as long as the test does not exercise the code paths that use them.
type fakeSkillEntity struct {
	ecs.BasicEntity
	sc            *skills.SkillComponent
	vitalSigns    model.PlayerVitalSigns
	statusEffects model.StatusEffects
}

func (f *fakeSkillEntity) Basic() ecs.BasicEntity                 { return f.BasicEntity }
func (f *fakeSkillEntity) SkillComponent() *skills.SkillComponent { return f.sc }
func (f *fakeSkillEntity) AuraCollider() *phy.Circle              { return nil }
func (f *fakeSkillEntity) VitalSigns() *model.PlayerVitalSigns    { return &f.vitalSigns }
func (f *fakeSkillEntity) StatusEffects() *model.StatusEffects    { return &f.statusEffects }
func (f *fakeSkillEntity) MaxHealthFactor() float32               { return 1.0 }
func (f *fakeSkillEntity) MaxHealth() vitals.VitalSign            { return vitals.Max }
func (f *fakeSkillEntity) IsGod() bool                            { return false }

func newFakeEntity() *fakeSkillEntity {
	se := model.NewStatusEffects()
	return &fakeSkillEntity{
		BasicEntity:   ecs.NewBasic(),
		sc:            skills.NewSkillComponent(true),
		vitalSigns:    model.PlayerVitalSigns{Health: vitals.Max},
		statusEffects: se,
	}
}

// --- entity tracking tests ---

func TestSkillSystem_TracksAddedEntity(t *testing.T) {
	sk := NewSkillSystem(phy.NewSpace())
	e := newFakeEntity()
	sk.AddEntity(e)

	assert.Len(t, sk.entities, 1)
	assert.Equal(t, e.ID(), sk.entities[0].Basic().ID())
}

func TestSkillSystem_UpdateDoesNotPanic(t *testing.T) {
	sk := NewSkillSystem(phy.NewSpace())
	e := newFakeEntity()
	sk.AddEntity(e)

	assert.NotPanics(t, func() { sk.Update(33.0) })
}

func TestSkillSystem_RemoveDropsEntity(t *testing.T) {
	sk := NewSkillSystem(phy.NewSpace())
	e1 := newFakeEntity()
	e2 := newFakeEntity()
	sk.AddEntity(e1)
	sk.AddEntity(e2)

	sk.Remove(e1.BasicEntity)

	assert.Len(t, sk.entities, 1)
	assert.Equal(t, e2.ID(), sk.entities[0].Basic().ID())
}

// --- "Nothing" (no active aura) ticks nothing ---

func TestSkillSystem_NoActiveAura_TicksNothing(t *testing.T) {
	sk := NewSkillSystem(phy.NewSpace())
	e := newFakeEntity()

	// Equip a heal aura but leave the active slot at Nothing (-1).
	def := &skills.SkillDefinition{
		ID: 2, Name: "HealAura", Category: skills.SkillCategoryActiveAura, MaxLevel: 5,
		Effects: []skills.EffectDef{{
			Type: skills.EffectTypeHealAura,
			Heal: &skills.HealParams{HP: 0.5, SelfDamageHP: 0.5},
		}},
	}
	e.sc.EquipAura(0, def, 1)
	e.sc.ActiveAuraSlot = -1 // Nothing

	sk.AddEntity(e)
	startHealth := e.vitalSigns.Health

	// AuraCollider() returns nil; if the deactivated slot were processed, reading
	// collisions on the nil collider would panic. No panic + unchanged health proves
	// the Nothing state applies no aura effect at all.
	assert.NotPanics(t, func() { sk.Update(33.0) })
	assert.Equal(t, startHealth, e.vitalSigns.Health)
}

// --- effect math tests ---

func TestDamageParamsHPAt_Level1(t *testing.T) {
	p := skills.DamageParams{HP: 0.009, HPPerLevel: 0.002}
	assert.InDelta(t, 0.009, p.HPAt(1), 1e-6)
}

func TestDamageParamsHPAt_Level2(t *testing.T) {
	p := skills.DamageParams{HP: 0.009, HPPerLevel: 0.002}
	assert.InDelta(t, 0.011, p.HPAt(2), 1e-6)
}

func TestDamageParamsHPAt_Level5(t *testing.T) {
	p := skills.DamageParams{HP: 0.009, HPPerLevel: 0.002}
	assert.InDelta(t, 0.017, p.HPAt(5), 1e-6)
}

func TestHealParamsHPAt_Level1(t *testing.T) {
	p := skills.HealParams{HP: 0.001, HPPerLevel: 0.0005}
	assert.InDelta(t, 0.001, p.HPAt(1), 1e-7)
}

func TestHealParamsHPAt_Level2(t *testing.T) {
	p := skills.HealParams{HP: 0.001, HPPerLevel: 0.0005}
	assert.InDelta(t, 0.0015, p.HPAt(2), 1e-7)
}
