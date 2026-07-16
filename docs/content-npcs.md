# Content — NPCs

Roster of friendly/teaching NPCs: identity, speech, what they teach or point
to. Conventions (status column, placement split) → `README.md` → Content.
Placement here is **design intent only** — runtime positions live in the
zone JSON authored via the zone editor. NPC substrate: `model/npc`
(unattackable, teach-on-approach — `plan-npc-teaching.md`); interaction depth
beyond that (branching dialogue) is the open fork in `backlog.md` §2.

| NPC | Status | Place (intent) | Teaches / role | Notes |
|---|---|---|---|---|
| Sage | in-game | Proving grounds (4,3) | Teaches HealAura @ L1 + Dash @ L5; has lore lines. | First shipped teaching NPC (step 5). Committed content — boot `-content ../api` to iterate. |
| Farmer | designed | Zone 1, farm by the turnip field | Teaches Turnip-Pull (the starting utility aura); gives the turnip-field task, then the wolf-pack task, then sends the player toward the City. | The peasant onboarding anchor (GDD §5) + first NPC-teaching/harvest-mob loop (GDD §8). |
| Tunnel guard | designed | Zone 1, tunnel mouth | Warns about the tunnel darkness; points to the light-aura clue anchor. | Soft-gate messenger for the light-role tutorial (GDD §7). |
| Troll-territory guide *(working title)* | idea | TBD (leads to troll territory) | Clue NPC — leads the player toward troll territory, where the Heal cooldown unlock waits. | Clue anchor chain (→ `content-world.md`). |
| Dog *(2026-07-16)* | idea | A dark forest, zone TBD | On approach says **"Woof"** and teaches the SummonCompanion cooldown. | Simple, self-contained teaching beat; the summoned companion reuses the dog SVG. Skill already in-game (→ `content-cooldowns.md`). |
