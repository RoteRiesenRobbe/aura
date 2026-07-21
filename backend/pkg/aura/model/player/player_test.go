package player

import (
	"fmt"
	"math"
	"testing"

	"github.com/EngoEngine/ecs"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/cfg"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/curve"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/vitals"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

// stubRegistry implements skills.Registry for tests.
type stubRegistry struct {
	byName map[string]*skills.SkillDefinition
}

func newStubRegistry(defs ...*skills.SkillDefinition) *stubRegistry {
	r := &stubRegistry{byName: make(map[string]*skills.SkillDefinition)}
	for _, d := range defs {
		r.byName[d.Name] = d
	}
	return r
}

func (r *stubRegistry) Get(id skills.SkillID) (*skills.SkillDefinition, error) {
	for _, d := range r.byName {
		if d.ID == id {
			return d, nil
		}
	}
	return nil, fmt.Errorf("skill ID %d not found", id)
}

func (r *stubRegistry) GetByName(name string) (*skills.SkillDefinition, error) {
	d, ok := r.byName[name]
	if !ok {
		return nil, fmt.Errorf("skill %q not found", name)
	}
	return d, nil
}

func (r *stubRegistry) All() []*skills.SkillDefinition {
	result := make([]*skills.SkillDefinition, 0, len(r.byName))
	for _, d := range r.byName {
		result = append(result, d)
	}
	return result
}

var (
	defDamageAura = &skills.SkillDefinition{ID: 1, Name: "Damage", Category: skills.SkillCategoryActiveAura, MaxLevel: 5}
	// The peasant-start utility aura (content pass C1, GDD §5): the only
	// skill a fresh spawn owns — Damage moved to the Farmer's teaching.
	defHarvest = &skills.SkillDefinition{ID: 41, Name: "Harvest", Category: skills.SkillCategoryActiveAura, MaxLevel: 5}
)

// Triage item 11: a fresh spawn is TRULY empty — no equipped aura, empty
// spellbook, no active aura. Harvest is now the Farmer's first ungated teaching
// (world.json), not a spawn freebie, so nothing is granted at construction.
func TestInitializePlayerSkills_EmptyLoadout(t *testing.T) {
	sc, err := initializePlayerSkills(newStubRegistry(defDamageAura, defHarvest))
	require.NoError(t, err)

	assert.Nil(t, sc.AuraSlots[0], "slot 0 must be empty — nothing is equipped at spawn")
	assert.Nil(t, sc.AuraSlots[1], "slot 1 must be empty too")

	assert.Equal(t, -1, sc.ActiveAuraSlot, "no active aura on a fresh spawn")

	assert.False(t, sc.HasDiscovered(defHarvest.ID),
		"Harvest is Farmer-taught (triage item 11), never a spawn freebie")
	assert.False(t, sc.HasDiscovered(defDamageAura.ID),
		"Damage is farmer-taught @L2 (GDD §5 amendment)")
}

// --- milestone unlock tests ---

var defHealAura = &skills.SkillDefinition{ID: 2, Name: "Heal", Category: skills.SkillCategoryActiveAura, MaxLevel: 5}

// newTestPlayer builds a minimal *player for unit-testing AddExperience.
// LevelUpXPBase=100, LevelUpXPGrowthFactor=2.0 means:
//
//	level 1→2 costs 100 XP, level 2→3 costs 200 XP.
func newTestPlayer(milestones []skills.MilestoneUnlock) *player {
	r := newStubRegistry(defDamageAura, defHealAura, defHarvest)
	sc, _ := initializePlayerSkills(r)
	return &player{
		progression:      model.PlayerProgression{Level: 1},
		config:           &cfg.PlayerConfig{LevelUpXPBase: 100, LevelUpXPGrowthFactor: 2.0, BaseHealth: 100},
		skills:           sc,
		milestoneUnlocks: milestones,
		PlayerVitalSigns: model.PlayerVitalSigns{Health: vitals.Max},
	}
}

// --- light radius (content pass C2 lift 2: passive light) ---

// The player's wire light_radius must include passive-slot light (Torch),
// not just the active aura — delegation to the component-level max fold.
func TestPlayer_LightRadius_FromPassiveSlot(t *testing.T) {
	p := newTestPlayer(nil)
	torch := &skills.SkillDefinition{
		ID: 46, Name: "Torch", Category: skills.SkillCategoryPassive, MaxLevel: 3,
		Effects: []skills.EffectDef{{Type: skills.EffectTypeLightAura, Radius: 2.5, RadiusPerLevel: 0.5}},
	}
	p.skills.EquipPassive(0, torch, 1)

	assert.Equal(t, float32(2.5), p.LightRadius(),
		"passive light must stream regardless of the active-aura slot")
}

// --- absolute HP (roadmap item 11 Phase 1) ---

func TestPlayer_MaxHealth_FromBaseAndCurve(t *testing.T) {
	p := newTestPlayer(nil)
	p.config.BaseHealth = 100
	p.config.LevelCurve = curve.Curve{Growth: 1.12, MaxLevel: 30}

	p.progression.Level = 1
	assert.Equal(t, vitals.VitalSign(100), p.MaxHealth(), "level 1 = base health")

	p.progression.Level = 3
	assert.Equal(t, vitals.VitalSign(125), p.MaxHealth(),
		"level 3 = base × f(3) = 100 × 1.12² = 125.44, rounded")
}

// The max-health passive composes multiplicatively with f(level) (C0 PO
// decision): a +20% HP passive is +20% at EVERY level — specialization stays
// relative, inflation is orthogonal (Philosophy A).
func TestPlayer_MaxHealth_PassiveBonusMultipliesTheCurve(t *testing.T) {
	p := newTestPlayer(nil)
	p.config.BaseHealth = 100
	p.config.LevelCurve = curve.Curve{Growth: 1.12, MaxLevel: 30}
	p.skills.Derived.MaxHealthBonus = 0.2

	p.progression.Level = 1
	assert.Equal(t, vitals.VitalSign(120), p.MaxHealth(), "level 1: 100 × 1.2")

	p.progression.Level = 3
	assert.Equal(t, vitals.VitalSign(151), p.MaxHealth(),
		"level 3: 100 × 1.12² × 1.2 = 150.53, rounded")
}

// PowerScale is the player's f(character level) — the HP-side output
// multiplier the SkillSystem applies to damage/heal/dot/hot/shield/self-heal
// values (never radius, tick rate, or target count — GDD §5).
func TestPlayer_PowerScale_IsFOfLevel(t *testing.T) {
	p := newTestPlayer(nil)
	p.config.LevelCurve = curve.Curve{Growth: 1.12, MaxLevel: 30}

	p.progression.Level = 1
	assert.InDelta(t, 1.0, p.PowerScale(), 1e-6)

	p.progression.Level = 10
	assert.InDelta(t, math.Pow(1.12, 9), float64(p.PowerScale()), 1e-4)
}

// Level-ups clamp at the conf maxLevel: XP keeps accumulating but the level
// (and therefore f, skill points, milestones) stops at the cap.
func TestPlayer_AddExperience_ClampsAtMaxLevel(t *testing.T) {
	p := newTestPlayer(nil)
	p.config.LevelCurve = curve.Curve{Growth: 1.12, MaxLevel: 3}

	p.AddExperience(1 << 40)
	assert.Equal(t, uint32(3), p.progression.Level, "level stops at the cap")
}

// LevelProgressXP feeds the HUD's absolute xpInLevel/xpForNextLevel text: the
// pair must track level-ups (gained resets, required grows) and the death XP
// penalty (gained back to 0 within the kept level).
func TestPlayer_LevelProgressXP_TracksLevelUpAndDeathPenalty(t *testing.T) {
	p := newTestPlayer(nil)

	gained, required := p.LevelProgressXP()
	assert.Equal(t, uint64(0), gained, "fresh level 1 player starts at 0")
	assert.Equal(t, uint64(100), required, "level 1→2 costs 100")

	p.AddExperience(50)
	gained, required = p.LevelProgressXP()
	assert.Equal(t, uint64(50), gained)
	assert.Equal(t, uint64(100), required)

	p.AddExperience(100) // total 150 → level 2 with 50 into it
	gained, required = p.LevelProgressXP()
	assert.Equal(t, uint64(50), gained, "level-up resets the within-level XP")
	assert.Equal(t, uint64(200), required, "level 2→3 costs 200")

	p.LoseCurrentLevelExperience() // death penalty: keep level, drop progress
	gained, required = p.LevelProgressXP()
	assert.Equal(t, uint64(0), gained, "death drops within-level XP to 0")
	assert.Equal(t, uint64(200), required)
}

// --- floating-number accumulators (roadmap item 11) ---

func TestPlayer_DamageTaken_AccumulatesAndResets(t *testing.T) {
	p := newTestPlayer(nil)
	p.statusEffects = model.NewStatusEffects()

	p.takeDamage(model.Damage{HP: 0.1}, model.StatusEffectDamagedAmbient)
	p.takeDamage(model.Damage{HP: 0.05}, model.StatusEffectDamagedAmbient)

	assert.Equal(t, vitals.Max-p.VitalSigns().Health, p.DamageTaken(),
		"DamageTaken sums the actual health lost this tick")
	assert.NotZero(t, p.DamageTaken())

	p.ResetTickNumbers()
	assert.Zero(t, p.DamageTaken())
}

func TestPlayer_XpGained_AccumulatesAndResets(t *testing.T) {
	p := newTestPlayer(nil)

	p.AddExperience(30)
	p.AddExperience(20) // stays level 1 (needs 100)

	assert.Equal(t, uint64(50), p.XpGained())

	p.ResetTickNumbers()
	assert.Zero(t, p.XpGained())
}

func TestPlayer_HealReceived_AccumulatesAndResets(t *testing.T) {
	p := newTestPlayer(nil)

	p.NoteHealReceived(100)
	p.NoteHealReceived(50)

	assert.Equal(t, vitals.VitalSign(150), p.HealReceived())

	p.ResetTickNumbers()
	assert.Zero(t, p.HealReceived())
}

// --- resource unification (roadmap Block 2, Stage 1) ---

// updateVitalSigns regenerates Health, the single resource (the survival
// vitals no longer exist as fields — the compiler is the pin for that).
func TestUpdateVitalSigns_RegeneratesHealthOnly(t *testing.T) {
	p := &player{
		config:        &cfg.PlayerConfig{HealthGainTick: 0.1, BaseHealth: 100},
		skills:        skills.NewSkillComponent(true),
		progression:   model.PlayerProgression{Level: 1},
		statusEffects: model.NewStatusEffects(),
		PlayerVitalSigns: model.PlayerVitalSigns{
			Health: 50, // half of maxHealth 100 (absolute HP, item 11)
		},
	}

	p.updateVitalSigns(0)

	assert.Greater(t, p.VitalSigns().Health, vitals.VitalSign(50), "wounded player regenerates health")
	assert.Contains(t, p.StatusEffects().Effects(), model.StatusEffectRegenerating)
}

// A player at Health 0 is dead; passive regen must not revive them. Guards the
// KILL-revive bug (one-shot zeroing reverted by regen before the death check).
func TestUpdateVitalSigns_DeadPlayerDoesNotRegenerate(t *testing.T) {
	p := &player{
		config:           &cfg.PlayerConfig{HealthGainTick: 0.1, BaseHealth: 100},
		skills:           skills.NewSkillComponent(true),
		progression:      model.PlayerProgression{Level: 1},
		statusEffects:    model.NewStatusEffects(),
		PlayerVitalSigns: model.PlayerVitalSigns{Health: 0},
	}

	p.updateVitalSigns(0)

	assert.Equal(t, vitals.VitalSign(0), p.VitalSigns().Health, "dead player (health 0) must stay dead")
	assert.NotContains(t, p.StatusEffects().Effects(), model.StatusEffectRegenerating)
}

// --- in-combat regen gate (atmosphere & recovery chunk 1) ---

// A fresh player is out of combat and regenerates normally.
func TestPlayer_InCombat_FalseInitially(t *testing.T) {
	p := newTestPlayer(nil)
	assert.False(t, p.InCombat(), "a fresh player is not in combat")
}

// Taking HP damage enters combat (the take-harm direction, stamped in
// takeDamage — the single damage choke point).
func TestPlayer_TakeDamage_EntersCombat(t *testing.T) {
	p := newTestPlayer(nil)
	p.statusEffects = model.NewStatusEffects()
	require.False(t, p.InCombat())

	p.takeDamage(model.Damage{HP: 5}, model.StatusEffectDamagedAmbient)

	assert.True(t, p.InCombat(), "taking HP damage puts the player in combat")
}

// While in combat, passive regen is suppressed and no Regenerating status is
// stamped (GDD §3 recovery gate).
func TestPlayer_InCombat_GatesRegen(t *testing.T) {
	p := newTestPlayer(nil)
	p.config.HealthGainTick = 0.1
	p.statusEffects = model.NewStatusEffects()
	p.PlayerVitalSigns.Health = 50

	p.NoteCombatAction()
	p.updateVitalSigns(0)

	assert.Equal(t, vitals.VitalSign(50), p.VitalSigns().Health, "no regen while in combat")
	assert.NotContains(t, p.StatusEffects().Effects(), model.StatusEffectRegenerating)
}

// Combat is purely time-gated: after the grace window ages out (via
// ResetTickNumbers), the player leaves combat and regen resumes — even with an
// enemy still present (no exit-side scan; the deliberate WoW divergence).
func TestPlayer_CombatWindow_ExpiresAndRegenResumes(t *testing.T) {
	p := newTestPlayer(nil)
	p.config.HealthGainTick = 0.1
	p.statusEffects = model.NewStatusEffects()
	p.PlayerVitalSigns.Health = 50

	p.NoteCombatAction()
	require.True(t, p.InCombat())

	for i := 0; i < combatRegenGraceTicks; i++ {
		p.ResetTickNumbers()
	}
	assert.False(t, p.InCombat(), "combat drops after the grace window")

	p.updateVitalSigns(0)
	assert.Greater(t, p.VitalSigns().Health, vitals.VitalSign(50), "regen resumes once out of combat")
}

// --- recent healers (participation XP, roadmap item 10) ---

func TestRecentHealers_RecordedAfterHeal(t *testing.T) {
	p := newTestPlayer(nil)
	healer := newTestPlayer(nil)

	p.NoteHealedBy(healer)

	require.Len(t, p.RecentHealers(), 1)
	assert.Equal(t, model.PlayerEntity(healer), p.RecentHealers()[0])
}

func TestRecentHealers_ExpireAfterWindow(t *testing.T) {
	p := newTestPlayer(nil)
	healer := newTestPlayer(nil)
	p.NoteHealedBy(healer)

	for i := 0; i < healParticipationWindowTicks; i++ {
		p.tickRecentHealers()
	}

	assert.Empty(t, p.RecentHealers())
}

func TestRecentHealers_ReheatRefreshesWindow(t *testing.T) {
	p := newTestPlayer(nil)
	healer := newTestPlayer(nil)
	p.NoteHealedBy(healer)

	// Half the window passes, then the healer heals again.
	for i := 0; i < healParticipationWindowTicks/2; i++ {
		p.tickRecentHealers()
	}
	p.NoteHealedBy(healer)
	for i := 0; i < healParticipationWindowTicks/2; i++ {
		p.tickRecentHealers()
	}

	assert.Len(t, p.RecentHealers(), 1, "a fresh heal restarts the window")
}

func TestAddExperience_Level2_DiscoversHealAura(t *testing.T) {
	milestones := []skills.MilestoneUnlock{{Level: 2, Skill: defHealAura}}
	p := newTestPlayer(milestones)

	p.AddExperience(100) // exactly enough for level 2

	assert.Equal(t, uint32(2), p.progression.Level)
	assert.True(t, p.skills.HasDiscovered(defHealAura.ID), "Heal must be discovered at level 2")
}

func TestAddExperience_Level3_NoMilestoneEntry(t *testing.T) {
	milestones := []skills.MilestoneUnlock{{Level: 2, Skill: defHealAura}}
	p := newTestPlayer(milestones)

	p.AddExperience(300) // enough for level 3 (100 + 200)

	assert.Equal(t, uint32(3), p.progression.Level)
	// spellbook: Heal (level-2 unlock) only — a fresh spawn starts empty
	// (triage item 11), so no start freebie inflates the count.
	assert.Len(t, p.skills.Discovered(), 1)
}

// TestDeathRespawn_RetainsSpellbookAndProgression reproduces the semi-permadeath
// bug: on death sys/state.go stashes the player's progression + skill component,
// and on re-join it restores both onto the fresh player entity. Without the
// SkillComponent carry-over, drop unlocks (and milestone unlocks below the
// current level) are lost forever. This mirrors exactly what ConnectionStateSystem
// does across the death→spectator→rejoin transition.
func TestDeathRespawn_RetainsSpellbookAndProgression(t *testing.T) {
	// A "drop" skill discovered only via a monster kill — unrecoverable by
	// re-applying milestones, so it must survive death via the component itself.
	defWildAura := &skills.SkillDefinition{ID: 3, Name: "Wild", Category: skills.SkillCategoryActiveAura, MaxLevel: 5}

	// Player levels up (milestone Heal) and picks up a Wild drop.
	dying := newTestPlayer([]skills.MilestoneUnlock{{Level: 2, Skill: defHealAura}})
	dying.AddExperience(150) // reach level 2 with progress toward 3
	dying.skills.Discover(defWildAura.ID)
	require.True(t, dying.skills.HasDiscovered(defHealAura.ID))
	require.True(t, dying.skills.HasDiscovered(defWildAura.ID))
	require.True(t, dying.skills.RaiseSkillLevel(defWildAura), "spend a point on the drop")

	// Active buffs/debuffs at the moment of death must NOT carry over: the
	// store lives on the entity, and carriedState stashes only progression +
	// SkillComponent (effect foundations Step 2, sub-decision 5).
	dying.ApplyResist(40, []string{"fire"}, 0.5, 100)
	dying.ApplyDot(5, skills.DotBuff{HP: 4, Tags: []string{"fire"}, Interval: 1}, 100)

	// Death: state.go keeps the level (partial-XP loss) and stashes the component.
	dying.LoseCurrentLevelExperience()
	stashedProgression := dying.Progression()
	stashedSkills := dying.SkillComponent()

	// Re-join: player.New builds a fresh entity — spellbook is empty (triage
	// item 11: nothing is granted at spawn).
	respawned := newTestPlayer(nil)
	require.False(t, respawned.skills.HasDiscovered(defWildAura.ID), "fresh player must lack the drop (bug precondition)")

	// state.go restores the stashed progression and spellbook.
	respawned.SetProgression(stashedProgression)
	respawned.SetSkillComponent(stashedSkills)

	assert.Equal(t, uint32(2), respawned.progression.Level, "level retained")
	assert.True(t, respawned.skills.HasDiscovered(defHealAura.ID), "milestone unlock retained")
	assert.True(t, respawned.skills.HasDiscovered(defWildAura.ID), "drop unlock retained")
	assert.Equal(t, 2, respawned.skills.SkillLevel(defWildAura.ID), "spent skill level retained")

	// The HUD XP-bar text must read 0/needed after respawn: the death penalty
	// dropped the within-level XP, and the wire values come from this pair.
	gained, required := respawned.LevelProgressXP()
	assert.Equal(t, uint64(0), gained, "within-level XP resets on death")
	assert.Equal(t, uint64(200), required, "level 2→3 span unchanged")

	// Death cleared the buff store: no resist, no still-burning dot.
	assert.InDelta(t, 1.0, respawned.buffs.ResistMultiplier([]string{"fire"}), 1e-6,
		"resist buffs do not survive respawn")
	respawnedDots, _ := respawned.buffs.DueBuffEvents()
	assert.Empty(t, respawnedDots, "dot debuffs do not survive respawn")
}

func TestAddExperience_DiscoverIdempotent(t *testing.T) {
	milestones := []skills.MilestoneUnlock{{Level: 2, Skill: defHealAura}}
	p := newTestPlayer(milestones)

	p.AddExperience(100) // reaches level 2, fires unlock
	p.AddExperience(50)  // stays at level 2, no new level-up

	assert.Equal(t, uint32(2), p.progression.Level)
	assert.Len(t, p.skills.Discovered(), 1, "spellbook must not grow on second XP grant at same level")
}

// --- tag resistances (item 11 Phase 2 Step 3) ---

func TestPlayer_TakeDamage_ResistBuffAndPassiveStack(t *testing.T) {
	p := newTestPlayer(nil)
	p.statusEffects = model.NewStatusEffects()

	// Passive source (Derived) and transient aura buff always stack —
	// different sources: 40 × 0.5 × 0.5 = 10.
	p.skills.Derived.Resistances = map[string]float32{"fire": 0.5}
	p.ApplyResist(40, []string{"fire"}, 0.5, 2)

	before := p.VitalSigns().Health
	p.takeDamage(model.Damage{HP: 40, Tags: []string{"fire"}}, model.StatusEffectDamagedAmbient)
	assert.Equal(t, vitals.VitalSign(10), before-p.VitalSigns().Health)

	// Two tick boundaries later the transient buff is gone; the passive stays.
	p.ResetTickNumbers()
	p.ResetTickNumbers()
	before = p.VitalSigns().Health
	p.takeDamage(model.Damage{HP: 40, Tags: []string{"fire"}}, model.StatusEffectDamagedAmbient)
	assert.Equal(t, vitals.VitalSign(20), before-p.VitalSigns().Health)
}

func TestPlayer_TakeDamage_ImmuneIsANonEvent(t *testing.T) {
	p := newTestPlayer(nil)
	p.statusEffects = model.NewStatusEffects()
	p.ApplyResist(40, []string{"fire"}, 0, 2) // immunity from a single source

	p.takeDamage(model.Damage{HP: 40, Tags: []string{"fire"}}, model.StatusEffectDamagedAmbient)

	assert.Equal(t, vitals.Max, p.VitalSigns().Health)
	assert.Zero(t, p.DamageTaken(), "no floating number for a fully resisted hit")
}

// --- companion combat signals (mob-depth chunk 6, §3.6) ---

// fakeAttackerMob is the minimal MobEntity+Combatant shape a companion's
// acquisition signals carry; unimplemented methods panic via the embedded
// nil interface.
type fakeAttackerMob struct {
	model.MobEntity
	basic       ecs.BasicEntity
	pos         phy.Vec2f
	healthRatio float32
}

func (f *fakeAttackerMob) Basic() ecs.BasicEntity { return f.basic }
func (f *fakeAttackerMob) Faction() model.Faction { return model.FactionHostile }
func (f *fakeAttackerMob) Position() phy.Vec2f    { return f.pos }
func (f *fakeAttackerMob) Radius() float32        { return 0.3 }
func (f *fakeAttackerMob) HealthRatio() float32   { return f.healthRatio }
func (f *fakeAttackerMob) InCombat() bool         { return false }

func newFakeAttackerMob() *fakeAttackerMob {
	return &fakeAttackerMob{basic: ecs.NewBasic(), healthRatio: 1}
}

func TestPlayer_CombatSignals_AttackStampAndExpiry(t *testing.T) {
	p := newTestPlayer(nil)
	target := newFakeAttackerMob()

	require.Nil(t, p.RecentAttackTarget(), "fresh player has no attack signal")
	p.NoteAttackDealt(target)
	assert.Same(t, model.Combatant(target), p.RecentAttackTarget())

	for i := 0; i < combatSignalWindowTicks-1; i++ {
		p.ResetTickNumbers()
	}
	assert.Same(t, model.Combatant(target), p.RecentAttackTarget(),
		"the stamp survives the whole window")
	p.ResetTickNumbers()
	assert.Nil(t, p.RecentAttackTarget(), "the stamp expires after the window")
}

func TestPlayer_CombatSignals_AttackerStampFromMobTouches(t *testing.T) {
	p := newTestPlayer(nil)
	p.statusEffects = model.NewStatusEffects()
	attacker := newFakeAttackerMob()

	require.Nil(t, p.RecentAttacker(), "fresh player has no attacker signal")
	p.MobTouches(attacker, mobs.Factors{Damage: 1})
	assert.Same(t, model.Combatant(attacker), p.RecentAttacker(),
		"a mob hit stamps the attacker signal")

	for i := 0; i < combatSignalWindowTicks; i++ {
		p.ResetTickNumbers()
	}
	assert.Nil(t, p.RecentAttacker(), "the attacker stamp expires after the window")
}

func TestPlayer_CombatSignals_ReStampRefreshesWindow(t *testing.T) {
	p := newTestPlayer(nil)
	target := newFakeAttackerMob()

	p.NoteAttackDealt(target)
	for i := 0; i < combatSignalWindowTicks-1; i++ {
		p.ResetTickNumbers()
	}
	p.NoteAttackDealt(target) // re-stamp on the last tick
	p.ResetTickNumbers()
	assert.Same(t, model.Combatant(target), p.RecentAttackTarget(),
		"a re-stamp restarts the window")
}

func TestPlayer_CombatSignals_DeadStampReadsNil(t *testing.T) {
	p := newTestPlayer(nil)
	p.statusEffects = model.NewStatusEffects()
	target := newFakeAttackerMob()
	attacker := newFakeAttackerMob()

	p.NoteAttackDealt(target)
	p.MobTouches(attacker, mobs.Factors{Damage: 1})
	target.healthRatio = 0
	attacker.healthRatio = 0

	assert.Nil(t, p.RecentAttackTarget(), "a dead stamp target reads nil")
	assert.Nil(t, p.RecentAttacker(), "a dead attacker reads nil")
}

// A player heals via model.Healable.Heal (mob-depth chunk 8): the SkillSystem
// now routes heal writes through this seam for players and mobs alike. Clamps
// at MaxHealth, records the floating heal number, returns the applied delta.
func TestPlayer_Heal_ClampsRecordsAndReturnsDelta(t *testing.T) {
	p := newTestPlayer(nil)
	maxHP := p.MaxHealth()
	p.PlayerVitalSigns.Health = maxHP.Sub(40)

	healed := p.Heal(30)
	assert.Equal(t, vitals.VitalSign(30), healed)
	assert.Equal(t, maxHP.Sub(10), p.VitalSigns().Health)
	assert.Equal(t, vitals.VitalSign(30), p.HealReceived())

	// Over-heal clamps at MaxHealth; only the applied delta is recorded.
	healed = p.Heal(50)
	assert.Equal(t, vitals.VitalSign(10), healed)
	assert.Equal(t, maxHP, p.VitalSigns().Health)
	assert.Equal(t, vitals.VitalSign(40), p.HealReceived())
}

// --- damage dealt return + lifesteal + crit accumulator (plan-skill-vocab chunk 1) ---

func TestPlayer_TakeDamage_ReturnsDealtLoss(t *testing.T) {
	p := newTestPlayer(nil)
	p.statusEffects = model.NewStatusEffects()

	dealt := p.takeDamage(model.Damage{HP: 7}, model.StatusEffectDamagedAmbient)
	assert.Equal(t, vitals.VitalSign(7), dealt, "mirrors the mob site: post-mitigation loss")

	p.PlayerVitalSigns.Health = 3
	dealt = p.takeDamage(model.Damage{HP: 100}, model.StatusEffectDamagedAmbient)
	assert.Equal(t, vitals.VitalSign(3), dealt, "overkill never counts (F6 §3.1/9)")
}

func TestPlayer_CritTaken_AccumulatesAndResets(t *testing.T) {
	p := newTestPlayer(nil)
	p.statusEffects = model.NewStatusEffects()

	p.takeDamage(model.Damage{HP: 5, Crit: true}, model.StatusEffectDamagedAmbient)
	p.takeDamage(model.Damage{HP: 3}, model.StatusEffectDamagedAmbient)

	assert.Equal(t, vitals.VitalSign(5), p.CritTaken(),
		"only crit-flagged hits land on the crit accumulator")
	assert.Equal(t, vitals.VitalSign(8), p.DamageTaken())

	p.ResetTickNumbers()
	assert.Zero(t, p.CritTaken())
}

// fakeLeechMob adds a Heal recorder to fakeAttackerMob so a mob-cast hit's
// lifesteal heal-back is observable.
type fakeLeechMob struct {
	fakeAttackerMob
	healed []uint32
}

func (f *fakeLeechMob) Heal(hp uint32) vitals.VitalSign {
	f.healed = append(f.healed, hp)
	return vitals.VitalSign(hp)
}

func TestPlayer_MobTouches_LifestealHealsMob(t *testing.T) {
	p := newTestPlayer(nil)
	p.statusEffects = model.NewStatusEffects()
	attacker := &fakeLeechMob{fakeAttackerMob: *newFakeAttackerMob()}

	p.MobTouches(attacker, mobs.Factors{Damage: 10, Lifesteal: 0.5})

	require.Len(t, attacker.healed, 1)
	assert.Equal(t, uint32(5), attacker.healed[0], "a mob-cast hit leeches off the player")
}

func TestPlayer_MobTouches_CritLandsOnCritTaken(t *testing.T) {
	p := newTestPlayer(nil)
	p.statusEffects = model.NewStatusEffects()

	p.MobTouches(newFakeAttackerMob(), mobs.Factors{Damage: 10, Crit: true})

	assert.Equal(t, vitals.VitalSign(10), p.CritTaken(), "Factors.Crit rides into the accumulator")
}

// --- shield absorb step (plan-skill-vocab chunk 2, F6 §3.1/8-9) ---

func TestPlayer_TakeDamage_ShieldAbsorbsBeforeHP(t *testing.T) {
	p := newTestPlayer(nil)
	p.statusEffects = model.NewStatusEffects()
	p.ApplyShield(27, 20, 300)

	dealt := p.takeDamage(model.Damage{HP: 8, Crit: true}, model.StatusEffectDamagedAmbient)

	assert.Equal(t, vitals.VitalSign(8), dealt, "a fully absorbed hit still counts as dealt")
	assert.Equal(t, vitals.Max, p.VitalSigns().Health, "HP untouched while the shield holds")
	assert.Zero(t, p.DamageTaken(), "damage numbers show real HP loss only")
	assert.Zero(t, p.CritTaken(), "crit accumulator follows the same loss-only rule")
	assert.Equal(t, vitals.VitalSign(12), p.ShieldHP(), "the pool drained by the absorbed amount")
	assert.True(t, p.InCombat(), "being beaten on your shield is combat (§3.1)")
}

func TestPlayer_TakeDamage_PartialAbsorbSpillsToHP(t *testing.T) {
	p := newTestPlayer(nil)
	p.statusEffects = model.NewStatusEffects()
	p.ApplyShield(27, 5, 300)

	before := p.VitalSigns().Health
	dealt := p.takeDamage(model.Damage{HP: 8}, model.StatusEffectDamagedAmbient)

	assert.Equal(t, vitals.VitalSign(8), dealt, "dealt = absorbed + HP lost")
	assert.Equal(t, before-3, p.VitalSigns().Health, "the spill hits HP")
	assert.Equal(t, vitals.VitalSign(3), p.DamageTaken())
	assert.Zero(t, p.ShieldHP(), "the broken pool is gone")
}

func TestPlayer_TakeDamage_ShieldAfterResistAndDR(t *testing.T) {
	// Composition pin, incoming side of F6 §3.1: resist buffs × passive DR
	// mitigate first, the shield absorbs the post-mitigation amount.
	// Hand-computed: 40 × 0.5 resist × (1 − 0.25 DR) = 15 → shield absorbs
	// 12 → 3 hit HP; dealt = 12 + 3 = 15.
	p := newTestPlayer(nil)
	p.statusEffects = model.NewStatusEffects()
	p.skills.Derived.DamageReductionBonus = 0.25
	p.ApplyResist(40, []string{"fire"}, 0.5, 100)
	p.ApplyShield(27, 12, 300)

	before := p.VitalSigns().Health
	dealt := p.takeDamage(model.Damage{HP: 40, Tags: []string{"fire"}}, model.StatusEffectDamagedAmbient)

	assert.Equal(t, vitals.VitalSign(15), dealt)
	assert.Equal(t, before-3, p.VitalSigns().Health)
	assert.Zero(t, p.ShieldHP())
	assert.Equal(t, vitals.VitalSign(3), p.DamageTaken())
}

func TestPlayer_TakeDamage_FullyResistedHitLeavesShieldUntouched(t *testing.T) {
	// A fully resisted hit stays a non-event (no combat stamp, chunk-1 rule)
	// and must not drain absorb capacity either.
	p := newTestPlayer(nil)
	p.statusEffects = model.NewStatusEffects()
	p.ApplyResist(40, []string{"fire"}, 0, 100) // immune
	p.ApplyShield(27, 20, 300)

	dealt := p.takeDamage(model.Damage{HP: 40, Tags: []string{"fire"}}, model.StatusEffectDamagedAmbient)

	assert.Zero(t, dealt)
	assert.Equal(t, vitals.VitalSign(20), p.ShieldHP(), "resisted-away damage never reaches the shield")
	assert.False(t, p.InCombat())
}

func TestPlayer_TakeDamage_GodLeavesShieldUntouched(t *testing.T) {
	p := newTestPlayer(nil)
	p.statusEffects = model.NewStatusEffects()
	p.SetGodmode(true)
	p.ApplyShield(27, 20, 300)

	dealt := p.takeDamage(model.Damage{HP: 8}, model.StatusEffectDamagedAmbient)

	assert.Zero(t, dealt)
	assert.Equal(t, vitals.VitalSign(20), p.ShieldHP(), "god mode short-circuits before the absorb step")
}

func TestPlayer_MobTouches_LifestealCountsAbsorbedDamage(t *testing.T) {
	// §4.2 (a) interplay pin: "damage dealt" includes the shield-absorbed
	// share — leeching off a shielded target still heals.
	p := newTestPlayer(nil)
	p.statusEffects = model.NewStatusEffects()
	p.ApplyShield(27, 20, 300)
	attacker := &fakeLeechMob{fakeAttackerMob: *newFakeAttackerMob()}

	p.MobTouches(attacker, mobs.Factors{Damage: 10, Lifesteal: 0.5})

	require.Len(t, attacker.healed, 1)
	assert.Equal(t, uint32(5), attacker.healed[0], "heal = dealt (absorbed + lost) × fraction")
	assert.Equal(t, vitals.Max, p.VitalSigns().Health, "the hit itself was fully absorbed")
}

// --- cast interrupt hooks (plan-skill-vocab chunk 4) ---

// equipCastingSkill puts a cast-time cooldown in slot 0 and starts the cast.
func equipCastingSkill(p *player, interruptedByDamage bool) {
	def := &skills.SkillDefinition{
		ID: 28, Name: "Recall", Category: skills.SkillCategoryCooldown, MaxLevel: 1,
		CooldownTicks: 9000, CastTicks: 300, CastInterruptedByDamage: interruptedByDamage,
	}
	p.skills.EquipCooldown(0, def, 1)
	p.skills.StartCast(0)
}

func TestPlayer_TakeDamage_CancelsFlaggedCast(t *testing.T) {
	p := newTestPlayer(nil)
	p.statusEffects = model.NewStatusEffects()
	equipCastingSkill(p, true)

	p.takeDamage(model.Damage{HP: 5}, model.StatusEffectDamagedAmbient)

	assert.False(t, p.skills.IsCasting(), "castInterruptedByDamage: dealt > 0 cancels")
}

func TestPlayer_TakeDamage_UnflaggedCastSurvives(t *testing.T) {
	// Damage-interrupt is opt-in (chunk-4 start decision): regular combat
	// casts keep winding up while being hit.
	p := newTestPlayer(nil)
	p.statusEffects = model.NewStatusEffects()
	equipCastingSkill(p, false)

	p.takeDamage(model.Damage{HP: 5}, model.StatusEffectDamagedAmbient)

	assert.True(t, p.skills.IsCasting(), "unflagged cast survives damage")
}

func TestPlayer_TakeDamage_FullyAbsorbedHitCancelsFlaggedCast(t *testing.T) {
	// Consistent with §3.1's "beaten on your shield is combat": dealt counts
	// absorbs, so a fully shielded hit still interrupts a Recall.
	p := newTestPlayer(nil)
	p.statusEffects = model.NewStatusEffects()
	p.ApplyShield(27, 20, 300)
	equipCastingSkill(p, true)

	p.takeDamage(model.Damage{HP: 8}, model.StatusEffectDamagedAmbient)

	assert.Equal(t, vitals.Max, p.VitalSigns().Health, "hit fully absorbed")
	assert.False(t, p.skills.IsCasting(), "absorbed damage still interrupts")
}

func TestPlayer_SetSkillComponent_ClearsCastState(t *testing.T) {
	// The component is carried across death (deadState.skills); an in-flight
	// cast must never survive into the respawned player — this also covers
	// deaths that bypass takeDamage (heal-aura self-cost).
	p := newTestPlayer(nil)
	sc := skills.NewSkillComponent(true)
	def := &skills.SkillDefinition{
		ID: 28, Name: "Recall", Category: skills.SkillCategoryCooldown, MaxLevel: 1,
		CooldownTicks: 9000, CastTicks: 300, CastInterruptedByDamage: true,
	}
	sc.EquipCooldown(0, def, 1)
	sc.StartCast(0)

	p.SetSkillComponent(sc)

	assert.False(t, p.SkillComponent().IsCasting(), "respawn starts with no cast in flight")
}

// C8 walkthrough settlement (PO 2026-07-20): %-of-max regen tapers with level
// — 100% of the configured rate at L1 sliding linearly to 40% at max level.
// The Session-③ 1%/s lock was measured at low brackets and stays true there;
// untapered, absolute regen grows ~27x over the curve and reads as free
// sustain at the top end.
func TestRegenTaper_LinearFromFullToFloor(t *testing.T) {
	if got := regenTaper(1, 30); got != 1.0 {
		t.Fatalf("L1 taper = %v, want 1.0", got)
	}
	if got := regenTaper(30, 30); got < 0.399 || got > 0.401 {
		t.Fatalf("Lmax taper = %v, want 0.4", got)
	}
	mid := regenTaper(15, 30)
	if mid <= 0.4 || mid >= 1.0 {
		t.Fatalf("mid-curve taper = %v, want strictly between 0.4 and 1.0", mid)
	}
	// Degenerate curve (maxLevel <= 1, e.g. sim fixtures): no taper.
	if got := regenTaper(1, 0); got != 1.0 {
		t.Fatalf("degenerate maxLevel taper = %v, want 1.0", got)
	}
}
