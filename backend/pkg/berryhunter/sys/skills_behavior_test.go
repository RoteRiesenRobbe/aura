package sys

// Behavior tests for SkillSystem effect application and tick-interval logic.
//
// These complement skills_test.go (entity tracking + effect math) with tests
// that exercise applyDamageAura / applyHealAura against hand-built collision
// sets, and processEntity against a real phy.Space so the accumulator and
// TickInterval behavior is pinned down — including the documented multi-effect
// interval quirk (docs/skill-system-design.md, "Known limitation").

import (
	"testing"

	"github.com/EngoEngine/ecs"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/trichner/berryhunter/pkg/berryhunter/items"
	"github.com/trichner/berryhunter/pkg/berryhunter/items/mobs"
	"github.com/trichner/berryhunter/pkg/berryhunter/model"
	"github.com/trichner/berryhunter/pkg/berryhunter/model/mob"
	"github.com/trichner/berryhunter/pkg/berryhunter/model/vitals"
	"github.com/trichner/berryhunter/pkg/berryhunter/phy"
	"github.com/trichner/berryhunter/pkg/berryhunter/skills"
)

// --- test doubles ---

// touchRecorder implements model.Interacter and records PlayerTouches calls.
// It stands in for a mob-like target of a damage aura.
type touchRecorder struct {
	touches   []float32
	hitStyles []model.AuraHitStyle
}

func (r *touchRecorder) PlayerHitsWith(p model.PlayerEntity, item items.Item)  {}
func (r *touchRecorder) MobTouches(m model.MobEntity, factors mobs.Factors)    {}
func (r *touchRecorder) PlayerTouches(p model.PlayerEntity, damageFraction float32) {
	r.touches = append(r.touches, damageFraction)
}
func (r *touchRecorder) NoteAuraHit(style model.AuraHitStyle) {
	r.hitStyles = append(r.hitStyles, style)
}

var (
	_ model.Interacter      = (*touchRecorder)(nil)
	_ model.AuraHitNotifier = (*touchRecorder)(nil)
)

// fakePlayer satisfies both skillEntity and model.PlayerEntity. The embedded
// nil PlayerEntity provides all interface methods; any method that is not
// explicitly overridden panics when called — intentionally, so a test fails
// loudly if the code under test starts using more of the interface.
type fakePlayer struct {
	model.PlayerEntity
	basic           ecs.BasicEntity
	sc              *skills.SkillComponent
	vitalSigns      model.PlayerVitalSigns
	statusEffects   model.StatusEffects
	aura            *phy.Circle
	god             bool
	maxHealthFactor float32
	healedBy        []model.PlayerEntity
	healReceived    vitals.VitalSign
}

func (f *fakePlayer) Basic() ecs.BasicEntity                 { return f.basic }
func (f *fakePlayer) SkillComponent() *skills.SkillComponent { return f.sc }
func (f *fakePlayer) AuraCollider() *phy.Circle              { return f.aura }
func (f *fakePlayer) VitalSigns() *model.PlayerVitalSigns    { return &f.vitalSigns }
func (f *fakePlayer) StatusEffects() *model.StatusEffects    { return &f.statusEffects }
func (f *fakePlayer) MaxHealthFactor() float32               { return f.maxHealthFactor }
func (f *fakePlayer) IsGod() bool                            { return f.god }
func (f *fakePlayer) NoteHealedBy(h model.PlayerEntity)      { f.healedBy = append(f.healedBy, h) }
func (f *fakePlayer) HealthRatio() float32                   { return f.vitalSigns.Health.Fraction() }
func (f *fakePlayer) NoteHealReceived(d vitals.VitalSign)    { f.healReceived += d }

var (
	_ skillEntity        = (*fakePlayer)(nil)
	_ model.PlayerEntity = (*fakePlayer)(nil)
)

func newFakePlayer() *fakePlayer {
	return &fakePlayer{
		basic:           ecs.NewBasic(),
		sc:              skills.NewSkillComponent(true),
		vitalSigns:      model.PlayerVitalSigns{Health: vitals.Max},
		statusEffects:   model.NewStatusEffects(),
		maxHealthFactor: 1.0,
		// Non-nil so applyDamageAura/applyHealAura can read the caster position
		// for selector ordering; tests that need a real space overwrite it.
		aura: phy.NewCircle(phy.VEC2F_ZERO, 1.0),
	}
}

// playerTouchRecorder is a PlayerEntity that also implements Interacter. Used
// to prove the no-friendly-fire rule: the isPlayer check must skip it before
// the Interacter path is reached.
type playerTouchRecorder struct {
	model.PlayerEntity
	basic ecs.BasicEntity
	rec   touchRecorder
}

func (p *playerTouchRecorder) Basic() ecs.BasicEntity { return p.basic }
func (p *playerTouchRecorder) PlayerHitsWith(pl model.PlayerEntity, item items.Item) {}
func (p *playerTouchRecorder) MobTouches(m model.MobEntity, factors mobs.Factors)    {}
func (p *playerTouchRecorder) PlayerTouches(pl model.PlayerEntity, damageFraction float32) {
	p.rec.PlayerTouches(pl, damageFraction)
}

var (
	_ model.PlayerEntity = (*playerTouchRecorder)(nil)
	_ model.Interacter   = (*playerTouchRecorder)(nil)
)

// colliderSetOf builds a collision set by hand: one sensor circle per entry,
// each carrying the given value as UserData. This mirrors what the physics
// system produces on the aura collider after resolution.
func colliderSetOf(userData ...any) phy.ColliderSet {
	set := make(phy.ColliderSet)
	for _, u := range userData {
		c := phy.NewCircle(phy.VEC2F_ZERO, 0.25)
		c.Shape().UserData = u
		set[c] = struct{}{}
	}
	return set
}

func damageEffect(interval int) skills.EffectDef {
	return skills.EffectDef{
		Type:                   skills.EffectTypeDamageAura,
		DamageFraction:         0.01,
		DamageFractionPerLevel: 0.002,
		TargetsMobs:            true, // mirrors the real DamageAura JSON
		TickInterval:           interval,
	}
}

func healEffect() skills.EffectDef {
	return skills.EffectDef{
		Type:               skills.EffectTypeHealAura,
		HealFraction:       0.1,
		SelfDamageFraction: 0.02,
		TickInterval:       1,
	}
}

// --- applyDamageAura ---

func TestApplyDamageAura_DealsLevelScaledDamage(t *testing.T) {
	caster := newFakePlayer()
	target := &touchRecorder{}
	set := colliderSetOf(target)

	applyDamageAura(caster, 1, damageEffect(1), set)
	require.Len(t, target.touches, 1)
	assert.InDelta(t, 0.01, target.touches[0], 1e-6, "level 1 = base fraction")

	target.touches = nil
	applyDamageAura(caster, 3, damageEffect(1), set)
	require.Len(t, target.touches, 1)
	assert.InDelta(t, 0.014, target.touches[0], 1e-6, "level 3 = base + 2*perLevel")
}

func TestApplyDamageAura_TagsFireStyleForFastTick(t *testing.T) {
	caster := newFakePlayer()
	target := &touchRecorder{}
	set := colliderSetOf(target)

	// A fast-tick aura (interval below the slash threshold) reads as sustained fire.
	applyDamageAura(caster, 1, damageEffect(1), set)

	require.Len(t, target.hitStyles, 1)
	assert.Equal(t, model.AuraHitStyleFire, target.hitStyles[0])
}

func TestApplyDamageAura_TagsSlashStyleForSlowTick(t *testing.T) {
	caster := newFakePlayer()
	target := &touchRecorder{}
	set := colliderSetOf(target)

	// A slow-tick aura (interval at/above the slash threshold) reads as a discrete slash.
	applyDamageAura(caster, 1, damageEffect(auraSlashTickThreshold), set)

	require.Len(t, target.hitStyles, 1)
	assert.Equal(t, model.AuraHitStyleSlash, target.hitStyles[0])
}

func TestApplyDamageAura_MobCaster_TagsHitStyle(t *testing.T) {
	caster := newFakeMob()
	target := &mobTouchRecorder{}
	effect := skills.EffectDef{
		Type: skills.EffectTypeDamageAura, DamageFraction: 0.004,
		TargetsPlayers: true, TickInterval: auraSlashTickThreshold,
	}

	applyDamageAura(caster, 1, effect, colliderSetOf(target))

	require.Len(t, target.hitStyles, 1)
	assert.Equal(t, model.AuraHitStyleSlash, target.hitStyles[0])
}

func TestApplyDamageAura_NoFriendlyFire(t *testing.T) {
	caster := newFakePlayer()
	otherPlayer := &playerTouchRecorder{basic: ecs.NewBasic()}
	set := colliderSetOf(otherPlayer)

	applyDamageAura(caster, 1, damageEffect(1), set)

	assert.Empty(t, otherPlayer.rec.touches, "players must never be damaged by a damage aura")
}

func TestApplyDamageAura_IgnoresNilAndNonInteracterUserData(t *testing.T) {
	caster := newFakePlayer()
	set := colliderSetOf(nil, "just a string")

	assert.NotPanics(t, func() {
		applyDamageAura(caster, 1, damageEffect(1), set)
	})
}

func TestApplyDamageAura_NonPlayerCasterIsNoop(t *testing.T) {
	// The Interacter API requires a PlayerEntity caster; a bare skillEntity
	// (transitional until Phase 6 makes mobs skill entities) must be a no-op.
	caster := newFakeEntity()
	target := &touchRecorder{}
	set := colliderSetOf(target)

	applyDamageAura(caster, 1, damageEffect(1), set)

	assert.Empty(t, target.touches)
}

// --- applyHealAura ---

func TestApplyHealAura_HealsHurtAllyByExactFraction(t *testing.T) {
	caster := newFakePlayer()
	ally := newFakePlayer()
	ally.vitalSigns.Health = vitals.Max.SubFraction(0.5)
	start := ally.vitalSigns.Health
	set := colliderSetOf(model.PlayerEntity(ally))

	applyHealAura(caster, 1, healEffect(), set)

	assert.Equal(t, start.AddFraction(0.1), ally.vitalSigns.Health)
}

func TestApplyHealAura_NotesHealerOnTarget(t *testing.T) {
	// Participation XP (v1-roadmap item 10): a successful heal registers the
	// caster as a recent healer on the target, so mob kills the target
	// participates in also reward the healer.
	caster := newFakePlayer()
	ally := newFakePlayer()
	ally.vitalSigns.Health = vitals.Max.SubFraction(0.5)

	applyHealAura(caster, 1, healEffect(), colliderSetOf(model.PlayerEntity(ally)))

	require.Len(t, ally.healedBy, 1)
	assert.Equal(t, model.PlayerEntity(caster), ally.healedBy[0])
}

func TestApplyHealAura_FullHealthTargetNotesNothing(t *testing.T) {
	caster := newFakePlayer()
	ally := newFakePlayer() // full health — no heal happens

	applyHealAura(caster, 1, healEffect(), colliderSetOf(model.PlayerEntity(ally)))

	assert.Empty(t, ally.healedBy)
}

func TestApplyHealAura_SkipsAllyAtFullHealth_NoSelfDamage(t *testing.T) {
	caster := newFakePlayer()
	ally := newFakePlayer() // full health
	set := colliderSetOf(model.PlayerEntity(ally))

	applyHealAura(caster, 1, healEffect(), set)

	assert.Equal(t, vitals.Max, ally.vitalSigns.Health)
	assert.Equal(t, vitals.Max, caster.vitalSigns.Health,
		"no one was healed, so the caster must not pay the self-damage cost")
	assert.Empty(t, caster.statusEffects.Effects())
}

func TestApplyHealAura_SkipsSelf(t *testing.T) {
	caster := newFakePlayer()
	caster.vitalSigns.Health = vitals.Max.SubFraction(0.5)
	start := caster.vitalSigns.Health
	set := colliderSetOf(model.PlayerEntity(caster))

	applyHealAura(caster, 1, healEffect(), set)

	assert.Equal(t, start, caster.vitalSigns.Health,
		"the caster's own collider entry must neither heal nor cost anything")
}

func TestApplyHealAura_SelfDamageOnSuccessfulHeal(t *testing.T) {
	caster := newFakePlayer()
	ally := newFakePlayer()
	ally.vitalSigns.Health = vitals.Max.SubFraction(0.5)
	set := colliderSetOf(model.PlayerEntity(ally))

	applyHealAura(caster, 1, healEffect(), set)

	assert.Equal(t, vitals.Max.SubFraction(0.02), caster.vitalSigns.Health)
	assert.Contains(t, caster.statusEffects.Effects(), model.StatusEffectDamagedAmbient)
}

func TestApplyHealAura_SelfDamageScalesWithMaxHealthFactor(t *testing.T) {
	caster := newFakePlayer()
	caster.maxHealthFactor = 2.0
	ally := newFakePlayer()
	ally.vitalSigns.Health = vitals.Max.SubFraction(0.5)
	set := colliderSetOf(model.PlayerEntity(ally))

	applyHealAura(caster, 1, healEffect(), set)

	assert.Equal(t, vitals.Max.SubFraction(0.01), caster.vitalSigns.Health,
		"self-damage fraction is divided by MaxHealthFactor")
}

func TestApplyHealAura_GodModePaysNoSelfDamage(t *testing.T) {
	caster := newFakePlayer()
	caster.god = true
	ally := newFakePlayer()
	ally.vitalSigns.Health = vitals.Max.SubFraction(0.5)
	start := ally.vitalSigns.Health
	set := colliderSetOf(model.PlayerEntity(ally))

	applyHealAura(caster, 1, healEffect(), set)

	assert.Equal(t, start.AddFraction(0.1), ally.vitalSigns.Health, "ally is still healed")
	assert.Equal(t, vitals.Max, caster.vitalSigns.Health, "god pays nothing")
}

// --- processEntity through a real phy.Space ---

// spaceWithAuraAndTarget wires an aura sensor and a target circle at the same
// position into a phy.Space and resolves one physics step, so the aura's
// collision set is populated exactly like in the running game.
func spaceWithAuraAndTarget(t *testing.T, targetUserData any) *phy.Circle {
	t.Helper()

	aura := phy.NewCircle(phy.VEC2F_ZERO, 1.0)
	aura.Shape().IsSensor = true
	aura.Shape().Layer = int(model.LayerNoneCollision)
	aura.Shape().Mask = int(model.LayerPlayerCollision | model.LayerActionCollision)

	target := phy.NewCircle(phy.VEC2F_ZERO, 0.25)
	target.Shape().IsSensor = true
	target.Shape().Layer = int(model.LayerActionCollision)
	target.Shape().UserData = targetUserData

	space := phy.NewSpace()
	space.AddShape(aura)
	space.AddShape(target)
	space.Update()

	require.NotEmpty(t, aura.Collisions(), "physics setup must produce a collision")
	return aura
}

func activeAuraPlayer(t *testing.T, effects ...skills.EffectDef) (*fakePlayer, *touchRecorder) {
	t.Helper()

	target := &touchRecorder{}
	caster := newFakePlayer()
	caster.aura = spaceWithAuraAndTarget(t, target)

	def := &skills.SkillDefinition{
		ID: 99, Name: "TestAura", Category: skills.SkillCategoryActiveAura, MaxLevel: 5,
		Effects: effects,
	}
	caster.sc.EquipAura(0, def, 1)
	caster.sc.SetActiveAura(0)
	return caster, target
}

// --- mob casters (Phase 6.1) ---

// mobTouchRecorder implements model.Interacter and records MobTouches calls —
// it stands in for a player or structure hit by a mob's aura.
type mobTouchRecorder struct {
	factors   []mobs.Factors
	hitStyles []model.AuraHitStyle
}

func (r *mobTouchRecorder) PlayerHitsWith(p model.PlayerEntity, item items.Item)       {}
func (r *mobTouchRecorder) PlayerTouches(p model.PlayerEntity, damageFraction float32) {}
func (r *mobTouchRecorder) MobTouches(m model.MobEntity, factors mobs.Factors) {
	r.factors = append(r.factors, factors)
}
func (r *mobTouchRecorder) NoteAuraHit(style model.AuraHitStyle) {
	r.hitStyles = append(r.hitStyles, style)
}

var (
	_ model.Interacter      = (*mobTouchRecorder)(nil)
	_ model.AuraHitNotifier = (*mobTouchRecorder)(nil)
)

// fakeMob satisfies skillEntity and model.MobEntity via the embedded nil
// interface (panics loudly on any method the test did not anticipate).
type fakeMob struct {
	model.MobEntity
	basic         ecs.BasicEntity
	sc            *skills.SkillComponent
	aura          *phy.Circle
	statusEffects model.StatusEffects
}

func (f *fakeMob) Basic() ecs.BasicEntity                 { return f.basic }
func (f *fakeMob) SkillComponent() *skills.SkillComponent { return f.sc }
func (f *fakeMob) AuraCollider() *phy.Circle              { return f.aura }
func (f *fakeMob) StatusEffects() *model.StatusEffects    { return &f.statusEffects }

var (
	_ skillEntity     = (*fakeMob)(nil)
	_ model.MobEntity = (*fakeMob)(nil)
)

func newFakeMob(effects ...skills.EffectDef) *fakeMob {
	def := &skills.SkillDefinition{
		ID: 101, Name: "TestMobAura", Category: skills.SkillCategoryActiveAura, MaxLevel: 5,
		Effects: effects,
	}
	sc := skills.NewSkillComponent(false)
	sc.EquipAura(0, def, 1)
	sc.SetActiveAura(0)
	return &fakeMob{
		basic: ecs.NewBasic(),
		sc:    sc,
		aura:  phy.NewCircle(phy.VEC2F_ZERO, 1.0),
	}
}

func TestApplyDamageAura_MobCaster_DamagesViaMobTouches(t *testing.T) {
	caster := newFakeMob()
	target := &mobTouchRecorder{}
	effect := skills.EffectDef{
		Type: skills.EffectTypeDamageAura, DamageFraction: 0.004, TargetsPlayers: true,
	}

	applyDamageAura(caster, 1, effect, colliderSetOf(target))

	require.Len(t, target.factors, 1)
	assert.InDelta(t, 0.004, target.factors[0].DamageFraction, 1e-6)
}

func TestApplyDamageAura_MobCaster_LevelScalesDamage(t *testing.T) {
	caster := newFakeMob()
	target := &mobTouchRecorder{}
	effect := skills.EffectDef{
		Type: skills.EffectTypeDamageAura, DamageFraction: 0.004,
		DamageFractionPerLevel: 0.001, TargetsPlayers: true,
	}

	applyDamageAura(caster, 3, effect, colliderSetOf(target))

	require.Len(t, target.factors, 1)
	assert.InDelta(t, 0.006, target.factors[0].DamageFraction, 1e-6)
}

func TestApplyDamageAura_MobCaster_CarriesStructureDamage(t *testing.T) {
	caster := newFakeMob()
	target := &mobTouchRecorder{}
	effect := skills.EffectDef{
		Type: skills.EffectTypeDamageAura, DamageFraction: 0.0067,
		StructureDamageFraction: 0.67, TargetsPlayers: true, TargetsStructures: true,
	}

	applyDamageAura(caster, 1, effect, colliderSetOf(target))

	require.Len(t, target.factors, 1)
	assert.InDelta(t, 0.67, target.factors[0].StructureDamageFraction, 1e-6)
}

func TestApplyDamageAura_PlayerCaster_RespectsTargetsMobsFlag(t *testing.T) {
	caster := newFakePlayer()
	target := &touchRecorder{}
	effect := skills.EffectDef{
		Type: skills.EffectTypeDamageAura, DamageFraction: 0.01, TargetsMobs: false,
	}

	applyDamageAura(caster, 1, effect, colliderSetOf(target))

	assert.Empty(t, target.touches, "targetsMobs=false must not hit mob-like targets")
}

func TestProcessEntity_MobWithHealEffectIsNoop(t *testing.T) {
	// Mobs do not satisfy the heal-caster capabilities (no PlayerVitalSigns);
	// a heal effect on a mob must be skipped, not panic.
	caster := newFakeMob(healEffect())

	s := NewSkillSystem(phy.NewSpace())
	s.AddEntity(caster)

	assert.NotPanics(t, func() { s.Update(0) })
}

func TestProcessEntity_DerivesSensorMaskFromActiveSkill(t *testing.T) {
	caster := newFakeMob(skills.EffectDef{
		Type: skills.EffectTypeDamageAura, DamageFraction: 0.0067, TickInterval: 1,
		TargetsPlayers: true, TargetsStructures: true,
	})
	caster.aura.Shape().Mask = 0

	s := NewSkillSystem(phy.NewSpace())
	s.AddEntity(caster)
	s.Update(0)

	assert.Equal(t, int(model.LayerPlayerCollision|model.LayerPlaceableCollision),
		caster.aura.Shape().Mask)
}

// TestSkillSystem_EndToEnd_RealMobDamagesPlayerTarget replaces the retired
// mob.Update characterization test: a real Mob built from a definition with a
// skill loadout, wired through a real phy.Space, damages a player-layer
// target with exactly the skill's damageFraction via MobTouches.
func TestSkillSystem_EndToEnd_RealMobDamagesPlayerTarget(t *testing.T) {
	def := &mobs.MobDefinition{
		ID:   1,
		Name: "Dodo",
		Body: mobs.Body{Radius: 0.3, AggroRadius: 2.0},
		Skills: []mobs.MobSkill{{
			Def: &skills.SkillDefinition{
				ID: 199, Name: "TestMobAura", Category: skills.SkillCategoryActiveAura, MaxLevel: 5,
				Effects: []skills.EffectDef{{
					Type: skills.EffectTypeDamageAura, Radius: 0.5,
					DamageFraction: 0.05, TargetsPlayers: true, TickInterval: 1,
				}},
			},
			Level: 1,
		}},
	}
	m := mob.NewMob(def, false, 0, 0)

	target := &mobTouchRecorder{}
	targetCircle := phy.NewCircle(phy.VEC2F_ZERO, 0.25)
	targetCircle.Shape().IsSensor = true
	targetCircle.Shape().Layer = int(model.LayerPlayerCollision)
	targetCircle.Shape().UserData = target

	space := phy.NewSpace()
	space.AddShape(m.AuraCollider())
	space.AddShape(targetCircle)
	space.Update()
	require.NotEmpty(t, m.AuraCollider().Collisions(), "physics setup must produce a collision")

	s := NewSkillSystem(phy.NewSpace())
	s.AddEntity(m)
	s.Update(0)

	require.Len(t, target.factors, 1, "one MobTouches per tick per target in range")
	assert.InDelta(t, 0.05, target.factors[0].DamageFraction, 1e-6)
}

// --- collider sizing (single aura sensor, resized from the active skill) ---

func auraDefWithRadius(id int, radius, radiusPerLevel float32) *skills.SkillDefinition {
	return &skills.SkillDefinition{
		ID: skills.SkillID(id), Name: "SizedAura", Category: skills.SkillCategoryActiveAura, MaxLevel: 5,
		Effects: []skills.EffectDef{{
			Type: skills.EffectTypeDamageAura, Radius: radius, RadiusPerLevel: radiusPerLevel, TickInterval: 1,
		}},
	}
}

func TestSkillSystem_ResizesColliderToEffectiveRadius(t *testing.T) {
	caster := newFakePlayer()
	caster.aura = phy.NewCircle(phy.VEC2F_ZERO, 1.0)
	caster.sc.EquipAura(0, auraDefWithRadius(7, 2.0, 0.25), 3) // effective: 2.0 + 2*0.25
	caster.sc.SetActiveAura(0)

	s := NewSkillSystem(phy.NewSpace())
	s.AddEntity(caster)
	s.Update(0)

	assert.Equal(t, float32(2.5), caster.aura.Radius)
}

func TestSkillSystem_SwitchingSlotsResizesCollider(t *testing.T) {
	caster := newFakePlayer()
	caster.aura = phy.NewCircle(phy.VEC2F_ZERO, 1.0)
	caster.sc.EquipAura(0, auraDefWithRadius(7, 2.0, 0), 1)
	caster.sc.EquipAura(1, auraDefWithRadius(8, 3.5, 0), 1)

	s := NewSkillSystem(phy.NewSpace())
	s.AddEntity(caster)

	caster.sc.SetActiveAura(0)
	s.Update(0)
	assert.Equal(t, float32(2.0), caster.aura.Radius)

	caster.sc.SetActiveAura(1)
	s.Update(0)
	assert.Equal(t, float32(3.5), caster.aura.Radius)
}

func TestSkillSystem_NothingActive_LeavesColliderUntouched(t *testing.T) {
	caster := newFakePlayer()
	caster.aura = phy.NewCircle(phy.VEC2F_ZERO, 1.0)
	caster.sc.EquipAura(0, auraDefWithRadius(7, 2.0, 0), 1)
	// no SetActiveAura — Nothing is active

	s := NewSkillSystem(phy.NewSpace())
	s.AddEntity(caster)
	s.Update(0)

	assert.Equal(t, float32(1.0), caster.aura.Radius)
}

func TestSkillSystem_EndToEnd_DamageAuraHitsTarget(t *testing.T) {
	caster, target := activeAuraPlayer(t, damageEffect(1))
	sk := NewSkillSystem(phy.NewSpace())
	sk.AddEntity(caster)

	sk.Update(33.0)

	require.Len(t, target.touches, 1)
	assert.InDelta(t, 0.01, target.touches[0], 1e-6)
	assert.Equal(t, 0, caster.sc.AuraSlots[0].TickAccumulator,
		"accumulator resets after the effect fired (interval 1)")
}

func TestSkillSystem_TickInterval_FiresEveryNthTick(t *testing.T) {
	caster, target := activeAuraPlayer(t, damageEffect(3))
	sk := NewSkillSystem(phy.NewSpace())
	sk.AddEntity(caster)

	var touchesPerTick []int
	for i := 0; i < 6; i++ {
		before := len(target.touches)
		sk.Update(33.0)
		touchesPerTick = append(touchesPerTick, len(target.touches)-before)
	}

	assert.Equal(t, []int{0, 0, 1, 0, 0, 1}, touchesPerTick,
		"a tickInterval of 3 fires exactly on every third tick")
}

// TestSkillSystem_MultiEffectIntervalQuirk pins down the documented limitation
// (docs/skill-system-design.md, "Known limitation"): the accumulator is shared
// per equipped skill and only resets at the maximum interval, so an effect with
// a shorter interval re-fires on every tick between reaching its own threshold
// and the shared reset. If this test starts failing because the quirk was fixed
// (per-effect accumulators), update docs/skill-system-design.md and replace the
// expectation with the corrected cadence.
func TestSkillSystem_MultiEffectIntervalQuirk(t *testing.T) {
	caster, target := activeAuraPlayer(t, damageEffect(2), damageEffect(3))
	sk := NewSkillSystem(phy.NewSpace())
	sk.AddEntity(caster)

	var touchesPerTick []int
	for i := 0; i < 6; i++ {
		before := len(target.touches)
		sk.Update(33.0)
		touchesPerTick = append(touchesPerTick, len(target.touches)-before)
	}

	// Tick 2: interval-2 effect fires. Tick 3: interval-2 fires AGAIN (quirk)
	// plus interval-3 fires; shared reset. Then the pattern repeats.
	assert.Equal(t, []int{0, 1, 2, 0, 1, 2}, touchesPerTick)
}

func TestSkillSystem_SwitchingResetsFireCycle(t *testing.T) {
	caster, target := activeAuraPlayer(t, damageEffect(3))
	sk := NewSkillSystem(phy.NewSpace())
	sk.AddEntity(caster)

	sk.Update(33.0)
	sk.Update(33.0)
	require.Empty(t, target.touches, "two ticks in, nothing fired yet")

	// Re-activating the slot resets the accumulator — the anti rapid-switch rule.
	caster.sc.SetActiveAura(0)

	sk.Update(33.0)
	assert.Empty(t, target.touches,
		"switching must restart the full interval, not inherit accumulated ticks")

	sk.Update(33.0)
	sk.Update(33.0)
	assert.Len(t, target.touches, 1, "fires after a full interval from the switch")
}

func TestSkillSystem_ActiveButEmptySlotIsNoop(t *testing.T) {
	e := newFakeEntity()
	e.sc.ActiveAuraSlot = 2 // nothing equipped there; collider is nil

	sk := NewSkillSystem(phy.NewSpace())
	sk.AddEntity(e)

	assert.NotPanics(t, func() { sk.Update(33.0) })
}

func TestSkillSystem_EndToEnd_HealAuraHealsAndCosts(t *testing.T) {
	ally := newFakePlayer()
	ally.vitalSigns.Health = vitals.Max.SubFraction(0.5)
	allyStart := ally.vitalSigns.Health

	caster := newFakePlayer()
	caster.aura = spaceWithAuraAndTarget(t, model.PlayerEntity(ally))

	def := &skills.SkillDefinition{
		ID: 2, Name: "HealAura", Category: skills.SkillCategoryActiveAura, MaxLevel: 5,
		Effects: []skills.EffectDef{healEffect()},
	}
	caster.sc.EquipAura(1, def, 1)
	caster.sc.SetActiveAura(1)

	sk := NewSkillSystem(phy.NewSpace())
	sk.AddEntity(caster)
	sk.Update(33.0)

	assert.Equal(t, allyStart.AddFraction(0.1), ally.vitalSigns.Health)
	assert.Equal(t, vitals.Max.SubFraction(0.02), caster.vitalSigns.Health)
}

// --- cooldown skills (Phase 8.2) ---

func novaDef() *skills.SkillDefinition {
	return &skills.SkillDefinition{
		ID: 20, Name: "NovaBurst", Category: skills.SkillCategoryCooldown, MaxLevel: 3,
		CooldownTicks: 300, CooldownTicksPerLevel: -20,
		Effects: []skills.EffectDef{{
			Type:           skills.EffectTypeInstantDamage,
			Radius:         1.5,
			RadiusPerLevel: 0.1,
			DamageFraction: 0.15, DamageFractionPerLevel: 0.03,
			TargetsMobs: true,
		}},
	}
}

// spaceWithBurstTarget builds a space containing one target circle at the
// origin and resolves one physics step, so the broadphase grid the burst
// query reuses is populated exactly like in the running game.
func spaceWithBurstTarget(layer int, userData any) *phy.Space {
	target := phy.NewCircle(phy.VEC2F_ZERO, 0.25)
	target.Shape().IsSensor = true
	target.Shape().Layer = layer
	target.Shape().UserData = userData

	space := phy.NewSpace()
	space.AddShape(target)
	space.Update()
	return space
}

func cooldownCaster(space *phy.Space) (*fakePlayer, *SkillSystem) {
	caster := newFakePlayer()
	caster.aura = phy.NewCircle(phy.VEC2F_ZERO, 1.0) // position source for the burst
	caster.sc.EquipCooldown(0, novaDef(), 1)

	sk := NewSkillSystem(space)
	sk.AddEntity(caster)
	return caster, sk
}

func TestCooldown_PlayerActivationFiresBurst(t *testing.T) {
	target := &touchRecorder{}
	caster, sk := cooldownCaster(spaceWithBurstTarget(int(model.LayerActionCollision), target))
	caster.sc.RequestCooldownActivation(0)

	sk.Update(33.0)

	require.Len(t, target.touches, 1)
	assert.InDelta(t, 0.15, target.touches[0], 1e-6)
	assert.Equal(t, 300, caster.sc.CooldownSlots[0].CdTicks, "cooldown starts after firing")
	assert.Empty(t, caster.sc.PendingCooldowns, "pending activations are consumed")
}

func TestCooldown_ActivationWhileOnCooldownIsIgnored(t *testing.T) {
	target := &touchRecorder{}
	caster, sk := cooldownCaster(spaceWithBurstTarget(int(model.LayerActionCollision), target))
	caster.sc.CooldownSlots[0].CdTicks = 5
	caster.sc.RequestCooldownActivation(0)

	sk.Update(33.0)

	assert.Empty(t, target.touches)
	assert.Equal(t, 4, caster.sc.CooldownSlots[0].CdTicks, "still ticking down")
	assert.Empty(t, caster.sc.PendingCooldowns, "request is consumed, not queued")
}

func TestCooldown_PlayerWhiffConsumesCooldown(t *testing.T) {
	// Nothing in range: the burst hits nothing, the cooldown still starts —
	// aiming is the player's responsibility.
	empty := phy.NewSpace()
	empty.Update()
	caster, sk := cooldownCaster(empty)
	caster.sc.RequestCooldownActivation(0)

	sk.Update(33.0)

	assert.Equal(t, 300, caster.sc.CooldownSlots[0].CdTicks)
}

func TestCooldown_LevelScalesDamageAndCooldown(t *testing.T) {
	target := &touchRecorder{}
	caster, sk := cooldownCaster(spaceWithBurstTarget(int(model.LayerActionCollision), target))
	caster.sc.EquipCooldown(0, novaDef(), 3)
	caster.sc.RequestCooldownActivation(0)

	sk.Update(33.0)

	require.Len(t, target.touches, 1)
	assert.InDelta(t, 0.21, target.touches[0], 1e-6) // 0.15 + 2×0.03
	assert.Equal(t, 260, caster.sc.CooldownSlots[0].CdTicks, "300 − 2×20")
}

func TestCooldown_MobAutoFiresWhenTargetInRange(t *testing.T) {
	stomp := &skills.SkillDefinition{
		ID: 105, Name: "Stomp", Category: skills.SkillCategoryCooldown, MaxLevel: 1,
		CooldownTicks: 450,
		Effects: []skills.EffectDef{{
			Type:           skills.EffectTypeInstantDamage,
			Radius:         2.0,
			DamageFraction: 0.2,
			TargetsPlayers: true,
		}},
	}
	target := &mobTouchRecorder{}
	space := spaceWithBurstTarget(int(model.LayerPlayerCollision), target)

	caster := &fakeMob{basic: ecs.NewBasic(), sc: skills.NewSkillComponent(false), statusEffects: model.NewStatusEffects()}
	caster.aura = phy.NewCircle(phy.VEC2F_ZERO, 1.0)
	caster.sc.EquipCooldown(0, stomp, 1)

	sk := NewSkillSystem(space)
	sk.AddEntity(caster)
	sk.Update(33.0)

	require.Len(t, target.factors, 1)
	assert.InDelta(t, 0.2, target.factors[0].DamageFraction, 1e-6)
	assert.Equal(t, 450, caster.sc.CooldownSlots[0].CdTicks)
}

func TestCooldown_MobHoldsFireWithoutTarget(t *testing.T) {
	stomp := &skills.SkillDefinition{
		ID: 105, Name: "Stomp", Category: skills.SkillCategoryCooldown, MaxLevel: 1,
		CooldownTicks: 450,
		Effects: []skills.EffectDef{{
			Type:           skills.EffectTypeInstantDamage,
			Radius:         2.0,
			DamageFraction: 0.2,
			TargetsPlayers: true,
		}},
	}
	empty := phy.NewSpace()
	empty.Update()

	caster := &fakeMob{basic: ecs.NewBasic(), sc: skills.NewSkillComponent(false), statusEffects: model.NewStatusEffects()}
	caster.aura = phy.NewCircle(phy.VEC2F_ZERO, 1.0)
	caster.sc.EquipCooldown(0, stomp, 1)

	sk := NewSkillSystem(empty)
	sk.AddEntity(caster)
	sk.Update(33.0)
	sk.Update(33.0)

	assert.Equal(t, 0, caster.sc.CooldownSlots[0].CdTicks, "cooldown not consumed on a whiff — stays ready")
}

func TestCooldown_BurstFiredStatusEffect(t *testing.T) {
	empty := phy.NewSpace()
	empty.Update()
	caster, sk := cooldownCaster(empty)
	caster.sc.RequestCooldownActivation(0)

	sk.Update(33.0)

	assert.Contains(t, caster.statusEffects.Effects(), model.StatusEffectBurstFired,
		"burst VFX flag set right after firing")

	// Simulate the per-tick clear + the VFX window running out.
	caster.statusEffects.Clear()
	caster.sc.CooldownSlots[0].CdTicks = caster.sc.CooldownSlots[0].EffectiveCooldownTicks() - skills.BurstVFXTicks
	sk.Update(33.0)

	assert.NotContains(t, caster.statusEffects.Effects(), model.StatusEffectBurstFired,
		"flag expires after BurstVFXTicks")
}

func TestCooldown_SelfHealHealsCaster(t *testing.T) {
	empty := phy.NewSpace()
	empty.Update()

	healDef := &skills.SkillDefinition{
		ID: 21, Name: "Heal", Category: skills.SkillCategoryCooldown, MaxLevel: 3, CooldownTicks: 900,
		Effects: []skills.EffectDef{{
			Type:                 skills.EffectTypeSelfHeal,
			HealFraction:         0.20,
			HealFractionPerLevel: 0.05,
		}},
	}
	caster := newFakePlayer()
	caster.aura = phy.NewCircle(phy.VEC2F_ZERO, 1.0)
	caster.vitalSigns.Health = vitals.Max.SubFraction(0.5)
	start := caster.vitalSigns.Health
	caster.sc.EquipCooldown(0, healDef, 2)
	caster.sc.RequestCooldownActivation(0)

	sk := NewSkillSystem(empty)
	sk.AddEntity(caster)
	sk.Update(33.0)

	assert.Equal(t, start.AddFraction(0.25), caster.vitalSigns.Health, "20% + 1×5% at level 2")
	assert.Equal(t, 900, caster.sc.CooldownSlots[0].CdTicks, "self-heal always consumes the cooldown")
}

// slowRecorder implements the slowable interface for slow_aura tests.
type slowRecorder struct {
	fractions []float32
}

func (r *slowRecorder) ApplySlow(fraction float32) { r.fractions = append(r.fractions, fraction) }

func TestSlowAura_AppliesLevelScaledSlow(t *testing.T) {
	target := &slowRecorder{}
	set := colliderSetOf(target)

	effect := skills.EffectDef{
		Type:                 skills.EffectTypeSlowAura,
		SlowFraction:         0.1,
		SlowFractionPerLevel: 0.1,
		TargetsMobs:          true,
	}

	applySlowAura(3, effect, set)

	require.Len(t, target.fractions, 1)
	assert.InDelta(t, 0.3, target.fractions[0], 1e-6) // 0.1 + 2×0.1
}

func TestSlowAura_SkipsNonSlowableTargets(t *testing.T) {
	// A player (no ApplySlow) in the collision set must simply be skipped.
	set := colliderSetOf(&touchRecorder{})

	effect := skills.EffectDef{Type: skills.EffectTypeSlowAura, SlowFraction: 0.1, TargetsMobs: true}

	assert.NotPanics(t, func() { applySlowAura(1, effect, set) })
}
