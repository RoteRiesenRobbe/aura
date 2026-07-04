package player

import (
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/trichner/berryhunter/pkg/berryhunter/cfg"
	"github.com/trichner/berryhunter/pkg/berryhunter/model"
	"github.com/trichner/berryhunter/pkg/berryhunter/model/vitals"
	"github.com/trichner/berryhunter/pkg/berryhunter/skills"
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
	defDamageAura = &skills.SkillDefinition{ID: 1, Name: "DamageAura", Category: skills.SkillCategoryActiveAura, MaxLevel: 5}
)

func TestInitializePlayerSkills_SlotsAndSpellbook(t *testing.T) {
	r := newStubRegistry(defDamageAura)
	sc, err := initializePlayerSkills(r)
	require.NoError(t, err)

	require.NotNil(t, sc.AuraSlots[0], "slot 0 must be populated")
	assert.Equal(t, "DamageAura", sc.AuraSlots[0].Def.Name)
	assert.Equal(t, 1, sc.AuraSlots[0].Level)

	assert.Nil(t, sc.AuraSlots[1], "slot 1 must be empty — HealAura not yet unlocked")

	assert.Equal(t, 0, sc.ActiveAuraSlot)

	assert.True(t, sc.HasDiscovered(defDamageAura.ID), "DamageAura must be in spellbook")
}

func TestInitializePlayerSkills_MissingDamageAura(t *testing.T) {
	r := newStubRegistry() // DamageAura absent
	_, err := initializePlayerSkills(r)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "DamageAura")
}

// --- milestone unlock tests ---

var defHealAura = &skills.SkillDefinition{ID: 2, Name: "HealAura", Category: skills.SkillCategoryActiveAura, MaxLevel: 5}

// newTestPlayer builds a minimal *player for unit-testing AddExperience.
// LevelUpXPBase=100, LevelUpXPGrowthFactor=2.0 means:
//
//	level 1→2 costs 100 XP, level 2→3 costs 200 XP.
func newTestPlayer(milestones []skills.MilestoneUnlock) *player {
	r := newStubRegistry(defDamageAura, defHealAura)
	sc, _ := initializePlayerSkills(r)
	return &player{
		progression:      model.PlayerProgression{Level: 1},
		config:           &cfg.PlayerConfig{LevelUpXPBase: 100, LevelUpXPGrowthFactor: 2.0},
		skills:           sc,
		milestoneUnlocks: milestones,
		PlayerVitalSigns: model.PlayerVitalSigns{Health: vitals.Max},
	}
}

// --- resource unification (v1-roadmap Block 2, Stage 1) ---

// updateVitalSigns must regenerate only Health (the single resource) and must
// no longer force satiety/temperature to Max — those survival vitals are gone.
func TestUpdateVitalSigns_RegeneratesHealthOnly(t *testing.T) {
	p := &player{
		config:        &cfg.PlayerConfig{HealthGainTick: 0.1},
		statusEffects: model.NewStatusEffects(),
		PlayerVitalSigns: model.PlayerVitalSigns{
			Health:          vitals.Max / 2,
			Satiety:         0,
			BodyTemperature: 0,
		},
	}

	p.updateVitalSigns(0)

	assert.Greater(t, p.VitalSigns().Health, vitals.Max/2, "wounded player regenerates health")
	assert.Equal(t, vitals.VitalSign(0), p.VitalSigns().Satiety, "satiety is no longer maintained")
	assert.Equal(t, vitals.VitalSign(0), p.VitalSigns().BodyTemperature, "body temperature is no longer maintained")
	assert.Contains(t, p.StatusEffects().Effects(), model.StatusEffectRegenerating)
}

// --- recent healers (participation XP, v1-roadmap item 10) ---

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
	assert.True(t, p.skills.HasDiscovered(defHealAura.ID), "HealAura must be discovered at level 2")
}

func TestAddExperience_Level3_NoMilestoneEntry(t *testing.T) {
	milestones := []skills.MilestoneUnlock{{Level: 2, Skill: defHealAura}}
	p := newTestPlayer(milestones)

	p.AddExperience(300) // enough for level 3 (100 + 200)

	assert.Equal(t, uint32(3), p.progression.Level)
	// spellbook: DamageAura (from init) + HealAura (level-2 unlock) — nothing more
	assert.Len(t, p.skills.Discovered(), 2)
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
	defWildAura := &skills.SkillDefinition{ID: 3, Name: "WildAura", Category: skills.SkillCategoryActiveAura, MaxLevel: 5}

	// Player levels up (milestone HealAura) and picks up a WildAura drop.
	dying := newTestPlayer([]skills.MilestoneUnlock{{Level: 2, Skill: defHealAura}})
	dying.AddExperience(150) // reach level 2 with progress toward 3
	dying.skills.Discover(defWildAura.ID)
	require.True(t, dying.skills.HasDiscovered(defHealAura.ID))
	require.True(t, dying.skills.HasDiscovered(defWildAura.ID))
	require.True(t, dying.skills.RaiseSkillLevel(defWildAura), "spend a point on the drop")

	// Death: state.go keeps the level (partial-XP loss) and stashes the component.
	dying.LoseCurrentLevelExperience()
	stashedProgression := dying.Progression()
	stashedSkills := dying.SkillComponent()

	// Re-join: player.New builds a fresh entity — spellbook has DamageAura only.
	respawned := newTestPlayer(nil)
	require.False(t, respawned.skills.HasDiscovered(defWildAura.ID), "fresh player must lack the drop (bug precondition)")

	// state.go restores the stashed progression and spellbook.
	respawned.SetProgression(stashedProgression)
	respawned.SetSkillComponent(stashedSkills)

	assert.Equal(t, uint32(2), respawned.progression.Level, "level retained")
	assert.True(t, respawned.skills.HasDiscovered(defHealAura.ID), "milestone unlock retained")
	assert.True(t, respawned.skills.HasDiscovered(defWildAura.ID), "drop unlock retained")
	assert.Equal(t, 2, respawned.skills.SkillLevel(defWildAura.ID), "spent skill level retained")
}

func TestAddExperience_DiscoverIdempotent(t *testing.T) {
	milestones := []skills.MilestoneUnlock{{Level: 2, Skill: defHealAura}}
	p := newTestPlayer(milestones)

	p.AddExperience(100) // reaches level 2, fires unlock
	p.AddExperience(50)  // stays at level 2, no new level-up

	assert.Equal(t, uint32(2), p.progression.Level)
	assert.Len(t, p.skills.Discovered(), 2, "spellbook must not grow on second XP grant at same level")
}

