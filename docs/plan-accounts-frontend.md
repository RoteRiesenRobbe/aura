# Aura — Persistence frontend: login, character-select & the anonymous-first flow

What the player actually clicks through, from a cold page load to being in the
world and back out again. Companion to `plan-accounts-schema.md` (the DDL) and
`plan-accounts-implementation.md` (save/load mechanics, auth, transport).

**Status: in execution.** Chunk 0 (local Postgres) and **chunk 1a (schema,
migrations, connection layer) shipped 2026-07-31** — ledgers in §10a. Chunks
1b → 1c → 2 → 3 remain. All numbers below (max alive characters, cooldown
seconds) are placeholders per the project convention.

---

## 1. Decided parameters

| Decision | Value |
|---|---|
| Max alive characters per account | 3, configurable (`game.player.maxAliveCharacters`) |
| Character-delete confirm cooldown | 5 s, configurable (`game.player.characterDeleteConfirmCooldownSeconds`) |
| Character deletion | soft-delete (`deleted_at`), distinct from sacrifice — no hard `DELETE` |
| Anonymous-secret minting | bundled into first-character creation |
| Anonymous-secret storage | `localStorage` (extends the existing `Account` module) |
| Auth JWT storage | cookie, server-set on login/register, cleared on logout. Flags **`httpOnly; Secure; SameSite=Lax`** |
| Auth JWT lifetime | short (1 h [PLACEHOLDER]) with **silent refresh while playing** — never a forced logout mid-session |
| Naming the chosen character on `Join` | **play ticket** from `POST /api/characters/{id}/select`, not a `characterId` field |
| Username / password rules | username **3–32**; password **≥ 8** with at least one special character and a trivial-sequence blocklist |
| DB writes for account/character lifecycle ops (create, delete, register, login) | synchronous, not queued — distinct from the periodic autosave, which stays queued |
| Character creation → world entry | **One path for all cases:** creation always returns to character-select. There is no separate bootstrap join |
| First-ever creation (no local token at all) | Character-select **auto-selects** the sole new character and enters the world, so the player experiences no extra click — via the ordinary select path, not a special one |
| Auto-select scope | **Only immediately after a creation.** Arriving at character-select any other way never auto-selects, even with exactly one character |
| Concurrent play | **One live session per account** — not per character. Three characters cannot be played in three tabs. Login is account-scoped, never character-bound |
| Expired play ticket at `Join` | **Silent retry once**: re-call `/select`, connect with the fresh ticket. If that also fails, bounce to character-select with a plain message. Never show the word "ticket" |

---

## 2. Three tokens, not one

The existing reconnect-token feature (`archive/plan-reconnect-token.md`) is easy
to conflate with what this doc adds. They are unrelated mechanisms:

| | `reconnectToken` (existing) | `anonymousSecret` (new) | auth JWT (new) |
|---|---|---|---|
| Identifies | a live in-memory session | a `game.accounts` row | a `game.accounts` row, via its credentials |
| Storage | `sessionStorage` | `localStorage` | cookie |
| Lifetime | ~10 min after disconnect | forever, until explicitly discarded | until logout |
| Set by | server, on `Accept` | server, on first character creation | server, on login/register |
| Purpose | skip re-typing a name on page refresh mid-session | resume an anonymous account across browser restarts | resume a registered account across browser restarts / devices |

⚑ **They compose, they don't replace each other.** A registered player reloading
mid-session still uses `reconnectToken` first (unchanged, invisible, per the
existing feature) — the flow in §5 only runs when there is no live session to
reconnect to.

---

## 3. New HTTP endpoints

Everything in this doc is plain HTTP/JSON on the existing Go server — account
lifecycle stays off the WebSocket/FlatBuffers path. The `GET /skills` catalog
endpoint from `plan-ui-polish.md` is the existing precedent for HTTP alongside
the WS game connection. These are ordinary handlers against the same Postgres
the game uses; nothing proxies anywhere.

| Method | Path | Auth context | Does |
|---|---|---|---|
| `POST` | `/api/characters` | anon secret, JWT, or neither | Create a character. No identity present → mints a new `accounts` row + credentials row carrying `anonymousSecret` first. Assigns the lowest free `slot_index` and enforces the slot cap in the same transaction. |
| `GET` | `/api/characters` | anon secret or JWT | List **alive** characters for character-select. |
| `POST` | `/api/characters/{id}/delete` | anon secret or JWT, must own the row | Soft-delete: sets `deleted_at`, rewrites `name` (same pattern as erasure). |
| `POST` | `/api/characters/{id}/select` | anon secret or JWT, must own the row | Verifies ownership and mints a single-use, 30 s [PLACEHOLDER] ticket bound to `(account_id, character_id)`. The client presents it on the WS `Join`; the socket carries no identity of its own. ⚑ **Also refuses when the account already has a live session** — a courtesy check so the player is told here rather than after character-select appears to succeed; `Join` remains the authority. implementation.md §7b. |
| `POST` | `/api/auth/register` | anon secret (required) | Sets `username` + `password_hash` on the *current* account's credentials row. Sets the JWT cookie on success. |
| `POST` | `/api/auth/login` | none (credentials in body) | Verifies username + bcrypt password, sets the JWT cookie. Does **not** touch the caller's current anonymous account — see §6. |
| `POST` | `/api/auth/logout` | JWT | Clears the cookie **and bumps `token_generation`**, which is what makes it actual revocation rather than a browser-local gesture — clearing a cookie does nothing to a token copied off the machine. Also ends any live world session for the account. |
| `POST` | `/api/session/refresh` | JWT | Issues a fresh JWT cookie when presented with a still-valid one. Refuses under the same conditions login would (logged out elsewhere, erased, `token_generation` bumped) — it is not a rubber stamp. The client calls it on a timer at ~half the token lifetime. |

⚑ **All eight are credentialed cross-origin requests**, so they fall under the
CORS rule in implementation.md §7b — **not** the wildcard catalog pattern, which
browsers reject outright for credentialed requests.

⚑ **The three recovery endpoints (`forgot-password`, `reset-password`,
`recovery-email`) are deliberately elsewhere** — `plan-accounts-password-reset.md`,
along with the columns behind them. They need outbound email, which aura has no
capability for; keeping them here would have blocked this entire plan behind a
mail-provider decision.

---

## 4. Screens & where they live

Reuses the existing frontend structure rather than inventing new top-level
areas:

- **Home** — extends `features/user-interface/start-screen`. On mount: check
  `localStorage` for `anonymousSecret`. Present → attempt `GET /api/characters`,
  route to character-select (or straight into the game if it is a live-session
  reconnect, per §2 — that remains the **only** path that bypasses
  character-select). Absent → show the character-creation form plus a **Login**
  button underneath it.
- **Character-creation form** — the existing `PlayerName.ts`/name-field flow,
  grown into a real screen. **One component, two mounts**, both full screens:
  the home-screen mount (no local identity yet) and the character-select mount.
  Both route to character-select on success. Designed in §4b.
- **Character-select** — **new screen.** Lists alive characters from
  `GET /api/characters`, a create-new affordance in the first empty slot (up to
  the configured max), Play + Delete per row, and a Logout button for registered
  accounts only (§5.3).
  **Each row shows name, level and avatar** — enough to tell three characters
  apart at a glance, and all three already exist on the `characters` row.
  ⚑ `avatar` is a placeholder constant until `plan-avatar-system.md` lands, so
  the row renders a single default portrait for now; the field is wired, the art
  is not. Deliberately **not** shown: "last played", which would need a new
  column and a new write path.
- **Login form** — **new**, username/password, reachable from the home screen's
  Login button and from settings/HUD (§5.4).
- **Register form** — **new**, username/password, reachable only from
  settings/HUD, only while anonymous. **No email field at all** — identity is
  the username (implementation.md §7).
  ⚑ **It states plainly that password recovery is not yet available.** Until
  `plan-accounts-password-reset.md` ships, a forgotten password is
  unrecoverable, and saying so up front is the difference between a known
  limitation and a betrayal. **Remove that copy as part of that plan**, not
  before.
- **Settings entry** — extends `features/game-settings` (already a gear-icon
  slide-out panel with grouped sections) with a new "Account" group: Register
  while anonymous, or the username once registered. The add/change-recovery-email
  control arrives with the reset plan.
- **HUD nag** — **new**, dismissible banner, anonymous-only. See §5.4.
- **Delete-confirmation dialog** — **new.** No modal/confirm pattern exists
  anywhere in the frontend today (checked); this is net-new UI, though it can
  reuse the existing show/hide `.hidden`-class panel idiom used by
  settings/credits/changelog.

---

## 4b. Character creation — the screen

The first thing a new player ever touches.

### One layout, two mounts

**Both mounts are full screens**, differing only in what sits below the form.
The form itself needs exactly one layout, and neither mount needs a new UI
primitive.

```
HOME MOUNT                         CHARACTER-SELECT MOUNT
(no local identity, §5.1)          (empty slot clicked, §5.3)

   Create your character              Create your character

       ┌─────────┐                        ┌─────────┐
       │ default │                        │ default │
       │ portrait│                        │ portrait│
       └─────────┘                        └─────────┘

  Name [______________]              Name [______________]
    Barney Rubble                      Barney Rubble

       [  Create  ]                       [  Create  ]

  ─────────────────────              ─────────────────────
   Already have an account?                  [ Back ]
        [  Log in  ]
```

- **Home mount** — carries the **Log in** button beneath the form. No cancel:
  this *is* the entry point, there is nowhere to go back to.
- **Character-select mount** — carries **Back**, returning to character-select
  with nothing created. ⚑ Without it, a player who clicks an empty slot and
  changes their mind is stuck.

### Fields

**Name is the only input.** Everything else on `characters` is either derived or
a placeholder:

| Field | Creation-time behaviour |
|---|---|
| `name` | The one real input. Inherits today's rules: 20 chars max, blacklist-filtered, `NameGenerator.generate()` as the placeholder suggestion. ⚑ Now also **globally unique and case-insensitive**, which today's flow never had to handle |
| `avatar` | **Static default portrait, not selectable** — avatars are their own feature (`plan-avatar-system.md`); this plan only anticipates them with a placeholder constant |
| `faction` | Not asked. `player.Faction()` is hardcoded to `FactionAligned` (`model/player/player.go:600`); there is no player-facing faction choice to make yet |
| `slot_index` | **Server-assigned** (lowest free slot), never client-chosen |
| `level` / `experience` | Schema defaults (1 / 0) |

⚑ **The portrait is shown but inert, and deliberately carries no "change"
affordance** — no greyed-out control, no "coming soon" label. A disabled control
reads as broken, and promising a feature on the screen before it exists is worse
than staying quiet. **Consequence to accept up front:** when
`plan-avatar-system.md`'s picker chunk lands it will *add* a control here and
shift this layout. That is known, accepted rework — the alternative (reserving
space for a picker that may look different once designed) risks reserving the
wrong shape.

⚑ **This screen has a known-future third field.** Backlog §12 (Völker) and §36's
per-race starts would both be chosen here. Do not build the layout as a
permanent two-element form.

### The name suggester needs work, mostly not in 8a

`NameGenerator.generate()` (`features/player/logic/NameGenerator.ts:63-65`)
emits a **two-word Flintstones parody** — `Barney Rubble`, `Wilma Slaghoople`,
`Tex McMagma` — from 22 male first names, 6 female, and 19 surnames. Inherited
Berryhunter joke content, and persistence changes what it costs:

- **The pool is ~550 combinations and names are now globally unique.** A player
  who accepts the suggestion will increasingly hit "that name is taken" — for a
  name the game itself proposed. ⚑ **The generator must re-roll on collision**,
  and that fix **ships with 8a** regardless of anything below: it is
  correctness, not content.
- **`generate()` never returns a female first name** — `femaleFirstNames` exists
  and line 64 draws only from `maleFirstNames`. A live bug today, invisible
  because names are disposable; permanent once a character is.
- **Tone** — a Flintstones gag suited a survival-game fork. Aura's references
  are WoW Classic and Gothic.

✅ **Ruled: replace the word lists**, as its own small task **outside 8a**. The
mechanism (`generate()`, the re-roll, the 20-char cap) stays; only the
vocabulary changes. ⚑ **The female-list bug is superseded, not fixed** — the
replacement task must not merely swap word lists and inherit the same one-list
draw. It is the same two lines. Until it lands, the bug is live and now
permanent per character.

### Validation

Two tiers, because they cost different things:

- **Client-side, immediate** — length and character rules. The same rules
  today's start screen already enforces, so nothing new is invented.
- **Server-side, on submit** — uniqueness. It *cannot* be checked client-side,
  and a name can be taken between typing and submitting, so `POST /api/characters`
  rejecting with "That character name is taken" (implementation.md §5b) is the
  authoritative path. The field keeps its value on rejection.

⚑ **Do not pre-fill the name from `localStorage`.** Today's `fillInput`
pre-populates the last-used name, which under global uniqueness guarantees a
rejected submit for a returning player — see §4c, where that storage is retired.
The generated *suggestion* stays.

### After submit

**Both mounts → character-select.** Character-select then decides:

- **It was the account's first character** → auto-select and enter the world, so
  the first-time player experiences no extra click.
- **Otherwise** → the new character appears in its slot and the player presses
  Play, consistent with every other row.

⚑ The auto-select triggers on *"a creation just happened and it was the first"*,
**not** on *"there is exactly one character"* — see §5.3 for why the second
reading locks a player out of Delete and Logout.

---

## 4c. The existing `features/accounts/` module

The frontend already has a directory called `accounts`. It contains two files,
and **only one of them is about accounts** — worth settling before new identity
code is written next to it.

`Session.ts` is genuine: a `sessionStorage` wrapper for the `reconnectToken`
(§2). It stays, and is the natural neighbour for the new identity state.

`Account.ts` is **not an account** despite its name and its docstring's claim
that it holds one "as long as accounts are not persisted in the backend." It is
a `localStorage` wrapper, and three of its four properties are device
preferences this plan never persists server-side and never should:

| Property | Consumer | Really is | Fate |
|---|---|---|---|
| `fullScreen` | `full-screen/logic/FullScreen.ts` | device UI preference | **keep** |
| `rawGameSettings` | `game-settings/logic/GameSettings.ts` | device UI preferences blob | **keep** |
| `developPanelPositionX/Y` | `internal-tools/develop/logic/_Develop.ts` (`?develop` only) | dev-tool window position | **keep** |
| `playerName` | `player/logic/PlayerName.ts` | last name typed *on this device* | **retire** |

**`playerName` is retired, not migrated**, for two independent reasons:

1. ⚑ **Its prefill becomes actively harmful.** `PlayerName.fillInput`
   (`PlayerName.ts:63-71`) pre-populates the name field with the stored name.
   Character names are globally `UNIQUE` under this plan, so prefilling a name
   the player already used guarantees a rejected submit. The
   `NameGenerator.generate()` *suggestion* stays correct; the stored-name
   prefill does not.
2. ⚑ **Its other use is already dead code today.** The auto-rejoin path
   (`PlayerName.ts:29-30`) builds `Account.playerName || NameGenerator.generate()`
   and sends it in the reconnect `JoinMessage` — but `reattach` in `sys/state.go`
   documents the opposite: *"The stashed name is still reserved … and is reused
   verbatim — the token identifies the character, so it wins over the Join's name
   field."* The server has ignored that argument since the reconnect feature
   shipped; this plan only makes it visible.

**Recommended shape — split by ownership, not by convenience:**

- **`features/accounts/`** becomes genuinely identity-scoped: `Session.ts`
  (exists) + the new `anonymousSecret` storage + the auth API client. All
  server-backed, all with real lifetimes (§2).
- **Device preferences move out** under an honest name (`DevicePrefs` /
  `LocalPrefs`), keeping `fullScreen` / `rawGameSettings` /
  `developPanelPosition*` exactly as they are. They are browser-local forever and
  unrelated to who is logged in — which is precisely why the module cannot simply
  be deleted.

⚑ **The rename is not cosmetic here.** `plan-accounts-schema.md` §Naming makes
`accounts` the server-side identity table; leaving a frontend class called
`Account` that stores fullscreen state and dev-panel coordinates recreates, on
the client, exactly the ambiguity that rename was meant to remove.

---

## 5. Flow walkthrough

### 5.1 Cold load

```
on home-screen mount:
  if a live session is reconnectable (existing feature) → resume, skip everything below
  if localStorage.anonymousSecret exists:
      GET /api/characters using it
        success → character-select (§5.3)
        rejected (secret unknown/expired server-side) → treat as absent, fall through
  else:
      show character-creation form + Login button
        on create → character-select, which auto-selects the sole character
```

⚑ **Every branch except the live-session reconnect ends at character-select.**
The reconnect skip is an existing feature resuming an *in-memory* session, so it
never had a character to select.

**Creating a character from the "absent" branch** calls `POST /api/characters`
with no identity attached. The server mints the `accounts` row, its
`account_credentials` row carrying the hashed secret, and the `characters` row
**in one transaction**. The response includes the new `anonymousSecret`, written
to `localStorage` immediately. Then it routes to **character-select**, which
auto-selects the sole new character and enters the world (§5.3). The player sees
no extra click; the mechanism is the ordinary select-then-play path, including
its play ticket.

**Edge cases:**

- **Name collision** (`characters.name` is globally unique) — surfaced as a form
  validation error, same UX as any other create-character rejection.
- **`avatar`/`faction`** are `NOT NULL` but no picker UI exists for either.
  ⚑ **Cross-doc gap, not resolved here:** `plan-avatar-system.md` assumes avatar
  ownership is **per-account**, while this schema puts `avatar` **per-character**
  — that plan's own §8 open question 1 ("confirm before building persistence") is
  effectively pre-answered by a doc it does not reference. Until the avatar
  system ships, creation defaults `avatar` to a placeholder constant and
  `faction` to whatever `player.Faction()` returns.
- **Partial failure** (account row written, character insert fails) — same
  transaction, so not reachable; if it were, it would produce exactly the
  zero-alive-characters state character-select treats as normal (an empty list),
  not a broken one.

### 5.2 The register/login split

Two different actions, deliberately not unified:

| | Register | Login |
|---|---|---|
| Reachable from | settings panel / HUD nag, anonymous only | home screen (no token) or settings/HUD (has token) |
| Input | new username + password | existing username + password |
| Effect on current identity | **sets credentials on** the current account | **switches** to a different, already-existing account |
| Warns before proceeding? | no | conditionally — see §6 |
| Current anon progress | kept, now reachable via those credentials too | discarded if real (§6) |

### 5.3 Character-select

`GET /api/characters` → up to `maxAliveCharacters` rows, each with Play +
Delete. An empty slot (if under the cap) shows the create-new affordance,
mounting the character-creation form from §4b.

**Creation always returns here — there is no bootstrap path that bypasses this
screen.** One code path, one place a character is committed to, and — now that
the play ticket is the only way into `Join` — **one place a ticket is minted**.
A separate first-time path would have been a second ticket-minting site
reachable before character-select existed, exactly the kind of parallel route a
security-relevant step should not have.

Character-select then **auto-selects** when it was reached *from a creation* and
that creation produced the account's only character: it plays that row as if
Play had been clicked. The first-time player sees no extra click; the mechanism
is ordinary.

⚑ **Scope the auto-select to "just created", not to "exactly one character."**
The unscoped rule looks equivalent and is a trap: a returning player whose only
character is their last one could then **never reach this screen** — and this is
where **Delete** and **Logout** live. They would be locked into that character
with no way to remove it or sign out. The trigger is the creation that just
happened, not the row count.

**Slots are fixed positions, not a list.** Each row is a `slot_index`, and a
sacrifice successor inherits its predecessor's slot, so a slot is a continuous
*bloodline* — and per backlog §36, sacrifice unlocks accrue to **that slot**, not
to the account. Render rows in `slot_index` order, not creation order — a
player's slots should not reshuffle under them.

**Character-select is always the destination after login** — there is
deliberately **no** "skip straight in if you only have one character" shortcut.
It costs a click and buys one consistent post-login destination plus a
guaranteed route to Logout and Delete, which would otherwise become unreachable
for a single-character player.

**The Logout button lives here, and only for registered accounts.** For an
anonymous player there is no JWT to clear, and the only thing "logout" could
mean is discarding the local `anonymousSecret` — i.e. **abandoning the account
permanently with no recovery path**, the exact outcome §6 builds an explicit
warning around. Offering that as an unadorned button labelled "Logout" would be
the most destructive control in the game wearing the most routine label in
software, so it is simply not shown. Logging out clears the JWT cookie (and
bumps `token_generation`) and returns to the home screen, which then finds no
reconnectable session and — a registered player never carries `anonymousSecret`
— no local token, landing on character-creation + Login.

**Edge cases:**

- **Cap reached** (3/3 alive) — create-new affordance hidden/disabled; a
  disabled state with a tooltip is enough.
- **Graveyard (sacrificed) and deleted characters are out of scope for this
  screen** — `GET /api/characters` returns alive rows only by design. Whether a
  graveyard/history view exists anywhere is unscheduled and unrelated.
- **Deleting a character currently live elsewhere** — the delete endpoint should
  refuse if the target character has an active in-memory session, checked
  against the same account-scoped session registry §8 introduces.

### 5.4 The registration nag

Two independent surfaces, anonymous-only:

- **Settings panel entry** — always present, never auto-hides, standard
  "open settings → click Register" path.
- **HUD banner** — dismissible (closes on click), **reopens on every fresh
  login**, not on every page load. "Fresh login" = the character-select → Play
  path (§5.3); a same-session page-refresh that resumes via `reconnectToken`
  (§2) does **not** re-trigger it — that path is explicitly designed to be
  invisible, and undoing that with a nag would fight the existing feature's
  purpose.

Once a player registers, both surfaces stop applying.

---

## 6. The anonymous-progress warning

The warning is **conditional**, not automatic, and reuses the rule
implementation.md §7 already established for orphan accounts rather than
inventing a second one:

- **No local `anonymousSecret` at all** (Login pressed from the bare home
  screen, before ever creating a character) — nothing to lose, nothing to warn
  about. Log in directly, land on character-select for the target account.
- **A local anon account exists but is empty** — zero alive characters and zero
  `bloodline_unlocks` rows — discard silently, no warning.
- **A local anon account has real progress** (≥1 alive character or ≥1 unlock) —
  show the warning, requiring explicit confirmation, before discarding.

"Discard" composes two already-designed mechanisms rather than adding a third:
soft-delete (§7, `deleted_at`) every alive character under that anon
`account_id`, then run the existing anonymisation path (`plan-accounts-schema.md`
§Erasure) on the account itself — which deletes its `account_credentials` row,
so the stale local `anonymousSecret` can never resolve to it again, even though
that account never had real credentials.

⚑ **Clear `anonymousSecret` from `localStorage` in the same step.** After the
switch it resolves to nothing; harmless but untidy.

---

## 7. Character deletion

Soft-delete only (§1) — `deleted_at` is set, `name` is rewritten and released
immediately (same pattern as account erasure), the row stays as inert history.
No hard `DELETE`, matching the schema's no-`ON DELETE` philosophy.

**Confirmation UX:** yes/no dialog, "yes" disabled for
`characterDeleteConfirmCooldownSeconds` (5 s placeholder) after the dialog
opens. The countdown restarts if the dialog is closed and reopened — it is
framed as "make sure you read this", not a rate limit, so there is no reason to
persist partial progress across opens.

⚑ **The cooldown is UI friction, not a security control.** A direct
`POST /api/characters/{id}/delete` bypasses it entirely. That is fine for its
actual purpose (preventing a misclick), but it must never later be mistaken for
rate-limiting or abuse protection.

**What deletion does *not* do:** grant anything (unlike sacrifice), affect the
succession chain (a deleted character's `previous_character_id` link, if any, is
untouched — it is chain history), or require the character to be
un-sacrificeable, since delete only ever targets alive rows.

**Name-release rules across all three "character stops being active" events**,
confirmed side by side:

| Event | Name |
|---|---|
| **Sacrifice** | **Reserved forever** — the graveyard chain is history and must stay readable |
| **Soft-delete** | Released immediately |
| **Account erasure** | Released immediately |

⚑ Consequence for whoever builds the graveyard UI: a sacrificed name can never
be reused, so a long-lived account accumulates permanently reserved names.
Accepted at this playerbase; the alternative (a live character shadowing a
graveyard entry of the same name) was rejected.

---

## 8. Not built by this plan — flagged for the execution session

- **The WS `Join` message needs to carry which character was chosen.** Today it
  carries `(playerName, reconnectToken)` only (`client.fbs`). `Join` gains a
  **play ticket** field; `POST /api/characters/{id}/select` checks ownership over
  authenticated HTTP and mints it. Full shape and the reasoning against the
  `characterId` alternative: `plan-accounts-implementation.md` §7b.
- **The session registry needs to learn about accounts.** A per-connection
  session mechanism already exists — `ConnectionStateSystem`'s `tokenByClient` /
  `stashByToken` / `s.players` bookkeeping (`sys/state.go`; ⚑ that Go field holds
  live *in-world avatars* and is unrelated to the SQL tables — see
  implementation.md §1 Vocabulary) — but it is scoped to **connection
  continuity** (a `reconnectToken` is a bare bearer token, checked for nothing
  but existence), not **identity**. Every guard implementation.md §5 promises
  needs this registry to carry `account_id`, because nothing else in the system
  associates a live connection with an account. Concretely: stamp
  `reconnectStash` (`state.go:68-78`) with the owning `account_id` at stash time.
- **The reconnect path should check identity, not just possession of the token.**
  Today, presenting a valid `reconnectToken` alone resumes a live character
  (`state.go:305`) — nothing checks that the presenter is the account that owns
  it. That was acceptable when nothing was staked on it; once step 8 ships, a
  leaked `reconnectToken` (XSS, shared machine, a stray log line) lets someone
  else resume your live character's session. The fix rides the same registry
  change and costs no UX — the browser already holds both the `reconnectToken`
  (sessionStorage) and the anon-secret/JWT (localStorage/cookie) in the same tab
  in the common case, so this is a server-side equality check, not an extra
  prompt. Falls through to a normal Join/character-select on mismatch or absence.
  ⚑ This **supersedes** `archive/plan-reconnect-token.md`'s bearer-token-only
  model — that doc is frozen per the archive convention, so the change is
  recorded here rather than edited in.
- **`CheckOrigin` allowlist and specific-origin CORS** — pre-existing permissive
  defaults that persistence turns into vulnerabilities. Recorded as `backlog.md`
  §43; must land with the first credentialed request (chunk 1c). Detail in
  implementation.md §7b.
- **Rate limiting / anti-bot** — `tdd.md` §4.4 lists "Anti-bot / anti-abuse?" as
  an open question; these eight endpoints are its first concrete consumer, two of
  them (`login`, `register`) classic abuse targets. Mechanism now specified in
  implementation.md §0.
- **Password recovery in its entirety** — `plan-accounts-password-reset.md`.
  ⚑ **Until it ships, a forgotten password is unrecoverable**; the register form
  says so.

---

## 9. Open questions

**One remains, and it is blocked rather than undecided:**

1. **Avatar/faction defaults** (§5.1) — placeholder values until
   `plan-avatar-system.md` and a faction picker exist. Nothing here can be
   decided before those do.

### Recorded, not blocking

2. **Lowering `maxAliveCharacters` later strands characters.** Drop it from 3 to
   2 and any character at `slot_index = 2` is alive but in a slot the UI no
   longer renders. Nothing in the schema bounds `slot_index` (by design — it is a
   config knob, not an invariant), so this is purely a migration/UI question if
   the number ever moves. Raising it is safe.
3. **Concurrent character creation surfaces an ugly error.** Two simultaneous
   creates both compute "lowest free slot"; one loses the unique index and gets a
   constraint violation. The DB behaviour is *correct* — that is the index doing
   its job — but the caller should retry once rather than surfacing a raw
   conflict.

---

## 10. Suggested chunking

✅ **The quest prerequisite is satisfied.** D12 sequenced **chunks P + C0–C4**
ahead of step 8 so the ledger would be built session-scoped first and
persistence would receive a *live* structure rather than a designed-on-paper
one. All of it shipped 2026-07-30 (`archive/plan-quests.md`), so both hard
dependencies are met: the ledger shape (`plan-accounts-schema.md` §"The quest
ledger") exists in Go, and C1's **duplicate-`MobID` boot guard** — required
*"before any of this persists"* — is in place.

⚑ **Re-read §"The quest ledger" against the shipped code before writing 1a.**
It was written from `plan-quests.md` §10 while the ledger was still a paper
shape; the built `quests`/`killCounts`/`talkedTo` structures are now the
authority, and any drift between them and the schema is a defect in this plan,
not in the code.

✅ **Chunk 0 — stand up Postgres locally — is DONE (2026-07-31).** Postgres 18.4,
role `aura`, databases `aura` + `aura_test`, all three environment variables set,
verified against the four checks in implementation.md §0 "MANUAL STEP". The
live-server install is separate and needed only before 8a *deploys*, not before
it is written.

**Chunk 1 is split three ways.** Each part is independently testable, and **1a
proves the database setup before anything depends on it** — a migration problem
found while debugging an endpoint is much more expensive than one found on its
own.

1. **1a — Schema & migrations. ✅ DONE 2026-07-31, `6d5cc695`** — see the
   ledger below. The whole `game` schema (accounts, credentials, characters,
   bloodline unlocks, child tables, `audit_log`), `golang-migrate` wired **as a
   library** to run at boot with the SQL `go:embed`-ed, the `pgx/v5` + `pgxpool`
   connection layer, and the disposable `aura_test` database from §11.
   Deliverable: migrations apply to an empty database and roll back cleanly. No
   Go game code touches it yet. ⚑ Includes `token_generation`.
   ⚑ **Read implementation.md §0 first** — driver, pool, query style and where
   Postgres runs are all decided there, and this chunk is the first consumer of
   every one of them.
2. **1b — Auth & sessions. ✅ DONE 2026-08-01, `31ebebcb`** — see the ledger below. bcrypt
   hashing, JWT issue/verify including the `token_generation` claim, the
   play-ticket TTL map, the account-scoped live session registry, and the
   failed-login throttle (⚑ the delay applies *after* the dummy bcrypt
   comparison, or it reintroduces the timing oracle). Pure Go with unit tests,
   no HTTP surface yet.
   ⚑ **The live-session registry splits across 1b and 3, decided 2026-08-01.**
   Its scope line read as though 1b built the whole thing, which does not fit
   "pure Go, no HTTP surface": the registry is the existing
   `ConnectionStateSystem` (`sys/state.go`) extended to carry `account_id`, so
   building it wholly here means editing live game code — and chunk 3 already
   owns the atomic account-slot claim on that same structure plus the reconnect
   identity check. **1b builds the TYPE** (`auth.SessionRegistry`, self-contained
   and unit-tested, owning "which account is live, claimed atomically");
   **chunk 3 wires it into `sys/state.go`**, where the `Join` path and the stash
   already live. That splits along a seam which exists rather than inventing one,
   and hands chunk 3 a tested component instead of a design problem.
3. **1c — The eight endpoints.** Character CRUD, register/login/logout,
   `/select`, `/session/refresh`, plus slot assignment and cap enforcement.
   **CORS and the `CheckOrigin` allowlist land here**, since this is where the
   first credentialed request exists.

   ⚑ **Three invariants 1c must not break** (PO 2026-08-01). They exist so that
   moving auth to a **separate machine** stays a later deploy decision rather
   than a refactor. All three are free today and expensive to retrofit; none of
   them asks for an abstraction layer, an `AuthProvider` interface or an RPC
   seam — building those speculatively would cost more than the split they
   insure against, and §7 already rejected a second runtime on its own merits.

   1. **The game server never sees a credential.** No password, no JWT, no read
      of `account_credentials` on the game path — it receives a ticket and
      exchanges it for `(account_id, character_id)`. **Already true**, and the
      play ticket is the mechanism. Broken by anything that puts a JWT on the
      socket or has `Join` verify a cookie.
   2. **The ticket stays opaque outside `auth`.** Bytes in, bytes out — nothing
      parses it, derives anything from it, or puts its parts in `client.fbs`.
      This is what keeps a later swap from *opaque-random-in-a-map* to
      *signed-and-self-describing* contained to one file instead of a wire
      change plus the frontend plus the harness. ⚑ A cross-machine split needs
      that swap, because a ticket minted on one process and redeemed on another
      cannot live in an in-memory map. `TicketStore`'s `Mint`/`Redeem` API is
      already the right shape for it; the usage discipline is the fragile half.
   3. **HTTP handlers depend on `store` + `auth` only, never on `core.Game` or
      the ECS world.** True today by construction — both packages import **zero**
      aura packages, and only `cmd/aurad/database.go` reaches for them. The
      tempting violation is `/select`'s live-session check, which the endpoint
      table already softens to *"a courtesy check; `Join` remains the
      authority"*. Keep it that way.

   ⚑ **The one known exception, recorded rather than designed around:** logout
   is specified to **end the live world session** for the account, which is a
   handler reaching into the running game. On a machine split it becomes either
   a small internal call or an accepted gap (logout revokes future tokens; the
   live socket dies on its own). Decide it *if* that day comes.

   ⚑ **A separate accounts DATABASE was considered and rejected** (PO
   2026-08-01) — see §10a's note. Short version: anonymous-first fuses account +
   credentials + character creation into **one transaction on the most common
   write in the product**, and `characters.account_id → accounts.id` is a
   foreign key Postgres cannot express across databases. The wanted isolation
   already exists one level down, at the `account_credentials` table split.
4. **2 — Frontend.** Character-select screen, the character-creation form's
   second mount, login/register forms, delete-confirmation dialog, HUD nag, and
   the ticket silent-retry — against the 1c API.
5. **3 — Wire.** The `Join`/character-selection connection (§8) — the only chunk
   that touches `client.fbs`: one `Join` field consuming 1b's TTL map. ⚑ It also
   carries the reconnect path checking *identity* rather than mere token
   possession, and the **atomic account-slot claim** that makes "one session per
   account" real.
   ⚑ **It carries a MINIMAL character read, and deliberately not the load path.**
   Once character-select exists, the name no longer arrives on `Join` — it has to
   come from the row — so chunk 3 reads `name`, `avatar` and `faction` and
   nothing else. Level, experience, spellbook, loadout and the quest ledger stay
   at their fresh-character defaults, which is exactly what a player gets today.
   Spawn position needs no read at all: `home_campfire_id` is NULL by design and
   falls through to the existing `defaultSpawnPosition()`.
   **Shipped alone it means: you log in, pick your character, and enter the world
   as that character.** Coherent and demoable — the same discipline as 1a.
6. **4 — Save & load.** The part persistence is actually *for*:
   implementation.md **§2** (the five save triggers), **§4** (snapshot mechanics,
   the field-by-field mapping, and the write transaction) and **§6** (the load
   path). Deliverable: **a character's progress survives a restart** — level,
   experience, spellbook, loadout slots and the quest ledger.
   ⚑ **Added 2026-08-01, because it was designed in full and owned by no chunk.**
   The original list — 1a schema, 1b auth, 1c endpoints, 2 frontend, 3 wire —
   named none of §2/§4/§6, and §8 above does not defer them either. That gap is
   exactly the kind that makes *"is step 8a done?"* unanswerable, which is why
   step 8 was split in the first place.

   **Why load and save belong in ONE chunk, rather than load riding along with
   chunk 3:** §4's field-by-field mapping is a single artefact and the two halves
   must agree on it exactly — a load/save mismatch is *the* classic persistence
   bug, and it is silent. Writing both against one reading of that table makes
   **round-trip the acceptance test** (snapshot → write → load → identical), and
   a round-trip test is only possible when both halves exist in the same chunk.

   ⚑ **The cost of the 3/4 split, stated so it is not mistaken for a regression:**
   between them there is a window where the *account* persists and the *progress*
   does not. A player creates a character, levels it, logs out and returns to a
   level-1 character of the right name. That is not worse than today — restarts
   already wipe everything — but it **looks** like persistence is broken to
   anyone testing it. Land 4 promptly after 3, and say so in the 3 ledger.

⚑ **`home_campfire_id` ships as a column nobody writes.** Populating it needs
the **anchor object identity** work — zone-editor-assigned UUIDs on campfires, an
`Id` on `CampfireAnchor`, and the player-bind value becoming `{Id, Pos}` instead
of a bare `phy.Vec2f` across ~10 read sites in `state.go` — which
`plan-accounts-schema.md` designs but places **outside 8a**.

**That costs nothing**, because of the spawn resolution ladder: NULL is a
legitimate persisted value that falls through to the existing
`defaultSpawnPosition()`. A persisted character spawns at a starting campfire —
**exactly what every player gets today** — and nothing regresses. Anchor identity
becomes a **later additive chunk** that starts writing the column: no migration,
no schema change, no rework. ⚑ The alternative — pulling it into 8a — drags the
zone editor and `zone.json`'s authored format into an accounts plan, which is a
content-pipeline change wearing a persistence costume.

**Password recovery is not a chunk here** — it is its own plan, sequenced after
all of the above, because outbound email is net-new infrastructure that would
otherwise gate everything.

---

## 10a. Chunk ledger

### Chunk 1b — auth & sessions ✅ DONE 2026-08-01, `31ebebcb`

Backend + docs. **Aura can tell who you are.** Still no HTTP surface and still no
game code touching it — the deliverable is that every auth primitive the eight
endpoints need exists, is unit-tested in isolation, and each one's failure mode
is pinned by a test that has been *proven to fail*.

**Shipped** — new package `backend/pkg/aura/auth/`:

| File | What |
|---|---|
| `password.go` | bcrypt hash/verify behind a **`Gate`**, **cost 11 stated explicitly**, `MaxPasswordBytes = 72`, and the constant-cost dummy compare |
| `credentials.go` | Username / password / character-name validation, the blocklist, the `hrnss_` rules, `RuleError` |
| `token.go` | HS512 issue/verify/refresh carrying the `gen` claim; `EnvJWTKey`, `TokenLifetime = 1 h [PLACEHOLDER]` |
| `ticket.go` | The play-ticket TTL map — CSPRNG, 256-bit, single-use, `TicketTTL = 30 s [PLACEHOLDER]`, keys stored SHA-256'd |
| `throttle.go` | Two-axis progressive delay, `0/1/2/4/8 … s` capped at 30 s, decaying after 15 min, **no lockout** |
| `sessions.go` | `SessionRegistry` — one live session per **account**, claimed atomically |

Plus `store/sessions.go` (`TokenGeneration` / `BumpTokenGeneration` + `ErrNoAccount`)
and six test files. **New dependency: `golang-jwt/jwt/v5 v5.3.0`**, which
declares `go 1.21` and so leaves the `go 1.22` floor untouched — `go.mod`'s
directive is unchanged. bcrypt needed nothing: `x/crypto` was already direct.

**The scoping question is ruled** — option A, written into §10 above: 1b builds
the registry **type**, chunk 3 wires it into `sys/state.go`.

**Decisions taken during execution:**

| Decision | Outcome |
|---|---|
| bcrypt cost | **11**, chosen against measurement rather than convention. Cost 10 (the library default) is 130 ms on the dev box, 11 is 263 ms, 12 is 526 ms. 12 is the usual recommendation, but half a second is already visible login latency and aurad answers logins **in the same process that runs a 30 Hz game loop** — every bcrypt is CPU stolen from the tick. 11 sits above the default, so the value is a decision rather than an inheritance. ⚑ **Re-measure on the VPS before 8a deploys** — see the capacity note below |
| Bounding that CPU — **added mid-chunk on a PO question** (*"will this slow the game down if many people sign in?"*) | **`auth.Gate`, a semaphore around every bcrypt call, `DefaultGateSlots = 2`.** The question was worth asking and the answer is measured: the game loop is a **single goroutine** that structurally **cannot use the second core** of the 2-vCPU box (`architecture.md` §1; measured peak 147 % of one core at ~60–70 clustered players), so **one hash is genuinely free** — it runs on capacity the loop could never spend. HTTP handlers share no lock with the loop, so a hash cannot *block* a tick, only compete for CPU. What is unbounded is *concurrency*: ⚑ **the throttle bounds attempts per IP and per account but never the global total**, and the first attempt from any pair is deliberately free, so N distinct sources each get one free hash. Two slots bound the worst case to a constant factor of tick slowdown instead of one that scales with arrivals. ⚑ **The Gate is the only route to bcrypt** — the package-level `HashPassword`/`VerifyPassword` are gone, so a handler cannot hash unbounded by forgetting something |
| ⚑ A second process or sidecar for auth — **considered and rejected**, recorded because it is the intuitive answer | **On the same VPS it changes nothing.** CPU is the shared resource and the OS time-slices across processes exactly as it does across goroutines; it would add IPC, a second Go runtime and a second GC for zero isolation. Real isolation needs a **different machine**, which contradicts the single-binary deploy (implementation.md §7: no second runtime, no second deployment artifact) and buys nothing at a login rate three orders of magnitude below the threshold |
| ⚑ The capacity number itself | Extrapolating cost 11 by the live box's measured **~3.4× slower** vCPU (`plan-intermission-triage.md`) gives **~0.9 s per hash there**, and roughly **0.5 sustained logins/sec** before logins start stealing from the loop at peak player count. Organic rate for a friends-and-family playtest is a handful per **hour**. ⚑ That extrapolation is from *loop work*, not from bcrypt — an estimate, not a reading. **Measure bcrypt on the VPS while provisioning it** and re-pick the cost factor against that, since 0.9 s is past "visible" and into "bad" |
| Does 1b touch the database at all | **Two queries, deliberately.** `TokenGeneration` / `BumpTokenGeneration` are the revocation primitive itself, not endpoint SQL. Without them `Verify`'s generation comparison has nothing real to compare against and *"a token whose account was erased is refused"* is an assertion nobody can make |
| Where the generation comes from | **A required argument to `Verify`, never a lookup inside it.** An API where the caller *could* forget the comparison is one that eventually gets called by someone who did — and forgetting it turns silent refresh into an immortal session |
| Durations as constructor parameters | `NewKeys` / `NewTicketStore` / `NewThrottle` take their lifetimes; the decided values are exported constants 1c passes in. It buys the expiry tests: a negative lifetime mints an already-expired token, and a 10 ms decay window tests the throttle's 15 min one — no clock injection, no `time.Now` seam, no sleeping for a quarter of an hour |
| Character-name **charset** | **Deliberately NOT invented.** Length (3–20), surrounding whitespace, control characters and the `hrnss_` rule are enforced; composition is left open, so `Barney Rubble` and `M'reth` pass. No plan rules it, and quietly imposing `[A-Za-z0-9_-]` would be a design decision wearing a validator's clothes. ⚑ **Flagged for 1c/the PO.** The 20 promotes `sys/state.go`'s existing silent truncation into an error — same reasoning as the 72-byte password ceiling |

**Six mutation runs, because a test that cannot fail is decoration.** Every
load-bearing assertion was proven by breaking the code under it and watching the
test go red:

| Mutation | Caught by |
|---|---|
| Drop the dummy bcrypt compare | the timing test — `0s` vs `264 ms` |
| Consult the blocklist without stripping trailing punctuation | 6 rows of the password table, `password!` first |
| Skip the `token_generation` comparison | the stale-generation test **and** the refresh-refusal test |
| Trust the token's own `alg` header | the HS256-forgery row |
| Check-then-set instead of an atomic claim | `TestClaimIsAtomic` — **2 grants where 1 is allowed** |
| Redeem without burning the ticket | the single-use test |
| Remove the gate's bound | `TestGateBoundsConcurrency`, all three slot counts |
| Drop the gate's early context check | the refusal test, **2 runs in 5** — see below |

⚑ **The gate's context check is a defect the test found, not a rule someone
remembered.** `do` originally left the decision to a bare `select` over "a slot
is free" and "the context is done" — and when both are ready, Go picks at
random, so a caller who had already gone away still burned a hash about half the
time. That is precisely the CPU the gate exists to protect. It now checks
`ctx.Err()` first, and mutation confirms the difference is a coin flip rather
than a theoretical one.

⚑ **The `alg` run corrected a wrong assumption, and the fix went into the test's
comment.** Deleting `WithValidMethods` leaves the **alg-none** forgery still
rejected — golang-jwt refuses `SigningMethodNone` unless the keyfunc explicitly
opts in — while letting the **HS256** forgery straight through. So the two rows
are not two views of one guard: the HS256 row pins aura's algorithm allowlist,
the alg-none row pins a library behaviour aura depends on but does not own.

**Traps closed, each structurally rather than by discipline:**

- **The timing oracle lives inside `VerifyPassword`, not in the caller.** An
  empty hash means "no such account" and still costs a full bcrypt round. The
  login handler cannot forget the rule because there is no rule to remember —
  pass the hash you found, or `""` if you found none.
- **The dummy hash is a literal, guarded by `TestDummyHashMatchesCost`.**
  Computing it at init costs a bcrypt round on every process start; the risk that
  trades against — someone raises the cost and leaves the literal behind, quietly
  restoring the oracle with every test still green — is closed by asserting
  `bcrypt.Cost(dummyHash) == bcryptCost`.
- **The ticket's character binding is structural.** The character id comes *out*
  of the ticket and `Join` carries no character field, so "a ticket for A cannot
  join as B" is not a comparison anyone could omit — there is nowhere to say B.
- **Play tickets are stored SHA-256'd even in memory.** Same rule as the token
  columns: a heap dump or a stray debugger session then yields nothing
  redeemable, at the cost of one hash per lookup.
- **`Throttle.Wait` carries the ordering warning at the point of use** — after
  the bcrypt compare, never instead of it — because that is where whoever
  reintroduces the oracle will be reading.

**Verified.** `go build ./...` · `go vet ./...` · `gofmt` clean ·
**full suite 30/30 packages** (29 + the new `auth`), green **both** with
`AURA_TEST_DB_URL` set and with it unset · store + auth at **`-count=2`** ·
boot with `AURA_DB_URL`: schema version 1 `dirty=false`, then **0 errors 0
warnings**, 15 factions / 86 skills / 64 mobs / 4 quests / 777 props / 485
spawns. ⚑ **`-race` cannot run on this dev box** — it needs cgo and there is no C
toolchain — so `TestClaimIsAtomic` counts grants instead of leaning on the race
detector, and was mutation-checked to confirm it fails without it.

**Harness gate: no browser harness owns this chunk.** No client code, no game
logic, no content and no wire change — nothing the 17 scripts assert can have
moved. Boot verification stands in. Stated rather than assumed, per the gate's
own rule. The first harness script for accounts arrives with chunk 2, and §11's
"harness accounts" recipe is what it starts from.

### Capacity: what 100 concurrent players would actually cost (PO question, 2026-08-01)

Asked during the chunk and answered against `devops/loadtest.md`'s measured
break-ramps rather than by extrapolation. **Recorded because the conclusion is
counter-intuitive and because two of its supporting properties are easy to
delete by accident.**

**Auth is not the constraint at 100 concurrent — the game loop is, and it is
already measured to break there.** Live box, real instrumented bots, clustered,
target 30 snap/s:

| bots | Damage L1 | max build |
|---|---|---|
| 60 | **30.0** | 24.2 |
| 80 | 27.9 | 13.6 |
| **100** | **18.2** | **9.2** |
| 140 | 9.8 | 4.4 |

**Dispersed, 120+ held a full 30 Hz and the ceiling was never reached.** So 100
concurrent is comfortable spread out and broken clustered; the wall is named in
that doc as **single-threaded per-player GameState encoding**, and CPU never
saturated the 2-vCPU box in any run.

**Auth against that:** ~100 fresh logins/hour at 100 concurrent is 0.028/s ×
~0.9 s ≈ **2.5 % of one core**, and the gate's ceiling is ~2.2 logins/s
(~8,000/hour) — roughly 80× the demand.

⚑ **The two properties that make it that cheap, both breakable:** a **reconnect**
presents the JWT cookie to `/select` (HMAC, microseconds), so a post-deploy herd
of 100 reconnects does **no hashing**; and an **anonymous** player presents a
SHA-256 lookup key, not a verifier, so under an anonymous-first design most
players never reach bcrypt at all. Requiring a password on reconnect, or
"hardening" `anonymous_secret_sha256` to bcrypt, would each turn a free path into
a hashing one. Pinned in the comment on `auth.Gate`.

⚑ **A correction that belongs on record: "one hash is free" was too strong.** The
second core is not idle under load — the measured 147 % peak decomposes as
roughly `loop 1.0 + websocket write goroutines 0.47`, leaving ~0.53 cores spare.
A hash is close to free at idle and moderate load; at the break point it
oversubscribes the box by ~20 % for its duration. That is what the gate bounds.

**Persistence at that scale was already sanity-checked** — implementation.md §4:
100 players on a 5-minute autosave is *one write per 3 seconds*. The half that
runs inside the tick (snapshot now, write later) is ~one snapshot per 90 ticks
against an encoding pass that already runs 100× per tick. ⚑ `MaxConns = 10`
stays a [PLACEHOLDER] worth re-checking if autosave ever becomes synchronous
per-player.

**What would actually have to change for a sustained 100** is in
`devops/loadtest.md` §"The wall": a faster single-core VPS → pooled/reused
FlatBuffers builders and no re-encoding of static skill data → delta/shared
snapshot encoding. None of it is auth or persistence work, so **8a needs no
change for a 100-player target**. ⚑ Worth noticing that the cheapest lever —
a faster single core — is the same lever for both problems: it raises the player
ceiling *and* drops bcrypt from ~0.9 s toward the 0.26 s measured on the dev box.

---

### Considered and rejected: a separate accounts & auth database (PO 2026-08-01)

Raised as *"isn't it cleaner for the future, and we could even do it now?"* — a
fair instinct (a separate auth database is standard in larger systems) and the
timing argument is real, since nothing is deployed and the database is
disposable. Rejected on three specifics, all of which are properties of **this**
design rather than general objections:

1. ⚑ **Anonymous-first fuses account creation to character creation.**
   Implementation.md §0 names three transaction sites and the first is
   *character creation (accounts + credentials + characters)* — one atomic write
   across all three tables, and under anonymous-first it is **the most common
   write in the product**, since every new player mints an account behind them.
   That fusion is deliberate: it is what makes "registering later never costs
   progress" true. A database boundary cuts straight through it and turns the
   hottest path into a distributed transaction (2PC, whose unresolved prepared
   transactions block vacuum and hold locks, or a saga with compensating writes).
   ⚑ **In a conventional register-then-create-a-character design this cost does
   not exist** — those are two transactions and the split is cheap. Aura's flow
   is what makes it expensive.
2. **Two foreign keys cannot survive it, and one is the schema's spine.**
   Postgres has no cross-database FKs, so `characters.account_id → accounts.id`
   and `bloodline_unlocks.account_id → accounts.id` would become application
   code — the exact class of invariant this plan deliberately pushed into the
   database (§11's reasoning for the slot cap: the invariant *is* the database).
3. **Backup/restore doubles and gains a requirement it does not have today.**
   §8 makes "a backup that has never been restored is a hypothesis" a principle;
   two databases means two runbooks **plus** restoring both to a consistent
   point in time, or characters point at accounts that do not exist with no FK
   left to catch it. One `pg_dump` gives that consistency for free.

**And it buys less than it looks like.** The isolation actually wanted already
exists one level down: `account_credentials` is a separate TABLE precisely so
game-path queries never read password material (§"Credential isolation",
shipped in 1a). A second database adds ops surface, not security. It also does
nothing for CPU isolation, which is a *machine* question, not a database one.

⚑ **The reframe that decided it: the costs of a split database here are RUNNING
costs, not migration costs.** Doing it early buys down only the one-time part.
Not splitting and never needing it costs nothing; splitting and never needing it
costs FK enforcement, a distributed transaction on the most common write, and
doubled ops for the life of the project. Splitting *later*, if the day comes, is
a contained migration — drop two FKs, convert one transaction to a saga — done
with knowledge of why.

**Middle option, offered and not taken: two SCHEMAS in one instance**
(`auth.*` + `game.*`). Cross-schema FKs and transactions work fine, so it keeps
everything above while making the boundary visible in every query, and it is
nearly free. Judged mostly aesthetic: it pre-solves the *easy* half of a future
split (renaming tables) and nothing of the hard half. ⚑ Note the plan already
considered an `auth`+`game` schema split once and dropped it — for the unrelated
reason that it existed only to bridge to the rejected external Java service
(implementation.md §7).

---

⚑ **Warning that arms in chunk 3:** never hold a lock the game loop needs across
a bcrypt call or a database query. Nothing does today — HTTP handlers and the
loop share no mutex — but chunk 3 wires `SessionRegistry` into
`ConnectionStateSystem`, which is the first structure both touch. The gate
bounds CPU contention; it does nothing about a lock held across 0.9 s of hashing.

**Plain-language summary for humans:** `docs/accounts/chunk-1b-summary.html`.

**Left for 1c, flagged here so it is not rediscovered:** `AURA_JWT_KEY` is
**read by nothing yet** — `EnvJWTKey` is declared and `NewKeys` validates a
secret's length, but the process never reaches for the variable, because 1b has
no endpoint to sign anything for. 1c wires it, and that is also where the
*unset* `AURA_DB_URL` warning becomes a hard boot failure, and where the
`CheckOrigin` allowlist + specific-origin CORS land with the first credentialed
request (backlog §43).

---

### Chunk 1a — schema, migrations & the connection layer ✅ DONE 2026-07-31, `6d5cc695`

Backend + docs, 8 files. **Aura has a database.** No game code touches it, which
is the point: the deliverable is that the foundation round-trips *before*
anything depends on it.

**Shipped** — new package `backend/pkg/aura/store/`:

| File | What |
|---|---|
| `store.go` | `Open()` → `pgxpool`, `MaxConns = 10 [PLACEHOLDER]`, `Ping` with timeout, `EnvURL`/`EnvTestURL` constants, connection-string validation |
| `migrate.go` | `go:embed migrations/*.sql`, `Migrate()` / `Rollback()` via `iofs` + the `pgx5` driver, dirty-state recovery hint |
| `migrations/000001_accounts_and_characters.{up,down}.sql` | The whole `game` schema — 8 tables, both indexes, every CHECK and composite FK |
| `store_test.go` | 10 tests; `t.Skip` without `AURA_TEST_DB_URL` |

Plus `cmd/aurad/database.go` and three lines at `cmd/aurad/aurad.go:62`.

**Constraint compliance.** ⚑ `token_generation` shipped here, not with the reset
plan — it is the revocation primitive and 8a builds logout + silent refresh.
⚑ `CREATE EXTENSION citext` is in migration 001, so a fresh database is
reproducible from migrations alone; the down migration drops it too, which is
what makes the round-trip land on a genuinely empty database. ⚑ §"The quest
ledger" was re-read against the shipped code — see defect ③.

**Three defects, two of them ours, all red-proven before fixing:**

1. **The DB password could leak into the boot log.** pgx redacts it in its own
   message (`xxxxxx`) but wraps a `net/url` error carrying the raw connection
   string verbatim, so one mistyped setting writes the password to disk.
   `store.Open` now pre-validates via `parseURL` and never echoes input.
2. **A failed migration bricks every later boot, misleadingly.** golang-migrate
   marks `dirty` *before* running and clears it after, so a failure leaves the
   flag set **while the DDL has rolled back** — the database then shows *no
   schema at all*, which reads as "migrations never ran". `Migrate` now appends
   recovery SQL to that error. Hit for real during the chunk (a BOM broke the
   SQL), which is why the hint exists.
3. **A defect in this plan set.** The schema doc named **two** fields per quest
   where the shipped `quests.Progress` has **three**. `Running` is independent:
   `Ledger.Accept` permits re-accepting a *completed repeatable* quest, giving
   `Running && Completed` at once. Today it is redundant only because nothing
   authors `repeatable: true`; deriving it would silently drop a live run the
   first time content does — a failure appearing in content long after the code
   that caused it. `plan-accounts-schema.md` is corrected, with the persist-if
   rule (`Running || Completed`, matching `Snapshot()`).

**Decisions taken during execution:**

| Decision | Outcome |
|---|---|
| Library versions | `go.mod` **stays at `go 1.22`** (PO-ruled) ⇒ **migrate v4.17.1 + pgx v5.6.0**, verified against the live **PG 18.4** before adoption. ⚑ `rogpeppe/go-internal` pinned to v1.12.0 purely so `go mod tidy` does not fail at that floor. ⚑ **`go mod tidy` raised the go directive 1.22 → 1.25 unasked** — use `go mod tidy -go=1.22` |
| Unset `AURA_DB_URL` | **Warns and continues.** §8's "refuse to start" is about not presenting a healthy-but-unusable server; nothing can log in yet, and hard-requiring it would break every harness script on a machine without Postgres. ⚑ **1c must flip this**, flagged at the decision site. A *configured-but-unreachable* database is already fatal |
| One migration file or several | One. These tables are created together and no subset is meaningful alone |

**Verified.** `go build ./...` · `go vet ./...` · **full suite 29/29 packages** ·
store tests at **`-count=2`** (they share a real database, so residue would show)
· they **skip cleanly without `AURA_TEST_DB_URL`** · boot **both ways**: without
a DB it warns and runs; with one it applied version 1 (`dirty=false`) then **0
errors 0 warnings**, 15 factions/86 skills/64 mobs/4 quests/777 props/485
spawns/5 campfires. ⚑ **Boot without a DB now emits 1 deliberate WARN**, so the
standing "0 errors 0 warnings" check means *with* `AURA_DB_URL` set.

**Harness gate: no browser harness owns this chunk** — no client code, no game
logic, no content changed, so nothing the 17 scripts assert can have moved. Boot
verification stands in. Stated rather than assumed, per the gate's own rule.

**Pre-existing, found not fixed.** ⚑ `backend/pkg/api/mobs/.gitignore` holds
`*.json`, so the embedded mob content is **untracked** — alone among all 8
content types (0 tracked vs 64 on disk). A fresh clone therefore cannot run
`go test ./...` green until someone builds; this machine's copies also predated
C4, leaving **7 quest content tests red at HEAD** before the chunk began (fixed
locally by `cp-defs`). ⚑ **`make` is not installed on this machine** — run the
`cp-defs` target's two lines by hand. Also: local `conf.json` names no zone, so a
bare `./aurad` needs `-zone world`.

**Environment fix.** `AURA_DB_URL`/`AURA_TEST_DB_URL` had to be
**percent-encoded**: psql's parser is lenient, Go's `net/url` is not, so a
connection string that works by hand is rejected by the server with
`invalid userinfo`. The encoder one-liner and a "connect from Go, not psql"
fifth verification check are now in `plan-accounts-implementation.md` §0.

**Plain-language summary for humans:** `docs/accounts/chunk-1a-summary.html`.

---

## 11. Test strategy

⚑ **Backend DB tests need a real Postgres, and the repo has none today.** This
is not incidental: the slot cap is enforced by a **partial unique index**, so the
invariant *is* the database — a mock or an in-memory fake would test the mock,
not the rule.

**A disposable local test database** (`aura_test`), with DB-touching tests
calling `t.Skip` when it is absent, so `go test ./...` still passes on a machine
without Postgres. That matches the existing precedent in
`pkg/aura/net/net_test.go` (skip rather than fail) and avoids adding a Docker
dependency to the suite. Rejected: testcontainers (slower, needs Docker) and
skipping DB tests entirely (leaves the core invariant unverified).

**Backend (Go):**

- Table-driven tests for slot assignment + cap enforcement (create at cap →
  rejected; the slot-scoped unique index rejects a second alive occupant).
- The soft-delete transaction (name release, `deleted_at` set, chain untouched).
- The orphan-discard logic (§6) against both the empty and has-progress cases.
- **Case-insensitive uniqueness** (`Bob` cannot register over `bob`; same for
  character names), and **password hashing/verify round-trips**.
- The **"already logged in" rejection** including its reconnect exemption — the
  half most likely to regress silently, since a broken exemption looks like a
  working guard. ⚑ **Test the rejection across *different* characters of the
  same account**, not just the same character twice: the scope is per-account,
  and a per-character implementation passes the same-character test while letting
  a player run all three at once. Also assert the **atomic claim at `Join`** —
  two valid tickets presented concurrently must yield exactly one live session.
- **Play tickets**: single-use (a second presentation fails), expiring, and
  **bound to their character** (a ticket for character A cannot join as B) — the
  last is the whole point of the mechanism and the easiest to omit.
- **Refresh**: a valid JWT renews; a JWT whose account was logged out, erased, or
  `token_generation`-bumped is **refused**. ⚑ Test the refusal, not just the
  success, or "silent refresh" silently becomes "immortal session".
- **Password rules**: table-driven validator test including the blocklist's
  trailing-punctuation case (`password!` must fail as surely as `password`).

**Frontend (vitest)** — pure logic, no DOM, matching the existing
`SkillTooltip.ts` precedent:

- The "is this anon account empty" predicate (§6), the cooldown timer, and
  token-storage read/write.
- **Ticket retry**: an expired-ticket refusal triggers **exactly one**
  re-`/select` and then connects; a second failure routes to character-select
  rather than retrying again. ⚑ The loop guard is the part worth pinning — the
  happy path and the give-up path are both obvious, and an unbounded retry is the
  failure that would only show up in production.

**In-game (`verify` skill):** a scripted pass through create → logout → login →
character-select → delete, same style as `chunk3b-interact.mjs`.

⚑ **The existing harness has no patterns for any of this.** All 17 scripts open
`?token=plz&wsUrl=…` and are *already in the world* — page load to playing in one
step, because there is nothing to get past. They then assert against the **PixiJS
scene graph**. Every screen in this plan is *pre*-game and ordinary **DOM**, so
the first script here establishes a new category rather than extending one.

### Harness accounts (designed 2026-07-31, so the first script has a recipe)

Four mismatches with the existing suite, and how each is answered:

| Mismatch | Answer |
|---|---|
| No `?token=` shortcut past login | Fixed, reserved harness accounts (below) |
| Assertions are DOM, not scene graph | New, unavoidable — the category cost |
| ⚑ **State now outlives the run** | Delete-then-create, below |
| "Second login rejected" needs two browsers | Two numbered accounts, `hrnss_01` / `hrnss_02` |

**Reserved names, not merely unlikely ones.** Harness accounts and characters use
the prefix **`hrnss_`**. Registration rejects it outright, and character creation
allows it **only for an account whose username already carries it** — the exact
rule is in implementation.md §7, and it is stated carefully because the obvious
version ("just reject the prefix") would also stop the harness creating its own
characters. Collision with a real player becomes impossible rather than
improbable; "unlikely" fails eventually, and it fails as a baffling harness error
months later.

⚑ **The harness accounts are seeded directly into the dev/test database**, since
the registration endpoint refuses the name by design. A dev seed script, not a
migration — they must never exist in production.

⚑ **The state problem is the real one.** Existing scripts run against a world
that resets on restart, so runs cannot contaminate each other. After 8a a script
that creates a character leaves a **database row** — and character names are
globally unique, so a naive script that creates `hrnss_01_a` works **exactly
once** and fails forever after.

**Delete-then-create solves it using only endpoints that already exist**, because
soft-delete releases the name *immediately* (§7):

```
harness setup:
  login as hrnss_01                    (credentials from env, never the repo)
  GET  /api/characters
  for each returned row → POST /api/characters/{id}/delete
  POST /api/characters {name: "hrnss_01_a"}
  → a pristine character, identical every run, idempotent
```

Pristine matters: several existing scripts assert things like *"the spellbook is
empty"* or *"XP goes 0 → 70"*. A merely-reused character carries the previous
run's level and unlocks, and those assertions rot after the first run.

⚑ Accepted cost: soft-deleted rows accumulate, one per character per run. They
are inert history and tiny; no cleanup job is planned.

**Two rules that are not optional:**

- **Credentials come from environment variables** (`AURA_HARNESS_PW` or
  similar), never the repo — same rule as `AURA_DB_URL`.
- ⚑ **The harness must never point at production.** A reserved account existing
  there is a standing liability, and the delete-then-create loop is destructive
  by design.

---

## 12. Related finding: the disconnect-to-escape exploit

**Pre-existing, and NOT fixed by this plan.** Disconnecting is a free escape from
any danger today, and it predates persistence — but it becomes a real design
problem the moment step 8 gives players something to protect (levels, unlocks,
the sacrifice chain), so it is recorded rather than dropped.

**The mechanism, traced through the code:**

- `core/net.go:93` — the instant a WS connection drops, the server calls
  `game.RemoveEntity(p.Basic())`.
- `core/game.go:240-243` — that is a **full** removal: deleted from the entity
  registry and from `ecs.World`, cascading to every system (physics/collision,
  aggro sensors, targeting) via their own `Remove()` callbacks. Only bookkeeping
  survives, in `reconnectStash` (`state.go:60-78`) — name, HP, position, skills —
  for up to 10 minutes (`reconnectStashTTLTicks`, `state.go:58`).
- `mob/mob.go:1047-1053` — a mob only holds aggro without contact for
  `leashCountdownTicks` (90 ticks ≈ 3 s) before giving up and wiping its threat
  table.

**Net effect:** disconnect mid-fight → the body vanishes from the world on the
very next tick, untouchable → the aggroed mob leashes off within ~3 s →
reconnecting drops the player back at their last position, undamaged further and
usually already un-aggroed. Strictly better than fighting or fleeing on foot, and
free — no death, no XP loss, no cooldown.

**Not this plan's to fix** — it is a combat/connection-layer issue, and fixing it
does not require accounts to exist. Flagged here because step 8 is what raises
the stakes enough to make it worth fixing.

The standard MMO answer is a **combat-tagged disconnect**: if the player is in
combat at disconnect time, don't remove the entity immediately — leave a
vulnerable, unresponsive body in the world for a short grace window before
despawning it (WoW's ~20 s "logged out" ghost is the reference pattern).
⚑ `inCombatTicks` already exists (`mob.go:446`) but is the *mob's* combat flag;
the player side would need its own analog. Not scoped or estimated here — a
candidate for `docs/backlog.md` when someone picks it up.
