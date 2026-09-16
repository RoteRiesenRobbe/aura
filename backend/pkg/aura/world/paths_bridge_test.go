package world

import (
	"testing"
	"testing/fstest"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The conflict refusal below needs a RESOLVED zone, so it goes through
// LoadZoneFS rather than parseZone — which is the whole point: the check cannot
// live in validate(), because validate() runs before Def is bound.

type bridgeMobRegistry struct{}

func (bridgeMobRegistry) Get(mobs.MobID) (*mobs.MobDefinition, error) { return nil, errNoSuchMob }
func (bridgeMobRegistry) GetByName(string) (*mobs.MobDefinition, error) {
	return nil, errNoSuchMob
}
func (bridgeMobRegistry) Mobs() []*mobs.MobDefinition { return nil }

type noSuchMob struct{}

func (noSuchMob) Error() string { return "no such mob" }

var errNoSuchMob = noSuchMob{}

type bridgePropRegistry struct{}

func (bridgePropRegistry) GetByName(name string) (*PropDefinition, error) {
	switch name {
	case "Bridge":
		// A REAL bridge: crossesPaths and walk-through, which is the only
		// combination parsePropDefinition now lets a file author.
		return &PropDefinition{Name: "Bridge", Body: PropBody{Width: 4, Height: 10},
			CrossesPaths: true, BlocksMovement: boolPtr(false)}, nil
	case "House":
		return &PropDefinition{Name: "House", Body: PropBody{Width: 4, Height: 3}}, nil
	}
	return nil, errNoSuchMob
}
func (bridgePropRegistry) Props() []*PropDefinition { return nil }

func loadBridgeZone(doc string) (*Zone, error) {
	return LoadZoneFS(fstest.MapFS{"zone.json": {Data: []byte(doc)}}, "",
		bridgeMobRegistry{}, bridgePropRegistry{})
}

// ⛔ A bridge that blocks is a bridge you cannot cross: it clears the water
// under its deck and then walls that same deck with its own body. BOTH authored
// values are individually legal, which is exactly why this has to be refused out
// loud rather than left to be discovered by walking there.
func TestCrossingPropThatAlsoBlocksIsRefused(t *testing.T) {
	_, err := loadBridgeZone(`{
		"name": "P", "bounds": {"width": 60, "height": 40},
		"props": [{"type":"Bridge","x":0,"y":0,"rotation":0,"blocksMovement":true}]
	}`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "prop 0")
	assert.Contains(t, err.Error(), "crosses paths")
}

// The same prop authored the way a bridge is meant to be authored loads fine.
func TestCrossingPropWithoutBlockingLoads(t *testing.T) {
	z, err := loadBridgeZone(`{
		"name": "P", "bounds": {"width": 60, "height": 40},
		"props": [{"type":"Bridge","x":0,"y":0,"rotation":0,"blocksMovement":false}]
	}`)
	require.NoError(t, err)
	require.Len(t, z.Props, 1)
	assert.True(t, z.Props[0].Def.CrossesPaths)
}

// An ordinary prop is entirely unaffected by the new rule — blocking props are
// the overwhelming majority of the 777 placements in the shipped world.
func TestOrdinaryBlockingPropStillLoads(t *testing.T) {
	_, err := loadBridgeZone(`{
		"name": "P", "bounds": {"width": 60, "height": 40},
		"props": [{"type":"House","x":0,"y":0,"rotation":0,"blocksMovement":true}]
	}`)
	require.NoError(t, err)
}

// ⚑ crossesPaths is a DEFINITION field, and parsePropDefinition uses
// DisallowUnknownFields — so the doc struct and the exported struct must move
// together. This pins that they did.
func TestPropDefinitionParsesCrossesPaths(t *testing.T) {
	def, err := parsePropDefinition([]byte(`{
		"name": "Bridge", "entityType": "House", "sprite": "bridge.png",
		"body": { "width": 6, "height": 2 },
		"crossesPaths": true,
		"underfoot": true,
		"blocksMovement": false
	}`))
	require.NoError(t, err)
	assert.True(t, def.CrossesPaths)

	// Absent is false: every prop authored before this stays an ordinary prop.
	plain, err := parsePropDefinition([]byte(`{
		"name": "Rock", "entityType": "Stone", "sprite": "stone.png",
		"body": { "radius": 1 }
	}`))
	require.NoError(t, err)
	assert.False(t, plain.CrossesPaths)
}

// ⛔ A bridge that draws OVER the player is the defect this refuses (PO
// 2026-09-16). crossesPaths says "walk across me"; underfoot says "and I draw
// below you while you do" — the second does not follow from the first by
// itself, so authoring the one without the other is refused rather than
// quietly rendering a deck on top of the character crossing it.
func TestCrossesPathsWithoutUnderfootIsRefused(t *testing.T) {
	_, err := parsePropDefinition([]byte(`{
		"name": "Bridge", "entityType": "House", "sprite": "bridge.png",
		"body": { "width": 6, "height": 2 },
		"crossesPaths": true, "blocksMovement": false
	}`))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "underfoot")
}

// ⚑ The implication runs ONE WAY, and this is what keeps the render field from
// collapsing into crossesPaths: a dock, a jetty or a plank walkway is walked on
// and crosses nothing at all.
func TestUnderfootAloneIsLegal(t *testing.T) {
	def, err := parsePropDefinition([]byte(`{
		"name": "Dock", "entityType": "House", "sprite": "house.svg",
		"body": { "width": 4, "height": 2 },
		"underfoot": true
	}`))
	require.NoError(t, err)
	assert.False(t, def.CrossesPaths)
}

/* ---- the placement's tri-state against the type's default ------------------
 * plan: "props block by default — the type decides, the placement overrides".
 * Prop.Blocks() is the ONE seam where the two layers meet, so these pin it
 * directly rather than through a collision body three packages away.
 */

func boolPtr(v bool) *bool { return &v }

// ⭐ THE DEFECT THIS WHOLE CHANGE EXISTS FOR: a prop dragged fresh in Tiled
// authors nothing, and before this it silently meant "walk through me".
func TestPropPlacementInheritsBlockingFromItsType(t *testing.T) {
	z, err := loadBridgeZone(`{
		"name": "P", "bounds": {"width": 60, "height": 40},
		"props": [{"type":"House","x":0,"y":0,"rotation":0}]
	}`)
	require.NoError(t, err)
	require.Len(t, z.Props, 1)
	assert.Nil(t, z.Props[0].BlocksMovement, "an unauthored placement must stay unauthored")
	assert.True(t, z.Props[0].Blocks())
}

// The other direction: a type that walks through hands that down too, so a
// bridge does not have to repeat itself on every deck.
func TestPropPlacementInheritsWalkThroughFromItsType(t *testing.T) {
	z, err := loadBridgeZone(`{
		"name": "P", "bounds": {"width": 60, "height": 40},
		"props": [{"type":"Bridge","x":0,"y":0,"rotation":0}]
	}`)
	require.NoError(t, err)
	require.Len(t, z.Props, 1)
	assert.False(t, z.Props[0].Blocks())
}

// An explicit placement wins over the type, both ways — that is what makes it
// an override rather than a second default.
func TestPropPlacementOverridesItsType(t *testing.T) {
	z, err := loadBridgeZone(`{
		"name": "P", "bounds": {"width": 60, "height": 40},
		"props": [{"type":"House","x":0,"y":0,"rotation":0,"blocksMovement":false}]
	}`)
	require.NoError(t, err)
	require.Len(t, z.Props, 1)
	require.NotNil(t, z.Props[0].BlocksMovement)
	assert.False(t, z.Props[0].Blocks(), "an explicit false must beat a blocking type")
}

// ⛔ And the refusal still fires on the OVERRIDE, which is the case the type-level
// rule cannot see: the def is a legal walk-through bridge, and the placement is
// what re-walls it.
func TestCrossingPropRefusedWhenThePlacementOverridesToBlocking(t *testing.T) {
	_, err := loadBridgeZone(`{
		"name": "P", "bounds": {"width": 60, "height": 40},
		"props": [{"type":"Bridge","x":0,"y":0,"rotation":0,"blocksMovement":true}]
	}`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "prop 0")
	assert.Contains(t, err.Error(), "crosses paths")
}
