// Package world holds the server-authoritative description of the game world —
// the hand-authored zone that replaces the old procedural resource/mob
// generation (world foundation, plan-world-zones.md).
//
// Chunk 2 loads and validates the zone file and applies its bounds; chunk 3
// resolves props against the prop registry (props.go) so they can be placed as
// static entities at boot; spawns drive the spawn-point system (chunk 4).
package world

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/fs"
	"path"
	"sort"
	"strings"

	"github.com/trichner/berryhunter/pkg/berryhunter/items/mobs"
)

// Bounds is the rectangular world size in server units ("Points"), a rectangle
// centered on the origin: [-Width/2, Width/2] × [-Height/2, Height/2].
type Bounds struct {
	Width  float32 `json:"width"`
	Height float32 `json:"height"`
}

// Prop is a hand-placed static object. blocksMovement puts the body on the
// static-collision layers. Rotation is parsed and stored, but not yet
// rendered — the Resource wire table has no rotation field and circle-bodied
// props don't need one yet (revisit when the editor places rotated props,
// chunk 5/6). Def is resolved at load time so an unknown prop type fails
// loudly at boot.
type Prop struct {
	Type           string  `json:"type"`
	X              float32 `json:"x"`
	Y              float32 `json:"y"`
	Rotation       float32 `json:"rotation"`
	BlocksMovement bool    `json:"blocksMovement"`

	// Def is the prop definition resolved from Type; not part of the JSON.
	Def *PropDefinition `json:"-"`
}

// Spawn is an authored mob spawn point. The mob respawns at the same spot after
// respawnTicks ± respawnVariancePct (chunk 4). Def is resolved at load time so
// an unknown mob name fails loudly at boot.
type Spawn struct {
	Mob                string  `json:"mob"`
	X                  float32 `json:"x"`
	Y                  float32 `json:"y"`
	Angle              float32 `json:"angle"`
	RespawnTicks       int     `json:"respawnTicks"`
	RespawnVariancePct float32 `json:"respawnVariancePct"`

	// Def is the mob definition resolved from Mob; not part of the JSON.
	Def *mobs.MobDefinition `json:"-"`
}

// TerrainTexture is a hand-placed free-form ground texture. It is purely
// client-visual: the server parses it (so DisallowUnknownFields accepts the
// key and typos fail by name) but never uses it — the client loads the active
// zone's terrain from its bundled copy and renders it (chunk 6, §7.1). Stored
// in server units like everything else in the zone; the client multiplies by
// Points2px on load.
type TerrainTexture struct {
	Type     string  `json:"type"`
	X        float32 `json:"x"`
	Y        float32 `json:"y"`
	Size     float32 `json:"size"`
	Rotation float32 `json:"rotation"`
	Flipped  string  `json:"flipped"`
}

// Zone is the whole authored world description loaded from a zone file. One
// file = one complete zone (bounds + terrain + props + spawns).
type Zone struct {
	Name    string           `json:"name"`
	Bounds  Bounds           `json:"bounds"`
	Terrain []TerrainTexture `json:"terrain"`
	Props   []Prop           `json:"props"`
	Spawns  []Spawn          `json:"spawns"`

	// ID is the file stem the zone was loaded from — the -zone selection key
	// and the identity sent to the client so it renders the matching terrain.
	// Not part of the JSON; set at load time. Distinct from Name, which is a
	// human-readable label that may differ.
	ID string `json:"-"`
}

// LoadZoneFS loads the zone selected by name (its file stem, e.g. "scaffold"
// for scaffold.json), then parses, validates and resolves it. Candidate files
// are enumerated without parsing, so a half-authored WIP zone only breaks boot
// when it is the one being loaded. Selection rules: name != "" must match a
// stem (else error listing the available zones); name == "" loads the sole
// zone when exactly one exists (backward-compatible with the single-zone
// world) and otherwise errors asking for a -zone. Zones are curated content,
// so every anomaly aborts at boot (mirrors RecipesFromFS): malformed or
// unknown-key JSON, non-positive bounds, empty name, an unknown spawn mob, or
// an unknown prop type.
func LoadZoneFS(fileSystem fs.FS, name string, mr mobs.Registry, pr PropRegistry) (*Zone, error) {
	// Enumerate candidate zone files by stem without parsing them.
	paths := map[string]string{} // stem -> path
	var stems []string
	err := fs.WalkDir(fileSystem, ".", func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return fmt.Errorf("cannot read %q: %w", p, err)
		}
		if d.IsDir() || !strings.HasSuffix(p, ".json") {
			return nil
		}
		stem := strings.TrimSuffix(path.Base(p), ".json")
		if other, dup := paths[stem]; dup {
			return fmt.Errorf("duplicate zone name %q: %q and %q", stem, other, p)
		}
		paths[stem] = p
		stems = append(stems, stem)
		return nil
	})
	if err != nil {
		return nil, err
	}
	if len(stems) == 0 {
		return nil, fmt.Errorf("no zone file found")
	}
	sort.Strings(stems)

	target := name
	if target == "" {
		if len(stems) > 1 {
			return nil, fmt.Errorf("multiple zones found (%s); select one with -zone", strings.Join(stems, ", "))
		}
		target = stems[0]
	}
	p, ok := paths[target]
	if !ok {
		return nil, fmt.Errorf("zone %q not found (available: %s)", target, strings.Join(stems, ", "))
	}

	data, err := fs.ReadFile(fileSystem, p)
	if err != nil {
		return nil, fmt.Errorf("cannot read %q: %w", p, err)
	}
	z, err := parseZone(data)
	if err != nil {
		return nil, fmt.Errorf("zone %q: %w", p, err)
	}
	if err := z.resolve(mr, pr); err != nil {
		return nil, fmt.Errorf("zone %q: %w", p, err)
	}
	z.ID = target
	return z, nil
}

// parseZone decodes and validates a single zone document. Unknown keys are
// rejected so typos and stale renames fail by name rather than silently drop.
func parseZone(data []byte) (*Zone, error) {
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()

	var z Zone
	if err := dec.Decode(&z); err != nil {
		return nil, fmt.Errorf("cannot parse: %w", err)
	}
	if err := z.validate(); err != nil {
		return nil, err
	}
	return &z, nil
}

func (z *Zone) validate() error {
	if strings.TrimSpace(z.Name) == "" {
		return fmt.Errorf("name must not be empty")
	}
	if z.Bounds.Width <= 0 || z.Bounds.Height <= 0 {
		return fmt.Errorf("bounds must be positive, got %gx%g", z.Bounds.Width, z.Bounds.Height)
	}
	return nil
}

// resolve binds each spawn's mob name and each prop's type name to their
// definitions.
func (z *Zone) resolve(mr mobs.Registry, pr PropRegistry) error {
	for i := range z.Spawns {
		s := &z.Spawns[i]
		def, err := mr.GetByName(s.Mob)
		if err != nil {
			return fmt.Errorf("spawn %d: unknown mob %q", i, s.Mob)
		}
		s.Def = def
	}
	for i := range z.Props {
		p := &z.Props[i]
		def, err := pr.GetByName(p.Type)
		if err != nil {
			return fmt.Errorf("prop %d: unknown type %q", i, p.Type)
		}
		p.Def = def
	}
	return nil
}
