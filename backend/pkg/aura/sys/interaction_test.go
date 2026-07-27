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
