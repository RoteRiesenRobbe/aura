package quests

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCatalog_ServesTitlesAndProse(t *testing.T) {
	r := loadOne(t, wolfCull)

	payload, err := CatalogJSON(r)
	require.NoError(t, err)

	var entries []CatalogEntry
	require.NoError(t, json.Unmarshal(payload, &entries))
	require.Len(t, entries, 1)
	assert.Equal(t, "wolf-cull", entries[0].ID)
	assert.Equal(t, "The Wolf Cull", entries[0].Title)
	require.Len(t, entries[0].Stages, 2)
	assert.Equal(t, "cull", entries[0].Stages[0].ID)
	assert.Equal(t, "Kill wolves.", entries[0].Stages[0].Journal)
	assert.Equal(t, "Report back.", entries[0].Stages[1].Journal)
}

// D14: the catalog is a MINIMAL projection — the client renders titles and diary
// prose, so that is all that is served. Objectives, thresholds, the stage graph
// and the repeatable flag are the answer key; rewards do not even live here (they
// are in the conversants' interaction JSON, which has no endpoint at all).
//
// ⚑ Asserted on the KEY SET of the marshalled JSON rather than on the Go struct:
// the failure mode this guards against is somebody widening the projection by
// adding a field, which no assertion about known fields can see.
func TestCatalog_ProjectionLeaksNothing(t *testing.T) {
	r := loadOne(t, wolfCull)

	payload, err := CatalogJSON(r)
	require.NoError(t, err)

	var raw []map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(payload, &raw))
	require.Len(t, raw, 1)

	assert.ElementsMatch(t, []string{"id", "title", "stages"}, keysOf(raw[0]),
		"the quest projection serves exactly id + title + stages (D14)")

	var stages []map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(raw[0]["stages"], &stages))
	for _, s := range stages {
		assert.ElementsMatch(t, []string{"id", "journal"}, keysOf(s),
			"a stage projection serves exactly its id + its diary prose (D14)")
	}
}

func keysOf(m map[string]json.RawMessage) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	return keys
}

func TestCatalogHandler_ServesJSONWithCORS(t *testing.T) {
	r := loadOne(t, wolfCull)
	h, err := CatalogHandler(r)
	require.NoError(t, err)

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/quests", nil))

	assert.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, "application/json", rec.Header().Get("Content-Type"))
	assert.Equal(t, "*", rec.Header().Get("Access-Control-Allow-Origin"))
	assert.Contains(t, rec.Body.String(), "The Wolf Cull")
}

// An empty registry is the shipped state until C4 authors content, and the
// client must be able to tell "no quests" from "the fetch failed" (the journal's
// degrade state). An empty ARRAY is what says the former.
func TestCatalog_EmptyRegistryServesEmptyArray(t *testing.T) {
	r, err := NewRegistry()
	require.NoError(t, err)

	payload, err := CatalogJSON(r)
	require.NoError(t, err)
	assert.Equal(t, "[]", string(payload))
}
