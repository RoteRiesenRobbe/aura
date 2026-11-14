package accounts_test

import (
	"bufio"
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/auth"
)

// POST /api/bug-reports (plan-bug-report.md D10, D11). The log's own rules
// (one line per record, rate limit, ceiling, concurrency) are pinned in
// bugreports_test.go; these pin what only the endpoint can get wrong.

const bugReportsPath = "/api/bug-reports"

// postRaw sends a body exactly as given, so a test can send bytes no
// json.Marshal would produce (invalid UTF-8, an oversized body).
func (h *harness) postRaw(path string, body []byte) response {
	h.t.Helper()
	r := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("Origin", testOrigin)
	r.RemoteAddr = "203.0.113.7:54321"
	for _, cookie := range h.cookies {
		r.AddCookie(cookie)
	}
	w := httptest.NewRecorder()
	h.handler.ServeHTTP(w, r)
	out := response{code: w.Code}
	if w.Body.Len() > 0 {
		_ = json.Unmarshal(w.Body.Bytes(), &out.body)
	}
	return out
}

func (h *harness) report(message, diagnostics string) response {
	h.t.Helper()
	return h.do(http.MethodPost, bugReportsPath, map[string]any{"message": message, "diagnostics": diagnostics})
}

// bugReportLines reads the file back as decoded records; a missing file is
// zero records.
func (h *harness) bugReportLines() []map[string]any {
	h.t.Helper()
	file, err := os.Open(h.bugReportPath)
	require.NoError(h.t, err)
	defer file.Close()

	var out []map[string]any
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 0, 64<<10), 1<<20)
	for scanner.Scan() {
		var record map[string]any
		require.NoError(h.t, json.Unmarshal(scanner.Bytes(), &record))
		out = append(out, record)
	}
	return out
}

func TestBugReportIsSavedAndItsIdReturned(t *testing.T) {
	h := newHarness(t)
	require.Equal(t, http.StatusCreated, h.createCharacter("Reporter").code)

	got := h.report("the map is blue", "renderer: webgl")
	require.Equal(t, http.StatusCreated, got.code, "%v", got.body)
	id := got.str("id")
	require.NotEmpty(t, id)

	lines := h.bugReportLines()
	require.Len(t, lines, 1)
	assert.Equal(t, id, lines[0]["id"], "the returned id is the written record's")
	assert.Equal(t, "the map is blue", lines[0]["message"])
	assert.Equal(t, "renderer: webgl", lines[0]["diagnostics"])
	accountID := scalarInt(t, h, `SELECT account_id FROM game.characters WHERE name = 'Reporter'`)
	assert.EqualValues(t, accountID, lines[0]["account_id"], "the account comes from the token")
	_, inWorld := lines[0]["character_id"]
	assert.False(t, inWorld, "not in the world: no character id")
}

func TestBugReportNamesTheCharacterInTheWorld(t *testing.T) {
	h := newHarness(t)
	characterID := h.characterID(h.createCharacter("Walker"))
	accountID := scalarInt(t, h, `SELECT account_id FROM game.characters WHERE id = $1`, characterID)
	_, claimed := h.sessions.Claim(auth.Session{AccountID: int64(accountID), CharacterID: characterID})
	require.True(t, claimed)

	require.Equal(t, http.StatusCreated, h.report("stuck", "").code)
	lines := h.bugReportLines()
	require.Len(t, lines, 1)
	assert.EqualValues(t, characterID, lines[0]["character_id"],
		"the character comes from the server's own session, never the body")
}

func TestBugReportRefusesFieldsItDoesNotKnow(t *testing.T) {
	h := newHarness(t)
	require.Equal(t, http.StatusCreated, h.createCharacter("Forger").code)

	got := h.do(http.MethodPost, bugReportsPath,
		map[string]any{"message": "hi", "diagnostics": "", "account_id": 1})
	assert.Equal(t, http.StatusBadRequest, got.code)
	assert.Equal(t, "bad_request", got.errCode())
	assert.Empty(t, h.bugReportLines(), "nothing written")
}

func TestBugReportRefusesInvalidUTF8(t *testing.T) {
	h := newHarness(t)
	require.Equal(t, http.StatusCreated, h.createCharacter("Bytes").code)

	got := h.postRaw(bugReportsPath, []byte("{\"message\":\"bad \xff\xfe\",\"diagnostics\":\"\"}"))
	assert.Equal(t, http.StatusBadRequest, got.code)
	assert.Empty(t, h.bugReportLines())
}

func TestBugReportStripsControlCharacters(t *testing.T) {
	h := newHarness(t)
	require.Equal(t, http.StatusCreated, h.createCharacter("Escaper").code)

	require.Equal(t, http.StatusCreated, h.report("red \x1b[31mtext\r\nnext\tline", "a\x00b").code)
	lines := h.bugReportLines()
	require.Len(t, lines, 1)
	assert.Equal(t, "red [31mtext\nnext\tline", lines[0]["message"])
	assert.Equal(t, "ab", lines[0]["diagnostics"])
}

func TestBugReportCapsEachField(t *testing.T) {
	h := newHarness(t)
	require.Equal(t, http.StatusCreated, h.createCharacter("Talker").code)

	// Multi-byte runes: the caps count characters, not bytes.
	got := h.report(strings.Repeat("ö", 4001), "")
	assert.Equal(t, http.StatusRequestEntityTooLarge, got.code, "message over 4 000 characters")
	assert.Equal(t, "too_large", got.errCode())

	got = h.report("", strings.Repeat("d", 16001))
	assert.Equal(t, http.StatusRequestEntityTooLarge, got.code, "diagnostics over 16 000 characters")

	got = h.report(strings.Repeat("ö", 4000), strings.Repeat("d", 16000))
	assert.Equal(t, http.StatusCreated, got.code, "exactly at both caps is fine")

	assert.Len(t, h.bugReportLines(), 1, "the refused ones wrote nothing")
}

func TestBugReportCapsTheBody(t *testing.T) {
	h := newHarness(t)
	require.Equal(t, http.StatusCreated, h.createCharacter("Flooder").code)

	body := []byte(`{"message":"","diagnostics":"` + strings.Repeat(`\u0000`, 6000) + `"}`)
	require.Greater(t, len(body), 32<<10)
	got := h.postRaw(bugReportsPath, body)
	assert.Equal(t, http.StatusRequestEntityTooLarge, got.code)
	assert.Equal(t, "too_large", got.errCode())
	assert.Empty(t, h.bugReportLines())
}

func TestBugReportIsRateLimited(t *testing.T) {
	h := newHarness(t)
	require.Equal(t, http.StatusCreated, h.createCharacter("Eager").code)

	for i := 0; i < 3; i++ {
		require.Equal(t, http.StatusCreated, h.report("again", "").code, "report %d", i+1)
	}
	got := h.report("a fourth", "")
	assert.Equal(t, http.StatusTooManyRequests, got.code)
	assert.Equal(t, "rate_limited", got.errCode())
	assert.Len(t, h.bugReportLines(), 3)
}
