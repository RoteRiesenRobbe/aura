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

// Waypoint is one point of a spawn's patrol route, in server units.
type Waypoint struct {
	X float32 `json:"x"`
	Y float32 `json:"y"`
}

// Spawn is an authored mob spawn point. The mob respawns after respawnTicks ±
// respawnVariancePct (chunk 4) — at the same spot, or rolled within the
// wander radius for wanderers (mob-depth chunk 5). Def is resolved at load
// time so an unknown mob name fails loudly at boot.
//
// Movement archetype (mob-depth chunk 5, §3.5 + pacing rework): waypoints
// non-empty → route patrol (patrolMode "pingpong" default, "loop" wraps
// last→first — circling a landmark); else the wander radius decides — it is
// tri-state: absent (nil) inherits the mob type's factors.wanderRadius,
// explicit 0 forces stationary (a bridge guard of a wandering species),
// > 0 overrides the radius. Explicit radius > 0 plus waypoints is an
// authoring error. IdleSpeedFactor overrides the type's idle pace for this
// spawn (nil = inherit; valid (0, 1]).
type Spawn struct {
	Mob                string     `json:"mob"`
	X                  float32    `json:"x"`
	Y                  float32    `json:"y"`
	Angle              float32    `json:"angle"`
	RespawnTicks       int        `json:"respawnTicks"`
	RespawnVariancePct float32    `json:"respawnVariancePct"`
	WanderRadius       *float32   `json:"wanderRadius"`
	IdleSpeedFactor    *float32   `json:"idleSpeedFactor"`
	Waypoints          []Waypoint `json:"waypoints"`
	PatrolMode         string     `json:"patrolMode"`

	// Def is the mob definition resolved from Mob; not part of the JSON.
	Def *mobs.MobDefinition `json:"-"`
}

// EffectiveWanderRadius resolves the spawn's tri-state wander radius against
// the mob type's default. Only meaningful once Def is resolved; waypoints
// take precedence over any wander radius.
func (s *Spawn) EffectiveWanderRadius() float32 {
	if len(s.Waypoints) > 0 {
		return 0
	}
	if s.WanderRadius != nil {
		return *s.WanderRadius
	}
	return s.Def.Factors.WanderRadius
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

// Campfire is a fixed world campfire position (atmosphere & recovery
// chunk 2): a permanent aligned heal-aura fixture placed at boot. Campfires
// are deliberately NOT zone spawns — they never die, need no respawn
// machinery, and chunk 4 consumes them as a first-class list of respawn
// anchors.
type Campfire struct {
	X float32 `json:"x"`
	Y float32 `json:"y"`
}

// Zone is the whole authored world description loaded from a zone file. One
// file = one complete zone (bounds + terrain + props + spawns + campfires).
type Zone struct {
	Name      string           `json:"name"`
	Bounds    Bounds           `json:"bounds"`
	Terrain   []TerrainTexture `json:"terrain"`
	Props     []Prop           `json:"props"`
	Spawns    []Spawn          `json:"spawns"`
	Campfires []Campfire       `json:"campfires"`

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
	for i := range z.Spawns {
		s := &z.Spawns[i]
		if s.WanderRadius != nil && *s.WanderRadius < 0 {
			return fmt.Errorf("spawn %d: wanderRadius must not be negative, got %g", i, *s.WanderRadius)
		}
		if s.WanderRadius != nil && *s.WanderRadius > 0 && len(s.Waypoints) > 0 {
			return fmt.Errorf("spawn %d: wanderRadius and waypoints are mutually exclusive", i)
		}
		if f := s.IdleSpeedFactor; f != nil && (*f <= 0 || *f > 1) {
			return fmt.Errorf("spawn %d: idleSpeedFactor %g must be in (0, 1]", i, *f)
		}
		if len(s.Waypoints) == 1 {
			return fmt.Errorf("spawn %d: waypoints needs at least 2 points for a route", i)
		}
		switch s.PatrolMode {
		case "", "pingpong", "loop":
		default:
			return fmt.Errorf("spawn %d: patrolMode %q must be \"pingpong\" or \"loop\"", i, s.PatrolMode)
		}
		if s.PatrolMode != "" && len(s.Waypoints) == 0 {
			return fmt.Errorf("spawn %d: patrolMode without waypoints", i)
		}
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
		// Speed needs the resolved definition, so this check can't live in
		// validate(): a mob that cannot walk cannot wander or patrol. (A
		// speed-0 type carrying a DEFAULT wanderRadius already fails at mob
		// registry load.)
		wanders := s.WanderRadius != nil && *s.WanderRadius > 0
		if (wanders || len(s.Waypoints) > 0) && def.Factors.Speed <= 0 {
			return fmt.Errorf("spawn %d: stationary mob %q (speed 0) cannot wander or patrol", i, s.Mob)
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
