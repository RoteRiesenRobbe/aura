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

// interactor is the minimal player surface the system needs to honour an
// Interact message (chunk 3b-i). It is deliberately narrower than
// model.PlayerEntity — the equipEntity precedent — so the unit tests' doubles
// stay small; model.PlayerEntity satisfies it at the call site in game.go.
//
// It embeds learner because applying a conversation IS the evaluator's job:
// the player the message names is the player whose spellbook it mutates.
type interactor interface {
	learner
	Basic() ecs.BasicEntity
	Client() model.Client
	// Interactable is the conversant this player was told is in range this
	// tick — stamped by sense(), and the only thing an incoming Interact is
	// validated against.
	Interactable() uint64
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

	// players is the drain side of the interact verb (chunk 3b-i). The system
	// owns the actor list and the evaluator, so it is also where an incoming
	// Interact is honoured — but until 3b-i it had no player list at all,
	// because the approach trigger only ever reached players through an
	// actor's sensor.
	players []interactor

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

// AddPlayer registers a player as a possible interactor (chunk 3b-i). Unlike
// AddEntity this is unconditional: every player can press the key, and whether
// anything happens is decided per tick by what the server told them is in
// range.
func (s *InteractionSystem) AddPlayer(p interactor) {
	s.players = append(s.players, p)
}

// Update runs the sensor pass, then honours whatever interact keypresses
// arrived.
//
// ⚑ The order is load-bearing (L20). The sensor pass re-stamps every player's
// interactable id, which ResetTickNumbers (StatusEffectsSystem, priority 101)
// zeroed at the top of this tick; the drain then validates against exactly that
// value. Draining first — which is the shape EquipSystem.Update uses, and the
// natural thing to write — would compare every incoming Interact against 0 and
// silently refuse all of them.
func (s *InteractionSystem) Update(dt float32) {
	s.sense()
	s.handleInteracts()
}

// sense re-stamps who each nearby player could talk to, and runs the approach
// trigger's rising edge.
func (s *InteractionSystem) sense() {
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

			// The prompt: tell this player the actor is talkable. Unlike the
			// grant path below this is NOT edge-gated — it is live state, so a
			// player standing still keeps the badge, and a player who logs in
			// already in range gets one.
			p.NoteInteractable(id, p.Position().DistanceToSquared(a.Position()))

			if prev[pid] {
				continue // still in range since last tick — not a rising edge
			}
			// L18: the rising edge opens a conversation only for an actor that
			// asked for one. An `interact` actor's sensor edge is a PROMPT, not
			// a trigger — its conversation waits for the Interact message. The
			// guard sits on the evaluate() call rather than on the `seen` map
			// because the map is what makes the prompt cheap, and because a
			// missing guard would not read as a double grant: HasDiscovered
			// short-circuits the second one, so the actor would simply keep
			// ambushing players exactly as it did before 3b-i.
			in := a.Interaction()
			if in.Trigger != mobs.TriggerApproach {
				continue
			}
			lines, taught := evaluate(in, p)
			if len(lines) > 0 {
				// Grants have already landed in p's spellbook; now let the
				// actor speak the combined lines to everyone standing around it.
				speakToSensor(a, lines)
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

// handleInteracts drains one interact keypress per player per tick and opens
// the named conversation.
//
// Range enforcement is one comparison against the value the client was actually
// told (sense, above), not a second geometry implementation: a server that
// re-derived the reach could disagree with the badge it drew, and the player
// would see a prompt that does nothing. The stamp is one tick stale by
// construction (L17) — the sensor reads the previous tick's broadphase — which
// errs in the player's favour and is imperceptible at 30 Hz.
func (s *InteractionSystem) handleInteracts() {
	for _, p := range s.players {
		msg := p.Client().NextInteract()
		if msg == nil {
			continue
		}
		a := s.actorByID(msg.EntityID)
		if a == nil {
			continue // gone, or never a conversant
		}
		if msg.EntityID != p.Interactable() {
			// Out of range, or naming someone the player was never offered.
			// Silent: a stale keypress from a player who just walked away is
			// ordinary, not an error.
			continue
		}
		if a.Interaction().Trigger != mobs.TriggerInteract {
			continue // an approach actor does not answer the key
		}

		lines, taught := evaluate(a.Interaction(), p)
		if len(lines) > 0 {
			// D13: a conversation the player deliberately opened is private to
			// them. The approach path keeps its fan-out — that one IS ambient
			// speech — which is why speak takes its audience as an argument.
			speak(a, lines, p.Client())
		}
		for _, skillID := range taught {
			p.Client().SendUnlock(uint64(skillID), "Taught by: "+actorName(a))
		}
	}
}

// actorByID finds a registered conversant. The list is the handful of actors
// that carry a conversation, not every mob in the world.
func (s *InteractionSystem) actorByID(id uint64) Conversant {
	for _, a := range s.actors {
		if a.Basic().ID() == id {
			return a
		}
	}
	return nil
}

// speak sends one EntityMessage anchored on the actor, reusing the existing
// chat wire (codec.EntityMessageFlatbufMarshal → Chat.showMessage → a floating
// bubble above the entity). Anyone in the actor's sensor already tracks it in
// their viewport, so the bubble renders (this also sidesteps the
// Chat.showMessage throw-on-untracked bug). Latest-wins is automatic — every
// line shares the one entity_id, and the client shows the newest say.
//
// The audience is the caller's choice because the two triggers want different
// ones (D13): approach is ambient speech and fans out to everyone standing
// around, while an interact conversation belongs to the player who opened it —
// a crowded town square should not fill with other people's teaching lines.
func speak(a Conversant, lines []string, to model.Client) {
	to.SendMessage(marshalSay(a, lines))
}

// speakToSensor is the approach trigger's audience: every player standing
// around the actor. The bytes are marshalled once and fanned, which is why this
// is not a loop over speak().
func speakToSensor(a Conversant, lines []string) {
	bytes := marshalSay(a, lines)
	for c := range a.Sensor().Collisions() {
		p, ok := c.Shape().UserData.(model.PlayerEntity)
		if !ok {
			continue
		}
		p.Client().SendMessage(bytes)
	}
}

func marshalSay(a Conversant, lines []string) []byte {
	builder := flatbuffers.NewBuilder(64)
	entityMessage := codec.EntityMessageFlatbufMarshal(builder, a.Basic().ID(), strings.Join(lines, "\n"), AuraApi.EntityMessageKindChat)
	builder.Finish(entityMessage)
	return builder.FinishedBytes()
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
//
// It sweeps both lists because ecs.World calls Remove on every system for every
// removed entity, actor or player alike — and a player left behind here would
// keep having a disconnected client's queue drained (chunk 3b-i).
func (s *InteractionSystem) Remove(b ecs.BasicEntity) {
	for i, a := range s.actors {
		if a.Basic().ID() == b.ID() {
			s.actors = append(s.actors[:i], s.actors[i+1:]...)
			break
		}
	}
	for i, p := range s.players {
		if p.Basic().ID() == b.ID() {
			s.players = append(s.players[:i], s.players[i+1:]...)
			break
		}
	}
	delete(s.seen, b.ID())
}
