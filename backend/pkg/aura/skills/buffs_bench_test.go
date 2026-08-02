package skills

import (
	"fmt"
	"testing"
)

// Buff-store scaling in the number of distinct CASTERS on one entity.
//
// Round-7 item 6 re-keyed dot streams by (caster, HP), so k casters of the same
// skill on one target now hold k entries in entries[source] where they used to
// collapse to 1. Two scans walk that slice:
//
//   - DueBuffEvents (once per entity per tick) calls dotSuppressed per dot, and
//     dotSuppressed scans the whole slice ⇒ O(k²) per entity per tick.
//   - ApplyDot linear-scans the slice to find the caller's own stream ⇒ O(k)
//     per application.
//
// k = 1 is the old behaviour and the solo case; 140 is the clustered load-test
// population (devops/loadtest.md). Every caster carries the same HP — bots at
// the same skill level — which is also the worst case for dotSuppressed, since
// suppression needs same caster AND greater HP, so no entry is ever skipped.
//
// Run:  go test ./pkg/aura/skills -run XXX -bench 'BenchmarkBuffs' -benchmem

var casterCounts = []int{1, 10, 50, 140}

// dotStore returns a store holding one dot stream per caster under one skill.
func dotStore(casters int) *Buffs {
	b := &Buffs{}
	for i := 0; i < casters; i++ {
		caster := new(int) // distinct identity per caster
		b.ApplyDot(1, DotBuff{HP: 3, Interval: 10, Caster: caster}, 300)
	}
	return b
}

// BenchmarkBuffsDueBuffEvents measures one entity's per-tick drain.
func BenchmarkBuffsDueBuffEvents(b *testing.B) {
	for _, k := range casterCounts {
		b.Run(fmt.Sprintf("casters=%d", k), func(b *testing.B) {
			store := dotStore(k)
			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				dots, hots := store.DueBuffEvents()
				_, _ = dots, hots
			}
		})
	}
}

// BenchmarkBuffsApplyDotRefresh measures one caster re-applying into a store
// that already holds k streams — the aura/cooldown re-application path.
func BenchmarkBuffsApplyDotRefresh(b *testing.B) {
	for _, k := range casterCounts {
		b.Run(fmt.Sprintf("casters=%d", k), func(b *testing.B) {
			store := dotStore(k)
			// refresh the LAST-added stream: the full-scan case, which is what
			// every caster but the first pays.
			last := store.entries[1][k-1].payload.(*dotPayload).dot.Caster
			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				store.ApplyDot(1, DotBuff{HP: 3, Interval: 10, Caster: last}, 300)
			}
		})
	}
}
