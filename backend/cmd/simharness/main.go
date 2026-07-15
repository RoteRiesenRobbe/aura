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

	"github.com/trichner/berryhunter/pkg/berryhunter/sim"
)

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
	contentDir := flag.String("content", "", "api/-layout content dir for the explorer's mob presets (default: embedded copies; e.g. ../api)")

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
		presets, err := loadMobPresets(*contentDir)
		if err != nil {
			fmt.Fprintf(os.Stderr, "loading mob presets: %v\n", err)
			os.Exit(1)
		}
		if err := serve(*serveAddr, presets); err != nil {
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
