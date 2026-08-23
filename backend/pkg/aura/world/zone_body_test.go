// This file is package world_test rather than package world on purpose: it
// reaches into model/prop, and model imports world — an internal test file
// importing model/prop would be an import cycle. The external test package is
// the only place the two halves can meet.
package world_test

import (
	"testing"
	"testing/fstest"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/api/AuraApi"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/prop"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/world"
)

type emptyMobRegistry struct{}

func (emptyMobRegistry) Get(mobs.MobID) (*mobs.MobDefinition, error) { return nil, errNotFound }
func (emptyMobRegistry) GetByName(string) (*mobs.MobDefinition, error) {
	return nil, errNotFound
}
func (emptyMobRegistry) Mobs() []*mobs.MobDefinition { return nil }

type bodyPropRegistry struct {
	byName map[string]*world.PropDefinition
}

func (r bodyPropRegistry) GetByName(name string) (*world.PropDefinition, error) {
	p, ok := r.byName[name]
	if !ok {
		return nil, errNotFound
	}
	return p, nil
}
func (r bodyPropRegistry) Props() []*world.PropDefinition { return nil }

type notFound struct{}

func (notFound) Error() string { return "not found" }

var errNotFound = notFound{}

// ⭐ The real placement function, not a copy of it. C1 shipped this as an
// eight-line mirror of aurad.go's loop with a comment warning the two could
// diverge; C1b collapsed all three copies into prop.FromZone, so these tests
// now exercise exactly what boot runs.
func buildProp(p *world.Prop) *prop.Prop { return prop.FromZone(p) }

func loadForBody(t *testing.T, doc string) *world.Zone {
	t.Helper()
	z, err := world.LoadZoneFS(
		fstest.MapFS{"zone.json": {Data: []byte(doc)}}, "",
		emptyMobRegistry{},
		bodyPropRegistry{byName: map[string]*world.PropDefinition{
			"Tree":  {Name: "Tree", EntityType: AuraApi.EntityTypeRoundTree, Body: world.PropBody{Radius: 1}},
			"House": {Name: "House", EntityType: AuraApi.EntityTypeHouse, Body: world.PropBody{Width: 4, Height: 3}},
		}},
	)
	require.NoError(t, err)
	return z
}

// ⭐ The half that is easy to forget: the body IS the collision shape, so a
// scaled prop must block at its scaled size, not merely look bigger (D5).
func TestScaledProp_CollisionBodyIsScaled(t *testing.T) {
	const doc = `{
		"name": "Body",
		"bounds": { "width": 60, "height": 40 },
		"props": [
			{ "type": "Tree", "x": 0, "y": 0, "rotation": 0, "blocksMovement": true },
			{ "type": "Tree", "x": 3, "y": 0, "rotation": 0,
			  "blocksMovement": true, "scale": 2.5 }
		]
	}`
	z := loadForBody(t, doc)

	plain := buildProp(&z.Props[0])
	scaled := buildProp(&z.Props[1])

	// Radius() is what reaches the wire (codec: ResourceAddRadius), so this one
	// assertion covers both the collision body and the client's sprite size.
	assert.EqualValues(t, 1, plain.Radius())
	assert.EqualValues(t, 2.5, scaled.Radius())

	// And the collider itself, not just the reported scalar: the AABB of a
	// 2.5-radius circle spans 5 units.
	bb := scaled.AABB()
	assert.InDelta(t, 5, float64(bb.Right-bb.Left), 1e-4)
	assert.InDelta(t, 5, float64(bb.Upper-bb.Bottom), 1e-4)

	// blocksMovement still puts it on the static-collision layers — scaling
	// must not disturb the layer bits.
	assert.NotZero(t, scaled.Bodies()[0].Shape().Layer&int(model.LayerPlayerStaticCollision))
}

func TestScaledRectProp_CollisionBodyIsScaled(t *testing.T) {
	const doc = `{
		"name": "Body",
		"bounds": { "width": 60, "height": 40 },
		"props": [
			{ "type": "House", "x": 0, "y": 0, "rotation": 0,
			  "blocksMovement": true, "scale": 2 }
		]
	}`
	z := loadForBody(t, doc)
	p := buildProp(&z.Props[0])

	bb := p.AABB()
	assert.InDelta(t, 8, float64(bb.Right-bb.Left), 1e-4)
	assert.InDelta(t, 6, float64(bb.Upper-bb.Bottom), 1e-4)
	// The wire scalar for a rect is the max half-extent (8/2), which is what
	// the client scales its square texture from before re-applying the aspect.
	assert.EqualValues(t, 4, p.Radius())
}

// A decorative prop scales its sprite and stays non-blocking.
func TestScaledProp_NonBlockingStaysNonBlocking(t *testing.T) {
	const doc = `{
		"name": "Body",
		"bounds": { "width": 60, "height": 40 },
		"props": [
			{ "type": "Tree", "x": 0, "y": 0, "rotation": 0,
			  "blocksMovement": false, "scale": 3 }
		]
	}`
	z := loadForBody(t, doc)
	p := buildProp(&z.Props[0])
	assert.EqualValues(t, 3, p.Radius())
	assert.Zero(t, p.Bodies()[0].Shape().Layer&int(model.LayerPlayerStaticCollision))
}
