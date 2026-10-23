package mobs

// LockKind mirrors AuraApi.ConversationLockKind (pinned in codec).
type LockKind uint8

const (
	LockMinLevel      LockKind = 0
	LockAscensions    LockKind = 1
	LockQuestAtStage  LockKind = 2
	LockQuestComplete LockKind = 3
	LockKills         LockKind = 4
	LockTravelClosed  LockKind = 5
	LockSkillLevel    LockKind = 6
	// LockStoneGift is a look only an ascension stone gives
	// (plan-appearance.md C5b): no condition, no progress.
	LockStoneGift LockKind = 7
	LockUnknown   LockKind = 255
)

// LockReason is one reason a row is locked, as data the client words
// (plan-localization.md C3): never a composed sentence.
type LockReason struct {
	Kind        LockKind
	Value, Have uint32
	Quest       string
	Stage       string
	Species     uint64
	Skill       uint16 // a skill_level reason's skill id
}

// LockReasonOf is one authored condition as lock data, without any player's
// progress (Have stays 0). Two surfaces word conditions on the client: a
// locked conversation row (sys.lockReasons adds the player's count) and a
// locked appearance item in /appearance (plan-appearance.md §4.2, D25). One
// mapping serves both, so the two cannot drift into two dialects.
func LockReasonOf(c InteractionCondition) LockReason {
	r := LockReason{Kind: LockUnknown, Value: uint32(c.Value)}
	switch c.Kind {
	case ConditionMinLevel:
		r.Kind = LockMinLevel
	case ConditionBloodlineAscensions:
		r.Kind = LockAscensions
	case ConditionQuestAtStage:
		r.Kind, r.Quest, r.Stage = LockQuestAtStage, c.Quest, c.Stage
		if c.Stage == QuestStageCompleted {
			r.Kind, r.Stage = LockQuestComplete, ""
		}
	case ConditionKillsThisLife:
		r.Kind, r.Species = LockKills, uint64(c.SpeciesID)
	case ConditionSkillLevel:
		r.Kind, r.Skill = LockSkillLevel, uint16(c.SkillID)
	}
	return r
}
