# Combination System — Design Question Catalog

> **RESOLVED (2026-07-04).** All 16 questions were decided in the Phase 7.4
> design session; the resulting design lives in
> `plan-skill-system.md → Combination System`. This catalog is kept for the
> per-option rationale. Decisions in short:
>
> - **Q1** level-up AND discovery trigger the check · **Q2** simultaneous
>   (≥, current levels) · **Q3** spellbook levels only
> - **Q4** JSON shape as sketched, no extra metadata (hint field deferred to
>   roadmap item 9) · **Q5** one result per recipe; alternate paths allowed;
>   identical ingredient sets across recipes allowed (both fire) ·
>   **Q6** pure threshold
> - **Q7** result unlocks at level 1 · **Q8** unlock sources may overlap
>   (Discover is idempotent)
> - **Q9** standard spellbook glow for now · **Q10** zero in-game traces ·
>   **Q11** backend-only loading (repo visibility = later policy question)
> - **Q12** variants use the same mechanism · **Q13** cycles allowed, no
>   depth cap · **Q14** no missed windows (corollary) · **Q15** one point
>   economy · **Q16** hard startup failure on invalid recipes

Original intro: input for the Phase 9 design section, written during Phase 7.
Where a lean is noted, it was a suggestion to react to, not a default.

Already decided (do not re-open):

- Combo unlocks are **permanent** once triggered (free respec cannot revoke them).
- Recipes are **curated, secret, never documented in-game**; community discovers them.
- **Cross-category** ingredients are valid (aura + passive + cooldown).
- Results can themselves be **ingredients** of higher combos.
- The mechanism must support **arbitrary combinations from day one**; content is added manually.

---

## 1. Trigger semantics

**Q1 — When is the recipe check evaluated?**
- (a) On every skill level *increase* (spend). Unspending can never newly satisfy a recipe, so checking only on increase is sufficient.
- (b) Also on skill *discovery* — relevant if a recipe requires a skill at level 1, which discovery alone provides.
- (c) On any spellbook change, defensively.
- *Lean: (a)+(b) — they are the only events that can newly satisfy a recipe.*

**Q2 — Must all ingredient levels be met simultaneously?**
- **DECIDED (2026-07-03, pulled forward into Phase 7 because it shapes the
  leveling data model): (a) simultaneous.** All ingredients at required level
  at the same moment — with free respec, configuring your build into the
  recipe is the deliberate discovery act. The spellbook stores current levels
  only; no per-skill high-water history.

**Q3 — Do equip/active states matter, or only spellbook levels?**
- (a) Spellbook levels only (what the migration-plan text currently implies).
- (b) Ingredients must additionally be *equipped* (or even the aura *active*) — turns discovery into an in-world experiment ("run fire and speed together") instead of a menu operation. More flavorful, more code, needs careful UX.

## 2. Recipe data model

**Q4 — JSON shape.** Mirroring the skills registry, e.g.:

```json
{
  "id": 100,
  "result": "FrostfireAura",
  "ingredients": [
    { "skill": "DamageAura", "level": 3 },
    { "skill": "FrostPassive", "level": 2 }
  ]
}
```

Open: does a recipe need metadata beyond this (e.g. a hint-text field reserved
for world-exploration clue anchors, unlock source #3)?

**Q5 — Cardinality.** Can one recipe yield multiple results? Can multiple
recipes yield the *same* result (alternate paths)? Both have UI/permanence
implications and should be explicitly allowed or forbidden.

**Q6 — Threshold vs. cost.** Ingredient levels are presumably a pure
*threshold* (points stay where they are; nothing is consumed). Confirm — a
consume model would fight the free-respec decision.

## 3. Result skill properties

**Q7 — Unlock level of the result.** Level 1 like every other discovery
(consistent with the equip-at-stored-level model), or derived from ingredient
levels? *Lean: level 1 — consistency beats cleverness here.*

**Q8 — ID space.** Combo results are ordinary skills with ordinary IDs — can
they also appear in other unlock sources (mob drop, milestone)? If yes,
"permanent once triggered" and "dropped by mob X" must coexist cleanly in the
spellbook (they should, since discovery is idempotent — confirm).

## 4. Discovery & communication

**Q9 — Unlock feedback.** Same 3.7 unlock event + spellbook glow, or a
distinct (bigger) moment for combos — they are rarer and community-relevant?

**Q10 — Zero-hint policy.** Confirm there is *no* in-game trace of
undiscovered recipes — no "???" spellbook entries, no locked silhouettes, no
counter. (The vision says not documented in-game; make the absence explicit so
UI work doesn't accidentally leak it.)

**Q11 — Anti-datamining.** If recipes live in `api/skills/…` JSON, they ship
wherever the repo/frontend ships. Keep the recipe registry backend-only (server
loads them, client only ever learns results) — and consider whether recipe
files belong in a public repo at all. *Lean: backend-only loading is free;
repo visibility is a project-policy question for later.*

## 5. Variants & higher-order combos

**Q12 — Variant auras as ingredients.** Same recipe mechanism (variants are
just skills with own IDs), or a separate system? *Lean: same mechanism — the
spellbook is ID-based anyway.*

**Q13 — Chains and cycles.** Results-as-ingredients implies recipe chains.
Does the registry need cycle detection at startup (A requires B's result, B
requires A's)? Any practical depth cap for balancing/testing?

## 6. Respec corollaries

**Q14 — No missed windows.** With simultaneity (Q2a): a player can drop below
a threshold and re-approach later, any number of times, until the recipe
triggers once. Confirm there are no one-shot windows.

**Q15 — Points for the result.** The freshly unlocked combo skill starts
unleveled and competes for the same skill points as everything else — no
refund, no discount? *Lean: yes, keep one economy.*

## 7. Registry validation (engineering)

**Q16 — Startup validation.** Unknown skill names, requirement above the
ingredient's `maxLevel`, duplicate recipe IDs, cycles (Q13): hard startup
failure (like unknown mob skills) or warn-and-skip? *Lean: hard fail — content
errors should be loud in a curated system.*
