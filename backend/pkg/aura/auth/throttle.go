package auth

import (
	"context"
	"sync"
	"time"
)

// The failed-login throttle's decided shape (plan-accounts-implementation.md §0
// "Throttle mechanism"), implementing the §7b ruling: progressive delay on BOTH
// axes, no hard lockout. [PLACEHOLDER values]
//
// ⚑ The no-lockout half is the deliberate part. A hard per-account lockout lets
// anyone who knows your username lock you out on purpose — a defence that turns
// into a griefing tool, against GDD §9's "no griefing by design". Per-IP alone
// was rejected as walkable with a handful of addresses, which is why there are
// two axes.
const (
	// ThrottleDecay is how long a counter survives without a new failure.
	ThrottleDecay = 15 * time.Minute
	// ThrottleMaxDelay caps the progression. ⚑ The cap is not cosmetic:
	// sleeping holds a connection, so an uncapped delay would itself be a cheap
	// resource-exhaustion vector.
	ThrottleMaxDelay = 30 * time.Second
	// throttleMaxSteps is where the doubling stops. Beyond it every attempt
	// costs ThrottleMaxDelay; it exists so the shift in delayFor can never run
	// off the end of an int64 rather than as a policy of its own.
	throttleMaxSteps = 8
	// throttleSweepThreshold bounds the maps. An attacker rotating source
	// addresses would otherwise grow them without limit: entries are removed on
	// success or decay, and a failing attacker produces neither.
	throttleSweepThreshold = 4096
)

type throttleCounter struct {
	failures    int
	lastFailure time.Time
}

// Throttle holds consecutive-failure counts on two axes: source IP and account
// id. Zero delay until the first failure, then 1, 2, 4, 8 … seconds up to
// ThrottleMaxDelay.
//
// ⚑ In-process, so a restart resets every counter and a determined attacker
// gains attempts across a deploy. Accepted, not overlooked: deploys are manual
// and rare, and the alternative — counters in Postgres — puts a write on every
// failed login, which is exactly the request an attacker controls the rate of
// (plan-accounts-implementation.md §0).
type Throttle struct {
	mu        sync.Mutex
	decay     time.Duration
	byIP      map[string]throttleCounter
	byAccount map[int64]throttleCounter
}

// NewThrottle builds the counters. decay is a parameter so a test can watch a
// counter fall away without waiting a quarter of an hour; production passes
// ThrottleDecay.
func NewThrottle(decay time.Duration) *Throttle {
	return &Throttle{
		decay:     decay,
		byIP:      map[string]throttleCounter{},
		byAccount: map[int64]throttleCounter{},
	}
}

// Delay reports how long the caller must wait before answering this attempt —
// the higher of the two axes.
//
// accountID may be 0, meaning "the username named no account"; then only the IP
// axis applies. That is not an enumeration leak, because the delay is applied to
// the response either way: a caller cannot tell from timing whether the account
// axis contributed, only how long it waited.
func (t *Throttle) Delay(ip string, accountID int64) time.Duration {
	t.mu.Lock()
	defer t.mu.Unlock()

	now := time.Now()
	delay := delayFor(liveCounter(t.byIP, ip, now, t.decay))
	if accountID != 0 {
		if byAccount := delayFor(liveCounter(t.byAccount, accountID, now, t.decay)); byAccount > delay {
			delay = byAccount
		}
	}
	return delay
}

// Wait sleeps for Delay, or until ctx is done.
//
// ⚑ CALL THIS AFTER THE BCRYPT COMPARISON, NEVER INSTEAD OF IT. Delaying in
// place of the comparison reintroduces exactly the timing oracle the dummy
// compare in VerifyPassword exists to close — a short-circuited "no such user"
// would return the moment the delay elapsed, while "wrong password" would return
// a bcrypt round later, and the difference is readable at any failure count
// (plan-accounts-implementation.md §0, §7b).
func (t *Throttle) Wait(ctx context.Context, ip string, accountID int64) {
	delay := t.Delay(ip, accountID)
	if delay <= 0 {
		return
	}
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-timer.C:
	case <-ctx.Done():
	}
}

// Fail records a failed attempt on both axes. accountID may be 0 when the
// username matched no account.
func (t *Throttle) Fail(ip string, accountID int64) {
	t.mu.Lock()
	defer t.mu.Unlock()

	now := time.Now()
	sweep(t.byIP, now, t.decay)
	sweep(t.byAccount, now, t.decay)

	counter := liveCounter(t.byIP, ip, now, t.decay)
	t.byIP[ip] = throttleCounter{failures: counter.failures + 1, lastFailure: now}
	if accountID != 0 {
		counter = liveCounter(t.byAccount, accountID, now, t.decay)
		t.byAccount[accountID] = throttleCounter{failures: counter.failures + 1, lastFailure: now}
	}
}

// Succeed clears both axes. A successful login is the strongest available signal
// that this source and this account are not under attack right now.
func (t *Throttle) Succeed(ip string, accountID int64) {
	t.mu.Lock()
	defer t.mu.Unlock()

	delete(t.byIP, ip)
	if accountID != 0 {
		delete(t.byAccount, accountID)
	}
}

// Counters reports how many entries each axis holds. For tests and diagnostics.
func (t *Throttle) Counters() (ip, account int) {
	t.mu.Lock()
	defer t.mu.Unlock()
	return len(t.byIP), len(t.byAccount)
}

// liveCounter reads a counter, treating a decayed one as absent — which is what
// makes decay a property of reading rather than a background sweep that has to
// run on time.
func liveCounter[K comparable](m map[K]throttleCounter, key K, now time.Time, decay time.Duration) throttleCounter {
	counter, ok := m[key]
	if !ok || now.Sub(counter.lastFailure) >= decay {
		return throttleCounter{}
	}
	return counter
}

// sweep drops decayed counters, but only once a map has grown past the
// threshold: the read path already ignores them, so this is memory hygiene
// rather than correctness, and walking the map on every failed login would hand
// an attacker a cheaper way to make the server work than the throttle costs them.
func sweep[K comparable](m map[K]throttleCounter, now time.Time, decay time.Duration) {
	if len(m) <= throttleSweepThreshold {
		return
	}
	for key, counter := range m {
		if now.Sub(counter.lastFailure) >= decay {
			delete(m, key)
		}
	}
}

// delayFor is the progression: 0, 1, 2, 4, 8 … seconds, capped.
func delayFor(counter throttleCounter) time.Duration {
	if counter.failures <= 0 {
		return 0
	}
	if counter.failures > throttleMaxSteps {
		return ThrottleMaxDelay
	}
	delay := time.Second << (counter.failures - 1)
	if delay > ThrottleMaxDelay {
		return ThrottleMaxDelay
	}
	return delay
}
