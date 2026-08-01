package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// ErrNoAccount means the account has no credentials row.
//
// ⚑ That is ERASED, not "not yet registered". The row is INSERTED with the
// account itself carrying only an anonymous secret, and erasure DELETEs it — so
// its absence is the erasure signal, and every session check must treat it as a
// refusal rather than as a missing optional (plan-accounts-schema.md, the
// account_credentials comment block).
var ErrNoAccount = errors.New("store: no credentials for that account")

// TokenGeneration reads the account's current token generation — the value a
// session token's `gen` claim is compared against on every verify.
//
// This is the only database access chunk 1b needs: without it, auth.Verify's
// generation comparison has nothing real to compare to, and "a token whose
// account was erased is refused" is an assertion nobody can make.
func (s *Store) TokenGeneration(ctx context.Context, accountID int64) (int, error) {
	var generation int
	err := s.Pool.QueryRow(ctx,
		`SELECT token_generation FROM game.account_credentials WHERE account_id = $1`,
		accountID).Scan(&generation)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, ErrNoAccount
	}
	if err != nil {
		return 0, fmt.Errorf("reading the token generation: %w", err)
	}
	return generation, nil
}

// BumpTokenGeneration invalidates every token issued for an account so far and
// returns the new generation.
//
// This is what makes logout actual revocation: clearing a cookie logs out that
// browser and does nothing to a token copied off the machine. The password reset
// flow becomes its third caller when that plan ships
// (plan-accounts-schema.md §"Session revocation").
func (s *Store) BumpTokenGeneration(ctx context.Context, accountID int64) (int, error) {
	var generation int
	err := s.Pool.QueryRow(ctx,
		`UPDATE game.account_credentials SET token_generation = token_generation + 1
		  WHERE account_id = $1 RETURNING token_generation`,
		accountID).Scan(&generation)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, ErrNoAccount
	}
	if err != nil {
		return 0, fmt.Errorf("bumping the token generation: %w", err)
	}
	return generation, nil
}
