package sys

import (
	"strings"

	"github.com/EngoEngine/ecs"
	"github.com/google/flatbuffers/go"
	"github.com/trichner/berryhunter/pkg/berryhunter/codec"
	"github.com/trichner/berryhunter/pkg/berryhunter/model"
	"github.com/trichner/berryhunter/pkg/berryhunter/skills"
)

// NpcSystem drives the peaceful teaching/lore NPCs (plan-npc-teaching.md).
//
// On the rising edge of a player entering an NPC's proximity sensor it runs
// onApproach: ordered skill grants gated by player level, with a lore fallback.
// Grants mutate the player's spellbook instantly (the client renders the unlock
// glow from the spellbook diff — no wire event). The returned lines are spoken
// as one EntityMessage anchored on the NPC, fanned out to every player in its
// sensor (reusing the existing chat wire — see speak).
//
// It runs at the same priority as MobSystem (20), which likewise reads its
// aggro sensor's Collisions(): both act on the previous tick's physics
// broadphase result, which is exactly what approach detection wants.
type NpcSystem struct {
	npcs []model.NpcEntity

	// seen tracks, per NPC id, the set of player ids currently in the sensor,
	// so onApproach fires only on the rising edge (a player entering) instead of
	// every one of the ~30 ticks/second a player stands in range. A player who
	// leaves and returns re-triggers (already-known teachings are simply skipped).
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
		prev := s.seen[id]
		current := map[uint64]bool{}
		for c := range n.Sensor().Collisions() {
			p, ok := c.Shape().UserData.(model.PlayerEntity)
			if !ok {
				continue
			}
			pid := p.Basic().ID()
			current[pid] = true
			if prev[pid] {
				continue // still in range since last tick — not a rising edge
			}
			lines := onApproach(n, p)
			if len(lines) > 0 {
				// Grants have already landed in p's spellbook; now let the NPC
				// speak the combined lines to everyone standing around it.
				speak(n, lines)
			}
		}
		s.seen[id] = current
	}
}

// speak fans one EntityMessage anchored on the NPC out to every player currently
// in its sensor, reusing the existing chat wire (codec.EntityMessageFlatbufMarshal
// → Chat.showMessage → a floating bubble above the entity). The sensor is a
// subset of each of those players' viewports, so the client already tracks the
// NPC entity and can render the bubble (this also sidesteps the
// Chat.showMessage throw-on-untracked bug). All near players see the same
// message; latest-wins is automatic — every line shares the one NPC entity_id,
// and the client shows the newest say.
func speak(n model.NpcEntity, lines []string) {
	builder := flatbuffers.NewBuilder(64)
	entityMessage := codec.EntityMessageFlatbufMarshal(builder, n.Basic().ID(), strings.Join(lines, "\n"))
	builder.Finish(entityMessage)
	bytes := builder.FinishedBytes()

	for c := range n.Sensor().Collisions() {
		p, ok := c.Shape().UserData.(model.PlayerEntity)
		if !ok {
			continue
		}
		p.Client().SendMessage(bytes)
	}
}

// teacher is the NPC surface onApproach reads — a subset of model.NpcEntity kept
// narrow so the unit test's fake supplies only the teaching payload.
type teacher interface {
	Teachings() []model.Teaching
	TooLowLine() string
	Lines() []string
}

// learner is the player surface onApproach mutates/reads — a subset of
// model.PlayerEntity kept narrow so the unit test's fake stays small (the same
// pattern as skillEntity). model.PlayerEntity satisfies it.
type learner interface {
	SkillComponent() *skills.SkillComponent
	Progression() model.PlayerProgression
	ApplyRecipeCascade()
}

// onApproach grants p every qualifying not-yet-known teaching in order and
// returns the lines to speak (chunk 4 fans them out). The level gate is ordered:
// the first teaching p is too low for stops the walk with TooLowLine and grants
// nothing further, so a level-skipper meeting the NPC for the first time gets
// every unlock up to their level at once. When nothing is taught (a pure-lore
// guard/sign-post, or a sage whose teachings are all already known) the NPC's
// Lines are the fallback so it still speaks.
func onApproach(n teacher, p learner) []string {
	var lines []string
	sc := p.SkillComponent()
	level := p.Progression().Level
	for _, t := range n.Teachings() {
		if sc.HasDiscovered(t.Def.ID) {
			continue
		}
		if level >= t.RequiredLevel {
			sc.Discover(t.Def.ID)
			p.ApplyRecipeCascade()
			lines = append(lines, t.Line)
		} else {
			lines = append(lines, n.TooLowLine())
			break
		}
	}
	if len(lines) == 0 && len(n.Lines()) > 0 {
		lines = n.Lines()
	}
	return lines
}

// Remove is a no-op: NPCs are placed once at boot and never removed.
func (s *NpcSystem) Remove(b ecs.BasicEntity) {}
