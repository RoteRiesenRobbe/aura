package player

import (
	"github.com/trichner/berryhunter/pkg/berryhunter/model"
)

func (p *player) Update(dt float32) {
	// Aura effects are now applied by SkillSystem. Old calls removed in Phase 2.4.

	p.tickRecentHealers()

	if !p.isGod {
		p.updateVitalSigns(dt)
	}
}

func (p *player) updateVitalSigns(dt float32) {
	// Health is the single resource (Aura). Regenerate it out of combat, but
	// never from 0 — 0 is death, and reviving it before the death check runs
	// would undo one-shot kills (e.g. the KILL cheat).
	//
	// Combat gate (atmosphere & recovery chunk 1, GDD §3): no passive regen
	// while the recent-action window is open. Exit is purely time-gated
	// (ResetTickNumbers ages the window), so regen can resume while still being
	// chased — the deliberate WoW divergence.
	if p.InCombat() {
		return
	}
	maxHP := p.MaxHealth()
	if h := p.VitalSigns().Health; h != 0 && h != maxHP {
		// HealthGainTick is a fraction of maxHealth per tick; with integer HP
		// that is usually < 1, so accumulate and apply whole HP as it builds up.
		p.healthRegen += float32(maxHP) * p.config.HealthGainTick
		if p.healthRegen >= 1 {
			whole := uint32(p.healthRegen)
			p.healthRegen -= float32(whole)
			p.VitalSigns().Health = h.AddCapped(whole, maxHP)
		}
		p.statusEffects.Add(model.StatusEffectRegenerating)
	}
}
