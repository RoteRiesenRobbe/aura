-- Delete the accounts a LIVE capacity run leaves behind.
--
-- ⚑ WHY THIS EXISTS SEPARATELY FROM `harnessdb -cleanup`. That tool matches the
-- reserved prefix `hrnss\_%` only, and the reserved prefix is grantable only
-- under -dev — which the live server does not run (see serveFrontend in
-- cmd/aurad/aurad.go). A live run therefore has to take an ordinary,
-- NON-reserved prefix via `loadbot -name-prefix`, and those rows need their own
-- statement. Everything else about ruling 10 still holds: run this ON the box,
-- against loopback, never pointed at a remote host from a dev machine.
--
-- Usage, on the server:
--   sudo -u postgres psql -d aura -v ON_ERROR_STOP=1 \
--        -v prefix=loadbot_ -f /tmp/cleanup-loadbots.sql
--
-- ⚑ STAGE IT SOMEWHERE `postgres` CAN READ — /tmp, not /root. Dropped in /root
-- (the obvious place, since you scp as root) psql fails with
-- `psql: error: /root/cleanup-loadbots.sql: Permission denied`, LOWERCASE, which
-- a `grep -E 'NOTICE|ERROR|COMMIT'` filters out entirely — leaving output that
-- looks like a clean no-op over rows that are still there.
--
-- Dry run first — this prints what WOULD go, and changes nothing:
--   sudo -u postgres psql -d aura -c "SELECT id, name FROM game.characters
--        WHERE name LIKE 'loadbot\_%' ORDER BY id;"
--
-- ⚑ It refuses to touch anything that is not a bot. A bot account is
-- ANONYMOUS and owns only characters whose names match the prefix. A row
-- failing either test is a real player who happens to have picked a colliding
-- name, and the whole transaction aborts rather than deleting them — the
-- collision risk that taking a non-reserved prefix buys.
--
-- ⚑ ANONYMOUS IS `username IS NULL`, NOT "no credentials row". Every account has
-- an account_credentials row from birth — it is where the anonymous secret
-- lives — and registering later fills in username/password_hash on that SAME
-- row. Guarding on the row's absence matches nothing and silently deletes
-- nothing, which is exactly how this was first written and how it failed: a
-- clean "nothing to do" over ten rows sitting right there.
--
-- ⚑ No ON DELETE CASCADE anywhere in this schema (deliberate, see
-- manual-db-migrations.md §3), so children are deleted explicitly, in order.

BEGIN;

-- ⚑ Bound to a GUC, not used as :prefix inside the block below: psql does not
-- interpolate its variables inside dollar-quoted strings, so `:prefix` there
-- would reach the server as the literal text and match nothing.
SET LOCAL aura.prefix = :'prefix';

DO $$
DECLARE
    pat      TEXT := replace(current_setting('aura.prefix'), '_', '\_') || '%';
    doomed   BIGINT[];
    n_chars  INT;
    n_accts  INT;
    bad      INT;
BEGIN
    -- Candidate accounts: anonymous, and every character they own matches.
    SELECT array_agg(a.id) INTO doomed
    FROM game.accounts a
    WHERE NOT EXISTS (SELECT 1 FROM game.account_credentials c
                       WHERE c.account_id = a.id AND c.username IS NOT NULL)
      AND EXISTS (SELECT 1 FROM game.characters ch WHERE ch.account_id = a.id AND ch.name LIKE pat)
      AND NOT EXISTS (SELECT 1 FROM game.characters ch WHERE ch.account_id = a.id AND ch.name NOT LIKE pat);

    -- Guard FIRST, and unconditionally: any character matching the pattern that
    -- is not in the doomed set belongs to a registered or multi-character
    -- account, i.e. a real player who picked a colliding name. Refuse the lot.
    --
    -- ⚑ This runs BEFORE the empty check on purpose. Ordered the other way, a
    -- pattern matching ONLY non-bot rows takes the "nothing to do" branch and
    -- reports a clean no-op over exactly the collision this guard exists to
    -- catch — success-shaped output for the one case an operator must see.
    SELECT count(*) INTO bad
    FROM game.characters ch
    WHERE ch.name LIKE pat
      AND (doomed IS NULL OR NOT (ch.account_id = ANY(doomed)));
    IF bad > 0 THEN
        RAISE EXCEPTION
            '% character(s) match % but belong to accounts that are not bots '
            '(registered, or owning other characters). Refusing to delete anything.', bad, pat;
    END IF;

    IF doomed IS NULL THEN
        RAISE NOTICE 'nothing matches % — nothing to do', pat;
        RETURN;
    END IF;

    SELECT count(*) INTO n_chars FROM game.characters WHERE account_id = ANY(doomed);
    n_accts := array_length(doomed, 1);

    DELETE FROM game.character_flags         WHERE character_id IN (SELECT id FROM game.characters WHERE account_id = ANY(doomed));
    DELETE FROM game.character_loadout_slots WHERE character_id IN (SELECT id FROM game.characters WHERE account_id = ANY(doomed));
    DELETE FROM game.character_spellbook     WHERE character_id IN (SELECT id FROM game.characters WHERE account_id = ANY(doomed));
    DELETE FROM game.characters              WHERE account_id = ANY(doomed);
    DELETE FROM game.audit_log               WHERE account_id = ANY(doomed);
    DELETE FROM game.bloodline_unlocks       WHERE account_id = ANY(doomed);
    -- ⚑ Every account has one of these from birth (it holds the anonymous
    -- secret), so it is never optional — omitting it aborts the whole
    -- transaction on account_credentials_account_id_fkey.
    DELETE FROM game.account_credentials     WHERE account_id = ANY(doomed);
    DELETE FROM game.accounts                WHERE id = ANY(doomed);

    RAISE NOTICE 'deleted % bot account(s) and % character(s) matching %', n_accts, n_chars, pat;
END $$;

COMMIT;
