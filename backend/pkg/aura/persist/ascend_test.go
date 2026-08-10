package persist

import (
	"context"
	"errors"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeAscensions records what the transaction was asked to do and answers with
// whatever the test scripted.
type fakeAscensions struct {
	mu    sync.Mutex
	calls []AscensionRequest
	err   error
}

func (f *fakeAscensions) AscendCharacter(_ context.Context, accountID, characterID int64, unlockKey string) (int, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls = append(f.calls, AscensionRequest{AccountID: accountID, CharacterID: characterID, UnlockKey: unlockKey})
	return 0, f.err
}

func (f *fakeAscensions) callCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.calls)
}

func TestAscenderRunsTheTransactionAndReportsBack(t *testing.T) {
	sink := &fakeAscensions{}
	a := NewAscender(sink)
	client := uuid.New()

	a.Ascend(AscensionRequest{AccountID: 7, CharacterID: 11, ClientUUID: client, UnlockKey: "FrostShield"})
	a.Wait()

	require.Len(t, sink.calls, 1)
	assert.Equal(t, int64(7), sink.calls[0].AccountID)
	assert.Equal(t, "FrostShield", sink.calls[0].UnlockKey)

	done := a.Completed()
	require.Len(t, done, 1)
	assert.NoError(t, done[0].Err)
	assert.Equal(t, client, done[0].ClientUUID, "the outcome must find its way back to a connection")
}

// A failure is reported, not swallowed: nothing committed, so the loop has to
// leave the player standing in the world.
func TestAscenderReportsAFailureWithoutRetrying(t *testing.T) {
	sink := &fakeAscensions{err: errors.New("the database is having a moment")}
	a := NewAscender(sink)

	a.Ascend(AscensionRequest{AccountID: 7, CharacterID: 11})
	a.Wait()

	done := a.Completed()
	require.Len(t, done, 1)
	assert.Error(t, done[0].Err)

	// ⚑ ONE ATTEMPT. Re-running an irreversible transaction whose outcome is
	// unknown is how a sacrificed character gets reported as never sacrificed.
	assert.Equal(t, 1, sink.callCount(), "an ascension is never retried")
}

// Completed is a DRAIN: the loop observes each outcome exactly once, so a
// teardown cannot run twice for one sacrifice.
func TestAscenderCompletedDrains(t *testing.T) {
	sink := &fakeAscensions{}
	a := NewAscender(sink)

	a.Ascend(AscensionRequest{CharacterID: 1})
	a.Ascend(AscensionRequest{CharacterID: 2})
	a.Wait()

	assert.Len(t, a.Completed(), 2)
	assert.Empty(t, a.Completed(), "a drained outcome is gone")
}

func TestAscenderCompletedIsEmptyWhileNothingHasFinished(t *testing.T) {
	a := NewAscender(&fakeAscensions{})
	assert.Empty(t, a.Completed())
}
