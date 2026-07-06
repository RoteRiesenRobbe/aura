package vitals

import (
	"math/rand"
	"testing"
)

func TestHP_RoundsWithMinOneRule(t *testing.T) {
	cases := []struct {
		in   float32
		want uint32
	}{
		{-1, 0},    // negative → nothing
		{0, 0},     // zero → nothing
		{0.001, 1}, // tiny positive → at least 1 (a real hit never rounds to 0)
		{0.4, 1},
		{0.5, 1},
		{1.4, 1},
		{1.5, 2},
		{2.6, 3},
		{8, 8},
	}
	for _, c := range cases {
		if got := HP(c.in); got != c.want {
			t.Errorf("HP(%v) = %d, want %d", c.in, got, c.want)
		}
	}
}

func TestRollVariance_ZeroIsExactAndDrawsNothing(t *testing.T) {
	rnd := rand.New(rand.NewSource(1))
	before := rnd.Float32()
	rnd = rand.New(rand.NewSource(1))

	if got := RollVariance(42, 0, rnd); got != 42 {
		t.Errorf("variance 0 must return the exact center: got %v", got)
	}
	// A zero-variance roll must not consume from the RNG, so seeded sequences
	// (mob drop rolls) stay unchanged for variance-free definitions.
	if got := rnd.Float32(); got != before {
		t.Errorf("variance 0 consumed an RNG draw: next value %v, want %v", got, before)
	}
}

func TestRollVariance_StaysInBandAndHitsBothHalves(t *testing.T) {
	rnd := rand.New(rand.NewSource(7))
	const center, variance = 100.0, 0.1
	low, high := false, false
	for i := 0; i < 1000; i++ {
		got := RollVariance(center, variance, rnd)
		if got < center*(1-variance) || got > center*(1+variance) {
			t.Fatalf("roll %v outside band [%v, %v]", got, center*(1-variance), center*(1+variance))
		}
		if got < center {
			low = true
		}
		if got > center {
			high = true
		}
	}
	if !low || !high {
		t.Errorf("1000 rolls never left one half of the band (low=%v high=%v)", low, high)
	}
}

func TestAddCapped_ClampsAtMax(t *testing.T) {
	if got := VitalSign(50).AddCapped(10, 100); got != 60 {
		t.Errorf("under cap: got %d, want 60", got)
	}
	if got := VitalSign(95).AddCapped(10, 100); got != 100 {
		t.Errorf("over cap must clamp: got %d, want 100", got)
	}
	if got := VitalSign(100).AddCapped(0, 100); got != 100 {
		t.Errorf("already full: got %d, want 100", got)
	}
}
