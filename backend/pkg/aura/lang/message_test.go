package lang

import (
	"encoding/json"
	"os"
	"sort"
	"testing"

	"github.com/stretchr/testify/require"
)

// plan-localization.md C2: every server key has a client template in
// frontend/src/lang/en.arb, with exactly the argument names the server sends.
func TestServerKeys_EachHasAClientTemplateWithTheSameArguments(t *testing.T) {
	raw, err := os.ReadFile("../../../../frontend/src/lang/en.arb")
	require.NoError(t, err)
	var arb map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(raw, &arb))
	for key, args := range ServerKeys {
		_, ok := arb[key]
		require.True(t, ok, "server key %q has no template in frontend/src/lang/en.arb", key)
		var meta struct {
			Placeholders map[string]json.RawMessage `json:"placeholders"`
		}
		if m, ok := arb["@"+key]; ok {
			require.NoError(t, json.Unmarshal(m, &meta))
		}
		got := make([]string, 0, len(meta.Placeholders))
		for name := range meta.Placeholders {
			got = append(got, name)
		}
		want := append([]string(nil), args...)
		sort.Strings(got)
		sort.Strings(want)
		if len(want) == 0 {
			want = []string{}
		}
		require.Equal(t, want, got, "server key %q: placeholder names differ from the client template", key)
	}
}
