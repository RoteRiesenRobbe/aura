package skills

import "slices"

// MaxAuraSlots, MaxPassiveSlots, MaxCooldownSlots are [PLACEHOLDER] — adjust during balancing.
const (
	MaxAuraSlots     = 4
	MaxPassiveSlots  = 4
	MaxCooldownSlots = 2
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

// EffectiveRadius is the level-scaled aura radius: the maximum over all
// effects of radius + (level-1)*radiusPerLevel. The maximum matters only for
// hypothetical multi-effect skills with differing radii — the single sensor
// must reach the largest one (effects with smaller radii would then need
// per-effect range checks; no such skill exists yet).
func (es *EquippedSkill) EffectiveRadius() float32 {
	var max float32
	for _, e := range es.Def.Effects {
		r := e.Radius + float32(es.Level-1)*e.RadiusPerLevel
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
		Spellbook:      spellbook,
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
