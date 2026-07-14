package sys

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/trichner/berryhunter/pkg/berryhunter/model"
	"github.com/trichner/berryhunter/pkg/berryhunter/model/npc"
	"github.com/trichner/berryhunter/pkg/berryhunter/phy"
	"github.com/trichner/berryhunter/pkg/berryhunter/skills"
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

	base := npc.New(phy.Vec2f{X: 0, Y: 0}, 3,
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
