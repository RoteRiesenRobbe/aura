package sim

// Chunk 2 sweeps: the three curve visualizations the PO reads to lock
// growth + max level (plan §8 chunk 2) — the same-tier level sweep
// (scale-invariance check), the cross-tier gap sweep (wall/steamroll band)
// and the linked-triple table (band width ↔ max level ↔ total inflation).
// All sweep points reuse the chunk-1 runner; the same (config, baseSeed,
// runs) reproduces every measurement exactly.

import (
	"runtime"
	"sync"
	"time"
)

// parallelFor fills sweep points concurrently: fn(i) for i in [0, n) across
// NumCPU workers. Sweep points are independent seeded worlds (no shared
// mutable state in the driven systems; the ecs entity-ID counter is atomic
// and nothing observable depends on it), so this keeps the reproducibility
// contract while making a full curve battery (~20k fights) explorer-fast.
func parallelFor(n int, fn func(i int)) {
	workers := runtime.NumCPU()
	if workers > n {
		workers = n
	}
	var wg sync.WaitGroup
	next := make(chan int)
	for w := 0; w < workers; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := range next {
				fn(i)
			}
		}()
	}
	for i := 0; i < n; i++ {
		next <- i
	}
	close(next)
	wg.Wait()
}

// LevelPoint is one same-tier rung: a level-typical player against the
// same-tier mob, plus the analytic progression numbers at that level.
type LevelPoint struct {
	Level         int          `json:"level"`
	F             float64      `json:"f"`
	KillsPerLevel float64      `json:"killsPerLevel"`
	TTK           Distribution `json:"ttk"`
	TTD           Distribution `json:"ttd"`
}

// RunLevelSweep measures every level of the span same-tier. Under
// Philosophy A (§5 Decision 1) the TTK/TTD columns must come out flat —
// drift means the scaling leaks into a non-HP knob somewhere.
func RunLevelSweep(fx Fixture, distance float32, baseSeed int64, runs int) []LevelPoint {
	points := make([]LevelPoint, fx.Curve.MaxLevel)
	parallelFor(len(points), func(i int) {
		level := i + 1
		p, m := fx.PlayerAt(level), fx.MobAt(level)
		points[i] = LevelPoint{
			Level:         level,
			F:             fx.Curve.F(level),
			KillsPerLevel: fx.XP.KillsPerLevel(level),
			TTK:           RunDistribution(TTK(p, m, distance), baseSeed, runs),
			TTD:           RunDistribution(TTD(p, m, distance), baseSeed, runs),
		}
	})
	return points
}

// GapPoint is one cross-tier rung: a fixed-level player against a mob
// Delta tiers above (+) or below (−) them.
type GapPoint struct {
	Delta   int          `json:"delta"` // mob tier − player level
	MobTier int          `json:"mobTier"`
	WinRate float64      `json:"winRate"` // share of TTK runs the player won
	TTK     Distribution `json:"ttk"`
	TTD     Distribution `json:"ttd"`
}

// RunGapSweep measures the wall/steamroll picture: TTK, TTD and win-rate
// vs Δlevel at a reference player level, Δ = −maxDelta..+maxDelta (tiers
// below 1 are skipped — there is nothing under the curve's baseline).
func RunGapSweep(fx Fixture, playerLevel, maxDelta int, distance float32, baseSeed int64, runs int) []GapPoint {
	p := fx.PlayerAt(playerLevel)
	var deltas []int
	for delta := -maxDelta; delta <= maxDelta; delta++ {
		if playerLevel+delta >= 1 {
			deltas = append(deltas, delta)
		}
	}
	points := make([]GapPoint, len(deltas))
	parallelFor(len(points), func(i int) {
		delta := deltas[i]
		tier := playerLevel + delta
		m := fx.MobAt(tier)
		ttk := RunDistribution(TTK(p, m, distance), baseSeed, runs)
		points[i] = GapPoint{
			Delta:   delta,
			MobTier: tier,
			WinRate: float64(ttk.Outcomes[OutcomeMobDied]) / float64(ttk.Runs),
			TTK:     ttk,
			TTD:     RunDistribution(TTD(p, m, distance), baseSeed, runs),
		}
	})
	return points
}

// InflationPoint is one max-level candidate's end-of-curve multiplier.
type InflationPoint struct {
	MaxLevel       int     `json:"maxLevel"`
	TotalInflation float64 `json:"totalInflation"`
}

// TripleRow links one growth candidate's measured band edge to the total
// inflation each max-level candidate would produce — the §5 Decision 4
// triple in one row.
type TripleRow struct {
	Growth float64 `json:"growth"`
	// WallDelta is the first Δ ≥ 0 at which the player wins fewer than half
	// of the TTK fights [PLACEHOLDER definition — the full win-rate curve is
	// in the gap sweep, readable under any other cut]; −1 = no wall within
	// the swept range.
	WallDelta int              `json:"wallDelta"`
	Inflation []InflationPoint `json:"inflation"`
}

// RunTripleTable measures WallDelta per growth candidate (an upward-only
// gap sweep at refLevel with that growth swapped in) and tabulates the
// analytic inflation per max-level candidate.
func RunTripleTable(fx Fixture, growths []float64, maxLevels []int, refLevel, maxDelta int, distance float32, baseSeed int64, runs int) []TripleRow {
	// The whole (growth × Δ) grid runs in parallel; the wall scan afterwards
	// is a cheap pass over the measured win counts.
	nDeltas := maxDelta + 1
	wins := make([]int, len(growths)*nDeltas)
	parallelFor(len(wins), func(i int) {
		gfx := fx
		gfx.Curve.Growth = growths[i/nDeltas]
		delta := i % nDeltas
		ttk := RunDistribution(TTK(gfx.PlayerAt(refLevel), gfx.MobAt(refLevel+delta), distance), baseSeed, runs)
		wins[i] = ttk.Outcomes[OutcomeMobDied]
	})

	rows := make([]TripleRow, 0, len(growths))
	for gi, growth := range growths {
		wall := -1
		for delta := 0; delta <= maxDelta; delta++ {
			if float64(wins[gi*nDeltas+delta]) < float64(runs)/2 {
				wall = delta
				break
			}
		}

		inflation := make([]InflationPoint, 0, len(maxLevels))
		for _, maxLevel := range maxLevels {
			inflation = append(inflation, InflationPoint{
				MaxLevel:       maxLevel,
				TotalInflation: Curve{Growth: growth}.F(maxLevel),
			})
		}
		rows = append(rows, TripleRow{Growth: growth, WallDelta: wall, Inflation: inflation})
	}
	return rows
}

// CurveConfig is one curve-battery invocation — it maps 1:1 onto the CLI
// flags and the explorer's /curve request.
type CurveConfig struct {
	Fixture  Fixture `json:"fixture"`
	BaseSeed int64   `json:"baseSeed"`
	Runs     int     `json:"runs"`
	Distance float32 `json:"distance"`
	// RefLevel anchors the gap sweep + triple table; 0 = mid-span.
	RefLevel int `json:"refLevel"`
	MaxDelta int `json:"maxDelta"`
	// Candidate lists for the triple table; empty = no triple table.
	GrowthCandidates   []float64 `json:"growthCandidates"`
	MaxLevelCandidates []int     `json:"maxLevelCandidates"`
}

// CurveReport is the chunk-2 artifact: config echo + the three result sets,
// diffable across tuning sessions like the chunk-1 report.
type CurveReport struct {
	GeneratedAt    time.Time `json:"generatedAt"`
	TicksPerSecond int       `json:"ticksPerSecond"`
	CurveConfig
	Levels []LevelPoint `json:"levels"`
	Gaps   []GapPoint   `json:"gaps"`
	Triple []TripleRow  `json:"triple,omitempty"`
}

// RunCurve executes the full curve battery.
func RunCurve(cfg CurveConfig) *CurveReport {
	if cfg.RefLevel < 1 {
		cfg.RefLevel = cfg.Fixture.Curve.MaxLevel / 2
		if cfg.RefLevel < 1 {
			cfg.RefLevel = 1
		}
	}
	r := &CurveReport{
		GeneratedAt:    time.Now(),
		TicksPerSecond: TicksPerSecond,
		CurveConfig:    cfg,
		Levels:         RunLevelSweep(cfg.Fixture, cfg.Distance, cfg.BaseSeed, cfg.Runs),
		Gaps:           RunGapSweep(cfg.Fixture, cfg.RefLevel, cfg.MaxDelta, cfg.Distance, cfg.BaseSeed, cfg.Runs),
	}
	if len(cfg.GrowthCandidates) > 0 && len(cfg.MaxLevelCandidates) > 0 {
		r.Triple = RunTripleTable(cfg.Fixture, cfg.GrowthCandidates, cfg.MaxLevelCandidates,
			cfg.RefLevel, cfg.MaxDelta, cfg.Distance, cfg.BaseSeed, cfg.Runs)
	}
	return r
}
