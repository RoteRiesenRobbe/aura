package skills

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// --- resist payload (semantics inherited 1:1 from the retired ResistBuffs,
// item 11 Phase 2 Step 3; ported with effect foundations Step 2) ---

func TestBuffs_ApplyResistAndMultiplier(t *testing.T) {
	var b Buffs
	b.ApplyResist(40, []string{"fire"}, 0.5, 2)

	assert.InDelta(t, 0.5, b.ResistMultiplier([]string{"fire"}), 1e-6)
	assert.InDelta(t, 1.0, b.ResistMultiplier([]string{"frost"}), 1e-6, "uncovered tag is unresisted")
	assert.InDelta(t, 1.0, b.ResistMultiplier(nil), 1e-6)
}

func TestBuffs_ResistSameSkillStrongestWins(t *testing.T) {
	// The same skill from two casters does not stack — the strongest
	// currently-active application wins.
	var b Buffs
	b.ApplyResist(40, []string{"fire"}, 0.8, 2)
	b.ApplyResist(40, []string{"fire"}, 0.5, 2)
	assert.InDelta(t, 0.5, b.ResistMultiplier([]string{"fire"}), 1e-6)

	// A weaker application neither overwrites a stronger one...
	b.ApplyResist(40, []string{"fire"}, 0.9, 3)
	assert.InDelta(t, 0.5, b.ResistMultiplier([]string{"fire"}), 1e-6)
	// ...nor keeps it alive: each strength ages independently, so once the
	// stronger applications lapse, the weaker-but-active one takes over.
	b.Tick()
	b.Tick()
	assert.InDelta(t, 0.9, b.ResistMultiplier([]string{"fire"}), 1e-6,
		"0.8/0.5 expired after their 2 ticks; the 3-tick 0.9 application remains")
}

func TestBuffs_ResistStrongerApplicationFadesBackToWeaker(t *testing.T) {
	// Regression (found in-game, item 11 Phase 2): two wards of the same skill
	// at different levels, both re-applied every tick. When the stronger one
	// switches off, its factor must fade on ITS lifetime — the weaker ward's
	// per-tick refresh must not keep the stronger factor alive.
	var b Buffs

	// Both auras re-apply for a few ticks (tick interval 1 → lifetime 2).
	for i := 0; i < 3; i++ {
		b.Tick()
		b.ApplyResist(40, []string{"fire"}, 0.6, 2) // L1 ward
		b.ApplyResist(40, []string{"fire"}, 0.4, 2) // L3 ward
	}
	assert.InDelta(t, 0.4, b.ResistMultiplier([]string{"fire"}), 1e-6, "strongest active wins while both run")

	// The L3 ward switches off; only the L1 ward keeps re-applying.
	for i := 0; i < 2; i++ {
		b.Tick()
		b.ApplyResist(40, []string{"fire"}, 0.6, 2)
	}
	assert.InDelta(t, 0.6, b.ResistMultiplier([]string{"fire"}), 1e-6,
		"the stronger application expired after its own lifetime")
}

func TestBuffs_ResistDifferentSkillsStack(t *testing.T) {
	// Distinct source skills stack multiplicatively.
	var b Buffs
	b.ApplyResist(40, []string{"fire"}, 0.5, 2)
	b.ApplyResist(41, []string{"fire"}, 0.5, 2)
	assert.InDelta(t, 0.25, b.ResistMultiplier([]string{"fire"}), 1e-6)
}

func TestBuffs_ResistMultipleMatchingTagsMultiply(t *testing.T) {
	// One buff covering several of the hit's tags counts once per matching tag
	// (same semantics as a base-resistance map).
	var b Buffs
	b.ApplyResist(40, []string{"fire", "boss_x_lava"}, 0.5, 2)
	assert.InDelta(t, 0.25, b.ResistMultiplier([]string{"fire", "boss_x_lava"}), 1e-6)
}

func TestBuffs_ResistTickExpiry(t *testing.T) {
	var b Buffs
	b.ApplyResist(40, []string{"fire"}, 0.5, 2)

	b.Tick()
	assert.InDelta(t, 0.5, b.ResistMultiplier([]string{"fire"}), 1e-6,
		"survives one tick boundary — a hazard tick before re-application is still resisted")

	b.Tick()
	assert.InDelta(t, 1.0, b.ResistMultiplier([]string{"fire"}), 1e-6, "expired without re-application")
}

// --- slow payload (migrated from the hand-rolled mob slowFraction/slowTicks,
// effect foundations Step 2) ---

func TestBuffs_SlowStrongestWins(t *testing.T) {
	// Slows never stack — the strongest active fraction wins, across streams
	// AND across skills (unchanged from the pre-store global-strongest rule).
	var b Buffs
	assert.InDelta(t, 0.0, b.SlowFraction(), 1e-6, "no slow active")

	b.ApplySlow(4, 0.3, 2)
	b.ApplySlow(4, 0.5, 2)
	b.ApplySlow(99, 0.4, 2)
	assert.InDelta(t, 0.5, b.SlowFraction(), 1e-6)
}

func TestBuffs_SlowExpiresOnItsOwnLifetime(t *testing.T) {
	// Improvement over the hand-rolled form (which let ANY re-application
	// refresh the strongest fraction's lifetime): each strength ages
	// independently, same rule as resist streams.
	var b Buffs
	b.ApplySlow(4, 0.5, 2)

	b.Tick()
	b.ApplySlow(4, 0.3, 2) // weaker refresh must not keep the 0.5 alive
	assert.InDelta(t, 0.5, b.SlowFraction(), 1e-6, "stronger still active across one boundary")

	b.Tick()
	assert.InDelta(t, 0.3, b.SlowFraction(), 1e-6, "0.5 expired on its own lifetime")

	b.Tick()
	b.Tick()
	assert.InDelta(t, 0.0, b.SlowFraction(), 1e-6, "everything expired")
}

// --- dot payload (first NEW payload of the framework: duration independent
// of re-application — keeps ticking after the target leaves the aura) ---

// cycleDot advances one game tick like the real loop: aging at tick start
// (StatusEffectsSystem → ResetTickNumbers → Tick), acting at SkillSystem time
// (DueBuffEvents). Returns the dot hits due this tick.
func cycleDot(b *Buffs) []DotHit {
	b.Tick()
	dots, _ := b.DueBuffEvents()
	return dots
}

// cycleHot is cycleDot's twin for heal-over-time events.
func cycleHot(b *Buffs) []HotEvent {
	b.Tick()
	_, hots := b.DueBuffEvents()
	return hots
}

func TestBuffs_DotFiresPerIntervalForItsTickCount(t *testing.T) {
	var b Buffs
	// 3 damage events, one every 10 game ticks; lifetime 3*10+1 covers the
	// tick boundary like every aura-applied buff.
	b.ApplyDot(5, DotBuff{HP: 4, Tags: []string{"fire"}, Interval: 10}, 31)

	var hits []DotHit
	for i := 0; i < 40; i++ {
		hits = append(hits, cycleDot(&b)...)
	}
	assert.Len(t, hits, 3, "exactly the authored number of dot ticks, then expiry")
	assert.InDelta(t, 4, hits[0].HP, 1e-6)
	assert.Equal(t, []string{"fire"}, hits[0].Tags)
}

func TestBuffs_DotOutlivesReapplication(t *testing.T) {
	// The defining upgrade over the resist convention: refreshing resets the
	// remaining duration, but a dot NOT refreshed keeps ticking until its
	// duration runs out (target left the aura / caster gone).
	var b Buffs
	b.ApplyDot(5, DotBuff{HP: 4, Interval: 10}, 31)

	// 5 ticks in range: re-application each tick keeps the duration full…
	var hits []DotHit
	for i := 0; i < 5; i++ {
		hits = append(hits, cycleDot(&b)...)
		b.ApplyDot(5, DotBuff{HP: 4, Interval: 10}, 31)
	}
	// …then the target leaves; the dot still delivers its full 3 events.
	for i := 0; i < 40; i++ {
		hits = append(hits, cycleDot(&b)...)
	}
	assert.Len(t, hits, 3, "full dot ran after leaving the aura")
}

func TestBuffs_DotRefreshKeepsAccumulatorRunning(t *testing.T) {
	// Re-application within the dot's interval must not reset the acting
	// accumulator — otherwise an aura refreshing every tick would starve a
	// slower dot forever.
	var b Buffs
	b.ApplyDot(5, DotBuff{HP: 4, Interval: 10}, 31)

	var hits []DotHit
	for i := 0; i < 10; i++ {
		hits = append(hits, cycleDot(&b)...)
		b.ApplyDot(5, DotBuff{HP: 4, Interval: 10}, 31)
	}
	assert.Len(t, hits, 1, "first event fires one full interval after application despite per-tick refreshes")
}

func TestBuffs_DotSameSkillStrongestActs(t *testing.T) {
	// Same skill never stacks with itself: two strengths (levels/casters) are
	// separate streams, only the strongest active one deals damage; when it
	// expires the weaker one takes over on its own cadence.
	var b Buffs
	b.ApplyDot(5, DotBuff{HP: 8, Interval: 10}, 11) // stronger, 1 event left
	b.ApplyDot(5, DotBuff{HP: 4, Interval: 10}, 31) // weaker, full duration

	var hits []DotHit
	for i := 0; i < 40; i++ {
		hits = append(hits, cycleDot(&b)...)
	}
	assert.Len(t, hits, 3)
	assert.InDelta(t, 8, hits[0].HP, 1e-6, "strongest active stream acts first")
	assert.InDelta(t, 4, hits[1].HP, 1e-6, "weaker stream takes over after the stronger expired")
	assert.InDelta(t, 4, hits[2].HP, 1e-6)
}

func TestBuffs_DotDistinctSkillsBothAct(t *testing.T) {
	var b Buffs
	b.ApplyDot(5, DotBuff{HP: 4, Interval: 10}, 11)
	b.ApplyDot(22, DotBuff{HP: 6, Interval: 10}, 11)

	var hits []DotHit
	for i := 0; i < 15; i++ {
		hits = append(hits, cycleDot(&b)...)
	}
	assert.Len(t, hits, 2, "distinct source skills are distinct dots")
}

func TestBuffs_DotCarriesCasterThroughRefresh(t *testing.T) {
	// The caster reference rides the payload for attribution (XP
	// participation, kill credit); a refresh hands the stream to the latest
	// caster of that strength.
	var b Buffs
	b.ApplyDot(5, DotBuff{HP: 4, Interval: 1, Caster: "alice"}, 2)
	b.ApplyDot(5, DotBuff{HP: 4, Interval: 1, Caster: "bob"}, 2)

	hits := cycleDot(&b)
	assert.Len(t, hits, 1)
	assert.Equal(t, "bob", hits[0].Caster)
}

// --- hot payload (heal-over-time, the dot twin — plan-skill-vocab §3.7) ---

func TestBuffs_HotFiresPerIntervalForItsTickCount(t *testing.T) {
	var b Buffs
	// 3 heal events, one every 10 game ticks; lifetime 3*10+1 covers the tick
	// boundary like every aura-applied buff.
	b.ApplyHot(5, HotBuff{HP: 4, Interval: 10}, 31)

	var events []HotEvent
	for i := 0; i < 40; i++ {
		events = append(events, cycleHot(&b)...)
	}
	assert.Len(t, events, 3, "exactly the authored number of hot ticks, then expiry")
	assert.InDelta(t, 4, events[0].HP, 1e-6)
}

func TestBuffs_HotOutlivesReapplication(t *testing.T) {
	// Case 1 (HoT when leaving an aura): a hot_aura re-applies every tick while
	// in range, but once the target leaves, the un-refreshed hot keeps ticking
	// down its remaining duration.
	var b Buffs
	b.ApplyHot(5, HotBuff{HP: 4, Interval: 10}, 31)

	var events []HotEvent
	for i := 0; i < 5; i++ {
		events = append(events, cycleHot(&b)...)
		b.ApplyHot(5, HotBuff{HP: 4, Interval: 10}, 31) // still in range
	}
	for i := 0; i < 40; i++ { // left the aura
		events = append(events, cycleHot(&b)...)
	}
	assert.Len(t, events, 3, "full hot ran after leaving the aura")
}

func TestBuffs_HotRefreshKeepsAccumulatorRunning(t *testing.T) {
	// Re-application within the hot's interval must not reset the acting
	// accumulator — otherwise an aura refreshing every tick would starve a
	// slower heal cadence forever (the dot invariant, mirrored).
	var b Buffs
	b.ApplyHot(5, HotBuff{HP: 4, Interval: 10}, 31)

	var events []HotEvent
	for i := 0; i < 10; i++ {
		events = append(events, cycleHot(&b)...)
		b.ApplyHot(5, HotBuff{HP: 4, Interval: 10}, 31)
	}
	assert.Len(t, events, 1, "first event fires one full interval after application despite per-tick refreshes")
}

func TestBuffs_HotSameSkillStrongestActs(t *testing.T) {
	// Same skill never stacks with itself: only the strongest active hot heals;
	// when it expires the weaker one takes over on its own cadence.
	var b Buffs
	b.ApplyHot(5, HotBuff{HP: 8, Interval: 10}, 11) // stronger, 1 event left
	b.ApplyHot(5, HotBuff{HP: 4, Interval: 10}, 31) // weaker, full duration

	var events []HotEvent
	for i := 0; i < 40; i++ {
		events = append(events, cycleHot(&b)...)
	}
	assert.Len(t, events, 3)
	assert.InDelta(t, 8, events[0].HP, 1e-6, "strongest active stream heals first")
	assert.InDelta(t, 4, events[1].HP, 1e-6, "weaker stream takes over after the stronger expired")
}

func TestBuffs_HotDistinctSkillsBothAct(t *testing.T) {
	var b Buffs
	b.ApplyHot(5, HotBuff{HP: 4, Interval: 10}, 11)
	b.ApplyHot(22, HotBuff{HP: 6, Interval: 10}, 11)

	var events []HotEvent
	for i := 0; i < 15; i++ {
		events = append(events, cycleHot(&b)...)
	}
	assert.Len(t, events, 2, "distinct source skills are distinct hots")
}

func TestBuffs_HotCarriesCasterThroughRefresh(t *testing.T) {
	// The caster reference rides the payload for attribution (healer threat,
	// participation); a refresh hands the stream to the latest caster.
	var b Buffs
	b.ApplyHot(5, HotBuff{HP: 4, Interval: 1, Caster: "alice"}, 2)
	b.ApplyHot(5, HotBuff{HP: 4, Interval: 1, Caster: "bob"}, 2)

	events := cycleHot(&b)
	assert.Len(t, events, 1)
	assert.Equal(t, "bob", events[0].Caster)
}

func TestBuffs_DotAndHotDrainTogether(t *testing.T) {
	// One drain returns both a due dot and a due hot (the single tick-order
	// story, §3.7): distinct source skills, same interval.
	var b Buffs
	b.ApplyDot(5, DotBuff{HP: 4, Interval: 1}, 3)
	b.ApplyHot(6, HotBuff{HP: 7, Interval: 1}, 3)

	b.Tick()
	dots, hots := b.DueBuffEvents()
	assert.Len(t, dots, 1)
	assert.Len(t, hots, 1)
	assert.InDelta(t, 4, dots[0].HP, 1e-6)
	assert.InDelta(t, 7, hots[0].HP, 1e-6)
}

// --- shield payload (absorb pool, plan-skill-vocab chunk 2 §3.2) ---

func TestBuffs_ShieldApplyAndTotal(t *testing.T) {
	var b Buffs
	assert.InDelta(t, 0.0, b.ShieldTotal(), 1e-6, "no shield active")

	b.ApplyShield(27, 20, 300)
	assert.InDelta(t, 20, b.ShieldTotal(), 1e-6)
}

func TestBuffs_ShieldDistinctSkillsStackAdditively(t *testing.T) {
	// Distinct source skills are distinct pools; the total absorb is their sum.
	var b Buffs
	b.ApplyShield(27, 20, 300)
	b.ApplyShield(28, 15, 300)
	assert.InDelta(t, 35, b.ShieldTotal(), 1e-6)
}

func TestBuffs_ShieldPartialAbsorbSpills(t *testing.T) {
	var b Buffs
	b.ApplyShield(27, 20, 300)

	absorbed := b.AbsorbShield(8)
	assert.InDelta(t, 8, absorbed, 1e-6, "fully covered hit is fully absorbed")
	assert.InDelta(t, 12, b.ShieldTotal(), 1e-6)

	absorbed = b.AbsorbShield(30)
	assert.InDelta(t, 12, absorbed, 1e-6, "only the remaining pool absorbs; the rest spills to HP")
	assert.InDelta(t, 0.0, b.ShieldTotal(), 1e-6, "depleted pool is gone")
}

func TestBuffs_ShieldExpiringSoonestDrainsFirst(t *testing.T) {
	// Use it before you lose it: damage drains the pool closest to expiry
	// first, across sources.
	var b Buffs
	b.ApplyShield(27, 20, 300) // expires late
	b.ApplyShield(28, 10, 50)  // expires soon

	b.AbsorbShield(6)
	assert.InDelta(t, 24, b.ShieldTotal(), 1e-6)

	// The soon-expiring pool took the drain: after it lapses, the long pool
	// must still be untouched.
	for i := 0; i < 50; i++ {
		b.Tick()
	}
	assert.InDelta(t, 20, b.ShieldTotal(), 1e-6,
		"the 50-tick pool absorbed the hit and expired; the 300-tick pool is full")
}

func TestBuffs_ShieldTopUpRefresh(t *testing.T) {
	// Same-skill re-application at identical strength refreshes the lifetime
	// and tops the pool back up to the authored amount — never past it.
	var b Buffs
	b.ApplyShield(27, 20, 3)
	b.AbsorbShield(15)
	assert.InDelta(t, 5, b.ShieldTotal(), 1e-6)

	b.ApplyShield(27, 20, 3)
	assert.InDelta(t, 20, b.ShieldTotal(), 1e-6, "topped back up to authored, not 25")

	// The refresh also renewed the lifetime.
	b.Tick()
	b.Tick()
	assert.InDelta(t, 20, b.ShieldTotal(), 1e-6, "refreshed stream survives its original lifetime")
}

func TestBuffs_ShieldDifferentStrengthIsSeparateStream(t *testing.T) {
	// A different authored amount (level/caster) opens its own stream instead
	// of topping up the existing one — store convention.
	var b Buffs
	b.ApplyShield(27, 20, 300)
	b.ApplyShield(27, 30, 300)
	assert.InDelta(t, 50, b.ShieldTotal(), 1e-6)
}

func TestBuffs_ShieldExpiryMidPool(t *testing.T) {
	// An un-refreshed pool expires with absorb capacity left.
	var b Buffs
	b.ApplyShield(27, 20, 2)

	b.Tick()
	assert.InDelta(t, 20, b.ShieldTotal(), 1e-6, "survives one tick boundary")

	b.Tick()
	assert.InDelta(t, 0.0, b.ShieldTotal(), 1e-6, "expired without re-application")
	assert.InDelta(t, 0.0, b.AbsorbShield(10), 1e-6, "expired pool absorbs nothing")
}

// --- shared lifecycle ---

func TestBuffs_CleanseRemovesEverything(t *testing.T) {
	// F10: everything is cleansable; cleanse = drop all entries, no dispel
	// classes in v1.
	var b Buffs
	b.ApplyResist(40, []string{"fire"}, 0.5, 100)
	b.ApplySlow(4, 0.5, 100)
	b.ApplyDot(5, DotBuff{HP: 4, Interval: 1}, 100)
	b.ApplyShield(27, 20, 100)
	b.ApplyTickRate(50, 0.5, 100)

	b.Cleanse()

	assert.InDelta(t, 1.0, b.ResistMultiplier([]string{"fire"}), 1e-6)
	assert.InDelta(t, 0.0, b.SlowFraction(), 1e-6)
	assert.InDelta(t, 0.0, b.ShieldTotal(), 1e-6)
	assert.InDelta(t, 1.0, b.TickRateFactor(), 1e-6)
	assert.Empty(t, cycleDot(&b))
}

// --- tick_rate payload (skill-vocab chunk 6): a scalar factor on the caster's
// own aura cadence. factor < 1 = haste, > 1 = tick-slow. Combination rule =
// multiplicative across skills (the Resist model, minus tags), clamped by the
// >= 1-tick floor at the interval site. Default (no buff) = 1.0. ---

func TestBuffs_TickRateDefaultIsUnity(t *testing.T) {
	var b Buffs
	assert.InDelta(t, 1.0, b.TickRateFactor(), 1e-6, "no tick_rate buff = no change")
}

func TestBuffs_TickRateSingleFactor(t *testing.T) {
	var b Buffs
	b.ApplyTickRate(50, 0.5, 2)
	assert.InDelta(t, 0.5, b.TickRateFactor(), 1e-6)
}

func TestBuffs_TickRateDifferentSkillsMultiply(t *testing.T) {
	// Distinct source skills compose multiplicatively: two hastes stack.
	var b Buffs
	b.ApplyTickRate(50, 0.5, 2)
	b.ApplyTickRate(51, 0.5, 2)
	assert.InDelta(t, 0.25, b.TickRateFactor(), 1e-6)
}

func TestBuffs_TickRateHasteAndSlowCancel(t *testing.T) {
	// A haste (0.5) and a tick-slow (2.0) from distinct skills net out — the
	// whole point of the multiplicative rule over strongest-wins.
	var b Buffs
	b.ApplyTickRate(50, 0.5, 2)
	b.ApplyTickRate(51, 2.0, 2)
	assert.InDelta(t, 1.0, b.TickRateFactor(), 1e-6)
}

func TestBuffs_TickRateSameSkillStrongestWins(t *testing.T) {
	// The same skill does not stack with itself — the most extreme active
	// factor (furthest from unity) applies, mirroring resist's per-skill rule.
	var b Buffs
	b.ApplyTickRate(50, 0.8, 2)
	b.ApplyTickRate(50, 0.5, 2)
	assert.InDelta(t, 0.5, b.TickRateFactor(), 1e-6, "0.5 is further from unity than 0.8")

	// A weaker (closer-to-unity) application neither overwrites the stronger
	// one nor keeps it alive past its own lifetime.
	b.ApplyTickRate(50, 0.9, 3)
	assert.InDelta(t, 0.5, b.TickRateFactor(), 1e-6)
	b.Tick()
	b.Tick()
	assert.InDelta(t, 0.9, b.TickRateFactor(), 1e-6, "0.8/0.5 expired; the 3-tick 0.9 remains")
}

func TestBuffs_TickRateExpiry(t *testing.T) {
	var b Buffs
	b.ApplyTickRate(50, 0.5, 2)

	b.Tick()
	assert.InDelta(t, 0.5, b.TickRateFactor(), 1e-6, "survives one tick boundary")

	b.Tick()
	assert.InDelta(t, 1.0, b.TickRateFactor(), 1e-6, "expired without re-application")
}

func TestBuffs_TickRateSameFactorRefreshes(t *testing.T) {
	// An identical factor refreshes the one stream's lifetime (keyed by factor,
	// like the other payloads) rather than opening a second stream.
	var b Buffs
	b.ApplyTickRate(50, 0.5, 2)
	b.Tick()
	b.ApplyTickRate(50, 0.5, 2) // refresh
	assert.InDelta(t, 0.5, b.TickRateFactor(), 1e-6)
	b.Tick()
	assert.InDelta(t, 0.5, b.TickRateFactor(), 1e-6, "refreshed stream still alive")
}

// --- EffectiveTickInterval: the single source of truth for an effect's fired
// cadence — level scaling composed with a tick_rate factor, floored at 1. ---

func TestEffectiveTickInterval_LevelScalingUnaffectedFactor(t *testing.T) {
	e := EffectDef{TickInterval: 10, TickIntervalPerLevel: -2}
	assert.Equal(t, 10, EffectiveTickInterval(e, 1, 1.0))
	assert.Equal(t, 8, EffectiveTickInterval(e, 2, 1.0), "level 2: 10 + 1*-2")
}

func TestEffectiveTickInterval_FactorScales(t *testing.T) {
	e := EffectDef{TickInterval: 10}
	assert.Equal(t, 5, EffectiveTickInterval(e, 1, 0.5), "haste halves the interval")
	assert.Equal(t, 20, EffectiveTickInterval(e, 1, 2.0), "tick-slow doubles it")
}

func TestEffectiveTickInterval_FlooredAtOne(t *testing.T) {
	e := EffectDef{TickInterval: 3}
	assert.Equal(t, 1, EffectiveTickInterval(e, 1, 0.01), "extreme haste cannot go below 1 tick")

	// Base-level scaling can also drive it below 1 without any factor.
	fast := EffectDef{TickInterval: 2, TickIntervalPerLevel: -5}
	assert.Equal(t, 1, EffectiveTickInterval(fast, 5, 1.0))
}

func TestHasVisibleTickCadence(t *testing.T) {
	// The five output auras land a visible per-tick event; state + visual
	// effects re-apply silently (often at interval 1) so they get no indicator.
	for _, tt := range []EffectType{EffectTypeDamageAura, EffectTypeHealAura, EffectTypeDotAura, EffectTypeHotAura, EffectTypeShieldAura} {
		assert.True(t, HasVisibleTickCadence(tt), tt)
	}
	for _, tt := range []EffectType{EffectTypeSlowAura, EffectTypeResistAura, EffectTypeLightAura, EffectTypeResistPassive, EffectTypeStatMultiplier} {
		assert.False(t, HasVisibleTickCadence(tt), tt)
	}
}

// TestHasVisibleTickCadence_ShieldAura pins the round-5 fix (playtest feedback
// 2026-07-26): a shield aura draws no tick indicator, so a RallyDrummer's ring
// gave no read on when the next shield lands. shield_aura was simply missing
// from the whitelist and fell to the default.
//
// It belongs with the output auras, not the state effects: the exclusion list
// was justified as "state effects re-apply, often at interval 1, and would just
// strobe", and neither half holds here. RallyDrum and WarbannerShield are both
// authored tickInterval 30 (1 s at 30 TPS) and a shield application is a
// visible event — the absorb pool refills and the pip is already on the bar.
//
// The instants stay out: they are not auras and have no cadence at all.
func TestHasVisibleTickCadence_ShieldAura(t *testing.T) {
	assert.True(t, HasVisibleTickCadence(EffectTypeShieldAura),
		"an authored shield cadence is a visible periodic event and gets an indicator")
	assert.False(t, HasVisibleTickCadence(EffectTypeInstantShield),
		"instants have no cadence to indicate")
}

func TestEffectiveTickInterval_Rounds(t *testing.T) {
	e := EffectDef{TickInterval: 10}
	assert.Equal(t, 3, EffectiveTickInterval(e, 1, 0.33), "3.3 rounds to 3")
	assert.Equal(t, 4, EffectiveTickInterval(e, 1, 0.36), "3.6 rounds to 4")
}

// --- calm (plan-faction-flips chunk 2) ---

func TestBuffs_CalmAgesAndExpires(t *testing.T) {
	var b Buffs
	b.ApplyCalm(1, 3)
	assert.True(t, b.Calmed())
	assert.Equal(t, AppliedEffectCalm, b.AppliedEffects(), "calm carries a pip")

	b.Tick()
	b.Tick()
	assert.True(t, b.Calmed(), "still one tick left")
	b.Tick()
	assert.False(t, b.Calmed(), "expired")
	assert.Equal(t, AppliedEffectNone, b.AppliedEffects(), "and the pip goes out with it")
}

func TestBuffs_CalmRefreshesNeverShortens(t *testing.T) {
	var b Buffs
	b.ApplyCalm(1, 10)
	b.ApplyCalm(1, 3) // a weaker recast must not cut the live calm short
	for i := 0; i < 9; i++ {
		b.Tick()
	}
	assert.True(t, b.Calmed(), "the longer application still stands")

	b.ApplyCalm(1, 5)
	for i := 0; i < 4; i++ {
		b.Tick()
	}
	assert.True(t, b.Calmed(), "a longer recast extends it")
	b.Tick()
	assert.False(t, b.Calmed())
}

func TestBuffs_CalmDoesNotStackAcrossOneSource(t *testing.T) {
	var b Buffs
	b.ApplyCalm(1, 5)
	b.ApplyCalm(1, 5)
	b.ApplyCalm(1, 5)
	for i := 0; i < 5; i++ {
		b.Tick()
	}
	assert.False(t, b.Calmed(), "one stream per source — three casts are not 15 ticks")
}

func TestBuffs_DropCalmLeavesEveryOtherBuffAlone(t *testing.T) {
	// Break-on-damage removes calm and ONLY calm: a slow or dot the same mob is
	// carrying has nothing to do with the calm ending. Cleanse (remove all) was
	// the store's only removal before this and would have taken them too.
	var b Buffs
	b.ApplyCalm(1, 100)
	b.ApplySlow(1, 0.5, 100) // same source skill — the harder case
	b.ApplyResist(2, []string{"fire"}, 0.5, 100)

	b.DropCalm()

	assert.False(t, b.Calmed())
	assert.InDelta(t, 0.5, b.SlowFraction(), 0.0001, "the slow from the same source survives")
	assert.InDelta(t, 0.5, b.ResistMultiplier([]string{"fire"}), 0.0001, "so does another source's resist")
	assert.Zero(t, b.AppliedEffects()&AppliedEffectCalm)
}

func TestBuffs_DropCalmClearsEverySource(t *testing.T) {
	var b Buffs
	b.ApplyCalm(1, 100)
	b.ApplyCalm(2, 100)
	b.DropCalm()
	assert.False(t, b.Calmed(), "damage breaks calm from every source, not just the newest")
}

// --- speed payload (Swift as a cooldown): the movement-speed twin of
// tick_rate, and the other half of the movement axis slow already owns. ---

func TestBuffs_SpeedDefaultIsUnity(t *testing.T) {
	var b Buffs
	assert.InDelta(t, 1.0, b.SpeedFactor(), 1e-6, "no speed buff = no change")
}

func TestBuffs_SpeedSingleFactor(t *testing.T) {
	var b Buffs
	b.ApplySpeed(10, 1.5, 2)
	assert.InDelta(t, 1.5, b.SpeedFactor(), 1e-6)
}

func TestBuffs_SpeedDifferentSkillsMultiply(t *testing.T) {
	// Distinct source skills compose multiplicatively, the tick_rate rule.
	var b Buffs
	b.ApplySpeed(10, 1.5, 2)
	b.ApplySpeed(11, 1.2, 2)
	assert.InDelta(t, 1.8, b.SpeedFactor(), 1e-6)
}

func TestBuffs_SpeedSameSkillStrongestWins(t *testing.T) {
	// The same skill never stacks with itself — the application furthest from
	// unity applies, and a weaker one neither overwrites it nor keeps it alive.
	var b Buffs
	b.ApplySpeed(10, 1.2, 2)
	b.ApplySpeed(10, 1.5, 2)
	assert.InDelta(t, 1.5, b.SpeedFactor(), 1e-6)

	b.ApplySpeed(10, 1.1, 3)
	assert.InDelta(t, 1.5, b.SpeedFactor(), 1e-6)
	b.Tick()
	b.Tick()
	assert.InDelta(t, 1.1, b.SpeedFactor(), 1e-6, "1.2/1.5 expired; the 3-tick 1.1 remains")
}

func TestBuffs_SpeedExpiry(t *testing.T) {
	var b Buffs
	b.ApplySpeed(10, 1.5, 2)

	b.Tick()
	assert.InDelta(t, 1.5, b.SpeedFactor(), 1e-6, "survives one tick boundary")

	b.Tick()
	assert.InDelta(t, 1.0, b.SpeedFactor(), 1e-6, "expired without re-application")
}

func TestBuffs_SpeedSameFactorRefreshes(t *testing.T) {
	var b Buffs
	b.ApplySpeed(10, 1.5, 2)
	b.Tick()
	b.ApplySpeed(10, 1.5, 2) // refresh
	b.Tick()
	assert.InDelta(t, 1.5, b.SpeedFactor(), 1e-6, "refreshed stream still alive")
}

// --- MovementFactor: the one place the two movement-speed buff kinds compose.
// Both movement sites (player input, mob step) read this, so a sprint and a
// slow can never disagree about which one wins. ---

func TestBuffs_MovementFactorComposesSpeedAndSlow(t *testing.T) {
	var b Buffs
	assert.InDelta(t, 1.0, b.MovementFactor(), 1e-6, "nothing applied")

	b.ApplySpeed(10, 1.5, 2)
	assert.InDelta(t, 1.5, b.MovementFactor(), 1e-6)

	// A 50 % slow lands on top of the sprint: they multiply out to a wash
	// rather than one silently winning.
	b.ApplySlow(4, 0.5, 2)
	assert.InDelta(t, 0.75, b.MovementFactor(), 1e-6)
}

func TestBuffs_MovementFactorNeverNegative(t *testing.T) {
	// A slow fraction above 1 would otherwise reverse the direction of travel.
	var b Buffs
	b.ApplySlow(4, 1.5, 2)
	assert.InDelta(t, 0.0, b.MovementFactor(), 1e-6)
}
