package model

import "github.com/google/uuid"

// Client is the interface representing the underlying
// connection to a player/client.
type Client interface {
	// NextInput deques a PlayerInput message received
	// from the client. Returns nil if none available.
	NextInput() *PlayerInput

	// NextJoin deques a Join message received
	// from the client. Returns nil if none available.
	NextJoin() *Join

	// NextCheat deques a Cheat message received
	// from the client. Returns nil if none available.
	NextCheat() *Cheat

	// NextChat deques a Chat message received
	// from the client. Returns nil if none available.
	NextChatMessage() *ChatMessage

	// NextEquip deques an EquipSkill message received
	// from the client. Returns nil if none available.
	NextEquip() *EquipSkill

	// NextSpendSkillPoint deques a SpendSkillPoint message received
	// from the client. Returns nil if none available.
	NextSpendSkillPoint() *SpendSkillPoint

	// NextRespawn deques a Respawn message received
	// from the client. Returns nil if none available.
	NextRespawn() *Respawn

	// NextInteract deques an Interact message received
	// from the client. Returns nil if none available.
	NextInteract() *Interact

	// SendMessage enqueues a message in the outgoing
	// messages queue
	SendMessage([]byte) error

	// SendUnlock enqueues a skill-unlock EntityMessage (kind=Unlock) carrying
	// the unlocked skill id and a human-readable source label (e.g.
	// "Taught by: Farmer"). The client composes the "New <category>: <name>"
	// line from its catalog and shows the source label beneath it — see
	// plan-unlock-attribution.md.
	SendUnlock(skillID uint64, source string) error

	// Close closes the connection and disconnects the client
	Close()

	// UUID returns the id of the connected user
	UUID() uuid.UUID
}
