# Handover — step 8a chunk 4: save & load

Written 2026-08-02, at the end of chunk 3. Everything below is what the next
session needs that is **not** obvious from the plan docs.

**Read first, in this order:**

1. `plan-accounts-implementation.md` **§2** (the five save triggers), **§4**
   (snapshot mechanics, the field-by-field mapping, the write transaction),
   **§6** (the load path). These three are the chunk.
2. `plan-accounts-schema.md` §"The quest ledger" — the columns you are writing.
3. `plan-accounts-frontend.md` §10a chunk 3 ledger — what already exists.

---

## The one-line goal

**A character's progress survives a restart:** level, experience, spellbook,
loadout slots and the quest ledger. Everything else in step 8a already works.

⚑ **Round-trip is the acceptance test** — snapshot → write → load → identical.
That is *why* save and load are one chunk: §4's field mapping is a single
artefact whose halves must agree exactly, and a load/save mismatch is the classic
silent persistence bug. Writing both against one reading of that table is the
whole point.

---

## What chunk 3 already hands you

- **Identity at `Join` is solved.** The play ticket carries
  `(AccountID, CharacterID, Name, Avatar, Faction)`, and `tryJoin` has all of it
  before the player entity is built. You do not need to resolve who is joining.
- ⭐ **`Avatar` and `Faction` ride the ticket and are currently UNUSED.**
  `player.New(game, client, name)` takes no avatar, and `player.Faction()` is
  still hardcoded to `FactionAligned`. They were carried forward deliberately for
  this chunk — wiring them is a two-line change at the join site, not a new
  read.
- **`s.accountByClient[clientUUID]`** maps a live connection to its account, and
  `reconnectStash.accountID` carries it across a disconnect. Both are what a save
  path needs to know *whose* row to write.
- **The game holds no `*store.Store`, on purpose.** Chunk 3 removed the need for
  one by putting the character's identity on the ticket (ruling 11). ⚑ **Chunk 4
  will have to introduce database access to the game, and that is the single
  biggest design decision in front of you** — see the trap below.

---

## ⚑ The traps, in the order they will bite

### 1. The game loop is a single goroutine, and a query blocks every player

This is the reason ruling 11 exists: reading one character row inside `tryJoin`
would stall the whole world for the duration. §4 already answers it — **snapshot
inside the tick, write outside it** — but the answer only holds if you keep it.

The shape that works: build a plain value struct while on the loop (cheap, no
I/O), hand it to a writer goroutine, and never let a `*pgxpool` call happen on
the loop. The shape that quietly fails: a "just this once" synchronous write in
a save trigger.

⚑ **Autosave volume is not the risk.** 100 players on a 5-minute autosave is one
write per 3 seconds — implementation.md §4 sanity-checked it. The risk is
*where* the write runs, not how many there are.

### 2. Snapshot at a tick boundary, never mid-tick

§4 Rule 2. A snapshot taken halfway through a tick can capture a player whose
health has been decremented but whose death has not yet been processed. The
existing systems all run to completion inside `Update`; take snapshots from a
system that runs after them, not from inside a damage path.

### 3. The quest ledger has THREE fields, not two

`quests.Progress` carries `Running` **as well as** `Completed` and the stage
path. Chunk 1a already corrected the schema doc for this. ⚑ `Running` is
independent because `Ledger.Accept` permits re-accepting a *completed repeatable*
quest, so `Running && Completed` is a legitimate state. The persist rule is
`Running || Completed`, matching `Snapshot()`. Deriving `Running` would silently
drop a live run the first time content authors `repeatable: true` — a failure
that surfaces in content, long after the code that caused it.

### 4. Death and reconnect already carry state, in five places

`reconnectStash` carries `progression`, `skills` and `quests` across a
disconnect, and `deadState` does the same across a death. Chunk 4 adds a sixth
consumer of that same set. ⚑ **If you add a persisted field, check all of them** —
this is exactly how quest C1's L11 bug happened (a ledger that did not ride the
stash, so every death wiped quest progress).

### 5. `home_campfire_id` is a column nobody writes, and that is correct

NULL is a legitimate persisted value that falls through to the existing
`defaultSpawnPosition()`. A persisted character therefore spawns at a starting
campfire — exactly what every player gets today. **Do not "fix" this by
auto-binding at creation**; populating it needs the anchor-identity work that
`plan-accounts-schema.md` deliberately places outside 8a.

### 6. `synchronous_commit = off` is a decided trade, not an oversight

§4 explains it. Do not turn it on to make a test deterministic.

---

## Testing notes specific to this chunk

- **`go test ./...` runs packages in parallel against ONE test database.** Any
  new DB-touching package must take the advisory lock in `store/storetest` —
  without it the suite reads as a broken migration rather than as two test
  binaries fighting.
- **The `sys` tests install the real `TicketStore` and `SessionRegistry`** (pure
  in-memory Go). If chunk 4 adds a store dependency to `ConnectionStateSystem`,
  follow the same pattern — a real thing where it is cheap, so the tests exercise
  the real path.
- ⭐ **A vitest pass does not prove browser behaviour.** Chunk 3's hand-testing
  pass found that `instanceof` across a class hierarchy silently never matches in
  the shipped ES5 bundle, while the unit test asserting exactly that passed green
  throughout. **Anything that could differ between esbuild and the webpack build
  must be driven in a real browser.**
- Harness: `node .claude/skills/verify/chunk2-accounts.mjs` covers the account
  flow end to end (21 checks). Run `go run ./cmd/harnessdb -cleanup` afterwards.

---

## Environment reminders (all have cost a session before)

- `aurad` refuses to boot without **`AURA_DB_URL` and `AURA_JWT_KEY`**. On this
  box they are User-scope env vars a fresh shell may not see — read them with
  `[Environment]::GetEnvironmentVariable('NAME','User')`.
- **`./aurad` needs `-zone world`** here; the local `conf.json` names no zone and
  the boot panics without it.
- ⚑ **`taskkill //F //IM aurad.exe` matches NOTHING** — the binary has no
  extension. A stale server then serves old code and your change "does nothing".
  Kill `aurad`, and check for more than one process.
- **`scripts/dev-restart.sh` does not work on this Windows box** — it needs
  `pkill` and `setsid`, neither of which exists in Git Bash here. Start the
  processes by hand.
- Harness scripts must run from **Git Bash** (they need `HOME` for the playwright
  path).

---

## The cost of shipping late

Between chunks 3 and 4 the **account persists and the progress does not**. A
player levels a character, returns, and finds it at level 1 with the right name.
That is not worse than before persistence existed — restarts always wiped
everything — but it *reads* as broken to anyone testing, and it is the first
thing a playtester will report. **Land chunk 4 promptly.**

---

## After chunk 4

Step 8a is code-complete, but **§8's operational work is still unchunked**:
backups with a *proven* restore, off-machine storage, and the live-server
provisioning half of chunk 0. Decide whether that is runbook work or a chunk
before calling step 8a done — that ambiguity is exactly what made *"is step 8
done?"* unanswerable and got the step split in the first place.
