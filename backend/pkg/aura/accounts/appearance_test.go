package accounts_test

import (
	"fmt"
	"net/http"
	"testing"
	"testing/fstest"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/appearance"
)

// testLooks is a small starter catalog: the two defaults plus one more per
// slot. The accounts server checks a creation pick against it.
func testLooks(t *testing.T) appearance.Catalog {
	t.Helper()
	item := func(id, slot, family string) *fstest.MapFile {
		fam := ""
		if family != "" {
			fam = fmt.Sprintf(`, "family": %q`, family)
		}
		return &fstest.MapFile{Data: []byte(fmt.Sprintf(`{"id": %q, "slot": %q%s, "starter": true, "name": "x"}`, id, slot, fam))}
	}
	c, err := appearance.Load(fstest.MapFS{
		"default.json":      item("default", "portrait", ""),
		"green-hood.json":   item("green-hood", "portrait", ""),
		"ring-plain.json":   item("ring-plain", "ring", "grey"),
		"ring-leather.json": item("ring-leather", "ring", "leather"),
	})
	require.NoError(t, err)
	return c
}

// plan-appearance.md C3: creation takes the chosen portrait and ring.
func TestCreateCharacterWearsTheChosenLook(t *testing.T) {
	h := newHarness(t)
	got := h.do(http.MethodPost, "/api/characters",
		map[string]any{"name": "Barney", "portrait": "green-hood", "ring": "ring-leather"})
	require.Equal(t, http.StatusCreated, got.code, "%v", got.body)
	h.secret = got.str("anonymousSecret")
	character := got.body["character"].(map[string]any)
	assert.Equal(t, "green-hood", character["avatar"])
	assert.Equal(t, "ring-leather", character["ring"])

	listed := h.do(http.MethodGet, "/api/characters", nil)
	require.Equal(t, http.StatusOK, listed.code)
	card := listed.body["characters"].([]any)[0].(map[string]any)
	assert.Equal(t, "green-hood", card["avatar"])
	assert.Equal(t, "ring-leather", card["ring"], "the select card draws the ring too")

	selected := h.do(http.MethodPost, fmt.Sprintf("/api/characters/%d/select", h.characterID(got)), nil)
	require.Equal(t, http.StatusOK, selected.code, "%v", selected.body)
	ticket, err := h.tickets.Redeem(selected.str("ticket"))
	require.NoError(t, err)
	assert.Equal(t, "green-hood", ticket.Avatar)
	assert.Equal(t, "ring-leather", ticket.Ring, "the join wears the look without a query")
}

// A client that sends no look (an older client, a harness) gets the defaults.
func TestCreateCharacterWithoutALookWearsTheDefaults(t *testing.T) {
	h := newHarness(t)
	got := h.createCharacter("Wilma")
	require.Equal(t, http.StatusCreated, got.code, "%v", got.body)
	character := got.body["character"].(map[string]any)
	assert.Equal(t, appearance.DefaultPortrait, character["avatar"])
	assert.Equal(t, appearance.DefaultRing, character["ring"])
}

// The picker only offers starters, so anything else is a malformed request.
func TestCreateCharacterRefusesALookItDoesNotOffer(t *testing.T) {
	h := newHarness(t)
	for _, look := range []map[string]any{
		{"portrait": "nobody"},
		{"ring": "nobody"},
		{"portrait": "ring-plain"},
		{"ring": "green-hood"},
	} {
		body := map[string]any{"name": "Fred"}
		for k, v := range look {
			body[k] = v
		}
		got := h.do(http.MethodPost, "/api/characters", body)
		assert.Equal(t, http.StatusBadRequest, got.code, "%v", look)
		assert.Equal(t, "bad_request", got.errCode(), "%v", look)
	}
	assert.Equal(t, 0, scalarInt(t, h, `SELECT count(*) FROM game.characters`))
}
