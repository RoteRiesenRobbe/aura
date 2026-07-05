package vitals

import "testing"

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
