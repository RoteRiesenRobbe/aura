# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

<!-- HARD CAP: "Last completed" + at most TWO "Prior" entries, each with a ledger
     pointer; the whole section under ~12 KB, measured in BYTES. Rotate the oldest
     verbatim into docs/archive/status-history.md. Full ledgers: the plan-*.md
     banners. Sequence: roadmap.md "Execution order". Collapse rule: `chunk-wrap`. -->

### Recent (cap 3 — older entries: `docs/archive/status-history.md`)

- **⭐ Last completed: MAP FOG PERSISTENCE F1 + F2, the map's reveal survives a login** ✅ 2026-09-27 `376268a4` (ledger: `docs/archive/plan-map-fog-persistence.md` §9, the plan COMPLETE and archived): ⭐ the SERVER tracks each character's reveal (`pkg/aura/mapfog`: 2-unit cells in explored-only 64 × 64-cell chunks keyed by WORLD coordinates, 11 × 7 cells per new cell, the fixed AOI even in flight) as connection state with `s.discovered`'s four seams; it rides every existing save trigger and forces none. ⭐ Published once on entering the world (`GameState.map_fog`); the client merges and paints each zone's cells in one draw (`FogReveal.ts`, `MapFog.applyRevealed`), a later-entered zone on fog creation. ⚑ The save ORs into the stored bits under `FOR UPDATE`: `/select` can read a row while the previous save is still queued, and an overwrite would shrink the reveal. **Schema DB +1 table (`000003_character_map_fog`); wire +2 tables, +1 `GameState` field; conf/content NONE.** Verified: Go ok (`world` + 3 simharness placement pins red at HEAD) · `store` vs `aura_test` · frontend **1299/0** + typecheck · `f2-map-fog-persistence.mjs` 10/10 · `harnessdb -cleanup` clean. ⚑ `c1-world-map` 10/12 (letterbox legs) and `c2-campfire-markers` 12/17 (fire coordinates predate the 540 × 360 world) red, untouched code, NOT proved at HEAD. ⭐ **PO pass 2026-09-27: "works fine".**

- **Prior: AURA DRAWBACKS C2, the player CC doors** ✅ 2026-09-27 `a9b990f0` (ledger: `docs/archive/plan-aura-drawbacks.md` §11 C2; the plan COMPLETE and archived): ⭐ players can be SLOWED and STUNNED (both refused under GOD, both enter combat; a stun cancels a running cast); ⭐ stuns diminish for everyone, mobs too (D10: 100/50/25/immune, reset 540 ticks; slows never); `instant_slow` is effect type 35; the giant spider spins a slowing web and casts Paralyze. ⚑ The stun gate drops the press queues too, or they all fire when the stun ends. ⚑ A mob-cast spawn fires only while `InCombat()`. **Schema DB/conf NONE; wire +2 enum values; content +1 effect type, +1 mob, +2 skills, pin 121.** ⭐ **PO pass 2026-09-27: "done, tested, works."**

### Next

- **⭐ NEXT: a PO call, not yet ruled.** Aura drawbacks is complete. Candidates already in this section: NATURAL WEAPONS C1 (designed, ready to build), the WORLD EFFECTS planning thread, the SKILL VFX phone check, the ICON PACK distribution call.

- **⭐ NATURAL WEAPONS: DESIGNED 2026-09-27, nothing built, 2 chunks** (`docs/plan-natural-weapons.md`, PO-ruled D1-D8): C1 the `lunge` (the attacker's token jabs at the victim and snaps back, purely visual, plays at density `off`), C2 the `maul` (the mark ON the victim; `bite` and `pincer` leave `strike`, the rim bite retires). Schema DB/wire/conf NONE, vocabulary +2 kinds. ⚑ C2 opens with the `bite` art contract (§8 Q1; `wolf-jaw` is P0 on the artist's list).

- **⏸ WORLD EFFECTS: design in progress, nothing approved to build** (`docs/plan-world-effects.md`, PO session 2026-09-27, D1-D18): the word is open and blocks its C1. Owes another planning session.

- **⭐ ICON PACK: distribution is the open call** (`THIRD_PARTY.md`): atlases only on the seat holder's machine and the deployed server; other clones draw the glyphs. Alternatives: a private sidecar repo or an encrypted archive (a licence judgement). ⚑ 14 MB of PNG atlases per client load, unmeasured on the phone. ⚑ A coworker's new skill shows its glyph until the seat holder adds the manifest line and repacks.

- **⭐ SKILL VFX: all chunks built and looked; live for the PHONE CHECK** (`docs/plan-skill-vfx.md` §9): it decides cap 96 vs 192, fill rate, the packer trigger (§12f.2). ⚑ The gallery shows a 200 ms strike a fifth of its cycle, unruled. ⚑ The pyromancer's `damage_aura` roughly doubled its output, unmeasured. ⚑ The harness census misses snapshots headless (C3a-ii Findings).

- **⭐ THE UNDERWORLD owes U0 + an in-game pass** (`docs/plan-underworld.md` §7): engine done end to end; U5 content DROPPED 2026-09-10 (the PO authors in Tiled). ⛔ Nothing in U1→U4b has been walked in-game (U2 alone had three browser-only defects); §7.3 also holds the L8 campfire check and the walls-as-`paths` guidance. ⚑ U6 build-time zone placement designed, not built (§7.2). U0 = `plan-world-scale.md` S1.

- **⏸ LINE OF SIGHT (light): designed, unscheduled, inclusion NOT ruled** (`docs/plan-line-of-sight.md`, B1→B3, nothing built). ⛔ Not "what is next" (PO 2026-09-21): the aura-LoS prototype (`c42e1100`) got "we don't need it yet"; whether that covers light-only is an OPEN PO call, so no B1 without it. Today every light shines through cave walls; §7 holds 4 PO calls. ⚑ `docs/cleanup.md` entry 1 asks whether `darkAreas` should be retired.

- **⭐ ZONE NAMING owes N2, waiting on the PO's content** (`docs/plan-zone-naming.md` §6; N1 shipped 2026-09-20): `terrain` → `decals`, `polygons` → `structures`, `campfires` → `bindPoints`, `AuraTerrainType` → `AuraDecalType`. ⛔ L1: no compatibility window (`DisallowUnknownFields`), so the zone files, embedded copies and converter move in ONE commit. ⛔ L2: the zone files carry uncommitted PO authoring; land N2 after it is committed, or as an idempotent migration. ⚑ Owed from N1: `verify.sh` footer items 8-9 (eye-only).

- **⭐ ZONE POLYGONS: shipped, what is left is JUDGEMENT** (`docs/plan-zone-polygons.md` §12): three coupled [PLACEHOLDER] numbers, cell 0.5 u · boundary 1 u (⛔ L11, not checked against flight/knockback) · body cap 256; stroke ≥ cell × √2. ⚑ `Wall` authors `"texture": "null"` as a STRING and works by accident. ⚑ D6 coarsening never seen in-game. First consumer: cave walls (`plan-underworld.md` §7.1). Owed: `c3-zone-editor-level`.

- **⭐ WORLD LOOK, three live threads.** `docs/plan-world-paths.md` §12 owes **C4 only**: re-author the 372 `Sand` blobs as paths (PO-ruled 2026-09-07, a content judgement). ⏸ `docs/plan-region-primitive.md` stays live for its look sitting (texture picks, the 0.35 scale, the seam, blend width, mask density, the `Water` drift). ⭐ `docs/plan-ground-noise.md`: W1b + W1c SHIPPED 2026-09-26 `a4ad7f0c`, look sitting + phone owed (§8); W2 overlays designed, not built.

- **⭐ SERVER PERF + WORLD SCALE** (`docs/plan-server-performance.md`, `docs/plan-world-scale.md`): perf 0+3 shipped, 1/2/4/5 unstarted; scale S1 unstarted. ⚑ Re-read the perf ordering BEFORE chunk 1: PhysicsSystem was 74 % at density 10× (M1-F3), so chunk 4 may outrank it. ⛔ M1-F2's residues are recorded, NOT fixed, their own chunk.

- **⏸ Parked 2026-08-20 (PO): `plan-prototype-projectile.md`**: the SECOND in-game pass is OWED (§10; ⚑ test the cost with god OFF), deciding P2/P3 or delete. ⏸ `plan-play-bot.md` designed, nothing built. ⏸ `plan-npc-hails.md` + `plan-mob-voicelines.md` DEFERRED. ⚑ Unowned: zone-editor C3's dead Go plumbing + broken `wiki-generator/`.

- **⭐ The next map is the FIRST RELEASE MAP, CAMPS ARE CONTENT** (direction set 2026-08-22; `docs/plan-release-map.md`, nothing built, owes a planning session, §7 PO calls). Membership = a completed quest, exclusivity = `quest_at_stage` gates: no new vocab, no Go, schema NONE. ⏸ `plan-camps.md` DEFERRED. ⛔ `plan-test-world.md` DROPPED.

- **Watch items riding forward, none a chunk.** CC (`docs/archive/plan-cc-and-retaliation.md`): mobs slow AND stun players since aura-drawbacks C2, stuns diminish for everyone (D10) · CC immunity is silent in-game · a stun is wire-indistinguishable from a slow (§39) · a chain of stuns on a player is bounded by the ladder, UNSEEN in play past step two. Mob/XP tuning, unowned: per-species feel (**HP/damage re-price every placement**, now incl. the pyromancer) · the levels 21-30 gap · ⚑ the single-target cap took the most group pressure off elites and bosses, re-pricing NOT done and UNMEASURED (the sim batteries are 1 player vs N mobs).

- **⭐ backlog §52, leaving the world without a reload** (PO-asked 2026-08-11), owned by `docs/plan-leaving-the-world.md` (designed, nothing built; ⚑ line refs pinned to `1ac8078e`, re-verify first; shape (B) reset-not-teardown is plausibly one chunk). backlog §48 is blocked on it.

- ⚑ **Step 8a closed WITHOUT backups, deliberately** (PO 2026-08-04): the live DB is losable; C3's memorial is the revisit trigger. Still owed, outside that ruling: firewall, DB to localhost, credentials, non-root deploy (`plan-playtest-deploy.md` §Ops).

### Open items

- **Feedback flow + the UI pass:** new feedback lands ONLY in `docs/feedback.md` (four exit doors). UI work: `docs/plan-ui-pass.md`, direction C RATIFIED (its §4 CORRECTION block IS the spec), C1-C8 shipped and PO-approved, **next: C9 (mobile)**; PO play owed. ⏸ `plan-onboarding-cleanup.md` DEFERRED until a coworker joins.
- **Smaller open threads:** the Omni trio's PO in-game check (`9ee8cdb4`, cheat-only rigs, `omni-smoke` 17/17) · §47 stale "Connection lost" banner · §51 transient second queue entry · a character-name content filter (spam passes the charset guard) · mobile perf ceiling ("works for now") · avatar/faction defaults (blocked on `plan-avatar-system.md`) · the password-reset plan's five questions · ascension §8 leftovers (stone lore + art, [PLACEHOLDER] gate numbers, D29's ceremony seen only by its own player).
- **Known-inconclusive at HEAD**, unowned: `chunk3-charm` 6-8/9 · `c1-world-map` legs 6-7 (letterbox click) · `c2-campfire-markers` (hardcodes the pre-540 × 360 fire at (44, 10.5)) · `filler-batch` leg 1 · `chunk3b-ii-conversation` 28/34 · `accounts.TestRepeatedFailuresAreThrottled` under load (with or without `-race`, passes alone) · `AuraTiledConvert.test.ts` byte-stability ×2. ⚑ The 3 `items/mobs` census tests + the 3 `cmd/simharness` placement pins hardcode the roster: ANY new mob/NPC reddens them. ⚑ Measure a flake's rate before diagnosing it.
- **Backlog watch items** (`docs/backlog.md`): §25 D+E · §27.2.4-7 (⚑ re-survey §27.2.6) · §29 lost-WebGL-context trigger unknown · §37 skill-level/augment rework · §39 entity-presentation rework (`docs/plan-entity-presentation.md`) · §34 hard collision · §58 ANSWERED by Tiled (open until the PO moves a real texture there).
- ⭐ **M1-F5, dormancy vs. a CREDIBLE world sim** (`plan-world-scale.md` §11): **(A)** an unobserved mob-vs-mob fight never ends (a slept mob is out of `phy.Space`, so unhittable), a design ruling. **(B)** a mob can freeze mid-walk-home off its route (`model/mob/patrol.go:108-113`), a case L7 does NOT cover; a narrow D3 amendment (refuse sleep while `returnPosSet`).
- **Open PO calls:** five. ⭐ Spell builder §B11 Q7: Go validation on save for EVERY editor tab, retiring `validate.mjs`'s JS port (`docs/archive/plan-content-editor.md`) · ⭐ should `EntitiesMarshalFlatbuf`'s `default:` stop panicking? (`recover()` swallows it; the corpse bug hid eight weeks) · the portal pair's COST · does a QUEST turn-in row advertise the ability it pays? · should FireShield's flat reflect scale?
- **Standing locks:** NO CI BY CHOICE (PO 2026-08-12; revisit at roadmap step 9); the per-chunk local verify tail is the gate. Balance FINALs (growth 1.12 × maxLevel 30, regen + taper, campfire, the free base damage aura, downtime 10 s + chain 20) are asserted in `cmd/simharness/guardrail_test.go`; drop + milestone tables TUNING-OPEN. Day/night cycle OFF (re-enabling means collapsing ~25 per-layer filter passes).
- **Content rules:** new mobs must author tier + baseline (raw `maxHealth` hard-fails) and price XP with `factors.xpFactor` (absent → 1, `0` = no XP AND no nameplate, no species authors 0.5); tier ≥ elite must author `factors.ccImmune`. A skill `_comment` is an authoring note, never a session ledger. A skill file is never deleted, an `id` never changes, `maxLevel` never decreases (retire by removing unlock sources; `manual-content-authoring.md` §2). Full rules: the `add-content` skill.
- **Gotchas & dev tools:** a shape removed from `phy.Space` is purged from every other shape's collision set on the spot (§54); never "optimize" that away. ⚑ A content edit does NOT invalidate the Go test cache (`-count=1`); without `-content ../api` the EMBEDDED copy is read (`make -C backend build` after ANY `api/` edit). ⚑ A ZONE edit is HALF-LIVE (restart after a Tiled save); the directory IS the zone list. ⚑ `-debug-zones` swaps in `api/zones/.debug/` (the old 144×72 world as `world_debug` + its own copies); switching is a restart (`dev-restart-windows.sh server debug`); every `.json` there loads (never park a backup there); `-validate -debug-zones` is its only gate. ⚑ The starting aura is NOT active until `1`. ⚑ GOD short-circuits the player's `takeDamage` AND refuses slow and stun (test CC with GOD off); `DAMAGE <pct>` works under GOD. Cheats: GOD, WARP `<x·120> <y·120>`, SPEED, XP, SKILL, ANNOUNCE, THREAT, QUEST, DAMAGE.

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
