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
	data, err := json.MarshalIndent(r, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(data, '\n'), 0o644)
}
