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
| Survival/vitals/equipment remnants | scoped sweep | with the planned item-system removal |
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

- **§5 `go vet` is still not clean** — `phy/box.go:41,66` unreachable; unkeyed
  `phy.Vec2f` literals in `spectator.go:11`, `player.go:47,807`,
  `mob.go:168,642,646`, `cmd.go:78`. The chieftain site went with the package,
  but **new sites have appeared** — consistent with nothing enforcing vet.
- **§5 three logging styles** — 24 `log.Printf`/`log.Fatalf` + 5 `fmt.Printf`
  remain alongside `slog`.
- **§3.5 the six `addXxx` registration methods** — still eight near-identical
  type-switch loops in `core/game.go`, still the most error-prone backend
  extension point.

### 7.3 New finding — `gameObjectClasses` is a positional array (highest severity)

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
