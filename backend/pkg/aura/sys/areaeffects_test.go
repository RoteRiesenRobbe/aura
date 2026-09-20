package sys

// Area effects (plan-area-effects.md E2) — the system that makes an authored
// shape act on what stands inside it.
//
// ⭐ EVERY LEG BELOW DRIVES A REAL skills.Buffs, never a recording fake, and
// that is the whole design of this file. The chunk's two load-bearing
// behaviours — the free first interval (D4/D5) and the refresh that does NOT
// reset the tick phase (D6) — are properties of the buff store, not of this
// system. A fake that recorded "ApplyDot was called" would pass with both of
// them broken.

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/mob"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/world"
)

// ---- fixtures -------------------------------------------------------------

// areaDummy is an entity that can stand somewhere and carry buffs. It holds a
// REAL buff store, so cadence, duration and the refresh rule are the shipped
// ones.
type areaDummy struct {
	model.BasicEntity
	pos     phy.Vec2f
	buffs   skills.Buffs
	dormant bool
}

func (d *areaDummy) Position() phy.Vec2f { return d.pos }
func (d *areaDummy) ApplyDot(source skills.SkillID, dot skills.DotBuff, ticks int) bool {
	return d.buffs.ApplyDot(source, dot, ticks)
}
func (d *areaDummy) ApplyHot(source skills.SkillID, hot skills.HotBuff, ticks int) bool {
	return d.buffs.ApplyHot(source, hot, ticks)
}
func (d *areaDummy) Dormant() bool { return d.dormant }

// tick advances this entity's buff store one game tick and returns the events
// that came due, exactly as SkillSystem.tickBuffEvents drains them.
func (d *areaDummy) tick() ([]skills.DotHit, []skills.HotEvent) {
	dots, hots := d.buffs.DueBuffEvents()
	d.buffs.Tick()
	return dots, hots
}

// fakeSkills answers by name, like the real registry.
type fakeSkillRegistry struct{ defs map[string]*skills.SkillDefinition }

func (f fakeSkillRegistry) Get(id skills.SkillID) (*skills.SkillDefinition, error) {
	for _, d := range f.defs {
		if d.ID == id {
			return d, nil
		}
	}
	return nil, assertErr
}
func (f fakeSkillRegistry) GetByName(name string) (*skills.SkillDefinition, error) {
	if d, ok := f.defs[name]; ok {
		return d, nil
	}
	return nil, assertErr
}
func (f fakeSkillRegistry) All() []*skills.SkillDefinition {
	out := make([]*skills.SkillDefinition, 0, len(f.defs))
	for _, d := range f.defs {
		out = append(out, d)
	}
	return out
}

var assertErr = &notFound{}

type notFound struct{}

func (*notFound) Error() string { return "not found" }

const (
	areaInterval  = 10 // game ticks between events
	areaTickCount = 5  // events per application
	areaDamage    = 7
	areaHeal      = 3
)

func burnSkill() *skills.SkillDefinition {
	return &skills.SkillDefinition{
		ID: skills.SkillID(9001), Name: "TestBurn", MaxLevel: 1,
		Effects: []skills.EffectDef{{
			Type: skills.EffectTypeDotAura,
			Dot: &skills.DotParams{
				HP: areaDamage, Tags: []string{"fire"},
				TickCount: areaTickCount, Interval: areaInterval,
			},
		}},
	}
}

func springSkill() *skills.SkillDefinition {
	return &skills.SkillDefinition{
		ID: skills.SkillID(9002), Name: "TestSpring", MaxLevel: 1,
		Effects: []skills.EffectDef{{
			Type: skills.EffectTypeHotAura,
			Hot: &skills.HotParams{
				HP: areaHeal, TickCount: areaTickCount, Interval: areaInterval,
			},
		}},
	}
}

// A 20x20 box centred on the origin. ⚑ The geometry is pinned in
// world/point_in_polygon_test.go against awkward shapes; here the shape only
// has to be unambiguous, so a reader can tell inside from outside at a glance.
var areaBox = []world.Point{
	{X: -10, Y: -10}, {X: 10, Y: -10}, {X: 10, Y: 10}, {X: -10, Y: 10},
}

func areaAt(effect string, pts []world.Point) world.PlacedAreaEffect {
	return world.PlacedAreaEffect{
		Effect: effect, Points: pts, Bounds: world.BoundsOf(pts),
		Zone: "test", Kind: "polygon", Index: 0,
	}
}

func newAreaSystem(t *testing.T, defs []*skills.SkillDefinition, areas ...world.PlacedAreaEffect) *AreaEffectSystem {
	t.Helper()
	reg := fakeSkillRegistry{defs: map[string]*skills.SkillDefinition{}}
	for _, d := range defs {
		reg.defs[d.Name] = d
	}
	return NewAreaEffectSystem(areas, reg)
}

// inside/outside the box above.
var insideArea = phy.Vec2f{X: 0, Y: 0}
var outsideArea = phy.Vec2f{X: 50, Y: 50}

// runTicks advances n ticks: the system applies, then the entity drains. Returns
// the total number of damage events and their summed HP.
func runTicks(s *AreaEffectSystem, d *areaDummy, n int) (events int, totalHP float32) {
	for i := 0; i < n; i++ {
		s.Update(1)
		dots, _ := d.tick()
		for _, hit := range dots {
			events++
			totalHP += hit.HP
		}
	}
	return
}

// ---- the dwell leg --------------------------------------------------------

// ⭐ D4/D5: the first interval is FREE, and no dwell timer is built to make it
// so. DurationTicks() puts the first event at Interval rather than at
// application, so walking through a hazard faster than its cadence costs
// nothing — mercy on a hazard, a cost on a boon (§2.4).
func TestAreaEffect_FirstIntervalIsFree(t *testing.T) {
	s := newAreaSystem(t, []*skills.SkillDefinition{burnSkill()}, areaAt("TestBurn", areaBox))
	d := &areaDummy{pos: insideArea}
	s.AddEntity(d)
	require.Len(t, s.entities, 1, "the dummy must satisfy areaAffectable")

	events, _ := runTicks(s, d, areaInterval-1)
	assert.Zero(t, events, "standing inside for Interval-1 ticks must cost nothing")

	events, hp := runTicks(s, d, 1)
	assert.Equal(t, 1, events, "the Interval-th tick must produce exactly one event")
	assert.InDelta(t, float32(areaDamage), hp, 1e-4)
}

// ---- ⭐⭐ THE HOP LEG, WHICH IS THE ONE THAT MATTERS -----------------------

// ⛔ D4 TAKEN ALONE IS A TOTAL IMMUNITY EXPLOIT: if re-entry restarted the
// timer, a player hopping the edge faster than the cadence would never burn. The
// rule that closes it is that a refresh resets the DURATION but never the tick
// PHASE — ApplyDot "keeps the acting accumulator running".
//
// ⭐ This is the leg that would catch a future refactor reopening it, and the
// reason the system holds NO per-entity memory: anything that remembered who was
// inside last tick would have to re-derive this, and would get it wrong.
func TestAreaEffect_HoppingTheEdgeDoesNotResetTheTickPhase(t *testing.T) {
	s := newAreaSystem(t, []*skills.SkillDefinition{burnSkill()}, areaAt("TestBurn", areaBox))
	d := &areaDummy{pos: insideArea}
	s.AddEntity(d)

	// Step out and back in every Interval-1 ticks — the exploit's exact shape.
	events := 0
	for i := 0; i < areaInterval*4; i++ {
		if i%(areaInterval-1) == 0 {
			d.pos = outsideArea // a tick spent outside
		} else {
			d.pos = insideArea
		}
		s.Update(1)
		dots, _ := d.tick()
		events += len(dots)
	}

	// ⚑ The claim is "still burns on schedule", not an exact count: the hop
	// costs some ticks outside, so the total is a little under the standing
	// figure. What must NOT happen is zero.
	assert.GreaterOrEqual(t, events, 3,
		"hopping the edge must NOT grant immunity — this is D6, and its failure is a total exploit")
}

// ⚑ The control that makes the number above mean something: standing still for
// the same span burns on a strict schedule.
func TestAreaEffect_StandingStillBurnsOnSchedule(t *testing.T) {
	s := newAreaSystem(t, []*skills.SkillDefinition{burnSkill()}, areaAt("TestBurn", areaBox))
	d := &areaDummy{pos: insideArea}
	s.AddEntity(d)

	events, _ := runTicks(s, d, areaInterval*4)
	assert.Equal(t, 4, events, "four intervals inside must be four events")
}

// ---- leaving --------------------------------------------------------------

// ⚑ The companion property (§2.2): walking out leaves the last application to
// lapse on its own schedule rather than being cancelled. Both the right feel and
// the second half of the anti-hop fix.
func TestAreaEffect_LeavingLetsTheLastApplicationLapse(t *testing.T) {
	s := newAreaSystem(t, []*skills.SkillDefinition{burnSkill()}, areaAt("TestBurn", areaBox))
	d := &areaDummy{pos: insideArea}
	s.AddEntity(d)

	runTicks(s, d, areaInterval) // one event, buff running
	d.pos = outsideArea
	events, _ := runTicks(s, d, areaInterval)
	assert.Positive(t, events, "the burn must keep ticking after the player leaves")

	// ...and eventually stop, rather than burning forever.
	runTicks(s, d, areaInterval*areaTickCount*2)
	events, _ = runTicks(s, d, areaInterval*2)
	assert.Zero(t, events, "the burn must lapse once its authored lifetime runs out")
}

// ---- inert -----------------------------------------------------------------

// ⭐ D10 at the system level: a shape with no effect contributes no area, so the
// per-tick walk never sees it. CollectAreaEffects filters upstream; this pins
// that the system does nothing with an empty set.
func TestAreaEffect_NoAreasIsANoOp(t *testing.T) {
	s := newAreaSystem(t, []*skills.SkillDefinition{burnSkill()})
	d := &areaDummy{pos: insideArea}
	s.AddEntity(d)
	events, _ := runTicks(s, d, areaInterval*3)
	assert.Zero(t, events)
}

func TestAreaEffect_OutsideTakesNothing(t *testing.T) {
	s := newAreaSystem(t, []*skills.SkillDefinition{burnSkill()}, areaAt("TestBurn", areaBox))
	d := &areaDummy{pos: outsideArea}
	s.AddEntity(d)
	events, _ := runTicks(s, d, areaInterval*3)
	assert.Zero(t, events, "standing outside must cost nothing")
}

// ⛔ A skill that exists but carries nothing an area can apply resolves to NO
// area at all. Boot refuses this (world.CrossValidateAreaEffectShapes); the
// system's own belt is that it cannot be tricked into applying a dash.
func TestAreaEffect_ASkillWithNoApplicableEffectContributesNothing(t *testing.T) {
	dash := &skills.SkillDefinition{
		ID: skills.SkillID(9003), Name: "TestDash", MaxLevel: 1,
		Effects: []skills.EffectDef{{Type: skills.EffectTypeSpeedBurst}},
	}
	s := newAreaSystem(t, []*skills.SkillDefinition{dash}, areaAt("TestDash", areaBox))
	assert.Empty(t, s.resolved, "a skill with no dot_aura or hot_aura is not an area effect")
}

// ---- ⚑ the BENEFICIAL half (D9) -------------------------------------------

// ⭐ The mechanism is SYMMETRIC, and a suite that only ever tested damage would
// not notice the day it stopped being. A healing spring needs no second
// mechanism — ApplyHot sits beside ApplyDot with the same refresh rule.
func TestAreaEffect_ABeneficialAreaHeals(t *testing.T) {
	s := newAreaSystem(t, []*skills.SkillDefinition{springSkill()}, areaAt("TestSpring", areaBox))
	d := &areaDummy{pos: insideArea}
	s.AddEntity(d)

	heals := 0
	var totalHP float32
	for i := 0; i < areaInterval*3; i++ {
		s.Update(1)
		_, hots := d.tick()
		for _, h := range hots {
			heals++
			totalHP += h.HP
		}
	}
	assert.Equal(t, 3, heals, "three intervals in a spring must be three heal events")
	assert.InDelta(t, float32(areaHeal*3), totalHP, 1e-4)
}

// ⚑ The first interval is free for a BOON too, and §2.4 notes the two read
// differently: on a hazard the skipped interval is mercy, on a spring it is a
// cost. Same default, deliberately, and pinned so a future dwell key cannot
// change one without the other going red.
func TestAreaEffect_ABeneficialAreaAlsoSkipsTheFirstInterval(t *testing.T) {
	s := newAreaSystem(t, []*skills.SkillDefinition{springSkill()}, areaAt("TestSpring", areaBox))
	d := &areaDummy{pos: insideArea}
	s.AddEntity(d)
	for i := 0; i < areaInterval-1; i++ {
		s.Update(1)
		_, hots := d.tick()
		assert.Empty(t, hots)
	}
}

// ---- D12: dormancy ---------------------------------------------------------

// ⭐ A dormant entity is skipped, and the reason is CONSISTENCY (§2.6): it is
// already out of phy.Space and unhittable by every aura and projectile, so an
// area that reached it would be the only thing that did.
func TestAreaEffect_ADormantEntityTakesNothing(t *testing.T) {
	s := newAreaSystem(t, []*skills.SkillDefinition{burnSkill()}, areaAt("TestBurn", areaBox))
	d := &areaDummy{pos: insideArea, dormant: true}
	s.AddEntity(d)
	events, _ := runTicks(s, d, areaInterval*3)
	assert.Zero(t, events, "a dormant entity must not be reached by an area")
}

// ⛔ SKIPPED, NOT RESISTED — different mechanisms with the same observable, and
// only one of them survives waking up. A future refactor that "optimised" the
// dormancy test into a zero-damage multiplier would pass the leg above and fail
// this one.
func TestAreaEffect_WakingUpStartsTakingDamage(t *testing.T) {
	s := newAreaSystem(t, []*skills.SkillDefinition{burnSkill()}, areaAt("TestBurn", areaBox))
	d := &areaDummy{pos: insideArea, dormant: true}
	s.AddEntity(d)
	events, _ := runTicks(s, d, areaInterval*2)
	require.Zero(t, events)

	d.dormant = false
	events, _ = runTicks(s, d, areaInterval)
	assert.Equal(t, 1, events, "a woken entity standing in lava must start burning")
}

// ---- the source ------------------------------------------------------------

// ⭐⭐ D13, AND THE SEAM THAT MADE E2 A DESIGN DECISION. DotBuff.Caster is not
// only the stream key — sys/skills.go type-switches on it to decide WHICH entry
// point the damage takes, and its default case drops anything it does not
// recognise, silently. A synthetic token would have applied the buff, ticked it,
// and discarded every event with nothing thrown.
//
// ⛔ So the caster must satisfy model.AreaSource, and this is what pins it. If
// the type stops matching, this goes red HERE instead of the damage silently
// vanishing in production.
func TestAreaEffect_TheCasterIsAnAreaSourceTheDispatchRecognises(t *testing.T) {
	s := newAreaSystem(t, []*skills.SkillDefinition{burnSkill()}, areaAt("TestBurn", areaBox))
	d := &areaDummy{pos: insideArea}
	s.AddEntity(d)

	var hits []skills.DotHit
	for i := 0; i < areaInterval; i++ {
		s.Update(1)
		dots, _ := d.tick()
		hits = append(hits, dots...)
	}
	require.Len(t, hits, 1)

	src, ok := hits[0].Caster.(model.AreaSource)
	require.True(t, ok, "the dot's caster MUST be a model.AreaSource, or sys/skills.go drops the event")
	assert.Equal(t, "TestBurn", src.AreaEffectName())

	// ⛔ And it must be NEITHER of the other two, or it would take the wrong
	// entry point and pick up threat and kill credit it must never have.
	_, isPlayer := hits[0].Caster.(model.PlayerEntity)
	_, isMob := hits[0].Caster.(model.MobEntity)
	assert.False(t, isPlayer)
	assert.False(t, isMob)
}

// ⛔ L2: two areas at the SAME per-event damage must not collapse into one
// stream. ApplyDot keys on (source skill, per-event HP, caster) — so the caster
// being the PLACED SHAPE, distinct per area, is what keeps them apart. Standing
// in both must hurt twice as fast as standing in one.
func TestAreaEffect_TwoAreasOfEqualStrengthDoNotCollapse(t *testing.T) {
	// Two overlapping boxes, same effect, same strength.
	other := []world.Point{{X: -5, Y: -5}, {X: 15, Y: -5}, {X: 15, Y: 15}, {X: -5, Y: 15}}
	s := newAreaSystem(t, []*skills.SkillDefinition{burnSkill()},
		areaAt("TestBurn", areaBox), areaAt("TestBurn", other))
	require.Len(t, s.resolved, 2)

	// (0,0) is inside areaBox only; (3,3) is inside both.
	inBoth := &areaDummy{pos: phy.Vec2f{X: 3, Y: 3}}
	inOne := &areaDummy{pos: phy.Vec2f{X: -8, Y: -8}}
	s.AddEntity(inBoth)
	s.AddEntity(inOne)

	var both, one int
	for i := 0; i < areaInterval; i++ {
		s.Update(1)
		db, _ := inBoth.tick()
		do, _ := inOne.tick()
		both += len(db)
		one += len(do)
	}
	assert.Equal(t, 1, one, "one area, one event")
	assert.Equal(t, 2, both,
		"two areas of equal strength must own separate streams (L2) — a collapse under-applies")
}

// ---- ⭐ D11: a mob's immunity is its authored resistances -------------------

// fakeAreaSource is the minimal model.AreaSource, for driving AreaTouches
// directly — the buff path is pinned above; this pins the RECEIVING half.
type fakeAreaSource struct{ name string }

func (f fakeAreaSource) AreaEffectName() string { return f.name }

// mobWithResistances builds a real Mob whose species authors the given map.
func mobWithResistances(t *testing.T, r map[string]float32) *mob.Mob {
	t.Helper()
	def := testMobDef()
	def.Factors.Resistances = r
	return mob.NewMob(def, 0, nil)
}

// ⭐ THE WHOLE OF THE PO's 2026-09-16 ANSWER, and the point is that there is no
// area-effect-specific code in the path that implements it: AreaTouches goes
// through takeDamage, and takeDamage is where ResistMultiplier already lives.
//
// ⚑ BOTH a partial resistance and a full immunity, never just the `0`. A suite
// that pinned only immunity could not tell "immune" from "the resist multiplier
// is no longer applied to this path at all" — the two look identical.
func TestAreaTouches_AppliesAuthoredResistances(t *testing.T) {
	const hit = 40
	src := fakeAreaSource{name: "TestBurn"}
	dmg := func() model.Damage { return model.Damage{HP: hit, Tags: []string{"fire"}} }

	// ⚑ float64 throughout: Health() is a named vitals type, and testify's
	// numeric asserts refuse one.
	lost := func(m *mob.Mob) float64 {
		before := float64(m.Health())
		m.AreaTouches(src, dmg())
		return before - float64(m.Health())
	}

	full := lost(mobWithResistances(t, nil))
	require.Positive(t, full, "an unresisted mob must take area damage at all (D11)")

	assert.InDelta(t, full/2, lost(mobWithResistances(t, map[string]float32{"fire": 0.5})), 1.5,
		"a 0.5 fire resistance must halve an area's fire damage, through takeDamage alone")

	assert.InDelta(t, 0, lost(mobWithResistances(t, map[string]float32{"fire": 0})), 1e-9,
		"an authored 0 is immunity — the salamander standing in lava")
}

// ⚑ A resistance to a DIFFERENT tag must not help. Otherwise "resistances are
// applied" could be true while the tag matching was broken, and every hazard
// would be shrugged off by anything resistant to anything.
func TestAreaTouches_ResistanceIsPerTag(t *testing.T) {
	m := mobWithResistances(t, map[string]float32{"frost": 0})
	before := m.Health()
	m.AreaTouches(fakeAreaSource{name: "TestBurn"}, model.Damage{HP: 40, Tags: []string{"fire"}})
	assert.Less(t, m.Health(), before, "frost resistance must not blunt a fire area")
}

// ---- ⭐⭐ THE DISPATCH, END TO END ----------------------------------------

// ⛔ THE LEG THAT WAS MISSING, AND MUTATION-TESTING FOUND IT. Deleting the
// `case model.AreaSource` from sys/skills.go's dot dispatch left every other
// area-effect test GREEN: they assert the buff is applied and that its caster
// has the right type, and neither notices that the damage is then discarded by
// the switch's `default: continue`.
//
// ⭐ That silent drop is the whole reason E2 needed a design decision rather
// than an implementation, so it has to be pinned where it actually happens —
// through tickBuffEvents, on a REAL mob, asserting HEALTH went down. Everything
// upstream can be perfect and the pool still does nothing.
func TestAreaDot_ActuallyDamagesThroughTheDispatch(t *testing.T) {
	sk := NewSkillSystem(phy.NewSpace(), newFakeGame())
	m := mob.NewMob(testMobDef(), 0, nil)
	before := float64(m.Health())

	area := &world.PlacedAreaEffect{Effect: "TestBurn", Zone: "test", Kind: "polygon"}
	// One application, due immediately: Interval 1 so the first event lands on
	// the next drain.
	m.ApplyDot(skills.SkillID(9001), skills.DotBuff{
		HP: 25, Tags: []string{"fire"}, Interval: 1, Caster: area,
	}, 10)

	for i := 0; i < 3; i++ {
		sk.tickBuffEvents(m)
	}

	assert.Less(t, float64(m.Health()), before,
		"an area's dot MUST reach health — without the AreaSource case the dispatch drops every event in silence")
}

// ⚑ And the beneficial half of the same seam: a hot's caster is an AreaSource
// too, and tickHotEvents attributes rather than dispatching — so it must heal
// without needing a case of its own. Pinned because "it works by not caring"
// is exactly the kind of thing that stops being true quietly.
func TestAreaHot_HealsThroughTheSamePath(t *testing.T) {
	sk := NewSkillSystem(phy.NewSpace(), newFakeGame())
	m := mob.NewMob(testMobDef(), 0, nil)
	m.AreaTouches(fakeAreaSource{name: "x"}, model.Damage{HP: 40, Tags: []string{"fire"}})
	hurt := float64(m.Health())
	require.Less(t, hurt, float64(m.MaxHealth()), "the fixture must actually be damaged first")

	area := &world.PlacedAreaEffect{Effect: "TestSpring", Zone: "test", Kind: "polygon"}
	m.ApplyHot(skills.SkillID(9002), skills.HotBuff{HP: 10, Interval: 1, Caster: area}, 10)
	for i := 0; i < 3; i++ {
		sk.tickBuffEvents(m)
	}
	assert.Greater(t, float64(m.Health()), hurt, "a beneficial area must heal through the same path")
}
