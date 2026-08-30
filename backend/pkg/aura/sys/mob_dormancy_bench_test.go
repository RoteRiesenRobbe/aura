package sys

// The S3 before/after, measured (plan-world-scale.md §8: "re-run the probe
// ladder after S3 and state the new break point beside the old one").
//
// This is the cheap in-process half of that: it measures the two things F3
// names — MobSystem.Update (mob AI) and Space.Update (the per-tick reset,
// re-bound and re-insert of every mob's ~3 collision shapes) — over a world of
// N mobs with a handful of players in it, dormancy off vs on. It is not a
// substitute for the probe ladder on a real server, but it moves the same
// numbers and runs in seconds.
//
//	go test ./pkg/aura/sys/ -run XXX -bench DormancyTick -benchtime 200x
//
// Read it as a RATIO between the two rows at the same mob count; the absolute
// milliseconds are this machine's, exactly as M0.1's were.

import (
	"fmt"
	"math/rand"
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/world"
)

// benchWorld lays mobs out at the authored density of world.json (46.8 spawns
// per 1 000 sq u) so the area implied by a mob count matches the real map's.
const benchDensityPerSqUnit = 0.0468

func benchSpawns(n int) []world.Spawn {
	side := float32(0)
	for side*side < float32(n)/benchDensityPerSqUnit {
		side += 10
	}
	rnd := rand.New(rand.NewSource(7))
	spawns := make([]world.Spawn, 0, n)
	for i := 0; i < n; i++ {
		def := testMobDef()
		def.Factors.Speed = 1
		spawns = append(spawns, world.Spawn{
			Def: def,
			X:   (rnd.Float32() - 0.5) * side,
			Y:   (rnd.Float32() - 0.5) * side,
		})
	}
	return spawns
}

// benchPlayers scatters a few wake sources, as dispersed players.
func benchPlayers(n int, side float32) []phy.Vec2f {
	rnd := rand.New(rand.NewSource(11))
	out := make([]phy.Vec2f, 0, n)
	for i := 0; i < n; i++ {
		out = append(out, phy.Vec2f{
			X: (rnd.Float32() - 0.5) * side,
			Y: (rnd.Float32() - 0.5) * side,
		})
	}
	return out
}

func benchDormancy(b *testing.B, mobCount int, dormancy bool) {
	space := phy.NewSpace()
	g := newFakeGame()
	g.cfg.MobWakeMargin = testWakeMargin
	g.cfg.MobSleepMargin = testSleepMargin
	g.space = space
	ms := NewMobSystem(g, 42, benchSpawns(mobCount), space)
	g.ms = ms

	side := float32(0)
	for side*side < float32(mobCount)/benchDensityPerSqUnit {
		side += 10
	}
	if dormancy {
		ms.SetWakeSources(&fakeWakeSources{positions: benchPlayers(10, side)})
	}

	ms.Update(0) // spawn everything
	space.Update()
	// Let dormancy settle before the timed window, so we measure the steady
	// state rather than the one-off first sleep.
	for i := 0; i < dormancyCheckInterval*2; i++ {
		ms.Update(0)
		space.Update()
		g.tick++
	}

	awake := 0
	for _, m := range ms.mobs {
		if d, ok := m.(dormantMob); ok && !d.Dormant() {
			awake++
		}
	}
	b.ReportMetric(float64(awake), "awake")

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		ms.Update(0)  // both halves of F3: the AI…
		space.Update() // …and the shape walk
		g.tick++
	}
}

func BenchmarkDormancyTick(b *testing.B) {
	for _, mobs := range []int{500, 5000, 15000} {
		for _, on := range []bool{false, true} {
			name := fmt.Sprintf("mobs=%d/dormancy=%v", mobs, on)
			b.Run(name, func(b *testing.B) { benchDormancy(b, mobs, on) })
		}
	}
}
