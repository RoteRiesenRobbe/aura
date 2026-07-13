package model

import "github.com/trichner/berryhunter/pkg/berryhunter/skills"

// Models for messages that will be unmarshalled from a 'ClientMessage'
// These are merely structs or type alias holding data.

type Join struct {
	PlayerName string
}

type Cheat struct {
	Token, Command string
}

type ChatMessage string

// EquipSkill is a one-shot request to move a discovered skill into a loadout slot.
type EquipSkill struct {
	SkillID skills.SkillID
	Slot    int
}

// Respawn is a dead client's request to come back, sent from the death
// overlay instead of a fresh Join: the server reuses the reserved name and
// carried progression and spawns at the campfire anchor. Only honored while
// the client is a dead spectator.
type Respawn struct{}

// SpendSkillPoint is a one-shot request to spend (or, with Unspend, refund)
// one skill point on a discovered skill, raising/lowering its spellbook level
// by one. The server validates point availability and level bounds.
type SpendSkillPoint struct {
	SkillID skills.SkillID
	Unspend bool
}
