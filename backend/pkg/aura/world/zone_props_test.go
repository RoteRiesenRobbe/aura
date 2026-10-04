package world

import (
	"reflect"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ⭐ D5's pin (plan-prop-draw-order.md): the flattened order IS the spawn order,
// and so the draw order. Layers bottom to top, each in file order — whatever
// order the file happens to write the keys in.
func TestZone_PropLayersFlattenInRankThenFileOrder(t *testing.T) {
	const doc = `{
		"name": "Layers", "bounds": { "width": 60, "height": 40 },
		"props": {
			"canopy":    [ {"type": "C1", "x": 0, "y": 0}, {"type": "C2", "x": 0, "y": 0} ],
			"buildings": [ {"type": "B1", "x": 0, "y": 0} ],
			"default":   [ {"type": "D1", "x": 0, "y": 0}, {"type": "D2", "x": 0, "y": 0} ],
			"underfoot": [ {"type": "U1", "x": 0, "y": 0} ]
		}
	}`
	z, err := LoadZoneFS(mapFS(doc), "", newFakeMobRegistry(),
		newFakePropRegistry("C1", "C2", "B1", "D1", "D2", "U1"))
	require.NoError(t, err)

	var got []string
	for _, p := range z.Props {
		got = append(got, p.Layer+"/"+p.Type)
	}
	assert.Equal(t, []string{
		"underfoot/U1",
		"default/D1", "default/D2",
		"buildings/B1",
		"canopy/C1", "canopy/C2",
	}, got)
	// One copy of every placement: the nested form is emptied once flattened,
	// so nothing can read a stale second list (Place moves Props only).
	assert.Equal(t, PropLayers{}, z.PropLayers)
}

// The struct's field order is what the client and the Tiled converter mirror
// (AuraTiledConvert.test.ts scrapes it), so it must be the order flatten walks.
// A field reordered in the struct but not in flatten would let the mirrors pass
// while disagreeing with the server.
func TestPropLayers_StructOrderIsTheRank(t *testing.T) {
	var tags []string
	ty := reflect.TypeFor[PropLayers]()
	for i := range ty.NumField() {
		tags = append(tags, ty.Field(i).Tag.Get("json"))
	}
	assert.Equal(t, []string{PropLayerUnderfoot, PropLayerDefault, PropLayerBuildings, PropLayerCanopy}, tags)

	one := Prop{Type: "X"}
	l := PropLayers{Underfoot: []Prop{one}, Default: []Prop{one}, Buildings: []Prop{one}, Canopy: []Prop{one}}
	var walked []string
	for _, p := range flattenProps([]Area{{Objects: Objects{PropLayers: l}}}) {
		walked = append(walked, p.Layer)
	}
	assert.Equal(t, tags, walked)
}

// D2: the vocabulary is fixed. A layer name the server does not know refuses
// the boot by name instead of dropping its props.
func TestZone_UnknownPropLayerIsRefused(t *testing.T) {
	_, err := parseZone([]byte(`{"name": "X", "bounds": {"width": 60, "height": 40},
		"props": {"roof": [ {"type": "Rock", "x": 0, "y": 0} ]}}`))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "roof")
}

// L2: no compatibility window. A zone file still in the pre-P3 flat shape
// refuses rather than loading with no props.
func TestZone_FlatPropsArrayIsRefused(t *testing.T) {
	_, err := parseZone([]byte(`{"name": "X", "bounds": {"width": 60, "height": 40},
		"props": [ {"type": "Rock", "x": 0, "y": 0} ]}`))
	require.Error(t, err)
	assert.True(t, strings.Contains(err.Error(), "props"), err.Error())
}
