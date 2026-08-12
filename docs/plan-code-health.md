# Plan: Code Health Pass - deletions, duplication closure, live defects, drift pins

**Status: designed 2026-08-12, nothing built.** Sources: a three-sweep audit of this
date (frontend magic numbers · cross-layer duplicated constants · frontend structural
debt), `research-code-quality.md` §11.5 (whose recommended batch is absorbed here as C7,
verified still fully open on 2026-08-12), and the standing gotchas in `CLAUDE.md`.
File:line references are pinned to the working tree of 2026-08-12 (HEAD `f820777e`);
re-verify before editing if much has landed since.

## What changes and why

This pass is prophylaxis, not features: it removes code nobody should ever restyle,
collapses duplications that force every future change to be made N times, fixes the
handful of things that are measurably wrong today, and pins the cross-layer value
mirrors that currently drift silently. The selection criterion throughout: **things we
will certainly have to touch soon** (the parked UI polish items, the font swap, the
dialogue rework) **and things whose failure mode is silent**.

**Ownership boundaries, explicit so plans don't fight over files:**

- This plan owns **structure**: tokens exist, mixins exist, duplicates are collapsed,
  values are pinned or derived. It does NOT own visual decisions. What panels look
  like stays with `plan-ui-polish.md` (§Deferred); which font and every size retune
  stays with `plan-ui-font.md`. Every UI chunk here is behaviour-neutral: the rendered
  game looks the same after as before, and that IS the acceptance criterion.
- The boot-once / no-teardown singleton architecture is **`plan-leaving-the-world.md`'s
  lane** (backlog §52), not a chunk here. The audit's offender ranking is recorded
  here for that plan to pick up: the hard blocker is `Events.ts:106-263` (~40
  module-level event singletons, ~13 of them `OneTime*` that latch `wasTriggered` and
  warn-and-refuse a second `trigger()`; `OneTimePayloadEvent` also caches its payload
  forever, and none of the ~50 `.subscribe()` sites ever unsubscribes); then
  `Game.ts:50` `export let instance: Game` (one reference retains the whole Pixi
  scene and both GL contexts); then `HUD.ts`'s 37 module-level DOM caches populated
  once at partial render (same pattern smaller in `Journal.ts`/`Conversation.ts`/
  `CharacterSelect.ts`). The `Skills.ts`/`Mobs.ts`/`Quests.ts` catalog fetches at
  import are already re-runnable (`loadXCatalog()` clears and refetches) and need
  nothing.
- `research-code-quality.md` stays the assessment lineage; its §11.5 items are
  **executed here** (C7) and their closure should be recorded back in that doc's style
  (a strikethrough + pointer), not duplicated.

## The standing rule: how a value crosses a boundary

The audit's biggest pattern: the repo has four tiers of cross-layer value handling and
the failures cluster entirely in the bottom one. Adopted as the house hierarchy; every
mirror this plan touches is ranked against it, and new code should be too:

1. **Derive in code.** If both values live in the same language, one is computed from
   the other (`INPUT_TICKRATE = SERVER_TICKRATE`; MapFog's cell size from
   `PIXEL_PER_METER`). Cheapest and strongest: drift is impossible.
2. **Read from content / catalog.** The server serves what it runs; the client reads
   it (`GET /skills`, `DarknessOverlay` requiring `campfire-aura.json`). The house
   answer for content-shaped data since plan-ui-polish chunk 1.
3. **Pin via `api/shared-constants.json` + twin tests.** For true cross-language
   constants that can't be served (wire sentinels, physics factors). The machinery
   exists and is proven; a pin is ~6 lines per side.
4. **A bare "SYNCED WITH BACKEND" comment.** Banned. The audit found one of these
   provably false (`BASE_MOVEMENT_SPEED`) and one stale (`HUD.mobile.less:454`'s
   phantom z-index 95). Every comment of this shape this plan meets gets upgraded to
   tier 1-3 or deleted.

## Decisions (PO 2026-08-12, via choice prompts)

- **D1 - stepMillis gets fixed, in this plan** (over record-only). Own chunk (C3),
  refereed by the simharness guardrails.
- **D2 - the §11.5 backend batch is absorbed** (over frontend-only or keep-separate).
  It is exactly the "already wrong today" class this plan exists for, and six days as
  an informational finding moved nothing.
- **D3 - theme tokens get the full pinned pair** (Theme.ts + variables.less + a test
  binding them), not a LESS-only consolidation. The shared-constants pattern applied
  to UI.

**Plan calls (not PO rulings - made while writing this doc, flagged here for review):**

- **D4 - utility cast times are pinned (tier 3), not served (tier 2).** A `/utilities`
  endpoint for three deliberately-outside-the-catalog entries (ascension D1) fails
  KISS/YAGNI; the rejected alternative is recorded here so nobody re-litigates it.
- **D5 - `INPUT_TICKRATE` is a tier-1 derive, not a pin.** Same language, same file;
  `INPUT_TICKRATE = SERVER_TICKRATE` with the pinned constant as the single source.

## Chunks

Execution order: **C1 first** (it makes everything after it verifiable and deletes
what later chunks would otherwise have to work around). C2/C3/C7 are independent of
each other and of C4-C6; slot them anywhere after C1. **C4 before C6** (C6 uses the
pin machinery C4 exercises), **C5 before or with C6** (the mixins land on code the
health-bar extraction has already touched). One chunk per session, per working style.

---

### C1 - Gates + the dead-code sweep (pure removal, behaviour-neutral)

The acceptance criterion is that nothing observable changes.

**Step 1, before anything else: add `npm test` to `.github/workflows/build.yaml`**
(next to the existing `npm run typecheck`, line ~69). ~2 lines. 235+ vitest tests
including the client half of every shared-constants pin currently run nowhere in CI;
every pin later chunks add is defended by nothing until this lands.
(`research-v1-readiness.md` §1/§2 lineage; called the highest-leverage line in
`research-code-quality.md` §11.5 #1.)

**Deletions** (verify zero importers with grep before each; typecheck is the net):

- `frontend/src/features/rating/` whole: `Rating.ts`, `rating.less` (155 lines),
  `rating.html`, `ratingOnlySocials.html`. Zero importers; `EndScreen.ts:10` records
  the retirement.
- Dead survival-era blocks in `HUD.less` (~320 of 1845 lines): `#inventory`
  (~:149-208), `#crafting` (~:292-298), `.clickableItem`/`.craftableItem`
  (~:239-291, :304-471), and the three keyframes `red-flash`/`green-flash`/`bounce`
  referenced only from inside the dead blocks. No `.html` or `.ts` produces this DOM.
- `frontend/src/features/common/logic/UtilsTest.ts` (pre-vitest relic, executes
  asserts at module scope, zero importers).
- `frontend/src/features/map/logic/EMiniMapLayer.ts` if still the 0-byte file
  `research-code-quality.md` §11.3 F4 found.
- `BasicConfig.ts:94-98`: the unused `BACKEND.LOCAL_URL`/`REMOTE_URL` block, already
  marked "TODO unused, can be deleted?".
- `Urls.ts`: **scope to the branch, not the function.** Delete the
  localhost-to-`local.berryhunter.io` rewrite (`:14-21`) and the never-used
  `developmentPort = '2015'` (`:23`, applied `:39`). The surrounding wsUrl-derived
  hostname/origin derivation is load-bearing for the deployed server; keep it.
  Verify both flows after: a local run with the standard `?wsUrl=` URL, and a
  reasoning pass over the deployed start-URL path (no `?wsUrl` on prod).

**Doc fix in the same sweep:** `.claude/skills/add-content/SKILL.md` is stale in ways
that actively misdirect: it warns about the `Skills.ts` triple map (deleted; the
catalog fetch replaced it, plan-ui-polish C1) and calls `gameObjectClasses` positional
(it is an enum-keyed `Record`, compile-checked, since 2026-07-22). Refresh the pin
line refs too (`registry_test.go` ~:168, `recipe_test.go` ~:168).

⚑ **The §9 trap stands during any deletion here:** props deliberately ride the
Resource *wire* path (`codec/gamestate.go`, `Resources.ts` is load-bearing). No
grep-and-delete of anything "resource"-shaped.

- **Schema impact: NONE.**
- **Verify:** `npm run typecheck` · `npm test` · prod build · `go build ./...`
  (untouched, but cheap) · verify-skill headless smoke green · grep shows zero
  references to every deleted symbol · CI run green with the new test step.

---

### C2 - Already-wrong-today frontend fixes (small, each test-first)

1. **`SkillTooltip.ts:32` `TICK_MS = 33`** becomes `BasicConfig.SERVER_TICKRATE`.
   `BasicConfig.ts:99-134` documents 33 as the rejected value; every tooltip duration
   is currently 1% short. Red-first vitest on a formatted duration.
2. **`Utilities.ts`: `UTILITY_NAMES` knows `Ascend`, `UTILITY_CAST_SECONDS` doesn't**,
   and the tooltip (`:64`) indexes the latter guarded by the former: a latent
   TypeError. Fix the table AND add a vitest asserting the two tables have identical
   key sets, so the next utility can't reopen the gap. (The values themselves get
   pinned in C4; this chunk just closes the shape mismatch.)
3. **`BasicConfig.ts:38` `BASE_MOVEMENT_SPEED`** carries `0.055` under a "SYNCED WITH
   BACKEND" comment; that is the MOB default (`model/mob/mob.go:110`, deliberately not
   the player's `0.05`, landmine L1 of plan-entity-model). The constant feeds
   `Camera.setMaxSpeed(movementSpeed * 2)` via `Character.ts:81`.
   ⚑ **Check the flight consumer BEFORE changing the value:** flight moves at 2.8×
   walk speed (PO-tuned), which exceeds `2 × 0.055` already, and lowering to `0.05`
   lowers the camera ceiling further. Establish how the camera tracks a flyer today
   (separate path? clamp that never engages?) and only then fix the value; otherwise
   this correctness fix ships a camera-lags-flight regression. Whatever the outcome,
   the false "SYNCED" comment is replaced per the standing rule (tier 3 pin in C4, or
   an honest "mob default, chosen because X" comment if the 0.055 turns out to be
   deliberate headroom).

- **Schema impact: NONE.**
- **Verify:** vitest red-first for 1+2 · `npm run typecheck` · prod build · in-game:
  hover a cooldown tooltip (durations), walk + fly with the camera watched (3).

---

### C3 - The server's dt: `stepMillis` (backend, lockstep with sim)

`core/game.go:505` hands `stepMillis = 33.0` to every ECS system via
`World.Update`, while the loop ticks at `time.Second / constant.TicksPerSecond`
= 33.333 ms (`game.go:349-357`, `constant/const.go:7`). The client found, fixed and
documented this exact rounding bug (`BasicConfig.ts:99-111`, "Move the CLIENT, never
the server"); the server twin was never touched.

**Step 1 is an inventory, and it decides the chunk's size:** find what actually
consumes the dt argument. Most of this codebase is tick-counted (`CastTicks`,
`TickAccumulator`, per-tick regen fractions), not dt-integrated, so the blast radius
may be near zero; the inventory determines whether this is a two-line fix or a
mini-retune. Record the consumer list in the ledger either way.

**The fix shape:** derive, don't restate (tier 1): `1000.0 / constant.TicksPerSecond`
(or a `constant.StepMillis` next to `TicksPerSecond`), so the mirror class dies with
the bug. ⚑ **`sim/world.go:29-30 + :193` mirrors the constant and must change in the
same commit**, or the guardrail suite referees against a stale twin and reports false
drift. `tickstats.go:68` (budget) and the overload-percent math move with it.

- **Schema impact: NONE.** No conf key, no wire change.
- **Verify:** simharness guardrail suite (TTK/TTD) before/after with the diff
  reported to the PO (expected: within noise if the inventory says tick-counted) ·
  `go test -count=1 ./...` · `-race` on the core packages · boot 0 WARN/0 ERROR ·
  a play-feel sanity pass only if the guardrails move.

---

### C4 - The pinning batch (kill the silent-divergence class)

Every item ranked against the standing hierarchy. Tier-1 derives first (cheaper and
stronger than pins):

- `BasicConfig.ts:111` `INPUT_TICKRATE = SERVER_TICKRATE` (D5). The pinned constant
  becomes the single source; the comment block explaining the 10% eviction stays.
- `MapFog.ts:52` `CELL_SIZE` and `_GameObject.ts:17-21` `TELEPORT_SNAP_DISTANCE_PX`
  derive from `PIXEL_PER_METER` (import, don't restate; the snap becomes
  `1.5 * PIXEL_PER_METER` with the comment kept).
- Go-internal: `combatRegenGraceTicks = 100` exists twice (`model/mob/mob.go:1328`,
  `model/player/player.go:271`), same concept, both [PLACEHOLDER]. One shared
  constant (natural home: `model/constant` or a small shared file both packages
  already import), so players and mobs cannot get different combat-drop windows from
  a half-retune.

Tier-3 pins, `api/shared-constants.json` + twin tests (`SharedConstants.test.ts` /
`cmd/aurad/shared_constants_test.go`), ~6 lines per side each:

- **`pointsPerMeter: 120`** - Go `codec/minions.go:3` `Points2px` ↔ TS
  `BasicConfig.ts:10` `PIXEL_PER_METER` (the two survivors after the derives above).
  The factor that puts every entity at the wrong world scale if it ever splits.
- **`utilityCastTicks`** (D4) - `skills/utility.go:46-57` (Recall 300 / Camp 150 /
  Ascend 300) ↔ `Utilities.ts` `UTILITY_CAST_SECONDS`. Two unit systems today (ticks
  vs seconds); pin in ticks, derive seconds client-side from the pinned tickrate.
- **`deactivateAuraSlot: -2`** - `model/input.go:15` ↔ `InputMessage.ts:17`. A
  FlatBuffers-default workaround that can never be a schema value; drift makes
  deactivation a silent no-op.
- **`playerColliderRadius: 0.25`** - `model/player/player.go:25` (bare literal) ↔
  `Graphics.ts:26-31` (a "SYNCED" comment today).

Exhaustive-test pins (the `Skills.test.ts:16-28` `ActivationRejection` template,
which itself replaced a drifted bare mirror):

- **`StatusEffect`**: `BackendConstants.ts:8-13` joins the generated FlatBuffers enum
  to `StatusEffect.ts` classes by identifier SPELLING through a dynamic lookup;
  TypeScript cannot see it, and a schema rename silently kills that visual. Add a
  vitest iterating `AuraApi.StatusEffect` asserting every member resolves, and
  resolve the orphan `'Hit'`/`ResourceHit` entry (no schema counterpart: evidence of
  one past drift; delete it or document why it exists).
  (= `research-code-quality.md` §11.3 F2.)
- **`ApiErrorCode`**: the 17 refusal-code strings, verbatim twins in
  `accounts/respond.go:20-37` ↔ `AccountsApi.ts:22-45` (`'network'` stays
  client-only by design). Pin the list in shared-constants with twin tests; a
  renamed code currently degrades every branch to the generic error path.
  (= §11.3 F3.)

Sweep item while in these files: every remaining bare "SYNCED WITH BACKEND" comment
gets upgraded to name its pin or derive, per the standing rule.

- **Schema impact: NONE** (DB none, wire none; `shared-constants.json` is a test
  fixture, not runtime content).
- ⚑ `api/` edits do NOT invalidate the Go test cache: run `go test -count=1` on the
  twin-test packages or a stale green hides the break (measured twice, see
  CLAUDE.md).
- **Verify:** both twin suites red-first (temporarily falsify one side) then green ·
  `npm test` + `go test -count=1 ./...` · typecheck · prod build.

---

### C5 - Frontend duplication closure (the components polish will touch)

1. **The overhead health bar**: `Character.ts:329-378` and `Mobs.ts:500-545` are
   near-verbatim twins sharing eight magic values (width/height clamps, backdrop
   `0x000000/0.6`, border `0xffffff/0.35`, fill `0xaa3b3b/0.9`, shield
   `0x7dc3ff/0.75`, pip offset); only the vertical anchor differs. `Mobs.ts:541`
   admits it ("mirrors Character.initHealthBar; the two overhead bars share no
   base"). Extract one shared builder (anchor as parameter); `EffectPips.ts:101`
   shares the backdrop constant. The single highest-value extraction in the audit:
   any future bar restyle is otherwise done twice or half-done.
2. **Cast bar + flight bar onto `VitalSignBar`**: `HUD.ts:174-186` and `:274-298`
   hand-roll what `VitalSignBar.ts` already is, with hand-cached elements
   (`HUD.ts:75-80`) and even a different sizing mechanism (`width` vs the
   component's `scale`). Three progress-bar implementations become one.
3. **`EntityManager`'s duck-typed dispatch** (`EntityManager.ts:78-117`,
   `isFunction(gameObject['setLevel'])` string lookups): a rename silently reverts
   every mob plate to catalog level, no compile error, no test. Replace with narrow
   interfaces (`setMobId`/`setLevel`/`setTier`/`setAuraCategories`...) so a rename is
   a compile error. (= §11.3 F1; the third recurrence of the `gameObjectClasses` seam
   class, so the fix pattern is established.)

- **Schema impact: NONE.**
- **Verify:** behaviour-neutral criterion: nameplates, health/shield bars, pips,
  cast bar mid-channel and flight bar mid-flight all render pixel-identical
  (before/after screenshots via the verify harness) · `npm test` (new unit tests on
  the extracted builder's clamp math) · typecheck · prod build · PO glance in-game.

---

### C6 - Theme foundation: the pinned token pair (D3)

The structural half of every parked UI item. **No visual change**: same colors, same
sizes, same stacking; the chunk only moves their definitions to one place each.

1. **`variables.less` becomes real** (10 lines today, for ~5000 lines of LESS):
   promote the `@panel-*` block from `HUD.less:780-789` (declared mid-file where
   `accountScreens.less`'s 20 raw font-sizes and `startScreen.less` can't see it);
   add the brand color (`#E37313`, 19 CSS sites in 8 files today), the level-up gold
   (`#ffd75e`, 15 sites incl. six hand-typed fade ramps), the recurring scrims
   (`rgba(0,0,0,.6/.85/.9)`, `rgba(255,255,255,.2/.25)`), and a z-index scale
   (`HUD.mobile.less:48`'s `@mobile-menu-z` + arithmetic is the model; the stale
   ":454 desktop sets 95" comment dies here). Fix the two `@backgroundColor`
   bypasses (`userInterface.less:298`, `accountScreens.less:354`) as the smoke test
   that tokens are load-bearing.
2. **`.panel-chrome()` / `.panel-header()` mixins**: the journal/help/worldMap/
   conversation header+title+close blocks are 4× hand-copies (journal and help
   byte-identical modulo prefix; `HUD.less:829` already says "the four panel titles
   are one treatment"), and the panel body chrome is pasted five times. The dialogue
   rework would otherwise add copy #5.
3. **`client-data/Theme.ts`**: the TS-side tokens for the colors that provably live
   in both languages (brand: `MapCampfires.ts:55`, `Player.ts:178`,
   `_GameObject.ts:292`; gold: `Player.ts:214`; the health-bar family from C5's
   extracted builder). Both encodings from one definition (numeric for Pixi, string
   for CSS-in-TS). `AURA_CATEGORY_COLORS` stays in `AuraRings.ts` (it is gameplay
   semantics, already the audit's "good pattern", and moving it grows the chunk for
   no drift reduction); `Theme.ts` may re-export it.
4. **The pin**: a vitest that reads `variables.less` and asserts the Theme.ts values
   appear as the variable definitions (the `TestFlightViewportScale_MatchesTheClient`
   mechanism, TS-side this time). Cross-language color drift then fails the suite
   instead of shipping.
5. Also folded in, same files: the tooltip/health-bar crimson coupling
   (`SkillTooltip.ts:62-66` ↔ `vitalSigns.less:75`) gets a token; the tooltip
   placement literals (`SkillTooltip.ts:941-949`) move to CSS custom properties so
   spacing is tunable from the sheet.

**Explicit non-goals** (they belong to the UI plans): no font work of any kind
(`plan-ui-font.md` owns the root-font-size decision and the swap), no new panel look,
no spacing-scale retune, no `HUD.less` file split (worth doing but it maximizes merge
pain for zero drift reduction; revisit after the polish pass).

- **Schema impact: NONE.**
- **Verify:** before/after screenshots of every themed surface (HUD, journal, help,
  map, conversation, start screen, account screens, mobile via device emulation)
  pixel-compared · the new pin test red-first (falsify one side) · `npm test` ·
  typecheck · prod build · PO in-game glance.

---

### C7 - The absorbed backend batch (research-code-quality §11.5, D2)

All re-verified still open 2026-08-12. Each test-first; effort per item is 1-2 h.

1. **B1**: reserve the `deleted_` name prefix in `auth.ValidateCharacterName`
   (`credentials.go:28` reserves only `hrnss_` today). A squatted `deleted_<id>`
   name 500s soft-delete forever, and the same collision inside
   `DiscardAnonymousAccount` is swallowed to a warn: an account the player was told
   is abandoned survives. One condition + tests.
2. **B4**: `harnessdb`'s `refuseRemoteDatabase` (`cmd/harnessdb/main.go:95-112`)
   no-ops on keyword/value DSNs (`url.Parse("host=prod-db ...")` yields empty
   `Hostname()`, which the guard reads as loopback). Two-line scheme check, plus the
   package's FIRST test file (it is the only untested security guard in the tree).
3. **B2 - re-verify, then fix if live**: the shape at `accounts/characters.go:201`
   still returns without writing `AnonymousSecret` when `issueSession` fails after
   the transaction committed (account on disk, key to it never delivered), but the
   backlog §46 auto-signin rework changed the semantics around it; re-derivation is
   the chunk's first step. If live: deliver the secret in the body even when session
   issuance fails.
4. **B3**: `simharness -serve` silently ignores every `-xp-kill-*` flag
   (`main.go:84-95` defines them; `serve(...)` at `:185` receives no XP model). Seed
   the served page from the flags or refuse the combination with an error naming the
   flags. ⛔ research doc: fix before any future xp pass drives the explorer.

- **Schema impact: NONE** (B1 is code-side validation; no migration; the `deleted_`
  rename convention itself is unchanged).
- **Verify:** `go test -count=1 ./...` · store/accounts tests against
  `AURA_TEST_DB_URL` via `make -C backend db-test` (⛔ never aimed at `aura`) ·
  `-race` on accounts/store · for B3, a `-serve` boot with flags set shows them in
  the page (or refuses).

---

## Test strategy (cross-chunk)

- Every fix chunk is red-first: falsify one side of a pin, watch the twin suite
  fail, then fix. Behaviour-neutral chunks (C1, C5, C6) invert the criterion: the
  pass is that nothing changed (screenshots, smoke output, guardrail numbers).
- `go test -count=1` whenever `api/` (incl. `shared-constants.json`) was touched;
  the content-edit cache landmine is measured, not theoretical.
- The known-inconclusive set (CLAUDE.md §Known-inconclusive: `TestDwell` flake,
  `chunk3-charm` 6-8/9, `filler-batch` leg 1, `chunk3b-ii` 28/34) is red at HEAD
  before this plan starts; measure before diagnosing, and do not burn sessions on
  them as if they were regressions from this work.
- CI after C1 gates vet + go test + typecheck + **npm test** + builds; every later
  chunk's pins are then actually defended.

## Open questions

None blocking. Two in-chunk determinations were deliberately left to their execution
sessions rather than decided here: C2's flight-camera outcome (fix value vs document
deliberate headroom) and C3's dt-consumer inventory (which decides whether the fix is
two lines or a mini-retune). Both are findings-first, with the PO looped in if the
guardrails move.
