# Quests

Authored quest definitions, one file per quest (`plan-quests.md`). The first
four shipped with chunk C4 (2026-07-30): `village-welcome` (talk_to),
`turnip-chore` (harvest), `wolves-on-the-road` (kill, and the two-NPC branch),
`the-lost-lamp` (a three-conversant chain). The loader skips non-`.json` files,
which is what lets this README live here.

⚑ **This directory is shipped content — keep scratch files out of it.** Every
`.json` here is loaded, and the mob loader next door registers every file in its
directory *regardless of extension*, so a `farmer.json.bak` once tripped the
duplicate-id boot guard. The C3 harness's probe quest therefore lives in
`.claude/skills/verify/` and is copied in and deleted around a run.

**Who offers a quest is authored elsewhere** — in the conversants'
`interaction` blocks (`api/mobs/*.json`), which reference the quest by id. See
`docs/manual-content-authoring.md` § 6 for the row shapes and the two node-order
traps, and `docs/content-npcs.md` § Quest roles for the current wiring.

A quest is a stage graph: objective stages (`kill` / `harvest` / `talk_to`
against lifetime counters, with a single `next`) and dialogue stages (advanced
only by conversation rows authored in the NPCs' `interaction` blocks — the
quest file never knows who offers or advances it). A stage with no outgoing
edge is terminal; entering it completes the quest. Species and NPCs are
authored by definition **name** (like zone spawns) and resolved to their mob id
at boot.

```json
{
  "_comment": "authoring notes",
  "id": "wolf-cull",
  "title": "The Wolf Cull",
  "stages": [
    {
      "id": "cull",
      "journal": "Diary prose appended when this stage is entered.",
      "objectives": [{ "kind": "kill", "species": "Wolf", "count": 8 }],
      "next": "report"
    },
    { "id": "report", "journal": "The deed stands. Someone should hear of it." }
  ]
}
```

Thresholds are **lifetime totals** (retroactive credit, D3/L7): `"count": 8`
means "has ever killed 8", not "kills 8 more". A `repeatable` flag exists but
nothing may author it yet (D6).
