package mobs

import (
	"encoding/json"
	"net/http"
	"sort"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

// The mob catalog (feedback pass C item 2) serves the per-species metadata the
// client needs for nameplates — display name, combat level, tier — as JSON over
// HTTP, the same shape as the skill catalog (skills.CatalogHandler). The
// alternative was appending name+level to every Mob in the per-tick snapshot;
// this data is per SPECIES and never changes after boot, so sending it 30×/s
// per mob would be pure waste. The registry is immutable after boot, so the
// payload is marshaled exactly once.
//
// Deliberately a MINIMAL projection, not the whole MobDefinition: drops,
// resistances, skill loadouts and HP would all leak through a public endpoint
// and hand players an out-of-game answer key (zero-hint policy — the
// spellbook's unlock sources are meant to be discovered). Only what the
// nameplate renders is served.
type CatalogEntry struct {
	ID          MobID  `json:"id"`
	Name        string `json:"name"`
	DisplayName string `json:"displayName"`
	// CurveLevel is the authored combat level (cL) — the client tints the
	// nameplate by its distance from the player's own level.
	CurveLevel int `json:"curveLevel"`
	// Tier as its wire rank (0 normal / 1 elite / 2 boss), matching Mob.tier.
	Tier TierRank `json:"tier"`
	// CombatTarget marks the species as something a player fights, which is
	// what earns it a nameplate. Plenty of MobDefinitions are not mobs in the
	// player-facing sense — campfires, braziers, companions and summoned
	// totems are fixtures, brambles/rockfalls/spike barricades are obstacles,
	// poison pools are hazards — and labelling them "Campfire 1" would be
	// noise on every screen.
	//
	// Derived rather than authored, from two facts the content already
	// states: the species grants XP (killing it is a reward, so it is a
	// target) and it is not friendly to players (the human army grants no XP
	// today, but that was a rescope, not a law — the flag keeps a future
	// XP-granting ally from sprouting a hostile nameplate).
	CombatTarget bool `json:"combatTarget"`
}

// CatalogJSON marshals every loaded mob definition sorted by ID. Legacy
// (proving-grounds) species are included — harmless, since the client only
// looks up ids it actually receives in a snapshot.
func CatalogJSON(r Registry) ([]byte, error) {
	defs := r.Mobs()
	sort.Slice(defs, func(i, j int) bool { return defs[i].ID < defs[j].ID })

	entries := make([]CatalogEntry, 0, len(defs))
	for _, d := range defs {
		entries = append(entries, CatalogEntry{
			ID:           d.ID,
			Name:         d.Name,
			DisplayName:  skills.DeriveDisplayName(d.Name),
			CurveLevel:   d.CurveLevel,
			Tier:         d.Rank(),
			// Re-derived from xpFactor when the formula replaced the absolute
			// experience value (plan-xp-formula.md L1): "pays kill XP at all"
			// is still the test for "is prey", it is just spelled differently.
			CombatTarget: d.Factors.XPFactor > 0 && !d.FriendlyToPlayers,
		})
	}
	return json.Marshal(entries)
}

// CatalogHandler serves the catalog on GET with a wildcard CORS origin: in dev
// the client runs on :2001 against aurad on :2000, and the catalog is public
// read-only content. Mirrors skills.CatalogHandler.
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
