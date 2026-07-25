package core

// Load-test instrumentation — kept for capacity checks (see devops/loadtest.md).
// Inert unless aurad is started with -profile; costs one atomic + one array
// write per tick otherwise.
//
// The game loop only reports when a tick blows the 33 ms budget entirely
// ("Overload! Systems at: N%"). For capacity testing we need the shape of the
// distribution well below that line, so this records every tick's wall-clock
// into a fixed ring and reports percentiles on demand.

import (
	"sort"
	"sync"
)

const tickSampleCapacity = 8192

type tickStatsRecorder struct {
	mu      sync.Mutex
	samples [tickSampleCapacity]int64 // microseconds
	next    int
	total   uint64
}

// TickStats collects per-tick durations for the profiling endpoint.
var TickStats tickStatsRecorder

func (t *tickStatsRecorder) record(micros int64) {
	t.mu.Lock()
	t.samples[t.next%tickSampleCapacity] = micros
	t.next++
	t.total++
	t.mu.Unlock()
}

// TickSummary reports percentiles over the retained samples, in microseconds.
type TickSummary struct {
	Samples    int    `json:"samples"`
	TotalTicks uint64 `json:"total_ticks"`
	P50        int64  `json:"p50_us"`
	P95        int64  `json:"p95_us"`
	P99        int64  `json:"p99_us"`
	Max        int64  `json:"max_us"`
	BudgetUs   int64  `json:"budget_us"`
	// RecoveredPanics is process-lifetime, not per-ring: unlike the latency
	// samples it is never reset, because "this server has aborted N ticks" is
	// a fact about the run, not about the current measurement window.
	RecoveredPanics uint64 `json:"recovered_panics"`
}

// Summarize snapshots the ring. It does not reset it — call Reset between
// load steps so each step measures only its own traffic.
func (t *tickStatsRecorder) Summarize() TickSummary {
	t.mu.Lock()
	n := t.next
	if n > tickSampleCapacity {
		n = tickSampleCapacity
	}
	buf := make([]int64, n)
	copy(buf, t.samples[:n])
	total := t.total
	t.mu.Unlock()

	s := TickSummary{
		Samples:         n,
		TotalTicks:      total,
		BudgetUs:        stepMillis * 1000,
		RecoveredPanics: RecoveredPanics(),
	}
	if n == 0 {
		return s
	}
	sort.Slice(buf, func(i, j int) bool { return buf[i] < buf[j] })
	at := func(q float64) int64 {
		i := int(q * float64(n))
		if i >= n {
			i = n - 1
		}
		return buf[i]
	}
	s.P50, s.P95, s.P99, s.Max = at(0.50), at(0.95), at(0.99), buf[n-1]
	return s
}

// Reset clears the retained samples so the next step starts clean.
func (t *tickStatsRecorder) Reset() {
	t.mu.Lock()
	t.next = 0
	t.mu.Unlock()
}
