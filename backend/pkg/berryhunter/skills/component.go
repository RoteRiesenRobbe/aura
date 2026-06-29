package skills

// MaxAuraSlots, MaxPassiveSlots, MaxCooldownSlots are [PLACEHOLDER] — adjust during balancing.
const (
	MaxAuraSlots     = 4
	MaxPassiveSlots  = 4
	MaxCooldownSlots = 2
)

// EquippedSkill is one skill installed in a slot on a SkillComponent.
type EquippedSkill struct {
	Def   *SkillDefinition
	Level int

	// Collider holds a *phy.Circle for active_aura skills. It is stored as any
	// to avoid an import cycle: the skills package must remain importable by both
	// players and mobs without depending on the phy package. The concrete type is
	// always *phy.Circle. The entity sets this field after registering the physics
	// sensor with the world; the SkillSystem reads it (with a type assertion) each
	// tick to query collisions. Nil until the entity performs that registration.
	Collider any

	CdTicks         int // cooldown only: ticks remaining (0 = ready)
	TickAccumulator int // active_aura only: ticks since last effect application
}

// SkillComponent holds all skill slots and spellbook state for one entity.
// Attach it to players and mobs alike.
type SkillComponent struct {
	AuraSlots      [MaxAuraSlots]*EquippedSkill
	PassiveSlots   [MaxPassiveSlots]*EquippedSkill
	CooldownSlots  [MaxCooldownSlots]*EquippedSkill
	ActiveAuraSlot int              // index into AuraSlots; -1 = none active
	Spellbook      map[SkillID]bool // nil for mobs
}

// NewSkillComponent creates a SkillComponent with no skills equipped.
// Pass withSpellbook=true for players, false for mobs.
func NewSkillComponent(withSpellbook bool) *SkillComponent {
	var spellbook map[SkillID]bool
	if withSpellbook {
		spellbook = make(map[SkillID]bool)
	}
	return &SkillComponent{
		ActiveAuraSlot: -1,
		Spellbook:      spellbook,
	}
}

// EquipAura installs a skill into the given aura slot.
// Collider is left nil; the entity sets it after registering the physics sensor.
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

// Discover marks a skill as discovered in the spellbook. No-op for mobs (nil spellbook).
func (sc *SkillComponent) Discover(id SkillID) {
	if sc.Spellbook != nil {
		sc.Spellbook[id] = true
	}
}

// HasDiscovered reports whether a skill has been discovered. Always false for mobs.
func (sc *SkillComponent) HasDiscovered(id SkillID) bool {
	return sc.Spellbook[id]
}

// Discovered returns all discovered skill IDs. Returns nil for mobs.
func (sc *SkillComponent) Discovered() []SkillID {
	if len(sc.Spellbook) == 0 {
		return nil
	}
	ids := make([]SkillID, 0, len(sc.Spellbook))
	for id := range sc.Spellbook {
		ids = append(ids, id)
	}
	return ids
}
