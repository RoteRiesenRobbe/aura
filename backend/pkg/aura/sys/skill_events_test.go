package sys

// The system-side half of the hit-event wiring (plan-skill-vfx.md C1): the
// skill id reaching the funnel through every acting path, and the FIRED stamp.
//
// The funnel BEHAVIOUR itself (which HitKind, what amount) is pinned in
// model/mob and model/player; what this file cares about is that the id and
// the caster survive the trip from the skill definition to the victim.

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/mob"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/vitals"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

// eventsOf reads a struck entity's recorded events; the helper exists so the
// test reads the same way whether the victim is a mob or a player.
func eventsOf(t *testing.T, e any) []model.SkillEvent {
	t.Helper()
	src, ok := e.(interface{ SkillEvents() []model.SkillEvent })
	require.True(t, ok, "%T records no skill events", e)
	return src.SkillEvents()
}

func hitAmountOf(events []model.SkillEvent, kind model.HitKind) vitals.VitalSign {
	var total vitals.VitalSign
	for _, e := range events {
		if e.Kind == kind {
			total += e.Amount
		}
	}
	return total
}

func firedIDs(events []model.SkillEvent) []skills.SkillID {
	var ids []skills.SkillID
	for _, e := range events {
		if e.Fired {
			ids = append(ids, e.SkillID)
		}
	}
	return ids
}

func hitSkillIDs(events []model.SkillEvent) []skills.SkillID {
	var ids []skills.SkillID
	for _, e := range events {
		if !e.Fired {
			ids = append(ids, e.SkillID)
		}
	}
	return ids
}

// --- the skill id survives the aura path ---

func TestSkillEvents_DamageAuraHitNamesItsSkill(t *testing.T) {
	caster := newFakePlayer()
	target := mob.NewMob(testMobDef(), 0, nil)

	applyDamageAura(caster, 141, 1, damageEffect(1), colliderSetOf(target), testRNG())

	assert.Equal(t, []skills.SkillID{141}, hitSkillIDs(eventsOf(t, target)))
}

// The dot's id is the one the buff store held, NOT whatever the caster runs
// now: a burn ticks long after its aura is gone (§12a.2/3).
func TestSkillEvents_DotTickNamesTheSkillThatLitIt(t *testing.T) {
	s := testSkillSystem()
	caster := newFakePlayer()
	target := mob.NewMob(testMobDef(), 0, nil)
	target.ApplyDot(141, skills.DotBuff{HP: 5, Tags: []string{"fire"}, Interval: 1, Caster: caster}, 5)

	target.ResetTickNumbers() // ages the buff to its first due tick
	s.tickBuffEvents(target)

	assert.Equal(t, []skills.SkillID{141}, hitSkillIDs(eventsOf(t, target)))
}

func TestSkillEvents_HotTickNamesTheSkillThatAppliedIt(t *testing.T) {
	s := testSkillSystem()
	caster := newFakePlayer()
	target := mob.NewMob(testMobDef(), 0, nil)
	target.PlayerTouches(caster, model.Damage{HP: 50, Tags: []string{"physical"}})
	target.ApplyHot(72, skills.HotBuff{HP: 5, Interval: 1, Caster: caster}, 5)

	target.ResetTickNumbers()
	s.tickBuffEvents(target)

	events := eventsOf(t, target)
	assert.Equal(t, []skills.SkillID{72}, hitSkillIDs(events))
	assert.NotZero(t, hitAmountOf(events, model.HitKindHeal))
}

// --- the phase axis (§12h): every tick path marks its landing a Tick ---

// phasesOf lists the non-fired events' phases, in order.
func phasesOf(events []model.SkillEvent) []model.HitPhase {
	var out []model.HitPhase
	for _, e := range events {
		if !e.Fired {
			out = append(out, e.Phase)
		}
	}
	return out
}

// A DoT tick is a Tick whichever of the three caster shapes lit it: a player,
// a mob, or a place. Each case builds its own payload in tickBuffEvents, so
// each is pinned on its own.
func TestSkillEvents_DotTickIsATickForEveryCasterShape(t *testing.T) {
	cases := map[string]any{
		"player": newFakePlayer(),
		"mob":    mob.NewMob(testMobDef(), 0, nil),
		"area":   fakeAreaSource{name: "TestBurn"},
	}
	for name, caster := range cases {
		t.Run(name, func(t *testing.T) {
			s := testSkillSystem()
			target := mob.NewMob(testMobDef(), 0, nil)
			target.ApplyDot(141, skills.DotBuff{HP: 5, Tags: []string{"fire"}, Interval: 1, Caster: caster}, 5)

			target.ResetTickNumbers()
			s.tickBuffEvents(target)

			assert.Equal(t, []model.HitPhase{model.HitPhaseTick}, phasesOf(eventsOf(t, target)))
		})
	}
}

func TestSkillEvents_HotTickIsATick(t *testing.T) {
	s := testSkillSystem()
	caster := newFakePlayer()
	target := mob.NewMob(testMobDef(), 0, nil)
	target.PlayerTouches(caster, model.Damage{HP: 50, Tags: []string{"physical"}})
	target.ApplyHot(72, skills.HotBuff{HP: 5, Interval: 1, Caster: caster}, 5)

	target.ResetTickNumbers()
	s.tickBuffEvents(target)

	assert.Equal(t, []model.HitPhase{model.HitPhaseTick}, phasesOf(eventsOf(t, target)))
}

// The aura path reaches ApplyDot per target, so the application is noted there
// without applyDotEffect doing anything itself (the funnel, D9).
func TestSkillEvents_DotAuraNotesAppliedPerTarget(t *testing.T) {
	caster := newFakePlayer()
	a := mob.NewMob(testMobDef(), 0, nil)
	b := mob.NewMob(testMobDef(), 0, nil)
	applyDotEffect(caster, 141, 1, dotEffect(), colliderSetOf(a, b))

	for _, target := range []*mob.Mob{a, b} {
		events := eventsOf(t, target)
		require.Len(t, events, 1)
		assert.Equal(t, model.HitPhaseApplied, events[0].Phase)
		assert.Equal(t, caster.Basic().ID(), events[0].Source)
	}
}

// --- FIRED (§12a.4) ---

// firedVisual is the minimal `visual` that makes an aura worth a beat event:
// one layer that plays at the `fired` moment.
func firedVisual() *skills.VisualDef {
	return &skills.VisualDef{
		Layers:   []skills.VisualLayer{{Kind: "cast-pose", On: "fired"}},
		HasFired: true,
	}
}

func TestFired_AuraTickEmitsOnlyWhenTheVisualDrawsOnIt(t *testing.T) {
	caster, target := activeAuraPlayer(t, skills.EffectDef{
		Type: skills.EffectTypeDamageAura, TargetsEnemies: true, Radius: 1.0, TickInterval: 1,
		Damage: &skills.DamageParams{HP: 10},
	})

	// No visual at all: the aura ticks, and stays silent on the wire. An aura
	// beats up to 30 times a second; a FIRED nobody draws is pure cost.
	testSkillSystem().processEntity(caster)
	require.Len(t, target.touches, 1, "precondition: the aura ticked")
	assert.Empty(t, firedIDs(caster.SkillEvents()), "no `on: fired` layer, no event")

	caster.sc.AuraSlots[0].Def.Visual = firedVisual()
	testSkillSystem().processEntity(caster)

	assert.Equal(t, []skills.SkillID{99}, firedIDs(caster.SkillEvents()),
		"one beat, one event, named by the skill")
}

func TestFired_AuraEmitsOncePerTickNotOncePerEffect(t *testing.T) {
	// A two-effect aura on the same cadence is ONE beat. Emitting per effect
	// would draw the cast pose twice on the same tick.
	caster, _ := activeAuraPlayer(t,
		skills.EffectDef{
			Type: skills.EffectTypeDamageAura, TargetsEnemies: true, Radius: 1.0, TickInterval: 1,
			Damage: &skills.DamageParams{HP: 10},
		},
		skills.EffectDef{
			Type: skills.EffectTypeSlowAura, TargetsEnemies: true, Radius: 1.0, TickInterval: 1,
			Slow: &skills.SlowParams{Fraction: 0.5},
		},
	)
	caster.sc.AuraSlots[0].Def.Visual = firedVisual()

	testSkillSystem().processEntity(caster)

	assert.Len(t, firedIDs(caster.SkillEvents()), 1)
}

func TestFired_CooldownCastEmitsWithoutAVisual(t *testing.T) {
	// Unlike an aura beat, a cooldown cast is a one-off: it emits whenever it
	// fires, visual or not, because the client cannot see another player's
	// cast any other way (cast_skill_id is own-player-only).
	caster := newFakePlayer()
	cd := &skills.SkillDefinition{
		ID: 45, Name: "TestHeal", Category: skills.SkillCategoryCooldown, MaxLevel: 1,
		CooldownTicks: 100,
		Effects: []skills.EffectDef{{
			Type:     skills.EffectTypeSelfHeal,
			SelfHeal: &skills.SelfHealParams{HealHP: 10},
		}},
	}
	caster.vitalSigns.Health = 50
	caster.sc.EquipCooldown(0, cd, 1)

	// Through fireAndCharge, the player consumption site: that is where the
	// stamp lives, not inside fireCooldown (see noteCooldownCast).
	testSkillSystem().fireAndCharge(caster, caster.sc.CooldownSlots[0])

	assert.Equal(t, []skills.SkillID{45}, firedIDs(caster.SkillEvents()))
}

// The self-heal cooldown used to write Health directly and stamp its own
// number by hand; §12a.2/6 routes it through Healable.Heal, so it is an
// ordinary attributed heal like every other.
func TestFired_SelfHealRoutesThroughTheHealFunnel(t *testing.T) {
	caster := newFakePlayer()
	caster.vitalSigns.Health = 50
	cd := &skills.SkillDefinition{
		ID: 45, Name: "TestHeal", Category: skills.SkillCategoryCooldown, MaxLevel: 1,
		Effects: []skills.EffectDef{{
			Type:     skills.EffectTypeSelfHeal,
			SelfHeal: &skills.SelfHealParams{HealHP: 10},
		}},
	}
	caster.sc.EquipCooldown(0, cd, 1)

	testSkillSystem().fireCooldown(caster, caster.sc.CooldownSlots[0])

	assert.Equal(t, vitals.VitalSign(60), caster.vitalSigns.Health, "the pool still moves")
	assert.Equal(t, vitals.VitalSign(10), caster.healReceived,
		"and it arrives through Heal, not a hand-written accumulator")
}

// --- FIRED is emitted when the cast is CONSUMED (PO, 2026-09-19) ---
//
// §5.1's rule is "a cast that went off, targets or not"; §12a.4's shorthand
// ("fireCooldown returning true") was the mistake, and it silenced exactly the
// case the PO named: axes spinning with nobody in range. The honest line is
// CONSUMPTION, and the two entity kinds consume differently on purpose.
//
//   - A PLAYER pays and consumes hit or whiff (fireAndCharge, D8: a cooldown
//     is a committed act), so a whiff is a cast and emits.
//   - A MOB only consumes when the burst actually hit, keeping the skill ready
//     until something wanders into range. A mob whiff was never a cast at all,
//     so there is nothing to draw.

// instantDamageCooldown is a no-cast-time burst with a small reach; whether it
// finds anything is decided by what the caller puts in the space.
func instantDamageCooldown(id skills.SkillID) *skills.SkillDefinition {
	return &skills.SkillDefinition{
		ID: id, Name: "TestBurst", Category: skills.SkillCategoryCooldown, MaxLevel: 1,
		CooldownTicks: 100,
		Effects: []skills.EffectDef{{
			Type: skills.EffectTypeInstantDamage, TargetsEnemies: true, Radius: 1.0,
			Damage: &skills.DamageParams{HP: 5},
		}},
	}
}

func TestFired_PlayerWhiffedCooldownStillEmits(t *testing.T) {
	// Nothing in the space: the burst finds no bodies at all.
	caster := newFakePlayer()
	caster.sc.EquipCooldown(0, instantDamageCooldown(98), 1)
	caster.sc.RequestCooldownActivation(0)
	s := testSkillSystem()

	s.processEntity(caster)

	require.NotZero(t, caster.sc.SlotCooldownRemaining(0),
		"precondition: the whiff consumed the cooldown, so it WAS a cast")
	assert.Equal(t, []skills.SkillID{98}, firedIDs(caster.SkillEvents()),
		"spinning axes with nobody in range are still spinning axes")
}

func TestFired_PlayerCooldownEmitsExactlyOncePerCast(t *testing.T) {
	// The hitting case must not emit twice now that the stamp moved to the
	// consumption site.
	target := &touchRecorder{}
	caster := newFakePlayer()
	space := phy.NewSpace()
	caster.aura = phy.NewCircle(phy.VEC2F_ZERO, 1.0)
	caster.aura.Shape().IsSensor = true
	caster.aura.Shape().Layer = int(model.LayerNoneCollision)
	body := phy.NewCircle(phy.VEC2F_ZERO, 0.25)
	body.Shape().IsSensor = true
	body.Shape().Layer = int(model.LayerActionCollision)
	body.Shape().UserData = target
	space.AddShape(caster.aura)
	space.AddShape(body)
	space.Update()
	caster.sc.EquipCooldown(0, instantDamageCooldown(98), 1)
	caster.sc.RequestCooldownActivation(0)
	s := NewSkillSystem(space, nil)
	s.rng = testRNG()

	s.processEntity(caster)

	require.NotEmpty(t, target.touches, "precondition: the burst landed")
	assert.Equal(t, []skills.SkillID{98}, firedIDs(caster.SkillEvents()))
}

func TestFired_MobWhiffedCooldownEmitsNothing(t *testing.T) {
	// A mob keeps a whiffed burst READY (no StartCooldown), so nothing was
	// cast and nothing may be drawn. Without this the negative half of the
	// consumption rule would be free to drift.
	caster := newFakeMob()
	caster.sc.EquipCooldown(0, instantDamageCooldown(97), 1)
	s := testSkillSystem()

	s.processEntity(caster)

	require.Zero(t, caster.sc.SlotCooldownRemaining(0),
		"precondition: the mob kept it ready, so there was no cast")
	assert.Empty(t, firedIDs(caster.SkillEvents()))
}

func TestFired_MobCooldownThatHitsEmitsOnce(t *testing.T) {
	// The control for the pin above: the same mob, with something in reach.
	target := &touchRecorder{}
	caster := newFakeMob()
	caster.statusEffects = model.NewStatusEffects()
	space := phy.NewSpace()
	caster.aura = phy.NewCircle(phy.VEC2F_ZERO, 1.0)
	caster.aura.Shape().IsSensor = true
	caster.aura.Shape().Layer = int(model.LayerNoneCollision)
	body := phy.NewCircle(phy.VEC2F_ZERO, 0.25)
	body.Shape().IsSensor = true
	body.Shape().Layer = int(model.LayerActionCollision)
	body.Shape().UserData = target
	space.AddShape(caster.aura)
	space.AddShape(body)
	space.Update()
	caster.sc.EquipCooldown(0, instantDamageCooldown(97), 1)
	s := NewSkillSystem(space, nil)
	s.rng = testRNG()

	s.processEntity(caster)

	require.NotZero(t, caster.sc.SlotCooldownRemaining(0), "precondition: it fired and consumed")
	assert.Equal(t, []skills.SkillID{97}, firedIDs(caster.SkillEvents()))
}
