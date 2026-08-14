# Plan: Code Health Pass - deletions, duplication closure, live defects, drift pins

**Status: C1-C5 SHIPPED - C1 2026-08-12 (`ca34800b`) · C2 2026-08-13, PO-verified in-game 2026-08-14 (`beeba7c0`) · C3 2026-08-14 (`6f0c08df`) · C4 2026-08-14 (`b5a88221`) · C5 2026-08-14 (`[uncommitted]`, ledgers below) - C6-C7 open (C7 independent; C5's "before or with C6" ordering is satisfied).** Sources: a three-sweep audit of this
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

> ⛔ **REVERSED by PO ruling 2026-08-12 - NO CI BY CHOICE.** The step shipped,
> and the push revealed Actions has never run on this fork (zero runs ever); the
> PO ruled CI stays off unless it becomes a genuine necessity. The step was
> rolled back the same day; see the C1 ledger below. The pins later chunks add
> are defended by the **local** `npm test` / `go test` in every chunk's verify
> tail, which is the project's actual gate.

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
- ~~CI after C1 gates vet + go test + typecheck + **npm test** + builds~~ ⛔
  **NO CI BY CHOICE (PO 2026-08-12)** - Actions is disabled on the fork and stays
  so unless it becomes a necessity. Every chunk's pins are defended by the local
  verify tail (`npm test`, `go test -count=1`), run before any banner is written.

## Chunk ledgers

### C1 - Gates + the dead-code sweep ✅ 2026-08-12, `ca34800b`

**Shipped exactly the plan's list, plus three grep-proven extensions.** CI gained the
`test-frontend` step (`npm test`, its own step after typecheck so a failure attributes
cleanly; `npm install` persists from the typecheck step) - **then step 1 was REVERSED,
see the ruling paragraph at the end of this banner.** Deleted: `features/rating/`
whole (6 files incl. both star SVGs) · `UtilsTest.ts` · the 0-byte `EMiniMapLayer.ts` ·
`BasicConfig.ts`'s unused `BACKEND` block · HUD.less lines 148-471 (324 lines,
1845 → 1521) · `Urls.ts`'s localhost→`local.berryhunter.io` rewrite and
`developmentPort` (branch-scoped as planned; `getUrl` and the wsUrl-derived
`catalogUrl`/`apiUrl` stay). The vitest baseline was run BEFORE any deletion: 287/287
green, so nothing red could be attributed to the sweep later.

**The three extensions, each proven dead by grep before cutting:**

- The HUD.less span is contiguous 148-471, slightly wider than the plan's literal
  ranges: it includes the `.bounce` rule (:235-237, no DOM produces the class) and the
  `#crafting, #inventory { display: none }` hider (:298-302, pointless once both IDs
  are gone).
- The three `hintedCraftMask*.svg` assets - referenced only from the deleted
  `.craftableItem` block; orphaned by the cut, so they go with it.
- `socialMedia.less`'s whole `&.horizontal` block: only rating's own HTML produced
  that DOM, **and its `socialLink-rating-bounce` keyframe lived in the never-imported
  `rating.less`**, so the animation was already a silent no-op in the shipped bundle.
  (LESS keyframes are global only if the defining file reaches the bundle - a
  cross-file animation reference is exactly the tier-4 drift class this plan hunts.)
  The live `vertical` variant (start screen) keeps its keyframe in `startScreen.less`.

**The Urls.ts reasoning pass the plan required** (deployed start-URL path, no
`?wsUrl`): a deployed page has no port, so `port` is `''` before and after, and the
hostname was never `localhost`, so the deleted rewrite never fired there -
byte-identical. Dev with `?wsUrl` is unchanged (the override wins). The one behaviour
change is strictly a fix: an `aurad -dev` boot on :2000 *without* `?wsUrl` used to
derive the broken `ws://local.berryhunter.io:2015/game`; it now derives
`ws://localhost:2000/game`, which is correct.

**SKILL.md (add-content) refresh:** the `Skills.ts` triple-map bullet now says "no
client-side edit, the catalog is fetched" (plan-ui-polish C1 reality);
`gameObjectClasses`'s failure mode flipped from "silent desync" to "compile error"
(it is an enum-keyed `Record`, tsc-enforced - that flip is the point of the fix); pin
refs refreshed (`registry_test.go` :168, `recipe_test.go` :168, both verified); the
stale "keep Skills.ts counts consistent" line deleted.

- **Schema impact: NONE.** Backend untouched (`go build ./...` green anyway).
- **Verified:** typecheck clean · vitest **287/287 before AND after** · prod build
  compiles (the 3 standing bundle-size warnings only) · boot 0 WARN / 0 ERROR
  (95 skills / 68 mobs / 13 quests) · `ctxloss-warning.mjs clean` **PASS** (0 warnings,
  0 console errors - the boot-path harness, and Urls.ts is boot path) · repo-wide
  greps show zero references to every deleted symbol · harness residue cleaned
  (`harnessdb -cleanup`, aurad stopped first).

⛔ **Step 1 REVERSED same day - NO CI BY CHOICE (PO ruling 2026-08-12).** The
push after `ca34800b` revealed the repo has **ZERO workflow runs ever**:
`build.yaml` is registered and "active", but Actions is disabled on the fork
(GitHub's fork default), so the whole CI pipeline - vet, go test, typecheck,
builds, the binding-drift check - has never executed once. Asked whether to
enable it, the PO ruled the other way: **CI stays off unless it becomes a
genuine necessity** (the natural revisit is roadmap step 9, ops readiness, or
real pain from the second contributor's unverified pushes; the known
`TestDwell` flake would also have to be fixed first or the badge cries wolf).
The `test-frontend` step was removed again; `build.yaml` is back at its pre-C1
state and remains inert. The 287 vitest tests are defended by the **local
verify tail every chunk runs** - which is and remains the project's actual
gate.

### C2 - Already-wrong-today frontend fixes ✅ 2026-08-13, `beeba7c0` · PO in-game pass 2026-08-14

**All three items shipped, red-first where the plan asked.** Unlike the structure
chunks, C2 is deliberately **not** behaviour-neutral: every tooltip duration string
getting ~1% longer IS the deliverable. Line refs below are the working tree of
2026-08-13.

**1 - TICK_MS.** `SkillTooltip.ts`'s private `TICK_MS = 33` now derives from
`BasicConfig.SERVER_TICKRATE` (tier 1; that constant is itself pinned to
`shared-constants.json`'s `ticksPerSecond`, so the tooltip joins the existing pin
chain and the client is down from two copies to one). Red-first with three
hand-computed guards (300 ticks = "10s", 90 = "3s", and 40 = "1.33s" for the
non-multiple-of-30 case), which failed at "9.9s"/"2.97s"/"1.32s"; then the ~30 stale
expectations across `SkillTooltip.test.ts` were **recomputed from their authored tick
counts, never copied from the vitest diffs** (copying actual→expected would
rubber-stamp whatever the code does). Most durations became round numbers - itself
confirmation, since authored tick counts are multiples of 30. One survivor worth
naming: "0.53s" (16 ticks) renders identically under both tick lengths.

**2 - the utility twin tables.** `UTILITY_CAST_SECONDS` gained
`Ascend: 10` (mirroring `utility.go`'s `CastTicks: 300`), and the new
`Utilities.test.ts` pins the two tables to identical key sets - red-first, failing on
the missing kind 3 - so the next utility cannot reopen the latent
TypeError (`utilityTooltip` indexes the cast table guarded only by the names table).
Both tables are now exported for the test. ⚑ **Ledger finding:** if an Ascend tooltip
ever renders (today no button does), the hardcoded "(interrupted by damage or
movement)" suffix is wrong for it - Ascend deliberately authors **no** damage
interrupt (ascension P7: walking away is the only out). Recorded as a comment on the
entry; not fixed, since the surface is unreachable.

⚑ **Infra rider:** `Utilities.test.ts` is the first vitest whose module graph reaches
the generated FlatBuffers bindings, which live in `../api/schema/js/` - outside
`frontend/`, from where node resolution cannot find the `flatbuffers` package.
`vitest.config.ts` now carries the same `flatbuffers` alias `webpack.common.js` has
always carried for exactly this reason. Any future test importing AuraApi rides it
for free.

**3 - BASE_MOVEMENT_SPEED, and the flight-camera determination the plan deferred to
this session: the value gets FIXED** (`meter2px(0.055)` → `meter2px(0.05)`), it was
a stale copy, not deliberate headroom. The evidence, recorded per the plan:

- **Flight cannot regress:** `Camera.update()` hard-follows while airborne
  (`Camera.ts:85-99` snaps the Vehicle's position and zeroes its velocity), so the
  `setMaxSpeed(movementSpeed × 2)` ceiling never engages in flight at all - the
  plan-flight-paths C3 comment says exactly why.
- **Walking has ~4× headroom:** on-screen walk is ~180 px/s (0.05 m/tick × 30 × 120)
  against a ~720 px/s ceiling at the new value; the clamp never engages there either.
  The only real effect is `setMaxSpeed`'s proportional scaling of `maxforce` and
  `distanceBeforeStopping` (~9% tighter arrival easing) - imperceptible range, PO
  walk check owed.
- **Consumer inventory:** the constant's sole consumer is `Character.ts:81` →
  `Camera.setMaxSpeed(× 2)`. Nothing else reads `movementSpeed` off a character
  (`Spectator` derives its own).
- **Provenance of the 0.055:** it is the MOB default
  (`model/mob/mob.go:110`, deliberately NOT the player's 0.05 - entity-model L1)
  sitting under a false "SYNCED WITH BACKEND" comment, the banned tier-4 class. The
  replacement comment names the real source (conf `game.player.walkingSpeedPerTick`),
  why it can be neither derived nor read (the server does not serve its conf), and
  leaves the pin-vs-comment tier decision to C4 as planned.

- **Schema impact: NONE.** No wire, no conf, no DB; backend untouched.
- **Verified:** vitest **291/291** (was 287: +3 tick-length guards, +1 twin-table
  pin), red-first proven at both new surfaces · typecheck clean · prod build compiles
  (the 3 standing bundle-size warnings only) · boot 0 WARN / 0 ERROR (95 skills / 68
  mobs / 13 quests) · **`round4-tooltip.mjs` PASS at the live surface** - the served
  tooltip reads "× 6 over 12s, refreshed every 2s" where it read 11.88s/1.98s ·
  `ctxloss-warning.mjs clean` **PASS** (0 warnings, 0 console errors) · harness
  residue cleaned (`harnessdb -cleanup`, aurad stopped first). ✅ **The owed PO
  in-game pass ran 2026-08-14**: cooldown tooltip durations read round, walk + fly
  with the camera watched, no defects (the fly leg was confirmatory - the hard-follow
  makes a flight regression impossible; the walk check covered the easing scale).

### C3 - The server's dt: `stepMillis` ✅ 2026-08-14, `6f0c08df`

**The inventory came back empty, so this is the two-line-derive branch.** All 18
`Update(dt float32)` implementations either ignore `dt` outright or forward it to
consumers that ignore it (the 19th grep hit, `phy.Space.Update()`, takes no dt and
is not an ECS system):

- `UpdateSystem` forwards to `player.Update(dt)` and `mob.Update(dt)`; the player's
  `updateVitalSigns(dt)` never reads it (`HealthGainTick` is a per-tick fraction of
  maxHealth), and `mob.Update`'s body uses it nowhere.
- Every other system (skills, physics, mob AI, state, net, chat, cmd, quest, equip,
  interaction, statuseffects, encounter, input) is tick-counted, as the plan
  suspected. **Consumer list: zero.**
- ⚑ **Incidental find, deferred:** `model.PreUpdater`/`PostUpdater` have **zero
  implementors** in the codebase, so `PreUpdateSystem`/`PostUpdateSystem` iterate
  permanently empty registries every tick. C1-flavored dead code; a C7 or
  ledger-extension candidate, not touched here.

**The fix is necessarily two constants, not one** - the old `stepMillis = 33.0` was
an untyped constant read in three *integer* contexts (`dtMillis > stepMillis`,
`overloadPercent`'s division, `BudgetUs: stepMillis * 1000`), where the true
33.333... does not compile:

- **`constant.StepMillis = 1000.0 / TicksPerSecond`** (tier-1 derive, next to
  `TicksPerSecond` as the plan proposed), fed to `World.Update` in `core/game.go`
  AND `sim/world.go` in the same change - the sim's mirror constant is deleted, so
  the guardrail suite referees against the same dt the live loop uses.
- **Core-local `stepMicros = 1_000_000 / constant.TicksPerSecond`** (= 33333, exact
  integer division) for the telemetry sites. Overload detection and
  `overloadPercent` moved from milliseconds to microseconds (`update()` already
  computed `dt.Microseconds()` for TickStats; the separate `Milliseconds()` call is
  gone). `BudgetUs` is now 33333 on the `/tickstats` wire; `cmd/loadbot` derives
  utilization from the reported field, so it follows automatically
  (`devops/loadtest.md`'s ~33000 note updated).

**Telemetry side effect, deliberate:** overload detection got slightly more
sensitive and more honest - `dt.Milliseconds() > 33.0` truncated sub-ms overshoot,
so a 33.7 ms tick never warned; `33700 > 33333` now does.

**Red-first:** new `TestTickBudget_DerivedFromTickrate` failed honestly at
33000 ≠ 33333 (the exact bug), and `TestOverloadPercent_NoTruncationTo100`'s
expectations were **recomputed from the new budget, not copied from diffs**
(60000 µs = 180%, 33333 µs = 100%); both red before the fix, green after.

**Not touched:** the ~140 test-file `Update(33.0)` literals (they feed a parameter
nothing reads; mass-editing them is churn with zero behaviour delta).

- **Schema impact: NONE.** No conf key, no wire change (`budget_us` is telemetry,
  not game state), no DB. Frontend untouched.
- **Verified:** guardrail suite (TTK/TTD/ev-tick/survival) **byte-identical before
  and after** - the stronger criterion the empty inventory earns; the only diff
  lines were the band-list *log ordering*, proven nondeterministic by two
  identical-code runs disagreeing with each other · `go test -count=1 ./...` green
  except the known `TestDwell` flake, **measured, not diagnosed: 12/20 fail with
  the change vs 10/20 at stashed HEAD**, same coin-flip · `-race` clean on
  core/sim/sys/simharness · `make -C backend build` · boot 0 WARN / 0 ERROR.

### C4 - The pinning batch ✅ 2026-08-14, `b5a88221`

**Everything the plan listed shipped, plus the re-verify deltas it required** (the
doc's refs predated C2/C3; every one was re-verified at `ff83779e` first). The PO
call the C2 ledger deferred here got made this session, via choice prompt.

**Tier-1 derives.** `INPUT_TICKRATE` and `SERVER_TICKRATE` now both read one
hoisted `SERVER_TICK_MS` (D5 - the properties sit in one object literal, so the
module const IS the derive, and the existing `ticksPerSecond` pin covers both
transitively) · `MapFog.CELL_SIZE = meter2px(1)` · `TELEPORT_SNAP_DISTANCE_PX =
meter2px(1.5)` · `Graphics.character.size = meter2px(0.25)` - the in-session
determination: the sprite is drawn at the physical body's size (`Character.ts:78`)
and `Mobs.ts:357` already derives collider px from the meters value, so the 30 was
a restatement, not a coincidence.

**The Go-internal constant.** The `combatRegenGraceTicks` name-and-value twin
collapsed into `constant.CombatRegenGraceTicks` (both packages already imported
`constant`). ⚑ **Delta vs the plan: the pair was ALREADY pinned** - twin tests
shipped by plan-conf-duplication.md §35 C3 (`conf_pin_test.go` in both packages,
each asserting a literal 100), so C4's value here was the derive, and those two
pins retired WITH the mirror they guarded (player's file deleted whole; mob's
keeps its chase-margin test).

**Tier-3 pins, four new fixture keys** (`pointsPerMeter` 120 · `utilityCastTicks`
300/150/300, D4 - the client's tooltip seconds now assert as ticks over the pinned
tickrate · `activeAuraSlot` - **widened from the plan's single key to both
sentinels** {-1, -2}, since `model/input.go` defines the pair as one wire contract;
the client's bare `-1` initializer became the named `NO_ACTIVE_AURA_CHANGE` ·
`playerColliderRadius` 0.25, hoisted to exported `player.ColliderRadiusMeters`).
⚑ **Infra rider:** the sentinels live in a new leaf module `ActiveAuraSlot.ts`,
because importing `InputMessage.ts` drags the client graph into webpack-only APIs
(`require.context`, Pixi asset loads) that vitest cannot execute - same class as
C2's flatbuffers-alias rider.

**Exhaustive-test pins.** `BackendConstants.test.ts` pins the StatusEffect
wire↔visual join in both directions; the reverse direction failed red on
**`ResourceHit`** exactly as predicted (zero references anywhere - deleted, the
plan's "evidence of one past drift" confirmed) · the production `for…in` join also
iterated the enum's reverse mapping and wrote name-keyed undefined junk into the
table - now filtered, pinned by a third test that counted the junk red-first ·
`apiErrorCodes` pins the **16** refusal codes (not the plan's ~17: 16 server + the
client-only `'network'`, which stays outside the list by design); the client union
became a runtime `API_ERROR_CODES` list so it can be asserted, and the Go side is
an in-package pin (`accounts/shared_constants_pin_test.go`) because the codes are
unexported.

**The sweep** (14 `/synced/i` hits inventoried): every live bare comment upgraded
to name its pin or derive; two already-pinned sites (viewport, tickrate) got the
one-line pointer · ⚑ `sys/state.go`'s `CampfireDwellRadiusFactor` "hand-synced
with the client" claim was **STALE** - the client draws the bind circle from the
wire `dwell_radius` (`Mobs.ts` names the server as single source), so the fix was
the comment, not a pin · `Zoom.ts`/`EffectPips.ts`/`AuraRings.ts` already name
their pins, untouched.

**BASE_MOVEMENT_SPEED (PO 2026-08-14): pinned against `conf.default.json`** - the
value mirrors conf (`game.player.walkingSpeedPerTick`), not a code constant, so
the pin reads the conf file (the model/mob conf-pin precedent, client-side this
time). Accepted limitation, documented at the pin: the live server's `conf.json`
can still differ; the guard covers the default, which is the realistic drift path
(the old 0.055 was exactly that class).

**Deliberately behaviour-relevant, both fixes:** the junk lookup-table entries are
gone and the dead `ResourceHit` visual is deleted. Everything else ships at its
identical old value - behaviour-neutral by construction.

- **Schema impact: NONE.** No DB, no wire, no conf key; the fixture stays a
  test-only file (no cp-defs/embed entry).
- **Verified:** **red-first for every new pin at once** - fixture falsified on six
  values → `cmd/aurad` AND `accounts` Go suites FAIL, client shows exactly the six
  pins red, restore confirmed byte-clean by git diff · the exhaustive tests went
  red on the real defects (`ResourceHit`, the junk writes) before their fixes ·
  vitest **300/300** (was 291: +4 fixture pins, +1 conf pin, +3 StatusEffect, +1
  error codes) · typecheck · prod build (3 standing bundle warnings) ·
  `go test -count=1 ./...` green bar the known `TestDwell` flake, **measured
  11/20 vs the 10-12/20 baseline, same coin-flip** · `go vet` clean ·
  `make -C backend build` · boot 0 WARN / 0 ERROR (95 skills / 68 mobs / 13
  quests) · `ctxloss-warning clean` **PASS** (0 warnings, 0 console errors - the
  boot-path harness, and BasicConfig/Graphics/BackendConstants are boot path) ·
  harness residue cleaned (`harnessdb -cleanup`, aurad stopped first).

### C5 - Frontend duplication closure ✅ 2026-08-14, `[uncommitted]` · PO in-game glance same day

**All three items shipped, and the behaviour-neutral criterion held at the live
surface**: a new report-style capture script (`c5-bars.mjs`, see the harness-rider
paragraph) sampled the overhead-bar geometry off the scene graph before and after
the refactor, and the JSON is **byte-identical** (anchor y, bounds, fill scales,
shield anchor position, pip offset); the only diff was the cast bar's
timing-dependent fill fraction, matching its own inline value exactly in both runs.
Every line ref was re-verified at `8af71602` first; the plan's one path error
(EntityManager lives in `features/backend/logic/`, not `core/`) is recorded above.

**Item 1 - `OverheadHealthBar`.** ⚑ **Plan call, deviating from the doc's "shared
builder" wording: a small component CLASS** - the twins' `setHealth`/`setShield`/
`layoutBars` bodies and member sets were byte-identical too, so the class collapses
~3x more duplication than a builder and gives C6 exactly one restyle seam. The two
deliberate asymmetries stay caller-owned: anchor y (constructor param) and parent -
Character's bar on the unfiltered plate, the mob's on `shape` so it keeps night
tint/corpse fade/darkness hide. `Mobs.nameplateY()`'s drifted third copy of the
anchor expression now reads `overheadBar.anchorY`, making its "one expression"
comment true again. Style constants exported by name for C6; **EffectPips'
backdrop deferred to C6 as planned** (importing it from OverheadHealthBar would be
a module cycle - both read Theme.ts then). The retyped color/alpha literals were
diffed against HEAD's `initHealthBar` bodies: exact match.

**Item 3 - the typed dispatch.** New pure type leaf `WireSetters.ts` (six narrow
interfaces: OverheadVitals · AuraDisplay · LevelDisplay · MobPlate · DwellRing ·
Interactable); Character/Mob/Campfire carry `implements` clauses and EntityManager
reaches members via typed dot access through a `Partial<...>` cast, guards
unchanged (props/corpses implement none of this - `isFunction` stays load-bearing).
**The rename property was proven in both directions**: renaming `setTier` in the
interface produced TS2551 at both call sites AND TS2420 at Mob's clause. The
`setAuraTick` arity mismatch needed no runtime change (interface declares the
widest shape; Mob's 2-param method is assignable). The dev-only `updateAABB`
monkey-patch got typed on BOTH sides (completed `hasAABB`, producer assignment
routed through it). Compiler assumption verified first: tsconfig is non-strict, so
the pattern compiles without predicate typing. Non-goals recorded: `entity` stays
implicitly `any`, the `gameObjectClasses` registry stays `unknown`-constructing.

**Item 2 - `ProgressFill`.** One class (vital-signs/logic) owns the `.indicator`
scale write; `VitalSignBar` composes it, cast + flight bars instantiate it, and the
two hand-rolled `style.width` writers died. Their LESS moved to `width: 100%;
scale: 0 1; transform-origin: left center` with **deliberately no transition** (the
33 ms smoothing stays the vital bars' own), so the per-tick jump renders as before;
HUD keeps all text, the L25 visibility-vs-display rule, and the flight bar's
client-inferred denominator. `HUD.html`/`HUD.mobile.less` untouched as planned.
⚑ Ledger note: Chrome normalizes a percent `scale` back to a number on inline
read-back (`"0.3333 1"` where jsdom returns `"33.33% 1"` verbatim) - same render,
recorded so nobody chases it in harness output.

**Harness riders, all moved WITH the chunk per the standing rule:** ⚑
**`n1-shield-bar.mjs` had been silently UNRUNNABLE since step 8a chunk 2** - it
still joined through the dead `#startForm` path and timed out before asserting
anything; pre-existing rot found by this chunk's owed re-run, fixed here (join
migrated to `joinAsNewCharacter`) because C5 owns the fills it asserts · n1's
scene-graph reads now go through `character.overheadBar` · `c3-flight-client.mjs`'s
`barFill` read moved width → scale · `chunk3-charm.mjs`'s pip-offset comment
refreshed (its structural walk needed no change) · **new `c5-bars.mjs`** kept in
the verify dir with a SKILL.md row as a report-style before/after geometry capture,
reusable for C6's theme pass.

- **Schema impact: NONE.** Backend untouched (`go build ./...` green anyway).
- **Verified:** red-first proven at both new surfaces (falsified pip gap + width
  clamp → exactly 3 component tests red, restore green; the `setTier` rename →
  compile errors both directions) · vitest **315/315** (was 300: +12
  OverheadHealthBar, +3 ProgressFill) · typecheck · prod build (3 standing bundle
  warnings) · `c5-bars` geometry **byte-identical before/after** · owning
  harnesses each on a fresh server: `r4-recall-utility` **13/13** ·
  `n1-shield-bar` **4/4** · `c3-flight-client` **35/35** (fill growth green under
  the scale mechanism) · `r4-badge` vanilla **7/7** · `ctxloss-warning clean`
  **PASS** · boot 0 WARN / 0 ERROR · harness residue cleaned (`harnessdb
  -cleanup`, aurad stopped first) · **PO in-game glance 2026-08-14**, with one
  question answered in-session: cast and flight bar are ONE system by design
  (same geometry/text/fill mechanism), differing only in fill color (gold vs
  campfire orange), the L25 show/hide rule, and the flight bar's client-inferred
  denominator.

## Open questions

None blocking. Two in-chunk determinations were deliberately left to their execution
sessions rather than decided here: ~~C2's flight-camera outcome (fix value vs document
deliberate headroom)~~ **resolved in C2, 2026-08-13: fix the value** (the camera
hard-follows in flight, the walking ceiling has ~4× headroom, and 0.055 was provably
the mob default under a false comment - see the C2 ledger) and ~~C3's dt-consumer
inventory (which decides whether the fix is two lines or a mini-retune)~~ **resolved
in C3, 2026-08-14: zero dt consumers, two-line-derive branch, guardrails
byte-identical** (see the C3 ledger). The tier decision C2 deferred to C4
(BASE_MOVEMENT_SPEED, pin vs comment) was **resolved in C4, PO 2026-08-14: pin
against conf.default.json** (see the C4 ledger).
