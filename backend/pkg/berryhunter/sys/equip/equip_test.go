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

// stubClient queues at most one message per type, then returns nil.
type stubClient struct {
	msg   *model.EquipSkill
	spend *model.SpendSkillPoint
}

func (c *stubClient) NextEquip() *model.EquipSkill {
	m := c.msg
	c.msg = nil
	return m
}
func (c *stubClient) NextSpendSkillPoint() *model.SpendSkillPoint {
	m := c.spend
	c.spend = nil
	return m
}
func (c *stubClient) NextInput() *model.PlayerInput       { return nil }
func (c *stubClient) NextJoin() *model.Join               { return nil }
func (c *stubClient) NextCheat() *model.Cheat             { return nil }
func (c *stubClient) NextChatMessage() *model.ChatMessage { return nil }
func (c *stubClient) SendMessage([]byte) error            { return nil }
func (c *stubClient) Close()                              {}
func (c *stubClient) UUID() uuid.UUID                     { return uuid.UUID{} }

// stubEquipEntity satisfies the narrow equipEntity interface.
type stubEquipEntity struct {
	ecs.BasicEntity
	sc              *skills.SkillComponent
	client          *stubClient
	availablePoints int
}

func (e *stubEquipEntity) Basic() ecs.BasicEntity                 { return e.BasicEntity }
func (e *stubEquipEntity) Name() string                           { return "testPlayer" }
func (e *stubEquipEntity) Client() model.Client                   { return e.client }
func (e *stubEquipEntity) SkillComponent() *skills.SkillComponent { return e.sc }
func (e *stubEquipEntity) AvailableSkillPoints() int              { return e.availablePoints }

// --- helpers ---

var (
	defDamage = &skills.SkillDefinition{ID: 1, Name: "DamageAura", Category: skills.SkillCategoryActiveAura, MaxLevel: 5}
	defHeal   = &skills.SkillDefinition{ID: 2, Name: "HealAura", Category: skills.SkillCategoryActiveAura, MaxLevel: 5}
	defSwift  = &skills.SkillDefinition{ID: 10, Name: "SwiftPassive", Category: skills.SkillCategoryPassive, MaxLevel: 3,
		Effects: []skills.EffectDef{{Type: skills.EffectTypeStatMultiplier, Stat: skills.StatMovementSpeed, AdditivePerLevel: 0.05}}}
	defNova = &skills.SkillDefinition{ID: 20, Name: "NovaBurst", Category: skills.SkillCategoryCooldown, MaxLevel: 3}
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

func TestEquipSystem_PassiveEquipsIntoPassiveSlot(t *testing.T) {
	es, player := newSystem(defSwift)
	player.sc.Discover(defSwift.ID)
	require.True(t, player.sc.RaiseSkillLevel(defSwift)) // level 2
	player.client.msg = &model.EquipSkill{SkillID: defSwift.ID, Slot: 1}

	es.Update(0)

	require.NotNil(t, player.sc.PassiveSlots[1])
	assert.Equal(t, defSwift.ID, player.sc.PassiveSlots[1].Def.ID)
	assert.Equal(t, 2, player.sc.PassiveSlots[1].Level)
	assert.Nil(t, player.sc.AuraSlots[1], "must not land in the aura slots")
	assert.InDelta(t, 0.10, player.sc.Derived.MovementSpeedBonus, 1e-6, "stat bonus applied on equip")
}

func TestEquipSystem_PassiveSlotOutOfRange(t *testing.T) {
	es, player := newSystem(defSwift)
	player.sc.Discover(defSwift.ID)
	player.client.msg = &model.EquipSkill{SkillID: defSwift.ID, Slot: skills.MaxPassiveSlots}

	es.Update(0)

	for i := 0; i < skills.MaxPassiveSlots; i++ {
		assert.Nil(t, player.sc.PassiveSlots[i], "slot %d should be empty", i)
	}
}

func TestEquipSystem_CooldownEquipsIntoCooldownSlot(t *testing.T) {
	es, player := newSystem(defNova)
	player.sc.Discover(defNova.ID)
	require.True(t, player.sc.RaiseSkillLevel(defNova)) // level 2
	player.client.msg = &model.EquipSkill{SkillID: defNova.ID, Slot: 1}

	es.Update(0)

	require.NotNil(t, player.sc.CooldownSlots[1])
	assert.Equal(t, defNova.ID, player.sc.CooldownSlots[1].Def.ID)
	assert.Equal(t, 2, player.sc.CooldownSlots[1].Level)
	assert.Nil(t, player.sc.AuraSlots[1], "must not land in the aura slots")
}

func TestEquipSystem_CooldownSlotOutOfRange(t *testing.T) {
	es, player := newSystem(defNova)
	player.sc.Discover(defNova.ID)
	player.client.msg = &model.EquipSkill{SkillID: defNova.ID, Slot: skills.MaxCooldownSlots}

	es.Update(0)

	for i := 0; i < skills.MaxCooldownSlots; i++ {
		assert.Nil(t, player.sc.CooldownSlots[i], "slot %d should be empty", i)
	}
}

func TestEquipSystem_EquipsAtStoredLevel(t *testing.T) {
	es, player := newSystem(defHeal)
	player.sc.Discover(defHeal.ID)
	require.True(t, player.sc.RaiseSkillLevel(defHeal))
	require.True(t, player.sc.RaiseSkillLevel(defHeal)) // spellbook level 3
	player.client.msg = &model.EquipSkill{SkillID: defHeal.ID, Slot: 0}

	es.Update(0)

	require.NotNil(t, player.sc.AuraSlots[0])
	assert.Equal(t, 3, player.sc.AuraSlots[0].Level)
}

func TestSpendSkillPoint_RaisesLevel(t *testing.T) {
	es, player := newSystem(defDamage)
	player.sc.Discover(defDamage.ID)
	player.availablePoints = 1
	player.client.spend = &model.SpendSkillPoint{SkillID: defDamage.ID}

	es.Update(0)

	assert.Equal(t, 2, player.sc.SkillLevel(defDamage.ID))
}

func TestSpendSkillPoint_NoPointsAvailable(t *testing.T) {
	es, player := newSystem(defDamage)
	player.sc.Discover(defDamage.ID)
	player.availablePoints = 0
	player.client.spend = &model.SpendSkillPoint{SkillID: defDamage.ID}

	es.Update(0)

	assert.Equal(t, 1, player.sc.SkillLevel(defDamage.ID))
}

func TestSpendSkillPoint_UnknownSkill(t *testing.T) {
	es, player := newSystem() // empty registry
	player.availablePoints = 1
	player.client.spend = &model.SpendSkillPoint{SkillID: 99}

	es.Update(0)

	assert.Equal(t, 0, player.sc.SkillLevel(99))
}

func TestSpendSkillPoint_NotDiscovered(t *testing.T) {
	es, player := newSystem(defDamage)
	player.availablePoints = 1
	player.client.spend = &model.SpendSkillPoint{SkillID: defDamage.ID}

	es.Update(0)

	assert.Equal(t, 0, player.sc.SkillLevel(defDamage.ID))
}

func TestSpendSkillPoint_AtMaxLevelIsRejected(t *testing.T) {
	es, player := newSystem(defDamage)
	player.sc.Discover(defDamage.ID)
	for i := 1; i < defDamage.MaxLevel; i++ {
		require.True(t, player.sc.RaiseSkillLevel(defDamage))
	}
	player.availablePoints = 1
	player.client.spend = &model.SpendSkillPoint{SkillID: defDamage.ID}

	es.Update(0)

	assert.Equal(t, defDamage.MaxLevel, player.sc.SkillLevel(defDamage.ID))
}

func TestSpendSkillPoint_UnspendLowersLevelAndSyncsEquipped(t *testing.T) {
	es, player := newSystem(defDamage)
	player.sc.Discover(defDamage.ID)
	require.True(t, player.sc.RaiseSkillLevel(defDamage)) // level 2
	player.sc.EquipAura(0, defDamage, 2)
	// Unspend needs no available points — it frees one.
	player.client.spend = &model.SpendSkillPoint{SkillID: defDamage.ID, Unspend: true}

	es.Update(0)

	assert.Equal(t, 1, player.sc.SkillLevel(defDamage.ID))
	assert.Equal(t, 1, player.sc.AuraSlots[0].Level)
}

func TestSpendSkillPoint_UnspendAtLevel1IsRejected(t *testing.T) {
	es, player := newSystem(defDamage)
	player.sc.Discover(defDamage.ID)
	player.client.spend = &model.SpendSkillPoint{SkillID: defDamage.ID, Unspend: true}

	es.Update(0)

	assert.Equal(t, 1, player.sc.SkillLevel(defDamage.ID))
}
