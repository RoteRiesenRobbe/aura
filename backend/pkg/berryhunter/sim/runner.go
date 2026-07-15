package sim

import (
	"math"
	"sort"
)

// FightResult is one fight, run to a death or the timeout.
type FightResult struct {
	Outcome Outcome `json:"outcome"`
	Ticks   int     `json:"ticks"`
	Seconds float64 `json:"seconds"`
}

// RunFight plays a single seeded fight tick by tick until someone dies or
// the scenario times out. Deterministic: the same (scenario, seed) replays
// the same fight — the debugging entry point the plan (§3) keeps available.
func RunFight(sc Scenario, seed int64) FightResult {
	w := NewWorld(sc, seed)
	for t := 1; t <= sc.MaxTicks; t++ {
		w.Step()
		// The mob's death check runs first: mob HP hits zero in the
		// SkillSystem phase of this tick, the MobSystem removes it next
		// tick — the held reference stays readable throughout.
		if w.Mob.Health() == 0 {
			return FightResult{OutcomeMobDied, t, seconds(t)}
		}
		if w.Player.VitalSigns().Health == 0 {
			return FightResult{OutcomePlayerDied, t, seconds(t)}
		}
	}
	return FightResult{OutcomeTimeout, sc.MaxTicks, seconds(sc.MaxTicks)}
}

// Distribution aggregates N seeded runs of one scenario (plan §3): outcome
// counts plus percentile stats in seconds over the runs that ended in the
// scenario's primary outcome. Runs that ended otherwise (the player died
// mid-TTK, a timeout) are counted, not mixed into the percentiles.
type Distribution struct {
	Runs     int             `json:"runs"`
	Outcomes map[Outcome]int `json:"outcomes"`

	// Stats over the primary-outcome runs only; all zero when Samples is 0.
	Samples int     `json:"samples"`
	P10     float64 `json:"p10"`
	P50     float64 `json:"p50"`
	P90     float64 `json:"p90"`
	Mean    float64 `json:"mean"`
	Min     float64 `json:"min"`
	Max     float64 `json:"max"`

	// Values are the primary-outcome seconds, ascending — the raw
	// distribution behind the stats, so artifacts (and the -serve UI) can
	// chart/diff the full shape, not just the percentiles.
	Values []float64 `json:"values,omitempty"`
}

// RunDistribution runs the scenario n times with seeds baseSeed..baseSeed+n-1
// and aggregates. The same (scenario, baseSeed, n) reproduces the same
// distribution exactly.
func RunDistribution(sc Scenario, baseSeed int64, n int) Distribution {
	d := Distribution{Runs: n, Outcomes: make(map[Outcome]int)}
	var samples []float64
	for i := 0; i < n; i++ {
		r := RunFight(sc, baseSeed+int64(i))
		d.Outcomes[r.Outcome]++
		if r.Outcome == sc.Primary {
			samples = append(samples, r.Seconds)
		}
	}
	d.Samples = len(samples)
	if d.Samples == 0 {
		return d
	}
	sort.Float64s(samples)
	d.Values = samples
	d.P10 = percentile(samples, 10)
	d.P50 = percentile(samples, 50)
	d.P90 = percentile(samples, 90)
	d.Min = samples[0]
	d.Max = samples[len(samples)-1]
	sum := 0.0
	for _, s := range samples {
		sum += s
	}
	d.Mean = sum / float64(d.Samples)
	return d
}

// percentile is the nearest-rank percentile over an ascending-sorted slice.
func percentile(sorted []float64, p float64) float64 {
	idx := int(math.Ceil(p/100*float64(len(sorted)))) - 1
	if idx < 0 {
		idx = 0
	}
	return sorted[idx]
}

func seconds(ticks int) float64 {
	return float64(ticks) / TicksPerSecond
}
