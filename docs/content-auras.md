# Content — Active Auras

Catalog of all active auras: shipped, designed, and raw ideas in one table.
Conventions (status column, placement split) → `README.md` → Content.
In-game entries: the authoritative definition is `api/skills/*.json`; values
there are [PLACEHOLDER] until the balance pass — as is every number here.

> **Unlock sources and numbers live in `content-skill-inventory.md`**, which is
> generated from the data files. This catalog holds *design intent* only — what
> an aura means, why it exists, how it relates to its neighbours. Don't repeat
> drop chances, teacher gates or damage values here; they drift.

| Name | Status | Effect | Design notes |
|---|---|---|---|
| Damage | in-game | Damages the nearest enemy in range. The baseline every other damage aura is calibrated against. | The village onboarding ability (peasant onboarding, GDD §5 as amended in step 6 C1 — the spawn default flipped to Harvest, and Damage left the milestone table). |
| Heal | in-game | Heals other players in range — **never the caster** (GDD §3). Carries a self-cost, so healing is a real trade. | The support baseline; the self-cost curve is a settled balance lock. |
| Wild | in-game | Damage-aura variant: wider ring, lower dps than Damage. | First monster-kill unlock payload (Phase 6.2). **Open tuning note (2026-07-21): reads as a trap pick** — ~72% of baseline DPS but barely outranges Damage, so the DPS loss buys no safety. |
| Lantern *(né Light, renamed in playtest-1 Pass B `75486ec9`)* | in-game | Creates light in dark areas; rendering-only (radius punches a hole in the client darkness overlay). Occupies the one active-aura slot → the light-vs-damage trade-off (since C2 Part 2 the dimmer **Torch passive** resolves it — entity light = max over active aura + passives; Lantern keeps the bigger group-support radius). | Early game, zone 1 → 2 tunnel tutorial (GDD §7). |
| FireWard | in-game | Grants allies in range and the caster a fire-damage resist multiplier. | First resist aura (item 11 Phase 2). **The one player skill with no world unlock source** — known gap inherited from roadmap item 12. |
| Immolate | in-game | Leaves a fire dot on the nearest enemy. | Effect-foundations smoke content; now the fire line's mid-tier and a Wildfire ingredient. |
| Rejuvenation | in-game | Heal-over-time aura; the HoT lingers on allies after they leave range, and **applies to unhurt allies too** — pre-hotting before a pull works. | Skill-vocab smoke content; the boss-rare drop pattern's payload. Pre-hot since 2026-07-31 (backlog §33): unlike `Heal`, a HoT aura is not wounded-only, and it keeps refreshing in range instead of decaying once it heals its target to full. |
| Slow | in-game | Slows enemies in range. | Skill-vocab smoke content; Suppression ingredient. |
| Paladin | in-game | Damages nearest enemy AND heals lowest-HP ally, each on its own cadence, at 70% of the base auras' values. | Combination result — recipe in `content-recipes.md`. The ~70% calibration reference for hybrid combos. |
| Reaper | in-game | Exercises execute + berserker + lifesteal together. | Vocab smoke content originally; now the apex wolf drop. **Open tuning note (2026-07-21): caps at maxLevel 3**, so its max DPS ≈ LongRangeStrike's despite four more curve levels — raise to 5 if the apex drop should feel apex. |
| Berserker | in-game *(C2)* | Damage-family side-grade: hits harder the LOWER the caster's own HP (berserker modifier, up to ×2). | `api/skills/berserker.json`. |
| LongRangeStrike | in-game *(C2)* | Much larger ring, lower dps, hard cap 1 target — the positioning side-grade (Wild precedent). | Outranges every wolf bite, so the DPS loss buys real safety — the shape Wild was meant to have. `api/skills/long-range-strike.json`. |
| Pickaxe | in-game *(C3)* | Second gated harvest-style aura: `gatedDamageTags` + unique `smash` tag — only targets whose resistances name `smash` (the tunnel Rockfall) take damage; Harvest and Pickaxe deliberately do NOT overlap (plants vs rocks). | Rockfall gate = own tag on a Miner NPC (PO 2026-07-17). Opens the venom-spider-nest side passage. `api/skills/pickaxe.json`. |
| Harvest *(né Turnip-Pull, renamed C2 Part 2)* | in-game *(C1)* | Damages exclusively opted-in targets (`gatedDamageTags` + unique `harvest` tag): only mobs whose resistances explicitly name `harvest` take damage — combat mobs are immune with zero authoring. General plant-interaction: more opt-in flora later. | The peasant-onboarding ability (GDD §5), taught rather than granted; **equipped but NOT active** on pickup (PO 2026-07-17: switching it on is the player's first act). Lifelong utility: also the bramble-wall opener (C2). `api/skills/harvest.json`. |
| Vanguard *(the Front-Aura, §A)* | in-game *(C5)* | **The one sanctioned power outlier** (GDD §4/§5 as amended): multi-effect — full Damage damage at 2 targets + full Heal healing with NO self-cost (lowest_health ally) + a modest shield on allies AND self (toned down from RallyDrum-class — PO in-game pass 2026-07-18, the reapplying overshield was too strong). Deliberately inverts the Paladin ~70% calibration; sets the power ceiling with its C7 combos (× Damage / Heal / Burst → best-in-slot trio). | The journey's final step in v1 (PO 2026-07-18) — taught at the Z2 front staging area, TooLowLine-gated. `api/skills/vanguard.json`. |
| Spearhead | in-game *(C7)* | §A ceiling trio, **best damage aura**: ~115% Damage per hit at 3 targets, wider ring; pure damage (specialist shape — drops Vanguard's heal+shield). | Combination result — recipe in `content-recipes.md` (secret in-game). `api/skills/spearhead.json`. |
| Lifewarden | in-game *(C7)* | §A ceiling trio, **best heal aura**: bigger heal than Heal AND Vanguard's heal, 2 lowest-health targets, zero self-cost, wider ring. Heal-style ring client-side. | Combination result — recipe in `content-recipes.md`. `api/skills/lifewarden.json`. |
| Warbanner | in-game *(C7)* | **The capstone** (top of the §A power ceiling): every Vanguard component ~110% (damage 2 targets / heal no-cost / shield allies+self) PLUS an enemy slow — the best generalist; each component stays below the matching specialist. Dual ring client-side. | Combination result, the v1 completion combo, tiered behind Spearhead per backlog §21 — `content-recipes.md`. Lore echo of the Warlord's WarbannerTotems. `api/skills/warbanner.json`. |
| Wildfire | in-game *(C7)* | The "ultimate fire fantasy" — reworked 2026-07-21 off the ~70% calibration into a strict Immolate upgrade: full-strength burn on 2 targets, bigger radius, one extra tick, caster-only fire resist. | Combination result — `content-recipes.md`. `api/skills/wildfire.json`. |
| Suppression | in-game *(C7)* | Kiter gap fill @ ~70% side-grade: LRS-range damage aura AND a slow at the same long radius, each ~70% of its parent. | Combination result — `content-recipes.md`. `api/skills/suppression.json`. |
| Fire Strike | idea | Fire damage to the lowest_health target (percentage) in range. | Pyromancer combo component; example of the lowest_health selector. |
| Long Range Execute *(working title)* | idea | Very large radius, very slow tick, high damage to the proportionally lowest target. **Hard single-target cap** regardless of level. | Example of a per-aura selector + fixed cap. |
| Fly, You Fools! | idea | Increases move speed of all allies in radius; the caster is not buffed / stays behind. | LotR ref; risk/reward for support. |
| Purple Rain | idea | Colors everyone in range purple. No combat use. | Pure flavor/meme; calibration reference for side-grade variants (GDD §-ref: unique, desirable, zero meta pressure). |

> **Call for Aid** moved to `content-cooldowns.md` — it is a cooldown, not an
> active aura (it was catalogued here while §B was being designed).
