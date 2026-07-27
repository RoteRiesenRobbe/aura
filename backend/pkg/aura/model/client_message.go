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

// Interact is the panel's one upstream message (chunks 3b-i and 3b-ii). The
// entity id is echoed back rather than implied so a stale keypress names what
// the player actually saw; the server refuses anything that does not match the
// value it stamped this tick.
//
// Three shapes, distinguished by their zero values:
//   - NodeID empty, Close false → open the conversation
//   - NodeID set               → take that node's row
//   - Close true               → dismiss the panel (Leave / Escape / second E)
type Interact struct {
	EntityID uint64
	// NodeID is the node the row was taken from. The server re-checks that
	// node's own conditions rather than trusting the client's position in the
	// tree — every apply is validated on its own merits (D16).
	NodeID string
	// ⚑ AUTHORED indices, streamed to the client in ConversationOption and
	// echoed back verbatim (L21). ConversationNoGrant = none.
	OptionIndex uint8
	GrantIndex  uint8
	Close       bool
}

// SpendSkillPoint is a one-shot request to spend (or, with Unspend, refund)
// one skill point on a discovered skill, raising/lowering its spellbook level
// by one. The server validates point availability and level bounds.
type SpendSkillPoint struct {
	SkillID skills.SkillID
	Unspend bool
}
