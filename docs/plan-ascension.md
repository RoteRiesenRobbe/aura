# Plan: Ascension — the character-sacrifice loop

> **Status: DESIGNED 2026-08-04, SCOPE CUT 2026-08-05 (D13), CODE-REVIEWED
> 2026-08-05 (D15–D17), CONDITIONS ADDED 2026-08-09 (D18).
> ⭐ C1 BUILT 2026-08-10 (§11).
> ⭐ C2 DESIGN PASS 2026-08-10 (§12, D19–D22): C2 became **C2a + C2b**.
> ⭐ **C2a BUILT 2026-08-10 across six steps (§12.7–§12.11), `4674cf00`** -
> the loop runs end to end in the browser: walk to the stone, pick, confirm,
> channel, and land on character select with the character spent and its
> bloodline row written. **C2b is next and §12.5 is its handoff.**
> Read §12 before §6's C2 bullet, which it supersedes in five places.**
> The execution-order item "character-sacrifice loop" (GDD §5 meta-progression,
> pulled into v1 by the 2026-07-19 intermission-triage ruling, item 10), opened
> as persistence's first consumer. Every number is [PLACEHOLDER] unless marked.
>
> ⚑ **Read §10 before reacting to anything you remember about this plan.** The
> 2026-08-04 design had a point economy; **D13 cut it.** Three rulings (D2, D5,
> D6) were superseded and now live in §10 only — the body of this document
> describes what gets built, nothing else.
>
> ⚑ **And D13 is itself partially superseded: D18 (2026-08-09) puts CONDITIONS
> back in v1.** A catalog entry may carry a gate ("ascend 3 times", "slay 50
> wolves this life"), and a gated entry renders **locked with the gate named and
> its progress** rather than hidden. The economy stays cut: still one free pick,
> no points, no prices, no random roll. **Schema impact is still NONE**, because
> every v1 condition reads state that is already persisted or already derivable
> at ticket time; the one class that would cost a migration (counters that
> accumulate *across* lives) is explicitly not taken.
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
stone, pick one, ascend. No points, no roll, no measure of how well
the life went — those are §8 layers, deferred but explicitly not blocked.
⚑ **Since D18 some entries carry a condition** ("ascend 3 times", "slay 50
wolves this life"), shown locked with the gate named until it passes. That
qualifies an individual *reward*; the price of ascending is still max level and
nothing else, and an all-locked catalog still ascends (D14).

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
- **⭐ D18, CONDITIONS ARE IN v1: a catalog entry may carry a gate, and gated
  entries render LOCKED with the gate named.** Taken 2026-08-09 as a direct PO
  instruction plus two choice prompts. **This partially supersedes D13**, which
  cut feat gates along with the economy; the economy stays cut, the gates come
  back. §10 records the superseded clause; D13's other three quarters (no
  random roll, no points, no prices) are untouched, and the reward is still
  exactly one pick from a list.
  - **The gate is the §5 nullable field, now active rather than inert.** One
    field, still shared with `plan-camps.md`'s faction condition, so the two
    never become parallel systems.
  - **Vocabulary is SHARED with the shipped node-condition engine**
    (`mobs.ConditionKind`, `sys.conditionsPass`, AND semantics over a list,
    unknown kind refused at boot). Two surfaces, one language: a node condition
    gates a *dialogue node*, an entry gate rides a *catalog entry* and is
    evaluated where C2 builds its dynamic rows. ⚑ The dividend is free: NPC
    dialogue gains the new kinds the day they land, so "a hunter who only talks
    to you after ten wolf kills" becomes authoring, not code.
  - **Condition kinds NAME THEIR SCOPE**: `kills_this_life`,
    `bloodline_ascensions`, never bare `kills` / `ascensions`. The per-life vs.
    cross-life line is the entire cost model (see the tiers below), and an
    ambiguous authored key is how a migration-costing gate gets authored by
    accident.
  - **Locked rows are SHOWN with the gate named and its progress**: "Requires:
    slay 50 wolves this life (12/50)". Discoverability over secrecy: the
    *recipes* stay secret, the *gates* do not. ⚑ **This is also what keeps D14
    honest**: a hidden entry is indistinguishable from an exhausted catalog, so
    a player would have no way to learn the condition exists. ⚑ **D14's empty
    state therefore tightens**: "this bloodline has learned everything it can
    teach" now means no pickable rows **and** no locked rows; with a locked row
    on screen that sentence is a lie. ⚑ The progress counter is composed
    **per-player at render**, never authored, exactly like the quest journal's
    `Objectives []string` (which exists for the same reason: serving thresholds
    for unreached content would reverse D14's sibling ruling).
  - **A locked row is CLICKABLE AND REFUSES** in v1, at zero wire cost. A genuinely
    disabled row means a new `ConversationOption` field, which is an `.fbs`
    change plus a codec pin; the refusal reply costs nothing and says the same
    thing. Revisit if it reads badly in C2's feel pass.
  - **The three cost tiers, which is what the ruling actually buys:**
    **A, free today**, O(1) reads off the `learner` surface that
    `conditionsPass` already holds: level (`minLevel`, shipped), quest stage /
    completion (`MatchesStage`, shipped), **kills of a species in this life**
    (`Ledger.KillCount`), `HasTalkedTo`, spellbook membership. ⚑ §8's
    "counter-based feats need a counter subsystem that does not exist" was
    **too pessimistic for the per-life half**: the quest ledger shipped those
    counters on 2026-07-30, four days before this plan was designed, persisted
    as `character_flags` rows and moved onto `learner` by quests C2.
    **B, one ticket addition, no migration**: anything derivable from the
    account's `characters` rows, resolved once in the off-loop `/select` path
    beside D16's unlocks: `bloodline_ascensions` (count of
    `sacrificed_at IS NOT NULL` for that `(account, slot)`), "highest level ever
    reached in this bloodline", "first life". ⚑ Session-constant by
    construction: ascending ends the session, so nothing can invalidate it
    mid-dialog.
    **C, costs a migration, NOT taken**: cumulative *across* lives that is not
    already a column (kills across the bloodline, steps walked, deaths).
    Per-character counters die with the row, structurally, which is §4.8's whole
    point. ⚑ **If it is ever built, the roll-up rides INSIDE the sacrifice
    transaction**, carrying a live ledger snapshot the way that request already
    carries the validated pick, never the save path, because §4.6's teardown
    deliberately *skips* the final save (it zeroes `characterByClient`, the
    save-skip kill switch). Later historical aggregation from the surviving
    graveyard `character_flags` rows stays possible and would lose only each
    life's final unsaved window.
  - **Schema impact stays NONE.** Tiers A and B read state that is already
    persisted or already derivable; only tier C would need a migration, and it
    is not taken.
  - ⚑ **P3's naming discipline holds**: these are **conditions** (the authored
    kind) or **achievements** (the player-facing idea). "Milestones" stays
    reserved for `api/milestones/` level unlocks.

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
   what it already owns (P4). No prices. Below max level the
   dialog still opens read-only as a preview [PLACEHOLDER — cheap, and answers
   "what am I working toward"].
   ⚑ **Two row classes since D18**: pickable rows, then any **gated** entries
   whose condition has not passed, rendered locked with the gate named and its
   progress ("Requires: slay 50 wolves this life (12/50)"). A locked row is
   clickable and refuses, at zero wire cost, versus an `.fbs` field for a truly
   disabled row. The gate is evaluated in the same pass that builds the rows,
   against the same `learner` surface the node-condition engine already reads,
   which is why every v1 condition kind had to be an O(1) in-memory read (D18
   tiers A and B).
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
- ⚑ **The gate field is LIVE since D18, not inert:** each catalog entry carries
  a **nullable gate**, a list of conditions in the shipped `mobs` vocabulary,
  ANDed, unknown kind refused at boot. It stays the single slot for every gate
  kind (achievement conditions now, `plan-camps.md`'s faction condition later,
  whose §3 item 5 asks for exactly this) so they never become parallel systems.
  A price field can join it the day point buy is built; it is content JSON, so
  that is an authoring change, not a migration. ⚑ **Still no migration**: every
  v1 condition kind reads state that is already persisted (`character_flags` for
  per-life counters) or already derivable from `game.characters` at ticket time
  (`bloodline_ascensions`). Only D18's tier C would need one, and it is not
  taken.
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
  ⚑ **D18 adds two things here, both small and both load-bearing for C2/C3:**
  the catalog's **gate parse + boot validation** (a list of conditions in the
  `mobs` vocabulary, unknown kind = boot error, following `conditionKinds`'
  existing refuse-at-boot discipline), and **`bloodline_ascensions` resolved
  onto the auth ticket** beside the unlocks, in the same off-loop `/select` query
  that already reads the slot's rows, so it is a count, not a second round trip.
- **C2 — the stone.** Site mob (`forest-sign` shape, §4.1; EntityType reuse or
  a new pinned enum value) + interaction dialog (preview, the pickable list,
  confirm) — which means the container's first **dynamic row source** (§4.2);
  the `ascend` GrantKind + cast-start surface (§4.5); the ceremony sequence
  (channel + VFX + handoff to character creation); the create-card-on-every-
  empty-slot select screen (D15). No new wire *messages* — `Interact` +
  `Conversation` already carry list/pick/confirm; the wire cost is at most an
  EntityType value. Headless smoke via the `verify` skill.
  ⚑ **D18 adds locked-row rendering** to the dynamic row source: the gate
  evaluated against the same `learner`, its progress composed into a per-player
  string, the row clickable and refusing. **Still no wire cost**, which is
  exactly why the refusal was chosen over a disabled-row flag. ⚑ It also
  tightens D14's empty state: "nothing left to teach" must now check pickable
  **and** locked rows before it says that.
  ⭐ **SUPERSEDED IN PART by the 2026-08-10 design pass: read §12 first.** C2 is
  **split into C2a and C2b** (D19), the ceremony is the channel alone (D20), the
  confirm is the delete-dialog's countdown and it **does cost one wire field**
  (D21), and the "clickable and refusing" locked row is already shipped as an
  inert greyed one (P11). §12 is the buildable version of this bullet.
- **C3 — memorial + catalog seed.** Monument (same interaction-mob shape) +
  names listing — the **first graveyard query ever written**, filtering
  `deleted_` names (D11), served through C2's dynamic row source; author the
  ~5–10 entry catalog (D9) — each entry a **fully authored skill JSON** (no
  variant/template mechanism exists; `charm-beast`/`charm-elemental` is the
  precedent pair) with a fresh pinned id, through the add-content pipeline,
  plus one combination.
  ⚑ **D18: three of those entries are GATED, one per mechanism** (PO choice,
  2026-08-09), so each of the three data paths gets a real content consumer
  rather than only a test:
  1. `bloodline_ascensions >= 3`: a veteran-only variant; proves the **ticket
     carriage** (tier B).
  2. `kills_this_life: DireWolf >= 50` [PLACEHOLDER species + threshold]: a
     directed hunt; proves the **ledger read** (tier A).
  3. `quest_completed: the-lost-lamp`: proves the **shipped vocabulary** is
     genuinely reused rather than re-implemented (tier A).
  ⚑ Their power still obeys **D1 world-parity**: a gate buys *access*, never a
  higher power level. A gated entry that outclassed world content would make
  the condition the only road to that power, which is the SWG-Hologrind failure
  D1 exists to prevent.

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
  reconnect stash is discarded at ascension; ~~`SaveCharacter`'s child-table
  writes stay behind the early `ErrGone` return (they are protected by
  *statement order only* — a reorder would silently rewrite a sacrificed
  character's children)~~ ⚑ **CORRECTED IN C1 by mutating the pin this line
  asked for: they are NOT protected by statement order.** The early return is an
  *error* return, so it never reaches `Commit` and the deferred `Rollback` undoes
  the child writes with everything else — moving the guard below them keeps the
  test green. **The transaction is the protection; statement order is an
  optimisation on top of it.** The pin stays for the contract it does hold (a
  late save against a graveyard row changes nothing and is marked terminal) and
  would go red if those writes ever left the transaction; D15 slot-choice validation (occupied / out-of-range
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
- ✅ **~~Feat gates~~, PULLED INTO v1 BY D18, no longer deferred.** Achievement
  conditions on catalog entries, shown locked with the gate named. What stays
  deferred is only the **cross-life counter half** (D18 tier C): counters that
  accumulate across a bloodline's lives, which need either a bloodline-scoped
  table or a roll-up written inside the sacrifice transaction, and are the one
  part of this that costs a migration. Original entry, kept for the shape it
  described: hidden or hard achievements unlocking specific entries,
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

- **P1** max level is the only prerequisite **to ascend**, and under D13 the
  only qualification of any kind. ⚑ **D18 narrows the wording, not the rule**:
  a gate qualifies an individual *reward*, never the ascension itself. Max level
  remains the whole entry price, and a fully-gated catalog still ascends (D14).
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

- **D13's gate clause, PARTIALLY SUPERSEDED by D18 (2026-08-09).** D13 read
  "no random roll, no point economy, no feat gates"; the third of those is
  reversed and conditions ship in v1. **The other two stand**, and so does the
  sentence that matters: the reward is still exactly one pick from a list, with
  no points, prices or scoring anywhere. ⚑ D13's own escape hatch is what made
  the reversal cheap rather than a rework: it required the catalog to carry a
  nullable gate field from day one *precisely so* adding gates would be data,
  not rework, and that is exactly how it played out (schema impact still NONE).
  ⚑ D18 also corrects one factual claim in §8's deferral: "counter-based feats
  need a counter subsystem that does not exist" was true only for the
  cross-life half. The per-life counters shipped with quests on 2026-07-30,
  four days *before* this plan was designed.

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

### C1 — the transaction + the catalog ✅ 2026-08-10, `dee6a9c0`

**Built TDD red-first across five steps, one session.** Every load-bearing pin
was proven by mutation. No new PO ruling was needed: D13/D15–D18 already
governed everything C1 touches.

**Schema impact: DB NONE (no migration) · FlatBuffers NONE · conf NONE ·
frontend NONE.** First writers only, for columns `000001` shipped empty.

**What changed**

| Layer | Change |
| --- | --- |
| `pkg/aura/ascension/` (new) | `Entry` (unlockKey + resolved skill + conditions) · `Catalog` · `CatalogFromFS` · `Remaining(taken)` — §6's "what can this bloodline still learn", catalog half |
| `items/mobs/interaction.go` | `jsonInteractionCondition` → exported **`JSONCondition`** + **`ParseCondition`**; the mob loader now routes through it |
| `api/ascension/` (new) | README only until C3 · `pkg/api/ascension` with `//go:embed *` |
| `cmd/aurad/loaders.go` + `aurad.go` | ninth `contentSources` entry · `loadAscensionCatalog` + boot count · `core.AscensionCatalog` · `cfg.GameConfig.AscensionCatalog` |
| `backend/Makefile` | `cp-defs` copies nine dirs (its `$(info)` string too) |
| `store/ascension.go` (new) | **`AscendCharacter`** — the sacrifice transaction · **`Bloodline`** + `LoadBloodline` (unlocks + ascension count, one round trip) · `ErrUnlockAlreadyOwned` |
| `store/characters.go` | `NewCharacter.SlotIndex *int` (D15) · `ErrSlotOccupied` / `ErrSlotOutOfRange` · the retry fork · **`unclaimedPredecessor`** derivation inside the create transaction · `constraintHeirTaken` mapped |
| `accounts/characters.go` + `respond.go` | create API takes `slotIndex` (`slot_taken` 409 / 400) · `/select` resolves the bloodline onto the ticket |
| `auth/ticket.go` | `BloodlineUnlocks` + `BloodlineAscensions` |
| `persist/ascend.go` (new) | `AscensionRequest` / `AscensionResult` / `AscensionSink` / **`Ascender`** — off-loop, one attempt, drained by the loop |
| `sys/persist.go` | `CharacterAscensions` seam · `RequestAscension` (P1) · `drainAscensions` · **`endAscendedSession`** · `seedBloodlineUnlocks` (D16) |
| `sys/state.go` | `drainAscensions()` in `Update` · the seed call in `tryJoin`, after the restore branch |
| `core/game.go` | `SetCharacterAscensions` + **compile-time assertions for all three seams `cmd/aurad` type-asserts** |

**Findings — the four things a future session needs**

1. ⛑ **§7's "protected by statement order only" was FALSE, and mutating the pin
   written for it is what proved so.** Moving `SaveCharacter`'s `ErrGone` guard
   *below* the child-table writes keeps the test green: it is an **error**
   return, so `Commit` is never reached and the deferred `Rollback` undoes the
   child writes with everything else. **The transaction is the protection.** §7
   is corrected in place.
2. ⛑ **The heir race surfaced an UNMAPPED constraint.** Two creates into a
   freed slot derive the same unclaimed predecessor, so the loser violates
   `one_alive_character_per_slot` **and** `previous_character_id`'s inline
   UNIQUE — and Postgres reports **`characters_previous_character_id_key`
   first** (created with the table; the slot index came later). Unmapped, that
   is a raw 500 in exactly the race the shipped retry-once exists to absorb, and
   the existing concurrency test could never see it because its slots have no
   sacrificed predecessor. Reproduced **deterministically** (an uncommitted
   rival heir holds the row lock, so the create under test loses for certain),
   then mapped to `errSlotRace` and pinned by name.
3. ⚑ **`PersistenceSink` is a RUNTIME type assertion.** Adding a method to it
   without implementing it on `core.game` builds green and dies at boot with
   *"game does not accept a persistence seam"*. Now a build failure for all
   three seams — the silent-wiring class, caught by being about to commit it.
4. ⚑ **`SlotIndex` on the ticket had no reader, so it was removed.** The
   transaction reads the slot off the row it is already updating
   (`UPDATE … RETURNING slot_index`), which is strictly safer than carrying it:
   a carried value could drift from the row and file a reward under a bloodline
   that did not earn it. §6's "account/slot identity rides the ticket" is
   therefore **half-true by design** — the account rides, the slot is derived.

**Decisions taken inside the chunk (no PO prompt needed)**

- **P1 is checked on the LOOP, against the live level**, never in SQL: the row's
  level is eventually consistent and the teardown deliberately skips the final
  save, so a `level >= 30` clause would refuse a player who just dinged.
- **Teardown order** (each line mutation-proven): zero `characterByClient`
  (save kill switch) → zero `accountByClient` (so the LATE fan-out cannot stash
  the **successor's** freshly claimed session) → drop the reconnect token (no
  stash is ever created, the name is freed) + `discardStashFor` → close →
  **Release**, not Stash.
- **One attempt, never retried** — the opposite of the save path. Re-running an
  irreversible transaction after an ambiguous timeout is how a sacrificed
  character gets reported as never sacrificed.
- **The seed DISCOVERS, it does not equip** (a gift that equipped itself would
  put back, every login, a skill the player removed), and `Discover` only writes
  into an entry that is 0, which is what makes D16's reapply-every-join
  harmless.
- **No `ASCEND` cheat command** — C1's done-condition is a test, C2 brings the
  real trigger.
- **The three new D18 condition kinds land in C2, beside their evaluation.**
  `conditionsPass` fails **closed**, so a kind that parses with nothing
  evaluating it is a permanently locked row: a silent content bug.
- **No crash-injection machinery.** The duplicate-key path is a genuine abort
  between the two writes through production code and goes red the moment they
  stop sharing a transaction; a process-crash test would only re-prove
  Postgres's own guarantee.

**Verification**

- **~70 new tests**: 14 `ascension` · 24 `store` · 5 `accounts` · 16 `sys` ·
  4 `persist` · 1 loader-coverage pin. Every load-bearing one mutation-verified
  (transaction split, retry fork, `NOT EXISTS`, level overwrite, retired key,
  active-aura disturbance, each teardown line, multi-unlock seeding).
- Full `go test ./...` **0 FAIL** · `make -C backend db-test` green (store +
  accounts vs `aura_test`) · `go build ./...` clean.
- ⚑ `sys.TestDwell_TakeoffDropsAnInProgressCount` fired once in a full run. At
  n=8 it looked alarming (4/8 mine vs 1/8 HEAD); **at n=20 it is 7/20 with this
  work vs 10/20 at HEAD** — the documented flake, unchanged. The small sample
  was the trap the standing note names.
- Boot **0 WARN / 0 ERROR** on both paths (embedded and `-content ../api`),
  new line `Loaded ascension rewards count=0`.
- **Sim batteries byte-identical**: TTK **6.67 s** / TTD **8.70 s**, the locked
  values.
- Browser gate: **`chunk2-accounts` 24/24** · **`chunk4-persistence` 16/16** ·
  ⭐ **new `c1-bloodline-seed.mjs` 5/5**, all 0 console errors.
- ⚑ New pin beyond the plan: **`TestContentSources_CoverEveryApiSubdirectory`**
  — the "a content dir nobody wired silently no-ops" landmine had no test, and
  C1 added the ninth directory. It enumerates `api/` by reading the filesystem,
  so it cannot rot the way a hand-listed set would.

**The new harness, and what its failures taught**

`c1-bloodline-seed.mjs` is before/after on ONE character: prove it does not know
`FrostShield`, insert one `bloodline_unlocks` row, return, find it. Two things
cost a run each and are now in its header — it must leave through the product
(**settings → character select**), because a page reload inside the stash window
resumes the live character and discards the ticket, so the seed never runs; and
the client renders **display names**, so `FrostShield` arrives as "Frost Shield"
and a verbatim match scores a working seed as a failure.

**Hand-forward to C2**

- The seam is built and unused: **`RequestAscension(p, unlockKey)` is the entry
  point** the stone's `ascend` grant calls. It refuses below max level, refuses
  without an account/character binding, and accepts `""` as the empty pick.
- `Catalog.Remaining(bloodline.Unlocks)` is the pickable list; **gates are not
  applied there** — a locked entry is still unlearned, and C2 renders it locked.
- The three D18 condition kinds (`kills_this_life`, `bloodline_ascensions`,
  `quest_completed`) do not exist yet. `BloodlineAscensions` is already on the
  ticket for the tier-B one.
- The create card on every empty slot (D15's client half) is C2's; the API
  already takes `slotIndex` and refuses occupied/out-of-range.
- ⚑ **Camp standing:** ascension shipped first, so per §4.8 the standing-wipe
  assert passes to **camps' own C1**, against the already-built transaction.

## 12. C2 design pass - 2026-08-10

> **Status: DESIGNED, nothing built.** A planning session: §6's C2 bullet was
> checked line by line against the shipped code, four PO calls were taken
> (D19–D22), and the chunk is now **two chunks, C2a and C2b**. Everything below
> supersedes §6's C2 bullet where the two disagree; §4 and the D-ledger are
> untouched except where a decision says so.

### 12.1 What the plan-check found

Eleven findings. Six change what gets built.

1. ⭐ **`quest_completed` ALREADY EXISTS, and D18's third kind must not be
   built.** `Ledger.MatchesStage` handles the `completed` sentinel
   (`quests/ledger.go:180`), so C3's third gated entry is authorable **today**
   as `{kind: quest_at_stage, quest: "the-lost-lamp", stage: "completed"}`.
   Adding a synonym kind would be the second vocabulary D18 exists to prevent.
   **Two new kinds remain**, not three. See P8.
2. ⭐ **D18's "a locked row is CLICKABLE AND REFUSES" is stale**, and the
   shipped convention is better. `ConversationOption.Locked` +
   `RequiredLevel` shipped with the quests work: the client greys the row,
   names the wall, and **gives it no click handler at all** (`Conversation.ts:154`,
   `ConversationModel.ts:181`, plan-conversation-journal.md Q1/R1). D18 was
   written before that landed and priced a wire field it no longer needs. A
   gated ascension row is an ordinary `Locked` row. See P11.
3. ⚑ **The gate's wall text has nowhere to ride**, because the client renders
   the wall as the literal string `level ${row.requiredLevel}`. A gated row
   would read "level 0". The fix is two lines and costs no wire: the server
   composes the requirement into the row's **`Text`**, and the client draws the
   wall only when `requiredLevel > 0`.
4. ⭐ **The bloodline's unlock KEYS are not retained anywhere on the player**,
   and `HasDiscovered` is not a substitute. `seedBloodlineUnlocks` consumes the
   ticket's keys straight into spellbook entries and drops them; a skill learned
   from a Troll drop is discovered but is **not** a spent unlock. Filtering the
   pick list by the spellbook would hide entries the bloodline has never bought.
   C2a must carry the key set onto the player at join and read *that*.
5. ⚑ **`BloodlineAscensions` rides the ticket and has NO reader** (`auth/ticket.go:113`,
   written by `accounts/characters.go:335`, read by nothing). C2a is its first
   consumer, and until then it is a field that could be deleted without a test
   going red.
6. ⭐ **Neither the success nor the failure surface exists.** On commit,
   `endAscendedSession` closes the socket and nothing else, so today a
   triumphant ten-second channel ends in the client's `Connection lost - reload
   to reconnect` banner. On `done.Err != nil` the character simply keeps
   playing with **no feedback whatsoever** after a completed channel. Both are
   C2a work; §12.4 step 6 rules them.
7. ⭐ **A sacrificed slot is indistinguishable from a never-used one**, and D15's
   client half genuinely breaks the loop's last step. `listCharacters` returns
   alive rows only, and `CharacterSelect.render` puts the create card on the
   **first empty slot** and nothing on the rest (`CharacterSelect.ts:146`). Ascend
   slot 2 while slot 0 is empty and the only create card offered aims at slot 0,
   which is exactly the cut-off-from-its-bloodline case D15 was written to
   prevent. ⚑ It is invisible in the common single-slot playtest, because there
   the freed slot **is** the first empty one. This is C2b.
8. ⚑ **`kills_this_life` needs two-phase species resolution on TWO surfaces.**
   `ParseCondition` takes no registry, and it cannot: `mapToInteraction` runs
   *during* the mob registry's construction. The precedents both exist and
   disagree in shape: `validateSpawnEffects` is an in-package pass over the
   finished registry (`items/mobs/registry.go:101`), `quests.CrossValidate` is a
   cross-package one. A species named on a dialogue node needs the first; a
   species named on an ascension entry can resolve at parse time, since the
   catalog loads after mobs. One shared resolver, called from two places, or the
   two surfaces drift the day either gains a kind. See P9 for why this moves.
9. ⭐ **C2 DOES have a wire cost.** §6 says "the wire cost is at most an
   EntityType value"; D21's countdown confirm needs one new
   `ConversationOption` field. That is now the honest statement.
10. ⚑ **Generated rows are addressed by `OptionIndex` into `Catalog.All()`**, the
    boot-stable list, never into `Remaining()` (whose membership depends on
    player state). `All()` is sorted by unlock key at load, so the index is
    stable across a restart. ⭐ **CORRECTED DURING C2a STEP 2, and the earlier
    version is now impossible**: this said *`GrantIndex`* into the catalog, with
    the rows hung off an authored `ascend` option and `applyGrant`'s bounds check
    bypassed. Step 2 built P10's node-owned source instead, and its loader
    **refuses** authored options on a source node, so there is exactly one index
    space and no bypass. See §12.7 for what moved.
11. ⚑ **`present()` runs per tick per conversing player**, under a standing
    O(1)-in-memory-reads-only rule (L15). A catalog scan is O(entries) with
    entries capped at 254 and seeded at 5–10, evaluated only while a panel is
    open at the one site in the world. That is the budget; it is fine, and it is
    the reason every condition kind still has to be an O(1) read.

### 12.2 Decisions taken in this pass

- **⭐ D19 - C2 SPLITS INTO C2a AND C2b.** PO, 2026-08-10, against the size of
  §6's bullet. **C2a is "the stone works end to end"**: walk up, pick, confirm,
  channel, land on character select. **C2b is "the select screen knows about
  bloodlines"**: the create card on every empty slot (D15's client half) and the
  slot's bloodline on its card (D22). ⚑ The seam is not server/client, on
  purpose: C2a includes its own confirm modal and exit routing, because a chunk
  that ends at "the character is deleted and the client says Connection lost" is
  not a chunk anyone can play. ⚑ Finding 7 is C2b's, so **between the two chunks
  the loop is complete only for a single-slot account**. Acceptable across two
  consecutive sessions, recorded so it is not rediscovered as a bug.
- **D20 - the ceremony in C2a is THE CHANNEL AND NOTHING ELSE.** PO,
  2026-08-10. The shipped utility cast bar renders it for free
  (`codec/gamestate.go:458` already streams `CastingUtilityDef`), movement
  already cancels it, and P7's no-damage-interrupt is expressed by not setting a
  flag. No new client VFX, no swell, no dissolve, nothing to skip. D10's
  sequence becomes a world/art-pass upgrade, alongside the stone's own sprite,
  which C2a defers the same way by reusing the `Signpost` EntityType.
- **⭐ D21 - the confirm is the DELETE DIALOG's pattern, countdown included, and
  it costs ONE WIRE FIELD.** PO, 2026-08-10: *"use the same version we have in
  the character deletion selection, with the 5 seconds countdown; reuse as much
  from there as is feasible and sensible."*
  - **What is feasibly reused:** the pattern (a modal naming what dies, Cancel,
    and a confirm button labelled `Ascend (5)` and `.disabled` until zero), and
    the countdown logic itself, extracted from `DeleteDialog.startCountdown`
    into a shared helper both call. ⚑ **What is not:** the markup and styles.
    `DeleteDialog` lives in `account-screens`, an HTML overlay that exists only
    outside the world; the ascension confirm is drawn over the running game.
    The extraction is the DRY win; a shared dialog element is not available.
  - **⚑ Its own comment carries forward verbatim**: this is friction against a
    misclick, not a security control. The server applies the row whenever it
    arrives, exactly as the delete endpoint does.
  - **The wire field: `ConversationOption.confirm_seconds: ubyte = 0`**,
    appended at the table end. 0 is every row that exists today and means "take
    it immediately"; greater than zero means "open the countdown modal first,
    then send". General rather than ascension-specific on purpose:
    `plan-camps.md`'s faction consequences and D8's unlearn cost are the next
    two irreversible rows, and neither should invent this again. Codec pin test,
    no DB migration.
    ⭐ **CORRECTED AFTER STEP 2: it is NOT authored as `confirmSeconds` on the
    option**, because a generated row has no authored option to carry it (§12.7).
    The row source **sets it on the rows it emits**, hardcoded at 5, which is
    exactly what `DeleteDialog`'s own countdown does and for the recorded reason
    (`CONFIRM_COOLDOWN_MS`, §10b ruling 4: the knob was drafted, never built, and
    does not need to exist). An authored key can join it the day a static row
    wants one; the wire field is unchanged either way.
  - **The modal's body is composed client-side** from what the panel already
    holds: the node's `lines` are the loss list, the row's `text` is what the
    line gains. Nothing new travels for it.
  - ⚑ **This collapses the pick/confirm two-node shape §4 step 4 implied.** One
    click on a reward row opens the modal; confirming sends that same row. There
    is no `confirm` node, no stash-then-confirm dance, and no second GrantKind.
    The channel remains the last escape, by walking away.
- **D22 - an empty slot shows the bloodline it continues.** PO, 2026-08-10.
  The `/characters` list gains per-slot bloodline data (`store.LoadBloodline`
  already returns unlocks and the ascension count in one round trip), and an
  empty slot with a history renders as the line it continues plus what the heir
  would inherit, with a "continue this bloodline" create card. This is what makes
  backlog §36's "three slots, three bloodlines" navigable rather than a fact only
  the database knows. C2b.

### 12.3 Proposals adopted without a choice prompt (PO may veto any)

- **P8 - `quest_completed` is NOT built** (finding 1). C3's third gated entry
  authors `quest_at_stage` with the `completed` sentinel, which is a stronger
  proof of D18's "the shipped vocabulary is genuinely reused" than a new kind
  would have been.
- **P9 - `kills_this_life` MOVES TO C3, beside its content.** C1's ledger parked
  all three kinds in C2 for a good reason (`conditionsPass` fails closed, so a
  kind that parses with nothing evaluating it is a permanently locked row), and
  that reason is honoured: **the kind and its evaluation still ship in the same
  chunk**, just a later one. What moves is only *which* chunk. The case: it is
  the most expensive of the three (finding 8: a species resolver, two loaders,
  one new pass), it has **no consumer at all** until C3 authors the directed
  hunt, and D19 split C2 for size. `bloodline_ascensions` stays in C2a because
  the gate-rendering path needs at least one real kind to be built against, and
  it is a field on the ticket that already exists.
- **P10 - the dynamic row hook is NODE-LEVEL, not a grant expansion.** A node
  declares a row source (`"rows": "ascension_catalog"`); `present()` asks a
  provider for that node's extra rows and `applyGrant` routes the same source
  for validation. ⚑ It is deliberately not "the `ascend` grant expands into N
  rows", because §4.2 promises **C3's memorial the identical machinery** and a
  memorial row grants nothing at all. One hook, two consumers, or it is not the
  extension the plan said it was.
- **P11 - a gated row is an ordinary `Locked` row** (finding 2): greyed, inert,
  with its wall named. D18's clickable-and-refusing row is retired unbuilt.
- **P12 - the site reuses the `Signpost` EntityType and a placeholder position.**
  A distinct stone sprite is a new wire enum value plus client art, and D20 has
  already deferred the art. Its coordinates are one line of `api/zones/world.json`
  [PLACEHOLDER: near the starting campfire, so a playtest reaches it in seconds],
  moved with `WARP` and a JSON edit, not a chunk.
- **P13 - the success exit is a RE-READ, not a new message** (finding 6). On the
  socket closing, the client re-reads `/characters`; a character that is gone
  from its own account's list has ascended, and the client routes to character
  select instead of the `Connection lost` banner. ⚑ This is `CharacterSelect`'s
  own documented philosophy applied one screen earlier ("the server's rows are
  the only authority", `CharacterSelect.ts:105`), it costs no wire, and it is
  correct through a server restart mid-ceremony as well.
- **P14 - the failure surface is a system chat line to that player.**
  `drainAscensions` holds the `ClientUUID` on a failed result and nothing else,
  so it cannot speak *as* the stone (an `EntityMessage` needs the actor's entity
  id, which the drain never sees). One system line, and the character keeps
  playing, unchanged, having lost nothing. No wire, no banner, no rejection enum
  value.

### 12.4 C2a - the stone, end to end

Six steps, TDD red-first. Schema impact: **DB NONE (no migration) · FlatBuffers
ONE appended field (D21) · conf NONE**.

1. **The site and its dialog (content only).** `api/mobs/ascension-stone.json`
   on the `forest-sign` shape (role `creature`, `speed 0`, faction `townsfolk`,
   collision layer off Action, `interaction.range`), a `world.json` spawn entry
   (P12), and the authored tree: a `ready` node gated `minLevel: 30` whose one
   option carries the `ascend` grant and the catalog row source, and an
   unconditional `not-yet` node below it as the below-max-level preview
   (§4.2's "read-only preview" is **free**: it is L3's conditional-nodes-first
   authoring rule doing its job). Done when the server boots with 0 warnings and
   the stone talks.
2. **The dynamic row source** (`sys/interaction.go`, P10). A node-level source,
   one provider interface, wired into `present()`/`presentOptions` and into
   `applyGrant`'s validation. ⚑ **Extend `TestPresentAndApplyGrant_CannotDisagree`
   over generated rows** - that property test is the codebase's own discipline
   for exactly this, and a generated row is the first thing it has never seen.
3. **The ascension row source itself.** ⭐ **REWRITTEN AFTER STEP 2 (§12.7):
   there is no `ascend` GrantKind.** Step 2's source is node-owned, so the thing
   step 3 builds is a `RowSource` implementation serving
   `mobs.RowSourceAscensionCatalog`, wired with `SetRowSource` in `core/game.go`.
   It holds the catalog and answers two questions: what rows this player sees,
   and what taking one does.
   - **Addressing:** `OptionIndex` indexes `Catalog.All()`, the boot-stable
     sorted list. `GrantIndex` is **0 on every generated row** and is not an
     index space at all. Boot check: **`len(All()) <= 253`**, leaving **254** as
     the fixed index of D14's empty-pick row (255 stays the wire's no-grant
     sentinel and is never an option index).
   - **The rows:** P4 filtering against the player's unlock keys (finding 4,
     **not** the spellbook), gate evaluation into `Locked` plus the composed
     requirement text (finding 3), and D14's tightened empty state, where the
     "nothing left to teach" line is spoken only when there is neither a
     pickable nor a locked row.
   - ⚑ **D14's exhausted catalog still ascends, and something has to present
     that row.** The empty-pick "Ascend" row sits at the fixed index 254 and
     carries `""`, which `RequestAscension` already accepts (C1). It must be
     offered whenever the player can ascend at all, **including when every
     remaining entry is locked** (P1: max level is the whole entry price, and a
     fully-gated catalog still ascends). Without it a spent bloodline reads its
     farewell line and has no way to act on it.
   - ⚑ **Every takeable row carries `GrantIndex` 0, never 255.** The client
     sends a row only when `grantIndex !== NO_GRANT` (`Conversation.ts:114`), so
     a pickable row emitted with the sentinel is walked locally and never
     reaches the server. Nothing in Go can see that send, so the whole Go suite
     would stay green with the feature dead-ended in the panel.
4. **The player carries its bloodline.** Unlock keys and `BloodlineAscensions`
   stamped onto the player at join from the ticket (findings 4 and 5), exposed
   on the `learner` surface, plus the `bloodline_ascensions` condition kind and
   its evaluation in `conditionsPass`. ⚑ Every `learner` fake in the test suite
   grows with the interface; that is the mechanical cost of this step.
5. **The channel.** `UtilityAscend` in `skills/utility.go` (`CastTicks: 300`
   [PLACEHOLDER, Recall's value], `CastInterruptedByDamage: false` per P7), the
   validated pick stashed on `SkillComponent` and **cleared by `CancelCast`**,
   `utilityPrecondition` refusing an empty stash, and `fireUtility` calling
   `ConnectionStateSystem.RequestAscension(p, key)`, the entry point C1 built
   and left unused. ⚑ Clearing the stash in `CancelCast` is what closes the hole
   a crafted `UseUtility{Ascend}` would otherwise open: pressed anywhere in the
   world it starts a channel that fires with nothing picked, and an empty stash
   must refuse rather than ascend for free. ⚑ The `UtilityKind` enum is
   wire-pinned; its codec pin test is part of this step.
   ⭐ **A NON-NIL STASH IS NOT A VALID PICK, and step 3 is what created that
   gap.** `ascensionRows.ApplyRow` validates the pick at CLICK time (unspent,
   gate passing) and stashes the key; nothing expires it, and the stash outlives
   the conversation. So `fireUtility` must re-run the SAME judgement at fire
   time, not merely check that something is stashed. `advanceCast` already
   re-checks preconditions at completion for exactly this class of reason, and
   a `quest_at_stage` gate is the concrete regressor: a player can pick a gated
   reward, abandon the quest that unlocked it, and complete the channel. ⚑ It is
   also why leaving the stash alive across a closed conversation is harmless:
   the fire-time check, not the click, is what makes the pick legitimate.
   ⚑ **DEATH MUST CANCEL THE CHANNEL, and nothing does that today.** P7 buys
   `CastInterruptedByDamage: false`, so damage flows straight through a
   ten-second cast and the site is not safe ground in any built sense (§4.5's
   "the site is safe ground" is a design intent with no mechanism behind it). If
   dying leaves the cast running, `advanceCast` fires at zero, P1 still passes
   against the live level, and a player ascends from their respawn point with a
   corpse behind them. Cancel the cast and clear the stash on death, pinned by a
   test.
6. **The confirm, and both ends of the outcome.** `confirm_seconds` on
   `ConversationOption` (`.fbs` + both codecs + the pin test), the countdown
   helper extracted from `DeleteDialog` and its modal drawn over the HUD (D21),
   the success re-read routing to character select (P13), and the failure line
   (P14).

**Verification:** Go tests per step, mutation-verified for every load-bearing
pin (the codebase's standing bar); vitest for the countdown helper and the
pick-list filter including the empty case; a `verify`-skill harness
`c2a-ascension.mjs` driving walk → dialog → pick → confirm → channel → character
select on a real level-30 character; sim batteries byte-identical; boot
0 WARN / 0 ERROR on both content paths. Named cases beyond the happy path:
**an exhausted catalog still ascends** (D14, zero unlock rows written), **a
gated entry renders locked and cannot be taken**, **death mid-channel ascends
nobody**, and **the below-max-level preview opens read-only**.

⚑ **Two harness gotchas ride forward from `c1-bloodline-seed.mjs`'s header**:
leave the world **through the product** (a page reload inside the stash window
resumes the live character), and the client renders **display names**, so
`FrostShield` arrives as "Frost Shield".

### 12.5 C2b - the bloodline on the select screen

> **⭐ THIS IS THE NEXT CHUNK, and C2a left it everything it needs.** Written up
> as a handoff on 2026-08-10, immediately after C2a closed. Schema impact,
> expected: **DB NONE · FlatBuffers NONE · conf NONE**. Account API plus the
> account screens; nothing in the world, nothing on the game wire.

**Why it is not optional.** Ascension frees a slot, and the create card still
goes to the FIRST empty slot rather than that one (§12.1 finding 7). So today
the loop is complete only for a **single-slot account**: ascend slot 2 while
slot 0 is empty and the only card offered aims at slot 0, which is exactly the
cut-off-from-its-bloodline case D15 exists to prevent. It is invisible in every
playtest so far because the harness character always occupies slot 0.

**Step 1 - `/characters` carries per-slot bloodline data** (D22).
`store.LoadBloodline(ctx, accountID, slotIndex)` already returns
`Bloodline{Unlocks []string, Ascensions int}` in one round trip, and
`accounts/characters.go`'s list handler is where it goes (it already serves
`MaxAliveCharacters` from `s.cfg`). ⚑ It is **per slot**, so a three-slot
account is three calls unless a per-account query is written; three is fine and
a wider query is an optimisation, not a requirement.

**Step 2 - the create card on every empty slot** (D15's client half).
`CharacterSelect.render` (`frontend/src/features/user-interface/account-screens/logic/CharacterSelect.ts`)
drops its `createOffered` latch, and `CharacterCreation` threads the chosen
`slotIndex` through `AccountsApi.createCharacter`. ⚑ **The server half has been
done since C1**: the create API takes `slotIndex` and already answers
`slot_taken` (409) and out-of-range (400), so this is a client change plus
handling those two refusals.

**Step 3 - the slot card says what it continues** (D22): the bloodline's gifts,
and the predecessor's name.
⛑ **THE PREDECESSOR NAME CARRIES D11'S PRIVACY LANDMINE, and it bites here
BEFORE the memorial.** `DiscardAnonymousAccount` renames **every** row of the
account to `'deleted_' || id`, sacrificed ones included, because names are
player-authored free text and erasure wins. A card that prints the graveyard
name unfiltered will one day read "Bloodline of deleted_4711". §12.5 owns that
filter now; C3's memorial inherits it.

**Step 4 - `c2b-bloodline-select.mjs`**: ascend from a NON-ZERO slot, prove the
heir can be aimed at that slot, and prove it boots holding the pick. ⚑ The
non-zero slot is the whole point: on slot 0 the bug is invisible.

**What C2a leaves in hand**

- The loop works end to end and is harness-driven: `c2a-ascension-site.mjs`
  drives pick → confirm → channel → character select (§12.11), so C2b can start
  from a real ascended account rather than hand-built rows.
- ⚑ Three harness gotchas that cost runs in C2a and will cost them again:
  the interact key needs a **~1.4 s hold**; the synthetic **"Leave." row** must
  be filtered out of any row count; and **the first browser run after a server
  restart usually dies at join** (re-run once before diagnosing).
- ⚑ `c1-bloodline-seed.mjs` must leave the world **through the product**
  (settings → character select), because a page reload inside the stash window
  resumes the live character; and the client renders **display names**, so
  `FrostShield` arrives as "Frost Shield". Both apply to any C2b harness that
  checks what an heir knows.
- ⚑ The ascension probe entry is `.claude/skills/verify/c2a-probe-reward.json`
  and is NOT installed: `api/ascension/` ships README-only until C3. Copy it in
  and restart to get a reward row; **remove it afterwards**, or `cp-defs` bakes
  it into the embedded copy.

### 12.6 What this pass did not change

§4's loop, §5's schema statement (still NONE at the database), D1–D18 except
where D19–D22 say otherwise, and C3's scope apart from P8 and P9 moving two
items into it. The catalog itself is still C3's; C2a is built and verified
against a **test-only** entry, because `api/ascension/` stays README-only until
C3 authors the seed (`CatalogFromFS` treats an empty directory as valid,
deliberately).

### 12.7 C2a step 2 as built - the row source is NODE-OWNED

**Built 2026-08-10, TDD red-first, every load-bearing pin mutation-verified.
Schema impact: DB NONE, FlatBuffers NONE, conf NONE, frontend NONE.**

The design in §12.4 step 2 said "a node-level source, one provider interface"
(P10) and §12.4 step 3 described rows hanging off an authored `ascend` option
with a bounds-check bypass. **Those two are incompatible, and P10 won.** What is
built:

- **A node declares its rows** (`"rows": "ascension_catalog"` →
  `mobs.RowSourceKind`, a closed parse table refused at boot). A source node
  **authors no options**, enforced at load, so there is exactly ONE index space
  and no bypass anywhere. It **must author lines**, because a generated list can
  legitimately come back empty and the lines are all the node has left to say
  (D14).
- **`sys.RowSource`** has two halves that must agree: `PresentRows` and
  `ApplyRow`, handed back the indices `PresentRows` put on the wire.
- **It is threaded as an ARGUMENT** through `present`/`presentOptions`/`applyGrant`
  rather than held on the system. Two reasons, both load-bearing: `present()`
  stays **pure**, which its own doc calls the entire point of the
  presentation/mutation split; and a new call site cannot silently forget the
  source, because it does not compile without one. The 60-odd existing test call
  sites pass a named `noRows`.
- **`applyGrant` routes a source node WHOLE to its provider, after the node's
  own conditions.** The gate has to stay above the branch: the provider judges
  its rows on their merits and has no idea which node it speaks for, so a
  skipped gate would let a crafted message walk past a condition the panel
  enforces. Mutation-verified.

**Why node-owned rather than option-hung:** one index space instead of two on
one wire field; no bounds-check bypass; and it is the only version that serves
**C3's memorial**, whose rows grant nothing at all. P10's "one hook, two
consumers" is not rhetorical, and the option-hung design would have served one.

**Findings**

1. ⭐ **A takeable generated row must NOT carry `GrantIndex` 255.** The client
   sends a row only when `grantIndex !== NO_GRANT` (`Conversation.ts:114`), so a
   pickable row emitted with the sentinel is walked locally and **never reaches
   the server**. Nothing in Go can observe that send, so the entire Go suite
   stays green with the feature dead-ended inside the panel. The test fake
   emitted 255 and was corrected; generated rows use 0.
2. ⛑ **A permissive fake made the property test unable to fail.** Shifting the
   index the machinery hands the provider (`option+1`) left
   `TestPresentAndApplyGrant_CannotDisagree_OnGeneratedRows` green, because the
   fake accepted every index. It now accepts **exactly what it presented**, and
   the same mutation reddens it. A fake that cannot refuse cannot verify a
   contract about refusal.
3. ⚑ **The empty-source prune is correct by accident, so it is pinned.**
   `pruneEmptyDestinations` keys on `len(node.Options) > 0`, which is false for a
   source node, so a link to a currently-empty catalog survives as a lore leaf.
   That is exactly D14's requirement, and one line of "tidying" reverses it.
4. ⚑ **`chunk3b-ii-conversation.mjs` is RED AT HEAD, 25/31**, proven by
   stash-build-rerun on 2026-08-10: the same six legs fail identically before and
   after this work (the Leave-row click reports `control detached before the
   click`, and the Wanderer legs never reach their actor). **Do not read it as a
   regression in whatever you just changed.** Fixing the script is unowned.

**Owed by step 3, both consequences of this design**

- ⚑ **A `RowSourceKind` that parses with no provider behind it is a permanently
  empty list** - the exact twin of C1's "a condition kind nothing evaluates is a
  permanently locked row". Nothing today makes that loud. When step 3 wires the
  provider in `core/game.go`, add the guard: a `cmd/aurad` content test tying
  every authored row source to a kind the provider actually serves.
- ⚑ **`SetRowSource` has no caller yet.** Forgetting it in step 3 shows no rows
  and fails no Go test; the harness leg that asserts rows appear is what catches
  it.

**Verification:** 8 new `sys` pins + 4 new `mobs` loader pins, red first; **four
mutations** (skip the node gate, count a source node as authored, shift the
provider's index, drop the nil guard) each red, each reverted. Full Go suite
**0 FAIL** apart from the documented `TestDwell` flake (9/20, inside its recorded
HEAD range). Both boot paths **0 WARN / 0 ERROR**. `c2a-ascension-site.mjs`
**9/9** unchanged.

### 12.8 C2a step 3 as built - the ascension row source

**Built 2026-08-10, TDD red-first, every load-bearing pin mutation-verified.
Schema impact: DB NONE, FlatBuffers NONE, conf NONE, frontend NONE.**

The step-2 design held: there is no `ascend` GrantKind, and the stone's rows come
from `sys/ascension_rows.go` serving `mobs.RowSourceAscensionCatalog`, wired with
`SetRowSource` in `core/game.go`.

**What changed**

| Layer | Change |
| --- | --- |
| `ascension/catalog.go` | `MaxEntries = 254` refused at boot (the wire index cap) · `CatalogOf` for entries already in hand · All()'s order is now documented as the WIRE CONTRACT |
| `sys/ascension_rows.go` (new) | `ascensionRows`: the rows, their gates, the empty pick, and the pick's validation + stash |
| `sys/interaction.go` | `learner` gains `BloodlineUnlocks()` |
| `model/player.go` + `player/player.go` | `BloodlineUnlocks` / `SetBloodlineUnlocks`, in memory only |
| `sys/state.go` | the ticket's keys are KEPT on the player at join, beside the spellbook seed |
| `skills/component.go` | `PendingAscension *string`, cleared by `CancelCast` |
| `core/game.go` | `interactionSys.SetRowSource(sys.NewAscensionRows(gc.AscensionCatalog))` |
| `api/mobs/ascension-stone.json` | the gated `catalog` node and the row that leads to it |
| `cmd/aurad` | the unserved-row-source guard §12.7 owed, and the gating pin below |

**Findings**

1. ⛑ **AN UNGATED ROW-SOURCE NODE BECAME THE LEVEL-1 GREETING**, so a fresh
   character was shown the reward list and could take a row. Found by the
   harness, not by a Go test. `present()` makes the FIRST node whose conditions
   pass the greeting, and the `catalog` node was authored unconditional between
   the gated `ready` and the unconditional `root`. ⚑ **L3's loader rule does not
   cover this**: it refuses a conditional node sitting BELOW an unconditional
   one, which is a different mistake. ⚑ And the same gate is load-bearing a
   second time: `applyGrant` validates a row against its NODE's conditions
   before the row source ever sees it, so an ungated node also let a crafted
   message stash a pick below the cap. **The rule to carry: a node that is not
   meant to be a greeting must be gated so it cannot be selected as one.**
   Pinned, and the pin was mutation-verified against exactly this content.
2. ⚑ **The filter reads SPENT KEYS, never the spellbook**, and the probe reward
   is FrostShield precisely because it is a Troll drop: a player can know the
   skill from the world without their bloodline ever having bought it, and
   `HasDiscovered` would hide a reward they are still owed. Mutation-verified.
3. ⚑ **The index is the position in `All()`, not in the filtered list.** A
   filtered list renumbers itself every time the bloodline spends something, so
   a row's index would name a different reward after every ascension.
   Mutation-verified.

**Decisions taken inside the step (PO may veto)**

- ⭐ **The empty pick is offered ONLY when nothing is pickable**, which narrows
  §12.4's "offered whenever the player can ascend at all". Ascending with no
  gift while rewards sit on the same screen is strictly worse than taking one,
  so offering it there is a misclick trap on an irreversible act. **D14 and P1
  are both still satisfied**: an exhausted catalog offers it, and so does one
  where every remaining entry is locked (max level stays the whole entry price).
- **Taking a row STASHES, it does not ascend.** The channel spends the stash
  (step 5), so a click is never the irreversible act. `CancelCast` clears it.
- **The requirement text is composed into the row's `Text`**, since the wire
  carries `required_level` for the teach_skill wall and D18 chose not to buy a
  second field. ⚑ **Owed by step 6:** the client draws the wall as the literal
  `level ${row.requiredLevel}`, so a gated ascension row currently reads
  "level 0" beside its text. Unreachable in-game until C3 authors a gated entry.

**Verification**

- **13 `sys` pins + 2 `ascension` pins + 2 `cmd/aurad` pins**, red first.
- **Seven mutations, each red, each reverted**: filter on the spellbook, index
  the filtered list, emit the no-grant sentinel, suppress the empty pick
  whenever any row exists, apply without re-checking the gate, author a row
  source the provider does not serve, and un-gate the catalog node.
- Full Go suite **0 FAIL** apart from the documented `TestDwell` flake. Both
  boot paths **0 WARN / 0 ERROR**.
- ⭐ **`c2a-ascension-site.mjs` 14/14 with the probe entry installed**
  (the reward row renders, is the only row, and is takeable), and **12/12 with
  3 skips** on stock content, where D14's ascend-anyway row is what appears.

### 12.9 C2a step 4 as built - the bloodline count and its gate

**Built 2026-08-10, TDD red-first, every load-bearing pin mutation-verified.
Schema impact: DB NONE, FlatBuffers NONE, conf NONE, frontend ONE cosmetic fix.**

Step 3 had already landed this step's unlock-keys half, so what remained was
D18's tier B: the ascension COUNT, and the condition kind that reads it.

| Layer | Change |
| --- | --- |
| `items/mobs/interaction.go` | `ConditionBloodlineAscensions` + parse table · a non-positive threshold is a boot error |
| `sys/interaction.go` | `learner.BloodlineAscensions()` · the `conditionsPass` arm |
| `sys/ascension_rows.go` | its progress line, "3 ascensions in this line (0/3)" |
| `model/player.go` + `player/player.go` | `BloodlineAscensions` / `SetBloodlineAscensions` |
| `sys/state.go` | stamped at join from the ticket, beside the keys |
| `frontend/.../Conversation.ts` | the level wall is drawn only when `requiredLevel > 0` |

**Findings**

1. ⭐ **`BloodlineAscensions` finally has a reader.** It has ridden the play
   ticket since C1 with nothing on the other end (§12.1 finding 5), so until
   this step it could have been deleted without a test going red. The whole
   tier-B claim, a cross-life count that costs no migration, rests on that one
   carriage; it is now pinned at the join path and mutation-verified.
2. ⛑ **The "level 0" wall was REACHABLE, not theoretical.** §12.8 recorded it as
   unreachable until C3 authors a gated entry; the gated probe showed it
   immediately, rendering `Frost Shield - locked: 3 ascensions in this line
   (0/3)level 0`. `requiredLevel` is the teach_skill wall and nothing else, so a
   row locked for any other reason carries 0 and the unconditional wall
   contradicts the requirement the row already names. Fixed in `Conversation.ts`
   rather than deferred to step 6, and the harness now asserts its absence.
3. ⚑ **A threshold of zero or less is refused at boot.** It would pass for every
   character alive, which is an authored gate that does nothing: the
   silently-inert-content class the refuse-at-boot discipline exists for.
4. ⚑ **The kind names its scope**, and that is D18's rule rather than a style
   choice: `bloodline_ascensions`, never a bare `ascensions`. The per-life
   vs. cross-life line is the entire cost model, and an ambiguous authored key
   is how a migration-costing gate gets authored by accident. Pinned.

**Verification:** 3 `mobs` pins + 3 `sys` evaluator pins + 2 join-path pins, red
first. **Three mutations, each red, each reverted**: drop the ticket carriage,
make the gate always pass, accept a non-positive threshold. Full Go suite
**0 FAIL**; vitest **246/246**; typecheck clean; both boot paths
**0 WARN / 0 ERROR**. ⭐ **`c2a-ascension-site.mjs` 15/15** with a
veteran-gated probe: the count reaches the gate through /select, the ticket, the
join stamp and the render path, and the row reads
`Frost Shield - locked: 3 ascensions in this line (0/3)`.

⚑ **`kills_this_life` is still C3's** (P9), unchanged by this step.

### 12.10 C2a step 5 as built - the ceremony's channel

**Built 2026-08-10, TDD red-first, every load-bearing pin mutation-verified.
Schema impact: DB NONE · FlatBuffers ONE appended enum value · conf NONE ·
frontend one label.**

| Layer | Change |
| --- | --- |
| `api/schema/client.fbs` | `UtilityKind.Ascend = 3`, appended · regen (Go + TS) · codec pin |
| `skills/utility.go` | `UtilityAscend`, `CastTicks: 300` [PLACEHOLDER], and NO damage interrupt (P7) |
| `skills/component.go` | ⭐ `CompleteCast` split out of `CancelCast` |
| `sys/ascension_rows.go` | `ValidatePick` · taking a row now STARTS the channel |
| `sys/interaction.go` | `AscensionSource` = `RowSource` + `ValidatePick` |
| `sys/skills.go` | `ConnState.RequestAscension` · the `ascension` seam · the press drop · `applyAscension` |
| `sys/state.go` | `handleDeath` cancels the running cast |
| `core/game.go` | ONE source object wired into both systems |
| `frontend/.../Utilities.ts` | the cast bar's label, "Ascending" |

**Findings**

1. ⛑ **COMPLETION IS NOT CANCELLATION, and conflating them ate the pick.**
   `advanceCast` ends a cast before firing it and used `CancelCast` to do so;
   `CancelCast` also drops the ascension pick (the step-3 security property), so
   by the time `fireUtility` ran the stash was already nil and every ceremony
   completed as a no-op. Split into `CompleteCast` (clears cast state) and
   `CancelCast` (that plus the pick). The two verbs differ by exactly what a
   cancel additionally throws away.
2. ⛑ **DEATH LEFT THE CHANNEL RUNNING**, and the plan's suspicion understated
   it: the dead player's whole `SkillComponent` is STASHED and re-installed on
   respawn, cast state included, so the ceremony would have resumed and fired at
   the campfire. ⚑ The same hole exists for Recall and Camp; one line in
   `handleDeath` closes all three.
3. ⛑ **A PIN WAS GREEN WITH ITS SUBJECT DELETED.** The crafted-press test
   asserted `IsCasting()` after the full 301 updates, by which time a
   wrongly-started channel has finished anyway; deleting the press guard left it
   green. It now asserts after the ONE update that processes the press, and its
   sibling uses a RECALL cast as the vehicle, because re-pressing the utility
   that is already casting is ignored by an older rule and so cannot distinguish
   the guard's presence from its absence.
4. ⚑ **The ceremony is NOT pressable**, and that is the design rather than an
   oversight: `UseUtility` is an argument-free global keypress, and an
   irreversible ceremony must not be startable by one (the same reasoning that
   keeps `StartFlight` off the enum). The kind exists for the CAST BAR and for
   `advanceCast`'s completion re-check. A crafted press is dropped silently,
   above the queue's cancel step so it cannot disturb another cast either.

**Verification:** 10 `sys` channel pins + 1 death pin + 1 codec pin, red first.
**Five mutations, each red, each reverted**: allow the crafted press, skip the
completion re-check, stop cancelling on death, stop clearing the pick on cancel,
opt into the damage interrupt. Full Go suite **0 FAIL**; vitest **246/246**;
typecheck clean; both boot paths **0 WARN / 0 ERROR**. ⭐ In-game, both probe
states run: an ungated pick shows **`Ascending 9.1s`** on the cast bar
(**12/12, 4 skipped**), and the gated probe still renders
`Frost Shield - locked: 3 ascensions in this line (0/3)` (**15/15, 1 skipped**).

**Owed by step 6**

- The confirm modal, the success re-read routing (P13) and the failure line
  (P14). ⚑ `applyAscension`'s refusals LOG and nothing else today; P14's system
  line is the shared surface for them and for the transaction-failure case.
- ⚑ The harness's probe now has THREE states (gated / ungated / absent) and its
  header says how to switch. Each proves something the others cannot.

### 12.11 C2a step 6 as built - the confirm, and both ends of the outcome

**Built 2026-08-10. C2a IS COMPLETE: the loop runs end to end in the browser.
Schema impact: DB NONE · FlatBuffers ONE appended field · conf NONE ·
frontend the confirm modal, the routing, and one extracted helper.**

| Layer | Change |
| --- | --- |
| `api/schema/server.fbs` | `ConversationOption.confirm_seconds:ubyte = 0`, appended · regen |
| `model/conversation.go` + `codec/gamestate.go` | the field, carried |
| `sys/ascension_rows.go` | 5 s on every TAKEABLE row, 0 on a locked one |
| `sys/interaction.go` | `sayToPlayer`, the per-player line |
| `sys/skills.go` + `sys/persist.go` | P14: one line for every way the ceremony fails to land |
| `common/logic/ConfirmCountdown.ts` (new) | the countdown, extracted from `DeleteDialog` |
| `HUD.html` / `HUD.less` / `Conversation.ts` | the in-world confirm modal |
| `AccountFlow.ts` + `Backend.ts` | P13: the character-gone re-read, and the ORDER that makes it real |

**Findings**

1. ⛑ **P13 WAS DEAD CODE UNTIL THE ORDER WAS FIXED, and only a console listener
   found it.** `Backend.onclose` checks `isJoinInFlight()` first, which is
   `playing !== null` and therefore true for the whole session, so that branch
   swallows every close. An ascension was being answered by retrying `/select`
   against the character the server had just retired: **HTTP 404**, plus an
   error about a ticket, at the end of a ten-second ceremony. ⚑ The screen was
   RIGHT either way (the retry's own catch falls back to character-select),
   which is exactly why nothing else could have caught it. The check now runs
   first and costs one `/characters` round trip on a genuine drop.
2. ⚑ **The bare "Failed to load resource" console line names no URL.** The
   harness now records `HTTP <status> <url>` from a `response` listener, which is
   what turned "a 404 somewhere" into a one-line diagnosis.
3. ⚑ **Only a takeable row carries a countdown.** A locked row is inert on both
   ends, so holding a player in front of one would be friction with nothing
   behind it.
4. ⚑ **What was shared with `DeleteDialog` is the LOGIC, not the dialog.** The
   delete dialog lives in the account screens, which only exist outside the
   world; this one is drawn over the running game. The countdown was the only
   thing both could use, and its two comments (hardcoded on purpose, and
   friction rather than a security control) travelled with it.

**Verification:** 3 new `sys` pins for the confirm field · full Go suite
**0 FAIL** apart from the documented `TestDwell` flake (measured **8/20**, inside
its 7-10/20 HEAD range) · vitest **246/246** · typecheck clean · both boot paths
**0 WARN / 0 ERROR**. ⭐ **`c2a-ascension-site.mjs` 18/18, 0 console errors**,
driving the whole loop: pick → `Confirm (5)` disabled → nothing started → the
button arms → confirm → `Ascending 9.1s` → the character is spent → character
select, with no "Connection lost" anywhere. ⚑ **Confirmed in the DATABASE, not
only on screen**: the run left `characters.sacrificed_at` set on the harness
character and a `bloodline_unlocks` row `(account, slot 0, FrostShield)`.

**What C2a does NOT close**

- **C2b is still owed** (D19): the create card on every empty slot, and the
  bloodline on the slot card. ⚑ Until then the loop is complete only for a
  **single-slot account**, because the create card still goes to the first empty
  slot rather than the one whose bloodline you just fed.
- The three-state probe (gated / ungated / absent) stays a manual switch; each
  state proves something the others cannot, and its header says how to move.

### 12.12 C2b design pass - the bloodline on the select screen

> **⭐ THIS IS THE PLAN FOR THE NEXT CHUNK.** Written 2026-08-10 against the
> §12.5 handoff, after reading the four files it names. Schema impact, stated up
> front and confirmed against the code: **DB NONE** (every fact the screen wants
> is already a persisted column: `bloodline_unlocks` rows, `sacrificed_at`,
> `characters.name`) · **FlatBuffers NONE** (nothing here touches the game wire;
> this is the accounts HTTP/JSON surface and the account screens, both of which
> live entirely outside the world) · **conf NONE** (`maxAliveCharacters: 3`
> already governs the slot count and is already served on the list response).
> The one new store read needs **no migration**.

**What C2b is for, restated in one line.** Ascension frees a slot; the create
card must be aimable at *that* slot, and the player must be able to see which
slot is which. Without it the loop is complete only for a single-slot account
(D19 recorded that gap deliberately).

#### 12.12.1 What the plan-check found

Five deltas between §12.5's handoff and the code as it stands. None of them
changes the chunk's scope; three change how a step is built.

1. **⚑ `LoadBloodline` cannot serve the card, and §12.5's "three calls is fine"
   was written before the name requirement existed.** It returns
   `{Unlocks, Ascensions}` and nothing else, so the predecessor's name (step 3)
   is a second read on top of it - six round trips for three slots, and the
   second one does not exist yet. **This is not the "wider query is an
   optimisation" the handoff waved off; it is a different read.** So: a new
   store method serving only the list handler, and `LoadBloodline`'s signature
   is left alone because it rides the `/select` ticket path (`characters.go:319`)
   where a name is dead weight.
2. **⚑ The bloodline cannot hang off `characterView`.** The rows that carry a
   bloodline's history are the **sacrificed** ones, which is exactly what
   `AliveCharacters` excludes by design ("ALIVE ROWS ONLY", `characters.go:195`),
   and an empty slot has no character row at all to hang it on. It is keyed by
   **slot**, so it travels as its own per-slot array on `listCharactersResponse`.
   That response's "character-select's data and NOTHING ELSE" comment is
   satisfied rather than strained: this is select-screen data about slots, not a
   fact about the session that wandered in.
3. **⛑ The `deleted_` filter must be EXACT-MATCH, not a prefix test.** The
   rename writes `name = 'deleted_' || id` (`characters.go:418`), so the filter
   compares against that expression. A `LIKE 'deleted_%'` test would silently
   erase any player-authored name beginning with those characters, and nothing
   in `auth.ValidateCharacterName` forbids one.
   ⚑ Note for whoever reads this later: after `DiscardAnonymousAccount` the
   account's credentials row is gone, so those rows are hard to reach from a
   logged-in select screen *today*. The filter still ships here, because §12.5
   assigns it here and **C3's memorial inherits it** - and the memorial is a
   shared, public list where the failure is a stranger reading `deleted_4711`.
4. **⚑ D15's pointer semantics reach into the client.** `createCharacterRequest.SlotIndex`
   is a `*int` precisely so "not sent" and "slot 0" stay different requests
   (`characters.go:52`). The **home mount must keep omitting it** - a client
   that starts sending `0` on the first-ever creation turns a server-assigned
   slot into a client-chosen one and would 409 on a stale first slot. So
   `AccountsApi.createCharacter` grows an **optional** parameter that is
   serialized only when present.
5. **⚑ Gift names need a name→displayName lookup that does not exist.** Unlock
   keys are skill **names** (D17, `FrostShield`); `Skills.ts` keys its catalog by
   **id** and offers only `skillDisplayName(id)`. Four skills override their
   display name (`Call for Aid`, `Damage-Burst`, `Long-Range Strike`,
   `Hold the Line`), so the CamelCase split is not sufficient on its own.
   ⚑ And the catalog is fetched at *import* (`Skills.ts:293`) while character
   select renders on cold boot, so a lookup that only consults the catalog can
   lose the race and print a raw key. Both halves are handled in step 3.

#### 12.12.2 Decisions taken in this pass

- **⭐ D23 - EVERY slot card carries its bloodline line, not only the empty
  ones.** PO, 2026-08-10, against a two-option prompt. D22 mandated the empty
  card; this widens it to the occupied card as well, so a player can see at a
  glance which of their three slots is the deep one and which is a fresh start.
  ⚑ The consequence is that the per-slot payload is served for **every** slot
  rather than only the empty ones, which is also the simpler server: one uniform
  read, no "which slots are empty" logic on the write side of the response.
  ⚑ The occupied card gets the **counts** (`2nd life · 1 gift`), not the gift
  list - the living character's own spellbook already answers "what do I know",
  and the card is the densest element on the screen.
  ⚑ **A slot with NO history renders no bloodline line at all** (`ascensions > 0
  || unlocks.length > 0`). This is the obvious reading of the ruling rather than
  a second decision, and it is written down because without it a brand-new
  account prints `1st life · 0 gifts` on every card in the game - noise on the
  one screen every player sees first, and not the case the prompt showed.
- **D24 - an erased predecessor DROPS THE NAME LINE; nothing is invented in its
  place.** PO, 2026-08-10. The card still says it continues a bloodline, still
  counts the lives spent and still lists the gifts; only the "of <name>"
  sentence is absent. Rejected: a placeholder like "a forgotten life", because
  this screen is otherwise strictly factual and C3's memorial would then have to
  invent the same string a second time. ⚑ On the wire this is a
  **`predecessorName` that is simply absent**, so the filter lives in one place
  (the SQL) and the client renders whatever arrives.

#### 12.12.3 Proposals adopted without a choice prompt (PO may veto any)

- **P15 - the new read is `SlotBloodlines(ctx, accountID) (map[int]SlotBloodline, error)`,
  ONE method, per account, keyed by slot.** Not a loop over `LoadBloodline`
  (finding 1: it cannot answer the name anyway), and not a widening of
  `LoadBloodline` (finding 1: the ticket path does not want a name). It is two
  simple grouped queries merged in Go rather than one clever query - unlocks
  grouped by slot, and history (count + newest sacrificed name) grouped by slot -
  because each half is then readable on its own and neither needs a lateral.
- **P16 - the predecessor is the MOST RECENTLY sacrificed row in that slot**
  (`ORDER BY sacrificed_at DESC LIMIT 1`), i.e. the life the heir directly
  continues, not the founder. That is what "continue the bloodline of X" means
  to a player standing at the card.
- **P17 - gift names resolve CLIENT-SIDE, falling back to the raw key.**
  `Skills.ts` gains a by-name map built in `loadSkillCatalog` plus
  `skillDisplayNameFor(name)` (finding 5). ⚑ **Server-side resolution was
  considered and rejected**: `package accounts` "depends on store + auth +
  origins AND NOTHING ELSE FROM AURA" (`server.go:5`, invariant ③), and
  importing the skill catalog there to prettify four strings would spend that
  invariant on cosmetics.
  ⭐ **CORRECTED BEFORE STEP 3: the fallback is the RAW KEY, not a CamelCase
  split.** The draft said "split the key when the catalog has not arrived", and
  `skills.DeriveDisplayName`'s own comment forbids exactly that - the rule is
  *"computed server-side so the client never re-implements the rule"*, and the
  four skills that author an override (`Call for Aid`, `Damage-Burst`,
  `Long-Range Strike`, `Hold the Line`) are precisely the cases a client-side
  copy gets wrong. Degrading to the identifier is also the convention already in
  the file: `skillDisplayName(id)` answers `Skill #<id>`. ⚑ The cost is a
  transient `FrostShield` instead of `Frost Shield` if a cold boot renders before
  the catalog lands - and the catalog fetch starts at bundle evaluation, two API
  round trips before this screen can draw, with every later `refresh()`
  re-rendering. If that flash is ever seen, the fix is awaiting the catalog, not
  copying the rule.
- **P18 - `slot_taken` routes through `refreshWithMessage`.** It is the
  documented self-correcting answer to every stale-view case
  (`CharacterSelect.ts:105`), and a create card aimed at a slot another tab just
  filled is exactly that case. `slots_full` and a 400 out-of-range stay
  unreachable from a fresh render and get no special handling beyond the generic
  error already shown.

#### 12.12.4 The steps

Each step is TDD red-first, and each names the pin that must fail before the
code exists.

**Step 1 - `store.SlotBloodlines`, the per-account read** (P15, P16, finding 3).
New `SlotBloodline{Unlocks []string, Ascensions int, PredecessorName string}`
in `pkg/aura/store/ascension.go`, beside `Bloodline` and its comment. Two
queries in one method: unlocks grouped by `slot_index`, and from
`game.characters` the sacrificed count plus the newest sacrificed name per slot
with the exact-match `deleted_` filter (`CASE WHEN name = 'deleted_' || id THEN
NULL ELSE name END`, or the equivalent `NULLIF`).
*Red first:* `ascension_test.go` pins - a slot with two sacrifices reports
`Ascensions: 2` and the **newer** name; a slot whose predecessor was renamed by
`DiscardAnonymousAccount` reports the unlocks and an **empty** name; an account
with no history reports an empty map, not an error. ⚑ These are `db-test` pins
(`AURA_TEST_DB_URL`), so "green without Postgres" is not a pass here.

**Step 2 - `/characters` carries the per-slot array** (D22/D23, finding 2).
`listCharactersResponse` gains `Slots []slotBloodlineView` with
`{slotIndex, unlocks, ascensions, predecessorName}`; `handleListCharacters`
calls the new read once and emits one entry per slot index `0..MaxAliveCharacters-1`,
including slots with no history at all (uniform shape, D23).
*Red first:* an `accounts_test.go` pin that a list response for an account with
a sacrificed slot 1 carries that slot's unlocks and predecessor, and that a
never-touched slot 0 is present with zeroes.

**Step 3 - the cards render it** (D23, D24, P17).
`AccountsApi` grows `SlotBloodline` and `CharacterList.slots`.
`Skills.ts` grows the by-name map and `skillDisplayNameFor`.
`CharacterSelect.render` renders, per slot: on an **occupied** card the counts
line (only when the slot has a history, D23); on an **empty-with-history** card
the "Continue the bloodline of X" label
(name omitted per D24), the lives-spent count and the gift list as display
names; on an **empty-no-history** card the plain "Create character" it shows
today. New `.less` rules beside the existing `.slotCard` block.
*Red first:* a new `CharacterSelect.test.ts` under jsdom - see §12.12.5.

**Step 4 - the create card on every empty slot** (D15's client half, finding 4).
`render` drops its `createOffered` latch so every empty slot below the cap gets
a create card; `onCreate` carries the **slot index** alongside the character
count; `CharacterCreation.show` holds it and passes it to
`AccountsApi.createCharacter(name, slotIndex?)`, which serializes `slotIndex`
only when it was given; `AccountFlow`'s two `show('home', 0)` call sites keep
passing nothing. `slot_taken` routes per P18.
*Red first:* a `CharacterSelect.test.ts` pin that an account holding slot 1 only
renders create cards on **both** slot 0 and slot 2 and that each reports its own
index; an `AccountsApi.test.ts` pin that `createCharacter(name)` sends a body
**without** a `slotIndex` key while `createCharacter(name, 2)` sends `2`.

**Step 5 - `c2b-bloodline-select.mjs`**, the in-browser proof, and the whole
point of it is that **slot 0 is not involved in the ascension**:
1. create A (lands slot 0), create B (lands slot 1) - two `hrnss_` names;
2. delete A, so slot 0 is empty *and* has no history;
3. play B, cheat it to max level, ascend it at the stone (reusing
   `c2a-ascension-site.mjs`'s driving code and the probe reward, §12.12.6);
4. on character select assert: slot 1 shows "Continue the bloodline of <B>" with
   its gift as a **display name**, slot 0 shows a plain create card, and both
   offer a create affordance;
5. create the heir **on slot 1**, play it, and assert it boots holding the gift -
   the same check `c1-bloodline-seed.mjs` makes, and the assertion that would
   have caught the D15 bug: on slot 0 it is invisible.

#### 12.12.5 Test strategy, and the one decision inside it

**`CharacterSelect.render` is pinned directly, not extracted.** The tempting
move was a pure `slotPlan()` module of the kind `SkillTooltip` and `MapScale`
are, but `CharacterSelect` imports exactly two things (`AccountScreens` and
`DeleteDialog`) and the runner is already jsdom, so a `vi.mock` of
`AccountScreens` whose `element()` returns a fixture panel containing
`.slotCards` and `.playingWarning` reaches the real `show()`. ⚑ **That matters
here specifically**: the bug C2b exists to fix (`createOffered`) lives in the
DOM-building loop, so a pure module extracted around it would be a lookalike
that cannot fail the way the product did.
⚑ `AccountFlow.test.ts` is not the model - it mocks the screens wholesale, which
is right for what it tests and useless for this.

⚑ The client must tolerate a **missing** `slots` field (`list.slots ?? []`), for
the same reason `decodeBody` does not set `DisallowUnknownFields`: version skew
between a deployed client and a deployed server is ordinary, and character
select is the screen where failing it would be unrecoverable.

Go side: `db-test` pins for step 1, `accounts_test.go` for step 2, and the
standing sanity tail (`go build ./...`, full `go test`, both boot paths clean).
Client side: `npm test` **and** `npm run typecheck`, and ⛑ **`npm run build`
before step 5's harness run** - a stale `frontend/dist` is invisible to vitest,
which is exactly how FrostShield's tooltip case was green in units and absent
from the served bundle (`plan-cc-and-retaliation.md` C2).

#### 12.12.6 Harness gotchas that already cost runs, carried forward from §12.5

- The interact key needs a **~1.4 s hold**; the synthetic **"Leave." row** must
  be filtered out of any row count; **the first browser run after a server
  restart usually dies at join** - re-run once before diagnosing.
- Leave the world **through the product** (settings → character select), never a
  page reload: a reload inside the stash window resumes the live character.
- ⚑ The reward probe `.claude/skills/verify/c2a-probe-reward.json` is **not
  installed** - `api/ascension/` is README-only until C3. Copy it in, restart,
  and **remove it afterwards** or `cp-defs` bakes it into the embedded copy.
- ⚑ `sys.TestDwell_TakeoffDropsAnInProgressCount` is a known high-rate flake
  (7-10/20 at HEAD). Measure before diagnosing; it is not C2b.

#### 12.12.7 What C2b does NOT do

The memorial, the authored catalog (`api/ascension/` stays README-only) and
`kills_this_life` all remain C3's (P8, P9). No graveyard view is written here -
step 1 reads one name per slot from the caller's **own** account, which is not
the shared public list D11 describes.

### 12.13 C2b step 5 as built - what the browser found

**Built 2026-08-10. `c2b-bloodline-select.mjs`, 12/12, 0 console errors, and it
found a real defect that is C2a's rather than C2b's.**

**The script's shape is the assertion.** It builds an account whose LIVING
character is in slot 1 and whose slot 0 is empty: create A (slot 0) → create B
aimed at slot 1 → play B, cap it, ascend it → delete A → read the select screen
→ create the heir on slot 1 → prove it boots holding the gift. ⚑ Every other
harness in the suite puts its character in slot 0, which is exactly why the D15
bug survived to be found by reading code rather than by playing.

⛑ **The delete of A moved AFTER the ascension**, and the first run is why: the
delete endpoint refuses a character the account is currently playing, and
**leaving the world does not release the registry slot the moment the screen
changes**. Deleting A seven seconds after leaving it was answered
`character_playing`; the dialog closed, the list re-read, and A was still there
while every later assertion quietly measured the wrong shape. The same window
makes Play answer `already_logged_in`, so `enterWorldFrom` retries.

#### ⛑ The defect: after an ascension the client cannot re-enter the world

**Symptom.** Create the heir, press Play, and nothing happens: no world, no
error, no banner. `/select` answers **200** every time - the ticket is minted -
and no join ever reaches the server.

**Cause.** `AccountSettings.leave()` has always recorded that **the client is
built to boot once and has no teardown path**, which is why "leave the world" is
a page reload. P13's ascension exit routed to character-select **in-client**,
landing in exactly the state that comment says does not exist: the server has
closed the socket, and the next `Play` sends its `JoinMessage` into a dead
WebSocket.

**Fix.** `onWorldSessionEnded` reloads instead of calling `start()`, after
clearing the reconnect token exactly as `leave()` does. Pinned in
`AccountFlow.test.ts` (mutation: restore `await start()` → red) and re-verified
end to end: **`c2a-ascension-site.mjs` still 18/18**.

**Why nothing caught it before.** Every earlier check stopped at *"we landed on
character select"*, and that part was always right - C2a's ledger even records
P13 being dead code with *"the screen was right either way"*. The state is only
reachable by **playing again afterwards**, which is the ascension loop's literal
next step and which no test took. ⚑ The generalisable form: **an exit path is not
verified until something is done AFTER it.**

#### Smaller findings

- ⛑ **The running `aurad` was stale for the whole first debugging round.**
  `go build ./...` type-checks and does not refresh `./aurad` (the standing
  CLAUDE.md gotcha), so the server was serving step 1's code: no `slots` field,
  and the client's version-skew guard rendered every slot as historyless. The
  database was correct throughout. ⚑ The guard working as designed is what made
  it look like a client bug.
- ⚑ **`\b` after "gift" matched nothing.** A card's `textContent` glues its
  children together - `"…2nd life · 1 giftPlayDelete"` - so there is no word
  boundary there and the obvious regex fails while the screen is perfectly
  correct. The verify skill records the same trap for `.slotLabel`.
- ⚑ **`clickIn` now names what it actually hit** (`elementFromPoint`), because
  "the click was delivered" and "the click reached the button" are different
  facts and only the second one matters.
- ⚑ The run's own database state is the strongest single artifact: slot 0
  `deleted_<id>` (the erasure rule), slot 1 sacrificed at level 30, the heir in
  slot 1 with `previous_character_id` chained to it, and one
  `bloodline_unlocks` row on slot 1.

### 12.14 C2b ledger - THE BLOODLINE ON THE SELECT SCREEN ✅ 2026-08-10, `a64f5b96`

**Five steps, TDD red-first, every load-bearing pin mutation-verified.
Schema impact: DB NONE · FlatBuffers NONE · conf NONE.** No migration, no wire
change, no new tuning value: every fact the screen shows was already a persisted
column, and the whole chunk is the accounts HTTP/JSON surface plus the account
screens, both of which live entirely outside the world.

**What shipped.** The ascension loop is now complete for a **multi-slot**
account, which is the one thing C2a deliberately left undone (D19):

- **`store.SlotBloodlines`** - one per-account read, two grouped queries merged
  in Go, serving only character-select. `LoadBloodline` is untouched: it rides
  the `/select` ticket path, where a predecessor's name is dead weight.
- **`/api/characters` carries `slots`** - a sibling of `characters`, one entry
  per slot up to the cap, `{slotIndex, unlocks, ascensions, predecessorName?}`.
- **Every slot card carries its bloodline** (D23): counts on an occupied card
  (`2nd life · 1 gift`), the continued life plus its gifts on an empty one, and
  **nothing at all** on a slot with no history.
- **Every empty slot offers creation, aimed at its own slot** (D15's client
  half), with `slot_taken` routed through the documented stale-view re-read.
- **`c2b-bloodline-select.mjs`**, the first harness in the suite whose living
  character is not in slot 0.

**Two PO rulings, D23 and D24** (§12.2 carries them): the bloodline line went on
*every* card rather than only the empty ones, and an erased predecessor drops
its name line rather than inventing a placeholder.

⛑ **THE CHUNK'S HEADLINE FINDING IS C2a's BUG, AND ONLY C2b's STEP 5 COULD SEE
IT: after an ascension the client could not re-enter the world.** Press Play on
the heir and nothing happened - `/select` answered 200, the ticket was minted,
and no join ever reached the server. `AccountSettings.leave()` has always
recorded that **the client is built to boot once and has no teardown path**,
which is why leaving the world is a page reload; P13's ascension exit routed to
character-select *in-client* and landed in exactly that unsupported state, with
the server's socket already closed. **An exit path is not verified until
something is done AFTER it** - every earlier check stopped at "we landed on
character select", and that part was always right. Fixed, pinned, and C2a
re-verified 18/18. §12.13 has the full account.

⛑ **A pin was green because its subject was unreachable**, the class this
project has now hit three times. "Three characters at a cap of three" never
reaches the at-cap branch at all: every slot the loop visits holds a character,
so the guard is never consulted and the test passes with it deleted (measured -
the mutation survived). The only arrangement where an empty slot coexists with a
full account is **a cap lowered under existing characters**, and that is the
fixture now.

⚑ **P17 was corrected before it was written.** The design said the display-name
fallback splits the CamelCase key; `skills.DeriveDisplayName`'s own comment
forbids it - the rule is *"computed server-side so the client never
re-implements the rule"* - and the four skills authoring an override are exactly
what a client-side copy gets wrong. The fallback is the raw key, matching
`skillDisplayName`'s existing `Skill #<id>`.

⚑ **The bloodline cannot hang off a character row**, and this is structural
rather than stylistic: a bloodline's history lives in the SACRIFICED rows, which
`AliveCharacters` excludes by design, and the slot it matters most for has no
character row at all because ascending is what emptied it.

⚑ Smaller: **`slot_taken` had never been added to the client's `ApiErrorCode`
union** despite the server answering it since C1 · the **stale `aurad`** cost a
full debugging round (`go build ./...` does not refresh the binary, and the
client's version-skew guard then made a server problem look like a client one) ·
**`\b` after "gift" matches nothing** in glued card text.

**Verification.** ~19 new pins (5 `store` db-test · 2 `accounts` · 12 vitest
across `CharacterSelect`/`Skills`/`AccountsApi`/`AccountFlow`), **15 mutations,
14 red on exactly the intended pin and the fifteenth surviving** (the unreachable
at-cap subject, refixtured). Go **0 FAIL** · `db-test` green · vitest
**264/264** (was 246 at C2a) · typecheck clean · `npm run build` · boot
**0 WARN / 0 ERROR**. Harnesses: ⭐ **`c2b-bloodline-select.mjs` 12/12** with
0 console errors and the whole chain confirmed in the database (slot 0
`deleted_<id>`, slot 1 sacrificed at 30, heir chained by
`previous_character_id`, one `bloodline_unlocks` row) · **`c2a-ascension-site.mjs`
18/18** re-run against the exit fix · **`chunk2-accounts.mjs` 24/24**, which owns
the account screens this chunk changed.

**What C2b does NOT close.** C3 still owns the memorial, the authored catalog
(`api/ascension/` stays README-only) and `kills_this_life` beside its content
(P8, P9). No graveyard view is written here.
