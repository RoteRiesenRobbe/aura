package sys

import (
	"github.com/EngoEngine/ecs"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/quests"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/world"
)

// questActor is the minimal player surface the system needs: the inbox the
// journal's abandon rows arrive in, and the ledger they act on. Deliberately
// narrower than model.PlayerEntity — the interactor/equipEntity precedent — so
// the tests' doubles stay small.
type questActor interface {
	Basic() ecs.BasicEntity
	Client() model.Client
	QuestLedger() *quests.Ledger
	// Where the player stands and whether they are airborne, for the reach
	// objective's arrival check (plan-region-identity.md R2).
	Position() phy.Vec2f
	Flying() bool
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
//
// ⭐ Since plan-region-identity.md R2 it also runs the ONE per-tick quest check:
// is a player sent somewhere standing there? It is not a scan of the world. A
// player whose current stages name no region (almost everyone) costs one empty
// slice read; the ledger keeps that list current when a quest moves. The title
// card does the same containment test in the browser, but the ledger lives on
// the server, and a client-reported arrival would let a client finish any
// "go to" quest from anywhere.
type QuestSystem struct {
	players []questActor
	// regions maps each place id to its polygons in world coordinates
	// (world.CollectRegions, after Place).
	regions map[string][]world.PlacedRegion
}

func NewQuestSystem(regions map[string][]world.PlacedRegion) *QuestSystem {
	return &QuestSystem{regions: regions}
}

// Priority 20, alongside MobSystem and InteractionSystem. Nothing here depends
// on tick order: an abandon reads and writes only the player's own ledger, and
// the next snapshot carries the result either way.
func (s *QuestSystem) Priority() int { return 20 }

func (s *QuestSystem) New(w *ecs.World) {}

func (s *QuestSystem) AddPlayer(p questActor) {
	s.players = append(s.players, p)
}

// Update drains one abandon per player per tick, then reports arrivals.
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
	for _, p := range s.players {
		s.checkReach(p)
	}
}

// checkReach reports the player standing inside a region a current stage sends
// them to (D5: the first tick inside counts, no dwell). A flyer is skipped (D8);
// a dead player is not here at all, because death removes the entity from every
// system. A reach target tests ITS region's polygons, whatever is drawn above
// them (D4).
//
// ⚑ Priority 20 reads the position the last physics step left: one tick late,
// which an arrival cannot feel.
func (s *QuestSystem) checkReach(p questActor) {
	ledger := p.QuestLedger()
	targets := ledger.ReachTargets()
	if len(targets) == 0 || p.Flying() {
		return
	}
	pos := p.Position()
	for _, region := range targets {
		if world.InRegion(s.regions[region], pos.X, pos.Y) {
			ledger.NoteReached(region)
		}
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
