package appearance

import (
	"encoding/json"
	"fmt"
	"testing"
	"testing/fstest"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/lang"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func catalogFS(files map[string]string) fstest.MapFS {
	fsys := fstest.MapFS{}
	for name, content := range files {
		fsys[name] = &fstest.MapFile{Data: []byte(content)}
	}
	return fsys
}

// starterFiles is the smallest valid catalog: the two defaults plus one more
// item per slot, so the wire order is visible.
func starterFiles() map[string]string {
	return map[string]string{
		"default.json":      `{"_comment": "note", "id": "default", "slot": "portrait", "starter": true, "name": "Wanderer"}`,
		"archer.json":       `{"id": "archer", "slot": "portrait", "starter": true, "name": "Archer"}`,
		"ring-plain.json":   `{"id": "ring-plain", "slot": "ring", "family": "grey", "starter": true, "name": "Plain ring"}`,
		"ring-leather.json": `{"id": "ring-leather", "slot": "ring", "family": "leather", "starter": true, "name": "Leather ring"}`,
	}
}

func TestLoad_StarterCatalog(t *testing.T) {
	c, err := Load(catalogFS(starterFiles()), testWorld{})
	require.NoError(t, err)

	ids := func(items []Item) []string {
		out := []string{}
		for _, it := range items {
			out = append(out, it.ID)
		}
		return out
	}
	assert.Equal(t, []string{"archer", "default"}, ids(c.Portraits()), "each slot is sorted by id")
	assert.Equal(t, []string{"ring-leather", "ring-plain"}, ids(c.Rings()))

	ring, ok := c.Item("ring-leather")
	require.True(t, ok)
	assert.Equal(t, SlotRing, ring.Slot)
	assert.Equal(t, "leather", ring.Family)
	assert.Equal(t, "Leather ring", ring.Name)
}

// The wire value is 1 + the item's position in its slot's sorted list; 0 is
// "the slot's default", what an unknown id resolves to.
func TestWire_IsOnePlusThePositionInTheSlot(t *testing.T) {
	c, err := Load(catalogFS(starterFiles()), testWorld{})
	require.NoError(t, err)

	assert.Equal(t, uint16(1), c.Wire(SlotPortrait, "archer"))
	assert.Equal(t, uint16(2), c.Wire(SlotPortrait, "default"))
	assert.Equal(t, uint16(1), c.Wire(SlotRing, "ring-leather"))
	assert.Equal(t, uint16(2), c.Wire(SlotRing, "ring-plain"))
	assert.Equal(t, uint16(0), c.Wire(SlotPortrait, "nobody"), "unknown id")
	assert.Equal(t, uint16(0), c.Wire(SlotPortrait, "ring-plain"), "an id of the other slot")
}

// ID is Wire's inverse: the save path stores ids, the player holds wire values
// (plan-appearance.md C4).
func TestID_IsWiresInverse(t *testing.T) {
	c, err := Load(catalogFS(starterFiles()), testWorld{})
	require.NoError(t, err)

	for _, slot := range []Slot{SlotPortrait, SlotRing} {
		items := c.Portraits()
		if slot == SlotRing {
			items = c.Rings()
		}
		for _, it := range items {
			assert.Equal(t, it.ID, c.ID(slot, c.Wire(slot, it.ID)))
		}
	}
	assert.Equal(t, "", c.ID(SlotPortrait, 0), "0 names no item")
	assert.Equal(t, "", c.ID(SlotRing, 3), "past the end")
}

// WearableLook is what SelectAppearance may put on (C4, C5): a starter, or an
// item the player owns, in both slots, as wire values.
func TestWearableLook(t *testing.T) {
	c, err := Load(catalogFS(gatedFiles()), testWorld{})
	require.NoError(t, err)
	archer, leather := c.Wire(SlotPortrait, "archer"), c.Wire(SlotRing, "ring-leather")
	crown, forest := c.Wire(SlotPortrait, "crown"), c.Wire(SlotRing, "ring-forest")

	assert.True(t, c.WearableLook(archer, leather, nil))
	assert.False(t, c.WearableLook(0, leather, nil), "0 is no item")
	assert.False(t, c.WearableLook(archer, 0, nil), "0 is no item")
	assert.False(t, c.WearableLook(9, leather, nil), "past the end")
	assert.False(t, c.WearableLook(archer, 9, nil), "past the end")

	assert.False(t, c.WearableLook(crown, leather, nil), "a locked portrait")
	assert.False(t, c.WearableLook(archer, forest, nil), "a locked ring")
	owned := []uint16{c.Flat("crown")}
	assert.True(t, c.WearableLook(crown, leather, owned), "an owned portrait")
	assert.False(t, c.WearableLook(archer, forest, owned), "owning one item owns no other")
	assert.True(t, c.WearableLook(crown, forest, []uint16{c.Flat("ring-forest"), c.Flat("crown")}))
}

// CheckOwnedLook is creation's check (accounts, by id): a starter or an
// owned item in both slots.
func TestCheckOwnedLook(t *testing.T) {
	c, err := Load(catalogFS(gatedFiles()), testWorld{})
	require.NoError(t, err)

	assert.NoError(t, c.CheckOwnedLook("archer", "ring-leather", nil))
	assert.Error(t, c.CheckOwnedLook("nobody", "ring-plain", nil), "unknown portrait")
	assert.Error(t, c.CheckOwnedLook("default", "nobody", nil), "unknown ring")
	assert.Error(t, c.CheckOwnedLook("ring-plain", "ring-plain", nil), "a ring is no portrait")
	assert.Error(t, c.CheckOwnedLook("default", "archer", nil), "a portrait is no ring")
	assert.Error(t, c.CheckOwnedLook("crown", "ring-plain", nil), "a locked portrait")
	assert.Error(t, c.CheckOwnedLook("default", "ring-forest", []string{"crown"}), "a locked ring")
	assert.NoError(t, c.CheckOwnedLook("crown", "ring-forest", []string{"ring-forest", "crown"}))
	assert.NoError(t, c.CheckOwnedLook("default", "ring-plain", []string{"ring-plain"}),
		"a starter listed as owned is still a starter")
}

func TestLoad_Refusals(t *testing.T) {
	cases := map[string]map[string]string{
		"id not a slug":           {"Big.json": `{"id": "Big", "slot": "portrait", "starter": true, "name": "x"}`},
		"file not named after id": {"other.json": `{"id": "archer", "slot": "portrait", "starter": true, "name": "x"}`},
		"unknown slot":            {"hat.json": `{"id": "hat", "slot": "hat", "starter": true, "name": "x"}`},
		"ring without family":     {"r.json": `{"id": "r", "slot": "ring", "starter": true, "name": "x"}`},
		"portrait with family":    {"p.json": `{"id": "p", "slot": "portrait", "family": "grey", "starter": true, "name": "x"}`},
		"unknown field":           {"p.json": `{"id": "p", "slot": "portrait", "starter": true, "name": "x", "hat": 1}`},
		"no name":                 {"p.json": `{"id": "p", "slot": "portrait", "starter": true}`},
	}
	for name, extra := range cases {
		t.Run(name, func(t *testing.T) {
			files := starterFiles()
			for k, v := range extra {
				files[k] = v
			}
			_, err := Load(catalogFS(files), testWorld{})
			assert.Error(t, err)
		})
	}
}

// Every existing character row says avatar = 'default' and, after 000004,
// ring = DefaultRing: the catalog must hold both as starters or those rows
// would name nothing.
func TestLoad_RequiresTheDefaults(t *testing.T) {
	for _, missing := range []string{"default.json", "ring-plain.json"} {
		files := starterFiles()
		delete(files, missing)
		_, err := Load(catalogFS(files), testWorld{})
		assert.Error(t, err, missing)
	}
}

func TestCatalogJSON_ServesEachSlotInWireOrder(t *testing.T) {
	c, err := Load(catalogFS(starterFiles()), testWorld{})
	require.NoError(t, err)
	tr := func(key, english string) string {
		if key == lang.AppearanceName("archer") {
			return "Bogenschützin"
		}
		return english
	}
	raw, err := CatalogJSONIn(c, tr)
	require.NoError(t, err)

	var got struct {
		Portraits []map[string]any `json:"portraits"`
		Rings     []map[string]any `json:"rings"`
	}
	require.NoError(t, json.Unmarshal(raw, &got))
	require.Len(t, got.Portraits, 2)
	require.Len(t, got.Rings, 2)
	assert.Equal(t, map[string]any{"id": "archer", "name": "Bogenschützin", "starter": true}, got.Portraits[0])
	assert.Equal(t, map[string]any{"id": "ring-leather", "name": "Leather ring", "family": "leather", "starter": true}, got.Rings[0])
	assert.Equal(t, map[string]any{"id": "default", "name": "Wanderer", "starter": true, "default": true}, got.Portraits[1],
		"the client draws wire value 0 as the item marked default")
	assert.Equal(t, true, got.Rings[1]["default"])
}

// --- unlocks (plan-appearance.md C5, D7, D15) ---

// testWorld resolves Thorns, the Wolf and the quest "welcome".
type testWorld struct{}

func (testWorld) GetByName(name string) (*skills.SkillDefinition, error) {
	if name == "Thorns" {
		return &skills.SkillDefinition{ID: 7, Name: "Thorns", MaxLevel: 30}, nil
	}
	return nil, fmt.Errorf("no skill %q", name)
}

func (testWorld) ResolveSpecies(name string) (mobs.MobID, error) {
	if name == "Wolf" {
		return 12, nil
	}
	return 0, fmt.Errorf("no mob %q", name)
}

func (testWorld) CheckQuestStage(quest, stage string) error {
	if quest != "welcome" {
		return fmt.Errorf("no quest %q", quest)
	}
	return nil
}

// gatedFiles adds one locked item per slot to the starter catalog.
func gatedFiles() map[string]string {
	files := starterFiles()
	files["crown.json"] = `{"id": "crown", "slot": "portrait", "scope": "account", "name": "Crown",
		"conditions": [{"kind": "quest_at_stage", "quest": "welcome", "stage": "completed"}]}`
	files["ring-forest.json"] = `{"id": "ring-forest", "slot": "ring", "family": "forest", "scope": "character", "name": "Forest ring",
		"conditions": [{"kind": "minLevel", "value": 3}, {"kind": "skill_level", "skill": "Thorns", "value": 2}],
		"conditionsMode": "any"}`
	return files
}

func TestLoad_GatedItems(t *testing.T) {
	c, err := Load(catalogFS(gatedFiles()), testWorld{})
	require.NoError(t, err)

	crown, ok := c.Item("crown")
	require.True(t, ok)
	assert.False(t, crown.Starter)
	assert.Equal(t, ScopeAccount, crown.Scope)
	require.Len(t, crown.Gate.Conditions, 1)
	assert.Equal(t, mobs.ConditionQuestAtStage, crown.Gate.Conditions[0].Kind)
	assert.Equal(t, mobs.ConditionModeAll, crown.Gate.Mode, "absent is all")

	forest, _ := c.Item("ring-forest")
	assert.Equal(t, ScopeCharacter, forest.Scope)
	assert.Equal(t, mobs.ConditionModeAny, forest.Gate.Mode)
	require.Len(t, forest.Gate.Conditions, 2)
	assert.Equal(t, skills.SkillID(7), forest.Gate.Conditions[1].SkillID, "skill_level resolves at load")
}

func TestLoad_GatedRefusals(t *testing.T) {
	cases := map[string]string{
		"a locked item without a scope": `{"id": "p", "slot": "portrait", "name": "x",
			"conditions": [{"kind": "minLevel", "value": 3}]}`,
		"a locked item without conditions": `{"id": "p", "slot": "portrait", "scope": "account", "name": "x"}`,
		"an unknown scope": `{"id": "p", "slot": "portrait", "scope": "guild", "name": "x",
			"conditions": [{"kind": "minLevel", "value": 3}]}`,
		"a starter with conditions": `{"id": "p", "slot": "portrait", "starter": true, "name": "x",
			"conditions": [{"kind": "minLevel", "value": 3}]}`,
		"a starter with a scope": `{"id": "p", "slot": "portrait", "starter": true, "scope": "account", "name": "x"}`,
		"an unknown condition kind": `{"id": "p", "slot": "portrait", "scope": "account", "name": "x",
			"conditions": [{"kind": "hats", "value": 3}]}`,
		"an unknown skill": `{"id": "p", "slot": "portrait", "scope": "account", "name": "x",
			"conditions": [{"kind": "skill_level", "skill": "Thornz", "value": 3}]}`,
		// D15 names four kinds; a kill count moves no revision the evaluator
		// watches, so it would wait for an unrelated level-up.
		"a kill count": `{"id": "p", "slot": "portrait", "scope": "account", "name": "x",
			"conditions": [{"kind": "kills_this_life", "species": "Wolf", "value": 3}]}`,
		"an unknown quest": `{"id": "p", "slot": "portrait", "scope": "account", "name": "x",
			"conditions": [{"kind": "quest_at_stage", "quest": "nope", "stage": "completed"}]}`,
		"a mode on one condition list it cannot combine": `{"id": "p", "slot": "portrait", "scope": "account", "name": "x",
			"conditionsMode": "sometimes", "conditions": [{"kind": "minLevel", "value": 3}]}`,
	}
	for name, file := range cases {
		t.Run(name, func(t *testing.T) {
			files := starterFiles()
			files["p.json"] = file
			_, err := Load(catalogFS(files), testWorld{})
			assert.Error(t, err)
		})
	}
}

// The flat index is the owned set's wire form: every portrait in wire order,
// then every ring.
func TestFlat_PortraitsThenRings(t *testing.T) {
	c, err := Load(catalogFS(gatedFiles()), testWorld{})
	require.NoError(t, err)

	// portraits: archer, crown, default; rings: ring-forest, ring-leather, ring-plain
	assert.Equal(t, uint16(1), c.Flat("crown"))
	assert.Equal(t, uint16(3), c.Flat("ring-forest"))
	for i, id := range []string{"archer", "crown", "default", "ring-forest", "ring-leather", "ring-plain"} {
		assert.Equal(t, uint16(i), c.Flat(id), id)
		it, ok := c.AtFlat(uint16(i))
		require.True(t, ok)
		assert.Equal(t, id, it.ID)
	}
	_, ok := c.AtFlat(6)
	assert.False(t, ok, "past the end")
}

// Gated is what the evaluator walks: every item with conditions, in flat order.
func TestGated_ListsTheLockedItems(t *testing.T) {
	c, err := Load(catalogFS(gatedFiles()), testWorld{})
	require.NoError(t, err)
	ids := []string{}
	for _, it := range c.Gated() {
		ids = append(ids, it.ID)
	}
	assert.Equal(t, []string{"crown", "ring-forest"}, ids)
}

// /appearance serves a locked item's scope and its conditions as lock data,
// so the picker can word the hint (D8, D25) without the server composing text.
func TestCatalogJSON_ServesTheLocks(t *testing.T) {
	c, err := Load(catalogFS(gatedFiles()), testWorld{})
	require.NoError(t, err)
	raw, err := CatalogJSONIn(c, func(_, english string) string { return english })
	require.NoError(t, err)

	var got struct {
		Rings []struct {
			ID             string           `json:"id"`
			Starter        bool             `json:"starter"`
			Scope          string           `json:"scope"`
			ConditionsMode string           `json:"conditionsMode"`
			Locks          []map[string]any `json:"locks"`
		} `json:"rings"`
	}
	require.NoError(t, json.Unmarshal(raw, &got))
	forest := got.Rings[0]
	assert.Equal(t, "ring-forest", forest.ID)
	assert.False(t, forest.Starter)
	assert.Equal(t, "character", forest.Scope)
	assert.Equal(t, "any", forest.ConditionsMode)
	assert.Equal(t, []map[string]any{
		{"kind": float64(mobs.LockMinLevel), "value": float64(3)},
		{"kind": float64(mobs.LockSkillLevel), "value": float64(2), "skill": float64(7)},
	}, forest.Locks)
}

// --- stone gifts (plan-appearance.md C5b, D21c) ---

// stoneFiles adds one look only a stone gives to the gated catalog.
func stoneFiles() map[string]string {
	files := gatedFiles()
	files["elder.json"] = `{"id": "elder", "slot": "portrait", "scope": "bloodline", "grantedBy": "stone", "name": "Elder"}`
	return files
}

func TestLoad_StoneGift(t *testing.T) {
	c, err := Load(catalogFS(stoneFiles()), testWorld{})
	require.NoError(t, err)
	elder, ok := c.Item("elder")
	require.True(t, ok)
	assert.True(t, elder.StoneGift(), "granted by a stone only")
	assert.Equal(t, ScopeBloodline, elder.Scope)
	assert.Empty(t, elder.Gate.Conditions)
	crown, _ := c.Item("crown")
	assert.False(t, crown.StoneGift(), "a gated item is earned by its conditions")

	ids := []string{}
	for _, it := range c.Gated() {
		ids = append(ids, it.ID)
	}
	assert.Equal(t, []string{"crown", "elder", "ring-forest"}, ids, "a stone gift is locked until a stone grants it")
}

func TestLoad_StoneGiftRefusals(t *testing.T) {
	cases := map[string]string{
		"an unknown source": `{"id": "p", "slot": "portrait", "scope": "bloodline", "grantedBy": "quest", "name": "x"}`,
		"a stone gift with conditions": `{"id": "p", "slot": "portrait", "scope": "bloodline", "grantedBy": "stone", "name": "x",
			"conditions": [{"kind": "minLevel", "value": 3}]}`,
		"a stone gift with a mode": `{"id": "p", "slot": "portrait", "scope": "bloodline", "grantedBy": "stone", "name": "x",
			"conditionsMode": "any"}`,
		"a starter stone gift": `{"id": "p", "slot": "portrait", "starter": true, "grantedBy": "stone", "name": "x"}`,
		// Granted during the sacrifice, a character item would land on the life
		// that is ending (D21).
		"a character stone gift": `{"id": "p", "slot": "portrait", "scope": "character", "grantedBy": "stone", "name": "x"}`,
		"a stone gift without a scope": `{"id": "p", "slot": "portrait", "grantedBy": "stone", "name": "x"}`,
	}
	for name, file := range cases {
		t.Run(name, func(t *testing.T) {
			files := starterFiles()
			files["p.json"] = file
			_, err := Load(catalogFS(files), testWorld{})
			assert.Error(t, err)
		})
	}
}

type stoneSites []*mobs.MobDefinition

func (s stoneSites) Mobs() []*mobs.MobDefinition { return s }

func stoneOffering(name string, looks ...string) *mobs.MobDefinition {
	return &mobs.MobDefinition{Name: name, Interaction: &mobs.Interaction{Nodes: []mobs.InteractionNode{
		{ID: "catalog", Rows: mobs.RowSourceAscensionCatalog, BonusLooks: looks},
	}}}
}

// A stone's bonus names stone gifts: an unknown id or an item something else
// earns is a boot failure; a stone gift no stone names is a warning (the
// ascension catalog's P7: authoring an item and placing it are two edits).
func TestCrossValidateStones(t *testing.T) {
	c, err := Load(catalogFS(stoneFiles()), testWorld{})
	require.NoError(t, err)

	warnings, err := CrossValidateStones(stoneSites{stoneOffering("Stone", "elder"), {Name: "Wolf"}}, c)
	require.NoError(t, err)
	assert.Empty(t, warnings)

	warnings, err = CrossValidateStones(stoneSites{stoneOffering("Stone")}, c)
	require.NoError(t, err)
	require.Len(t, warnings, 1)
	assert.Contains(t, warnings[0], "elder")

	for _, bad := range []string{"nobody", "crown", "archer"} {
		_, err := CrossValidateStones(stoneSites{stoneOffering("Stone", bad)}, c)
		assert.Error(t, err, bad)
	}
}

// /appearance serves a stone gift's one lock: "a gift of an ascension stone".
func TestCatalogJSON_ServesTheStoneGiftLock(t *testing.T) {
	c, err := Load(catalogFS(stoneFiles()), testWorld{})
	require.NoError(t, err)
	raw, err := CatalogJSONIn(c, func(_, english string) string { return english })
	require.NoError(t, err)

	var got struct {
		Portraits []struct {
			ID    string           `json:"id"`
			Scope string           `json:"scope"`
			Locks []map[string]any `json:"locks"`
		} `json:"portraits"`
	}
	require.NoError(t, json.Unmarshal(raw, &got))
	elder := got.Portraits[3] // archer, crown, default, elder
	assert.Equal(t, "elder", elder.ID)
	assert.Equal(t, "bloodline", elder.Scope)
	assert.Equal(t, []map[string]any{{"kind": float64(mobs.LockStoneGift)}}, elder.Locks)
}
