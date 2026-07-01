package gen

// Repaired 2026-07: the previous version of this file predated API changes
// (registry parameter removed from NewRandomEntityFrom, weight moved into
// the item definition's Generator) and no longer compiled. The tests now
// mirror the hydration that Generate performs and assert actual outcomes
// instead of printing.

import (
	"math/rand"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	apiitems "github.com/trichner/berryhunter/pkg/api/items"
	"github.com/trichner/berryhunter/pkg/berryhunter/items"
	"github.com/trichner/berryhunter/pkg/berryhunter/phy"
	"github.com/trichner/berryhunter/pkg/berryhunter/wrand"
)

func Test_chunkRandIsDeterministicPerChunk(t *testing.T) {
	a := chunkRand(3, 4, rand.New(rand.NewSource(0x1337)))
	b := chunkRand(3, 4, rand.New(rand.NewSource(0x1337)))

	assert.Equal(t, a.Float32(), b.Float32(),
		"the same chunk with the same world seed must generate identically")
}

// hydratedEntities builds the same entity list Generate uses, with
// resourceItem resolved from the real item definitions.
func hydratedEntities(t *testing.T) []StaticEntityBody {
	t.Helper()

	// Same loading path as production (cmd/berryhunterd/loaders.go).
	reg, err := items.RegistryFromFS(apiitems.Items)
	require.NoError(t, err)

	entities := []StaticEntityBody{}
	entities = append(entities, trees...)
	entities = append(entities, resources...)
	for i := range entities {
		e := &entities[i]
		item, err := reg.GetByName(e.resourceName)
		require.NoError(t, err, "every static entity must resolve to an item definition")
		e.resourceItem = &item
	}
	return entities
}

func Test_randomEntity(t *testing.T) {
	entities := hydratedEntities(t)

	rnd := rand.New(rand.NewSource(1234))
	for i := 0; i < 100; i++ {
		e, err := NewRandomEntityFrom(phy.Vec2f{}, entities, rnd)
		require.NoError(t, err)
		require.NotNil(t, e)
	}
}

func Test_chooseEntity(t *testing.T) {
	entities := hydratedEntities(t)

	choices := []wrand.Choice{}
	for _, b := range entities {
		choices = append(choices, wrand.Choice{Weight: b.resourceItem.Generator.Weight, Choice: b})
	}
	wc := wrand.NewWeightedChoice(choices)

	rnd := rand.New(rand.NewSource(1))
	for i := 0; i < 10; i++ {
		selected, ok := wc.Choose(rnd).(StaticEntityBody)
		require.True(t, ok)
		assert.NotNil(t, selected.resourceItem)
	}
}
