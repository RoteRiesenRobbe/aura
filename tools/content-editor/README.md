# Content editor

A local, standalone tool for hand-authored **mobs** (full stat fields:
`tier`/`factors`/`body`/`skills`/`unlocks`/`faction`/`entityType`/…),
**NPC dialogue trees** (the same mob file's `interaction` block — an NPC is
not a separate schema, just a mob that carries one), **quest stage graphs**
(`api/quests/*.json`), **factions** (`api/factions/*.json`), **recipes**
(`api/recipes/*.json`), **player skills** (`api/skills/*.json`, the spell
builder) and the **milestone-unlock table**
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

## The Skills tab (the spell builder)

The **Skills** sidebar tab edits every player skill (`api/skills/*.json`; the
mob-embedded ones under `mobs/` are hidden, D2): identity, the category block,
one card per effect with its shared and payload fields and a per-level preview
(`base + (level-1) × perLevel`, seconds beside every tick value), a Visuals
placeholder, and an "obtained via" panel listing every milestone, kill drop,
NPC teaching row, ascension reward and recipe that grants it, each a jump into
its own tab. The form is rendered from the served vocabulary below, never from
a hand-typed field list, so a new effect key in Go reaches it with no editor
work.

What C3 added on top of C1's read-only form:

- **Editing in place.** Keys are assigned and deleted on the object that came
  off disk, never on a rebuilt one, so `_comment` and every key the form does
  not render (`hitStyle`, `legacy`, `forwardUnits`, `armTicks`) round-trip
  untouched.
- **Blank deletes the key, a typed `0` writes 0.** Absent and 0 are different
  values to the loader (an absent `tickInterval` means every tick; an authored
  0 is refused), and that is the rule for every control in the form, numbers,
  bools, selects and multi-pickers alike. An unchecked box removes the key
  rather than writing `false`, which is what an absent Go `bool` already means.
- **Effect cards**: add (the new card opens on the category's default type,
  `EFFECT_TYPE_DEFAULTS` in `skill-presentation.mjs`), remove (with a confirm
  when the card authors anything beyond its type), reorder, and change type.
  A type change lists the keys the new type does not accept, hidden ones
  included, and deletes exactly those on OK; keys the new type also accepts
  stay where they are.
- **The `_comment` is editable** (PO ruling 2026-09-11). It is an authoring
  note, not a session ledger: what the skill is, which values are placeholder,
  at most one landmine sentence with a doc pointer, under ~400 characters, and
  never placement claims. The rule is in `docs/manual-content-authoring.md`,
  "The `_comment` field", and abridged under the box.
- **`id` stays read-only.** It is persisted in every character's spellbook row
  (`game.character_spellbook.skill_id`); C5 turns the tool's restraint into a
  loader lock.
- **Parked types open read-only, whole.** A skill authoring `ThrowBomb` or
  `ThrowMine` (effect type `projectile`) shows every control disabled and no
  Save button, with the banner saying why.
- **Live checks are HINTS, never a gate.** The list under the header names
  missing required fields, an unknown category or effect type, and an empty
  `targetFactions` on a `calm`/`charm` skill. Save stays enabled with all of
  them showing: the loader is the validator (D9), and a second opinion that
  could block it is exactly the JS port the design forbids.

### What a skill save runs through

`POST /api/save/skill` (`save-skill.mjs`) is deliberately **not** `saveOne`:
a skill runs no JS port of the Go rules at all. In order:

1. **The path guard** - `api/skills/<slug>.json` only, one level, no `..`, and
   the file must already exist (the "+ New skill" flow is C4).
2. **The id guard** - `id` may not change; spellbook rows store it.
3. **The rename guard** - if `name` changed, the content is scanned for
   references to the OLD name (milestone rows, mob `unlocks[]` and `skills[]`,
   NPC `teach_skill` grants, ascension `rewards[]`, recipe results and
   ingredients) and the save is REFUSED, listing every one, rather than
   cascading. The refusal also names what the scan cannot see: the
   `SKILL <name>` cheat, the harness scripts and the sim-harness presets.
   ⚑ That scan is `skill-references.mjs`, shared with the tab's "obtained via"
   panel on purpose - a row the panel shows but the guard misses would be a
   rename that silently breaks content.
4. **The seam** - `aurad -validate` over a temp copy with the candidate
   written in (below).
5. **The write**, through the same `prettyJson` writer every other kind uses.

**The two failure shapes are different on the wire, and the client branches on
the HTTP status** (`docs/plan-content-editor.md` §B10 L12): a **200** with
`{ok: false, stage, errors}` is a refusal (a guard, or the loader rejecting the
content), while a **non-200** means the validator could not answer at all - no
binary, a stale one, a crash. Reading `ok` alone would render
`build aurad first` as a clean pass.

⚑ Lowering `maxLevel` asks for a confirm before the POST: persisted skill
levels may already exceed the new cap and nothing clamps them (the
reconciliation policy is `backlog.md` §61, unbuilt). C5 makes it a loader
refusal.

⚑ A save is **half-live**: the file is right, the running game is not. Restart
`aurad` to see it.

⚑ The writer reformats. `prettyJson` imposes its own whitespace style, so the
first save of a hand-wrapped file carries a whole-file reformat on top of the
real edit - the same deal the mob tab has always had (PO 2026-09-12: no
reformat pass, the writer owns the style). Deleting a key and re-adding it
(clearing `_comment` and retyping it, unchecking and rechecking a box) also
moves it to the end of the object, since that is what JSON key order does.

## The skill vocabulary and `npm run smoke`

The tool never hand-types the per-effect-type field lists a skill file may
author. `api/skill-vocabulary.json` is a **generated** file holding Go's own
tables (the per-type key allowlist, the 15 top-level keys, the categories, the
cost keys, the retired-key hints, the damage types, the per-type category
table), written only by
`UPDATE_SKILL_VOCABULARY=1 go test -count=1 ./pkg/aura/skills/` from
`backend/`. Regenerate it after any change to
`backend/pkg/aura/skills/definition.go`; until you do, the Go suite is red.
It is read together with `api/shared-constants.json`, which carries the
complementary half (effect types, selectors, gate keys, stat names) because
those also ride the wire and the client restates them. No list lives in both
files, and `vocabulary.mjs` merges the two into the `skillVocabulary` object
served on `/api/data`.

### Which effect types a category may author

An effect type is legal only on some skill categories, and that rule is Go's:
`effectCategories` (`backend/pkg/aura/skills/definition.go`) places every type,
`mapToSkillDefinition` refuses a file that breaks it, the fixture carries the
table as `effectCategories`, and the Skills tab's type picker offers only the
types the open skill's category may author. The rule existed before the table
did, but only inside three dispatch switches that silently drop what they do
not handle - which is how a `stat_multiplier` reached an active aura, loaded
clean and did nothing (PO 2026-09-12). A card whose current type is illegal
(change the category of a skill that already has effects and every card can be)
keeps its type selectable and shows the refusal in red, on the card and in the
header hint box; the loader answers for real on save.

```bash
npm run smoke        # or: node tools/content-editor/smoke.mjs
```

`smoke.mjs` is a standalone check (no server, no database) that walks every
`api/skills/**/*.json` and reports any effect key outside its type's
allowlist, any unknown top-level key, any disagreement between the two
fixtures, and any key the **Skills tab's presentation table**
(`skill-presentation.mjs`: control, unit, hint per key NAME) lacks or no
longer needs - so a new Go key gets a conscious entry rather than a guessed
one, and a renamed one cannot leave a stale row. It prints every finding and exits non-zero if there is at least one.
The top-level check earns its keep: skill JSON is parsed without
`DisallowUnknownFields`, so a typo'd top-level key is read by nothing and
fails in silence.

Its last three legs are the save path's: the seam over the real tree (which
needs a built `backend/aurad` and says `build aurad first: make -C backend
build` when there is none, rather than passing quietly), the seam's own unit
checks, and the skill save path's unit checks (`save-skill.test.mjs`: the
path / id / rename guards, a finding refusing the write, a clean candidate
written with its unrendered keys intact, a throwing seam propagating - every
case over a temp copy of `api/`, none over the repo).

## The save seam: `aurad -validate`

`aurad -validate -content <dir>` loads every registry the game loads, runs
every cross-validation, prints one finding per line to **stdout** and exits
**0** clean / **1** with findings. Anything else is the validator itself
failing. It returns before the store is opened, so it needs neither
`AURA_DB_URL` nor `AURA_JWT_KEY`, starts no server, and writes nothing (not
even the `conf.json` a normal boot creates when none exists). All the log
chatter goes to stderr, so stdout is findings plus one `N finding(s)` summary
line.

```bash
cd backend && ./aurad -validate -content ../api   # 0 clean, 1 findings
./aurad -validate                                 # the EMBEDDED copy, i.e. cp-defs state
```

`aurad-validate.mjs` is the editor's side of it. `validateCandidate({ file,
raw })` copies the nine content directories to a temp directory, writes the
candidate over its file there, runs the binary, and returns
`{ ok, findings }`. Called with no arguments it validates the tree as it sits
on disk. It is exposed as **`POST /api/validate/candidate`**
(`{file, raw} -> {ok, findings}`); a thrown error is a 500 with the message,
because a seam that could not answer must never read as a seam that passed.
⚑ A 500 carries the server's generic `{ok: false, errors: [...]}` shape, not
`findings`, so a caller must branch on the HTTP status: reading `ok` alone
turns `build aurad first` into an empty finding list.
A round trip over the full tree (222 files copied, then the loader run) measured **66-135 ms**.

The binary is found at `AURAD_BIN`, else `backend/aurad`, else
`backend/aurad.exe`.

> ⚑ **The seam is exactly as current as the last `make -C backend build`.**
> The loader lives in the binary, so a Go change that is compiled nowhere is a
> change the seam cannot see. `assertAuradFresh` therefore refuses when the
> binary is older than the newest non-test `.go` / `go.mod` / `go.sum` under
> `backend/` (a 2-8 ms stat sweep over ~600 files; `backend/pkg/api/` is skipped, since the seam
> always passes `-content`). It is an **mtime** comparison, so a fresh checkout
> or a clock jump - this host's wall clock is known to be non-monotonic - can
> call a current binary stale, which costs one rebuild. Building on demand was
> offered and declined (PO 2026-09-11). It also cannot see a change to
> `cmd/aurad/conf.default.json`, which is `go:embed`ed rather than compiled.

⚑ C3 wired the seam into `POST /api/save/skill` (above). The dry-run
`POST /api/validate/candidate` stays, and the four existing kinds (mob / quest
/ faction / recipe) still save through the JS ports in `validate.mjs` until
§B11 Q7 is ruled.

`go build && go test` (or booting `aurad -content ../api`) remains the
authoritative check. This tool's in-browser validation is a best-effort
front-runner for the common mistakes, not a replacement for it.
