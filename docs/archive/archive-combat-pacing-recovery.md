# Research — Combat Pacing & Recovery: Placement, Evaluation, Implementation Planning

**Status:** ✅ **ARCHIVED 2026-07-21 — fully consumed.** Every decision this
research produced was executed as execution-order step 3 (record:
`plan-atmosphere-recovery.md`, complete 2026-07-13): the regen combat gate,
campfires, darkness & light, the death state and campfire respawn — and the
aura-LoS cut. Kept for the rationale behind those calls, not as open work.
*Filed as `research-combat-pacing-recovery.md` until 2026-07-21.*

Originally a research deliverable (2026-07-10). All numbers [PLACEHOLDER], per
the project-wide rule.

> **DECISION BANNER (2026-07-10, same-day review session — the open questions
> below were walked through one by one and settled; the §1 docs pass has been
> APPLIED, adjusted for these outcomes):**
>
> 1. **C — aura LoS: CUT entirely** (not hybrid, not reopened-for-later).
>    Auras pass through walls and all objects; walls/props stay **movement**
>    blockers — that mechanic is untouched. Sub-decisions: darkness/light
>    (item 5) stays (area-based, never depended on occlusion); the inert
>    `blocksAura` plumbing is **deleted** (sweep pending — schema, model,
>    editor marker, content values); the **steering-first** commitment stands
>    (navmesh escalation trigger = wall-cheese in playtests); stationary-mob
>    wall-cheese is **accepted via authoring rule** (GDD §8). Records:
>    `gdd.md` §4/§12, `tdd.md` §4.2 (rewritten), roadmap item 6.
> 2. **E1 boundary: partial-instant OK.** Instant effects may never fully or
>    near-fully restore; a capped partial instant heal (~20–30%
>    [PLACEHOLDER]) is combat sustain, not recovery; the out-of-combat reset
>    is always time-based. **The L2 Heal cooldown stays as-is.** (GDD §3.)
> 3. **E3 feast aftereffect: kept open**, constraint recorded (no regen
>    persisting into combat). (GDD §3 + §12.)
> 4. **No-progress leash rule: PARKED, not scheduled** (user call: only if in
>    a plan about to execute — it isn't). Recorded as the designated
>    wall-cheese leash mechanic in `plan-mob-depth.md` §6.7; raise at chunk 4
>    plan-first or later.
> 5. **Pillars list: added in full** to GDD §1. **E2 theme: left open**
>    (mini-campfire noted as cheapest candidate). **A timing: minimal
>    indicator + wire before content-pass balancing, polish in step 8**
>    (roadmap items 8/12 + execution step 4).
>
> §2.C below is thereby **resolved**; it is kept as the decision-prep record.

**Input:** the 2026-07-10 design session refining the "Tempo/Fun" risk (combat
degenerating into standing still) — ideas A–F: tick visualization, two-zone
auras, the LoS reopening, harness chain-metrics, recovery & attrition, and the
solo-geometry analysis. Guiding principle from the session, first recorded
here:

> Standing still is only acceptable when it is a **held decision** (the player
> found and keeps a good position), not the **absence of one** (every position
> works equally well). A static fight in a classic MMO is still an RPG without
> movement; a static fight in *this* game — no targeting, no rotations — is an
> idle game.

**Two framing gaps found while researching (both are placement targets):**

1. **The "Tempo/Fun #1 risk" and the stand-still bot test exist nowhere in the
   repo.** There is no mob-behavior *research* document (the mob behavior
   framework record is `plan-mob-depth.md`, an execution plan), and no doc
   mentions facetanking, stand-still bots, or a combat-pacing risk. The only
   documented harness is GDD §5 "First building block" / TDD §4.1 (TTK,
   survival time, kills-per-level, 1-vs-N matrix). This document is the first
   repo record of the risk framing; §1 below proposes durable homes.
2. **The design pillars are not written down as a list.** Other docs already
   *cite* pillars by name (backlog item 1: "the one-resource / no-economy /
   no-item-drops **pillars**"; backlog item 11: "the persistent shared world,
   no instances **pillar**"; backlog item 8: "the 'interact exclusively through
   auras' **pillar**"; TDD §4.2: "it carries two **pillars**"), but the list
   itself exists only scattered across GDD §1/§4/§5/§7/§9/§10 and roadmap
   items. One pillar this session leans on — **readable/relaxed combat except
   top-tier content** — is documented *nowhere*. §1 proposes an explicit GDD
   pillar list.

---

## 1. Placement map

### 1.1 Overview table

| Idea | Status | Primary home (proposed) | Other docs touched |
|---|---|---|---|
| A — Tick visualization | **Decided** (requirement; mechanism open) + regression record | GDD §4 "Visual Representation" (supersedes the fill-clockwise sentence) | roadmap item 8 checklist + a new "aura VFX pass" note; CLAUDE.md tech-debt list (regression entry); content-pass note on mob tick rates (roadmap item 12) |
| B — Two-zone aura | **Decided** (scoped content, no global falloff) | GDD §4, new short paragraph under "Aura Behavior" | GDD Appendix A (optional candidate entry); roadmap item 12 (content candidate) |
| C — LoS blocking | **Reopened — open question** | TDD §4.2 (reopening banner replacing "Decided: LoS stays in scope") | GDD §4 definition + diagram (⚑ marker), §8, §11 scope checklist; roadmap item 6 banner + execution step 3; GDD §12 new open question; backlog item 8 (blocksAura half) |
| D — Harness metrics | **Refined decision** | GDD §5 "First building block" paragraph (extend) | TDD §4.1 harness bullet; roadmap execution order (make the harness an explicit pre-step-6 bullet); GDD §8 mob-type table (tier thresholds note) |
| E1 — No instant recovery | **Decided** (constraint) | GDD §3, new "Recovery rhythm" subsection | GDD Appendix A.3 (Heal Magic cooldown note); roadmap step 4 (recovery-over-time effect payloads) |
| E2 — Personal recovery cooldown early | **Decided** (direction) | GDD §3 recovery subsection + Appendix A.3 candidate | roadmap item 12 (content); mob-depth chunks 7–8 dependency note |
| E3 — Feast aftereffect buff | **Open question** (with constraint) | GDD §12 open questions + the §3 recovery subsection records the constraint | — |
| E4 — Passive OOC regen model | **Decided** (direction) + implementation gap | GDD §3 "Regeneration" (extend) | roadmap (small work item: combat-gate player regen); harness dependency (D) |
| E5 — Respawn at fixed world campfires only | **Decided** | GDD §3 "Death" (sharpen "last visited campfire") | roadmap execution step 3 campfire-respawn note; backlog item 9 (safe-place set); GDD §4 Base Auras (Campfire-Build constraint) |
| E6 — Revive as rare high-level ability | **Decided** (direction; GDD verification done) | GDD Appendix A (real entry replacing the bare §4 list mention) | roadmap step 4/5 (revive effect type after death state) |
| E7 — Death state (corpses + respawn button) | **Decided** (system change) | roadmap execution step 3 (bundle with campfire death-respawn) | GDD §3 Death; TDD §4 (small architecture note); code map in §2.E7 below |
| E8 — Single-charge respawn fires | **Not decided — future content idea** | backlog (new item) | — |
| F — Solo combat geometry | **Analysis to preserve** | GDD §4, new subsection "Combat pacing: the ring" (carries the held-decision principle + the geometry analysis) | plan-mob-depth §6 / roadmap item 7 (behavior-vocabulary note: lunges, arc pursuit, ground zones); roadmap item 12 (authoring guidance) |
| Pillars list | **Documentation gap** | GDD §1, new explicit "Design pillars" list | — |
| Risk record | **Documentation gap** | GDD §4 combat-pacing subsection carries it (alternative: a §12 "design risks" block) | CLAUDE.md pointer when edits land |

**Numbering note:** all proposals below are *subsections and paragraph edits* —
no GDD section renumbering. Dozens of cross-references across the repo cite
"GDD §5", "§7" etc.; inserting a new top-level section would break them.

### 1.2 Proposed edits per document

**`docs/gdd.md`**

- **§1 — new "Design pillars" list** (closes the gap). Candidate enumeration,
  drawn from what other docs already cite as pillars: no manual aiming —
  positioning + cooldown/switch timing are the only skill axes (§1); exactly
  one resource (§3); circle readability — the aura circle is a legible range
  indicator (§4); no items, no economy, no item drops (§8, roadmap item 2);
  cooperation without formal groups — role-filling is essential (§9);
  persistent shared hand-built world, no instances, environmental storytelling
  (§7); no griefing by design (§9); system-first, not presentation-first
  (§10); combat RNG rejected (§5/§12); **readable/relaxed combat except
  top-tier content** (new — first written record); numbers are always
  placeholders. Each with a one-line gloss and a §-pointer.
- **§3 — "Regeneration" bullet list becomes a "Recovery & attrition"
  subsection** carrying: (E1) *no recovery effect is ever instant* — recovery
  over time (~15–20 s at a fire [PLACEHOLDER]) **is** the rhythm beat
  (tension → recovery → tension), replacing classic sit-and-eat; an instant
  full restore collapses the rhythm regardless of cooldown length; group
  cooldown *rotation* is acceptable and even the intended group reward
  (rotation saves cooldown waiting, never the time-at-fire); (E2) every player
  gets a personal single-target recovery cooldown early (theme open —
  mini-campfire or other); larger group recovery (big fires, feasts) comes
  later/stronger; (E4) passive out-of-combat regen follows the classic model —
  relatively meaningful early, declining proportionally with level — with two
  documented cautions: the single resource is HP *and* mana in one, so this
  one knob steers everything; and passive regen is the only solo downtime
  mechanism besides the personal cooldown — slow enough to make active
  recovery attractive, fast enough that solo players never idle past the
  ~20 s sit-and-eat pain threshold [PLACEHOLDER]; (E3) the feast-aftereffect
  constraint (see §12 addition below); and the summary line: **the recovery
  currency is time-at-the-campfire, not cooldown availability.**
- **§3 — "Death" bullet sharpened (E5):** "Respawn at the last visited
  campfire" → "Respawn at the last visited **fixed world campfire**
  (graveyard equivalent, part of world design). Player-placed recovery
  points are **never** respawn points — the walk-back is a core death
  penalty (alongside the XP-within-level loss), and player respawn points
  would make boss encounters corpse-zergable." *(Note: the session phrasing
  "walk-back is our only death penalty" undercounts — GDD §3 also documents
  the XP loss; the proposed text keeps both.)*
- **§4 — "Visual Representation" superseded (A):** replace "Circles that fill
  clockwise, tick when full" with: aura tick *timing* must be readable —
  for the player's own aura **and** for mob auras; the exact mechanism
  (fill-up circle or anything else readable) is open and belongs to the
  aura VFX/animation/polish pass; plus the recorded caution: tick-dodging
  must be rewarding but not mandatory (no forced hokey-pokey every tick) —
  it only works if mob tick rates are slow and readable (an authoring rule
  for the content pass).
- **§4 — new paragraph under "Aura Behavior" (B):** two-zone auras (strong
  inner ring, weaker outer ring, both visible as distinct edges) are a
  sanctioned *special-occasion* pattern for particular mobs/player auras.
  Explicitly decided: **no global distance falloff** — falloff would
  sacrifice the binary readability of the circle system.
- **§4 — new subsection "Combat pacing: the ring" (F + the risk record):**
  the held-decision principle (top of this doc), the geometry analysis
  (§2.F below, condensed), and the differentiation levers: mob movement
  patterns (with the ring-riding caution + countermeasures: telegraphed
  lunges, arc pursuit, ground zones blocking the retreat corridor), tick
  timing (A), two-zone auras (B).
- **§4 — LoS marker (C):** the definition sentence "**Line-of-sight based** —
  auras don't pass through walls…" and the M2 diagram get a ⚑ "under
  review, see §12" until the C decision lands. Same for §8 "line-of-sight
  and targeting rules apply to them too" and the §11 must-have checkbox.
- **§12 — new open questions:** (C) aura LoS: full / none-with-pathfinding /
  hybrid — decision prep in this doc §2.C; (E3) feast aftereffect buff —
  constraint: a regen buff persisting into combat is pre-fight healing and
  stacks with heal auras, eating the attrition model; options: breaks on
  damage taken, out-of-combat only, or a non-healing buff entirely.
- **Appendix A.3 (E1/E2/E6):** annotate *Heal Magic cooldown* as
  recovery-over-time (never instant-full); add the personal recovery
  cooldown as a candidate entry; add a **Revive** entry (currently "Revive"
  appears only as a bare name in the §4 Base Auras example list — E6
  verification result) — rare, high-level, one of the most valuable social
  abilities; the answer to "died deep in the world" alongside the walk-back;
  requires the death state (E7).

**`docs/tdd.md`**

- **§4.2** — replace the "Decided: LoS stays in scope" opening with a
  reopening banner pointing at §2.C of this doc (the two-problem split,
  approach notes, and perf model stay — they are option (a)'s record).
  Also correct in passing: §4.2 claims LoS "carries two pillars
  (cover/positional tactics, the light-support role)" — the light-support
  half was *already* decoupled by the darkness-is-purely-visual decision
  (same section, point 2), so only one pillar claim actually rides on aura
  occlusion.
- **§4.1** — extend the simulation-harness bullet with the D metrics
  (sustainable-kill-chain, level brackets, tiered stand-still thresholds).
- **§5 risk table** — LoS row gains "scope under review (may shrink to
  hybrid/none)".

**`docs/roadmap.md`**

- **Item 6 (LoS)** — reopening banner: decide (a)/(b)/(c) per this doc §2.C
  **before execution step 3 starts** (the step's first half is the LoS spike;
  option (b) deletes it, option (c) defers it).
- **Item 7 / `plan-mob-depth.md` §6** — note the F behavior-vocabulary
  candidates (telegraphed lunge, arc pursuit, ground-zone denial) as
  content-era mob capabilities; not added to the 9-chunk scope now.
- **Item 8 checklist** — add "aura tick-timing readability (own + mob auras)"
  and name the **aura VFX/animation/polish pass** explicitly (today no
  roadmap step owns it).
- **Execution step 3** — scope grows: campfire death-respawn is *already*
  placed here (with backlog item 9); add (E5) the world-campfire-only rule +
  player-placed-fires-excluded constraint, and (E7) the **death state**
  (persistent corpses, player respawn-button window) — same death-flow
  surgery in `sys/state.go`, one pass (see §3).
- **Execution step 4** — add: recovery-over-time payloads (HoT/channel — the
  E1-compliant shapes; the existing instant `self_heal` gains a
  recovery-over-time sibling or successor), and the **revive** effect type
  (consumer of step 3's death state; the *ability* is content).
- **Execution order, before step 6** — make the simulation harness an
  explicit bullet (today it hides inside TDD §4.1's f(character-level)
  note) with the D metric set; note the prerequisite: player passive regen
  must be combat-gated first (E4 gap, §2.E4) or the harness measures a
  model we don't intend to ship.
- **Item 12 (content pass)** — add authoring rules: mob tick rates slow +
  readable (A); per-tier facetank thresholds authored per mob type (D);
  feast content pending E3; two-zone auras as content candidates (B).

**`docs/backlog.md`**

- **Item 9 (Recall)** — update context: the respawn-point set is **fixed
  world campfires only** (E5); "safe place" question partially answered.
- **New item (E8):** single-charge respawn campfire (player-placed, one
  respawn, then goes out; banned near boss/elite areas) — explicitly *not*
  decided, a potential future content idea; record the tension with E5's
  rationale (it is a deliberate, self-limiting exception).

**`CLAUDE.md`** — when the edits above are applied: tech-debt entry for the
tick-visualization regression (A) and the ungated player regen (E4).

---

## 2. Evaluation

### 2.A Aura tick visualization

**Pillar fit: strong.** Directly serves "positioning + timing are the only
skill axes" (visible timing turns geometry into a timing layer for free) and
circle readability. The GDD *already specified it* — §4 Visual Representation:
"Circles that fill clockwise, tick when full" — so this is a re-affirmation
that loosens the mechanism, not a new decision.

**Regression forensics (the investigation asked for):**

- **A forward-looking tick-timing indicator never existed.** The aura ring has
  been a static SVG sprite since the first aura commit (`d21a2d1c`,
  2026-03-15, original prototype: `damageAuraSprite`/`healAuraSprite`,
  visibility toggled — no fill, no arc, no animation; full history of
  `Character.ts` and pickaxe searches for fill/arc/progress/pulse code confirm
  nothing was ever attached to the ring). The GDD's fill-clockwise sentence is
  **unimplemented design intent, not lost code.**
- **What *was* removed — the continuous aura-action feedback.** Until
  2026-07-04 every shipped aura had `tickInterval: 1` (30 applications/s) and
  each application fired the `DamagedAmbient` status effect
  (`StatusEffect.forDamagedOverTime` — a Berryhunter-era ambient white pulse
  on the damaged entity, in the code since the 2019 "hit states" work). Aura
  activity was therefore *continuously* visible on the target. Commit
  `a877e3f8` ("Configurable aura hit-effects + tick-interval DPS rebalance",
  item 11 Step 4) raised tick intervals (DamageAura 20, HealAura 60, …),
  removed `DamagedAmbient` from mobs + characters, and introduced the per-hit
  slash/fire VFX.
- **Current state:** a tick is visible only **at the moment it lands, on the
  struck target** (`aura_hit_style` wire flag → `GameObject.showAuraHit`,
  `_GameObject.ts:302`). Nothing communicates *when the next tick will come*,
  and nothing renders at all when no target is in range. So the honest
  framing: the old continuous feedback was replaced by discrete landing
  feedback, and the timing dimension (which discrete ticks created!) was never
  visualized. Restoring per the decided requirement is **new work, not a
  revert** — the old visuals couldn't express timing either.
- **What restoring involves:** server tick cadence is deterministic and
  client-predictable in principle — a monotonic per-equipped-skill accumulator
  (`skills/component.go` `TickAccumulator`), reset on aura switch
  (anti-exploit) and, for mobs since chunk 3c, reset on aggro activation. But
  the client today knows **neither the tick interval nor the phase**: skill
  metadata is hand-duplicated in `Skills.ts` (documented tech debt, no
  intervals), and mob skill data isn't client-side at all. Cheapest correct
  path is a small wire addition — either a transient "ticks-until-next-fire"
  (or the accumulator value) on `Character`/`Mob`, or interval + activation
  tick once, letting the client animate the countdown. This lands in the same
  decision space as the parked ⚑ buff-visibility wire question
  (`plan-effect-foundations.md` §6) and the `Skills.ts` duplication debt —
  one wire design should cover them together rather than three ad-hoc fields.

**Conflicts:** none. The hit VFX (which reads as *what got hit*) and a tick
timer (which reads as *when*) complement each other. The recorded caution —
tick-dodging rewarding but not mandatory, mob tick rates slow and readable —
is an authoring rule with an existing hook (`auraSlashTickThreshold` already
derives VFX style from cadence; content-pass rule, no code).

**Verdict: aligned — decided requirement, needs a small wire design + the
(currently unscheduled) aura VFX pass named in the roadmap.**

### 2.B Two-zone aura

**Pillar fit: strong.** Creates positional decisions (deep = strong, shallow =
safe) while keeping binary circle readability — and the explicit rejection of
global falloff *protects* the readability pillar rather than bending it.

**Conflicts with documented decisions:** none found — no doc proposes falloff;
this decision pre-empts it. It also fits "what a level-up improves is defined
per aura" (GDD §4) and the special-occasion posture matches how `lowest_health`
selectors and AoE-all are already rationed.

**Code synergies (mostly built):** a two-zone aura is naturally **one skill
with two effects at different radii** — and the machinery anticipates exactly
this: per-effect `radius`/`radiusPerLevel` exist (`skills/definition.go:370`),
multi-effect skills with per-effect cadence are shipped (PaladinAura, Phase 9),
and the single aura sensor already sizes to the **max** over effect radii with
a comment predicting the rest: *"effects with smaller radii would then need
per-effect range checks; no such skill exists yet"*
(`skills/component.go:41-54`). Two gaps: **(1)** that per-effect range check in
the targeting pipeline (small — filter the sensor's collision set by distance ≤
the effect's scaled radius); **(2)** the frontend renders **one** ring radius —
`Character.setAuraRadius` sizes both ring sprites to the same diameter
(`Character.ts:321-327`) and `Mob.aura_radius` is a single wire value — two
distinct visible edges need a second radius (wire or client skill metadata;
same wire-design bucket as A). Note: **the campfire is already the first
planned consumer** of per-effect radii — roadmap item 5 specs it as "a large
`light_aura` plus a much smaller `heal_aura`" on one entity — so gap (1) gets
built for the campfire regardless; two-zone combat auras then ride it.

**Verdict: aligned — decided; cheap; schedule the range-check with its first
consumer (campfire, step 3), author two-zone content in the content pass.**

### 2.C Line-of-sight blocking — decision preparation

#### Where LoS is documented or assumed (the full inventory)

| Place | What it says |
|---|---|
| `gdd.md` §4 (definition + diagram) | "**Line-of-sight based** — auras don't pass through walls"; diagram's M2 "safe (LoS blocks)"; selection pipeline "filter by range → **filter by line-of-sight** → sort → take N" |
| `gdd.md` §8 | "Mobs have their own auras — line-of-sight and targeting rules apply to them too" |
| `gdd.md` §11 | Must-have checkbox "Line-of-sight for auras" |
| `tdd.md` §1 | Missing-for-v1 list: "Line-of-sight for auras (2D raycast; deliberately deferred…)" |
| `tdd.md` §4.2 | **"Decided: LoS stays in scope"** — the decision this session reopens; the two-problem split (aura occlusion vs vision), curated occluders, DDA-grid approach, cache, target-cap early-out, blob perf model, spike timing |
| `tdd.md` §5 | Risk table: "Line-of-sight performance (blob case) — High" |
| `tdd.md` §6 step 7 / roadmap execution step 3 | "LoS spike (blob benchmark) → occlusion into the aura pipeline" |
| `roadmap.md` item 6 | The full work item (occlusion in the targeting pipeline, curated `blocks-aura` flag, approach, perf model) |
| `roadmap.md` item 4 | Map format carries `blocks-movement` + `blocks-aura` as independent per-object flags (shipped as such) |
| `roadmap.md` item 11 | Targeting pipeline reserves the LoS slot ("LoS filter (item 6, later)") |
| `plan-world-zones.md` | Occluder-flags decision (movement built now, aura carried inert) |
| `plan-mob-depth.md` §1.2 | "Aura line-of-sight (`blocksAura` runtime) — item 6 / step 3 — next execution step" |
| `plan-effect-foundations.md` §1 | Candidate effect "temporary wall/barrier (interacts with planned LoS)" |
| `backlog.md` item 8 | Gates: "`blocksAura` on props is parsed but inert until item 6 — if a sealed gate should also block auras, that half doesn't exist yet" |
| Code | `world/zone.go:41` parses `blocksAura`; `model/prop/prop.go` stores it; `model/entity.go:93-95` interface comment "authored occluder data for aura line-of-sight (item 6)"; shipped zone content authors values (`zone.json` props `blocksAura: true`, scaffold all `false`) |

**What depends on it:** the GDD scope checkbox; the step-3 sequencing (the LoS
spike is half the step); the wall/barrier skill idea; backlog item 8's
aura-blocking gate variant; the ⚑ occluder-representation open questions. The
TDD's "carries two pillars" justification has aged: the light-support pillar
was already decoupled (darkness is purely visual, client-side — TDD §4.2
point 2 / roadmap item 5), leaving **cover/positional tactics as the only
pillar riding on aura occlusion.**

#### Two premise corrections from the current codebase

1. **"We plan rudimentary pathfinding anyway" overstates the plan.** The
   decided plan is **local steering, explicitly not pathfinding**:
   `plan-mob-depth.md` §1.2 "Navmesh / A* pathfinding — only if steering
   fails — Decided: steering"; §3.4 = repulsion from nearby blockers composed
   into the move vector. Steering rounds *convex, local* blockers (a rock, a
   tree); it does not solve *walls* — a long or concave blocker between mob
   and player defeats gradient-style repulsion (local minima). So "the mob
   walks around the wall and the exploit dies" holds for small props, **not**
   for exactly the geometry players would cheese with. If (b) is chosen,
   wall-cheese around real walls is either accepted, mitigated by AI-state
   rules (below), handled by level-design discipline (the already-decided
   "route validity is the level designer's responsibility" posture extends to
   "don't build cheese-able wall pockets around mobs"), or becomes the thing
   that triggers the recorded navmesh escalation clause.
2. **Wall-cheese is not merely hypothetical — and the chunk-3 leash currently
   protects it.** Combat state (chunk 3b) is "target within aura reach OR
   damage taken since last tick", and **in combat there is no leash**. A
   player damaging a wall-stuck mob through the wall keeps it in combat
   forever; the leash countdown never starts, the mob never resets/regens.
   Cheap AI-side countermeasures exist inside option (b): e.g. a
   **no-progress rule** — a mob that has made no progress toward its target
   for N ticks [PLACEHOLDER] starts the leash countdown *despite* taking
   damage → it disengages, walks home, and out-of-combat regen (mobs
   full-heal in ~2 s) makes the cheese yield nothing. That is a small chunk-3
   extension, not a new system.

#### The solo-symmetry data point (record with the decision)

With two center-anchored circular auras, an occluder between the two centers
blocks **both** auras — solo 1v1, LoS grants no positional advantage, only a
disengage tool. Its real value is **pack fights** (block one mob, not the
other — genuinely new positional texture that distance-order manipulation
alone can't express) and **group play** (heal positioning). Weigh the cost
against those two, not against solo play.

#### Option (a) — full LoS for auras (the current plan)

As specified in TDD §4.2 / roadmap item 6: rasterize static props into an
occluder grid at zone load (or raycast circle shapes directly), integer DDA
raycast in the targeting pipeline (clean insertion seam already reserved),
LoS cache (every K ticks), target-cap early-out, blob perf spike first.

- **Cost:** the spike (benchmark harness) + a medium system (bake + raycast +
  cache + pipeline filter + tests). Frontend: zero for correctness
  (server-authoritative; effects simply don't land) — but "why isn't my aura
  hitting" readability may eventually want a client hint.
- **Hidden cost nobody has documented:** **mob AI must become LoS-aware.**
  Chase currently holds position at the aura edge (`chaseIntoAuraMargin`)
  with a distance-only check. Under (a), a mob can hold at a spot where its
  own aura is wall-blocked (and the combat-state "target within aura reach"
  test is also distance-based) — mobs need "reposition until LoS" behavior
  or they get cheesed *worse* than today. That is a real addition to the
  mob-depth behavior stack, on top of the raycast work.
- **Also implied:** a content-curation pass (which props block, per zone) and
  the occluder-representation ⚑s.

#### Option (b) — no aura LoS; movement AI + combat-state rules carry it

Delete item 6. Rely on: chunk-4 steering (planned), the no-progress leash
rule (small, new — see premise correction 2), level-design discipline, and
the navmesh escalation clause if steering demonstrably fails.

- **Cost:** near zero new systems — one small chunk-3 AI rule + a
  documentation sweep (GDD §4/§8/§11, TDD §4.2/§5, roadmap item 6/step 3,
  `blocksAura` becomes dead data or is kept parsed-and-ignored for a later
  reversal).
- **What is given up:** pack-fight occlusion texture and group heal
  positioning (the one remaining pillar claim); the wall/barrier skill idea
  loses its mechanic; backlog item 8's aura-blocking gates die (movement
  blocking survives). **Stationary mobs can't path or leash-reset** — totems,
  braziers, hazards stay killable through walls risk-free; mitigation is
  content placement (don't put wall pockets next to hazards).
- **Note on light:** the session's "we likely still need LoS-style
  computation for light regardless" is **not backed by current decisions** —
  darkness is decided as purely visual and *area-based* (dark patches +
  light-radius counteraction; roadmap item 5, TDD §4.2 point 2). No
  occlusion/shadow-casting is documented anywhere for light. Wall shadows in
  dark caves would be a new, client-only rendering choice — optional
  atmosphere, decoupled from this decision. So (b) genuinely drops **all**
  raycasting, server and client.

#### Option (c) — hybrid: LoS for light and select content only

Keep auras globally LoS-free; build the raycast core lazily when specific
content wants it — e.g. a boss arena where the encounter controller flags an
occluder, or a per-effect `requiresLoS` opt-in — and (if ever wanted) client
shadow-casting for dark areas as pure atmosphere.

- **Cost:** the small/medium raycast core, deferred until the first consumer;
  **no blob-perf problem** (rare, curated use → no cache tuning, likely no
  spike), no world-wide curation pass, no global mob-AI LoS-awareness (only
  the flagged encounter's script must handle it — and the encounter
  controller owns bespoke behavior anyway).
- **Character:** keeps the readable default world of (b) while preserving a
  lever for exactly the pack/boss situations where LoS earns its keep;
  matches the repo's curated-content posture (curated occluders was already
  the decided stance — this narrows curation from "per prop" to "per
  encounter/effect"). Risk: "select content only" tends to grow; if most
  zones end up wanting it, (c) converges to (a) having paid twice for
  integration.

**Decision inputs summarized:** (a) buys pack/group positional texture at a
medium system + spike + an undocumented mob-AI extension; (b) is nearly free
but forfeits that texture and needs the no-progress leash rule *regardless*
(it closes today's wall-cheese even under (a) — a stuck mob is stuck whether
or not auras penetrate); (c) defers the cost until content proves the need.
The no-progress rule is a **no-regrets move under every option** and could
land in the current mob-depth step. **Not decided here — prepared.**

### 2.D Simulation-harness metrics

**Pillar fit:** direct mitigation of the (previously unrecorded) #1 risk;
supports the readable/relaxed-combat pillar by *measuring* where relaxed decays
into idle. No conflict — this refines the documented harness (GDD §5 / TDD
§4.1: TTK, survival, kills-per-level, 1-vs-N matrix) rather than contradicting
it.

**What's genuinely new to the repo (record, don't just refine):**

1. **The stand-still bot test** — nowhere documented before this doc.
2. **Tiered thresholds by mob type** — starter-zone normal ≈ facetankable at
   ~90% efficiency; elite ≤ ~60%; boss kills the stand-still bot outright
   [ALL PLACEHOLDER]. Ties into GDD §8's mob-type table (normal/elite/boss
   exist as design; elites/bosses are content-pass data).
3. **The chain metric** — sustainable **kills per hour over a chain including
   modeled regeneration and downtime**, not per-fight efficiency. A facetank
   bot may nearly tie a single fight but pays per-kill resource loss through
   downtime over the chain — this *is* the attrition model, measured.
4. **Per-level-bracket runs** with level-typical builds vs level-typical
   mobs — because auras scale with skill points, facetank-optimality can
   *return* at higher levels even if it's beaten at level 5; the harness must
   catch that regression automatically.

**Dependencies discovered:**

- **The chain model needs the E-decisions as inputs:** downtime = f(passive
  regen curve (E4), personal recovery cooldown (E2), time-at-fire (E1)). The
  harness can ship with placeholder recovery models, but tuning thresholds
  before E4's curve exists would tune against a fiction.
- **Implementation gap that would falsify the measurement:** player passive
  regen is **not combat-gated today** — `model/player/update.go:17-33`
  regenerates whenever `0 < Health < max`, in combat too (GDD §3 says
  out-of-combat only). A facetank bot currently heals *while tanking*; the
  gate must land before thresholds mean anything. (Details in §2.E4.)
- Mob tiers as data (elite/boss loadouts) are content-pass material; the
  harness needs at least synthetic tier archetypes earlier.

**Verdict: aligned — refined decision; extend the documented harness spec and
make the harness an explicit roadmap bullet with the regen-gate prerequisite.**

### 2.E Recovery & attrition (E1–E8)

**E1 — no instant recovery.** Fits the rhythm/attrition intent and the
role-design pillar (group rotation as intended reward is explicitly
sanctioned). **Conflict with shipped code + content:** the Heal cooldown
(`api/skills/heal-cooldown.json`, id 21, milestone L2) is an **instant**
`self_heal` restoring 20% + 5%/level of max HP on a 30 s cooldown — and GDD
Appendix A.3 blesses it as "the only path to self-healing". A 20–30% instant
combat heal is arguably combat sustain, not "recovery" — but the constraint
needs a recorded boundary: **nothing instant may fully or near-fully restore;
out-of-combat resource reset is always time-based.** Whether the L2 Heal stays
instant-partial (combat tool) or becomes recovery-over-time is a design call to
make when recording E1; the `skills.Buffs` store makes a HoT payload cheap
(the inverse of the shipped dot — step 4 material). **Verdict: aligned with
one boundary to define; supersedes the unspoken assumption that self-heal is
instant.**

**E2 — early personal recovery cooldown.** Fits (solo substitute for
sit-and-eat; keeps solo viable without eroding group value since group
rotation only saves cooldown waiting). Mild tension to reconcile in the GDD:
Appendix A.3 sources the Heal Magic cooldown from a **clue anchor** (troll
territory), while E2 wants a personal recovery cooldown **early and
guaranteed** (milestone-like — the shipped Heal is already milestone L2).
Cleanest reading: the early guaranteed skill is the *recovery* cooldown
(E1-compliant, over-time); clue-sourced heal magic can be a stronger/different
variant. **Delightful synergy found:** a "mini-campfire" version is nearly
free — the chunk-1 totem machinery (owned, stationary, TTL'd, aligned summon)
plus a heal aura *is* a placeable personal fire, and it even respects "heal
auras never heal the caster" (GDD §4): the **totem** is the caster, so healing
its owner is legal by the letter of the rule. Caveat: a totem is a mob entity,
and mobs can't cast heal auras until the mob-depth chunk 7/8 support-heal
limitations are lifted (`plan-skill-system.md` flags; `sys/skills.go`
`healCaster`) — so the mini-campfire shape lands **after** chunk 7/8.
**Verdict: aligned; direction decided, theme open; content-pass authoring on
systems that mostly exist.**

**E3 — feast aftereffect buff.** Correctly framed as open. The constraint is
real and worth recording verbatim: a regen buff persisting into combat is
pre-fight healing, stacks with heal auras, and eats the attrition being built
elsewhere in this bundle. All three recorded options (breaks on damage /
out-of-combat only / non-healing buff) are implementable on the shipped
`skills.Buffs` store; "breaks on damage" would be the first
removed-by-event buff (small new trigger). **Verdict: open question —
record with constraint.**

**E4 — passive OOC regen model.** Fits GDD §3 ("slow passive regeneration
outside of combat") and sharpens it with the classic declining-with-level
model plus two well-spotted cautions (single resource = one knob steers
everything; ~20 s pain-threshold reference). **Two implementation findings:**
(1) as noted under D, player regen is **not combat-gated** — and players have
no in-combat concept at all (mobs do; players need a small recent-damage—
window flag, which the death/recovery work wants anyway). (2) The current
rate is a flat fraction: `healthGainTick: 0.00033`/tick of max HP
(`conf.default.json`) ≈ 1%/s ≈ 100 s zero-to-full at any level — "declining
proportionally with level" is not expressible in the current config shape
(one global fraction) and will interact with the not-yet-implemented
`f(character level)` inflation; the harness (D) is the tuning instrument.
**Verdict: aligned; direction decided; one small code gap (combat gate) +
tuning deferred to the harness.**

**E5 — respawn only at fixed world campfires.** Fits the hand-built-world /
environmental-storytelling pillar (respawn locations belong to the world) and
protects both the walk-back penalty and boss encounters from corpse-zerging.
**Refines, does not contradict:** GDD §3 "respawn at the last visited
campfire" never said *whose* campfire; roadmap step 3's campfire death-respawn
note (dwell N s in the fire aura to set the point) likewise doesn't
distinguish — and GDD §4's Base Auras list contains **Campfire-Build**, so
player-placed fires are anticipated content and the exclusion must be
explicit or it will be violated by default. One phrasing correction (noted in
§1): the walk-back is not the *only* death penalty — GDD §3 also keeps the
XP-within-level loss. **Verdict: aligned — decided; sharpen three places
(GDD §3, roadmap step 3, backlog item 9).**

**E6 — revive as rare high-level ability.** **Verification result:** the GDD
sketches Revive only as a bare name in the §4 Base Auras example list —
no mechanics, no Appendix A entry. So E6 is less "confirm the sketch" and
more "write the entry": rare, high-level, the social answer to dying deep
(walk back or be brought back), deliberately made valuable by the *absence*
of player respawn points (E5) — the two decisions are one package. Fits the
role-design pillar exactly ("filling roles is essential, not optional").
Depends hard on E7. **Verdict: aligned — decided direction; needs its GDD
entry + a new effect type eventually (an effect targeting a dead player is
expressible in no current effect type).**

**E7 — death state.** The concrete system change; current instant-despawn
inventory:

- **Mobs:** death → `MobSystem` removes the entity the same tick
  (`sys/mob.go:81-82`, `onMobDeath` → `RemoveEntity`); the spawn point
  schedules the respawn. No corpse exists for even one tick.
- **Players:** `sys/state.go:114-134` — health 0 → Obituary message, XP loss,
  progression+skills stashed (`carriedState`), **entity removed immediately**,
  client becomes a **spectator at the death spot**. Client side: Obituary →
  end screen (`user-interface/end-screen/EndScreen.ts`, still
  Berryhunter-flavored "you survived N days" text); re-join happens when the
  player clicks play again (`NextJoin`, `sys/state.go:86`) → respawn at a
  random position.
- So a *client-side* wait-until-respawn window already exists (the end
  screen), but there is **no server-side dead body** — nothing a revive
  ability could target, and other players see the character vanish.

What the change touches: **(server)** a dead-player representation at the
deathspot (an entity or a state flag on a kept entity — it must stream via the
viewport, be faction-inert, non-colliding, and carry "revivable by X" later),
respawn triggered by an explicit client message rather than implicitly by
re-join, mob corpses with a short despawn timer [PLACEHOLDER] — note the
cheap alternative for mobs: **client-only corpse fade** (EntityManager keeps
rendering a removed mob briefly) costs no server state and suffices for
corpse *readability*; a server-side mob corpse is only needed if future
mechanics interact with it — decide the tier when scoping. **(wire)** an
entity state (dead) or new entity type + the respawn request message.
**(client)** corpse rendering, and the end screen becomes a death overlay
with a Respawn button (also the natural home for the roadmap item-12 death
tutorial hook, which already assumes "how death works, where you respawn").
Size: small-to-medium, concentrated in the same `sys/state.go` flow the
step-3 campfire-respawn work must rewrite anyway. **Verdict: aligned —
decided; bundle with step 3's death-flow surgery.**

**E8 — single-charge respawn fires.** Correctly *not* decided. Record in the
backlog only, with the E5 tension noted (it is a deliberate self-limiting
exception, banned near boss/elite areas). **Verdict: future content idea —
capture, don't evaluate further.**

### 2.F Solo combat geometry (analysis to preserve)

**The analysis, condensed for the GDD:** with two center-anchored circles,
every solo encounter reduces to one variable — center distance. If the
player's aura radius exceeds the mob's, an annulus exists where the player
hits and the mob doesn't; **every point inside that annulus is equivalent**,
so raw geometry offers nothing to hold. Earned stillness requires
distinguishable positions; differentiation must come from things that **move,
narrow, or texture the ring**: (1) mob movement patterns — with the recorded
caution that a slower, straight-chasing mob makes ring-riding = walking
backwards, which is *correct and boring*; countermeasures: telegraphed
lunges, arc pursuit, ground zones denying the retreat corridor; (2) tick
timing (A); (3) two-zone auras (B).

**Fit:** this is the sharpest justification yet written for the no-targeting
pillar's risk profile (the "idle game" line) and belongs in the GDD as
durable rationale — future design reviews should not have to re-derive it.

**Code contact points:** the ring-riding regime is *live today* — chase holds
the mob at the player's aura edge (`chaseIntoAuraMargin`), the shipped Rabbit
flees (chunk 2), and the deliberately-just-under-player mob speeds (Rabbit
0.044 vs player 0.05/tick) already implement "walking backwards works". The
countermeasure vocabulary (lunge = a mob dash; arc pursuit = a steering
variant; ground zones = the burning-ground idea in
`plan-effect-foundations.md` §1) maps onto planned machinery but none of it
is scheduled — record as content-era mob-behavior vocabulary
(plan-mob-depth §6 note), don't grow the current 9-chunk scope.

**Verdict: aligned — preserve in GDD §4 combat-pacing subsection.**

---

## 3. Implementation plan

### 3.1 Idea → roadmap step map

| Idea | Lands in | Dependencies / prerequisites | Scope impact on planned steps |
|---|---|---|---|
| Docs recording (everything decided above) | now (docs-only pass) | review of this doc | none — the point is to record before the affected steps start |
| C decision | **before step 3 starts** | this §2.C; no code needed to decide | (b) deletes item 6 + the spike (step 3 shrinks a lot); (c) defers it; (a) *grows* step 3 by the mob-AI LoS-awareness item |
| No-progress leash rule (from §2.C — no-regrets under every option) | step 2 (mob depth, current step — small chunk-3 extension) or early step 3 | chunk 3 (done, verification pending) | small addition to a shipped chunk; closes live wall-cheese |
| F behavior vocabulary (lunge, arc pursuit, ground zones) | content pass (step 6) authoring + effect types as needed (step 4 for ground zones) | mob-depth chunks 4–5 (movement seams) | none now — recorded as vocabulary, not scheduled chunks |
| E7 death state (+ E5 world-campfire respawn) | **step 3** (bundle with the already-placed campfire death-respawn — same `sys/state.go` surgery) | campfires as stateful entities (step 3); wire + client death overlay | step 3 scope grows by the death state; do the death-flow rewrite once, not twice |
| E4 combat gate for player regen | step 3 (with the recovery bundle) or step 2 tail — small either way | a player in-combat flag (recent-damage window; the same concept D needs) | small; **must precede the harness thresholds** |
| E1/E2 recovery-over-time payloads (HoT / channel; personal recovery cooldown mechanics) | **step 4** (skill-vocabulary fill) | `skills.Buffs` (shipped); E1 boundary defined; mini-campfire *shape* additionally needs mob-heal lifts (step-2 chunks 7–8) | step 4 gains the HoT payload + possibly a channel/cast primitive — note cast-time+interrupt is *already* step-4 scope (Recall), so recovery channels ride it |
| E6 revive effect type | step 4 or 5 (after E7 exists) | death state (step 3) | new effect type + "dead player" target capability; the *ability* is content (step 6) |
| A tick-readability wire + minimal indicator | wire design in step 3/4 window (cheap, small); minimal functional indicator **before content-pass balancing** | tick cadence determinism (shipped); solve together with ⚑ buff-visibility wire + `Skills.ts` metadata debt | roadmap item 8 gains the named aura-VFX pass; content pass gains the mob-tick-rate authoring rule |
| A full VFX polish (indicator as part of the aura VFX/animation pass) | step 8 | minimal indicator proven earlier | item 8 checklist +1 |
| B per-effect range check | step 3 (campfire is the first consumer) | none (sensor already max-sizes) | absorbed into planned campfire work |
| B two-zone content + second ring radius | content pass (step 6) + the A/B wire design | per-effect range check; wire design | small |
| D harness with chain/bracket/tier metrics | explicit bullet **before step 6** (pre-content, per TDD §4.1's existing placement) | E4 gate + E1/E2/E4 recovery models (placeholder-acceptable, tune later); synthetic elite/boss archetypes | harness scope grows from 4 metrics to the chain model + brackets + bot tiers; f(character-level) tuning still rides it |
| E3 feast | design decision whenever; content in step 6 | `skills.Buffs`; possibly a breaks-on-damage trigger (small, step 4) | none until decided |
| E8 single-charge fires | backlog | — | none |

### 3.2 Dependency chains (the ones that impose order)

1. **C decision → step 3 shape.** Step 3 is next after the current mob-depth
   step; its first half is the LoS spike. Deciding C late means either doing
   a spike that (b)/(c) would discard, or stalling the step.
2. **E7 death state → E6 revive → revive content.** No corpse, no revive.
   Death state also unblocks the death-tutorial hook (item 12).
3. **E5 + E7 together in step 3.** Both rewrite the same death flow
   (`sys/state.go`); the campfire tracker is already scheduled there.
4. **E4 combat gate → D thresholds.** Measuring facetank efficiency while the
   bot heals in combat tunes the wrong game.
5. **E1/E2/E4 recovery models → D chain metric → content-pass balance.** The
   chain metric needs *a* recovery model early (placeholders fine) and the
   real curves before thresholds are declared met.
6. **A minimal indicator → tick-dodge tuning.** Balancing mob tick rates for
   dodge-ability (content pass) before players can *see* ticks tunes blind.
7. **B range check → two-zone content**; the campfire provides the range
   check for free.

### 3.3 Suggested order of actions

1. **Now:** review this doc → apply the §1 docs pass (GDD/TDD/roadmap/backlog
   edits, pillar list, risk record). Optionally slip the no-progress leash
   rule into the current mob-depth step (it is chunk-3-adjacent and closes a
   live exploit).
2. **Before step 3:** make the C decision (a/b/c) — it defines step 3's
   scope. Prepare the A/B wire design question (tick phase + second radius +
   buff visibility as one decision) so it can land wherever step 3/4 touches
   the wire anyway.
3. **Step 3 (reshaped):** [per C decision: spike + occlusion, or neither] +
   darkness/light + campfires + campfire death-respawn **+ E5 world-only
   constraint + E7 death state + E4 combat gate**.
4. **Step 4:** recovery-over-time payloads (E1/E2) riding the already-planned
   cast-time+interrupt primitive; revive effect type (E6); ground-zone effect
   type if F's vocabulary is wanted for the content pass; E3 trigger if
   decided by then.
5. **Before step 6:** build the harness with the D metric set; run brackets;
   tune E4's curve and the tier thresholds.
6. **Step 6 (content pass):** author against all of it — mob tick rates
   (slow/readable per A), two-zone auras (B), tier thresholds as acceptance
   criteria (D), personal recovery cooldown + feast content (E2/E3), revive
   ability (E6), respawn-campfire placement per zone (E5).
7. **Step 8:** the full aura VFX/animation/polish pass, tick indicator
   included (A's mechanism finalized here).
