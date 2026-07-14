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

// buffPayload is the closed set of typed payloads the store carries.
type buffPayload interface {
	isBuffPayload()
}

type resistPayload struct {
	tags   []string
	factor float32
}

type slowPayload struct {
	fraction float32
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

type hotPayload struct {
	hot HotBuff
	// age is the acting accumulator, the dotPayload twin: game ticks since
	// application, advanced by DueBuffEvents and deliberately NOT reset on
	// refresh — an aura re-applying every tick must not starve a slower heal
	// cadence, and this is exactly what makes "HoT lingers after leaving the
	// aura" work (plan-skill-vocab §3.7). An event is due every full Interval.
	age int
}

func (*resistPayload) isBuffPayload() {}
func (*slowPayload) isBuffPayload()   {}
func (*dotPayload) isBuffPayload()    {}
func (*shieldPayload) isBuffPayload() {}
func (*hotPayload) isBuffPayload()    {}

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
func (b *Buffs) ApplyResist(source SkillID, tags []string, factor float32, ticks int) {
	for _, e := range b.entries[source] {
		if p, ok := e.payload.(*resistPayload); ok && p.factor == factor {
			if ticks > e.ticks {
				e.ticks = ticks
			}
			p.tags = tags
			return
		}
	}
	b.apply(source, &resistPayload{tags: tags, factor: factor}, ticks)
}

// ApplySlow grants (or refreshes) a movement-slow debuff from the given
// source skill; same stream rules as resist, keyed by fraction.
func (b *Buffs) ApplySlow(source SkillID, fraction float32, ticks int) {
	for _, e := range b.entries[source] {
		if p, ok := e.payload.(*slowPayload); ok && p.fraction == fraction {
			if ticks > e.ticks {
				e.ticks = ticks
			}
			return
		}
	}
	b.apply(source, &slowPayload{fraction: fraction}, ticks)
}

// ApplyDot grants (or refreshes) a damage-over-time debuff from the given
// source skill; streams are keyed by per-event damage. A refresh resets the
// remaining duration and hands the stream to the latest application (caster,
// tags, cadence) but keeps the acting accumulator running.
func (b *Buffs) ApplyDot(source SkillID, dot DotBuff, ticks int) {
	for _, e := range b.entries[source] {
		if p, ok := e.payload.(*dotPayload); ok && p.dot.HP == dot.HP {
			if ticks > e.ticks {
				e.ticks = ticks
			}
			p.dot = dot
			return
		}
	}
	b.apply(source, &dotPayload{dot: dot}, ticks)
}

// ApplyHot grants (or refreshes) a heal-over-time buff from the given source
// skill, the ApplyDot twin: streams are keyed by per-event HP. A refresh resets
// the remaining duration and hands the stream to the latest application (caster,
// cadence) but keeps the acting accumulator running — so a hot_aura re-applying
// every tick tops the duration up while in range, and the buff keeps ticking
// down once the target leaves (plan-skill-vocab §3.7).
func (b *Buffs) ApplyHot(source SkillID, hot HotBuff, ticks int) {
	for _, e := range b.entries[source] {
		if p, ok := e.payload.(*hotPayload); ok && p.hot.HP == hot.HP {
			if ticks > e.ticks {
				e.ticks = ticks
			}
			p.hot = hot
			return
		}
	}
	b.apply(source, &hotPayload{hot: hot}, ticks)
}

// ApplyShield grants (or refreshes) an absorb pool from the given source
// skill; streams are keyed by the authored pool size. A refresh with the
// identical strength renews the remaining lifetime AND tops the pool back up
// to the authored amount (plan-skill-vocab chunk 2, §3.2).
func (b *Buffs) ApplyShield(source SkillID, hp float32, ticks int) {
	for _, e := range b.entries[source] {
		if p, ok := e.payload.(*shieldPayload); ok && p.authored == hp {
			if ticks > e.ticks {
				e.ticks = ticks
			}
			p.remaining = p.authored
			return
		}
	}
	b.apply(source, &shieldPayload{authored: hp, remaining: hp}, ticks)
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
// §3.7). Per source skill only the strongest active dot deals damage and only
// the strongest active hot heals (same skill never stacks with itself);
// suppressed weaker streams keep aging and acting on their own cadence once the
// stronger one expires. Called once per tick per entity by the SkillSystem.
func (b *Buffs) DueBuffEvents() ([]DotHit, []HotEvent) {
	var dots []DotHit
	var hots []HotEvent
	for _, list := range b.entries {
		var strongestDot *dotPayload
		var strongestHot *hotPayload
		for _, e := range list {
			switch p := e.payload.(type) {
			case *dotPayload:
				p.age++
				if strongestDot == nil || p.dot.HP > strongestDot.dot.HP {
					strongestDot = p
				}
			case *hotPayload:
				p.age++
				if strongestHot == nil || p.hot.HP > strongestHot.hot.HP {
					strongestHot = p
				}
			}
		}
		if strongestDot != nil && strongestDot.age%strongestDot.dot.Interval == 0 {
			dots = append(dots, DotHit{
				HP:       strongestDot.dot.HP,
				Tags:     strongestDot.dot.Tags,
				Variance: strongestDot.dot.Variance,
				Caster:   strongestDot.dot.Caster,
			})
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
