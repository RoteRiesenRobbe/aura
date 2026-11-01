package world

import (
	"fmt"
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// bodiedPropRegistry resolves prop names to bodies chosen by the test, so the
// scale cases can exercise both body forms (the shared newFakePropRegistry
// hands out one fixed circle).
type bodiedPropRegistry struct {
	byName map[string]*PropDefinition
}

func (r *bodiedPropRegistry) GetByName(name string) (*PropDefinition, error) {
	p, ok := r.byName[name]
	if !ok {
		return nil, fmt.Errorf("prop %q not found", name)
	}
	return p, nil
}

func (r *bodiedPropRegistry) Props() []*PropDefinition {
	out := make([]*PropDefinition, 0, len(r.byName))
	for _, p := range r.byName {
		out = append(out, p)
	}
	return out
}

// Tree is the circle case (the 575 placements), House the rect case — the two
// shapes the multiplier has to keep honest.
func scaleRegistry() PropRegistry {
	return &bodiedPropRegistry{byName: map[string]*PropDefinition{
		"Tree":  {Name: "Tree", Body: PropBody{Radius: 1}},
		"House": {Name: "House", Body: PropBody{Width: 4, Height: 3}},
	}}
}

func loadScaleZone(t *testing.T, doc string) *Zone {
	t.Helper()
	z, err := LoadZoneFS(mapFS(doc), "", newFakeMobRegistry(), scaleRegistry())
	require.NoError(t, err)
	return z
}

// ⚑ The case that protects every prop authored before the field existed: an
// absent scale must return the type's body byte-for-byte, not 1.0×-of-it.
func TestPropScale_AbsentInheritsTheBodyVerbatim(t *testing.T) {
	const doc = `{
		"name": "Scale",
		"bounds": { "width": 60, "height": 40 },
		"props": {"default": [
			{ "type": "Tree", "x": 0, "y": 0, "rotation": 0, "blocksMovement": true },
			{ "type": "House", "x": 5, "y": 5, "rotation": 0, "blocksMovement": true }
		]}
	}`

	z := loadScaleZone(t, doc)
	require.Len(t, z.Props, 2)
	assert.Nil(t, z.Props[0].Scale, "absent scale must stay nil, not default to 1")
	assert.Equal(t, PropBody{Radius: 1}, z.Props[0].VisualBody())
	assert.Equal(t, PropBody{Width: 4, Height: 3}, z.Props[1].VisualBody())
}

func TestPropScale_ScalesACircleBody(t *testing.T) {
	const doc = `{
		"name": "Scale",
		"bounds": { "width": 60, "height": 40 },
		"props": {"default": [
			{ "type": "Tree", "x": 0, "y": 0, "rotation": 0,
			  "blocksMovement": true, "scale": 2.5 }
		]}
	}`

	z := loadScaleZone(t, doc)
	require.NotNil(t, z.Props[0].Scale)
	assert.EqualValues(t, 2.5, *z.Props[0].Scale)

	b := z.Props[0].VisualBody()
	assert.EqualValues(t, 2.5, b.Radius)
	// The circle form must stay the circle form — a scaled radius must never
	// leak into width/height and turn the prop into a rect.
	assert.False(t, b.IsRect())
	assert.Zero(t, b.Width)
	assert.Zero(t, b.Height)
}

func TestPropScale_ScalesBothRectAxesAndKeepsTheAspect(t *testing.T) {
	const doc = `{
		"name": "Scale",
		"bounds": { "width": 60, "height": 40 },
		"props": {"default": [
			{ "type": "House", "x": 0, "y": 0, "rotation": 0,
			  "blocksMovement": true, "scale": 2 }
		]}
	}`

	z := loadScaleZone(t, doc)
	b := z.Props[0].VisualBody()
	assert.True(t, b.IsRect())
	assert.EqualValues(t, 8, b.Width)
	assert.EqualValues(t, 6, b.Height)
	assert.Zero(t, b.Radius)
	// The aspect is the whole reason this is a multiplier and not terrain's
	// single absolute size (D1).
	assert.InDelta(t, 4.0/3.0, float64(b.Width/b.Height), 1e-6)
}

// The type is still the source of truth: rescaling house.json moves every
// house, scaled placements included.
func TestPropScale_MultipliesTheTypeNotAnAbsoluteSize(t *testing.T) {
	const doc = `{
		"name": "Scale",
		"bounds": { "width": 60, "height": 40 },
		"props": {"default": [
			{ "type": "House", "x": 0, "y": 0, "rotation": 0,
			  "blocksMovement": true, "scale": 2 }
		]}
	}`
	z, err := LoadZoneFS(mapFS(doc), "", newFakeMobRegistry(), &bodiedPropRegistry{
		byName: map[string]*PropDefinition{
			// The same placement against a retuned type.
			"House": {Name: "House", Body: PropBody{Width: 6, Height: 3}},
		},
	})
	require.NoError(t, err)
	assert.EqualValues(t, 12, z.Props[0].VisualBody().Width)
}

func TestPropScale_RejectsOutOfRange(t *testing.T) {
	cases := []struct {
		name  string
		scale string
	}{
		{"zero is not 'inherit' — an inheriting prop authors no key", "0"},
		{"negative", "-1"},
		{"just past the rail", "10.1"},
		{"far past the rail", "500"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			doc := `{
				"name": "Scale",
				"bounds": { "width": 60, "height": 40 },
				"props": {"default": [
					{ "type": "Tree", "x": 0, "y": 0, "rotation": 0,
					  "blocksMovement": true, "scale": ` + tc.scale + ` }
				]}
			}`
			_, err := LoadZoneFS(mapFS(doc), "", newFakeMobRegistry(), scaleRegistry())
			require.Error(t, err)
			assert.Contains(t, err.Error(), "prop props.default[0]: scale")
			assert.Contains(t, err.Error(), "must be in (0, 10]")
		})
	}
}

// The rail itself is inclusive — 10 is authorable, 10.1 is not.
func TestPropScale_AcceptsTheRailExactly(t *testing.T) {
	const doc = `{
		"name": "Scale",
		"bounds": { "width": 60, "height": 40 },
		"props": {"default": [
			{ "type": "Tree", "x": 0, "y": 0, "rotation": 0,
			  "blocksMovement": true, "scale": 10 }
		]}
	}`
	z := loadScaleZone(t, doc)
	assert.EqualValues(t, 10, z.Props[0].VisualBody().Radius)
}

// The index in the message is what an author uses to find the offender, so it
// is worth pinning that it is the PROP index and not a spawn's — and, since
// plan-prop-draw-order.md P3, the index INSIDE the layer's array, as the file
// spells it, never the flattened one (3 here) that no author can find.
func TestPropScale_ErrorNamesTheOffendingIndex(t *testing.T) {
	const doc = `{
		"name": "Scale",
		"bounds": { "width": 60, "height": 40 },
		"props": {"default": [
			{ "type": "Tree", "x": 0, "y": 0, "rotation": 0, "blocksMovement": true },
			{ "type": "Tree", "x": 1, "y": 1, "rotation": 0, "blocksMovement": true }
		], "canopy": [
			{ "type": "Tree", "x": 3, "y": 3, "rotation": 0, "blocksMovement": true },
			{ "type": "Tree", "x": 2, "y": 2, "rotation": 0,
			  "blocksMovement": true, "scale": -3 }
		]}
	}`
	_, err := LoadZoneFS(mapFS(doc), "", newFakeMobRegistry(), scaleRegistry())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "prop props.canopy[1]: scale -3")
}

// The C1b rule for rect props, against the REAL api/props content: they never
// had a client size factor, so they carry no collisionFactor either; their body
// is both footprints.
//
// The per-class half of the old C1b migration pin (Tree, Rock and Boulder kept
// their pre-C1b look and collider) is retired: `bc8bd1be` (2026-09-17) resized
// the Tree and Boulder bodies on purpose, and today's sizes are ruled, not a
// migration result (PO 2026-11-01).
func TestPropContent_RectPropsCollideAtTheirOwnSize(t *testing.T) {
	reg, err := PropRegistryFromFS(os.DirFS("../../../../api/props"))
	require.NoError(t, err)

	for _, name := range []string{"House", "GateWall"} {
		def, err := reg.GetByName(name)
		require.NoError(t, err)
		assert.Nil(t, def.Body.CollisionFactor, "%s needs no collision factor", name)
		assert.Equal(t, def.Body, def.Body.Collision(), "%s collides at its own size", name)
	}
}
