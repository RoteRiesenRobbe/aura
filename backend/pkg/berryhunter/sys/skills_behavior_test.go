package sys

// Behavior tests for SkillSystem effect application and tick-interval logic.
//
// These complement skills_test.go (entity tracking + effect math) with tests
// that exercise applyDamageAura / applyHealAura against hand-built collision
// sets, and processEntity against a real phy.Space so the accumulator and
// TickInterval behavior is pinned down — including the documented multi-effect
// interval quirk (docs/plan-skill-system.md, "Known limitation").

import (
	"fmt"
	"math/rand"
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
// It stands in for a mob-like (hostile) target of a player's damage aura.
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
func (r *touchRecorder) Faction() model.Faction { return model.FactionHostile }

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
	level           uint32
	xp              []uint64
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
func (f *fakePlayer) Faction() model.Faction                 { return model.FactionAligned }
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
func (f *fakePlayer) Radius() float32                     { return 0.25 }
func (f *fakePlayer) Progression() model.PlayerProgression {
	return model.PlayerProgression{Level: f.level}
}
func (f *fakePlayer) AddExperience(xp uint64)             { f.xp = append(f.xp, xp) }
func (f *fakePlayer) RecentHealers() []model.PlayerEntity { return nil }
func (f *fakePlayer) ApplyRecipeCascade()                 {}

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
		level:           1,
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
func (p *playerTouchRecorder) Faction() model.Faction                                { return model.FactionAligned }
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
		Type:           skills.EffectTypeDamageAura,
		TargetsEnemies: true, // mirrors the real DamageAura JSON
		TickInterval:   interval,
		Damage:         &skills.DamageParams{HP: 0.01, HPPerLevel: 0.002},
	}
}

func healEffect() skills.EffectDef {
	return skills.EffectDef{
		Type:         skills.EffectTypeHealAura,
		TickInterval: 1,
		Heal:         &skills.HealParams{HP: 10, SelfDamageHP: 2},
	}
}

// testRNG is the seeded roll source for variance tests (item 11 Phase 3);
// production call sites use the SkillSystem's own time-seeded rng.
func testRNG() *rand.Rand {
	return rand.New(rand.NewSource(7))
}

// --- applyDamageAura ---

func TestApplyDamageAura_DealsLevelScaledDamage(t *testing.T) {
	caster := newFakePlayer()
	target := &touchRecorder{}
	set := colliderSetOf(target)

	applyDamageAura(caster, 1, damageEffect(1), set, testRNG())
	require.Len(t, target.touches, 1)
	assert.InDelta(t, 0.01, target.touches[0], 1e-6, "level 1 = base fraction")

	target.touches = nil
	applyDamageAura(caster, 3, damageEffect(1), set, testRNG())
	require.Len(t, target.touches, 1)
	assert.InDelta(t, 0.014, target.touches[0], 1e-6, "level 3 = base + 2*perLevel")
}

func TestApplyDamageAura_CarriesDamageTags(t *testing.T) {
	// Player path: the effect's damage tags ride on the Damage payload so the
	// target can match its resistances (item 11 Phase 2).
	caster := newFakePlayer()
	target := &touchRecorder{}
	effect := damageEffect(1)
	effect.Damage.Tags = []string{"fire", "boss_x_lava"}

	applyDamageAura(caster, 1, effect, colliderSetOf(target), testRNG())

	require.Len(t, target.touchTags, 1)
	assert.Equal(t, []string{"fire", "boss_x_lava"}, target.touchTags[0])

	// Mob path: same tags travel in the Factors payload via MobTouches.
	mobCaster := newFakeMob()
	mobTarget := &mobTouchRecorder{}

	applyDamageAura(mobCaster, 1, effect, colliderSetOf(mobTarget), testRNG())

	require.Len(t, mobTarget.factors, 1)
	assert.Equal(t, []string{"fire", "boss_x_lava"}, mobTarget.factors[0].DamageTags)
}

func TestApplyDamageAura_TagsFireStyleForFastTick(t *testing.T) {
	caster := newFakePlayer()
	target := &touchRecorder{}
	set := colliderSetOf(target)

	// A fast-tick aura (interval below the slash threshold) reads as sustained fire.
	applyDamageAura(caster, 1, damageEffect(1), set, testRNG())

	require.Len(t, target.hitStyles, 1)
	assert.Equal(t, model.AuraHitStyleFire, target.hitStyles[0])
}

func TestApplyDamageAura_TagsSlashStyleForSlowTick(t *testing.T) {
	caster := newFakePlayer()
	target := &touchRecorder{}
	set := colliderSetOf(target)

	// A slow-tick aura (interval at/above the slash threshold) reads as a discrete slash.
	applyDamageAura(caster, 1, damageEffect(auraSlashTickThreshold), set, testRNG())

	require.Len(t, target.hitStyles, 1)
	assert.Equal(t, model.AuraHitStyleSlash, target.hitStyles[0])
}

func TestApplyDamageAura_MobCaster_TagsHitStyle(t *testing.T) {
	caster := newFakeMob()
	target := &mobTouchRecorder{}
	effect := skills.EffectDef{
		Type:           skills.EffectTypeDamageAura,
		TargetsEnemies: true,
		TickInterval:   auraSlashTickThreshold,
		Damage:         &skills.DamageParams{HP: 0.004},
	}

	applyDamageAura(caster, 1, effect, colliderSetOf(target), testRNG())

	require.Len(t, target.hitStyles, 1)
	assert.Equal(t, model.AuraHitStyleSlash, target.hitStyles[0])
}

func TestApplyDamageAura_NoFriendlyFire(t *testing.T) {
	caster := newFakePlayer()
	otherPlayer := &playerTouchRecorder{basic: ecs.NewBasic()}
	set := colliderSetOf(otherPlayer)

	applyDamageAura(caster, 1, damageEffect(1), set, testRNG())

	assert.Empty(t, otherPlayer.rec.touches, "players must never be damaged by a damage aura")
}

func TestApplyDamageAura_IgnoresNilAndNonInteracterUserData(t *testing.T) {
	caster := newFakePlayer()
	set := colliderSetOf(nil, "just a string")

	assert.NotPanics(t, func() {
		applyDamageAura(caster, 1, damageEffect(1), set, testRNG())
	})
}

func TestApplyDamageAura_NonPlayerCasterIsNoop(t *testing.T) {
	// The Interacter API requires a PlayerEntity caster; a bare skillEntity
	// (transitional until Phase 6 makes mobs skill entities) must be a no-op.
	caster := newFakeEntity()
	target := &touchRecorder{}
	set := colliderSetOf(target)

	applyDamageAura(caster, 1, damageEffect(1), set, testRNG())

	assert.Empty(t, target.touches)
}

// --- applyHealAura ---

func TestApplyHealAura_HealsHurtAllyByExactFraction(t *testing.T) {
	caster := newFakePlayer()
	ally := newFakePlayer()
	ally.vitalSigns.Health = 50
	start := ally.vitalSigns.Health
	set := colliderSetOf(model.PlayerEntity(ally))

	applyHealAura(caster, 1, healEffect(), set, testRNG())

	assert.Equal(t, start.Add(10), ally.vitalSigns.Health)
}

func TestApplyHealAura_NotesHealerOnTarget(t *testing.T) {
	// Participation XP (roadmap item 10): a successful heal registers the
	// caster as a recent healer on the target, so mob kills the target
	// participates in also reward the healer.
	caster := newFakePlayer()
	ally := newFakePlayer()
	ally.vitalSigns.Health = 50

	applyHealAura(caster, 1, healEffect(), colliderSetOf(model.PlayerEntity(ally)), testRNG())

	require.Len(t, ally.healedBy, 1)
	assert.Equal(t, model.PlayerEntity(caster), ally.healedBy[0])
}

func TestApplyHealAura_FullHealthTargetNotesNothing(t *testing.T) {
	caster := newFakePlayer()
	ally := newFakePlayer() // full health — no heal happens

	applyHealAura(caster, 1, healEffect(), colliderSetOf(model.PlayerEntity(ally)), testRNG())

	assert.Empty(t, ally.healedBy)
}

func TestApplyHealAura_SkipsAllyAtFullHealth_NoSelfDamage(t *testing.T) {
	caster := newFakePlayer()
	ally := newFakePlayer() // full health
	set := colliderSetOf(model.PlayerEntity(ally))

	applyHealAura(caster, 1, healEffect(), set, testRNG())

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

	applyHealAura(caster, 1, healEffect(), set, testRNG())

	assert.Equal(t, start, caster.vitalSigns.Health,
		"the caster's own collider entry must neither heal nor cost anything")
}

func TestApplyHealAura_SelfDamageOnSuccessfulHeal(t *testing.T) {
	caster := newFakePlayer()
	ally := newFakePlayer()
	ally.vitalSigns.Health = 50
	set := colliderSetOf(model.PlayerEntity(ally))

	applyHealAura(caster, 1, healEffect(), set, testRNG())

	assert.Equal(t, vitals.VitalSign(98), caster.vitalSigns.Health)
	assert.Contains(t, caster.statusEffects.Effects(), model.StatusEffectDamagedAmbient)
}

func TestApplyHealAura_SelfDamageIsFlatHP(t *testing.T) {
	caster := newFakePlayer()
	caster.maxHealthFactor = 2.0 // no longer affects the self-cost (item 11 Phase 1)
	ally := newFakePlayer()
	ally.vitalSigns.Health = 50
	set := colliderSetOf(model.PlayerEntity(ally))

	applyHealAura(caster, 1, healEffect(), set, testRNG())

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

	applyHealAura(caster, 1, healEffect(), set, testRNG())

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
func (f *fakeMob) Faction() model.Faction                 { return model.FactionHostile }
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
		Type:           skills.EffectTypeDamageAura,
		TargetsEnemies: true,
		Damage:         &skills.DamageParams{HP: 0.004},
	}

	applyDamageAura(caster, 1, effect, colliderSetOf(target), testRNG())

	require.Len(t, target.factors, 1)
	assert.InDelta(t, 0.004, target.factors[0].Damage, 1e-6)
}

func TestApplyDamageAura_MobCaster_LevelScalesDamage(t *testing.T) {
	caster := newFakeMob()
	target := &mobTouchRecorder{}
	effect := skills.EffectDef{
		Type:           skills.EffectTypeDamageAura,
		TargetsEnemies: true,
		Damage:         &skills.DamageParams{HP: 0.004, HPPerLevel: 0.001},
	}

	applyDamageAura(caster, 3, effect, colliderSetOf(target), testRNG())

	require.Len(t, target.factors, 1)
	assert.InDelta(t, 0.006, target.factors[0].Damage, 1e-6)
}

func TestApplyDamageAura_MobCaster_CarriesStructureDamage(t *testing.T) {
	caster := newFakeMob()
	target := &mobTouchRecorder{}
	effect := skills.EffectDef{
		Type:              skills.EffectTypeDamageAura,
		TargetsEnemies:    true,
		TargetsStructures: true,
		Damage:            &skills.DamageParams{HP: 0.0067, StructureDamageFraction: 0.67},
	}

	applyDamageAura(caster, 1, effect, colliderSetOf(target), testRNG())

	require.Len(t, target.factors, 1)
	assert.InDelta(t, 0.67, target.factors[0].StructureDamageFraction, 1e-6)
}

func TestApplyDamageAura_PlayerCaster_RespectsTargetsEnemiesFlag(t *testing.T) {
	caster := newFakePlayer()
	target := &touchRecorder{}
	effect := skills.EffectDef{
		Type:           skills.EffectTypeDamageAura,
		TargetsEnemies: false,
		Damage:         &skills.DamageParams{HP: 0.01},
	}

	applyDamageAura(caster, 1, effect, colliderSetOf(target), testRNG())

	assert.Empty(t, target.touches, "targetsMobs=false must not hit mob-like targets")
}

// --- faction eligibility (effect foundations Step 1) ---

// alignedTouchRecorder is a mob-like Interacter on the PLAYER's faction — the
// shape of a future charmed/summoned ally.
type alignedTouchRecorder struct{ touchRecorder }

func (r *alignedTouchRecorder) Faction() model.Faction { return model.FactionAligned }

// structureRecorder is an Interacter WITHOUT a faction — the shape of a
// placeable. Flag-gated effects must skip it entirely (structures are reached
// only via targetsStructures/MobTouches).
type structureRecorder struct {
	touches []float32
}

func (r *structureRecorder) PlayerHitsWith(p model.PlayerEntity, item items.Item) {}
func (r *structureRecorder) MobTouches(m model.MobEntity, factors mobs.Factors)   {}
func (r *structureRecorder) PlayerTouches(p model.PlayerEntity, damage model.Damage) {
	r.touches = append(r.touches, damage.HP)
}

var _ model.Interacter = (*structureRecorder)(nil)

func TestApplyDamageAura_SameFactionTargetExcluded(t *testing.T) {
	// Eligibility is faction-relative, not kind-relative: a mob-like target on
	// the caster's own faction (charmed/summoned ally) is protected by the
	// no-friendly-fire rule exactly like a player.
	caster := newFakePlayer()
	ally := &alignedTouchRecorder{}

	applyDamageAura(caster, 1, damageEffect(1), colliderSetOf(ally), testRNG())

	assert.Empty(t, ally.touches, "targetsEnemies must not hit a same-faction target")
}

func TestApplyDamageAura_UnfactionedTargetNeverEatsTargetSlot(t *testing.T) {
	// Placeables satisfy Interacter but have no faction; before Step 1 a capped
	// damage aura could waste its maxTargets slot on a nearer structure (a no-op
	// hit — Placeable.PlayerTouches deals nothing). Now the structure is not
	// eligible at all and the slot goes to the mob behind it.
	caster := newFakePlayer()
	structure := &structureRecorder{}
	mobTarget := &touchRecorder{}

	set := make(phy.ColliderSet)
	near := phy.NewCircle(phy.Vec2f{X: 0.1, Y: 0}, 0.25)
	near.Shape().UserData = structure
	set[near] = struct{}{}
	far := phy.NewCircle(phy.Vec2f{X: 0.5, Y: 0}, 0.25)
	far.Shape().UserData = mobTarget
	set[far] = struct{}{}

	effect := damageEffect(1)
	effect.MaxTargets = 1 // nearest-1, the base-aura shape

	applyDamageAura(caster, 1, effect, set, testRNG())

	assert.Empty(t, structure.touches, "unfactioned targets are not flag-eligible")
	require.Len(t, mobTarget.touches, 1, "the slot must go to the factioned enemy")
}

func TestProcessEntity_MobWithHealEffectIsNoop(t *testing.T) {
	// Mobs do not satisfy the heal-caster capabilities (no PlayerVitalSigns);
	// a heal effect on a mob must be skipped, not panic.
	caster := newFakeMob(healEffect())

	s := NewSkillSystem(phy.NewSpace(), nil)
	s.AddEntity(caster)

	assert.NotPanics(t, func() { s.Update(0) })
}

func TestProcessEntity_DerivesSensorMaskFromActiveSkill(t *testing.T) {
	caster := newFakeMob(skills.EffectDef{
		Type:              skills.EffectTypeDamageAura,
		TickInterval:      1,
		TargetsEnemies:    true,
		TargetsStructures: true,
		Damage:            &skills.DamageParams{HP: 0.0067},
	})
	caster.aura.Shape().Mask = 0

	s := NewSkillSystem(phy.NewSpace(), nil)
	s.AddEntity(caster)
	s.Update(0)

	assert.Equal(t, int(model.LayerPlayerCollision|model.LayerPlaceableCollision),
		caster.aura.Shape().Mask)
}

// TestSkillSystem_EndToEnd_RealMobDamagesPlayerTarget replaces the retired
// mob.Update characterization test: a real Mob built from a definition with a
// skill loadout, wired through a real phy.Space, damages a player-layer
// target with exactly the skill's damage via MobTouches.
func TestSkillSystem_EndToEnd_RealMobDamagesPlayerTarget(t *testing.T) {
	def := &mobs.MobDefinition{
		ID:   1,
		Name: "Dodo",
		Body: mobs.Body{Radius: 0.3, AggroRadius: 2.0},
		Skills: []mobs.MobSkill{{
			Def: &skills.SkillDefinition{
				ID: 199, Name: "TestMobAura", Category: skills.SkillCategoryActiveAura, MaxLevel: 5,
				Effects: []skills.EffectDef{{
					Type:           skills.EffectTypeDamageAura,
					Radius:         0.5,
					TargetsEnemies: true,
					TickInterval:   1,
					Damage:         &skills.DamageParams{HP: 0.05},
				}},
			},
			Level: 1,
		}},
	}
	m := mob.NewMob(def, 0)

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

	s := NewSkillSystem(phy.NewSpace(), nil)
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
			Damage: &skills.DamageParams{},
		}},
	}
}

func TestSkillSystem_ResizesColliderToEffectiveRadius(t *testing.T) {
	caster := newFakePlayer()
	caster.aura = phy.NewCircle(phy.VEC2F_ZERO, 1.0)
	caster.sc.EquipAura(0, auraDefWithRadius(7, 2.0, 0.25), 3) // effective: 2.0 + 2*0.25
	caster.sc.SetActiveAura(0)

	s := NewSkillSystem(phy.NewSpace(), nil)
	s.AddEntity(caster)
	s.Update(0)

	assert.Equal(t, float32(2.5), caster.aura.Radius)
}

func TestSkillSystem_SwitchingSlotsResizesCollider(t *testing.T) {
	caster := newFakePlayer()
	caster.aura = phy.NewCircle(phy.VEC2F_ZERO, 1.0)
	caster.sc.EquipAura(0, auraDefWithRadius(7, 2.0, 0), 1)
	caster.sc.EquipAura(1, auraDefWithRadius(8, 3.5, 0), 1)

	s := NewSkillSystem(phy.NewSpace(), nil)
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

	s := NewSkillSystem(phy.NewSpace(), nil)
	s.AddEntity(caster)
	s.Update(0)

	assert.Equal(t, float32(1.0), caster.aura.Radius)
}

func TestSkillSystem_EndToEnd_DamageAuraHitsTarget(t *testing.T) {
	caster, target := activeAuraPlayer(t, damageEffect(1))
	sk := NewSkillSystem(phy.NewSpace(), nil)
	sk.AddEntity(caster)

	sk.Update(33.0)

	require.Len(t, target.touches, 1)
	assert.InDelta(t, 0.01, target.touches[0], 1e-6)
	assert.Equal(t, 1, caster.sc.AuraSlots[0].TickAccumulator,
		"accumulator grows monotonically (interval 1 fires every tick via modulo)")
}

func TestSkillSystem_TickInterval_FiresEveryNthTick(t *testing.T) {
	caster, target := activeAuraPlayer(t, damageEffect(3))
	sk := NewSkillSystem(phy.NewSpace(), nil)
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
	sk := NewSkillSystem(phy.NewSpace(), nil)
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
	sk := NewSkillSystem(phy.NewSpace(), nil)
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

	sk := NewSkillSystem(phy.NewSpace(), nil)
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

	sk := NewSkillSystem(phy.NewSpace(), nil)
	sk.AddEntity(caster)
	sk.Update(33.0)

	assert.Equal(t, allyStart.Add(10), ally.vitalSigns.Health)
	assert.Equal(t, vitals.VitalSign(98), caster.vitalSigns.Health)
}

// --- per-hit variance (item 11 Phase 3) ---

func TestApplyDamageAura_VarianceRollsPerHitWithinBand(t *testing.T) {
	caster := newFakePlayer()
	effect := damageEffect(1)
	effect.Damage.HP = 100
	effect.Damage.Variance = 0.1

	targets := make([]*touchRecorder, 20)
	userData := make([]any, len(targets))
	for i := range targets {
		targets[i] = &touchRecorder{}
		userData[i] = targets[i]
	}

	applyDamageAura(caster, 1, effect, colliderSetOf(userData...), testRNG())

	distinct := map[float32]bool{}
	for _, target := range targets {
		require.Len(t, target.touches, 1)
		hp := target.touches[0]
		assert.GreaterOrEqual(t, hp, float32(90), "roll below the variance band")
		assert.LessOrEqual(t, hp, float32(110), "roll above the variance band")
		distinct[hp] = true
	}
	assert.Greater(t, len(distinct), 1,
		"each hit rolls independently — 20 targets must not all take identical damage")
}

func TestApplyDamageAura_ZeroVarianceStaysExact(t *testing.T) {
	caster := newFakePlayer()
	target := &touchRecorder{}
	effect := damageEffect(1)
	effect.Damage.HP = 100

	applyDamageAura(caster, 1, effect, colliderSetOf(target), testRNG())

	require.Len(t, target.touches, 1)
	assert.Equal(t, float32(100), target.touches[0], "no variance → exact authored damage")
}

func TestApplyDamageAura_VarianceComposesWithResistance(t *testing.T) {
	// Roll order (decision C3): the attacker rolls the raw damage, the target's
	// resistance multiplies the ROLLED value — so a ±10% band under a ×0.5
	// resist lands in the halved band.
	def := &mobs.MobDefinition{
		ID:   1,
		Name: "Dodo",
		Factors: mobs.Factors{
			MaxHealth:   1000,
			Resistances: map[string]float32{"fire": 0.5},
		},
		Body: mobs.Body{Radius: 0.3, AggroRadius: 2.0},
	}
	m := mob.NewMob(def, 0)

	caster := newFakePlayer()
	effect := damageEffect(1)
	effect.Damage.HP = 100
	effect.Damage.Variance = 0.1
	effect.Damage.Tags = []string{"fire"}

	applyDamageAura(caster, 1, effect, colliderSetOf(m), testRNG())

	loss := m.MaxHealth() - m.Health()
	assert.GreaterOrEqual(t, loss, vitals.VitalSign(45), "below the resisted variance band")
	assert.LessOrEqual(t, loss, vitals.VitalSign(55), "above the resisted variance band")
}

func TestApplyHealAura_VarianceRollsWithinBand(t *testing.T) {
	caster := newFakePlayer()
	effect := healEffect()
	effect.Heal.HP = 50
	effect.Heal.SelfDamageHP = 0
	effect.Heal.Variance = 0.2

	rng := testRNG()
	distinct := map[vitals.VitalSign]bool{}
	for i := 0; i < 20; i++ {
		ally := newFakePlayer()
		ally.maxHealth = 1000
		ally.vitalSigns.Health = 100

		applyHealAura(caster, 1, effect, colliderSetOf(model.PlayerEntity(ally)), rng)

		assert.GreaterOrEqual(t, ally.healReceived, vitals.VitalSign(40), "roll below the variance band")
		assert.LessOrEqual(t, ally.healReceived, vitals.VitalSign(60), "roll above the variance band")
		distinct[ally.healReceived] = true
	}
	assert.Greater(t, len(distinct), 1, "heal rolls must vary across hits")
}

func TestCooldown_SelfHealVarianceRollsWithinBand(t *testing.T) {
	empty := phy.NewSpace()
	empty.Update()

	healDef := &skills.SkillDefinition{
		ID: 21, Name: "Heal", Category: skills.SkillCategoryCooldown, MaxLevel: 3, CooldownTicks: 900,
		Effects: []skills.EffectDef{{
			Type:     skills.EffectTypeSelfHeal,
			SelfHeal: &skills.SelfHealParams{HealHP: 50, Variance: 0.2},
		}},
	}
	caster := newFakePlayer()
	caster.maxHealth = 1000
	caster.aura = phy.NewCircle(phy.VEC2F_ZERO, 1.0)
	caster.vitalSigns.Health = 100
	caster.sc.EquipCooldown(0, healDef, 1)
	caster.sc.RequestCooldownActivation(0)

	sk := NewSkillSystem(empty, nil)
	sk.rng = testRNG()
	sk.AddEntity(caster)
	sk.Update(33.0)

	assert.GreaterOrEqual(t, caster.healReceived, vitals.VitalSign(40), "roll below the variance band")
	assert.LessOrEqual(t, caster.healReceived, vitals.VitalSign(60), "roll above the variance band")
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
			TargetsEnemies: true,
			Damage:         &skills.DamageParams{HP: 0.15, HPPerLevel: 0.03},
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

	sk := NewSkillSystem(space, nil)
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
			TargetsEnemies: true,
			Damage:         &skills.DamageParams{HP: 0.2},
		}},
	}
	target := &mobTouchRecorder{}
	space := spaceWithBurstTarget(int(model.LayerPlayerCollision), target)

	caster := &fakeMob{basic: ecs.NewBasic(), sc: skills.NewSkillComponent(false), statusEffects: model.NewStatusEffects()}
	caster.aura = phy.NewCircle(phy.VEC2F_ZERO, 1.0)
	caster.sc.EquipCooldown(0, stomp, 1)

	sk := NewSkillSystem(space, nil)
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
			TargetsEnemies: true,
			Damage:         &skills.DamageParams{HP: 0.2},
		}},
	}
	empty := phy.NewSpace()
	empty.Update()

	caster := &fakeMob{basic: ecs.NewBasic(), sc: skills.NewSkillComponent(false), statusEffects: model.NewStatusEffects()}
	caster.aura = phy.NewCircle(phy.VEC2F_ZERO, 1.0)
	caster.sc.EquipCooldown(0, stomp, 1)

	sk := NewSkillSystem(empty, nil)
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
			Type:     skills.EffectTypeSelfHeal,
			SelfHeal: &skills.SelfHealParams{HealHP: 20, HealHPPerLevel: 5},
		}},
	}
	caster := newFakePlayer()
	caster.aura = phy.NewCircle(phy.VEC2F_ZERO, 1.0)
	caster.vitalSigns.Health = 50
	start := caster.vitalSigns.Health
	caster.sc.EquipCooldown(0, healDef, 2)
	caster.sc.RequestCooldownActivation(0)

	sk := NewSkillSystem(empty, nil)
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
			Type:     skills.EffectTypeSelfHeal,
			SelfHeal: &skills.SelfHealParams{FractionOfMax: 0.20, FractionOfMaxPerLevel: 0.05},
		}},
	}
	caster := newFakePlayer() // maxHealth 100
	caster.aura = phy.NewCircle(phy.VEC2F_ZERO, 1.0)
	caster.vitalSigns.Health = 40
	caster.sc.EquipCooldown(0, healDef, 2) // level 2 → 25% of 100 = 25 HP
	caster.sc.RequestCooldownActivation(0)

	sk := NewSkillSystem(empty, nil)
	sk.AddEntity(caster)
	sk.Update(33.0)

	assert.Equal(t, vitals.VitalSign(65), caster.vitalSigns.Health, "40 + 25% of max 100 (level 2)")
	assert.Equal(t, vitals.VitalSign(25), caster.healReceived,
		"self-heal records the floating heal number")
}

// slowRecorder implements the slowable interface for slow_aura tests.
type slowRecorder struct {
	sources   []skills.SkillID
	fractions []float32
	ticks     []int
}

func (r *slowRecorder) ApplySlow(source skills.SkillID, fraction float32, ticks int) {
	r.sources = append(r.sources, source)
	r.fractions = append(r.fractions, fraction)
	r.ticks = append(r.ticks, ticks)
}

func TestSlowAura_AppliesLevelScaledSlow(t *testing.T) {
	target := &slowRecorder{}
	set := colliderSetOf(target)

	effect := skills.EffectDef{
		Type:           skills.EffectTypeSlowAura,
		TargetsEnemies: true,
		TickInterval:   1,
		Slow:           &skills.SlowParams{Fraction: 0.1, FractionPerLevel: 0.1},
	}

	applySlowAura(4, 3, effect, set)

	require.Len(t, target.fractions, 1)
	assert.InDelta(t, 0.3, target.fractions[0], 1e-6) // 0.1 + 2×0.1
	assert.Equal(t, skills.SkillID(4), target.sources[0], "slow is keyed by its source skill in the buff store")
	assert.Equal(t, 2, target.ticks[0], "aura lifetime convention: tick interval + 1")
}

func TestSlowAura_SkipsNonSlowableTargets(t *testing.T) {
	// A player (no ApplySlow) in the collision set must simply be skipped.
	set := colliderSetOf(&touchRecorder{})

	effect := skills.EffectDef{Type: skills.EffectTypeSlowAura, TargetsEnemies: true, TickInterval: 1, Slow: &skills.SlowParams{Fraction: 0.1}}

	assert.NotPanics(t, func() { applySlowAura(4, 1, effect, set) })
}

// --- applyResistAura (item 11 Phase 2 Step 3) ---

// resistTargetRecorder is a PlayerEntity ally that records ApplyResist calls.
type resistTargetRecorder struct {
	model.PlayerEntity
	basic   ecs.BasicEntity
	resists []appliedResist
}

func (r *resistTargetRecorder) Basic() ecs.BasicEntity { return r.basic }
func (r *resistTargetRecorder) Faction() model.Faction { return model.FactionAligned }
func (r *resistTargetRecorder) ApplyResist(source skills.SkillID, tags []string, factor float32, ticks int) {
	r.resists = append(r.resists, appliedResist{source, tags, factor, ticks})
}

func resistEffect() skills.EffectDef {
	return skills.EffectDef{
		Type:          skills.EffectTypeResistAura,
		TargetsAllies: true, // FireWard shape: buff same-faction targets
		TickInterval:  20,
		Resist:        &skills.ResistParams{Tags: []string{"fire"}, Factor: 0.6, FactorPerLevel: -0.1},
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
	effect.Resist.TargetsSelf = true

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

// --- dot_aura / instant_dot + the tickDots acting site (effect foundations Step 2) ---

// dotRecorder is a mob-like (hostile) target that records ApplyDot calls.
type dotRecorder struct {
	basic ecs.BasicEntity
	dots  []skills.DotBuff
	ticks []int
}

func (r *dotRecorder) Basic() ecs.BasicEntity { return r.basic }
func (r *dotRecorder) Faction() model.Faction { return model.FactionHostile }
func (r *dotRecorder) ApplyDot(source skills.SkillID, dot skills.DotBuff, ticks int) {
	r.dots = append(r.dots, dot)
	r.ticks = append(r.ticks, ticks)
}

func dotEffect() skills.EffectDef {
	return skills.EffectDef{
		Type:           skills.EffectTypeDotAura,
		TargetsEnemies: true,
		TickInterval:   20,
		Dot:            &skills.DotParams{HP: 5, HPPerLevel: 1, Tags: []string{"fire"}, TickCount: 3, Interval: 30},
	}
}

func TestApplyDotEffect_AppliesLevelScaledDotWithCasterRef(t *testing.T) {
	caster := newFakePlayer()
	target := &dotRecorder{basic: ecs.NewBasic()}

	applyDotEffect(caster, 5, 3, dotEffect(), colliderSetOf(target))

	require.Len(t, target.dots, 1)
	dot := target.dots[0]
	assert.InDelta(t, 7, dot.HP, 1e-6, "5 + 2×1")
	assert.Equal(t, []string{"fire"}, dot.Tags)
	assert.Equal(t, 30, dot.Interval)
	assert.Same(t, any(caster), dot.Caster, "caster rides the payload for attribution")
	assert.Equal(t, 3*30+1, target.ticks[0], "full authored duration, not the aura re-application lifetime")
}

func TestApplyDotEffect_SameFactionTargetExcluded(t *testing.T) {
	// No friendly fire: a targetsEnemies dot never lands on an ally.
	caster := newFakePlayer()
	ally := &resistTargetRecorder{basic: ecs.NewBasic()}

	applyDotEffect(caster, 5, 1, dotEffect(), colliderSetOf(ally))

	assert.Empty(t, ally.resists, "nothing applied to the ally")
}

// dotVictim carries a real skills.Buffs store and satisfies skillEntity +
// dotCarrier + Interacter + AuraHitNotifier, so tickDots runs end-to-end
// against the real store lifecycle.
type dotVictim struct {
	basic      ecs.BasicEntity
	sc         *skills.SkillComponent
	aura       *phy.Circle
	buffs      skills.Buffs
	playerHits []model.Damage
	mobHits    []mobs.Factors
	hitStyles  []model.AuraHitStyle
}

func newDotVictim() *dotVictim {
	return &dotVictim{
		basic: ecs.NewBasic(),
		sc:    skills.NewSkillComponent(false),
		aura:  phy.NewCircle(phy.VEC2F_ZERO, 1.0),
	}
}

func (v *dotVictim) Basic() ecs.BasicEntity                 { return v.basic }
func (v *dotVictim) Faction() model.Faction                 { return model.FactionHostile }
func (v *dotVictim) SkillComponent() *skills.SkillComponent { return v.sc }
func (v *dotVictim) AuraCollider() *phy.Circle              { return v.aura }
func (v *dotVictim) DueDotHits() []skills.DotHit            { return v.buffs.DueDotHits() }
func (v *dotVictim) PlayerTouches(p model.PlayerEntity, damage model.Damage) {
	v.playerHits = append(v.playerHits, damage)
}
func (v *dotVictim) MobTouches(m model.MobEntity, factors mobs.Factors) {
	v.mobHits = append(v.mobHits, factors)
}
func (v *dotVictim) NoteAuraHit(style model.AuraHitStyle) { v.hitStyles = append(v.hitStyles, style) }

// fakeMobCaster is a mob-typed caster reference for mob-sourced dots; only
// its type identity is used (tickDots type-switches on the caster).
type fakeMobCaster struct{ model.MobEntity }

func TestTickDots_PlayerSourcedDamageRidesPlayerTouches(t *testing.T) {
	sk := NewSkillSystem(phy.NewSpace(), nil)
	sk.rng = testRNG()
	caster := newFakePlayer()

	v := newDotVictim()
	v.buffs.ApplyDot(5, skills.DotBuff{HP: 4, Tags: []string{"fire"}, Interval: 2, Caster: model.PlayerEntity(caster)}, 7)

	// Real per-tick lifecycle: age at tick start, act at SkillSystem time.
	for i := 0; i < 10; i++ {
		v.buffs.Tick()
		sk.tickDots(v)
	}

	require.Len(t, v.playerHits, 3, "3 events at ages 2/4/6 within the 7-tick duration")
	for _, hit := range v.playerHits {
		assert.InDelta(t, 4, hit.HP, 1e-6, "no variance authored → exact center")
		assert.Equal(t, []string{"fire"}, hit.Tags, "damage tags reach the target's mitigation")
	}
	assert.Equal(t, []model.AuraHitStyle{model.AuraHitStyleFire, model.AuraHitStyleFire, model.AuraHitStyleFire},
		v.hitStyles, "every dot event stamps the fire hit VFX")
	assert.Empty(t, v.mobHits)
}

func TestTickDots_MobSourcedDamageRidesMobTouches(t *testing.T) {
	sk := NewSkillSystem(phy.NewSpace(), nil)
	sk.rng = testRNG()

	v := newDotVictim()
	v.buffs.ApplyDot(104, skills.DotBuff{HP: 4, Tags: []string{"fire"}, Interval: 1, Caster: &fakeMobCaster{}}, 2)

	v.buffs.Tick()
	sk.tickDots(v)

	require.Len(t, v.mobHits, 1, "mob-sourced dots use the MobTouches double dispatch")
	assert.InDelta(t, 4, v.mobHits[0].Damage, 1e-6)
	assert.Equal(t, []string{"fire"}, v.mobHits[0].DamageTags)
	assert.Empty(t, v.playerHits)
}

func TestTickDots_VarianceRollsPerEvent(t *testing.T) {
	sk := NewSkillSystem(phy.NewSpace(), nil)
	sk.rng = testRNG()
	caster := newFakePlayer()

	v := newDotVictim()
	v.buffs.ApplyDot(5, skills.DotBuff{HP: 10, Variance: 0.5, Interval: 1, Caster: model.PlayerEntity(caster)}, 100)

	for i := 0; i < 20; i++ {
		v.buffs.Tick()
		sk.tickDots(v)
	}

	require.Len(t, v.playerHits, 20)
	distinct := map[float32]bool{}
	for _, hit := range v.playerHits {
		assert.GreaterOrEqual(t, hit.HP, float32(5), "roll below the variance band")
		assert.LessOrEqual(t, hit.HP, float32(15), "roll above the variance band")
		distinct[hit.HP] = true
	}
	assert.Greater(t, len(distinct), 1, "every event rolls independently")
}

func instantDotDef() *skills.SkillDefinition {
	return &skills.SkillDefinition{
		ID: 22, Name: "Ignite", Category: skills.SkillCategoryCooldown, MaxLevel: 3,
		CooldownTicks: 300,
		Effects: []skills.EffectDef{{
			Type:           skills.EffectTypeInstantDot,
			Radius:         1.5,
			TargetsEnemies: true,
			Dot:            &skills.DotParams{HP: 6, HPPerLevel: 1.5, Tags: []string{"fire"}, TickCount: 3, Interval: 30},
		}},
	}
}

func TestCooldown_InstantDotAppliesDotOnce(t *testing.T) {
	// Ignite shape: a NovaBurst-style activation that applies the dot to
	// everything hostile in the one-shot query circle.
	target := &dotRecorder{basic: ecs.NewBasic()}
	caster, sk := cooldownCaster(spaceWithBurstTarget(int(model.LayerActionCollision), target))
	caster.sc.EquipCooldown(0, instantDotDef(), 1)
	caster.sc.RequestCooldownActivation(0)

	sk.Update(33.0)

	require.Len(t, target.dots, 1, "one activation applies the dot once")
	assert.InDelta(t, 6, target.dots[0].HP, 1e-6)
	assert.Equal(t, 3*30+1, target.ticks[0])
	assert.Equal(t, 300, caster.sc.CooldownSlots[0].CdTicks, "cooldown starts after firing")
}

// --- spawn effect (effect foundations Step 3 / mob-depth chunk 1) ---

// fakeMobRegistry is the minimal mobs.Registry the spawn site needs.
type fakeMobRegistry map[string]*mobs.MobDefinition

func (r fakeMobRegistry) Get(i mobs.MobID) (*mobs.MobDefinition, error) { panic("unused") }
func (r fakeMobRegistry) Mobs() []*mobs.MobDefinition                   { panic("unused") }
func (r fakeMobRegistry) GetByName(name string) (*mobs.MobDefinition, error) {
	if d, ok := r[name]; ok {
		return d, nil
	}
	return nil, fmt.Errorf("MobDefinition '%s' not found.", name)
}

func totemAuraDef() *skills.SkillDefinition {
	return &skills.SkillDefinition{
		ID: 106, Name: "TotemAura", Category: skills.SkillCategoryActiveAura, MaxLevel: 5,
		Effects: []skills.EffectDef{{
			Type: skills.EffectTypeDamageAura, Radius: 1.0, TickInterval: 1, TargetsEnemies: true,
			Damage: &skills.DamageParams{HP: 5, HPPerLevel: 1},
		}},
	}
}

func totemMobDef() *mobs.MobDefinition {
	return &mobs.MobDefinition{
		ID: 9, Name: "Totem", // must be a valid BerryhunterApi entity type name
		Body:    mobs.Body{Radius: 0.25, AggroRadius: 0.1},
		Factors: mobs.Factors{MaxHealth: 50, Speed: 0},
		Skills:  []mobs.MobSkill{{Def: totemAuraDef(), Level: 1}},
	}
}

func summonTotemDef() *skills.SkillDefinition {
	return &skills.SkillDefinition{
		ID: 23, Name: "SummonTotem", Category: skills.SkillCategoryCooldown, MaxLevel: 3, CooldownTicks: 450,
		Effects: []skills.EffectDef{{
			Type: skills.EffectTypeSpawn,
			Spawn: &skills.SpawnParams{
				MobName: "Totem", TTLTicks: 300, TTLTicksPerLevel: 60,
				MaxHealthPerOwnerLevel: 2, PowerPerOwnerLevel: 0.05,
			},
		}},
	}
}

// spawnTestSetup wires a level-5 player with SummonTotem L2 into a SkillSystem
// backed by the given space and a game exposing the Totem definition.
func spawnTestSetup(space *phy.Space) (*fakePlayer, *fakeGame, *SkillSystem) {
	g := newFakeGame()
	g.mobReg = fakeMobRegistry{"Totem": totemMobDef()}
	caster := newFakePlayer()
	caster.level = 5
	caster.sc.EquipCooldown(0, summonTotemDef(), 2)
	sk := NewSkillSystem(space, g)
	sk.rng = testRNG()
	sk.AddEntity(caster)
	return caster, g, sk
}

func TestCooldown_SpawnAddsOwnedAlignedMobWithTTL(t *testing.T) {
	caster, g, sk := spawnTestSetup(phy.NewSpace())
	caster.sc.RequestCooldownActivation(0)

	sk.Update(33.0)

	require.Len(t, g.added, 1, "a spawn never whiffs")
	m := g.added[0].(*mob.Mob)
	assert.Equal(t, model.FactionAligned, m.Faction(), "summon adopts its caster's faction")
	assert.Same(t, model.PlayerEntity(caster), m.Owner())
	assert.Equal(t, caster.sc.CooldownSlots[0].EffectiveCooldownTicks(), caster.sc.CooldownSlots[0].CdTicks,
		"the cooldown is consumed")

	// Owner level 5: maxHealth 50 + 4×2, power 1 + 4×0.05 (chunk-1 decision 4).
	assert.Equal(t, vitals.VitalSign(58), m.MaxHealth())
	assert.InDelta(t, 1.2, m.SummonPower(), 1e-6)

	// Summon-skill level 2: the totem's loadout follows it.
	assert.Equal(t, 2, m.SkillComponent().AuraSlots[0].Level)

	// Offset placement (decision 6): casterR 0.25 + totemR 0.25 + gap 0.3.
	dist := m.Position().Sub(caster.aura.Position()).Abs()
	assert.InDelta(t, 0.8, dist, 1e-3, "summon spawns on the offset ring, not under the avatar")

	// TTL at skill level 2 = 300 + 60 = 360 updates until expiry.
	for i := 0; i < 359; i++ {
		require.True(t, m.Update(0), "tick %d: summon still alive", i)
	}
	assert.False(t, m.Update(0), "TTL over → dies through the normal removal path")
}

func TestCooldown_SpawnPlacementSkipsBlockedSpots(t *testing.T) {
	// One blocking prop overlaps part of the offset ring; the placement probe
	// must land the summon on a free candidate.
	space := phy.NewSpace()
	blocker := phy.NewCircle(phy.Vec2f{X: 0.8, Y: 0}, 0.5)
	blocker.Shape().Layer = int(model.LayerPlayerStaticCollision)
	space.AddStaticShape(blocker)

	caster, g, sk := spawnTestSetup(space)
	caster.sc.RequestCooldownActivation(0)
	sk.Update(33.0)

	require.Len(t, g.added, 1)
	m := g.added[0].(*mob.Mob)
	assert.NotEqual(t, caster.aura.Position(), m.Position(), "free candidates exist — no fallback")
	clearance := m.Position().Sub(blocker.Position()).Abs()
	assert.Greater(t, clearance, float32(0.75), "summon body clear of the blocker (0.25 + 0.5)")
}

func TestCooldown_SpawnPlacementFallsBackToCasterPosition(t *testing.T) {
	// The entire offset ring is blocked → the summon lands on the caster
	// (decision 6 fallback: visible beats unplaceable).
	space := phy.NewSpace()
	blocker := phy.NewCircle(phy.VEC2F_ZERO, 5)
	blocker.Shape().Layer = int(model.LayerPlayerStaticCollision)
	space.AddStaticShape(blocker)

	caster, g, sk := spawnTestSetup(space)
	caster.sc.RequestCooldownActivation(0)
	sk.Update(33.0)

	require.Len(t, g.added, 1)
	assert.Equal(t, caster.aura.Position(), g.added[0].Position())
}

func TestCooldown_MobCastSpawnHasNoOwner(t *testing.T) {
	// A mob-cast spawn comes nearly free: no owner, the caster's (hostile)
	// faction, and no owner-level scaling.
	g := newFakeGame()
	g.mobReg = fakeMobRegistry{"Totem": totemMobDef()}

	casterDef := testMobDef()
	casterDef.Skills = []mobs.MobSkill{{Def: summonTotemDef(), Level: 1}}
	caster := mob.NewMob(casterDef, 0)
	caster.SetPosition(phy.Vec2f{X: 5, Y: 5})

	sk := NewSkillSystem(phy.NewSpace(), g)
	sk.rng = testRNG()
	sk.AddEntity(caster)
	sk.Update(33.0) // mob path fires ready cooldowns immediately; a spawn always hits

	require.Len(t, g.added, 1)
	m := g.added[0].(*mob.Mob)
	assert.Nil(t, m.Owner())
	assert.Equal(t, model.FactionHostile, m.Faction(), "summon adopts the casting mob's faction")
	assert.Equal(t, vitals.VitalSign(50), m.MaxHealth(), "no owner → no owner-level HP bonus")
	assert.InDelta(t, 1.0, m.SummonPower(), 1e-6)
}

// --- owned-caster attribution + power (mob-depth chunk 1) ---

// newTestTotem builds an owned, player-aligned summon around the given owner.
func newTestTotem(owner *fakePlayer) *mob.Mob {
	totem := mob.NewMob(totemMobDef(), 0)
	totem.SetFaction(model.FactionAligned)
	totem.SetOwner(owner)
	totem.SetPosition(phy.Vec2f{X: 1, Y: 1})
	return totem
}

func TestTotemAuraDamage_CreditsOwnerXPAndKillRewards(t *testing.T) {
	// The totem IS a MobEntity — without the Owned-first dispatch its damage
	// would fall into MobTouches: no XP, no kill credit, no participants.
	owner := newFakePlayer()
	totem := newTestTotem(owner)

	targetDef := testMobDef()
	targetDef.Factors.Experience = 42
	target := mob.NewMob(targetDef, 0)

	effect := damageEffect(1)
	effect.Damage = &skills.DamageParams{HP: 1000} // overkill vs. 40 HP

	applyDamageAura(totem, 1, effect, colliderSetOf(target), testRNG())

	assert.Equal(t, vitals.VitalSign(0), target.Health(), "the totem's hit lands")
	assert.Equal(t, []uint64{42}, owner.xp,
		"kill XP rides PlayerTouches(owner) — the full player reward path")
	assert.Equal(t, target.MaxHealth(), target.DamageTaken(), "floating damage number recorded")
}

func TestApplyDamageAura_OwnedCasterScalesPower(t *testing.T) {
	// Owner-level power multiplies the damage AMOUNT (chunk-1 decision 4).
	owner := newFakePlayer()
	totem := newTestTotem(owner)
	totem.SetSummonPower(1.5)

	target := &touchRecorder{}
	effect := damageEffect(1)
	effect.Damage = &skills.DamageParams{HP: 10}

	applyDamageAura(totem, 1, effect, colliderSetOf(target), testRNG())

	require.Len(t, target.touches, 1)
	assert.InDelta(t, 15, target.touches[0], 1e-6, "10 HP × power 1.5")
}

func TestApplyDotEffect_OwnedCasterScalesPower(t *testing.T) {
	// Power is frozen into the dot at application time, like the level.
	owner := newFakePlayer()
	totem := newTestTotem(owner)
	totem.SetSummonPower(1.5)

	target := &dotRecorder{basic: ecs.NewBasic()}
	applyDotEffect(totem, 106, 1, dotEffect(), colliderSetOf(target))

	require.Len(t, target.dots, 1)
	assert.InDelta(t, 7.5, target.dots[0].HP, 1e-6, "5 HP × power 1.5")
	assert.Same(t, any(totem), target.dots[0].Caster,
		"the summon stays the stored caster — the owner is resolved at tick time")
}

func TestTickDots_OwnedCasterCreditsOwner(t *testing.T) {
	// A dot whose stored caster is an owned summon replays through
	// PlayerTouches(owner) — burn damage keeps crediting the owner even
	// after the summon itself is gone.
	sk := NewSkillSystem(phy.NewSpace(), nil)
	sk.rng = testRNG()
	owner := newFakePlayer()
	totem := newTestTotem(owner)

	v := newDotVictim()
	v.buffs.ApplyDot(106, skills.DotBuff{HP: 4, Tags: []string{"fire"}, Interval: 1, Caster: totem}, 2)

	v.buffs.Tick()
	sk.tickDots(v)

	require.Len(t, v.playerHits, 1, "owned-summon dots ride the player path")
	assert.InDelta(t, 4, v.playerHits[0].HP, 1e-6)
	assert.Empty(t, v.mobHits, "not the mob double dispatch")
}

func TestTotem_KillableByHostileMobAura(t *testing.T) {
	// Decision §8.4/3: the totem is killable. Its player-layer body is what a
	// hostile aura's enemy mask matches, and the hit lands via MobTouches.
	hostile := mob.NewMob(testMobDef(), 0)
	hostile.SetPosition(phy.Vec2f{X: 1, Y: 1})

	totemDef := totemMobDef()
	totemDef.Body.CollisionLayer = int(model.LayerViewportCollision | model.LayerPlayerCollision)
	totemDef.Body.CollisionMask = int(model.LayerBorderCollision)
	totem := mob.NewMob(totemDef, 0)
	totem.SetFaction(model.FactionAligned)

	effect := damageEffect(1)
	effect.Damage = &skills.DamageParams{HP: 10}

	mask := model.AuraMaskFor(&skills.SkillDefinition{Effects: []skills.EffectDef{effect}}, model.FactionHostile)
	assert.NotZero(t, mask&totem.Bodies()[0].Shape().Layer,
		"a hostile enemy-targeting aura's mask matches the totem's player-layer body")

	applyDamageAura(hostile, 1, effect, colliderSetOf(totem), testRNG())
	assert.Equal(t, totem.MaxHealth()-10, totem.Health(), "the hostile hit damages the totem")
}
