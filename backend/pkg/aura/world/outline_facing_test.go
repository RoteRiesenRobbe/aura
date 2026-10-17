package world

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ---- outlineFacing on structures (plan-cliffs.md D6) -----------------------

const facingSquare = `"points":[{"x":-4.3,"y":-3.7},{"x":5.1,"y":-3.7},{"x":5.1,"y":6.2},{"x":-4.3,"y":6.2}]`

func TestOutlineFacingParses(t *testing.T) {
	for _, facing := range []string{"out", "in"} {
		z, err := parseZone([]byte(`{"name":"O","bounds":{"width":60,"height":40},"structures":[
			{"profile":"Mountains","blocksMovement":true,"outlineProfile":"Cliff","outlineWidth":1.5,
			 "outlineFacing":"` + facing + `",` + facingSquare + `}]}`))
		require.NoError(t, err, facing)
		assert.Equal(t, facing, z.Structures[0].OutlineFacing)
	}
}

func TestOutlineFacingIsRefusedWhenItWouldDoNothing(t *testing.T) {
	cases := []struct{ name, structure, want string }{
		{"unknown value",
			`{"profile":"Mountains","outlineProfile":"Cliff","outlineWidth":1.5,"outlineFacing":"up",` + facingSquare + `}`,
			`structure 0: outlineFacing "up" is not one of out, in`},
		// ⛔ A facing with no rim to face is a quiet no-op, refused.
		{"no outline",
			`{"profile":"Mountains","outlineFacing":"out",` + facingSquare + `}`,
			`structure 0: outlineFacing "out" needs an outlineProfile to face`},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			_, err := parseZone([]byte(`{"name":"O","bounds":{"width":60,"height":40},"structures":[` + c.structure + `]}`))
			assert.EqualError(t, err, c.want)
		})
	}
}

// The rim is decoration: collision is byte-identical with and without the key.
func TestOutlineFacingDoesNotChangeTheCollider(t *testing.T) {
	doc := func(extra string) string {
		return `{"name":"O","bounds":{"width":60,"height":40},"structures":[
			{"profile":"Mountains","blocksMovement":true,"outlineProfile":"Cliff","outlineWidth":1.5` +
			extra + `,` + facingSquare + `}]}`
	}
	bare, err := parseZone([]byte(doc("")))
	require.NoError(t, err)
	faced, err := parseZone([]byte(doc(`,"outlineFacing":"in"`)))
	require.NoError(t, err)
	a, _ := PolygonColliders(bare)
	b, _ := PolygonColliders(faced)
	assert.Equal(t, a, b)
}
