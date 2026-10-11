package world

import (
	"testing"
	"testing/fstest"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Roof props (plan-roof-props.md): a TYPE-level `roof` key marks a prop the
// client fades while the local player stands under it. The server never reads
// the reveal opacity; it parses the key so bad content fails at boot, and it
// refuses the combinations that would make a roof you can never get under.

func TestPropDefinition_RoofParses(t *testing.T) {
	def, err := parsePropDefinition([]byte(`{
		"name": "HouseRoof", "entityType": "House", "sprite": "house.svg",
		"body": { "width": 4, "height": 3 },
		"blocksMovement": false,
		"roof": { "revealAlpha": 0.25 }
	}`))
	require.NoError(t, err)
	assert.True(t, def.Roof)

	// `roof: {}` is a roof too: revealAlpha absent means 0, fully hidden.
	bare, err := parsePropDefinition([]byte(`{
		"name": "HouseRoof", "entityType": "House", "sprite": "house.svg",
		"body": { "width": 4, "height": 3 },
		"blocksMovement": false,
		"roof": {}
	}`))
	require.NoError(t, err)
	assert.True(t, bare.Roof)
}

// Absent is not a roof: every prop authored before this keeps drawing opaque.
func TestPropDefinition_NoRoofByDefault(t *testing.T) {
	def, err := parsePropDefinition([]byte(`{
		"name": "House", "entityType": "House", "sprite": "house.svg",
		"body": { "width": 4, "height": 3 }
	}`))
	require.NoError(t, err)
	assert.False(t, def.Roof)
}

func TestPropDefinition_RoofRevealAlphaOutOfRangeIsRefused(t *testing.T) {
	for _, alpha := range []string{"-0.1", "1.5"} {
		_, err := parsePropDefinition([]byte(`{
			"name": "HouseRoof", "entityType": "House", "sprite": "house.svg",
			"body": { "width": 4, "height": 3 },
			"blocksMovement": false,
			"roof": { "revealAlpha": ` + alpha + ` }
		}`))
		require.Error(t, err, alpha)
		assert.Contains(t, err.Error(), "revealAlpha", alpha)
	}
}

// ⚑ DisallowUnknownFields reaches into the roof object too: a typo there
// refuses by name rather than silently meaning "fully hidden".
func TestPropDefinition_RoofUnknownKeyIsRefused(t *testing.T) {
	_, err := parsePropDefinition([]byte(`{
		"name": "HouseRoof", "entityType": "House", "sprite": "house.svg",
		"body": { "width": 4, "height": 3 },
		"blocksMovement": false,
		"roof": { "alpha": 0.25 }
	}`))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "alpha")
}

// ⛔ A roof that blocks is a roof nobody can stand under, so it could never
// reveal. Absent blocksMovement means true, so a roof must say false.
func TestPropDefinition_RoofMustNotBlock(t *testing.T) {
	for _, blocks := range []string{``, `"blocksMovement": true,`} {
		_, err := parsePropDefinition([]byte(`{
			"name": "HouseRoof", "entityType": "House", "sprite": "house.svg",
			"body": { "width": 4, "height": 3 },
			` + blocks + `
			"roof": {}
		}`))
		require.Error(t, err, blocks)
		assert.Contains(t, err.Error(), "roof", blocks)
		assert.Contains(t, err.Error(), "blocksMovement", blocks)
	}
}

// ⛔ The client knows a generated prop only by its streamed entityType, so two
// definitions sharing one must agree on whether it is a roof.
func TestPropRegistry_EntityTypeMustAgreeOnRoof(t *testing.T) {
	fsys := propFS(map[string]string{
		"house.json": `{ "name": "House", "entityType": "House", "sprite": "house.svg",
			"body": { "width": 4, "height": 3 } }`,
		"roof.json": `{ "name": "HouseRoof", "entityType": "House", "sprite": "house.svg",
			"body": { "width": 4, "height": 3 }, "blocksMovement": false, "roof": {} }`,
	})
	_, err := PropRegistryFromFS(fsys)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "House")
	assert.Contains(t, err.Error(), "HouseRoof")
	assert.Contains(t, err.Error(), "roof")
}

// Agreeing definitions are fine, and PropPlaceholder is exempt: its prop_name
// rides the wire, so the client resolves each placeholder by name.
func TestPropRegistry_RoofAgreementAllowsAgreementAndPlaceholders(t *testing.T) {
	fsys := propFS(map[string]string{
		"a.json": `{ "name": "RoofA", "entityType": "House", "sprite": "house.svg",
			"body": { "width": 4, "height": 3 }, "blocksMovement": false, "roof": {} }`,
		"b.json": `{ "name": "RoofB", "entityType": "House", "sprite": "house.svg",
			"body": { "width": 2, "height": 2 }, "blocksMovement": false, "roof": { "revealAlpha": 0.5 } }`,
		"p1.json": `{ "name": "Shed", "entityType": "PropPlaceholder", "sprite": "placeholder.svg",
			"body": { "width": 2, "height": 2 } }`,
		"p2.json": `{ "name": "ShedRoof", "entityType": "PropPlaceholder", "sprite": "placeholder.svg",
			"body": { "width": 2, "height": 2 }, "blocksMovement": false, "roof": {} }`,
	})
	_, err := PropRegistryFromFS(fsys)
	require.NoError(t, err)
}

type roofPropRegistry struct{}

func (roofPropRegistry) GetByName(name string) (*PropDefinition, error) {
	if name == "Roof" {
		return &PropDefinition{Name: "Roof", Body: PropBody{Width: 4, Height: 3},
			BlocksMovement: boolPtr(false), Roof: true}, nil
	}
	return nil, errNoSuchMob
}
func (roofPropRegistry) Props() []*PropDefinition { return nil }

func loadRoofZone(doc string) (*Zone, error) {
	return LoadZoneFS(fstest.MapFS{"zone.json": {Data: []byte(doc)}}, "",
		bridgeMobRegistry{}, roofPropRegistry{})
}

func TestRoofPlacementLoads(t *testing.T) {
	z, err := loadRoofZone(`{
		"name": "P", "bounds": {"width": 60, "height": 40},
		"props": {"buildings": [{"type":"Roof","x":0,"y":0,"rotation":0}]}
	}`)
	require.NoError(t, err)
	require.Len(t, z.Props, 1)
	assert.True(t, z.Props[0].Def.Roof)
}

// ⛔ The type-level rule cannot see a placement that re-walls the roof.
func TestRoofPlacementOverridingToBlockingIsRefused(t *testing.T) {
	_, err := loadRoofZone(`{
		"name": "P", "bounds": {"width": 60, "height": 40},
		"props": {"buildings": [{"type":"Roof","x":0,"y":0,"rotation":0,"blocksMovement":true}]}
	}`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "prop props.buildings[0]")
	assert.Contains(t, err.Error(), "roof")
}

// ⛔ A roof under the characters covers nobody: it is in the wrong layer.
func TestRoofPlacementUnderfootIsRefused(t *testing.T) {
	_, err := loadRoofZone(`{
		"name": "P", "bounds": {"width": 60, "height": 40},
		"props": {"underfoot": [{"type":"Roof","x":0,"y":0,"rotation":0}]}
	}`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "prop props.underfoot[0]")
	assert.Contains(t, err.Error(), "roof")
}
