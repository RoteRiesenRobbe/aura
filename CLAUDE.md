# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

<!-- Pointer only. REPLACE these two lines (don't append) when the last/next step changes.
     Full execution order + per-item status: docs/roadmap.md. Doc index: docs/README.md.
     Plans and records live in the plan docs. -->

- **Last completed:** **Intermission Session ② (pre-C8 lifts + content) DONE (2026-07-19), one session — ran with ultracode per PO; PO-VERIFIED IN-GAME 2026-07-19, committed `dad7c42d` (to main, no branch — PO directive)** — per `plan-intermission-triage.md` §Execution sequence Session ② (authoritative DECIDED ledger). **Code lifts (TDD):** **2** heal self-cost per-level curve — `HealParams.SelfDamageHPPerLevel` + `SelfDamageAt()` (clamped ≥0), raw `effectDef` field + `effectKeys[HealAura]` allowlist + apply-site `sys/skills.go:636`; `heal-aura.json` cost `10 −2/level` ⇒ **heal > cost from L1** (12v10 … 42v2). **13** campfire percent-of-max heal — `HealParams.FractionOfMax(+PerLevel)` + `FractionAt()`, per-*target* `MaxHealth()` in `applyHealAura` (no powerScale, mirrors the self_heal fraction branch), flat-XOR-fraction loader validation; `campfire-aura.json` `healFractionOfMax:0.12` (value stays C8). **6** companion hold jitter — deterministic id-hashed **angular** offset in `companion.go` `updateFollow` (rotates the bearing so the follow *radius* is preserved; no rng/`time` → sim-safe), un-stacks CallForAid squads (2 follow tests re-pinned + 1 new). **Content (item 20 placements → recipes repaired):** SlowAura→**BanditRanged** drop (.15), ReaperAura→**EliteWolf** drop (.5, execute/lifesteal theme match), Fade→**Bandit** drop (.1); **ToughPassive→new Troll** (elite cL11, own art, `troll` faction, `TrollSmash`, drops .25, outskirts solo/pairs); **NovaBurst→new BanditPyromancer** (cL6, own art, medium-range fire DoT `EmberAura`, in the camps, drops .15); Ignite+ImmolationAura→new **Emberkeeper** teacher NPC (Hermit sprite, NE dark-forest edge); Revive→**VillageHealer** teaching (@6); SummonTotem→new **Shaman** teacher NPC (Hermit sprite, @5); **item 18** **DireWolf** (cL6, Wolf art) + **DireBear** (cL7, Bear art) Z2 variants via `entityType` art-reuse. **⇒ Wildfire / Suppression / Barrier are all craftable now** (every ingredient world-sourced — the whole point). **Two new mobs = full 6-file art path** (`server.fbs` enum Troll=60/BanditPyromancer=61 + regen, `Graphics.ts`, `Mobs.ts`, `gameObjectClasses`, 2 placeholder portrait SVGs). New mob skills **TrollSmash 132 + EmberAura 133**; skill registry pin 75→**77**. Placed-skill frontend entries verified present (names/maxlevels/**categories** all correct — no C4-style display gap). **Verified:** `go build` + full suite + `-race` (sys/mob/skills) green; boot clean — **77 skills/13 factions/44 mobs/10 recipes/620 props/198 spawns/2 campfires/12 npcs** + warlord encounter registered, 0 panics, no spawn-placement failures; **headless browser** — after the camera-snap fix (`b085452d`, landed in a parallel session) Troll/BanditPyromancer/DireWolf sprites render at their WARP spots, Emberkeeper teaches Ignite (→ Cooldowns spellbook), 0 client errors on warm run (the 1st-run triple `null.split` recurs then clears — still the deferred item-21). **PO note (open, revisit later):** RNG drops liked as-is — "should be the default for most". Skills-framework files (`.claude/skills/{add-content,chunk-wrap}`, `verify/SKILL.md`, backlog §20, CLAUDE.md banner-collapse) rode in this commit — installed mid-session, not Session-② work.
<!-- Prior chunks: one-line pointers only. FULL ledgers live in the plan-doc §13 banners
     (docs/plan-content-zones12.md) and the referenced commits — never re-expand these here.
     See the `chunk-wrap` skill for the collapse rule. -->
- **Prior (full ledgers → `plan-content-zones12.md` §13 / `plan-intermission-triage.md` + commits):**
  - **Intermission Session ①** fixes mini-chunk — DONE + PO-verified 2026-07-19, `2c155a68` (items 19/1/14/16/5/11/21-partial/3-9 + code niceties; empty-spawn + Farmer-taught Harvest, startingSpawn flag, heal self-kill clamp, respawn full-HP, portrait rotation freeze, NPC entityType validator; GDD §11 sacrifice→v1). `plan-intermission-triage.md` §Session ①.
  - **C7** Recipe net — DONE + PO-verified 2026-07-18, `53868697` (zero-lift; 10 recipes ids 1–10, result skills 52–59, capstone Warbanner, registry pin **75**/recipe pin **10**; overshields cut ~⅓; Wildfire/Suppression/Barrier ingredients unplaced → C8). §13 C7.
  - **C6** Ork World Boss (§B) — DONE + PO-verified 2026-07-18, `5961b29a` (encounter `warlord.go`; lifts: ANNOUNCE alert/broadcast + AlertBanner, zone `anchors` schema+editor; Call for Aid id 51; mobs 35–38, pin **67**). §13 C6.
  - **C5** The front + Front-Aura — DONE + PO-verified 2026-07-18, `96cea32f` (lift 6 `friendlyToPlayers`; Vanguard 50 @L20 FrontCaptain = §A power outlier; human_army/orc factions, mobs 32–34, pin **62**; west arena = C6 canvas). §13 C5.
  - **C4** Z2 village + bandit gate — DONE + PO-verified 2026-07-18, `4d5406a4` (zero-lift; bandit faction, mobs 27–31 incl. first crit pair + first shield_aura, DamageBurst 49, GateWall, seam ridge, pin **58**). §13 C4.
  - **Map condense ×0.6 + post-C3 polish** — DONE + PO-verified 2026-07-18, `d945d948` (bounds 240×120→144×72, all coords/darkness ×0.6, roads to Z2, kobold speed, Antivenom category fix ids 47/48). Client render-interp crawl on large jumps → **backlog §20**.
  - **C3** Kobold hideout + Dark Tunnel — DONE + PO-verified 2026-07-18, `afd57e68` (zero-lift; kobold/spider factions, mobs 21–26, Antivenom 47 + Pickaxe 48, first `poison` dot, pin **52**). §13 C3.
  - **C2** wildlife + dark forest (Parts 1+2) — DONE + PO-verified 2026-07-17, `7eb2d266`+`2eb44528` (lift 2 passive light `LightRadius()`; Torch 46, Bramble solid mob, SPEED cheat, TurnipPull→Harvest rename, empty-spawn aura, ×2 density pass, pin **45**). §13 C2.
  - **C1** Z1 farm start beat — DONE + PO-verified 2026-07-17, `a494bc26` (rect-prop lift, gated damage tags). §13 C1. Step 5 (unlock sources) + Step 4 (skill vocab) complete + committed.
- **Next:** **Session ③ — Step-6 chunk C8 (Balance & guardrail pass) — execution session (new chat)** per `plan-content-zones12.md` §13 C8, now pure tuning/guardrails on final schemas with **all recipes reachable** (Session ② un-broke Wildfire/Suppression/Barrier): **STEP 0 (do first) — recipe-net topology fix (backlog §21): the shared `Vanguard 5` hub co-pops two capstones (Spearhead + Warbanner) in one instant — pick fix (A=tier Warbanner→Spearhead recommended / B=disjoint gates / C=stagger) + reshape recipe JSON BEFORE calibrating, since it moves the §A ceiling presets; treat the whole hub;** full-roster sim-harness presets (incl. the new Troll/Pyromancer/Dire variants + placed skills); kills/hour chain per level bracket vs the tier placeholders (normal ≤ ~50% facetankable, elite ≤ ~25%, boss kills the facetank bot); **regen/downtime knob settlement** (open PO item — the kobold/wolf tier is the target's home); guardrail asserts vs real mobs; **drop-rate feel pass** (PO leans RNG-as-default — "should be the default for most"; decides the §11 pity question); campfire `healFractionOfMax` % + heal-cost curve final values; milestone-table final; Front-Aura ceiling calibration (§A — Spearhead/Warbanner presets are the fixed refs). C8 is the last §13 chunk. **Every C1+ mob MUST be authored tier + baseline** (raw `maxHealth` hard-fails; manual §1); combat mobs need NO harvest entries (gated damage tags — manual §1), but **gate obstacles must opt in**.
- **Deferred (per triage §Execution sequence):** **Post-C8 "combat readability"** — items **7** (category ring colors) + **15** (tier frame ring), two append-only Mob-table wire bytes. **Step-7 rebrand** — items **22** (bare-name renames) + **12** (`legacy:true` tags). **Persistence step** — item **10** sacrifice loop (first consumer; GDD §11 amendment landed Session ①). **Anytime/annoying:** item **21** full `null.split` repro session. Placeholder values from Session ② to settle in C8: heal cost `10 −2/level`, campfire `0.12`, drop chances (SlowAura .15 / Tough .25 / Nova .15 / Fade .1 / Reaper .5), Troll cL11 / Pyromancer cL6 / Dire cL6-7, teacher gates (Immolation 6 / Totem 5 / Revive 6). Standing locks: growth 1.12 × maxLevel 30 (≈27×, band ≈ +5, lower-first); regen slow ~1%/s, tier placeholders normal ≤ ~50% / elite ≤ ~25% / boss dies; downtime 15 s + chain 20; guardrail asserts land in C8 against real mobs. Dev cheats: GOD, WARP <x·120> <y·120>, SPEED [factor|off], XP, SKILL <name>, ANNOUNCE <text>, THREAT [id]. `make build` runs `cp-defs` which reverts embedded `backend/pkg/api/` from source `api/`; boot `-content ../api` for content iteration (schema/Go changes still need the rebuild).

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
