# Plan: Simulation Harness — the balancing / what-if explorer

> **Status: ✅ COMPLETE — all 4 chunks built, PO-approved and committed.**
> The harness is live tooling; drive it via the `run-simharness` skill.
> Design settled with PO 2026-07-15; per-chunk records follow.
> **Chunk 1 DONE — PO-reviewed ("it works") + COMMITTED `5faf7aa6` 2026-07-15:** `pkg/aura/sim/`
> (world/scenario/runner/report) + `cmd/simharness` + `sys.SkillSystem.SeedRNG`
> seam; 7 sanity tests green (exact TTK/TTD cadence pins, fixed-seed
> reproducibility, variance spread), full suite + build green, CLI smoke-run OK
> (first finding: current content numbers give TTD ≈ 8.7 s vs the ~20–25 s
> working target). **Plus (PO-requested, same session): `-serve` local web
> explorer** — embedded single-file HTML (vanilla JS, no npm), `POST /run`
> reuses the sim spec structs, live knobs → histogram + percentiles, artifact
> download; `Distribution.Values` (sorted raw seconds) added so artifacts carry
> the full shape. **Plus a mob-preset dropdown**: `GET /mobs` serves the real
> authored mob registry mapped onto MobSpecs (embedded `pkg/api` by default,
> `-content ../api` for live content — the first "point the tool at real
> content" bridge from §4; mobs without a damage aura map to harmless
> turrets).
>
> **Chunk 2 DONE — PO-verified ("the tool works") + COMMITTED `eed434f5` 2026-07-15:**
> `sim/curve.go` (Curve `f(L)=growth^(L-1)`; XPModel mirrors the game's level-up
> rule, modeled kill XP → kills-per-level; Fixture PlayerAt/MobAt scale **HP
> values only** — pinned by tests) + `sim/sweep.go` (level sweep, gap sweep
> TTK/TTD/win-rate vs Δ, linked-triple table with measured wall Δ = first Δ≥0
> at TTK win-rate <50% [PLACEHOLDER definition]; CurveReport artifact; sweep
> points parallel across NumCPU, race-clean, reproducibility contract kept) +
> table renderers + CLI `-levels` mode + web-explorer "level curve" panel
> (`POST /curve`, SVG charts + win-rate bars + triple table). 12 sim + 2 handler
> tests green; browser-verified headlessly (see `.claude/skills/run-simharness/`,
> committed `920c8bf2`). **Findings:** (1) same-tier TTK/TTD perfectly flat
> across 30 levels — Philosophy A holds in the real systems; (2) with current
> content baselines (TTD/TTK ≈ 8.7/6.7 ≈ 1.3) the wall sits at Δ≈+2 for EVERY
> growth candidate — the doable band is set by growth AND the TTK:TTD ratio,
> and the compressed ratio dominates; (3) at a target-shaped ratio (mob dmg
> 8→4 → TTD ≈ 2.5×TTK) the wall spreads by growth: 1.08→>6, 1.10→+6, 1.12→+5,
> **1.15→+4** — the ~4-level band at ratio ~1:2.5 points at growth ≈ 1.15.
> **⚑ OPEN (PO): lock exact `growth` + max level from the tool** — not locked
> yet; the tool itself is verified.
>
> **Chunk 3 DONE — implemented + verified + PO-approved 2026-07-16 (committed):**
> the 1-vs-N matrix. Sim core generalized to N mobs — `Scenario.PackSize` +
> `Pack()` constructor, `World.Mobs` (ring spawn at StartDistance, per-mob
> spawn-HP rolls in index order; N=1 stays byte-identical to chunks 1–2, pinned
> by a seed-sweep regression test), `FightResult.Kills`. `sim/matrix.go` =
> `RunMatrix` (MaxTargets-candidate build rows × pack sizes 1..N, cells parallel
> via the chunk-2 pool): per cell win rate + clear-time distribution (wins) +
> kills-before-death distribution (losses); per build `OverwhelmPack` = first
> pack size with win-rate <50% [PLACEHOLDER, mirrors chunk-2 WallDelta].
> Surfaces: CLI `-matrix -max-targets 1,2,3,0 -max-pack 8` (heat table + kills
> table + artifact), `POST /matrix`, web-explorer heatmap panel (validated
> sequential win-rate ramp, overwhelm column, per-cell tooltips); driver.mjs
> extended to drive+screenshot it. **Required real-system fix (`sys/targeting.go`):
> `selectTargets` now sorts candidates by entity ID before capping — the collision
> set is a map, so capped-tie picks AND per-target damage-roll assignment rode on
> Go's randomized map iteration (chunks 1–2 never saw it: 1v1 has one candidate).
> In-game effect: equidistant ties now resolve to the oldest entity instead of
> flickering; 2 new sys tests pin it.** 10 new sim tests + 2 handler tests; full
> suite + race green; browser-verified. **Findings:** (1) at current content
> baselines (TTD/TTK≈1.3) EVERY build — even uncapped — is overwhelmed at pack 2
> with 0 kills banked: the duel is too tight to survive any second mob, same
> root cause chunk 2 flagged; (2) at the target-shaped ratio (mob dmg 4) the
> overwhelm point moves with the cap (cap 1 → pack 2, cap ≥2 → pack 3) and
> multi-target caps clear the packs they cover in flat time (parallel kill);
> (3) the overwhelm cliff is sharp — win rate collapses 100%→~0% within one
> pack size at these variance levels. Roadmap position: the
> **pre-step-6 simulation-harness gate** (`docs/roadmap.md` item 5 → gate
> blockquote; `gdd.md` §5 "First building block"; `tdd.md` §4.1). Prerequisite
> already met: player passive regen is combat-gated
> (`plan-atmosphere-recovery.md` chunk 1).
>
> **Chunk 4 IMPLEMENTED + VERIFIED 2026-07-16 — PO review pending (not committed):**
> the kills/hour chain, facetank vs kite. Design refinement over §8's sketch:
> **per-cycle worlds** — each cycle runs its fight in a fresh `NewWorld` (every
> chain fight is byte-identical to `RunFight` under its per-fight seed, pinned),
> then keeps ticking the SAME world through recovery so the real combat grace
> (5 s) + real regen accumulator (+ the real `self_heal` fire) set the recovery
> time; the downtime gap is pure chain-clock time. Stances are scenario data:
> facetank = `StartDistance 0` (body layers never collide), kite = ring-centre
> distance `[mobAura+0.25, playerAura+mobBody)/2` with the mob pinned (speed 0
> ⇒ `auraAlwaysOn`, still fights back); empty ring ⇒ cell `Feasible:false`.
> `sim/chain.go` = `ChainConfig/ChainCell/ChainRow/ChainReport`, `KiteDistance`,
> `runChain`, `RunChain` (brackets × stance × run flat-parallel; chain i shares
> seed across cells); `Scenario.RegenTick` knob threaded into `NewWorld`
> (0 = old default, chunks 1–3 byte-identical); synthetic self-heal cooldown
> (20%+5%/lvl, 30 s cd on the chain clock [PLACEHOLDER], fired headlessly via
> `RequestCooldownActivation` — verified it does not stamp combat); optional
> level brackets reuse the chunk-2 Fixture. Surfaces: CLI `-chain` (+`-chain-fights
> -downtime -regen-tick -self-heal -chain-levels`), `POST /chain`, explorer
> chain panel; driver.mjs drives + screenshots it. 13 sim + 2 handler tests
> (incl. an exact recovery pin: 149 grace steps + regen ticks, hand-derived);
> full suite + race + browser green. Threshold guardrails (§1/§9) stay
> deferred until the numbers are read with the PO. **Findings:** (1) recovery
> dominates the chain — at current baselines facetank efficiency ≈ 0.22 (76 s
> recovery per 6.6 s fight); target-shaped ratio (mob dmg 4) ≈ 0.35; the GDD's
> "~90% facetankable starter normal" [PLACEHOLDER] is far away at the current
> regen (~1%/s) — regen/downtime are the knobs that move it, flag to PO;
> (2) self-heal L1 lifts facetank 0.22 → 0.28; (3) a boss-shaped mob (dmg 30,
> tick 10, HP 300) kills the facetank bot with 0 kills banked — the GDD boss
> case reproduces; (4) efficiency is flat across level brackets — Philosophy A
> holds on the chain metric too.
>
> **Chunk 4 PO-APPROVED + COMMITTED 2026-07-16 → SIM-HARNESS PLAN COMPLETE.**
> Decisions locked with the PO from the tool's output (2026-07-16):
> (1) **`growth` = 1.12 × max level = 30 (WORKING LOCK)** — ≈27× total
> inflation, band ≈ +5; deliberately lower-first, cheap to steepen later iff
> step 6 authors mobs as tier + baseline (derived), which is now a content-pass
> requirement (GDD §5); (2) **passive regen stays slow** (~1%/s [PLACEHOLDER])
> — the ~90% facetankable-normal frame is superseded, positioning is rewarded
> everywhere, recovery-dominated attrition is intended, self-heal/campfires are
> the recovery accelerators; (3) **stand-still tier thresholds re-anchored
> [PLACEHOLDER]: normal ≤ ~50%, elite ≤ ~25%, boss dies** (GDD §5); (4)
> downtime default 15 s (zone-density-dependent, tuned by feel in step 6) and
> chain length 20 confirmed; (5) guardrail asserts stay deferred to step 6 —
> pinned against real mobs, not synthetic placeholders. **Next: Step 6, the
> initial content pass** (plan-first planning session; live `f` wiring at the
> top, per §5 Decision 5).
>
> **All open questions resolved with PO 2026-07-15:** (1) synthetic-fixtures framing —
> **yes**; (4) output — **standalone cmd + saved artifact**, not just test logs;
> (5) variance/crit — **kept in-model; every metric is a distribution**;
> (2) `f(character level)` — **DESIGN DECIDED this session, see §5** (Philosophy A,
> steep curve); (3) chain placeholders — **deferred to Chunk 4** (values decided
> there, informed by §5).

## 1. What this is (and isn't)

**This is a balancing / what-if exploration tool**, not primarily a pass/fail
gate. Its job: **show which numbers lead to which outcomes**, so we tune the
combat curve on a solid, measured basis instead of by eye. In the end every piece
of content and every number may still be adjusted individually — the tool exists
to *inform* those adjustments, not to lock them.

Concretely it answers questions like: *"if damage base = X and mob HP = Y, what is
the TTK? how does TTK move as I vary each knob? at what pack size does a level-10
build get overwhelmed? does standing still stay a losing strategy at level 50?"*

GDD §5 names the outcome metrics it reports:

- **TTK** — player kills a same-tier normal mob (working target ~8 s).
- **Time-to-die / survival** — an *idle* player killed by a same-tier mob
  (working ~20–25 s; ratio ~1:3 vs TTK).
- **Kills-per-level** across the level span.
- **1-vs-N matrix** — player target-count × pack-size (single/few-target base
  auras make pack fights, not duels, the real balance question).
- **Stand-still-bot sustainable kills/hour over a chain** (incl. modeled regen +
  downtime), tiered per mob type, per level bracket — the #1 "combat degenerates
  into a parking lot" design risk.

All target numbers are **[PLACEHOLDER]** (CLAUDE.md numbers rule). The tool
*measures*; the PO *decides* where the knobs land.

**Secondary, optional:** because the tool computes these outcomes anyway, a few
threshold assertions (e.g. "facetank must not become optimal at high level") can
be dropped in as `go test` guardrails later. That's a nice-to-have, not the
headline — do not let it drive the design.

## 2. Central design decision — drive the real ECS, do not re-model

**Decision: the tool builds a minimal deterministic world and ticks the real game
systems** (`SkillSystem`, physics, mob AI, targeting, status effects), rather than
re-deriving damage/heal/resist/regen math in a parallel analytical model.

Rationale:
- **DRY / single source of truth.** Damage/heal auras, tag-resist + min-1, the
  **±variance band and crit**, the tick accumulator (incl. its documented
  multi-effect quirk), combat-gated player regen, and mob regen/walk-home already
  live in the real systems. A parallel model would duplicate that and drift.
- **Emergent behaviour is the point.** The parking-lot risk lives in exactly the
  effects a closed-form model abstracts away (walk-home downtime, regen cadence,
  tick phase). Ticking the real systems captures them for free.
- **Proven feasible.** `sys/skills_behavior_test.go` already assembles a real
  `phy.Space` + `SkillSystem` and drives ticks; the tool generalises that
  scaffold. We do **not** stand up the net/websocket/scoreboard layer.

Trade-off accepted: slower than closed-form and needs a deterministic tick
driver. Both are fine at this scale (thousands of ticks, sub-second per fight).

## 3. Distributions, not point estimates (variance + crit are real)

Combat carries real RNG (the ±variance band and crit). We **keep it in-model** and
therefore report every metric as a **distribution over N seeded runs** —
median + spread (e.g. p10/p50/p90), not a single number. A run uses a fixed base
seed so results are reproducible; N sub-runs perturb the seed to sample the RNG.
This is a cross-cutting property of the world/scenario layer, wired in from
Chunk 1. (A single deterministic run is still available for debugging a fight
tick-by-tick.)

## 4. What the tool runs *against* — synthetic combatants now, real content later

Pre-step-6 there is no real content. Per GDD §5 ("before any content numbers
exist") the tool operates on **synthetic combatants**: you hand it explicit
numbers (a player build, a mob) and it reports outcomes. There is no dependency
on authored zones/mobs.

In step 6 the **same tool** is pointed at the real authored skills/mobs — the
runner and metrics are content-agnostic; only the combatant *source* swaps.
Designing for that swap now is cheap; building step-6 content now is out of scope
(YAGNI).

The bridge between "explicit numbers" and "a level" is `f(character level)` —
which is **not yet defined**. That is Chunk 2's job (below).

## 5. `f(character level)` — DESIGN DECIDED (PO, 2026-07-15)

The form was already decided in GDD §5: effect value = `base(skill level) ×
f(character level)`, with `f` touching **HP values only** (damage / heal /
self-HP / player max HP; never radius, tick, or target count). This session
settled the *role and shape*. Decisions below are **design decisions** (durable);
concrete numbers remain **[PLACEHOLDER]** per the CLAUDE.md rule.

**Decision 1 — Philosophy A: same-tier is scale-invariant.** Player damage *and*
player max-HP both scale by `f`, and same-tier mobs are hand-authored at their
zone's `f`. So a same-tier fight feels **identical at every level** (TTK ~8 s,
TTD ~20 s throughout). Leveling does **not** make same-tier content easier.

**Decision 2 — what `f` is *for*.** Because same-tier ratios never move, `f` is
**not a same-tier balance knob** — it is:
- **presentation / progression feel** — numbers grow visibly;
- **baseline relevance** — a newly-found aura is `base(1) × f(currentLevel)`, so
  it is *instantly usable* at any level; skill points then make it *better than*
  baseline (this directly serves the "collect / switch / experiment" pillar —
  even an early aura found in the late game is immediately viable, never
  dead-on-arrival);
- **uniform outleveling** — every player, regardless of specialization, outgrows
  old zones at the same rate.

Real *directed* growth is carried by **skill points** (specialization = deviation
from the `f` baseline), **slots + unlocks** (new capabilities), and **zone
progression** (the challenge ladder). Felt power comes from climbing to harder
zones with better tools and from *returning to trivialize old ones* — not from
same-tier drift.

**Decision 3 — the curve is STEEP (WoW-Classic-punishing).** `f`'s *rate* is
same-tier-neutral but **cross-tier-defining**: it sets how many levels of gap
turns a fight from doable → wall (and → steamroll). PO wants a **narrow doable
band ≈ 4 levels**, i.e. a per-level rate around **~12%** [PLACEHOLDER] (vs the old
6.9%/50×-over-60 placeholder, now superseded). Feel: enter a zone ~2–3 levels
under its floor → wall; grind a few levels → doable → comfortable; ~4 levels over
the mobs → steamroll, move on. Intra-zone difficulty variation is a **free
authoring pattern** under this model — author a zone across a small level span
(entrance corner at a lower tier, deep corner at a higher tier); no new mechanic.

**Decision 4 — the linked triple (band width ↔ max level ↔ total inflation).**
Steepness fixes per-level rate; then max level fixes total inflation. PO's working
frame: **max level ~25–35 now (maybe ~20 is enough for the first content pass);
the true max is higher but the full game is not completed in one content pass.**
At ~12%/level and ~25–35 levels, total inflation lands ~15–30× — sane number
sizes. All three stay [PLACEHOLDER]; the tool visualizes them together so exact
values are picked from data.

**Decision 5 — live-game wiring stays a separate step-6 task.** This work
*models* `f` in the tool (curve as a fixture parameter) and validates the band.
The cheap live-game multiplier lands at the top of step 6, per tdd.md §4.1,
using the `growth`/max-level the tool settles on.

**Content-pass context (roadmap step 6, for authoring against this curve):** the
first content pass introduces **two large zones**, each spanning a level range
with **different-difficulty areas** built from hand-authored per-tier mobs. The
curve above is what those mobs are authored against.

Chunk 2 now *implements and validates* this decided curve (pick exact `growth` /
max-level from the tool's level-gap band visualization) — it is no longer an open
design fork.

## 6. Geometry model for facetank vs. kite (Chunk 4)

Auras are pure range (LoS was cut, `tdd.md` §4.2), giving a no-AI way to express
the two bot behaviours the parking-lot metric compares:

- **Facetank bot** — player at mob centre: inside the mob's aura, takes full mob
  damage while dealing its own. Never moves.
- **Kite / ideal bot** — player in the ring where `playerAuraRadius >
  mobAuraRadius`: deals damage, takes none. The theoretical best a mover
  approximates.

Positions are set directly — no pathfinding/input scripting. Downtime (walk to
the next pack) is a **modeled time-cost parameter** in the chain runner, not a
simulated walk.

## 7. Structure

New package `backend/pkg/aura/sim/` (content-agnostic runner + metrics) +
a thin `backend/cmd/simharness/` that runs a battery and emits a report **and a
saved artifact** (human table to stdout + JSON/CSV file) so runs can be diffed /
charted across tuning sessions.

```
pkg/aura/sim/
  world.go       # minimal deterministic world: Space + real systems, seeded, Step(n)
  runner.go      # fight-to-death; N-seeded-run aggregation -> distribution
  scenario.go    # 1v1 TTK/TTD, 1-vs-N, chain runner; metric collection
  report.go      # aggregate -> table rows / JSON
  *_test.go      # scenario sanity tests (+ optional threshold guardrails later)
cmd/simharness/
  main.go        # run battery, print table, write artifact
```

## 8. Chunk breakdown (each its own execution session; pause for PO review between)

**Chunk 1 — sim scaffold + explicit-input 1v1 explorer.**
`world.go` (Space + minimal real system set, seeded, `Step(nTicks)`), `runner.go`
(fight-to-death + N-seeded-run **distribution** aggregation, variance/crit on),
and the two base metrics from explicit numbers: **TTK** (player kills mob) and
**TTD** (idle player killed by mob). Thin `cmd/simharness` prints a table + writes
JSON. No `f`, no curve yet — pure *"these numbers → these outcomes (p10/p50/p90)."*
This is immediately the number→outcome tool at the single-fight level, and the
reasoning vehicle for Chunk 2.

**Chunk 2 — implement + validate the decided `f` curve (§5).** The design is
settled (Philosophy A, steep ~12%/level, ~4-level band, max level ~25–35); this
chunk *builds* it. Add the curve to the fixture generator (`f(L) = growth^(L-1)`,
HP-values-only), synthesize level-typical player + same-tier mob per level, and
produce the tool's key visualizations: TTK / TTD / kills-per-level across the
level span (confirming same-tier scale-invariance) **and the cross-tier level-gap
band** (TTK/TTD vs Δlevel — the wall/steamroll picture) **plus the linked-triple
table** (band width ↔ max level ↔ total inflation). PO reads these to lock the
exact `growth` + max-level from data. Still no live-game wiring (§5 Decision 5).

**Chunk 3 — 1-vs-N matrix.**
Multi-mob worlds; sweep player-build × pack-size; report survival / clear-time /
overwhelm point as distributions. Validates single/few-target base auras against
authored-later pack sizes.

**Chunk 4 — sustainable-kills/hour chain + facetank vs kite.**
Chain runner: repeat[ fight → real out-of-combat regen to full → modeled downtime
gap ]; kills per simulated hour. Facetank (§6) vs kite; report **efficiency =
facetank ÷ kite** per mob tier, per level bracket. Recovery models (self_heal
cooldown, time-at-fire) + the downtime gap enter as **placeholder parameters**
(values decided here, informed by Chunk 2). Optional: drop in the per-tier
threshold **guardrail asserts** once the numbers are understood.

Order 1 → 2 → 3 → 4. The cmd grows one scenario per chunk.

## 9. Test strategy

- Each chunk ships `go test` **sanity** tests in `pkg/aura/sim/` (the world
  builds, a fight terminates, distributions are stable under a fixed seed).
- The optional per-tier **threshold guardrails** (Chunk 4) are added only once the
  outcomes are understood — the tool is an explorer first.
- `go build ./...` and full `go test ./...` stay green each chunk (CLAUDE.md
  sanity checks); the cmd gets a smoke run in each chunk's CLI checklist.

## 10. Open questions — all resolved

All resolved with PO 2026-07-15:
1. **`f(character level)` design** — decided (§5): Philosophy A, steep ~12%/level,
   ~4-level band, max level ~25–35, live-wiring deferred to step 6.
2. **Chunk sequencing** — tool-first: Chunk 1 builds the explorer, Chunk 2
   implements/validates the decided curve with it.
3. **Chain placeholders** — deferred to Chunk 4 (values decided there, informed
   by §5's recovery/downtime framing).

Nothing blocks Chunk 1. Execution can start in a fresh session.
