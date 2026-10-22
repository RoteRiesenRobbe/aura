# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

<!-- HARD CAP: "Last completed" + at most TWO "Prior" entries, each with a ledger
     pointer; the whole section under ~12 KB, measured in BYTES. Rotate the oldest
     verbatim into docs/archive/status-history.md. Full ledgers: the plan-*.md
     banners. Sequence: roadmap.md "Execution order". Collapse rule: `chunk-wrap`. -->

### Recent (cap 3 — older entries: `docs/archive/status-history.md`)

- **⭐ Last completed: CITY ASSETS K2, cathedral + cemetery** ✅ BUILT 2026-10-22 `deb54aaf`, PO look after K6 (R8) (ledger: `docs/plan-city-assets.md` §11 K2): seven SVG heroes, each a new EntityType (`CathedralNaveRoof` 127, 10×24, a roof at 0.25, baked 1200 × 2880; `Pew` 128; `Altar` 129; `Mausoleum` 130; then, drawn at the PO's ask, the transept + apse roof pieces 131/132 and one `BellTower` 133); 10 `PropPlaceholder` defs, among them the flickering `CandleStand`. The three roof pieces fade as one, pinned in `RoofReveal.test.ts` from the defs. Grey slate + gold; the cross marks the north west front, so altar and pews face south. Palette regenerated (gids shift again); tracker + `prop-worklist.md` §C2. ⚑ Found: `generate-palette.mjs` reads a child element's size for 21 SVG tiles (roadmap watch item). **Schema: DB/conf none · wire +7 EntityType · content +17 props.** Verified (R8 tail, the follow-up untested per the PO): go build · `world` red only on the known `TestPropContent_C1bMigration…` · `-validate` 0 findings, props 47 → 64 · vitest 1883/0 · typecheck · `npm run build` · `verify.sh` green.

- **Prior: CITY ASSETS K1, market + fountain** ✅ BUILT 2026-10-22 `6e29ef99`, PO look owed (ledger: `docs/plan-city-assets.md` §11 K1): three SVG heroes, each a new EntityType (`MarketStallRoof` 124, the first shipped `roof`, fades to 0.3; `MarketCounter` 125; `CentralFountain` 126, r 3), the city's drawing-style reference; five `PropPlaceholder` defs, the first shipped (Barrel, SackPile, ProduceBasket, Bench, LampPost with light 0.25 `#ffd890`); palette regenerated (every prop template's `gid` shifts: the tileset is alphabetical, harmless); tracker rows + `prop-worklist.md` §C. Headless probe on the debug world: heroes at aspect, boxes labelled, awning 1 → 0.3 from N/E/W, the counter holds the south, lamps light the dark. Scratch placements left UNCOMMITTED in `.debug/world_debug.json` for the PO look. **Schema: DB/conf none · wire +3 EntityType · content +8 props.** Verified: go build · `world` red only on `TestPropContent_C1bMigration…` (red at HEAD) · `-validate` 0 findings, props 39 → 47 · vitest 1879/0 · typecheck · `verify.sh` green · `hygiene-wire-prune` clean.

- **Prior: APPEARANCE C5, ownership and unlocks (server + wire)** ✅ DONE 2026-10-21, PO look passed 2026-10-22 `0533ef28`, DEPLOYED LIVE 2026-10-22 as `d9be8020` (ledger: `docs/plan-appearance.md` §12 C5; PO split it: C5 + C5c client): `skill_level` condition; locked catalog items (`scope` + conditions; `ring-forest` character L3, `ring-leather-claws` bloodline 1 ascension, `villager` account for Village Welcome, all [PLACEHOLDER]); ONE revision watch (level/skill/quest) grants and toasts, never revokes; grants ride `SaveCharacter` per scope (the account write path, L1); owned set on the ticket, carried at all four doors; both validators read it; D21a grants in `AscendCharacter`. ⚑ Found + folded: the ticket's bloodline + account were lost on respawn/reload/revive (`lineage`). Villager bust (`Human_01`) passed the PO look. **Schema: DB none · wire GameState +1, ConversationLock +1 field +1 kind, +1 key · accounts list fields · ticket +1.** Verified: Go green bar the 3 known reds · vitest 1879/0 · `c1-medallions` 49/0/0 · `hygiene-wire-prune` clean · `chunk2-accounts` 24/24.

### Next

- **⭐ APPEARANCE + MEDALLIONS: C0a-C5 DONE (C4 + C5 PO looks passed 2026-10-22), NEXT = C5c (the unlock client)** (`docs/plan-appearance.md` §7 + §12, D1-D39): C5c = locked entries greyed with hint + progress (D25; the client lacks the slot's ascension count in game), glow + highlight (D13, diff `appearance_owned`), creation offers account + slot items with the predecessor preselect (D12; the list already carries them), `chunk2-accounts` leg. Then C5b (bonus only; the pick moved to `plan-ascension-ceremony.md` AC2) → C6; C0b when the pilot art lands. ⚑ C1's real-phone check is possible now (live since `59780288`).

- **⭐ ASCENSION CEREMONY: DESIGNED 2026-10-22, nothing built, approval owed** (`docs/plan-ascension-ceremony.md`): a stone authors ordered `ceremony` steps (gift, then look steps in the Appearance picker, one slot per step, IN ADDITION to the gift, skippable); Back per step; a summary lists every pick and its one Confirm starts the channel; leaving drops the draft. AC1 (walk + gift + summary) → AC2 (look step); AC3 (after AC1) = the stone's `heirHome`: the heir wakes at that bind point, the last ascension counts, per-pick homes designed for (D14), not built. Replaces appearance C5b's pick half and world-effects §3.4. **Schema: DB none · wire `ConversationNode` +1, `ConversationOption` +1 · content +2 stone keys +1 row source.**

- **⭐ CITY ASSETS: K1 + K2 BUILT 2026-10-22, NEXT = K3 lazaret + slums; R8: per chunk only the cheap tail (§6), probes + harnesses + full Go suite + the PO look once after K6 (K1 scratch props sit uncommitted in `.debug/world_debug.json`)** (`docs/plan-city-assets.md` §5 + §11): Dionsburg prop kit K3 → K6; a building = `structures` wall shell + touching `roof` pieces + interior. **Schema per chunk: wire +N EntityType · content +N props.**

- **⭐ HERDING: H1 + H2 BUILT 2026-10-17 (H1 `75376c13`, H2 `c9fa2bb4`), PO look + text approval owed** (`docs/plan-herding.md`): Hans's sheep run from players; drive six into his pen (2 s inside counts, credit to every herder from the last 10 s). Replaces "A Herd Astray" in play, the file stays. H2 = `back-to-the-pen`: flock, then Baabara/Woolliam/Lambert as herdable personalities in three dangerous spots; talking optional; `the-strays` parked (cleanup.md #7). **Schema: DB/conf NONE · wire +1 EntityType (`Sheep`, placeholder art) · content +`herd` block +`herd` objective · zone +1 region.**

- **⭐ PASSAGES: P1-P6 BUILT, merged and LIVE 2026-10-20 (`59780288`); a coworker owns it** (`docs/plan-passages.md`): exits on their own Tiled layer (talk exits + glowing touch areas), a `Passage` entity with no health bar, looks, words from the destination or the exit. Left: the barn exit's test id `fallow-test-glow`, `passages.mjs` venue drift, an unreproduced covered name (banner). **Schema: DB/conf NONE · wire +1 EntityType +2 fields · zone +2 arrays.**

- **⭐ LOCALIZATION C0a-C9: MERGED to main** (C0a-C6 2026-10-14, C7-C9 `3cee3500` 2026-10-15; `docs/plan-localization.md` §10): German complete (`aurad -lang-status` 0/0), detection ON, no allowlist (D13). ⭐ Owed (PO 2026-10-15): a German string approval and a manual translation pass, nothing else. Dialogue + `stock.*` live in `conversations.arb`; `tools/lang/sheet.mjs` round-trips a CSV (manual-localization.md §6).

- **⭐ AUDIO: C0 (design) DONE 2026-10-15, C1 (foundation) is next** (`docs/plan-audio.md` §5a rulings R1-R10, §6 chunks C1-C6): v1 = lanes A-F (table + §19 loading fix, music stack menu < region < event, one-shots, region music + footsteps, ascension music, credits); no ambience, no stems. Muted stays the default (R1). Sounds come from the internal composer and artist (R9): build against placeholders until files land. Takes over `archive/plan-region-audio.md`.

- **⭐ BUFF TRAY: real-phone check, now possible (live since the 2026-10-14 deploy of `82044c23`)** (`docs/plan-buff-tray.md` §11 C3): hold feel, no callout menu, the tooltip's length in landscape. Then archive the plan (world-effect tenants belong to that plan's C2).

- **⭐ SKILL VFX: live for the PHONE CHECK** (`docs/plan-skill-vfx.md` §9): cap 96 vs 192, fill rate, the packer trigger (§12f.2). ⚑ Unruled: the gallery's 200 ms strike. ⚑ Unmeasured: the pyromancer's `damage_aura` ~doubled its output.

### Open items

- **Parked threads, watch items and open PO calls** live in `docs/roadmap.md` "Parked threads and watch items"; harness venues and known-inconclusive harnesses in the `verify` skill (moved out of this file 2026-10-18 to keep it small). Check there before starting anything not listed here.
- **Feedback + UI:** feedback lands ONLY in `docs/feedback.md` (four exit doors). `docs/plan-ui-pass.md`: direction C (its §4 CORRECTION block IS the spec), C1-C8 PO-approved, **next C9 (mobile)**; PO play owed. ⏸ `plan-onboarding-cleanup.md` until a coworker joins.
- **Standing locks:** NO CI BY CHOICE (PO 2026-08-12; revisit at step 9); the local verify tail is the gate. Balance FINALs (growth 1.12 × maxLevel 30, regen + taper, campfire, free base aura, downtime 10 s + chain 20) live in `cmd/simharness/guardrail_test.go`; drop + milestone tables TUNING-OPEN. Day/night OFF (re-enabling means collapsing ~25 filter passes).
- **Content rules** (full: the `add-content` skill): new mobs author tier + baseline (raw `maxHealth` hard-fails) and `factors.xpFactor` (absent → 1, `0` = no XP AND no nameplate); tier ≥ elite authors `factors.ccImmune`. Quest and stage ids are slugs (a-z, 0-9, `-`; the loader refuses others). A skill file is never deleted, an `id` never changes, `maxLevel` never drops (retire by removing unlock sources, `manual-content-authoring.md` §2); a `_comment` is never a ledger. ⭐ English lives in `api/lang/en/*.arb`, never inline in a content file (`plan-localization.md` D27): write it in the content editor, or draft it inline and run `node tools/lang/extract-english.mjs`; its German lands in `api/lang/de/` in the same change (D23), then `UPDATE_LANG=1 go test -count=1 -run TestLang ./cmd/aurad/` refreshes the records; a mob a kill/harvest quest counts carries its plural in its name (D24); style: `docs/manual-localization-de.md`.
- **Gotchas:** a shape removed from `phy.Space` leaves every collision set at once (§54); never "optimize" that away. ⚑ A content edit does NOT invalidate the Go test cache (`-count=1`); without `-content ../api` the EMBEDDED copy is read (rebuild after ANY `api/` edit). ⚑ A ZONE edit is HALF-LIVE (restart after a Tiled save); the directory IS the zone list. ⚑ Skill FX draw BELOW darkness: look in daylight (the debug world's caves are dark).
- **Dev tools:** `-debug-zones` loads `api/zones/.debug/` (the old 144×72 world); switch = restart (`dev-restart-windows.sh server debug`); every `.json` there loads (no backups); `-validate -debug-zones` gates it. ⚑ The starting aura is off until `1`. ⚑ GOD skips `takeDamage` AND refuses slow and stun (test CC with GOD off); `DAMAGE <pct>` works under GOD. Cheats: GOD (toggle; `on`/`off`), WARP `<x·120> <y·120>` or `<spawnpoint-id>`, HOME (bound fire), `#JUMPER` (client-side: click the world/minimap/map to warp), SPEED, XP, SKILL (`all` = every skill, mob skills included), WIZARD (toggle: SKILL all + cooldowns reset and never started), ANNOUNCE, THREAT, QUEST, DAMAGE, REVEALMAP (whole map seen, persists), LOOK `<appearance-item-id>` (wears any portrait or ring, owned or not; saved like a pick since C4).

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

Before proposing new code or calling something new work, find the existing feature
that already does it for another entity type and extend that. When a concept gets a
new system, list every builder or door that shares it and move them all, or say which
ones stay (the totem tooltip and the companion medallions, 2026-10).

### YAGNI — You Aren't Gonna Need It

Don't build for hypothetical future requirements. No "we might need this later"
parameters, configuration options, or abstraction layers. Add complexity only
when there is a concrete, present need. This applies especially to the aura
system: build what the current design requires, not what every possible future
combination might require.

### Localization — no literal player-facing text

UI text via `t()` and `frontend/src/lang/<locale>/frontend.arb`, server text as
a key + typed args (`lang/message.go`), content text in `api/lang/`; German in
the same change. Read `docs/manual-localization.md` before adding any.

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

`docs/README.md` is the docs index — it holds the naming convention, the feedback pipeline (raw feedback → `docs/feedback.md` → plan doc / ruling / backlog watch / dropped; plan docs never double as intake) and the four-layer status model (this file = current state · `roadmap.md` "Execution order" = sequence · `plan-*.md` §13 banners = per-chunk ledgers · `MEMORY.md` = cross-session index).

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
chunk 1c). That includes headless harness runs.

> ⭐ **Docker is optional: aurad needs a reachable PostgreSQL, not a
> container** (PO 2026-09-12; "no Docker on this host" was given as a reason
> not to boot three times, wrongly each time). The Windows box runs a native
> Postgres and has no `docker` on PATH: `scripts/dev-restart-windows.sh`
> builds, boots and starts the DB service itself. Its `AURA_*` variables are
> exported at machine scope, so a missing `backend/.env.local` proves nothing:
> check `env | grep AURA_` before concluding anything.

One-time setup, either way:

```bash
# (a) Docker — one command, nothing to install, used by the Linux/WSL setup
make -C backend db-up                                   # container, named volume, both DBs

# (b) Native Postgres — install once, then create the role and the two databases
#     (any Postgres ≥ 14; the Windows box runs 18 as a Windows service)
createuser -s aura && createdb -O aura aura && createdb -O aura aura_test

# …then EITHER export the three variables at machine scope, OR:
cp backend/.env.local.example backend/.env.local        # then put a real random key in it
```

`scripts/dev-restart.sh` and `scripts/dev-restart-windows.sh` both source `backend/.env.local`
automatically **and** let an already-exported value win, so a plain restart works in any shell
under either setup. `backend/.env.local` is **gitignored** — credentials never live in the repo.

**Two databases on one server, and the split is load-bearing:**

| Database | Role |
| --- | --- |
| `aura` | durable dev data — characters survive restarts, and container removal where there is a container |
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
(`💾 flushed N live character(s) for shutdown`). Docker:
`docker exec aura-dev-db pg_dump -U aura -d aura --clean --if-exists > /tmp/aura-dev-backup.sql`.
Native: `pg_dump "$AURA_DB_URL" --clean --if-exists > /tmp/aura-dev-backup.sql` — same file, and
it restores into either. Full runbook: `docs/manual-db-migrations.md` §4.

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
go -C backend test -timeout 60s ./...
```

⚑ **Never cut the suite's output with `head`/`tail`**: on 2026-10-20 a `tail -40` hid a third
FAIL and the run was reported green. Scan all of it (`2>&1 | grep -E '^(FAIL|--- FAIL|panic)'`)
and report the count.

> ⚑ **`-race` needs `export PATH="/c/msys64/mingw64/bin:$PATH"` first** (Windows +
> MSYS2). `gcc` is found through the MSYS alias `/mingw64/bin`, but the Windows
> loader starting the spawned `cc1.exe` is not, so cc1 exits **127 with empty
> stderr** and you get a bare `cgo.exe: exit status 2` → `[build failed]` naming
> nothing. `ldd` reports every dependency resolved, because it resolves through
> the same alias — so it actively misleads here. Without the prefix it looks
> like a broken toolchain; it is a PATH translation.

The full suite runs and passes. (`backend/pkg/aura/net/net_test.go` is a manual `ListenAndServe` smoke script that used to hang the suite; it is now skipped via `t.Skip` — remove the skip to run it explicitly.)

The test runner requires generated files (`go generate ./...`). The Makefile `gen` target runs this automatically before builds.

### Frontend tests

```bash
npm --prefix frontend test        # vitest run
npm --prefix frontend run typecheck  # tsc --noEmit
```

Vitest covers the pure logic modules. Before adding a test: the
environment is **`jsdom`** (the module graph touches `window` and PixiJS at
import time); **`vitest.setup.ts` stubs `fetch`** (catalog modules fetch on
import; the stub rejects, which they survive); **import `{describe, it,
expect}` explicitly** (globals are off so `tsconfig.json`'s `types` stays
untouched; `skipLibCheck` is on for vitest's own `.d.ts`).

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
docs, Kringel Games social/rating links, and berryhunter.io domain URLs (no
replacement domain yet). (The `legacy: true` proving-grounds content was
deleted at zone-editor C3, 2026-08-16.)

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

~~Line-of-sight for auras~~: **CUT 2026-07-10** (`gdd.md` §142/§163,
`roadmap.md` item 6). Auras pass through walls and every environment object;
props block movement, never effects. The parked prototype
(`prototype/aura-los`, `c42e1100`) confirmed it, PO 2026-09-21: "we don't
need it yet, or it is just a different game entirely."

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
- **Never commit (or branch/push) autonomously** — only when explicitly asked. A chunk wrap
  is that ask for its own commit (the `chunk-wrap` skill); a push still needs its own.
- **No `cd` in shell commands.** A `cd … &&` chain triggers a permission prompt even in auto
  mode (PO 2026-10-21): use absolute paths, `git -C`, `make -C`, `go -C`, `npm --prefix`, and
  change files with Edit/Write, not shell heredocs.
- **Several sessions may share this working tree.** When committing, stage only the files this
  session changed, by path (never `git add -A` / `git add .`), and check `git status` and the
  staged diff for changes you did not make; leave those for their own session.
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
