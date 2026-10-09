package quests

import (
	"encoding/json"
	"net/http"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/lang"
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
//
// ⚑ plan-localization.md C2 (L13) WIDENS this on purpose: the tracker
// templates of every stage are served too (Trackers), so the client can word
// each objective line in its own language. That is the D5 leak the PO accepted
// 2026-08-23 with the fact in view ("datamining is in the spirit of the
// community discovers and shares"); do not restore the old projection.
type CatalogEntry struct {
	ID     string         `json:"id"`
	Title  string         `json:"title"`
	Stages []CatalogStage `json:"stages"`
	// Trackers maps each authored tracker's key (lang.QuestStageTracker /
	// lang.QuestObjectiveTracker) to its ICU template in the served locale,
	// "{n, number}/{m, number} Wolves slain" (C2). The wire's objective list
	// names a template by this key.
	Trackers map[string]string `json:"trackers,omitempty"`
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
func CatalogJSON(r Registry) ([]byte, error) { return CatalogJSONIn(r, lang.Identity) }

// CatalogJSONIn is the catalog in one locale (plan-localization.md C1): every
// text field resolves through tr by its stable key (D20), English as fallback.
func CatalogJSONIn(r Registry, tr lang.Tr) ([]byte, error) {
	defs := r.All()

	entries := make([]CatalogEntry, 0, len(defs))
	for _, q := range defs {
		stages := make([]CatalogStage, 0, len(q.Stages))
		for _, s := range q.Stages {
			journal := s.Journal
			if journal != "" {
				journal = tr(lang.QuestJournal(q.ID, s.ID), journal)
			}
			stages = append(stages, CatalogStage{ID: s.ID, Journal: journal})
		}
		entries = append(entries, CatalogEntry{ID: q.ID, Title: tr(lang.QuestTitle(q.ID), q.Title), Stages: stages,
			Trackers: trackersOf(q, tr)})
	}
	return json.Marshal(entries)
}

// trackersOf is every authored tracker of q as an ICU template, the counts
// written {n, number} (D16), each resolved through tr by its key (D20).
func trackersOf(q *QuestDefinition, tr lang.Tr) map[string]string {
	out := map[string]string{}
	for _, s := range q.Stages {
		if s.Tracker != "" {
			key := lang.QuestStageTracker(q.ID, s.ID)
			out[key] = tr(key, lang.NumberPlaceholders(s.Tracker, "n", "m"))
		}
		for i := range s.Objectives {
			o := &s.Objectives[i]
			if o.Tracker != "" {
				key := lang.QuestObjectiveTracker(q.ID, s.ID, o.Kind.String(), ObjectiveTargetKey(o))
				out[key] = tr(key, lang.NumberPlaceholders(o.Tracker, "n", "m"))
			}
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

// CatalogHandler serves the catalog on GET with a wildcard CORS origin: in dev
// the client runs on :2001 against aurad on :2000, and the catalog is public
// read-only content. Mirrors mobs.CatalogHandler.
func CatalogHandler(r Registry, b *lang.Bundle) (http.Handler, error) {
	return lang.Handler(b, func(tr lang.Tr) ([]byte, error) { return CatalogJSONIn(r, tr) })
}
