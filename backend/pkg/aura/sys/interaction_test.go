package sys

// The conversation evaluator (plan-entity-model.md chunk 3a).
//
// These are sys/npc_test.go's cases, ported onto the merged actor. That is
// deliberate and is the acceptance test for the whole chunk: the NPC's
// behaviour did not change, only what it IS. Where a case reads identically to
// its pre-merge twin, that is the point.

import (
	"testing"

	flatbuffers "github.com/google/flatbuffers/go"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/api/AuraApi"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/mob"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

// --- test doubles (ported verbatim from the deleted npc_test.go) ---

// fakeLearner is a minimal player surface: a real spellbook (so Discover /
// HasDiscovered behave for real), a level, and a cascade-call counter.
type fakeLearner struct {
	sc           *skills.SkillComponent
	level        uint32
	cascadeCalls int
}

func (f *fakeLearner) SkillComponent() *skills.SkillComponent { return f.sc }
func (f *fakeLearner) Progression() model.PlayerProgression {
	return model.PlayerProgression{Level: f.level}
}
func (f *fakeLearner) ApplyRecipeCascade() { f.cascadeCalls++ }

var _ learner = (*fakeLearner)(nil)

func newLearner(level uint32) *fakeLearner {
	return &fakeLearner{sc: skills.NewSkillComponent(true), level: level}
}

// addPlayerCollider puts a fake player into the space on the real player body
// layer, which is what a sensor's Collisions() reports.
func addPlayerCollider(space *phy.Space, p *fakePlayer, pos phy.Vec2f) *phy.Circle {
	body := phy.NewCircle(pos, 0.5)
	body.Shape().Layer = int(model.LayerPlayerCollision)
	body.Shape().UserData = model.PlayerEntity(p)
	space.AddShape(body)
	return body
}

func sentOf(p *fakePlayer) [][]byte { return p.client.(*fakeClient).sent }

// pressInteract queues one Interact naming id, as the client's E key does.
func pressInteract(p *fakePlayer, id uint64) {
	c := p.client.(*fakeClient)
	c.interacts = append(c.interacts, &model.Interact{EntityID: id})
}

func unlocksOf(p *fakePlayer) []capturedUnlock { return p.client.(*fakeClient).unlocks }

// decodeEntityMessage unwraps the wire bytes speak() produces back into the
// anchored entity id + text, verifying it really is an EntityMessage.
func decodeEntityMessage(t *testing.T, b []byte) (uint64, string) {
	t.Helper()
	sm := AuraApi.GetRootAsServerMessage(b, 0)
	require.Equal(t, AuraApi.ServerMessageBodyEntityMessage, sm.BodyType())
	var tbl flatbuffers.Table
	require.True(t, sm.Body(&tbl))
	var em AuraApi.EntityMessage
	em.Init(tbl.Bytes, tbl.Pos)
	return em.EntityId(), string(em.Message())
}

// --- builders: the degenerate one-node case content authors ---

// grant builds one teach_skill grant with a distinct skill definition (the id
// is all the evaluator touches on Skill).
func grant(id int, reqLevel uint32, line string) mobs.InteractionGrant {
	return mobs.InteractionGrant{
		Kind:          mobs.GrantTeachSkill,
		RequiredLevel: reqLevel,
		Line:          line,
		Skill:         &skills.SkillDefinition{ID: skills.SkillID(id)},
	}
}

// teachingInteraction is one node, one option, a grant list and a blocked line
// — exactly what all 14 migrated NPCs author.
func teachingInteraction(blockedLine string, lines []string, grants ...mobs.InteractionGrant) *mobs.Interaction {
	node := mobs.InteractionNode{ID: "root", Lines: lines}
	if len(grants) > 0 || blockedLine != "" {
		node.Options = []mobs.InteractionOption{{BlockedLine: blockedLine, Grants: grants}}
	}
	return &mobs.Interaction{Trigger: mobs.TriggerApproach, Nodes: []mobs.InteractionNode{node}}
}

// interactInteraction is the same degenerate node under the 3b-i verb: the
// conversation waits for a keypress instead of opening on the sensor edge.
func interactInteraction(blockedLine string, lines []string, grants ...mobs.InteractionGrant) *mobs.Interaction {
	in := teachingInteraction(blockedLine, lines, grants...)
	in.Trigger = mobs.TriggerInteract
	return in
}

// --- evaluate: grant logic (ported from onApproach) ---

func TestEvaluate_MultiGrantOrdered(t *testing.T) {
	in := teachingInteraction("too low", nil,
		grant(1, 1, "learned heal"),
		grant(2, 5, "learned dash"))
	p := newLearner(10) // qualifies for both

	lines, _ := evaluate(in, p)

	assert.Equal(t, []string{"learned heal", "learned dash"}, lines, "both lines in order")
	assert.True(t, p.sc.HasDiscovered(1), "heal granted")
	assert.True(t, p.sc.HasDiscovered(2), "dash granted")
	assert.Equal(t, 2, p.cascadeCalls, "cascade run once per grant")
}

func TestEvaluate_LevelGateStops(t *testing.T) {
	in := teachingInteraction("come back stronger", nil,
		grant(1, 1, "learned heal"),
		grant(2, 5, "learned dash"))
	p := newLearner(3) // qualifies for heal (1) but not dash (5)

	lines, _ := evaluate(in, p)

	assert.Equal(t, []string{"learned heal", "come back stronger"}, lines,
		"grants the qualifying teaching, then the blocked line and stops")
	assert.True(t, p.sc.HasDiscovered(1), "heal granted")
	assert.False(t, p.sc.HasDiscovered(2), "dash NOT granted (gated)")
	assert.Equal(t, 1, p.cascadeCalls, "cascade only for the one grant")
}

func TestEvaluate_FirstGrantTooLow(t *testing.T) {
	in := teachingInteraction("come back stronger", nil, grant(1, 5, "learned dash"))
	p := newLearner(1)

	lines, _ := evaluate(in, p)

	assert.Equal(t, []string{"come back stronger"}, lines)
	assert.False(t, p.sc.HasDiscovered(1))
	assert.Equal(t, 0, p.cascadeCalls)
}

// A level-skipper meeting the actor for the first time collects every
// qualifying grant at once, each with its own line — the Emberkeeper case.
func TestEvaluate_BackToBackMultiUnlock(t *testing.T) {
	in := teachingInteraction("too low", nil,
		grant(1, 1, "a"), grant(2, 5, "b"), grant(3, 10, "c"))
	p := newLearner(20)

	lines, _ := evaluate(in, p)

	assert.Equal(t, []string{"a", "b", "c"}, lines)
	assert.True(t, p.sc.HasDiscovered(1) && p.sc.HasDiscovered(2) && p.sc.HasDiscovered(3))
	assert.Equal(t, 3, p.cascadeCalls)
}

func TestEvaluate_IdempotentReApproach(t *testing.T) {
	in := teachingInteraction("too low", nil, grant(1, 1, "learned heal"))
	p := newLearner(10)
	p.sc.Discover(1) // already knows it

	lines, _ := evaluate(in, p)

	assert.Empty(t, lines, "nothing to teach, no lore fallback -> silent")
	assert.Equal(t, 0, p.cascadeCalls, "no re-grant")
}

// The ForestSign / LamplessTraveller case: a node with lines and no options.
func TestEvaluate_LoreFallbackWhenNothingTaught(t *testing.T) {
	in := teachingInteraction("", []string{"No entry.", "Trolls up north."})
	p := newLearner(10)

	lines, _ := evaluate(in, p)

	assert.Equal(t, []string{"No entry.", "Trolls up north."}, lines)
	assert.Equal(t, 0, p.cascadeCalls, "a pure-lore actor never grants")
}

// An all-learned sage falls back to idle lore instead of going silent.
func TestEvaluate_LoreFallbackWhenAllLearned(t *testing.T) {
	in := teachingInteraction("too low", []string{"You have learned all I can teach."},
		grant(1, 1, "learned heal"))
	p := newLearner(10)
	p.sc.Discover(1)

	lines, _ := evaluate(in, p)

	assert.Equal(t, []string{"You have learned all I can teach."}, lines)
	assert.Equal(t, 0, p.cascadeCalls)
}

// Only the genuinely new skills are attributed, so a re-approach does not
// re-announce what the player already had.
func TestEvaluate_ReturnsTaughtIDs(t *testing.T) {
	in := teachingInteraction("too low", nil,
		grant(1, 1, "learned heal"),
		grant(2, 5, "learned dash"))
	p := newLearner(10)
	p.sc.Discover(1) // already known — must NOT be re-reported

	_, taught := evaluate(in, p)

	assert.Equal(t, []skills.SkillID{2}, taught, "only the genuinely new skill is attributed")
}

// --- node selection: the container half decision 6 buys ---

// Nothing in the 14 authors a second node, but the evaluator has to mean
// something the day content does — and an unimplemented condition kind must
// fail CLOSED rather than pass silently.
func TestEvaluate_SelectsFirstNodeWhoseConditionsPass(t *testing.T) {
	in := &mobs.Interaction{Nodes: []mobs.InteractionNode{
		{
			ID:         "veteran",
			Conditions: []mobs.InteractionCondition{{Kind: mobs.ConditionMinLevel, Value: 10}},
			Lines:      []string{"Well met, veteran."},
		},
		{ID: "root", Lines: []string{"Move along."}},
	}}

	lines, _ := evaluate(in, newLearner(3))
	assert.Equal(t, []string{"Move along."}, lines, "the gated node is skipped")

	lines, _ = evaluate(in, newLearner(10))
	assert.Equal(t, []string{"Well met, veteran."}, lines, "the gate opens exactly at the value")
}

func TestEvaluate_NoNodePassesMeansSilence(t *testing.T) {
	in := &mobs.Interaction{Nodes: []mobs.InteractionNode{{
		ID:         "veteran",
		Conditions: []mobs.InteractionCondition{{Kind: mobs.ConditionMinLevel, Value: 10}},
		Lines:      []string{"Well met."},
	}}}

	lines, taught := evaluate(in, newLearner(1))
	assert.Empty(t, lines)
	assert.Empty(t, taught)
}

func TestConditionsPass_UnknownKindFailsClosed(t *testing.T) {
	assert.False(t, conditionsPass([]mobs.InteractionCondition{{Kind: "hasQuest"}}, newLearner(99)),
		"a kind the engine does not implement must never pass by default")
}

// --- InteractionSystem.Update: rising-edge wiring against real physics ---

// npcDef is the shape the migrated content authors: passive friendly faction,
// no loadout, no movement, one conversation.
func npcDef(name string, in *mobs.Interaction) *mobs.MobDefinition {
	return &mobs.MobDefinition{
		ID:   51,
		Name: name,
		// The sprite is irrelevant here, so every fixture borrows one — which
		// is what content does too (four merged NPCs share the Hermit sprite
		// via this same override).
		EntityType:        "Signpost",
		Faction:           5,
		AggroMask:         0,
		FriendlyToPlayers: true,
		Factors:           mobs.Factors{BaseMaxHealth: 200, Speed: 0},
		Body:              mobs.Body{Radius: 0.35, AggroRadius: 3},
		Interaction:       in,
	}
}

// countingConversant reveals how many times the evaluator ran (Interaction() is
// read exactly once per rising edge).
type countingConversant struct {
	Conversant
	calls int
}

func (c *countingConversant) Interaction() *mobs.Interaction {
	c.calls++
	return c.Conversant.Interaction()
}

func addNpcToSpace(t *testing.T, space *phy.Space, m *mob.Mob) {
	t.Helper()
	// Registration as game.addMobEntity does it: EVERY body dynamic, sensor
	// included — which is exactly what the deleted addNpcEntity had to do by
	// hand for the old two-shape NPC.
	for _, b := range m.Bodies() {
		space.AddShape(b)
	}
}

func TestInteractionSystem_RisingEdgeAntiSpamAndReTrigger(t *testing.T) {
	space := phy.NewSpace()

	m := mob.NewMob(npcDef("TownCrier", teachingInteraction("too low", nil, grant(1, 1, "learned heal"))), 0, nil)
	m.SetPosition(phy.Vec2f{X: 0, Y: 0})
	addNpcToSpace(t, space, m)
	n := &countingConversant{Conversant: m}

	p := newFakePlayer()
	p.level = 10
	player := phy.NewCircle(phy.Vec2f{X: 1, Y: 0}, 0.5)
	player.Shape().Layer = int(model.LayerPlayerCollision)
	player.Shape().UserData = model.PlayerEntity(p)
	space.AddShape(player)

	s := NewInteractionSystem()
	s.AddEntity(n)
	n.calls = 0 // registration itself reads Interaction() once, to filter

	step := func() {
		space.Update()
		s.Update(33.0)
	}

	// Tick 1: player enters -> rising edge -> one evaluation, skill granted.
	step()
	assert.Equal(t, 1, n.calls, "the conversation opens on entry")
	assert.True(t, p.sc.HasDiscovered(1), "skill granted on approach")

	// Ticks 2..4: still in range -> no further evaluation (anti-spam).
	step()
	step()
	step()
	assert.Equal(t, 1, n.calls, "standing in range does not re-fire")

	// Player leaves the sensor radius.
	player.SetPosition(phy.Vec2f{X: 50, Y: 0})
	step()
	assert.Equal(t, 1, n.calls, "leaving does not fire")

	// Player returns -> falling+rising edge -> it fires again.
	player.SetPosition(phy.Vec2f{X: 1, Y: 0})
	step()
	assert.Equal(t, 2, n.calls, "leave + re-enter re-triggers")
}

// L18: an `interact` actor must be skipped by the rising-edge grant path. The
// assertion is deliberately on the SPELLBOOK and on silence, not on pressing
// the key: all 14 conversants author lore lines, so a missing guard does not
// present as an empty conversation — it presents as the pre-3b ambush, with a
// bubble that looks correct. Nothing may happen on approach at all.
func TestInteractionSystem_InteractActorDoesNotGrantOnApproach(t *testing.T) {
	space := phy.NewSpace()

	m := mob.NewMob(npcDef("Farmer", interactInteraction("too low", []string{"lore"}, grant(1, 1, "learned heal"))), 0, nil)
	m.SetPosition(phy.Vec2f{X: 0, Y: 0})
	addNpcToSpace(t, space, m)

	p := newFakePlayer()
	p.level = 10
	addPlayerCollider(space, p, phy.Vec2f{X: 1, Y: 0})

	s := NewInteractionSystem()
	s.AddEntity(m)

	for i := 0; i < 4; i++ {
		space.Update()
		s.Update(33.0)
	}

	assert.False(t, p.sc.HasDiscovered(1), "an interact actor must not teach on approach")
	assert.Empty(t, sentOf(p), "and must not speak on approach either")
	assert.Empty(t, unlocksOf(p), "so no attribution banner fires")
}

// The approach trigger keeps working untouched — D14 keeps it in the table with
// zero content users, and this is what proves the guard discriminates rather
// than disabling the path.
func TestInteractionSystem_ApproachActorStillGrantsOnApproach(t *testing.T) {
	space := phy.NewSpace()

	m := mob.NewMob(npcDef("Farmer", teachingInteraction("too low", []string{"lore"}, grant(1, 1, "learned heal"))), 0, nil)
	m.SetPosition(phy.Vec2f{X: 0, Y: 0})
	addNpcToSpace(t, space, m)

	p := newFakePlayer()
	p.level = 10
	addPlayerCollider(space, p, phy.Vec2f{X: 1, Y: 0})

	s := NewInteractionSystem()
	s.AddEntity(m)

	space.Update()
	s.Update(33.0)

	assert.True(t, p.sc.HasDiscovered(1), "approach still teaches on the sensor edge")
}

// --- the interact verb (chunk 3b-i) ---

// interactFixture wires the standard 3b-i scene: one interact-triggered actor
// at the origin, one registered player 1 unit away, inside the sensor.
func interactFixture(t *testing.T, in *mobs.Interaction) (*InteractionSystem, *phy.Space, *mob.Mob, *fakePlayer) {
	t.Helper()
	space := phy.NewSpace()

	m := mob.NewMob(npcDef("Farmer", in), 0, nil)
	m.SetPosition(phy.Vec2f{X: 0, Y: 0})
	addNpcToSpace(t, space, m)

	p := newFakePlayer()
	p.level = 10
	p.SetPosition(phy.Vec2f{X: 1, Y: 0})
	addPlayerCollider(space, p, phy.Vec2f{X: 1, Y: 0})

	s := NewInteractionSystem()
	s.AddEntity(m)
	s.AddPlayer(p)
	return s, space, m, p
}

// The prompt: standing in range stamps who the player could talk to, which is
// the single value the client's badge and the server's validation both use.
func TestInteractionSystem_StampsInteractableWhileInRange(t *testing.T) {
	s, space, m, p := interactFixture(t, interactInteraction("too low", []string{"lore"}, grant(1, 1, "learned heal")))

	space.Update()
	s.Update(33.0)

	assert.Equal(t, m.Basic().ID(), p.Interactable(), "an actor in range is offered")
	assert.Empty(t, sentOf(p), "but offering is not speaking")
}

// ⚑ L20. The stamp and the drain live in one Update, and the stamp must come
// first: ResetTickNumbers zeroed the field at the top of this tick, so a
// handlers-first Update would validate every keypress against 0 and refuse it.
// This is the test that fails if the two halves are ever reordered.
func TestInteractionSystem_StampAndInteractInTheSameTick(t *testing.T) {
	s, space, m, p := interactFixture(t, interactInteraction("too low", []string{"lore"}, grant(1, 1, "learned heal")))

	// The keypress is already queued when the tick begins — the ordinary case,
	// since the client sends it a tick or more before the server drains it.
	pressInteract(p, m.Basic().ID())

	space.Update()
	s.Update(33.0)

	assert.True(t, p.sc.HasDiscovered(1), "the conversation opens on the key")
	require.Len(t, sentOf(p), 1, "and the actor speaks")
}

// Range enforcement: the server honours only the actor it told this player
// about. Naming a real conversant that is out of range is refused without a
// word — a stale keypress from a player who walked away is ordinary, not an
// error. This is the whole of the range check: one comparison against the value
// the client was given, never a second geometry implementation that could
// disagree with the badge it drew.
func TestInteractionSystem_RefusesUnofferedActor(t *testing.T) {
	s, space, near, p := interactFixture(t, interactInteraction("", []string{"near"}))

	// A second conversant, well outside the player's reach, teaching skill 1.
	far := mob.NewMob(npcDef("Hermit", interactInteraction("too low", nil, grant(1, 1, "learned heal"))), 0, nil)
	far.SetPosition(phy.Vec2f{X: 50, Y: 0})
	addNpcToSpace(t, space, far)
	s.AddEntity(far)

	pressInteract(p, far.Basic().ID())
	space.Update()
	s.Update(33.0)

	assert.Equal(t, near.Basic().ID(), p.Interactable(), "only the near actor was offered")
	assert.False(t, p.sc.HasDiscovered(1), "so the far one is refused")
	assert.Empty(t, sentOf(p), "silently")
}

// D13: a conversation the player opened is private to them — a crowded town
// square must not fill with other people's teaching lines.
func TestInteractionSystem_InteractReplyIsPrivate(t *testing.T) {
	s, space, m, p := interactFixture(t, interactInteraction("too low", []string{"lore"}, grant(1, 1, "learned heal")))

	bystander := newFakePlayer()
	bystander.level = 10
	bystander.SetPosition(phy.Vec2f{X: -1, Y: 0})
	addPlayerCollider(space, bystander, phy.Vec2f{X: -1, Y: 0})
	s.AddPlayer(bystander)

	pressInteract(p, m.Basic().ID())
	space.Update()
	s.Update(33.0)

	require.Len(t, sentOf(p), 1, "the interactor hears the reply")
	assert.Empty(t, sentOf(bystander), "someone standing next to them does not")
	assert.Equal(t, m.Basic().ID(), bystander.Interactable(), "though they are offered the same actor")
}

// ...while the approach trigger stays ambient, which is why speak takes its
// audience as an argument instead of losing the fan-out.
func TestInteractionSystem_ApproachSpeechStillFansOut(t *testing.T) {
	s, space, m, p := interactFixture(t, teachingInteraction("too low", []string{"lore"}, grant(1, 1, "learned heal")))

	bystander := newFakePlayer()
	bystander.level = 10
	bystander.SetPosition(phy.Vec2f{X: -1, Y: 0})
	addPlayerCollider(space, bystander, phy.Vec2f{X: -1, Y: 0})

	space.Update()
	s.Update(33.0)

	assert.NotEmpty(t, sentOf(p), "approach speech reaches everyone standing around")
	assert.NotEmpty(t, sentOf(bystander))
	_ = m
}

// L17: where two sensors overlap, the stamp must be deterministic or the badge
// flickers between them as iteration order changes. Nearest by centre wins.
func TestInteractionSystem_NearestConversantWins(t *testing.T) {
	space := phy.NewSpace()

	near := mob.NewMob(npcDef("Farmer", interactInteraction("", []string{"near"})), 0, nil)
	near.SetPosition(phy.Vec2f{X: 1, Y: 0})
	addNpcToSpace(t, space, near)

	far := mob.NewMob(npcDef("Hermit", interactInteraction("", []string{"far"})), 0, nil)
	far.SetPosition(phy.Vec2f{X: -2, Y: 0})
	addNpcToSpace(t, space, far)

	p := newFakePlayer()
	p.level = 10
	p.SetPosition(phy.Vec2f{X: 0, Y: 0})
	addPlayerCollider(space, p, phy.Vec2f{X: 0, Y: 0})

	s := NewInteractionSystem()
	// Registered far-first, so a system that simply took the last offer would
	// pick the near one by accident and pass. Both orders are asserted below.
	s.AddEntity(far)
	s.AddEntity(near)
	s.AddPlayer(p)

	space.Update()
	s.Update(33.0)
	assert.Equal(t, near.Basic().ID(), p.Interactable(), "the nearer actor wins")

	p.interactableID, p.interactableDistSq = 0, 0
	s.actors[0], s.actors[1] = s.actors[1], s.actors[0]
	s.Update(33.0)
	assert.Equal(t, near.Basic().ID(), p.Interactable(), "regardless of registration order")
}

// A mob with nothing to say is not registered at all — capability, not type.
func TestInteractionSystem_IgnoresNonConversantMobs(t *testing.T) {
	s := NewInteractionSystem()
	s.AddEntity(mob.NewMob(testMobDef(), 0, nil))

	assert.Empty(t, s.actors, "an ordinary mob carries no conversation")
}

// Unlike the NPC system it replaced, Remove cannot be a no-op: a conversant is
// an ordinary actor now, and an actor can die or despawn.
func TestInteractionSystem_RemoveDropsActorAndItsEdgeState(t *testing.T) {
	m := mob.NewMob(npcDef("TownCrier", teachingInteraction("", []string{"lore"})), 0, nil)
	s := NewInteractionSystem()
	s.AddEntity(m)
	s.seen[m.Basic().ID()] = map[uint64]bool{7: true}

	s.Remove(m.Basic())

	assert.Empty(t, s.actors)
	assert.NotContains(t, s.seen, m.Basic().ID())
}

// ecs.World calls Remove on every system for every removed entity, so the
// players list needs the same sweep the actors list has — otherwise each
// disconnect leaks a player whose client queue keeps being drained (3b-i).
func TestInteractionSystem_RemoveDropsPlayer(t *testing.T) {
	p := newFakePlayer()
	s := NewInteractionSystem()
	s.AddPlayer(p)
	require.Len(t, s.players, 1)

	s.Remove(p.Basic())

	assert.Empty(t, s.players, "a disconnected player must not stay registered")
}

// The attribution label is the definition's display name — the same one the
// mob catalog serves for nameplates (TownCrier → "Town Crier"). The merge
// deleted the old authored-name-vs-sprite-name fallback: one name per actor.
func TestInteractionSystem_TeachEmitsUnlockAttribution(t *testing.T) {
	space := phy.NewSpace()

	m := mob.NewMob(npcDef("TownCrier", teachingInteraction("too low", nil, grant(7, 1, "learn to farm"))), 0, nil)
	m.SetPosition(phy.Vec2f{X: 0, Y: 0})
	addNpcToSpace(t, space, m)

	p := newFakePlayer()
	p.level = 10
	player := phy.NewCircle(phy.Vec2f{X: 1, Y: 0}, 0.5)
	player.Shape().Layer = int(model.LayerPlayerCollision)
	player.Shape().UserData = model.PlayerEntity(p)
	space.AddShape(player)

	s := NewInteractionSystem()
	s.AddEntity(m)

	space.Update()
	s.Update(33.0)

	require.Len(t, unlocksOf(p), 1, "one unlock attribution for the one taught skill")
	assert.Equal(t, uint64(7), unlocksOf(p)[0].skillID)
	assert.Equal(t, "Taught by: Town Crier", unlocksOf(p)[0].source)

	// Standing in range must not re-emit (rising-edge only).
	s.Update(33.0)
	assert.Len(t, unlocksOf(p), 1, "no re-emit while still in range")
}

func TestInteractionSystem_SpeechReachesAllSensorPlayers(t *testing.T) {
	space := phy.NewSpace()

	// A lore actor speaks its (multi-line) lore on every approach, independent
	// of level or grants — the cleanest way to exercise the speech path.
	m := mob.NewMob(npcDef("ForestSign", teachingInteraction("", []string{"Welcome, traveler.", "Trolls up north."})), 0, nil)
	m.SetPosition(phy.Vec2f{X: 0, Y: 0})
	addNpcToSpace(t, space, m)

	s := NewInteractionSystem()
	s.AddEntity(m)

	// A bystander already standing in range; a newcomer waiting out of range.
	bystander := newFakePlayer()
	bystander.level = 10
	addPlayerCollider(space, bystander, phy.Vec2f{X: 1, Y: 0})
	newcomer := newFakePlayer()
	newcomer.level = 10
	newcomerBody := addPlayerCollider(space, newcomer, phy.Vec2f{X: 50, Y: 0})

	step := func() { space.Update(); s.Update(33.0) }

	// Tick 1: the bystander alone approaches -> one bubble reaches it.
	step()
	require.Len(t, sentOf(bystander), 1, "bystander hears the actor on its own approach")
	bystanderBefore := len(sentOf(bystander))

	// Tick 2: the newcomer crosses in. It is the only rising edge, yet the
	// bubble it triggers fans out to EVERY player in the sensor.
	newcomerBody.SetPosition(phy.Vec2f{X: 2, Y: 0})
	step()

	assert.Len(t, sentOf(newcomer), 1, "newcomer hears the actor it approached")
	assert.Equal(t, bystanderBefore+1, len(sentOf(bystander)),
		"bystander who did not move also hears the newcomer's bubble (fan-out to all)")

	// Content: anchored on the actor, lines newline-joined into one bubble.
	id, msg := decodeEntityMessage(t, sentOf(newcomer)[0])
	assert.Equal(t, m.Basic().ID(), id, "bubble anchored on the actor entity")
	assert.Equal(t, "Welcome, traveler.\nTrolls up north.", msg, "lines joined into one bubble")
}

// The unattackability half of D5, asserted as BEHAVIOUR: an NPC body carries
// no Action bit, so an aura query for combat targets cannot see it at all —
// which is what makes it unattackable by hostile mobs too, not just players.
func TestInteractionSystem_NpcBodyIsNotAnAuraTarget(t *testing.T) {
	space := phy.NewSpace()

	def := npcDef("Farmer", teachingInteraction("", []string{"lore"}))
	def.Body.CollisionLayer = 97 // PlayerStatic|Viewport|MobStatic — no Action(2)
	m := mob.NewMob(def, 0, nil)
	m.SetPosition(phy.Vec2f{X: 0, Y: 0})
	addNpcToSpace(t, space, m)

	// An aura is a sensor masked to the combatant layers; this is the query
	// every damage aura runs.
	aura := phy.NewCircle(phy.Vec2f{X: 0, Y: 0}, 5)
	aura.Shape().Layer = int(model.LayerNoneCollision)
	aura.Shape().Mask = int(model.LayerCombatants)
	aura.Shape().IsSensor = true
	space.AddShape(aura)
	space.Update()

	for c := range aura.Collisions() {
		assert.NotSame(t, m.Bodies()[0], c, "an NPC body must never surface as an aura target")
	}
}
