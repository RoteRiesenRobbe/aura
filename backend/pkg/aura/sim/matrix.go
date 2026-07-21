package sim

// Chunk 3: the 1-vs-N matrix (plan §8 chunk 3, GDD §5) — player target-count
// × pack size. Single/few-target base auras make pack fights, not duels, the
// real balance question; the matrix shows where each build's overwhelm point
// sits. All cells reuse the chunk-1 runner via the Pack scenario.

import "time"

// PackCell is one matrix cell: one build vs one pack size, N seeded runs.
type PackCell struct {
	PackSize int `json:"packSize"`
	// WinRate is the share of runs in which the player cleared the whole pack.
	WinRate float64 `json:"winRate"`
	// ClearTime is seconds-to-full-clear over the winning runs.
	ClearTime Distribution `json:"clearTime"`
	// Kills is the kills-before-death count over the LOSING runs (Values are
	// counts, not seconds) — how close the losing fights were.
	Kills Distribution `json:"killsBeforeDeath"`
}

// BuildRow is one player build (MaxTargets candidate) across all pack sizes.
type BuildRow struct {
	MaxTargets int `json:"maxTargets"` // 0 = uncapped
	// OverwhelmPack is the first pack size at which the player wins fewer
	// than half of the runs [PLACEHOLDER definition — mirrors the chunk-2
	// WallDelta; the full win-rate curve is in the cells, readable under any
	// other cut]; −1 = no overwhelm within the swept range.
	OverwhelmPack int        `json:"overwhelmPack"`
	Cells         []PackCell `json:"cells"`
}

// MatrixConfig is one matrix invocation — it maps 1:1 onto the CLI flags and
// the explorer's /matrix request.
type MatrixConfig struct {
	Player PlayerSpec `json:"player"` // Aura.MaxTargets is overridden per row
	Mob    MobSpec    `json:"mob"`
	// MaxTargetsCandidates are the build rows (0 = uncapped).
	MaxTargetsCandidates []int `json:"maxTargetsCandidates"`
	// MaxPackSize sweeps pack sizes 1..MaxPackSize — contiguous, so "first
	// overwhelmed size" is well-defined.
	MaxPackSize int     `json:"maxPackSize"`
	BaseSeed    int64   `json:"baseSeed"`
	Runs        int     `json:"runs"`
	Distance    float32 `json:"distance"`
}

// MatrixReport is the chunk-3 artifact: config echo + the build rows,
// diffable across tuning sessions like the chunk-1/2 reports.
type MatrixReport struct {
	GeneratedAt    time.Time `json:"generatedAt"`
	TicksPerSecond int       `json:"ticksPerSecond"`
	MatrixConfig
	Rows []BuildRow `json:"rows"`
}

// runPackCell measures one cell in a single pass over n seeded fights: the
// outcome counts feed the win rate, winning runs the clear-time samples,
// losing runs the kills-before-death samples.
func runPackCell(sc Scenario, baseSeed int64, n int) PackCell {
	outcomes := make(map[Outcome]int)
	var clearTimes, kills []float64
	for i := 0; i < n; i++ {
		r := RunFight(sc, baseSeed+int64(i))
		outcomes[r.Outcome]++
		switch r.Outcome {
		case OutcomeMobDied:
			clearTimes = append(clearTimes, r.Seconds)
		case OutcomePlayerDied:
			kills = append(kills, float64(r.Kills))
		}
	}
	return PackCell{
		PackSize:  sc.PackSize,
		WinRate:   float64(outcomes[OutcomeMobDied]) / float64(n),
		ClearTime: summarize(n, outcomes, clearTimes),
		Kills:     summarize(n, outcomes, kills),
	}
}

// RunMatrix executes the full build × pack-size grid (cells in parallel,
// chunk-2 pattern) and derives each build's overwhelm point.
func RunMatrix(cfg MatrixConfig) *MatrixReport {
	cands := cfg.MaxTargetsCandidates
	cells := make([]PackCell, len(cands)*cfg.MaxPackSize)
	parallelFor(len(cells), func(i int) {
		p := cfg.Player
		p.Aura.MaxTargets = cands[i/cfg.MaxPackSize]
		packSize := i%cfg.MaxPackSize + 1
		cells[i] = runPackCell(Pack(p, cfg.Mob, packSize, cfg.Distance), cfg.BaseSeed, cfg.Runs)
	})

	rows := make([]BuildRow, 0, len(cands))
	for ci, cand := range cands {
		rowCells := cells[ci*cfg.MaxPackSize : (ci+1)*cfg.MaxPackSize : (ci+1)*cfg.MaxPackSize]
		overwhelm := -1
		for _, cell := range rowCells {
			if cell.WinRate < 0.5 {
				overwhelm = cell.PackSize
				break
			}
		}
		rows = append(rows, BuildRow{MaxTargets: cand, OverwhelmPack: overwhelm, Cells: rowCells})
	}

	return &MatrixReport{
		GeneratedAt:    time.Now(),
		TicksPerSecond: TicksPerSecond,
		MatrixConfig:   cfg,
		Rows:           rows,
	}
}
