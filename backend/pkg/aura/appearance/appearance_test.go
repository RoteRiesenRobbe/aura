package appearance

import (
	"encoding/json"
	"testing"
	"testing/fstest"

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
	c, err := Load(catalogFS(starterFiles()))
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
	c, err := Load(catalogFS(starterFiles()))
	require.NoError(t, err)

	assert.Equal(t, uint16(1), c.Wire(SlotPortrait, "archer"))
	assert.Equal(t, uint16(2), c.Wire(SlotPortrait, "default"))
	assert.Equal(t, uint16(1), c.Wire(SlotRing, "ring-leather"))
	assert.Equal(t, uint16(2), c.Wire(SlotRing, "ring-plain"))
	assert.Equal(t, uint16(0), c.Wire(SlotPortrait, "nobody"), "unknown id")
	assert.Equal(t, uint16(0), c.Wire(SlotPortrait, "ring-plain"), "an id of the other slot")
}

func TestCheckStarterLook(t *testing.T) {
	c, err := Load(catalogFS(starterFiles()))
	require.NoError(t, err)

	assert.NoError(t, c.CheckStarterLook("archer", "ring-leather"))
	assert.Error(t, c.CheckStarterLook("nobody", "ring-plain"), "unknown portrait")
	assert.Error(t, c.CheckStarterLook("default", "nobody"), "unknown ring")
	assert.Error(t, c.CheckStarterLook("ring-plain", "ring-plain"), "a ring is no portrait")
	assert.Error(t, c.CheckStarterLook("default", "archer"), "a portrait is no ring")
}

func TestLoad_Refusals(t *testing.T) {
	cases := map[string]map[string]string{
		"id not a slug":           {"Big.json": `{"id": "Big", "slot": "portrait", "starter": true, "name": "x"}`},
		"file not named after id": {"other.json": `{"id": "archer", "slot": "portrait", "starter": true, "name": "x"}`},
		"unknown slot":            {"hat.json": `{"id": "hat", "slot": "hat", "starter": true, "name": "x"}`},
		"ring without family":     {"r.json": `{"id": "r", "slot": "ring", "starter": true, "name": "x"}`},
		"portrait with family":    {"p.json": `{"id": "p", "slot": "portrait", "family": "grey", "starter": true, "name": "x"}`},
		"not a starter":           {"p.json": `{"id": "p", "slot": "portrait", "name": "x"}`},
		"unknown field":           {"p.json": `{"id": "p", "slot": "portrait", "starter": true, "name": "x", "conditions": []}`},
		"no name":                 {"p.json": `{"id": "p", "slot": "portrait", "starter": true}`},
	}
	for name, extra := range cases {
		t.Run(name, func(t *testing.T) {
			files := starterFiles()
			for k, v := range extra {
				files[k] = v
			}
			_, err := Load(catalogFS(files))
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
		_, err := Load(catalogFS(files))
		assert.Error(t, err, missing)
	}
}

func TestCatalogJSON_ServesEachSlotInWireOrder(t *testing.T) {
	c, err := Load(catalogFS(starterFiles()))
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
