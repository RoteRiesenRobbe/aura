package sys

// Behavior tests for SkillSystem effect application and tick-interval logic.
//
// These complement skills_test.go (entity tracking + effect math) with tests
// that exercise applyDamageAura / applyHealAura against hand-built collision
// sets, and processEntity against a real phy.Space so the accumulator and
// TickInterval behavior is pinned down — including the documented multi-effect
// interval quirk (docs/archive/plan-skill-system.md, "Known limitation").

import (
	"fmt"
	"math"
	"math/rand"
	"testing"

	"github.com/EngoEngine/ecs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/cfg"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/curve"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/factions"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/corpse"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/mob"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/vitals"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// --- test doubles ---

// touchRecorder implements model.Interacter and records PlayerTouches calls.
// It stands in for a mob-like (hostile) target of a player's damage aura.
type touchRecorder struct {
	touches    []float32 // damage HP per hit
	touchTags  [][]string
	gated      []bool            // Damage.Gated per hit (content pass C1)
	sources    []model.Combatant // Damage.Source per hit (threat attribution, chunk 3)
	crits      []bool            // Damage.Crit per hit (chunk 1)
	lifesteals []float32         // Damage.Lifesteal per hit (chunk 1)
	hitStyles  []model.AuraHitStyle
}

func (r *touchRecorder) MobTouches(m model.MobEntity, factors mobs.Factors) {}
func (r *touchRecorder) PlayerTouches(p model.PlayerEntity, damage model.Damage) {
	r.touches = append(r.touches, damage.HP)
	r.touchTags = append(r.touchTags, damage.Tags)
	r.gated = append(r.gated, damage.Gated)
	r.sources = append(r.sources, damage.Source)
	r.crits = append(r.crits, damage.Crit)
	r.lifesteals = append(r.lifesteals, damage.Lifesteal)
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
	body            *phy.Circle // main physical body (Bodies()[0], player layer)
	god             bool
	poolFactor      float32
	maxHealth       vitals.VitalSign
	level           uint32
	xp              []uint64
	healedBy        []model.PlayerEntity
	healReceived    vitals.VitalSign
	resists         []appliedResist
	shields         []appliedShield
	hots            []appliedHot
	inCombat        bool                 // reported by InCombat (chunk 1 combat-gate tests)
	combatActions   int                  // NoteCombatAction call count (chunk 1)
	client          model.Client         // recall reads Client().UUID() (chunk 4)
	rejections      []rejectedActivation // NoteActivationRejected calls (chunk 4)
	lastMoveDir     phy.Vec2f            // dash aim source (chunk 5)
	buffs           skills.Buffs         // real store for tick_rate (chunk 6); zero value = factor 1.0
	powerScale      float32              // f(character level) (C0); newFakePlayer sets neutral 1
	// The per-tick interactable stamp (chunk 3b-i). Nothing clears these
	// between ticks the way ResetTickNumbers does for a real player — the
	// clearing is pinned in model/player, these doubles only need to carry the
	// value the InteractionSystem stamped.
	interactableID     uint64
	interactableDistSq float32
	// The conversation session (chunk 3b-ii). ⚑ These are NOT per-tick like the
	// two above: a session survives ticks and is ended only by an explicit
	// condition, which is precisely what the end-condition tests assert on.
	conversingWith uint64
	conversation   *model.Conversation
	conf            cfg.PlayerConfig     // zero value = no base crit (§4.3 v2); tests set CritChance explicitly
}

// appliedResist records one ApplyResist call on a test double.
type appliedResist struct {
	source skills.SkillID
	tags   []string
	factor float32
	ticks  int
}

// appliedShield records one ApplyShield call on a test double.
type appliedShield struct {
	source skills.SkillID
	hp     float32
	ticks  int
}

// appliedHot records one ApplyHot call on a test double.
type appliedHot struct {
	source skills.SkillID
	hot    skills.HotBuff
	ticks  int
}

func (f *fakePlayer) Basic() ecs.BasicEntity                 { return f.basic }
func (f *fakePlayer) Faction() model.Faction                 { return model.FactionAligned }
func (f *fakePlayer) SkillComponent() *skills.SkillComponent { return f.sc }
func (f *fakePlayer) Config() *cfg.PlayerConfig              { return &f.conf }
func (f *fakePlayer) AuraCollider() *phy.Circle              { return f.aura }
func (f *fakePlayer) VitalSigns() *model.PlayerVitalSigns    { return &f.vitalSigns }
func (f *fakePlayer) StatusEffects() *model.StatusEffects    { return &f.statusEffects }
func (f *fakePlayer) PoolFactor() float32                    { return f.poolFactor }
func (f *fakePlayer) PowerScale() float32                    { return f.powerScale }
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
func (f *fakePlayer) Heal(hp uint32) vitals.VitalSign {
	before := f.vitalSigns.Health
	f.vitalSigns.Health = before.AddCapped(hp, f.maxHealth)
	healed := f.vitalSigns.Health - before
	f.NoteHealReceived(healed)
	return healed
}
func (f *fakePlayer) Radius() float32            { return 0.25 }
func (f *fakePlayer) Position() phy.Vec2f        { return f.aura.Position() }
func (f *fakePlayer) LastMoveDir() phy.Vec2f     { return f.lastMoveDir }
func (f *fakePlayer) SetLastMoveDir(v phy.Vec2f) { f.lastMoveDir = v }
func (f *fakePlayer) Progression() model.PlayerProgression {
	return model.PlayerProgression{Level: f.level}
}
func (f *fakePlayer) AddExperience(xp uint64)             { f.xp = append(f.xp, xp) }
func (f *fakePlayer) RecentHealers() []model.PlayerEntity { return nil }
func (f *fakePlayer) ApplyRecipeCascade()                 {}

func (f *fakePlayer) ApplyResist(source skills.SkillID, tags []string, factor float32, ticks int) {
	f.resists = append(f.resists, appliedResist{source, tags, factor, ticks})
}
func (f *fakePlayer) ApplyShield(source skills.SkillID, hp float32, ticks int) {
	f.shields = append(f.shields, appliedShield{source, hp, ticks})
}
func (f *fakePlayer) ApplyHot(source skills.SkillID, hot skills.HotBuff, ticks int) {
	f.hots = append(f.hots, appliedHot{source, hot, ticks})
}
func (f *fakePlayer) ApplySpeed(source skills.SkillID, factor float32, ticks int) {
	f.buffs.ApplySpeed(source, factor, ticks)
}
func (f *fakePlayer) MovementFactor() float32 { return f.buffs.MovementFactor() }
func (f *fakePlayer) ApplyTickRate(source skills.SkillID, factor float32, ticks int) {
	f.buffs.ApplyTickRate(source, factor, ticks)
}
func (f *fakePlayer) TickRateFactor() float32 { return f.buffs.TickRateFactor() }
func (f *fakePlayer) InCombat() bool          { return f.inCombat }
func (f *fakePlayer) NoteCombatAction()       { f.combatActions++ }

func (f *fakePlayer) Client() model.Client    { return f.client }
func (f *fakePlayer) SetPosition(v phy.Vec2f) { f.aura.SetPosition(v) }
func (f *fakePlayer) NoteActivationRejected(id skills.SkillID, reason model.ActivationRejection) {
	f.rejections = append(f.rejections, rejectedActivation{id, reason})
}

func (f *fakePlayer) Interactable() uint64 { return f.interactableID }

// NoteInteractable mirrors (*player).NoteInteractable's nearest-wins rule (L17)
// so the system tests exercise the real tie-break. The rule itself is pinned on
// the real type in model/player; what this double lets the system tests catch
// is the InteractionSystem handing it the WRONG distance.
func (f *fakePlayer) NoteInteractable(id uint64, distSq float32) {
	if f.interactableID != 0 && distSq >= f.interactableDistSq {
		return
	}
	f.interactableID = id
	f.interactableDistSq = distSq
}

// The conversation session (chunk 3b-ii), mirroring (*player)'s: ending it drops
// the tree with it, so a stale panel can never outlive its conversation.
func (f *fakePlayer) ConversingWith() uint64 { return f.conversingWith }
func (f *fakePlayer) SetConversingWith(id uint64) {
	f.conversingWith = id
	if id == 0 {
		f.conversation = nil
	}
}
func (f *fakePlayer) Conversation() *model.Conversation     { return f.conversation }
func (f *fakePlayer) SetConversation(c *model.Conversation) { f.conversation = c }

// rejectedActivation records one NoteActivationRejected call (chunk 4).
type rejectedActivation struct {
	skill  skills.SkillID
	reason model.ActivationRejection
}

// Bodies mirrors the real player: Bodies()[0] is the main physical body on
// the player layer (healerTargetable reads its layer, chunk 2).
func (f *fakePlayer) Bodies() model.Bodies { return model.Bodies{f.body} }

var (
	_ skillEntity        = (*fakePlayer)(nil)
	_ model.PlayerEntity = (*fakePlayer)(nil)
	_ model.Healable     = (*fakePlayer)(nil)
	_ tickRateBuffed     = (*fakePlayer)(nil)
)

func newFakePlayer() *fakePlayer {
	return &fakePlayer{
		basic:           ecs.NewBasic(),
		sc:              skills.NewSkillComponent(true),
		vitalSigns:      model.PlayerVitalSigns{Health: 100}, // full = maxHealth (absolute HP, item 11)
		statusEffects:   model.NewStatusEffects(),
		poolFactor:      1.0,
		maxHealth:       100,
		level:           1,
		powerScale:      1.0, // f(1) — the un-inflated baseline (C0)
		// Non-nil so applyDamageAura/applyHealAura can read the caster position
		// for selector ordering; tests that need a real space overwrite it.
		aura:   phy.NewCircle(phy.VEC2F_ZERO, 1.0),
		body:   playerLayerBody(),
		client: newFakeClient(),
	}
}

// playerLayerBody builds a main-body circle on the real player's body layer
// (player.go:41) so healerTargetable reads a player-shaped Bodies()[0].
func playerLayerBody() *phy.Circle {
	b := phy.NewCircle(phy.VEC2F_ZERO, 0.25)
	b.Shape().Layer = int(model.LayerViewportCollision | model.LayerPlayerCollision)
	return b
}

// playerTouchRecorder is a PlayerEntity that also implements Interacter. Used
// to prove the no-friendly-fire rule: the isPlayer check must skip it before
// the Interacter path is reached.
type playerTouchRecorder struct {
	model.PlayerEntity
	basic ecs.BasicEntity
	rec   touchRecorder
}

func (p *playerTouchRecorder) Basic() ecs.BasicEntity                             { return p.basic }
func (p *playerTouchRecorder) Faction() model.Faction                             { return model.FactionAligned }
func (p *playerTouchRecorder) MobTouches(m model.MobEntity, factors mobs.Factors) {}
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
		TargetsEnemies: true, // mirrors the real Damage JSON
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

// testSkillSystem builds a SkillSystem with a seeded rng for calling
// system-method effects (heal aura) directly; no game ref needed.
func testSkillSystem() *SkillSystem {
	s := NewSkillSystem(phy.NewSpace(), nil)
	s.rng = testRNG()
	return s
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

func TestApplyDamageAura_CarriesGatedFlag(t *testing.T) {
	// Gated damage tags (content pass C1): the effect's opt-in flag rides the
	// Damage payload (player path) and the Factors payload (mob path), so the
	// target's takeDamage can close the gate on unauthored resistances.
	caster := newFakePlayer()
	target := &touchRecorder{}
	effect := damageEffect(1)
	effect.Damage.Tags = []string{"turnip"}
	effect.Damage.Gated = true

	applyDamageAura(caster, 1, effect, colliderSetOf(target), testRNG())

	require.Len(t, target.gated, 1)
	assert.True(t, target.gated[0])

	mobCaster := newFakeMob()
	mobTarget := &mobTouchRecorder{}

	applyDamageAura(mobCaster, 1, effect, colliderSetOf(mobTarget), testRNG())

	require.Len(t, mobTarget.factors, 1)
	assert.True(t, mobTarget.factors[0].Gated)
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

	testSkillSystem().applyHealAura(caster, 1, healEffect(), set)

	assert.Equal(t, start.Add(10), ally.vitalSigns.Health)
}

func TestApplyHealAura_NotesHealerOnTarget(t *testing.T) {
	// Participation XP (roadmap item 10): a successful heal registers the
	// caster as a recent healer on the target, so mob kills the target
	// participates in also reward the healer.
	caster := newFakePlayer()
	ally := newFakePlayer()
	ally.vitalSigns.Health = 50

	testSkillSystem().applyHealAura(caster, 1, healEffect(), colliderSetOf(model.PlayerEntity(ally)))

	require.Len(t, ally.healedBy, 1)
	assert.Equal(t, model.PlayerEntity(caster), ally.healedBy[0])
}

func TestApplyHealAura_FullHealthTargetNotesNothing(t *testing.T) {
	caster := newFakePlayer()
	ally := newFakePlayer() // full health — no heal happens

	testSkillSystem().applyHealAura(caster, 1, healEffect(), colliderSetOf(model.PlayerEntity(ally)))

	assert.Empty(t, ally.healedBy)
}

func TestApplyHealAura_SkipsAllyAtFullHealth_NoSelfDamage(t *testing.T) {
	caster := newFakePlayer()
	ally := newFakePlayer() // full health
	set := colliderSetOf(model.PlayerEntity(ally))

	testSkillSystem().applyHealAura(caster, 1, healEffect(), set)

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

	testSkillSystem().applyHealAura(caster, 1, healEffect(), set)

	assert.Equal(t, start, caster.vitalSigns.Health,
		"the caster's own collider entry must neither heal nor cost anything")
}

func TestApplyHealAura_SelfDamageOnSuccessfulHeal(t *testing.T) {
	caster := newFakePlayer()
	ally := newFakePlayer()
	ally.vitalSigns.Health = 50
	set := colliderSetOf(model.PlayerEntity(ally))

	testSkillSystem().applyHealAura(caster, 1, healEffect(), set)

	assert.Equal(t, vitals.VitalSign(98), caster.vitalSigns.Health)
	assert.Contains(t, caster.statusEffects.Effects(), model.StatusEffectDamagedAmbient)
}

func TestApplyHealAura_SelfDamageIsFlatHP(t *testing.T) {
	caster := newFakePlayer()
	caster.poolFactor = 2.0 // no longer affects the self-cost (item 11 Phase 1)
	ally := newFakePlayer()
	ally.vitalSigns.Health = 50
	set := colliderSetOf(model.PlayerEntity(ally))

	testSkillSystem().applyHealAura(caster, 1, healEffect(), set)

	assert.Equal(t, vitals.VitalSign(98), caster.vitalSigns.Health,
		"self-damage is a flat HP cost, independent of PoolFactor")
}

func TestApplyHealAura_GodModePaysNoSelfDamage(t *testing.T) {
	caster := newFakePlayer()
	caster.god = true
	ally := newFakePlayer()
	ally.vitalSigns.Health = 50
	start := ally.vitalSigns.Health
	set := colliderSetOf(model.PlayerEntity(ally))

	testSkillSystem().applyHealAura(caster, 1, healEffect(), set)

	assert.Equal(t, start.Add(10), ally.vitalSigns.Health, "ally is still healed")
	assert.Equal(t, caster.MaxHealth(), caster.vitalSigns.Health, "god pays nothing")
}

// --- in-combat gate: supporting an engaged ally (atmosphere & recovery chunk 1) ---

// Healing an ally who is itself in combat puts the healer in combat too.
func TestApplyHealAura_HealingEngagedAlly_EntersCombat(t *testing.T) {
	caster := newFakePlayer()
	ally := newFakePlayer()
	ally.vitalSigns.Health = 50
	ally.inCombat = true
	set := colliderSetOf(model.PlayerEntity(ally))

	testSkillSystem().applyHealAura(caster, 1, healEffect(), set)

	assert.Equal(t, 1, caster.combatActions, "supporting an engaged ally enters combat")
}

// Healing a safe ally (out of combat) does not drag the healer into combat —
// out-of-combat attrition healing stays out of combat.
func TestApplyHealAura_HealingSafeAlly_StaysOutOfCombat(t *testing.T) {
	caster := newFakePlayer()
	ally := newFakePlayer()
	ally.vitalSigns.Health = 50
	ally.inCombat = false
	set := colliderSetOf(model.PlayerEntity(ally))

	testSkillSystem().applyHealAura(caster, 1, healEffect(), set)

	require.Equal(t, vitals.VitalSign(60), ally.vitalSigns.Health, "the ally was actually healed")
	assert.Equal(t, 0, caster.combatActions, "healing a safe ally is not a combat action")
}

// --- processEntity through a real phy.Space ---

// spaceWithAuraAndTarget wires an aura sensor and a target circle at the same
// position into a phy.Space and resolves one physics step, so the aura's
// collision set is populated exactly like in the running game.
func spaceWithAuraAndTarget(t *testing.T, targetUserData any) *phy.Circle {
	t.Helper()
	return spaceWithAuraAndTargetAt(t, phy.VEC2F_ZERO, targetUserData)
}

// spaceWithAuraAndTargetAt is spaceWithAuraAndTarget with the target placed at
// an explicit position inside the sensor (per-effect range-check tests).
func spaceWithAuraAndTargetAt(t *testing.T, targetPos phy.Vec2f, targetUserData any) *phy.Circle {
	t.Helper()

	aura := phy.NewCircle(phy.VEC2F_ZERO, 1.0)
	aura.Shape().IsSensor = true
	aura.Shape().Layer = int(model.LayerNoneCollision)
	aura.Shape().Mask = int(model.LayerPlayerCollision | model.LayerActionCollision)

	target := phy.NewCircle(targetPos, 0.25)
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

// --- per-effect range check (atmosphere & recovery chunk 2) ---

func TestProcessEntity_SubMaxRadiusEffectSkipsMidSensorTarget(t *testing.T) {
	// A multi-effect aura with unequal radii: the sensor sizes to the max
	// (1.0), so a target at 0.6 sits inside the sensor but outside the small
	// effect's reach (0.3 + body 0.25 = 0.55). Only the large effect may land —
	// the campfire scenario (small heal + chunk-3 large light).
	target := &touchRecorder{}
	caster := newFakePlayer()
	caster.aura = spaceWithAuraAndTargetAt(t, phy.Vec2f{X: 0.6, Y: 0}, target)

	large := skills.EffectDef{
		Type: skills.EffectTypeDamageAura, TargetsEnemies: true, Radius: 1.0, TickInterval: 1,
		Damage: &skills.DamageParams{HP: 10},
	}
	small := skills.EffectDef{
		Type: skills.EffectTypeDamageAura, TargetsEnemies: true, Radius: 0.3, TickInterval: 1,
		Damage: &skills.DamageParams{HP: 999},
	}
	def := &skills.SkillDefinition{
		ID: 99, Name: "TestAura", Category: skills.SkillCategoryActiveAura, MaxLevel: 5,
		Effects: []skills.EffectDef{large, small},
	}
	caster.sc.EquipAura(0, def, 1)
	caster.sc.SetActiveAura(0)

	testSkillSystem().processEntity(caster)

	require.Len(t, target.touches, 1, "only the large effect reaches the mid-sensor target")
	assert.InDelta(t, 10, target.touches[0], 1e-6, "the hit is the large effect's, not the over-reaching small one")
}

// --- mob casters (Phase 6.1) ---

// mobTouchRecorder implements model.Interacter and records MobTouches calls —
// it stands in for a player or structure hit by a mob's aura.
type mobTouchRecorder struct {
	factors   []mobs.Factors
	hitStyles []model.AuraHitStyle
}

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
	faction       model.Faction
	healthRatio   float32
	powerScale    float32 // tier+baseline scale f(curveLevel) (C0); newFakeMob sets neutral 1
}

func (f *fakeMob) Basic() ecs.BasicEntity                 { return f.basic }
func (f *fakeMob) Faction() model.Faction                 { return f.faction }
func (f *fakeMob) SkillComponent() *skills.SkillComponent { return f.sc }
func (f *fakeMob) AuraCollider() *phy.Circle              { return f.aura }
func (f *fakeMob) StatusEffects() *model.StatusEffects    { return &f.statusEffects }
func (f *fakeMob) HealthRatio() float32                   { return f.healthRatio }
func (f *fakeMob) PowerScale() float32                    { return f.powerScale }

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
		basic:       ecs.NewBasic(),
		sc:          sc,
		aura:        phy.NewCircle(phy.VEC2F_ZERO, 1.0),
		faction:     model.FactionHostile,
		healthRatio: 1,
		powerScale:  1, // f(1) — baseline tier scale (C0)
	}
}

// fakeHealableMob is a minimal model.Healable target double (chunk 8): a mob
// that can BE healed, with a settable faction and wounded resource. It exists
// to prove a mob heal aura reaches a mob's own health pool (not player vitals)
// and never touches player reward paths.
type fakeHealableMob struct {
	basic        ecs.BasicEntity
	faction      model.Faction
	health       vitals.VitalSign
	maxHealth    vitals.VitalSign
	healReceived vitals.VitalSign
	inCombat     bool // reported by InCombat (chunk 1: heal-an-engaged-ally test)
}

func (f *fakeHealableMob) Basic() ecs.BasicEntity { return f.basic }
func (f *fakeHealableMob) Faction() model.Faction { return f.faction }
func (f *fakeHealableMob) Position() phy.Vec2f    { return phy.VEC2F_ZERO }
func (f *fakeHealableMob) Radius() float32        { return 0.3 }
func (f *fakeHealableMob) HealthRatio() float32 {
	if f.maxHealth == 0 {
		return 0
	}
	return float32(f.health) / float32(f.maxHealth)
}
func (f *fakeHealableMob) Heal(hp uint32) vitals.VitalSign {
	before := f.health
	f.health = before.AddCapped(hp, f.maxHealth)
	healed := f.health - before
	f.healReceived += healed
	return healed
}
func (f *fakeHealableMob) InCombat() bool { return f.inCombat }

var _ model.Healable = (*fakeHealableMob)(nil)

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

// --- in-combat gate: dealing harm (atmosphere & recovery chunk 1) ---

// A player whose damage aura lands on a hostile enters combat.
func TestApplyDamageAura_PlayerCaster_EntersCombatOnHit(t *testing.T) {
	caster := newFakePlayer()
	target := &touchRecorder{} // FactionHostile
	effect := skills.EffectDef{
		Type:           skills.EffectTypeDamageAura,
		TargetsEnemies: true,
		Damage:         &skills.DamageParams{HP: 0.01},
	}

	applyDamageAura(caster, 1, effect, colliderSetOf(target), testRNG())

	require.NotEmpty(t, target.touches, "the hostile was hit")
	assert.Equal(t, 1, caster.combatActions, "dealing harm enters combat")
}

// A player whose damage aura connects with nothing (no eligible target) stays
// out of combat — combat is entered on a landed hit, not on merely casting.
func TestApplyDamageAura_PlayerCaster_NoHitNoCombat(t *testing.T) {
	caster := newFakePlayer()
	target := &touchRecorder{} // FactionHostile
	effect := skills.EffectDef{
		Type:           skills.EffectTypeDamageAura,
		TargetsEnemies: false, // hits nothing
		Damage:         &skills.DamageParams{HP: 0.01},
	}

	applyDamageAura(caster, 1, effect, colliderSetOf(target), testRNG())

	assert.Equal(t, 0, caster.combatActions, "a cast that hits nothing is not a combat action")
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
	mobHits []mobs.Factors
}

func (r *structureRecorder) MobTouches(m model.MobEntity, factors mobs.Factors) {
	r.mobHits = append(r.mobHits, factors)
}
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

// --- friendly-to-players factions (§9 lift 6, content pass C5) ---

// friendlyTouchRecorder is a mob-like Interacter on a friendly-to-players
// content faction (the Human Army shape): different faction than everyone in
// these tests, harm-proof to the aligned side only.
type friendlyTouchRecorder struct {
	touchRecorder
	mobFactors []mobs.Factors
}

func (r *friendlyTouchRecorder) Faction() model.Faction  { return model.Faction(2) }
func (r *friendlyTouchRecorder) FriendlyToPlayers() bool { return true }
func (r *friendlyTouchRecorder) MobTouches(m model.MobEntity, factors mobs.Factors) {
	r.mobFactors = append(r.mobFactors, factors)
}

var _ model.PlayerFriendly = (*friendlyTouchRecorder)(nil)

// gatedAlignedMob is an owned-summon-shaped caster: aligned faction with a
// permissive HostilityGate (Align gives real summons an all-others aggro
// set). The friendly check must fire BEFORE the gate for the aligned side.
type gatedAlignedMob struct{ fakeMob }

func (m *gatedAlignedMob) MayHarm(f model.Faction, id uint64) bool { return true }

var _ model.HostilityGate = (*gatedAlignedMob)(nil)

func TestApplyDamageAura_PlayerCaster_SkipsFriendlyFaction(t *testing.T) {
	// The adopted §9 lift 6 ideal: player damage skips a friendly-to-players
	// faction entirely — no hit, no threat, no retaliation ever.
	caster := newFakePlayer()
	army := &friendlyTouchRecorder{}

	applyDamageAura(caster, 1, damageEffect(1), colliderSetOf(army), testRNG())

	assert.Empty(t, army.touches, "an aligned caster must never harm a friendly faction")
}

func TestApplyDamageAura_AlignedSummonCaster_SkipsFriendlyFaction(t *testing.T) {
	// Owned summons are aligned too — their permissive gate must not bypass
	// the friendly check (damage credits the owner; the flag would leak).
	caster := &gatedAlignedMob{fakeMob: *newFakeMob()}
	caster.faction = model.FactionAligned
	army := &friendlyTouchRecorder{}

	applyDamageAura(caster, 1, damageEffect(1), colliderSetOf(army), testRNG())

	assert.Empty(t, army.mobFactors, "aligned summons must never harm a friendly faction")
}

func TestApplyDamageAura_MobCaster_StillHitsFriendlyFaction(t *testing.T) {
	// Friendly is aligned-relative only: a non-aligned caster (the orc side of
	// the war) fights the friendly faction through the normal hostility rules.
	caster := newFakeMob() // FactionHostile, ungated double
	army := &friendlyTouchRecorder{}

	applyDamageAura(caster, 1, damageEffect(1), colliderSetOf(army), testRNG())

	assert.Len(t, army.mobFactors, 1, "orcs still fight the player-friendly faction")
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

	assert.Equal(t, int(model.LayerCombatants|model.LayerPlaceableCollision),
		caster.aura.Shape().Mask,
		"both combatant layers since chunk 6.6 — eligibility does the faction check")
}

// TestSkillSystem_EndToEnd_RealMobDamagesPlayerTarget replaces the retired
// mob.Update characterization test: a real Mob built from a definition with a
// skill loadout, wired through a real phy.Space, damages a player-layer
// target with exactly the skill's damage via MobTouches.
func TestSkillSystem_EndToEnd_RealMobDamagesPlayerTarget(t *testing.T) {
	def := &mobs.MobDefinition{
		ID:   1,
		Name: "Dodo",
		// A structure so the aura runs without an aggro target — the test is
		// about aura application, not acquisition.
		Role: mobs.RoleStructure,
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
	m := mob.NewMob(def, 0, nil)

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
// a shorter-interval effect re-fire every tick). Paladin relies on this to
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

// TestSkillSystem_TickRateHasteFiresFaster pins the caster-aware firing loop
// (skill-vocab chunk 6): a tick_rate haste buff on the caster shortens the
// effective interval end-to-end, so an interval-4 aura under a 0.5 haste fires
// on every 2nd tick instead of every 4th.
func TestSkillSystem_TickRateHasteFiresFaster(t *testing.T) {
	caster, target := activeAuraPlayer(t, damageEffect(4))
	caster.ApplyTickRate(50, 0.5, 1000) // long-lived haste
	sk := NewSkillSystem(phy.NewSpace(), nil)
	sk.AddEntity(caster)

	var touchesPerTick []int
	for i := 0; i < 6; i++ {
		before := len(target.touches)
		sk.Update(33.0)
		touchesPerTick = append(touchesPerTick, len(target.touches)-before)
	}

	assert.Equal(t, []int{0, 1, 0, 1, 0, 1}, touchesPerTick,
		"interval 4 × 0.5 haste = effective 2, fires on ticks 2,4,6")
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
		ID: 2, Name: "Heal", Category: skills.SkillCategoryActiveAura, MaxLevel: 5,
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
			BaseMaxHealth: 1000,
			Resistances:   map[string]float32{"fire": 0.5},
		},
		Body: mobs.Body{Radius: 0.3, AggroRadius: 2.0},
	}
	m := mob.NewMob(def, 0, nil)

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

	s := testSkillSystem()
	distinct := map[vitals.VitalSign]bool{}
	for i := 0; i < 20; i++ {
		ally := newFakePlayer()
		ally.maxHealth = 1000
		ally.vitalSigns.Health = 100

		s.applyHealAura(caster, 1, effect, colliderSetOf(model.PlayerEntity(ally)))

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
		ID: 21, Name: "FirstAid", Category: skills.SkillCategoryCooldown, MaxLevel: 3, CooldownTicks: 900,
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

	caster := &fakeMob{basic: ecs.NewBasic(), sc: skills.NewSkillComponent(false), statusEffects: model.NewStatusEffects(), powerScale: 1}
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
		ID: 21, Name: "FirstAid", Category: skills.SkillCategoryCooldown, MaxLevel: 3, CooldownTicks: 900,
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
		ID: 21, Name: "FirstAid", Category: skills.SkillCategoryCooldown, MaxLevel: 3, CooldownTicks: 900,
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

// slowRecorder implements the slowable interface for slow_aura tests. It is
// Factioned because slow is a harmful effect and now runs through the shared
// eligibility seam like every other one — an unfactioned target is no longer
// a legal target of anything.
type slowRecorder struct {
	basic     ecs.BasicEntity
	faction   model.Faction
	friendly  bool
	sources   []skills.SkillID
	fractions []float32
	ticks     []int
}

// newSlowTarget builds a hostile slowable — the ordinary target of a player's
// slow aura.
func newSlowTarget() *slowRecorder {
	return &slowRecorder{basic: ecs.NewBasic(), faction: model.FactionHostile}
}

func (r *slowRecorder) Basic() ecs.BasicEntity  { return r.basic }
func (r *slowRecorder) Faction() model.Faction  { return r.faction }
func (r *slowRecorder) FriendlyToPlayers() bool { return r.friendly }
func (r *slowRecorder) ApplySlow(source skills.SkillID, fraction float32, ticks int) {
	r.sources = append(r.sources, source)
	r.fractions = append(r.fractions, fraction)
	r.ticks = append(r.ticks, ticks)
}

func TestSlowAura_AppliesLevelScaledSlow(t *testing.T) {
	target := newSlowTarget()
	set := colliderSetOf(target)

	effect := skills.EffectDef{
		Type:           skills.EffectTypeSlowAura,
		TargetsEnemies: true,
		TickInterval:   1,
		Slow:           &skills.SlowParams{Fraction: 0.1, FractionPerLevel: 0.1},
	}

	applySlowAura(newFakePlayer(), 4, 3, effect, set)

	require.Len(t, target.fractions, 1)
	assert.InDelta(t, 0.3, target.fractions[0], 1e-6) // 0.1 + 2×0.1
	assert.Equal(t, skills.SkillID(4), target.sources[0], "slow is keyed by its source skill in the buff store")
	assert.Equal(t, 2, target.ticks[0], "aura lifetime convention: tick interval + 1")
}

func TestSlowAura_SkipsNonSlowableTargets(t *testing.T) {
	// A player (no ApplySlow) in the collision set must simply be skipped.
	set := colliderSetOf(&touchRecorder{})

	effect := skills.EffectDef{Type: skills.EffectTypeSlowAura, TargetsEnemies: true, TickInterval: 1, Slow: &skills.SlowParams{Fraction: 0.1}}

	assert.NotPanics(t, func() { applySlowAura(newFakePlayer(), 4, 1, effect, set) })
}

// A player casting a slow that lands on a slowable hostile enters combat
// (CC-a-hostile direction, atmosphere & recovery chunk 1).
func TestSlowAura_CasterEntersCombatOnSlow(t *testing.T) {
	caster := newFakePlayer()
	target := newSlowTarget()
	effect := skills.EffectDef{
		Type:           skills.EffectTypeSlowAura,
		TargetsEnemies: true,
		TickInterval:   1,
		Slow:           &skills.SlowParams{Fraction: 0.1},
	}

	applySlowAura(caster, 4, 1, effect, colliderSetOf(target))

	require.Len(t, target.fractions, 1, "the target was slowed")
	assert.Equal(t, 1, caster.combatActions, "CC'ing a hostile enters combat")
}

// --- slow_aura eligibility (backlog §25 C) ---
//
// applySlowAura used to iterate the raw collision set and slow anything
// implementing slowable, with no faction check and no mayHarm gate — the only
// aura path that skipped both. The sensor mask is LayerCombatants, which does
// not discriminate by faction, so the targetsAllies:false authored on all
// three live slow skills (Slow, Suppression, Warbanner) was silently ignored
// and a player's slow also hit friendly NPCs and their own summons.

func TestSlowAura_SkipsSameFactionWhenAlliesNotTargeted(t *testing.T) {
	caster := newFakePlayer() // FactionAligned
	ally := newSlowTarget()
	ally.faction = model.FactionAligned // a player-owned summon

	effect := skills.EffectDef{
		Type:           skills.EffectTypeSlowAura,
		TargetsEnemies: true,
		TargetsAllies:  false,
		TickInterval:   1,
		Slow:           &skills.SlowParams{Fraction: 0.5},
	}

	applySlowAura(caster, 4, 1, effect, colliderSetOf(ally))

	assert.Empty(t, ally.fractions, "targetsAllies:false must exclude same-faction targets")
	assert.Zero(t, caster.combatActions, "slowing nobody is not a combat action")
}

func TestSlowAura_SkipsPlayerFriendlyFaction(t *testing.T) {
	caster := newFakePlayer() // FactionAligned
	npc := newSlowTarget()    // different faction…
	npc.friendly = true       // …but declared friendly to players

	effect := skills.EffectDef{
		Type:           skills.EffectTypeSlowAura,
		TargetsEnemies: true,
		TickInterval:   1,
		Slow:           &skills.SlowParams{Fraction: 0.5},
	}

	applySlowAura(caster, 4, 1, effect, colliderSetOf(npc))

	assert.Empty(t, npc.fractions, "the aligned side can never harm a player-friendly faction")
}

func TestSlowAura_SkipsUnfactionedTargets(t *testing.T) {
	// Structures/resources have no allegiance and are reached only through
	// their dedicated paths — never through a flag-gated harmful effect.
	set := colliderSetOf(&struct {
		slowable
	}{})

	effect := skills.EffectDef{
		Type:           skills.EffectTypeSlowAura,
		TargetsEnemies: true,
		TickInterval:   1,
		Slow:           &skills.SlowParams{Fraction: 0.5},
	}

	assert.NotPanics(t, func() { applySlowAura(newFakePlayer(), 4, 1, effect, set) })
}

func TestSlowAura_MobCasterDoesNotSlowOwnFaction(t *testing.T) {
	// The headline risk the backlog recorded for this gap: the day a mob slow
	// aura is authored, it would slow its own faction.
	caster := newFakeMob()         // FactionHostile
	sameFaction := newSlowTarget() // also FactionHostile

	effect := skills.EffectDef{
		Type:           skills.EffectTypeSlowAura,
		TargetsEnemies: true,
		TargetsAllies:  false,
		TickInterval:   1,
		Slow:           &skills.SlowParams{Fraction: 0.5},
	}

	applySlowAura(caster, 4, 1, effect, colliderSetOf(sameFaction))

	assert.Empty(t, sameFaction.fractions, "a mob must not slow its own faction")
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

// --- applyShieldAura / instant_shield (plan-skill-vocab chunk 2) ---

// shieldTargetRecorder is a PlayerEntity ally that records ApplyShield calls.
type shieldTargetRecorder struct {
	model.PlayerEntity
	basic   ecs.BasicEntity
	shields []appliedShield
}

func (r *shieldTargetRecorder) Basic() ecs.BasicEntity { return r.basic }
func (r *shieldTargetRecorder) Faction() model.Faction { return model.FactionAligned }
func (r *shieldTargetRecorder) ApplyShield(source skills.SkillID, hp float32, ticks int) {
	r.shields = append(r.shields, appliedShield{source, hp, ticks})
}

func shieldEffect() skills.EffectDef {
	return skills.EffectDef{
		Type:          skills.EffectTypeShieldAura,
		TargetsAllies: true,
		TickInterval:  20,
		Shield:        &skills.ShieldParams{HP: 20, HPPerLevel: 5},
	}
}

func TestApplyShieldAura_BuffsAlliesWithLevelScaledPool(t *testing.T) {
	caster := newFakePlayer()
	ally := &shieldTargetRecorder{basic: ecs.NewBasic()}

	applyShieldAura(caster, 27, 2, shieldEffect(), colliderSetOf(ally))

	require.Len(t, ally.shields, 1)
	got := ally.shields[0]
	assert.Equal(t, skills.SkillID(27), got.source)
	assert.InDelta(t, 25, got.hp, 1e-6, "level 2 = 20 + 1×5")
	assert.Equal(t, 21, got.ticks, "lifetime = tick interval + 1 sustains any cadence")

	assert.Empty(t, caster.shields, "no self-buff without targetsSelf")
}

func TestApplyShieldAura_TargetsSelfIncludesCaster(t *testing.T) {
	caster := newFakePlayer()
	ally := &shieldTargetRecorder{basic: ecs.NewBasic()}
	effect := shieldEffect()
	effect.Shield.TargetsSelf = true

	applyShieldAura(caster, 27, 1, effect, colliderSetOf(ally))

	require.Len(t, caster.shields, 1, "targetsSelf buffs the caster")
	assert.InDelta(t, 20, caster.shields[0].hp, 1e-6)
	require.Len(t, ally.shields, 1, "allies in range are buffed as well")
}

func TestApplyShieldAura_RespectsTargetCap(t *testing.T) {
	caster := newFakePlayer()
	a := &shieldTargetRecorder{basic: ecs.NewBasic()}
	b := &shieldTargetRecorder{basic: ecs.NewBasic()}
	effect := shieldEffect()
	effect.MaxTargets = 1

	applyShieldAura(caster, 27, 1, effect, colliderSetOf(a, b))

	assert.Equal(t, 1, len(a.shields)+len(b.shields), "the cap limits buffed allies")
}

func barrierDef() *skills.SkillDefinition {
	return &skills.SkillDefinition{
		ID: 27, Name: "Barrier", Category: skills.SkillCategoryCooldown, MaxLevel: 3,
		CooldownTicks: 300,
		Effects: []skills.EffectDef{{
			Type:          skills.EffectTypeInstantShield,
			Radius:        1.5,
			TargetsAllies: true,
			Shield:        &skills.ShieldParams{HP: 20, HPPerLevel: 5, DurationTicks: 300, TargetsSelf: true},
		}},
	}
}

func TestCooldown_InstantShieldBuffsSelfAndAllies(t *testing.T) {
	// Barrier shape: one activation grants the absorb pool to the caster
	// (targetsSelf) and every same-faction target in the one-shot circle.
	ally := &shieldTargetRecorder{basic: ecs.NewBasic()}
	caster, sk := cooldownCaster(spaceWithBurstTarget(int(model.LayerPlayerCollision), ally))
	caster.sc.EquipCooldown(0, barrierDef(), 1)
	caster.sc.RequestCooldownActivation(0)

	sk.Update(33.0)

	require.Len(t, caster.shields, 1, "targetsSelf grants the caster its pool")
	assert.InDelta(t, 20, caster.shields[0].hp, 1e-6)
	assert.Equal(t, 300+1, caster.shields[0].ticks,
		"instant lifetime = authored duration + 1 (the dot convention)")
	require.Len(t, ally.shields, 1, "allies in the circle are shielded too")
	assert.Equal(t, 300, caster.sc.CooldownSlots[0].CdTicks, "cooldown starts after firing")
}

func TestCooldown_InstantShieldSelfOnlyStillFires(t *testing.T) {
	// A Barrier cast with nobody around must still shield the caster and
	// consume the cooldown (the self-apply is a hit, not a whiff).
	caster, sk := cooldownCaster(spaceWithBurstTarget(int(model.LayerPlayerCollision), "not shieldable"))
	caster.sc.EquipCooldown(0, barrierDef(), 1)
	caster.sc.RequestCooldownActivation(0)

	sk.Update(33.0)

	require.Len(t, caster.shields, 1)
	assert.Equal(t, 300, caster.sc.CooldownSlots[0].CdTicks)
}

// --- hot_aura / instant_hot + tickHotEvents (plan-skill-vocab chunk 3) ---

// hotTargetRecorder is an aligned ally that records ApplyHot calls, the
// shieldTargetRecorder twin. HealthRatio is wounded so the hot_aura's
// wounded-only predicate selects it.
type hotTargetRecorder struct {
	basic ecs.BasicEntity
	hots  []appliedHot
	ratio float32
}

func (r *hotTargetRecorder) Basic() ecs.BasicEntity          { return r.basic }
func (r *hotTargetRecorder) Faction() model.Faction          { return model.FactionAligned }
func (r *hotTargetRecorder) HealthRatio() float32            { return r.ratio }
func (r *hotTargetRecorder) InCombat() bool                  { return false }
func (r *hotTargetRecorder) Position() phy.Vec2f             { return phy.VEC2F_ZERO }
func (r *hotTargetRecorder) Radius() float32                 { return 0.25 }
func (r *hotTargetRecorder) Heal(hp uint32) vitals.VitalSign { return vitals.VitalSign(hp) }
func (r *hotTargetRecorder) ApplyHot(source skills.SkillID, hot skills.HotBuff, ticks int) {
	r.hots = append(r.hots, appliedHot{source, hot, ticks})
}

var _ model.Healable = (*hotTargetRecorder)(nil)

func hotAuraEffect() skills.EffectDef {
	return skills.EffectDef{
		Type:         skills.EffectTypeHotAura,
		TickInterval: 10,
		Hot:          &skills.HotParams{HP: 3, HPPerLevel: 1, TickCount: 5, Interval: 30},
	}
}

func woundedHotTarget() *hotTargetRecorder {
	return &hotTargetRecorder{basic: ecs.NewBasic(), ratio: 0.5}
}

func TestApplyHotAura_AppliesLingeringBuffToWoundedAlly(t *testing.T) {
	caster := newFakePlayer()
	ally := woundedHotTarget()

	applyHotAura(caster, 30, 2, hotAuraEffect(), colliderSetOf(model.Healable(ally)))

	require.Len(t, ally.hots, 1)
	got := ally.hots[0]
	assert.Equal(t, skills.SkillID(30), got.source)
	assert.InDelta(t, 4, got.hot.HP, 1e-6, "level 2 = 3 + 1×1 per-event heal")
	assert.Equal(t, 30, got.hot.Interval)
	assert.Equal(t, 5*30+1, got.ticks,
		"buff lifetime is the authored hot duration (outlasts the aura cadence → lingers)")
	assert.Equal(t, model.PlayerEntity(caster), got.hot.Caster)
}

func TestApplyHotAura_SkipsFullHealthAlly(t *testing.T) {
	caster := newFakePlayer()
	full := &hotTargetRecorder{basic: ecs.NewBasic(), ratio: 1.0}

	applyHotAura(caster, 30, 1, hotAuraEffect(), colliderSetOf(model.Healable(full)))

	assert.Empty(t, full.hots, "wounded-only: a full-health ally gets no HoT")
}

func TestApplyHotAura_SkipsSelf(t *testing.T) {
	caster := newFakePlayer()
	caster.vitalSigns.Health = 50 // wounded, but self is excluded

	applyHotAura(caster, 30, 1, hotAuraEffect(), colliderSetOf(model.PlayerEntity(caster)))

	assert.Empty(t, caster.hots, "hot_aura never targets the caster (self is the instant_hot's job)")
}

func recoverDef() *skills.SkillDefinition {
	return &skills.SkillDefinition{
		ID: 31, Name: "Recover", Category: skills.SkillCategoryCooldown, MaxLevel: 1,
		CooldownTicks: 300,
		Effects: []skills.EffectDef{{
			Type:          skills.EffectTypeInstantHot,
			Radius:        1.5,
			TargetsAllies: true,
			Hot:           &skills.HotParams{HP: 4, TickCount: 6, Interval: 20, TargetsSelf: true},
		}},
	}
}

func TestCooldown_InstantHotBuffsSelfAndAllies(t *testing.T) {
	ally := &hotTargetRecorder{basic: ecs.NewBasic(), ratio: 1.0}
	caster, sk := cooldownCaster(spaceWithBurstTarget(int(model.LayerPlayerCollision), ally))
	caster.sc.EquipCooldown(0, recoverDef(), 1)
	caster.sc.RequestCooldownActivation(0)

	sk.Update(33.0)

	require.Len(t, caster.hots, 1, "targetsSelf grants the caster its HoT")
	assert.InDelta(t, 4, caster.hots[0].hot.HP, 1e-6)
	assert.Equal(t, 6*20+1, caster.hots[0].ticks, "instant lifetime = authored duration + 1")
	require.Len(t, ally.hots, 1, "allies in the circle are HoT'd too, regardless of full health")
	assert.Equal(t, 300, caster.sc.CooldownSlots[0].CdTicks, "cooldown starts after firing")
}

func TestCooldown_InstantHotSelfOnlyStillFires(t *testing.T) {
	caster, sk := cooldownCaster(spaceWithBurstTarget(int(model.LayerPlayerCollision), "not hotable"))
	caster.sc.EquipCooldown(0, recoverDef(), 1)
	caster.sc.RequestCooldownActivation(0)

	sk.Update(33.0)

	require.Len(t, caster.hots, 1, "the self-apply is a hit, not a whiff")
	assert.Equal(t, 300, caster.sc.CooldownSlots[0].CdTicks)
}

// hotCarrier is a real-Buffs-backed PlayerEntity heal target for the
// tickHotEvents acting site: it embeds fakePlayer (Healable, NoteHealedBy,
// PlayerEntity) and drains a genuine store.
type hotCarrier struct {
	*fakePlayer
	buffs skills.Buffs
}

func (h *hotCarrier) DueBuffEvents() ([]skills.DotHit, []skills.HotEvent) {
	return h.buffs.DueBuffEvents()
}

func TestTickHotEvents_HealsCarrierAndNotesHealer(t *testing.T) {
	sk := testSkillSystem()
	healer := newFakePlayer()
	target := &hotCarrier{fakePlayer: newFakePlayer()}
	target.vitalSigns.Health = 50
	target.inCombat = true // supporting an engaged ally enters combat

	// One heal event due this tick, caster = the healer player.
	target.buffs.ApplyHot(31, skills.HotBuff{HP: 7, Interval: 1, Caster: model.PlayerEntity(healer)}, 3)
	target.buffs.Tick()
	sk.tickBuffEvents(target)

	assert.Equal(t, vitals.VitalSign(57), target.vitalSigns.Health, "the hot event healed the carrier")
	require.Len(t, target.healedBy, 1, "player-healer × player-target registers participation")
	assert.Equal(t, model.PlayerEntity(healer), target.healedBy[0])
	assert.Equal(t, 1, healer.combatActions, "supporting an in-combat target puts the healer in combat")
}

func TestTickHotEvents_FullHealthTargetNoParticipation(t *testing.T) {
	sk := testSkillSystem()
	healer := newFakePlayer()
	target := &hotCarrier{fakePlayer: newFakePlayer()} // full health

	target.buffs.ApplyHot(31, skills.HotBuff{HP: 7, Interval: 1, Caster: model.PlayerEntity(healer)}, 3)
	target.buffs.Tick()
	sk.tickBuffEvents(target)

	assert.Empty(t, target.healedBy, "no HP actually restored → not a heal, no participation")
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
func (v *dotVictim) DueBuffEvents() ([]skills.DotHit, []skills.HotEvent) {
	return v.buffs.DueBuffEvents()
}
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
		sk.tickBuffEvents(v)
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
	sk.tickBuffEvents(v)

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
		sk.tickBuffEvents(v)
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

// --- taunt / detaunt cooldowns (mob-depth chunk 7) ---

func tauntDef() *skills.SkillDefinition {
	return &skills.SkillDefinition{
		ID: 25, Name: "Taunt", Category: skills.SkillCategoryCooldown, MaxLevel: 3, CooldownTicks: 300,
		Effects: []skills.EffectDef{{
			Type: skills.EffectTypeTaunt, Radius: 2.0, TargetsEnemies: true,
			Threat: &skills.ThreatParams{Margin: 50},
		}},
	}
}

func fadeDef() *skills.SkillDefinition {
	return &skills.SkillDefinition{
		ID: 26, Name: "Fade", Category: skills.SkillCategoryCooldown, MaxLevel: 3, CooldownTicks: 300,
		Effects: []skills.EffectDef{{
			Type: skills.EffectTypeDetaunt, Radius: 2.0, TargetsEnemies: true,
			Threat: &skills.ThreatParams{},
		}},
	}
}

func hostileMobDef() *mobs.MobDefinition {
	return &mobs.MobDefinition{
		ID: 1, Name: "SaberToothCat", // valid AuraApi entity type name
		Body:    mobs.Body{Radius: 0.25, AggroRadius: 4},
		Factors: mobs.Factors{BaseMaxHealth: 60, Speed: 1},
	}
}

// threatSourcePlayer is a second Aligned player used as a pre-existing threat
// holder — a fakePlayer already satisfies model.Combatant.
func threatSourcePlayer() *fakePlayer { return newFakePlayer() }

func TestCooldown_TauntForcesCasterToTopOfThreat(t *testing.T) {
	m := mob.NewMob(hostileMobDef(), 0, nil) // hostile
	other := threatSourcePlayer()
	m.NoteThreat(other, 100) // someone else holds the aggro

	caster, sk := cooldownCaster(spaceWithBurstTarget(int(model.LayerActionCollision), m))
	caster.sc.EquipCooldown(0, tauntDef(), 1)
	caster.sc.RequestCooldownActivation(0)

	sk.Update(33.0)

	require.True(t, m.Update(0))
	assert.True(t, m.TargetsEntity(caster.basic.ID()),
		"taunt forced the caster above the 100-threat holder → retention swings onto it")
	assert.False(t, m.TargetsEntity(other.basic.ID()))
	assert.Equal(t, 300, caster.sc.CooldownSlots[0].CdTicks, "cooldown consumed")
}

func TestCooldown_TauntSkipsAlliedTarget(t *testing.T) {
	m := mob.NewMob(hostileMobDef(), 0, nil)
	m.Align() // an aligned summon/companion — not an enemy

	caster, sk := cooldownCaster(spaceWithBurstTarget(int(model.LayerPlayerCollision), m))
	caster.sc.EquipCooldown(0, tauntDef(), 1)
	caster.sc.RequestCooldownActivation(0)

	sk.Update(33.0)

	assert.False(t, m.HasThreat(caster.basic.ID()),
		"targetsEnemies gates out same-faction targets — no friendly taunt")
}

func TestCooldown_FadeDropsCasterThreat(t *testing.T) {
	m := mob.NewMob(hostileMobDef(), 0, nil)

	caster, sk := cooldownCaster(spaceWithBurstTarget(int(model.LayerActionCollision), m))
	m.NoteThreat(caster, 50) // the caster is on the mob's table
	require.True(t, m.HasThreat(caster.basic.ID()))

	caster.sc.EquipCooldown(0, fadeDef(), 1)
	caster.sc.RequestCooldownActivation(0)

	sk.Update(33.0)

	assert.False(t, m.HasThreat(caster.basic.ID()),
		"fade removes the caster's single threat entry (shed aggro)")
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

// totemMobDef carries the live curve: a summon's pool AND its output are
// f(the level it stands at) — its owner's, once one is bound (chunk 1b) — so a
// curve-less definition would model neither.
func totemMobDef() *mobs.MobDefinition {
	return &mobs.MobDefinition{
		ID: 9, Name: "Totem", // must be a valid AuraApi entity type name
		Role:       mobs.RoleStructure,
		Body:       mobs.Body{Radius: 0.25},
		Factors:    mobs.Factors{BaseMaxHealth: 50, Speed: 0},
		CurveLevel: 1,
		Curve:      curve.Curve{Growth: 1.12, MaxLevel: 30},
		Skills:     []mobs.MobSkill{{Def: totemAuraDef(), Level: 1}},
	}
}

func summonTotemDef() *skills.SkillDefinition {
	return &skills.SkillDefinition{
		ID: 23, Name: "SummonTotem", Category: skills.SkillCategoryCooldown, MaxLevel: 3, CooldownTicks: 450,
		Effects: []skills.EffectDef{{
			Type: skills.EffectTypeSpawn,
			Spawn: &skills.SpawnParams{
				MobName: "Totem", TTLTicks: 300, TTLTicksPerLevel: 60,
				PowerPerOwnerLevel: 0.05,
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

	// Owner level 5 (chunk 1b): the summon STANDS at level 5, so its pool is
	// its own baseline 50 × f(5) = 78.7 — the flat +2/owner-level bonus is
	// gone. SummonPower stays the linear per-skill knob: 1 + 4×0.05.
	assert.Equal(t, 5, m.Level(), "a summon stands where its owner stands")
	assert.Equal(t, vitals.VitalSign(79), m.MaxHealth())
	assert.Equal(t, m.MaxHealth(), m.Health(), "and spawns at that full pool")
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

// callForAidDef mirrors the C6 Boss-Aura shape: ONE cooldown, THREE spawn
// effects — fireCooldown must apply every effect, raising the full squad.
func callForAidDef() *skills.SkillDefinition {
	spawn := func() skills.EffectDef {
		return skills.EffectDef{
			Type: skills.EffectTypeSpawn,
			Spawn: &skills.SpawnParams{
				MobName: "Totem", TTLTicks: 1800, TTLTicksPerLevel: 300,
				PowerPerOwnerLevel: 0.05,
			},
		}
	}
	return &skills.SkillDefinition{
		ID: 51, Name: "CallForAid", Category: skills.SkillCategoryCooldown, MaxLevel: 3, CooldownTicks: 2400,
		Effects: []skills.EffectDef{spawn(), spawn(), spawn()},
	}
}

func TestCooldown_ThreeSpawnEffectsRaiseThreeSummons(t *testing.T) {
	caster, g, sk := spawnTestSetup(phy.NewSpace())
	caster.sc.EquipCooldown(1, callForAidDef(), 1)
	caster.sc.RequestCooldownActivation(1)

	sk.Update(33.0)

	require.Len(t, g.added, 3, "one cast raises the full squad")
}

func TestCooldown_SpawnMovingSummonFollowsOwner(t *testing.T) {
	// The second spawn consumer (mob-depth chunk 6): an owned summon authored
	// as a follower — spawnSummon's SetOwner plus the definition's role are
	// all it takes; after spawning offset beside the caster it trails the
	// owner instead of standing or wandering.
	companionDef := &mobs.MobDefinition{
		ID: 10, Name: "Companion", // must be a valid AuraApi entity type name
		Role:    mobs.RoleFollower,
		Body:    mobs.Body{Radius: 0.25, AggroRadius: 3.5},
		Factors: mobs.Factors{BaseMaxHealth: 60, Speed: 1.2},
		Skills:  []mobs.MobSkill{{Def: totemAuraDef(), Level: 1}},
	}
	g := newFakeGame()
	g.mobReg = fakeMobRegistry{"Companion": companionDef}
	caster := newFakePlayer()
	caster.level = 5
	summonDef := summonTotemDef()
	summonDef.Effects[0].Spawn.MobName = "Companion"
	caster.sc.EquipCooldown(0, summonDef, 2)
	sk := NewSkillSystem(phy.NewSpace(), g)
	sk.rng = testRNG()
	sk.AddEntity(caster)
	caster.sc.RequestCooldownActivation(0)

	sk.Update(33.0)

	require.Len(t, g.added, 1, "a spawn never whiffs")
	m := g.added[0].(*mob.Mob)
	assert.Same(t, model.PlayerEntity(caster), m.Owner())

	// The owner walks away; the companion must give chase at full speed.
	caster.aura.SetPosition(phy.Vec2f{X: 6, Y: 0})
	before := m.Position()
	require.True(t, m.Update(0))
	after := m.Position()
	assert.Greater(t, after.X, before.X, "the companion moves toward its owner")
	assert.InDelta(t, 1.2*0.055, after.Sub(before).Abs(), 1e-4,
		"follow runs at the definition's full speed, not the idle amble")
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
	//
	// The faction assertion is the shipped pin; the MASK assertion is new
	// (plan-faction-flips.md chunk 1). Adopting the faction while inventing an
	// all-others mask is exactly L2 — a summoned squad would have hunted every
	// neutral it walked past. EnlistUnder hands over both together.
	g := newFakeGame()
	g.mobReg = fakeMobRegistry{"Totem": totemMobDef()}

	casterDef := testMobDef()
	casterDef.Skills = []mobs.MobSkill{{Def: summonTotemDef(), Level: 1}}
	caster := mob.NewMob(casterDef, 0, nil)
	caster.SetPosition(phy.Vec2f{X: 5, Y: 5})

	sk := NewSkillSystem(phy.NewSpace(), g)
	sk.rng = testRNG()
	sk.AddEntity(caster)
	sk.Update(33.0) // mob path fires ready cooldowns immediately; a spawn always hits

	require.Len(t, g.added, 1)
	m := g.added[0].(*mob.Mob)
	assert.Nil(t, m.Owner())
	assert.Equal(t, model.FactionHostile, m.Faction(), "summon adopts the casting mob's faction")
	assert.Equal(t, caster.AggroMask(), m.AggroMask(),
		"and its reaction table with it — it hunts what its summoner hunts, nothing more")
	assert.Equal(t, vitals.VitalSign(50), m.MaxHealth(), "no owner → no owner-level HP bonus")
	assert.InDelta(t, 1.0, m.SummonPower(), 1e-6)
}

// --- owned-caster attribution + power (mob-depth chunk 1) ---

// newTestTotem builds an owned, player-aligned summon around the given owner.
func newTestTotem(owner *fakePlayer) *mob.Mob {
	totem := mob.NewMob(totemMobDef(), 0, nil)
	totem.Align()
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
	target := mob.NewMob(targetDef, 0, nil)

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
	// The multiplier is now the authored RATE read against the owner's CURRENT
	// level (R5), so the fixture states both: 1 + (11-1)x0.05 = 1.5.
	owner.level = 11
	totem := newTestTotem(owner)
	totem.SetSummonPowerPerLevel(0.05)

	target := &touchRecorder{}
	effect := damageEffect(1)
	effect.Damage = &skills.DamageParams{HP: 10}

	applyDamageAura(totem, 1, effect, colliderSetOf(target), testRNG())

	// The curve rides in through the summon's own PowerScale (it stands at its
	// owner's level, chunk 1b), so it must be stated explicitly now that the
	// fixture is no longer at level 1.
	f11 := float32(math.Pow(1.12, 10))
	require.Len(t, target.touches, 1)
	assert.InDelta(t, 10*1.5*f11, target.touches[0], 1e-5, "10 HP × power 1.5 × f(owner level 11)")
}

func TestApplyDotEffect_OwnedCasterScalesPower(t *testing.T) {
	// Power is frozen into the dot at application time, like the level.
	owner := newFakePlayer()
	owner.level = 11 // 1 + (11-1)x0.05 = 1.5
	totem := newTestTotem(owner)
	totem.SetSummonPowerPerLevel(0.05)

	target := &dotRecorder{basic: ecs.NewBasic()}
	applyDotEffect(totem, 106, 1, dotEffect(), colliderSetOf(target))

	f11 := float32(math.Pow(1.12, 10))
	require.Len(t, target.dots, 1)
	assert.InDelta(t, 5*1.5*f11, target.dots[0].HP, 1e-5, "5 HP × power 1.5 × f(owner level 11)")
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
	sk.tickBuffEvents(v)

	require.Len(t, v.playerHits, 1, "owned-summon dots ride the player path")
	assert.InDelta(t, 4, v.playerHits[0].HP, 1e-6)
	assert.Empty(t, v.mobHits, "not the mob double dispatch")
}

func TestTotem_KillableByHostileMobAura(t *testing.T) {
	// Decision §8.4/3: the totem is killable. Its player-layer body is what a
	// hostile aura's enemy mask matches, and the hit lands via MobTouches.
	hostile := mob.NewMob(testMobDef(), 0, nil)
	hostile.SetPosition(phy.Vec2f{X: 1, Y: 1})

	totemDef := totemMobDef()
	totemDef.Body.CollisionLayer = int(model.LayerViewportCollision | model.LayerPlayerCollision)
	totemDef.Body.CollisionMask = int(model.LayerBorderCollision)
	totem := mob.NewMob(totemDef, 0, nil)
	totem.Align()

	effect := damageEffect(1)
	effect.Damage = &skills.DamageParams{HP: 10}

	mask := model.AuraMaskFor(&skills.SkillDefinition{Effects: []skills.EffectDef{effect}})
	assert.NotZero(t, mask&totem.Bodies()[0].Shape().Layer,
		"a hostile enemy-targeting aura's mask matches the totem's player-layer body")

	applyDamageAura(hostile, 1, effect, colliderSetOf(totem), testRNG())
	assert.Equal(t, totem.MaxHealth()-10, totem.Health(), "the hostile hit damages the totem")
}

// --- threat attribution + healer threat (mob-depth chunk 3) ---

func TestApplyDamageAura_OwnedCasterStampsSummonSource(t *testing.T) {
	// The hit's Source carries the summon so the struck mob credits threat
	// against the totem while XP rides PlayerTouches(owner) — gotcha #9.
	owner := newFakePlayer()
	totem := newTestTotem(owner)

	target := &touchRecorder{}
	applyDamageAura(totem, 1, damageEffect(1), colliderSetOf(target), testRNG())

	require.Len(t, target.sources, 1)
	assert.Same(t, any(totem), any(target.sources[0]),
		"owned cast: Damage.Source is the summon entity")
}

func TestApplyDamageAura_DirectPlayerCastHasNilSource(t *testing.T) {
	caster, target := activeAuraPlayer(t, damageEffect(1))
	applyDamageAura(caster, 1, damageEffect(1), colliderSetOf(target), testRNG())

	require.Len(t, target.sources, 1)
	assert.Nil(t, target.sources[0],
		"direct cast: nil Source — the target treats the toucher as the source")
}

func TestTickDots_OwnedDotKeepsSummonAsSource(t *testing.T) {
	// The owner replaces the stored caster for crediting, but the summon rides
	// along as Damage.Source: threat sticks to the totem while it lives.
	sk := NewSkillSystem(phy.NewSpace(), nil)
	sk.rng = testRNG()
	owner := newFakePlayer()
	totem := newTestTotem(owner)

	v := newDotVictim()
	v.buffs.ApplyDot(106, skills.DotBuff{HP: 4, Tags: []string{"fire"}, Interval: 1, Caster: totem}, 2)

	v.buffs.Tick()
	sk.tickBuffEvents(v)

	require.Len(t, v.playerHits, 1)
	assert.Same(t, any(totem), any(v.playerHits[0].Source))
}

// threatRecordingMob observes the SkillSystem-side healer-threat crediting
// seam (HasThreat filter + NoteThreat amounts); the mob-side table mechanics
// are pinned in the mob package.
type threatRecordingMob struct {
	fakeMob
	fighting  map[uint64]bool
	targeting map[uint64]bool
	sources   []model.Combatant
	amounts   []float32
}

func (m *threatRecordingMob) HasThreat(id uint64) bool     { return m.fighting[id] }
func (m *threatRecordingMob) TargetsEntity(id uint64) bool { return m.targeting[id] }
func (m *threatRecordingMob) NoteThreat(source model.Combatant, amount float32) {
	m.sources = append(m.sources, source)
	m.amounts = append(m.amounts, amount)
}

func TestApplyHealAura_CreditsHealerThreatOnMobsFightingTarget(t *testing.T) {
	s := testSkillSystem()
	healer := newFakePlayer()
	ally := newFakePlayer()
	ally.vitalSigns.Health = 50

	fighting := &threatRecordingMob{fakeMob: *newFakeMob(), fighting: map[uint64]bool{ally.basic.ID(): true}}
	idle := &threatRecordingMob{fakeMob: *newFakeMob()}
	s.AddEntity(fighting)
	s.AddEntity(idle)

	s.applyHealAura(healer, 1, healEffect(), colliderSetOf(model.PlayerEntity(ally)))

	require.Len(t, fighting.sources, 1, "a mob in combat with the heal target learns of the heal")
	assert.Same(t, any(healer), any(fighting.sources[0]))
	assert.InDelta(t, 10*cfg.DefaultHealerThreatFactor, fighting.amounts[0], 1e-6,
		"healer threat = actually-healed HP × factor (§6.3)")
	assert.Empty(t, idle.sources, "a mob not fighting the target never learns of the heal")
}

func TestApplyHealAura_CreditsHealerThreatOnSensorAggroMob(t *testing.T) {
	s := testSkillSystem()
	healer := newFakePlayer()
	ally := newFakePlayer()
	ally.vitalSigns.Health = 50

	// Sensor-acquired combat: the mob targets the ally, but the ally never
	// damaged it — its threat table is empty (the no-damage-tank scenario).
	aggro := &threatRecordingMob{fakeMob: *newFakeMob(), targeting: map[uint64]bool{ally.basic.ID(): true}}
	s.AddEntity(aggro)

	s.applyHealAura(healer, 1, healEffect(), colliderSetOf(model.PlayerEntity(ally)))

	require.Len(t, aggro.sources, 1,
		"a mob whose aggro target is the heal target is in combat with it — the healer gets credited")
	assert.Same(t, any(healer), any(aggro.sources[0]))
}

// campfireAuraDef mirrors the CampfireAura content def: an uncapped small heal
// aura on a stationary world fixture (atmosphere & recovery chunk 2, §6.2).
func campfireAuraDef() *skills.SkillDefinition {
	return &skills.SkillDefinition{
		ID: 109, Name: "CampfireAura", Category: skills.SkillCategoryActiveAura, MaxLevel: 1,
		Effects: []skills.EffectDef{{
			Type: skills.EffectTypeHealAura, Radius: 1.5, TickInterval: 30,
			Heal: &skills.HealParams{HP: 6},
		}},
	}
}

// campfireMobDef mirrors the Campfire content def: speed 0 (aura always-on)
// with a Viewport-only body — structurally untargetable, the brazier layer
// trick. Name reuses the Brazier entity type; the real def switches to the
// Campfire EntityType with the wire step.
func campfireMobDef() *mobs.MobDefinition {
	return &mobs.MobDefinition{
		ID: 13, Name: "Brazier",
		Role: mobs.RoleStructure,
		Body: mobs.Body{
			Radius:         0.25,
			CollisionLayer: int(model.LayerViewportCollision),
			CollisionMask:  int(model.LayerBorderCollision),
		},
		Factors: mobs.Factors{BaseMaxHealth: 50, Speed: 0},
		Skills:  []mobs.MobSkill{{Def: campfireAuraDef(), Level: 1}},
	}
}

func TestApplyHealAura_UntargetableHealerDrawsNoThreat(t *testing.T) {
	// Gotcha #1 / §6.2: an aligned campfire healing an in-combat player is a
	// different faction from the hostile mob, so noteThreat would accept it —
	// pulling the mob onto a structurally unreachable Viewport-only body
	// forever. Design rule: aligned world fixtures never draw mob threat.
	s := testSkillSystem()
	campfire := mob.NewMob(campfireMobDef(), 0, nil)
	campfire.Align()

	ally := newFakePlayer()
	ally.vitalSigns.Health = 50
	ally.inCombat = true

	fighting := &threatRecordingMob{fakeMob: *newFakeMob(), fighting: map[uint64]bool{ally.basic.ID(): true}}
	s.AddEntity(fighting)

	s.applyHealAura(campfire, 1, healEffect(), colliderSetOf(model.PlayerEntity(ally)))

	require.Equal(t, vitals.VitalSign(60), ally.vitalSigns.Health, "the campfire heal itself lands")
	assert.Empty(t, fighting.sources,
		"a healer with no combatant-layer body never lands on a threat table (§6.2: aligned world fixtures never draw mob threat)")
}

// --- mob-path faction gate (mob-depth chunk 6.6) ---

// factionedMobTouchRecorder is a factioned Interacter recording MobTouches — the shape
// of a combatant standing in a mob's damage aura.
type factionedMobTouchRecorder struct {
	faction model.Faction
	hits    []mobs.Factors
}

func (r *factionedMobTouchRecorder) PlayerTouches(p model.PlayerEntity, damage model.Damage) {}
func (r *factionedMobTouchRecorder) MobTouches(m model.MobEntity, factors mobs.Factors) {
	r.hits = append(r.hits, factors)
}
func (r *factionedMobTouchRecorder) Faction() model.Faction { return r.faction }

var _ model.Interacter = (*factionedMobTouchRecorder)(nil)

// factionedMobCaster is a mob-typed caster with just enough surface for
// applyMobDamageAura; everything else panics via the embedded nil interface.
type factionedMobCaster struct {
	model.MobEntity
	faction model.Faction
}

func (c *factionedMobCaster) Faction() model.Faction { return c.faction }

// The damage path reads the acting caster's derived crit stat on every
// application (backlog §23); a nil component means "no stat", not a panic.
func (c *factionedMobCaster) SkillComponent() *skills.SkillComponent { return nil }

func TestApplyMobDamageAura_SameFactionNeverHitNorEatsTargetSlot(t *testing.T) {
	// With aura masks spanning both combatant layers (chunk 6.6), a mob's
	// sensor sees same-faction mobs — eligibility must skip them BEFORE the
	// target cap, or a nearer pack mate would eat the nearest-1 slot.
	caster := &factionedMobCaster{faction: model.FactionHostile}
	packMate := &factionedMobTouchRecorder{faction: model.FactionHostile}
	enemy := &factionedMobTouchRecorder{faction: model.FactionAligned}

	set := make(phy.ColliderSet)
	near := phy.NewCircle(phy.Vec2f{X: 0.1, Y: 0}, 0.25)
	near.Shape().UserData = packMate
	set[near] = struct{}{}
	far := phy.NewCircle(phy.Vec2f{X: 0.5, Y: 0}, 0.25)
	far.Shape().UserData = enemy
	set[far] = struct{}{}

	effect := damageEffect(1)
	effect.MaxTargets = 1 // nearest-1, the base-aura shape

	applyMobDamageAura(caster, phy.VEC2F_ZERO, 1, effect, set, testRNG())

	assert.Empty(t, packMate.hits, "no friendly fire between same-faction mobs")
	require.Len(t, enemy.hits, 1, "the slot goes to the enemy behind the pack mate")
}

func TestApplyMobDamageAura_DifferentFactionMobIsHit(t *testing.T) {
	// The wolf's aura burns the prey mob standing in it: different faction,
	// targetsEnemies — the exact-faction check replaces the old mask-only
	// discrimination.
	caster := &factionedMobCaster{faction: 2} // a content faction
	prey := &factionedMobTouchRecorder{faction: 3}

	applyMobDamageAura(caster, phy.VEC2F_ZERO, 1, damageEffect(1), colliderSetOf(prey), testRNG())

	require.Len(t, prey.hits, 1)
}

func TestApplyMobDamageAura_UnfactionedStructureStillHit(t *testing.T) {
	// Structures have no faction and must stay reachable — the faction gate
	// only applies to Factioned targets, discrimination for the rest remains
	// the sensor mask (placeable layer via targetsStructures).
	caster := &factionedMobCaster{faction: model.FactionHostile}
	structure := &structureRecorder{}

	effect := damageEffect(1)
	effect.TargetsStructures = true
	effect.Damage.StructureDamageFraction = 0.5

	applyMobDamageAura(caster, phy.VEC2F_ZERO, 1, effect, colliderSetOf(structure), testRNG())

	require.Len(t, structure.mobHits, 1, "unfactioned targets ride the mask, not the faction gate")
}

// alignedMobResistTarget is a mob-shaped ally: Factioned aligned + ApplyResist,
// but NOT a PlayerEntity — the companion's shape under a player's ward.
type alignedMobResistTarget struct {
	model.MobEntity
	basic   ecs.BasicEntity
	resists []appliedResist
}

func (r *alignedMobResistTarget) Basic() ecs.BasicEntity { return r.basic }
func (r *alignedMobResistTarget) Faction() model.Faction { return model.FactionAligned }
func (r *alignedMobResistTarget) ApplyResist(source skills.SkillID, tags []string, factor float32, ticks int) {
	r.resists = append(r.resists, appliedResist{source, tags, factor, ticks})
}

func TestApplyResistAura_ReachesAlignedMobAlly(t *testing.T) {
	// Chunk 6.6: ally masks span both combatant layers, so a player's ward
	// (FireWard) finally reaches their own companion — eligibility is the
	// exact faction check, not the target's kind.
	caster := newFakePlayer()
	companion := &alignedMobResistTarget{basic: ecs.NewBasic()}

	applyResistAura(caster, 40, 1, resistEffect(), colliderSetOf(companion))

	require.Len(t, companion.resists, 1,
		"an aligned mob is a legitimate targetsAllies recipient")
}

// --- two-layer harm gate (chunk 6.6 in-game findings, 2026-07-11) ---

// harmGateMobDef builds a minimal definition for a REAL mob caster (fakes
// bypass the gate — model.HostilityGate is what routes it).
func harmGateMobDef(name string, faction factions.Faction, aggroMask uint64) *mobs.MobDefinition {
	return &mobs.MobDefinition{
		ID:        99,
		Name:      name,
		Faction:   faction,
		AggroMask: aggroMask,
		Factors:   mobs.Factors{Speed: 1, BaseMaxHealth: 100},
		Body:      mobs.Body{Radius: 0.3, AggroRadius: 2},
	}
}

func TestApplyMobDamageAura_NeutralFactionNeverSplashed(t *testing.T) {
	// In-game finding 1 (2026-07-11): a tusker Mammoth chasing a player
	// walked through a prey Dodo — "different faction = may harm" let the
	// splash land, and the retaliation locked two neutral factions into a
	// fight neither could have started. Harm now needs declared hostility
	// or an active combat link.
	mammoth := mob.NewMob(harmGateMobDef("Mammoth", 4, model.FactionAligned.Bit()), 0, nil)
	dodo := &factionedMobTouchRecorder{faction: 5} // neutral to the mammoth
	player := &factionedMobTouchRecorder{faction: model.FactionAligned}

	applyMobDamageAura(mammoth, phy.VEC2F_ZERO, 1, damageEffect(1), colliderSetOf(dodo, player), testRNG())

	assert.Empty(t, dodo.hits, "no declared hostility, no combat link → no splash")
	require.Len(t, player.hits, 1, "the declared enemy (aligned) is still hit")
}

func TestApplyMobDamageAura_ThreatTableAttackerIsFairGame(t *testing.T) {
	// The dynamic layer: an attacker outside the aggro set (rabbit's set is
	// empty) lands on the threat table and may be hit back — retaliation.
	rabbit := mob.NewMob(harmGateMobDef("Rabbit", 5, 0), 0, nil)
	wolf := mob.NewMob(harmGateMobDef("SaberToothCat", 6, model.FactionAligned.Bit()|uint64(1)<<5), 0, nil)

	rabbit.MobTouches(wolf, mobs.Factors{Damage: 5}) // wolf hurts the rabbit

	applyMobDamageAura(rabbit, phy.VEC2F_ZERO, 1, damageEffect(1), colliderSetOf(wolf), testRNG())

	assert.Positive(t, int(wolf.DamageTaken()), "the rabbit bites back at its attacker")
}

// factionedDotRecorder is a dot-capable factioned target (the shape of a mob
// standing in a dot aura).
type factionedDotRecorder struct {
	faction model.Faction
	dots    []skills.SkillID
}

func (r *factionedDotRecorder) Faction() model.Faction { return r.faction }
func (r *factionedDotRecorder) ApplyDot(source skills.SkillID, dot skills.DotBuff, ticks int) {
	r.dots = append(r.dots, source)
}

func TestApplyDotEffect_MobCasterRespectsHostility(t *testing.T) {
	// In-game finding 2 (2026-07-11): the brazier's TotemAura dotted passing
	// predator cats (different faction), which retaliated against a body no
	// damage mask can reach and burned to death in its aura. The brazier's
	// set is {aligned}: players still burn, the cat is never touched — so it
	// never builds threat and never suicides.
	brazier := mob.NewMob(harmGateMobDef("Brazier", 0, 0), 0, nil) // zero-value → hostile default, set {aligned}
	cat := &factionedDotRecorder{faction: 6}
	player := &factionedDotRecorder{faction: model.FactionAligned}

	applyDotEffect(brazier, 106, 1, dotEffect(), colliderSetOf(cat, player))

	assert.Empty(t, cat.dots, "neutral-faction mob is never dotted by the hazard")
	require.Len(t, player.dots, 1, "the declared enemy (aligned) still burns")
}

// --- support mobs: mob-cast heal aura (chunk 8) ---

// A mob heal aura heals a wounded allied mob's own resource (its health pool),
// not player vitals — the healCaster player-only split is lifted (chunk 8).
func TestApplyHealAura_MobCaster_HealsWoundedAllyResource(t *testing.T) {
	caster := newFakeMob() // FactionHostile
	ally := &fakeHealableMob{
		basic:     ecs.NewBasic(),
		faction:   model.FactionHostile,
		health:    50,
		maxHealth: 100,
	}
	set := colliderSetOf(model.Healable(ally))

	testSkillSystem().applyHealAura(caster, 1, healEffect(), set)

	assert.Equal(t, vitals.VitalSign(60), ally.health, "wounded ally healed by flat HP into its own pool")
	assert.Equal(t, vitals.VitalSign(10), ally.healReceived, "records the mob floating heal number")
}

// Gotcha #12: a mob heal must never create a player XP entitlement. An aligned
// mob healer (e.g. a companion) landing a heal on a wounded player heals them
// but does NOT register as a recent healer — the participation-XP path is
// player-caster-only.
func TestApplyHealAura_MobCaster_NoPlayerEntitlement(t *testing.T) {
	caster := newFakeMob()
	caster.faction = model.FactionAligned // aligned mob, same faction as the player
	player := newFakePlayer()             // FactionAligned
	player.vitalSigns.Health = 50
	set := colliderSetOf(model.PlayerEntity(player))

	testSkillSystem().applyHealAura(caster, 1, healEffect(), set)

	assert.Equal(t, vitals.VitalSign(60), player.vitalSigns.Health, "player is still healed")
	assert.Empty(t, player.healedBy, "a mob healer creates no recent-healer XP entitlement (#12)")
}

// Faction gate: a hostile mob healer does not heal an aligned target — "no
// healing players by accident". Heal eligibility is same-faction only.
func TestApplyHealAura_MobCaster_DoesNotHealAcrossFactions(t *testing.T) {
	caster := newFakeMob() // FactionHostile
	player := newFakePlayer()
	player.vitalSigns.Health = 50
	set := colliderSetOf(model.PlayerEntity(player))

	testSkillSystem().applyHealAura(caster, 1, healEffect(), set)

	assert.Equal(t, vitals.VitalSign(50), player.vitalSigns.Health, "different-faction target is never healed")
	assert.Empty(t, player.healedBy)
}

// A full-health ally is never selected: no heal lands (guards the eligibility
// "wounded only" rule for mob casters too).
func TestApplyHealAura_MobCaster_SkipsFullHealthAlly(t *testing.T) {
	caster := newFakeMob()
	healthy := &fakeHealableMob{
		basic:     ecs.NewBasic(),
		faction:   model.FactionHostile,
		health:    100, // full — not eligible
		maxHealth: 100,
	}
	set := colliderSetOf(model.Healable(healthy))

	testSkillSystem().applyHealAura(caster, 1, healEffect(), set)

	assert.Equal(t, vitals.VitalSign(0), healthy.healReceived, "a full-health ally is never healed")
}

// --- damage vocabulary: berserker / execute / crit / lifesteal (plan-skill-vocab chunk 1, F6 §3.1) ---

// ratioTouchRecorder is a touchRecorder with a health ratio, so execute can
// rank it (production targets are players/mobs and always have one).
type ratioTouchRecorder struct {
	touchRecorder
	ratio float32
}

func (r *ratioTouchRecorder) HealthRatio() float32 { return r.ratio }

// ratioMobTouchRecorder is the mob-path equivalent.
type ratioMobTouchRecorder struct {
	mobTouchRecorder
	ratio float32
}

func (r *ratioMobTouchRecorder) HealthRatio() float32 { return r.ratio }

// vocabEffect is a variance-free damage aura carrying the given vocabulary
// fields on a base of 10 HP.
func vocabEffect(mutate func(*skills.DamageParams)) skills.EffectDef {
	e := skills.EffectDef{
		Type:           skills.EffectTypeDamageAura,
		TargetsEnemies: true,
		TickInterval:   1,
		Damage:         &skills.DamageParams{HP: 10},
	}
	mutate(e.Damage)
	return e
}

func TestApplyDamageAura_BerserkerScalesWithCasterMissingHP(t *testing.T) {
	effect := vocabEffect(func(d *skills.DamageParams) { d.BerserkerMaxBonusFactor = 1 })
	caster := newFakePlayer() // 100/100 HP
	target := &touchRecorder{}
	set := colliderSetOf(target)

	applyDamageAura(caster, 1, effect, set, testRNG())
	require.Len(t, target.touches, 1)
	assert.InDelta(t, 10.0, target.touches[0], 1e-4, "full HP = no bonus")

	caster.vitalSigns.Health = 50
	applyDamageAura(caster, 1, effect, set, testRNG())
	assert.InDelta(t, 15.0, target.touches[1], 1e-4, "half HP = half the max bonus")

	caster.vitalSigns.Health = 0
	applyDamageAura(caster, 1, effect, set, testRNG())
	assert.InDelta(t, 20.0, target.touches[2], 1e-4, "zero HP = full bonus")
}

func TestApplyDamageAura_ExecuteBonusBelowThresholdOnly(t *testing.T) {
	effect := vocabEffect(func(d *skills.DamageParams) {
		d.ExecuteBelowFraction = 0.35
		d.ExecuteBonusFactor = 2
	})
	caster := newFakePlayer()
	healthy := &ratioTouchRecorder{ratio: 0.5}
	boundary := &ratioTouchRecorder{ratio: 0.35}
	wounded := &ratioTouchRecorder{ratio: 0.2}

	applyDamageAura(caster, 1, effect, colliderSetOf(healthy, boundary, wounded), testRNG())

	require.Len(t, healthy.touches, 1)
	assert.InDelta(t, 10.0, healthy.touches[0], 1e-4, "above threshold = base")
	require.Len(t, boundary.touches, 1)
	assert.InDelta(t, 10.0, boundary.touches[0], 1e-4, "AT threshold is not below (strict)")
	require.Len(t, wounded.touches, 1)
	assert.InDelta(t, 20.0, wounded.touches[0], 1e-4, "below threshold = bonus")
}

func TestApplyDamageAura_ExecuteSkipsRatiolessTargets(t *testing.T) {
	effect := vocabEffect(func(d *skills.DamageParams) {
		d.ExecuteBelowFraction = 0.35
		d.ExecuteBonusFactor = 2
	})
	caster := newFakePlayer()
	target := &touchRecorder{} // no HealthRatio

	applyDamageAura(caster, 1, effect, colliderSetOf(target), testRNG())

	require.Len(t, target.touches, 1)
	assert.InDelta(t, 10.0, target.touches[0], 1e-4, "no ratio = no execute, base damage")
}

func TestApplyDamageAura_CritAlwaysAtChanceOne(t *testing.T) {
	effect := vocabEffect(func(d *skills.DamageParams) {
		d.CritChance = 1
		d.CritFactor = 2
	})
	caster := newFakePlayer()
	target := &touchRecorder{}

	applyDamageAura(caster, 1, effect, colliderSetOf(target), testRNG())

	require.Len(t, target.touches, 1)
	assert.InDelta(t, 20.0, target.touches[0], 1e-4)
	require.Len(t, target.crits, 1)
	assert.True(t, target.crits[0], "the crit flag rides the Damage payload")
}

func TestApplyDamageAura_CritSeededMixAtHalfChance(t *testing.T) {
	effect := vocabEffect(func(d *skills.DamageParams) {
		d.CritChance = 0.5
		d.CritFactor = 2
	})
	caster := newFakePlayer()
	target := &touchRecorder{}
	set := colliderSetOf(target)

	rng := testRNG()
	for i := 0; i < 100; i++ {
		applyDamageAura(caster, 1, effect, set, rng)
	}

	require.Len(t, target.touches, 100)
	crits, normals := 0, 0
	for i, hp := range target.touches {
		if target.crits[i] {
			crits++
			assert.InDelta(t, 20.0, hp, 1e-4, "a crit hit is exactly ×factor")
		} else {
			normals++
			assert.InDelta(t, 10.0, hp, 1e-4, "a normal hit is the base")
		}
	}
	assert.Greater(t, crits, 0, "seeded half chance must crit sometimes")
	assert.Greater(t, normals, 0, "…and miss sometimes")
}

// critPassiveDef is a stat_multiplier passive granting the given flat crit
// chance at level 1 (crit as a stackable player stat, backlog §23).
func critPassiveDef(chance float32) *skills.SkillDefinition {
	return &skills.SkillDefinition{
		ID: 140, Name: "TestKeenEye", Category: skills.SkillCategoryPassive, MaxLevel: 3,
		Effects: []skills.EffectDef{
			{Type: skills.EffectTypeStatMultiplier, Stat: &skills.StatParams{Name: skills.StatCritChance, Bonus: chance}},
		},
	}
}

func TestApplyDamageAura_StatCritUsesDefaultFactorAndFlag(t *testing.T) {
	// An effect with NO authored crit pair crits via the derived stat alone,
	// at the global default factor — and carries the same wire flag, so the
	// client renders it exactly like an authored crit.
	effect := vocabEffect(func(d *skills.DamageParams) {})
	caster := newFakePlayer()
	caster.sc.EquipPassive(0, critPassiveDef(1), 1)
	target := &touchRecorder{}

	applyDamageAura(caster, 1, effect, colliderSetOf(target), testRNG())

	require.Len(t, target.touches, 1)
	assert.InDelta(t, 10.0*cfg.DefaultCritFactor, target.touches[0], 1e-4)
	require.Len(t, target.crits, 1)
	assert.True(t, target.crits[0], "stat-driven crits ride the same Damage.Crit flag")
}

func TestApplyDamageAura_StatCritStacksAdditivelyWithAuthored(t *testing.T) {
	// Authored 0.5 + stat 0.5 = certain crit; the authored factor wins over
	// the default (backlog §23: additive chance, per-skill factor stays).
	effect := vocabEffect(func(d *skills.DamageParams) {
		d.CritChance = 0.5
		d.CritFactor = 3
	})
	caster := newFakePlayer()
	caster.sc.EquipPassive(0, critPassiveDef(0.5), 1)
	target := &touchRecorder{}

	applyDamageAura(caster, 1, effect, colliderSetOf(target), testRNG())

	require.Len(t, target.touches, 1)
	assert.InDelta(t, 30.0, target.touches[0], 1e-4)
	assert.True(t, target.crits[0])
}

// damagePassiveDef is a stat_multiplier passive granting the given flat
// damageDealt bonus at level 1 (Strong, triage 2026-07-21).
func damagePassiveDef(bonus float32) *skills.SkillDefinition {
	return &skills.SkillDefinition{
		ID: 141, Name: "TestStrong", Category: skills.SkillCategoryPassive, MaxLevel: 5,
		Effects: []skills.EffectDef{
			{Type: skills.EffectTypeStatMultiplier, Stat: &skills.StatParams{Name: skills.StatDamageDealt, Bonus: bonus}},
		},
	}
}

func TestApplyDamageAura_DamageDealtStatScalesBase(t *testing.T) {
	// The derived damageDealt stat multiplies the outgoing base before the
	// per-hit rolls: 10 × (1 + 0.2) = 12, no crit involved.
	effect := vocabEffect(func(d *skills.DamageParams) {})
	caster := newFakePlayer()
	caster.sc.EquipPassive(0, damagePassiveDef(0.2), 1)
	target := &touchRecorder{}

	applyDamageAura(caster, 1, effect, colliderSetOf(target), testRNG())

	require.Len(t, target.touches, 1)
	assert.InDelta(t, 12.0, target.touches[0], 1e-4)
	assert.False(t, target.crits[0], "a stat-scaled hit is not a crit")
}

func TestApplyDotEffect_DamageDealtStatScalesDot(t *testing.T) {
	// "All damage" includes dots: the bonus is frozen into the dot at
	// application time like the power scale. 5 × (1 + 0.2) = 6.
	caster := newFakePlayer()
	caster.sc.EquipPassive(0, damagePassiveDef(0.2), 1)
	target := &dotRecorder{basic: ecs.NewBasic()}

	applyDotEffect(caster, 5, 1, dotEffect(), colliderSetOf(target))

	require.Len(t, target.dots, 1)
	assert.InDelta(t, 6.0, target.dots[0].HP, 1e-4)
}

func TestApplyDamageAura_CharacterBaseCritFromConfig(t *testing.T) {
	// §4.3 v2 (PO 2026-07-20): every player character has a flat base crit
	// chance from conf (game.player.critChance) — it applies to any direct
	// hit, even on effects with no authored crit at all.
	effect := vocabEffect(func(d *skills.DamageParams) {})
	caster := newFakePlayer()
	caster.conf.CritChance = 1
	target := &touchRecorder{}

	applyDamageAura(caster, 1, effect, colliderSetOf(target), testRNG())

	require.Len(t, target.touches, 1)
	assert.InDelta(t, 10.0*cfg.DefaultCritFactor, target.touches[0], 1e-4)
	assert.True(t, target.crits[0])
}

func TestApplyDamageAura_AuthoredCritChanceScalesPerLevel(t *testing.T) {
	// Skill-authored crit chance follows base + (L−1)×perLevel: 0.5 + 0.5 at
	// level 2 = certain crit, at the effect's own factor.
	effect := vocabEffect(func(d *skills.DamageParams) {
		d.CritChance = 0.5
		d.CritChancePerLevel = 0.5
		d.CritFactor = 3
	})
	caster := newFakePlayer()
	target := &touchRecorder{}

	applyDamageAura(caster, 2, effect, colliderSetOf(target), testRNG())

	require.Len(t, target.touches, 1)
	assert.InDelta(t, 30.0, target.touches[0], 1e-4, "level-2 chance 1.0 × factor 3")
	assert.True(t, target.crits[0])
}

func TestApplyPlayerDamageAura_SummonDoesNotInheritOwnerCrit(t *testing.T) {
	// Berserker precedent (backlog §23): the ACTING entity's own stats drive
	// vocab — an owned summon crits off neither the owner's passive nor the
	// owner's character base, and a zero combined chance consumes no RNG draw
	// (seeded-sequence discipline).
	effect := vocabEffect(func(d *skills.DamageParams) {})
	owner := newFakePlayer()
	owner.conf.CritChance = 1
	owner.sc.EquipPassive(0, critPassiveDef(1), 1)
	summon := &fakeActingSource{ratio: 1}
	target := &touchRecorder{}

	applyPlayerDamageAura(owner, summon, phy.VEC2F_ZERO, 1, effect, colliderSetOf(target), testRNG(), 1)

	require.Len(t, target.touches, 1)
	assert.InDelta(t, 10.0, target.touches[0], 1e-4, "no crit: the acting summon has no base or stat")
	assert.False(t, target.crits[0])
}

func TestApplyDamageAura_MobCasterReadsOwnStatCrit(t *testing.T) {
	// The mob path reads the same derived stat off the acting mob's own
	// component — the vocabulary is symmetric across caster kinds.
	effect := vocabEffect(func(d *skills.DamageParams) {})
	caster := newFakeMob()
	caster.sc.EquipPassive(0, critPassiveDef(1), 1)
	target := &mobTouchRecorder{}

	applyDamageAura(caster, 1, effect, colliderSetOf(target), testRNG())

	require.Len(t, target.factors, 1)
	assert.InDelta(t, 10.0*cfg.DefaultCritFactor, target.factors[0].Damage, 1e-4)
	assert.True(t, target.factors[0].Crit)
}

func TestApplyDamageAura_LifestealRidesDamagePayload(t *testing.T) {
	effect := vocabEffect(func(d *skills.DamageParams) { d.LifestealFraction = 0.5 })
	caster := newFakePlayer()
	target := &touchRecorder{}

	applyDamageAura(caster, 1, effect, colliderSetOf(target), testRNG())

	require.Len(t, target.lifesteals, 1)
	assert.InDelta(t, 0.5, target.lifesteals[0], 1e-6)
}

// The F6 §3.1 composition-order pin (chunk-1 half; shields join in chunk 2):
// one hit walked through berserker × execute × crit with hand-computed values.
// base 10 × berserker(half HP, max 1 → 1.5) × execute(0.2 < 0.35 → 2) ×
// crit(chance 1 → 2) = 60.
func TestApplyDamageAura_CompositionOrderF6(t *testing.T) {
	effect := vocabEffect(func(d *skills.DamageParams) {
		d.BerserkerMaxBonusFactor = 1
		d.ExecuteBelowFraction = 0.35
		d.ExecuteBonusFactor = 2
		d.CritChance = 1
		d.CritFactor = 2
		d.LifestealFraction = 0.25
	})
	caster := newFakePlayer()
	caster.vitalSigns.Health = 50
	target := &ratioTouchRecorder{ratio: 0.2}

	applyDamageAura(caster, 1, effect, colliderSetOf(target), testRNG())

	require.Len(t, target.touches, 1)
	assert.InDelta(t, 60.0, target.touches[0], 1e-3)
	assert.True(t, target.crits[0])
	assert.InDelta(t, 0.25, target.lifesteals[0], 1e-6)
}

// fakeActingSource is a minimal Factioned Combatant with a health ratio,
// standing in for an owned summon as the acting entity of an owned cast.
type fakeActingSource struct {
	model.Combatant
	ratio float32
}

func (f *fakeActingSource) Faction() model.Faction { return model.FactionAligned }
func (f *fakeActingSource) HealthRatio() float32   { return f.ratio }

func TestApplyPlayerDamageAura_BerserkerReadsActingSummonHP(t *testing.T) {
	// Decided at chunk-1 start (2026-07-13): the ACTING entity's missing HP
	// drives berserker — a wounded summon rages, the owner's HP is irrelevant.
	effect := vocabEffect(func(d *skills.DamageParams) { d.BerserkerMaxBonusFactor = 1 })
	owner := newFakePlayer() // full HP
	summon := &fakeActingSource{ratio: 0.5}
	target := &touchRecorder{}

	applyPlayerDamageAura(owner, summon, phy.VEC2F_ZERO, 1, effect, colliderSetOf(target), testRNG(), 1)

	require.Len(t, target.touches, 1)
	assert.InDelta(t, 15.0, target.touches[0], 1e-4, "summon at half HP rages; owner HP ignored")
}

func TestApplyDamageAura_MobCaster_VocabularyRidesFactors(t *testing.T) {
	effect := vocabEffect(func(d *skills.DamageParams) {
		d.BerserkerMaxBonusFactor = 1
		d.ExecuteBelowFraction = 0.35
		d.ExecuteBonusFactor = 2
		d.CritChance = 1
		d.CritFactor = 2
		d.LifestealFraction = 0.75
	})
	caster := newFakeMob()
	caster.healthRatio = 0.5
	target := &ratioMobTouchRecorder{ratio: 0.2}

	applyDamageAura(caster, 1, effect, colliderSetOf(target), testRNG())

	require.Len(t, target.factors, 1)
	f := target.factors[0]
	assert.InDelta(t, 60.0, f.Damage, 1e-3, "10 × 1.5 × 2 × 2, same pipeline as players")
	assert.True(t, f.Crit)
	assert.InDelta(t, 0.75, f.Lifesteal, 1e-6)
}

// --- cast-time primitive + recall (plan-skill-vocab chunk 4) ---

// castNovaDef is novaDef with an authored wind-up: 3 ticks, damage-interrupt
// deliberately OFF (the default posture — casts are combat vocabulary).
// Distinct ID: EquipCooldown's move rule would otherwise clear a plain nova
// equipped alongside it.
func castNovaDef() *skills.SkillDefinition {
	def := novaDef()
	def.ID = 99
	def.Name = "CastNova"
	def.CastTicks = 3
	return def
}

func recallTestDef() *skills.SkillDefinition {
	return &skills.SkillDefinition{
		ID: 28, Name: "Recall", Category: skills.SkillCategoryCooldown, MaxLevel: 1,
		CooldownTicks: 9000, CastTicks: 3, CastInterruptedByDamage: true,
		Effects: []skills.EffectDef{{Type: skills.EffectTypeRecall}},
	}
}

// fakeConnState stubs the ConnectionStateSystem seam: a switchable anchor,
// which doubles as the test seam for the completion re-check (anchor lost
// mid-cast is unbindable through gameplay today).
type fakeConnState struct {
	anchor phy.Vec2f
	bound  bool

	// revive stubs (chunk 3): records the last revive request and what to return.
	revivedCorpseID uint64
	revivedFraction float32
	reviveResult    bool
}

func (f *fakeConnState) AnchorOf(id uuid.UUID) (phy.Vec2f, bool) { return f.anchor, f.bound }

func (f *fakeConnState) ReviveAtCorpse(corpseID uint64, healthFraction float32) bool {
	f.revivedCorpseID = corpseID
	f.revivedFraction = healthFraction
	return f.reviveResult
}

func TestCast_ActivationStartsCastNotFire(t *testing.T) {
	target := &touchRecorder{}
	caster, sk := cooldownCaster(spaceWithBurstTarget(int(model.LayerActionCollision), target))
	caster.sc.EquipCooldown(0, castNovaDef(), 1)
	caster.sc.RequestCooldownActivation(0)

	sk.Update(33.0)

	assert.Empty(t, target.touches, "cast winds up, nothing fires yet")
	assert.Equal(t, 0, caster.sc.CooldownSlots[0].CdTicks, "cooldown consumed only at completion")
	assert.True(t, caster.sc.IsCasting())
	assert.Equal(t, 0, caster.sc.CastingSlot)
}

func TestCast_CompletionFiresAndConsumesCooldown(t *testing.T) {
	target := &touchRecorder{}
	caster, sk := cooldownCaster(spaceWithBurstTarget(int(model.LayerActionCollision), target))
	caster.sc.EquipCooldown(0, castNovaDef(), 1)
	caster.sc.RequestCooldownActivation(0)

	for i := 0; i < 4; i++ { // activation + 3 wind-up ticks
		sk.Update(33.0)
	}

	require.Len(t, target.touches, 1, "cast completed → burst fired")
	assert.Equal(t, 300, caster.sc.CooldownSlots[0].CdTicks, "cooldown starts at completion")
	assert.False(t, caster.sc.IsCasting())
}

func TestCast_SameSlotRerequestIgnored(t *testing.T) {
	target := &touchRecorder{}
	caster, sk := cooldownCaster(spaceWithBurstTarget(int(model.LayerActionCollision), target))
	caster.sc.EquipCooldown(0, castNovaDef(), 1)
	caster.sc.RequestCooldownActivation(0)
	sk.Update(33.0)

	// Spamming the same key mid-cast neither cancels nor restarts.
	before := caster.sc.CastTicksLeft
	caster.sc.RequestCooldownActivation(0)
	sk.Update(33.0)

	assert.True(t, caster.sc.IsCasting(), "same-slot re-request is ignored")
	assert.Equal(t, before-1, caster.sc.CastTicksLeft, "wind-up keeps ticking, no restart")
	assert.Empty(t, target.touches)
}

func TestCast_DifferentSlotActivationCancelsAndFires(t *testing.T) {
	target := &touchRecorder{}
	caster, sk := cooldownCaster(spaceWithBurstTarget(int(model.LayerActionCollision), target))
	caster.sc.EquipCooldown(0, castNovaDef(), 1)
	caster.sc.EquipCooldown(1, novaDef(), 1)
	caster.sc.RequestCooldownActivation(0)
	sk.Update(33.0)
	require.True(t, caster.sc.IsCasting())

	// A different cooldown is a deliberate act: the cast dies, the burst fires.
	caster.sc.RequestCooldownActivation(1)
	sk.Update(33.0)

	assert.False(t, caster.sc.IsCasting(), "different-slot activation cancels the cast")
	require.Len(t, target.touches, 1, "the canceling cooldown still fires normally")
	assert.Equal(t, 0, caster.sc.CooldownSlots[0].CdTicks, "interrupted cast consumes no cooldown")
	assert.Equal(t, 300, caster.sc.CooldownSlots[1].CdTicks)
}

func TestCast_UnequipMidCastCancelsSafely(t *testing.T) {
	empty := phy.NewSpace()
	empty.Update()
	caster, sk := cooldownCaster(empty)
	caster.sc.EquipCooldown(0, castNovaDef(), 1)
	caster.sc.RequestCooldownActivation(0)
	sk.Update(33.0)
	require.True(t, caster.sc.IsCasting())

	caster.sc.CooldownSlots[0] = nil
	sk.Update(33.0)

	assert.False(t, caster.sc.IsCasting(), "empty casting slot cancels, no panic")
}

func TestRecall_NoAnchorRejectsActivation(t *testing.T) {
	empty := phy.NewSpace()
	empty.Update()
	caster, sk := cooldownCaster(empty)
	caster.sc.EquipCooldown(0, recallTestDef(), 1)
	sk.SetConnState(&fakeConnState{bound: false})
	caster.sc.RequestCooldownActivation(0)

	sk.Update(33.0)

	assert.False(t, caster.sc.IsCasting(), "precondition fails → no cast starts")
	assert.Equal(t, 0, caster.sc.CooldownSlots[0].CdTicks, "no cooldown consumed")
	require.Len(t, caster.rejections, 1)
	assert.Equal(t, skills.SkillID(28), caster.rejections[0].skill)
	assert.Equal(t, model.ActivationRejectedNoAnchor, caster.rejections[0].reason)
}

func TestRecall_CompletionTeleportsToAnchorWithJitter(t *testing.T) {
	empty := phy.NewSpace()
	empty.Update()
	caster, sk := cooldownCaster(empty)
	caster.sc.EquipCooldown(0, recallTestDef(), 1)
	anchor := phy.Vec2f{X: 25, Y: -13}
	sk.SetConnState(&fakeConnState{anchor: anchor, bound: true})
	caster.sc.RequestCooldownActivation(0)

	for i := 0; i < 4; i++ {
		sk.Update(33.0)
	}

	assert.False(t, caster.sc.IsCasting())
	dist := caster.Position().DistanceToSquared(anchor)
	assert.LessOrEqual(t, dist, float32(respawnJitterRadius*respawnJitterRadius),
		"teleported into the jitter disc around the anchor")
	assert.Equal(t, 9000, caster.sc.CooldownSlots[0].CdTicks, "cooldown consumed on success")
	assert.Empty(t, caster.rejections)
}

func TestRecall_AnchorLostMidCastRejectsAtCompletion(t *testing.T) {
	empty := phy.NewSpace()
	empty.Update()
	caster, sk := cooldownCaster(empty)
	caster.sc.EquipCooldown(0, recallTestDef(), 1)
	cs := &fakeConnState{anchor: phy.Vec2f{X: 25, Y: -13}, bound: true}
	sk.SetConnState(cs)
	caster.sc.RequestCooldownActivation(0)
	sk.Update(33.0)
	require.True(t, caster.sc.IsCasting())

	// The world moved during the wind-up: the completion re-check must reject
	// exactly like the activation check — no teleport, no cooldown.
	cs.bound = false
	for i := 0; i < 3; i++ {
		sk.Update(33.0)
	}

	assert.False(t, caster.sc.IsCasting())
	assert.Equal(t, phy.VEC2F_ZERO, caster.Position(), "no teleport")
	assert.Equal(t, 0, caster.sc.CooldownSlots[0].CdTicks, "cooldown refunded (never consumed)")
	require.Len(t, caster.rejections, 1)
	assert.Equal(t, model.ActivationRejectedNoAnchor, caster.rejections[0].reason)
}

func TestCast_MobFirePathIgnoresCastTime(t *testing.T) {
	// Mobs never author castTicks; if content does anyway, the mob path fires
	// instantly (the documented NOTE) instead of dead-locking the AI.
	stomp := &skills.SkillDefinition{
		ID: 105, Name: "Stomp", Category: skills.SkillCategoryCooldown, MaxLevel: 1,
		CooldownTicks: 450, CastTicks: 10,
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

	assert.NotEmpty(t, target.factors, "mob fires instantly despite castTicks")
	assert.False(t, caster.sc.IsCasting())
}

// --- revive dispatch (plan-skill-vocab chunk 3, §3.6) ---

func reviveTestDef() *skills.SkillDefinition {
	return &skills.SkillDefinition{
		ID: 33, Name: "Revive", Category: skills.SkillCategoryCooldown, MaxLevel: 1,
		CooldownTicks: 600,
		Effects: []skills.EffectDef{{
			Type:   skills.EffectTypeRevive,
			Radius: 3,
			Revive: &skills.ReviveParams{HealthFraction: 0.3},
		}},
	}
}

func TestRevive_NoCorpseRejectsActivation(t *testing.T) {
	empty := phy.NewSpace()
	empty.Update()
	caster, sk := cooldownCaster(empty)
	caster.sc.EquipCooldown(0, reviveTestDef(), 1)
	sk.SetConnState(&fakeConnState{})
	caster.sc.RequestCooldownActivation(0)

	sk.Update(33.0)

	assert.Equal(t, 0, caster.sc.CooldownSlots[0].CdTicks, "no corpse in range → no cooldown consumed")
	require.Len(t, caster.rejections, 1)
	assert.Equal(t, skills.SkillID(33), caster.rejections[0].skill)
	assert.Equal(t, model.ActivationRejectedNoTarget, caster.rejections[0].reason)
}

func TestRevive_FiresReviveAtNearestCorpse(t *testing.T) {
	c := corpse.New(phy.VEC2F_ZERO)
	space := spaceWithBurstTarget(int(model.LayerViewportCollision), c)
	caster, sk := cooldownCaster(space)
	caster.sc.EquipCooldown(0, reviveTestDef(), 1)
	cs := &fakeConnState{reviveResult: true}
	sk.SetConnState(cs)
	caster.sc.RequestCooldownActivation(0)

	sk.Update(33.0)

	assert.Equal(t, c.Basic().ID(), cs.revivedCorpseID, "revive targets the corpse in range")
	assert.InDelta(t, 0.3, cs.revivedFraction, 1e-6, "the authored health fraction is passed through")
	assert.Equal(t, 600, caster.sc.CooldownSlots[0].CdTicks, "a landed revive consumes the cooldown")
	assert.Empty(t, caster.rejections)
}

// --- dash (plan-skill-vocab chunk 5) ---

func dashEffect(distance, perLevel float32) skills.EffectDef {
	return skills.EffectDef{
		Type: skills.EffectTypeDash,
		Dash: &skills.DashParams{Distance: distance, DistancePerLevel: perLevel},
	}
}

func dashDef() *skills.SkillDefinition {
	return &skills.SkillDefinition{
		ID: 33, Name: "Dash", Category: skills.SkillCategoryCooldown, MaxLevel: 3,
		CooldownTicks: 300,
		Effects:       []skills.EffectDef{dashEffect(2.5, 0.5)},
	}
}

// dashPlayer builds a player at the origin aiming along +X in the given space.
func dashPlayer(space *phy.Space) (*fakePlayer, *SkillSystem) {
	p := newFakePlayer()
	p.aura = phy.NewCircle(phy.VEC2F_ZERO, 1.0)
	p.lastMoveDir = phy.Vec2f{X: 1, Y: 0}
	return p, NewSkillSystem(space, nil)
}

func TestApplyDash_FullDistanceInOpenSpace(t *testing.T) {
	p, s := dashPlayer(phy.NewSpace())

	ok := s.applyDash(p, dashEffect(2.5, 0), 1)

	assert.True(t, ok)
	assert.InDelta(t, 2.5, p.Position().X, 1e-4)
	assert.InDelta(t, 0, p.Position().Y, 1e-4)
}

func TestApplyDash_DistanceScalesWithLevel(t *testing.T) {
	p, s := dashPlayer(phy.NewSpace())

	s.applyDash(p, dashEffect(2.0, 0.5), 3) // 2.0 + 2×0.5 = 3.0

	assert.InDelta(t, 3.0, p.Position().X, 1e-4)
}

func TestApplyDash_DirectionFollowsLastMove(t *testing.T) {
	// Standing still: the dash uses the last recorded movement direction (+Y),
	// not a facing (Aura characters have none).
	p, s := dashPlayer(phy.NewSpace())
	p.lastMoveDir = phy.Vec2f{X: 0, Y: 1}

	s.applyDash(p, dashEffect(2.0, 0), 1)

	assert.InDelta(t, 0, p.Position().X, 1e-4)
	assert.InDelta(t, 2.0, p.Position().Y, 1e-4)
}

func TestApplyDash_ClampedAtBlockingStatic(t *testing.T) {
	space := phy.NewSpace()
	// A blocking prop straddling the dash path at x=1.5.
	wall := phy.NewCircle(phy.Vec2f{X: 1.5, Y: 0}, 0.25)
	wall.Shape().Layer = int(model.LayerPlayerStaticCollision)
	space.AddStaticShape(wall)
	p, s := dashPlayer(space)

	ok := s.applyDash(p, dashEffect(2.5, 0), 1)

	assert.True(t, ok)
	// Stopped short of the wall — the stepped probe never tunneled to 2.5.
	assert.Less(t, p.Position().X, float32(1.5), "clamped before the blocker")
	assert.Greater(t, p.Position().X, float32(0), "still advanced up to the wall")
}

func TestApplyDash_ZeroDistanceFlushAgainstWall(t *testing.T) {
	space := phy.NewSpace()
	// A wall inside the very first probe step: no room to move.
	wall := phy.NewCircle(phy.Vec2f{X: 0.3, Y: 0}, 0.25)
	wall.Shape().Layer = int(model.LayerPlayerStaticCollision)
	space.AddStaticShape(wall)
	p, s := dashPlayer(space)

	ok := s.applyDash(p, dashEffect(2.5, 0), 1)

	assert.True(t, ok, "a dash still fires flush against a wall (no whiff)")
	assert.InDelta(t, 0, p.Position().X, 1e-4, "but displaces nowhere")
}

func TestApplyDash_StopsAtBorder(t *testing.T) {
	space := phy.NewSpace()
	// The InvAABB border wall: the probe hits it only when poking outside.
	wall := phy.NewInvAABB(phy.VEC2F_ZERO, 4, 4) // half-extents 2×2
	wall.Shape().Layer = int(model.LayerBorderCollision)
	space.AddStaticShape(wall)
	p, s := dashPlayer(space)

	s.applyDash(p, dashEffect(5.0, 0), 1) // would overshoot the +X border at 2

	assert.Less(t, p.Position().X, float32(2), "never dashes out of bounds")
}

func TestApplyDash_NonPlayerCasterIsNoop(t *testing.T) {
	s := NewSkillSystem(phy.NewSpace(), nil)
	mob := newFakeMob()

	assert.False(t, s.applyDash(mob, dashEffect(2.5, 0), 1), "mobs cannot dash in v1")
}

func TestDash_CancelsRunningCast(t *testing.T) {
	empty := phy.NewSpace()
	empty.Update()
	caster := newFakePlayer()
	caster.aura = phy.NewCircle(phy.VEC2F_ZERO, 1.0)
	caster.lastMoveDir = phy.Vec2f{X: 1, Y: 0}
	caster.sc.EquipCooldown(0, castNovaDef(), 1) // a 3-tick cast
	caster.sc.EquipCooldown(1, dashDef(), 1)

	sk := NewSkillSystem(empty, nil)
	sk.AddEntity(caster)

	caster.sc.RequestCooldownActivation(0)
	sk.Update(33.0)
	require.True(t, caster.sc.IsCasting())

	// Dash mid-cast: the cast dies for free, the dash fires and displaces.
	caster.sc.RequestCooldownActivation(1)
	sk.Update(33.0)

	assert.False(t, caster.sc.IsCasting(), "dash cancels the running cast")
	assert.InDelta(t, 2.5, caster.Position().X, 1e-4, "dash displaced the caster")
	assert.Equal(t, 0, caster.sc.CooldownSlots[0].CdTicks, "interrupted cast consumes no cooldown")
	assert.Equal(t, 300, caster.sc.CooldownSlots[1].CdTicks, "dash consumed its own cooldown")
}

// --- C0: caster power scale — f(character level) on HP-side values ---
// (plan-content-zones12.md §13 C0, GDD §5: damage / heal / dot / hot / shield
// / self-heal / self-cost scale by the caster's PowerScale; never radius,
// tick rate, target count, or the relative multiplier vocabulary.)

func TestApplyDamageAura_PlayerPowerScaleMultipliesDamage(t *testing.T) {
	caster := newFakePlayer()
	caster.powerScale = 2 // f(level) — e.g. a mid-level player
	target := &touchRecorder{}
	effect := damageEffect(1)
	effect.Damage = &skills.DamageParams{HP: 10}

	applyDamageAura(caster, 1, effect, colliderSetOf(target), testRNG())

	require.Len(t, target.touches, 1)
	assert.InDelta(t, 20, target.touches[0], 1e-6, "10 HP × f 2")
}

func TestApplyDamageAura_MobCaster_PowerScaleMultipliesDamage(t *testing.T) {
	// A mob's PowerScale is its load-time tier+baseline scale f(curveLevel).
	caster := newFakeMob()
	caster.powerScale = 1.2544 // f(3) at growth 1.12
	target := &mobTouchRecorder{}
	effect := skills.EffectDef{
		Type:           skills.EffectTypeDamageAura,
		TargetsEnemies: true,
		Damage:         &skills.DamageParams{HP: 10},
	}

	applyDamageAura(caster, 1, effect, colliderSetOf(target), testRNG())

	require.Len(t, target.factors, 1)
	assert.InDelta(t, 12.544, target.factors[0].Damage, 1e-4)
}

func TestApplyHealAura_PowerScaleMultipliesHealAndSelfCost(t *testing.T) {
	caster := newFakePlayer()
	caster.powerScale = 2
	ally := newFakePlayer()
	ally.vitalSigns.Health = 10 // wounded

	// healEffect: HP 10, SelfDamageHP 2 — both HP-side values scale
	// (GDD §5 lists self-damage explicitly: costs stay proportional to the
	// inflated pool).
	testSkillSystem().applyHealAura(caster, 1, healEffect(), colliderSetOf(model.PlayerEntity(ally)))

	assert.Equal(t, vitals.VitalSign(20), ally.healReceived, "10 HP × f 2")
	assert.Equal(t, vitals.VitalSign(96), caster.vitalSigns.Health, "self-cost 2 × f 2")
}

func TestApplyShieldAura_PowerScaleMultipliesPool(t *testing.T) {
	caster := newFakePlayer()
	caster.powerScale = 2
	ally := &shieldTargetRecorder{basic: ecs.NewBasic()}

	applyShieldAura(caster, 27, 1, shieldEffect(), colliderSetOf(ally))

	require.Len(t, ally.shields, 1)
	assert.InDelta(t, 40, ally.shields[0].hp, 1e-6, "pool 20 × f 2")
}

func TestApplyDotEffect_PlayerPowerScaleFrozenIntoBuff(t *testing.T) {
	caster := newFakePlayer()
	caster.powerScale = 2
	target := &dotRecorder{basic: ecs.NewBasic()}

	applyDotEffect(caster, 5, 1, dotEffect(), colliderSetOf(target))

	require.Len(t, target.dots, 1)
	assert.InDelta(t, 10, target.dots[0].HP, 1e-6, "dot 5 HP × f 2, frozen at application")
}

func TestApplyHotAura_PowerScaleFrozenIntoBuff(t *testing.T) {
	caster := newFakePlayer()
	caster.powerScale = 2
	ally := newFakePlayer()
	ally.vitalSigns.Health = 10 // wounded
	effect := skills.EffectDef{
		Type:         skills.EffectTypeHotAura,
		TickInterval: 20,
		Hot:          &skills.HotParams{HP: 6, TickCount: 3, Interval: 30},
	}

	applyHotAura(caster, 31, 1, effect, colliderSetOf(model.PlayerEntity(ally)))

	require.Len(t, ally.hots, 1)
	assert.InDelta(t, 12, ally.hots[0].hot.HP, 1e-6, "hot 6 HP × f 2, frozen at application")
}

func TestCooldown_SelfHealFlatScalesByPowerScale(t *testing.T) {
	empty := phy.NewSpace()
	empty.Update()

	healDef := &skills.SkillDefinition{
		ID: 21, Name: "FirstAid", Category: skills.SkillCategoryCooldown, MaxLevel: 3, CooldownTicks: 900,
		Effects: []skills.EffectDef{{
			Type:     skills.EffectTypeSelfHeal,
			SelfHeal: &skills.SelfHealParams{HealHP: 20},
		}},
	}
	caster := newFakePlayer()
	caster.powerScale = 2
	caster.aura = phy.NewCircle(phy.VEC2F_ZERO, 1.0)
	caster.vitalSigns.Health = 10
	caster.sc.EquipCooldown(0, healDef, 1)
	caster.sc.RequestCooldownActivation(0)

	sk := NewSkillSystem(empty, nil)
	sk.AddEntity(caster)
	sk.Update(33.0)

	assert.Equal(t, vitals.VitalSign(50), caster.vitalSigns.Health, "10 + flat 20 × f 2")
}

func TestCooldown_SelfHealFractionOfMaxDoesNotDoubleScale(t *testing.T) {
	empty := phy.NewSpace()
	empty.Update()

	// The caster's max HP already carries f — the fraction branch must not
	// multiply by PowerScale again.
	healDef := &skills.SkillDefinition{
		ID: 21, Name: "FirstAid", Category: skills.SkillCategoryCooldown, MaxLevel: 3, CooldownTicks: 900,
		Effects: []skills.EffectDef{{
			Type:     skills.EffectTypeSelfHeal,
			SelfHeal: &skills.SelfHealParams{FractionOfMax: 0.20},
		}},
	}
	caster := newFakePlayer() // maxHealth 100
	caster.powerScale = 2
	caster.aura = phy.NewCircle(phy.VEC2F_ZERO, 1.0)
	caster.vitalSigns.Health = 40
	caster.sc.EquipCooldown(0, healDef, 1)
	caster.sc.RequestCooldownActivation(0)

	sk := NewSkillSystem(empty, nil)
	sk.AddEntity(caster)
	sk.Update(33.0)

	assert.Equal(t, vitals.VitalSign(60), caster.vitalSigns.Health,
		"40 + 20% of max 100 — the fraction rides max HP, not f twice")
}

func TestApplyDamageAura_OwnedCaster_ComposesOwnerCurveScale(t *testing.T) {
	// An owned summon rides the owner's f(level) on top of the linear
	// SummonPower knob (C0 PO decision: summons stay same-tier-relevant).
	// Since chunk 1b the curve arrives through the summon's OWN PowerScale —
	// it stands at its owner's level — instead of casterPowerScale
	// multiplying the owner's in a second time (landmine L3). The product is
	// unchanged, which is why no shipped summon's output moved.
	owner := newFakePlayer()
	owner.level = 7
	totem := newTestTotem(owner)
	totem.SetSummonPowerPerLevel(0.05) // 1 + (7-1)x0.05 = 1.3
	f7 := float32(math.Pow(1.12, 6))
	require.InDelta(t, f7, totem.PowerScale(), 1e-6, "the summon evaluates f at the owner's level")

	target := &touchRecorder{}
	effect := damageEffect(1)
	effect.Damage = &skills.DamageParams{HP: 10}

	applyDamageAura(totem, 1, effect, colliderSetOf(target), testRNG())

	require.Len(t, target.touches, 1)
	assert.InDelta(t, 10*1.3*f7, target.touches[0], 1e-5, "10 HP × power 1.3 × f(owner level 7)")
}

// --- combat factors are conf knobs (backlog §25 B) ---
//
// defaultCritFactor and healerThreatFactor used to be Go consts needing a
// rebuild, while the critChance one of them multiplies was already a conf.json
// value — the same mechanic on two workflows. They are now game.combat entries,
// read through accessors that normalize a zero value back to the built-in
// default so hand-built GameConfigs (the sim harness, most tests here) and a
// nil game keep today's behaviour exactly.

func TestCombatFactors_ZeroValueFallsBackToBuiltInDefaults(t *testing.T) {
	t.Cleanup(func() { SetCombatFactors(cfg.CombatConfig{}) })

	SetCombatFactors(cfg.CombatConfig{}) // conf.json without a game.combat block
	assert.Equal(t, float32(cfg.DefaultCritFactor), critFactor())
	assert.Equal(t, float32(cfg.DefaultHealerThreatFactor), healerThreatFactor())
}

func TestCombatFactors_ComeFromConfig(t *testing.T) {
	t.Cleanup(func() { SetCombatFactors(cfg.CombatConfig{}) })

	SetCombatFactors(cfg.CombatConfig{DefaultCritFactor: 3.5, HealerThreatFactor: 0.25})
	assert.Equal(t, float32(3.5), critFactor())
	assert.Equal(t, float32(0.25), healerThreatFactor())
}

// The configured factor must reach the actual hit composition, not just the
// accessor — this is the pin that would fail if rollHitDamage kept a const.
func TestApplyDamageAura_ConfiguredCritFactorDrivesTheHit(t *testing.T) {
	t.Cleanup(func() { SetCombatFactors(cfg.CombatConfig{}) })
	SetCombatFactors(cfg.CombatConfig{DefaultCritFactor: 5})

	target := &touchRecorder{}
	effect := damageEffect(1)
	effect.Damage = &skills.DamageParams{HP: 10, CritChance: 1} // always crits, authors no factor

	applyDamageAura(newFakePlayer(), 1, effect, colliderSetOf(target), testRNG())

	require.Len(t, target.touches, 1)
	assert.InDelta(t, 50.0, target.touches[0], 1e-4, "10 HP × the configured factor 5")
}

// --- calm cooldown + the per-skill faction allowlist (plan-faction-flips
// chunk 2, D7/D8) ---

// The two content factions the calm tests scope against. Bits, not names —
// names exist only at content load (the faction registry is boot-only), which
// is exactly why the allowlist is resolved to a mask there.
const (
	calmTestPrey   = factions.Faction(2)
	calmTestBandit = factions.Faction(3)
)

func calmTestMob(f factions.Faction) *mob.Mob {
	def := hostileMobDef()
	def.Faction = f
	def.AggroMask = factions.Bit(factions.Aligned)
	return mob.NewMob(def, 0, nil)
}

// calmDef is the skill under test. mask is what the loader would have produced
// from the authored targetFactions names.
func calmDef(mask uint64) *skills.SkillDefinition {
	return &skills.SkillDefinition{
		ID: 62, Name: "Calm", Category: skills.SkillCategoryCooldown, MaxLevel: 3, CooldownTicks: 600,
		TargetFactionMask: mask,
		Effects: []skills.EffectDef{{
			Type: skills.EffectTypeCalm, Radius: 4.0, TargetsEnemies: true,
			TargetFactionMask: mask,
			Calm:              &skills.CalmParams{DurationTicks: 300, DurationTicksPerLevel: 60},
		}},
	}
}

func TestCooldown_CalmPutsAnAllowedFactionOutOfCombat(t *testing.T) {
	m := calmTestMob(calmTestPrey)

	caster, sk := cooldownCaster(spaceWithBurstTarget(int(model.LayerActionCollision), m))
	caster.sc.EquipCooldown(0, calmDef(factions.Bit(calmTestPrey)), 1)
	caster.sc.RequestCooldownActivation(0)

	sk.Update(33.0)

	assert.True(t, m.Calmed(), "a mob in the allowlist is calmed")
	assert.Equal(t, 600, caster.sc.CooldownSlots[0].CdTicks, "cooldown consumed")
}

func TestCooldown_CalmSkipsAFactionOutsideTheAllowlist(t *testing.T) {
	// D8: the skill decides which factions it reaches. A bandit is just as
	// hostile and just as in-range as a boar; the allowlist is the only thing
	// standing between them.
	m := calmTestMob(calmTestBandit)

	caster, sk := cooldownCaster(spaceWithBurstTarget(int(model.LayerActionCollision), m))
	caster.sc.EquipCooldown(0, calmDef(factions.Bit(calmTestPrey)), 1)
	caster.sc.RequestCooldownActivation(0)

	sk.Update(33.0)

	assert.False(t, m.Calmed(), "an unlisted faction is not a valid target")
}

// TestCooldown_CalmScopeIsDataNotCode is L-L: the PO authored TWO scoped spells
// specifically to prove the mechanism is content. If reaching a different
// faction ever needs a Go change, the scope was hardcoded — that is the failure
// named in advance. Here the ONLY difference between the two casts is the mask
// the loader resolved.
func TestCooldown_CalmScopeIsDataNotCode(t *testing.T) {
	m := calmTestMob(calmTestBandit)

	caster, sk := cooldownCaster(spaceWithBurstTarget(int(model.LayerActionCollision), m))
	caster.sc.EquipCooldown(0, calmDef(factions.Bit(calmTestBandit)), 1)
	caster.sc.RequestCooldownActivation(0)

	sk.Update(33.0)

	assert.True(t, m.Calmed(), "a second skill scoped to another faction needs no engine change")
}

func TestCooldown_CalmDurationScalesWithLevel(t *testing.T) {
	// 300 + 60 per level over the level-1 baseline: level 3 = 420 ticks.
	m := calmTestMob(calmTestPrey)

	caster, sk := cooldownCaster(spaceWithBurstTarget(int(model.LayerActionCollision), m))
	caster.sc.EquipCooldown(0, calmDef(factions.Bit(calmTestPrey)), 3)
	caster.sc.RequestCooldownActivation(0)

	sk.Update(33.0)
	require.True(t, m.Calmed())

	for i := 0; i < 419; i++ {
		m.ResetTickNumbers()
	}
	assert.True(t, m.Calmed(), "a level-3 calm lasts 420 ticks, not 300")
	m.ResetTickNumbers()
	assert.False(t, m.Calmed())
}

func TestCooldown_CalmSkipsAlliedTarget(t *testing.T) {
	m := calmTestMob(calmTestPrey)
	m.Align() // a summon/companion — same faction as the caster

	caster, sk := cooldownCaster(spaceWithBurstTarget(int(model.LayerPlayerCollision), m))
	caster.sc.EquipCooldown(0, calmDef(factions.Bit(calmTestPrey)), 1)
	caster.sc.RequestCooldownActivation(0)

	sk.Update(33.0)

	assert.False(t, m.Calmed(), "targetsEnemies gates out same-faction targets — no calming your own pet")
}

// --- charm: attribution + the cooldown (plan-faction-flips chunk 3, D2/D3/D8) ---

// charmDef is the skill under test. mask is what the loader would have produced
// from the authored targetFactions names; maxTargets 1 + nearest is D3 (no
// target-clicking — you walk to the mob you want).
func charmDef(mask uint64) *skills.SkillDefinition {
	return &skills.SkillDefinition{
		ID: 63, Name: "CharmBeast", Category: skills.SkillCategoryCooldown, MaxLevel: 3, CooldownTicks: 3600,
		TargetFactionMask: mask,
		Effects: []skills.EffectDef{{
			Type: skills.EffectTypeCharm, Radius: 4.0, TargetsEnemies: true,
			MaxTargets: 1, Selector: skills.SelectorNearest,
			TargetFactionMask: mask,
			Charm:             &skills.CharmParams{DurationTicks: 1800, DurationTicksPerLevel: 300},
		}},
	}
}

func TestCharmedMobAuraDamage_CreditsTheCharmerNotItself(t *testing.T) {
	// D2's whole point: a charmed mob's kills feed its charmer's XP through the
	// player reward path, exactly as an owned summon's do — while the mob itself
	// stays ownerless. Without the Credited dispatch this falls into MobTouches
	// and nobody gets anything.
	charmer := newFakePlayer()
	wolf := mob.NewMob(hostileMobDef(), 0, nil)
	wolf.Charm(charmer, 63, 1800)

	targetDef := testMobDef()
	targetDef.Factors.Experience = 42
	target := mob.NewMob(targetDef, 0, nil)

	effect := damageEffect(1)
	effect.Damage = &skills.DamageParams{HP: 1000} // overkill

	applyDamageAura(wolf, 1, effect, colliderSetOf(target), testRNG())

	assert.Equal(t, vitals.VitalSign(0), target.Health(), "the pet's hit lands")
	assert.Equal(t, []uint64{42}, charmer.xp, "kill XP rides PlayerTouches(charmer)")
	assert.Nil(t, wolf.Owner(), "…and it is still nobody's summon")
}

func TestCharmedMobAuraDamage_UsesItsOwnPowerNotItsCharmers(t *testing.T) {
	// The stat half of D2. applyPlayerDamageAura already splits caster
	// (attribution) from acting (stats); this pins that a charmed mob composes
	// its own output — no SummonPower knob, no charmer's crit or damage factor.
	charmer := newFakePlayer()
	charmer.level = 30
	charmer.powerScale = 8 // a maxed player's inflation
	wolf := mob.NewMob(hostileMobDef(), 0, nil)
	wolf.Charm(charmer, 63, 1800)

	target := &touchRecorder{}
	effect := damageEffect(1)
	effect.Damage = &skills.DamageParams{HP: 10}

	applyDamageAura(wolf, 1, effect, colliderSetOf(target), testRNG())

	require.Len(t, target.touches, 1)
	assert.InDelta(t, 10.0, target.touches[0], 1e-4,
		"the wolf's own f(level)=1 drives the hit, not the charmer's ×8")
}

func TestCooldown_CharmTakesTheNearestAllowedMob(t *testing.T) {
	m := calmTestMob(calmTestPrey)

	caster, sk := cooldownCaster(spaceWithBurstTarget(int(model.LayerActionCollision), m))
	caster.sc.EquipCooldown(0, charmDef(factions.Bit(calmTestPrey)), 1)
	caster.sc.RequestCooldownActivation(0)

	sk.Update(33.0)

	assert.Equal(t, model.FactionAligned, m.Faction(), "it fights on the player side now")
	assert.Equal(t, model.PlayerEntity(caster), m.CreditTo())
	assert.Equal(t, 3600, caster.sc.CooldownSlots[0].CdTicks, "cooldown consumed")
}

func TestCooldown_CharmSkipsAFactionOutsideTheAllowlist(t *testing.T) {
	m := calmTestMob(calmTestBandit)

	caster, sk := cooldownCaster(spaceWithBurstTarget(int(model.LayerActionCollision), m))
	caster.sc.EquipCooldown(0, charmDef(factions.Bit(calmTestPrey)), 1)
	caster.sc.RequestCooldownActivation(0)

	sk.Update(33.0)

	assert.NotEqual(t, model.FactionAligned, m.Faction(), "an unlisted faction is not charmable")
	assert.Nil(t, m.CreditTo())
}

// TestCooldown_CharmScopeIsDataNotCode is L-L for charm: the PO authored TWO
// charm spells (wildlife and elementals) precisely so that reaching a different
// faction is a JSON edit. The only difference between the two casts here is the
// mask the loader resolved.
func TestCooldown_CharmScopeIsDataNotCode(t *testing.T) {
	m := calmTestMob(calmTestBandit)

	caster, sk := cooldownCaster(spaceWithBurstTarget(int(model.LayerActionCollision), m))
	caster.sc.EquipCooldown(0, charmDef(factions.Bit(calmTestBandit)), 1)
	caster.sc.RequestCooldownActivation(0)

	sk.Update(33.0)

	assert.Equal(t, model.FactionAligned, m.Faction(),
		"a second charm scoped to another faction needs no engine change")
}

func TestCooldown_CharmPassesOverAnAlreadyCharmedMob(t *testing.T) {
	// D11, and the audit finding that it needs no code: a charmed mob IS
	// player-aligned, so targetsEnemies rejects it — and its faction is no
	// longer in the allowlist either. Two independent existing gates, which is
	// why this is a pin rather than a branch.
	m := calmTestMob(calmTestPrey)
	first := newFakePlayer()
	m.Charm(first, 63, 1800)

	caster, sk := cooldownCaster(spaceWithBurstTarget(int(model.LayerPlayerCollision), m))
	caster.sc.EquipCooldown(0, charmDef(factions.Bit(calmTestPrey)), 1)
	caster.sc.RequestCooldownActivation(0)

	sk.Update(33.0)

	assert.Equal(t, model.PlayerEntity(first), m.CreditTo(), "no pet stealing, no timer refresh")
}

func TestCooldown_CharmDurationScalesWithLevel(t *testing.T) {
	// 1800 + 300 per level over the level-1 baseline: level 3 = 2400 ticks.
	m := calmTestMob(calmTestPrey)

	caster, sk := cooldownCaster(spaceWithBurstTarget(int(model.LayerActionCollision), m))
	caster.sc.EquipCooldown(0, charmDef(factions.Bit(calmTestPrey)), 3)
	caster.sc.RequestCooldownActivation(0)

	sk.Update(33.0)
	require.Equal(t, model.FactionAligned, m.Faction())

	for i := 0; i < 2399; i++ {
		m.ResetTickNumbers()
	}
	require.True(t, m.Update(0))
	assert.Equal(t, model.FactionAligned, m.Faction(), "a level-3 charm lasts 2400 ticks, not 1800")

	m.ResetTickNumbers()
	require.True(t, m.Update(0))
	assert.NotEqual(t, model.FactionAligned, m.Faction(), "…and reverts the tick it runs out")
}

// --- speed_burst: Swift as a cooldown. Self-targeted, so unlike the burst
// cooldowns there is no query circle and no target — the assertions are on the
// caster's own composed movement factor. ---

func speedBurstDef() *skills.SkillDefinition {
	return &skills.SkillDefinition{
		ID: 10, Name: "Swift", Category: skills.SkillCategoryCooldown, MaxLevel: 3,
		CooldownTicks: 600, CooldownTicksPerLevel: -60,
		Effects: []skills.EffectDef{{
			Type: skills.EffectTypeSpeedBurst,
			Speed: &skills.SpeedParams{
				Factor: 1.5, FactorPerLevel: 0.1,
				DurationTicks: 150, DurationTicksPerLevel: 30,
			},
		}},
	}
}

func TestCooldown_SpeedBurstBuffsTheCaster(t *testing.T) {
	caster := newFakePlayer()
	caster.aura = phy.NewCircle(phy.VEC2F_ZERO, 1.0)
	caster.sc.EquipCooldown(0, speedBurstDef(), 1)
	sk := NewSkillSystem(phy.NewSpace(), nil)
	sk.AddEntity(caster)

	require.InDelta(t, 1.0, caster.buffs.MovementFactor(), 1e-6, "no sprint before firing")

	caster.sc.RequestCooldownActivation(0)
	sk.Update(33.0)

	assert.InDelta(t, 1.5, caster.buffs.MovementFactor(), 1e-6, "the sprint is live")
	assert.Equal(t, 600, caster.sc.CooldownSlots[0].CdTicks, "cooldown starts after firing")
}

func TestCooldown_SpeedBurstScalesWithLevel(t *testing.T) {
	caster := newFakePlayer()
	caster.aura = phy.NewCircle(phy.VEC2F_ZERO, 1.0)
	caster.sc.EquipCooldown(0, speedBurstDef(), 3)
	sk := NewSkillSystem(phy.NewSpace(), nil)
	sk.AddEntity(caster)

	caster.sc.RequestCooldownActivation(0)
	sk.Update(33.0)

	assert.InDelta(t, 1.7, caster.buffs.MovementFactor(), 1e-6, "1.5 + 2×0.1")
	assert.Equal(t, 480, caster.sc.CooldownSlots[0].CdTicks, "600 − 2×60")
}

func TestCooldown_SpeedBurstExpires(t *testing.T) {
	// The duration is what makes it a burst rather than a passive: it has to
	// run out on its own, with no expiry hook anywhere.
	caster := newFakePlayer()
	caster.aura = phy.NewCircle(phy.VEC2F_ZERO, 1.0)
	def := speedBurstDef()
	def.Effects[0].Speed.DurationTicks = 3
	def.Effects[0].Speed.DurationTicksPerLevel = 0
	caster.sc.EquipCooldown(0, def, 1)
	sk := NewSkillSystem(phy.NewSpace(), nil)
	sk.AddEntity(caster)

	caster.sc.RequestCooldownActivation(0)
	sk.Update(33.0)
	require.InDelta(t, 1.5, caster.buffs.MovementFactor(), 1e-6)

	for i := 0; i < 3; i++ {
		caster.buffs.Tick()
	}
	assert.InDelta(t, 1.0, caster.buffs.MovementFactor(), 1e-6, "back to normal pace")
}

func TestCooldown_SpeedBurstSetsThePip(t *testing.T) {
	// The only client tell besides moving faster (bit 7 of applied_effects).
	caster := newFakePlayer()
	caster.aura = phy.NewCircle(phy.VEC2F_ZERO, 1.0)
	caster.sc.EquipCooldown(0, speedBurstDef(), 1)
	sk := NewSkillSystem(phy.NewSpace(), nil)
	sk.AddEntity(caster)

	caster.sc.RequestCooldownActivation(0)
	sk.Update(33.0)

	assert.NotZero(t, caster.buffs.AppliedEffects()&skills.AppliedEffectSpeed,
		"a sprinting caster carries the speed pip")
}
