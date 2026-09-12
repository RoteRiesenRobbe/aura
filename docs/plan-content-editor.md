# Plan: the content editor (`tools/content-editor/`)

> **Status 2026-09-12: Part A SHIPPED (2026-08-27/28, `ebf4cfe5` + `6c2e6d5c`),
> Part B DESIGNED 2026-09-08, C0 SHIPPED 2026-09-10 (`60fb44d2`), C1 SHIPPED
> 2026-09-11 (`7b90fb5e`) and PO-passed the same day, C2 SHIPPED 2026-09-11
> (`5a9b5650`), C3 SHIPPED 2026-09-12 (`dd05b9f4`) and PO-passed the
> same day (§B11 Q6 closed: no reformat, plus the same-day category-rule
> rider), C4 next.** This is the living plan of the one tool: **Part A** is
> the original design (NPC dialogue trees + quest stage
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
  grant, recipe result, ⚑ **and an ascension stone's `rewards[]`** - the
  meta-progression route, missed in the original list, added at C1) listed,
  one click jumps to that entry in its own tab.
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

⚑ **RULED OTHERWISE at C4 (2026-09-12, §B12 C4 ruling 3)**: "+ New" opens
with the category UNSET and NO effect card; only `id`, `name` and `maxLevel`
(5) are prefilled, the live hints ask for the rest. `EFFECT_TYPE_DEFAULTS`
still types the first card ADDED once a category is chosen.

#### B4.6 Companions and the sources panel

- **`spawnMob` picker**: mobs whose `role` is `follower` (for `spawn`) or
  `structure` (totems), read from `api/mobs/`, each row with a **"edit in
  Mobs"** jump link. The companion's own aura lives on the mob and is edited
  there. "Define the companion" in the builder means picking one (D2).
  ⚑ **The role filter was measured WRONG and overruled at C4 (2026-09-12,
  §B12 C4 ruling 1)**: `spawn` authors both roles, `spawn_at_anchor` authors
  the two portal mobs (role `creature`), and Go has no role rule on
  `spawnMob`. The picker offers ALL mobs, grouped Followers · Structures ·
  Creatures, each with the jump.
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
   ⚑ **No such script exists (measured at C4, 2026-09-12; §B12 C4 ruling
   2)**: the file was generated once and is hand-maintained since, so the
   shipped line says "add a row by hand".
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
- ⚑ **Amended by what C2 shipped (2026-09-11).** "All findings" landed as
  **stage-level, plus per-file for skills** (PO ruling); the other loaders
  keep first-error. The editor's side is a **dry-run
  `POST /api/validate/candidate`** over a temp copy, not a call inside
  `/api/save/skill` (that wiring is C3). And the "missing binary" answer got
  a twin: a **stale** binary is refused too, by an mtime guard against the
  newest non-test Go source under `backend/`, because a seam is only as
  current as the last `make -C backend build`.

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
- **C1 - the tab, read-only.** ✅ **SHIPPED 2026-09-11** (ledger §B12 C1). Sidebar groups, the form rendered from the
  fixture, the presentation table + its completeness assert, the per-level
  preview, seconds beside ticks, the Visuals placeholder, the sources panel,
  the exclusions of §B4.8. No Save button. ⭐ **Why read-only first: the PO
  judges the form against all 72 real skills before a single write path
  exists.**
- **C2 - `aurad -validate` and the editor's save seam** (D9, §B4.9). ✅ **SHIPPED 2026-09-11** (ledger §B12 C2). Go:
  the flag, all-findings collection, the no-DB exit, a test that runs it over
  the real `api/` (exit 0) and over a fixture tree with one broken skill
  (exit 1, the finding named). Editor: the temp-copy-and-run path in
  `server.mjs`, exercised by `smoke.mjs` against the real tree.
- **C3 - editing and saving.** ✅ **SHIPPED 2026-09-12 `dd05b9f4`** (ledger §B12 C3). In-place edits of the raw object (never
  rebuilt - `_comment` on effects survives), the live fixture checks, the
  confirm on a type change that drops keys, `/api/save/skill` through
  `saveOne` gated by C2 (⚑ shipped as its own module, NOT `saveOne`: the
  ledger says why), the rename guard (§B10 L5), the `maxLevel`-lowering
  warning (§B10 L4). No `validateSkill` port.
- **C4 - the new-skill flow and the bookkeeping.** ✅ **SHIPPED 2026-09-12** (ledger §B12 C4). "+ New skill" (§B4.5), the
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
  parse to identical objects. PO call (§B11 Q6). ⚑ **RULED 2026-09-12: no
  reformat, no pin.** Re-measured the same day (20 of 105 stable; a tighter
  inline style reaches 33; `4.0` → `4` can never round-trip since
  `JSON.parse` drops it; the mob tab is 0 of 63): the style change lands per
  file on its first tab save, mixed with the real edit, and the loader never
  sees a difference. Nothing needed reformatting; the question was diff
  cosmetics only.
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
- **L2 - `tickInterval` is `*int`, absent ≠ 0.** ⚑ **Corrected at C1
  (2026-09-11)**: absent means **every tick (1)**, not "the type's default
  cadence" - `mapToEffectDef` reads `tickInterval := 1` for every type; an
  authored 0 is refused. The form's hint says so. The form needs a tri-state
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
- **L12 - a 500 from `/api/validate/candidate` is NOT a finding list.** The
  server's generic error shape is `{ok:false, errors:[...]}`; only a real
  validator run returns `findings`. C3's client must branch on the HTTP
  status, or "build aurad first" (and a stale-binary refusal) renders as an
  empty finding list, which looks exactly like a pass. ⚑ **Amended at C3
  (2026-09-12)**: a REFUSED save is 200 `{ok:false, stage:'guard'|'validate',
  errors}` (a bad path, an id change or a live rename never reach the seam and
  must not read as loader findings); only a THROWN seam is 500. The client
  renders three different prefixes.
- **L14 - an in-place edit moves a key to the END of the object.** JS
  `delete` + reassign appends: blanking and retyping `_comment` writes it at
  the bottom of the file, and unchecking then rechecking a bool marks the file
  dirty with no semantic change. Inside the Q6 ruling (the writer owns the
  style), PO-visible on a diff. A key-order-preserving setter is the fix if it
  ever grates.
- **L13 - the mtime freshness guard has two blind spots, by construction.**
  It compares `backend/aurad` against the newest non-test `.go`/`go.mod`/
  `go.sum` under `backend/`, so it cannot see `cmd/aurad/conf.default.json`
  (go:embed, not a `.go` file; moot while `backend/conf.json` exists) and it
  deliberately skips `backend/pkg/api/` (the seam always passes `-content`).
  It is an mtime comparison: a fresh checkout or a clock jump (this host's
  wall clock is non-monotonic) can cost one needless rebuild or, rarely, pass
  a stale binary.

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
   ⚑ **RULED 2026-09-12: neither.** The PO's question was "what do we even
   need to change?", and the honest answer was nothing: no field, no value.
   The style change is absorbed per file on first save (§B8). First proof:
   the PO's own `damage.json` save landed exactly those lines beside the real
   edit (§B12 C3, PO look round 2).
7. **Do the existing tabs move to Go validation on save too** (D9 for mobs,
   quests, factions, recipes, milestones), retiring `validate.mjs`'s 637-line
   port? Once C2's seam exists it is mostly deletion, but the live
   as-you-type errors those tabs have today would thin out. Separate call.

### B12. Chunk ledgers

#### C0 - the vocabulary fixture ✅ SHIPPED 2026-09-10 `60fb44d2`

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
  effect level, on purpose. ⚑ **Amended again 2026-09-11**: the Aegis
  ruling is recorded in `content-ability-matrix.md`, and the comment pass
  (C1 rider) reduced every `_comment` to an authoring note, so no comment is
  a ruling record any more.
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

#### C1 - the tab, read-only ✅ SHIPPED 2026-09-11 `7b90fb5e`

> Built and verified by the session. No PO ruling was needed: §B4.3 and §B9
> settle the design, and the three judgement calls below are presentation,
> each cheap to reverse. **Schema impact: NONE at every layer.** DB none,
> FlatBuffers none, conf none, content none; nothing is written (no Save
> button exists), so §B4.8's round-trip clause (L8) holds trivially.

**What shipped** (`tools/content-editor/`, editor-side only, zero Go)

- **`skill-presentation.mjs`** (new, browser-loadable, no `node:` imports):
  how each of the 98 authorable keys LOOKS - control kind, unit, shared-vs-
  payload group, hidden flag, hint - keyed by key NAME only. ⛔ L1 holds:
  no per-type field list exists in the editor; the card renders
  `effectKeys[type] ∪ costKeys` straight from the served vocabulary, and a
  key with no presentation entry still renders as a plain input. Also holds
  `EFFECT_TYPE_NOTES` (the §B4.8 "in, with a hint" rows and the parked
  banner text), `CATEGORY_LABELS`, `HIDDEN_EFFECT_TYPES` and the pure
  helpers the preview uses (`resolveAt` = `base + (level-1)·perLevel`, the
  same formula as `skills/scaling.go`; `scalingPairs`, `ticksToSecondsLabel`).
- **`smoke.mjs` checks (d) + (e)**: the presentation table and the fixture
  describe the same key set BOTH ways (a new Go key reddens smoke until it
  gets a conscious entry; a stale entry after a Go rename reddens it too;
  a type note on a non-type reddens it), and every `*PerLevel` key's base
  sits in the same list (the pairing the preview relies on).
- **`server.mjs`**: `/api/data` now carries `skills` (`{file, raw}` for BOTH
  folders, L6) and `ticksPerSecond` (read from shared-constants as its own
  field - a constant, not a vocabulary, so it stays out of
  `vocabulary.mjs`'s merge); a static route for the new module.
- **The tab** (`public/app.js`, `index.html`, `styles.css`): a **Skills**
  sidebar tab grouped Auras · Cooldowns · Passives from the fixture's
  `categories`, the faction-group helper generalised into `renderGroupedList`
  for it; `api/skills/mobs/` hidden (D2, §B9 4). The editor, top to bottom:
  the skill-level `_comment` shown as the design record · **Identity** ·
  **Category block** (cooldown + cast pairs with their own per-level table,
  the `castInterruptedByDamage` inert-note when `castTicks` is 0, an
  aura/passive note otherwise; `targetFactions` as checkboxes over
  `api/factions/` + the two reserved names, flagged MANDATORY when any
  effect is in `factionScoped`) · **Effects**, one card per authored effect
  with the type select, the shared group, the payload group, stray-key
  lines, and the **per-level preview** (one column per level to `maxLevel`,
  one row per authored scaling pair, flat rows dimmed, seconds beside every
  tick cell) · **Visuals** (D3 placeholder) · **Obtained via** (D6, five
  source kinds + "also referenced by" for recipe ingredients and mob
  `skills[]`, every row a jump that switches the sidebar tab; cheat-only
  otherwise). Seconds beside every tick field (D5). Every control disabled;
  a `read-only · C1` badge; no Save/Reset.
- **`.claude/skills/verify/content-editor-skills-tab.mjs`** (new) + its
  coverage-map row: the in-tool browser smoke (below).

**Three presentation judgements** (session, PO may veto): (1) unauthored keys
render as dimmed empty fields rather than being omitted, so the full form is
what the PO judges; (2) the cost pair leads the shared group; (3) the parked
`projectile` type stays selectable on the two files that author it (greyed,
with the banner) instead of showing a blank type select. (4) Which
top-level keys render under the Category block rather than Identity is a
six-name list in `app.js` (`CATEGORY_BLOCK_KEYS`): section placement, not a
field list, so L1 holds (a key it does not name still renders, under
Identity), but it is the one presentation choice smoke (d) cannot see; a
`section` field on the presentation entries would fold it under the assert.
Left for C3.

**Findings**

- ⚑ **L2 was wrong**: an absent `tickInterval` is **1**, every tick, for every
  type (`mapToEffectDef`), not a per-type default. Landmine amended; the
  form's hint says "blank = every tick".
- ⚑ **D6's source list missed the ascension catalog**: five skills (Blight,
  Envenom, Frostbite, RimeBurst, Venomward) read as cheat-only on the first
  browser pass because their only placement is `ascension-stone.json`'s
  `rewards[]`. Added as a fifth source kind; D6 amended. After it: 57
  sourced / 15 cheat-only of 72 (the Omni trio, the projectile pair, the
  portal, and ten auras/cooldowns still awaiting the content pass).
- ⚑ **A PRE-EXISTING stale JS port, FIXED as a C1 rider (PO-ruled
  2026-09-11)**: the editor opened with 2 errors - `cave-exit.json` /
  `cave-mouth.json` author `travel_to` mode `"anchor"` (U4b, 2026-09-08),
  unknown to `validate.mjs`'s `TRAVEL_MODES`. The §B3 failure class in the
  mob tab, exactly as predicted, and the root cause was TWO hand copies of
  the list (`validate.mjs` AND `app.js` each declared it). Fix: one exported
  list, `anchor` added with the Go rule's refusal (an `anchor` key on an
  owner-relative mode is never read, `interaction.go` ~979; the key stays
  optional on anchor mode because the destination lives on the placement,
  U3b), and the NPC grant row gained the anchor input + a hint. Proven
  against the real cave-mouth file (passes) and two mutations (refused);
  `/api/validate` 0 errors after a server restart (⚑ `server.mjs` imports
  the validator once at boot, so a validator edit needs a restart). §B11 Q7
  remains the structural answer for the other rules.
- The fixture's `mergeKeys` order (kept unsorted at C0 for this reason) is
  what makes the shared/payload split render in a stable order; sorting it
  would scramble every card.

**Verified**: `node --check` on all three modules · `npm run smoke` **0
findings / 105 files / 162 effects / 34 types** with (d)+(e) live ·
**mutation ×3** (a dropped `radius` entry, a stale `dashLength` entry, a
`recal` type note - each reddened smoke naming the file and key) · browser:
`content-editor-skills-tab.mjs` **0 problems** - Auras 27 · Cooldowns 34 ·
Passives 11 = 72 in the sidebar, 122 cards, 156 preview tables, 0 stray keys,
parked = ThrowBomb + ThrowMine, mandatory `targetFactions` = BindElemental,
Calm, CharmBeast, OmniStrike, a Taunt source jump landing in the Mobs tab on
RallyDrummer · the session read the Damage, ThrowBomb and NovaBurst
screenshots (one layout defect found and fixed: a scaling pair overflowed its
grid cell). **PO look, round 1 (2026-09-11)**: two design fixes, both CSS -
the browser's disabled checkboxes were unreadable (grey box, faint check),
so every checkbox in the tool now uses its own palette (accent fill, dark
check, the primary button's language; enabled and disabled read alike), and
the seven sidebar tabs overflowed their 4-column grid (a `1fr` track cannot
shrink below its label), now a wrapping row.

**PO look, round 2 (2026-09-11): the `_comment` ruling and pass.** Seeing
FireVulnerability's comment in the tab, the PO: *"nonsensical outdated
babbling, kind of deranged"*. Measured: 102 of 105 skill files carried a
`_comment`, median 832 characters, max 3,087 (OmniStrike), 41 of the 72
player skills over 600; every one a chunk retrospective in the plan-doc
ledger dialect (dates, hashes, ⚑/⭐ glyphs, "PO ruled"). **Ruled: a
`_comment` is an authoring note** (what the skill is, which values are
placeholder, at most one landmine sentence with a doc pointer, under ~400
characters; no history, no placement claims), and every skill comment is
rewritten now, in one pass; the tab keeps showing the field in full. Rule
text in `docs/manual-content-authoring.md` "The `_comment` field", plus a
bullet in the add-content skill and a clause in CLAUDE.md's content rules.
The pass: three Sonnet agents drafted from a per-file dump (fields, effects,
old comment) against a brief with three worked examples; the session read
all 102 and corrected 33 (one wrong sentence on Heal - "reapplies more
often, every 80 ticks versus the usual 40" - and 32 placement claims, after
two were found already stale: Barrier "cheat-only" is a recipe result,
FireWard "no unlock source" is a fire-elemental drop; that is where the
no-placement clause of the rule comes from). Applied by replacing **line 2
only** of each file, with a per-file proof that every other line is
byte-identical and the parsed object is equal minus `_comment`, so §B11 Q6
(the reformat commit) is untouched by it. Result: 102 rewritten, median 330
/ max 399; `dash`, `haste`, `tough` had no comment and got none. The old
comments are readable at `df746e53`; the reasoning they carried lives in
the plan-doc ledgers already (Aegis: `content-ability-matrix.md`;
ThrowBomb: `plan-prototype-projectile.md`). ⚑ Open, filed in
`docs/feedback.md`: the same dialect lives in mob, quest, recipe and
faction comments; the ruling covered skills only. Verified: smoke 0/105 ·
`cp-defs` + **`go test -count=1 ./...` EXIT 0, 35 pkgs** · the browser
harness 0 problems · one rewritten comment read in the tab.

**PO look, round 3 (2026-09-11): the form verdict PASSED** ("works, that
part is done"), no reorder of C2/C3. **Next: C2**, `aurad -validate` (D9).


#### C2 - `aurad -validate` and the editor's save seam ✅ SHIPPED 2026-09-11 `5a9b5650`

> Built by an Opus subagent (74 tool calls), verified by the session, wrapped
> here. Six PO rulings via choice prompts (below). **Schema impact: NONE at
> every layer.** DB none (the `-validate` branch returns before the store is
> opened, so no migration and no `AURA_DB_URL`), FlatBuffers none, conf none
> (no new key; `ParseConfig` is a refactor of the same parse), content none
> (no authored file changed; the `9fd5023e` embedded sync is comment-only).

**The six rulings (2026-09-11)**

1. **Findings depth: stage-level, plus per-file for SKILLS.** Every loader
   stage runs and reports; the skills loader collects every broken file. The
   other loaders keep first-error.
2. **Conf: read like boot, never write one.** `AURAD_CONF` / `./conf.json`;
   when absent the embedded `conf.default.json` is parsed IN MEMORY (boot
   writes it to disk, validate must not).
3. **Editor seam: kind-agnostic `validateCandidate({file, raw})` + a dry-run
   `POST /api/validate/candidate`**, NOT wired into `saveOne` for mobs,
   quests, factions or recipes (§B11 Q7 stays a separate call).
4. **`npm run smoke` fails loudly** when `backend/aurad` is missing
   ("build aurad first"), never a silent pass.
5. **Stale binary: an mtime guard**, refusing when the binary is older than
   the newest non-test `.go` / `go.mod` / `go.sum` under `backend/`.
   Build-on-demand via `go build` (measured **0.2 s cached / 4.0 s cold**)
   was recommended by the session and DECLINED, as was documenting it only.
6. **Test fixture: copy the real `api/` into a temp dir and break one file**,
   no checked-in mini tree; a separate test proves the real tree passes.

**What shipped, Go (`backend/`)**

- **`cmd/aurad/content.go` (new) is the one load sequence, and that is the
  point**: `loadContent(src, config, zoneList) (loadedContent, []string)`
  runs every stage in the boot dependency order and BOTH boot and `-validate`
  consume it, so the order cannot drift into two hand copies (the §B3 class).
  Independent stages keep running after a failure; a stage whose input failed
  emits `x: skipped (y did not load)`, so a clean line can never hide a
  second-round error. Also `stageFindings`/`flattenJoined` (flattens
  `errors.Join` fan-outs only, never the `%w` chain), `runValidate(w
  io.Writer, ...) int` (**0 clean · 1 findings · 2 the validator itself
  broke**), `validateMain`, `validateConf()`, and `resolveZoneList` (the
  `-zones` > `-zone` > `game.zones` > `game.zone` ladder, now ONE copy).
- `cmd/aurad/aurad.go`: the `-validate` flag, branching after flag parsing
  and **before** `openDatabase` and `loadOrCreateTokens`, so it needs neither
  `AURA_DB_URL` nor `AURA_JWT_KEY` and writes nothing.
- `cmd/aurad/loaders.go`: every `loadX` helper returns `(T, error)` instead
  of panicking, keeping its slog.Info counts and slog.Warn legacy warnings.
- `pkg/aura/skills/registry.go`: the walk records each broken file and
  continues; a failed file is never inserted, so the duplicate id/name checks
  stay consistent; `errors.Join` at the end (a single error prints unchanged).
- `pkg/aura/cfg/conf.go`: `ParseConfig(data, label)` extracted, `ReadConfig`
  delegates to it.
- Tests: `cmd/aurad/validate_test.go` (new, 7) - the real `api/` is clean ·
  one broken skill named · EVERY broken skill named · a skill and a prop both
  reported with the six dependent stages skipped BY NAME · a missing content
  dir is a finding · `validateConf` writes no file · `ParseConfig` equals
  `ReadConfig` on the same bytes. `pkg/aura/skills/registry_test.go` +2
  (collects every broken file; a broken file claiming a good file's id AND
  name does not poison the duplicate checks). Call sites updated in
  `loaders_test.go`, `scaling_profile_test.go`,
  `ascension_catalog_content_test.go`.

**What shipped, editor (`tools/content-editor/`)**

- **`aurad-validate.mjs` (new, node-only)**: `findAuradBinary` (`AURAD_BIN`,
  `backend/aurad`, `backend/aurad.exe`), `assertAuradFresh` (the ruling-5
  mtime guard; skips `_test.go` and `backend/pkg/api/`), `candidateSegments`
  (kind-agnostic `api/<dir>/[<sub>/]<slug>.json`, one nesting level, rejects
  `..`, absolute paths, backslashes and any non-content dir; proven against
  every real content file), `validateCandidate` (mkdtemp, copy the nine
  content subdirs, write the candidate, spawn with cwd `backend/` and a 30 s
  timeout, always rm), `parseFindings` (drops the summary line).
- `aurad-validate.test.mjs` (new): 5 freshness-guard cases on temp fixtures +
  11 path-guard cases, touching no repo file.
- `server.mjs`: `POST /api/validate/candidate`, dry-run only.
- `smoke.mjs`: leg **(f)** the seam over the real tree, plus a candidate with
  an unknown effect key refused naming the file; leg **(g)** the unit
  self-tests. Header updated (leg f needs the binary).
- `README.md`: a new "The save seam: `aurad -validate`" section.

**Findings**

- ⭐ **Boot now lists EVERY content finding, not the first** - a free side
  effect of the one-sequence shape, and the panic message points at
  `aurad -validate -content <dir>`.
- ⚑ **The mtime guard's blind spots** (now §B10 L13): it cannot see
  `cmd/aurad/conf.default.json` (go:embed, not a `.go` file; moot while
  `backend/conf.json` exists) and deliberately skips `backend/pkg/api/`
  (the seam always passes `-content`). It is an mtime comparison, so a fresh
  checkout or this host's non-monotonic clock can produce a false stale
  (one wasted rebuild) or, rarely, a false pass.
- ⚑ **A 500 from the endpoint carries the server's generic
  `{ok:false, errors:[...]}` shape, not `findings`** (now §B10 L12): C3's
  client must branch on the HTTP status, or "build aurad first" renders as
  an empty finding list, i.e. as a pass.
- ⚑ **`51659e0b` skipped `cp-defs`**: the embedded skills copy was 102 files
  behind until the separate sync commit `9fd5023e` (PO chose to land it
  first). `make -C backend build` after ANY `api/` edit, or the tracked
  embedded copy drifts silently.
- ⚑ The skills layout is `api/skills/*.json` + `api/skills/mobs/`, never
  `player/`; §B10 L6's wording is right, the C2 spec said `player/`
  (harmless, nothing read it).
- **TDD honesty**: `registry.go` was red-first; `content.go` and
  `validate_test.go` were implementation-first, and mutations (a)/(b) below
  are their bite proof.
- **§B11 Q7 is now one line per tab away** (the seam is kind-agnostic by
  ruling 3), but it stays a separate call: the four existing tabs would trade
  their live as-you-type errors for a spawn per save.
- ⚑ **Before C3: §B11 Q6**, the one reformat commit of `api/skills/` (85 of
  105 files reformat under `prettyJson`).

**Verified** (session's own runs unless marked): `go build ./...` · `go vet`
on `cmd/aurad`, `skills`, `cfg` · `make -C backend build` · **`go test
-count=1 ./...` EXIT 0, 35 pkgs** · **`npm run smoke` 0 findings / 105 skill
files / 162 effects / 34 types, EXIT 0** incl. the new legs (f)+(g) · browser
harness `content-editor-skills-tab.mjs` **0 problems** (72 skills, 122 cards,
a Taunt jump landing on RallyDrummer) · **a REAL BOOT**, the half no agent
could do: `./aurad -dev -content ../api` against the dev DB for 12 s, loading
factions 12 · skills 105 · mobs 63 · milestones 3 · recipes 11 · quests 13 ·
ascension 8 · props 6 · zones world + underworld placed, then killed cleanly
· live endpoint probe: `{}` → `{ok:true,findings:[]}`, a broken Aegis
candidate → `ok:false` with `skills: cannot map "aegis.json": ...` first and
six `skipped` lines after · zero em dashes in any new line. Agent's tail:
`./aurad -validate -content ../api` with `AURA_DB_URL` and `AURA_JWT_KEY`
verified UNSET → `0 finding(s)` EXIT 0 · the embedded run EXIT 0 · a broken
tree (an unknown Aegis key + a `rock.json` parse error) → **8 findings EXIT
1**, both named, six skipped by name · a missing binary → smoke red with
"build aurad first" · a stale binary (an `AURAD_BIN` copy touched to 2020) →
smoke red naming the newest source. **Mutation ×3**, each red then reverted:
(a) the skills walker returning on the first error →
`TestRegistry_CollectsEveryBrokenFile` +
`TestRunValidate_EveryBrokenSkillFileIsNamed`; (b) `loadContent` stopping
after the first failed stage →
`TestRunValidate_IndependentStagesBothReportAndDependentsSkip`; (c) the seam
ignoring the exit status → smoke leg (f). **Measured**: a seam round trip
**66-135 ms** (222 files copied plus a full loader run) and the freshness
stat sweep **2-8 ms** over ~600 files; one `Date.now()` delta read **-357
ms**, this host's known non-monotonic clock, so `hrtime` is used.

**Next: C3** (editing and saving through the seam, the L2 tri-state, the
type-change confirm, the L5 rename guard, the L4 `maxLevel` warning),
preceded by the §B11 Q6 reformat commit. Then C4, C5.

#### C3 - editing and saving ✅ SHIPPED 2026-09-12 `dd05b9f4`

> Built by an Opus subagent (67 tool calls), verified by the session, wrapped
> here. Three PO rulings via choice prompts (below), plus the rider's fourth.
> **Schema impact: NONE at every layer.** DB none, FlatBuffers none, conf
> none. Content: ONE file, `api/skills/damage.json` (the PO's own tab save,
> round 2 below) plus its `cp-defs` copy; every file the verification itself
> wrote was restored byte for byte. Go only in the rider paragraph.

**The three rulings (2026-09-12)**

1. **§B11 Q6: NO reformat commit, no byte-stability pin.** Asked twice; the
   PO's second question ("what do we need to reformat, and because of what?")
   reframed it: nothing needs changing, the writer just cannot reproduce hand
   whitespace or a `4.0`. Ruled: the style change lands per file on its first
   tab save, the way the mob tab has lived since Part A.
2. **`_comment` is EDITABLE** (a textarea with the authoring-note rule as its
   hint; blank deletes the key). This reverses C1's "shown, never edited".
3. (Session judgements at the PO's delegation, PO may veto): blank number /
   unchecked bool / empty select or multi all DELETE the key (every skill bool
   is a plain Go `bool`, checked against `definition.go`, so absent is false);
   `id` read-only; Save always enabled, the live checks are hints only; a new
   card opens on the category's default type; refusals are 200 with a
   `stage`.

**What shipped (`tools/content-editor/`, plus one harness)**

- **`save-skill.mjs` (new, node-only)**: `saveSkill({file, raw}, deps)`, every
  dependency injected. Order: path guard (`api/skills/<slug>.json` only, via
  `candidateSegments`, the file must exist: C4 owns "new") · id guard (a
  changed `id` refused, spellbook rows persist it) · **rename guard** (§B10
  L5: any content naming the old skill refuses the save with the list, plus
  the invisible cheat / harness / simharness references named in the text) ·
  the C2 seam · `prettyJson` write. ⭐ **Not `saveOne`**: the four older
  kinds run `validate.mjs`'s port before writing; a skill runs NO JS port
  (D9), so the only rules typed here are the three the loader cannot see.
  Guards RETURN, the seam may THROW (L12).
- **`skill-references.mjs` (new, browser + node)**: ONE
  `collectSkillReferences(name, {mobs, milestones, recipes})` returning plain
  `{label, jump:{kind,file,nodeId?}}` rows, used by the sources panel (jump
  links) AND the rename guard, so a row the panel shows is a row the guard
  sees.
- **`save-skill.test.mjs` (new)**: 8 case groups over a temp copy of `api/`
  with a fake seam (path, id, rename refused naming the milestone, rename
  with no references reaching the seam, a finding refusing the write, a clean
  write preserving `_comment` + `hitStyle`, a throwing seam propagating) and
  `collectSkillReferences` against real content. Smoke leg **(h)**.
- **`public/app.js`**: every control live, in-place mutation, the L2 tri-state
  on every field, the parked guard as ONE line at the top of
  `renderSkillEditor` (a `HIDDEN_EFFECT_TYPES` skill keeps every control
  disabled and no Save), Reset + Save header (`resetEntry` gained `'skill'`),
  effect cards add / Delete (confirm when keys are authored) / ↑ ↓ / change
  type with a confirm naming every dropped key incl. `hitStyle (not shown)`,
  category change re-rendering the block, live hints, `saveSkill` branching on
  the HTTP status with three prefixes ("refused:", "refused by aurad
  -validate:", "the validator could not run (HTTP n), nothing was written:"),
  the `maxLevel`-lowering confirm (L4). `CATEGORY_BLOCK_KEYS` is gone: the C1
  rider, `section` on the presentation entries, smoke (d) refusing an unknown
  section.
- **`skill-presentation.mjs`**: `section: 'category'` on the six keys;
  `EFFECT_TYPE_DEFAULTS` (§B4.5's map, exported for C4, smoke-pinned to live
  categories and types).
- `server.mjs`: `POST /api/save/skill`, the static route. `smoke.mjs`: leg
  (h), (d) extended, header. `styles.css`, `index.html`, `README.md` (the
  save contract, the guards, the tri-state, the parked rule, L14).
- **`.claude/skills/verify/content-editor-skills-tab.mjs` REWRITTEN** for the
  editable tab (its C1 asserts were inverted): the 72-skill sweep (Save
  present, `id` disabled, `name` enabled, parked = zero enabled + no Save),
  then the edit legs on Damage and OmniAura (dirty dot, add + Reset, a rename
  refused as a guard naming the milestone, an illegal cost refused BY THE
  SEAM, a real description save with the file on disk changed by that key
  only and `_comment` intact, then restored byte for byte; type-change
  confirm accept + cancel, move, Delete, the `maxLevel` confirm cancel posting
  nothing), then the four screenshots. ⚑ Needs a fresh `backend/aurad` now.

**Findings**

- ⚑ **L14 (new)**: `delete` + reassign appends the key; see §B10.
- ⚑ **L12 amended**: refusals carry `stage`; three client prefixes.
- ⚑ **A Playwright element handle to a sidebar row goes stale after a save**
  (the sidebar re-renders on save and on every validation pass); the harness
  opener is locator-based for that reason.
- ⚑ **A card with no `type`** (a fresh card on a skill whose category is
  unset) needs a blank option or the select shows the first type while the
  object authors none (advisor-caught, fixed before verification).
- **§B5 said "through `saveOne`"; C3 did not**, deliberately (above). C1's
  ledger said `_comment` is never edited; ruling 2 reverses it.
- ⚑ **The `1.0` marker on float fields is lost on first save** (Q6): a
  reader of a tab-saved diff should expect `4.0` → `4` and `["x"]` → `[ "x" ]`
  lines beside the real edit.
- **Presentation, still open after the PO look**: the live hints render in the red
  `.errors-inline` box and read like refusals though they never block Save.
- **TDD honesty**: `save-skill.mjs` red-first (12 findings against a stub);
  `app.js`, `section`, `EFFECT_TYPE_DEFAULTS` and the smoke legs
  implementation-first, their bite proof the mutations below.

**Verified** (session's own runs unless marked): `npm run smoke` **0
findings / 105 files / 162 effects / 34 types**, legs (a)-(h) · `node
save-skill.test.mjs` 0 findings, exit 0 · browser harness
`content-editor-skills-tab.mjs` **0 problems**: 72 skills, 122 cards, 156
previews, parked = ThrowBomb + ThrowMine with 0 enabled controls, every other
skill exactly 1 disabled control (`id`), editable `_comment` on 70, the
Taunt jump to CityGuard, rename refused naming the milestone, cost 1.5
refused by the seam with the loader's own message, the description save
round-tripped and restored · **the §B8 exit test, headless half**: a fire
`damage_aura` card added to FireVulnerability through `/api/save/skill`
(200 ok), then **a REAL BOOT** `./aurad -dev -content ../api` against the
dev DB for 14 s loading `Loading content source=../api` and `Loaded skill
definitions count=105` with the two-effect file, no panic, killed cleanly;
file restored. ⚑ **The in-game tick of that aura was left to the PO's own
look** (the test link; no agent walked it), and round 2 below covers it. · **Mutation ×6** (agent ×4: rename
guard defeated → 4 findings · seam answer ignored → 2 · bogus
`EFFECT_TYPE_DEFAULTS` type → smoke 1 · bogus `section` → smoke 1; session
×2: id guard removed → the unit test 3 findings · parked guard defeated →
the harness 6 problems on ThrowBomb + ThrowMine), each red then reverted ·
zero em dashes in any new line (the `— unset —` / `—` placeholders are C1's
UI string literals). Not re-run: `go test` (zero Go changed).

**PO look, round 1 (2026-09-12): the category rule, a RIDER built the same
day.** The PO added a `stat_multiplier` card to an aura and asked why the tab
did not say that is illegal, and where the flat 33-entry type list came from.
Measured: the loader had NO rule tying effect types to skill categories; the
legality lived only in three runtime switches (`sys.applyAuraEffect` ticks
eight output auras and drops the rest in `default:`, the activation
dispatcher fires the 21 casts, `SkillComponent.recomputeDerived` folds four
passives over `PassiveSlots` only), so the aura loaded clean and the stat
bonus reached nothing. **Ruled (choice prompt): the Go rule + a filtered
picker, now** (over "as a C4 rider" and "an editor-only hand list", the
latter being the L1 failure). Shipped by an Opus subagent (69 tool calls),
verified by the session: `effectCategories` beside `factionScopedEffects`
(active_aura 9 · cooldown 21 · passive 5, `light_aura` legal on aura AND
passive because `LightRadius` walks both slot lists; `EffectTypeNone`
unplaced), refused in `mapToSkillDefinition` as `skill "X": effect type
"stat_multiplier" is not legal on an active_aura skill (legal on: passive)`;
`effect_categories_test.go` (every type placed · only real categories · two
refusals · light on both) red-first; two pre-existing parse tests rewired
because they wrapped every type in `cooldown`; the fixture gained
`effectCategories` (34 entries) and the complement test pins it against
shared-constants' `effectTypes`; the picker offers only the category's types
(parked filter still on top), a card whose type no longer fits shows the
loader's own sentence in red and the header hint repeats it; smoke gained
three asserts (content legality per file, `EFFECT_TYPE_DEFAULTS` legal for
its category, `effectCategories` ↔ `effectKeys` both ways); the harness
checks the picker on Damage and OmniPassive. All 105 files fit the partition,
measured before the table was written. **Schema NONE, content NONE** (the
fixture is generated). Verified (session): `go test -count=1 ./...` EXIT 0,
35 pkgs · smoke 0/105 · harness 0 problems (`picker: aura 9, passive 5`) ·
agent's mutations ×6 (table entry removed → test + golden red; guard defeated
→ 2 refusal tests red; a re-placed `damage_aura` → smoke 36; a type deleted
from the fixture → smoke 1; `legalEffectTypes` defeated → harness 2). ⚑ The
plan's own audit missed this: §B2 called the loader "strict and good", and it
was, for everything the JSON SHAPE can express; the category rule is the
first that needed the dispatchers read. ⚑ A `default:` that silently ignores
an effect is the right RUNTIME shape (a panic in the tick loop is worse), so
this class of rule belongs at load time; look for siblings whenever a switch
has a silent default.

**PO look, round 2 (2026-09-12): the C3 verdict PASSED** ("Seems to work").
The checklist handed over was the write path end to end plus the in-game tick
of a tab-authored aura, and the verdict covers the look as a whole; nothing on
C3's write path is owed a second sitting. ⭐ **The PO's own save of
`api/skills/damage.json` is the first real content edit made through the tab,
and it ships in this commit**: the `_comment` trimmed to one sentence (the
authoring-note rule applied by hand, by its author) and, beside it, exactly
the Q6 style lines the Findings bullet predicted - `radius` `1.0` to `1`,
`radiusPerLevel` `0.0` to `0`, `["physical"]` to `[ "physical" ]` - plus the
`cp-defs` copy under `backend/pkg/api/skills/damage.json`. Parse-equal apart
from the comment, so for the loader it is a comment-only content change;
**schema NONE**. Left open, both presentational and low-stakes: the live
hints render in the red `.errors-inline` box and read like refusals though
they never block Save, and L14's key-to-the-end reorder is still what a
reviewer of a tab-saved diff sees after a blank-then-retype.

**Next: C4**, shipped the same day (below). Then C5.

#### C4 - the new-skill flow and the bookkeeping ✅ SHIPPED 2026-09-12 `[uncommitted]`

> Built by an Opus subagent (117 tool calls), verified by the session, wrapped
> here. Three PO rulings via choice prompts before a line was written (below).
> **Schema impact: NONE at every layer.** DB none, FlatBuffers none, conf
> none. Content: ONE file, `api/skills/summonspider.json`, the PO's first
> tab-authored spell (id 152, cheat-only, shipping here the way C3 shipped the
> PO's `damage.json`), plus its `cp-defs` copy and the registry pin 105 → 106;
> every file the verification itself wrote was deleted again. Go: the pin bump
> only.

**The three rulings (2026-09-12)**

1. **`spawnMob` picker: ALL mobs, grouped by role** (Followers · Structures ·
   Creatures, each row with an "edit in Mobs" jump). §B4.6's "followers for
   `spawn`, structures for totems" was measured WRONG against the content:
   `spawn` authors both roles, `spawn_at_anchor` authors `PortalHome` /
   `PortalSummon` (role `creature`), and Go has no role rule on `spawnMob` at
   all, so a filter typed into the editor would have been the L1 class and
   would have hidden two shipped mobs. Offered and declined: a Go rule the way
   the C3 category rider went (needs a portal decision first).
2. **Checklist line 3 is an honest hand reminder.** §B4.7 said "regenerate
   `docs/content-skill-inventory.md` (its own script)"; there is no script,
   the file is marked MEASURED STALE since 2026-08-10 and was last touched by
   hand in the projectile commit. The line now says "add a row by hand, there
   is no generator". Building one was declined as scope creep.
3. **"+ New" opens with the category UNSET**: one button in the Skills sidebar
   header, a name prompt, then a form with `id`, `name`, `maxLevel` prefilled,
   no category and no effect card; the live hints ask for the rest. Over the
   session's recommendation of three buttons (+ Aura · + Cooldown · +
   Passive) and over a second prompt for the category. §B4.5's "one effect
   card of a sensible type" is therefore NOT prefilled; `EFFECT_TYPE_DEFAULTS`
   still drives the type of the first card ADDED once a category is set.

**Session judgements at the PO's delegation (PO may veto)**: `maxLevel`
default 5 (53 of 72 skills) · `icon` left EMPTY so the required hint forces a
deliberate pick · the test link rendered ALWAYS in a bottom "After saving"
section (testing an existing skill is the common case), the checklist filling
it after a save · the checklist rides the save RESPONSE so the unit test can
read it, the registry-pin count computed server-side from the files on disk
after the write, never a line number · items 2-4 (pin, inventory row,
placement) only on a NEW skill's first save, item 1 (restart) on every save ·
the test-rig badge driven by a three-name `TEST_RIG_SKILLS` list, smoke-pinned
to exist · no JS duplicate-id / duplicate-name guard: `registry.go` refuses
both and the seam surfaces it (D9; proven by a smoke leg and a harness POST).

**What shipped (`tools/content-editor/`, docs, one harness)**

- **`skill-icons.mjs` (new, node-only)**: parses
  `frontend/src/client-data/icons/SkillIcons.generated.ts` into
  `{key: {viewBox, body}}` with a line regex; ZERO glyphs parsed throws and
  takes `/api/data` down with it (the C0 loud-fixture posture). 33 glyphs.
- **`save-skill.mjs`**: `saveSkill({file, raw, isNew})`. Existence checked
  both ways (a create refuses an existing file, an edit refuses a missing one;
  C3's "the + New flow arrives with C4" refusal is gone); the id and rename
  guards skipped for a new skill; the response carries `{ok, warnings,
  checklist, skillCount}`.
- **`save-skill.test.mjs`**: +4 case groups (red-first, 16 findings against the
  C3 module): create onto an existing file · edit of a missing file · a clean
  create with a duplicate id AND name reaching the fake seam (the guard must
  not pre-empt Go) · the 4-item checklist with the computed count, 1 item on
  an edit.
- **`smoke.mjs`**: leg **(i)** every authored `icon` in `api/skills/**` is a
  vendored glyph (the editor-side twin of `SkillIcons.test.ts`, both halves:
  unvendored AND missing) · leg **(j)** `TEST_RIG_SKILLS` exist on disk · leg
  (f) gained the real-seam proof that a new file reusing id 1 is refused as
  `duplicate skill ID`.
- **`skill-presentation.mjs`**: `TEST_RIG_SKILLS`; the `icon` and `spawnMob`
  hints rewritten for the pickers. `server.mjs`: `skillIcons` on `/api/data`,
  `isNew` passed through.
- **`public/app.js`**: `createNewSkill` (+ `#skill-new-btn`; auto-id = max
  over BOTH folders + 1, L6, with the L3 caveat beside it on a draft only) ·
  sidebar rows split into `.item-name` + badge spans · the rig badge in row
  and header · the icon picker (visually hidden radios with the inline SVGs,
  `(none)`, the file's current value always offered and marked `not vendored`
  if outside the set, the footer naming `scripts/fetch-skill-icons.mjs`) · the
  `spawnMob` picker (`<optgroup>` by role, current-value fallback, the jump) ·
  the always-rendered "After saving" section (test link + Copy +
  `#skill-checklist`) · `saveSkill` posts `isNew`, clears the draft badge,
  renders the checklist. `index.html`, `styles.css`.
- **Docs**: the editor README (scope, "What C4 added", the seven-step save
  contract, the two smoke legs) · `manual-content-authoring.md` (the
  "Known hand-sync points" mirror claim is FALSE FOR SKILLS since C0, the
  fixture + golden test named, still true for the other kinds; §2 says an
  ability can be authored in the tab) · the add-content skill (the
  fixture-regen landmine after any `definition.go` table change, and the tab
  pointer) · the verify skill's coverage row · `docs/README.md` index line.
- **`.claude/skills/verify/content-editor-skills-tab.mjs`**: the opener and
  sweep read `.item-name`; per-skill rig-badge and test-link asserts; part 2b
  (both pickers, the `spawnMob` jump) and part 2c (the whole new-skill flow:
  prompt, draft shape, id 152, the duplicate "+ New" refused client-side, a
  save that lands on disk, the checklist with the pin count, a new file
  reusing id 1 refused BY THE SEAM, then **mandatory cleanup in a `finally`**:
  a leftover file under `api/skills/` reddens the Go registry pin for
  everyone); screenshots after a reload so they show the disk.

**Findings**

- ⚑ **Key order on a tab-authored NEW file differs from every shipped one**:
  prefill writes `id, name, maxLevel, effects`, then `category` and `icon`
  are set later and L14 appends them, so the file reads `id, name, maxLevel,
  effects, category, icon` where hand files read `id, name, icon, category,
  maxLevel, effects`. Parse-equal, loader-indifferent, PO-visible on a diff;
  Q6 territory. The harness asserts the key SET, so it cannot see this.
- ⚑ **Go has no `icon` rule at all** (only `catalog_test.go` reads it, and it
  tolerates empty): a new skill saved with `(none)` passes the seam and reddens
  the frontend vitest silently. Smoke (i) covers it from the editor side, a
  named D9 exception (the editor is stricter than the loader here on purpose).
- ⚑ **The checklist is dropped by any STRUCTURAL re-render** (a category
  change, adding a card, repicking `spawnMob`), not only by a reload or a
  re-selection.
- **A parked skill now has two enabled non-form elements**: the Copy button,
  and on `ThrowBomb` / `ThrowMine` the "edit in Mobs" link for
  `ProjectileBomb`. Neither writes; the sweep's "zero enabled controls"
  counts `input/select/textarea` and still holds. A deliberate exception to
  §B4.8's wording.
- The role census behind ruling 1: 63 mobs, follower 4 / structure 11 /
  creature 48; the two portal mobs are creatures, `ProjectileBomb` is a
  structure.
- Cosmetic, same bucket as C3's red hint box: `.file-path` glues the draft
  badge to the path in text form, and the ICON field stacks two hints (the
  required hint plus the picker footer).
- **TDD honesty**: `save-skill.mjs` red-first; `skill-icons.mjs`, the smoke
  legs, all of `app.js` and the harness legs implementation-first, their bite
  proof the mutations below.

**Verified** (session's own runs unless marked): `node save-skill.test.mjs`
0 findings, exit 0 · `npm run smoke` **0 findings / 105 files / 162 effects /
34 types / 33 glyphs** · browser harness `content-editor-skills-tab.mjs`
**0 problems**: 72 skills, badges on exactly OmniAura + OmniPassive +
OmniStrike, icon picker 34 options (33 glyphs + `(none)`) with Damage's
`lorc/broadsword` current, `spawnMob` picker Followers 4 · Structures 11 ·
Creatures 48 and the jump landing on Companion in the Mobs tab, the draft with
id 152 / maxLevel 5 / no category / no card, the duplicate "+ New" refused,
the new save written with the four-line checklist naming 106, the duplicate id
refused by the seam (`duplicate skill ID 1: "Damage" and "HarnessDupId"`), the
file deleted · **the §B8 exit test, headless half, through the ROUTE**: the
PO's example shape (`resist_aura` fire ×1.25 + `damage_aura` fire, 3 targets,
every 30 ticks) POSTed as a NEW skill to `/api/save/skill` → 200 ok with the
checklist naming pin 106, the file on disk in the writer's style, then **a
REAL BOOT** `./aurad -dev -content ../api` against the dev DB for 15 s:
`Loaded skill definitions count=106`, no panic, killed by timeout, file
deleted · **mutation ×5** (agent, each red then reverted): an authored icon
typo'd → smoke 1 · the `isNew` exists-guard defeated → unit test 2 · a bogus
`TEST_RIG_SKILLS` name → smoke 1 · `skillCount` off by one → unit test 2 ·
auto-id prefill +2 → harness 1 · zero em dashes in new lines (two reflowed
pre-existing README lines keep theirs). ⚑ **The in-game tick of a tab-created
skill was NOT walked by anyone at build time**: the test link was handed to
the PO, and the PO look below is that walk. **Added at the wrap**, because the
registry pin makes this chunk touch Go after all: `go test -count=1 -timeout
120s ./...` **EXIT 0, 35 pkgs** (21 without test files), and
`./aurad -validate -content ../api` **`0 finding(s)`, exit 0** with
`Loaded skill definitions count=106`.

**PO look (2026-09-12): PASSED, and it produced a spell, a plan and two UI
fixes.** The PO authored **`SummonSpider`** end to end in the tab (a `spawn`
cooldown of the wild `Spider`, maxLevel 5, `ttlTicks` 1800 +150/level, cost
5 % of max +0.75 %/level): the new-skill flow wrote the file, the seam
validated it, a boot loaded it (`count=106`) and the PO cast it in game. The
Spider **fought on the caster's side and was untargetable by other players**,
so the summon plumbing works from a tab-authored file; it also **STOOD STILL**
where it spawned. That is by design today, not a bug in C4: the permission to
follow a caster lives on the MOB's `role` (`RoleFollower`), which is why every
pet is a twin file, and a wild species has none. It became
**`docs/plan-summon-follows.md`**, designed the same day (a `follows: true` on
the `spawn` effect, the charm precedent) and PO-scheduled as **the next chunk,
ahead of C5**. ⭐ **The file ships in this commit**, the tab's first
new-from-nothing content, the way C3 shipped the PO's `damage.json`: id 152,
SKILL cheat only, plus its `cp-defs` copy and the registry pin **105 → 106**.
**Two UI fixes shipped the same day out of the look.** (1) The **icon
picker's highlight now follows the click**: the selected class was stamped at
render time and a value edit never re-renders the form, so `(none)` stayed lit
however many glyphs the PO clicked, and the pick only appeared to take after a
category change forced a re-render. (2) The **post-save checklist moved under
the header**, into an "After this save" box beside the save feedback, instead
of sitting at the bottom of the form ("where is that checklist?"); the test
link stays in the bottom "After saving" section, which is always there. Both
re-verified: the browser harness **0 problems** over 73 skills, `npm run
smoke` **0 findings at 106 files**. ⚑ Two findings the file itself shows: the
**new-file key order** predicted above (`category` and `icon` land LAST), and
**no `cooldownTicks`**, so the spell is castable every tick for 5 % of max per
press - the picker never asked for one and the loader does not require one;
noted to the PO as a tuning matter, not fixed here. ⚑ The checklist's
**inventory row was deliberately NOT added**: `docs/content-skill-inventory.md`
is MEASURED STALE and this is a cheat-only test spell, not content anyone
hunts.

**Next: C5** (the registry lock: `api/registry-lock.json`, tombstones, boot
AND `-validate` enforcement, `-validate -update-lock`; auto-id then comes from
the lock, closing L3, and the L4 lowering warning becomes a loader refusal).
