package skills

import "slices"

// MaxAuraSlots, MaxPassiveSlots, MaxCooldownSlots: 3/3/3 per PO 2026-07-20
// (still [PLACEHOLDER] until marked final).
const (
	MaxAuraSlots     = 3
	MaxPassiveSlots  = 3
	MaxCooldownSlots = 3
)

// EquippedSkill is one skill installed in a slot on a SkillComponent.
//
// There is deliberately no per-skill physics collider: since exactly one aura
// is active at a time, each entity owns a single aura sensor that the
// SkillSystem resizes to the active skill's EffectiveRadius.
//
// ⚑ Remaining cooldown deliberately does NOT live here. It is keyed by skill
// on the component (see SkillComponent.cooldowns): a per-slot field is
// destroyed by unequip, so re-slotting minted a fresh, ready copy — the
// cooldown-refresh exploit.
type EquippedSkill struct {
	Def   *SkillDefinition
	Level int

	TickAccumulator int // active_aura only: ticks since last effect application
}

// BurstVFXTicks is how long the burst VFX (BurstFired status effect + wire
// burst_radius) stays on after a cooldown fires — ~1.5 s [PLACEHOLDER].
// Derived from the remaining cooldown, so no extra state is needed anywhere.
const BurstVFXTicks = 45

// EffectiveCooldownTicks is the level-scaled cooldown: base plus
// (level−1)×perLevel (negative perLevel = shorter at higher levels),
// floored at one tick.
func (es *EquippedSkill) EffectiveCooldownTicks() int {
	cd := Scaled(es.Def.CooldownTicks, es.Def.CooldownTicksPerLevel, es.Level)
	if cd < 1 {
		cd = 1
	}
	return cd
}

// EffectiveCastTicks is the level-scaled cast time, floored at zero —
// 0 = instant (the default for every skill without authored castTicks).
func (es *EquippedSkill) EffectiveCastTicks() int {
	ct := Scaled(es.Def.CastTicks, es.Def.CastTicksPerLevel, es.Level)
	if ct < 0 {
		ct = 0
	}
	return ct
}

// EffectiveRadius is the level-scaled combat aura radius: the maximum over
// all effects of radius + (level-1)*radiusPerLevel. The single sensor must
// reach the largest effect; smaller ones are narrowed per tick by the
// per-effect range check (sys.effectCollisions). light_aura is excluded —
// it is rendering-only and must size neither the sensor nor the aura_radius
// wire (its radius streams separately, see LightRadius).
func (es *EquippedSkill) EffectiveRadius() float32 {
	var max float32
	for _, e := range es.Def.Effects {
		if e.Type == EffectTypeLightAura {
			continue
		}
		r := Scaled(e.Radius, e.RadiusPerLevel, es.Level)
		if r > max {
			max = r
		}
	}
	return max
}

// LightRadius is the level-scaled light radius: the maximum over the skill's
// light_aura effects; 0 = the skill emits no light. Streams as the wire
// light_radius so the client can hole-punch the darkness overlay.
func (es *EquippedSkill) LightRadius() float32 {
	var max float32
	for _, e := range es.Def.Effects {
		if e.Type != EffectTypeLightAura {
			continue
		}
		r := Scaled(e.Radius, e.RadiusPerLevel, es.Level)
		if r > max {
			max = r
		}
	}
	return max
}

// SkillComponent holds all skill slots and spellbook state for one entity.
// Attach it to players and mobs alike.
type SkillComponent struct {
	AuraSlots      [MaxAuraSlots]*EquippedSkill
	PassiveSlots   [MaxPassiveSlots]*EquippedSkill
	CooldownSlots  [MaxCooldownSlots]*EquippedSkill
	ActiveAuraSlot int             // index into AuraSlots; -1 = none active
	Spellbook      map[SkillID]int // discovered skill → current level (≥ 1); nil for mobs

	// Derived is the sum of all stat_multiplier effects on equipped passives.
	// Recomputed on passive equip/unequip and on skill level changes — never
	// read config values are mutated (resolved Open Question 4).
	Derived DerivedStats

	// PendingCooldowns holds cooldown slot indices the owner requested to
	// activate. Filled at input time, consumed (and cleared) by the
	// SkillSystem in the same tick. Mobs don't use it — their AI fires
	// ready cooldowns directly.
	PendingCooldowns []int

	// cooldowns maps a skill to the ticks remaining until it is ready again;
	// an absent key means ready. Keyed by SkillID rather than by slot because
	// a cooldown belongs to the SKILL, not to the slot it happens to sit in:
	// with the counter on the EquippedSkill, unequipping destroyed it and
	// re-equipping minted a ready copy, so any cooldown could be reset by
	// re-slotting it between fights. Entries keep ticking down while the skill
	// is unslotted — parking a skill must not freeze its recovery.
	//
	// Lazily allocated (nil until the first cooldown fires) so a mob that
	// never fires one carries no map, mirroring Spellbook's nil-for-mobs shape.
	cooldowns map[SkillID]int

	// Casting state (plan-skill-vocab chunk 4): the cooldown slot currently
	// winding up (-1 = idle) and the ticks left until it fires. One cast at a
	// time; the cooldown is consumed only at successful completion. Player-only
	// in v1 — the mob fire path ignores cast time.
	CastingSlot   int
	CastTicksLeft int

	// CastingUtility is the baseline utility currently winding up (0 = none;
	// plan-downtime.md C1). It shares CastTicksLeft with the slot cast under
	// the one-cast-at-a-time rule — StartCast and StartUtilityCast each clear
	// the other, and CancelCast clears both, so every existing cancel site
	// (movement, aura switch, respawn) covers utilities with no new call.
	CastingUtility UtilityKind

	// PendingUtilities holds baseline-utility casts the owner requested,
	// mirroring PendingCooldowns: filled at input time, consumed (and
	// cleared) by the SkillSystem in the same tick.
	PendingUtilities []UtilityKind

	// revision counts changes to the PERSISTED half of this component — the
	// spellbook, the three slot arrays and the active aura index. Cast state,
	// cooldown timers and tick accumulators deliberately do not bump it.
	//
	// ⚑ It exists so the save path can notice a forced-save event
	// (plan-accounts-implementation.md §2 — "skill learned / spellbook change")
	// with ONE comparison per player per tick. The alternative, re-deriving
	// "did anything change" by walking the spellbook every tick, is a scan the
	// idle loop does not need; and a dirty flag someone has to remember to set
	// at each mutation site is exactly what this counter replaces, because the
	// bump lives beside the mutation.
	revision uint64
}

// Revision is the persisted-state change counter. See the field.
func (sc *SkillComponent) Revision() uint64 { return sc.revision }

// DerivedStats accumulates stat_multiplier bonuses from equipped passives.
// Bonuses are additive multipliers on the base value: effective = base × (1 + bonus).
// Per skill, the contribution is Scaled(StatBonus, StatBonusPerLevel, level);
// across skills and effects, contributions to the same stat stack linearly.
type DerivedStats struct {
	MovementSpeedBonus float32
	MaxHealthBonus     float32
	// DamageReductionBonus is subtractive: incoming damage × (1 − bonus),
	// applied in player.takeDamage.
	DamageReductionBonus float32
	// CritChanceBonus is additive crit CHANCE (not a multiplier) on every
	// outgoing direct hit of the acting entity, stacking with an effect's
	// authored critChance (§4.3 amendment, backlog §23). Applied in
	// sys.rollHitDamage; DoTs never crit.
	CritChanceBonus float32
	// CostReductionBonus is subtractive on the RESOURCE COST of an effect:
	// cost × (1 − bonus), applied in sys.effectCostHP (plan-numbers-rewrite
	// D13). The DamageReductionBonus shape, pointed at an input instead of an
	// output — this is the first stat that changes what an action costs rather
	// than what it does.
	CostReductionBonus float32
	// DamageDealtBonus multiplies ALL outgoing damage of the acting entity
	// (direct hits and dots alike): base × (1 + bonus), applied at the
	// damage base-composition sites in sys (Strong, triage 2026-07-21).
	DamageDealtBonus float32
	// RetaliateSlow is the resolved retaliate_slow payload — the first entry in
	// DerivedStats that is not a scalar, because it is the first passive with a
	// RUNTIME TRIGGER rather than an equip-time fold (plan-cc-and-retaliation.md
	// C2). Read at player.MobTouches, the one site both mob→player damage paths
	// funnel through. Zero value = no retaliate passive equipped.
	RetaliateSlow RetaliateSlow
	// Resistances aggregates resist_passive effects into one tag → multiplier
	// source map (item 11 Phase 2): per tag, the product across equipped
	// passives (each passive is a distinct resist source). nil when no resist
	// passives are equipped. Fed to ResistMultiplier in takeDamage alongside
	// the transient resist buffs in the entity's Buffs store.
	Resistances map[string]float32
}

// RetaliateSlow is one retaliate_slow passive, resolved to what the trigger
// site needs: how hard, how long, and from which skill.
//
// ⚑ Source is not decoration. Buffs.ApplySlow keys the buff stream by its
// SOURCE skill — omit it and every retaliate rides SkillID(0), sharing a stream
// with anything else that forgets. It is carried here because the trigger site
// (player.MobTouches) has the attacker and the damage, and no idea which
// passive granted the effect.
type RetaliateSlow struct {
	Source   SkillID
	Fraction float32
	Ticks    int
}

// The three factor methods below are THE application formula for the stat
// bonuses that every actor shares (plan-entity-model.md chunk 1a). Both
// *player and *Mob hold a *SkillComponent and call them from their own
// MaxHealth / takeDamage / movement sites — one formula, two callers, no
// entity-kind branch anywhere.
//
// Resistances deliberately has no factor method: a mob already carries
// authored base resistances, so composing them with a resist passive is a
// design call rather than a mechanical one — deferred until the first resist
// passive is authored (chunk 1a code audit).

// MaxHealthFactor is the multiplier a max-health passive puts on the base HP
// pool: base × (1 + bonus).
func (d DerivedStats) MaxHealthFactor() float32 {
	return 1 + d.MaxHealthBonus
}

// DamageReductionFactor is the multiplier a damage-reduction passive puts on
// incoming damage: damage × (1 − bonus). 100% reduction is the natural cap
// (clamped here, so no call site has to re-check it); a negative bonus cannot
// be authored, and would read as increased damage taken if it ever were.
func (d DerivedStats) DamageReductionFactor() float32 {
	r := d.DamageReductionBonus
	if r > 1 {
		r = 1
	}
	if r < 0 {
		r = 0
	}
	return 1 - r
}

// MovementSpeedFactor is the multiplier a movement-speed passive puts on the
// base per-tick step: base × (1 + bonus).
func (d DerivedStats) MovementSpeedFactor() float32 {
	return 1 + d.MovementSpeedBonus
}

// DamageFactor is the multiplier a damageDealt passive (Strong) puts on every
// point of damage the owner deals: base × (1 + bonus). The one place the
// 1+bonus composition is written — the damage sites and the wire both read it,
// so the tooltip cannot drift from what the server charges (round-7 item 5).
func (d DerivedStats) DamageFactor() float32 {
	return 1 + d.DamageDealtBonus
}

// CostFactor is the multiplier a cost-reduction passive puts on an effect's
// resource cost: cost × (1 − bonus). Clamped to [0, 1] like
// DamageReductionFactor, so a stacked build can reach free but never a refund,
// and no call site has to re-check it.
func (d DerivedStats) CostFactor() float32 {
	r := d.CostReductionBonus
	if r > 1 {
		r = 1
	}
	if r < 0 {
		r = 0
	}
	return 1 - r
}

// NewSkillComponent creates a SkillComponent with no skills equipped.
// Pass withSpellbook=true for players, false for mobs.
func NewSkillComponent(withSpellbook bool) *SkillComponent {
	var spellbook map[SkillID]int
	if withSpellbook {
		spellbook = make(map[SkillID]int)
	}
	return &SkillComponent{
		ActiveAuraSlot: -1,
		CastingSlot:    -1,
		Spellbook:      spellbook,
	}
}

// IsCasting reports whether a cooldown skill or a baseline utility is
// currently winding up.
func (sc *SkillComponent) IsCasting() bool {
	return sc.CastingSlot >= 0 || sc.CastingUtility != UtilityNone
}

// CastingSkill is the equipped skill in the casting slot; nil when idle.
func (sc *SkillComponent) CastingSkill() *EquippedSkill {
	if sc.CastingSlot < 0 || sc.CastingSlot >= MaxCooldownSlots {
		return nil
	}
	return sc.CooldownSlots[sc.CastingSlot]
}

// StartCast begins winding up the given cooldown slot for its effective cast
// time. Invalid or empty slots are ignored (client-supplied indices). A
// running utility cast is cancelled — one cast at a time.
func (sc *SkillComponent) StartCast(slot int) {
	if slot < 0 || slot >= MaxCooldownSlots || sc.CooldownSlots[slot] == nil {
		return
	}
	sc.CastingUtility = UtilityNone
	sc.CastingSlot = slot
	sc.CastTicksLeft = sc.CooldownSlots[slot].EffectiveCastTicks()
}

// StartUtilityCast begins winding up a baseline utility (plan-downtime.md
// C1). Unknown kinds are ignored (client-supplied values). A running slot
// cast is cancelled — one cast at a time.
func (sc *SkillComponent) StartUtilityCast(kind UtilityKind) {
	def := UtilityByKind(kind)
	if def == nil {
		return
	}
	sc.CastingSlot = -1
	sc.CastingUtility = kind
	sc.CastTicksLeft = def.CastTicks
}

// CastingUtilityDef is the definition of the utility currently winding up;
// nil when idle or when a slot cast is running.
func (sc *SkillComponent) CastingUtilityDef() *UtilityDef {
	return UtilityByKind(sc.CastingUtility)
}

// RequestUtilityCast queues a baseline-utility press, mirroring
// RequestCooldownActivation: filled at input time, consumed by the
// SkillSystem in the same tick. Unknown kinds are dropped here so the queue
// only ever holds resolvable work.
func (sc *SkillComponent) RequestUtilityCast(kind UtilityKind) {
	if UtilityByKind(kind) == nil {
		return
	}
	sc.PendingUtilities = append(sc.PendingUtilities, kind)
}

// CancelCast aborts a running cast — slot or utility: no fire, no cooldown
// consumed — the risk window is the cost. No-op when idle.
func (sc *SkillComponent) CancelCast() {
	sc.CastingSlot = -1
	sc.CastingUtility = UtilityNone
	sc.CastTicksLeft = 0
}

// CancelCastOnDamage aborts a running cast only if the casting skill or
// utility opted into the damage interrupt (castInterruptedByDamage —
// Recall-style; regular combat casts survive being hit). Called from the
// takeDamage choke point on dealt > 0, keeping the flag check out of
// player.go.
func (sc *SkillComponent) CancelCastOnDamage() {
	if es := sc.CastingSkill(); es != nil && es.Def.CastInterruptedByDamage {
		sc.CancelCast()
	}
	if ud := sc.CastingUtilityDef(); ud != nil && ud.CastInterruptedByDamage {
		sc.CancelCast()
	}
}

// EquipAura installs a skill into the given aura slot.
func (sc *SkillComponent) EquipAura(slot int, def *SkillDefinition, level int) {
	sc.AuraSlots[slot] = &EquippedSkill{Def: def, Level: level}
	sc.revision++
}

// UnequipAura removes the skill from the given aura slot.
// If that slot was the active aura, ActiveAuraSlot is reset to -1.
func (sc *SkillComponent) UnequipAura(slot int) {
	sc.AuraSlots[slot] = nil
	if sc.ActiveAuraSlot == slot {
		sc.ActiveAuraSlot = -1
	}
	sc.revision++
}

// EquipPassive installs a skill into the given passive slot. All equipped
// passives are active in parallel (unlike auras), so DerivedStats updates
// immediately.
//
// A passive may occupy only one slot: the same skill twice would stack its
// stat bonus, which is not intended (aura slots deliberately allow duplicates
// — only one aura is active at a time, so nothing stacks there). Equipping a
// passive that is already slotted elsewhere *moves* it: the old slot is
// cleared.
func (sc *SkillComponent) EquipPassive(slot int, def *SkillDefinition, level int) {
	for i, es := range sc.PassiveSlots {
		if i != slot && es != nil && es.Def.ID == def.ID {
			sc.PassiveSlots[i] = nil
		}
	}
	sc.PassiveSlots[slot] = &EquippedSkill{Def: def, Level: level}
	sc.revision++
	sc.recomputeDerived()
}

// UnequipPassive removes the skill from the given passive slot.
func (sc *SkillComponent) UnequipPassive(slot int) {
	sc.PassiveSlots[slot] = nil
	sc.revision++
	sc.recomputeDerived()
}

// EquipCooldown installs a skill into the given cooldown slot, ready to fire.
// Like passives, a cooldown may occupy only one slot — the same skill twice
// would be two independent charges. Equipping moves it: the old slot clears.
func (sc *SkillComponent) EquipCooldown(slot int, def *SkillDefinition, level int) {
	for i, es := range sc.CooldownSlots {
		if i != slot && es != nil && es.Def.ID == def.ID {
			sc.CooldownSlots[i] = nil
		}
	}
	sc.CooldownSlots[slot] = &EquippedSkill{Def: def, Level: level}
	sc.revision++
}

// CooldownRemaining is the ticks left until the given skill is ready to fire
// again; 0 = ready. Answers for any skill, slotted or not.
func (sc *SkillComponent) CooldownRemaining(id SkillID) int {
	return sc.cooldowns[id]
}

// SlotCooldownRemaining is CooldownRemaining for whatever occupies the given
// cooldown slot; 0 for an empty or out-of-range slot.
func (sc *SkillComponent) SlotCooldownRemaining(slot int) int {
	if slot < 0 || slot >= MaxCooldownSlots || sc.CooldownSlots[slot] == nil {
		return 0
	}
	return sc.cooldowns[sc.CooldownSlots[slot].Def.ID]
}

// SetCooldownRemaining puts a skill on cooldown for the given ticks; ≤ 0
// clears it (ready). Test/cheat seam — the fire path uses StartCooldown.
func (sc *SkillComponent) SetCooldownRemaining(id SkillID, ticks int) {
	if ticks <= 0 {
		delete(sc.cooldowns, id)
		return
	}
	if sc.cooldowns == nil {
		sc.cooldowns = make(map[SkillID]int, MaxCooldownSlots)
	}
	sc.cooldowns[id] = ticks
}

// StartCooldown puts the skill on its full level-scaled cooldown — what firing
// it consumes.
func (sc *SkillComponent) StartCooldown(es *EquippedSkill) {
	sc.SetCooldownRemaining(es.Def.ID, es.EffectiveCooldownTicks())
}

// TickCooldowns advances every running cooldown by one tick, dropping the ones
// that reach zero. Skill-keyed, so unslotted skills recover too.
func (sc *SkillComponent) TickCooldowns() {
	for id, ticks := range sc.cooldowns {
		if ticks <= 1 {
			delete(sc.cooldowns, id)
			continue
		}
		sc.cooldowns[id] = ticks - 1
	}
}

// BurstRadius is the effective radius of the largest instant-AoE effect
// (instant_damage or instant_dot — e.g. Ignite) among cooldowns fired within
// the last `window` ticks; 0 = none. Serialized as the wire burst_radius so
// clients can draw the burst ring at its true size — for every entity,
// including mobs.
func (sc *SkillComponent) BurstRadius(window int) float32 {
	var max float32
	for _, es := range sc.CooldownSlots {
		if es == nil {
			continue
		}
		cd := sc.cooldowns[es.Def.ID]
		if cd == 0 || es.EffectiveCooldownTicks()-cd >= window {
			continue
		}
		for _, e := range es.Def.Effects {
			if e.Type != EffectTypeInstantDamage && e.Type != EffectTypeInstantDot {
				continue
			}
			r := Scaled(e.Radius, e.RadiusPerLevel, es.Level)
			if r > max {
				max = r
			}
		}
	}
	return max
}

// RequestCooldownActivation queues a cooldown slot for activation; the
// SkillSystem fires it this tick if the slot is equipped and ready.
// Out-of-range indices (client-supplied) are dropped.
// RaiseLoadoutLevels raises every slotted skill to the given level where that
// is higher than its current one, clamped to each skill's own MaxLevel — an
// authored higher level is never lowered. Spawn-site consumer (mob-depth
// chunk 1): a summon's loadout follows the summon skill's level. Passive
// raises re-derive stats.
func (sc *SkillComponent) RaiseLoadoutLevels(level int) {
	raise := func(es *EquippedSkill) {
		l := level
		if es == nil || l <= es.Level {
			return
		}
		if l > es.Def.MaxLevel {
			l = es.Def.MaxLevel
		}
		if l > es.Level {
			es.Level = l
		}
	}
	for _, es := range sc.AuraSlots {
		raise(es)
	}
	for _, es := range sc.PassiveSlots {
		raise(es)
	}
	for _, es := range sc.CooldownSlots {
		raise(es)
	}
	sc.recomputeDerived()
}

func (sc *SkillComponent) RequestCooldownActivation(slot int) {
	if slot < 0 || slot >= MaxCooldownSlots {
		return
	}
	sc.PendingCooldowns = append(sc.PendingCooldowns, slot)
}

func (sc *SkillComponent) recomputeDerived() {
	var d DerivedStats
	for _, es := range sc.PassiveSlots {
		if es == nil {
			continue
		}
		for _, e := range es.Def.Effects {
			switch e.Type {
			case EffectTypeStatMultiplier:
				bonus := e.Stat.BonusAt(es.Level)
				switch e.Stat.Name {
				case StatMovementSpeed:
					d.MovementSpeedBonus += bonus
				case StatMaxHealth:
					d.MaxHealthBonus += bonus
				case StatDamageReduction:
					d.DamageReductionBonus += bonus
				case StatCritChance:
					d.CritChanceBonus += bonus
				case StatDamageDealt:
					d.DamageDealtBonus += bonus
				case StatCostReduction:
					d.CostReductionBonus += bonus
				}
			case EffectTypeRetaliateSlow:
				// Strongest wins, and it wins WHOLESALE — fraction, duration
				// and source all come from the same passive. Slows never stack
				// (Buffs.SlowFraction takes the strongest across every stream),
				// so picking a winner here rather than applying both is the
				// same outcome with one buff instead of two; taking the
				// strongest fraction but the longest duration would invent a
				// third passive neither one authors.
				fraction := e.Retaliate.FractionAt(es.Level)
				if fraction > d.RetaliateSlow.Fraction {
					d.RetaliateSlow = RetaliateSlow{
						Source:   es.Def.ID,
						Fraction: fraction,
						Ticks:    e.Retaliate.TicksAt(es.Level),
					}
				}
			case EffectTypeResistPassive:
				// Level scaling mirrors the aura fields (FactorAt: base +
				// (L−1)×perLevel, floored at 0); per tag the factors of
				// distinct passives multiply.
				factor := e.Resist.FactorAt(es.Level)
				if d.Resistances == nil {
					d.Resistances = make(map[string]float32, len(e.Resist.Tags))
				}
				for _, tag := range e.Resist.Tags {
					current, ok := d.Resistances[tag]
					if !ok {
						current = 1
					}
					d.Resistances[tag] = current * factor
				}
			}
		}
	}
	sc.Derived = d
}

// SetActiveAura switches which aura slot is active and resets that slot's
// TickAccumulator to 0. This prevents a rapid-switch DPS exploit where alternating
// auras would apply effects faster than their tick interval allows. Out-of-range
// slots (other than -1) are ignored. Pass -1 to deactivate all auras.
func (sc *SkillComponent) SetActiveAura(slot int) {
	if slot < -1 || slot >= MaxAuraSlots {
		return
	}
	sc.ActiveAuraSlot = slot
	sc.revision++
	if slot >= 0 && sc.AuraSlots[slot] != nil {
		sc.AuraSlots[slot].TickAccumulator = 0
	}
}

// LightRadius is the entity's total emitted light: the maximum over the
// AuraCategories is the ring-colour bitmask of the active aura, 0 while none is
// active (triage item 7). Serialized as aura_category on both Character and Mob,
// so players and mobs share one colour language.
//
// Active aura only — passives are always on but draw no ring, so folding them in
// would colour the ring by a skill the player cannot see the radius of.
func (sc *SkillComponent) AuraCategories() AuraCategory {
	slot := sc.ActiveAuraSlot
	if slot < 0 || sc.AuraSlots[slot] == nil {
		return AuraCategoryNone
	}
	return AuraCategoriesOf(sc.AuraSlots[slot].Def.Effects)
}

// active aura's light and every equipped passive's light (content pass C2
// lift 2 — passives are always on, so a light passive like Torch glows while
// a combat aura holds the one active slot; GDD §7 trade-off). Max, not sum —
// light sources overlap, they don't amplify. 0 = no light.
func (sc *SkillComponent) LightRadius() float32 {
	var max float32
	if slot := sc.ActiveAuraSlot; slot >= 0 && sc.AuraSlots[slot] != nil {
		max = sc.AuraSlots[slot].LightRadius()
	}
	for _, es := range sc.PassiveSlots {
		if es == nil {
			continue
		}
		if r := es.LightRadius(); r > max {
			max = r
		}
	}
	return max
}

// Discover marks a skill as discovered at level 1. Re-discovering (idempotent
// kill unlocks, milestone replays) never downgrades an already-raised level.
// No-op for mobs (nil spellbook).
func (sc *SkillComponent) Discover(id SkillID) {
	if sc.Spellbook != nil && sc.Spellbook[id] == 0 {
		sc.Spellbook[id] = 1
		sc.revision++
	}
}

// HasDiscovered reports whether a skill has been discovered. Always false for mobs.
func (sc *SkillComponent) HasDiscovered(id SkillID) bool {
	return sc.Spellbook[id] > 0
}

// SkillLevel returns the spellbook level of a skill; 0 = not discovered.
func (sc *SkillComponent) SkillLevel(id SkillID) int {
	return sc.Spellbook[id]
}

// RaiseSkillLevel spends one skill point: the skill's spellbook level rises by
// one, capped at the definition's MaxLevel, and every equipped instance is
// synced. It does NOT check point availability — that needs the player level
// and is the caller's job. Returns false if nothing changed.
func (sc *SkillComponent) RaiseSkillLevel(def *SkillDefinition) bool {
	level := sc.Spellbook[def.ID]
	if level == 0 || level >= def.MaxLevel {
		return false
	}
	sc.setSkillLevel(def.ID, level+1)
	return true
}

// LowerSkillLevel refunds one skill point (free respec): the skill's spellbook
// level drops by one, floored at 1 (discovery level is never refundable), and
// every equipped instance is synced. Returns false if nothing changed.
func (sc *SkillComponent) LowerSkillLevel(def *SkillDefinition) bool {
	level := sc.Spellbook[def.ID]
	if level <= 1 {
		return false
	}
	sc.setSkillLevel(def.ID, level-1)
	return true
}

// ResetSkillLevels returns every discovered skill to level 1 in one step —
// the whole-book respec (round-7 item 8). Level 1 is the discovery floor
// (LowerSkillLevel's own rule), so the milestone-seeded free baseline
// survives by construction; equipped instances and derived stats follow via
// setSkillLevel. The refund needs no point arithmetic at all: SpentPoints is
// derived from the spellbook, which is exactly what made free respec
// drift-proof.
func (sc *SkillComponent) ResetSkillLevels() {
	for id, level := range sc.Spellbook {
		if level > 1 {
			sc.setSkillLevel(id, 1)
		}
	}
}

func (sc *SkillComponent) setSkillLevel(id SkillID, level int) {
	sc.Spellbook[id] = level
	sc.revision++
	for _, slots := range [][]*EquippedSkill{sc.AuraSlots[:], sc.PassiveSlots[:], sc.CooldownSlots[:]} {
		for _, es := range slots {
			if es != nil && es.Def.ID == id {
				es.Level = level
			}
		}
	}
	// Passive stat bonuses scale with level; keep them in sync (free respec
	// means level drops arrive here too).
	sc.recomputeDerived()
}

// PointCost is what BUYING the given level of a skill costs in skill points
// (plan-numbers-rewrite D10): the first half of a skill's levels cost 1 point
// each, the third quarter 2, the last quarter 3, rounding up where the quarters
// do not divide evenly. maxLevel 10 → L2–5 cost 1, L6–8 cost 2, L9–10 cost 3
// (16 points to max); maxLevel 5 → 7 points to max; maxLevel 1 → 0.
//
// The curve is relative to each skill's OWN cap rather than to an absolute
// level number, so it survives backlog §37 later moving a cap — a 5-cap skill
// promoted to 10 re-prices itself instead of needing a new table.
//
// Level 1 is free on unlock (PO 2026-07-31): a skill arrives in the spellbook
// at level 1 having cost nothing, and the first purchased level is 2. That is
// load-bearing for the free floor (D6) — every discovered skill is usable
// before any investment.
//
// ⚑ Every number here is [PLACEHOLDER], the quarter thresholds included.
func PointCost(maxLevel, level int) int {
	if level <= 1 || level > maxLevel {
		return 0
	}
	if level <= ceilDiv(maxLevel, 2) {
		return 1
	}
	if level <= ceilDiv(3*maxLevel, 4) {
		return 2
	}
	return 3
}

// BoundPoints is the total a skill standing at `level` has cost: the sum of
// every purchased level's PointCost.
func BoundPoints(maxLevel, level int) int {
	total := 0
	for l := 2; l <= level; l++ {
		total += PointCost(maxLevel, l)
	}
	return total
}

func ceilDiv(a, b int) int { return (a + b - 1) / b }

// SpentPoints is the number of skill points bound in the spellbook. Derived,
// never stored — deriving makes free respec drift-proof.
//
// The registry parameter is what D10's cap-relative curve costs (L1): the
// spellbook is SkillID → level with no definition pointers, and the cost of a
// level now depends on where that level sits inside the skill's own cap.
func (sc *SkillComponent) SpentPoints(defs Registry) int {
	spent := 0
	for id, level := range sc.Spellbook {
		maxLevel := level
		if def, err := defs.Get(id); err == nil {
			maxLevel = def.MaxLevel
		}
		// An unresolvable spellbook entry cannot happen with a loaded registry
		// (every key came from one). Pricing it against its own level as the
		// cap is the harshest reading, so the failure mode is a point the
		// player cannot spend rather than a free one they can.
		spent += BoundPoints(maxLevel, level)
	}
	return spent
}

// TotalSkillPoints is the point budget a player of the given level has earned:
// (level−1) × pointsPerLevel. Derived from the level rather than awarded per
// level-up event, so budgets are retroactive and cannot drift under respec.
func TotalSkillPoints(playerLevel uint32, pointsPerLevel int) int {
	if playerLevel < 1 {
		return 0
	}
	return int(playerLevel-1) * pointsPerLevel
}

// Discovered returns all discovered skill IDs in ascending order. Returns nil for mobs.
func (sc *SkillComponent) Discovered() []SkillID {
	if len(sc.Spellbook) == 0 {
		return nil
	}
	ids := make([]SkillID, 0, len(sc.Spellbook))
	for id := range sc.Spellbook {
		ids = append(ids, id)
	}
	slices.Sort(ids)
	return ids
}
