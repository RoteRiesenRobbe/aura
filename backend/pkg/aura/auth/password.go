// Package auth is aura's native authentication layer: password hashing,
// credential validation, JWT issue/verify, the play-ticket TTL map, the
// failed-login throttle and the account-scoped live-session registry.
//
// It is deliberately free of HTTP and of game code. The endpoints that call it
// arrive in chunk 1c; the wiring of SessionRegistry into sys/state.go arrives in
// chunk 3. Everything here is pure Go and unit-tested in isolation, which is the
// whole point of the chunk boundary — see docs/plan-accounts-frontend.md §10.
//
// The design lives in docs/plan-accounts-implementation.md §7 (what auth is)
// and §7b (how identity reaches the server). Three rules from there are load
// bearing and easy to undo by accident:
//
//   - A missing username must still cost a bcrypt comparison, or "no such user"
//     is measurably faster than "wrong password" and the equalised error
//     messages protect nothing. Gate.Verify makes that structural.
//   - The throttle delay is applied AFTER that comparison, never instead of it,
//     for the same reason. See Throttle.Wait.
//   - Every bcrypt call goes through a Gate, because aurad hashes passwords in
//     the same process that runs a 30 Hz game loop. See Gate.
package auth

import (
	"context"
	"errors"

	"golang.org/x/crypto/bcrypt"
)

// bcryptCost is stated explicitly rather than inherited — a library default is
// not a decision (plan-accounts-implementation.md §7b, hardening checklist).
// [PLACEHOLDER]
//
// 11, chosen against measurement on the dev box: cost 10 (the x/crypto default)
// is 130 ms, 11 is 263 ms and 12 is 526 ms. 12 is the common recommendation, but
// half a second is already visible login latency.
//
// ⚑ THAT MEASUREMENT IS THE DEV BOX, AND THE LIVE ONE IS SLOWER. The Hetzner
// CX23 vCPU runs ~3.4× less loop work per second than this machine
// (plan-intermission-triage.md), which extrapolates to roughly 0.9 s per hash
// there — past "visible" and into "bad". The extrapolation is from loop work
// rather than from bcrypt, so it is an estimate, not a reading: measure on the
// VPS while provisioning it (implementation.md §0 step B) and re-pick this
// value against that number.
//
// ⚑ Raising or lowering it invalidates nothing — bcrypt stores its cost in the
// hash, so existing hashes keep verifying at the cost they were written with.
// Re-hash on next successful login if it ever needs to move.
const bcryptCost = 11

// MaxPasswordBytes is bcrypt's hard input limit. Anything longer is SILENTLY
// TRUNCATED by the algorithm, so it has to be a validation error rather than a
// surprise: without this, "correct horse battery staple …" and the same string
// with a different 90th character are the same password.
const MaxPasswordBytes = 72

// DefaultGateSlots is how many password hashes may run at once. [PLACEHOLDER]
//
// Sized against the live box, which has 2 vCPU. The game loop is a single
// goroutine (core/game.go: `for { update(); <-ticker.C }`), so it structurally
// cannot use more than one of them however busy it gets.
//
// ⚑ THAT DOES NOT MAKE A HASH FREE, AND AN EARLIER VERSION OF THIS COMMENT SAID
// IT DID. The second core is not idle under load: the measured 147 % peak at the
// clustered break point decomposes as roughly `loop 1.0 + websocket write
// goroutines 0.47` (devops/loadtest.md, "Server-side during the ramps"), leaving
// about 0.53 cores actually spare. A hash wants a whole one, so at that point it
// contends — both it and the tick stretch. Accurate version:
//
//   - At idle (~0.21 core) and moderate load, a hash really is close to free.
//   - At the break point one hash oversubscribes the box by ~20 %, and two by
//     ~74 %, for the ~0.9 s it runs.
//
// TWO, not one, is a deliberate trade (PO 2026-08-01). The principled bound is
// GOMAXPROCS-1 — never admit more hash work than the loop can never consume —
// which is 1 slot here and protects the tick better. It was weighed and not
// taken, for burst tolerance: 20 simultaneous fresh logins serialise into ~18 s
// at one slot against ~9 s at two, and the tail of that queue gets a 503.
//
// What keeps either choice small in practice is that BURSTS ARE MOSTLY NOT
// HASHES — see the note on Gate. Revisit against a measurement on the VPS,
// alongside bcryptCost.
const DefaultGateSlots = 2

// ErrBusy means the work was NOT performed — the gate was full and the caller's
// context ran out while queued.
//
// ⚑ It is emphatically not "wrong password". A handler that conflates the two
// tells a player their credentials are bad when the server was merely busy, and
// burns a throttle step against them for the server's own load. Map it to a 503
// and leave the counters alone.
var ErrBusy = errors.New("auth: too many password operations in flight")

// dummyHash is a real bcrypt hash at bcryptCost, used so a login for a username
// that does not exist still pays for a comparison.
//
// ⚑ It is a literal rather than computed at init because computing it costs a
// full bcrypt round on every process start, including every `go test` run. The
// risk that trades against — the literal drifting out of step with bcryptCost,
// silently restoring the timing oracle — is closed by TestDummyHashMatchesCost.
const dummyHash = "$2a$11$6LQCuNqAvcb4C/xBbhiHBOHNNYlBbaFXqPOYsgc5iG.Ajwy5AvWey"

// Gate bounds how much bcrypt work is in flight at once, and is the ONLY way to
// reach bcrypt from outside this package.
//
// ⚑ The reason it exists is architectural, not defensive. aurad hashes
// passwords in the same process that runs the game: HTTP handlers get their own
// goroutines and share no lock with the loop, so a hash cannot BLOCK a tick —
// but it does compete for CPU, and the loop is single-threaded on a 2-vCPU box.
// One hash is free; unbounded hashes are not.
//
// ⚑ The throttle does not cover this. It bounds attempts per source IP and per
// account, but never the GLOBAL total, and the first attempt from any pair is
// deliberately free — an honest typo must not cost a wait. So N distinct sources
// each get one free hash's worth of CPU, and only a concurrency bound answers
// that.
//
// ⚑ TWO PATHS REACH A SESSION WITHOUT EVER TOUCHING BCRYPT, and that is what
// keeps the load small at real player counts. Both are load-bearing, and a later
// chunk could remove them without noticing:
//
//   - A RECONNECT presents the JWT cookie to /select — an HMAC verify, which is
//     microseconds. So the thundering herd after a deploy (every player
//     reconnecting at once) costs no hashing at all. It would start to, if
//     anyone ever made reconnect re-ask for a password.
//   - An ANONYMOUS player presents anonymous_secret_sha256, a fast unsalted
//     LOOKUP KEY, not a verifier. Since the design is anonymous-first, a large
//     share of the population never reaches bcrypt. It would, if anyone ever
//     "hardened" that column to bcrypt — which the schema doc's §"Hashing"
//     section explains is not merely slower but structurally impossible.
//
// bcrypt load therefore tracks FRESH PASSWORD LOGINS, not player count and not
// reconnects.
//
// ⚑ Rejected alternative, recorded because it is the intuitive one: moving auth
// to a second process or a sidecar service. On the same VPS that changes
// nothing — CPU is the shared resource and the OS time-slices across processes
// exactly as it does across goroutines — while adding IPC, a second Go runtime
// and a second GC. Real isolation needs a different machine, which contradicts
// the single-binary deploy (implementation.md §7: no second runtime, no second
// deployment artifact).
type Gate struct {
	slots chan struct{}
}

// NewGate builds a gate admitting n concurrent hashes. Production passes
// DefaultGateSlots.
func NewGate(n int) *Gate {
	if n < 1 {
		panic("auth: a gate needs at least one slot")
	}
	return &Gate{slots: make(chan struct{}, n)}
}

// do runs fn while holding a slot, or returns ErrBusy if ctx ends first.
func (g *Gate) do(ctx context.Context, fn func()) error {
	// ⚑ Checked BEFORE the select rather than left to it. When a free slot and a
	// finished context are both ready, select chooses at random — so a caller
	// that has already gone away would still burn a hash about half the time,
	// which is precisely the CPU this gate exists to protect. Found by a test
	// that went flaky, not by reading.
	if ctx.Err() != nil {
		return ErrBusy
	}
	select {
	case g.slots <- struct{}{}:
	case <-ctx.Done():
		return ErrBusy
	}
	defer func() { <-g.slots }()
	fn()
	return nil
}

// Hash hashes a password for storage in account_credentials.password_hash.
//
// It rejects an over-long password rather than letting bcrypt truncate it; the
// caller should have run ValidatePassword first, and this is the backstop for
// the paths that did not.
func (g *Gate) Hash(ctx context.Context, plain string) (string, error) {
	if len(plain) > MaxPasswordBytes {
		return "", ErrPasswordTooLong
	}
	var hash []byte
	var hashErr error
	if err := g.do(ctx, func() {
		hash, hashErr = bcrypt.GenerateFromPassword([]byte(plain), bcryptCost)
	}); err != nil {
		return "", err
	}
	if hashErr != nil {
		return "", hashErr
	}
	return string(hash), nil
}

// Verify reports whether plain matches hash. A non-nil error means the
// comparison did not happen at all (ErrBusy) — never that it failed.
//
// ⚑ An EMPTY hash means "no such account", and it still performs a full bcrypt
// comparison — against dummyHash — before returning false. That is the timing
// equalisation from plan-accounts-implementation.md §7b: §5b makes "no such
// user" and "wrong password" produce the same message, which is worthless if
// one of them returns in microseconds and the other in a quarter of a second.
//
// The equalisation is structural, in here, rather than a rule the login handler
// has to remember — pass the hash you found (or "" if you found none) and the
// property holds. TestMissingAccountStillCostsABcryptCompare pins it.
//
// ⚑ The gate is taken around BOTH paths, uniformly. Admitting the real
// comparison and short-circuiting the dummy one would put the queueing delay on
// only one branch and reopen the oracle from the other end.
func (g *Gate) Verify(ctx context.Context, hash, plain string) (bool, error) {
	var match bool
	if err := g.do(ctx, func() {
		if hash == "" {
			// Deliberately unignored-but-discarded: the comparison is the point,
			// the result is not.
			_ = bcrypt.CompareHashAndPassword([]byte(dummyHash), []byte(plain))
			return
		}
		match = bcrypt.CompareHashAndPassword([]byte(hash), []byte(plain)) == nil
	}); err != nil {
		return false, err
	}
	return match, nil
}
