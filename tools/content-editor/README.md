# Content editor

A local, standalone tool for hand-authored **mobs** (full stat fields:
`tier`/`factors`/`body`/`skills`/`unlocks`/`faction`/`entityType`/…),
**NPC dialogue trees** (the same mob file's `interaction` block — an NPC is
not a separate schema, just a mob that carries one), **quest stage graphs**
(`api/quests/*.json`), **factions** (`api/factions/*.json`), **recipes**
(`api/recipes/*.json`), and the **milestone-unlock table**
(`api/milestones/milestone-unlocks.json`, one shared file). No dependencies,
no build step, no running `aurad`.

Design record: `docs/plan-content-editor.md` (D1: custom, not an adapted
external tool; the invariants it enforces). Stat-field, faction, recipe and
milestone editing were later additions beyond that doc's original v1 scope.

## Run

```bash
node tools/content-editor/server.mjs
# or: cd tools/content-editor && npm start
```

Then open <http://localhost:4610>. Set `PORT` to use a different port.

It reads `api/mobs/`, `api/quests/`, `api/skills/`, `api/factions/`,
`api/recipes/`, `api/milestones/` and the generated `EntityType` enum
straight off disk on every request and writes edits straight back to the
same files, preserving `_comment` fields and unrelated keys (only the
fields the UI edits are touched). A save is refused — nothing is written —
if it would violate a structural rule: a dangling `next`, an unknown quest/
skill/species/faction/entityType reference, the L3 conditional-node-ordering
rule, an XP grant on a non-terminal quest edge, the tier↔ccImmune coupling,
resistances-vs-gate-keys disambiguation, a faction's hostileTo
self-reference or its friendlyToPlayers/hostileTo("aligned") contradiction,
a recipe's non-unique id / unauthored result skill / an ingredient level
outside `[1, that skill's maxLevel]`, a milestone entry's unknown
`skillName`, and the rest of `validate.mjs`'s port of
`backend/pkg/aura/items/mobs/{definitions,interaction}.go`,
`backend/pkg/aura/quests/quests.go`, `backend/pkg/aura/factions/factions.go`,
`backend/pkg/aura/skills/recipe.go`, and
`backend/pkg/aura/skills/milestones.go`.

## Scope

**In:** every mob stat field on any `api/mobs/*.json` file (identity, tier/
role/faction/curveLevel/entityType, factors incl. resistances/gateKeys as
fixed-vocabulary pickers, body incl. collision layer/mask as bitmask
checkboxes, skills[], unlocks[]); NPC `interaction.nodes[]` / `.ambient` /
`.range` on any mob that carries one; quest `stages[]`/`objectives[]`/`next`
on `api/quests/*.json`, including a clickable "referenced by" panel showing
which NPCs' grants offer/advance each quest stage (click a reference to jump
straight to that dialogue node); faction `displayName`/`friendlyToPlayers`/
`hostileTo` on `api/factions/*.json`, hostileTo as checkboxes over every
other faction plus the two reserved built-ins (`aligned`, `hostile`);
recipe `id`/`result`/`ingredients[]` on `api/recipes/*.json`, result and
each ingredient's skill picked from the real skill catalog; the shared
`api/milestones/milestone-unlocks.json` level/skillName table, edited as one
flat list rather than a sidebar of separate files (it's a single JSON array,
not one-file-per-entry). The sidebar's NPCs/Quests/Mobs/Factions/Recipes
tabs each hold a "+ New" flow that prefills every mandatory field and
derives the filename from the name/title you type — snake_case for factions
(`wildlife_predator.json`, matching that directory's existing convention),
kebab-case for mobs/quests/recipes (a recipe's filename is just a
descriptive slug with no fixed relationship to its `result` field, e.g.
`barrier-home.json` results in `"Barrier"`). Mob creation reuses the
`entityType: "NpcPlaceholder"` missing-art marker from
`docs/manual-content-authoring.md` §1c, so a new NPC boots and plays
immediately with no art/EntityType wiring needed; a new plain (non-NPC) mob
instead seeds the Wolf-shaped archetype baseline (HP 55 / speed 0.7 / aggro
3.0 — CLAUDE.md's Archetype Rule reference unit) and leaves `entityType`
unset, so it fails validation loudly until you either point it at existing
art or walk the manual 5-file path. NPCs and Mobs are the SAME editor —
selecting a plain (non-dialogue) mob shows its stats plus a "+ Add dialogue
tree" button that promotes it into an NPC in place.

All five content kinds this tool edits — mobs (and by extension NPCs),
quests, factions, recipes, and milestones — are genuinely, fully
JSON-authorable: nothing here needs a Go/FlatBuffers change to become live,
mirroring `tools/tiled/`'s posture. The one asterisk is mobs: a brand-new
**visual species** (no existing sprite to reuse via `entityType` override)
still needs the manual art/EntityType 5-file path — which is exactly why new
NPCs default to the `NpcPlaceholder` marker instead of silently failing to
boot, and why a new plain mob's `entityType` is left unset rather than
guessed at.

**Deliberately out**, per the plan doc — the tool never edits these and
does not pretend to:

- Zone spawn placement (`api/zones/world.json`) — Tiled already owns this.
- New-EntityType/art wiring — stays the manual 5-file hand-sync
  (`.claude/skills/add-content/SKILL.md`); a brand-new NPC ships with the
  deliberate placeholder sprite until art is authored, and the entityType
  picker only offers enum values that already exist.
- Go registry census test count pins (`registry_test.go`,
  `interaction_content_test.go`, etc.) — bump these by hand after adding
  content; the editor cannot see them. Quests carry a stricter version of
  this: `backend/pkg/aura/quests/content_test.go`'s `TestContent_QuestCensus`
  pins every quest id/title *and* `TestContent_QuestXPBudget` pins each
  quest's total XP — both fail hard the moment a new quest is saved, until
  updated by hand. Factions have no such pin (only the `MaxFactions` cap,
  which this tool does enforce). Recipes have `recipe_test.go`'s
  `TestRecipes_C7Net` (`assert.Len(..., N)` plus per-recipe cascade
  assertions). Milestones have `milestones_test.go`'s
  `TestMilestoneUnlocksFromFS_PinnedTable`, which asserts the exact resolved
  `{skillName: level}` map — the strictest of the three, since it breaks on
  ANY edit to the file, not just an addition.

`go build && go test` (or booting `aurad -content ../api`) remains the
authoritative check. This tool's validation is a best-effort front-runner
for the common mistakes, not a replacement for it.
