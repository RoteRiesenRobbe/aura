package sys

import (
	"errors"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/auth"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/persist"
)

// recordingAscensions stands in for the off-loop transaction: it records what
// the loop asked for and hands back whatever outcome the test scripts, on the
// tick the test chooses.
type recordingAscensions struct {
	mu        sync.Mutex
	requested []persist.AscensionRequest
	pending   []persist.AscensionResult
}

func (r *recordingAscensions) Ascend(req persist.AscensionRequest) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.requested = append(r.requested, req)
}

func (r *recordingAscensions) Completed() []persist.AscensionResult {
	r.mu.Lock()
	defer r.mu.Unlock()
	done := r.pending
	r.pending = nil
	return done
}

// finish scripts the outcome of the one request made so far, to be observed on
// the next tick.
func (r *recordingAscensions) finish(t *testing.T, err error) {
	t.Helper()
	r.mu.Lock()
	defer r.mu.Unlock()
	require.Len(t, r.requested, 1, "expected exactly one ascension request")
	r.pending = append(r.pending, persist.AscensionResult{AscensionRequest: r.requested[0], Err: err})
}

// atMaxLevel is the only prerequisite for ascending (P1).
func atMaxLevel(t *testing.T, g *stateFakeGame, p model.PlayerEntity) {
	t.Helper()
	g.cfg.PlayerConfig.LevelCurve.MaxLevel = 30
	progression := p.Progression()
	progression.Level = 30
	p.SetProgression(progression)
}

// ascendingFixture joins one player, brings them to max level and installs both
// seams.
func ascendingFixture(t *testing.T) (*ConnectionStateSystem, *stateFakeGame,
	*fakeClient, model.PlayerEntity, *recordingAscensions, *recordingSaves,
) {
	t.Helper()
	s, g := newStateFixture(t)
	saves := withSaves(s)
	ascensions := &recordingAscensions{}
	s.SetCharacterAscensions(ascensions)

	c := newFakeClient()
	p := joinWithState(t, s, g, c, "Elder", persist.CharacterState{Level: 30, ActiveAuraSlot: persist.NoActiveAura})
	atMaxLevel(t, g, p)
	return s, g, c, p, ascensions, saves
}

// ⚑ P1 LIVES HERE, NOT IN SQL. The character row's level is eventually
// consistent — saves are periodic and the ascension teardown deliberately skips
// the final one — so the only trustworthy level is the live one, and this is
// the only place that holds it.
func TestRequestAscensionRefusesBelowMaxLevel(t *testing.T) {
	s, g, _, p, ascensions, _ := ascendingFixture(t)
	g.cfg.PlayerConfig.LevelCurve.MaxLevel = 30
	progression := p.Progression()
	progression.Level = 29
	p.SetProgression(progression)

	assert.False(t, s.RequestAscension(p, "FrostShield"), "one level short is short")
	assert.Empty(t, ascensions.requested, "nothing may reach the database")
	assert.Len(t, g.players, 1, "and the player keeps playing")
}

func TestRequestAscensionHandsTheTransactionOffTheLoop(t *testing.T) {
	s, g, c, p, ascensions, _ := ascendingFixture(t)

	require.True(t, s.RequestAscension(p, "FrostShield"))

	require.Len(t, ascensions.requested, 1)
	req := ascensions.requested[0]
	assert.NotZero(t, req.AccountID, "the account rides the ticket onto the session")
	assert.NotZero(t, req.CharacterID)
	assert.Equal(t, c.UUID(), req.ClientUUID)
	assert.Equal(t, "FrostShield", req.UnlockKey)

	// ⚑ NOTHING HAS ENDED YET. The session survives until the transaction is
	// observed to have COMMITTED — tearing down on the request would end a
	// player's life for a write that might still fail.
	assert.Len(t, g.players, 1)
	assert.False(t, c.closed)
}

// D14: an exhausted catalog still ascends, and the empty pick travels as an
// empty key rather than as a refusal.
func TestRequestAscensionAcceptsAnEmptyPick(t *testing.T) {
	s, _, _, p, ascensions, _ := ascendingFixture(t)

	require.True(t, s.RequestAscension(p, ""))
	require.Len(t, ascensions.requested, 1)
	assert.Empty(t, ascensions.requested[0].UnlockKey)
}

// The teardown, all four halves in one place, because getting any one of them
// wrong is silent.
func TestObservedAscensionEndsTheWorldSession(t *testing.T) {
	s, g, c, p, ascensions, saves := ascendingFixture(t)
	accountID := s.accountByClient[c.UUID()]
	require.NotZero(t, accountID)
	require.True(t, s.RequestAscension(p, "FrostShield"))

	before := len(saves.saved)
	ascensions.finish(t, nil)
	s.Update(0)
	assert.True(t, c.closed, "the socket is closed")

	// ⚑ AND THEN THE SOCKET ACTUALLY GOES, which is the only reason the two
	// assertions below have a subject at all. closeClient does not remove the
	// entity — the net layer does, on its own schedule — so everything the
	// teardown is trying to PREVENT (the disconnect save, the reconnect stash)
	// happens here, after it. Asserting before this line would pass against a
	// system that does nothing. See the control below.
	g.RemoveEntity(p.Basic())

	// ⚑ NO FINAL SAVE. The row is a graveyard row now; a snapshot written
	// against it would be refused as terminal anyway, but relying on that would
	// be leaving a doomed write for the database to sort out.
	assert.Len(t, saves.saved, before, "an ascension must queue no save")
	assert.Empty(t, s.stashByToken, "no reconnect stash may hold a pre-sacrifice snapshot")

	// ⚑ RELEASED, not stashed. The player's next move is creating their heir,
	// which needs the account's session slot free NOW — waiting out the stash
	// TTL would make the loop's own next step refuse them.
	_, playing := s.sessions.Live(accountID)
	assert.False(t, playing, "the account is free to create its successor")
}

// THE CONTROL for the test above, and it is not optional: an ordinary
// disconnect must queue a save, stash the character and merely STASH the
// session. Without it, "no save, no stash, no session" would pass just as
// happily against a fixture where none of those things can happen at all.
func TestOrdinaryDisconnectStillSavesAndStashes(t *testing.T) {
	s, g, _, p, _, saves := ascendingFixture(t)
	accountID := s.accountByClient[p.Client().UUID()]
	require.NotZero(t, accountID)

	before := len(saves.saved)
	g.RemoveEntity(p.Basic())

	assert.Len(t, saves.saved, before+1, "a disconnect saves")
	assert.Len(t, s.stashByToken, 1, "a disconnect stashes")
	live, playing := s.sessions.Live(accountID)
	assert.True(t, playing, "and the account keeps its slot")
	assert.True(t, live.Stashed, "stashed, not released")
}

// ⚑ A FAILED TRANSACTION COMMITS NOTHING, so the honest answer is to leave the
// player exactly where they were standing. Tearing down here would end a life
// that the database still holds as alive — the one outcome worse than refusing.
func TestObservedAscensionFailureLeavesThePlayerInTheWorld(t *testing.T) {
	s, g, c, p, ascensions, _ := ascendingFixture(t)
	require.True(t, s.RequestAscension(p, "FrostShield"))

	ascensions.finish(t, errors.New("the database is having a moment"))
	s.Update(0)

	assert.False(t, c.closed, "a failed ascension must not close the socket")
	assert.Len(t, g.players, 1, "the character is still alive and still playable")
	_ = p
}

// An outcome naming a connection that is already gone — the player dropped
// while the transaction was in flight — must not panic or resurrect anything.
func TestObservedAscensionForAVanishedClientIsHarmless(t *testing.T) {
	s, _, _, _, ascensions, _ := ascendingFixture(t)

	ascensions.pending = append(ascensions.pending, persist.AscensionResult{
		AscensionRequest: persist.AscensionRequest{AccountID: 999, CharacterID: 999, ClientUUID: uuid.New()},
	})
	assert.NotPanics(t, func() { s.Update(0) })
}

// The seam is optional, exactly like the save seam: a build with no database
// behind it must still run a world.
func TestAscensionWithoutASeamIsRefusedRatherThanCrashing(t *testing.T) {
	s, g := newStateFixture(t)
	c := newFakeClient()
	p := joinWithState(t, s, g, c, "Elder", persist.CharacterState{Level: 30, ActiveAuraSlot: persist.NoActiveAura})
	atMaxLevel(t, g, p)

	assert.False(t, s.RequestAscension(p, "FrostShield"))
	assert.Len(t, g.players, 1)
}

// ⚑ THE TEARDOWN AND THE FAN-OUT ARE NOT THE SAME MOMENT, and that gap is where
// this bug lives. The session is released immediately (the player has to be
// able to create their heir), but the old socket's removeFromPlayers runs
// whenever the net layer gets round to it — by which time the successor may
// already hold a freshly claimed session for the same account. Stashing THAT is
// how a live player becomes takeover-able by a character that no longer exists.
//
// Clearing the connection's account binding is what makes the late fan-out find
// nothing to stash.
func TestAscensionTeardownCannotStashTheSuccessorsSession(t *testing.T) {
	s, g, c, p, ascensions, _ := ascendingFixture(t)
	accountID := s.accountByClient[c.UUID()]
	require.True(t, s.RequestAscension(p, "FrostShield"))
	ascensions.finish(t, nil)
	s.Update(0)

	// The heir goes through character-select and joins, claiming the account's
	// one session slot — all of which happens on a different connection.
	_, claimed := s.sessions.Claim(auth.Session{AccountID: accountID, CharacterID: 4242})
	require.True(t, claimed, "the released slot must be immediately claimable")

	// Only NOW does the old socket finally go away.
	g.RemoveEntity(p.Basic())

	live, playing := s.sessions.Live(accountID)
	require.True(t, playing, "the successor's session must survive its predecessor's disconnect")
	assert.False(t, live.Stashed, "and must not be marked stashed by it")
	assert.Equal(t, int64(4242), live.CharacterID)
}
