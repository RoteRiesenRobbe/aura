package player

import (
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
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
	defHealAura   = &skills.SkillDefinition{ID: 2, Name: "HealAura", Category: skills.SkillCategoryActiveAura, MaxLevel: 5}
)

func TestInitializePlayerSkills_SlotsAndSpellbook(t *testing.T) {
	r := newStubRegistry(defDamageAura, defHealAura)
	sc, err := initializePlayerSkills(r)
	require.NoError(t, err)

	require.NotNil(t, sc.AuraSlots[0], "slot 0 must be populated")
	assert.Equal(t, "DamageAura", sc.AuraSlots[0].Def.Name)
	assert.Equal(t, 1, sc.AuraSlots[0].Level)

	require.NotNil(t, sc.AuraSlots[1], "slot 1 must be populated")
	assert.Equal(t, "HealAura", sc.AuraSlots[1].Def.Name)
	assert.Equal(t, 1, sc.AuraSlots[1].Level)

	assert.Equal(t, 0, sc.ActiveAuraSlot)

	assert.True(t, sc.HasDiscovered(defDamageAura.ID), "DamageAura must be in spellbook")
	assert.True(t, sc.HasDiscovered(defHealAura.ID), "HealAura must be in spellbook")
}

func TestInitializePlayerSkills_MissingDamageAura(t *testing.T) {
	r := newStubRegistry(defHealAura) // DamageAura absent
	_, err := initializePlayerSkills(r)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "DamageAura")
}

func TestInitializePlayerSkills_MissingHealAura(t *testing.T) {
	r := newStubRegistry(defDamageAura) // HealAura absent
	_, err := initializePlayerSkills(r)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "HealAura")
}
