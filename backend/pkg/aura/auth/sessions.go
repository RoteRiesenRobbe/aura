package auth

import "sync"

// Session is one account's live world session — which character of theirs is in
// the world right now.
type Session struct {
	AccountID   int64
	CharacterID int64
}

// SessionRegistry enforces ONE LIVE SESSION PER ACCOUNT.
//
// ⚑ Per account, not per character. The distinction is the whole rule: a
// per-character registry passes the obvious test (the same character twice) while
// happily letting one player run all three of their characters in three tabs
// (plan-accounts-frontend.md §1, §11).
//
// ⚑ SCOPE — this type is chunk 1b's; its WIRING is chunk 3's. 1b builds a
// self-contained, unit-testable thing that owns "which account is live, claimed
// atomically"; chunk 3 hangs it off ConnectionStateSystem (sys/state.go), where
// the Join path and the reconnect stash already live and where the reconnect
// exemption has the context it needs. Splitting the type from its wiring follows
// a seam that already exists rather than inventing one — recorded as the ruling
// on the open question in plan-accounts-frontend.md §10.
type SessionRegistry struct {
	mu   sync.Mutex
	live map[int64]Session
}

func NewSessionRegistry() *SessionRegistry {
	return &SessionRegistry{live: map[int64]Session{}}
}

// Claim registers a session for an account, atomically. It reports the session
// already holding the account's slot and false when there is one.
//
// ⚑ The atomicity is the point, not the map. Two valid play tickets presented
// concurrently must yield exactly one live session, and a check-then-set split
// across two calls is a race that only shows up under real load — so there is
// deliberately no Live()-then-Claim() idiom to reach for.
//
// ⚑ It returns the CONFLICTING session rather than a bare false so the caller
// can implement the reconnect exemption: a player resuming their own session
// after a disconnect is the same (account, character) coming back, not a second
// login. That comparison is chunk 3's, because only the stash knows whether the
// existing session is a live socket or a disconnected one awaiting return.
func (r *SessionRegistry) Claim(s Session) (existing Session, ok bool) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if held, taken := r.live[s.AccountID]; taken {
		return held, false
	}
	r.live[s.AccountID] = s
	return Session{}, true
}

// Release frees an account's slot, reporting whether one was held.
func (r *SessionRegistry) Release(accountID int64) bool {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, held := r.live[accountID]; !held {
		return false
	}
	delete(r.live, accountID)
	return true
}

// Live reports the account's session, if any.
func (r *SessionRegistry) Live(accountID int64) (Session, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()

	s, ok := r.live[accountID]
	return s, ok
}

// Count reports how many accounts are live. For tests and diagnostics.
func (r *SessionRegistry) Count() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.live)
}
