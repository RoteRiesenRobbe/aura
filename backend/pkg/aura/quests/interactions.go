package quests

import (
	"fmt"
	"sort"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
)

// conversantSource is the slice of mobs.Registry this pass needs.
type conversantSource interface {
	Mobs() []*mobs.MobDefinition
}

// CrossValidate checks every quest reference authored on a conversation row, and
// registers the dialogue edges those rows create (plan-quests.md C2).
//
// ⚑ Why it is its own pass rather than part of the mob loader: mobs load BEFORE
// quests, because quest objectives resolve species NAMES against the mob registry
// (L12) — so when mapToInteraction runs there is no quest to check against. Both
// registries have to stand first, which is why this is called from the boot
// sequence and not from either loader.
//
// It runs in two phases, and the split is load-bearing rather than tidy:
// terminality is DERIVED, not authored (C1's shape decision ①) — a dialogue stage
// is terminal iff NOTHING in the world advances out of it. So every edge in the
// world must be registered before any question about a stage being terminal can be
// answered, which is what L10's grant_xp rule asks.
//
// Errors are boot failures, the loader ethos. Warnings are content that loads and
// runs but cannot be reached in play; they are warnings and not failures because
// the QUEST cheat deliberately drives a quest before its rows exist, which is how
// C4 iterates.
func CrossValidate(mr conversantSource, qr Registry) ([]string, error) {
	offered := map[string]bool{}

	// Phase 1: validate every reference, and register the branch edges.
	for _, def := range mr.Mobs() {
		if def.Interaction == nil {
			continue
		}
		for ni := range def.Interaction.Nodes {
			node := &def.Interaction.Nodes[ni]
			for _, cond := range node.Conditions {
				if cond.Kind != mobs.ConditionQuestAtStage {
					continue
				}
				if err := checkStageRef(qr, def.Name, node.ID, cond.Quest, cond.Stage); err != nil {
					return nil, err
				}
			}
			for oi := range node.Options {
				for _, g := range node.Options[oi].Grants {
					q, err := questOf(qr, def.Name, node.ID, oi, g)
					if err != nil {
						return nil, err
					}
					if q == nil {
						continue
					}
					where := fmt.Sprintf("mob %q: interaction node %q option %d", def.Name, node.ID, oi)
					switch g.Kind {
					case mobs.GrantOfferQuest:
						offered[q.ID] = true
					case mobs.GrantAdvanceQuest:
						if err := checkEdge(q, where, g); err != nil {
							return nil, err
						}
						q.NoteDialogueEdgeFrom(g.FromStage)
					}
				}
			}
		}
	}

	// Phase 2: the questions that need every edge registered first.
	for _, def := range mr.Mobs() {
		if def.Interaction == nil {
			continue
		}
		for ni := range def.Interaction.Nodes {
			node := &def.Interaction.Nodes[ni]
			for oi := range node.Options {
				if err := checkXPIsTerminal(qr, def.Name, node.ID, oi, &node.Options[oi]); err != nil {
					return nil, err
				}
			}
		}
	}

	var warnings []string
	for _, q := range qr.All() {
		if !offered[q.ID] {
			warnings = append(warnings, fmt.Sprintf("quest %q is offered by no conversant, so it cannot be "+
				"started in play (plan-quests.md D11) — only the QUEST cheat can reach it", q.ID))
		}
	}
	sort.Strings(warnings)
	return warnings, nil
}

// questOf resolves the quest a grant names, or nil for a grant that names none.
func questOf(qr Registry, mob, nodeID string, oi int, g mobs.InteractionGrant) (*QuestDefinition, error) {
	if g.Quest == "" {
		return nil, nil
	}
	q, err := qr.Get(g.Quest)
	if err != nil {
		return nil, fmt.Errorf("mob %q: interaction node %q option %d: %s names quest %q, which no quest file "+
			"defines", mob, nodeID, oi, g.Kind, g.Quest)
	}
	return q, nil
}

// checkEdge validates one advance_quest row against the stage graph.
func checkEdge(q *QuestDefinition, where string, g mobs.InteractionGrant) error {
	from := q.Stage(g.FromStage)
	if from == nil {
		return fmt.Errorf("%s: advance_quest names fromStage %q, which quest %q does not define",
			where, g.FromStage, q.ID)
	}
	if q.Stage(g.ToStage) == nil {
		return fmt.Errorf("%s: advance_quest names toStage %q, which quest %q does not define",
			where, g.ToStage, q.ID)
	}
	// An objective stage advances off the lifetime counters (D3). A row moving one
	// would be a second, silent way out of the same stage, and the two would
	// disagree about which next stage the player gets.
	if len(from.Objectives) > 0 {
		return fmt.Errorf("%s: advance_quest leaves stage %q, but that is an objective stage — it advances off "+
			"its counters, not off a row", where, g.FromStage)
	}
	return nil
}

// checkXPIsTerminal is L10's second half, and only this pass can see it:
// abandoning a quest leaves the lifetime counters standing (D13), so its objective
// stages re-complete the instant it is re-accepted. Any grant_xp on an edge that
// does NOT end the quest is therefore loopable — accept, walk to the reward,
// abandon, repeat. A terminal edge is safe because completion is recorded in the
// completed set, which abandon never touches.
func checkXPIsTerminal(qr Registry, mob, nodeID string, oi int, opt *mobs.InteractionOption) error {
	var advance *mobs.InteractionGrant
	hasXP := false
	for i := range opt.Grants {
		switch opt.Grants[i].Kind {
		case mobs.GrantAdvanceQuest:
			advance = &opt.Grants[i]
		case mobs.GrantXP:
			hasXP = true
		}
	}
	if !hasXP || advance == nil {
		// A standalone grant_xp is already refused by the mob loader, which does
		// not need the stage graph to see it.
		return nil
	}

	q, err := qr.Get(advance.Quest)
	if err != nil {
		return err // phase 1 already reported this with the better message
	}
	if to := q.Stage(advance.ToStage); to != nil && !q.IsTerminal(to) {
		return fmt.Errorf("mob %q: interaction node %q option %d: grant_xp sits on the edge %q → %q, which does "+
			"not end quest %q — abandon leaves the counters standing, so that XP is loopable "+
			"(plan-quests.md L10)", mob, nodeID, oi, advance.FromStage, advance.ToStage, q.ID)
	}
	return nil
}

// checkStageRef validates a quest_at_stage condition: the quest must exist and
// Stage must name a real stage or one of the two sentinels.
// CheckStageRef validates one quest_at_stage reference against the quest graph:
// the quest must exist, and the stage must be one that quest defines or one of
// the two sentinels.
//
// ⭐ EXPORTED because a dialogue node is no longer the only surface carrying
// these conditions: an ascension catalog entry carries the same list
// (plan-ascension.md D18, "two surfaces, one language"), and the catalog's own
// loader calls this rather than re-implementing it. A second checker would
// drift the day a third sentinel is added, and the drift would surface as
// content that boots on one surface and fails on the other.
//
// ⚑ The error names the failure but NOT where it was authored; callers add
// that, exactly as mobs.ParseCondition's own comment requires. "Mob X node Y"
// and "ascension entry FrostShield" are the same mistake in two different files.
func CheckStageRef(qr Registry, questID, stage string) error {
	q, err := qr.Get(questID)
	if err != nil {
		return fmt.Errorf("quest_at_stage names quest %q, which no quest file defines", questID)
	}
	switch stage {
	case mobs.QuestStageNotStarted, mobs.QuestStageCompleted:
		return nil
	}
	if q.Stage(stage) == nil {
		return fmt.Errorf("quest_at_stage names stage %q, which quest %q does not define (or use %q / %q)",
			stage, questID, mobs.QuestStageNotStarted, mobs.QuestStageCompleted)
	}
	return nil
}

// checkStageRef is CheckStageRef with the dialogue-node authoring site named.
func checkStageRef(qr Registry, mob, nodeID, questID, stage string) error {
	if err := CheckStageRef(qr, questID, stage); err != nil {
		return fmt.Errorf("mob %q: interaction node %q: %w", mob, nodeID, err)
	}
	return nil
}
