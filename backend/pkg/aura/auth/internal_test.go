package auth

// Tests that need at the package's insides. Everything else lives in the
// external auth_test package, so the exported API stays the thing under test.

import (
	"context"
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/bcrypt"
)

// TestGateBoundsConcurrency is the gate's actual contract: at most n bodies run
// at once, whatever the arrival rate.
//
// ⚑ It drives the unexported do() with a fake body rather than real hashing.
// Proving the bound through Hash would mean starting dozens of bcrypt rounds at
// a quarter-second each to observe the serialisation — a slow test that measures
// bcrypt, when the property under test is the semaphore.
func TestGateBoundsConcurrency(t *testing.T) {
	for _, slots := range []int{1, 2, 4} {
		t.Run(fmt.Sprintf("%d slots", slots), func(t *testing.T) {
			gate := NewGate(slots)

			var inFlight, peak atomic.Int32
			var wg sync.WaitGroup
			for i := 0; i < 32; i++ {
				wg.Add(1)
				go func() {
					defer wg.Done()
					require.NoError(t, gate.do(context.Background(), func() {
						now := inFlight.Add(1)
						for {
							high := peak.Load()
							if now <= high || peak.CompareAndSwap(high, now) {
								break
							}
						}
						time.Sleep(time.Millisecond)
						inFlight.Add(-1)
					}))
				}()
			}
			wg.Wait()

			assert.LessOrEqual(t, int(peak.Load()), slots, "never more than %d at once", slots)
			assert.Positive(t, peak.Load(), "and the work did run")
			assert.Equal(t, int32(0), inFlight.Load(), "every slot was released")
		})
	}
}

// TestDummyHashMatchesCost is the guard that makes the hard-coded dummy hash
// safe.
//
// The literal exists so a process start does not pay a bcrypt round it will
// probably never need. The risk it trades against is that someone raises
// bcryptCost and leaves the literal behind — at which point the no-such-account
// path becomes measurably cheaper than a real comparison and the timing oracle
// is quietly back, with every test still green.
func TestDummyHashMatchesCost(t *testing.T) {
	cost, err := bcrypt.Cost([]byte(dummyHash))
	require.NoError(t, err, "the dummy must be a valid bcrypt hash")
	assert.Equal(t, bcryptCost, cost,
		"the dummy hash's cost must track bcryptCost, or the no-such-account path stops costing what a real one does")
}

// TestTicketsAreStoredHashed pins that the raw token never becomes a map key.
//
// Same rule as the token columns in the schema: a lookup key must be
// deterministic, but storing it in the clear means a heap dump or a stray
// debugger session yields something redeemable.
func TestTicketsAreStoredHashed(t *testing.T) {
	store := NewTicketStore(TicketTTL)
	token, err := store.Mint(Ticket{AccountID: 1, CharacterID: 2})
	require.NoError(t, err)

	store.mu.Lock()
	defer store.mu.Unlock()
	require.Len(t, store.live, 1)
	_, rawIsAKey := store.live[token]
	assert.False(t, rawIsAKey, "the raw ticket must not be the map key")
	for key := range store.live {
		assert.NotContains(t, key, token, "no stored key may carry the raw ticket")
	}
}
