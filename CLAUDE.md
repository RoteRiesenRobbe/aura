# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

<!-- Pointer only. REPLACE these two lines (don't append) when the last/next step changes.
     Full execution order + per-item status: docs/roadmap.md. Doc index: docs/README.md.
     Plans and records live in the plan docs. -->

- **Last completed:** **Sim-harness Chunk 4 DONE — implemented + verified + PO-approved + committed 2026-07-16 → SIM-HARNESS PLAN COMPLETE (all 4 chunks)** per `docs/plan-sim-harness.md` §8: the kills/hour chain, facetank vs kite. Per-cycle worlds: fight in a fresh `NewWorld` (every chain fight byte-identical to `RunFight` under its per-fight seed, pinned), recovery keeps ticking the SAME world (real 5 s combat grace + real regen accumulator + real `self_heal` fire — verified self-heal does not stamp combat), downtime = pure chain-clock gap. Stances are scenario data: facetank = `StartDistance 0`, kite = ring-centre `[mobAura+0.25, playerAura+mobBody)/2` with the mob pinned (speed 0 ⇒ auraAlwaysOn); no ring ⇒ `Feasible:false`. New: `sim/chain.go` (`RunChain`: brackets × stance × run flat-parallel), `Scenario.RegenTick` knob (0 = old default, chunks 1–3 byte-identical), CLI `-chain` + `POST /chain` + explorer chain panel + driver.mjs. 13+2 tests incl. exact recovery pin (149 grace steps + regen ticks); suite + race + browser green. **Findings: recovery dominates — facetank efficiency ≈0.22 at current baselines (76 s recovery vs 6.6 s fight), 0.35 at target ratio; GDD's ~90% facetankable starter normal [PLACEHOLDER] is far off at current regen ~1%/s (regen/downtime are the knobs — flag to PO); self-heal L1: 0.22→0.28; boss-shaped mob kills the facetank bot with 0 kills (GDD boss case reproduces); efficiency flat across levels (Philosophy A holds on the chain metric).** Chunk-3 recap (`b7b8a5d0`): 1-vs-N matrix + `sys/targeting.go` determinism fix (entity-ID sort, PO-approved); overwhelm follows the cap at target ratio. Chunk-2 recap (`eed434f5`): f(L) curve tool; same-tier flat; growth ≈1.15 read. Chunk-1 recap (`5faf7aa6`): 1v1 explorer, real ECS headless, `-serve` + presets.
- **Prior — Step 5 COMPLETE (committed + verified):** Step-5 (unlock-source systems, `docs/plan-npc-teaching.md`) **all 6 chunks DONE + VERIFIED IN-GAME by PO 2026-07-15.** Editor `npc` placement mode = `00574d4c` ("Add NPCs to Editor"); textarea keyboard-capture follow-up fix = `a346c23f`; chunks 5/4/3 = `2984b447`/`6322218c`/`35f3b151`; chunks 1–2 = `f4ebe912`/`9d71f9ad`. Step 4 (skill-vocab fill) also complete + committed.
- **Next:** **Step 6 = the initial content pass (item 12), plan-first planning session in a fresh session** — two large zones with intra-zone difficulty areas, full mob roster (hand-authored per-tier against the §5 curve — **REQUIREMENT: author mobs as tier + baseline (HP = base × f(tier), derived), never raw numbers**, so the growth working-lock stays a one-knob change), boss scripts, first real balance pass; live-game `f` multiplier lands at the top of step 6 (§5 Decision 5). **All former ⚑ PO flags RESOLVED 2026-07-16 from the harness output:** growth = **1.12** × max level = **30** (≈27× inflation, band ≈ +5 — WORKING LOCK, lower-first by PO call); passive regen stays slow (~1%/s), positioning rewarded everywhere (the ~90% facetankable frame is superseded — new tier placeholders: normal ≤ ~50%, elite ≤ ~25%, boss dies); downtime 15 s default (zone-density feel knob) + chain length 20 confirmed; guardrail asserts deferred into step 6 against real mobs. `make build` runs `cp-defs` which reverts embedded `backend/pkg/api/` from source `api/`; the committed Sage (proving-grounds (4,3), teaches `HealAura`@L1 + `Dash`@L5) is content — boot `-content ../api` for content iteration.

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

This applies to backend Go code (`go test ./...`) primarily. For exploratory
prototype work or UI tweaks, strict TDD may be relaxed — but any non-trivial
game logic (aura calculations, combination resolution, damage application)
should have tests before or alongside the implementation.

When fixing a bug: first write a test that reproduces it, then fix.

## Project Overview

**Berryhunter** (repo name: aurahunter) is a multiplayer browser survival game. Players gather resources, craft items, manage vitals (health, satiety, temperature), and fight mobs. The repo has three main parts:

- `backend/` — Go game server (`berryhunterd`)
- `frontend/` — TypeScript/webpack browser client using PixiJS
- `api/` — Shared FlatBuffers schemas and JSON item/mob definitions

## Build & Run

### Backend (Go ≥ 1.22)

```bash
# One-time: copy config
cp backend/conf.local-windows.json backend/conf.json   # Windows
# or use backend/conf.default.json as a template

# Build
make -C backend build          # produces backend/berryhunterd

# Run (dev mode serves static frontend too)
cd backend && ./berryhunterd -dev

# Run without build (go run)
make -C backend dev
```

> **Gotcha:** after backend logic changes, rebuild the binary with `make -C backend build`.
> `go build ./...` compiles/type-checks packages but does **not** refresh `./berryhunterd`,
> so a running `-dev` server keeps executing stale code.

> **Content iteration:** `./berryhunterd -dev -content ../api` loads items/mobs/skills/recipes
> from the repo `api/` directory directly instead of the embedded copies — JSON edits then skip
> both `cp-defs` and the rebuild (a server restart still applies them). The boot log prints the
> content source (`Loading content source=…`). Production/default stays embedded.

`backend/conf.json` controls server port (default `2000`), day/night cycle durations, and all game-balance tuning values. `backend/tokens.list` must exist with at least one token (e.g. `plz`) for in-game commands to work.

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

The full suite runs and passes. (`backend/pkg/berryhunter/net/net_test.go` is a manual `ListenAndServe` smoke script that used to hang the suite; it is now skipped via `t.Skip` — remove the skip to run it explicitly.)

The test runner requires generated files (`go generate ./...`). The Makefile `gen` target runs this automatically before builds.

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

- `backend/cmd/berryhunterd/` — entrypoint; wires config, game, HTTP server
- `backend/pkg/berryhunter/core/` — `game.go` constructs the ECS world and registers all systems; `Loop()` ticks at ~30 FPS (33 ms/tick)
- `backend/pkg/berryhunter/sys/` — ECS systems: physics, mob AI, day/night cycle, decay, respawn, scoreboard, status effects, heater
- `backend/pkg/berryhunter/model/` — interfaces and concrete types for entities (player, mob, resource, placeable, spectator)
- `backend/pkg/berryhunter/items/` — item and mob definitions loaded from `api/items/` and `api/mobs/` JSON files at startup
- `backend/pkg/berryhunter/codec/` — FlatBuffers encode/decode for the WebSocket protocol
- `backend/pkg/berryhunter/phy/` — 2D physics (circle/AABB collision, spatial hashing)

**Adding a new system:** implement `ecs.System`, register it in `core/game.go:NewGameWith()`, and add entity registration cases in the relevant `addXxx()` methods.

**Adding a new entity type:** implement the appropriate `model.*Entity` interface, update `game.AddEntity()`, and register in all relevant systems.

### Communication Protocol (FlatBuffers over WebSocket)

Schemas live in `api/schema/`:
- `client.fbs` — client→server: `Input`, `Join`, `Cheat`, `ChatMessage`
- `server.fbs` — server→client: `GameState`, `Welcome`, `Scoreboard`, `Obituary`, etc.
- `common.fbs` — shared types (`Vec2f`, `ActionType`, `AuraType`)

After editing `.fbs` files, regenerate bindings for both backend and frontend.

### Game Configuration (conf.json)

All numerical tuning lives in `backend/conf.json` (or `conf.default.json` for reference). The `game.player` block controls movement speed, aura radii, vital-sign drain/gain rates, and level-up scaling. Changes take effect on restart.

### Item / Mob Data (JSON)

`api/items/` and `api/mobs/` contain JSON definitions. The `make -C backend cp-defs` target copies them into `backend/pkg/api/` so the Go build embeds them. Run this (or just `make -C backend build`) after editing any JSON definition.

### Frontend

The frontend is structured as feature modules under `frontend/src/features/`:
- `backend/` — WebSocket connection, FlatBuffers deserialization, entity snapshot management
- `core/` — game loop, entity manager
- `player/`, `vital-signs/` — local player state and HUD
- `game-objects/` — rendering entities (resources, mobs, placeables) via PixiJS
- `input-system/`, `controls/` — keyboard/mouse/touch input
- `internal-tools/` — dev panel, console, overlay tester (only active with `?develop`)

**HUD event handling:** Use `pointerdown` (not `click`) for all interactive HUD panels. `MouseManager` (`input-system/logic/mouse/MouseManager.ts`) registers a `mousedown` listener on `document.documentElement` with `event.preventDefault()`, which suppresses the synthetic `click` event. `pointerdown` fires before this and is unaffected. `click` listeners on HUD panels silently never fire — this is not obvious from the source.

Webpack configs: `webpack.common.js` (shared), `webpack.dev.js` (HMR, port 2001), `webpack.prod.js` (minified output).

## Aurahunter Project Context

This fork is being transformed into **"Aura"** — a top-down MMO. The Berryhunter
survival systems (vitals, crafting, temperature, hunger) will be removed or
heavily reduced. The core loop revolves around the aura system described below.

The codebase still says "Berryhunter" in many places. That is expected. Do not
rename or refactor naming proactively — focus on building new systems on top of
the existing foundation. The full rename + legacy cleanup is **scheduled, not
abandoned**: execution-order step 7 (after the content pass), per
`docs/plan-rebrand-cleanup.md` — until then this rule stays in force.

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
XP bar, ability bar, aura panel, minimap, zone chat), line-of-sight for auras,
campfire system.

### Not in v1.0

PvP, formal group system, economy, mobile, endgame raid events, character sacrifice.

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
- Treat existing Berryhunter physics, collision, and the WebSocket/FlatBuffers protocol as
  stable foundations. Extend, don't rewrite. Don't rename Berryhunter→Aura proactively — that
  is scheduled (execution-order step 7).
- When in doubt about game design intent, ask — don't infer from the codebase.

## Sanity checks after every step

Before declaring a step done:
- Run `go build ./...` from `backend/`
- Run the relevant `go test` for affected packages
- For anything with a runtime surface, verify in-game (plan docs record per-chunk in-game checklists)
- Report the output — don't claim "done" without these checks.
