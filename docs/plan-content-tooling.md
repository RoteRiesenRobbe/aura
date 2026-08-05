# Plan: Content tooling — editors, validation, and the authoring pipeline

> **Status: DESIGNED 2026-08-05 — no chunk built.** Planning session opened by
> the PO question *"do we have a plan to move all current content in an
> editor?"* — the answer was "two thirds exists, no unified plan," and this
> document is that plan. Six rulings D1–D6 taken the same day as choice
> prompts (two rounds).
>
> ⚑ **Execution is queued AFTER ascension C1 (D6).** CLAUDE.md's declared next
> session stays the ascension sacrifice transaction; nothing here jumps that
> queue.
>
> ⚑ **Schema impact: NONE. No migration.** Everything in this plan is dev-side
> tooling, static content files, and boot/CI validation. The one
> persistence-adjacent piece — the D5 content-vs-persisted-data rules — is
> *policy enforced by a validator*, not schema (§5).

## 1. What this is

The PO's target state, verbatim in spirit: **for every content type and knob
in the game, either a simple config for things changed rarely/deep in the
code, or a direct editor for things touched often** — prop placement, spawns,
quest texts, quest rewards.

This plan gets there by building on what already shipped rather than starting
an "editor project":

- **The in-game zone editor** (`&textures`, `docs/manual-zone-editor.md`)
  already covers the placement half: props, mob/NPC spawns (wander/patrol/idle
  knobs), campfires, dark areas, anchors, terrain, bounds.
- **`-content ../api` disk loading** already killed the rebuild wall for
  content edits (restart-only), and the catalog-over-HTTP pattern
  (`GET /skills` / `/mobs` / `/quests`) already killed the frontend dual-write
  walls — *"serving a catalog is the house answer"*
  (`manual-content-authoring.md` §Known hand-sync points).
- **`docs/manual-content-authoring.md`** (750 lines) already turned the
  authoring folklore into reference.

What is genuinely missing, and what this plan builds:

1. **Validation exists only at server boot** — no way to check content without
   starting the game, no CI gate, no ID discipline. (§4.1, chunk C0)
2. **No schema assistance** while editing the definition JSON. (§4.2, C1)
3. **The save loop is manual** — export → download → copy into `api/` →
   restart, for every tool. (§4.3, C2)
4. **The standalone browser map editor** the PO asked for at the density pass
   (backlog §22) was parked; its blocker (content pass C8) has lapsed. (§4.4,
   C3)
5. **Quests and NPC dialogue have no editor at all** — the highest-frequency
   prose content is raw two-file JSON. (§4.5, C4)

Inputs read during this session: `docs/research-content-pipeline.md`
(2026-07-06 — this plan absorbs its §3 "now" items, see §9),
`docs/manual-zone-editor.md`, `docs/manual-content-authoring.md` (§6 quests,
§Known hand-sync points, §Quick reference), backlog §17 (encounters — stays
parked, §3 below) and §22 (map editor — absorbed here), roadmap §Execution
order, `backend/conf.default.json`.

## 2. Decision ledger — the rulings that govern what gets built

All six taken 2026-08-05 as choice prompts.

- **D1 — Quests get a FULL editor, not a prose-only form.** Stage graph,
  objectives, rewards per turn-in row, NPC row wiring, and a validation panel.
  The cheap alternative (a form editing only texts + reward values) was
  offered and declined. This is the plan's largest single item (§4.5).
- **D2 — The editor owns the WHOLE dialogue tree.** Quest rows live inside the
  same `interaction` block as greetings, teachings, lore lines, and node
  conditions (`api/mobs/<name>.json`) — and the editor authors all of it, not
  just the quest rows with the rest read-only. Consequence: NPC conversation
  authoring leaves JSON entirely; the editor must give row *reordering* a
  guard rail, because row order is a silent balance change
  (`manual-content-authoring.md:317`).
- **D3 — The standalone browser map editor (backlog §22) is IN, first cut in
  this plan.** Render + place/move/delete + save, per the §22 sketch. The
  scatter brush, no-go guides, and multi-select are a follow-up chunk (C5),
  not the first cut.
- **D4 — The iteration loop is a DEV SAVE ENDPOINT, no hot reload.**
  `aurad -dev` grows a small endpoint that validates and writes edited JSON
  straight into the `-content` directory. A restart still applies changes —
  the 2026-07-06 research doc's warning stands (hot reload is a trap while
  equipped skills hold live `*SkillDefinition` pointers), and this plan does
  not touch it. The existing zone editor is retrofitted onto the endpoint,
  retiring the download-and-copy loop for every tool at once.
- **D5 — The content-vs-persisted-data rules are RATIFIED, all three**
  (`research-content-pipeline.md` §2, urgent since 8a made spellbooks
  persistent): **(1) skill IDs are forever** — retired skills are tombstoned,
  never reused; **(2) maxLevel never decreases** — a decrease ships together
  with a defined clamp+refund path or not at all; **(3) load-time
  reconciliation** of persisted spellbooks against the registry gets an
  explicit, tested policy. The C0 validator enforces (1) and (2)
  mechanically; (3) is a small Go change with tests (§4.1).
- **D6 — Scheduling: AFTER ascension C1.** The plan exists now; execution
  queues behind the declared next item. Chunks C0–C2 are small and
  independent enough to run as filler sessions if one has room, but they do
  not displace ascension as the main thread.

## 3. What this plan deliberately does NOT cover

- **Encounters stay Go** (backlog §17). The 2026-07-22 ruling stands: spec +
  generic runner as the opening move of the *next encounter-authoring pass*,
  JSON/editor authoring of behavior explicitly decided against (F3). Nothing
  here changes that; the map editor renders anchors (already placeable
  in-game) and stops there.
- **Balance knobs stay config.** `backend/conf.json` (server/game/player/
  mob/combat blocks) is already the "simple config" half of the PO's target
  state: restart-applied, engineer-adjacent, version-controlled. No tuning UI.
  Same for per-skill/per-mob numbers — they live in the definition JSON,
  which C1's schemas make pleasant to edit and C0's lint makes safe.
- **Art & VFX stay code/assets** (sprites, icons, ability VFX, per-effect
  overlay art — the latter explicitly parked behind backlog §39 anyway).
- **Hot reload / live content deploy** (D4). Revisit only if restart cadence
  actually hurts; the shape would be immutable definition-set versions applied
  on respawn/re-equip, never in-place mutation.
- **Balance telemetry** (research doc §3 "later") — real, still later, owned
  by the observability work in `research-v1-readiness.md` §3.

## 4. Design

### 4.1 C0 — `aurad -validate` + CI gate + the D5 rules

The hard-fail loaders already exist (`SkillsFromFS`, `RecipesFromFS`, mob
defs, milestones, zones, `quests.CrossValidate`); today they run in exactly
one place — server boot. C0 exposes them without booting:

- **`aurad -validate [-content <dir>]`** — load every content source, run
  every cross-validation, print all findings (not first-failure), exit
  non-zero on any. No network, no DB (validation must not require
  `AURA_DB_URL` — this is the one boot path that skips the store).
- **CI gate** — run `-validate` on every change touching `api/`. Moves
  "server won't boot" from deploy time to the PR.
- **D5 enforcement — the registry lock.** *(Mechanism is a §8 proposal, PO
  may veto.)* A checked-in `api/registry-lock.json`: for every skill,
  `id → {name, maxLevelFloor}`; retired entries move to a `tombstones` list
  instead of being deleted. The validator fails on: an ID reused from the
  tombstone list, an ID collision, a live skill whose maxLevel dropped below
  its recorded floor, a lock file out of sync with the content (the lock
  updates via `-validate -update-lock`, so drift is loud and reviewed).
- **D5 rule 3 — reconciliation policy.** At character load: unknown persisted
  skill ID → preserved but inert (tombstone-preserve, so restoring the
  content restores the skill); persisted level > maxLevel → clamp (refund
  path deferred until a currency exists to refund into). Small Go change +
  table-driven tests. ⚑ This is the only C0 piece that touches runtime code.

### 4.2 C1 — JSON Schema for every `api/` content type

One schema per content directory (mobs, skills, recipes, quests, zones,
props, factions, milestones), **generated from or checked against the Go
structs** so it can't drift — a CI step regenerates and diffs. Wire-up:
`$schema` refs in the JSON files (or a committed VS Code
`json.schemas` mapping) give any editor autocomplete + inline shape
validation while typing. This is also load-bearing for C4: the quest/dialogue
editor's forms are cheap to keep honest when the shape has a machine-readable
source of truth. Semantic rules stay in the Go validators (C0) — the schema
does shapes, the loaders do meaning.

### 4.3 C2 — the dev save endpoint (+ retrofit the zone editor)

`aurad -dev` (and only `-dev` — the handler is never registered otherwise)
grows:

- **`POST /dev/content/<type>/<id>`** — body is the candidate JSON. The
  server runs it through the same loaders/validators as boot **against the
  full current content set** (so cross-references are checked, e.g. a quest
  naming a mob), and only on success writes it into the `-content` directory
  (refuses when running embedded — the write target must be a real dir).
  On failure it returns the loader's errors — which is every future editor's
  validation panel for free, with zero validator logic duplicated into JS.
- **`POST /dev/content/validate`** — same, without the write (powers live
  validation in C4's panel).
- **The existing zone editor switches to it.** Export/download stays as a
  fallback; the primary loop becomes edit → Save → restart. The manual's §7
  shrinks accordingly.

Restart still applies changes (D4). ⚑ Security posture: dev-only flag gating,
plus the same token the game join uses; the live server runs without `-dev`
and never has the route. Add a pin test asserting the route is absent
without `-dev`.

### 4.4 C3 — standalone map editor, first cut (backlog §22)

Per the §22 sketch, first cut = **render + place/move/delete + save**:

- Canvas render of the full zone exactly like the density-pass map: terrain,
  props, spawns, dark areas, campfires, anchors, the 12-unit grid.
- Palette of existing prop/mob types (from `GET /mobs` + the props catalog);
  click-to-place, **drag-to-move** (the in-game editor's known gap),
  delete; edit the same per-spawn fields the in-game editor exposes
  (respawn, variance, wander, waypoints, traversal, idle pace).
- Save through the C2 endpoint; the server's validators enforce the same
  boot rules (wander⊕waypoints, speed-0 checks, anchor uniqueness).
- *(§8 proposal)* It lives as a **second webpack entry in `frontend/`**
  (`editor.html`, dev-build only) — it wants the served catalogs, the terrain
  atlas, and the zone JSON shape, all of which the frontend already has;
  `tools/` would re-import half the client.
- **Deferred to C5:** scatter brush (the density-pass generator as a brush),
  no-go guides, multi-select. ⚑ Whether the standalone editor eventually
  *subsumes* in-game modes stays open (§8) — first cut runs alongside.

### 4.5 C4 — the quest & dialogue editor (D1 + D2, the big one)

A second dev-only page (same entry-point pattern as C3) with two coupled
views, because the content is genuinely two-file (`plan-quests.md` D11: a
quest does not know who talks about it — the wiring lives on the NPCs):

- **Quest view** — the stage graph (stages, kill/talk objectives, the derived
  terminality made *visible*: the editor labels which stages are terminal and
  why, since that is computed, never authored), and rewards **on turn-in rows
  where they live** — the editor must make "a quest ending on an objective
  stage pays nothing" visible instead of letting it be authored silently
  (`manual-content-authoring.md:642`).
- **Dialogue view (D2)** — the full `interaction` block of any conversant:
  greeting + node conditions, teachings, lore rows, quest rows
  (offer/advance/turn-in grant kinds). Row **reorder ships with a guard
  rail**: an explicit confirm naming the visible-order consequence, since
  nothing validates ordering (`manual-content-authoring.md:317`).
- **Validation panel** — live `POST /dev/content/validate` of the *pair*
  (quest + touched NPCs), surfacing `quests.CrossValidate` and the show-rule
  ("a row is shown iff its ledger op would succeed") against real loader
  output, not a JS re-implementation.
- Save writes both files atomically-ish (quest first, then NPCs; on any
  failure nothing is written — the endpoint validates the whole batch before
  the first write; the batch form `POST /dev/content/batch` is a C4 addition
  to C2's endpoint).

⚑ Likely splits into **C4a** (data plumbing: batch endpoint, quest + dialogue
forms, save round-trip) and **C4b** (graph rendering, validation panel,
reorder guard rails) — decide at chunk start, not now.

## 5. Schema impact (stated per the standing rule)

**NONE — no migration.** Verified by enumeration, not reasoned: C0 touches a
new CLI flag, CI, a new checked-in JSON lock file, and one runtime load-path
change (reconciliation, D5 rule 3) that only *reads* persisted rows and
clamps in memory — no table, no column, no write-shape change. C1 is static
schema files. C2–C4 are dev-only HTTP handlers writing to the `-content`
directory and browser pages. The D5 rules constrain future *content* changes
precisely so that they don't force data migrations.

## 6. Chunk breakdown

Order C0 → C1 → C2 → C3 → C4 (→ C5). C0–C2 are foundations; C3/C4 both ride
on C2's endpoint and C0's validators. Per D6 all of it queues behind
ascension C1; C0–C2 qualify as filler sessions.

| Chunk | Contents | Size |
|---|---|---|
| **C0** | `-validate` CLI (no DB), CI gate on `api/` changes, registry lock + tombstones, reconciliation policy + tests | small (≤1 session) |
| **C1** | JSON Schemas for all 8 content dirs, generated/checked against Go structs, CI drift check, editor wire-up | small |
| **C2** | Dev save + validate endpoints (dev-only, pin-tested), zone editor retrofitted, manual §7 updated | small–medium |
| **C3** | Standalone map editor first cut: render + palette + place/drag/delete + save (§22's ~1-session estimate) | medium |
| **C4** | Quest & dialogue editor (D1+D2): both views, batch save, validation panel; likely split C4a/C4b | large (~2 sessions) |
| **C5** | Map editor round 2: scatter brush, no-go guides, multi-select | medium, optional |

## 7. Test strategy

- **C0:** table-driven Go tests over fixture content trees (valid, each
  failure class incl. tombstone reuse + maxLevel drop); a test that
  `-validate` runs green on the *shipped* `api/` (the real gate);
  reconciliation tests (unknown ID inert-preserved, over-level clamped) —
  these are `store`-adjacent and run under `AURA_TEST_DB_URL` where they
  touch persisted rows.
- **C1:** CI regenerate-and-diff; a fixture that violates each schema and is
  caught.
- **C2:** handler tests — happy write, validation reject (nothing written),
  embedded-content refusal, **route absent without `-dev`** (the pin), batch
  atomicity (C4a).
- **C3/C4:** the house Playwright pattern (`verify` skill) — a leg file per
  editor: load zone → place/drag → save → server restart → assert the world
  changed; quest editor: edit reward → save → `GET /quests` reflects it →
  the in-game journal shows it. Round-trip stability: load → save without
  edits is byte-stable (canonical marshal), so diffs stay reviewable.
- Per the standing rule every chunk states schema impact (expected: none,
  every time) and runs the relevant Go/vitest suites.

## 8. Open questions & proposals adopted without a choice prompt (PO may veto)

1. **Registry-lock mechanism** (§4.1) — proposed as a checked-in lock file
   updated via `-validate -update-lock`. Alternative: derive floors from git
   history (rejected: fragile, invisible in review).
2. **Editors live as dev-only webpack entries in `frontend/`** (§4.4) — not
   `tools/`. Driven by catalog/terrain-atlas reuse.
3. **Does the standalone editor eventually subsume in-game editor modes?**
   §22's own open question — deliberately not answered by the first cut;
   re-ask after C3 has been used for a real content session.
4. **conf.json stays UI-less** (§3) — adopted as the "simple config" half of
   the target state.
5. **Refund path on maxLevel decrease** (D5 rule 2) — deferred until there is
   a currency to refund into; until then a decrease is simply rejected.
6. **Dialogue node-condition vocabulary in the C4 UI** — how much of the
   condition system gets structured UI vs a validated raw field; decide at
   C4 design time against the then-current condition list.

## 9. What this plan absorbs or closes elsewhere

- **`research-content-pipeline.md`** — §3 "now" items fully dispositioned:
  disk loading ✅ (shipped as `-content`), authoring guide ✅
  (`manual-content-authoring.md`), `Skills.ts` dual-write ✅ (retired
  `ae51d8b5`/`5308c312`), validate CLI → **C0**, JSON Schema → **C1**, ID
  convention → **C0 (D5)**. Its §2 rules → **ratified (D5)**. Telemetry
  stays later (§3). The doc gets a status-line pointer here when this plan's
  first chunk ships.
- **Backlog §22** — absorbed as **C3+C5**; close it with a pointer when C3
  ships.
- **Backlog §17** — explicitly NOT absorbed; unchanged.

## 10. Superseded rulings

*(none yet)*

## 11. Chunk ledgers

*(filled per chunk at execution time)*
