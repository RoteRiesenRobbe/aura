# Designer Content Pipeline at Scale — Issues & Preventive Steps

> **Status: informational / planning input, no implementation.** Written
> 2026-07-06 as a follow-up to the scripting-layer investigation
> (`archive-scripting-audit.md`, `archive-scripting-options.md`).
> Question addressed: when this goes live and **designers** (not Go
> engineers) author spells/skills without rebuilds — what breaks, and what do
> we do now so it doesn't? All effort estimates are rough
> **[PLACEHOLDER]**-grade sizing, not commitments.
>
> Relationship to the scripting question: this doc covers the *pipeline*
> around content authoring. The pipeline problems below hit designers
> **before** the expressiveness ceiling (the 8 fixed effect types) does, and
> every fix stays valuable regardless of which scripting option is chosen.
> Designer authorship is also the highest-leverage input to that decision
> (options doc, Part 4 question #4) — this doc is written assuming the answer
> is "yes, eventually designers author content."

---

## 1. The four walls a designer hits today, in order

### Wall 1 — Can't change a number without a rebuild

Skill/mob/recipe/milestone JSON is `go:embed`ed (`pkg/api/*`). Every edit is
`make cp-defs` + `make build` + server restart; on live, that restart
disconnects every player. The "content is data-driven" property is true in
the code but **not operationally true** — the iteration loop for a balance
tweak and for a Go change is identical.

### Wall 2 — The new spell is invisible or broken in the client

Two dual-write points, both already flagged as tech debt:

- **`Skills.ts`** hardcodes id → name / maxLevel / category for every skill.
  A designer ships JSON; the client renders nothing sensible until an
  engineer edits the frontend **and the client is redeployed**.
- **Per-skill-ID visual constants** — ring/VFX styling is hardcoded against
  IDs in `Character.setActiveSkill` (`PALADIN_AURA_SKILL_ID`,
  `FIRE_WARD_SKILL_ID`); mob aura ring radii are frontend constants
  (`GraphicsConfig.mobs.*.damageAuraRadiusMeters`) manually synced with the
  skill's effective radius.

This scales linearly with content volume. It is the first thing that turns
the item-12 content pass into a grind, and the failure mode is silent
desync (wrong name, wrong ring, wrong radius), not an error.

### Wall 3 — A content mistake takes the server down

Hard-fail validation at load is the right call for curated content — but it
runs in exactly one place: **server boot**. There is no way to validate
content without starting the game, no CI check on content changes, and no ID
discipline (skill IDs are hand-picked integers; a collision between two
authors is discovered at deploy time, in production, as a refusal to boot).

### Wall 4 — The semantics are folklore

What a designer must know to author correctly, none of it in an
authoring-facing document:

- damage/heal values are **per tick**, not per second; `tickInterval: 20` at
  30 ticks/s = one hit per 0.66 s; DPS = value × (30 / interval)
- the min-1 HP rule; heal clamping; the resist composition order and stacking
  rules (same source skill → strongest wins; distinct sources → multiply;
  0 = immune = non-event); buff lifetime = tick interval + 1
- which fields are valid on which effect type (the validator rejects, but
  nothing *documents*); the `base + (level−1) × perLevel` scaling shape and
  its floors/clamps; selector/cap semantics; `targetsSelf` living outside the
  target cap

The load validator catches shape errors, not semantic ones — a designer will
author confidently wrong content and only find out in play. Behind all of
this sits the **vocabulary ceiling**: anything outside the fixed effect types
is an engineering ticket. The scripting-layer question was decided 2026-07-07
(`plan-effect-foundations.md`: effect semantics stay Go; expression layer
parked, F2) — a designer joining the authoring side is exactly the kind of
trigger that would reopen the F2 expression-layer call (Option B in
`archive-scripting-options.md`).

---

## 2. The silent trap: persistence turns content changes into data migrations

Today the spellbook is session-only, so content churn is free — delete a
skill, renumber it, lower a maxLevel; nobody notices. The moment accounts
(roadmap item 3) persist `{skillID: level}` per player, **every content
change is a potential player-data migration**:

- delete a skill a player has persisted → dangling ID in their spellbook
- lower `maxLevel` below a player's stored level → invalid state
- **reuse a retired ID** → a player silently owns a different skill
- rename a skill that a recipe references by name → recipe hard-fails at boot

If the rules aren't set *before* persistence ships, they get discovered as
live incidents. They are cheap if decided early:

1. **Skill IDs are forever** — retired skills are tombstoned, never reused.
2. **maxLevel never decreases** (or a defined refund/clamp path exists).
3. **Load-time reconciliation** of persisted spellbooks against the registry
   (unknown ID → drop or tombstone-preserve; over-level → clamp + refund),
   with an explicit, tested policy.
4. Recipes/milestones reference skills **by name resolved at load** (already
   true) — so renames are load failures (loud), not silent breaks. Keep it
   that way.

**Owner:** these rules belong to roadmap item 3's design, not to a later
cleanup. Cross-reference recorded there when item 3 starts.

---

## 3. Improvements, ordered by when they're needed

### Now / before the item-12 content pass (each small, days not weeks)

1. **`-dev` disk-loading for `api/` content** (optional file-watch reload in
   dev). Kills the rebuild loop for content edits; prerequisite for any
   future live content-deploy story; benefits plain JSON and any future
   expression/script files alike.
2. **A `-validate` mode / content-lint CLI + CI gate.** The hard-fail
   loaders (`SkillsFromFS`, `RecipesFromFS`, mob defs, milestones) already
   exist — expose them without booting the game and run on every content
   change in CI. Moves "server won't boot" from production to the PR.
3. **Kill the `Skills.ts` duplication before the skill list grows** — serve
   skill metadata over the wire (or codegen it from the JSON at build), and
   move ring/VFX styling into a data field on the skill (a `visuals`/
   `ringStyle` block) instead of per-ID frontend constants. Same pass should
   cover the mob-aura-radius constant (wire-driven radii). Deadline: the
   content pass multiplies the cost weekly after that.
4. **JSON Schema for skills/mobs/recipes** — editor autocomplete +
   shape validation while typing; most of a "designer UI" for near-zero
   cost. Keep it generated from or checked against the Go structs so it
   can't drift.
5. **An authoring guide** — one doc: units and tick math, per-effect-type
   field tables, scaling shape, stacking/resist rules, targeting semantics,
   worked examples (DamageAura, FireWard, PaladinAura). Turns folklore into
   reference; also the natural place to document the cheat workflow
   (`SKILL <name>`, `XP`, `start-cmds`) as the designer test loop.
6. **ID allocation convention** — reserved ranges or simply "next free";
   validator rejects collisions *and reuse of tombstoned IDs* (ties into §2).

### Decide with accounts (item 3), not after

- The **content-vs-persisted-data rules** from §2.
- The boring live answer to "how do content changes reach the server":
  **validated content + scheduled restart** is fine for v1. True hot-reload
  is a trap at this stage — equipped skills hold live `*SkillDefinition`
  pointers, players are mid-fight with the old definition, and the client's
  metadata can be a version behind. Design reload only if restart cadence
  actually hurts in practice; if it does, the shape is immutable
  definition-set versions applied on respawn/re-equip, never in-place
  mutation.

### Decide with the scripting question (options doc, Part 4)

- If designers author **mechanics** (not just values), the expression layer
  (Option B) is the matching step: scaling curves and simple conditionals in
  the same JSON, type-checked at load, no new runtime risk class. Full
  scripting (Option C) only earns its cost if combo/boss identity is meant
  to come from genuinely novel behaviors.

### Later, for live tuning

- **Balance telemetry** — damage/heal dealt per skill, skill pick/equip
  rates, kill participation. Designers can't tune what they can't see;
  blind live balancing is its own class of nasty. (Fits the broader
  observability gap flagged in `research-v1-readiness.md` §3.)

---

## 4. Summary

Almost none of this is "build the scripting engine." The pipeline problems —
rebuild wall, frontend dual-write, validation-only-at-boot, folklore
semantics, ID/persistence discipline — hit designers **before** the
expressiveness ceiling does. Each fix is small, none is speculative
infrastructure, and all of them stay valuable no matter which way the
scripting decision goes. The two with hard deadlines: the `Skills.ts`/
visuals dual-write (deadline: item-12 content pass) and the
content-vs-persisted-data rules (deadline: accounts, item 3).
