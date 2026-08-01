package auth_test

import (
	"sync"
	"sync/atomic"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/auth"
)

func TestSessionRegistryClaimAndRelease(t *testing.T) {
	registry := auth.NewSessionRegistry()

	_, ok := registry.Claim(auth.Session{AccountID: 7, CharacterID: 1})
	assert.True(t, ok)

	live, held := registry.Live(7)
	assert.True(t, held)
	assert.Equal(t, int64(1), live.CharacterID)

	assert.True(t, registry.Release(7))
	assert.False(t, registry.Release(7), "releasing twice reports that nothing was held")

	_, held = registry.Live(7)
	assert.False(t, held)

	_, ok = registry.Claim(auth.Session{AccountID: 7, CharacterID: 2})
	assert.True(t, ok, "the slot is free again")
}

// TestOneSessionPerAccountNotPerCharacter is the assertion the plan singles out
// as the one most likely to pass while the rule is broken.
//
// ⚑ A per-character registry passes "the same character cannot be played twice"
// — the obvious test — and still lets one player run all three of their
// characters in three tabs. So the rejection is asserted across DIFFERENT
// characters of the same account (plan-accounts-frontend.md §11).
func TestOneSessionPerAccountNotPerCharacter(t *testing.T) {
	registry := auth.NewSessionRegistry()

	_, ok := registry.Claim(auth.Session{AccountID: 7, CharacterID: 1})
	assert.True(t, ok)

	existing, ok := registry.Claim(auth.Session{AccountID: 7, CharacterID: 2})
	assert.False(t, ok, "a second character of the same account must be refused")
	assert.Equal(t, int64(1), existing.CharacterID,
		"the conflicting session is reported back, so chunk 3 can tell a reconnect from a second login")

	// A different account is unaffected — the scope is the account, not the game.
	_, ok = registry.Claim(auth.Session{AccountID: 8, CharacterID: 3})
	assert.True(t, ok)
	assert.Equal(t, 2, registry.Count())
}

// TestClaimIsAtomic is why Claim exists at all rather than a Live()-then-set
// idiom at the call site.
//
// Two valid play tickets presented concurrently must yield exactly one live
// session. A check-then-set split across two calls passes every sequential test
// and fails under real load, which is the worst possible place to find it.
//
// ⚑ It counts GRANTS rather than relying on the race detector, deliberately:
// -race needs cgo, and the dev box has no C toolchain, so a test that only fails
// under -race would never fail here at all. Verified by mutation — a
// check-then-set implementation reports 2 grants where 1 is allowed.
func TestClaimIsAtomic(t *testing.T) {
	registry := auth.NewSessionRegistry()

	const contenders = 64
	var granted atomic.Int32
	var wg sync.WaitGroup
	start := make(chan struct{})

	for i := 0; i < contenders; i++ {
		wg.Add(1)
		go func(character int64) {
			defer wg.Done()
			<-start
			if _, ok := registry.Claim(auth.Session{AccountID: 7, CharacterID: character}); ok {
				granted.Add(1)
			}
		}(int64(i))
	}
	close(start)
	wg.Wait()

	assert.Equal(t, int32(1), granted.Load(), "exactly one contender may hold the account's session")
	assert.Equal(t, 1, registry.Count())
}
