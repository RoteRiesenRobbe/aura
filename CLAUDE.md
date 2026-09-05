# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

<!-- HARD CAP: "Last completed" + at most TWO "Prior" entries, each ≤10 lines with a
     ledger pointer. When adding a new entry, move the oldest verbatim to
     docs/archive/status-history.md. FULL per-chunk ledgers live in the plan-*.md
     banners; the sequence lives in roadmap.md "Execution order". Never paste a full
     session banner here — see the `chunk-wrap` skill for the collapse rule. -->

### Recent (cap 3 — older entries: `docs/archive/status-history.md`)

- **⭐ Last completed: WORLD SCALE S3 - MOB DORMANCY** ✅ 2026-08-29, `aac2852e` + `2364547e` (tuning), merged to main 2026-09-05 (ledger: `docs/plan-world-scale.md` §11 S3; ⚑ the plan doc itself was RECOVERED from a stash the same day — it had never been committed and its file was gone): a mob that nothing player-controlled is near stops thinking AND leaves the physics space, lifting both halves of F3. ⭐ **The cost changed SHAPE: area-linear → player-linear.** Measured over MobSystem.Update + Space.Update at 10 dispersed players: 500 mobs 0.97→0.61 ms · 5 000 mobs 14.38→2.12 ms · **14 640 mobs (the PO’s tiled 30× world, exactly) 61.5→5.7 ms, 10.8×** (5 repeats; ⚑ a single SHORT run reads ~32 ms for the OFF arm — repeat it) — i.e. from **186 % of the entire 33 ms tick budget spent on mobs alone, down to 17 %** (`mob_dormancy_bench_test.go`, kept). D3 pristine + D4 wake sources + D5 leave-the-space + D6 the wake volume DERIVED from the AOI box (wake 1.7× / sleep **1.9×** after the 2026-08-30 tuning pass, conf `game.mob.wakeMargin`/`sleepMargin`). ⚑ **D5 AS WRITTEN WOULD HAVE HANDED THE WIN BACK**: `RemoveShape` purges by walking EVERY shape in the space — ~2.6 ms per sleeping mob at 30×, and itself O(total mobs), so it would have re-introduced area-linearity on the transition path. New `phy.SleepShape` skips the purge, safe in three layers: tick ORDER (PhysicsSystem at priority 0 rebuilds every collision set later in the SAME tick that MobSystem at 20 sleeps a mob), READERS (nothing between priority 20 and 0 reads `Collisions()`), SEPARATION (≥22 u to any wake source). ⛔ A departure (death / disconnect / flight takeoff) must STILL use `RemoveShape`. ⭐ **Three findings the plan did not have**: **spectators are wake sources** (they stream viewports exactly like players — omitting them renders the pre-join start screen and every death overlay as an empty world) · **proximity alone cannot wake a mob** (one that slept on its spawn tick could be handed threat by an encounter script / the THREAT cheat and stay asleep with it forever — surfaced only as an order-dependent test failure, now pinned) · **D6's awake-count table was understated ~1.7×** — hysteresis means the steady state sits at the SLEEP box, so it measures ~53 mobs/player (47–57), not 32, which moves M0's "~52 dispersed players before break" to **~32** and made `sleepMargin` the knob to narrow first — **done 2026-08-30: 2.2 → 1.9, measured −26 % awake and −17 % tick consistently from 10 to 150 players, moving the mob subsystem ceiling ~75 → ~100 dispersed players**. ⭐ **L7 RULED: patrollers sleep** — freeze-and-resume is correct BY CONSTRUCTION (a dormant mob's Update never runs, so nothing writes its position, waypoint index or steering latch; it thaws mid-leg where it froze). Structures (campfires, braziers) excluded deliberately and narrowly. Free win: `onMobDeath`'s linear scan over every authored spawn became an O(1) index. ⚑ **`m.SetWakeSources(s)` in `core.NewGameWith` is THE ON-SWITCH** — a nil seam disables dormancy entirely, which is what keeps the sim harness and every pre-S3 test byte-identical (L6, satisfied structurally); **deleting that line silently restores the old cost and fails nothing.** ⭐ **L3 is CLOSED by D3, not standing** (the plan’s two clauses contradicted each other): a wounded mob is never ELIGIBLE to sleep, so it stays awake and regenerates — measured, a chipped mob is back to full at t=5.8 s and only sleeps at t=14.8 s, healed with ~9 s to spare. PO confirmed regen-before-dormancy is the wanted behaviour; relaxing D3’s full-health clause re-opens it for real. **Schema NONE.** Verified: `go build ./...` · `go vet ./...` · full `go test ./...` with **no new failures** — 5 pre-existing reds bisected against the committed world.json and confirmed unrelated (2 from the PO's uncommitted 30× `world.json`, which duplicates each unique ascension/memorial stone 30×; 3 from `martin.json` added in `6c2e6d5c` and never added to the content census lists). New legs: phy 3 · model/mob 12 · sys 16 · 1 simharness guardrail (L8's two invariants). ⭐ **TUNING PASS + L8 CORRECTION 2026-08-30**: `sleepMargin` 2.2 → 1.9 (−26 % awake, −17 % tick, ceiling ~75 → ~100 dispersed players), and ⚑ **the wake floor is `player.FlightViewportScale` (1.2), NOT 1** — L8 argued containment from `Zoom.ts`’s fixed GROUND field of view and missed that a FLYING player’s server-side AOI is itself scaled, which is the binding case (1.2 s of warning in flight vs 5.3 s on foot) and a [PLACEHOLDER] already retuned twice. Now clamped in `core/gameconf.go` and asserted in the guardrail; the const is exported for it. **OWED: the probe-ladder re-run on a real server, and §8’s in-game pass — walking in at EVERY zoom level, the totem-beside-a-sleeper case (L2), and now a FLIGHT leg over a dormant region.**
- **Prior: UI PASS C7 - DIALOGUE + JOURNAL RESTYLE** ✅ 2026-08-30, `70486cc0` (ledger: `docs/plan-ui-pass.md` §6 C7; spec + rulings §5 C7 incl. the ⭐ AMENDED block): direction-C interiors for the two prose surfaces C6 left alone, plus the §2 tracker consolidation - **D1** the conversation gains the wood header strip (gold actor, ✕ inside) over parchment lines, ink dividers, muted-gold exits; the journal gains gold uppercase section labels, ink rules, a parchment lift; **D2/D4** the tracker is a WoW-classic text list, `#questTrackerList` itself becoming **D3**'s ONE scrim, plain by ruling (the only always-on-screen panel), left-aligned, boxless, a gold title per quest. ⭐ **Durable finding: read what the render ALREADY emits before planning a rewrite of it** - the spec predicted a `QuestTracker.ts` rewrite; C7 landed **CSS-only**, both landmines intact by construction. `.panel-chrome()` DELETED with its last caller. ⚑ Mobile reverts the strip AND keeps its journal hairlines (ink is invisible on the phone's near-black panel), both id-scoped per the C6 rule. ⭐ **Second finding, from the look-session global scrollbar (slim 8px wood thumb): WebKit pseudo-elements ONLY** - in Chrome 121+ a non-auto `scrollbar-width`/`scrollbar-color` kills ALL `::-webkit-scrollbar` styling. **Schema NONE**, pure client. Verified: vitest 571/571 · tsc · prod build · new `c7-tracker` 10/10 · `chunk3b-ii-conversation` 28/34 before AND after · `chunkC4-quests` 20/6/3 pre-existing · both-layout screenshots; ⚑ `c7-tracker` + `round4-tooltip` re-run at the wrap on a fresh build (the scrollbar landed via HMR). Opus-built, reviewed line-by-line; ⭐ PO played 2026-08-30, ZERO change requests.
- **Prior: UI PASS C6 - PANEL CHROME ROLLOUT** ✅ 2026-08-30, `a2a1595b` (ledger: `docs/plan-ui-pass.md` §6 C6; spec + rulings §5 C6, D1-D5): the ink treatment on the REST of the HUD - conversation body-only (**D2**), spellbook + help incl. the wood header strip, settings (**D3**), the tooltip OPAQUE, `#confirmRow` keeping its danger border, `.btnC` buttons + 19px `.keyC` chips, ink-outlined pill bars, the minimap double ink ring; **D4** a fresh-unlock row shows the glow ALONE · **D5** pip untouched. ⚑ The breadcrumb pulse rides **`::after`** now (`.btnC` keeps its wood inlay in box-shadow and the old element-level keyframe stripped it every cycle). ⭐ **Durable finding, review-caught: a mobile RESET must OUT-RANK what it reverts** - a bare-class revert under `html.mobile` (0,2,1) silently loses to an id-scoped desktop rule (1,1,0), and a `querySelector` style dump can green-light the WRONG TWIN. Ink mixins moved to `variables.less` (feature sheets are their own LESS entries). **Schema NONE**, pure client. Verified: vitest 569/569 · tsc · prod build · 11-script sweep green (`mobile-layout` leg 7 = stash-proven HEAD baseline) · look probe + both-layout screenshots. Opus-built, reviewed line-by-line; ⭐ PO played 2026-08-30 with ZERO change requests; the one look-surfaced intake (armed `#confirmRow` outlives the conversation) ruled FIX-NOW, own commit `b3283a2f`.

### Next

- **⏸ Parked 2026-08-20 (PO choice): `plan-prototype-projectile.md`** - the SECOND in-game pass is OWED (§10 items 1, 2, 4, 5 + 13; setup `SKILL ThrowMine`/`ThrowBomb`, ⚑ test the cost with god OFF). Its verdict decides P2/P3 or delete. **In flight instead: `plan-play-bot.md`** (C0-C3). ⏸ `plan-npc-hails.md` + `plan-mob-voicelines.md` DEFERRED 2026-08-24 (PO): only if play-feel asks. ⚑ Unowned leftovers ride in the plan docs: `TICKING_TYPES` silent-failure set · zone-editor C3's dead Go plumbing + broken `wiki-generator/`.

- **⭐ DIRECTION SET 2026-08-22: the next map is the FIRST RELEASE MAP, and CAMPS ARE CONTENT** (`docs/plan-release-map.md` - the authoritative record; nothing built, the map owes its own planning session, §7 holds the PO calls). Membership = a completed quest, exclusivity = `quest_at_stage` gates - **no new vocab, no Go, schema NONE**. ⏸ `plan-camps.md` DEFERRED not cancelled (⛑ moving the quest ledger off `character_id` would kill the free post-ascension reroll). ⛔ `plan-test-world.md` DROPPED (its §1 bounds + densities survive).

- **⭐ REGION PRIMITIVE: C1-C5 ALL SHIPPED** (C5 `4937a977`, ledger §12; audio consumers unscheduled, `plan-region-audio.md`). ⏸ **`docs/plan-region-primitive.md` stays live for the OPEN look sitting** (texture picks, the 0.35 scale, the seam, blend width, mask density). ⚑ Standing C4/C5 landmines + the no-second-region seam caveat live in the plan doc + [[project-region-primitive]]. Schema NONE throughout.

- **CC watch items ride forward** (`docs/archive/plan-cc-and-retaliation.md`), none a chunk: can a mob stun a *player*? (`plan-skill-vocab` §3.1) · CC immunity is silent in-game (⭐ the "Immune"-label rails exist since `9fb3859d`) · a stun is wire-indistinguishable from a slow (§39 dependency) · ⚑ confirm D10's Paralyze-on-GiantSpider ("the elite spiders" - no elite-tier spider exists).

- **Mob/XP tuning threads, unowned** (archived: `plan-xp-formula.md`, `plan-world-replacement.md`): per-species feel tuning (speed/xpFactor cheap; **HP/damage re-price every placement**, cost table in the archived banner) · levels 21–30 standing gap (D5) · the §12.2 rising-absolute-award note.

- **⭐ backlog §52 - leaving the world without a reload, PO-asked 2026-08-11.** Owned by **`docs/plan-leaving-the-world.md`** (designed 2026-08-04, nothing built; ⚑ line refs pinned to `1ac8078e`, re-verify first; shape **(B)** reset-not-teardown is plausibly one chunk). **backlog §48** is blocked on this.

- ⚑ **Step 8a closed WITHOUT backups, deliberately** (PO 2026-08-04): the live DB is **losable**; **C3's memorial is the named revisit trigger**. The security items (firewall, DB to localhost, credentials, non-root deploy) were never part of the ruling and are still owed: `plan-playtest-deploy.md` §Ops & security posture.

### Open items

- **Feedback flow + the UI pass:** new feedback lands ONLY in **`docs/feedback.md`** (four exit doors; plan docs never double as intake). **All UI work is consolidated in `docs/plan-ui-pass.md`**: direction C "Inked Panel" RATIFIED (⚑ the §4 CORRECTION block - the RENDERED mockup CSS, no wiggly forms - is the spec); §5 order C1-C11 RATIFIED; **C1-C7 SHIPPED** (2026-08-26 – 08-30), all PO-approved in-game (the C5-era flagged calls settled at C6, the C7 ones accepted by the play); **next: C8 (tooltip maintenance debt, the §2 three shapes)**. ⏸ `plan-onboarding-cleanup.md` DEFERRED, trigger: a human coworker is actually about to join.
- **Omni trio PO in-game check still pending** (`9ee8cdb4`, 2026-08-18, cheat-only test rigs OmniAura/OmniPassive/OmniStrike; entry now in `docs/archive/status-history.md`) - low stakes, the one-off `omni-smoke` 17/17 already covered the surfaces headlessly.
- **Smaller open threads:** §47 stale "Connection lost" banner in a second window · §51 transient second queue entry · a character-name **content** filter (spam passes the charset guard) · mobile perf ceiling, PO: "works for now" (cheapest next: `MOBILE_MAX_RESOLUTION` 1.5) · avatar/faction defaults (blocked on `plan-avatar-system.md`) · the password-reset plan's own five questions · `r7-respec-cost` screenshots inside its own 4 s confirm window (one-line fix, PO call).
- **Ascension's leftovers** (`docs/archive/plan-ascension.md` §8): lore + art for both stones · channel/hunt-gate numbers [PLACEHOLDER] · ⚑ the ceremony's effect is visible **only to its own player** (D29) - a shared moment is a wire field, a **§39** conversation.
- **Known-inconclusive at HEAD**, all unowned: ⭐ **3 census tests in `pkg/aura/items/mobs` RED** - the collaborator's Martin NPC (`6c2e6d5c`) never bumped the hardcoded counts (the stale gitignored `backend/pkg/api/mobs/` copy hid it until C4's cp-defs; remove/restore-proven). Fix = bump 3 counts or hand it over · `chunk3-charm` 6–8/9 (D9 fragility) · `filler-batch` leg 1 (stale assert) · `chunk3b-ii-conversation` 28/34 (stale TownCrier assert + Leave-click race + Wanderer drift-pin) · `accounts.TestRepeatedFailuresAreThrottled` under `-race` ONLY · **`AuraTiledConvert.test.ts` byte-stability ×2** on a fresh checkout - they pin the PO's UNCOMMITTED world.json repair. ⚑ **Measure the rate before diagnosing a flake** (a misread cost `chunk3b-interact` two chunks); ⚑ **this host's wall clock is non-monotonic** - suspect it before any elapsed-time red.
- **Backlog watch items** (`docs/backlog.md`): §25 D+E · §27.2.4–7 (⚑ §27.2.6 needs re-surveying) · §29 lost-WebGL-context trigger unknown · §37 skill-level/augment rework · §39 entity-presentation rework, owned by `docs/plan-entity-presentation.md` (medallions first) · §34 hard collision · §58 **ANSWERED by Tiled** (⚑ not closed until the PO has moved a real texture in Tiled) · round-6 item 4 target stickiness · ⚑ **§57 attack-lines PROTOTYPE deliberately NOT merged** (`prototype/attack-lines` `cf305284`; a shipped version is a §39 consumer).
- **Open PO calls:** three - the portal pair's COST (`plan-portal-spells.md` §10 item 13; cheat-only until an unlock path is placed) · does a QUEST turn-in row advertise the ability it pays? · should FireShield's flat reflect scale? (3 HP at L1 = 3 HP at L30 by the C2 raw-damage ruling; `content-passives.md`). Replacement art + domain parked until v1; wiki generator kept.

- **Standing locks & gotchas:** **NO CI BY CHOICE** (PO 2026-08-12; revisit at roadmap step 9) - the per-chunk local verify tail is the gate. Balance FINALs (growth **1.12 × maxLevel 30** · regen **0.00033 × taper 1.0→0.4** · campfire **0.12** + heal **2 % of max HP** · **base damage aura FREE at every resource level** · downtime 10 s + chain 20) are guardrail-asserted in `cmd/simharness/guardrail_test.go` - that file is the single source; drop + milestone tables TUNING-OPEN (Damage@L1 · Discipline@L5 · Haste@L7); density = mob visible per ⅔-screen window. New mobs **must** author tier + baseline (raw `maxHealth` hard-fails) and price XP with `factors.xpFactor` (absent → 1, `0` = pays nothing AND no nameplate, **no species authors 0.5**); tier ≥ elite **must** author `factors.ccImmune` (full rules: the `add-content` skill). Day/night cycle **OFF** (don't re-enable without collapsing the ~25 per-layer filter passes). **A shape removed from `phy.Space` is purged from every other shape's collision set on the spot** (§54) - never "optimize" that sweep away ([[project-ghost-references]]). ⚑ **A content edit does NOT invalidate the Go test cache** - after any `api/` change use `go test -count=1`. ⚑ **The starting aura is pre-equipped but NOT active** - the first press of `1` switches it on. **Dev cheats:** GOD, WARP `<x·120> <y·120>`, SPEED, XP, SKILL, ANNOUNCE, THREAT, QUEST (dump / `ACCEPT` / `ABANDON` / `ADVANCE`). `make -C backend build` runs `cp-defs`; boot `-content ../api` for content iteration.

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
