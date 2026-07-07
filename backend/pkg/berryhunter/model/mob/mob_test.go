package mob

// Characterization tests pinning the CURRENT hardcoded mob aura behavior.
// They are the "old" side of the Phase 6 strict 1:1 migration comparison
// (docs/plan-skill-system.md, Phase 6): once mobs move onto the SkillSystem,
// the new path must reproduce exactly these numbers and rules. Any deviation
// from these tests during the migration is a bug, not a design change.

import (
	"testing"

	"github.com/EngoEngine/ecs"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/trichner/berryhunter/pkg/berryhunter/items/mobs"
	"github.com/trichner/berryhunter/pkg/berryhunter/model"
	"github.com/trichner/berryhunter/pkg/berryhunter/model/constant"
	"github.com/trichner/berryhunter/pkg/berryhunter/model/vitals"
	"github.com/trichner/berryhunter/pkg/berryhunter/phy"
	"github.com/trichner/berryhunter/pkg/berryhunter/skills"
)

func testAuraSkill() *skills.SkillDefinition {
	return &skills.SkillDefinition{
		ID: 199, Name: "TestMobAura", Category: skills.SkillCategoryActiveAura, MaxLevel: 5,
		Effects: []skills.EffectDef{{
			Type:           skills.EffectTypeDamageAura,
			Radius:         0.5,
			TargetsPlayers: true,
			TickInterval:   1,
			Damage:         &skills.DamageParams{HP: 0.05},
		}},
	}
}

func testMobDefinition() *mobs.MobDefinition {
	return &mobs.MobDefinition{
		ID:   1,
		Name: "Dodo", // must be a valid BerryhunterApi entity type name
		Factors: mobs.Factors{
			Speed:      1.0,
			Experience: 42,
		},
		Body: mobs.Body{
			Radius:      0.3,
			AggroRadius: 2.0,
		},
		Skills: []mobs.MobSkill{{Def: testAuraSkill(), Level: 1}},
	}
}

func newTestMob() *Mob {
	return NewMob(testMobDefinition(), false, 0, 0)
}

// fakeAuraPlayer implements the slices of model.PlayerEntity that the mob
// interacts with. Unimplemented methods panic via the embedded nil interface.
type fakeAuraPlayer struct {
	model.PlayerEntity
	basic   ecs.BasicEntity
	pos     phy.Vec2f
	radius  float32
	vs      model.PlayerVitalSigns
	xp      []uint64
	healers []model.PlayerEntity
	sc      *skills.SkillComponent
}

func (f *fakeAuraPlayer) Basic() ecs.BasicEntity                 { return f.basic }
func (f *fakeAuraPlayer) Position() phy.Vec2f                    { return f.pos }
func (f *fakeAuraPlayer) Radius() float32                        { return f.radius }
func (f *fakeAuraPlayer) VitalSigns() *model.PlayerVitalSigns    { return &f.vs }
func (f *fakeAuraPlayer) AddExperience(xp uint64)                { f.xp = append(f.xp, xp) }
func (f *fakeAuraPlayer) RecentHealers() []model.PlayerEntity    { return f.healers }
func (f *fakeAuraPlayer) SkillComponent() *skills.SkillComponent { return f.sc }
func (f *fakeAuraPlayer) ApplyRecipeCascade()                    {}

func newFakeAuraPlayer() *fakeAuraPlayer {
	return &fakeAuraPlayer{
		basic:  ecs.NewBasic(),
		radius: 0.25,
		vs:     model.PlayerVitalSigns{Health: vitals.Max},
		sc:     skills.NewSkillComponent(true),
	}
}

// --- spawn HP roll (item 11 Phase 3, decision C1/C2) ---

func TestNewMob_MaxHealthVarianceRollsWithinBand(t *testing.T) {
	def := testMobDefinition()
	def.Factors.MaxHealth = 1000
	def.Factors.MaxHealthVariance = 0.1

	seen := map[vitals.VitalSign]bool{}
	for i := 0; i < 16; i++ {
		m := NewMob(def, false, 0, 0)
		hp := m.MaxHealth()
		if hp < 900 || hp > 1100 {
			t.Fatalf("rolled maxHealth %d outside band [900, 1100]", hp)
		}
		assert.Equal(t, hp, m.Health(), "mob must spawn at its rolled full HP")
		seen[hp] = true
	}
	assert.Greater(t, len(seen), 1,
		"16 spawns with a ±10%% band on 1000 HP must not all roll identical")
}

func TestNewMob_ZeroVarianceIsExactBase(t *testing.T) {
	def := testMobDefinition()
	def.Factors.MaxHealth = 1000

	m := NewMob(def, false, 0, 0)
	assert.Equal(t, vitals.VitalSign(1000), m.MaxHealth(),
		"no variance → maxHealth is exactly the authored base")
}

func TestNewMob_VarianceRollNeverBelowOneHP(t *testing.T) {
	def := testMobDefinition()
	def.Factors.MaxHealth = 1
	def.Factors.MaxHealthVariance = 0.9

	for i := 0; i < 16; i++ {
		m := NewMob(def, false, 0, 0)
		assert.GreaterOrEqual(t, m.MaxHealth(), vitals.VitalSign(1),
			"a rolled HP pool must never reach 0 (min-1)")
	}
}

// --- damage intake (what player auras do to the mob) ---

func TestMob_PlayerTouches_UnresistedFullDamage(t *testing.T) {
	m := newTestMob() // maxHealth 100 (default), no resistances

	m.PlayerTouches(newFakeAuraPlayer(), model.Damage{HP: 10, Tags: []string{"physical"}})

	assert.Equal(t, m.MaxHealth()-10, m.Health(),
		"a tag without a resistance entry lands at full value")
	assert.Contains(t, m.StatusEffects().Effects(), model.StatusEffectDamagedAmbient)
}

func TestMob_PlayerTouches_AppliesTagResistance(t *testing.T) {
	def := testMobDefinition()
	def.Factors.Resistances = map[string]float32{"fire": 0.5}
	m := NewMob(def, false, 0, 0)

	m.PlayerTouches(newFakeAuraPlayer(), model.Damage{HP: 10, Tags: []string{"fire"}})

	assert.Equal(t, m.MaxHealth()-5, m.Health(),
		"incoming damage is scaled by the matching tag's resistance multiplier")
}

func TestMob_PlayerTouches_ResistancesMultiplyAcrossTags(t *testing.T) {
	def := testMobDefinition()
	def.Factors.Resistances = map[string]float32{"fire": 0.5, "boss_x_lava": 0.5}
	m := NewMob(def, false, 0, 0)

	// General + bespoke resistance compose multiplicatively: 10 × 0.5 × 0.5 = 2.5 → 3 (rounded).
	m.PlayerTouches(newFakeAuraPlayer(), model.Damage{HP: 10, Tags: []string{"fire", "boss_x_lava"}})

	assert.Equal(t, m.MaxHealth()-3, m.Health())
}

func TestMob_PlayerTouches_ImmuneTagNoHit(t *testing.T) {
	def := testMobDefinition()
	def.Factors.Resistances = map[string]float32{"fire": 0}
	m := NewMob(def, false, 0, 0)

	// Multiplier 0 = immune: no health loss, no floating number, no status effect
	// (and therefore no hit VFX) — the hit simply does not exist for the target.
	m.PlayerTouches(newFakeAuraPlayer(), model.Damage{HP: 10, Tags: []string{"fire"}})

	assert.Equal(t, m.MaxHealth(), m.Health())
	assert.Zero(t, m.DamageTaken())
	assert.NotContains(t, m.StatusEffects().Effects(), model.StatusEffectDamagedAmbient)
}

func TestMob_PlayerTouches_VulnerabilityTagAboveOne(t *testing.T) {
	def := testMobDefinition()
	def.Factors.Resistances = map[string]float32{"fire": 1.5}
	m := NewMob(def, false, 0, 0)

	m.PlayerTouches(newFakeAuraPlayer(), model.Damage{HP: 10, Tags: []string{"fire"}})

	assert.Equal(t, m.MaxHealth()-15, m.Health(),
		"a multiplier above 1 is a vulnerability to that tag")
}

func TestMob_PlayerTouches_MinOneHP(t *testing.T) {
	def := testMobDefinition()
	def.Factors.Resistances = map[string]float32{"fire": 0.01}
	m := NewMob(def, false, 0, 0)

	// A sub-1-HP hit still removes at least 1 HP (min-1 rule, item 11 Phase 1) —
	// a real hit never rounds away to nothing, including heavily resisted ones.
	m.PlayerTouches(newFakeAuraPlayer(), model.Damage{HP: 0.001})
	m.PlayerTouches(newFakeAuraPlayer(), model.Damage{HP: 10, Tags: []string{"fire"}})

	assert.Equal(t, m.MaxHealth()-2, m.Health())
}

func TestMob_DamageTaken_AccumulatesAndResets(t *testing.T) {
	m := newTestMob() // starts at full health

	m.PlayerTouches(newFakeAuraPlayer(), model.Damage{HP: 10})
	m.PlayerTouches(newFakeAuraPlayer(), model.Damage{HP: 5})

	assert.Equal(t, m.MaxHealth()-m.Health(), m.DamageTaken(),
		"DamageTaken sums the actual health lost this tick")
	assert.NotZero(t, m.DamageTaken())

	m.ResetTickNumbers()
	assert.Zero(t, m.DamageTaken(), "reset clears the per-tick accumulator")
}

func TestMob_AuraHitStyle_SetAndReset(t *testing.T) {
	m := newTestMob()

	assert.Equal(t, model.AuraHitStyleNone, m.AuraHitStyle(), "no aura hit yet")

	m.NoteAuraHit(model.AuraHitStyleSlash)
	assert.Equal(t, model.AuraHitStyleSlash, m.AuraHitStyle(),
		"NoteAuraHit records the style for this tick")

	m.ResetTickNumbers()
	assert.Equal(t, model.AuraHitStyleNone, m.AuraHitStyle(),
		"reset clears the per-tick aura-hit style")
}

// --- kill rewards (participation XP, roadmap item 10) ---

func TestMob_Kill_AllDamagersGetFullXP(t *testing.T) {
	m := newTestMob()
	attacker := newFakeAuraPlayer()
	finisher := newFakeAuraPlayer()

	m.PlayerTouches(attacker, model.Damage{HP: 5})    // participates, doesn't kill
	m.PlayerTouches(finisher, model.Damage{HP: 1000}) // kill (overkill vs. 100 HP)

	assert.Equal(t, []uint64{42}, attacker.xp, "every damage participant gets the full XP")
	assert.Equal(t, []uint64{42}, finisher.xp)
}

func TestMob_Kill_RecentHealerOfParticipantGetsXP(t *testing.T) {
	m := newTestMob()
	damager := newFakeAuraPlayer()
	healer := newFakeAuraPlayer()
	damager.healers = []model.PlayerEntity{healer}

	m.PlayerTouches(damager, model.Damage{HP: 1000}) // kill

	assert.Equal(t, []uint64{42}, healer.xp,
		"healing a participant within the window counts as participating")
	assert.Equal(t, []uint64{42}, damager.xp)
}

func TestMob_Kill_HealerWhoAlsoDamagedGetsXPOnce(t *testing.T) {
	m := newTestMob()
	damager := newFakeAuraPlayer()
	hybrid := newFakeAuraPlayer() // damages AND heals the other damager
	damager.healers = []model.PlayerEntity{hybrid}

	m.PlayerTouches(hybrid, model.Damage{HP: 5})
	m.PlayerTouches(damager, model.Damage{HP: 1000}) // kill

	assert.Equal(t, []uint64{42}, hybrid.xp, "no double grant for damager+healer")
}

// --- kill unlocks (Phase 6.2) ---

func TestMob_Kill_GuaranteedUnlockGoesToAllRewardedPlayers(t *testing.T) {
	unlockSkill := &skills.SkillDefinition{ID: 3, Name: "WildAura", Category: skills.SkillCategoryActiveAura, MaxLevel: 5}
	d := testMobDefinition()
	d.Unlocks = []mobs.MobUnlock{{Skill: unlockSkill, Chance: 1.0}}
	m := NewMob(d, false, 0, 0)

	damager := newFakeAuraPlayer()
	healer := newFakeAuraPlayer()
	damager.healers = []model.PlayerEntity{healer}
	finisher := newFakeAuraPlayer()

	m.PlayerTouches(damager, model.Damage{HP: 5})
	m.PlayerTouches(finisher, model.Damage{HP: 1000}) // kill

	for name, p := range map[string]*fakeAuraPlayer{"damager": damager, "healer": healer, "finisher": finisher} {
		assert.True(t, p.sc.HasDiscovered(unlockSkill.ID),
			"%s must roll (and win) the guaranteed unlock", name)
	}
}

func TestMob_Kill_NoUnlocksDeclared_NoDiscovery(t *testing.T) {
	m := newTestMob()
	p := newFakeAuraPlayer()

	m.PlayerTouches(p, model.Damage{HP: 1000})

	assert.Empty(t, p.sc.Discovered())
}

func TestMob_FullOutOfCombatRegenClearsParticipants(t *testing.T) {
	m := newTestMob()
	early := newFakeAuraPlayer()
	m.PlayerTouches(early, model.Damage{HP: 5})

	// No aggro target → out-of-combat regen runs; let it reach full health.
	for i := 0; i < 3*constant.TicksPerSecond && m.Health() < m.MaxHealth(); i++ {
		m.Update(0)
	}
	require.Equal(t, m.MaxHealth(), m.Health(), "mob must fully regenerate")

	killer := newFakeAuraPlayer()
	m.PlayerTouches(killer, model.Damage{HP: 1000})

	assert.Empty(t, early.xp, "full regen is a combat reset — earlier participants are cleared")
	assert.Equal(t, []uint64{42}, killer.xp)
}

func TestMob_KillGrantsExperienceExactlyOnce(t *testing.T) {
	m := newTestMob()
	p := newFakeAuraPlayer()

	m.PlayerTouches(p, model.Damage{HP: 1000}) // overkill vs. 100 HP, health clamps to 0

	require.Equal(t, vitals.VitalSign(0), m.Health())
	require.Equal(t, []uint64{42}, p.xp, "killer receives Factors.Experience")

	// A second touch on the corpse must not grant rewards again.
	m.PlayerTouches(p, model.Damage{HP: 1000})
	assert.Equal(t, []uint64{42}, p.xp)
}

func TestMob_Update_DeadMobWithAggroTargetIsRemoved(t *testing.T) {
	m := newTestMob()
	m.SetPosition(phy.Vec2f{X: 1, Y: 1}) // initializes spawn territory
	p := newFakeAuraPlayer()
	p.pos = phy.Vec2f{X: 1.2, Y: 1}
	m.aggroTarget = p
	m.health = 0

	assert.False(t, m.Update(0),
		"a dead mob that still has an aggro target reports death and gets removed")
}

// TestMob_Update_DeadMobWithoutAggro_Dies pins the fix for the former zombie
// bug: Update used to apply out-of-combat regeneration BEFORE the death check,
// so a mob that reached 0 health while it had no aggro target (kited out of
// its territory) healed itself above zero in the same tick and survived —
// with deathRewardGiven latched, never granting XP or drops again. The death
// check now runs before regeneration.
func TestMob_Update_DeadMobWithoutAggro_Dies(t *testing.T) {
	m := newTestMob()
	m.health = 0 // dead, but no aggro target and no spawn set

	alive := m.Update(0)

	assert.False(t, alive, "a dead mob must die even without an aggro target")
	assert.Equal(t, uint32(0), uint32(m.Health()),
		"out-of-combat regen must not run on a dead mob")
}

// --- skill loadout wiring (Phase 6.1: damage application itself lives in the
// SkillSystem; see sys/skills_behavior_test.go for the mob-caster path) ---

func TestNewMob_SkillLoadoutWiring(t *testing.T) {
	m := newTestMob()

	sc := m.SkillComponent()
	require.NotNil(t, sc.AuraSlots[0])
	assert.Equal(t, "TestMobAura", sc.AuraSlots[0].Def.Name)
	assert.Equal(t, 0, sc.ActiveAuraSlot, "slot 0 is active from spawn")
	assert.Nil(t, sc.Spellbook, "mobs have no spellbook")
}

func TestNewMob_AuraSensorWiring(t *testing.T) {
	m := newTestMob()

	aura := m.AuraCollider()
	assert.True(t, aura.Shape().IsSensor)
	assert.InDelta(t, 0.5, aura.Radius, 1e-6, "radius = active skill's EffectiveRadius")
	assert.Equal(t, int(model.LayerPlayerCollision), aura.Shape().Mask,
		"mask derived from the active skill's target flags")
	assert.Equal(t, int(model.LayerNoneCollision), aura.Shape().Layer)
}

func TestNewMob_NoSkills_InertSensor(t *testing.T) {
	d := testMobDefinition()
	d.Skills = nil
	m := NewMob(d, false, 0, 0)

	assert.Equal(t, -1, m.SkillComponent().ActiveAuraSlot)
	assert.InDelta(t, 0.0, m.AuraCollider().Radius, 1e-6)
	assert.Equal(t, int(model.LayerNoneCollision), m.AuraCollider().Shape().Mask)
}

// --- aggro ---

func TestNewMob_AggroRadiusFromBody(t *testing.T) {
	m := newTestMob()

	assert.InDelta(t, 2.0, m.aggroAura.Radius, 1e-6)
}

func TestMob_StopsChasingInsideAuraStopDistance(t *testing.T) {
	m := newTestMob() // at origin; default chaseIntoAuraMargin 0.05
	p := newFakeAuraPlayer()
	m.aggroTarget = p

	// stopDistance = damageAura.Radius + player.Radius - margin = 0.5 + 0.25 - 0.05 = 0.7
	p.pos = phy.Vec2f{X: 0.8, Y: 0}
	assert.True(t, m.shouldApproachAggroTarget(), "outside stop distance → keep approaching")

	p.pos = phy.Vec2f{X: 0.6, Y: 0}
	assert.False(t, m.shouldApproachAggroTarget(), "inside stop distance → hold position")
}

func TestMob_FindAggroTarget_PicksNearestLivingPlayer(t *testing.T) {
	m := newTestMob()

	near := newFakeAuraPlayer()
	near.pos = phy.Vec2f{X: 0.5, Y: 0}
	far := newFakeAuraPlayer()
	far.pos = phy.Vec2f{X: 1.5, Y: 0}
	dead := newFakeAuraPlayer()
	dead.pos = phy.Vec2f{X: 0.1, Y: 0}
	dead.vs.Health = 0

	space := phy.NewSpace()
	space.AddShape(m.aggroAura)
	for _, p := range []*fakeAuraPlayer{near, far, dead} {
		c := phy.NewCircle(p.pos, 0.25)
		c.Shape().IsSensor = true
		c.Shape().Layer = int(model.LayerPlayerCollision)
		c.Shape().UserData = model.PlayerEntity(p)
		space.AddShape(c)
	}
	space.Update()
	require.NotEmpty(t, m.aggroAura.Collisions())

	target := m.findAggroTarget()

	require.NotNil(t, target)
	assert.Same(t, near, target, "nearest living player wins; dead players are ignored")
}

// --- out-of-combat regeneration ---

func TestMob_RegeneratesOutOfCombat(t *testing.T) {
	m := newTestMob() // maxHealth 100 (default)
	m.health = m.maxHealth / 2
	start := m.health

	alive := m.Update(0) // no aggro target, nothing in range

	assert.True(t, alive)
	regenPerTick := vitals.HP(float32(m.maxHealth) / (2 * constant.TicksPerSecond))
	assert.Equal(t, start.AddCapped(regenPerTick, m.maxHealth), m.Health(),
		"heals to full over ~2 seconds of ticks while out of combat")
}

// --- transient resist buffs (item 11 Phase 2 Step 3) ---

func TestMob_ResistBuff_ComposesWithBaseAndExpires(t *testing.T) {
	def := testMobDefinition()
	def.Factors.Resistances = map[string]float32{"fire": 0.5}
	m := NewMob(def, false, 0, 0)

	m.ApplyResist(40, []string{"fire"}, 0.5, 2)

	// One tick boundary later the buff still holds (decision 7: a hazard tick
	// landing before the aura re-applies must still be resisted).
	m.ResetTickNumbers()
	m.PlayerTouches(newFakeAuraPlayer(), model.Damage{HP: 40, Tags: []string{"fire"}})
	assert.Equal(t, m.MaxHealth()-10, m.Health(),
		"base 0.5 × buff 0.5 → 40 HP hit lands as 10")

	// Second boundary without re-application → expired, only base remains.
	m.ResetTickNumbers()
	m.PlayerTouches(newFakeAuraPlayer(), model.Damage{HP: 40, Tags: []string{"fire"}})
	assert.Equal(t, m.MaxHealth()-30, m.Health(), "expired buff: 40 × base 0.5 = 20 more")
}
