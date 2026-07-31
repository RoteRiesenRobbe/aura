# Aura — Accounts & Persistence: implementation plan

How the running server gets state into and out of the schema, and the failure
modes that need handling explicitly. Companion to `plan-accounts-schema.md`
(the DDL) and `plan-accounts-frontend.md` (what the player clicks through).

Aura has no database today — everything is in memory. Standing one up is net-new
work in this step, which is why the migration tooling and backup items in §8 are
part of the scope rather than a follow-up.

**Status: designed, not started.**

---

## 0. Tech stack

Everything here is **reversible plumbing**, not a design ruling: each choice is
one package boundary wide, and the "reconsider if" triggers are stated so a
later change is a decision rather than a regret.

### The Go database layer

| Concern | Choice | Why |
|---|---|---|
| **Driver** | **`pgx/v5`, native interface** (`pgxpool`), *not* `database/sql` | The schema is already Postgres-only and irreversibly so — `CITEXT`, `JSONB`, partial unique indexes, composite FKs. `database/sql` buys portability to a database this project will never use, and costs pgx's native types, batching and `COPY`. |
| **Query style** | **Hand-written SQL** in a `pkg/aura/store` package, one file per aggregate | ~20 queries against 8 tables. An ORM is the wrong shape for a codebase whose stated principles are KISS/YAGNI, and the queries here are joins-free lookups plus three transactions. |
| **Codegen (`sqlc`)** | **Considered, deferred** | It would fit the project's `go generate` culture (enumer, FlatBuffers) and give type-safe queries. Rejected for now on volume: a build-tool dependency to save ~20 scan blocks. ⚑ **Reconsider if** the query count passes ~40, or if hand-mapping becomes a source of bugs. |
| **Pool** | `pgxpool` with **`MaxConns` set explicitly**, start at **10 [PLACEHOLDER]** | One process, one instance. The load is periodic batched autosaves plus occasional auth requests — nothing concurrent enough to want a large pool. Postgres' own default `max_connections` is 100, so 10 leaves ample headroom for a psql session and a `pg_dump`. |
| **Connection string** | **`AURA_DB_URL`** from the environment at boot, never `conf.json`. Tests read **`AURA_TEST_DB_URL`** and skip when it is unset | Follows the secrets rule in §8 — `conf.json` is tracked and holds game tuning. Names pinned here so nothing invents its own. |
| **JWT signing key** | **`AURA_JWT_KEY`**, same treatment | HS512 is symmetric, so this signs *and* verifies — a secret on the DB-password tier. |
| **Transactions** | Explicit `pgx.Tx` at exactly three sites: **character creation** (accounts + credentials + characters), **sacrifice** (§3), **snapshot write** (§4) | Everything else is a single statement. Naming the three keeps "wrap it in a transaction just in case" out of the codebase. |

⚑ **`golang-migrate` is used as a LIBRARY, not the CLI.** Migrations run inside
`aurad` at boot (§8), so the CLI never appears on the server. Embed the
versioned SQL with **`go:embed`**, matching how content is already embedded
(`backend/pkg/api/`) — otherwise the binary is no longer self-contained and the
single-binary deploy stops being true.

### Pinned versions, and why they are pinned (chunk 1a)

**`golang-migrate v4.17.1` + `pgx v5.6.0`, deliberately not the latest**, because
**`backend/go.mod` stays at `go 1.22`** (PO-ruled 2026-07-31). The current
releases of both declare a newer floor — migrate v4.18+ wants `go 1.23.0`, pgx
v5.7+ wants `1.23.0` and v5.10 wants `1.25.0` — so taking them would raise the
minimum toolchain for the whole project. The pinned pair was verified against the
live **Postgres 18.4** before being adopted, so "older" here does not mean
"unproven against the server we run".

⚑ **`github.com/rogpeppe/go-internal` is pinned to v1.12.0 for the same reason,
and it is the non-obvious one.** It is a test dependency of a test dependency
(pgx → `gopkg.in/check.v1` → `kr/text` → here), so nothing aura writes will ever
import it — but `go mod tidy` resolves it to the newest version, and every
release from **v1.13.1 onward requires go ≥ 1.22 / 1.23**, which makes `go mod
tidy` fail outright with *"requires go@1.25, but 1.22 is requested"*. Remove the
pin and tidy breaks; that is the whole reason the line exists.

⚑ **`go mod tidy` will silently raise the `go` directive** (it moved 1.22 → 1.25
unasked during this chunk, and upgraded `golang.org/x/crypto` with it). Run it as
**`go mod tidy -go=1.22`** until the floor is deliberately moved, and check the
`go.mod` diff afterwards.

### Where Postgres runs

**On the same VPS as `aurad`, installed as an OS package, managed by systemd,
bound to `127.0.0.1`.**

The existing deployment decides this more than any preference does: the live
server is a **single Go binary under systemd** on a Hetzner CX23
(`plan-playtest-deploy.md`), deployed by `rsync` + `systemctl restart`, with
**ports 22/80/443 open and everything else on loopback**. A localhost Postgres
drops into that shape with no new moving parts and satisfies the "bound to
localhost" ops item by construction.

| Rejected | Why |
|---|---|
| **Docker** | There is **no Docker anywhere in the deploy path** today. Adding a container runtime for one process introduces a whole class of thing — image builds, volume lifetime, restart ordering against `aurad` — to a deploy whose virtue is that it has none. |
| **Managed Postgres** | Monthly cost against a €4–6 VPS, plus a network hop on every autosave, for durability guarantees a hobby project has not asked for. ⚑ Revisit **only** if the backup runbook proves too fragile to operate. |

⚑ **This adds a provisioning step `deploy.sh` does not have.** Installing
Postgres, creating the role and database, and setting `EnvironmentFile` are
**one-time manual server work**, not part of the deploy script. Write them into
the same runbook as the backup commands (§8) — the deploy path stays
"rsync + restart" and must not silently grow a database install.

### ⚑ MANUAL STEP (PO) — stand up Postgres before chunk 1a

**This is not code and no chunk does it.** Chunk 1a's first line of Go needs a
database to exist. Two separate environments, both manual, both one-time.

**A. Local dev (Windows) — needed before chunk 1a starts.**
✅ **Done and verified 2026-07-31** on Postgres **18.4**; the steps below are the
record of what was actually run.

1. Install Postgres (17 or newer): `winget install PostgreSQL.PostgreSQL.17`, or
   the installer from postgresql.org. Accept port **5432** and record the
   superuser password.

   ⚑ **`psql` will not be on `PATH`, and the installer's `pg_env.bat` does not
   fix it.** That script uses `SET`, which affects only the console process it
   runs in — double-clicking it sets the path in a window that then closes.
   Nothing is wrong and no restart helps. Either call `psql` by full path, or
   add it to `PATH` once:

   ```powershell
   [Environment]::SetEnvironmentVariable('Path',
     [Environment]::GetEnvironmentVariable('Path','User') + ';<install-dir>\bin', 'User')
   ```

2. Create the role and **two** databases — the dev one, and the disposable
   `aura_test` that DB-touching tests skip when absent
   (`plan-accounts-frontend.md` §11). One invocation prompts for the superuser
   password once:

   ```sql
   CREATE ROLE aura WITH LOGIN PASSWORD '<dev-password>';
   CREATE DATABASE aura      OWNER aura;
   CREATE DATABASE aura_test OWNER aura;
   ```

   ⚑ **`CREATE EXTENSION citext` is NOT done by hand** — it belongs in the first
   migration, so a fresh database is reproducible from migrations alone. Doing it
   manually makes 1a's migration appear to work here and fail everywhere else.

3. Set the environment for local runs. **`AURA_DB_URL`** =
   `postgres://aura:<dev-password>@localhost:5432/aura`, **`AURA_TEST_DB_URL`** =
   the same with `/aura_test`.

   ⚑ **PERCENT-ENCODE THE PASSWORD. This bit chunk 1a for real, and the four
   verification checks below do not catch it**, because they use `psql`. libpq's
   URI parser is lenient; **Go's `net/url` is not**, and it rejects characters
   like `^`, `>`, `<`, spaces and braces in the userinfo section outright. Both
   `pgx` and `golang-migrate` parse the string as a URL, so a connection string
   that works perfectly in `psql` fails in Go with `net/url: invalid userinfo` —
   an error that reads like a malformed host. Encoded values keep working in
   `psql`, so encoding is strictly safer:

   ```powershell
   # Re-encode in place. Skips any value already containing '%', so it is safe
   # to re-run after rotating the password.
   foreach ($n in 'AURA_DB_URL','AURA_TEST_DB_URL') {
     $raw = [Environment]::GetEnvironmentVariable($n,'User')
     if ($raw -match '^(?<s>postgres(?:ql)?://)(?<u>[^:@/]+):(?<p>.*)@(?<r>[^@]+)$' -and -not $matches['p'].Contains('%')) {
       [Environment]::SetEnvironmentVariable($n,
         $matches['s'] + $matches['u'] + ':' + [System.Uri]::EscapeDataString($matches['p']) + '@' + $matches['r'], 'User')
     }
   }
   ```

   ⚑ A **fifth check** belongs beside the four below, and it is the only one that
   would have caught this: connect **from Go**, not from `psql`.

   ⚑ `[Environment]::SetEnvironmentVariable(…,'User')` writes the registry, so
   **already-open shells and editors do not see it** — the same trap as `psql`
   not being on `PATH`. Start a new shell, or read the value back with
   `[Environment]::GetEnvironmentVariable($n,'User')`.

   ⚑ **`AURA_JWT_KEY` must come from a CSPRNG**, not from a convenience helper.
   It signs every session; anyone who can reproduce it can forge any token.
   PowerShell's `Get-Random` is `System.Random` — seeded and predictable — and
   sampling a character set *without replacement* also silently caps the length
   at the size of that set. Use:

   ```powershell
   $b = [byte[]]::new(48)
   [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
   [Environment]::SetEnvironmentVariable('AURA_JWT_KEY',[Convert]::ToBase64String($b),'User')
   ```

4. **Verify before starting 1a** — these four checks are the actual gate:

   | Check | Expect |
   |---|---|
   | `psql "$AURA_DB_URL" -tAc "SELECT current_database(), current_user;"` | `aura\|aura` |
   | same against `AURA_TEST_DB_URL` | `aura_test\|aura` |
   | `SELECT count(*) FROM pg_extension WHERE extname='citext';` | **0** — not pre-installed |
   | `CREATE EXTENSION citext;` then `DROP EXTENSION citext;` as the **`aura`** role, in **both** databases | succeeds |

   ⚑ **The last check is the one worth keeping.** `citext` is a *trusted*
   extension only from PG13 onward, so on an older server a non-superuser cannot
   install it — and 1a's very first migration would fail with a permissions error
   that reads like a broken migration rather than a privilege gap.

**B. Live server (Hetzner VPS) — needed only before 8a deploys, not before it
is written.**

Install Postgres from the distro package, create the same role and database,
confirm it listens on **`127.0.0.1` only** (matching the existing "everything
but 22/80/443 on loopback" posture), and put `AURA_DB_URL` + `AURA_JWT_KEY` into
the systemd `EnvironmentFile`. ⚑ **None of this goes into `deploy.sh`** — see
§8. Record the exact commands in the runbook beside the backup/restore ones.

⚑ **`AURA_JWT_KEY` must differ between local and live**, and rotating the live
one invalidates every session (§8).

### In-memory state, and its single-instance assumption

Two things live in process memory rather than Postgres:

| State | Lifetime | On restart |
|---|---|---|
| **Play tickets** | 30 s TTL | Forgotten — harmless, and the silent retry (§7b) covers the player mid-click during a deploy |
| **Failed-login / rate-limit counters** | Sliding window | Forgotten — ⚑ **a restart resets every throttle**, so a determined attacker gains attempts across a deploy |

The throttle reset is **accepted, not overlooked**: deploys are manual and rare,
and the alternative (counters in Postgres) puts a write on every failed login —
exactly the request an attacker controls the rate of.

⚑ Both structures assume **one `aurad` instance**, the same assumption the
migration advisory lock rests on. A second instance would need both moved to
shared storage; nothing here is designed for that.

### Throttle mechanism

Implements the ruling in §7b (*progressive delay on both axes, no hard
lockout*):

- Two in-process maps, keyed by **source IP** and by **account id**, each
  holding `{failures, lastFailure}`.
- Delay grows with consecutive failures — **0, 1, 2, 4, 8 s, capped at 30 s
  [PLACEHOLDER]** — applied as a sleep before the response, so the client sees
  slowness rather than an error code.
- A counter **decays** after 15 min [PLACEHOLDER] of no failures, and **resets
  on a successful login**.
- ⚑ **The delay must be applied AFTER the dummy bcrypt comparison**, not
  instead of it, or the throttle reintroduces the timing oracle §7b closes.
- ⚑ **Sleeping holds a connection.** With a large enough delay this is itself a
  cheap resource-exhaustion vector; the 30 s cap is what bounds it.

### Audit logging

A **`game.audit_log` table** (DDL in the schema doc), not a log file: an
operator's only support tool is SQL over SSH (§8), so an audit trail they cannot
query alongside the account is of little use. It records successful logins,
registrations, logouts, password changes and erasures.

⚑ **Do not log failed logins here.** It is the one event an attacker can
generate without limit, and writing a row per attempt turns the audit trail into
an amplification target. Failed attempts are the throttle's business; the audit
log records what **succeeded**.

⚑ **Never log token or password material**, including truncated forms.

### Backups

`pg_dump` on a **systemd timer** (the deploy already speaks systemd; no cron),
written locally, then copied **off-machine**. The restore half is the part that
matters and is specified in §8 — a backup that has never been restored is a
hypothesis. Concrete commands belong in the runbook, beside the provisioning
steps above.

---

## 1. Decided parameters

| Decision | Value |
|---|---|
| Database | Postgres, one instance, one schema `game` |
| Auth | Native Go — bcrypt + JWT (HS512) in `aurad` |
| Acceptable progress loss on hard crash | ~5 minutes |
| Autosave interval | 5 minutes (per character, staggered) |
| Save on disconnect | Immediately, then again on session expiry if dirty |
| Session hold after disconnect | 10 minutes (existing behaviour, unchanged) |
| Write granularity | Full character snapshot |
| Not persisted | HP, position, charges, `DerivedStats`, cooldowns, buffs, status effects |
| Durability per write tier | `synchronous_commit = off` for autosave/forced-save writes; left at the default (`on`) for the sacrifice transaction — see §4 |

### ⚑ Vocabulary — read this before writing any Go

"Player" means **two different things** depending on layer:

| Term | Layer | Means |
|---|---|---|
| `accounts` (SQL) | DB | the human / the login |
| `account_credentials` (SQL) | DB | that account's login material, 1:1, split out so game queries never read hashes |
| `characters` (SQL) | DB | **one life**. This is what Go calls a "player" |
| `player` / `model.PlayerEntity` (Go) | backend | the **in-world avatar** — maps to a `characters` row, *not* to `accounts` |
| `Account` (TS) | frontend | the account — already correct, predates this schema |

⚑ **`player.Name()`, `player.Progression()` and `SkillComponent` all persist to
`characters`, never to `accounts`.** The Go `player` package has no
account-level concept in it at all today; that is net-new surface. Full
rationale in `plan-accounts-schema.md` §Naming.

**Progress-loss tolerance and autosave interval are coupled by construction**
(the interval defines the worst-case gap a crash can lose). **Session hold is a
different, unrelated number** — it governs how long a disconnected character's
live combat state stays resumable in memory (the existing
`reconnectStashTTLTicks`, pre-dating persistence entirely), not how often
anything gets saved. ⚑ Don't couple it to the autosave interval in code just
because the two once read the same.

---

## 2. Save triggers

Five triggers. The interval is the baseline; the rest are what actually protect
data.

| Trigger | When | Why |
|---|---|---|
| **Interval** | Every 5 min per character, staggered | Baseline crash protection |
| **Disconnect** | WS connection drops | Cheap, covers the common case |
| **Session expiry** | 10 min after disconnect, if dirty | Catches changes during the hold |
| **Forced events** | See below | Too important to lose to the interval |
| **Graceful shutdown** | SIGTERM, before exit | Otherwise every deploy costs all players up to 5 min |

**Graceful shutdown is not optional.** Without it, a routine deploy is
indistinguishable from a crash for every connected player. On SIGTERM: stop
accepting connections, flush every live character, then exit — with a timeout,
so a stuck write cannot block shutdown forever.

⚑ **If the timeout fires, log which characters failed to flush** — by id and
name. Otherwise the one case where progress is knowingly discarded is also the
one case with no record that it happened, and a player reporting lost progress
after a deploy would be unfalsifiable.

### Forced-save events

These bypass the interval and save immediately:

- **Sacrifice** — mints a new character and grants permanent unlocks
- **Level up** — visible, memorable progress; players notice losing it
- **Skill learned / spellbook change** — same reasoning
- **Home campfire re-bind** — cheap, and respawning at the wrong campfire is a
  bad experience

Everything else (XP accrual, routine flag writes) rides the interval.

---

## 3. The sacrifice transaction

The highest-risk write in the system. It does three things:

1. Set `sacrificed_at` on the outgoing character
2. Insert the successor, with `previous_character_id` pointing at the outgoing
   one
3. Insert the earned rows into `bloodline_unlocks` — ⚑ keyed by
   `(account_id, slot_index, unlock_key)`, so the reward lands on the
   **outgoing character's slot**, not on the account (backlog §36)

**All three in one transaction, no exceptions.** A crash between (1) and (2)
leaves the player with *zero* alive characters in that slot. The partial unique
index does not help here — it prevents two alive characters, not zero.

⚑ **Zero alive characters is a NORMAL state, not a failure to auto-heal.** With
character-select (up to N alive slots), zero-alive is what a brand-new player
has before their first character, and what a player who sacrificed or deleted
every slot has. The login path resolves the account and hands off to
character-select, which shows empty slots and lets the player create one. No
auto-create, and **no implicit `previous_character_id` link** — a character made
from an empty slot is a first life, not a successor. The chain only extends
through an explicit sacrifice.

---

## 4. Snapshot mechanics

The game loop is authoritative and in-memory. The database only learns about
changes when told. Two rules govern that handover.

### Field-by-field mapping

Every persisted column against the actual Go type it reads from (save) and
writes to (load), checked against the code rather than assumed. Of the 9
persisted game-state columns, **3 map cleanly onto existing Go state today, 1
maps with a small behaviour change, and 4 have no runtime source yet** because
the mechanic behind them isn't built or was never wired to an identity.

**`characters` — clean:**

| Column | Go source (save) | Go destination (load) |
|---|---|---|
| `level` | `player.Progression().Level` (`model.PlayerProgression{Level uint32}`) | `player.SetProgression(...)` |
| `experience` | `player.Progression().Experience` (`uint64`) | `player.SetProgression(...)` |
| `active_aura_slot` | `SkillComponent.ActiveAuraSlot` (`int`, `-1` = none) | same field, direct restore |

**`characters` — small behaviour change:**

| Column | Note |
|---|---|
| `name` | Reads/writes cleanly (`player.Name()`), but changes *authority*: today a name is client-supplied at `Join` and de-duplicated live (`manglePlayerName`, `state.go:653`); once persisted, the DB row is authoritative and unique — `Join` stops being where a name is decided. |

**`characters` — no runtime source yet:**

| Column | Gap |
|---|---|
| `avatar` | No `avatar_id` (or any) field exists on the player model at all. Blocked on `plan-avatar-system.md` (unscheduled). Store a placeholder constant until it lands. |
| `faction` | `player.Faction()` exists but is **hardcoded**: `return model.FactionAligned` (`model/player/player.go:600-602`), not read from or written to any stored value. There is no player-chosen faction to persist yet — same class of gap as avatar. |
| `home_campfire_id` | Needs the anchor-identity work, which is **deliberately not part of 8a** — the column ships and stays NULL. ⚑ NULL is also legitimate for any character that never dwelled at a fire, so **persist the NULL**; don't treat it as "not loaded". `plan-accounts-schema.md` §"Spawn resolution". |

**`character_spellbook` / `character_loadout_slots` — clean:**

| Column | Go source (save) | Go destination (load) |
|---|---|---|
| `character_spellbook.skill_id` / `.skill_level` | Iterate `SkillComponent.Spellbook map[skills.SkillID]int` (skill → level) | Rebuild the map entry-by-entry |
| `character_loadout_slots.slot_type` / `.slot_index` / `.skill_id` | Iterate `SkillComponent.AuraSlots` / `.PassiveSlots` / `.CooldownSlots` (`[MaxXSlots]*EquippedSkill`); array identity = `slot_type`, array index = `slot_index` | Re-equip each slot from its stored `skill_id` |

**`character_flags` / `bloodline_unlocks`:**

| Table | Status |
|---|---|
| `character_flags` | ⚑ **Not a speculative table, and not empty on arrival.** `plan-quests.md` **D12 deliberately sequences the quest ledger BEFORE step 8**, *"session-scoped exactly like the spellbook … so step 8 then persists a **live** ledger instead of a paper shape."* By the time this plan is implemented there will be a live Go ledger — `quests` / `killCounts` / `talkedTo` on the player — and this table's job is to store it, not to wait for it. Shape, ordering and the `MobID` stability constraint: `plan-accounts-schema.md` §"The quest ledger". |
| `bloodline_unlocks` | The character-sacrifice mechanic itself isn't implemented in Go yet (scheduled right after step 8). Nothing to read from or write to until it exists; this plan's job was making sure the schema shape is ready, which it is — plain key/value, additive. |

**`accounts` / `account_credentials` columns are not game state** —
`anonymous_secret_sha256` is server-generated at first-character creation (§2);
`username` and `password_hash` are written by the auth endpoints (§7);
`created_at` / `anonymised_at` are DB-managed timestamps. None read from or
write to a live Go player field, so they are out of scope for this mapping.

### Rule 1: snapshot inside the tick, write outside it

A synchronous database write inside the game loop stalls the world for every
player on that server. Instead:

1. **Inside the tick** — copy the character's persistable fields into a plain
   struct. Pure memory copy, no I/O, microseconds.
2. **Outside the tick** — hand that struct to a writer goroutine that does the
   SQL.

### Rule 2: snapshot at a tick boundary, never mid-tick

Reading fields while the loop mutates them produces a torn save — level from one
tick, spellbook from another, a loadout slot referencing a skill the spellbook
copy does not have yet. The snapshot must be taken at a single coherent point
between ticks.

### Writing a snapshot

`characters` is a straightforward `UPDATE`. The child tables are
full-replacement:

```
BEGIN
  UPDATE game.characters SET ... WHERE id = ?
  DELETE FROM game.character_loadout_slots WHERE character_id = ?
  DELETE FROM game.character_spellbook     WHERE character_id = ?
  INSERT INTO game.character_spellbook ...       -- all rows
  INSERT INTO game.character_loadout_slots ...   -- all rows
  DELETE FROM game.character_flags WHERE character_id = ?
  INSERT INTO game.character_flags ...           -- all rows
COMMIT
```

⚑ **Ordering matters.** `character_loadout_slots` has a foreign key into
`character_spellbook`, so slots are deleted *before* the spellbook and inserted
*after* it. Reverse either and every save fails on the constraint.

Delete-and-reinsert is the cost of snapshot-over-deltas. It is fine at this
scale and much harder to get subtly wrong than dirty tracking.

### Volume sanity check

100 concurrent players on a 5-minute interval is roughly one write per 3
seconds. Snapshot writes are not going to hurt. Revisit only if that assumption
stops holding.

### Durability trade: `synchronous_commit = off`

Postgres normally blocks a commit until its WAL record is fsynced to disk —
that's the durability guarantee. `synchronous_commit = off` reports success as
soon as the WAL is written to its in-memory buffer, without waiting for the
flush. The flush still happens on its own (governed by `wal_writer_delay`,
default 200 ms), so the exposure on an unclean shutdown is the last ~200 ms of
"committed" transactions, **not database corruption** — Postgres's crash
recovery still guarantees a consistent restart either way.

⚑ This is a **durability** knob, not a **consistency** one: it has no effect on
what a live, non-crashed connection can read, so it does not interact with the
reconnect/session-race guards in §5.

**~200 ms is three to four orders of magnitude inside the accepted ~5-minute
loss tolerance (§1)** — cheap to take. It is set **per transaction**
(`SET LOCAL synchronous_commit = off`), not globally, to match the risk tiering
§3 already draws:

- **Autosave + forced-save writes** (§2) — `SET LOCAL synchronous_commit = off`.
  The overwhelming majority of write volume, and exactly the kind of loss the
  ~5-minute tolerance was sized for.
- **The sacrifice transaction** (§3) — stays on the default (`on`). It is
  explicitly the highest-risk write in the system, rare, and player-memorable;
  stacking a sub-second durability gap onto the one event that already gets
  "all three in one transaction, no exceptions" treatment buys throughput nobody
  needs, in exchange for a worse specific incident to explain.

No global `postgresql.conf` change — both are one-line `SET LOCAL` calls at the
start of their respective transactions in the Go writer.

---

## 5. Failure modes to handle explicitly

These cause silent data loss rather than loud errors.

⚑ **Several guards below assume a session registry that associates a live
connection with an account.** That registry is not new — it is the existing
`ConnectionStateSystem` (`tokenByClient` / `stashByToken`, `sys/state.go`),
extended to carry `account_id`. Concrete change: `plan-accounts-frontend.md` §8.

**Stale write overtaking a newer one.** Two async writes for the same character
can land out of order — the tick-100 snapshot committing after the tick-150 one,
quietly reverting progress. Enforce **at most one in-flight write per
character**, and drop a queued snapshot if a newer one is pending. A newer
snapshot fully supersedes an older one; there is no need to write both.

### Two live copies of one account

If the same player opens a second connection while the first is live, two
in-memory copies both save and last-write-wins destroys whatever the loser did.

> **An account may be joined into the world exactly once.** Login is
> account-scoped, not character-bound; which character is playing does not enter
> into it.

⚑ **The scope is the ACCOUNT, not the character.** A per-character rule would
permit a player to run **all three of their characters at once** in three tabs —
each a distinct character, each passing a per-character check.

Consequences that follow from the scope, not from the message:

- The live-session registry is keyed by **`account_id`**, not `character_id`.
  This is the same registry change `plan-accounts-frontend.md` §8 requires for
  the reconnect identity check — one change serves both.
- **The check belongs at ticket-mint time as well as at `Join`.** A player who
  is already in-world should be told at `POST /api/characters/{id}/select`,
  before a ticket is issued and before anything appears to have worked.
  Rejecting only at `Join` means character-select visibly succeeds and *then*
  the world refuses them.
- ⚑ **`Join` remains the authority; `/select` is the courtesy.** Two tabs can
  call `/select` simultaneously, both pass the check, and both receive valid
  tickets — the mint-time check cannot be atomic with a session that does not
  exist yet. The session-creating step at `Join` must therefore claim the
  account slot **atomically** (one winner, loser refused), or the exact race
  this rule exists to prevent survives in a narrower window. Do not treat the
  `/select` check as sufficient.
- **Switching characters means leaving the world first.** There is no in-place
  swap: a player returns to character-select (which ends their session) and
  plays another. Worth stating because "one session per account" otherwise reads
  as "you may not switch characters", which is not the rule.

**The second connection is REJECTED; the first is never evicted.** The second
connection gets *"This account is already logged in."*

⚑ **Eviction was considered and rejected, because it is a one-click combat
escape.** A disconnect already removes the player's entity from the world
instantly (`plan-accounts-frontend.md` §12 — a pre-existing exploit). If a
second login *evicted* the first, a player in trouble could open the game in a
second tab and make their endangered body vanish on demand: no packet loss
required, no timing skill, fully deterministic. The flapping-connection case
eviction was meant to serve is already handled by the reconnect path, which is a
different mechanism entirely.

⚑ **Rejection applies to a second *cold* login, never to reconnect.** A client
presenting a valid `reconnectToken` for a stashed session is resuming, not
duplicating (see §6, and the identity-check addition in
`plan-accounts-frontend.md` §8). Conflating the two would break
page-refresh-during-play, which is the exact scenario the reconnect feature
exists for.

**Recovery for a genuinely stuck session** — the client is gone but the server
still holds the session (a hard crash, a killed browser) — is the existing
session hold expiring (§1, 10 min). A player who force-quits and immediately
reopens is inside that window and reconnects normally via their token; a player
who lost the token is locked out until expiry. An accepted, bounded cost of
closing the exploit above.

### The rest

**Reconnect racing the disconnect save.** A player reconnects while their
disconnect-triggered write is still in flight. The reconnect must attach to the
*live* session, which remains the source of truth — not reload from a row that
is mid-write. Load-from-DB is for cold logins only.

**Session expiry racing a reconnect.** The 10-minute timer fires exactly as the
player reconnects. Guard with a session generation/ownership check so the expiry
path cannot tear down a session that has just been re-claimed.

**Database unavailable.** Do not kick players. Keep the world running, retry
with exponential backoff, log loudly. Bound the in-memory retry queue so a long
outage degrades gracefully instead of exhausting memory, and treat sustained
write failure as a paging-level alert — it means every player is accruing
unsaved progress.

**Save failure is invisible to the player.** A persistent write failure should
surface in-client. Silently accruing 40 minutes of doomed progress is worse than
a warning banner.

**Database unavailable at *login* time.** The entry above covers a DB outage
affecting *already-live* players. It says nothing about someone trying to get
*in* during the same outage, which is more likely to be noticed:
character-select cannot list characters and login cannot verify a password,
because both need the DB that autosave is currently failing against. Those
requests fail; the question is only what the player is told — see §5b.

---

## 5b. Player-facing errors

Every failure above is invisible unless the client says something. Specific
messages for the cases that recur; one generic fallback for the rest.

**No message may reveal whether an account exists** — that constraint drives
several of the wordings below, and is why some distinct internal causes share a
single external string.

| Situation | Player sees | Notes |
|---|---|---|
| Wrong username **or** wrong password | "Incorrect username or password." | Deliberately ambiguous — never confirm a username exists |
| Login while that account is already playing | "This account is already logged in." | The §5 rejection. Fires even when the second connection picks a *different* character |
| Registration, username taken | "That username is already taken." | ⚑ This one **does** confirm existence, unavoidably — a registration form must say why it failed. It is the one enumeration vector that cannot be closed, so rate-limit it |
| Registration, username/password fails the rules | The specific rule that failed | e.g. "Passwords must be at least 8 characters and contain one special character." Client-side check first, server-side check authoritative. ⚑ Name the *failed* rule, not the whole list — and for the blocklist say "that password is too common" rather than echoing which entry matched |
| Character creation, name taken | "That character name is taken." | Same unavoidable-disclosure reasoning |
| Character creation at slot cap | "All character slots are full." | Should not be reachable — the UI hides the create affordance — so treat as a bug signal, not a normal path |
| DB unreachable at login / character-select | "Aura is having trouble reaching its database. Please try again in a moment." | Names the failure honestly, promises nothing about duration |
| Play ticket expired or unknown | *(nothing — the client retries silently once)* | Only if the retry also fails: "That took too long; please pick your character again." ⚑ Never surface the word "ticket" |
| Save failing repeatedly while playing | Persistent in-client warning banner | Distinct from the others because the player is already in the world |
| Anything else | "Something went wrong. Please try again." | Log the real cause server-side with a correlation id |

Recovery-flow messages (`forgot-password`, expired/used reset links) live in
`plan-accounts-password-reset.md` §4, including the identical-response
requirement that blocks enumeration.

⚑ **Logging is the counterweight to vague messages.** Every ambiguous
player-facing string above must correspond to an unambiguous server log line —
otherwise the same design that protects against enumeration also blinds
operators during an incident.

---

## 6. Load path

```
cold login (no live session)
  → resolve account (anonymous secret, or account id from a verified JWT)
  → list alive characters (character-select; may be empty)
  → player picks or creates one
  → load that character + spellbook + loadout + flags
  → recompute DerivedStats from equipped passives
  → spawn per the resolution ladder, full HP, charges reset

reconnect (session still live, <10 min)
  → attach to existing in-memory session, no DB read, character-select skipped
```

Character-select's own list/create/delete operations belong to
`plan-accounts-frontend.md`; this doc owns everything from "chosen character"
onward.

HP, position and charges are deliberately absent from the cold path — a
character returns at full health with charges reset, because campfires reset
charges anyway.

⚑ **"At its home campfire" is not guaranteed to have an answer.**
`home_campfire_id` is nullable and **starts NULL**, and stays NULL until the
character *dwells* at a fire long enough to bind — which a player who runs off on
arrival may never do in a whole session. The cold path resolves through a ladder
ending in the **existing** `defaultSpawnPosition()` (`sys/state.go:189-210`),
which is what every player already gets today. Full ladder, and the trap of
"fixing" it by auto-binding at creation: `plan-accounts-schema.md` §"Spawn
resolution".

---

## 7. Auth integration

Auth lives in `aurad`: `golang.org/x/crypto/bcrypt` for password hashing,
`golang-jwt/jwt` for token issuance and verification. Two libraries, no second
runtime, no second migration tool, no second deployment artifact.

**Aura owns identity.** Registration is an optional upgrade attached to an
existing account row, never the source of accounts.

- **Anonymous-first**: aura mints `account_credentials.anonymous_secret_sha256`
  on the player's first meaningful action (the raw token goes to the browser
  once and is never stored server-side).
- **Registration**: sets `username` + `password_hash` on the *existing*
  account's credentials row. No linking, no external id, no
  collision-reconciliation — the account was already aura's.
- **JWT verification** is a local signature check plus a `token_generation`
  comparison (schema doc §"Session revocation").

**HS512**: with one service both minting and verifying, symmetric signing has no
key-distribution problem. RS256 would be correct for shared infrastructure; this
is unambiguously not shared infrastructure.

### Identity is a username, not an email

Registration takes **username + password**. `account_credentials.username` is
`CITEXT UNIQUE` (case-insensitive — `Bob` and `bob` are the same account) and is
what a player types to log in. **This plan collects no email address at all.**
The one optional email in the whole system, `recovery_email`, arrives later with
`plan-accounts-password-reset.md` and exists solely to have somewhere to send a
reset token.

### Password rules

Nothing is inherited from anywhere, so these are decisions rather than defaults.
**PO-ruled, final, not placeholders:**

| Rule | Value |
|---|---|
| Username length | **3–32 characters** |
| Username charset | `[A-Za-z0-9_-]`, case-insensitively unique |
| **Reserved prefix** | **`hrnss_`** is reserved for the browser harness (`plan-accounts-frontend.md` §11). Case-insensitive, like every other name check — see the rule below |
| Password minimum length | **8 characters** |
| Password composition | **At least one special character** (non-alphanumeric) |
| Password blocklist | Reject trivial sequences — `12345678`, `1234567890`, `abcdefgh`, `password`, keyboard runs like `qwertyui`, and the username itself |
| Password maximum length | 72 bytes (a bcrypt limit, not a policy choice) |

The **blocklist** is the load-bearing half: NIST SP 800-63B's central
recommendation is exactly this — screen candidate passwords against known-weak
and sequential values, because that is what stops the passwords attackers try
first.

⚑ **The special-character requirement runs against that same guidance**, and the
tension is recorded rather than hidden: NIST advises *against* mandatory
character-class rules on the grounds that they push users toward predictable
mutations (`Password1!`) without materially adding entropy. **The PO ruled for
it anyway** and it ships as specified. Practical consequence to expect: a
meaningful share of real passwords will end in `!`, so **apply the blocklist
after stripping trailing punctuation**, or `password!` sails through a check
that `password` would have failed.

The 72-byte cap is a hard property of bcrypt — inputs longer than that are
silently truncated, so it must be a validation error rather than a surprise.

**The `hrnss_` reservation rule**, stated precisely because the obvious version
is self-defeating:

> A **character name** may carry the `hrnss_` prefix **only if the creating
> account's username also does.** Registration always rejects the prefix.

- **Registration** (`/api/auth/register`) rejects `hrnss_*` outright. No player
  can ever claim the namespace.
- **Character creation** (`POST /api/characters`) rejects `hrnss_*` unless the
  caller is authenticated as an account whose username starts with it. This is
  what lets the harness delete and recreate its own characters every run while
  the prefix stays closed to everyone else.
- ⚑ **The harness accounts themselves are therefore seeded, not registered** —
  inserted directly into the dev/test database, since the endpoint that would
  create them refuses the name by design. One `INSERT` in a dev seed script, not
  a migration: they must never exist in production
  (`plan-accounts-frontend.md` §11).
- ⚑ **Anonymous character creation must reject the prefix too.** The
  no-identity-at-all branch has no username to compare against, so the rule
  reads as "no username ⇒ no prefix" rather than falling through to allow.

### Password recovery — not in this plan

Recovery lives in **`plan-accounts-password-reset.md`**, which owns the
`recovery_email` / `password_reset_*` columns and the client-side routing an
emailed link needs. The reason is sequencing, not scope-shaving: recovery is the
only part of accounts that depends on **outbound email**, which aura has no
capability for at all (no provider, no sender domain, no SPF/DKIM). Keeping it
here would have blocked login, registration and character-select behind a
mail-provider decision.

⚑ **PO-accepted consequence: until that plan ships, a registered player who
forgets their password is locked out permanently.** There is no self-service
path; the stopgap is an operator running SQL by hand. The register form says so
plainly.

### Why not a third-party auth framework

`proehr/mindcraft-backend` — an existing Java/Spring user framework from a
sibling project — was offered as the auth service and **read directly**
(`Account.java`, `MindcraftUserDetails.java`, `JwtUtils.java`,
`SecurityConfig.java`, `AuthController.java`, `AccountService.java`). It is
competent, conventional Spring Boot. The problem is fit, not quality:

| Finding | Consequence for aura |
|---|---|
| Identity is `emailAddress` throughout (`getUsername()` returns the email; every lookup is `findByEmailAddress`) | Aura wants username identity + no required email ⇒ rewrite `Account`, `MindcraftUserDetails`, and every `AccountService` method |
| No validation anywhere (bare DTOs, no annotations) | Must be built regardless of which language it lives in |
| `changePassword` structurally cannot work (`findByPassword(oldPassword)` — a plaintext lookup against a salted column); no reset flow, no endpoint | Must be built regardless. ⚑ This is the defect the schema doc's §"Hashing" section exists to prevent repeating |
| No custom-claim support in `JwtUtils`; subject is the mutable email | Would need a `uid`-claim patch |
| Registration failure returns bare `400`, no body | Go would have to synthesize its own error messages from status codes |
| `@CrossOrigin` unrestricted, CSRF disabled, no rate limiting | Anti-abuse gets no help from the framework either way |

Net: the parts aura would keep are `BCryptPasswordEncoder` and ~15 lines of JJWT
calls — both one-import equivalents in Go. The parts aura would rewrite are the
identity model, validation, and the entire recovery flow.

⚑ **And dropping the external service deletes work that only existed to bridge
to it**: `external_provider`/`external_id`, the `uid` claim, link-collision and
orphan reconciliation, a two-schema `auth`+`game` split, Liquibase alongside
`golang-migrate`, and a JVM in the deploy. The original argument for it — shared
identity across projects — was already moot.

⚑ Anyone porting ideas from it should not carry across its **email-identified**
model (`Account.emailAddress`, with a `username` column collected at
registration and then never read by any auth path).

### Anonymous secret recovery

There is none. Cleared browser storage means permanently lost unlocks with no
support path. Mitigation is a **persistent prompt to register, shown from the
start** — before a player has accumulated anything worth mourning.

⚑ **The asymmetry that is the strongest argument for the nag:** a **registered**
player who loses their password can eventually recover (once
`plan-accounts-password-reset.md` ships, and only if they added a recovery
email); an **anonymous** player who loses their browser storage has nothing to
recover with, ever. Until that plan ships, *neither* can.

⚑ **A second asymmetry, on the security side:** the anonymous secret is a
**bearer token that cannot be rotated or revoked** — there is no "change my
anonymous secret" flow, and no password to change. Any disclosure (XSS, a shared
machine, a stray log line) is permanent, unfixable account takeover. A
registered account can at least have its password reset, which also bumps
`token_generation` and invalidates live sessions. This is not a reason to drop
anonymous play — it is the point of the nag — but it should be stated rather
than discovered.

---

## 7b. Transport & session security

§7 defines *who a player is*. This section covers *how that identity reaches the
server* — where the weakest links turned out to be. Every item here was found by
reviewing the plan against the existing code rather than against itself.

### The game connection must be authenticated, not just the HTTP endpoints

⚑ **This is the gap that matters most.** The HTTP layer is fully specified, and
then the design stops exactly where the game actually runs: the WebSocket.

**How a chosen character reaches `Join` is a security decision, not a
wire-schema preference:**

- **`characterId` on `Join` only works if the WebSocket itself carries proven
  identity.** Otherwise the server receives an unauthenticated socket announcing
  "I am character 42" and has nothing to check that against. Ids are `BIGSERIAL`
  — sequential and guessable.
- **A play ticket carries its own proof.** The client calls an authenticated
  HTTP endpoint to select a character, receives a single-use, short-lived,
  high-entropy ticket bound to `(account_id, character_id)`, and presents that
  on `Join`. The socket needs no ambient credential at all.

✅ **Decided: the play ticket.** For a reason beyond the above — it does not
depend on cookies surviving a WebSocket upgrade, which is the part most likely
to behave differently between dev, prod and future browser versions. Same
hashing rules as any other lookup token (schema doc §"Hashing").

**The shape:**

- `POST /api/characters/{id}/select` — an ordinary authenticated HTTP request,
  where the cookie unambiguously applies. **Ownership is checked here**, not on
  the socket. It also refuses when the account already has a live session (§5).
- Returns a single-use, high-entropy ticket bound to `(account_id,
  character_id)`, **TTL 30 s [PLACEHOLDER]** — long enough to cover the socket
  open, short enough that a leaked ticket is worthless.
- `Join` carries the ticket in place of any identity. The server looks it up,
  **burns it**, and loads that character.
- Storage is an in-memory TTL map; nothing about a ticket needs to survive a
  server restart (a restart drops every live connection anyway).

⚑ **The rejected option is recorded because it will look cheaper to whoever
executes:** appending `character_id` to `Join` is a smaller wire change, but it
is **only** safe if the WebSocket independently proves identity at upgrade time
and verifies ownership. That verification would be mandatory, not an
optimisation — and it rests on the one behaviour this decision exists to avoid
depending on.

### Ticket expiry between `/select` and `Join`: silent retry

There is a window between minting a ticket and using it. Normally milliseconds;
it stretches when a laptop lid closes right after Play, when the network drops
between the HTTP call and the socket, when a background tab is throttled, or
when the **server restarts** (tickets are in memory, so a restart forgets all of
them — i.e. every deploy).

Expiry firing here is the mechanism working correctly — the defect is what the
player sees. Without handling, character-select appears to succeed and then the
world refuses them with a ticket error that means nothing to someone who never
knew a ticket existed.

**The rule:** on an expired/unknown-ticket refusal, the client calls `/select`
**once** more and connects with the fresh ticket. The player sees a beat of
loading and then their character.

- **Retry exactly once, never loop.** A genuinely broken state (revoked session,
  deleted character) must terminate, not spin.
- **If the retry fails, bounce to character-select** with a plain message.
  Never surface the word "ticket".
- ⚑ **The retry re-runs `/select`'s checks, which is a feature.** If the account
  acquired a live session meanwhile, the second call returns *"This account is
  already logged in"* — the correct message instead of a confusing ticket error.
- ⚑ **Do not solve this by lengthening the TTL.** A longer window does not fix
  the lid-closed case (only shifts it) and every extra second is a second a
  leaked ticket stays usable. 30 s stands.

### Cross-Site WebSocket Hijacking (pre-existing code, armed by this plan)

`backend/pkg/aura/net/main.go:38-40` accepts **every** origin:

```go
CheckOrigin: func(r *http.Request) bool { return true },
```

Harmless today — there are no credentials to steal and the game is public.
**Adding a JWT cookie arms it:** any website can open
`new WebSocket('wss://<host>/game')`, the browser attaches the victim's cookie to
the handshake, and the server accepts. WebSocket handshakes are **not** subject
to CORS, so nothing else intervenes.

✅ **Cookie flags are `httpOnly; Secure; SameSite=Lax`, and the `CheckOrigin`
allowlist ships in the SAME chunk.** The two were ruled together deliberately:
`SameSite=Lax` does block this in current browsers, but shipping the cookie
first would leave the game depending on that for a protection it was never
designed to provide — and it evaporates if anyone later switches to
`SameSite=None` to solve the CORS problem below.

One allowlist serves both `CheckOrigin` and the CORS origin echo. Recorded
against existing code as `backlog.md` §43.

⚑ The play ticket **reduces, but does not remove**, the exposure: the game
socket no longer needs the cookie, so a hijacked socket cannot mint a session.
The allowlist is still required, because the cookie remains attached to the HTTP
endpoints.

### CORS: the existing pattern cannot be reused for authenticated endpoints

Both current HTTP endpoints serve a **wildcard** origin
(`items/mobs/catalog.go:79` and `skills/catalog.go:108`:
`Access-Control-Allow-Origin: *`), which is correct for public read-only
catalogs and **illegal for credentialed requests** — browsers reject a wildcard
origin on any request made with `credentials: 'include'`.

This is not hypothetical: `frontend/.../Urls.ts` derives HTTP endpoints from the
**WebSocket** URL, so `/api/*` lands on aurad's port while webpack serves the
client from another in dev — genuinely cross-origin. Auth endpoints therefore
need an **echoed specific origin** plus `Access-Control-Allow-Credentials: true`,
against the same allowlist `CheckOrigin` uses.

⚑ **The tempting wrong fix** is to keep the wildcard and move the JWT from a
cookie into `localStorage` so no credentials ride the request. That trades a
CSRF-shaped problem for an XSS-shaped one and discards `httpOnly`, which is the
main thing protecting the token from script access.

### Login must not leak account existence through timing

§5b equalises error *messages* so a failed login cannot distinguish "no such
user" from "wrong password". That closes only half the oracle: if a missing
username short-circuits before any password comparison, the response is
measurably faster, and the distinction is readable from timing alone.

**Always perform a bcrypt comparison**, including against a fixed dummy hash when
the username does not exist, so both paths cost the same. Cheap, standard, and
easy to regress later — worth an explicit test. ⚑ The throttle delay (§0) is
applied *after* this comparison, not instead of it.

### Session expiry mid-play: silent refresh

A token that expires while the player is in the world must **not** throw them
out. **An active connection renews transparently**; a player is never returned
to the login screen mid-fight.

What that requires:

- A **refresh endpoint** (`POST /api/session/refresh`) that issues a new JWT
  cookie when presented with a still-valid one. The client calls it on a timer
  at roughly half the token lifetime.
- ⚑ **A stopping condition, or "silent refresh" becomes "immortal session":**
  refresh is refused once the account is logged out elsewhere, erased, or its
  `token_generation` has been bumped. Refresh applies the same checks login
  does; it is not a rubber stamp.
- ⚑ **The refresh endpoint is a credentialed cross-origin request**, so it falls
  under the CORS rule above, not the wildcard catalog pattern.
- The **play ticket is unaffected** — it is minted per character-select and
  burned at `Join`, so a mid-session refresh never needs to re-issue one. A
  second reason the ticket model is cheaper than cookie-on-upgrade: the live
  socket has no credential to keep fresh.

Failure to refresh (network blip, server restart) should retry rather than
immediately log out; only an explicit refusal ends the session.

### Hardening checklist

Smaller items, none of which have a home elsewhere:

| Item | Decision |
|---|---|
| bcrypt cost factor | State it explicitly rather than inheriting a library default (Go's default is 10). Revisit if login latency becomes visible |
| HTTPS for auth endpoints | **Required**, not assumed — passwords and bearer tokens cross the wire. The live deployment already terminates TLS |
| Rate limiting | **A requirement, not an open question** — `login` (brute force) and `register` (spam) here; `forgot-password` (enumeration + mail flooding) arrives with the reset plan. Mechanism in §0 |
| Failed-login throttling | **Progressive delay on BOTH axes — per source IP and per account — with no hard lockout.** ⚑ The no-lockout half is the deliberate part: a hard per-account lockout lets anyone who knows your username **lock you out on purpose**, turning a defence into a griefing tool (GDD §9, "no griefing by design"). Per-IP alone was rejected as walkable with a handful of addresses. Mechanism in §0 |
| Audit logging | A `game.audit_log` table, **successes only** — §0 |
| JWT lifetime | **Short (1 h [PLACEHOLDER]) + silent refresh**, above. Short lifetimes reduce the blast radius of a leaked token |
| Absolute session cap | **Skipped**, a known accepted gap — schema doc §"Session revocation" |

---

## 8. Operational work in scope

- **Backups with a proven restore.** A backup that has never been restored is a
  hypothesis. Restore into a fresh instance, verify chains and unlocks survived,
  time it, and write down the exact commands so nobody improvises at 2am. Before
  persistence ships, a crash costs players nothing; after, it can permanently
  cost every graveyard chain.
- **Off-machine backup storage** — a disk failure must not take the database and
  its backups together.
- **Admin/support tooling: none, deliberately.** Early ops is an operator
  running SQL over SSH — erasure (schema doc §Erasure), releasing a name,
  unsticking an account. Keep those statements as a copy-pasteable runbook
  snippet beside the backup/restore commands, so nobody improvises them under
  pressure. ⚑ Two consequences worth naming rather than discovering: **erasure
  has no endpoint**, so a deletion request is a manual operation; and with email
  optional and no in-game support channel, there is **no route by which a player
  can even make that request** today. Acceptable at hobby scale, recorded so it
  is a choice and not an oversight.
- **Single-instance restore consistency** — one Postgres instance, one schema,
  so a point-in-time restore recovers credentials and game state together by
  construction.
- **Database bound to localhost**, firewall, credential handling.
- **Provisioning is one-time manual server work, NOT part of `deploy.sh`.**
  Installing Postgres, creating the role and database, and populating the
  systemd `EnvironmentFile` happen once, by hand, recorded in the runbook. ⚑ The
  deploy path's whole virtue is that it is "rsync + `systemctl restart`" — it
  must not silently grow a database install. Details in §0.
- **Migration tooling** — aura has none today. `golang-migrate`, versioned SQL,
  used as a library (§0). **Migrations run automatically at `aurad` boot**,
  before the game loop starts, rather than as a manual deploy step: one less
  thing to forget, and it makes a schema/binary mismatch impossible by
  construction. `golang-migrate` takes its own advisory lock and the deployment
  runs a single instance, so the concurrent-start race is not live — ⚑ but that
  assumption becomes load-bearing the day a second instance exists.
- ⚑ **A FAILED MIGRATION BRICKS EVERY LATER BOOT, and the state is misleading**
  (found the hard way in chunk 1a). `golang-migrate` marks the version dirty
  *before* running a migration and clears it after, so a migration that fails
  leaves `public.schema_migrations.dirty = true` — while the DDL itself has
  rolled back cleanly, since each file runs as one implicit transaction. From
  then on `aurad` refuses to start, and inspecting the database shows **no
  schema at all**, which reads as "migrations never ran" rather than "a
  migration failed". `store.Migrate` therefore appends recovery instructions to
  the dirty error; keep them accurate if the migration set grows. Recovery when
  the schema is genuinely absent is `DELETE FROM public.schema_migrations;`,
  then fix the migration and restart.
- **Postgres unreachable at boot: refuse to start.** Exit non-zero with an
  explicit error rather than starting a server nobody can log into. ⚑ This is
  deliberately *different* from the running-server behaviour in §5, which keeps
  the world alive through an outage — an already-running world has players in it
  worth protecting, while a fresh boot has none and would only present as
  healthy while being unusable.
- **Secrets via environment variables** — the JWT signing key and the DB
  password are read from the environment at boot, set on the live server through
  systemd's `EnvironmentFile`. Never in the repo, and deliberately **not** in
  `conf.json`, which is tracked and holds game tuning. ⚑ HS512 is symmetric, so
  the JWT key both signs and verifies — a secret on the same tier as the DB
  password, and **rotating it invalidates every live session**, a deliberate
  operation rather than routine hygiene.
- **Rate limiting** on `/api/auth/*` — nothing is inherited, so it is net-new.
  `tdd.md` §4.4 carries "Anti-bot / anti-abuse?" as an open question; these
  endpoints are its first concrete consumer. Mechanism in §0.
