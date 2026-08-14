# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

<!-- HARD CAP: "Last completed" + at most TWO "Prior" entries, each ≤10 lines with a
     ledger pointer. When adding a new entry, move the oldest verbatim to
     docs/archive/status-history.md. FULL per-chunk ledgers live in the plan-*.md
     banners; the sequence lives in roadmap.md "Execution order". Never paste a full
     session banner here — see the `chunk-wrap` skill for the collapse rule. -->

### Recent (cap 3 — older entries: `docs/archive/status-history.md`)

- **⭐ Last completed: CODE HEALTH C5 - FRONTEND DUPLICATION CLOSURE** ✅ 2026-08-14, `[uncommitted]` (`docs/plan-code-health.md` §Chunk ledgers; C6-C7 open, C7 independent): the three frontend duplications are collapsed, behaviour-neutral proven at the live surface (new `c5-bars.mjs` geometry capture **byte-identical** before/after). `OverheadHealthBar` replaces the Character/Mob twin bars (plan call: component CLASS, not the doc's builder - the setter/layout bodies were twins too; anchor + parent stay caller-owned, the mob bar keeps night tint on `shape`; `nameplateY` now reads the bar's own anchor) · `WireSetters.ts` narrow interfaces replace EntityManager's `gameObject['setLevel']` string probes, the rename proven a compile error in BOTH directions (TS2551 at the call sites + TS2420 at the `implements` clause); the dev-only `updateAABB` patch typed on producer AND consumer side · `ProgressFill` unifies the vital/cast/flight fills (LESS width → scale, deliberately no transition; ⚑ Chrome normalizes a percent `scale` readback to a bare number - same render). ⚑ **`n1-shield-bar.mjs` had been silently UNRUNNABLE since 8a chunk 2** (dead `#startForm` join, timed out before asserting anything) - found by this chunk's owed re-run, fixed as a rider; `c3-flight-client`'s fill read and `chunk3-charm`'s comment moved with the chunk too. EffectPips' backdrop deferred to C6 (module cycle; both read Theme.ts then). **Schema NONE.** Verified: red-first at both new surfaces (falsify → 3 red / compile errors; restore green) · vitest **315/315** (was 300) · typecheck · prod build · `go build` · fresh-server harnesses `r4-recall` 13/13 · `n1-shield-bar` 4/4 · `c3-flight` 35/35 · `r4-badge` 7/7 · `ctxloss-warning clean` PASS · boot 0 WARN/0 ERROR · residue cleaned · PO in-game glance same day.
- **Prior: CODE HEALTH C4 - THE PINNING BATCH** ✅ 2026-08-14, `b5a88221` (`docs/plan-code-health.md` §Chunk ledgers; C5-C7 open, C5 before or with C6): the silent-divergence class is closed. Tier-1 derives (INPUT_TICKRATE off SERVER_TICKRATE, fog cell + teleport snap + character sprite size via `meter2px`); the `combatRegenGraceTicks` twin collapsed into `constant.CombatRegenGraceTicks` (⚑ it was ALREADY pinned by §35-C3 twin tests, which retired WITH the mirror). Four new fixture pins (`pointsPerMeter` · `utilityCastTicks` D4 · `activeAuraSlot` BOTH sentinels {-1,-2} · `playerColliderRadius`, exported) + exhaustive twins: the StatusEffect join both directions (**the dead `ResourceHit` failed the reverse assert red-first, DELETED**; the `for…in` join wrote reverse-mapping junk, now filtered) and the **16** `apiErrorCodes` (client union → runtime list; Go pin in-package, codes unexported). **PO call: BASE_MOVEMENT_SPEED pinned against `conf.default.json`** (conf value, not code; the live conf can still differ, documented). Every bare "SYNCED" comment now names its pin; `state.go`'s campfire "hand-synced" claim was STALE (the value rides the wire). Infra rider: the wire sentinels live in leaf `ActiveAuraSlot.ts` - importing `InputMessage.ts` drags webpack-only APIs into vitest. **Schema NONE.** Verified: **red-first for all six pins at once** (fixture falsified → both Go suites + exactly six client tests red; restore git-clean) · vitest **300/300** (was 291) · typecheck · prod build · `go test -count=1` bar `TestDwell`, **measured 11/20 vs 10-12/20 baseline** · vet · `make build` · boot 0 WARN/0 ERROR · `ctxloss-warning clean` PASS · residue cleaned.
- **Prior: CODE HEALTH C3 - THE SERVER'S DT** ✅ 2026-08-14, `6f0c08df` (`docs/plan-code-health.md` §Chunk ledgers; C4-C7 open): the server twin of the client's tick-rounding bug is dead - `stepMillis = 33.0` (vs the loop's real 33.33 ms) is now derived: `constant.StepMillis = 1000.0/TicksPerSecond` feeds `World.Update` in core AND sim (the sim's mirror constant deleted in the same change, so the guardrail suite referees at the live dt), plus core-local `stepMicros = 33333` for the telemetry sites, because the true fractional value does not compile in the three integer contexts the old constant sat in. **The inventory came back EMPTY: zero of the 18 `Update(dt)` implementations consume dt** (everything is tick-counted), so the verify criterion tightened from "within noise" to **byte-identical guardrails - and they are** (the only diff was band-list log ORDERING, proven nondeterministic by two identical-code runs disagreeing with each other). Telemetry deliberately sharpened: `budget_us` 33000 → 33333 on the `/tickstats` wire, and overload detection no longer truncates sub-ms overshoot (a 33.7 ms tick now warns; loadbot follows the reported field automatically). ⚑ Incidental find, deferred: `PreUpdater`/`PostUpdater` have **zero implementors** - two systems iterate permanently empty registries every tick (C7/ledger-extension candidate). **Schema NONE; frontend untouched.** Verified: red-first at both new pins (33000 ≠ 33333 was the honest red; overload expectations recomputed from the budget, not copied) · `go test -count=1 ./...` bar the `TestDwell` flake, **measured: 12/20 fail vs 10/20 at stashed HEAD, same coin-flip** · `-race` clean · `make build` · boot 0 WARN/0 ERROR.

### Next

- **Three plans designed 2026-08-12/11, execution open:** `plan-code-health.md` (C1-C5 ✅; **C6-C7 open** — C7 independent) · `plan-zone-editor-structure.md` (C1-C3: `kindOf` structure → controls + the talker round-trip that fixes the uneditable ascension stones → retire the legacy roster) · `plan-play-bot.md` (C0-C3: extract transport → the bot that fights → quests → the soak finding).

- **Camps owns the standing wipe now.** Ascension shipped first, so per `plan-ascension.md` §4.8 the camp-standing assert passes to **`plan-camps.md`'s own C1**, against the already-built transaction. C1 verified the rest of the loss scope on a real successor: everything character-bound is keyed `character_id`, so the wipe is structural — C1 writes no wipe code and must only avoid *seeding*.

- **CC and retaliation's three watch items ride forward** (`docs/archive/plan-cc-and-retaliation.md`), none a chunk: can a mob stun a *player*? (needs the inert player CC direction from `plan-skill-vocab` §3.1) · CC immunity is **silent in-game** · **on the wire a stun is indistinguishable from a slow** (D6 reused `AppliedEffectSlow`; the ubyte has no free bit) — a **backlog §39** dependency. ⚑ One assumption to confirm: D10 hung Paralyze on **GiantSpider** because the ruling said *"the elite spiders"* and **no elite-tier spider exists**.

- **Mob/XP tuning threads, owned by nobody** (both plans archived: `plan-xp-formula.md`, `plan-world-replacement.md`): per-species feel tuning — speed/xpFactor are cheap JSON, but **HP or damage re-price every placement** and can trip the archetype guardrail (cost table in the archived world-replacement banner) · **levels 21–30 remain a recorded standing gap** (D5) · the §12.2 rising-absolute-award note.

- **⭐ backlog §52 - LEAVING THE WORLD WITHOUT A RELOAD, PO-asked 2026-08-11.** Owned by **`docs/plan-leaving-the-world.md`** (designed 2026-08-04, D1-D11, nothing built; ⚑ line refs pinned to `1ac8078e`, re-verify first). Every exit is a page reload because *the client boots once and has no teardown path*; shape **(B)** reset-not-teardown needs no server change and is plausibly one chunk. The offender ranking for shape (A) is recorded in `plan-code-health.md` §Ownership. **backlog §48** is blocked on this.

- ⚑ **Step 8a closed WITHOUT backups, deliberately** (PO 2026-08-04): the live DB is **losable**, nothing off-box holds a copy — and **C3's memorial is the named revisit trigger**, being the one thing whose entire point is outliving people. Making the documented `pg_dump` line a cron is a PO call. The **security** items (firewall, DB to localhost, credentials, non-root deploy) were never part of the ruling and are still owed: `plan-playtest-deploy.md` §Ops & security posture.

### Open items

- **Needs a PO call:** `#registrationNag` covers the open mobile ☰ sheet (journal unreachable on phones; `mobile-layout.mjs` leg 7 legitimately red).
- **Playtest intake** (`plan-playtest-feedback.md`): round 8 item 3's **feature** half, auto-walk (four open design questions: keybinding, vector-or-facing, what cancels it, and a mobile answer or an explicit desktop-only ruling) · round 9 items 2+3 parked for the UI pass (font, cleaner UI, dialogue UI, journal-over-dialogue overlap). ⚑ **The FONT half has its own reference doc, `docs/plan-ui-font.md`** — read it before touching a font; a swap always costs a size retune.
- **Fast-travel + map tuning, orphaned by the archive** (PO-seen, unowned): **marker sizing** — your own dot is invisible at your bound fire, *and* since flight D16 **every arrival ends with the flyer's dot occluded on every observer's map** (`r=3.5 px` under a `9.0 px` marker) · **flight speed 2.8× and viewport 1.2×** are PO-tuned but still [PLACEHOLDER].
- **Smaller open threads:** §47 the stale "Connection lost" banner in a second window · §51 transient second queue entry (readability) · a character-name **content** filter (spam registrations pass the charset guard) · mobile perf ceiling — PO: "works for now, needs some love" (cheapest next: `MOBILE_MAX_RESOLUTION` 1.5; the minimap is a second per-frame GL context).
- **Still outside any shipped chunk:** avatar/faction defaults (blocked on `plan-avatar-system.md`) · the password-reset plan's own five questions.
- **Ascension's leftovers** (`docs/archive/plan-ascension.md`): both stones owe a lore write + environment art (§8) · tuning-open: the 10 s channel and the 20-kill hunt gate, both [PLACEHOLDER] · §8's deferred cluster is deferred by ruling and revivable whole. ⚑ The ceremony's effect is placeholder `Graphics` **only its own player sees** (D29) - a shared moment is a wire field, a **§39** conversation.
- **Backlog watch items** (`docs/backlog.md`): §25 D+E · §27.2.4–7 (⚑ §27.2.6 needs re-surveying) · §29 lost-WebGL-context trigger unknown · §37 skill-level/augment rework · §39 entity-presentation rework (don't invest in per-effect overlay art before it) · §34 hard collision · round-6 item 4 target stickiness (re-opens on measured cost). ⚑ **§57 attack-attribution lines has a PROTOTYPE, PO-played and deliberately NOT merged** (`prototype/attack-lines` `cf305284`): the line is weakest exactly where it fires; a shipped version is a §39 consumer that must solve that.
- **Known-inconclusive** — three harnesses and one Go test are red or flaky **at HEAD**, none caused by recent work; reading one as your own regression is how `chunk3b-interact` cost two chunks of false diagnosis: `chunk3-charm.mjs` 6–8/9 (accepted D9 fragility) · `filler-batch.mjs` leg 1 (stale assertion, self-contradicting output, other 5 pass) · `chunk3b-ii-conversation.mjs` 28/34 (proven at HEAD by stash-build-rerun; the six failures unchanged) · **`sys.TestDwell_TakeoffDropsAnInProgressCount`, a HIGH-RATE FLAKE** (7–10/20, mechanism unknown). All unowned. ⚑ **Measure the rate before diagnosing a flake.**
- **Open PO calls:** one - does a QUEST turn-in row advertise the ability it pays? Replacement art + domain parked until v1; wiki generator kept.

- **Standing locks & gotchas:** **NO CI BY CHOICE** (PO 2026-08-12): GitHub Actions stays disabled on the fork - don't add workflow steps or propose enabling it unless it becomes a necessity (revisit: roadmap step 9; prerequisite: the `TestDwell` flake). The per-chunk local verify tail is the gate. Growth **1.12 × maxLevel 30**; regen **0.00033 ≈1%/s × taper 1.0→0.4** FINAL; §11 no-pity + campfire **0.12** + heal cost **10 % → 2 % of max HP** FINAL; **the base damage aura stays FREE at every resource level** (round-6 ruling, GDD §3); drop + milestone tables are **TUNING-OPEN** (Damage@L1 at creation · Discipline@L5 · Haste@L7); density = mob visible per ⅔-screen window; downtime 10 s + chain 20; guardrail asserts in `cmd/simharness/guardrail_test.go`. New mobs: **must** author tier + baseline (raw `maxHealth` hard-fails) and price XP with **`factors.xpFactor`** — absent → 1, `0` = pays nothing *and* no nameplate, fractions only for harvest-style outliers (Turnip 0.05); **no species authors 0.5** (xp D16). Mobs at tier ≥ elite **must** author `factors.ccImmune` (boot error). Day/night cycle is **OFF** (`DAY_CYCLE_PRESENTATION_ENABLED=false`, bug unfixed — don't re-enable without collapsing the ~25 per-layer filter passes). **A shape removed from `phy.Space` is purged from every other shape's collision set on the spot** (backlog §54) — do not "optimize" that sweep away; systems read those sets in priority order and one stale read re-latches a removed entity forever (mechanism: [[project-ghost-references]]). ⚑ **A content edit does NOT invalidate the Go test cache**: after any `api/` change use **`go test -count=1`**, or a stale green hides the break — measured twice (the `add-content` skill lists the content censuses it bit). ⚑ **The starting aura is pre-equipped but NOT active**; the first press of `1` switches it on. **Dev cheats:** GOD, WARP `<x·120> <y·120>` (land on a whole unit), SPEED, XP, SKILL, ANNOUNCE, THREAT, QUEST (dump / `ACCEPT` / `ABANDON` / `ADVANCE`). `make -C backend build` runs `cp-defs`; boot `-content ../api` for content iteration (schema/Go changes still need the rebuild).

## Development Principles

These principles apply to all code written or modified in this project.

### KISS — Keep It Simple, Stupid

Prefer the simplest solution that works. Avoid clever abstractions, unnecessary
indirection, or premature generalization. If a function does one clear thing in
20 lines, that's better than a "flexible" version in 80. When proposing
architecture, start with the simplest design that satisfies the actual
requirements — not the imagined future ones.

### DRY — Don't Repeat Yourself

Knowledge should have a single source of truth. If the same logic, constant, or
configuration appears in multiple places, extract it. Watch for subtler
duplication: parallel switch statements, repeated validation patterns, copy-paste
between similar systems. But: don't deduplicate things that just *look* similar
— two pieces of code that happen to be identical today but represent different
concepts should stay separate.

### YAGNI — You Aren't Gonna Need It

Don't build for hypothetical future requirements. No "we might need this later"
parameters, configuration options, or abstraction layers. Add complexity only
when there is a concrete, present need. This applies especially to the aura
system: build what the current design requires, not what every possible future
combination might require.

### TDD — Test-Driven Development

For new features and bug fixes:

1. Write a failing test that captures the desired behavior
2. Write the minimum code to make it pass
3. Refactor if needed, keeping tests green

This applies to backend Go code (`go test ./...`) primarily, and to the
frontend's pure logic modules where a runner now exists (`npm test`, see
Frontend tests). For exploratory prototype work or UI tweaks, strict TDD may be
relaxed — but any non-trivial game logic (aura calculations, combination
resolution, damage application) should have tests before or alongside the
implementation.

When fixing a bug: first write a test that reproduces it, then fix.

## Project Overview

**Aura** (formerly Berryhunter; module path `github.com/RoteRiesenRobbe/aura`, local workspace dir `aurahunter`) is a multiplayer top-down browser MMO built on the Berryhunter survival-game foundation. The repo has three main parts:

- `backend/` — Go game server (`aurad`)
- `frontend/` — TypeScript/webpack browser client using PixiJS
- `api/` — Shared FlatBuffers schemas and the authored content JSON (mobs, skills, recipes, zones, props, factions, milestones)

`docs/README.md` is the docs index — it holds the naming convention and the four-layer status model (this file = current state · `roadmap.md` "Execution order" = sequence · `plan-*.md` §13 banners = per-chunk ledgers · `MEMORY.md` = cross-session index).

**`docs/` = live work, `docs/archive/` = finished work.** Plan docs referenced by bare name below (e.g. `plan-mob-depth.md`) are in `docs/archive/` once their work has shipped; anything still in `docs/` proper has something open. When a plan's last chunk lands, `git mv` it into `archive/` and move its index line to the README's Archive section.

## Build & Run

### Backend (Go ≥ 1.22)

```bash
# One-time: copy config
cp backend/conf.local-windows.json backend/conf.json   # Windows
# or use backend/conf.default.json as a template

# Build
make -C backend build          # produces backend/aurad

# Run (dev mode serves static frontend too)
cd backend && ./aurad -dev

# Run without build (go run)
make -C backend dev
```

> **Gotcha:** after backend logic changes, rebuild the binary with `make -C backend build`.
> `go build ./...` compiles/type-checks packages but does **not** refresh `./aurad`,
> so a running `-dev` server keeps executing stale code.

> **Content iteration:** `./aurad -dev -content ../api` loads items/mobs/skills/recipes
> from the repo `api/` directory directly instead of the embedded copies — JSON edits then skip
> both `cp-defs` and the rebuild (a server restart still applies them). The boot log prints the
> content source (`Loading content source=…`). Production/default stays embedded.

`backend/conf.json` controls server port (default `2000`), day/night cycle durations, and all game-balance tuning values. `backend/tokens.list` must exist with at least one token (e.g. `plz`) for in-game commands to work.

### Local database — required for EVERY boot

`aurad` **refuses to boot** without `AURA_DB_URL`, and panics without `AURA_JWT_KEY` (step 8a
chunk 1c). That includes headless harness runs. One-time setup:

```bash
make -C backend db-up                                   # Docker Postgres, named volume, both DBs
cp backend/.env.local.example backend/.env.local        # then put a real random key in it
```

`scripts/dev-restart.sh` sources `backend/.env.local` automatically (an already-exported value
still wins), so a plain restart works in any shell. `backend/.env.local` is **gitignored** —
credentials never live in the repo.

**Two databases on one server, and the split is load-bearing:**

| Database | Role |
| --- | --- |
| `aura` | durable dev data — characters survive restarts and container removal |
| `aura_test` | **disposable** — `AURA_TEST_DB_URL` points here |

> ⛔ **Never point `AURA_TEST_DB_URL` at `aura`.** Every DB-touching test calls `store.Rollback`,
> which drops the whole `game` schema, before *and* after itself. Aimed at the dev database it
> deletes every account and character silently — the run still goes green. Use
> `make -C backend db-test`, which aims correctly.

Targets: `db-up` · `db-down` · `db-shell` · `db-test` (store + accounts vs `aura_test`) ·
`db-reset` (recreates `aura_test` empty; never touches `aura`).

⚑ **The dev database now accumulates residue.** Playwright verify runs leave `hrnss_*` characters
behind, which used to die with the throwaway container. `backend/cmd/harnessdb -cleanup` clears
them — but **stop `aurad` first**: it holds live sessions the DELETE never reaches, and cleaning up
under a running server has already corrupted save games once.

⚑ **Dump before any migration test against real data**, and stop `aurad` first so it flushes
(`💾 flushed N live character(s) for shutdown`):
`docker exec aura-dev-db pg_dump -U aura -d aura --clean --if-exists > /tmp/aura-dev-backup.sql`.
Full runbook: `docs/manual-db-migrations.md` §4.

### Frontend (Node 20 / npm 10)

```bash
# Dev server (webpack HMR on port 2001) — no Docker
cd frontend && npm install && npm run start

# Production build
npm run build                  # output goes to frontend/dist/

# Docker-based alternatives (if local Node unavailable)
make -C frontend dev           # dev server via Docker
make -C frontend build         # prod build via Docker
```

### Opening the game

```
http://localhost:2001/?token=plz&wsUrl=ws://localhost:2000/game
```

Optional dev query params:
- `&develop` — opens the draggable dev panel
- `&start-cmds=GOD,GIVE BronzeTool,...` — runs server commands on spawn

### Backend tests

```bash
cd backend && go test -timeout 60s ./...
```

The full suite runs and passes. (`backend/pkg/aura/net/net_test.go` is a manual `ListenAndServe` smoke script that used to hang the suite; it is now skipped via `t.Skip` — remove the skip to run it explicitly.)

The test runner requires generated files (`go generate ./...`). The Makefile `gen` target runs this automatically before builds.

### Frontend tests

```bash
cd frontend && npm test          # vitest run
npm run typecheck                # tsc --noEmit
```

Vitest (added with the round-4 tooltip fix) covers the pure, DOM-free logic
modules — currently `SkillTooltip.ts`. Three things to know before adding a test:

- **The environment is `jsdom`, not `node`** (`vitest.config.ts`). The client's
  module graph reaches `window` at *import* time — `Urls.ts` derives the catalog
  host from `window.location`, PixiJS wants a document — so even a pure
  formatting unit needs a browser-shaped global.
- **`vitest.setup.ts` stubs `fetch`.** `Skills.ts` and `Mobs.ts` fetch their
  catalogs on import; without the stub a unit test does real DNS. The stub
  rejects, which is the degrade path those modules are designed to survive.
- **Import `{describe, it, expect}` explicitly** — globals are deliberately off
  so `tsconfig.json`'s `types` array stays untouched. (`skipLibCheck: true` is
  on there because vitest's own `.d.ts` files use private identifiers that tsc
  otherwise reports against the app's `es5` target.)

### Code generation

```bash
# Regenerate Go enumer files and FlatBuffers bindings
make -C backend gen            # runs go generate ./...

# Regenerate FlatBuffers bindings (if .fbs schemas change)
cd api/schema && ./make.sh     # or make.bat on Windows
```

## Architecture

### Backend (ECS-based game loop)

The game server uses an **Entity-Component-System** architecture via `github.com/EngoEngine/ecs`.

- `backend/cmd/aurad/` — entrypoint; wires config, game, HTTP server
- `backend/pkg/aura/core/` — `game.go` constructs the ECS world and registers all systems; `Loop()` ticks at ~30 FPS (33 ms/tick)
- `backend/pkg/aura/sys/` — ECS systems: physics, mob AI, NPCs, skills, targeting, state (death/respawn), pre/post-update, plus `chat/`, `cmd/`, `equip/`, `statuseffects/` (deleted systems: scoreboard in the 2026-07-08 dead-feature prune, heater with step 7, decay with the §26 resource prune)
- `backend/pkg/aura/model/` — interfaces and concrete types for entities (`player/`, `mob/`, `npc/`, `prop/`, `corpse/`, `spectator/`, plus `vitals/` and `client/`)
- `backend/pkg/aura/items/mobs/` — the mob registry: definitions, catalog, `EntityType` resolution (the enclosing `items` package was deleted with the §28 item-system removal; only `mobs/` remains)
- `backend/pkg/aura/codec/` — FlatBuffers encode/decode for the WebSocket protocol
- `backend/pkg/aura/phy/` — 2D physics (circle/AABB collision, spatial hashing)

**Adding a new system:** implement `ecs.System`, register it in `core/game.go:NewGameWith()`, and add entity registration cases in the relevant `addXxx()` methods.

**Adding a new entity type:** implement the appropriate `model.*Entity` interface, update `game.AddEntity()`, and register in all relevant systems.

### Communication Protocol (FlatBuffers over WebSocket)

Schemas live in `api/schema/`:
- `client.fbs` — client→server: `Input`, `Join`, `Cheat`, `ChatMessage`
- `server.fbs` — server→client: `GameState`, `Welcome`, `Accept`, `Obituary`, `EntityMessage`, `Pong`
- `common.fbs` — shared types (`Vec2f`, `ActionType`, `AuraType`)

After editing `.fbs` files, regenerate bindings for both backend and frontend.

### Game Configuration (conf.json)

All numerical tuning lives in `backend/conf.json` (or `conf.default.json` for reference). The `game.player` block controls movement speed, aura radii, vital-sign drain/gain rates, and level-up scaling. Changes take effect on restart.

### Content Data (JSON)

All authored content lives under `api/` in eight directories — `mobs/`, `skills/`, `recipes/`, `zones/`, `props/`, `factions/`, `milestones/`, `quests/`. Each is loaded by `cmd/aurad/loaders.go` (`contentSources`); a missing directory hard-fails at boot. The `make -C backend cp-defs` target copies all eight into `backend/pkg/api/` so the Go build embeds them, so run it (or just `make -C backend build`) after editing any JSON definition — or boot with `-content ../api` to skip both (see Content iteration above). Keep `contentSources` covering every `api/` subdirectory, or a content edit silently no-ops.

### Persistence (PostgreSQL)

Since step 8a, `aurad` persists accounts and characters (with their game state) to PostgreSQL. **Every change must state its schema impact** — does it touch persisted state (accounts, characters, session/reconnect data, quest ledger, loadouts)? Even "no DB change" is a finding worth recording in the chunk ledger.

- Schema lives in `backend/pkg/aura/store/migrations/` as sequential `.up.sql`/`.down.sql` pairs, embedded via `go:embed` and auto-applied at boot (`store.Migrate`). **Shipped migration files are frozen** — schema changes are always a *new* pair, never an edit.
- Standing schema rules (`game.` namespace, no `ON DELETE CASCADE`, hash discipline, JSONB canonicalization) and the dirty-state recovery runbook: `docs/manual-db-migrations.md`. Table/column rationale: `docs/archive/plan-accounts-schema.md`.
- DB-touching tests (`store`, `accounts`) need `AURA_TEST_DB_URL` set and skip cleanly without it — "green without Postgres" is not a full pass.

### Frontend

The frontend is structured as feature modules under `frontend/src/features/`:
- `backend/` — WebSocket connection, FlatBuffers deserialization, entity snapshot management
- `core/` — game loop, entity manager
- `player/`, `vital-signs/` — local player state and HUD
- `game-objects/` — rendering entities (props/resources, mobs, characters, corpses) via PixiJS; `AuraRings`/`EffectPips`/`AuraTickIndicator` are the shared combat-readability overlays
- `input-system/`, `controls/` — keyboard/mouse/touch input
- `internal-tools/` — dev panel, console, overlay tester (only active with `?develop`)

**HUD event handling:** Use `pointerdown` (not `click`) for all interactive HUD panels. `MouseManager` (`input-system/logic/mouse/MouseManager.ts`) registers a `mousedown` listener on `document.documentElement` with `event.preventDefault()`, which suppresses the synthetic `click` event. `pointerdown` fires before this and is unaffected. `click` listeners on HUD panels silently never fire — this is not obvious from the source.

Webpack configs: `webpack.common.js` (shared), `webpack.dev.js` (HMR, port 2001), `webpack.prod.js` (minified output).

## Aurahunter Project Context

This fork of Berryhunter has been transformed into **"Aura"** — a top-down MMO.
The Berryhunter survival systems (vitals, crafting, temperature, hunger) have
been removed. The core loop revolves around the aura system described below.

The structural rename (execution-order step 7, `docs/archive/plan-rebrand-cleanup.md`)
is **done**: module path `github.com/RoteRiesenRobbe/aura`, package dir
`pkg/aura/`, binary `aurad`, FlatBuffers namespace `AuraApi`, title "Aura".
Remaining "Berryhunter" references are intentional: historical plan/archive
docs, `legacy: true`-tagged proving-grounds content, Kringel Games social/
rating links, and berryhunter.io domain URLs (no replacement domain yet).

### Vision

**Tagline:** MMO lite — resource vs. resource, as simplified as possible.

**Core principle:** Players and NPCs interact exclusively through **auras** —
circular effect fields that automatically apply to anything in range. No
targeting, no direct attacks. Positioning and cooldown timing are the only
skill expressions.

**References:** WoW Classic (progression, environmental storytelling), Gothic
1+2 (organic worldbuilding), Hotline Miami / Monaco / Rimworld (top-down art
direction — not isometric, not pixel art).

**Platform:** Browser-based.

### Core Loop

1. Player moves through a persistent shared open world
2. Encounters mobs / other players — own aura ticks automatically on anything in range
3. Damage, healing, buffs emerge from aura overlap; cooldown abilities modify temporarily
4. Combat ends → XP for all participants → possibly aura unlock
5. Level up → skill points → strengthen existing auras or unlock combinations
6. Explore world → find hints → unlock new auras / passives / cooldowns
7. Rearrange slots, adjust build, tackle harder content

### The Three Skill Categories

Players collect, level, and combine three categories of skills:

- **Active auras** — toggleable, have visible ranges in-world. **Exactly one
  active aura is on at a time**; the aura slots are a loadout (several equipped,
  one active, switchable mid-fight), not multiple simultaneously-active auras.
  Build variety comes from slot loadout, combination unlocks, and switch timing.
- **Passives** — passive bonuses, always on (these DO run in parallel)
- **Cooldowns** — active abilities with cooldown timers (triggered individually)

Mobs use the same aura system as players.

### The Resource

Every player and every NPC has exactly **one resource**. It represents HP, mana,
and everything else at once. Drops to 0 → death.

### Aura Combinations

- Combination unlocks trigger when specific skills reach specific levels
- Recipes are **curated, not algorithmic** and **not documented anywhere in-game**
  — the community discovers and shares them
- Combinations can cross categories (aura + passive + cooldown is valid)
- The result of a combination can itself be an ingredient for higher combinations
- **Variant auras** exist as rare world drops and are also combinable
- **Damage types** exist for mob resistances and build identity (fire, ice, physical, etc. — specifics TBD)

The combination system must technically support arbitrary combinations from day
one. Content (specific recipes) is added manually over time.

### Spellbook & Unlocks

The **spellbook** is the collection of all auras, passives, and cooldowns a
player has discovered. Five ways to obtain new entries:

1. **Milestone unlocks** — guaranteed at certain levels
2. **Monster kill unlocks** — certain mobs drop auras/passives on death
3. **World exploration** — clue anchor points throughout zones
4. **NPC teaching** — peaceful NPCs teach a specific aura on approach, often
   tied to nearby harvest-mobs that only that aura can damage (soft "profession"
   identity without a class system)
5. **Meta-progression** — sacrificing a max-level character unlocks new base auras account-wide

### World Design

Persistent shared open world, multiple connected zones for different level
ranges. Designed and built by hand — no procedural generation. Environmental
storytelling is central.

**Open-world dungeons** — no instances. WoW-Classic-style caves in the open world.

**Darkness & light** — certain areas (caves, tunnels between zones) are dark.
The tunnel between zone 1 and zone 2 serves as a natural tutorial for the role
concept (light aura forces a trade-off between light and damage; players can
support each other).

### Multiplayer

- Persistent shared world — everything visible, everything shared
- No formal groups in v1 — all combat participants receive XP
- No PvP initially (earliest 5 years out)
- **Players filling roles for each other is essential, not optional**, for all
  larger challenges (light support in tunnels, heal support at bosses, etc.)
- No griefing possible by design

### Numbers Are ALWAYS Placeholders

Every concrete number — max level, skill points at max, slot count, aura max
level, respec cost, drop rates, combination requirements, damage values, aura
radii — is a **placeholder** until explicitly marked as final.

Treat such numbers as examples for thinking, never as decisions made. When
numbers are relevant for an answer, ask first or propose concrete values for
discussion — never silently adopt them as set.

### Scope v1.0 (Must Have)

Accounts, aura system (base auras, cooldowns, first combinations), spellbook
with milestone and monster unlocks, progression (level, skill system, slots),
persistent world, 2–3 zones, mob types (normal/elite/boss), UI (resource bar,
XP bar, ability bar, aura panel, minimap, zone chat), campfire system, and
the **character-sacrifice loop** (moved *into* v1 by PO ruling 2026-07-19,
`plan-intermission-triage.md` item 10 / GDD §11 — it lands right after step 8
as persistence's first consumer).

~~Line-of-sight for auras~~ — **CUT 2026-07-10.** Auras pass through walls and
every environment object; props block movement, never effects. The `blocksAura`
flag was deleted 2026-07-11. See `gdd.md` §142/§163 and `roadmap.md` item 6.

### Not in v1.0

PvP, formal group system, economy, mobile, endgame raid events.

---

## Working Style

Work happens in two kinds of sessions:

- **Planning sessions** — a work item (an execution-order step) is designed plan-first and
  written up as a `docs/plan-*.md` doc: what changes and why, chunk breakdown, decisions,
  open questions, test strategy. No production code is written in a planning session.
- **Execution sessions** — a single chunk from an approved plan doc is implemented in its
  own chat, following that plan. Reference the plan doc + the chunk being implemented in
  explanations and commit messages.

Across both:

- **Plan before code, and pause between steps.** State the plan in plain text first for any
  non-trivial change (new file, new system, refactor, multi-file edit); don't silently chain
  multiple chunks in one session.
- **Propose options for design decisions** — don't commit to a direction unilaterally.
- **Never commit (or branch/push) autonomously** — only when explicitly asked.
- Treat the inherited physics, collision, and the WebSocket/FlatBuffers protocol as
  stable foundations. Extend, don't rewrite.
- When in doubt about game design intent, ask — don't infer from the codebase.

## Sanity checks after every step

Before declaring a step done:
- Run `go build ./...` from `backend/`
- Run the relevant `go test` for affected packages
- State the change's **database-schema impact** (even if "none"). If it touches persisted state: follow `docs/manual-db-migrations.md` (new migration pair, never edit shipped SQL) and run the `store`/`accounts` tests with `AURA_TEST_DB_URL` set
- For anything with a runtime surface, verify in-game (plan docs record per-chunk in-game checklists)
- Report the output — don't claim "done" without these checks.
