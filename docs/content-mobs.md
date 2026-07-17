# Content — Mobs

Mob roster + the category taxonomy. Conventions (status column, placement
split) → `README.md` → Content. In-game entries: authoritative definition is
`api/mobs/*.json`. The full roster is content-pass work (step 6, roadmap
item 12) — the current legacy Berryhunter mobs get replaced there.

## Category taxonomy

Loose grouping for the eventual full roster (from the 2026-07-09 capture,
`mobs.jpg`; all undecided):

- **Tiere (animals)** — wolves, boars, … (zone 1 tier)
- **Small Fantasy** — kobolds, … (zone 1–2 tier)
- **Humanoid** — bandits, guards, mercenaries, … (faction logic → `content-lore.md`)
- **Fantasy**
- **Evil**
- **Corrupted Fantasy**
- **Elementals**
- **Dragons** (endgame tier)

## Roster

| Mob | Status | Category / role | Notes |
|---|---|---|---|
| Turnips | in-game *(C1)* | Harvest-mob (chore) | Stationary (speed 0), passive, no skills; first authored `resistances` — the `{"*": 0, "turnip": 1}` wildcard means only Turnip-Pull damages them. XP only, **no drops** (resolved conflict — `archive-content-zone1-capture.md`). Zone 1 onboarding chore-mob; field spawns in `api/zones/world.json`, def `api/mobs/turnip.json`. |
| Wolves | designed | Animal / normal | Zone 1's first real combat mobs; come as a **pack** — the first 1-vs-N fight (pack sizing = sim-harness question, GDD §5). |
| Elite wolf | designed | Animal / elite | Pack leader; candidate **kill-unlock** source. |
| Kobolds | idea | Small Fantasy / pest | Field pests near the zone-1 farm; **no loot**. |
| Elite kobold | idea | Small Fantasy / elite | — |
| Wild boars | idea | Animal / normal | Zone-1 flow role still open; good local-patrol/wander archetype demo. |
| Trolls | idea | Fantasy | "Well versed in heal magic" — enable the Heal cooldown unlock (troll territory). |
| Necromancer | idea | Evil / caster | Caster-mob archetype (2026-07-09 seed). |
| Guardian golem | idea | Fantasy / boss | Boss before the mountain range (2026-07-09 seed). |

## Current in-game mobs (pre-content-pass)

Legacy Berryhunter roster (dodo, rabbit, mammoth, saber-tooth cat,
angry mammoth) — placeholder combat content, replaced in step 6. System/
harness entities in `api/mobs/` (companion, totem, healer, brazier,
proving-* set) belong to their systems' plan docs, not this roster.
