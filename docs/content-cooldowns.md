# Content — Cooldowns

Catalog of all cooldown abilities: shipped, designed, and raw ideas in one
table. Conventions (status column, placement split) → `README.md` → Content.
In-game entries: authoritative definition is `api/skills/*.json`; all values
[PLACEHOLDER] until the balance pass.

> **Unlock sources and numbers live in `content-skill-inventory.md`**, which is
> generated from the data files. This catalog holds *design intent* only.

| Name | Status | Effect | Design notes |
|---|---|---|---|
| Dash | in-game | Short forward burst of movement. | Multi-source is safe/idempotent — it has both a teacher and a drop. |
| FirstAid *(né Heal, renamed step-7 A.6)* | in-game | Restores the caster's own resource (capped-partial per the §3 recovery boundary). | **The only path to instant self-healing** — heal auras never heal the caster. The rename resolved the collision with the Heal *aura* (PO 2026-07-21). Left the milestone table 2026-07-21 — the village Hermit teaches it earlier than the milestone would have granted it. |
| Recover | in-game | Heals the caster over ~18 s. | = the "personal recovery cooldown" (GDD §3): the solo sit-and-eat substitute, out-of-combat-flavored. **Self-only** (PO, C8 Session ④). |
| SummonCompanion | in-game | Summons an owned, player-aligned companion beside the caster; follows the owner, fights per the §3.6 assist rules, despawns on TTL. | Mob-depth chunk 6. Taught in-world since C2 Part 2; the companion uses the existing dog SVG. Open questions on XP credit / caps: `backlog.md` §5. |
| SummonTotem | in-game | Summons an owned, player-aligned totem offset from the caster; skill level scales TTL + loadout. | Mob-depth chunk 1. |
| FireTotem | in-game *(2026-07-21)* | Plants a stationary totem that burns **every** enemy around it with a fire dot. | The greater fire elemental's payload. Mechanically the SummonTotem pattern (spawn effect, skill level scales TTL + the totem's loadout level, owner level adds HP/power, cooldown ≥ max TTL = one totem at a time), but the aura hits **all** enemies rather than the nearest: SummonTotem is a single-target poke, FireTotem is **area denial**. `api/skills/fire-totem.json`. |
| Taunt | in-game | Forces every enemy mob in range to the top of its threat table — pulls aggro onto the caster. | Tank role tool (mob-depth chunk 7). Its in-world source beats the group gate that teaches it — beating the drum pays every participant (→ `content-mobs.md`). |
| DamageBurst | in-game *(C4)* | Instant damage to everyone hostile in range, tagged **physical + bleed** — the first multi-tag instant hit. | New skill id 49 (NovaBurst pattern; NovaBurst itself stays a proving-grounds relic in shape — PO 2026-07-18). `api/skills/damage-burst.json`. |
| Fade | in-game | Removes the caster's own threat entry on every enemy mob in range — sheds aggro to the next-highest holder. | Group utility, no-op solo (mob-depth chunk 7). |
| Barrier | in-game | Grants an absorb pool to the caster and nearby allies for ~10 s. | Vocab smoke content — **since C7 a combination result** (Hardy + Tough maxed; was cheat-only, closes the §11 "Barrier home" item) → `content-recipes.md`. |
| Shockwave | in-game *(C7)* | §A ceiling trio, **best cooldown**: instant physical+bleed hit at ~2× DamageBurst damage, wider ring, shorter cooldown. | Combination result — `content-recipes.md` (secret in-game). `api/skills/shockwave.json`. |
| CallForAid *(the Boss-Aura, §B)* | in-game *(C6)* | THREE `spawn` effects in one cast — the full squad of 3 SoldierCompanions rises at once (fireCooldown applies every effect; multi-spawn needed zero code). SummonCompanion conventions: skill level scales TTL + summon loadout, owner level adds HP/power; cooldown ≥ max TTL keeps it one-squad-at-a-time by convention. | Below the Vanguard ceiling; C7 combo ingredient (≥3 recipes). The world-boss payload — all participants + recent healers get it (roadmap item 10 machinery). `api/skills/call-for-aid.json`. |
| HoldTheLine | in-game *(C7)* | Tank-support squad: one cast raises 3 ShieldbearerCompanions (RallyDrum allies-only shields) AND detaunts the owner (Fade pattern) — enemies prefer the wall. CallForAid conventions (3 spawn effects, cooldown ≥ max TTL). | Combination result — `content-recipes.md`. `api/skills/hold-the-line.json`. |
| FieldMedics | in-game *(C7)* | Support squad: 2 SoldierCompanions + a MedicCompanion (heal aura — heals squad and owner). CallForAid conventions. | Combination result — `content-recipes.md`. `api/skills/field-medics.json`. |
| Haste | in-game | Temporarily increases the caster's aura tick rate. | Vocab smoke content. **The only milestone unlock left** since 2026-07-21. |
| Ignite | in-game | Applies a short fire dot to everyone hostile in range. | Effect-foundations smoke content; the fire line's entry rung and a Wildfire ingredient. |
| NovaBurst | in-game | Instant fire damage to everyone hostile in range, plus a short fire dot. | Vocab smoke content; kept as the wide-but-weak counterpart to DamageBurst. |
| Recall | in-game | Channeled teleport to the last safe place; cast interrupted by damage. | Consumer of `backlog.md` §9 (recall) + the step-3 campfire tracker. |
| Revive | in-game | Channeled: revives the nearest downed player at their corpse with 30% HP; interrupted by damage. | Rare, high-level (GDD §3) — one of the most valuable social abilities. The GDD sketch listed it as an aura; shipped as a channeled cooldown. |
| Fire Shield | idea | For 30 s, reflects 20% of incoming damage. | Pyromancer combo component. Distinct from FireWard (resist aura). |
