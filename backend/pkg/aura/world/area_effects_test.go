package world

import (
	"strings"
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ---- the key, parsed and validated (plan-area-effects.md E1) ---------------

// ⭐ ONE fixture carrying the key on ALL THREE arrays, deliberately. Each array
// is its own struct and its own validate() loop, so a fixture that exercised
// only the polygon would leave two thirds of the feature unpinned with this test
// green — the trap the vitest completeness pin documents in the other direction.
func TestAreaEffectParsesOnEveryShape(t *testing.T) {
	const doc = `{
		"name": "Hazards",
		"bounds": { "width": 60, "height": 40 },
		"paths": [
			{ "profile": "Water", "width": 2, "effect": "Blight",
			  "points": [{"x":-10,"y":-10},{"x":10,"y":-10}] }
		],
		"polygons": [
			{ "profile": "Lava", "effect": "Immolate",
			  "points": [{"x":0,"y":0},{"x":5,"y":0},{"x":5,"y":5}] }
		],
		"atmospheres": [
			{ "profile": "Fog", "effect": "Envenom",
			  "points": [{"x":1,"y":1},{"x":6,"y":1},{"x":6,"y":6}] }
		]
	}`
	z, err := parseZone([]byte(doc))
	require.NoError(t, err)
	assert.Equal(t, "Blight", z.Paths[0].Effect)
	assert.Equal(t, "Immolate", z.Polygons[0].Effect)
	assert.Equal(t, "Envenom", z.Atmospheres[0].Effect)
}

// ⭐ D10, and it is the acceptance criterion for the whole chunk: the feature
// costs exactly zero until authored. Every zone shipped before this names no
// effect, so all three fields must read as the empty string with nothing
// refused — the bar `blend`, `scroll` and `closed` were all held to.
func TestShapesWithoutAnEffectAreInert(t *testing.T) {
	const doc = `{
		"name": "Plain",
		"bounds": { "width": 60, "height": 40 },
		"paths": [{ "profile": "Road", "width": 2,
		            "points": [{"x":-10,"y":-10},{"x":10,"y":-10}] }],
		"polygons": [{ "profile": "Mountains",
		               "points": [{"x":0,"y":0},{"x":5,"y":0},{"x":5,"y":5}] }],
		"atmospheres": [{ "profile": "Fog",
		                  "points": [{"x":1,"y":1},{"x":6,"y":1},{"x":6,"y":6}] }]
	}`
	z, err := LoadZoneFS(mapFS(doc), "", newFakeMobRegistry(), newFakePropRegistry())
	require.NoError(t, err)
	assert.Empty(t, z.Paths[0].Effect)
	assert.Empty(t, z.Polygons[0].Effect)
	assert.Empty(t, z.Atmospheres[0].Effect)
}

// ⛔ PRESENT AND BLANK is not absent, and the two must not be confused. Absent
// means "no effect"; a whitespace string means somebody blanked the field, and
// leaving that to the registry lookup would report `unknown effect ""` — true
// and useless. Each shape gets its own case because each has its own loop.
func TestBlankEffectIsRefusedOnEveryShape(t *testing.T) {
	cases := []struct{ name, doc, want string }{
		{"path", `{"name":"Z","bounds":{"width":60,"height":40},
			"paths":[{"profile":"Water","width":2,"effect":"  ",
			          "points":[{"x":0,"y":0},{"x":4,"y":0}]}]}`, "path 0: effect"},
		{"polygon", `{"name":"Z","bounds":{"width":60,"height":40},
			"polygons":[{"profile":"Lava","effect":" ",
			             "points":[{"x":0,"y":0},{"x":4,"y":0},{"x":4,"y":4}]}]}`, "polygon 0: effect"},
		{"atmosphere", `{"name":"Z","bounds":{"width":60,"height":40},
			"atmospheres":[{"profile":"Fog","effect":"\t",
			                "points":[{"x":0,"y":0},{"x":4,"y":0},{"x":4,"y":4}]}]}`, "atmosphere 0: effect"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			_, err := LoadZoneFS(mapFS(c.doc), "", newFakeMobRegistry(), newFakePropRegistry())
			require.Error(t, err)
			assert.Contains(t, err.Error(), c.want)
			// ⚑ The message has to say what to DO. "effect is blank" on its own
			// sends the author looking for a valid blank value.
			assert.Contains(t, err.Error(), "leave the key out")
		})
	}
}

// ---- the boot-time name check (CrossValidateAreaEffects) -------------------

// fakeSkills answers only for the names it was built with, exactly as the real
// registry does.
type fakeSkills struct{ names map[string]bool }

func newFakeSkills(names ...string) fakeSkills {
	m := map[string]bool{}
	for _, n := range names {
		m[n] = true
	}
	return fakeSkills{names: m}
}

func (f fakeSkills) GetByName(name string) (*skills.SkillDefinition, error) {
	if !f.names[name] {
		return nil, assert.AnError
	}
	return &skills.SkillDefinition{Name: name}, nil
}

// ⚑ Built through the LOADER rather than by hand, so the shapes have been
// through validate() first — the same order boot runs the two passes in.
func zoneWithEffects(t *testing.T, id, doc string) *Zone {
	t.Helper()
	z, err := LoadZoneFS(mapFS(doc), "", newFakeMobRegistry(), newFakePropRegistry())
	require.NoError(t, err)
	z.ID = id
	return z
}

const effectDoc = `{
	"name": "Hazards",
	"bounds": { "width": 60, "height": 40 },
	"paths": [{ "profile": "Water", "width": 2, "effect": "Blight",
	            "points": [{"x":-10,"y":-10},{"x":10,"y":-10}] }],
	"polygons": [{ "profile": "Lava", "effect": "Immolate",
	               "points": [{"x":0,"y":0},{"x":5,"y":0},{"x":5,"y":5}] }],
	"atmospheres": [{ "profile": "Fog", "effect": "Envenom",
	                  "points": [{"x":1,"y":1},{"x":6,"y":1},{"x":6,"y":6}] }]
}`

func TestCrossValidateAreaEffects_AcceptsNamesTheRegistryKnows(t *testing.T) {
	z := zoneWithEffects(t, "hazards", effectDoc)
	sr := newFakeSkills("Blight", "Immolate", "Envenom")
	require.NoError(t, CrossValidateAreaEffects(sr, []*Zone{z}))
}

// ⭐ THE LEG THE CHUNK EXISTS FOR. A misnamed effect draws a pool that looks
// dangerous and does nothing — the failure the loader ethos is written against
// — so it refuses the boot rather than warning.
//
// ⚑ One case per array, and each one leaves exactly ONE name out of the
// registry: a pass that walked only `polygons` would sail through a fixture
// that broke every name at once.
func TestCrossValidateAreaEffects_RefusesAnUnknownNameOnEveryShape(t *testing.T) {
	all := []string{"Blight", "Immolate", "Envenom"}
	cases := []struct{ name, missing, wantKind string }{
		{"path", "Blight", "path 0"},
		{"polygon", "Immolate", "polygon 0"},
		{"atmosphere", "Envenom", "atmosphere 0"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			var known []string
			for _, n := range all {
				if n != c.missing {
					known = append(known, n)
				}
			}
			z := zoneWithEffects(t, "hazards", effectDoc)
			err := CrossValidateAreaEffects(newFakeSkills(known...), []*Zone{z})
			require.Error(t, err)
			assert.Contains(t, err.Error(), c.wantKind)
			// ⚑ It NAMES the effect, the zone and where effects live. "unknown
			// effect" on its own is true and useless — the posture the crossed
			// profile message already takes in Tiled.
			assert.Contains(t, err.Error(), strconvQuote(c.missing))
			assert.Contains(t, err.Error(), "hazards")
			assert.Contains(t, err.Error(), "api/skills/")
		})
	}
}

// strconvQuote keeps the assertions above readable without importing strconv
// for one call: the message quotes the name, and the quotes are the half that
// makes it searchable.
func strconvQuote(s string) string { return `"` + s + `"` }

// ⭐ D10 again, at boot level: the whole shipped world authors no effect, so the
// pass must be a no-op over it — and must not reach for the registry at all.
// ⚑ A nil registry is the strongest way to say so: a pass that looked something
// up anyway would panic rather than pass for a subtler reason.
func TestCrossValidateAreaEffects_NeverLooksUpAnythingForAnInertZone(t *testing.T) {
	z := zoneWithEffects(t, "world", `{
		"name": "Plain", "bounds": { "width": 60, "height": 40 },
		"polygons": [{ "profile": "Mountains",
		               "points": [{"x":0,"y":0},{"x":5,"y":0},{"x":5,"y":5}] }],
		"atmospheres": [{ "profile": "Fog",
		                  "points": [{"x":1,"y":1},{"x":6,"y":1},{"x":6,"y":6}] }]
	}`)
	require.NoError(t, CrossValidateAreaEffects(nil, []*Zone{z}))
}

// ⚑ Every zone in the SET, not only the first. The pass takes the placed set
// because that is what loadZones holds, and a cave authored with a typo has to
// refuse the boot even when the overworld is clean.
func TestCrossValidateAreaEffects_ChecksEveryZoneInTheSet(t *testing.T) {
	clean := zoneWithEffects(t, "world", `{"name":"A","bounds":{"width":60,"height":40}}`)
	broken := zoneWithEffects(t, "underworld", `{"name":"B","bounds":{"width":60,"height":40},
		"atmospheres":[{"profile":"Miasma","effect":"NoSuchSkill",
		                "points":[{"x":0,"y":0},{"x":4,"y":0},{"x":4,"y":4}]}]}`)
	err := CrossValidateAreaEffects(newFakeSkills("Blight"), []*Zone{clean, broken})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "underworld")
	assert.True(t, strings.Contains(err.Error(), "NoSuchSkill"))
}
