package world

import (
	"testing"
	"testing/fstest"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func regionListFS(doc string) fstest.MapFS {
	return fstest.MapFS{RegionListFile: {Data: []byte(doc)}}
}

const regionTri = `[{"x":0,"y":0},{"x":9,"y":0},{"x":9,"y":9}]`

func parseRegions(regions string) (*Zone, error) {
	return parseZone([]byte(`{"name":"R","bounds":{"width":60,"height":40},"regions":[` + regions + `]}`))
}

// plan-region-identity.md D2: api/regions/regions.json holds every place's id,
// title and optional subtitle, in file order.
func TestRegionList_LoadsIDsTitlesAndSubtitles(t *testing.T) {
	list, err := LoadRegionList(regionListFS(`{"regions": [
		{"id": "home", "title": "Home", "subtitle": "Where it began"},
		{"id": "away", "title": "Away"}]}`))
	require.NoError(t, err)
	assert.Equal(t, []RegionName{
		{ID: "home", Title: "Home", Subtitle: "Where it began"},
		{ID: "away", Title: "Away"},
	}, list)
}

func TestRegionList_RefusesABadList(t *testing.T) {
	for _, tc := range []struct{ doc, want string }{
		{`{"regions": []}`, `lists no regions`},
		{`{"regions": [{"id": "Home", "title": "H"}]}`, `region 0: id "Home" must be a slug`},
		{`{"regions": [{"id": "", "title": "H"}]}`, `region 0: id "" must be a slug`},
		{`{"regions": [{"id": "a", "title": "A"}, {"id": "a", "title": "B"}]}`, `region 1: duplicate id "a"`},
		{`{"regions": [{"id": "a", "title": "  "}]}`, `region 0 ("a"): title must not be empty`},
		{`{"regions": [{"id": "a", "subtitle": "Orphan"}]}`, `region 0 ("a"): title must not be empty`},
		{`{"regions": [{"id": "a", "title": "A", "profile": "Fields"}]}`, `unknown field "profile"`},
	} {
		_, err := LoadRegionList(regionListFS(tc.doc))
		require.Error(t, err, tc.doc)
		assert.Contains(t, err.Error(), tc.want, tc.doc)
	}

	_, err := LoadRegionList(fstest.MapFS{})
	require.Error(t, err)
	assert.Contains(t, err.Error(), RegionListFile)
}

// D1: a region carries an id, a profile, or both. Never neither.
func TestRegion_CarriesAnIDAProfileOrBoth(t *testing.T) {
	z, err := parseRegions(`{"id":"home","profile":"Fields","points":` + regionTri + `}`)
	require.NoError(t, err)
	assert.Equal(t, "home", z.Regions[0].ID)
	assert.Equal(t, "Fields", z.Regions[0].Profile)

	z, err = parseRegions(`{"id":"home","points":` + regionTri + `}`)
	require.NoError(t, err, "an id-only region names a place and paints nothing")
	assert.Empty(t, z.Regions[0].Profile)

	z, err = parseRegions(`{"profile":"Fields","points":` + regionTri + `}`)
	require.NoError(t, err, "a profile-only region is a ground patch, today's untitled region")
	assert.Empty(t, z.Regions[0].ID)

	for _, neither := range []string{
		`{"points":` + regionTri + `}`,
		`{"profile":"","points":` + regionTri + `}`,
		`{"id":"","points":` + regionTri + `}`,
	} {
		_, err = parseRegions(neither)
		assert.EqualError(t, err, `region 0: needs an id, a profile, or both`, neither)
	}
}

func TestRegion_RefusesABlankProfileOrAMalformedID(t *testing.T) {
	_, err := parseRegions(`{"id":"home","profile":"   ","points":` + regionTri + `}`)
	assert.EqualError(t, err, `region 0: profile must not be blank (omit it for a region that paints no ground)`)

	_, err = parseRegions(`{"id":"Home Farm","points":` + regionTri + `}`)
	assert.EqualError(t, err, `region 0: id "Home Farm" must be a slug of a-z, 0-9 and '-' (e.g. "reinhards-farm")`)
}

// ⛔ The title moved to the list (D2). A file still carrying it is refused by
// name, so a stale zone can never boot with its banners silently gone.
func TestRegion_RefusesTheRetiredTitleKeys(t *testing.T) {
	for _, key := range []string{"title", "subtitle"} {
		_, err := parseRegions(`{"profile":"Fields","points":` + regionTri + `,"` + key + `":"X"}`)
		require.Error(t, err, key)
		assert.Contains(t, err.Error(), `unknown field "`+key+`"`)
	}
}

// Every drawn id must be listed (a hard finding); several polygons may share
// one (D3), across zones and areas alike.
func TestCrossValidateRegionIDs_RefusesAnUnlistedID(t *testing.T) {
	z, err := parseZone([]byte(`{"name": "X", "bounds": {"width": 60, "height": 40},
		"regions": [{"id": "home", "points": ` + regionTri + `}, {"profile": "Dirt", "points": ` + regionTri + `}],
		"areas": [{"id": "a", "regions": [{"id": "home", "points": ` + regionTri + `}, {"id": "hom", "points": ` + regionTri + `}]}]}`))
	require.NoError(t, err)
	z.ID = "world"

	list := []RegionName{{ID: "home", Title: "Home"}, {ID: "hom", Title: "Typo"}}
	undrawn, err := CrossValidateRegionIDs(list, []*Zone{z})
	require.NoError(t, err)
	assert.Empty(t, undrawn)

	_, err = CrossValidateRegionIDs([]RegionName{{ID: "home", Title: "Home"}}, []*Zone{z})
	require.Error(t, err)
	assert.Equal(t, `zone "world": region 1 in area "a": id "hom" is not in api/regions/regions.json `+
		`(add it there and regenerate the Tiled palette, or pick a listed one)`, err.Error())
}

// A listed id no zone draws is a WARNING, not a finding: nothing can reference
// an id in R1, the debug zone set draws none of the shipped ones, and a place
// may be listed before it is drawn. (R2 makes a QUEST naming an undrawn id an
// error: that is the real hazard, a goal nobody can reach.)
func TestCrossValidateRegionIDs_WarnsOfAnUndrawnID(t *testing.T) {
	z, err := parseRegions(`{"id":"home","points":` + regionTri + `}`)
	require.NoError(t, err)
	z.ID = "world"

	undrawn, err := CrossValidateRegionIDs(
		[]RegionName{{ID: "home", Title: "Home"}, {ID: "elsewhere", Title: "Elsewhere"}}, []*Zone{z})
	require.NoError(t, err)
	assert.Equal(t, []string{"elsewhere"}, undrawn)
}
