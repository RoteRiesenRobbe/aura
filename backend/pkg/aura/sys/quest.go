package sys

import (
	"github.com/EngoEngine/ecs"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/quests"
)

// questActor is the minimal player surface the system needs: the inbox the
// journal's abandon rows arrive in, and the ledger they act on. Deliberately
// narrower than model.PlayerEntity — the interactor/equipEntity precedent — so
// the tests' doubles stay small.
type questActor interface {
	Basic() ecs.BasicEntity
	Client() model.Client
	QuestLedger() *quests.Ledger
}

// QuestSystem honours what arrives from the journal panel (plan-quests.md chunk
// C3): today that is exactly one verb, abandon (D13).
//
// It exists as its own system rather than as another branch of the
// InteractionSystem because the journal is not a conversation: an abandon needs
// no actor, no range check and no open session — it is a player acting on their
// own ledger. Everything else about a quest still happens where the events
// happen (counters at the kill fan-out, advances on conversation rows), which is
// why this stays one drain and does not grow a per-tick scan.
type QuestSystem struct {
	players []questActor
}

func NewQuestSystem() *QuestSystem { return &QuestSystem{} }

// Priority 20, alongside MobSystem and InteractionSystem. Nothing here depends
// on tick order: an abandon reads and writes only the player's own ledger, and
// the next snapshot carries the result either way.
func (s *QuestSystem) Priority() int { return 20 }

func (s *QuestSystem) New(w *ecs.World) {}

func (s *QuestSystem) AddPlayer(p questActor) {
	s.players = append(s.players, p)
}

// Update drains one abandon per player per tick.
//
// A refusal is silent and ordinary — the quest was already finished, never
// started, or moved a tick before the click landed. The journal re-renders from
// the ledger on the next snapshot, so a refused abandon simply leaves the row
// where it was rather than needing an error channel.
func (s *QuestSystem) Update(dt float32) {
	for _, p := range s.players {
		msg := p.Client().NextAbandonQuest()
		if msg == nil {
			continue
		}
		ledger := p.QuestLedger()
		if ledger == nil {
			continue
		}
		ledger.Abandon(msg.QuestID)
	}
}

func (s *QuestSystem) Remove(b ecs.BasicEntity) {
	for i, p := range s.players {
		if p.Basic().ID() == b.ID() {
			s.players = append(s.players[:i], s.players[i+1:]...)
			break
		}
	}
}
