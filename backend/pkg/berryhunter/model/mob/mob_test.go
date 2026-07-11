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
			TargetsEnemies: true,
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
	return NewMob(testMobDefinition(), 0, nil)
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
func (f *fakeAuraPlayer) Faction() model.Faction                 { return model.FactionAligned }
func (f *fakeAuraPlayer) HealthRatio() float32                   { return float32(f.vs.Health) / float32(vitals.Max) }
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
		m := NewMob(def, 0, nil)
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

	m := NewMob(def, 0, nil)
	assert.Equal(t, vitals.VitalSign(1000), m.MaxHealth(),
		"no variance → maxHealth is exactly the authored base")
}

func TestNewMob_VarianceRollNeverBelowOneHP(t *testing.T) {
	def := testMobDefinition()
	def.Factors.MaxHealth = 1
	def.Factors.MaxHealthVariance = 0.9

	for i := 0; i < 16; i++ {
		m := NewMob(def, 0, nil)
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
	m := NewMob(def, 0, nil)

	m.PlayerTouches(newFakeAuraPlayer(), model.Damage{HP: 10, Tags: []string{"fire"}})

	assert.Equal(t, m.MaxHealth()-5, m.Health(),
		"incoming damage is scaled by the matching tag's resistance multiplier")
}

func TestMob_PlayerTouches_ResistancesMultiplyAcrossTags(t *testing.T) {
	def := testMobDefinition()
	def.Factors.Resistances = map[string]float32{"fire": 0.5, "boss_x_lava": 0.5}
	m := NewMob(def, 0, nil)

	// General + bespoke resistance compose multiplicatively: 10 × 0.5 × 0.5 = 2.5 → 3 (rounded).
	m.PlayerTouches(newFakeAuraPlayer(), model.Damage{HP: 10, Tags: []string{"fire", "boss_x_lava"}})

	assert.Equal(t, m.MaxHealth()-3, m.Health())
}

func TestMob_PlayerTouches_ImmuneTagNoHit(t *testing.T) {
	def := testMobDefinition()
	def.Factors.Resistances = map[string]float32{"fire": 0}
	m := NewMob(def, 0, nil)

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
	m := NewMob(def, 0, nil)

	m.PlayerTouches(newFakeAuraPlayer(), model.Damage{HP: 10, Tags: []string{"fire"}})

	assert.Equal(t, m.MaxHealth()-15, m.Health(),
		"a multiplier above 1 is a vulnerability to that tag")
}

func TestMob_PlayerTouches_MinOneHP(t *testing.T) {
	def := testMobDefinition()
	def.Factors.Resistances = map[string]float32{"fire": 0.01}
	m := NewMob(def, 0, nil)

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
	m := NewMob(d, 0, nil)

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
	early.pos = phy.Vec2f{X: 100, Y: 0} // far out of aura reach
	m.PlayerTouches(early, model.Damage{HP: 5})

	// The hit seeds threat and aggro (chunk 3); with the attacker out of
	// reach the leash countdown expires and the combat reset lets the
	// out-of-combat regen run to full health.
	for i := 0; i < leashCountdownTicks+2; i++ {
		m.Update(0)
	}
	require.Nil(t, m.aggroTarget, "leash must have reset before regen starts")
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
	assert.Equal(t, -1, sc.ActiveAuraSlot,
		"a moving mob spawns with its aura gated — on at aggro (chunk 3c)")
	assert.Nil(t, sc.Spellbook, "mobs have no spellbook")
}

func TestNewMob_AuraSensorWiring(t *testing.T) {
	m := newTestMob()

	aura := m.AuraCollider()
	assert.True(t, aura.Shape().IsSensor)
	assert.InDelta(t, 0.5, aura.Radius, 1e-6, "radius = active skill's EffectiveRadius")
	assert.Equal(t, int(model.LayerCombatants), aura.Shape().Mask,
		"mask derived from the active skill's target flags — both combatant layers since chunk 6.6")
	assert.Equal(t, int(model.LayerNoneCollision), aura.Shape().Layer)
}

func TestNewMob_NoSkills_InertSensor(t *testing.T) {
	d := testMobDefinition()
	d.Skills = nil
	m := NewMob(d, 0, nil)

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
	m := NewMob(def, 0, nil)

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

func TestNewMob_SpawnsHostile(t *testing.T) {
	// FactionHostile is not the zero value — a missed initialization would
	// silently spawn player-aligned mobs (effect foundations Step 1).
	m := NewMob(testMobDefinition(), 0, nil)
	assert.Equal(t, model.FactionHostile, m.Faction())
}

// --- spawned-entity lifecycle (effect foundations Step 3 / mob-depth chunk 1) ---

func TestMob_TTLExpiryKills(t *testing.T) {
	m := newTestMob()
	m.SetTTLTicks(3)
	participant := newFakeAuraPlayer()
	m.PlayerTouches(participant, model.Damage{HP: 5})

	assert.True(t, m.Update(0), "tick 1: still alive")
	assert.True(t, m.Update(0), "tick 2: still alive")
	assert.False(t, m.Update(0), "tick 3: TTL expired → removed via the normal death path")
	assert.Equal(t, vitals.VitalSign(0), m.Health(),
		"expiry zeroes health so stale threat-table refs read the summon as dead (chunk 3a)")
	assert.Empty(t, participant.xp, "TTL expiry grants no kill rewards")
}

func TestMob_NoTTLNeverExpires(t *testing.T) {
	m := newTestMob()
	for i := 0; i < 100; i++ {
		require.True(t, m.Update(0), "a mob without a TTL lives indefinitely")
	}
}

func TestMob_TTLDeathCheckStaysFirst(t *testing.T) {
	// Regression guard (zombie bug family): the HP death check must run before
	// the TTL decrement — a dead mob reports death immediately.
	m := newTestMob()
	m.SetTTLTicks(1000)
	m.health = 0

	assert.False(t, m.Update(0))
}

func TestMob_SetFactionAndOwner(t *testing.T) {
	m := newTestMob()
	owner := newFakeAuraPlayer()

	require.Nil(t, m.Owner(), "an unowned mob has no owner")
	assert.InDelta(t, 1.0, m.SummonPower(), 1e-6, "unowned/unset power is neutral")

	m.SetFaction(model.FactionAligned)
	m.SetOwner(owner)
	m.SetSummonPower(1.2)

	assert.Equal(t, model.FactionAligned, m.Faction())
	assert.Same(t, model.PlayerEntity(owner), m.Owner())
	assert.InDelta(t, 1.2, m.SummonPower(), 1e-6)

	var _ model.Owned = m
}

// --- flee movement mode (mob-depth chunk 2) ---

func cowardMobDefinition() *mobs.MobDefinition {
	def := testMobDefinition()
	def.Factors.FleeBelowHealthRatio = 0.5
	return def
}

func TestMob_FleesBelowThreshold_MovesExactlyAway(t *testing.T) {
	m := NewMob(cowardMobDefinition(), 0, nil)
	m.SetPosition(phy.Vec2f{X: 1, Y: 1})
	p := newFakeAuraPlayer()
	p.pos = phy.Vec2f{X: 1, Y: 0.5} // due south of the mob
	m.aggroTarget = p
	m.health = 49 // ratio 0.49 < threshold 0.5

	require.True(t, m.Update(0))

	// Away from the threat = due north, exactly one velocity step (the
	// inverse of the chase vector, same step length).
	assert.InDelta(t, 1, m.Position().X, 1e-5)
	assert.InDelta(t, float64(1+m.velocity), float64(m.Position().Y), 1e-5)
}

func TestMob_AtThresholdChasesAgain(t *testing.T) {
	m := NewMob(cowardMobDefinition(), 0, nil)
	m.SetPosition(phy.VEC2F_ZERO)
	p := newFakeAuraPlayer()
	p.pos = phy.Vec2f{X: 1.5, Y: 0} // outside the aura stop distance (0.7)
	m.aggroTarget = p
	m.health = 50 // ratio == threshold: flee requires strictly below

	before := m.Position().Sub(p.pos).Abs()
	require.True(t, m.Update(0))
	after := m.Position().Sub(p.pos).Abs()

	assert.Less(t, after, before, "at/above the threshold the mob chases normally")
}

func TestMob_FleeRespectsSlow(t *testing.T) {
	m := NewMob(cowardMobDefinition(), 0, nil)
	m.SetPosition(phy.VEC2F_ZERO)
	p := newFakeAuraPlayer()
	p.pos = phy.Vec2f{X: -1, Y: 0} // flee direction: +x
	m.aggroTarget = p
	m.health = 10
	m.ApplySlow(2, 0.5, 5)

	require.True(t, m.Update(0))

	assert.InDelta(t, float64(m.velocity)*0.5, float64(m.Position().X), 1e-5,
		"the flee step is scaled by the strongest active slow, like the chase step")
	assert.InDelta(t, 0, m.Position().Y, 1e-5)
}

func TestMob_NoFleeThresholdChasesAtAnyHealth(t *testing.T) {
	m := newTestMob() // fleeBelowHealthRatio absent → never flees
	m.SetPosition(phy.VEC2F_ZERO)
	p := newFakeAuraPlayer()
	p.pos = phy.Vec2f{X: 1.5, Y: 0}
	m.aggroTarget = p
	m.health = 1

	before := m.Position().Sub(p.pos).Abs()
	require.True(t, m.Update(0))
	after := m.Position().Sub(p.pos).Abs()

	assert.Less(t, after, before,
		"without a threshold, low health never triggers flee — chase unchanged")
}

func TestMob_FleeFromThreatAtOwnPositionUsesHeading(t *testing.T) {
	m := NewMob(cowardMobDefinition(), 0, nil)
	m.SetPosition(phy.Vec2f{X: 2, Y: 2})
	p := newFakeAuraPlayer()
	p.pos = phy.Vec2f{X: 2, Y: 2} // exactly on top: no away direction exists
	m.aggroTarget = p
	m.health = 10

	require.True(t, m.Update(0))

	moved := m.Position().Sub(phy.Vec2f{X: 2, Y: 2}).Abs()
	assert.InDelta(t, float64(m.velocity), float64(moved), 1e-5,
		"zero-distance threat: flee falls back to the current heading instead of freezing")
}

// TestMob_FleePinnedInBoundaryCornerConverges pins gotcha #10 (plan-mob-depth):
// a fleeing mob pushed into an InvAABB corner must settle there via the
// existing per-axis clamp — no oscillation — through the real Space pipeline.
// Since chunk 4 this is the NIL-SPACE fallback pin (no steering): a mob WITH
// a space escapes the corner instead — see TestMob_FleeIntoCornerEscapesAlongEdge.
func TestMob_FleePinnedInBoundaryCornerConverges(t *testing.T) {
	m := NewMob(cowardMobDefinition(), 0, nil)
	m.SetPosition(phy.Vec2f{X: 4, Y: 4})
	p := newFakeAuraPlayer()
	p.pos = phy.Vec2f{X: 3, Y: 3} // flee direction: diagonally into the (5,5) corner
	m.aggroTarget = p
	m.health = 10

	space := phy.NewSpace()
	wall := phy.NewInvAABB(phy.VEC2F_ZERO, 10, 10)
	wall.Shape().Layer = int(model.LayerBorderCollision)
	space.AddStaticShape(wall)
	space.AddShape(m.Body)

	var prev phy.Vec2f
	for i := 0; i < 60; i++ {
		require.True(t, m.Update(0))
		space.Update()
		pos := m.Body.Position()
		assert.LessOrEqual(t, pos.X, 5-m.Body.Radius+1e-3, "wall holds on x")
		assert.LessOrEqual(t, pos.Y, 5-m.Body.Radius+1e-3, "wall holds on y")
		if i >= 50 {
			assert.InDelta(t, float64(prev.X), float64(pos.X), 1e-4, "converged: no x jitter (tick %d)", i)
			assert.InDelta(t, float64(prev.Y), float64(pos.Y), 1e-4, "converged: no y jitter (tick %d)", i)
		}
		prev = pos
	}
}

// A flee vector angled into a wall keeps its tangential component: the mob
// slides along the boundary instead of jamming (plan-mob-depth §3.2 v1 wall
// handling — falls out of the per-axis clamp, pinned here).
func TestMob_FleeAlongWallSlides(t *testing.T) {
	m := NewMob(cowardMobDefinition(), 0, nil)
	m.SetPosition(phy.Vec2f{X: 4.6, Y: 0})
	p := newFakeAuraPlayer()
	p.pos = phy.Vec2f{X: 3.6, Y: -1} // flee direction (1,1)/√2: into the right wall, northward
	m.aggroTarget = p
	m.health = 10

	space := phy.NewSpace()
	wall := phy.NewInvAABB(phy.VEC2F_ZERO, 10, 10)
	wall.Shape().Layer = int(model.LayerBorderCollision)
	space.AddStaticShape(wall)
	space.AddShape(m.Body)

	for i := 0; i < 20; i++ {
		require.True(t, m.Update(0))
		space.Update()
	}

	pos := m.Body.Position()
	assert.InDelta(t, float64(5-m.Body.Radius), float64(pos.X), 1e-3, "pinned on the right wall")
	assert.Greater(t, pos.Y, float32(0.5), "tangential component keeps the mob sliding along the wall")
}

func TestMob_RaiseMaxHealth(t *testing.T) {
	def := testMobDefinition()
	def.Factors.MaxHealth = 100
	m := NewMob(def, 0, nil)

	m.RaiseMaxHealth(20)

	assert.Equal(t, vitals.VitalSign(120), m.MaxHealth())
	assert.Equal(t, vitals.VitalSign(120), m.Health(), "the bonus raises current HP too — summons spawn at full health")
}

// --- threat table, faction-aware aggro, leash & aura gating (mob-depth chunk 3) ---

// fakeCombatant is a minimal model.Combatant — the shape of a summon (totem,
// companion) as the threat and acquisition paths see one.
type fakeCombatant struct {
	basic       ecs.BasicEntity
	pos         phy.Vec2f
	radius      float32
	faction     model.Faction
	healthRatio float32
}

func (f *fakeCombatant) Basic() ecs.BasicEntity { return f.basic }
func (f *fakeCombatant) Faction() model.Faction { return f.faction }
func (f *fakeCombatant) Position() phy.Vec2f    { return f.pos }
func (f *fakeCombatant) Radius() float32        { return f.radius }
func (f *fakeCombatant) HealthRatio() float32   { return f.healthRatio }

func newFakeCombatant() *fakeCombatant {
	return &fakeCombatant{basic: ecs.NewBasic(), radius: 0.25, faction: model.FactionAligned, healthRatio: 1}
}

func TestMob_ThreatCreditsPostMitigationDamage(t *testing.T) {
	def := testMobDefinition()
	def.Factors.Resistances = map[string]float32{"fire": 0.5}
	m := NewMob(def, 0, nil)
	p := newFakeAuraPlayer()

	m.PlayerTouches(p, model.Damage{HP: 40, Tags: []string{"fire"}})

	require.True(t, m.HasThreat(p.basic.ID()))
	assert.InDelta(t, 20, m.threat[p.basic.ID()].threat, 1e-6,
		"threat is the post-mitigation HP the mob actually lost (§6.3)")
}

func TestMob_PlayerTouches_SummonSourceGetsThreatOwnerGetsXP(t *testing.T) {
	m := newTestMob()
	owner := newFakeAuraPlayer()
	summon := newFakeCombatant()

	m.PlayerTouches(owner, model.Damage{HP: 10, Source: summon})

	assert.True(t, m.HasThreat(summon.basic.ID()), "threat credits the summon itself (gotcha #9)")
	assert.False(t, m.HasThreat(owner.basic.ID()), "…never the owner")
	assert.Contains(t, m.participants, owner.basic.ID(), "XP attribution stays on the owner")
}

func TestMob_PlayerTouches_DeadSourceFallsBackToToucher(t *testing.T) {
	m := newTestMob()
	owner := newFakeAuraPlayer()
	summon := newFakeCombatant()
	summon.healthRatio = 0 // expired totem, its dot still burning

	m.PlayerTouches(owner, model.Damage{HP: 10, Source: summon})

	assert.False(t, m.HasThreat(summon.basic.ID()))
	assert.True(t, m.HasThreat(owner.basic.ID()),
		"a dead source falls back to the toucher — the burn keeps pulling threat somewhere real")
}

func TestMob_MobTouches_OnlyEnemyFactionBuildsThreat(t *testing.T) {
	m := newTestMob() // hostile
	aligned := newTestMob()
	aligned.SetFaction(model.FactionAligned)
	hostile := newTestMob()

	m.MobTouches(aligned, mobs.Factors{Damage: 5})
	m.MobTouches(hostile, mobs.Factors{Damage: 5})

	assert.True(t, m.HasThreat(aligned.Basic().ID()),
		"enemy-faction mob damage builds threat (mobs aggro summons)")
	assert.False(t, m.HasThreat(hostile.Basic().ID()),
		"same-faction splash (boss aura on a brazier) builds none")
}

func TestMob_Update_RetargetsHighestThreat(t *testing.T) {
	m := newTestMob()
	m.SetPosition(phy.VEC2F_ZERO)
	near := newFakeAuraPlayer()
	near.pos = phy.Vec2f{X: 0.3, Y: 0}
	far := newFakeAuraPlayer()
	far.pos = phy.Vec2f{X: 5, Y: 0}

	m.aggroTarget = near // earlier sensor pick
	m.PlayerTouches(near, model.Damage{HP: 5})
	m.PlayerTouches(far, model.Damage{HP: 20})

	require.True(t, m.Update(0))

	assert.Same(t, far, m.aggroTarget,
		"retention: the highest-threat entity is the target, not the nearest (§3.3)")
}

func TestMob_Update_ThreatFromOutsideSensorAcquires(t *testing.T) {
	m := newTestMob()
	m.SetPosition(phy.VEC2F_ZERO)
	sniper := newFakeAuraPlayer()
	sniper.pos = phy.Vec2f{X: 10, Y: 0} // far beyond the 2.0 aggro sensor

	m.PlayerTouches(sniper, model.Damage{HP: 5})
	require.True(t, m.Update(0))

	assert.Same(t, sniper, m.aggroTarget,
		"a hit from beyond the sensor seeds threat and acquires — mobs retaliate against snipers")
}

func TestMob_Update_DeadThreatEntryPrunedNextHighestWins(t *testing.T) {
	m := newTestMob()
	m.SetPosition(phy.VEC2F_ZERO)
	first := newFakeAuraPlayer()
	second := newFakeAuraPlayer()
	m.PlayerTouches(first, model.Damage{HP: 20})
	m.PlayerTouches(second, model.Damage{HP: 5})

	first.vs.Health = 0
	require.True(t, m.Update(0))

	assert.Same(t, second, m.aggroTarget, "dead top entry pruned; next highest becomes the target")
	assert.False(t, m.HasThreat(first.basic.ID()))
}

func TestMob_FindAggroTarget_AcquiresEnemyFactionSummon(t *testing.T) {
	m := newTestMob() // hostile
	totem := newFakeCombatant() // aligned → enemy of the mob
	totem.pos = phy.Vec2f{X: 0.5, Y: 0}
	packMate := newFakeCombatant() // hostile → same faction, nearer
	packMate.faction = model.FactionHostile
	packMate.pos = phy.Vec2f{X: 0.2, Y: 0}

	space := phy.NewSpace()
	space.AddShape(m.aggroAura)
	for _, f := range []*fakeCombatant{totem, packMate} {
		c := phy.NewCircle(f.pos, 0.25)
		c.Shape().IsSensor = true
		c.Shape().Layer = int(model.LayerPlayerCollision)
		c.Shape().UserData = model.Combatant(f)
		space.AddShape(c)
	}
	space.Update()
	require.NotEmpty(t, m.aggroAura.Collisions())

	target := m.findAggroTarget()

	require.NotNil(t, target)
	assert.Same(t, totem, target,
		"faction-aware acquisition: the aligned summon is acquired, the nearer same-faction entity ignored")
}

// --- state-dependent leash (chunk 3b) ---

func TestMob_LeashCountdownResetsAggroAndThreat(t *testing.T) {
	m := newTestMob()
	m.SetPosition(phy.VEC2F_ZERO)
	p := newFakeAuraPlayer()
	p.pos = phy.Vec2f{X: 50, Y: 0} // far out of aura reach, mob never catches up
	m.PlayerTouches(p, model.Damage{HP: 5})

	for i := 0; i <= leashCountdownTicks; i++ {
		require.True(t, m.Update(0))
		require.NotNil(t, m.aggroTarget, "still chasing during the countdown (tick %d)", i)
	}
	require.True(t, m.Update(0))

	assert.Nil(t, m.aggroTarget, "countdown expired → combat reset")
	assert.False(t, m.HasThreat(p.basic.ID()), "threat clears with the reset (gotcha #4)")
}

func TestMob_InCombatHasNoLeash(t *testing.T) {
	m := newTestMob()
	m.SetPosition(phy.VEC2F_ZERO)
	p := newFakeAuraPlayer()
	p.pos = phy.Vec2f{X: 0.6, Y: 0} // inside aura reach (0.5 + 0.25)
	m.PlayerTouches(p, model.Damage{HP: 5})

	for i := 0; i < leashCountdownTicks*3; i++ {
		require.True(t, m.Update(0))
	}
	assert.NotNil(t, m.aggroTarget,
		"a target within aura reach means in combat — no leash, however long the fight")
}

func TestMob_DamageResetsLeashCountdown(t *testing.T) {
	m := newTestMob()
	m.SetPosition(phy.VEC2F_ZERO)
	p := newFakeAuraPlayer()
	p.pos = phy.Vec2f{X: 100, Y: 0} // far out of reach the whole time
	m.PlayerTouches(p, model.Damage{HP: 1})

	for i := 0; i < 3; i++ {
		for j := 0; j < leashCountdownTicks; j++ {
			require.True(t, m.Update(0))
			require.NotNil(t, m.aggroTarget)
		}
		// Re-hit shortly before the countdown would expire.
		m.PlayerTouches(p, model.Damage{HP: 1})
	}
	assert.NotNil(t, m.aggroTarget,
		"each hit restarts the countdown — staying in combat holds aggro indefinitely")
}

func TestMob_ChasingTargetInsideSensorNeverLeashes(t *testing.T) {
	m := newTestMob()
	m.SetPosition(phy.VEC2F_ZERO)
	p := newFakeAuraPlayer()
	m.PlayerTouches(p, model.Damage{HP: 5})

	for i := 0; i < leashCountdownTicks*3; i++ {
		// Kite: hold the target inside the 2.0 aggro sensor but beyond the
		// 0.75 aura reach — the in-game "chasing but can't reach" state.
		p.pos = phy.Vec2f{X: m.Position().X + 1.5, Y: m.Position().Y}
		require.True(t, m.Update(0))
		require.NotNil(t, m.aggroTarget,
			"the chase must not leash while the target is inside the sensor (tick %d)", i)
		require.Equal(t, 0, m.SkillComponent().ActiveAuraSlot,
			"the aura must not flicker during the chase (tick %d)", i)
	}
	assert.True(t, m.HasThreat(p.basic.ID()), "threat survives the whole chase")
}

func TestMob_TargetsEntity(t *testing.T) {
	m := newTestMob()
	p := newFakeAuraPlayer()
	assert.False(t, m.TargetsEntity(p.basic.ID()), "no target yet")

	m.setAggroTarget(p)
	assert.True(t, m.TargetsEntity(p.basic.ID()))
	assert.False(t, m.TargetsEntity(p.basic.ID()+1), "only the current aggro target matches")
}

// --- auras-off-until-aggroed (chunk 3c) ---

func TestNewMob_MovingMobSpawnsAuraGated(t *testing.T) {
	m := newTestMob() // speed 1.0 → gated
	assert.Equal(t, -1, m.SkillComponent().ActiveAuraSlot, "aura off until aggro")
	assert.InDelta(t, 0.5, m.AuraCollider().Radius, 1e-6,
		"sensor still pre-sized from slot 0 — chase stop distance correct from the first aggro tick")
	assert.InDelta(t, 0, m.AuraRadius(), 1e-6, "wire radius 0 → no ring on the client")
}

func TestNewMob_StationaryMobAuraAlwaysOn(t *testing.T) {
	def := testMobDefinition()
	def.Factors.Speed = 0
	m := NewMob(def, 0, nil)

	assert.Equal(t, 0, m.SkillComponent().ActiveAuraSlot,
		"a stationary hazard (totem, brazier) cannot chase — its aura is its behavior, always on")
	assert.InDelta(t, 0.5, m.AuraRadius(), 1e-6)

	m.resetAggro()
	assert.Equal(t, 0, m.SkillComponent().ActiveAuraSlot, "combat reset never gates a stationary aura")
}

func TestMob_AuraActivatesOnAggroDeactivatesOnLeashReset(t *testing.T) {
	m := newTestMob()
	m.SetPosition(phy.VEC2F_ZERO)
	p := newFakeAuraPlayer()
	p.pos = phy.Vec2f{X: 60, Y: 0}
	m.PlayerTouches(p, model.Damage{HP: 5})

	require.True(t, m.Update(0))
	require.Equal(t, 0, m.SkillComponent().ActiveAuraSlot, "aggro → aura on")
	assert.InDelta(t, 0.5, m.AuraRadius(), 1e-6, "…and the ring radius goes on the wire")

	// Staying aggroed must not re-trigger SetActiveAura — that would reset the
	// tick accumulator every tick and the aura would never fire.
	m.SkillComponent().AuraSlots[0].TickAccumulator = 7
	require.True(t, m.Update(0))
	assert.Equal(t, 7, m.SkillComponent().AuraSlots[0].TickAccumulator)

	for i := 0; m.aggroTarget != nil && i < leashCountdownTicks*2; i++ {
		require.True(t, m.Update(0))
	}
	require.Nil(t, m.aggroTarget, "leash must reset with the target far away")
	assert.Equal(t, -1, m.SkillComponent().ActiveAuraSlot, "combat reset → aura off")
	assert.InDelta(t, 0, m.AuraRadius(), 1e-6)
}

// --- flee re-point (chunk 3d): flee runs from the highest-threat enemy ---

func TestMob_FleesFromHighestThreat(t *testing.T) {
	m := NewMob(cowardMobDefinition(), 0, nil)
	m.SetPosition(phy.Vec2f{X: 1, Y: 1})
	nearLow := newFakeAuraPlayer()
	nearLow.pos = phy.Vec2f{X: 1, Y: 1.4} // north, close, little threat
	farHigh := newFakeAuraPlayer()
	farHigh.pos = phy.Vec2f{X: 1, Y: 0} // south, top threat

	m.aggroTarget = nearLow // stale sensor pick
	m.PlayerTouches(nearLow, model.Damage{HP: 2})
	m.PlayerTouches(farHigh, model.Damage{HP: 30})
	m.health = 10 // well below the 0.5 flee threshold

	require.True(t, m.Update(0))

	assert.InDelta(t, 1, m.Position().X, 1e-5)
	assert.Greater(t, m.Position().Y, float32(1),
		"flee runs from the highest-threat enemy (south) — due north, not away from the nearest")
}
