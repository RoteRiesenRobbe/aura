# Content — Combination Recipes

Catalog of aura/passive/cooldown combination recipes. Conventions (status
column) → `README.md` → Content. Recipes are **curated, not algorithmic, and
never documented in-game** — the community discovers and shares them (GDD).
Recipes can cross categories; results can be ingredients of higher recipes.
In-game entries: authoritative definition is `api/recipes/*.json`.

C7 conventions (PO 2026-07-18): **every ingredient at max level** (the Paladin
convention, kept net-wide); the Vanguard combos are **specialist** results
(each the best in ONE dimension, per §A — not Vanguard supersets); the
capstone takes **base ingredients only** (no results-as-ingredients yet).

| Result | Status | Recipe | Notes |
|---|---|---|---|
| Paladin | in-game | Damage(5) + Heal(5) | Shipped (Phase 9). Does both at 70% of the base auras' values — weaker than each alone: the standard side-grade calibration. |
| Spearhead | in-game *(C7)* | Vanguard(5) + Damage(5) | §A ceiling trio: the **best damage aura** — ~115% Damage per hit at 3 targets; drops Vanguard's heal+shield (specialist shape). |
| Lifewarden | in-game *(C7)* | Vanguard(5) + Heal(5) | §A ceiling trio: the **best heal aura** — bigger heal than both parents, 2 targets, zero self-cost, wider ring. |
| Shockwave | in-game *(C7)* | Vanguard(5) + DamageBurst(3) | §A ceiling trio: the **best cooldown** — ~2× DamageBurst damage, wider, faster; keeps physical+bleed. |
| Warbanner | in-game *(C7, re-tiered Session ③)* | Vanguard(5) + Spearhead(5) + CallForAid(3) | **The capstone** (PO: yes to Vanguard×CallForAid; aura shape): every Vanguard component ~110% + an enemy slow — best generalist, top of the power ceiling; each component stays below the matching specialist. **Tiered behind a maxed Spearhead** (backlog §21, PO 2026-07-19) so the two ceiling combos can never co-pop — first recipe with a combo result as ingredient. Lore echo of the Warlord's totems. |
| HoldTheLine | in-game *(C7)* | CallForAid(3) + Taunt(3) | Tank-support squad: 3 ShieldbearerCompanions (RallyDrum shields) + a detaunt on the owner at cast — enemies prefer the wall. |
| FieldMedics | in-game *(C7)* | CallForAid(3) + Heal(5) | Support squad: 2 soldiers + a MedicCompanion (carries the mob-side HealerAura). PO pick: the **Heal aura** — not the FirstAid cooldown — as the medic partner. |
| Wildfire | in-game *(C7)* | Ignite(3) + Immolation(5) | Fire-identity gap fill @ ~70% side-grade: the burn spreads to 2 targets, each weaker than Immolation's. |
| Suppression | in-game *(C7)* | Slow(5) + LongRangeStrike(5) | Kiter-identity gap fill @ ~70% side-grade: LRS-range damage AND slow at the same long radius. |
| Barrier | in-game *(C7 home)* | Hardy(3) + Tough(3) | **Result is the pre-existing skill** (was cheat-only): the survivability passives pay out the group absorb cooldown. Closes the §11 "Barrier home" item; first recipe whose result isn't new content. Category picked as cooldown = the rarer category after the net (auras 20 / cooldowns 18). |
| Pyromancer aura | idea | Fire Strike(5) + Fire Shield(5) + Swift(5) | Cross-category example (aura + cooldown + passive). All three ingredients still idea/smoke-tier. |

## Coverage audit (C7, PO ruling: "fill obvious gaps only")

Which player skills participate in ≥1 recipe after the C7 net. Gaps are
**deliberate** post-v1 material, not oversights.

**In the net (ingredient or result):** Damage, Heal, Vanguard,
CallForAid, DamageBurst, Taunt, Ignite, Immolation, Slow,
LongRangeStrike, Hardy, Tough, Paladin, Barrier + the 8 C7
results.

**⚑ Ingredient placement gap — RESOLVED (C8 §11 placements, 2026-07-21).**
Ignite/Immolation (Emberkeeper), Slow (BanditRanged) and Tough (Troll) all
have world sources now, so **all 10 recipes are craftable in the world zone**.
Verified by the reachability sweep in `content-skill-inventory.md`.

**Deliberately outside (post-v1 candidates):**

- **Auras:** Wild, Light, Reaper (no longer a proving relic — the AlphaWolf
  apex drop since 2026-07-21), Rejuvenation,
  FireWard, Harvest + Pickaxe (chore/profession identity — combining them
  would blur the gate design), Berserker.
- **Passives:** Swift, ThickHide, Torch, Antivenom (Light+Torch was
  offered as a light-identity fill; PO passed — the light role's trade-off
  is load-bearing content, don't shortcut it yet).
- **Cooldowns:** NovaBurst, FirstAid, SummonTotem, SummonCompanion,
  Fade, Recall, Rejuvenation-family utilities (Recover, Revive), Dash,
  Haste.
