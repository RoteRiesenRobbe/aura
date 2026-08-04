-- Step 8a chunk 1a: the whole `game` schema.
--
-- Transcribed from docs/archive/plan-accounts-schema.md §DDL, which carries the
-- reasoning behind every shape. Read it before changing anything here — in
-- particular §"Hashing: lookup keys vs. verifiers" before touching any column
-- holding secret material, and §"The quest ledger" before character_flags.
--
-- One migration, not eight: these tables are created together and no subset of
-- them is meaningful on its own.

-- Case-insensitive text, for identity columns where "Bob" and "bob" must be the
-- same thing. Ships with Postgres as a standard extension, and is *trusted*
-- from PG13 on, so the owning role can install it without superuser.
--
-- ⚑ This belongs here rather than in the manual provisioning steps: a fresh
-- database must be reproducible from migrations alone. Installing it by hand
-- makes this migration appear to work on the machine that did so and fail
-- everywhere else.
--
-- It lands in `public` (the default), NOT in `game` — the down migration drops
-- `game` wholesale, and an extension inside it would be destroyed by that drop
-- rather than by its own statement.
CREATE EXTENSION IF NOT EXISTS citext;

CREATE SCHEMA game;

-- Identity. Aura mints these itself, anonymous-first. Minted on first
-- meaningful action, not on page load, to avoid orphan accounts from players
-- who open the site and immediately log in.
--
-- Deliberately tiny: this row is the FK target everything else hangs off, and
-- is read on every game-side account lookup. Credentials are NOT here (see
-- account_credentials); nothing on this table is sensitive.
CREATE TABLE game.accounts (
    id             BIGSERIAL PRIMARY KEY,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    anonymised_at  TIMESTAMPTZ   -- set on erasure; row kept, credentials deleted
);

-- Credentials, 1:1 with accounts. Separate table so game-path queries never
-- read password material — see the schema doc's "Credential isolation" for what
-- that does and does not buy.
--
-- Row lifecycle: INSERTED with the account itself, carrying only
-- anonymous_secret_sha256 (username/password_hash NULL = anonymous but playable).
-- Registration UPDATEs that same row to add username + password_hash; it is
-- never re-inserted. Erasure DELETEs it — so no row here means ERASED,
-- not "not yet registered".
--
-- ⚑ TWO DIFFERENT HASHES HERE ON PURPOSE — read the schema doc's "Hashing:
-- lookup keys vs. verifiers" before changing any of these columns. A salted
-- hash cannot be a lookup key.
CREATE TABLE game.account_credentials (
    account_id               BIGINT PRIMARY KEY REFERENCES game.accounts(id),
    anonymous_secret_sha256  TEXT UNIQUE,   -- SHA-256 of a 256-bit random token: LOOKUP KEY, must be deterministic
    username                 CITEXT UNIQUE, -- null until registered; the login identity. CITEXT = case-insensitive
    password_hash            TEXT,          -- bcrypt: VERIFIER, found via username, never looked up directly
    -- Session revocation: stamped into every JWT at issue, compared on every
    -- verify. Bumping it invalidates every token issued before that instant.
    --
    -- ⚑ Ships in 1a, not with the password-reset plan: 8a itself builds logout
    -- and silent refresh, and the revocation primitive must exist before the
    -- things that need revoking. Logout that only clears a cookie is not
    -- revocation, and refresh without this is an immortal session.
    token_generation         INT NOT NULL DEFAULT 0,
    -- Username and password arrive together at registration or not at all;
    -- neither is meaningful alone.
    CHECK ((username IS NULL) = (password_hash IS NULL))
);
-- NOT here, by design: recovery_email, password_reset_sha256,
-- password_reset_expires_at. Password recovery is the only part of accounts
-- needing outbound email — infrastructure aura does not have — so it is split
-- into plan-accounts-password-reset.md, which adds those columns in its own
-- migration.

-- Sacrifice unlocks, scoped to ONE CHARACTER SLOT's bloodline — not to the
-- whole account. Survive character death; key/value so a new unlock is an
-- insert, not a migration.
--
-- ⚑ The per-slot scoping is a DESIGN decision, not a shape one: backlog §36
-- ("Three character slots, three bloodlines") rules that sacrificing grants its
-- reward to that slot's bloodline only. GDD §5 still says "account-wide" and
-- needs its one-word edit — read both before authoring unlock content.
--
-- No FK to characters: a bloodline outlives every character in its slot, which
-- is the entire point. The slot is identified by number, not by occupant.
CREATE TABLE game.bloodline_unlocks (
    account_id   BIGINT NOT NULL REFERENCES game.accounts(id),
    slot_index   INT NOT NULL CHECK (slot_index >= 0),
    unlock_key   TEXT NOT NULL,
    unlocked_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (account_id, slot_index, unlock_key)
);

-- One row per life. Sacrificed rows stay as graveyard history.
-- sacrificed_at doubles as the sacrificed flag: NULL means not sacrificed, so
-- there is no separate status column to drift out of sync with the timestamp.
CREATE TABLE game.characters (
    id                     BIGSERIAL PRIMARY KEY,
    account_id             BIGINT NOT NULL REFERENCES game.accounts(id),
    slot_index             INT NOT NULL CHECK (slot_index >= 0),  -- which of the account's character slots
    name                   CITEXT NOT NULL UNIQUE, -- case-insensitive; held forever, incl. by the graveyard
    avatar                 TEXT NOT NULL,          -- content key
    faction                TEXT NOT NULL,          -- Actor vocabulary
    level                  INT NOT NULL DEFAULT 1,
    experience             BIGINT NOT NULL DEFAULT 0,
    active_aura_slot       INT,
    -- Object id of the campfire this character dwelled at. NULL until it binds,
    -- and NULL is a LEGITIMATE persisted value, not "not loaded" — see the
    -- schema doc's "Spawn resolution": it falls through to the existing
    -- defaultSpawnPosition(), which is what every player gets today.
    --
    -- ⚑ Nothing writes this column in 8a. Populating it needs the anchor
    -- object-identity work, deliberately scoped out; that is a later ADDITIVE
    -- chunk with no migration.
    home_campfire_id       TEXT,
    previous_character_id  BIGINT UNIQUE,          -- predecessor in the chain; null for a first life
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    sacrificed_at          TIMESTAMPTZ,            -- NULL = not sacrificed, set = sacrificed (chain event)
    deleted_at             TIMESTAMPTZ,            -- NULL = not deleted, set = soft-deleted
    UNIQUE (id, account_id),                       -- lets the FK below pin to the same account
    FOREIGN KEY (previous_character_id, account_id)
        REFERENCES game.characters (id, account_id),
    CHECK (previous_character_id IS NULL OR previous_character_id <> id),
    -- A row is at most one of sacrificed / deleted — never both. Sacrifice is a
    -- chain event (grants unlocks, mints a successor); delete is plain
    -- character-select housekeeping (grants nothing, no successor). The delete
    -- button only ever targets alive rows, so this should be unreachable — the
    -- CHECK exists so a future bug fails loudly instead of producing a row that
    -- is ambiguously both.
    CHECK (NOT (sacrificed_at IS NOT NULL AND deleted_at IS NOT NULL))
);

-- "Alive" = not sacrificed AND not deleted. At most ONE alive character per
-- (account, slot_index), enforced by the DATABASE rather than by application
-- code counting correctly before an insert.
--
-- The MAXIMUM NUMBER of slots (game.player.maxAliveCharacters, default 3) is
-- deliberately an application concern: nothing here bounds slot_index's range,
-- because that number is a config knob, not a schema invariant.
CREATE UNIQUE INDEX one_alive_character_per_slot
    ON game.characters (account_id, slot_index) WHERE sacrificed_at IS NULL AND deleted_at IS NULL;

-- Graveyard + deleted-character queries need every row, not just alive ones.
CREATE INDEX characters_by_account ON game.characters (account_id);

-- Spellbook: skill -> level. Mirrors SkillComponent.Spellbook.
--
-- ⚑ skill_id is INTEGER, not a string key. Skills do NOT carry a string content
-- key the way mobs do (EntityType name) — skills.SkillID is a plain authored
-- int, pinned-and-never-reused by the same discipline as mob EntityType ids.
CREATE TABLE game.character_spellbook (
    character_id  BIGINT NOT NULL REFERENCES game.characters(id),
    skill_id      INTEGER NOT NULL,
    skill_level   INT NOT NULL DEFAULT 1,
    PRIMARY KEY (character_id, skill_id)
);

-- Loadout slots. FK into the spellbook so a slot cannot reference a skill the
-- character does not know.
--
-- ⚑ That FK dictates snapshot ordering: slots are DELETEd before the spellbook
-- and INSERTed after it. Reverse either and every save fails on the constraint.
CREATE TABLE game.character_loadout_slots (
    character_id  BIGINT NOT NULL REFERENCES game.characters(id),
    slot_type     TEXT NOT NULL CHECK (slot_type IN ('aura', 'passive', 'cooldown')),
    slot_index    INT NOT NULL,
    skill_id      INTEGER,                    -- null = empty slot
    PRIMARY KEY (character_id, slot_type, slot_index),
    FOREIGN KEY (character_id, skill_id)
        REFERENCES game.character_spellbook(character_id, skill_id)
);

-- Quest / NPC state. Generic key/value so a new flag or quest structure is an
-- insert, not a migration.
--
-- ⚑ NOT a speculative table: quests.Ledger is live Go today and this holds it.
-- Read the schema doc's "The quest ledger" for the row layout — three rows per
-- character, not ~70, and a quest's flag_value carries path + running +
-- completed (all three; `running` is not derivable once a quest is repeatable).
CREATE TABLE game.character_flags (
    character_id  BIGINT NOT NULL REFERENCES game.characters(id),
    flag_key      TEXT NOT NULL,
    flag_value    JSONB NOT NULL DEFAULT 'true',
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (character_id, flag_key)
);

-- Successful account events, for operator support — a table rather than a log
-- file because an operator's only tool is SQL over SSH.
--
-- ⚑ Failed logins deliberately absent: an attacker generates those at will, so
-- recording them turns this table into an amplification target. Never write
-- token or password material here either, including truncated forms.
CREATE TABLE game.audit_log (
    id          BIGSERIAL PRIMARY KEY,
    account_id  BIGINT REFERENCES game.accounts(id),
    event       TEXT NOT NULL,        -- 'login' | 'logout' | 'register' | 'password_change' | 'erasure'
    source_ip   INET,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
