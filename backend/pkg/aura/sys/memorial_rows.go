package sys

import (
	"fmt"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/persist"
)

// memorialRows serves the monument's names: the SECOND consumer of the dynamic
// row hook (plan-ascension.md C3 step 6, D11/D25, P10).
//
// ⭐ It is what makes P10's claim true rather than aspirational. The hook was
// deliberately built node-level rather than as a grant expansion "because §4.2
// promises C3's memorial the identical machinery and a memorial row grants
// nothing at all" — and every row here does exactly that: greyed, inert, with no
// reply and no grant.
//
// ⚑ IT HOLDS A READER, NOT A LISTING. The graveyard is re-read on a timer behind
// the persistence seam, and the seam itself is installed post-construction, so a
// source that captured a value at build time would show an empty stone forever.
type memorialRows struct {
	// snapshot is the loop-side read of the seam. One interface call and one
	// atomic load underneath, which is what keeps this legal on the per-tick
	// present path (L15: no provider may query a database or walk the world).
	snapshot func() persist.Graveyard
}

// NewMemorialRows builds the monument's row source. Exported because
// core/game.go registers it; everything it answers is package-internal.
func NewMemorialRows(snapshot func() persist.Graveyard) RowSource {
	return newMemorialRows(snapshot)
}

func newMemorialRows(snapshot func() persist.Graveyard) *memorialRows {
	return &memorialRows{snapshot: snapshot}
}

var _ RowSource = (*memorialRows)(nil)

// memorialOwnMarker flags a name belonging to the reading account (D25).
//
// ⚑ Composed SERVER-SIDE into the row's text, exactly as a gate's progress is,
// which is why the account id never has to reach a client. The wire deliberately
// never bought a field for either.
const memorialOwnMarker = "· yours"

// PresentRows lists the graveyard for this reader.
//
// ⚑ Runs per tick per conversing player, so it reads a slice that is already in
// memory and allocates only the rows it returns.
func (m *memorialRows) PresentRows(node *mobs.InteractionNode, p learner) []model.ConversationOption {
	if node == nil || node.Rows != mobs.RowSourceMemorialNames || m.snapshot == nil {
		return nil
	}
	yard := m.snapshot()
	if len(yard.Names) == 0 {
		// P26: an empty graveyard is the ordinary state of a fresh world, and the
		// node's authored lines are what speak for it — the same shape the catalog
		// node uses for D14's exhausted bloodline.
		return nil
	}

	reader := p.AccountID()
	rows := make([]model.ConversationOption, 0, len(yard.Names)+1)
	for i, name := range yard.Names {
		rows = append(rows, m.row(uint8(i), name, reader))
	}

	// P27: the listing is capped, so say what is not on screen. It is a ROW
	// rather than an authored line because a line cannot carry a number that
	// changes, and "and 0 more" is a sentence that only ever reads as a bug.
	if omitted := yard.Total - len(yard.Names); omitted > 0 {
		rows = append(rows, m.inert(uint8(len(yard.Names)),
			fmt.Sprintf("...and %d more.", omitted)))
	}
	return rows
}

// row renders one name.
//
// ⚑ D28 keeps the SHIPPED Locked style rather than buying a new one: greyed, no
// hover, no handler. And because `requiredLevel` is 0 the client draws no wall
// element beside it, so the row reads as a line of text rather than as something
// withheld — which is the only reason the reused style works here at all.
func (m *memorialRows) row(index uint8, name persist.GraveyardName, reader int64) model.ConversationOption {
	text := fmt.Sprintf("%s · level %d", name.Name, name.Level)
	// ⚑ Account 0 marks NOTHING. It is the zero value rather than an identity, so
	// matching on it would mark the whole monument as yours in any build with no
	// database behind it.
	if reader != 0 && name.AccountID == reader {
		text = fmt.Sprintf("%s %s", text, memorialOwnMarker)
	}
	return m.inert(index, text)
}

// inert builds a row that does nothing at all: no reply for the optimistic panel
// to speak, no countdown, and no grant.
func (m *memorialRows) inert(index uint8, text string) model.ConversationOption {
	return model.ConversationOption{
		OptionIndex: index,
		GrantIndex:  0,
		Text:        text,
		Locked:      true,
	}
}

// ApplyRow always refuses.
//
// ⭐ EVERY MEMORIAL ROW IS INERT, so this is the belt to PresentRows' braces,
// exactly as a locked reward row's refusal is: the greying stops an honest
// client from sending anything, and this stops a crafted message from being
// answered. A refusal is silent and ordinary, like every other stale click.
func (m *memorialRows) ApplyRow(*mobs.InteractionNode, learner, int, int) (string, bool) {
	return "", false
}
