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
