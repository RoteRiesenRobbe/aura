# Quests

Authored quest definitions, one file per quest (`plan-quests.md`). The first
four shipped with chunk C4 (2026-07-30): `village-welcome` (talk_to),
`turnip-chore` (harvest), `wolves-on-the-road` (kill, and the two-NPC branch),
`the-lost-lamp` (simplified to a two-conversant errand by conversation-journal
Q4/R3 the same day — and load-bearing since then: its turn-in row is the only
source of the Lantern aura). The loader skips non-`.json` files, which is what
lets this README live here.

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
counted from stage entry, with a single `next`) and dialogue stages (advanced
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
      "tracker": "{n}/{m} wolves slain",
      "objectives": [{ "kind": "kill", "species": "Wolf", "count": 8 }],
      "next": "report"
    },
    {
      "id": "report",
      "journal": "The deed stands. Someone should hear of it.",
      "tracker": "Return to whoever asked"
    }
  ]
}
```

Thresholds count **since stage entry** (N4/D4, `plan-feel-pass-2.md`,
reversing D3's lifetime reading): `"count": 8` means "kill 8 more after this
stage starts", and a `talk_to` target already spoken to needs a fresh talk.
The counters underneath stay lifetime — entering an objective stage snapshots
them as a baseline (`quests/ledger.go`), so abandoning and re-accepting starts
the objectives over. A `repeatable` flag exists but nothing may author it yet
(D6).

`tracker` (conversation-journal Q2) overrides the server-derived journal
objective line; `{n}/{m}` substitutes the stage's first countable objective and
is rejected on stages with nothing to count. A non-terminal **dialogue** stage
has no derivable line at all, so authoring a tracker on it is what keeps the
journal from going silent between the deed and the turn-in.
