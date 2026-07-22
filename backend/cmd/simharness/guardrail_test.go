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
//     zone band-check: Z1 (cL1-4), Z2 (cL5-7) and the cL8-17 farm band must
//     each offer at least one soft (facetankable) and one hard (kills the
//     bot) normal. The front (cL18+) is exempt — elite/group territory by
//     design, its normals are support fodder. (The farm band joined with
//     its first normals, Z2-hardening pre-chunk PO 2026-07-21.)
//   - Elite: facetank chain survival ≤ 25% at home bracket.
//   - Boss: the facetank bot dies (survival < 5%); solo-kite viability is
//     NOT asserted (ProvingBoss ruling).
//
// Measured at the settled knobs (C8 regen/downtime settlement): default
// regen (~1%/s FINAL), downtime 10 s, 20 fights/chain, seeded — the numbers
// are deterministic, a failure means content moved, not luck.

import (
	"math"
	"strconv"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/curve"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/sim"
)

const (
	guardrailFights   = 20
	guardrailDowntime = 10.0
	guardrailRuns     = 8
	guardrailSeed     = 1

	// The baseline bot's HP pool mirrors conf.default.json game.player
	// baseHealth; its weapon is the authored Damage at L1 (loaded from
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
// "" = no band assert for that bracket (front exemption, cL18+). The cL8-17
// farm band joined the check with its first normals (Z2-hardening pre-chunk,
// PO 2026-07-21).
func guardrailZone(curveLevel int) string {
	switch {
	case curveLevel <= 4:
		return "Z1"
	case curveLevel <= 7:
		return "Z2"
	case curveLevel <= 17:
		return "farm"
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

	mobSpec, err := mobSpecOf(def)
	require.NoError(t, err)

	rep := sim.RunChain(sim.ChainConfig{
		Player:          bot,
		Mob:             mobSpec,
		ChainFights:     guardrailFights,
		DowntimeSeconds: guardrailDowntime,
		BaseSeed:        guardrailSeed,
		Runs:            guardrailRuns,
	})
	return rep.Rows[0].Facetank.SurviveRate
}

// sustainedEVPerTick is a preset's steady-state expected damage per game
// tick across all its targets: crit EV on the direct hit at the aura cadence,
// plus the dot at its own cadence (refresh sustains one event per
// DotTickInterval per target, and dots carry no crit). An aura with both
// payloads — GiantVenomSpit's bite+venom — contributes both.
func sustainedEVPerTick(s sim.AuraSpec) float64 {
	var perTick float64

	if s.HasDirect() {
		ev := float64(s.DamageHP)
		if s.CritChance > 0 {
			ev *= 1 + float64(s.CritChance)*(float64(s.CritFactor)-1)
		}
		perTick += ev / float64(max(s.TickInterval, 1)) * float64(max(s.MaxTargets, 1))
	}
	if s.DotTicks > 0 {
		perTick += float64(s.DotPayloadHP()) / float64(max(s.DotTickInterval, 1)) *
			float64(max(s.DotTargetCap(), 1))
	}

	return perTick
}

// TestGuardrails_CeilingOrdering pins the §A power-ceiling calibration
// (C8, PO-read 2026-07-19): the Front-Aura (Vanguard) and its combos
// (Spearhead, Warbanner) are the sanctioned power outliers — at max level,
// every non-ceiling damage preset's sustained EV/tick must stay below every
// ceiling ref, and Spearhead is the single damage-axis top. Arithmetic over
// the served presets — content drift that outdamages the ceiling fails here
// before it surprises anyone (§A "never a surprise").
func TestGuardrails_CeilingOrdering(t *testing.T) {
	_, presets, err := loadPresets("")
	require.NoError(t, err)

	ceiling := map[string]bool{"Spearhead": true, "Warbanner": true, "Vanguard": true}

	// keep each skill's highest-level entry ("Name L<k>" convention)
	type entry struct {
		level int
		spec  sim.AuraSpec
	}
	maxed := map[string]entry{}
	for _, p := range presets {
		i := strings.LastIndex(p.Name, " L")
		require.Greater(t, i, 0, "preset name convention: %q", p.Name)
		name := p.Name[:i]
		level, err := strconv.Atoi(p.Name[i+2:])
		require.NoError(t, err, "preset name convention: %q", p.Name)
		if e, ok := maxed[name]; !ok || level > e.level {
			maxed[name] = entry{level, p.Spec}
		}
	}

	var maxNonCeiling float64
	var maxNonCeilingName string
	for name, e := range maxed {
		if ceiling[name] {
			continue
		}
		if ev := sustainedEVPerTick(e.spec); ev > maxNonCeiling {
			maxNonCeiling, maxNonCeilingName = ev, name
		}
	}
	require.NotZero(t, maxNonCeiling)
	t.Logf("strongest non-ceiling: %s at %.3f ev/tick", maxNonCeilingName, maxNonCeiling)

	spearhead := sustainedEVPerTick(maxed["Spearhead"].spec)
	for name := range ceiling {
		e, ok := maxed[name]
		require.True(t, ok, "ceiling ref %s must be in the presets (§A)", name)
		ev := sustainedEVPerTick(e.spec)
		t.Logf("ceiling ref %s L%d: %.3f ev/tick", name, e.level, ev)
		assert.Greater(t, ev, maxNonCeiling,
			"%s (§A ceiling) must outdamage every non-ceiling skill (best: %s %.3f)",
			name, maxNonCeilingName, maxNonCeiling)
		if name != "Spearhead" {
			assert.Greater(t, spearhead, ev, "Spearhead is the §A damage-axis top")
		}
	}
}

func TestGuardrails_TierThresholdsVsRealRoster(t *testing.T) {
	defs, sr, err := loadContent("")
	require.NoError(t, err)

	dmgAura, err := sr.GetByName("Damage")
	require.NoError(t, err, "the baseline bot's weapon must exist in content")
	botAura, err := auraSpecOf(dmgAura, 1, 1)
	require.NoError(t, err)

	// zone -> classified normals, for the band-check below.
	soft := map[string][]string{}
	hard := map[string][]string{}

	for _, def := range defs {
		if reason, exempt := guardrailExempt[def.Name]; exempt {
			t.Logf("skip %-18s %s", def.Name, reason)
			continue
		}
		spec, err := mobSpecOf(def)
		require.NoError(t, err, "%s: content the sim cannot model faithfully", def.Name)
		if spec.Aura.DamageHP == 0 && spec.Aura.DotHP == 0 {
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

	for _, zone := range []string{"Z1", "Z2", "farm"} {
		// The soft-normal floor is a LEVELING-zone rule (PO 2026-07-22): a
		// player working through Z1/Z2 must always have something they can
		// stand and trade with. The farm band (cL8-17) is deliberate,
		// out-levelled content you engage on purpose — it is allowed to be
		// hard across the board, and since the GiantSpider bite+venom pass it
		// is. Every band still needs a hard normal, or it is not a band.
		if zone != "farm" {
			assert.NotEmpty(t, soft[zone],
				"%s must offer at least one soft (facetankable) normal", zone)
		}
		assert.NotEmpty(t, hard[zone],
			"%s must offer at least one hard (bot-killing) normal", zone)
		t.Logf("%s band: soft=%v hard=%v", zone, soft[zone], hard[zone])
	}
}
