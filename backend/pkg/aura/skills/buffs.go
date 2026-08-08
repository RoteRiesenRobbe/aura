package skills

import "sort"

// Buffs is the generic per-entity status-effect store (effect foundations
// Step 2) — ONE transient buff/debuff container carried by every mob and
// player, replacing the per-mechanic ResistBuffs and the hand-rolled mob
// slow fields before further copies (dot, root, mark, shield) appear.
//
// Semantics inherited from ResistBuffs: entries are keyed by the granting
// skill — the same skill never stacks with itself, distinct skills are
// distinct sources. Within one skill, applications of different strengths
// (levels/casters) are tracked as separate streams that each age on their own
// lifetime: a weaker application's per-tick refresh must never keep a
// departed stronger application alive; a refresh with the identical strength
// bumps the stream's remaining ticks instead. How streams COMBINE is a
// per-payload query rule (resists stack multiplicatively across skills, slows
// never stack, only a skill's strongest dot deals damage — see the queries).
//
// Lifecycle: Tick() ages every entry once per game tick, called on the
// ResetTickNumbers hook (StatusEffectsSystem, tick start) — pure aging only.
// Payloads that ACT (dot damage) are driven separately by the SkillSystem via
// DueBuffEvents, so acting stays in the combat slice of the tick, before
// serialization. Aura-applied buffs use the lifetime convention "effect tick
// interval + 1" (survives one tick boundary, fades ~one aura cycle after
// leaving range); dots carry their full authored duration instead — the
// framework's defining upgrade: a dot keeps ticking after the target leaves
// the aura or the caster is gone.
//
// The zero value is ready to use.
type Buffs struct {
	entries map[SkillID][]*buffEntry
}

type buffEntry struct {
	payload buffPayload
	ticks   int
}

// buffPayload is the closed set of typed payloads the store carries. appliedBit
// makes the applied_effects wire classification compile-enforced: a new payload
// kind does not build until its pip bit (or deliberate None) is decided in
// applied_effects.go.
type buffPayload interface {
	isBuffPayload()
	appliedBit() AppliedEffect
}

type resistPayload struct {
	tags   []string
	factor float32
}

type slowPayload struct {
	fraction float32
}

// speedPayload is the movement-speed buff behind Swift-as-a-cooldown: the
// other half of the axis slowPayload already owns. Kept as its own payload
// rather than a signed slow because the two are authored, applied and read as
// different things — a slow is a debuff put on someone else by an aura, a
// speed burst is a self-buff fired on cooldown — and because their combining
// rules differ (slows take the strongest globally, speed composes per skill
// like tick_rate). MovementFactor is where the two meet.
type speedPayload struct {
	// factor scales the caster's own movement per tick: > 1 = sprint, < 1 =
	// a self-imposed drag. Streams are keyed by factor, like slow and tick_rate.
	factor float32
}

// lifestealPayload is the damage-side burst (R3 / §5.6): while it is alive the
// caster leeches this share of the damage its own hits deal, on top of whatever
// the firing effect authors. Its own payload rather than a field on the damage
// effect, because the two answer different questions — the authored fraction is
// "what this aura always does", this is "what the caster is doing right now" —
// and because a buff is the only shape that can expire.
type lifestealPayload struct {
	fraction float32
}

type tickRatePayload struct {
	// factor scales the caster's own aura tick interval: < 1 = haste (faster
	// ticks), > 1 = tick-slow. Streams are keyed by factor, like slow. The
	// >= 1-tick floor lives at EffectiveTickInterval, not here.
	factor float32
}

type dotPayload struct {
	dot DotBuff
	// age is the acting accumulator: game ticks since application, advanced
	// by DueBuffEvents (NOT by Tick, and deliberately NOT reset on refresh — an
	// aura refreshing every tick must not starve a slower dot cadence). An
	// event is due every full Interval.
	age int
}

type shieldPayload struct {
	// authored is the stream key AND the top-up ceiling (skill-def HP units,
	// level-scaled): a same-strength refresh restores remaining to authored,
	// never past it — drains are the only way down (plan-skill-vocab §3.2).
	authored  float32
	remaining float32
}

// calmPayload is the out-of-combat debuff (plan-faction-flips chunk 2, D7).
// It is deliberately EMPTY: calm has no strength axis — a mob is calmed or it
// is not — so the entry's remaining ticks are the entire state, and one stream
// per source skill is all there can be. It lives here rather than as a Mob
// field because the applied-effect pip is derived from this store, and because
// the store already owns the two things calm would otherwise re-implement:
// aging and per-skill refresh.
type calmPayload struct{}

// stunPayload is the hard stun (plan-cc-and-retaliation.md C3, D6). Empty like
// calm and charm — a stun has no strength axis, so the entry's remaining ticks
// are the whole state.
//
// ⚑ It is deliberately NOT a slowPayload at fraction 1.0. That shape would put
// the movement half and the cast half in two entries with two independently
// aged timers, and one stun whose halves can expire a tick apart is a bug
// waiting to be written. ONE payload answers both questions: MovementFactor
// reads Stunned() for movement, SkillSystem.processEntity reads it for casting.
//
// ⚑ Which is also why SlowFraction must never see it — a stun is not competing
// in "strongest slow wins", it short-circuits the whole movement axis.
type stunPayload struct{}

// charmPayload is the charm TIMER (plan-faction-flips chunk 3, D2/D6). Like
// calm it is empty — charm has no strength axis — and for the same two reasons
// it lives in the store rather than as a Mob field: the pip is derived from
// here, and aging is already owned here.
//
// ⚑ It carries the duration, NOT the link. The charmer is a typed field on the
// Mob (model.PlayerEntity, which this package cannot name — model imports
// skills), read several times per tick by leader()/CreditTo(); and charm's
// expiry has to ACT (revert the faction), which the store has no hook for. So
// the mob polls Charmed() and the two are kept in step by Charm/EndCharm.
type charmPayload struct{}

type hotPayload struct {
	hot HotBuff
	// age is the acting accumulator, the dotPayload twin: game ticks since
	// application, advanced by DueBuffEvents and deliberately NOT reset on
	// refresh — an aura re-applying every tick must not starve a slower heal
	// cadence, and this is exactly what makes "HoT lingers after leaving the
	// aura" work (plan-skill-vocab §3.7). An event is due every full Interval.
	age int
}

func (*resistPayload) isBuffPayload()    {}
func (*slowPayload) isBuffPayload()      {}
func (*speedPayload) isBuffPayload()     {}
func (*tickRatePayload) isBuffPayload()  {}
func (*dotPayload) isBuffPayload()       {}
func (*shieldPayload) isBuffPayload()    {}
func (*hotPayload) isBuffPayload()       {}
func (*calmPayload) isBuffPayload()      {}
func (*stunPayload) isBuffPayload()      {}
func (*charmPayload) isBuffPayload()     {}
func (*lifestealPayload) isBuffPayload() {}

// DotBuff is one damage-over-time application: HP dealt per dot event, every
// Interval game ticks, mitigated per event by the target's CURRENT
// resistances (roll-then-mitigate, per hit — like any other hit). Caster is
// the applying entity (model.PlayerEntity or model.MobEntity — typed `any`
// because model imports skills, not vice versa); the acting site dispatches
// on it so attribution (XP participation, kill credit, floating numbers)
// rides the existing PlayerTouches/MobTouches paths. A departed caster's ref
// stays valid, same as mob combat participants.
type DotBuff struct {
	HP       float32
	Tags     []string
	Variance float32
	Interval int
	Caster   any
}

// DotHit is one due damage event, returned to the acting site. HP is the
// pre-variance center; the acting site rolls per event.
type DotHit struct {
	HP       float32
	Tags     []string
	Variance float32
	Caster   any
}

// HotBuff is one heal-over-time application (plan-skill-vocab §3.7): the dot
// twin, HP RESTORED per event every Interval game ticks, but with no Tags —
// heals are not mitigated by resistances. Caster is the applying entity (typed
// `any`, like DotBuff.Caster, because model imports skills); the acting site
// dispatches on it for attribution (healer threat, participation). A departed
// caster's ref stays valid — the buff keeps healing after the aura or caster is
// gone, which is the whole point of case 1 (HoT lingers after leaving range).
type HotBuff struct {
	HP       float32
	Variance float32
	Interval int
	Caster   any
}

// HotEvent is one due heal event, returned to the acting site. HP is the
// pre-variance center; the acting site rolls per event, then heals via
// model.Healable.Heal.
type HotEvent struct {
	HP       float32
	Variance float32
	Caster   any
}

func (b *Buffs) apply(source SkillID, payload buffPayload, ticks int) {
	if b.entries == nil {
		b.entries = make(map[SkillID][]*buffEntry, 1)
	}
	b.entries[source] = append(b.entries[source], &buffEntry{payload: payload, ticks: ticks})
}

// ApplyResist grants (or refreshes) a tag-resistance buff from the given
// source skill: an identical factor refreshes that stream, a different factor
// opens its own.
//
// Reports whether the application was genuinely NEW — the "did this do work"
// answer an aura's cost is charged off (plan-resource-costs-feedback §5.2). A
// refresh at the same factor changes nothing but the expiry timer.
func (b *Buffs) ApplyResist(source SkillID, tags []string, factor float32, ticks int) bool {
	for _, e := range b.entries[source] {
		if p, ok := e.payload.(*resistPayload); ok && p.factor == factor {
			if ticks > e.ticks {
				e.ticks = ticks
			}
			p.tags = tags
			return false
		}
	}
	b.apply(source, &resistPayload{tags: tags, factor: factor}, ticks)
	return true
}

// ApplySlow grants (or refreshes) a movement-slow debuff from the given
// source skill; same stream rules as resist, keyed by fraction. Reports
// whether the application was genuinely new (the ApplyResist rule, §5.2).
func (b *Buffs) ApplySlow(source SkillID, fraction float32, ticks int) bool {
	for _, e := range b.entries[source] {
		if p, ok := e.payload.(*slowPayload); ok && p.fraction == fraction {
			if ticks > e.ticks {
				e.ticks = ticks
			}
			return false
		}
	}
	b.apply(source, &slowPayload{fraction: fraction}, ticks)
	return true
}

// ApplySpeed grants (or refreshes) a movement-speed buff from the given source
// skill (Swift as a cooldown): factor > 1 sprints, < 1 drags. Same stream rules
// as slow and tick_rate, keyed by factor — an identical factor refreshes that
// stream, a different factor opens its own.
func (b *Buffs) ApplySpeed(source SkillID, factor float32, ticks int) {
	for _, e := range b.entries[source] {
		if p, ok := e.payload.(*speedPayload); ok && p.factor == factor {
			if ticks > e.ticks {
				e.ticks = ticks
			}
			return
		}
	}
	b.apply(source, &speedPayload{factor: factor}, ticks)
}

// ApplyLifesteal grants (or refreshes) a damage-leech buff from the given source
// skill; same stream rules as speed and tick_rate, keyed by fraction — an
// identical fraction refreshes that stream, a different one opens its own (which
// is what a level-up mid-buff produces, and why LifestealFraction takes the
// strongest per source rather than summing blindly within one).
func (b *Buffs) ApplyLifesteal(source SkillID, fraction float32, ticks int) {
	for _, e := range b.entries[source] {
		if p, ok := e.payload.(*lifestealPayload); ok && p.fraction == fraction {
			if ticks > e.ticks {
				e.ticks = ticks
			}
			return
		}
	}
	b.apply(source, &lifestealPayload{fraction: fraction}, ticks)
}

// LifestealFraction is the leech the caster's hits carry right now: the
// strongest live application per source skill, SUMMED across skills.
//
// Additive across skills rather than multiplicative, because a leech is a share
// of one damage event and shares add — two 0.3 bursts leech 0.6 of the hit, not
// 0.51. Strongest-within-a-skill is the SpeedFactor rule and is what stops a
// level-up mid-buff (a second stream at a different fraction) double-counting.
//
// The damage path composes this with the effect's own authored
// LifestealFraction, so an aura that already leeches gets more while a burst is
// up rather than being overridden by it.
func (b *Buffs) LifestealFraction() float32 {
	var total float32
	for _, list := range b.entries {
		var strongest *lifestealPayload
		for _, e := range list {
			p, ok := e.payload.(*lifestealPayload)
			if !ok {
				continue
			}
			if strongest == nil || p.fraction > strongest.fraction {
				strongest = p
			}
		}
		if strongest != nil {
			total += strongest.fraction
		}
	}
	return total
}

// ApplyTickRate grants (or refreshes) a tick-rate buff from the given source
// skill (skill-vocab chunk 6): factor < 1 hastes the caster's own aura cadence,
// > 1 slows it. Same stream rules as slow, keyed by factor — an identical
// factor refreshes that stream, a different factor opens its own.
func (b *Buffs) ApplyTickRate(source SkillID, factor float32, ticks int) {
	for _, e := range b.entries[source] {
		if p, ok := e.payload.(*tickRatePayload); ok && p.factor == factor {
			if ticks > e.ticks {
				e.ticks = ticks
			}
			return
		}
	}
	b.apply(source, &tickRatePayload{factor: factor}, ticks)
}

// ApplyDot grants (or refreshes) a damage-over-time debuff from the given
// source skill; streams are keyed by (caster, per-event damage) — round-7
// item 6 (PO 2026-08-02): two casters with the same skill at the same
// strength each own their own stream, both tick, credit stays split. A
// refresh (same caster, same strength) resets the remaining duration and
// takes over tags/cadence but keeps the acting accumulator running.
//
// Reports whether the target was genuinely IGNITED rather than kept burning —
// what "pay to ignite" is charged off (§5.1), so a second caster pays their
// own entry rather than riding the first ignition for free.
func (b *Buffs) ApplyDot(source SkillID, dot DotBuff, ticks int) bool {
	for _, e := range b.entries[source] {
		if p, ok := e.payload.(*dotPayload); ok && p.dot.HP == dot.HP && p.dot.Caster == dot.Caster {
			if ticks > e.ticks {
				e.ticks = ticks
			}
			p.dot = dot
			return false
		}
	}
	b.apply(source, &dotPayload{dot: dot}, ticks)
	return true
}

// ApplyHot grants (or refreshes) a heal-over-time buff from the given source
// skill, the ApplyDot twin: streams are keyed by per-event HP. A refresh resets
// the remaining duration and hands the stream to the latest application (caster,
// cadence) but keeps the acting accumulator running — so a hot_aura re-applying
// every tick tops the duration up while in range, and the buff keeps ticking
// down once the target leaves (plan-skill-vocab §3.7). Reports whether the
// buff was genuinely new, the ApplyDot rule (§5.1/§5.2).
func (b *Buffs) ApplyHot(source SkillID, hot HotBuff, ticks int) bool {
	for _, e := range b.entries[source] {
		if p, ok := e.payload.(*hotPayload); ok && p.hot.HP == hot.HP {
			if ticks > e.ticks {
				e.ticks = ticks
			}
			p.hot = hot
			return false
		}
	}
	b.apply(source, &hotPayload{hot: hot}, ticks)
	return true
}

// ApplyShield grants (or refreshes) an absorb pool from the given source
// skill; streams are keyed by the authored pool size. A refresh with the
// identical strength renews the remaining lifetime AND tops the pool back up
// to the authored amount (plan-skill-vocab chunk 2, §3.2).
//
// Reports whether the application did work: newly granted, OR a refresh that
// actually restored a drained pool. Shield is the one payload with a sustain
// signal of its own, which is why its rule is wider than resist's — a full pool
// topped up to full is not work, but replacing absorbed HP is (§5.2). A broken
// pool is dropped rather than kept at zero (dropDepletedShields), so re-shielding
// after a break reports new rather than restored.
func (b *Buffs) ApplyShield(source SkillID, hp float32, ticks int) bool {
	for _, e := range b.entries[source] {
		if p, ok := e.payload.(*shieldPayload); ok && p.authored == hp {
			if ticks > e.ticks {
				e.ticks = ticks
			}
			restored := p.remaining < p.authored
			p.remaining = p.authored
			return restored
		}
	}
	b.apply(source, &shieldPayload{authored: hp, remaining: hp}, ticks)
	return true
}

// Tick advances the per-tick lifecycle: applications not refreshed within
// their lifetime expire. Called once per game tick on the ResetTickNumbers
// hook. Pure aging — acting payloads are driven by DueBuffEvents.
func (b *Buffs) Tick() {
	for source, list := range b.entries {
		kept := list[:0]
		for _, e := range list {
			e.ticks--
			if e.ticks > 0 {
				kept = append(kept, e)
			}
		}
		if len(kept) == 0 {
			delete(b.entries, source)
		} else {
			b.entries[source] = kept
		}
	}
}

// Cleanse removes every active buff and debuff (plan-effect-foundations F10:
// everything is cleansable, no dispel classes in v1).
func (b *Buffs) Cleanse() {
	b.entries = nil
}

// ApplyCalm puts the holder out of combat for ticks (plan-faction-flips chunk
// 2). One stream per source skill — calm carries no strength to key on, so a
// recast from the same skill refreshes rather than stacking. A LONGER remaining
// calm is never shortened by a weaker recast, matching every other Apply* here.
func (b *Buffs) ApplyCalm(source SkillID, ticks int) {
	for _, e := range b.entries[source] {
		if _, ok := e.payload.(*calmPayload); ok {
			if ticks > e.ticks {
				e.ticks = ticks
			}
			return
		}
	}
	b.apply(source, &calmPayload{}, ticks)
}

// ApplyStun stuns the entity for ticks (plan-cc-and-retaliation.md C3, D6):
// movement halts and casting is suppressed until it expires. One stream per
// source skill, extend-never-shorten, like calm.
func (b *Buffs) ApplyStun(source SkillID, ticks int) {
	for _, e := range b.entries[source] {
		if _, ok := e.payload.(*stunPayload); ok {
			if ticks > e.ticks {
				e.ticks = ticks
			}
			return
		}
	}
	b.apply(source, &stunPayload{}, ticks)
}

// Stunned reports whether any stun application is live. THE read for both
// halves of the mechanic — MovementFactor for movement, processEntity for
// casting — so the two can never disagree about how long the stun lasted.
func (b *Buffs) Stunned() bool { return hasPayload[*stunPayload](b) }

// Calmed reports whether any calm application is live.
func (b *Buffs) Calmed() bool { return hasPayload[*calmPayload](b) }

// DropCalm removes every calm application, from every source — the break-on-
// damage path (plan-faction-flips chunk 2 / §5.4: ANY damage breaks calm,
// including the calmer's own aura, by PO ruling).
func (b *Buffs) DropCalm() { dropPayload[*calmPayload](b) }

// ApplyCharm starts (or refreshes) the charm timer from the given source skill
// (plan-faction-flips chunk 3). Same one-stream-per-source rule as calm — charm
// carries no strength to key on. In shipped content a refresh cannot happen: a
// charmed mob is player-aligned, so the next cast's eligibility check passes
// over it (D11, and it is pinned by test rather than by a branch).
//
// ⚑ Use Mob.Charm, never this directly: the timer and the charmer link have to
// start together, or the mob is aligned with nobody to follow.
func (b *Buffs) ApplyCharm(source SkillID, ticks int) {
	for _, e := range b.entries[source] {
		if _, ok := e.payload.(*charmPayload); ok {
			if ticks > e.ticks {
				e.ticks = ticks
			}
			return
		}
	}
	b.apply(source, &charmPayload{}, ticks)
}

// Charmed reports whether the charm timer is still running. The mob polls it
// every tick, because charm's expiry has to act (revert) — see charmPayload.
func (b *Buffs) Charmed() bool { return hasPayload[*charmPayload](b) }

// DropCharm ends the charm timer early — the charmer-left path (D10), where the
// break is an event rather than an expiry.
func (b *Buffs) DropCharm() { dropPayload[*charmPayload](b) }

// hasPayload reports whether any live application carries payload kind T.
func hasPayload[T buffPayload](b *Buffs) bool {
	for _, list := range b.entries {
		for _, e := range list {
			if _, ok := e.payload.(T); ok {
				return true
			}
		}
	}
	return false
}

// dropPayload removes every application of payload kind T, from every source —
// the store's targeted removal, where expiry and Cleanse-everything were the two
// shapes that existed before calm (chunk 2) and neither can express "this one
// mechanic ended early".
func dropPayload[T buffPayload](b *Buffs) {
	for source, list := range b.entries {
		kept := list[:0]
		for _, e := range list {
			if _, ok := e.payload.(T); !ok {
				kept = append(kept, e)
			}
		}
		if len(kept) == 0 {
			delete(b.entries, source)
		} else {
			b.entries[source] = kept
		}
	}
}

// ResistMultiplier is the combined incoming-damage multiplier of all active
// resist buffs for a hit's damage tags. Per skill only the strongest active
// application counts; within it, each covered hit tag multiplies once; across
// skills the factors multiply — same semantics as one ResistMultiplier source
// per skill.
func (b *Buffs) ResistMultiplier(hitTags []string) float32 {
	multiplier := float32(1)
	for _, list := range b.entries {
		var strongest *resistPayload
		for _, e := range list {
			if p, ok := e.payload.(*resistPayload); ok && (strongest == nil || p.factor < strongest.factor) {
				strongest = p
			}
		}
		if strongest == nil {
			continue
		}
		for _, hitTag := range hitTags {
			for _, covered := range strongest.tags {
				if hitTag == covered {
					multiplier *= strongest.factor
					break
				}
			}
		}
	}
	return multiplier
}

// SlowFraction is the movement-speed reduction currently in effect: slows
// never stack — the strongest active fraction wins across all streams and
// skills (unchanged from the pre-store rule).
func (b *Buffs) SlowFraction() float32 {
	var strongest float32
	for _, list := range b.entries {
		for _, e := range list {
			if p, ok := e.payload.(*slowPayload); ok && p.fraction > strongest {
				strongest = p.fraction
			}
		}
	}
	return strongest
}

// SpeedFactor is the combined movement-speed multiplier currently in effect on
// the entity's own movement. Per skill only the most extreme active application
// counts (furthest from unity — the tick_rate rule, so a skill never
// self-stacks); across skills the factors multiply. No active buff = 1.0.
//
// ⚑ Not the whole movement story on its own: slows live in their own payload
// with their own combining rule. MovementFactor is the composed value the
// movement sites read.
func (b *Buffs) SpeedFactor() float32 {
	factor := float32(1)
	for _, list := range b.entries {
		var strongest *speedPayload
		for _, e := range list {
			p, ok := e.payload.(*speedPayload)
			if !ok {
				continue
			}
			if strongest == nil || unityDistance(p.factor) > unityDistance(strongest.factor) {
				strongest = p
			}
		}
		if strongest != nil {
			factor *= strongest.factor
		}
	}
	return factor
}

// MovementFactor is the entity's total transient movement-speed multiplier:
// the speed buffs composed with the strongest slow. This is the ONE place the
// two halves of the movement axis meet — both movement sites (the player's
// input step and the mob's stepLength) read it, so a sprint and a slow can
// never disagree about which one wins depending on who is moving.
//
// Floored at 0: a slow fraction above 1 would otherwise reverse the direction
// of travel.
func (b *Buffs) MovementFactor() float32 {
	// A stun short-circuits the axis rather than composing with it (D6): it is
	// not a very strong slow, it is "you do not move", and nothing — no sprint,
	// no haste — buys any of it back.
	if b.Stunned() {
		return 0
	}
	f := b.SpeedFactor() * (1 - b.SlowFraction())
	if f < 0 {
		return 0
	}
	return f
}

// TickRateFactor is the combined tick-rate multiplier currently in effect on
// the caster's own aura cadence (skill-vocab chunk 6). Per skill only the most
// extreme active application counts (furthest from unity — the resist-style
// per-skill rule, so a skill never self-stacks); across skills the factors
// multiply, so a haste and a tick-slow net out. No active buff = 1.0.
func (b *Buffs) TickRateFactor() float32 {
	factor := float32(1)
	for _, list := range b.entries {
		var strongest *tickRatePayload
		for _, e := range list {
			p, ok := e.payload.(*tickRatePayload)
			if !ok {
				continue
			}
			if strongest == nil || unityDistance(p.factor) > unityDistance(strongest.factor) {
				strongest = p
			}
		}
		if strongest != nil {
			factor *= strongest.factor
		}
	}
	return factor
}

// unityDistance ranks multiplicative factors by how far they pull from unity,
// so "strongest" is well-defined in both directions — for tick_rate (hastes
// < 1, tick-slows > 1) and for speed (sprints > 1, drags < 1) alike.
func unityDistance(factor float32) float32 {
	if factor < 1 {
		return 1 - factor
	}
	return factor - 1
}

// ShieldTotal is the combined absorb capacity of all active shield pools —
// distinct skills stack additively (§3.2); the shield_hp wire source.
func (b *Buffs) ShieldTotal() float32 {
	var total float32
	for _, list := range b.entries {
		for _, e := range list {
			if p, ok := e.payload.(*shieldPayload); ok {
				total += p.remaining
			}
		}
	}
	return total
}

// AbsorbShield drains incoming post-mitigation damage from the active shield
// pools and returns the amount absorbed; the caller applies the rest to HP.
// Pools drain in expiring-soonest order across all sources ("use it before
// you lose it", §3.2); depleted pools are removed. Ties break by source
// SkillID so the drain order is deterministic.
func (b *Buffs) AbsorbShield(hp float32) float32 {
	type pool struct {
		source  SkillID
		ticks   int
		payload *shieldPayload
	}
	var pools []pool
	for source, list := range b.entries {
		for _, e := range list {
			if p, ok := e.payload.(*shieldPayload); ok {
				pools = append(pools, pool{source: source, ticks: e.ticks, payload: p})
			}
		}
	}
	sort.Slice(pools, func(i, j int) bool {
		if pools[i].ticks != pools[j].ticks {
			return pools[i].ticks < pools[j].ticks
		}
		return pools[i].source < pools[j].source
	})

	var absorbed float32
	rest := hp
	for _, p := range pools {
		if rest <= 0 {
			break
		}
		drain := min(rest, p.payload.remaining)
		p.payload.remaining -= drain
		absorbed += drain
		rest -= drain
	}
	if absorbed > 0 {
		b.dropDepletedShields()
	}
	return absorbed
}

// dropDepletedShields removes shield streams whose pool hit zero: a broken
// shield is gone, not a zero-capacity entry idling until expiry.
func (b *Buffs) dropDepletedShields() {
	for source, list := range b.entries {
		kept := list[:0]
		for _, e := range list {
			if p, ok := e.payload.(*shieldPayload); ok && p.remaining <= 0 {
				continue
			}
			kept = append(kept, e)
		}
		if len(kept) == 0 {
			delete(b.entries, source)
		} else {
			b.entries[source] = kept
		}
	}
}

// DueBuffEvents advances every acting payload's accumulator by one game tick
// and returns the events due now — damage (dots) and healing (hots) in one
// drain, so the SkillSystem's tick-order story stays single (plan-skill-vocab
// §3.7). Per (source skill, caster) only the strongest active dot deals
// damage — same skill never stacks with ITSELF, but two casters' streams both
// tick (round-7 item 6, PO 2026-08-02); per source skill only the strongest
// active hot heals. Suppressed weaker streams keep aging and acting on their
// own cadence once the stronger one expires. Called once per tick per entity
// by the SkillSystem — no per-call allocation beyond the returned slices (the
// idle-loop alloc pins), which is why the per-caster check is a nested scan
// rather than a map.
func (b *Buffs) DueBuffEvents() ([]DotHit, []HotEvent) {
	var dots []DotHit
	var hots []HotEvent
	for _, list := range b.entries {
		var strongestHot *hotPayload
		for _, e := range list {
			switch p := e.payload.(type) {
			case *dotPayload:
				p.age++
			case *hotPayload:
				p.age++
				if strongestHot == nil || p.hot.HP > strongestHot.hot.HP {
					strongestHot = p
				}
			}
		}
		for _, e := range list {
			p, ok := e.payload.(*dotPayload)
			if !ok || dotSuppressed(list, p) {
				continue
			}
			if p.age%p.dot.Interval == 0 {
				dots = append(dots, DotHit{
					HP:       p.dot.HP,
					Tags:     p.dot.Tags,
					Variance: p.dot.Variance,
					Caster:   p.dot.Caster,
				})
			}
		}
		if strongestHot != nil && strongestHot.age%strongestHot.hot.Interval == 0 {
			hots = append(hots, HotEvent{
				HP:       strongestHot.hot.HP,
				Variance: strongestHot.hot.Variance,
				Caster:   strongestHot.hot.Caster,
			})
		}
	}
	return dots, hots
}

// dotSuppressed reports whether a stronger dot stream from the SAME caster is
// active in list. Within one caster HPs are distinct (an equal-strength
// re-application is a refresh, not a second stream), so strict > needs no
// tie-break.
func dotSuppressed(list []*buffEntry, p *dotPayload) bool {
	for _, e := range list {
		if q, ok := e.payload.(*dotPayload); ok && q != p && q.dot.Caster == p.dot.Caster && q.dot.HP > p.dot.HP {
			return true
		}
	}
	return false
}
