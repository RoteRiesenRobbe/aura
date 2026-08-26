# Plan: the content editor — NPC dialogue trees + quest stage graphs

> **Status 2026-08-26: DESIGNED, nothing built.** Ruled: **D1 — custom tool,
> not an adapted external one** (SkyAphid/Corkboard was the concrete
> alternative on the table). PO-scoped v1: **standalone local tool**,
> **NPC dialogue trees + quest stage graphs**, **full read-write**. No chunk
> started.

## 1. What this is

NPCs, their dialogue, and quests are all hand-edited JSON today, cross-linked
by free-text string references that only get checked at Go boot time
(`quests.CrossValidate`, `DisallowUnknownFields`, the content census tests in
`registry_test.go` / `interaction_content_test.go` / etc). Concretely:

- An **NPC is not a separate content type** — it's an ordinary
  `api/mobs/*.json` file that happens to carry an `interaction` block
  (`role: "creature"`, `factors.speed: 0`, `faction: "townsfolk"` are the
  idioms, not a schema). 19 of 61 files under `api/mobs/` carry `interaction`
  today (`farmer.json`, `town-crier.json`, `hermit.json`, etc).
- `interaction.nodes[]` is a genuine **dialogue tree**: `id`, `lines[]`,
  `options[]` (`text`, `next`, optional `grants[]`), optional node-level
  `conditions[]` (`quest_at_stage`). `interaction.ambient` is a flat hail-line
  list. This is the one part of the schema that is actually graph-shaped.
- `grants[]` kinds: `offer_quest`, `advance_quest` (`fromStage`/`toStage`),
  `grant_xp`, `teach_skill` (`skill`, `requiredLevel`).
- **Quests** (`api/quests/*.json`) are a `stages[]` list — each stage either
  an objective stage (`objectives[]` of kind `kill`/`harvest`/`talk_to`,
  `tracker`, `next`) or a dialogue stage advanced only by some NPC's `grants`
  row. A quest file **never names its own giver/turn-in NPC** (`plan-quests.md`
  D11) — the reference runs the other way, from NPC `interaction.grants` to
  quest id. Branching is real: `wolves-on-the-road` has one dialogue stage
  two different NPCs each turn in to a different terminal stage.
- Cross-references are **string-matched, not id-matched**, and span at least
  three content types: quest id ↔ NPC `grants.quest`, quest
  `objectives.species`/`.npc` ↔ mob name, `teach_skill.skill` ↔ skill id,
  `conditions.quest`/`.stage` ↔ another quest's stage id. None of this has
  autocomplete or pre-save validation today — only Go boot-time checks catch
  a typo, and only if the boot log is read.
- Non-obvious engine invariants an editor must respect (from
  `docs/manual-content-authoring.md` §6): a terminal stage id becomes
  permanently unreadable once the quest completes; `not_started` re-matches
  after abandon, only `completed` seals it; conditional dialogue nodes must
  sit above the unconditional root or the loader hard-fails.

The PO asked whether to build a custom editor for this, or adapt
[SkyAphid/Corkboard](https://github.com/SkyAphid/Corkboard) (an open-source
Vue3/VueFlow node-graph dialogue editor built for Arcweave-style branching
dialogue export, JSON in/out, user-defined node types).

## 2. D1 — custom tool, not Corkboard

Ruled 2026-08-26. Reasoning:

- Corkboard only models freeform node-graphs for dialogue. Aura's content is
  mostly **not** graph-shaped — mob stat fields are flat, quest stages are a
  short linear/branching list. Only `interaction.nodes[]` is genuinely
  graph-shaped; adapting a whole external editor to fit one section of one
  content type is the wrong shape of leverage.
- Corkboard has zero notion of Aura's actual vocabulary: `grants`, the
  `conditions`/sentinel system, `tier`/`faction`/`curveLevel`, or the
  cross-file string references above. Every one of those would need to be
  bolted on as custom node types inside someone else's editor, at which
  point little of "adapting Corkboard" is left except its dependency tree.
- Corkboard is Vue3/VueFlow — a stack foreign to this repo's vanilla
  TS/PixiJS frontend and Node tooling scripts. Adopting it means maintaining
  a second frontend stack for a UX fit that only covers one section.
- The project already has a working precedent for exactly this shape of
  tool: `tools/tiled/generate-palette.mjs` + `extensions/aura-zone/aura-convert.js`
  customize an external tool (Tiled) for the **spatial** layer by deriving
  its palette/enums **from** `api/` as the single source of truth, never
  hand-duplicating schema. Dialogue trees and quest graphs are not spatial,
  and a from-scratch tool can apply the same "derive from `api/`, never
  duplicate" discipline without inheriting Tiled's Java/extension model.
- A custom tool can encode the invariants that actually matter — terminal
  stages, sentinel rules, node-ordering, registry census pins, the
  EntityType 5-file hand-sync (`.claude/skills/add-content/SKILL.md`) — and
  flag them rather than silently mishandling them. A generic external tool
  is blind to all of them by construction.

## 3. Scope

**v1 IN** (PO-scoped):

- NPC dialogue trees: `interaction.nodes[]`, `.ambient`, `.range` on the 19
  `api/mobs/*.json` files that carry `interaction`.
- Quest stage graphs: `api/quests/*.json` `stages[]`/`objectives[]`/`next`,
  including the grants↔quest cross-reference to NPC files (read the NPC
  side to show "who offers/advances this quest", even though quests don't
  name it themselves).

**v1 OUT** (named, not silently dropped — separate PO calls later):

- Plain mob stat fields (`tier`, `factors`, `body`, `skills`, `unlocks`) —
  simple flat forms, no graph UX, lower payoff for a custom editor than the
  two items above.
- Zone spawn placement (`api/zones/world.json`) — Tiled already edits this;
  in scope would be redundant tooling.
- New-EntityType/art wiring — stays the manual 5-file hand-sync
  (`server.fbs` → regen → SVG → render class → `GameStateMessage.ts`
  `gameObjectClasses` entry) per the add-content skill. The editor must
  never pretend to automate this.
- Registry census test count bumps (`registry_test.go`,
  `interaction_content_test.go`, `role_content_test.go`, `xpfactor_test.go`)
  — stays manual. The tool should **flag** "you added an NPC/quest, a
  content census may need bumping," never auto-edit Go test files.

**Write access:** full read-write. Saves go straight back to
`api/mobs/*.json` and `api/quests/*.json`, preserving `_comment` fields and
existing key order — a deliberate serializer, not `JSON.stringify` with
default re-keying — so diffs stay small and reviewable. This mirrors how
`aura-convert.js` already writes zone JSON on a Tiled save.

## 4. Cross-file index & validation

The tool builds an in-memory index at load time:

- mob/NPC names → ids (for `talk_to.npc`, `objectives.species`,
  `grants` targets)
- quest ids → stage ids (for `conditions.quest`/`.stage`,
  `advance_quest.fromStage`/`.toStage`)
- skill ids (for `teach_skill.skill`)

That index drives autocomplete on every string-reference field, and flags
dangling references before save — front-running what
`quests.CrossValidate` / `DisallowUnknownFields` / the content census tests
only catch today at Go boot or `go test` time, after the fact.

## 5. Architecture sketch

- New `tools/content-editor/` — a small, self-contained Node/Vite-served
  local web app with its own `package.json`, isolated from `frontend/`'s
  webpack build. Same posture as `tools/tiled/`: an adjacent authoring tool,
  never shipped to players, not part of the game's build/deploy.
- Reads `api/mobs/*.json` and `api/quests/*.json` directly off disk — no
  running `aurad`, no DB, matching how `generate-palette.mjs` already reads
  `api/` directly.
- A minimal graph view for `interaction.nodes[]`. Tree sizes here are small
  (single-digit to low-teens nodes per NPC) — a hand-rolled box-and-arrow
  SVG view is plausibly enough; pulling in a full graph-editing dependency
  (VueFlow-equivalent) is a v1 implementation choice to make once C1 is
  actually rendering real trees, not a decision to lock in now.
- Plain form components for quest stages/objectives, dialogue node fields
  (`lines`, `options`, `conditions`), and `grants` rows.
- A save serializer that round-trips `_comment` and key order faithfully.

## 6. Chunk breakdown (proposed — for a later execution session)

- **C1 — read-only viewer.** Build the index; render NPC dialogue trees and
  quest stage graphs from disk. No editing. Proves the parser/index/graph
  view against real content (all 19 `interaction`-bearing mobs + all 13
  quests) before any write path exists.
- **C2 — quest-stage editing + write-back.** Simpler shape (mostly
  linear/small-branch, no graph widget strictly required beyond an outline
  view). Establishes the `_comment`/key-order-preserving save path.
- **C3 — NPC dialogue-tree editing + write-back.** Graph widget, `grants`/
  `conditions` forms, cross-file autocomplete wired to the C1 index.
- **C4 — validation pass.** Dangling-reference and sentinel/ordering-rule
  warnings surfaced before save, front-running the Go-side checks.
- New-content scaffolding (a new NPC or new quest from a template) is a
  likely fast-follow once C1–C3 prove the shape, not its own v1 chunk.

## 7. Open questions for later (not blocking this doc)

- Graph-view library/approach — settle in C1 once real tree shapes are on
  screen, not here.
- Whether new-content scaffolding ships inside v1 or as a fast-follow.
- Whether the tool should also *read* (never edit) `api/zones/world.json`
  just to show an NPC's spawn position for context while editing its
  dialogue.
