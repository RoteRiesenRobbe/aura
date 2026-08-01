package auth

import "sync"

// Session is one account's live world session — which character of theirs is in
// the world right now.
type Session struct {
	AccountID   int64
	CharacterID int64

	// Stashed marks a session whose socket has dropped but whose character is
	// still held in the reconnect stash — the page-refresh-during-play window
	// (~10 min).
	//
	// ⚑ IT IS THE DIFFERENCE BETWEEN "resuming" AND "duplicating"
	// (plan-accounts-implementation.md §5). A stashed session still occupies the
	// account's slot, so without this flag a reconnecting player is
	// indistinguishable from a second tab: /select refuses to mint them a
	// ticket, and the reconnect path — the one feature that exists for exactly
	// this case — cannot prove who it is.
	//
	// ⚑ The registry carries it rather than the game because /select has to read
	// it, and an HTTP handler must not reach into the ECS world (§10 invariant
	// 3). This keeps the handler depending on `auth` alone.
	Stashed bool
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

	// ⚑ A STASHED session does not block a claim — it is taken over. That is the
	// reconnect exemption, and putting it here rather than in the caller is what
	// keeps it atomic: a check-then-claim split would let a second tab win the
	// slot between the two calls, which is the exact race the atomicity exists
	// to prevent. A CONNECTED session always blocks, whoever asks.
	if held, taken := r.live[s.AccountID]; taken && !held.Stashed {
		return held, false
	}
	r.live[s.AccountID] = s
	return Session{}, true
}

// Stash marks the account's session as disconnected-but-held, reporting whether
// one was there to mark.
//
// ⚑ Called when the socket drops, NOT when the player leaves. The slot stays
// occupied — an account with a stashed session is still "in the world" as far
// as a second cold login is concerned — but a reconnect may now take it over.
func (r *SessionRegistry) Stash(accountID int64) bool {
	r.mu.Lock()
	defer r.mu.Unlock()

	held, ok := r.live[accountID]
	if !ok || held.Stashed {
		return false
	}
	held.Stashed = true
	r.live[accountID] = held
	return true
}

// Connected reports whether the account holds a session with a live socket —
// the question /select asks before minting a ticket.
//
// ⚑ NOT the same as Live(). A stashed session is live (it holds the slot) but
// not connected, and refusing a ticket for it would break the reconnect path.
func (r *SessionRegistry) Connected(accountID int64) (Session, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()

	s, ok := r.live[accountID]
	if !ok || s.Stashed {
		return Session{}, false
	}
	return s, true
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
