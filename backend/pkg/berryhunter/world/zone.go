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

	"github.com/trichner/berryhunter/pkg/api/BerryhunterApi"
	"github.com/trichner/berryhunter/pkg/berryhunter/items/mobs"
	"github.com/trichner/berryhunter/pkg/berryhunter/skills"
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
	// StartingSpawn marks a campfire as a first-arrival spawn point (triage
	// item 5). Fresh / unbound players spawn at a random flagged fire — kept
	// data-driven so future selectable start locations reuse the same flag. A
	// zone that places any campfires must flag at least one, or boot hard-fails
	// (validate) — otherwise new players would have nowhere to spawn.
	StartingSpawn bool `json:"startingSpawn"`
}

// DarkArea is a hand-placed circle of constant darkness (atmosphere &
// recovery chunk 3, §6.4: circles only, §6.5: independent of the day cycle).
// Purely client-visual like TerrainTexture: the server parses and validates
// it but never uses it — the client renders the darkness overlay from its
// bundled zone copy and light sources punch holes into it.
type DarkArea struct {
	X      float32 `json:"x"`
	Y      float32 `json:"y"`
	Radius float32 `json:"radius"`
}

// Teaching is one ordered skill a teaching NPC grants on approach once the
// player is at least RequiredLevel and does not already know the skill
// (unlock-source systems, plan-npc-teaching.md chunk 1). Line is spoken when
// the grant happens. Def is resolved from Skill at load time so an unknown
// skill fails loudly at boot, like Spawn.Mob and Prop.Type.
type Teaching struct {
	Skill         string `json:"skill"`
	RequiredLevel uint32 `json:"requiredLevel"`
	Line          string `json:"line"`

	// Def is the skill definition resolved from Skill; not part of the JSON.
	Def *skills.SkillDefinition `json:"-"`
}

// Npc is a peaceful, hand-placed, static teaching/lore NPC — the first
// non-hostile interactive entity (plan-npc-teaching.md). It is unattackable by
// construction (no HP, not a Combatant). Type maps to a placeholder EntityType
// sprite. A proximity sensor of Radius drives approach detection (chunk 2/3).
//
// Two roles, combinable on one NPC:
//   - Teaching: Teachings are granted in order on approach; a player too low
//     for the next teaching hears TooLowLine and nothing further is granted.
//   - Lore / sign-post: Lines are spoken when nothing is taught (an all-learned
//     sage's idle lore, or a pure guard/sign-post with no Teachings at all).
type Npc struct {
	Type       string     `json:"type"`
	X          float32    `json:"x"`
	Y          float32    `json:"y"`
	Radius     float32    `json:"radius"`
	TooLowLine string     `json:"tooLowLine"`
	Teachings  []Teaching `json:"teachings"`
	Lines      []string   `json:"lines"`

	// EntityType optionally names the wire sprite this NPC renders as
	// (content pass C2 — a signpost NPC wears a sign). Must be a
	// Resource-backed EntityType enum name (NPCs ride the Resource wire
	// path); validated against the enum at load. Empty = the npc package's
	// placeholder sprite.
	EntityType string `json:"entityType"`
}

// Anchor is a named point encounter scripts look up at registration (content
// pass C6): the zone owns WHERE an encounter plays out (boss home, totem
// spots, wave mouth — editor-movable), the Go script owns WHAT happens.
// Scripts hard-fail at boot on a missing anchor, so a rename here breaks
// loudly, never silently.
type Anchor struct {
	Name string  `json:"name"`
	X    float32 `json:"x"`
	Y    float32 `json:"y"`
}

// Zone is the whole authored world description loaded from a zone file. One
// file = one complete zone (bounds + terrain + props + spawns + campfires +
// dark areas + npcs + anchors).
type Zone struct {
	Name      string           `json:"name"`
	Legacy    bool             `json:"legacy"` // proving-grounds-style legacy zone (step-7 A.5)
	Bounds    Bounds           `json:"bounds"`
	Terrain   []TerrainTexture `json:"terrain"`
	Props     []Prop           `json:"props"`
	Spawns    []Spawn          `json:"spawns"`
	Campfires []Campfire       `json:"campfires"`
	DarkAreas []DarkArea       `json:"darkAreas"`
	Npcs      []Npc            `json:"npcs"`
	Anchors   []Anchor         `json:"anchors"`

	// ID is the file stem the zone was loaded from — the -zone selection key
	// and the identity sent to the client so it renders the matching terrain.
	// Not part of the JSON; set at load time. Distinct from Name, which is a
	// human-readable label that may differ.
	ID string `json:"-"`

	// LegacyRefs lists legacy-tagged content a LIVE zone references (spawn
	// mobs, NPC teaching skills; distinct names) — an authoring smell the boot
	// loader warns about (step-7 A.5). Always empty on legacy zones. Filled
	// by resolve, not part of the JSON.
	LegacyRefs []string `json:"-"`
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
func LoadZoneFS(fileSystem fs.FS, name string, mr mobs.Registry, pr PropRegistry, sr skills.Registry) (*Zone, error) {
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
	if err := z.resolve(mr, pr, sr); err != nil {
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
	for i := range z.DarkAreas {
		if z.DarkAreas[i].Radius <= 0 {
			return fmt.Errorf("darkArea %d: radius must be positive, got %g", i, z.DarkAreas[i].Radius)
		}
	}
	// A zone that places campfires must flag at least one as a starting spawn
	// (triage item 5) — fresh players spawn at a flagged fire, so an unflagged
	// zone would leave them nowhere to land.
	if len(z.Campfires) > 0 {
		hasStart := false
		for i := range z.Campfires {
			if z.Campfires[i].StartingSpawn {
				hasStart = true
				break
			}
		}
		if !hasStart {
			return fmt.Errorf("zone has %d campfire(s) but none is flagged startingSpawn", len(z.Campfires))
		}
	}
	anchorNames := make(map[string]bool, len(z.Anchors))
	for i := range z.Anchors {
		a := &z.Anchors[i]
		if strings.TrimSpace(a.Name) == "" {
			return fmt.Errorf("anchor %d: name must not be empty", i)
		}
		if anchorNames[a.Name] {
			return fmt.Errorf("anchor %d: duplicate name %q", i, a.Name)
		}
		anchorNames[a.Name] = true
		if a.X < -z.Bounds.Width/2 || a.X > z.Bounds.Width/2 ||
			a.Y < -z.Bounds.Height/2 || a.Y > z.Bounds.Height/2 {
			return fmt.Errorf("anchor %d (%q): (%g, %g) is outside the bounds", i, a.Name, a.X, a.Y)
		}
	}
	for i := range z.Npcs {
		n := &z.Npcs[i]
		if n.Radius <= 0 {
			return fmt.Errorf("npc %d: radius must be positive, got %g", i, n.Radius)
		}
		if len(n.Teachings) == 0 && len(n.Lines) == 0 {
			return fmt.Errorf("npc %d: must have teachings or lore lines", i)
		}
		if len(n.Teachings) > 0 && strings.TrimSpace(n.TooLowLine) == "" {
			return fmt.Errorf("npc %d: teaching NPC must have a tooLowLine", i)
		}
		if n.EntityType != "" {
			if _, ok := BerryhunterApi.EnumValuesEntityType[n.EntityType]; !ok {
				return fmt.Errorf("npc %d: entityType %q is not a known EntityType", i, n.EntityType)
			}
		}
		for j := range n.Teachings {
			t := &n.Teachings[j]
			if strings.TrimSpace(t.Skill) == "" {
				return fmt.Errorf("npc %d teaching %d: skill must not be empty", i, j)
			}
			if strings.TrimSpace(t.Line) == "" {
				return fmt.Errorf("npc %d teaching %d: line must not be empty", i, j)
			}
		}
	}
	return nil
}

// AnchorPos looks up a named anchor point. The world package stays phy-free,
// so callers assemble their own vector from (x, y).
func (z *Zone) AnchorPos(name string) (x, y float32, ok bool) {
	for i := range z.Anchors {
		if z.Anchors[i].Name == name {
			return z.Anchors[i].X, z.Anchors[i].Y, true
		}
	}
	return 0, 0, false
}

// resolve binds each spawn's mob name, each prop's type name, and each NPC
// teaching's skill name to their definitions.
func (z *Zone) resolve(mr mobs.Registry, pr PropRegistry, sr skills.Registry) error {
	// Legacy-leak collection (step-7 A.5): a live zone pointing at
	// legacy-tagged content means the tag went stale — the boot loader warns.
	// Distinct names only; a legacy zone referencing legacy content is its
	// expected shape and collects nothing.
	legacySeen := map[string]bool{}
	noteLegacy := func(kind, name string) {
		if z.Legacy {
			return
		}
		ref := kind + " " + name
		if !legacySeen[ref] {
			legacySeen[ref] = true
			z.LegacyRefs = append(z.LegacyRefs, ref)
		}
	}

	for i := range z.Spawns {
		s := &z.Spawns[i]
		def, err := mr.GetByName(s.Mob)
		if err != nil {
			return fmt.Errorf("spawn %d: unknown mob %q", i, s.Mob)
		}
		if def.Legacy {
			noteLegacy("mob", def.Name)
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
	// NPC sprites ride the Resource wire path (npc.go), so an entityType that
	// names a MOB's wire type would be handed a mob sprite class expecting
	// health/aura fields and mis-render (triage item 3/9 nicety). Reject that
	// specific footgun; resource sprites (Signpost, …) stay valid — a whitelist
	// of prop types would wrongly reject those. validate() already checked the
	// name is a known EntityType at all; this needs the mob registry.
	var mobEntityTypes map[string]bool
	if len(z.Npcs) > 0 {
		mobEntityTypes = make(map[string]bool)
		for _, m := range mr.Mobs() {
			et := m.EntityType
			if et == "" {
				et = m.Name // an absent override means the name is the wire type
			}
			mobEntityTypes[et] = true
		}
	}
	for i := range z.Npcs {
		n := &z.Npcs[i]
		if n.EntityType != "" && mobEntityTypes[n.EntityType] {
			return fmt.Errorf("npc %d: entityType %q is a mob sprite; NPCs need a Resource-backed sprite", i, n.EntityType)
		}
		for j := range n.Teachings {
			t := &n.Teachings[j]
			def, err := sr.GetByName(t.Skill)
			if err != nil {
				return fmt.Errorf("npc %d teaching %d: unknown skill %q", i, j, t.Skill)
			}
			if def.Legacy {
				noteLegacy("skill", def.Name)
			}
			t.Def = def
		}
	}
	return nil
}
