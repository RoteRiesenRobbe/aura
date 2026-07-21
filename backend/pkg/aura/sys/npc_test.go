package sys

import (
	"testing"

	"github.com/google/flatbuffers/go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/RoteRiesenRobbe/aura/pkg/api/AuraApi"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/npc"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

// --- test doubles for onApproach (narrow teacher/learner interfaces) ---

// fakeTeacher supplies the approach payload onApproach reads.
type fakeTeacher struct {
	teachings  []model.Teaching
	tooLowLine string
	lines      []string
}

func (f *fakeTeacher) Teachings() []model.Teaching { return f.teachings }
func (f *fakeTeacher) TooLowLine() string          { return f.tooLowLine }
func (f *fakeTeacher) Lines() []string             { return f.lines }

var _ teacher = (*fakeTeacher)(nil)

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

// teaching builds a model.Teaching with a distinct SkillDefinition of the given
// id (the id is all onApproach touches on Def).
func teaching(id int, reqLevel uint32, line string) model.Teaching {
	return model.Teaching{
		Def:           &skills.SkillDefinition{ID: skills.SkillID(id)},
		RequiredLevel: reqLevel,
		Line:          line,
	}
}

// --- onApproach: grant logic ---

func TestOnApproach_MultiTeachingOrderedGrant(t *testing.T) {
	n := &fakeTeacher{
		tooLowLine: "too low",
		teachings: []model.Teaching{
			teaching(1, 1, "learned heal"),
			teaching(2, 5, "learned dash"),
		},
	}
	p := newLearner(10) // qualifies for both

	lines := onApproach(n, p)

	assert.Equal(t, []string{"learned heal", "learned dash"}, lines, "both lines in order")
	assert.True(t, p.sc.HasDiscovered(1), "heal granted")
	assert.True(t, p.sc.HasDiscovered(2), "dash granted")
	assert.Equal(t, 2, p.cascadeCalls, "cascade run once per grant")
}

func TestOnApproach_LevelGateStops(t *testing.T) {
	n := &fakeTeacher{
		tooLowLine: "come back stronger",
		teachings: []model.Teaching{
			teaching(1, 1, "learned heal"),
			teaching(2, 5, "learned dash"),
		},
	}
	p := newLearner(3) // qualifies for heal (1) but not dash (5)

	lines := onApproach(n, p)

	assert.Equal(t, []string{"learned heal", "come back stronger"}, lines,
		"grants the qualifying teaching, then the too-low line and stops")
	assert.True(t, p.sc.HasDiscovered(1), "heal granted")
	assert.False(t, p.sc.HasDiscovered(2), "dash NOT granted (gated)")
	assert.Equal(t, 1, p.cascadeCalls, "cascade only for the one grant")
}

func TestOnApproach_FirstTeachingTooLow(t *testing.T) {
	n := &fakeTeacher{
		tooLowLine: "come back stronger",
		teachings:  []model.Teaching{teaching(1, 5, "learned dash")},
	}
	p := newLearner(1)

	lines := onApproach(n, p)

	assert.Equal(t, []string{"come back stronger"}, lines)
	assert.False(t, p.sc.HasDiscovered(1))
	assert.Equal(t, 0, p.cascadeCalls)
}

func TestOnApproach_BackToBackMultiUnlock(t *testing.T) {
	// A level-skipper meeting the NPC for the first time gets every qualifying
	// teaching at once, each with its own line.
	n := &fakeTeacher{
		tooLowLine: "too low",
		teachings: []model.Teaching{
			teaching(1, 1, "a"),
			teaching(2, 5, "b"),
			teaching(3, 10, "c"),
		},
	}
	p := newLearner(20)

	lines := onApproach(n, p)

	assert.Equal(t, []string{"a", "b", "c"}, lines)
	assert.True(t, p.sc.HasDiscovered(1) && p.sc.HasDiscovered(2) && p.sc.HasDiscovered(3))
	assert.Equal(t, 3, p.cascadeCalls)
}

func TestOnApproach_IdempotentReApproach(t *testing.T) {
	n := &fakeTeacher{
		tooLowLine: "too low",
		teachings:  []model.Teaching{teaching(1, 1, "learned heal")},
	}
	p := newLearner(10)
	p.sc.Discover(1) // already knows it

	lines := onApproach(n, p)

	assert.Empty(t, lines, "nothing to teach, no lore fallback -> silent")
	assert.Equal(t, 0, p.cascadeCalls, "no re-grant")
}

func TestOnApproach_LoreFallbackWhenNothingTaught(t *testing.T) {
	n := &fakeTeacher{lines: []string{"No entry.", "Trolls up north."}}
	p := newLearner(10)

	lines := onApproach(n, p)

	assert.Equal(t, []string{"No entry.", "Trolls up north."}, lines)
	assert.Equal(t, 0, p.cascadeCalls, "pure-lore NPC never grants")
}

func TestOnApproach_LoreFallbackWhenAllLearned(t *testing.T) {
	// An all-learned sage falls back to idle lore instead of going silent.
	n := &fakeTeacher{
		tooLowLine: "too low",
		teachings:  []model.Teaching{teaching(1, 1, "learned heal")},
		lines:      []string{"You have learned all I can teach."},
	}
	p := newLearner(10)
	p.sc.Discover(1)

	lines := onApproach(n, p)

	assert.Equal(t, []string{"You have learned all I can teach."}, lines)
	assert.Equal(t, 0, p.cascadeCalls)
}

// --- NpcSystem.Update: rising-edge wiring against real physics ---

// countingNpc is a real NPC whose Teachings() call count reveals how many times
// onApproach ran (onApproach reads Teachings() exactly once per invocation).
type countingNpc struct {
	*npc.Npc
	teachCalls int
}

func (c *countingNpc) Teachings() []model.Teaching {
	c.teachCalls++
	return c.Npc.Teachings()
}

func TestNpcSystem_RisingEdgeAntiSpamAndReTrigger(t *testing.T) {
	space := phy.NewSpace()

	base := npc.New(phy.Vec2f{X: 0, Y: 0}, 3, npc.PlaceholderSprite,
		[]model.Teaching{teaching(1, 1, "learned heal")}, "too low", nil)
	n := &countingNpc{Npc: base}
	// Register exactly as game.addNpcEntity does: visual body static, sensor
	// dynamic. onApproach reads players from the dynamic sensor's Collisions().
	space.AddStaticShape(n.Bodies()[0])
	space.AddShape(n.Sensor())

	// A real player collider whose UserData is a model.PlayerEntity (what
	// NpcSystem.Update asserts). newFakePlayer satisfies the full interface.
	p := newFakePlayer()
	p.level = 10
	player := phy.NewCircle(phy.Vec2f{X: 1, Y: 0}, 0.5)
	player.Shape().Layer = int(model.LayerPlayerCollision)
	player.Shape().UserData = model.PlayerEntity(p)
	space.AddShape(player)

	sysN := NewNpcSystem()
	sysN.AddEntity(n)

	step := func() {
		space.Update()
		sysN.Update(33.0)
	}

	// Tick 1: player enters -> rising edge -> one onApproach, skill granted.
	step()
	assert.Equal(t, 1, n.teachCalls, "onApproach fires on entry")
	assert.True(t, p.sc.HasDiscovered(1), "skill granted on approach")

	// Ticks 2..4: still in range -> no further onApproach (anti-spam).
	step()
	step()
	step()
	assert.Equal(t, 1, n.teachCalls, "standing in range does not re-fire")

	// Player leaves the sensor radius.
	player.SetPosition(phy.Vec2f{X: 50, Y: 0})
	step()
	assert.Equal(t, 1, n.teachCalls, "leaving does not fire")

	// Player returns -> falling+rising edge -> onApproach fires again (already
	// known skill is simply skipped, but a lore/new-teaching NPC would re-speak).
	player.SetPosition(phy.Vec2f{X: 1, Y: 0})
	step()
	assert.Equal(t, 2, n.teachCalls, "leave + re-enter re-triggers")
}

// --- speech: EntityMessage fan-out to the sensor's players (chunk 4) ---

func addPlayerCollider(space *phy.Space, p *fakePlayer, pos phy.Vec2f) *phy.Circle {
	body := phy.NewCircle(pos, 0.5)
	body.Shape().Layer = int(model.LayerPlayerCollision)
	body.Shape().UserData = model.PlayerEntity(p)
	space.AddShape(body)
	return body
}

func sentOf(p *fakePlayer) [][]byte { return p.client.(*fakeClient).sent }

// decodeEntityMessage unwraps the wire bytes NpcSystem.speak produces back into
// the anchored entity id + text, verifying it is really an EntityMessage.
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

func TestNpcSystem_SpeechReachesAllSensorPlayers(t *testing.T) {
	space := phy.NewSpace()

	// A lore NPC speaks its (multi-line) lore on every approach, independent of
	// level or grants — the cleanest way to exercise the speech path.
	n := npc.New(phy.Vec2f{X: 0, Y: 0}, 3, npc.PlaceholderSprite, nil, "",
		[]string{"Welcome, traveler.", "Trolls up north."})
	space.AddStaticShape(n.Bodies()[0])
	space.AddShape(n.Sensor())

	sysN := NewNpcSystem()
	sysN.AddEntity(n)

	// A bystander already standing in range; a newcomer waiting out of range.
	bystander := newFakePlayer()
	bystander.level = 10
	addPlayerCollider(space, bystander, phy.Vec2f{X: 1, Y: 0})
	newcomer := newFakePlayer()
	newcomer.level = 10
	newcomerBody := addPlayerCollider(space, newcomer, phy.Vec2f{X: 50, Y: 0})

	step := func() { space.Update(); sysN.Update(33.0) }

	// Tick 1: the bystander alone approaches -> one bubble reaches it.
	step()
	require.Len(t, sentOf(bystander), 1, "bystander hears the NPC on its own approach")
	bystanderBefore := len(sentOf(bystander))

	// Tick 2: the newcomer crosses in. It is the only rising edge, yet the
	// bubble it triggers fans out to EVERY player in the sensor.
	newcomerBody.SetPosition(phy.Vec2f{X: 2, Y: 0})
	step()

	assert.Len(t, sentOf(newcomer), 1, "newcomer hears the NPC it approached")
	assert.Equal(t, bystanderBefore+1, len(sentOf(bystander)),
		"bystander who did not move also hears the newcomer's bubble (fan-out to all)")

	// Content: anchored on the NPC, lines newline-joined into one bubble.
	id, msg := decodeEntityMessage(t, sentOf(newcomer)[0])
	assert.Equal(t, n.Basic().ID(), id, "bubble anchored on the NPC entity")
	assert.Equal(t, "Welcome, traveler.\nTrolls up north.", msg, "lines joined into one bubble")
}
