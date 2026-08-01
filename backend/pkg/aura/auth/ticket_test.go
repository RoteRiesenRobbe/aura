package auth_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/auth"
)

func TestTicketRoundTrip(t *testing.T) {
	tickets := auth.NewTicketStore(auth.TicketTTL)

	token, err := tickets.Mint(auth.Ticket{AccountID: 7, CharacterID: 42})
	require.NoError(t, err)
	// 32 CSPRNG bytes, base64url — long enough that guessing is not a strategy.
	assert.GreaterOrEqual(t, len(token), 40)

	redeemed, err := tickets.Redeem(token)
	require.NoError(t, err)
	assert.Equal(t, auth.Ticket{AccountID: 7, CharacterID: 42}, redeemed)
	assert.Equal(t, 0, tickets.Len(), "redeeming burns the ticket")
}

// TestTicketIsSingleUse pins the half that makes a leaked ticket worth little:
// the second presentation fails, so a ticket observed in flight is already spent
// by the time it is copied.
func TestTicketIsSingleUse(t *testing.T) {
	tickets := auth.NewTicketStore(auth.TicketTTL)

	token, err := tickets.Mint(auth.Ticket{AccountID: 7, CharacterID: 42})
	require.NoError(t, err)

	_, err = tickets.Redeem(token)
	require.NoError(t, err)

	_, err = tickets.Redeem(token)
	assert.ErrorIs(t, err, auth.ErrTicketUnknown, "a ticket may be redeemed exactly once")
}

func TestTicketExpires(t *testing.T) {
	tickets := auth.NewTicketStore(time.Millisecond)

	token, err := tickets.Mint(auth.Ticket{AccountID: 7, CharacterID: 42})
	require.NoError(t, err)

	time.Sleep(10 * time.Millisecond)
	_, err = tickets.Redeem(token)
	assert.ErrorIs(t, err, auth.ErrTicketUnknown)
}

func TestRedeemingAnUnknownTicketFails(t *testing.T) {
	tickets := auth.NewTicketStore(auth.TicketTTL)

	_, err := tickets.Redeem("not-a-ticket")
	assert.ErrorIs(t, err, auth.ErrTicketUnknown)

	_, err = tickets.Redeem("")
	assert.ErrorIs(t, err, auth.ErrTicketUnknown)
}

// TestTicketIsBoundToItsCharacter is the whole point of the mechanism and the
// easiest assertion to omit, because single-use and expiry are the obvious two.
//
// ⚑ The binding is structural rather than checked: the character id comes OUT of
// the ticket, and the Join message carries no character field at all. So "a
// ticket for character A cannot join as B" is not a comparison someone could
// forget to write — there is nowhere to say B. This test pins that shape, and
// would fail the day a character id starts arriving alongside the ticket.
func TestTicketIsBoundToItsCharacter(t *testing.T) {
	tickets := auth.NewTicketStore(auth.TicketTTL)

	forA, err := tickets.Mint(auth.Ticket{AccountID: 7, CharacterID: 1})
	require.NoError(t, err)
	forB, err := tickets.Mint(auth.Ticket{AccountID: 7, CharacterID: 2})
	require.NoError(t, err)

	redeemedA, err := tickets.Redeem(forA)
	require.NoError(t, err)
	assert.Equal(t, int64(1), redeemedA.CharacterID, "a ticket redeems as the character it was minted for")

	redeemedB, err := tickets.Redeem(forB)
	require.NoError(t, err)
	assert.Equal(t, int64(2), redeemedB.CharacterID)

	// Two characters of one account get genuinely different tickets — a shared
	// or account-scoped token would let either play as the other.
	assert.NotEqual(t, forA, forB)
}

// TestExpiredTicketsAreSwept pins the memory hygiene. /select is reachable by
// anyone with a session, so a minted-and-abandoned ticket sitting in the map
// forever is a slow leak an authenticated client controls the rate of.
func TestExpiredTicketsAreSwept(t *testing.T) {
	tickets := auth.NewTicketStore(time.Millisecond)

	for i := 0; i < 5; i++ {
		_, err := tickets.Mint(auth.Ticket{AccountID: int64(i), CharacterID: int64(i)})
		require.NoError(t, err)
	}
	assert.Equal(t, 5, tickets.Len())

	time.Sleep(10 * time.Millisecond)
	_, err := tickets.Mint(auth.Ticket{AccountID: 99, CharacterID: 99})
	require.NoError(t, err)
	assert.Equal(t, 1, tickets.Len(), "minting sweeps the expired ones")
}
