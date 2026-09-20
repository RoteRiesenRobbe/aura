package model

import (
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/vitals"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

// Healable is the capability to receive a heal aura's restoration (mob-depth
// chunk 8). Players heal their PlayerVitalSigns.Health; mobs heal their own
// health pool — the split the heal aura was previously hard-coded around
// (PlayerEntity-only targets). Both types already satisfy Combatant, so Heal
// is the only genuinely new method: it clamps to the entity's max HP, records
// the hit event, and returns the HP actually restored (the healer-threat
// crediting rule reads the delta).
//
// ⚑ It takes a Healing rather than a bare uint32 since plan-skill-vfx.md C1
// (D9): a heal funnel that cannot name its caster or its skill cannot record an
// attributed event, and the heal paths are exactly where a forgotten wiring
// would go unnoticed.
type Healable interface {
	Combatant
	Heal(h Healing) vitals.VitalSign
}

// ApplyLifesteal heals a hit's recipient from the damage actually dealt
// (plan-skill-vocab chunk 1, F6 §3.1/9): recipient = the hit's living Source
// — an owned summon leeches for itself (§4.2, confirmed 2026-07-13) — else
// the toucher. dealt is the post-clamp loss, so overkill never counts. The
// heal rides Healable.Heal (max-clamp + hit event for free); it is
// damage-side sustain, not support — deliberately NO healer threat and no
// participation registration. A dead recipient is never healed (a leech-back
// must not revive an expired summon or a same-tick-killed caster). Called
// from all four *Touches damage entry points.
//
// id is the skill that dealt the hit, so the leech-back heal is attributed to
// the same skill as the damage that earned it (plan-skill-vfx.md §12a.2/5).
func ApplyLifesteal(dealt vitals.VitalSign, fraction float32, id skills.SkillID, source Combatant, toucher any) {
	if fraction <= 0 || dealt <= 0 {
		return
	}
	recipient, _ := source.(Healable)
	if recipient == nil || recipient.HealthRatio() == 0 {
		recipient, _ = toucher.(Healable)
	}
	if recipient == nil || recipient.HealthRatio() == 0 {
		return
	}
	// The leecher heals ITSELF, so it is its own caster.
	recipient.Heal(Healing{HP: vitals.HP(float32(dealt) * fraction), Caster: recipient, SkillID: id})
}
