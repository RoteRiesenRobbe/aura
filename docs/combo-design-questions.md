# Combination System — Design Question Catalog

Input for the Phase 9 design section, which gets written during Phase 7
(decided in `skill-system-design.md`). **Questions only — no decisions.**
Where a lean is noted, it is a suggestion to react to, not a default.

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
- (a) Simultaneous: all ingredients at required level at the same moment. With free respec this is a deliberate "configure your build into the recipe" act.
- (b) High-water marks: a recipe triggers once each ingredient has *ever* reached its level. Sneaky-friendly (no need to hold the shape), but weakens the "aha" moment and makes farming trivial.
- *Lean: (a) — simultaneity is what makes discovery feel earned, and it's cheaper to implement (no per-skill history).*

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
