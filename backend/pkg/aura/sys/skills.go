package sys

import (
	"log"
	"math"
	"math/rand"
	"time"

	"github.com/EngoEngine/ecs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/cfg"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/minions"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/mob"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/vitals"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/google/uuid"
)

// skillEntity is the minimal interface SkillSystem requires; players and mobs
// both satisfy it.
//
// AuraCollider is the entity's single aura sensor. It returns the concrete
// *phy.Circle (not phy.DynamicCollider) because the SkillSystem resizes it to
// the active skill's EffectiveRadius and re-derives its collision mask via
// model.AuraMaskFor — there is deliberately no collider per equipped skill,
// since exactly one aura is active at a time.
type skillEntity interface {
	model.BasicEntity
	model.Factioned
	SkillComponent() *skills.SkillComponent
	AuraCollider() *phy.Circle
}

// healCaster holds the additional capabilities the heal-aura self-damage
// bookkeeping needs. Players satisfy it; mobs do not (no PlayerVitalSigns) —
// a heal effect on an entity without these capabilities is skipped. This is a
// deliberate limitation: mob support behaviors ("move to allied mobs with a
// mob-only heal aura", roadmap.md item 7) will need heal_aura target flags
// plus a vitals abstraction here.
// ⚑ PoolFactor is the FULL pool multiplier (PowerScale × passive), NOT
// DerivedStats.MaxHealthFactor(), which is the passive alone. When *Mob is given
// this method, returning the passive term drops the whole inflation curve and
// puts every mob self-heal on a level-1 baseline — it compiles and satisfies the
// interface, and asserting on Derived would not catch it.
type healCaster interface {
	VitalSigns() *model.PlayerVitalSigns
	StatusEffects() *model.StatusEffects
	PoolFactor() float32
	MaxHealth() vitals.VitalSign
	IsGod() bool
}

// costPayer is the player-only capability set paying an effect's resource cost
// needs (plan-numbers-rewrite D5): the pool to price the fraction against, the
// vitals to deduct from, the ambient-damage flag, and the GOD exemption.
//
// ⚑ Mobs deliberately do NOT satisfy it, and that is load-bearing (L5). Until
// this pass the cost lived inside HealParams and was gated by healCaster; the
// cost is now read off EVERY effect on every caster, so without this gate
// re-established here every caster mob in the game would pay — and suicide.
// GOD is checked at the pricing site for the same reason.
type costPayer interface {
	VitalSigns() *model.PlayerVitalSigns
	StatusEffects() *model.StatusEffects
	MaxHealth() vitals.VitalSign
	IsGod() bool
	// NoteCostPaid records the HP a charge actually took, for the cost_paid
	// floating-number accumulator (round-7 item 7) — costs deliberately do
	// not ride damageTaken, which feeds the crit share and damage-interrupt.
	NoteCostPaid(paid vitals.VitalSign)
}

// ConnState is the ConnectionStateSystem capability the SkillSystem needs:
// recall's campfire-anchor lookup (chunk 4) and revive's dead-marker
// consumption (chunk 3). Wired post-construction via SetConnState in
// core/game.go — the SkillSystem is constructed before the
// ConnectionStateSystem (the CampfireAnchorSink precedent: Go-side wiring,
// no model interface bloat).
type ConnState interface {
	AnchorOf(id uuid.UUID) (phy.Vec2f, bool)
	// ReviveAtCorpse rebuilds the dead player whose corpse has the given
	// entity ID at that corpse with healthFraction of max HP, consuming the
	// dead marker (name, progression, skills restored). Reports false if no
	// such corpse is waiting (a race with respawn/disconnect).
	ReviveAtCorpse(corpseID uint64, healthFraction float32) bool
}

// SkillSystem applies active-aura effects and cooldown-skill bursts for every
// tracked entity each tick. The space reference serves the one-shot
// instant_damage queries (resolved Open Question 3: temporary circle, query
// against the last broadphase, drop — never added to the space).
type SkillSystem struct {
	entities []skillEntity
	space    *phy.Space

	// game serves the spawn effect (mob-depth chunk 1): mob-definition lookup,
	// config, and AddEntity for the summoned mob.
	game model.Game

	// connState serves recall's anchor precondition + destination (chunk 4);
	// nil until wired, which reads as "nothing bound".
	connState ConnState

	// rng feeds the per-hit variance rolls (item 11 Phase 3, decision C4) and
	// the summon-placement direction. Free-running by design — reproducibility
	// only matters in tests, which overwrite it with a seeded source.
	rng *rand.Rand

	// presenceProbe/presenceHits are the presence scan's reused query pair
	// (chunk P): the probe circle is re-aimed per player per tick and the hit
	// buffer handed back as buf[:0] — the chunk-B AppendCircleDynamics pattern,
	// zero per-tick allocation (steering_alloc_test.go's lesson).
	presenceProbe *phy.Circle
	presenceHits  []phy.DynamicCollider
}

// SetConnState wires the ConnectionStateSystem seam (chunk 4); called from
// core/game.go after both systems exist.
func (s *SkillSystem) SetConnState(cs ConnState) {
	s.connState = cs
}

func NewSkillSystem(space *phy.Space, g model.Game) *SkillSystem {
	return &SkillSystem{
		space: space,
		game:  g,
		rng:   rand.New(rand.NewSource(time.Now().UnixNano())),
	}
}

// SeedRNG replaces the free-running roll source with a seeded one. The sim
// harness (pkg/aura/sim, plan-sim-harness chunk 1) needs reproducible
// variance/crit rolls per run; in-package tests overwrite s.rng directly.
// Never called in the live game — combat rolls there stay time-seeded.
func (s *SkillSystem) SeedRNG(seed int64) {
	s.rng = rand.New(rand.NewSource(seed))
}

func (*SkillSystem) Priority() int {
	return -65
}

func (s *SkillSystem) New(w *ecs.World) {
	log.Println("SkillSystem nominal")
}

func (s *SkillSystem) AddEntity(e skillEntity) {
	s.entities = append(s.entities, e)
}

func (s *SkillSystem) Update(dt float32) {
	for _, e := range s.entities {
		s.processEntity(e)
	}
}

func (s *SkillSystem) processEntity(e skillEntity) {
	// Acting buff payloads first: dots on this entity deal their due damage and
	// hots restore their due healing (effect foundations Step 2, HoT chunk 3).
	// Pure buff AGING stays on ResetTickNumbers at tick start; acting lives here
	// so it lands in the combat slice of the tick, before serialization.
	s.tickBuffEvents(e)

	sc := e.SkillComponent()
	s.processCooldowns(e, sc)

	slot := sc.ActiveAuraSlot
	if slot < 0 {
		return
	}
	equip := sc.AuraSlots[slot]
	if equip == nil {
		return
	}

	// Presence-counts attribution (chunk P): a live player whose aura is ON is
	// offered as a participant to every nearby entity that takes presence —
	// the SkillSystem owns "is an aura on", so the scan lives here. Every tick
	// on purpose: participation latches (the map persists until full regen),
	// so the P2 gate's one-tick lag after a fight's first player hit is the
	// only timing artifact, invisible at 30 tps.
	s.notePresence(e)

	// Keep the single aura sensor sized and targeted per the active skill.
	// The SkillSystem runs after physics resolution, so a new radius/mask
	// takes effect on the next tick's collisions — consistent with the
	// accumulator reset on switch, which already defers the first effect
	// application anyway.
	collider := e.AuraCollider()
	if r := equip.EffectiveRadius(); collider.Radius != r {
		collider.SetRadius(r)
	}
	if m := model.AuraMaskFor(equip.Def); collider.Shape().Mask != m {
		collider.Shape().Mask = m
	}

	// The accumulator counts ticks since the aura became active and grows
	// monotonically (equip and SetActiveAura reset it to 0). Each effect fires
	// independently whenever the count is a multiple of its own interval, so a
	// multi-effect aura (e.g. Paladin's fast damage + slow heal) runs each
	// effect on its own cadence — unlike a shared max-interval reset, this is
	// correct regardless of how the intervals relate.
	equip.TickAccumulator++

	// The caster's tick_rate buffs (haste / tick-slow) scale every effect's
	// cadence for this tick (skill-vocab chunk 6). Read once; entities without
	// a buff store (none today) fall back to the neutral 1.0. The wire fields
	// (model.AuraTickInterval/Phase) apply this same factor to effect[0], so
	// the indicator beat and the actual ticks stay in lockstep.
	factor := float32(1)
	if tr, ok := e.(tickRateBuffed); ok {
		factor = tr.TickRateFactor()
	}

	collisions := collider.Collisions()
	for _, effect := range equip.Def.Effects {
		if equip.TickAccumulator%skills.EffectiveTickInterval(effect, equip.Level, factor) != 0 {
			continue
		}
		// The shared sensor sizes to the MAX effect radius; a sub-max effect
		// gets its collision set narrowed to its own reach (chunk 2). For the
		// common equal-radii case this is the untouched set.
		targets := effectCollisions(collisions, collider.Position(), collider.Radius, effect, equip.Level)
		s.applyAuraEffect(e, equip.Def.ID, equip.Level, effect, targets)
	}
}

// applyAuraEffect runs ONE aura effect tick end to end: price the cost, apply
// the effect, charge for it if it landed (plan-numbers-rewrite D5/D8).
//
// The three belong together in one named place rather than spread through the
// dispatch loop, because their ORDER is the rule: the cost is computed and
// clamped BEFORE the effect (L4 — computing affordability afterwards would let
// a cost kill its caster), and paid only after the applier reports it reached
// something (D8 — an aura is a field, it pays for what it did).
func (s *SkillSystem) applyAuraEffect(e skillEntity, source skills.SkillID, level int, effect skills.EffectDef, targets phy.ColliderSet) {
	payer, charge, skip := auraEffectCost(e, effect, level)
	if skip {
		// The caster is at the never-kill floor: no effect emitted, no cost
		// paid. Carried verbatim from applyHealAura, where the shape has been
		// live since triage item 1.
		return
	}

	landed := false
	switch effect.Type {
	case skills.EffectTypeDamageAura:
		landed = applyDamageAura(e, level, effect, targets, s.rng)
	case skills.EffectTypeHealAura:
		landed = s.applyHealAura(e, level, effect, targets)
	case skills.EffectTypeSlowAura:
		landed = applySlowAura(e, source, level, effect, targets)
	case skills.EffectTypeResistAura:
		landed = applyResistAura(e, source, level, effect, targets)
	case skills.EffectTypeDotAura:
		landed = applyDotEffect(e, source, level, effect, targets)
	case skills.EffectTypeShieldAura:
		landed = applyShieldAura(e, source, level, effect, targets)
	case skills.EffectTypeHotAura:
		landed = applyHotAura(e, source, level, effect, targets)
	}

	if landed && payer != nil {
		chargeCost(payer, charge)
	}
}

// notePresence probes the space around a player whose active aura is on and
// offers them as a combat participant to every body implementing
// model.PresenceNoter — presence-counts XP attribution (chunk P; the entry
// rule itself, in-combat + ≥1 participant, lives with the participant map in
// model/mob). A dedicated player-side probe rather than either "free"
// geometry, both rejected in the plan: a passive harvest-mob's sensor is
// masked to see nothing (the dark-tunnel lantern-carrier would earn nothing),
// and support-aura colliders pair with allies, never the enemy mob.
//
// The probe is a circle of PresenceRange around the player; circle-vs-body
// intersection makes the effective reach presenceRadius + target body radius,
// the withinSensor convention. Mob casters fail the PlayerEntity assert and
// are never scanned; a dead player (rebuilt struct, L-P1) is skipped.
func (s *SkillSystem) notePresence(e skillEntity) {
	p, ok := e.(model.PlayerEntity)
	if !ok {
		return
	}
	if c, ok := e.(model.Combatant); !ok || c.HealthRatio() == 0 {
		return
	}
	if s.presenceProbe == nil {
		s.presenceProbe = phy.NewCircle(p.Position(), combatFactors.PresenceRange())
		// Viewport is the only layer every mob body shares (an authored
		// collisionLayer replaces the default wholesale — mobSeparation's
		// finding); the interface assert below does the actual filtering.
		s.presenceProbe.Shape().Mask = int(model.LayerViewportCollision)
	}
	probe := s.presenceProbe
	probe.SetPosition(p.Position())
	probe.SetRadius(combatFactors.PresenceRange())
	s.presenceHits = s.space.AppendCircleDynamics(s.presenceHits[:0], probe)
	for _, hit := range s.presenceHits {
		if n, ok := hit.Shape().UserData.(model.PresenceNoter); ok {
			n.NotePresence(p)
		}
	}
}

// dotBuffable is implemented by entities that can carry a damage-over-time
// debuff (players and mobs — the generic buff store).
// Reports whether this application ignited the target rather than refreshing a
// burn already running (§5.1).
type dotBuffable interface {
	ApplyDot(source skills.SkillID, dot skills.DotBuff, ticks int) bool
}

// hotBuffable is implemented by entities that can carry a heal-over-time buff
// (players and mobs — the generic buff store), the dotBuffable twin.
// Reports whether the buff was genuinely new rather than a refresh (§5.2).
type hotBuffable interface {
	ApplyHot(source skills.SkillID, hot skills.HotBuff, ticks int) bool
}

// buffEventCarrier is the entity-side seam the acting site drains each tick —
// dot damage events and hot heal events in one drain (plan-skill-vocab §3.7).
type buffEventCarrier interface {
	DueBuffEvents() ([]skills.DotHit, []skills.HotEvent)
}

// tickRateBuffed is the caster-side seam for haste / tick-slow (skill-vocab
// chunk 6): the combined tick_rate factor scaling this entity's own aura
// cadence. Players and mobs implement it via their Buffs store.
type tickRateBuffed interface {
	TickRateFactor() float32
}

// applyDotEffect applies the effect's damage-over-time debuff to eligible
// targets; shared by the per-tick dot_aura path (re-application refreshes the
// duration — continuous burn while in range) and the one-shot instant_dot
// cooldown path. Either way the debuff then runs on the target independent
// of the delivery and the caster's presence (skills.Buffs).
//
// Reports whether at least one target was genuinely IGNITED — pay to ignite, not
// to keep burning (R2 / §5.1). ⚑ Only the AURA path spends this: the instant_dot
// cooldown in fireCooldown counts a non-empty target set as its hit and pays on
// cast regardless (D9), so a re-ignite with a cooldown is never free.
func applyDotEffect(e skillEntity, source skills.SkillID, level int, effect skills.EffectDef, collisions phy.ColliderSet) bool {
	// The caster's power scale (f(level) / tier scale / summon composition,
	// C0) is frozen into the dot at application time, like the level
	// (mob-depth chunk 1).
	hp := effect.Dot.HPAt(level) * casterPowerScale(e) * casterDamageFactor(e)
	dot := skills.DotBuff{
		HP:       hp,
		Tags:     effect.Dot.Tags,
		Variance: effect.Dot.Variance,
		Interval: effect.Dot.Interval,
		Caster:   e,
	}
	ticks := effect.Dot.DurationTicks()

	// No caster skip, matching the damage path's long-standing semantics
	// (only relevant if content ever sets targetsAllies on a dot).
	eligible := eligibleByTargetFlags[dotBuffable](effect, e, 0, false)
	targets := selectTargets(collisions, e.AuraCollider().Position(), effect.Selector, effectiveMaxTargets(effect, level), eligible)
	ignitedAny := false
	for _, c := range targets {
		if c.Shape().UserData.(dotBuffable).ApplyDot(source, dot, ticks) {
			ignitedAny = true
		}
	}
	// Applying a dot enters combat (chunk 1). e is the direct caster (player on
	// a player cast, the summon on an owned cast — the latter is not a
	// CombatActor and is skipped). Combat decays on the caster's own last
	// action, not the dot's lifetime — the accepted divergence (§3.1).
	// Combat entry is a separate question from cost and stays on "reached
	// anyone": refreshing a burn is still an act of hostility.
	if len(targets) > 0 {
		noteHarmDealt(e)
	}
	return ignitedAny
}

// tickBuffEvents drains this entity's due acting-buff events for the tick —
// dot damage AND hot healing in one pass (plan-skill-vocab §3.7), so the
// acting order stays a single story. Dot damage flows through the same
// Interacter entry points as direct hits (attribution, tags, mitigation,
// floating numbers, death all ride the existing paths); hot healing flows
// through model.Healable.Heal on this same entity, with attribution mirroring
// the heal aura from the buff's point of view (target = e, healer = the buff's
// caster). Damage is applied before healing — the combat slice, then recovery.
func (s *SkillSystem) tickBuffEvents(e skillEntity) {
	carrier, ok := e.(buffEventCarrier)
	if !ok {
		return
	}
	dots, hots := carrier.DueBuffEvents()

	if target, ok := e.(model.Interacter); ok {
		for _, hit := range dots {
			// Every event rolls its own variance and is mitigated by the
			// target's CURRENT resistances (roll-then-mitigate, per hit).
			damageHP := vitals.RollVariance(hit.HP, hit.Variance, s.rng)
			// A summon's — or a charmed mob's — dot replays through the player
			// it is CREDITED to, checked before the MobEntity case (a totem IS a
			// mob), so burn damage keeps crediting that player even after the
			// caster is gone. The caster itself rides along as the hit's Source:
			// threat credits it while it lives, and falls back to the player
			// once it reads dead (chunk 3).
			storedCaster := hit.Caster
			var source model.Combatant
			if credited, ok := storedCaster.(model.Credited); ok && credited.CreditTo() != nil {
				source, _ = storedCaster.(model.Combatant)
				storedCaster = credited.CreditTo()
			}
			// The leech is read LIVE at each burn tick (N3/D1) — deliberately
			// diverging from the dot model's freeze-at-ignition, so firing
			// Bloodthirst on an already-burning target leeches immediately and
			// stops when the burst expires. Read off the POST-credit caster:
			// that is the entity whose buff store carries the burst (a summon's
			// or charmed pet's burn credits its owner, and it is the owner's
			// Bloodthirst that should make it leech). The *Touches consumers
			// pick the heal recipient from the payload as on direct hits —
			// the living Source leeches for itself, else the credited toucher.
			lifesteal := casterLifesteal(storedCaster)
			switch caster := storedCaster.(type) {
			case model.PlayerEntity:
				target.PlayerTouches(caster, model.Damage{HP: damageHP, Tags: hit.Tags, Source: source, Lifesteal: lifesteal})
			case model.MobEntity:
				target.MobTouches(caster, mobs.Factors{Damage: damageHP, DamageTags: hit.Tags, Lifesteal: lifesteal})
			default:
				continue
			}
			if n, ok := e.(model.AuraHitNotifier); ok {
				n.NoteAuraHit(model.AuraHitStyleFire)
			}
		}
	}

	if len(hots) > 0 {
		s.tickHotEvents(e, hots)
	}
}

// tickHotEvents applies this tick's due heal-over-time events to e (the buff
// carrier is the heal target). Each event rolls its own variance and heals via
// model.Healable.Heal — max-clamp + floating heal number free. Attribution
// mirrors applyHealAura from the buff's POV: player-healer × player-target
// registers participation (NoteHealedBy), any Combatant healer draws healer
// threat on mobs fighting the target, and supporting an in-combat target puts a
// CombatActor healer into combat. Unlike a dot, a hot does no owned-summon
// owner-replay — the heal aura credits its direct caster too (a summon heals
// for itself; no participation as a non-player).
func (s *SkillSystem) tickHotEvents(e skillEntity, hots []skills.HotEvent) {
	target, ok := e.(model.Healable)
	if !ok {
		return
	}
	for _, hit := range hots {
		healHP := vitals.HP(vitals.RollVariance(hit.HP, hit.Variance, s.rng))
		healed := target.Heal(healHP)
		if healed <= 0 {
			continue // already full, or a dead target this tick — not a heal
		}

		// Participation XP is a PLAYER concept: only a player healing a player
		// registers a recent healer (gotcha #12).
		if targetPE, ok := e.(model.PlayerEntity); ok {
			if healerPE, ok := hit.Caster.(model.PlayerEntity); ok {
				targetPE.NoteHealedBy(healerPE)
			}
		}
		// Healer threat (mob-depth §6.3): the actually-healed HP, weighted,
		// lands on every mob in combat with the heal target. Inert for a mob
		// healing an ally.
		if healer, ok := hit.Caster.(model.Combatant); ok {
			s.creditHealerThreat(e.Basic().ID(), healer, float32(healed))
		}
		// Supporting an in-combat target enters combat (chunk 1); a mob healer
		// is skipped for free by noteHarmDealt's CombatActor assertion.
		if target.InCombat() {
			noteHarmDealt(hit.Caster)
		}
	}
}

// noteHarmDealt puts a player caster into combat (atmosphere & recovery
// chunk 1) when its own harmful or supporting action connects: a mob caster has
// no regen gate (its combat is aggroTarget-driven) so it is skipped for free
// via the model.CombatActor assertion. The take-harm direction is stamped in
// takeDamage on the target; this is only the caster side. Direct casts only —
// an owned summon's hits belong to the summon (its entity is passed here, not
// the owner), mirroring NoteAttackDealt's Damage.Source==nil rule.
func noteHarmDealt(caster any) {
	if a, ok := caster.(model.CombatActor); ok {
		a.NoteCombatAction()
	}
}

// casterPowerScale is THE f(character level) / tier-scale output seam (C0,
// GDD §5): the acting entity's own PowerScale — f(the level it stands at),
// which for an owned summon IS its owner's level (chunk 1b) — composed with
// the linear SummonPower specialization knob. A summon therefore still rides
// its owner's inflation curve and summon builds stay same-tier-relevant at
// every level (C0 PO decision), but the curve now arrives through the one
// PowerScale call every actor uses; multiplying the owner's in again here
// would apply f(ownerLevel) twice (landmine L3). Multiplies HP-side output
// values ONLY (damage /
// heal / dot / hot / shield / self-heal / self-cost) — never radius, tick
// rate, target count, or the relative multiplier vocabulary
// (crit/execute/berserker/variance/lifesteal/slow/resist). Route every new
// HP-valued effect's amount through this — a per-site copy is how the curve
// gets forgotten (the mayHarm lesson).
func casterPowerScale(e any) float32 {
	scale := float32(1)
	if ps, ok := e.(model.PowerScaled); ok {
		scale = ps.PowerScale()
	}
	if owned, ok := e.(model.Owned); ok && owned.Owner() != nil {
		scale *= owned.SummonPower()
	}
	return scale
}

// mayHarm is THE hostility seam for enemy-flagged harmful effects (chunk 6.6
// in-game fix): a caster without a model.HostilityGate (players) may harm any
// different-faction target; a gated caster (every mob, incl. owned summons —
// whose Align() sets an all-others aggro set, so their behavior is
// unchanged) needs declared hostility or an active combat link with the
// target. Route EVERY new harmful effect type's enemy eligibility through
// this — a per-site copy is how the gate gets forgotten (the AuraMaskFor
// resist-gap lesson). Only called for different-faction targets.
func mayHarm(caster any, target model.Factioned) bool {
	// Friendly-to-players factions (§9 lift 6, C5): the aligned side — players
	// AND their owned summons (whose permissive gate would otherwise grant the
	// harm) — can never damage a friendly faction. Keyed on the caster's
	// FACTION, not its Go type, so future allegiance flips (charm, decoys)
	// behave by allegiance. Checked before the gate on purpose.
	if cf, ok := caster.(model.Factioned); ok && cf.Faction() == model.FactionAligned {
		if pf, ok := target.(model.PlayerFriendly); ok && pf.FriendlyToPlayers() {
			return false
		}
	}
	gate, ok := caster.(model.HostilityGate)
	if !ok {
		return true
	}
	var id uint64
	if be, ok := target.(model.BasicEntity); ok {
		id = be.Basic().ID()
	}
	return gate.MayHarm(target.Faction(), id)
}

// eligibleByTargetFlags builds the standard eligibility predicate shared by
// flag-gated targeted effects (damage_aura/instant_damage, resist_aura,
// dot_aura/instant_dot): the target must be Factioned — players and mobs;
// structures/resources have no allegiance and are reached only through their
// dedicated paths — with same-faction targets gated by targetsAllies and
// opposing ones by targetsEnemies (effect foundations Step 1) plus the
// mayHarm hostility gate (chunk 6.6; caster is the ACTING entity so mob
// casters carry their gate in). The target must also implement Capability
// (the effect's apply interface); skipCaster excludes the caster itself
// (resist auras reach the caster only via targetsSelf). Heal auras keep
// their own predicate — implicit allies with wounded/never-self rules.
func eligibleByTargetFlags[Capability any](effect skills.EffectDef, caster model.Factioned, casterID uint64, skipCaster bool) func(phy.Collider) bool {
	casterFaction := caster.Faction()
	return func(c phy.Collider) bool {
		usr := c.Shape().UserData
		if usr == nil {
			return false
		}
		target, ok := usr.(model.Factioned)
		if !ok {
			return false
		}
		if target.Faction() == casterFaction {
			if !effect.TargetsAllies {
				return false
			}
		} else if !effect.TargetsEnemies || !mayHarm(caster, target) {
			return false
		}
		// The skill's authored faction allowlist (plan-faction-flips D8),
		// resolved to bits at content load. 0 = unrestricted, which is every
		// skill authored before chunk 2. It lives HERE, in the one predicate
		// every targeted effect passes through, so a second scoped skill —
		// charm-elementals is the named acceptance test — is a JSON file and
		// not a Go change.
		if effect.TargetFactionMask != 0 && effect.TargetFactionMask&target.Faction().Bit() == 0 {
			return false
		}
		if _, ok := usr.(Capability); !ok {
			return false
		}
		if skipCaster {
			if be, ok := usr.(model.BasicEntity); ok && be.Basic().ID() == casterID {
				return false
			}
		}
		return true
	}
}

// applyDamageAura dispatches on the caster type: player and mob auras use
// different Interacter entry points (PlayerTouches vs. MobTouches double
// dispatch), mirroring the two legacy damage paths 1:1. A mob acting for a
// player — an owned summon, or a charmed mob (plan-faction-flips chunk 3) — is
// checked FIRST: it IS a MobEntity, and falling into the mob case would
// silently drop attribution (no XP, no kill credit, no participants). Its
// damage routes through PlayerTouches(the credited player) with the ACTING
// mob's own faction, position and output.
//
// ⛑ Credited, not Owned: a charmed mob is credited to its charmer while
// standing at its OWN level, and casterPowerScale below still reads Owned so
// the summon-only SummonPower knob stays off it (D2 / L-M).
// Reports whether the aura hit at least one target (D8).
func applyDamageAura(e skillEntity, level int, effect skills.EffectDef, collisions phy.ColliderSet, rng *rand.Rand) bool {
	if credited, ok := e.(model.Credited); ok && credited.CreditTo() != nil {
		// The acting mob rides along as the hit's Source: threat credits the
		// mob itself, XP the player (mob-depth chunk 3, gotcha #9).
		source, _ := e.(model.Combatant)
		return applyPlayerDamageAura(credited.CreditTo(), source, e.AuraCollider().Position(), level, effect, collisions, rng, casterPowerScale(e))
	}
	switch caster := e.(type) {
	case model.PlayerEntity:
		return applyPlayerDamageAura(caster, nil, e.AuraCollider().Position(), level, effect, collisions, rng, casterPowerScale(e))
	case model.MobEntity:
		return applyMobDamageAura(caster, e.AuraCollider().Position(), level, effect, collisions, rng)
	}
	return false
}

// outputScale is the caster's composed power scale (casterPowerScale, C0):
// f(character level) for a direct player cast, SummonPower × f(owner level)
// for an owned cast — it multiplies the damage amount only (never CC
// parameters).
// source is the summon entity on owned casts (threat attribution, chunk 3),
// nil on direct casts — the target then treats the caster as the source.
func applyPlayerDamageAura(caster model.PlayerEntity, source model.Combatant, casterPos phy.Vec2f, level int, effect skills.EffectDef, collisions phy.ColliderSet, rng *rand.Rand, outputScale float32) bool {
	// Declarative targeting: the sensor mask pre-filters layers, the faction
	// flags decide per target. targetsAllies=false is the no-friendly-fire
	// rule. No caster skip, matching the damage path's long-standing
	// semantics (heal and resist auras skip self explicitly; damage never
	// did — only relevant if content ever sets targetsAllies on damage).
	// The ACTING entity is the summon on owned casts (its all-others aggro
	// set keeps owned behavior identical) and the player on direct ones.
	var acting model.Factioned = caster
	if source != nil {
		acting = source
	}
	eligible := eligibleByTargetFlags[model.Interacter](effect, acting, 0, false)

	// F6 §3.1 steps 1–2: level-scaled base × summon power × berserker. The
	// ACTING entity's missing HP drives berserker (chunk-1 decision: a wounded
	// summon rages; the owner's HP is irrelevant — the §4.2 parallel).
	damageHP := effect.Damage.HPAt(level) * outputScale * berserkerMultiplier(effect.Damage, acting) * casterDamageFactor(acting)

	style := auraHitStyleFor(effect, level)
	critChance := effect.Damage.CritChanceAt(level) + casterCritChance(acting)
	// A live lifesteal_burst ADDS to the effect's authored leech rather than
	// replacing it, the critChance rule — an aura that already leeches leeches
	// more while the burst is up.
	lifesteal := effect.Damage.LifestealFraction + casterLifesteal(acting)
	targets := selectTargets(collisions, casterPos, effect.Selector, effectiveMaxTargets(effect, level), eligible)
	for _, c := range targets {
		// F6 §3.1 steps 3–5 per hit: execute × crit roll × variance roll; the
		// target's resistance then multiplies the rolled value (decision C3).
		hitHP, crit := rollHitDamage(damageHP, effect.Damage, c, rng, critChance)
		damage := model.Damage{HP: hitHP, Tags: effect.Damage.Tags, GateKey: effect.Damage.GateKey, Source: source, Lifesteal: lifesteal, Crit: crit}
		c.Shape().UserData.(model.Interacter).PlayerTouches(caster, damage)
		noteAuraHit(c, style)
	}
	// Dealing harm enters combat (chunk 1); direct casts only — a summon's hits
	// belong to the summon, not the owner (source != nil), so the owner does
	// not enter combat through its summon (consistent with attribution).
	if source == nil && len(targets) > 0 {
		noteHarmDealt(caster)
	}
	return len(targets) > 0
}

// applyMobDamageAura applies a mob's aura to the (mask-filtered) collision set
// via MobTouches. Factioned targets get the exact faction check (mob-depth
// chunk 6.6 — with masks spanning both combatant layers, a mob's sensor sees
// same-faction mobs, and skipping them BEFORE the cap keeps a pack mate from
// eating a nearest-1 slot); unfactioned structures stay reachable purely via
// the sensor mask (targetsStructures), NOT eligibleByTargetFlags, which would
// reject them. The Factors payload carries both damage values and each target
// picks the one that applies to it. Selector/cap ride on top.
func applyMobDamageAura(caster model.MobEntity, casterPos phy.Vec2f, level int, effect skills.EffectDef, collisions phy.ColliderSet, rng *rand.Rand) bool {
	// Same F6 §3.1 composition as the player path: base × tier scale (C0:
	// the mob's derived f(curveLevel)) × berserker (the caster's own missing
	// HP), then per-hit execute × crit × variance below.
	damageHP := effect.Damage.HPAt(level) * casterPowerScale(caster) * berserkerMultiplier(effect.Damage, caster) * casterDamageFactor(caster)
	factors := mobs.Factors{
		DamageTags:              effect.Damage.Tags,
		GateKey:                 effect.Damage.GateKey,
		StructureDamageFraction: effect.Damage.StructureDamageFraction,
		Lifesteal:               effect.Damage.LifestealFraction + casterLifesteal(caster),
	}

	casterFaction := caster.Faction()
	eligible := func(c phy.Collider) bool {
		usr := c.Shape().UserData
		if _, ok := usr.(model.Interacter); !ok {
			return false
		}
		if f, ok := usr.(model.Factioned); ok {
			if f.Faction() == casterFaction {
				return effect.TargetsAllies
			}
			return effect.TargetsEnemies && mayHarm(caster, f)
		}
		return true
	}

	style := auraHitStyleFor(effect, level)
	critChance := effect.Damage.CritChanceAt(level) + casterCritChance(caster)
	targets := selectTargets(collisions, casterPos, effect.Selector, effectiveMaxTargets(effect, level), eligible)
	for _, c := range targets {
		// Per-hit execute × crit × variance, same as the player path.
		factors.Damage, factors.Crit = rollHitDamage(damageHP, effect.Damage, c, rng, critChance)
		c.Shape().UserData.(model.Interacter).MobTouches(caster, factors)
		noteAuraHit(c, style)
	}
	return len(targets) > 0
}

// berserkerMultiplier reads the acting caster's health ratio only when
// berserker is authored (the ratio is a narrow assertion — every production
// caster has one; test doubles without it simply cast unenraged).
func berserkerMultiplier(d *skills.DamageParams, acting any) float32 {
	if d.BerserkerMaxBonusFactor == 0 {
		return 1
	}
	h, ok := acting.(healthRatioer)
	if !ok {
		return 1
	}
	return d.BerserkerMultiplier(h.HealthRatio())
}

// combatFactors is the game.combat block (backlog §25 B). It is package-level
// rather than a SkillSystem field because both readers below sit in FREE
// functions — applyDamageAura/applyMobDamageAura and their 58 in-package test
// call sites would all have to grow a parameter that is the same value
// everywhere. Set once at boot via SetCombatFactors, exactly like
// mob.SetHealthGainTick and mob.SeedProcess; the zero value left in tests and
// the sim harness resolves to the built-in defaults through the accessors, so
// those paths keep today's numbers with no wiring at all.
var combatFactors cfg.CombatConfig

// SetCombatFactors wires the game.combat knobs. Call once at server boot,
// before the loop starts; not safe to mutate concurrently with a running game.
func SetCombatFactors(c cfg.CombatConfig) { combatFactors = c }

// critFactor multiplies crits on effects without an authored critFactor
// (§4.3 v2, PO 2026-07-20). Authored factors win.
func critFactor() float32 { return combatFactors.CritFactor() }

// healerThreatFactor weights landed healing into threat (§6.3, decided
// 2026-07-10): a landed heal credits the healer with healedHP × factor on every
// mob currently in combat with the heal target.
func healerThreatFactor() float32 { return combatFactors.HealerThreat() }

// casterDamageFactor is the acting caster's outgoing-damage multiplier from
// the derived damageDealt stat (Strong, triage 2026-07-21): 1 + bonus. Like
// casterCritChance, the ACTING entity's own stats drive it — a summon never
// inherits its owner's passives. Applied at the damage base-composition sites
// (direct auras/instants and dot application), never to heals or CC.
func casterDamageFactor(acting any) float32 {
	if h, ok := acting.(interface {
		SkillComponent() *skills.SkillComponent
	}); ok {
		if sc := h.SkillComponent(); sc != nil {
			return sc.Derived.DamageFactor()
		}
	}
	return 1
}

// casterCritChance is the acting caster's own crit chance (§4.3 v2, PO
// 2026-07-20): the flat character base (players only — mobs and summons have
// none) plus the derived critChance stat from equipped passives. The effect's
// authored (level-scaled) chance adds on top at the apply sites. The ACTING
// entity's own stats drive vocabulary (the berserker precedent), so a summon
// never inherits its owner's base or stat. Non-skill test doubles simply roll
// unboosted.
func casterCritChance(acting any) float32 {
	var chance float32
	if p, ok := acting.(model.PlayerEntity); ok {
		if c := p.Config(); c != nil {
			chance = c.CritChance
		}
	}
	if h, ok := acting.(interface {
		SkillComponent() *skills.SkillComponent
	}); ok {
		if sc := h.SkillComponent(); sc != nil {
			chance += sc.Derived.CritChanceBonus
		}
	}
	return chance
}

// rollHitDamage composes one hit's final outgoing HP (F6 §3.1 steps 3–5):
// the application-level base (level-scaled × output × berserker) × the
// per-target execute bonus × the per-hit crit roll (§4.3: the one sanctioned,
// upside-only RNG), then the variance roll (C4). Targets without a health
// ratio (structures) take no execute bonus. critChance is the TOTAL per-hit
// chance — the effect's level-scaled authored chance plus casterCritChance,
// composed at the apply site. A crit multiplies by the effect's authored
// factor, or defaultCritFactor when none is authored, and always carries the
// Crit flag, so the client renders every crit identically. Zero chance/
// variance consume no RNG draw, so seeded sequences of crit-free casters
// running vocabulary-free effects are unchanged.
func rollHitDamage(base float32, d *skills.DamageParams, c phy.Collider, rng *rand.Rand, critChance float32) (hp float32, crit bool) {
	hp = base
	if d.ExecuteBonusFactor != 0 {
		if h, ok := c.Shape().UserData.(healthRatioer); ok {
			hp *= d.ExecuteMultiplier(h.HealthRatio())
		}
	}
	if critChance > 0 && rng.Float32() < critChance {
		crit = true
		factor := d.CritFactor
		if factor == 0 {
			factor = critFactor()
		}
		hp *= factor
	}
	return vitals.RollVariance(hp, d.Variance, rng), crit
}

// noteAuraHit stamps the per-tick aura-hit VFX style on a struck target if it
// supports it (item 11 Step 4). Targets that are not AuraHitNotifiers (e.g.
// resources/structures) simply get no hit VFX.
func noteAuraHit(c phy.Collider, style model.AuraHitStyle) {
	if n, ok := c.Shape().UserData.(model.AuraHitNotifier); ok {
		n.NoteAuraHit(style)
	}
}

func (s *SkillSystem) applyHealAura(e skillEntity, level int, effect skills.EffectDef, collisions phy.ColliderSet) bool {
	rng := s.rng
	// The heal amount rides the caster's power scale (C0). The SELF-COST used
	// to be computed here too; it moved to the dispatch loop with the rest of
	// the cost system (plan-numbers-rewrite D5) — the pricing, the never-kill
	// clamp and the "only when it landed" rule all came from this function and
	// are carried verbatim in skill_cost.go.
	powerScale := casterPowerScale(e)
	healCenterHP := effect.Heal.HPAt(level) * powerScale

	casterPos := e.AuraCollider().Position()
	casterFaction := e.Faction()
	casterID := e.Basic().ID()
	healedSomeone := false
	supportedEngagedAlly := false

	// Eligible = a wounded ally (same faction, Step 1) that isn't the caster;
	// the cap then counts only heal-worthy targets (never a slot wasted on a
	// full-health or self entry). Healable is the vitals abstraction (chunk 8):
	// players heal PlayerVitalSigns, mobs heal their own pool, both via Heal —
	// so a mob healer now reaches its wounded allies. Heal auras keep this
	// bespoke "implicit same-faction ally" predicate (they carry no
	// targetsAllies flag, unlike damage/resist/dot); the shared faction seam is
	// deliberately not routed through here.
	eligible := func(c phy.Collider) bool {
		other, ok := c.Shape().UserData.(model.Healable)
		if !ok {
			return false
		}
		if other.Faction() != casterFaction {
			return false
		}
		if other.Basic().ID() == casterID {
			return false // skip self
		}
		return other.HealthRatio() < 1 // wounded only
	}

	targets := selectTargets(collisions, casterPos, effect.Selector, effectiveMaxTargets(effect, level), eligible)
	for _, c := range targets {
		other := c.Shape().UserData.(model.Healable)
		// Percent-of-max heal (triage item 13): when a fraction is authored the
		// heal center is that fraction of the TARGET's max HP — a campfire
		// restores the same share of every pool, big or small. No power scale
		// (max HP already carries f(level), like the self_heal fraction branch).
		// A target without a MaxHealth (none in practice) heals nothing.
		centerHP := healCenterHP
		if effect.Heal.FractionOfMax > 0 {
			centerHP = 0
			if maxed, ok := other.(maxHealthed); ok {
				centerHP = effect.Heal.FractionAt(level) * float32(maxed.MaxHealth())
			}
		}
		// Heals roll per hit like damage does (item 11 Phase 3, decision C1).
		healHP := vitals.HP(vitals.RollVariance(centerHP, effect.Heal.Variance, rng))
		healed := other.Heal(healHP) // clamps at max, records the floating heal number

		if healed <= 0 {
			continue // fully healed between selection and application; not a hit
		}
		healedSomeone = true
		// Supporting an in-combat ally enters combat (chunk 1). Healing a safe
		// ally does not — attrition healing out of combat stays out of combat.
		if other.InCombat() {
			supportedEngagedAlly = true
		}

		// Participation XP (roadmap item 10) is a PLAYER concept: only a player
		// healing a player registers a recent healer. A mob healer — or a mob
		// being healed — never routes into player reward paths (gotcha #12).
		if healerPE, ok := e.(model.PlayerEntity); ok {
			if targetPE, ok := c.Shape().UserData.(model.PlayerEntity); ok {
				targetPE.NoteHealedBy(healerPE)
			}
		}

		// Healer threat (mob-depth chunk 3, §6.3): the actually-healed HP,
		// weighted, lands on every mob in combat with the heal target. Inert
		// for a mob healing an ally (no mob threatens an allied mob).
		if healer, ok := e.(model.Combatant); ok {
			s.creditHealerThreat(other.Basic().ID(), healer, float32(healed))
		}
	}

	// Supporting an ally already in combat puts the healer in combat too
	// (chunk 1); a mob healer is skipped by noteHarmDealt.
	if supportedEngagedAlly {
		noteHarmDealt(e)
	}

	// "Landed" for a heal is someone actually healed — not merely targeted.
	// The dispatch loop charges the self-cost off this.
	return healedSomeone
}

// applyHotAura re-applies the effect's heal-over-time buff to every wounded
// ally in range each aura tick (plan-skill-vocab §3.7, case 1). It is a thin
// applier — the actual healing, participation and healer threat happen later,
// when the buff ticks in tickHotEvents; unlike the heal aura this pays no
// self-cost (a build lever authored in step 6). The buff's authored duration
// outlasts the aura cadence, so it keeps ticking after the target leaves range.
// Reuses the heal aura's implicit same-faction, wounded-only, never-self
// predicate (no target flags).
//
// Reports whether at least one target received a genuinely NEW buff rather than
// a refresh (R2 / §5.2, the ApplyDot rule its payload is the twin of). It used
// to answer `len(targets) > 0`, which charged for an ally merely standing in
// range — the same proximity tax §3.2 found on shield and resist.
func applyHotAura(e skillEntity, source skills.SkillID, level int, effect skills.EffectDef, collisions phy.ColliderSet) bool {
	// Power scale frozen at application, the dot convention (C0).
	hp := effect.Hot.HPAt(level) * casterPowerScale(e)
	ticks := effect.Hot.DurationTicks()

	casterFaction := e.Faction()
	casterID := e.Basic().ID()
	eligible := func(c phy.Collider) bool {
		other, ok := c.Shape().UserData.(model.Healable)
		if !ok {
			return false
		}
		if other.Faction() != casterFaction {
			return false
		}
		// Applies regardless of current health — pre-hotting a target before
		// the damage arrives is legitimate support play (backlog §33, PO
		// 2026-07-31), and it is what instant_hot (Recover) has always done.
		// heal_aura keeps its wounded-only gate: there it is load-bearing
		// (selfDamageHP per healing tick, maxTargets 1), and Rejuvenation
		// authors neither, so the gate was inherited here, not designed.
		// A HoT on a full-HP ally is inert until they are hurt — tickHotEvents
		// drops any tick healing <= 0 before XP, threat and combat entry.
		return other.Basic().ID() != casterID // skip self — self-HoT is the instant_hot cooldown's job
	}

	targets := selectTargets(collisions, e.AuraCollider().Position(), effect.Selector, effectiveMaxTargets(effect, level), eligible)
	freshAny := false
	for _, c := range targets {
		usr := c.Shape().UserData
		if usr.(hotBuffable).ApplyHot(source, hotBuffFor(e, usr, hp, effect, level), ticks) {
			freshAny = true
		}
	}
	return freshAny
}

// maxHealthed is the target-side pool accessor every percent-of-max heal
// prices against: heal_aura's FractionOfMax and, since D14, the HoT's. A target
// without one (none in practice) heals nothing rather than a flat fallback —
// a silent full-pool guess would be worse than a visible zero.
type maxHealthed interface {
	MaxHealth() vitals.VitalSign
}

// hotBuffFor builds the heal-over-time buff ONE target receives. A
// fraction-of-max HoT resolves against that target's own pool at application
// time — the heal aura's percent branch convention (D14), and the reason the
// buff is built per target instead of once per application. No power scale on
// the fraction branch: max HP already carries f(level), so scaling again would
// double-inflate (the selfHealHP precedent).
func hotBuffFor(e skillEntity, target any, flatHP float32, effect skills.EffectDef, level int) skills.HotBuff {
	hp := flatHP
	if effect.Hot.FractionOfMax > 0 {
		hp = 0
		if maxed, ok := target.(maxHealthed); ok {
			hp = effect.Hot.FractionAt(level) * float32(maxed.MaxHealth())
		}
	}
	return skills.HotBuff{
		HP:       hp,
		Variance: effect.Hot.Variance,
		Interval: effect.Hot.Interval,
		Caster:   e,
	}
}

// threatReceiver is the mob-side crediting seam (concrete *mob.Mob; kept as a
// local interface so fakes can observe the credit in tests).
type threatReceiver interface {
	HasThreat(id uint64) bool
	TargetsEntity(id uint64) bool
	NoteThreat(source model.Combatant, amount float32)
}

// creditHealerThreat lands healer threat (§6.3): every tracked mob in combat
// with the heal target — its threat table holds the healed entity, OR its
// current aggro target IS the healed entity (sensor-acquired combat: a tank
// can hold aggro without ever damaging the mob) — credits the healer. Mobs
// not fighting the target never learn of the heal. Cost is O(entities) per
// heal event, on the heal aura's slow cadence.
//
// Structurally untargetable healers draw no threat (atmosphere & recovery
// chunk 2, §6.2 "aligned world fixtures never draw mob threat"): a healer
// whose main body sits on no combatant layer (the campfire's Viewport-only
// brazier trick) can never be reached by any aggro or damage mask — crediting
// it would park mobs on an unkillable target forever.
func (s *SkillSystem) creditHealerThreat(healedID uint64, healer model.Combatant, healedHP float32) {
	if healedHP <= 0 || !healerTargetable(healer) {
		return
	}
	amount := healedHP * healerThreatFactor()
	for _, e := range s.entities {
		if t, ok := e.(threatReceiver); ok && (t.HasThreat(healedID) || t.TargetsEntity(healedID)) {
			t.NoteThreat(healer, amount)
		}
	}
}

// healerTargetable reports whether a healer's main body can ever be reached
// by a mob: Bodies()[0] (the physical body by BaseEntity convention, the
// auraCanReach precedent) must sit on a combatant layer. Only PROVEN
// unreachability rejects — a healer without a physical body passes unchanged.
func healerTargetable(healer model.Combatant) bool {
	bodied, ok := healer.(model.BodiedEntity)
	if !ok {
		return true
	}
	bodies := bodied.Bodies()
	if len(bodies) == 0 {
		return true
	}
	return bodies[0].Shape().Layer&int(model.LayerCombatants) != 0
}

// resistBuffable is implemented by entities that can receive transient
// tag-resistance buffs from a resist_aura (mobs and players; item 11 Phase 2).
// Reports whether the application was genuinely new (R2 / §5.2) — what the
// aura cost path charges off.
type resistBuffable interface {
	ApplyResist(source skills.SkillID, tags []string, factor float32, ticks int) bool
}

// applyResistAura grants the effect's tag-resistance buff to eligible targets
// in range — and, with targetsSelf, to the caster (outside the target cap).
// The buff lifetime is the effect's tick interval + 1, so it always survives
// to the next re-application regardless of cadence, and fades roughly one
// aura cycle after leaving the aura (see skills.ResistBuffs).
//
// Reports whether the application did WORK — i.e. whether at least one target
// (the self-apply included) received a genuinely new buff rather than a refresh
// at the same factor (R2 / §5.2). It used to answer `hitAny || len(targets) > 0`,
// which made it charge for mere proximity, and — because targetsSelf set hitAny
// before the target set was even read — for standing alone in an empty field.
// ⚑ The instant twins deliberately keep the old rule: a COOLDOWN pays on cast,
// hit or whiff (D9), so §5.2 is a ruling about auras only.
func applyResistAura(e skillEntity, source skills.SkillID, level int, effect skills.EffectDef, collisions phy.ColliderSet) bool {
	factor := effect.Resist.FactorAt(level)
	ticks := effectiveTickInterval(effect, level) + 1

	freshAny := false
	if effect.Resist.TargetsSelf {
		if self, ok := e.(resistBuffable); ok {
			freshAny = self.ApplyResist(source, effect.Resist.Tags, factor, ticks)
		}
	}

	casterPos := e.AuraCollider().Position()
	casterID := e.Basic().ID()

	// The caster is never part of the in-range set (targetsSelf above is the
	// only self path).
	eligible := eligibleByTargetFlags[resistBuffable](effect, e, casterID, true)

	targets := selectTargets(collisions, casterPos, effect.Selector, effectiveMaxTargets(effect, level), eligible)
	for _, c := range targets {
		if c.Shape().UserData.(resistBuffable).ApplyResist(source, effect.Resist.Tags, factor, ticks) {
			freshAny = true
		}
	}
	return freshAny
}

// shieldBuffable is implemented by entities that can carry an absorb pool
// from a shield effect (players and mobs — the generic buff store;
// plan-skill-vocab chunk 2).
// Reports whether the pool was newly granted or a drained one restored (§5.2).
type shieldBuffable interface {
	ApplyShield(source skills.SkillID, hp float32, ticks int) bool
}

// applyShieldAura grants the effect's absorb pool to eligible targets in
// range — and, with targetsSelf, to the caster (outside the target cap).
// Support effect: ally-side eligibility only, no mayHarm involvement. The
// buff lifetime is the effect's tick interval + 1 (the aura convention), so
// staying in range keeps topping the pool up.
//
// Reports whether the application did WORK, the applyResistAura rule (R2 /
// §5.2) — but shield carries its own sustain signal: a pool NEWLY granted counts,
// and so does a refresh that replaced HP the target actually absorbed. A full
// pool topped up to full does not. So a shield aura keeps costing while it is
// being consumed and costs nothing while nothing is hitting the people under it.
func applyShieldAura(e skillEntity, source skills.SkillID, level int, effect skills.EffectDef, collisions phy.ColliderSet) bool {
	// The absorb pool is an HP value — it rides the caster's power scale (C0).
	hp := effect.Shield.HPAt(level) * casterPowerScale(e)
	ticks := effectiveTickInterval(effect, level) + 1

	freshAny := false
	if effect.Shield.TargetsSelf {
		if self, ok := e.(shieldBuffable); ok {
			freshAny = self.ApplyShield(source, hp, ticks)
		}
	}

	casterPos := e.AuraCollider().Position()
	casterID := e.Basic().ID()

	// The caster is never part of the in-range set (targetsSelf above is the
	// only self path).
	eligible := eligibleByTargetFlags[shieldBuffable](effect, e, casterID, true)

	targets := selectTargets(collisions, casterPos, effect.Selector, effectiveMaxTargets(effect, level), eligible)
	for _, c := range targets {
		if c.Shape().UserData.(shieldBuffable).ApplyShield(source, hp, ticks) {
			freshAny = true
		}
	}
	return freshAny
}

// instantQueryCircle builds the one-shot query circle every instant cooldown
// casts: the effect's level-scaled radius at the caster's aura position,
// masked by the effect's own target flags. Auras reuse their standing
// collider instead; this is the cooldown-only path.
func instantQueryCircle(e skillEntity, effect skills.EffectDef, level int) *phy.Circle {
	radius := skills.Scaled(effect.Radius, effect.RadiusPerLevel, level)
	query := phy.NewCircle(e.AuraCollider().Position(), radius)
	query.Shape().Mask = model.InstantDamageMask(effect)
	return query
}

// queryInstantTargets is instantQueryCircle plus the collision set every
// set-taking consumer wants: the raw hits minus the caster's own shapes.
//
// Eligibility is deliberately NOT applied here. It stays with each caller's
// eligibleByTargetFlags, which carries the capability type parameter this
// helper cannot know — and fireCooldown counts a non-empty set as a hit
// BEFORE eligibility runs, so filtering here would silently turn landed
// cooldowns into whiffs. Callers that pass skipCaster: true to
// eligibleByTargetFlags get the same caster exclusion twice over, harmlessly:
// selectTargets filters before it sorts and caps, so dropping the caster early
// cannot change which targets survive the cap.
func (s *SkillSystem) queryInstantTargets(e skillEntity, effect skills.EffectDef, level int) phy.ColliderSet {
	casterID := e.Basic().ID()
	hits := s.space.QueryCircle(instantQueryCircle(e, effect, level))
	targets := make(phy.ColliderSet, len(hits))
	for _, h := range hits {
		// Never hit the caster's own shapes (a self-targeting flag combo
		// would otherwise burst the caster).
		if usr, ok := h.Shape().UserData.(model.BasicEntity); ok && usr.Basic().ID() == casterID {
			continue
		}
		targets[h] = struct{}{}
	}
	return targets
}

// applyInstantShield fires an instant_shield cooldown (plan-skill-vocab
// chunk 2): the caster's pool on targetsSelf plus a one-shot query circle of
// eligible allies, each granted the pool with the effect's own authored
// lifetime (+1 to survive the tick boundary, the dot convention). The
// self-apply counts as a hit — a Barrier cast with nobody around is not a
// whiff.
//
// ⚑ Deliberately NOT swept up in R2's "pay for work done" rule (§5.2), which is
// a ruling about AURAS: a cooldown is a committed act and pays on cast, hit or
// whiff (D9). So ApplyShield's new-vs-restored answer is discarded here on
// purpose — re-casting Barrier on a full pool still costs.
func (s *SkillSystem) applyInstantShield(e skillEntity, source skills.SkillID, level int, effect skills.EffectDef) bool {
	// The absorb pool is an HP value — it rides the caster's power scale (C0).
	hp := effect.Shield.HPAt(level) * casterPowerScale(e)
	ticks := effect.Shield.DurationTicks + 1

	hitAny := false
	if effect.Shield.TargetsSelf {
		if self, ok := e.(shieldBuffable); ok {
			self.ApplyShield(source, hp, ticks)
			hitAny = true
		}
	}

	casterPos := e.AuraCollider().Position()
	eligible := eligibleByTargetFlags[shieldBuffable](effect, e, e.Basic().ID(), true)

	candidates := s.queryInstantTargets(e, effect, level)
	targets := selectTargets(candidates, casterPos, effect.Selector, effectiveMaxTargets(effect, level), eligible)
	for _, c := range targets {
		c.Shape().UserData.(shieldBuffable).ApplyShield(source, hp, ticks)
		hitAny = true
	}
	return hitAny
}

// applyInstantHot fires an instant_hot cooldown (plan-skill-vocab §3.7, cases
// 2 + 3), the applyInstantShield twin: the caster's own heal-over-time buff on
// targetsSelf plus a one-shot query circle of eligible allies (targetsAllies).
// The self-apply counts as a hit — a self-recovery cast with nobody around is
// not a whiff, and for the same D9 reason as its twin it keeps that rule
// through R2 (§5.2 rules auras, not cooldowns). Applies the buff regardless of the target's current health (a
// preemptive HoT is legitimate); the healing itself runs later in tickHotEvents.
func (s *SkillSystem) applyInstantHot(e skillEntity, source skills.SkillID, level int, effect skills.EffectDef) bool {
	// Power scale frozen at application, the dot convention (C0).
	hp := effect.Hot.HPAt(level) * casterPowerScale(e)
	ticks := effect.Hot.DurationTicks()

	hitAny := false
	if effect.Hot.TargetsSelf {
		if self, ok := e.(hotBuffable); ok {
			self.ApplyHot(source, hotBuffFor(e, e, hp, effect, level), ticks)
			hitAny = true
		}
	}

	casterPos := e.AuraCollider().Position()
	eligible := eligibleByTargetFlags[hotBuffable](effect, e, e.Basic().ID(), true)

	candidates := s.queryInstantTargets(e, effect, level)
	targets := selectTargets(candidates, casterPos, effect.Selector, effectiveMaxTargets(effect, level), eligible)
	for _, c := range targets {
		usr := c.Shape().UserData
		usr.(hotBuffable).ApplyHot(source, hotBuffFor(e, usr, hp, effect, level), ticks)
		hitAny = true
	}
	return hitAny
}

// slowable is implemented by entities whose movement can be slowed by a
// slow_aura (mobs). The slow is transient: it must be re-applied every tick
// the target stays in range, and wears off on its own shortly after (buff
// lifetime = effect tick interval + 1, the aura convention).
// Reports whether the application was genuinely new (R2 / §5.2).
type slowable interface {
	ApplySlow(source skills.SkillID, fraction float32, ticks int) bool
}

// processCooldowns ticks all cooldown slots down and fires cooldown skills:
// players fire on explicit activation requests (input path), mobs fire as
// soon as a cooldown is ready and a valid target is in range (decided 8.2 —
// simple AI; smarter timing belongs to boss scripting later).
func (s *SkillSystem) processCooldowns(e skillEntity, sc *skills.SkillComponent) {
	// Status effects are cleared and re-added every tick; keep the burst VFX
	// flag alive while any cooldown fired within the last burstVFXTicks.
	defer func() {
		se, ok := e.(model.StatusEntity)
		if !ok {
			return
		}
		for i, es := range sc.CooldownSlots {
			cd := sc.SlotCooldownRemaining(i)
			if es != nil && cd > 0 && es.EffectiveCooldownTicks()-cd < skills.BurstVFXTicks {
				se.StatusEffects().Add(model.StatusEffectBurstFired)
				return
			}
		}
	}()

	// Every running cooldown, slotted or not — a skill parked outside the
	// loadout keeps recovering.
	sc.TickCooldowns()

	if _, isMob := e.(model.MobEntity); isMob {
		for i, es := range sc.CooldownSlots {
			if es == nil || sc.SlotCooldownRemaining(i) > 0 {
				continue
			}
			// Only consume the cooldown when the burst actually hit something,
			// so the mob keeps it ready until a target wanders into range.
			if s.fireCooldown(e, es) {
				sc.StartCooldown(es)
			}
		}
		return
	}

	// Player path: explicit activations only. Firing into thin air consumes
	// the cooldown — aiming the burst is the player's responsibility. A skill
	// with authored cast time winds up first (chunk 4): fire AND
	// cooldown-consume both move to cast completion, so an interrupted cast
	// costs nothing but the risk window.
	s.advanceCast(e, sc)
	for _, slot := range sc.PendingCooldowns {
		es := sc.CooldownSlots[slot]
		if es == nil || sc.SlotCooldownRemaining(slot) > 0 {
			continue
		}
		if sc.IsCasting() {
			// Re-pressing the casting skill is ignored — spamming your own
			// key must not kill your cast. Any OTHER activation is a
			// deliberate act: it cancels the cast and then fires normally
			// (chunk-4 start decision, resolving §3.4 vs §3.5).
			if slot == sc.CastingSlot {
				continue
			}
			sc.CancelCast()
		}
		if reason := s.activationPrecondition(e, es); reason != model.ActivationRejectedNone {
			noteActivationRejected(e, es.Def.ID, reason)
			continue
		}
		if es.EffectiveCastTicks() > 0 {
			sc.StartCast(slot)
			continue
		}
		s.fireAndCharge(e, es)
	}
	sc.PendingCooldowns = sc.PendingCooldowns[:0]

	// Baseline utilities (plan-downtime.md C1): the same press rules as slot
	// activations — re-pressing the casting utility is ignored, any other
	// press cancels a running cast — but no cost and no cooldown (D7): the
	// interruptible wind-up is the entire brake.
	for _, kind := range sc.PendingUtilities {
		if sc.IsCasting() {
			if kind == sc.CastingUtility {
				continue
			}
			sc.CancelCast()
		}
		if reason := s.utilityPrecondition(e, kind); reason != model.ActivationRejectedNone {
			// A utility is no catalog skill: the id slot carries 0 and the
			// client renders the REASON alone (it never used the id).
			noteActivationRejected(e, 0, reason)
			continue
		}
		sc.StartUtilityCast(kind)
	}
	sc.PendingUtilities = sc.PendingUtilities[:0]
}

// advanceCast ticks a running cast down and fires it at zero. The
// precondition is re-checked at completion — the world moved during the
// wind-up (§3.5): failure rejects exactly like at activation, and since the
// cooldown is only consumed on a successful fire, "refund" is automatic.
func (s *SkillSystem) advanceCast(e skillEntity, sc *skills.SkillComponent) {
	if !sc.IsCasting() {
		return
	}
	// The utility branch first: during a utility cast CastingSkill() is nil
	// by construction (no slot is occupied), which the slot branch below
	// reads as "unequipped mid-cast" and would silently cancel.
	if ud := sc.CastingUtilityDef(); ud != nil {
		sc.CastTicksLeft--
		if sc.CastTicksLeft > 0 {
			return
		}
		sc.CancelCast()
		if reason := s.utilityPrecondition(e, ud.Kind); reason != model.ActivationRejectedNone {
			noteActivationRejected(e, 0, reason)
			return
		}
		s.fireUtility(e, ud.Kind)
		return
	}
	es := sc.CastingSkill()
	if es == nil {
		// The casting slot was unequipped mid-cast; nothing left to fire.
		sc.CancelCast()
		return
	}
	sc.CastTicksLeft--
	if sc.CastTicksLeft > 0 {
		return
	}
	sc.CancelCast()
	if reason := s.activationPrecondition(e, es); reason != model.ActivationRejectedNone {
		noteActivationRejected(e, es.Def.ID, reason)
		return
	}
	s.fireAndCharge(e, es)
}

// fireAndCharge fires a player cooldown, charges its resource cost and consumes
// the cooldown. The cost is priced BEFORE the fire (the L4 shape) and paid
// after it, hit or whiff: a cooldown is a committed act, so it pays on cast
// (D8) — unlike an aura, which pays only for what it landed. No clamp here on
// purpose; activationPrecondition has already guaranteed the caster survives
// the payment, and D9 rejects rather than discounts.
func (s *SkillSystem) fireAndCharge(e skillEntity, es *skills.EquippedSkill) {
	payer, cost := cooldownCostHP(e, es)
	s.fireCooldown(e, es)
	if payer != nil {
		chargeCost(payer, cost)
	}
	e.SkillComponent().StartCooldown(es)
}

// activationPrecondition checks the per-effect-type requirements a cooldown
// skill declares (§3.5): recall needs a bound campfire anchor; revive will
// need a corpse in range (chunk 3). Go checks per dispatch site, not a JSON
// DSL. Skills without preconditions keep the whiff-consume semantics
// verbatim — firing a NovaBurst into thin air stays the player's aim problem.
func (s *SkillSystem) activationPrecondition(e skillEntity, es *skills.EquippedSkill) model.ActivationRejection {
	// Affordability is the one precondition that is not per-effect-type: a
	// cooldown pays the SUM of its effects' costs, up front and always (D8), so
	// one it cannot pay for is refused here — nothing spent, no cooldown
	// started, feedback on the wire (D9). GDD §3 calls the silent-skip
	// alternative the wrong protection: an ability that quietly stops working
	// teaches nothing.
	if payer, cost := cooldownCostHP(e, es); payer != nil && !canAfford(payer, cost) {
		return model.ActivationRejectedNotEnoughResource
	}

	for _, effect := range es.Def.Effects {
		switch effect.Type {
		case skills.EffectTypeRecall:
			p, ok := e.(model.PlayerEntity)
			if !ok || s.connState == nil {
				// Mobs cannot recall; an unwired seam reads as nothing bound.
				return model.ActivationRejectedNoAnchor
			}
			if _, bound := s.connState.AnchorOf(p.Client().UUID()); !bound {
				return model.ActivationRejectedNoAnchor
			}
		case skills.EffectTypeRevive:
			// A revive with no corpse in range is a rejected activation, not a
			// whiff-consume (§3.6): no cooldown burned, feedback on the wire.
			if _, ok := s.nearestCorpseID(e, effect, es.Level); !ok {
				return model.ActivationRejectedNoTarget
			}
		}
	}
	return model.ActivationRejectedNone
}

// utilityPrecondition is activationPrecondition's baseline-utility twin
// (plan-downtime.md C1), checked at press AND at cast completion. No
// affordability arm — utilities are free by design (D7).
func (s *SkillSystem) utilityPrecondition(e skillEntity, kind skills.UtilityKind) model.ActivationRejection {
	switch kind {
	case skills.UtilityRecall:
		p, ok := e.(model.PlayerEntity)
		if !ok || s.connState == nil {
			// Mobs cannot recall; an unwired seam reads as nothing bound.
			return model.ActivationRejectedNoAnchor
		}
		if _, bound := s.connState.AnchorOf(p.Client().UUID()); !bound {
			return model.ActivationRejectedNoAnchor
		}
	}
	return model.ActivationRejectedNone
}

// fireUtility applies a completed baseline-utility cast. No cost is charged
// and no cooldown starts (D7) — completion IS the whole transaction.
func (s *SkillSystem) fireUtility(e skillEntity, kind skills.UtilityKind) {
	switch kind {
	case skills.UtilityRecall:
		s.applyRecall(e)
	}
}

// nearestCorpseID finds the closest player corpse within the revive effect's
// query circle (plan-skill-vocab §3.6). Corpses sit on the Viewport layer —
// their only layer — so the query uses a dedicated mask, not the target-flag
// masks. Reports the corpse entity ID and whether one was found.
func (s *SkillSystem) nearestCorpseID(e skillEntity, effect skills.EffectDef, level int) (uint64, bool) {
	radius := skills.Scaled(effect.Radius, effect.RadiusPerLevel, level)
	casterPos := e.AuraCollider().Position()
	query := phy.NewCircle(casterPos, radius)
	query.Shape().Mask = int(model.LayerViewportCollision)

	var bestID uint64
	var bestDist float32
	found := false
	for _, h := range s.space.QueryCircle(query) {
		corpse, ok := h.Shape().UserData.(model.CorpseEntity)
		if !ok {
			continue
		}
		d := casterPos.DistanceToSquared(h.Position())
		if !found || d < bestDist {
			found, bestDist, bestID = true, d, corpse.Basic().ID()
		}
	}
	return bestID, found
}

// applyRevive rebuilds the nearest downed player at their corpse (§3.6). The
// activation precondition guarantees a corpse at start AND cast completion, so
// a miss here is a benign race (respawned/disconnected in between), not a whiff.
func (s *SkillSystem) applyRevive(e skillEntity, effect skills.EffectDef, level int) bool {
	if s.connState == nil {
		return false
	}
	corpseID, ok := s.nearestCorpseID(e, effect, level)
	if !ok {
		return false
	}
	return s.connState.ReviveAtCorpse(corpseID, effect.Revive.HealthFraction)
}

// noteActivationRejected stamps the one-tick rejection feedback on players;
// mobs have no client to inform.
func noteActivationRejected(e skillEntity, id skills.SkillID, reason model.ActivationRejection) {
	if p, ok := e.(model.PlayerEntity); ok {
		p.NoteActivationRejected(id, reason)
	}
}

// fireCooldown applies a cooldown skill's effects: instant_damage via a
// temporary query circle at the caster's position, self_heal directly on the
// caster. Reports whether anything was affected.
func (s *SkillSystem) fireCooldown(e skillEntity, es *skills.EquippedSkill) bool {
	hitAny := false
	for _, effect := range es.Def.Effects {
		switch effect.Type {
		case skills.EffectTypeSelfHeal:
			// Needs player vitals — mobs cannot self-heal (same deliberate
			// limitation as heal_aura casting).
			caster, ok := e.(healCaster)
			if !ok {
				continue
			}
			healHP := vitals.HP(vitals.RollVariance(selfHealHP(effect.SelfHeal, es.Level, caster.MaxHealth(), casterPowerScale(e)), effect.SelfHeal.Variance, s.rng))
			vs := caster.VitalSigns()
			before := vs.Health
			vs.Health = vs.Health.AddCapped(healHP, caster.MaxHealth())
			// Floating heal number (item 11): the aura path records this via
			// NoteHealReceived; the self-heal cooldown must too. Only players
			// self-heal, so a PlayerEntity is the expected caster.
			if pe, ok := e.(model.PlayerEntity); ok {
				pe.NoteHealReceived(vs.Health - before)
			}
			hitAny = true

		case skills.EffectTypeSpawn:
			if s.spawnSummon(e, es, effect.Spawn) {
				hitAny = true
			}

		case skills.EffectTypeTaunt, skills.EffectTypeDetaunt:
			if s.applyThreatEffect(e, es.Level, effect) {
				hitAny = true
			}

		case skills.EffectTypeInstantShield:
			if s.applyInstantShield(e, es.Def.ID, es.Level, effect) {
				hitAny = true
			}

		case skills.EffectTypeCalm:
			if s.applyCalm(e, es.Def.ID, es.Level, effect) {
				hitAny = true
			}

		case skills.EffectTypeCharm:
			if s.applyCharm(e, es.Def.ID, es.Level, effect) {
				hitAny = true
			}

		case skills.EffectTypeRecall:
			if s.applyRecall(e) {
				hitAny = true
			}

		case skills.EffectTypeInstantHot:
			if s.applyInstantHot(e, es.Def.ID, es.Level, effect) {
				hitAny = true
			}

		case skills.EffectTypeRevive:
			if s.applyRevive(e, effect, es.Level) {
				hitAny = true
			}

		case skills.EffectTypeDash:
			if s.applyDash(e, effect, es.Level) {
				hitAny = true
			}

		case skills.EffectTypeTickRate:
			if s.applyTickRate(e, es.Def.ID, effect) {
				hitAny = true
			}

		case skills.EffectTypeSpeedBurst:
			if s.applySpeedBurst(e, es.Def.ID, es.Level, effect) {
				hitAny = true
			}

		case skills.EffectTypeLifestealBurst:
			if s.applyLifestealBurst(e, es.Def.ID, es.Level, effect) {
				hitAny = true
			}

		// The two instant damage paths share a query but not a dispatch. A
		// non-empty set counts as a hit BEFORE eligibility runs — the aura
		// appliers do their own target-flag filtering, and a cooldown that
		// found bodies is not a whiff even if none of them turn out eligible.
		case skills.EffectTypeInstantDamage:
			// Same dispatch and target-flag filtering as the per-tick auras —
			// PlayerTouches feeds participation XP, MobTouches the double
			// dispatch.
			if targets := s.queryInstantTargets(e, effect, es.Level); len(targets) > 0 {
				applyDamageAura(e, es.Level, effect, targets, s.rng)
				hitAny = true
			}

		case skills.EffectTypeInstantDot:
			if targets := s.queryInstantTargets(e, effect, es.Level); len(targets) > 0 {
				applyDotEffect(e, es.Def.ID, es.Level, effect, targets)
				hitAny = true
			}
		}
	}
	return hitAny
}

// applyRecall teleports the caster to their bound campfire anchor with the
// respawn jitter (chunk 4). The activation precondition guarantees an anchor
// at start AND completion, so a miss here is a benign race, not a whiff. The
// phy space rebuilds its dynamic grid every tick — a position jump needs no
// re-registration (the respawn precedent).
func (s *SkillSystem) applyRecall(e skillEntity) bool {
	p, ok := e.(model.PlayerEntity)
	if !ok || s.connState == nil {
		return false
	}
	anchor, bound := s.connState.AnchorOf(p.Client().UUID())
	if !bound {
		return false
	}
	p.SetPosition(jitterAround(anchor, respawnJitterRadius))
	return true
}

// applyDash displaces a player caster along their last movement direction up to
// the effect's (level-scaled) distance (plan-skill-vocab chunk 5). There is no
// swept-circle in phy, so a stepped probe marches the ray in radius-sized steps
// with QueryCircleStatics (mask PlayerStatic|Border — the summonPosition
// precedent) and stops at the last free point: cheap (≤ ~distance/radius
// one-shot queries), it cannot tunnel a blocking prop or poke past the border,
// and it naturally clamps to "dash up to the wall". Landing inside a mob body is
// fine — mobs are dynamic, so physics resolves the overlap next tick (the summon
// precedent). Mobs cannot dash in v1 (no last-movement seam); a non-player
// caster is a no-op.
func (s *SkillSystem) applyDash(e skillEntity, effect skills.EffectDef, level int) bool {
	p, ok := e.(model.PlayerEntity)
	if !ok || effect.Dash == nil {
		return false
	}
	dir := p.LastMoveDir()
	if dir == (phy.Vec2f{}) {
		// Never moved — no aim. Defensive: the player defaults to a unit vector.
		return false
	}
	dist := skills.Scaled(effect.Dash.Distance, effect.Dash.DistancePerLevel, level)
	if dist <= 0 {
		return false
	}

	start := e.AuraCollider().Position()
	step := p.Radius()
	if step <= 0 {
		// A zero-radius caster can't be probed; players always have a radius.
		return false
	}

	probe := phy.NewCircle(phy.VEC2F_ZERO, p.Radius())
	probe.Shape().Mask = int(model.LayerPlayerStaticCollision | model.LayerBorderCollision)

	landing := start
	for travelled := step; ; travelled += step {
		if travelled > dist {
			travelled = dist
		}
		candidate := start.Add(dir.Mult(travelled))
		probe.SetPosition(candidate)
		if len(s.space.QueryCircleStatics(probe)) != 0 {
			break // blocked: keep the last free point ("dash up to the wall")
		}
		landing = candidate
		if travelled >= dist {
			break // reached full distance in the clear
		}
	}

	p.SetPosition(landing)
	// A dash always "fires" (like spawn — no whiff); even a wall-flush zero-
	// distance dash consumes the cooldown by the player path's own rule.
	return true
}

// tickRateApplier is the self-buff capability for the haste / tick-slow cooldown
// (skill-vocab chunk 6). Players and mobs both implement it via their Buffs
// store, so mob content can carry a self-haste too.
type tickRateApplier interface {
	ApplyTickRate(source skills.SkillID, factor float32, ticks int)
}

// applyTickRate fires a tick_rate cooldown: a self-targeted haste / tick-slow.
// Unlike the other cooldowns there is no query circle — a tick_rate buff scales
// the CASTER's own aura cadence, so it applies straight to e for the authored
// duration. Always "fires" for a capable caster (no whiff — the buff lands even
// with no aura equipped, taking effect the moment one is switched on).
func (s *SkillSystem) applyTickRate(e skillEntity, source skills.SkillID, effect skills.EffectDef) bool {
	self, ok := e.(tickRateApplier)
	if !ok || effect.TickRate == nil {
		return false
	}
	self.ApplyTickRate(source, effect.TickRate.Factor, effect.TickRate.DurationTicks)
	return true
}

// speedApplier is the self-buff capability for the movement burst (Swift as a
// cooldown), the tickRateApplier twin. Players and mobs both implement it via
// their Buffs store, so mob content can carry a sprint too.
type speedApplier interface {
	ApplySpeed(source skills.SkillID, factor float32, ticks int)
}

// applySpeedBurst fires a speed_burst cooldown: a self-targeted movement-speed
// change. Like tick_rate there is no query circle — the buff scales the
// CASTER's own movement — but both halves scale with skill level, so they are
// floored here: a factor at or below unity would be a cast that did nothing (or
// slowed the caster it was meant to speed up), and a sub-1-tick duration would
// expire before the movement site ever read it.
func (s *SkillSystem) applySpeedBurst(e skillEntity, source skills.SkillID, level int, effect skills.EffectDef) bool {
	self, ok := e.(speedApplier)
	if !ok || effect.Speed == nil {
		return false
	}
	factor := skills.Scaled(effect.Speed.Factor, effect.Speed.FactorPerLevel, level)
	if factor <= 0 {
		return false
	}
	ticks := skills.Scaled(effect.Speed.DurationTicks, effect.Speed.DurationTicksPerLevel, level)
	if ticks < 1 {
		ticks = 1
	}
	self.ApplySpeed(source, factor, ticks)
	return true
}

// lifestealApplier is the self-buff capability for the damage-leech burst (R3 /
// §5.6), the speedApplier twin. Players and mobs both implement it via their
// Buffs store, so mob content can carry a leech burst too.
type lifestealApplier interface {
	ApplyLifesteal(source skills.SkillID, fraction float32, ticks int)
}

// applyLifestealBurst fires a lifesteal_burst cooldown: for a while, the
// caster's own hits leech. No query circle — like speed_burst it changes what
// the CASTER does rather than reaching anyone — and the scaled values are
// floored in the payload (FractionAt / TicksAt), because a zero leech is a cast
// that did nothing and a sub-1-tick buff expires before a hit can read it.
//
// ⚑ It reports true unconditionally once the entity can carry the buff, and that
// is D9, not sloppiness: a cooldown pays on cast, hit or whiff. Firing this with
// no enemy in sight still costs — you spent the cooldown.
func (s *SkillSystem) applyLifestealBurst(e skillEntity, source skills.SkillID, level int, effect skills.EffectDef) bool {
	self, ok := e.(lifestealApplier)
	if !ok || effect.Lifesteal == nil {
		return false
	}
	fraction := effect.Lifesteal.FractionAt(level)
	if fraction <= 0 {
		return false
	}
	self.ApplyLifesteal(source, fraction, effect.Lifesteal.TicksAt(level))
	return true
}

// casterLifesteal is the leech a live lifesteal_burst adds to every hit the
// caster lands, on top of whatever the firing effect authors — the
// casterCritChance shape, for the same reason: the value belongs to the caster's
// current state, not to the effect definition, so it has to be read at the
// moment the damage payload is built rather than baked into content.
func casterLifesteal(acting any) float32 {
	if h, ok := acting.(interface{ LifestealFraction() float32 }); ok {
		return h.LifestealFraction()
	}
	return 0
}

// threatManipulable is the taunt/detaunt capability (mob-depth chunk 7): a mob
// whose threat table can be forced-to-top (taunt) or have a single entry
// removed (detaunt). Every mob implements both; the two ops share this
// interface because both cooldowns target the same set (enemy mobs).
type threatManipulable interface {
	ForceThreatToTop(source model.Combatant, margin float32)
	DropThreat(id uint64)
}

// applyThreatEffect fires a taunt or detaunt cooldown (mob-depth chunk 7): a
// query circle of enemy mobs at the caster, each retargeted (taunt: forced to
// the top of its threat table by the caster's own threat, granting the mob
// harm rights for free via the chunk-6.6 MayHarm gate) or shed (detaunt: the
// caster's threat entry removed). Eligibility rides eligibleByTargetFlags so
// the faction/mayHarm gate applies — a player caster bypasses mayHarm and so
// reaches any different-faction mob; the player is the threat source. Scoped
// to player casts in v1 (attribution shortcut).
func (s *SkillSystem) applyThreatEffect(e skillEntity, level int, effect skills.EffectDef) bool {
	casterID := e.Basic().ID()
	source, _ := e.(model.Combatant)
	eligible := eligibleByTargetFlags[threatManipulable](effect, e, casterID, true)

	// Iterates the query slice rather than a ColliderSet on purpose: threat
	// manipulation is per-target and order-independent, and the slice's order
	// is deterministic where a map's is not.
	hitAny := false
	for _, h := range s.space.QueryCircle(instantQueryCircle(e, effect, level)) {
		if !eligible(h) {
			continue
		}
		target := h.Shape().UserData.(threatManipulable)
		switch effect.Type {
		case skills.EffectTypeTaunt:
			target.ForceThreatToTop(source, effect.Threat.Margin)
		case skills.EffectTypeDetaunt:
			target.DropThreat(casterID)
		}
		hitAny = true
	}
	return hitAny
}

// calmable is the calm capability (plan-faction-flips chunk 2): an entity with
// an AI that can be put out of combat. Only mobs implement it — a player has no
// acquisition loop to suspend, so calming one would be a pip over nothing.
// That makes the capability check in eligibleByTargetFlags the whole
// players-are-not-valid-targets rule; no extra guard is needed here.
type calmable interface {
	ApplyCalm(source skills.SkillID, ticks int)
}

// applyCalm fires a calm cooldown (plan-faction-flips chunk 2, D7): a query
// circle of eligible mobs, each dropped out of combat for the authored
// duration. Shaped like applyThreatEffect — the other targeted cooldown that
// changes AI state rather than health — with two deliberate differences:
//
//   - No selector or cap. Calm is a DISENGAGE tool and a pack aggros as a pack
//     (PO 2026-07-28), so it takes everything in the circle. That is also why
//     it does not route through selectTargets.
//   - The skill's faction allowlist narrows eligibility, applied inside
//     eligibleByTargetFlags along with the ordinary flag and mayHarm gates.
//
// Whiffs when the circle is empty, like every other targeted cooldown.
func (s *SkillSystem) applyCalm(e skillEntity, source skills.SkillID, level int, effect skills.EffectDef) bool {
	if effect.Calm == nil {
		return false
	}
	ticks := skills.Scaled(effect.Calm.DurationTicks, effect.Calm.DurationTicksPerLevel, level)
	if ticks < 1 {
		// A negative perLevel can scale the duration away entirely; one tick of
		// calm is still a cast that did something, and 0 would be a buff entry
		// that expires before it is ever read.
		ticks = 1
	}

	radius := skills.Scaled(effect.Radius, effect.RadiusPerLevel, level)
	query := phy.NewCircle(e.AuraCollider().Position(), radius)
	query.Shape().Mask = model.InstantDamageMask(effect)

	eligible := eligibleByTargetFlags[calmable](effect, e, e.Basic().ID(), true)

	hitAny := false
	for _, h := range s.space.QueryCircle(query) {
		if !eligible(h) {
			continue
		}
		h.Shape().UserData.(calmable).ApplyCalm(source, ticks)
		hitAny = true
	}
	return hitAny
}

// charmable is the charm capability (plan-faction-flips chunk 3): an entity
// whose allegiance can be flipped to the caster's side for a while. Only mobs
// implement it — a player has no authored faction to revert to — so the
// capability check in eligibleByTargetFlags is the whole
// players-are-not-valid-targets rule, exactly as it is for calm.
type charmable interface {
	Charm(by model.PlayerEntity, source skills.SkillID, ticks int)
}

// applyCharm fires a charm cooldown (plan-faction-flips chunk 3, D3/D8): a
// query circle whose NEAREST eligible mob joins the player side as a full
// companion for the authored duration. Shaped like applyCalm — the other
// targeted cooldown that changes AI state rather than health — with two
// deliberate differences:
//
//   - It goes through selectTargets. D3 makes charm a capped, nearest-first
//     pick because the GDD forbids target-clicking: positioning IS the
//     targeting, so "walk to the mob you want" has to be honoured exactly.
//   - A MOB caster whiffs. processCooldowns fires mob cooldowns as soon as they
//     are ready (the chunk-1 L-N lesson: that path is real even though no
//     content reaches it), and charm's whole payload is a PLAYER link —
//     attribution and the combat signals a pet follows. A mob has neither.
//
// D11 (an already-charmed mob is not a valid target) needs no check here: a
// charmed mob is player-aligned, so targetsEnemies rejects it, and its faction
// is no longer in any charm allowlist. Pinned by test, not by a branch.
func (s *SkillSystem) applyCharm(e skillEntity, source skills.SkillID, level int, effect skills.EffectDef) bool {
	if effect.Charm == nil {
		return false
	}
	charmer, ok := e.(model.PlayerEntity)
	if !ok {
		return false
	}
	ticks := skills.Scaled(effect.Charm.DurationTicks, effect.Charm.DurationTicksPerLevel, level)
	if ticks < 1 {
		// A negative perLevel can scale the duration away entirely; one tick of
		// charm still flips and reverts, which is at least honest — 0 would be a
		// buff entry that expires before Update ever polls it, leaving the mob
		// aligned forever.
		ticks = 1
	}

	radius := skills.Scaled(effect.Radius, effect.RadiusPerLevel, level)
	query := phy.NewCircle(e.AuraCollider().Position(), radius)
	query.Shape().Mask = model.InstantDamageMask(effect)

	hits := s.space.QueryCircle(query)
	candidates := make(phy.ColliderSet, len(hits))
	for _, h := range hits {
		candidates[h] = struct{}{}
	}
	eligible := eligibleByTargetFlags[charmable](effect, e, e.Basic().ID(), true)
	targets := selectTargets(candidates, e.AuraCollider().Position(), effect.Selector, effectiveMaxTargets(effect, level), eligible)

	for _, c := range targets {
		c.Shape().UserData.(charmable).Charm(charmer, source, ticks)
	}
	return len(targets) > 0
}

// Summon placement (mob-depth chunk 1, decision §8.4/6): offset from the
// caster so the spawn is instantly visible (never under the avatar), in a
// random direction, skipping spots blocked by static blockers or the world
// border. All numbers [PLACEHOLDER].
const (
	summonPlacementGap   float32 = 0.3 // clearance between caster and summon bodies
	summonPlacementTries         = 8
)

// spawnSummon fires a spawn effect: builds the referenced mob, aligns it with
// its caster, arms the TTL, applies the two scaling sources (summon-skill
// level → TTL + loadout level; owner player level → bonus HP + power), places
// it offset from the caster and hands it to the game. A spawn always counts
// as a hit — it has no whiff.
func (s *SkillSystem) spawnSummon(e skillEntity, es *skills.EquippedSkill, p *skills.SpawnParams) bool {
	def, err := s.game.Mobs().GetByName(p.MobName)
	if err != nil {
		// Unreachable for loaded content — mobs.RegistryFromFS hard-fails
		// unresolved spawnMob names at boot. Guards direct construction.
		log.Printf("spawn effect: mob %q not found", p.MobName)
		return false
	}

	m := mob.NewMob(def, s.game.Config().MobChaseIntoAuraMargin, s.space)
	// A summon fights on its summoner's side. For a player that is Align (the
	// player side, ungated harm rights); for a mob it is the caster's own
	// allegiance — faction AND reaction table together, which is the pair the
	// old SetFaction(e.Faction()) split (plan-faction-flips.md chunk 1). No mob
	// equips a spawn skill in shipped content today, but processCooldowns fires
	// mob cooldowns and the behaviour is pinned by test, so the path is real.
	if summoner, ok := e.(model.Allegiance); ok {
		m.EnlistUnder(summoner)
	} else {
		m.Align()
	}
	m.SetTTLTicks(p.TTLAt(es.Level))
	m.SkillComponent().RaiseLoadoutLevels(es.Level)
	if owner, ok := e.(model.PlayerEntity); ok {
		// Binding the owner IS the body scaling since chunk 1b: the summon's
		// Level becomes its owner's, so its pool is baseMaxHealth × f(owner
		// level) — the same rule every other actor's pool follows. It was a
		// flat per-owner-level HP bonus frozen at spawn; that knob is gone,
		// not moved (plan-entity-model.md §4, PO 2026-07-26). The fill is
		// needed because the pool only widens once the owner is bound.
		m.SetOwner(owner)
		m.RestoreToFullHealth()
		// The RATE, not the product (R5): binding the owner is the output
		// scaling exactly as it is the body scaling two lines up, so the
		// multiplier is evaluated against the owner's current level rather than
		// frozen at this instant.
		m.SetSummonPowerPerLevel(p.PowerPerOwnerLevel)
	}
	m.SetPosition(s.summonPosition(e, m.Radius()))
	s.game.AddEntity(m)
	return true
}

// summonPosition picks the summon's spawn point: up to summonPlacementTries
// random directions on the offset ring (caster radius + summon radius + gap);
// a candidate is blocked when the summon's body would overlap a blocking
// static or poke past the border wall (the InvAABB only intersects circles
// leaving the bounds, so the Border mask doubles as the in-bounds check).
// Everything blocked → the caster's position: visible beats unplaceable.
func (s *SkillSystem) summonPosition(e skillEntity, summonRadius float32) phy.Vec2f {
	casterPos := e.AuraCollider().Position()
	dist := summonRadius + summonPlacementGap
	if ent, ok := e.(model.Entity); ok {
		dist += ent.Radius()
	}

	probe := phy.NewCircle(phy.VEC2F_ZERO, summonRadius)
	probe.Shape().Mask = int(model.LayerPlayerStaticCollision | model.LayerBorderCollision)
	for try := 0; try < summonPlacementTries; try++ {
		angle := s.rng.Float64() * 2 * math.Pi
		offset := phy.Vec2f{X: float32(math.Cos(angle)), Y: float32(math.Sin(angle))}.Mult(dist)
		probe.SetPosition(casterPos.Add(offset))
		if len(s.space.QueryCircleStatics(probe)) == 0 {
			return probe.Position()
		}
	}
	return casterPos
}

// applySlowAura slows every eligible slowable target in range. Eligibility
// rides eligibleByTargetFlags like every other harmful effect, so the
// targetsAllies/targetsEnemies flags and the mayHarm hostility gate apply
// (backlog §25 C). Before that it iterated the raw collision set: the sensor
// mask is LayerCombatants, which does not discriminate by faction, so the
// targetsAllies:false authored on all three live slow skills was ignored and
// a player's slow also hit friendly NPCs and their own summons. The caster is
// not skipped — same-faction protection is the targetsAllies rule, matching
// applyDamageAura.
// Reports whether at least one target was NEWLY slowed (R2 / §5.2): re-applying
// the same fraction to a mob already slowed changes nothing but the expiry
// timer, so it is not work and is not charged. Combat entry below is a separate
// question and stays on "anyone slowed at all" — a refresh is still an act of
// hostility.
func applySlowAura(e skillEntity, source skills.SkillID, level int, effect skills.EffectDef, collisions phy.ColliderSet) bool {
	fraction := effect.Slow.FractionAt(level)
	if fraction <= 0 {
		return false
	}
	if fraction > 1 {
		fraction = 1
	}
	ticks := effectiveTickInterval(effect, level) + 1
	eligible := eligibleByTargetFlags[slowable](effect, e, 0, false)
	slowedAny := false
	freshAny := false
	for c := range collisions {
		if !eligible(c) {
			continue
		}
		if target, ok := c.Shape().UserData.(slowable); ok {
			if target.ApplySlow(source, fraction, ticks) {
				freshAny = true
			}
			slowedAny = true
		}
	}
	// CC'ing a hostile enters combat (chunk 1); a mob caster is skipped by
	// noteHarmDealt. The player TARGET of a slow would also enter combat, but
	// players carry no ApplySlow today (the get-CC'd direction stays inert —
	// §3.1), so only the caster side is stamped here.
	if slowedAny {
		noteHarmDealt(e)
	}
	return freshAny
}

// selfHealHP is the self_heal center amount in HP (pre-variance-roll): a
// fraction of the caster's max HP when FractionOfMax is set (the heal
// cooldown scales with max HP), otherwise the flat HealHP. The fraction grows
// by FractionOfMaxPerLevel (absolute) per level. Only the flat branch
// multiplies by the caster's power scale (C0) — max HP already carries
// f(level), so the fraction branch scaling again would double-inflate.
func selfHealHP(p *skills.SelfHealParams, level int, maxHP vitals.VitalSign, powerScale float32) float32 {
	if p.FractionOfMax > 0 {
		frac := skills.Scaled(p.FractionOfMax, p.FractionOfMaxPerLevel, level)
		return frac * float32(maxHP)
	}
	return skills.Scaled(p.HealHP, p.HealHPPerLevel, level) * powerScale
}

func (s *SkillSystem) Remove(e ecs.BasicEntity) {
	idx := minions.FindBasic(func(i int) model.BasicEntity { return s.entities[i] }, len(s.entities), e)
	if idx >= 0 {
		s.entities = append(s.entities[:idx], s.entities[idx+1:]...)
	}
}
