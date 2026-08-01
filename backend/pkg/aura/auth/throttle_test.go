package auth_test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/auth"
)

const testIP = "203.0.113.7"

func TestThrottleProgression(t *testing.T) {
	throttle := auth.NewThrottle(auth.ThrottleDecay)

	assert.Equal(t, time.Duration(0), throttle.Delay(testIP, 42),
		"the first attempt is never delayed — an honest typo must not cost a wait")

	want := []time.Duration{
		1 * time.Second,
		2 * time.Second,
		4 * time.Second,
		8 * time.Second,
		16 * time.Second,
		30 * time.Second, // 32 s, capped
		30 * time.Second,
	}
	for i, expected := range want {
		throttle.Fail(testIP, 42)
		assert.Equal(t, expected, throttle.Delay(testIP, 42), "after %d failures", i+1)
	}

	// ⚑ No hard lockout, ever: however many failures accumulate, the answer is a
	// bounded wait. A lockout would let anyone who knows a username lock its
	// owner out on purpose — a defence that becomes a griefing tool
	// (plan-accounts-implementation.md §7b, GDD §9).
	for i := 0; i < 50; i++ {
		throttle.Fail(testIP, 42)
	}
	assert.Equal(t, auth.ThrottleMaxDelay, throttle.Delay(testIP, 42), "the delay is capped, not a lockout")
}

// TestThrottleCountsBothAxes pins the ruling that there are two of them.
//
// Per-IP alone is walkable with a handful of addresses; per-account alone is
// walkable from one address against many accounts. Each axis is asserted in
// isolation, because an implementation that only ever reads the pair would pass
// a test that always supplies both.
func TestThrottleCountsBothAxes(t *testing.T) {
	throttle := auth.NewThrottle(auth.ThrottleDecay)
	throttle.Fail(testIP, 42)

	assert.Positive(t, throttle.Delay("198.51.100.9", 42),
		"the same account from a new address is still throttled")
	assert.Positive(t, throttle.Delay(testIP, 0),
		"the same address against a different (or unknown) account is still throttled")
	assert.Equal(t, time.Duration(0), throttle.Delay("198.51.100.9", 99),
		"an unrelated address and account are not")

	// The delay is the higher of the two axes, not their sum.
	throttle.Fail("198.51.100.9", 42)
	throttle.Fail("198.51.100.9", 42)
	assert.Equal(t, 4*time.Second, throttle.Delay("198.51.100.9", 42),
		"three failures on the account axis, two on the IP axis — the higher wins")
}

// TestUnknownUsernameStillThrottles covers the accountID == 0 path: a login for
// a username that names no account has no account axis, and must still be
// throttled on the IP one. Otherwise guessing usernames is free.
func TestUnknownUsernameStillThrottles(t *testing.T) {
	throttle := auth.NewThrottle(auth.ThrottleDecay)

	throttle.Fail(testIP, 0)
	throttle.Fail(testIP, 0)
	assert.Equal(t, 2*time.Second, throttle.Delay(testIP, 0))

	// And it does not accidentally pollute a real account's counter.
	assert.Equal(t, 2*time.Second, throttle.Delay(testIP, 42), "the IP axis still applies")
	assert.Equal(t, time.Duration(0), throttle.Delay("198.51.100.9", 42), "account 42 has no failures of its own")
}

func TestThrottleResetsOnSuccess(t *testing.T) {
	throttle := auth.NewThrottle(auth.ThrottleDecay)

	throttle.Fail(testIP, 42)
	throttle.Fail(testIP, 42)
	assert.Positive(t, throttle.Delay(testIP, 42))

	throttle.Succeed(testIP, 42)
	assert.Equal(t, time.Duration(0), throttle.Delay(testIP, 42), "a successful login clears both axes")

	ips, accounts := throttle.Counters()
	assert.Equal(t, 0, ips)
	assert.Equal(t, 0, accounts)
}

// TestThrottleDecays pins the sliding window: a counter that has seen no
// failures for the decay period is gone, so yesterday's fat-fingered evening
// does not delay this morning's login.
func TestThrottleDecays(t *testing.T) {
	throttle := auth.NewThrottle(10 * time.Millisecond)

	throttle.Fail(testIP, 42)
	throttle.Fail(testIP, 42)
	assert.Equal(t, 2*time.Second, throttle.Delay(testIP, 42))

	time.Sleep(20 * time.Millisecond)
	assert.Equal(t, time.Duration(0), throttle.Delay(testIP, 42), "the counter has decayed")

	// And the next failure starts the progression again rather than resuming it.
	throttle.Fail(testIP, 42)
	assert.Equal(t, 1*time.Second, throttle.Delay(testIP, 42))
}

func TestWaitHonoursContext(t *testing.T) {
	throttle := auth.NewThrottle(auth.ThrottleDecay)

	// No failures: Wait returns immediately, and must not allocate a timer's
	// worth of latency on the overwhelmingly common path.
	start := time.Now()
	throttle.Wait(context.Background(), testIP, 42)
	assert.Less(t, time.Since(start), 100*time.Millisecond)

	// With a delay pending, a cancelled request stops waiting — the client has
	// gone, and holding the goroutine achieves nothing.
	for i := 0; i < 5; i++ {
		throttle.Fail(testIP, 42)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	start = time.Now()
	throttle.Wait(ctx, testIP, 42)
	assert.Less(t, time.Since(start), time.Second, "a cancelled context ends the wait")
}
