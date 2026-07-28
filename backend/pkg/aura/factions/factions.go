// Package factions loads the faction registry (mob-depth chunk 6.6): named
// mob allegiances with an explicit per-faction hostility list. The list
// drives PROACTIVE aggro acquisition only — damage eligibility, threat
// retaliation and flee stay pure faction-inequality ("different faction =
// may harm"), so a passive faction still fights back when hit.
//
// The numeric Faction here mirrors model.Faction (aligned = 0, hostile = 1);
// the packages cannot share the type because model imports items/mobs which
// imports this registry — the boot seam converts, like world's EntityType.
package factions

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/fs"
	"sort"
	"strings"
)

// Faction is a faction's numeric ID, valid as a bit index into aggro masks.
type Faction uint8

// Reserved built-in factions, never declarable in content: Aligned is the
// player/summon faction (mirrors model.FactionAligned), Hostile the default
// for every mob definition without a faction key (model.FactionHostile).
// Both may be referenced in hostileTo lists.
const (
	Aligned Faction = 0
	Hostile Faction = 1
)

// firstContentID is the first ID handed to a declared faction.
const firstContentID Faction = 2

// MaxFactions bounds the ID space: aggro masks are uint64 bitmasks.
const MaxFactions = 64

// Bit is the faction's position in an aggro bitmask.
func Bit(f Faction) uint64 { return 1 << f }

// Definition is one resolved faction. AggroMask is the bitmask of faction IDs
// this faction proactively acquires in its aggro sensor; 0 = passive
// (retaliation-only). The built-in Hostile faction aggros exactly {Aligned} —
// the pre-factions behavior of every mob (attack players, ignore all mobs) —
// so declaring new factions never changes legacy mobs. FriendlyToPlayers
// (§9 lift 6, content pass C5) makes the faction harm-proof to the aligned
// side: player and player-summon damage skips its members entirely, while
// every other faction fights it through the normal hostility rules.
type Definition struct {
	Name              string
	ID                Faction
	AggroMask         uint64
	FriendlyToPlayers bool

	// Legacy marks proving-grounds-only factions (step-7 A.5): kept for the
	// legacy zone and tests, never used by live-world species.
	Legacy bool
}

// Registry resolves faction names to their definitions.
type Registry interface {
	GetByName(name string) (*Definition, error)
	All() []*Definition
}

type registry struct {
	factions map[string]*Definition
}

func (r *registry) GetByName(name string) (*Definition, error) {
	f, ok := r.factions[name]
	if !ok {
		return nil, fmt.Errorf("faction %q not found", name)
	}
	return f, nil
}

func (r *registry) All() []*Definition {
	all := make([]*Definition, 0, len(r.factions))
	for _, f := range r.factions {
		all = append(all, f)
	}
	sort.Slice(all, func(i, j int) bool { return all[i].ID < all[j].ID })
	return all
}

// factionDoc is the JSON shape of one api/factions/*.json file. HostileTo is
// a pointer so an absent list ([] = deliberately passive) fails by name —
// hostility is an explicit content decision, never a hidden default. The
// _comment key is the content convention for authoring notes (as in the mob
// JSONs) and deliberately tolerated under DisallowUnknownFields.
type factionDoc struct {
	Comment           string    `json:"_comment"`
	Name              string    `json:"name"`
	HostileTo         *[]string `json:"hostileTo"`
	FriendlyToPlayers bool      `json:"friendlyToPlayers"`
	Legacy            bool      `json:"legacy"` // absent → live content (step-7 A.5)
}

// RegistryFromFS walks fileSystem for *.json faction definitions. Curated
// content: every anomaly aborts at boot (mirrors the other registries) —
// malformed or unknown-key JSON, an empty/reserved/duplicate name, a missing
// hostileTo, an unknown or self hostileTo reference, or more factions than
// the aggro bitmask holds. IDs are assigned in sorted-name order so they are
// deterministic across boots.
func RegistryFromFS(fileSystem fs.FS) (Registry, error) {
	r := &registry{factions: map[string]*Definition{
		// AggroMask mirrors mob.Align() — the player side is hostile to
		// everything that is not it, which is the player's own ungated harm
		// rights. Inert (nothing resolves this entry: faction "aligned" is
		// rejected on mob definitions), but an implicit 0 here read as
		// "retaliation-only" and was half of why Align's mask looked wrong.
		"aligned": {Name: "aligned", ID: Aligned, AggroMask: ^Bit(Aligned)},
		"hostile": {Name: "hostile", ID: Hostile, AggroMask: Bit(Aligned)},
	}}

	docs := map[string]*factionDoc{}
	err := fs.WalkDir(fileSystem, ".", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return fmt.Errorf("cannot read %q: %w", path, err)
		}
		if d.IsDir() || !strings.HasSuffix(path, ".json") {
			return nil
		}

		data, err := fs.ReadFile(fileSystem, path)
		if err != nil {
			return fmt.Errorf("cannot read %q: %w", path, err)
		}
		doc, err := parseFactionDoc(data)
		if err != nil {
			return fmt.Errorf("faction %q: %w", path, err)
		}
		if _, ok := r.factions[doc.Name]; ok {
			return fmt.Errorf("faction %q: name %q is reserved or already declared", path, doc.Name)
		}
		if _, ok := docs[doc.Name]; ok {
			return fmt.Errorf("faction %q: name %q is reserved or already declared", path, doc.Name)
		}
		docs[doc.Name] = doc
		return nil
	})
	if err != nil {
		return nil, err
	}

	if len(docs) > MaxFactions-int(firstContentID) {
		return nil, fmt.Errorf("%d factions declared, at most %d are supported", len(docs), MaxFactions-int(firstContentID))
	}

	// Two passes: IDs first (sorted-name order → deterministic), so hostileTo
	// can reference any declared faction regardless of file order.
	names := make([]string, 0, len(docs))
	for name := range docs {
		names = append(names, name)
	}
	sort.Strings(names)
	for i, name := range names {
		r.factions[name] = &Definition{
			Name:              name,
			ID:                firstContentID + Faction(i),
			FriendlyToPlayers: docs[name].FriendlyToPlayers,
			Legacy:            docs[name].Legacy,
		}
	}
	for _, name := range names {
		def := r.factions[name]
		for _, ref := range *docs[name].HostileTo {
			target, ok := r.factions[ref]
			if !ok {
				return nil, fmt.Errorf("faction %q: hostileTo references unknown faction %q", name, ref)
			}
			if target.ID == def.ID {
				return nil, fmt.Errorf("faction %q: hostileTo must not reference itself", name)
			}
			def.AggroMask |= Bit(target.ID)
		}
		if def.FriendlyToPlayers && def.AggroMask&Bit(Aligned) != 0 {
			return nil, fmt.Errorf("faction %q: friendlyToPlayers contradicts hostileTo %q", name, "aligned")
		}
	}

	return r, nil
}

func parseFactionDoc(data []byte) (*factionDoc, error) {
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()

	var doc factionDoc
	if err := dec.Decode(&doc); err != nil {
		return nil, fmt.Errorf("cannot parse: %w", err)
	}
	if strings.TrimSpace(doc.Name) == "" {
		return nil, fmt.Errorf("name must not be empty")
	}
	if doc.HostileTo == nil {
		return nil, fmt.Errorf("hostileTo is required (use [] for a passive, retaliation-only faction)")
	}
	return &doc, nil
}
