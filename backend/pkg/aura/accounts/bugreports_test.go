package accounts

import (
	"bufio"
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The bug report log on its own (plan-bug-report.md D11): no database, no
// HTTP. The endpoint's own rules (JWT, caps, unknown fields) are pinned in
// bugreports_endpoint_test.go against the real handler.

func openTestLog(t *testing.T) (*BugReportLog, string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "bug-reports.jsonl")
	log, err := OpenBugReportLog(path)
	require.NoError(t, err)
	t.Cleanup(func() { _ = log.Close() })
	return log, path
}

func readRecords(t *testing.T, path string) []bugReportRecord {
	t.Helper()
	file, err := os.Open(path)
	require.NoError(t, err)
	defer file.Close()

	var out []bugReportRecord
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 0, 64<<10), 1<<20)
	for scanner.Scan() {
		var record bugReportRecord
		require.NoError(t, json.Unmarshal(scanner.Bytes(), &record), "line %q", scanner.Text())
		out = append(out, record)
	}
	require.NoError(t, scanner.Err())
	return out
}

func TestBugReportIsOneLineThatReadsBackVerbatim(t *testing.T) {
	log, path := openTestLog(t)

	// A message built to forge a second record if the writer ever let a raw
	// newline through.
	forged := "it broke\n{\"id\":\"forged\",\"account_id\":1}\n\"quoted\""
	id, err := log.Append(7, 42, forged, "fps check: 60\ngpu: x")
	require.NoError(t, err)
	assert.Len(t, id, 16, "the id is 8 random bytes in hex")

	raw, err := os.ReadFile(path)
	require.NoError(t, err)
	assert.Equal(t, 1, strings.Count(string(raw), "\n"), "exactly one line: %q", raw)

	records := readRecords(t, path)
	require.Len(t, records, 1)
	got := records[0]
	assert.Equal(t, id, got.ID)
	assert.Equal(t, int64(7), got.AccountID)
	assert.Equal(t, int64(42), got.CharacterID)
	assert.Equal(t, forged, got.Message)
	assert.Equal(t, "fps check: 60\ngpu: x", got.Diagnostics)
	_, err = time.Parse(time.RFC3339, got.ReceivedUTC)
	assert.NoError(t, err, "received_utc is RFC 3339: %q", got.ReceivedUTC)
}

func TestBugReportFileIsPrivate(t *testing.T) {
	// Windows has no Unix modes: Stat reports 0666 for any writable file.
	if runtime.GOOS == "windows" {
		t.Skip("file modes are Unix-only")
	}
	_, path := openTestLog(t)
	info, err := os.Stat(path)
	require.NoError(t, err)
	assert.Equal(t, os.FileMode(0o600), info.Mode().Perm())
}

func TestBugReportLogAppendsAcrossReopen(t *testing.T) {
	path := filepath.Join(t.TempDir(), "bug-reports.jsonl")
	first, err := OpenBugReportLog(path)
	require.NoError(t, err)
	_, err = first.Append(1, 0, "one", "")
	require.NoError(t, err)
	require.NoError(t, first.Close())

	second, err := OpenBugReportLog(path)
	require.NoError(t, err)
	defer second.Close()
	_, err = second.Append(1, 0, "two", "")
	require.NoError(t, err)

	records := readRecords(t, path)
	require.Len(t, records, 2, "a restart appends, never truncates")
	assert.Equal(t, "one", records[0].Message)
	assert.Equal(t, "two", records[1].Message)
}

func TestCleanReportTextStripsControlCharacters(t *testing.T) {
	cleaned, ok := cleanReportText("a\x1b[31mred\x1b[0m\r\nline\ttab\x00\x7f\u0085end")
	require.True(t, ok)
	assert.Equal(t, "a[31mred[0m\nline\ttabend", cleaned,
		"ESC, CR, NUL, DEL and C1 controls go; \\n and \\t stay")
}

func TestCleanReportTextRefusesInvalidUTF8(t *testing.T) {
	_, ok := cleanReportText("fine \xff\xfe not fine")
	assert.False(t, ok)
}

func TestCleanReportTextKeepsOrdinaryUnicode(t *testing.T) {
	cleaned, ok := cleanReportText("Größe · 42 ms — ✓")
	require.True(t, ok)
	assert.Equal(t, "Größe · 42 ms — ✓", cleaned)
}

func TestBugReportRateLimitPerAccount(t *testing.T) {
	log, path := openTestLog(t)
	now := time.Date(2026, 11, 14, 12, 0, 0, 0, time.UTC)
	log.now = func() time.Time { return now }

	for i := 0; i < bugReportBurst; i++ {
		_, err := log.Append(1, 0, "ok", "")
		require.NoError(t, err, "report %d", i+1)
	}
	_, err := log.Append(1, 0, "one too many", "")
	assert.ErrorIs(t, err, errBugReportRateLimited)

	_, err = log.Append(2, 0, "another account", "")
	assert.NoError(t, err, "the limit is per account")

	now = now.Add(bugReportBurstWindow)
	_, err = log.Append(1, 0, "window passed", "")
	assert.NoError(t, err)

	assert.Len(t, readRecords(t, path), bugReportBurst+2, "a refused report writes nothing")
}

func TestBugReportDailyCap(t *testing.T) {
	log, _ := openTestLog(t)
	now := time.Date(2026, 11, 14, 0, 0, 0, 0, time.UTC)
	log.now = func() time.Time { return now }

	for i := 0; i < bugReportDaily; i++ {
		_, err := log.Append(1, 0, "ok", "")
		require.NoError(t, err, "report %d", i+1)
		// Spaced so the burst window never bites.
		now = now.Add(bugReportBurstWindow)
	}
	_, err := log.Append(1, 0, "over the day", "")
	assert.ErrorIs(t, err, errBugReportRateLimited)

	now = now.Add(bugReportDailyWindow)
	_, err = log.Append(1, 0, "next day", "")
	assert.NoError(t, err)
}

func TestBugReportLogRefusesPastItsCeiling(t *testing.T) {
	log, path := openTestLog(t)
	// A record is its text plus ~100 bytes of JSON: 150 fits in 300, a
	// second record does not.
	log.maxBytes = 300

	_, err := log.Append(1, 0, strings.Repeat("x", 150), "")
	require.NoError(t, err, "the first report fits")
	_, err = log.Append(2, 0, "small", "")
	assert.ErrorIs(t, err, errBugReportLogFull)
	assert.Len(t, readRecords(t, path), 1, "nothing written past the ceiling")
}

func TestBugReportCeilingCountsTheExistingFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "bug-reports.jsonl")
	require.NoError(t, os.WriteFile(path, []byte(strings.Repeat("x", 300)+"\n"), 0o600))

	log, err := OpenBugReportLog(path)
	require.NoError(t, err)
	defer log.Close()
	log.maxBytes = 200

	_, err = log.Append(1, 0, "after a restart", "")
	assert.ErrorIs(t, err, errBugReportLogFull, "a restart must not reset the ceiling")
}

func TestConcurrentBugReportsWriteWholeLines(t *testing.T) {
	log, path := openTestLog(t)
	big := strings.Repeat("y", 8000)

	const writers = 2
	var wg sync.WaitGroup
	for i := 0; i < writers; i++ {
		wg.Add(1)
		go func(account int64) {
			defer wg.Done()
			_, err := log.Append(account, 0, big, big)
			assert.NoError(t, err)
		}(int64(i + 1))
	}
	wg.Wait()

	records := readRecords(t, path)
	require.Len(t, records, writers)
	for _, record := range records {
		assert.Equal(t, big, record.Message)
	}
}
