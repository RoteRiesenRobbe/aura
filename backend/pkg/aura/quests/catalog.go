package quests

import (
	"encoding/json"
	"net/http"
)

// The quest catalog (plan-quests.md chunk C3, D14) serves what the journal
// panel renders — a quest's title and the diary prose of each stage — as JSON
// over HTTP, the same contract as the skill and mob catalogs. The wire carries
// only ids (quest id + the walked stage path, GameState.quest_progress), so this
// is where the words come from; the registry is immutable after boot, so the
// payload is marshaled exactly once.
//
// ⚑ Deliberately a MINIMAL projection, the /mobs philosophy rather than the
// /skills one: objectives, thresholds, the stage graph and the repeatable flag
// are the answer key to content the player is meant to discover, and rewards do
// not live here at all (they are authored on the conversants, which have no
// endpoint). Accepted residual leak: the diary prose of stages this character
// has not reached is curl-readable — with no accounts there is no per-player
// gating to do it any better.
type CatalogEntry struct {
	ID     string         `json:"id"`
	Title  string         `json:"title"`
	Stages []CatalogStage `json:"stages"`
}

// CatalogStage is one stage's identity and its diary text. The id is what the
// client matches against the walked path on the wire; the journal is the only
// prose a quest has.
type CatalogStage struct {
	ID      string `json:"id"`
	Journal string `json:"journal"`
}

// CatalogJSON marshals every loaded quest, sorted by id (Registry.All already
// sorts). An empty registry marshals to `[]`, which is what lets the client tell
// "this world has no quests" from "the fetch failed".
func CatalogJSON(r Registry) ([]byte, error) {
	defs := r.All()

	entries := make([]CatalogEntry, 0, len(defs))
	for _, q := range defs {
		stages := make([]CatalogStage, 0, len(q.Stages))
		for _, s := range q.Stages {
			stages = append(stages, CatalogStage{ID: s.ID, Journal: s.Journal})
		}
		entries = append(entries, CatalogEntry{ID: q.ID, Title: q.Title, Stages: stages})
	}
	return json.Marshal(entries)
}

// CatalogHandler serves the catalog on GET with a wildcard CORS origin: in dev
// the client runs on :2001 against aurad on :2000, and the catalog is public
// read-only content. Mirrors mobs.CatalogHandler.
func CatalogHandler(r Registry) (http.Handler, error) {
	payload, err := CatalogJSON(r)
	if err != nil {
		return nil, err
	}
	return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Write(payload)
	}), nil
}
