# Aura — accounts & character persistence schema

The DDL for roadmap step **8a**, and the reasoning behind each shape. Companion
to `plan-accounts-implementation.md` (how the running server gets state in and
out) and `plan-accounts-frontend.md` (what the player clicks through).

**Status: designed, not started.** Every open question that could be answered is
answered; what remains open is listed in the last section and is blocked on
other plans.

## Storage tiers

Two tiers, and the split is not optional: the sacrifice loop wipes a character
while its unlocks survive.

- **Account level** — identity (anonymous-first secret, optional registered
  username/password) plus per-slot **bloodline** sacrifice unlocks (backlog §36
  — scoped to a character slot, not to the whole account).
- **Character level** — everything else.

Only live players persist. Mobs, NPCs and summons always respawn from their
authored definitions, so nothing world-side is stored.

## Naming

**The identity table is `accounts`; `characters` is one life within it.**

The reason is that **"player" is already taken, twice, meaning something else**:

| Layer | Term | Refers to | Maps to |
|---|---|---|---|
| Go backend | `package player`, `model.PlayerEntity`, `model.PlayerProgression` | the **in-world avatar** | a `characters` row |
| TS frontend | `Account` (`frontend/src/features/accounts/logic/Account.ts`) | the **account** | an `accounts` row |

The frontend module's own docstring reads *"This module represents a player
account. As long as accounts are not persisted in the backend, the account is
held in the local storage of the browser"* — it has used "account" for this
concept since before persistence was designed, and anticipated exactly this
table. Naming the SQL table `players` would leave the database as the only layer
where "player" means the human rather than the avatar, directly contradicting
Go.

## Credential isolation

Credentials live in **`account_credentials`**, 1:1 with `accounts`, rather than
as columns on the account row.

**What this is for:** keeping password hashes out of every query that reads an
account for game purposes. A `SELECT *` in a debug endpoint, an admin tool or a
log line cannot leak a hash that lives in a table the game path never touches,
and erasure becomes a single `DELETE` instead of nulling six columns
individually.

**What it costs:** nothing at runtime. Credentials are read once at login, once
at registration, and once per password reset — never during play. The hot
autosave path touches `characters` and its child tables exclusively, and JWT
verification is a local signature check with no DB read at all. The two halves
are accessed at disjoint times, so the split adds a join to a once-per-session
operation and nothing to the continuous one.

⚑ **What it is NOT:** protection against a compromised `aurad`. Auth runs
in-process (implementation.md §7), so a full process compromise reaches both
tables regardless of how they are arranged. This is defence against *accidental*
disclosure and partial compromise, and it is worth having because it is nearly
free — not because it makes credentials safe.

**Rejected: schema-level or instance-level separation.** It buys little more
than this against the same in-process reality, while reintroducing cross-schema
FKs and a second migration stream.

## Layout

One Postgres instance, one schema, one owning DB user, migrated with
`golang-migrate` run as a library at `aurad` boot. Driver, pool and query style
are specified in `plan-accounts-implementation.md` §0.

## What is and isn't stored

**Persisted:** level, experience, spellbook (skill → level), loadout slots and
active aura index, faction, name, avatar, home campfire, quest/NPC flags,
per-slot bloodline unlocks, succession chain, character slot index, login
credentials (username + bcrypt hash).

**Not persisted:** HP, position, charges · `DerivedStats` (recomputed from
equipped passives on load) · recipe and milestone registries (content, not
state) · combination discoveries (they fall out of the spellbook via the recipe
cascade) · all combat-transient state — cooldowns, status effects, buffs.

⚑ **Charges are listed as not-persisted because that is today's behaviour, not
because it is ruled.** A respawn happens at a campfire, which resets charges
anyway — but backlog **§32** calls "does a charge survive death?" *"the decision
that determines everything else"*, splitting into a hoardable-resource design
versus a per-life pickup. It is **unratified** (PO 2026-07-30). Current
behaviour stands as the default; do not cite it as decided.

## DDL

```sql
CREATE SCHEMA game;

-- Case-insensitive text, for identity columns where "Bob" and "bob" must be
-- the same thing. Ships with Postgres as a standard extension.
CREATE EXTENSION IF NOT EXISTS citext;

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
-- read password material — see "Credential isolation" above for what that does
-- and does not buy.
--
-- Row lifecycle: INSERTED with the account itself, carrying only
-- anonymous_secret_sha256 (username/password_hash NULL = anonymous but playable).
-- Registration UPDATEs that same row to add username + password_hash; it is
-- never re-inserted. Erasure DELETEs it — so no row here means ERASED,
-- not "not yet registered".
--
-- ⚑ TWO DIFFERENT HASHES HERE ON PURPOSE — read "Hashing: lookup keys vs.
-- verifiers" below before changing any of these columns.
CREATE TABLE game.account_credentials (
    account_id               BIGINT PRIMARY KEY REFERENCES game.accounts(id),
    anonymous_secret_sha256  TEXT UNIQUE,   -- SHA-256 of a 256-bit random token: LOOKUP KEY, must be deterministic
    username                 CITEXT UNIQUE, -- null until registered; the login identity. CITEXT = case-insensitive
    password_hash            TEXT,          -- bcrypt: VERIFIER, found via username, never looked up directly
    -- Session revocation: stamped into every JWT at issue, compared on every
    -- verify. Bumping it invalidates every token issued before that instant.
    -- See "Session revocation" below.
    token_generation         INT NOT NULL DEFAULT 0,
    -- Username and password arrive together at registration or not at all;
    -- neither is meaningful alone.
    CHECK ((username IS NULL) = (password_hash IS NULL))
);
-- NOT here, by design: recovery_email, password_reset_sha256,
-- password_reset_expires_at. Password recovery is the only part of accounts
-- needing outbound email — infrastructure aura does not have — so it is split
-- into plan-accounts-password-reset.md, which adds those columns in its own
-- migration. Until it ships, a registered player who forgets their password is
-- locked out permanently (PO-accepted; the register form says so).

-- Sacrifice unlocks, scoped to ONE CHARACTER SLOT's bloodline — not to the
-- whole account. Survive character death; key/value so a new unlock is an
-- insert, not a migration.
--
-- ⚑ The per-slot scoping is a DESIGN decision, not a shape one: backlog §36
-- ("Three character slots, three bloodlines") rules that sacrificing grants its
-- reward to "that slot's bloodline only — not to the account".
-- ⚑ GDD §5 still says "account-wide" and needs its one-word edit; §36 records
-- the amendment as awaiting a design pass, so read both before authoring
-- unlock content.
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
    home_campfire_id       TEXT,                   -- object id; NULL until the character binds. See "Spawn resolution"
    previous_character_id  BIGINT UNIQUE,          -- predecessor in the chain; null for a first life
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    sacrificed_at          TIMESTAMPTZ,            -- NULL = not sacrificed, set = sacrificed (chain event)
    deleted_at             TIMESTAMPTZ,            -- NULL = not deleted, set = soft-deleted
    UNIQUE (id, account_id),                       -- lets the FK below pin to the same account
    FOREIGN KEY (previous_character_id, account_id)
        REFERENCES game.characters (id, account_id),
    CHECK (previous_character_id IS NULL OR previous_character_id <> id),
    -- A row is at most one of sacrificed / deleted — never both. Sacrifice is
    -- a chain event (grants unlocks, mints a successor); delete is plain
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
-- int (definition.go:12), pinned-and-never-reused by the same discipline as mob
-- EntityType/avatar ids.
CREATE TABLE game.character_spellbook (
    character_id  BIGINT NOT NULL REFERENCES game.characters(id),
    skill_id      INTEGER NOT NULL,
    skill_level   INT NOT NULL DEFAULT 1,
    PRIMARY KEY (character_id, skill_id)
);

-- Loadout slots. FK into the spellbook so a slot cannot reference a skill the
-- character does not know.
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
-- ⚑ This is NOT a speculative table — plan-quests.md §10 names three concrete
-- structures it must hold. Read "The quest ledger" below before changing it.
CREATE TABLE game.character_flags (
    character_id  BIGINT NOT NULL REFERENCES game.characters(id),
    flag_key      TEXT NOT NULL,
    flag_value    JSONB NOT NULL DEFAULT 'true',
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (character_id, flag_key)
);

-- Successful account events, for operator support. See implementation.md §0.
-- ⚑ Failed logins deliberately absent — an attacker generates those at will,
-- so recording them turns this table into an amplification target.
CREATE TABLE game.audit_log (
    id          BIGSERIAL PRIMARY KEY,
    account_id  BIGINT REFERENCES game.accounts(id),
    event       TEXT NOT NULL,        -- 'login' | 'logout' | 'register' | 'password_change' | 'erasure'
    source_ip   INET,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## The quest ledger

`plan-quests.md` §10 (*"Step-8 handoff — what persistence must know"*) names
three structures this schema must hold:

⚑ **Corrected 2026-07-31 against the shipped code (chunk 1a).** The section
below was written from `plan-quests.md` §10 while the ledger was still a paper
shape. `quests.Ledger` is now live Go, and it is the authority — the table is
restated against `pkg/aura/quests/ledger.go` rather than against the plan.
`killCounts` and `talkedTo` matched as designed; the per-quest row did **not**.

| Ledger field | Shape (as SHIPPED) | Home |
|---|---|---|
| `quests` | quest id → `Progress{Path []string, Running bool, Completed bool}` — the **ordered** list of stages entered, plus **two** independent flags | `character_flags`, one row per quest, `flag_value` a JSONB object with **all three** members |
| `killCounts` | `map[MobID]uint64` — lifetime count | `character_flags`, JSONB map in **one** row |
| `talkedTo` | `map[MobID]bool` — a set | `character_flags`, JSONB array in **one** row |

⚑ **`running` is a third field and must be persisted; do not derive it.** The
original wording named only *"stage path + completed flag"*, which drops it.
Today `running == !completed` happens to hold for every persistable entry — but
only because no quest authors `repeatable: true`. `Ledger.Accept` explicitly
permits re-accepting a *completed* repeatable quest (`ledger.go`: it refuses
only when `p.Completed && !q.Repeatable`), which produces `Running && Completed`
simultaneously. Deriving the flag would silently drop a live run the first time
a repeatable quest is authored — a defect that would appear long after the code
that caused it, in content rather than in Go.

**Which entries are worth a row:** exactly those with `Running || Completed`, the
same rule `Ledger.Snapshot()` already applies. An abandoned quest returns to
`{nil, false, false}` (D13), which is indistinguishable from never-started and
needs no row. ⚑ A *completed* quest that was later re-accepted and abandoned
keeps `Completed`, so the rule cannot be shortened to "running only".

**JSONB keys are strings**, so both `MobID` maps serialise with their numeric ids
as object keys. Harmless, but it means the load path parses them back rather than
scanning integers.

**The generic key/value table holds all three without a schema change**, which
is what it was built for. Three consequences that are *not* free:

⚑ **The stage path is ordered, and the order is the data.** Branch paths differ
per character and the journal renders the stages *this* character actually
walked (`plan-quests.md` L6). A JSONB array preserves order; a set or a
"current stage" column would silently destroy it.

⚑ **`MobID` stability becomes a persistence constraint, not just a wire one.**
Both maps are keyed by `MobID` (1–64, authored) rather than `EntityType` or
entity id — L12's reasoning. Once those keys are *stored*, a reused or
renumbered id silently repoints every historical counter at a different species.
`plan-quests.md` C1 adds a **duplicate-id boot guard** and states it must exist
*"before any of this persists"* — a **hard ordering dependency** on this schema,
and the same defect class the §28 wire-enum pinning exists to prevent.

⚑ **Volume interacts badly with the delete-and-reinsert snapshot.** Up to ~64
counter rows per character, and `plan-accounts-implementation.md` §4 rewrites
*every* flag row on every autosave. Storing `killCounts`/`talkedTo` as **one
JSONB row each** rather than a row per species keeps that at 3 rows instead of
~70 — the reason the table above assigns them that way.

**Scoping: per character.** `plan-quests.md` D5 rules quest state per-character
and asks step 8 to confirm it. Confirmed — `character_flags` is keyed by
`character_id`, so quest progress does **not** ride the per-slot bloodline that
sacrifice unlocks use. A fresh character replays the world; only unlocks accrue
to the slot.

## Session revocation: `token_generation`

A JWT is **self-contained** — the server signs it and afterwards verifies it
without any lookup. That is what makes it cheap, and it is also why the server
holds no list of issued tokens and **cannot cancel one**. A JWT is valid until
it expires, full stop.

`token_generation` is the standard escape hatch: one integer per account,
included as a claim when a token is issued and compared on every verify. A
mismatch means the token predates the bump and is rejected. **Bumping it
invalidates every token for that account at once.**

Three consumers, two of them in 8a:

| Consumer | Plan | Without the column |
|---|---|---|
| **Logout** | 8a | `POST /api/auth/logout` clears the cookie — which logs out *that browser* and does nothing to a token copied off the machine. Logout would not be revocation, and "log out everywhere" could not be built |
| **Silent session refresh** | 8a | `/api/session/refresh` renews a token indefinitely while playing. A stolen token could be refreshed forever with **nothing able to stop it** |
| **Password reset** | reset plan | Invalidating an attacker's session is the main reason recovery exists |

⚑ **The revocation primitive must exist before the things that need revoking.**
This column is created in 8a chunk 1a, not by the reset plan, because 8a ships
cookies, silent refresh and a logout button — and the reset plan is deliberately
sequenced last, behind a mail-provider decision.

**Absolute session cap: skipped (PO-ruled 2026-07-30), a known accepted gap.**
A cap would bound a leak **nobody has noticed**; a generation bump ends one
**somebody has**. With `token_generation` present, the remaining exposure is a
token stolen and used without the owner ever noticing, on a project holding no
money and no personal data beyond a username. Adding it later is one extra claim
(an issued-at-login timestamp carried through refreshes) and needs no migration.
Revisit if accounts ever carry anything of real-world value.

## Hashing: lookup keys vs. verifiers

Three columns hold secret material and **they do not all get the same
treatment**, because they answer different questions.

| Column | Role | Hash | Why |
|---|---|---|---|
| `password_hash` | **verifier** | bcrypt (slow, salted) | Found via `username`, then compared. Slowness is the point — it must resist offline brute force against human-chosen passwords |
| `anonymous_secret_sha256` | **lookup key** | SHA-256 (fast, unsalted) | The client presents only this; there is no other handle to find the row by |
| `password_reset_sha256` | **lookup key** | SHA-256 (fast, unsalted) | Same — the reset link carries only the token. Lives in `plan-accounts-password-reset.md`; listed here because the rule is identical and that plan points back at this section |

⚑ **A salted hash cannot be a lookup key.** bcrypt embeds a random salt per row,
so `WHERE col = bcrypt(input)` never matches — you would have to read every row
and bcrypt-compare each one.

**This is an easy trap, and the project has a worked example of falling into
it:** the third-party Java fork reviewed and rejected for this work
(`proehr/mindcraft-backend`) did `findByPassword(oldPassword)` — a plaintext
lookup against a salted column. See implementation.md §7's review table.

**SHA-256 is correct, not a compromise, for these two specifically.** bcrypt's
slowness defends against guessing *low-entropy human-chosen* inputs. These
tokens are **256 bits of CSPRNG output** — unguessable regardless of hash speed.
Fast hashing is what makes them indexable, and indexability is the whole
requirement. This is the standard treatment for session tokens and API keys.

⚑ **Do not "fix" a failing lookup by storing these in plaintext.** The hash
exists so a leaked database dump does not immediately yield live credentials.
The requirement is *deterministic*, not *absent*.

**Rules for both token columns:**
- Generated server-side from a CSPRNG, minimum 256 bits.
- The raw token is shown to the client exactly once and never stored.
- `password_reset_sha256` is cleared on use (single-use) and on expiry.

⚑ **The play ticket is a third token of this shape and gets NO column here.**
It is minted at `POST /api/characters/{id}/select`, presented once on the WS
`Join`, and burned. Same generation rules (CSPRNG, ≥ 256 bits, shown once) but
**in-memory with a 30 s [PLACEHOLDER] TTL** — nothing about a ticket needs to
survive a restart, because a restart drops every live connection anyway. Resist
adding a table for it: a row written and deleted within 30 s is pure write
amplification against the same database the autosave path uses.

## Spawn resolution

`home_campfire_id` is nullable and **starts NULL**. This ladder is the full
contract, evaluated at every world entry (first join, character-select join,
respawn):

1. **Set and resolves** to a currently-loaded anchor → spawn there, jittered
   within its `DwellRadius` (the same treatment a bound spawn gets today).
2. **Set but does not resolve** (a zone edit removed that campfire) → fall
   through to 3, and **clear the stale column** so the dead id is not
   re-resolved on every spawn forever.
3. **NULL** → the character's **default spawn point** (rung 4), which today
   resolves to the existing **`defaultSpawnPosition()`** (`sys/state.go:189-210`):
   a random `StartingSpawn`-flagged campfire, jittered within its bind radius.
4. **The character's default spawn point** — the terminal rung.

⚑ **Rung 3/4 is already built and already correct.** It is exactly what every
player gets today, because nothing persists a home fire at all. The only
requirement persistence adds is that **NULL falls into the existing path**
rather than erroring or spawning at `(0,0)`. That path already degrades twice
more on its own (no flagged fire → any campfire → a random world position), so
the ladder cannot bottom out in a failure.

### NULL is not a momentary state

Binding requires **dwelling** inside a fire's radius for `campfireDwellTicks`
(`state.go:558-563`), not merely spawning in it. A fresh character lands inside
a starting fire's `DwellRadius` (rung 3 jitters within it), so standing still
binds them shortly after arrival — but a player who **runs off immediately**
never binds, and `home_campfire_id` is still NULL at the first autosave, at
logout, and on the next login.

- The save path must treat NULL as **a legitimate value to persist**, not as
  "not loaded yet" or a reason to skip the write.
- The load path must not assume a returning character has a home.
- ⚑ **Do not "fix" this by stamping the spawn fire as the home at creation.**
  That would permanently bind every character to a fire they never dwelled at,
  quietly changing what binding means — the dwell requirement *is* the mechanic,
  and a spawn is not a bind.

### Rung 4: every character has a default spawn point (PO 2026-07-30)

A character always has a default spawn point to fall back to, and it is **a
property of the character**, not of the last place it stood. Whatever disappears
out from under a saved character — its bound campfire, or eventually its whole
zone — resolution ends here rather than failing.

| When | Resolves to |
|---|---|
| **Today** | The one loaded zone's `StartingSpawn` campfires — i.e. exactly `defaultSpawnPosition()`. Nothing to author, nothing to store |
| **Later** | Keyed by **race or faction**. Then it becomes a lookup from an authored table, still per character, still terminal |

⚑ **This needs no column today, and adding one now would be wrong.** The server
loads **exactly one zone** (`cmd/aurad/loaders.go:184` — a single `loadZone`
call; `api/zones/` holds `world.json` plus the legacy `proving-grounds.json`,
never both live), so there is no `zone_id` on `characters` and nothing for a
"missing zone" to be missing *from* yet. The ruling is recorded as the shape the
answer must take when multi-zone arrives, so the terminal rung is designed
rather than improvised the day a zone is first retired.

⚑ **The faction hook is blocked by the same thing as `avatar`.**
`player.Faction()` is hardcoded to `model.FactionAligned`
(`model/player/player.go:600-602`) — there is no player-chosen faction to key a
spawn point off.

### Anchor object identity — designed, NOT part of 8a

⚑ **`home_campfire_id` ships as a column nothing writes**, staying NULL, which
rung 3 already handles. Populating it needs the work below, which becomes a
**later additive chunk**: no migration, no schema change, no rework of anything
built in 8a. Pulling it into 8a would drag the zone editor and `zone.json`'s
authored format into an accounts plan.

`home_campfire_id` has nothing to point at today:

- `world/zone.go:114-123` — the authored `Campfire` in `zone.json` is
  `{x, y, startingSpawn}`. No id.
- `sys/state.go:91-100` — the runtime `CampfireAnchor` derived from it is
  `{Pos, DwellRadius, StartingSpawn}`. Still no id.
- `sys/state.go:562` — a player's bind is stored as
  `s.anchors[client.UUID()] = near.Pos` — a raw position.

**There already is a general "anchor" concept, just not an identified one.** The
player-side store is `anchors map[uuid.UUID]phy.Vec2f` (`state.go:119`) — named
and keyed generically (by client, not by "campfire"), a clean seam for something
beyond campfires eventually granting a respawn point. But `CampfireAnchor` is
the only thing feeding it, and the value carried end-to-end is a bare position —
that is the actual gap, not the concept.

**No zone-placed object has a stable id today**, checked across `Prop`, `Spawn`
and `Campfire` (`zone.go`) — this would be the first placed-object identity in
the authoring pipeline, not an extension of an existing pattern.

**The design:**
- Zone editor assigns a stable, opaque object id (UUID, assigned once at
  placement, never regenerated on re-export) to each placed `Campfire` in
  `zone.json`. No display name needed — the editor already shows campfires by
  position.
- Thread it through: `CampfireAnchor` gains an `Id`; `SetCampfireAnchors`
  carries it; the player-bind value becomes `{Id, Pos}` instead of a bare
  `phy.Vec2f` (~10 read sites in `state.go` — a real if mechanical refactor);
  `reconnectStash.anchor` gains the same id.
- `characters.home_campfire_id` stores that id as `TEXT` — an opaque UUID needs
  no DB-side authority table, same as `skill_id` referencing static content.
- Load-time resolution is by id, not position, per the ladder above.
- **Naming deferred (YAGNI):** renaming the Go type (`CampfireAnchor` →
  `RespawnAnchor`) only pays off once a second anchor-granting object type
  exists. The id design does not require it.

## Deletion behaviour

No `ON DELETE` clauses, so Postgres blocks deletion of any referenced row. That
is deliberate: a graveyard that can be silently broken by a stray delete is
worse than one that refuses to be broken. Erasure goes through anonymisation
instead.

**Account erasure and the character-select "delete" button are unrelated
mechanisms working on different rows:**

| | Account erasure | Character delete (`deleted_at`) |
|---|---|---|
| Triggered by | a deletion/privacy request | the character-select delete button |
| Touches | `account_credentials` row + **every** character name for that account | one `characters` row |
| Row survives? | yes, anonymised | yes, soft-deleted |
| Name released? | yes, all of them | yes, that one |
| Reversible? | no | no (no "undelete" UI planned) |

A character's row is never hard-deleted — an actual `DELETE` would need
`ON DELETE CASCADE` through `character_spellbook` / `character_loadout_slots` /
`character_flags`, exactly the silent-breakage surface this schema avoids.

## Character age

There is no `BirthTick`. A tick counter is meaningless across server restarts;
`created_at` and `sacrificed_at` are wall-clock timestamps and cover any
player-facing age display, which the graveyard needs anyway.

## Succession chain

`previous_character_id` is a self-reference, nullable for a first life, `UNIQUE`
so the chain cannot fork into a tree, pinned by composite FK to the same
account, and checked against self-reference.

**One bloodline per slot.** A sacrifice successor inherits its predecessor's
`slot_index` — the chain never crosses slots. A character created into an
*empty* slot is always a first life (`previous_character_id NULL`), never
implicitly linked to whatever last occupied that slot: a **deleted** predecessor
leaves no successor by design, and only sacrifice extends a chain.

Slot assignment at creation is the lowest `slot_index` not currently held by an
alive character for that account — an application-layer choice; nothing in the
DDL numbers or bounds the slots, only guarantees at most one alive occupant per
slot.

Walking a full chain:

```sql
WITH RECURSIVE chain AS (
    SELECT * FROM game.characters WHERE id = $1
    UNION ALL
    SELECT c.* FROM game.characters c JOIN chain ON c.id = chain.previous_character_id
)
SELECT * FROM chain ORDER BY created_at;
```

## Erasure

On a deletion request, anonymise in place rather than deleting. The rows stay,
the chain stays intact, and severing the link to an identifiable person is what
takes the remaining data out of scope:

```sql
BEGIN
  -- Every credential, and the one column that is inherently personal data
  -- (recovery_email, once plan-accounts-password-reset.md adds it), leaves with
  -- this row in ONE statement. The account row itself stays, so the succession
  -- chain and unlock history remain referentially intact.
  DELETE FROM game.account_credentials WHERE account_id = $1;

  UPDATE game.accounts
     SET anonymised_at = now()
   WHERE id = $1;

  UPDATE game.characters
     SET name = 'deleted_' || id
   WHERE account_id = $1;
COMMIT
```

⚑ **The credential split is what makes erasure one `DELETE`** instead of
"null six columns individually and hope none is missed as the table grows" — a
real argument for the split in its own right, since erasure's correctness now
depends on a table boundary rather than on remembering to extend a `SET` list.

⚑ **Erasure releases the `username` too**, same as character names, for the same
reason.

⚑ **An account with no credentials row is indistinguishable from a
never-registered one by shape alone** — `anonymised_at` is what tells them
apart, and is why that column stays on `accounts` rather than moving out with
the credentials.

Names are player-authored free text and routinely contain real names, so they
are rewritten rather than kept. A row with `anonymised_at` set cannot be logged
into.

**Consequence:** because names are unique forever, erasure releases the original
name back into circulation. That is intended — holding a deleted person's chosen
name in perpetuity is the stranger outcome. Permanently reserving names through
erasure would need a separate `reserved_names` table outliving characters, which
is not being built.

*(Engineering framing, not legal advice — worth a sanity check with whoever owns
compliance.)*

## Open — blocked on other plans

⚑ **§41 — is location discovery per character, per bloodline, or per account?**
Fast travel is unscheduled and may change shape entirely, so the discovered-set
scope is **not decided** (PO 2026-07-30). Whichever way it lands it is another
`character_flags`-shaped blob and needs no new table — but it does *not*
automatically inherit the per-character quest answer; §41 calls it "the same
question, same session" as §36's bloodline scoping, and §36 went **per-slot**.

⚑ **§32 — does a spellbook charge survive death?** Unratified; see "What is and
isn't stored" above.

⚑ **`avatar` and `faction` have no player-facing chooser.** Both are `NOT NULL`
and both ship as placeholder constants until `plan-avatar-system.md` lands and a
faction choice exists.
