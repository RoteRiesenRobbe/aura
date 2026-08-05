# Plan: Ascension — the character-sacrifice loop

> **Status: DESIGNED 2026-08-04, SCOPE CUT 2026-08-05 (D13), CODE-REVIEWED
> 2026-08-05 (D15–D17) — no chunk built.**
> The execution-order item "character-sacrifice loop" (GDD §5 meta-progression,
> pulled into v1 by the 2026-07-19 intermission-triage ruling, item 10), opened
> as persistence's first consumer. Every number is [PLACEHOLDER] unless marked.
>
> ⚑ **Read §10 before reacting to anything you remember about this plan.** The
> 2026-08-04 design had a point economy; **D13 cut it.** Three rulings (D2, D5,
> D6) were superseded and now live in §10 only — the body of this document
> describes what gets built, nothing else.
>
> ⚑ **Schema impact: NONE. No migration.** Verified against the shipped
> `000001` DDL (§5), not reasoned.

## 1. What this is

A max-level character can be **ascended** ("sacrificed" in old GDD language) at
a fixed world site. The character is permanently retired, and in exchange the
player **picks one skill from a curated list** — a **bloodline-scoped** unlock
that every future character in that slot starts with. The loop is the GDD's
living-starting-zone engine: voluntary, rewarding restarts.

**In v1 that is the entire reward mechanic.** Reach max level, walk to the
stone, pick one, ascend. No points, no roll, no gates, no measure of how well
the life went — those are §8 layers, deferred but explicitly not blocked.

Inputs, all read during the design session:

- **GDD §5 "Meta-Progression: Character Sacrifice"** — the previously decided
  design. This plan amends it in **two** places (§3): the power rule (D1) and
  account→bloodline scoping (D3). Its "choose one reward from a curated
  catalog" sentence describes v1 exactly and stands untouched.
- **Discord thread PO ↔ Antiterra 2026-08-03** — the lore framing, the
  per-faction ascension idea, the Populous ascension-video reference, and the
  three acquisition options (random roll / point buy / feat gates). **v1 takes
  none of the three** (D13).
- **`backlog.md` §36** (three slots, three bloodlines) — ratified; its
  sub-questions are answered in §4/§9.
- **`docs/plan-camps.md`** — its D4/D8 make camp membership an eventual gate on
  ascension rituals, and its **L0 lands one requirement inside this plan**:
  camp standing must be named in the loss scope (§4.8) and in C1.
- **Shipped machinery this plan consumes:** `game.bloodline_unlocks`
  (insert-ready since migration `000001`), `characters.slot_index` /
  `previous_character_id` / `sacrificed_at` + the sacrificed⊕deleted CHECK, the
  graveyard convention (names held forever), persisted spellbook/loadouts, the
  milestone seeding path (Damage@L1 at creation — ⚑ as a *shape*, not a
  mechanism; D16), the interaction container (`teach_skill`'s siblings — ⚑
  static trees only until C2's dynamic row source; §4.2), the cast/channel
  path (a near-exact fit; §4.5), and the character-creation flow from
  `plan-accounts-frontend.md` (⚑ amended by D15 — slot becomes
  client-chosen).

## 2. Decision ledger — the rulings that govern what gets built

D1–D12 taken 2026-08-04 as choice prompts across three rounds; **D13 taken
2026-08-05 as a direct PO instruction**, **D14** the same day as the one choice
prompt D13 created. **D15–D17 taken 2026-08-05 in the code-review pass** — the
review verified every reuse claim against the shipped code and these three are
the decisions it forced. ⚑ **D2, D5 and D6 are absent on purpose** — superseded
by D13, retained in §10. Numbering is not reused.

- **D1 — power rule: WORLD-PARITY.** Replaces GDD §5's "breadth, never power"
  rule and its "explicitly forbidden" list. *Every ascension reward must sit at
  a power level also obtainable in the world — variations of existing content
  (e.g. the same companion dealing a different damage type), cosmetics, or
  unique combinations; never a strict upgrade.* Accumulated breadth across
  loops MAY make a veteran stronger than a never-ascender — power is the point,
  to a degree. No individual reward may outclass world content. (The
  SWG-Hologrind rationale survives in weakened form: ascension must never be
  the only road to a power level.) ⚑ `plan-camps.md` D1 reuses this verbatim,
  so the two systems share one calibration sentence.
- **D3 — bloodline-wide, not account-wide.** Backlog §36 ratified; GDD §5's
  load-bearing word flips. Matches the shipped `bloodline_unlocks` shape
  (`account_id, slot_index, unlock_key`).
- **D4 — lore framing: "Ascension", positive.** Closes the GDD §12 open
  question (sacrifice vs. sending away). Site and environment belong to the
  world pass — the druid-stones "The Passing" sketch is the leading candidate,
  not locked.
- **D7 — the choice lives at the stone.** Dialog → the list of skills this
  bloodline can still learn → pick one → confirm → ceremony → character
  creation. There is no reward screen anywhere else in the game.
- **D8 — bloodlines are emergent, not authored.** A bloodline IS its
  accumulated unlocks plus its graveyard names. No chosen-lineage content. The
  per-faction ascension idea stays a sanctioned later layer (`plan-camps.md` is
  what will unblock it) — the data model must not block it, which is why the
  site is an interaction container (§4.1).
- **D9 — v1 catalog: variant skills only, small seed.** ~5–10 entries
  [PLACEHOLDER]: damage-type variants of world abilities, plus at least one
  unique combination. ⚑ **D13 promotes this from a content detail to the entire
  length of the meta-progression** — see D14.
- **D10 — ceremony = an in-world sequence built from existing vocabulary.**
  Channel at the stone, growing aura/light VFX, dissolve upward, → character
  creation. Skippable. A Populous-style video stays a sanctioned later upgrade.
- **D11 — memorial monument is in v1, simple version.** A prop in the starting
  zone; interacting lists ascended names (a graveyard query — the *data*
  already exists, and so does its index, but the review confirmed **no query
  or view exists anywhere**: "a graveyard view that does not exist and is not
  scheduled" — C3 writes the first one). ⚑ Display scope (all names vs.
  per-bloodline grouping) is an §8 open question; the GDD's intent is one
  shared monument every player sees. ⚑ **Privacy landmine for that query:**
  `DiscardAnonymousAccount` renames **every** row of the account to
  `'deleted_' || id`, sacrificed ones included (names are player-authored free
  text; erasure wins) — the memorial must filter those out or it lists
  `deleted_4711`.
- **D12 — discovered-location state is per-character.** ✅ **Already honoured**:
  fast travel shipped 2026-08-05 and its own D10 ruled discovery per-character,
  so `game.character_campfires` is keyed `character_id` and the wipe is
  structural (§4.8). Nothing for C1 to build.
- **⭐ D13 — v1 ascension is ONE PICK FROM A LIST OF SKILLS, and that is the
  entire reward mechanic.** No random roll, no point economy, no feat gates.
  Reach max level, walk to the stone, pick one entry, ascend. ⚠ The thread
  called feat gates "milestones" — that word stays reserved for
  `api/milestones/` **level** unlocks (P3), which this ruling does not touch.
  **Nothing is blocked:** point buy and feat gates remain sanctioned later
  layers (§8), and the catalog format carries a nullable gate/price field from
  day one so adding them is data, not rework (§5).
  ⚑ **Why the cut is cheap, in one chain:** no points → no scoring → no
  `rarity` authoring → no banked balance → no `game.bloodlines` table → **no
  migration at all**, and no inflation vector, so the anti-inflation rule is
  *deleted* rather than deferred.
- **D14 — an exhausted catalog does not block ascension.** One free pick per
  life with no duplicates (P4) spends a 5–10 entry catalog in 5–10 ascensions.
  Every ascension past that still runs — fresh start, memorial name, succession
  chain — the dialog simply says this bloodline has learned everything it can
  teach. **Zero code:** the pickable list is a filter that may legitimately come
  back empty, and the pick step is skipped, not refused. ⚑ It is also the
  honest pressure signal for growing the catalog later.
- **D15 — the heir's slot is CLIENT-CHOSEN at creation.** The shipped rule is
  the opposite and would break succession: `lowestFreeSlot` assigns
  server-side, `NewCharacter` documents slot as "never client-chosen", and the
  select screen offers the create card only on the *first* empty slot — so
  ascending slot 2 while slot 0 sits empty would put the heir in **slot 0, cut
  off from its bloodline**, with no way to aim at slot 2 at all. C1 extends
  the create API with a validated `slot_index`; C2 puts a create card on
  every empty slot. ⚑ This is also what makes §36's "three slots, three
  bloodlines" navigable: a player can deliberately continue any bloodline, or
  start a fresh one while a sacrificed slot waits.
- **D16 — bloodline unlocks are seeded at JOIN, carried on the auth ticket.**
  "The same seeding path as Damage@L1" is a *shape*, not a mechanism — the
  milestone seed is a server-global config table applied in `player.New`,
  which takes nothing character-specific. The seam that exists is the ticket:
  `/select` already runs off-loop with DB access and bakes `ticket.State`, so
  it resolves the slot's `bloodline_unlocks` to skill ids there; `player.New`
  applies them right after `applyCreationMilestones` (Discover + cascade,
  idempotent — reapplying on every join until the first save persists them is
  harmless). ⚑ The rejected shape — spellbook rows written at creation — has a
  verified trap: `restoreCharacterState` *merges* (never clears), but its
  empty-spellbook early return is the only thing protecting the creation seed's
  active aura; a non-empty spellbook makes it run `SetActiveAura(NoActiveAura)`
  and the successor boots with the starting Damage aura equipped but OFF.
  `bloodline_unlocks` stays the single durable truth; the spellbook rows are
  derived state, materialized by the first save.
- **D17 — `unlock_key` = the skill's NAME.** No second namespace: catalog
  entries reference skills by their unique, pinned-never-reused CamelCase name
  (exactly how `milestone-unlocks.json`'s `skillName` resolves), and the
  `bloodline_unlocks` row stores that name. The column is TEXT while the
  spellbook keys by int id, so *some* string mapping had to be ruled; this one
  adds nothing to keep in sync. Future non-skill rewards (§8 cosmetics etc.)
  bring their own key strings — TEXT accommodates.

## 3. GDD & backlog amendments this plan carries

Applied as chunk C0 (docs-only), so the GDD stays the single source of decided
design:

1. **GDD §5** — rewrite the reward paragraphs: the world-parity rule (D1)
   replaces "breadth, never power" and the forbidden list; "account-wide" →
   "bloodline-wide" (D3); the loss-scope ⚑ resolved per §4.8; "sacrifice"
   language → "Ascension", with a note that the old term survives in schema
   column names. ⚑ "Choose one reward from a curated catalog" **stays as
   written** — D13 restored it.
2. **GDD §12** open list — strike "Lore: sacrifice vs. sending away?" (D4) and
   the loss-scope line (resolved here).
3. **`backlog.md` §36** — mark ratified → this plan; its five sub-questions are
   answered (emergent D8 · no reset in v1, P5 · survives deletion, P6 · slot
   count stays [PLACEHOLDER] 3 · races deferred with the avatar plan).
4. ✅ **`docs/README.md`** — **done 2026-08-05**, ahead of C0, because the entry
   was actively wrong after D13 (it advertised points, a migration and a
   scoring chunk). ⚑ The old C0 item asked to *add* an index line and
   `plan-camps.md` §3 item 7 repeats that — **both were mistaken, the entry
   existed all along**; it needed correcting, not creating.
5. **`backlog.md` §41 — nothing owed, deliberately.** The design session
   pre-ruled its discovery-scoping question (D12); §41 then *closed* on
   2026-08-05 when fast travel shipped, having landed D12's shape on its own.
   Recorded here so a future session does not go looking for the edit.

## 4. The loop, end to end

**Prerequisite (P1):** the character is at max level (30, the locked cap).
Nothing else — no quest gate, and under D13 no measure of the life's quality.

1. **Approach the ascension site.** One site in v1; its location is a world
   pass. The site is an **interaction-carrying mob** — ⚑ *not* a prop: the
   review found `api/props/` definitions parse with `DisallowUnknownFields`,
   carry no sensor, and `InteractionSystem` registers only `MobEntity`s. The
   supported shape is exactly `api/mobs/forest-sign.json`, "an object that
   talks": role `creature`, `speed 0`, off the Action collision layer (no aura
   can target it), an `interaction` block, placed as a fixed `zone.spawns`
   entry. A per-faction site later is still more rows, not new code (the D8
   guard). ⚑ A distinct stone sprite is a new wire `EntityType` enum value +
   client art; C2 may reuse an existing EntityType until the world pass.
2. **Interact → the ascension dialog.** Shows what ascension is (lore text) and
   **the list of skills this bloodline may still learn**: the catalog minus
   what it already owns (P4). No prices, no locked rows. Below max level the
   dialog still opens read-only as a preview [PLACEHOLDER — cheap, and answers
   "what am I working toward"].
   ⚑ **This list is the interaction container's first DYNAMIC row source.**
   `present()` rebuilds the conversation per tick per conversing player under a
   standing O(1)-in-memory-reads-only rule — so the unlocks must already be on
   the player (D16 puts them there via the ticket; account/slot identity rides
   the same way), never queried at present time, and `presentOptions` needs a
   hook for rows that aren't authored in the JSON tree. C3's memorial needs
   the **identical** extension (a graveyard-name list is dynamic per-render) —
   one piece of machinery, two consumers.
3. **Pick one.** Exactly one entry, or none when the list is empty (D14).
4. **Confirm — the point of no return.** One explicit confirmation with the
   loss list spelled out.
5. **Ceremony (D10).** Channel at the stone [PLACEHOLDER ~10 s, interruptible
   only by walking away, never by damage — the site is safe ground], swelling
   VFX, dissolve upward. Skippable after the first viewing.
   ⚑ **The channel is the existing utility-cast machinery, and P7 is its
   default**: Recall's `UtilityDef` is literally `CastTicks: 300` = 10 s,
   movement cancels every cast unconditionally (`core/input.go`), and
   damage-interrupt is opt-in per def — P7 is expressed by *not setting a
   flag*. `advanceCast` re-checks its precondition at fire time, so the
   transaction firing at channel *end* (this list's order) is the natural
   shape — which also defuses the wire quirk that `ConversationOption.reply`
   is spoken client-side optimistically: the confirm row starts the channel
   and promises nothing; the channel is the real confirmation window.
   ⚑ **The one unwired piece:** a grant cannot start a cast today
   (`applyGrant` only mutates spellbook/ledger), and a `UtilityKind` is an
   argument-free global keypress (exactly why `StartFlight` isn't one). C2
   adds a fifth `GrantKind` (`ascend`) whose apply stashes the validated pick
   and starts the channel via a small extension of the `learner` surface. If
   it rides `UtilityKind` anyway, that enum is wire-pinned with a codec pin
   test to update.
6. **The transaction** (server, atomic — this is the "sacrifice transaction"
   deferred out of step 8a): set `sacrificed_at` (guarded `WHERE sacrificed_at
   IS NULL AND deleted_at IS NULL`, mirroring the delete path's guard from its
   side), insert the one `bloodline_unlocks` row (zero rows if the catalog was
   empty). The memorial needs no write — graveyard rows ARE the memorial data.
   Crash anywhere and the whole thing rolls back, character still alive. ⚑ Two
   writes, but still a transaction: a `sacrificed_at` without its unlock row is
   a life spent for nothing. ⚑ The envelope **ends here** — the successor is
   not in it. ⚑ Per the standing note in `store/state.go`: this transaction
   does **NOT** get the `synchronous_commit = off` treatment saves use.
   ⚑ **This is the codebase's FIRST mid-session game-world→DB transaction, and
   it needs a new seam.** The game loop is firewalled from `*store.Store` by
   design (`sys/persist.go` — "the game must never hold a `*store.Store`");
   even campfire binding is in-memory state riding the ordinary async save.
   The shape: a new narrow interface declared in `sys` beside `CharacterSaves`,
   implemented next to `persist.Writer`, wired in `cmd/aurad` — request from
   the loop → transaction off-loop → **completion observed by the loop** (the
   `drainLogoutRequests` inbox style) before the session ends. Inputs the live
   player doesn't have today: `account_id` and `slot_index` — both halves of
   the `bloodline_unlocks` PK — ride the auth ticket onto the session (D16
   already puts them there).
   ⚑ **Teardown, explicitly:** zero `characterByClient` (the existing
   save-skip kill switch), `forgetSaveWatch`, and **discard the reconnect
   stash** — the stash is the one path that would re-queue a pre-sacrifice
   snapshot at the row minutes later. The DB's alive-predicate WHERE clause
   would swallow it anyway (verified: a zero-row save becomes `ErrGone`, a
   terminal drop that is deliberately *not* counted as a writer failure, so no
   false "cannot save" banner) — but it must not be *left* to that.
7. **Character creation** opens with the vacated slot choosable (D15),
   `previous_character_id` chained — **derived inside the create transaction**,
   not sent by the client: the predecessor is the most-recent *unclaimed*
   `sacrificed_at IS NOT NULL` row for that `(account, slot)`. The column's
   UNIQUE plus the same-account composite FK make the edge cases
   (delete-the-heir-then-recreate) resolve correctly on their own. The
   successor is seeded with **every** bloodline unlock, accumulated across all
   past ascensions — not just the newest pick — at skill level 1, via the
   D16 ticket path (the `applyCreationMilestones` shape, fed per-character
   data).
   ⚑ **A second transaction, necessarily**: creation is interactive (the player
   types a name), so it cannot sit inside step 6's envelope. The gap is a real
   reachable state — **a slot holding a sacrificed character and no heir**. It
   is benign and needs no recovery code: that is simply an empty slot, which
   the accounts flow already renders as "create a character", and the unlock is
   already safe in `bloodline_unlocks`. Name it in C1's tests, because the
   tempting-and-wrong alternative is to create the heir eagerly inside step 6
   under a placeholder name.
8. **Loss scope (resolves the GDD ⚑).** Everything character-bound dies with
   the row: spellbook, levels, skill points, combo discoveries, quest ledger,
   home campfire, discovered campfires (D12), **and camp standing once camps
   exist** (`plan-camps.md` L0 — without this a successor inherits a camp and
   the camps escape hatch is a no-op). Survives: the name (graveyard/memorial,
   held forever by the existing UNIQUE), the bloodline's unlocks, and the
   succession chain.
   ⚑ **All of it wipes structurally, and that is the thing to verify rather
   than assume.** `character_campfires`, `character_flags` (standing's planned
   home) and `character_spellbook` are all keyed `character_id`, and
   `home_campfire_id` is a column on the life itself — the successor is a new
   row, so it cannot inherit any of them. **C1 writes no wipe code; C1 must
   only avoid *seeding* them.** The camps L0 hazard is therefore real only if
   standing is ever stored per-account or per-slot — which is exactly the
   change that would silently break this, and the reason it is written down
   here.
   ⚑ **Ownership, because a conditional in a checklist is what L0 was afraid
   of:** if ascension ships **first** (the likely order — C1 is next and camps
   is unbuilt), the C1 standing assert is a no-op and the duty passes to
   **camps' own C1**, which must then assert the wipe against the already-built
   ascension transaction. Whichever ships second owns the test. Stated in both
   plans on purpose.

## 5. Schema impact (stated per the standing rule)

**NONE — no new migration.** Verified against the shipped `000001` DDL. The
whole feature is first-writers for columns that shipped empty:

- **`game.bloodline_unlocks`** — gets its first writer (the transaction).
  Shipped as `(account_id, slot_index, unlock_key, unlocked_at DEFAULT now())`
  with the PK on the first three, so a bare `unlock_key` insert is already
  legal **and the primary key enforces P4's no-duplicate rule in the database
  for free**. `unlock_key` = the skill's name (D17). ⚑ Existing touchers to
  stay consistent with: `HasProgress` (`store/characters.go`) already reads it
  to guard anonymous-account discard, `harnessdb -cleanup` deletes it, and
  `accounts_test.go` already INSERTs a test row whose shape the first real
  writer must match.
- **`characters.sacrificed_at` / `previous_character_id`** — first writers.
  Note `sacrificed_at IS NULL` sits in the alive-predicate of **seven**
  production queries plus the partial unique index — the sacrifice write keeps
  all of them consistent for free, which is the point of the shipped shape.
  ⚑ Unlike deletion, sacrifice must **NOT** rewrite the name
  (`SoftDeleteCharacter` releases names as `'deleted_' || id`; graveyard names
  are held forever — two paths, same table, opposite name policy, both
  deliberate).
- **The catalog is content JSON, not DB.** A new content directory (e.g.
  `api/ascension/`) → it MUST be added to `contentSources` in
  `cmd/aurad/loaders.go` and ride `cp-defs`, or edits silently no-op (the
  standing landmine). ⚑ Two review additions to that landmine: the Makefile's
  `cp-defs` target copies an **explicit eight-directory list** — ascension is
  the ninth entry — and the embed package must use `//go:embed *` (the
  `quests` precedent), because `api/ascension/` ships README-only from C1
  until C3 authors entries and `go:embed` rejects a pattern matching nothing.
- ⚑ **One field exists purely for the deferred layers:** each catalog entry
  carries a **nullable gate** — unset in every v1 entry. It is the single slot
  for both future gate kinds (a feat gate, and `plan-camps.md`'s faction
  condition, whose §3 item 5 asks for exactly this) so they never become
  parallel systems. A price field can join it the day point buy is built; it is
  content JSON, so that is an authoring change, not a migration.
- Store tests need `AURA_TEST_DB_URL` (real Postgres) — an irreversible
  transaction is exactly the kind of code "green without Postgres" lies about.

## 6. Chunk breakdown

- **C0 — docs sync** (§3). Docs-only, small.
- **C1 — the transaction + the catalog (server, no UI).** No migration. The
  `api/ascension/` directory, its loader and `contentSources` + `cp-defs` +
  embed wiring (§5); the "what can this bloodline still learn" query (catalog
  minus `bloodline_unlocks`); the atomic ascension transaction behind its new
  off-loop seam (§4.6), including session teardown and the reconnect-stash
  discard; the create-API `slot_index` (D15) + `previous_character_id`
  derivation (§4.7); the ticket carriage of account/slot identity + resolved
  unlocks and the `player.New` seed (D16). ⚑ Also **explicitly assert the
  wipes** (§4.8), including camp standing if `plan-camps.md` has shipped by
  then — that enumeration is this chunk's, and no other chunk will write it —
  **unless ascension ships first, in which case camps' C1 inherits the
  standing assert** (§4.8). TDD against real Postgres; done when a test can
  ascend a character and its successor boots seeded.
- **C2 — the stone.** Site mob (`forest-sign` shape, §4.1; EntityType reuse or
  a new pinned enum value) + interaction dialog (preview, the pickable list,
  confirm) — which means the container's first **dynamic row source** (§4.2);
  the `ascend` GrantKind + cast-start surface (§4.5); the ceremony sequence
  (channel + VFX + handoff to character creation); the create-card-on-every-
  empty-slot select screen (D15). No new wire *messages* — `Interact` +
  `Conversation` already carry list/pick/confirm; the wire cost is at most an
  EntityType value. Headless smoke via the `verify` skill.
- **C3 — memorial + catalog seed.** Monument (same interaction-mob shape) +
  names listing — the **first graveyard query ever written**, filtering
  `deleted_` names (D11), served through C2's dynamic row source; author the
  ~5–10 entry catalog (D9) — each entry a **fully authored skill JSON** (no
  variant/template mechanism exists; `charm-beast`/`charm-elemental` is the
  precedent pair) with a fresh pinned id, through the add-content pipeline,
  plus one combination.

Sequencing: C0 anytime; C1 → C2 → C3, each its own execution session.

## 7. Test strategy

- **C1:** Go tests vs. real Postgres — transaction atomicity (crash-injection
  around each write; ⚑ no precedent exists — the nearest is `persist_test.go`'s
  scripted-sink fault injection, but a genuine abort-between-the-two-writes
  test is new machinery, writable with plain pgx by rolling back at the
  injection point), no-duplicate pick (both the app-level filter and the PK),
  the **empty-catalog ascension** committing with zero unlock rows (D14),
  successor seeding from *multiple* accumulated unlocks, the wipes of §4.8
  asserted on a real successor, the **heirless-slot state** (commit the
  ascension, never create the successor, assert the account still loads with
  that slot empty and the unlock intact), ascension refused below max level
  (P1), and the sacrificed⊕deleted CHECK staying unreachable. Review-added
  regressions: **a late save against a sacrificed row is an `ErrGone` drop
  that does NOT count as a writer failure** (no false "cannot save" banner —
  the one place the existing design could have gone wrong and didn't); the
  reconnect stash is discarded at ascension; `SaveCharacter`'s child-table
  writes stay behind the early `ErrGone` return (they are protected by
  *statement order only* — a reorder would silently rewrite a sacrificed
  character's children); D15 slot-choice validation (occupied / out-of-range
  refused); `previous_character_id` derivation edges (delete-heir-then-
  recreate chains correctly via the UNIQUE); and the D16 seed surviving a
  save→load cycle with the starting aura still *active*.
- **C2:** vitest for the pure dialog logic (the pickable-list filter, including
  the empty case); Playwright smoke — walk to the stone → dialog → pick →
  confirm → land in character creation → the new character has the skill.
- **C3:** the memorial listing renders graveyard names; catalog entries pass
  the add-content verification tail (wire hand-sync, registry pins).
- Sim batteries must stay byte-identical (nothing here touches combat); boot
  with 0 errors and 0 warnings with the new content directory present.

## 8. Open questions & deferred

**Open:**

- **Site location + environment art** — world/content pass (druid stones the
  candidate). The dialog *text* ("The Passing") needs a lore write.
- **Memorial display scope** (D11) — one shared monument listing every ascended
  name (GDD intent) vs. per-bloodline grouping. PO call at C3.
- **Numbers** — catalog size, channel length, whether the below-max-level
  preview ships. [PLACEHOLDER], tuning-open.

**Deferred by ruling — not blocked.** D13 keeps these alive; §5's nullable gate
field is what keeps them cheap:

- **The point-buy economy** — earned points, prices, a banked per-slot balance
  (`game.bloodlines`, materialized never derived), rarity/quest scoring, and
  the anti-inflation rule that must travel with it (§10). One cluster; revive
  it whole or not at all.
- **Feat gates** — hidden or hard achievements unlocking specific entries,
  shown locked with the gate named (discoverability over secrecy: the
  *recipes* stay secret, the *gates* do not). Counter-based feats
  (kills-per-species, steps walked) are one layer further out and need a
  counter subsystem that does not exist.
- **Per-faction ascensions** (D8) — `plan-camps.md` is what unblocks them.
- Cosmetics and race/start-option rewards (blocked on
  `plan-avatar-system.md`) · the ascension video (D10 upgrade) · reward access
  outside a ceremony (D7) · bloodline reset (P5).
- **Random roll is rejected, not deferred** — PO least-favourite, 2026-08-04.

## 9. Proposals adopted without a choice prompt (PO may veto any)

- **P1** max level is the only prerequisite — and under D13 the only
  qualification of any kind.
- **P3** naming: this plan says **achievements** for feat gates; "milestones"
  stays reserved for `api/milestones/` level unlocks.
- **P4** no duplicate picks — a taken entry leaves that bloodline's catalog
  forever. ⚑ Promoted by D13: with points gone this is the loop's **only**
  limiter, and §5 shows the `bloodline_unlocks` PK already enforces it.
- **P5** no bloodline reset in v1 (YAGNI until a player actually regrets a
  slot).
- **P6** a bloodline survives plain character deletion — the schema already
  encodes this, there is no FK from `bloodline_unlocks` to characters.
- **P7** the ceremony channel is interruptible by walking away, not by damage.
- *(P2 was the anti-inflation rule; deleted with the economy — see §10.)*

## 10. Superseded rulings (history — nothing here is built)

Kept so a future session can revive the economy deliberately instead of
rediscovering it. **None of this is in scope; see §8 "deferred".**

- **D2 — acquisition = point buy + achievement-gated specials.** Superseded by
  D13. It had amended GDD §5's "choose one reward" away; D13 restored it.
- **D5 — scoring reads only already-persisted state.** Moot: there is no score.
  Its content was points per skill unlocked (weighted by an authored `rarity`
  on skill JSON) plus completed quest chains from the ledger. ⚑ The *constraint*
  is worth keeping for whoever builds point buy: scoring may only read state
  that is already persisted. `rarity` is not authored in v1 — nothing reads it
  today (the sole mention is a `_comment` in `api/skills/revive.json`).
- **D6 — unspent points bank on the bloodline.** Moot: no points, no balance,
  and therefore no `game.bloodlines` table.
- **P2 — bloodline-seeded entries do not score** (anti-inflation: otherwise
  each generation banks the previous one's points). Deleted, because nothing
  scores. ⚑ Revive it *with* point buy, never after — and note its mechanism,
  **seed provenance on the spellbook**, is the column §5 no longer adds.

## 11. Chunk ledgers

*(appended per execution session — none yet)*
