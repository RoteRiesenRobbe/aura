# manual-db-migrations.md — Database Migrations in Aura

This manual is the authoritative guide and runbook for database schema migrations in Aura. It explains how migrations work under the hood, how to write and test new schema changes, how to troubleshoot failure states, and how migrations fit into local development and production deployments.

---

## 1. Architecture & The Single-Binary Contract

Aura is designed as a **single-binary deployment**: the server (`aurad`) carries its own static web assets, embedded game content JSON, and versioned database schema migrations.

### Core Design Decisions

- **`golang-migrate/v4` as a Library, Never a CLI**:
  Migrations are embedded directly into the Go binary (`backend/pkg/aura/store/migrate.go`) via `go:embed migrations/*.sql`. We do not install or invoke the `migrate` CLI tool on production servers or developers' machines. This guarantees that a schema/binary version mismatch is impossible by construction: every binary knows exactly which schema version it requires and carries the SQL to get there.

- **Automatic Execution at Boot (`database.go`)**:
  Before `aurad` starts its game loop or opens its HTTP/websocket ports, it invokes [`store.Migrate(url)`](../backend/pkg/aura/store/migrate.go#L41).
  - If pending migrations exist, they are applied automatically.
  - If the database is already at the correct version (`migrate.ErrNoChange`), boot proceeds immediately.
  - If a migration fails, `aurad` logs the failure and **refuses to start**. We never run an online game against a half-migrated or broken schema.

- **Postgres Advisory Locking**:
  `golang-migrate` acquires a PostgreSQL advisory lock before running migrations. If multiple server processes start simultaneously against the same database, only one will perform the schema upgrade while others wait.

- **Driver & Custom URL Scheme (`pgx5://`)**:
  Aura uses the native `pgx/v5` PostgreSQL driver (`pgxpool`). Because `golang-migrate` routes database drivers based on the URL scheme, [`toMigrateURL(url)`](../backend/pkg/aura/store/migrate.go#L135) automatically rewrites `postgres://` connection strings to `pgx5://` before initializing the migrator.

---

## 2. Migration Directory & Naming Conventions

All migration SQL files live in:
```
backend/pkg/aura/store/migrations/
```

### File Naming Format
Each migration requires an explicit **up** and **down** pair using a six-digit sequential integer prefix:
```
000001_accounts_and_characters.up.sql
000001_accounts_and_characters.down.sql
000002_add_new_feature.up.sql
000002_add_new_feature.down.sql
```

1. **Six-Digit Sequence**: Use sequential numbers (`000001`, `000002`, `000003`). Never skip numbers or use timestamps.
2. **Descriptive Snake_Case Title**: Clearly state what aggregate or subsystem the migration introduces or modifies.
3. **Mandatory `.up.sql` and `.down.sql` Pair**:
   - The `.up.sql` script applies the forward schema change.
   - The `.down.sql` script must cleanly and completely reverse what `.up.sql` added, leaving no orphaned types, extensions, or tables behind.

> [!IMPORTANT]
> **Never modify a migration file that has already been merged or shipped.**
> Once a migration has landed in main or run against a shared database, its DDL is frozen. Any subsequent schema adjustments must be written as a new forward migration (`000002_...`, `000003_...`).

---

## 3. Step-by-Step Guide: Writing a New Migration

### Step 1: Check existing versions
List the current contents of `backend/pkg/aura/store/migrations/` to find the highest sequence number. For example, if `000001_...` is the latest, your new migration will be `000002`.

### Step 2: Create the `.up.sql` and `.down.sql` files
Create both files in `backend/pkg/aura/store/migrations/`:
```bash
# Example for a new migration
touch backend/pkg/aura/store/migrations/000002_example_feature.up.sql
touch backend/pkg/aura/store/migrations/000002_example_feature.down.sql
```

### Step 3: Write the Up Migration (`.up.sql`)
Write clean, idempotent PostgreSQL DDL inside the `game` schema. Follow Aura's standing schema rules:

1. **Schema Namespace**:
   Always qualify table names with `game.` (e.g., `CREATE TABLE game.example_table (...)`). Extensions (like `citext`) live in `public`.
2. **No `ON DELETE CASCADE` in Table Definitions**:
   Unless explicitly designed as a temporary child structure, **do not declare `ON DELETE CASCADE` on foreign keys.**
   - Why: In Aura, foreign keys act as a safety net against accidental hard deletions. As discovered in Step 8a chunk 4 persistence, requiring explicit child-table deletions in dependency order (`characters_test.go`, harness cleanup) prevents silent data loss and exposes improper cleanup logic in tests and runbooks.
3. **Hashing Discipline (Secret Columns)**:
   - **Lookup Keys** (tokens queried in a `WHERE` clause, such as `anonymous_secret` or reset tokens): Use **SHA-256** hashes.
   - **Verifiers** (passwords checked after reading the row): Use **bcrypt**.
   - *Never* store a salted bcrypt hash in a column intended for indexed database lookups.
4. **JSONB & Canonicalization**:
   If storing JSONB columns (like quest flags or loadouts), remember that PostgreSQL reorders keys when serializing JSONB. Use `persist.CanonicalFlags` in Go when comparing bytes for round-trip dirty checking.

### Step 4: Write the Down Migration (`.down.sql`)
Revert all tables, indexes, types, and constraints introduced by the up migration in reverse dependency order:
```sql
-- Revert 000002_example_feature.up.sql
DROP TABLE IF EXISTS game.example_table;
```

---

## 4. Testing Migrations

### Automated Testing (The Test Suite)
Aura's Go test suite validates both up and down migrations against a real PostgreSQL instance:

- **Test Database URL (`AURA_TEST_DB_URL`)**:
  Integration tests in [`backend/pkg/aura/store`](../backend/pkg/aura/store) and [`backend/pkg/aura/accounts`](../backend/pkg/aura/accounts) read `AURA_TEST_DB_URL` from the environment. If unset, database tests skip cleanly.
- **Round-Trip Acceptance Testing**:
  [`TestMigrateAndRollback`](../backend/pkg/aura/store/store_test.go) executes `store.Migrate(url)` followed by `store.Rollback(url)` and verifies that rolling back leaves a genuinely empty database (zero remaining tables in schema `game`).
- **Parallel Test Lock (`storetest`)**:
  Because `go test ./...` executes Go packages in parallel, multiple test packages (`accounts`, `store`) share a single test database. Every DB-touching test package acquires the **Postgres advisory lock** in `store/storetest` before running migrations or queries. Without this lock, parallel packages will drop each other's schema mid-run, surfacing as false-positive `"relation game.accounts does not exist"` errors.

### The local development database

Local Postgres runs in Docker, driven by targets in `backend/Makefile` — `make -C backend db-up`
creates (or starts) the `aura-dev-db` container on a **named volume**, so dev characters survive a
container removal or a WSL restart.

It serves **two databases, and the split is load-bearing**:

| Database | Role | URL |
| --- | --- | --- |
| `aura` | durable dev data — your characters live here | `AURA_DB_URL` |
| `aura_test` | **disposable** — wiped constantly by the suite | `AURA_TEST_DB_URL` |

> ⚠️ **Never point `AURA_TEST_DB_URL` at `aura`.** Every DB-touching test calls
> [`store.Rollback`](../backend/pkg/aura/store/migrate.go) before *and* after itself, which drops
> the whole `game` schema. Aimed at the dev database it deletes every account and character with
> no prompt and no error — the run just goes green. `make -C backend db-test` aims correctly.

### Manual Verification During Development

To test a migration locally:
1. Start the database and export the dev URL:
   ```bash
   make -C backend db-up
   export AURA_DB_URL="postgres://aura:aura@127.0.0.1:5432/aura?sslmode=disable"
   ```
2. Run the DB-touching suites against the **disposable** database:
   ```bash
   make -C backend db-test          # store + accounts, aimed at aura_test
   ```
   Or by hand, if you need `-v` or a single test:
   ```bash
   cd backend && AURA_TEST_DB_URL="postgres://aura:aura@127.0.0.1:5432/aura_test?sslmode=disable" \
     go test -v ./pkg/aura/store
   ```
3. Boot `aurad` in development mode to see the boot-time migration log line:
   ```bash
   cd backend && ./aurad -dev -zone world
   ```
   You should see:
   ```
   🗄️ database schema ready version=... dirty=false
   ```
4. **Test the migration against data that already exists.** This is the check the test suite
   structurally cannot make: `aura_test` is empty at the start of every test, so a migration that
   works on an empty table and violates a new `NOT NULL`/`UNIQUE` constraint on real rows passes
   green and then fails on a live database. The durable `aura` database is where you catch that —
   play a little first, then let `aurad` apply the new migration over your existing characters.

   Snapshot before you do, so a bad up-migration costs nothing:
   ```bash
   docker exec aura-dev-db pg_dump -U aura -d aura --clean --if-exists > /tmp/aura-dev-backup.sql
   # restore:
   docker exec -i aura-dev-db psql -U aura -d aura -v ON_ERROR_STOP=1 < /tmp/aura-dev-backup.sql
   ```
   ⚑ **Stop `aurad` before dumping** (`kill -TERM`). It holds live characters in memory and only
   writes them on shutdown — `💾 flushed N live character(s) for shutdown` in the log — so a dump
   taken under a running server misses whatever has not been flushed yet.

---

## 5. Troubleshooting: The "Dirty Database" State

### Why a Database Becomes "Dirty"
When `golang-migrate` runs a migration file:
1. It updates `public.schema_migrations`, setting `dirty = true` for the target version.
2. It executes the `.up.sql` script inside a transaction.
3. If the script succeeds, it sets `dirty = false`.

> [!WARNING]
> **A failed migration leaves `dirty = true` even though PostgreSQL rolled back the DDL.**
> Because PostgreSQL rolls back the failed SQL statement automatically, the database tables may be **absent or untouched**, but `schema_migrations.dirty` remains `true`. When this happens, `aurad` will **refuse to boot** and emit an error stating the schema is dirty.

### Diagnosing a Dirty State
When `store.Migrate` encounters a dirty state, it calls [`dirtyHint(err)`](../backend/pkg/aura/store/migrate.go#L96-L109), which prints exact recovery instructions to the console and server logs.

To inspect the database manually using `psql`:
```sql
-- 1. Check current recorded version and dirty flag
SELECT version, dirty FROM public.schema_migrations;

-- 2. Check which tables actually exist in schema 'game'
SELECT table_name FROM information_schema.tables WHERE table_schema = 'game';
```

### Step-by-Step Recovery

#### Case A: The Schema is Absent (Clean DDL Rollback)
If the migration failed on its first table or statement and PostgreSQL rolled back the DDL cleanly, no new tables landed:
1. Clear the dirty migration record so the version can be retried:
   ```sql
   DELETE FROM public.schema_migrations;
   ```
   *(Or if upgrading from a previous clean version `N`, reset to version `N`: `UPDATE public.schema_migrations SET version = N, dirty = false;`)*
2. Fix the SQL error in your `.up.sql` file.
3. Restart `aurad` (or re-run `go test`) to re-apply the fixed migration.

#### Case B: The Schema is Partially Applied
If a migration file contained statements outside a transaction (or if multiple files were involved) and left half-created tables:
1. Manually drop the orphaned objects that landed before the failure:
   ```sql
   DROP TABLE IF EXISTS game.broken_table;
   ```
2. Reset `public.schema_migrations`:
   ```sql
   DELETE FROM public.schema_migrations;
   ```
3. Correct the `.up.sql` file and restart `aurad`.

---

## 6. Production Deployment & Operational Checklist

When deploying Aura to a live VPS (e.g., via `devops/deploy.sh`):

1. **Connection String Percent-Encoding**:
   Always **percent-encode** passwords and special characters in `AURA_DB_URL`. While `psql` accepts unencoded special characters in URLs, Go's standard `net/url` parser does not.
   - Good: `postgres://aura:p%40ssw%23rd@127.0.0.1:5432/aura_prod?sslmode=disable`
2. **Pre-Deployment Database Backup**:
   Before replacing the `aurad` binary on production with a release containing new schema migrations, take a snapshot:
   ```bash
   pg_dump -U aura aura_prod > aura_backup_before_v2.sql
   ```
3. **Zero-Touch Upgrade**:
   Restarting the `aurad` systemd service automatically executes the embedded `store.Migrate(url)`. No manual SQL scripts or migration commands are needed on the server.
4. **Environment Secrets**:
   `AURA_DB_URL` and `AURA_JWT_KEY` are provided to `aurad` via systemd's `EnvironmentFile`. Never place database credentials in `conf.json` or git.

---

## 7. Reference Summary Table

| Topic | Implementation / Location | Notes |
| :--- | :--- | :--- |
| **Migration Files** | `backend/pkg/aura/store/migrations/*.sql` | Six-digit sequential prefix (`000001_...`), `.up.sql` / `.down.sql` pairs |
| **Migrator Module** | [`backend/pkg/aura/store/migrate.go`](../backend/pkg/aura/store/migrate.go) | Embeds SQL via `go:embed`, calls `golang-migrate` as a library |
| **Boot Hook** | [`backend/cmd/aurad/database.go`](../backend/cmd/aurad/database.go) | Invokes `store.Migrate(url)` before game loop or network listen |
| **Dirty Recovery** | [`store.dirtyHint(err)`](../backend/pkg/aura/store/migrate.go#L96) | Log output provides exact `SELECT` and `DELETE` queries to recover |
| **Test Lock** | [`backend/pkg/aura/store/storetest`](../backend/pkg/aura/store/storetest) | Advisory lock prevents parallel `go test ./...` packages from colliding |
| **Schema Doc** | [`docs/plan-accounts-schema.md`](plan-accounts-schema.md) | Architectural rationale behind every table, column, and hash choice |
