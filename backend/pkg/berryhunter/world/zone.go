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
// static-collision layers; blocksAura is carried but stays inert until item 6.
// Rotation is parsed and stored, but not yet rendered — the Resource wire
// table has no rotation field and circle-bodied props don't need one yet
// (revisit when the editor places rotated props, chunk 5/6). Def is resolved
// at load time so an unknown prop type fails loudly at boot.
type Prop struct {
	Type           string  `json:"type"`
	X              float32 `json:"x"`
	Y              float32 `json:"y"`
	Rotation       float32 `json:"rotation"`
	BlocksMovement bool    `json:"blocksMovement"`
	BlocksAura     bool    `json:"blocksAura"`

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

// Zone is the whole authored world description loaded from zone.json.
type Zone struct {
	Name   string  `json:"name"`
	Bounds Bounds  `json:"bounds"`
	Props  []Prop  `json:"props"`
	Spawns []Spawn `json:"spawns"`
}

// LoadZoneFS walks fileSystem for a single .json zone file, parses, validates
// and resolves spawn mob names against mr and prop type names against pr.
// Zones are curated content, so every anomaly aborts at boot (mirrors
// RecipesFromFS): malformed or unknown-key JSON, non-positive bounds, empty
// name, an unknown spawn mob, an unknown prop type, zero zone files, or more
// than one (multiple zones are not supported yet — plan §1.2).
func LoadZoneFS(fileSystem fs.FS, mr mobs.Registry, pr PropRegistry) (*Zone, error) {
	var found *Zone
	var foundPath string

	err := fs.WalkDir(fileSystem, ".", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return fmt.Errorf("cannot read %q: %w", path, err)
		}
		if d.IsDir() || !strings.HasSuffix(path, ".json") {
			return nil
		}
		if found != nil {
			return fmt.Errorf("multiple zone files: %q and %q (multiple zones not supported yet)", foundPath, path)
		}

		data, err := fs.ReadFile(fileSystem, path)
		if err != nil {
			return fmt.Errorf("cannot read %q: %w", path, err)
		}
		z, err := parseZone(data)
		if err != nil {
			return fmt.Errorf("zone %q: %w", path, err)
		}
		if err := z.resolve(mr, pr); err != nil {
			return fmt.Errorf("zone %q: %w", path, err)
		}
		found, foundPath = z, path
		return nil
	})
	if err != nil {
		return nil, err
	}
	if found == nil {
		return nil, fmt.Errorf("no zone file found")
	}
	return found, nil
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
