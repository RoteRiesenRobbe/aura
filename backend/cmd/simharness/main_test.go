package main

import (
	"flag"
	"io"
	"testing"

	"github.com/stretchr/testify/assert"
)

// TestVisitedXPFlags pins the -serve guard's input (plan-code-health.md C7
// B3): the explorer page owns its numbers, so every -xp-* flag is dropped in
// -serve mode — and the seven kill-taper knobs are not even expressible in the
// page. Silently ignoring an explicitly typed flag is how a calibration
// session explores the wrong economy with confidence, so -serve refuses the
// combination, and this helper is the detection.
func TestVisitedXPFlags(t *testing.T) {
	// A miniature of main()'s flag surface: the two curve XP flags, one kill
	// knob, and a non-XP flag that must never trip the guard.
	parse := func(t *testing.T, args ...string) *flag.FlagSet {
		t.Helper()
		fs := flag.NewFlagSet("simharness", flag.ContinueOnError)
		fs.SetOutput(io.Discard)
		fs.Float64("xp-base", 300, "")
		fs.Float64("xp-kill-taper-stretch", 1.0, "")
		fs.Int("runs", 200, "")
		fs.String("serve", "", "")
		assert.NoError(t, fs.Parse(args))
		return fs
	}

	t.Run("nothing set", func(t *testing.T) {
		fs := parse(t, "-serve", "localhost:8081")
		assert.Empty(t, visitedXPFlags(fs.Visit))
	})

	t.Run("a kill knob set", func(t *testing.T) {
		fs := parse(t, "-serve", "localhost:8081", "-xp-kill-taper-stretch", "2")
		assert.Equal(t, []string{"xp-kill-taper-stretch"}, visitedXPFlags(fs.Visit))
	})

	t.Run("several set, non-XP flags do not count", func(t *testing.T) {
		fs := parse(t, "-xp-base", "400", "-runs", "50", "-xp-kill-taper-stretch", "2")
		assert.ElementsMatch(t, []string{"xp-base", "xp-kill-taper-stretch"},
			visitedXPFlags(fs.Visit))
	})

	// ⚑ Set-to-the-default still counts: the person TYPED the flag, so they
	// believe it does something. flag.Visit sees exactly that.
	t.Run("explicitly set to its default", func(t *testing.T) {
		fs := parse(t, "-xp-base", "300")
		assert.Equal(t, []string{"xp-base"}, visitedXPFlags(fs.Visit))
	})
}
