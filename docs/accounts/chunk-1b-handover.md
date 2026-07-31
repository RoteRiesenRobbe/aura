# Handover — step 8a chunk 1b: auth & sessions

**Written 2026-07-31, at the end of the chunk-1a session, for a cold session.**
Branch `accounts-8a`. ⚑ **Disposable: delete this file when 1b lands.** Its
durable content belongs in the `§10a` chunk ledger, not here.

⚑ This assumes 1b is what gets picked up next. **That is not actually settled** —
CLAUDE.md's `NEXT` bullet offers a PO call between ① `plan-conversation-journal.md`
(Q1–Q4, the 13 items from the C4 playtest) and ② continuing 8a, and the standing
recommendation is still **① first**. If ① is chosen, this file just waits.

---

## 1. Read first, in this order

| Doc | For |
|---|---|
| `plan-accounts-implementation.md` §7 | What auth *is* — native Go, anonymous-first, username-not-email, the password rules |
| `plan-accounts-implementation.md` §7b | Transport & session security: the play ticket, the timing oracle, silent refresh |
| `plan-accounts-implementation.md` §0 | Throttle mechanism, audit logging, tech stack — and the pinned-versions section 1a added |
| `plan-accounts-frontend.md` §10 chunk 1b + §10a | The scope line, and 1a's ledger (what already exists) |
| `plan-accounts-frontend.md` §11 | Test strategy — several bullets are 1b's, listed in §7 below |
| `plan-accounts-schema.md` §"Session revocation" | Why `token_generation` exists and what must consult it |

Skip `plan-accounts-password-reset.md` entirely — it runs last and is blocked on
outbound email.

---

## 2. Where things stand

**Chunk 1a shipped** — `6d5cc695`, banners pointed at it by `c6dd673d`. Working
tree clean, **not pushed**.

What exists that 1b builds on, all in `backend/pkg/aura/store/`:

```go
store.EnvURL      // "AURA_DB_URL"
store.EnvTestURL  // "AURA_TEST_DB_URL"

store.Open(ctx, url) (*Store, error)  // pgxpool, MaxConns 10, pings before returning
(*Store).Pool                          // *pgxpool.Pool — query from here
(*Store).Close()                       // nil-safe

store.Migrate(url) error   // applied at aurad boot
store.Rollback(url) error  // tests only, never boot
```

The `game` schema is live in both databases. **`account_credentials.token_generation`
exists and defaults to 0** — 1b is its first consumer.

⚑ **`openDatabase()` in `cmd/aurad/database.go` returns `nil` when `AURA_DB_URL`
is unset**, and boot continues with a warning. That is deliberate for now and
**chunk 1c flips it**, not 1b. If 1b introduces anything that dereferences the
store at boot, it must tolerate `nil`.

---

## 3. What 1b is

Per `plan-accounts-frontend.md` §10: **pure Go with unit tests, no HTTP surface
yet.** Five pieces.

1. **Password hashing** — `golang.org/x/crypto/bcrypt`. ⚑ State the cost factor
   explicitly rather than inheriting Go's default of 10 (`plan-accounts-implementation.md`
   §7b hardening checklist).
2. **Credential validation** — username **3–32**, charset `[A-Za-z0-9_-]`; the
   reserved **`hrnss_`** prefix; password **≥ 8** with **at least one special
   character**, the trivial-sequence blocklist, and the **72-byte** bcrypt
   ceiling as a validation error rather than a silent truncation.
3. **JWT issue/verify** — HS512 off `AURA_JWT_KEY`, **1 h [PLACEHOLDER]**
   lifetime, carrying the **`token_generation` claim**. Verification is a local
   signature check *plus* a generation comparison.
4. **The play-ticket TTL map** — CSPRNG, ≥ 256 bits, **single-use**, **30 s
   [PLACEHOLDER]**, bound to `(account_id, character_id)`. In-memory; nothing
   about a ticket needs to survive a restart. ⚑ **No database table** — the
   schema doc says so explicitly and explains why.
5. **The failed-login throttle** — two in-process maps keyed by **source IP** and
   by **account id**, delay **0/1/2/4/8 s capped at 30 s [PLACEHOLDER]**,
   decaying after 15 min, reset on success. **No hard lockout.**

### What 1b is NOT

- **No HTTP handlers.** Those are 1c, along with CORS and the `CheckOrigin`
  allowlist.
- **No `Join` / wire change.** That is chunk 3.
- **No frontend.** Chunk 2.
- **No password recovery.** Its own plan, last.

---

## 4. The open scoping question — decide this first

**1b's scope line includes "the account-scoped live session registry", and that
is the one item that does not fit "pure Go, no HTTP surface".**

The registry is not new — it is the existing `ConnectionStateSystem`
(`tokenByClient` / `stashByToken` / `reconnectStash`, `sys/state.go`), extended
to carry `account_id`. So building it means **editing live game code**, and
chunk 3 separately owns the **atomic account-slot claim** on that same
structure, plus the reconnect identity check.

Three options:

| Option | Shape |
|---|---|
| **A (recommended)** | Build the registry **type** in 1b — a self-contained, unit-testable thing owning "which account is live, claimed atomically". **Wire it into `sys/state.go` in chunk 3**, where the `Join` path and the stash change already live |
| **B** | Do all of it in 1b, accepting that 1b touches `state.go` |
| **C** | Move the registry wholly to chunk 3 |

**Why A:** it keeps 1b honestly free of game code, gives chunk 3 a tested
component instead of a design problem, and the atomic claim — the part that
actually enforces one-session-per-account — is *already* chunk 3's, so splitting
the type from its wiring follows a seam that exists rather than inventing one.

⚑ **Whichever is chosen, `plan-accounts-frontend.md` §10 should be edited to say
so**, or the next reader hits the same ambiguity.

---

## 5. Traps that will bite

Each of these is stated in the plans; they are collected here because they are
the ones that fail *silently*.

- ⚑ **The throttle delay must be applied AFTER the dummy bcrypt comparison, not
  instead of it.** Always perform a bcrypt compare — including against a fixed
  dummy hash when the username does not exist — so both paths cost the same.
  Skipping it makes "no such user" measurably faster than "wrong password", and
  the equalised error messages in §5b then protect nothing.
- ⚑ **Apply the password blocklist AFTER stripping trailing punctuation.** The
  special-character requirement pushes real users to `password!`, which sails
  through a check that `password` would have failed. `plan-accounts-implementation.md`
  §7 says so directly.
- ⚑ **Test the refresh REFUSAL, not just the success.** A JWT whose account was
  logged out, erased, or `token_generation`-bumped must be refused. Without that
  test, "silent refresh" silently becomes "immortal session" — and it will look
  like it works.
- ⚑ **Test that a play ticket is bound to its character.** A ticket for character
  A must not join as B. It is the whole point of the mechanism and the easiest
  assertion to omit, because single-use and expiry are the obvious two.
- ⚑ **`hrnss_` rejection has two different rules.** Registration rejects the
  prefix outright. Character creation allows it **only** when the caller's
  username already carries it. And **anonymous** creation must reject it — "no
  username" must not fall through to "allowed". (The character-creation half is
  1c's, but the validator is 1b's.)
- ⚑ **Never log token or password material**, including truncated forms.
  `game.audit_log` records **successes only** — never failed logins, which an
  attacker generates at will.

---

## 6. Dependencies — checked 2026-07-31, both clean at the `go 1.22` floor

- **bcrypt needs NO new dependency.** `golang.org/x/crypto v0.25.0` is already a
  direct requirement and ships `bcrypt`.
- **JWT: `github.com/golang-jwt/jwt/v5 v5.3.0`** declares `go 1.21`, so it is
  safe at the current floor. (v5.2.x also works, declaring `go 1.18`.)

⚑ **`backend/go.mod` stays at `go 1.22` by PO ruling.** Before adding anything,
read the "Pinned versions" section in `plan-accounts-implementation.md` §0 — it
records why `golang-migrate`, `pgx` and `rogpeppe/go-internal` are pinned.

⚑ **Run `go mod tidy -go=1.22`, never bare `go mod tidy`** — during 1a it
silently raised the go directive to 1.25 and upgraded `x/crypto` alongside it.
Read the `go.mod` diff afterwards either way.

---

## 7. Tests 1b owns

From `plan-accounts-frontend.md` §11, the bullets that fall in this chunk:

- **Password rules**, table-driven, including the trailing-punctuation case —
  `password!` must fail as surely as `password`.
- **Password hashing/verify round-trips**, and the 72-byte boundary.
- **Case-insensitive uniqueness** — `Bob` cannot register over `bob`. ⚑ Partly
  already proven at the schema level by 1a (`TestCaseInsensitiveIdentityColumns`);
  1b's job is the *validation* half, not re-proving `CITEXT`.
- **Play tickets** — single-use, expiring, and **bound to their character**.
- **Refresh** — a valid JWT renews; a logged-out / erased / generation-bumped one
  is **refused**.
- **The timing-equalisation test** — that a missing username still costs a bcrypt
  compare. Explicitly called out as "easy to regress later, worth an explicit
  test".

DB-touching tests **must `t.Skip` when `AURA_TEST_DB_URL` is unset** — follow the
`testURL(t)` helper already in `store_test.go`.

---

## 8. Machine notes (this dev box, Windows)

| Thing | Reality |
|---|---|
| `AURA_DB_URL` / `AURA_TEST_DB_URL` / `AURA_JWT_KEY` | Set at **User** scope. ⚑ Shells opened *before* they were set do not see them — read with `[Environment]::GetEnvironmentVariable('NAME','User')` |
| DB passwords | **Percent-encoded** (2026-07-31). psql tolerates raw `^`/`>`; Go's `net/url` does not. The re-encoder one-liner is in `plan-accounts-implementation.md` §0 step 3 and is safe to re-run |
| `psql` | `F:\Program Files\PostgreSQL\18\bin\psql.exe`, **not on PATH** |
| `make` | **Not installed.** Run the `cp-defs` target's two lines by hand: `find ./pkg/api -type f -name '*.json' -delete` then `cp -rf ../api/{mobs,skills,recipes,zones,props,factions,milestones,quests} ./pkg/api` |
| Booting `aurad` | Needs **`-zone world`** — local `conf.json` names no zone, so a bare run dies on "multiple zones found" |
| PowerShell file edits | ⚑ **Do not** round-trip source files through `Get-Content`/`Set-Content` — it adds a BOM and mangles UTF-8. It broke a migration mid-chunk. Use the Edit/Write tools |
| `pkg/api/mobs/*.json` | **Untracked** (`.gitignore` holds `*.json`, uniquely among the 8 content types). A fresh clone fails `go test ./...` until someone runs cp-defs. Pre-existing, unfixed |

---

## 9. Definition of done

- All five pieces implemented, unit-tested, **no HTTP surface**.
- The §7 test list passes, including every "test the refusal" case.
- The §4 scoping question is **decided and written into §10 of the frontend plan**.
- `go build ./...` · `go vet ./...` · `go test ./...` green — **29/29 packages**,
  and still green with `AURA_TEST_DB_URL` unset.
- Boot still clean: **0 errors 0 warnings** with `AURA_DB_URL` set
  (⚑ *without* it there is 1 deliberate warning — that is expected, not a
  regression).
- A `§10a` ledger entry for 1b, written in the same shape as 1a's.
- **No browser harness owns 1b either** unless it grows a runtime surface — say
  so explicitly in the ledger rather than leaving it unmentioned.
- **Do not commit unless asked.**
