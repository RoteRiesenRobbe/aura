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
	"github.com/RoteRiesenRobbe/aura/pkg/aura/quests"
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
	// InCombat ends any conversation this actor is in (D21). ⚑ It lives on
	// model.Combatant, which MobEntity does NOT embed, so it has to be named
	// here — both concrete types satisfy it for free.
	InCombat() bool
	// SetConversing holds the actor's idle movement while somebody is talking to
	// it (D22), so a patrolling NPC can be stopped on a road.
	SetConversing(v bool)
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

	// The open conversation (chunk 3b-ii). The session is two fields and no
	// node bookkeeping: where the player is in the tree is theirs to track.
	ConversingWith() uint64
	SetConversingWith(id uint64)
	SetConversation(c *model.Conversation)
	// QuestLedger receives the talked-to stamp at session open
	// (plan-quests.md C1).
	QuestLedger() *quests.Ledger
	// InCombat ends the conversation (D21) — the rule that makes a non-blocking
	// panel safe, because a player cannot be trapped reading dialogue while
	// something eats them.
	InCombat() bool
}

// InteractionSystem drives conversations (chunk 3a; it replaced NpcSystem and
// with it the whole model/npc type).
//
// Two jobs, both driven by the actors' sensors:
//
//   - the sensor pass stamps who each nearby player could talk to (the interact
//     badge, chunk 3b-i) and speaks any ambient lines on the rising edge (D18);
//   - the drain honours what arrives on the key: opening a conversation, taking
//     one of its rows, or closing it.
//
// Nothing ever opens by itself. Grants mutate the player's spellbook directly —
// the client renders the unlock glow from the spellbook diff, so there is no
// wire event for it beyond the attribution banner.
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
	s.refreshConversations()
}

// sense re-stamps who each nearby player could talk to, and speaks ambient
// lines on the rising edge.
func (s *InteractionSystem) sense() {
	for _, a := range s.actors {
		id := a.Basic().ID()
		prev := s.seen[id]
		current := map[uint64]bool{}
		// An actor that has been pulled into a fight stops offering to talk, to
		// every player at once (D21) — hoisted out of the loop because it does
		// not vary per player.
		actorCanTalk := !a.InCombat()
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
			//
			// ⚑ Combat is part of the OFFER, not just of the teardown. D21 says
			// combat ends a conversation; if that rule lived only in
			// refreshConversations, the sensor would keep stamping through the
			// whole recent-combat window and the client would keep drawing a lit
			// badge over an actor that refuses to talk — a prompt that does
			// nothing, which is exactly what handleInteracts' contract below says
			// must never happen. Withdrawing the offer instead makes the badge go
			// dark, makes `E` a legitimate no-op, and keeps range/combat/session
			// agreeing on ONE number.
			//
			// Ambient lines below are deliberately NOT gated: they are
			// independent of the conversation (D18), and a town crier calling out
			// as you sprint past mid-fight is the behaviour, not a bug.
			if actorCanTalk && !p.InCombat() {
				p.NoteInteractable(id, p.Position().DistanceToSquared(a.Position()))
			}

			if prev[pid] {
				continue // still in range since last tick — not a rising edge
			}
			// D18: the rising edge speaks AMBIENT lines and nothing else. No
			// conversation ever opens by itself — a player who walks past is
			// called out to, never ambushed with a teaching. The two are
			// deliberately independent fields, because the town crier the PO
			// described does both and the retired single-valued `trigger`
			// could express only one of them.
			if ambient := a.Interaction().Ambient; len(ambient) > 0 {
				speakToSensor(a, ambient)
			}
		}
		s.seen[id] = current
	}
}

// handleInteracts drains one interact message per player per tick: opening a
// conversation, taking one of its rows, or closing it.
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
		if msg.Close {
			// Leave / Escape / a second E. Unconditional: dismissing a panel is
			// never refused, whatever else the message says.
			p.SetConversingWith(0)
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

		if msg.NodeID == "" {
			// Open. refreshConversations builds the tree this same tick, so the
			// very next snapshot carries the panel. The quest ledger stamps the
			// conversant here — the single session-open point (plan-quests.md
			// C1) — keyed by the definition's MobID, never the process-local
			// entity id (L12); a set makes re-opens harmless.
			p.SetConversingWith(msg.EntityID)
			p.QuestLedger().NoteTalkedTo(a.MobID())
			continue
		}

		// Taking a row. ⚑ The reply is deliberately NOT sent back: the panel
		// already spoke it, straight out of the streamed row (D19/L24). All that
		// travels is the grant itself, through the spellbook, plus its
		// attribution banner.
		//
		// ⚑ Note what is NOT checked: whether this player has a session open, or
		// whether the node is where they were. Every apply stands on its own
		// merits — in range, node exists, its conditions pass, index valid, level
		// cleared, not already known — which is exactly what buys D16's
		// bookkeeping-free session.
		_, taught, ok := applyGrant(a.Interaction(), p, msg.NodeID, int(msg.OptionIndex), int(msg.GrantIndex))
		if !ok || taught == nil {
			continue
		}
		p.Client().SendUnlock(uint64(*taught), "Taught by: "+actorName(a))
	}
}

// refreshConversations ends the sessions that should end and rebuilds the tree
// for the ones that survive.
//
// Rebuilding every tick is what keeps the panel honest: a row taught this tick
// is gone from the next snapshot, with no invalidation logic to get wrong. It
// costs one present() per conversing player, and only while a panel is open.
func (s *InteractionSystem) refreshConversations() {
	// D22's hold, clear-then-set: derived fresh each tick from who is actually
	// talking, so it needs no reference counting and cannot leak a stuck actor.
	// ⚑ Two loops over slices rather than a per-tick map — the idle-alloc
	// discipline fe0044d0 exists to keep garbage out of the empty-server loop,
	// and this runs every tick whether anyone is talking or not.
	for _, a := range s.actors {
		a.SetConversing(false)
	}

	for _, p := range s.players {
		id := p.ConversingWith()
		if id == 0 {
			continue
		}

		a := s.actorByID(id)
		switch {
		// The actor died or despawned. (A dead or disconnected PLAYER never
		// reaches here — RemoveEntity fans out to Remove, which drops them from
		// s.players.)
		case a == nil,
			// Walked out of talking range. Free to check: the badge already
			// recomputes this every tick, and comparing against the same stamp
			// keeps range enforcement to one number.
			p.Interactable() != id,
			// ⚑ D21, and the rule that makes a non-blocking panel safe: a player
			// cannot be left reading dialogue while something eats them, and an
			// actor that has been pulled into a fight stops talking.
			//
			// Belt and braces since the R2 fix: sense() already withdraws the
			// OFFER in combat, so the range comparison above catches this too.
			// Kept explicit because this is a safety rule about session state, not
			// about what the badge draws — if the offer logic ever changes, the
			// panel must still close.
			p.InCombat(), a.InCombat():
			p.SetConversingWith(0)
			continue
		}

		c := present(a.Interaction(), p)
		if c == nil {
			// Nothing left to say to this player right now — the same condition
			// that would refuse to open one.
			p.SetConversingWith(0)
			continue
		}
		c.EntityID = id
		c.ActorName = actorName(a)
		p.SetConversation(c)
		a.SetConversing(true)
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

// speakToSensor fans one EntityMessage, anchored on the actor, to every player
// standing around it — reusing the existing chat wire
// (codec.EntityMessageFlatbufMarshal → Chat.showMessage → a floating bubble
// above the entity). Anyone in the sensor already tracks the actor in their
// viewport, so the bubble renders (this also sidesteps the Chat.showMessage
// throw-on-untracked bug). Latest-wins is automatic — every line shares the one
// entity_id, and the client shows the newest say. The bytes are marshalled once
// and fanned rather than per recipient.
//
// ⚑ It has exactly ONE caller now: ambient speech (D18). D13's private variant
// was retired with D19 — a conversation reply no longer travels at all, because
// the text already rode the streamed tree and the panel spoke it locally. So the
// fan-out survived the thing it was contrasted against, and public is now the
// only audience there is.
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

// present builds the personalised conversation tree for p (chunk 3b-ii, D16).
//
// ⚑ It is PURE: it reads the spellbook and the level and mutates nothing. That
// is the entire point of the split — a panel that shows options before they are
// taken cannot be the same pass that applies them, which is why 3a's evaluate()
// (presentation and mutation in one breath) had to go.
//
// It serialises EVERY node whose conditions pass rather than walking the graph,
// so an authored cycle needs no check: there is no traversal to run away. nil
// means the actor has nothing to say to this player right now.
//
// The caller stamps EntityID and ActorName — this function only knows content.
func present(in *mobs.Interaction, p learner) *model.Conversation {
	entry := selectNode(in, p)
	if entry == nil {
		return nil
	}

	// Which nodes survive their conditions, so an option pointing at a hidden
	// one can be hidden too. Built once per call rather than re-checked per
	// option, and only while a panel is actually open.
	visible := make(map[string]bool, len(in.Nodes))
	for i := range in.Nodes {
		if conditionsPass(in.Nodes[i].Conditions, p) {
			visible[in.Nodes[i].ID] = true
		}
	}

	c := &model.Conversation{EntryNode: entry.ID}
	for i := range in.Nodes {
		node := &in.Nodes[i]
		if !visible[node.ID] {
			continue
		}
		c.Nodes = append(c.Nodes, model.ConversationNode{
			ID:      node.ID,
			Lines:   node.Lines,
			Options: presentOptions(node, p, visible),
		})
	}
	return c
}

// presentOptions turns one node's authored options into the rows a player sees.
//
// An option with grants becomes one row PER grant — which is what makes the 11
// NPCs nobody re-authored into trees render correctly with zero content work
// (D17): their single nameless multi-grant option shows up as one labelled row
// per skill. An option with no grants is a navigation row.
func presentOptions(node *mobs.InteractionNode, p learner, visible map[string]bool) []model.ConversationOption {
	sc := p.SkillComponent()
	level := p.Progression().Level

	var rows []model.ConversationOption
	for oi := range node.Options {
		opt := &node.Options[oi]
		// A row leading to a node this player cannot see would be a button that
		// goes nowhere. The loader guarantees Next names a real node; conditions
		// are what make it conditionally absent.
		if opt.Next != "" && !visible[opt.Next] {
			continue
		}

		if len(opt.Grants) == 0 {
			rows = append(rows, model.ConversationOption{
				OptionIndex: uint8(oi),
				GrantIndex:  model.ConversationNoGrant,
				Text:        opt.Text,
				Next:        opt.Next,
			})
			continue
		}

		for gi := range opt.Grants {
			g := &opt.Grants[gi]
			if g.Kind != mobs.GrantTeachSkill {
				continue // no other kind exists yet; a new one adds a case here
			}
			// "Things already learned are not shown in that list" — the PO brief
			// verbatim. Under 3a this was a silent skip mid-walk; it is
			// visibility now, and it is why a presented index is not an
			// authored one (L21).
			if sc.HasDiscovered(g.Skill.ID) {
				continue
			}

			locked := level < g.RequiredLevel
			// D20: a locked row is shown with its wall named, so each NPC is a
			// signpost for progression. The reply is chosen by the row's state,
			// which is what lets the panel answer on click with no round-trip.
			reply := g.Line
			if locked {
				reply = opt.BlockedLine
			}
			// An authored label wins; otherwise the skill names its own row.
			// Several grants under one authored Text would all read alike, so
			// the derived name is the honest fallback there.
			text := opt.Text
			if text == "" || len(opt.Grants) > 1 {
				text = skills.DeriveDisplayName(g.Skill.Name)
			}
			rows = append(rows, model.ConversationOption{
				OptionIndex:   uint8(oi),
				GrantIndex:    uint8(gi),
				Text:          text,
				Next:          opt.Next,
				Locked:        locked,
				RequiredLevel: uint8(min(g.RequiredLevel, 255)),
				Reply:         reply,
			})
		}
	}
	return rows
}

// applyGrant hands over exactly ONE grant — the row the player clicked, and
// nothing else (D17: a list is not a walk, so clicking Ignite teaches Ignite).
//
// ⚑ Every check is on the row's OWN merits, never on the path taken to reach
// it: that is precisely what lets the server keep two session fields and no node
// bookkeeping while the client navigates locally (D16). The indices are the
// AUTHORED ones the client was streamed, so they index the definition directly
// (L21).
//
// ok=false is a silent refusal — a stale click from a player who just walked
// away is ordinary, not an error. A LOCKED row is ok=true with nothing taught:
// the actor answers with the authored blockedLine and hands nothing over.
//
// The returned reply is deliberately NOT sent anywhere: the panel already said
// it, straight out of the streamed row (D19/L24). It exists so a test can prove
// the two cannot disagree.
func applyGrant(in *mobs.Interaction, p learner, nodeID string, option, grant int) (reply string, taught *skills.SkillID, ok bool) {
	node := nodeByID(in, nodeID)
	if node == nil || !conditionsPass(node.Conditions, p) {
		return "", nil, false
	}
	if option < 0 || option >= len(node.Options) {
		return "", nil, false
	}
	opt := &node.Options[option]
	if grant < 0 || grant >= len(opt.Grants) {
		return "", nil, false
	}
	g := &opt.Grants[grant]
	if g.Kind != mobs.GrantTeachSkill {
		return "", nil, false
	}

	sc := p.SkillComponent()
	if sc.HasDiscovered(g.Skill.ID) {
		// Not presented, so this can only be a stale click or a crafted one.
		return "", nil, false
	}
	if p.Progression().Level < g.RequiredLevel {
		return opt.BlockedLine, nil, true
	}

	sc.Discover(g.Skill.ID)
	p.ApplyRecipeCascade()
	id := g.Skill.ID
	return g.Line, &id, true
}

func nodeByID(in *mobs.Interaction, id string) *mobs.InteractionNode {
	for i := range in.Nodes {
		if in.Nodes[i].ID == id {
			return &in.Nodes[i]
		}
	}
	return nil
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
