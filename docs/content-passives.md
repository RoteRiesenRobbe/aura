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
| Torch | idea | Permanent light around the caster. | Resolves the light-vs-damage trade-off; zone 2+ reward, deliberately *after* the tunnel tutorial forced the trade-off once. |
