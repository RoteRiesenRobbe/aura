# Plan: the content editor (`tools/content-editor/`)

> **Status 2026-09-10: Part A SHIPPED (2026-08-27/28, `ebf4cfe5` + `6c2e6d5c`),
> Part B DESIGNED 2026-09-08, C0 SHIPPED 2026-09-10 (uncommitted), C1 next.** This is the living plan of the one
> tool: **Part A** is the original design (NPC dialogue trees + quest stage
> graphs, D1: custom, not Corkboard) and what actually shipped, which went
> well past its v1 scope; **Part B** is the Skills tab, the spell builder,
> designed 2026-09-08 and next. ⚑ Part A was never ledgered or indexed after
> it shipped: this banner said "nothing built" for twelve days while the tool
> had six tabs. Fixed 2026-09-08 (§8). `tools/content-editor/README.md` is
> the living SCOPE record; this doc holds the rulings and the ledgers.
>
> ⚑ **Schema impact: NONE**, both parts. Dev-side tooling writing the same
> files the loaders already read. ⭐ **This is the ONLY content-tooling plan
> (PO 2026-09-08)**: `archive/plan-content-tooling.md` is superseded, and its
> two survivors live here - real Go validation on save (Part B D9 / C2) and
> the D5 registry lock (Part B C5). Its load-time reconciliation policy is
> `backlog.md` §61.

## Part A - dialogue trees, quest graphs, and the tabs that followed

> Original banner (2026-08-26): DESIGNED, nothing built. Ruled: **D1 - custom
> tool, not an adapted external one** (SkyAphid/Corkboard was the concrete
> alternative on the table). PO-scoped v1: **standalone local tool**,
> **NPC dialogue trees + quest stage graphs**, **full read-write**.

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

## 6. Chunk breakdown (proposed 2026-08-26; ✅ all four shipped, see §8)

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

## 7. Open questions for later - answered by the implementation (2026-09-08 note)

- Graph-view library/approach — settle in C1 once real tree shapes are on
  screen, not here.
- Whether new-content scaffolding ships inside v1 or as a fast-follow.
- Whether the tool should also *read* (never edit) `api/zones/world.json`
  just to show an NPC's spawn position for context while editing its
  dialogue.

Resolved by what shipped (§8): the graph view is node cards with jump links
and no graph library (the tool has zero dependencies and no build step);
new-content scaffolding shipped as the "+ New" flows in `6c2e6d5c`; the
`world.json` spawn-position read was not built and nobody has asked.

## 8. Part A ledger - SHIPPED 2026-08-27/28 (written 2026-09-08)

- **`ebf4cfe5` (2026-08-27)** - the tool: `server.mjs` (reads `api/` off disk
  per request, per-kind save endpoints), `validate.mjs` (the JS port of the
  Go rules, refuses a save on any error), `format.mjs` (`prettyJson`, the
  `_comment`- and unknown-key-preserving writer), `public/` (vanilla JS, no
  build). C1-C4 of §6 in one commit: NPC dialogue trees + quest stage graphs,
  read-write, with the cross-file index and the "referenced by" panel.
- **`6c2e6d5c` (2026-08-28)** - beyond v1 scope, all three §3 "OUT" items
  that were forms rather than wiring: every mob stat field, the Factions tab,
  the Recipes tab, the Milestones table, and "+ New" flows per tab (filename
  derived from the typed name). Also the add-content skill and the manual's
  "Known hand-sync points" learned that the editor mirrors the vocabulary by
  hand (the seam Part B's §B3 is built to close for skills).
- **Still OUT, as designed**: zone placement (Tiled), new-EntityType wiring
  (the 5-file hand-sync), the Go census pin bumps (the tool flags, never
  edits a test). Skills were out too - that is Part B.
- ⚑ **The README promises a standalone smoke script** (import `validate.mjs`,
  assert zero false positives over every real file) **that does not exist**
  (measured 2026-09-08: only `server` / `validate` / `format` `.mjs`). Part B's
  C0 creates it.
- Verification at the time: by hand against every real file; no in-game
  surface. Schema NONE.

## Part B - the Skills tab (the spell builder), DESIGNED 2026-09-08

> Planning session opened by the PO: *"I want to build a spell builder
> system"* - a frontend where you decide whether you are building an aura, a
> cooldown or a passive, what effects it has, ranges, durations, cooldowns,
> names, effect types, the companion a summon spawns (picked from the
> existing mob list), and its visuals, and that exports ONE thing into a
> folder, ideally automatically. Eight rulings (D1-D8) taken the same session
> as choice prompts, two rounds, plus D9-D10 in a third. Folded into this doc
> rather than given its own (PO 2026-09-08): it is the same tool's next chunk
> set.
>
> ⭐ **The headline finding: the PO's example spell is authorable today as one
> JSON file, and most of the tool already exists.** *"An aura with range X that
> applies fire vulnerability and does fire damage to up to Y targets every Z
> ticks"* is a `resist_aura` effect (fire tag, factor above 1, enemies) plus a
> `damage_aura` effect with `maxTargets`, `tickInterval` and `radius` in the same
> `effects[]` array - `fire-vulnerability.json` is the precedent for the first
> half, 14 shipped damage auras for the second. Part A's tool reads
> `api/skills/` for references and has **no Skills tab**. Part B is that tab.
>
> ⚑ **Schema impact: NONE at every layer.** DB none, FlatBuffers none, conf
> none, content none (the tab writes the SAME file shape the loader reads
> today). The only Go change is a test-pinned vocabulary fixture (§B4.2).
>
> ⚑ **This re-rules `archive/plan-content-tooling.md` D7** (2026-08-09: *authoring is
> AI-side, the human editor is for spot edits and tuning*). PO 2026-09-08:
> *"the plan was for initial content, now that we have a somewhat
> sophisticated content editor we move there."* D7 narrows to bulk world
> placement (`scripts/world-*.py`, Tiled); skills are human-authored in the
> tool. D8 of that plan (schema assistance cut) is reversed for skills only.

### B1. What this is

A skill is one file under `api/skills/*.json`: 15 top-level fields and an
`effects[]` array where each entry names one of **34 effect types** and
authors that type's fields out of a vocabulary of **81 flat keys**. Today
the loop is: hand-write the JSON, boot `aurad -content ../api`, read the
boot error, repeat. The Go loader is strict and good (§B2), but nothing shows
you *which* fields a type accepts, what the per-level pair resolves to at
level 5, or whether the icon you typed is bundled.

The spell builder is a form over that vocabulary inside the existing
content editor. It does not add a system. It cannot add an effect type (§B7).

#### B1.1 Measured, not recalled (2026-09-08)

| | |
|---|---|
| player skills in `api/skills/` | 72 (27 auras · 34 cooldowns · 11 passives) |
| mob-embedded skills in `api/skills/mobs/` | 33 (no icon by ruling; same loader, same id space) |
| effect types in the Go enum | 34 |
| authorable effect keys (`effectDef` json tags) | 81 |
| top-level skill keys | 15 (`id name displayName icon description category maxLevel legacy cooldownTicks cooldownTicksPerLevel castTicks castTicksPerLevel castInterruptedByDamage targetFactions effects`) |
| highest skill id in use | 151 |
| vendored icon glyphs | 33 (`frontend/src/client-data/icons/vendor/`) |
| skill files `prettyJson` reproduces byte-for-byte | 20 of 105 (the other 85 reformat on any save, §B8) |
| effect keys no player skill authors | 3 (`reflectDurationTicksPerLevel`, `tickIntervalPerLevel`, `lifestealDurationTicksPerLevel`) |

### B2. What already works - checked, not assumed

- **The loader is the validator, and it is strict.** `definition.go` hard-fails
  ~70 distinct conditions: unknown category / effect type / selector / stat /
  hitStyle, a closed **damage-type** vocabulary (`physical fire frost nature
  poison bleed`) and a closed **gate-key** vocabulary (`harvest smash`) that
  refuse each other's words, per-type numeric ranges (cost in `[0, 1)`,
  radius `> 0` on geometry types, `tickInterval > 0` when authored, heal HP
  XOR heal fraction, execute pair authored together, crit ranges, resist
  wildcard alone), duplicate ids and duplicate names across BOTH folders,
  `calm`/`charm` requiring a `targetFactions` allowlist, `spawnMob` resolved
  against the mob registry at boot, and an icon required on every top-level
  skill.
- ⭐ **The loader already holds the per-type field table.** `effectKeys`
  (`definition.go` ~1290-1470) maps every `EffectType` to its allowed JSON
  keys, built from shared groups (`keysGeometry`, `keysCapped`,
  `keysTargetFlags`, `keysDamagePayload`, `keysResistPayload`, …), with
  `keysCost` legal on every type and `renamedEffectKeys` naming retired keys'
  successors. `validateEffectKeys` hard-fails any key outside the type's
  list. **This table IS the form.** The whole design question of §B4.2 is how
  the editor gets it without a second hand-maintained copy.
- **New skill = no client edit, no wire edit.** The client fetches the parsed
  registry over `GET /skills` (`manual-content-authoring.md` "Known hand-sync
  points"); `SkillTooltip.ts` renders by effect TYPE, so a new combination of
  existing types renders on day one. The icon glyph must be bundled
  (`SkillIcons.test.ts` is the twin pin: authored ⇒ bundled).
- **`-content ../api` + restart applies a saved file.** No `cp-defs`, no
  rebuild (CLAUDE.md "Content iteration"). The zone half-live seam (boot time)
  applies identically: a save renders nothing until `aurad` restarts.
- **The content editor's plumbing** (`tools/content-editor/`): `server.mjs`
  reads every `api/` kind off disk per request (already recursing into
  `api/skills/mobs/`), `saveOne({kind, file, raw, isNew})` refuses a save on
  any `validate.mjs` error and writes through `format.mjs`'s `prettyJson`
  preserving `_comment` and unrelated keys, the "+ New" flows derive a
  kebab-case filename from the typed name, and `grantedByPanel` is the
  reference-panel pattern (§B4.6). `state.skillNames` / `skillMaxLevels`
  already feed the recipe and mob tabs' pickers.
- **Companions are ordinary mobs.** `spawnMob` names a mob; the four
  followers (`Companion`, `SoldierCompanion`, `ShieldbearerCompanion`,
  `MedicCompanion`) author `role: follower`, totems author `role: structure`,
  and each carries its own aura as a mob-embedded skill. The Mobs tab already
  edits them.
- **Skill ids are persisted** (`game.character_spellbook.skill_id INTEGER`,
  migration 000001: *"pinned-and-never-reused by the same discipline as mob
  EntityType ids"*). `archive/plan-content-tooling.md` D5 ratified: skill ids
  forever, `maxLevel` never decreases, load-time reconciliation gets a tested
  policy. Enforcement is **unbuilt**; the lock is **C5 here**, the policy is
  `backlog.md` §61.

### B3. ⚑ The constraint everything follows from

**The editor must never be a second copy of the loader's vocabulary that
nobody remembers to update.** `manual-content-authoring.md` already records
that `tools/content-editor/` *"mirrors this manual's vocabulary and does NOT
auto-discover it"* - a new field or rule is invisible to it until three files
are hand-updated, and the failure is silent (the field round-trips untouched
and simply cannot be authored). For mobs that surface is small. For skills it
is 34 types × their key lists plus six closed vocabularies, and it moves every
time an effect-types chunk lands. A hand copy of `effectKeys` would be stale
within a month. §B4.2 is the answer; everything else in the design is
ordinary form work.

### B4. Design

#### B4.1 Rulings (2026-09-08, choice prompts)

- **D1 - Home: a Skills tab in `tools/content-editor/`.** Not a standalone
  tool (a second copy of the read/write plumbing), not the in-game dev panel
  (needs the unbuilt dev save endpoint and still a restart).
- **D2 - Scope v1: player skills only** (`api/skills/*.json`, the 72).
  Companions and totems are PICKED from existing mobs, never authored inline.
  Mob-embedded skills (`api/skills/mobs/`) are out of the tab (§B11 Q1).
- **D3 - VFX: "coming soon", nothing built.** PO: *"since we haven't settled
  on how vfx is done, lets leave it as coming soon … then lets not touch it.
  everything that is already in a potentially final state gets into the
  editor. anything that is still open, prototype or soon to be changed gets
  out."* The tab shows a disabled **Visuals** section and writes nothing.
  ⚑ That takes **`hitStyle`** out with it (the schema's one visual lever,
  auto/slash/fire/none, chosen server-side and sent as a byte): not rendered,
  preserved on round trip. The shipped-vs-open audit is §4.8.
- **D4 - `archive/plan-content-tooling.md` D7 re-ruled** (banner above): humans
  author skills in the tool.
- **D5 - Numbers: plain fields + a per-level preview table.** Base and
  per-level typed as authored; the form resolves every scaling pair at levels
  1..`maxLevel` beside it, and shows seconds beside every tick field
  (`ticksPerSecond` 30, `api/shared-constants.json`). **No pricing logic in
  the tool** - the numbers-rewrite cost convention stays a human judgement.
- **D6 - Placement: a read-only "obtained via" panel with jump links.** Every
  source of the skill (milestone row, mob `unlocks[]`, NPC `teach_skill`
  grant, recipe result) listed, one click jumps to that entry in its own tab.
  A skill with no source shows **"cheat-only (`SKILL <name>`)"**. Placement
  itself is done in the existing tabs; nothing inline.
- **D7 - The registry count pin stays; the tab shows a post-save checklist.**
  `registry_test.go`'s `assert.Len(t, r.All(), N)` reddens the Go suite on
  every new skill until hand-bumped. After a save the tab lists what is still
  owed (§B4.7). The editor never edits a test file.
- **D8 - Test loop: the tab shows a ready-made game link** with
  `start-cmds=GOD,SKILL <name>` and the restart reminder. Zero coupling to
  this machine's scripts.
- **D9 - Validation: the REAL Go loaders on save, cheap JS checks live**
  (2026-09-08, third prompt round). No JS port of the ~70 skill rules.
  `aurad -validate -content <dir>` (C2) loads every content source, prints
  every finding, exits non-zero, touches no DB; the editor hands it a
  candidate save (§B4.9). As-you-type feedback keeps only what the fixture
  makes free: required fields, vocabulary membership, numbers that parse.
  ⚑ This is the §B3 constraint applied to RULES, not just field lists: the
  loader is the single validator, and the editor asks it.
- **D10 - `plan-content-tooling.md` is ARCHIVED, superseded** (2026-09-08).
  This doc is the only content-tooling plan. Its survivors: the `-validate`
  mode (D9 / C2) and the D5 registry lock (C5); its reconciliation policy
  went to `backlog.md` §61. Placement is Tiled's and is not this doc's
  concern.

#### B4.2 ⭐ The vocabulary fixture - the form is generated from Go's table

*(§B9 proposal, PO may veto the mechanism; the requirement in §B3 is not
negotiable.)*

> ⚑ **C0 amended the sketch below (2026-09-10, session judgement at the PO's
> delegation, PO may veto): the fixture is a
> COMPLEMENT of `api/shared-constants.json`, not a superset.** `effectTypes`,
> `selectors`, `gateKeys` and `statNames` already live there, Go- and
> client-pinned, and stay there; the new file carries only what shared-constants
> does not, plus `topLevelKeys`. A Go test forbids any list living in both
> files and the editor merges the two at read time. Ledger: §B12 C0.

A checked-in JSON file, **`api/skill-vocabulary.json`**, beside
`shared-constants.json`, holding exactly what the form needs and nothing
else:

```json
{
  "categories": ["active_aura", "passive", "cooldown"],
  "effectTypes": ["damage_aura", "heal_aura", …],
  "effectKeys": {"damage_aura": ["radius", "radiusPerLevel", "tickInterval", …], …},
  "costKeys": ["costFractionOfMax", "costFractionOfMaxPerLevel"],
  "renamedKeys": {"targetsMobs": "targetsEnemies/targetsAllies …", …},
  "factionScoped": ["calm", "charm"],
  "selectors": ["nearest", "lowest_health", "all"],
  "damageTypes": ["physical", "fire", "frost", "nature", "poison", "bleed"],
  "gateKeys": ["harvest", "smash"],
  "stats": ["maxHealth", "damageDealt", "damageReduction", "critChance", "costReduction", "movementSpeed"],
  "resistWildcard": "*"
}
```

- **Go is the source; a golden-file test pins the fixture.** A test in
  `pkg/aura/skills` marshals the live tables (`effectKeys`, `keysCost`,
  `renamedEffectKeys`, `factionScopedEffects`, `selectorMap`, `DamageTypes`,
  `GateKeys`, the stat constants, `skillCategoryMap`, `effectTypeMap`) into
  the same shape and `assert.JSONEq`s it against the file. Set
  `UPDATE_SKILL_VOCABULARY=1` and the test rewrites the file instead. **A new
  key, type or vocabulary word reddens `go test` until the fixture is
  regenerated - and the regenerated fixture reaches the editor with no
  further hand work.** This is the shared-constants twin-pin pattern
  (§35 C4c) with Go as the single writer, because here only Go has the truth.
- **The editor reads the fixture off disk** like every other `api/` input,
  and its per-type form is rendered FROM `effectKeys[type]`: a key present
  ⇒ a field. Field *presentation* (label, unit, seconds-beside-ticks, which
  picker) is a small JS table keyed by key NAME, and its smoke test asserts
  every key in the fixture has a presentation entry, so a new key reddens
  the editor's own test too. A key with no entry still renders as a plain
  input (never silently unauthorable, §B3).
- ⭐ **Built for a second kind, only the first built** (PO 2026-09-08). The
  compare-or-rewrite logic is a ~15-line helper in a tiny test-support
  package (no golden-file helper exists in the repo today - measured), and
  the skills test is its first caller. The file is **per content kind, written
  by the package that owns the vocabulary**: `api/skill-vocabulary.json` now,
  `api/mob-vocabulary.json` later, same top-level shape (a map of named lists
  and tables). Per-kind because the tables are unexported in their own Go
  packages (`skills`, `items/mobs`), so one combined file would need exported
  accessors that exist only to feed a test. ⚑ The mob half is NOT part of this
  plan: the mob tab's hand-typed vocabularies are short and change rarely; it
  earns its fixture when the tab next needs a new one. Record the naming
  convention in C0's ledger.
- ⚑ **Why not scrape `definition.go`** the way `tools/tiled/` scrapes
  `zone.go`'s json tags: `effectKeys` is built from `mergeKeys(...)` groups,
  not tags, so a scraper would have to evaluate Go. The golden test evaluates
  it for free.
- ⚑ **Why not serve it from `aurad`**: the content editor's whole posture is
  *"no running aurad"* (its README), and the D1 home keeps that.

#### B4.3 The tab

Sidebar: **Skills**, grouped by category (Auras · Cooldowns · Passives), the
existing collapsible-group pattern. A **"+ New skill"** flow (§B4.5). The
three Omni cheat rigs (`OmniAura` / `OmniPassive` / `OmniStrike`) get a
**test rig** badge so nobody mistakes them for content.

Editor, top to bottom:

1. **Identity** - `name` (the reference key, §B10 L5), `displayName`
   (optional; the catalog derives one from the name), `description` (the
   tooltip's flavor line), `icon` (§B4.4), `category`, `maxLevel`.
2. **Category block** - cooldowns: `cooldownTicks` + per-level, `castTicks` +
   per-level, `castInterruptedByDamage` (only enabled when cast > 0, the
   loader's own rule). Auras and passives: nothing extra. `targetFactions`
   appears for every category (a multi-pick over `api/factions/` names) and
   turns MANDATORY when any effect is `calm` or `charm`.
3. **Effects** - an ordered list of cards. Each card: a type picker over the
   fixture's `effectTypes` minus §B4.8's exclusions, then the type's fields in
   three groups - *shared* (`radius`, `tickInterval`, `selector`,
   `maxTargets`, `targetsEnemies` / `targetsAllies` / `targetsSelf`, the cost
   pair) as far as the type allows them, *payload* (the rest of
   `effectKeys[type]`), and the **per-level preview** (D5). Changing a card's
   type drops keys the new type disallows (with a confirm naming them) - the
   loader would refuse them anyway. Add · remove · reorder.
4. **Visuals** - disabled, "coming soon" (D3).
5. **Obtained via** - the read-only sources panel (D6).
6. **After saving** - the checklist + the test link (§B4.7).

Pickers, never free text: `damageTags` (multi over `damageTypes`), `gateKey`
(single over `gateKeys`, mutually exclusive with `damageTags` per the
loader), `resistTags` (multi over `damageTypes` plus the wildcard, wildcard
alone), `stat`, `selector`, `spawnMob` (§B4.6), `targetFactions`, `icon`.

#### B4.4 Icons

The picker shows the **vendored set** (`SkillIcons.generated.ts`'s keys,
read off disk; 33 glyphs) as the actual SVGs. A glyph outside the set is not
selectable: authoring one is a script run (`node
scripts/fetch-skill-icons.mjs`, which downloads from game-icons.net and
regenerates three committed artifacts, CC BY attribution included). The
picker's empty-state text says exactly that. `SkillIcons.test.ts` already
reddens on an authored-but-unbundled icon, so the loud guard exists; the
picker just stops you walking into it.

#### B4.5 "+ New skill"

Prefills the mandatory fields for the chosen category, **auto-assigns
`id` = max id across BOTH skill folders + 1** (read-only in the form; §B10 L3
on why that is not quite the D5 rule), derives `<kebab-name>.json` from the
typed name, and starts with one effect card of a sensible type (aura ⇒
`damage_aura`, cooldown ⇒ `instant_damage`, passive ⇒ `stat_multiplier`).
Saving writes `api/skills/<kebab-name>.json`. That IS the "export one thing
into a folder automatically" the PO asked for.

#### B4.6 Companions and the sources panel

- **`spawnMob` picker**: mobs whose `role` is `follower` (for `spawn`) or
  `structure` (totems), read from `api/mobs/`, each row with a **"edit in
  Mobs"** jump link. The companion's own aura lives on the mob and is edited
  there. "Define the companion" in the builder means picking one (D2).
- **Obtained via**: computed on render the way `grantedByPanel` is - scan
  `milestone-unlocks.json` rows, every mob's `unlocks[]`, every NPC
  `interaction` grant of kind `teach_skill`, every recipe's `result` and
  `ingredients[]` - and list them with jump links into the owning tab. Also
  lists **"used by mobs"** (`api/mobs/*.json` `skills[]` naming it), since a
  rename must see those too (§B10 L5).

#### B4.7 After a save

The save response carries the checklist, rendered under the header until the
next reload:

1. **Restart `aurad`** (`./scripts/dev-restart-windows.sh server`) - the
   boot-time seam; confirm `Loaded skills … count=` rose by one.
2. **Bump the registry pin** if this was a new skill:
   `backend/pkg/aura/skills/registry_test.go` `assert.Len(t, r.All(), N)`.
3. **Regenerate `docs/content-skill-inventory.md`** (its own script).
4. **Place it** (D6 panel) or it stays cheat-only.
5. **Test link**: `http://localhost:2001/?token=plz&wsUrl=ws://localhost:2000/game&start-cmds=GOD,SKILL <name>`
   (copy button; the token and ports are the CLAUDE.md dev defaults, not
   secrets).

#### B4.8 ⚑ The shipped-vs-open audit (what the tab does NOT offer)

PO instruction (D3): *"anything that is still open, prototype or soon to be
changed gets out."* Audited against CLAUDE.md Status, the backlog and the
plan docs 2026-09-08:

| Out | Why | Handling |
|---|---|---|
| **Visuals** | no VFX ruling exists (`plan-entity-presentation.md` §39, `prototype/skill-visuals` parked) | disabled section |
| **`hitStyle`** | the one visual lever; goes with VFX | not rendered, preserved on round trip (2 users) |
| **`projectile`** type + `forwardUnits`, `armTicks` | `plan-prototype-projectile.md` PARKED 2026-08-20, P2/P3-or-delete hangs on the owed second pass | type hidden from the picker; `ThrowBomb` / `ThrowMine` open **read-only** with a banner |
| **`legacy`** flag | no file authors it; the proving-grounds content it marked was deleted at zone-editor C3 | not rendered, preserved |

In, with a hint in the form:

- **`spawn_at_anchor`** (the portal pair): shipped + archived, but cost is an
  open PO call and it is cheat-only until placed.
- **`reflectFraction`** (retaliate): flat by the C2 raw-damage ruling; whether
  it scales is an open PO call (`content-passives.md`).
- **Per-level pairs and `maxLevel`**: backlog §37 (aura augmentation, parked)
  would change what a level means and move the caps. The PAIR SHAPE is final,
  so it stays in. ⚑ The tool must NOT encode *"every level must move a
  number"* - that catalog guard was explicitly parked with §37 because it
  goes red on `Damage`.

Everything else - the remaining 33 types, cast time, cooldown, target factions,
crit / execute / berserker, gate keys, structure damage, stun, calm, charm,
retaliate, revive, dash, tick rate, speed - is shipped and archived, and in.

#### B4.9 Validation on save (D9)

- **`aurad -validate -content <dir>`**: the seam already exists - `cmd/aurad/loaders.go`
  `diskContent(dir)` builds every registry from a directory and is what
  `-content ../api` uses. The flag runs that plus every cross-validation
  (`quests.CrossValidate`, the mob/skill/recipe/milestone loaders, zone
  validation), collects ALL findings instead of stopping at the first, prints
  one per line, exits 1 on any, and returns **before** the store is opened,
  so it needs neither `AURA_DB_URL` nor `AURA_JWT_KEY`. ⚑ "All findings" is
  the one real change: today each loader returns its first error.
- **The editor's side** (`server.mjs`): on `/api/save/skill`, copy the
  content tree to a temp directory (215 small files, milliseconds), write the
  candidate over its file there, run `backend/aurad -validate -content <tmp>`,
  and refuse the save with the findings verbatim if it exits non-zero. Only
  then write the real file. The binary path is configurable; a missing binary
  is a clear error ("build aurad first"), never a silent pass.
- **Live in the browser**: the fixture-derived checks only (§B4.2). They
  exist so the form can grey out and hint, not to be a second validator.
- ⚑ The other tabs keep their JS ports for now (§B11 Q7). D9 is ruled for
  the Skills tab; extending it is a separate call once the seam exists.

### B5. Chunks

Six, each its own session; C0, C2 and C5 carry Go.

- **C0 - the vocabulary fixture.** ✅ **SHIPPED 2026-09-10** (ledger §B12 C0). `api/skill-vocabulary.json` + the golden
  test with `UPDATE_SKILL_VOCABULARY=1` (§B4.2). Red-first: write the test
  against an empty file, watch it fail naming the diff, generate, green. Then
  the editor's side: `server.mjs` reads the fixture into `/api/data`, and a
  new **`tools/content-editor/smoke.mjs`** (the README's promised
  *"standalone script importing `validate.mjs`"*, which does not exist yet -
  measured) that loads every real `api/skills/**/*.json` and asserts every
  authored key is inside `effectKeys[type] ∪ costKeys ∪ {type}`. That last
  assert is what keeps the fixture honest from the JS side.
- **C1 - the tab, read-only.** Sidebar groups, the form rendered from the
  fixture, the presentation table + its completeness assert, the per-level
  preview, seconds beside ticks, the Visuals placeholder, the sources panel,
  the exclusions of §B4.8. No Save button. ⭐ **Why read-only first: the PO
  judges the form against all 72 real skills before a single write path
  exists.**
- **C2 - `aurad -validate` and the editor's save seam** (D9, §B4.9). Go:
  the flag, all-findings collection, the no-DB exit, a test that runs it over
  the real `api/` (exit 0) and over a fixture tree with one broken skill
  (exit 1, the finding named). Editor: the temp-copy-and-run path in
  `server.mjs`, exercised by `smoke.mjs` against the real tree.
- **C3 - editing and saving.** In-place edits of the raw object (never
  rebuilt - `_comment` on effects survives), the live fixture checks, the
  confirm on a type change that drops keys, `/api/save/skill` through
  `saveOne` gated by C2, the rename guard (§B10 L5), the `maxLevel`-lowering
  warning (§B10 L4). No `validateSkill` port.
- **C4 - the new-skill flow and the bookkeeping.** "+ New skill" (§B4.5), the
  icon picker (§B4.4), the `spawnMob` picker with jump links, the post-save
  checklist + test link (§B4.7), the test-rig badge. Docs: the editor README's
  scope section, `manual-content-authoring.md` "Known hand-sync points"
  (the fixture REPLACES the hand-sync for skills - say so), the add-content
  skill's landmine list (the fixture-regen step), `docs/README.md`.
- **C5 - the registry lock** (D5 rules 1 and 2, carried from the archived
  plan). A checked-in `api/registry-lock.json`: for every skill `id → {name,
  maxLevelFloor}`, retired entries moved to a `tombstones` list instead of
  deleted. Enforced at **boot AND in `-validate`** (there is no CI to run the
  latter, so boot is the loud path): an id reused from the tombstones, an id
  collision, a live `maxLevel` below its floor, a lock out of sync with the
  content. Updated only via `-validate -update-lock`, so drift is reviewed.
  The editor then takes auto-id from the lock (max over live AND tombstoned
  ids + 1), which closes §B10 L3, and its lowering warning becomes the
  loader's refusal (L4). ⚑ Schema NONE: the lock is a content-side file,
  never read by the game loop.

### B6. Schema impact

**NONE.** DB none (skill ids and levels are persisted, and the tool never
changes an existing id; §B10 L3/L4 are the two ways it could matter and both
are guarded). FlatBuffers none. conf none. Content: the tab writes files the
loader already reads; C0 adds one non-loaded fixture file to `api/` (like
`shared-constants.json`, *"not loaded by the game: tests read it from the
repo, so it needs no cp-defs/embed entry"*).

### B7. What this cannot do, by construction

- **Add an effect type.** A type is a Go enum entry, an applier in
  `sys/skills.go`, an `effectKeys` row, a `SkillTooltip.ts` case and maybe a
  `costChargeTrigger` entry. The builder offers what exists. When one lands,
  C0's fixture carries it to the form with zero editor work - that is the
  point of §4.2.
- **Give a skill a visual** (D3, §B4.8).
- **Place a skill in the world** (D6: it shows you where; the other tabs do
  it).
- **Author a mob skill or a companion** (D2).
- **Bump the count pin or regenerate the inventory** (D7: it reminds you).

### B8. Test strategy

- **Go**: the golden fixture test (C0), red-first. Existing `registry_test.go`
  / `definition_test.go` untouched.
- **Go, C2**: `-validate` over the real `api/` exits 0; over a fixture tree
  with one broken skill exits 1 naming it; the all-findings collector proven
  by a tree with TWO broken files reporting both.
- **Editor**: `smoke.mjs` (C0) run by hand before any chunk is declared done
  and cited in each ledger - (a) every real skill file's keys ⊆ fixture,
  (b) after C2: the save seam run against the real tree passes, and against
  the C2 broken fixture is refused with the finding shown. No JS rule port
  means no false-positive sweep is needed for skills (D9).
- **Byte stability** (the Tiled D6 lesson) - **measured 2026-09-08, not
  deferred**: `prettyJson` reproduces only **20 of the 105 skill files**
  byte-for-byte; the other 85 reformat (hand-wrapped `effects[]` entries and
  long `_comment` strings, the writer's 100-column rule). So every save
  through the tab would carry a whole-file reformat on top of the real edit
  until the files are normalized once. **C1 recommends one deliberate
  `api/skills/` reformat commit** (the mob tab already lives with
  `prettyJson`'s style; teaching the writer to mimic hand formatting is the
  wrong side of the trade), with a scripted proof that the reformatted files
  parse to identical objects. PO call (§B11 Q6).
- **In-game**: C3's exit test is the PO's own example - author the
  fire-vulnerability-plus-fire-damage aura in the tab, restart, open the test
  link, see it tick. Also the `verify` skill's boot-count check.

### B9. Proposals adopted without a choice prompt (PO may veto any)

1. The fixture mechanism and its home, `api/skill-vocabulary.json` (§B4.2).
2. Read-only C1 before any write path (§B5).
3. Auto-id = max + 1 across both folders, never editable (§B4.5, §B10 L3).
4. Mob-embedded skills hidden from the tab rather than shown read-only
   (§B11 Q1).
5. A rename with live references is REFUSED, not cascaded (§B10 L5, §B11 Q2).
6. `ThrowBomb` / `ThrowMine` open read-only rather than being hidden (§B4.8).
7. The temp-copy mechanism for validating a candidate save (§B4.9), and the
   configurable binary path.
8. The lock file's shape and its boot-time enforcement (C5), carried from the
   archived plan's §8 proposal with one change: boot enforces it too, because
   there is no CI to run `-validate`.

### B10. ⚑ Landmines

- **L1 - the hand copy.** Any per-type field list typed into `app.js` by hand
  is the §B3 failure. The form renders from the fixture or the chunk is wrong.
- **L2 - `tickInterval` is `*int`, absent ≠ 0.** Absent means "the type's
  default cadence"; an authored 0 is refused. The form needs a tri-state
  (unset / value) for it, the Tiled `wanderRadius` lesson. Same care for
  every optional numeric whose zero the loader rejects (`radius` on geometry
  types, `ttlTicks`, `dotTicks`, …): an empty input must DELETE the key, not
  write 0.
- **L3 - auto-id reuses the last deleted id.** max + 1 over the current files
  re-mints an id if the deleted skill held the maximum. The registry lock
  with tombstones (**C5**) is the real fix; until it lands the form says so
  beside the id. Deleting a skill is NOT a tab feature (persisted spellbook
  rows would orphan).
- **L4 - lowering `maxLevel` on an existing skill.** Persisted
  `skill_level` may exceed the new cap (D5 rule 2: never decreases; the
  reconciliation clamp is `backlog.md` §61, unbuilt). Until C5 the form warns
  and requires a confirm; after C5 the loader refuses a floor breach and the
  form shows that refusal.
- **L5 - `name` is the reference key everywhere.** Mob `skills[]` and
  `unlocks[]`, milestone `skillName`, NPC `teach_skill.skill`, recipe
  `result` / `ingredients[]`, the `SKILL` cheat, the harness scripts, the
  sim-harness preset derivation. A rename with any live reference is refused
  with the list (the sources panel already computed it). The cheat and
  harness references are invisible to the tool - note them in the refusal
  text.
- **L6 - both folders share one id and name space.** The loader recurses
  `api/skills/`; uniqueness checks and auto-id must read `mobs/` too even
  though D2 hides it.
- **L7 - `_comment` lives on effects too.** ⚑ **Measured WRONG at C0 (2026-09-10)**: 0 of 105 files carry an effect-level `_comment`, and `validateEffectKeys` would refuse one at boot (the effect allowlist has no underscore exemption). Only the SKILL-level `_comment` exists (102 files). The in-place-edit rule below still stands for the top level. Edit the raw effect object in
  place; a rebuilt object drops the design-rationale comments the files carry
  (Aegis's `_comment` is the whole ruling record for
  `buffLifetimeMatchesInterval`).
- **L8 - the exclusions must round-trip.** `hitStyle`, `legacy`,
  `forwardUnits`, `armTicks` are never rendered but must be written back
  untouched; `smoke.mjs` (a) covers this only if the read-only files are in
  its sweep - they are.
- **L9 - a saved file is half-live.** It renders nowhere until `aurad`
  restarts (boot-time seam, CLAUDE.md Gotchas). The checklist's first line
  exists because this cost a debugging session on zones.
- **L10 - `targetFactions` becomes mandatory by effect type**, and the loader
  says why: skill-level JSON is parsed WITHOUT `DisallowUnknownFields`, so a
  typo'd top-level key vanishes silently. The form only ever writes the 15
  known top-level keys, which closes that door for tool-authored files.
- **L11 - the sim-harness presets auto-derive player auras.** A new aura
  appears in the presets on the next simharness run; `guardrail_test.go`
  pins balance FINALs on named skills, so a new one cannot redden it, but a
  RENAMED one can (L5).

### B11. Open questions

1. **Mob-embedded skills: hidden (proposal 4) or shown read-only?** Read-only
   costs nothing once C1 exists and would let the PO see WolfBite's numbers
   next to Damage's. Hidden keeps D2 literal.
2. **Rename: refuse or cascade?** Refuse is one rule; cascade edits up to
   five other content kinds in one save and the harness scripts stay stale.
3. **What does the Visuals section become once VFX is ruled?** Whichever tier
   §39 funds, the builder writes a key; the fixture pattern carries a
   `visuals` vocabulary the same way. Not this plan's call.
4. **Should `description` get a length hint?** 10 skills author one; nine
   are 38-85 characters, `OmniStrike`'s is 213. Whether the tooltip wraps that
   gracefully is a UI-pass question, not this tool's; a soft warning at most.
5. **Does C0's fixture also feed `SkillTooltip.ts`'s effect-type switch as a
   completeness pin** (every fixture type has a tooltip case)? Cheap, and the
   §35 class - but a client test reading `api/` is the C4 twin-pin pattern
   already, so probably yes, as a C0 rider.

6. **One reformat commit of `api/skills/` before C3, or a writer that mimics
   hand formatting?** §B8 measured 85 of 105 files reformat. The commit is one
   diff with a parse-equality proof; the mimic is ongoing writer complexity.
7. **Do the existing tabs move to Go validation on save too** (D9 for mobs,
   quests, factions, recipes, milestones), retiring `validate.mjs`'s 637-line
   port? Once C2's seam exists it is mostly deletion, but the live
   as-you-type errors those tabs have today would thin out. Separate call.

### B12. Chunk ledgers

#### C0 - the vocabulary fixture ✅ SHIPPED 2026-09-10 `[uncommitted]`

> Built by an Opus subagent, verified by the session, wrapped here. The two
> design questions below went to the PO as choice prompts; the PO delegated
> both ("what is the smarter and more scalable option"), so they are SESSION
> JUDGEMENTS, not rulings, and the PO may veto either cheaply (reversal cost
> named under each).
> **Schema impact: NONE at every layer.** DB none, FlatBuffers none, conf none;
> the one new `api/` file sits at the root beside `shared-constants.json` and
> is not loaded by the game (`cp-defs` copies the nine content DIRECTORIES
> only, nothing in `frontend/` bundles it).

**What shipped**

- `api/skill-vocabulary.json`, **100 % generated** (its `_comment` included),
  written only by `UPDATE_SKILL_VOCABULARY=1 go test -count=1 ./pkg/aura/skills/`
  and pinned by `TestVocabulary_FixtureMatchesTheLiveTables`
  (`backend/pkg/aura/skills/vocabulary_test.go`). Shape: `categories` (3) ·
  `topLevelKeys` (15) · `effectKeys` (34 types, `mergeKeys` order KEPT, not
  sorted, because §B4.3's shared/payload grouping renders from it; `recall` is
  `[]`) · `costKeys` · `renamedKeys` · `factionScoped` · `damageTypes` ·
  `resistWildcard`. Names come from `catalog.go`'s existing `effectTypeNames`
  reverse map and `resist.go`'s `ResistWildcard` const; nothing is restated.
- `backend/pkg/aura/golden/golden.go`: the compare-or-rewrite helper (§B4.2
  "built for a second kind"), a normal package so `items/mobs` can import it
  later. Its failure message carries the paste-ready regen command for
  whichever package called it.
- `tools/content-editor/vocabulary.mjs` (`readSkillVocabulary`, merges the two
  fixtures), `files.mjs` (`listJsonFiles`, lifted out of `server.mjs` so the
  smoke sweep and the server walk the SAME two-level recursion),
  `smoke.mjs` (+ `npm run smoke`), `skillVocabulary` on `/api/data`, README
  section.

**⭐ The design changed on measurement, twice**

1. **The complement rule (session judgement, PO-delegated).** `api/shared-constants.json` ALREADY
   carried `effectTypes`, `selectors`, `gateKeys` and `statNames`, pinned from
   Go (`skills/shared_constants_test.go`) and from the client
   (`SharedConstants.test.ts`). The §B4.2 sketch would have put the same four
   lists in a second `api/` file. Ruling: the two files have different
   contracts (cross-language wire contract, hand-authored, pinned both sides
   vs. Go-only editor truth, Go-generated) and a list has exactly ONE home.
   `TestVocabulary_ComplementsSharedConstants` forbids any top-level key in
   both files and pins that `effectKeys`' key set equals shared-constants'
   `effectTypes`. The mob fixture follows the same rule when it comes.
   ⚑ shared-constants spells it `statNames`, not the sketch's `stats`.
   Reversal cost: emit the four lists from the golden test too and drop the
   disjointness assert; the editor then reads one file.
2. **`topLevelKeys` is in (session judgement, PO-delegated).** Reflected from `skillDefinition`'s
   json tags in struct order. The payoff is not the form: it is that
   `smoke.mjs` now checks every shipped file's top-level keys, the FIRST check
   of that class anywhere, because the loader parses skill JSON without
   `DisallowUnknownFields` (L10) and a typo'd top-level key vanishes silently.
   Measured before shipping: 0 strays in 105 files, 102 carry `_comment`.
   Reversal cost: delete one reflected field and smoke check (b).

**Findings**

- **§B11 Q5 is already answered**: `SharedConstants.test.ts` pins the
  tooltip's effect-type switch against `effectTypes`. Closed, no rider.
- **L7 was wrong** (see the amended landmine): no effect-level `_comment`
  exists and the loader would refuse one, so `smoke.mjs` has no exemption at
  effect level, on purpose.
- **§B5's "smoke imports `validate.mjs`"** does not hold: `validate.mjs` is
  also loaded by the browser as a plain ES module, so it cannot reach
  `node:fs`, and C0's checks need nothing from it. The README's promise is
  now met by a script that does not import it.
- **`readSkillVocabulary` throws inside `/api/data`**: a missing or broken
  fixture takes down the whole editor response, not a future Skills tab. That
  is the loud posture the plan wants, and the file is checked in; C1 should
  know the coupling.
- **`go test ./...` was RED on arrival, for a stale reason**: six content
  pins (`items/mobs` ×3, `cmd/simharness` ×3) failed with
  `unknown mob "CaveMouth"` / roster 46 vs 48. They read the EMBEDDED
  `backend/pkg/api/` copy, which lacked U4b's two cave mobs on this machine.
  `make -C backend cp-defs` turned all six green with no code change. The
  standing CLAUDE.md census-pin note is amended to say so.
- Pre-existing, untouched: `gofmt -l` flags `applied_effects.go`,
  `aura_category.go`, `utility.go` in the skills package.

**Naming convention for the fixture family** (recorded per §B4.2): one file
per content kind at `api/<kind>-vocabulary.json`, written by the Go package
that owns the vocabulary via `UPDATE_<KIND>_VOCABULARY=1`, complement of
`shared-constants.json`, read by the editor through one `read<Kind>Vocabulary`
in `tools/content-editor/`.

**Verified**: red-first (the golden test failed naming the regen command with
no file on disk, then generated, then green) · `go build ./...` · `go vet` ·
`go test -count=1 ./pkg/aura/skills/ ./pkg/aura/golden/` · full
**`go test -count=1 ./...` EXIT 0, 35 packages** (after the `cp-defs` refresh) · `node tools/content-editor/smoke.mjs` **0 findings / 105
files / 162 effects / 34 types** · `/api/data` on a live editor carries
`skillVocabulary` with both halves merged and no `_comment` leaked ·
**mutation-verified ×3**: a fake key appended to `keysGeometry` reddened the
golden test naming 20 types; a bogus effect key and a bogus top-level key in
`damage.json` each reddened smoke with the file and effect index named.
⛔ No browser harness owns this chunk (no runtime surface changed), so none
was run. **Next: C1**, the read-only tab, rendered from the fixture.
