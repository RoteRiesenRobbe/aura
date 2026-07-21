package world

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/fs"
	"strings"

	"github.com/RoteRiesenRobbe/aura/pkg/api/AuraApi"
)

// PropBody describes the physical body of a prop type: either a circle
// (radius) or an axis-aligned rectangle (width + height) — exactly one form,
// enforced at parse. Rectangles never rotate (a zone prop's rotation stays
// visual-only, and the server doesn't even apply it yet — see zone.Prop).
// [PLACEHOLDER] sizes live in api/props/, tuned in-game.
type PropBody struct {
	Radius float32 `json:"radius"`
	Width  float32 `json:"width"`
	Height float32 `json:"height"`
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
type propDefinitionDoc struct {
	Name       string   `json:"name"`
	EntityType string   `json:"entityType"`
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
	return &PropDefinition{
		Name:       doc.Name,
		EntityType: entityType,
		Body:       doc.Body,
	}, nil
}
