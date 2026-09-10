// Package golden holds the compare-or-rewrite helper behind the repo's
// generated content fixtures (plan-content-editor.md §B4.2).
//
// The pattern: a Go table is the single source of truth, a checked-in JSON
// file beside it is the copy every non-Go reader consumes, and a test in the
// owning package regenerates that file on demand and otherwise pins it. Go is
// the single writer, so the fixture cannot be hand-edited into a lie: the next
// test run either agrees or names the command that fixes it.
//
// It lives in a normal (non-test) package rather than in an _test.go helper
// because the fixture is per content kind: skills own the first one, a mob
// vocabulary can follow later without a second copy of this logic.
package golden

import (
	"bytes"
	"encoding/json"
	"os"
	"path"
	"runtime"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Check compares value, marshalled as 2-space-indented JSON with a trailing
// newline, against the file at path. Setting the environment variable named by
// updateEnv to any non-empty value rewrites the file instead of comparing,
// which is how the fixture is regenerated after a Go table changes.
func Check(t testing.TB, path, updateEnv string, value any) {
	t.Helper()
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetIndent("", "  ")
	enc.SetEscapeHTML(false)
	require.NoError(t, enc.Encode(value))

	if os.Getenv(updateEnv) != "" {
		require.NoError(t, os.WriteFile(path, buf.Bytes(), 0o644))
		t.Logf("golden: rewrote %s (%s was set)", path, updateEnv)
		return
	}

	regen := updateEnv + "=1 go test -count=1 " + callerPackage()
	onDisk, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("golden: cannot read %s (%v) - regenerate it with: %s", path, err, regen)
	}
	assert.JSONEq(t, buf.String(), string(onDisk),
		"golden: %s has drifted from the Go tables that write it - regenerate it with: %s", path, regen)
}

// callerPackage names the calling test's package the way `go test` takes it,
// so the failure message carries a command that can be pasted as-is.
func callerPackage() string {
	_, file, _, ok := runtime.Caller(2)
	if !ok {
		return "./..."
	}
	dir := path.Dir(strings.ReplaceAll(file, "\\", "/"))
	if i := strings.Index(dir, "/pkg/"); i >= 0 {
		return "." + dir[i:] + "/"
	}
	return "./..."
}
