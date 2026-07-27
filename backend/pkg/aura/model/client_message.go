package model

import "github.com/RoteRiesenRobbe/aura/pkg/aura/skills"

// Models for messages that will be unmarshalled from a 'ClientMessage'
// These are merely structs or type alias holding data.

type Join struct {
	PlayerName string
	// ReconnectToken is empty on a first join; when it matches a stashed
	// disconnected character, that character is restored instead.
	ReconnectToken string
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

// Interact is a request to open a conversation with the actor the server told
// this client is in range (GameState.interactable_entity_id, chunk 3b-i). The
// id is echoed back rather than implied so a stale keypress names what the
// player actually saw; the server refuses anything that does not match the
// value it stamped this tick.
type Interact struct {
	EntityID uint64
}

// SpendSkillPoint is a one-shot request to spend (or, with Unspend, refund)
// one skill point on a discovered skill, raising/lowering its spellbook level
// by one. The server validates point availability and level bounds.
type SpendSkillPoint struct {
	SkillID skills.SkillID
	Unspend bool
}
