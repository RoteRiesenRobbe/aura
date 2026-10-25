package world

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The modular roof kit: one drawing per piece, a material per definition. A
// definition may author a "#rrggbb" tint the client multiplies its sprite by;
// absent = 0 = drawn as is.
func TestParsePropDefinition_Tint(t *testing.T) {
	prop := func(extra string) []byte {
		return []byte(`{
		"name": "RoofSpanClay", "entityType": "House", "sprite": "roofSpan.svg",
		"body": { "width": 2, "height": 4 }` + extra + `
	}`)
	}
	def, err := parsePropDefinition(prop(`, "tint": "#c8644a"`))
	require.NoError(t, err)
	assert.Equal(t, uint32(0xc8644a), def.Tint)

	def, err = parsePropDefinition(prop(``))
	require.NoError(t, err)
	assert.Zero(t, def.Tint, "absent = untinted")

	_, err = parsePropDefinition(prop(`, "tint": "#000000"`))
	require.Error(t, err, "black would draw the prop as a silhouette")

	_, err = parsePropDefinition(prop(`, "tint": "clay"`))
	require.Error(t, err, "junk is refused")
}
