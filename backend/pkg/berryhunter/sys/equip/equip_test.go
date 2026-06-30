package equip

import (
	"fmt"
	"testing"

	"github.com/EngoEngine/ecs"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/trichner/berryhunter/pkg/berryhunter/model"
	"github.com/trichner/berryhunter/pkg/berryhunter/skills"
)

// --- stubs ---

type stubRegistry struct {
	byID map[skills.SkillID]*skills.SkillDefinition
}

func newStubRegistry(defs ...*skills.SkillDefinition) *stubRegistry {
	r := &stubRegistry{byID: make(map[skills.SkillID]*skills.SkillDefinition)}
	for _, d := range defs {
		r.byID[d.ID] = d
	}
	return r
}

func (r *stubRegistry) Get(id skills.SkillID) (*skills.SkillDefinition, error) {
	if d, ok := r.byID[id]; ok {
		return d, nil
	}
	return nil, fmt.Errorf("skill ID %d not found", id)
}

func (r *stubRegistry) GetByName(name string) (*skills.SkillDefinition, error) {
	for _, d := range r.byID {
		if d.Name == name {
			return d, nil
		}
	}
	return nil, fmt.Errorf("skill %q not found", name)
}

func (r *stubRegistry) All() []*skills.SkillDefinition {
	result := make([]*skills.SkillDefinition, 0, len(r.byID))
	for _, d := range r.byID {
		result = append(result, d)
	}
	return result
}

type stubGame struct {
	registry skills.Registry
}

func (g *stubGame) Skills() skills.Registry { return g.registry }

// stubClient queues exactly one EquipSkill message, then returns nil.
type stubClient struct {
	msg *model.EquipSkill
}

func (c *stubClient) NextEquip() *model.EquipSkill {
	m := c.msg
	c.msg = nil
	return m
}
func (c *stubClient) NextInput() *model.PlayerInput       { return nil }
func (c *stubClient) NextJoin() *model.Join               { return nil }
func (c *stubClient) NextCheat() *model.Cheat             { return nil }
func (c *stubClient) NextChatMessage() *model.ChatMessage { return nil }
func (c *stubClient) SendMessage([]byte) error            { return nil }
func (c *stubClient) Close()                              {}
func (c *stubClient) UUID() uuid.UUID                     { return uuid.UUID{} }

// stubEquipEntity satisfies the narrow equipEntity interface — 4 methods only.
type stubEquipEntity struct {
	ecs.BasicEntity
	sc     *skills.SkillComponent
	client *stubClient
}

func (e *stubEquipEntity) Basic() ecs.BasicEntity                { return e.BasicEntity }
func (e *stubEquipEntity) Name() string                          { return "testPlayer" }
func (e *stubEquipEntity) Client() model.Client                  { return e.client }
func (e *stubEquipEntity) SkillComponent() *skills.SkillComponent { return e.sc }

// --- helpers ---

var (
	defDamage = &skills.SkillDefinition{ID: 1, Name: "DamageAura", Category: skills.SkillCategoryActiveAura, MaxLevel: 5}
	defHeal   = &skills.SkillDefinition{ID: 2, Name: "HealAura", Category: skills.SkillCategoryActiveAura, MaxLevel: 5}
)

func newSystem(defs ...*skills.SkillDefinition) (*EquipSystem, *stubEquipEntity) {
	g := &stubGame{registry: newStubRegistry(defs...)}
	es := NewEquipSystem(g)
	sc := skills.NewSkillComponent(true)
	player := &stubEquipEntity{
		BasicEntity: ecs.NewBasic(),
		sc:          sc,
		client:      &stubClient{},
	}
	es.AddPlayer(player)
	return es, player
}

// --- tests ---

func TestEquipSystem_ValidEquip(t *testing.T) {
	es, player := newSystem(defDamage, defHeal)
	player.sc.Discover(defHeal.ID)
	player.client.msg = &model.EquipSkill{SkillID: defHeal.ID, Slot: 1}

	es.Update(0)

	require.NotNil(t, player.sc.AuraSlots[1])
	assert.Equal(t, defHeal.ID, player.sc.AuraSlots[1].Def.ID)
	assert.Equal(t, 1, player.sc.AuraSlots[1].Level)
}

func TestEquipSystem_OutOfRangeSlot(t *testing.T) {
	es, player := newSystem(defDamage)
	player.sc.Discover(defDamage.ID)
	player.client.msg = &model.EquipSkill{SkillID: defDamage.ID, Slot: skills.MaxAuraSlots}

	es.Update(0)

	// No slot was modified — all remain nil (nothing was equipped at spawn in this test).
	for i := 0; i < skills.MaxAuraSlots; i++ {
		assert.Nil(t, player.sc.AuraSlots[i], "slot %d should be empty", i)
	}
}

func TestEquipSystem_UnknownSkill(t *testing.T) {
	es, player := newSystem() // empty registry
	player.client.msg = &model.EquipSkill{SkillID: 99, Slot: 0}

	es.Update(0)

	assert.Nil(t, player.sc.AuraSlots[0])
}

func TestEquipSystem_NotDiscovered(t *testing.T) {
	es, player := newSystem(defHeal)
	// defHeal is in registry but NOT discovered in spellbook
	player.client.msg = &model.EquipSkill{SkillID: defHeal.ID, Slot: 0}

	es.Update(0)

	assert.Nil(t, player.sc.AuraSlots[0])
}
