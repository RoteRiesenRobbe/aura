# Content — Active Auras

Catalog of all active auras: shipped, designed, and raw ideas in one table.
Conventions (status column, placement split) → `README.md` → Content.
In-game entries: the authoritative definition is `api/skills/*.json`; values
there are [PLACEHOLDER] until the balance pass — as is every number here.

| Name | Status | Effect | Unlock source / notes |
|---|---|---|---|
| DamageAura | in-game | Damages the nearest enemy in range. | Milestone @ L1 (peasant onboarding, GDD §5 — dev builds still spawn with it until the content pass flips the default). |
| HealAura | in-game | Heals other players in range — **never the caster** (GDD §3). | Taught by the Sage (→ `content-npcs.md`). |
| WildAura | in-game | Damage-aura variant: wider ring, lower dps than DamageAura. | First monster-kill unlock payload (Phase 6.2). |
| Light | in-game | Creates light in dark areas; rendering-only (radius punches a hole in the client darkness overlay). Occupies the one active-aura slot → the light-vs-damage trade-off. | Early game, zone 1 → 2 tunnel tutorial (GDD §7). Clue anchor pointed to by the tunnel guard. |
| FireWard | in-game | Grants allies in range and the caster a fire-damage resist multiplier. | First resist aura (item 11 Phase 2). |
| ImmolationAura | in-game | Leaves a fire dot on the nearest enemy. | Effect-foundations smoke content. |
| Rejuvenation | in-game | Heal-over-time aura; the HoT lingers on allies after they leave range. | Skill-vocab smoke content. |
| SlowAura | in-game | Slows enemies in range. | Skill-vocab smoke content. |
| PaladinAura | in-game | Damages nearest enemy AND heals lowest-HP ally, each on its own cadence, at 70% of the base auras' values. | Combination result — recipe in `content-recipes.md`. |
| ReaperAura | in-game | Exercises execute + berserker + crit + lifesteal together. | Vocab smoke content, cheat-granted only; throwaway until the content pass authors real build skills. |
| Turnip-Pull | designed | Damages exclusively turnip mobs; no effect on anything else (tag-gated). | The starting utility aura — taught by the Farmer, peasant onboarding (GDD §5). Harvest-mob example (GDD §8). |
| Fire Strike | idea | Fire damage to the lowest_health target (percentage) in range. | Pyromancer combo component; example of the lowest_health selector. |
| Long Range Execute *(working title)* | idea | Very large radius, very slow tick, high damage to the proportionally lowest target. **Hard single-target cap** regardless of level. | Example of a per-aura selector + fixed cap. |
| Fly, You Fools! | idea | Increases move speed of all allies in radius; the caster is not buffed / stays behind. | LotR ref; risk/reward for support. |
| Purple Rain | idea | Colors everyone in range purple. No combat use. | Pure flavor/meme; calibration reference for side-grade variants (GDD §-ref: unique, desirable, zero meta pressure). |
