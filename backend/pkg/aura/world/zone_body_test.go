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
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
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

// C2: the authored orientation reaches the entity, for both body forms.
// Rotation is the one placement field that was parsed and stored since the
// world-foundation chunk and rendered nowhere — Angle() is what closes that.
func TestPropRotation_ReachesTheEntity(t *testing.T) {
	const doc = `{
		"name": "Body",
		"bounds": { "width": 60, "height": 40 },
		"props": [
			{ "type": "Tree", "x": 0, "y": 0, "rotation": 2.03, "blocksMovement": true },
			{ "type": "House", "x": 9, "y": 0, "rotation": 0.75, "blocksMovement": true },
			{ "type": "Tree", "x": 4, "y": 0, "rotation": 0, "blocksMovement": true }
		]
	}`
	z := loadForBody(t, doc)

	// float32 literals, not untyped constants: EqualValues would widen the
	// actual to float64 and 2.03 does not survive the round trip.
	assert.Equal(t, float32(2.03), buildProp(&z.Props[0]).Angle())
	assert.Equal(t, float32(0.75), buildProp(&z.Props[1]).Angle(), "a rect body carries it too")
	assert.Equal(t, float32(0), buildProp(&z.Props[2]).Angle(),
		"an unrotated prop must report exactly 0 — that is what keeps it off the wire")
}

// ⭐ This pin REPLACES TestRotatedRectProp_ColliderStaysAxisAligned, exactly as
// that test's own comment instructed: it asserted the deliberate D3 option-(B)
// lie — a rotated House rendering turned and blocking upright — and said that
// if it ever failed, somebody had made rect collision honest and the pin should
// be replaced rather than deleted. C2b made it honest, the same day the PO hit
// the lie in-game.
//
// 45° on a 4x3 box sweeps (4+3)/sqrt(2) = 4.9497 on both axes. The old
// behaviour was a 4x3 bound that never moved.
func TestRotatedRectProp_ColliderTurnsWithTheSprite(t *testing.T) {
	const doc = `{
		"name": "Body",
		"bounds": { "width": 60, "height": 40 },
		"props": [
			{ "type": "House", "x": 0, "y": 0, "rotation": 0.7854, "blocksMovement": true },
			{ "type": "House", "x": 20, "y": 0, "rotation": 0, "blocksMovement": true }
		]
	}`
	z := loadForBody(t, doc)
	turned, flat := buildProp(&z.Props[0]), buildProp(&z.Props[1])

	bb := turned.AABB()
	assert.InDelta(t, 4.9497, float64(bb.Right-bb.Left), 1e-3)
	assert.InDelta(t, 4.9497, float64(bb.Upper-bb.Bottom), 1e-3)
	assert.Equal(t, float32(0.7854), turned.Angle(), "and the sprite agrees")

	// ⚑ The unrotated twin must be untouched — 807 of the world's 810 props are
	// at angle 0, so a regression here is a world-wide navigation change.
	fb := flat.AABB()
	assert.EqualValues(t, 4, fb.Right-fb.Left)
	assert.EqualValues(t, 3, fb.Upper-fb.Bottom)
}

// The behavioural half, in world coordinates rather than bounds — this is what
// "walking into a rotated house" actually tests. Two spots where the upright
// and turned readings give OPPOSITE verdicts for a player-sized body, so the
// pair cannot pass by accident:
//
//	(2.4, 0.0)  gap 0.400 upright (clear)   gap 0.197 turned (BLOCKED)
//	(1.9, 1.4)  inside upright (BLOCKED)    gap 0.333 turned (clear)
func TestRotatedRectProp_BlocksWhereItIsDrawn(t *testing.T) {
	// player.ColliderRadiusMeters — not imported, because model/player pulls in
	// most of the game to assert one number.
	const playerRadius = 0.25

	const doc = `{
		"name": "Body",
		"bounds": { "width": 60, "height": 40 },
		"props": [
			{ "type": "House", "x": 0, "y": 0, "rotation": 0.7854, "blocksMovement": true },
			{ "type": "House", "x": 20, "y": 0, "rotation": 0, "blocksMovement": true }
		]
	}`
	z := loadForBody(t, doc)
	turned := buildProp(&z.Props[0]).Bodies()[0].(*phy.SolidAABB)
	flat := buildProp(&z.Props[1]).Bodies()[0].(*phy.SolidAABB)

	blocks := func(b *phy.SolidAABB, p, centre phy.Vec2f) bool {
		p = p.Add(centre) // the flat house sits at x = 20
		return p.Sub(b.ClosestPoint(p)).Abs() < playerRadius
	}
	at20 := phy.Vec2f{X: 20}

	// Out along the turned diagonal: the rotation swung the corner INTO here.
	assert.True(t, blocks(turned, phy.Vec2f{X: 2.4}, phy.VEC2F_ZERO))
	assert.False(t, blocks(flat, phy.Vec2f{X: 2.4}, at20),
		"...and an upright house does not reach this far")

	// The corner an upright house fills and a turned one has vacated.
	assert.False(t, blocks(turned, phy.Vec2f{X: 1.9, Y: 1.4}, phy.VEC2F_ZERO))
	assert.True(t, blocks(flat, phy.Vec2f{X: 1.9, Y: 1.4}, at20),
		"...which is squarely inside an upright one")
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
