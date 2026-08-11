package sys

import (
	"fmt"
	"strings"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/ascension"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

// ascensionRows serves the ascension stone's reward list: the first real
// RowSource (plan-ascension.md §12.4 C2a step 3, P10).
//
// It answers two questions and nothing else. What can this bloodline still
// learn, rendered per player with its gates evaluated; and what does taking one
// of those rows do, which is to STASH the validated pick. The channel that
// spends the stash is step 5, and the split is deliberate: a click must never be
// the irreversible act.
type ascensionRows struct {
	catalog ascension.Catalog
}

// NewAscensionRows builds the stone's row source. Exported because core/game.go
// installs it; everything it answers is package-internal.
func NewAscensionRows(catalog ascension.Catalog) AscensionSource {
	return newAscensionRows(catalog)
}

func newAscensionRows(catalog ascension.Catalog) *ascensionRows {
	return &ascensionRows{catalog: catalog}
}

var _ AscensionSource = (*ascensionRows)(nil)

// ascensionConfirmSeconds is how long the client's countdown modal holds a pick
// before it may be confirmed (D21). ⚑ Hardcoded, exactly as DeleteDialog's own
// CONFIRM_COOLDOWN_MS is and for the recorded reason (§10b ruling 4: the knob
// was drafted, never built, and does not need to exist). It rides the row
// rather than an authored key because a generated row has no authored option to
// carry one.
const ascensionConfirmSeconds = 5

// ascensionEmptyPickIndex is where D14's "ascend with no gift" row always sits.
//
// ⭐ FIXED, never derived from the catalog's length, because it is the one row
// whose position must not depend on how much content exists: it appears exactly
// when the catalog offers this bloodline nothing pickable, which is the state
// where a length-derived index would be least stable. 255 is the wire's
// no-grant sentinel, so 254 is the top of the usable range and
// ascension.MaxEntries caps the catalog at 254 entries (indices 0..253) to keep
// out of its way.
const ascensionEmptyPickIndex = ascension.MaxEntries

// PresentRows builds this player's reward list.
//
// ⚑ Runs per tick per conversing player, so every read here is O(1) in memory:
// the catalog is a slice held since boot, the spent keys ride the player, and a
// gate is the same conditionsPass the dialogue nodes use.
func (a *ascensionRows) PresentRows(node *mobs.InteractionNode, p learner) []model.ConversationOption {
	if node == nil || node.Rows != mobs.RowSourceAscensionCatalog {
		return nil
	}

	var rows []model.ConversationOption
	pickable := 0
	// ⭐ Indexed over All(), the boot-stable sorted list, NOT over the filtered
	// remainder. A filtered list renumbers itself every time the bloodline spends
	// something, so a row's index would name a different reward after every
	// ascension.
	for i, entry := range a.catalog.All() {
		if a.spent(p, entry.UnlockKey) {
			continue // P4: a taken entry leaves this bloodline's catalog forever
		}
		locked := !conditionsPass(entry.Conditions, p)
		if !locked {
			pickable++
		}
		rows = append(rows, a.row(i, entry, locked, p))
	}

	// D14: an exhausted catalog still ascends. The row is offered only when
	// nothing is pickable, so it is never a costlier alternative to a reward
	// sitting beside it on screen. ⚑ Locked rows do NOT suppress it: P1 makes max
	// level the whole entry price, so a bloodline whose every remaining entry is
	// gated must still be able to go.
	if pickable == 0 {
		rows = append(rows, model.ConversationOption{
			OptionIndex:    ascensionEmptyPickIndex,
			GrantIndex:     0,
			Text:           "Spend this character, take no reward.",
			Reply:          "Channelling now. Walk away to cancel.",
			ConfirmSeconds: ascensionConfirmSeconds,
		})
	}
	return rows
}

// row renders one catalog entry.
//
// ⚑ A gated entry is SHOWN LOCKED, never hidden (D18): discoverability over
// secrecy, and it is also what keeps D14's "nothing left to teach" honest, since
// a hidden entry is indistinguishable from an exhausted catalog.
//
// ⚑ The requirement is composed into the row's TEXT rather than into a field of
// its own. The wire carries `required_level` for the teach_skill level wall and
// nothing else, and D18 chose deliberately not to buy a second field for this.
func (a *ascensionRows) row(index int, entry ascension.Entry, locked bool, p learner) model.ConversationOption {
	// ⛑ THE AUTHORED DISPLAY NAME, NEVER A FRESH DERIVATION. The registry
	// already resolved the override into DisplayName at load (override, else
	// CamelCase→spaces), and `DeriveDisplayName`'s own doc says the odd cases
	// author one instead: "Long-Range Strike", "Call for Aid", "Damage-Burst",
	// "Hold the Line". Deriving here re-implemented the rule and silently
	// dropped the override, which is the same mistake C2b corrected in P21 on
	// the client side. Found by c2a-ascension-site at C3 step 4, when RimeBurst
	// became the first authored entry whose two spellings differ.
	text := entry.Skill.Display()
	// ⚑ A locked row rides with an EMPTY reply and is refused by ApplyRow, the
	// same deliberate twin the teaching rows have: the greying and the named wall
	// are the whole message, and the optimistic panel must have nothing to speak.
	reply := fmt.Sprintf("%s it is. Channelling now, walk away to cancel.", text)
	if locked {
		text = fmt.Sprintf("%s - locked: %s", text, describeConditions(entry.Conditions, p))
		reply = ""
	}
	return model.ConversationOption{
		OptionIndex: uint8(index),
		// ⭐ NEVER model.ConversationNoGrant. 255 means "navigation row" to the
		// client, and Conversation.ts only sends a row whose grant index is not
		// 255, so a pickable row carrying the sentinel is walked locally and
		// never reaches the server (§12.7 finding 1).
		GrantIndex: 0,
		Text:       text,
		Locked:     locked,
		Reply:      reply,
		// ⚑ Set on the locked row as well, which is the whole point: the branch
		// above rewrites the text and empties the reply, but a gate the player
		// cannot read the reward behind is indistinguishable from one that is
		// merely hard (§13.7 item 3).
		SkillID: uint16(entry.Skill.ID),
		// ⚑ Only a TAKEABLE row: a locked one is inert on both ends, and asking
		// a player to sit through a countdown for a row that will be refused
		// would be friction with nothing behind it.
		ConfirmSeconds: confirmSecondsFor(locked),
	}
}

func confirmSecondsFor(locked bool) uint8 {
	if locked {
		return 0
	}
	return ascensionConfirmSeconds
}

// ApplyRow validates the pick and stashes it. It does NOT ascend anybody: the
// channel is what spends the stash (step 5), so a click stays reversible.
//
// ⚑ Every check is on the row's OWN merits and re-run here rather than trusted
// from presentation, which is what lets a crafted message be refused the same
// way a stale click is: silently.
func (a *ascensionRows) ApplyRow(node *mobs.InteractionNode, p learner, option, _ int) (string, bool) {
	if node == nil || node.Rows != mobs.RowSourceAscensionCatalog {
		return "", false
	}

	if option == ascensionEmptyPickIndex {
		// Offered only when nothing is pickable, so accepting it while a real
		// choice is on screen would accept a row that was never presented.
		if a.anyPickable(p) {
			return "", false
		}
		return a.stash(node, p, "")
	}

	all := a.catalog.All()
	if option < 0 || option >= len(all) {
		return "", false
	}
	entry := all[option]
	if a.spent(p, entry.UnlockKey) || !conditionsPass(entry.Conditions, p) {
		return "", false
	}
	return a.stash(node, p, entry.UnlockKey)
}

// ValidatePick re-judges a stashed pick, and it is the completion half of the
// contract ApplyRow opens (§12.4 C2a step 5).
//
// ⭐ A NON-NIL STASH IS NOT A VALID PICK. The pick is judged when the row is
// clicked and spent ten seconds later; a `quest_at_stage` gate can regress in
// between, so the channel must ask again rather than trust what it is holding.
//
// ⚑ The empty pick is always legitimate HERE, and that is a statement about the
// CATALOG only: D14 ascends a bloodline that has learned everything it can, so
// there is no reward left to re-judge. The SITE's price is judged separately, on
// the pick itself, and the empty pick pays it like every other row
// (plan-ascension-sites.md C1).
func (a *ascensionRows) ValidatePick(p learner, key string) bool {
	if key == "" {
		return true
	}
	for _, entry := range a.catalog.All() {
		if entry.UnlockKey != key {
			continue
		}
		return !a.spent(p, key) && conditionsPass(entry.Conditions, p)
	}
	return false // not in the catalog at all
}

// stash records the pick, starts the ceremony's channel, and returns the reply
// the panel already spoke so the two cannot disagree.
//
// ⭐ THE CHANNEL STARTS HERE, not from a second client message. A utility press
// carries no argument, so a press-started ceremony could arrive with no pick
// behind it; starting it where the pick is validated keeps the two inseparable.
// The channel remains the last escape: walking away cancels it, and CancelCast
// takes the pick with it.
//
// ⭐ THE SITE'S PRICE RIDES ALONG (plan-ascension-sites.md P1), and both callers
// pass it — the empty pick included, because D14's ascend-with-no-gift is still
// something a player does AT A STONE and must cost what that stone asks.
// `node.Conditions` is a slice into loaded content, immutable after boot, so the
// snapshot is the slice header and there is nothing to copy or invalidate.
func (a *ascensionRows) stash(node *mobs.InteractionNode, p learner, key string) (string, bool) {
	sc := p.SkillComponent()
	if sc == nil {
		return "", false
	}
	sc.PendingAscension = &skills.AscensionPick{Key: key, Gate: node.Conditions}
	sc.StartUtilityCast(skills.UtilityAscend)
	if key == "" {
		return "Channelling now. Walk away to cancel.", true
	}
	return fmt.Sprintf("%s it is. Channelling now, walk away to cancel.",
		a.displayNameOf(key)), true
}

// displayNameOf answers what a player should see this reward called.
//
// ⚑ It reads the catalog rather than deriving from the key, so BOTH ends of one
// click agree: row() speaks this sentence optimistically in the panel and stash
// returns it from the server, and a reward whose authored displayName differs
// from its key ("RimeBurst" → "Rime-Burst") would otherwise be named one way on
// screen and another way in the reply.
//
// ⚑ The fallback is the derivation rather than the raw key, because the only way
// to reach it is a key the catalog no longer holds, and a retired reward should
// still read as words.
func (a *ascensionRows) displayNameOf(key string) string {
	for _, entry := range a.catalog.All() {
		if entry.UnlockKey == key && entry.Skill != nil {
			return entry.Skill.Display()
		}
	}
	return skills.DeriveDisplayName(key)
}

func (a *ascensionRows) anyPickable(p learner) bool {
	for _, entry := range a.catalog.All() {
		if !a.spent(p, entry.UnlockKey) && conditionsPass(entry.Conditions, p) {
			return true
		}
	}
	return false
}

// spent reports whether this bloodline has already bought that reward.
//
// ⭐ IT READS THE UNLOCK KEYS, NOT THE SPELLBOOK, and the difference is a real
// bug avoided: FrostShield is a Troll drop, so a player can know the skill from
// the world without their bloodline ever having spent an ascension on it.
// HasDiscovered would hide a reward they are still owed.
func (a *ascensionRows) spent(p learner, key string) bool {
	for _, k := range p.BloodlineUnlocks() {
		if k == key {
			return true
		}
	}
	return false
}

// describeConditions renders a gate for a player: what it wants, and how far
// along they are.
//
// ⚑ Composed PER PLAYER at render, never authored (D18). Serving a threshold
// for unreached content out of the catalog would repeat the mistake the quest
// journal's Objectives exists to avoid.
func describeConditions(conditions []mobs.InteractionCondition, p learner) string {
	parts := make([]string, 0, len(conditions))
	for _, c := range conditions {
		parts = append(parts, describeCondition(c, p))
	}
	return strings.Join(parts, ", ")
}

func describeCondition(c mobs.InteractionCondition, p learner) string {
	switch c.Kind {
	case mobs.ConditionMinLevel:
		return fmt.Sprintf("level %d (%d/%d)", c.Value, p.Progression().Level, c.Value)
	case mobs.ConditionBloodlineAscensions:
		return fmt.Sprintf("%d ascensions in this line (%d/%d)",
			c.Value, p.BloodlineAscensions(), c.Value)
	case mobs.ConditionQuestAtStage:
		if c.Stage == mobs.QuestStageCompleted {
			return fmt.Sprintf("complete %q", c.Quest)
		}
		return fmt.Sprintf("%q at %q", c.Quest, c.Stage)
	case mobs.ConditionKillsThisLife:
		// ⭐ "N × Species", because it DOES NOT PLURALISE (P21). English
		// pluralisation of arbitrary authored names has no ceiling (Wolf →
		// Wolves, Boar → Boars, Dodo → Dodos, and every species a content pass
		// adds next), and this form is correct for all of them at once.
		//
		// ⚑ The species reads as its display name, through the same rule the
		// nameplates and the actor line use. A player has never seen the
		// CamelCase key and must not meet it here first.
		//
		// ⚑ The counter is read through the SAME unresolved-species guard
		// conditionsPass applies, and not because the state is expected: an
		// unresolved gate never opens, so without this the row could read
		// "(50/20)" beside a wall that will never fall: kills of "mob 0" counted
		// against a species nobody resolved. Refusing and misreporting have to
		// agree about what they are talking about.
		killed := uint64(0)
		if c.SpeciesID != 0 {
			killed = p.QuestLedger().KillCount(c.SpeciesID)
		}
		return fmt.Sprintf("slay %d × %s this life (%d/%d)",
			c.Value, skills.DeriveDisplayName(c.Species), killed, c.Value)
	default:
		// Unreachable while the loader refuses an unknown kind at boot. It is
		// spelled out rather than left to a bare default so a NEW kind lands here
		// visibly instead of rendering an empty requirement, which would read as
		// a row locked for no reason at all.
		return fmt.Sprintf("an unnamed requirement (%s)", c.Kind)
	}
}

// siteGateHolds re-judges the price the site charged when the row was clicked.
//
// ⚑ It lives here rather than on the pick because `skills` cannot name
// `[]mobs.InteractionCondition` — `mobs` imports `skills`, so the field is
// carried as `any` and this is the one place that reads it, where both the
// conditions and the live player are in scope.
func siteGateHolds(pick *skills.AscensionPick, p learner) bool {
	gate, priced := pick.Gate.([]mobs.InteractionCondition)
	return priced && conditionsPass(gate, p)
}
