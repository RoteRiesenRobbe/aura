# Aura — Persistence frontend: login, character-select & the anonymous-first flow

What the player actually clicks through, from a cold page load to being in the
world and back out again. Companion to `plan-accounts-schema.md` (the DDL) and
`plan-accounts-implementation.md` (save/load mechanics, auth, transport).

**Docs-only plan, no code yet.** All numbers below (max alive characters,
cooldown seconds) are placeholders per the project convention.

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

1. **1a — Schema & migrations. ✅ DONE 2026-07-31, `[uncommitted]`** — see the
   ledger below. The whole `game` schema (accounts, credentials, characters,
   bloodline unlocks, child tables, `audit_log`), `golang-migrate` wired **as a
   library** to run at boot with the SQL `go:embed`-ed, the `pgx/v5` + `pgxpool`
   connection layer, and the disposable `aura_test` database from §11.
   Deliverable: migrations apply to an empty database and roll back cleanly. No
   Go game code touches it yet. ⚑ Includes `token_generation`.
   ⚑ **Read implementation.md §0 first** — driver, pool, query style and where
   Postgres runs are all decided there, and this chunk is the first consumer of
   every one of them.
2. **1b — Auth & sessions.** bcrypt hashing, JWT issue/verify including the
   `token_generation` claim, the play-ticket TTL map, the account-scoped live
   session registry, and the failed-login throttle (⚑ the delay applies *after*
   the dummy bcrypt comparison, or it reintroduces the timing oracle). Pure Go
   with unit tests, no HTTP surface yet.
3. **1c — The eight endpoints.** Character CRUD, register/login/logout,
   `/select`, `/session/refresh`, plus slot assignment and cap enforcement.
   **CORS and the `CheckOrigin` allowlist land here**, since this is where the
   first credentialed request exists.
4. **2 — Frontend.** Character-select screen, the character-creation form's
   second mount, login/register forms, delete-confirmation dialog, HUD nag, and
   the ticket silent-retry — against the 1c API.
5. **3 — Wire.** The `Join`/character-selection connection (§8) — the only chunk
   that touches `client.fbs`: one `Join` field consuming 1b's TTL map. ⚑ It also
   carries the reconnect path checking *identity* rather than mere token
   possession, and the **atomic account-slot claim** that makes "one session per
   account" real.

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

### Chunk 1a — schema, migrations & the connection layer ✅ DONE 2026-07-31, `[uncommitted]`

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
