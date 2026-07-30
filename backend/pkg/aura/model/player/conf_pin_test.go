package player

// §35 C3 tier-3 pin (plan-conf-duplication.md §5, L11): combatRegenGraceTicks
// deliberately mirrors model/mob's unexported constant of the same name and
// value (the §31 vocabulary convergence — mobs and players leave combat by
// the same rule). The packages stay uncoupled on purpose; this pin and its
// twin make the mirror drift-proof instead of discipline-proof.

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestCombatRegenGraceTicks_MatchesMobTwin(t *testing.T) {
	assert.EqualValues(t, 100, combatRegenGraceTicks,
		"model/player's combatRegenGraceTicks no longer matches the shared value 100 — "+
			"its twin lives in model/mob/mob.go; move both or neither")
}
