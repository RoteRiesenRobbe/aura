package mob

// §35 C3 tier-3 pins (plan-conf-duplication.md §5): two constants in this
// package deliberately mirror values owned elsewhere. Neither can assert
// against its twin directly without dragging config into a model package or
// exporting an internal (L11), so each is pinned here and drift shows up as
// one red test naming the other side.

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

// combatRegenGraceTicks deliberately mirrors model/player's unexported
// constant of the same name and value (the §31 vocabulary convergence —
// mobs and players leave combat by the same rule). Not collapsed: the two
// packages stay uncoupled on purpose; this pin makes the mirror drift-proof
// instead of discipline-proof.
func TestCombatRegenGraceTicks_MatchesPlayerTwin(t *testing.T) {
	assert.EqualValues(t, 100, combatRegenGraceTicks,
		"model/mob's combatRegenGraceTicks no longer matches the shared value 100 — "+
			"its twin lives in model/player/player.go; move both or neither")
}
