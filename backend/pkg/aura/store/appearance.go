package store

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/persist"
)

// insertAppearanceGrants writes owned appearance items at their scope
// (plan-appearance.md C5, D7) inside a caller's transaction: the character
// save and the ascension. The owners come from the character row the caller
// just updated, never from the request.
//
// ⚑ ON CONFLICT DO NOTHING: a grant is permanent (D16) and the set only
// grows, so re-writing a row an earlier save wrote changes nothing, and
// unlocked_at keeps the first moment. The three partial unique indexes of
// 000004 are what make that idempotent.
//
// ⚑ Never bloodline_unlocks (L2): that table means "a skill gift from a
// sacrifice" and its reader resolves every key as a skill.
func insertAppearanceGrants(ctx context.Context, tx pgx.Tx, accountID int64, slotIndex int, characterID int64,
	grants []persist.AppearanceGrant) error {
	for _, g := range grants {
		var err error
		switch g.Scope {
		case "account":
			_, err = tx.Exec(ctx,
				`INSERT INTO game.appearance_unlocks (account_id, scope, item_key) VALUES ($1, 'account', $2)
				 ON CONFLICT DO NOTHING`, accountID, g.Item)
		case "bloodline":
			_, err = tx.Exec(ctx,
				`INSERT INTO game.appearance_unlocks (account_id, scope, slot_index, item_key) VALUES ($1, 'bloodline', $2, $3)
				 ON CONFLICT DO NOTHING`, accountID, slotIndex, g.Item)
		case "character":
			_, err = tx.Exec(ctx,
				`INSERT INTO game.appearance_unlocks (account_id, scope, character_id, item_key) VALUES ($1, 'character', $2, $3)
				 ON CONFLICT DO NOTHING`, accountID, characterID, g.Item)
		default:
			return fmt.Errorf("granting appearance item %q: unknown scope %q", g.Item, g.Scope)
		}
		if err != nil {
			return fmt.Errorf("granting appearance item %q at %s scope: %w", g.Item, g.Scope, err)
		}
	}
	return nil
}

// OwnedAppearance is one character's owned set as item ids, sorted (§4.4):
// the account's rows, the slot's bloodline rows and the character's own.
// characterID 0 asks for a character that does not exist yet (creation), so
// only the account and the slot answer. Starters are never stored.
func (s *Store) OwnedAppearance(ctx context.Context, accountID int64, slotIndex int, characterID int64) ([]string, error) {
	var owned []string
	err := s.Pool.QueryRow(ctx,
		`SELECT ARRAY(SELECT DISTINCT item_key FROM game.appearance_unlocks
		               WHERE account_id = $1
		                 AND (scope = 'account'
		                      OR (scope = 'bloodline' AND slot_index = $2)
		                      OR (scope = 'character' AND character_id = $3))
		               ORDER BY item_key)`,
		accountID, slotIndex, characterID).Scan(&owned)
	if err != nil {
		return nil, fmt.Errorf("reading the owned appearance: %w", err)
	}
	return owned, nil
}

// AccountLooks is character select's half of the owned set (D9, D12): what
// every slot owns, and what each slot's bloodline adds. Character rows are
// left out: a new life cannot own a past life's character items.
type AccountLooks struct {
	Account []string
	BySlot  map[int][]string
}

// AccountAppearance reads an account's account and bloodline rows in one
// round trip, each list sorted.
func (s *Store) AccountAppearance(ctx context.Context, accountID int64) (AccountLooks, error) {
	looks := AccountLooks{Account: []string{}, BySlot: map[int][]string{}}
	rows, err := s.Pool.Query(ctx,
		`SELECT scope, coalesce(slot_index, -1), item_key FROM game.appearance_unlocks
		  WHERE account_id = $1 AND scope IN ('account', 'bloodline')
		  ORDER BY item_key`, accountID)
	if err != nil {
		return AccountLooks{}, fmt.Errorf("reading the account's appearance: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var scope, key string
		var slot int
		if err := rows.Scan(&scope, &slot, &key); err != nil {
			return AccountLooks{}, fmt.Errorf("reading an appearance row: %w", err)
		}
		if scope == "account" {
			looks.Account = append(looks.Account, key)
		} else {
			looks.BySlot[slot] = append(looks.BySlot[slot], key)
		}
	}
	if err := rows.Err(); err != nil {
		return AccountLooks{}, fmt.Errorf("reading the account's appearance: %w", err)
	}
	return looks, nil
}
