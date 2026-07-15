package sim

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"
)

// ScenarioResult is one scenario's spec echo + measured distribution, so a
// saved artifact is self-describing (which numbers produced these outcomes).
type ScenarioResult struct {
	Scenario     Scenario     `json:"scenario"`
	BaseSeed     int64        `json:"baseSeed"`
	Distribution Distribution `json:"distribution"`
}

// Report is the saved artifact of one harness invocation — diffable /
// chartable across tuning sessions (plan §7).
type Report struct {
	GeneratedAt    time.Time        `json:"generatedAt"`
	TicksPerSecond int              `json:"ticksPerSecond"`
	Results        []ScenarioResult `json:"results"`
}

func NewReport() *Report {
	return &Report{GeneratedAt: time.Now(), TicksPerSecond: TicksPerSecond}
}

// Run executes a scenario battery entry and records it.
func (r *Report) Run(sc Scenario, baseSeed int64, runs int) {
	r.Results = append(r.Results, ScenarioResult{
		Scenario:     sc,
		BaseSeed:     baseSeed,
		Distribution: RunDistribution(sc, baseSeed, runs),
	})
}

// Table renders the human summary: one row per scenario, seconds as the
// unit, percentiles over the primary outcome, all endings visible.
func (r *Report) Table() string {
	var b strings.Builder
	fmt.Fprintf(&b, "%-8s %-14s %6s %8s %8s %8s %8s %8s %8s  %s\n",
		"SCENARIO", "PRIMARY", "RUNS", "SAMPLES", "p10", "p50", "p90", "mean", "max", "OUTCOMES")
	for _, res := range r.Results {
		d := res.Distribution
		row := fmt.Sprintf("%-8s %-14s %6d %8d", res.Scenario.Name, res.Scenario.Primary, d.Runs, d.Samples)
		if d.Samples > 0 {
			row += fmt.Sprintf(" %7.2fs %7.2fs %7.2fs %7.2fs %7.2fs", d.P10, d.P50, d.P90, d.Mean, d.Max)
		} else {
			row += fmt.Sprintf(" %8s %8s %8s %8s %8s", "-", "-", "-", "-", "-")
		}
		row += "  " + outcomesSummary(d)
		b.WriteString(row + "\n")
	}
	return b.String()
}

// outcomesSummary lists outcome counts in a stable order.
func outcomesSummary(d Distribution) string {
	var parts []string
	for _, o := range []Outcome{OutcomeMobDied, OutcomePlayerDied, OutcomeTimeout} {
		if n := d.Outcomes[o]; n > 0 {
			parts = append(parts, fmt.Sprintf("%s=%d", o, n))
		}
	}
	return strings.Join(parts, " ")
}

// WriteJSON saves the artifact.
func (r *Report) WriteJSON(path string) error {
	return writeJSON(r, path)
}

// WriteJSON saves the chunk-2 curve artifact.
func (r *CurveReport) WriteJSON(path string) error {
	return writeJSON(r, path)
}

func writeJSON(v any, path string) error {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(data, '\n'), 0o644)
}

// LevelTable renders the same-tier sweep. Under Philosophy A (§5) the TTK
// and TTD columns must read flat top to bottom — drift is a finding.
func (r *CurveReport) LevelTable() string {
	var b strings.Builder
	fmt.Fprintf(&b, "%5s %8s %10s  %-22s %-22s %s\n",
		"LEVEL", "f", "kills/lvl", "TTK p50 [p10-p90]", "TTD p50 [p10-p90]", "NOTES")
	for _, pt := range r.Levels {
		fmt.Fprintf(&b, "%5d %8.2f %10.1f  %-22s %-22s %s\n",
			pt.Level, pt.F, pt.KillsPerLevel, distCell(pt.TTK), distCell(pt.TTD),
			sweepNotes(pt.TTK, pt.TTD))
	}
	return b.String()
}

// GapTable renders the cross-tier band at the reference level: the
// wall/steamroll picture TTK/TTD/win-rate vs Δlevel.
func (r *CurveReport) GapTable() string {
	var b strings.Builder
	fmt.Fprintf(&b, "player level %d, mob tier = level + Δ\n", r.RefLevel)
	fmt.Fprintf(&b, "%5s %5s %6s  %-22s %-22s %s\n",
		"Δ", "TIER", "WIN%", "TTK p50 [p10-p90]", "TTD p50 [p10-p90]", "NOTES")
	for _, pt := range r.Gaps {
		fmt.Fprintf(&b, "%+5d %5d %5.0f%%  %-22s %-22s %s\n",
			pt.Delta, pt.MobTier, pt.WinRate*100, distCell(pt.TTK), distCell(pt.TTD),
			sweepNotes(pt.TTK, pt.TTD))
	}
	return b.String()
}

// TripleTable renders the linked triple (§5 Decision 4): per growth
// candidate the measured wall Δ (win-rate < 50% [PLACEHOLDER definition])
// and the total inflation each max-level candidate would produce.
func (r *CurveReport) TripleTable() string {
	var b strings.Builder
	fmt.Fprintf(&b, "%6s %7s", "GROWTH", "WALL Δ")
	if len(r.Triple) > 0 {
		for _, inf := range r.Triple[0].Inflation {
			fmt.Fprintf(&b, " %9s", fmt.Sprintf("×@L%d", inf.MaxLevel))
		}
	}
	b.WriteString("\n")
	for _, row := range r.Triple {
		wall := fmt.Sprintf(">%d", r.MaxDelta)
		if row.WallDelta >= 0 {
			wall = fmt.Sprintf("+%d", row.WallDelta)
		}
		fmt.Fprintf(&b, "%6.2f %7s", row.Growth, wall)
		for _, inf := range row.Inflation {
			fmt.Fprintf(&b, " %8.1fx", inf.TotalInflation)
		}
		b.WriteString("\n")
	}
	return b.String()
}

// distCell is one distribution as a compact table cell.
func distCell(d Distribution) string {
	if d.Samples == 0 {
		return "-"
	}
	return fmt.Sprintf("%6.2f [%5.2f-%6.2f]", d.P50, d.P10, d.P90)
}

// sweepNotes surfaces the endings that are NOT the scenario's metric —
// silent in the percentile columns, loud here (a timing-out TTD on the
// steamroll side, a dying player mid-TTK on the wall side).
func sweepNotes(ttk, ttd Distribution) string {
	var parts []string
	for _, o := range []Outcome{OutcomePlayerDied, OutcomeTimeout} {
		if n := ttk.Outcomes[o]; n > 0 {
			parts = append(parts, fmt.Sprintf("ttk:%s=%d", o, n))
		}
	}
	for _, o := range []Outcome{OutcomeMobDied, OutcomeTimeout} {
		if n := ttd.Outcomes[o]; n > 0 {
			parts = append(parts, fmt.Sprintf("ttd:%s=%d", o, n))
		}
	}
	return strings.Join(parts, " ")
}
