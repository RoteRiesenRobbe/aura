# Plan: cheat authority moves from a shared token to an account flag

> **Status: DESIGNED 2026-10-02 (one PO session, D1-D7 taken as choice
> prompts), NOT APPROVED, nothing built, 3 chunks.** Six proposals (P1-P6) still
> wait for a ruling (§7). Line refs come from a survey of HEAD `3bff5220` on
> 2026-10-02; re-verify them before executing.

Origin: `backlog.md` §44, *"Cheat authority is a shared secret, and persistence
changes what it costs"* (found 2026-07-31, kept out of 8a by the PO's ruling
that day). The PO asked for this plan on 2026-10-02: *"Let's create a plan doc
for it then and link it up in the backlog. Poke holes and ask me questions."*

---

## 1. What this is

Today a cheat is allowed when the `Cheat` message carries a string listed in
`backend/tokens.list`. After this plan it is allowed when the **account**
playing on that connection is a developer. There is one exception: on a server
booted with `-dev`, every account counts as a developer.

A shared secret has three problems, and the flag fixes each one:

| today (token) | after (account flag) |
|---|---|
| Anyone who has the string can cheat; it does not say who they are. | Each person is granted the flag on their own account. |
| Revoking it for one person means rotating it for everyone, then editing a file and restarting. | Revoking is one `UPDATE` for one account. |
| Nothing records that a cheat was used, or by whom. | Every executed cheat writes a `game.audit_log` row with the account, the character and the command. |

The stakes changed with 8a. Cheats now write to a live database that has **no
backups** (PO 2026-08-04). Anyone with the token can make permanent changes to
any character they play, and nothing can roll those changes back.

### What it is not

- **Not a role system.** One flag covers all 11 commands (D4).
- **Not an admin UI.** The flag is granted and revoked by SQL (D6).
- **Not character tainting.** A cheated character is not marked (D7).
- **Not a change to what any cheat does.** The command set in
  `sys/cmd/cmd.go:18-210` stays exactly as it is; only the gate in front of it
  changes.

---

## 2. Decision ledger (PO 2026-10-02, taken as choice prompts)

| # | Ruling |
|---|---|
| **D1** | **Flag only, everywhere.** `tokens.list`, the `?token=` query parameter, the `Cheat.token` wire field and loadbot's `-token` flag all retire. No second gate is kept (the recommended option was "flag OR token", which the PO declined). |
| **D2** | **On a server booted with `-dev`, every account counts as a developer.** The flag is computed at `/select` and never written to the DB. The PO asked what "under `-dev`" means; the answer is in §3.3. |
| **D3** | **Load runs that use cheats (`-god`, `-skills`, `-warp`, `-quests`) run only against `-dev` servers.** PO: *"If dev allows all accs to cheat, these are only allowed to run on dev servers."* Load runs against the live server use plain bots without cheats. |
| **D4** | **One flag gates all 11 commands**, including the two that reach other players (`KILL <id>`, `ANNOUNCE`). |
| **D5** | **Every executed cheat writes a `game.audit_log` row** through a fire-and-forget writer. A new migration adds the columns the row needs. |
| **D6** | **Granting and revoking is an SQL runbook** (§3.6). It takes effect at the account's next character select. |
| **D7** | **No taint marking.** If someone needs to know whether a character was cheated, the audit trail answers it after the fact. |

---

## 3. The design

### 3.1 Where the flag is read: at `/select`, onto the ticket

§44 claimed the check would be *"a flag lookup, not new plumbing"*. That is
wrong in two ways (H1):

- **The game loop never reads the database.** This is the 8a invariant that
  made the play ticket exist (`auth/ticket.go:42-76`). A lookup inside
  `CommandSystem.Update` would stall every player for the length of the query.
- **`CommandSystem` does not know which account a player belongs to.** That
  mapping is `ConnectionStateSystem.accountByClient` (`sys/state.go:244`),
  which is private to another system.

So the flag follows the same path as the character's name and state:

1. `/select` (`accounts/characters.go:367-410`) already reads the account to
   prove it owns the character. In the same request it reads
   `game.accounts.is_developer` and ORs it with `Config.AllDevelopers`. That
   config value is set from `-dev`, the same way `AllowHarnessNames` is
   (`cmd/aurad/accounts.go:97`, `accounts/server.go:96-105`).
2. `auth.Ticket` gains `Developer bool`.
3. **Both** join paths copy it onto the player:
   - **A fresh join** takes it from the ticket.
   - **A reconnect** (`reattach`, `sys/state.go:992`) must **also** take it
     from the fresh ticket, not from the stash (H2). The reconnect path
     otherwise throws the ticket's state away on purpose, so a revocation would
     never reach a player who only ever reconnects.
4. The player carries `Developer()`, plus the account id and character id the
   audit row needs (§3.4). `CommandSystem.Update` replaces
   `validateToken(cheat.Token)` with `player.Developer()`.

**Revocation latency (P2):** a revoke takes effect at the account's next
`/select`. That means leaving to character-select, a reconnect, or a server
restart. A live session keeps cheating until one of those happens.

### 3.2 The schema: migration `000004`

```sql
-- up
ALTER TABLE game.accounts  ADD COLUMN is_developer BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE game.audit_log ADD COLUMN character_id BIGINT;  -- NO foreign key, see below
ALTER TABLE game.audit_log ADD COLUMN detail       TEXT;    -- for 'cheat': the command line verbatim
-- down: drop the three columns
```

- **The flag goes on `game.accounts` (P1).** That table is meant to stay tiny
  and hold nothing sensitive (`000001...up.sql:28-37`). A boolean fits both.
  A separate roles table would be YAGNI under D4.
- **`character_id` has no foreign key on purpose (P4).** In the game,
  characters are only ever soft-deleted (`deleted_at`, `sacrificed_at`;
  `store/characters.go:345, 411`). The two cleanup tools, however, hard-delete
  them. `harnessdb -cleanup` deletes `audit_log` rows *before* the characters
  (`main.go:219-221`), so a foreign key would survive it.
  `devops/cleanup-loadbots.sql:179-180` deletes them in the opposite order, and
  with no `ON DELETE CASCADE` allowed, that statement would abort as soon as a
  bot had cheated. Beyond that, an audit row is history and should outlive the
  row it names.
- **The new event is `'cheat'`**, added next to `store.AuditLogin` and the
  others (`store/accounts.go:155-168`). The comment on `audit_log` lists its
  events and has to be updated in the migration's own comment, not in `000001`
  (shipped migrations are frozen).
- **Only successes are recorded,** which is the table's existing rule
  (`000001...up.sql:189-194`). A cheat refused because the account is not a
  developer goes only to `slog`, with the account id. Recording refusals would
  give an attacker an unlimited write amplifier. A cheat that fails on its
  arguments (`WARP x`) is not recorded either.

### 3.3 What "under `-dev`" means (the PO's question on D2)

**`-dev` is the server's launch flag** (`./aurad -dev`,
`cmd/aurad/aurad.go:38`). Only whoever starts the process can set it. A browser
cannot.

The client's `?develop` query parameter is unrelated. It only opens the dev
panel and the console in that one browser, and it grants nothing. Neither do
`?start-cmds=` or the console: they only *send* `Cheat` messages, and the server
decides.

| how the server was started | who can cheat |
|---|---|
| `./aurad -dev` (local dev, every harness, the local loadbot) | **every account** |
| `aurad` without `-dev` (live: `devops/aurad.service:18`) | only accounts with `is_developer = true` |

This gives `-dev` a **third security job**. It already opens the reserved
`hrnss_` name prefix and the loopback origin exception, and
`cmd/aurad/aurad.go:553-563` records that **the live unit once ran with
`-dev`** (H5). If that ever happens again, every player on live is a
developer. P5 proposes two guards.

### 3.4 The audit writer: a fourth loop-to-DB seam

Writing a row from `CommandSystem` is a write from the game loop to the
database (H3). It follows the `CharacterSaves` precedent (`sys/persist.go:28-41`):

```go
// in sys/cmd: the narrowest thing the loop needs
type CheatAudit interface {
    Record(accountID, characterID int64, command string) // a memory copy; never blocks
}
```

- **The implementation lives in `persist/`.** It has a buffered channel and one
  goroutine calling `store.RecordAuditEvent` (with `character_id` and `detail`
  added).
- **A full buffer drops the row** and counts the drop in `slog`. The cheat
  still runs. Refusing a cheat because its audit row could not be written is
  not worth the coupling.
- **`NewCommandSystem` (`sys/cmd/cmd.go:228`) receives the seam** instead of
  `tokens`. The `sim` and `simharness` worlds pass a no-op implementation.

### 3.5 The wire and the client

- **`Cheat.token` is marked `(deprecated)`** in `api/schema/client.fbs:49-52`,
  and the bindings are regenerated for both ends. Old clients still send the
  field; the server never reads it.
- **`CommandMessage.ts` drops the token.** The console's `hasToken` gate goes
  away (`Console.ts:29-30, 146-153`). Today a missing token shows the console
  error *"URL parameter token is not defined!"*. Afterwards the console always
  sends, and the server decides.
- **A refused cheat stays silent on the wire (P3)**, as a wrong token is today.
  A non-developer sees `#GOD` echoed and nothing happens. A reply would
  advertise the cheat surface and would need a wire message.
- **`BasicConfig.VALUE_PARAMETERS.TOKEN` is deleted** (`BasicConfig.ts:46`). An
  old URL that still carries `?token=` keeps working, because the client
  ignores unknown parameters.

### 3.6 The runbook (D6)

Add this as a new section in `manual-db-migrations.md`, or in a short manual of
its own:

```sql
-- grant (only a REGISTERED account can be named: anonymous accounts have no username)
UPDATE game.accounts SET is_developer = true
 WHERE id = (SELECT account_id FROM game.account_credentials WHERE username = 'Robbe');
-- revoke: the same with false. Takes effect at that account's next character select.
-- who has it:
SELECT c.username FROM game.accounts a JOIN game.account_credentials c ON c.account_id = a.id
 WHERE a.is_developer;
-- what was cheated:
SELECT occurred_at, account_id, character_id, detail FROM game.audit_log
 WHERE event = 'cheat' ORDER BY occurred_at DESC LIMIT 50;
```

Naming the account by username means only registered accounts can be granted
the flag (H7). An anonymous account lives in one browser's cookie: clearing
that cookie would lose the account along with its flag.

---

## 4. Holes found while planning

| # | Hole | Where it is handled |
|---|---|---|
| **H1** | §44's "a flag lookup, not new plumbing" breaks the rule that the loop never reads the DB, and `CommandSystem` cannot see a player's account. | §3.1: the flag rides the ticket. |
| **H2** | A reconnect resumes the stash and discards the ticket's state, so a flag read from the stash would never refresh. | §3.1 step 3: both join paths copy the flag from the ticket. Needs its own test. |
| **H3** | An audit row written from `CommandSystem` is a write from the loop to the DB. | §3.4: a fire-and-forget seam. |
| **H4** | `audit_log` has no column for what happened or on which character, and its comment lists account events only. | §3.2: migration `000004`. |
| **H5** | `-dev` becomes a security switch for the third time, and the live unit has run with `-dev` before. | §3.3, P5. |
| **H6** | **Two latent bugs in the token code, which C1 deletes.** (a) A blank line in `tokens.list` becomes an empty token (`loaders.go:585-588` keeps every line), which a crafted `Cheat` with an empty token then matches. (b) If `tokens.list` cannot be created, `createTokens` returns `nil` and the caller indexes `tkns[0]` (`loaders.go:573-576`), so `aurad` panics at boot. Neither has fired on live, because the live file is one `openssl` line. | Fixed by deletion in C1. |
| **H7** | An anonymous account could be flagged by id and then lost with a browser cookie. | §3.6: grant by username only. |
| **H8** | **The live transition takes the PO's cheats away** from the moment C1 deploys until the `UPDATE` runs. The PO's live account must be a registered one. | C3's order: deploy, flag, select again, then delete the old token file. |
| **H9** | A harness pointed at a non-`-dev` server now fails every cheat silently, just as a wrong token does today. | loadbot already checks that the loadout stuck (`cmd/loadbot/main.go:148`). Browser harnesses assert outcomes. No change needed. |
| **H10** | Under `-dev`, every harness cheat writes an audit row to the local dev DB. | `harnessdb -cleanup` already deletes `audit_log` rows by account (`cmd/harnessdb/main.go:214-220`), and so does `devops/cleanup-loadbots.sql:181`. |
| **H11** | Progress cheated on live during the token era cannot be attributed to anyone. | Accepted. The audit trail starts at C3. |
| **H12** | **Found in passing, not this plan's bug:** `devops/cleanup-loadbots.sql` predates migrations `000002` and `000003`. It never deletes `game.character_campfires` or `game.character_map_fog`, and both reference `game.characters(id)`. So its `DELETE FROM game.characters` should abort on a foreign key for any bot that left a fog or campfire row, and a bot that walks gets a fog row. Not run, so not proven. | Not owned here. Recorded in `backlog.md` §44's link note. C2 touches loadbot, which would be a natural moment to fix it, but only with the PO's go-ahead. |

---

## 5. Chunks

Each chunk ships on its own. After C1, old clients and the harness keep working
unchanged: the server ignores the token they still send, and every account on
`-dev` is a developer.

### C1: the server gate

- Migration pair `000004` (§3.2). `store`: read `is_developer`, and add
  `character_id` and `detail` to `RecordAuditEvent`.
- `accounts.Config.AllDevelopers` (from `-dev`) and `auth.Ticket.Developer`, set
  at `/select`.
- The player carries `Developer()` and its account and character ids, copied
  from the ticket on **both** join paths (H2).
- `CommandSystem` gates on `Developer()`. The `CheatAudit` seam and the
  `persist` writer (§3.4). `slog` lines for refusals.
- **Deleted:** `loadOrCreateTokens`, `createTokens`, `core.Tokens`,
  `validateToken` and `GameConf.Tokens` (H6 goes with them).
- `-dev` boot warning (P5).
- Schema: **DB +1 migration pair · wire NONE · conf NONE**.

### C2: client, wire and tooling sweep

- `Cheat.token` marked `(deprecated)`. Regenerate the bindings (`api/schema/make.sh`).
- `CommandMessage.ts`, `Console.ts` and `BasicConfig.ts` (§3.5).
- loadbot: `-token` is removed, and `-god`/`-skills`/`-warp`/`-quests`/`-orbit`
  no longer require it (`main.go:53, 415-452, 820-821`). `loadtest.md` notes
  that cheat mode needs a `-dev` server (D3).
- Strip `token=plz&` from the 85 verify scripts, `dev-restart*.sh`, the
  content-editor link (`tools/content-editor/public/app.js:2488`), CLAUDE.md,
  `developer-onboarding.html` and the other docs that print the URL.
- `devops/deploy.sh:41-42`: drop the `tokens.list` exclude. Leaving it would be
  harmless, but it would mislead.
- Schema: **DB NONE · wire: 1 field deprecated · conf NONE**.

### C3: the live rollout (ops, no code)

1. Deploy C1 and C2. The migration applies at boot.
2. Run the grant `UPDATE` (§3.6) for the PO's registered live account.
3. In the game, go back to character-select and select the character again.
   Check that `PING` reaches the server log and that an `audit_log` row appears.
4. On a second, unflagged account, check that `GOD` is refused (an `slog` line,
   no audit row).
5. Delete `/opt/aurad/tokens.list`. Update `plan-playtest-deploy.md`, whose
   "Cheat safety" row (line 19) and ops quick-ref (line 287) name the token.

---

## 6. Test strategy (TDD: write the tests first)

- **store** (needs `AURA_TEST_DB_URL`): the flag defaults to false, reads back
  after the `UPDATE`, and an audit row round-trips `character_id` and `detail`.
- **accounts**: `/select` mints a ticket with `Developer` set from the row, and
  also set when `AllDevelopers` is on even though the row is false.
- **sys/state**: a fresh join copies the flag. **A reconnect takes the flag
  from the new ticket, not from the stash** (H2: revoke, reconnect, then
  refused).
- **sys/cmd** (`cmd_test.go`): a developer runs a cheat and gets one audit
  record. A non-developer is refused with no record. A cheat with bad arguments
  gets no record.
- **persist**: the writer drops rows when its buffer is full and never blocks.
- **Verify tail:** `go test ./...` with `-count=1`, the frontend tests and
  typecheck, then one harness run (e.g. `c3-spellbook.mjs`) **without**
  `token=plz` against `-dev`, which proves D2 end to end.

---

## 7. Proposed, NOT yet ruled

| # | Proposal | Recommended |
|---|---|---|
| **P1** | Put the flag on `game.accounts` as a boolean, rather than in a roles table. | Yes (YAGNI under D4). |
| **P2** | A revoke takes effect at the next `/select`. A live session keeps cheating until the player leaves, reconnects, or the server restarts. Making it immediate would need a new channel from HTTP into the loop. | Accept the latency. |
| **P3** | A refused cheat stays silent on the wire. | Yes. |
| **P4** | `audit_log.character_id` has no foreign key (§3.2). | Yes. A foreign key breaks ascension and the cleanups. |
| **P5** | Two guards against `-dev` on live: (a) a loud boot line, *"⚠ -dev: every account may cheat"*, and (b) a Go test that fails if `devops/aurad.service`'s `ExecStart` contains `-dev`. | Both. Together they cost about 15 lines. |
| **P6** | The plan's name and the flag's name: `is_developer` (from §44), or something else such as `can_cheat`. | Keep `is_developer`. |
