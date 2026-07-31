-- Reverses 000001. CASCADE is safe here precisely because it is scoped to the
-- schema this migration created: every table, index, constraint and sequence in
-- `game` came from the .up half, and nothing outside it depends on them.
--
-- ⚑ This is the one place a CASCADE is intended. The schema itself deliberately
-- carries NO `ON DELETE` clauses (see the schema doc's "Deletion behaviour") so
-- that a stray row delete cannot silently break the graveyard chain — that
-- discipline is about rows, and does not apply to dropping the schema wholesale.
DROP SCHEMA game CASCADE;

-- citext lives in `public`, so the drop above does not take it. Removing it is
-- what makes the round-trip land on a genuinely empty database, which is the
-- chunk's acceptance test.
--
-- ⚑ IF EXISTS mirrors the up half's IF NOT EXISTS: on a server where citext was
-- already installed for some other reason, up left it alone and this may find it
-- pinned by that other user. Verified absent from both aura databases before
-- 1a, so here it is ours.
DROP EXTENSION IF EXISTS citext;
