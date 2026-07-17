# Content — Passives

Catalog of all passives: shipped, designed, and raw ideas in one table.
Conventions (status column, placement split) → `README.md` → Content.
In-game entries: authoritative definition is `api/skills/*.json`; all values
[PLACEHOLDER] until the balance pass.

| Name | Status | Effect | Unlock source / notes |
|---|---|---|---|
| SwiftPassive | in-game | +move speed (stat multiplier). | Pyromancer combo component ("Swift" in the recipe sketch). **Wolf kill-drop @0.15 since C2.** |
| Hardy | in-game *(C2)* | +max HP (stat multiplier, composes with f(L)). | Boar kill-drop @0.15. `api/skills/hardy.json`. |
| ThickHide | in-game *(C2)* | First authored `resist_passive`: ×0.85 physical, stronger per level. | Bear kill-drop @0.15. Physical = the default tag, so it resists most of Z1 — deliberate. `api/skills/thick-hide.json`. |
| ToughPassive | in-game | +damage reduction (stat multiplier). | Vocab smoke content. |
| Torch | in-game *(C2)* | Permanent light from a **passive** slot (first light passive — C2 lift 2: entity light = max over active aura + passives, never sum). Deliberately dimmer than the Light aura (~60%, PO 2026-07-17): Light keeps the group-support role. | Hermit teaching (Z1 dark forest, deep NW pocket — plain, no level gate). Resolves the light-vs-damage trade-off (GDD §7). `api/skills/torch.json`. |
