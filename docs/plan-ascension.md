# Plan: Ascension — the character-sacrifice loop

> **Status: DESIGNED 2026-08-04 (design session) — no chunk built yet.** This is
> the execution-order item "character-sacrifice loop" (GDD §5 meta-progression,
> pulled into v1 by the 2026-07-19 intermission-triage ruling, item 10), opened
> as persistence's first consumer. Inputs: a PO ↔ Antiterra design thread
> (Discord, 2026-08-03) + twelve PO rulings taken as choice prompts in this
> session. Backlog §36 is **ratified** here (its awaited design pass); backlog
> §41 got its scoping pre-ruling. Every number is [PLACEHOLDER] unless marked.

## 1. What this is, and its inputs

A max-level character can be **ascended** ("sacrificed" in old GDD language) at
a fixed world site: the character is permanently retired, the life's
accomplishments convert to **points**, and points buy **bloodline-scoped
rewards** that every future character in that slot starts with. The loop is the
GDD's living-starting-zone engine: voluntary, rewarding restarts.

Inputs, all read during the session:

- GDD §5 "Meta-Progression: Character Sacrifice" — the previously decided
  design. **This plan amends it in three places** (§3 below): the power rule,
  the acquisition model, and account→bloodline scoping.
- Discord thread PO ↔ Antiterra 2026-08-03 — the three acquisition options
  (random roll / point buy / milestones), the lore framing, the per-faction
  ascension idea, the Populous ascension-video reference.
- Backlog §36 (three slots, three bloodlines) — ratified; its open
  sub-questions are answered in §4/§5.
- Backlog §41 (fast travel) — only its "discovery scoping" question; pre-ruled
  per-character (§4, D12).
- Shipped machinery this plan consumes: `game.bloodline_unlocks`
  (insert-ready since migration 000001), `characters.slot_index` /
  `previous_character_id` / `sacrificed_at` + the sacrificed⊕deleted CHECK,
  the graveyard convention (names held forever), the quest ledger, persisted
  spellbook/loadouts, the milestone seeding path (Damage@L1 at creation), the
  interaction container (`teach_skill`'s siblings), the cast/channel path,
  and the character-creation flow from `plan-accounts-frontend.md`.

## 2. Decision ledger (all PO-ruled)

Rulings D1–D4 taken 2026-08-04 round 1, D5–D8 round 2, D9–D12 round 3.

- **D1 — power rule amended to WORLD-PARITY.** Replaces GDD §5's "breadth,
  never power" verbatim rule and its "explicitly forbidden" list. New rule:
  *every ascension reward must sit at a power level also obtainable in the
  world — variations of existing content (e.g. the same companion dealing a
  different damage type), cosmetics, or unique combinations; never a strict
  upgrade.* Accumulated breadth across loops MAY make a veteran stronger than
  a never-ascender — power is the point, to a degree. Any individual reward
  may NOT outclass world content. (The SWG-Hologrind rationale survives in
  weakened form: ascension must never be the only road to a power level.)
- **D2 — acquisition = point buy + achievement-gated specials.** Amends GDD
  §5's "choose one reward from a curated catalog". Points are previewed at the
  site before ascending; specific hidden/hard feats additionally gate specific
  catalog entries. Random roll rejected (PO least-favorite).
- **D3 — bloodline-wide, not account-wide.** Backlog §36 ratified; GDD §5's
  load-bearing word flips. Matches the shipped `bloodline_unlocks` shape.
- **D4 — lore framing: "Ascension", positive.** Closes the GDD §12 open
  question (sacrifice vs. sending away). Site/environment left to the world
  pass — the druid-stones "The Passing" sketch is the leading candidate, not
  locked.
- **D5 — v1 scoring reads only already-persisted state.** Points from skills
  unlocked (weighted by an authored **rarity** on skill JSON) + completed
  quest chains from the ledger. NO counter subsystem in v1 (kills-per-species,
  steps walked) — the achievement format must leave room for counters later
  without rework.
- **D6 — unspent points bank on the bloodline.** A per-slot balance survives
  across ascensions; expensive rewards may cost more than one life earns.
  Point-hoarding meta accepted as bounded by D1 (points only buy world-parity
  rewards).
- **D7 — the shop lives at the stone.** Ascension dialog previews earned
  points → catalog opens → buy → confirm → ceremony → character creation.
  Banked remainder is spendable at the *next* ascension (no shop access
  outside a ceremony in v1).
- **D8 — bloodlines are emergent, not authored.** A bloodline IS its
  accumulated unlocks + its graveyard names. No chosen lineage content. The
  per-faction-ascension idea from the thread stays a sanctioned later layer —
  the data model must not block it (see §4, site content).
- **D9 — v1 catalog: variant skills only, small seed.** ~5–10 entries
  [PLACEHOLDER]: damage-type variants of world abilities, at least one unique
  combination, at least one achievement-gated special behind a hidden quest.
  Cosmetics and race/start options join when `plan-avatar-system.md` lands —
  the catalog format reserves the categories.
- **D10 — ceremony = in-world sequence from existing vocabulary.** Channel at
  the stone, growing aura/light VFX, dissolve upward, → character creation.
  Skippable. The Populous-style video stays a sanctioned later upgrade.
- **D11 — memorial monument IS in v1 scope, simple version.** A prop in the
  starting zone; interacting lists ascended names (graveyard query — data
  already exists). Per D3 the display is per-account… no: names are global.
  ⚑ Display scope (all ascended names vs. per-bloodline grouping) is a §8
  open question; the GDD's intent is a shared monument all players see.
- **D12 — §41 pre-ruling: discovered-location state is per-character.** When
  fast travel eventually exists, discovery wipes on ascension — the fresh
  start re-walks the world (tunnel tutorial, death-penalty geography).

## 3. GDD & backlog amendments this plan carries

To be applied as chunk C0 (docs-only), so the GDD stays the single source of
decided design:

1. GDD §5: rewrite the reward paragraphs — world-parity rule (D1) replaces
   "breadth, never power" + the forbidden list; "account-wide" → "bloodline-
   wide" (D3); "choose one reward" → point buy + achievement gates (D2);
   loss-scope ⚑ resolved per §4 below; "sacrifice" language → "Ascension"
   with a note that the old term survives in schema column names.
2. GDD §12 open list: strike "Lore: sacrifice vs. sending away?" (D4) and the
   loss-scope line (resolved here).
3. Backlog §36: mark ratified → this plan; its five sub-questions answered
   (emergent D8 · no reset in v1, P5 · survives deletion, P6 · slot count
   stays [PLACEHOLDER] 3 · races interaction deferred with avatar plan).
4. Backlog §41: record the D12 scoping pre-ruling.
5. `docs/README.md` index line for this plan.

## 4. The loop, end to end

**Prerequisites (P1, proposal):** character at max level (30, the locked cap).
Nothing else — no quest gate in v1.

1. **Approach the ascension site** (one site in v1; location = world pass).
   The site is an interaction-container prop — same machinery as
   `teach_skill` NPCs — so a per-faction site later is more rows, not new
   code (D8 guard).
2. **Interact → ascension dialog.** Shows: what ascension is (lore text), the
   points this life would earn (itemized: N skills by rarity + M quest
   chains), the bloodline's banked balance, and the catalog with prices —
   achievement-gated entries visible but locked with their gate named
   (discoverability > secrecy here; the *recipes* stay secret, the *gates*
   don't). Below max level the dialog still opens read-only as a preview
   [PLACEHOLDER — cheap and answers "what am I working toward"].
3. **Spend.** Buy zero or more entries (balance = banked + this life). Each
   purchase is a `bloodline_unlocks` insert at commit time. No duplicates: a
   bought entry leaves this bloodline's catalog forever (P4).
4. **Confirm — the point of no return.** One explicit confirmation with the
   loss list spelled out.
5. **Ceremony (D10).** Channel at the stone [PLACEHOLDER ~10 s, interruptible
   only by walking away — not by damage; the site is safe ground], swelling
   VFX, dissolve upward. Skippable after first viewing.
6. **The transaction** (server, atomic — this is the "sacrifice transaction"
   deferred out of step 8a): set `sacrificed_at`; compute + credit earned
   points; debit purchases; insert `bloodline_unlocks` rows; write the
   memorial entry (implicit — graveyard rows ARE the memorial data). Crash
   anywhere → the whole thing rolls back and the character still lives.
7. **Character creation** opens in the same slot, `previous_character_id`
   chained. The successor is seeded at creation with every bloodline unlock —
   the same seeding path as Damage@L1 — at skill level 1.
8. **Loss scope (resolves the GDD ⚑):** everything character-bound dies with
   the row — spellbook, levels, skill points, combo discoveries, quest
   ledger, home campfire, discovered locations (D12, future). Survives: the
   name (graveyard/memorial, held forever by the existing UNIQUE), the
   bloodline's unlocks + banked points, the succession chain.

**Anti-inflation rule (P2, proposal):** bloodline-seeded spellbook entries do
NOT score points at the next ascension — only what the life itself earned
(entries acquired after creation). Without this, each generation starts with
last generation's points baked in and the economy inflates unboundedly.
Mechanically: seeded entries are excluded by provenance, which the seeding
path must therefore record (see §5).

**Scoring (all [PLACEHOLDER], tuning-open like the drop tables):**
`points = Σ skills(rarity weight) + Σ quest chains(weight)`. Rarity is a new
authored field on skill JSON (default common). Weights, prices, and whether
max level itself contributes a base grant are execution-session numbers.

## 5. Schema impact (stated per the standing rule)

**Yes — one new migration pair**, plus first-writers for shipped columns:

- **NEW `game.bloodlines`** (account_id, slot_index, points_balance,
  PRIMARY KEY (account_id, slot_index)) — the banked balance (D6) and the
  natural anchor for future bloodline fields. Balance is *materialized* at
  ceremony time, not derived — deriving from graveyard state would let later
  formula retunes silently rewrite everyone's balance.
- **`game.bloodline_unlocks`** — gets its first writer (the transaction).
  No shape change; `unlock_key` = catalog entry key.
- **`characters.sacrificed_at` / `previous_character_id`** — first writers.
- **Seed provenance (P2):** the persisted spellbook needs to distinguish
  bloodline-seeded entries from earned ones — likely one column on the
  spellbook/loadout table (execution session confirms the cheapest home).
- Rarity + catalog live in **content JSON, not the DB**. The catalog is a new
  content directory (e.g. `api/ascension/`) → it MUST be added to
  `contentSources` in `cmd/aurad/loaders.go` and ride `cp-defs`, or edits
  silently no-op (the standing landmine).
- Store tests need `AURA_TEST_DB_URL` (real Postgres) — the transaction is
  exactly the kind of code "green without Postgres" lies about.

## 6. Chunk breakdown

- **C0 — docs sync** (§3 amendments). Docs-only, small.
- **C1 — scoring + the transaction (server, no UI).** Migration
  (`game.bloodlines` + seed provenance), rarity field + loader, the points
  formula, the atomic ascension transaction, seeding successors from
  `bloodline_unlocks` with provenance. TDD against real Postgres; this chunk
  is done when a test can ascend a character and its successor boots seeded.
- **C2 — the stone.** Site prop + interaction dialog (preview, itemized
  points, catalog, purchase, confirm), the ceremony sequence (channel + VFX +
  handoff to character creation), wire additions as needed. Headless smoke
  via the `verify` skill.
- **C3 — memorial + catalog seed.** Monument prop + names listing (graveyard
  query); author the ~5–10 entry catalog (D9): variant skills via the
  add-content pipeline, one combination, one hidden-quest-gated special (the
  hidden quest itself may already exist or is authored here).

Sequencing: C0 anytime; C1 → C2 → C3. Each chunk its own execution session,
per working style.

## 7. Test strategy

- **C1:** Go tests vs. real Postgres — transaction atomicity (crash-injection
  around each write), no-duplicate purchase, insufficient balance, the
  anti-inflation exclusion, successor seeding, the sacrificed⊕deleted CHECK
  stays unreachable. Scoring formula as pure unit tests.
- **C2:** vitest for pure dialog logic (itemization/affordability);
  Playwright smoke: walk to stone → dialog → buy → confirm → land in
  character creation → new character has the skill.
- **C3:** memorial listing renders graveyard names; catalog entries pass the
  add-content verification tail (wire hand-sync, registry pins).
- Sim batteries must stay byte-identical (nothing here touches combat); boot
  0 errors 0 warnings with the new content directory.

## 8. Open questions & deferred

- **Site location + environment art** — world/content pass (druid stones
  candidate). The dialog *text* ("The Passing") needs a lore write.
- **Memorial display scope** (D11 ⚑): one shared monument listing all
  ascended names (GDD intent) vs. per-bloodline grouping — PO call at C3.
- **All numbers**: rarity weights, quest weights, prices, catalog size,
  channel length, preview-below-max-level — [PLACEHOLDER], tuning-open.
- **Deferred by ruling:** counter-based achievements (D5) · cosmetics + race/
  start-option rewards (blocked on `plan-avatar-system.md`, D9) · per-faction
  ascensions (D8 layer) · ascension video (D10 upgrade) · shop access outside
  ceremonies (D7) · bloodline reset (P5 — YAGNI until a player actually
  regrets a slot).

## 9. Proposals adopted without a choice prompt (PO may veto any)

- **P1** max level is the only prerequisite.
- **P2** bloodline-seeded entries don't score (anti-inflation).
- **P3** the naming: this plan says **achievements** for feat-gates; the word
  "milestones" stays reserved for `api/milestones/` level unlocks.
- **P4** no duplicate purchases — bought entries leave the bloodline's
  catalog.
- **P5** no bloodline reset in v1.
- **P6** a bloodline survives plain character deletion (schema already
  encodes this — no FK from `bloodline_unlocks` to characters).
- **P7** the ceremony channel is interruptible by walking, not by damage.

## 10. Chunk ledgers

*(appended per execution session — none yet)*
