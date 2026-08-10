# Ascension rewards

The curated catalog a bloodline picks ONE entry from when a max-level character
is ascended (`docs/plan-ascension.md`). One `.json` file per entry; the
directory is loaded and fully validated at boot, like every other content
registry.

It is deliberately empty until chunk C3 authors the seed catalog (~5–10
entries). An empty catalog is a legal world: D14 makes "this bloodline has
learned everything it can teach" an ordinary end state, and ascension still runs
with nothing left to pick.

## Shape

```json
{
  "unlockKey": "FrostShield",
  "conditions": [
    { "kind": "minLevel", "value": 30 }
  ]
}
```

- **`unlockKey`** (required) is the skill's unique CamelCase `name`, exactly as
  `api/milestones/milestone-unlocks.json` references skills, and it is the exact
  string stored in `game.bloodline_unlocks` (D17). An unknown name is a boot
  error, and so are two entries naming the same skill.
- **`conditions`** (optional) is the entry's gate (D18): a list of conditions in
  the SAME authored vocabulary as an NPC dialogue node's, ANDed, unknown kind
  refused at boot. Absent or empty means anyone may pick it.

A gated entry is **not hidden** - it renders locked, with the gate named and the
player's progress toward it. The recipes stay secret; the gates do not.

## What must never be authored here

- **Prices, points, rarity or scores.** D13 cut the point economy; an unknown
  key hard-fails at boot rather than sitting in the file looking honoured.
- **A reward that outclasses world content.** D1 (world-parity): every entry
  must sit at a power level the world can also hand out. A gate buys *access*,
  never a higher power level.
