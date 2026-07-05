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
	touches   []float32 // damage HP per hit
	touchTags [][]string
	hitStyles []model.AuraHitStyle
}

func (r *touchRecorder) PlayerHitsWith(p model.PlayerEntity, item items.Item) {}
func (r *touchRecorder) MobTouches(m model.MobEntity, factors mobs.Factors)   {}
func (r *touchRecorder) PlayerTouches(p model.PlayerEntity, damage model.Damage) {
	r.touches = append(r.touches, damage.HP)
	r.touchTags = append(r.touchTags, damage.Tags)
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
	maxHealth       vitals.VitalSign
	healedBy        []model.PlayerEntity
	healReceived    vitals.VitalSign
	resists         []appliedResist
}

// appliedResist records one ApplyResist call on a test double.
type appliedResist struct {
	source skills.SkillID
	tags   []string
	factor float32
	ticks  int
}

func (f *fakePlayer) Basic() ecs.BasicEntity                 { return f.basic }
func (f *fakePlayer) SkillComponent() *skills.SkillComponent { return f.sc }
func (f *fakePlayer) AuraCollider() *phy.Circle              { return f.aura }
func (f *fakePlayer) VitalSigns() *model.PlayerVitalSigns    { return &f.vitalSigns }
func (f *fakePlayer) StatusEffects() *model.StatusEffects    { return &f.statusEffects }
func (f *fakePlayer) MaxHealthFactor() float32               { return f.maxHealthFactor }
func (f *fakePlayer) IsGod() bool                            { return f.god }
func (f *fakePlayer) MaxHealth() vitals.VitalSign            { return f.maxHealth }
func (f *fakePlayer) NoteHealedBy(h model.PlayerEntity)      { f.healedBy = append(f.healedBy, h) }
func (f *fakePlayer) HealthRatio() float32 {
	if f.maxHealth == 0 {
		return 0
	}
	return float32(f.vitalSigns.Health) / float32(f.maxHealth)
}
func (f *fakePlayer) NoteHealReceived(d vitals.VitalSign) { f.healReceived += d }

func (f *fakePlayer) ApplyResist(source skills.SkillID, tags []string, factor float32, ticks int) {
	f.resists = append(f.resists, appliedResist{source, tags, factor, ticks})
}

var (
	_ skillEntity        = (*fakePlayer)(nil)
	_ model.PlayerEntity = (*fakePlayer)(nil)
)

func newFakePlayer() *fakePlayer {
	return &fakePlayer{
		basic:           ecs.NewBasic(),
		sc:              skills.NewSkillComponent(true),
		vitalSigns:      model.PlayerVitalSigns{Health: 100}, // full = maxHealth (absolute HP, item 11)
		statusEffects:   model.NewStatusEffects(),
		maxHealthFactor: 1.0,
		maxHealth:       100,
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

func (p *playerTouchRecorder) Basic() ecs.BasicEntity                                { return p.basic }
func (p *playerTouchRecorder) PlayerHitsWith(pl model.PlayerEntity, item items.Item) {}
func (p *playerTouchRecorder) MobTouches(m model.MobEntity, factors mobs.Factors)    {}
func (p *playerTouchRecorder) PlayerTouches(pl model.PlayerEntity, damage model.Damage) {
	p.rec.PlayerTouches(pl, damage)
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
		Type:             skills.EffectTypeDamageAura,
		DamageHP:         0.01,
		DamageHPPerLevel: 0.002,
		TargetsMobs:      true, // mirrors the real DamageAura JSON
		TickInterval:     interval,
	}
}

func healEffect() skills.EffectDef {
	return skills.EffectDef{
		Type:         skills.EffectTypeHealAura,
		HealHP:       10,
		SelfDamageHP: 2,
		TickInterval: 1,
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

func TestApplyDamageAura_CarriesDamageTags(t *testing.T) {
	// Player path: the effect's damage tags ride on the Damage payload so the
	// target can match its resistances (item 11 Phase 2).
	caster := newFakePlayer()
	target := &touchRecorder{}
	effect := damageEffect(1)
	effect.DamageTags = []string{"fire", "boss_x_lava"}

	applyDamageAura(caster, 1, effect, colliderSetOf(target))

	require.Len(t, target.touchTags, 1)
	assert.Equal(t, []string{"fire", "boss_x_lava"}, target.touchTags[0])

	// Mob path: same tags travel in the Factors payload via MobTouches.
	mobCaster := newFakeMob()
	mobTarget := &mobTouchRecorder{}

	applyDamageAura(mobCaster, 1, effect, colliderSetOf(mobTarget))

	require.Len(t, mobTarget.factors, 1)
	assert.Equal(t, []string{"fire", "boss_x_lava"}, mobTarget.factors[0].DamageTags)
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
		Type: skills.EffectTypeDamageAura, DamageHP: 0.004,
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
	ally.vitalSigns.Health = 50
	start := ally.vitalSigns.Health
	set := colliderSetOf(model.PlayerEntity(ally))

	applyHealAura(caster, 1, healEffect(), set)

	assert.Equal(t, start.Add(10), ally.vitalSigns.Health)
}

func TestApplyHealAura_NotesHealerOnTarget(t *testing.T) {
	// Participation XP (v1-roadmap item 10): a successful heal registers the
	// caster as a recent healer on the target, so mob kills the target
	// participates in also reward the healer.
	caster := newFakePlayer()
	ally := newFakePlayer()
	ally.vitalSigns.Health = 50

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

	assert.Equal(t, ally.MaxHealth(), ally.vitalSigns.Health)
	assert.Equal(t, caster.MaxHealth(), caster.vitalSigns.Health,
		"no one was healed, so the caster must not pay the self-damage cost")
	assert.Empty(t, caster.statusEffects.Effects())
}

func TestApplyHealAura_SkipsSelf(t *testing.T) {
	caster := newFakePlayer()
	caster.vitalSigns.Health = 50
	start := caster.vitalSigns.Health
	set := colliderSetOf(model.PlayerEntity(caster))

	applyHealAura(caster, 1, healEffect(), set)

	assert.Equal(t, start, caster.vitalSigns.Health,
		"the caster's own collider entry must neither heal nor cost anything")
}

func TestApplyHealAura_SelfDamageOnSuccessfulHeal(t *testing.T) {
	caster := newFakePlayer()
	ally := newFakePlayer()
	ally.vitalSigns.Health = 50
	set := colliderSetOf(model.PlayerEntity(ally))

	applyHealAura(caster, 1, healEffect(), set)

	assert.Equal(t, vitals.VitalSign(98), caster.vitalSigns.Health)
	assert.Contains(t, caster.statusEffects.Effects(), model.StatusEffectDamagedAmbient)
}

func TestApplyHealAura_SelfDamageIsFlatHP(t *testing.T) {
	caster := newFakePlayer()
	caster.maxHealthFactor = 2.0 // no longer affects the self-cost (item 11 Phase 1)
	ally := newFakePlayer()
	ally.vitalSigns.Health = 50
	set := colliderSetOf(model.PlayerEntity(ally))

	applyHealAura(caster, 1, healEffect(), set)

	assert.Equal(t, vitals.VitalSign(98), caster.vitalSigns.Health,
		"self-damage is a flat HP cost, independent of MaxHealthFactor")
}

func TestApplyHealAura_GodModePaysNoSelfDamage(t *testing.T) {
	caster := newFakePlayer()
	caster.god = true
	ally := newFakePlayer()
	ally.vitalSigns.Health = 50
	start := ally.vitalSigns.Health
	set := colliderSetOf(model.PlayerEntity(ally))

	applyHealAura(caster, 1, healEffect(), set)

	assert.Equal(t, start.Add(10), ally.vitalSigns.Health, "ally is still healed")
	assert.Equal(t, caster.MaxHealth(), caster.vitalSigns.Health, "god pays nothing")
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

func (r *mobTouchRecorder) PlayerHitsWith(p model.PlayerEntity, item items.Item)    {}
func (r *mobTouchRecorder) PlayerTouches(p model.PlayerEntity, damage model.Damage) {}
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
		Type: skills.EffectTypeDamageAura, DamageHP: 0.004, TargetsPlayers: true,
	}

	applyDamageAura(caster, 1, effect, colliderSetOf(target))

	require.Len(t, target.factors, 1)
	assert.InDelta(t, 0.004, target.factors[0].Damage, 1e-6)
}

func TestApplyDamageAura_MobCaster_LevelScalesDamage(t *testing.T) {
	caster := newFakeMob()
	target := &mobTouchRecorder{}
	effect := skills.EffectDef{
		Type: skills.EffectTypeDamageAura, DamageHP: 0.004,
		DamageHPPerLevel: 0.001, TargetsPlayers: true,
	}

	applyDamageAura(caster, 3, effect, colliderSetOf(target))

	require.Len(t, target.factors, 1)
	assert.InDelta(t, 0.006, target.factors[0].Damage, 1e-6)
}

func TestApplyDamageAura_MobCaster_CarriesStructureDamage(t *testing.T) {
	caster := newFakeMob()
	target := &mobTouchRecorder{}
	effect := skills.EffectDef{
		Type: skills.EffectTypeDamageAura, DamageHP: 0.0067,
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
		Type: skills.EffectTypeDamageAura, DamageHP: 0.01, TargetsMobs: false,
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
		Type: skills.EffectTypeDamageAura, DamageHP: 0.0067, TickInterval: 1,
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
					DamageHP: 0.05, TargetsPlayers: true, TickInterval: 1,
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
	assert.InDelta(t, 0.05, target.factors[0].Damage, 1e-6)
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
	assert.Equal(t, 1, caster.sc.AuraSlots[0].TickAccumulator,
		"accumulator grows monotonically (interval 1 fires every tick via modulo)")
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

// TestSkillSystem_MultiEffect_EachEffectOnOwnCadence pins the multi-effect tick
// behavior: with a shared but monotonic accumulator and per-effect modulo, each
// effect fires exactly on multiples of its own interval, independent of the
// others (this replaced the earlier shared-max-interval-reset quirk, which made
// a shorter-interval effect re-fire every tick). PaladinAura relies on this to
// run its fast damage and slow heal on separate cadences.
func TestSkillSystem_MultiEffect_EachEffectOnOwnCadence(t *testing.T) {
	caster, target := activeAuraPlayer(t, damageEffect(2), damageEffect(3))
	sk := NewSkillSystem(phy.NewSpace())
	sk.AddEntity(caster)

	var touchesPerTick []int
	for i := 0; i < 6; i++ {
		before := len(target.touches)
		sk.Update(33.0)
		touchesPerTick = append(touchesPerTick, len(target.touches)-before)
	}

	// interval-2 fires on ticks 2,4,6; interval-3 on ticks 3,6 (both on tick 6).
	assert.Equal(t, []int{0, 1, 1, 1, 0, 2}, touchesPerTick)
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
	ally.vitalSigns.Health = 50
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

	assert.Equal(t, allyStart.Add(10), ally.vitalSigns.Health)
	assert.Equal(t, vitals.VitalSign(98), caster.vitalSigns.Health)
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
			DamageHP:       0.15, DamageHPPerLevel: 0.03,
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
			DamageHP:       0.2,
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
	assert.InDelta(t, 0.2, target.factors[0].Damage, 1e-6)
	assert.Equal(t, 450, caster.sc.CooldownSlots[0].CdTicks)
}

func TestCooldown_MobHoldsFireWithoutTarget(t *testing.T) {
	stomp := &skills.SkillDefinition{
		ID: 105, Name: "Stomp", Category: skills.SkillCategoryCooldown, MaxLevel: 1,
		CooldownTicks: 450,
		Effects: []skills.EffectDef{{
			Type:           skills.EffectTypeInstantDamage,
			Radius:         2.0,
			DamageHP:       0.2,
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
			Type:           skills.EffectTypeSelfHeal,
			HealHP:         20,
			HealHPPerLevel: 5,
		}},
	}
	caster := newFakePlayer()
	caster.aura = phy.NewCircle(phy.VEC2F_ZERO, 1.0)
	caster.vitalSigns.Health = 50
	start := caster.vitalSigns.Health
	caster.sc.EquipCooldown(0, healDef, 2)
	caster.sc.RequestCooldownActivation(0)

	sk := NewSkillSystem(empty)
	sk.AddEntity(caster)
	sk.Update(33.0)

	assert.Equal(t, start.Add(25), caster.vitalSigns.Health, "20 + 1×5 HP at level 2")
	assert.Equal(t, 900, caster.sc.CooldownSlots[0].CdTicks, "self-heal always consumes the cooldown")
}

func TestCooldown_SelfHealFractionOfMaxAndNumber(t *testing.T) {
	empty := phy.NewSpace()
	empty.Update()

	// Heal cooldown: heals a fraction of MAX HP (20% + 5% absolute per level),
	// unlike the flat-HP heal aura.
	healDef := &skills.SkillDefinition{
		ID: 21, Name: "Heal", Category: skills.SkillCategoryCooldown, MaxLevel: 3, CooldownTicks: 900,
		Effects: []skills.EffectDef{{
			Type:                      skills.EffectTypeSelfHeal,
			HealFractionOfMax:         0.20,
			HealFractionOfMaxPerLevel: 0.05,
		}},
	}
	caster := newFakePlayer() // maxHealth 100
	caster.aura = phy.NewCircle(phy.VEC2F_ZERO, 1.0)
	caster.vitalSigns.Health = 40
	caster.sc.EquipCooldown(0, healDef, 2) // level 2 → 25% of 100 = 25 HP
	caster.sc.RequestCooldownActivation(0)

	sk := NewSkillSystem(empty)
	sk.AddEntity(caster)
	sk.Update(33.0)

	assert.Equal(t, vitals.VitalSign(65), caster.vitalSigns.Health, "40 + 25% of max 100 (level 2)")
	assert.Equal(t, vitals.VitalSign(25), caster.healReceived,
		"self-heal records the floating heal number")
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

// --- applyResistAura (item 11 Phase 2 Step 3) ---

// resistTargetRecorder is a PlayerEntity ally that records ApplyResist calls.
type resistTargetRecorder struct {
	model.PlayerEntity
	basic   ecs.BasicEntity
	resists []appliedResist
}

func (r *resistTargetRecorder) Basic() ecs.BasicEntity { return r.basic }
func (r *resistTargetRecorder) ApplyResist(source skills.SkillID, tags []string, factor float32, ticks int) {
	r.resists = append(r.resists, appliedResist{source, tags, factor, ticks})
}

func resistEffect() skills.EffectDef {
	return skills.EffectDef{
		Type:                 skills.EffectTypeResistAura,
		ResistTags:           []string{"fire"},
		ResistFactor:         0.6,
		ResistFactorPerLevel: -0.1,
		TargetsPlayers:       true,
		TickInterval:         20,
	}
}

func TestApplyResistAura_BuffsAlliesWithLevelScaledFactor(t *testing.T) {
	caster := newFakePlayer()
	ally := &resistTargetRecorder{basic: ecs.NewBasic()}

	applyResistAura(caster, 40, 2, resistEffect(), colliderSetOf(ally))

	require.Len(t, ally.resists, 1)
	got := ally.resists[0]
	assert.Equal(t, skills.SkillID(40), got.source)
	assert.Equal(t, []string{"fire"}, got.tags)
	assert.InDelta(t, 0.5, got.factor, 1e-6, "level 2 = 0.6 + 1×(−0.1)")
	assert.Equal(t, 21, got.ticks, "lifetime = tick interval + 1 sustains any cadence")

	assert.Empty(t, caster.resists, "no self-buff without targetsSelf")
}

func TestApplyResistAura_TargetsSelfIncludesCaster(t *testing.T) {
	caster := newFakePlayer()
	ally := &resistTargetRecorder{basic: ecs.NewBasic()}
	effect := resistEffect()
	effect.TargetsSelf = true

	applyResistAura(caster, 40, 1, effect, colliderSetOf(ally))

	require.Len(t, caster.resists, 1, "targetsSelf buffs the caster")
	assert.InDelta(t, 0.6, caster.resists[0].factor, 1e-6)
	require.Len(t, ally.resists, 1, "allies in range are buffed as well")
}

func TestApplyResistAura_RespectsTargetCap(t *testing.T) {
	caster := newFakePlayer()
	a := &resistTargetRecorder{basic: ecs.NewBasic()}
	b := &resistTargetRecorder{basic: ecs.NewBasic()}
	effect := resistEffect()
	effect.MaxTargets = 1

	applyResistAura(caster, 40, 1, effect, colliderSetOf(a, b))

	assert.Equal(t, 1, len(a.resists)+len(b.resists), "the cap limits buffed allies")
}
