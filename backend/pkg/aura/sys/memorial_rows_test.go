package sys

import (
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/persist"
)

// --- the memorial (plan-ascension.md C3 step 6, D11/D25) ---

func yard(total int, names ...persist.GraveyardName) persist.Graveyard {
	return persist.Graveyard{Names: names, Total: total}
}

func laid(name string, level int, account int64) persist.GraveyardName {
	return persist.GraveyardName{Name: name, Level: level, AccountID: account}
}

func memorialFor(g persist.Graveyard) *memorialRows {
	return newMemorialRows(func() persist.Graveyard { return g })
}

func textsOf(rows []string) string { return fmt.Sprint(rows) }

func rowTexts(src *memorialRows, p learner) []string {
	out := []string{}
	for _, r := range src.PresentRows(mobs.RowSourceMemorialNames, p) {
		out = append(out, r.Text)
	}
	return out
}

// P24: the name and the level it was laid down at, and nothing else. No date
// (it needs a formatting decision and a timezone answer nobody has asked for)
// and no slot.
func TestMemorialRows_ListsNameAndLevel(t *testing.T) {
	src := memorialFor(yard(2, laid("Aelric", 30, 1), laid("Maren", 28, 2)))

	rows := rowTexts(src, newLearner(5))

	require.Len(t, rows, 2)
	assert.Contains(t, rows[0], "Aelric")
	assert.Contains(t, rows[0], "30")
	assert.Contains(t, rows[1], "Maren")
	assert.Contains(t, rows[1], "28")
}

// ⭐ D25: ONE GLOBAL LIST, with the reading account's own names marked. Both
// halves matter — every account's names appear, and the reader can still find
// their own, which is what the PO chose over a per-bloodline monument.
func TestMemorialRows_MarksTheReadersOwnNames(t *testing.T) {
	src := memorialFor(yard(3,
		laid("Aelric", 30, 7),
		laid("Stranger", 30, 99),
		laid("Maren", 30, 7)))
	reader := newLearner(5)
	reader.accountID = 7

	rows := rowTexts(src, reader)

	require.Len(t, rows, 3)
	assert.Contains(t, rows[0], memorialOwnMarker, "Aelric is the reader's: %q", rows[0])
	assert.NotContains(t, rows[1], memorialOwnMarker, "a stranger is not marked: %q", rows[1])
	assert.Contains(t, rows[2], memorialOwnMarker, "Maren is the reader's too: %q", rows[2])
}

// ⚑ A reader with no account (every non-persistent build, and every test that
// does not set one) marks NOTHING. Account 0 must never match account 0 rows:
// it is the zero value, not an identity, and matching on it would mark the
// whole monument as yours on any build without a database.
func TestMemorialRows_AccountZeroMarksNothing(t *testing.T) {
	src := memorialFor(yard(1, laid("Nobody", 30, 0)))

	rows := rowTexts(src, newLearner(5))

	require.Len(t, rows, 1)
	assert.NotContains(t, rows[0], memorialOwnMarker)
}

// ⭐ EVERY ROW IS INERT. D28 keeps the shipped Locked style, which renders greyed
// with no hover and — because requiredLevel is 0 — draws no wall element, so a
// name reads as a line of text nobody can click. The Locked flag is also what
// stops the client attaching a handler at all.
func TestMemorialRows_EveryRowIsLockedAndSpeechless(t *testing.T) {
	src := memorialFor(yard(2, laid("Aelric", 30, 1), laid("Maren", 30, 2)))

	for _, row := range src.PresentRows(mobs.RowSourceMemorialNames, newLearner(5)) {
		assert.True(t, row.Locked, "%q must be inert", row.Text)
		assert.Empty(t, row.Reply, "%q has nothing to speak", row.Text)
		assert.Zero(t, row.ConfirmSeconds, "%q asks for no countdown", row.Text)
	}
}

// ⚑ P27: the listing is capped, so when the graveyard is larger the source emits
// one final inert row saying how many are not shown. It has to be a ROW rather
// than an authored line, because a line cannot carry a number that changes.
func TestMemorialRows_SaysHowManyItIsNotShowing(t *testing.T) {
	src := memorialFor(yard(48, laid("Aelric", 30, 1), laid("Maren", 30, 2)))

	rows := rowTexts(src, newLearner(5))

	require.Len(t, rows, 3, "two names and the tail")
	assert.Contains(t, rows[2], "46", "48 total minus the 2 shown: %s", textsOf(rows))
}

// ...and no tail when the stone is showing everything, because "and 0 more" is
// a sentence that only ever reads as a bug.
func TestMemorialRows_NoTailWhenNothingIsOmitted(t *testing.T) {
	src := memorialFor(yard(2, laid("Aelric", 30, 1), laid("Maren", 30, 2)))

	rows := rowTexts(src, newLearner(5))

	assert.Len(t, rows, 2)
}

// An empty graveyard serves NO rows, which is the ordinary state of a fresh
// world. P26 puts the sentence in the node's authored `lines`, exactly as the
// catalog node does, because a generated list may legitimately come back empty
// and then the lines are all the node has to say.
func TestMemorialRows_AnEmptyGraveyardServesNothing(t *testing.T) {
	src := memorialFor(persist.Graveyard{})

	assert.Empty(t, src.PresentRows(mobs.RowSourceMemorialNames, newLearner(5)))
}

// It answers for its own kind and nothing else, so the mux cannot mis-route a
// node into it.
func TestMemorialRows_IgnoresAnotherSourcesKind(t *testing.T) {
	src := memorialFor(yard(1, laid("Aelric", 30, 1)))

	assert.Empty(t, src.PresentRows(mobs.RowSourceAscensionCatalog, newLearner(5)))
}

// ⭐ ApplyRow ALWAYS REFUSES. Every row is inert, and this is the belt to
// PresentRows' braces exactly as a locked reward row's refusal is: a crafted
// message naming a memorial row must do nothing, silently.
func TestMemorialRows_ApplyRowAlwaysRefuses(t *testing.T) {
	src := memorialFor(yard(1, laid("Aelric", 30, 1)))

	for _, option := range []int{0, 1, 254, 255, -1} {
		reply, ok := src.ApplyRow(mobs.RowSourceMemorialNames, newLearner(5), option, 0)
		assert.False(t, ok, "option %d must be refused", option)
		assert.Empty(t, reply)
	}
}

// ⚑ The source reads the snapshot AT RENDER, never at construction: the seam is
// installed post-construction and the listing is re-read on a timer, so a source
// holding a value from build time would show an empty stone forever.
func TestMemorialRows_ReadsTheSnapshotEveryTime(t *testing.T) {
	current := persist.Graveyard{}
	src := newMemorialRows(func() persist.Graveyard { return current })

	require.Empty(t, src.PresentRows(mobs.RowSourceMemorialNames, newLearner(5)))

	current = yard(1, laid("Aelric", 30, 1))
	assert.Len(t, src.PresentRows(mobs.RowSourceMemorialNames, newLearner(5)), 1)
}

// A nil reader of the snapshot is a supported world (no database), and it must
// not panic on the per-tick present path.
func TestMemorialRows_ANilSnapshotReaderIsEmpty(t *testing.T) {
	src := newMemorialRows(nil)

	assert.Empty(t, src.PresentRows(mobs.RowSourceMemorialNames, newLearner(5)))
}
