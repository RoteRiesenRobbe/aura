package skills

// The stun (docs/archive/plan-cc-and-retaliation.md C3, D6): the game's first hard
// stun — movement halted AND casting suppressed.
//
// ⚑ The distinction the whole chunk turns on: a 100 % slow is a ROOT, not a
// stun. Movement and aura cadence run on independent paths (MovementFactor vs
// TickRateFactor), so a fully-slowed mob stands still and keeps swinging.
// D6 rules that ONE stunPayload answers both halves — Stunned() is read by
// MovementFactor here and by SkillSystem.processEntity for the cast half — so
// the two can never disagree about how long the stun lasted.

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const stunSource = SkillID(210)

func TestStun_ParsesItsPayload(t *testing.T) {
	def := mustParse(t, []byte(`{
	  "id": 210, "name": "Paralyze", "category": "cooldown", "maxLevel": 5,
	  "cooldownTicks": 900,
	  "effects": [{
	    "type": "stun", "radius": 2.5, "maxTargets": 1, "selector": "nearest",
	    "targetsEnemies": true, "targetsAllies": false,
	    "stunTicks": 90, "stunTicksPerLevel": 6
	  }]
	}`))
	require.Len(t, def.Effects, 1)

	e := def.Effects[0]
	require.Equal(t, EffectTypeStun, e.Type)
	require.NotNil(t, e.Stun)
	assert.Equal(t, 90, e.Stun.TicksAt(1))
	assert.Equal(t, 114, e.Stun.TicksAt(5), "90 + 4×6")
}

// A stun is a targeted cooldown like calm and charm, so it takes geometry,
// target flags and a cap — but nothing from the slow family. Authoring
// slowFraction here would be someone conflating the root with the stun, which
// is the exact confusion this effect exists to end.
func TestStun_RejectsForeignKeys(t *testing.T) {
	for _, key := range []string{`"slowFraction": 1.0`, `"calmTicks": 90`, `"tickInterval": 30`} {
		raw, err := parseSkillDefinition([]byte(`{
		  "id": 210, "name": "Paralyze", "category": "cooldown", "maxLevel": 5,
		  "cooldownTicks": 900,
		  "effects": [{"type": "stun", "radius": 2.5, "stunTicks": 90, ` + key + `}]
		}`))
		if err == nil {
			_, err = raw.mapToSkillDefinition(nil)
		}
		require.Error(t, err, "authored %s", key)
	}
}

func TestStun_ZeroDurationHardFails(t *testing.T) {
	raw, err := parseSkillDefinition([]byte(`{
	  "id": 210, "name": "Paralyze", "category": "cooldown", "maxLevel": 5,
	  "cooldownTicks": 900,
	  "effects": [{"type": "stun", "radius": 2.5, "stunTicks": 0}]
	}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition(nil)
	require.Error(t, err, "a zero-tick stun is a buff entry that expires before anything reads it")
}

// --- the store ---

func TestStun_StopsMovementDead(t *testing.T) {
	var b Buffs
	require.Equal(t, float32(1), b.MovementFactor(), "precondition: nothing applied")

	b.ApplyStun(stunSource, 90)

	assert.True(t, b.Stunned())
	assert.Equal(t, float32(0), b.MovementFactor(), "a stun is not a strong slow — it is a hard stop")
}

// D6's whole point: ONE payload answers both halves, so the movement half
// cannot outlive the cast half or vice versa. Expiry is the place that would
// show a divergence, so it is asserted on both reads at once.
func TestStun_BothHalvesExpireTogether(t *testing.T) {
	var b Buffs
	b.ApplyStun(stunSource, 3)

	for i := 0; i < 3; i++ {
		require.True(t, b.Stunned(), "tick %d", i)
		require.Equal(t, float32(0), b.MovementFactor(), "tick %d", i)
		b.Tick()
	}

	assert.False(t, b.Stunned(), "the cast half is over")
	assert.Equal(t, float32(1), b.MovementFactor(), "…and so is the movement half, on the same tick")
}

// The refresh rule every other empty payload uses: one stream per source, and
// a re-application extends rather than stacking.
func TestStun_RefreshTakesTheLongerRemainder(t *testing.T) {
	var b Buffs
	b.ApplyStun(stunSource, 10)
	b.ApplyStun(stunSource, 40)
	for i := 0; i < 20; i++ {
		b.Tick()
	}
	assert.True(t, b.Stunned(), "the longer application won")

	b.ApplyStun(stunSource, 1)
	assert.True(t, b.Stunned(), "a SHORTER re-application must not cut a live stun short")
}

// The pip: no bit is left in the applied_effects ubyte, so D6 reuses the slow
// bit rather than widening the wire for one buff — the lifestealPayload
// precedent, applied where a stun at least reads as *movement impairment*
// instead of as nothing at all.
//
// ⚑ The conflation is real and recorded: a stunned mob is indistinguishable
// from a slowed one on the wire until backlog §39 replaces presence-only pips.
func TestStun_LightsTheSlowPipWithoutWideningTheWire(t *testing.T) {
	var b Buffs
	b.ApplyStun(stunSource, 90)
	assert.Equal(t, AppliedEffectSlow, b.AppliedEffects())
}

// A stun is NOT a slow in the store, even though it borrows the slow's pip —
// SlowFraction walks slowPayloads and must not see it, or "strongest slow
// wins" would start arbitrating against a stun.
func TestStun_IsNotASlowInTheStore(t *testing.T) {
	var b Buffs
	b.ApplyStun(stunSource, 90)
	assert.Equal(t, float32(0), b.SlowFraction(),
		"the stun answers MovementFactor directly; it does not pretend to be a slow")
}
