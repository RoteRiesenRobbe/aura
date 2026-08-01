# Handover — step 8a chunk 1c: the eight endpoints

**Written 2026-08-01, at the end of the chunk-1b session, for a cold session.**
Branch `accounts-8a`. ⚑ **Disposable: delete this file when 1c lands.** Its
durable content belongs in the `§10a` chunk ledger, not here.

⚑ **The branch is local only — five commits, no remote branch.** Fine if 1c
continues on this machine; invisible to anyone picking it up elsewhere.

---

## 1. Read first, in this order

| Doc | For |
|---|---|
| `plan-accounts-frontend.md` §3 | **The eight endpoints** — the table that defines this chunk |
| `plan-accounts-frontend.md` §10 chunk 1c | The scope line **and the three invariants 1c must not break** |
| `plan-accounts-implementation.md` §5b | **Player-facing errors** — the exact strings, and why several distinct causes share one |
| `plan-accounts-implementation.md` §7b | The play ticket, silent refresh, CSWSH, CORS, the timing oracle |
| `plan-accounts-implementation.md` §0 | Throttle mechanism, audit logging, the three transaction sites |
| `plan-accounts-schema.md` §"Hashing: lookup keys vs. verifiers" | **Read before touching any secret column.** SHA-256 for lookup keys, bcrypt for verifiers |
| `backlog.md` §43 | The two permissive transport defaults 1c has to close |
| `plan-accounts-frontend.md` §10a chunk 1b | What already exists, and why it is shaped that way |

Skip `plan-accounts-password-reset.md` entirely — it runs last and is blocked on
outbound email.

---

## 2. Where things stand

**Chunks 0, 1a and 1b are done.** `31ebebcb` is 1b; the tree is clean and
unpushed. Roughly **3 of 7 chunks** — 1c, 2 (frontend), 3 (wire) and 4 (save &
load) remain.

⚑ **Chunk 4 was added on 2026-08-01** because implementation.md §2/§4/§6 (save
triggers, snapshot mechanics, load path) were designed in full and owned by no
chunk. 1c does **not** touch them.

### The API 1b and 1a left

All of `backend/pkg/aura/auth` and `backend/pkg/aura/store`. ⚑ **Both packages
import zero aura packages** — that is invariant ③ below, not a coincidence.

```go
// --- passwords. The Gate is the ONLY route to bcrypt. -----------------------
auth.NewGate(n int) *Gate                    // production: auth.DefaultGateSlots
(*Gate).Hash(ctx, plain string) (string, error)
(*Gate).Verify(ctx, hash, plain string) (bool, error)   // hash == "" ⇒ no such account
auth.ErrBusy                                  // the gate was full; NOT a failed login
auth.MaxPasswordBytes = 72

// --- validation. Errors are *auth.RuleError and safe to show verbatim. ------
auth.ValidateUsername(username string) error
auth.ValidatePassword(password, username string) error
auth.ValidateCharacterName(name, callerUsername string) error  // "" = anonymous
auth.HarnessPrefix = "hrnss_"

// --- session tokens ---------------------------------------------------------
auth.NewKeys(secret []byte, lifetime time.Duration) (*Keys, error)  // auth.TokenLifetime
(*Keys).Issue(accountID int64, generation int) (string, error)
(*Keys).Verify(token string, currentGeneration int) (Claims, error)
(*Keys).Refresh(token string, currentGeneration int) (string, error)
auth.ErrTokenInvalid / ErrTokenExpired / ErrStaleGeneration
auth.EnvJWTKey = "AURA_JWT_KEY"

// --- play tickets -----------------------------------------------------------
auth.NewTicketStore(ttl time.Duration) *TicketStore   // auth.TicketTTL = 30s
(*TicketStore).Mint(t Ticket) (string, error)         // Ticket{AccountID, CharacterID}
(*TicketStore).Redeem(token string) (Ticket, error)   // burns it
auth.ErrTicketUnknown                                  // unknown / expired / already used

// --- failed-login throttle --------------------------------------------------
auth.NewThrottle(decay time.Duration) *Throttle       // auth.ThrottleDecay = 15min
(*Throttle).Delay(ip string, accountID int64) time.Duration
(*Throttle).Wait(ctx, ip string, accountID int64)     // ⚑ AFTER the bcrypt compare
(*Throttle).Fail(ip string, accountID int64)          // accountID 0 = unknown username
(*Throttle).Succeed(ip string, accountID int64)

// --- one live session per ACCOUNT (type only; chunk 3 wires it) -------------
auth.NewSessionRegistry() *SessionRegistry
(*SessionRegistry).Claim(s Session) (existing Session, ok bool)   // atomic
(*SessionRegistry).Release(accountID int64) bool
(*SessionRegistry).Live(accountID int64) (Session, bool)

// --- database ---------------------------------------------------------------
store.Open(ctx, url) (*Store, error)   // (*Store).Pool is the *pgxpool.Pool
store.EnvURL / EnvTestURL
(*Store).TokenGeneration(ctx, accountID int64) (int, error)      // store.ErrNoAccount
(*Store).BumpTokenGeneration(ctx, accountID int64) (int, error)
```

⚑ **`AURA_JWT_KEY` is read by nothing yet.** The constant exists and `NewKeys`
validates a secret's length, but no code reaches for the variable — 1b had
nothing to sign for. **1c wires it**, and must fail the boot loudly if it is
absent or too short.

---

## 3. What 1c is

Per `plan-accounts-frontend.md` §3 and §10 — **eight HTTP/JSON endpoints on the
existing Go server**, plus the transport hardening that has to arrive with them.

| Method | Path | Auth context |
|---|---|---|
| `POST` | `/api/characters` | anon secret, JWT, or neither |
| `GET` | `/api/characters` | anon secret or JWT |
| `POST` | `/api/characters/{id}/delete` | must own the row |
| `POST` | `/api/characters/{id}/select` | must own the row; mints the play ticket |
| `POST` | `/api/auth/register` | anon secret (required) |
| `POST` | `/api/auth/login` | none (credentials in body) |
| `POST` | `/api/auth/logout` | JWT — **also bumps `token_generation`** |
| `POST` | `/api/session/refresh` | JWT |

Plus:

- **Slot assignment and cap enforcement.** Lowest free `slot_index`, cap from
  `game.player.maxAliveCharacters` (default 3), in the **same transaction** as
  the insert.
- ⚑ **`CheckOrigin` allowlist + specific-origin CORS** — `backlog.md` §43. **They
  ship in this chunk, not after.** One allowlist serves both.
- ⚑ **Cookie flags `httpOnly; Secure; SameSite=Lax`** — ruled together with the
  allowlist deliberately. Shipping the cookie first would leave CSWSH protection
  resting on `SameSite=Lax` by accident.
- ⚑ **Unset `AURA_DB_URL` becomes a HARD BOOT FAILURE.** 1a chose warn-and-
  continue and flagged the flip at the decision site (`cmd/aurad/database.go`).
  Now there is something to log into, so §8's "refuse to start" applies.
- **~18 of the plan's ~20 queries.** 1a and 1b wrote two.
- **`game.audit_log` writes** — successes only.

### What 1c is NOT

- **No frontend.** Chunk 2.
- **No `Join` / wire change, and no ticket redemption.** Chunk 3 — 1c only
  *mints* tickets.
- **No save/load, no autosave, no snapshots.** Chunk 4.
- **No wiring of `SessionRegistry` into `sys/state.go`.** Chunk 3 owns that;
  `/select`'s live-session check is a **courtesy** (see invariant ③).
- **No password recovery.** Its own plan, last.

---

## 4. The three invariants (§10) — do not break them

They exist so that moving auth to a **separate machine** stays a deploy decision
rather than a refactor. All three are free today and expensive to retrofit.
⚑ **None of them asks for an abstraction layer, an `AuthProvider` interface or an
RPC seam** — building those speculatively costs more than the split they insure
against.

1. **The game server never sees a credential.** No password, no JWT on the game
   path. Already true; the play ticket is the mechanism.
2. **The ticket stays opaque outside `auth`.** Bytes in, bytes out — nothing
   parses it or derives anything from it.
3. **HTTP handlers depend on `store` + `auth` only, never on `core.Game` or the
   ECS world.** Verifiably true today. ⚑ **The tempting violation is `/select`'s
   live-session check** — keep it a courtesy check whose authority is `Join`.

⚑ **Known exception, recorded not designed around:** logout is specified to end
the live world session, which does reach into the running game.

---

## 5. Traps that will bite

Collected because they fail *silently*.

- ⚑ **`Throttle.Wait` goes AFTER the bcrypt comparison, never instead of it.**
  Otherwise the timing oracle `Gate.Verify`'s dummy compare exists to close comes
  straight back. The warning is on `Wait` itself.
- ⚑ **Always call `Gate.Verify` even when the username matched nothing** — pass
  `hash == ""`. That *is* the equalisation; skipping the call defeats it.
- ⚑ **`auth.ErrBusy` is not a failed login.** It means the comparison never
  happened. Map it to **503**, and do **not** call `Throttle.Fail` — otherwise a
  busy server burns throttle steps against innocent players and tells them their
  password is wrong.
- ⚑ **Only `*auth.RuleError` messages may be shown to a player verbatim.**
  Everything else gets §5b's generic string plus an unambiguous **server log
  line** — §5b is explicit that logging is the counterweight to vague messages.
- ⚑ **Never log token or password material**, including truncated forms.
  `game.audit_log` records **successes only** — never failed logins, which an
  attacker generates at will.
- ⚑ **A missing credentials row means ERASED, not "not yet registered"**
  (`store.ErrNoAccount`). Treat it as a refusal. A caller that read it as
  "generation 0" would resurrect every token an erased account ever held.
- ⚑ **`/select` must refuse when the account is already playing** — but as a
  courtesy, so the player is told at character-select rather than after it
  appears to succeed. `Join` stays the authority (chunk 3).
- ⚑ **Concurrent character creation loses the unique index** (§9 item 3). Two
  creates both compute "lowest free slot"; one gets a constraint violation. The
  database is *correct* — retry once rather than surfacing a raw conflict.
- ⚑ **Harness accounts are SEEDED, not registered.** `/api/auth/register` rejects
  `hrnss_` by design, so the `hrnss_01` / `hrnss_02` accounts go in via a dev seed
  script — never a migration, and never production (§11).

---

## 6. The one open decision — settle it before writing the validator's caller

**Character-name charset.** 1b enforces length (3–20), no surrounding
whitespace, no control characters, and the `hrnss_` rule — and deliberately
**invented no composition rule**, so `Barney Rubble` and `M'reth` currently pass.
No plan rules it, and quietly imposing `[A-Za-z0-9_-]` would be a design decision
wearing a validator's clothes.

⚑ **PO call.** Whichever way it goes, put it in `plan-accounts-implementation.md`
§7 beside the username rules, not only in code.

**Also recorded, not blocking:** avatar/faction defaults are blocked on
`plan-avatar-system.md` (§9 item 1) — use placeholders.

---

## 7. Tests 1c owns

From `plan-accounts-frontend.md` §11:

- **Slot assignment + cap enforcement**, table-driven — create at cap is
  rejected, and the slot-scoped partial unique index rejects a second alive
  occupant.
- **The soft-delete transaction** — name released, `deleted_at` set, chain
  untouched.
- **The orphan-discard logic** (implementation.md §6) against both the empty and
  has-progress cases.
- **Case-insensitive uniqueness** at the endpoint level — `Bob` cannot register
  over `bob`. The schema half is already proven by 1a.
- **The "already logged in" rejection**, ⚑ **across *different* characters of the
  same account** — a per-character implementation passes the same-character test
  while letting one player run all three at once.
- **Ticket minting** bound to `(account_id, character_id)`. Redemption is chunk 3.

DB-touching tests **must `t.Skip` when `AURA_TEST_DB_URL` is unset** — follow the
`testURL(t)` helper in `store_test.go`.

⚑ **Consider mutation-testing the security-critical handlers**, as 1b did for its
primitives: eight deliberate breakages, all caught, and two of them found real
defects. The ledger records the method.

---

## 8. Machine notes (this dev box, Windows)

| Thing | Reality |
|---|---|
| `AURA_DB_URL` / `AURA_TEST_DB_URL` / `AURA_JWT_KEY` | Set at **User** scope. Shells opened before they were set do not see them — read with `[Environment]::GetEnvironmentVariable('NAME','User')` |
| DB passwords | **Percent-encoded.** psql tolerates raw `^`/`>`; Go's `net/url` does not |
| `psql` | `F:\Program Files\PostgreSQL\18\bin\psql.exe`, **not on PATH** |
| `make` | **Not installed.** Run `cp-defs`'s two lines by hand |
| Booting `aurad` | Needs **`-zone world`** — local `conf.json` names no zone |
| `-race` | ⚑ **Cannot run** — needs cgo, and there is no C toolchain here. Write concurrency tests to fail by *counting outcomes* |
| PowerShell file edits | ⚑ **Do not** round-trip source through `Get-Content`/`Set-Content` — it adds a BOM. Use the Edit/Write tools |
| `pkg/api/mobs/*.json` | **Untracked** (`.gitignore` holds `*.json`). A fresh clone fails `go test ./...` until someone builds. Pre-existing |
| Go version | **`go 1.22`, PO-ruled.** Run **`go mod tidy -go=1.22`**, never bare — it silently raised the directive to 1.25 during 1a |
| bcrypt cost | 11 → ~263 ms here. ⚑ Extrapolates to **~0.9 s on the live vCPU**; measure and re-pick while provisioning the VPS |

---

## 9. Definition of done

- All eight endpoints, with §5b's error strings and an unambiguous server log
  line behind each vague one.
- **`CheckOrigin` allowlist + specific-origin CORS + the cookie flags in THIS
  chunk** (backlog §43). Close §43 when they land.
- **Unset `AURA_DB_URL` now fails the boot**, and `AURA_JWT_KEY` is read and
  validated at startup.
- The §7 test list passes, including the different-characters case.
- The §6 charset decision is taken **and written into the plan**.
- The three §4 invariants still hold — in particular, no handler imports game
  code.
- `go build ./...` · `go vet ./...` · `gofmt` clean · `go test ./...` green —
  **30/30 packages**, and still green with `AURA_TEST_DB_URL` unset.
- Boot clean: **0 errors 0 warnings** with `AURA_DB_URL` set.
- ⚑ **A browser harness may now own part of this chunk** — 1a and 1b owned none,
  but 1c is the first chunk with a runtime surface. §11's "harness accounts"
  section is the recipe; if the endpoints are only exercised by Go tests, say so
  explicitly in the ledger rather than leaving it unmentioned.
- A `§10a` ledger entry for 1c, in the same shape as 1a's and 1b's.
- **Do not commit unless asked.**
