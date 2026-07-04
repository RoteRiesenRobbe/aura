package player

import (
	"github.com/trichner/berryhunter/pkg/berryhunter/model"
	"github.com/trichner/berryhunter/pkg/berryhunter/model/vitals"
)

func (p *player) Update(dt float32) {
	// Aura effects are now applied by SkillSystem. Old calls removed in Phase 2.4.

	// update time based tings

	// action
	if p.ongoingAction != nil {
		a := p.ongoingAction
		a.Update(dt)
		if a.TicksRemaining() < 0 {
			p.ongoingAction = nil
		}
	}

	p.tickRecentHealers()

	if !p.isGod {
		p.updateVitalSigns(dt)
	}
}

func (p *player) updateVitalSigns(dt float32) {
	// Health is the single resource (Aura). Regenerate it out of combat, but
	// never from 0 — 0 is death, and reviving it before the death check runs
	// would undo one-shot kills (e.g. the KILL cheat).
	if h := p.VitalSigns().Health; h != 0 && h != vitals.Max {
		p.addHealthFraction(p.config.HealthGainTick)
		p.statusEffects.Add(model.StatusEffectRegenerating)
	}
}

func (p *player) addHealthFraction(fraction float32) {
	h := p.VitalSigns().Health
	h = h.AddFraction(fraction)
	p.VitalSigns().Health = h
}
