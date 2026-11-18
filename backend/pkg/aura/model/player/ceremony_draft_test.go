package player

// The ascension draft dies with its conversation (plan-ascension-ceremony.md
// D4, L4). Death and reconnect build a fresh entity, which starts with an
// empty draft by construction; every other door passes SetConversingWith.

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

func draftedPlayer(stone uint64) *player {
	p := newTestPlayer(nil)
	p.SetConversingWith(stone)
	p.CeremonyDraft().Set(skills.StepPick{Step: "catalog", Kind: "ascension_catalog", Key: "FrostShield"})
	return p
}

func TestCeremonyDraft_DiesWithTheConversation(t *testing.T) {
	for name, next := range map[string]uint64{
		"closed or walked away":     0,
		"opened another conversant": 8,
	} {
		t.Run(name, func(t *testing.T) {
			p := draftedPlayer(7)
			p.SetConversingWith(next)
			assert.Empty(t, p.CeremonyDraft().Picks)
		})
	}
}

// Re-stamping the same session (an E press while it is open) keeps the walk.
func TestCeremonyDraft_SurvivesTheSameConversant(t *testing.T) {
	p := draftedPlayer(7)
	p.SetConversingWith(7)
	assert.Len(t, p.CeremonyDraft().Picks, 1)
}

// The four doors carry nothing (§6): a fresh entity, as built on respawn and
// reattach, has no draft.
func TestCeremonyDraft_AFreshPlayerHasNone(t *testing.T) {
	assert.Empty(t, newTestPlayer(nil).CeremonyDraft().Picks)
}
