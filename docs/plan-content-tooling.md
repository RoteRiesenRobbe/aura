# Plan: Content tooling — editors, validation, and the authoring pipeline

> **Status: DESIGNED 2026-08-05 (D1–D6) — RE-SCOPED 2026-08-09 (D7–D10), no
> chunk built.** Planning session opened by the PO question *"do we have a
> plan to move all current content in an editor?"* — the answer was "two
> thirds exists, no unified plan," and this document is that plan. Six rulings
> D1–D6 taken the same day as choice prompts (two rounds).
>
> ⭐ **The 2026-08-09 review re-scoped the plan under one frame ruling (D7):
> bulk placement and authoring are AI-side; the human editor exists for spot
> edits and tuning.** That cut half the plan: JSON Schemas (old C1, D8), the
> standalone map editor (old C3/C5, D9) and the full quest & dialogue editor
> (old C4, D10) are gone. What remains: **C0** validation + the D5 rules ·
> **C1** the dev save endpoint + zone-editor retrofit (was C2) · **C2**
> in-game drag-to-move (new, the residue of backlog §22) · **C3** the
> quest/dialogue text-and-rewards form (was C4, shrunk). D1–D3 are superseded
> → §10.
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

What is genuinely missing, and what this plan builds *(dispositions updated
2026-08-09 per D7–D10)*:

1. **Validation exists only at server boot** — no way to check content without
   starting the game, no CI gate, no ID discipline. (§4.1, chunk C0)
2. ~~**No schema assistance** while editing the definition JSON.~~ ⛔ **CUT
   (D8)** — autocomplete served human hand-editing, which D7 moves away from.
3. **The save loop is manual** — export → download → copy into `api/` →
   restart, for every tool. (§4.3, now chunk C1)
4. ~~**The standalone browser map editor** (backlog §22)~~ ⛔ **CUT (D9)** —
   its one spot-editing residue, drag-to-move, lands in the **in-game** editor
   instead (§4.4, new chunk C2); §22 closes as superseded.
5. **Quest and NPC dialogue *texts and reward numbers* have no editor** —
   shrunk from the full editor by D10: structure stays AI-authored JSON.
   (§4.5, chunk C3)

Inputs read during this session: `docs/research-content-pipeline.md`
(2026-07-06 — this plan absorbs its §3 "now" items, see §9),
`docs/manual-zone-editor.md`, `docs/manual-content-authoring.md` (§6 quests,
§Known hand-sync points, §Quick reference), backlog §17 (encounters — stays
parked, §3 below) and §22 (map editor — absorbed here), roadmap §Execution
order, `backend/conf.default.json`.

## 2. Decision ledger — the rulings that govern what gets built

D1–D6 taken 2026-08-05, D7–D10 taken 2026-08-09, all as choice prompts.

- ~~**D1**~~ · ~~**D2**~~ · ~~**D3**~~ — **SUPERSEDED 2026-08-09** by D10, D10
  and D9 respectively; full original text in §10.
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
- **D7 (2026-08-09) — The frame: bulk placement and authoring are AI-SIDE;
  the human editor exists for spot edits and tuning.** Taken reviewing this
  plan against the shipped world-replacement pass, which placed all 423
  combat spawns via scripts (`world-place.py` / `world-regions.py`) and never
  touched an editor. Consequences: region/band structure is the AI placement
  pass's discipline, **not** an editor overlay; bulk tools (scatter brush,
  multi-select) are scripts, not UI. This ruling drives D8–D10.
- **D8 (2026-08-09) — JSON Schemas are CUT** (old C1). Their consumer was
  human hand-editing of definition JSON, which D7 moves away from; the AI
  needs no autocomplete and the Go loaders stay the single validator.
  Revisit only if an external tool ever needs machine-readable shapes.
- **D9 (2026-08-09) — The standalone map editor is CUT; drag-to-move lands
  in the IN-GAME editor** (supersedes D3; closes backlog §22 as superseded).
  Of §22's ask, the overview render and bulk placement went AI-side (D7);
  the one residue a human spot-editor actually feels is that moving a placed
  prop/spawn means delete + re-place. That ships as a small in-game editor
  chunk (§4.4) — no second webpack entry, no new `GET /props` route.
- **D10 (2026-08-09) — The quest & dialogue editor shrinks to the cheap form
  D1 declined** (supersedes D1 + D2). A dev-only page editing **texts and
  reward numbers only**, saving through the C1 endpoint with live loader
  validation. Structure — stages, objectives, row order, grant kinds, node
  conditions — stays AI-authored JSON per D7, which also dissolves the
  reorder-guard-rail requirement (the form cannot reorder) and the batch
  atomic-save endpoint (single-file edits only).

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
- **Bulk placement & overview tooling** (D7, 2026-08-09) — scripts, not UI.
  The world-replacement pass's `scripts/world-place.py` + `world-regions.py`
  are the precedent and stay the pattern; their coverage/consistency checks
  belong to the AI placement pass's own discipline, not to this plan's CI
  gate or any editor.
- **Content-structure authoring UIs** (D8/D10, 2026-08-09) — definition-JSON
  schemas, quest stage graphs, dialogue-tree editing: all stay AI-authored
  JSON validated by the loaders.

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

### 4.2 ~~old C1 — JSON Schema for every `api/` content type~~ — ⛔ CUT (D8)

*(Kept for the record.)* One schema per content directory, generated from or
checked against the Go structs, wired into editors for autocomplete. Cut
2026-08-09: its consumer was human hand-editing, which D7 moves away from;
the loaders stay the single validator, and nothing in the surviving plan
depends on machine-readable shapes.

### 4.3 C1 — the dev save endpoint (+ retrofit the zone editor)

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
  validation in C3's form).
- **The existing zone editor switches to it.** Export/download stays as a
  fallback; the primary loop becomes edit → Save → restart. The manual's §7
  shrinks accordingly.

Restart still applies changes (D4). ⚑ Security posture: dev-only flag gating,
plus the same token the game join uses; the live server runs without `-dev`
and never has the route. Add a pin test asserting the route is absent
without `-dev`.

### 4.4 C2 — in-game editor drag-to-move (D9; replaces the standalone editor)

The one spot-editing gap the in-game editor has that a human actually feels:
repositioning a placed prop/spawn/campfire/dark-area today means delete +
re-place, re-entering every knob. C2 adds **drag-to-move to the existing
in-game editor modes** — select a placed entity, drag, all other fields
(respawn, variance, wander, waypoints, level, …) carried unchanged.

- Pure editor-frontend UX; no new routes, no second webpack entry.
- Saves through the C1 endpoint once the retrofit has landed (C1 first).
- ⚑ Per-spawn `level` already ships in the in-game editor (`mob-levels` C3,
  2026-08-05) — this plan adds no field work, and any future per-spawn knob
  (e.g. the designed mob tether) lands in the in-game editor as part of its
  own plan, not here.

### 4.5 C3 — the quest & dialogue TEXT form (D10)

A dev-only page (same dev-build entry pattern as the zone editor) that edits
**prose and reward numbers, never structure**:

- **Editable:** quest titles/descriptions/stage prose · dialogue line texts
  on any conversant (greetings, lore rows, teaching lines, quest-row prose) ·
  **reward numbers on turn-in rows where they live**.
- **Not editable:** stages, objectives, row order, grant kinds, node
  conditions, NPC wiring — AI-authored JSON per D7. The form cannot reorder,
  so `manual-content-authoring.md:317`'s silent-balance-change hazard needs
  no guard rail here.
- **Validation** — live `POST /dev/content/validate` before save, surfacing
  `quests.CrossValidate` and the loaders' real errors, no JS
  re-implementation.
- Save is **single-file** through the C1 endpoint (a text/reward edit touches
  one file at a time; the endpoint validates it against the full content set
  anyway). No batch endpoint.

⚑ One visibility nicety survives from the old design because it is cheap in
a form: label a reward row when its quest ends on an objective stage and
therefore pays nothing (`manual-content-authoring.md:642`) — display logic,
not structure editing.

## 5. Schema impact (stated per the standing rule)

**NONE — no migration.** Verified by enumeration, not reasoned: C0 touches a
new CLI flag, CI, a new checked-in JSON lock file, and one runtime load-path
change (reconciliation, D5 rule 3) that only *reads* persisted rows and
clamps in memory — no table, no column, no write-shape change. C1 is dev-only
HTTP handlers writing to the `-content` directory (+ the zone-editor
retrofit). C2 is editor-frontend UX. C3 is a dev-only browser page saving
through C1. The D5 rules constrain future *content* changes precisely so
that they don't force data migrations.

## 6. Chunk breakdown

**Renumbered 2026-08-09** (D8/D9 cut old C1, C3 and C5; old C2 → C1, old C4
→ C3 shrunk). Order C0 → C1 → C2 → C3; C2 and C3 both ride on C1's endpoint,
C3 also on C0's validators. Per D6 all of it queues behind ascension C1, and
every chunk now qualifies as a filler session.

| Chunk | Contents | Size |
|---|---|---|
| **C0** | `-validate` CLI (no DB), CI gate on `api/` changes, registry lock + tombstones, reconciliation policy + tests | small (≤1 session) |
| **C1** *(was C2)* | Dev save + validate endpoints (dev-only, pin-tested), zone editor retrofitted, manual §7 updated | small–medium |
| **C2** *(new)* | In-game editor drag-to-move, fields carried unchanged | small |
| **C3** *(was C4, shrunk by D10)* | Quest & dialogue text form: prose + reward numbers, live validation, single-file save | small–medium |

⛔ Cut 2026-08-09: JSON Schemas (D8) · standalone map editor first cut +
round 2 (D9 — drag-to-move moved into C2, everything else went AI-side).

## 7. Test strategy

- **C0:** table-driven Go tests over fixture content trees (valid, each
  failure class incl. tombstone reuse + maxLevel drop); a test that
  `-validate` runs green on the *shipped* `api/` (the real gate);
  reconciliation tests (unknown ID inert-preserved, over-level clamped) —
  these are `store`-adjacent and run under `AURA_TEST_DB_URL` where they
  touch persisted rows.
- **C1:** handler tests — happy write, validation reject (nothing written),
  embedded-content refusal, **route absent without `-dev`** (the pin).
- **C2/C3:** the house Playwright pattern (`verify` skill) — a leg file per
  surface: zone editor: place → drag → save → server restart → assert the
  entity moved with its knobs intact; text form: edit reward → save →
  `GET /quests` reflects it → the in-game journal shows it. Round-trip
  stability: load → save without edits is byte-stable (canonical marshal),
  so diffs stay reviewable — this is also the guard against the
  whitelist-serializer landmine (`plan-mob-levels.md` L7: a save path that
  hand-picks fields silently drops any field it doesn't know).
- Per the standing rule every chunk states schema impact (expected: none,
  every time) and runs the relevant Go/vitest suites.

## 8. Open questions & proposals adopted without a choice prompt (PO may veto)

1. **Registry-lock mechanism** (§4.1) — proposed as a checked-in lock file
   updated via `-validate -update-lock`. Alternative: derive floors from git
   history (rejected: fragile, invisible in review).
2. **The C3 form lives as a dev-only webpack entry in `frontend/`** — not
   `tools/`. Driven by catalog reuse.
3. ~~Does the standalone editor eventually subsume in-game editor modes?~~
   **Dissolved by D9** — there is no standalone editor; the in-game editor
   is the only placement UI.
4. **conf.json stays UI-less** (§3) — adopted as the "simple config" half of
   the target state.
5. **Refund path on maxLevel decrease** (D5 rule 2) — deferred until there is
   a currency to refund into; until then a decrease is simply rejected.
6. ~~Dialogue node-condition vocabulary in the C4 UI~~ **Dissolved by D10** —
   conditions are structure and stay AI-authored JSON.

## 9. What this plan absorbs or closes elsewhere

- **`research-content-pipeline.md`** — §3 "now" items fully dispositioned:
  disk loading ✅ (shipped as `-content`), authoring guide ✅
  (`manual-content-authoring.md`), `Skills.ts` dual-write ✅ (retired
  `ae51d8b5`/`5308c312`), validate CLI → **C0**, JSON Schema → ⛔ **cut
  (D8)**, ID convention → **C0 (D5)**. Its §2 rules → **ratified (D5)**.
  Telemetry stays later (§3). The doc gets a status-line pointer here when
  this plan's first chunk ships.
- **Backlog §22** — **CLOSED 2026-08-09 as superseded (D9)**: bulk/overview
  went AI-side (D7), the drag-to-move residue is this plan's C2. The §22
  entry carries the pointer.
- **Backlog §17** — explicitly NOT absorbed; unchanged.

## 10. Superseded rulings

All three superseded 2026-08-09 by the D7 re-scope (frame: bulk placement
and authoring are AI-side; the human editor is for spot edits and tuning).

- **D1 (2026-08-05) — Quests get a FULL editor, not a prose-only form.**
  Stage graph, objectives, rewards per turn-in row, NPC row wiring, and a
  validation panel. The cheap alternative (a form editing only texts +
  reward values) was offered and declined. → **Superseded by D10**, which
  adopts exactly that cheap form: the full editor's extra scope served
  *authoring*, which D7 assigns to the AI (the nine generic kill quests were
  authored that way without an editor).
- **D2 (2026-08-05) — The editor owns the WHOLE dialogue tree.** Quest rows,
  greetings, teachings, lore lines, and node conditions all authored in the
  editor; row reordering gets a guard rail
  (`manual-content-authoring.md:317`). → **Superseded by D10**: the form
  edits line *texts* only; tree structure and conditions stay JSON, and a
  form that cannot reorder needs no reorder guard rail.
- **D3 (2026-08-05) — The standalone browser map editor (backlog §22) is IN,
  first cut in this plan** (render + place/move/delete + save; brush/no-go/
  multi-select as C5). → **Superseded by D9**: the world-replacement pass
  demonstrated bulk placement lives in scripts; only drag-to-move survives,
  in the in-game editor (new C2). §22 closed as superseded.

## 11. Chunk ledgers

*(filled per chunk at execution time)*
