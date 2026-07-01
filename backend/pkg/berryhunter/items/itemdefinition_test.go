package items

import (
	"fmt"
	"io/ioutil"
	"testing"

	"github.com/stretchr/testify/assert"
	apiitems "github.com/trichner/berryhunter/pkg/api/items"
)

func TestParseRecipe(t *testing.T) {
	data, err := ioutil.ReadFile("test-item.json")
	assert.NoError(t, err, "Should read file just fine.")

	recipe, err := parseItemDefinition(data)
	assert.NoError(t, err, "Should parse recipe just fine.")

	fmt.Printf("%+v", recipe)
}

func TestMapRecipe(t *testing.T) {
	data, err := ioutil.ReadFile("test-item.json")
	assert.NoError(t, err, "Should read file just fine.")

	recipe, err := parseItemDefinition(data)
	assert.NoError(t, err, "Should parse recipe just fine.")

	vo, err := recipe.mapToItemDefinition()
	assert.NoError(t, err, "Should parse recipe just fine.")

	fmt.Printf("%+v", vo)
}

func TestCreateRegistry(t *testing.T) {
	// Same loading path as production (cmd/berryhunterd/loaders.go): the
	// embedded FS contains only the JSON definitions. RegistryFromPaths would
	// trip over non-JSON files (.gitignore, items.go) in the same directory.
	r, err := RegistryFromFS(apiitems.Items)
	assert.NoError(t, err, "Should load definitions just fine.")
	assert.NotNil(t, r, "registry should be defined")
	assert.NotEmpty(t, r.Items(), "Should have some items.")

	fmt.Printf("%+v", r)
}
