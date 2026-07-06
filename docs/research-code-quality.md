# Code Quality Assessment — Redundancies, Unclear Paths, Hygiene

> **Status: informational only.** Written 2026-07-06 as a point-in-time code
> review of the current state (post item 11 Phase 3, commit `2fe0a43f`). Scope:
> the new skill-system core (`sys/skills.go`, `skills/`, `model/player`,
> `model/mob`, `sys/targeting.go`), the wiring layer (`core/game.go`), and the
> frontend hot spots (`Character.ts`, `VitalSigns.ts`), plus `go vet` and a
> tsconfig check. This is not a work order — nothing here blocks item 12;
> per-finding triage is at the end.

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
2. **The level-scaling formula is written out ~8 times**: `effectDamageHP`,
   `effectHealHP`, `effectResistFactor` (`sys/skills.go`),
   `effectiveTickInterval`, `effectiveMaxTargets` (`sys/targeting.go`),
   `EffectiveCooldownTicks`, `EffectiveRadius` (`skills/component.go`), and
   inline in `applySlowAura`. Each is `base + (level−1)×perLevel` with a
   per-case floor. One `scaled(base, perLevel, level)` helper would make the
   convention un-divergeable.
3. **Two level-scaling conventions inside `recomputeDerived`**
   (`skills/component.go:202` vs `:214`): `stat_multiplier` scales as
   `AdditivePerLevel × level`, while `resist_passive` directly below uses
   `base + (L−1)×perLevel` like every other effect. Both are documented, but
   a designer authoring JSON must know which formula applies per effect type.
   **This is a content-authoring trap for item 12** — worth either unifying
   or calling out loudly in whatever authoring reference the content pass
   uses.
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
| Level-scaling helper (`scaled(...)`) | ~1 h | opportunistic, next time the formula is touched |
| Two scaling conventions in `recomputeDerived` | decision needed | **before/with item 12** (authoring trap) |
| `EffectDef` embedded-struct refactor | ~half day | next time an effect field is added |
| Eligibility-closure dedup | ~1 h | opportunistic |
| `addXxx` registration table | design sketch first | when the next entity type is added |
| Ring style as data | with Skills.ts sync decision | when the skill list grows |
| Survival/vitals/equipment remnants | scoped sweep | with the planned item-system removal |
| TS strictness for new code | policy decision | soon, cheap to start |
