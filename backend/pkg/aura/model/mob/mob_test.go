package mob

// Characterization tests pinning the CURRENT hardcoded mob aura behavior.
// They are the "old" side of the Phase 6 strict 1:1 migration comparison
// (docs/archive/plan-skill-system.md, Phase 6): once mobs move onto the SkillSystem,
// the new path must reproduce exactly these numbers and rules. Any deviation
// from these tests during the migration is a bug, not a design change.

import (
	"math/rand"
	"testing"

	"github.com/EngoEngine/ecs"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/RoteRiesenRobbe/aura/pkg/api/AuraApi"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/constant"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/vitals"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
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
		Name: "Dodo", // must be a valid AuraApi entity type name
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
	name    string
	pos     phy.Vec2f
	radius  float32
	vs      model.PlayerVitalSigns
	prog    model.PlayerProgression
	xp      []uint64
	healers []model.PlayerEntity
	sc      *skills.SkillComponent
	client  *mobFakeClient
}

// mobFakeClient captures SendUnlock for the kill-drop attribution test; the rest
// of the model.Client surface is unused (embedded nil interface = panic tripwire).
type mobFakeClient struct {
	model.Client
	unlocks []capturedUnlock
}

type capturedUnlock struct {
	skillID uint64
	source  string
}

func (c *mobFakeClient) SendUnlock(id uint64, source string) error {
	c.unlocks = append(c.unlocks, capturedUnlock{id, source})
	return nil
}

func (f *fakeAuraPlayer) Basic() ecs.BasicEntity                 { return f.basic }
func (f *fakeAuraPlayer) Name() string                           { return f.name }
func (f *fakeAuraPlayer) Position() phy.Vec2f                    { return f.pos }
func (f *fakeAuraPlayer) Radius() float32                        { return f.radius }
func (f *fakeAuraPlayer) Faction() model.Faction                 { return model.FactionAligned }
func (f *fakeAuraPlayer) HealthRatio() float32                   { return float32(f.vs.Health) / float32(vitals.Max) }
func (f *fakeAuraPlayer) InCombat() bool                         { return false }
func (f *fakeAuraPlayer) VitalSigns() *model.PlayerVitalSigns    { return &f.vs }
func (f *fakeAuraPlayer) Progression() model.PlayerProgression   { return f.prog }
func (f *fakeAuraPlayer) AddExperience(xp uint64)                { f.xp = append(f.xp, xp) }
func (f *fakeAuraPlayer) RecentHealers() []model.PlayerEntity    { return f.healers }
func (f *fakeAuraPlayer) SkillComponent() *skills.SkillComponent { return f.sc }
func (f *fakeAuraPlayer) ApplyRecipeCascade()                    {}
func (f *fakeAuraPlayer) Client() model.Client                   { return f.client }

func newFakeAuraPlayer() *fakeAuraPlayer {
	return &fakeAuraPlayer{
		basic:  ecs.NewBasic(),
		radius: 0.25,
		vs:     model.PlayerVitalSigns{Health: vitals.Max},
		sc:     skills.NewSkillComponent(true),
		client: &mobFakeClient{},
	}
}

// --- spawn HP roll (item 11 Phase 3, decision C1/C2) ---

func TestNewMob_MaxHealthVarianceRollsWithinBand(t *testing.T) {
	def := testMobDefinition()
	def.Factors.BaseMaxHealth = 1000
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
	def.Factors.BaseMaxHealth = 1000

	m := NewMob(def, 0, nil)
	assert.Equal(t, vitals.VitalSign(1000), m.MaxHealth(),
		"no variance → maxHealth is exactly the authored base")
}

func TestNewMob_VarianceRollNeverBelowOneHP(t *testing.T) {
	def := testMobDefinition()
	def.Factors.BaseMaxHealth = 1
	def.Factors.MaxHealthVariance = 0.9

	for i := 0; i < 16; i++ {
		m := NewMob(def, 0, nil)
		assert.GreaterOrEqual(t, m.MaxHealth(), vitals.VitalSign(1),
			"a rolled HP pool must never reach 0 (min-1)")
	}
}

// --- drop/variance RNG determinism (backlog §27.2.2) ---

// mobRNGSeed must randomize per process run (mixing in the salt) while keeping
// per-mob streams independent (mixing in the entity ID). Both properties are
// what the §27.2.2 fix requires; the old id-only seed satisfies neither the
// per-run randomness nor lets a salt exist.
func TestMobRNGSeed_SaltRandomizesButKeepsPerIDIndependence(t *testing.T) {
	// Same spawn (same entity ID), different process salt → different stream:
	// a fresh server must not reproduce the Nth spawn's HP + drop rolls.
	assert.NotEqual(t, mobRNGSeed(0, 5), mobRNGSeed(0x1234567, 5),
		"a different process salt must change the Nth mob's RNG stream")

	// Same salt, different entity ID → different stream: one mob's drop rolls
	// must not consume/mirror another's.
	assert.NotEqual(t, mobRNGSeed(0x1234567, 5), mobRNGSeed(0x1234567, 6),
		"per-mob streams must stay independent across entity IDs")
}

// With a process salt set, NewMob's spawn-HP variance roll must NOT equal the
// roll the old entity-ID-only seeding produced for that same mob — the direct
// behavioral proof that the salt reaches the mob's RNG.
func TestNewMob_VarianceRollUsesSaltedSeedNotEntityIDAlone(t *testing.T) {
	SeedProcess(0x0BADF00D)
	defer SeedProcess(0) // restore the deterministic-by-ID default for other tests

	def := testMobDefinition()
	def.Factors.BaseMaxHealth = 1000
	def.Factors.MaxHealthVariance = 0.1

	m := NewMob(def, 0, nil)
	id := m.Basic().ID()

	// Reproduce the roll the pre-fix id-only seed (rand.NewSource(int64(id)))
	// would have produced for this exact mob.
	oldRng := rand.New(rand.NewSource(int64(id)))
	oldHP := vitals.VitalSign(vitals.HP(vitals.RollVariance(1000, 0.1, oldRng)))

	assert.NotEqual(t, oldHP, m.MaxHealth(),
		"with a process salt set, the variance roll must diverge from the entity-ID-only roll (§27.2.2)")
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

func TestMob_PlayerTouches_GatedTagNeedsOptIn(t *testing.T) {
	// Gated damage (content pass C1, "gatedDamageTags") is opt-in: a mob
	// whose base resistances never mention the tag is immune — the wolf
	// case, with zero authoring on the wolf.
	m := newTestMob() // no resistances at all

	m.PlayerTouches(newFakeAuraPlayer(), model.Damage{HP: 10, Tags: []string{"turnip"}, Gated: true})

	assert.Equal(t, m.MaxHealth(), m.Health())
	assert.Zero(t, m.DamageTaken())
	assert.NotContains(t, m.StatusEffects().Effects(), model.StatusEffectDamagedAmbient,
		"a gate-closed hit is a non-event like a fully resisted one")
}

func TestMob_PlayerTouches_GatedTagWildcardDoesNotOptIn(t *testing.T) {
	def := testMobDefinition()
	def.Factors.Resistances = map[string]float32{"*": 0.5}
	m := NewMob(def, 0, nil)

	m.PlayerTouches(newFakeAuraPlayer(), model.Damage{HP: 10, Tags: []string{"turnip"}, Gated: true})

	assert.Equal(t, m.MaxHealth(), m.Health(),
		"a wildcard entry is a fallback, not an opt-in")
}

func TestMob_PlayerTouches_GatedTagExplicitEntryTakesDamage(t *testing.T) {
	// The turnip case: {"*": 0, "turnip": 1} opts in, damage lands normally.
	def := testMobDefinition()
	def.Factors.Resistances = map[string]float32{"*": 0, "turnip": 1}
	m := NewMob(def, 0, nil)

	m.PlayerTouches(newFakeAuraPlayer(), model.Damage{HP: 10, Tags: []string{"turnip"}, Gated: true})

	assert.Equal(t, m.MaxHealth()-10, m.Health())
	assert.Contains(t, m.StatusEffects().Effects(), model.StatusEffectDamagedAmbient)
}

func TestNewMob_EntityTypeOverride(t *testing.T) {
	def := testMobDefinition()
	def.Name = "ProvingBoss" // no such wire type — would fatal without the override
	def.EntityType = "Dodo"

	m := NewMob(def, 0, nil)

	assert.Equal(t, model.EntityType(AuraApi.EntityTypeDodo), m.Type(),
		"the wire EntityType comes from the override, not the def name")
}

// TestNewMob_PanicsOnUnresolvedEntityType pins the direct-construction guard: a
// def built outside the loader (as the sim/tests do) with an EntityType that
// resolves to nothing must panic — not silently render EntityType(0) =
// DebugCircle, and not os.Exit the whole test binary. Keeps a future "just
// delete the guard" from passing silently (§27.2.1).
func TestNewMob_PanicsOnUnresolvedEntityType(t *testing.T) {
	def := testMobDefinition()
	def.Name = "NoSuchWireType" // no override, no such wire type
	def.EntityType = ""

	require.Panics(t, func() { NewMob(def, 0, nil) })
}

// --- conditional immunity (encounter-controller chunk 9b) ---

func TestMob_Invulnerable_PlayerHitIsNonEvent(t *testing.T) {
	m := newTestMob()
	p := newFakeAuraPlayer()
	m.SetInvulnerable(true)

	// Like a fully resisted tag, an invulnerable hit does not exist for the
	// mob: no HP loss, no floating number, no status effect / hit flash, and
	// no threat (credited from the actual post-mitigation loss).
	m.PlayerTouches(p, model.Damage{HP: 10, Tags: []string{"physical"}})

	assert.Equal(t, m.MaxHealth(), m.Health())
	assert.Zero(t, m.DamageTaken())
	assert.NotContains(t, m.StatusEffects().Effects(), model.StatusEffectDamagedAmbient)
	assert.False(t, m.HasThreat(p.Basic().ID()),
		"an immune hit builds no threat")
}

func TestMob_Invulnerable_MobHitIsNonEvent(t *testing.T) {
	m := newTestMob()
	m.SetInvulnerable(true)

	m.MobTouches(nil, mobs.Factors{Damage: 1e6})

	assert.Equal(t, m.MaxHealth(), m.Health(),
		"overwhelming mob-path damage does not touch an invulnerable mob")
}

func TestMob_Invulnerable_ToggleOffRestoresDamage(t *testing.T) {
	m := newTestMob()
	p := newFakeAuraPlayer()

	m.SetInvulnerable(true)
	m.PlayerTouches(p, model.Damage{HP: 10})
	require.Equal(t, m.MaxHealth(), m.Health())

	m.SetInvulnerable(false)
	m.PlayerTouches(p, model.Damage{HP: 10})

	assert.Equal(t, m.MaxHealth()-10, m.Health(), "damage lands again after the toggle")
	assert.True(t, m.HasThreat(p.Basic().ID()), "threat is credited again after the toggle")
	assert.True(t, m.Invulnerable() == false)
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
	unlockSkill := &skills.SkillDefinition{ID: 3, Name: "Wild", Category: skills.SkillCategoryActiveAura, MaxLevel: 5}
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

// TestMob_Kill_DropEmitsAttribution pins that a guaranteed kill-drop emits one
// unlock attribution naming the mob (plan-unlock-attribution.md), derived from
// the definition name.
func TestMob_Kill_DropEmitsAttribution(t *testing.T) {
	unlockSkill := &skills.SkillDefinition{ID: 3, Name: "Wild", Category: skills.SkillCategoryActiveAura, MaxLevel: 5}
	d := testMobDefinition()
	d.Unlocks = []mobs.MobUnlock{{Skill: unlockSkill, Chance: 1.0}}
	m := NewMob(d, 0, nil)

	p := newFakeAuraPlayer()
	m.PlayerTouches(p, model.Damage{HP: 1000}) // kill

	require.Len(t, p.client.unlocks, 1)
	assert.Equal(t, uint64(unlockSkill.ID), p.client.unlocks[0].skillID)
	assert.Equal(t, "Dropped by: "+skills.DeriveDisplayName(d.Name), p.client.unlocks[0].source)
}

// TestMob_Kill_AlreadyKnownDrop_NoReAttribution pins that a drop the player
// already owns rolls but does not re-announce (idempotent Discover ⇒ single announce).
func TestMob_Kill_AlreadyKnownDrop_NoReAttribution(t *testing.T) {
	unlockSkill := &skills.SkillDefinition{ID: 3, Name: "Wild", Category: skills.SkillCategoryActiveAura, MaxLevel: 5}
	d := testMobDefinition()
	d.Unlocks = []mobs.MobUnlock{{Skill: unlockSkill, Chance: 1.0}}
	m := NewMob(d, 0, nil)

	p := newFakeAuraPlayer()
	p.sc.Discover(unlockSkill.ID) // already known

	m.PlayerTouches(p, model.Damage{HP: 1000}) // kill

	assert.Empty(t, p.client.unlocks, "no attribution for an already-known drop")
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
	// The margin is authored, not taken from NewMob's fallback: this test is
	// about the stop-distance geometry, and until H1a that fallback was 0.05
	// while every mob in the running game used 0.2 — so taking the default
	// silently pinned the geometry against a number the game never ran on.
	const margin float32 = 0.2
	m := NewMob(testMobDefinition(), margin, nil) // at origin
	p := newFakeAuraPlayer()
	m.aggroTarget = p

	// stopDistance = damageAura.Radius + player.Radius - margin = 0.5 + 0.25 - 0.2 = 0.55
	p.pos = phy.Vec2f{X: 0.8, Y: 0}
	assert.True(t, m.shouldApproach(m.aggroTarget), "outside stop distance → keep approaching")

	p.pos = phy.Vec2f{X: 0.5, Y: 0}
	assert.False(t, m.shouldApproach(m.aggroTarget), "inside stop distance → hold position")
}

// The fallback and core/gameconf.go's normalizer are two Go defaults for one
// value; H1a made them agree. This pins the one the model package owns, so a
// future edit to either has to face the other (they cannot reference a single
// constant without pulling config normalization into a model package — that is
// backlog §35 tier 3, deliberately still open).
func TestNewMob_ZeroChaseMarginTakesTheLiveDefault(t *testing.T) {
	m := NewMob(testMobDefinition(), 0, nil)

	assert.InDelta(t, 0.2, m.chaseIntoAuraMargin, 1e-6,
		"a caller passing 0 must land on the value gameconf normalizes to")
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

// --- damage-recency combat state (playtest feedback round 3) ---
//
// A mob's combat state used to be "do I have an aggro target". A pacifist
// healer never acquires one, so it sat permanently in the out-of-combat branch
// and regenerated straight through incoming damage — live-unkillable by a solo
// player. Combat state is now ALSO a damage-recency window, matching the
// player's inCombatTicks/combatRegenGraceTicks in name, unit and default
// (backlog §31 vocabulary convergence).

func TestMob_TakingDamageEntersCombatWithoutAnAggroTarget(t *testing.T) {
	m := newTestMob()
	require.False(t, m.InCombat(), "idle mob starts out of combat")

	m.takeDamage(model.Damage{HP: 5}, model.StatusEffectDamagedAmbient)

	assert.Nil(t, m.aggroTarget, "nothing was acquired — this is the healer case")
	assert.True(t, m.InCombat(), "being hit IS combat, target or no target")
}

func TestMob_DamagedMobDoesNotRegenerate(t *testing.T) {
	m := newTestMob()
	m.health = m.MaxHealth() / 2
	m.takeDamage(model.Damage{HP: 5}, model.StatusEffectDamagedAmbient)
	wounded := m.Health()

	m.Update(0) // no aggro target: the old gate regenerated here

	assert.Equal(t, wounded, m.Health(),
		"regen gates on combat state, not on holding an aggro target")
}

func TestMob_RegenResumesAfterTheCombatGraceExpires(t *testing.T) {
	m := newTestMob()
	m.health = m.MaxHealth() / 2
	m.takeDamage(model.Damage{HP: 5}, model.StatusEffectDamagedAmbient)
	wounded := m.Health()

	for i := 0; i < combatRegenGraceTicks; i++ {
		m.Update(0)
	}
	require.Equal(t, wounded, m.Health(), "the whole grace window stays gated")
	require.False(t, m.InCombat(), "window closed")

	// A second of ticks, not one: the per-tick step is a fraction of the pool
	// and is carried until it makes a whole HP, so one tick can add nothing.
	for i := 0; i < constant.TicksPerSecond; i++ {
		m.Update(0)
	}

	assert.Greater(t, m.Health(), wounded, "regen resumes once the window closes")
}

func TestMob_EachHitRefreshesTheCombatWindow(t *testing.T) {
	m := newTestMob()
	m.health = m.MaxHealth() / 2

	// Hit once, run most of the window down, hit again: the second hit must
	// restamp, not top up a nearly-expired window.
	m.takeDamage(model.Damage{HP: 5}, model.StatusEffectDamagedAmbient)
	for i := 0; i < combatRegenGraceTicks-1; i++ {
		m.Update(0)
	}
	m.takeDamage(model.Damage{HP: 5}, model.StatusEffectDamagedAmbient)
	wounded := m.Health()

	for i := 0; i < combatRegenGraceTicks; i++ {
		m.Update(0)
	}

	assert.Equal(t, wounded, m.Health(), "a mob under sustained fire never regenerates")
}

// --- out-of-combat regeneration ---

func TestMob_RegeneratesOutOfCombat(t *testing.T) {
	def := testMobDefinition()
	def.Factors.BaseMaxHealth = 150 // divides evenly: exactly 1 HP per tick
	m := NewMob(def, 0, nil)
	m.health = m.MaxHealth() / 2
	start := m.health

	alive := m.Update(0) // no aggro target, nothing in range

	assert.True(t, alive)
	for i := 1; i < constant.TicksPerSecond; i++ {
		m.Update(0)
	}
	perSecond := vitals.VitalSign(float32(m.MaxHealth()) * defaultMobHealthGainTick * constant.TicksPerSecond)
	assert.Equal(t, start+perSecond, m.Health(),
		"heals while out of combat at the configured fraction of the pool")
}

// TestMob_DefaultRegenHealsAFullPoolInFiveSeconds pins the DURATION the default
// rate encodes (PO 2026-07-26: disengaging costs 5 s of recovery, was ~2 s).
// Asserted on a 150-HP pool because that is where the rate divides evenly: at
// 1/(5*TicksPerSecond) the per-tick step is exactly 1 HP, so the pin measures
// the rate and not vitals.HP's rounding. Pools that do NOT divide evenly heal
// faster than 5 s — see TestMob_SmallPoolsHealFasterThanTheNominalDuration.
func TestMob_DefaultRegenHealsAFullPoolInFiveSeconds(t *testing.T) {
	def := testMobDefinition()
	def.Factors.BaseMaxHealth = 150
	m := NewMob(def, 0, nil)
	m.health = 1 // as low as a LIVE mob gets — 0 is death (Update's first check)

	for i := 0; i < 5*constant.TicksPerSecond-2; i++ {
		m.Update(0)
	}
	require.Less(t, m.Health(), m.MaxHealth(), "not yet full two ticks early")

	m.Update(0)

	assert.Equal(t, m.MaxHealth(), m.Health(), "a full pool takes 5 seconds")
}

// TestMob_SmallPoolsTakeTheSameFiveSeconds is the fractional-carry pin (PO
// 2026-07-26). The duration used to hold only above ~150 HP: regen went through
// vitals.HP, which floors a positive amount at 1 HP (item 11 Phase 1), so a
// 30-HP mob regenerated 1 HP/tick — a full pool in 1 second — and 22 of 50 mob
// definitions ignored the rate entirely. The fraction is now carried across
// ticks exactly as the player's is (player/update.go:49), so the rate means the
// same thing at every pool size.
func TestMob_SmallPoolsTakeTheSameFiveSeconds(t *testing.T) {
	def := testMobDefinition()
	def.Factors.BaseMaxHealth = 30 // 30/150 = 0.2 HP/tick — under the old min-1 floor
	m := NewMob(def, 0, nil)
	m.health = 1

	for i := 0; i < 4*constant.TicksPerSecond; i++ {
		m.Update(0)
	}
	require.Less(t, m.Health(), m.MaxHealth(), "a small pool no longer refills in 1 s")

	for i := 0; i < constant.TicksPerSecond; i++ {
		m.Update(0)
	}

	assert.Equal(t, m.MaxHealth(), m.Health(), "and still reaches full within 5 s")
}

// --- regen rate is a conf knob (backlog §27.2.3) ---
//
// Mob out-of-combat regen used to be a hardcoded maxHealth/(2*TicksPerSecond)
// in the model layer, while the player's identical mechanic was a conf.json
// value — so nobody tuning "how punishing is disengaging?" could find it. It is
// now the same knob in the same unit (a fraction of the max pool per tick),
// threaded in at boot like SeedProcess.

func TestMob_RegenRateFollowsConfiguredHealthGainTick(t *testing.T) {
	t.Cleanup(func() { SetHealthGainTick(0) }) // 0 restores the built-in default

	SetHealthGainTick(0.5) // half the pool per tick
	m := newTestMob()      // maxHealth 100
	m.health = 1

	m.Update(0)

	assert.Equal(t, vitals.VitalSign(51), m.Health(),
		"regen step must come from the configured rate, not the old hardcoded one")
}

func TestSetHealthGainTick_NonPositiveKeepsBuiltInDefault(t *testing.T) {
	t.Cleanup(func() { SetHealthGainTick(0) })

	SetHealthGainTick(0.5)
	SetHealthGainTick(0) // absent in conf.json → the default must survive
	assert.Equal(t, float32(defaultMobHealthGainTick), healthGainTick)

	SetHealthGainTick(-1)
	assert.Equal(t, float32(defaultMobHealthGainTick), healthGainTick)
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

	owner.prog = model.PlayerProgression{Level: 5}
	m.SetFaction(model.FactionAligned)
	m.SetOwner(owner)
	m.SetSummonPowerPerLevel(0.05)

	assert.Equal(t, model.FactionAligned, m.Faction())
	assert.Same(t, model.PlayerEntity(owner), m.Owner())
	assert.InDelta(t, 1.2, m.SummonPower(), 1e-6, "1 + (5-1)×0.05")

	var _ model.Owned = m
}

// ⚑ R5, the last half-frozen term in the summon chain. Chunk 1b made a summon's
// POOL and curve position track its owner live, but the output multiplier stayed
// stamped at spawn — so a companion that outlived its owner's ding was
// permanently weaker than an identical one summoned a moment later, contradicting
// PO ruling ② ("levels dynamic for every actor").
//
// No automated battery could catch this: the sim never levels an owner mid-run,
// and a summon SPAWNED at a given level is unaffected either way. This test is
// the only thing that can see it.
func TestMob_SummonPowerTracksTheOwnersLevelLive(t *testing.T) {
	m := newTestMob()
	owner := newFakeAuraPlayer()
	owner.prog = model.PlayerProgression{Level: 9}
	m.SetOwner(owner)
	m.SetSummonPowerPerLevel(0.05)

	require.InDelta(t, 1.40, m.SummonPower(), 1e-6, "summoned at 9")

	// The owner dings while the summon is still alive.
	owner.prog = model.PlayerProgression{Level: 10}

	assert.InDelta(t, 1.45, m.SummonPower(), 1e-6,
		"the summon keeps up instead of staying at its spawn-level multiplier")
	assert.InDelta(t, 1.45, m.SummonPower(), 1e-6, "and it is a read, not a latch")
}

// An unowned mob ignores the rate entirely — world spawns and directly-built
// test mobs deal authored damage, the SummonPower neutral-1 convention.
func TestMob_SummonPowerIsNeutralWithoutAnOwner(t *testing.T) {
	m := newTestMob()
	m.SetSummonPowerPerLevel(0.05)

	assert.InDelta(t, 1.0, m.SummonPower(), 1e-6)
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

// RaiseMaxHealth — the flat summon body bonus — is gone with chunk 1b: a
// summon's pool is now its own baseMaxHealth × f(owner level), pinned in
// level_test.go.

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
func (f *fakeCombatant) InCombat() bool         { return false }

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

// --- scripted flee (encounter-controller chunk 9e) ---

func TestMob_FleeOverride_FleesAtFullHealth(t *testing.T) {
	m := newTestMob() // no fleeBelowHealthRatio — autonomous flee never triggers
	m.SetPosition(phy.Vec2f{X: 1, Y: 1})
	p := newFakeAuraPlayer()
	p.pos = phy.Vec2f{X: 1, Y: 0.5} // due south of the mob
	m.aggroTarget = p
	m.SetFleeOverride(true)

	require.True(t, m.Update(0))

	// Away from the target = due north, exactly one velocity step — the same
	// movement as the autonomous flee, forced regardless of health.
	assert.InDelta(t, 1, m.Position().X, 1e-5)
	assert.InDelta(t, float64(1+m.velocity), float64(m.Position().Y), 1e-5)
}

func TestMob_FleeOverride_SuspendsLeashRetainsThreat(t *testing.T) {
	m := newTestMob()
	m.SetPosition(phy.VEC2F_ZERO)
	p := newFakeAuraPlayer()
	p.pos = phy.Vec2f{X: 50, Y: 0} // far outside sensor + aura the whole time
	m.PlayerTouches(p, model.Damage{HP: 5})
	m.SetFleeOverride(true)

	// Without the override this exact setup leashes after leashCountdownTicks
	// (TestMob_LeashCountdownResetsAggroAndThreat). A scripted flee must hold
	// the threat table for its whole duration (roadmap: the flee phase never
	// resets aggro/threat).
	for i := 0; i < leashCountdownTicks*3; i++ {
		require.True(t, m.Update(0))
		require.NotNil(t, m.aggroTarget, "no leash while the override is on (tick %d)", i)
	}
	assert.True(t, m.HasThreat(p.basic.ID()), "threat survives the scripted flee")
}

func TestMob_FleeOverride_OffReengagesTopThreat(t *testing.T) {
	m := newTestMob()
	m.SetPosition(phy.VEC2F_ZERO)
	top := newFakeAuraPlayer()
	top.pos = phy.Vec2f{X: 3, Y: 0}
	other := newFakeAuraPlayer()
	other.pos = phy.Vec2f{X: -2, Y: 0}
	m.PlayerTouches(top, model.Damage{HP: 20})
	m.PlayerTouches(other, model.Damage{HP: 5})

	m.SetFleeOverride(true)
	for i := 0; i < 5; i++ {
		require.True(t, m.Update(0))
	}

	m.SetFleeOverride(false)
	before := m.Position().Sub(top.pos).Abs()
	require.True(t, m.Update(0))

	assert.True(t, m.TargetsEntity(top.basic.ID()),
		"the retained top-threat holder is the target the moment the override drops")
	assert.Less(t, m.Position().Sub(top.pos).Abs(), before,
		"the mob chases again once the override is off")
}

func TestMob_ThreatSnapshot_SortedLivingOnly(t *testing.T) {
	m := newTestMob()
	low := newFakeAuraPlayer()
	high := newFakeAuraPlayer()
	dead := newFakeAuraPlayer()
	m.PlayerTouches(low, model.Damage{HP: 5})
	m.PlayerTouches(high, model.Damage{HP: 20})
	m.PlayerTouches(dead, model.Damage{HP: 10})
	dead.vs.Health = 0

	rows, targetID := m.ThreatSnapshot()

	require.Len(t, rows, 2, "dead entries are skipped")
	assert.Equal(t, high.basic.ID(), rows[0].Entity.Basic().ID(), "descending threat order")
	assert.InDelta(t, 20, float64(rows[0].Threat), 1e-3)
	assert.Equal(t, low.basic.ID(), rows[1].Entity.Basic().ID())
	assert.Zero(t, targetID, "no aggro target before the mob updates")
	assert.True(t, m.HasThreat(dead.basic.ID()),
		"the snapshot is read-only — dead entries are skipped, not pruned")

	require.True(t, m.Update(0)) // retention picks the top threat
	_, targetID = m.ThreatSnapshot()
	assert.Equal(t, high.basic.ID(), targetID, "the aggro target ID reads through")
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

func TestNewMob_StructureAuraAlwaysOn(t *testing.T) {
	def := testMobDefinition()
	def.Role = mobs.RoleStructure
	def.Factors.Speed = 0
	m := NewMob(def, 0, nil)

	assert.Equal(t, 0, m.SkillComponent().ActiveAuraSlot,
		"a hazard (totem, brazier) does not chase — its aura is its behavior, always on")
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

// --- support mobs: mob heal target (chunk 8) ---

// A mob can BE healed via model.Healable: Heal clamps at maxHealth, records the
// floating heal number, returns the actual delta, and resets each tick.
func TestMob_Heal_ClampsRecordsAndReturnsDelta(t *testing.T) {
	m := newTestMob() // maxHealth 100 (default), health 100
	m.health = 60

	healed := m.Heal(30)
	assert.Equal(t, vitals.VitalSign(30), healed)
	assert.Equal(t, vitals.VitalSign(90), m.Health())
	assert.Equal(t, vitals.VitalSign(30), m.HealReceived())

	// Over-heal clamps at maxHealth; only the applied delta accumulates.
	healed = m.Heal(50)
	assert.Equal(t, vitals.VitalSign(10), healed)
	assert.Equal(t, vitals.VitalSign(100), m.Health())
	assert.Equal(t, vitals.VitalSign(40), m.HealReceived())

	m.ResetTickNumbers()
	assert.Zero(t, m.HealReceived())
}

// --- support mobs: seek-healer aura gating + movement (chunk 8) ---

func testHealAuraSkill() *skills.SkillDefinition {
	return &skills.SkillDefinition{
		ID: 198, Name: "TestMobHealAura", Category: skills.SkillCategoryActiveAura, MaxLevel: 5,
		Effects: []skills.EffectDef{{
			Type:          skills.EffectTypeHealAura,
			Radius:        1.0,
			TargetsAllies: true,
			Selector:      skills.SelectorLowestHealth,
			TickInterval:  1,
			Heal:          &skills.HealParams{HP: 10},
		}},
	}
}

func newTestHealerMob() *Mob {
	def := testMobDefinition() // speed 1.0 (moving)
	def.Skills = []mobs.MobSkill{{Def: testHealAuraSkill(), Level: 1}}
	return NewMob(def, 0, nil)
}

// addSensorContact puts c into m's aggro sensor at its own position, on the
// given body layer, and steps the space so the collision is live.
func addSensorContact(m *Mob, space *phy.Space, c *fakeCombatant, layer model.CollisionLayer) {
	shape := phy.NewCircle(c.pos, 0.25)
	shape.Shape().IsSensor = true
	shape.Shape().Layer = int(layer)
	shape.Shape().UserData = model.Combatant(c)
	space.AddShape(shape)
	space.Update()
}

// A support-carrying mob spawns aura-gated like a damage mob (no ring until it
// acquires someone), and its sensor spans both combatant layers so it can see
// allies at aggro range (a passive-faction healer would otherwise be blind).
func TestMob_Support_SpawnsGatedWithAllySensor(t *testing.T) {
	m := newTestHealerMob()

	assert.Equal(t, 0, m.supportSlot, "the heal aura is the support slot")
	assert.Equal(t, -1, m.combatSlot, "nothing in the loadout can fight")
	assert.True(t, m.isPacifist())
	assert.Equal(t, -1, m.skills.ActiveAuraSlot, "healer spawns aura-gated like a damage mob")
	assert.Zero(t, m.AuraRadius(), "no ring until it acquires a wounded ally")
	assert.Equal(t, int(model.LayerCombatants), m.aggroAura.Shape().Mask,
		"support sensor spans both combatant layers to see allies")
}

// The core symmetry (chunk 8, preserved through the round-3 rework): a healer
// acquires the wounded ally in its aggro sensor the way a damage mob acquires an
// enemy — the heal aura activates on acquisition (ring on) and it chases the
// ally. The ally now lands in supportTarget, NOT aggroTarget.
func TestMob_Support_AcquiresWoundedAllyActivatesAuraAndChases(t *testing.T) {
	m := newTestHealerMob() // FactionHostile
	m.SetPosition(phy.Vec2f{X: 0, Y: 0})
	ally := newFakeCombatant()
	ally.faction = model.FactionHostile // same faction as the healer
	ally.healthRatio = 0.4              // wounded
	ally.pos = phy.Vec2f{X: 1.5, Y: 0}  // inside aggroRadius 2.0, outside heal radius 1.0

	space := phy.NewSpace()
	space.AddShape(m.aggroAura)
	addSensorContact(m, space, ally, model.LayerActionCollision)
	require.NotEmpty(t, m.aggroAura.Collisions())

	m.updateAggro()

	require.Same(t, ally, m.supportTarget, "healer acquires the wounded ally to support")
	assert.Nil(t, m.aggroTarget, "an ally is not an aggro target — that conflation is the bug")
	assert.Equal(t, modeSupport, m.mode)
	assert.Greater(t, m.AuraRadius(), float32(0), "heal aura activates on acquisition (ring on)")

	before := m.Position()
	require.True(t, m.shouldApproach(m.supportTarget), "ally is outside heal range → approach")
	m.moveTowards(m.supportTarget.Position())
	assert.Greater(t, m.Position().X, before.X, "healer chases the wounded ally")
}

// A healed-to-full ally is released, and the heal aura gates back off.
func TestMob_Support_ReleasesFullHealedAlly(t *testing.T) {
	m := newTestHealerMob()
	ally := newFakeCombatant()
	ally.faction = model.FactionHostile
	ally.healthRatio = 0.4

	m.supportTarget = ally
	m.selectMode()
	require.Equal(t, modeSupport, m.mode)
	assert.Greater(t, m.AuraRadius(), float32(0))

	ally.healthRatio = 1.0 // topped up
	m.updateSupportTarget()
	m.selectMode()

	assert.Nil(t, m.supportTarget, "healer releases a full-health ally")
	assert.Equal(t, modeIdle, m.mode)
	assert.Zero(t, m.AuraRadius(), "ring off after release")
}

// A different-faction wounded entity in the sensor is never acquired (no
// healing players/enemies by accident, at the acquisition layer).
func TestMob_Support_IgnoresWoundedNonAlly(t *testing.T) {
	m := newTestHealerMob() // FactionHostile
	enemy := newFakeCombatant()
	enemy.faction = model.FactionAligned // different faction (e.g. a player)
	enemy.healthRatio = 0.3
	enemy.pos = phy.Vec2f{X: 1.0, Y: 0}

	space := phy.NewSpace()
	space.AddShape(m.aggroAura)
	addSensorContact(m, space, enemy, model.LayerPlayerCollision)
	require.NotEmpty(t, m.aggroAura.Collisions())

	m.updateAggro()

	assert.Nil(t, m.supportTarget, "a wounded non-ally is never acquired for support")
	assert.Nil(t, m.aggroTarget, "and a pacifist acquires no enemy either")
}

// A damage-only mob carries no support slot: the support rule never fires and
// its aura gating is exactly the pre-round-3 behaviour.
func TestMob_DamageOnlyMobHasNoSupportRole(t *testing.T) {
	m := newTestMob() // damage aura, speed 1.0
	assert.Equal(t, -1, m.supportSlot)
	assert.Equal(t, 0, m.combatSlot)
	assert.False(t, m.isPacifist())
	assert.Equal(t, -1, m.skills.ActiveAuraSlot, "damage mob spawns aura-gated (chunk 3c)")
}

// --- role-as-loadout: the mode selector (playtest round 3, §31 gap 5) ---

// newTestHybridMob carries a damage aura in slot 0 and a heal aura in slot 1 —
// the configuration that had no possible representation before round 3.
func newTestHybridMob() *Mob {
	def := testMobDefinition()
	def.Skills = []mobs.MobSkill{
		{Def: testAuraSkill(), Level: 1},
		{Def: testHealAuraSkill(), Level: 1},
	}
	return NewMob(def, 0, nil)
}

func TestMob_Hybrid_DerivesBothRoleSlots(t *testing.T) {
	m := newTestHybridMob()

	assert.Equal(t, 1, m.supportSlot, "heal aura in slot 1")
	assert.Equal(t, 0, m.combatSlot, "damage aura in slot 0")
	assert.False(t, m.isPacifist(), "it can fight, so it is not a pacifist")
	assert.Equal(t, int(model.LayerCombatants), m.aggroAura.Shape().Mask,
		"a hybrid must see allies AND enemies")
}

// Engage with an enemy present, support the moment an ally needs it — one mob,
// no type, no branching. This is the whole point of the chunk.
func TestMob_Hybrid_SwitchesAuraSlotWithTheMode(t *testing.T) {
	m := newTestHybridMob()
	enemy := newFakeCombatant()
	enemy.faction = model.FactionAligned
	enemy.healthRatio = 1

	m.setAggroTarget(enemy)
	m.selectMode()
	require.Equal(t, modeEngage, m.mode)
	require.Equal(t, 0, m.skills.ActiveAuraSlot, "fighting → the damage slot")

	// An ally drops. Support outranks engage.
	ally := newFakeCombatant()
	ally.faction = model.FactionHostile
	ally.healthRatio = 0.3
	m.supportTarget = ally
	m.skills.AuraSlots[0].TickAccumulator = 99 // past the boundary, free to switch
	m.selectMode()

	assert.Equal(t, modeSupport, m.mode)
	assert.Equal(t, 1, m.skills.ActiveAuraSlot, "supporting → the heal slot")
}

// ⚑ The landmine this chunk was warned about: SetActiveAura zeroes the tick
// accumulator, so a selector free to flip every tick would leave the mob dealing
// and healing EXACTLY ZERO, silently. The accumulator must be allowed to reach
// the aura's own cadence before a swap is honoured.
func TestMob_ModeSwitchWaitsForATickBoundary(t *testing.T) {
	m := newTestHybridMob()
	// A slower cadence than the 1-tick test auras, so a boundary is observable.
	m.skills.AuraSlots[0].Def.Effects[0].TickInterval = 10
	m.skills.AuraSlots[1].Def.Effects[0].TickInterval = 10

	enemy := newFakeCombatant()
	enemy.faction = model.FactionAligned
	enemy.healthRatio = 1
	m.setAggroTarget(enemy)
	m.selectMode()
	require.Equal(t, 0, m.skills.ActiveAuraSlot)
	require.Zero(t, m.skills.AuraSlots[0].TickAccumulator)

	ally := newFakeCombatant()
	ally.faction = model.FactionHostile
	ally.healthRatio = 0.3
	m.supportTarget = ally

	// Nine ticks of aura progress is not yet a full cadence: the swap must wait.
	for i := 1; i < 10; i++ {
		m.skills.AuraSlots[0].TickAccumulator = i
		m.selectMode()
		require.Equal(t, 0, m.skills.ActiveAuraSlot,
			"switching at accumulator %d would discard the tick and deal nothing", i)
		require.Equal(t, modeEngage, m.mode, "mode and slot stay consistent while held")
	}

	m.skills.AuraSlots[0].TickAccumulator = 10 // the effect fired
	m.selectMode()

	assert.Equal(t, 1, m.skills.ActiveAuraSlot, "boundary reached → the swap lands")
	assert.Equal(t, modeSupport, m.mode)
}

// Gating an aura OFF discards nothing, so it is never held back — a mob that
// leashes must drop its ring immediately, not one cadence later.
func TestMob_DeactivationIsNotHeldBackByTheBoundary(t *testing.T) {
	m := newTestHybridMob()
	m.skills.AuraSlots[0].Def.Effects[0].TickInterval = 10

	enemy := newFakeCombatant()
	enemy.faction = model.FactionAligned
	enemy.healthRatio = 1
	m.setAggroTarget(enemy)
	m.selectMode()
	require.Equal(t, 0, m.skills.ActiveAuraSlot)

	m.resetAggro() // leashed
	m.selectMode()

	assert.Equal(t, -1, m.skills.ActiveAuraSlot, "ring off the same tick it disengages")
	assert.Equal(t, modeIdle, m.mode)
}

// supportThreshold makes the guardian authorable: cleave until an ally drops
// below the authored ratio, and only then break off.
func TestMob_SupportThreshold_GatesAcquisition(t *testing.T) {
	def := testMobDefinition()
	def.Skills = []mobs.MobSkill{
		{Def: testAuraSkill(), Level: 1},
		{Def: testHealAuraSkill(), Level: 1},
	}
	def.Factors.SupportThreshold = 0.5
	m := NewMob(def, 0, nil)
	m.SetPosition(phy.Vec2f{X: 0, Y: 0})

	ally := newFakeCombatant()
	ally.faction = model.FactionHostile
	ally.healthRatio = 0.8 // hurt, but above the threshold
	ally.pos = phy.Vec2f{X: 1.0, Y: 0}

	space := phy.NewSpace()
	space.AddShape(m.aggroAura)
	addSensorContact(m, space, ally, model.LayerActionCollision)

	m.updateSupportTarget()
	assert.Nil(t, m.supportTarget, "0.8 is above the 0.5 threshold — keep fighting")

	ally.healthRatio = 0.4 // now it matters
	m.updateSupportTarget()
	assert.Same(t, ally, m.supportTarget, "below the threshold → break off to support")

	// Retention runs to FULL, not back to the threshold: the gap is hysteresis,
	// so healing an ally across 0.5 does not drop it on the next tick.
	ally.healthRatio = 0.6
	m.updateSupportTarget()
	assert.Same(t, ally, m.supportTarget, "keep supporting until the ally is topped up")
}

func TestMob_SupportThresholdDefaultsToAnyWoundedAlly(t *testing.T) {
	m := newTestHealerMob()
	assert.Equal(t, defaultSupportThreshold, m.supportThreshold,
		"absent in the definition → the pre-round-3 seek-healer behaviour")
}

// --- lifesteal + crit accumulator (plan-skill-vocab chunk 1, F6 §3.1) ---

// leechHealed adds a Heal recorder to fakeAuraPlayer so lifesteal heal-back
// is observable without a full vitals implementation.
type leechPlayer struct {
	fakeAuraPlayer
	healed []uint32
}

func (l *leechPlayer) Heal(hp uint32) vitals.VitalSign {
	l.healed = append(l.healed, hp)
	return vitals.VitalSign(hp)
}

func newLeechPlayer() *leechPlayer {
	return &leechPlayer{fakeAuraPlayer: *newFakeAuraPlayer()}
}

// fakeLeechSource is a minimal Healable Combatant standing in for an owned
// summon riding a hit as Damage.Source (noteThreat also reads it).
type fakeLeechSource struct {
	model.Combatant
	basic  ecs.BasicEntity
	ratio  float32
	healed []uint32
}

func (f *fakeLeechSource) Basic() ecs.BasicEntity { return f.basic }
func (f *fakeLeechSource) Faction() model.Faction { return model.FactionAligned }
func (f *fakeLeechSource) HealthRatio() float32   { return f.ratio }
func (f *fakeLeechSource) Heal(hp uint32) vitals.VitalSign {
	f.healed = append(f.healed, hp)
	return vitals.VitalSign(hp)
}

func TestMob_PlayerTouches_LifestealHealsToucher(t *testing.T) {
	m := newTestMob()
	p := newLeechPlayer()

	m.PlayerTouches(p, model.Damage{HP: 10, Lifesteal: 0.5})

	require.Len(t, p.healed, 1)
	assert.Equal(t, uint32(5), p.healed[0], "heal = damage dealt × fraction")
}

func TestMob_PlayerTouches_SummonSourceLifestealHealsSummon(t *testing.T) {
	// §4.2 (b), confirmed 2026-07-13: an owned summon's lifesteal heals the
	// SUMMON (the hit's Source), never the crediting owner.
	m := newTestMob()
	p := newLeechPlayer()
	summon := &fakeLeechSource{ratio: 1}

	m.PlayerTouches(p, model.Damage{HP: 10, Lifesteal: 0.5, Source: summon})

	require.Len(t, summon.healed, 1)
	assert.Equal(t, uint32(5), summon.healed[0])
	assert.Empty(t, p.healed, "the owner gets nothing")
}

func TestMob_PlayerTouches_DeadSourceLifestealFallsBackToToucher(t *testing.T) {
	m := newTestMob()
	p := newLeechPlayer()
	summon := &fakeLeechSource{ratio: 0} // expired summon reads dead

	m.PlayerTouches(p, model.Damage{HP: 10, Lifesteal: 0.5, Source: summon})

	assert.Empty(t, summon.healed, "a dead source cannot be leech-healed back up")
	require.Len(t, p.healed, 1)
	assert.Equal(t, uint32(5), p.healed[0])
}

func TestMob_Lifesteal_OverkillExcluded(t *testing.T) {
	m := newTestMob()
	m.health = 4 // nearly dead: a 100-HP hit deals only 4
	p := newLeechPlayer()

	m.PlayerTouches(p, model.Damage{HP: 100, Lifesteal: 1})

	require.Len(t, p.healed, 1)
	assert.Equal(t, uint32(4), p.healed[0], "overkill never counts (F6 §3.1/9)")
}

func TestMob_Lifesteal_ZeroFractionNoHeal(t *testing.T) {
	m := newTestMob()
	p := newLeechPlayer()

	m.PlayerTouches(p, model.Damage{HP: 10})

	assert.Empty(t, p.healed)
}

func TestMob_Invulnerable_NoLifesteal(t *testing.T) {
	m := newTestMob()
	m.SetInvulnerable(true)
	p := newLeechPlayer()

	m.PlayerTouches(p, model.Damage{HP: 10, Lifesteal: 1})

	assert.Empty(t, p.healed, "zero dealt = zero leech")
}

func TestMob_MobTouches_LifestealHealsAttackingMob(t *testing.T) {
	m := newTestMob()
	attacker := newTestMob()
	attacker.health = 50 // wounded so the heal is visible

	m.MobTouches(attacker, mobs.Factors{Damage: 10, Lifesteal: 0.5})

	assert.Equal(t, vitals.VitalSign(55), attacker.Health(),
		"a mob-cast hit leeches back through the same seam")
}

func TestMob_CritTaken_AccumulatesAndResets(t *testing.T) {
	m := newTestMob()

	m.PlayerTouches(newFakeAuraPlayer(), model.Damage{HP: 10, Crit: true})
	m.PlayerTouches(newFakeAuraPlayer(), model.Damage{HP: 5})

	assert.Equal(t, vitals.VitalSign(10), m.CritTaken(),
		"only crit-flagged hits land on the crit accumulator")
	assert.Equal(t, vitals.VitalSign(15), m.DamageTaken(),
		"crit damage still counts as damage taken")

	m.ResetTickNumbers()
	assert.Zero(t, m.CritTaken())
}

// --- shield absorb step (plan-skill-vocab chunk 2, F6 §3.1/8-9) ---

func TestMob_TakeDamage_ShieldAbsorbsBeforeHP(t *testing.T) {
	m := newTestMob() // maxHealth 100 (default)
	m.ApplyShield(27, 20, 300)

	m.PlayerTouches(newFakeAuraPlayer(), model.Damage{HP: 8, Crit: true})

	assert.Equal(t, vitals.VitalSign(100), m.Health(), "HP untouched while the shield holds")
	assert.Zero(t, m.DamageTaken(), "damage numbers show real HP loss only")
	assert.Zero(t, m.CritTaken())
	assert.Equal(t, vitals.VitalSign(12), m.ShieldHP(), "the pool drained by the absorbed amount")
	assert.True(t, m.tookDamage, "being beaten on your shield is combat — the leash signal widens to dealt (§3.1)")
}

func TestMob_TakeDamage_PartialAbsorbSpillsToHP(t *testing.T) {
	m := newTestMob()
	m.ApplyShield(27, 5, 300)

	m.PlayerTouches(newFakeAuraPlayer(), model.Damage{HP: 8})

	assert.Equal(t, vitals.VitalSign(97), m.Health(), "the spill hits HP")
	assert.Equal(t, vitals.VitalSign(3), m.DamageTaken())
	assert.Zero(t, m.ShieldHP(), "the broken pool is gone")
}

func TestMob_TakeDamage_ShieldAfterResist(t *testing.T) {
	// Composition pin, incoming side of F6 §3.1: base resistances mitigate
	// first, the shield absorbs the post-mitigation amount. Hand-computed:
	// 40 × 0.5 resist = 20 → shield absorbs 12 → 8 hit HP.
	def := testMobDefinition()
	def.Factors.Resistances = map[string]float32{"fire": 0.5}
	m := NewMob(def, 0, nil)
	m.ApplyShield(27, 12, 300)

	m.PlayerTouches(newFakeAuraPlayer(), model.Damage{HP: 40, Tags: []string{"fire"}})

	assert.Equal(t, vitals.VitalSign(92), m.Health())
	assert.Zero(t, m.ShieldHP())
	assert.Equal(t, vitals.VitalSign(8), m.DamageTaken())
}

func TestMob_ThreatCountsAbsorbedDamage(t *testing.T) {
	// §4.2 (a), confirmed: a mob whose shield eats your hits still hates you —
	// threat credits dealt (absorbed + lost), not just HP loss.
	m := newTestMob()
	m.ApplyShield(27, 20, 300)
	p := newFakeAuraPlayer()

	m.PlayerTouches(p, model.Damage{HP: 8})

	require.True(t, m.HasThreat(p.basic.ID()))
	assert.InDelta(t, 8, m.threat[p.basic.ID()].threat, 1e-6,
		"the fully absorbed hit generates full threat")
}

func TestMob_Lifesteal_CountsAbsorbedDamage(t *testing.T) {
	// §4.2 (a) interplay pin: leeching off a shielded mob still heals.
	m := newTestMob()
	m.ApplyShield(27, 20, 300)
	p := newLeechPlayer()

	m.PlayerTouches(p, model.Damage{HP: 10, Lifesteal: 0.5})

	require.Len(t, p.healed, 1)
	assert.Equal(t, uint32(5), p.healed[0], "heal = dealt (absorbed + lost) × fraction")
	assert.Equal(t, vitals.VitalSign(100), m.Health(), "the hit itself was fully absorbed")
}

func TestMob_Invulnerable_ShieldUntouched(t *testing.T) {
	m := newTestMob()
	m.SetInvulnerable(true)
	m.ApplyShield(27, 20, 300)

	m.PlayerTouches(newFakeAuraPlayer(), model.Damage{HP: 8})

	assert.Equal(t, vitals.VitalSign(20), m.ShieldHP(),
		"invulnerability short-circuits before the absorb step — a non-event drains nothing")
	assert.False(t, m.tookDamage)
}

// --- C6 kill-credit names (the Orc Warlord broadcast) ---

func TestMob_KillCreditNames_ParticipantsPlusHealersDeduped(t *testing.T) {
	m := newTestMob()

	healer := newFakeAuraPlayer()
	healer.name = "Cleo"
	alice := newFakeAuraPlayer()
	alice.name = "Alice"
	alice.healers = []model.PlayerEntity{healer}
	bob := newFakeAuraPlayer()
	bob.name = "Bob"
	bob.healers = []model.PlayerEntity{healer} // shared healer must dedupe

	m.PlayerTouches(alice, model.Damage{HP: 1})
	m.PlayerTouches(bob, model.Damage{HP: 1})
	m.PlayerTouches(alice, model.Damage{HP: 1}) // repeat toucher must dedupe

	assert.Equal(t, []string{"Alice", "Bob", "Cleo"}, m.KillCreditNames())
}

func TestMob_KillCreditNames_EmptyWithoutParticipants(t *testing.T) {
	assert.Empty(t, newTestMob().KillCreditNames())
}
