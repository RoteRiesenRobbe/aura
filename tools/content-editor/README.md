# Content editor

A local, standalone tool for hand-authored **NPC dialogue trees**
(`api/mobs/*.json`'s `interaction` block) and **quest stage graphs**
(`api/quests/*.json`). No dependencies, no build step, no running `aurad`.

Design record: `docs/plan-content-editor.md` (D1: custom, not an adapted
external tool; scope; the invariants it enforces).

## Run

```bash
node tools/content-editor/server.mjs
# or: cd tools/content-editor && npm start
```

Then open <http://localhost:4610>. Set `PORT` to use a different port.

It reads `api/mobs/`, `api/quests/` and `api/skills/` straight off disk on
every request and writes edits straight back to the same files, preserving
`_comment` fields and unrelated keys (only the fields the UI edits are
touched). A save is refused — nothing is written — if it would violate a
structural rule (a dangling `next`, an unknown quest/skill/species
reference, the L3 conditional-node-ordering rule, an XP grant on a
non-terminal quest edge, and the rest of `validate.mjs`'s port of
`backend/pkg/aura/items/mobs/interaction.go` and
`backend/pkg/aura/quests/quests.go`).

## Scope (v1)

**In:** NPC `interaction.nodes[]` / `.ambient` / `.range` on the 19
`api/mobs/*.json` files that carry an `interaction` block, and quest
`stages[]`/`objectives[]`/`next` on `api/quests/*.json`, including a
read-only "referenced by" panel showing which NPCs' grants offer/advance
each quest stage.

**Deliberately out**, per the plan doc — the tool never touches these and
does not pretend to:

- Plain mob stat fields (`tier`/`factors`/`body`/`skills`/`unlocks`).
- Zone spawn placement (`api/zones/world.json`) — Tiled already owns this.
- New-EntityType/art wiring — stays the manual 5-file hand-sync
  (`.claude/skills/add-content/SKILL.md`).
- Go registry census test count pins (`registry_test.go`,
  `interaction_content_test.go`, etc.) — bump these by hand after adding
  content; the editor cannot see them.
- Creating brand-new NPC/quest files from scratch (existing files only,
  for now — see the plan doc's open questions).

`go build && go test` (or booting `aurad -content ../api`) remains the
authoritative check. This tool's validation is a best-effort front-runner
for the common mistakes, not a replacement for it.
