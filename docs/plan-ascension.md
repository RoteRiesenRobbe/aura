# Plan: Ascension — the character-sacrifice loop

> **Status: DESIGNED 2026-08-04, SCOPE CUT 2026-08-05 (D13), CODE-REVIEWED
> 2026-08-05 (D15–D17), CONDITIONS ADDED 2026-08-09 (D18).
> ⭐ C1 BUILT 2026-08-10 (§11) — C2 and C3 remain.**
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
