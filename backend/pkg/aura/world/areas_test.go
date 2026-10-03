package world

import (
	"testing"
	"testing/fstest"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func areaListFS(doc string) fstest.MapFS {
	return fstest.MapFS{AreaListFile: {Data: []byte(doc)}}
}

// D15: api/areas/areas.json is the one list of area ids, in file order.
func TestAreaList_LoadsTheIDsInFileOrder(t *testing.T) {
	ids, err := LoadAreaIDs(areaListFS(`{"areas": ["farmlands", "dark-woods"]}`))
	require.NoError(t, err)
	assert.Equal(t, []string{"farmlands", "dark-woods"}, ids)
}

// The list carries D12's rule for every id it holds, so a zone can only ever
// name a well-formed one.
func TestAreaList_RefusesABadList(t *testing.T) {
	for _, tc := range []struct{ doc, want string }{
		{`{"areas": ["Farmlands"]}`, `area 0: id "Farmlands" must be a slug`},
		{`{"areas": ["a", ""]}`, `area 1: id "" must be a slug`},
		{`{"areas": ["spawns"]}`, `area 0: id "spawns" is the name of an object array`},
		{`{"areas": ["a", "b", "a"]}`, `area 2: duplicate id "a"`},
		{`{"areas": []}`, `lists no areas`},
		{`{"areas": ["a"], "titles": {}}`, `unknown field "titles"`},
	} {
		_, err := LoadAreaIDs(areaListFS(tc.doc))
		require.Error(t, err, tc.doc)
		assert.Contains(t, err.Error(), tc.want, tc.doc)
	}

	_, err := LoadAreaIDs(fstest.MapFS{})
	require.Error(t, err)
	assert.Contains(t, err.Error(), AreaListFile)
}

// A zone may name only a listed area (D15), an empty area included: the id is
// the whole of it, so it is checked whether the area holds anything or not.
func TestCrossValidateAreaIDs_RefusesAnUnlistedArea(t *testing.T) {
	z, err := parseZone([]byte(`{"name": "X", "bounds": {"width": 60, "height": 40},
		"areas": [{"id": "farmlands", "anchors": [{"name": "a", "x": 0, "y": 0}]}, {"id": "dark-wods"}]}`))
	require.NoError(t, err)
	z.ID = "world"
	assert.Equal(t, []string{"farmlands", "dark-wods"}, z.AreaIDs)

	require.NoError(t, CrossValidateAreaIDs([]string{"farmlands", "dark-wods"}, []*Zone{z}))

	err = CrossValidateAreaIDs([]string{"farmlands", "dark-woods"}, []*Zone{z})
	require.Error(t, err)
	assert.Equal(t, `zone "world": area 1: id "dark-wods" is not in api/areas/areas.json `+
		`(add it there and regenerate the Tiled palette, or pick a listed one)`, err.Error())
}
