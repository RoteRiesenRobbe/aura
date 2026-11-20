package sys

import (
	"slices"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/appearance"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/persist"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

// ascensionLooks is the look step (plan-ascension-ceremony.md D7): the looks a
// stone offers in one slot, minus the ones this character already owns, and a
// fixed "No new look" row (R6). A pick is only remembered in the draft; the
// look is granted with the ascension, never worn (R8).
//
// ⚑ Every look a step names is a stone gift (appearance.CrossValidateStones
// refuses anything else), and a stone gift carries no conditions, so a look
// row is never locked: owning it is the only thing that takes it off the list.
type ascensionLooks struct {
	looks appearance.Catalog
}

func newAscensionLooks(looks appearance.Catalog) *ascensionLooks {
	return &ascensionLooks{looks: looks}
}

var _ ceremonyStep = (*ascensionLooks)(nil)

// lookSkipIndex is where the "No new look" row always sits: fixed, never after
// the list, the gift's ascensionEmptyPickIndex rule (L2).
const lookSkipIndex = 254

// offered reports whether the look at this position of the step's list is
// still on offer to p: a known stone gift of the step's slot, not yet owned.
// ⭐ THE ONE QUESTION present, apply and both re-judgements ask.
func (a *ascensionLooks) offered(node *mobs.InteractionNode, p learner, id string) (appearance.Item, bool) {
	it, ok := a.looks.Item(id)
	if !ok || !it.StoneGift() || string(it.Slot) != node.LookSlot {
		return appearance.Item{}, false
	}
	return it, !slices.Contains(p.AppearanceOwned(), a.looks.Flat(id))
}

// anyOffered reports whether the step has anything left for p. Nothing left
// means no rows at all, so the ceremony skips the step (D5).
func (a *ascensionLooks) anyOffered(node *mobs.InteractionNode, p learner) bool {
	for _, id := range node.Looks {
		if _, ok := a.offered(node, p, id); ok {
			return true
		}
	}
	return false
}

// PresentRows lists the looks still on offer, each at its position in the
// stone's list, then "No new look". Empty when nothing is left.
func (a *ascensionLooks) PresentRows(node *mobs.InteractionNode, p learner) []model.ConversationOption {
	if node == nil || node.Rows != mobs.RowSourceAscensionLooks {
		return nil
	}
	var rows []model.ConversationOption
	for i, id := range node.Looks {
		it, ok := a.offered(node, p, id)
		if !ok {
			continue
		}
		rows = append(rows, model.ConversationOption{
			OptionIndex: uint8(i),
			// ⭐ NEVER model.ConversationNoGrant: the client sends only a row
			// whose grant index is not the sentinel.
			GrantIndex: 0,
			Text:       it.Name,
			Appearance: a.looks.Flat(id) + 1,
		})
	}
	if len(rows) == 0 {
		return nil
	}
	return append(rows, model.ConversationOption{
		OptionIndex: lookSkipIndex,
		GrantIndex:  0,
		Text:        "No new look.",
		TextKey:     "conversation.ascend.no-look",
	})
}

// ApplyRow records the pick (or the skip) in the draft and starts nothing.
func (a *ascensionLooks) ApplyRow(node *mobs.InteractionNode, p learner, option, _ int) (string, bool) {
	if node == nil || node.Rows != mobs.RowSourceAscensionLooks {
		return "", false
	}
	if option == lookSkipIndex {
		// Offered only beside a look, so a skip of an empty step was never shown.
		if !a.anyOffered(node, p) {
			return "", false
		}
		return a.record(node, p, "")
	}
	if option < 0 || option >= len(node.Looks) {
		return "", false
	}
	id := node.Looks[option]
	if _, ok := a.offered(node, p, id); !ok {
		return "", false
	}
	return a.record(node, p, id)
}

func (a *ascensionLooks) record(node *mobs.InteractionNode, p learner, id string) (string, bool) {
	p.CeremonyDraft().Set(skills.StepPick{Step: node.ID, Kind: string(node.Rows), Key: id})
	return "", true
}

// stillPickable re-judges a drafted look against THIS stone's step, at the
// summary and at Confirm.
func (a *ascensionLooks) stillPickable(node *mobs.InteractionNode, p learner, key string) bool {
	if key == "" {
		return a.anyOffered(node, p)
	}
	if !slices.Contains(node.Looks, key) {
		return false
	}
	_, ok := a.offered(node, p, key)
	return ok
}

// validate re-judges a confirmed look when the channel completes (D9): still a
// stone gift, still not owned. The skip is always legitimate.
func (a *ascensionLooks) validate(p learner, key string) bool {
	if key == "" {
		return true
	}
	it, ok := a.looks.Item(key)
	return ok && it.StoneGift() && !slices.Contains(p.AppearanceOwned(), a.looks.Flat(key))
}

// grant adds the look to the one ascension transaction, at the item's scope.
func (a *ascensionLooks) grant(key string, req *persist.AscensionRequest) {
	if it, ok := a.looks.Item(key); ok && key != "" {
		req.Appearance = append(req.Appearance, persist.AppearanceGrant{Item: it.ID, Scope: string(it.Scope)})
	}
}

// summaryLine names the pick on the summary: "Portrait: <name>" or "Ring:
// none". The client words it from the key and the appearance field.
func (a *ascensionLooks) summaryLine(node *mobs.InteractionNode, index int, key string) model.ConversationOption {
	label := "Portrait"
	if node.LookSlot == string(appearance.SlotRing) {
		label = "Ring"
	}
	row := model.ConversationOption{
		OptionIndex: uint8(index),
		GrantIndex:  model.ConversationNoGrant,
		Locked:      true, // inert on both ends, the gift line's shape
		Text:        label + ": none",
		TextKey:     "conversation.ascend.summary.no-" + node.LookSlot,
	}
	if it, ok := a.looks.Item(key); ok && key != "" {
		row.Text = label + ": " + it.Name
		row.TextKey = "conversation.ascend.summary." + node.LookSlot
		row.Appearance = a.looks.Flat(key) + 1
	}
	return row
}
