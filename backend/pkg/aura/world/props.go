package world

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/fs"
	"strings"

	"github.com/RoteRiesenRobbe/aura/pkg/api/AuraApi"
)

// PropBody describes the body of a prop type: either a circle (radius) or an
// axis-aligned rectangle (width + height) — exactly one form, enforced at
// parse. Rectangles never rotate (a zone prop's rotation stays visual-only,
// and the server doesn't even apply it yet — see zone.Prop).
// [PLACEHOLDER] sizes live in api/props/, tuned in-game.
//
// ⭐ The body is the VISUAL footprint, and collision is a fraction of it
// (plan-prop-scale.md C1b, D6). The sprite is drawn at exactly this size — the
// client applies no per-class factor of its own — so the authored number is
// what you see, in the game AND in the Tiled box. That is what makes the
// editor WYSIWYG.
//
// ⚑ It used to be the other way round: the body was the COLLIDER and the
// client inflated the sprite by a hardcoded per-class constant
// (`size * 1.15 + character.size` for trees, `* 1.07` for minerals). Two
// things were wrong with that. The editor drew the collider and so disagreed
// with the game by 40% on trees and 0% on houses; and the flat `+ 30px` addend
// did not scale, so a prop shrunk to 0.294 rendered at 2.00× its collider
// while one grown to 2.045 rendered at 1.27× — per-placement scale was
// non-linear on screen exactly where it was least forgiving. The mineral art
// pass had already made this argument and fixed it for Rock and Boulder; the
// tree kept the addend until now.
type PropBody struct {
	Radius float32 `json:"radius"`
	Width  float32 `json:"width"`
	Height float32 `json:"height"`

	// CollisionFactor shrinks the collision body relative to the visual one:
	// nil = 1.0, the body collides at exactly its own size (House, GateWall).
	// A tree crown is meant to overhang its trunk, so Tree authors ~0.714 —
	// the same 120 px collider it has always had, under a 168 px sprite.
	//
	// ⚑ A multiplier rather than a second absolute size, for the same reason
	// Prop.Scale is (D1): one scalar serves both body forms and keeps the
	// authored aspect. It composes with Scale by plain multiplication.
	CollisionFactor *float32 `json:"collisionFactor"`
}

// EffectiveCollisionFactor resolves the tri-state factor. nil = 1.0.
func (b PropBody) EffectiveCollisionFactor() float32 {
	if b.CollisionFactor == nil {
		return 1
	}
	return *b.CollisionFactor
}

// Collision returns the body the physics engine gets: the visual body times
// the collision factor. Exactly one form is ever set, so scaling all three
// fields keeps the zeroes zero and a circle can never become a rect.
func (b PropBody) Collision() PropBody {
	f := b.EffectiveCollisionFactor()
	if f == 1 {
		return b
	}
	return PropBody{Radius: b.Radius * f, Width: b.Width * f, Height: b.Height * f}
}

// VisualRadius is the single size scalar the wire carries (codec:
// ResourceAddRadius), which the client draws the sprite at. For a rect it is
// the max half-extent; the client recovers the aspect from the prop JSON.
func (b PropBody) VisualRadius() float32 {
	if !b.IsRect() {
		return b.Radius
	}
	if b.Width > b.Height {
		return b.Width / 2
	}
	return b.Height / 2
}

// IsRect reports whether the body is the rectangle form.
func (b PropBody) IsRect() bool {
	return b.Width > 0 || b.Height > 0
}

// PropDefinition maps an authored prop type name to the client-facing
// EntityType (which picks the sprite) and its physics body (§7.2: props get a
// small dedicated registry — they are not items). Scaffold definitions reuse
// existing EntityTypes (Stone, RoundTree, …) so no wire or frontend change is
// needed; dedicated prop art is content work. The EntityType stays the
// FlatBuffers enum here — world can't import model (cfg → world → model would
// cycle); the boot seam converts, like gen's trees/resources tables do.
type PropDefinition struct {
	Name       string
	EntityType AuraApi.EntityType
	Body       PropBody
}

// PropRegistry resolves zone prop type names to their definitions.
type PropRegistry interface {
	GetByName(name string) (*PropDefinition, error)
	Props() []*PropDefinition
}

type propRegistry struct {
	props map[string]*PropDefinition
}

func (r *propRegistry) GetByName(name string) (*PropDefinition, error) {
	p, ok := r.props[name]
	if !ok {
		return nil, fmt.Errorf("PropDefinition %q not found", name)
	}
	return p, nil
}

func (r *propRegistry) Props() []*PropDefinition {
	props := make([]*PropDefinition, 0, len(r.props))
	for _, p := range r.props {
		props = append(props, p)
	}
	return props
}

// PropRegistryFromFS walks fileSystem for *.json prop definitions. Props are
// curated content, so every anomaly aborts at boot (mirrors the other
// registries): malformed or unknown-key JSON, an empty name, an EntityType
// name the schema doesn't know, a non-positive radius, or a duplicate name.
func PropRegistryFromFS(fileSystem fs.FS) (PropRegistry, error) {
	r := &propRegistry{props: map[string]*PropDefinition{}}

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
		def, err := parsePropDefinition(data)
		if err != nil {
			return fmt.Errorf("prop %q: %w", path, err)
		}
		if _, ok := r.props[def.Name]; ok {
			return fmt.Errorf("prop %q: duplicate prop name %q", path, def.Name)
		}
		r.props[def.Name] = def
		return nil
	})
	if err != nil {
		return nil, err
	}
	return r, nil
}

// propDefinitionDoc is the JSON shape; EntityType is a name resolved against
// the FlatBuffers enum so typos fail at boot rather than render nothing.
//
// Sprite names the art file (frontend/src/features/game-objects/assets/resources/)
// the client and the Tiled palette generator resolve directly — it is parsed
// here only to fail boot fast on a missing value; nothing server-side reads
// it, so it does not appear on the exported PropDefinition.
type propDefinitionDoc struct {
	Name       string   `json:"name"`
	EntityType string   `json:"entityType"`
	Sprite     string   `json:"sprite"`
	Body       PropBody `json:"body"`
}

func parsePropDefinition(data []byte) (*PropDefinition, error) {
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()

	var doc propDefinitionDoc
	if err := dec.Decode(&doc); err != nil {
		return nil, fmt.Errorf("cannot parse: %w", err)
	}
	if strings.TrimSpace(doc.Name) == "" {
		return nil, fmt.Errorf("name must not be empty")
	}
	if strings.TrimSpace(doc.Sprite) == "" {
		return nil, fmt.Errorf("sprite must not be empty")
	}
	entityType, ok := AuraApi.EnumValuesEntityType[doc.EntityType]
	if !ok {
		return nil, fmt.Errorf("unknown entityType %q", doc.EntityType)
	}
	if doc.Body.IsRect() {
		if doc.Body.Radius != 0 {
			return nil, fmt.Errorf("body must be either a radius or width+height, not both")
		}
		if doc.Body.Width <= 0 || doc.Body.Height <= 0 {
			return nil, fmt.Errorf("body width and height must both be positive, got %g x %g", doc.Body.Width, doc.Body.Height)
		}
	} else if doc.Body.Radius <= 0 {
		return nil, fmt.Errorf("body radius must be positive, got %g", doc.Body.Radius)
	}
	// Absent means 1.0; an authored 0 or negative would give a prop no body at
	// all, which is never what anyone means.
	if f := doc.Body.CollisionFactor; f != nil && *f <= 0 {
		return nil, fmt.Errorf("body collisionFactor must be positive, got %g", *f)
	}
	return &PropDefinition{
		Name:       doc.Name,
		EntityType: entityType,
		Body:       doc.Body,
	}, nil
}
