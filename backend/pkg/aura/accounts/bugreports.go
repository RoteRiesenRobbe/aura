package accounts

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf8"
)

// The server copy of a bug report (plan-bug-report.md D10-D12). The report is
// untrusted input end to end (R4, D11): the handler takes the identity from
// the session alone, caps and cleans the text, and the log writes one
// json.Marshal'ed record per line to a fixed, private, bounded file that no
// route ever serves back.

// bugReportRoute is the one route whose body may exceed maxBodyBytes.
const bugReportRoute = "/api/bug-reports"

// The D11 caps and limits. All [PLACEHOLDER].
const (
	maxBugReportBodyBytes   = 32 << 10
	maxBugReportMessage     = 4000  // characters
	maxBugReportDiagnostics = 16000 // characters

	bugReportBurst       = 3
	bugReportBurstWindow = 10 * time.Minute
	bugReportDaily       = 20
	bugReportDailyWindow = 24 * time.Hour

	maxBugReportFileBytes = 50 << 20
)

var (
	errBugReportRateLimited = errors.New("accounts: bug report rate limit reached")
	errBugReportLogFull     = errors.New("accounts: bug report file is at its ceiling")
)

// bugReportRecord is one line of the file. Read it with `jq`.
type bugReportRecord struct {
	ID          string `json:"id"`
	ReceivedUTC string `json:"received_utc"`
	AccountID   int64  `json:"account_id"`
	// CharacterID is the character the account has in the world, from the
	// server's own session registry; absent when it has none (start screen).
	CharacterID int64  `json:"character_id,omitempty"`
	Message     string `json:"message"`
	Diagnostics string `json:"diagnostics"`
}

// BugReportLog is the append-only report file plus the per-account rate limit.
// Safe for concurrent use. The limit lives in memory: a restart resets it
// (D11 rule 5, accepted).
type BugReportLog struct {
	mu         sync.Mutex
	file       *os.File
	size       int64
	maxBytes   int64
	sent       map[int64][]time.Time // per account, oldest first, within the daily window
	now        func() time.Time
	warnedFull bool
}

// OpenBugReportLog opens (or creates) the file at a path from the conf, never
// from a client (D11 rule 6). Called at boot, so a path aurad cannot write
// fails the boot rather than the first report.
func OpenBugReportLog(path string) (*BugReportLog, error) {
	if path == "" {
		return nil, errors.New("accounts: no bug report file path (server.bugReportsPath)")
	}
	file, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		return nil, fmt.Errorf("accounts: opening the bug report file: %w", err)
	}
	info, err := file.Stat()
	if err != nil {
		_ = file.Close()
		return nil, fmt.Errorf("accounts: reading the bug report file's size: %w", err)
	}
	return &BugReportLog{
		file:     file,
		size:     info.Size(),
		maxBytes: maxBugReportFileBytes,
		sent:     map[int64][]time.Time{},
		now:      time.Now,
	}, nil
}

// Close closes the file.
func (l *BugReportLog) Close() error {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.file.Close()
}

// Append writes one report and returns its id. The text must already be
// cleaned (cleanReportText). A refused report (rate limit, ceiling) writes
// nothing and does not count against the limit.
func (l *BugReportLog) Append(accountID, characterID int64, message, diagnostics string) (string, error) {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := l.now()
	recent := l.prune(accountID, now)
	if len(recent) >= bugReportDaily || countSince(recent, now.Add(-bugReportBurstWindow)) >= bugReportBurst {
		return "", errBugReportRateLimited
	}

	id, err := newReportID()
	if err != nil {
		return "", err
	}
	line, err := json.Marshal(bugReportRecord{
		ID:          id,
		ReceivedUTC: now.UTC().Format(time.RFC3339),
		AccountID:   accountID,
		CharacterID: characterID,
		Message:     message,
		Diagnostics: diagnostics,
	})
	if err != nil {
		return "", err
	}
	line = append(line, '\n')

	if l.size+int64(len(line)) > l.maxBytes {
		if !l.warnedFull {
			l.warnedFull = true
			slog.Warn("🐞 the bug report file is at its ceiling; new reports are refused until it is rotated by hand",
				slog.String("file", l.file.Name()), slog.Int64("bytes", l.size))
		}
		return "", errBugReportLogFull
	}

	// ⚑ ONE Write per record, behind the mutex: with O_APPEND that is what
	// keeps two concurrent reports from interleaving inside a line.
	n, err := l.file.Write(line)
	l.size += int64(n)
	if err != nil {
		return "", fmt.Errorf("accounts: writing a bug report: %w", err)
	}
	l.sent[accountID] = append(recent, now)
	return id, nil
}

// prune drops every account's sends older than the daily window, so the map
// stays bounded by recent reporters, and returns this account's. Reports are
// rare; a full sweep per report is cheap.
func (l *BugReportLog) prune(accountID int64, now time.Time) []time.Time {
	cutoff := now.Add(-bugReportDailyWindow)
	for account, times := range l.sent {
		kept := times[:0]
		for _, at := range times {
			if at.After(cutoff) {
				kept = append(kept, at)
			}
		}
		if len(kept) == 0 {
			delete(l.sent, account)
		} else {
			l.sent[account] = kept
		}
	}
	return l.sent[accountID]
}

func countSince(times []time.Time, cutoff time.Time) int {
	n := 0
	for _, at := range times {
		if at.After(cutoff) {
			n++
		}
	}
	return n
}

func newReportID() (string, error) {
	raw := make([]byte, 8)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("accounts: minting a bug report id: %w", err)
	}
	return hex.EncodeToString(raw), nil
}

// cleanReportText keeps only text (D11 rule 3): invalid UTF-8 is refused, and
// every control character except \n and \t is stripped. That removes ESC, so
// no terminal escape sequence reaches whoever `cat`s the file, and \r, so no
// line-overwrite tricks.
func cleanReportText(s string) (string, bool) {
	if !utf8.ValidString(s) {
		return "", false
	}
	return strings.Map(func(r rune) rune {
		if r == '\n' || r == '\t' || !unicode.IsControl(r) {
			return r
		}
		return -1
	}, s), true
}

// bugReportRequest is the whole body. Unknown fields are refused here (unlike
// decodeBody's tolerance): the body names no identity, and a client trying to
// send one is refused rather than ignored.
type bugReportRequest struct {
	Message     string `json:"message"`
	Diagnostics string `json:"diagnostics"`
}

type bugReportResponse struct {
	ID string `json:"id"`
}

// handleBugReport is POST /api/bug-reports (D10, D11).
func (s *Server) handleBugReport(w http.ResponseWriter, r *http.Request) {
	// Rule 1: logged in, and the identity is the token's. Checked before the
	// body is read, so a stranger costs nothing.
	who, ok := s.requireCaller(w, r)
	if !ok {
		return
	}

	// Rule 2: withCORS already bounds the body at maxBugReportBodyBytes.
	raw, err := io.ReadAll(r.Body)
	var tooBig *http.MaxBytesError
	switch {
	case errors.As(err, &tooBig):
		refuse(w, http.StatusRequestEntityTooLarge, codeTooLarge, msgTooLarge)
		return
	case err != nil:
		refuse(w, http.StatusBadRequest, codeBadRequest, msgBadRequest)
		return
	}
	// Rule 3, before decoding: encoding/json would silently turn invalid
	// UTF-8 into U+FFFD, which would hide a client sending raw bytes.
	if !utf8.Valid(raw) {
		refuse(w, http.StatusBadRequest, codeBadRequest, msgBadRequest)
		return
	}
	var body bugReportRequest
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&body); err != nil {
		refuse(w, http.StatusBadRequest, codeBadRequest, msgBadRequest)
		return
	}
	if utf8.RuneCountInString(body.Message) > maxBugReportMessage ||
		utf8.RuneCountInString(body.Diagnostics) > maxBugReportDiagnostics {
		refuse(w, http.StatusRequestEntityTooLarge, codeTooLarge, msgTooLarge)
		return
	}
	message, okMessage := cleanReportText(body.Message)
	diagnostics, okDiagnostics := cleanReportText(body.Diagnostics)
	if !okMessage || !okDiagnostics {
		refuse(w, http.StatusBadRequest, codeBadRequest, msgBadRequest)
		return
	}

	var characterID int64
	if live, inWorld := s.cfg.Sessions.Live(who.accountID); inWorld {
		characterID = live.CharacterID
	}

	id, err := s.cfg.BugReports.Append(who.accountID, characterID, message, diagnostics)
	switch {
	case errors.Is(err, errBugReportRateLimited):
		refuse(w, http.StatusTooManyRequests, codeRateLimited, msgRateLimited)
	case errors.Is(err, errBugReportLogFull):
		refuse(w, http.StatusInsufficientStorage, codeReportsFull, msgReportsFull)
	case err != nil:
		fail(w, r, http.StatusInternalServerError, codeInternal, msgGeneric, err)
	default:
		writeJSON(w, http.StatusCreated, bugReportResponse{ID: id})
	}
}
