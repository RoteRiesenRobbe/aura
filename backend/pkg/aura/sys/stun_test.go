package sys

// Cast suppression (docs/archive/plan-cc-and-retaliation.md C3, D6 + A6 + L2) — the one
// mechanism in this plan built from nothing.
//
// ⚑ Why it has to exist at all: a 100 % slow is a ROOT, not a stun. Movement
// runs off Buffs.MovementFactor and aura cadence off TickAccumulator +
// TickRateFactor, on completely independent paths — so a fully-slowed mob
// stands perfectly still and keeps swinging. The gate below is what turns that
// root into a stun.
//
// ⚑ Its POSITION in processEntity is the whole design, and each boundary is a
// decision rather than a detail. It sits after tickBuffEvents (L2) and before
// processCooldowns, notePresence and TickAccumulator++ (A6).

import (
	"testing"

	"github.com/EngoEngine/ecs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const sysStunSource = skills.SkillID(210)

// stunnableCaster is a caster that can answer the gate. The gate asks a
// CAPABILITY, not an entity kind — real players carry no stun door
// (plan-skill-vocab §3.1 leaves the get-CC'd direction inert), so wrapping the
// double here rather than teaching fakePlayer to be stunnable keeps that
// asymmetry honest.
type stunnableCaster struct{ *fakePlayer }

func (c *stunnableCaster) Stunned() bool { return c.buffs.Stunned() }

// stunnedDotVictim is the same wrapper for the dot target, and it exists for a
// reason worth stating: a fixture that cannot answer the gate makes an
// absence-of-suppression pin pass no matter where the gate is put.
type stunnedDotVictim struct{ *dotVictim }

func (v *stunnedDotVictim) Stunned() bool { return v.buffs.Stunned() }

func stunnedAuraCaster(t *testing.T) (*stunnableCaster, *touchRecorder) {
	t.Helper()
	caster, target := activeAuraPlayer(t, skills.EffectDef{
		Type: skills.EffectTypeDamageAura, TargetsEnemies: true, Radius: 1.0, TickInterval: 1,
		Damage: &skills.DamageParams{HP: 10},
	})
	return &stunnableCaster{caster}, target
}

func TestStun_SuppressesTheActiveAura(t *testing.T) {
	caster, target := stunnedAuraCaster(t)

	// Control first: un-stunned, the aura lands. Without this the test would
	// pass just as happily against a broken fixture that never hits at all.
	testSkillSystem().processEntity(caster)
	require.Len(t, target.touches, 1, "precondition: the aura works")

	caster.buffs.ApplyStun(sysStunSource, 90)
	testSkillSystem().processEntity(caster)

	assert.Len(t, target.touches, 1, "a stunned caster's aura does not fire")
}

// A6: the accumulator freezes, so the aura resumes MID-CADENCE on exactly the
// beat it was interrupted rather than having silently advanced through the stun
// and firing the instant it ends. This matches how SetActiveAura already treats
// the accumulator as cadence state rather than as a clock.
func TestStun_FreezesTheTickAccumulator(t *testing.T) {
	caster, _ := stunnedAuraCaster(t)
	s := testSkillSystem()

	s.processEntity(caster)
	before := caster.sc.AuraSlots[0].TickAccumulator
	require.NotZero(t, before, "precondition: it advances when not stunned")

	caster.buffs.ApplyStun(sysStunSource, 90)
	for i := 0; i < 5; i++ {
		s.processEntity(caster)
	}

	assert.Equal(t, before, caster.sc.AuraSlots[0].TickAccumulator,
		"five stunned ticks must not advance the cadence")
}

// A6, the other half: cooldowns do not fire, and because processCooldowns is
// where TickCooldowns lives, their TIMERS stop advancing too — a stunned entity
// comes out with its cooldowns exactly where they were. That is the intended
// reading (a stun costs you time), stated here so nobody "fixes" it later.
func TestStun_FreezesCooldownRecovery(t *testing.T) {
	caster, _ := stunnedAuraCaster(t)
	cd := &skills.SkillDefinition{
		ID: 98, Name: "TestBurst", Category: skills.SkillCategoryCooldown, MaxLevel: 1,
		CooldownTicks: 100,
		Effects: []skills.EffectDef{{
			Type: skills.EffectTypeInstantDamage, TargetsEnemies: true, Radius: 1.0,
			Damage: &skills.DamageParams{HP: 5},
		}},
	}
	caster.sc.EquipCooldown(0, cd, 1)
	caster.sc.RequestCooldownActivation(0)

	s := testSkillSystem()
	s.processEntity(caster)
	fired := caster.sc.SlotCooldownRemaining(0)
	require.NotZero(t, fired, "precondition: the cooldown fired and is now recovering")

	caster.buffs.ApplyStun(sysStunSource, 90)
	for i := 0; i < 10; i++ {
		s.processEntity(caster)
	}

	assert.Equal(t, fired, caster.sc.SlotCooldownRemaining(0),
		"ten stunned ticks buy back none of the cooldown")
}

// stunRecorder is a stunnable target that records what landed on it.
type stunRecorder struct {
	basic   ecs.BasicEntity
	faction model.Faction
	ticks   []int
}

func (r *stunRecorder) Basic() ecs.BasicEntity { return r.basic }
func (r *stunRecorder) Faction() model.Faction { return r.faction }
func (r *stunRecorder) ApplyStun(source skills.SkillID, ticks int) {
	r.ticks = append(r.ticks, ticks)
}

// friendlyStunTarget is a stunnable mob on a friendly-to-players faction — the
// Human Army shape.
type friendlyStunTarget struct{ stunRecorder }

func (t *friendlyStunTarget) FriendlyToPlayers() bool { return true }

var _ model.PlayerFriendly = (*friendlyStunTarget)(nil)

// ⚑ A DELIBERATE DIVERGENCE FROM A RECORDED RULE, pinned here rather than left
// implicit. backlog §40 item 1 states that an enemy-targeted control effect
// "MUST join factionScopedEffects so the allowlist is mandatory" (L-O, today
// calm + charm only). Paralyze does NOT: for calm and charm the allowlist
// answers a CONTENT question — which wildlife you may pacify or tame — while
// for a stun the mob-side factors.ccImmune gate (C1) already answers "which
// mobs", and there is no content reason to restrict which hostile factions can
// be held.
//
// What the rule was protecting is the SAFETY half, and that holds without it:
// mayHarm refuses a player-aligned caster against any FriendlyToPlayers target,
// before the allowlist is even consulted. This test is that claim, so the
// divergence cannot rot into a bug where a player stuns a quest giver.
func TestStun_CannotReachAFriendlyNPC(t *testing.T) {
	// ⚑ The HOSTILE control is not optional here, and the first draft of this
	// test proved why: without it, the assertion passed against an EMPTY query
	// space (testSkillSystem() builds its own space, which the target fixture
	// never joins) — green because nothing was reachable at all, not because
	// the friendly target was refused. Mutating mayHarm to permit the harm did
	// not redden it. The control is what makes the refusal mean something.
	effect := skills.EffectDef{
		Type: skills.EffectTypeStun, TargetsEnemies: true, TargetsAllies: false,
		Radius: 2.5, MaxTargets: 1, Stun: &skills.StunParams{DurationTicks: 90},
	}

	place := func(space *phy.Space, at phy.Vec2f, userData any) {
		c := phy.NewCircle(at, 0.25)
		c.Shape().IsSensor = true
		c.Shape().Layer = int(model.LayerActionCollision)
		c.Shape().UserData = userData
		space.AddShape(c)
	}

	space := phy.NewSpace()
	army := &friendlyStunTarget{stunRecorder{basic: ecs.NewBasic(), faction: model.Faction(2)}}
	hostile := &stunRecorder{basic: ecs.NewBasic(), faction: model.FactionHostile}
	place(space, phy.VEC2F_ZERO, army)
	place(space, phy.Vec2f{X: 0.5, Y: 0}, hostile)
	space.Update()

	caster := newFakePlayer()
	caster.aura = phy.NewCircle(phy.VEC2F_ZERO, 1.0)
	s := NewSkillSystem(space, nil)
	s.rng = testRNG()

	// maxTargets 1 + nearest: the friendly is the CLOSER of the two, so if it
	// were eligible it would be the one picked — and the hostile would then go
	// untouched. One cast separates both claims.
	require.True(t, s.applyStun(caster, 4, 1, effect), "the cast found something to hold")

	assert.Empty(t, army.ticks, "a friendly NPC is never a valid stun target, allowlist or no allowlist")
	assert.Equal(t, []int{90}, hostile.ticks, "…and the hostile behind it is what the cast took instead")
}

// L2, and the one boundary that is non-negotiable: dots and hots ALREADY on a
// stunned entity keep ticking. Placed above tickBuffEvents instead, a stun
// would PROTECT its target from damage in flight — which inverts the mechanic
// and would make stunning a mob an act of mercy.
func TestStun_DoesNotProtectItsTargetFromDotsInFlight(t *testing.T) {
	caster, _ := stunnedAuraCaster(t)
	caster.buffs.ApplyStun(sysStunSource, 90)

	// ⚑ The victim has to be able to ANSWER the gate, or this pin passes for the
	// wrong reason — a plain dotVictim carries no Stunned(), so the assertion
	// inside processEntity never sees it and a gate moved above tickBuffEvents
	// would stay green. Verified by mutation: without this wrapper it does.
	victim := &stunnedDotVictim{newDotVictim()}
	victim.buffs.ApplyDot(sysStunSource, skills.DotBuff{
		HP: 7, Interval: 1, Caster: &fakeMobCaster{},
	}, 100)
	victim.buffs.ApplyStun(sysStunSource, 90)
	require.True(t, victim.Stunned(), "precondition: the victim reads as held")

	testSkillSystem().tickBuffEvents(victim)

	assert.NotEmpty(t, victim.mobHits,
		"a stun holds what the target DOES; it never shields it from what is already burning")
}
