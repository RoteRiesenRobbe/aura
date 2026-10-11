package sys

import (
	"github.com/RoteRiesenRobbe/aura/pkg/aura/curve"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
)

// QuestMarkers is what every conversant definition shows p over its head and on
// the map (plan-quest-giver-markers.md C2): `!` for a quest to take, a yellow
// `?` for a quest step to take, a grey `?` for a quest p is still working on
// that this NPC finishes. One marker per definition with something to show,
// in the order defs come in.
//
// ⭐ `!` and the yellow `?` are READ OFF present(), never re-derived (landmine
// 1): a marker is "the panel would offer this row", so the two cannot disagree
// (the N1 lesson). Only rows the panel can reach from its entry node count.
// The grey `?` has no row to read (the turn-in is hidden while the quest runs),
// so it is the one static rule: an advance_quest row leaving the stage p's
// running quest is working towards (D11).
//
// ⚑ present() per conversant is not free, so this runs only when the owner
// block is due (core/net.go ownerStateGate), never per tick (landmine 2).
// Row-source nodes are skipped (landmine 3): they never carry quest rows, and
// no source is passed, so the memorial's DB snapshot is never read here.
func QuestMarkers(defs []*mobs.MobDefinition, p learner, killXP curve.KillXP) []model.QuestMarker {
	ledger := p.QuestLedger()
	if ledger == nil {
		return nil
	}
	playerLevel := int(p.Progression().Level)
	// Grey (trivial) is the kill-XP rule and the client's difficultyColor: strictly
	// below the player AND at or past the gray distance. `< playerLevel` matters
	// only for a degenerate gray distance of 0, which must not grey an at-level quest.
	trivialBelow := playerLevel - killXP.GrayDistance(playerLevel)

	var out []model.QuestMarker
	for _, def := range defs {
		in := def.Interaction
		if in == nil {
			continue
		}

		turnIn := false
		offer := 0        // the lowest non-trivial offer level, 0 = none
		trivialOffer := 0 // the lowest trivial offer level, 0 = none
		if c := present(in, p, nil, nil); c != nil {
			for _, g := range reachableQuestGrants(in, c) {
				switch g.Kind {
				case mobs.GrantAdvanceQuest:
					turnIn = true
				case mobs.GrantOfferQuest:
					level := ledger.Level(g.Quest)
					if level < playerLevel && level <= trivialBelow {
						trivialOffer = lowestPositive(trivialOffer, level)
					} else {
						offer = lowestPositive(offer, level)
					}
				}
			}
		}

		switch {
		case turnIn:
			out = append(out, model.QuestMarker{Mob: def.ID, Kind: model.QuestMarkerTurnIn})
		case offer > 0:
			out = append(out, model.QuestMarker{Mob: def.ID, Kind: model.QuestMarkerOffer, Level: offer})
		case trivialOffer > 0:
			out = append(out, model.QuestMarker{Mob: def.ID, Kind: model.QuestMarkerOffer, Level: trivialOffer})
		case finishesAwaitedStage(in, p):
			out = append(out, model.QuestMarker{Mob: def.ID, Kind: model.QuestMarkerInProgress})
		}
	}
	return out
}

// reachableQuestGrants walks the presented tree from its entry node along
// navigation rows and returns the lead grant of every quest row met on the way.
// The lead grant is the row's kind: a trailing offer_quest inside a turn-in
// bundle (Eliza's dinner) is a reward, not an offer.
func reachableQuestGrants(in *mobs.Interaction, c *model.Conversation) []*mobs.InteractionGrant {
	presented := make(map[string]*model.ConversationNode, len(c.Nodes))
	for i := range c.Nodes {
		presented[c.Nodes[i].ID] = &c.Nodes[i]
	}

	var grants []*mobs.InteractionGrant
	seen := map[string]bool{c.EntryNode: true}
	queue := []string{c.EntryNode}
	for len(queue) > 0 {
		id := queue[0]
		queue = queue[1:]
		node, authored := presented[id], nodeByID(in, id)
		if node == nil || authored == nil {
			continue
		}
		for _, row := range node.Options {
			if row.Next != "" && !seen[row.Next] {
				seen[row.Next] = true
				queue = append(queue, row.Next)
			}
			if authored.Rows != "" || row.Locked || row.GrantIndex == model.ConversationNoGrant ||
				int(row.OptionIndex) >= len(authored.Options) {
				continue
			}
			opt := &authored.Options[row.OptionIndex]
			if len(opt.Grants) > 0 && opt.Grants[0].Kind.IsQuestKind() {
				grants = append(grants, &opt.Grants[0])
			}
		}
	}
	return grants
}

// finishesAwaitedStage reports whether this conversant authors an
// advance_quest row leaving the stage one of p's running quests is working
// towards: the grey `?` (D11).
func finishesAwaitedStage(in *mobs.Interaction, p learner) bool {
	ledger := p.QuestLedger()
	for i := range in.Nodes {
		for j := range in.Nodes[i].Options {
			opt := &in.Nodes[i].Options[j]
			if len(opt.Grants) == 0 || opt.Grants[0].Kind != mobs.GrantAdvanceQuest {
				continue
			}
			g := &opt.Grants[0]
			if awaited := ledger.AwaitedStage(g.Quest); awaited != "" && awaited == g.FromStage {
				return true
			}
		}
	}
	return false
}

func lowestPositive(current, candidate int) int {
	if candidate <= 0 {
		return current
	}
	if current == 0 || candidate < current {
		return candidate
	}
	return current
}
