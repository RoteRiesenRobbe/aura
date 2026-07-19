package main

// C8 guardrail asserts (plan-content-zones12.md §13 C8; deferred from
// plan-sim-harness.md §1/§9 until real mobs existed): the stand-still tier
// thresholds pinned against the REAL authored roster at each mob's home
// bracket. Decision ledger (PO 2026-07-19, C8 session):
//
//   - Scope: real hostile roster mobs only. Hazards/props, summons,
//     encounter internals, allies and flee-critters are exempt (curated list
//     below — a NEW mob is asserted by default and must be exempted
//     deliberately). Unarmed mobs (no damage/dot aura) are skipped: the sim
//     maps them to harmless turrets, facetank is not measurable.
//   - Normal tier: per-mob texture, NO per-mob ceiling. The assert is the
//     zone band-check: Z1 (cL1-4) and Z2 (cL5-7) must each offer at least
//     one soft (facetankable) and one hard (kills the bot) normal. The front
//     (cL18+) is exempt — elite/group territory by design, its normals are
//     support fodder. cL8-17 currently has no normals (the Z2→front gap).
//   - Elite: facetank chain survival ≤ 25% at home bracket.
//   - Boss: the facetank bot dies (survival < 5%); solo-kite viability is
//     NOT asserted (ProvingBoss ruling).
//
// Measured at the settled knobs (C8 regen/downtime settlement): default
// regen (~1%/s FINAL), downtime 10 s, 20 fights/chain, seeded — the numbers
// are deterministic, a failure means content moved, not luck.

import (
	"math"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/trichner/berryhunter/pkg/berryhunter/curve"
	"github.com/trichner/berryhunter/pkg/berryhunter/items/mobs"
	"github.com/trichner/berryhunter/pkg/berryhunter/sim"
)

const (
	guardrailFights   = 20
	guardrailDowntime = 10.0
	guardrailRuns     = 8
	guardrailSeed     = 1

	// The baseline bot's HP pool mirrors conf.default.json game.player
	// baseHealth; its weapon is the authored DamageAura at L1 (loaded from
	// content below, not hardcoded).
	guardrailBotBaseHP = 100
)

// guardrailExempt is the curated scope decision (PO 2026-07-19). Keys are
// mob names; values document why — shown when skipping.
var guardrailExempt = map[string]string{
	"Rabbit": "flee-critter/prey — flees, the stand-still bot cannot finish it",
	"Stag":   "flee-critter/prey — flees, the stand-still bot cannot finish it",
	"Dodo":   "prey critter (PO scope ruling)",

	"Companion":        "ally summon (CallForAid)",
	"SoldierCompanion": "ally summon (CallForAid)",
	"ArmySoldier":      "allied faction (human_army, friendlyToPlayers)",

	"Brazier":        "hazard prop",
	"PoisonPool":     "hazard prop",
	"SpikeBarricade": "gate hazard",
	"Totem":          "summon (SummonTotem)",

	"ProvingAdd":   "encounter internal (warlord proving)",
	"ProvingGuard": "encounter internal (warlord proving)",
}

// guardrailZone maps a normal mob's home bracket onto the band-check zone;
// "" = no band assert for that bracket (front exemption + the cL8-17 gap).
func guardrailZone(curveLevel int) string {
	switch {
	case curveLevel <= 4:
		return "Z1"
	case curveLevel <= 7:
		return "Z2"
	default:
		return ""
	}
}

// facetankSurvival runs the settled chain for one authored mob vs the
// baseline bot at the mob's home bracket and returns the facetank chain
// survival rate.
func facetankSurvival(t *testing.T, def *mobs.MobDefinition, botAura sim.AuraSpec) float64 {
	t.Helper()
	f := curve.Default().F(def.CurveLevel)
	bot := sim.PlayerSpec{
		MaxHealth: int(math.Round(guardrailBotBaseHP * f)),
		Aura:      botAura,
	}
	bot.Aura.DamageHP *= float32(f)

	rep := sim.RunChain(sim.ChainConfig{
		Player:          bot,
		Mob:             mobSpecOf(def),
		ChainFights:     guardrailFights,
		DowntimeSeconds: guardrailDowntime,
		BaseSeed:        guardrailSeed,
		Runs:            guardrailRuns,
	})
	return rep.Rows[0].Facetank.SurviveRate
}

func TestGuardrails_TierThresholdsVsRealRoster(t *testing.T) {
	defs, sr, err := loadContent("")
	require.NoError(t, err)

	dmgAura, err := sr.GetByName("DamageAura")
	require.NoError(t, err, "the baseline bot's weapon must exist in content")
	e, ok := firstDamageEffect(dmgAura)
	require.True(t, ok)
	botAura := auraSpecAt(e, 1, 1)

	// zone -> classified normals, for the band-check below.
	soft := map[string][]string{}
	hard := map[string][]string{}

	for _, def := range defs {
		if reason, exempt := guardrailExempt[def.Name]; exempt {
			t.Logf("skip %-18s %s", def.Name, reason)
			continue
		}
		if mobSpecOf(def).Aura.DamageHP == 0 {
			continue // unarmed — harmless-turret mapping, not measurable
		}

		surv := facetankSurvival(t, def, botAura)
		t.Logf("%-18s %-6s cL%-3d facetank survival %.0f%%", def.Name, def.Tier, def.CurveLevel, surv*100)

		switch def.Tier {
		case "elite":
			assert.LessOrEqual(t, surv, 0.25,
				"%s: elite facetank ceiling (≤25%% at home bracket cL%d)", def.Name, def.CurveLevel)
		case "boss":
			assert.Less(t, surv, 0.05,
				"%s: the boss must kill the facetank bot (cL%d)", def.Name, def.CurveLevel)
		default:
			zone := guardrailZone(def.CurveLevel)
			if zone == "" {
				continue
			}
			if surv >= 0.5 {
				soft[zone] = append(soft[zone], def.Name)
			} else {
				hard[zone] = append(hard[zone], def.Name)
			}
		}
	}

	for _, zone := range []string{"Z1", "Z2"} {
		assert.NotEmpty(t, soft[zone],
			"%s must offer at least one soft (facetankable) normal", zone)
		assert.NotEmpty(t, hard[zone],
			"%s must offer at least one hard (bot-killing) normal", zone)
		t.Logf("%s band: soft=%v hard=%v", zone, soft[zone], hard[zone])
	}
}
