package sys

import (
	"strings"

	"github.com/EngoEngine/ecs"
	flatbuffers "github.com/google/flatbuffers/go"

	"github.com/RoteRiesenRobbe/aura/pkg/api/AuraApi"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/codec"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

// Conversant is the capability an actor has when its definition carries an
// interaction block (plan-entity-model.md chunk 3a). It is asserted
// structurally, never type-tested: a creature, a structure and a follower can
// each talk, and a teaching guard that also fights bandits needs no new type.
//
// Sensor is the actor's aggro aura. That is the whole merge in one line — an
// NPC's proximity sensor and a mob's aggro sensor were always the same
// mechanism, because "approach" is aggro for something friendly.
type Conversant interface {
	model.MobEntity
	Interaction() *mobs.Interaction
	Sensor() phy.DynamicCollider
}

// InteractionSystem drives conversations (chunk 3a; it replaced NpcSystem and
// with it the whole model/npc type).
//
// On the rising edge of a player entering a conversant's sensor it evaluates
// the interaction's nodes: ordered skill grants gated by player level, with a
// lore fallback. Grants mutate the player's spellbook instantly (the client
// renders the unlock glow from the spellbook diff — no wire event). The
// resulting lines are spoken as one EntityMessage anchored on the actor, fanned
// out to every player in its sensor (reusing the existing chat wire — see
// speak).
//
// It runs at the same priority as MobSystem (20), which likewise reads its
// aggro sensor's Collisions(): both act on the previous tick's physics
// broadphase result, which is exactly what approach detection wants.
type InteractionSystem struct {
	actors []Conversant

	// seen tracks, per actor id, the set of player ids currently in the sensor,
	// so the conversation opens only on the rising edge (a player entering)
	// instead of every one of the ~30 ticks/second a player stands in range. A
	// player who leaves and returns re-triggers (already-known grants are
	// simply skipped).
	seen map[uint64]map[uint64]bool
}

func NewInteractionSystem() *InteractionSystem {
	return &InteractionSystem{seen: map[uint64]map[uint64]bool{}}
}

func (s *InteractionSystem) Priority() int {
	return 20
}

func (s *InteractionSystem) New(w *ecs.World) {}

// AddEntity takes every mob and keeps only the ones that have something to
// say. Registration is capability-driven rather than type-driven, which is why
// the merge removed a registration helper instead of adding one.
func (s *InteractionSystem) AddEntity(e model.MobEntity) {
	c, ok := e.(Conversant)
	if !ok || c.Interaction() == nil {
		return
	}
	s.actors = append(s.actors, c)
}

func (s *InteractionSystem) Update(dt float32) {
	for _, a := range s.actors {
		id := a.Basic().ID()
		prev := s.seen[id]
		current := map[uint64]bool{}
		for c := range a.Sensor().Collisions() {
			p, ok := c.Shape().UserData.(model.PlayerEntity)
			if !ok {
				continue
			}
			pid := p.Basic().ID()
			current[pid] = true
			if prev[pid] {
				continue // still in range since last tick — not a rising edge
			}
			lines, taught := evaluate(a.Interaction(), p)
			if len(lines) > 0 {
				// Grants have already landed in p's spellbook; now let the
				// actor speak the combined lines to everyone standing around it.
				speak(a, lines)
			}
			// Attribute each freshly-taught skill to this actor, after the
			// bubble so the source line trails the teaching
			// (plan-unlock-attribution.md).
			for _, skillID := range taught {
				p.Client().SendUnlock(uint64(skillID), "Taught by: "+actorName(a))
			}
		}
		s.seen[id] = current
	}
}

// speak fans one EntityMessage anchored on the actor out to every player
// currently in its sensor, reusing the existing chat wire
// (codec.EntityMessageFlatbufMarshal → Chat.showMessage → a floating bubble
// above the entity). The sensor is a subset of each of those players'
// viewports, so the client already tracks the entity and can render the bubble
// (this also sidesteps the Chat.showMessage throw-on-untracked bug). All near
// players see the same message; latest-wins is automatic — every line shares
// the one entity_id, and the client shows the newest say.
func speak(a Conversant, lines []string) {
	builder := flatbuffers.NewBuilder(64)
	entityMessage := codec.EntityMessageFlatbufMarshal(builder, a.Basic().ID(), strings.Join(lines, "\n"), AuraApi.EntityMessageKindChat)
	builder.Finish(entityMessage)
	bytes := builder.FinishedBytes()

	for c := range a.Sensor().Collisions() {
		p, ok := c.Shape().UserData.(model.PlayerEntity)
		if !ok {
			continue
		}
		p.Client().SendMessage(bytes)
	}
}

// learner is the player surface the evaluator mutates/reads — a subset of
// model.PlayerEntity kept narrow so the unit test's fake stays small (the same
// pattern as skillEntity). model.PlayerEntity satisfies it.
type learner interface {
	SkillComponent() *skills.SkillComponent
	Progression() model.PlayerProgression
	ApplyRecipeCascade()
}

// evaluate runs the interaction for p and returns the lines to speak plus the
// skill ids newly taught (the caller emits one unlock attribution per id).
//
// The node walk is the degenerate case decision 6 authors: the FIRST node whose
// conditions all pass is the one that speaks. Within it, grants are walked in
// order — the first one p is too low for stops the walk with that option's
// blockedLine and grants nothing further, so a level-skipper meeting the actor
// for the first time gets every unlock up to their level at once. When nothing
// is granted (a pure-lore sign-post, or a sage whose grants are all already
// known) the node's Lines are the fallback so it still speaks.
func evaluate(in *mobs.Interaction, p learner) (lines []string, taught []skills.SkillID) {
	node := selectNode(in, p)
	if node == nil {
		return nil, nil
	}

	sc := p.SkillComponent()
	level := p.Progression().Level
walk:
	for _, opt := range node.Options {
		for _, g := range opt.Grants {
			if g.Kind != mobs.GrantTeachSkill {
				continue // no other kind exists yet; a new one adds a case here
			}
			if sc.HasDiscovered(g.Skill.ID) {
				continue
			}
			if level < g.RequiredLevel {
				lines = append(lines, opt.BlockedLine)
				break walk
			}
			sc.Discover(g.Skill.ID)
			p.ApplyRecipeCascade()
			lines = append(lines, g.Line)
			taught = append(taught, g.Skill.ID)
		}
	}
	if len(lines) == 0 && len(node.Lines) > 0 {
		lines = node.Lines
	}
	return lines, taught
}

// selectNode picks the first node every condition of which passes; nil when
// none does (an actor that has nothing to say to this player right now).
func selectNode(in *mobs.Interaction, p learner) *mobs.InteractionNode {
	for i := range in.Nodes {
		if conditionsPass(in.Nodes[i].Conditions, p) {
			return &in.Nodes[i]
		}
	}
	return nil
}

func conditionsPass(conditions []mobs.InteractionCondition, p learner) bool {
	for _, c := range conditions {
		switch c.Kind {
		case mobs.ConditionMinLevel:
			if p.Progression().Level < uint32(c.Value) {
				return false
			}
		default:
			// Unreachable: the loader rejects an unknown kind at boot, which is
			// the point of the parse table. Failing closed here keeps a future
			// kind from silently passing every check before it is implemented.
			return false
		}
	}
	return true
}

// actorName is the friendly source name for a "Taught by: X" unlock label: the
// definition's display name, the same one the mob catalog serves to the client
// for nameplates (TownCrier → "Town Crier"). The merge deleted the old
// authored-name-vs-sprite-name fallback — a definition has exactly one name.
func actorName(a Conversant) string {
	if def := a.MobDefinition(); def != nil {
		return skills.DeriveDisplayName(def.Name)
	}
	return "an NPC"
}

// Remove drops a conversant and its rising-edge state. Unlike the NPC system it
// replaced, this cannot be a no-op: conversants are ordinary actors now, and an
// actor can die or despawn.
func (s *InteractionSystem) Remove(b ecs.BasicEntity) {
	for i, a := range s.actors {
		if a.Basic().ID() == b.ID() {
			s.actors = append(s.actors[:i], s.actors[i+1:]...)
			break
		}
	}
	delete(s.seen, b.ID())
}
