package sys

import (
	"github.com/RoteRiesenRobbe/aura/pkg/aura/appearance"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/ascension"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/persist"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

// The ascension ceremony (plan-ascension-ceremony.md D1): a stone authors an
// ordered list of steps, each step's pick is only remembered in the draft, the
// generated summary lists every pick, and its one Confirm is the only thing
// that starts the channel.
//
// ⚑ The client walks the tree locally (D16), so the server never learns which
// node a player stands on. Next is therefore stamped onto each step's takeable
// rows here, per player, and Back is the panel's own button (PO 2026-11-18,
// in place of D5's generated Back row).

// ceremonyStep is one step kind (D3). A new kind is one implementation, one
// entry in newAscensionCeremony and one case in mobs.RowSourceKind.IsCeremonyStep.
type ceremonyStep interface {
	// RowSource presents the step's rows; ApplyRow records the pick in the
	// player's draft and starts nothing.
	RowSource
	// stillPickable re-judges a drafted pick against THIS stone's node, at
	// Confirm and on the summary that offers it.
	stillPickable(node *mobs.InteractionNode, p learner, key string) bool
	// validate re-judges a confirmed pick when the channel completes (D9).
	validate(p learner, key string) bool
	// grant adds the pick's writes to the one ascension transaction.
	grant(key string, req *persist.AscensionRequest)
	// summaryLine is the pick's inert line on the summary (D6). It takes the
	// step's node because a skip has no key to name its slot by.
	summaryLine(node *mobs.InteractionNode, index int, key string) model.ConversationOption
}

// summaryConfirmIndex is where the summary's Confirm row always sits: fixed,
// never after the lines, so the index cannot depend on how many steps were
// shown (L2). 255 is the wire's no-grant sentinel.
const summaryConfirmIndex = 254

// summaryHeirHomeIndex is the summary's heir-home line (D13): fixed, below
// Confirm and far above any step line's index.
const summaryHeirHomeIndex = 253

// ascensionCeremony serves every ceremony node: the steps (through their kind)
// and the summary. It is the AscensionSource both systems are wired with.
type ascensionCeremony struct {
	steps map[mobs.RowSourceKind]ceremonyStep
}

// NewAscensionRows builds the stone's row source: the ceremony with its two
// step kinds, the gift and the look (AC2). Exported because core/game.go
// installs it for every step kind and the summary.
func NewAscensionRows(catalog ascension.Catalog, looks appearance.Catalog) AscensionSource {
	return newAscensionCeremony(newAscensionRows(catalog), newAscensionLooks(looks))
}

func newAscensionCeremony(gift *ascensionRows, looks *ascensionLooks) *ascensionCeremony {
	return &ascensionCeremony{steps: map[mobs.RowSourceKind]ceremonyStep{
		mobs.RowSourceAscensionCatalog: gift,
		mobs.RowSourceAscensionLooks:   looks,
	}}
}

var _ AscensionSource = (*ascensionCeremony)(nil)

// PresentRows serves a step's rows with their Next stamped, or the summary.
func (c *ascensionCeremony) PresentRows(node *mobs.InteractionNode, p learner) []model.ConversationOption {
	if node == nil {
		return nil
	}
	if node.Rows == mobs.RowSourceAscensionSummary {
		return c.summaryRows(node, p)
	}
	step := c.steps[node.Rows]
	if step == nil {
		return nil
	}
	rows := step.PresentRows(node, p)
	next := c.nextShown(node, p)
	for i := range rows {
		// A locked row is inert and leads nowhere (Q1/R1).
		if !rows[i].Locked {
			rows[i].Next = next
		}
	}
	return rows
}

// ApplyRow records a step's pick, or confirms the summary.
func (c *ascensionCeremony) ApplyRow(node *mobs.InteractionNode, p learner, option, grant int) (string, bool) {
	if node == nil {
		return "", false
	}
	if node.Rows == mobs.RowSourceAscensionSummary {
		return c.confirm(node, p, option)
	}
	step := c.steps[node.Rows]
	if step == nil {
		return "", false
	}
	return step.ApplyRow(node, p, option, grant)
}

// shown reports whether a step is part of this player's walk: its node gate
// passes and its list offers something. A step that is not shown is skipped in
// both directions and leaves no summary line (D5).
func (c *ascensionCeremony) shown(node *mobs.InteractionNode, p learner) bool {
	step := c.steps[node.Rows]
	return step != nil && conditionsPass(node.Gate, p) && len(step.PresentRows(node, p)) > 0
}

// nextShown is where a pick on this step leads: the next shown step in
// `ceremony` order, else the summary. ⭐ THE ONE PLACE THE ORDER IS WALKED
// FORWARD; the summary walks the same list through drafted().
func (c *ascensionCeremony) nextShown(node *mobs.InteractionNode, p learner) string {
	cer := node.Ceremony
	if cer == nil {
		return ""
	}
	after := false
	for _, s := range cer.Steps {
		if after && c.shown(s, p) {
			return s.ID
		}
		if s == node {
			after = true
		}
	}
	return cer.Summary.ID
}

// draftedStep is one shown step and its pick, if it still stands.
type draftedStep struct {
	node *mobs.InteractionNode
	pick skills.StepPick
}

// drafted walks the ceremony's shown steps against the player's draft.
// complete is false when a shown step has no pick that still stands, and only
// a complete draft offers or accepts Confirm.
//
// ⭐ Present and apply both read this, so the summary cannot offer a Confirm
// that the click then refuses (L24). A pick that stopped standing (its reward
// spent, its gate regressed) counts as missing: the line goes, Confirm goes,
// and the panel's Back leads to the step to pick again.
func (c *ascensionCeremony) drafted(summary *mobs.InteractionNode, p learner) (steps []draftedStep, complete bool) {
	cer := summary.Ceremony
	if cer == nil {
		return nil, false
	}
	draft := p.CeremonyDraft()
	complete = true
	for _, s := range cer.Steps {
		if !c.shown(s, p) {
			continue
		}
		pick, ok := draft.Pick(s.ID)
		if !ok || !c.steps[s.Rows].stillPickable(s, p, pick.Key) {
			complete = false
			continue
		}
		steps = append(steps, draftedStep{node: s, pick: pick})
	}
	return steps, complete && len(steps) > 0
}

// summaryRows is the generated summary (D6): one inert line per drafted step,
// in order, then Confirm once the draft is complete.
func (c *ascensionCeremony) summaryRows(node *mobs.InteractionNode, p learner) []model.ConversationOption {
	steps, complete := c.drafted(node, p)
	rows := make([]model.ConversationOption, 0, len(steps)+1)
	for i, s := range steps {
		rows = append(rows, c.steps[s.node.Rows].summaryLine(s.node, i, s.pick.Key))
	}
	if cer := node.Ceremony; cer != nil && cer.HeirHome != "" && len(steps) > 0 {
		// The stone's home (D13, Q4). The client names the place from its area.
		rows = append(rows, model.ConversationOption{
			OptionIndex: summaryHeirHomeIndex,
			GrantIndex:  model.ConversationNoGrant,
			Locked:      true,
			Text:        "Your heir wakes at: " + cer.HeirHomeArea,
			TextKey:     "conversation.ascend.summary.heir-home",
			Place:       cer.HeirHomeArea,
		})
	}
	if complete {
		rows = append(rows, model.ConversationOption{
			OptionIndex: summaryConfirmIndex,
			// ⭐ NEVER model.ConversationNoGrant: the client sends only a row
			// whose grant index is not the sentinel.
			GrantIndex: 0,
			Text:       "Ascend.",
			TextKey:    "conversation.ascend.confirm",
			Reply:      "Channelling now. Walk away to cancel.",
			ReplyKey:   "conversation.ascend.channel",
			// The countdown moved here from the gift row (D6).
			ConfirmSeconds: ascensionConfirmSeconds,
		})
	}
	return rows
}

// confirm stashes the whole draft and starts the channel: the ONLY start path
// (L3).
//
// ⭐ THE SITE'S PRICE RIDES ALONG (plan-ascension-sites.md P1): the summary
// node carries the stone's gate (the loader copies the first step's), stashed
// whole, mode included, and re-judged when the channel completes.
func (c *ascensionCeremony) confirm(node *mobs.InteractionNode, p learner, option int) (string, bool) {
	if option != summaryConfirmIndex {
		return "", false
	}
	steps, complete := c.drafted(node, p)
	sc := p.SkillComponent()
	if !complete || sc == nil {
		return "", false
	}
	pick := &skills.AscensionPick{Gate: node.Gate, HeirHome: node.Ceremony.HeirHome}
	for _, s := range steps {
		pick.Picks = append(pick.Picks, s.pick)
		pick.BonusLooks = append(pick.BonusLooks, s.node.BonusLooks...)
	}
	sc.PendingAscension = pick
	sc.StartUtilityCast(skills.UtilityAscend)
	return "Channelling now. Walk away to cancel.", true
}

// CompleteAscension re-judges every confirmed pick against the live player and
// builds the grants (D9). One pick that no longer stands refuses the whole
// ascension: never a partial grant.
func (c *ascensionCeremony) CompleteAscension(p learner, pick *skills.AscensionPick) (persist.AscensionRequest, bool) {
	var req persist.AscensionRequest
	if pick == nil || len(pick.Picks) == 0 {
		return req, false // nothing confirmed: fail closed
	}
	for _, sp := range pick.Picks {
		step := c.steps[mobs.RowSourceKind(sp.Kind)]
		if step == nil || !step.validate(p, sp.Key) {
			return persist.AscensionRequest{}, false
		}
		step.grant(sp.Key, &req)
	}
	// ⭐ THE HEIR-HOME PRECEDENCE (D14), fixed here so a later step kind does
	// not invent its own: the LAST step in ceremony order whose pick names a
	// home wins (the picks run in that order and each grant overwrites
	// req.HeirHome); else the stone's heirHome; else unbound. No shipped step
	// kind names a home yet (Q5).
	if req.HeirHome == "" {
		req.HeirHome = pick.HeirHome
	}
	return req, true
}
