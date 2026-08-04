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

	// NextAbandonQuest deques an AbandonQuest message received
	// from the client (plan-quests.md C3, D13)
	NextAbandonQuest() *AbandonQuest

	// NextRespec deques a Respec (spellbook reset-all) message received
	// from the client (round-7 item 8). Returns nil if none available.
	NextRespec() *Respec

	// NextUseUtility deques a baseline-utility press (plan-downtime.md C1).
	// Returns nil if none available.
	NextUseUtility() *UseUtility

	// NextStartFlight deques a flight request (plan-flight-paths.md C2).
	// Returns nil if none available.
	NextStartFlight() *StartFlight

	// SendMessage enqueues a message in the outgoing
	// messages queue
	SendMessage([]byte) error

	// SendUnlock enqueues a skill-unlock EntityMessage (kind=Unlock) carrying
	// the unlocked skill id and a human-readable source label (e.g.
	// "Taught by: Farmer"). The client composes the "New <category>: <name>"
	// line from its catalog and shows the source label beneath it — see
	// plan-unlock-attribution.md.
	SendUnlock(skillID uint64, source string) error

	// SendJournal enqueues a journal ping (kind=Journal) carrying only the
	// banner line — a quest entered a new stage, or finished (plan-quests.md
	// D17). ⚑ GARNISH ONLY: this channel drops on a full buffer, so nothing
	// durable may ride it; the journal's actual state is re-sent every tick on
	// GameState.quest_progress (L8).
	SendJournal(text string) error

	// Close closes the connection and disconnects the client
	Close()

	// UUID returns the id of the connected user
	UUID() uuid.UUID
}
