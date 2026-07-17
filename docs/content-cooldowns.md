# Content — Cooldowns

Catalog of all cooldown abilities: shipped, designed, and raw ideas in one
table. Conventions (status column, placement split) → `README.md` → Content.
In-game entries: authoritative definition is `api/skills/*.json`; all values
[PLACEHOLDER] until the balance pass.

| Name | Status | Effect | Unlock source / notes |
|---|---|---|---|
| Dash | in-game | Short forward burst of movement. | Taught by the Sage @ L5 (→ `content-npcs.md`); **Boar kill-drop @0.1 since C2** (multi-source is safe/idempotent). |
| Heal | in-game | Restores the caster's own resource (capped-partial per the §3 recovery boundary). | **The only path to instant self-healing** — heal auras never heal the caster. Intended reward from the troll territory clue anchor (→ `content-world.md`); = "Heal Magic cooldown" in older docs. |
| Recover | in-game | Heals the caster over ~18 s AND gifts the same HoT to nearby allies. | = the "personal recovery cooldown" (GDD §3): the solo sit-and-eat substitute, out-of-combat-flavored. |
| SummonCompanion | in-game | Summons an owned, player-aligned companion beside the caster; follows the owner, fights per the §3.6 assist rules, despawns on TTL. | Mob-depth chunk 6. **Taught in-world since C2 Part 2: the Dog NPC in the Z1 forest clearing (→ `content-npcs.md`); the companion uses the existing dog SVG.** Open questions on XP credit / caps: `backlog.md` §5. |
| SummonTotem | in-game | Summons an owned, player-aligned totem offset from the caster; skill level scales TTL + loadout. | Mob-depth chunk 1. |
| Taunt | in-game | Forces every enemy mob in range to the top of its threat table — pulls aggro onto the caster. | Tank role tool (mob-depth chunk 7). |
| Fade | in-game | Removes the caster's own threat entry on every enemy mob in range — sheds aggro to the next-highest holder. | Group utility, no-op solo (mob-depth chunk 7). |
| Barrier | in-game | Grants an absorb pool to the caster and nearby allies for ~10 s. | Vocab smoke content. |
| Haste | in-game | Temporarily increases the caster's aura tick rate. | Vocab smoke content. |
| Ignite | in-game | Applies a short fire dot to everyone hostile in range. | Effect-foundations smoke content. |
| NovaBurst | in-game | Instant damage to everyone hostile in range. | Vocab smoke content. |
| Recall | in-game | Channeled teleport to the last safe place; cast interrupted by damage. | Consumer of `backlog.md` §9 (recall). |
| Revive | in-game | Channeled: revives the nearest downed player at their corpse with 30% HP; interrupted by damage. | Rare, high-level (GDD §3) — one of the most valuable social abilities. The GDD sketch listed it as an aura; shipped as a channeled cooldown. |
| Fire Shield | idea | For 30 s, reflects 20% of incoming damage. | Pyromancer combo component. Distinct from FireWard (resist aura). |
