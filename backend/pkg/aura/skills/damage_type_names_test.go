package skills

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/stretchr/testify/require"
)

// plan-localization.md: DamageTypes is the closed list of damage type codes,
// and the client shows each by name from its UI catalog (damage-type.<code>).
// A code added here without its name would reach the player as the raw code.
func TestDamageTypes_EveryCodeHasAUIName(t *testing.T) {
	raw, err := os.ReadFile("../../../../frontend/src/lang/en/frontend.arb")
	require.NoError(t, err)
	var catalog map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(raw, &catalog))
	for code := range DamageTypes {
		_, ok := catalog["damage-type."+code]
		require.True(t, ok, "damage type %q has no damage-type.%s in frontend/src/lang/en/frontend.arb", code, code)
	}
}
