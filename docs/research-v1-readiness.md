# Prototype → v1.0 Live-Product Readiness — Honest Assessment

> **Status: informational only.** Written 2026-07-06 as an independent
> assessment alongside the scripting-layer investigation (separate topic, kept
> separate on purpose). It does **not** reopen the clean-start-vs-continue
> decision — that is made and has held up well (the TDD itself records that
> the feared "Berryhunter blocks Aura features" risk never materialized).
> This is a risk surface for us to weigh, not a work order.
>
> **§5 is a full re-check, 2026-08-06** — after step 8a (accounts +
> persistence), the live server, and the world re-placement. Most of §1–§3's
> structural items have since closed; §5 records item-by-item what shipped,
> what is half-closed, and the short list still owed before "live without
> caveats". Read §5 for current state; §1–§3 for the original reasoning.

---

## 1. Flagged tech debt: trivial vs. structural

### Trivial cleanup (hours, no design needed)

- **`net_test.go` hangs `go test ./...`** — a `t.Skip` one-liner. Worth doing
  *soon* despite being trivial, because it is the thing blocking CI from
  running tests at all (see §2). *(Done 2026-07-06 — full suite runs.)*
- **Dead character-variant code** (`Character.variants`, ~13 unreferenced
  SVGs) — documented, removal already scheduled with the avatar-selector work.
  *(Done 2026-07-06.)*
- **Debug logging** — cleaner than flagged: ~9 `console.log`s in the frontend,
  mostly in `SpatialAudio` and the dev panel; backend uses `log`/`slog`
  consistently. Not a risk, a grep-and-tidy.
- **Terrain "blue bleed"** — cosmetic pre-existing rendering bug, tracked,
  low priority. Correctly triaged.

### Structural (needs a decision or real work before "live")

- **CI builds but never tests.** `.github/workflows/build.yaml` runs
  goreleaser + `npm run build` — no `go test` anywhere, partly *because* the
  full test run hangs. Every one of the ~38 backend test files runs only when
  someone remembers to run the safe scope locally. For live-service iteration
  this is the first structural gap to close: fix `net_test.go`, then wire the
  safe test scope (or full `./...`) into CI. Cheap, high leverage.
  *(Update 2026-07-06: `net_test.go` is fixed — full `go test ./...` passes
  locally. Wiring it into CI is still open.)*
  *(Update 2026-07-22: **CLOSED** — CI now runs `go vet ./...` +
  `go test ./...` before the goreleaser step, and `npm run typecheck` before
  the frontend build; `go vet` was cleaned to zero findings to enable the
  gate. `research-code-quality.md` §7.4.)*
- **No migration framework — but also no database yet.** Current persistence
  is chieftain's scoreboard SQLite (`CREATE TABLE IF NOT EXISTS`, no
  versioning). The real obligation lands with roadmap item 3 (accounts): the
  TDD's own risk table already says "migrations framework from day one" — the
  risk is only realized if item 3 ships schema-first without one. Nothing to
  do today except honor that when the DB choice is made.
- **`go:embed`ed content + no config reload** — every balance tweak is a
  rebuild+restart. Tolerable for a prototype, actively hostile to live
  operation (a restart disconnects every player). A dev/ops story for content
  and config changes (disk-load flag, or planned restart windows) is needed
  before live. (Also flagged in the scripting investigation as the shared
  iteration tax.)
- **Frontend `Skills.ts` duplication** — id → name/maxLevel/category plus
  per-skill-ID ring constants, manually synced with the backend registry.
  Already flagged; it graduates from annoyance to real risk exactly when the
  item-12 content pass multiplies the skill count. Wire- or codegen-driven
  metadata should land before or with that pass.

## 2. Test coverage: what exists, what's missing for live iteration

**What exists is real and well-aimed.** 38 test files against 147 source
files, concentrated where the new game logic lives: `skills/` (registry,
recipes, milestones, resist, component), `sys/` (skill behavior, targeting,
equip, commands), `model/player` + `model/mob` + `vitals`, `codec`, `phy`,
`core/input`. The TDD discipline shows — regressions found in play
(KILL-cheat revive, zombie mobs, input starvation, respawn state loss) were
each pinned with a named test. Chieftain has its own suite. This is genuinely
better than typical prototype hygiene.

**What's missing, in rough order of pain for a live service:**

1. ~~**Tests in CI**~~ **closed 2026-07-22** — `go vet` + `go test` gate the
   build in CI (see §1 update).
2. **One end-to-end protocol test** — nothing exercises
   connect → join → input → GameState over a real WebSocket. Codec is
   unit-tested per message, but wire regressions (FlatBuffers field
   evolution, the `-2` sentinel, snapshot assembly) only surface in manual
   play. `net_test.go` was presumably once an attempt at this; a proper
   version (spin up server on a random port, scripted client, assertions,
   teardown) is the single highest-value new test.
3. **A tick/perf benchmark** — ~~the blob benchmark is already planned (LoS
   spike)~~ *(the LoS spike died with the 2026-07-10 aura-LoS cut — no spike
   is planned anymore, which makes this gap bigger, not smaller)*: nothing
   measures tick time today, so perf regressions land silently. Even a crude
   benchmark test (N synthetic casters, assert update() < budget) would hold
   the line.
4. **Frontend: zero tests, no lint, ~~no typecheck script~~.** *(Update
   2026-07-22: `npm run typecheck` (`tsc --noEmit`) exists and runs in CI;
   the stale `old-structure` `include` in `tsconfig.json` is fixed, so the
   whole `src/` tree is covered.)* Still open: ESLint and a handful of tests
   around `EntityManager`/backend-snapshot logic to catch the classes of bug
   that currently only manual play finds.
5. **Determinism/fuzz on content loading** — load-time validation is strong
   (hard-fail ethos), already well tested. No gap worth new work.

## 3. Inherited architecture: what would actively hurt live, vs. what's fine

**Fine, verified by the architecture doc's own analysis** (not repeated here):
single `phy.Space`, AOI-filtered snapshots (the O(players × world) trap is
already avoided), 30 Hz single-threaded loop for tens of players, per-zone
Spaces as the documented scale-out path, per-tick grid rebuild (known, cheap
fix, listed as mitigation #1). None of this needs rework before v1 at the
stated scale (2–3 zones, tens of players).

**Would actively hurt — the short list:**

1. **No panic isolation in the game loop.** `Loop()` is
   `for { g.update(); <-ticker.C }`; a panic in *any* ECS system (or any
   entity's `Update`) kills the process and disconnects every player. As a
   prototype that's even desirable (loud failures); live, one malformed edge
   case = full-server outage. Needs a deliberate decision before live:
   recover-per-tick + error telemetry, or supervised fast restart — which
   leads directly to (2).
2. **Crash = total state loss, and there is no graceful shutdown.** Today the
   world is session-based so a restart only annoys; the moment accounts/
   persistence (item 3) exist, "what survives a crash/deploy" becomes a real
   design question (snapshot cadence, shutdown hook draining state to the
   DB). The `carriedState` respawn pattern is a good in-process seed but
   persists nothing. Should be designed *as part of* item 3, not after it.
3. **Zero operational visibility.** No tick-duration measurement (an overrun
   past 33 ms just silently slips), no metrics, no health endpoint beyond
   serving the game, no structured crash reporting. The TDD lists
   "logging/monitoring from the start?" as an open decision — for live it
   stops being optional; a tick-time histogram + player count + error counter
   is the minimal kit.
4. **Deploy story = restart with disconnects.** Follows from (2) and the
   embed/config points; live-service iteration ("ship a balance patch
   Tuesday") needs at least planned-restart tooling, at best content reload.
   Worth a small ops design doc when v1 approaches; not code yet.
5. **Auth/abuse surface is prototype-grade** — token-list gate, no rate
   limiting on inputs/chat/join. Acceptable now; item 3 (anonymous-first
   accounts) is the natural place to add join throttling and per-connection
   input sanity, and should own that explicitly.

**Not on the hurt list, deliberately:** the FlatBuffers protocol (field
evolution has been handled cleanly through ~10 wire changes), the ECS layout
(absorbed the whole skill system without strain), physics, and the
single-thread ceiling (documented, with a designed escape path that is also a
gameplay feature — zones).

## 4. Bottom line

The codebase is in *better* shape than the "prototype" label suggests where
it counts (game-logic test discipline, load-time validation, documented
architecture with honest scaling math), and *worse* than it looks in the
operational shell around it (CI runs no tests, no crash isolation, no
observability, restart-only deploys). The gap to "live product" is mostly
**ops and process, not game code**: roughly — fix `net_test.go` + tests in CI
(days), one protocol integration test + tick telemetry (days), panic/shutdown/
persistence-crash story designed with item 3 (part of that item), deploy/
reload story (small design doc, later). No inherited-architecture rework is
needed at v1 scale beyond what the roadmap already plans.

---

## 5. Re-check 2026-08-06 — after persistence, after the live server

Companion pass to `research-code-quality.md` §11 (same day, which holds the
current defect list and metrics). This section walks §1–§3 item by item.

### 5.1 The §1 structural list

- **CI builds but never tests** — ✅ closed 2026-07-22 and *held*: CI gates
  `go vet` + `go test` + `npm run typecheck`. ⚑ The one asymmetry left is
  **frontend tests**: 17 vitest files / 235 tests now exist and none run in
  CI — including the client half of the cross-language shared-constants pin,
  whose Go twin *does* gate. One line of YAML; §11.5 #1 there.
- **No migration framework** — ✅ closed by step 8a exactly as this doc asked
  ("from day one"): sequential embedded `.up/.down.sql` pairs, auto-applied at
  boot, shipped-files-frozen discipline, dirty-state runbook
  (`manual-db-migrations.md`), reversibility a *tested* property
  (`store.Rollback`'s callers are the test suite). Exercised against real data
  by `000002` on the live box.
- **`go:embed` + no config reload** — **half-closed.** Dev iteration is solved
  (`-content ../api` skips embed and rebuild; conf changes are restart-only,
  no rebuild). Live is still restart-with-disconnects — but the restart is now
  *survivable*: graceful shutdown flushes characters and sessions stash for
  10 minutes, so a deploy costs a reconnect, not progress. A zero-disconnect
  reload story remains future ops work, same as originally judged.
- **Frontend `Skills.ts` duplication** — ✅ closed structurally (the catalog
  pattern: `GET /skills` / `GET /mobs`, category on the wire). The *class*
  recurred elsewhere, though — see §11.3 F1–F3 in the quality doc.

### 5.2 The §2 test-coverage list

1. Tests in CI — ✅ (backend); frontend residual above.
2. **End-to-end protocol test** — closed in a different and stronger form than
   asked: the Playwright verify harnesses drive connect → join → HUD → combat
   against a real server and real browser per chunk, and boot-path tests cover
   welcome/join. ⚑ Still manual per-chunk discipline, not CI — acceptable
   while they need a running Postgres + browser, worth revisiting when CI
   grows a service container.
3. **Tick/perf measurement** — ✅ closed beyond the ask: always-on
   `TickStats` ring buffer, the scaling-profile harness (density ceiling
   measured ≈5.8×), the loadbot, and `*_alloc_test.go` pins that fail on any
   new per-tick allocation. Exposure is flag-gated (see 5.3.3).
4. Frontend lint — **ESLint is still the only item from the whole 2026-07-06
   list that has not moved at all.** Vitest exists; strict mode still off
   (`--noImplicitAny` would report 410 errors — the honest number, see §11.3
   F4).
5. Content-loading validation — was already judged "no gap"; the guard
   coverage has since gotten *stronger* (zero-value guards, per-type key
   allowlists).

### 5.3 The §3 "would actively hurt" list

1. **No panic isolation** — ✅ shipped (`6f1fc64c`): `runTick()` recovers,
   counts (`core.RecoveredPanics`), logs with capped stacks; the tick aborts
   rather than the process. The trade is documented in the code.
2. **Crash = total state loss / no graceful shutdown** — ✅ shipped with 8a,
   designed *as part of* it exactly as this doc asked: Postgres persistence,
   periodic writer with per-character backoff (`persist.ErrGone` encodes a
   real 37-minute outage as a type), SIGTERM → snapshot → flush → close with
   bounded timeouts and named-character loss logging. ⚑ Residual: no HTTP
   listener drain (clients get a hard close), and the **live DB is
   deliberately unbackuped** (PO ruling 2026-08-04 — losable by decision, to
   be revisited with ascension/bloodlines).
3. **Zero operational visibility** — **half-closed, and now the largest
   remaining §3 item.** Measurement is always on; *exposure* only exists
   behind `-profile`, and there is still no health endpoint, no metrics, no
   crash reporting. The only always-on signal is the overload print. The
   minimal kit this doc named (tick histogram + player count + error counter,
   reachable in production) is still the right next step for live.
4. **Deploy story** — ✅ exists and is exercised: live server,
   `devops/deploy.sh`, restarts softened by stash/reconnect + flush.
   Planned-restart is the model; that is adequate at playtest scale.
5. **Auth/abuse surface** — largely closed by 8a: real accounts, session
   auth, login throttling with timing equalisation, CORS refusal, audit
   trail. ⚑ Still owed and tracked in `plan-playtest-deploy.md` §Ops &
   security posture: cloud firewall, DB bound to localhost, credential
   handling, non-root deploy user. Plus two auth-adjacent defects found
   2026-08-06 (quality doc §11.2 B1/B2).

### 5.4 Bottom line, updated

The 2026-07-06 sentence — *the gap is ops and process, not game code* — held,
and most of the gap has since been paid down by shipped work rather than
side-quests: persistence, migrations, shutdown, panic isolation and a live
deploy all landed **without reworking any inherited foundation**, which is the
strongest evidence yet for the no-rewrite answer. What separates today's repo
from "live without caveats" is a short, known list: frontend gating (tests in
CI, ESLint, strictness ratchet), production-reachable observability + a health
endpoint, the security-posture items, listener drain, and a deliberate backup
ruling to revisit. Current defects and grades: `research-code-quality.md` §11.
