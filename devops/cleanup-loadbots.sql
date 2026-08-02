-- Delete the accounts a LIVE capacity run leaves behind.
--
-- ⚑⚑ DO NOT RUN THIS WHILE `aurad` IS RUNNING. ⚑⚑
--
-- It broke save games on 2026-08-02. A row is not the whole account: the server
-- holds session state IN MEMORY keyed on account id, and a DELETE does not reach
-- it, so this leaves sessions held for accounts that no longer exist — guest
-- sessions in particular. The damage is not in the rows (that pass deleted 251
-- bot accounts and every real row reconciled exactly on both sides); it is in
-- the running process, which is why the counts looked clean while something was
-- badly wrong.
--
-- How the sessions get there, so the trap is recognisable rather than
-- memorised:
--
--   - `handleRegister` ends in `startSession`, so EVERY registered bot holds a
--     live session in the SessionRegistry the moment it registers. There is no
--     subset of bots this does not apply to.
--   - `cmd/authbench` drives an http.Client with no cookie jar, so it discards
--     the session cookie and CANNOT log those sessions out. It creates
--     server-side state it has no means to clean up.
--   - A `loadbot` bot that just disconnects does not end its session either:
--     removeFromPlayers STASHES it.
--
-- Until that interaction is fixed, the safe sequences are: run this only with
-- `aurad` stopped, or restart `aurad` immediately afterwards. The dry-run
-- SELECT below is always safe — it was the DELETE that was not.
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
-- ⚑ WHEN it is safe to run — a different question from WHICH ROWS are safe to
-- delete, and the one this file used to be silent about while documenting the
-- other at length. A disconnected bot is NOT gone from the server: its character
-- sits in the reconnect stash for ~10 minutes (reconnectStashTTLTicks,
-- pkg/aura/sys/state.go), invisible from the database, and when that expires the
-- session-expiry trigger takes one last save of it. Delete the rows first and
-- those saves land on rows that are no longer there.
--
-- That half is now HARMLESS. store.SaveCharacter marks the refusal terminal
-- (persist.ErrGone) and the writer drops the snapshot, one line per bot:
--   💾 dropped a character save: its row no longer exists
-- Those lines after a cleanup are the expected outcome, not a fault.
--
-- ⚑ It was not always harmless, which is why the note is here: before the
-- terminal-error rule every such save was re-queued forever, and the retry
-- ladder those 44 dead rows drove starved every real player's save for 37
-- minutes (2026-08-02). The trap was the stash window being written down
-- nowhere — a careful operator reading this file walked straight into it.
--
-- ⚑ The SESSION half above (⚑⚑, top of file) is a DIFFERENT trap found the same
-- day and is NOT fixed by the writer change: a save queue entry and a
-- SessionRegistry entry are two different pieces of server memory, and closing
-- one says nothing about the other. Both need the server stopped or restarted
-- around the delete until the session side has its own fix.
--
-- ⚑ It refuses to touch anything that is not a bot. A bot account is either
-- ANONYMOUS or REGISTERED UNDER THE PREFIX, and owns only characters whose
-- names match the prefix. A row failing either test is a real player who
-- happens to have picked a colliding name, and the whole transaction aborts
-- rather than deleting them — the collision risk that taking a non-reserved
-- prefix buys.
--
-- ⚑ ANONYMOUS IS `username IS NULL`, NOT "no credentials row". Every account has
-- an account_credentials row from birth — it is where the anonymous secret
-- lives — and registering later fills in username/password_hash on that SAME
-- row. Guarding on the row's absence matches nothing and silently deletes
-- nothing, which is exactly how this was first written and how it failed: a
-- clean "nothing to do" over ten rows sitting right there.
--
-- ⚑ AND ANONYMOUS ALONE IS NOT ENOUGH SINCE `cmd/authbench`. That tool measures
-- the credentialed path, so its bots REGISTER — and a registered bot is not
-- anonymous. Claiming only `username IS NULL` does not merely miss those rows:
-- it excludes them from the doomed set, whereupon their characters match the
-- pattern while belonging to an account outside it, the guard below fires, and
-- the transaction aborts. **One registered bot would strand every other bot row
-- from the same run.** Hence the username may also match the prefix — which is
-- why authbench registers usernames under the SAME `-name-prefix` it gives
-- characters, and why that is a contract between the two files, not a
-- convention.
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
    stray    INT;
BEGIN
    -- Candidate accounts: no username that is not ours (i.e. anonymous, or
    -- registered under the prefix), and every character they own matches.
    --
    -- ⚑ Phrased as "no FOREIGN username" rather than "NULL or ours" on purpose:
    -- an account carries at most one credentials row, but writing the positive
    -- form means an account with no row at all would fail it, and the negative
    -- form is what keeps the anonymous case working through the same clause.
    SELECT array_agg(a.id) INTO doomed
    FROM game.accounts a
    WHERE NOT EXISTS (SELECT 1 FROM game.account_credentials c
                       WHERE c.account_id = a.id
                         AND c.username IS NOT NULL
                         AND c.username NOT LIKE pat)
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

    -- Residue this script cannot claim: a username under the prefix on an
    -- account that missed the doomed set because it also owns a character named
    -- something else. NOT a reason to refuse — deleting nothing here risks
    -- nobody's rows — but the operator has to hear it, because that account now
    -- sits in the database forever unless someone removes it by hand.
    SELECT count(*) INTO stray
    FROM game.account_credentials c
    WHERE c.username LIKE pat
      AND (doomed IS NULL OR NOT (c.account_id = ANY(doomed)));
    IF stray > 0 THEN
        RAISE NOTICE
            '% account(s) carry a username matching % but own other characters — '
            'left in place, remove by hand', stray, pat;
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
