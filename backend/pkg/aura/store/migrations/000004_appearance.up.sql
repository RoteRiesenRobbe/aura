-- plan-appearance.md C3 (§4.3, D18, D19): the player's chosen look, and the
-- ownership table its unlocks will write.
--
-- ⚑ THE CHOSEN RING IS A COLUMN BESIDE THE CHOSEN PORTRAIT. The portrait lives
-- in characters.avatar, which 000001 shipped and nothing read until now; its
-- every existing value is 'default', the catalog's default portrait, so it
-- needs no backfill. The ring backfills to the catalog's default ring
-- (appearance.DefaultRing; the store test pins the two together). The choice
-- is per character even for an account-owned item (D19).
ALTER TABLE game.characters ADD COLUMN ring TEXT NOT NULL DEFAULT 'ring-plain';

-- ⚑ ONE TABLE FOR EVERY OWNERSHIP SCOPE (D18), not bloodline_unlocks: that
-- table means "a skill gift from a sacrifice" and its reader resolves every key
-- as a skill (L2). Nothing writes here before C5; it ships now so C5 needs no
-- second migration.
--
-- The scope names its owner: 'account' needs neither slot_index nor
-- character_id, 'bloodline' the slot (it follows the slot like
-- bloodline_unlocks, no FK to a character), 'character' the one life.
-- Starter items are never stored.
CREATE TABLE game.appearance_unlocks (
    account_id    BIGINT NOT NULL REFERENCES game.accounts(id),
    scope         TEXT   NOT NULL CHECK (scope IN ('character', 'bloodline', 'account')),
    slot_index    INT    CHECK (slot_index >= 0),
    character_id  BIGINT REFERENCES game.characters(id),
    item_key      TEXT   NOT NULL,
    unlocked_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (
        (scope = 'account'   AND slot_index IS NULL     AND character_id IS NULL) OR
        (scope = 'bloodline' AND slot_index IS NOT NULL AND character_id IS NULL) OR
        (scope = 'character' AND slot_index IS NULL     AND character_id IS NOT NULL)
    )
);

-- One grant per owner and item, so granting is idempotent.
CREATE UNIQUE INDEX appearance_unlocks_account
    ON game.appearance_unlocks (account_id, item_key) WHERE scope = 'account';
CREATE UNIQUE INDEX appearance_unlocks_bloodline
    ON game.appearance_unlocks (account_id, slot_index, item_key) WHERE scope = 'bloodline';
CREATE UNIQUE INDEX appearance_unlocks_character
    ON game.appearance_unlocks (character_id, item_key) WHERE scope = 'character';
