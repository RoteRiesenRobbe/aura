# Content — Passives

Catalog of all passives: shipped, designed, and raw ideas in one table.
Conventions (status column, placement split) → `README.md` → Content.
In-game entries: authoritative definition is `api/skills/*.json`; all values
[PLACEHOLDER] until the balance pass.

> **Unlock sources and numbers live in `content-skill-inventory.md`**, which is
> generated from the data files. This catalog holds *design intent* only.

| Name | Status | Effect | Design notes |
|---|---|---|---|
| Hardy | in-game *(C2)* | +max HP (stat multiplier, composes with f(L)). | Barrier recipe ingredient. `api/skills/hardy.json`. |
| ThickHide | in-game *(C2)* | First authored `resist_passive`: ×0.85 physical, stronger per level. | Physical = the default tag, so it resists most of Z1 — deliberate. `api/skills/thick-hide.json`. |
| Tough | in-game | +damage reduction (stat multiplier). | Vocab smoke content; Barrier recipe ingredient. |
| Antivenom | in-game *(C3)* | `resist_passive` ×0.7 poison, stronger per level — the first drop pair authored against its own source: spiders deal the zone's only poison, spiders drop the counter. | The nest is the densest odds. `api/skills/antivenom.json`. |
| Torch | in-game *(C2)* | Permanent light from a **passive** slot (first light passive — C2 lift 2: entity light = max over active aura + passives, never sum). Deliberately dimmer than the Light aura (~60%, PO 2026-07-17): Light keeps the group-support role. | Resolves the light-vs-damage trade-off (GDD §7). `api/skills/torch.json`. |
| KeenEye | in-game | +crit chance (stat multiplier on `critChance`). | The character-driven half of **crit rework v2** (2026-07-20, `backlog.md` §23): crit became a character stat — base chance from conf + this passive — replacing per-skill authored crit pairs. Spread line-wide across the wolves 2026-07-21. `api/skills/keen-eye.json`. |
| FrostShield | in-game *(cc-and-retaliation C2, 2026-08-07)* | Every mob that damages you is slowed — 10 % at L1 rising to 30 % at L5, for 5 s. The **first passive with a runtime trigger** rather than an equip-time scalar fold; new `retaliate_slow` effect type. | Fires at `player.MobTouches`, the one site both mob→player damage paths reach (direct hits **and** mob DoT ticks), so "every mob that hits you" has no hole. A fully mitigated hit still retaliates — being swung at is the trigger, not the damage landing; a GOD player does not. Costs nothing: a passive has no trigger of its own to charge, and charging the victim for retaliating is nobody's mechanic. ⚑ Slows never stack (strongest wins), so a high-rank FrostShield masks a low-rank Slow aura — a build interaction, and the PO's rising curve keeps it at or under Slow's own fraction rank for rank. Troll drop at 0.2 — the elite that is itself CC-immune teaches you to slow everything else. `api/skills/frost-shield.json`. |
| Strong | in-game *(triage 2026-07-21)* | +all outgoing damage (stat multiplier on the new `damageDealt` stat — direct hits AND dots, applied at sys' damage base-composition sites). | The flat "just hit harder" pick; the CityGuard's reward for the "inform the city" quest thread (TownCrier sends you east). First consumer of the `damageDealt` stat. `api/skills/strong.json`. |
