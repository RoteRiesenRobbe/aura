package model

import "github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"

// QuestMarkerKind is what a quest giver shows over its head and on the map for
// one player (plan-quest-giver-markers.md D2). The numbering is the wire's
// (GameState.quest_markers), so a value never changes meaning.
type QuestMarkerKind uint8

const (
	QuestMarkerNone QuestMarkerKind = iota
	// QuestMarkerOffer is `!`: a quest this player can accept here, tinted by
	// Level against the player's level.
	QuestMarkerOffer
	// QuestMarkerTurnIn is the yellow `?`: a quest step this player can take
	// here right now.
	QuestMarkerTurnIn
	// QuestMarkerInProgress is the grey `?`: this NPC finishes a quest the
	// player is still working on.
	QuestMarkerInProgress
)

// QuestMarker is one conversant definition's marker for one player. It is
// keyed by the DEFINITION, not by a placement (D10): every entity and every
// spawn of that mob shows it, so the wire carries no positions and nothing per
// zone.
type QuestMarker struct {
	Mob  mobs.MobID
	Kind QuestMarkerKind
	// Level is the offer's target level, which the `!` is tinted by; 0 on the
	// two `?` kinds, which are not tinted.
	Level int
	// Quests are the ids of every quest the marker covers, whatever its kind:
	// the steps to take here now, the offers, then the quests this NPC finishes
	// later. The world map's hover names them (titles from the /quests catalog).
	Quests []string
}
