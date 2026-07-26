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
type EquippedSkill struct {
	Def   *SkillDefinition
	Level int

	CdTicks         int // cooldown only: ticks remaining (0 = ready)
	TickAccumulator int // active_aura only: ticks since last effect application
}

// BurstVFXTicks is how long the burst VFX (BurstFired status effect + wire
// burst_radius) stays on after a cooldown fires — ~1.5 s [PLACEHOLDER].
// Derived from CdTicks, so no extra state is needed anywhere.
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

	// Casting state (plan-skill-vocab chunk 4): the cooldown slot currently
	// winding up (-1 = idle) and the ticks left until it fires. One cast at a
	// time; the cooldown is consumed only at successful completion. Player-only
	// in v1 — the mob fire path ignores cast time.
	CastingSlot   int
	CastTicksLeft int
}

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
	// DamageDealtBonus multiplies ALL outgoing damage of the acting entity
	// (direct hits and dots alike): base × (1 + bonus), applied at the
	// damage base-composition sites in sys (Strong, triage 2026-07-21).
	DamageDealtBonus float32
	// Resistances aggregates resist_passive effects into one tag → multiplier
	// source map (item 11 Phase 2): per tag, the product across equipped
	// passives (each passive is a distinct resist source). nil when no resist
	// passives are equipped. Fed to ResistMultiplier in takeDamage alongside
	// the transient resist buffs in the entity's Buffs store.
	Resistances map[string]float32
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

// IsCasting reports whether a cooldown skill is currently winding up.
func (sc *SkillComponent) IsCasting() bool {
	return sc.CastingSlot >= 0
}

// CastingSkill is the equipped skill in the casting slot; nil when idle.
func (sc *SkillComponent) CastingSkill() *EquippedSkill {
	if sc.CastingSlot < 0 || sc.CastingSlot >= MaxCooldownSlots {
		return nil
	}
	return sc.CooldownSlots[sc.CastingSlot]
}

// StartCast begins winding up the given cooldown slot for its effective cast
// time. Invalid or empty slots are ignored (client-supplied indices).
func (sc *SkillComponent) StartCast(slot int) {
	if slot < 0 || slot >= MaxCooldownSlots || sc.CooldownSlots[slot] == nil {
		return
	}
	sc.CastingSlot = slot
	sc.CastTicksLeft = sc.CooldownSlots[slot].EffectiveCastTicks()
}

// CancelCast aborts a running cast: no fire, no cooldown consumed — the risk
// window is the cost. No-op when idle.
func (sc *SkillComponent) CancelCast() {
	sc.CastingSlot = -1
	sc.CastTicksLeft = 0
}

// CancelCastOnDamage aborts a running cast only if the casting skill opted
// into the damage interrupt (castInterruptedByDamage — Recall-style; regular
// combat casts survive being hit). Called from the takeDamage choke point on
// dealt > 0, keeping the flag check out of player.go.
func (sc *SkillComponent) CancelCastOnDamage() {
	if es := sc.CastingSkill(); es != nil && es.Def.CastInterruptedByDamage {
		sc.CancelCast()
	}
}

// EquipAura installs a skill into the given aura slot.
func (sc *SkillComponent) EquipAura(slot int, def *SkillDefinition, level int) {
	sc.AuraSlots[slot] = &EquippedSkill{Def: def, Level: level}
}

// UnequipAura removes the skill from the given aura slot.
// If that slot was the active aura, ActiveAuraSlot is reset to -1.
func (sc *SkillComponent) UnequipAura(slot int) {
	sc.AuraSlots[slot] = nil
	if sc.ActiveAuraSlot == slot {
		sc.ActiveAuraSlot = -1
	}
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
	sc.recomputeDerived()
}

// UnequipPassive removes the skill from the given passive slot.
func (sc *SkillComponent) UnequipPassive(slot int) {
	sc.PassiveSlots[slot] = nil
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
}

// BurstRadius is the effective radius of the largest instant-AoE effect
// (instant_damage or instant_dot — e.g. Ignite) among cooldowns fired within
// the last `window` ticks; 0 = none. Serialized as the wire burst_radius so
// clients can draw the burst ring at its true size — for every entity,
// including mobs.
func (sc *SkillComponent) BurstRadius(window int) float32 {
	var max float32
	for _, es := range sc.CooldownSlots {
		if es == nil || es.CdTicks == 0 || es.EffectiveCooldownTicks()-es.CdTicks >= window {
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

func (sc *SkillComponent) setSkillLevel(id SkillID, level int) {
	sc.Spellbook[id] = level
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

// SpentPoints is the number of skill points bound in the spellbook. Derived,
// never stored: level 1 is free on discovery, so each skill binds level−1
// points (flat cost of 1 per level). Deriving makes free respec drift-proof.
func (sc *SkillComponent) SpentPoints() int {
	spent := 0
	for _, level := range sc.Spellbook {
		spent += level - 1
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
