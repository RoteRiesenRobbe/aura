package auth

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"sync"
	"time"
)

// TicketTTL is how long a play ticket stays redeemable. [PLACEHOLDER]
//
// Long enough to cover opening a WebSocket, short enough that a leaked ticket is
// worthless. ⚑ Do NOT lengthen it to paper over the expiry case: a longer window
// does not fix the closed-laptop case (it only moves it) and every extra second
// is a second a leaked ticket stays usable. The client's answer to an expired
// ticket is one silent retry of /select, not a bigger number
// (plan-accounts-implementation.md §7b).
const TicketTTL = 30 * time.Second

// ticketBytes is the raw ticket size: 256 bits of CSPRNG output, the same
// generation rule the schema doc applies to every lookup token.
const ticketBytes = 32

// ErrTicketUnknown covers unknown, expired and already-redeemed tickets as ONE
// error, deliberately. The presenter learns only "that did not work"; the client
// treats all three identically anyway (silent retry once, then character-select),
// and distinguishing them would tell an attacker probing tickets which guesses
// were once real.
var ErrTicketUnknown = errors.New("auth: unknown or expired play ticket")

// Ticket is what a redeemed play ticket proves: this account, this character.
//
// ⚑ The character id comes OUT of the ticket rather than off the wire. That is
// the entire mechanism — ownership was checked at /select over authenticated
// HTTP, and the socket carries no identity of its own, so a client cannot
// present a ticket for character A and ask to play B (there is nowhere to say B).
type Ticket struct {
	AccountID   int64
	CharacterID int64
}

type ticketEntry struct {
	ticket    Ticket
	expiresAt time.Time
}

// TicketStore is the in-memory play-ticket map.
//
// ⚑ It gets no database table, and that is a decision rather than an omission:
// a row written and deleted inside 30 s is pure write amplification against the
// same database the autosave path uses. Nothing about a ticket needs to survive
// a restart, because a restart drops every live connection anyway
// (plan-accounts-schema.md §"Hashing").
//
// ⚑ Like the throttle, it assumes ONE aurad instance — the same assumption the
// migration advisory lock rests on.
type TicketStore struct {
	mu   sync.Mutex
	ttl  time.Duration
	live map[string]ticketEntry
}

// NewTicketStore builds the map. ttl is a parameter so tests can expire a ticket
// without sleeping for half a minute; production passes TicketTTL.
func NewTicketStore(ttl time.Duration) *TicketStore {
	return &TicketStore{ttl: ttl, live: map[string]ticketEntry{}}
}

// Mint issues a single-use ticket bound to an account and character, returning
// the raw token — the only time it exists in a readable form.
func (s *TicketStore) Mint(t Ticket) (string, error) {
	raw := make([]byte, ticketBytes)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("generating a play ticket: %w", err)
	}
	token := base64.RawURLEncoding.EncodeToString(raw)

	s.mu.Lock()
	defer s.mu.Unlock()
	s.sweepLocked(time.Now())
	s.live[ticketKey(token)] = ticketEntry{ticket: t, expiresAt: time.Now().Add(s.ttl)}
	return token, nil
}

// Redeem burns a ticket and reports what it was bound to. A second redemption of
// the same token fails — that is what "single-use" means, and it is why the
// delete happens before any other check can return early.
func (s *TicketStore) Redeem(token string) (Ticket, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	key := ticketKey(token)
	entry, ok := s.live[key]
	if !ok {
		return Ticket{}, ErrTicketUnknown
	}
	delete(s.live, key)
	if time.Now().After(entry.expiresAt) {
		return Ticket{}, ErrTicketUnknown
	}
	return entry.ticket, nil
}

// Len reports how many tickets are held, expired ones included. For tests and
// diagnostics.
func (s *TicketStore) Len() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.live)
}

// sweepLocked drops expired entries. Redeem removes the ticket it was asked
// about, but a ticket that is minted and never used would otherwise sit in the
// map forever — and /select is reachable by anyone with a session, so "forever"
// is a slow memory leak an authenticated client controls the rate of.
func (s *TicketStore) sweepLocked(now time.Time) {
	for key, entry := range s.live {
		if now.After(entry.expiresAt) {
			delete(s.live, key)
		}
	}
}

// ticketKey is the map key: the SHA-256 of the raw token, never the token.
//
// Same rule as the token columns in the schema — a lookup key must be
// deterministic, and hashing it means a heap dump, a crash log or a stray
// debugger session yields nothing redeemable. SHA-256 is correct rather than a
// compromise here: the input is 256 bits of CSPRNG output, so hash speed buys an
// attacker nothing (plan-accounts-schema.md §"Hashing: lookup keys vs.
// verifiers").
func ticketKey(token string) string {
	return sha256Hex(token)
}
