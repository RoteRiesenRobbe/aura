// simharness is the standalone balancing / what-if explorer CLI
// (docs/plan-sim-harness.md, chunk 1): explicit combatant numbers in,
// TTK / TTD distributions out — a table on stdout plus a JSON artifact for
// diffing runs across tuning sessions.
//
// Usage (all combatant flags default to the current content's [PLACEHOLDER]
// numbers — DamageAura + a SaberToothCat-shaped mob):
//
//	go run ./cmd/simharness
//	go run ./cmd/simharness -player-dmg 20 -mob-hp 80 -runs 500
//	go run ./cmd/simharness -serve localhost:8081   # interactive web explorer
//	make -C backend simharness.build && ./simharness -out ttk-explore.json
package main

import (
	"flag"
	"fmt"
	"io"
	"log"
	"os"
	"strconv"
	"strings"

	"github.com/trichner/berryhunter/pkg/berryhunter/sim"
)

// parseFloats / parseInts parse the comma-separated candidate-list flags.
func parseFloats(s string) ([]float64, error) {
	var out []float64
	for _, part := range strings.Split(s, ",") {
		v, err := strconv.ParseFloat(strings.TrimSpace(part), 64)
		if err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, nil
}

func parseInts(s string) ([]int, error) {
	var out []int
	for _, part := range strings.Split(s, ",") {
		v, err := strconv.Atoi(strings.TrimSpace(part))
		if err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, nil
}

func main() {
	// Every seeded run builds a fresh world, and the game systems announce
	// themselves via the std logger on construction — hundreds of "nominal"
	// lines that would bury the table. Silence the logger; the harness
	// reports through stdout/stderr directly.
	log.SetOutput(io.Discard)

	// Explorer UI: -serve starts the local web frontend instead of the
	// one-shot battery; all combatant flags below are ignored there (the
	// page has its own inputs).
	serveAddr := flag.String("serve", "", "serve the web explorer on this address (e.g. localhost:8081) instead of running once")
	contentDir := flag.String("content", "", "api/-layout content dir for the mob / player-aura presets (default: embedded copies; e.g. ../api)")

	// Curve battery (chunk 2): -levels sweeps the f(character level) curve
	// instead of the single 1v1; the player/mob flags below become the
	// level-1 / tier-1 baselines. All curve defaults are the §5 working
	// frame, [PLACEHOLDER] until the PO locks them from this tool's output.
	levels := flag.Bool("levels", false, "run the f(character-level) curve battery (level sweep + gap band + linked-triple table)")
	growth := flag.Float64("growth", 1.12, "f growth per level: f(L) = growth^(L-1)")
	maxLevel := flag.Int("max-level", 30, "level span to sweep")
	refLevel := flag.Int("ref-level", 0, "player level anchoring the gap sweep (0 = mid-span)")
	gap := flag.Int("gap", 6, "gap sweep range: Δ = -gap..+gap")
	growths := flag.String("growths", "1.08,1.10,1.12,1.15", "triple-table growth candidates (comma-separated)")
	maxLevels := flag.String("max-levels", "20,25,30,35", "triple-table max-level candidates (comma-separated)")
	xpBase := flag.Float64("xp-base", 300, "XP required level 1→2 (mirrors conf levelUpXPBase)")
	xpGrowth := flag.Float64("xp-growth", 1.2, "level-up XP growth per level (mirrors conf levelUpXPGrowthFactor)")
	xpKill := flag.Float64("xp-kill", 40, "XP per same-tier kill at tier 1")
	xpKillGrowth := flag.Float64("xp-kill-growth", 1.2, "kill-XP growth per tier (= xp-growth → flat kills-per-level)")

	// Matrix battery (chunk 3): -matrix sweeps player MaxTargets builds ×
	// pack size instead of the single 1v1; the player/mob flags below are the
	// combatants (the player's MaxTargets is overridden per row). Defaults
	// [PLACEHOLDER].
	matrix := flag.Bool("matrix", false, "run the 1-vs-N pack matrix (MaxTargets builds × pack size)")
	maxTargetsCands := flag.String("max-targets", "1,2,3,0", "matrix build rows: MaxTargets candidates, 0 = uncapped (comma-separated)")
	maxPack := flag.Int("max-pack", 8, "matrix sweeps pack sizes 1..N")

	// Chain battery (chunk 4): -chain runs the sustainable-kills/hour chain
	// (fight → real out-of-combat regen to full → modeled downtime), facetank
	// vs kite — the stances own the geometry, so -distance is ignored. A mob
	// whose aura interval exceeds ~3 s can leash mid-kite and time the fight
	// out — that is real behavior, reported as timeouts. Defaults
	// [PLACEHOLDER].
	chain := flag.Bool("chain", false, "run the kills/hour chain battery (facetank vs kite; ignores -distance)")
	chainFights := flag.Int("chain-fights", 20, "fights per chain")
	downtime := flag.Float64("downtime", 10, "modeled walk-to-the-next-pack gap in seconds")
	regenTick := flag.Float64("regen-tick", 0, "out-of-combat regen fraction of max HP per tick (0 = game default; raise it to model time-at-fire)")
	selfHeal := flag.Int("self-heal", 0, "self-heal cooldown level, 0 = none (20%+5%/lvl of max HP, 30s cd — mirrors Heal)")
	chainLevels := flag.String("chain-levels", "", "level brackets, comma-separated (scaled same-tier by -growth; empty = the explicit numbers)")

	// Battery controls.
	runs := flag.Int("runs", 200, "seeded runs per scenario")
	seed := flag.Int64("seed", 1, "base seed; run i uses seed+i")
	maxSeconds := flag.Float64("max-seconds", 120, "timeout per fight in simulated seconds")
	distance := flag.Float64("distance", 0.5, "start distance player→mob in world units")
	out := flag.String("out", "simharness-report.json", "JSON artifact path ('' = skip)")

	// Player build — defaults mirror api/skills/damage-aura.json + conf
	// baseHealth, all [PLACEHOLDER].
	playerHP := flag.Int("player-hp", 100, "player max health (absolute HP)")
	playerDmg := flag.Float64("player-dmg", 14, "player aura damage per hit")
	playerTick := flag.Int("player-tick", 40, "player aura tick interval (game ticks)")
	playerRadius := flag.Float64("player-radius", 1.0, "player aura radius")
	playerVariance := flag.Float64("player-variance", 0.15, "player per-hit variance band")
	playerCritChance := flag.Float64("player-crit-chance", 0, "player crit chance [0,1]")
	playerCritFactor := flag.Float64("player-crit-factor", 0, "player crit multiplier (pair with crit chance)")
	playerAura := flag.String("player-aura", "", "prefill the player aura from an authored skill, Name[:level] (e.g. Vanguard:5); overrides the -player-dmg/-tick/-radius/-variance/-crit flags (damage effect only — C5)")

	// Mob — defaults mirror api/mobs/saber-tooth-cat.json + its aura, all
	// [PLACEHOLDER].
	mobHP := flag.Float64("mob-hp", 60, "mob max health")
	mobHPVariance := flag.Float64("mob-hp-variance", 0, "mob spawn-HP variance band")
	mobDmg := flag.Float64("mob-dmg", 8, "mob aura damage per hit")
	mobTick := flag.Int("mob-tick", 20, "mob aura tick interval (game ticks)")
	mobRadius := flag.Float64("mob-radius", 1.0, "mob aura radius")
	mobSpeed := flag.Float64("mob-speed", 0.5, "mob chase speed factor (0 = stationary)")
	mobBody := flag.Float64("mob-body", 0.35, "mob body radius")
	mobAggro := flag.Float64("mob-aggro", 4.0, "mob aggro sensor radius")
	mobVariance := flag.Float64("mob-variance", 0, "mob per-hit variance band")
	mobFlee := flag.Float64("mob-flee-below", 0, "mob flees below this health ratio (0 = never)")

	flag.Parse()

	if *serveAddr != "" {
		presets, playerPresets, err := loadPresets(*contentDir)
		if err != nil {
			fmt.Fprintf(os.Stderr, "loading presets: %v\n", err)
			os.Exit(1)
		}
		if err := serve(*serveAddr, presets, playerPresets); err != nil {
			fmt.Fprintf(os.Stderr, "serve: %v\n", err)
			os.Exit(1)
		}
		return
	}

	player := sim.PlayerSpec{
		MaxHealth: *playerHP,
		Aura: sim.AuraSpec{
			DamageHP:     float32(*playerDmg),
			TickInterval: *playerTick,
			Radius:       float32(*playerRadius),
			Variance:     float32(*playerVariance),
			CritChance:   float32(*playerCritChance),
			CritFactor:   float32(*playerCritFactor),
			MaxTargets:   1,
		},
	}
	if *playerAura != "" {
		spec, err := playerAuraSpecByName(*contentDir, *playerAura)
		if err != nil {
			fmt.Fprintf(os.Stderr, "%v\n", err)
			os.Exit(1)
		}
		if spec.MaxTargets < 1 {
			spec.MaxTargets = 1
		}
		player.Aura = spec
	}
	mob := sim.MobSpec{
		MaxHealth:            float32(*mobHP),
		MaxHealthVariance:    float32(*mobHPVariance),
		Speed:                float32(*mobSpeed),
		BodyRadius:           float32(*mobBody),
		AggroRadius:          float32(*mobAggro),
		FleeBelowHealthRatio: float32(*mobFlee),
		Aura: sim.AuraSpec{
			DamageHP:     float32(*mobDmg),
			TickInterval: *mobTick,
			Radius:       float32(*mobRadius),
			Variance:     float32(*mobVariance),
			MaxTargets:   1,
		},
	}

	if *levels {
		growthList, err := parseFloats(*growths)
		if err != nil {
			fmt.Fprintf(os.Stderr, "-growths: %v\n", err)
			os.Exit(1)
		}
		maxLevelList, err := parseInts(*maxLevels)
		if err != nil {
			fmt.Fprintf(os.Stderr, "-max-levels: %v\n", err)
			os.Exit(1)
		}
		report := sim.RunCurve(sim.CurveConfig{
			Fixture: sim.Fixture{
				Curve:  sim.Curve{Growth: *growth, MaxLevel: *maxLevel},
				Player: player,
				Mob:    mob,
				XP:     sim.XPModel{LevelUpBase: *xpBase, LevelUpGrowth: *xpGrowth, KillBase: *xpKill, KillGrowth: *xpKillGrowth},
			},
			BaseSeed:           *seed,
			Runs:               *runs,
			Distance:           float32(*distance),
			RefLevel:           *refLevel,
			MaxDelta:           *gap,
			GrowthCandidates:   growthList,
			MaxLevelCandidates: maxLevelList,
		})

		fmt.Printf("SAME-TIER LEVEL SWEEP (growth %.2f — Philosophy A: columns must read flat)\n%s\n",
			*growth, report.LevelTable())
		fmt.Printf("CROSS-TIER GAP BAND (growth %.2f — the wall/steamroll picture)\n%s\n",
			*growth, report.GapTable())
		fmt.Printf("LINKED TRIPLE (wall Δ measured at win-rate < 50%% [PLACEHOLDER]; inflation = growth^(maxLevel-1))\n%s",
			report.TripleTable())

		if *out != "" {
			if err := report.WriteJSON(*out); err != nil {
				fmt.Fprintf(os.Stderr, "writing artifact: %v\n", err)
				os.Exit(1)
			}
			fmt.Printf("\nartifact written to %s\n", *out)
		}
		return
	}

	if *matrix {
		cands, err := parseInts(*maxTargetsCands)
		if err != nil {
			fmt.Fprintf(os.Stderr, "-max-targets: %v\n", err)
			os.Exit(1)
		}
		report := sim.RunMatrix(sim.MatrixConfig{
			Player:               player,
			Mob:                  mob,
			MaxTargetsCandidates: cands,
			MaxPackSize:          *maxPack,
			BaseSeed:             *seed,
			Runs:                 *runs,
			Distance:             float32(*distance),
		})

		fmt.Printf("1-vs-N PACK MATRIX (cell = win%% + clear p50; overwhelm = first pack size with win-rate < 50%% [PLACEHOLDER])\n%s\n",
			report.MatrixTable())
		fmt.Printf("KILLS BEFORE DEATH (p50 over the losing runs — how close the losses were)\n%s",
			report.KillsTable())

		if *out != "" {
			if err := report.WriteJSON(*out); err != nil {
				fmt.Fprintf(os.Stderr, "writing artifact: %v\n", err)
				os.Exit(1)
			}
			fmt.Printf("\nartifact written to %s\n", *out)
		}
		return
	}

	if *chain {
		var levelList []int
		if *chainLevels != "" {
			var err error
			levelList, err = parseInts(*chainLevels)
			if err != nil {
				fmt.Fprintf(os.Stderr, "-chain-levels: %v\n", err)
				os.Exit(1)
			}
		}
		report := sim.RunChain(sim.ChainConfig{
			Player:             player,
			Mob:                mob,
			Curve:              sim.Curve{Growth: *growth, MaxLevel: *maxLevel},
			Levels:             levelList,
			ChainFights:        *chainFights,
			DowntimeSeconds:    *downtime,
			RegenTick:          float32(*regenTick),
			SelfHealLevel:      *selfHeal,
			BaseSeed:           *seed,
			Runs:               *runs,
			MaxSecondsPerFight: *maxSeconds,
		})

		fmt.Printf("KILLS/HOUR CHAIN (%d fights/chain, %.0fs downtime — facetank vs kite; efficiency < 1 = positioning pays [PLACEHOLDER cuts])\n%s",
			*chainFights, *downtime, report.ChainTable())

		if *out != "" {
			if err := report.WriteJSON(*out); err != nil {
				fmt.Fprintf(os.Stderr, "writing artifact: %v\n", err)
				os.Exit(1)
			}
			fmt.Printf("\nartifact written to %s\n", *out)
		}
		return
	}

	maxTicks := int(*maxSeconds * sim.TicksPerSecond)
	battery := []sim.Scenario{
		sim.TTK(player, mob, float32(*distance)),
		sim.TTD(player, mob, float32(*distance)),
	}

	report := sim.NewReport()
	for _, sc := range battery {
		sc.MaxTicks = maxTicks
		report.Run(sc, *seed, *runs)
	}

	fmt.Print(report.Table())

	if *out != "" {
		if err := report.WriteJSON(*out); err != nil {
			fmt.Fprintf(os.Stderr, "writing artifact: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("\nartifact written to %s\n", *out)
	}
}
