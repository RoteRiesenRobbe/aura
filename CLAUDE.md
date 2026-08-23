# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

<!-- HARD CAP: "Last completed" + at most TWO "Prior" entries, each ≤10 lines with a
     ledger pointer. When adding a new entry, move the oldest verbatim to
     docs/archive/status-history.md. FULL per-chunk ledgers live in the plan-*.md
     banners; the sequence lives in roadmap.md "Execution order". Never paste a full
     session banner here — see the `chunk-wrap` skill for the collapse rule. -->

### Recent (cap 3 — older entries: `docs/archive/status-history.md`)

- **⭐ Last completed: TILED ZONE AUTHORING - ALL SEVEN CHUNKS** ✅ 2026-08-23, first commit `0b8ba13f` (ledger: `docs/archive/plan-tiled-authoring.md` §11 - the plan is COMPLETE + archived): `api/zones/world.json` now opens in **Tiled**, edits visually, and Ctrl+S writes it back **byte-identical**. ⭐ The feasibility answer that decided the tool: **none of Aura's world is a tilemap** - every array is freeform floats, no grid, no snapping - so only OBJECT layers matter, and there LDtk supports neither entity rotation (#841) nor flipping (#978), which would have left the 549-piece `terrain` array (backlog §58, the actual parked pain) uneditable. Tiled also takes `registerMapFormat` with both `read` and `write`, so there is **no intermediate .tmj and no converter step** - `world.json` stays the single source of truth and BOTH editors write it identically (D4: the in-game editor is not retired; it keeps the one thing Tiled cannot do, editing while standing in the live world). New vocab: **byte-stability as the acceptance criterion** (D6) · **the layer IS the meaning** (D5) · **inherit sentinels** (C6) · **the completeness pin** (C5). Chunks: C0 spike · C1 read+write all six arrays · C2 generated palette from the game's own assets · C4 save-time validation · C5 one-command content + the pin · C6 typed spawn form · C3 manual + verify leg + bookkeeping. ⭐ **C4 refuses what the server would reject, while you are still looking at the object**: a prop dropped on the `spawns` layer is named with its **Tiled object id** (Edit > Select Object by Id jumps to it) AND told which layer it belongs in; `terrain.type` is now validated **somewhere for the first time** (the server ignores it, the client dereferences `undefined` at render time). ⭐ **C6's sentinels are the whole trick**: Tiled cannot express "absent", so each tri-state knob borrows a value the loader already rejects - and ⚑ `wanderRadius` and `respawnTicks` **cannot use 0**, because 0 is a real authored value for both (forced-stationary, 19 spawns; respawn-next-tick, exactly the 17 NPCs). The mapping lives in ONE function (`readSpawn`), and because the class defaults ARE the sentinels the design is robust to whichever way Tiled treats default-valued properties - which is the half that cannot be tested headlessly. ⚑ **AuraProp deliberately gets NO members**: `blocksMovement` is a bool with no spare value, so a default would risk flipping all 777 props. ⭐ **C5's pin scrapes `zone.go`'s json tags** and fails red the moment the format grows a field the converter would silently drop - proven red on purpose before being trusted; its exception set holds exactly `legacy`. **Schema: NONE at every layer** (no game code, no wire, no DB) - dev tooling + static content only. Verified: vitest **439/439** (64 in the new `AuraTiledConvert.test.ts`) · `tsc --noEmit` clean · generator idempotent · real-Tiled round-trip byte-identical in both trailing-newline conventions, re-runnable as **`bash tools/tiled/verify.sh`**. ⭐ **The GUI pass happened same-day and found the one defect headless could not**: a plain-string property SHADOWS the class member that types it, so the mob dropdown only appeared after resetting the field. Fixed by setting enum properties as TYPED values (`tiled.propertyValue`, which THROWS on an unregistered type - hence a bare-string fallback for the no-project flow) and by overriding only what the file actually authored; ⚑ a typed enum reads back as an INDEX, never the string, so the generator now publishes `ENUM_VALUES`. **PO re-check PASSED 2026-08-23** ("dropdown works") - nothing outstanding on this plan. Also new: **`.gitattributes`** pinning `*.sh` and `api/zones/*.json` to LF (a CRLF checkout breaks install.sh on Linux and makes the byte-check report ~14600 false differences). Next: the GUI pass, then `plan-prop-scale.md` C1 (4 open PO calls) - C2 there is blocked on the rotation ruling.
- **Prior: MOB PATHFINDING PASS** ✅ 2026-08-23, `c31e2eed` (no plan doc - direct PO session off a live wolf-pile screenshot; this entry is the ledger): three fixes in `model/mob`, TDD. **Measured first**: world.json blockers in a `phy.Space`, 220 grid-sampled 12 u walk-home runs - **20.5% never arrived at HEAD** (the steering latch SURVIVES the idle-walk dwell, so every retry replays the identical jammed walk); after: **0%** (41 warped, rest honest). (1) **Clearance-gated detours** (`pathClearAlong`, steering.go): body-sized samples along the desired line (probe+buffers reused, alloc-free); a committed detour re-tests every 10 t and releases at the first opening the body FITS; head-on with a clear line never latches; all oscillation pins untouched. (2) **Walk-home warp** (patrol.go): each failed budget resets the latch (fresh side pick), after 3 fails the mob evade-warps to its target. (3) **Camp force-leash** (stuck.go/mob.go; PO ruling 2026-08-23 softening the 2026-07-20 eternal camp): ~30 s cumulative no-progress camp force-leashes despite the wall-blind sensor; target-moved >1 u resets the clock (kiting never trips it); the leashed target is acquisition-IGNORED ~30 s (else the sensor re-latches next tick), threat retaliation still overrides. Consts [PLACEHOLDER]: warp after 3 · force-leash/ignore 900 t · margin 0.05 / reach 3.0 / retest 10 t. **Schema NONE**, frontend untouched. ⚑ Residuals: gap-refusal REDUCED not solved (nav-grid A* is the structural fix, PO "not yet"); fleeing prey still wedges into corners (PO chose the wolf side). Verified: 4 red-first tests · full `-count=1` · `-race` mob/sys/simharness · guardrails unshifted · boot 0 WARN/0 ERROR · `chunk2-follower` 6/6 (engage leg SCORED, was INCONCLUSIVE ×3) · PO in-game pass 2026-08-23 ("tested works").
- **Prior: QUEST TRACKER HUD** ✅ 2026-08-23, `ffa91089` (no plan doc - direct PO mockup session; this entry is the ledger): the journal button leaves the top-left column for the minimap column under M Map, and beneath it one chrome box per RUNNING quest shows title + the LAST current-stage objective line verbatim ("- 0/6 boars killed"); a box click opens the journal turned to that quest; width 15vw ("as big as the map"), the list scrolls once it would reach #zoomControl. A pure client second reader of the per-tick quest ledger (`questTrackerRows` pure fn in JournalModel.ts + thin `QuestTracker.ts` with the journal's signature guard) - **schema NONE, backend untouched**. ⚑ **TWO "J Journal" DOM nodes BY DESIGN**: the ☰ sheet is #leftColumn restyled with nothing reparented, so mobile keeps `#journalButton` (desktop hides it via a single-id selector the `html.mobile` re-show outranks) while desktop uses `#questTrackerJournal`; the tracker is hidden on phones - the mobile UI pass inherits the pair. Verified: vitest 380/380 (+5 TDD) · typecheck · headless probes (rows, click-through, toggle, 13-quest scroll, geometry vs the zoom column, 0 console errors) · `chunkC3-journal.mjs` FULLY green + its documented probe SKIP · mobile-layout leg 7 red re-proven pre-existing (the sheet's button renders; `#registrationNag` covers it - the known deferred item). ⭐ **Fixed 3-week harness rot the gate surfaced**: chunkC3's wolves leg still asserted "slain" after `ac0f8a11` (2026-08-02) re-worded the tracker to "killed" - red since then and NOT in the known-red list; now green incl. the kill-counter leg. PO in-game pass 2026-08-23 ("tested works").

### Next

- **⏸ Parked 2026-08-20 (PO choice, resume later): `plan-prototype-projectile.md`** - P1 + five PO-session-1 fixes shipped 2026-08-19; the SECOND in-game pass is OWED (§10 items 1, 2, 4, 5 + 13; setup `SKILL ThrowMine`/`ThrowBomb`, ⚑ GOD makes a cooldown free so test the cost with god OFF). Its verdict decides P2 (drift, now also owning the travel-to-position ask) and P3 (mob thrower) or delete. Item 7 ANSWERED: aim stays walk-direction. **In flight instead: `plan-npc-hails.md`** · `plan-play-bot.md` (C0-C3). ⚑ Unowned leftovers ride in the plan docs: `TICKING_TYPES` silent-failure set (SkillTooltip.ts) · zone-editor C3's dead Go legacy plumbing + broken `wiki-generator/` · the non-reproducible stale `backend/pkg/api/mobs/` report (re-verify on the finder's checkout).

- **⭐ DIRECTION SET 2026-08-22: the next map is the FIRST RELEASE MAP, and CAMPS ARE CONTENT** (`docs/plan-release-map.md` - the authoritative record; nothing built, map not yet designed). Membership = a completed quest; exclusivity = `quest_at_stage` gates; the whole Gothic arc is authorable in shipped vocabulary, **no new vocab, no Go, schema NONE**. ⛑ The two engine rules constraining every camp file are in `manual-content-authoring.md` §6 (a terminal stage never re-matches → a durable choice is its OWN quest id; `not_started` re-matches after abandon → seal at COMPLETION); the permanence invariant is a content pattern guarded by a pin in `quests/content_test.go`. ⏸ `plan-camps.md` DEFERRED not cancelled (buys hostile standing + server-enforced permanence; ⛑ moving the quest ledger off `character_id` would silently kill the free post-ascension reroll). ⛔ `plan-test-world.md` DROPPED, archived (its §1 transfers - F1-F4 bounds + measured densities - survive; D1-D8 do not). Execution-order slot + does-it-replace-world.json: open PO calls (§7).

- **CC watch items ride forward** (`docs/archive/plan-cc-and-retaliation.md`), none a chunk: can a mob stun a *player*? (`plan-skill-vocab` §3.1) · CC immunity is silent in-game · a stun is wire-indistinguishable from a slow (§39 dependency) · ⚑ confirm D10's Paralyze-on-GiantSpider ("the elite spiders" - no elite-tier spider exists).

- **Mob/XP tuning threads, unowned** (archived: `plan-xp-formula.md`, `plan-world-replacement.md`): per-species feel tuning (speed/xpFactor cheap; **HP/damage re-price every placement**, cost table in the archived banner) · levels 21–30 standing gap (D5) · the §12.2 rising-absolute-award note.

- **⭐ backlog §52 - leaving the world without a reload, PO-asked 2026-08-11.** Owned by **`docs/plan-leaving-the-world.md`** (designed 2026-08-04, nothing built; ⚑ line refs pinned to `1ac8078e`, re-verify first). Every exit is a page reload: the client boots once, no teardown path; shape **(B)** reset-not-teardown needs no server change, plausibly one chunk; shape (A)'s offender ranking: `plan-code-health.md` §Ownership. **backlog §48** is blocked on this.

- ⚑ **Step 8a closed WITHOUT backups, deliberately** (PO 2026-08-04): the live DB is **losable**; **C3's memorial is the named revisit trigger** (the one thing whose point is outliving people). The `pg_dump`-as-cron question is a PO call. The **security** items (firewall, DB to localhost, credentials, non-root deploy) were never part of the ruling and are still owed: `plan-playtest-deploy.md` §Ops & security posture.

### Open items

- **Deferred to the mobile/UI pass (PO 2026-08-14):** `#registrationNag` covers the open mobile ☰ sheet (journal unreachable on phones; `mobile-layout.mjs` leg 7 legitimately red) - mobile is playable, the full mobile UI pass owns this. ⚑ Since the quest tracker (2026-08-23) the sheet's `#journalButton` is mobile-only and the tracker desktop-only; the pass inherits merging the two "J Journal" nodes.
- **Playtest intake** (`plan-playtest-feedback.md`): round 8 item 3's **feature** half, auto-walk (four open design questions) · round 9 items 2+3 parked for the UI pass (font, cleaner UI, dialogue UI, journal-over-dialogue overlap). ⚑ **The FONT half has its own reference doc, `docs/plan-ui-font.md`** — read it first; a swap always costs a size retune.
- **Fast-travel + map tuning, orphaned by the archive** (PO-seen): map **marker sizing** ruled a non-issue for now, belongs to the UI-polish pass (PO 2026-08-14) · **flight speed 2.8× and viewport 1.2×** PO-tuned but still [PLACEHOLDER].
- **Omni trio PO in-game check still pending** (`9ee8cdb4`, 2026-08-18, cheat-only test rigs OmniAura/OmniPassive/OmniStrike; entry now in `docs/archive/status-history.md`) - low stakes, the one-off `omni-smoke` 17/17 already covered the surfaces headlessly.
- **Smaller open threads:** §47 stale "Connection lost" banner in a second window · §51 transient second queue entry · a character-name **content** filter (spam passes the charset guard) · mobile perf ceiling, PO: "works for now" (cheapest next: `MOBILE_MAX_RESOLUTION` 1.5; the minimap is a second per-frame GL context).
- **Still outside any shipped chunk:** avatar/faction defaults (blocked on `plan-avatar-system.md`) · the password-reset plan's own five questions.
- **Ascension's leftovers** (`docs/archive/plan-ascension.md`): both stones owe a lore write + environment art (§8) · the 10 s channel and 20-kill hunt gate both [PLACEHOLDER] · §8's deferred cluster revivable whole · ⚑ the ceremony's effect is `Graphics` **only its own player sees** (D29) - a shared moment is a wire field, a **§39** conversation.
- **Backlog watch items** (`docs/backlog.md`): §25 D+E · §27.2.4–7 (⚑ §27.2.6 needs re-surveying) · §29 lost-WebGL-context trigger unknown · §37 skill-level/augment rework · §39 entity-presentation rework (no per-effect overlay art before it) · §34 hard collision · ~~§58 terrain editor has no select/move/rotate on a placed ground texture (PO-parked 2026-08-21)~~ **ANSWERED 2026-08-23 by a DIFFERENT editor** - Tiled does select/move/rotate/scale/flip/multi-select/undo over all 549 terrain blobs (`docs/archive/plan-tiled-authoring.md`); the in-game editor is deliberately unchanged, so §58's analysis still describes it. ⚑ Not closed until the PO has moved a real texture in Tiled · round-6 item 4 target stickiness (re-opens on measured cost) · ⚑ **§57 attack-attribution lines: PROTOTYPE PO-played, deliberately NOT merged** (`prototype/attack-lines` `cf305284`; weakest exactly where it fires - a shipped version is a §39 consumer).
- **Known-inconclusive** - three harnesses and one Go test red or flaky **at HEAD**, none from recent work (misreading one cost `chunk3b-interact` two chunks of false diagnosis): `chunk3-charm.mjs` 6–8/9 (accepted D9 fragility) · `filler-batch.mjs` leg 1 (stale assertion, other 5 pass) · `chunk3b-ii-conversation.mjs` 28/34 (leg 67 = stale assert expecting the TownCrier `teachings` row that died with Recall - named rot, fixable; the rest = the Leave-click race + the Wanderer drift-pin cluster) · `accounts.TestRepeatedFailuresAreThrottled` red under `-race` ONLY (<1 s timing asserts vs the detector's slowdown; proven green without at HEAD). All unowned. ⚑ **Measure the rate before diagnosing a flake.**
- **Open PO calls:** three - what should the portal pair COST (`plan-portal-spells.md` §10 item 13, the one question that outlived the archived plan; both spells currently 10 % of max Focus, CD 40 s, and both are cheat-only until an unlock path is placed) · does a QUEST turn-in row advertise the ability it pays? · should the flat reflect scale? (FireShield's 3 HP at L1 is 3 HP at L30 by the C2 raw-damage ruling; `api/skills/fire-shield.json` + `content-passives.md`). Replacement art + domain parked until v1; wiki generator kept.

- **Standing locks & gotchas:** **NO CI BY CHOICE** (PO 2026-08-12; revisit at roadmap step 9) - the per-chunk local verify tail is the gate. Growth **1.12 × maxLevel 30**; regen **0.00033 ≈1%/s × taper 1.0→0.4** FINAL; §11 no-pity + campfire **0.12** + heal cost **2 % of max HP** FINAL; **the base damage aura stays FREE at every resource level** (round-6 ruling, GDD §3); drop + milestone tables TUNING-OPEN (Damage@L1 · Discipline@L5 · Haste@L7); density = mob visible per ⅔-screen window; downtime 10 s + chain 20; guardrail asserts in `cmd/simharness/guardrail_test.go`. New mobs **must** author tier + baseline (raw `maxHealth` hard-fails) and price XP with `factors.xpFactor` (absent → 1, `0` = pays nothing AND no nameplate, fractions only for harvest outliers, **no species authors 0.5**); tier ≥ elite **must** author `factors.ccImmune`. Day/night cycle **OFF** (`DAY_CYCLE_PRESENTATION_ENABLED=false`; don't re-enable without collapsing the ~25 per-layer filter passes). **A shape removed from `phy.Space` is purged from every other shape's collision set on the spot** (§54) - never "optimize" that sweep away; one stale read re-latches a removed entity forever ([[project-ghost-references]]). ⚑ **A content edit does NOT invalidate the Go test cache** - after any `api/` change use `go test -count=1`. ⚑ **The starting aura is pre-equipped but NOT active** - the first press of `1` switches it on. **Dev cheats:** GOD, WARP `<x·120> <y·120>`, SPEED, XP, SKILL, ANNOUNCE, THREAT, QUEST (dump / `ACCEPT` / `ABANDON` / `ADVANCE`). `make -C backend build` runs `cp-defs`; boot `-content ../api` for content iteration (schema/Go changes still need the rebuild).

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
