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
		"props": [
			{ "type": "Tree", "x": 0, "y": 0, "rotation": 0, "blocksMovement": true },
			{ "type": "House", "x": 5, "y": 5, "rotation": 0, "blocksMovement": true }
		]
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
		"props": [
			{ "type": "Tree", "x": 0, "y": 0, "rotation": 0,
			  "blocksMovement": true, "scale": 2.5 }
		]
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
		"props": [
			{ "type": "House", "x": 0, "y": 0, "rotation": 0,
			  "blocksMovement": true, "scale": 2 }
		]
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
		"props": [
			{ "type": "House", "x": 0, "y": 0, "rotation": 0,
			  "blocksMovement": true, "scale": 2 }
		]
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
				"props": [
					{ "type": "Tree", "x": 0, "y": 0, "rotation": 0,
					  "blocksMovement": true, "scale": ` + tc.scale + ` }
				]
			}`
			_, err := LoadZoneFS(mapFS(doc), "", newFakeMobRegistry(), scaleRegistry())
			require.Error(t, err)
			assert.Contains(t, err.Error(), "prop 0: scale")
			assert.Contains(t, err.Error(), "must be in (0, 10]")
		})
	}
}

// The rail itself is inclusive — 10 is authorable, 10.1 is not.
func TestPropScale_AcceptsTheRailExactly(t *testing.T) {
	const doc = `{
		"name": "Scale",
		"bounds": { "width": 60, "height": 40 },
		"props": [
			{ "type": "Tree", "x": 0, "y": 0, "rotation": 0,
			  "blocksMovement": true, "scale": 10 }
		]
	}`
	z := loadScaleZone(t, doc)
	assert.EqualValues(t, 10, z.Props[0].VisualBody().Radius)
}

// The index in the message is what an author uses to find the offender, so it
// is worth pinning that it is the PROP index and not a spawn's.
func TestPropScale_ErrorNamesTheOffendingIndex(t *testing.T) {
	const doc = `{
		"name": "Scale",
		"bounds": { "width": 60, "height": 40 },
		"props": [
			{ "type": "Tree", "x": 0, "y": 0, "rotation": 0, "blocksMovement": true },
			{ "type": "Tree", "x": 1, "y": 1, "rotation": 0, "blocksMovement": true },
			{ "type": "Tree", "x": 2, "y": 2, "rotation": 0,
			  "blocksMovement": true, "scale": -3 }
		]
	}`
	_, err := LoadZoneFS(mapFS(doc), "", newFakeMobRegistry(), scaleRegistry())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "prop 2: scale -3")
}

// ⭐ The C1b migration pin, against the REAL api/props content.
//
// C1b inverted what an authored body means: it used to be the collider, with
// the client inflating the sprite by a hardcoded per-class factor
// (`size * 1.15 + character.size` for trees, `* 1.07` for minerals); it is now
// the VISUAL footprint, with `collisionFactor` shrinking the collider back.
//
// The whole point of the migration was that NEITHER end moves: the world looks
// the same and walks the same. Those two claims are only true if the authored
// numbers are right, and no other test would notice a typo in them — the client
// side of the equation is untestable here, so this pins the server side against
// the constants the client used to apply.
func TestPropContent_C1bMigrationPreservesLookAndCollision(t *testing.T) {
	const px = 120                    // client-data/BasicConfig.ts PIXEL_PER_METER
	const characterSizePx = 0.25 * px // meter2px(PLAYER_COLLIDER_RADIUS_METERS)

	reg, err := PropRegistryFromFS(os.DirFS("../../../../api/props"))
	require.NoError(t, err)

	cases := []struct {
		prop string
		// what the sprite USED to be drawn at, in px, from the pre-C1b client
		wasSpritePx float64
		// the collider it USED to have, in units — its whole authored body
		wasColliderUnits float64
	}{
		// Resources.ts Tree: size*1.15 + character.size, over a 1.0 body
		{"Tree", 1.0*px*1.15 + characterSizePx, 1.0},
		// Resources.ts Mineral: size*1.07, over 0.5 and 1.5 bodies
		{"Rock", 0.5 * px * 1.07, 0.5},
		{"Boulder", 1.5 * px * 1.07, 1.5},
	}
	for _, tc := range cases {
		t.Run(tc.prop, func(t *testing.T) {
			def, err := reg.GetByName(tc.prop)
			require.NoError(t, err)

			// The sprite is now drawn at exactly the visual radius, with no
			// client-side factor — so the visual body must equal what the old
			// formula produced, or every one of these props changes size.
			assert.InDelta(t, tc.wasSpritePx, float64(def.Body.VisualRadius())*px, 0.5,
				"%s would change size on screen", tc.prop)

			// And the collider must not have moved at all.
			assert.InDelta(t, tc.wasColliderUnits, float64(def.Body.Collision().Radius), 1e-4,
				"%s would change what it blocks", tc.prop)
		})
	}

	// The rect props never had a client factor, so they must NOT have grown a
	// collision factor either — their body already was both footprints.
	for _, name := range []string{"House", "GateWall"} {
		def, err := reg.GetByName(name)
		require.NoError(t, err)
		assert.Nil(t, def.Body.CollisionFactor, "%s needs no collision factor", name)
		assert.Equal(t, def.Body, def.Body.Collision(), "%s collides at its own size", name)
	}
}
