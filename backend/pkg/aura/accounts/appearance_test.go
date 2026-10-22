package accounts_test

import (
	"context"
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
		// One locked item per stored scope (C5). Their conditions need no
		// resolving, so no world is passed.
		"crown.json": {Data: []byte(`{"id": "crown", "slot": "portrait", "scope": "account", "name": "x",
			"conditions": [{"kind": "minLevel", "value": 3}]}`)},
		"ring-claws.json": {Data: []byte(`{"id": "ring-claws", "slot": "ring", "family": "leatherClaws", "scope": "bloodline",
			"name": "x", "conditions": [{"kind": "bloodline_ascensions", "value": 1}]}`)},
	}, nil)
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

// The picker only offers starters and owned items, so anything else is a
// malformed request.
func TestCreateCharacterRefusesALookItDoesNotOffer(t *testing.T) {
	h := newHarness(t)
	for _, look := range []map[string]any{
		{"portrait": "nobody"},
		{"ring": "nobody"},
		{"portrait": "ring-plain"},
		{"ring": "green-hood"},
		{"portrait": "crown"},
		{"ring": "ring-claws"},
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

// grant writes one appearance_unlocks row the way a save would.
func grant(t *testing.T, h *harness, accountID int64, scope string, slot any, item string) {
	t.Helper()
	_, err := h.db.Pool.Exec(context.Background(),
		`INSERT INTO game.appearance_unlocks (account_id, scope, slot_index, item_key) VALUES ($1, $2, $3, $4)`,
		accountID, scope, slot, item)
	require.NoError(t, err)
}

func accountOf(t *testing.T, h *harness, got response) int64 {
	t.Helper()
	return int64(scalarInt(t, h, `SELECT account_id FROM game.characters WHERE id = $1`, h.characterID(got)))
}

// plan-appearance.md C5: creation offers starters plus what the account and
// the chosen slot's bloodline own (D9), checked by CheckOwnedLook.
func TestCreateCharacterWearsAnOwnedLook(t *testing.T) {
	h := newHarness(t)
	first := h.do(http.MethodPost, "/api/characters", map[string]any{"name": "Founder", "slotIndex": 0})
	require.Equal(t, http.StatusCreated, first.code, "%v", first.body)
	h.secret = first.str("anonymousSecret")
	accountID := accountOf(t, h, first)
	grant(t, h, accountID, "account", nil, "crown")
	grant(t, h, accountID, "bloodline", 1, "ring-claws")

	wrongSlot := h.do(http.MethodPost, "/api/characters",
		map[string]any{"name": "Stray", "slotIndex": 2, "portrait": "crown", "ring": "ring-claws"})
	assert.Equal(t, http.StatusBadRequest, wrongSlot.code, "slot 2's bloodline owns no claws")

	got := h.do(http.MethodPost, "/api/characters",
		map[string]any{"name": "Heiress", "slotIndex": 1, "portrait": "crown", "ring": "ring-claws"})
	require.Equal(t, http.StatusCreated, got.code, "%v", got.body)
	character := got.body["character"].(map[string]any)
	assert.Equal(t, "crown", character["avatar"])
	assert.Equal(t, "ring-claws", character["ring"])
}

// Character select carries the owned pool before a character exists (D9) and
// each slot's predecessor look for the preselect (D12).
func TestListCharactersCarriesTheOwnedLooks(t *testing.T) {
	h := newHarness(t)
	first := h.do(http.MethodPost, "/api/characters",
		map[string]any{"name": "Elder", "slotIndex": 1, "portrait": "green-hood", "ring": "ring-leather"})
	require.Equal(t, http.StatusCreated, first.code, "%v", first.body)
	h.secret = first.str("anonymousSecret")
	accountID := accountOf(t, h, first)
	grant(t, h, accountID, "account", nil, "crown")
	grant(t, h, accountID, "bloodline", 1, "ring-claws")
	_, err := h.db.AscendCharacter(context.Background(), accountID, h.characterID(first), "", nil)
	require.NoError(t, err)

	listed := h.do(http.MethodGet, "/api/characters", nil)
	require.Equal(t, http.StatusOK, listed.code, "%v", listed.body)
	assert.Equal(t, []any{"crown"}, listed.body["appearanceOwned"])
	slots := listed.body["slots"].([]any)
	slot1 := slots[1].(map[string]any)
	assert.Equal(t, []any{"ring-claws"}, slot1["appearanceOwned"])
	assert.Equal(t, "green-hood", slot1["predecessorPortrait"])
	assert.Equal(t, "ring-leather", slot1["predecessorRing"])
	slot0 := slots[0].(map[string]any)
	assert.Equal(t, []any{}, slot0["appearanceOwned"], "never null")
	assert.NotContains(t, slot0, "predecessorPortrait", "no predecessor, no look")
}

// /select puts the character's owned set on the ticket (§4.4), like the
// bloodline: account ∪ this slot's bloodline ∪ this character.
func TestSelectCarriesTheOwnedSet(t *testing.T) {
	h := newHarness(t)
	got := h.do(http.MethodPost, "/api/characters", map[string]any{"name": "Owner", "slotIndex": 1})
	require.Equal(t, http.StatusCreated, got.code, "%v", got.body)
	h.secret = got.str("anonymousSecret")
	accountID := accountOf(t, h, got)
	grant(t, h, accountID, "account", nil, "crown")
	grant(t, h, accountID, "bloodline", 1, "ring-claws")
	grant(t, h, accountID, "bloodline", 2, "elsewhere")

	selected := h.do(http.MethodPost, fmt.Sprintf("/api/characters/%d/select", h.characterID(got)), nil)
	require.Equal(t, http.StatusOK, selected.code, "%v", selected.body)
	ticket, err := h.tickets.Redeem(selected.str("ticket"))
	require.NoError(t, err)
	assert.Equal(t, []string{"crown", "ring-claws"}, ticket.AppearanceOwned)
}
