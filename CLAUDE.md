# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

<!-- HARD CAP: "Last completed" + at most TWO "Prior" entries, each with a ledger
     pointer; the whole section under ~12 KB, measured in BYTES. Rotate the oldest
     verbatim into docs/archive/status-history.md. Full ledgers: the plan-*.md
     banners. Sequence: roadmap.md "Execution order". Collapse rule: `chunk-wrap`. -->

### Recent (cap 3 — older entries: `docs/archive/status-history.md`)

- **⭐ Last completed: CAMPFIRE MENU, bind / restock / fly are conversation rows** ✅ 2026-10-20 `3efef136`, DEPLOYED LIVE 2026-10-20 as `59780288` (PO request, no plan doc; rulings noted atop `docs/archive/plan-flight-paths.md`, `plan-downtime.md`, `plan-portal-spells.md`): E at a fire opens its server conversation (`api/mobs/campfire.json`, the first `structure` conversant) with Bind & Restock / Restock / Fly (grant kinds `bind_restock`, `restock`, `fly` → `ConnectionStateSystem.CampfireRow`). The 1.7 s standing bind/restock is deleted; a fire is DISCOVERED the first tick you stand in its circle. Fly opens the departure board (`flight_offered`), which rings its origin green and closes at conversation range. Restock refills on every press; a fresh character is unbound until it binds. ⚑ Panel `range` 0.5 + player body 0.25 = the 0.75 bind circle (pinned, `cmd/aurad/campfire_test.go`); nearest conversant wins, so the client campfire override (`FlightOrigin.ts`) and the D8 door test are gone. **Schema: DB none · wire `Character` +2 bools · content +1 interaction block, +7 lang keys.** Verified: Go green bar the 2 known reds · typecheck · vitest 1812/0 · `campfire-bind-persistence` 7/7 · `c3-flight-client` 40/42 · `r4-camp` 29/31 · `hygiene-wire-prune` clean · PO hand test passed. ⚑ Harness reds are not this change: c3 4e/6f (two-page input; a one-page fly-and-walk probe moves fine), r4-camp's two camp-heal % reads; `c2-pull-through` 19/1/2 and `c1-open-portal` 15/2 flaky, 6 rewritten scripts unrun, and many venues predate the world rebuild.

- **Prior: APPEARANCE C3, the player wears a chosen medallion** ✅ 2026-10-20 `e0bd30d0` (ledger: `docs/plan-appearance.md` §12 C3, D39): `api/appearance/` (8 PONETI player busts, D39, + grey/leather rings) with its loader, lang domain and `GET /appearance` (each slot in wire order, defaults flagged); creation picks a portrait + ring (starters only), the select cards and every player token draw it; `LOOK <item-id>` cheat, live only. Wire value = 1 + position, 0 = default. ⚑ The editor's validate seam keeps its OWN list of content dirs (`aurad-validate.mjs`): a new `api/` dir goes there too. PO in-game checks passed 2026-10-20. **Schema: DB +1 migration `000004_appearance` (`characters.ring` + `appearance_unlocks`) · wire `Character` +2 · catalog +1 endpoint · accounts create/list fields · content +1 dir.** Verified: Go green bar the 2 known reds · typecheck · vitest 1819/0 · `c1-medallions` 27/27 · `r4-badge` 7/7 · `hygiene-wire-prune` clean · editor smoke 0.

- **Prior: APPEARANCE C2b, one `Medallion` component for every token** ✅ 2026-10-19 `6eef8da6` (ledger: `docs/plan-appearance.md` §12 C2b, D37-D38): disc, portrait, ring and the tier/stance tints moved out of `Mob` into `game-objects/logic/Medallion.ts`, built by `Mob` and `Character`. Companion, the three squad companions, ArmySoldier and Bramble are medallion species (`_nobg` busts, collider size, no roll); the player wears a friendly disc + the grey ring until C3; Campfire/Camp are plain objects (D38). `withBorder`/`borderFile`/`Character.border` deleted and pinned out (a token is a medallion or on `PLAIN_OBJECTS`). ⚑ A repack changes every portrait's canvas hash with no visible change (atlas bleed): compare leaf dumps against HEAD built on the NEW atlas. PO look passed 2026-10-19. **Schema: NONE** (client art config + pack manifest). Verified: typecheck · vitest 1803/0 · leaf dump 29 groups identical, 4 intended diffs · `c1-medallions` 17/17 · `r4-badge` 7/7 · `hygiene-wire-prune` clean · editor smoke 0.

### Next

- **⭐ APPEARANCE + MEDALLIONS: C0a-C3 DONE (C3 2026-10-20), NEXT = C4 (the in-game picker)** (`docs/plan-appearance.md` §7 + §12, D1-D39): the "Appearance" HUD button + hotkey + phone-sheet entry, `SelectAppearance` on the wire, the choice persists (the save path the live-only `LOOK` cheat lacks). Still starter set only. Then C5 (unlocks, `appearance_unlocks` already shipped) → C6; C0b when the pilot art lands. ⚑ C1's phone check rides the next deploy.

- **⭐ HERDING: H1 + H2 BUILT 2026-10-17 (H1 `75376c13`, H2 `c9fa2bb4`), PO look + text approval owed** (`docs/plan-herding.md`): Hans's sheep run from players; drive six into his pen (2 s inside counts, credit to every herder from the last 10 s). Replaces "A Herd Astray" in play, the file stays. H2 = `back-to-the-pen`: flock, then Baabara/Woolliam/Lambert as herdable personalities in three dangerous spots; talking optional; `the-strays` parked (cleanup.md #7). **Schema: DB/conf NONE · wire +1 EntityType (`Sheep`, placeholder art) · content +`herd` block +`herd` objective · zone +1 region.**

- **⭐ PASSAGES: DESIGNED 2026-10-17, approval owed** (`docs/plan-passages.md`): exits get their own Tiled layer (talk exits + touch areas), a `Passage` entity with no health bar, five looks, words from the destination or the exit. P1 (the layer + migration) is first; §7 holds Q1-Q9. **Schema: DB/conf NONE · wire +1 EntityType +2 fields · zone +2 arrays.**

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
- **Dev tools:** `-debug-zones` loads `api/zones/.debug/` (the old 144×72 world); switch = restart (`dev-restart-windows.sh server debug`); every `.json` there loads (no backups); `-validate -debug-zones` gates it. ⚑ The starting aura is off until `1`. ⚑ GOD skips `takeDamage` AND refuses slow and stun (test CC with GOD off); `DAMAGE <pct>` works under GOD. Cheats: GOD (toggle; `on`/`off`), WARP `<x·120> <y·120>` or `<spawnpoint-id>`, HOME (bound fire), `#JUMPER` (client-side: click the world/minimap/map to warp), SPEED, XP, SKILL (`all` = every skill, mob skills included), WIZARD (toggle: SKILL all + cooldowns reset and never started), ANNOUNCE, THREAT, QUEST, DAMAGE, REVEALMAP (whole map seen, persists), LOOK `<appearance-item-id>` (wears any portrait or ring, live only).

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

> ⭐ **DOCKER IS OPTIONAL. What aurad needs is a reachable PostgreSQL, not a container**
> (recorded 2026-09-12, PO correction). The `make db-up` target below is *one* way to get one
> and the only one this file used to mention, which is how "no Docker on this host" became a
> recorded reason for not booting the game — **three times, and wrongly each time.** A native
> Postgres serving `AURA_DB_URL` is fully equivalent; nothing in the server, the harness or
> the test suite can tell the difference.
>
> ⚑ **The Windows dev box runs exactly that** and needs no Docker at all:
> `scripts/dev-restart-windows.sh` builds, boots and health-checks `aurad` against a native
> service (`ensure_db()` starts it if it is not already listening, and no-ops when something
> already answers on the port). ⛔ **`docker` is not even on PATH there** — so if you are on
> that machine and a doc, a status entry or your own earlier note says the game cannot be
> booted for want of Docker, **that note is wrong: run the script.**
>
> ⚑ **And the environment may already be set.** `AURA_DB_URL` / `AURA_TEST_DB_URL` /
> `AURA_JWT_KEY` can come from `backend/.env.local` **or** from exported machine-scope
> variables — the Windows box uses the latter, so `backend/.env.local` is legitimately
> ABSENT there. ⛔ A missing `.env.local` is therefore NOT evidence that the game cannot
> boot. Check `env | grep AURA_` before concluding anything.

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
cd backend && go test -timeout 60s ./...
```

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

~~Line-of-sight for auras~~ — **CUT 2026-07-10.** Auras pass through walls and
every environment object; props block movement, never effects. The `blocksAura`
flag was deleted 2026-07-11. See `gdd.md` §142/§163 and `roadmap.md` item 6.
⚑ **Prototyped anyway on 2026-08-15** (branch `prototype/aura-los`, `c42e1100`,
deliberately never merged) so the PO could feel what the cut gave up. **PO verdict,
recorded 2026-09-21: "we don't need it yet, or it is just a different game
entirely."** The cut stands and the branch is parked.

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
