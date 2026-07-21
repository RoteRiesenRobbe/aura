package player

import (
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
)

func (p *player) Update(dt float32) {
	// Aura effects are now applied by SkillSystem. Old calls removed in Phase 2.4.

	p.tickRecentHealers()

	if !p.isGod {
		p.updateVitalSigns(dt)
	}
}

// regenTaper scales the out-of-combat regen rate by character level: 1.0 at
// L1 falling linearly to 0.4 at max level [PLACEHOLDER floor]. The configured
// HealthGainTick (~1%/s FINAL, Session ③) is a fraction of maxHealth, so
// untapered the absolute rate inflates with the full ~27x HP curve — at high
// level that read as free sustain (C8 walkthrough, PO 2026-07-20).
func regenTaper(level, maxLevel int) float32 {
	if maxLevel <= 1 || level <= 1 {
		return 1.0
	}
	if level > maxLevel {
		level = maxLevel
	}
	return 1.0 - 0.6*float32(level-1)/float32(maxLevel-1)
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
		taper := regenTaper(int(p.progression.Level), p.config.LevelCurve.MaxLevel)
		p.healthRegen += float32(maxHP) * p.config.HealthGainTick * taper
		if p.healthRegen >= 1 {
			whole := uint32(p.healthRegen)
			p.healthRegen -= float32(whole)
			p.VitalSigns().Health = h.AddCapped(whole, maxHP)
		}
		p.statusEffects.Add(model.StatusEffectRegenerating)
	}
}
