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

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
)

// Bounds is the rectangular world size in server units ("Points"), a rectangle
// centered on the origin: [-Width/2, Width/2] × [-Height/2, Height/2].
type Bounds struct {
	Width  float32 `json:"width"`
	Height float32 `json:"height"`
}

// Prop is a hand-placed static object. blocksMovement puts the body on the
// static-collision layers. Def is resolved at load time so an unknown prop type
// fails loudly at boot.
//
// Rotation is the orientation in radians. It was parsed and stored but rendered
// NOWHERE from the world-foundation chunk until plan-prop-scale.md C2 gave
// table Resource a rotation field; prop.Prop surfaces it through Angle() and
// the client draws the sprite at it.
//
// ⚑ It is NOT cosmetic: a rect body is built turned (phy.NewSolidRotatedAABB),
// so a rotated House blocks at its drawn angle. C2 shipped without that — the
// D3 option-(B) trade — and the PO hit the "renders turned, blocks upright" lie
// in-game within the hour; C2b closed it. Circle bodies have no orientation and
// never needed anything.
//
// Scale is the per-placement size multiplier on the TYPE's body
// (plan-prop-scale.md C1, D1): nil = inherit the body verbatim, which is what
// keeps every prop authored before this field byte-identical. Deliberately a
// multiplier rather than terrain's absolute size — one scalar cannot express a
// rect body, while a multiplier scales both axes and keeps the authored aspect,
// and rescaling the type still moves every placement of it.
//
// ⚑ The body IS the collision shape, so scale is a GAMEPLAY quantity, not a
// cosmetic one: a 2.5× tree blocks 2.5× the radius (D5). That is deliberate —
// a prop that looks big and walks small is the worse lie.
type Prop struct {
	Type           string   `json:"type"`
	X              float32  `json:"x"`
	Y              float32  `json:"y"`
	Rotation       float32  `json:"rotation"`
	BlocksMovement bool     `json:"blocksMovement"`
	Scale          *float32 `json:"scale"`

	// Def is the prop definition resolved from Type; not part of the JSON.
	Def *PropDefinition `json:"-"`
}

// MaxPropScale is the upper rail on Prop.Scale — [PLACEHOLDER] (D2), a sanity
// guard against a fat-fingered drag in the editor rather than a design
// statement. The hard ceiling is far above it: the wire radius is u16 px, so a
// body past ~546 units would wrap.
const MaxPropScale = 10

// VisualBody resolves the placement's tri-state scale against the type's
// authored body — the ONE place the multiplier is applied, so every present and
// future prop type gets it without a per-type list anywhere. Only meaningful
// once Def is resolved.
//
// This is the VISUAL footprint (PropBody): what the sprite is drawn at, what
// the wire carries, and what the Tiled box shows. CollisionBody is what
// actually blocks.
//
// A rect scales on both axes, which preserves its aspect; a circle scales its
// radius. Exactly one form is ever set (parsePropDefinition enforces it), so
// multiplying all three fields is safe — the zeroes stay zero. CollisionFactor
// is carried through untouched: it is a ratio, and scaling a prop must not
// change how much of it is solid.
func (p *Prop) VisualBody() PropBody {
	b := p.Def.Body
	if p.Scale == nil {
		return b
	}
	s := *p.Scale
	return PropBody{
		Radius: b.Radius * s, Width: b.Width * s, Height: b.Height * s,
		CollisionFactor: b.CollisionFactor,
	}
}

// CollisionBody is the body the physics engine gets: the scaled visual body
// times the type's collision factor. Scale therefore still moves the collider
// (D5) — a 2.5× tree blocks 2.5× — while the crown keeps overhanging the trunk
// by the same ratio at every size.
func (p *Prop) CollisionBody() PropBody {
	return p.VisualBody().Collision()
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
//
// Level is the ABSOLUTE per-spawn level (plan-mob-levels.md C1, D1): the mob
// placed here stands at it, so HP, damage and kill XP all follow — all three
// already derive live from Mob.Level(). nil = inherit the species curveLevel,
// which is today's behaviour byte-for-byte. Deliberately absolute rather than
// an offset: a species rebalance must not move placements.
type Spawn struct {
	Mob                string     `json:"mob"`
	X                  float32    `json:"x"`
	Y                  float32    `json:"y"`
	Angle              float32    `json:"angle"`
	RespawnTicks       int        `json:"respawnTicks"`
	RespawnVariancePct float32    `json:"respawnVariancePct"`
	WanderRadius       *float32   `json:"wanderRadius"`
	IdleSpeedFactor    *float32   `json:"idleSpeedFactor"`
	Level              *int       `json:"level"`
	Waypoints          []Waypoint `json:"waypoints"`
	PatrolMode         string     `json:"patrolMode"`

	// Anchor is where THIS PLACEMENT's anchor-mode travel_to row delivers, by
	// zone-anchor name (plan-underworld.md U3b). Empty = fall back to whatever
	// the mob definition authors.
	//
	// ⭐ THE DESTINATION IS A PROPERTY OF THE WORLD, NOT OF THE OBJECT TYPE, and
	// this is the field that says so. Without it one cave mouth definition is one
	// destination, so a world with two passages needs four near-identical mob
	// files - which is the shape plan-world-paths.md D4 already refused once when
	// it put blocksMovement per PLACEMENT and never per profile.
	//
	// ⚑ An OVERRIDE with a definition-level default, the idiom the three knobs
	// above already use (wanderRadius, idleSpeedFactor, level): absent inherits.
	// A generic door - the shipped CaveMouth/CaveExit - authors no default at
	// all and takes its destination entirely from here.
	Anchor string `json:"anchor"`

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
	// ID is this fire's stable spawn-point identity — what a character's
	// campfire bind is PERSISTED as (characters.home_campfire_id), so it must
	// outlive edits to the zone file and must never be reused.
	//
	// ⚑ It is deliberately spelled "spawnpoint-N", not "campfire-N", and its
	// uniqueness is checked ZONE-WIDE rather than within the campfire list. A
	// campfire is simply the only bindable object that exists today; a waystone
	// or a bound totem should be able to join this namespace by adding one
	// field, and two kinds minting numbers independently is precisely how a
	// character would silently come back bound to the wrong object.
	//
	// ⚑ An id that no longer resolves is treated as UNBOUND, not as an error:
	// deleting a fire in the editor must not lock its dwellers out of the world,
	// so they fall back to the zone's default spawn (sys.defaultSpawnPosition).
	ID string  `json:"id"`
	X  float32 `json:"x"`
	Y  float32 `json:"y"`
	// StartingSpawn marks a campfire as a first-arrival spawn point (triage
	// item 5). Fresh / unbound players spawn at a random flagged fire — kept
	// data-driven so future selectable start locations reuse the same flag.
	//
	// ⚑ THE RULE IS PER LOADED SET, NOT PER FILE (plan-underworld.md U1, L4).
	// It used to live in validate() and moved to Place.checkSetWide the moment
	// more than one zone could load: a cave nobody binds in legitimately carries
	// fires with none flagged, while the WORLD must still have somewhere to put
	// a fresh character — and only the PRIMARY zone may flag one, or a new
	// character lands underground. Both halves hard-fail the boot.
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

// Point is a vertex in server units — the shape a Region polygon is built from.
// Deliberately its own named type rather than reusing Waypoint: a patrol route
// and a region outline are different concepts that happen to be a list of
// coordinates today (DRY's "don't deduplicate what merely looks alike").
type Point struct {
	X float32 `json:"x"`
	Y float32 `json:"y"`
}

// Region is a polygon naming a client-side presentation PROFILE — ground
// colour today, footsteps/music/atmosphere later (plan-region-primitive.md).
// Purely client-visual like TerrainTexture and DarkArea: the server parses and
// validates it (so DisallowUnknownFields accepts the key and typos fail by
// name) but never uses it.
//
// ⚑ Profile is NOT validated against a known set here, deliberately (D8): the
// profile table lives in the client, Tiled catches an unknown name at save time
// with the object id, and D11 resolves a miss to the default profile — so a
// typo costs one region's look, never a broken client. `terrain.type` has
// always had that same posture.
//
// Regions carry no identity: array order is the only ordering (D0 — the last
// containing region that declares a property wins) and nothing outside the
// zone file references one. A stable id is what a quest-readable region would
// need, and it is an open question, not a shipped requirement (§11).
type Region struct {
	Profile string  `json:"profile"`
	Points  []Point `json:"points"`
}

// Path is a POLYLINE naming a client-side presentation PROFILE, stroked into
// the world at Width server units across — roads and rivers
// (plan-world-paths.md C1). The sibling of Region: a region is a polygon
// FILLED, a path is a polyline STROKED, and they share the profile table, the
// paint spec and the blend mask on the client.
//
// ⚑ Deliberately its own array rather than a Region with a width (D2). A region
// is >= 3 points and its whole client lookup is point-in-polygon; a path is >= 2
// and has no inside at all. One array meaning two things would make both harder.
//
// ⚑ A path is open by default and CLOSED when Closed says so — a ring is still
// a stroke, never a fill (plan-zone-polygons.md P1). "Open polyline" was true of
// this type until then and is the thing to unlearn when reading older comments.
//
// ⭐ Unlike Region, the server does NOT merely parse and ignore this: a path
// authoring BlocksMovement gets static collision corridors built for it at boot
// (paths_collision.go). Profile stays client-only and unvalidated here (D5,
// Region's D8 posture verbatim) — the look is the client's, and the blocking is
// authored per placement, so the server never needs the profile table.
type Path struct {
	Profile string  `json:"profile"`
	Points  []Point `json:"points"`
	// Width is the stroke width in server units — GEOMETRY, not material (D3),
	// so it sits beside the points rather than in the profile: one river
	// narrows and widens, and a footpath and a highway share "Road".
	Width float32 `json:"width"`
	// BlocksMovement is the SAME word props[] already uses and the server
	// already reads (D4). Its zero value is the safe one, so a path is
	// decorative until someone says otherwise, and a shallow ford is simply a
	// water path authored false.
	BlocksMovement bool `json:"blocksMovement"`
	// Closed joins the last point back to the first: a moat, a ring road, a
	// circular town wall (plan-zone-polygons.md P1). The stroke wraps around and
	// the seam gets a joint circle like any other bend.
	//
	// ⚑ DERIVED from the Tiled SHAPE, never authored as a property: an object
	// drawn with the polygon tool is closed, one drawn with the polyline tool is
	// not. An authored bool could contradict the shape it was drawn as, and then
	// the two would disagree about where a road ends.
	//
	// ⛔ Closure does NOT imply FILL — a closed path is still a STROKE, and the
	// filled sibling is its own type and its own array (plan-zone-polygons.md
	// D1). That is what makes an accidental close in Tiled harmless: it joins
	// the two ends of a road, visibly, and one undo puts it back.
	Closed bool `json:"closed,omitempty"`
	// OutlineProfile and OutlineWidth draw a SECOND surface along this shape's
	// boundary: a river with banks, a wall with a mortar edge, a cliff with a lip
	// (plan-zone-polygons.md D3). Absent or empty = no outline, which is every
	// shape authored before this.
	//
	// ⭐ A second PROFILE, and that is what dissolves the feathering problem the
	// design started with. A profile carries its own blend, so a wall names an
	// outline profile with blend 0 and gets a hard rim while a riverbank names
	// one with blend 0.3 and gets a soft one — two independent knobs, no rule,
	// no forced feather-off, no new field.
	//
	// ⛔ DECORATION, and it NEVER touches collision. Corridors stay derived from
	// Width (paths) and the filled interior (polygons). Otherwise "my river
	// blocks wider than I authored it" becomes a debugging session, and the
	// outline stops being safely tunable by eye (L4).
	//
	// ⚑ Flat keys rather than a nested object because Tiled properties are flat,
	// so all four writers stay a one-line mapping each.
	OutlineProfile string  `json:"outlineProfile,omitempty"`
	OutlineWidth   float32 `json:"outlineWidth,omitempty"`
	// Effect names an authored skill applied to whatever stands inside this
	// shape — a lava river, a stream that heals (plan-area-effects.md E1).
	// Absent = inert, which is every path authored before this.
	//
	// ⚑ ON THE SHAPE, NEVER ON THE PROFILE (D2) — the full argument sits on
	// Polygon.Effect below, because the two carry exactly the same key.
	Effect string `json:"effect,omitempty"`
}

// Polygon is a CLOSED polygon naming a client-side presentation PROFILE and
// FILLED — a rock mass, a building footprint, a lake you cannot swim
// (plan-zone-polygons.md D1). The third surface primitive, and the sibling of
// both the others: a Region is a polygon filled as a MATERIAL, a Path is a
// polyline STROKED, a Polygon is a polygon filled as a THING.
//
// ⭐ Its own array and its own Tiled class rather than a flag on Path, and the
// divergence is why: once filled areas block, the two disagree about Width
// (load-bearing there, meaningless here), about the collider (a rect chain along
// segments vs a boundary stroke over an interior fill), about closure and about
// the minimum point count. One array meaning two things would make both harder —
// the same ruling Path's own comment already records against Region.
//
// ⛔ It is NOT a Region. Regions answer resolve() for footsteps, music and
// atmosphere and are heading for quest-trigger identity; a cave wall is none of
// those things and must not turn up in that lookup.
//
// ⚑ There is no Closed field here and never should be: a polygon is closed by
// construction, and an unfilled OPEN shape is a Path. Profile stays client-only
// and unvalidated (Region's D8 posture verbatim).
type Polygon struct {
	Profile string  `json:"profile"`
	Points  []Point `json:"points"`
	// BlocksMovement is the SAME word props[] and paths[] already use, zero
	// value safe, so a polygon is decorative until someone says otherwise
	// (world-paths D4). ⚑ Per PLACEMENT, never per profile — the profile table
	// is client-side by D12, so the server never sees it.
	BlocksMovement bool `json:"blocksMovement"`
	// OutlineProfile and OutlineWidth draw a SECOND surface along this shape's
	// boundary: a river with banks, a wall with a mortar edge, a cliff with a lip
	// (plan-zone-polygons.md D3). Absent or empty = no outline, which is every
	// shape authored before this.
	//
	// ⭐ A second PROFILE, and that is what dissolves the feathering problem the
	// design started with. A profile carries its own blend, so a wall names an
	// outline profile with blend 0 and gets a hard rim while a riverbank names
	// one with blend 0.3 and gets a soft one — two independent knobs, no rule,
	// no forced feather-off, no new field.
	//
	// ⛔ DECORATION, and it NEVER touches collision. Corridors stay derived from
	// Width (paths) and the filled interior (polygons). Otherwise "my river
	// blocks wider than I authored it" becomes a debugging session, and the
	// outline stops being safely tunable by eye (L4).
	//
	// ⚑ Flat keys rather than a nested object because Tiled properties are flat,
	// so all four writers stay a one-line mapping each.
	OutlineProfile string  `json:"outlineProfile,omitempty"`
	OutlineWidth   float32 `json:"outlineWidth,omitempty"`
	// Effect names an authored skill applied to whatever stands inside this
	// shape — the lava pool, the bog (plan-area-effects.md E1). Absent = inert,
	// and no shipped zone authors one, so the feature costs exactly zero (D10).
	//
	// ⭐ ON THE SHAPE, NEVER ON THE PROFILE (D2), and the reason is the one
	// BlocksMovement's own comment already records two fields up: the profile
	// table is CLIENT-SIDE (region-primitive D12), so the server never sees it.
	// A profile key would make the look table gameplay-authoritative — and a
	// profile is a MATERIAL, not a place, so a zone-1 pool and a zone-5 pool
	// wearing the same "Lava" would have to hurt identically, or the look table
	// forks for a balance reason and two visually identical profiles differ in
	// one number. Per PLACEMENT dissolves both, exactly as it does for
	// BlocksMovement.
	//
	// ⚑ The value names an authored SKILL, never a raw number (D3): a bare
	// magnitude would invent a second damage pipeline with no damage type, no
	// resistances and no immunity rails. ⚑ And the key is NEUTRAL (D9) —
	// ApplyHot sits beside ApplyDot with the same stream keying and the same
	// refresh rule, so a healing spring needs no second mechanism.
	//
	// ⛔ validate() cannot check the NAME: the skill registry is built before
	// any zone but is not an argument to the zone loader. CrossValidateAreaEffects
	// (area_effects.go) is where an unknown one refuses the boot, for the reason
	// CrossValidateTravelAnchors exists one file over.
	//
	// ⛔ The server does not READ this yet. E1 ships the key inert; the system
	// pass that applies it is E2.
	Effect string `json:"effect,omitempty"`
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

// Atmosphere is a closed area naming a client-side presentation PROFILE that
// describes the AIR rather than the ground: how dark this place is, how far you
// see inside it, and what the murk looks like
// (plan-region-atmosphere.md D0). The fourth surface primitive.
//
// ⛔ IT IS NOT A Polygon, and the word "polygon" is the trap (D15). Polygon is
// the WALL/MASS primitive: it fills, it may BLOCK, it takes an outline, and
// paths_collision's sibling builds static bodies for it. An atmosphere blocks
// NOTHING, takes no outline, never reaches phy.Space, and is drawn by the client
// on top of every wall, road and entity rather than into the ground. The two
// share a SHAPE and nothing else — a polygon is a wall you walk into, an
// atmosphere is air you walk through.
//
// ⭐ Its own array rather than properties on Region, which is where the design
// started (D0, reversed by the PO on 2026-09-12): a region is the MATERIAL
// UNDERFOOT — footsteps, music, ground texture, later quest identity — and the
// air is not the same boundary as the ground. A lit pocket at a cave mouth has
// the same floor as the dark part of the cave. Welding the two forces one
// polygon to answer both questions, and the "lit clearing" case then needs a
// fake region that silently overrides the footsteps of anyone standing in it.
// Third application of the ruling Path's own comment records against Region:
// one array meaning two things would make both harder.
//
// ⚑ Profile stays client-only and unvalidated (Region's D8 posture verbatim):
// the profile table lives in the client, so a typo costs one fog bank's look and
// never a broken boot. ⚑ There is no Closed field for Polygon's reason — an area
// is closed by construction.
type Atmosphere struct {
	Profile string  `json:"profile"`
	Points  []Point `json:"points"`
	// Effect names an authored skill applied to whatever stands inside this air
	// — the miasma (plan-area-effects.md E1). Absent = inert.
	//
	// ⚑ THE ONE KEY D15 DOES NOT REFUSE, and it is worth saying why, because
	// every other addition here has been turned away. D15 refuses
	// blocksMovement, outline and width because an atmosphere is AIR and those
	// describe a WALL — they would round-trip into a file that no longer boots.
	// An area effect describes no wall: it is a region of space acting on what
	// stands in it (D1), which air does as readily as ground. Lava is ground,
	// miasma is air, ONE key covers both — which is the whole reason this is one
	// feature rather than two.
	Effect string `json:"effect,omitempty"`
}

// ClearsDarkness, ClearsHaze and ClearsBoth are the closed set a Clearing's
// Clears field may name (plan-region-atmosphere.md A4). An enum rather than two
// bools because Tiled renders a dropdown for free and a bool PAIR lets an author
// tick neither, which is a shape that means nothing and would have to be refused
// here anyway.
const (
	ClearsDarkness = "darkness"
	ClearsHaze     = "haze"
	ClearsBoth     = "both"
)

// Clearing is a closed area that ERASES atmosphere rather than painting it — a
// lit pocket at a cave mouth, a hole in a fog bank (plan-region-atmosphere.md
// A4). The fifth surface primitive, and the only one that names no profile at
// all.
//
// ⭐ IT IS ITS OWN CLASS BECAUSE THE ALTERNATIVE WAS A MAGIC VALUE, and the PO
// rejected that on sight (2026-09-16, reopening D3). A4 replaces a design where
// an atmosphere profile authoring `darkness: 0` meant ERASE: one key doing two
// jobs, "how much" and "which operation", so three distinct author intents
// collapsed onto two spellings and "there is no darkness in my air" was
// unsayable. Now the SHAPE'S CLASS carries the operation and the profile carries
// only the look — P1's "the SHAPE is the flag" ruling, third application.
//
// ⛔ IT TAKES NO PROFILE, AND THE EMPTINESS IS THE RULING (L7, the argument a
// Polygon's missing Width already records). A clearing paints nothing, so an
// author reaching for "what colour is my clearing" must find NOTHING rather
// than a field that quietly means something else.
//
// ⭐ The payoff is on the OTHER side, and it is the part the PO saw: `darkness:
// 0` on an atmosphere profile is now simply a DECLARATION of zero — legal,
// meaningful, and a capability the old design could not express at all. A pure
// fog profile can say "and it is not dark in here", which stops a containing
// dark bank from being reported at that point.
//
// ⚑ A clearing rides the ATMOSPHERES layer in Tiled and is told apart by its
// class, which is zone-polygons D5's scheme rather than D16's — a clearing sits
// INSIDE the air it cuts, so hiding one to select the other is never the need
// that forced atmosphere onto a layer of its own.
//
// ⚑ Client-visual only, so the server parses, validates and IGNORES it —
// Atmosphere's D15 posture verbatim. Nothing here reaches phy.Space.
type Clearing struct {
	// Which layers this hole cuts: ClearsDarkness, ClearsHaze or ClearsBoth.
	// ⚑ Required, and validated against the closed set — an unrecognised value
	// would otherwise clear nothing and look exactly like a clearing the author
	// drew in the wrong place.
	Clears string  `json:"clears"`
	Points []Point `json:"points"`
}

// Zone is the whole authored world description loaded from a zone file. One
// file = one complete zone (bounds + terrain + props + spawns + campfires +
// dark areas + anchors). NPCs used to be a section of their own; since the
// actor merge they are ordinary spawns (plan-entity-model.md chunk 3a).
type Zone struct {
	Name   string `json:"name"`
	Legacy bool   `json:"legacy"` // retired-content zone tag (step-7 A.5); no shipped zone authors it since zone-editor C3
	Bounds Bounds `json:"bounds"`

	// Origin is where this zone's rectangle sits in the SHARED coordinate space
	// when several zones are loaded at once (plan-underworld.md U1). Absent =
	// {0,0}, which is every zone authored before this field and the overworld
	// forever — so a zone file is still authored around its own origin in Tiled,
	// and placement is a property of the world rather than of the geometry.
	//
	// ⚑ Zones are separated by DISTANCE and nothing else. There is no layer bit:
	// the broadphase, the border walls, the AOI viewport query and every aura
	// overlap keep two zones apart purely because they are far apart. Place()
	// owns the two rules that keep that true — origins must clear each other's
	// DOUBLED wall bounding boxes (L1), and must stay small enough that float32
	// still resolves a movement step (L12).
	//
	// ⚑ Every other coordinate in this file stays ZONE-LOCAL. Place() is the one
	// place the offset is applied, and it runs after validate() — which is why
	// the anchor-inside-bounds check below can keep comparing against a
	// rectangle centred on zero.
	//
	// ⭐ +Y IS DEEPER, AND THAT IS AN AUTHORING CONTRACT, NOT AN ACCIDENT (U4b).
	// The offset is otherwise a free packing coordinate, but a travel row's
	// direction byte is derived by comparing the two zones' origin Y, so where a
	// zone is placed is what decides whether walking into it reads as a DESCENT
	// or as a lateral crossing. Place a cave below the surface by giving it a
	// LARGER origin Y; place a neighbouring region beside it by moving it in X
	// instead, and its passages report lateral. ⛔ Packing zones down the Y axis
	// for tidiness alone would make every crossing a descent.
	//
	// ⚑ Deliberately NOT a separate `depth` int: a second field could disagree
	// with the geometry, and there is nothing the disagreement could mean.
	//
	// ⏳ PROVISIONAL, AND ITS SUCCESSOR IS ALREADY DESIGNED (§7.2, U6). Once the
	// origin is GENERATED at build time rather than authored, a `depth` field
	// cannot disagree with the geometry — because the geometry is derived from
	// it — and this contract is deleted. Do not build a second consumer of
	// "+Y is deeper" without reading that section first.
	Origin    Point            `json:"origin"`
	Terrain   []TerrainTexture `json:"terrain"`
	Props     []Prop           `json:"props"`
	Spawns    []Spawn          `json:"spawns"`
	Campfires []Campfire       `json:"campfires"`
	DarkAreas []DarkArea       `json:"darkAreas"`
	Regions   []Region         `json:"regions"`
	Paths     []Path           `json:"paths"`
	Polygons  []Polygon        `json:"polygons"`
	// Atmospheres is client-visual only and the server never reads it past
	// validation — DarkArea's and Region's posture verbatim.
	Atmospheres []Atmosphere `json:"atmospheres"`
	// Clearings ERASE what Atmospheres paint, and they are applied AFTER every
	// atmosphere regardless of authoring order (A4/D17) — "a hole in whatever is
	// already there", which is the only reading two separate arrays can support
	// without inventing an interleaving key. Client-visual only, like the array
	// above.
	Clearings []Clearing `json:"clearings"`
	Anchors   []Anchor   `json:"anchors"`

	// ID is the file stem the zone was loaded from — the -zone selection key
	// and the identity sent to the client so it renders the matching terrain.
	// Not part of the JSON; set at load time. Distinct from Name, which is a
	// human-readable label that may differ.
	ID string `json:"-"`

	// LegacyRefs lists legacy-tagged content a LIVE zone references (spawn
	// mobs; distinct names) — an authoring smell the boot
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
// zoneStems enumerates the zone files by stem WITHOUT parsing them, so "which
// zones exist" is answerable before any of them is known to be valid.
//
// ⛑ It is the single place that decides what a zone file IS — a .json under
// the zones FS. Both the by-name selector and the auto-discovering set loader
// read it, so the directory cannot come to mean two different things to them.
func zoneStems(fileSystem fs.FS) (paths map[string]string, stems []string, err error) {
	paths = map[string]string{} // stem -> path
	err = fs.WalkDir(fileSystem, ".", func(p string, d fs.DirEntry, err error) error {
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
		return nil, nil, err
	}
	if len(stems) == 0 {
		return nil, nil, fmt.Errorf("no zone file found")
	}
	sort.Strings(stems)
	return paths, stems, nil
}

func LoadZoneFS(fileSystem fs.FS, name string, mr mobs.Registry, pr PropRegistry) (*Zone, error) {
	paths, stems, err := zoneStems(fileSystem)
	if err != nil {
		return nil, err
	}

	target := name
	if target == "" {
		if len(stems) > 1 {
			return nil, fmt.Errorf("multiple zones found (%s); select one by name", strings.Join(stems, ", "))
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

// LoadAllZonesFS loads and PLACES **every** zone file in the directory, with
// startZone first so it becomes the primary zone.
//
// ⭐ THE DIRECTORY IS THE ZONE LIST. Dropping a .json into api/zones/ is the
// whole act of adding a zone — no conf edit, no second list to keep in sync.
// The conf names only which of them a fresh character starts in, because that
// is a genuine choice the filesystem cannot express; everything else about the
// set (how many, where each sits) is already authored in the files themselves.
//
// ⛔ THE TRADE THIS MAKES, ON PURPOSE: a half-authored zone sitting in the
// directory now BREAKS THE BOOT, where before it was ignored until something
// selected it. That is the point — a zone that is present but silently unloaded
// is the failure mode this replaces (a placed zone whose passages resolve
// against a set it was never in). Park WIP outside api/zones/, or finish it.
//
// The remaining zones follow in sorted order, which matters only for the boot
// log and for error message stability: Place is order-independent, and every
// consumer downstream takes flat world-coordinate lists.
func LoadAllZonesFS(fileSystem fs.FS, startZone string, mr mobs.Registry, pr PropRegistry) ([]*Zone, error) {
	_, stems, err := zoneStems(fileSystem)
	if err != nil {
		return nil, err
	}
	startZone = strings.TrimSpace(startZone)
	if startZone == "" {
		if len(stems) > 1 {
			return nil, fmt.Errorf("several zones found (%s) but no start zone is named; set game.startZone "+
				"in conf.json (or pass -start-zone) to the one a fresh character spawns in",
				strings.Join(stems, ", "))
		}
		startZone = stems[0]
	}
	names := make([]string, 0, len(stems))
	names = append(names, startZone)
	found := false
	for _, s := range stems {
		if s == startZone {
			found = true
			continue
		}
		names = append(names, s)
	}
	if !found {
		return nil, fmt.Errorf("start zone %q has no file in the zone directory (available: %s)",
			startZone, strings.Join(stems, ", "))
	}
	return LoadZonesFS(fileSystem, names, mr, pr)
}

// LoadZonesFS loads and PLACES a set of zones by file stem, in the order given
// — the first is the primary zone, the one a fresh character spawns in and the
// one whose bounds ride the wire (plan-underworld.md U1).
//
// ⚑ Only the named stems are parsed. That keeps LoadZoneFS's property that a
// half-authored WIP zone sitting in the directory cannot break a boot it was
// never selected for.
//
// ⚑ Placement is not optional and not the caller's job: Place applies each
// Origin AND enforces the separation and identity rules that are the only thing
// keeping two zones from reaching into each other. Loading without placing
// would produce a world that looks right and silently overlaps.
func LoadZonesFS(fileSystem fs.FS, names []string, mr mobs.Registry, pr PropRegistry) ([]*Zone, error) {
	if len(names) == 0 {
		// Backward compatible with every conf that names a single zone, and
		// with the "sole zone needs no name" rule LoadZoneFS already carries.
		z, err := LoadZoneFS(fileSystem, "", mr, pr)
		if err != nil {
			return nil, err
		}
		names = []string{z.ID}
	}
	zones := make([]*Zone, 0, len(names))
	seen := map[string]bool{}
	for _, name := range names {
		name = strings.TrimSpace(name)
		if name == "" {
			return nil, fmt.Errorf("zone list contains an empty name")
		}
		if seen[name] {
			return nil, fmt.Errorf("zone %q is listed twice", name)
		}
		seen[name] = true
		z, err := LoadZoneFS(fileSystem, name, mr, pr)
		if err != nil {
			return nil, err
		}
		zones = append(zones, z)
	}
	if err := Place(zones); err != nil {
		return nil, err
	}
	return zones, nil
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
	for i := range z.Props {
		// Tri-state like the spawn knobs: absent inherits the type's body. Zero
		// and negative are nonsense rather than "inherit" — an inheriting prop
		// authors no key at all.
		if sc := z.Props[i].Scale; sc != nil && (*sc <= 0 || *sc > MaxPropScale) {
			return fmt.Errorf("prop %d: scale %g must be in (0, %d]", i, *sc, MaxPropScale)
		}
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
		// Mirrors the species check (mobs/definitions.go: "curveLevel %d must
		// be >= 1"); no upper bound there or here — the player caps at 30 in
		// conf, but a >30 mob is a legitimate "unkillable for now" authoring
		// tool (§8.1).
		//
		// ⚑ Rejecting 0 is not cosmetic: Mob.spawnLevel encodes "no override"
		// as 0, which is only safe because 0 can never be authored.
		if l := s.Level; l != nil && *l < 1 {
			return fmt.Errorf("spawn %d: level %d must be >= 1", i, *l)
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
	// Both messages name the INDEX: a region has no id and no unique name, so
	// the position in the array is the only thing the author can search for.
	for i := range z.Regions {
		if strings.TrimSpace(z.Regions[i].Profile) == "" {
			return fmt.Errorf("region %d: profile must not be empty", i)
		}
		if len(z.Regions[i].Points) < 3 {
			return fmt.Errorf("region %d: needs at least 3 points to enclose an area, got %d",
				i, len(z.Regions[i].Points))
		}
	}
	// Paths name the INDEX for the same reason regions do: no id, no unique
	// name, so the array position is the only thing an author can search for.
	for i := range z.Paths {
		if strings.TrimSpace(z.Paths[i].Profile) == "" {
			return fmt.Errorf("path %d: profile must not be empty", i)
		}
		// TWO, not three: a path is an OPEN polyline. One point is not a line.
		if len(z.Paths[i].Points) < 2 {
			return fmt.Errorf("path %d: needs at least 2 points to draw a line, got %d",
				i, len(z.Paths[i].Points))
		}
		// A CLOSED one needs three, for the same reason a region does: two
		// points joined back to themselves are one segment walked twice, not a
		// ring, and the wraparound would lay a second body on top of the first.
		if z.Paths[i].Closed && len(z.Paths[i].Points) < 3 {
			return fmt.Errorf("path %d: a closed path needs at least 3 points to make a ring, got %d",
				i, len(z.Paths[i].Points))
		}
		if z.Paths[i].Width <= 0 {
			return fmt.Errorf("path %d: width must be positive, got %g", i, z.Paths[i].Width)
		}
		if err := validateOutline("path", i, z.Paths[i].OutlineProfile, z.Paths[i].OutlineWidth); err != nil {
			return err
		}
		if err := validateEffect("path", i, z.Paths[i].Effect); err != nil {
			return err
		}
	}
	// Polygons name the INDEX for the same reason regions and paths do.
	for i := range z.Polygons {
		if strings.TrimSpace(z.Polygons[i].Profile) == "" {
			return fmt.Errorf("polygon %d: profile must not be empty", i)
		}
		// THREE, like a region: a filled shape has to enclose an area. Two
		// points are a line, and a line is a path.
		if len(z.Polygons[i].Points) < 3 {
			return fmt.Errorf("polygon %d: needs at least 3 points to enclose an area, got %d",
				i, len(z.Polygons[i].Points))
		}
		if err := validateOutline("polygon", i, z.Polygons[i].OutlineProfile, z.Polygons[i].OutlineWidth); err != nil {
			return err
		}
		if err := validateEffect("polygon", i, z.Polygons[i].Effect); err != nil {
			return err
		}
	}
	// Atmospheres name the INDEX for the same reason every other shape array
	// does. ⚑ THREE points, like a region and a polygon: an area has to enclose
	// one. ⛔ There is deliberately nothing else to check — no width, no
	// blocksMovement, no outline — and that short loop IS the D15 ruling
	// showing up in the code.
	for i := range z.Atmospheres {
		if strings.TrimSpace(z.Atmospheres[i].Profile) == "" {
			return fmt.Errorf("atmosphere %d: profile must not be empty", i)
		}
		if len(z.Atmospheres[i].Points) < 3 {
			return fmt.Errorf("atmosphere %d: needs at least 3 points to enclose an area, got %d",
				i, len(z.Atmospheres[i].Points))
		}
		if err := validateEffect("atmosphere", i, z.Atmospheres[i].Effect); err != nil {
			return err
		}
	}
	// Clearings name the INDEX like every other shape array, and check the one
	// thing a clearing has that an atmosphere does not: a Clears value from the
	// closed set. ⛔ An unrecognised value must be REFUSED rather than defaulted
	// — a clearing that silently cleared nothing is indistinguishable on screen
	// from one drawn in the wrong place, which is a whole debugging session.
	for i := range z.Clearings {
		switch strings.TrimSpace(z.Clearings[i].Clears) {
		case ClearsDarkness, ClearsHaze, ClearsBoth:
		default:
			return fmt.Errorf("clearing %d: clears %q must be one of %q, %q or %q",
				i, z.Clearings[i].Clears, ClearsDarkness, ClearsHaze, ClearsBoth)
		}
		if len(z.Clearings[i].Points) < 3 {
			return fmt.Errorf("clearing %d: needs at least 3 points to enclose an area, got %d",
				i, len(z.Clearings[i].Points))
		}
	}
	// ⚑ "at least one campfire is a startingSpawn" USED TO LIVE HERE and moved
	// to world.Place's checkSetWide (plan-underworld.md U1). With more than one
	// zone loaded the question stopped being per-file: a cave that nobody binds
	// in legitimately carries fires without any starting spawn, while the
	// WORLD still must have somewhere to put a fresh character. Place runs on
	// every boot, single zone included, so the invariant is not weakened — only
	// asked at the right scope.
	// Spawn-point identity. The map is zone-wide by design (Campfire.ID) even
	// though campfires are its only members today.
	spawnPointIDs := make(map[string]bool, len(z.Campfires))
	for i := range z.Campfires {
		id := strings.TrimSpace(z.Campfires[i].ID)
		if id == "" {
			return fmt.Errorf("campfire %d: id must not be empty", i)
		}
		if spawnPointIDs[id] {
			return fmt.Errorf("campfire %d: duplicate spawn point id %q", i, id)
		}
		spawnPointIDs[id] = true
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

// resolve binds each spawn's mob name and each prop's type name to their
// definitions. Teaching-skill resolution used to live here too and moved into
// the mob loader with the NPC merge (chunk 3a) — an NPC is an ordinary spawn
// carrying an interaction block, so the zone no longer references skills at all.
func (z *Zone) resolve(mr mobs.Registry, pr PropRegistry) error {
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
		// ⛔ A bridge that blocks is a bridge you cannot cross: it clears the
		// water under its deck and then walls that same deck with its own body.
		// Both values are individually legal, which is why this has to be said
		// out loud. Lives here rather than in validate() because it needs the
		// RESOLVED definition — the same reason the spawn speed check does.
		if def.CrossesPaths && p.BlocksMovement {
			return fmt.Errorf("prop %d: %q crosses paths, so it must not also blocksMovement "+
				"(it would clear the corridor under its deck and then block the deck)", i, p.Type)
		}
	}
	return nil
}

// validateEffect is the half of the area-effect check that needs no registry
// (plan-area-effects.md E1). Absent is inert and always fine; PRESENT AND BLANK
// is not, and it fails here rather than in the cross-validation pass so the
// message can say what the mistake actually is.
//
// ⚑ It is a real authoring shape, not a theoretical one: a Tiled member cannot
// be empty, so an author who blanks the field by hand — or a hand-edited file
// with "effect": "" — produces exactly this. Left to the registry lookup it
// would read as `unknown effect ""`, which is true and useless.
//
// ⛔ The NAME is deliberately not checked here. The skill registry is built
// before any zone but is not an argument to the zone loader, so this function
// could not resolve one even if it wanted to — see CrossValidateAreaEffects.
func validateEffect(kind string, i int, effect string) error {
	if effect != "" && strings.TrimSpace(effect) == "" {
		return fmt.Errorf("%s %d: effect %q is blank — leave the key out entirely for no effect",
			kind, i, effect)
	}
	return nil
}

// validateOutline is the one rule both surface types share (plan-zone-polygons.md
// D3). Absent is always fine; ⚑ HALF-authored is not, and both halves fail the
// same way — SILENTLY. A named profile with no width draws a zero-wide stroke,
// and a width with no profile draws nothing at all, so either mistake looks
// exactly like the outline feature not working.
func validateOutline(kind string, i int, profile string, width float32) error {
	named := strings.TrimSpace(profile) != ""
	switch {
	case named && width <= 0:
		return fmt.Errorf("%s %d: outlineProfile %q needs a positive outlineWidth, got %g",
			kind, i, profile, width)
	case !named && width != 0:
		return fmt.Errorf("%s %d: outlineWidth %g draws nothing without an outlineProfile",
			kind, i, width)
	}
	return nil
}
