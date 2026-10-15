package world

import (
	"testing"

	"github.com/stretchr/testify/require"
)

// plan-lightmap.md D6: a light prop may author its own colour; only a valid,
// non-black "#rrggbb" on a prop that casts light loads.
func TestParsePropDefinition_LightColor(t *testing.T) {
	prop := func(extra string) []byte {
		return []byte(`{
		"name": "Torch", "entityType": "House", "sprite": "torch.svg",
		"body": { "radius": 0.2 }` + extra + `
	}`)
	}
	_, err := parsePropDefinition(prop(`, "lightFraction": 0.3, "lightColor": "#ffc070"`))
	require.NoError(t, err)

	_, err = parsePropDefinition(prop(`, "lightFraction": 0.3, "lightColor": "#000000"`))
	require.Error(t, err, "a black light is refused")

	_, err = parsePropDefinition(prop(`, "lightFraction": 0.3, "lightColor": "warm"`))
	require.Error(t, err, "junk is refused")

	_, err = parsePropDefinition(prop(`, "lightColor": "#ffc070"`))
	require.Error(t, err, "a colour on a prop that casts no light is refused")
}

// plan-lightmap.md D12: a light prop may flicker; only one that casts light.
func TestParsePropDefinition_LightFlicker(t *testing.T) {
	prop := func(extra string) []byte {
		return []byte(`{
		"name": "Torch", "entityType": "House", "sprite": "torch.svg",
		"body": { "radius": 0.2 }` + extra + `
	}`)
	}
	_, err := parsePropDefinition(prop(`, "lightFraction": 0.3, "lightFlicker": true`))
	require.NoError(t, err)

	_, err = parsePropDefinition(prop(`, "lightFlicker": true`))
	require.Error(t, err, "flicker on a prop that casts no light is refused")
}
