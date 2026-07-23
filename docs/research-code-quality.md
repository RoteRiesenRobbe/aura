# Code Quality Assessment — Redundancies, Unclear Paths, Hygiene

> **Status: informational only.** Written 2026-07-06 as a point-in-time code
> review of the current state (post item 11 Phase 3, commit `2fe0a43f`). Scope:
> the new skill-system core (`sys/skills.go`, `skills/`, `model/player`,
> `model/mob`, `sys/targeting.go`), the wiring layer (`core/game.go`), and the
> frontend hot spots (`Character.ts`, `VitalSigns.ts`), plus `go vet` and a
> tsconfig check. This is not a work order — nothing here blocks item 12;
> per-finding triage is at the end.
>
> **§7 is a second pass, 2026-07-22** (post playtest-1, commit `f1c03481`). It
> records which §1–§6 findings closed, one new finding, and three cheap fixes.
> For anything still open, **§7's table supersedes §6's**.

---

## Verdict up front

This is two codebases in one. The **new Aura-era code is genuinely good** —
data-driven with hard-fail validation, derived-not-stored state, small
purpose-built interfaces, tests pinning the tricky invariants. The **legacy
Berryhunter substrate is rough** — not vet-clean, no TS strict mode, and
carrying a growing layer of half-dead survival/item code. One actual
copy-paste bug was found (diagnostics-only, no gameplay impact; both §2
findings fixed 2026-07-06).

Grading roughly: skills/targeting/model layer **A−** (deductions: the
`EffectDef` triple bookkeeping and the two-convention level scaling); legacy
substrate **C+** (functional and stable, but hygiene-poor and littered with
vestigial systems). Nothing is architecturally scary; the risks are all of the
"grows quietly until it bites" kind.

## 1. What is genuinely good (keep doing this)

- **Validation philosophy** — `skills/definition.go` hard-fails at load on
  anything that would be a silent no-op (variance on a non-rolling effect,
  resist fields on non-resist effects, empty/duplicate tags). Exactly right
  for a content-driven game: designers get errors at boot, not mystery
  behavior in play.
- **Derived, never stored** — `SpentPoints()` / `TotalSkillPoints()` /
  `AvailableSkillPoints()` are recomputed on demand, so free respec cannot
  drift. Same for player `MaxHealth()`. Textbook single source of truth.
- **Interface segregation** — `skillEntity`, `healCaster`, `slowable`,
  `resistBuffable`, `healthRatioer` are minimal consumer-defined interfaces
  (idiomatic Go). "Mobs can't heal" is a type-level fact, not a runtime
  surprise.
- **Comments explain *why*** — including rejected alternatives and known
  limitations. Rare and valuable; keep it up.

## 2. Actual bugs (diagnostics-only, but they lie exactly when debugging)

- **FIXED (2026-07-06, second attempt)** — **`core/game.go:452` —
  `ByPriority.Less` compared `b[i]` against itself** (the second
  `Prioritizer` type-assert read `b[i]` where it must read `b[j]`). Every
  comparison was `pi < pi` = false → the sort was a no-op. ⚠️ **The original
  "diagnostics-only, no gameplay impact" assessment was wrong**, and the
  first fix (correcting the comparator) caused an in-game regression:
  `ecs.World.Systems()` returns the world's **live** internal slice — the
  exact slice `World.Update` iterates, kept sorted **descending** by priority
  (engine execution order). While `Less` was broken, `printSystems()`'s
  `sort.Sort` on that slice was a harmless no-op; with a working comparator
  it re-sorted the live execution order **ascending at boot, reversing the
  tick order** — observed in-game as floating damage numbers and aura-hit
  VFX rendering only intermittently (transient per-tick state reset/encoded
  in the wrong order relative to SkillSystem). **Actual fix:** `printSystems`
  logs `Systems()` as-is (the engine already maintains execution order) and
  `ByPriority` is deleted — it was only ever a broken, wrong-direction
  duplicate of the engine's own sort. Pinned by
  `TestPrintSystems_DoesNotChangeExecutionOrder` (`core/game_test.go`), which
  fails on any future mutation of the live slice.
- **FIXED (2026-07-06)** — **`core/game.go:413` — overload percentage was
  integer division.** `dtMillis / stepMillis * 100` truncated (`dtMillis` is
  `int64`, `33.0` converts to it), so a 60 ms tick printed "100%" instead of
  ~180%. The overload warning systematically understated load. Extracted to
  `overloadPercent()` with multiply-before-divide; pinned by
  `TestOverloadPercent_NoTruncationTo100`.

## 3. Avoidable redundancies (DRY findings)

1. **`EffectDef` triple bookkeeping** (`skills/definition.go`). Every new
   effect field must be added in three places: the private JSON struct
   (~line 220), the domain struct (~line 124), and the 30-field hand-written
   copy in `mapToEffectDef` (line 433). Phases 2 and 3 each grew all three.
   The fat-struct pattern itself is a fine KISS call (the code comment already
   anticipates a future split), but the field-by-field copy is pure
   mechanical duplication. A shared embedded struct for the ~25 fields whose
   JSON form equals the domain form would collapse the mapping to only the
   fields that genuinely transform (Type, Selector, HitStyle, TickInterval,
   DamageTags).
2. **FIXED (2026-07-07)** — **The level-scaling formula was written out 13
   times** (the original count of ~8 missed the three radius sites, the
   `recomputeDerived` resist arm, and `selfHealHP`'s fraction). All now go
   through generic `skills.Scaled(base, perLevel, level)`
   (`skills/scaling.go`); per-field floors stay at the call sites since they
   differ (none / 0 / 1 / uncapped-sentinel). Pure refactor, pinned by
   `TestScaled`; the full suite was the regression net.
3. **FIXED (2026-07-07)** — **Two level-scaling conventions inside
   `recomputeDerived`** unified on the standard formula (plan Option A):
   `stat_multiplier`'s single `additivePerLevel` field (× level) became the
   paired `statBonus` + `statBonusPerLevel` (`base + (L−1)×perLevel`), the
   tenth `Scaled` caller. Value-preserving content migration (`0.05` →
   `0.05/0.05` in swift/tough-passive.json). Because `json.Unmarshal` drops
   unknown keys silently, a `stat_multiplier` with no scaling authored (both
   fields 0) now hard-fails at load — that guard catches any stale
   `additivePerLevel` key. Stat fields on non-stat effects hard-fail too
   (mirrors the variance/resist guards). Pinned by
   `TestDerivedStats/base_and_perLevel_scale_independently`,
   `TestMap_StatMultiplierNoScalingFails`,
   `TestMap_StatFieldsOnNonStatEffectFails`. **The item-12 authoring rule is
   now one sentence: every leveled value is `base + (level−1) × perLevel`.**
4. **Duplicated eligibility closures in `sys/skills.go`** — the
   `targetsPlayers`/`targetsMobs` filter appears nearly identically in
   `applyPlayerDamageAura` (line 154) and `applyResistAura` (line 294). Same
   pattern in miniature: the duplicate empty/dup-tag validation loop in
   `mapDamageTags` vs `mapResistFields`.
5. **`core/game.go`'s six `addXxx` methods** are the same loop-over-systems
   type-switch six times, guarded only by the comment "if you add something
   here, you might want to edit codec too." Partly the ECS library's shape,
   but registration-by-manual-enumeration in seven places (six adders + the
   codec) is the most error-prone extension point in the backend.
   `addPlaceableResourceEntity` even admits being a 100% copy of
   `addPlaceableEntity`.
6. **Frontend/backend skill registry duplication is compounding** (already
   tracked in CLAUDE.md): `Character.setActiveSkill` (`Character.ts:311`) now
   hardcodes three special-case skill IDs for ring styles
   (`PALADIN_AURA_SKILL_ID`, `HEAL_AURA_SKILL_ID`, `FIRE_WARD_SKILL_ID`), and
   every new support aura grows that condition. The ring style is starting to
   look like it wants to be data (a category/flag on the wire or in the
   registry), not code. Revisit alongside the already-planned Skills.ts
   sync decision.

## 4. The half-dead legacy layer (the main "unclear path")

Block 2 removed survival *gameplay*, but the corpse is still warm in several
places — a new reader cannot tell what is load-bearing without archaeology:

- `model.PlayerVitalSigns` still has `Satiety` and `BodyTemperature` fields,
  set to `vitals.Max` once at spawn (`model/player/player.go:65`) and never
  read again.
- Frontend `VitalSigns.ts` still models satiety as a vital sign;
  `Character.createStatusEffects` still builds a `Freezing` effect
  (`Character.ts:200`).
- The full item/equipment/crafting scaffolding in `Character.ts`
  (`equipItem`/`unequipItem`, `PLACEABLE` slots, `craftingIndicator`,
  hand-swing animations keyed to equipped items) is live code for a system
  CLAUDE.md says is scheduled for removal.

The "don't proactively rename Berryhunter" rule is sensible, but there is a
difference between legacy *naming* and legacy *load-bearing-looking dead
code*. When the item-system removal happens, this should go in the same
sweep; until then it is the main source of unclear paths.

## 5. Hygiene gaps (legacy code, mostly)

- **`go vet` is not clean**: unreachable code in `phy/box.go:41,66` and
  `chieftain/server/handler.go:73`; unkeyed `phy.Vec2f` struct literals in
  `spectator.go`, `codec/client_message.go`, `gen/generator.go`,
  `sys/cmd/cmd.go`. All legacy, all trivial, and nothing in the workflow
  enforces vet (consistent with the CI gaps in `research-v1-readiness.md`).
- **TypeScript runs without strict mode** — `noImplicitAny` is literally
  commented out in `frontend/tsconfig.json`; property-injection hacks like
  `message['timeToLife']` (`Character.ts:453`) exist. Retrofitting full
  strict is a big job; the pragmatic move is stopping the `any` bleed in new
  files (or per-path strictness) rather than a big-bang conversion.
- **Three logging styles in the backend**: `slog` (new code),
  `log.Printf`/`log.Fatalf` (`model/mob/mob.go`, `sys/skills.go`), and raw
  `fmt.Printf` for the overload warning in the game loop. Converge on `slog`
  opportunistically.
- Small stuff: hardcoded mob velocity `0.055` with its TODO
  (`model/mob/mob.go:130`); `levelForExperience` re-derives the whole XP
  table with nested loops on every XP grant (`player.go:452–478`) — O(level²)
  but harmless at current scale.

## 6. Triage

| Finding | Effort | When |
|---|---|---|
| `ByPriority.Less` bug + overload division | minutes | ~~anytime~~ **DONE 2026-07-06** (test-first, `core/game_test.go`; NB the naive comparator fix regressed tick order in-game — `ByPriority` deleted instead, see §2) |
| `go vet` findings (unreachable code, unkeyed literals) | ~1 h | anytime; ideally wire `go vet` into CI with the test run |
| Level-scaling helper (`scaled(...)`) | ~1 h | ~~opportunistic~~ **DONE 2026-07-07** (`skills.Scaled`, see §3.2) |
| Two scaling conventions in `recomputeDerived` | decision needed | ~~before/with item 12~~ **DONE 2026-07-07** (unified on `base + (L−1)×perLevel`, see §3.3) |
| `EffectDef` embedded-struct refactor | ~half day | next time an effect field is added |
| Eligibility-closure dedup | ~1 h | opportunistic |
| `addXxx` registration table | design sketch first | when the next entity type is added |
| Ring style as data | with Skills.ts sync decision | when the skill list grows |
| Resource/decay layer — **fully dead**, no coupling | one chunk ~1–2 h | anytime; **evidence §9, inventory `backlog.md` §26** |
| Survival/vitals/equipment remnants (incl. the unread item registry) | scoped sweep | with the planned item-system removal |
| TS strictness for new code | policy decision | soon, cheap to start |

---

## 7. Re-assessment 2026-07-22 (post playtest-1, commit `f1c03481`)

Second pass, same scope plus the content pipeline and CI. Headline: **the "two
codebases in one" split from §-verdict has largely healed.** The legacy layer
§4 called "the main unclear path" is gone, and the frontend/backend duplication
§3.6 flagged as *compounding* was solved structurally rather than patched.
Backend grade moves **A− → A−/A** (deduction now hygiene, not design);
frontend **C+ → C+** (unchanged: it works, but nothing gates it).

Verified this pass: `go build ./...` clean, `go test -count=1 ./...` **exit 0
across 50 packages** in seconds.

### 7.1 Closed since 2026-07-06

- **§3.1 `EffectDef` triple bookkeeping** — restructured, not merely deduped:
  `mapToEffectDef` is now "shared core plus exactly one per-type payload"
  (`damageParams()`, `healParams()`, `resistParams()`, … `definition.go:947+`).
  The 30-field hand copy is gone. Better than the embedded-struct fix proposed.
- **§3.4 duplicated eligibility closures** — collapsed into the generic
  `eligibleByTargetFlags[Capability any]` (`sys/skills.go:433`), now the single
  predicate behind damage/resist/shield/hot/dot.
- **§3.6 ring style as data + Skills.ts duplication** — both resolved, and the
  *pattern* is the valuable part: category rides the wire (`aura_category`) and
  the client fetches the server's **parsed** registry over `GET /skills` /
  `GET /mobs`. All eight `*_SKILL_ID` constants and the three hand-maintained
  `Skills.ts` maps are deleted. **This is now the house answer for any new
  frontend/backend content duplication — serve a catalog, don't mirror a table.**
- **§4 the half-dead legacy layer** — fully swept. Zero hits for
  `Satiety`/`BodyTemperature` in Go, zero for `Freezing`/`satiety` in the
  frontend. The `chieftain` package is gone.
- **New since the last pass, worth keeping:** `validateEffectKeys`
  (`definition.go:851`) is a **per-effect-type key allowlist with rename hints**
  — an unknown or stale field in a skill JSON fails the boot naming the field
  and its replacement. That single function kills the most common authoring bug
  class, and is why the JSON pipeline can be trusted without a schema.

### 7.2 Still open from 2026-07-06 (re-verified, unchanged)

- ~~**§5 `go vet` is still not clean**~~ **CLOSED 2026-07-22 (with §7.4):**
  all findings fixed — the two `phy/box.go` unreachable returns removed, every
  unkeyed `phy.Vec2f`/`model.Cheat` literal keyed (12 sites; four *more* had
  appeared since this pass was written — `codec/client_message.go:86`,
  `core/input.go:163`, `sys/mob.go:59,63` — proving the point that nothing
  enforced vet). `go vet ./...` is zero-finding and now gates CI.
- **§5 three logging styles** — 24 `log.Printf`/`log.Fatalf` + 5 `fmt.Printf`
  remain alongside `slog`.
- **§3.5 the six `addXxx` registration methods** — still eight near-identical
  type-switch loops in `core/game.go`, still the most error-prone backend
  extension point.

### 7.3 New finding — `gameObjectClasses` is a positional array (highest severity)

> **FIXED 2026-07-22, same day** — implemented exactly as proposed below:
> `Record<AuraApi.EntityType, GameObjectClass>` keyed by the generated enum.
> Verified: deleting one entry makes `tsc` fail with TS2741 ("Property
> '[EntityType.FireTotem]' is missing"), and `npm run typecheck` runs in CI.
> `manual-content-authoring.md` §Known hand-sync points updated.

`frontend/.../incoming/GameStateMessage.ts:305` maps wire entity types to
render classes as a **74-entry array indexed by position**, whose only safety
mechanism is the comment `Has to be in sync with AuraApi.EntityType`.

**Verified in sync as of 2026-07-22** (74 array entries ↔ 74 enum members,
`FireTotem` = 73 aligns), so this is a *latent* risk, not a live defect. But it
is the only place in the repo where a plausible edit — inserting an enum member
anywhere but the end — silently reassigns the artwork of **every mob after it**,
with no build error, no test failure, and no runtime warning. It is also the
one content type that still requires touching three places (JSON + `.fbs` +
frontend), so it gets exercised often.

**Concrete fix:** the FlatBuffers compiler already emits a *named* enum at
`api/schema/js/aura-api/entity-type.ts`. Replace the array with a
`Record<EntityType, GameObjectClass>` keyed by those members — TypeScript then
enforces exhaustiveness, and position stops mattering. Half a day at most, and
it permanently removes the highest-consequence silent-corruption seam we have.
(`manual-content-authoring.md` §"Known hand-sync points" documents this seam;
it should point here once the fix lands. That section is also **stale on
`Skills.ts`** — those maps no longer exist, see §7.1.)

### 7.4 ⭐ Three small fixes — recommended next, cheap, high leverage

> **ALL THREE LANDED 2026-07-22, same day, as one batch** (plus the §7.2 vet
> cleanup so #1's vet gate could be enabled): CI runs `go vet` + `go test`
> before the goreleaser step and `npm run typecheck` before the frontend
> build; `gameObjectClasses` is enum-keyed (§7.3); `tsconfig.json` `include`
> is `./src/**/*` (the dead `old-structure` entry removed — full-tree
> typecheck came up clean, so the stale include was hiding nothing).

Called out together because each is hours-not-days and each protects work
already paid for. Two are **restatements of open items in
`research-v1-readiness.md`** (§1/§2 there) — listed here only so the three are
actionable as one batch; that doc remains their home.

| # | Fix | Effort | New here? |
|---|---|---|---|
| **1** | **Add `go test ./...` (and `go vet ./...`) to `.github/workflows/build.yaml`.** CI currently runs goreleaser + `npm run build` and *never executes a test*. ~22k lines of tests and the deterministic `simharness` guardrail suite are defended by nothing but local discipline. | ~3 lines | no — `research-v1-readiness.md` §1/§2, still open |
| **2** | **Key `gameObjectClasses` by enum member instead of array position.** | ~half day | **yes** — see §7.3 |
| **3** | **Add `"typecheck": "tsc --noEmit"` to `frontend/package.json`, fix the stale `include`, run it in CI.** There is no typecheck or lint script at all today (no ESLint config either); `tsc` is invoked ad-hoc by hand. **Newly noticed:** `tsconfig.json`'s `include` still lists `./src/old-structure/**/*`, **a directory that no longer exists** — so typecheck coverage is whatever is transitively reachable from `src/index.ts`, and anything outside that graph is checked by nobody. | ~1 h | partly — the gap is in `research-v1-readiness.md` §2.4; the stale `include` is **new** |

Doing 1 and 3 first makes 2 (and everything after it) verifiable.

### 7.5 Metrics for the next pass to diff against

| Measure | 2026-07-22 |
|---|---|
| Backend prod / test LOC | 22,687 / 21,768 (**~0.96:1**) |
| Go packages | 50, all green uncached |
| Frontend TS LOC | 18,937 (+6 stray `.js`, 18 `: any`) |
| `TODO`/`FIXME`/`HACK`/`XXX` in prod code | **27** across ~41k LOC |
| `Berryhunter` refs in backend Go | **0** |
| Content JSON | 83 skills · 50 mobs · 12 factions · 10 recipes · 10 items · 5 props |
| Largest single file | `sys/skills.go` **1,594 lines / ~40 funcs** |

Two of these are the ones to watch. `sys/skills.go` is the complexity sink — a
flat dispatch that grows with every new effect type; it is readable today and
should **not** be refactored pre-emptively, but it is where the next structural
pressure will show up. And the ~0.96:1 test ratio is only worth what CI makes
of it, which today is nothing (§7.4 #1).

## 8. Focused pass 2026-07-24 — `sys/skills.go` (§7.5's prediction, checked)

Single-file review prompted by a code-health question ("skills.go is very large
— is it in bad shape?"). **Full findings live in `backlog.md` §25**; this
section records only the verdict and what it means for §7.5's watch item.

**Verdict: the size is warranted; §7.5's advice stands unchanged.** 1594 lines
resolve to **1009 code / 460 comment / 125 blank**, 47 functions, exactly one
over 100 lines. It is the single execution point for **19 of the 22
`EffectType`s** (the other three are passives resolved elsewhere), so ~30 code
lines per effect applier. No god-function, no architectural problem.

**The growth curve is the feature curve, and it is flattening.** Born
2026-06-29 at 57 lines; **+1400 in the 16 days** of the effect-vocabulary
build-out (through `3e9ab8e4`, `tick_rate` — the last effect type added), then
**+137 in the 10 days since**. So the complexity sink is filling up as designed
rather than compounding. Keep it in the metrics table; do not act on it yet.

Four mechanical cleanups (~70 lines, no behavior change) and four hardcoded
balance constants are recorded in §25, plus one latent gap worth naming here
because it belongs to this doc's lineage:

- **§3.4's residual.** `eligibleByTargetFlags` closed the flag-gated
  duplication (§7.1), but heal and hot auras carry a *bespoke* implicit-ally
  predicate deliberately left outside that seam — and it is now duplicated
  verbatim between `applyHealAura:716` and `applyHotAura:815`. The generic seam
  fixed the general case and the exception quietly re-grew. Worth remembering as
  a pattern: **an "intentionally excluded from the shared helper" comment is a
  duplication forecast.**
- **`applySlowAura:1544` has no faction eligibility at all** — the one aura path
  skipping both the faction check and the `mayHarm` hostility gate. Unreachable
  today (no mob authors a slow aura; players implement no `ApplySlow`), and its
  own comment says so, but it is **pinned by nothing but that comment**. Same
  shape as §7.3's `gameObjectClasses` finding: latent, not live, and dangerous
  precisely because the failure is silent. Now also flagged in
  `manual-content-authoring.md` §Factions, where an author would meet it first.

Nothing in this pass changes the §7 grades or the §7.4 priorities.

## 9. Focused pass 2026-07-24 — the resource/decay layer is fully dead

Prompted by a PO observation during the §24 review: *"'resources' in their
former Berryhunter sense no longer exist in the game and are not intended to
come back. The same goes for decaying."* Traced statically the same day.
**Confirmed — and this is the first §4 item that turns out to be fully dead
rather than half-dead.** Full removal inventory lives in `backlog.md` §26;
this section records the verdict and what it changes for §4/§5/§6.

**Verdict: both are dead, and resources are actively *unusable*.** The
constructor cluster (`NewPlaceableResource` → `NewPlaceable` /
`NewStaticEntityWithBody` → `NewResource`) is a closed loop with zero entry
points, including from tests. Every live `AddEntity` passes a prop, mob, NPC,
player, spectator, corpse or minion — campfires, the one plausible consumer,
are **mobs**. And `determineResourceEntityType` panics for every stock item
except `"Berry"`, which no longer exists on disk: the path cannot execute
against current content even if something called it.

`DecaySystem` is registered and ticks 30×/s over a permanently empty slice —
its sole `AddDecayable` call site sits inside the unreachable
`addPlaceableEntity`.

**What this changes for the doc's lineage:**

- **§4 gets its first clean amputation.** The section's framing — *"a new
  reader cannot tell what is load-bearing without archaeology"* — is exactly
  right, and here the archaeology has now been done. The vitals/equipment
  remnants in §4 remain *half*-dead (still referenced, still rendering);
  resource/decay is the subset that is wholly severed and can go without a
  design decision attached.
- **§6's "Survival/vitals/equipment remnants | scoped sweep | with the planned
  item-system removal" row splits in two.** The resource/decay half no longer
  needs to wait for the item-system removal — it has no coupling to it. The
  item *registry* half does (see §26's "adjacent" note: `game.Items()` has zero
  callers, but unpicking it touches `model.Game` and the frontend item
  scaffolding).
- **§5 gains one entry retroactively:** `gen/generator.go` appears in the `go
  vet` unkeyed-literal list, and the whole `gen` package is inside the dead
  cluster — so that vet finding is deleted rather than fixed by §26.

**The trap worth recording, because it is the kind that survives a careless
prune:** props ride the *resource wire path* — `case model.PropEntity` marshals
via `PropEntityFlatbufMarshal` but sends `eType = AnyEntityResource`
(`plan-world-zones.md` §3.2 decision B). The `AnyEntityResource` enum and the
frontend's 624-line `Resources.ts` are load-bearing; only the server-side
`model.ResourceEntity` *implementation* is dead. Anyone grepping for "resource"
and deleting what matches will break every prop in the world. Same lesson as
§7.3 and §8's `applySlowAura`: **the dangerous findings in this codebase are
the ones where the name and the load-bearing-ness have come apart.**

Metrics note for §7.5's next diff: §26 would remove ~760 backend+frontend lines
and 9 content JSON files, drop Go packages 50 → 49 (`gen` disappears), and take
`core/game.go` from 471 to ~440 while deleting 2 of its 8 `addXxx` helpers and
1 of the 16 registered systems.

## 10. Focused pass 2026-07-24 — `model/mob/mob.go`, `sys/mob.go`, `skills/definition.go`

Companion pass to §8, same prompt one step wider ("the other two big files —
do they carry smells too?"). **Full findings live in `backlog.md` §27**; this
section records the verdict and the findings that belong to this doc's lineage.

**Verdict: `skills/definition.go` is the strongest code in the backend, and the
two large files carry structural debt but almost no defects.** Both bugs the
pass found are in `sys/mob.go` and `model/mob/mob.go`'s *seeding*, not in the
1334- and 1418-line bodies everyone would suspect — and the worst of them lives
in `sys/mob.go`, the **smallest** file reviewed at 187 lines. That inversion is
the pass's headline: **size predicted nothing here**, exactly as in §8.

- **⚠️ One live bug, reproduced** — `MobSystem.Update` (`sys/mob.go:99`) removes
  dead mobs *inside* `for _, mob := range n.mobs`, and `game.RemoveEntity` →
  `ecs.World.RemoveEntity` → `MobSystem.Remove` is **synchronous**, shifting the
  backing array under the live range loop. Every tick in which a mob dies, one
  surviving mob is **skipped** and another is **updated twice**. Details, repro
  output and the nine sibling systems to check are in §27.1. First code-behavior
  bug found since §2's `ByPriority.Less` — and it has the same signature: a
  *diagnostics-shaped* symptom (a single-tick mob stutter, indistinguishable
  from netcode jitter) hiding a real one.

- **⚠️ A second bug, by PO ruling** — `NewMob` seeds each mob's RNG from its
  entity ID alone (`mob.go:150`), and `ecs.NewBasic()` counts from 1 each
  process, so a fresh server rolls the **same HP variance and the same first
  drop for the Nth spawn point on every restart**. Recorded first as a design
  question; **PO ruled it a bug on 2026-07-24 — rolls must be random per run,
  the same mob must not drop the same skill after every restart.** Fix and its
  two constraints (independent per-mob streams; the sim harness needs its own
  explicit seed) are in §27.2.2. Worth noting *as a code-quality finding* and
  not just a balance one: the defect is a **hidden coupling to a global
  counter** in a third-party library — nothing at the call site suggests
  `Basic().ID()` is a deterministic sequence rather than an opaque handle.

- **§7.3's pattern has a third instance.** `mapToEffectDef`'s 15-case switch
  (`definition.go:975`) has **no `default:`**, so an `EffectType` registered in
  `effectTypeMap` but forgotten in the switch parses *successfully* into an
  `EffectDef` with every payload pointer nil — violating the invariant the
  struct's own doc comment claims parsing enforces. That now makes three:
  `gameObjectClasses` (§7.3, fixed), `applySlowAura`'s missing faction gate (§8),
  and this. **The house lesson from §9 restated: the dangerous findings in this
  codebase are the silent ones — a wrong result that no build, test or log
  reports.** All three were one-line-to-half-day fixes whose value is entirely in
  making the failure loud. This one is literally one line.

- **Guard coverage is uneven where guards are the whole point.** `definition.go`
  hard-fails a `dot` with no damage, a `shield` with no pool and a
  `stat_multiplier` with no scaling — but loads a `damage_aura` that deals 0, a
  `heal_aura` that heals 0, and **any aura with `radius: 0`**. The convention was
  established mid-build, and the two oldest payloads predate it (§27.3.2). Worth
  naming here because §7.1 credits `validateEffectKeys` as "why the JSON pipeline
  can be trusted without a schema" — that credit stands, and this is the gap in it.

Nothing in this pass changes the §7 grades or the §7.4 priorities. For §7.5's
metrics table next pass: `model/mob/mob.go` (1418 l) is the **second**-largest
file after `sys/skills.go` (1594 l), and unlike skills.go its growth pressure is
in *state* (a ~45-field struct spanning eight concerns while behavior is already
split across seven files), not in dispatch — a different refactor when it comes,
and equally not yet.
