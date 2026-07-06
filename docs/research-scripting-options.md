# Scripting/Expression Layer — Parts 2–4: Options, Draft Plan, Open Decisions

> **Status: options for discussion, deliberately no recommendation.** Written
> 2026-07-06, companion to `research-scripting-audit.md` (Part 1 audit).
> The call is made chat-side (Robert + Claude); this doc's job is to make the
> trade-offs and the decision points explicit. All performance numbers are
> order-of-magnitude **[PLACEHOLDER]** estimates, not measurements.
>
> The *pipeline* around designer-authored content (rebuild wall, frontend
> dual-write, validation gates, persistence rules) is a separate, mostly
> scripting-independent problem set — see `research-content-pipeline.md`.

---

## Part 2 — Options

Shared context for all options:

- **Hot path:** per tick (33 ms budget, shared with physics broadphase and
  network assembly — the two documented heavyweights), for each caster whose
  effect fires this tick, apply to up to `maxTargets` targets. Tick intervals
  already gate most effects (DamageAura fires every 20 ticks, HealAura every
  60), so "evaluations per tick" is far below "casters × targets". The
  documented stress case is the **blob** (low hundreds of co-located casters,
  `architecture.md` §4).
- **Determinism:** single authoritative server, no lockstep — determinism means
  *reproducibility and auditability*, not cross-machine float identity. The
  risks are the same for every option: exposing wall clock, unseeded RNG, or
  map-iteration order to authored logic. All logic is authored by us, never
  user-submitted.
- **Iteration speed baseline:** because content JSON is `go:embed`ed, *every*
  option currently shares the same loop (edit → `make build` → restart). Any
  option's iteration-speed win only materializes together with a dev-mode
  disk-load/hot-reload path — which is a small, independent change that would
  benefit plain JSON too.

### Option A — Status quo: new behavior = Go, new content = JSON

Keep the fat-struct + dispatch model; keep adding effect types by hand.

- **Unlocks:** nothing new — but the audit shows the seam is cheap and
  well-trodden (8 types absorbed; the newest pair cost ~⅓ of a session for the
  Go part). Combos keep composing existing types with new parameters.
- **Performance:** optimal — straight Go, zero interpretation overhead. The
  blob case is bounded by broadphase and networking, never by effect logic.
- **Determinism/safety:** best — compiler-checked, load-time validation
  hard-fails, TDD pins every behavior.
- **Debuggability/iteration:** best tooling (debugger, types, `go test`),
  worst latency for *behavior* changes (Go round trip). But note the baseline:
  data changes need a rebuild today anyway, so in practice A is only slower
  than the alternatives at the "invent a new mechanic" step, not at tuning.
- **Cost:** zero now. Ongoing cost = one Go round trip per genuinely new
  mechanic, paid by whoever maintains the backend (currently: this pairing).
- **Where it genuinely pinches:** (1) every new scaling axis adds another
  `*PerLevel` field pair to the fat struct (it has ~20 fields now); (2)
  conditional/stateful combo behaviors (audit §2 list) each cost a full type;
  (3) content authors who are not Go-comfortable are locked out of mechanics.

### Option B — Embedded expression layer for formulas (expr-lang/expr or cel-go)

Selected numeric fields in `EffectDef` accept **either** a number (today's
form, stays valid) **or** an expression string compiled at load time against a
typed environment, e.g.

```json
"damageHP": "7 + (level-1)*1.6",
"damageHP": "targetHealthRatio < 0.3 ? 14 : 7"
```

Environment tiers matter: `{level}`-only expressions can be **pre-evaluated
per level at equip time** (zero hot-path cost — they replace the `*PerLevel`
field zoo outright); target-dependent ones (`targetHP`, `targetMaxHP`,
`casterHealthRatio`, `targetCount`, `tagsMatched`…) evaluate per application.

- **Unlocks:** arbitrary scaling curves (soft caps, breakpoints, diminishing
  returns) without new struct fields; simple conditionals (execute-style
  damage, low-HP bonuses); values coupling caster and target state. Does
  **not** unlock control flow, state, events, new targeting topologies, or new
  side effects — the 8 effect types remain the vocabulary.
- **Performance:** expr/cel compile to bytecode at load; ~0.1–1 µs per eval.
  Worst case blob math: 200 casters × 5 targets × every-tick firing = 1 000
  evals/tick ≈ 0.1–1 ms — measurable but inside budget; realistic cadences cut
  it 10–60×. Per-level pre-evaluation removes the common case entirely.
- **Determinism:** excellent — pure functions over floats, no I/O, no state;
  same float semantics as the Go it replaces. Type-checked and hard-failed at
  startup, exactly matching the existing validation ethos.
- **Debuggability:** good — compile errors at load with field/skill context;
  expressions are unit-testable from Go table tests; no runtime state to
  inspect. Authoring stays in the same JSON file next to the values.
- **Cost/invasiveness: small-to-medium.** One dependency; a
  `NumberOrExpr` JSON type + compile step in `definition.go`; an env struct;
  eval calls where `effectDamageHP`-style helpers live today. The dispatch
  model, targeting pipeline, and all 8 behaviors are untouched. Biggest design
  task is freezing the environment vocabulary (what may a formula see?).

### Option C — Embedded scripting language (gopher-lua; alt: Starlark, Tengo)

A `scripted` effect type (and/or encounter scripts) whose behavior is a Lua
function called by the SkillSystem, against a curated API: `selectTargets()`,
`dealDamage(target, hp, tags)`, `heal()`, `applyBuff()`, `spawnMob()`,
per-skill state tables, event callbacks (`onKill`, `onTick`, `onPhase`).

- **Unlocks:** everything in the audit's "not expressible" list that the
  exposed API covers — full control flow, per-caster/per-target state, ramps,
  procs, chains, boss phases. The ceiling moves from "what effect types
  exist" to "what API functions exist" — new *primitives* (knockback, spawn,
  a generic buff container, an event bus) still have to be built in Go first.
- **Performance:** the real risk axis. gopher-lua VMs are not
  goroutine-safe (needs a pool or one VM for the single-threaded loop — the
  loop *is* single-threaded today, which helps), calls cost ~1–10 µs plus
  boxing allocations → GC pressure in the hot path. Per-firing scripts at
  realistic cadences: fine. Per-target per-tick scripts in the blob case:
  1 000 calls ≈ 1–10 ms — eats a third of the budget in the worst case,
  before the LoS work lands in the same hot path. Event-driven encounter
  scripts (a few calls per second): trivially cheap.
- **Determinism:** controllable but on us — the API must inject seeded RNG,
  tick-based time only, no `os`/`io` libs (gopher-lua lets you omit them).
  Auditable, but runtime errors replace compile errors for most mistakes.
- **Debuggability:** the weak point. Lua errors surface mid-tick (needs an
  error policy: disable the skill? log and skip the tick?); debugging is
  print-based; type errors appear at run time, not load time (mitigable with
  a load-time smoke-call, not eliminable). The author must be a programmer
  anyway — so relative to Go, the wins are no-rebuild + no-recompile, **not**
  accessibility.
- **Cost/invasiveness: large.** API surface design (the actual work — every
  exposed function is a compatibility contract), VM lifecycle, state
  persistence across ticks (and across death/respawn `carriedState`?), error
  policy, sandboxing, test strategy for scripts, and the primitives
  themselves. It also creates a second place where gameplay truth lives,
  weakening the "read `sys/skills.go` and know everything" property the TDD
  values.

### Option D — Declarative trigger/action data for encounters (no language)

Not an expression or script engine: a JSON-shaped **state machine** for the
encounter controller only — states/phases, transitions on events
(`onMobDeath`, `onPlayerEnter`, `onTimer`, `onBossHealthBelow`), actions from
a fixed verb list (`spawnMobs`, `setImmunity`, `openPassage(duration)`,
`setActiveAura`, `grantUnlock`). Interpreted by the Go encounter controller
the roadmap already plans.

- **Unlocks:** boss/encounter orchestration as content — the lava-bridge
  reference encounter's mechanics map 1:1 to such verbs. Nothing for combos
  or effect behavior.
- **Performance:** negligible — event-driven, a handful of transitions per
  second.
- **Determinism/safety:** as good as Option A — verbs are Go, data is
  validated at load like recipes/skills.
- **Debuggability:** state machines are inspectable (current state is one
  enum you can log/wire-expose); authoring errors hard-fail at load. Less
  expressive than Lua — anything outside the verb list is a Go change, same
  dynamic as effect types.
- **Cost: medium**, but note it is **mostly the same cost as the planned Go
  encounter controller** — the verbs and event plumbing must exist either
  way; the delta is the JSON schema + interpreter instead of one struct per
  boss. The roadmap's recorded lean ("Go structs, DSL is YAGNI with one
  boss") is precisely a bet against paying that delta early.

### Cross-cutting observation

The options are **not mutually exclusive and not one axis**. B addresses the
formula/fat-struct pinch; C addresses novel behaviors; D addresses encounter
orchestration; A is the default for everything not consciously moved. A
realistic outcome is a *portfolio* (e.g. A for effect semantics + B for
scaling + Go-structs-then-maybe-D for encounters), which is why Part 4 asks
for scope per subsystem, not one global answer.

---

## Part 3 — Draft plan: where a layer would slot in, if built

*(Options with trade-offs, not a chosen path.)*

### Slot map — which systems could consume which layer

| Subsystem | Today | B (expressions) | C (Lua) | D (state-machine data) |
|---|---|---|---|---|
| Effect scaling (`*PerLevel` zoo) | fat struct | **natural fit** — replaces the pattern | overkill | n/a |
| Effect semantics (the 8 types) | Go dispatch | conditionals only | `scripted` effect type | n/a |
| Combo result skills | JSON re-parameterization | + conditional/coupled values | + genuinely novel behaviors | n/a |
| Mob idle archetypes (item 7) | 1 hardcoded loop | n/a | possible, over-general | parameterized enum is enough (not this layer) |
| Encounter/boss controller (item 7) | doesn't exist | condition fields inside D | full scripts | **natural fit** |
| Balance values (conf.json etc.) | numbers + restart | curves as content | overkill | n/a |

### Integration shape (common to B and C)

Both bolt onto the existing Registry pattern rather than replacing anything:

1. **Load time:** compile expressions/scripts during `SkillsFromFS` /
   `RecipesFromFS`-style loading; hard-fail on any error (matches the recipe
   ethos: content errors are loud). Compiled programs live on `EffectDef` /
   the skill definition — immutable after load, like everything else.
2. **Run time:** the SkillSystem stays the only caller; the layer is invoked
   exactly where the `effectDamageHP`-style helpers or the dispatch switch sit
   today. No new ECS system, no wire changes.
3. **Dev loop:** pair with a `-dev` disk-load flag for `api/` content (and
   script files) so edit→retest drops the rebuild. This piece is worth doing
   for plain JSON even if no scripting layer is ever built.

### Three candidate rollout paths

**Path 0 — "Stay the course, remove the shared tax."**
No logic layer. Build the dev-mode disk-load/hot-reload for embedded content
(small). Continue Option A for effect types; build the encounter controller as
Go structs per the roadmap lean. Revisit this whole topic when a *concrete*
combo or boss design is blocked — with the blocking example in hand.
*Trade-off:* zero risk, zero new capability; the fat struct keeps growing;
the revisit trigger relies on us noticing the pain rather than planning for it.

**Path 1 — "Expressions where formulas pinch."**
Phase 1a: disk-load dev mode (as Path 0). Phase 1b: introduce expr-lang for a
*small allowlist* of fields (`damageHP`, `healHP`, `resistFactor`,
`maxTargets`, `tickInterval`) with a `{level}`-only environment, pre-evaluated
per level — no hot-path cost, immediately deletes the `*PerLevel` pattern for
new content. Phase 1c (only if content asks): extend the environment with
target/caster state for per-application evaluation, benchmarked against the
blob scenario first. Effect semantics and encounters stay Go.
*Trade-off:* modest new capability, one dependency, an environment vocabulary
to maintain; does nothing for the audit's "not expressible" behavior list.

**Path 2 — "Full scripting, staged behind real content."**
Everything in Path 1, plus: when combo/boss content produces ≥2–3 designs
that the fixed types cannot express, design the curated Lua API around *those
designs* (not speculatively), ship a `scripted` effect type and/or scripted
encounter hooks, with the blob benchmark as a gate and a defined runtime-error
policy. Until that trigger, encounters are Go structs.
*Trade-off:* highest ceiling, highest cost; the staging discipline ("API
designed from real examples") is doing all the risk-management work — commit
to it explicitly or this becomes speculative infrastructure, which the
project's YAGNI principle forbids.

### What would need to be true for each path to be right

- **Path 0** if: recipes stay few and re-parameterizing (PaladinAura-shaped),
  one boss ships v1, and the current pairing (Robert + Claude) authors all
  mechanics — the Go round trip is then not a bottleneck at all.
- **Path 1** if: the content pass (item 12) wants many skills with distinct
  scaling personalities, or balancing wants curves, but behaviors stay within
  the 8 types.
- **Path 2** if: combo identity is meant to come from *novel mechanics*
  (procs, ramps, transformations) rather than novel stat mixes, or multiple
  scripted encounters land in v1, or a non-Go author joins.

---

## Part 4 — Decisions we need from you (before any implementation)

1. **Scope: which subsystems, if any?** Combos only? Also mob/boss
   encounters? Also base effect scaling? (See the slot map — this is several
   small decisions, not one. In particular: does the roadmap's recorded
   "encounter controller = Go structs, not a DSL" lean stand?)
2. **Timing: now or when forced?** Phase 9 is shipped and did *not* force the
   question — PaladinAura fit the fixed types. Do we build ahead of need, or
   park this until item 12 content / the second boss produces a concrete
   blocked design? (Parking has a cheap companion action: the dev-mode
   disk-load, which is worth doing regardless — confirm?)
3. **Does the YAGNI case hold for curated recipes?** Recipes are few,
   hand-designed, and authored by us. Honest framing from the audit: the
   recipe *mechanism* needs nothing; the question is purely whether future
   combo *results* should have mechanics outside the 8 types — and whether
   "double damage below 30% HP"-class ideas (expressions) already cover the
   combo identity you want, without full scripting.
4. **Who authors mechanics day-to-day, medium term?** If it stays
   Robert+Claude, Lua's accessibility argument evaporates (both loops end in
   the same rebuild today) and the choice is between Go's tooling and
   expressions' compactness. If a designer/content author without Go joins,
   the calculus shifts toward B (and eventually D for encounters). This is
   the single highest-leverage input.
5. **Where does combo identity come from (design intent)?** Novel stat
   mixes and targeting (→ fixed types suffice) vs. novel mechanics per combo
   (→ pressure toward C). This is a game-design call that fully determines
   the technical one.
6. **If any layer is built: what is the runtime-error policy?** Load-time
   hard-fail is settled house style; but Option C also has *runtime* errors —
   disable the skill, skip the tick, or crash loudly in dev? (Only needs an
   answer if C is ever in scope; expressions can be made total/error-free at
   compile time.)
7. **Secrecy footprint:** recipes are curated-secret with backend-only
   loading; scripts/expressions for combo results would carry the same
   spoiler risk. Same policy (backend-only, maybe repo-visibility question
   later)?
