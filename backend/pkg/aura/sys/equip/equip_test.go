package equip

import (
	"fmt"
	"testing"
	"testing/fstest"

	"github.com/EngoEngine/ecs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
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
	msg    *model.EquipSkill
	spend  *model.SpendSkillPoint
	respec *model.Respec
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
func (c *stubClient) NextRespec() *model.Respec {
	m := c.respec
	c.respec = nil
	return m
}
func (c *stubClient) NextUseUtility() *model.UseUtility {
	return nil
}
func (c *stubClient) NextStartFlight() *model.StartFlight { return nil }
func (c *stubClient) NextInput() *model.PlayerInput         { return nil }
func (c *stubClient) NextJoin() *model.Join                 { return nil }
func (c *stubClient) NextCheat() *model.Cheat               { return nil }
func (c *stubClient) NextChatMessage() *model.ChatMessage   { return nil }
func (c *stubClient) NextRespawn() *model.Respawn           { return nil }
func (c *stubClient) NextInteract() *model.Interact         { return nil }
func (c *stubClient) SendMessage([]byte) error              { return nil }
func (c *stubClient) NextAbandonQuest() *model.AbandonQuest { return nil }
func (c *stubClient) SendUnlock(uint64, string) error       { return nil }
func (c *stubClient) SendJournal(string) error              { return nil }
func (c *stubClient) Close()                                {}
func (c *stubClient) UUID() uuid.UUID                       { return uuid.UUID{} }

// stubEquipEntity satisfies the narrow equipEntity interface.
type stubEquipEntity struct {
	ecs.BasicEntity
	sc              *skills.SkillComponent
	client          *stubClient
	availablePoints int
	inCombat        bool
	recipes         skills.RecipeRegistry
}

func (e *stubEquipEntity) Basic() ecs.BasicEntity                 { return e.BasicEntity }
func (e *stubEquipEntity) Name() string                           { return "testPlayer" }
func (e *stubEquipEntity) Client() model.Client                   { return e.client }
func (e *stubEquipEntity) InCombat() bool                         { return e.inCombat }
func (e *stubEquipEntity) SkillComponent() *skills.SkillComponent { return e.sc }
func (e *stubEquipEntity) AvailableSkillPoints() int              { return e.availablePoints }
func (e *stubEquipEntity) ApplyRecipeCascade() {
	if e.recipes != nil {
		skills.ApplyRecipes(e.sc, e.recipes)
	}
}

// --- helpers ---

var (
	defDamage = &skills.SkillDefinition{ID: 1, Name: "Damage", Category: skills.SkillCategoryActiveAura, MaxLevel: 5}
	defHeal   = &skills.SkillDefinition{ID: 2, Name: "Heal", Category: skills.SkillCategoryActiveAura, MaxLevel: 5}
	defSwift  = &skills.SkillDefinition{ID: 10, Name: "Swift", Category: skills.SkillCategoryPassive, MaxLevel: 3,
		Effects: []skills.EffectDef{{Type: skills.EffectTypeStatMultiplier, Stat: &skills.StatParams{Name: skills.StatMovementSpeed, Bonus: 0.05, BonusPerLevel: 0.05}}}}
	defNova   = &skills.SkillDefinition{ID: 20, Name: "NovaBurst", Category: skills.SkillCategoryCooldown, MaxLevel: 3}
	defRecall = &skills.SkillDefinition{ID: 21, Name: "Recall", Category: skills.SkillCategoryCooldown, MaxLevel: 1}
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

// Loadout editing is out-of-combat only: an equip requested while in combat is
// dropped, leaving every slot untouched.
func TestEquipSystem_RejectedInCombat(t *testing.T) {
	es, player := newSystem(defNova)
	player.sc.Discover(defNova.ID)
	player.inCombat = true
	player.client.msg = &model.EquipSkill{SkillID: defNova.ID, Slot: 0}

	es.Update(0)

	assert.Nil(t, player.sc.CooldownSlots[0], "equip must be dropped while in combat")
}

// The reported abuse case: re-slotting a cooldown used to mint a fresh, ready
// EquippedSkill. The combat lock drops a mid-combat re-equip, so the running
// cooldown survives and no slot is refreshed.
func TestEquipSystem_InCombatDoesNotRefreshCooldown(t *testing.T) {
	es, player := newSystem(defNova)
	player.sc.Discover(defNova.ID)
	player.sc.EquipCooldown(0, defNova, 1)
	player.sc.SetCooldownRemaining(defNova.ID, 42) // mid-cooldown

	// Player fired the cooldown, then tries to dodge it by re-slotting mid-fight.
	player.inCombat = true
	player.client.msg = &model.EquipSkill{SkillID: defNova.ID, Slot: 1}

	es.Update(0)

	require.NotNil(t, player.sc.CooldownSlots[0], "original slot must be untouched")
	assert.Equal(t, 42, player.sc.SlotCooldownRemaining(0), "cooldown must not be refreshed")
	assert.Nil(t, player.sc.CooldownSlots[1], "no fresh, ready copy in the new slot")
}

// The half the combat lock never covered: out of combat — which is ~3.3 s after
// the last hit, i.e. between every pull — the equip goes through, and it must
// still not refresh the cooldown. Remaining ticks are keyed by SKILL, so the
// new slot inherits the running cooldown instead of arriving ready.
func TestEquipSystem_OutOfCombatReslotKeepsCooldown(t *testing.T) {
	es, player := newSystem(defNova)
	player.sc.Discover(defNova.ID)
	player.sc.EquipCooldown(0, defNova, 1)
	player.sc.SetCooldownRemaining(defNova.ID, 42) // mid-cooldown

	player.inCombat = false
	player.client.msg = &model.EquipSkill{SkillID: defNova.ID, Slot: 1}

	es.Update(0)

	require.NotNil(t, player.sc.CooldownSlots[1], "the edit itself is allowed")
	assert.Nil(t, player.sc.CooldownSlots[0], "equipping the same cooldown moves it")
	assert.Equal(t, 42, player.sc.SlotCooldownRemaining(1),
		"the cooldown belongs to the skill — re-slotting must not reset it")
}

// Unequipping entirely (another skill takes the slot) must not launder the
// cooldown either: the timer keeps running while the skill sits outside the
// loadout, and coming back mid-cooldown is still not ready.
func TestEquipSystem_ParkingOutsideTheLoadoutDoesNotResetCooldown(t *testing.T) {
	es, player := newSystem(defNova, defRecall)
	player.sc.Discover(defNova.ID)
	player.sc.Discover(defRecall.ID)
	player.sc.EquipCooldown(0, defNova, 1)
	player.sc.SetCooldownRemaining(defNova.ID, 42)

	// Push Nova out of the loadout...
	player.client.msg = &model.EquipSkill{SkillID: defRecall.ID, Slot: 0}
	es.Update(0)
	require.Equal(t, defRecall.ID, player.sc.CooldownSlots[0].Def.ID)
	assert.Equal(t, 42, player.sc.CooldownRemaining(defNova.ID),
		"an unslotted skill keeps its remaining cooldown")

	// ...and bring it back.
	player.client.msg = &model.EquipSkill{SkillID: defNova.ID, Slot: 1}
	es.Update(0)

	assert.Equal(t, 42, player.sc.SlotCooldownRemaining(1), "still on cooldown on return")
}

// Out of combat the same edit goes through unchanged — build tweaks between
// fights are the intended use.
func TestEquipSystem_AllowedOutOfCombat(t *testing.T) {
	es, player := newSystem(defNova)
	player.sc.Discover(defNova.ID)
	player.inCombat = false
	player.client.msg = &model.EquipSkill{SkillID: defNova.ID, Slot: 0}

	es.Update(0)

	require.NotNil(t, player.sc.CooldownSlots[0])
	assert.Equal(t, defNova.ID, player.sc.CooldownSlots[0].Def.ID)
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

// A skill-level raise that satisfies a recipe unlocks the result (Phase 9);
// the trigger fires from the EquipSystem spend handler.
func TestSpendSkillPoint_RaiseTriggersRecipeCascade(t *testing.T) {
	es, player := newSystem(defDamage, defNova)
	// Recipe: Damage@2 -> NovaBurst.
	fsys := fstest.MapFS{"r.json": {Data: []byte(`{
      "id": 1, "result": "NovaBurst",
      "ingredients": [{ "skill": "Damage", "level": 2 }]
    }`)}}
	recipes, err := skills.RecipesFromFS(fsys, es.g.(*stubGame).registry)
	require.NoError(t, err)
	player.recipes = recipes

	player.sc.Discover(defDamage.ID)
	require.False(t, player.sc.HasDiscovered(defNova.ID))
	player.availablePoints = 1
	player.client.spend = &model.SpendSkillPoint{SkillID: defDamage.ID}

	es.Update(0)

	assert.Equal(t, 2, player.sc.SkillLevel(defDamage.ID))
	assert.True(t, player.sc.HasDiscovered(defNova.ID), "combo result unlocked by the raise")
}

// Unspend must never trigger a recipe: it can only lower a level.
func TestSpendSkillPoint_UnspendDoesNotTriggerRecipe(t *testing.T) {
	es, player := newSystem(defDamage, defNova)
	fsys := fstest.MapFS{"r.json": {Data: []byte(`{
      "id": 1, "result": "NovaBurst",
      "ingredients": [{ "skill": "Damage", "level": 2 }]
    }`)}}
	recipes, err := skills.RecipesFromFS(fsys, es.g.(*stubGame).registry)
	require.NoError(t, err)
	player.recipes = recipes

	player.sc.Discover(defDamage.ID)
	require.True(t, player.sc.RaiseSkillLevel(defDamage)) // level 2, but no cascade run here
	player.client.spend = &model.SpendSkillPoint{SkillID: defDamage.ID, Unspend: true}

	es.Update(0)

	assert.Equal(t, 1, player.sc.SkillLevel(defDamage.ID))
	assert.False(t, player.sc.HasDiscovered(defNova.ID), "unspend must not fire a recipe")
}

// The C8-walkthrough bug (PO 2026-07-20): swapping the ACTIVE slot's aura for
// another spellbook aura silently deactivated it (UnequipAura resets
// ActiveAuraSlot to -1, EquipAura never restored it) — no ring, no effect, no
// light; in a dark area the avatar vanished entirely. A swap into the active
// slot must keep that slot active (the new aura becomes the active one).
func TestEquipSystem_SwapIntoActiveSlotStaysActive(t *testing.T) {
	es, player := newSystem(defDamage, defHeal)
	player.sc.Discover(defDamage.ID)
	player.sc.Discover(defHeal.ID)
	player.sc.EquipAura(0, defDamage, 1)
	player.sc.SetActiveAura(0)

	player.client.msg = &model.EquipSkill{SkillID: defHeal.ID, Slot: 0}
	es.Update(0)

	require.NotNil(t, player.sc.AuraSlots[0])
	assert.Equal(t, defHeal.ID, player.sc.AuraSlots[0].Def.ID)
	assert.Equal(t, 0, player.sc.ActiveAuraSlot, "the swapped-in aura must stay active")
}

// Swapping a non-active slot must not steal or drop the active slot.
func TestEquipSystem_SwapIntoInactiveSlotKeepsActive(t *testing.T) {
	es, player := newSystem(defDamage, defHeal)
	player.sc.Discover(defDamage.ID)
	player.sc.Discover(defHeal.ID)
	player.sc.EquipAura(0, defDamage, 1)
	player.sc.SetActiveAura(0)

	player.client.msg = &model.EquipSkill{SkillID: defHeal.ID, Slot: 1}
	es.Update(0)

	assert.Equal(t, 0, player.sc.ActiveAuraSlot, "active slot must be untouched by other-slot equips")
	require.NotNil(t, player.sc.AuraSlots[1])
}

// --- Respec (round-7 item 8): free · blocked in combat · level 1 is the floor ---

func TestRespec_ResetsEverySkillToItsFloor(t *testing.T) {
	es, player := newSystem(defDamage, defSwift)
	player.sc.Discover(defDamage.ID)
	player.sc.Discover(defSwift.ID)
	for player.sc.RaiseSkillLevel(defDamage) {
	} // to the 5-cap
	player.sc.RaiseSkillLevel(defSwift) // to 2
	player.sc.EquipAura(0, defDamage, player.sc.SkillLevel(defDamage.ID))
	player.sc.EquipPassive(0, defSwift, player.sc.SkillLevel(defSwift.ID))

	player.client.respec = &model.Respec{}
	es.Update(0)

	assert.Equal(t, 1, player.sc.SkillLevel(defDamage.ID), "back to the discovery floor")
	assert.Equal(t, 1, player.sc.SkillLevel(defSwift.ID))
	assert.Equal(t, 1, player.sc.AuraSlots[0].Level, "equipped instances follow the spellbook")
	assert.Equal(t, 1, player.sc.PassiveSlots[0].Level)
	assert.InDelta(t, 0.05, player.sc.Derived.MovementSpeedBonus, 1e-6,
		"derived stats recomputed at the floor level, not left at the old one")
	assert.Zero(t, player.sc.SpentPoints(es.g.Skills()),
		"the refund is total — SpentPoints is derived, so nothing else to credit")
}

func TestRespec_RejectedInCombat(t *testing.T) {
	es, player := newSystem(defDamage)
	player.sc.Discover(defDamage.ID)
	player.sc.RaiseSkillLevel(defDamage)
	player.inCombat = true

	player.client.respec = &model.Respec{}
	es.Update(0)

	assert.Equal(t, 2, player.sc.SkillLevel(defDamage.ID),
		"respec follows the equip lock: no loadout surgery mid-fight")
}
