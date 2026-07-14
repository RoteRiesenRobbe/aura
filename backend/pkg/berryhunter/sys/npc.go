package sys

import (
	"log/slog"

	"github.com/EngoEngine/ecs"
	"github.com/trichner/berryhunter/pkg/berryhunter/model"
)

// NpcSystem drives the peaceful teaching/lore NPCs (plan-npc-teaching.md).
//
// Chunk 2 (this file) is a placeholder: it holds the NPCs and, purely to
// verify the entity/placement wiring, logs on the rising edge when a player
// enters an NPC's proximity sensor — the static-body-vs-dynamic-sensor
// checkpoint. Chunk 3 replaces Update with the real grant + ordered
// level-gate + edge-triggered speech.
//
// It runs at the same priority as MobSystem (20), which likewise reads its
// aggro sensor's Collisions(): both act on the previous tick's physics
// broadphase result, which is exactly what approach detection wants.
type NpcSystem struct {
	npcs []model.NpcEntity

	// seen tracks, per NPC id, the set of player ids currently in the sensor,
	// so the temporary log fires only on change (a rising/falling edge) instead
	// of every one of the ~30 ticks/second a player stands in range.
	seen map[uint64]map[uint64]bool
}

func NewNpcSystem() *NpcSystem {
	return &NpcSystem{seen: map[uint64]map[uint64]bool{}}
}

func (s *NpcSystem) Priority() int {
	return 20
}

func (s *NpcSystem) New(w *ecs.World) {}

func (s *NpcSystem) AddEntity(e model.NpcEntity) {
	s.npcs = append(s.npcs, e)
}

func (s *NpcSystem) Update(dt float32) {
	for _, n := range s.npcs {
		id := n.Basic().ID()
		current := map[uint64]bool{}
		for c := range n.Sensor().Collisions() {
			p, ok := c.Shape().UserData.(model.PlayerEntity)
			if !ok {
				continue
			}
			current[p.Basic().ID()] = true
		}
		prev := s.seen[id]
		for pid := range current {
			if !prev[pid] {
				// TEMP (chunk 2 verification): a static NPC's dynamic sensor
				// reports a dynamic player — the checkpoint. Removed in chunk 3.
				slog.Info("npc sensor: player entered range",
					slog.Uint64("npc", id),
					slog.Uint64("player", pid),
					slog.Any("pos", n.Position()))
			}
		}
		s.seen[id] = current
	}
}

// Remove is a no-op: NPCs are placed once at boot and never removed.
func (s *NpcSystem) Remove(b ecs.BasicEntity) {}
