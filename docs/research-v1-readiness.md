# Prototype → v1.0 Live-Product Readiness — Honest Assessment

> **Status: informational only.** Written 2026-07-06 as an independent
> assessment alongside the scripting-layer investigation (separate topic, kept
> separate on purpose). It does **not** reopen the clean-start-vs-continue
> decision — that is made and has held up well (the TDD itself records that
> the feared "Berryhunter blocks Aura features" risk never materialized).
> This is a risk surface for us to weigh, not a work order.

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

1. **Tests in CI** (see above) — coverage that doesn't run doesn't exist
   operationally.
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
4. **Frontend: zero tests, no lint, no typecheck script.** The webpack build
   is the only gate (it does type-check via ts-loader). Full frontend test
   coverage is not the ask; a lint + `tsc --noEmit` CI step and a handful of
   tests around `EntityManager`/backend-snapshot logic would catch the
   classes of bug that currently only manual play finds.
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
