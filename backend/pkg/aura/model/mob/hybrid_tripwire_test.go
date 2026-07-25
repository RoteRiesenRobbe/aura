package mob

// Content tripwire for the slot-0 assumption left behind by the role-as-loadout
// rework (backlog §31 gap 5, playtest round 3).
//
// The rework made a mob's role come from its loadout, but two places still
// assume **slot 0 is the combat aura** — true only while one latched flag
// decided everything:
//
//   - companion.go  auraCanReach  tests the SLOT-0 aura's mask against a
//     candidate target. For a hybrid follower whose slot 0 is the support aura
//     that asks "can my heal reach this enemy?", which is the wrong question.
//   - mob.go        NewMob        pre-sizes the aura collider from slot 0.
//     Milder: the SkillSystem re-derives radius/mask every tick once a slot is
//     active, so it only affects the stop distance before first acquisition.
//
// Neither was fixed, deliberately (PO 2026-07-25). auraCanReach runs during
// ACQUISITION, before a mode is chosen, so "which slot decides reachability?"
// is genuinely undetermined for a hybrid — a hybrid arguably should acquire a
// target its damage aura can reach even when its heal cannot. That is a design
// question for §31's behaviour half, and answering it now would be guessing at
// semantics the first real hybrid would immediately dispute.
//
// So instead of a guess, this test makes the trap LOUD: it fails the moment
// content authors the first mob carrying both a support and a combat aura,
// which is exactly when the right answer becomes decidable. Same trick as
// TestAuraCategory_ClassifiesEveryAuthorableEffectType — an assertion that
// fires when new content appears, rather than a behaviour baked in ahead of it.
//
// Reads the real embedded content, and derives the slots through the real
// NewMob, so it cannot drift from roleSlots.

import (
	"testing"

	afactions "github.com/RoteRiesenRobbe/aura/pkg/api/factions"
	amobs "github.com/RoteRiesenRobbe/aura/pkg/api/mobs"
	askills "github.com/RoteRiesenRobbe/aura/pkg/api/skills"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/curve"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/factions"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestContent_NoAuthoredMobIsAHybridYet(t *testing.T) {
	sr, err := skills.RegistryFromFS(askills.Skills)
	require.NoError(t, err)
	fr, err := factions.RegistryFromFS(afactions.Factions)
	require.NoError(t, err)
	mr, err := mobs.RegistryFromFS(sr, fr, curve.Default(), amobs.Mobs)
	require.NoError(t, err)

	var hybrids []string
	for _, def := range mr.Mobs() {
		m := NewMob(def, 0, nil)
		if m.supportSlot >= 0 && m.combatSlot >= 0 {
			hybrids = append(hybrids, def.Name)
		}
	}

	assert.Empty(t, hybrids,
		"first hybrid mob authored (%v) — before shipping it, resolve the slot-0 "+
			"assumption in companion.go auraCanReach and NewMob's collider pre-size "+
			"(backlog §31 gap 5). This test is the tripwire, not a prohibition: once "+
			"those two read the right slot, replace it with real hybrid behaviour pins.",
		hybrids)
}
