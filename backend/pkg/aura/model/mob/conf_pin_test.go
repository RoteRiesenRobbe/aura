package mob

// §35 C3 tier-3 pin (plan-conf-duplication.md §5): a constant in this package
// deliberately mirrors a value owned elsewhere. It cannot assert against its
// twin directly without dragging config into a model package (L11), so it is
// pinned here and drift shows up as one red test naming the other side.
// (The combatRegenGraceTicks twin pin that also lived here retired with the
// mirror itself; the value is constant.CombatRegenGraceTicks since
// plan-code-health.md C4.)

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The fallback margin is the same 0.2 as core/gameconf.go's normalization of
// game.mobChaseIntoAuraMargin — two independent defaults that H1a found 4×
// apart. conf.default.json is the documented restatement of both, so pinning
// against it transitively pins the pair (gameconf.go's side is held by
// cmd/aurad's resolved-equality test).
func TestDefaultChaseIntoAuraMargin_MatchesConfDefault(t *testing.T) {
	raw, err := os.ReadFile("../../../../conf.default.json")
	require.NoError(t, err)
	var conf struct {
		Game struct {
			MobChaseIntoAuraMargin float32 `json:"mobChaseIntoAuraMargin"`
		} `json:"game"`
	}
	require.NoError(t, json.Unmarshal(raw, &conf))
	require.NotZero(t, conf.Game.MobChaseIntoAuraMargin, "mobChaseIntoAuraMargin missing/renamed in conf.default.json")

	assert.Equal(t, conf.Game.MobChaseIntoAuraMargin, defaultChaseIntoAuraMargin,
		"model/mob's fallback chase margin has drifted from conf.default.json's "+
			"game.mobChaseIntoAuraMargin — the H1a 4× split, reopened")
}
