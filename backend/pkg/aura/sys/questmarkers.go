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
		var turnIns, offers []string
		if c := present(in, p, nil, nil); c != nil {
			for _, g := range reachableQuestGrants(in, c) {
				switch g.Kind {
				case mobs.GrantAdvanceQuest:
					turnIn = true
					turnIns = append(turnIns, g.Quest)
				case mobs.GrantOfferQuest:
					offers = append(offers, g.Quest)
					level := ledger.Level(g.Quest)
					if level < playerLevel && level <= trivialBelow {
						trivialOffer = lowestPositive(trivialOffer, level)
					} else {
						offer = lowestPositive(offer, level)
					}
				}
			}
		}

		awaited := awaitedQuestsFinishedBy(in, p)
		m := model.QuestMarker{Mob: def.ID, Quests: uniqueQuests(turnIns, offers, awaited)}
		switch {
		case turnIn:
			m.Kind = model.QuestMarkerTurnIn
		case offer > 0:
			m.Kind, m.Level = model.QuestMarkerOffer, offer
		case trivialOffer > 0:
			m.Kind, m.Level = model.QuestMarkerOffer, trivialOffer
		case len(awaited) > 0:
			m.Kind = model.QuestMarkerInProgress
		default:
			continue
		}
		out = append(out, m)
	}
	return out
}

// uniqueQuests concatenates the lists, keeping each quest id's first place.
func uniqueQuests(lists ...[]string) []string {
	var out []string
	seen := map[string]bool{}
	for _, list := range lists {
		for _, id := range list {
			if !seen[id] {
				seen[id] = true
				out = append(out, id)
			}
		}
	}
	return out
}

// reachableQuestGrants walks the presented tree from its entry node along
// navigation rows and returns the lead grant of every quest row met on the way.
// The lead grant is the row's kind: a trailing offer_quest inside a turn-in
// bundle (Eliza's dinner) is a reward, not an offer.
func reachableQuestGrants(in *mobs.Interaction, c *model.Conversation) []*mobs.InteractionGrant {
	grants, _ := questWalk(in, presentedByID(c), c.EntryNode, map[string]bool{})
	return grants
}

// presentedByID indexes a presented conversation's nodes by id.
func presentedByID(c *model.Conversation) map[string]*model.ConversationNode {
	presented := make(map[string]*model.ConversationNode, len(c.Nodes))
	for i := range c.Nodes {
		presented[c.Nodes[i].ID] = &c.Nodes[i]
	}
	return presented
}

// questWalk walks the presented tree from start along navigation rows, never
// entering a node already in seen (which it extends), and returns the lead
// grant of every quest row met plus the ids of the nodes it reached. Rows on a
// row-source node and locked rows count for nothing (M landmine 3).
func questWalk(in *mobs.Interaction, presented map[string]*model.ConversationNode,
	start string, seen map[string]bool) (grants []*mobs.InteractionGrant, reached []string) {
	if seen[start] {
		return nil, nil
	}
	seen[start] = true
	queue := []string{start}
	for len(queue) > 0 {
		id := queue[0]
		queue = queue[1:]
		node, authored := presented[id], nodeByID(in, id)
		if node == nil || authored == nil {
			continue
		}
		reached = append(reached, id)
		for i := range node.Options {
			row := &node.Options[i]
			if row.Next != "" && !seen[row.Next] {
				seen[row.Next] = true
				queue = append(queue, row.Next)
			}
			if g := leadQuestGrant(authored, row); g != nil {
				grants = append(grants, g)
			}
		}
	}
	return grants, reached
}

// leadQuestGrant is the quest grant a presented row hands over when taken, or
// nil: the row's lead grant decides its kind (a trailing offer_quest in a
// turn-in bundle is a reward).
func leadQuestGrant(authored *mobs.InteractionNode, row *model.ConversationOption) *mobs.InteractionGrant {
	if authored.Rows != "" || row.Locked || row.GrantIndex == model.ConversationNoGrant ||
		int(row.OptionIndex) >= len(authored.Options) {
		return nil
	}
	opt := &authored.Options[row.OptionIndex]
	if len(opt.Grants) > 0 && opt.Grants[0].Kind.IsQuestKind() {
		return &opt.Grants[0]
	}
	return nil
}

// awaitedQuestsFinishedBy lists p's running quests for which this conversant
// authors an advance_quest row leaving the stage the quest is working towards:
// the grey `?` (D11).
func awaitedQuestsFinishedBy(in *mobs.Interaction, p learner) []string {
	var quests []string
	for i := range in.Nodes {
		quests = appendAwaited(quests, &in.Nodes[i], p)
	}
	return quests
}

// appendAwaited is awaitedQuestsFinishedBy for one node. It reads the AUTHORED
// options, never the presented rows: the hand-in row is hidden while the quest
// runs, which is exactly when the grey `?` shows (plan-dialogue-quest-icons.md L2).
func appendAwaited(quests []string, node *mobs.InteractionNode, p learner) []string {
	ledger := p.QuestLedger()
	for j := range node.Options {
		opt := &node.Options[j]
		if len(opt.Grants) == 0 || opt.Grants[0].Kind != mobs.GrantAdvanceQuest {
			continue
		}
		g := &opt.Grants[0]
		if awaited := ledger.AwaitedStage(g.Quest); awaited != "" && awaited == g.FromStage {
			quests = append(quests, g.Quest)
		}
	}
	return quests
}

// stampQuestMarkers gives every presented row the marker the NPC's head would
// wear if that row were the whole conversation (plan-dialogue-quest-icons.md
// D2): its own quest grant plus everything reachable beneath it, turn-in over
// offer over in-progress. An offer row's QuestLevel is the lowest offer met (Q2).
//
// ⚑ It reuses the conversation present() just built and never presents again
// (L5): present() runs per tick for an open panel.
//
// ⚑ The walk below a row never enters the entry node or the row's own node, so
// a row pointing back up the tree does not inherit the whole NPC's marker.
func stampQuestMarkers(in *mobs.Interaction, c *model.Conversation, p learner) {
	ledger := p.QuestLedger()
	if ledger == nil {
		return
	}
	presented := presentedByID(c)
	for ni := range c.Nodes {
		node := &c.Nodes[ni]
		authored := nodeByID(in, node.ID)
		if authored == nil || authored.Rows != "" {
			continue
		}
		for ri := range node.Options {
			row := &node.Options[ri]
			if row.Locked {
				continue
			}
			var grants []*mobs.InteractionGrant
			if g := leadQuestGrant(authored, row); g != nil {
				grants = append(grants, g)
			}
			var awaited []string
			if row.Next != "" {
				below, reached := questWalk(in, presented, row.Next, map[string]bool{c.EntryNode: true, node.ID: true})
				grants = append(grants, below...)
				for _, id := range reached {
					awaited = appendAwaited(awaited, nodeByID(in, id), p)
				}
			}

			turnIn, offered, level := false, false, 0
			for _, g := range grants {
				switch g.Kind {
				case mobs.GrantAdvanceQuest:
					turnIn = true
				case mobs.GrantOfferQuest:
					offered, level = true, lowestPositive(level, ledger.Level(g.Quest))
				}
			}
			switch {
			case turnIn:
				row.QuestMarker = model.QuestMarkerTurnIn
			case offered:
				row.QuestMarker, row.QuestLevel = model.QuestMarkerOffer, uint8(min(level, 255))
			case len(awaited) > 0:
				row.QuestMarker = model.QuestMarkerInProgress
			}
		}
	}
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
