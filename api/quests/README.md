# Quests

Authored quest definitions, one file per quest (`plan-quests.md`, chunk C1).
No content is authored yet — the first quests ship with chunk C4. This README
keeps the directory present (both loaders and the Go embed require it); the
loader skips non-`.json` files.

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
